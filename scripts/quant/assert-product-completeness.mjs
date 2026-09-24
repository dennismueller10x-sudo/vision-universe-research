#!/usr/bin/env node
/* =========================================================================
   Measure the product's completeness, and name every gap.

   CRITICAL_PRODUCT_GAPS = 0 is a target. Asserting it in a document is
   worth nothing: the whole point of this section has been that a written
   claim outlives the thing it describes. So it is measured here instead,
   against the artifacts that are actually published, and this exits
   non-zero while a CRITICAL gap stands.

   THREE SEVERITIES, and the difference matters

   CRITICAL  the product promises something it does not deliver: a surface
             reads an artifact that is missing or unparseable, a published
             state has no user label, a closed gate gives a reason nobody
             can render. These are defects.
   BLOCKED   a capability is deliberately shut because an input does not
             exist. Measured, named, and NOT a defect - shipping it would
             be. It carries the missing input so the entry cannot rot into
             a vague "not yet".
   OPEN      something is smaller than it could be. Informational.

   A BLOCKED entry is only honest while its blocker is real, so each one
   re-measures its own input rather than trusting a flag.
   ========================================================================= */
import { gunzipSync } from "node:zlib";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Language = require(join(ROOT, "quant/engines/product-language.js"));

const gaps = [];
const add = (severity, id, detail, missing) => gaps.push({ severity, id, detail, missing: missing || null });

const readJSON = (path) => JSON.parse(readFileSync(join(ROOT, path), "utf8"));
const readGZ = (path) => JSON.parse(gunzipSync(readFileSync(join(ROOT, path))).toString("utf8"));

/* ---------------------------------------------------------------------------
   1. Every artifact a surface reads exists, parses and carries its version.
   --------------------------------------------------------------------------- */
const ARTIFACTS = [
  ["quant/data/product/factor-evidence-v1/summary.json", "json", "Factor Evidence"],
  ["quant/data/product/factor-evidence-v1/screening.json.gz", "gz", "Factor Evidence Screening"],
  ["quant/data/product/setup-observations-v1/summary.json", "json", "Setup Observations"],
  ["quant/data/product/setup-observations-v1/screen-index.json.gz", "gz", "Setup State Index"],
  ["quant/data/product/setup-observations-v1/screen-parity.json", "json", "Setup Parity Report"],
  ["quant/data/product/strategy-index-v1.json.gz", "gz", "Strategy Index"],
  ["quant/data/product/market-regime-v1.json", "json", "Market Regime"],
  ["quant/data/product/capabilities-v1.json", "json", "Product Capabilities"]
];
for (const [path, kind, label] of ARTIFACTS) {
  if (!existsSync(join(ROOT, path))) { add("CRITICAL", "ARTIFACT_MISSING", label + " · " + path); continue; }
  try { (kind === "gz" ? readGZ : readJSON)(path); }
  catch (error) { add("CRITICAL", "ARTIFACT_UNREADABLE", label + " · " + path + " · " + error.message); }
}

/* ---------------------------------------------------------------------------
   2. Every state and every reason a surface can render has a user label.
      A missing term throws at render time, which on a fail-closed surface
      is indistinguishable from missing data.
   --------------------------------------------------------------------------- */
const VOCAB = [
  ["quant/engines/setup-engine.js", ["STATES", "UNAVAILABLE_REASONS", "PATH_CLOSED_REASONS"]],
  ["quant/engines/market-regime.js", ["PIT_STATES", "UNAVAILABLE_REASONS"]],
  ["quant/engines/strategy-match.js", ["EVIDENCE_CLOSED_REASONS", "INDEX_CLOSED_REASONS"]],
  ["quant/engines/factor-evidence.js", ["FACTOR_ORDER"]]
];
for (const [enginePath, lists] of VOCAB) {
  const engine = require(join(ROOT, enginePath));
  for (const list of lists) {
    for (const value of engine[list] || []) {
      if (!Language.has(value)) add("CRITICAL", "NO_USER_LABEL", value + " (" + enginePath + "." + list + ")");
    }
  }
}

/* ---------------------------------------------------------------------------
   3. Deliberately closed capabilities, each re-measuring its own blocker.
      A gate that keeps naming a cleared blockade is worse than no gate,
      and this section hit that twice before it was caught.
   --------------------------------------------------------------------------- */
function membershipSnapshots() {
  const base = join(ROOT, "quant/data/market/index-membership/history");
  if (!existsSync(base)) return 0;
  return Math.max(...readdirSync(base).map((index) => {
    const dir = join(base, index);
    try { return readdirSync(dir).filter((f) => f.endsWith(".json")).length; } catch { return 0; }
  }), 0);
}
/* The published product series and whether a total-return basis is
   OBTAINABLE are two different questions, and conflating them is how this
   entry was wrong for a while: it read "no total-return price series" as a
   missing input when the data had simply never been checked. */
function publishedTotalReturnSeries() {
  const dir = join(ROOT, "quant/data/market/discover-series-long");
  if (!existsSync(dir)) return 0;
  const sample = readdirSync(dir).filter((f) => f.endsWith(".json")).slice(0, 50);
  return sample.filter((f) => {
    try { return JSON.parse(readFileSync(join(dir, f), "utf8")).priceSeriesType === "TOTAL_RETURN"; }
    catch { return false; }
  }).length;
}
function totalReturnVerdict() {
  const path = join(ROOT, "quant/data/providers/total-return-verification.json");
  if (!existsSync(path)) return "NOT_MEASURED";
  try { return readJSON("quant/data/providers/total-return-verification.json").verdict; }
  catch { return "NOT_MEASURED"; }
}
/* Der Return-Semantics-Vertrag wird an mehreren Stellen gebraucht und
   deshalb einmal oben gelesen. */
const semantics = readJSON("quant/methodology/return-semantics-v1.json");
const snapshots = membershipSnapshots();
const publishedTR = publishedTotalReturnSeries();
const trVerdict = totalReturnVerdict();

if (snapshots > 1) {
  add("OPEN", "MEMBERSHIP_BLOCKER_CLEARED",
    snapshots + " membership snapshots now exist per index; the point-in-time universe entry is stale.");
} else {
  add("BLOCKED", "BACKTEST", "Backtest integration stays shut",
    "historical index membership (" + snapshots + " snapshot per index). No measurement creates it " +
    "retroactively; the series only grows forward from here.");
}

/* Measured, and deliberately NOT folded into the backtest blocker: the
   provider's adjusted series is confirmed total-return, so this is a
   published-basis decision rather than a missing input. */
if (trVerdict === "TOTAL_RETURN_CONFIRMED" && publishedTR === 0) {
  /* Seit Option C ist das keine offene Entscheidung mehr, sondern eine
     Trennung: die Kursreihen BLEIBEN splitbereinigt, und die
     Gesamtrendite erscheint als eigene Anlegerevidenz daneben. Offen ist
     nur noch, ob sie dort auch wirklich steht. */
  const investorEvidence = (semantics.modules || []).find((m) => m.id === "investorReturnEvidence");
  if (!investorEvidence) {
    add("OPEN", "TOTAL_RETURN_AVAILABLE_BUT_NOT_PUBLISHED",
      "Die Gesamtrendite ist nachgewiesen verfuegbar, aber es gibt kein Modul, das sie fuehrt.");
  }
} else if (trVerdict === "NOT_MEASURED") {
  add("OPEN", "TOTAL_RETURN_NOT_MEASURED",
    "Whether the provider's adjusted series is total-return has not been measured. " +
    "Run scripts/market/verify-total-return-capability.mjs before recording it as missing.");
}

/* Der Full-Universe-Return-Basis-Audit. Er ist kein Gap im Produkt,
   sondern die Grundlage einer offenen Methodikentscheidung - und genau
   deshalb steht er hier: solange er nicht ueber den kanonischen Bestand
   gelaufen ist, waere jede Aussage ueber die Return-Basis wieder eine aus
   fuenf Titeln. */
function returnBasisStudy() {
  const path = join(ROOT, "quant/data/providers/return-basis-universe-study.json");
  if (!existsSync(path)) return null;
  try { return readJSON("quant/data/providers/return-basis-universe-study.json"); }
  catch { return null; }
}
const basisStudy = returnBasisStudy();
const momentumSpec = readJSON("quant/methodology/quant-v2.json").factors.momentum;
const evidenceSummary = readJSON("quant/data/product/factor-evidence-v1/summary.json");

/* Die Return-Basis ist entschieden. Was hier noch stehen kann, ist nicht
   mehr die Entscheidung, sondern ihre Umsetzung - und die wird gemessen,
   nicht angenommen. */
const entschieden = semantics.gateStatus.QUANT_V2_MOMENTUM_BASIS;
if (entschieden === "PENDING_METHODOLOGY_DECISION") {
  if (!basisStudy) {
    add("OPEN", "RETURN_BASIS_AUDIT_NOT_RUN",
      "Der Full-Universe-Return-Basis-Audit hat noch nicht geschrieben. Erst messen, dann ueber " +
      "die Return-Basis reden.");
  } else if (basisStudy.scope !== "CANONICAL_HISTORY") {
    add("OPEN", "RETURN_BASIS_AUDIT_PARTIAL",
      "Der Audit lief auf '" + basisStudy.scope + "' und sieht damit nicht das Universum. " +
      basisStudy.scopeNote);
  } else {
    add("OPEN", "RETURN_BASIS_DECISION_WITH_OWNER",
      "Gemessen ueber " + basisStudy.gateStatus.DUAL_RETURN_SERIES_CAPABLE_UNIVERSE + " Titel. " +
      "Die Entscheidung liegt beim Owner - ein Gate, keine Luecke im Produkt.");
  }
} else {
  /* Entschieden. Jetzt zaehlt nur noch, ob das Veroeffentlichte der
     Entscheidung schon folgt. Solange die Methodikversion des Artefakts
     hinter der Engine liegt, steht die Umstellung aus - und zwar
     sichtbar, damit niemand die alte Zahl fuer die neue haelt. */
  const engineMethodology = "vu-factor-evidence-2.0.0";
  if (evidenceSummary.methodologyVersion !== engineMethodology) {
    add("OPEN", "MOMENTUM_BASIS_REMATERIALIZATION_PENDING",
      "Die Methodik steht auf " + entschieden + " (" +
      semantics.gateStatus.QUANT_V2_MOMENTUM_DECISION + "), das veroeffentlichte Factor Evidence " +
      "traegt aber noch " + evidenceSummary.methodologyVersion + ". Bis zum naechsten Lauf ueber " +
      "frische Marktfaktoren gilt der alte Bestand - und die Dienste melden ihn als " +
      "METHODOLOGY_VERSION_SUPERSEDED statt ihn als aktuell auszugeben.");
  }

  /* Und die Gegenprobe: sagt die Methodik selbst noch irgendwo etwas
     anderes, als sie rechnet? Gemessen an der Spezifikation von heute,
     nicht an einer Studie von gestern. */
  const widerspruch = (momentumSpec.components || []).filter((component) => {
    const text = String(component.input || "");
    return /total return/i.test(text) && !/split-adjusted/i.test(text);
  });
  if (momentumSpec.returnBasis === "SPLIT_ADJUSTED_PRICE" && widerspruch.length) {
    add("CRITICAL", "MOMENTUM_SPEC_CONTRADICTS_ITSELF",
      "Die Momentummethodik nennt als Basis SPLIT_ADJUSTED_PRICE, beschreibt aber " +
      widerspruch.map((c) => c.id).join(", ") + " weiter als Gesamtrendite.");
  }
  /* Namen, die etwas anderes behaupten als der Inhalt, sind genau die
     stille Umdefinition, die der Owner ausgeschlossen hat. */
  const falscheNamen = (momentumSpec.components || [])
    .filter((c) => /^totalReturn/.test(c.id));
  if (momentumSpec.returnBasis === "SPLIT_ADJUSTED_PRICE" && falscheNamen.length) {
    add("CRITICAL", "MOMENTUM_COMPONENT_NAMES_STALE",
      falscheNamen.map((c) => c.id).join(", ") + " heissen weiter nach der Gesamtrendite, " +
      "rechnen aber auf Kursbasis.");
  }
}

const screening = readGZ("quant/data/product/factor-evidence-v1/screening.json.gz");
const revisionsIndex = (screening.fields || []).indexOf("quantV2.factorEvidence.revisions");
const revisionsCovered = revisionsIndex === -1 ? 0
  : Object.values(screening.rows || {}).filter((row) => Number.isFinite(row[revisionsIndex])).length;
if (revisionsCovered > 0) {
  add("OPEN", "REVISIONS_BLOCKER_CLEARED", "Revisions now covers " + revisionsCovered + " issuers; the fail-closed entry is stale.");
} else {
  add("BLOCKED", "REVISIONS", "Revisions factor and earnings-revision-leader stay shut",
    "no licensed point-in-time analyst consensus source (0 of " + Object.keys(screening.rows || {}).length + " issuers)");
}

const regime = readJSON("quant/data/product/market-regime-v1.json");
if (regime.transitions && regime.transitions.state !== "OPEN") {
  add("BLOCKED", "MARKET_REGIME_TRANSITIONS", "Regime transitions stay shut", regime.transitions.reason);
}
const setup = readJSON("quant/data/product/setup-observations-v1/summary.json");
if (!setup.pathTier.open) {
  add("BLOCKED", "SETUP_PATH_STATES", "The four course-of-events setup states stay shut", setup.pathTier.reason);
}

/* ---------------------------------------------------------------------------
   4. What is published must be internally consistent.
   --------------------------------------------------------------------------- */
const parity = readJSON("quant/data/product/setup-observations-v1/screen-parity.json");
if (!parity.parity) add("CRITICAL", "SETUP_INDEX_DRIFTED", "The setup state index is not the cascade's own answer");

const strategy = readGZ("quant/data/product/strategy-index-v1.json.gz");
for (const entry of strategy.profiles || []) {
  if (entry.availability.state === "AVAILABLE" && entry.count === null) {
    add("CRITICAL", "STRATEGY_COUNT_MISSING", entry.profileId + " is available but publishes no count");
  }
  if (entry.availability.state !== "AVAILABLE" && entry.count !== null) {
    add("CRITICAL", "STRATEGY_ZERO_AS_FINDING", entry.profileId + " publishes a count while an input is uncovered");
  }
}

/* ---------------------------------------------------------------------------
   5. Report.
   --------------------------------------------------------------------------- */
const bySeverity = (severity) => gaps.filter((g) => g.severity === severity);
const critical = bySeverity("CRITICAL");
for (const severity of ["CRITICAL", "BLOCKED", "OPEN"]) {
  const rows = bySeverity(severity);
  if (!rows.length) continue;
  process.stdout.write("\n" + severity + " (" + rows.length + ")\n");
  for (const row of rows) {
    process.stdout.write("  " + row.id + " · " + row.detail + (row.missing ? "\n      fehlt: " + row.missing : "") + "\n");
  }
}
process.stdout.write("\nCRITICAL_PRODUCT_GAPS = " + critical.length + "\n");
if (critical.length) process.exit(1);
