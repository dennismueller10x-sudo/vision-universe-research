#!/usr/bin/env node
/* =========================================================================
   QUANT_DECISION_INTELLIGENCE - gemessen, nicht behauptet.

   Liest die veroeffentlichten Artefakte ueber dieselben Dienste wie die
   Oberflaeche und zaehlt, was ein Nutzer heute je Frage bekommt:

     welche Aktien werden interessant      -> Radar-Ereignisse
     warum                                 -> Erklaerung + Beleg je Ereignis
     welches Setup                         -> Lebenszyklus je Titel
     wo Trigger / Invalidation / Ziele     -> Trade-Setup (technische Auswertung)
     wie veraendert sich der Zustand       -> Setup-Wechsel, seit wann
     was geschah frueher                   -> Rueckblick (historical-cases)
     wie belastbar                         -> Evidenzstufe + Backtest-Gates
     welche Aktie beobachten               -> beobachtbare Titel

   Schreibt quant/data/product/decision-intelligence-v1.json und gibt den
   Stand auf der Konsole aus. Optional: --sample (Beispieltitel pruefen).
   ========================================================================= */
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Service = require(join(ROOT, "quant/api/product-services.js"));
const api = Service.create({
  loadJSON: async (p) => JSON.parse(await readFile(join(ROOT, p), "utf8")),
  loadCompressedJSON: async (p) => JSON.parse(gunzipSync(await readFile(join(ROOT, p))).toString("utf8")),
  displayPolicy: require(join(ROOT, "quant/engines/display-policy.js")), queryEngine: require(join(ROOT, "quant/engines/query.js"))
});

/* Die Stichprobe des Owner-Auftrags: Grosswerte, eine kleine Firma, eine
   Bank, ein REIT, eine junge und eine datenarme Aktie, dazu ein ETF. */
const SAMPLE = [
  ["NVDA", "Großwert"], ["AAPL", "Großwert"], ["MSFT", "Großwert"], ["JPM", "Bank"], ["GOOG", "Großwert"], ["AMD", "Großwert"], ["META", "Großwert"],
  ["DXPE", "Small Cap"], ["ABCB", "Regionalbank"], ["O", "REIT"], ["CRWV", "junge Aktie"], ["AACI", "datenarme Aktie"], ["SPY", "ETF"]
];

const radar = await api.getQuantRadar();
const evidence = await api.getEvidenceStatus();
if (radar.state !== "AVAILABLE" || evidence.state !== "AVAILABLE") throw Error("RADAR_OR_EVIDENCE_UNAVAILABLE");

const rows = [];
for (const [ticker, kind] of SAMPLE) {
  const [lc, ws, cases, fac] = await Promise.all([api.getSetupLifecycle(ticker), api.getTechnicalWorkspace(ticker), api.getHistoricalCases(ticker), api.getFactorEvidence(ticker)]);
  const card = radar.cards.find((c) => c.ticker === ticker) || null;
  const ts = ws && ws.state === "AVAILABLE" ? ws.tradeSetup : null;
  const sc = ws && ws.state === "AVAILABLE" ? (ws.scenarios || []).find((s) => ts && s.id === ts.scenarioId) || (ws.scenarios || [])[0] : null;
  const best = cases && cases.state === "AVAILABLE" ? ["m6", "m12", "m3", "m1"].find((k) => cases.horizons[k] && cases.horizons[k].sufficient) || null : null;
  rows.push({
    ticker, kind,
    radarEvents: card ? card.events.map((e) => e.eventType) : [],
    setup: lc.state === "AVAILABLE" ? { state: lc.current, since: lc.since, sinceIsLowerBound: lc.sinceIsLowerBound, previous: lc.previous } : { state: null, reason: lc.reason },
    levels: sc ? { entry: sc.entry ? [sc.entry.zoneLow, sc.entry.zoneHigh] : null, stop: sc.stop ? sc.stop.price : null, invalidation: sc.invalidation ? sc.invalidation.price : null,
      targets: (sc.targets || []).slice(0, 2).map((t) => [t.zoneLow, t.zoneHigh]), trigger: sc.confirmation || null, rr: ts ? ts.riskReward : null, direction: sc.direction }
      : { reason: ws ? ws.reason || ws.state : "UNAVAILABLE" },
    replay: cases && cases.state === "AVAILABLE" ? { episodes: cases.episodes, horizon: best, evidence: best ? cases.horizons[best].evidence : "WITHHELD",
      positiveShare: best ? cases.horizons[best].positiveShare : null, medianReturn: best ? cases.horizons[best].medianReturn : null } : { reason: cases ? cases.reason : "UNAVAILABLE" },
    factors: fac && fac.state === "AVAILABLE" ? (fac.factors || []).filter((f) => f.state === "AVAILABLE").length : 0
  });
}

const m = radar.measures;
const out = {
  schemaVersion: "decision-intelligence-1.0.0", generatedAt: new Date().toISOString(), asOf: radar.asOf,
  measures: {
    RADAR_EVENTS_TOTAL: m.RADAR_EVENTS_TOTAL, RADAR_EVENTS_BY_TYPE: m.RADAR_EVENTS_BY_TYPE,
    SETUPS_TRACKED: m.SETUPS_TRACKED, SETUP_TRANSITIONS: m.SETUP_TRANSITIONS, SETUP_TRANSITIONS_LATEST: m.SETUP_TRANSITIONS_LATEST,
    BACKTEST_ELIGIBLE_RULES: evidence.measures.BACKTEST_ELIGIBLE_RULES, BACKTEST_WITHHELD_RULES: evidence.measures.BACKTEST_WITHHELD_RULES,
    HISTORICAL_REPLAY_COVERAGE: evidence.measures.HISTORICAL_REPLAY_COVERAGE,
    WATCHLIST_TRACKABLE_TITLES: m.WATCHLIST_TRACKABLE_TITLES, ALERT_READY_EVENTS: m.ALERT_READY_EVENTS
  },
  /* Die Kriterien von QUANT_DECISION_INTELLIGENCE, je eines gemessen. */
  criteria: [
    ["welche Aktien heute interessant werden", radar.cards.length > 0, radar.cards.length + " Karten aus " + m.RADAR_EVENTS_TOTAL + " Ereignissen"],
    ["warum", radar.events.every((e) => e.explanation && e.evidence.length), "jedes Ereignis mit Erklärung und Beleg"],
    ["welches Setup vorliegt", m.WATCHLIST_TRACKABLE_TITLES > 5000, m.WATCHLIST_TRACKABLE_TITLES + " Titel mit Setup-Zustand"],
    ["wo Trigger / Invalidation / Ziele liegen", rows.some((r) => r.levels && r.levels.entry), rows.filter((r) => r.levels && r.levels.entry).length + " von " + rows.length + " Stichprobentiteln mit Einstieg, Stop und Zielen"],
    ["wie sich der Zustand verändert", m.SETUP_TRANSITIONS > 0, m.SETUP_TRANSITIONS + " gemessene Setup-Wechsel, " + m.SETUP_TRANSITIONS_LATEST + " zum letzten Stand"],
    ["was historisch bei derselben Lage geschah", evidence.measures.HISTORICAL_REPLAY_COVERAGE.sufficient.m6 > 0, evidence.measures.HISTORICAL_REPLAY_COVERAGE.sufficient.m6 + " Titel mit ≥ 10 abgeschlossenen 6-Monats-Fällen"],
    ["wie belastbar diese Evidenz ist", evidence.kinds.length >= 4 && evidence.kinds.every((k) => k.state === "PUBLISHED" || k.reason), "Evidenzstufe je Fall, Backtest-Gates gemessen (" + evidence.kinds.filter((k) => k.state === "WITHHELD").length + " Arten zurückgehalten)"],
    ["welche Aktie er beobachten möchte", m.WATCHLIST_TRACKABLE_TITLES > 0, "Beobachten auf jeder Aktienseite, Radar-Filter „Beobachtet“"]
  ].map(([q, pass, measured]) => ({ question: q, pass, measured })),
  sample: rows
};
out.verdict = out.criteria.every((c) => c.pass) ? "PASS" : "FAIL";
await writeFile(join(ROOT, "quant/data/product/decision-intelligence-v1.json"), JSON.stringify(out, null, 1) + "\n");
console.log("QUANT_DECISION_INTELLIGENCE = " + out.verdict);
for (const c of out.criteria) console.log((c.pass ? "PASS " : "FAIL ") + c.question + " – " + c.measured);
console.log(JSON.stringify(out.measures, null, 1));
for (const r of rows) console.log(r.ticker.padEnd(5), r.kind.padEnd(16), "| events:", r.radarEvents.join(",") || "–", "| setup:", r.setup.state || r.setup.reason,
  "| levels:", r.levels.entry ? r.levels.entry.join("–") + " / inv " + r.levels.invalidation + " / " + r.levels.direction : r.levels.reason,
  "| replay:", r.replay.episodes !== undefined ? r.replay.episodes + " Fälle " + r.replay.evidence + (r.replay.positiveShare !== null ? " " + Math.round(r.replay.positiveShare * 100) + "% " + r.replay.horizon : "") : r.replay.reason, "| factors:", r.factors);
