/* =========================================================================
   VU SOCIAL — DER MOBILE AUSLOESER

   Dieser Workflow veroeffentlicht einen echten Beitrag. Er ist damit die
   einzige Datei im Repository, deren Ausfuehrung sich nicht zuruecknehmen
   laesst — und die einzige, die einen Admin-Schluessel benutzt.

   Geprueft wird deshalb nicht, ob er laeuft (das zeigt der Lauf), sondern
   ob seine Zusicherungen im Text stehen:

     - der Schluessel taucht in KEINEM Skripttext auf, nur in `env:`
     - er steht in keiner Adresse
     - der Workflow ruft genau den bestehenden Endpunkt auf, keinen zweiten
     - er laeuft nicht von selbst

   -------------------------------------------------------------------------
   WARUM DER SCHLUESSEL NICHT IN DEN SKRIPTTEXT DARF
   -------------------------------------------------------------------------

   GitHub Actions schreibt jedes `run:`-Skript ins Protokoll, BEVOR es
   laeuft. Stuende dort `${{ secrets.… }}`, waere die Stelle zwar
   maskiert — aber die Maskierung ist ein Netz, keine Konstruktion. Sie
   greift nicht, wenn der Wert unterwegs umgeformt wird (Base64, URL-
   Kodierung, Teilstrings). Ein Wert, der nie in den Skripttext gelangt,
   braucht das Netz nicht.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WF = join(ROOT, ".github", "workflows", "social-smoke-publish.yml");
const yaml = readFileSync(WF, "utf8");

/* Die Zeilen der `run:`-Bloecke — also das, was ins Protokoll geschrieben
   wird. `env:`-Bloecke gehoeren nicht dazu. */
function runZeilen(text) {
  const zeilen = text.split("\n");
  const raus = [];
  let drin = false;
  let einzug = 0;
  for (const zeile of zeilen) {
    const m = /^(\s*)run:\s*\|/.exec(zeile);
    if (m) { drin = true; einzug = m[1].length; continue; }
    if (!drin) continue;
    if (zeile.trim() === "") { raus.push(zeile); continue; }
    const aktuell = zeile.length - zeile.trimStart().length;
    if (aktuell <= einzug) { drin = false; continue; }
    raus.push(zeile);
  }
  return raus;
}

test("SW1 · Der Schluessel steht in keinem Skripttext", () => {
  const treffer = runZeilen(yaml).filter((z) => z.includes("secrets."));
  assert.deepEqual(treffer, [],
    "Was hier steht, schreibt Actions ins Protokoll — der Wert gehoert ueber `env:` herein:\n" +
    treffer.join("\n"));
});

test("SW2 · Der Schluessel wird ueber env: hereingereicht", () => {
  /* Das Gegenstueck zu SW1: die Abwesenheit allein waere auch erfuellt,
     wenn der Schluessel gar nicht benutzt wuerde. */
  assert.match(yaml, /KEY:\s*\$\{\{\s*secrets\.VU_SOCIAL_ADMIN_KEY\s*\}\}/,
    "Ohne env: kaeme der Schluessel gar nicht an");
});

test("SW3 · Der Schluessel steht in keiner Adresse", () => {
  /* Eine Adresse landet im Protokoll, in Fehlermeldungen und beim
     Betreiber der Gegenstelle. Eine Kopfzeile nicht. */
  for (const zeile of runZeilen(yaml)) {
    if (!/https?:\/\/|\$WORKER/.test(zeile)) continue;
    assert.ok(!/[?&](key|admin|token|auth)=/i.test(zeile),
      "Ein Schluessel in der Adresse: " + zeile.trim());
  }
  assert.match(yaml, /-H "Authorization: Bearer \$KEY"/,
    "Der Schluessel reist in der Authorization-Kopfzeile");
});

test("SW4 · Genau der bestehende Endpunkt, mit der bestehenden Bestaetigung", () => {
  /* Keine zweite Publishing-Implementierung: der Workflow ruft auf, was
     im Worker schon steht. */
  assert.match(yaml, /\/social\/meta\/smoke-publish\?confirm=PUBLISH-ONE-TEST-POST/);

  const graphAufrufe = runZeilen(yaml).filter((z) => /graph\.facebook\.com|media_publish/.test(z));
  assert.deepEqual(graphAufrufe, [],
    "Der Workflow darf Meta nicht selbst ansprechen — das tut der Worker:\n" +
    graphAufrufe.join("\n"));
});

test("SW5 · Er laeuft nicht von selbst", () => {
  /* Kein push, kein schedule. Ein Beitrag entsteht nur, wenn jemand ihn
     ausloest. */
  assert.match(yaml, /^on:\s*\n\s+workflow_dispatch:/m);
  assert.ok(!/^\s+(push|schedule|pull_request):/m.test(yaml),
    "Nur workflow_dispatch — sonst koennte ein Commit einen Beitrag erzeugen");
});

test("SW6 · Eine getippte Bestaetigung, kein blosser Knopf", () => {
  assert.match(yaml, /bestaetigung:/);
  assert.match(yaml, /!=\s*"VEROEFFENTLICHEN"/);
});

test("SW7 · Zwei Laeufe koennen sich nicht ueberholen", () => {
  /* Zwei gleichzeitige Laeufe waeren zwei Beitraege. */
  assert.match(yaml, /concurrency:\s*\n\s+group:\s*social-smoke-publish/);
  assert.match(yaml, /cancel-in-progress:\s*false/);
});

test("SW8 · Vor dem Veroeffentlichen wird geprueft, ob es schon geschah", () => {
  /* Die Sperre im Worker ist die verlaessliche. Diese hier macht den
     haeufigsten Fall — zweimal geklickt — folgenlos UND lesbar, ohne den
     Publishing-Endpunkt ueberhaupt zu beruehren. */
  const vorIndex = yaml.indexOf("Wurde schon veroeffentlicht?");
  const publishIndex = yaml.indexOf("- name: Veroeffentlichen");
  assert.ok(vorIndex > 0 && publishIndex > vorIndex,
    "Die Vorabpruefung muss VOR dem Veroeffentlichen stehen");
  assert.match(yaml, /smokePublish/, "Sie liest den gespeicherten Status");
});

test("SW9 · Artefaktpfade liegen im Arbeitsbereich", () => {
  /* hashFiles sieht absolute Pfade ausserhalb des Arbeitsbereichs nicht.
     Derselbe Fehler ist in social-cloudflare.yml schon einmal
     aufgetreten: die Datei war da, das Artefakt fehlte, der Lauf blieb
     gruen. */
  assert.ok(!/hashFiles\('\/tmp/.test(yaml));
  assert.ok(!/-o \/tmp\//.test(yaml), "curl darf nicht ausserhalb des Arbeitsbereichs schreiben");
  assert.match(yaml, /hashFiles\('tmp\/smoke\/publish\.json'\)/);
});

test("SW10 · Er braucht keine Schreibrechte am Repository", () => {
  assert.match(yaml, /permissions:\s*\n\s+contents:\s*read/);
});
