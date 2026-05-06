/**
 * booking/entitlement-logic.js
 *
 * Standalone entitlement helper. Imported by booking/index.html.
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
      'subscription_tier',
      'subscription_status',
      'current_period_end',
      'intro_call_used',
      'is_beta',
      'email',
    ].join(', '))
    .eq('id', userId)
    .single();

  if (profileErr) throw new Error('Could not load profile: ' + profileErr.message);

  const tier   = profile.subscription_tier   ?? 'free';
  const status = profile.subscription_status ?? 'free';
  const isBeta = profile.is_beta             ?? false;

  // Active means the subscription is current (not lapsed / canceled / past_due)
  const isActive = status === 'active' || status === 'trialing';

  // Beta users get lab-level tool access but no included sessions —
  // they must book sessions like any free/lab user.
  // So for booking purposes, beta is treated the same as 'lab' tier.
  const effectiveTier = isBeta && !isActive ? 'lab' : tier;

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
      // Non-fatal — log and continue
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
    tier: effectiveTier,
    isActive,
    status,
    isBeta,
    email:        profile.email || '',
    periodStart,
    periodEnd,

    // Intro: one-time for everyone regardless of plan
    canBookIntro: !introUsed,

    // Included sessions (only for call1/call2 tiers)
    sessionsIncluded:  0,
    sessionsUsed:      subscriberSessionsUsed,
    sessionsRemaining: 0,
    canBookIncluded:   false,

    // Single paid session — always bookable via Cal.com (Cal handles payment)
    canBookSingle: true,

    // Upgrade hints for UI
    showUpgradeToCall1: false,
    showUpgradeToCall2: false,
  };

  // If subscription is not active, suggest upgrading
  if (!isActive) {
    ent.showUpgradeToCall1 = true;
    return ent;
  }

  // ── 5. Plan-specific session limits ──
  switch (effectiveTier) {

    case 'lab':
      // Lab plan — no included sessions, suggest upgrade to call1
      ent.sessionsIncluded    = 0;
      ent.showUpgradeToCall1  = true;
      break;

    case 'call1':
      // 1 included session per month
      ent.sessionsIncluded  = 1;
      ent.sessionsUsed      = Math.min(subscriberSessionsUsed, 1);
      ent.sessionsRemaining = Math.max(0, 1 - subscriberSessionsUsed);
      ent.canBookIncluded   = subscriberSessionsUsed < 1;
      ent.showUpgradeToCall2 = true;
      break;

    case 'call2':
      // 2 included sessions per month
      ent.sessionsIncluded  = 2;
      ent.sessionsUsed      = Math.min(subscriberSessionsUsed, 2);
      ent.sessionsRemaining = Math.max(0, 2 - subscriberSessionsUsed);
      ent.canBookIncluded   = subscriberSessionsUsed < 2;
      break;

    default:
      // Free tier
      ent.showUpgradeToCall1 = true;
      break;
  }

  return ent;
}

/**
 * Fetch upcoming scheduled bookings for a user.
 *
 * Returns bookings with scheduled_at in the future, ordered ascending.
 * Includes all event types (intro, session, subscriber-session).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @returns {Promise<UpcomingBooking[]>}
 */
export async function getUpcomingBookings(supabase, userId) {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('bookings')
    .select('id, event_type, scheduled_at, completed_at, cal_event_id, status')
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .gt('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(5);

  if (error) {
    console.warn('Could not load upcoming bookings:', error.message);
    return [];
  }

  return data || [];
}

/**
 * @typedef {Object} Entitlement
 * @property {string}       tier
 * @property {boolean}      isActive
 * @property {string}       status
 * @property {boolean}      isBeta
 * @property {string}       email
 * @property {Date|null}    periodStart
 * @property {Date|null}    periodEnd
 * @property {boolean}      canBookIntro
 * @property {number}       sessionsIncluded
 * @property {number}       sessionsUsed
 * @property {number}       sessionsRemaining
 * @property {boolean}      canBookIncluded
 * @property {boolean}      canBookSingle
 * @property {boolean}      showUpgradeToCall1
 * @property {boolean}      showUpgradeToCall2
 */

/**
 * @typedef {Object} UpcomingBooking
 * @property {string}  id
 * @property {string}  event_type
 * @property {string}  scheduled_at
 * @property {string}  completed_at
 * @property {string}  cal_event_id
 * @property {string}  status
 */
