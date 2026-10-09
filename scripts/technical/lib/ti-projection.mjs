/* =========================================================================
   VU Technical Intelligence — Produktschicht der Elliott Projection Engine
   (elliott-projection-1.0.0), geteilt von Produkt-Build und prospektivem Register.

   Eingabe ist die VEROEFFENTLICHTE Form eines Titels (slim(): pro.elliott, Trend,
   Konfluenz, Zeitebenen, Volumen, Datenqualitaet) — dieselbe Zaehlung, die der Kunde
   sieht. Die Projektion veraendert keine Engine-Ausgabe; sie steht in einem eigenen
   Feld (projection) neben pro.elliott.

   1. projectionInput / projectFor   Kontext + Engine-Aufruf je Titel
   2. rsRanks                        Relative Staerke (26 Wochen) im Querschnitt aller Titel des Laufs
   3. advanceStore                   Lebenszyklus der angezeigten Thesen (eingefroren, nur anhaengen)
   4. motiveCandidateFor             PRODUKT-SICHTBARKEIT (1.1.0): beste regelkonforme Motiv-Lesart mit laufender
                                     Welle 2/3 aus dem Kandidatenpool der Engine, die nicht unter den zwei
                                     angezeigten Alternativen steht. Kein Eingriff in Grammatik, Ranking oder
                                     Enthaltung: derselbe Engine-Aufruf mit dem ausgabeneutralen Haken debugAll.
   5. exploreCandidatesFor           EXPLORE ELLIOTT (1.2.0): bis zu drei weitere regelkonforme Lesarten aus demselben
                                     Pool, die mindestens eine PRODUKT-Leitplanke (G2-G5) verfehlen — nie eine
                                     harte Regel. Saubere Daten Pflicht (dataIntegrity, inkl. Split-Aufloesung).
   ========================================================================= */
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ROOT } from "./ti-data.mjs";

const require = createRequire(import.meta.url);
export const Projection = require(join(ROOT, "quant/engines/technical/projection/elliott-projection.js"));
const EV3 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js"));
const Patterns = require(join(ROOT, "quant/engines/technical/elliott/patterns.js"));
const CorporateActions = require(join(ROOT, "quant/engines/corporate-action-evidence.js"));
export const PROJECTION_VERSION = Projection.VERSION;
export const STORE_SCHEMA = "vu-elliott-projection-theses-1.0.0";
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Beste verborgene Motiv-Lesart (Welle 3 laeuft oder steht bevor) aus dem Kandidatenpool der eingefrorenen Engine.
 * Ablauf: dieselbe Elliott-Analyse wie das Produkt (gleiche Reihe, Pivots, Stichtag, Persistenzzustand, Methodik) mit dem
 * ausgabeneutralen Haken debugAll; Identitaet wird geprueft (Primaerzaehlung und Alternativen gleich), sonst null.
 * Auswahl: hoechster Rang im Pool unter IMPULSE/LEADING_DIAGONAL, nicht abgeschlossen, 2 oder 3 Wellen, letzte Welle laeuft,
 * nicht bereits als Primaerzaehlung oder Alternative angezeigt, alle Regeln des Regelwerks erfuellt (erneut geprueft),
 * seit dem Ursprung von Welle 1 kein Schluss jenseits der harten Grenze.
 * @returns {{count:object|null, rank:number|null, pool:number, reason:string|null}}
 */
export const MOTIVE_GATES = Object.freeze({ hierarchy: 1, snrMin: 3.0, w1MinWeeks: 26, trendContextMin: 0.5, timeframe: "1W", instrument: ["EQUITY_COMMON", "ELIGIBLE"] });
/* G6 Wertpapierart (Security Master): Motiv-Alternativen nur fuer zugelassene Stammaktien — nicht fuer Vorzugsaktien, Anleihen,
   Optionsscheine, Units, SPACs (Kursverlauf folgt dort Zins, Nennwert oder Struktur, nicht einer Wellenbewegung). */
let ELIG = null;
export function instrumentOf(ticker) {
  if (!ELIG) { ELIG = new Map(); try { const j = JSON.parse(readFileSync(join(ROOT, "quant/data/market/security-master/eligibility.json"), "utf8")); (Object.values(j).find(Array.isArray) || []).forEach((x) => ELIG.set(x.ticker, [x.instrument_type, x.product_eligibility])); } catch (e) { /* ohne Security Master: keine Motiv-Alternativen */ } }
  return ELIG.get(String(ticker || "").replace(/^ref_/, "")) || null;
}
/** Alle Produkt-Leitplanken G2-G5 einer Lesart (Werte und Ergebnis). Dieselben Kriterien wie productGate. */
export function gateResults(x, waves, atr) {
  const snr = snrOf(waves, atr), tc = x.c ? x.c.trendContext : null, h = x.c ? x.c.hierarchy : null;
  return {
    G2: { passed: h === MOTIVE_GATES.hierarchy, value: isNum(h) ? Math.round(h * 1000) / 1000 : null, threshold: MOTIVE_GATES.hierarchy },
    G3: { passed: snr >= MOTIVE_GATES.snrMin, value: snr, threshold: MOTIVE_GATES.snrMin },
    G4: { passed: waves[0].duration >= MOTIVE_GATES.w1MinWeeks, value: waves[0].duration, threshold: MOTIVE_GATES.w1MinWeeks },
    G5: { passed: tc >= MOTIVE_GATES.trendContextMin, value: isNum(tc) ? Math.round(tc * 1000) / 1000 : null, threshold: MOTIVE_GATES.trendContextMin }
  };
}
function instrumentOk(series) {
  const ins = instrumentOf(series.instrumentId);
  return !!ins && ins[0] === MOTIVE_GATES.instrument[0] && ins[1] === MOTIVE_GATES.instrument[1];
}
function productGate(x, waves, series, atr) {
  if (series.timeframe !== MOTIVE_GATES.timeframe) return "G4_NOT_WEEKLY";
  const g = gateResults(x, waves, atr);
  if (!x.c || !g.G2.passed) return "G2_HIERARCHY";
  if (!g.G3.passed) return "G3_NOISE";
  if (!g.G4.passed) return "G4_SMALL_DEGREE";
  if (!g.G5.passed) return "G5_AGAINST_TREND";
  if (!instrumentOk(series)) return "G6_INSTRUMENT";
  return null;
}
/** Signal/Rauschen der bestaetigten Wellen wie die Anwendbarkeit der Engine: Median |Welle| / (ATR · 1,25 · √Dauer). */
function snrOf(waves, atr) {
  if (!(atr > 0)) return null;
  const z = waves.filter((w) => w.status !== "DEVELOPING").map((w) => Math.abs(w.toPrice - w.fromPrice) / (atr * 1.25 * Math.sqrt(Math.max(1, w.duration)))).sort((a, b) => a - b);
  return z.length ? Math.round(z[Math.floor(z.length / 2)] * 1000) / 1000 : null;
}
/**
 * Kandidatenpool der eingefrorenen Engine: derselbe Aufruf wie das Produkt mit dem ausgabeneutralen Haken debugAll.
 * Einmal je Titel; Motiv-Alternative und Explore lesen denselben Pool.
 */
export function candidatePool(series, out, meth) {
  const E = out.res.methods.elliott, P = out.P.main, t = series.length - 1;
  if (!E || !E.primary) return { reason: "NO_PRIMARY", all: [] };
  if (series.timeframe !== MOTIVE_GATES.timeframe) return { reason: "G4_NOT_WEEKLY", all: [] };   // vor dem zweiten Engine-Lauf
  const E2 = EV3.analyzeElliottV3({ series, features: P.features, pivots: P.pivots, asOfIndex: t, barsPerYear: P.profile.barsPerYear, previous: out.replay.states[t] || null,
                                    methodology: meth || { elliottEngine: "v3" }, debugAll: true });
  const same = E2.primary && E2.primary.persistenceKey === E.primary.persistenceKey && E2.alternatives.map((a) => a.countId).join() === (E.alternatives || []).map((a) => a.countId).join();
  if (!same) return { reason: "IDENTITY_MISMATCH", all: [] };
  const shown = new Set([E.primary].concat(E.alternatives || []).map((x) => x.pattern + "|" + x.waves[0].fromTime + "|" + x.waves.map((w) => w.toTime).join(",")));
  return { reason: null, all: (E2.trace && E2.trace.allCands) || [], shown, atr: P.features.columns.atr[t] };
}
/** Wellen einer Lesart aus dem Pool (Kurse der Reihe an den Pivot-Indizes). */
function wavesOf(x, series) {
  const c = series.close, ts = series.timestamps, n = x.pts.length - 1, labels = (Patterns.PATTERNS[x.type] || {}).labels || [];
  const waves = [];
  for (let k = 1; k <= n; k++) waves.push({ label: labels[k - 1] || String(k), fromIndex: x.pts[k - 1], toIndex: x.pts[k], fromTime: ts[x.pts[k - 1]], toTime: ts[x.pts[k]], fromPrice: c[x.pts[k - 1]], toPrice: c[x.pts[k]],
                                            status: k === n ? "DEVELOPING" : "CONFIRMED", duration: Math.max(1, x.pts[k] - x.pts[k - 1]) });
  return waves;
}
const shownKey = (type, waves) => type + "|" + waves[0].fromTime + "|" + waves.map((w) => w.toTime).join(",");
const round4 = (v) => Math.round(v * 1e4) / 1e4;
const PATTERN_DE = { IMPULSE: "Impuls", LEADING_DIAGONAL: "Leading Diagonal", ENDING_DIAGONAL: "Ending Diagonal", ZIGZAG: "Zigzag", FLAT: "Flat", WXY: "Doppelte Korrektur (W-X-Y)", DOUBLE_ZIGZAG: "Doppel-Zigzag", TRIPLE_ZIGZAG: "Dreifach-Zigzag", TRIANGLE: "Dreieck" };
/** Zaehlungsobjekt in der veroeffentlichten Form (wie Engine-Alternativen) + Regel- und Grenzpruefung. null = nicht regelkonform. */
function countOf(x, waves, series, all, ix, atr) {
  const ev = Patterns.evaluate(x.type, waves);
  if (!ev || !ev.valid) return { invalid: "RECHECK_INVALID" };   // nur regelkonforme Lesarten (Doppelpruefung)
  const n = waves.length, c = series.close, t = series.length - 1;
  const inv = Patterns.invalidation(x.type, waves, n), s = waves[0].toPrice >= waves[0].fromPrice ? 1 : -1;
  /* seit dem Ursprung kein Schluss jenseits der harten Grenze (sonst waere die Lesart schon verworfen) */
  if (inv.hard && c.slice(x.pts[0] + 1, t + 1).some((v) => (inv.hard.direction === "below" ? v < inv.hard.price : v > inv.hard.price))) return { invalid: "HARD_LIMIT_BREACHED" };
  const motive = x.type === "IMPULSE" || x.type === "LEADING_DIAGONAL" || x.type === "ENDING_DIAGONAL";
  return { count: { pattern: x.type, patternName: PATTERN_DE[x.type] || x.type, variant: ev.variant || null, direction: s > 0 ? "UP" : "DOWN", complete: false,
    currentWave: { label: waves[n - 1].label, role: motive ? (n % 2 === 1 ? "MOTIVE" : "CORRECTIVE") : (n % 2 === 1 ? "MOTIVE" : "CORRECTIVE"), wave: n, of: (Patterns.PATTERNS[x.type] || {}).waves || null },
    nextMove: n % 2 === 0 ? (s > 0 ? "UP" : "DOWN") : (s > 0 ? "DOWN" : "UP"),
    waves: waves.map((w) => ({ label: w.label, fromTime: w.fromTime, toTime: w.toTime, fromPrice: round4(w.fromPrice), toPrice: round4(w.toPrice), status: w.status })),
    invalidation: inv.hard ? { price: round4(inv.hard.price), direction: inv.hard.direction, ruleId: inv.hard.ruleId, statement: inv.hard.statement, kind: "HARD_RULE" } : null,
    revision: inv.revision ? { price: round4(inv.revision.price), direction: inv.revision.direction, ruleId: inv.revision.ruleId, statement: inv.revision.statement, kind: "REVISION" } : null,
    persistenceKey: null, ruleAudit: { validity: "VALID", openRules: ev.openRules, hardRules: ev.rules.filter((r) => r.passed === true).map((r) => r.ruleId) }, countQuality: null,
    pool: { rank: ix, size: all.length, components: x.c || null, snr: snrOf(waves, atr) } }, inv };
}
export function motiveCandidateFor(series, out, meth, pool) {
  const Q = pool || candidatePool(series, out, meth);
  if (Q.reason) return { count: null, rank: null, pool: 0, reason: Q.reason };
  const all = Q.all, E = out.res.methods.elliott;
  for (let ix = 0; ix < all.length; ix++) {
    const x = all[ix];
    if (!(x.type === "IMPULSE" || x.type === "LEADING_DIAGONAL") || x.complete) continue;
    const n = x.pts.length - 1; if (n !== 2 && n !== 3) continue;
    if (!x.subs.length || x.subs[x.subs.length - 1].st !== "DEVELOPING") continue;
    const waves = wavesOf(x, series).map((w, k) => Object.assign(w, { label: String(k + 1) }));
    if (Q.shown.has(shownKey(x.type, waves))) return { count: null, rank: ix, pool: all.length, reason: "ALREADY_SHOWN" };
    /* PRODUKT-LEITPLANKEN (vor jeder Auswertung festgelegt, aus Kriterien der Engine selbst; nicht an Einzeltiteln eingestellt):
       G2 Grad-Konsistenz: keine Kreuzung mit einer vergleichbar starken abgeschlossenen Struktur (Komponente hierarchy = 1)
       G3 deutlich ueber Rauschen: Signal/Rauschen der bestaetigten Wellen >= Schwelle "voll" der Anwendbarkeit (3,0)
       G4 grosser Grad, Wochen zuerst: nur Wochenanalyse, Welle 1 mindestens 26 Wochen
       G5 nicht gegen den gemessenen Trend: Komponente trendContext >= 0,5 (Engine: mit Trend 1, ohne 0,5, dagegen 0,2)
       Nur der bestplatzierte Kandidat wird geprueft; scheitert er, gibt es keine Motiv-Alternative (keine Suche nach "irgendeiner"). */
    const gate = productGate(x, waves, series, Q.atr);
    if (gate) return { count: null, rank: ix, pool: all.length, reason: gate };
    const r = countOf(x, waves, series, all, ix, Q.atr);
    if (r.invalid) return { count: null, rank: ix, pool: all.length, reason: r.invalid };
    /* Schluessel wie bei Engine-Alternativen (Muster|Beginn|Richtung): wechselt die Lesart zwischen Alternative und Motiv-Alternative,
       bleibt es dieselbe These (Lebenszyklus, Register). */
    delete r.count.ruleAudit.hardRules; r.count.patternName = x.type === "IMPULSE" ? "Impuls" : "Leading Diagonal"; r.count.variant = null;
    r.count.currentWave = { label: String(waves.length), role: waves.length === 3 ? "MOTIVE" : "CORRECTIVE", wave: waves.length, of: 5 };
    return { count: r.count, rank: ix, pool: all.length, reason: null };
  }
  return { count: null, rank: null, pool: all.length, reason: "NONE_IN_POOL" };
}

/* =========================================================================
   DATENINTEGRITAET fuer Explore (strenger als die Struktur-Leitplanken): Explore ist strukturell grosszuegiger als das
   normale Produkt, bei schlechten Daten nie. Split-Verdacht der Engine nur aufgeloest mit Kapitalmassnahmen-Beleg der Reihe.
   ========================================================================= */
/** Aufloesung der Split-Verdachtsfaelle der Engine gegen den Beleg der Wochenreihe (series.corporateActions). */
export function splitResolutionFor(series, out) {
  const E = out.res.methods.elliott, dq = E && E.dataQuality;
  const suspected = dq && Array.isArray(dq.suspectedSplits) ? dq.suspectedSplits : [];
  const r = CorporateActions.resolve(suspected, series.corporateActions || null);
  return { status: r.status, version: CorporateActions.VERSION, items: r.items };
}
export function dataIntegrity(series, out, splitRes) {
  const E = out.res.methods.elliott, dq = (E && E.dataQuality) || {}, rq = out.res.dataQuality || {}, c = series.close, t = series.length - 1;
  const reasons = [];
  if (!(c[t] > 0)) reasons.push("PRICE_INVALID");
  if (c.some((v) => !(v > 0) || !Number.isFinite(v))) reasons.push("NON_POSITIVE_PRICE");
  if (rq.stalePriceBars) reasons.push("STALE_OR_PINNED");
  if (splitRes && splitRes.status === "UNRESOLVED") reasons.push("SPLIT_UNRESOLVED");
  if (dq.maxGapBars >= 4 || dq.gaps >= 3) reasons.push("HISTORY_GAPS");
  return { status: reasons.length ? "BLOCKED" : splitRes && splitRes.status === "RESOLVED" ? "CLEAN_AFTER_SPLIT_RESOLUTION" : "CLEAN", reasons };
}

/* =========================================================================
   EXPLORE ELLIOTT 1.0.0 — Auswahl (deterministisch, vor jeder Auswertung festgelegt, nicht an Einzeltiteln eingestellt)
     Kandidat:  Lesart aus dem unveraenderten Pool, nicht abgeschlossen, letzte Welle laeuft, Muster mit Projektionsformel
                (Impuls/Diagonale Welle 2-5, Zigzag/Flat/W-X-Y Welle B-C, Doppel-/Dreifach-Zigzag), nicht schon angezeigt
                (Primaer, Alternativen, Motiv-Alternative), ALLE Regeln erfuellt (Doppelpruefung), kein Schluss jenseits
                der harten Grenze seit dem Ursprung, mindestens eine Projektionszone noch offen, mindestens EINE
                Produkt-Leitplanke G2-G5 verfehlt (eine Lesart ohne verfehlte Leitplanke gehoert nicht in Explore).
     Titel:     nur Wochenanalyse; Wertpapierart EQUITY_COMMON/ELIGIBLE (G6 sperrt den Titel, ist kein Explore-Grund);
                Datenintegritaet sauber (dataIntegrity).
     Rang:      nur Lesarten in der besseren Haelfte des Pools (Rang <= 50 %, fuer jeden Platz) — Lesarten vom Ende des
                Pools sind Rauschen der Kandidatensuche, keine Lesart fuer Kunden (Anti-Spam; Rang wird angezeigt).
     Auswahl:   Platz 1 = bestplatzierte Motiv-Lesart (These Welle 3), gibt es keine, der bestplatzierte Kandidat.
                Platz 2 und 3 in Rangfolge, mit einer anderen Kombination aus Thesentyp und Richtung als alle gewaehlten
                und ohne gleichen Ursprung bei gleicher Richtung. Hoechstens 3; gibt es nichts strukturell Verschiedenes,
                bleibt es bei einer.
     Leiter:    nahezu gleiche Projektionsleitern werden in der Projection Engine (Anzeige) zusaetzlich verworfen.
   ========================================================================= */
export const EXPLORE = Object.freeze({ version: "explore-elliott-1.0.0", max: 3, rankHalf: 0.5, gates: ["G2", "G3", "G4", "G5"] });
const EXPLORE_TYPES = { IMPULSE: [2, 3, 4, 5], LEADING_DIAGONAL: [2, 3, 4, 5], ENDING_DIAGONAL: [2, 3, 4, 5], ZIGZAG: [2, 3], FLAT: [2, 3], WXY: [2, 3], DOUBLE_ZIGZAG: [2, 3, 6, 7], TRIPLE_ZIGZAG: [2, 3, 4, 5] };
export function exploreCandidatesFor(series, out, meth, pool, motive, integrity) {
  const res = { version: EXPLORE.version, reason: null, pool: 0, eligible: 0, items: [] };
  if (series.timeframe !== MOTIVE_GATES.timeframe) return Object.assign(res, { reason: "NOT_WEEKLY" });
  const Q = pool || candidatePool(series, out, meth);
  if (Q.reason) return Object.assign(res, { reason: Q.reason });
  res.pool = Q.all.length;
  if (integrity && integrity.status === "BLOCKED") return Object.assign(res, { reason: "DATA_" + integrity.reasons[0] });
  if (!instrumentOk(series)) return Object.assign(res, { reason: "G6_INSTRUMENT" });
  const close = series.close[series.length - 1], mKey = motive && motive.count ? shownKey(motive.count.pattern, motive.count.waves) : null;
  const E = out.res.methods.elliott, dirOf = (c) => (c.waves[0].toPrice >= c.waves[0].fromPrice ? "UP" : "DOWN");
  const thesisKeys = new Set([E.primary].concat(E.alternatives || []).concat(motive && motive.count ? [motive.count] : []).map((c) => c.pattern + "|" + c.waves[0].fromTime + "|" + dirOf(c)));
  /* 1) alle zulaessigen Kandidaten in Rangfolge */
  const cands = [];
  Q.all.forEach((x, ix) => {
    if ((ix + 1) / Q.all.length > EXPLORE.rankHalf) return;                            // Rangqualitaet (jeder Platz)
    if (x.complete || !EXPLORE_TYPES[x.type] || EXPLORE_TYPES[x.type].indexOf(x.pts.length - 1) < 0) return;
    if (!x.subs.length || x.subs[x.subs.length - 1].st !== "DEVELOPING") return;
    const waves = wavesOf(x, series), key = shownKey(x.type, waves);
    if (Q.shown.has(key) || key === mKey) return;
    const gates = gateResults(x, waves, Q.atr), failed = EXPLORE.gates.filter((g) => !gates[g].passed);
    if (!failed.length) return;
    const r = countOf(x, waves, series, Q.all, ix, Q.atr); if (r.invalid) return;
    /* gueltige Invalidation Pflicht: harte Grenze vorhanden und positiv (Flat-B-Grenze kann rechnerisch unter null fallen) */
    if (!r.count.invalidation || !(r.count.invalidation.price > 0)) return;
    /* gleiche Thesenkennung (Muster, Ursprung, Richtung) wie eine angezeigte Lesart → keine weitere Lesart, sondern dieselbe These */
    if (thesisKeys.has(r.count.pattern + "|" + r.count.waves[0].fromTime + "|" + r.count.direction)) return;
    const geo = Projection.geometry(r.count); if (!geo) return;
    const lad = Projection.ladder(geo, close);
    if (!lad.zones.length || lad.zones.every((z) => z.state === "PASSED")) return;   // nichts mehr offen → kein Nutzen
    cands.push({ kind: geo.type + "|" + r.count.direction, type: geo.type, item: { count: r.count, rank: ix, pool: Q.all.length, gates, failed } });
  });
  res.eligible = cands.length;
  if (!cands.length) return Object.assign(res, { reason: "NONE_IN_POOL" });
  /* 2) Platz 1, dann strukturell verschiedene in Rangfolge */
  const first = cands.find((c) => c.type === "WAVE_3") || cands[0], picked = [first];
  for (const c of cands) {
    if (picked.length >= EXPLORE.max) break;
    if (picked.includes(c)) continue;
    if (picked.some((p) => p.kind === c.kind)) continue;
    if (picked.some((p) => p.item.count.direction === c.item.count.direction && p.item.count.waves[0].fromTime === c.item.count.waves[0].fromTime)) continue;
    picked.push(c);
  }
  res.items = picked.map((p, k) => Object.assign(p.item, { slot: k + 1 }));
  return res;
}

/** Kursentwicklung ueber ~26 Wochen (Woche: 26 Bars, Tag: 126) jetzt und ~13 Wochen frueher, aus den Chartdaten des Titels. */
export function rsInput(p) {
  const c = p && p.chart && p.chart.close; if (!c || !c.length) return null;
  const n = c.length, k = p.timeframe === "1D" ? 126 : 26, h = p.timeframe === "1D" ? 63 : 13;
  const ret = (t) => (t - k >= 0 && c[t - k] > 0 && c[t] > 0 ? c[t] / c[t - k] - 1 : null);
  return { r: ret(n - 1), rp: ret(n - 1 - h) };
}
/** Perzentilrang (0..1) je Titel; rankPrev aus dem Querschnitt 13 Wochen frueher. */
export function rsRanks(inputs) {
  const rank = (key) => {
    const arr = [...inputs].filter(([, v]) => v && isNum(v[key])).sort((a, b) => a[1][key] - b[1][key]), out = new Map();
    arr.forEach(([t], q) => out.set(t, arr.length > 1 ? q / (arr.length - 1) : 0.5));
    return out;
  };
  const now = rank("r"), prev = rank("rp"), out = new Map();
  for (const [t] of inputs) if (now.has(t)) out.set(t, { rank: now.get(t), rankPrev: prev.has(t) ? prev.get(t) : null, universe: now.size });
  return out;
}

/** Kontext der Projektion aus der veroeffentlichten Form (keine Neuberechnung von Trend oder Struktur). */
export function projectionInput(p, rs) {
  const fam = ((p.confluence && p.confluence.families) || []).find((x) => x.family === "STRUCTURE");
  const vol = p.pro && p.pro.volume && isNum(p.pro.volume.relativeVolume) ? p.pro.volume : null;
  return { close: p.price.close, asOf: p.asOf, timeframe: p.timeframe, trend: p.pro && p.pro.trend ? p.pro.trend.primary : null, structureVote: fam ? fam.direction : null,
           alignment: p.timeframe === "1D" && p.timeframes ? p.timeframes.alignment : null, volume: vol, rs: rs || null,
           stalePriceBars: p.dataQuality ? p.dataQuality.stalePriceBars : null, bars: p.chart ? { t: p.chart.timestamps, c: p.chart.close } : null };
}
/** Nur die Felder von pro.elliott, die die Projektion liest (Build und Register rechnen damit identisch). */
export function projectionElliott(E) {
  if (!E) return null;
  const cnt = (c) => c && { pattern: c.pattern, patternName: c.patternName, variant: c.variant, direction: c.direction, complete: c.complete, currentWave: c.currentWave, nextMove: c.nextMove,
    waves: (c.waves || []).map((w) => ({ label: w.label, fromTime: w.fromTime, toTime: w.toTime, fromPrice: w.fromPrice, toPrice: w.toPrice, status: w.status })),
    invalidation: c.invalidation || null, revision: c.revision || null, persistenceKey: c.persistenceKey || null,
    ruleAudit: c.ruleAudit ? { validity: c.ruleAudit.validity } : null, countQuality: c.countQuality ? { level: c.countQuality.level } : null };
  const H = E.higherDegree;
  return { engineVersion: E.engineVersion || null, ruleSetVersion: E.ruleSetVersion || null, applicability: E.applicability ? { abstain: !!E.applicability.abstain, level: E.applicability.level } : null,
           dataQuality: E.dataQuality ? { suspectedSplits: Array.isArray(E.dataQuality.suspectedSplits) ? E.dataQuality.suspectedSplits.length : E.dataQuality.suspectedSplits || 0 } : null,
           primary: cnt(E.primary), alternatives: (E.alternatives || []).map(cnt),
           higherDegree: H ? { pattern: H.pattern, patternName: H.patternName, current: H.current, waves: (H.waves || []).map((w) => ({ label: w.label, fromTime: w.fromTime, toTime: w.toTime, fromPrice: w.fromPrice, toPrice: w.toPrice, status: w.status })) } : null };
}
/** Eingaben der Produktschicht neben pro.elliott: verborgene Motiv-Lesart, Explore-Kandidaten, Split-Aufloesung (Build und Register gleich). */
export function withProductInputs(E, p) {
  if (!E) return E;
  if (p.motiveCandidate && p.motiveCandidate.count) E.hiddenMotive = p.motiveCandidate;
  if (p.exploreCandidates && p.exploreCandidates.items && p.exploreCandidates.items.length) E.explore = p.exploreCandidates;
  if (E.dataQuality && p.dataQuality && p.dataQuality.splitResolution) E.dataQuality.splitResolution = p.dataQuality.splitResolution.status;
  return E;
}
export function projectFor(p, rs) {
  return Projection.build(withProductInputs(projectionElliott(p.pro ? p.pro.elliott : null), p), projectionInput(p, rs));
}
/** Kompakte, unveraenderliche Form fuer das prospektive Register (eine These, eingefroren). */
export function registryProjection(proj) {
  if (!proj) return null;
  const t = proj.primary || null, c = proj.context;
  const th = (x) => x && x.zones ? { key: x.key, source: x.source, type: x.type, label: x.label, target: x.target, degree: x.degree, pattern: x.pattern, direction: x.direction, status: x.status,
    anchor: x.anchor, reference: x.reference, zones: x.zones.map((z) => ({ tier: z.tier, low: z.low, high: z.high, ratios: z.ratios, relationId: z.relationId, state: z.state })),
    invalidation: x.invalidation ? { price: x.invalidation.price, direction: x.invalidation.direction, ruleId: x.invalidation.ruleId } : null,
    confirmation: x.confirmation ? { price: x.confirmation.price, ruleId: x.confirmation.ruleId, class: x.confirmation.class, passed: x.confirmation.passed } : null,
    cap: x.cap ? { price: x.cap.price, ruleId: x.cap.ruleId } : null, signature: x.signature } : null;
  return { version: proj.version, status: proj.status, consumerVisible: proj.consumerVisible, close: proj.close, asOf: proj.asOf, timeframe: proj.timeframe, engine: proj.engine,
           thesis: th(t), alternative: th(proj.alternative), highUpside: !!proj.highUpside,
           context: c ? { trend: c.trend.state, rs: c.rs.state === "UNAVAILABLE" ? null : { rank: c.rs.rank, state: c.rs.state }, marketStructure: t ? t.roadmap.structure.state : null } : null };
}

/** Angezeigte Thesen eines Projektionsobjekts mit Rolle. */
export function displayedTheses(proj) {
  if (!proj) return [];
  const out = [];
  if (proj.consumerVisible) {
    if (proj.primary) out.push(["PRIMARY", proj.primary]);
    if (proj.alternative) out.push(["ALTERNATIVE", proj.alternative]);
    if (proj.highUpside && proj.highUpside.zones) out.push(["HIGH_UPSIDE", proj.highUpside]);
  }
  /* 1.1.0: Motiv-Alternative ist eigenstaendig sichtbar (auch bei Enthaltung fuer die Hauptzaehlung) */
  if (proj.motiveAlternative) out.push(["MOTIVE_ALTERNATIVE", proj.motiveAlternative]);
  /* 1.2.0: Explore Elliott (eingeklappt, explorativ) — eigene Rolle, dieselbe Thesenkennung wie in jeder anderen Rolle */
  (proj.explore || []).forEach((th) => out.push(["EXPLORE", th]));
  return out;
}

/**
 * Lebenszyklus aller angezeigten Thesen fortschreiben.
 * @param {object|null} prev   bisheriger Store (projection-theses.json) oder null
 * @param {Array<{symbol, tf, proj, bars, asOf}>} items  Titel dieses Laufs (nur analysierte Titel)
 * @param {object} versions  Versionsangaben, die jede neue Revision traegt
 * @returns {{store, bySymbol: Map<string, Map<key, entry>>, events: number}}
 */
export function advanceStore(prev, items, versions) {
  const theses = Object.assign({}, prev && prev.theses ? prev.theses : {}), bySymbol = new Map();
  let events = 0;
  for (const it of items) {
    const cur = displayedTheses(it.proj), matched = new Set();
    /* Vorübergehend nicht angezeigt (nicht umgedeutet): Hauptthesen bei Enthaltung/Datenproblem; Motiv-Alternativen nur bei Datenproblem */
    const blocked = !it.proj || it.proj.status === "DATA_INVALID" || it.proj.status === "UNAVAILABLE";
    const withheldFor = (e) => blocked || (e.role !== "MOTIVE_ALTERNATIVE" && e.role !== "EXPLORE" && !it.proj.consumerVisible);
    const active = Object.keys(theses).filter((id) => theses[id].symbol === it.symbol && theses[id].timeframe === it.tf && theses[id].state !== "ARCHIVED");
    for (const id of active) {
      const e = theses[id], hit = cur.find(([, th]) => th.key === e.key);
      if (hit) matched.add(hit[1].key);
      const next = Projection.advanceLifecycle(e, hit ? hit[1] : null, it.bars, it.asOf, { id, symbol: it.symbol, timeframe: it.tf, role: hit ? hit[0] : e.role, versions, withheld: !hit && withheldFor(e) });
      events += next.events.length - e.events.length; theses[id] = next;
    }
    for (const [role, th] of cur) {
      if (matched.has(th.key)) continue;
      /* gleiche These nach Archivierung wieder da → neue Kennung; der archivierte Eintrag bleibt unveraendert */
      const base = it.symbol + "|" + it.tf + "|" + th.key;
      let id = base, n = 1; while (theses[id]) id = base + "#" + (++n);
      theses[id] = Projection.advanceLifecycle(null, th, it.bars, it.asOf, { id, symbol: it.symbol, timeframe: it.tf, role, versions });
      events += theses[id].events.length; matched.add(th.key);
    }
  }
  for (const [id, e] of Object.entries(theses)) {
    if (e.state === "ARCHIVED") continue;
    const k = e.symbol + "|" + e.timeframe, m = bySymbol.get(k) || new Map(); m.set(e.key, Object.assign({ id }, e)); bySymbol.set(k, m);
  }
  const sorted = Object.fromEntries(Object.keys(theses).sort().map((k) => [k, theses[k]]));
  return { store: { schemaVersion: STORE_SCHEMA, engine: PROJECTION_VERSION, rule: "Nur anhängen: eine eingefrorene Revision wird nie geändert; neue Anker → neue Revision; Wegfall → RELABELLED/ARCHIVED.", theses: sorted }, bySymbol, events };
}

/** Lebenszyklus-Zusammenfassung an die angezeigte These haengen (Anzeige der eingefrorenen Revision). */
export function attachLifecycle(proj, entries) {
  if (!proj || !entries) return;
  for (const [, th] of displayedTheses(proj)) {
    const e = entries.get(th.key); if (!e) continue;
    const R = e.revisions[e.revisions.length - 1];
    th.lifecycle = { id: e.id, createdAt: e.createdAt, rev: e.rev, frozenAt: R.frozenAt, state: e.state, stateLabel: Projection.STATE_DE[e.state] || e.state, revisions: e.revisions.length,
                     frozenZones: R.zones, events: e.events.slice(-8), frozen: R.signature === th.signature };
  }
}
