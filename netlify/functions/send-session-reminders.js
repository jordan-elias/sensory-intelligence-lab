/**
 * /.netlify/functions/send-session-reminders.js
 *
 * Netlify scheduled function — runs every hour via cron.
 * Finds completed sessions where reminder_sent = false,
 * checks the user's notification_preferences,
 * sends a gentle post-session reflection email via Resend,
 * then marks reminder_sent = true.
 *
 * Add to netlify.toml:
 *   [functions."send-session-reminders"]
 *     schedule = "0 * * * *"
 */

import { createClient } from '@supabase/supabase-js';

// ── Config ────────────────────────────────────────────
const supabaseUrl        = process.env.SUPABASE_URL || 'https://lrjuufvrgkuvfxcmybtf.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const resendApiKey       = process.env.RESEND_API_KEY;
const SITE_URL           = process.env.SITE_URL || 'https://jordanelias.de';
const FROM_ADDRESS       = 'Jordan Elias <hello@jordanelias.de>';

// How many minutes after session end before sending the reminder.
// 30 minutes gives the user time to decompress first.
const DELAY_MINUTES = 30;

if (!supabaseServiceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
if (!resendApiKey)       throw new Error('RESEND_API_KEY not configured');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ── Email template ────────────────────────────────────
function buildEmail(attendeeName) {
  const firstName    = attendeeName ? attendeeName.split(' ')[0] : 'there';
  const worksheetUrl = `${SITE_URL}/worksheets/`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>How was your session?</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Georgia, serif;
      background: #f9f9f7;
      color: #1a1a1a;
      line-height: 1.75;
      padding: 40px 20px;
    }
    .wrapper {
      max-width: 520px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e5e5e0;
      padding: 48px 48px 40px;
    }
    .wordmark {
      font-family: Arial, sans-serif;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #6b6b6b;
      margin-bottom: 36px;
    }
    h1 {
      font-family: Georgia, serif;
      font-size: 22px;
      font-weight: normal;
      color: #1a1a1a;
      margin-bottom: 24px;
      line-height: 1.35;
    }
    p {
      font-size: 15px;
      color: #3a3a3a;
      margin-bottom: 18px;
    }
    .cta-wrap { margin: 32px 0; }
    .cta {
      display: inline-block;
      background: #2a5c45;
      color: #ffffff !important;
      text-decoration: none;
      font-family: Arial, sans-serif;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.03em;
      padding: 13px 28px;
    }
    .divider {
      border: none;
      border-top: 1px solid #e5e5e0;
      margin: 36px 0 24px;
    }
    .footer {
      font-family: Arial, sans-serif;
      font-size: 11px;
      color: #9b9b9b;
      line-height: 1.65;
    }
    .footer a { color: #9b9b9b; text-decoration: underline; }
    @media (max-width: 580px) {
      .wrapper { padding: 32px 24px 28px; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="wordmark">Sensory Intelligence Lab</div>

    <h1>How was your session today?</h1>

    <p>Hi ${firstName},</p>

    <p>I hope today's session left you with something to sit with.</p>

    <p>If you'd like to reflect on what came up while it's still fresh, there's a session reflection worksheet available. It's totally optional, but here if it feels useful for you:</p>

    <div class="cta-wrap">
      <a class="cta" href="${worksheetUrl}">Open session reflection →</a>
    </div>

    <p style="margin-bottom:0;">Warmly,<br>Jordan</p>

    <hr class="divider">

    <div class="footer">
      <p>You're receiving this because you had a session with Jordan today.</p>
      <p style="margin-top:8px;">You can manage your notification preferences in your <a href="${SITE_URL}/account/">account settings</a>.</p>
    </div>
  </div>
</body>
</html>`;

  const text = `Hi ${firstName},

I hope today's session left you with something to sit with.

If you'd like to reflect on what came up while it's still fresh, there's a session reflection worksheet available. It's totally optional, but here if it feels useful for you:

${worksheetUrl}

Warm regards,
Jordan

---
You're receiving this because you had a session with Jordan Elias Music Therapy today.
Manage your notification preferences: ${SITE_URL}/account/`;

  return { html, text };
}

// ── Send via Resend ───────────────────────────────────
async function sendReminderEmail({ to, name }) {
  const { html, text } = buildEmail(name);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    FROM_ADDRESS,
      to:      [to],
      subject: 'How was your session today?',
      html,
      text,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error (${res.status}): ${err}`);
  }

  return res.json();
}

// ── Main handler ──────────────────────────────────────
export async function handler() {
  console.log('send-session-reminders: starting run at', new Date().toISOString());

  const now         = new Date();
  // Upper bound: sessions that ended more than DELAY_MINUTES ago
  const windowEnd   = new Date(now.getTime() - DELAY_MINUTES * 60 * 1000).toISOString();
  // Lower bound: don't email about sessions that ended more than 24 hours ago —
  // prevents a backlog of old rows from firing if the function was paused
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // Fetch eligible bookings
  const { data: bookings, error: fetchError } = await supabase
    .from('bookings')
    .select('id, user_id, event_type, completed_at, metadata')
    .eq('status', 'scheduled')
    .eq('reminder_sent', false)
    .in('event_type', ['session', 'subscriber-session'])
    .gte('completed_at', windowStart)
    .lte('completed_at', windowEnd);

  if (fetchError) {
    console.error('Error fetching bookings:', fetchError);
    return { statusCode: 500, body: JSON.stringify({ error: fetchError.message }) };
  }

  if (!bookings?.length) {
    console.log('No sessions to remind');
    return { statusCode: 200, body: JSON.stringify({ sent: 0, failed: 0, skipped: 0 }) };
  }

  console.log(`Found ${bookings.length} session(s) to remind`);

  let sent = 0, failed = 0, skipped = 0;

  for (const booking of bookings) {
    // Fetch email + notification preferences together
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, notification_preferences')
      .eq('id', booking.user_id)
      .single();

    if (profileError || !profile?.email) {
      console.error(`No profile found for user ${booking.user_id}`);
      failed++;
      continue;
    }

    // Check opt-out. Use !== false so that null (no prefs set yet) defaults to sending —
    // existing users haven't had a chance to set preferences and should keep receiving emails.
    const prefs = profile.notification_preferences;
    if (prefs !== null && prefs?.post_session_reminder === false) {
      console.log(`Skipping reminder for ${profile.email} (booking ${booking.id}) — opted out`);
      // Mark reminder_sent so this row isn't re-evaluated on the next hourly run
      await supabase
        .from('bookings')
        .update({ reminder_sent: true, reminder_sent_at: new Date().toISOString() })
        .eq('id', booking.id);
      skipped++;
      continue;
    }

    const email = profile.email;
    const name  = booking.metadata?.attendee_name || null;

    try {
      await sendReminderEmail({ to: email, name });

      // Mark sent — reminder_sent_at records exactly when it was sent
      const { error: updateError } = await supabase
        .from('bookings')
        .update({
          reminder_sent:    true,
          reminder_sent_at: new Date().toISOString(),
        })
        .eq('id', booking.id);

      if (updateError) {
        // Log but don't decrement sent — the email went out, just the flag failed
        console.error(`Failed to mark reminder_sent for booking ${booking.id}:`, updateError);
      } else {
        console.log(`✓ Reminder sent → ${email} (booking ${booking.id})`);
        sent++;
      }
    } catch (err) {
      // Don't mark reminder_sent — it will retry on the next hourly run
      console.error(`Failed to send to ${email}:`, err.message);
      failed++;
    }
  }

  console.log(`send-session-reminders: done — sent: ${sent}, skipped: ${skipped}, failed: ${failed}`);
  return { statusCode: 200, body: JSON.stringify({ sent, skipped, failed }) };
}
