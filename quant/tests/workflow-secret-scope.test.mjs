/* =========================================================================
   VISION UNIVERSE — workflow-secret-scope.test.mjs

   Ein Geheimnis gehoert an den Schritt, der es braucht - und an keinen
   anderen.

   VORGESCHICHTE

   Lauf 34570619102 ist nach 61 Sekunden gescheitert, bevor eine einzige
   Anfrage hinausging. Der Workflow trug TIINGO_API_KEY in einem
   env-Block auf JOBEBENE; damit sah ihn auch die Regressionssuite. Und
   SG18/SG20 pruefen ausdruecklich das Verhalten OHNE Zugang: der
   Stromnachweis darf ohne Schluessel keine Kursart behaupten, der
   Grenzennachweis kein Anbieterlimit erfinden. Mit Schluessel in der
   Umgebung tun beide etwas anderes.

   Die Tests hatten recht. Der Workflow hatte unrecht.

   Diese Datei haelt das fest, damit es nicht wiederkommt: kein Schritt,
   der die Testsuite startet, darf ein Anbietergeheimnis in seiner
   Umgebung haben - weder ueber den Schritt noch ueber den Job.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WF_DIR = join(root, ".github", "workflows");

/* Geheimnisse, deren blosse Anwesenheit das Verhalten aendert. Der
   R2-Zugang gehoert NICHT dazu: keine Pruefung haengt daran, ob ein
   Objektspeicher erreichbar ist. */
const BEHAVIOUR_CHANGING = ["TIINGO_API_KEY", "TWELVE_DATA_API_KEY", "EODHD_API_KEY"];

/** Sehr einfacher Leser: Schrittgrenzen und env-Bloecke, mehr braucht es nicht. */
function stepsWithTestRun(yaml) {
  const lines = yaml.split("\n");
  const hits = [];
  let jobEnvSecrets = [];
  let inJobEnv = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    /* env: auf Jobebene (vier Leerzeichen Einrueckung, vor steps:). */
    if (/^    env:\s*$/.test(line)) { inJobEnv = true; continue; }
    if (inJobEnv) {
      if (/^    \S/.test(line) || /^  \S/.test(line)) inJobEnv = false;
      else {
        for (const s of BEHAVIOUR_CHANGING) if (line.includes(s)) jobEnvSecrets.push(s);
        continue;
      }
    }

    /* Ein Schritt, der die Testsuite startet. */
    if (!/node\s+--test/.test(line)) continue;

    /* Rueckwaerts bis zum Schrittanfang, dabei env-Eintraege sammeln. */
    const stepSecrets = [];
    let name = "(unbenannt)";
    for (let j = i; j >= 0; j--) {
      if (/^      - name:/.test(lines[j])) { name = lines[j].replace(/^\s*- name:\s*/, ""); break; }
      if (/^      - /.test(lines[j]) && j !== i) break;
      for (const s of BEHAVIOUR_CHANGING) if (lines[j].includes(s)) stepSecrets.push(s);
    }
    hits.push({ line: i + 1, name, stepSecrets });
  }
  return { hits, jobEnvSecrets };
}

test("WF01 kein Testlauf sieht ein Anbietergeheimnis", () => {
  if (!existsSync(WF_DIR)) return;
  const files = readdirSync(WF_DIR).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
  assert.ok(files.length, "keine Workflows gefunden");

  const violations = [];
  let checkedSteps = 0;

  for (const file of files) {
    const yaml = readFileSync(join(WF_DIR, file), "utf8");
    const { hits, jobEnvSecrets } = stepsWithTestRun(yaml);
    for (const h of hits) {
      checkedSteps++;
      for (const s of h.stepSecrets) {
        violations.push(`${file}:${h.line} "${h.name}" traegt ${s} am Schritt`);
      }
      for (const s of jobEnvSecrets) {
        violations.push(`${file}:${h.line} "${h.name}" erbt ${s} vom Job-env`);
      }
    }
  }

  assert.ok(checkedSteps > 0, "kein Workflow startet die Testsuite - der Test prueft nichts");
  assert.deepEqual(violations, [],
    "Geheimnisse in einem Testlauf:\n  " + violations.join("\n  "));
});

test("WF02 der Leser findet eine eingebaute Verletzung", () => {
  /* Ein Test, der noch nie angeschlagen hat, ist kein bewiesener Test. */
  const jobLevel = [
    "jobs:", "  x:", "    runs-on: ubuntu-latest",
    "    env:", "      TIINGO_API_KEY: ${{ secrets.TIINGO_API_KEY }}",
    "    steps:", "      - name: Tests", "        run: node --test \"quant/tests/*.test.mjs\""
  ].join("\n");
  const r1 = stepsWithTestRun(jobLevel);
  assert.equal(r1.hits.length, 1);
  assert.deepEqual(r1.jobEnvSecrets, ["TIINGO_API_KEY"], "Job-env muss erkannt werden");

  const stepLevel = [
    "jobs:", "  x:", "    steps:", "      - name: Tests",
    "        env:", "          TIINGO_API_KEY: ${{ secrets.TIINGO_API_KEY }}",
    "        run: node --test \"quant/tests/*.test.mjs\""
  ].join("\n");
  const r2 = stepsWithTestRun(stepLevel);
  assert.deepEqual(r2.hits[0].stepSecrets, ["TIINGO_API_KEY"], "Schritt-env muss erkannt werden");

  /* Und der saubere Fall schlaegt nicht an. */
  const clean = [
    "jobs:", "  x:", "    steps:",
    "      - name: Tests", "        run: node --test \"quant/tests/*.test.mjs\"",
    "      - name: Abruf", "        env:",
    "          TIINGO_API_KEY: ${{ secrets.TIINGO_API_KEY }}", "        run: node fetch.mjs"
  ].join("\n");
  const r3 = stepsWithTestRun(clean);
  assert.equal(r3.hits.length, 1);
  assert.deepEqual(r3.hits[0].stepSecrets, []);
  assert.deepEqual(r3.jobEnvSecrets, []);
});
