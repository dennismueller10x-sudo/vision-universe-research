/* =========================================================================
   PHASE 3 §18/§19/§20 — MEHRERE ANBIETER, EIN WERT

   Sobald mehr als ein Anbieter angebunden ist, entsteht eine Frage, die
   vorher nicht existierte: welcher Wert gilt? Die bequeme Antwort - eine
   feste Rangfolge - ist aus einem bestimmten Grund falsch, und die Tests
   hier halten genau diesen Grund fest.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const P = require("../engines/data-precedence.js");

/* ------------------------------------------------------ §18 Vorrangregeln */

test("D1 · Fuer eine historische Abfrage schlaegt Zeitpunktgenauigkeit alles andere", () => {
  // Der Anbieter mit der hoeheren Konfidenz und dem hoeheren Rang verliert,
  // weil er die Frage nicht beantworten kann: er weiss nicht, was damals
  // bekannt war. Ein aktueller Wert ist hier kein ungenauer, sondern ein
  // falscher.
  const res = P.resolve([
    { providerId: "premium", value: 100, pitCapable: false, confidence: 0.95, capability: true },
    { providerId: "einfach", value: 97, pitCapable: true, confidence: 0.5, capability: true }
  ], { historical: true, providerPriority: { premium: 1, einfach: 9 } });

  assert.equal(res.winner.providerId, "einfach");
  assert.equal(res.value, 97);
  assert.equal(res.excluded.length, 1);
  assert.equal(res.excluded[0].reason, "nicht zeitpunktgenau");
});

test("D2 · Eine einzelne nicht zeitpunktgenaue Quelle wird nicht durchgewinkt", () => {
  // Der gefaehrlichste Fall: es gibt keine Alternative. Genau dann ist die
  // Versuchung am groessten, den vorhandenen Wert zu nehmen.
  const res = P.resolve([
    { providerId: "einzig", value: 100, pitCapable: false }
  ], { historical: true });

  assert.equal(res.resolved, false);
  assert.equal(res.reason, "noPitSource");
  assert.match(res.message, /kein ungenauer, sondern ein falscher/);
});

test("D3 · Werte, die es damals noch nicht gab, scheiden aus", () => {
  const res = P.resolve([
    { providerId: "a", value: 10, availableAt: "2027-01-01", pitCapable: true },
    { providerId: "b", value: 12, availableAt: "2025-01-01", pitCapable: true }
  ], { historical: true, decisionTime: "2026-01-01" });

  assert.equal(res.winner.providerId, "b");
  assert.equal(res.excluded.length, 1);

  const keiner = P.resolve([
    { providerId: "a", value: 10, availableAt: "2027-01-01", pitCapable: true }
  ], { historical: true, decisionTime: "2026-01-01" });
  assert.equal(keiner.resolved, false);
  assert.equal(keiner.reason, "noneAvailableYet");
});

test("D4 · Die Anbieterrangfolge entscheidet erst, wenn alles andere gleich ist", () => {
  const res = P.resolve([
    { providerId: "zweitrangig", value: 10, capability: true, confidence: 0.8 },
    { providerId: "erstrangig", value: 11, capability: true, confidence: 0.8 }
  ], { providerPriority: { erstrangig: 1, zweitrangig: 2 }, now: "2026-09-07" });

  assert.equal(res.winner.providerId, "erstrangig");
  assert.equal(res.criterion, "providerPriority");

  // Aber nicht, wenn die Konfidenz sich unterscheidet.
  const res2 = P.resolve([
    { providerId: "zweitrangig", value: 10, capability: true, confidence: 0.9 },
    { providerId: "erstrangig", value: 11, capability: true, confidence: 0.4 }
  ], { providerPriority: { erstrangig: 1, zweitrangig: 2 }, now: "2026-09-07" });

  assert.equal(res2.winner.providerId, "zweitrangig");
  assert.equal(res2.criterion, "confidence");
});

test("D5 · Ein Feld, das ein Anbieter ausdruecklich nicht abdeckt, verliert", () => {
  const res = P.resolve([
    { providerId: "ohne", value: 10, capability: false, confidence: 0.99 },
    { providerId: "mit", value: 11, capability: true, confidence: 0.3 }
  ], {});
  assert.equal(res.winner.providerId, "mit");
  assert.equal(res.criterion, "capability");
});

test("D6 · Bei Gleichstand ist das Ergebnis wiederholbar", () => {
  // Ein nichtdeterministischer Datenstand waere schlimmer als ein
  // willkuerlicher: derselbe Backtest ergaebe zweimal Verschiedenes.
  const candidates = [
    { providerId: "b", value: 2, capability: true, confidence: 0.5 },
    { providerId: "a", value: 1, capability: true, confidence: 0.5 }
  ];
  const first = P.resolve(candidates, {});
  const second = P.resolve(candidates.slice().reverse(), {});
  assert.equal(first.winner.providerId, second.winner.providerId);
});

test("D7 · Eine erhebliche Abweichung wird als solche benannt", () => {
  const klein = P.resolve([
    { providerId: "a", value: 100.0 }, { providerId: "b", value: 100.2 }
  ], {});
  assert.equal(klein.disagreement.severity, "rounding");

  const gross = P.resolve([
    { providerId: "a", value: 100 }, { providerId: "b", value: 145 }
  ], {});
  assert.equal(gross.disagreement.severity, "material");
  assert.match(gross.disagreement.message, /messen die Anbieter Verschiedenes/);
});

test("D8 · Eine ausgeschlossene Quelle mit anderem Wert bleibt sichtbar", () => {
  // Sonst verschwindet die interessanteste Information genau dann, wenn der
  // Ausschluss das Ergebnis veraendert hat.
  const res = P.resolve([
    { providerId: "aktuell", value: 100, pitCapable: false },
    { providerId: "pit", value: 80, pitCapable: true }
  ], { historical: true });

  assert.equal(res.value, 80);
  assert.ok(res.disagreement, "die Abweichung zur ausgeschlossenen Quelle muss gemeldet werden");
  assert.equal(res.disagreement.severity, "material");
});

test("D9 · Ohne Kandidaten wird nichts erfunden", () => {
  for (const input of [[], null, [{ providerId: "a", value: null }], [{ providerId: "a" }]]) {
    const res = P.resolve(input, {});
    assert.equal(res.resolved, false);
    assert.equal(res.value, null);
  }
});

/* --------------------------------------------------- §19 DataQualityScore */

test("D10 · Ein Qualitaetswert mit zu vielen Luecken gilt als nicht aussagekraeftig", () => {
  const vollstaendig = P.dataQualityScore({
    completeness: 1, freshness: 1, pitConfidence: 1,
    sourceReliability: 1, identifierConfidence: 1, corporateActionCoverage: 1
  });
  assert.equal(vollstaendig.score, 100);
  assert.equal(vollstaendig.reliable, true);

  // Halb gefuellt ist nicht "die Haelfte wert" - es ist keine Aussage.
  const luecken = P.dataQualityScore({ completeness: 1, freshness: 1 });
  assert.equal(luecken.reliable, false);
  assert.equal(luecken.missing.length, 4);
  assert.match(luecken.note, /nicht aussagekraeftig/);
});

test("D11 · Der Qualitaetswert ist als intern gekennzeichnet", () => {
  // Eine Zahl wie "Datenqualitaet 72" wirkt praezise und ist es nicht.
  const res = P.dataQualityScore({ completeness: 0.7 });
  assert.equal(res.internalOnly, true);
});

test("D12 · Zeitpunktgenauigkeit hat das hoechste Gewicht", () => {
  // Die Gewichtung ist eine Setzung, aber keine beliebige: sie folgt der
  // Rangfolge der Fehler, die ein Backtest nicht ueberlebt.
  const weights = P.QUALITY_COMPONENTS;
  const highest = Object.entries(weights).sort((a, b) => b[1].weight - a[1].weight)[0];
  assert.equal(highest[0], "pitConfidence");
});

/* ---------------------------------------------------- §20 dataSnapshotId */

test("D13 · Die Kennung eines Datenstands ist lesbar und wieder zerlegbar", () => {
  const id = P.createSnapshotId({ universe: "US-EQUITY", date: "2026-09-07", version: 1 });
  assert.equal(id, "VU-US-EQUITY-2026-09-07-v1");

  const parsed = P.parseSnapshotId(id);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.universe, "US-EQUITY");
  assert.equal(parsed.date, "2026-09-07");
  assert.equal(parsed.version, 1);
});

test("D14 · Eine ungueltige Kennung wird nicht stillschweigend akzeptiert", () => {
  for (const bad of ["irgendwas", "VU-2026-09-07", "", null, "VU-X-2026-13-45-v1"]) {
    const parsed = P.parseSnapshotId(bad);
    assert.equal(parsed.valid, false, `'${bad}' galt als gueltig`);
    assert.ok(parsed.reason);
  }
});

test("D15 · Ein Datenstand sagt selbst, ob er als Nachweis taugt", () => {
  const ungeeignet = P.describeSnapshot({ universe: "US-EQUITY", date: "2026-09-07" });
  assert.equal(ungeeignet.evidenceEligible, false);
  assert.match(ungeeignet.evidenceNote, /nicht als Nachweis geeignet/);
  // Die Begruendung nennt die drei Voraussetzungen beim Namen.
  assert.match(ungeeignet.evidenceNote, /zeitpunktgenaue|delistete|total-return/i);

  const geeignet = P.describeSnapshot({
    universe: "US-EQUITY", date: "2026-09-07", evidenceEligible: true,
    adjustment: "TOTAL_RETURN"
  });
  assert.equal(geeignet.evidenceEligible, true);
  assert.equal(geeignet.evidenceNote, null);
});

test("D16 · Ein Datenstand fuehrt seine Quellen und die Bereinigungsstufe mit", () => {
  const snap = P.describeSnapshot({
    universe: "US-EQUITY", date: "2026-09-07",
    sources: { marketData: "twelve-data", fundamentals: "mock" },
    adjustment: "SPLIT_ADJUSTED",
    recordCounts: { securities: 15, bars: 5700 }
  });
  assert.equal(snap.sources.marketData, "twelve-data");
  assert.equal(snap.adjustment, "SPLIT_ADJUSTED");
  assert.equal(snap.recordCounts.bars, 5700);
  assert.ok(snap.createdAt);
});
