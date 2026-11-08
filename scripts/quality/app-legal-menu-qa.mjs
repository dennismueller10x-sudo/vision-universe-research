// App-QA „Rechtliches & Infos“ (Owner 08.11.2026: in der App ließ sich kein Eintrag antippen).
//
// Nachbau der App ohne Gerät: die echte App-Hülle app/www mit ihrer unveränderten CSP (frame-src nur
// research.visionuniverse.de), App-User-Agent VUApp/1 und Capacitor-Kennung; die Website aus diesem Repository
// wird unter https://research.visionuniverse.de ausgeliefert (Playwright-Route, kein Netz). Für jeden Menüeintrag:
// Menü über den Dock öffnen, Treffer an der Tipp-Stelle prüfen (kein Overlay), echter Tipp, Ergebnis prüfen.
//   - Rechtstexte (andere Herkunft): neues Fenster mit genau dieser Adresse. Capacitor gibt ein neues Fenster an den
//     System-Browser (iOS decidePolicyFor mit targetFrame == nil, Android launchIntent). Der Rahmen bleibt stehen.
//   - Datenquellen & Methodik (gleiche Herkunft): der Rahmen zeigt /infos/ mit #quellen.
// Gegenprobe im Web (ohne App-Kennung): derselbe Tipp öffnet den Rechtstext wie bisher im selben Fenster.
// Aufruf: node scripts/quality/app-legal-menu-qa.mjs [--browser chromium|webkit] [--out bericht.json]
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const require = createRequire(import.meta.url);
const pw = (() => { try { return require('playwright'); } catch { return require(process.env.PLAYWRIGHT_PATH || 'playwright'); } })();
const engine = arg('browser', 'chromium');
const out = arg('out', null);
const SITE = 'https://research.visionuniverse.de', SHELL = 'https://app.vu.test';
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json'};
// Menüeinträge so, wie die Seite sie ausliefert (VU-LEGAL-Block, erzeugt aus assets/legal-notices.json).
const LEGAL = JSON.parse(fs.readFileSync(path.join(repo, 'assets/site-navigation.js'), 'utf8').match(/var LEGAL = (\{.*\});\n/)[1]);

function file(root, pathname) {
  let p = decodeURIComponent(pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return null;
  return {body: fs.readFileSync(f), contentType: MIME[path.extname(f)] || 'application/octet-stream'};
}
const results = [];
const check = (name, ok, detail = '') => { results.push({name, ok: Boolean(ok), detail: String(detail)}); console.log((ok ? 'OK   ' : 'FAIL ') + name + (detail ? ' – ' + detail : '')); };

const browser = await pw[engine].launch();
async function context(app) {
  const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' + (app ? ' VUApp/1 VUEdge/1' : '');
  const ctx = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: engine === 'chromium', hasTouch: true, userAgent: ua});
  await ctx.route('**/*', async (r) => {
    const u = new URL(r.request().url());
    if (u.origin === SITE) { const f = file(repo, u.pathname); return f ? r.fulfill({status: 200, ...f}) : r.fulfill({status: 404, body: ''}); }
    if (u.origin === SHELL) {
      if (u.pathname === '/js/runtime-config.js') return r.fulfill({status: 200, contentType: 'text/javascript', body: 'globalThis.VU_APP_CONFIG={};'});
      const f = file(path.join(repo, 'app/www'), u.pathname === '/' ? '/index.html' : u.pathname);
      return f ? r.fulfill({status: 200, ...f}) : r.fulfill({status: 404, body: ''});
    }
    if (u.hostname === 'konto.visionuniverse.de') return r.fulfill({status: 200, contentType: 'text/html', body: '<!doctype html><title>Rechtstext</title><h1>Rechtstext</h1>'});
    return r.abort();
  });
  // Capacitor-Kennung nur in der Hülle (wie im nativen Bundle); die Website erkennt die App am User-Agent.
  if (app) await ctx.addInitScript((shell) => { if (location.origin === shell) globalThis.Capacitor = {isNativePlatform: () => true, getPlatform: () => 'ios'}; }, SHELL);
  return ctx;
}
async function openMenu(frame) {
  if (await frame.evaluate(() => document.querySelector('vu-navigation')?.hasAttribute('open'))) return;
  await frame.locator('#vu-dock button.menu').tap();
  await frame.waitForFunction(() => document.querySelector('vu-navigation')?.hasAttribute('open'), null, {timeout: 5000});
}
const contentFrame = (page) => page.frames().find((f) => f.url().startsWith(SITE));

// ---- App ----
const ctx = await context(true);
const page = await ctx.newPage();
await page.goto(SHELL + '/');
await page.waitForFunction(() => globalThis.__vuReady === true, null, {timeout: 30000});
if (await page.locator('#skip-login').isVisible()) await page.locator('#skip-login').tap();
await page.waitForFunction((site) => [...document.querySelectorAll('.view:not([hidden]) iframe')].some((i) => i.src.startsWith(site)), SITE, {timeout: 15000});
const startPath = await page.evaluate(() => new URL(document.querySelector('.view:not([hidden]) iframe').src).pathname);
const homePath = startPath;
let frame;
for (let i = 0; i < 60 && !(frame = contentFrame(page)); i++) await page.waitForTimeout(250);
check('App-Hülle zeigt die Website im Rahmen', Boolean(frame), startPath);
await frame.waitForSelector('#vu-dock button.menu', {state: 'attached', timeout: 30000});

for (const [label, href] of LEGAL.appLinks) {
  frame = contentFrame(page);
  await openMenu(frame);
  const link = frame.locator('vu-navigation .legal-links a', {hasText: label}).first();
  await link.scrollIntoViewIfNeeded();
  const box = await link.boundingBox();
  const hit = await frame.evaluate(([x, y]) => { const r = document.querySelector('vu-navigation').shadowRoot.elementFromPoint(x, y); const a = r && r.closest('a'); return a ? a.textContent.trim() : (r ? r.tagName : null); }, [box.x + box.width / 2, box.y + box.height / 2]);
  check(`App: „${label}“ liegt an der Tipp-Stelle oben (kein Overlay)`, hit === label, String(hit));
  const external = new URL(href).origin !== SITE;
  const popup = external ? ctx.waitForEvent('page', {timeout: 8000}).catch(() => null) : null;
  await link.tap();
  if (external) {
    const p = await popup;
    const url = p ? p.url() || (await p.waitForURL(/./, {timeout: 3000}).then(() => p.url()).catch(() => '')) : '';
    check(`App: „${label}“ öffnet ein neues Fenster (System-Browser) mit der Rechtstext-Adresse`, url === href, url || 'kein neues Fenster');
    const still = contentFrame(page);
    check(`App: Rahmen bleibt bei „${label}“ auf der Website`, Boolean(still) && !/chrome-error|about:blank/.test(still.url()), still ? still.url().replace(SITE, '') : 'Rahmen verloren');
    if (p) await p.close();
  } else {
    let ok = false, at = '';
    // Erst die Adresse des Rahmens, dann der Abschnitt im Dokument (CI-Chromium braucht für /infos/ teils länger als 10 s).
    let f = null;
    for (let i = 0; i < 80 && at !== href; i++) { f = contentFrame(page); at = f ? f.url() : ''; if (at !== href) await page.waitForTimeout(250); }
    if (at === href) ok = await f.waitForSelector('#quellen', {state: 'attached', timeout: 20000}).then(() => true).catch(() => false);
    if (at === href && !ok) at += ' (Abschnitt #quellen fehlt)';
    check(`App: „${label}“ öffnet im Rahmen`, ok, at.replace(SITE, ''));
    // zurück zum Start für den nächsten Eintrag
    await page.evaluate(([site, p]) => { document.querySelector('.view:not([hidden]) iframe').src = site + p; }, [SITE, homePath]);
    await page.waitForTimeout(500);
    for (let i = 0; i < 60; i++) { const f = contentFrame(page); if (f && new URL(f.url()).pathname === homePath && await f.locator('#vu-dock button.menu').count()) break; await page.waitForTimeout(250); }
  }
}
await ctx.close();

// ---- Gegenprobe Web (keine App-Kennung) ----
const web = await context(false);
const wp = await web.newPage();
await wp.goto(SITE + '/discover/');
await wp.waitForSelector('#vu-dock button.menu', {state: 'attached', timeout: 30000});
await openMenu(wp.mainFrame());
const [label, href] = LEGAL.appLinks.find(([, h]) => new URL(h).origin !== SITE);
const pages = web.pages().length;
await wp.locator('vu-navigation .legal-links a', {hasText: label}).first().tap();
await wp.waitForURL(href, {timeout: 8000}).catch(() => {});
check(`Web: „${label}“ öffnet wie bisher im selben Fenster`, wp.url() === href && web.pages().length === pages, wp.url());
await web.close();
await browser.close();

const failed = results.filter((r) => !r.ok);
if (out) fs.writeFileSync(out, JSON.stringify({engine, results}, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden (${engine})`);
process.exit(failed.length ? 1 : 0);
