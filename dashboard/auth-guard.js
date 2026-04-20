// /dashboard/auth-guard.js
// Handles: session checking, gating, plan detection
// Place this file at: /dashboard/auth-guard.js
// Include on every protected page with: <script src="/dashboard/auth-guard.js" type="module"></script>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = "https://lrjuufvrgkuvfxcmybtf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_VyiIJOgsGueUOVU_ed49-Q_rS4mi7J1";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Expose supabase client globally so other scripts on the page can use it
window._supabase = supabase;

async function checkAuth() {
  // getUser() makes a network call to verify the token is still valid.
  // More reliable than getSession() on page load, which reads from
  // localStorage and can return stale data.
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    // Not logged in — send to root sign-in page
    window.location.replace("/");
    return;
  }

  // Fetch the user's profile using the clean schema columns
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("subscription_tier, subscription_status, is_beta, intro_call_used, full_name, email")
    .eq("id", user.id)
    .single();

  if (profileError) {
    console.warn("Could not load profile:", profileError.message);
  }

  const tier   = profile?.subscription_tier ?? "free";
  const status = profile?.subscription_status ?? "free";
  const isBeta = profile?.is_beta ?? false;

  // Canonical access tier:
  // - Beta users get full lab access regardless of subscription_tier
  // - Paid users (lab / call1 / call2) get full access when active
  // - Everyone else is treated as free
  const isActiveSubscription = status === "active" || status === "trialing";
  const hasPaidTier = tier === "lab" || tier === "call1" || tier === "call2";

  let accessTier;
  if (isBeta) {
    accessTier = "beta";
  } else if (hasPaidTier && isActiveSubscription) {
    accessTier = tier; // 'lab', 'call1', or 'call2'
  } else {
    accessTier = "free";
  }

  // isPaidUser: true for any user with full lab access
  // (beta, lab, call1, call2 with active subscription)
  const isPaidUser = accessTier !== "free";

  // Expose everything globally for use by page scripts
  window._currentUser    = user;
  window._userProfile    = profile;
  window._accessTier     = accessTier;   // 'free' | 'lab' | 'call1' | 'call2' | 'beta'
  window._isPaidUser     = isPaidUser;   // boolean — true if full lab access
  window._isBeta         = isBeta;       // boolean
  window._subscriptionStatus = status;  // raw stripe status string

  // Legacy alias — kept so any existing page scripts using _currentPlan
  // don't break before they are updated
  window._currentPlan = accessTier;

  // Dispatch an event so page scripts can react once auth is confirmed
  window.dispatchEvent(new CustomEvent("authReady", {
    detail: {
      user,
      profile,
      accessTier,
      isPaidUser,
      isBeta,
    }
  }));

  console.log(
    "Authenticated:", user.email,
    "| Tier:", tier,
    "| Status:", status,
    "| Access:", accessTier,
    "| Beta:", isBeta
  );
}

checkAuth();
