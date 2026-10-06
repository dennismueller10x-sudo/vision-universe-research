/* =========================================================================
   workers/vision-universe-social/tests/asset-fingerprint.test.mjs

   PREVIEW = PUBLISH, GEMESSEN STATT BEHAUPTET (§22-§25)

   -------------------------------------------------------------------------
   DER VORFALL, DEN DIESE DATEI UNMOEGLICH MACHEN SOLL
   -------------------------------------------------------------------------

   Am 21.09.2026 stand ein Kandidat im Approval Center, sein Bild war
   nicht erreichbar, der Owner hat ihn testweise veroeffentlicht, und
   Instagram nahm den Beitrag an - ohne ladbares Bild.

   Der Weg dorthin war an drei Stellen offen:

     1. Die Freigabe stuetzte sich auf ein URTEIL von vorhin. Gemessen
        hatte die Pipeline, und sie hatte eine ADRESSE gemessen.

     2. Der Worker prueft vor dem Senden selbst - aber mit HEAD. HEAD
        beantwortet eine Frage ueber die Adresse, nicht ueber die Datei.

     3. Niemand verglich die Bytes hinter der Adresse mit denen, die
        der Owner gesehen hatte. "Gleiche Adresse" galt als "gleiches
        Bild".

   Die dritte Luecke ist die, die §25 meint: ein Abdruck ueber
   contentId, Adresse und Caption beweist, dass der TEXT unveraendert
   ist. Ueber die Datei sagt eine Zeichenkette nichts.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";
import { contentHash } from "../src/redact.js";
import {
  createEnv, createPublishGraph, request, TEST_ADMIN_KEY, verbinde,
  jpegBytes, jpegSha256, JPEG_SHA256
} from "./harness.mjs";

const BILD = "https://research.visionuniverse.de/assets/social/pkg_p0.jpg";

async function umgebung(optionen = {}) {
  const g = createPublishGraph(optionen);
  const env = createEnv({ __graph: g, __fetchImpl: g.fetchImpl });
  await verbinde(env);
  return { env, g };
}

/* -------------------------------------------------------------------
   JEDER AUFRUF TRAEGT EINE ECHTE FREIGABE

   VU_SOCIAL_AUTOPUBLISH bleibt aus - das ist eine harte Invariante und
   kein Testschalter. Der Endpunkt sendet deshalb nur mit Freigabe, und
   die Freigabe traegt den Abdruck ueber contentId, Adresse und Caption.

   Genau darin liegt der Punkt dieser Datei: dieser Abdruck ist
   vollstaendig in Ordnung, waehrend hinter der Adresse ein anderes
   Bild liegt. Eine Zeichenkette bezeugt keine Bytes. */
async function senden(env, koerper) {
  const abdruck = await contentHash({
    contentId: koerper.contentId,
    imageUrl: koerper.imageUrl,
    caption: koerper.caption
  });
  return worker.fetch(request("/social/meta/publish", {
    method: "POST",
    headers: { "content-type": "application/json",
      authorization: "Bearer " + TEST_ADMIN_KEY },
    body: JSON.stringify(Object.assign({}, koerper, {
      approval: { candidateId: "cand_" + koerper.contentId, approvedBy: "owner",
        approvedAt: "2026-09-21T12:00:00Z", contentHash: abdruck }
    }))
  }), env);
}

/* ============================================ Der Abdruck stimmt */

test("FP1 · Stimmen die Bytes, geht der Beitrag hinaus", async () => {
  const { env } = await umgebung();
  const r = await senden(env, {
    contentId: "pkg_fp1", imageUrl: BILD, caption: "Text.",
    assetSha256: JPEG_SHA256
  });
  const b = await r.json();
  assert.equal(r.status, 200, JSON.stringify(b));
  assert.equal(b.published, true);
});

test("FP2 · Das Bild wird GANZ geholt, nicht nur sein Kopf", async () => {
  /* Die Bedingung, aus der alles andere folgt. Ein HEAD sieht den
     Koerper nicht - und ohne Koerper gibt es weder Abdruck noch
     Masse noch die Gewissheit, dass ueberhaupt ein Bild dort liegt. */
  const { env, g } = await umgebung();
  await senden(env, { contentId: "pkg_fp2", imageUrl: BILD, caption: "Text.",
    assetSha256: JPEG_SHA256 });

  const abruf = g.aufrufe.find((a) => a.url === BILD);
  assert.ok(abruf, "Das Bild wurde gar nicht abgerufen.");
  assert.equal(abruf.methode, "GET",
    "Mit HEAD bleibt die Datei ungesehen - genau die Luecke vom 21.09.");
});

/* ============================================ Der Abdruck stimmt nicht */

test("FP3 · Andere Bytes unter derselben Adresse: es geht nichts hinaus", async () => {
  /* -----------------------------------------------------------------
     DER KERN VON §25

     Adresse gleich, Caption gleich, contentHash gleich - und trotzdem
     ein anderes Bild. Genau das kann zwischen Messung und Sendung
     passieren, und genau das sah bisher niemand.

     `fuellung` aendert ein einziges Byte: gleiche Masse, gleicher Typ,
     anderer Abdruck. Wer hier durchkommt, veroeffentlicht etwas, das
     der Owner nie gesehen hat. */
  const andere = jpegBytes({ fuellung: 7 });
  assert.notEqual(await jpegSha256(andere), JPEG_SHA256,
    "Das Fixture unterscheidet sich nicht - der Test pruefte nichts.");

  const { env, g } = await umgebung({ bild: andere });
  const r = await senden(env, {
    contentId: "pkg_fp3", imageUrl: BILD, caption: "Text.",
    assetSha256: JPEG_SHA256
  });
  const b = await r.json();

  assert.equal(r.status, 400);
  assert.equal(b.published, false);
  assert.equal(b.error, "imageFingerprintMismatch");
  assert.equal(b.expectedSha256, JPEG_SHA256);
  assert.ok(b.actualSha256 && b.actualSha256 !== JPEG_SHA256);

  /* Und zwar BEVOR Meta gefragt wurde. Ein Container, der schon steht,
     ist nicht mehr zurueckzunehmen. */
  const schreibend = g.aufrufe.filter((a) => a.methode === "POST");
  assert.equal(schreibend.length, 0,
    "Es ging etwas an Meta hinaus, obwohl das Bild ein anderes war.");
});

test("FP4 · Ohne erwarteten Abdruck wird nicht heimlich durchgewunken", async () => {
  /* Fehlt die Erwartung, kann diese Stelle sie nicht pruefen - sie
     darf dann aber auch nicht so tun, als haette sie. Die Sperre
     dagegen sitzt eine Ebene hoeher, in pruefeFreigabe: ohne Abdruck
     keine Freigabe. Hier wird nur festgehalten, dass der Pfad ohne
     Erwartung NICHT plaetzlich strenger oder laxer wird. */
  const { env } = await umgebung({ bild: jpegBytes({ fuellung: 9 }) });
  const r = await senden(env, {
    contentId: "pkg_fp4", imageUrl: BILD, caption: "Text."
  });
  const b = await r.json();
  assert.equal(b.published, true,
    "Ohne Erwartung prueft diese Stelle den Abdruck nicht - das ist hier richtig.");
});

/* ============================================ Die Bytes sind kein Bild */

test("FP5 · Inhaltstyp JPEG, Bytes nicht: es geht nichts hinaus", async () => {
  /* Ein Server, der `image/jpeg` behauptet und eine Fehlerseite
     liefert, kam durch jede Kopfpruefung. */
  const { env } = await umgebung({ bild: new Uint8Array([0x3C, 0x21, 0x64, 0x6F]) });
  const r = await senden(env, {
    contentId: "pkg_fp5", imageUrl: BILD, caption: "Text." });
  const b = await r.json();
  assert.equal(r.status, 400);
  assert.equal(b.error, "imageNotJpegBytes");
});

test("FP6 · Ein leerer Koerper ist kein Bild", async () => {
  const { env } = await umgebung({ bildLeer: true });
  const r = await senden(env, {
    contentId: "pkg_fp6", imageUrl: BILD, caption: "Text." });
  const b = await r.json();
  assert.equal(r.status, 400);
  assert.equal(b.error, "imageEmpty");
});

/* ============================================ Die Masse */

test("FP7 · Andere Masse als bei der Freigabe: es geht nichts hinaus", async () => {
  const { env } = await umgebung({ bild: jpegBytes({ width: 640, height: 640 }) });
  const r = await senden(env, {
    contentId: "pkg_fp7", imageUrl: BILD, caption: "Text.",
    assetDimensions: { width: 1080, height: 1350 }
  });
  const b = await r.json();
  assert.equal(r.status, 400);
  assert.equal(b.error, "imageDimensionsChanged");
});

/* ============================================ Das Fixture selbst */

test("FP8 · Die Abdruck-Konstante gehoert zu den Bytes, die sie nennt", async () => {
  /* Eine Konstante, die neben den Bytes steht, laeuft von ihnen weg.
     Hier wird sie gegen sie gerechnet - sonst pruefen alle Tests
     oben gegen eine Zahl, die niemand mehr nachgerechnet hat. */
  assert.equal(await jpegSha256(jpegBytes()), JPEG_SHA256);
});
