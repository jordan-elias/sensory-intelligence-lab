import { withCors } from './lib/cors.js';
/**
 * netlify/functions/end-therapist-link.js
 *
 * Either side can end a client-therapist link. Access stops immediately; what each side then
 * keeps or deletes is handled in the sharing phase. Only the client or the therapist named on the
 * link can end it.
 */
import { createClient } from "@supabase/supabase-js";

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
    if (!body.link_id) return json(400, { error: "Missing link" });

    const { data: link } = await supabase
      .from("client_therapists").select("id, client_id, therapist_id, status").eq("id", body.link_id).maybeSingle();
    if (!link || (link.client_id !== user.id && link.therapist_id !== user.id)) {
      return json(404, { error: "Link not found" });          // same answer for "not yours" and "does not exist"
    }
    if (link.status === "ended") return json(200, { ok: true, already: true });

    // A connection that was never active gave the therapist nothing and they never saw the person: just remove it.
    if (link.status === "pending") {
      if (link.client_id !== user.id) return json(404, { error: "Link not found" });
      const { error: delError } = await supabase.from("client_therapists").delete().eq("id", link.id).eq("status", "pending");
      if (delError) return json(500, { error: "Could not remove the choice. Please try again." });
      return json(200, { ok: true, removed: true });
    }

    const { error } = await supabase.from("client_therapists")
      .update({ status: "ended", ended_at: new Date().toISOString(), ended_by: user.id })
      .eq("id", link.id);
    if (error) return json(500, { error: "Could not end the link. Please try again." });
    return json(200, { ok: true });
  };
}

let cached;
const rawHandler = (event) => {
  cached ||= makeHandler(createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY));
  return cached(event);
};

export const handler = withCors(rawHandler);
