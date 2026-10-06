/* =========================================================================
   DIE MUSTERLUECKE ERKLAERT SICH SELBST.

   Nach dem Ablage-Abgleich war `patterns` die schwaechste gemessene Station
   der Reise: 100 von 500 Titeln ohne Auskunft, mehr als setup (75),
   technical (74) oder strategy (82). Und die einzige grosse Luecke, deren
   Grund den Leser nie erreichte - `getPatternMatch` antwortete mit
   NOT_COVERED_BY_PATTERN_MATCH und `coverage: null`.

   Vorher zerlegt, dann gebaut. Gemessen am 25.09.2026 ueber 6.875 Titel:

     5.569  mit Eintrag
       737  Wochenreihe kuerzer als die vorregistrierten 104 Wochen
             (276 mit 26-51, 267 mit 52-77, 194 mit 78-103)
       567  gar keine Wochenreihe
         2  keine messbaren Merkmale
     ------
     6.875  vollstaendig, kein unerklaerter Rest

   Die Luecke enthaelt keinen Defekt: die 104 Wochen sind die Anforderung der
   Studie. Was fehlte, war der Satz. Sechs Titel stehen bei genau 103 Wochen -
   fuer die ist "eine Woche fehlt noch" die wahre Auskunft.

   Frontend-Rebuild (quant/app): Prüfintention erhalten – PATTERN_REASON und
   patternReasonText sind aus vu2/experience.js (geloescht) nach
   quant/app/view-model.js gewandert und werden per require() geprueft. Die
   zwei Musterflaechen der alten Seite (patternMatchSection,
   evidenceTrustSection) heissen auf der neuen Aktienseite "Was geschah
   frueher? - Ähnliche Situationen im gesamten Markt" (VM.replayView) und
   "Daten und Grenzen" (page-stock.js); beide muessen den Grund nennen.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = new URL("../../", import.meta.url).pathname;
const Service = require(join(root, "quant/api/product-services.js"));
const Policy = require(join(root, "quant/engines/display-policy.js"));
const Query = require(join(root, "quant/engines/query.js"));
const SCHEMA = "pattern-unavailable-1.0.0";
const methodology = JSON.parse(readFileSync(join(root, "quant/methodology/pattern-research-v1.json"), "utf8"));
const REQUIRED = methodology.observationGrid.minimumHistoryWeeks;

const api = Service.create({
  loadJSON: async (path) => JSON.parse(readFileSync(join(root, path.slice(1)), "utf8")),
  loadCompressedJSON: async (path) => JSON.parse(gunzipSync(readFileSync(join(root, path.slice(1))))),
  displayPolicy: Policy, queryEngine: Query
});

/* ------------------------------------------- 1. Der Produzent zaehlt alles */

test("every title of the universe either has an entry or a named reason", () => {
  const summary = JSON.parse(readFileSync(join(root, "quant/data/product/pattern-match-v1/summary.json"), "utf8"));
  if (!summary.unavailable) return;   /* Vor dem naechsten Lauf fehlt der Block. */
  const universe = JSON.parse(readFileSync(join(root, "quant/data/universe/market-capability.json"), "utf8"));
  assert.equal(summary.unavailableSchemaVersion, SCHEMA);
  assert.equal(summary.instruments + summary.unavailable.total, universe.members.length,
    "Eintraege plus Gruende ergeben nicht das Universum - es bleibt ein unerklaerter Rest");
  assert.equal(summary.unavailable.requiredWeeks, REQUIRED);
  /* Die Gruende summieren sich auf die Gesamtzahl. */
  const summe = Object.values(summary.unavailable.reasons).reduce((a, b) => a + b, 0);
  assert.equal(summe, summary.unavailable.total);
  /* Und sie sagen, dass es eine Datengrenze ist und kein Fehlschlag. */
  assert.match(summary.unavailable.note, /Datengrenze/);
});

test("the reason rides in the shard the page loads for that title", () => {
  const summary = JSON.parse(readFileSync(join(root, "quant/data/product/pattern-match-v1/summary.json"), "utf8"));
  if (!summary.unavailable) return;
  /* Stichprobe ueber die Shards: jeder Grund-Eintrag traegt seinen Code, und
     eine zu kurze Reihe traegt ihre Wochen samt Anforderung. */
  let geprueft = 0, mitWochen = 0;
  for (const shard of summary.shards.slice(0, 40)) {
    const file = join(root, "quant/data/product/pattern-match-v1/" + shard + ".json.gz");
    if (!existsSync(file)) continue;
    const payload = JSON.parse(gunzipSync(readFileSync(file)));
    assert.equal(payload.unavailableSchemaVersion, SCHEMA, shard);
    /* Der bestehende Vertrag bleibt: der Grund steht NICHT in instruments. */
    for (const instrument of Object.values(payload.instruments || {})) {
      assert.equal("reason" in instrument, false, shard + ": ein Grund steht in instruments");
    }
    for (const [ticker, entry] of Object.entries(payload.unavailable || {})) {
      geprueft += 1;
      assert.match(entry.reason, /^[A-Z_]+$/, ticker);
      assert.equal(ticker in (payload.instruments || {}), false,
        ticker + " hat einen Eintrag UND einen Grund");
      if (entry.reason === "INSUFFICIENT_WEEKLY_HISTORY") {
        mitWochen += 1;
        assert.ok(Number.isFinite(entry.weeks) && entry.weeks < REQUIRED, ticker + ": " + entry.weeks);
        assert.equal(entry.requiredWeeks, REQUIRED, ticker);
      }
    }
  }
  assert.ok(geprueft > 20, "zu wenige Grund-Eintraege geprueft: " + geprueft);
  assert.ok(mitWochen > 0, "kein Titel mit zu kurzer Reihe in der Stichprobe");
});

/* ---------------------------------------------------- 2. Dienst und Sprache */

test("the service hands the surface the reason, and holds back a demand that is no demand", async () => {
  const summary = JSON.parse(readFileSync(join(root, "quant/data/product/pattern-match-v1/summary.json"), "utf8"));
  if (!summary.unavailable) return;
  /* Ein Titel mit zu kurzer Reihe, aus dem Artefakt gesucht statt geraten. */
  let kurz = null, ohne = null;
  for (const shard of summary.shards) {
    const file = join(root, "quant/data/product/pattern-match-v1/" + shard + ".json.gz");
    if (!existsSync(file)) continue;
    const payload = JSON.parse(gunzipSync(readFileSync(file)));
    for (const [ticker, entry] of Object.entries(payload.unavailable || {})) {
      if (!kurz && entry.reason === "INSUFFICIENT_WEEKLY_HISTORY") kurz = ticker;
      if (!ohne && entry.reason === "NO_WEEKLY_SERIES") ohne = ticker;
    }
    if (kurz && ohne) break;
  }
  assert.ok(kurz && ohne, "das Artefakt fuehrt nicht beide Gruende");

  const mitZahl = await api.getPatternMatch(kurz);
  assert.equal(mitZahl.state, "UNAVAILABLE");
  assert.equal(mitZahl.reason, "NOT_COVERED_BY_PATTERN_MATCH");
  assert.equal(mitZahl.unavailability.reason, "INSUFFICIENT_WEEKLY_HISTORY");
  assert.equal(mitZahl.unavailability.requiredWeeks, REQUIRED);
  assert.ok(mitZahl.unavailability.weeks < REQUIRED);

  const ohneReihe = await api.getPatternMatch(ohne);
  assert.equal(ohneReihe.unavailability.reason, "NO_WEEKLY_SERIES");
  assert.equal(ohneReihe.unavailability.weeks, null);
  assert.equal(ohneReihe.unavailability.requiredWeeks, null,
    "ohne Reihe gibt es keine sinnvolle Wochenforderung");

  /* Ein gedeckter Titel traegt keinen Grund - sonst waere die Auskunft doppelt. */
  const gedeckt = await api.getPatternMatch("NVDA");
  if (gedeckt.state === "AVAILABLE") assert.equal(gedeckt.unavailability ?? null, null);
});

test("the setup gap borrows the technical reason instead of inventing a second one", async () => {
  /* Die Setup-Beobachtung ist eine Projektion ueber die technischen Bundles.
     Fehlt der Titel dort, ist die Ursache dieselbe - und der Leser soll nicht
     zwei Saetze fuer eine Ursache bekommen. */
  const setup = await api.getSetupObservation("COOL");
  if (setup.state === "AVAILABLE") return;
  assert.equal(setup.reason, "NOT_COVERED_BY_SETUP_OBSERVATION");

  /* WARUM HIER KEINE FESTE FASSUNG MEHR STEHT.
   *
   * Vorher pinnte diese Zeile "technical-unavailable-1.0.0". Der Produzent
   * schreibt seit dem 26.09.2026 1.1.0 (zwei Gruende mehr, ein optionales
   * `detail`), und der Test wurde rot, weil das Artefakt BESSER wurde -
   * gemessen im Lauf 36224444673, wo alle Materialisierungsschritte gruen
   * waren und nur diese Zusicherung fiel. Eine Zusicherung, die eine
   * Versionserhoehung verbietet, prueft ihr Geburtsdatum.
   *
   * Der Vertrag ist ein anderer: was der Produzent schreibt, muss der Leser
   * AKZEPTIEREN. Deshalb wird der Shard direkt gelesen - gibt es dort einen
   * Grundblock, darf der Dienst ihn nicht verschweigen. Genau das wuerde
   * eine unbekannte Fassung tun, und zwar still. */
  const shard = JSON.parse(gunzipSync(readFileSync(
    join(root, "quant/data/product/technical-signals-v1/CO.json.gz"))));
  const blockVorhanden = !!(shard.unavailable && shard.unavailable.COOL && shard.unavailable.COOL.reason);
  if (!blockVorhanden) return;   /* aelteres Technical-Artefakt ohne Grundblock */
  assert.ok(setup.unavailability,
    "der Shard traegt einen Grund, der Dienst gibt ihn nicht weiter - die Fassung "
    + shard.unavailableSchemaVersion + " kennt er nicht");
  assert.equal(setup.unavailability.schemaVersion, shard.unavailableSchemaVersion);
  assert.match(setup.unavailability.schemaVersion, /^technical-unavailable-1\.\d+\.0$/);
  const technical = await api.getTechnicalIntelligence("COOL");
  assert.deepEqual(setup.unavailability, technical.unavailability,
    "Setup und Kursstruktur nennen verschiedene Gruende fuer dieselbe Ursache");
});

/* ------------------------------------------------------- 3. Die Oberflaeche */

const VM = require(join(root, "quant/app/view-model.js"));
function surface() {
  /* Vorher als Ausschnitt aus vu2/experience.js gebaut; jetzt das UMD-Modul
     der neuen Oberflaeche mit denselben zwei Namen. */
  assert.equal(typeof VM.patternReasonText, "function", "view-model.js exportiert patternReasonText nicht");
  assert.ok(VM.PATTERN_REASON, "view-model.js exportiert PATTERN_REASON nicht");
  return { PATTERN_REASON: VM.PATTERN_REASON, patternReasonText: VM.patternReasonText };
}

test("every reason the producer can write has a sentence, and none shows a raw code", () => {
  const { patternReasonText } = surface();
  const producer = readFileSync(join(root, "scripts/quant/build-pattern-match.mjs"), "utf8");
  const codes = new Set([...producer.matchAll(/noteUnavailable\([^,]+, "([A-Z_]+)"/g)].map((m) => m[1]));
  assert.ok(codes.size >= 4, "zu wenige Codes gefunden: " + [...codes].join(","));
  for (const code of codes) {
    const satz = patternReasonText({ reason: code, weeks: 71, requiredWeeks: REQUIRED });
    assert.ok(satz, "der Code " + code + " hat keinen Satz");
    assert.equal(/[A-Z]{2,}_[A-Z]/.test(satz), false, "roher Code im Satz zu " + code + ": " + satz);
    assert.ok(satz.trim().endsWith("."), "kein Satz zu " + code + ": " + satz);
  }
  /* Unbekannt fuehrt zum alten Hinweis, nicht zu einer Erfindung. */
  assert.equal(patternReasonText({ reason: "SOMETHING_NEW" }), null);
  assert.equal(patternReasonText(null), null);
});

test("the history sentence names both numbers and holds back what it lacks", () => {
  const { patternReasonText } = surface();
  const mit = patternReasonText({ reason: "INSUFFICIENT_WEEKLY_HISTORY", weeks: 103, requiredWeeks: 104 });
  assert.match(mit, /104/);
  assert.match(mit, /103/);
  const ohne = patternReasonText({ reason: "INSUFFICIENT_WEEKLY_HISTORY", weeks: null, requiredWeeks: null });
  assert.equal(/\d/.test(ohne), false, "ohne Zahlen darf keine Zahl im Satz stehen: " + ohne);
});

test("both pattern surfaces say it, not just one", () => {
  /* Die Belastbarkeitsstation liest dasselbe Artefakt. Stand der Grund nur an
     der einen Stelle, widersprachen sich zwei Abschnitte derselben Seite.

     Neue Oberflaeche, zwei Stellen:
       1. "Daten und Grenzen" (page-stock.js) - Aufruf im Quelltext,
       2. die Marktmuster-Ebene von Historical Replay (VM.replayView) - als
          Verhalten: fehlt das Muster mit belegtem Grund, nennt die Ebene
          diesen Grund und nicht den Pauschalsatz "trifft kein Muster zu".
          "Kein Muster trifft zu" und "nicht messbar, 103 von 104 Wochen"
          sind zwei verschiedene Auskuenfte. */
  const seite = readFileSync(join(root, "quant/app/page-stock.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const stellen = [...seite.matchAll(/VM\.patternReasonText\(patterns(?:\s*&&\s*patterns)?\.unavailability\)/g)];
  assert.ok(stellen.length >= 1, "Daten und Grenzen nennt den Grund der Musterluecke nicht");

  const unavailability = { reason: "INSUFFICIENT_WEEKLY_HISTORY", weeks: 103, requiredWeeks: REQUIRED, schemaVersion: SCHEMA };
  const erwartet = VM.patternReasonText(unavailability);
  const replay = VM.replayView(null, { pattern: { state: "UNAVAILABLE" } }, { state: "UNAVAILABLE", unavailability });
  const markt = replay.levels.find((l) => l.id === "MARKET_WIDE");
  assert.ok(markt, "die Marktmuster-Ebene fehlt");
  assert.equal(markt.state, "UNAVAILABLE");
  assert.ok(markt.text.includes(erwartet),
    "die Marktmuster-Ebene nennt den Grund nicht, den \"Daten und Grenzen\" nennt: " + markt.text);
});
