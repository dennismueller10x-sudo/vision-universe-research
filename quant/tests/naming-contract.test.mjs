/* =========================================================================
   EIN NAME IST EINE IDENTITÄTSAUSSAGE.

   Gemessen am 26.09.2026: bei 4.719 von 5.984 Titeln nannte die Übersicht
   einen anderen Namen als die Aktienseite. Die meisten Unterschiede waren
   kosmetisch („Apple Inc." / „Apple"). Einer war es nicht:

       AACI    Liste  „Armada Acquisition Corp. III"
               Seite  „Armada Acquisition Corp I"

   Das sind zwei Gesellschaften. Eine Quellenrangfolge („die Liste gewinnt")
   hätte in der Hälfte der Fälle die falsche angezeigt — mit derselben
   Sicherheit vorgetragen.

   Gehalten wird deshalb nicht eine Rangfolge, sondern der Vertrag:
     1. Drei Ebenen, und Emittentenname und Wertpapiername werden nicht
        vermischt.
     2. Die Art einer Abweichung wird klassifiziert; D, F und G berühren die
        Identität, C nicht.
     3. Ein Konflikt wird festgehalten, nie still überschrieben.
     4. Liste und Aktienseite nennen denselben Namen, wenn sie dieselbe
        Wertpapierzeile meinen.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, "..", "..");
const Naming = require(join(ROOT, "quant/engines/company-naming-contract.js"));
const Service = require(join(ROOT, "quant/api/product-services.js"));
const Policy = require(join(ROOT, "quant/engines/display-policy.js"));
const Query = require(join(ROOT, "quant/engines/query.js"));

const api = Service.create({
  loadJSON: async (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8")),
  loadCompressedJSON: async (p) => JSON.parse(gunzipSync(readFileSync(join(ROOT, p))).toString("utf8")),
  displayPolicy: Policy, queryEngine: Query
});

test("der Vertrag trennt die drei Ebenen und ordnet jeder Quelle eine zu", () => {
  assert.equal(Naming.CONTRACT_VERSION, "company-naming-1.0.0");
  assert.deepEqual(Naming.LEVELS, ["ISSUER_LEGAL_NAME", "SECURITY_DISPLAY_NAME", "PRODUCT_DISPLAY_NAME"]);
  /* Das SEC-Kuerzelverzeichnis bildet CIK -> Name ab, also den EMITTENTEN.
     Die Anbietermetadaten haengen am Kuerzel, also an der ZEILE. Wer das
     vermischt, verliert die Aktienklasse oder behauptet, die Gesellschaft
     heisse nach einer ihrer Klassen. */
  assert.equal(Naming.levelOfSource("SEC_COMPANY_TICKERS"), "ISSUER_LEGAL_NAME");
  assert.equal(Naming.levelOfSource("TIINGO_METADATA"), "SECURITY_DISPLAY_NAME");
  assert.equal(Naming.levelOfSource("VU_CURATED"), "PRODUCT_DISPLAY_NAME");
  /* Jede Quelle, die der Wertpapierstamm benutzt, hat eine Ebene. */
  for (const quelle of ["sec:company_tickers", "discover/config/company-names.json",
    "dashboard/config/universe.json", "quant/data/sec/inspector_index.json"]) {
    assert.ok(Naming.levelOfSource(quelle), "Quelle ohne Ebene: " + quelle);
  }
});

test("AACI: Armada I gegen Armada III ist ein Identitätskonflikt, keine Schreibweise", () => {
  const v = Naming.classifyDeviation("Armada Acquisition Corp. III", "Armada Acquisition Corp I",
    { join: "TICKER+EXCHANGE" });
  assert.equal(v.kind, "D");
  assert.equal(v.identityConflict, true);
  assert.match(v.evidence, /Zahlwoerter/);
  /* Und die Richtung spielt keine Rolle. */
  const rueck = Naming.classifyDeviation("Armada Acquisition Corp I", "Armada Acquisition Corp. III",
    { join: "TICKER+EXCHANGE" });
  assert.equal(rueck.kind, "D");
  assert.equal(rueck.identityConflict, true);
  /* Der Vertrag waehlt dabei NICHT: der Konflikt steht im Ergebnis. */
  const aufgeloest = Naming.resolve({ ticker: "AACI",
    issuerName: "Armada Acquisition Corp. III", issuerSource: "SEC_COMPANY_TICKERS",
    securityName: "Armada Acquisition Corp I", securitySource: "TIINGO_METADATA",
    evidence: { join: "TICKER+EXCHANGE" } });
  assert.equal(aufgeloest.identityConflict, true);
  assert.equal(aufgeloest.candidates.length, 2, "ein Kandidat wurde verschluckt");
});

test("kosmetisch bleibt kosmetisch, und eine Klasse ist kein Konflikt", () => {
  const faelle = [
    ["Alcoa Corp", "Alcoa", "A"],
    ["Apple Inc.", "Apple", "A"],
    ["JPMorgan Chase & Co.", "JPMorgan Chase & Company", "A"],
    ["ALLIANCEBERNSTEIN HOLDING L.P.", "AllianceBernstein Holding Lp", "IDENTICAL"],
    ["Incyte Corp", "Incyte", "A"],
    ["ABM INDUSTRIES INC /DE/", "ABM Industries Inc", "B"],
    ["Alphabet Inc.", "Alphabet Inc. Class A", "C"]
  ];
  for (const [a, b, erwartet] of faelle) {
    const v = Naming.classifyDeviation(a, b);
    assert.equal(v.kind, erwartet, "\"" + a + "\" / \"" + b + "\" -> " + v.kind + " (" + v.evidence + ")");
    assert.equal(v.identityConflict, false, "\"" + a + "\" / \"" + b + "\" gilt als Konflikt");
  }
  /* Zwei VERSCHIEDENE Klassen sind einer. */
  const klassen = Naming.classifyDeviation("Alphabet Inc. Class A", "Alphabet Inc. Class C");
  assert.equal(klassen.kind, "F");
  assert.equal(klassen.identityConflict, true);
  /* Und zwei verschiedene Gesellschaften ohne gemeinsames Wort auch. */
  const fremd = Naming.classifyDeviation("Berkshire Hathaway Inc", "Berkshire Hills Bancorp");
  assert.equal(fremd.identityConflict, true);
});

test("ein fehlender Name ist keine unklare Identität", () => {
  const v = Naming.classifyDeviation("Apple Inc.", null);
  assert.equal(v.kind, "MISSING_ON_ONE_SIDE");
  assert.equal(v.identityConflict, false,
    "ein fehlender Name verlangt keine Identitaetspruefung - er verlangt einen Namen");
});

test("die Partition addiert sich, und ihre Konflikte sind genau D, F und G", () => {
  const pfad = join(ROOT, "quant/data/product/naming-contract-v1.json");
  if (!existsSync(pfad)) return;
  const b = JSON.parse(readFileSync(pfad, "utf8"));
  assert.equal(b.contractVersion, Naming.CONTRACT_VERSION);
  const c = b.partitionCounts;
  assert.deepEqual(Object.keys(c).sort(), ["A", "B", "C", "D", "E", "F", "G"]);
  const summe = Object.values(c).reduce((n, v) => n + v, 0);
  assert.equal(summe, b.deviatingAcrossLevels,
    "die sieben Gruppen (" + summe + ") ergeben nicht die Abweichungen (" + b.deviatingAcrossLevels + ")");
  assert.equal(c.D + c.F + c.G, b.IDENTITY_CONFLICT_COUNT,
    "D+F+G (" + (c.D + c.F + c.G) + ") ist nicht die Zahl der Konflikte (" + b.IDENTITY_CONFLICT_COUNT + ")");
  /* Gleichheit und fehlende Namen stehen AUSSERHALB der Partition - sonst
     waere die kosmetische Gruppe beliebig gross. */
  assert.ok(b.identicalAcrossLevels > b.deviatingAcrossLevels * 0.5,
    "nur " + b.identicalAcrossLevels + " identische Paare - die Partition zaehlt Gleichheit mit");
  assert.equal(typeof b.nameMissingOnOneLevel, "number");
  /* Jeder Konflikt traegt beide Namen und seine Herkunft. */
  for (const k of b.identityConflicts.slice(0, 30)) {
    assert.ok(k.issuerName && k.securityName, k.ticker + ": Konflikt ohne beide Namen");
    assert.ok(["D", "F", "G"].includes(k.kind), k.ticker + ": Konfliktart " + k.kind);
    assert.ok(Array.isArray(k.sources) && k.sources.length >= 2, k.ticker + ": Konflikt ohne Quellenangaben");
    for (const q of k.sources) {
      assert.ok(q.source && q.level, k.ticker + ": Quelle ohne Ebene");
      assert.equal(typeof q.issuerLevel, "boolean");
    }
  }
  /* Und der Regressionsfall steht namentlich drin. */
  assert.equal(b.regressionCase.found, true, "AACI ist nicht als Konflikt erkannt");
  assert.equal(b.regressionCase.detail.kind, "D");
});

test("E wird nicht behauptet, wo der Beleg fehlt", () => {
  /* Umbenennung und Kuerzelwiederverwendung sehen lokal gleich aus:
       AAMI  "BrightSphere Investment Group" -> "Acadian Asset Management"  (Umbenennung)
       AEC   "Associated Estates Realty"     -> "Anfield Energy"            (anderes Unternehmen)
     Beide mit derselben Verknuepfungsart, derselben Struktur, demselben
     Stichtag. Also wird keine von beiden behauptet. */
  const ohneBeleg = Naming.classifyDeviation("Acadian Asset Management Inc.", "BrightSphere Investment Group Inc",
    { join: "TICKER+EXCHANGE" });
  assert.equal(ohneBeleg.kind, "G");
  assert.equal(ohneBeleg.identityConflict, true);
  /* MIT Beleg - dieselbe CIK auf beiden Seiten - ist es eine Fortfuehrung. */
  const mitBeleg = Naming.classifyDeviation("Acadian Asset Management Inc.", "BrightSphere Investment Group Inc",
    { join: "TICKER+EXCHANGE", issuerCik: "0001748824", securityCik: "0001748824" });
  assert.equal(mitBeleg.kind, "E");
  const pfad = join(ROOT, "quant/data/product/naming-contract-v1.json");
  if (existsSync(pfad)) {
    const b = JSON.parse(readFileSync(pfad, "utf8"));
    assert.equal(b.partitionCounts.E, 0,
      "E ist besetzt, obwohl keine Quelle eine CIK auf der Wertpapierebene fuehrt");
  }
});

test("Liste und Aktienseite nennen denselben Namen", async () => {
  /* Die Ursache war eine Zeile: der Konsum-Export hat den Namen des
     Wertpapierstamms ueberschrieben. Gemessen 4.719 Abweichungen. */
  const universe = await api.getUniverse();

  /* ZUERST eine Feststellung ueber diesen Test selbst, damit die naechste
     Leserin ihm nicht mehr glaubt als er hergibt. Uebersicht und Aktienseite
     beziehen ihren Namen inzwischen aus DERSELBEN Zeile des Verzeichnisses.
     Ein Vergleich `Zeile.name` gegen `Seite.name` kann deshalb keinen Fehler
     dieser einen Zeile finden: eine eingebaute Sabotage ("Sabotage AG" statt
     "Apple Inc.") erschien gemessen auf BEIDEN Flaechen gleichzeitig, und der
     Vergleich der Flaechen gegeneinander waere gruen geblieben.
     Verglichen wird deshalb gegen das veroeffentlichte Verzeichnis - die
     einzige hier unabhaengige Quelle. */
  const verzeichnis = JSON.parse(gunzipSync(
    readFileSync(join(ROOT, "quant/data/product/universe-list-v1.json.gz"))).toString("utf8"));
  const erwartet = new Map((verzeichnis.entries || []).filter((e) => e.n).map((e) => [e.s, e.n]));
  assert.ok(erwartet.size > 6000, "das Verzeichnis traegt zu wenige Namen fuer diese Pruefung");

  /* JEDER Titel, nicht eine Stichprobe. In M40 hat eine 20er-Stichprobe
     einen Fehler uebersehen, der 743 Titel betraf. */
  const abweichungen = [];
  const ohneNamen = [];
  for (const zeile of universe.stocks) {
    const seite = await api.getStockIntelligence(zeile.ticker);
    if (!seite || seite.state !== "AVAILABLE") continue;
    if (!zeile.name || !seite.name) {
      ohneNamen.push({ ticker: zeile.ticker, listReason: zeile.nameReason || null, pageReason: seite.nameReason || null });
      continue;
    }
    const quelle = erwartet.get(zeile.ticker);
    if (!quelle) continue;
    if (zeile.name !== quelle) {
      abweichungen.push("Liste " + zeile.ticker + ": \"" + zeile.name + "\" statt \"" + quelle + "\"");
    }
    if (seite.name !== quelle) {
      abweichungen.push("Seite " + zeile.ticker + ": \"" + seite.name + "\" statt \"" + quelle + "\"");
    }
  }
  assert.deepEqual(abweichungen.slice(0, 20), [],
    "Liste oder Aktienseite weicht vom Verzeichnis ab (" + abweichungen.length + " Faelle)");
  /* EIN FEHLENDER NAME IST ERLAUBT - EIN KUERZEL ALS NAME NICHT.
     Seit dem 28.09.2026 liefert der Dienst fuer einen Titel ohne
     Anbieternamen `name = null` und einen Grund, statt sein Kuerzel als
     Firmennamen auszugeben ("BNRG hiess BNRG"). Was hier geprueft wird: die
     Luecke ist begruendet, sie ist nicht groesser als die Namensschicht
     zugibt, und niemand sieht sein Kuerzel zweimal. */
  for (const l of ohneNamen) {
    assert.equal(l.listReason, "PROVIDER_HAS_NO_NAME", l.ticker + " hat keinen Namen und keinen Grund");
    assert.equal(l.pageReason, "PROVIDER_HAS_NO_NAME", l.ticker + " hat auf der Seite keinen Grund");
  }
  const schicht = JSON.parse(readFileSync(join(ROOT, "quant/data/market/security-master/company-names.json"), "utf8"));
  const unaufgeloest = (schicht.rows || []).filter((r) => r.inProductUniverse && r.status === "UNRESOLVED").length;
  assert.ok(ohneNamen.length <= unaufgeloest,
    ohneNamen.length + " Titel ohne Namen, aber die Namensschicht kennt nur " + unaufgeloest + " unaufgeloeste");
  assert.equal(universe.stocks.filter((s) => s.name === s.ticker).length, 0,
    "ein Titel traegt sein Kuerzel als Firmennamen");
  assert.ok(universe.stocks.length > 6000, "das Universum ist zu klein fuer diese Pruefung");
  /* Und die Klasse bleibt unterscheidbar - der Emittentenname wuerde sie
     wegwerfen. */
  const goog = await api.getStockIntelligence("GOOG");
  const googl = await api.getStockIntelligence("GOOGL");
  assert.notEqual(goog.name, googl.name, "zwei Klassen desselben Emittenten tragen denselben Namen");
  assert.match(googl.name, /Class A/);
  /* Der Konsum-Export darf den Namen nicht mehr setzen. */
  const quelle = readFileSync(join(ROOT, "quant/api/product-services.js"), "utf8");
  assert.equal(/stock\.name=consumer\.companyName/.test(quelle), false,
    "der Konsum-Export ueberschreibt den Namen wieder");
});

test("ein Konflikt steht auf der Seite und wird nicht still entschieden", async () => {
  const konflikt = await api.getStockIntelligence("AACI");
  assert.ok(konflikt.identityConflict, "AACI traegt keine Konfliktangabe");
  assert.equal(konflikt.identityConflict.kind, "D");
  assert.ok(konflikt.identityConflict.alternativeName, "der andere Name fehlt");
  assert.notEqual(Naming.normalise(konflikt.identityConflict.alternativeName), Naming.normalise(konflikt.name),
    "der \"andere Name\" ist derselbe Name");
  const sauber = await api.getStockIntelligence("AAPL");
  assert.equal(sauber.identityConflict, undefined, "AAPL traegt eine Konfliktangabe");
  /* Und die Seite zeigt es - mit beiden Namen und ohne internen Code zuerst. */
  const seite = readFileSync(join(ROOT, "vu2/experience.js"), "utf8");
  assert.match(seite, /if\(s\.identityConflict\)main\.append\(identitaetsHinweis\(s\)\)/);
  const block = seite.slice(seite.indexOf("function identitaetsHinweis("), seite.indexOf("function briefListe("));
  assert.match(block, /zwei verschiedene Firmennamen/);
  assert.match(block, /alternativeName/);
  assert.match(block, /entscheiden diese Frage nicht/);
  /* Die Erklaerungen je Art sind Alltagssprache. */
  /* Der Name der Tabelle ist selbst ein interner Code - die Pruefung beginnt
     deshalb NACH der Klammer und nicht bei der Deklaration. Genau daran hat
     sich schon der Branchenvorlagen-Test zweimal selbst ausgeloest. */
  const grundStart = seite.indexOf("const IDENTITAET_GRUND={");
  const grund = seite.slice(seite.indexOf("{", grundStart) + 1, seite.indexOf("function identitaetsHinweis("));
  for (const art of ["D", "F", "G"]) {
    assert.ok(new RegExp("\\b" + art + ":").test(grund), "keine Erklaerung fuer Konfliktart " + art);
  }
  assert.equal(/[A-Z]{3,}_[A-Z_]{3,}/.test(grund), false, "interner Code in der Erklaerung");
});
