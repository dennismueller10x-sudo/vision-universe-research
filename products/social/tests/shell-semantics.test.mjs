/* =========================================================================
   VU SOCIAL — Was `set -e` wirklich tut (SE1–SE4)

   -------------------------------------------------------------------------
   WARUM ES DIESE DATEI GIBT
   -------------------------------------------------------------------------

   Ich habe waehrend dieses Baus behauptet, `[ test ] && befehl` toete
   unter `bash -e` den Schritt, sobald der Test fehlschlaegt. Diese
   Behauptung steht in einer Commit-Nachricht, und sie ist FALSCH. Sie
   hat ausserdem zu einem gemeldeten "Nebenbefund" ueber zwei fremde
   produktive Workflows gefuehrt, in denen gar kein Fehler ist.

   Der Grund fuer den Irrtum: ein Schritt endete in unter einer Sekunde
   und meldete Erfolg. Diese Beobachtung passte zu der Vermutung — und
   passte genauso zur tatsaechlichen Ursache (`git diff` sieht keine
   unverfolgten Dateien). Zwei Erklaerungen, ein Bild; ich habe die
   erste genommen und nicht geprueft.

   Diese Tests pruefen. Sie laufen echte Shells und halten fest, was
   POSIX hier vorschreibt: eine Regel, die im Kopf leicht falsch
   abgespeichert ist, gehoert an eine Stelle, die widerspricht.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

function bash(script, flags = ["-e"]) {
  try {
    const out = execFileSync("bash", [...flags, "-c", script], { encoding: "utf8" });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status, out: String(err.stdout || "") };
  }
}

test("SE1 · `[ test ] && befehl` bricht NICHT ab, wenn der Test fehlschlaegt", () => {
  /* Weil der fehlschlagende Befehl der linke Operand von && ist. `set -e`
     greift nur beim LETZTEN Befehl einer solchen Liste. */
  const r = bash('args=""; [ -n "" ] && args="x"; echo "ERREICHT"');
  assert.equal(r.code, 0);
  assert.match(r.out, /ERREICHT/);
});

test("SE2 · Auch in einer Schleife bricht es nicht ab", () => {
  /* Genau die Konstruktion, die ich beschuldigt hatte. */
  const r = bash('for v in 1 2 3; do [ "404" = "200" ] && break; echo "V$v"; done; echo "DANACH"');
  assert.equal(r.code, 0);
  assert.match(r.out, /V1[\s\S]*V2[\s\S]*V3[\s\S]*DANACH/);
});

test("SE3 · Ein ALLEIN stehender fehlschlagender Befehl bricht sehr wohl ab", () => {
  /* Die Regel, die tatsaechlich gilt — und die den Unterschied macht. */
  const r = bash('[ -n "" ]; echo "NICHT ERREICHT"');
  assert.notEqual(r.code, 0);
  assert.doesNotMatch(r.out, /NICHT ERREICHT/);
});

test("SE4 · `git diff` sieht keine unverfolgten Dateien — das WAR die Ursache", () => {
  /* Der Fehler, der die Messdaten vier Laeufe lang verschwinden liess:
     `git diff --quiet -- <neue-datei>` meldet "keine Aenderung", weil
     git diff nur verfolgte Dateien vergleicht. Der Schritt warf die
     gerade geholten Zahlen weg und ging zufrieden nach Hause. */
  const r = bash(
    'd=$(mktemp -d); cd "$d"; git init -q .; git config user.email a@b; git config user.name a; ' +
    'echo start > vorhanden.txt; git add .; git commit -qm init; ' +
    'echo neu > neu.json; ' +
    'if git diff --quiet -- neu.json; then echo "DIFF SAGT: KEINE AENDERUNG"; fi; ' +
    'git add neu.json; ' +
    'if git diff --cached --quiet -- neu.json; then echo "CACHED: keine"; else echo "CACHED SAGT: AENDERUNG"; fi; ' +
    'rm -rf "$d"');
  assert.match(r.out, /DIFF SAGT: KEINE AENDERUNG/);
  assert.match(r.out, /CACHED SAGT: AENDERUNG/);
});
