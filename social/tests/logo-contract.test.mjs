/* =========================================================================
   social/tests/logo-contract.test.mjs

   DER LOGO-VERTRAG (§11/§18/§44/§47)

   Das Logo lag die ganze Zeit im Repository und stand in
   brand-brain.json. Gebunden hat es keine Engine, durchgesetzt nichts.
   Ein Asset in der Konfiguration steht auf keinem Beitrag.

   Atlas ist eine Figur, das Logo eine Signatur. Der Unterschied ist
   der Grund fuer zwei verschiedene Vertraege: eine Figur darf sich
   bewegen und anders ausgeschnitten sein, eine Signatur ist entweder
   korrekt oder falsch.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const B = require("../engines/brand.js");

const BASIS = {
  referenceAsset: B.LOGO_ASSET_PATH,
  generationMode: "compose",
  transforms: ["scale-uniform", "place"],
  canvas: { width: 1080, height: 1350 },
  box: { x: 660, y: 1120, width: 300, height: 100 },
  kontrast: 7.2
};
const mit = (o) => B.checkLogoUsage(Object.assign({}, BASIS, o));

/* ============================================ Der gangbare Weg */

test("LC1 · Sauber platziert kommt durch", () => {
  /* Die Gegenprobe zu allem darunter. Ohne sie waere jeder Test
     hier von einem Tor, das immer zu ist, nicht zu unterscheiden. */
  const r = mit({});
  assert.equal(r.passed, true, r.explanation);
});

test("LC2 · Das kanonische Asset ist genau eines", () => {
  assert.equal(B.LOGO_ASSET_PATH, "assets/vision-universe-logo.png");
  const roh = readFileSync(new URL("../../" + B.LOGO_ASSET_PATH, import.meta.url));
  assert.equal(roh.slice(0, 8).toString("binary"), "\x89PNG\r\n\x1a\n",
    "Das kanonische Logo ist kein PNG mehr.");
  /* Das Seitenverhaeltnis der Engine muss das der DATEI sein - sonst
     prueft sie gegen eine Zahl, die jemand abgeschrieben hat. */
  const w = roh.readUInt32BE(16), h = roh.readUInt32BE(20);
  assert.ok(Math.abs(w / h - B.LOGO_SEITENVERHAELTNIS) < 0.001,
    "Die Engine rechnet mit " + B.LOGO_SEITENVERHAELTNIS +
    ", die Datei ist " + (w / h));
});

/* ============================================ Was §18 verbietet */

test("LC3 · Das Logo wird nie gemalt (§44)", () => {
  const r = mit({ generationMode: "text-to-image" });
  assert.equal(r.passed, false);
  assert.match(r.explanation, /text-to-image/);
});

test("LC4 · Ein anderes Asset ist nicht das Logo", () => {
  assert.equal(mit({ referenceAsset: "assets/logo-neu.png" }).passed, false);
  assert.equal(mit({ referenceAsset: null }).passed, false);
});

test("LC5 · Nur platzieren und gleichmaessig skalieren", () => {
  /* Umfaerben, drehen, strecken - jedes davon macht eine andere
     Signatur daraus. */
  for (const t of ["recolor", "rotate", "stretch", "crop", "skew"]) {
    const r = mit({ transforms: ["place", t] });
    assert.equal(r.passed, false, t + " kam durch.");
    assert.match(r.explanation, new RegExp(t));
  }
});

test("LC6 · Verzerrung faellt auf", () => {
  /* Das Seitenverhaeltnis IST die Marke. */
  const r = mit({ box: { x: 660, y: 1080, width: 300, height: 160 } });
  assert.equal(r.passed, false);
  assert.match(r.explanation, /verzerrt/);

  /* Und die Gegenprobe: eine winzige Abweichung ist Rundung, keine
     Verzerrung - sonst faellt jede reale Komposition. */
  assert.equal(mit({ box: { x: 660, y: 1120, width: 300, height: 100.3 } }).passed,
    true, "Eine Rundung wurde als Verzerrung gelesen.");
});

test("LC7 · Zu klein ist unlesbar, zu gross ist kein Absender mehr", () => {
  assert.match(mit({ box: { x: 900, y: 1220, width: 100, height: 33 } }).explanation,
    /zu klein/);
  assert.match(mit({ box: { x: 60, y: 900, width: 900, height: 300 } }).explanation,
    /zu gross/);
});

test("LC8 · Die Schutzzone misst an der Hoehe, nicht an der Breite", () => {
  /* -----------------------------------------------------------------
     DIE REGEL, DIE ZUERST ZU STRENG WAR

     Der erste Entwurf nahm die halbe BREITE als Abstand. Bei 3:1 sind
     das anderthalb Logohoehen auf jeder Seite - eine Zahl, die kein
     Markenhandbuch verlangt und die jede sinnvolle Platzierung
     verbietet.

     Gemessen wird deshalb an der eigenen Hoehe. Dieser Test haelt das
     fest, damit es niemand "aufraeumt". */
  const hoehe = BASIS.box.height;
  /* Die Flaeche muss gross genug sein, dass die GROESSENregel nicht
     mitspricht - sonst misst dieser Test zwei Dinge und faellt am
     falschen. Beim ersten Anlauf war die Flaeche 500 px breit, das
     Logo damit 60 % davon, und "zu gross" schlug an, bevor die
     Schutzzone ueberhaupt geprueft wurde. */
  const flaeche = { width: 800, height: 600 };

  /* Genau an der Grenze: Abstand gleich Hoehe haelt. */
  const knapp = mit({ canvas: flaeche,
    box: { x: hoehe, y: hoehe, width: 300, height: hoehe } });
  assert.equal(knapp.passed, true, knapp.explanation);

  /* Ein Pixel weniger nicht. */
  const zuEng = mit({ canvas: flaeche,
    box: { x: hoehe - 1, y: hoehe, width: 300, height: hoehe } });
  assert.equal(zuEng.passed, false);
  assert.match(zuEng.explanation, /Schutzzone/);
});

test("LC9 · Ohne gemessenen Kontrast kein Bestehen", () => {
  /* §18 nennt "mit dem Hintergrund verschmelzen". Das laesst sich
     nicht schaetzen - und nicht gemessen ist nicht bestanden. */
  for (const k of [null, undefined, "", "hell"]) {
    const r = mit({ kontrast: k });
    assert.equal(r.passed, false, "Kontrast " + String(k) + " kam durch.");
    assert.match(r.explanation, /nicht gemessen/);
  }
  assert.equal(mit({ kontrast: 2.4 }).passed, false, "2.4:1 kam durch.");
  assert.equal(mit({ kontrast: 3 }).passed, true, "Genau 3:1 fiel durch.");
});

test("LC10 · Ohne Lage laesst sich nichts pruefen - und das ist kein Bestehen", () => {
  assert.equal(mit({ box: null }).passed, false);
  assert.equal(mit({ canvas: null }).passed, false);
  assert.equal(mit({ box: { x: 0, y: 0, width: 300 } }).passed, false);
});

/* ============================================ Getrennt von Atlas */

test("LC11 · Logo und Atlas haben verschiedene Vertraege", () => {
  /* Sie in einen zu ziehen hiesse, einer Signatur die Freiheiten
     einer Figur zu geben - oder umgekehrt. */
  assert.notDeepEqual(B.LOGO_TRANSFORMS, B.ATLAS_TRANSFORMS);
  for (const t of B.LOGO_TRANSFORMS) {
    assert.ok(!B.ATLAS_TRANSFORMS.includes(t) || t === "scale",
      "Die Listen laufen zusammen: " + t);
  }
  /* Und die Atlas-Pruefung akzeptiert das Logo nicht als Referenz. */
  assert.equal(B.checkAtlasUsage({ referenceAsset: B.LOGO_ASSET_PATH,
    generationMode: "compose", transforms: [] }).passed, false);
});
