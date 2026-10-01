import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handle } from '../src/index.mjs';

const require = createRequire(import.meta.url);
const { chromium, webkit, devices } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const canonical = 'https://research.visionuniverse.de';
const env = { RESEARCH_ACCESS_PASSWORD: randomBytes(32).toString('hex') };
const fixture = '<!doctype html><html><head><link rel="stylesheet" href="/assets/test.css"></head><body><h1>Research-Testseite</h1><a href="/discover">Discover</a><a href="/__research/logout">Zugang zurücksetzen</a><script src="/assets/test.js"></script></body></html>';

// Real TLS, redirects, cookies and native forms; only the origin content is a fixture.
const temp = await mkdtemp(join(tmpdir(), 'research-access-qa-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(temp, 'key.pem'),
  '-out', join(temp, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost'], {stdio: 'ignore'});
let host;
const server = createServer({key: await readFile(join(temp, 'key.pem')), cert: await readFile(join(temp, 'cert.pem'))}, async (incoming, outgoing) => {
  try {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    // Adapt the test host only; the production Worker still enforces its real Origin.
    if (headers.get('Origin') === host) headers.set('Origin', canonical);
    const response = await handle(new Request(canonical + incoming.url, {
      method: incoming.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined,
    }), env, async request => {
      const path = new URL(request.url).pathname;
      if (path.endsWith('.css')) return new Response('body{color:white;background:#090b10}', {headers: {'Content-Type': 'text/css'}});
      if (path.endsWith('.js')) return new Response('document.body.dataset.assetLoaded="yes"', {headers: {'Content-Type': 'text/javascript'}});
      return new Response(fixture, {headers: {'Content-Type': 'text/html; charset=utf-8'}});
    });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(await response.text());
  } catch (error) { outgoing.writeHead(500); outgoing.end('Browser test adapter failed'); console.error(error); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
host = `https://127.0.0.1:${server.address().port}`;

try { for (const [name, engine, options] of [
  ['Chromium', chromium, { viewport: {width: 1280, height: 800} }],
  ['iPhone Safari / WebKit', webkit, devices['iPhone 13']],
]) {
  const browser = await engine.launch({headless: true,
    ...(name === 'Chromium' && process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.CHROMIUM_EXECUTABLE_PATH} : {}),
  });
  try {
    let context = await browser.newContext({...options, ignoreHTTPSErrors: true});
    let page = await context.newPage();
    await page.goto(host + '/');
    assert.ok(page.url().includes('/__research/login?next='));
    await page.goto(host + '/stocks/AAPL?view=history#/zahlen');
    assert.ok(page.url().includes('/__research/login?next='));
    assert.equal(await page.locator('input[type=password]').getAttribute('autocomplete'), 'current-password');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.locator('#password').fill('wrong');
    await page.getByRole('button', {name: 'Zugang öffnen'}).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByRole('alert').innerText(), 'Passwort nicht korrekt.');
    assert.equal((await context.cookies()).length, 0);
    await page.locator('#password').fill(env.RESEARCH_ACCESS_PASSWORD);
    await page.getByRole('button', {name: 'Zugang öffnen'}).click();
    await page.waitForURL(host + '/stocks/AAPL?view=history#/zahlen');
    await page.locator('body[data-asset-loaded=yes]').waitFor();
    const [cookie] = await context.cookies();
    assert.equal(cookie.name, '__Host-research_access');
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.secure, true);
    assert.equal(cookie.sameSite, 'Lax');
    assert.ok(cookie.expires > Date.now() / 1000 + 29 * 86400);
    await page.getByRole('link', {name: 'Discover', exact: true}).click();
    await page.waitForURL(host + '/discover');
    await page.reload();
    assert.equal(page.url(), host + '/discover');
    const state = await context.storageState();
    await context.close();
    context = await browser.newContext({...options, storageState: state, ignoreHTTPSErrors: true});
    page = await context.newPage();
    await page.goto(host + '/quant');
    assert.equal(page.url(), host + '/quant');
    await page.getByRole('link', {name: 'Zugang zurücksetzen'}).click();
    await page.getByRole('button', {name: 'Zugang zurücksetzen'}).click();
    await page.waitForURL(host + '/__research/login');
    assert.equal((await context.cookies()).length, 0);
    await page.goto(host + '/quant');
    assert.ok(page.url().includes('/__research/login?next='));
    await context.close();
    context = await browser.newContext({...options, ignoreHTTPSErrors: true});
    page = await context.newPage();
    await page.goto(host + '/discover');
    assert.ok(page.url().includes('/__research/login?next='));
    await context.close();
    console.log(`${name}: PASS (login, deep link, incorrect/correct password, assets, navigation, reload, restored browser session, fresh browser, logout)`);
  } finally { await browser.close(); }
} } finally {
  await new Promise(resolve => server.close(resolve));
  await rm(temp, {recursive: true, force: true});
}
