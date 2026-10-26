// Fundamental: mehrere Kennzahlen in einem Verlauf (fundamental/engine/compare.js) im Browser, gezielt fuer das iPhone.
// Ergaenzt vu3-regression-qa.mjs (dort nur: der Baustein ist sichtbar) um die Bedienung:
//
//  1 "+ Kennzahl" -> mobiler Dialog (unten, volle Breite, 16-px-Suche gegen Fokuszoom), Suche, Kategorie, Auswahl
//  2 synchrones Ablesen per Antippen: alle Kennzahlen zum selben Zeitraum, Zeitraum wechselt mit der Position
//  3 Lesbarkeit: beide Y-Achsen neben der Zeichenflaeche, im Diagramm, nicht ueberlappend; Legende ohne Abschneiden
//  4 Touch-Flaechen der neuen Bedienelemente mindestens 44 × 44 px
//  5 Vollbild im Dialog, Schliessen, keine Scroll-Sperre danach
//  6 Entfernen aller weiteren Kennzahlen stellt die Ansicht wieder her: Balken, Diagrammart, Branchenvergleich
//    (auch eine vorher gewaehlte Vergleichsgruppe), Tabelle, Adresse
//  7 ueberall: keine Seitenfehler, keine horizontale Ueberbreite
//  8 Max zeigt alle verfuegbaren Jahre mit ihrem ersten Jahr ("seit GJ ..."), auch im Vergleich; 10J bleibt 10 Jahre
//
// Aufruf:  node scripts/quality/fundamental-compare-qa.mjs --url=http://127.0.0.1:8765 [--out=/tmp/fu-compare-qa]
//            [--engine=webkit|chromium] [--viewports=390x844,430x932] [--playwright=<pfad>]
// Schreibt nur nach --out (results.json, Screenshots je Schritt), nie in das Repository.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const base = arg('url', 'http://127.0.0.1:8765').replace(/\/$/, '');
const out = arg('out', '/tmp/fu-compare-qa');
const engine = arg('engine', 'webkit');
const viewports = arg('viewports', '390x844,430x932').split(',').map((v) => v.split('x').map(Number));
const require = createRequire(import.meta.url);
const pw = require(arg('playwright', process.env.PLAYWRIGHT_PATH || 'playwright'));
await mkdir(out, { recursive: true });

const MIN_TOUCH = 44;
const findings = [], checks = [];
const fail = (where, msg) => { findings.push({ where, msg }); console.log('FAIL ' + where + ': ' + msg); };
const pass = (where, msg) => { checks.push({ where, msg }); console.log('  ok ' + where + ': ' + msg); };
const expect = (where, cond, msg, detail) => (cond ? pass(where, msg) : fail(where, msg + (detail ? ' – ' + detail : '')));

const browser = await pw[engine].launch(engine === 'chromium' ? { ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--disable-dev-shm-usage'] } : {});
const profile = (w, h) => ({ ...(engine === 'webkit' ? pw.devices['iPhone 14'] : { isMobile: true, deviceScaleFactor: 3 }), hasTouch: true, viewport: { width: w, height: h } });

async function open(ctx, path, sel) {
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + path, { waitUntil: 'load' });
  await page.waitForSelector(sel, { timeout: 30000 });
  await page.waitForTimeout(500);
  return { page, errors };
}
const hashOf = (page) => decodeURIComponent(page.url().split('#')[1] || '');
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const rect = (page, sel) => page.$eval(sel, (n) => { const r = n.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; });
async function tapEl(page, sel) {
  await page.$eval(sel, (n) => n.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(150);
  const r = await rect(page, sel);
  await page.touchscreen.tap(r.x + r.w / 2, r.y + r.h / 2);
  await page.waitForTimeout(250);
}
/* Antippen der Zeichenflaeche an einer relativen Position (0 = erster, 1 = letzter Zeitraum). */
async function tapPlot(page, scope, f) {
  const sel = scope + ' .fu-mc-plot';
  await page.$eval(sel, (n) => n.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(150);
  const r = await rect(page, sel);
  await page.touchscreen.tap(r.x + r.w * (0.04 + 0.92 * f), r.y + r.h / 2);
  await page.waitForTimeout(200);
  return page.$eval(scope + ' .fu-mc-read', (n) => ({ head: n.querySelector('.fu-mc-rh b').textContent, rows: [...n.querySelectorAll('.fu-mc-rows li')].map((li) => li.querySelector('.fu-mc-l').textContent + ' ' + li.querySelector('b').textContent) }));
}
/* Zustand der Detailansicht ohne weitere Kennzahlen: was nach dem Entfernen wieder genau so sein muss. */
const viewState = (page) => page.evaluate(() => {
  const vis = (n) => !!n && !n.closest('[hidden]') && n.getClientRects().length > 0;
  const pressed = (label) => { const g = document.querySelector('.fu-seg[aria-label="' + label + '"]'); return g && vis(g) ? [...g.querySelectorAll('[aria-pressed=true]')].map((b) => b.getAttribute('aria-label') || b.textContent).join('|') : null; };
  return {
    bars: document.querySelectorAll('.fu-bars .fu-bc').length, lines: document.querySelectorAll('.fu-lines:not(.fu-mc)').length, multi: document.querySelectorAll('.fu-mc').length,
    median: document.querySelectorAll('.fu-l-median').length, kind: pressed('Diagrammart'), cmp: pressed('Vergleich'), period: pressed('Zeitraum-Art'), range: pressed('Zeitraum'),
    peerSection: [...document.querySelectorAll('.fu-hb li')].length, table: [...document.querySelectorAll('.fu-table:not(.fu-mc-table) thead th')].map((t) => t.textContent).join('|'),
    plusChips: document.querySelectorAll('.fu-pchip').length, modeVisible: vis(document.querySelector('.fu-mc-mode .fu-seg'))
  };
});
async function shot(page, name) { await page.screenshot({ path: `${out}/${name}.png` }).catch(() => {}); }

/* Mindestgroesse der Touch-Flaechen (sichtbare Elemente). */
async function touchTargets(page, where, sels) {
  const small = await page.evaluate(({ sels, min }) => sels.flatMap((s) => [...document.querySelectorAll(s)].filter((n) => n.getClientRects().length && !n.closest('[hidden]'))
    .map((n) => { const r = n.getBoundingClientRect(); return { s, w: Math.round(r.width), h: Math.round(r.height), t: (n.getAttribute('aria-label') || n.textContent || '').trim().slice(0, 24) }; })
    .filter((x) => x.w < min || x.h < min)), { sels, min: MIN_TOUCH });
  expect(where, !small.length, 'Touch-Flaechen >= ' + MIN_TOUCH + ' px (' + sels.join(', ') + ')', JSON.stringify(small.slice(0, 4)));
}
/* Achsen und Legende: Beschriftung neben der Zeichenflaeche, innerhalb der Karte und des Bildschirms, lesbar gross. */
async function legibility(page, where) {
  const r = await page.evaluate(() => {
    const card = document.querySelector('.fu-mc').closest('.fu-card') || document.querySelector('.fu-mc'), cr = card.getBoundingClientRect();
    const out = { problems: [], axes: 0 };
    document.querySelectorAll('.fu-mc-plot').forEach((plot) => {
      const pr = plot.getBoundingClientRect();
      plot.querySelectorAll('.fu-laxis').forEach((ax) => {
        out.axes++;
        const left = ax.classList.contains('fu-laxis-l'), spans = [...ax.querySelectorAll('span')].map((s) => ({ t: s.textContent, r: s.getBoundingClientRect(), fs: parseFloat(getComputedStyle(s).fontSize) }));
        spans.forEach((s) => {
          if (s.fs < 10) out.problems.push('Schrift ' + s.fs + 'px: ' + s.t);
          if (s.r.left < cr.left - 0.5 || s.r.right > cr.right + 0.5 || s.r.right > innerWidth) out.problems.push('ausserhalb der Karte: ' + s.t);
          if (left ? s.r.right > pr.left + 1 : s.r.left < pr.right - 1) out.problems.push('ueberdeckt die Zeichenflaeche: ' + s.t);
        });
        for (let i = 1; i < spans.length; i++) for (let k = 0; k < i; k++) { const a = spans[i].r, b = spans[k].r; if (a.top < b.bottom - 1 && b.top < a.bottom - 1) out.problems.push('ueberlappend: ' + spans[i].t + ' / ' + spans[k].t); }
      });
    });
    document.querySelectorAll('.fu-mc-legend li, .fu-mc-units .fu-mc-u, .fu-mc-rows .fu-mc-l').forEach((n) => {
      const nr = n.getBoundingClientRect();
      if (n.scrollWidth > n.clientWidth + 1) out.problems.push('abgeschnitten: ' + n.textContent.trim());
      if (nr.right > cr.right + 0.5 || nr.left < cr.left - 0.5) out.problems.push('Legende ausserhalb: ' + n.textContent.trim());
    });
    const ro = document.querySelector('.fu-mc-read').getBoundingClientRect();
    if (ro.right > innerWidth || ro.left < 0) out.problems.push('Ablesefeld breiter als der Bildschirm');
    return out;
  });
  expect(where, r.axes >= 1 && !r.problems.length, 'Achsen (' + r.axes + '), Legende und Ablesefeld lesbar und im Diagramm', r.problems.slice(0, 4).join('; '));
}

for (const [w, h] of viewports) {
  const tag = engine + ' ' + w + 'px';
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext(profile(w, h));
    await ctx.addInitScript((t) => { try { localStorage.setItem('vu-discover-theme-v1', t); } catch (e) { /* privat */ } }, theme);
    const at = tag + ' ' + theme;
    try {
      /* ---- A: Ausgangsansicht (Balken) -> + Kennzahl -> Auswahl -> Ablesen -> Vollbild -> Entfernen */
      const { page, errors } = await open(ctx, '/fundamental/#/TSLA?ansicht=kennzahl&k=revenue', '.fu-bars .fu-bc.is-last');
      const before = await viewState(page);
      expect(at, before.bars > 0 && before.kind && before.cmp !== null && before.peerSection > 0 && !before.plusChips, 'Ausgangsansicht: Balken, Diagrammart, Vergleich, Branchenvergleich', JSON.stringify(before));
      await touchTargets(page, at, ['.fu-plus-b']);
      await tapEl(page, '.fu-plus-b');
      await page.waitForSelector('dialog.fu-sheet[open]', { timeout: 5000 });
      const dlg = await page.evaluate(() => {
        const d = document.querySelector('dialog.fu-sheet[open]'), r = d.getBoundingClientRect(), i = d.querySelector('input[type=search]');
        return { top: r.top, bottom: r.bottom, w: r.width, vh: innerHeight, vw: innerWidth, fs: parseFloat(getComputedStyle(i).fontSize), locked: document.documentElement.classList.contains('fu-locked'), rows: d.querySelectorAll('.fu-pick-row:not([disabled])').length };
      });
      expect(at, Math.abs(dlg.bottom - dlg.vh) <= 1 && Math.abs(dlg.w - dlg.vw) <= 1 && dlg.top > 0, 'Dialog unten in voller Breite', JSON.stringify(dlg));
      expect(at, dlg.fs >= 16, 'Suche mit 16 px (kein Fokuszoom auf dem iPhone)', 'font-size ' + dlg.fs);
      expect(at, dlg.locked && dlg.rows > 10, 'Seite gesperrt, ' + dlg.rows + ' waehlbare Kennzahlen');
      await touchTargets(page, at + ' Dialog', ['.fu-sheet-x', '.fu-pick-sug .fu-chip', '.fu-pick-row']);
      await shot(page, `picker-${w}-${theme}`);
      await page.fill('.fu-sheet input[type=search]', 'free cashflow');
      await page.waitForTimeout(150);
      const found = await page.$$eval('.fu-pick-row:not([disabled]) b', (b) => b.map((x) => x.textContent));
      expect(at, found.includes('Free Cashflow') && found.every((t) => /free/i.test(t)), 'Suche filtert', found.join(', '));
      await page.fill('.fu-sheet input[type=search]', '');
      await tapEl(page, '.fu-sheet .fu-seg-b[data-cat=cashflow]');
      const cat = await page.$$eval('.fu-pick-list > section h3', (x) => x.map((n) => n.textContent));
      expect(at, cat.length === 1 && cat[0] === 'Cashflow', 'Kategorie filtert', cat.join(', '));
      const fcfRow = await page.evaluateHandle(() => [...document.querySelectorAll('.fu-pick-row:not([disabled])')].find((b) => b.querySelector('b').textContent === 'Free Cashflow'));
      await fcfRow.asElement().scrollIntoViewIfNeeded();
      const fr = await fcfRow.asElement().boundingBox();
      await page.touchscreen.tap(fr.x + fr.width / 2, fr.y + fr.height / 2);
      await page.waitForSelector('.fu-mc .fu-l-m.m1', { timeout: 5000 });
      await page.waitForTimeout(300);
      const after = await viewState(page);
      expect(at, !(await page.$('dialog.fu-sheet')) && !(await page.evaluate(() => document.documentElement.classList.contains('fu-locked'))), 'Dialog nach Auswahl geschlossen, keine Scroll-Sperre');
      expect(at, hashOf(page).endsWith('&plus=free_cash_flow') && after.multi === 1 && after.bars === 0 && after.plusChips === 2 && after.modeVisible && after.cmp === null && after.kind === null,
        'Gemeinsamer Verlauf statt Balken, Vergleich ruht, Auswahl in der Adresse', JSON.stringify(after) + ' ' + hashOf(page));
      await touchTargets(page, at, ['.fu-plus-b', '.fu-pchip-x', '.fu-mc-full']);
      // Synchrones Ablesen: links fruehes, rechts letztes Geschaeftsjahr, immer beide Kennzahlen
      const first = await tapPlot(page, '.fu-mc', 0), last = await tapPlot(page, '.fu-mc', 1);
      expect(at, first.head !== last.head && first.rows.length === 2 && last.rows.length === 2 && /Umsatz/.test(last.rows[0]) && /Free Cashflow/.test(last.rows[1]),
        'Antippen liest beide Kennzahlen zum selben Zeitraum ab', first.head + ' → ' + last.head + ' · ' + last.rows.join(' / '));
      const dots = await page.$$eval('.fu-mc .fu-lmarks .fu-mdot', (x) => x.length);
      expect(at, dots === 2, 'Markierung auf jeder Linie am gewaehlten Zeitraum', dots + ' Punkte');
      await shot(page, `tsla-revenue-fcf-${w}-${theme}`);
      // Vollbild
      await tapEl(page, '.fu-mc-full');
      await page.waitForSelector('dialog.fu-sheet-full[open] .fu-mc', { timeout: 5000 });
      const full = await tapPlot(page, 'dialog.fu-sheet-full', 0.5);
      expect(at, full.rows.length === 2 && (await overflow(page)) <= 0, 'Vollbild: Diagramm mit Ablesen im Dialog', full.head);
      await shot(page, `fullscreen-${w}-${theme}`);
      await tapEl(page, 'dialog.fu-sheet-full .fu-sheet-x');
      expect(at, !(await page.$('dialog.fu-sheet')) && !(await page.evaluate(() => document.documentElement.classList.contains('fu-locked'))), 'Vollbild geschlossen, keine Scroll-Sperre');
      // Entfernen -> Ausgangsansicht
      await tapEl(page, '.fu-pchip-x');
      await page.waitForSelector('.fu-bars .fu-bc.is-last', { timeout: 5000 });
      const restored = await viewState(page);
      expect(at, JSON.stringify(restored) === JSON.stringify(before) && hashOf(page) === '/TSLA?ansicht=kennzahl&k=revenue', 'Nach dem Entfernen wieder genau die Ausgangsansicht', JSON.stringify(restored) + ' ' + hashOf(page));
      expect(at, (await overflow(page)) <= 0 && !errors.length, 'keine Ueberbreite, keine Seitenfehler', errors.slice(0, 2).join(' | '));
      await page.close();

      /* ---- Max (eine Kennzahl): alle Jahre, mit erstem Jahr; 10J bleibt 10 */
      const m = await open(ctx, '/fundamental/#/TSLA?ansicht=kennzahl&k=revenue', '.fu-bars .fu-bc.is-last');
      const ten = await m.page.$$eval('.fu-bars .fu-bc', (x) => x.length);
      await tapEl(m.page, '.fu-seg[aria-label=Zeitraum] .fu-seg-b:nth-child(4)');
      const maxInfo = await m.page.evaluate(() => ({ bars: document.querySelectorAll('.fu-bars .fu-bc').length, since: (document.querySelector('.fu-since') || {}).textContent || '' }));
      const sinceN = Number((/\((\d+) Jahre\)/.exec(maxInfo.since) || [])[1]);
      expect(at, ten <= 10 && maxInfo.bars >= ten && /^Max: alle verfügbaren Geschäftsjahre – seit GJ \d{4}/.test(maxInfo.since) && sinceN <= maxInfo.bars,
        'Max: alle Jahre mit erstem Jahr, 10J hoechstens 10', ten + ' → ' + maxInfo.bars + ' · ' + maxInfo.since);
      await m.page.close();

      /* ---- B: zwei Einheiten (KGV links, Free Cashflow rechts): Achsen, Legende, Ablesen */
      const b = await open(ctx, '/fundamental/#/NVDA?ansicht=kennzahl&k=pe&plus=free_cash_flow', '.fu-mc .fu-l-m.m1');
      await b.page.$eval('.fu-mc', (n) => n.scrollIntoView({ block: 'center' }));
      const dual = await b.page.$$eval('.fu-mc .fu-laxis', (x) => x.map((a) => (a.classList.contains('fu-laxis-l') ? 'L' : 'R')).join(''));
      expect(at, dual === 'LR', 'Zwei Einheiten: linke und rechte Achse', dual);
      await legibility(b.page, at + ' KGV+FCF');
      const r1 = await tapPlot(b.page, '.fu-mc', 0), r2 = await tapPlot(b.page, '.fu-mc', 1);
      expect(at, /KGV/.test(r2.rows[0]) && /Free Cashflow/.test(r2.rows[1]) && /keine Angabe/.test(r1.rows[1]), 'Ablesen: Luecke vor dem ersten Free Cashflow bleibt „keine Angabe“', r1.rows.join(' / '));
      // Max im Vergleich: Achse beginnt mit der laengeren Reihe (KGV), Free Cashflow davor Luecke; erstes Jahr je Kennzahl genannt
      await tapEl(b.page, '.fu-seg[aria-label=Zeitraum] .fu-seg-b:nth-child(4)');
      const mx = await b.page.evaluate(() => ({ notes: document.querySelector('.fu-mc-notes').textContent, first: document.querySelector('.fu-lines-x span') && document.querySelector('.fu-lines-x span').textContent }));
      const rm = await tapPlot(b.page, '.fu-mc', 0);
      expect(at, /Max: alle verfügbaren Geschäftsjahre – KGV seit GJ \d{4} \(\d+ Jahre\) · Free Cashflow seit GJ \d{4}/.test(mx.notes) && /keine Angabe/.test(rm.rows[1]) && !/keine Angabe/.test(rm.rows[0]),
        'Max im Vergleich: nicht auf die kuerzere Reihe verkuerzt, Startjahr je Kennzahl', rm.head + ' · ' + (mx.notes.match(/Max:[^.]*\./) || [''])[0]);
      await shot(b.page, `nvda-pe-fcf-${w}-${theme}`);
      // Drei Einheiten: Index, dann getrennt
      await b.page.goto(base + '/fundamental/#/NVDA?ansicht=kennzahl&k=pe&plus=revenue.operating_margin');
      await b.page.reload(); await b.page.waitForSelector('.fu-mc .fu-l-m.m2', { timeout: 30000 }); await b.page.waitForTimeout(400);
      const mode = await b.page.$eval('.fu-mc', (n) => n.dataset.mode);
      const axesOff = await b.page.$eval('.fu-mc-mode .fu-seg-b', (n) => n.disabled);
      expect(at, mode === 'index' && axesOff, 'Drei Einheiten: Index 100, gemeinsame Achse gesperrt', mode);
      // Umschalter Achsen / Index 100 / Getrennt: sichtbar 38 px wie die bestehenden Umschalter, Trefferflaeche 44 px
      const hit = await b.page.evaluate(() => [...document.querySelectorAll('.fu-mc-mode .fu-seg-b')].map((n) => {
        n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(), x = r.left + r.width / 2, inside = (y) => { const e = document.elementFromPoint(x, y); return !!e && (e === n || n.contains(e)); };
        return { h: Math.round(r.height), w: Math.round(r.width), top: inside(r.top - 2.5), bottom: inside(r.bottom + 2.5) };
      }));
      expect(at, hit.length === 3 && hit.every((x) => x.h <= 40 && x.top && x.bottom && x.h + 6 >= 44 && x.w >= 44),
        'Darstellungs-Umschalter: sichtbar 38 px, Trefferflaeche mindestens 44 px', JSON.stringify(hit));
      await legibility(b.page, at + ' Index');
      await tapEl(b.page, '.fu-mc-mode .fu-seg-b:nth-child(3)');
      const panels = await b.page.$$eval('.fu-mc-panel', (x) => x.length);
      expect(at, panels === 3 && hashOf(b.page).endsWith('&d=getrennt'), 'Getrennt: ein Diagramm je Kennzahl', panels + ' · ' + hashOf(b.page));
      await legibility(b.page, at + ' Getrennt');
      const sp = await tapPlot(b.page, '.fu-mc', 0.5);
      expect(at, sp.rows.length === 3, 'Getrennt: gemeinsames Ablesen ueber alle drei', sp.head);
      await shot(b.page, `nvda-split-${w}-${theme}`);
      expect(at, (await overflow(b.page)) <= 0 && !b.errors.length, 'keine Ueberbreite, keine Seitenfehler', b.errors.slice(0, 2).join(' | '));
      await b.page.close();

      /* ---- C: vorher gewaehlter Branchenmedian kommt nach dem Entfernen zurueck */
      const c = await open(ctx, '/fundamental/#/NVDA?ansicht=kennzahl&k=operating_margin', '.fu-lines .fu-l-self');
      await tapEl(c.page, '.fu-seg[aria-label=Vergleich] .fu-seg-b:nth-child(2)');
      await c.page.waitForSelector('.fu-l-median', { timeout: 15000 }); await c.page.waitForTimeout(300);
      const cBefore = await viewState(c.page);
      await tapEl(c.page, '.fu-plus-b');
      await c.page.waitForSelector('dialog.fu-sheet[open]');
      await tapEl(c.page, '.fu-pick-sug .fu-chip');
      await c.page.waitForSelector('.fu-mc .fu-l-m.m1', { timeout: 15000 });
      await tapEl(c.page, '.fu-pchip-x');
      await c.page.waitForSelector('.fu-l-median', { timeout: 15000 }); await c.page.waitForTimeout(300);
      const cAfter = await viewState(c.page);
      expect(at, cBefore.median > 0 && JSON.stringify(cAfter) === JSON.stringify(cBefore), 'Branchenmedian, Linie und Spalte „Branche“ nach dem Entfernen wieder da', JSON.stringify(cAfter));
      expect(at, !c.errors.length, 'keine Seitenfehler', c.errors.slice(0, 2).join(' | '));
      await c.page.close();
    } catch (e) {
      fail(at, 'Abbruch: ' + (e?.message || e).split('\n')[0]);
    }
    await ctx.close();
  }
}
await browser.close();
await writeFile(out + '/results.json', JSON.stringify({ engine, viewports, checks, findings }, null, 2));
console.log('\nFundamental-Vergleich (' + engine + '): ' + checks.length + ' Pruefungen, ' + findings.length + ' Befund(e)');
process.exit(findings.length ? 1 : 0);
