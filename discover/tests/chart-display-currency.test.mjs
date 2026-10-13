/* =========================================================================
   DER KURS IM CHARTKOPF TRAEGT DIE WAEHRUNG, IN DER ER VORLIEGT.

   Der Befund vom 13.10.2026 (Master-Audit, Browser): die Discover-Aktie
   PLTR zeigte im Kopf des Tagescharts "209,01 €" und "seit
   Vortagesschluss 209,05 €" - die Dollar-Zahlen mit Euro-Zeichen.
   Ursache: Fehlt der Wechselkurs des Handelstags, geben die Umrechnungen
   (inAnzeigewaehrungSnapshot, inAnzeigewaehrung) die Werte unveraendert
   in USD zurueck; alsAngezeigt() formatierte sie trotzdem in der
   gewaehlten Anzeigewaehrung.

   Hier laufen die drei Funktionen aus discover/ui/detail.js mit dem echten
   zentralen Formatter (quant/engines/fx/money-format.js) und einem
   Doppel der FX-Schicht, das umrechnen kann - oder eben nicht.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Format = require("../../quant/engines/fx/money-format.js");
const src = readFileSync(new URL("../ui/detail.js", import.meta.url), "utf8");
const body = src.slice(src.indexOf("function nativePrice"), src.indexOf("function zeichneVerbraucher"));

function helfer(VUFx) {
  const isNum = (v) => typeof v === "number" && isFinite(v);
  const vuFormat = (fn, value, currency, opts) => Format[fn](value, currency || "USD", opts);
  return new Function("isNum", "vuFormat", "VUFx",
    body + "\nreturn { alsAngezeigt: alsAngezeigt, snapshot: inAnzeigewaehrungSnapshot, reihe: inAnzeigewaehrung };")(isNum, vuFormat, VUFx);
}
/* FX-Schicht mit Anzeigewaehrung EUR. kurs=null: der Tageskurs fehlt. */
function fx(kurs) {
  return { Format, layer: {
    preference: { get: () => "EUR" },
    money: (v) => kurs === null
      ? { conversionAvailable: false, native: { currency: "USD" }, display: { currency: "USD" } }
      : { conversionAvailable: true, native: { currency: "USD" }, display: { currency: "EUR" }, fx: { rate: kurs } },
    series: (punkte) => kurs === null
      ? { available: false, nativeCurrency: "USD", displayCurrency: "EUR" }
      : { available: true, nativeCurrency: "USD", displayCurrency: "EUR", points: punkte.map((p) => ({ date: p[0], display: p[1] * kurs })) }
  } };
}
const SNAP = { sessionDate: "2026-10-12", previousClose: 209.05, points: [["09:30", 210.1], ["15:55", 209.01]] };

test("fehlt der Tageskurs, bleibt der Tagesverlauf in Dollar und traegt das Dollar-Zeichen", () => {
  const h = helfer(fx(null));
  const r = h.snapshot(SNAP);
  assert.equal(r.waehrung, "USD");
  assert.equal(r.snap, SNAP, "das Original wird nicht veraendert");
  assert.equal(h.alsAngezeigt(209.01, r.waehrung), "209,01 $");
  assert.equal(h.alsAngezeigt(SNAP.previousClose, r.waehrung), "209,05 $");
});

test("ist der Tageskurs da, steht der umgerechnete Kurs mit Euro-Zeichen", () => {
  const h = helfer(fx(0.87));
  const r = h.snapshot(SNAP);
  assert.equal(r.waehrung, "EUR");
  assert.notEqual(r.snap, SNAP);
  assert.equal(h.alsAngezeigt(r.snap.points[1][1], r.waehrung), "181,84 €");
  assert.equal(SNAP.points[1][1], 209.01, "das Original bleibt der ausgelieferte Stand");
});

test("Zeitraum-Chart: ohne Umrechnung Dollar, mit Umrechnung Euro, Europa in Landeswaehrung", () => {
  const punkte = [["2026-10-09", 205], ["2026-10-12", 209]];
  const ohne = helfer(fx(null)).reihe(punkte, null);
  assert.equal(ohne.waehrung, "USD");
  assert.equal(helfer(fx(null)).alsAngezeigt(ohne.punkte[1][1], ohne.waehrung), "209,00 $");
  const mit = helfer(fx(0.87)).reihe(punkte, null);
  assert.equal(mit.waehrung, "EUR");
  assert.equal(helfer(fx(0.87)).alsAngezeigt(mit.punkte[1][1], mit.waehrung), "181,83 €");
  assert.equal(helfer(fx(0.87)).reihe(punkte, "EUR").waehrung, "EUR");
  assert.equal(helfer(fx(0.87)).reihe(punkte, "GBP").waehrung, "GBP");
});

test("ohne FX-Schicht wird nicht in einer angenommenen Anzeigewaehrung formatiert", () => {
  const h = helfer(undefined);
  assert.equal(h.snapshot(SNAP).waehrung, "USD");
  assert.equal(h.reihe([["a", 1], ["b", 2]], null).waehrung, "USD");
});

test("jeder Preis im Chartkopf und im Tooltip nennt seine Waehrung ausdruecklich", () => {
  /* Kein Aufruf ohne Waehrung - der stille Rueckfall auf die Vorliebe war der Fehler. */
  const aufrufe = src.match(/alsAngezeigt\([^)]*\)/g).filter((a) => !/function alsAngezeigt/.test(a));
  assert.ok(aufrufe.length >= 5);
  for (const a of aufrufe) assert.match(a, /, waehrung\)$/, a);
  assert.equal(/preference\.get\(\)/.test(body), false, "die Formatierung liest wieder die Vorliebe statt der Herkunft");
});
