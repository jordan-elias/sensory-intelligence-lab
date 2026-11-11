import { withCors } from './lib/cors.js';
/**
 * netlify/functions/delete-account.js
 *
 * Permanently deletes the signed-in person's account and everything stored for it.
 * Order matters: stop billing first, remove stored files, remove rows, and only then delete the
 * login (after that the files and rows could no longer be traced to anyone).
 *
 * Anything that fails before the login is deleted aborts the whole request, so the person can try
 * again. Nothing is half-deleted without the login still existing to retry with.
 */
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const BUCKETS = ["recordings", "therapist-photos"];

/* Rows keyed by the person. Most also cascade from the login; deleting them first makes the
   result explicit and does not depend on how the foreign keys were set up. Order: children first. */
export const TABLES = [
  ["messages", "sender_id"],
  ["messages", "recipient_id"],
  ["shared_copies", "client_id"],
  ["shared_copies", "therapist_id"],
  ["sharing_preferences", "client_id"],
  ["client_therapists", "client_id"],
  ["client_therapists", "therapist_id"],
  ["therapist_profiles", "user_id"],
  ["family_history", "user_id"],
  ["worksheets", "user_id"],
  ["locations", "user_id"],
  ["checkins", "user_id"],
  ["journal_entries", "user_id"],
  ["mixer_sessions", "user_id"],
  ["recordings", "user_id"],
  ["bookings", "user_id"],
  ["subscriptions", "user_id"],
  ["user_keys", "user_id"],
  ["profiles", "id"],
];

/* A table or column that does not exist in this project is not an error for deletion purposes. */
const isMissing = (e) => !!e && (["42P01", "42703", "PGRST205", "PGRST204"].includes(e.code) || /does not exist|could not find/i.test(e.message || ""));

/** Every object under `prefix`, including nested folders. */
export async function listAll(storage, bucket, prefix) {
  const out = [];
  const walk = async (dir) => {
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await storage.from(bucket).list(dir, { limit: 100, offset });
      if (error) throw new Error(`list ${bucket}/${dir}: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const item of data) {
        const path = `${dir}/${item.name}`;
        if (item.id === null || item.id === undefined) await walk(path); // a folder
        else out.push(path);
      }
      if (data.length < 100) break;
    }
  };
  await walk(prefix);
  return out;
}

export function makeHandler(supabase, stripe) {
  return async function handler(event) {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    const token = (event.headers?.authorization || "").replace("Bearer ", "").trim();
    if (!token) return json(401, { error: "Missing authorization header" });

    const { data: { user } = {}, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return json(401, { error: "Invalid session. Please sign in again." });

    const fail = (msg, err) => {
      console.error("Delete account:", msg, err?.message || err);
      return json(500, { error: "Account deletion failed. Nothing was lost; please try again or contact hello@jordanelias.de." });
    };

    try {
      /* 1. Stop billing. A deleted account must never keep being charged. */
      const { data: subs, error: subErr } = await supabase.from("subscriptions").select("stripe_subscription_id").eq("user_id", user.id);
      if (subErr && !isMissing(subErr)) return fail("read subscriptions", subErr);
      const ids = [...new Set((subs || []).map((s) => s.stripe_subscription_id).filter(Boolean))];
      if (ids.length && !stripe) return fail("billing not configured", { message: "no stripe client" });
      for (const id of ids) {
        try { await stripe.subscriptions.cancel(id); }
        catch (e) {
          // Already cancelled or already gone is fine; anything else stops here.
          if (!(e?.code === "resource_missing" || /already.*cancel|No such subscription/i.test(e?.message || ""))) return fail("cancel subscription " + id, e);
        }
      }

      /* 2. Remove stored files (recordings, therapist photo). */
      for (const bucket of BUCKETS) {
        let paths;
        try { paths = await listAll(supabase.storage, bucket, user.id); }
        catch (e) { if (/not found|does not exist/i.test(e.message)) continue; return fail("list files", e); }
        for (let i = 0; i < paths.length; i += 100) {
          const { error } = await supabase.storage.from(bucket).remove(paths.slice(i, i + 100));
          if (error) return fail("remove files from " + bucket, error);
        }
      }
      // Recordings can also be referenced by explicit path, in case any were stored outside the folder.
      const { data: recs } = await supabase.from("recordings").select("storage_path").eq("user_id", user.id);
      const extra = (recs || []).map((r) => r.storage_path).filter((p) => p && !p.startsWith(user.id + "/"));
      if (extra.length) {
        const { error } = await supabase.storage.from("recordings").remove(extra);
        if (error) return fail("remove extra recordings", error);
      }

      /* 3. Remove rows. */
      for (const [table, col] of TABLES) {
        const { error } = await supabase.from(table).delete().eq(col, user.id);
        if (error && !isMissing(error)) return fail(`delete ${table}.${col}`, error);
      }

      /* 4. Delete the login last. */
      const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
      if (deleteError) return fail("delete auth user", deleteError);

      console.log("Account deleted:", user.id);
      return json(200, { deleted: true });
    } catch (e) {
      return fail("unexpected", e);
    }
  };
}

const rawHandler = (event, context) =>
  makeHandler(
    createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY),
    process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" }) : null
  )(event, context);

export const handler = withCors(rawHandler);
