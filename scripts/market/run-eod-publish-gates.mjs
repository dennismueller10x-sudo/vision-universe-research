#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — run-eod-publish-gates.mjs

   WELCHER TEST DARF EINEN TAGESLAUF STOPPEN - UND WANN?

   Vom 18. bis 23.09.2026 holte der Marktdaten-Refresh jeden Abend die
   Tageskurse fuer das ganze Universum, bestand Freshness-Check und
   Lebenszyklus-Waechter - und warf alles weg, weil danach EIN Test rot
   war, der Signalereignisse auf dem gerade fortgeschriebenen Bestand
   zaehlte. Vier Tagesstaende, je rund 6.400 Anfragen.

   Die Einteilung steht in quant/config/eod-publish-gates.json:

     --phase=pre          PRE_FETCH_CODE_REGRESSION: die vollen Suiten
                          auf dem ausgecheckten Stand, VOR dem Abruf.
                          Rot = Exit 1 = keine Anfrage.
     --phase=integrity    POST_FETCH_DATA_INTEGRITY: nur die Testdateien,
                          die die neuen Daten gegen einen Datenvertrag
                          pruefen. Rot = Exit 1 = kein Commit.
     --phase=observability NON_BLOCKING_OBSERVABILITY: alle uebrigen
                          Testdateien. Rot = ::error-Annotation und
                          Summary, Exit 0. Sie waren vor dem Abruf auf
                          demselben Code gruen - rot werden sie nur durch
                          Werte, nicht durch einen verletzten Vertrag.
     --list=<phase>       nur die Dateien ausgeben

   --manifest=<datei> und --root=<dir> fuer Tests.
   ========================================================================= */
import { readFileSync, readdirSync, existsSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const arg = (name, fallback) => { const hit = argv.find((a) => a.startsWith(name + "=")); return hit ? hit.slice(name.length + 1) : fallback; };
const root = arg("--root", join(dirname(fileURLToPath(import.meta.url)), "..", ".."));
const manifestPath = arg("--manifest", join(root, "quant", "config", "eod-publish-gates.json"));
const LIST = arg("--list", null);
const PHASE = LIST || arg("--phase", null);

const PHASES = { pre: "PRE_FETCH_CODE_REGRESSION", integrity: "POST_FETCH_DATA_INTEGRITY", observability: "NON_BLOCKING_OBSERVABILITY" };
if (!PHASES[PHASE]) { console.error("Aufruf: --phase=pre|integrity|observability (oder --list=...)"); process.exit(64); }

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

/* Nur das Muster <dir>/*.test.mjs - mehr brauchen die Suiten nicht. */
function expand(pattern) {
  const m = /^(.*)\/\*(\.[\w.]+)$/.exec(pattern);
  if (!m) throw new Error("Muster nicht unterstuetzt: " + pattern);
  const dir = join(root, m[1]);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => n.endsWith(m[2])).sort().map((n) => m[1] + "/" + n);
}

function classify(man) {
  const all = man.suites.flatMap(expand);
  const integrity = man.classes.POST_FETCH_DATA_INTEGRITY.files.slice();
  const missing = integrity.filter((f) => !all.includes(f));
  if (missing.length) throw new Error("POST_FETCH_DATA_INTEGRITY nennt Dateien ausserhalb der Suiten: " + missing.join(", "));
  const observability = all.filter((f) => !integrity.includes(f));
  return { pre: all, integrity, observability };
}

let sets;
try { sets = classify(manifest); } catch (e) { console.error(String(e.message)); process.exit(2); }
const files = sets[PHASE];

if (LIST) { console.log(files.join("\n")); process.exit(0); }

const titel = PHASES[PHASE];
console.log(`${titel}: ${files.length} Testdateien`);
if (!files.length) { console.log("  nichts zu pruefen"); process.exit(PHASE === "observability" ? 0 : 1); }

/* NODE_TEST_CONTEXT stammt von einem umgebenden Test-Runner; mit ihm
   berichtet das Kind nicht auf stdout, und die Auswertung saehe nichts. */
const env = Object.assign({}, process.env);
delete env.NODE_TEST_CONTEXT;
const res = spawnSync(process.execPath, ["--test", "--test-reporter=tap", ...files], { cwd: root, env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const out = (res.stdout || "") + (res.stderr || "");
const failed = [];
const lines = out.split("\n");
for (let i = 0; i < lines.length; i++) {
  const m = /^(\s*)not ok \d+ - (.*)$/.exec(lines[i]);
  if (!m) continue;
  let loc = null;
  for (let j = i + 1; j < Math.min(lines.length, i + 40); j++) {
    const l = /location: '(.*?):(\d+):\d+'/.exec(lines[j]);
    if (l) { loc = l[1].replace(root + "/", "") + ":" + l[2]; break; }
    if (/^\s*(not )?ok \d+/.test(lines[j])) break;
  }
  failed.push({ name: m[2], location: loc });
}
const summary = (/^# pass (\d+)/m.exec(out) || [])[1];
const fails = (/^# fail (\d+)/m.exec(out) || [])[1];
console.log(`  bestanden ${summary ?? "?"}, fehlgeschlagen ${fails ?? "?"}`);
for (const f of failed) console.log(`  - ${f.name}${f.location ? " (" + f.location + ")" : ""}`);

const rot = res.status !== 0;
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `\n#### ${titel}: ${rot ? (PHASE === "observability" ? "FEHLER (nicht blockierend)" : "ROT - blockiert") : "gruen"}\n` +
    `${files.length} Dateien, bestanden ${summary ?? "?"}, fehlgeschlagen ${fails ?? "?"}\n` +
    failed.map((f) => `- ${f.name}${f.location ? " (`" + f.location + "`)" : ""}`).join("\n") + "\n");
}

if (!rot) process.exit(0);
if (PHASE === "observability") {
  /* Eskalation ohne Blockade: die Annotation steht rot auf dem Lauf, die
     Tageskurse sind trotzdem veroeffentlicht. */
  for (const f of failed) console.log(`::error title=Regressionstest nach dem Abruf rot (nicht blockierend)${f.location ? ",file=" + f.location.split(":")[0] + ",line=" + f.location.split(":")[1] : ""}::${f.name} - vor dem Abruf gruen, mit den neuen Daten rot: die Erwartung haengt an Werten des Bestands. Test an einen festen Stichtag binden.`);
  if (!failed.length) console.log("::error title=Regressionssuite nach dem Abruf rot (nicht blockierend)::Exit " + res.status);
  console.log("  NON_BLOCKING_OBSERVABILITY: gemeldet, Veroeffentlichung nicht blockiert.");
  process.exit(0);
}
if (!failed.length) console.log(out.split("\n").slice(-60).join("\n"));
console.log(PHASE === "pre"
  ? "  PRE_FETCH_CODE_REGRESSION rot: kein Provider-Abruf."
  : "  POST_FETCH_DATA_INTEGRITY rot: die neuen Daten verletzen einen Datenvertrag, keine Veroeffentlichung.");
process.exit(1);
