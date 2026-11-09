/**
 * Shared rules for choosing a therapist before a plan that includes sessions.
 *  - A person picks a therapist first. That creates a "pending" connection, which gives the therapist no access
 *    to anything and does not show the person in their client list.
 *  - Paying for a session plan (call1 or call2) turns the pending connection into an active one.
 */
export const SESSION_TIERS = ["call1", "call2"];
export const ACTIVE_STATUSES = ["active", "trialing"];

/** For checkout and upgrades to a session plan. Returns null when fine, else { statusCode, body }. */
export async function therapistProblem(supabase, userId) {
  const { data: links } = await supabase
    .from("client_therapists").select("id, status, therapist_id")
    .eq("client_id", userId).in("status", ["pending", "active"]).limit(1);
  const link = links && links[0];
  const fail = (code, message) => ({ statusCode: 409, body: JSON.stringify({ error: code, message }) });
  if (!link) return fail("therapist_required", "Please choose your therapist first. Plans with sessions are linked to a therapist.");
  if (link.status === "active") return null;             // an existing client may always change plan
  const { data: t } = await supabase.from("therapist_profiles")
    .select("user_id").eq("user_id", link.therapist_id).eq("accepting_clients", true).limit(1);
  if (!t || !t.length) return fail("therapist_not_accepting", "Your chosen therapist is not taking new clients right now. Please choose another therapist.");
  return null;
}

/** Called when a subscription is saved. Only session plans that are paid and current activate a connection. */
export async function activatePendingLink(supabase, userId, tier, status) {
  if (!SESSION_TIERS.includes(tier) || !ACTIVE_STATUSES.includes(status)) return;
  const { error } = await supabase.from("client_therapists")
    .update({ status: "active" }).eq("client_id", userId).eq("status", "pending");
  if (error) console.error("Could not activate therapist link:", error.message);
}
