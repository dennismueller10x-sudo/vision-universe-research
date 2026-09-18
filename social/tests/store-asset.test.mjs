/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/store-asset.test.mjs

   Der Speicherweg, geprueft ohne echten Speicher. Ein Test, der ein
   Bild nach R2 laedt, ist kein Test, sondern eine Rechnung.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const S = await import("../../scripts/social/store-asset.mjs");

const ERGEBNIS = JSON.parse(readFileSync(
  join(ROOT, "authoring/requests/vu-xom-20260911/authoring-result.json"), "utf8"));
const VARIANTE = ERGEBNIS.visual_variants[0];
const BYTES = readFileSync(join(ROOT, VARIANTE.asset_path));

/** Ein Speicher im Arbeitsspeicher. */
function speicher(verfaelschen) {
  const inhalt = new Map();
  return {
    inhalt,
    async put(key, buffer) { inhalt.set(key, Buffer.from(buffer)); return { key }; },
    async get(key) {
      const b = inhalt.get(key);
      if (!b) return null;
      return verfaelschen ? verfaelschen(b) : b;
    }
  };
}

test("ST1 · Abgelegt und zurueckgelesen", () => {
  assert.equal(typeof S.ablegen, "function");
});

test("ST2 · Der Weg endet erst nach dem Ruecklesen", async () => {
  /* PR 106 meldete `completed` und lieferte ein beschaedigtes Asset.
     Dieselbe Lehre gilt hier: geprueft wird, was IM SPEICHER liegt. */
  const sp = speicher();
  const befund = await S.ablegen(sp, BYTES, VARIANTE, { contentId: "vu-x" });
  assert.equal(befund.ok, true, befund.explanation);
  assert.equal(befund.transport, "ASSET_VERIFIED");
  assert.equal(befund.verification.checks.freshReadbackValid, true);
  assert.match(befund.key, /^social\/assets\/a3\/a378d078/);
});

test("ST3 · Ein Speicher, der etwas anderes zurueckgibt, faellt auf", async () => {
  /* Der ganze Grund fuer das Ruecklesen. Waere es eine Pruefung gegen
     den eigenen Puffer, ginge dieser Fall durch. */
  const sp = speicher((b) => b.subarray(0, 4000));
  const befund = await S.ablegen(sp, BYTES, VARIANTE, { contentId: "vu-x" });
  assert.equal(befund.ok, false);
  assert.equal(befund.transport, "ASSET_TRANSPORT_INTEGRITY_FAILED");
  /* Und ausdruecklich kein Grund, neu zu erzeugen. */
  assert.equal(befund.regenerate, false);
  assert.equal(befund.contentJudgement, false);
});

test("ST4 · Derselbe Inhalt landet an derselben Stelle", async () => {
  /* Idempotenz ohne eigenen Mechanismus: ein zweiter Upload
     ueberschreibt sich selbst statt eine zweite Kopie anzulegen. */
  const sp = speicher();
  const a = await S.ablegen(sp, BYTES, VARIANTE, { contentId: "vu-x" });
  const b = await S.ablegen(sp, BYTES, VARIANTE, { contentId: "vu-x" });
  assert.equal(a.key, b.key);
  assert.equal(sp.inhalt.size, 1);
});

test("ST5 · Fehlende Zugangsdaten werden benannt, nicht erfunden", () => {
  /* Ein Lauf ohne Speicher soll SAGEN, dass er nicht speichern kann.
     Ein stiller Erfolg waere die gefaehrlichste Antwort: der Kandidat
     traegt dann einen Verweis auf etwas, das nirgends liegt. */
  assert.deepEqual(S.fehlendeUmgebung({}), S.NOETIGE_UMGEBUNG);
  assert.deepEqual(S.fehlendeUmgebung({
    VU_HISTORY_S3_ENDPOINT: "x", VU_HISTORY_S3_BUCKET: "y",
    VU_HISTORY_S3_ACCESS_KEY_ID: "z", VU_HISTORY_S3_SECRET_ACCESS_KEY: "w"
  }), []);
});
