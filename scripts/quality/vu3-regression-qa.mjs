// VU3-Regressionspruefung ueber die integrierten Produktwelten (PR 11 des VU3-Plans).
// Ergaenzt shell-browser-qa.mjs (Kopf, Produkt-Leiste, Menue, Ueberlauf je Route), ohne es zu wiederholen:
//
//  1 Wege zwischen den Welten: dieselbe Aktie bleibt dieselbe (Quant -> Elliott/Supertrader/Discover und zurueck,
//    Hedgefonds -> Discover, Screener-Link -> Quant), Browser-Zurueck, Altlinks, Bindestrich-Ticker (BRK-B).
//  2 Farbschema bleibt beim Wechsel zwischen den Welten (ein Klick auf den Schalter, danach jede Welt).
//  3 Visual-First-Bausteine sind sichtbar (Zaehlungen, Bilanzen, Richtungsbalken je Welt).
//  4 Kontrast (axe color-contrast, WCAG AA) je Welt in hell und dunkel, mobil und Desktop: 0 Verstoesse,
//    kein horizontaler Ueberlauf.
//
// Europa-Routen (SAP.DE, MRK.DE) bleiben bewusst aussen vor, solange die Europa-Daten separat geklaert werden.
// Aufruf:  node scripts/quality/vu3-regression-qa.mjs --url=http://127.0.0.1:8765 [--out=/tmp/vu3-qa]
//            [--engine=chromium|webkit] [--only=journeys,theme,visual,contrast] [--playwright=<pfad>] [--axe=<pfad>]
// Ohne axe-core (z. B. WebKit-Lauf ohne Abhaengigkeit) entfaellt nur Abschnitt 4, mit Hinweis.
// Schreibt nur nach --out (results.json, Screenshots bei Fehlern), nie in das Repository.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const base = arg('url', 'http://127.0.0.1:8765').replace(/\/$/, '');
const out = arg('out', '/tmp/vu3-qa');
const engine = arg('engine', 'chromium');
const only = new Set(arg('only', 'journeys,theme,visual,contrast').split(','));
const require = createRequire(import.meta.url);
const pw = require(arg('playwright', process.env.PLAYWRIGHT_PATH || 'playwright'));
let axePath = arg('axe', process.env.AXE_PATH || '');
if (!axePath) { try { axePath = require.resolve('axe-core/axe.min.js'); } catch { axePath = ''; } }
await mkdir(out, { recursive: true });

const THEME_KEY = 'vu-discover-theme-v1';
const SETTLE = Number(arg('settle', '4500'));
const findings = [], checks = [];
const fail = (where, msg) => { findings.push({ where, msg }); console.log('FAIL ' + where + ': ' + msg); };
const pass = (where, msg) => { checks.push({ where, msg }); console.log('  ok ' + where + ': ' + msg); };

const browser = await pw[engine].launch(engine === 'chromium' ? { ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--disable-dev-shm-usage'] } : {});
const mobile = engine === 'webkit' ? { ...pw.devices['iPhone 14'] } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const desktop = { viewport: { width: 1440, height: 900 } };

async function open(ctx, path) {
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + path, { waitUntil: 'load' });
  await page.waitForTimeout(SETTLE);
  return { page, errors };
}
const where = (page) => page.url().replace(base, '');
const title = (page) => page.evaluate(() => document.title);
async function scrollThrough(page) {
  await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 100)); } window.scrollTo(0, 0); });
  await page.waitForTimeout(500);
}
async function follow(page, hrefPattern, label) {
  const href = await page.evaluate((src) => { const re = new RegExp(src); return [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).find((h) => re.test(h)) || null; }, hrefPattern.source);
  if (!href) return null;
  await page.evaluate((h) => { const a = [...document.querySelectorAll('a[href]')].find((x) => x.getAttribute('href') === h); a.removeAttribute('target'); a.scrollIntoView({ block: 'center' }); a.click(); }, href);
  await page.waitForTimeout(SETTLE);
  return href;
}
async function guard(name, fn) {
  try { await fn(); } catch (e) { fail(name, 'Abbruch: ' + (e?.message || e).split('\n')[0]); }
}

/* ---------------------------------------------------------------- 1 Wege zwischen den Welten */
if (only.has('journeys')) await guard('journeys', async () => {
  console.log('\n[1] Wege zwischen den Welten (' + engine + ')');
  const ctx = await browser.newContext(mobile);
  // Quant NVDA -> Elliott -> zurueck zu Quant (Link) -> Browser-Zurueck
  {
    const { page, errors } = await open(ctx, '/quant/#/aktie/NVDA');
    const startTitle = await title(page);
    /NVDA/.test(startTitle) ? pass('quant->elliott', 'Start ' + startTitle) : fail('quant->elliott', 'Quant-Start ohne NVDA: ' + startTitle);
    const hrefE = await follow(page, /^\/elliott\/#\/NVDA(\?|$)/, 'Elliott');
    if (!hrefE) fail('quant->elliott', 'kein Elliott-Link auf der Quant-Aktienseite');
    else if (!/\/elliott\/#\/NVDA/.test(where(page)) || !/NVDA/.test(await title(page))) fail('quant->elliott', 'Ziel falsch: ' + where(page) + ' · ' + await title(page));
    else pass('quant->elliott', where(page));
    const hrefQ = await follow(page, /^\/quant\/#\/aktie\/NVDA$/, 'Quant');
    if (!hrefQ) fail('elliott->quant', 'kein Rueckweg zu Quant auf der Elliott-Seite');
    else if (!/\/quant\/#\/aktie\/NVDA$/.test(where(page))) fail('elliott->quant', 'Ziel falsch: ' + where(page));
    else pass('elliott->quant', where(page));
    await page.goBack(); await page.waitForTimeout(SETTLE);
    /\/elliott\/#\/NVDA/.test(where(page)) && /NVDA/.test(await title(page)) ? pass('zurueck', 'Browser-Zurueck -> ' + where(page)) : fail('zurueck', 'Browser-Zurueck landet auf ' + where(page));
    if (errors.length) fail('quant<->elliott', 'Seitenfehler: ' + errors.slice(0, 2).join(' | '));
    await page.close();
  }
  // Quant NVDA -> Supertrader / Discover; Discover -> Elliott
  for (const [name, re, expectUrl, expectTitle] of [
    ['quant->supertrader', /^\/supertrader\/stock\/NVDA\/$/, /\/supertrader\/stock\/NVDA\/$/, /NVDA/],
    ['quant->discover', /^\/discover\/#\/s\/US_REAL\/NVDA$/, /\/discover\/#\/s\/US_REAL\/NVDA$/, /NVIDIA/i]
  ]) {
    const { page, errors } = await open(ctx, '/quant/#/aktie/NVDA');
    const href = await follow(page, re, name);
    if (!href) fail(name, 'Link fehlt');
    else if (!expectUrl.test(where(page)) || !expectTitle.test(await title(page))) fail(name, 'Ziel falsch: ' + where(page) + ' · ' + await title(page));
    else pass(name, where(page) + ' · ' + await title(page));
    if (name === 'quant->discover' && href) {
      const e = await follow(page, /^\/elliott\/#\/NVDA(\?|$)/, 'Elliott');
      e && /\/elliott\/#\/NVDA/.test(where(page)) ? pass('discover->elliott', where(page)) : fail('discover->elliott', e ? 'Ziel falsch: ' + where(page) : 'Link fehlt');
    }
    if (errors.length) fail(name, 'Seitenfehler: ' + errors.slice(0, 2).join(' | '));
    await page.close();
  }
  // Hedgefonds-Aktie -> Discover
  {
    const { page } = await open(ctx, '/hedgefonds/#/aktie/NVDA');
    const href = await follow(page, /^\/discover\/#\/s\/US_REAL\/NVDA$/, 'Discover');
    href && /\/discover\/#\/s\/US_REAL\/NVDA$/.test(where(page)) && /NVIDIA/i.test(await title(page)) ? pass('hedgefonds->discover', where(page)) : fail('hedgefonds->discover', href ? 'Ziel falsch: ' + where(page) : 'Link fehlt');
    await page.close();
  }
  // Screener-Ziele (Quant-Analyse /vu2/?view=stock, Aktie oeffnen /discover/#/s/US_REAL/<T>) fuehren auf genau diese Aktie,
  // auch mit Bindestrich-Ticker (BRK-B); Altlink /quant/#/elliott/<T> leitet auf Elliott.
  for (const [t, name] of [['NVDA', /NVIDIA/i], ['PLTR', /Palantir/i], ['BRK-B', /Berkshire/i]]) {
    const q = await open(ctx, '/vu2/?view=stock&ticker=' + encodeURIComponent(t));
    const qt = await title(q.page);
    where(q.page) === '/quant/#/aktie/' + encodeURIComponent(t) && name.test(qt) ? pass('screener->quant ' + t, where(q.page)) : fail('screener->quant ' + t, where(q.page) + ' · ' + qt);
    await q.page.close();
    const d = await open(ctx, '/discover/#/s/US_REAL/' + encodeURIComponent(t));
    name.test(await title(d.page)) ? pass('screener->discover ' + t, await title(d.page)) : fail('screener->discover ' + t, await title(d.page));
    await d.page.close();
  }
  {
    const { page } = await open(ctx, '/quant/#/elliott/NVDA');
    /\/elliott\/#\/NVDA/.test(where(page)) ? pass('altlink elliott', where(page)) : fail('altlink elliott', where(page));
    await page.close();
  }
  await ctx.close();
});

/* ---------------------------------------------------------------- 2 Farbschema ueber die Welten */
if (only.has('theme')) await guard('theme', async () => {
  console.log('\n[2] Farbschema bleibt beim Wechsel (' + engine + ')');
  const ctx = await browser.newContext(desktop);
  await ctx.addInitScript((k) => { if (!sessionStorage.getItem('vu3-qa-init')) { try { localStorage.setItem(k, 'light'); } catch {} sessionStorage.setItem('vu3-qa-init', '1'); } }, THEME_KEY);
  const { page } = await open(ctx, '/quant/#/');
  const theme = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  const clicked = await page.evaluate(() => { const b = document.querySelector('vu-navigation')?.shadowRoot?.querySelector('button.mode'); if (!b) return false; b.click(); return true; });
  if (!clicked) { fail('theme', 'kein Farbschema-Schalter im Kopf von Quant'); await ctx.close(); return; }
  await page.waitForTimeout(400);
  const after = await theme();
  after === 'dark' ? pass('theme', 'Quant: Schalter -> dunkel') : fail('theme', 'Quant nach Klick: ' + after);
  for (const path of ['/vorsorge/#/', '/screener/', '/hedgefonds/#/', '/elliott/', '/supertrader/', '/discover/#/', '/quant/#/aktie/NVDA']) {
    await page.goto(base + path, { waitUntil: 'load' }); await page.waitForTimeout(1500);
    const t = await theme();
    t === 'dark' ? pass('theme', path + ' dunkel') : fail('theme', path + ' zeigt ' + t + ' statt dunkel');
  }
  await page.evaluate(() => document.querySelector('vu-navigation')?.shadowRoot?.querySelector('button.mode')?.click());
  await page.waitForTimeout(400);
  await page.goto(base + '/hedgefonds/#/', { waitUntil: 'load' }); await page.waitForTimeout(1500);
  (await theme()) === 'light' ? pass('theme', 'zurueck auf hell, bleibt in Hedgefonds hell') : fail('theme', 'zurueck auf hell nicht uebernommen: ' + await theme());
  await ctx.close();
});

/* ---------------------------------------------------------------- 3 Visual-First-Bausteine */
// [Welt, Route, Selektor, Beschreibung]; Inhalte stammen aus den Visual-First-PRs (#759-#783, #794).
const VISUAL = [
  ['Quant', '/quant/#/', '.q-rc-chip', 'Radar-Kompaktkarte mit Belegchips'],
  ['Quant', '/quant/#/radar', '.q-radar-stats', 'Radar mit Richtungszeichen und Zaehlungen'],
  ['Quant', '/quant/#/radar', '.q-chip-n', 'Filterzaehlungen'],
  ['Quant', '/quant/#/aktie/NVDA', '.q-check-count', 'Setup-Regelcheckliste'],
  ['Quant', '/quant/#/aktie/NVDA', '.q-evo', 'Evidenz-Ueberblick der drei Stufen'],
  ['Quant', '/quant/#/aktie/NVDA', '.qx-change-tally', 'Bilanz der Veraenderungen'],
  ['Quant', '/quant/#/strategien/quality-compounder', '.qx-cmeters', 'Bedingungs-Balken "Wer passt heute?"'],
  ['Technik', '/quant/#/aktie/NVDA/technik', '.cb-checks', 'Zaehlung "Warum dieses Bild?"'],
  ['Supertrader', '/supertrader/signals/', '.st-risk', 'Risiko der Modellposition als Zahl'],
  ['Screener', '/screener/?f=roic:gt:0.1', '.sc-share', 'Anteil am Universum'],
  ['Vorsorge', '/vorsorge/#/', '.vs-chg', 'Richtungszeichen 1J'],
  ['Vorsorge', '/vorsorge/#/etf/VT', '.vs-bilanz', 'Bilanz der Einordnung'],
  ['Hedgefonds', '/hedgefonds/#/', '.hf-card-val .hf-chg', 'Richtung der Fondsgroesse'],
  ['Hedgefonds', '/hedgefonds/#/aktie/NVDA', '.hf-balance', 'Kaeufer gegen Verkaeufer'],
  ['Elliott', '/elliott/', '.el-splitrow', 'beschrifteter Richtungsbalken']
];
if (only.has('visual')) await guard('visual', async () => {
  console.log('\n[3] Visual-First-Bausteine (' + engine + ')');
  const ctx = await browser.newContext(desktop);
  const byRoute = new Map();
  for (const v of VISUAL) { if (!byRoute.has(v[1])) byRoute.set(v[1], []); byRoute.get(v[1]).push(v); }
  for (const [route, items] of byRoute) {
    const { page, errors } = await open(ctx, route);
    await scrollThrough(page);
    for (const [world, , sel, label] of items) {
      const state = await page.evaluate((s) => { const n = document.querySelector(s); if (!n) return 'missing'; const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? 'visible' : 'hidden'; }, sel);
      state === 'visible' ? pass('visual ' + world, label + ' (' + sel + ')') : fail('visual ' + world, label + ' ' + state + ' (' + sel + ' auf ' + route + ')');
    }
    if (errors.length) fail('visual ' + route, 'Seitenfehler: ' + errors.slice(0, 2).join(' | '));
    await page.close();
  }
  await ctx.close();
});

/* ---------------------------------------------------------------- 4 Kontrast und Ueberlauf */
const CONTRAST = [
  '/quant/#/', '/quant/#/radar', '/quant/#/aktie/NVDA', '/quant/#/aktie/NVDA/technik', '/quant/#/strategien',
  '/supertrader/', '/supertrader/signals/', '/supertrader/stock/NVDA/',
  '/screener/', '/screener/?f=roic:gt:0.1',
  '/vorsorge/#/', '/vorsorge/#/etf/VT', '/vorsorge/#/etfs', '/vorsorge/#/plan', '/vorsorge/#/portfolio',
  '/hedgefonds/#/', '/hedgefonds/#/aktie/NVDA', '/hedgefonds/#/fonds/pershing-square', '/hedgefonds/#/investoren',
  '/elliott/', '/elliott/#/?richtung=ab', '/elliott/#/methodik'
];
if (only.has('contrast')) await guard('contrast', async () => {
  console.log('\n[4] Kontrast und Ueberlauf (' + engine + ')');
  if (!axePath) { console.log('  Hinweis: axe-core nicht gefunden (--axe=<pfad> oder AXE_PATH); Abschnitt entfaellt.'); checks.push({ where: 'contrast', msg: 'SKIPPED_NO_AXE' }); return; }
  for (const theme of ['light', 'dark']) for (const [vpName, vp] of [['390', mobile], ['1440', desktop]]) {
    const ctx = await browser.newContext(vp);
    await ctx.addInitScript(([k, t]) => { try { localStorage.setItem(k, t); } catch {} }, [THEME_KEY, theme]);
    for (const route of CONTRAST) {
      const { page } = await open(ctx, route);
      const key = theme + ' ' + vpName + ' ' + route;
      await page.addScriptTag({ path: axePath });
      const r = await page.evaluate(async () => {
        const res = await axe.run(document, { runOnly: ['color-contrast'] });
        return { n: res.violations.reduce((s, v) => s + v.nodes.length, 0), ex: res.violations.flatMap((v) => v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' ' + (n.any[0]?.data?.contrastRatio ?? ''))), ov: document.documentElement.scrollWidth > window.innerWidth + 1 };
      });
      if (r.n) { fail('contrast ' + key, r.n + ' Verstoesse, z. B. ' + r.ex.join(' ; ')); await page.screenshot({ path: `${out}/contrast-${theme}-${vpName}-${route.replace(/[^a-z0-9]+/gi, '_')}.png` }); }
      else checks.push({ where: 'contrast ' + key, msg: '0' });
      if (r.ov) fail('overflow ' + key, 'horizontaler Ueberlauf');
      await page.close();
    }
    await ctx.close();
  }
  const ok = checks.filter((c) => c.where.startsWith('contrast ')).length;
  console.log('  ok contrast: ' + ok + ' von ' + CONTRAST.length * 4 + ' Kombinationen ohne Verstoss');
});

await browser.close();
await writeFile(`${out}/results.json`, JSON.stringify({ engine, base, checks: checks.length, findings }, null, 2));
console.log(`\n${checks.length} Pruefungen, ${findings.length} Befund(e)`);
process.exitCode = findings.length ? 1 : 0;
