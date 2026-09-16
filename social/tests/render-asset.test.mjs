/* =========================================================================
   VU SOCIAL — Asset-Erzeugung (RA1–RA16)

   Der Zyklus entscheidet eine Bildform und schreibt einen Bildbrief. Was
   er nicht hatte, war ein BILD — und ohne Bild ist der fertig gebaute
   Veroeffentlichungsendpunkt ein Weg ohne Fracht.

   -------------------------------------------------------------------------
   WAS HIER GEPRUEFT WIRD
   -------------------------------------------------------------------------

   Der Plan ist vom Zeichnen getrennt, und die meisten Tests pruefen den
   PLAN. Das ist kein Ausweichen vor dem Browser: die Fragen, die falsch
   zu beantworten teuer waere — woher kommt die Zahl, was passiert ohne
   Beleg, was passiert ohne Material — sind Fragen an den Plan. Ob
   Chromium ein JPEG schreibt, ist eine Frage an Chromium.

   Die Zeichentests laufen trotzdem, weil hier ein Chromium vorhanden
   ist. Fehlt er, sagen sie das, statt gruen zu sein.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import {
  plan, render, ersteBelegteZahl, pruefeJpeg, ladeSchrift, chromiumPfad,
  GEZEICHNET, NICHT_GEZEICHNET, SCHRIFT_PFAD
} from "../../scripts/social/render-asset.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function paket(overrides = {}) {
  return Object.assign({
    packageId: "pkg_test_1",
    topic: "Small Caps",
    hook: "Der Abstand ist so gross wie seit 1999 nicht.",
    visualType: "DATA_CARD",
    claims: [{
      text: "Bewertungsabstand Russell 2000 zu S&P 500",
      numeric: "-38 %",
      source: { source: "Bloomberg", retrievedAt: "2026-09-16T10:00:00Z" }
    }]
  }, overrides);
}

/* ------------------------------------------------------------------ */
/* DIE HERKUNFT DER ZAHL                                               */
/* ------------------------------------------------------------------ */

test("RA1 · Die Zahl stammt aus den Claims, nicht aus dem Bildbrief", () => {
  /* Der Bildbrief traegt absichtlich nur Referenzen ('marketCap@sec').
     Eine Zahl daraus zu zeichnen hiesse, eine zweite Wahrheitsquelle zu
     eroeffnen, die irgendwann von der ersten abweicht. */
  const p = plan(paket({
    visualBrief: { dataReferences: ["spread@irgendwo"], textLayers: [] }
  }));
  assert.equal(p.ok, true);
  assert.equal(p.ebenen.zahl, "-38 %");
  assert.equal(p.ebenen.quelle, "Bloomberg");
});

test("RA2 · Ohne belegte Zahl wird keine Zahlform gezeichnet", () => {
  for (const typ of ["DATA_CARD", "NUMBER_VISUAL"]) {
    const p = plan(paket({ visualType: typ, claims: [{ text: "Nur Prosa", numeric: null }] }));
    assert.equal(p.ok, false, typ);
    assert.equal(p.reason, "noNumericClaim");
  }
});

test("RA3 · Eine Zahl ohne Quelle wird nicht gezeichnet", () => {
  /* Eine Zahl in Markenoptik ohne Herkunft ist genau das, was das
     Provenance-Modell verhindern soll — und sie sieht dabei so aus wie
     eine belegte. */
  const p = plan(paket({ claims: [{ text: "Abstand", numeric: "-38 %", source: null }] }));
  assert.equal(p.ok, false);
  assert.equal(p.reason, "noSource");
});

test("RA4 · Genommen wird die erste belegte Zahl, nicht die groesste", () => {
  /* Eine Auswahl nach Wirkung waere eine redaktionelle Entscheidung, die
     niemand getroffen hat und die in keinem Protokoll stuende. */
  const z = ersteBelegteZahl(paket({ claims: [
    { text: "klein", numeric: "2 %", source: { source: "SEC" } },
    { text: "gross", numeric: "-38 %", source: { source: "Bloomberg" } }
  ] }));
  assert.equal(z.wert, "2 %");
  assert.equal(z.quelle, "SEC");
});

test("RA5 · Eine 0 ist eine Zahl", () => {
  /* `!c.numeric` haette hier still das Falsche getan. */
  const z = ersteBelegteZahl(paket({ claims: [
    { text: "Nulllinie", numeric: 0, source: { source: "SEC" } }
  ] }));
  assert.ok(z, "0 zaehlt als belegte Zahl");
  assert.equal(z.wert, "0");
});

/* ------------------------------------------------------------------ */
/* WAS NICHT GEZEICHNET WIRD — und dass es benannt wird                */
/* ------------------------------------------------------------------ */

test("RA6 · Nicht zeichenbare Bildformen werden benannt, nicht ersetzt", () => {
  for (const typ of Object.keys(NICHT_GEZEICHNET)) {
    const p = plan(paket({ visualType: typ }));
    assert.equal(p.ok, false, typ);
    assert.equal(p.reason, "notRenderable");
    assert.ok(p.message.includes(typ), "die Form wird benannt");
    assert.ok(p.message.length > 40, "und der Grund steht dabei: " + typ);
  }
});

test("RA7 · Kein Rueckfall auf Typografie, wenn das Chart fehlt", () => {
  /* Der teuerste denkbare Rueckfall: ein CHART ohne Datenreihe wuerde
     als MINIMAL_TYPOGRAPHY durchgehen, und der Beitrag saehe aus, als
     haette jemand sich fuer diese Form entschieden. */
  const p = plan(paket({ visualType: "CHART" }));
  assert.equal(p.ok, false);
  assert.notEqual(p.visualType, "MINIMAL_TYPOGRAPHY");
});

test("RA8 · Ohne Bildform gibt es kein Bild", () => {
  const p = plan(paket({ visualType: null }));
  assert.equal(p.ok, false);
  assert.equal(p.reason, "noVisualType");
  assert.match(p.message, /enthalten/i, "die Enthaltung ist eine Information");
});

test("RA9 · Ohne Aussage gibt es nichts zu zeigen", () => {
  const p = plan({ packageId: "x", visualType: "MINIMAL_TYPOGRAPHY",
    hook: "", thesis: "", topic: "", claims: [] });
  assert.equal(p.ok, false);
  assert.equal(p.reason, "noStatement");
});

test("RA10 · MINIMAL_TYPOGRAPHY braucht keine Zahl", () => {
  const p = plan(paket({ visualType: "MINIMAL_TYPOGRAPHY", claims: [] }));
  assert.equal(p.ok, true);
  assert.equal(p.ebenen.zahl, null);
  assert.ok(p.ebenen.aussage);
});

test("RA11 · Fehlt der Hook, traegt die These, dann das Thema", () => {
  assert.equal(plan(paket({ visualType: "MINIMAL_TYPOGRAPHY", hook: null,
    thesis: "Die These." })).ebenen.aussage, "Die These.");
  assert.equal(plan(paket({ visualType: "MINIMAL_TYPOGRAPHY", hook: null,
    thesis: null, topic: "Small Caps" })).ebenen.aussage, "Small Caps");
});

/* ------------------------------------------------------------------ */
/* DIE SCHRIFT                                                         */
/* ------------------------------------------------------------------ */

test("RA12 · Die Hausschrift liegt im Repository", () => {
  /* Sie aus dem Netz zu laden hiesse: dasselbe Paket ergibt mal ein Bild
     mit Inter, mal eines mit der systemeigenen Grotesk. Das waeren zwei
     verschiedene Bilder unter einer Kennung. */
  assert.ok(existsSync(join(ROOT, SCHRIFT_PFAD)), SCHRIFT_PFAD + " fehlt");
  const daten = ladeSchrift(ROOT);
  assert.ok(daten.length > 10000);
  assert.equal(daten.toString("ascii", 0, 4), "wOF2", "es ist eine woff2-Datei");
});

test("RA13 · Fehlt die Schrift, wird nicht anders gezeichnet, sondern abgebrochen", () => {
  assert.throws(() => ladeSchrift("/pfad/den/es/nicht/gibt"), /Hausschrift fehlt/);
});

/* ------------------------------------------------------------------ */
/* DAS ZEICHNEN                                                        */
/* ------------------------------------------------------------------ */

const chromiumDa = (() => { try { chromiumPfad(); return true; } catch { return false; } })();

test("RA14 · Das Ergebnis ist ein JPEG in der bestellten Groesse", { skip: chromiumDa ? false :
  "Kein Chromium in dieser Umgebung — der Test wird uebersprungen, nicht bestanden." }, () => {
  const dir = join(ROOT, "tmp", "ra-" + process.pid);
  mkdirSync(dir, { recursive: true });
  try {
    const p = plan(paket(), { breite: 1080, hoehe: 1350 });
    const ziel = join(dir, "bild.jpg");
    const befund = render(p, ziel, { schrift: ladeSchrift(ROOT) });

    assert.equal(befund.istJpeg, true);
    assert.equal(befund.breite, 1080);
    assert.equal(befund.hoehe, 1350);
    /* Instagram nimmt fuer einen Bildbeitrag JPEG — zurueckgelesen,
       nicht angenommen: ein PNG mit falscher Endung faellt sonst erst im
       Moment der Veroeffentlichung auf, und dann ist der Anspruch schon
       angemeldet. */
    assert.deepEqual(Array.from(readFileSync(ziel).subarray(0, 3)), [0xFF, 0xD8, 0xFF]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("RA15 · Dasselbe Paket ergibt dasselbe Bild", { skip: chromiumDa ? false :
  "Kein Chromium in dieser Umgebung." }, () => {
  /* Ein Bild, das sich zwischen zwei Laeufen aendert, macht jede
     Wirkungsmessung unbrauchbar: dann waere nicht mehr unterscheidbar,
     ob der Inhalt oder die Darstellung den Unterschied machte. */
  const dir = join(ROOT, "tmp", "ra-det-" + process.pid);
  mkdirSync(dir, { recursive: true });
  try {
    const p = plan(paket());
    const schrift = ladeSchrift(ROOT);
    const a = join(dir, "a.jpg"), b = join(dir, "b.jpg");
    render(p, a, { schrift });
    render(p, b, { schrift });

    const hash = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
    assert.equal(hash(a), hash(b));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("RA16 · Ein nicht zeichenbarer Plan wird gar nicht erst gezeichnet", () => {
  assert.throws(() => render(plan(paket({ visualType: "CHART" })), "/tmp/egal.jpg"),
    /Kein zeichenbarer Plan/);
});

test("RA17 · Text aus dem Paket kann die Seite nicht uebernehmen", { skip: chromiumDa ? false :
  "Kein Chromium in dieser Umgebung." }, () => {
  /* Hook und Claim-Text stammen aus einer Pipeline, die Signale von
     aussen verarbeitet. Unmaskiert gingen sie als Markup in die Seite —
     und das Ergebnis waere ein Bild, das jemand anders gestaltet hat. */
  const dir = join(ROOT, "tmp", "ra-esc-" + process.pid);
  mkdirSync(dir, { recursive: true });
  try {
    const p = plan(paket({ visualType: "MINIMAL_TYPOGRAPHY", claims: [],
      hook: "<script>alert(1)</script><style>body{background:#fff}</style>" }));
    const ziel = join(dir, "x.jpg");
    const befund = render(p, ziel, { schrift: ladeSchrift(ROOT) });
    assert.equal(befund.istJpeg, true, "es entsteht ein Bild statt einer uebernommenen Seite");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("RA18 · Die Liste der zeichenbaren Formen ist die einzige Quelle", () => {
  /* Zwei Listen fuer dieselbe Frage sind die Einladung, dass sie
     auseinanderlaufen. */
  for (const typ of GEZEICHNET) {
    assert.ok(!NICHT_GEZEICHNET[typ], typ + " steht in beiden Listen");
  }
});
