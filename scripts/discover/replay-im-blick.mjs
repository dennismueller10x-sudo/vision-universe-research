#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE DISCOVER — replay-im-blick.mjs

   HISTORISCHER VERGLEICH: ALTE GEGEN NEUE EINGANGSFLAECHE

   Spielt beide Auswahlregeln auf Faktorstaenden ab, die TATSAECHLICH
   veroeffentlicht waren (je Sitzung die Datei factors-FULL_UNIVERSE.json
   eines Marktdaten-Commits). Gerechnet wird je Sitzung nur mit dem, was
   zum Schluss dieser Sitzung vorlag:

     - Faktorzeile der Sitzung (Volumen, Hoch, Renditen, RS)
     - Tagesrendite aus der Tagesschlussreihe bis einschliesslich asOf
       (Verhaeltnis zweier Schluesse, gegen spaetere Split-Bereinigung
       unempfindlich)
     - Ereignisalter aus der Tagesschlussreihe bis einschliesslich asOf

   Die Vorwaertsrenditen (1 und 5 Sitzungen) dienen ausschliesslich der
   Auswertung und fliessen in keine Auswahl ein.

   Aufruf:
     node scripts/discover/replay-im-blick.mjs --snapshots <dir> \
       --out <bericht.json> [--md <bericht.md>]
   <dir> enthaelt <commit>.factors.json und optional <commit>.featured.json
   (die damals veroeffentlichte Eingangsflaeche, zur Pruefung der
   Nachbildung der alten Regel).
   ========================================================================= */
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { resolveProductUniverse } = await import(join(root, "scripts", "market", "universe-source.mjs"));
const Scoring = require(join(root, "discover", "engines", "scoring.js"));
const High52w = require(join(root, "discover", "engines", "high52w.js"));
const Eligibility = require(join(root, "discover", "engines", "discovery-eligibility.js"));
const ImBlick = require(join(root, "discover", "engines", "im-blick.js"));

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : d; };
const SNAP = arg("snapshots", null);
const OUT = arg("out", null);
const MD = arg("md", null);
const DUMP = arg("dump", null);
const dump = [];
const CFG = arg("config", null) ? JSON.parse(arg("config", "{}")) : null;
if (!SNAP || !OUT) { console.error("Aufruf: --snapshots <dir> --out <datei> [--md <datei>]"); process.exit(64); }

const readJSON = (p) => JSON.parse(readFileSync(p, "utf8"));
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const METHODOLOGY = readJSON(join(root, "discover", "methodology", "discover-v1.json"));
const QUAL = METHODOLOGY.qualification;
const RECOGNITION = readJSON(join(root, "discover", "config", "company-recognition.json")).companies || {};
const universe = resolveProductUniverse(root);
const byTicker = new Map(universe.securities.map((s) => [s.ticker, s]));

/* Tagesschluesse (veroeffentlichte Reihe, split-bereinigt). */
const seriesDir = join(root, "quant", "data", "market", "discover-series");
const closes = new Map();
for (const n of readdirSync(seriesDir)) {
  if (!n.endsWith(".json") || n === "index.json") continue;
  try { const p = readJSON(join(seriesDir, n)); if (p.ticker && Array.isArray(p.points)) closes.set(p.ticker, p.points); } catch {}
}
function closeAt(ticker, asOf, offset) {
  const pts = closes.get(ticker);
  if (!pts) return null;
  let i = pts.length - 1;
  while (i >= 0 && pts[i][0] > asOf) i--;
  if (i < 0 || pts[i][0] !== asOf) return null;
  const j = i + (offset || 0);
  return j >= 0 && j < pts.length ? { date: pts[j][0], close: pts[j][1] } : null;
}

function flatMetrics(values) {
  const rs = values.relativeStrength || {}, ret = values.returns || {};
  const n = (v) => (isNum(v) ? v : null);
  return {
    distanceTo52wHigh: n(values.distanceTo52wHigh), distanceTo52wLow: n(values.distanceTo52wLow),
    return1M: n(ret["1M"]), return3M: n(ret["3M"]), return6M: n(ret["6M"]), return12M: n(ret["12M"]),
    return12M1M: n(values.return12M1M), momentumAcceleration: n(values.momentumAcceleration),
    relativeStrength1M: n(rs["1M"]), relativeStrength3M: n(rs["3M"]), relativeStrength6M: n(rs["6M"]), relativeStrength12M: n(rs["12M"]),
    volatility252d: n(values.volatility252d), maxDrawdown252d: n(values.maxDrawdown252d),
    volumeRatio20over60: n(values.volumeRatio20over60), volumeSpikeRatio: n(values.volumeSpikeRatio),
    trendAlignment: Scoring.trendAlignment(values)
  };
}

/** Titel einer Sitzung, so wie der Build sie fuer die Auswahl sieht. */
export function stocksFromFactors(factors) {
  const stocks = [];
  for (const sec of factors.securities) {
    const ref = byTicker.get(sec.ticker);
    if (!ref || ref.consumer === false) continue;
    const values = sec.values || {};
    const metrics = flatMetrics(values);
    const lead = Scoring.composite(METHODOLOGY.leadershipScore, metrics);
    metrics.leadershipScore = lead.score;
    const asOf = sec.asOf;
    const heute = closeAt(sec.ticker, asOf, 0), gestern = closeAt(sec.ticker, asOf, -1);
    const preis = heute ? heute.close : null;
    stocks.push({
      symbol: sec.ticker, asOf, sector: sec.sector || ref.sector || null,
      companyName: ref.displayName || ref.companyName || null, instrumentType: ref.instrumentType || null,
      recognitionTier: (RECOGNITION[sec.ticker] || {}).tier || null,
      hasPriceSeries: closes.has(sec.ticker),
      changePercent: { value: heute && gestern && gestern.close > 0 ? (heute.close / gestern.close - 1) * 100 : null },
      closingHigh52w: ImBlick.closingHigh(closes.get(sec.ticker), asOf) === true,
      eventAge: closes.has(sec.ticker) ? ImBlick.eventAge(closes.get(sec.ticker), asOf) : null,
      price: preis, rawValues: values, metrics, leadCoverage: lead.coverage, leadStatus: lead.status,
      bars: sec.bars, dataQuality: sec.dataQuality, dataQualityReason: sec.dataQualityReason, signals: {}
    });
  }
  const lp = Scoring.percentileScale(stocks.map((s) => s.metrics.leadershipScore));
  for (const s of stocks) {
    const v = s.rawValues, m = s.metrics;
    m.leadershipPercentile = lp(m.leadershipScore);
    const high = High52w.fromDistance(m.distanceTo52wHigh, m.distanceTo52wLow, Object.assign({ touchedHigh: v.newHigh52w === true }, METHODOLOGY.high52w));
    s.high52w = high;
    s.signals.new52WeekHigh = high.isNew52WeekHigh === true;
    s.signals.marketLeader = isNum(m.leadershipPercentile) && m.leadershipPercentile >= 90;
    s.signals.breakout = v.volumeBreakout === true && v.priceAboveSMA20 === true && v.priceAboveSMA50 === true &&
                         isNum(m.distanceTo52wHigh) && m.distanceTo52wHigh >= -0.10;
    const el = Eligibility.assess(s);
    s.discoveryEligible = el.eligible;
    if (!el.eligible) Object.keys(s.signals).forEach((k) => { s.signals[k] = false; });
    const dollar = isNum(v.avgVolume20d) && isNum(s.price) ? v.avgVolume20d * s.price : null;
    s.qualification = { strongest: s.leadStatus === "SCORED" && (s.leadCoverage || 0) >= QUAL.minCoverage &&
      isNum(s.bars) && s.bars >= QUAL.minBars && isNum(s.price) && s.price >= QUAL.minPrice &&
      dollar !== null && dollar >= QUAL.minAvgDollarVolume20d && s.discoveryEligible, avgDollarVolume20d: dollar };
  }
  return stocks;
}

/** Die alte Regel (build-discover-data.mjs bis discover-v4.0.0, buildFeatured). */
export function legacySelect(stocks, anzahl = 5) {
  const k = stocks.filter((s) => s.discoveryEligible !== false &&
    (s.signals.new52WeekHigh || s.signals.marketLeader || s.signals.breakout) && isNum(s.metrics.leadershipPercentile));
  const bew = k.map((s) => {
    let r = s.metrics.leadershipPercentile;
    if (s.hasPriceSeries) r += 12;
    if (s.companyName) r += 6;
    if (s.recognitionTier === 1) r += 10; else if (s.recognitionTier === 2) r += 5;
    if (s.signals.new52WeekHigh) r += 4;
    if (s.signals.breakout) r += 3;
    return { s, r };
  }).sort((a, b) => b.r - a.r || (a.s.symbol < b.s.symbol ? -1 : 1));
  const pro = new Map(), out = [];
  for (const e of bew) {
    const sek = e.s.sector || "?";
    if ((pro.get(sek) || 0) >= 2) continue;
    pro.set(sek, (pro.get(sek) || 0) + 1);
    out.push(e.s.symbol);
    if (out.length >= anzahl) break;
  }
  return out;
}

/* ------------------------------------------------------------- Lauf */
const dateien = readdirSync(SNAP).filter((n) => n.endsWith(".factors.json"));
const jeSitzung = new Map();
for (const n of dateien) {
  const f = readJSON(join(SNAP, n));
  const asOf = f.securities && f.securities.length ? f.securities[0].asOf : null;
  if (!asOf) continue;
  const alt = jeSitzung.get(asOf);
  if (!alt || f.generatedAt > alt.generatedAt) jeSitzung.set(asOf, { file: n, generatedAt: f.generatedAt, factors: f });
}
const sitzungen = [...jeSitzung.keys()].sort();
const tage = [];
for (const asOf of sitzungen) {
  const { file, factors } = jeSitzung.get(asOf);
  const stocks = stocksFromFactors(factors);
  const bewertet = ImBlick.rate(stocks, { config: CFG });
  const zul = [...bewertet.values()].filter((e) => e.admissible);
  const neu = ImBlick.select(zul, { config: CFG }).map((e) => e.inputs.symbol);
  const alt = legacySelect(stocks);
  const pubFile = join(SNAP, file.replace(".factors.json", ".featured.json"));
  const pub = existsSync(pubFile) ? readJSON(pubFile) : null;
  const veroeffentlicht = pub && pub.asOf === asOf ? pub.stocks.map((s) => s.symbol) : null;

  const info = (sym) => {
    const e = bewertet.get(sym);
    const fwd1 = closeAt(sym, asOf, 1), fwd5 = closeAt(sym, asOf, 5), heute = closeAt(sym, asOf, 0);
    return {
      symbol: sym, score: e ? e.result.score : null, event: e ? e.result.event : null, profile: e ? e.result.profile : null,
      fresh: e ? e.result.freshEvent : null, return1D: e ? e.inputs.return1D : null, volumeSpike: e ? e.inputs.volumeSpike : null,
      closeAtHigh: e ? e.inputs.closeAtHigh : null, breakout: e ? e.inputs.breakout : null,
      fwd1: fwd1 && heute ? fwd1.close / heute.close - 1 : null, fwd5: fwd5 && heute ? fwd5.close / heute.close - 1 : null,
      reasons: e ? ImBlick.reasons(e).map((r) => r.label + ": " + r.value) : []
    };
  };
  /* Vergleichsmassstab der Vorwaertsrendite: Median aller zulaessigen Titel. */
  const median = (arr) => { const a = arr.filter(isNum).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
  const fwdMedian5 = median(zul.map((e) => { const f = closeAt(e.inputs.symbol, asOf, 5), h = closeAt(e.inputs.symbol, asOf, 0); return f && h ? f.close / h.close - 1 : null; }));
  const fwdMedian1 = median(zul.map((e) => { const f = closeAt(e.inputs.symbol, asOf, 1), h = closeAt(e.inputs.symbol, asOf, 0); return f && h ? f.close / h.close - 1 : null; }));
  if (DUMP) for (const e of zul) {
    const h = closeAt(e.inputs.symbol, asOf, 0), f1 = closeAt(e.inputs.symbol, asOf, 1), f5 = closeAt(e.inputs.symbol, asOf, 5);
    dump.push({ asOf, s: e.inputs.symbol, i: e.inputs, r: { score: e.result.score, event: e.result.event, profile: e.result.profile, fresh: e.result.freshEvent, sigma: e.result.sigma, rs: e.result.relativeStrength1MPercentile },
      f1: f1 && h ? f1.close / h.close - 1 : null, f5: f5 && h ? f5.close / h.close - 1 : null, m1: fwdMedian1, m5: fwdMedian5 });
  }
  tage.push({ asOf, source: file, admissible: zul.length, old: alt.map(info), new: neu.map(info), published: veroeffentlicht, fwdMedian1, fwdMedian5 });
}

/* ------------------------------------------------------- Kennzahlen */
function kennzahlen(key) {
  const sets = tage.map((t) => t[key].map((x) => x.symbol));
  const alle = tage.flatMap((t) => t[key]);
  let wieder = 0, gesamt = 0, jac = [];
  for (let i = 1; i < sets.length; i++) {
    const a = new Set(sets[i - 1]), b = new Set(sets[i]);
    const inter = [...b].filter((x) => a.has(x)).length;
    wieder += inter; gesamt += b.size;
    const uni = new Set([...a, ...b]).size;
    jac.push(uni ? inter / uni : 0);
  }
  const serie = new Map(), laengste = new Map();
  for (const s of sets) {
    for (const k of [...serie.keys()]) if (!s.includes(k)) serie.delete(k);
    for (const x of s) { serie.set(x, (serie.get(x) || 0) + 1); laengste.set(x, Math.max(laengste.get(x) || 0, serie.get(x))); }
  }
  const erster = sets.map((s) => s[0]);
  let gleicherErster = 0; for (let i = 1; i < erster.length; i++) if (erster[i] === erster[i - 1]) gleicherErster++;
  const zaehl = new Map(); for (const s of sets) for (const x of s) zaehl.set(x, (zaehl.get(x) || 0) + 1);
  const avg = (arr) => { const a = arr.filter(isNum); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; };
  const ueber5 = tage.flatMap((t) => t[key].map((x) => (isNum(x.fwd5) && isNum(t.fwdMedian5) ? x.fwd5 - t.fwdMedian5 : null)));
  const ueber1 = tage.flatMap((t) => t[key].map((x) => (isNum(x.fwd1) && isNum(t.fwdMedian1) ? x.fwd1 - t.fwdMedian1 : null)));
  return {
    sessions: sets.length, picks: alle.length,
    repeatShare: gesamt ? wieder / gesamt : null,
    meanJaccard: avg(jac),
    distinctSymbols: zaehl.size,
    sameTopPickDays: gleicherErster, topPickChanges: erster.length - 1 - gleicherErster,
    longestStreak: Math.max(0, ...laengste.values()),
    longestStreakSymbol: [...laengste.entries()].sort((a, b) => b[1] - a[1])[0] || null,
    mostFrequent: [...zaehl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    freshEventShare: avg(alle.map((x) => (x.fresh === null ? null : x.fresh ? 1 : 0))),
    closeAtHighShare: avg(alle.map((x) => (x.closeAtHigh ? 1 : 0))),
    meanEventScore: avg(alle.map((x) => x.event)),
    meanReturn1D: avg(alle.map((x) => x.return1D)),
    negativeDayShare: avg(alle.map((x) => (isNum(x.return1D) ? (x.return1D < 0 ? 1 : 0) : null))),
    meanVolumeSpike: avg(alle.map((x) => x.volumeSpike)),
    meanFwd1VsMedian: avg(ueber1), meanFwd5VsMedian: avg(ueber5),
    profileMix: alle.reduce((acc, x) => { acc[x.profile] = (acc[x.profile] || 0) + 1; return acc; }, {})
  };
}
/* Treue der Nachbildung: wie viele der damals veroeffentlichten Titel
   ergibt die nachgebildete alte Regel? */
const treue = tage.filter((t) => t.published).map((t) => ({ asOf: t.asOf,
  overlap: t.old.filter((x) => t.published.includes(x.symbol)).length, of: t.published.length }));
const bericht = {
  schemaVersion: "discover-im-blick-replay-1.0.0", engineVersion: ImBlick.ENGINE_VERSION,
  generatedFrom: sitzungen.length + " Sitzungen " + sitzungen[0] + " bis " + sitzungen[sitzungen.length - 1],
  note: "Je Sitzung nur Daten bis zum Schluss dieser Sitzung; Vorwaertsrenditen nur zur Auswertung.",
  legacyFidelity: { sessions: treue.length, overlap: treue.reduce((a, t) => a + t.overlap, 0), of: treue.reduce((a, t) => a + t.of, 0), days: treue },
  old: kennzahlen("old"), new: kennzahlen("new"), days: tage
};
writeFileSync(OUT, JSON.stringify(bericht, null, 2) + "\n");
if (DUMP) writeFileSync(DUMP, JSON.stringify(dump));

if (MD) {
  const p = (v, d = 1) => (isNum(v) ? (v * 100).toFixed(d).replace(".", ",") + " %" : "–");
  const n = (v, d = 1) => (isNum(v) ? v.toFixed(d).replace(".", ",") : "–");
  const o = bericht.old, w = bericht.new;
  const zeilen = [
    ["Sitzungen", o.sessions, w.sessions],
    ["Wiederholungsquote (Titel schon am Vortag in der Auswahl)", p(o.repeatShare), p(w.repeatShare)],
    ["Mittlere Ueberlappung Tag zu Tag (Jaccard)", p(o.meanJaccard), p(w.meanJaccard)],
    ["Verschiedene Titel insgesamt", o.distinctSymbols, w.distinctSymbols],
    ["Wechsel auf Platz 1", o.topPickChanges + " von " + (o.sessions - 1), w.topPickChanges + " von " + (w.sessions - 1)],
    ["Laengste Serie in Folge", o.longestStreak + " (" + (o.longestStreakSymbol || [""])[0] + ")", w.longestStreak + " (" + (w.longestStreakSymbol || [""])[0] + ")"],
    ["Anteil mit frischem Ereignis am Tag", p(o.freshEventShare), p(w.freshEventShare)],
    ["Anteil Schlusskurs am 52W-Hoch", p(o.closeAtHighShare), p(w.closeAtHighShare)],
    ["Mittlerer Ereigniswert (0-100)", n(o.meanEventScore), n(w.meanEventScore)],
    ["Mittlere Tagesrendite der Auswahl", p(o.meanReturn1D, 2), p(w.meanReturn1D, 2)],
    ["Anteil mit Kursverlust am Tag", p(o.negativeDayShare), p(w.negativeDayShare)],
    ["Mittleres Volumen (x Ø 20 Tage)", n(o.meanVolumeSpike, 2), n(w.meanVolumeSpike, 2)],
    ["Folgetag ggue. Median (nur Auswertung)", p(o.meanFwd1VsMedian, 2), p(w.meanFwd1VsMedian, 2)],
    ["5 Sitzungen ggue. Median (nur Auswertung)", p(o.meanFwd5VsMedian, 2), p(w.meanFwd5VsMedian, 2)]
  ];
  let md = `# Replay: Eingangsflaeche „Im Blick“ alt gegen neu\n\n${bericht.generatedFrom}, ${ImBlick.ENGINE_VERSION}. ${bericht.note}\n\n`;
  md += `Nachbildung der alten Regel gegen die damals veroeffentlichte Auswahl: ${bericht.legacyFidelity.overlap} von ${bericht.legacyFidelity.of} Titeln (${bericht.legacyFidelity.sessions} Sitzungen).\n\n`;
  md += "| Kennzahl | alt | neu |\n|---|---|---|\n" + zeilen.map((z) => `| ${z[0]} | ${z[1]} | ${z[2]} |`).join("\n") + "\n\n";
  md += `Haeufigste Titel alt: ${o.mostFrequent.map((x) => x[0] + " " + x[1] + "x").join(", ")}\n\n`;
  md += `Haeufigste Titel neu: ${w.mostFrequent.map((x) => x[0] + " " + x[1] + "x").join(", ")}\n\n`;
  md += `Profile neu: ${Object.entries(w.profileMix).map(([k, v]) => k + " " + v).join(", ")}\n\n`;
  md += "## Je Sitzung\n\n| Sitzung | alt | neu |\n|---|---|---|\n";
  for (const t of tage) md += `| ${t.asOf} | ${t.old.map((x) => x.symbol).join(", ")} | ${t.new.map((x) => x.symbol + (x.fresh ? "" : "°")).join(", ")} |\n`;
  md += "\n° = ohne frisches Ereignis an diesem Tag.\n";
  writeFileSync(MD, md);
}
console.log(`Replay ${bericht.generatedFrom}: Wiederholung alt ${(bericht.old.repeatShare * 100).toFixed(0)} % -> neu ${(bericht.new.repeatShare * 100).toFixed(0)} %, ` +
            `frisches Ereignis alt ${(bericht.old.freshEventShare * 100).toFixed(0)} % -> neu ${(bericht.new.freshEventShare * 100).toFixed(0)} %`);
