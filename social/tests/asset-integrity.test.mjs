/* =========================================================================
   VU SOCIAL — Asset-Integritaet (AI1–AI16)

   -------------------------------------------------------------------------
   DER BEFUND AUS DEM REALEN BILDPROOF
   -------------------------------------------------------------------------

   Beim ersten Schreibversuch des Creative Agents entstand ein
   VERKUERZTER Bildtransfer. Ein korrigierter Commit ersetzte ihn.

   Eine abgeschnittene Datei hat die richtige Signatur, die richtige
   Kopfzeile und die richtigen Abmessungen im Header — und sie ist
   trotzdem kaputt. Jede Pruefung, die nur vorn hinsieht, sagt "in
   Ordnung".

   Bemerkbar macht sich das erst bei Meta: der Container wird abgelehnt,
   NACHDEM der Anspruch angemeldet ist. Danach weiss niemand ohne
   nachzusehen, ob ein Beitrag entstanden ist.

   -------------------------------------------------------------------------
   DIESE TESTS LAUFEN GEGEN DAS ECHTE ASSET
   -------------------------------------------------------------------------

   `fixtures/creative-visual-proof.png` ist die Datei aus PR #98, Byte
   fuer Byte. Ein selbst gebautes Bild wuerde beweisen, dass der Pruefer
   das selbst gebaute Bild versteht.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const AI = require("../engines/asset-integrity.js");

const HIER = dirname(fileURLToPath(import.meta.url));
const ECHT = readFileSync(join(HIER, "fixtures/creative-visual-proof.png"));

/* Genau das, was das Ergebnis aus PR #98 ueber die Datei behauptet. */
const ANGEGEBEN = {
  asset_sha256: "dd2206a97ec20c074bef135d59d1472318f9ed4f88e92940221ae2a900c776aa",
  mime_type: "image/png",
  width: 1254,
  height: 1254
};

/* ------------------------------------------------------------------ */
/* DAS ECHTE ASSET                                                     */
/* ------------------------------------------------------------------ */

test("AI1 · Das Asset aus dem Proof besteht die Pruefung", () => {
  const r = AI.verify(ECHT, ANGEGEBEN);
  assert.equal(r.ok, true, r.explanation);
  assert.equal(r.complete, true);
  assert.equal(r.actual.mime_type, "image/png");
  assert.equal(r.actual.width, 1254);
  assert.equal(r.actual.height, 1254);
});

test("AI2 · Der Typ kommt aus den Bytes, nicht aus der Endung", () => {
  assert.equal(AI.detectMime(ECHT), "image/png");
  assert.equal(AI.detectMime(Buffer.from("das ist kein Bild")), null);
});

test("AI3 · Die Abmessungen kommen aus den Bytes", () => {
  /* Der Brief bat um 1024x1024, geliefert wurden 1254x1254. Geprueft
     wird gegen das, was die DATEI sagt — nicht gegen den Wunsch. */
  assert.deepEqual(AI.dimensions(ECHT, "image/png"), { width: 1254, height: 1254 });
});

/* ------------------------------------------------------------------ */
/* DER ABGESCHNITTENE TRANSFER                                         */
/* ------------------------------------------------------------------ */

test("AI4 · Ein abgeschnittenes PNG faellt auf", () => {
  const halb = ECHT.subarray(0, Math.floor(ECHT.length * 0.6));
  const r = AI.verify(halb, ANGEGEBEN);
  assert.equal(r.ok, false);
  assert.ok(r.findings.some((f) => f.id === "truncated"));
});

test("AI5 · Auch wenn der Hash zum abgeschnittenen Stueck passt", () => {
  /* DER Test dieser Datei. Rechnet der Erzeuger den Hash auf der
     bereits abgeschnittenen Datei, stimmen Hash, Typ und Abmessungen
     alle ueberein — und nur das fehlende Ende verraet den Abbruch. */
  const halb = ECHT.subarray(0, Math.floor(ECHT.length * 0.6));
  const r = AI.verify(halb, {
    asset_sha256: AI.sha256(halb),
    mime_type: "image/png",
    width: 1254, height: 1254, bytes: halb.length
  });

  assert.equal(r.ok, false, "eine in sich stimmige, kaputte Datei ging durch");
  assert.deepEqual(r.findings.map((f) => f.id), ["truncated"]);
  assert.match(r.findings[0].message, /IEND/);
});

test("AI6 · Der Kopf allein reicht nicht", () => {
  /* Signatur und IHDR sind intakt, die Abmessungen lesbar — und die
     Datei ist trotzdem unbrauchbar. */
  const kopf = ECHT.subarray(0, 64);
  assert.equal(AI.detectMime(kopf), "image/png");
  assert.deepEqual(AI.dimensions(kopf, "image/png"), { width: 1254, height: 1254 });
  assert.equal(AI.isComplete(kopf, "image/png").ok, false);
});

test("AI7 · Ein abgeschnittenes JPEG faellt auf", () => {
  const jpeg = Buffer.concat([
    Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(200, 0x11),
    Buffer.from([0xFF, 0xD9])
  ]);
  assert.equal(AI.isComplete(jpeg, "image/jpeg").ok, true);
  assert.equal(AI.isComplete(jpeg.subarray(0, jpeg.length - 2), "image/jpeg").ok, false);
});

test("AI8 · Eine leere Datei ist kein Bild", () => {
  const r = AI.verify(Buffer.alloc(0), ANGEGEBEN);
  assert.equal(r.ok, false);
  assert.ok(r.findings.some((f) => f.id === "unknownType"));
});

/* ------------------------------------------------------------------ */
/* DIE ABWEICHUNGEN                                                    */
/* ------------------------------------------------------------------ */

test("AI9 · Ein falscher Hash faellt auf", () => {
  const r = AI.verify(ECHT, Object.assign({}, ANGEGEBEN, { asset_sha256: "0".repeat(64) }));
  assert.ok(r.findings.some((f) => f.id === "hashMismatch"));
});

test("AI10 · Falsche Abmessungen fallen auf", () => {
  const r = AI.verify(ECHT, Object.assign({}, ANGEGEBEN, { width: 1024, height: 1024 }));
  assert.ok(r.findings.some((f) => f.id === "widthMismatch"));
  assert.ok(r.findings.some((f) => f.id === "heightMismatch"));
});

test("AI11 · Ein falscher Typ faellt auf", () => {
  const r = AI.verify(ECHT, Object.assign({}, ANGEGEBEN, { mime_type: "image/jpeg" }));
  assert.ok(r.findings.some((f) => f.id === "mimeMismatch"));
});

test("AI12 · Eine falsche Groesse faellt auf", () => {
  const r = AI.verify(ECHT, Object.assign({}, ANGEGEBEN, { bytes: 42 }));
  assert.ok(r.findings.some((f) => f.id === "sizeMismatch"));
});

/* ------------------------------------------------------------------ */
/* DER ZUSTAND                                                         */
/* ------------------------------------------------------------------ */

test("AI13 · COMPLETED gibt es nur nach bestandenem Ruecklesen", () => {
  assert.equal(AI.settle(AI.verify(ECHT, ANGEGEBEN)).state, "COMPLETED");
});

test("AI14 · Sonst RECOVERY_REQUIRED — und nicht 'wird schon'", () => {
  const halb = ECHT.subarray(0, 1000);
  const z = AI.settle(AI.verify(halb, ANGEGEBEN));
  assert.equal(z.state, "RECOVERY_REQUIRED");
  assert.ok(z.requiredAction, "es steht dabei, was zu tun ist");
});

test("AI15 · Der Zustand nennt, was NICHT getan werden darf", () => {
  /* Ein stiller Force-Update wuerde die Herkunft loeschen — und die ist
     bei einem oeffentlichen Beitrag das Einzige, was spaeter die Frage
     beantwortet, was eigentlich gesendet wurde. */
  const z = AI.settle(AI.verify(ECHT.subarray(0, 1000), ANGEGEBEN));
  assert.match(z.explanation, /Force-Update/);
  assert.match(z.explanation, /neue Brief-Revision/);
});

test("AI16 · Die Zustandsfolge ist der Vertrag", () => {
  /* COMPLETED steht NACH READBACK_VERIFIED. Ein Ergebnis, das ohne
     Ruecklesen fertig heisst, hat nichts geprueft. */
  const i = (s) => AI.STATES.indexOf(s);
  assert.ok(i("GENERATED") < i("COMMITTED"));
  assert.ok(i("COMMITTED") < i("READBACK_VERIFIED"));
  assert.ok(i("READBACK_VERIFIED") < i("COMPLETED"));
  assert.ok(AI.STATES.includes("RECOVERY_REQUIRED"));
});
