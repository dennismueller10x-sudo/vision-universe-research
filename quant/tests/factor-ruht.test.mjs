/* Ein Faktor ohne einen einzigen Wert im Produktuniversum ruht (Owner-Entscheidung 13.11.2026, Strang AK; heute: Analysten, 0 von 6.149).
   Die Anzeige folgt den Daten (globalThis.VUFactorCoverage = bandSemantics.universe aus Screening und Shard): kein Wert = keine Zeile,
   Werte da = der Faktor erscheint von selbst wieder. Die Rechnung (Scores, Rang, Engines) bleibt unberuehrt. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const VM = require("../app/view-model.js");
const read = (f) => readFileSync(f, "utf8");

const loadUI = () => require("../../assets/vu-ui.js");
const record = (revisionsState) => ({ state: "AVAILABLE", ticker: "TST", factors: VM.ORDER.map((id) => id === "revisions"
  ? { id, state: revisionsState, reason: "BLOCKED_EXTERNAL", score: revisionsState === "AVAILABLE" ? 80 : null, components: [] }
  : { id, state: "AVAILABLE", score: 60, band: "NEUTRAL", components: [] }) });
const withCoverage = (cov, fn) => { const old = globalThis.VUFactorCoverage; globalThis.VUFactorCoverage = cov; try { return fn(); } finally { globalThis.VUFactorCoverage = old; } };

test("FR-1 · View-Model: Abdeckung 0 blendet Analysten aus Faktoren, Luecken, Zahlwort und Anlagestilen aus", () => {
  withCoverage({ quality: 3811, revisions: 0, risk: 5597 }, () => {
    const vm = VM.stock({ ticker: "TST", factors: record("UNAVAILABLE") });
    assert.deepEqual(vm.factors.map((f) => f.id), ["quality", "growth", "momentum", "value", "profitability", "risk"]);
    assert.ok(!vm.gaps.some((g) => g.ids.includes("revisions")), "keine Luecken-Zeile fuer Analysten");
    assert.equal(VM.nWord(), "sechs");
    assert.ok(!VM.STYLE_ORDER.includes("earnings-revision-leader"));
    assert.equal(VM.styleOpen("earnings-revision-leader"), false);
    assert.equal(VM.styleOpen("garp"), true);
    const row = VM.fromScreeningRow({ "quantV2.factorEvidence.quality": 70 }, null);
    assert.ok(!row.factors.some((f) => f.id === "revisions"));
  });
});

test("FR-2 · Mit Werten (Abdeckung > 0) oder ohne Angabe erscheint der Faktor von selbst wieder", () => {
  for (const cov of [{ revisions: 120 }, null, {}]) withCoverage(cov, () => {
    const vm = VM.stock({ ticker: "TST", factors: record("AVAILABLE") });
    assert.ok(vm.factors.some((f) => f.id === "revisions"), JSON.stringify(cov));
    assert.equal(VM.nWord(), "sieben");
    assert.ok(VM.STYLE_ORDER.includes("earnings-revision-leader"));
  });
});

test("FR-3 · Die Rechnung bleibt: ORDER, Urteil und Stufe sind mit und ohne Anzeige-Filter gleich", () => {
  assert.deepEqual(VM.ORDER, ["quality", "growth", "momentum", "value", "profitability", "revisions", "risk"]);
  const a = withCoverage(null, () => VM.stock({ ticker: "TST", factors: record("UNAVAILABLE") }));
  const b = withCoverage({ revisions: 0 }, () => VM.stock({ ticker: "TST", factors: record("UNAVAILABLE") }));
  assert.equal(a.overall.stufeId ?? a.overall.id, b.overall.stufeId ?? b.overall.id);
  assert.deepEqual(a.factors.filter((f) => f.id !== "revisions").map((f) => [f.id, f.score]), b.factors.map((f) => [f.id, f.score]));
});

test("FR-4 · Profil gross (vu-ui): Zeile fuer einen geschlossenen Faktor entfaellt, sonst sieben", () => {
  const UI = loadUI();
  const vals = { profitability: 50, growth: 50, quality: 50, momentum: 50, value: 50, risk: 50, revisions: null };
  const rows = (cov) => withCoverage(cov, () => (UI.profileFull(vals).match(/data-key="/g) || []).length);
  assert.equal(rows({ revisions: 0 }), 6);
  assert.equal(rows({ revisions: 5 }), 7);
  assert.equal(rows(null), 7);
  assert.equal(withCoverage({ revisions: 0 }, () => UI.PROFILE.open("revisions")), false);
});

test("FR-5 · Der Dienst meldet die Abdeckung aus Screening und Shard; keine feste Faktorliste im Code", () => {
  const ps = read("quant/api/product-services.js");
  assert.match(ps, /function noteCoverage\(p\)\{[^}]*bandSemantics[^}]*VUFactorCoverage/);
  assert.equal((ps.match(/noteCoverage\(/g) || []).length, 3, "Definition, Screening, Shard");
  for (const f of ["quant/app/pages.js", "quant/app/page-method.js", "quant/app/page-tools.js", "quant/app/page-stock.js"]) {
    const src = read(f);
    assert.doesNotMatch(src, /heute keine Daten/, f + ": kein Platzhalter 'heute keine Daten' mehr fuer Analysten");
  }
  assert.match(read("quant/app/page-method.js"), /derzeit ohne Daten, ruht/);
});
