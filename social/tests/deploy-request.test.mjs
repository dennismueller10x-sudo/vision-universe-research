/* =========================================================================
   VU SOCIAL — DIE DEPLOYMENT-ANFORDERUNG, DIE ES NICHT MEHR GIBT

   -------------------------------------------------------------------------
   WAS SICH GEAENDERT HAT
   -------------------------------------------------------------------------

   Die Datei workers/vision-universe-social/DEPLOY_REQUEST ist auf
   Owner-Entscheidung entfernt. Ihr Grund war echt: solange der Workflow
   nicht auf dem Default-Branch lag, kannte die GitHub-API keinen
   Dispatch (404), es gab keinen Knopf, und die Bestaetigung musste
   anders in den Lauf kommen - als Datei im Diff, mit Autor und Datum.

   Mit dem Merge nach main ist dieser Grund entfallen. Und zuletzt tat
   die Datei das Gegenteil ihrer Absicht: am 20.09. loeste ein Push, der
   eine CI-Pruefung korrigierte, ein Worker-Deployment aus. Folgenlos -
   derselbe Code ging noch einmal hinaus -, aber von niemandem
   beschlossen.

   DIE PARSER-REGEL BLEIBT GEPRUEFT. Der Workflow liest die Datei
   weiterhin, falls sie je wiederkehrt, und diese Tests halten fest,
   dass sie dann dasselbe bedeutet wie zuvor. Eine Regel abzuschaffen,
   weil man sie gerade nicht braucht, heisst sie beim naechsten Mal neu
   erfinden zu muessen.

   Gelesen wird sie dort in der Shell:

     grep -v '^[[:space:]]*#' "$f" | grep -v '^[[:space:]]*$' | head -1 | tr -d '[:space:]'

   Diese Datei bildet dieselbe Regel nach. Der Grund ist nicht Symmetrie,
   sondern Asymmetrie der Folgen: steht in der Datei etwas anderes als
   erwartet, deployt entweder nichts (harmlos, aber verwirrend) oder
   etwas, das niemand angefordert hat (nicht harmlos).

   Die Regel ist bewusst schlicht gehalten, damit die Nachbildung hier
   und die Shell-Zeile dort dasselbe tun koennen.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REQUEST = join(ROOT, "workers", "vision-universe-social", "DEPLOY_REQUEST");
const WORKFLOW = join(ROOT, ".github", "workflows", "social-cloudflare.yml");

/* Dieselbe Regel wie die Shell-Zeile im Workflow. */
function readMarker(text) {
  const lines = String(text).split("\n");
  const first = lines.find((line) => !/^\s*#/.test(line) && line.trim() !== "");
  return first === undefined ? "" : first.replace(/\s/g, "");
}

test("D1 · Es gibt keine stehende Deployment-Anforderung mehr", () => {
  /* Dieser Test hat frueher das Gegenteil verlangt: die Datei MUSSTE
     da sein und DEPLOY sagen. Das war richtig, solange kein Dispatch
     moeglich war. Jetzt ist es falsch - und ein Test, der den alten
     Zustand verlangt, holt ihn irgendwann zurueck. */
  assert.equal(existsSync(REQUEST), false,
    "Ein Push allein darf kein Worker-Deployment mehr ausloesen.");
});

test("D1b · Kaeme sie wieder, bedeutete sie dasselbe wie zuvor", () => {
  /* Die Regel ist nicht abgeschafft, nur unbenutzt. Der Workflow liest
     die Datei weiterhin; also bleibt geprueft, was sie sagt. */
  assert.equal(readMarker("# Anforderung\n\nDEPLOY\n"), "DEPLOY");
});

test("D2 · Kommentare und Leerzeilen aendern den Marker nicht", () => {
  assert.equal(readMarker("# nur ein Kommentar\n\n  \nDEPLOY\n"), "DEPLOY");
  assert.equal(readMarker("   DEPLOY  \n# danach egal\nSTOPP\n"), "DEPLOY");
});

test("D3 · Eine leere oder nur kommentierte Datei deployt nicht", () => {
  /* Wer den Marker herausnimmt, aber die Erklaerung stehen laesst, will
     nicht deployen. Das muss auch so wirken. */
  assert.notEqual(readMarker(""), "DEPLOY");
  assert.notEqual(readMarker("# DEPLOY\n"), "DEPLOY");
  assert.notEqual(readMarker("\n\n"), "DEPLOY");
});

test("D4 · Etwas anderes als DEPLOY deployt nicht", () => {
  for (const text of ["deploy\n", "DEPLOY_NOW\n", "JA\n", "DEPLOYMENT\n"]) {
    assert.notEqual(readMarker(text), "DEPLOY", `"${text.trim()}" darf nicht greifen`);
  }
});

test("D5 · Der Workflow liest genau diesen Pfad", () => {
  /* Eine Anforderung, die woanders liegt als der Workflow sucht, ist
     eine Datei ohne Wirkung — und der gefaehrlichere Fall waere der
     umgekehrte: ein Pfad, der versehentlich immer existiert. */
  const yaml = readFileSync(WORKFLOW, "utf8");
  assert.match(yaml, /request_file="workers\/vision-universe-social\/DEPLOY_REQUEST"/);
  assert.match(yaml, /\[ "\$marker" = "DEPLOY" \]/);
});

test("D6 · Kein Deploy-Schritt haengt noch an den Dispatch-Eingaben", () => {
  /* Geschrieben, als ein Dispatch unmoeglich war: eine Bedingung auf
     `inputs` waere bei einem Push immer falsch gewesen, und der Schritt
     liefe nie, ohne dass es auffiele.

     Der Dispatch ist inzwischen moeglich - die Regel bleibt trotzdem
     richtig, nur aus dem umgekehrten Grund: die Betriebsart wertet die
     Eingaben an EINER Stelle aus, und die Schritte haengen an ihrem
     Ergebnis. Zwei Stellen, die dieselbe Eingabe lesen, driften. */
  const yaml = readFileSync(WORKFLOW, "utf8");
  const conditions = yaml.split("\n").filter((line) => /^\s+if:/.test(line));
  const stale = conditions.filter((line) => /inputs\.action/.test(line));
  assert.deepEqual(stale, [],
    "Diese Bedingungen laufen bei einem Push nie:\n" + stale.join("\n"));
  assert.ok(conditions.some((line) => /steps\.mode\.outputs\.deploy/.test(line)),
    "Die Deploy-Schritte muessen an der Betriebsart haengen.");
});

test("D7 · Die Sicherung liegt im Arbeitsbereich, sonst sieht hashFiles sie nicht", () => {
  /* Im ersten Lauf war die Sicherung geschrieben und das Artefakt fehlte:
     hashFiles auf einem absoluten Pfad unter /tmp liefert immer den
     leeren Hash, und der Schritt wurde stillschweigend uebersprungen. */
  const yaml = readFileSync(WORKFLOW, "utf8");
  assert.ok(!/hashFiles\('\/tmp/.test(yaml),
    "hashFiles sieht nur den Arbeitsbereich.");
  assert.match(yaml, /--backup tmp\/cf-backup/);
  assert.match(yaml, /hashFiles\('tmp\/cf-backup\/\*'\)/);
});
