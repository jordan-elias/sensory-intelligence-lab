/**
 * booking/entitlement-logic.js
 *
 * Standalone entitlement helper. Imported by booking/index.html.
 * There is one plan (Lab). Sessions are booked and paid for on Cal.com, at a standard or a Lab member rate, so this only
 * answers: is the subscription active, is it ending, and is the one-time intro still available.
 *
 * Usage:
 *   import { getBookingEntitlement, getUpcomingBookings } from '/booking/entitlement-logic.js';
 *   const ent = await getBookingEntitlement(supabase, userId);
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @returns {Promise<Entitlement>}
 */
export async function getBookingEntitlement(supabase, userId) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select(['subscription_tier', 'subscription_status', 'subscription_plan', 'current_period_start',
      'current_period_end', 'cancel_at_period_end', 'intro_call_used', 'is_beta', 'email'].join(', '))
    .eq('id', userId)
    .single();
  if (error) throw new Error('Could not load profile: ' + error.message);

  const status   = profile.subscription_status ?? 'free';
  const isActive = status === 'active' || status === 'trialing';
  return {
    tier:              profile.subscription_tier ?? 'free',
    isActive,
    isPastDue:         status === 'past_due',
    isCanceled:        status === 'canceled',
    status,
    isBeta:            profile.is_beta ?? false,
    subscriptionPlan:  profile.subscription_plan || null,
    email:             profile.email || '',
    periodStart:       profile.current_period_start ? new Date(profile.current_period_start) : null,
    periodEnd:         profile.current_period_end ? new Date(profile.current_period_end) : null,
    cancelAtPeriodEnd: profile.cancel_at_period_end ?? false,
    canBookIntro:      !profile.intro_call_used,   // one-time, for everyone
    canBookSingle:     true,                       // Cal.com handles payment
  };
}

/**
 * Fetch upcoming scheduled bookings for a user.
 * Returns bookings with scheduled_at in the future, ordered ascending.
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
 * @property {string}       tier               — free / lab
 * @property {boolean}      isActive           — subscription is active or trialing
 * @property {boolean}      isPastDue          — payment failed
 * @property {boolean}      isCanceled         — subscription ended
 * @property {string}       status             — raw DB status
 * @property {boolean}      isBeta             — is_beta flag
 * @property {string|null}  subscriptionPlan   — e.g. "lab_monthly"
 * @property {string}       email
 * @property {Date|null}    periodStart        — Stripe billing period start
 * @property {Date|null}    periodEnd          — Stripe billing period end
 * @property {boolean}      cancelAtPeriodEnd  — cancellation scheduled
 * @property {boolean}      canBookIntro       — one-time intro not yet used
 * @property {boolean}      canBookSingle      — always true (Cal.com handles payment)
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
