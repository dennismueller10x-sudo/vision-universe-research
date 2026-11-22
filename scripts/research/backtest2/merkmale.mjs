#!/usr/bin/env node
/**
 * Backtest 2.0, Stufe 2 – Merkmals-Studie auf eigenen Daten. Forschung, nicht zertifiziert.
 * Protokoll: docs/research/backtest2/PROTOKOLL.md (Stufe 2); Vorrang der Merkmale: docs/research/longrun/MERKMALE.md.
 *
 * Jeden Monatsultimo ab 2010: Universum = die 1.000 liquidesten Titel (Ø Dollarumsatz 20 Tage) mit Rohschluss ≥ 5 $,
 * heutige und delistete Titel. Je Merkmal Querschnittsrang; gleichgewichtetes bestes Fünftel gehalten bis zum nächsten
 * Ultimo, gegen den Durchschnitt des Universums (gleichgewichtet) und gegen SPY (Gesamtrendite). Fundamentaldaten nur,
 * wenn vor dem Stichtag eingereicht (quant/engines/pit-fundamental-history.js), höchstens 548 Tage alt.
 * Delistete Titel: Rendite bis zum letzten Handelstag × Endwertquote. Kosten: Umschlag × Kosten je Seite (engine.mjs#sideBps).
 *
 *   node scripts/research/backtest2/merkmale.mjs --work-dir D --delisted-dir D --delisted-raw-dir D --fundamentals D --out DIR [--smoke]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadMarket, loadBenchmarks, lastCompleteMonthEnd } from './data.mjs';
import { sideBps } from './engine.mjs';
import { valueAt, bootstrapP } from './search.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const PIT = require(path.join(ROOT, 'quant/engines/pit-fundamental-history.js'));
export const STUDY_VERSION = 'backtest2-merkmale-1.0.0';
export const START_YEAR = 2010, HALF_SPLIT = 2018, MAX_FUND_AGE_DAYS = 548, UNIVERSE = Object.freeze({ maxRank: 1000, minPrice: 5 });

/** Merkmale: Name, Richtung (+1 = hoch ist gut), Familie. Kombinationen = Mittel der Perzentile. */
export const FEATURES = Object.freeze([
  ['momentum12_1', 'Momentum 12 Monate (ohne letzten Monat)', 1, 'Kurs'],
  ['rs6', 'Relative Stärke 6 Monate', 1, 'Kurs'],
  ['high52', 'Nähe zum 52-Wochen-Hoch', 1, 'Kurs'],
  ['sma200', 'Abstand zur 200-Tage-Linie', 1, 'Kurs'],
  ['reversal1m', 'Verlierer des letzten Monats', 1, 'Kurs'],
  ['lowVol', 'Niedrige Schwankung (1 Jahr)', 1, 'Kurs'],
  ['grossMargin', 'Bruttomarge', 1, 'Qualität'],
  ['gpa', 'Bruttogewinn je Bilanzsumme', 1, 'Qualität'],
  ['roe', 'Eigenkapitalrendite', 1, 'Qualität'],
  ['fcfMargin', 'Free-Cashflow-Marge', 1, 'Qualität'],
  ['netMargin', 'Nettomarge', 1, 'Qualität'],
  ['equityToAssets', 'Eigenkapitalquote', 1, 'Qualität'],
  ['accrualsLow', 'Saubere Gewinne (niedrige Accruals)', 1, 'Qualität'],
  ['revenueGrowthYoy', 'Umsatzwachstum (1 Jahr)', 1, 'Wachstum'],
  ['revenueCagr3y', 'Umsatzwachstum (3 Jahre p. a.)', 1, 'Wachstum'],
  ['ruleOf40', 'Rule of 40', 1, 'Wachstum'],
  ['earningsYield', 'Günstig nach Gewinn', 1, 'Bewertung'],
  ['fcfYield', 'Günstig nach Free Cashflow', 1, 'Bewertung'],
  ['bookToPrice', 'Günstig nach Buchwert', 1, 'Bewertung'],
  ['buyback', 'Aktienrückkäufe (weniger Aktien als vor 1 Jahr)', 1, 'Kapital'],
  ['assetGrowthLow', 'Wenig Bilanzwachstum', 1, 'Kapital'],
  ['size', 'Größe (Börsenwert)', 1, 'Größe'],
]);
export const COMBOS = Object.freeze([
  ['combo_mom_gpa', 'Momentum + Bruttogewinn je Bilanzsumme', ['momentum12_1', 'gpa']],
  ['combo_mom_roe', 'Momentum + Eigenkapitalrendite', ['momentum12_1', 'roe']],
  ['combo_mom_buyback', 'Momentum + Rückkäufe', ['momentum12_1', 'buyback']],
  ['combo_mom_value', 'Momentum + Günstig nach Gewinn', ['momentum12_1', 'earningsYield']],
  ['combo_mom_r40', 'Momentum + Rule of 40', ['momentum12_1', 'ruleOf40']],
  ['combo_mom_gpa_buyback', 'Momentum + Bruttogewinn/Bilanz + Rückkäufe', ['momentum12_1', 'gpa', 'buyback']],
  ['combo_quality_value', 'Bruttogewinn/Bilanz + Günstig nach Gewinn', ['gpa', 'earningsYield']],
]);
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const dayBefore = (d) => new Date(Date.parse(d + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10);

/** Monatsultimos (letzter Handelstag je Monat) ab START_YEAR bis Ende. */
export function monthEnds(dates, from = START_YEAR) {
  const out = [];
  for (let t = 0; t < dates.length; t++) if (+dates[t].slice(0, 4) >= from && (t === dates.length - 1 || dates[t + 1].slice(0, 7) !== dates[t].slice(0, 7))) out.push(t);
  return out;
}

/** Kursmerkmale zum Index t aus den Tagesreihen eines Titels (nur Balken bis t). */
export function priceFeatures(m, s, t) {
  const T = m.T, base = s * T, idx = [];
  for (let k = t; k >= 0 && idx.length < 253; k--) if (m.c[base + k] > 0) idx.push(k);
  if (idx.length < 253 || idx[0] !== t) return null;
  const c = (j) => m.c[base + idx[j]];
  let hi = 0, s1 = 0, s2 = 0, n = 0;
  for (let j = 0; j < 252; j++) { hi = Math.max(hi, m.h[base + idx[j]]); const r = Math.log(c(j) / c(j + 1)); s1 += r; s2 += r * r; n++; }
  const vol = Math.sqrt(Math.max(0, s2 / n - (s1 / n) ** 2) * 252);
  return {
    momentum12_1: c(21) / c(252) - 1, rs6: c(0) / c(126) - 1, high52: c(0) / hi, sma200: m.sma200[base + t] > 0 ? c(0) / m.sma200[base + t] - 1 : null,
    reversal1m: -(c(0) / c(21) - 1), lowVol: -vol,
  };
}

/** Fundamentalmerkmale zum Stichtag (nur Eingereichtes vor dem Stichtag, Frische ≤ 548 Tage). */
export function fundamentalFeatures(bundle, date, rawClose) {
  if (!bundle) return null;
  const asOf = dayBefore(date), rev = PIT.visibleAnnual(bundle, 'revenue', asOf);
  if (!rev.length || (Date.parse(date) - Date.parse(rev[0][2])) / 864e5 > MAX_FUND_AGE_DAYS) return null;
  const f = PIT.featuresAt(bundle, asOf); if (!f) return null;
  const L = (k) => PIT.latest(bundle, k, asOf);
  const ni = L('net_income'), eq = L('stockholders_equity'), assets = L('total_assets'), gp = L('gross_profit'), ocf = L('operating_cash_flow'), fcf = L('free_cash_flow'), shares = L('shares_outstanding');
  const cap = shares > 0 && rawClose > 0 ? shares * rawClose : null;
  const assetsYoy = PIT.changeOver(bundle, 'total_assets', asOf, 1), sharesYoy = PIT.changeOver(bundle, 'shares_outstanding', asOf, 1);
  return {
    grossMargin: f.grossMargin, fcfMargin: f.fcfMargin, netMargin: f.netMargin, equityToAssets: f.equityToAssets,
    revenueGrowthYoy: f.revenueGrowthYoy, revenueCagr3y: f.revenueCagr3y,
    ruleOf40: isNum(f.revenueGrowthYoy) && isNum(f.fcfMargin) && f.revenueGrowthYoy <= 3 && Math.abs(f.fcfMargin) <= 1.5 ? f.revenueGrowthYoy + f.fcfMargin : null,
    gpa: assets > 0 && isNum(gp) ? gp / assets : null,
    roe: eq > 0 && isNum(ni) ? ni / eq : null,
    accrualsLow: assets > 0 && isNum(ni) && isNum(ocf) ? -(ni - ocf) / assets : null,
    earningsYield: cap && isNum(ni) ? ni / cap : null, fcfYield: cap && isNum(fcf) ? fcf / cap : null, bookToPrice: cap && isNum(eq) ? eq / cap : null,
    buyback: isNum(sharesYoy) && Math.abs(sharesYoy) < 1 ? -sharesYoy : null,
    assetGrowthLow: isNum(assetsYoy) && assetsYoy < 5 ? -assetsYoy : null,
    size: cap, profitable: isNum(ni) ? ni > 0 : null,
  };
}

/** Rendite eines Titels von Ultimo t bis Ultimo tn (Gesamtrendite; delistet: bis zum letzten Handelstag × Endwertquote). */
export function forwardReturn(m, s, t, tn) {
  const T = m.T, base = s * T, c0 = m.c[base + t];
  if (!(c0 > 0)) return null;
  const term = m.terminal[s];
  if (term > t && term <= tn) return (m.c[base + term] * m.recovery[s]) / c0 - 1;
  for (let k = tn; k > t; k--) if (m.c[base + k] > 0) return m.c[base + k] / c0 - 1; // fehlende Balken: letzter bekannter Schluss
  return 0;
}

/** Perzentile (Durchschnittsrang) über Werte, null bleibt null. */
export function pctRank(vals) {
  const idx = vals.map((v, i) => [v, i]).filter(([v]) => isNum(v)).sort((a, b) => a[0] - b[0]), out = vals.map(() => null), n = idx.length;
  for (let i = 0; i < n;) { let j = i; while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) out[idx[k][1]] = ((i + j) / 2 + 1) / n; i = j + 1; }
  return out;
}

/** Studie über alle Monate; liefert je Merkmal Monatsreihen (Top-Fünftel, Bottom-Fünftel, Universum) und Umschlag/Kosten. */
export function study(m, bundleOf, { from = START_YEAR, universe = UNIVERSE } = {}) {
  const ends = monthEnds(m.dates, from), keys = [...FEATURES.map((f) => f[0]), ...COMBOS.map((c) => c[0]), 'spLike'];
  const res = Object.fromEntries(keys.map((k) => [k, { top: [], bottom: [], cost: [], n: [], prevTop: new Set() }]));
  const ew = [], months = [];
  for (let e = 0; e + 1 < ends.length; e++) {
    const t = ends[e], tn = ends[e + 1], date = m.dates[t], rows = [];
    for (let s = 0; s < m.S; s++) {
      const i = s * m.T + t;
      if (!(m.rank[i] <= universe.maxRank && m.rc[i] >= universe.minPrice)) continue;
      const r = forwardReturn(m, s, t, tn); if (!isNum(r)) continue;
      const pf = priceFeatures(m, s, t), ff = fundamentalFeatures(bundleOf(s), date, m.rc[i]);
      rows.push({ s, r, adv: m.adv[i], rank: m.rank[i], ...(pf || {}), ...(ff || {}) });
    }
    if (rows.length < 50) continue;
    months.push(date); ew.push(rows.reduce((a, x) => a + x.r, 0) / rows.length);
    const pcts = {};
    for (const [k] of FEATURES) pcts[k] = pctRank(rows.map((x) => (isNum(x[k]) ? x[k] : null)));
    for (const [k, , parts] of COMBOS) pcts[k] = rows.map((_, j) => (parts.every((p) => isNum(pcts[p][j])) ? parts.reduce((a, p) => a + pcts[p][j], 0) / parts.length : null));
    for (const k of keys) {
      let top, bottom;
      if (k === 'spLike') { top = rows.filter((x) => x.rank <= 500 && x.profitable === true); bottom = rows.filter((x) => !(x.rank <= 500 && x.profitable === true)); }
      else {
        const withV = rows.map((x, j) => [x, pcts[k][j]]).filter(([, p]) => isNum(p)).sort((a, b) => b[1] - a[1]);
        const q = Math.floor(withV.length / 5);
        if (q < 10) { res[k].top.push(null); res[k].bottom.push(null); res[k].cost.push(0); res[k].n.push(0); continue; }
        top = withV.slice(0, q).map((x) => x[0]); bottom = withV.slice(-q).map((x) => x[0]);
      }
      const avg = (xs) => (xs.length ? xs.reduce((a, x) => a + x.r, 0) / xs.length : null);
      // Kosten: Anteil neuer und abgehender Titel × Kosten je Seite (Mittel), monatlich vom Ergebnis abgezogen
      const ids = new Set(top.map((x) => x.s)), prev = res[k].prevTop;
      const changed = [...ids].filter((x) => !prev.has(x)).length + [...prev].filter((x) => !ids.has(x)).length;
      const meanBps = top.length ? top.reduce((a, x) => a + sideBps(x.adv), 0) / top.length : 0;
      res[k].cost.push(top.length ? (changed / Math.max(1, top.length)) * meanBps / 1e4 : 0);
      res[k].top.push(avg(top)); res[k].bottom.push(avg(bottom)); res[k].n.push(top.length); res[k].prevTop = ids;
    }
  }
  for (const k of keys) delete res[k].prevTop;
  return { months, ew, features: res };
}

const ann = (rs) => { const v = rs.filter(isNum); if (!v.length) return null; return Math.exp(v.reduce((a, r) => a + Math.log(1 + r), 0) / v.length * 12) - 1; };

/** Kennzahlen je Merkmal inkl. Phasenfestigkeit. spyM: Monatsrenditen SPY (Gesamtrendite) auf denselben Monaten. */
export function evaluate(st, spyM) {
  const half = st.months.map((d) => +d.slice(0, 4) < HALF_SPLIT), years = [...new Set(st.months.map((d) => d.slice(0, 4)))];
  const names = Object.fromEntries([...FEATURES.map((f) => [f[0], [f[1], f[3]]]), ...COMBOS.map((c) => [c[0], [c[1], 'Kombination']]), ['spLike', ['S&P-ähnlich: Top 500 und profitabel', 'Filter']]]);
  const out = [];
  for (const [k, f] of Object.entries(st.features)) {
    const net = f.top.map((r, i) => (isNum(r) ? r - f.cost[i] : null));
    const ex = net.map((r, i) => (isNum(r) ? r - st.ew[i] : null)), exV = ex.filter(isNum);
    const mean = exV.reduce((a, x) => a + x, 0) / exV.length, sd = Math.sqrt(exV.reduce((a, x) => a + (x - mean) ** 2, 0) / (exV.length - 1));
    const sel = (cond) => net.map((r, i) => (cond(i) ? r : null)), selEw = (cond) => st.ew.map((r, i) => (cond(i) ? r : null)), selSpy = (cond) => spyM.map((r, i) => (cond(i) ? r : null));
    const yearsAhead = years.filter((y) => { const c = (i) => st.months[i].startsWith(y); return ann(sel(c)) > ann(selEw(c)); }).length;
    const h1 = ann(sel((i) => half[i])) - ann(selEw((i) => half[i])), h2 = ann(sel((i) => !half[i])) - ann(selEw((i) => !half[i]));
    const t = mean / (sd / Math.sqrt(exV.length));
    const row = {
      key: k, name: names[k][0], family: names[k][1], months: exV.length, avgNames: Math.round(f.n.filter((x) => x > 0).reduce((a, x) => a + x, 0) / Math.max(1, f.n.filter((x) => x > 0).length)),
      cagrNet: ann(net), cagrGross: ann(f.top), cagrBottom: ann(f.bottom), cagrUniverse: ann(st.ew), cagrSpy: ann(spyM),
      excessUniverse: ann(net) - ann(st.ew), excessSpy: ann(net) - ann(spyM), costPa: f.cost.reduce((a, x) => a + x, 0) / f.cost.length * 12,
      firstHalf: h1, secondHalf: h2, yearsAhead, years: years.length, tStat: t, pBoot: bootstrapP(exV, 2999),
      spySecondHalf: ann(sel((i) => !half[i])) - ann(selSpy((i) => !half[i])),
    };
    row.phaseRobust = h1 > 0 && h2 > 0 && yearsAhead >= 0.6 * years.length && t >= 2;
    out.push(row);
  }
  return out.sort((a, b) => (b.excessUniverse ?? -9) - (a.excessUniverse ?? -9));
}

const pct = (x) => (x == null || !Number.isFinite(x) ? '–' : (x * 100).toFixed(1).replace('.', ',') + ' %');
const pp = (x) => (x == null || !Number.isFinite(x) ? '–' : (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(1).replace('.', ',') + ' Pp');

export function report(res) {
  const L = ['# Merkmals-Studie auf eigenen Daten (Backtest 2.0, Stufe 2)' + (res.smoke ? ' – RAUCHTEST, kein Ergebnis' : ''), '',
    `**Forschung, nicht zertifiziert.** Nur für den Owner. ${res.months} Monate (${res.window[0]} bis ${res.window[1]}), Universum: 1.000 liquideste Titel ≥ 5 $, heutige und delistete (${res.data.loaded} Titel geladen, delistet ${res.data.delisted - res.data.delistedNoRaw}); Fundamentaldaten wie erstmals eingereicht. Datenstand-Fingerabdruck \`${res.dataFingerprint}\`.`, '',
    'Je Merkmal: gleichgewichtetes bestes Fünftel, monatlich neu, **nach Kosten**, gegen den Durchschnitt des Universums und gegen SPY. **Phasenfest** = vorn in beiden Hälften (2010–2017, 2018–Ende), in mindestens 60 % der Jahre und t ≥ 2.', '',
    `Vergleich: Universum gleichgewichtet ${pct(res.universeCagr)} p. a., SPY ${pct(res.spyCagr)} p. a.`, '',
    '| Merkmal | Familie | Ø Titel | Rendite nach Kosten | Kosten p. a. | vs. Universum | vs. SPY | 1. Hälfte | 2. Hälfte | Jahre vorn | t | phasenfest |', '|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of res.rows) L.push(`| ${r.name} | ${r.family} | ${r.avgNames} | ${pct(r.cagrNet)} | ${pct(r.costPa)} | ${pp(r.excessUniverse)} | ${pp(r.excessSpy)} | ${pp(r.firstHalf)} | ${pp(r.secondHalf)} | ${r.yearsAhead}/${r.years} | ${r.tStat.toFixed(1).replace('.', ',')} | ${r.phaseRobust ? '**ja**' : 'nein'} |`);
  L.push('', '## Lesehilfe', '', '- Die Rangfolge ist eine Rückschau über alle Merkmale (22 einzeln, 7 Kombinationen, 1 Filter): Bei 30 Versuchen sind einzelne Treffer mit t um 2 auch durch Zufall zu erwarten. Belastbar ist, was hier phasenfest ist **und** im Merkmals-Atlas 1963–heute über Jahrzehnte hielt.',
    '- „vs. Universum“ ist der faire Vergleich für Aktienauswahl (gleiche Gewichtung); „vs. SPY“ enthält zusätzlich den Größeneffekt der Mega-Caps seit 2010.',
    '- Nächster Schritt: Die phasenfesten Merkmale gehen als Signalquellen in die Suche mit Walk-forward (Protokoll §2–§4); erst danach Vorschläge für das Quant-Modell (eigener PR mit Vorher/Nachher).');
  return L.join('\n') + '\n';
}

function loadBundleIndex(dir) {
  const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')), bySec = new Map();
  for (const [cik, e] of Object.entries(idx.issuers || {})) for (const id of e.securityIds || []) bySec.set(id, cik);
  return bySec;
}

/** Lädt Markt, Benchmarks und Fundamentaldaten wie der Workflow-Lauf (auch für faktor-wf.mjs). */
export function loadInputs(a) {
  const bench = loadBenchmarks(), benchEnd = Object.values(bench).map((p) => p.at(-1)[0]).sort()[0];
  const cal = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/data/market/multi-asset/series/SPY.json'), 'utf8')).points.map((p) => p[0]).filter((d) => d >= '2007-01-01');
  const end = [lastCompleteMonthEnd(cal), cal.findLast((d) => d <= benchEnd)].sort()[0];
  const { market: m, counts, diagnostics, delistedCik } = loadMarket({ workDir: a.workDir, delistedDir: a.delistedDir, delistedRawDir: a.delistedRawDir, to: end, limit: a.smoke ? 400 : 0 });
  const secCik = loadBundleIndex(a.fundamentals), cache = new Map();
  const bundleOf = (s) => {
    const id = m.ids[s], cik = secCik.get(id) || delistedCik.get(id);
    if (!cik) return null;
    if (!cache.has(cik)) { const f = path.join(a.fundamentals, 'CIK' + cik + '.json'); cache.set(cik, fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null); }
    return cache.get(cik);
  };
  return { m, bench, counts, diagnostics, bundleOf, cache };
}
export function parseArgs(argv) {
  const a = {}; for (let i = 2; i < argv.length; i++) { const k = argv[i]; if (k === '--smoke') { a.smoke = true; continue; } a[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i]; }
  if (!a.workDir || !a.fundamentals || !a.out) throw new Error('--work-dir, --fundamentals und --out sind Pflicht');
  return a;
}

async function main() {
  const a = parseArgs(process.argv);
  const { m, bench, counts, diagnostics, bundleOf, cache } = loadInputs(a);
  const st = study(m, bundleOf);
  // SPY-Monatsrenditen auf denselben Ultimos (Gesamtrendite, Wochenreihe: letzter Wert ≤ Datum)
  const ends = monthEnds(m.dates).map((t) => m.dates[t]);
  const spyM = st.months.map((d0) => valueAt(bench.SPY, ends[ends.indexOf(d0) + 1]) / valueAt(bench.SPY, d0) - 1);
  const rows = evaluate(st, spyM);
  const res = { schema: 'backtest2-merkmale-1.0.0', label: 'Forschung, nicht zertifiziert', version: STUDY_VERSION, smoke: !!a.smoke, data: counts, dataFingerprint: diagnostics.dataFingerprint,
    months: st.months.length, window: [st.months[0], st.months.at(-1)], universeCagr: ann(st.ew), spyCagr: ann(spyM), coverageFundamentals: cache.size, rows };
  fs.mkdirSync(a.out, { recursive: true });
  fs.writeFileSync(path.join(a.out, 'merkmale.json'), JSON.stringify(res, null, 1));
  fs.writeFileSync(path.join(a.out, 'MERKMALE-EIGENE-DATEN.md'), report(res));
  console.log(report(res));
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
