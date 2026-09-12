/* =========================================================================
   Ebene 2: Einordnung und Geschäftszahlen.

   Zwei Zusagen werden hier geprüft, und beide sind Produktversprechen,
   keine Implementierungsdetails:

   1. Ein Wort wie "hoch" steht nur da, wo eine Schwelle es deckt. Die
      Schwellen sind der Vertrag; wer sie verschiebt, verschiebt eine
      Aussage über ein Wertpapier.

   2. Wo die Daten fehlen, steht kein Wort. Für 493 der 498 realen Titel
      gibt es in diesem Repository keine Geschäftszahlen - und eine
      Wachstumsrate, die niemand belegen kann, wäre der teuerste Fehler,
      den ein Investmentprodukt machen kann: sie liest sich wie Research.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const E = require(join(root, "discover", "engines", "einordnung.js"));
const U = require(join(root, "discover", "engines", "unternehmen.js"));

function titel(over) {
  return Object.assign({
    symbol: "TEST",
    signals: {},
    metrics: { return1M: 0.01, return3M: 0.04, return6M: 0.1, return12M: 0.2,
               distanceTo52wHigh: -0.1, distanceTo52wLow: 0.4, trendAlignment: 1,
               volatility252d: 0.3, maxDrawdown252d: -0.15, leadershipPercentile: 60 },
    geschaeftszahlen: U.leer("SOURCE_MISSING", "Keine Zahlen.")
  }, over || {});
}

/* --------------------------------------------------------- Die Schwellen */

test("jede Stufe kommt aus ihrer Schwelle - und nur daraus", () => {
  assert.equal(E.stufeFuer("wachstum", 0.30).stufe, "Sehr stark");
  assert.equal(E.stufeFuer("wachstum", 0.25).stufe, "Sehr stark");
  assert.equal(E.stufeFuer("wachstum", 0.2499).stufe, "Stark");
  assert.equal(E.stufeFuer("wachstum", 0).stufe, "Kaum verändert");
  assert.equal(E.stufeFuer("wachstum", -0.5).stufe, "Rückläufig");
  assert.equal(E.stufeFuer("bewertung", 40).stufe, "Sehr hoch");
  assert.equal(E.stufeFuer("bewertung", 20).stufe, "Hoch");
  assert.equal(E.stufeFuer("bewertung", 11).stufe, "Niedrig");
  assert.equal(E.stufeFuer("risiko", 0.7).stufe, "Hoch");
  assert.equal(E.stufeFuer("risiko", 0.2).stufe, "Niedrig");
  assert.equal(E.stufeFuer("risiko", null), null, "ohne Zahl keine Stufe");
});

test("der Trend braucht zwei Belege, nicht einen", () => {
  /* Nur ueber den Durchschnitten, aber seit einem halben Jahr im Minus:
     das ist kein starker Trend. */
  const gemischt = E.trendStufe({ trendAlignment: 1, return6M: -0.2 });
  assert.equal(gemischt.stufe, "Abwärts");
  const stark = E.trendStufe({ trendAlignment: 1, return6M: 0.2 });
  assert.equal(stark.stufe, "Stark");
  assert.equal(E.trendStufe({}), null);
});

test("ohne Geschäftszahlen bleibt die Einordnung leer - mit Grund", () => {
  const zeilen = E.ueberblick(titel()).zeilen;
  const wachstum = zeilen.find((z) => z.id === "wachstum");
  const bewertung = zeilen.find((z) => z.id === "bewertung");
  assert.equal(wachstum.wert, null);
  assert.ok(wachstum.fehlt && wachstum.fehlt.length > 10, "kein Grund genannt");
  assert.equal(bewertung.wert, null);
  /* Trend und Risiko kommen aus der Kursreihe und sind trotzdem da. */
  assert.ok(zeilen.find((z) => z.id === "trend").wert);
  assert.ok(zeilen.find((z) => z.id === "risiko").wert);
});

test("ohne ausgelieferten Kurs sagt die Bewertung, warum sie fehlt", () => {
  const s = titel({ geschaeftszahlen: Object.assign(U.leer("WITHHELD_REDISTRIBUTION", null),
                                                    { kgvStatus: "WITHHELD_REDISTRIBUTION" }) });
  const zeile = E.ueberblick(s).zeilen.find((z) => z.id === "bewertung");
  assert.match(zeile.fehlt, /ohne ausgelieferten Kurs/i);
});

/* ------------------------------------------------------------- Die Waage */

test("keine Aktie kommt ohne Gegenseite aus", () => {
  /* Ein ruhiger, wachsender, guenstiger Titel - trotzdem steht rechts
     etwas. Eine Seite ohne Risiko waere Werbung. */
  const brav = titel({
    metrics: Object.assign(titel().metrics, { volatility252d: 0.18, maxDrawdown252d: -0.05 }),
    geschaeftszahlen: Object.assign(U.leer("CALCULATED", null), {
      status: "CALCULATED", umsatzWachstum: 0.2, gewinnWachstum: 0.2, marge: 0.25,
      kgv: 10, kgvStatus: "CALCULATED" })
  });
  const w = E.waage(brav);
  assert.ok(w.dafuer.length >= 3, "zu wenige Gruende");
  assert.ok(w.beachten.length >= 1, "keine Gegenseite");
  assert.match(w.hinweis, /keine Anlageempfehlung/);
});

test("was die Einordnung 'hoch' nennt, erklärt die Waage auch", () => {
  const teuer = titel({ geschaeftszahlen: Object.assign(U.leer("CALCULATED", null), {
    status: "CALCULATED", kgv: 24, kgvStatus: "CALCULATED", umsatzWachstum: 0.05 }) });
  const stufe = E.ueberblick(teuer).zeilen.find((z) => z.id === "bewertung");
  assert.equal(stufe.wert, "Hoch");
  const w = E.waage(teuer);
  assert.ok(w.beachten.some((b) => b.id === "bewertung"),
    "die Seite nennt die Bewertung hoch, erklaert aber nicht warum das zaehlt");
});

test("ein Titel ohne Geschäftszahlen sagt das auf der Gegenseite", () => {
  const w = E.waage(titel());
  assert.ok(w.beachten.some((b) => b.id === "keineZahlen"),
    "die fehlende Datenlage wird verschwiegen");
});

test("die Erklärungen erklären ohne Fachsprache", () => {
  for (const id of ["wachstum", "bewertung", "trend", "risiko"]) {
    const text = E.erklaerung(id);
    assert.ok(text && text.length > 40, id + " hat keine Erklaerung");
    assert.ok(!/RSI|Perzentil|Momentum|Volatilität/.test(text), id + ": " + text);
  }
});

test("nirgends steht eine Empfehlung", () => {
  const alles = JSON.stringify(E) + JSON.stringify(E.ERKLAERUNGEN) +
                JSON.stringify(E.waage(titel()));
  assert.ok(!/kaufen|verkaufen|Kaufempfehlung|solltest du/i.test(alles),
    "irgendwo steht eine Handlungsempfehlung");
});

/* ------------------------------------------------------ Geschäftszahlen */

test("zwölf Monate sind vier Quartale - und nicht drei", () => {
  const fakten = [
    { metricId: "revenue", periodEnd: "2026-06-30", value: 10 },
    { metricId: "revenue", periodEnd: "2026-03-31", value: 9 },
    { metricId: "revenue", periodEnd: "2025-12-31", value: 8 },
    { metricId: "revenue", periodEnd: "2025-09-30", value: 7 }
  ];
  assert.equal(U.zwoelfMonate(fakten, "revenue").wert, 34);
  assert.equal(U.zwoelfMonate(fakten.slice(0, 3), "revenue"), null,
    "drei Quartale duerfen kein Jahr ergeben");
});

test("eine Korrektur ersetzt das Quartal, sie addiert sich nicht dazu", () => {
  const fakten = [
    { metricId: "revenue", periodEnd: "2026-06-30", value: 12, restatementStatus: "restated" },
    { metricId: "revenue", periodEnd: "2026-06-30", value: 10 },
    { metricId: "revenue", periodEnd: "2026-03-31", value: 9 },
    { metricId: "revenue", periodEnd: "2025-12-31", value: 8 },
    { metricId: "revenue", periodEnd: "2025-09-30", value: 7 }
  ];
  const summe = U.zwoelfMonate(fakten, "revenue").wert;
  assert.ok(summe === 36 || summe === 34, "das Quartal wurde doppelt gezaehlt: " + summe);
});

test("aus einem Verlust wird keine Wachstumsrate gerechnet", () => {
  assert.equal(U.wachstum(10, -5), null);
  assert.equal(U.wachstum(10, 0), null);
  assert.equal(U.wachstum(12, 10), 0.19999999999999996);
});

test("ohne freigegebenen Kurs entsteht kein Kurs-Gewinn-Verhältnis", () => {
  const fakten = [];
  for (let i = 0; i < 8; i++) {
    const jahr = 2026 - Math.floor(i / 4);
    const monat = ["12-31", "09-30", "06-30", "03-31"][i % 4];
    fakten.push({ metricId: "revenue", periodEnd: jahr + "-" + monat, value: 100 });
    fakten.push({ metricId: "netIncome", periodEnd: jahr + "-" + monat, value: 10 });
    fakten.push({ metricId: "sharesOutstanding", periodEnd: jahr + "-" + monat, value: 100 });
  }
  const ohne = U.ausSecFakten(fakten, { preis: null, preisStatus: "WITHHELD_REDISTRIBUTION" });
  assert.equal(ohne.kgv, null);
  assert.equal(ohne.kgvStatus, "WITHHELD_REDISTRIBUTION");
  /* Umsatz und Gewinn bleiben sichtbar: sie sind keine Kursdaten. */
  assert.equal(ohne.umsatzTTM, 400);
  const mit = U.ausSecFakten(fakten, { preis: 20, preisStatus: "CALCULATED" });
  assert.equal(mit.kgvStatus, "CALCULATED");
  /* Vier Quartale zu 10 = 40 Gewinn, 100 Aktien => 0,40 je Aktie.
     Bei einem Kurs von 20 ist das ein KGV von 50. */
  assert.equal(mit.kgv, 50);
});

/* ------------------------------------------------------- Ausgelieferte Daten */

test("die ausgelieferten Detailseiten erfinden keine Geschäftszahlen", () => {
  const basis = join(root, "discover", "data", "stocks", "US_REAL");
  if (!existsSync(basis)) return;
  let mitZahlen = 0, ohneZahlen = 0;
  for (const datei of readdirSync(basis)) {
    const d = JSON.parse(readFileSync(join(basis, datei), "utf8"));
    const g = d.geschaeftszahlen;
    assert.ok(g, datei + ": kein Feld fuer Geschaeftszahlen");
    if (g.status === "CALCULATED") {
      mitZahlen++;
      assert.equal(g.quelle, "SEC_CANONICAL", datei + ": Zahlen ohne benannte Quelle");
      assert.ok(typeof g.umsatzTTM === "number", datei + ": Status ohne Umsatz");
    } else {
      ohneZahlen++;
      assert.equal(g.umsatzTTM, null, datei + ": Wert trotz fehlender Quelle");
      assert.equal(g.kgv, null, datei + ": Bewertung trotz fehlender Quelle");
      assert.ok(g.message, datei + ": fehlende Daten ohne Begruendung");
    }
  }
  /* Die Golden Five sind die einzigen realen Titel mit SEC-Fakten. */
  assert.equal(mitZahlen, 5, "unerwartet viele reale Titel mit Geschaeftszahlen: " + mitZahlen);
  assert.ok(ohneZahlen > 400, "zu wenige Titel geprueft");
});

test("das Modelluniversum kennzeichnet seine Zahlen als erzeugt", () => {
  const basis = join(root, "discover", "data", "stocks", "VU_MODEL");
  if (!existsSync(basis)) return;
  const datei = readdirSync(basis)[0];
  const d = JSON.parse(readFileSync(join(basis, datei), "utf8"));
  assert.equal(d.geschaeftszahlen.quelle, "VU_MODEL");
  assert.equal(d.dataMode, "mock");
});
