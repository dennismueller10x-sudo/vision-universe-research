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
   ========================================================================= */
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ROOT } from "./ti-data.mjs";

const require = createRequire(import.meta.url);
export const Projection = require(join(ROOT, "quant/engines/technical/projection/elliott-projection.js"));
const EV3 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js"));
const Patterns = require(join(ROOT, "quant/engines/technical/elliott/patterns.js"));
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
function productGate(x, waves, series, atr) {
  if (series.timeframe !== MOTIVE_GATES.timeframe) return "G4_NOT_WEEKLY";
  if (!x.c || x.c.hierarchy !== MOTIVE_GATES.hierarchy) return "G2_HIERARCHY";
  const snr = snrOf(waves, atr);
  if (!(snr >= MOTIVE_GATES.snrMin)) return "G3_NOISE";
  if (waves[0].duration < MOTIVE_GATES.w1MinWeeks) return "G4_SMALL_DEGREE";
  if (!(x.c.trendContext >= MOTIVE_GATES.trendContextMin)) return "G5_AGAINST_TREND";
  const ins = instrumentOf(series.instrumentId);
  if (!ins || ins[0] !== MOTIVE_GATES.instrument[0] || ins[1] !== MOTIVE_GATES.instrument[1]) return "G6_INSTRUMENT";
  return null;
}
/** Signal/Rauschen der bestaetigten Wellen wie die Anwendbarkeit der Engine: Median |Welle| / (ATR · 1,25 · √Dauer). */
function snrOf(waves, atr) {
  if (!(atr > 0)) return null;
  const z = waves.filter((w) => w.status !== "DEVELOPING").map((w) => Math.abs(w.toPrice - w.fromPrice) / (atr * 1.25 * Math.sqrt(Math.max(1, w.duration)))).sort((a, b) => a - b);
  return z.length ? Math.round(z[Math.floor(z.length / 2)] * 1000) / 1000 : null;
}
export function motiveCandidateFor(series, out, meth) {
  const E = out.res.methods.elliott, P = out.P.main, t = series.length - 1;
  if (!E || !E.primary) return { count: null, rank: null, pool: 0, reason: "NO_PRIMARY" };
  const E2 = EV3.analyzeElliottV3({ series, features: P.features, pivots: P.pivots, asOfIndex: t, barsPerYear: P.profile.barsPerYear, previous: out.replay.states[t] || null,
                                    methodology: meth || { elliottEngine: "v3" }, debugAll: true });
  const same = E2.primary && E2.primary.persistenceKey === E.primary.persistenceKey && E2.alternatives.map((a) => a.countId).join() === (E.alternatives || []).map((a) => a.countId).join();
  if (!same) return { count: null, rank: null, pool: 0, reason: "IDENTITY_MISMATCH" };
  const all = (E2.trace && E2.trace.allCands) || [], c = series.close, ts = series.timestamps;
  const shown = new Set([E.primary].concat(E.alternatives || []).map((x) => x.pattern + "|" + x.waves.map((w) => w.toTime).join(",")));
  for (let ix = 0; ix < all.length; ix++) {
    const x = all[ix];
    if (!(x.type === "IMPULSE" || x.type === "LEADING_DIAGONAL") || x.complete) continue;
    const n = x.pts.length - 1; if (n !== 2 && n !== 3) continue;
    if (!x.subs.length || x.subs[x.subs.length - 1].st !== "DEVELOPING") continue;
    const waves = [];
    for (let k = 1; k <= n; k++) waves.push({ label: String(k), fromIndex: x.pts[k - 1], toIndex: x.pts[k], fromTime: ts[x.pts[k - 1]], toTime: ts[x.pts[k]], fromPrice: c[x.pts[k - 1]], toPrice: c[x.pts[k]],
                                              status: k === n ? "DEVELOPING" : "CONFIRMED", duration: Math.max(1, x.pts[k] - x.pts[k - 1]) });
    if (shown.has(x.type + "|" + waves.map((w) => w.toTime).join(","))) return { count: null, rank: ix, pool: all.length, reason: "ALREADY_SHOWN" };
    /* PRODUKT-LEITPLANKEN (vor jeder Auswertung festgelegt, aus Kriterien der Engine selbst; nicht an Einzeltiteln eingestellt):
       G2 Grad-Konsistenz: keine Kreuzung mit einer vergleichbar starken abgeschlossenen Struktur (Komponente hierarchy = 1)
       G3 deutlich ueber Rauschen: Signal/Rauschen der bestaetigten Wellen >= Schwelle "voll" der Anwendbarkeit (3,0)
       G4 grosser Grad, Wochen zuerst: nur Wochenanalyse, Welle 1 mindestens 26 Wochen
       G5 nicht gegen den gemessenen Trend: Komponente trendContext >= 0,5 (Engine: mit Trend 1, ohne 0,5, dagegen 0,2)
       Nur der bestplatzierte Kandidat wird geprueft; scheitert er, gibt es keine Motiv-Alternative (keine Suche nach "irgendeiner"). */
    const gate = productGate(x, waves, series, P.features.columns.atr[t]);
    if (gate) return { count: null, rank: ix, pool: all.length, reason: gate };
    const ev = Patterns.evaluate(x.type, waves);
    if (!ev || !ev.valid) continue;                                   // nur regelkonforme Lesarten (Doppelpruefung)
    const inv = Patterns.invalidation(x.type, waves, n), s = waves[0].toPrice >= waves[0].fromPrice ? 1 : -1;
    /* seit dem Ursprung kein Schluss jenseits der harten Grenze (sonst waere die Lesart schon verworfen) */
    if (inv.hard && c.slice(x.pts[0] + 1, t + 1).some((v) => (inv.hard.direction === "below" ? v < inv.hard.price : v > inv.hard.price))) continue;
    const round4 = (v) => Math.round(v * 1e4) / 1e4;
    const count = { pattern: x.type, patternName: x.type === "IMPULSE" ? "Impuls" : "Leading Diagonal", variant: null, direction: s > 0 ? "UP" : "DOWN", complete: false,
      currentWave: { label: String(n), role: n === 3 ? "MOTIVE" : "CORRECTIVE", wave: n, of: 5 }, nextMove: n === 2 ? (s > 0 ? "UP" : "DOWN") : (s > 0 ? "DOWN" : "UP"),
      waves: waves.map((w) => ({ label: w.label, fromTime: w.fromTime, toTime: w.toTime, fromPrice: round4(w.fromPrice), toPrice: round4(w.toPrice), status: w.status })),
      invalidation: inv.hard ? { price: round4(inv.hard.price), direction: inv.hard.direction, ruleId: inv.hard.ruleId, statement: inv.hard.statement, kind: "HARD_RULE" } : null,
      revision: inv.revision ? { price: round4(inv.revision.price), direction: inv.revision.direction, ruleId: inv.revision.ruleId, statement: inv.revision.statement, kind: "REVISION" } : null,
      persistenceKey: x.type + "|" + x.pts[0] + "|" + s, ruleAudit: { validity: "VALID", openRules: ev.openRules }, countQuality: null,
      pool: { rank: ix, size: all.length, components: x.c || null, snr: snrOf(waves, P.features.columns.atr[t]) } };
    return { count, rank: ix, pool: all.length, reason: null };
  }
  return { count: null, rank: null, pool: all.length, reason: "NONE_IN_POOL" };
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
export function projectFor(p, rs) {
  const E = projectionElliott(p.pro ? p.pro.elliott : null);
  if (E && p.motiveCandidate && p.motiveCandidate.count) E.hiddenMotive = p.motiveCandidate;
  return Projection.build(E, projectionInput(p, rs));
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
    const withheldFor = (e) => blocked || (e.role !== "MOTIVE_ALTERNATIVE" && !it.proj.consumerVisible);
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
