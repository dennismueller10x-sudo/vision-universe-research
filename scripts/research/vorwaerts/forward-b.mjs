#!/usr/bin/env node
/**
 * Vorwärtstest „Fassung B“: Momentum + Bruttogewinn je Bilanzsumme unter den größten Werten. Forschung, nicht zertifiziert;
 * nur für den Owner. Protokoll: docs/research/backtest2/PROTOKOLL.md §4e (registriert am 23.11.2026, zählt ab 12/2026).
 *
 * Hintergrund: Stufe 3 (§4b) fand als einzigen phasenfesten Hinweis Momentum + Bruttogewinn/Bilanz (Fassung B, +2,3 Pp p. a. vor
 * SPY, p 0,15; bestes Zehntel der Top 500 p 0,07). Der Vorwärtstest §4d schreibt nur live, tilt und mp mit. Dieser Lauf schreibt
 * den stärksten Kandidaten mit, mit vorab festen Regeln.
 *
 * Quelle sind die veröffentlichten Faktor-Scherben quant/data/product/factor-evidence-v1/<Scherbe>.json.gz. Sie tragen je Titel
 * den Börsenwert und die Bausteine priceReturn12m1m und grossProfitabilityTtm. Die Scherben werden täglich ersetzt; unveränderlich
 * ist ihre Git-Historie. Je Monat gilt deshalb der ERSTE Commit des Monats, der summary.json der Scherben geändert hat.
 * Ohne vollständige Historie (flacher Checkout) fehlen Monate: `git fetch --unshallow` bzw. --ref auf den Datenzweig.
 *
 * Regeln (fest, §4e):
 *   Universum   die N größten Titel nach Börsenwert am Stichtag (alle Titel mit Börsenwert)
 *   Signal      Mittel der beiden Baustein-Scores (0–100); wählbar sind nur Titel des Universums mit beiden Bausteinen
 *   B1000       bestes Fünftel der wählbaren Titel unter den 1.000 größten, gleich gewichtet
 *   B500        bestes Zehntel der wählbaren Titel unter den 500 größten, gleich gewichtet
 *   M25         „Marktführer“ (Stufe 4, H1): unter den 1.000 größten nur Titel, die die Trendvorlage erfüllen
 *               (technical/data/screener-v1.json desselben Commits), davon die 25 mit dem höchsten Signal; unter 10 Kandidaten Kasse
 *   Handel      Einstieg und Ausstieg zum Schluss des ersten Handelstags nach dem Stichtag (discover-series, Kursrendite),
 *               6 bp je Seite auf den Umschlag; Vergleich SPY aus derselben Reihe
 *
 *   node scripts/research/vorwaerts/forward-b.mjs [--out datei.json] [--ref HEAD] [--picks]
 *   --picks zeigt nur die Auswahl aus dem Arbeitsstand (heutige Scherben), ohne Historie.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { closeAfter, closeOnOrBefore } from './forward.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const Identity = require(path.join(ROOT, 'core/identity.js'));
export const VERSION = 'vorwaerts-fassung-b-1.0.0';
export const REGISTERED = '2026-11-23', OFFICIAL_FROM = '2026-12', COST_BPS = 6;
export const SHARD_DIR = 'quant/data/product/factor-evidence-v1';
export const COMPONENTS = Object.freeze({ momentum: 'priceReturn12m1m', profitability: 'grossProfitabilityTtm' });
export const VARIANTS = Object.freeze({ B1000: { universe: 1000, top: 0.2 }, B500: { universe: 500, top: 0.1 }, M25: { universe: 1000, n: 25, template: true, minNames: 10 } });
/** Trendvorlage (veröffentlichte Lesart nach Minervini, PROTOKOLL §4f) aus den Spalten des Technical-Tagesbestands. */
export const TEMPLATE = Object.freeze({ minAboveLow: 0.3, maxBelowHigh: -0.25, flags: ['aboveSma50', 'sma50AboveSma150', 'sma150AboveSma200', 'sma200Rising'] });
export const SCREENER_FILE = 'technical/data/screener-v1.json';

/** Map Kürzel -> true/false: erfüllt die Trendvorlage am Stichtag des Tagesbestands (nur frische Reihen; sonst false). */
export function templateOf(screener) {
  const out = new Map(), c = screener && screener.cols;
  if (!c || !Array.isArray(c.s)) return out;
  for (let i = 0; i < c.s.length; i++) {
    const ok = c.fresh && c.fresh[i] === true && TEMPLATE.flags.every((k) => c[k] && c[k][i] === true)
      && isNum(c.distLow52w && c.distLow52w[i]) && c.distLow52w[i] >= TEMPLATE.minAboveLow && isNum(c.distHigh52w && c.distHigh52w[i]) && c.distHigh52w[i] >= TEMPLATE.maxBelowHigh;
    out.set(c.s[i], ok);
  }
  return out;
}
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/** Baustein-Score eines Titels oder null (nur AVAILABLE, 0–100). */
export function componentScore(security, factor, id) {
  const f = security && security.factors && security.factors[factor];
  const c = f && Array.isArray(f.components) ? f.components.find((x) => x && x.id === id) : null;
  return c && c.state === 'AVAILABLE' && isNum(c.score) ? c.score : null;
}

/** Zeilen aus Scherben: [{ticker, marketCap, signal|null, template}] für alle Titel mit Börsenwert; signal nur mit beiden Bausteinen;
 *  template = Trendvorlage erfüllt (aus templateOf), ohne Tagesbestand false. */
export function rowsOf(shards, template = null) {
  const rows = [];
  for (const sh of shards) {
    for (const [t, s] of Object.entries((sh && sh.securities) || {})) {
      if (!isNum(s.marketCap) || !(s.marketCap > 0)) continue;
      const m = componentScore(s, 'momentum', COMPONENTS.momentum), g = componentScore(s, 'profitability', COMPONENTS.profitability);
      rows.push({ ticker: t, marketCap: s.marketCap, signal: m === null || g === null ? null : (m + g) / 2, template: !!(template && template.get(t) === true) });
    }
  }
  return rows;
}

/**
 * Auswahl je Variante. Reihenfolge wie in der Studie: ERST das Universum (die N größten nach Börsenwert, mit oder ohne Signal),
 * DANN der beste Anteil der Titel mit Signal darin. Titel ohne Bruttogewinn (z. B. Banken) bleiben im Universum, sind aber
 * nicht wählbar. Gleichstand: Kürzel aufsteigend.
 */
export function picksOf(rows) {
  const bySize = rows.slice().sort((a, b) => b.marketCap - a.marketCap || (a.ticker < b.ticker ? -1 : 1));
  const out = {};
  for (const [name, v] of Object.entries(VARIANTS)) {
    const ranked = bySize.slice(0, v.universe).filter((r) => r.signal !== null && (!v.template || r.template)).sort((a, b) => b.signal - a.signal || (a.ticker < b.ticker ? -1 : 1));
    /* M25: feste Titelzahl innerhalb der Schranke; unter minNames Kandidaten bleibt das Depot in Kasse (leere Auswahl). */
    const take = v.n ? (ranked.length >= v.minNames ? Math.min(v.n, ranked.length) : 0) : Math.floor(ranked.length * v.top);
    out[name] = ranked.slice(0, take).map((r) => r.ticker).sort();
  }
  return out;
}

/** Abdeckung je Variante: wie viele Titel des Universums ein Signal haben. */
export function coverageOf(rows) {
  const bySize = rows.slice().sort((a, b) => b.marketCap - a.marketCap || (a.ticker < b.ticker ? -1 : 1));
  return Object.fromEntries(Object.entries(VARIANTS).map(([name, v]) => { const u = bySize.slice(0, v.universe); return [name, { universe: u.length, withSignal: u.filter((r) => r.signal !== null).length, ...(v.template ? { withTemplate: u.filter((r) => r.signal !== null && r.template).length } : {}) }]; }));
}

/** Erster Stichtag je Monat aus [{date, ...}] (aufsteigend nach Datum). */
export function firstPerMonth(items) {
  const out = new Map();
  for (const it of items.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) if (!out.has(it.date.slice(0, 7))) out.set(it.date.slice(0, 7), it);
  return [...out.values()];
}

/**
 * Bewertung. snaps: [{asOf, picks: {Variante: [Kürzel]}}] aufsteigend; priceOf(t) -> [[datum, kurs]] | null; spy ebenso.
 * Ein Monat zählt erst, wenn der Ausstieg (erster Handelstag nach dem nächsten Stichtag) erreicht ist.
 */
export function evaluate(snaps, priceOf, spy, { costBps = COST_BPS } = {}) {
  const months = [], prev = Object.fromEntries(Object.keys(VARIANTS).map((k) => [k, new Set()]));
  for (let m = 0; m + 1 < snaps.length; m++) {
    const s = snaps[m], e0 = closeAfter(spy, s.asOf), e1 = closeAfter(spy, snaps[m + 1].asOf);
    if (!e0 || !e1) continue;
    const row = { decision: s.asOf, entry: e0.date, exit: e1.date, spy: e1.close / e0.close - 1, variants: {} };
    for (const name of Object.keys(VARIANTS)) {
      const pick = s.picks[name] || [];
      let sum = 0, n = 0, missing = 0;
      for (const t of pick) {
        const p = priceOf(t), a = p && closeOnOrBefore(p, row.entry), b = p && closeOnOrBefore(p, row.exit);
        if (!a || a.date !== row.entry) { missing++; continue; } // ohne Einstiegskurs am Einstiegstag nicht kaufbar
        sum += b.close / a.close - 1; n++;
      }
      const ids = new Set(pick), changed = [...ids].filter((x) => !prev[name].has(x)).length + [...prev[name]].filter((x) => !ids.has(x)).length;
      const turnover = ids.size ? changed / ids.size : 0, gross = n ? sum / n : null;
      row.variants[name] = { names: n, missingEntry: missing, gross, net: gross === null ? null : gross - turnover * costBps / 1e4, turnover };
      prev[name] = ids;
    }
    months.push(row);
  }
  return months;
}

/** Verkettung ab einem Monat: Rendite je Variante und SPY, Monate vor SPY. */
export function chain(months, fromMonth) {
  const sel = months.filter((m) => m.decision.slice(0, 7) >= fromMonth);
  const out = { from: fromMonth, months: sel.length, spy: sel.length ? sel.reduce((a, m) => a * (1 + m.spy), 1) - 1 : null, variants: {} };
  for (const k of Object.keys(VARIANTS)) {
    const v = sel.map((m) => m.variants[k].net);
    out.variants[k] = { total: v.length && v.every(isNum) ? v.reduce((a, r) => a * (1 + r), 1) - 1 : null, monthsAheadSpy: sel.filter((m) => isNum(m.variants[k].net) && m.variants[k].net > m.spy).length };
  }
  return out;
}

const pct = (x) => (isNum(x) ? (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(1).replace('.', ',') + ' %' : '–');
export function report(res) {
  const L = ['# Vorwärtstest Fassung B: Momentum + Bruttogewinn je Bilanzsumme (Forschung, nicht zertifiziert)', '',
    `Registriert am ${res.registered}; zählt ab ${res.officialFrom}. B1000 = bestes Fünftel der 1.000 größten Werte, B500 = bestes Zehntel der 500 größten, M25 = die 25 besten unter den 1.000 größten, die die Trendvorlage erfüllen; gleich gewichtet, monatlich, ${res.costBps} bp je Seite, Kursrendite gegen SPY. Stichtage: ${res.snapshots}.`, '',
    '| Entscheidung | Einstieg | Ausstieg | B1000 | B500 | M25 | SPY |', '|---|---|---|---|---|---|---|'];
  for (const m of res.months) L.push(`| ${m.decision} | ${m.entry} | ${m.exit} | ${pct(m.variants.B1000.net)} | ${pct(m.variants.B500.net)} | ${pct(m.variants.M25.net)} | ${pct(m.spy)} |`);
  const c = res.official;
  L.push('', `**Ab ${c.from}** (${c.months} Monate): SPY ${pct(c.spy)}; ` + Object.entries(c.variants).map(([k, v]) => `${k} ${pct(v.total)} (${v.monthsAheadSpy} Monate vor SPY)`).join(', '));
  if (res.note) L.push('', res.note);
  L.push('', 'Wenige Monate sagen nichts; belastbar wird das frühestens nach 12 bis 24 Monaten. Öffentlich nur mit Owner-Freigabe (Renditeaussage).');
  return L.join('\n') + '\n';
}

/* ------------------------------------------------------------------ Dateizugriff (nur lesend) */
const git = (args, opts = {}) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 1 << 30, ...opts });
function shardNames(ref) {
  return git(['ls-tree', '--name-only', ref, SHARD_DIR + '/']).toString().split('\n').filter((p) => /\/[A-Z0-9_-]{1,3}\.json\.gz$/.test(p));
}
function shardsAt(ref) {
  return shardNames(ref).map((p) => JSON.parse(zlib.gunzipSync(git(['show', `${ref}:${p}`]))));
}
function screenerAt(ref) { try { return JSON.parse(git(['show', `${ref}:${SCREENER_FILE}`]).toString('utf8')); } catch { return null; } }
function screenerWorkingTree() { try { return JSON.parse(fs.readFileSync(path.join(ROOT, SCREENER_FILE), 'utf8')); } catch { return null; } }
function shardsWorkingTree() {
  const dir = path.join(ROOT, SHARD_DIR);
  return fs.readdirSync(dir).filter((f) => /^[A-Z0-9_-]{1,3}\.json\.gz$/.test(f)).map((f) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, f)))));
}
const asOfOf = (shards) => shards.map((s) => s.asOf).filter(Boolean).sort().at(-1) || null;
/** Commits, die die Scherben-Zusammenfassung geändert haben: [{commit, date}] aufsteigend. */
function shardCommits(ref) {
  return git(['log', '--first-parent', '--format=%H %cs', ref, '--', SHARD_DIR + '/summary.json']).toString().trim().split('\n').filter(Boolean)
    .map((l) => { const [commit, date] = l.split(' '); return { commit, date }; }).reverse();
}
function series(ticker) {
  let id; try { id = Identity.securityIdForTicker(ticker); } catch { return null; }
  const f = path.join(ROOT, 'quant/data/market/discover-series', id + '.json');
  if (!fs.existsSync(f)) return null;
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  return d.priceSeriesType === 'SPLIT_ADJUSTED' && d.grain === 'daily' ? d.points : null;
}

function main() {
  const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
  if (process.argv.includes('--picks')) {
    const shards = shardsWorkingTree(), rows = rowsOf(shards, templateOf(screenerWorkingTree())), picks = picksOf(rows);
    console.log(JSON.stringify({ asOf: asOfOf(shards), titlesWithMarketCap: rows.length, coverage: coverageOf(rows), B1000: picks.B1000.length, B500: picks.B500.length, M25: picks.M25.length }));
    console.log('B500:', picks.B500.join(' '));
    console.log('M25:', picks.M25.join(' '));
    return;
  }
  const ref = arg('--ref') || 'HEAD', out = arg('--out');
  const shallow = git(['rev-parse', '--is-shallow-repository']).toString().trim() === 'true';
  const decisions = firstPerMonth(shardCommits(ref).filter((c) => c.date.slice(0, 7) >= OFFICIAL_FROM));
  const snaps = decisions.map((d) => { const shards = shardsAt(d.commit), rows = rowsOf(shards, templateOf(screenerAt(d.commit))); return { commit: d.commit, asOf: asOfOf(shards), picks: picksOf(rows), coverage: coverageOf(rows) }; }).filter((s) => s.asOf);
  const spy = series('SPY'), cache = new Map();
  const priceOf = (t) => { if (!cache.has(t)) cache.set(t, series(t)); return cache.get(t); };
  const months = spy ? evaluate(snaps, priceOf, spy) : [];
  const res = { schema: VERSION, label: 'Forschung, nicht zertifiziert', registered: REGISTERED, officialFrom: OFFICIAL_FROM, costBps: COST_BPS, ref,
    snapshots: snaps.length, decisions: snaps.map((s) => ({ commit: s.commit, asOf: s.asOf, coverage: s.coverage, picks: s.picks })),
    months, official: chain(months, OFFICIAL_FROM),
    note: shallow ? 'Hinweis: flacher Checkout. Monate, deren erster Commit nicht in der geladenen Historie liegt, fehlen (git fetch --unshallow).' : null };
  if (out) { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, JSON.stringify(res, null, 1) + '\n'); }
  console.log(report(res));
}
if (import.meta.url === `file://${process.argv[1]}`) main();
