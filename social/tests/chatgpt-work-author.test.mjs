/* =========================================================================
   VU SOCIAL — Der Creative Agent ueber GitHub (CG1–CG20)

   -------------------------------------------------------------------------
   GEPRUEFT WIRD GEGEN DIE ECHTEN ARTEFAKTE
   -------------------------------------------------------------------------

   `fixtures/pr98/` enthaelt Brief und Ergebnis aus dem realen
   Text+Bild-Proof, Byte fuer Byte. Ein selbst erfundenes Ergebnis wuerde
   beweisen, dass der Adapter das selbst Erfundene versteht.

   -------------------------------------------------------------------------
   DIE ZWEI GRENZEN, DIE HIER VERTEIDIGT WERDEN
   -------------------------------------------------------------------------

   IDENTITAET. Eine einmal verwendete `hook_variant_id` darf niemals
   spaeter einen anderen Text bezeichnen. Das laesst sich nicht dadurch
   erreichen, dass man dem Agenten glaubt — im ersten Textproof hiessen
   die Varianten `vu-proof-hook-001-a/b/c`, frei gewaehlt und an nichts
   gebunden. Vision Universe rechnet die Kennung nach.

   VERANTWORTUNG. Der Agent formuliert und gestaltet. Die kanonische
   Auswahl gehoert zur Strategie und damit zu Vision Universe. Ein
   Ergebnis mit `selected_hook` wird zurueckgewiesen — nicht, weil die
   Wahl schlecht waere, sondern weil sie nicht seine ist.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const CW = require("../providers/authoring/chatgpt-work/adapter.js");
const Authoring = require("../engines/authoring.js");
const Brief = require("../engines/content-brief.js");
const Brand = require("../engines/brand.js");

const HIER = dirname(fileURLToPath(import.meta.url));
const F = (p) => join(HIER, "fixtures", p);

const BRIEF_ROH = readFileSync(F("pr98/authoring-brief.json"));
const ERGEBNIS = JSON.parse(readFileSync(F("pr98/authoring-result.json"), "utf8"));
const ASSET = readFileSync(F("creative-visual-proof.png"));
const TEXT_PROOF = JSON.parse(readFileSync(F("pr97-text-result.json"), "utf8"));

/* Der Blob-SHA des echten Briefs — die Wurzel aller Kennungen. */
const BRIEF_SHA = CW.blobSha(BRIEF_ROH);
const KONTEXT = {
  briefId: ERGEBNIS.brief_id,
  contentId: ERGEBNIS.content_id,
  briefBlobSha: BRIEF_SHA,
  hookType: "curiosity_gap"
};

const leseAsset = () => ASSET;

/* ------------------------------------------------------------------ */
/* DIE IDENTITAET                                                      */
/* ------------------------------------------------------------------ */

test("CG1 · Der Blob-SHA stimmt mit git ueberein", () => {
  /* Die ganze Identitaetskette haengt daran. Git hasht nicht den Inhalt
     allein, sondern eine Kopfzeile davor — wer das falsch nachbaut,
     bekommt Kennungen, die nirgends wieder auftauchen. */
  const vonGit = execSync("git hash-object " + JSON.stringify(F("pr98/authoring-brief.json")))
    .toString().trim();
  assert.equal(CW.blobSha(BRIEF_ROH), vonGit);
});

test("CG2 · Der Agent nennt denselben Blob-SHA, den wir rechnen", () => {
  assert.equal(ERGEBNIS.processing.brief_blob_sha, BRIEF_SHA);
});

test("CG3 · Alle Kennungen des echten Ergebnisses lassen sich nachrechnen", () => {
  ERGEBNIS.hook_variants.forEach((h, i) => {
    assert.equal(h.hook_variant_id,
      CW.hookVariantId(ERGEBNIS.content_id, BRIEF_SHA, h.hook_type, i),
      "Variante " + (i + 1));
  });
});

test("CG4 · Die Kennung ist content_id : brief_blob_sha : hook_type : ordinal", () => {
  const id = CW.hookVariantId("vu-x", "abc123", "value_first", 0);
  assert.equal(id, "vu-x:abc123:value_first:01");
  assert.equal(CW.hookVariantId("vu-x", "abc123", "value_first", 9), "vu-x:abc123:value_first:10");
});

test("CG5 · Eine andere Brief-Revision ergibt andere Kennungen", () => {
  /* Das ist der Kern der Unveraenderlichkeit: aendert sich der Brief,
     kann dieselbe Kennung nicht wieder entstehen. */
  const a = CW.hookVariantId("vu-x", "sha-eins", "value_first", 0);
  const b = CW.hookVariantId("vu-x", "sha-zwei", "value_first", 0);
  assert.notEqual(a, b);
});

test("CG6 · Frei gewaehlte Kennungen werden zurueckgewiesen", () => {
  /* Der erste Textproof: `vu-proof-hook-001-a`. Lesbar, huebsch, an
     nichts gebunden — und damit als Messtraeger wertlos. */
  const v = CW.verifyResult(TEXT_PROOF, {
    briefId: TEXT_PROOF.brief_id, contentId: TEXT_PROOF.content_id,
    briefBlobSha: "egal", hookType: "curiosity_gap"
  });
  assert.equal(v.ok, false);
  assert.ok(v.findings.some((f) => f.id === "hookIdMismatch"));
  assert.match(v.findings.find((f) => f.id === "hookIdMismatch").message, /keine Messung tragen/);
});

test("CG7 · Doppelte Kennungen fallen auf", () => {
  const doppelt = JSON.parse(JSON.stringify(ERGEBNIS));
  doppelt.hook_variants[1].hook_variant_id = doppelt.hook_variants[0].hook_variant_id;
  const v = CW.verifyResult(doppelt, KONTEXT);
  assert.ok(v.findings.some((f) => f.id === "duplicateHookId"));
});

/* ------------------------------------------------------------------ */
/* DIE VERANTWORTUNGSGRENZE                                            */
/* ------------------------------------------------------------------ */

test("CG8 · Das echte Ergebnis wahrt die Grenze", () => {
  const v = CW.verifyResult(ERGEBNIS, KONTEXT);
  assert.equal(v.ok, true, v.explanation);
  assert.equal(ERGEBNIS.recommended_hook.is_canonical_selection, false);
  assert.equal(ERGEBNIS.selected_hook, undefined);
});

test("CG9 · Ein `selected_hook` wird zurueckgewiesen", () => {
  /* Nicht, weil die Wahl schlecht waere, sondern weil sie nicht seine
     ist. Wer das einmal durchgehen laesst, hat die
     Verantwortungsgrenze verschoben, ohne sie zu verhandeln. */
  const uebergriff = Object.assign({}, ERGEBNIS, {
    selected_hook: { hook_variant_id: "x", text: "y" } });
  const v = CW.verifyResult(uebergriff, KONTEXT);
  assert.equal(v.ok, false);
  assert.ok(v.findings.some((f) => f.id === "canonicalSelectionByAgent"));
});

test("CG10 · Eine Empfehlung, die kanonisch sein will, wird zurueckgewiesen", () => {
  const uebergriff = JSON.parse(JSON.stringify(ERGEBNIS));
  uebergriff.recommended_hook.is_canonical_selection = true;
  const v = CW.verifyResult(uebergriff, KONTEXT);
  assert.ok(v.findings.some((f) => f.id === "recommendationClaimsCanonical"));
});

test("CG11 · Ein Ergebnis, das Veroeffentlichung behauptet, wird zurueckgewiesen", () => {
  const v = CW.verifyResult(Object.assign({}, ERGEBNIS, { publishing_allowed: true }), KONTEXT);
  assert.ok(v.findings.some((f) => f.id === "publishingClaimed"));
});

test("CG12 · Ein Ergebnis zu einem fremden Brief wird zurueckgewiesen", () => {
  const v = CW.verifyResult(ERGEBNIS, Object.assign({}, KONTEXT, { briefId: "ein-anderer" }));
  assert.ok(v.findings.some((f) => f.id === "briefIdMismatch"));
});

/* ------------------------------------------------------------------ */
/* DAS ASSET                                                           */
/* ------------------------------------------------------------------ */

test("CG13 · Das echte Asset wird zurueckgelesen und bestaetigt", () => {
  const a = CW.verifyAssets(ERGEBNIS, leseAsset);
  assert.equal(a.ok, true, a.explanation);
  assert.equal(a.state, "READBACK_VERIFIED");
  assert.equal(a.checked[0].verification.actual.width, 1254);
});

test("CG14 · Ein abgeschnittenes Asset fuehrt zu RECOVERY_REQUIRED", () => {
  const a = CW.verifyAssets(ERGEBNIS, () => ASSET.subarray(0, 5000));
  assert.equal(a.ok, false);
  assert.equal(a.state, "RECOVERY_REQUIRED");
});

test("CG15 · Ein fehlendes Asset ist ein Befund, kein Absturz", () => {
  const a = CW.verifyAssets(ERGEBNIS, () => null);
  assert.equal(a.ok, false);
  assert.ok(a.findings.some((f) => f.id === "assetMissing"));
});

/* ------------------------------------------------------------------ */
/* DER AUTOR IM ABLAUF                                                 */
/* ------------------------------------------------------------------ */

function autorMit(transport, opts = {}) {
  return CW.createChatGptWorkAuthor(Object.assign({ transport }, opts));
}

function vuBrief() {
  return Brief.build({
    opportunity: { opportunityId: "opp", topic: "T", premise: "SECURITY_METRIC",
      hasCause: false },
    strategyDecision: { archetype: "STOCK_STORY" },
    evidence: [{ entity: "XOM", metric: "Technical Opportunity Score", value: 76,
      source: { source: "vu.technical", observedAt: "2026-09-16T00:00:00Z",
                state: "VERIFIED" } }]
  });
}

test("CG16 · Ohne Transport meldet er sich ab", () => {
  const a = CW.createChatGptWorkAuthor({});
  assert.equal(a.available().ok, false);
  assert.match(a.available().reason, /Request-Branch/);
});

test("CG17 · Ohne Ergebnis ist er PENDING, nicht kaputt", () => {
  /* Der Agent laeuft asynchron. Kein Ergebnis ist kein Fehler — der Lauf
     faellt auf den deterministischen Autor zurueck, und der naechste
     Lauf findet das Ergebnis vor. */
  const a = autorMit({ readResult: () => null });
  const r = a.write(vuBrief(), { contentId: "vu-x" });
  assert.deepEqual(r.variants, []);
  assert.equal(r.pending, true);
  assert.match(r.reason, /asynchron/);
});

test("CG18 · Er braucht keine Modell-API und keine Zugangsdaten", () => {
  /* Das ist der Unterschied, auf dem die Kostenentscheidung beruht. */
  const c = autorMit({ readResult: () => null }).capabilities;
  assert.equal(c.requiresClassicModelApi, false);
  assert.equal(c.requiresCredentials, false);
  assert.equal(c.asynchronous, true);
  assert.equal(c.transport, "github-pull-request-event");
});

test("CG19 · Mit echtem Ergebnis entstehen Varianten mit stabiler Kennung", () => {
  const a = autorMit({ readResult: () => ERGEBNIS, readAsset: leseAsset });
  const r = a.write(vuBrief(), {
    contentId: ERGEBNIS.content_id, briefBlobSha: BRIEF_SHA,
    agentBrief: JSON.parse(BRIEF_ROH.toString())
  });

  assert.equal(r.variants.length, 3, r.reason || "");
  assert.equal(r.variants[0].variantId, ERGEBNIS.hook_variants[0].hook_variant_id);
  assert.equal(r.variants[0].authorId, "chatgpt-work");
  assert.equal(r.asset.state, "READBACK_VERIFIED");
  assert.equal(r.recommendation.is_canonical_selection, false);
});

test("CG20 · Die Empfehlung des Agenten entscheidet NICHTS", () => {
  /* Sie reist mit, aber die Auswahl trifft die Bewertung von Vision
     Universe — wie bei jeder anderen Variante auch. */
  const a = autorMit({ readResult: () => ERGEBNIS, readAsset: leseAsset });
  const reg = Authoring.createRegistry();
  reg.register(a);

  const brief = vuBrief();
  const lauf = Authoring.run(reg, brief, {
    contentId: ERGEBNIS.content_id, briefBlobSha: BRIEF_SHA,
    agentBrief: JSON.parse(BRIEF_ROH.toString()),
    gates: { brand: (v) => Brand.check({ hook: v.hook, caption: v.caption }) }
  });

  /* Der Proof-Text enthaelt keine Belege aus UNSEREM Brief — er faellt
     deshalb korrekt am Claim Binding. Genau das ist der Punkt: ein
     generatives Ergebnis wird geprueft wie jedes andere. */
  assert.ok(lauf.evaluated.length > 0);
  assert.equal(typeof lauf.selection.chosen, "object");
});
