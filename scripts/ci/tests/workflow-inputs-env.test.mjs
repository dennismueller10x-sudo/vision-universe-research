/* Dispatch-Eingaben gehoeren in env:, nicht als ${{ inputs.x }} in den
   Shell-Text eines run:-Schritts. Dort werden sie VOR der Shell eingesetzt;
   ein Wert mit ' oder $( ) wird zu Code (Script Injection). Ueber env: bleibt
   er ein Wert. Lauf: node --test "scripts/ci/tests/*.test.mjs" */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".github", "workflows");
const EXPR = /\$\{\{\s*(?:github\.event\.)?inputs\.[\w-]+\s*\}\}/;

/* Noch offen, mit eigenem Weg: company-intelligence (#389). Eine Ausnahme, die nicht mehr verletzt,
   laesst den Test scheitern - die Liste schrumpft nur. */
const AUSNAHMEN = new Set(["company-intelligence.yml"]);

/** Zeilen innerhalb von run:-Bloecken, die eine Eingabe direkt einsetzen. */
export function inputsInRun(text) {
  const hits = [], lines = text.split("\n");
  let inRun = false, ind = 0;
  lines.forEach((l, i) => {
    const s = l.trimStart(), cur = l.length - s.length;
    // Ein Job darf "run" heissen ("  run:" ohne Wert) - das ist kein Shell-Schritt.
    const m = /^(- )?run:\s*(\S.*)$/.exec(s);
    if (m) { inRun = true; ind = cur; if (EXPR.test(m[2])) hits.push(i + 1); return; }
    if (!inRun) return;
    if (s && cur <= ind) { inRun = false; return; }
    if (EXPR.test(l)) hits.push(i + 1);
  });
  return hits;
}

test("Keine Dispatch-Eingabe direkt im Shell-Text", () => {
  const verstoesse = [], sauber = [];
  for (const f of readdirSync(DIR).filter((n) => /\.ya?ml$/.test(n))) {
    const hits = inputsInRun(readFileSync(join(DIR, f), "utf8"));
    if (hits.length && !AUSNAHMEN.has(f)) verstoesse.push(`${f}:${hits.join(",")}`);
    if (!hits.length && AUSNAHMEN.has(f)) sauber.push(f);
  }
  assert.deepEqual(verstoesse, []);
  assert.deepEqual(sauber, [], "Ausnahme nicht mehr noetig - aus AUSNAHMEN entfernen");
});

test("Erkennung: run-Block mit Eingabe, env-Zuweisung und if: sind erlaubt", () => {
  const wf = [
    "jobs:", "  a:", "    steps:",
    "      - name: x", "        if: ${{ inputs.go }}", "        env:", "          IN_SITE: ${{ inputs.site }}",
    "        run: |", "          echo \"$IN_SITE\"",
    "      - run: echo '${{ inputs.site }}'",
    "      - name: y", "        run: |", "          curl ${{ github.event.inputs.url }}",
    "  run:", "    steps:", "      - env:", "          X: ${{ inputs.mode }}", "        run: echo \"$X\""
  ].join("\n");
  assert.deepEqual(inputsInRun(wf), [10, 13]);
});

test("Jeder Workflow deklariert seine Token-Rechte (permissions) ausdruecklich", () => {
  const ohne = [];
  for (const f of readdirSync(DIR).filter((n) => /\.ya?ml$/.test(n))) {
    const t = readFileSync(join(DIR, f), "utf8");
    const top = /^permissions:/m.test(t);
    const jobs = t.split(/^jobs:\s*$/m)[1] || "";
    const jobNames = (jobs.match(/^  [A-Za-z0-9_-]+:\s*$/gm) || []).length;
    const jobPerms = (jobs.match(/^    permissions:/gm) || []).length;
    if (!top && !(jobNames && jobPerms >= jobNames)) ohne.push(f);
  }
  assert.deepEqual(ohne, [], "ohne permissions erbt ein Workflow die Standardrechte des Repositorys");
});

test("social-publish-candidate prueft candidateId, bevor sie in einen Pfad geht", () => {
  const t = readFileSync(join(DIR, "social-publish-candidate.yml"), "utf8");
  assert.equal((t.match(/case "\$IN_CANDIDATEID" in \*\[!A-Za-z0-9\._-\]\*\|\*\.\.\*\)/g) || []).length, 2);
});
