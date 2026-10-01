#!/usr/bin/env node
/* =========================================================================
   Materialize Quant Radar (quant-radar-1.0.0).

   "Was ist heute neu?" - ausschliesslich aus Artefakten, die bereits
   veroeffentlicht sind. Gelesen werden:

     quant/data/product/setup-observation-history/<mapping>/<date>.json.gz
     quant/data/product/setup-observations-v1/<SHARD>.json.gz
     quant/data/product/technical-signals-v1/signals-5.json.gz
     quant/data/product/technical-signals-v1/<SHARD>.json.gz   (nur Top-Karten)
     quant/data/product/strategy-index-v1.json.gz
     quant/data/product/factor-evidence-history/<version>/<date>.json.gz
     quant/data/market/factors/factors-FULL_UNIVERSE.json      (newHigh52w)
     quant/data/product/pattern-match-v1/<SHARD>.json.gz
     quant/data/market/discover-series-long/<securityId>.json   (Vergleichsfaelle)

   Geschrieben werden:

     quant/data/product/radar-v1.json.gz            Ereignisse + Karten
     quant/data/product/setup-lifecycle-v1.json.gz  Lebenszyklus je Titel
     quant/data/product/radar-history/pattern-holds/<asOf>.json.gz
        Beginn der Musterhistorie: "neues Muster" braucht zwei Staende.

   Kein Ereignis entsteht aus eigener Rechnung. Ein Ereignis ist immer der
   Unterschied zwischen zwei veroeffentlichten Staenden derselben Engine -
   oder, beim 52-Wochen-Hoch, der veroeffentlichte Tageswert selbst.
   ========================================================================= */
import { gzipSync, gunzipSync } from "node:zlib";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Radar = require(join(ROOT, "quant/engines/quant-radar.js"));
const SetupEngine = require(join(ROOT, "quant/engines/setup-engine.js"));
const HistoricalCases = require(join(ROOT, "quant/engines/historical-cases.js"));
const VM = require(join(ROOT, "quant/app/view-model.js"));

const P = (...p) => join(ROOT, ...p);
const gz = (file) => JSON.parse(gunzipSync(readFileSync(file)));
const json = (file) => JSON.parse(readFileSync(file, "utf8"));
const writeGz = (file, value) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, gzipSync(Buffer.from(JSON.stringify(value)))); };
const shardKey = (t) => (t + "_").slice(0, 2).replace(/[^A-Z0-9._-]/g, "_");
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));
const de = (d) => (isDate(d) ? d.slice(8, 10) + "." + d.slice(5, 7) + "." + d.slice(0, 4) : String(d));

/* Wie viele Karten mit Einstieg, Trigger und Zielen aus der technischen
   Auswertung angereichert werden. Die uebrigen Karten tragen Invalidierung
   und erstes Ziel aus der Setup-Beobachtung. */
const ENRICH_TOP = 150;
/* Eine Faktor-Bewegung zaehlt erst ab 3 Punkten und nur mit Stufenwechsel -
   dieselbe 3-Punkte-Schwelle wie change-engine scoreMomentum. */
const FACTOR_MIN_MOVE = 3;

/* ---------------------------------------------------------------- Setup */
const SETUP_HISTORY = P("quant/data/product/setup-observation-history/setup-mapping-1.0.0");
const setupDates = readdirSync(SETUP_HISTORY).filter((f) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f)).map((f) => f.slice(0, 10)).sort();
if (setupDates.length < 2) throw Error("SETUP_HISTORY_TOO_SHORT: " + setupDates.length);
const setupSnaps = setupDates.map((d) => ({ date: d, rows: gz(join(SETUP_HISTORY, d + ".json.gz")).rows || {} }));
const latest = setupSnaps[setupSnaps.length - 1], before = setupSnaps[setupSnaps.length - 2];

/* Lebenszyklus je Titel: aktueller Zustand, seit wann (erster Stichtag der
   laufenden Folge), vorheriger Zustand und dessen letzter Stichtag. Reicht
   die Folge bis zum ersten veroeffentlichten Stichtag zurueck, ist "seit"
   eine Untergrenze ("mindestens seit"). */
const lifecycle = {};
let transitionsAll = 0;
for (let i = 1; i < setupSnaps.length; i++) {
  for (const t of Object.keys(setupSnaps[i].rows)) {
    const a = setupSnaps[i - 1].rows[t], b = setupSnaps[i].rows[t];
    if (a && b && a[0] !== b[0]) transitionsAll += 1;
  }
}
for (const t of Object.keys(latest.rows)) {
  const state = latest.rows[t][0];
  let k = setupSnaps.length - 1;
  while (k > 0 && setupSnaps[k - 1].rows[t] && setupSnaps[k - 1].rows[t][0] === state) k -= 1;
  const prev = k > 0 && setupSnaps[k - 1].rows[t] ? setupSnaps[k - 1] : null;
  /* Untergrenze, wenn die Folge am ersten Stichtag beginnt ODER der Titel
     davor nicht beobachtet wurde (neu im Universum). */
  lifecycle[t] = [state, setupSnaps[k].date, prev ? 0 : 1, prev ? prev.rows[t][0] : null, prev ? prev.date : null];
}

/* Die aktuellen Setup-Shards: Zeile, Niveaus, Kaskade (fuer "was fehlt"). */
const SETUP_SHARDS = P("quant/data/product/setup-observations-v1");
const setupNow = {};
let setupCascade = null, setupAsOf = null;
for (const f of readdirSync(SETUP_SHARDS).filter((f) => /^[A-Z0-9._-]{2}\.json\.gz$/.test(f))) {
  const shard = gz(join(SETUP_SHARDS, f));
  setupCascade = setupCascade || shard.cascade; setupAsOf = setupAsOf || shard.asOf;
  for (const [t, v] of Object.entries(shard.instruments || {})) setupNow[t] = v;
}
const mapping = { cascade: { rules: setupCascade || [] } };

function nextStep(t) {
  const s = setupNow[t];
  if (!s || !s.row) return null;
  const cascade = SetupEngine.explainCascade(mapping, s.row, { close: s.close, previous: s.previous });
  const own = cascade.find((r) => s.observation && r.ruleId === s.observation.r) || null;
  const higher = cascade.filter((r) => r.tier === "POINT_IN_TIME" && !r.unanswerable && (!own || r.order < own.order) && r.matched !== true && (r.open || []).length > 0)
    .sort((a, b) => a.open.length - b.open.length || b.order - a.order)[0];
  if (!higher) return null;
  const open = higher.conditions.filter((c) => c.met === false).map((c) => ({ field: c.field, demand: c.demand, value: c.value }));
  return { state: higher.state, ruleId: higher.ruleId, open, total: higher.conditions.filter((c) => c.measurable !== false).length };
}

/* ---------------------------------------------------------------- Ereignisse */
const events = [];
function push(e) {
  const t = Radar.TYPE[e.eventType];
  events.push(Object.assign({ id: e.eventType.toLowerCase() + "_" + e.ticker + "_" + e.occurredAt + (e.key ? "_" + e.key : ""),
    schemaVersion: Radar.ALERT_EVENT_SCHEMA, source: t.source, direction: e.direction || t.tone, delivery: "NOT_CONFIGURED" }, e, { key: undefined }));
}
const securityOf = (t) => (setupNow[t] && setupNow[t].securityId) || null;
const label = (state) => (Radar.LIFECYCLE.find((l) => l.id === state) || {}).label || state;

/* SETUP: Wechsel zwischen den letzten beiden Stichtagen. */
const UP = { NO_SETUP: 0, WATCH: 1, SETUP_FORMING: 2, CONFIRMED: 3 };
for (const t of Object.keys(latest.rows)) {
  const prev = before.rows[t], cur = latest.rows[t];
  if (!prev || prev[0] === cur[0]) continue;
  const a = prev[0], b = cur[0];
  let type = null;
  if (b === "CONFIRMED") type = "SETUP_CONFIRMED";
  else if (b === "SETUP_FORMING" && UP[a] < UP.SETUP_FORMING) type = "SETUP_NEW";
  else if (UP[a] >= UP.SETUP_FORMING && UP[b] < UP[a]) type = "SETUP_WEAKENED";
  if (!type) continue;
  const next = nextStep(t);
  push({ eventType: type, ticker: t, securityId: securityOf(t), occurredAt: latest.date, previousAsOf: before.date,
    previousState: { setupState: a, label: label(a) }, currentState: { setupState: b, label: label(b) },
    explanation: type === "SETUP_WEAKENED"
      ? "Von „" + label(a) + "“ auf „" + label(b) + "“: eine Bedingung der bisherigen Stufe gilt am " + latest.date + " nicht mehr."
      : "Von „" + label(a) + "“ auf „" + label(b) + "“ am " + de(latest.date) + ".",
    evidence: [{ source: "setup-observation-history", metricId: "setupState", previous: a, current: b, previousAsOf: before.date, asOf: latest.date }]
      .concat(cur[1] !== null && cur[1] !== undefined ? [{ source: "setup-observations-v1", metricId: "invalidationPrice", current: cur[1], unit: "USD" }] : []),
    nextCondition: next ? { state: next.state, label: label(next.state), open: next.open, total: next.total } : null });
}

/* SIGNAL: Momentum und langfristige Linie am juengsten Stichtag. */
const signals = gz(P("quant/data/product/technical-signals-v1/signals-5.json.gz"));
const signalAsOf = (signals.events || []).reduce((m, e) => (e.asOf > m ? e.asOf : m), "");
const SIGNAL_TYPE = { "positive-momentum": { ENTERED: "MOMENTUM_IMPROVED", EXITED: "MOMENTUM_DETERIORATED" }, "above-long-trend": { ENTERED: "TREND_UP", EXITED: "TREND_DOWN" } };
for (const e of signals.events || []) {
  if (e.asOf !== signalAsOf || !SIGNAL_TYPE[e.definitionId] || !SIGNAL_TYPE[e.definitionId][e.transition]) continue;
  const type = SIGNAL_TYPE[e.definitionId][e.transition];
  push({ eventType: type, ticker: e.ticker, securityId: securityOf(e.ticker), occurredAt: e.asOf, previousAsOf: e.previousAsOf || null,
    previousState: { rule: e.rule, holds: e.transition !== "ENTERED" }, currentState: { rule: e.rule, holds: e.transition === "ENTERED" },
    explanation: (e.transition === "ENTERED" ? "Erfüllt jetzt: " : "Erfüllt nicht mehr: ") + e.rule + ".",
    evidence: (e.evidence || []).map((x) => ({ source: "technical-signals-v1", metricId: x.metricId, previous: x.previous, current: x.current, unit: x.unit || null, previousAsOf: e.previousAsOf || null, asOf: e.asOf })),
    nextCondition: null });
}

/* STRATEGY: wer seit dem vorigen Stand einen Anlagestil neu erfuellt oder verlassen hat. */
const strategy = gz(P("quant/data/product/strategy-index-v1.json.gz"));
const profiles = json(P("quant/methodology/strategy-profiles-v1.json")).profiles || [];
const profileLabel = Object.fromEntries(profiles.map((p) => [p.profileId, p.label]));
const he = strategy.historicalEvidence || {};
if (he.state === "AVAILABLE" && isDate(he.to)) {
  for (const tr of he.transitions || []) {
    for (const [list, type] of [[tr.entered || [], "STRATEGY_MATCH_NEW"], [tr.exited || [], "STRATEGY_MATCH_LOST"]]) {
      for (const t of list) {
        push({ eventType: type, key: tr.profileId, ticker: t, securityId: securityOf(t), occurredAt: he.to, previousAsOf: he.from,
          previousState: { profileId: tr.profileId, matches: type !== "STRATEGY_MATCH_NEW" }, currentState: { profileId: tr.profileId, matches: type === "STRATEGY_MATCH_NEW" },
          explanation: (type === "STRATEGY_MATCH_NEW" ? "Erfüllt jetzt alle Bedingungen von „" : "Erfüllt nicht mehr alle Bedingungen von „") + (profileLabel[tr.profileId] || tr.profileId) + "“.",
          evidence: [{ source: "strategy-index-v1", metricId: "assignment", profileId: tr.profileId, predicateHash: tr.predicateHash || null, previousAsOf: he.from, asOf: he.to }],
          nextCondition: null });
      }
    }
  }
}

/* FACTOR: Stufenwechsel zwischen den letzten beiden Faktor-Staenden. */
const FACTOR_HISTORY = P("quant/data/product/factor-evidence-history");
const factorVersion = readdirSync(FACTOR_HISTORY).filter((d) => /^vu-factor-evidence-/.test(d)).sort().pop();
const factorDates = readdirSync(join(FACTOR_HISTORY, factorVersion)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f)).map((f) => f.slice(0, 10)).sort();
const fNow = gz(join(FACTOR_HISTORY, factorVersion, factorDates[factorDates.length - 1] + ".json.gz"));
const fPrev = factorDates.length > 1 ? gz(join(FACTOR_HISTORY, factorVersion, factorDates[factorDates.length - 2] + ".json.gz")) : null;
const fIds = (fNow.fields || []).map((f) => f.split(".").pop());
const factorCoverage = {};
for (const [t, row] of Object.entries(fNow.rows || {})) factorCoverage[t] = row.filter((v) => typeof v === "number").length;
if (fPrev) {
  for (const [t, row] of Object.entries(fNow.rows || {})) {
    const old = fPrev.rows[t];
    if (!old) continue;
    fIds.forEach((id, i) => {
      const a = old[i], b = row[i];
      if (typeof a !== "number" || typeof b !== "number" || Math.abs(b - a) < FACTOR_MIN_MOVE) return;
      const ba = VM.band(a), bb = VM.band(b);
      if (ba === bb) return;
      const up = b > a, name = VM.FACTORS[id] ? VM.FACTORS[id].name : id;
      /* Beim Risiko-Faktor heisst ein schwaecherer Wert "mehr Schwankung" -
         das ist das Ereignis "Risiko steigt", nicht ein zweites daneben. */
      const type = id === "risk" && !up ? "RISK_RISING" : "FACTOR_CHANGED";
      push({ eventType: type, key: id, direction: up ? "up" : "down", ticker: t, securityId: securityOf(t), occurredAt: fNow.asOf, previousAsOf: fPrev.asOf,
        previousState: { factorId: id, score: Math.round(a), band: ba }, currentState: { factorId: id, score: Math.round(b), band: bb },
        explanation: name + ": von „" + VM.bandWord(id, ba) + "“ (" + Math.round(a) + ") auf „" + VM.bandWord(id, bb) + "“ (" + Math.round(b) + ").",
        evidence: [{ source: "factor-evidence-history", metricId: "quantV2.factorEvidence." + id, previous: a, current: b, unit: "score", previousAsOf: fPrev.asOf, asOf: fNow.asOf }],
        nextCondition: null });
    });
  }
}

/* MARKET: neues 52-Wochen-Hoch am Stichtag der Marktfaktoren. */
const factorsFile = json(P("quant/data/market/factors/factors-FULL_UNIVERSE.json"));
let marketAsOf = null;
for (const s of factorsFile.securities || []) {
  if (!s || !s.values || s.values.newHigh52w !== true || !isDate(s.asOf)) continue;
  marketAsOf = marketAsOf && marketAsOf > s.asOf ? marketAsOf : s.asOf;
  push({ eventType: "NEW_52W_HIGH", ticker: s.ticker, securityId: securityOf(s.ticker) || s.securityId || null, occurredAt: s.asOf, previousAsOf: null,
    previousState: null, currentState: { newHigh52w: true, distanceTo52wHigh: s.values.distanceTo52wHigh ?? null },
    explanation: "Das Tageshoch am " + de(s.asOf) + " erreicht den höchsten Kurs der letzten 52 Wochen.",
    evidence: [{ source: "market-factors", metricId: "newHigh52w", current: true, asOf: s.asOf }].concat(typeof s.values.distanceTo52wHigh === "number" ? [{ source: "market-factors", metricId: "distanceTo52wHigh", current: s.values.distanceTo52wHigh, unit: "ratio", asOf: s.asOf }] : []),
    nextCondition: null });
}

/* PATTERN: Stand sichern; "neu" erst ab zwei Staenden. */
const PATTERN_DIR = P("quant/data/product/pattern-match-v1");
const patternHolds = {};
let patternAsOf = null, patternVocab = null;
const patternShards = {};
for (const f of readdirSync(PATTERN_DIR).filter((f) => /^[A-Z0-9._-]{2}\.json\.gz$/.test(f))) {
  const shard = gz(join(PATTERN_DIR, f));
  patternShards[shard.shard || f.slice(0, 2)] = shard;
  patternAsOf = patternAsOf || shard.asOf;
  patternVocab = patternVocab || HistoricalCases.vocabulary(shard);
  for (const [t, v] of Object.entries(shard.instruments || {})) patternHolds[t] = (v.holds || []).slice().sort();
}
const PATTERN_HISTORY = P("quant/data/product/radar-history/pattern-holds");
if (isDate(patternAsOf)) {
  const file = join(PATTERN_HISTORY, patternAsOf + ".json.gz");
  if (!existsSync(file)) writeGz(file, { schemaVersion: "pattern-holds-snapshot-1.0.0", asOf: patternAsOf, rows: patternHolds });
}
const patternDates = existsSync(PATTERN_HISTORY) ? readdirSync(PATTERN_HISTORY).filter((f) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f)).map((f) => f.slice(0, 10)).sort() : [];
let patternOpen = false;
if (patternDates.length >= 2) {
  patternOpen = true;
  const a = gz(join(PATTERN_HISTORY, patternDates[patternDates.length - 2] + ".json.gz")), b = gz(join(PATTERN_HISTORY, patternDates[patternDates.length - 1] + ".json.gz"));
  for (const [t, holds] of Object.entries(b.rows || {})) {
    const old = new Set((a.rows || {})[t] || []);
    if (!(a.rows || {})[t]) continue;
    const added = holds.filter((h) => !old.has(h));
    if (!added.length) continue;
    push({ eventType: "PATTERN_MATCH_NEW", ticker: t, securityId: securityOf(t), occurredAt: b.asOf, previousAsOf: a.asOf,
      previousState: { holds: (a.rows[t] || []).length }, currentState: { holds: holds.length, added },
      explanation: "Neu erfüllte, marktweit geprüfte Bedingung" + (added.length === 1 ? "" : "en") + ": " + added.join(", ") + ".",
      evidence: added.map((id) => ({ source: "pattern-match-v1", metricId: "holds", current: id, previousAsOf: a.asOf, asOf: b.asOf })),
      nextCondition: null });
  }
}

/* ------------------------------------------------------------ Karten */
const byTicker = {};
for (const e of events) (byTicker[e.ticker] = byTicker[e.ticker] || []).push(e);

function replayFor(t) {
  const sec = securityOf(t), shard = patternShards[shardKey(t)];
  if (!sec || !shard || !shard.instruments || !shard.instruments[t]) return null;
  const file = P("quant/data/market/discover-series-long", sec + ".json");
  if (!existsSync(file)) return null;
  const series = json(file);
  if (series.priceSeriesType !== "SPLIT_ADJUSTED" || series.ticker !== t) return null;
  const r = HistoricalCases.assess({ bars: series.points.map((p) => ({ date: p[0], close: p[1] })), vocabulary: patternVocab, holds: shard.instruments[t].holds || [] });
  if (r.state !== "AVAILABLE") return { state: r.state, reason: r.reason, episodes: 0, sufficient: false };
  const h = r.horizons.m6 && r.horizons.m6.sufficient ? r.horizons.m6 : null;
  return { state: "AVAILABLE", episodes: r.episodes, sufficient: !!h, horizon: h ? "m6" : null, from: r.from, to: r.to,
    completed: h ? h.completed : null, positiveShare: h ? h.positiveShare : null, medianReturn: h ? h.medianReturn : null,
    medianDrawdown: h ? h.medianDrawdown : null, chanceRisk: h ? h.chanceRisk : null, evidence: h ? h.evidence : "WITHHELD" };
}

let cards = Object.keys(byTicker).map((t) => {
  const s = setupNow[t], lc = lifecycle[t];
  return {
    ticker: t, securityId: securityOf(t),
    events: byTicker[t].map((e) => ({ id: e.id, eventType: e.eventType, direction: e.direction, occurredAt: e.occurredAt, explanation: e.explanation })),
    setup: lc ? { state: lc[0], since: lc[1], sinceIsLowerBound: !!lc[2], previous: lc[3], previousAsOf: lc[4],
      /* Nur eine Marke UNTER dem Kurs ist eine Invalidierung eines
         Aufwaerts-Setups; liegt sie darueber, stammt sie aus einem
         Abwaertsszenario und wird hier nicht gezeigt. */
      invalidation: s && s.levels && typeof s.levels.invalidationPrice === "number" && s.levels.invalidationPrice < s.close ? s.levels.invalidationPrice : null,
      firstTarget: s && s.levels && typeof s.levels.exitPrice === "number" && s.levels.exitPrice > s.close ? s.levels.exitPrice : null, close: s ? s.close : null } : null,
    next: nextStep(t),
    factorCoverage: factorCoverage[t] || 0,
    replay: null, trade: null
  };
});
/* Vergleichsfaelle fuer alle Karten - sie gehen in die Sortierung ein. */
for (const c of cards) c.replay = replayFor(c.ticker);
cards.sort(Radar.compareCards);

/* Die vorderen Karten bekommen Einstieg, Trigger, Stop und Ziele aus dem
   veroeffentlichten Trade-Setup - nur fuer Aufwaerts-Szenarien, denn ein
   Setup der Setup-Engine ist per Definition eines nach oben. */
const TECH = P("quant/data/product/technical-signals-v1");
const techCache = {};
function bundleOf(t) {
  const key = shardKey(t);
  if (!(key in techCache)) {
    const file = join(TECH, key + ".json.gz");
    techCache[key] = existsSync(file) ? gz(file) : null;
  }
  const shard = techCache[key];
  return shard && shard.instruments && shard.instruments[t] ? shard.instruments[t].bundle : null;
}
for (const c of cards.slice(0, ENRICH_TOP)) {
  const b = bundleOf(c.ticker);
  const ts = b && b.tradeSetup, prim = b && b.scenarios && b.scenarios.primary;
  if (!ts || !prim || prim.direction !== "BULLISH" || !ts.entry) { c.trade = { state: "UNAVAILABLE", reason: !ts ? "NO_TRADE_SETUP" : "NOT_A_BULLISH_SCENARIO" }; continue; }
  c.trade = { state: "AVAILABLE", asOf: b.dataCutoff, status: ts.status, entry: [ts.entry.zoneLow, ts.entry.zoneHigh], entryStatus: ts.entry.status || prim.entryStatus || null,
    trigger: prim.whatMustHappen || null, invalidation: ts.analysisInvalidation ? ts.analysisInvalidation.price : null,
    stop: ts.tradeStop ? ts.tradeStop.price : null, targets: (ts.targets || []).slice(0, 2).map((x) => [x.zoneLow, x.zoneHigh]),
    riskReward: ts.riskReward || null };
}
for (const k of Object.keys(techCache)) delete techCache[k];

/* ------------------------------------------------------------ Zusammenfassung */
const byType = {};
for (const t of Radar.EVENT_TYPES) byType[t.id] = 0;
for (const e of events) byType[e.eventType] += 1;
const violations = events.filter((e) => Radar.eventViolations(e).length);
const tickersUp = new Set(events.filter((e) => e.direction === "up").map((e) => e.ticker));
const tickersRisk = new Set(events.filter((e) => e.eventType === "RISK_RISING").map((e) => e.ticker));
const replayComputed = cards.filter((c) => c.replay).length, replaySufficient = cards.filter((c) => c.replay && c.replay.sufficient).length;
const gate = existsSync(P("quant/data/product/setup-observations-v1/activation-gate.json")) ? json(P("quant/data/product/setup-observations-v1/activation-gate.json")) : null;
const reversal = gate && (gate.checks || []).find((c) => c.id === "REVERSAL_BEHAVIOUR");

const CLOSED = {
  SETUP_INVALIDATED: "PATH_DEPENDENT_STATES_NOT_ACTIVATED",
  PATTERN_MATCH_NEW: patternOpen ? null : "PATTERN_HISTORY_STARTED"
};
const asOf = [latest.date, signalAsOf, he.to, fNow.asOf, marketAsOf].filter(isDate).sort().pop();

const radar = {
  schemaVersion: "quant-radar-1.0.0", engineVersion: Radar.VERSION, alertEventSchema: Radar.ALERT_EVENT_SCHEMA,
  generatedAt: new Date().toISOString(), asOf,
  sources: {
    setup: { from: before.date, to: latest.date, snapshots: setupDates, mappingVersion: "setup-mapping-1.0.0" },
    signals: { asOf: signalAsOf, definitions: Object.keys(SIGNAL_TYPE) },
    strategy: { from: he.from || null, to: he.to || null },
    factors: { from: fPrev ? fPrev.asOf : null, to: fNow.asOf, methodologyVersion: factorVersion, minMove: FACTOR_MIN_MOVE },
    market: { asOf: marketAsOf },
    pattern: { asOf: patternAsOf, snapshots: patternDates }
  },
  eventTypes: Radar.EVENT_TYPES.map((t) => ({ id: t.id, label: t.label, plain: t.plain, source: t.source, tone: t.tone,
    state: CLOSED[t.id] ? "CLOSED" : "OPEN", reason: CLOSED[t.id] || null })),
  priorityRule: Radar.PRIORITY_RULE,
  summary: {
    newSetups: byType.SETUP_NEW, confirmedSetups: byType.SETUP_CONFIRMED, weakenedSetups: byType.SETUP_WEAKENED,
    improvingTickers: tickersUp.size, riskRisingTickers: tickersRisk.size, newStrategyMatches: byType.STRATEGY_MATCH_NEW, newHighs: byType.NEW_52W_HIGH
  },
  caveats: {
    /* Gemessen im Aktivierungs-Gate der Setup-Engine: welcher Anteil der
       Zustandswechsel sich beim naechsten Stand wieder umkehrt. */
    setupReversal: reversal && reversal.measured && typeof reversal.measured.share === "number"
      ? { share: reversal.measured.share, reversals: reversal.measured.reversals, candidates: reversal.measured.candidates, gateState: reversal.state } : null,
    setupSnapshotsNotDaily: true,
    notAForecast: "Ein Ereignis beschreibt einen Wechsel zwischen zwei veröffentlichten Ständen. Es ist keine Prognose und keine Empfehlung."
  },
  measures: {
    RADAR_EVENTS_TOTAL: events.length, RADAR_EVENTS_BY_TYPE: byType,
    SETUPS_TRACKED: Object.values(lifecycle).filter((l) => l[0] !== "NO_SETUP").length,
    SETUP_TRANSITIONS: transitionsAll, SETUP_TRANSITIONS_LATEST: Object.keys(latest.rows).filter((t) => before.rows[t] && before.rows[t][0] !== latest.rows[t][0]).length,
    HISTORICAL_REPLAY_COVERAGE: { cards: cards.length, computed: replayComputed, sufficient: replaySufficient },
    WATCHLIST_TRACKABLE_TITLES: Object.keys(lifecycle).length,
    ALERT_READY_EVENTS: events.length - violations.length, ALERT_CONTRACT_VIOLATIONS: violations.length
  },
  events, cards
};
if (violations.length) throw Error("ALERT_CONTRACT_VIOLATED: " + JSON.stringify(Radar.eventViolations(violations[0])) + " " + violations[0].id);
writeGz(P("quant/data/product/radar-v1.json.gz"), radar);

writeGz(P("quant/data/product/setup-lifecycle-v1.json.gz"), {
  schemaVersion: "setup-lifecycle-1.0.0", engineVersion: Radar.VERSION, generatedAt: radar.generatedAt, asOf: latest.date,
  snapshots: setupDates, columns: ["state", "since", "sinceIsLowerBound", "previousState", "previousAsOf"],
  lifecycle: Radar.LIFECYCLE, pathTier: { state: "CLOSED", reason: "PATH_DEPENDENT_STATES_NOT_ACTIVATED" },
  rows: lifecycle
});

console.log(JSON.stringify({ asOf, events: events.length, byType, cards: cards.length, replay: radar.measures.HISTORICAL_REPLAY_COVERAGE,
  summary: radar.summary, lifecycle: Object.keys(lifecycle).length, transitionsAll }, null, 1));
