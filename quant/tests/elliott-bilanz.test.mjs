// Elliott-Neustart Schritt 4 (Owner 22.11.2026): Prognose-Tagebuch aus der Elliott-Registry.
// Ergebniszahlen sind eine Aussage ueber Performance und erscheinen nur mit Owner-Freigabe (elliott/config/bilanz.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { bilanzOf } from "../../scripts/technical/elliott-home/home.mjs";

const ROOT = join(fileURLToPath(import.meta.url), "../../..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const M = createRequire(import.meta.url)(join(ROOT, "elliott/engine/home-model.js"));

const report = { asOfCompletedWeek: "2026-11-20", events: 10, revisions: 4, horizons: { "STOCK|X|S|UP|3M": { n: 3 } },
  pending: { "STOCK|X|S|UP|3M": { events: 7, firstEvaluableWeek: "2026-12-25" }, "NEW|X|S|DOWN|3M": { events: 2, firstEvaluableWeek: "2027-01-01" }, "STOCK|X|S|UP|12M": { events: 9, firstEvaluableWeek: "2027-09-24" } } };
const head = { seq: 14, hash: "ab".repeat(32) };

test("EB-1 · Bestand und Termine je Horizont, ohne Ergebniszahlen ohne Freigabe", () => {
  const b = bilanzOf({ report, head, since: "2026-09-25", config: { ergebnisseOeffentlich: false } });
  assert.equal(b.events, 10); assert.equal(b.revisions, 4); assert.equal(b.since, "2026-09-25");
  assert.deepEqual(b.horizons, [{ h: "3M", pending: 9, firstEvaluableWeek: "2026-12-25" }, { h: "12M", pending: 9, firstEvaluableWeek: "2027-09-24" }]);
  assert.equal(b.evaluatedGroups, 1);
  assert.equal(b.resultsPublic, false);
  assert.equal(b.results, null, "keine Ergebniszahlen ohne Freigabe");
  assert.equal(bilanzOf({ report, head, config: null }).results, null, "ohne Konfiguration: geschlossen");
  assert.deepEqual(bilanzOf({ report, head, config: { ergebnisseOeffentlich: true } }).results, report.horizons);
  assert.equal(bilanzOf({ report: null, head }), null);
});

test("EB-2 · Freigabe-Schalter steht auf geschlossen; Seite und Adresse vorhanden", () => {
  const cfg = JSON.parse(read("elliott/config/bilanz.json"));
  assert.equal(cfg.ergebnisseOeffentlich, false, "öffentliche Ergebnisse nur mit Owner-Freigabe");
  assert.equal(M.parseHash("#/?bilanz=1").bilanz, true);
  assert.equal(M.buildHash({ bilanz: true }), "#/?bilanz=1");
  assert.equal(M.bilanzOf({ bilanz: { events: 3 } }).events, 3);
  assert.equal(M.bilanzOf({}), null);
  const app = read("elliott/app.js"), js = read("elliott/bilanz.js");
  assert.match(app, /function bilanzView\(host\)/);
  assert.match(app, /sc\.src = "\/elliott\/bilanz\.js\?v=[^"]+"/, "Tagebuch lädt erst mit der Adresse");
  assert.match(js, /Forschung, nicht zertifiziert/);
  assert.doesNotMatch(js.replace(/\/\*[\s\S]*?\*\//g, ""), /Trefferquote|Rendite|Kursziel|Empfehlung für/, "Wortwahl: keine Performance-Aussage");
});
