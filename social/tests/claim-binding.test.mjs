/* =========================================================================
   VU SOCIAL — Claim Binding (CB1–CB20)

   Ein generatives Modell schreibt fluessig und pruefen kann es nichts.
   Es setzt eine Null an, weil der Satz sonst holpert; es schreibt "seit
   2019", weil Jahreszahlen Text glaubwuerdig machen; es rundet 76 auf
   "fast 80", weil das besser klingt.

   Nichts davon ist boeser Wille. Und nichts davon ist im fertigen
   Beitrag von einer belegten Zahl zu unterscheiden.

   -------------------------------------------------------------------------
   DIESE TESTS SIND UEBERWIEGEND FEINDLICH
   -------------------------------------------------------------------------

   Ein Pruefer ist nur an dem etwas wert, was er ABWEHRT. Tests, die den
   braven Text durchlassen, pruefen die Braveheit des Fixtures.

   -------------------------------------------------------------------------
   DIE ANDERE RICHTUNG ZAEHLT AUCH
   -------------------------------------------------------------------------

   CB14 und CB15 halten Faelle fest, die der Pruefer in seiner ersten
   Fassung faelschlich verworfen hat: das Datum aus dem Beleg und den
   Satz ueber die EIGENE Entscheidung. Ein Pruefer, der richtige Texte
   verwirft, wird abgeschaltet — und dann prueft er gar nichts mehr.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const CB = require("../engines/claim-binding.js");

const EVIDENZ = [{
  id: "ev1", entity: "XOM", metric: "Technical Opportunity Score",
  value: 76, unit: null, source: "vu.technical",
  observedAt: "2026-09-16T00:00:00Z", state: "VERIFIED"
}];

const ok = (t, ev = EVIDENZ, o = {}) => CB.check(t, ev, o).ok;
const gruende = (t, ev = EVIDENZ, o = {}) => {
  const r = CB.check(t, ev, o);
  return r.unbound.map((u) => u.raw).concat(r.forbidden.map((f) => f.id));
};

/* ------------------------------------------------------------------ */
/* ERFUNDENE ZAHLEN                                                    */
/* ------------------------------------------------------------------ */

test("CB1 · Eine erfundene Zahl faellt auf", () => {
  assert.equal(ok("XOM steht bei 76. Vor einem Monat waren es 61."), false);
  assert.ok(gruende("XOM steht bei 76. Vor einem Monat waren es 61.").includes("61"));
});

test("CB2 · Eine aufgerundete Zahl ist eine andere Zahl", () => {
  /* "fast 80" klingt besser und ist falsch. */
  assert.equal(ok("XOM liegt bei fast 80 Punkten."), false);
});

test("CB3 · Eine Rundung, die den Wert nicht verschiebt, ist erlaubt", () => {
  const ev = [{ entity: "XOM", metric: "Score", value: 76.3, observedAt: "2026-09-16T00:00:00Z" }];
  assert.equal(ok("XOM liegt bei 76.", ev), true);
  assert.equal(ok("XOM liegt bei 80.", ev), false);
});

test("CB4 · Eine erfundene Jahreszahl faellt auf", () => {
  assert.equal(ok("So hoch wie seit 2019 nicht."), false);
});

test("CB5 · Das Jahr des Belegs ist belegt", () => {
  /* "Stand 2026" ist keine erfundene Zahl. */
  assert.equal(ok("XOM bei 76, Stand 2026."), true);
});

test("CB6 · Auch eine Null muss belegt sein", () => {
  /* Der haeufigste Fall: eine 0, weil der Satz sonst holpert. */
  assert.equal(ok("XOM bei 76, Veraenderung 0 Prozent."), false);
});

test("CB7 · Dieselbe Zahl in anderer Schreibweise ist dieselbe Zahl", () => {
  const ev = [{ entity: "AAA", metric: "Umsatz", value: 1234.56,
    observedAt: "2026-09-16T00:00:00Z" }];
  assert.equal(ok("Umsatz 1.234,56.", ev), true);
  assert.equal(ok("Umsatz 1234.56.", ev), true);
  assert.equal(ok("Umsatz 1.234,57.", ev), false);
});

/* ------------------------------------------------------------------ */
/* FREMDE GEGENSTAENDE                                                 */
/* ------------------------------------------------------------------ */

test("CB8 · Ein fremder Ticker faellt auf", () => {
  assert.equal(ok("XOM bei 76 — AAPL sieht aehnlich aus."), false);
  assert.ok(gruende("XOM bei 76 — AAPL sieht aehnlich aus.").includes("AAPL"));
});

test("CB9 · Deutsche Substantive sind keine Ticker", () => {
  /* Sie sind gross geschrieben, aber nicht durchgehend. Ein Pruefer,
     der jedes Substantiv anmeckert, ist unbenutzbar. */
  assert.equal(ok("Die Auswertung bewertet XOM mit 76 Punkten im Score."), true);
});

test("CB10 · Bekannte Nicht-Ticker brauchen keinen Beleg", () => {
  assert.equal(ok("XOM bei 76. Angaben in USD."), true);
  assert.equal(ok("XOM bei 76. Kein ETF, keine EZB."), true);
});

/* ------------------------------------------------------------------ */
/* SPRECHAKTE, DIE KEIN BELEG DECKEN KANN                              */
/* ------------------------------------------------------------------ */

test("CB11 · Eine Prognose ist grundsaetzlich unbelegbar", () => {
  for (const satz of [
    "XOM bei 76 und duerfte weiter zulegen.",
    "XOM bei 76, das Kursziel liegt hoeher.",
    "XOM bei 76 — wir erwarten mehr."
  ]) {
    assert.equal(ok(satz), false, satz);
    assert.ok(gruende(satz).includes("forecast"), satz);
  }
});

test("CB12 · Eine Empfehlung ist keine Beschreibung", () => {
  assert.equal(ok("XOM bei 76. Jetzt einsteigen."), false);
  assert.ok(gruende("XOM bei 76. Jetzt einsteigen.").includes("recommendation"));
});

test("CB13 · Gewissheit ueber Ungewisses faellt auf", () => {
  assert.equal(ok("XOM bei 76 — garantiert der beste Wert."), false);
});

/* ------------------------------------------------------------------ */
/* DIE ANDERE RICHTUNG: WAS DER PRUEFER NICHT VERWERFEN DARF           */
/* ------------------------------------------------------------------ */

test("CB14 · Das Datum aus dem Beleg ist belegt", () => {
  /* Die erste Fassung zerlegte "2026-09-16" in 2026, -09 und -16 und
     verwarf zwei davon als unbelegt — eine Angabe, die direkt aus dem
     Beobachtungszeitpunkt stammt. */
  assert.equal(ok("Stand 2026-09-16."), true);
  assert.equal(ok("Stand 2025-01-01."), false, "ein fremdes Datum aber schon");
});

test("CB15 · Ein Grund fuer die EIGENE Entscheidung ist keine Marktaussage", () => {
  /* Die erste Fassung prueste den ganzen Text auf ein "weil" und
     verwarf damit den Satz, mit dem wir unsere eigene Veroeffentlichung
     begruenden. Ein Pruefer, der richtige Texte verwirft, wird
     abgeschaltet — und dann prueft er gar nichts mehr. */
  assert.equal(ok("Wir zeigen ihn, weil eine nachvollziehbare Zahl mehr wert ist " +
    "als eine Einschaetzung ohne Grundlage."), true);
});

test("CB16 · Ein Grund ueber den GEGENSTAND faellt weiter auf", () => {
  assert.equal(ok("XOM steht bei 76, weil die Nachfrage gestiegen ist."), false);
  assert.ok(gruende("XOM steht bei 76, weil die Nachfrage gestiegen ist.").includes("causality"));
});

test("CB17 · Mit belegtem Anlass ist die Begruendung erlaubt", () => {
  assert.equal(ok("XOM steht bei 76, weil die Zahlen vorliegen.", EVIDENZ,
    { allowCausality: true }), true);
});

test("CB18 · Hashtags behaupten nichts", () => {
  /* Sie stehen ausserhalb des Satzes. Ein Hashtag mit einer Jahreszahl
     waere sonst eine unbelegte Angabe. */
  assert.equal(ok("XOM bei 76. #VisionUniverse #Q3 #2026"), true);
});

/* ------------------------------------------------------------------ */
/* MEHRERE TEILE                                                       */
/* ------------------------------------------------------------------ */

test("CB19 · checkParts nennt den fehlerhaften Teil", () => {
  const r = CB.checkParts({
    hook: "XOM: 76 im Score.",
    caption: "XOM bei 76 — bald mehr.",
    visualLine: "Seit 2019 nicht so hoch."
  }, EVIDENZ, {});

  assert.equal(r.ok, false);
  assert.equal(r.parts.hook.ok, true);
  assert.equal(r.parts.visualLine.ok, false, "2019 ist nicht belegt");
});

test("CB20 · Ein Text ohne jede Zahl ist zulaessig", () => {
  /* "Ein Text ohne Zahl ist besser als ein Text mit einer erfundenen"
     — das muss auch durchgehen, sonst erzwingt der Pruefer Zahlen. */
  assert.equal(ok("Wir bewerten Titel nach einem festen Verfahren."), true);
});

test("CB21 · Eine verneinte Prognose ist keine Prognose", () => {
  /* "Lagebeschreibung, keine Prognose." ist das Gegenteil einer
     Prognose — und wurde von der ersten Fassung als eine gewertet, weil
     das Wort vorkam. Ein Pruefer, der die Verneinung nicht sieht,
     verbietet ausgerechnet den Satz, mit dem ein Text seine eigene
     Grenze benennt. */
  assert.equal(ok("Lagebeschreibung, keine Prognose."), true);
  assert.equal(ok("Wir geben keine Empfehlung."), true);
  assert.equal(ok("Keine Anlageberatung."), true);
});

test("CB22 · Die Verneinung rettet nicht den Rest des Textes", () => {
  /* Sie gilt fuer den Treffer, vor dem sie steht — nicht fuer den
     ganzen Absatz. */
  assert.equal(ok("Keine Anlageberatung. XOM duerfte weiter zulegen."), false);
});

test("CB23 · Ein Kuerzel aus einem Belegsatz ist belegt", () => {
  /* "Kurs ueber SMA50 (3.05 ATR)" bringt ATR und SMA mit. Sie als
     unbekannte Wertpapiere zu melden hiesse, einen Autor fuer das
     Zitieren eines Belegs zu bestrafen. */
  const ev = [{ entity: "XOM", metric: "Trend", value: 82.3,
    statement: "Kurs ueber SMA50 (3.05 ATR)", observedAt: "2026-09-11T00:00:00Z" }];
  assert.equal(CB.check("Kurs ueber SMA50 (3.05 ATR).", ev, {}).ok, true);
});

test("CB24 · Ein fremdes Kuerzel bleibt ein Befund", () => {
  /* Die Lockerung gilt fuer Begriffe AUS den Belegen — nicht fuer
     beliebige Grossbuchstaben. */
  const ev = [{ entity: "XOM", metric: "Trend", value: 82.3,
    statement: "Kurs ueber SMA50 (3.05 ATR)", observedAt: "2026-09-11T00:00:00Z" }];
  assert.equal(CB.check("XOM und AAPL im Vergleich.", ev, {}).ok, false);
});
