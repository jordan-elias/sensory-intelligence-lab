/**
 * booking/entitlement-logic.js
 *
 * Standalone entitlement helper. Can be imported by the booking page
 * or used in server-side functions.
 *
 * Usage:
 *   import { getBookingEntitlement } from '/booking/entitlement-logic.js';
 *   const ent = await getBookingEntitlement(supabase, userId);
 */

/**
 * Safely subtract one calendar month from a Date without day-overflow.
 * e.g. March 31 → February 28/29, not March 3.
 */
function periodStartFromEnd(periodEnd) {
  const d = new Date(periodEnd);
  return new Date(d.getFullYear(), d.getMonth() - 1, d.getDate());
}

/**
 * Fetch and compute booking entitlements for a given user.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId  — auth.users UUID
 * @returns {Promise<Entitlement>}
 */
export async function getBookingEntitlement(supabase, userId) {

  // ── 1. Profile ──
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select([
      'plan',
      'subscription_tier',
      'subscription_status',
      'current_period_end',
      'intro_call_used',
      'email',
    ].join(', '))
    .eq('id', userId)
    .single();

  if (profileErr) throw new Error('Could not load profile: ' + profileErr.message);

  // Normalise plan key — support both 'plan' and 'subscription_tier' columns
  const plan   = profile.subscription_tier || profile.plan || 'free';
  const status = profile.subscription_status || 'free';

  // Active means the subscription is current (not lapsed / canceled / past_due)
  const isActive = status === 'active' || status === 'trialing';

  // ── 2. Billing window ──
  const periodEnd   = profile.current_period_end
    ? new Date(profile.current_period_end)
    : null;
  const periodStart = periodEnd ? periodStartFromEnd(periodEnd) : null;

  // ── 3. Subscriber sessions used this period ──
  let subscriberSessionsUsed = 0;

  if (isActive && periodStart && periodEnd) {
    const { data: bookings, error: bookErr } = await supabase
      .from('bookings')
      .select('event_type, status, scheduled_at')
      .eq('user_id', userId)
      .gte('scheduled_at', periodStart.toISOString())
      .lte('scheduled_at', periodEnd.toISOString())
      .in('status', ['scheduled', 'completed']);

    if (bookErr) {
      // Non-fatal — log and continue; worst case user appears to have 0 sessions used
      console.warn('Could not load bookings:', bookErr.message);
    }

    subscriberSessionsUsed = (bookings || []).filter(
      b => b.event_type === 'subscriber-session'
    ).length;
  }

  const introUsed = !!profile.intro_call_used;

  // ── 4. Base entitlement ──
  /** @type {Entitlement} */
  const ent = {
    plan,
    isActive,
    status,
    email:        profile.email || '',
    periodStart,
    periodEnd,

    // Intro: one-time regardless of plan
    canBookIntro: !introUsed,

    // Included sessions
    sessionsIncluded:  0,
    sessionsUsed:      subscriberSessionsUsed,
    sessionsRemaining: 0,
    canBookIncluded:   false,

    // Paid single session always available
    canBookPaid: true,

    // Upgrade hints for UI
    showUpgradeToCall1: false,
    showUpgradeToCall2: false,
  };

  // If subscription is not active, treat as free
  if (!isActive) {
    ent.showUpgradeToCall1 = true;
    return ent;
  }

  // ── 5. Plan-specific session limits ──
  switch (plan) {

    case 'lab':
      // €4 lab-only plan — no included sessions
      ent.sessionsIncluded  = 0;
      ent.showUpgradeToCall1 = true;
      break;

    case 'call1':
      // €60/month — 1 included session
      ent.sessionsIncluded  = 1;
      ent.sessionsUsed      = Math.min(subscriberSessionsUsed, 1);
      ent.sessionsRemaining = Math.max(0, 1 - subscriberSessionsUsed);
      ent.canBookIncluded   = subscriberSessionsUsed < 1;
      ent.showUpgradeToCall2 = true;
      break;

    case 'call2':
      // €110/month — 2 included sessions
      ent.sessionsIncluded  = 2;
      ent.sessionsUsed      = Math.min(subscriberSessionsUsed, 2);
      ent.sessionsRemaining = Math.max(0, 2 - subscriberSessionsUsed);
      ent.canBookIncluded   = subscriberSessionsUsed < 2;
      // call2 is the highest tier — no further upgrade hint
      break;

    default:
      ent.showUpgradeToCall1 = true;
      break;
  }

  return ent;
}

/**
 * @typedef {Object} Entitlement
 * @property {string}       plan
 * @property {boolean}      isActive
 * @property {string}       status
 * @property {string}       email
 * @property {Date|null}    periodStart
 * @property {Date|null}    periodEnd
 * @property {boolean}      canBookIntro
 * @property {number}       sessionsIncluded
 * @property {number}       sessionsUsed
 * @property {number}       sessionsRemaining
 * @property {boolean}      canBookIncluded
 * @property {boolean}      canBookPaid
 * @property {boolean}      showUpgradeToCall1
 * @property {boolean}      showUpgradeToCall2
 */
