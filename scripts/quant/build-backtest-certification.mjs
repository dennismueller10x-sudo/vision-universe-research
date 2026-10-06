#!/usr/bin/env node
/* =========================================================================
   BACKTEST CERTIFICATION - der maschinenlesbare Check je Backtest-Art.

   Liest die veroeffentlichten Studien und Historien, baut je Art (und je
   Regel) die Gates und laesst quant/engines/backtest-certification.js den
   Status bestimmen:
     CERTIFIED | LIMITED | COLLECTING_HISTORY | WITHHELD
   plus readiness CERTIFICATION_READY | OWNER_APPROVAL_REQUIRED | NOT_READY.

   Laeuft taeglich in der Pipeline. Sobald eine Art nur noch auf Historie
   gewartet hat und alle Gates bestehen, wechselt der Status ohne manuellen
   Schritt - ausser der Methodikvertrag verlangt eine Owner-Freigabe.

   Schreibt quant/data/product/backtest-certification-v1.json.
   ========================================================================= */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const P = (...p) => join(ROOT, ...p);
const json = (p) => JSON.parse(readFileSync(P(p), "utf8"));
const C = require(P("quant/engines/backtest-certification.js"));
const PB = require(P("quant/engines/profile-backtest.js"));
const SB = require(P("quant/engines/signal-backtest.js"));
const M = json("quant/methodology/backtest-certification-v1.json");
const G = C.gate;
const today = new Date().toISOString().slice(0, 10);

const signal = json("quant/data/product/signal-backtest-v1.json");
const outcomes = json("quant/data/product/setup-outcomes-v1.json");
const replayStudy = existsSync(P("quant/data/product/setup-backtest-v1.json")) ? json("quant/data/product/setup-backtest-v1.json") : null;
const pattern = json("quant/data/product/pattern-research-v1/study.json");
const setupMethod = json("quant/methodology/setup-state-v1.json");
const returnSemantics = json("quant/methodology/return-semantics-v1.json");
const trConfirmed = /TOTAL_RETURN_CONFIRMED/.test(JSON.stringify(returnSemantics.approval || {}));

/* ---------- Historien ---------- */
const dirDates = (p, re = /^\d{4}-\d{2}-\d{2}\.json(\.gz)?$/) => (existsSync(P(p)) ? readdirSync(P(p)).filter((f) => re.test(f)).map((f) => f.slice(0, 10)).sort() : []);
const membershipByIndex = Object.fromEntries(["SP500", "NDX", "DJIA"].map((ix) => [ix, PB.historyCoverage(dirDates("quant/data/market/index-membership/history/" + ix), today)]));
const membership = membershipByIndex.SP500;
const factorIndex = json("quant/data/product/factor-evidence-history/index.json");
const factorVersion = Object.keys(factorIndex.series).sort().pop();
const factor = PB.historyCoverage(factorIndex.series[factorVersion], today);

/* ---------- Survivorship: Gate und Kontrolle getrennt ----------
   Inventar und Identitaet kommen aus build-survivorship-control.mjs
   (Listing-Kennung, nie das Kuerzel). Das Gate schuetzt vor einer
   Zertifizierung ohne Kontrolle; die Kontrolle heisst nur dann vorhanden,
   wenn delistete Titel tatsaechlich in einer Studie stecken. */
const SC = require(P("quant/engines/survivorship-control.js"));
const inventory = existsSync(P("quant/data/product/survivorship-control-v1.json")) ? json("quant/data/product/survivorship-control-v1.json") : null;
const sens = signal.survivorshipSensitivity || { computed: false };
const highTrustWithoutControl = signal.rules.some((r) => r.checks.survivorship.state !== "PASS" && ["USABLE", "ROBUST"].includes(r.trust));
const scStatus = SC.status({ highTrustWithoutControl, delistedInStudy: sens.computed ? sens.delistedInVariant : 0, coverageFrom: sens.computed ? sens.window.from : null,
  studyFrom: signal.source && signal.source.from, unfetchableShare: inventory && inventory.delisted && inventory.delisted.available ? inventory.delisted.unfetchableReusedShare : null });
const smInv = inventory ? inventory.securityMaster : null, dInv = inventory && inventory.delisted && inventory.delisted.available ? inventory.delisted : null;
const survivorship = {
  version: SC.VERSION,
  gate: scStatus.gate.state, control: scStatus.control.state,
  SURVIVORSHIP_GATE: scStatus.gate, SURVIVORSHIP_CONTROL: scStatus.control,
  DELISTED_IDENTIFIED: (smInv ? smInv.inactiveCommon : 0) + (dInv ? dInv.delistedListings : 0),
  DELISTED_WITH_HISTORY: (smInv ? smInv.backtestEligible : 0) + (dInv ? dInv.classes.A + dInv.classes.B : 0),
  DELISTED_BACKTEST_ELIGIBLE: sens.computed ? sens.delistedInVariant : 0,
  tickerReuseAmbiguous: (smInv ? smInv.classes.D + smInv.classes.F : 0) + (dInv ? dInv.classes.D + dInv.classes.F : 0),
  securityMasterClasses: smInv ? smInv.classes : null, delistedStoreClasses: dInv ? dInv.classes : null,
  plain: "Gate: keine Auswertung ohne Kontrolle steht über „eingeschränkt“; das Gate löst den Überlebenden-Effekt nicht. Kontrolle: " +
    (scStatus.control.state === "PARTIAL" ? "delistete Titel ab 2016 sind in einer Sensitivitätsrechnung enthalten, nicht in der Hauptstudie; vor 2016 fehlen sie, der Ausgang eines Delistings ist unbekannt." :
      "keine delistete Kursreihe mit sauberer Identität in einer Studie."),
  forwardCollected: "Vorwärts gesammelte Stände (Setup-Historie, Index-Zugehörigkeit) enthalten das Universum des jeweiligen Tages und sind damit überlebensfrei, solange kein Fall weggelassen wird."
};

/* ---------- A / B ---------- */
const kinds = [];
function kind(id, label, gates, extra) {
  const cfg = M.kinds[id];
  const cls = C.classify({ gates, trust: extra.trust, published: extra.published, ownerApproval: extra.ownerApproval || { required: !!cfg.ownerApproval, given: false }, minimumTrust: cfg.minimumTrustForCertification || "USABLE" });
  const k = { id, label, tier: cfg.tier, gates, trust: extra.trust, published: !!extra.published, ownerApproval: extra.ownerApproval || { required: !!cfg.ownerApproval, given: false }, minimumTrust: cfg.minimumTrustForCertification || "USABLE", ...cls, ...extra.more };
  kinds.push(k);
  return k;
}
kind("SAME_STOCK_REPLAY", "Rückblick derselben Aktie", [
  G("pit", "nur Kurse bis zum jeweiligen Fall", "HARD", true, "Leckage-Vertrag der Musterstudie (historical-cases)"),
  G("survivorship", "Überlebende", "STRUCTURAL", false, "Eine Aktie mit langer Historie hat überlebt", null, "SURVIVOR_BY_CONSTRUCTION"),
  G("ruleTest", "prüft eine Regel außerhalb des Lernzeitraums", "QUALITY", false, "beschreibt, prüft keine Regel", null, "DESCRIPTIVE_NOT_A_TEST")
], { trust: "LIMITED", published: true });
kind("PATTERN_EVIDENCE", "Marktweite Muster", [
  G("pit", "Leckage-Vertrag, gepurgte Folds", "HARD", true, "assert in observe()"),
  G("oos", "außerhalb des Lernzeitraums", "QUALITY", (pattern.findings || []).some((f) => f.verdict === "ROBUST"), (pattern.findings || []).filter((f) => f.verdict === "ROBUST").length + " robuste Befunde"),
  G("survivorship", "Überlebende", "STRUCTURAL", false, "teilweise nicht quantifiziert", null, "PRESENT_AND_UNQUANTIFIED_IN_PART"),
  G("returnBasis", "Gesamtrendite", "STRUCTURAL", false, "Kursrendite", null, "TOTAL_RETURN_SERIES_NOT_PUBLISHED"),
  G("certifiedAsBacktest", "als Backtest freigegeben", "QUALITY", pattern.backtest !== "NOT_CERTIFIED", "Häufigkeitsauswertung", null, "STUDY_DECLARES_BACKTEST_NOT_CERTIFIED")
], { trust: "LIMITED", published: true });

/* ---------- C: Signal ---------- */
const CAT = { pit: "HARD", lookahead: "HARD", survivorship: "STRUCTURAL", returnBasis: "STRUCTURAL", sample: "QUALITY", oos: "QUALITY", walkForward: "QUALITY", costs: "QUALITY", slippage: "QUALITY",
  benchmark: "QUALITY", regimeDiversity: "QUALITY", independence: "QUALITY", parameterStability: "QUALITY", completeness: "QUALITY" };
const signalRules = signal.rules.map((r) => {
  const gates = Object.entries(r.checks).map(([id, ch]) => G(id, (SB.TRUST_CHECKS.find((t) => t.id === id) || {}).label || id, CAT[id] || "QUALITY", ch.state === "PASS", typeof ch.value === "string" ? ch.value : null, null, ch.reason));
  gates.push(G("edgeOutOfSample", "Vorteil gegenüber der Base Rate im Testzeitraum", "QUALITY", !!r.edgeOutOfSample, r.horizons.m6.baseRate ? "Δ " + r.horizons.m6.baseRate.deltaPositiveShare : null, null, "EDGE_NOT_CONFIRMED_OUT_OF_SAMPLE"));
  const cls = C.classify({ gates, trust: r.trust, published: r.display.allowed, ownerApproval: { required: false, given: false }, minimumTrust: "USABLE" });
  return { id: r.id, gates, trust: r.trust, published: r.display.allowed, ownerApproval: { required: false, given: false }, minimumTrust: "USABLE", ...cls,
    sample: r.sample, independence: r.independence, returnType: r.returnType,
    baseRate: r.horizons.m6.baseRate ? { positiveShare: r.horizons.m6.positiveShare, base: r.horizons.m6.baseRate.matchedPositiveShare, delta: r.horizons.m6.baseRate.deltaPositiveShare, ci: r.horizons.m6.baseRate.ci } : null };
});
const sigKind = kind("SIGNAL_BACKTEST", "Signal-Backtest", [
  G("pit", "Point-in-Time (alle Regeln)", "HARD", signalRules.every((r) => r.gates.find((x) => x.id === "pit").state === "PASS"), "abgeschnittene und verfälschte Zukunft"),
  G("lookahead", "Einstieg nach dem Signal", "HARD", signalRules.every((r) => r.gates.find((x) => x.id === "lookahead").state === "PASS"), "Schluss der Folgewoche"),
  G("survivorship", "Überlebende-Kontrolle", "STRUCTURAL", survivorship.control === "PASS", survivorship.control === "PASS" ? "aktiv" : survivorship.control === "PARTIAL" ? "teilweise (Sensitivität ab 2016, nicht in der Hauptstudie)" : "nicht vorhanden", null, survivorship.control === "PARTIAL" ? "PARTIAL_SENSITIVITY_ONLY" : "TODAYS_UNIVERSE_ONLY"),
  G("returnBasis", "Gesamtrendite", "STRUCTURAL", signal.returnType === "TOTAL_RETURN", signal.returnType === "TOTAL_RETURN" ? "Gesamtrendite" : "Kursrendite (Pipeline rechnet mit Gesamtrendite)", null, "TOTAL_RETURN_SERIES_NOT_PUBLISHED"),
  G("ruleCertified", "mindestens eine Regel zertifiziert", "QUALITY", signalRules.some((r) => r.status === "CERTIFIED"), signalRules.filter((r) => r.status === "CERTIFIED").length + " von " + signalRules.length, null, "NO_RULE_CERTIFIED")
], { trust: signalRules.map((r) => r.trust).sort((a, b) => C.TRUST_RANK[b] - C.TRUST_RANK[a])[0], published: signalRules.some((r) => r.published), more: { rules: signalRules,
  collecting: (signal.withoutHistory || []).filter((w) => w.status === "COLLECTING_HISTORY").map((w) => ({ eventType: w.eventType, source: w.collecting.source })) } });

/* ---------- D: Setup (nur veroeffentlichte Staende) ---------- */
const req = M.kinds.SETUP_BACKTEST.requirements;
const st = outcomes.study, hist = outcomes.history;
const completedM6 = Math.max(...["SETUP_CONFIRMED", "SETUP_NEW"].map((k) => st[k].variants.NEXT_CLOSE.m6.status.COMPLETED));
const completedTitles = Math.max(...["SETUP_CONFIRMED", "SETUP_NEW"].map((k) => (st[k].variants.NEXT_CLOSE.m6.status.COMPLETED ? st[k].titles : 0)));
const eventWeeks = new Set(outcomes.events.map((e) => e[2].slice(0, 7))).size;
const variantGate = st.SETUP_CONFIRMED.variantGate;
const firstEvent = outcomes.events.map((e) => e[2]).sort()[0] || null;
const setupGates = [
  G("publishedOnly", "nur veröffentlichte Zustände", "HARD", outcomes.source.reconstructed === false, "setup-observation-history"),
  G("pit", "Stände unverändert (contentHash)", "HARD", hist.contentHashVerified === hist.dates, hist.contentHashVerified + " von " + hist.dates + " geprüft"),
  G("lookahead", "Einstieg nach Veröffentlichung", "HARD", true, "Schluss des Folgetags (Standard), Signalschluss nur als Vergleich"),
  G("historyDates", "veröffentlichte Stichtage", "HISTORY", hist.dates >= req.historyDates, hist.dates, req.historyDates, "SETUP_HISTORY_TOO_SHORT"),
  G("historySpan", "Spanne der Historie", "HISTORY", hist.spanDays >= req.historySpanDays, hist.spanDays + " Tage", req.historySpanDays + " Tage", "SETUP_HISTORY_SPAN_TOO_SHORT"),
  G("completedOutcomes", "abgeschlossene 6-Monats-Ergebnisse", "HISTORY", completedM6 >= req.completedOutcomesM6, completedM6, req.completedOutcomesM6, "COMPLETED_OUTCOMES_TOO_FEW"),
  G("titles", "Titel mit abgeschlossenem Ergebnis", "HISTORY", completedTitles >= req.titles, completedTitles, req.titles, "TOO_FEW_TITLES"),
  G("independence", "verschiedene Monate mit Ereignissen", "HISTORY", eventWeeks >= req.independentWeeks, eventWeeks, req.independentWeeks, "EVENTS_CLUSTERED_IN_TIME"),
  G("returnBasis", "Gesamtrendite", "STRUCTURAL", outcomes.returnType === "TOTAL_RETURN", outcomes.returnType === "TOTAL_RETURN" ? "Gesamtrendite" : "lokal Kursrendite; Pipeline rechnet mit Gesamtrendite", null, "TOTAL_RETURN_NOT_IN_THIS_RUN"),
  G("survivorship", "Überlebende (vorwärts gesammelt, kein Fall weggelassen)", "STRUCTURAL", true, "Universum des jeweiligen Tages; INCOMPLETE wird gezählt"),
  G("entryVariant", "Einstiegsvarianten stimmen überein", "QUALITY", variantGate === "PASS", { PASS: "übereinstimmend", NOT_MEASURABLE_YET: "noch nicht messbar" }[variantGate] || "Abweichung über 1 Pp – Owner-Entscheidung", "Δ Median ≤ 1 Pp", variantGate === "NOT_MEASURABLE_YET" ? "VARIANTS_NOT_MEASURABLE_YET" : variantGate),
  G("oos", "Lernen/Testen (zeitlich)", "QUALITY", false, "erst mit abgeschlossenen Ergebnissen messbar", null, "OOS_NOT_MEASURABLE_YET")
];
const cadence = hist.medianGapDays || 1;
kind("SETUP_BACKTEST", "Setup-Backtest", setupGates, { trust: "NOT_READY", published: false,
  ownerApproval: { required: setupMethod.requirements.backtestCertification !== "CERTIFIED", given: setupMethod.requirements.backtestCertification === "CERTIFIED", source: M.kinds.SETUP_BACKTEST.ownerApprovalSource },
  more: { eta: { historyDates: C.eta(hist.dates, req.historyDates, 7 / 5, hist.to), firstCompletedM6: firstEvent ? new Date(Date.parse(firstEvent) + 183 * 86400000).toISOString().slice(0, 10) : null },
    progress: { historyDates: hist.dates, spanDays: hist.spanDays, transitions: outcomes.transitions, completedM6, contractTradesCompleted: (st.SETUP_NEW.contractTrades || {}).completed || 0 },
    replay: replayStudy ? { role: "PIT-Nachweis der Engine (rekonstruiert, keine Ergebnisquelle)", parity: replayStudy.parity.checked + "/" + replayStudy.parity.checked, mismatches: replayStudy.parity.mismatches } : null } });

/* ---------- E: Strategie, F: Faktor ---------- */
const sreq = M.kinds.STRATEGY_BACKTEST.requirements;
kind("STRATEGY_BACKTEST", "Strategie-Backtest", [
  G("contract", "vollständiger Backtest-Vertrag", "HARD", existsSync(P("quant/methodology/strategy-backtest-contract-v1.json")), "strategy-backtest-contract-1.0.0"),
  G("pitGuards", "PIT-Schutz der Engine (Sabotage-Tests)", "HARD", true, "profile-backtest-1.0.0: Stand strikt vor dem Termin, kein heutiges Universum"),
  G("membershipHistory", "Monate mit Index-Zugehörigkeit", "HISTORY", membership.months >= sreq.membershipSnapshotsMonthly, membership.months + " (" + membership.snapshots + " Stände seit " + membership.earliest + ")", sreq.membershipSnapshotsMonthly, "HISTORICAL_UNIVERSE_MEMBERSHIP_MISSING"),
  G("factorHistory", "Monate mit Faktor-Snapshots", "HISTORY", factor.months >= sreq.factorSnapshotsMonthly, factor.months + " (" + factor.snapshots + " Stände seit " + factor.earliest + ")", sreq.factorSnapshotsMonthly, "FACTOR_HISTORY_TOO_SHORT"),
  G("continuity", "keine Lücke über " + sreq.maxGapDays + " Tage", "HISTORY", (membership.maxGapDays ?? 0) <= sreq.maxGapDays && (factor.maxGapDays ?? 0) <= sreq.maxGapDays, "größte Lücke " + Math.max(membership.maxGapDays || 0, factor.maxGapDays || 0) + " Tage", sreq.maxGapDays + " Tage", "HISTORY_GAP"),
  G("returnBasis", "Gesamtrendite (Universum und Benchmark)", "STRUCTURAL", trConfirmed, trConfirmed ? "in der Renditesemantik bestätigt, läuft in der Pipeline" : "nicht bestätigt", null, "TOTAL_RETURN_NOT_CONFIRMED"),
  G("survivorship", "Universum je Termin aus vorwärts gesammelter Zugehörigkeit", "STRUCTURAL", true, "keine heutigen Mitglieder rückwirkend")
], { trust: "NOT_READY", published: false, more: { membership: membershipByIndex, factor: { version: factorVersion, ...factor },
  eta: { membership: C.eta(membership.months, sreq.membershipSnapshotsMonthly, 30.4, membership.latest), factor: C.eta(factor.months, sreq.factorSnapshotsMonthly, 30.4, factor.latest) } } });
const freq = M.kinds.FACTOR_RANKING_BACKTEST.requirements;
kind("FACTOR_RANKING_BACKTEST", "Faktor-/Ranking-Backtest", [
  G("contract", "Quintil-Vertrag", "HARD", true, "strategy-backtest-contract-1.0.0 factorRanking"),
  G("pitGuards", "PIT-Schutz der Engine (Sabotage-Tests)", "HARD", true, "Stand strikt vor dem Einstieg"),
  G("factorHistory", "Monate mit Faktor-Snapshots", "HISTORY", factor.months >= freq.factorSnapshotsMonthly, factor.months, freq.factorSnapshotsMonthly, "FACTOR_HISTORY_TOO_SHORT"),
  G("completedForward", "Monate mit abgeschlossenem 3-Monats-Ergebnis", "HISTORY", Math.max(0, factor.months - 3) >= freq.completedForwardMonths, Math.max(0, factor.months - 3), freq.completedForwardMonths, "FORWARD_OUTCOMES_TOO_FEW"),
  G("membershipHistory", "Monate mit Index-Zugehörigkeit", "HISTORY", membership.months >= freq.factorSnapshotsMonthly, membership.months, freq.factorSnapshotsMonthly, "HISTORICAL_UNIVERSE_MEMBERSHIP_MISSING"),
  G("noRetroactive", "keine rückwirkende Faktorberechnung", "HARD", true, "nur veröffentlichte Snapshots")
], { trust: "NOT_READY", published: false, more: { eta: { factor: C.eta(factor.months, freq.factorSnapshotsMonthly, 30.4, factor.latest) } } });

const counts = Object.fromEntries(C.STATUSES.map((s) => [s, 0]));
for (const k of kinds) counts[k.status]++;
const ruleCounts = Object.fromEntries(C.STATUSES.map((s) => [s, 0]));
for (const r of signalRules) ruleCounts[r.status]++;
const doc = { schemaVersion: C.VERSION, generatedAt: new Date().toISOString(), asOf: today, methodology: M.methodologyVersion, kinds, survivorship,
  measures: { KINDS_BY_STATUS: counts, SIGNAL_RULES_BY_STATUS: ruleCounts, CERTIFIED_KINDS: kinds.filter((k) => k.status === "CERTIFIED").map((k) => k.id),
    OWNER_APPROVAL_REQUIRED: kinds.filter((k) => k.readiness === "OWNER_APPROVAL_REQUIRED" || (k.ownerApproval && k.ownerApproval.required)).map((k) => k.id) } };
const errors = C.certificationViolations(doc);
if (errors.length) { console.error(errors); process.exit(1); }
writeFileSync(P("quant/data/product/backtest-certification-v1.json"), JSON.stringify(doc, null, 1) + "\n");
for (const k of kinds) console.log(k.id.padEnd(24), k.tier.padEnd(9), k.status.padEnd(19), k.readiness.padEnd(16), k.reason || "");
for (const r of signalRules) console.log("  ", r.id.padEnd(22), r.status, r.reason, r.baseRate ? "Δ " + r.baseRate.delta : "");
console.log("survivorship", JSON.stringify({ gate: survivorship.gate, control: survivorship.control, DELISTED_IDENTIFIED: survivorship.DELISTED_IDENTIFIED, DELISTED_WITH_HISTORY: survivorship.DELISTED_WITH_HISTORY }));
