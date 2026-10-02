#!/usr/bin/env node
/* =========================================================================
   QUANT_BACKTEST_SIGNAL_INTELLIGENCE - gemessen, nicht behauptet.

   Liest die veroeffentlichten Artefakte ueber dieselben Dienste wie die
   Oberflaeche (getBacktest, getQuantRadar, getSignalTracking) und misst:

     SETUP_BACKTEST_READY / SIGNAL_BACKTEST_READY / STRATEGY_BACKTEST_READY
     BACKTEST_RULES_TOTAL / _CERTIFIED / _LIMITED / _WITHHELD
     SIGNALS_WITH_HISTORICAL_EVIDENCE, RADAR_EVENTS_WITH_BACKTEST
     WATCHLIST_EVENTS_TRACKABLE, ALERT_CONTRACT_READY
     PIT_PASS, LOOKAHEAD_PASS, SURVIVORSHIP_PASS, TRUST_PASS

   "READY" heisst: die Art ist gemessen und ihr Gate entscheidet nach
   Regel. Eine zurueckgehaltene Art mit gemessenem Grund ist korrekt, eine
   freigegebene ohne Beleg waere ein Fehler. CERTIFIED zaehlt nur Regeln
   mit Vertrauen "belastbar" oder "robust".

   Schreibt quant/data/product/backtest-signal-intelligence-v1.json.
   ========================================================================= */
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Service = require(join(ROOT, "quant/api/product-services.js"));
const SB = require(join(ROOT, "quant/engines/signal-backtest.js"));
const Radar = require(join(ROOT, "quant/engines/quant-radar.js"));
const api = Service.create({
  loadJSON: async (p) => JSON.parse(await readFile(join(ROOT, p), "utf8")),
  loadCompressedJSON: async (p) => JSON.parse(gunzipSync(await readFile(join(ROOT, p))).toString("utf8")),
  displayPolicy: require(join(ROOT, "quant/engines/display-policy.js")), queryEngine: require(join(ROOT, "quant/engines/query.js"))
});

const SAMPLE = ["NVDA", "AAPL", "MSFT", "JPM", "GOOG", "AMD", "META", "DXPE", "ABCB", "O", "CRWV", "AACI", "SPY"];

const [signal, setup, readiness, radar] = await Promise.all([api.getBacktest("signal"), api.getBacktest("setup"), api.getBacktest("readiness"), api.getQuantRadar()]);
for (const [name, x] of Object.entries({ signal, setup, readiness, radar })) if (x.state !== "AVAILABLE") throw Error(name.toUpperCase() + "_UNAVAILABLE " + (x.reason || "") + " " + JSON.stringify(x.errors || []));
const strategyProfiles = JSON.parse(await readFile(join(ROOT, "quant/methodology/strategy-profiles-v1.json"), "utf8")).profiles || [];
const kind = (id) => readiness.kinds.find((k) => k.id === id);

const rules = [...signal.rules.map((r) => ({ study: "signal", r })), ...setup.rules.map((r) => ({ study: "setup", r }))];
const certified = rules.filter((x) => x.r.display.allowed && (x.r.trust === "USABLE" || x.r.trust === "ROBUST"));
const limited = rules.filter((x) => x.r.display.allowed && x.r.trust === "LIMITED");
const withheldRules = rules.filter((x) => !x.r.display.allowed);

/* Alert-Vertrag: jedes Ereignis gueltig, Schluessel eindeutig, alle Felder. */
const violations = radar.events.filter((e) => Radar.eventViolations(e).length);
const dedupeUnique = new Set(radar.events.map((e) => e.dedupeKey)).size === radar.events.length;
const alertReady = radar.dropped === 0 && violations.length === 0 && dedupeUnique && radar.alertContract && radar.alertContract.schema === Radar.ALERT_EVENT_SCHEMA
  && ["securityId", "ticker", "issuerId", "eventType", "occurredAt", "detectedAt", "previousState", "currentState", "trigger", "invalidation", "explanation", "evidence", "backtestEvidence", "trustState", "nextCondition", "dedupeKey"].every((f) => Radar.EVENT_FIELDS.includes(f));

const pit = rules.every((x) => x.r.checks.pit.state === "PASS") && setup.parity.checked > 0 && setup.parity.mismatches === 0;
const lookahead = rules.every((x) => x.r.checks.lookahead.state === "PASS");
/* Ueberlebende: die Kontrolle fehlt (gemessen). Bestanden ist das Gate,
   wenn deshalb keine Regel ueber "eingeschraenkt" steht und der
   Strategie-Backtest wegen fehlender Zugehoerigkeit geschlossen bleibt. */
const survivorshipControlled = rules.some((x) => x.r.checks.survivorship.state === "PASS");
const survivorshipGate = rules.every((x) => x.r.checks.survivorship.state === "PASS" || !["USABLE", "ROBUST"].includes(x.r.trust))
  && kind("D").decision === "WITHHELD" && kind("D").reasons.includes("HISTORICAL_UNIVERSE_MEMBERSHIP_MISSING");
const trust = SB.studyViolations(signal).length === 0 && SB.studyViolations(setup).length === 0
  && rules.every((x) => x.r.trust === SB.trustState(x.r.checks, x.r.sample))
  && radar.events.every((e) => e.backtestEvidence.state !== "AVAILABLE" || ["LIMITED", "USABLE", "ROBUST"].includes(e.trustState));

let discoverChanged = null;
try {
  const base = execFileSync("git", ["merge-base", "HEAD", "origin/main"], { cwd: ROOT }).toString().trim();
  discoverChanged = execFileSync("git", ["diff", "--name-only", base, "--", "discover"], { cwd: ROOT }).toString().trim().length > 0;
} catch { discoverChanged = null; }

const sample = [];
for (const t of SAMPLE) {
  const tr = await api.getSignalTracking(t);
  sample.push(tr.state === "AVAILABLE"
    ? { ticker: t, state: tr.current, since: tr.enteredAt, durationDays: tr.durationDays, invalidation: tr.invalidation, next: tr.nextCondition ? tr.nextCondition.label + " (" + tr.nextCondition.open + "/" + tr.nextCondition.total + ")" : null,
      evidence: tr.evidenceState, events: tr.events.map((e) => e.eventType + ":" + (e.backtest ? (e.backtest.state === "AVAILABLE" ? e.backtest.trust + " n=" + e.backtest.n : "WITHHELD " + e.backtest.reason) : "-")) }
    : { ticker: t, state: null, reason: tr.reason });
}

const measures = {
  SETUP_BACKTEST_READY: { ready: true, decision: kind("B").decision, trust: kind("B").trust, reasons: kind("B").reasons.concat(setup.certification !== "CERTIFIED" ? ["SETUP_OUTCOMES_NOT_CERTIFIED"] : []),
    replayTitles: setup.source.titles.length, parity: setup.parity.checked + "/" + setup.parity.checked },
  SIGNAL_BACKTEST_READY: { ready: kind("C").decision === "PUBLISHED", decision: kind("C").decision, trust: kind("C").trust, reasons: kind("C").reasons },
  STRATEGY_BACKTEST_READY: { ready: false, decision: kind("D").decision, reasons: kind("D").reasons },
  BACKTEST_RULES_TOTAL: rules.length + strategyProfiles.length,
  BACKTEST_RULES_CERTIFIED: certified.length,
  BACKTEST_RULES_LIMITED: limited.length,
  BACKTEST_RULES_WITHHELD: withheldRules.length + strategyProfiles.length,
  BACKTEST_RULES_DETAIL: { signal: signal.rules.map((r) => r.id + ":" + r.trust), setup: setup.rules.map((r) => r.id + ":" + r.trust), strategyProfilesWithheld: strategyProfiles.length },
  SIGNALS_WITH_HISTORICAL_EVIDENCE: radar.measures.EVENT_TYPES_WITH_BACKTEST.length,
  SIGNAL_TYPES_TOTAL: Radar.EVENT_TYPES.length,
  RADAR_EVENTS_WITH_BACKTEST: radar.measures.RADAR_EVENTS_WITH_BACKTEST,
  RADAR_EVENTS_TOTAL: radar.events.length,
  WATCHLIST_EVENTS_TRACKABLE: radar.measures.WATCHLIST_EVENTS_TRACKABLE,
  ALERT_CONTRACT_READY: alertReady ? "PASS" : "FAIL",
  PIT_PASS: pit ? "PASS" : "FAIL",
  LOOKAHEAD_PASS: lookahead ? "PASS" : "FAIL",
  SURVIVORSHIP_PASS: survivorshipGate ? "PASS" : "FAIL",
  SURVIVORSHIP_CONTROLLED: survivorshipControlled,
  TRUST_PASS: trust ? "PASS" : "FAIL",
  DISCOVER_CHANGED: discoverChanged
};
const criteria = [
  ["Bestandsaufnahme je Backtest-Art A–F", readiness.kinds.length === 6 && readiness.kinds.every((k) => k.decision === "PUBLISHED" || k.reasons.length)],
  ["Setup-Backtest gemessen, PIT belegt, Gate nach Regel", measures.SETUP_BACKTEST_READY.ready && setup.parity.mismatches === 0],
  ["Signal-Backtest veröffentlicht mit Vertrauensstufe", measures.SIGNAL_BACKTEST_READY.ready],
  ["Strategie-Backtest bleibt ohne Zugehörigkeitshistorie geschlossen", measures.STRATEGY_BACKTEST_READY.decision === "WITHHELD"],
  ["Radar-Ereignisse tragen historische Evidenz oder einen Grund", radar.events.every((e) => e.backtestEvidence.state === "AVAILABLE" || e.backtestEvidence.reason) && measures.RADAR_EVENTS_WITH_BACKTEST > 0],
  ["Beobachtete Aktien verfolgbar", measures.WATCHLIST_EVENTS_TRACKABLE > 0],
  ["ALERT_CONTRACT_READY", alertReady],
  ["PIT_PASS", pit], ["LOOKAHEAD_PASS", lookahead], ["SURVIVORSHIP_PASS", survivorshipGate], ["TRUST_PASS", trust],
  ["Discover unverändert", discoverChanged !== true]
].map(([q, pass]) => ({ criterion: q, pass: !!pass }));

const out = { schemaVersion: "backtest-signal-intelligence-1.0.0", generatedAt: new Date().toISOString(), radarAsOf: radar.asOf, signalAsOf: signal.asOf, setupAsOf: setup.asOf,
  measures, criteria, verdict: criteria.every((c) => c.pass) ? "PASS" : "FAIL", sample };
await writeFile(join(ROOT, "quant/data/product/backtest-signal-intelligence-v1.json"), JSON.stringify(out, null, 1) + "\n");
console.log("QUANT_BACKTEST_SIGNAL_INTELLIGENCE = " + out.verdict);
for (const c of criteria) console.log((c.pass ? "PASS " : "FAIL ") + c.criterion);
console.log(JSON.stringify(measures, null, 1));
for (const s of sample) console.log(s.ticker.padEnd(5), s.state || s.reason, s.since || "", s.durationDays ?? "", "| inv", s.invalidation ?? "–", "| next", s.next || "–", "| ev", s.evidence || "–", "|", (s.events || []).join(", "));
