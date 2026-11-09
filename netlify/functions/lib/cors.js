/**
 * Lets the future Android app (Capacitor) call these functions from its own origin.
 * Only the app's fixed origins and the site itself are allowed; the browser's normal same-origin calls are unchanged.
 * Sign-in still comes from the Authorization header, so allowing an origin does not allow anyone in.
 */
export const ALLOWED_ORIGINS = ['https://localhost', 'capacitor://localhost', 'http://localhost'];

export function corsHeaders(origin) {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

export function withCors(handler) {
  return async (event, context) => {
    const origin = event?.headers?.origin || event?.headers?.Origin;
    const extra = corsHeaders(origin);
    if (event?.httpMethod === 'OPTIONS') return { statusCode: Object.keys(extra).length ? 204 : 403, headers: extra, body: '' };
    const res = await handler(event, context);
    return res && Object.keys(extra).length ? { ...res, headers: { ...(res.headers || {}), ...extra } } : res;
  };
}
