/* =========================================================================
   Datenstand-Richtlinie im Build (data-freshness-1.0.0): Klassifikation je Titel, Zurueckhalten der laufenden These in den
   veroeffentlichten Produktdaten (Shard, Index) – die Analyse selbst und die Lebenszyklus-Historie bleiben unveraendert.
   Siehe quant/engines/technical/ti/data-freshness.js.
   ========================================================================= */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { ROOT } from "./ti-data.mjs";

const require = createRequire(import.meta.url);
export const Freshness = require(join(ROOT, "quant/engines/technical/ti/data-freshness.js"));
const Identity = require(join(ROOT, "core/identity.js"));

/** Wertpapierstamm: Boerse und Aktivitaet je Ticker (Datei: security-master/eligibility.json). */
export function loadMaster(root = ROOT) {
  const m = new Map(), f = join(root, "quant/data/market/security-master/eligibility.json");
  if (!existsSync(f)) return m;
  const j = JSON.parse(readFileSync(f, "utf8"));
  for (const x of (Object.values(j).find(Array.isArray) || [])) m.set(x.ticker, { venue: x.exchange || null, active: x.active_status === "INACTIVE" ? false : true, status: x.active_status || null });
  return m;
}

/** Stand der Datenaktualisierung des Titels (nur zur Ursachenangabe): sourceUpdatedAt der kompakten Tagesreihe. */
function refreshedAt(ticker, root) {
  const f = join(root, "quant/data/market/discover-series", Identity.securityIdForTicker(ticker) + ".json");   // ADR-001: Identitaet nur ueber core/identity.js
  try { const u = JSON.parse(readFileSync(f, "utf8")).sourceUpdatedAt; return u ? String(u).slice(0, 10) : null; } catch { return null; }
}

/** Klassifikation eines Produktpayloads (p.asOf = Stand der letzten Bar). */
export function freshnessOf(p, ctx) {
  const t = p.symbol, mm = ctx.master.get(t) || {};
  const input = { lastBar: p.asOf, reference: ctx.reference, venue: mm.venue || null, active: mm.active };
  let f = Freshness.classify(input);
  if (f.state !== Freshness.STATES.FRESH) f = Freshness.classify(Object.assign({}, input, { refreshedAt: refreshedAt(t, ctx.root || ROOT) }));
  return f;
}

/** Inhalt, der im Shard eines zurueckgehaltenen Titels bleibt: Tatsachen (Kurs, Chart, Datenqualitaet), keine laufende These. */
/* bewusst NICHT enthalten: overlays (Zonen, Pfade, Wellen), history (fruehere Szenarien), explain – das waeren Szenario- und Elliott-Thesen */
const KEEP = ["schemaVersion", "symbol", "timeframe", "asOf", "price", "dataQuality", "chart", "versions", "diagnostics", "freshness"];

/** Zurueckhalten: ersetzt die laufende These durch einen ausdruecklichen Zustand. Gibt das neue Payload zurueck (das alte bleibt unveraendert). */
export function withholdPayload(p, f) {
  const L = Freshness.labels(f), out = {};
  for (const k of KEEP) if (p[k] !== undefined) out[k] = p[k];
  out.freshness = shardBlock(f);
  out.withheld = true;
  out.outlook = { label: "WITHHELD", structure: null, confidence: null };
  out.scenarios = [];
  out.alerts = null;
  out.regime = null; out.confidence = null; out.confluence = null; out.signature = null; out.evidence = null; out.timeframes = null; out.clarity = null; out.evidenceBadge = null; out.explain = null;
  out.pro = { withheld: true }; out.overlays = { withheld: true }; out.history = { withheld: true };
  const stub = (tf) => ({ schemaVersion: "elliott-projection-withheld-1", timeframe: tf || p.timeframe, asOf: p.asOf, close: p.price && p.price.close, status: "WITHHELD", reason: f.state === Freshness.STATES.NON_TRADING ? "NON_TRADING" : "STALE_DATA",
    consumerVisible: false, primary: null, alternative: null, highUpside: null, motiveAlternative: null, exploreHighlights: [], exploreCandidates: [], exploreCandidatesTotal: 0, exploreWithheld: true, relations: {},
    freshness: shardBlock(f), message: L.title ? L.title + " – " + L.text : null });
  out.projection = stub(p.timeframe);
  if (p.projectionWeekly) out.projectionWeekly = stub("1W");
  out.motiveCandidate = null;
  out.exploreCandidates = { version: p.exploreCandidates && p.exploreCandidates.version || null, reason: "WITHHELD_" + f.state, pool: 0, eligible: 0, highlights: 0, candidates: 0 };
  return out;
}

/** Block im Shard (vollstaendig, mit Kundentexten, damit alle Verbraucher dieselben Worte nutzen). */
export function shardBlock(f) {
  const L = Freshness.labels(f);
  return { version: f.version, state: f.state, lastBar: f.lastBar, reference: f.reference, ageTradingDays: f.ageTradingDays, calendar: f.calendar, withheld: f.withheld,
           reason: f.reason ? { code: f.reason.code, known: f.reason.known, text: f.reason.text } : null, badge: L.badge, line: L.line, title: L.title, text: L.text };
}

/** Indexzeile eines zurueckgehaltenen Titels: nur Tatsachen und Zustand, keine These. */
export function withheldIndexRow(p, f) {
  return { t: p.symbol, tf: p.timeframe, asOf: p.asOf, close: p.price.close, withheld: 1, fr: Freshness.compact(f), outlook: null, structure: null, confidence: null, direction: null, entry: null, invalidation: null, t1: null,
           elliott: null, alerts: null, proj: null, patterns: [], indexes: [] };
}

/** Zaehler fuer meta.json: Zustaende, Ursachen, betroffene Thesen. */
export function newStats(reference) {
  return { version: Freshness.VERSION, policy: Freshness.POLICY, reference, titles: 0, states: {}, reasons: {}, reasonsKnown: 0, delayedWithNotice: 0,
           affected: { titles: 0, primary: 0, alternative: 0, motiveAlternative: 0, exploreHighlights: 0, exploreCandidates: 0, consumerVisibleProjections: 0 }, ageBuckets: {}, withheldTitles: [] };
}
const BUCKETS = [["0-3", 3], ["4-5", 5], ["6-10", 10], ["11-20", 20], ["21-40", 40], [">40", 1e9]];
export function addStats(s, p, f) {
  s.titles++; s.states[f.state] = (s.states[f.state] || 0) + 1;
  if (f.ageTradingDays != null) { const b = BUCKETS.find(([, hi]) => f.ageTradingDays <= hi)[0]; s.ageBuckets[b] = (s.ageBuckets[b] || 0) + 1; }
  if (f.reason) { s.reasons[f.reason.code] = (s.reasons[f.reason.code] || 0) + 1; if (f.reason.known) s.reasonsKnown++; }
  if (f.state === Freshness.STATES.DELAYED) s.delayedWithNotice++;
  if (f.withheld) {
    const pr = p.projectionWeekly || p.projection || {}, a = s.affected;
    a.titles++; s.withheldTitles.push(p.symbol);
    if (pr.primary) a.primary++; if (pr.alternative) a.alternative++; if (pr.motiveAlternative) a.motiveAlternative++;
    a.exploreHighlights += (pr.exploreHighlights || []).length; a.exploreCandidates += (pr.exploreCandidates || []).length;
    if ((p.projection || {}).consumerVisible || (p.projectionWeekly || {}).consumerVisible) a.consumerVisibleProjections++;
  }
}

/** Systemischer Ausfall: ist ein grosser Teil des Universums zurueckgehalten, liegt das meist an der Datenlage (Pipeline, Anbieter, Eingabe), nicht an einzelnen Titeln. Der Build bricht dann ab statt alle Thesen still zurueckzuhalten. */
export const SYSTEMIC_MAX_WITHHELD_SHARE = 0.2;
export function systemicCheck(stats, maxShare = SYSTEMIC_MAX_WITHHELD_SHARE) {
  const share = stats.titles ? stats.affected.titles / stats.titles : 0;
  return { share: Math.round(share * 1e4) / 1e4, maxShare, systemic: share > maxShare };
}
/** Bezugstag muss ein gueltiges Datum sein (ein Tippfehler wuerde sonst alle Titel als frisch erscheinen lassen). */
export function validReference(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T00:00:00Z")); }
