// auth-guard.js
// Handles: session checking, gating, plan detection
// Place this file at: /dashboard/auth-guard.js
// Include on every protected page with: <script src="/dashboard/auth-guard.js"></script>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = "https://lrjuufvrgkuvfxcmybtf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_VyiIJOgsGueUOVU_ed49-Q_rS4mi7J1";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Expose supabase client globally so other scripts on the page can use it
window._supabase = supabase;

async function checkAuth() {
  // getUser() makes a network call to verify the token is still valid.
  // This is more reliable than getSession() on page load, which reads
  // from localStorage and can return stale data.
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    // Not logged in — send to root sign-in page
    window.location.replace("/");
    return;
  }

  // Fetch the user's profile to get their plan
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("plan, plan_expires_at")
    .eq("id", user.id)
    .single();

  if (profileError) {
    console.warn("Could not load profile:", profileError.message);
  }

  const plan = profile?.plan ?? "free";

  // Expose user info globally for use by page scripts
  window._currentUser  = user;
  window._currentPlan  = plan;
  window._userProfile  = profile;

  // Dispatch an event so page scripts can react once auth is confirmed
  window.dispatchEvent(new CustomEvent("authReady", { detail: { user, plan, profile } }));

  console.log("Authenticated:", user.email, "| Plan:", plan);
}

checkAuth();
