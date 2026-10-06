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
import { existsSync, rmSync, mkdirSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);

import {
  plan, render, planUebernahme, uebernimm, planGeschichte, seiteGeschichte,
  ersteBelegteZahl, pruefeJpeg, ladeSchrift, chromiumPfad,
  GEZEICHNET, NICHT_GEZEICHNET, SCHRIFT_PFAD, textOnVisualAussage, messeSeite, MESS_SKRIPT
} from "../../scripts/social/render-asset.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function paket(overrides = {}) {
  return Object.assign({
    packageId: "pkg_test_1",
    topic: "Small Caps",
    /* Seit §4 traegt jedes Paket, das aus dem Zyklus kommt, das
       Ergebnis der Richtungspruefung mit. Das Tor ist fail-closed:
       ohne diese Angabe gaelte die Richtung als ungeprueft. Die
       Tests unten pruefen Zeichenregeln, nicht die Richtung - also
       steht sie hier ausdruecklich auf geprueft. */
    visualDirectionReady: true,
    visualDirectionMissing: [],
    hook: "Der Abstand ist so gross wie seit 1999 nicht.",
    visualType: "DATA_CARD",
    /* Die Form, die die Content-Engine wirklich liefert: der Wert und
       die Bezeichnung als ZWEI Belege mit derselben Quelle. Auch eine
       Bezeichnung wie "52-Wochen-Hoch" ist belegpflichtig. */
    claims: [
      { text: "-38 %", numeric: -38,
        source: { source: "Bloomberg", retrievedAt: "2026-09-16T10:00:00Z" } },
      { text: "Bewertungsabstand Russell 2000 zu S&P 500", numeric: null,
        source: { source: "Bloomberg", retrievedAt: "2026-09-16T10:00:00Z" } }
    ]
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
  assert.equal(p.ebenen.zahlText, "Bewertungsabstand Russell 2000 zu S&P 500");
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
    { text: "2 %", numeric: 2, source: { source: "SEC" } },
    { text: "Kleiner Wert", numeric: null, source: { source: "SEC" } },
    { text: "-38 %", numeric: -38, source: { source: "Bloomberg" } },
    { text: "Grosser Wert", numeric: null, source: { source: "Bloomberg" } }
  ] }));
  assert.equal(z.wert, "2 %");
  assert.equal(z.quelle, "SEC");
  assert.equal(z.bezeichnung, "Kleiner Wert",
    "die Bezeichnung stammt vom Beleg mit DERSELBEN Quelle");
});

test("RA5 · Eine 0 ist eine Zahl", () => {
  /* `!c.numeric` haette hier still das Falsche getan. */
  const z = ersteBelegteZahl(paket({ claims: [
    { text: "0 %", numeric: 0, source: { source: "SEC" } },
    { text: "Nulllinie", numeric: null, source: { source: "SEC" } }
  ] }));
  assert.ok(z, "0 zaehlt als belegte Zahl");
  assert.equal(z.wert, "0 %");
  assert.equal(z.bezeichnung, "Nulllinie");
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
/* DER SATZ, VOR DEM ZEICHNEN - NICHT NUR DABEI                        */
/*                                                                      */
/* Fuenf reale Pakete blieben ohne Bild, weil run-social-cycle.mjs den */
/* Satz fuer `oneSecondMessage` nur fuer den Kompositionspfad kannte  */
/* und fuer DATA_CARD/MINIMAL_TYPOGRAPHY nie fragte - obwohl plan()   */
/* denselben Satz laengst berechnet. textOnVisualAussage() ist jetzt  */
/* die einzige Herleitung, von beiden benutzt.                        */
/* ------------------------------------------------------------------ */

test("RA11b · textOnVisualAussage liefert denselben Satz wie der Bildplan", () => {
  const p = paket({ visualType: "DATA_CARD" });
  assert.equal(textOnVisualAussage(p).text, plan(p).ebenen.aussage);
});

test("RA11c · textOnVisualAussage folgt derselben Kette: Hook, dann These, dann Thema", () => {
  assert.equal(textOnVisualAussage(paket({ hook: "Der Hook." })).text, "Der Hook.");
  assert.equal(textOnVisualAussage(paket({ hook: null, thesis: "Die These." })).text,
    "Die These.");
  assert.equal(textOnVisualAussage(paket({ hook: null, thesis: null,
    topic: "Small Caps" })).text, "Small Caps");
});

test("RA11d · Ohne jede Quelle bleibt der Satz leer, nicht erfunden", () => {
  const leer = textOnVisualAussage(paket({ hook: "", thesis: "", topic: "" }));
  assert.equal(leer.text, null);
  assert.equal(leer.herkunft, null);
});

test("RA11e · Die Herkunft benennt woher der Satz kommt", () => {
  assert.equal(textOnVisualAussage(paket({ hook: "Der Hook." })).herkunft, "pkg.hook");
  assert.equal(textOnVisualAussage(paket({ hook: null, thesis: "Die These." })).herkunft,
    "pkg.thesis");
  assert.equal(textOnVisualAussage(paket({ hook: null, thesis: null,
    topic: "Small Caps" })).herkunft, "pkg.topic");
});

test("RA11f · Eine ausdrueckliche Hook-Textebene fuehrt vor pkg.hook", () => {
  const p = paket({ hook: "Der Hook.", visualBrief: { textLayers: [
    { role: "HOOK", text: "Die Textebene." }
  ] } });
  assert.equal(textOnVisualAussage(p).text, "Die Textebene.");
  assert.equal(textOnVisualAussage(p).herkunft, "visualBrief.textLayers");
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


test("RA19 · Eine Zahl ohne Bezeichnung wird nicht gezeichnet", () => {
  /* Der Fall, der im ersten echten Zykluslauf herauskam: die Karte zeigte
     "76" und darunter noch einmal "76". Das ist schlimmer als keine
     Karte, denn es sieht aus wie Daten und sagt nichts — 76 wovon? */
  const p = plan(paket({ claims: [
    { text: "76", numeric: 76, source: { source: "vu.technical" } }
  ] }));
  assert.equal(p.ok, false);
  assert.equal(p.reason, "noNumberContext");
  assert.match(p.message, /WOVON/);
});

test("RA20 · Die Bezeichnung muss zur selben Quelle gehoeren", () => {
  /* Eine Bezeichnung von anderswoher unter eine Zahl zu setzen, waere
     eine Zuordnung, die niemand geprueft hat — und sie stuende im Bild
     wie eine belegte. */
  const p = plan(paket({ claims: [
    { text: "76 %", numeric: 76, source: { source: "vu.technical" } },
    { text: "Marktkapitalisierung", numeric: null, source: { source: "SEC" } }
  ] }));
  assert.equal(p.ok, false);
  assert.equal(p.reason, "noNumberContext");
});

test("RA21 · Der Anzeigewert traegt die Einheit", () => {
  /* `numeric` ist 76, `text` ist "76 %". Eine Zahl ohne Einheit ist eine
     andere Aussage. */
  const p = plan(paket({ claims: [
    { text: "76 %", numeric: 76, source: { source: "SEC" } },
    { text: "Relative Staerke", numeric: null, source: { source: "SEC" } }
  ] }));
  assert.equal(p.ebenen.zahl, "76 %");
});

/* ------------------------------------------------------------------ */
/* DAS BILD, DAS SCHON EXISTIERT                                       */
/*                                                                     */
/* Der Creative Agent ist Visual Producer. Sein Bild wurde erzeugt,    */
/* committet und frisch zurueckgelesen. Zeichnete der Zyklus daraufhin */
/* seine eigene Karte, waere es im letzten Schritt verschwunden.       */
/* ------------------------------------------------------------------ */

function testPng(breite, hoehe) {
  const zlib = require("node:zlib");
  const crc = (buf) => {
    let t = [];
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    let x = 0xFFFFFFFF;
    for (const b of buf) x = t[(x ^ b) & 0xFF] ^ (x >>> 8);
    return (x ^ 0xFFFFFFFF) >>> 0;
  };
  const chunk = (typ, daten) => {
    const l = Buffer.alloc(4); l.writeUInt32BE(daten.length);
    const k = Buffer.concat([Buffer.from(typ, "ascii"), daten]);
    const p = Buffer.alloc(4); p.writeUInt32BE(crc(k));
    return Buffer.concat([l, k, p]);
  };
  const zeile = Buffer.concat([Buffer.from([0]),
    Buffer.concat(Array.from({ length: breite }, () => Buffer.from([200, 40, 90])))]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(breite, 0); ihdr.writeUInt32BE(hoehe, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(Array.from({ length: hoehe }, () => zeile)))),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

test("RA20 · Ein nicht zurueckgelesenes Asset wird nicht uebernommen", () => {
  /* Der Bildproof hat einen abgeschnittenen Transfer produziert, dessen
     Anfang intakt war. Nur ein bestaetigtes Asset darf durch. */
  const p = planUebernahme({}, { asset_path: "a/b.png", state: "COMMITTED",
    width: 1080, height: 1350 });
  assert.equal(p.ok, false);
  assert.equal(p.reason, "assetNotVerified");
});

test("RA21 · Ohne Abmessungen gibt es keine Uebernahme", () => {
  const p = planUebernahme({}, { asset_path: "a/b.png", state: "READBACK_VERIFIED" });
  assert.equal(p.ok, false);
  assert.equal(p.reason, "noDimensions");
});

test("RA22 · Die Kartenpruefung ist hier nicht anwendbar und sagt das", () => {
  /* Ein generatives Bild traegt laut Brief keinen Text. Eine Punktzahl
     zu erfinden waere schlimmer als keine — und stillschweigend zu
     bestehen waere am schlimmsten. */
  const p = planUebernahme({}, { asset_path: "a/b.png", state: "READBACK_VERIFIED",
    width: 1080, height: 1350 });
  assert.equal(p.ok, true);
  assert.equal(p.visualType, "GENERATIVE");
  assert.equal(p.quality.applicable, false);
  assert.ok(p.quality.explanation);
});

test("RA23 · Ein veraendertes Asset auf dem Datentraeger faellt auf", { skip: chromiumDa ? false :
  "Kein Chromium in dieser Umgebung." }, () => {
  /* Zwischen Pruefung und Uebernahme liegt ein Schreibvorgang. */
  const wurzel = mkdtempSync(join(tmpdir(), "vu-uebernahme-"));
  try {
    mkdirSync(join(wurzel, "a"), { recursive: true });
    writeFileSync(join(wurzel, "a/b.png"), testPng(64, 80));
    const p = planUebernahme({}, { asset_path: "a/b.png", state: "READBACK_VERIFIED",
      width: 64, height: 80, mime_type: "image/png",
      asset_sha256: "0".repeat(64) });
    assert.throws(() => uebernimm(p, join(wurzel, "ziel.jpg"), { root: wurzel }),
      /Hash/);
  } finally { rmSync(wurzel, { recursive: true, force: true }); }
});

test("RA24 · Die Uebernahme wechselt das Format und bearbeitet das Bild nicht",
  { skip: chromiumDa ? false : "Kein Chromium in dieser Umgebung." }, () => {
  const wurzel = mkdtempSync(join(tmpdir(), "vu-uebernahme-"));
  try {
    const bild = testPng(240, 300);
    mkdirSync(join(wurzel, "a"), { recursive: true });
    writeFileSync(join(wurzel, "a/b.png"), bild);
    const sha = require("node:crypto").createHash("sha256").update(bild).digest("hex");

    const p = planUebernahme({}, { asset_path: "a/b.png", state: "READBACK_VERIFIED",
      width: 240, height: 300, mime_type: "image/png", asset_sha256: sha });
    const ziel = join(wurzel, "ziel.jpg");
    const b = uebernimm(p, ziel, { root: wurzel });

    assert.equal(b.istJpeg, true);
    assert.equal(b.breite, 240);
    assert.equal(b.hoehe, 300);
    assert.equal(b.modus, "uebernahme");
    assert.equal(b.quelle, "a/b.png");
  } finally { rmSync(wurzel, { recursive: true, force: true }); }
});

/* ------------------------------------------------------------------ */
/* DIE MESSUNG FINDET STATT, AUCH WENN DIE SCHRIFT NIE "READY" MELDET  */
/*                                                                      */
/* Der reale MANUAL_NOW-Lauf 35711481190 zeigte: alle fuenf Pakete     */
/* liessen sich zeichnen (Chromium schrieb ein korrektes JPEG), aber   */
/* der Atlas- und der SCROLL_STOP-Vertrag scheiterten mit "nicht       */
/* gemessen" - document.fonts.ready loeste in der Chromium-Fassung des */
/* Runners nie auf, obwohl die Schrift eingebettet ist (kein Netzwerk  */
/* noetig). MESS_SKRIPT wartete davor ausschliesslich auf dieses       */
/* Versprechen; ohne es lief messen() nie, und --dump-dom erfasste     */
/* eine Seite ohne jede Messung - nicht weil das Bild falsch war,      */
/* sondern weil niemand je gemessen hat.                               */
/* ------------------------------------------------------------------ */

function messseiteMit(zusatzSkript) {
  const wurzel = mkdtempSync(join(tmpdir(), "vu-messen-"));
  const pfad = join(wurzel, "seite.html");
  writeFileSync(pfad, `<!doctype html><html><body>
<div data-vu-rolle="TEST">Hallo</div>
<img data-vu-figur="ATLAS" src="data:image/png;base64,${
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
  }" style="width:10px;height:10px">
${zusatzSkript || ""}
${MESS_SKRIPT}
</body></html>`);
  try { return messeSeite(pfad, 100, 100); } finally { rmSync(wurzel, { recursive: true, force: true }); }
}

test("RA25 · Die normale Messung liest Text und Figur", { skip: chromiumDa ? false :
  "Kein Chromium in dieser Umgebung." }, () => {
  const m = messseiteMit(null);
  assert.ok(m, "messeSeite haette etwas liefern muessen");
  assert.equal(m.texte.length, 1);
  assert.equal(m.texte[0].rolle, "TEST");
  assert.equal(m.figuren.length, 1);
  assert.equal(m.figuren[0].figur, "ATLAS");
});

test("RA26 · Ein fuer immer haengendes fonts.ready blockiert die Messung nicht", { skip: chromiumDa ? false :
  "Kein Chromium in dieser Umgebung." }, () => {
  /* Simuliert genau den realen Befund: document.fonts.ready loest nie
     auf. Ohne den Zeitfallback in MESS_SKRIPT bliebe die Seite
     ungemessen - mit ihm liefert sie dieselbe Messung wie im
     Normalfall. */
  const m = messseiteMit(`<script>
    try {
      Object.defineProperty(document.fonts, "ready",
        { value: new Promise(function(){}), configurable: true });
    } catch (e) {}
  </script>`);
  assert.ok(m, "messeSeite haette trotz haengendem fonts.ready etwas liefern muessen");
  assert.equal(m.texte.length, 1);
  assert.equal(m.figuren.length, 1);
  assert.equal(m.figuren[0].figur, "ATLAS");
});

/* ------------------------------------------------------------------ */
/* DIE STORY-WELT: STUFE A TRIFFT STUFE B (Owner-Direktive             */
/* "FINAL GOLDEN PATH SIMPLIFICATION", 23.09.)                         */
/*                                                                      */
/* uebernimm() liest das Agenten-Bild unveraendert zurueck — der reale  */
/* Befund war ein MSFT-Kandidat ohne Text, ohne Logo, ohne Atlas, weil  */
/* der eigene Brief an den Agenten genau das verbietet. planGeschichte()*/
/* / seiteGeschichte() setzen Logo, Atlas (ATLAS_GUIDE) und den         */
/* gewaehlten Hook darueber und laufen durch dieselben vier harten Tore */
/* wie der gezeichnete Kartenpfad (render()).                           */
/* ------------------------------------------------------------------ */

test("RA27 · Ohne Hook gibt es keine Story-Welt", () => {
  const p = planGeschichte({}, { asset_path: "a/b.png", state: "READBACK_VERIFIED",
    width: 1080, height: 1350 });
  assert.equal(p.ok, false);
  assert.equal(p.reason, "noStatement");
});

test("RA28 · Ein nicht zurueckgelesenes Asset wird nicht ueberlagert", () => {
  const p = planGeschichte({ hook: "Ein Satz." },
    { asset_path: "a/b.png", state: "COMMITTED", width: 1080, height: 1350 });
  assert.equal(p.ok, false);
  assert.equal(p.reason, "assetNotVerified");
});

test("RA29 · Fehlt das Agenten-Bild auf dem Datentraeger, wird es benannt", () => {
  const p = planGeschichte({ hook: "Ein Satz." },
    { asset_path: "nicht/vorhanden.png", state: "READBACK_VERIFIED",
      width: 1080, height: 1350 }, { root: ROOT });
  assert.equal(p.ok, false);
  assert.equal(p.reason, "assetMissing");
});

function storyWeltAsset(root, breite, hoehe) {
  const rel = "tmp/ra-storywelt-" + process.pid + "-" + Date.now() + ".png";
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  const bild = testPng(breite, hoehe);
  writeFileSync(abs, bild);
  const sha = createHash("sha256").update(bild).digest("hex");
  return { rel, abs, sha };
}

test("RA30 · Ein veraendertes Agenten-Bild faellt auf, bevor ueberlagert wird", () => {
  const a = storyWeltAsset(ROOT, 1080, 1350);
  try {
    const p = planGeschichte({ hook: "Ein Satz." }, { asset_path: a.rel,
      state: "READBACK_VERIFIED", width: 1080, height: 1350,
      asset_sha256: "0".repeat(64) }, { root: ROOT });
    assert.equal(p.ok, false);
    assert.equal(p.reason, "assetHashMismatch");
  } finally { rmSync(a.abs, { force: true }); }
});

test("RA31 · Die Story-Welt traegt Logo, Atlas (ATLAS_GUIDE) und den Hook als Text-on-Visual",
  { skip: chromiumDa ? false : "Kein Chromium in dieser Umgebung." }, () => {
  const a = storyWeltAsset(ROOT, 1080, 1350);
  const wurzel = mkdtempSync(join(tmpdir(), "vu-storywelt-"));
  try {
    const pkg = { packageId: "pkg_storywelt_test",
      hook: "Die Quartalszahlen ueberraschten - und niemand sah es kommen." };
    const asset = { asset_path: a.rel, state: "READBACK_VERIFIED",
      width: 1080, height: 1350, mime_type: "image/png", asset_sha256: a.sha };

    const p = planGeschichte(pkg, asset, { root: ROOT });
    assert.equal(p.ok, true);
    assert.equal(p.visualType, "GENERATIVE");
    assert.equal(p.generiert, true);
    assert.ok(p.atlas, "die Story-Welt muss einen Atlas-Plan tragen");
    assert.equal(p.atlas.rolle, "ATLAS_GUIDE");
    assert.equal(p.atlas.referenceAsset, "assets/atlas.png");

    const ziel = join(wurzel, "ziel.jpg");
    const befund = render(p, ziel, { schrift: ladeSchrift(ROOT),
      caption: "Eine ganz andere Caption, die den Hook nicht wiederholt." });

    assert.equal(befund.istJpeg, true);
    assert.equal(befund.breite, 1080);
    assert.equal(befund.hoehe, 1350);
    assert.equal(befund.scrollStop.ok, true,
      befund.scrollStop && befund.scrollStop.erklaerung);
    assert.equal(befund.logo.passed, true);
    assert.equal(befund.atlas.passed, true);
    assert.ok(befund.atlas.flaechenAnteil >= 0.10 && befund.atlas.flaechenAnteil <= 0.24,
      "Atlas-Flaeche " + befund.atlas.flaechenAnteil + " ausserhalb ATLAS_GUIDE.");
  } finally {
    rmSync(a.abs, { force: true });
    rmSync(wurzel, { recursive: true, force: true });
  }
});

test("RA32 · Eine Caption, die nur die Hook wiederholt, faellt in der Story-Welt auf",
  { skip: chromiumDa ? false : "Kein Chromium in dieser Umgebung." }, () => {
  /* run-social-cycle.mjs uebergibt seit dieser Aenderung `caption` an
     render() - vorher lief die Story-Welt (planUebernahme/uebernimm)
     ganz ohne Textebene, also konnte HOOK_WIEDERHOLT_CAPTION nie
     auffallen. Dieser Test haelt fest, dass die Caption jetzt wirklich
     ankommt und geprueft wird. */
  const a = storyWeltAsset(ROOT, 1080, 1350);
  const wurzel = mkdtempSync(join(tmpdir(), "vu-storywelt-"));
  try {
    const hook = "Die Quartalszahlen ueberraschten alle Analysten.";
    const p = planGeschichte({ packageId: "pkg_storywelt_dup", hook },
      { asset_path: a.rel, state: "READBACK_VERIFIED", width: 1080, height: 1350,
        mime_type: "image/png", asset_sha256: a.sha }, { root: ROOT });
    assert.equal(p.ok, true);

    assert.throws(() => render(p, join(wurzel, "ziel.jpg"), {
      schrift: ladeSchrift(ROOT),
      /* Derselbe Satz, nur mit Punkt - der erste Satz der Caption ist
         dann woertlich die Hook. */
      caption: hook + " Mehr dazu in der Analyse."
    }), /HOOK_WIEDERHOLT_CAPTION/);
  } finally {
    rmSync(a.abs, { force: true });
    rmSync(wurzel, { recursive: true, force: true });
  }
});
