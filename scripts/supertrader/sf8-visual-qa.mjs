#!/usr/bin/env node
// Supertrader 8.0 – visuelle QA der quellentreuen Research-Ansichten MIT befüllten Daten (Desktop 1280 und iPhone 14,
// je Dark und Light). Ergänzt browser-qa.mjs (das die bestehenden Seiten prüft) um Messungen, die nur mit Kandidaten
// sinnvoll sind: Kartenhöhe auf dem iPhone, Aufklappbereiche, Kennzahlen, Chart, Stufenlegende, leere und gesperrte
// Zustände, interne Codes (auch zugeklappt), Dock. Schreibt JPEG-Screenshots und report.json nach --out.
//
// Aufruf: node scripts/supertrader/sf8-visual-qa.mjs --site=<release> --sf-candidates=<dir> [--out=sf8-qa]
//         [--browser=chromium|webkit] [--playwright=<pfad>]
// Die Kandidaten erzeugt der (nicht freigeschaltete) Producer lokal; dieses Skript liest sie nur.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const SITE = path.resolve(args.site || '.'), SF = args['sf-candidates'] ? path.resolve(args['sf-candidates']) : null, OUT = path.resolve(args.out || 'sf8-qa');
if (!SF || !fs.existsSync(path.join(SF, 'summary.json'))) { console.error('--sf-candidates=<dir mit summary.json> fehlt'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const pw = (() => { for (const t of [args.playwright, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) { try { return createRequire(import.meta.url)(t); } catch { /* weiter */ } } throw new Error('playwright nicht gefunden'); })();

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.gz': 'application/gzip', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
const PREFIX = '/supertrader/data/sf-candidates/';
function serve() {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = p.startsWith(PREFIX) ? path.join(SF, p.slice(PREFIX.length)) : path.join(SITE, p);
    if (!file.startsWith(p.startsWith(PREFIX) ? SF : SITE)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

const summary = JSON.parse(fs.readFileSync(path.join(SF, 'summary.json'), 'utf8'));
const top = Object.values(summary.top).flat();
// Aktie mit den meisten Methoden (aus den Ticker-Shards), Strategie mit modellierten Abläufen, Chart-Modell (PS)
const byTicker = new Map();
for (const f of fs.readdirSync(path.join(SF, 'ticker'))) for (const v of JSON.parse(fs.readFileSync(path.join(SF, 'ticker', f), 'utf8')).views) byTicker.set(v.ticker, (byTicker.get(v.ticker) || 0) + 1);
const multi = [...byTicker].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
const modeledCid = (summary.strategies.find((s) => s.counts.byStage.MODELED_TRADE_PLAN) || summary.strategies[0]).candidateId;
const ROUTES = [
  ['start', '/supertrader/', '#sf-home .sf-row'],
  ['methoden', '/supertrader/strategies/', '#sf .sf-strat'],
  [`strategie-${modeledCid}`, `/supertrader/strategies/?sf=${modeledCid}`, '#sf .sf-card'],
  ['strategie-C06-minervini', '/supertrader/strategies/?sf=C06', '#sf .sf-card'],
  ['strategie-C10-chartmodell', '/supertrader/strategies/?sf=C10', '#sf .sf-card'],
  [`aktie-${multi}`, `/supertrader/stock/?s=${encodeURIComponent(multi)}#sf`, '#sf-stock .sf-card'],
  ['aktie-ohne-treffer', '/supertrader/stock/?s=ZZZZ', '#sf-stock .sf-empty'],
  ['strategie-leere-suche', `/supertrader/strategies/?sf=${modeledCid}`, '#sf .sf-card'],
];

async function main() {
  const server = await serve(), base = `http://127.0.0.1:${server.address().port}`;
  const engine = args.browser === 'webkit' ? pw.webkit : pw.chromium;
  const browser = await engine.launch(args.browser === 'webkit' ? {} : { executablePath: args.chromium || undefined });
  const iphone = { ...pw.devices['iPhone 14'] }; delete iphone.defaultBrowserType;
  const VPS = [['desktop', { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 }, false], ['iphone', iphone, true]];
  const report = [], failures = [];
  for (const [vp, opts, mobile] of VPS) for (const theme of ['dark', 'light']) {
    const ctx = await browser.newContext(opts);
    await ctx.addInitScript((t) => { try { localStorage.setItem('vu-discover-theme-v1', t); localStorage.setItem('vu-supertrader-sf-preview', '1'); } catch { /* ohne Speicher */ } }, theme);
    for (const [name, url, sel] of ROUTES) {
      const page = await ctx.newPage(), errors = [];
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      page.on('response', (r) => { if (r.status() >= 400 && !/favicon|site-navigation|\/discover\/logos\//.test(r.url())) errors.push(`http ${r.status()}: ${r.url()}`); });
      const t0 = Date.now();
      await page.goto(base + url, { waitUntil: 'networkidle' });
      try { await page.waitForSelector(sel, { timeout: 15000 }); } catch { errors.push(`selector ${sel} fehlt`); }
      if (name === 'strategie-leere-suche') { await page.fill('#sf .sf-search', 'ZZZZZZ'); await page.waitForTimeout(200); }
      if (/^aktie-/.test(name) && name !== 'aktie-ohne-treffer') { try { await page.waitForSelector('#sf-stock .st-chart svg path', { timeout: 20000 }); } catch { errors.push('Chart nicht gezeichnet'); } }
      // Aufklappbereiche öffnen und prüfen, dass Inhalt erscheint
      const details = await page.$$('.sf-host details summary');
      let opened = 0;
      for (const s of details.slice(0, 4)) { await s.click(); opened++; }
      const m = await page.evaluate((mobileVp) => {
        const host = [...document.querySelectorAll('.sf-host')];
        const txt = host.map((x) => x.textContent).join(' ');
        const cards = [...document.querySelectorAll('.sf-card')].filter((c) => !c.closest('details[open]'));
        const compactHeights = [...document.querySelectorAll('.sf-view .sf-card')].map((c) => { const d = c.querySelector('details'); const was = d && d.open; if (d) d.open = false; const h = c.getBoundingClientRect().height; if (d) d.open = was; return Math.round(h); });
        const dock = document.querySelector('#vu-dock')?.shadowRoot?.querySelector('nav');
        const r = dock ? dock.getBoundingClientRect() : null;
        return {
          overflow: document.documentElement.scrollWidth - innerWidth,
          codes: (txt.match(/\b(?:DON|KK|DAR|MIN|WEI|WEIN|LC|PILOT|TUR|MOKA|RAS)-[A-Z0-9-]+\b|DATA_BLOCKED|[A-Z]{3,}_[A-Z_]{3,}/g) || []).slice(0, 3),
          wording: txt.replace(/keine kauf- oder verkaufsempfehlung/ig, '').match(/\bsignal\w*|validiert\w*|jetzt kaufen|kaufsignal/i)?.[0] ?? null,
          cards: document.querySelectorAll('.sf-card').length, rows: document.querySelectorAll('.sf-row').length,
          cardsWithoutStage: [...document.querySelectorAll('.sf-card, .sf-row')].filter((c) => !c.querySelector('.sf-stage')).length,
          planOutsideModel: document.querySelectorAll('.sf-card:not([data-stage="MODELED_TRADE_PLAN"]) .sf-plan').length,
          kpis: document.querySelectorAll('.sf-host .vu-kpi').length, maxCompactCardHeight: compactHeights.length ? Math.max(...compactHeights) : null,
          legendSteps: document.querySelectorAll('.sf-legend .sf-step').length, lockedStep: !!document.querySelector('.sf-legend .sf-step[data-s="locked"]'),
          openDetailsWithContent: [...document.querySelectorAll('.sf-host details[open]')].filter((d) => d.querySelector('.vu-more-body')?.textContent.trim().length > 10).length,
          preview: !!document.querySelector('.sf-preview'), provenance: /Datenherkunft und Aktualität/.test(txt), limitsStrong: document.querySelectorAll('.sf-limits[data-strong="true"]').length,
          empty: !!document.querySelector('.sf-empty'), asOfVisible: /\d{2}\.\d{2}\.\d{4}/.test(txt),
          dock: !!(r && r.height > 0 && r.bottom <= innerHeight + 1 && dock.querySelectorAll('a').length === 4), chart: !!document.querySelector('.sf-host .st-chart svg path'),
        };
      }, mobile);
      if (m.overflow > 1) errors.push(`horizontaler Überlauf ${m.overflow}px`);
      if (m.codes.length) errors.push('interne Codes: ' + m.codes.join(', '));
      if (m.wording) errors.push('unzulässige Sprache: ' + m.wording);
      if (m.cardsWithoutStage) errors.push(`${m.cardsWithoutStage} Karten ohne Stufe`);
      if (m.planOutsideModel) errors.push(`${m.planOutsideModel} Plan-Marken außerhalb des modellierten Ablaufs`);
      if (!m.dock) errors.push('Dock fehlt oder steht nicht unten');
      if (!m.preview) errors.push('Vorschau-Kennzeichnung fehlt');
      if (opened && m.openDetailsWithContent < 1) errors.push('Aufklappbereich ohne Inhalt');
      if (mobile && m.maxCompactCardHeight !== null && m.maxCompactCardHeight > 380) errors.push(`Karte zu hoch auf dem iPhone: ${m.maxCompactCardHeight}px`);
      if (['start', 'methoden'].includes(name) && !m.provenance) errors.push('Datenherkunft fehlt');
      if (/C06|C10/.test(name) && !m.limitsStrong) errors.push('Grenzen der Methode nicht deutlich gekennzeichnet');
      if (/^(start|methoden)$/.test(name) && m.legendSteps !== 4) errors.push(`Stufenlegende mit ${m.legendSteps} statt 4 Stufen`);
      if ((name === 'aktie-ohne-treffer' || name === 'strategie-leere-suche') && !m.empty) errors.push('Leerzustand fehlt');
      await page.evaluate(() => scrollTo(0, Math.max(0, (document.querySelector('#sf, #sf-stock, #sf-home')?.getBoundingClientRect().top ?? 0) + scrollY - 70)));
      await page.waitForTimeout(150);
      const shot = `${vp}-${theme}-${name}.jpg`;
      await page.screenshot({ path: path.join(OUT, shot), type: 'jpeg', quality: 72, fullPage: vp === 'desktop' && name === 'start' });
      report.push({ viewport: vp, theme, route: url, name, ms: Date.now() - t0, metrics: m, errors, screenshot: shot });
      if (errors.length) failures.push(`${vp}/${theme} ${name}: ${errors.join(' | ')}`);
      await page.close();
    }
    await ctx.close();
  }
  await browser.close(); server.close();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ browser: args.browser || 'chromium', asOf: summary.asOf, candidates: summary.counts, routes: ROUTES.map((r) => r[1]), checks: report }, null, 1));
  console.log(`SF8 visuelle QA (${args.browser || 'chromium'}): ${report.length} Aufrufe, ${failures.length} Fehler`);
  for (const f of failures) console.log('  FAIL ' + f);
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
