/* =========================================================================
   VU SOCIAL — Bildguete (VQ1–VQ14)

   -------------------------------------------------------------------------
   DER BEFUND, DER DIESE DATEI AUSGELOEST HAT
   -------------------------------------------------------------------------

   Die erste gerenderte Karte war ein gueltiges JPEG in der richtigen
   Groesse mit der richtigen Schrift:

       76
       Technical Opportunity Score
       XOM: 76 im Technical Opportunity Score.

   Dreimal dasselbe. Technisch einwandfrei, inhaltlich leer.

   Der Renderer hatte keinen Begriff davon, dass eine Karte etwas SAGEN
   muss — nur davon, dass sie gezeichnet werden kann. VQ1 haelt genau
   diese Karte fest.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VQ = require("../engines/visual-quality.js");

const karte = (over = {}) => ({ ebenen: Object.assign({
  entitaet: "XOM", zahl: "76", zahlText: "Technical Opportunity Score",
  aussage: "Lagebeschreibung, keine Prognose.", quelle: "vu.technical"
}, over) });

test("VQ1 · Die erste Karte faellt durch", () => {
  const r = VQ.check(karte({ aussage: "XOM: 76 im Technical Opportunity Score." }), { skipDirection: true });
  assert.equal(r.passed, false);
  const ids = r.blocking.map((b) => b.id);
  assert.ok(ids.includes("redundant-number"));
  assert.ok(ids.includes("redundant-label"));
});

test("VQ2 · Die jetzige Karte besteht", () => {
  const r = VQ.check(karte(), { skipDirection: true });
  assert.equal(r.passed, true);
  assert.equal(r.score, 100);
});

test("VQ3 · Eine Zahl ohne Bezeichnung blockiert", () => {
  /* 76 wovon? */
  assert.equal(VQ.check(karte({ zahlText: null }), { skipDirection: true }).passed, false);
});

test("VQ4 · Eine Zahl ohne Quelle blockiert", () => {
  assert.equal(VQ.check(karte({ quelle: null }), { skipDirection: true }).passed, false);
});

test("VQ5 · Eine Karte OHNE Zahl braucht keine Quelle", () => {
  /* Die Quellenpflicht haengt an der Zahl, nicht an der Karte. Die
     erste Fassung verwarf typografische Aussagen, die gar keine Daten
     zeigen — und damit eine ganze Bildform. */
  const r = VQ.check({ ebenen: { entitaet: null, zahl: null, zahlText: null,
    aussage: "Wir bewerten jeden Titel nach demselben Verfahren.", quelle: null } },
    { skipDirection: true });
  assert.equal(r.passed, true, JSON.stringify(r.blocking));
});

test("VQ6 · Eine Karte ohne Aussage ist ein Screenshot", () => {
  assert.equal(VQ.check(karte({ aussage: null }), { skipDirection: true }).passed, false);
});

test("VQ7 · Die Aussage darf die Zahl nicht wiederholen", () => {
  assert.equal(VQ.check(karte({ aussage: "Der Wert liegt bei 76." }), { skipDirection: true }).passed, false);
});

test("VQ8 · Die Aussage darf die Bezeichnung nicht wiederholen", () => {
  assert.equal(VQ.check(karte({
    aussage: "Das ist der Technical Opportunity Score." }), { skipDirection: true }).passed, false);
});

test("VQ9 · Eine Wiederholung des Hooks ist ein Hinweis, keine Sperre", () => {
  /* Bild und Text sollen zusammen mehr sagen als einzeln — aber eine
     Ueberschneidung ist eine Schwaeche und kein Fehler. */
  const r = VQ.check(karte({ aussage: "Lagebeschreibung, keine Prognose." }),
    { hook: "Lagebeschreibung, keine Prognose.", skipDirection: true });
  assert.equal(r.passed, true);
  assert.ok(r.warnings.some((w) => w.id === "redundant-hook"));
});

test("VQ10 · Zu langer Text blockiert", () => {
  /* Er passt nicht in die Flaeche. Das faellt sonst erst im fertigen
     Bild auf — und dann steht er abgeschnitten im Konto. */
  assert.equal(VQ.check(karte({ aussage: "x".repeat(130) }), { skipDirection: true }).passed, false);
});

test("VQ11 · Ein zu langer Gegenstand ist ein Hinweis", () => {
  const r = VQ.check(karte({ entitaet: "EINSEHRLANGERNAME" }), { skipDirection: true });
  assert.ok(r.warnings.some((w) => w.id === "entity-too-long"));
  assert.equal(r.passed, true);
});

test("VQ12 · Zwei Woerter tragen selten eine Aussage", () => {
  const r = VQ.check(karte({ aussage: "Gute Lage." }), { skipDirection: true });
  assert.ok(r.warnings.some((w) => w.id === "statement-thin"));
});

test("VQ13 · Der Wert sinkt mit jedem Befund", () => {
  const gut = VQ.check(karte(), { skipDirection: true }).score;
  const mittel = VQ.check(karte({ aussage: "Gute Lage." }), { skipDirection: true }).score;
  const schlecht = VQ.check(karte({ aussage: "XOM: 76 im Technical Opportunity Score." }),
    {}).score;
  assert.ok(gut > mittel && mittel > schlecht, gut + " " + mittel + " " + schlecht);
});

test("VQ14 · Die Ueberschneidung wird gezaehlt, nicht geschaetzt", () => {
  assert.equal(VQ.overlap("a b c", "a b c"), 1);
  assert.equal(VQ.overlap("a b c d", "a b"), 0.5);
  assert.equal(VQ.overlap("", "a"), 0);
});


/* ------------------------------------------------------------------ */
/* §4 · DIE RICHTUNG IST EIN EIGENER FEHLER                            */
/* ------------------------------------------------------------------ */

test("VQ13 · Ohne Angabe zur Richtung gilt sie als ungeprueft, nicht als bestanden", () => {
  /* Fail-closed, dieselbe Regel wie ueberall: was nicht geprueft
     wurde, hat nicht bestanden. Ein Tor, das bei fehlender Angabe
     durchlaesst, ist genau dann offen, wenn es gebraucht wird. */
  const r = VQ.check(karte(), {});
  assert.equal(r.passed, false);
  assert.equal(r.failureType, VQ.VISUAL_DIRECTION_INCOMPLETE);
});

test("VQ14 · Eine unvollstaendige Richtung heisst VISUAL_DIRECTION_INCOMPLETE", () => {
  const r = VQ.check(karte(), { directionReady: false,
    directionMissing: ["coreIdea", "mobileFocalPoint"] });
  assert.equal(r.failureType, "VISUAL_DIRECTION_INCOMPLETE");
  assert.match(r.blocking.find((b) => b.id === "direction-incomplete").message,
    /coreIdea, mobileFocalPoint/);
});

test("VQ15 · Sie heisst NIE Inhalts-, Provider- oder Bildfehler", () => {
  /* Unter einem dieser Namen gebucht wuerde das Lernen irgendwann
     glauben, ein Archetyp trage nicht - weil einmal eine Bildidee
     fehlte. Dieselbe Verwechslung verbietet asset-store.js fuer den
     Transport. */
  const r = VQ.check(karte(), { directionReady: false });
  for (const falsch of ["CONTENT_FAILED", "PROVIDER_FAILED", "IMAGE_FAILED"]) {
    assert.notEqual(r.failureType, falsch);
    assert.ok(VQ.NIEMALS.includes(falsch), "muesste ausgeschlossen sein: " + falsch);
  }
});

test("VQ16 · Steht die Richtung, entscheidet wieder die Flaeche", () => {
  const gut = VQ.check(karte(), { directionReady: true });
  assert.equal(gut.passed, true);
  assert.equal(gut.failureType, null);

  const schlecht = VQ.check(karte({ aussage: null }), { directionReady: true });
  assert.equal(schlecht.passed, false);
  assert.equal(schlecht.failureType, "VISUAL_LAYOUT_QUALITY_FAILED");
});

test("VQ17 · Die Richtung kommt zuerst, also benennt sie den Fehler", () => {
  /* Eine Karte kann beides haben: keine Richtung UND eine schwache
     Flaeche. Dann ist die Richtung der Befund - an der Flaeche zu
     arbeiten, bevor gesagt wurde, was das Bild zeigen soll, waere die
     falsche Reihenfolge. */
  const r = VQ.check(karte({ aussage: null }), { directionReady: false });
  assert.equal(r.failureType, "VISUAL_DIRECTION_INCOMPLETE");
  assert.ok(r.blocking.length >= 2);
});

/* ------------------------------------------------------------------ */
/* §4 · AUCH DER KOMPOSITIONSWEG GEHT DURCH DAS TOR                    */
/* ------------------------------------------------------------------ */

test("VQ18 · Der Kompositionsweg umgeht das Tor nicht", async () => {
  /* Dieser Pfad ist der, den der reale Zyklus wirklich geht - und er
     lief bis §4 an VisualQuality.check() vorbei. Ein Tor, das der
     Produktionsweg umgeht, ist keines. */
  const R = await import("../../scripts/social/render-asset.mjs");
  const kompo = { ok: true, kind: "CHART", explanation: "270 Punkte",
    width: 900, height: 500, points: [{ x: 1, y: 1 }], path: "M0 0",
    area: "M0 0", direction: "up" };
  const ebenen = { entitaet: "XOM", aussage: "Der Verlauf seit Januar",
    quelle: "Tiingo, Stand 11.09.2026" };

  const ohne = R.planKomposition({ packageId: "p1", visualType: "CHART",
    hook: "H" }, kompo, ebenen);
  assert.equal(ohne.ok, false);
  assert.equal(ohne.reason, "visualDirection");
  assert.equal(ohne.failureType, "VISUAL_DIRECTION_INCOMPLETE");
  /* Ausdruecklich NICHT "keine Komposition" - die Komposition ist in
     Ordnung, die Richtung fehlt. */
  assert.notEqual(ohne.reason, "noComposition");

  const mit = R.planKomposition({ packageId: "p1", visualType: "CHART",
    hook: "H", visualDirectionReady: true }, kompo, ebenen);
  assert.equal(mit.ok, true);
  assert.equal(mit.quality.failureType, null);
});
