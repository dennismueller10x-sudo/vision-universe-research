// HTTP-Grundlagen: Antworten, CORS, Cookies, CSRF, Koerper mit Groessengrenze.

export class HttpError extends Error {
  constructor(status, state, detail) {
    super(state);
    this.status = status;
    this.state = state;
    this.detail = detail;
  }
}

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

export function corsHeaders(request, cfg) {
  const origin = request.headers.get('Origin');
  if (!origin || !cfg.allowedOrigins.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-VU-Client',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

export function json(request, cfg, status, body, {cookies = [], headers = {}} = {}) {
  const h = new Headers({...SECURITY_HEADERS, ...corsHeaders(request, cfg), 'Content-Type': 'application/json; charset=utf-8', ...headers});
  for (const c of cookies) h.append('Set-Cookie', c);
  return new Response(status === 204 ? null : JSON.stringify(body), {status, headers: h});
}

export function redirect(location, {cookies = []} = {}) {
  const h = new Headers({...SECURITY_HEADERS, Location: location});
  for (const c of cookies) h.append('Set-Cookie', c);
  return new Response(null, {status: 303, headers: h});
}

export function preflight(request, cfg) {
  const origin = request.headers.get('Origin');
  if (!origin || !cfg.allowedOrigins.has(origin)) return json(request, cfg, 403, {state: 'ORIGIN_NOT_ALLOWED'});
  return new Response(null, {status: 204, headers: {...SECURITY_HEADERS, ...corsHeaders(request, cfg)}});
}

export function parseCookies(request) {
  const out = {};
  for (const part of String(request.headers.get('Cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const name = part.slice(0, i).trim();
    if (!(name in out)) out[name] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function cookie(cfg, name, value, maxAge) {
  const attrs = [`${cfg.cookies.prefix}${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.max(0, Math.floor(maxAge))}`];
  if (cfg.cookies.secure) attrs.push('Secure');
  return attrs.join('; ');
}

export const clearCookie = (cfg, name) => cookie(cfg, name, '', 0);
export const cookieValue = (cfg, cookies, name) => cookies[cfg.cookies.prefix + name] || '';

// Zustandsaendernde Anfragen mit Cookie-Sitzung: erlaubte Herkunft UND eigener
// Kopf (erzwingt CORS-Preflight; ein fremdes Formular kann ihn nicht setzen).
// Bearer-Anfragen (App) tragen kein Cookie-Risiko.
export function assertCsrf(request, cfg, {bearer}) {
  if (bearer || ['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const origin = request.headers.get('Origin');
  if (!origin || !cfg.allowedOrigins.has(origin)) throw new HttpError(403, 'ORIGIN_NOT_ALLOWED');
  if (request.headers.get('X-VU-Client') !== 'web') throw new HttpError(403, 'CLIENT_HEADER_REQUIRED');
}

export async function readJson(request, maxBytes = 8192) {
  const type = request.headers.get('Content-Type') || '';
  if (!/^application\/json\b/i.test(type)) throw new HttpError(415, 'JSON_REQUIRED');
  const text = await readText(request, maxBytes);
  try {
    const value = JSON.parse(text || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('shape');
    return value;
  } catch { throw new HttpError(400, 'JSON_INVALID'); }
}

export async function readText(request, maxBytes) {
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > maxBytes) throw new HttpError(413, 'BODY_TOO_LARGE');
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) throw new HttpError(413, 'BODY_TOO_LARGE');
  return text;
}

export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || '';
}
