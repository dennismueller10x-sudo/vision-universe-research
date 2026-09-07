/* =========================================================================
   PHASE 3 §7/§11/§13 — QUALIFIKATIONSPRUEFSTAND

   Der Pruefstand hat eine Aufgabe, die leicht misslingt: er soll ein Urteil
   faellen, ohne eines zu erfinden. Die Tests hier pruefen vor allem die
   Faelle, in denen ein Pruefstand zu grosszuegig wird:

     - ein Anbieter, ueber den nichts bekannt ist
     - eine Faehigkeit, die nur ein Vergleichsartikel behauptet
     - eine Dokumentationsangabe, der die Laufzeitmessung widerspricht
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const Qualification = require("../engines/provider-qualification.js");
const SPEC = JSON.parse(readFileSync(
  join(ROOT, "quant", "methodology", "backtest-evidence-v1.json"), "utf8"));
const PROFILES = JSON.parse(readFileSync(
  join(ROOT, "quant", "config", "provider-profiles.json"), "utf8"));

Qualification.configure(SPEC);

/* ---------------------------------------------------------------------- */
test("Q1 · Ohne Befunde ist das Ergebnis UNKNOWN, nicht NOT_QUALIFIED", () => {
  const res = Qualification.runProviderQualification({ providerId: "unbekannt" });

  assert.equal(res.qualificationStatus, "UNKNOWN");
  assert.notEqual(res.qualificationStatus, "NOT_QUALIFIED",
    "nichts zu wissen ist etwas anderes, als etwas zu widerlegen");
  for (const gate of Object.values(res.gates)) {
    assert.equal(gate.result, "UNKNOWN");
  }
  assert.ok(res.warnings.some((w) => /Laufzeit/.test(w)),
    "das Fehlen jeder Laufzeitpruefung muss auffallen");
});

test("Q2 · Ein widerlegtes Kriterium fuehrt zu NOT_QUALIFIED, kein UNKNOWN", () => {
  const res = Qualification.runProviderQualification({
    providerId: "widerlegt",
    findings: {
      delistedSecurities: { value: false, level: "DOCUMENTATION_VERIFIED", source: "Anbieterdokumentation" },
      survivorshipBiasControls: { value: false, level: "DOCUMENTATION_VERIFIED", source: "Anbieterdokumentation" }
    }
  });

  assert.equal(res.gates.GATE_B_DELISTING.result, "FAILED");
  assert.equal(res.roles.BACKTEST_EVIDENCE_PROVIDER.status, "NOT_QUALIFIED");
  assert.match(res.gates.GATE_B_DELISTING.reason, /Widerlegt/);
});

test("Q3 · Eine Sekundaerquelle reicht fuer ein Gate nicht", () => {
  // Der entscheidende Schutz: sonst qualifiziert ein Vergleichsartikel einen
  // Anbieter, und die Tabelle sieht aus wie ein Pruefergebnis.
  const schwach = Qualification.runProviderQualification({
    providerId: "nur-blog",
    findings: {
      pointInTimeFundamentals: { value: true, level: "THIRD_PARTY_REPORTED", source: "Vergleichsartikel" },
      filingTimestamps: { value: true, level: "THIRD_PARTY_REPORTED", source: "Vergleichsartikel" }
    }
  });
  assert.equal(schwach.gates.GATE_C_AVAILABILITY.result, "UNKNOWN");
  assert.match(schwach.gates.GATE_C_AVAILABILITY.reason, /schwach belegt/);

  // Dieselben Befunde aus Primaerdokumentation bestehen das Gate.
  const stark = Qualification.runProviderQualification({
    providerId: "mit-doku",
    findings: {
      pointInTimeFundamentals: { value: true, level: "DOCUMENTATION_VERIFIED", source: "Anbieterdokumentation" },
      filingTimestamps: { value: true, level: "DOCUMENTATION_VERIFIED", source: "Anbieterdokumentation" }
    }
  });
  assert.equal(stark.gates.GATE_C_AVAILABILITY.result, "PASSED");
});

test("Q4 · Eine Laufzeitmessung schlaegt die Dokumentation und meldet den Widerspruch", () => {
  const res = Qualification.runProviderQualification({
    providerId: "widerspruch",
    findings: {
      delistedSecurities: { value: true, level: "DOCUMENTATION_VERIFIED", source: "Anbieterdokumentation" }
    }
  }, {
    runtime: {
      delistedSecurities: { value: false, source: "Abfrage vom 2026-09-07", checkedAt: "2026-09-07" }
    }
  });

  assert.equal(res.findings.delistedSecurities.value, false);
  assert.equal(res.findings.delistedSecurities.level, "RUNTIME_VERIFIED");
  assert.ok(res.warnings.some((w) => /widerspricht der Dokumentation/.test(w)),
    "ein Widerspruch zwischen Dokumentation und Messung muss gemeldet werden");
});

test("Q5 · Eine Einstufung ohne Quellenangabe wird abgelehnt", () => {
  assert.throws(
    () => Qualification.finding("pointInTimeFundamentals", true, "DOCUMENTATION_VERIFIED", {}),
    /ohne Quellenangabe/,
    "eine Behauptung ohne Quelle ist keine Einstufung");

  // UNKNOWN darf ohne Quelle sein - es behauptet ja nichts.
  assert.doesNotThrow(() => Qualification.finding("pointInTimeFundamentals", null, "UNKNOWN", {}));
});

test("Q6 · Nur true, false oder null - keine Zwischentoene", () => {
  for (const bad of ["ja", 1, "partial", undefined]) {
    assert.throws(() => Qualification.finding("x", bad, "UNKNOWN", {}),
      /muss true, false oder null sein/);
  }
});

test("Q7 · PARTIALLY_QUALIFIED heisst rollenabhaengig, nicht mittelmaessig", () => {
  // Ein starker Marktdatenanbieter, der fuer Backtests nichts taugt: das ist
  // kein halbes Ergebnis, sondern ein klares - je Rolle.
  const res = Qualification.runProviderQualification({
    providerId: "marktdaten-stark",
    findings: {
      historicalDaily: { value: true, level: "DOCUMENTATION_VERIFIED", source: "Anbieterdokumentation" },
      pointInTimeFundamentals: { value: false, level: "DOCUMENTATION_VERIFIED", source: "Anbieterdokumentation" },
      delistedSecurities: { value: false, level: "DOCUMENTATION_VERIFIED", source: "Anbieterdokumentation" }
    }
  });

  assert.equal(res.qualificationStatus, "PARTIALLY_QUALIFIED");
  assert.equal(res.roles.MARKET_DATA_PROVIDER.status, "QUALIFIED");
  assert.equal(res.roles.BACKTEST_EVIDENCE_PROVIDER.status, "NOT_QUALIFIED");
  assert.equal(res.bestRole, "MARKET_DATA_PROVIDER");
});

test("Q8 · Die Marktdatenrolle stellt keine historischen Anforderungen", () => {
  const role = SPEC.roles.MARKET_DATA_PROVIDER;
  assert.deepEqual(role.gates, [],
    "ein Marktdatenanbieter muss keine Gates bestehen - er beantwortet eine andere Frage");
  assert.ok(SPEC.roles.BACKTEST_EVIDENCE_PROVIDER.gates.length === 3);
});

/* ----------------------------------------- Die hinterlegten Profile */

test("Q9 · Jeder hinterlegte Befund traegt eine Quelle", () => {
  for (const [id, profile] of Object.entries(PROFILES.providers)) {
    for (const [req, f] of Object.entries(profile.findings || {})) {
      if (f.level === "UNKNOWN") continue;
      assert.ok(f.source, `${id}.${req}: Einstufung '${f.level}' ohne Quellenangabe`);
      assert.ok(f.checkedAt, `${id}.${req}: Einstufung ohne Datum`);
    }
  }
});

test("Q10 · Kein hinterlegter Befund behauptet eine Laufzeitpruefung", () => {
  // §13: keine erfundenen Anbieterergebnisse. In dieser Phase wurde keine
  // einzige Anfrage an einen dieser Anbieter gestellt - also darf auch
  // nirgends RUNTIME_VERIFIED stehen.
  for (const [id, profile] of Object.entries(PROFILES.providers)) {
    for (const [req, f] of Object.entries(profile.findings || {})) {
      assert.notEqual(f.level, "RUNTIME_VERIFIED",
        `${id}.${req} behauptet eine Laufzeitpruefung, die nicht stattgefunden hat`);
    }
  }
  assert.ok(PROFILES.retrievalNote, "die Herkunft der Befunde muss dokumentiert sein");
  assert.match(PROFILES.retrievalNote, /RUNTIME_VERIFIED/);
});

test("Q11 · Alle Profile lassen sich auswerten und keines wird geschoent", () => {
  const results = Object.values(PROFILES.providers)
    .map((p) => Qualification.runProviderQualification(p, { now: PROFILES.researchedAt }));

  // Inventar-Guard: waechst nur zusammen mit quant/config/provider-profiles.json.
  // sharadar, intrinio, twelve-data, eodhd, fmp, polygon, sec-edgar (Phase 4).
  assert.equal(results.length, 7);

  for (const r of results) {
    assert.ok(Qualification.STATUS.includes(r.qualificationStatus), r.providerId);
    // Kein Anbieter darf ohne Laufzeitbefund als vollstaendig qualifiziert gelten.
    assert.notEqual(r.qualificationStatus, "QUALIFIED",
      `${r.providerId} gilt als vollstaendig qualifiziert, obwohl nichts gemessen wurde`);
    assert.equal(r.evidence.runtimeVerified.length, 0);
    assert.equal(r.licensingStatus.status, "LEGAL_REVIEW_REQUIRED",
      `${r.providerId}: Lizenzlage darf nicht als geklaert gelten`);
  }

  // Kein einziger Anbieter besteht derzeit alle drei Gates.
  const alleGates = results.filter((r) =>
    Object.values(r.gates).every((g) => g.result === "PASSED"));
  assert.equal(alleGates.length, 0,
    "kein Anbieter darf als Backtest-Evidenzquelle gelten, solange nichts gemessen wurde");
});

test("Q12 · Twelve Data ist als Marktdatenanbieter eingeordnet, nicht als Evidenzquelle", () => {
  const res = Qualification.runProviderQualification(PROFILES.providers["twelve-data"]);

  assert.equal(res.roles.MARKET_DATA_PROVIDER.status, "QUALIFIED");
  assert.equal(res.roles.BACKTEST_EVIDENCE_PROVIDER.status, "NOT_QUALIFIED");
  assert.equal(res.bestRole, "MARKET_DATA_PROVIDER");

  // Und zwar widerlegt, nicht ungeprueft - das ist der Unterschied zu den
  // Anbietern, ueber die schlicht nichts bekannt ist.
  assert.equal(res.gates.GATE_B_DELISTING.result, "FAILED");
  assert.equal(res.findings.pointInTimeFundamentals.value, false);
});

test("Q13 · Die Intrinio-PIT-Verwechslung ist als solche festgehalten", () => {
  // Der wichtigste Einzelbefund der Recherche: 'point-in-time' bedeutet in
  // der auffindbaren Intrinio-Stelle die Bilanz als Stichtagsrechnung, nicht
  // die bitemporale Verfuegbarkeit. Wer das verwechselt, qualifiziert einen
  // Anbieter auf einem Missverstaendnis.
  const finding = PROFILES.providers.intrinio.findings.pointInTimeFundamentals;
  assert.equal(finding.value, null);
  assert.equal(finding.level, "UNKNOWN");
  assert.match(finding.note, /Begriffsverwechslung|andere Sache/);
});

test("Q14 · Die Entscheidungstabelle bildet den Belegstand ab", () => {
  const results = Object.values(PROFILES.providers)
    .map((p) => Qualification.runProviderQualification(p));
  const table = Qualification.decisionTable(results);

  assert.equal(table.length, 7);
  for (const row of table) {
    assert.ok("provider" in row && "qualification" in row);
    assert.equal(row.runtimeVerifiedCount, 0,
      "die Tabelle muss zeigen, dass nichts gemessen wurde");
    assert.equal(row.licenseConfidence, "LEGAL_REVIEW_REQUIRED");
  }
});

test("Q15 · SEC ist als Fundamentalquelle eingetragen, aber nicht als belegte Evidenzquelle", () => {
  // Phase 4: der SEC-Adapter existiert und besteht Gate A und C gegen eine
  // synthetische Fixture. Genau deshalb ist hier zu pruefen, dass ihn das NICHT
  // zur Evidenzquelle macht - gegen data.sec.gov wurde bis heute keine einzige
  // Anfrage gestellt, und ein Profil darf das nicht anders aussehen lassen.
  const profile = PROFILES.providers["sec-edgar"];
  assert.ok(profile, "sec-edgar fehlt in den Profilen");

  const res = Qualification.runProviderQualification(profile);
  assert.notEqual(res.qualificationStatus, "QUALIFIED");
  assert.equal(res.evidence.runtimeVerified.length, 0);

  // Die beiden ehrlichen Negativbefunde muessen als Ausschluss stehen,
  // nicht als "ungeprueft".
  assert.equal(profile.findings.survivorshipBiasControls.value, false);
  assert.equal(profile.findings.marketDataOhlcv.value, false);

  // Und das, was schlicht nicht gemessen wurde, muss null bleiben.
  assert.equal(profile.findings.delistedSecurities.value, null);
  assert.equal(profile.findings.historicalCoverage.value, null);

  // Kein Befund darf eine Laufzeitpruefung behaupten.
  for (const [req, f] of Object.entries(profile.findings)) {
    assert.notEqual(f.level, "RUNTIME_VERIFIED", `sec-edgar.${req}`);
    assert.notEqual(f.level, "DOCUMENTATION_VERIFIED",
      `sec-edgar.${req}: die SEC-Dokumentation wurde in dieser Umgebung nicht abgerufen`);
  }
});
