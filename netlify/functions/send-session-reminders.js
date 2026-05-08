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
const SITE_URL           = process.env.SITE_URL || 'https://lab.jordanelias.de';
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
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600&family=Inter:wght@400;500&family=Lora:ital@0;1&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background-color: #f9f9f7;
      margin: 0;
      padding: 0;
      color: #1a1a1a;
    }
    .container {
      max-width: 520px;
      margin: 40px auto;
      background: #ffffff;
      border-radius: 4px;
      overflow: hidden;
      border: 1px solid #e5e5e0;
    }
    .header {
      background-color: #2a5c45;
      padding: 28px 40px;
      text-align: center;
    }
    .header h1 {
      font-family: 'Space Grotesk', sans-serif;
      color: #ffffff;
      font-size: 20px;
      font-weight: 400;
      margin: 0;
      letter-spacing: 0.3px;
    }
    .body {
      padding: 40px;
      color: #1a1a1a;
    }
    .body p {
      font-family: 'Lora', Georgia, serif;
      font-size: 15px;
      line-height: 1.7;
      margin: 0 0 18px;
      color: #1a1a1a;
    }
    .cta-wrap {
      text-align: center;
      margin: 32px 0;
    }
    .cta {
      display: inline-block;
      background-color: #2a5c45;
      color: #ffffff !important;
      text-decoration: none;
      padding: 13px 30px;
      border-radius: 4px;
      font-family: 'Inter', sans-serif;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.2px;
    }
    .footer {
      background-color: #f9f9f7;
      border-top: 1px solid #e5e5e0;
      padding: 20px 40px;
      text-align: center;
      font-family: 'Inter', sans-serif;
      font-size: 12px;
      color: #6b6b6b;
      line-height: 1.65;
    }
    .footer a { color: #2a5c45; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Sensory Intelligence Lab</h1>
    </div>
    <div class="body">
      <p>Hi ${firstName},</p>
      <p>I hope today's session left you with something to sit with.</p>
      <p>If you'd like to reflect on what came up while it's still fresh, there's a session reflection worksheet available. It's optional, but here if it feels useful:</p>
      <div class="cta-wrap">
        <a class="cta" href="${worksheetUrl}">Open session reflection →</a>
      </div>
      <p>Warm regards,<br>Jordan</p>
    </div>
    <div class="footer">
      You're receiving this because you had a session today.
      You can manage your notification preferences in your
      <a href="${SITE_URL}/account/">account settings</a>.
    </div>
  </div>
</body>
</html>`;

  const text = `Hi ${firstName},

I hope today's session left you with something to sit with.

If you'd like to reflect on what came up while it's still fresh, there's a session reflection worksheet available. It's optional, but here if it feels useful:

${worksheetUrl}

Warm regards,
Jordan

---
You're receiving this because you had a session today.
Manage notification preferences: ${SITE_URL}/account/`;

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

  const now = new Date();

  // Use scheduled_at as proxy for session end time.
  // A session is considered "done" once scheduled_at + SESSION_DURATION_MINUTES has passed.
  // We then wait an additional DELAY_MINUTES before sending.
  // Upper bound: sessions whose end time was at least DELAY_MINUTES ago
  //   → scheduled_at <= now - SESSION_DURATION_MINUTES - DELAY_MINUTES
  const SESSION_DURATION_MINUTES = 50;
  const windowEnd   = new Date(
    now.getTime() - (SESSION_DURATION_MINUTES + DELAY_MINUTES) * 60 * 1000
  ).toISOString();
  // Lower bound: don't email about sessions from more than 25 hours ago —
  // guards against backlog if the function was paused or redeployed
  const windowStart = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();

  // Fetch eligible bookings
  const { data: bookings, error: fetchError } = await supabase
    .from('bookings')
    .select('id, user_id, event_type, scheduled_at, metadata')
    .eq('status', 'scheduled')
    .eq('reminder_sent', false)
    .in('event_type', ['session', 'subscriber-session'])
    .gte('scheduled_at', windowStart)
    .lte('scheduled_at', windowEnd);

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
