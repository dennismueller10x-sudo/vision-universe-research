/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/creative-reuse.test.mjs

   VERIFIED CREATIVE RESULTS ARE DURABLE PRODUCTION ARTIFACTS

   -------------------------------------------------------------------------
   DER REALE BEFUND, DER DIESE DATEI AUSGELOEST HAT
   -------------------------------------------------------------------------

   MANUAL_TOPIC=MSFT (Lauf #44, 23.09.) traf sein Thema korrekt (der
   AUDIENCE_SEPARATION-Fix von PR #181 liess EVIDENCE_SUFFICIENCY zum
   ersten Mal bestehen) — aber request-creative.mjs schrieb trotzdem
   einen komplett NEUEN Brief, dispatch-creative-job.mjs legte einen
   verwaisten Registereintrag an, und run-social-cycle.mjs fand lokal
   weder Brief noch Ergebnis mit passendem processing_key, fiel auf
   TEMPLATE zurueck — und selbst der lieferte kein Bild ("KEIN BILD —
   noSource"). Der bereits VERIFIED ChatGPT-Work-Kreativ (PR #179,
   AI_INFRASTRUCTURE, echter Hook) blieb unerreicht.

   Ursache: legeAb() (ingest-creative.mjs) schreibt Brief+Ergebnis nur
   EINMAL, im selben Lauf, der ein Ergebnis zuerst prueft — committet
   wird nichts. Ein spaeterer, frischer Checkout sieht im Register
   VERIFIED, aber keine Bytes dazu.

   Diese Tests laufen, wo es irgend geht, gegen den ECHTEN, bereits
   verifizierten MSFT-Job und seinen echten, noch existierenden
   Request-Branch auf origin (derselbe Massstab wie evidence-package.
   test.mjs gegen das echte XOM-Bundle) — keine Nachbildung, die nur
   sich selbst beweist.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

import { hydrateVerifiedJob } from "../../scripts/social/ingest-creative.mjs";
import { verifizierteJobsFuer, entscheideWiederverwendung }
  from "../../scripts/social/request-creative.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MSFT_CONTENT_ID = "vu-msft-20260918";
const MSFT_ZWEIG = "authoring/request/" + MSFT_CONTENT_ID;

function msftJobEintrag() {
  const verifiziert = verifizierteJobsFuer(MSFT_CONTENT_ID);
  return verifiziert[verifiziert.length - 1];
}

test("CR-A0 · verifizierteJobsFuer findet den echten VERIFIED MSFT-Job", () => {
  const treffer = verifizierteJobsFuer(MSFT_CONTENT_ID);
  assert.ok(treffer.length >= 1);
  assert.ok(treffer.every((j) => j.state === "CREATIVE_JOB_VERIFIED"));
});

test("CR-A0b · verifizierteJobsFuer findet nichts fuer ein erfundenes Inhaltsobjekt", () => {
  assert.deepEqual(verifizierteJobsFuer("vu-diesen-inhalt-gibt-es-nicht-20990101"), []);
});

function aufraeumen() {
  rmSync(join(ROOT, "authoring/requests", MSFT_CONTENT_ID),
    { recursive: true, force: true });
}

/* ------------------------------------------------------------------ */
/* A · HYDRATE: EIN ECHTES VERIFIED RESULT WIRD WIEDERGEFUNDEN         */
/* ------------------------------------------------------------------ */

test("CR-A1 · hydrateVerifiedJob findet das echte, verifizierte MSFT-Ergebnis", () => {
  const jobEintrag = msftJobEintrag();
  assert.ok(jobEintrag, "Der reale MSFT-Job muss VERIFIED im Register stehen " +
    "(PR #179/#181) — ohne ihn ist dieser Test kein Regressionsschutz.");

  aufraeumen();
  try {
    const r = hydrateVerifiedJob(MSFT_CONTENT_ID, jobEintrag);
    assert.equal(r.ok, true, r.explanation);
    assert.equal(r.bericht.state, "COMPLETED");
    assert.ok(existsSync(join(ROOT, "authoring/requests", MSFT_CONTENT_ID,
      "authoring-result.json")), "Das Ergebnis muss im Arbeitsbaum liegen.");
    assert.ok(r.bericht.brief.evidence_package &&
      r.bericht.brief.evidence_package.package_id,
      "Der archivierte Brief muss eine package_id tragen — sonst kann " +
      "spaeter nicht revalidiert werden.");
  } finally { aufraeumen(); }
});

test("CR-A2 · Ohne resultCommitSha faellt hydrateVerifiedJob auf den Request-Branch zurueck", () => {
  /* Der reale MSFT-Job traegt (noch) keinen resultCommitSha — er wurde
     vor dieser Owner-Entscheidung verifiziert. Trotzdem muss die
     Rueckgewinnung gelingen: ueber origin/authoring/request/<id>, den
     Branch, den open-creative-request.mjs beim Dispatch offen liess
     und den nichts je schliesst. */
  const jobOhneProvenance = { creativeJobId: "job_test_ohne_provenance" };
  aufraeumen();
  try {
    const r = hydrateVerifiedJob(MSFT_CONTENT_ID, jobOhneProvenance);
    assert.equal(r.ok, true, r.explanation);
    assert.equal(r.ref, "origin/" + MSFT_ZWEIG);
  } finally { aufraeumen(); }
});

test("CR-A3 · Ein gespeicherter resultCommitSha wird VOR dem Branch versucht", () => {
  /* Durabler als der Branch: ein Commit, direkt referenziert, bleibt
     gueltig, auch wenn der Branch spaeter geloescht wird. Ermittelt
     ueber den echten Branch-Tip, damit der Test nicht an einer
     erfundenen SHA vorbeischeitert. */
  execFileSync("git", ["fetch", "origin", MSFT_ZWEIG],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  const tip = execFileSync("git", ["rev-parse", "origin/" + MSFT_ZWEIG],
    { cwd: ROOT, encoding: "utf8" }).trim();

  aufraeumen();
  try {
    const r = hydrateVerifiedJob(MSFT_CONTENT_ID,
      { creativeJobId: "job_test_mit_commit", resultCommitSha: tip });
    assert.equal(r.ok, true, r.explanation);
    assert.equal(r.ref, tip, "Der Commit-SHA muss vor dem Branch-Fallback " +
      "verwendet werden.");
  } finally { aufraeumen(); }
});

/* ------------------------------------------------------------------ */
/* D · FAIL CLOSED: VERIFIED IM LEDGER, ABER NICHT AUFFINDBAR          */
/* ------------------------------------------------------------------ */

test("CR-D1 · Ein nicht auffindbares Ergebnis meldet VERIFIED_RESULT_UNAVAILABLE", () => {
  /* Weder ein echter Commit noch ein echter Branch — die ehrliche
     Antwort ist ein benannter Fehlschlag, kein Template-Rueckfall und
     keine Erfindung. */
  const r = hydrateVerifiedJob("vu-diesen-inhalt-gibt-es-nicht-20990101",
    { creativeJobId: "job_erfunden", resultCommitSha: "f".repeat(40) });
  assert.equal(r.ok, false);
  assert.equal(r.state, "VERIFIED_RESULT_UNAVAILABLE");
  assert.match(r.explanation, /VERIFIED_RESULT_UNAVAILABLE|job_erfunden/);
});

test("CR-D2 · Beide Quellen wurden ehrlich versucht, nicht nur eine", () => {
  const r = hydrateVerifiedJob("vu-diesen-inhalt-gibt-es-nicht-20990101",
    { creativeJobId: "job_erfunden", resultCommitSha: "f".repeat(40) });
  assert.equal(r.versucht.length, 2, "Commit-SHA und Branch-Fallback muessen " +
    "beide versucht worden sein, bevor aufgegeben wird.");
});

/* ------------------------------------------------------------------ */
/* B/E · CURRENT EVIDENCE REVALIDATION — DIE REINE ENTSCHEIDUNG        */
/* ------------------------------------------------------------------ */

test("CR-B1 · Unveraenderte package_id -> REUSE_VERIFIED_CREATIVE", () => {
  const archiviert = { evidence_package: { package_id: "evp_gleich" } };
  const e = entscheideWiederverwendung(archiviert, "evp_gleich");
  assert.equal(e.action, "REUSE_VERIFIED_CREATIVE");
  assert.equal(e.packageId, "evp_gleich");
});

test("CR-E1 · Abweichende package_id -> NEW_CREATIVE_JOB_REQUIRED, kein stilles Reuse", () => {
  /* Der Fall aus §3/§4 der Owner-Entscheidung: die Evidenz hat sich
     materiell geaendert (ein anderer Wert unter derselben Entitaet und
     demselben Datenstand). Kein stilles Wiederverwenden. */
  const archiviert = { evidence_package: { package_id: "evp_alt" } };
  const e = entscheideWiederverwendung(archiviert, "evp_neu");
  assert.equal(e.action, "NEW_CREATIVE_JOB_REQUIRED");
  assert.equal(e.from, "evp_alt");
  assert.equal(e.to, "evp_neu");
});

test("CR-E2 · Eine fehlende archivierte package_id ist kein Reuse", () => {
  /* Ein Brief von vor dieser Owner-Entscheidung traegt evidence_package
     moeglicherweise gar nicht. Fail closed statt einer Annahme. */
  const e = entscheideWiederverwendung({}, "evp_neu");
  assert.equal(e.action, "NEW_CREATIVE_JOB_REQUIRED");
  assert.equal(e.from, null);
});

test("CR-B2 · Die reale MSFT-package_id bleibt durch den AUDIENCE_SEPARATION-Fix unveraendert", () => {
  /* package_id haengt an entity + asOf + dataVersion + Beleg-ID:Wert-
     Paaren (evidence-package.js) - nicht am Wortlaut. Der Fix in PR
     #181 aenderte nur den Wortlaut von score-not-probability (value:
     null). Dieser Test haelt fest, WARUM REUSE_VERIFIED_CREATIVE fuer
     MSFT heute greift: die Fakten haben sich nicht geaendert, nur wie
     ueber sie gesprochen wird. */
  const EvidencePackage = require("../engines/evidence-package.js");
  const bundle = JSON.parse(readFileSync(
    join(ROOT, "quant/data/technical/instruments/MSFT.json"), "utf8")).bundle;
  const heute = EvidencePackage.fromTechnicalBundle(bundle, { entity: "MSFT" });

  const jobEintrag = msftJobEintrag();
  assert.ok(jobEintrag);
  aufraeumen();
  try {
    const hydriert = hydrateVerifiedJob(MSFT_CONTENT_ID, jobEintrag);
    assert.equal(hydriert.ok, true, hydriert.explanation);
    const e = entscheideWiederverwendung(hydriert.bericht.brief, heute.packageId);
    assert.equal(e.action, "REUSE_VERIFIED_CREATIVE",
      "Weicht dieser Test ab, hat sich die reale MSFT-Evidenz materiell " +
      "geaendert (neuer Marktdatenstand) - dann ist NEW_CREATIVE_JOB_REQUIRED " +
      "die korrekte, nicht die verletzte Erwartung.");
  } finally { aufraeumen(); }
});

/* ------------------------------------------------------------------ */
/* C/F · DAS ECHTE request-creative.mjs: REUSE, KEIN --write, IDEMPOTENT */
/* ------------------------------------------------------------------ */

function requestCreativeLauf() {
  return execFileSync(process.execPath,
    [join(ROOT, "scripts/social/request-creative.mjs"), "--symbol", "MSFT"],
    { cwd: ROOT, encoding: "utf8" });
}

test("CR-C1 · request-creative.mjs meldet REUSE_VERIFIED_CREATIVE fuer das echte MSFT und schreibt keinen neuen Brief", () => {
  aufraeumen();
  try {
    const vorher = existsSync(join(ROOT, "authoring/requests", MSFT_CONTENT_ID,
      "authoring-brief.json"));
    assert.equal(vorher, false, "Vor dem Lauf darf kein Brief im Arbeitsbaum liegen.");

    const aus = requestCreativeLauf();
    assert.match(aus, /REUSE_VERIFIED_CREATIVE/);
    assert.doesNotMatch(aus, /NEW_CREATIVE_JOB_REQUIRED/);

    /* Ohne --write schreibt der normale Pfad ohnehin nichts - aber der
       REUSE-Pfad hydriert TROTZDEM (er braucht --write nicht, weil er
       keinen neuen Brief anlegt, sondern das bestehende Ergebnis
       zurueckholt). Das Ergebnis muss jetzt da sein. */
    assert.ok(existsSync(join(ROOT, "authoring/requests", MSFT_CONTENT_ID,
      "authoring-result.json")));
  } finally { aufraeumen(); }
});

test("CR-F1 · Zweimaliges Ausfuehren bleibt idempotent — dieselbe Antwort, kein zweiter Job", () => {
  aufraeumen();
  try {
    const erster = requestCreativeLauf();
    const registerVorher = readFileSync(
      join(ROOT, "social/data/creative-jobs.json"), "utf8");

    const zweiter = requestCreativeLauf();
    const registerNachher = readFileSync(
      join(ROOT, "social/data/creative-jobs.json"), "utf8");

    assert.match(erster, /REUSE_VERIFIED_CREATIVE/);
    assert.match(zweiter, /REUSE_VERIFIED_CREATIVE/);
    assert.equal(registerVorher, registerNachher,
      "Der REUSE-Pfad liest das Register, schreibt es aber nie - zwei " +
      "Laeufe duerfen keine zweite Provenance und keinen zweiten Job " +
      "erzeugen.");
  } finally { aufraeumen(); }
});
