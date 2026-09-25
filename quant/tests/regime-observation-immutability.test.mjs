/* =========================================================================
   EINEN ANTEIL KANN MAN NICHT ERWEITERN.

   Zwei Waechter derselben Familie sprangen am 25.09.2026 an, nachdem die
   Kalenderdeckung 166 Titeln erstmals ein Technical-Bundle gab:

     Setup-Beobachtung   dieselbe Stichtagsdatei hatte mehr ZEILEN
     Markt-Regime        dieselbe Stichtagsdatei hatte andere ZAHLEN

   Der erste Fall ist eine Erweiterung: jede Zeile ist die Aussage eines
   Titels, es kamen Aussagen hinzu, keine vorhandene aenderte sich. Der
   zweite ist es NICHT: die Aussage ist ein Anteil an einer
   Grundgesamtheit, und eine groessere Grundgesamtheit aendert die Zahl
   selbst.

   Also bleibt die veroeffentlichte Beobachtung stehen, die heutige Messung
   steht im aktuellen Artefakt, und die Abweichung wird benannt - statt den
   ganzen Lauf zu reissen oder, schlimmer, die Vergangenheit zu
   ueberschreiben.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { observationVerdict } from "../../scripts/quant/build-market-regime.mjs";

const root = new URL("../../", import.meta.url).pathname;
const METHODIK = "market-regime-v1.0.0";
const veroeffentlicht = {
  schemaVersion: "market-regime-observation-1.0.0",
  methodologyVersion: METHODIK, asOf: "2026-09-10", regime: "MIXED", universe: 5676,
  shares: [{ id: "above200", share: 0.44, observed: 5676 }], contentHash: "abc123"
};

test("identical content is no divergence and no write", () => {
  assert.equal(observationVerdict(veroeffentlicht,
    { ...veroeffentlicht, contentHash: "abc123" }, 5676), null);
});

test("a larger population keeps the published number and names the difference", () => {
  const verdict = observationVerdict(veroeffentlicht,
    { ...veroeffentlicht, regime: "RISK_ON", universe: 5842, contentHash: "def456" }, 5842);
  assert.equal(verdict.rewritten, false);
  assert.equal(verdict.publishedRegime, "MIXED");
  assert.equal(verdict.publishedUniverse, 5676);
  assert.equal(verdict.measuredNowOver, 5842);
  /* Der Satz sagt, WARUM nicht umgeschrieben wird - nicht nur, dass nicht. */
  assert.match(verdict.note, /Anteil/);
  assert.match(verdict.note, /nicht umgeschrieben/);
});

test("a different methodology under the same date is still fatal", () => {
  /* Zwei Bedeutungen in einer Datei sind kein gewachsener Nenner. */
  assert.throws(() => observationVerdict({ ...veroeffentlicht, methodologyVersion: "market-regime-v0.9.0" },
    { ...veroeffentlicht, contentHash: "def456" }, 5842), /version the observation/);
  assert.throws(() => observationVerdict(null, veroeffentlicht, 5842), /version the observation/);
});

test("the producer writes only when the file does not exist yet", () => {
  const source = readFileSync(new URL("../../scripts/quant/build-market-regime.mjs", import.meta.url), "utf8");
  /* Der Schreibvorgang steht im else-Zweig von existsSync - die
     Verzweigung ist die Garantie, nicht ein Kommentar darueber. */
  const stelle = source.indexOf("if (existsSync(path))");
  assert.ok(stelle > 0, "die Verzweigung auf eine vorhandene Datei ist weg");
  const block = source.slice(stelle, stelle + 600);
  assert.match(block, /observationVerdict\(JSON\.parse\(readFileSync\(path, "utf8"\)\), snapshot, universe\)/);
  assert.match(block, /\} else \{\s*\n\s*writeFileSync\(path,/);
  /* Und die Abweichung landet im ausgelieferten Artefakt, nicht nur im Log. */
  assert.match(source, /payload\.publishedObservation = publishedObservation/);
});

test("the shipped artifact carries the field, so a reader can see it", () => {
  const payload = JSON.parse(readFileSync(root + "quant/data/product/market-regime-v1.json", "utf8"));
  assert.ok("publishedObservation" in payload,
    "das Artefakt fuehrt kein Feld publishedObservation");
  if (payload.publishedObservation) {
    assert.equal(payload.publishedObservation.rewritten, false);
    assert.equal(payload.publishedObservation.asOf, payload.asOf);
  }
});
