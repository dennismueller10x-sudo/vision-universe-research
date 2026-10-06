/* =========================================================================
   VISION UNIVERSE SOCIAL — KOMMT DAS BILD AN? (AB1–AB18)

   §2–§7, §22.

   -------------------------------------------------------------------------
   DER REALE BEFUND
   -------------------------------------------------------------------------

   Im Approval Center stand ein wartender Beitrag mit kaputter
   Bildflaeche. Die Kette, dependency-correct verfolgt:

     run-social-cycle.mjs baut die Adresse aus der Paketkennung
     → render-asset.mjs schreibt die Datei nach assets/social/
     → der Workflow schreibt fest: `git add social/data/`
     → assets/social/ liegt nicht darunter
     → das Bild wird mit dem Runner weggeworfen
     → der Kandidat mit der Adresse wird committet

   `git log --all -- assets/social/pkg_ca25cb404ae49dc4.jpg` ist leer.

   Und production-readiness.mjs ERZWANG die enge Regel: der Waechter
   stand an der Grenze "nur social/data" statt "niemals die Schalter".
   Das Wegwerfen jedes Bildes war damit eine erfuellte Invariante.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const D = require("../engines/asset-delivery.js");
const Integritaet = require("../engines/asset-integrity.js");

const URL_OK = "https://research.visionuniverse.de/assets/social/pkg_x.jpg";
const BILD = readFileSync(join(ROOT, "assets/social/pkg_211d4c6ed3b103aa.jpg"));
const ABDRUCK = createHash("sha256").update(BILD).digest("hex");
const BILD_ANTWORT = { status: 200, headers: { "content-type": "image/jpeg" } };

const gut = (extra = {}) => D.beurteile(Object.assign(
  { url: URL_OK, antwort: BILD_ANTWORT, bytes: BILD }, extra));

/* ------------------------------------------------- Der gute Fall */

test("AB1 · Ein erreichbares Bild ist erreichbar — mit gemessenen Werten", () => {
  const b = gut();
  assert.equal(b.zustand, D.ZUSTAND.ERREICHBAR);
  assert.equal(b.erreichbar, true);
  assert.equal(b.grund, null);
  /* Der Satz traegt die Messung, nicht ein Adjektiv. */
  assert.match(b.satz, /1080x1350/);
  assert.match(b.satz, /\d+ Bytes/);
  assert.equal(b.dimensions.width, 1080);
});

/* --------------------------------------- Die Wege, auf denen es scheitert */

test("AB2 · 404: unter der Adresse liegt nichts", () => {
  const b = D.beurteile({ url: URL_OK, antwort: { status: 404, headers: {} } });
  assert.equal(b.zustand, D.ZUSTAND.NICHT_ERREICHBAR);
  assert.equal(b.grund, D.GRUND.NICHT_GEFUNDEN);
});

test("AB3 · 403 vom ECHTEN Dienst ist nicht erreichbar", () => {
  const b = D.beurteile({ url: URL_OK, antwort: { status: 403, headers: {} },
    koerperText: "Forbidden" });
  assert.equal(b.zustand, D.ZUSTAND.NICHT_ERREICHBAR);
  assert.equal(b.grund, D.GRUND.VERWEIGERT);
});

test("AB4 · 200 mit HTML ist kein Bild", () => {
  /* Der haeufigste Fall im echten Betrieb: eine Fehlerseite mit
     Status 200. Wer nur den Status liest, haelt sie fuer ein Bild. */
  const b = D.beurteile({ url: URL_OK,
    antwort: { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
    bytes: Buffer.from("<!doctype html><h1>404</h1>") });
  assert.equal(b.zustand, D.ZUSTAND.NICHT_ERREICHBAR);
  assert.equal(b.grund, D.GRUND.KEIN_BILD_TYP);
});

test("AB5 · Umleitung auf eine Anmeldung traegt ihren eigenen Namen", () => {
  const b = D.beurteile({ url: URL_OK,
    antwort: { status: 302, headers: { location: "https://x.de/login?next=/a" } } });
  assert.equal(b.grund, D.GRUND.ANMELDUNG);
  assert.match(b.satz, /Meta kann sich nicht anmelden/);
});

test("AB6 · Leere Antwort", () => {
  assert.equal(gut({ bytes: Buffer.alloc(0) }).grund, D.GRUND.LEER);
});

test("AB7 · Bytes, die kein Bild sind", () => {
  const b = D.beurteile({ url: URL_OK, antwort: BILD_ANTWORT,
    bytes: Buffer.from("Das ist kein Bild, nur Text.") });
  assert.equal(b.zustand, D.ZUSTAND.NICHT_ERREICHBAR);
  assert.equal(b.grund, D.GRUND.KEIN_BILD_INHALT);
});

test("AB8 · Eine abgeschnittene Datei", () => {
  const b = gut({ bytes: BILD.subarray(0, 900) });
  assert.equal(b.zustand, D.ZUSTAND.NICHT_ERREICHBAR);
  assert.match(b.satz, /kein brauchbares Bild/);
});

/* ------------------------------------------- Ist es UNSER Bild? (§4) */

test("AB9 · Ein falscher Inhaltsabdruck ist ein anderes Asset", () => {
  /* DIESER TEST HAT BEIM ERSTEN ANLAUF NICHTS GEFANGEN.

     asset-integrity.js heisst das Feld `asset_sha256`. Die Engine
     reichte `{ sha256 }` durch, `declared.asset_sha256` war damit
     undefined, und die Pruefung verglich nichts und meldete ok — ein
     absichtlich falscher Abdruck kam als ERREICHBAR durch.

     Keine falsche Antwort, sondern eine Frage, die nie gestellt
     wurde. Genau die Form, an der in §45 das Owner-Tor dreimal
     scheiterte. */
  const b = gut({ erwartet: { sha256: "0".repeat(64) } });
  assert.equal(b.zustand, D.ZUSTAND.NICHT_ERREICHBAR);
  assert.equal(b.grund, D.GRUND.ANDERES_ASSET);
});

test("AB10 · Der richtige Abdruck besteht", () => {
  assert.equal(gut({ erwartet: { sha256: ABDRUCK } }).erreichbar, true);
});

test("AB11 · Falsche Masse fallen auf", () => {
  assert.equal(gut({ erwartet: { width: 800, height: 800 } }).grund,
    D.GRUND.FALSCHE_MASSE);
});

test("AB12 · Jede Byte-Kennung der Integritaetspruefung ist abgebildet", () => {
  /* Die Abbildung stand aus dem Gedaechtnis da und enthielt
     `dimensionMismatch` — eine Kennung, die es nicht gibt. Sie wird
     deshalb gegen die Engine gerechnet und nicht gegen mein
     Gedaechtnis. */
  const quelle = readFileSync(
    join(ROOT, "social/engines/asset-integrity.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const kennungen = [...quelle.matchAll(/id:\s*"([a-zA-Z]+)"/g)].map((m) => m[1]);
  assert.ok(kennungen.length >= 6, "Zu wenige Kennungen gefunden — Muster kaputt");
  for (const k of new Set(kennungen)) {
    assert.ok(Object.prototype.hasOwnProperty.call(D.ZU_GRUND, k),
      "Kennung " + k + " hat keinen Grund und ginge still als 'beschaedigt' durch");
  }
});

/* ------------------------------- Wer hat geantwortet? (die §45-Lehre) */

test("AB13 · Ein Proxy dazwischen ergibt UNGEPRUEFT, nicht 'kaputt'", () => {
  /* Woertlich das, was diese Umgebung liefert. */
  const b = D.beurteile({ url: URL_OK,
    antwort: { status: 403, headers: {} },
    koerperText: "Host not in allowlist: research.visionuniverse.de. Add this host..." });
  assert.equal(b.zustand, D.ZUSTAND.UNGEPRUEFT);
  assert.equal(b.grund, D.GRUND.FREMDE_ANTWORT);
  assert.ok(!b.erreichbar);
});

test("AB14 · Eine Antwort von einem fremden Host zaehlt nicht", () => {
  const b = D.beurteile({ url: URL_OK,
    antwort: { status: 200, headers: { "content-type": "image/jpeg" },
      finalUrl: "https://irgendwo-anders.example/a.jpg" },
    bytes: BILD });
  assert.equal(b.zustand, D.ZUSTAND.UNGEPRUEFT);
  assert.equal(b.grund, D.GRUND.FREMDE_ANTWORT);
});

test("AB15 · Gar nicht gefragt ist weder erreichbar noch unerreichbar", () => {
  const b = D.beurteile({ url: URL_OK });
  assert.equal(b.zustand, D.ZUSTAND.UNGEPRUEFT);
  assert.match(b.satz, /Ungeprueft ist nicht erreichbar/);
});

/* --------------------------------------------------- Fail closed (§5) */

test("AB16 · Nur ERREICHBAR erlaubt die Freigabe", () => {
  assert.equal(D.freigabeMoeglich(gut()), true);
  for (const z of [D.ZUSTAND.NICHT_ERREICHBAR, D.ZUSTAND.UNGEPRUEFT]) {
    assert.equal(D.freigabeMoeglich({ zustand: z }), false, z + " liess durch");
  }
  assert.equal(D.freigabeMoeglich(null), false, "Ohne Befund wurde freigegeben");
  assert.equal(D.freigabeMoeglich(undefined), false);
});

test("AB17 · Ein Transportfehler ist kein Inhaltsfehler", () => {
  /* §5: aus einem kaputten Transport darf kein negatives Lernen ueber
     Thema, Hook, Caption oder Bildstrategie entstehen. */
  for (const g of Object.values(D.GRUND)) {
    assert.equal(D.istInhaltlicherMangel(g), false,
      g + " wuerde als inhaltlicher Mangel gelernt");
  }
  assert.equal(D.istInhaltlicherMangel("NO_OPPORTUNITY_PASSED_QUALITY"), true,
    "Ein echter Inhaltsgrund wird faelschlich als Transport gefuehrt");
});

test("AB18 · Der Owner liest einen Satz ohne Codes", () => {
  const nicht = D.ownerSatz(D.beurteile({ url: URL_OK, antwort: { status: 404, headers: {} } }));
  assert.match(nicht, /Das Bild ist derzeit nicht erreichbar/);
  assert.ok(!/HTTP_|ASSET_|404/.test(nicht), "Der Satz nennt Codes: " + nicht);

  const unklar = D.ownerSatz(D.beurteile({ url: URL_OK }));
  assert.match(unklar, /liess sich gerade nicht feststellen/);
  assert.notEqual(nicht, unklar, "Beide Lagen lesen sich gleich");

  assert.equal(D.ownerSatz(gut()), null, "Ein heiles Bild braucht keinen Hinweis");
});
