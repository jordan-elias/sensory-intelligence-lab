/**
 * /assets/js/api.js
 * The one place that knows where server functions live. On the website that is the same
 * origin; inside an installed app (Capacitor) the page origin differs, so set
 * window.SIL_API_BASE before this loads, e.g. 'https://www.example.com'.
 */
export const API_BASE = (typeof window !== 'undefined' && window.SIL_API_BASE) || '';

export async function post(name, body = {}) {
  const sb = window._supabase;
  const { data: { session } = {} } = await sb.auth.getSession();
  if (!session) throw new Error('Please sign in again.');
  const res = await fetch(`${API_BASE}/.netlify/functions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
