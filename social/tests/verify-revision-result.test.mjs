/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/verify-revision-result.test.mjs

   Bei FULL_CREATIVE ist die Frage: ist das Bild heil angekommen?
   Bei TEXT_REVISION ist sie fast umgekehrt: ist es UNVERAENDERT
   geblieben? Ein fehlendes Bild faellt auf. Ein vertauschtes nicht —
   der Kandidat saehe fertig aus, und erst die Leistungsmessung waere
   hinterher auf ein anderes Bild bezogen als der Text, den sie
   erklaeren soll. Diese Tests pruefen genau diese stille Vertauschung.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { verify, PRUEFUNGEN } from "../../scripts/social/verify-revision-result.mjs";

const require = createRequire(import.meta.url);
const C = require("../engines/creative-contract.js");

const SHA = "a378d07895c481cbdb2b60ea21d42512ed844b9ce0216ca262efcc8fcc9e0b40";
const VARIANTE = "vu-xom-20260911:bf22582c:visual:FUTURE_TECH:01";
const PFAD = "authoring/requests/vu-xom-20260911/assets/visual-01.png";
const KEY = "brief_00b861f522ad2209:vu-xom-20260911-rev2:da72a18:1.0";

const BRIEF = {
  request_type: C.TEXT_REVISION,
  visual: C.inheritanceFrom({
    contentId: "vu-xom-20260911", candidateId: "cand_20260918_ca4ea408",
    visualVariantId: VARIANTE, assetReference: PFAD, sha256: SHA,
    byteSize: 1954408, mime: "image/png", width: 1122, height: 1402,
    verification: "VU_VERIFIED_COMPLETED"
  })
};

function ergebnis(aenderung) {
  const r = {
    request_type: C.TEXT_REVISION,
    hook_variants: [{ id: "h1", text: "Erster Haken" }, { id: "h2", text: "Zweiter Haken" }],
    caption: "Ein Text, der ohne die Kurve auskommt.",
    publishing_allowed: false,
    visual_resolution: "INHERITED",
    inherited_visual: {
      visual_variant_id: VARIANTE, asset_sha256: SHA,
      mime_type: "image/png", width: 1122, height: 1402
    },
    visual_variants: [],
    processing: { status: "completed", processing_key: KEY }
  };
  return Object.assign(r, aenderung || {});
}

/* Das geerbte Asset wird von verify() wirklich gelesen. Hier kommt es
   aus einem eingereichten Leser statt vom Datentraeger - dieselbe
   Schnittstelle, die das Skript mit readFileSync bedient. */
import { readFileSync } from "node:fs";
const ECHT = "authoring/requests/vu-xom-20260911/assets/visual-01.png";
const BYTES = readFileSync(new URL("../../" + ECHT, import.meta.url));
const leser = (pfad) => {
  if (pfad !== PFAD) throw new Error("Unerwarteter Pfad: " + pfad);
  return BYTES;
};

const OPT = { expectedProcessingKey: KEY, readInheritedAsset: leser };

/* ------------------------------------------------------------------ */
/* DER ERWARTETE FALL                                                  */
/* ------------------------------------------------------------------ */

test("RV1 · Eine vertragstreue Revision besteht alle vierzehn Pruefungen", () => {
  const b = verify(BRIEF, ergebnis(), OPT);
  assert.equal(b.ok, true, b.explanation);
  assert.equal(b.missing.length, 0);
  assert.equal(b.failureType, null);
});

test("RV2 · Jede Pruefung wird auch wirklich ausgewertet", () => {
  /* Ein Tippfehler im Namen eines pruefe()-Aufrufs wuerde die Pruefung
     lautlos aus der Liste fallen lassen — dieselbe Defektklasse wie
     eine Whitelist, die ein Feld stillschweigend verschluckt. Beide
     Richtungen muessen deckungsgleich sein. */
  const b = verify(BRIEF, ergebnis(), OPT);
  const ausgewertet = Object.keys(b.checks).sort();
  assert.deepEqual(ausgewertet, [...PRUEFUNGEN].sort());
  assert.equal(PRUEFUNGEN.length, 14);
});

/* ------------------------------------------------------------------ */
/* DIE STILLE VERTAUSCHUNG                                             */
/* ------------------------------------------------------------------ */

test("RV3 · Gleiche Variantenkennung, anderer Hash ist ein Austausch", () => {
  const b = verify(BRIEF, ergebnis({
    inherited_visual: {
      visual_variant_id: VARIANTE,
      asset_sha256: "b".repeat(64),
      mime_type: "image/png", width: 1122, height: 1402
    }
  }), OPT);
  assert.equal(b.ok, false);
  assert.ok(b.missing.includes("assetHashUnchanged"));
  /* Die Kennung allein haette nichts gemerkt. */
  assert.equal(b.checks.visualVariantIdUnchanged, true);
});

test("RV4 · Ein neues Bild ist der Vertragsbruch, nicht das Fehlen eines", () => {
  const b = verify(BRIEF, ergebnis({
    visual_resolution: "GENERATED",
    visual_variants: [{ id: "neu:01", asset_path: "authoring/requests/x/assets/neu.png" }]
  }), OPT);
  assert.equal(b.ok, false);
  assert.equal(b.failureType, "CONTRACT_MISMATCH");
  assert.ok(b.missing.includes("noNewVisualVariant"));
  assert.ok(b.missing.includes("noNewAssetPath"));
  assert.ok(b.missing.includes("visualResolutionInherited"));
});

test("RV5 · Ein Vertragsbruch ist kein Urteil ueber den Inhalt", () => {
  /* Wuerde VU das als Inhaltsfehler lernen, lernte es Unsinn: ueber
     Haken, Evidenz und Bildstrategie sagt ein Vertragsbruch nichts. */
  const b = verify(BRIEF, ergebnis({ visual_variants: [{ id: "neu:01" }] }), OPT);
  assert.equal(b.contentJudgement, false);
});

/* ------------------------------------------------------------------ */
/* FEHLEN IST KEINE AENDERUNG — ABWEICHEN SCHON                        */
/* ------------------------------------------------------------------ */

test("RV6 · Fehlende Masse und MIME gelten als die des Auftrags", () => {
  const b = verify(BRIEF, ergebnis({
    inherited_visual: { visual_variant_id: VARIANTE, asset_sha256: SHA }
  }), OPT);
  assert.equal(b.ok, true, b.explanation);
});

test("RV7 · Abweichende Masse sind ein Austausch, auch bei gleichem Hash", () => {
  const b = verify(BRIEF, ergebnis({
    inherited_visual: {
      visual_variant_id: VARIANTE, asset_sha256: SHA,
      mime_type: "image/png", width: 1080, height: 1350
    }
  }), OPT);
  assert.equal(b.ok, false);
  assert.ok(b.missing.includes("dimensionsUnchanged"));
});

test("RV8 · Abweichender MIME-Typ faellt auf", () => {
  const b = verify(BRIEF, ergebnis({
    inherited_visual: {
      visual_variant_id: VARIANTE, asset_sha256: SHA, mime_type: "image/jpeg"
    }
  }), OPT);
  assert.equal(b.ok, false);
  assert.ok(b.missing.includes("mimeUnchanged"));
});

/* ------------------------------------------------------------------ */
/* DER AUFTRAG SELBST                                                  */
/* ------------------------------------------------------------------ */

test("RV9 · Ein FULL_CREATIVE-Ergebnis erfuellt keine TEXT_REVISION", () => {
  const b = verify(BRIEF, ergebnis({ request_type: C.FULL_CREATIVE }), OPT);
  assert.equal(b.ok, false);
  assert.ok(b.missing.includes("requestTypeCorrect"));
});

test("RV10 · Ohne neue Haken ist die Revision gegenstandslos", () => {
  const b = verify(BRIEF, ergebnis({ hook_variants: [] }), OPT);
  assert.equal(b.ok, false);
  assert.ok(b.missing.includes("hookVariantsPresent"));
});

test("RV11 · Die kanonische Auswahl trifft Vision Universe", () => {
  const b = verify(BRIEF, ergebnis({ selected_hook: "h2" }), OPT);
  assert.equal(b.ok, false);
  assert.ok(b.missing.includes("noCanonicalSelection"));
});

test("RV12 · publishing_allowed=true wird nie durchgewunken", () => {
  const b = verify(BRIEF, ergebnis({ publishing_allowed: true }), OPT);
  assert.equal(b.ok, false);
  assert.ok(b.missing.includes("publishingDenied"));
});

test("RV13 · Ein fremder Processing Key gehoert zu einem fremden Auftrag", () => {
  const b = verify(BRIEF, ergebnis({
    processing: { status: "completed", processing_key: "brief_ffff:andere:aa:1.0" }
  }), OPT);
  assert.equal(b.ok, false);
  assert.ok(b.missing.includes("processingKeyCorrect"));
});

test("RV14 · Ohne erwarteten Key wird der Key nicht erfunden", () => {
  /* Ohne Vergleichswert darf die Pruefung nicht scheinbar bestehen
     UND nicht scheinbar scheitern — sie prueft dann schlicht nichts. */
  const b = verify(BRIEF, ergebnis(), { readInheritedAsset: leser });
  assert.equal(b.checks.processingKeyCorrect, true);
  assert.equal(b.ok, true);
});

test("RV15 · Ein laufendes Ergebnis ist kein fertiges", () => {
  const b = verify(BRIEF, ergebnis({
    processing: { status: "in_progress", processing_key: KEY }
  }), OPT);
  assert.equal(b.ok, false);
  assert.ok(b.missing.includes("processingCompleted"));
});

test("RV16 · Ein leeres Ergebnis besteht nichts und wirft nicht", () => {
  const b = verify(BRIEF, null, OPT);
  assert.equal(b.ok, false);
  assert.equal(b.failureType, "CONTRACT_MISMATCH");
  /* Vier Pruefungen bestehen hier gegenstandslos: wo gar kein Bild
     gemeldet wird, ist auch keines NEU und kein MIME abweichend. Das
     fehlende Bild faellt trotzdem auf — aber ueber die Identitaet,
     nicht ueber die Abwesenheitspruefungen. Nur deshalb genuegt es
     nicht, die neuen Varianten zu zaehlen. */
  assert.equal(b.checks.noNewVisualVariant, true);
  assert.equal(b.checks.mimeUnchanged, true);
  assert.equal(b.checks.visualVariantIdUnchanged, false);
  assert.equal(b.checks.assetHashUnchanged, false);
});

/* ------------------------------------------------------------------ */
/* DAS GEERBTE ASSET SELBST                                            */
/* ------------------------------------------------------------------ */

test("RV17 · Ohne Leser gilt das Erbe als UNGEPRUEFT, nicht als in Ordnung", () => {
  /* Ein Aufrufer, der den Leser vergisst, bekaeme sonst ein
     stillschweigendes Bestanden - und das waere genau die
     Defektklasse, gegen die diese Datei ueberhaupt antritt. */
  const b = verify(BRIEF, ergebnis(), { expectedProcessingKey: KEY });
  assert.equal(b.ok, false);
  assert.equal(b.inheritedAsset.checked, false);
  assert.equal(b.inheritedAsset.ok, false);
  /* Die vierzehn bestehen trotzdem - der Befund liegt woanders. */
  assert.equal(b.missing.length, 0);
});

test("RV18 · Ein beschaedigtes Erbe faellt auf, auch wenn das Ergebnis stimmt", () => {
  const halb = BYTES.subarray(0, Math.floor(BYTES.length / 2));
  const b = verify(BRIEF, ergebnis(), {
    expectedProcessingKey: KEY, readInheritedAsset: () => halb
  });
  assert.equal(b.ok, false);
  assert.equal(b.missing.length, 0, "Alle vierzehn bestehen - die Datei nicht.");
  assert.equal(b.inheritedAsset.checked, true);
  assert.equal(b.inheritedAsset.ok, false);
});

test("RV19 · Ein unlesbares Erbe wirft nicht, es ist ein Befund", () => {
  const b = verify(BRIEF, ergebnis(), {
    expectedProcessingKey: KEY,
    readInheritedAsset: () => { throw new Error("ENOENT"); }
  });
  assert.equal(b.ok, false);
  assert.equal(b.inheritedAsset.checked, true);
  assert.match(b.inheritedAsset.explanation, /nicht lesbar/);
});

/* ------------------------------------------------------------------ */
/* ZWEI SCHREIBWEISEN                                                  */
/* ------------------------------------------------------------------ */

test("RV20 · Die source_*-Schreibweise des Auftrags wird gelesen", () => {
  /* So kam das erste echte Ergebnis zurueck: das Ergebnis gibt den
     Block des Auftrags woertlich wieder. Ein Pruefer, der nur die
     flache Schreibweise kennt, laege undefined vor und wiese das
     RICHTIGE Ergebnis zurueck. */
  const b = verify(BRIEF, ergebnis({
    inherited_visual: {
      source_visual_variant_id: VARIANTE, source_asset_sha256: SHA,
      source_mime_type: "image/png", source_width: 1122, source_height: 1402
    }
  }), OPT);
  assert.equal(b.ok, true, b.explanation);
});

test("RV21 · Toleriert werden die Namen, nie die Werte", () => {
  const b = verify(BRIEF, ergebnis({
    inherited_visual: {
      visual_variant_id: VARIANTE,
      asset_sha256: SHA, source_asset_sha256: "c".repeat(64)
    }
  }), OPT);
  assert.equal(b.ok, false);
  assert.ok(b.missing.includes("assetHashUnchanged"),
    "Ein Widerspruch ist ein Befund, keine Auswahl zwischen zwei Werten.");
  assert.ok(b.findings.some((f) => f.check === "inheritedFieldConflict"));
});

/* ------------------------------------------------------------------ */
/* DIE AUSWAHL BLEIBT BEI VISION UNIVERSE                              */
/* ------------------------------------------------------------------ */

test("RV22 · Eine Empfehlung ist erlaubt, eine Auswahl nicht", () => {
  const empfehlung = {
    recommended_hook_variant_id: "…:value_first:02",
    recommendation_scope: "creative_agent_editorial_only",
    is_canonical_selection: false
  };
  assert.equal(verify(BRIEF, ergebnis({ recommended_hook: empfehlung }), OPT).ok, true);

  const b = verify(BRIEF, ergebnis({
    recommended_hook: Object.assign({}, empfehlung, { is_canonical_selection: true })
  }), OPT);
  assert.equal(b.ok, false, "selected_hook leer zu finden genuegt nicht - " +
    "die Auswahl koennte unter einem anderen Namen dastehen.");
  assert.ok(b.missing.includes("noCanonicalSelection"));
});

test("RV23 · Auch processing.canonical_hook_selected zaehlt als Auswahl", () => {
  const b = verify(BRIEF, ergebnis({
    processing: { status: "completed", processing_key: KEY, canonical_hook_selected: true }
  }), OPT);
  assert.equal(b.ok, false);
  assert.ok(b.missing.includes("noCanonicalSelection"));
});
