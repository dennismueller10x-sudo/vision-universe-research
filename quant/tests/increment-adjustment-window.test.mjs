import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Quality = require("../engines/market-quality.js");

const bar = (date, close, adjustedClose, dividend = 0) => ({
  date, open: close, high: close, low: close, close,
  adjustedClose, volume: 1e6, splitFactor: 1, dividend
});

/* Der Ex-Tag. Der Anbieter bereinigt die Historie rueckwirkend: nach der
   Ausschuettung steht der Vortag bei einem anderen adjustedClose als
   vorher. */
const VORTAG_ALT = bar("2026-09-17", 100, 100);      /* gespeichert, vor der Ausschuettung */
const VORTAG_NEU = bar("2026-09-17", 100, 98.5);     /* frisch geholt, nachbereinigt */
const EX_TAG = bar("2026-09-18", 98.5, 98.5, 1.5);
const DANACH = bar("2026-09-21", 99, 99);

test("ein gemischtes Fenster erzeugt den Widerspruch, den SPY blockiert hat", () => {
  /* Der gespeicherte Vortag traegt die Bereinigung des VORIGEN Laufs,
     die neuen Bars die von heute. Ueber einen Ex-Tag hinweg sieht die
     Pruefung ein Verhaeltnis, das sich nicht bewegt - und meldet
     zurecht, die Ausschuettung sei nicht eingerechnet. */
  const gemischt = Quality.validateAdjustmentConsistency(
    [VORTAG_ALT, EX_TAG, DANACH], { claimedStatus: "TOTAL_RETURN" });
  assert.equal(gemischt.ok, false);
  const codes = gemischt.findings.map((f) => f.code);
  assert.ok(codes.includes("dividend_not_in_adjusted"));
  assert.ok(codes.includes("adjustment_status_contradicted"));
  assert.equal(gemischt.observed.refutedAbove, "SPLIT_ADJUSTED");
});

test("derselbe Zeitraum aus EINER Bereinigung laeuft durch", () => {
  /* Kommt der Vortag aus derselben Antwort wie die neuen Bars, traegt er
     dieselbe Bereinigung - und der Widerspruch verschwindet, ohne dass
     an der Pruefung etwas geaendert wurde. */
  const konsistent = Quality.validateAdjustmentConsistency(
    [VORTAG_NEU, EX_TAG, DANACH], { claimedStatus: "TOTAL_RETURN" });
  assert.equal(konsistent.ok, true);
  assert.deepEqual(konsistent.findings.filter((f) => f.severity === "error"), []);
});

test("ohne Ausschuettung im Fenster macht die Herkunft des Vortags keinen Unterschied", () => {
  /* Die Gegenprobe: waere der Effekt allgemein, traefe er auch ein
     Fenster ohne Ex-Tag. Tut er nicht - er haengt genau an der
     rueckwirkenden Nachbereinigung. */
  const ohneEx = [bar("2026-09-17", 100, 100), bar("2026-09-18", 101, 101), bar("2026-09-21", 99, 99)];
  const r = Quality.validateAdjustmentConsistency(ohneEx, { claimedStatus: "TOTAL_RETURN" });
  assert.equal(r.ok, true);
});

test("der Abruf holt einen Tag Ueberlappung und prueft damit", () => {
  /* Der Kern der Reparatur, am Quelltext festgehalten: die Anfrage
     beginnt beim letzten gespeicherten Tag statt einen danach, und der
     Vortag fuer die Pruefung stammt aus der Antwort, wenn sie ihn
     mitliefert. Beides zusammen ergibt das konsistente Fenster - eines
     davon allein nicht. */
  const ingest = readFileSync("scripts/market/ingest-tiingo.mjs", "utf8");
  assert.match(ingest, /const gespeichertBis = INITIAL \? null : store\.lastStoredDate\(id\)/);
  assert.match(ingest, /const from = gespeichertBis && gespeichertBis < fromGeplant \? gespeichertBis : fromGeplant/);
  assert.match(ingest, /const anschlussAusAbruf =/);
  assert.match(ingest, /const anschlussFuerPruefung = anschlussAusAbruf\.length \? anschlussAusAbruf : anschluss/);
  assert.match(ingest, /const validationInput = \[\.\.\.anschlussFuerPruefung, \.\.\.neueBars\]/);

  /* Und die Dublette faengt der bestehende Filter ab - sonst holte die
     Ueberlappung sich einen duplicate_bar ein. */
  assert.match(ingest, /String\(bar\.date\)\.slice\(0, 10\) > anschlussDatumRoh/);
});

test("der Ueberlappungstag wird geprueft, aber nicht gespeichert", () => {
  /* Die Reparatur darf den Bestand nicht anfassen. Wuerde der
     Ueberlappungsbar mitgespeichert, ueberschriebe er bei jedem Lauf
     einen bereits veroeffentlichten historischen Kurs - naemlich genau
     dann, wenn der Anbieter nach einer Ausschuettung nachbereinigt hat.
     Eine Validierungsreparatur, die veroeffentlichte Kurse rueckwirkend
     aendert, ist keine. */
  const ingest = readFileSync("scripts/market/ingest-tiingo.mjs", "utf8");
  assert.match(ingest, /const zuSpeichern = anschlussDatumRoh/);
  assert.match(ingest, /store\.mergeBars\(id, zuSpeichern,/);
  /* Und der Pruefeingang bleibt der weitere von beiden. */
  assert.match(ingest, /const validationInput = \[\.\.\.anschlussFuerPruefung, \.\.\.neueBars\]/);
  assert.equal(/store\.mergeBars\(id, validation\.bars,/.test(ingest), false,
    "der ungefilterte Satz wird noch gespeichert - der Ueberlappungstag landet im Bestand");
});
