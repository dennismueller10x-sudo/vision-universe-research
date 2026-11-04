// Machbarkeitsnachweis im Browser (Chromium, iPhone-Viewport): die App-Shell gegen
//  - simuliertes Supabase Auth und simulierte Konto-API (kein echtes Konto, keine Produktion),
//  - die echten Produktseiten aus diesem Repository (lokal ausgeliefert) in den Bereichs-Rahmen.
// Prueft Anmeldung, Sitzungserneuerung, Abmeldung, Offline, Watchlist, Safe Areas, Tab-Navigation.
// Aufruf: node scripts/poc-browser.mjs [--out datei.json]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(app, '..');
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
const {chromium} = createRequire(import.meta.url)('playwright');
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json'};

const listen = h => new Promise(r => { const s = http.createServer(h); s.listen(0, '127.0.0.1', () => r(s)); });
const port = s => s.address().port;
const cors = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'};

// --- simulierte Dienste ---
const state = {tokenN: 0, expiresIn: 5, removed: [], items: [{listId: 'l1', instrumentId: 'vu_aaaaaa', ticker: 'NVDA'}, {listId: 'l1', instrumentId: 'vu_bbbbbb', ticker: 'MSFT'}], refreshCalls: 0, seenBearer: []};
const sb = await listen((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  let body = ''; req.on('data', c => body += c); req.on('end', () => {
    const u = new URL(req.url, 'http://x'); const send = (st, d) => { res.writeHead(st, {...cors, 'content-type': 'application/json'}); res.end(JSON.stringify(d)); };
    if (u.pathname === '/auth/v1/token') {
      const g = u.searchParams.get('grant_type'); const b = JSON.parse(body || '{}');
      if (g === 'password') { if (b.password !== 'richtig') return send(400, {error_code: 'invalid_credentials'}); }
      else if (g === 'refresh_token') state.refreshCalls++;
      state.tokenN++;
      return send(200, {access_token: 'at' + state.tokenN, refresh_token: 'rt' + state.tokenN, expires_in: state.expiresIn, user: {id: 'u1', email: 'test@example.com'}});
    }
    if (u.pathname === '/auth/v1/logout') return send(204, {});
    send(404, {});
  });
});
const api = await listen((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const send = (st, d) => { res.writeHead(st, {...cors, 'content-type': 'application/json'}); res.end(JSON.stringify(d)); };
  state.seenBearer.push(req.headers.authorization || null);
  if (!/^Bearer at\d+$/.test(req.headers.authorization || '')) return send(401, {state: 'NOT_AUTHENTICATED'});
  let body = ''; req.on('data', c => body += c); req.on('end', () => {
    if (req.url === '/v1/me') return send(200, {user: {id: 'u1'}, entitlements: {plan_id: 'free'}});
    if (req.url === '/v1/watchlist') return send(200, {lists: [{id: 'l1', name: 'Meine'}], items: state.items.filter(i => !state.removed.includes(i.instrumentId)), limits: {plan: 'free', items: 500, lists: 25}});
    if (req.url === '/v1/watchlist/items/remove') { state.removed.push(JSON.parse(body).instrumentId); return send(200, {state: 'REMOVED', removed: true}); }
    send(404, {});
  });
});
// Inhalte: das Repository (gzip wie GitHub Pages)
const content = await listen((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(repo, p);
  if (!f.startsWith(repo) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  const b = fs.readFileSync(f), ext = path.extname(f);
  const h = {'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store'};
  if (b.length > 1024 && /\.(html|js|css|json|svg)$/.test(ext)) { res.writeHead(200, {...h, 'content-encoding': 'gzip'}); return res.end(zlib.gzipSync(b)); }
  res.writeHead(200, h); res.end(b);
});
// Shell: app/www, mit Testkonfiguration und lokalen Quellen in der CSP (nur im Test)
const shell = await listen((req, res) => {
  let p = new URL(req.url, 'http://x').pathname; if (p === '/') p = '/index.html';
  if (p === '/poc-config.js') { res.writeHead(200, {'content-type': 'text/javascript'}); return res.end(`globalThis.VU_APP_CONFIG=${JSON.stringify({supabaseUrl: 'http://127.0.0.1:' + port(sb), supabasePublishableKey: 'sb_publishable_test', accountApi: 'http://127.0.0.1:' + port(api), contentOrigin: 'http://127.0.0.1:' + port(content), refreshMarginSeconds: 2})}`); }
  const f = path.join(app, 'www', p);
  if (!f.startsWith(path.join(app, 'www')) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  let b = fs.readFileSync(f);
  if (p === '/index.html') {
    b = Buffer.from(String(b).replace("connect-src 'self'", `connect-src 'self' http://127.0.0.1:*`).replace('frame-src', 'frame-src http://127.0.0.1:*')
      .replace('<script src="js/runtime-config.js"></script>', '<script src="/poc-config.js"></script>'));
  }
  if (p === '/poc-config.js') {
    res.writeHead(200, {'content-type': 'text/javascript'});
    return res.end(`globalThis.VU_APP_CONFIG=${JSON.stringify({supabaseUrl: 'http://127.0.0.1:' + port(sb), supabasePublishableKey: 'sb_publishable_test', accountApi: 'http://127.0.0.1:' + port(api), contentOrigin: 'http://127.0.0.1:' + port(content), refreshMarginSeconds: 2})}`);
  }
  res.writeHead(200, {'content-type': MIME[path.extname(f)] || 'text/plain'}); res.end(b);
});

const results = [];
const check = (name, ok, detail = '') => { results.push({name, ok: Boolean(ok), detail: String(detail)}); console.log((ok ? 'OK   ' : 'FAIL ') + name + (detail ? ' - ' + detail : '')); };

const browser = await chromium.launch();
const ctx = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
// CSP-Inline-Skript der Testkonfiguration braucht script-src; nur fuer den Test erlauben
const page = await ctx.newPage();
await page.route('**/index.html', async r => r.continue()); 
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${port(shell)}/`);
await page.waitForFunction(() => globalThis.__vuReady === true, null, {timeout: 15000}).catch(() => {});
check('Shell startet (CSP erlaubt Modul-Skript)', await page.evaluate(() => globalThis.__vuReady === true), errors[0] || '');

// Navigation + Safe Areas
const tabs = await page.$$eval('#tabs button', b => b.map(x => ({t: x.textContent, h: x.getBoundingClientRect().height, w: x.getBoundingClientRect().width})));
check('6 Tabs, jedes mindestens 44 px hoch', tabs.length === 6 && tabs.every(t => t.h >= 44), JSON.stringify(tabs.map(t => Math.round(t.h))));
check('kein seitliches Scrollen', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
check('Safe-Area-Regeln aktiv (padding-bottom aus env())', await page.evaluate(() => /safe-area-inset-bottom/.test([...document.styleSheets].flatMap(s => [...s.cssRules]).map(r => r.cssText).join(''))));
for (const [v, label] of [['discover', 'Start/Discover'], ['quant', 'Quant'], ['technical', 'Technical'], ['supertrader', 'Supertrader']]) {
  await page.click(`#tabs button[data-view="${v}"]`);
  const fr = page.frameLocator(`#v-${v} iframe`);
  await fr.locator('body *').first().waitFor({timeout: 20000}).catch(() => {});
  const want = `http://127.0.0.1:${port(content)}/${v === 'discover' ? 'discover' : v}/`;
  let title = '', src = '';
  for (let i = 0; i < 60 && title.length < 4; i++) {          // bis 30 s: Discover laedt ueber 100 Dateien
    const f = page.frames().find(x => x.url().startsWith(want));
    if (f) { src = f.url(); title = await f.title().catch(() => ''); }
    if (title.length < 4) await page.waitForTimeout(500);
  }
  const local = src.startsWith(want);
  check(`${label} laedt im Rahmen (lokale Inhalte, Titel vorhanden)`, local && title.length > 3, `${src.replace(/^http:\/\/127\.0\.0\.1:\d+/, '')} "${title.slice(0, 40)}"`);
}
const shot = process.env.POC_SHOTS; if (shot) { await page.click('#tabs button[data-view="technical"]'); await page.waitForTimeout(1500); await page.screenshot({path: path.join(shot, 'technical.png')}); }

// Konto
await page.click('#tabs button[data-view="account"]');
await page.fill('#email', 'test@example.com'); await page.fill('#password', 'falsch'); await page.click('#login button[type=submit]');
await page.locator('#login-error').waitFor({timeout: 5000}).catch(() => {});
check('falsches Passwort: Fehlermeldung, nicht angemeldet', await page.locator('#login-error').isVisible() && !(await page.locator('#account-info').isVisible()));
await page.fill('#password', 'richtig'); await page.click('#login button[type=submit]');
await page.locator('#account-info').waitFor({timeout: 5000});
check('Login: Konto sichtbar, Tarif aus /v1/me', (await page.textContent('#acc-email')) === 'test@example.com' && await page.waitForFunction(() => document.getElementById('acc-plan').textContent === 'free', null, {timeout: 5000}).then(() => true).catch(() => false));
check('Token liegt nicht im Web-Speicher', await page.evaluate(() => !JSON.stringify({...localStorage}).includes('at') && !JSON.stringify({...sessionStorage}).includes('at') && !document.cookie));

// Watchlist
await page.click('#tabs button[data-view="watchlist"]');
await page.locator('#wl-list li').first().waitFor({timeout: 5000});
check('Watchlist aus der Konto-API (2 Werte)', (await page.locator('#wl-list li').count()) === 2);
check('API erhielt Bearer-Token', state.seenBearer.some(h => /^Bearer at\d+$/.test(h || '')));
await page.click('#wl-list li:first-child button'); await page.waitForFunction(() => document.querySelectorAll('#wl-list li').length === 1, null, {timeout: 5000});
check('Entfernen wird serverseitig gespeichert (Synchronisierung)', state.removed.length === 1 && state.removed[0] === 'vu_aaaaaa');

// Sitzungserneuerung: Token laeuft nach 5 s ab (Rand 2 s)
state.refreshCalls = 0; await page.waitForTimeout(4200);
await page.click('#tabs button[data-view="account"]'); await page.click('#tabs button[data-view="watchlist"]');
await page.locator('#wl-list li').first().waitFor({timeout: 5000});
check('Sitzung wird vor Ablauf erneuert (Refresh-Aufruf, Rotation)', state.refreshCalls >= 1 && state.seenBearer.at(-1) !== 'Bearer at1', 'refreshCalls=' + state.refreshCalls + ' ' + state.seenBearer.at(-1));

// Offline
await ctx.setOffline(true);
await page.waitForFunction(() => !document.getElementById('offline').hidden, null, {timeout: 5000}).catch(() => {});
check('Offline-Hinweis erscheint', await page.locator('#offline').isVisible());
await page.click('#tabs button[data-view="account"]'); await page.click('#tabs button[data-view="watchlist"]');
await page.waitForTimeout(600);
check('Watchlist offline: Hinweis statt Absturz, kein Abmelden', /Verbindung/.test(await page.textContent('#wl-state')) && !errors.some(e => /Uncaught/.test(e)));
await ctx.setOffline(false);
await page.waitForFunction(() => document.getElementById('offline').hidden, null, {timeout: 5000}).catch(() => {});
check('Wieder online: Hinweis weg, Sitzung besteht', await page.locator('#offline').isHidden());
await page.click('#tabs button[data-view="account"]');
check('Nach Offline weiterhin angemeldet', await page.locator('#account-info').isVisible());

// Logout
await page.click('#logout');
await page.locator('#login').waitFor({timeout: 5000}).catch(() => {});
check('Logout: Anmeldeformular, Watchlist leer', await page.locator('#login').isVisible() && (await page.locator('#wl-list li').count()) === 0);
await page.click('#tabs button[data-view="watchlist"]');
check('Nach Logout: Watchlist verlangt Anmeldung', /anmelden/i.test(await page.textContent('#wl-state')));

check('keine JavaScript-Fehler in der Shell', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close(); [sb, api, content, shell].forEach(s => s.close());
const failed = results.filter(r => !r.ok).length;
if (out) fs.writeFileSync(out, JSON.stringify({profile: 'Chromium, iPhone-Viewport 390x844, simulierte Dienste', failed, results}, null, 2));
console.log(`\n${results.length - failed}/${results.length} bestanden`);
process.exit(failed ? 1 : 0);
