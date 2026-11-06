/**
 * netlify/functions/link-therapist.js
 *
 * Connects a client with a therapist, only after the client has seen and agreed to what the
 * therapist will be able to see. The browser cannot create these links itself: this function
 * checks the subscription tier on the server and records the consent text version.
 *
 * Today every session-tier client is linked to the default therapist. Later the body may carry
 * a `therapist_id` chosen from the directory.
 */
import { createClient } from "@supabase/supabase-js";

// Must match LINK_CONSENT_VERSION in /assets/js/therapist/consent.js
export const CONSENT_VERSION = "link-1.1";
const SESSION_TIERS = ["call1", "call2"];
const ACTIVE_STATUSES = ["active", "trialing"];

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function makeHandler(supabase) {
  return async function handler(event) {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    const token = (event.headers.authorization || "").replace("Bearer ", "").trim();
    if (!token) return json(401, { error: "Missing auth token" });
    const { data: { user } = {}, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json(401, { error: "Unauthorized" });

    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid request" }); }
    if (body.consent_version !== CONSENT_VERSION) {
      return json(409, { error: "The wording you agreed to has changed. Please reload the page and read it again." });
    }

    const { data: profile } = await supabase
      .from("profiles").select("subscription_tier, subscription_status").eq("id", user.id).maybeSingle();
    if (!profile || !SESSION_TIERS.includes(profile.subscription_tier) || !ACTIVE_STATUSES.includes(profile.subscription_status)) {
      return json(403, { error: "Working with a therapist needs a plan that includes sessions." });
    }

    const { data: open } = await supabase
      .from("client_therapists").select("id, status")
      .eq("client_id", user.id).in("status", ["pending", "active"]).limit(1);
    if (open && open.length) return json(200, { ok: true, already: true, link_id: open[0].id });

    let q = supabase.from("therapist_profiles")
      .select("user_id, practice_id").eq("accepting_clients", true);
    q = body.therapist_id ? q.eq("user_id", body.therapist_id) : q.eq("is_default", true);
    const { data: therapists } = await q.limit(1);
    const therapist = therapists && therapists[0];
    if (!therapist) return json(503, { error: "No therapist is taking new clients right now. Please try again later." });
    if (therapist.user_id === user.id) return json(400, { error: "You cannot be your own client." });

    const { data: link, error } = await supabase.from("client_therapists").insert({
      client_id: user.id, therapist_id: therapist.user_id, practice_id: therapist.practice_id,
      status: "active", requested_by: "client",
      consented_at: new Date().toISOString(), consent_version: CONSENT_VERSION,
    }).select("id").single();
    if (error) return json(500, { error: "Could not create the link. Please try again." });
    return json(200, { ok: true, link_id: link.id });
  };
}

let cached;
export const handler = (event) => {
  cached ||= makeHandler(createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY));
  return cached(event);
};
