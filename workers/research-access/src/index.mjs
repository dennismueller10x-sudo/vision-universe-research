const HOST = 'research.visionuniverse.de';
const LOGIN = '/__research/login';
const LOGOUT = '/__research/logout';
const COOKIE = '__Host-research_access';
const DURATION = 30 * 24 * 60 * 60;
const encoder = new TextEncoder();

function response(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    ...headers,
  }});
}

const escape = value => value.replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));

function nextPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || /[\\\r\n]/.test(value)) return '/';
  try {
    const url = new URL(value, `https://${HOST}`);
    if (url.origin !== `https://${HOST}` || url.pathname.startsWith('/__research/')) return '/';
    return url.pathname + url.search + url.hash;
  } catch { return '/'; }
}

function page(next, message = '', status = 200, reset = false) {
  return response(`<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>VISION UNIVERSE · Research</title>
<style>
:root{color-scheme:dark;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
*{box-sizing:border-box}body{margin:0;min-height:100vh;min-height:100svh;background:#090b10;color:#f4f4f5;display:grid;place-items:center;padding:24px}
main{width:100%;max-width:360px}h1{font-size:20px;letter-spacing:.13em;margin:0 0 8px;border-left:3px solid #d53240;padding-left:12px}
h2{font-size:28px;font-weight:500;margin:0 0 20px}p{font-size:14px;color:#a9abb4;line-height:1.6}label{display:block;font-size:14px;margin:24px 0 8px}
input,button{font:inherit;min-height:48px;width:100%;border-radius:8px}input{font-size:16px;background:#14171e;border:1px solid #383c47;color:inherit;padding:12px}
button{margin-top:16px;border:1px solid #d53240;background:#bd2836;color:white;font-weight:600;cursor:pointer;padding:12px}
input:focus-visible,button:focus-visible{outline:2px solid #ed6571;outline-offset:3px}.error{color:#ff9aa3;margin-bottom:0}
</style></head><body><main><h1>VISION UNIVERSE</h1><h2>Research</h2>
<p>Dieser Bereich befindet sich derzeit in Entwicklung.</p>
<form method="post" action="">
${reset ? '' : `<input type="hidden" name="next" value="${escape(next)}"><label for="password">Passwort</label><input id="password" name="password" type="password" autocomplete="current-password" required>`}
${message ? `<p class="error" role="alert">${escape(message)}</p>` : ''}
<button type="submit">${reset ? 'Zugang zurücksetzen' : 'Zugang öffnen'}</button></form></main></body></html>`, status);
}

function hex(bytes) {
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

async function key(password) {
  return crypto.subtle.importKey('raw', encoder.encode(`research-access-v1:${password}`),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function passwordMatches(candidate, password) {
  const [a, b] = await Promise.all([candidate, password].map(value => crypto.subtle.digest('SHA-256', encoder.encode(value))));
  const first = new Uint8Array(a), second = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < first.length; i++) difference |= first[i] ^ second[i];
  return difference === 0;
}

async function session(password) {
  const expiry = Math.floor(Date.now() / 1000) + DURATION;
  const nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `v1.${expiry}.${nonce}`;
  const signature = hex(await crypto.subtle.sign('HMAC', await key(password), encoder.encode(payload)));
  return `${payload}.${signature}`;
}

async function validSession(request, password) {
  const cookies = (request.headers.get('Cookie') || '').split(';').map(c => c.trim());
  const found = cookies.filter(c => c.startsWith(`${COOKIE}=`));
  if (found.length !== 1) return false;
  const token = found[0].slice(COOKIE.length + 1);
  const match = /^(v1\.(\d{10})\.[a-f0-9]{32})\.([a-f0-9]{64})$/.exec(token);
  if (!match) return false;
  const expiry = Number(token.split('.')[1]), now = Math.floor(Date.now() / 1000);
  if (expiry <= now || expiry > now + DURATION) return false;
  const signature = Uint8Array.from(match[3].match(/../g), part => parseInt(part, 16));
  return crypto.subtle.verify('HMAC', await key(password), signature, encoder.encode(match[1]));
}

function cookie(value, duration) {
  const expires = new Date(duration === 0 ? 0 : Date.now() + duration * 1000).toUTCString();
  return `${COOKIE}=${value}; Path=/; Max-Age=${duration}; Expires=${expires}; HttpOnly; Secure; SameSite=Lax`;
}

function redirect(path, headers = {}) {
  return response(null, 303, { Location: path, ...headers });
}

async function form(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded')) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks = []; let size = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8192) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new URLSearchParams(new TextDecoder().decode(bytes));
}

// On a Cloudflare zone route, fetch(request) reaches the existing origin rather
// than recursively invoking this Worker. Do not use a Worker Custom Domain here.
export async function handle(request, env, originFetch = fetch) {
  const url = new URL(request.url);
  if (url.hostname !== HOST) return response('Nicht gefunden.', 404);
  if (url.protocol !== 'https:') return response(null, 308, { Location: `https://${HOST}${url.pathname}${url.search}` });
  const password = env.RESEARCH_ACCESS_PASSWORD;
  // Missing configuration must never expose the origin.
  if (typeof password !== 'string' || !password.length) return response('Der Zugang ist derzeit nicht verfügbar.', 503);
  if (request.method === 'POST' && (url.pathname === LOGIN || url.pathname === LOGOUT)) {
    if (request.headers.get('Origin') !== `https://${HOST}`) return response('Diese Anfrage ist nicht möglich.', 403);
    if (url.pathname === LOGOUT) return redirect(LOGIN, { 'Set-Cookie': cookie('', 0) });
    const data = await form(request);
    const next = nextPath(data?.get('next'));
    if (!data || !await passwordMatches(data.get('password') || '', password)) return page(next, 'Passwort nicht korrekt.', 401);
    return redirect(next, { 'Set-Cookie': cookie(await session(password), DURATION) });
  }
  const authenticated = await validSession(request, password);
  if (url.pathname === LOGIN && (request.method === 'GET' || request.method === 'HEAD')) {
    const next = nextPath(url.searchParams.get('next'));
    return authenticated ? redirect(next) : page(next);
  }
  if (url.pathname === LOGOUT && (request.method === 'GET' || request.method === 'HEAD')) return page('/', '', 200, true);
  if (!authenticated) {
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return response(JSON.stringify({error: 'Zugang erforderlich.'}), 401, {'Content-Type': 'application/json; charset=utf-8'});
    return redirect(`${LOGIN}?next=${encodeURIComponent(nextPath(url.pathname + url.search))}`);
  }
  const headers = new Headers(request.headers);
  // Keep unrelated cookies; never forward our access token to GitHub Pages.
  const remaining = (headers.get('Cookie') || '').split(';').filter(c => !c.trim().startsWith(`${COOKIE}=`)).join(';').trim();
  if (remaining) headers.set('Cookie', remaining); else headers.delete('Cookie');
  const upstream = await originFetch(new Request(request, { headers, redirect: 'manual' }));
  const result = new Response(upstream.body, upstream);
  result.headers.set('Cache-Control', 'private, no-store');
  result.headers.delete('CDN-Cache-Control');
  result.headers.delete('Cloudflare-CDN-Cache-Control');
  return result;
}

export default { fetch: (request, env) => handle(request, env) };
