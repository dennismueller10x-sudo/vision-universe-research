/* Empfehlungs-Vertrag: deterministisch aus Geraetesignalen, jede Flaeche
   mit Grund und Quelle, keine Behauptung ohne Signal. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const R = require("../engines/recommendation.js");

const catalog = {
  next: { NVDA: { similar: { rule: "kleinster Abstand", cards: [{ symbol: "AMD" }, { symbol: "AVGO" }, { symbol: "NVDA" }, { symbol: "MU" }] } } },
  rows: { "umsatz-waechst-stark": { title: "UMSATZ WÄCHST STARK", cards: [{ symbol: "PLTR" }, { symbol: "AMD" }, { symbol: "NVDA" }] } }
};

test("RC1 · Ohne Signale keine Flaechen - und ein gueltiger, leerer Vertrag", () => {
  const r = R.recommend({}, catalog);
  assert.equal(r.basis, "device"); assert.deepEqual(r.surfaces, []);
  assert.ok(R.validate(r).ok);
});

test("RC2 · Weil du NVIDIA angesehen hast: Nachbarn ohne die schon gesehenen Titel", () => {
  const r = R.recommend({ recent: [{ symbol: "NVDA", universeId: "US_REAL", companyName: "NVIDIA" }] }, catalog);
  const weil = r.surfaces.find((s) => s.kind === "because_you_viewed");
  assert.ok(weil); assert.match(weil.title, /NVIDIA/);
  assert.deepEqual(weil.symbols, ["AMD", "AVGO", "MU"], "NVDA selbst faellt heraus");
  assert.equal(weil.from.basis, "device"); assert.ok(weil.reason.length > 10);
  const weiter = r.surfaces.find((s) => s.kind === "continue_discovering");
  assert.deepEqual(weiter.symbols, ["NVDA"]);
  assert.ok(R.validate(r).ok);
});

test("RC3 · Mehr aus deinen Sammlungen: die meistgeoeffnete Reihe, deterministisch", () => {
  const signals = { recent: [{ symbol: "NVDA" }], collections: { "umsatz-waechst-stark": 3, "unbekannt": 9 } };
  const a = R.recommend(signals, catalog), b = R.recommend(JSON.parse(JSON.stringify(signals)), catalog);
  assert.deepEqual(a, b);
  const mehr = a.surfaces.find((s) => s.kind === "more_from_your_collections");
  assert.ok(mehr, "eine unbekannte Reihe zaehlt nicht"); assert.deepEqual(mehr.symbols, ["PLTR", "AMD"]);
});

test("RC4 · Der Vertrag lehnt fremde Arten und leere Flaechen ab", () => {
  const schlecht = { version: R.CONTRACT_VERSION, basis: "server", surfaces: [{ kind: "magic", title: "x", reason: "", from: {}, symbols: [] }] };
  const v = R.validate(schlecht);
  assert.ok(!v.ok); assert.ok(v.findings.includes("basis")); assert.ok(v.findings.some((f) => f.endsWith(".kind")));
});
