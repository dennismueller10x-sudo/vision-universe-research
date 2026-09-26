/* =========================================================================
   DIE NAMEN LAGEN DA UND NIEMAND HAT SIE GELESEN.

   Gemessen am 26.09.2026: `company-names-1.0.0` löst 6.855 der 6.875
   Produkttitel auf - und der Company Master las fünf andere Quellen und
   diese nicht. Folge: 1.344 Instrumente mit companyName null, und 1.102
   Zeilen der Übersicht schrieben ihren Ticker zweimal:

       AAAC | AAAC | 20,12 $        statt      AAAC | Columbia AAA CLO ETF

   Die Aktienseite zeigte den Namen längst, weil der Konsum-Export dieselbe
   Schicht überlagert. Nur der Stamm und die Liste wussten nichts davon.

   Dazu ein zweiter Fund: `dashboard/config/universe.json` führt AMD als
   "AMD" und ASML als "ASML". Weil diese Quelle hoch steht, trug der Stamm
   das Kürzel als Firmennamen - mit dem Status RESOLVED.

   Gehalten wird hier nicht die Zahl der Namen, sondern die Regel: ein
   Kürzel ist kein Name, und was ohne Namen bleibt, hat einen belegten
   Grund. Geprüft am echten Bestand.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, "..", "..");
const Classification = require(join(ROOT, "quant/engines/instrument-classification.js"));

function instrumente() {
  const dir = join(ROOT, "quant/data/universe/instruments");
  if (!existsSync(dir)) return [];
  const alle = [];
  for (const datei of readdirSync(dir)) {
    if (!datei.endsWith(".json")) continue;
    alle.push(...(JSON.parse(readFileSync(join(dir, datei), "utf8")).instruments || []));
  }
  return alle;
}

test("kein Instrument trägt sein Kürzel als Firmennamen", () => {
  const alle = instrumente();
  if (!alle.length) return;
  const verstoesse = alle.filter((i) => i.companyName &&
    String(i.companyName).trim().toUpperCase() === String(i.symbol).toUpperCase());
  assert.deepEqual(verstoesse.map((i) => i.symbol + " (" + i.companyNameStatus + ")").slice(0, 10), [],
    verstoesse.length + " Instrumente schreiben ihr Kürzel als Namen");
});

test("jeder Titel ohne Namen hat einen belegten Grund", () => {
  const alle = instrumente();
  const pfad = join(ROOT, "quant/data/market/security-master/company-names.json");
  if (!alle.length || !existsSync(pfad)) return;
  const schicht = JSON.parse(readFileSync(pfad, "utf8"));
  const grund = new Map();
  for (const zeile of schicht.rows || []) grund.set(zeile.ticker, zeile);
  const ohne = alle.filter((i) => !i.companyName);
  /* Die Schicht kennt jeden davon, und sie sagt warum. Ein Titel ohne Namen
     UND ohne Grund wäre eine stille Lücke - und genau die soll nicht
     zurückkommen. */
  const ohneGrund = [];
  for (const i of ohne) {
    const zeile = grund.get(i.symbol);
    if (!zeile) { ohneGrund.push(i.symbol + ": nicht in der Namensschicht"); continue; }
    /* Drei belegte Lagen, und die ersten beiden tragen ihren Grund IM Status:
       NOT_IN_PRODUCT_UNIVERSE (205) und RESOLVED_OUTSIDE_PRODUCT sagen selbst,
       woran es liegt. Nur ein UNRESOLVED braucht einen Grund daneben - für die
       18 Titel im Produktuniversum lautet er PROVIDER_HAS_NO_NAME mit einem
       Datum für den nächsten Versuch. */
    if (zeile.status === "RESOLVED") ohneGrund.push(i.symbol + ": aufgelöst, aber nicht im Stamm");
    else if (zeile.status === "RESOLVED_OUTSIDE_PRODUCT") ohneGrund.push(i.symbol + ": aufgelöst, aber nicht im Stamm");
    else if (zeile.status === "UNRESOLVED" && !zeile.reason) ohneGrund.push(i.symbol + ": unaufgelöst ohne Grund");
    else if (!["UNRESOLVED", "NOT_IN_PRODUCT_UNIVERSE"].includes(zeile.status)) {
      ohneGrund.push(i.symbol + ": unbekannter Stand '" + zeile.status + "'");
    }
  }
  assert.deepEqual(ohneGrund.slice(0, 10), [], ohneGrund.length + " von " + ohne.length + " ohne belegten Grund");
  /* Und die Deckung bleibt hoch: ein Rückfall auf hunderte namenlose Titel
     wäre ein Rückschritt, kein Datenstand. Die Grenze ist bewusst weit unter
     dem gemessenen Stand (260 von 7.809), damit sie einen Rückschritt fängt
     und keinen Tagesstand einfriert. */
  assert.ok(ohne.length < 600, ohne.length + " Instrumente ohne Namen - das war der Stand VOR der Namensschicht");
});

test("der Bauer liest die aufgelöste Namensschicht, und zwar als Auffüllung", () => {
  const src = readFileSync(join(ROOT, "scripts/universe/build-company-master.mjs"), "utf8");
  assert.match(src, /quant", "data", "market", "security-master", "company-names\.json"/,
    "die aufgelöste Namensschicht wird nicht gelesen");
  /* ZULETZT: nach der SEC-Quelle. Stand der Block davor, hat er gemessen
     5.066 bereits bekannte Namen überschrieben ("Alcoa Corp" → "Alcoa"), weil
     displayName die Rechtsform weglässt - eine Darstellungsentscheidung über
     jeden Namen im Produkt und kein Lückenschluss. */
  const secStelle = src.indexOf('merke(ticker, titelSchreibweise(row.name), "sec:company_tickers")');
  const schichtStelle = src.indexOf('"security-master", "company-names.json"');
  assert.ok(secStelle > 0 && schichtStelle > secStelle,
    "die Namensschicht steht vor der SEC-Quelle und überschreibt damit bekannte Namen");
  /* Und die Kürzel-Regel gilt in `merke`, also für JEDE Quelle. */
  const merke = src.slice(src.indexOf("const merke = (ticker, name, quelle)"), src.indexOf("for (const file of ["));
  assert.match(merke, /sauber\.toUpperCase\(\) === t/, "eine Quelle darf weiter das Kürzel als Namen liefern");
});

test("die Hülle entscheidet vor dem Inhalt - ein Vorzugs-ETF ist ein Fonds", () => {
  /* Gemessen an den elf Gattungen, die ein Name zum ersten Mal belegte:
     sechs waren falsch, und beide Fehler kamen aus der Reihenfolge der
     Namensregeln. */
  /* Die Engine nennt das Feld `ticker` und gibt `instrumentType` zurück - der
     erste Versuch dieses Falls hat `symbol`/`securityType` benutzt und damit
     UNKNOWN geprüft statt der Regel. */
  const klassifiziere = (name, assetType) =>
    Classification.classify({ ticker: "TEST", name, assetType: assetType || null, exchange: "NYSE" },
      { today: "2026-09-26" }).instrumentType;
  /* Eine Hinterlegung auf EIGENE Vorzugsaktien ist kein ADR. */
  const vorzug = klassifiziere("Fifth Third Bancorp Depositary Shares Representing a 140th Ownership Interest in a Share of 6.875 Preferred Stock");
  assert.equal(vorzug, "PREFERRED", "Vorzugs-Hinterlegung als " + vorzug);
  /* Ein ADR nennt sich ADR. */
  const adr = klassifiziere("WuXi PharmaTech Cayman Inc. ADR");
  assert.equal(adr, "ADR");
  /* Eine Hinterlegung ohne weitere Angabe bleibt eine Hinterlegung - besser
     als Stammaktie. */
  const blank = klassifiziere("Some Issuer Depositary Shares");
  assert.equal(blank, "ADR");
  /* Und die Hülle vor dem Inhalt. */
  const etf = klassifiziere("Cohen & Steers Short Duration Preferred AND Income Active ETF", "ETF");
  assert.equal(etf, "ETF", "ein Vorzugs-ETF als " + etf);
  const etn = klassifiziere("iPath Preferred Income ETN", "ETF");
  assert.equal(etn, "ETN");
});

test("die Übersicht schreibt kein Kürzel zweimal", () => {
  const seite = readFileSync(join(ROOT, "vu2/experience.js"), "utf8");
  assert.match(seite, /const zeilenName=\(s\)=>\(s\.name&&s\.name!==s\.ticker\)\?s\.name:'Firmenname nicht veröffentlicht'/,
    "die Zeile hat keinen eigenen Satz für einen fehlenden Namen");
  assert.match(seite, /text:zeilenName\(s\)/, "die Liste benutzt den Satz nicht");
  /* Und die Aktienseite macht aus einem fehlenden Namen keine Überschrift
     aus dem Kürzel, unter der dasselbe Kürzel ein zweites Mal steht. */
  assert.match(seite, /heading\(\(s\.name&&s\.name!==s\.ticker\)\?s\.name:'Aktienanalyse'/);
});

test("der Gattungsbericht belegt jedes Muster und klassifiziert nach keinem mehrdeutigen", () => {
  const pfad = join(ROOT, "quant/data/product/name-type-evidence-v1.json");
  if (!existsSync(pfad)) return;
  const b = JSON.parse(readFileSync(pfad, "utf8"));
  assert.equal(b.schemaVersion, "name-type-evidence-1.0.0");
  let eindeutig = 0, mehrdeutig = 0;
  for (const g of b.groups) {
    assert.ok(["UNAMBIGUOUS", "AMBIGUOUS"].includes(g.evidence), g.id + ": Lage '" + g.evidence + "'");
    assert.ok(g.why && g.why.length > 30, g.id + ": keine Begründung");
    if (g.evidence === "UNAMBIGUOUS") { eindeutig += 1; assert.ok(g.nameSaysType, g.id + ": eindeutig, aber ohne Zieltyp"); }
    else { mehrdeutig += 1; assert.equal(g.nameSaysType, null, g.id + ": mehrdeutig mit Zieltyp - das wäre geraten"); }
  }
  assert.ok(eindeutig >= 5 && mehrdeutig >= 4, "der Bericht trennt die beiden Lagen nicht");
  /* Die gesperrte Regel steht mit ihrer Zahl und mit der Feststellung, wem
     die Entscheidung gehört - ein Bericht, der sie selbst trifft, wäre
     keiner. */
  assert.ok(b.withheldRule.titlesAffected > 0);
  assert.match(b.withheldRule.decisionBelongsToOwner, /Produktentscheidung/);
  assert.match(b.doNotDo, /Ticker-Suffixen/);
  /* Und der Bericht nennt ausdrücklich, welche frühere Aussage er korrigiert. */
  assert.match(b.correctsEarlierStatement, /M37/);
});
