#!/usr/bin/env node
/* =========================================================================
   QUANT_BACKTEST_CERTIFICATION - gemessen, nicht behauptet.

   PASS heisst NICHT "alles freigegeben". PASS heisst: jede Backtest-Art
   steht in genau einem gemessenen Status (CERTIFIED / LIMITED /
   COLLECTING_HISTORY / WITHHELD), keine Zertifizierung ist falsch, die
   Grundlagen (Base Rate, Unabhaengigkeit, Renditebasis, PIT, Survivorship)
   sind gemessen und das Produkt zeigt den Status korrekt.

   Schreibt quant/data/product/backtest-certification-measure-v1.json.
   ========================================================================= */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { hasPriceKeys } from "./lib/privacy-scan.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const P = (...p) => join(ROOT, ...p);
const json = (p) => JSON.parse(readFileSync(P(p), "utf8"));
const gz = (p) => JSON.parse(gunzipSync(readFileSync(P(p))).toString("utf8"));
const C = require(P("quant/engines/backtest-certification.js"));
const SB = require(P("quant/engines/signal-backtest.js"));
const Radar = require(P("quant/engines/quant-radar.js"));

const cert = json("quant/data/product/backtest-certification-v1.json");
const signal = json("quant/data/product/signal-backtest-v1.json");
const outcomes = json("quant/data/product/setup-outcomes-v1.json");
const radar = gz("quant/data/product/radar-v1.json.gz");
const workflow = readFileSync(P(".github/workflows/product-intelligence-materialization.yml"), "utf8");
const ui = readFileSync(P("quant/app/page-backtest.js"), "utf8") + readFileSync(P("quant/app/page-evidence.js"), "utf8");
const kind = (id) => cert.kinds.find((k) => k.id === id);

/* Datenschutz: keine Kursreihe in abgeleiteten Artefakten. */
const replayDir = P("quant/data/product/setup-replay-v1");
const privacyClean = !hasPriceKeys(outcomes) && !hasPriceKeys(signal) && !hasPriceKeys(cert)
  && (!existsSync(replayDir) || readdirSync(replayDir).filter((f) => f.endsWith(".json.gz")).every((f) => !hasPriceKeys(JSON.parse(gunzipSync(readFileSync(join(replayDir, f))).toString("utf8")))));

/* Watchlist: Verfolgung mit Historie in den Titel-Shards. */
const shardDir = P("quant/data/product/radar-ticker-v1");
let tracked = 0, withHistory = 0;
for (const f of readdirSync(shardDir).filter((x) => x.endsWith(".json.gz"))) {
  for (const row of Object.values(gz("quant/data/product/radar-ticker-v1/" + f).rows || {})) { if (row.tracking) tracked++; if (row.tracking && Array.isArray(row.tracking.history)) withHistory++; }
}

let discoverChanged = null;
try { const base = execFileSync("git", ["merge-base", "HEAD", "origin/main"], { cwd: ROOT }).toString().trim();
  discoverChanged = execFileSync("git", ["diff", "--name-only", base, "--", "discover"], { cwd: ROOT }).toString().trim().length > 0; } catch { discoverChanged = null; }

const available = radar.events.filter((e) => e.backtestEvidence.state === "AVAILABLE");
const sig = kind("SIGNAL_BACKTEST"), setup = kind("SETUP_BACKTEST"), strat = kind("STRATEGY_BACKTEST"), fac = kind("FACTOR_RANKING_BACKTEST");
const criteria = [
  ["jede Backtest-Art klassifiziert (6 Arten, ein Status je Art)", cert.kinds.length === 6 && cert.kinds.every((k) => C.STATUSES.includes(k.status))],
  ["kein falsch zertifizierter Backtest (Status folgt den Gates)", C.certificationViolations(cert).length === 0],
  ["Signal-Backtest: Base Rate, Unabhängigkeit, Kosten, Prüfzeiträume, Parameter je Regel", signal.rules.every((r) => r.horizons.m6.baseRate && r.independence && r.independence.effectiveN > 0 && r.horizons.m6.costSensitivity && r.oos && r.walkForward && r.parameterStability.entryDelay)],
  ["Signal-Backtest: Renditebasis benannt, Pipeline mit Gesamtrendite", signal.rules.every((r) => r.returnType === signal.returnType) && /build-signal-backtest\.mjs --work-dir/.test(workflow)],
  ["Marktphasen nur mit zertifizierter Regime-Historie", signal.regime && signal.regime.used === false && signal.rules.every((r) => r.checks.regimeDiversity.reason === "REGIME_HISTORY_NOT_CERTIFIED")],
  ["Setup-Backtest nur aus veröffentlichten Ständen, Hashes geprüft", outcomes.source.reconstructed === false && outcomes.history.contentHashVerified === outcomes.history.dates],
  ["Setup-Backtest wächst automatisch (Pipeline + Check)", /build-setup-outcomes\.mjs/.test(workflow) && /build-backtest-certification\.mjs/.test(workflow) && C.STATUSES.includes(setup.status)],
  ["Setup Ein-/Ausstieg deterministisch, Varianten gemessen", existsSync(P("quant/methodology/setup-backtest-contract-v1.json")) && Object.values(outcomes.study).every((s) => s.variants.NEXT_CLOSE && s.variants.SIGNAL_CLOSE)],
  ["Strategie-Backtest vorbereitet und korrekt gated", existsSync(P("quant/methodology/strategy-backtest-contract-v1.json")) && existsSync(P("quant/engines/profile-backtest.js")) && strat.status !== "CERTIFIED" && strat.gates.some((g) => g.id === "membershipHistory")],
  ["Faktor-Backtest korrekt gated", fac.status !== "CERTIFIED" && fac.gates.some((g) => g.id === "factorHistory")],
  ["Survivorship ehrlich: Gate und Kontrolle getrennt", ["PASS", "FAIL"].includes(cert.survivorship.gate) && ["PASS", "PARTIAL", "FAIL"].includes(cert.survivorship.control) && typeof cert.survivorship.DELISTED_IDENTIFIED === "number"],
  ["Base Rate in jedem Radar-Ereignis mit Evidenz", available.length > 0 && available.every((e) => e.baseRate && typeof e.baseRate.delta === "number")],
  ["Trust-Engine: Studien regelkonform", SB.studyViolations(signal).length === 0],
  ["Alert-Vertrag 3.0.0 ohne Verstoß, nur neue Zustände", radar.measures.ALERT_CONTRACT_VIOLATIONS === 0 && radar.alertContract.schema === "quant-alert-event-3.0.0" && radar.events.every((e) => Radar.eventViolations(e).length === 0 && typeof e.isNew === "boolean")],
  ["Watchlist verfolgt Zustände mit Verlauf", tracked > 5000 && withHistory === tracked],
  ["Frontend unterscheidet beobachtet / getestet / zertifiziert", /Historisch beobachtet/.test(ui) && /Historisch getestet/.test(ui) && /Zertifiziert/.test(ui)],
  ["keine privaten Kursdaten in öffentlichen Artefakten", privacyClean],
  ["Discover unverändert", discoverChanged !== true]
].map(([criterion, pass]) => ({ criterion, pass: !!pass }));

const measures = {
  CERTIFIED: cert.kinds.filter((k) => k.status === "CERTIFIED").map((k) => k.id),
  LIMITED: cert.kinds.filter((k) => k.status === "LIMITED").map((k) => k.id),
  COLLECTING_HISTORY: cert.kinds.filter((k) => k.status === "COLLECTING_HISTORY").map((k) => k.id),
  WITHHELD: cert.kinds.filter((k) => k.status === "WITHHELD").map((k) => k.id),
  SIGNAL_RULES: Object.fromEntries((sig.rules || []).map((r) => [r.id, r.status + (r.baseRate ? " Δ " + r.baseRate.delta : "")])),
  SETUP: { status: setup.status, historyDates: outcomes.history.dates, completedM6: setup.progress.completedM6, ownerApproval: setup.ownerApproval.required },
  STRATEGY: { status: strat.status, membershipMonths: strat.membership.SP500.months, factorMonths: strat.factor.months },
  SURVIVORSHIP_GATE: cert.survivorship.gate, SURVIVORSHIP_CONTROL: cert.survivorship.control,
  DELISTED_IDENTIFIED: cert.survivorship.DELISTED_IDENTIFIED, DELISTED_WITH_HISTORY: cert.survivorship.DELISTED_WITH_HISTORY, DELISTED_BACKTEST_ELIGIBLE: cert.survivorship.DELISTED_BACKTEST_ELIGIBLE,
  SIGNAL_RETURN_TYPE: signal.returnType,
  UNIQUE_TITLES: Object.fromEntries(signal.rules.map((r) => [r.id, r.independence.uniqueTitles])),
  UNIQUE_PERIODS: Object.fromEntries(signal.rules.map((r) => [r.id, r.independence.uniquePeriods])),
  INDEPENDENT_CLUSTERS: Object.fromEntries(signal.rules.map((r) => [r.id, r.independence.independentClusters])),
  EFFECTIVE_N: Object.fromEntries(signal.rules.map((r) => [r.id, r.independence.effectiveN])),
  RADAR_EVENTS_WITH_BASE_RATE: radar.measures.EVENTS_WITH_BASE_RATE, ALERTS_NEW: radar.measures.ALERTS_NEW,
  WATCHLIST_TRACKED: tracked, DISCOVER_CHANGED: discoverChanged
};
const out = { schemaVersion: "backtest-certification-measure-1.0.0", generatedAt: new Date().toISOString(), measures, criteria, verdict: criteria.every((c) => c.pass) ? "PASS" : "FAIL" };
writeFileSync(P("quant/data/product/backtest-certification-measure-v1.json"), JSON.stringify(out, null, 1) + "\n");
console.log("QUANT_BACKTEST_CERTIFICATION = " + out.verdict);
for (const c of criteria) console.log((c.pass ? "PASS " : "FAIL ") + c.criterion);
console.log(JSON.stringify(measures, null, 1));
