import { createClient } from "@supabase/supabase-js";

/* ─────────────────────────────
SUPABASE — SERVICE ROLE CLIENT
Needed to call auth.admin.deleteUser()
───────────────────────────── */

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ─────────────────────────────
NETLIFY HANDLER
───────────────────────────── */

export async function handler(event) {

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  /* AUTH HEADER */
  const authHeader = event.headers.authorization;
  if (!authHeader) {
    return { statusCode: 401, body: JSON.stringify({ error: "Missing authorization header" }) };
  }

  const token = authHeader.replace("Bearer ", "");

  /* VERIFY THE USER IS WHO THEY SAY THEY ARE */
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    console.error("Auth verification failed:", userError);
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "Invalid session. Please sign in again." }),
    };
  }

  try {

    /* DELETE ALL USER DATA
       Most tables use ON DELETE CASCADE from auth.users so deleting the
       auth user cascades automatically. We explicitly clean up anything
       that doesn't cascade (e.g. Supabase Storage objects).
    */

    // Delete profile row (if not cascaded)
    await supabase.from("profiles").delete().eq("id", user.id);

    // Delete subscriptions row
    await supabase.from("subscriptions").delete().eq("user_id", user.id);

    // Delete journal entries
    await supabase.from("journal_entries").delete().eq("user_id", user.id);

    // Delete check-ins
    await supabase.from("checkins").delete().eq("user_id", user.id);

    // Delete mixer sessions
    await supabase.from("mixer_sessions").delete().eq("user_id", user.id);

    // Delete recordings metadata
    await supabase.from("recordings").delete().eq("user_id", user.id);

    // Delete bookings
    await supabase.from("bookings").delete().eq("user_id", user.id);

    /* DELETE THE AUTH USER
       This is the final step. Once the auth user is deleted, the session
       token becomes invalid and the user cannot make further requests.
       The foreign key cascade will handle any remaining related rows.
    */
    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error("Auth user deletion failed:", deleteError);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error:
            "Could not delete your account. Please contact support at hello@jordanelias.de.",
        }),
      };
    }

    console.log("Account deleted successfully:", user.id, user.email);

    return {
      statusCode: 200,
      body: JSON.stringify({ deleted: true }),
    };

  } catch (error) {
    console.error("Delete account error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Account deletion failed. Please try again or contact support.",
      }),
    };
  }
}
