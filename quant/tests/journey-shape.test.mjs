/* =========================================================================
   DIE VERDICHTETE REISE FUER DATENARME TITEL.

   Was hier gehalten wird, ist nicht "die Gruppen sehen gut aus", sondern:

     1. Die Form entsteht aus den GEMESSENEN Zustaenden, nicht aus einem
        Flag - und eine Station, die niemand gefragt hat, ist keine Absage.
     2. Eine Absage weniger heisst nicht eine Aussage weniger: jeder
        zurueckgehaltene Bereich taucht in genau einer Gruppe auf, keiner
        verschwindet.
     3. Kein Code wird still geschluckt, und keine Zahl wird geteilt, die
        zwei verschiedene Mengen zaehlt.
     4. Datenreiche Titel behalten die volle Reise.

   Zu jeder Regel gehoert die Gegenprobe: der Fall, in dem der Test FALLEN
   muss. Ein Test, der nur den guten Fall kennt, haelt nichts.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, "..", "..");
const Shape = require(join(ROOT, "quant/engines/journey-shape.js"));
const Service = require(join(ROOT, "quant/api/product-services.js"));
const Policy = require(join(ROOT, "quant/engines/display-policy.js"));
const Query = require(join(ROOT, "quant/engines/query.js"));

const api = Service.create({
  loadJSON: async (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8")),
  loadCompressedJSON: async (p) => JSON.parse(gunzipSync(readFileSync(join(ROOT, p))).toString("utf8")),
  displayPolicy: Policy, queryEngine: Query
});

/* Ein Titel mit allem, einer mit fast nichts - als Bausteine, damit die
   Faelle lesbar bleiben. */
const voll = (id) => ({ substantive: true });
const leer = (reason, detail) => ({ substantive: false, reason, detail: detail || {} });

test("the shape comes from what is substantive, and two notices still count as a full journey", () => {
  const alleGut = {};
  for (const station of Shape.STATIONS) alleGut[station.id] = voll();
  assert.equal(Shape.assess(alleGut).shape, "FULL");
  assert.equal(Shape.assess(alleGut).noticesAfter, 0);

  /* Zwei Absagen sind Beiwerk - genau die gemessene Grenze. */
  const zweiAbsagen = Object.assign({}, alleGut, {
    patterns: leer("NO_WEEKLY_SERIES"), strategy: leer("NO_EVIDENCE")
  });
  assert.equal(Shape.assess(zweiAbsagen).shape, "FULL");
  /* Die dritte macht die Seite zum Stapel - und damit zur reduzierten Form. */
  const dreiAbsagen = Object.assign({}, zweiAbsagen, { setup: leer("INSUFFICIENT_HISTORY") });
  assert.equal(Shape.assess(dreiAbsagen).shape, "REDUCED");
  assert.equal(Shape.MAX_WITHHELD_IN_FULL, 2);
});

test("a station nobody asked for is not a rejection", () => {
  /* Die Aktienseite traegt acht der elf Stationen. Ohne diese Regel waere
     jede Teilansicht automatisch datenarm - und der Titel bekaeme eine
     Absage fuer etwas, das auf dieser Seite gar nicht vorkommt. */
  const achtGut = {};
  for (const id of ["identity", "chart", "factorStrength", "setup", "setupChange", "patterns", "technical", "business"])
    achtGut[id] = voll();
  const shape = Shape.assess(achtGut);
  assert.equal(shape.shape, "FULL");
  assert.equal(shape.withheldCount, 0);
  assert.equal(shape.substantiveCount, 8);
  /* Gegenprobe: wuerden fehlende Schluessel als Absage zaehlen, stuenden
     hier drei Absagen (change, strategy, assignmentChange). */
  assert.equal(shape.groups.length, 0);
});

test("one cause is explained once, and every withheld area appears in exactly one group", () => {
  const stations = {
    identity: voll(), chart: voll(),
    setup: leer("INSUFFICIENT_HISTORY", { bars: 117, requiredBars: 300 }),
    setupChange: leer("INSUFFICIENT_HISTORY", { bars: 117, requiredBars: 300 }),
    technical: leer("INSUFFICIENT_HISTORY", { bars: 117, requiredBars: 300 }),
    patterns: leer("NO_WEEKLY_SERIES"),
    factorStrength: leer("INPUT_NOT_MATERIALIZED", { available: 0, total: 7 }),
    business: leer("SOURCE_MISSING", { available: 0, total: 16 })
  };
  const shape = Shape.assess(stations);
  assert.equal(shape.shape, "REDUCED");
  assert.equal(shape.noticesBefore, 6);
  assert.equal(shape.noticesAfter, 3, "sechs Absagen, drei Ursachen - mehr Gruppen heisst schlechter verdichtet");

  /* Die Zahl steht im Satz, und sie ist die gemessene. */
  const kurz = shape.groups.find((g) => g.causeId === "SHORT_HISTORY");
  assert.match(kurz.explanation, /117 Handelstage/);
  assert.match(kurz.explanation, /300/);
  assert.equal(kurz.stations.length, 3);

  /* Kein Bereich geht verloren und keiner steht doppelt. */
  const abgedeckt = shape.groups.flatMap((g) => g.stations);
  assert.equal(abgedeckt.length, new Set(abgedeckt).size);
  assert.deepEqual([...abgedeckt].sort(),
    ["business", "factorStrength", "patterns", "setup", "setupChange", "technical"].sort());
});

test("the same code means different things in different places, and the group says the right one", () => {
  /* Gemessen an ACAA und ANV: die Unternehmenszahlen fallen mit
     SOURCE_MISSING aus. Das heisst dort NICHT "keine Kursreihe". */
  const zahlen = Shape.assess({ identity: voll(), chart: voll(), business: leer("SOURCE_MISSING", { available: 0, total: 16 }) });
  assert.equal(zahlen.groups[0].causeId, "NO_FIGURES");
  assert.match(zahlen.groups[0].headline, /Zahlen zum Unternehmen/);

  /* An den Kursstationen heisst derselbe Code genau das. */
  const reihe = Shape.assess({ identity: leer("SOURCE_MISSING"), chart: leer("SOURCE_MISSING"), business: voll() });
  assert.equal(reihe.groups[0].causeId, "NO_SERIES");
  assert.match(reihe.groups[0].headline, /Kursreihe/);
});

test("a missing weekly series does not contradict the daily chart on the same page", () => {
  const shape = Shape.assess({ identity: voll(), chart: voll(), patterns: leer("NO_WEEKLY_SERIES") });
  const group = shape.groups[0];
  assert.equal(group.causeId, "NO_WEEKLY_SERIES");
  assert.match(group.explanation, /Wochenreihe/);
  /* Der Satz muss den sichtbaren Tagesverlauf ausdruecklich ausnehmen -
     sonst liest sich die Seite als widerspraechlich. */
  assert.match(group.explanation, /Tagesverlauf/);
});

test("two different denominators are never merged into one sentence", () => {
  const shape = Shape.assess({
    identity: voll(), chart: voll(),
    factorStrength: leer("INPUT_NOT_MATERIALIZED", { available: 0, total: 7 }),
    business: leer("INPUT_NOT_MATERIALIZED", { available: 0, total: 16 })
  });
  const group = shape.groups.find((g) => g.causeId === "NO_FIGURES");
  assert.equal(group.areas.length, 2);
  /* Der Gruppensatz traegt KEINEN Nenner ... */
  assert.equal(/\b7\b|\b16\b/.test(group.explanation), false,
    "der Gruppensatz nennt einen Nenner, der nur fuer einen der Bereiche gilt");
  /* ... und jeder Bereich traegt seinen eigenen. */
  assert.ok(group.areas.some((a) => a.includes("0 von 7 Werten")));
  assert.ok(group.areas.some((a) => a.includes("0 von 16 Werten")));
});

test("an unknown reason is named rather than swallowed", () => {
  const shape = Shape.assess({ identity: voll(), chart: voll(), setup: leer("EIN_NEUER_GRUND_2027") });
  const group = shape.groups[0];
  assert.equal(group.causeId, "OTHER");
  assert.equal(group.unknownCode, "EIN_NEUER_GRUND_2027");
  assert.match(group.explanation, /EIN_NEUER_GRUND_2027/);
  assert.equal(Shape.knows("EIN_NEUER_GRUND_2027"), false);
});

test("every reason the published artifacts actually carry has a plain-language group", async () => {
  /* Die Liste kommt aus den Artefakten, nicht aus dem Kopf: was ein Shard
     heute als Grund traegt, muss uebersetzt sein. Ein Code, der nur im
     Quelltext steht, faellt hier nicht auf - der naechste Fall darunter
     haelt die Dienstantworten selbst. */
  const gruende = new Set();
  for (const [dir, feld] of [["technical-signals-v1", "unavailable"], ["pattern-match-v1", "unavailable"]]) {
    const pfad = join(ROOT, "quant/data/product", dir);
    for (const datei of readdirSync(pfad).filter((n) => n.endsWith(".json.gz"))) {
      const shard = JSON.parse(gunzipSync(readFileSync(join(pfad, datei))));
      for (const eintrag of Object.values(shard[feld] || {})) {
        const reason = typeof eintrag === "string" ? eintrag : eintrag && eintrag.reason;
        if (reason) gruende.add(reason);
      }
    }
  }
  assert.ok(gruende.size >= 3, "die Artefakte nennen zu wenige Gruende - liest dieser Test noch das Richtige?");
  for (const reason of gruende) {
    assert.equal(Shape.knows(reason), true,
      "der veroeffentlichte Grund " + reason + " hat keine Gruppe in Alltagssprache");
  }
});

test("the measured titles land in the shape their data justifies", async () => {
  const screening = await api.getFactorEvidenceScreening();
  const zeilen = new Map((screening.rows || []).map((r) => [r.ticker, r]));
  async function shapeFor(ticker) {
    const [stock, setup, patterns, technical] = await Promise.all([
      api.getStockIntelligence(ticker), api.getSetupObservation(ticker).catch(() => null),
      api.getPatternMatch(ticker).catch(() => null), api.getTechnicalIntelligence(ticker).catch(() => null)
    ]);
    return Shape.assess(Shape.stationsFrom({
      stock, evidenceRow: zeilen.get(ticker) || null, setup, patterns, technical
    }));
  }
  /* AAPL: alles da - die volle Reise, keine Gruppe. */
  const aapl = await shapeFor("AAPL");
  assert.equal(aapl.shape, "FULL");
  assert.equal(aapl.groups.length, 0);

  /* ACAA: 117 Handelstage, keine Kennzahl - reduziert, und die Zahl steht
     im Satz, nicht im Code. */
  const acaa = await shapeFor("ACAA");
  assert.equal(acaa.shape, "REDUCED");
  assert.ok(acaa.noticesBefore > acaa.noticesAfter,
    "die Verdichtung spart keine einzige Box - dann ist sie keine");
  assert.ok(acaa.groups.some((g) => /117 Handelstage/.test(g.explanation)));

  /* EDVA: kein Kurs, kein Verlauf - das ist keine kurze Reise, sondern eine
     eigene Aussage. */
  const edva = await shapeFor("EDVA");
  assert.equal(edva.shape, "MINIMAL");
  assert.ok(edva.groups.length >= 1);
});

test("the page uses the contract and does not keep a second copy of the rule", () => {
  const seite = readFileSync(join(ROOT, "vu2/experience.js"), "utf8");
  const ohneKommentare = seite.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(ohneKommentare, /VUJourneyShape\.assess\(VUJourneyShape\.stationsFrom\(/);
  /* Die Substanzregeln duerfen NICHT zweimal existieren: eine zweite Kopie
     in der Seite driftet von der Messung weg, und dann zeigt die Seite eine
     andere Form als die Zahl im Bericht behauptet. */
  assert.equal(/function stockStations\(/.test(ohneKommentare), false,
    "die Seite haelt wieder eine eigene Fassung der Substanzregeln");
  /* Und die verdichtete Auskunft muss ueberhaupt gesetzt werden. */
  assert.match(ohneKommentare, /journeyGapSection\(shape/);
  const html = readFileSync(join(ROOT, "vu2/index.html"), "utf8");
  assert.match(html, /engines\/journey-shape\.js/);
});

test("ein zu junger Titel liest an der Faktorstation seine Handelstage", () => {
  /* Die Faktorzeile nennt ihre eigene Grenze; die Reise sagt daraus den Satz
     mit der Zahl statt einer Ablehnung ohne Ursache. */
  const faktoren = [
    { id: "quality", state: "UNAVAILABLE", history: null },
    { id: "momentum", state: "UNAVAILABLE", history: { bars: 187, requiredBars: 273, missingBars: 86 } },
    { id: "risk", state: "UNAVAILABLE", history: { bars: 187, requiredBars: 252, missingBars: 65 } }
  ];
  const stationen = Shape.stationsFrom({ factors: { state: "AVAILABLE", factors: faktoren, change: { items: [] } } });
  assert.equal(stationen.factorStrength.reason, "INSUFFICIENT_HISTORY");
  /* Die naechste Schwelle, nicht die hoechste: 252 erreicht der Titel zuerst. */
  assert.equal(stationen.factorStrength.detail.requiredBars, 252);
  assert.equal(stationen.factorStrength.detail.bars, 187);

  const form = Shape.assess(stationen);
  const gruppe = form.groups.find((g) => g.causeId === "SHORT_HISTORY");
  assert.ok(gruppe, "die Ursachengruppe zur kurzen Historie fehlt");
  assert.match(gruppe.explanation, /187 Handelstage vor, gebraucht werden 252/);
  assert.match(gruppe.outlook, /von selbst/);
});

test("ein Titel mit Faktorwerten behaelt seine gewohnte Begruendung", () => {
  const faktoren = [
    { id: "risk", state: "AVAILABLE", history: null },
    { id: "quality", state: "UNAVAILABLE", history: null }
  ];
  const stationen = Shape.stationsFrom({ factors: { state: "AVAILABLE", factors: faktoren, change: { items: [] } } });
  assert.equal(stationen.factorStrength.substantive, true);
  assert.notEqual(stationen.factorStrength.reason, "INSUFFICIENT_HISTORY");

  /* Und ohne Handelstag-Angabe bleibt es beim alten Grund - es wird keine
     Historienaussage erfunden, wo keine Zahl vorliegt. */
  const ohneZahl = Shape.stationsFrom({ factors: { state: "AVAILABLE",
    factors: [{ id: "risk", state: "UNAVAILABLE", history: null }], change: { items: [] } } });
  assert.equal(ohneZahl.factorStrength.reason, "INPUT_NOT_MATERIALIZED");
});

test("beide Module nennen dieselbe Schwelle", () => {
  /* Zwei Zahlen fuer dieselbe Grenze waeren zwei Antworten: die Faktorzeile
     sagte "252 gebraucht" und die Reise koennte 250 sagen. */
  const FactorEvidence = createRequire(import.meta.url)("../engines/factor-evidence.js");
  assert.equal(Shape.NEXT_PRICE_FACTOR_BARS, FactorEvidence.REQUIRED_BARS.risk);
  assert.ok(FactorEvidence.REQUIRED_BARS.momentum > Shape.NEXT_PRICE_FACTOR_BARS,
    "das Momentumfenster ist das laengere - genannt wird das naechste");
});

test("die Aktienseite nennt die Handelstage aus dem Verzeichnis", () => {
  /* Die Screening-Zeile traegt keine Handelstage; die Zahl kommt vom
     Universumsverzeichnis, das sie aus dem Faktorlauf uebernimmt. */
  const stationen = Shape.stationsFrom({
    stock: { ticker: "JUNG", price: { value: 4.2 }, chart: { state: "AVAILABLE", bars: [1, 2, 3] },
             factorBars: 187, quant: { families: [] } },
    evidenceRow: { ticker: "JUNG", "quantV2.factorEvidence.availableFactors": 0, "quantV2.factorEvidence.risk": null }
  });
  assert.equal(stationen.factorStrength.reason, "INSUFFICIENT_HISTORY");
  assert.equal(stationen.factorStrength.detail.bars, 187);
  assert.equal(stationen.factorStrength.detail.requiredBars, 252);

  /* Ohne die Zahl bleibt es beim alten Grund - nichts wird erfunden. */
  const ohne = Shape.stationsFrom({
    stock: { ticker: "JUNG", price: { value: 4.2 }, chart: { state: "AVAILABLE", bars: [1, 2, 3] },
             quant: { families: [] } },
    evidenceRow: { ticker: "JUNG", "quantV2.factorEvidence.availableFactors": 0, "quantV2.factorEvidence.risk": null }
  });
  assert.equal(ohne.factorStrength.reason, "INPUT_NOT_MATERIALIZED");

  /* Und ein Titel mit Faktorwerten wird nicht zur Historienfrage gemacht,
     auch wenn seine Reihe kurz ist. */
  const mitWert = Shape.stationsFrom({
    stock: { ticker: "KURZ", price: { value: 9 }, chart: { state: "AVAILABLE", bars: [1, 2] },
             factorBars: 120, quant: { families: [] } },
    evidenceRow: { ticker: "KURZ", "quantV2.factorEvidence.availableFactors": 2, "quantV2.factorEvidence.risk": 55, "quantV2.factorEvidence.momentum": 61 }
  });
  assert.equal(mitWert.factorStrength.substantive, true);
  assert.notEqual(mitWert.factorStrength.reason, "INSUFFICIENT_HISTORY");
});
