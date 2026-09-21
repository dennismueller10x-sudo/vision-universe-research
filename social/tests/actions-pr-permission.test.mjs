/* =========================================================================
   social/tests/actions-pr-permission.test.mjs

   ZWEI SCHALTER, UND DER BERICHT LAS NUR EINEN

   Am 21.09. entschied der erste produktive Lauf nach der Creative-Job-
   Recovery richtig: Slot frei, Kandidat faellig, also ein Creative Job.
   Er schrieb den Brief, pushte den Zweig - und GitHub wies das Oeffnen
   des Pull Requests ab:

     GitHub Actions is not permitted to create or approve pull requests

   Das Workflow-Recht `pull-requests: write` war vollstaendig erteilt.
   Abgewiesen hat ein ZWEITER Schalter, der am Repository sitzt und im
   Repositoryinhalt nicht steht.

   production-readiness.mjs las den ersten und schrieb "er darf den
   Pull Request oeffnen". Eine Berechtigung, an der falschen Stelle
   gelesen - dieselbe Familie wie das Asset-Tor, das am Tresor statt am
   Tor mass.

   Zwei Dinge werden hier gemessen: dass die Behauptung nicht
   zurueckkommt, und dass der Abbruch dem Owner sagt, welchen Schalter
   er umlegen muss.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function quelle(p) {
  return readFileSync(new URL(p, import.meta.url), "utf8");
}
/* Kommentare sind kein ausgefuehrter Code - und in diesen beiden
   Dateien steht der alte Satz absichtlich im Kommentar, damit man
   liest, was schiefging. Wer ihn dort sucht, findet ihn immer. */
function ohneKommentare(s) {
  return String(s).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("AP30 · Der Bericht behauptet das Oeffnungsrecht nicht mehr", () => {
  const code = ohneKommentare(
    quelle("../../scripts/social/production-readiness.mjs"));
  assert.ok(!/darf den Pull Request/.test(code),
    "Die widerlegte Behauptung steht wieder im ausgefuehrten Code.");
  assert.match(code, /NICHT GEPRUEFT/,
    "Der Bericht benennt die Luecke nicht.");
});

test("AP31 · Der Bericht nennt den zweiten Schalter", () => {
  /* Eine Luecke ohne Adresse ist fuer den Owner keine Auskunft: er
     soll nicht suchen muessen, wo der Schalter sitzt. */
  const code = ohneKommentare(
    quelle("../../scripts/social/production-readiness.mjs"));
  assert.match(code, /Repository-Einstellungen/);
  assert.match(code, /pull-requests: write/,
    "Der Satz sagt nicht, welches Recht sehr wohl erteilt ist.");
});

test("AP32 · Der Abbruch traegt einen Namen und den Owner-Schritt", () => {
  const code = ohneKommentare(
    quelle("../../scripts/social/open-creative-request.mjs"));
  assert.match(code, /not permitted to create or approve pull requests/i,
    "Der Fall wird nicht erkannt - der Owner bekommt einen Stack Trace.");
  assert.match(code, /ACTIONS_DARF_KEINE_PULL_REQUESTS_OEFFNEN/,
    "Der Befund hat keinen Namen, unter dem man ihn wiederfindet.");
  assert.match(code, /Allow GitHub Actions to create and approve pull/,
    "Der genaue Schalter wird nicht genannt.");
});

test("AP33 · Der Job bleibt unversehrt, wenn der Pull Request fehlt", () => {
  /* -----------------------------------------------------------------
     DIE REIHENFOLGE IST DER SCHUTZ

     Das Register wird erst NACH dem geoeffneten Pull Request auf
     DISPATCHED gesetzt. Stuende die Zeile davor, truege der Job eine
     PR-Nummer, die es nicht gibt - ein Zombie, wie der, dessen
     Aufloesung dieser Auftrag war.

     Gemessen wird die Reihenfolge im Quelltext, nicht die Absicht:
     der Abbruch liegt vor der Registerzeile.

     Und zwar vor der ZEILE, die den Zustand setzt - nicht vor der
     ersten Stelle, an der das Wort vorkommt. Der erste Entwurf suchte
     "CREATIVE_JOB_DISPATCHED" und fand eine Fehlermeldung weit oben;
     der Test fiel aus dem falschen Grund. Genau die Familie, die
     dieses Projekt inzwischen beim Namen nennt: auf Wortlaut gematcht
     statt auf die Sache. */
  const code = ohneKommentare(
    quelle("../../scripts/social/open-creative-request.mjs"));
  const abbruch = code.indexOf("ACTIONS_DARF_KEINE_PULL_REQUESTS_OEFFNEN");
  const uebergang = code.search(
    /registry\.transition\([^)]*,\s*"CREATIVE_JOB_DISPATCHED"/);
  assert.ok(abbruch > 0, "Der benannte Abbruch fehlt.");
  assert.ok(uebergang > 0, "Der Uebergang auf DISPATCHED wurde nicht gefunden.");
  assert.ok(abbruch < uebergang,
    "Das Register wird gesetzt, bevor der fehlende Pull Request auffaellt.");
});
