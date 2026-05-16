/**
 * booking/entitlement-logic.js
 *
 * Standalone entitlement helper. Imported by booking/index.html.
 *
 * Usage:
 *   import { getBookingEntitlement, getUpcomingBookings } from '/booking/entitlement-logic.js';
 *   const ent = await getBookingEntitlement(supabase, userId);
 */

/* ─────────────────────────────────────────────────────────────────────────────
   MONTHLY WINDOW CALCULATION
   ─────────────────────────────────────────────────────────────────────────────

   For both monthly and yearly subscribers, session allowances reset monthly on
   the same day-of-month as the subscription started (the "anchor day").

   e.g. subscription started 10 Apr → windows are Apr 10–May 9, May 10–Jun 9, …

   We use current_period_start (written by the webhook from Stripe's
   subscription.current_period_start) as the anchor source.

   Edge case: anchor day is 29–31 and the current/next month is shorter.
   We clamp to the last day of the month (e.g. anchor=31, Feb → Feb 28/29).
──────────────────────────────────────────────────────────────────────────── */

/**
 * Return the last valid day in a given year/month (0-indexed month).
 */
function lastDayOfMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Clamp a day number to the last valid day of the given year/month.
 */
function clampDay(day, year, month) {
  return Math.min(day, lastDayOfMonth(year, month));
}

/**
 * Given an anchor day-of-month and a reference Date (today), return the
 * start and end of the current monthly window.
 *
 * The window start is the most recent occurrence of anchorDay on or before today.
 * The window end is the day before the next occurrence of anchorDay.
 *
 * Both are returned as Date objects at midnight UTC.
 *
 * @param {number} anchorDay  1–31
 * @param {Date}   now
 * @returns {{ windowStart: Date, windowEnd: Date }}
 */
function currentMonthlyWindow(anchorDay, now) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-indexed
  const d = now.getUTCDate();

  // Try this calendar month first
  const clampedThisMonth = clampDay(anchorDay, y, m);

  let windowStart;
  if (d >= clampedThisMonth) {
    // Anchor has already passed this calendar month — window started this month
    windowStart = new Date(Date.UTC(y, m, clampedThisMonth));
  } else {
    // Anchor hasn't passed yet — window started last calendar month
    const prevY = m === 0 ? y - 1 : y;
    const prevM = m === 0 ? 11 : m - 1;
    windowStart = new Date(Date.UTC(prevY, prevM, clampDay(anchorDay, prevY, prevM)));
  }

  // Window end = one month after windowStart, minus one millisecond
  const wsY = windowStart.getUTCFullYear();
  const wsM = windowStart.getUTCMonth();
  const wsD = windowStart.getUTCDate();
  const nextM = wsM === 11 ? 0  : wsM + 1;
  const nextY = wsM === 11 ? wsY + 1 : wsY;
  const windowEnd = new Date(Date.UTC(nextY, nextM, clampDay(wsD, nextY, nextM)) - 1);

  return { windowStart, windowEnd };
}

/**
 * Return the start and end of the monthly window immediately preceding the
 * given windowStart.
 *
 * @param {number} anchorDay
 * @param {Date}   windowStart  — start of the current window
 * @returns {{ prevWindowStart: Date, prevWindowEnd: Date }}
 */
function previousMonthlyWindow(anchorDay, windowStart) {
  const wsY = windowStart.getUTCFullYear();
  const wsM = windowStart.getUTCMonth();

  const prevY = wsM === 0 ? wsY - 1 : wsY;
  const prevM = wsM === 0 ? 11 : wsM - 1;

  const prevWindowStart = new Date(Date.UTC(prevY, prevM, clampDay(anchorDay, prevY, prevM)));
  // Previous window ends one ms before current window starts
  const prevWindowEnd   = new Date(windowStart.getTime() - 1);

  return { prevWindowStart, prevWindowEnd };
}

/* ─────────────────────────────────────────────────────────────────────────────
   CARRY-OVER LOGIC
   ─────────────────────────────────────────────────────────────────────────────

   Rule (confirmed):
   - Each month a user gets baseN sessions (1 for call1, 2 for call2).
   - Unused sessions carry over once, into the following month only.
   - Carry-over does NOT compound: if the carry-over is also unused, it expires.
   - Carry-over is based on baseN vs last month's usage, never on total available.

   Example for call1 (baseN = 1):
     Month 1: used 1 → carry 0 → Month 2 has 1 available
     Month 2: used 0 → carry 1 → Month 3 has 2 available
     Month 3: used 1 → carry 0 → Month 4 has 1 available
     (the carry-over in month 3 was available but not used; it expires)

   carryOver = max(0, min(baseN, baseN - lastMonthUsed))
   available = baseN + carryOver
──────────────────────────────────────────────────────────────────────────── */

function computeCarryOver(baseN, lastMonthUsed) {
  return Math.max(0, Math.min(baseN, baseN - lastMonthUsed));
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN EXPORT
──────────────────────────────────────────────────────────────────────────── */

/**
 * Fetch and compute booking entitlements for a given user.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId  — auth.users UUID
 * @returns {Promise<Entitlement>}
 */
export async function getBookingEntitlement(supabase, userId) {

  // ── 1. Profile ──────────────────────────────────────────────────────────
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select([
      'subscription_tier',
      'subscription_status',
      'subscription_plan',
      'current_period_start',
      'current_period_end',
      'cancel_at_period_end',
      'intro_call_used',
      'is_beta',
      'email',
    ].join(', '))
    .eq('id', userId)
    .single();

  if (profileErr) throw new Error('Could not load profile: ' + profileErr.message);

  const tier              = profile.subscription_tier   ?? 'free';
  const status            = profile.subscription_status ?? 'free';
  const isBeta            = profile.is_beta             ?? false;
  const cancelAtPeriodEnd = profile.cancel_at_period_end ?? false;
  const introUsed         = !!profile.intro_call_used;

  const isPastDue  = status === 'past_due';
  const isCanceled = status === 'canceled';
  const isActive   = status === 'active' || status === 'trialing';

  // Beta users have lab-level tool access but no included sessions —
  // for booking purposes, treat them the same as 'lab'.
  const isActivePaidTier = ['lab', 'call1', 'call2'].includes(tier) && isActive;
  const effectiveTier    = (isBeta && !isActivePaidTier) ? 'lab' : tier;

  // ── 2. Monthly window calculation ───────────────────────────────────────
  // We need current_period_start to derive the anchor day.
  // If it's missing (old rows before the schema change), fall back to
  // current_period_end minus one month — which is what the old code did.

  const rawPeriodStart = profile.current_period_start
    ? new Date(profile.current_period_start)
    : null;
  const rawPeriodEnd   = profile.current_period_end
    ? new Date(profile.current_period_end)
    : null;

  let windowStart    = null;
  let windowEnd      = null;
  let prevWinStart   = null;
  let prevWinEnd     = null;
  let anchorDay      = null;

  if (rawPeriodStart) {
    anchorDay = rawPeriodStart.getUTCDate();
    const now = new Date();
    ({ windowStart, windowEnd } = currentMonthlyWindow(anchorDay, now));
    ({ prevWindowStart: prevWinStart, prevWindowEnd: prevWinEnd } =
      previousMonthlyWindow(anchorDay, windowStart));
  } else if (rawPeriodEnd) {
    // Fallback: subtract one month from period end to get approximate start
    const pe = rawPeriodEnd;
    const prevM = pe.getUTCMonth() === 0 ? 11 : pe.getUTCMonth() - 1;
    const prevY = pe.getUTCMonth() === 0 ? pe.getUTCFullYear() - 1 : pe.getUTCFullYear();
    windowStart = new Date(Date.UTC(prevY, prevM, clampDay(pe.getUTCDate(), prevY, prevM)));
    windowEnd   = rawPeriodEnd;
    // No reliable previous window without anchor day
  }

  // ── 3. Booking queries ───────────────────────────────────────────────────
  // Fetch all subscriber-session bookings that could affect the carry-over
  // calculation: from the start of last month through the end of this month.
  // We filter in JS to keep the DB query simple.

  let lastMonthBookings    = [];
  let thisMonthBookings    = [];

  const isSessionTier = (effectiveTier === 'call1' || effectiveTier === 'call2') && isActive;

  if (isSessionTier && windowStart && prevWinStart) {
    const { data: bookings, error: bookErr } = await supabase
      .from('bookings')
      .select('event_type, status, scheduled_at')
      .eq('user_id', userId)
      .eq('event_type', 'subscriber-session')
      .in('status', ['scheduled', 'completed'])
      .gte('scheduled_at', prevWinStart.toISOString())
      .lte('scheduled_at', windowEnd ? windowEnd.toISOString() : new Date(9999, 0).toISOString());

    if (bookErr) {
      console.warn('Could not load bookings for carry-over calculation:', bookErr.message);
    }

    const all = bookings || [];
    lastMonthBookings = all.filter(b => new Date(b.scheduled_at) < windowStart);
    thisMonthBookings = all.filter(b => new Date(b.scheduled_at) >= windowStart);

  } else if (isSessionTier && windowStart && !prevWinStart) {
    // No previous window (fallback path) — just fetch this month
    const { data: bookings, error: bookErr } = await supabase
      .from('bookings')
      .select('event_type, status, scheduled_at')
      .eq('user_id', userId)
      .eq('event_type', 'subscriber-session')
      .in('status', ['scheduled', 'completed'])
      .gte('scheduled_at', windowStart.toISOString())
      .lte('scheduled_at', windowEnd ? windowEnd.toISOString() : new Date(9999, 0).toISOString());

    if (bookErr) {
      console.warn('Could not load bookings:', bookErr.message);
    }
    thisMonthBookings = bookings || [];
  }

  // ── 4. Build entitlement ─────────────────────────────────────────────────

  /** @type {Entitlement} */
  const ent = {
    tier:            effectiveTier,
    isActive,
    isPastDue,
    isCanceled,
    status,
    isBeta,
    subscriptionPlan: profile.subscription_plan || null,
    email:            profile.email || '',

    // Billing period (Stripe billing period — for display on subscribe/account pages)
    periodStart: rawPeriodStart,
    periodEnd:   rawPeriodEnd,

    // Monthly window (session allowance window — for display on booking page)
    windowStart,
    windowEnd,

    cancelAtPeriodEnd,

    // Intro: one-time for all users regardless of plan
    canBookIntro: !introUsed,

    // Session allowance (populated below for session tiers)
    baseSessionsPerMonth: 0,
    carryOver:            0,
    sessionsAvailable:    0,
    sessionsUsed:         thisMonthBookings.length,
    sessionsRemaining:    0,
    canBookIncluded:      false,

    // Single paid session — always bookable via Cal.com (Cal handles payment)
    canBookSingle: true,

    // Upgrade hints
    showUpgradeToCall1: false,
    showUpgradeToCall2: false,
  };

  // ── 5. Plan-specific session limits ─────────────────────────────────────

  if (isPastDue || isCanceled || !isActive) {
    // No session access — show upgrade/resubscribe nudge
    ent.showUpgradeToCall1 = true;
    return ent;
  }

  switch (effectiveTier) {

    case 'lab':
      ent.showUpgradeToCall1 = true;
      break;

    case 'call1': {
      const baseN    = 1;
      const lastUsed = lastMonthBookings.length;
      const carry    = computeCarryOver(baseN, lastUsed);
      const available = baseN + carry;
      const used      = Math.min(thisMonthBookings.length, available);
      const remaining = Math.max(0, available - used);

      ent.baseSessionsPerMonth = baseN;
      ent.carryOver            = carry;
      ent.sessionsAvailable    = available;
      ent.sessionsUsed         = used;
      ent.sessionsRemaining    = remaining;
      ent.canBookIncluded      = remaining > 0;
      ent.showUpgradeToCall2   = true;
      break;
    }

    case 'call2': {
      const baseN    = 2;
      const lastUsed = lastMonthBookings.length;
      const carry    = computeCarryOver(baseN, lastUsed);
      const available = baseN + carry;
      const used      = Math.min(thisMonthBookings.length, available);
      const remaining = Math.max(0, available - used);

      ent.baseSessionsPerMonth = baseN;
      ent.carryOver            = carry;
      ent.sessionsAvailable    = available;
      ent.sessionsUsed         = used;
      ent.sessionsRemaining    = remaining;
      ent.canBookIncluded      = remaining > 0;
      break;
    }

    default:
      // Free tier
      ent.showUpgradeToCall1 = true;
      break;
  }

  return ent;
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

/* ─────────────────────────────────────────────────────────────────────────────
   TYPEDEFS
──────────────────────────────────────────────────────────────────────────── */

/**
 * @typedef {Object} Entitlement
 * @property {string}       tier                  — effective tier (free/lab/call1/call2)
 * @property {boolean}      isActive              — subscription is active or trialing
 * @property {boolean}      isPastDue             — payment failed
 * @property {boolean}      isCanceled            — subscription ended
 * @property {string}       status                — raw DB status
 * @property {boolean}      isBeta                — is_beta flag
 * @property {string|null}  subscriptionPlan      — e.g. "call1_monthly"
 * @property {string}       email
 * @property {Date|null}    periodStart           — Stripe billing period start
 * @property {Date|null}    periodEnd             — Stripe billing period end
 * @property {Date|null}    windowStart           — current monthly session window start
 * @property {Date|null}    windowEnd             — current monthly session window end
 * @property {boolean}      cancelAtPeriodEnd     — cancellation scheduled
 * @property {boolean}      canBookIntro          — one-time intro not yet used
 * @property {number}       baseSessionsPerMonth  — base allowance (1 or 2)
 * @property {number}       carryOver             — sessions carried from last month
 * @property {number}       sessionsAvailable     — base + carryOver
 * @property {number}       sessionsUsed          — booked this window
 * @property {number}       sessionsRemaining     — sessionsAvailable - sessionsUsed
 * @property {boolean}      canBookIncluded       — remaining > 0
 * @property {boolean}      canBookSingle         — always true (Cal handles payment)
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
