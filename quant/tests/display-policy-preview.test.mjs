/* =========================================================================
   PHASE 5 — GOLDEN FIVE: DEVELOPMENT-PREVIEW-AUDIENCE IN DER DISPLAY POLICY

   display-policy.js kannte bislang nur "internal" (immer erlaubt) und
   "public" (Standard: verboten). Diese Datei prueft die dritte, bewusst
   eng begrenzte Stufe "development_preview" (§6 der Phase-5-Anweisung):
   eine explizit benannte Titel-Allowlist, kein globales Gate, keine
   Anhebung von publicRawDisplayAllowed/publicDerivedDisplayAllowed.

   T1-T3  declare(): keine Erlaubnis ohne Scope, keine Erlaubnis ohne
          Basis/Pruefdatum (bestehende Disziplin, jetzt auch fuer die neue
          Berechtigung).
   T4-T9  check(audience:"development_preview"): Gate UND Erlaubnis UND
          Scope muessen zutreffen; realtime ist fuer diese Stufe grundsaetzlich
          verboten (kein Laufzeitbeleg); ein Titel ausserhalb der Allowlist
          bleibt verboten, auch wenn Gate und Erlaubnis stehen.
   T10    Bestehende audiences ("internal"/"public") bleiben unveraendert
          (Rueckwaertskompatibilitaet fuer die vier bestehenden Konsumenten).
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Policy = require("../engines/display-policy.js");

const GOLDEN_FIVE = ["AAPL", "MSFT", "NVDA", "JPM", "XOM"];

test.beforeEach(() => Policy.reset());
test.afterEach(() => Policy.reset());

test("T1 · developmentPreviewDisplayAllowed ohne developmentPreviewScope wird abgelehnt", () => {
  assert.throws(() => Policy.declare("tiingo", "marketData", {
    developmentPreviewDisplayAllowed: true, basis: "Phase 5", checkedAt: "2026-09-08"
  }), /developmentPreviewScope/);
});

test("T2 · developmentPreviewDisplayAllowed mit leerer Scope-Liste wird abgelehnt", () => {
  assert.throws(() => Policy.declare("tiingo", "marketData", {
    developmentPreviewDisplayAllowed: true, developmentPreviewScope: [],
    basis: "Phase 5", checkedAt: "2026-09-08"
  }), /developmentPreviewScope/);
});

test("T3 · developmentPreviewDisplayAllowed ohne Basis/Pruefdatum wird abgelehnt (bestehende Regel gilt auch hier)", () => {
  assert.throws(() => Policy.declare("tiingo", "marketData", {
    developmentPreviewDisplayAllowed: true, developmentPreviewScope: GOLDEN_FIVE
  }), /Grundlage|Pruefdatum/);
});

test("T4 · vollstaendig eingetragen: development_preview erlaubt fuer einen Titel aus der Scope-Liste", () => {
  Policy.declare("tiingo", "marketData", {
    developmentPreviewDisplayAllowed: true, developmentPreviewScope: GOLDEN_FIVE,
    basis: "Phase 5 Golden Five, Eigentuemerentscheidung", checkedAt: "2026-09-08"
  });
  const res = Policy.check({
    providerId: "tiingo", dataClass: "marketData", audience: "development_preview",
    form: "raw", ticker: "AAPL", gates: { ENABLE_DEVELOPMENT_PREVIEW_MARKET_DATA: true }
  });
  assert.equal(res.allowed, true);
  assert.equal(res.audience, "development_preview");
});

test("T5 · ohne ENABLE_DEVELOPMENT_PREVIEW_MARKET_DATA-Gate bleibt es verboten, auch mit eingetragener Erlaubnis", () => {
  Policy.declare("tiingo", "marketData", {
    developmentPreviewDisplayAllowed: true, developmentPreviewScope: GOLDEN_FIVE,
    basis: "Phase 5", checkedAt: "2026-09-08"
  });
  const res = Policy.check({
    providerId: "tiingo", dataClass: "marketData", audience: "development_preview",
    form: "raw", ticker: "AAPL", gates: {}
  });
  assert.equal(res.allowed, false);
  assert.equal(res.reason, "gateDisabled");
});

test("T6 · mit Gate aber ohne eingetragene Erlaubnis bleibt es verboten", () => {
  const res = Policy.check({
    providerId: "tiingo", dataClass: "marketData", audience: "development_preview",
    form: "raw", ticker: "AAPL", gates: { ENABLE_DEVELOPMENT_PREVIEW_MARKET_DATA: true }
  });
  assert.equal(res.allowed, false);
  assert.equal(res.reason, "notLicensed");
});

test("T7 · ein Titel ausserhalb der Allowlist bleibt verboten, obwohl Gate und Erlaubnis stehen " +
     "(kein globales Gate fuer alle Marktdaten)", () => {
  Policy.declare("tiingo", "marketData", {
    developmentPreviewDisplayAllowed: true, developmentPreviewScope: GOLDEN_FIVE,
    basis: "Phase 5", checkedAt: "2026-09-08"
  });
  const res = Policy.check({
    providerId: "tiingo", dataClass: "marketData", audience: "development_preview",
    form: "raw", ticker: "TSLA", gates: { ENABLE_DEVELOPMENT_PREVIEW_MARKET_DATA: true }
  });
  assert.equal(res.allowed, false);
  assert.equal(res.reason, "outOfScope");
});

test("T8 · Realtime ist fuer development_preview immer verboten, unabhaengig von Gate/Scope " +
     "(kein Laufzeitbeleg fuer Realtime bei keinem Golden-Five-Titel)", () => {
  Policy.declare("tiingo", "marketData", {
    developmentPreviewDisplayAllowed: true, developmentPreviewScope: GOLDEN_FIVE,
    basis: "Phase 5", checkedAt: "2026-09-08"
  });
  const res = Policy.check({
    providerId: "tiingo", dataClass: "marketData", audience: "development_preview",
    form: "realtime", ticker: "AAPL", gates: { ENABLE_DEVELOPMENT_PREVIEW_MARKET_DATA: true }
  });
  assert.equal(res.allowed, false);
  assert.equal(res.reason, "notVerified");
});

test("T9 · development_preview hebt publicRawDisplayAllowed nicht an — " +
     "eine separate 'public'-Anfrage bleibt verboten", () => {
  Policy.declare("tiingo", "marketData", {
    developmentPreviewDisplayAllowed: true, developmentPreviewScope: GOLDEN_FIVE,
    basis: "Phase 5", checkedAt: "2026-09-08"
  });
  const res = Policy.check({
    providerId: "tiingo", dataClass: "marketData", audience: "public",
    form: "raw", ticker: "AAPL", gates: { ENABLE_DEVELOPMENT_PREVIEW_MARKET_DATA: true }
  });
  assert.equal(res.allowed, false);
  assert.equal(res.reason, "notLicensed");
});

test("T10 · bestehende audiences bleiben unveraendert: 'internal' ignoriert Development-Preview-Felder", () => {
  Policy.declare("tiingo", "marketData", {
    developmentPreviewDisplayAllowed: true, developmentPreviewScope: GOLDEN_FIVE,
    basis: "Phase 5", checkedAt: "2026-09-08"
  });
  const res = Policy.check({ providerId: "tiingo", dataClass: "marketData", audience: "internal", form: "raw" });
  assert.equal(res.allowed, true);
  assert.equal(res.audience, "internal");
});
