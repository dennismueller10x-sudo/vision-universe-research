#!/usr/bin/env node
// Supertrader — Browser-QA (mobil 390 px und Desktop 1280 px).
//
// Startet einen statischen Server auf dem Repository (oder --site=<dir>),
// oeffnet alle Supertrader-Routen und prueft: keine Seiten-/Konsolenfehler,
// kein horizontaler Ueberlauf, Kerninhalt gerendert, mobile Bottom-Navigation
// sichtbar, Chart zeichnet auf der Strategy Lens. Screenshots nach --out.
//
// Aufruf: node scripts/supertrader/browser-qa.mjs [--site=.] [--out=qa] [--base=http://...]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const SITE = path.resolve(args.site || '.');
const OUT = path.resolve(args.out || 'supertrader-qa');
fs.mkdirSync(OUT, { recursive: true });

function loadPlaywright() {
  const tries = [args.playwright, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean);
  for (const t of tries) { try { return createRequire(import.meta.url)(t); } catch { /* weiter */ } }
  throw new Error('playwright nicht gefunden (--playwright=<pfad>)');
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.gz': 'application/gzip', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
function serve(root) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(root, p);
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

async function main() {
  const { chromium } = loadPlaywright();
  let server = null, base = args.base;
  if (!base) { server = await serve(SITE); base = `http://127.0.0.1:${server.address().port}`; }
  const signals = JSON.parse(fs.readFileSync(path.join(SITE, 'supertrader/data/signals.json'), 'utf8'));
  const registry = JSON.parse(fs.readFileSync(path.join(SITE, 'supertrader/data/registry.json'), 'utf8'));
  const hasPortfolio = fs.existsSync(path.join(SITE, 'supertrader/data/portfolio.json'));
  let lensSymbol = null;
  for (const st of Object.values(signals.strategies)) { if (st.open[0]) { lensSymbol = st.open[0].symbol; break; } }
  const routes = [
    ['home', '/supertrader/', '.st-hero h1'],
    ['signals', '/supertrader/signals/', '.st-chips button'],
    ['signals-canslim', '/supertrader/signals/?method=CANSLIM', '.st-card2.partial, .st-emptybox'],
    ['strategies', '/supertrader/strategies/', '.st-cmp'],
    ['backtests', '/supertrader/backtests/', '.st-btrow'],
    ['sources', '/supertrader/sources/', '.st-det'],
    ...registry.strategies.map((s) => [`strategy-${s.slug}`, `/supertrader/strategies/${s.slug}/`, '.st-hero h1']),
  ];
  if (lensSymbol) routes.push(['lens', `/supertrader/stock/${lensSymbol}/`, '.st-lensblock .st-next']);
  const csSym = signals.partialChecks?.CANSLIM?.candidates?.[0]?.symbol;
  // Teilpruefung steht hinter vollstaendigen Modellen; sichtbar als eigener Tab.
  if (csSym) routes.push(['lens-partial', `/supertrader/stock/${csSym}/`, '.st-critlist, .st-chips.lens button']);
  routes.push(['lens-empty', '/supertrader/stock/?s=ZZZZ', '.st-emptybox']);
  // Runde 12: Modelldepot VU Trendfolge 52W - Methode mit Marktampel/Rangliste, Einzelwert mit Status
  const t52file = path.join(SITE, 'supertrader/data/trend52.json');
  if (fs.existsSync(t52file)) {
    const t52 = JSON.parse(fs.readFileSync(t52file, 'utf8'));
    routes.push(['strategy-trend52-model', '/supertrader/strategies/vu-trendfolge-52w/', '.st-mphead']);
    const sym = t52.portfolio.positions[0]?.symbol || t52.prepared.candidates[0]?.symbol;
    if (sym) routes.push(['lens-trend52', `/supertrader/stock/${sym}/`, '.st-research']);
  }
  if (fs.existsSync(path.join(SITE, 'supertrader/data/replay.json'))) routes.push(['replay', '/supertrader/beispiel/', '.st-demo-banner']);
  const watchSym = (signals.strategies.DONCHIAN_TURTLE?.open || []).find((x) => !x.entry)?.symbol;
  if (watchSym) routes.push(['lens-watch', `/supertrader/stock/${watchSym}/`, '.st-lensblock']);
  const posSym = Object.values(signals.strategies).flatMap((st) => st.open).find((x) => x.entry)?.symbol;
  if (posSym) routes.push(['lens-position', `/supertrader/stock/${posSym}/`, '.st-lensblock .st-next']);
  const reSym = (() => { for (const id of Object.keys(signals.strategies)) { try { const l = JSON.parse(fs.readFileSync(path.join(SITE, 'supertrader/data/ledger', id + '.json'), 'utf8')); const s = [...l.open, ...l.closed].find((x) => x.discovery?.kind === 'RULE_VERSION_REASSESSMENT'); if (s) return s.symbol; } catch { /* kein Ledger */ } } return null; })();
  if (reSym) routes.push(['lens-reassessed', `/supertrader/stock/${reSym}/`, '.st-tl']);

  const browser = await chromium.launch({ executablePath: args.chromium || undefined });
  const pw = loadPlaywright();
  const iphone = pw.devices && pw.devices['iPhone 14'] ? { ...pw.devices['iPhone 14'] } : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
  delete iphone.defaultBrowserType;
  const viewports = [['mobile', iphone, true], ['desktop', { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 }, false]];
  const failures = [];
  const report = [];
  for (const [vpName, vp, isMobile] of viewports) {
    const ctx = await browser.newContext(vp);
    // Research-Zugangsmaske: der Smoke geht den echten geschuetzten Weg. Zuerst
    // wird geprueft, dass die Maske ohne Login schuetzt - auch gegen einen aus
    // dem oeffentlichen Pruefwert gebauten Browserzustand -, dann wird ueber das
    // Formular mit dem Passwort aus RESEARCH_ACCESS_PASSWORD eingeloggt (nie geloggt).
    if (args['access-login']) {
      const pass = process.env.RESEARCH_ACCESS_PASSWORD || '';
      const p = await ctx.newPage();
      await p.goto(base + '/supertrader/', { waitUntil: 'domcontentloaded' });
      await p.locator('#research-access-gate').waitFor({ timeout: 30000 });
      await p.waitForTimeout(1500);
      if (await p.locator('.st-hero').count()) failures.push(`${vpName} Zugangsmaske: Produkt ohne Login sichtbar`);
      const cfg = JSON.parse(await p.locator('#research-access-settings').textContent());
      await p.evaluate((c) => localStorage.setItem(c.storageKey, JSON.stringify({ version: c.version, verifier: c.verifier, key: c.verifier, expiresAt: Date.now() + c.durationMs })), cfg);
      await p.reload({ waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(2500);
      if (await p.locator('.st-hero').count()) failures.push(`${vpName} Zugangsmaske: oeffentlicher Pruefwert oeffnet das Produkt`);
      // Gefaelschten Zustand entfernen, damit der Login wirklich ueber das Formular geht.
      await p.evaluate((c) => localStorage.removeItem(c.storageKey), cfg);
      await p.reload({ waitUntil: 'domcontentloaded' });
      if (!pass) failures.push(`${vpName} Zugangsmaske aktiv, aber kein Testpasswort (Secret RESEARCH_ACCESS_PASSWORD) verfuegbar`);
      else if (!(await p.locator('#research-password').count())) failures.push(`${vpName} Zugangsmaske: Formular nicht gefunden`);
      else {
        await p.locator('#research-password').fill(pass);
        await p.locator('#research-access-form button').click();
        try { await p.locator('.st-hero').waitFor({ timeout: 60000 }); } catch { failures.push(`${vpName} Login ueber die Zugangsmaske fehlgeschlagen`); }
      }
      await p.close();
    }
    for (const [name, url, selector] of routes) {
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      // Fehlgeschlagene Antworten mit URL melden (Favicon ausgenommen); die URL-lose Konsolenmeldung
      // „Failed to load resource“ ist damit doppelt und wird nicht zusaetzlich gezaehlt.
      page.on('response', (r) => { if (r.status() >= 400 && !/favicon|site-navigation|live\.visionuniverse/.test(r.url())) errors.push(`http ${r.status()}: ${r.url()}`); });
      page.on('console', (m) => { if (m.type() === 'error' && !/site-navigation|favicon|live\.visionuniverse|^Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
      page.on('requestfailed', (r) => { if (r.url().includes('/supertrader/')) errors.push('requestfailed: ' + r.url()); });
      const t0 = Date.now();
      await page.goto(base + url, { waitUntil: 'networkidle' });
      try { await page.waitForSelector(selector, { timeout: 15000 }); } catch { errors.push(`selector ${selector} fehlt`); }
      if (name === 'lens' || name === 'replay') { try { await page.waitForSelector('.st-chart svg path', { timeout: 20000 }); } catch { errors.push('Chart nicht gezeichnet'); } }
      const m = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        failedLoad: /konnte nicht geladen werden/.test(document.body.innerText),
        // Gemeinsame Produkt-Leiste der Vision-Universe-Shell (#vu-dock, Shadow DOM): bei jeder Breite unten, mit ☰ fuer das globale Menue.
        bottomNav: (() => { const n = document.querySelector('#vu-dock')?.shadowRoot?.querySelector('nav'); if (!n) return false; const r = n.getBoundingClientRect(); return r.height > 0 && r.bottom <= innerHeight + 1 && r.bottom >= innerHeight - 40 && n.querySelectorAll('a').length === 4 && !!n.querySelector('button.menu') && n.querySelector('a').textContent.trim() === 'Supertrader'; })(),
        homeB: location.pathname === '/supertrader/' ? [...document.querySelectorAll('.st-q[data-q="B"]')].filter((e) => e.textContent.trim() === 'B-Setup').length : 0,
        researchSection: !!document.querySelector('.st-research'),
        researchInNear: [...document.querySelectorAll('.st-sec')].filter((x) => /Am nächsten am Einstieg/.test(x.querySelector('h2')?.textContent || '')).some((x) => x.querySelector('.st-note-tag.research')),
        evBanner: !!document.querySelector('.st-evbanner'),
        fidBanner: !!document.querySelector('.st-fidban'),
        portfolioSec: [...document.querySelectorAll('.st-sec h2')].some((x) => x.textContent === 'Modellportfolio'),
        // Regelwechsel darf im Protokoll nicht wie ein zweites Marktereignis aussehen.
        tlDuplicates: (() => { const seen = new Set(); let d = 0; for (const li of document.querySelectorAll('.st-tl li')) { if (li.dataset.kind === 'reassessed') continue; const k = li.textContent.trim(); if (seen.has(k)) d++; seen.add(k); } return d; })(),
        cardsWithoutPhase: [...document.querySelectorAll('.st-card2')].filter((c) => !c.querySelector('.st-phase')).length,
        buyTone: /jetzt kaufen|buy now|kaufempfehlung(?! |,)|kaufen sie/i.test(document.body.innerText.replace(/keine kauf- oder verkaufsempfehlung/ig, '')),
        textLen: document.body.innerText.length,
        // Ein vorbereitetes Setup darf nie eine Ausfuehrung zeigen.
        // Ein vorbereitetes Setup darf nie eine Ausfuehrung zeigen.
        preparedWithEntry: [...document.querySelectorAll('.st-lensblock')].filter((b) => b.querySelector('.st-phase[data-p="prep"]') && [...b.querySelectorAll('.st-cells .c')].some((c) => c.querySelector('.k')?.textContent === 'Modelleinstieg' && c.querySelector('strong')?.textContent !== 'keiner')).length,
        plannedUnlabeled: [...document.querySelectorAll('.st-cells .c')].filter((c) => ['Trigger', 'Ungültig'].includes(c.querySelector('.k')?.textContent) && !/geplant/.test(c.querySelector('.d')?.textContent || '')).length,
        lensPlanBottom: (() => { const n = document.querySelector('.st-lensblock .st-next'); return n ? n.getBoundingClientRect().bottom : null; })(),
        ruleCard: !!document.querySelector('.st-assess'),
        freshness: !!document.querySelector('.st-fresh'),
        // Beobachtungsliste (Donchian) nie als „vorbereitet“ beschriftet
        watchAsPrepared: [...document.querySelectorAll('.st-card2, .st-lensblock')].filter((c) => /Donchian/.test(c.textContent) && c.querySelector('.st-phase[data-p="prep"]')).length,
        watchTile: !!document.querySelector('.st-kpi[data-p="watch"]'),
        // interne Regel-/Gate-Codes nicht im sichtbaren Text
        codes: (document.body.innerText.match(/\b(?:DON|KK|DAR|MIN|WEI|LC|PILOT)-[A-Z0-9-]+\b/g) || []).slice(0, 3),
        replayBanner: /kein aktuelles Signal/.test(document.body.innerText),
        partialAsSignal: /CAN-SLIM-Signal(?! )/.test(document.body.innerText.replace(/kein(em)? CAN-SLIM-Signal/gi, '')),
      }));
      if (m.overflow > 1) errors.push(`horizontaler Ueberlauf ${m.overflow}px`);
      if (m.failedLoad) errors.push('Ladefehler-Zustand sichtbar');
      if (!m.bottomNav) errors.push('Produkt-Leiste fehlt oder steht nicht unten');
      if (m.buyTone) errors.push('Kaufaufforderungs-Ton gefunden');
      if (name === 'home' && m.homeB) errors.push(`${m.homeB} Darvas-B-Setups prominent auf der Startseite`);
      if (m.cardsWithoutPhase) errors.push(`${m.cardsWithoutPhase} Aktienkarten ohne Phasenabzeichen`);
      if (m.partialAsSignal) errors.push('Teiltreffer als CAN-SLIM-Signal bezeichnet');
      if (m.watchAsPrepared) errors.push(`${m.watchAsPrepared} Donchian-Eintraege als „vorbereitet“ beschriftet (Beobachtungsliste)`);
      const researchIds = registry.strategies.filter((x) => x.evidence?.presentation === 'RESEARCH').map((x) => x.strategy_id);
      if (name === 'home' && researchIds.some((id) => signals.strategies[id]?.open?.length) && !m.researchSection) errors.push('Forschung/Modellbeobachtung fehlt auf der Startseite');
      if (name === 'home' && m.researchInNear) errors.push('Forschungsmethode als Einstiegschance hervorgehoben');
      if (/^strategy-(momentum|weinstein|darvas|minervini|donchian|can-slim|piotroski|greenblatt)/.test(name) && !m.evBanner) errors.push('Evidenz-Einstufung fehlt auf der Methodenseite');
      if ((['home', 'signals', 'lens', 'lens-watch', 'lens-position', 'backtests', 'replay'].includes(name) || /^strategy-/.test(name)) && m.codes.length) errors.push('interne Codes sichtbar: ' + m.codes.join(', '));
      if (/^strategy-(momentum|weinstein|darvas|minervini|donchian|can-slim|piotroski|greenblatt)/.test(name) && !m.fidBanner) errors.push('Methodentreue fehlt auf der Methodenseite');
      if (hasPortfolio && /^strategy-(momentum|weinstein|darvas|minervini|donchian)/.test(name) && !m.portfolioSec) errors.push('Modellportfolio fehlt auf der Methodenseite');
      if (m.tlDuplicates) errors.push(`${m.tlDuplicates} doppelte Einträge im Protokoll`);
      if (name === 'replay' && !m.replayBanner) errors.push('Replay ohne Kennzeichnung „kein aktuelles Signal“');
      if (['home', 'signals', 'lens'].includes(name) && !m.freshness) errors.push('Datenstand nicht sichtbar');
      if (m.preparedWithEntry) errors.push(`${m.preparedWithEntry} vorbereitete Setups zeigen einen Modelleinstieg`);
      if (m.plannedUnlabeled) errors.push(`${m.plannedUnlabeled} Schwellen ohne „geplant“/Datenstand`);
      if (name === 'lens' && isMobile && !(m.lensPlanBottom !== null && m.lensPlanBottom <= vp.viewport.height - 64)) errors.push(`Ein-/Ausstiegsblock nicht ohne Scrollen sichtbar (unten ${Math.round(m.lensPlanBottom)}px, sichtbar bis ${vp.viewport.height - 64}px)`);
      if (/^strategy-(momentum|weinstein|darvas|minervini|greenblatt|donchian|can-slim|piotroski)/.test(name) && !m.ruleCard) errors.push('Drei Aussagen (Regel/Quellen/Historie) fehlen');
      const shot = path.join(OUT, `${vpName}-${name}.png`);
      await page.screenshot({ path: shot, fullPage: name === 'home' || name === 'lens' });
      report.push({ viewport: vpName, route: url, ms: Date.now() - t0, errors });
      if (errors.length) failures.push(`${vpName} ${url}: ${errors.join(' | ')}`);
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
  if (server) server.close();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ base, routes: routes.length, checks: report }, null, 2));
  console.log(`Supertrader Browser-QA: ${report.length} Seitenaufrufe, ${failures.length} Fehler`);
  for (const f of failures) console.log('  FAIL ' + f);
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
