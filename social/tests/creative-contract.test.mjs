/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/creative-contract.test.mjs

   PR 110 wurde nie bearbeitet, weil er vertragswidrig war — nicht, weil
   die Zustellung scheiterte. Diese Tests halten den erweiterten Vertrag
   fest und die Grenze, die er NICHT aufweicht.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const C = require("../engines/creative-contract.js");

const ERBE = C.inheritanceFrom({
  contentId: "vu-xom-20260911",
  candidateId: "cand_20260918_ca4ea408",
  visualVariantId: "vu-xom-20260911:bf22582c:visual:FUTURE_TECH:01",
  assetReference: "authoring/requests/vu-xom-20260911/assets/visual-01.png",
  sha256: "a378d07895c481cbdb2b60ea21d42512ed844b9ce0216ca262efcc8fcc9e0b40",
  byteSize: 1954408, mime: "image/png", width: 1122, height: 1402,
  verification: "VU_VERIFIED_COMPLETED"
});

const REVISION = { request_type: C.TEXT_REVISION, visual: ERBE };

/* ------------------------------------------------------------------ */
/* DER AUFTRAG                                                         */
/* ------------------------------------------------------------------ */

test("CC1 · Eine vollstaendige Vererbung macht TEXT_REVISION gueltig", () => {
  const v = C.validateRequest(REVISION);
  assert.equal(v.ok, true, v.explanation);
  assert.equal(v.requestType, C.TEXT_REVISION);
  assert.equal(v.regenerationAllowed, false);
});

test("CC2 · \"Kein Bild noetig\" ist kein zulaessiger Zustand", () => {
  /* Die Sicherheitsgrenze. Zulaessig ist nur "das Bild ist DIESES und
     es ist bereits geprueft" — sonst waere jeder Request ohne Bild
     ploetzlich in Ordnung, und die Bildpflicht waere abgeschafft statt
     praezisiert. */
  const ohne = C.validateRequest({ request_type: C.TEXT_REVISION });
  assert.equal(ohne.ok, false);
  assert.equal(ohne.reason, "contractViolation");
  assert.ok(ohne.findings.length >= C.ERBFELDER.length);
});

test("CC3 · Jedes einzelne Erbfeld ist noetig", () => {
  /* Jedes beantwortet eine Frage, die sonst offen bliebe. Fehlt eines,
     ist die Vererbung nicht nachpruefbar — und eine unnachpruefbare
     Vererbung ist ein Platzhalter mit Hash-Feld. */
  C.ERBFELDER.forEach((feld) => {
    const kaputt = JSON.parse(JSON.stringify(REVISION));
    delete kaputt.visual[feld];
    const v = C.validateRequest(kaputt);
    assert.equal(v.ok, false, feld + " fehlte und der Vertrag hielt trotzdem");
    assert.ok(v.findings.some((f) => f.field === "visual." + feld),
      "der Befund nennt " + feld + " nicht");
  });
});

test("CC4 · Geerbt wird nur aus einem verifizierten Asset", () => {
  /* Ein Asset, das nie vollstaendig geprueft wurde, wird durch das
     Erben nicht besser — es wuerde seine Ungeprueftheit weiterreichen. */
  const unverifiziert = JSON.parse(JSON.stringify(REVISION));
  unverifiziert.visual.source_verification = "READBACK_PENDING";
  const v = C.validateRequest(unverifiziert);
  assert.equal(v.ok, false);
  assert.ok(v.findings.some((f) => f.field === "visual.source_verification"));
});

test("CC5 · Ein Hash, der keiner ist, prueft nichts", () => {
  const falsch = JSON.parse(JSON.stringify(REVISION));
  falsch.visual.source_asset_sha256 = "deadbeef";
  const v = C.validateRequest(falsch);
  assert.equal(v.ok, false);
  assert.ok(v.findings.some((f) => f.field === "visual.source_asset_sha256"));
});

test("CC6 · regeneration_allowed muss ausdruecklich false sein", () => {
  /* Ohne die Zeile darf der Agent ein Bild erzeugen — und dann aendern
     sich zwei Variablen auf einmal. */
  const offen = JSON.parse(JSON.stringify(REVISION));
  delete offen.visual.regeneration_allowed;
  assert.equal(C.validateRequest(offen).ok, false);
});

test("CC7 · FULL_CREATIVE behaelt seine Bildpflicht", () => {
  /* Die Grenze wird praezisiert, nicht aufgeweicht. */
  assert.equal(C.validateRequest({ request_type: C.FULL_CREATIVE }).ok, true);
  const aufgeweicht = C.validateRequest({ request_type: C.FULL_CREATIVE,
    authoring_requirements: { actual_image_asset_required: false } });
  assert.equal(aufgeweicht.ok, false);
});

test("CC8 · Ein alter Brief wird gelesen, nicht vorbelegt", () => {
  /* Die naheliegende Antwort waere gewesen, fehlendes request_type
     still auf FULL_CREATIVE zu setzen. Genau dieses stille Setzen hat
     PR 110 zwoelf Stunden gekostet.

     FULL_CREATIVE ist hier trotzdem richtig — aber als historische
     Tatsache: als diese Briefe entstanden, gab es keine andere
     Auftragsart. Der Unterschied steht im Ergebnis. */
  const alt = C.validateRequest({ topic: "irgendwas" });
  assert.equal(alt.ok, true);
  assert.equal(alt.requestType, C.FULL_CREATIVE);
  assert.equal(alt.legacy, true);
  assert.match(alt.explanation, /nicht, weil FULL_CREATIVE ein Vorgabewert/);

  /* Ein neuer Brief traegt das Feld und ist damit nicht legacy. */
  assert.equal(C.validateRequest(REVISION).legacy, undefined);
});

/* ------------------------------------------------------------------ */
/* DAS ERGEBNIS                                                        */
/* ------------------------------------------------------------------ */

function ergebnis(over) {
  return Object.assign({
    visual_variants: [],
    visual_resolution: "INHERITED",
    inherited_visual: {
      visual_variant_id: ERBE.source_visual_variant_id,
      asset_sha256: ERBE.source_asset_sha256
    },
    publishing_allowed: false
  }, over || {});
}

test("CC9 · Bei TEXT_REVISION ist ein fehlendes Bild die Erfuellung", () => {
  const v = C.validateResult(ergebnis(), REVISION);
  assert.equal(v.ok, true, v.explanation);
  assert.equal(v.visualResolution, "INHERITED");
});

test("CC10 · Ein NEUES Bild ist bei TEXT_REVISION der Vertragsbruch", () => {
  /* Die Umkehrung der bisherigen Regel, und der eigentliche Punkt:
     es kostet eine begrenzte Ressource und macht die Textwirkung
     unmessbar. */
  const v = C.validateResult(ergebnis({
    visual_variants: [{ visual_variant_id: "neu", asset_path: "x.png" }] }), REVISION);
  assert.equal(v.ok, false);
  assert.ok(v.findings.some((f) => f.id === "unexpectedVisual"));
  /* Und ausdruecklich kein Inhaltsurteil. */
  assert.equal(v.contentJudgement, false);
});

test("CC11 · Ein stiller Austausch des Bildes faellt auf", () => {
  /* Schlimmer als ein fehlendes Bild: er sieht richtig aus. */
  const andereVariante = C.validateResult(ergebnis({
    inherited_visual: { visual_variant_id: "ein-anderes",
      asset_sha256: ERBE.source_asset_sha256 } }), REVISION);
  assert.equal(andereVariante.ok, false);
  assert.ok(andereVariante.findings.some((f) => f.id === "wrongInheritedVariant"));

  const andererHash = C.validateResult(ergebnis({
    inherited_visual: { visual_variant_id: ERBE.source_visual_variant_id,
      asset_sha256: "b".repeat(64) } }), REVISION);
  assert.equal(andererHash.ok, false);
  assert.ok(andererHash.findings.some((f) => f.id === "wrongInheritedAsset"));
});

test("CC12 · Das Ergebnis muss sagen, welches Bild gilt", () => {
  const ohne = C.validateResult(ergebnis({ visual_resolution: undefined }), REVISION);
  assert.equal(ohne.ok, false);
  assert.ok(ohne.findings.some((f) => f.id === "missingResolution"));
});

test("CC13 · FULL_CREATIVE ohne Bild bleibt ein Fehler", () => {
  const v = C.validateResult({ visual_variants: [], publishing_allowed: false },
    { request_type: C.FULL_CREATIVE });
  assert.equal(v.ok, false);
  assert.ok(v.findings.some((f) => f.id === "missingVisual"));
});

test("CC14 · Die kanonische Auswahl bleibt bei Vision Universe", () => {
  const v = C.validateResult(ergebnis({ selected_hook: "irgendeiner" }), REVISION);
  assert.equal(v.ok, false);
  assert.ok(v.findings.some((f) => f.id === "canonicalSelection"));
});

test("CC15 · publishing_allowed bleibt false", () => {
  const v = C.validateResult(ergebnis({ publishing_allowed: true }), REVISION);
  assert.equal(v.ok, false);
  assert.ok(v.findings.some((f) => f.id === "publishingClaimed"));
});

test("CC16 · VISUAL_REVISION ist vorgesehen und nicht implementiert", () => {
  /* Ein Auftragstyp, den niemand stellt, waere Code ohne Aufrufer —
     und der erste echte Bedarf wuerde ihn ohnehin anders formen. */
  assert.equal(C.TYPEN.includes("VISUAL_REVISION"), false);
  const v = C.validateRequest({ request_type: "VISUAL_REVISION" });
  assert.equal(v.ok, false);
  assert.equal(v.reason, "unknownRequestType");
});
