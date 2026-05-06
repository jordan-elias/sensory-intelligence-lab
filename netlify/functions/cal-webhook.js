/**
 * /.netlify/functions/cal-webhook.js
 *
 * Cal.com webhook handler for booking lifecycle events.
 * Handles: BOOKING_CREATED, BOOKING_RESCHEDULED, BOOKING_CANCELLED
 *
 * Cal.com wraps all payloads as:
 * { triggerEvent, createdAt, payload: { ...bookingFields } }
 *
 * Signature is sent in header: x-cal-signature-256
 * as HMAC-SHA256 of the raw request body using CAL_WEBHOOK_SECRET.
 */

import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';

// ── Supabase admin client ──────────────────────────────
const supabaseUrl        = process.env.SUPABASE_URL || 'https://lrjuufvrgkuvfxcmybtf.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseServiceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const WEBHOOK_SECRET = process.env.CAL_WEBHOOK_SECRET;

// ── Signature verification ─────────────────────────────
// Cal.com signs the raw request body with HMAC-SHA256 using your secret.
// The resulting hex digest is sent in the x-cal-signature-256 header.
function verifySignature(rawBody, signature) {
  if (!WEBHOOK_SECRET) {
    console.warn('CAL_WEBHOOK_SECRET not set — skipping signature verification');
    return true;
  }
  if (!signature) {
    console.error('Missing x-cal-signature-256 header');
    return false;
  }
  try {
    const digest   = createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
    const expected = Buffer.from(digest);
    const received = Buffer.from(signature);
    if (expected.length !== received.length) return false;
    return timingSafeEqual(expected, received);
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}

// ── Helpers ───────────────────────────────────────────
function getEventType(slug) {
  if (!slug) return 'unknown';
  const s = slug.toLowerCase();
  if (s.includes('intro'))               return 'intro';
  if (s.includes('subscriber-session'))  return 'subscriber-session';
  if (s.includes('session'))             return 'session';
  return 'unknown';
}

function extractAttendeeEmail(p) {
  // p is the inner payload object
  if (p.responses?.email?.value)  return p.responses.email.value;
  if (p.responses?.email)         return p.responses.email;
  if (p.attendees?.[0]?.email)    return p.attendees[0].email;
  return null;
}

function extractAttendeeName(p) {
  if (p.responses?.name?.value)   return p.responses.name.value;
  if (p.responses?.name)          return p.responses.name;
  if (p.attendees?.[0]?.name)     return p.attendees[0].name;
  return null;
}

async function findUserByEmail(email) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single();
  if (error) { console.error('Error finding user by email:', error); return null; }
  return data?.id || null;
}

// Only session types that warrant a post-session reflection reminder
function shouldSendReminder(eventType) {
  return ['session', 'subscriber-session'].includes(eventType);
}

// ── Event handlers ────────────────────────────────────

async function handleBookingCreated(p) {
  // p = the inner payload object (already unwrapped from the envelope)
  const email = extractAttendeeEmail(p);
  if (!email) {
    console.error('No attendee email in booking payload');
    return { success: false, error: 'No email in payload' };
  }

  const userId = await findUserByEmail(email);
  if (!userId) {
    // User may not have a platform account yet (e.g. a brand-new intro booking)
    console.warn(`No platform account found for email: ${email}`);
    return { success: true, message: 'No platform user — booking not stored' };
  }

  const slug       = p.eventTypeSlug || p.eventType?.slug || p.type || '';
  const eventType  = getEventType(slug);
  const calEventId = p.uid || String(p.id);
  const startTime  = p.startTime;
  const endTime    = p.endTime; // stored as completed_at

  if (!calEventId) {
    return { success: false, error: 'No event ID in payload' };
  }

  // Upsert to handle duplicate webhook deliveries gracefully
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .upsert({
      user_id:       userId,
      cal_event_id:  calEventId,
      event_type:    eventType,
      scheduled_at:  startTime,
      completed_at:  endTime,
      status:        'scheduled',
      reminder_sent: false,
      metadata: {
        attendee_email:    email,
        attendee_name:     extractAttendeeName(p),
        attendee_timezone: p.attendees?.[0]?.timeZone || null,
        cal_event_type_id: p.eventTypeId || null,
      },
    }, { onConflict: 'cal_event_id' })
    .select()
    .single();

  if (bookingError) {
    console.error('Error upserting booking:', bookingError);
    return { success: false, error: bookingError.message };
  }

  // Mark intro call used on profile
  if (eventType === 'intro') {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ intro_call_used: true })
      .eq('id', userId);
    if (profileError) console.error('Error marking intro_call_used:', profileError);
  }

  console.log(`✓ Booking created: ${booking.id} | user: ${userId} | type: ${eventType} | will remind: ${shouldSendReminder(eventType)}`);
  return { success: true, bookingId: booking.id };
}

async function handleBookingRescheduled(p) {
  const calEventId = p.uid || String(p.id);
  if (!calEventId) return { success: false, error: 'No event ID' };

  const { data: booking, error } = await supabase
    .from('bookings')
    .update({
      scheduled_at:  p.startTime,
      completed_at:  p.endTime,
      status:        'scheduled',
      reminder_sent: false, // reset — session hasn't happened yet at new time
    })
    .eq('cal_event_id', calEventId)
    .select()
    .single();

  if (error) {
    console.error('Error rescheduling booking:', error);
    return { success: false, error: error.message };
  }

  console.log(`✓ Booking rescheduled: ${booking.id}`);
  return { success: true, bookingId: booking.id };
}

async function handleBookingCancelled(p) {
  const calEventId = p.uid || String(p.id);
  if (!calEventId) return { success: false, error: 'No event ID' };

  // Fetch first so we can check event_type before updating
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('*')
    .eq('cal_event_id', calEventId)
    .single();

  if (fetchError) {
    console.error('Error fetching booking for cancellation:', fetchError);
    return { success: false, error: fetchError.message };
  }

  const { error: updateError } = await supabase
    .from('bookings')
    .update({
      status:        'cancelled',
      reminder_sent: true, // cancelled sessions must never trigger a reminder
    })
    .eq('cal_event_id', calEventId);

  if (updateError) {
    console.error('Error cancelling booking:', updateError);
    return { success: false, error: updateError.message };
  }

  // Reset intro_call_used if an intro booking was cancelled
  if (booking.event_type === 'intro') {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ intro_call_used: false })
      .eq('id', booking.user_id);
    if (profileError) console.error('Error resetting intro_call_used:', profileError);
    else console.log(`✓ Reset intro_call_used for user ${booking.user_id}`);
  }

  console.log(`✓ Booking cancelled: ${booking.id}`);
  return { success: true, bookingId: booking.id };
}

// ── Main handler ──────────────────────────────────────
export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Verify Cal.com signature using raw body
  const signature = event.headers['x-cal-signature-256'];
  if (!verifySignature(event.body, signature)) {
    console.error('Invalid webhook signature — request rejected');
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid signature' }) };
  }

  let envelope;
  try {
    envelope = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  // Cal.com wraps all payloads: { triggerEvent, createdAt, payload: {...} }
  const triggerEvent = envelope.triggerEvent;
  const payload      = envelope.payload || envelope; // fallback if unwrapped

  console.log(`Cal.com webhook received: ${triggerEvent}`);

  let result;
  try {
    switch (triggerEvent) {
      case 'BOOKING_CREATED':
        result = await handleBookingCreated(payload);
        break;
      case 'BOOKING_RESCHEDULED':
        result = await handleBookingRescheduled(payload);
        break;
      case 'BOOKING_CANCELLED':
        result = await handleBookingCancelled(payload);
        break;
      default:
        console.log(`Unhandled event type: ${triggerEvent}`);
        return { statusCode: 200, body: JSON.stringify({ received: true }) };
    }
  } catch (err) {
    console.error('Unhandled error in webhook handler:', err);
    // Return 200 so Cal.com doesn't retry endlessly
    return { statusCode: 200, body: JSON.stringify({ received: true, error: err.message }) };
  }

  if (!result.success) {
    console.error(`Failed to process ${triggerEvent}:`, result.error);
    // Return 200 to Cal.com — a 5xx causes aggressive retries
    return { statusCode: 200, body: JSON.stringify({ received: true, warning: result.error }) };
  }

  return { statusCode: 200, body: JSON.stringify({ success: true, ...result }) };
}
