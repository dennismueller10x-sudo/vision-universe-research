import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { handle } from '../src/index.mjs';

const host = 'https://research.visionuniverse.de';
const env = { RESEARCH_ACCESS_PASSWORD: randomBytes(32).toString('hex') };
let originCalls = 0;
const origin = async request => {
  originCalls++;
  return new Response(request.headers.get('Cookie') || 'Research origin', {
    headers: {'Cache-Control': 'public, max-age=600', 'CDN-Cache-Control': 'public, max-age=600'},
  });
};
const get = (path, cookie, config = env) => handle(new Request(host + path, {
  headers: cookie ? {Cookie: cookie} : {},
}), config, origin);
const login = (password, next = '/', originHeader = host) => handle(new Request(host + '/__research/login', {
  method: 'POST', headers: {Origin: originHeader, 'Content-Type': 'application/x-www-form-urlencoded'},
  body: new URLSearchParams({password, next}),
}), env, origin);
const accessCookie = async () => (await login(env.RESEARCH_ACCESS_PASSWORD)).headers.get('Set-Cookie').split(';')[0];

test('every page, future route, data file and asset is gated before origin access', async () => {
  const before = originCalls;
  for (const path of ['/', '/discover', '/quant/', '/supertrader', '/screener', '/markets', '/stocks/AAPL',
    '/future/deep/route', '/quant/index.html', '/quant/data/sec/inspector/AAPL.json', '/assets/site.css', '/script.js',
    '/font.woff2', '/image.png', '/_next/data/build/private.json', '/__research/unknown']) {
    const result = await get(path);
    assert.equal(result.status, 303, path);
    assert.ok(result.headers.get('Location').startsWith('/__research/login?next='));
    assert.match(result.headers.get('Cache-Control'), /no-store/);
  }
  assert.equal(originCalls, before);
});

test('login page works without assets or JavaScript and supports password managers', async () => {
  const result = await get('/__research/login?next=%2Fstocks%2FAAPL');
  assert.equal(result.status, 200);
  const html = await result.text();
  assert.match(html, /VISION UNIVERSE/);
  assert.match(html, /Zugang öffnen/);
  assert.match(html, /autocomplete="current-password"/);
  assert.match(html, /type="password"/);
  assert.match(html, /font-size:16px/);
  assert.doesNotMatch(html, /<script|<link|https:\/\//);
  assert.ok(!html.includes(env.RESEARCH_ACCESS_PASSWORD));
});

test('wrong or empty password never sets a cookie or opens origin', async () => {
  for (const password of ['wrong', '']) {
    const result = await login(password);
    assert.equal(result.status, 401);
    assert.equal(result.headers.get('Set-Cookie'), null);
    assert.match(await result.text(), /Passwort nicht korrekt\./);
  }
});

test('correct password opens original deep link with persistent secure host cookie', async () => {
  const result = await login(env.RESEARCH_ACCESS_PASSWORD, '/stocks/AAPL?view=history');
  assert.equal(result.status, 303);
  assert.equal(result.headers.get('Location'), '/stocks/AAPL?view=history');
  const cookie = result.headers.get('Set-Cookie');
  for (const attribute of ['__Host-research_access=', 'Path=/', 'Max-Age=2592000', 'Expires=', 'HttpOnly', 'Secure', 'SameSite=Lax']) {
    assert.ok(cookie.includes(attribute), attribute);
  }
  assert.doesNotMatch(cookie, /Domain=/);
  assert.ok(!cookie.includes(env.RESEARCH_ACCESS_PASSWORD));
});

test('navigation, assets, APIs and reload keep access; token is never sent upstream', async () => {
  const cookie = await accessCookie();
  for (const path of ['/', '/discover', '/quant', '/stocks/AAPL', '/assets/site.css', '/script.js', '/api/history', '/quant']) {
    const result = await get(path, cookie + '; unrelated=kept');
    assert.equal(result.status, 200);
    assert.equal(await result.text(), 'unrelated=kept');
    assert.equal(result.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(result.headers.get('CDN-Cache-Control'), null);
  }
});

test('fresh browser or deleted cookie requires login again', async () => {
  assert.equal((await get('/quant', await accessCookie())).status, 200);
  assert.equal((await get('/quant')).status, 303);
  assert.equal((await get('/quant', '__Host-research_access=')).status, 303);
});

test('logout only clears access cookie and returns to login', async () => {
  assert.equal((await get('/__research/logout')).status, 200);
  const result = await handle(new Request(host + '/__research/logout', {
    method: 'POST', headers: {Origin: host, Cookie: await accessCookie()},
  }), env, origin);
  assert.equal(result.status, 303);
  assert.equal(result.headers.get('Location'), '/__research/login');
  assert.match(result.headers.get('Set-Cookie'), /__Host-research_access=; Path=\/; Max-Age=0;/);
  assert.equal((await get('/')).status, 303);
});

test('sensitive APIs including status and preflight have no unauthenticated exception', async () => {
  for (const path of ['/api', '/api/history', '/api/intraday', '/api/status', '/api/future']) {
    const result = await get(path);
    assert.equal(result.status, 401);
    assert.deepEqual(await result.json(), {error: 'Zugang erforderlich.'});
  }
  const result = await handle(new Request(host + '/api/history', {method: 'OPTIONS'}), env, origin);
  assert.equal(result.status, 401);
});

test('forged, expired, duplicate and password-rotated sessions remain locked', async () => {
  const cookie = await accessCookie();
  const tampered = cookie.slice(0, -1) + (cookie.endsWith('0') ? '1' : '0');
  for (const candidate of [tampered, cookie.replace(/v1\.\d{10}/, 'v1.1000000000'), `${cookie}; ${cookie}`,
    '__Host-research_access=true', '__Host-research_access=v1.invalid']) {
    assert.equal((await get('/quant', candidate)).status, 303);
  }
  assert.equal((await get('/quant', cookie, {RESEARCH_ACCESS_PASSWORD: randomBytes(32).toString('hex')})).status, 303);
  // Advance the clock rather than just breaking the signature.
  const now = Date.now;
  try {
    Date.now = () => now() + 31 * 24 * 60 * 60 * 1000;
    assert.equal((await get('/quant', cookie)).status, 303);
  } finally { Date.now = now; }
});

test('missing secret fails closed even with a formerly valid cookie', async () => {
  const cookie = await accessCookie();
  for (const path of ['/', '/__research/login', '/assets/site.css', '/api/history']) {
    assert.equal((await get(path, cookie, {})).status, 503);
  }
});

test('external redirects and cross-site login/logout are rejected', async () => {
  for (const next of ['https://evil.example', '//evil.example', '///', '/\\evil.example', '/\r\nevil', '/__research/login', '/__research/logout']) {
    assert.equal((await login(env.RESEARCH_ACCESS_PASSWORD, next)).headers.get('Location'), '/');
  }
  assert.equal((await login(env.RESEARCH_ACCESS_PASSWORD, '/', 'https://evil.example')).status, 403);
  assert.equal((await login(env.RESEARCH_ACCESS_PASSWORD, '/', '')).status, 403);
  const result = await handle(new Request(host + '/__research/logout', {method: 'POST', headers: {Origin: 'https://evil.example'}}), env, origin);
  assert.equal(result.status, 403);
});

test('oversized and invalid login payloads fail without a technical error', async () => {
  assert.equal((await login('x'.repeat(9000))).status, 401);
  const result = await handle(new Request(host + '/__research/login', {
    method: 'POST', headers: {Origin: host, 'Content-Type': 'application/json'}, body: '{}',
  }), env, origin);
  assert.equal(result.status, 401);
  assert.match(await result.text(), /Passwort nicht korrekt\./);
});

test('HTTPS is mandatory and worker cannot serve another domain', async () => {
  const result = await handle(new Request('http://research.visionuniverse.de/quant?view=test'), env, origin);
  assert.equal(result.status, 308);
  assert.equal(result.headers.get('Location'), host + '/quant?view=test');
  assert.equal((await handle(new Request('https://other.example/'), env, origin)).status, 404);
});

test('authenticated login avoids loops and origin redirects are preserved', async () => {
  const cookie = await accessCookie();
  const result = await get('/__research/login?next=%2Fquant', cookie);
  assert.equal(result.status, 303);
  assert.equal(result.headers.get('Location'), '/quant');
  const moved = await handle(new Request(host + '/discover', {headers: {Cookie: cookie}}), env,
    async request => {
      assert.equal(request.redirect, 'manual');
      return new Response(null, {status: 301, headers: {Location: '/discover/'}});
    });
  assert.equal(moved.status, 301);
  assert.equal(moved.headers.get('Location'), '/discover/');
});
