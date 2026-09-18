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
const ERGEBNIS_ROH = JSON.parse(readFileSync(F("pr98/authoring-result.json"), "utf8"));
const ASSET = readFileSync(F("creative-visual-proof.png"));

/* -------------------------------------------------------------------
   DAS ECHTE ERGEBNIS, AUF DEN HEUTIGEN VERTRAG GEHOBEN

   PR 98 entstand VOR dem gehaerteten Transportvertrag und kuendigt
   keine Dateigroesse an. Die Datei auf der Platte bleibt unangetastet -
   sie ist der Beweis und wird nicht nachtraeglich passend gemacht.

   Die Tests, die von Hooks, Text und Kennungen handeln, brauchen aber
   ein Ergebnis, das den heutigen Vertrag erfuellt; sonst pruefen sie
   nur noch, dass ein altes Ergebnis alt ist. Sie bekommen deshalb eine
   Kopie MIT der Ankuendigung. Dass das Original sie nicht traegt,
   prueft CG13 ausdruecklich.
   ------------------------------------------------------------------- */
const ERGEBNIS = JSON.parse(JSON.stringify(ERGEBNIS_ROH));
ERGEBNIS.visual_variants.forEach((v) => { v.asset_byte_size = ASSET.length; });
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

test("CG13 · Ein Ergebnis ohne angekuendigte Groesse besteht nicht", () => {
  /* Neun Pflichtpruefungen heisst neun. PR 98 kuendigt keine
     Dateigroesse an, also gibt es dazu nichts zu vergleichen - und ein
     Vergleich, der nicht stattgefunden hat, ist kein bestandener. Frueher
     sprang diese Pruefung still auf "bestanden", und weil das Schema
     `asset_byte_size` schreibt und die Pruefung `byte_size` las, lief sie
     bei KEINEM realen Ergebnis. */
  const roh = CW.verifyAssets(ERGEBNIS_ROH, leseAsset);
  assert.equal(roh.ok, false);
  assert.equal(roh.checked[0].verification.checks.byteSizeValid, null);
  /* Und es ist ausdruecklich kein Urteil ueber das Bild. */
  assert.equal(roh.checked[0].verification.contentJudgement, false);
});

test("CG13a · Das echte Asset wird zurueckgelesen und bestaetigt", () => {
  const a = CW.verifyAssets(ERGEBNIS, leseAsset);
  assert.equal(a.ok, true, a.explanation);
  assert.equal(a.state, "READBACK_VERIFIED");

  /* Der Befund traegt jetzt die ganze Transportpruefung statt nur der
     Dateimerkmale: gemessen wird unter `measured`, und die
     Chunk-Kette gehoert dazu. */
  assert.equal(a.checked[0].verification.measured.width, 1254);
  assert.equal(a.checked[0].verification.measured.structure.ok, true);
  assert.equal(a.checked[0].verification.state, "TRANSFER_VERIFIED");
});

test("CG13b · Ein Transportfehler ist kein Inhaltsurteil", () => {
  /* PR 106: der Agent meldete completed, das Asset war beschaedigt. Es
     der Hook oder der Visual Strategy anzulasten, dass eine Datei
     unterwegs zerbrochen ist, waere gelernter Unsinn. */
  const a = CW.verifyAssets(ERGEBNIS, () => ASSET.subarray(0, 5000));
  assert.equal(a.ok, false);
  const f = a.findings.find((x) => x.id === "assetVerification");
  assert.equal(f.failureType, "ASSET_TRANSPORT_INTEGRITY_FAILED");
  assert.equal(f.contentJudgement, false);
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

/* ------------------------------------------------------------------ */
/* DIE SCHREIBUNG DES AGENTENTEXTES                                    */
/* ------------------------------------------------------------------ */

test("CG24 · Umschrift im Agententext wird repariert, nicht veroeffentlicht", () => {
  /* Der Brief liefert dem Agenten Belegsaetze. Kommen sie in
     ASCII-Umschrift aus den Quant-Daten, uebernimmt er sie so — er
     kann nicht wissen, dass "traegt" ein Fehler ist. */
  const roh = JSON.parse(JSON.stringify(ERGEBNIS));
  roh.caption = "TREND_STRUCTURE traegt 27.35 von 30 Punkten bei. " +
    "Relative Staerke nicht verfuegbar.";

  const a = autorMit({ readResult: () => roh, readAsset: leseAsset });
  const r = a.write(vuBrief(), {
    contentId: roh.content_id, briefBlobSha: BRIEF_SHA,
    agentBrief: JSON.parse(BRIEF_ROH.toString())
  });

  assert.equal(r.variants.length, 3, r.reason || "");
  assert.match(r.variants[0].caption, /trägt 27\.35 von 30/);
  assert.match(r.variants[0].caption, /Stärke nicht verfügbar/);
  assert.ok(!/traegt|Staerke|verfuegbar/.test(r.variants[0].caption));
});

test("CG25 · Der unveraenderte Agententext bleibt als Provenance erhalten", () => {
  const roh = JSON.parse(JSON.stringify(ERGEBNIS));
  roh.caption = "TREND_STRUCTURE traegt 27.35 von 30 Punkten bei.";

  const a = autorMit({ readResult: () => roh, readAsset: leseAsset });
  const r = a.write(vuBrief(), {
    contentId: roh.content_id, briefBlobSha: BRIEF_SHA,
    agentBrief: JSON.parse(BRIEF_ROH.toString())
  });

  assert.equal(r.variants[0].textVerbatim.caption, roh.caption);
  /* Und die Kennung meint weiterhin denselben Text: die Reparatur ist
     deterministisch, also bezeichnet dieselbe Kennung bei jedem Lauf
     dasselbe Ergebnis. */
  const nochmal = a.write(vuBrief(), {
    contentId: roh.content_id, briefBlobSha: BRIEF_SHA,
    agentBrief: JSON.parse(BRIEF_ROH.toString())
  });
  assert.equal(nochmal.variants[0].variantId, r.variants[0].variantId);
  assert.equal(nochmal.variants[0].caption, r.variants[0].caption);
});

test("CG26 · textVerbatim haelt JEDE Aenderung an fremdem Text fest", () => {
  /* Frueher forderte dieser Test textVerbatim === null, wenn
     orthografisch nichts zu reparieren war. Seit der Pflichthinweis
     angehaengt wird, ist das zu eng gedacht: auch das Anhaengen ist
     eine Aenderung an Text, den ein anderer geschrieben hat.

     textVerbatim heisst deshalb nicht mehr "hier wurde die Schreibung
     korrigiert", sondern "so stand es beim Autor". Das ist die Angabe,
     auf die es fuer die Provenance ankommt. */
  const brief = vuBrief();
  const hinweis = brief.constraints && brief.constraints.disclaimer;
  const a = autorMit({ readResult: () => ERGEBNIS, readAsset: leseAsset });
  const r = a.write(brief, {
    contentId: ERGEBNIS.content_id, briefBlobSha: BRIEF_SHA,
    agentBrief: JSON.parse(BRIEF_ROH.toString())
  });

  assert.equal(r.variants[0].textResidue, null);

  if (hinweis) {
    assert.ok(r.variants[0].caption.endsWith(hinweis),
      "der Pflichthinweis fehlt am Ende der Caption");
    assert.equal(r.variants[0].textVerbatim.caption, ERGEBNIS.caption,
      "der unveraenderte Agententext ist nicht festgehalten");
  } else {
    assert.equal(r.variants[0].textVerbatim, null);
  }
});

test("CG26b · Der Pflichthinweis steht nicht zweimal da", () => {
  /* Steht er schon im Agententext, wird er nicht angehaengt. */
  const brief = vuBrief();
  const hinweis = (brief.constraints && brief.constraints.disclaimer) || null;
  if (!hinweis) return;

  const mitHinweis = JSON.parse(JSON.stringify(ERGEBNIS));
  mitHinweis.caption = "Eine Aussage. " + hinweis;

  const a = autorMit({ readResult: () => mitHinweis, readAsset: leseAsset });
  const r = a.write(brief, {
    contentId: ERGEBNIS.content_id, briefBlobSha: BRIEF_SHA,
    agentBrief: JSON.parse(BRIEF_ROH.toString())
  });
  const treffer = r.variants[0].caption.split(hinweis).length - 1;
  assert.equal(treffer, 1, "der Hinweis steht " + treffer + "-mal da");
});

test("CG27 · Unbekannte Umschrift wird gemeldet und blockiert die Variante", () => {
  /* Nicht geraten, nicht verschwiegen. Die Variante faellt am
     Marken-Tor — die uebrigen laufen weiter. */
  const roh = JSON.parse(JSON.stringify(ERGEBNIS));
  roh.caption = "Ein voellig unbekanntes Wort steht hier.";

  const a = autorMit({ readResult: () => roh, readAsset: leseAsset });
  const r = a.write(vuBrief(), {
    contentId: roh.content_id, briefBlobSha: BRIEF_SHA,
    agentBrief: JSON.parse(BRIEF_ROH.toString())
  });

  assert.ok(r.variants[0].textResidue.includes("voellig"));

  const marke = Brand.check({ hook: r.variants[0].hook, caption: r.variants[0].caption });
  assert.equal(marke.passed, false);
  assert.ok(marke.blocking.map((b) => b.id).includes("transliterated-umlauts"));
});

/* ------------------------------------------------------------------ */
/* DER ERNEUTE ANLAUF                                                  */
/* ------------------------------------------------------------------ */

function briefFuerAnlauf() {
  return { briefId: "brief_x", topic: "Thema", archetype: "STOCK_STORY",
    evidence: [{ entity: "XOM", metric: "Score", value: 76, statement: "76 Punkte." }],
    constraints: {} };
}

test("CG28 · Ein zweiter Anlauf ist ein eigener Vorgang", () => {
  /* Schweigt der Anbieter, muss derselbe Inhalt noch einmal angefragt
     werden koennen. Ohne eigenen Anlauf-Zaehler ergibt derselbe Brief
     denselben Blob-SHA und denselben Processing Key - und das Ledger
     weist den zweiten Anlauf zu Recht ab. */
  const a1 = CW.buildAgentBrief(briefFuerAnlauf(), { contentId: "vu-x-1", attempt: 1 });
  const a2 = CW.buildAgentBrief(briefFuerAnlauf(), { contentId: "vu-x-1", attempt: 2 });

  const sha1 = CW.blobSha(JSON.stringify(a1, null, 2) + "\n");
  const sha2 = CW.blobSha(JSON.stringify(a2, null, 2) + "\n");
  assert.notEqual(sha1, sha2, "zwei Anlaeufe teilen sich einen Blob-SHA");

  assert.notEqual(
    CW.processingKey("brief_x", "vu-x-1", sha1, "1.0"),
    CW.processingKey("brief_x", "vu-x-1", sha2, "1.0"));
});

test("CG29 · Die Idempotenzgrenze bleibt, wo sie war", () => {
  /* Kein neues Verfahren: der Anlauf steht IM Brief, alles andere folgt
     aus dem vorhandenen Mechanismus. Derselbe Anlauf ergibt zweimal
     dasselbe. */
  const a = CW.buildAgentBrief(briefFuerAnlauf(), { contentId: "vu-x-1", attempt: 2 });
  const b = CW.buildAgentBrief(briefFuerAnlauf(), { contentId: "vu-x-1", attempt: 2 });
  assert.equal(CW.blobSha(JSON.stringify(a, null, 2) + "\n"),
               CW.blobSha(JSON.stringify(b, null, 2) + "\n"));
});

test("CG30 · Der Neuversuch verliert seine Vorgeschichte nicht", () => {
  /* Ein Neuversuch ohne Kette ist von einem Erstversuch nicht zu
     unterscheiden - und dann laesst sich nicht sagen, wie oft der
     Anbieter fuer diesen Inhalt gebraucht wurde. */
  const a1 = CW.buildAgentBrief(briefFuerAnlauf(), { contentId: "vu-x-1" });
  assert.equal(a1.attempt, 1);
  assert.equal(a1.supersedes_attempt, null);
  assert.equal(a1.attempt_reason, null);

  const a3 = CW.buildAgentBrief(briefFuerAnlauf(), { contentId: "vu-x-1",
    attempt: 3, attemptReason: "Anbieter schwieg zweimal." });
  assert.equal(a3.attempt, 3);
  assert.equal(a3.supersedes_attempt, 2);
  assert.equal(a3.attempt_reason, "Anbieter schwieg zweimal.");
});

test("CG31 · Der Zaehler steigt nicht von selbst", () => {
  /* Er ist ein Parameter, und wer ihn setzt, hat sich entschieden. Eine
     Automatik hier waere genau die unkontrollierte Retry-Schleife, die
     es nicht geben soll. */
  const a = CW.buildAgentBrief(briefFuerAnlauf(), { contentId: "vu-x-1" });
  const b = CW.buildAgentBrief(briefFuerAnlauf(), { contentId: "vu-x-1" });
  assert.equal(a.attempt, 1);
  assert.equal(b.attempt, 1);
});

test("CG30 · Eine Textrevision erbt das verifizierte Visual", () => {
  /* Eine redaktionelle Ueberarbeitung erzeugt kein Bild. Ohne
     Vererbung faende der Zyklus kein Asset, zeichnete stattdessen eine
     eigene Karte — und das Visual, um dessen Erhalt es ging, waere
     still ersetzt worden. Genau das ist in der Simulation passiert,
     bevor diese Zeilen existierten.

     Geerbt heisst NICHT ungeprueft: gelesen wird frisch, und derselbe
     Transportvertrag laeuft darueber. */
  const S = require("../engines/asset-store.js");
  const Integrity = require("../engines/asset-integrity.js");

  const brief = JSON.parse(JSON.stringify(ERGEBNIS_ROH));
  brief.reuse_visual = {
    from_content_id: "vu-quelle",
    visual_variant_id: "vu-quelle:sha:visual:FUTURE_TECH:01",
    asset_path: "a.png",
    asset_sha256: Integrity.sha256(ASSET),
    asset_byte_size: ASSET.length,
    mime_type: "image/png", width: 1254, height: 1254
  };

  const geerbt = S.inherit(brief, () => ASSET, { freshReadback: true });
  assert.equal(geerbt.ok, true, geerbt.explanation);
  assert.equal(geerbt.transport, "ASSET_VERIFIED");
  assert.equal(geerbt.fromContentId, "vu-quelle");

  /* Und ein beschaedigtes Erbe wird nicht stillschweigend uebernommen. */
  const kaputt = S.inherit(brief, () => ASSET.subarray(0, 3000),
    { freshReadback: true });
  assert.equal(kaputt.ok, false);
  assert.equal(kaputt.regenerate, false,
    "ein Transportfehler darf keine neue Erzeugung ausloesen");
});
