/* =========================================================================
   VIER SACHVERHALTE, VIER SAETZE.

   Der Anlass: 1.199 der 6.875 Titel haben keine Kursstruktur, und alle
   sahen denselben Satz - "Technische Analyse derzeit nicht verfuegbar".
   Gemessen am 25.09.2026 verbergen sich darunter 990 Titel mit zu kurzer
   Historie (COOL: zwanzig Handelstage, notiert seit sechs Wochen), 208 mit
   einem Tag im Auswertungsfenster ohne gesicherte Sitzungsaussage, einer
   ohne Reihe und die Faelle einer angeschlagenen Pruefung.

   Der Grund war vorhanden - in summary.json#rows, 813 KB gross und damit
   fuer eine Aktienseite unbrauchbar. Er steht jetzt im Shard, den die
   Seite fuer genau diesen Titel ohnehin laedt, in einem eigenen Block mit
   eigener Version. Gepruft wird deshalb dreierlei:

     1. der Produzent schreibt den Grund - mit der Zahl, die ihn belegt,
     2. der bestehende Bundle-Vertrag bleibt unberuehrt,
     3. jeder Code, den der Produzent erzeugen kann, hat auf der
        Oberflaeche einen Satz - und kein roher Enum-Wert erscheint.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createRequire } from "node:module";
import { materialize, bundleGate, splitReason, validateTechnicalCalendar } from "../../scripts/technical/materialize-product-intelligence.mjs";

const require = createRequire(import.meta.url);
const Product = require("../engines/technical/product-materialization.js");
const Service = require("../api/product-services.js");
const Policy = require("../engines/display-policy.js");
const Query = require("../engines/query.js");
const root = new URL("../../", import.meta.url).pathname;
/* Der Produzent schreibt 1.1.0: zwei Gruende mehr und ein optionales
   `detail`. Die alte Fassung bleibt lesbar - dafuer steht der eigene Fall
   weiter unten. */
const UNAVAILABLE_SCHEMA = "technical-unavailable-1.1.0";
const UNAVAILABLE_SCHEMA_1_0 = "technical-unavailable-1.0.0";

/* ------------------------------------------------- 1. Der Produzent */

test("a title without a bundle carries its reason, with the number behind it", () => {
  const dir = mkdtempSync(join(tmpdir(), "vu-unavailable-"));
  const work = join(dir, "work", "tiingo", "daily"), out = join(dir, "out");
  mkdirSync(work, { recursive: true });
  /* Dieselbe echte Reihe, auf 60 Handelstage gekuerzt: gueltig in jeder
     Einzelpruefung, zu kurz fuer die Auswertung. Genau der Fall COOL. */
  const quelle = JSON.parse(readFileSync(join(root, "quant/data/market/golden-preview/daily/ref_NVDA.json"), "utf8"));
  quelle.bars = quelle.bars.slice(0, 60);
  quelle.updatedAt = quelle.bars.at(-1).date + "T21:00:00.000Z";
  delete quelle.durableUpdatedAt;
  writeFileSync(join(work, "ref_NVDA.json"), JSON.stringify(quelle));
  const summary = materialize({ workDir: join(dir, "work"), outDir: out, tickers: ["NVDA"] });
  assert.equal(summary.counts.technicalFullBundles, 0);
  assert.equal(summary.rows.NVDA.technical, "INSUFFICIENT_HISTORY");

  const shard = JSON.parse(gunzipSync(readFileSync(join(out, "NV.json.gz"))));
  assert.equal(shard.unavailableSchemaVersion, UNAVAILABLE_SCHEMA);
  assert.deepEqual(shard.unavailable.NVDA, { reason: "INSUFFICIENT_HISTORY", bars: 60, requiredBars: 300, detail: null });
  /* Der bestehende Vertrag bleibt, was er war - der Grund steht NICHT in
     `instruments`, wo ein Leser Bundle-Felder prueft. */
  assert.equal(shard.schemaVersion, Product.VERSION);
  assert.deepEqual(shard.instruments, {});
  assert.equal(Product.validateShard(shard, "NV"), true);
});

test("the reason is never silently dropped: the shard of an unavailable title exists", () => {
  const dir = mkdtempSync(join(tmpdir(), "vu-unavailable-shard-"));
  const work = join(dir, "work", "tiingo", "daily"), out = join(dir, "out");
  mkdirSync(work, { recursive: true });
  /* Kein einziger Titel dieses Shards hat eine Datei. Vorher entstand die
     Datei nur auf dem Erfolgspfad - der Grund hatte keinen Ort. */
  const summary = materialize({ workDir: join(dir, "work"), outDir: out, tickers: ["NVDA", "MSFT"] });
  assert.equal(summary.counts.historiesFound, 0);
  for (const [ticker, shardName] of [["NVDA", "NV"], ["MSFT", "MS"]]) {
    const shard = JSON.parse(gunzipSync(readFileSync(join(out, shardName + ".json.gz"))));
    assert.equal(shard.shard, shardName);
    assert.deepEqual(shard.unavailable[ticker], { reason: "SOURCE_MISSING", bars: null, requiredBars: null, detail: null });
  }
});

/* --------------------------------------------------- 2. Der Leser */

function apiMit(unavailableBlock) {
  const shard = { schemaVersion: Product.VERSION, shard: "CO", generatedAt: "2026-09-25T00:00:00.000Z",
    instruments: {}, ...unavailableBlock };
  return Service.create({
    loadJSON: async (path) => JSON.parse(readFileSync(join(root, path.slice(1)), "utf8")),
    loadCompressedJSON: async (path) => {
      if (path === "/quant/data/product/technical-signals-v1/CO.json.gz") return shard;
      return JSON.parse(gunzipSync(readFileSync(join(root, path.slice(1)))));
    },
    displayPolicy: Policy, queryEngine: Query
  });
}

test("the service hands the surface the reason of exactly this title", async () => {
  const api = apiMit({ unavailableSchemaVersion: UNAVAILABLE_SCHEMA,
    unavailable: { COOL: { reason: "INSUFFICIENT_HISTORY", bars: 20, requiredBars: 300 } } });
  const technical = await api.getTechnicalIntelligence("COOL");
  assert.equal(technical.state, "UNAVAILABLE");
  /* Der bisherige Grund bleibt unveraendert - die Reisemessung liest ihn. */
  assert.equal(technical.reason, "TECHNICAL_EVIDENCE_NOT_PUBLISHED");
  assert.deepEqual(technical.unavailability,
    { reason: "INSUFFICIENT_HISTORY", bars: 20, requiredBars: 300, detail: null, schemaVersion: UNAVAILABLE_SCHEMA });
});

test("an older artifact without the block answers as before, not with a guess", async () => {
  const api = apiMit({});
  const technical = await api.getTechnicalIntelligence("COOL");
  assert.equal(technical.state, "UNAVAILABLE");
  assert.equal(technical.reason, "TECHNICAL_EVIDENCE_NOT_PUBLISHED");
  assert.equal(technical.unavailability, null);
});

test("a demand that does not exceed what is there is withheld instead of contradicting itself", async () => {
  const api = apiMit({ unavailableSchemaVersion: UNAVAILABLE_SCHEMA,
    unavailable: { COOL: { reason: "INSUFFICIENT_HISTORY", bars: 400, requiredBars: 300 } } });
  const technical = await api.getTechnicalIntelligence("COOL");
  assert.equal(technical.unavailability.bars, 400);
  assert.equal(technical.unavailability.requiredBars, null);
});

/* ---------------------------------------------- 3. Die Oberflaeche */

function oberflaeche() {
  const source = readFileSync(join(root, "vu2/experience.js"), "utf8");
  const von = source.indexOf("const TECHNICAL_REASON={");
  const bis = source.indexOf("async function stockPage(", von);
  assert.ok(von > 0 && bis > von, "der Satzbaustein steht nicht mehr in experience.js");
  return new Function(source.slice(von, bis) + "\nreturn { TECHNICAL_REASON, technicalReasonText };")();
}

test("every reason the producer can write has a sentence, and none shows a raw code", () => {
  const { TECHNICAL_REASON, technicalReasonText } = oberflaeche();
  const producer = readFileSync(join(root, "scripts/technical/materialize-product-intelligence.mjs"), "utf8");
  /* Die Codes, die der Produzent je Titel veroeffentlichen kann. Aus der
     Quelle gelesen, damit ein neuer Code ohne Satz auffaellt. */
  const codes = new Set([...producer.matchAll(/throw new Error\("([A-Z_]+)/g)].map((m) => m[1]));
  for (const literal of [...producer.matchAll(/noteUnavailable\(member\.s, "([A-Z_]+)"/g)]) codes.add(literal[1]);
  codes.add("INSUFFICIENT_HISTORY"); codes.add("NOT_TECHNICAL_READY");
  /* Zwei Codes sind keine Titelgruende: SHARD_REOPENED bricht den ganzen
     Lauf ab, NO_IO ist der Riegel eines Ladestummels. */
  codes.delete("SHARD_REOPENED"); codes.delete("NO_IO");
  assert.ok(codes.size >= 7, "zu wenige Codes gefunden: " + [...codes].join(","));
  for (const code of codes) {
    const satz = technicalReasonText({ reason: code, bars: 20, requiredBars: 300 });
    assert.ok(satz, "der Code " + code + " hat keinen Satz auf der Oberflaeche");
    assert.equal(/[A-Z]{2,}_[A-Z]/.test(satz), false, "der Satz zu " + code + " zeigt einen rohen Code: " + satz);
    assert.ok(satz.length > 30 && satz.trim().endsWith("."), "der Satz zu " + code + " ist kein Satz: " + satz);
  }
  /* Der Vertragsfehler kommt mit angehaengtem Grund zurueck und wird auf
     denselben Satz abgebildet. */
  assert.equal(technicalReasonText({ reason: "TECHNICAL_CONTRACT_STALE", bars: null, requiredBars: null }),
    TECHNICAL_REASON.TECHNICAL_PARTIAL({}));
  /* Ein unbekannter Code fuehrt zum alten Satz, nicht zu einer Erfindung. */
  assert.equal(technicalReasonText({ reason: "SOMETHING_NEW", bars: null, requiredBars: null }), null);
  assert.equal(technicalReasonText(null), null);
});

test("the history sentence names both numbers, and holds back the one it lacks", () => {
  const { technicalReasonText } = oberflaeche();
  const mitZahlen = technicalReasonText({ reason: "INSUFFICIENT_HISTORY", bars: 20, requiredBars: 300 });
  assert.match(mitZahlen, /300/);
  assert.match(mitZahlen, /20/);
  const ohneZahlen = technicalReasonText({ reason: "INSUFFICIENT_HISTORY", bars: null, requiredBars: null });
  assert.equal(/\d/.test(ohneZahlen), false, "ohne Zahlen darf keine Zahl im Satz stehen: " + ohneZahlen);
});

/* ------------------------------------------------------------------------
   3. DIE ZAHL ENTSCHEIDET, NICHT DIE VORMERKUNG.

   Der Anlass, gemessen am 26.09.2026: 26 Titel hatten 301 bis 309 Bars und
   bekamen trotzdem kein Bundle. Ihre Vormerkung `t` stammt aus
   technical-coverage-ELIGIBLE_US_EQUITY.json, und der Bericht war vom
   11.09. - dort standen dieselben Titel mit 290 bis 298 Bars unter
   INSUFFICIENT_HISTORY. Die Materialisierung misst die Reihe SELBST und
   gegen dieselbe Schwelle (300); sie liess die aeltere Vormerkung dennoch
   ein Veto sprechen. Folge: jeder Titel, der die Schwelle nach dem
   Berichtsdatum ueberschreitet, bleibt bis zum naechsten Bericht drausen -
   und mit ihm seine Setup-Zeile, denn das Setup-Universum IST das
   technische.

   Was ein Veto behalten muss: Zustaende, die dieser Lauf nicht nachmessen
   kann (TECHNICAL_PARTIAL, TECHNICAL_FAILED). Die Unterscheidung ist der
   ganze Punkt - ein Veto weniger waere Nachlaessigkeit, eines zu viel der
   Rueckstand von oben.
   ------------------------------------------------------------------------ */
test("a stale INSUFFICIENT_HISTORY flag cannot veto a series that now meets the threshold", () => {
  /* Genau die gemessene Lage: Bericht sagt zu kurz, die Reihe ist lang genug. */
  assert.deepEqual(bundleGate("INSUFFICIENT_HISTORY", 301), { ok: true, reason: null, detail: null });
  assert.deepEqual(bundleGate("SOURCE_MISSING", 6000), { ok: true, reason: null, detail: null });
  /* Und der Gegenfall: dieselbe Vormerkung, aber die Reihe ist wirklich zu
     kurz - dann steht der Grund, der die Zahl nennt. */
  assert.deepEqual(bundleGate("INSUFFICIENT_HISTORY", 299), { ok: false, reason: "INSUFFICIENT_HISTORY", detail: null });
});

test("a state this run cannot re-measure keeps its veto, and says which one it was", () => {
  for (const state of ["TECHNICAL_PARTIAL", "TECHNICAL_FAILED", "SOMETHING_NEW"]) {
    const gate = bundleGate(state, 6000);
    assert.equal(gate.ok, false, state + " durfte nicht durchgelassen werden");
    assert.equal(gate.reason, "NOT_TECHNICAL_READY");
    assert.deepEqual(gate.detail, { capabilityState: state });
  }
  assert.equal(bundleGate("TECHNICAL_READY", 6000).ok, true);
});

test("the producer decides with exactly this function, not with a second copy of the rule", () => {
  const producer = readFileSync(join(root, "scripts/technical/materialize-product-intelligence.mjs"), "utf8");
  assert.match(producer, /const gate = bundleGate\(member\.t, input\.series\.length\)/,
    "die Materialisierung benutzt bundleGate nicht - die Regel steht dann zweimal im Haus");
  assert.equal(/member\.t !== "TECHNICAL_READY" \|\|/.test(producer), false,
    "die alte Bedingung steht noch im Aufrufpfad");
});

/* ------------------------------------------------------------------------
   4. EIN KALENDERGRUND, DER SAGT, WAS LOS IST.

   42 Titel standen unter TECHNICAL_CALENDAR_INVALID - ein Satz, der nach
   einem Defekt unseres Kalenders klingt. Gemessen sind es zwei Lagen:
   39 Titel werden so duenn gehandelt, dass ihre letzten 270 Kurstage 1,1
   bis 4,0 Jahre zurueckreichen (AAAP: 67 Bars im Jahr) und damit aus der
   Kalenderdeckung ab 2022-01-01 herauslaufen; 2 Titel tragen eine Bar an
   einem Tag, an dem die Boerse geschlossen war.
   ------------------------------------------------------------------------ */
test("the calendar reason names which of the two situations it is, with the date behind it", () => {
  const holiday = splitReason("TECHNICAL_SESSION_NOT_A_TRADING_DAY:2026-02-16");
  assert.equal(holiday.code, "TECHNICAL_SESSION_NOT_A_TRADING_DAY");
  assert.equal(holiday.detail.nonTradingDay, "2026-02-16");
  assert.equal(holiday.detail.exchange, "XNYS");

  const window = splitReason("TECHNICAL_WINDOW_OUTSIDE_CALENDAR:2021-05-03|2021-05-03|2026-09-25");
  assert.equal(window.code, "TECHNICAL_WINDOW_OUTSIDE_CALENDAR");
  assert.equal(window.detail.uncoveredDate, "2021-05-03");
  assert.equal(window.detail.windowFirst, "2021-05-03");
  assert.equal(window.detail.windowLast, "2026-09-25");
  assert.equal(window.detail.windowSessions, Product.DISPLAY_BARS);
  /* Die Deckungsgrenze kommt aus dem Kalender und nicht aus diesem Test. */
  const calendar = JSON.parse(readFileSync(join(root, "quant/config/market-calendar.json"), "utf8"));
  assert.equal(window.detail.calendarFrom, calendar.coverage.from);

  /* Ein Code ohne Detail bleibt ein Code ohne Detail - nichts wird geraten. */
  assert.deepEqual(splitReason("TECHNICAL_PARTIAL:trend,momentum"), { code: "TECHNICAL_PARTIAL", detail: null });
});

test("the calendar check reaches both verdicts on real series, not just one", () => {
  const calendar = JSON.parse(readFileSync(join(root, "quant/config/market-calendar.json"), "utf8"));
  /* Eine Reihe im gedeckten Zeitraum, alles Handelstage: PASS. */
  const gut = { timestamps: [] };
  for (let d = new Date("2026-01-05T00:00:00Z"); gut.timestamps.length < Product.DISPLAY_BARS; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10), tag = d.getUTCDay();
    if (tag === 0 || tag === 6) continue;
    if ((calendar.exchanges.XNYS.holidays || []).includes(iso)) continue;
    gut.timestamps.push(iso);
  }
  assert.equal(validateTechnicalCalendar(gut).status, "PASS");

  /* Dieselbe Reihe mit einem Feiertag darin: der Tag wird benannt. */
  const feiertag = calendar.exchanges.XNYS.holidays.find((d) => d > "2026-01-05" && d < gut.timestamps.at(-1));
  assert.ok(feiertag, "kein Feiertag im Fenster - dann prueft dieser Fall nichts");
  const mitFeiertag = { timestamps: gut.timestamps.slice(0, -1).concat([feiertag]).sort() };
  assert.throws(() => validateTechnicalCalendar(mitFeiertag),
    (error) => splitReason(error.message).code === "TECHNICAL_SESSION_NOT_A_TRADING_DAY"
      && splitReason(error.message).detail.nonTradingDay === feiertag);

  /* Und ein Fenster, das vor die Deckung reicht - der Fall der duennen Titel. */
  const davor = { timestamps: ["2021-06-01"].concat(gut.timestamps.slice(1)) };
  assert.throws(() => validateTechnicalCalendar(davor),
    (error) => splitReason(error.message).code === "TECHNICAL_WINDOW_OUTSIDE_CALENDAR");
});
