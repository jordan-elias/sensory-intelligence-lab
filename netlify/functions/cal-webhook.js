/**
 * /.netlify/functions/cal-webhook.js
 *
 * Cal.com webhook handler for booking lifecycle events.
 * Handles: booking.created, booking.rescheduled, booking.cancelled
 *
 * Configure webhook in Cal.com:
 * URL: https://yourdomain.com/.netlify/functions/cal-webhook
 * Events: Subscribe to all booking events
 * Secret: Set in environment variable CAL_WEBHOOK_SECRET
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase admin client
const supabaseUrl = process.env.SUPABASE_URL || 'https://lrjuufvrgkuvfxcmybtf.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Webhook secret for verification (optional but recommended)
const WEBHOOK_SECRET = process.env.CAL_WEBHOOK_SECRET;

/**
 * Map Cal.com event type URLs to our internal event_type field
 */
function getEventType(calEventTypeUrl) {
  if (!calEventTypeUrl) return 'unknown';
  
  const url = calEventTypeUrl.toLowerCase();
  
  if (url.includes('/intro')) return 'intro';
  if (url.includes('/subscriber-session')) return 'subscriber-session';
  if (url.includes('/session')) return 'session';
  
  return 'unknown';
}

/**
 * Extract user email from booking payload
 */
function extractUserEmail(payload) {
  // Cal.com webhook payload structure varies slightly depending on version
  // Common paths: payload.responses.email, payload.attendees[0].email
  
  if (payload.responses?.email) return payload.responses.email;
  if (payload.attendees?.[0]?.email) return payload.attendees[0].email;
  if (payload.organizer?.email) return payload.organizer.email;
  
  return null;
}

/**
 * Find user by email in profiles table
 */
async function findUserByEmail(email) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single();
  
  if (error) {
    console.error('Error finding user by email:', error);
    return null;
  }
  
  return data?.id;
}

/**
 * Handle booking.created event
 */
async function handleBookingCreated(payload) {
  const email = extractUserEmail(payload);
  
  if (!email) {
    console.error('No email found in booking payload');
    return { success: false, error: 'No email in payload' };
  }
  
  const userId = await findUserByEmail(email);
  
  if (!userId) {
    console.error(`User not found for email: ${email}`);
    return { success: false, error: 'User not found' };
  }
  
  const eventType = getEventType(payload.eventTypeUrl || payload.eventType?.slug);
  
  // Insert booking record
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      user_id: userId,
      cal_event_id: payload.uid || payload.id,
      event_type: eventType,
      scheduled_at: payload.startTime,
      status: 'scheduled',
      metadata: {
        cal_event_type_id: payload.eventTypeId,
        cal_booking_url: payload.bookingUrl,
        attendee_timezone: payload.attendees?.[0]?.timeZone,
      },
    })
    .select()
    .single();
  
  if (bookingError) {
    console.error('Error inserting booking:', bookingError);
    return { success: false, error: bookingError.message };
  }
  
  // If this is an intro call, mark intro_call_used = true
  if (eventType === 'intro') {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ intro_call_used: true })
      .eq('id', userId);
    
    if (profileError) {
      console.error('Error marking intro call used:', profileError);
    }
  }
  
  console.log(`✓ Booking created: ${booking.id} for user ${userId}`);
  return { success: true, bookingId: booking.id };
}

/**
 * Handle booking.rescheduled event
 */
async function handleBookingRescheduled(payload) {
  const calEventId = payload.uid || payload.id;
  
  if (!calEventId) {
    console.error('No event ID in reschedule payload');
    return { success: false, error: 'No event ID' };
  }
  
  const { data: booking, error } = await supabase
    .from('bookings')
    .update({
      scheduled_at: payload.startTime,
      metadata: {
        cal_booking_url: payload.bookingUrl,
        rescheduled_at: new Date().toISOString(),
      },
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

/**
 * Handle booking.cancelled event
 */
async function handleBookingCancelled(payload) {
  const calEventId = payload.uid || payload.id;
  
  if (!calEventId) {
    console.error('No event ID in cancel payload');
    return { success: false, error: 'No event ID' };
  }
  
  // Get the booking to check event type before updating
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('*')
    .eq('cal_event_id', calEventId)
    .single();
  
  if (fetchError) {
    console.error('Error fetching booking for cancellation:', fetchError);
    return { success: false, error: fetchError.message };
  }
  
  // Update booking status to cancelled
  const { error: updateError } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      metadata: {
        ...booking.metadata,
        cancelled_at: new Date().toISOString(),
      },
    })
    .eq('cal_event_id', calEventId);
  
  if (updateError) {
    console.error('Error cancelling booking:', updateError);
    return { success: false, error: updateError.message };
  }
  
  // If this was an intro call, flip intro_call_used back to false
  if (booking.event_type === 'intro') {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ intro_call_used: false })
      .eq('id', booking.user_id);
    
    if (profileError) {
      console.error('Error resetting intro_call_used:', profileError);
    } else {
      console.log(`✓ Reset intro_call_used for user ${booking.user_id}`);
    }
  }
  
  console.log(`✓ Booking cancelled: ${booking.id}`);
  return { success: true, bookingId: booking.id };
}

/**
 * Main handler
 */
export async function handler(event) {
  // Only accept POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }
  
  try {
    const payload = JSON.parse(event.body);
    
    // Optional: Verify webhook signature if secret is configured
    if (WEBHOOK_SECRET) {
      const signature = event.headers['x-cal-signature'] || event.headers['X-Cal-Signature'];
      // Cal.com signature verification would go here
      // For now, we'll skip this but you should implement it in production
    }
    
    // Cal.com sends events with triggerEvent field
    const eventType = payload.triggerEvent;
    
    console.log(`Received Cal.com webhook: ${eventType}`);
    console.log('Payload:', JSON.stringify(payload, null, 2));
    
    let result;
    
    switch (eventType) {
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
        console.log(`Unhandled event type: ${eventType}`);
        return {
          statusCode: 200,
          body: JSON.stringify({ received: true, message: 'Event type not handled' }),
        };
    }
    
    if (!result.success) {
      console.error(`Failed to process ${eventType}:`, result.error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: result.error }),
      };
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, ...result }),
    };
    
  } catch (error) {
    console.error('Webhook error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
