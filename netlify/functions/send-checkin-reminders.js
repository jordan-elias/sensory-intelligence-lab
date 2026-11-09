/**
 * /.netlify/functions/send-checkin-reminders.js
 * Scheduled once a day. Sends a short, generic nudge to people who switched on "Daily check-in reminder".
 * Opt-in only (off unless notification_preferences.checkin_reminder is true). The email never contains anything
 * about the person's check-ins, and people who already checked in recently are skipped.
 */
import { createClient } from '@supabase/supabase-js';

const SITE_URL = process.env.SITE_URL || 'https://lab.jordanelias.de';
const FROM_ADDRESS = 'Jordan Elias <hello@jordanelias.de>';
const QUIET_HOURS = 20;   // anyone with a check-in in the last 20 hours is skipped

export function buildEmail() {
  const url = `${SITE_URL}/checkin/`;
  const text = `A quiet moment to notice how you are.\n\nIf it feels useful, a check-in takes about a minute:\n${url}\n\n---\nYou chose to receive this reminder. Turn it off any time in your account settings: ${SITE_URL}/account/`;
  const html = `<p style="font:15px/1.7 Georgia,serif;color:#1a1a1a">A quiet moment to notice how you are.</p>
<p style="font:15px/1.7 Georgia,serif;color:#1a1a1a">If it feels useful, a check-in takes about a minute.</p>
<p><a href="${url}" style="display:inline-block;background:#2a5c45;color:#fff;text-decoration:none;padding:12px 26px;border-radius:4px;font:500 14px sans-serif">Open check-in</a></p>
<p style="font:12px/1.6 sans-serif;color:#6b6b6b">You chose to receive this reminder. Turn it off any time in your <a href="${SITE_URL}/account/" style="color:#2a5c45">account settings</a>.</p>`;
  return { subject: 'A moment to check in', html, text };
}

export function makeHandler(supabase, send, nowFn = () => new Date()) {
  return async function handler() {
    const since = new Date(nowFn().getTime() - QUIET_HOURS * 3600 * 1000).toISOString();
    const { data: people, error } = await supabase.from('profiles').select('id, email')
      .eq('notification_preferences->>checkin_reminder', 'true');
    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    let sent = 0, skipped = 0, failed = 0;
    for (const p of people || []) {
      if (!p.email) { skipped++; continue; }
      const { data: recent, error: e2 } = await supabase.from('checkins').select('id').eq('user_id', p.id).gte('created_at', since).limit(1);
      if (e2) { failed++; continue; }
      if (recent && recent.length) { skipped++; continue; }
      try { await send(p.email, buildEmail()); sent++; } catch (e) { console.error('reminder failed:', e.message); failed++; }
    }
    return { statusCode: 200, body: JSON.stringify({ sent, skipped, failed }) };
  };
}

async function resend(to, { subject, html, text }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html, text }),
  });
  if (!res.ok) throw new Error(`Resend error (${res.status})`);
}

export const handler = (event, context) =>
  makeHandler(createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY), resend)(event, context);
