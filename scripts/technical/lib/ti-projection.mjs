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
   ========================================================================= */
import { join } from "node:path";
import { createRequire } from "node:module";
import { ROOT } from "./ti-data.mjs";

const require = createRequire(import.meta.url);
export const Projection = require(join(ROOT, "quant/engines/technical/projection/elliott-projection.js"));
export const PROJECTION_VERSION = Projection.VERSION;
export const STORE_SCHEMA = "vu-elliott-projection-theses-1.0.0";
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

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
export function projectFor(p, rs) { return Projection.build(projectionElliott(p.pro ? p.pro.elliott : null), projectionInput(p, rs)); }
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
  if (!proj || !proj.consumerVisible) return [];
  const out = [];
  if (proj.primary) out.push(["PRIMARY", proj.primary]);
  if (proj.alternative) out.push(["ALTERNATIVE", proj.alternative]);
  if (proj.highUpside && proj.highUpside.zones) out.push(["HIGH_UPSIDE", proj.highUpside]);
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
    const active = Object.keys(theses).filter((id) => theses[id].symbol === it.symbol && theses[id].timeframe === it.tf && theses[id].state !== "ARCHIVED");
    for (const id of active) {
      const e = theses[id], hit = cur.find(([, th]) => th.key === e.key);
      if (hit) matched.add(hit[1].key);
      const next = Projection.advanceLifecycle(e, hit ? hit[1] : null, it.bars, it.asOf, { id, symbol: it.symbol, timeframe: it.tf, role: hit ? hit[0] : e.role, versions });
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
