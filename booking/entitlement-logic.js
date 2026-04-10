export async function getBookingEntitlement(supabase, userId) {
  // 1. Get user profile (plan + billing period + intro tracking)
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("plan, current_period_end, email, intro_call_used")
    .eq("id", userId)
    .single();

  if (profileError) throw profileError;

  // 2. Define billing period (Stripe-driven)
  const periodEnd = new Date(profile.current_period_end);
  const periodStart = new Date(periodEnd);
  periodStart.setMonth(periodStart.getMonth() - 1);

  // 3. Fetch bookings in current billing period
  const { data: bookings, error: bookingsError } = await supabase
    .from("bookings")
    .select("event_type, status, scheduled_at")
    .eq("user_id", userId)
    .gte("scheduled_at", periodStart.toISOString())
    .lte("scheduled_at", periodEnd.toISOString());

  if (bookingsError) throw bookingsError;

  // 4. Count ONLY valid sessions
  const validBookings = (bookings || []).filter(
    (b) => b.status === "scheduled" || b.status === "completed"
  );

  const subscriberSessionsUsed = validBookings.filter(
    (b) => b.event_type === "subscriber-session"
  ).length;

  const introUsed = profile.intro_call_used;

  // 5. Base entitlement object
  const entitlements = {
    plan: profile.plan,

    // session limits
    sessionsIncluded: 0,
    sessionsUsed: subscriberSessionsUsed,
    sessionsRemaining: 0,

    // permissions
    canBookIncludedSession: false,
    canBookPaidSession: true,
    canBookIntro: !introUsed,

    // UI flags
    showIntro: !introUsed,
    showIncludedSession: false,
    showExtraSession: true,
    showUpgradeToCall1: false,
    showUpgradeToCall2: false,

    // metadata
    periodStart,
    periodEnd,
  };

  // 6. Plan logic (your exact pricing model)

  switch (profile.plan) {
    case "lab":
      // €5 plan → no sessions
      entitlements.sessionsIncluded = 0;
      entitlements.showUpgradeToCall1 = true;
      break;

    case "call1":
      // €60 → 1 session/month
      entitlements.sessionsIncluded = 1;
      entitlements.sessionsRemaining = Math.max(0, 1 - subscriberSessionsUsed);
      entitlements.canBookIncludedSession = subscriberSessionsUsed < 1;
      entitlements.showIncludedSession = subscriberSessionsUsed < 1;
      entitlements.showUpgradeToCall2 = true;
      break;

    case "call2":
      // €110 → 2 sessions/month
      entitlements.sessionsIncluded = 2;
      entitlements.sessionsRemaining = Math.max(0, 2 - subscriberSessionsUsed);
      entitlements.canBookIncludedSession = subscriberSessionsUsed < 2;
      entitlements.showIncludedSession = subscriberSessionsUsed < 2;
      break;

    default:
      // no subscription
      entitlements.canBookIncludedSession = false;
      entitlements.showIncludedSession = false;
      entitlements.showUpgradeToCall1 = true;
  }

  return entitlements;
}
