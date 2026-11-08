/**
 * netlify/functions/next-available.js
 *
 * For a signed-in person choosing a therapist: the next free session time for each therapist who
 * is taking new clients. Only Cal.com booking links can be checked this way. For any other kind of
 * link, or if Cal.com does not answer in time, the answer is "unknown" and the page says
 * "See availability" instead of guessing.
 *
 * Returns { results: { [therapist_user_id]: { next: ISO string | null } } }.
 */
import { createClient } from "@supabase/supabase-js";

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const CAL_HOSTS = new Set(["cal.com", "www.cal.com", "app.cal.com"]);
const DAYS_AHEAD = 21;
const TIMEOUT_MS = 4000;
const CACHE_MS = 5 * 60 * 1000;

/** "user/event" from a Cal.com link, or null for anything else (team links, other sites). */
export function calParts(raw) {
  let u;
  try { u = new URL(String(raw || "").trim()); } catch { return null; }
  if (u.protocol !== "https:" || !CAL_HOSTS.has(u.hostname.toLowerCase())) return null;
  const parts = u.pathname.replace(/^\/+|\/+$/g, "").split("/");
  if (parts.length !== 2 || !parts.every((p) => /^[A-Za-z0-9_.-]+$/.test(p))) return null;
  return { username: parts[0], eventTypeSlug: parts[1] };
}

/** Earliest slot in a Cal.com slots response (current and older shapes), as an ISO string. */
export function earliestSlot(body, now = new Date()) {
  const days = body?.data?.slots ?? body?.data ?? body?.slots;
  if (!days || typeof days !== "object") return null;
  let best = null;
  for (const list of Object.values(days)) {
    if (!Array.isArray(list)) continue;
    for (const s of list) {
      const raw = typeof s === "string" ? s : s?.start ?? s?.time;
      const t = raw ? new Date(raw) : null;
      if (t && !isNaN(t) && t > now && (!best || t < best)) best = t;
    }
  }
  return best ? best.toISOString() : null;
}

export function makeHandler(supabase, fetchFn = fetch, nowFn = () => new Date()) {
  const cache = new Map();

  async function lookup(link) {
    const hit = cache.get(link);
    if (hit && nowFn() - hit.at < CACHE_MS) return hit.value;
    const parts = calParts(link);
    let value = null;
    if (parts) {
      const now = nowFn();
      const end = new Date(now.getTime() + DAYS_AHEAD * 86400000);
      const q = new URLSearchParams({
        username: parts.username, eventTypeSlug: parts.eventTypeSlug,
        start: now.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10),
      });
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
      try {
        const res = await fetchFn(`https://api.cal.com/v2/slots?${q}`, { headers: { "cal-api-version": "2024-09-04" }, signal: ctl.signal });
        if (res.ok) value = earliestSlot(await res.json(), now);
      } catch { /* unknown is fine */ } finally { clearTimeout(timer); }
    }
    cache.set(link, { at: nowFn(), value });
    return value;
  }

  return async function handler(event) {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
    const token = (event.headers?.authorization || "").replace("Bearer ", "").trim();
    if (!token) return json(401, { error: "Missing authorization header" });
    const { data: { user } = {}, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return json(401, { error: "Invalid session. Please sign in again." });

    const { data: rows, error } = await supabase.from("therapist_profiles").select("user_id, booking_link").eq("accepting_clients", true);
    if (error) return json(500, { error: "Could not load therapists." });
    const results = {};
    await Promise.all((rows || []).map(async (r) => { results[r.user_id] = { next: await lookup(r.booking_link) }; }));
    return json(200, { results });
  };
}

export const handler = (event, context) =>
  makeHandler(createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY))(event, context);
