/* Workflow-Buendelung (Plan Neustart §3, Strang A): Vertragstest statt Liste im Kopf.
   Jede Workflow-Datei hat ein Ziel-Buendel; ein Buendel-Workflow ersetzt seine Quellen nachweisbar. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DOC = JSON.parse(readFileSync(join(ROOT, "core/registry/workflow-bundles.json"), "utf8"));
const FILES = readdirSync(join(ROOT, ".github/workflows")).filter((f) => /\.ya?ml$/.test(f)).sort();

test("WB-1 · Jede Workflow-Datei hat genau ein bekanntes Ziel-Buendel, kein Eintrag ohne Datei", () => {
  const listed = Object.keys(DOC.workflows).sort();
  const bundleWorkflows = Object.values(DOC.bundles).map((b) => b.workflow).filter(Boolean);
  const missing = FILES.filter((f) => !DOC.workflows[f] && !bundleWorkflows.includes(f));
  assert.deepEqual(missing, [], "neue Workflows brauchen ein Ziel-Buendel in core/registry/workflow-bundles.json");
  assert.deepEqual(listed.filter((f) => !FILES.includes(f)), [], "Eintrag ohne Datei: geloeschte Workflows austragen");
  for (const [f, e] of Object.entries(DOC.workflows)) assert.ok(DOC.bundles[e.bundle], `${f}: unbekanntes Buendel ${e.bundle}`);
});

test("WB-2 · Zielbild: hoechstens 12 Buendel", () => {
  assert.ok(Object.keys(DOC.bundles).length <= 12, Object.keys(DOC.bundles).join(","));
});

test("WB-3 · Ein Buendel-Workflow ersetzt seine Quellen: sie sind geloescht und nicht mehr gelistet", () => {
  for (const [name, b] of Object.entries(DOC.bundles)) {
    if (!b.workflow) { assert.deepEqual(b.replaces, [], `${name}: replaces ohne Buendel-Workflow`); continue; }
    assert.ok(existsSync(join(ROOT, ".github/workflows", b.workflow)), `${name}: ${b.workflow} fehlt`);
    for (const src of b.replaces) {
      assert.ok(!existsSync(join(ROOT, ".github/workflows", src)), `${name}: Quelle ${src} noch vorhanden`);
      assert.ok(!DOC.workflows[src], `${name}: Quelle ${src} noch gelistet`);
    }
  }
});

test("WB-4 · Fortschritt ist messbar: Anzahl Dateien gegen Zielbild", () => {
  // Kein Ziel, das CI rot macht: die Zahl steht im Bericht von scripts/core/system-health.mjs und hier im Test-Log.
  console.log(`[buendel] ${FILES.length} Workflow-Dateien, Ziel ${Object.keys(DOC.bundles).length}`);
  assert.ok(FILES.length > 0);
});

test("WB-5 · DoD (Steuerung 08.11.2026): jede eigenstaendige Datei ist begruendete Ausnahme oder noch geplant", () => {
  const bundleWorkflows = Object.values(DOC.bundles).map((b) => b.workflow).filter(Boolean);
  for (const f of FILES.filter((x) => !bundleWorkflows.includes(x))) {
    const e = DOC.workflows[f] || {};
    const ausnahme = typeof e.ausnahme === "string" ? e.ausnahme.trim() : "";
    assert.ok(Boolean(ausnahme) !== Boolean(e.geplant), `${f}: genau eins von ausnahme (ein Satz Begruendung) oder geplant`);
    if (ausnahme) assert.match(ausnahme, /^\S.{20,}[.)]$/, `${f}: Begruendung als ganzer Satz`);
  }
  const offen = FILES.filter((f) => DOC.workflows[f]?.geplant);
  console.log(`[buendel] ${bundleWorkflows.length} Buendel, ${FILES.length - bundleWorkflows.length - offen.length} Ausnahmen, ${offen.length} noch geplant`);
});

/* ------------------------------------------------------------------
   WB-6/7 · Teilauswahl beim push (Steuerung 09.11.2026, Strang P)
   Die Commit-Liste des push-Ereignisses traegt in Actions kein
   added/modified/removed. Die Auswahl las daraus "keine Datei" und
   setzte jeden Teil mit Pfadbedingung auf false: deploy.yml rollte
   nach einem Merge auf main nichts aus (Lauf 42598972028). Die Datei-
   liste kommt jetzt aus der Compare-API zwischen before und sha; ist
   sie unbekannt (neuer Zweig, API-Fehler, 300+ Dateien), gilt jede
   Pfadbedingung als erfuellt - nie still "0 Dateien" (CLAUDE.md).
   ------------------------------------------------------------------ */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const workflowText = (f) => readFileSync(join(ROOT, ".github/workflows", f), "utf8");

/** Der run-Block des Schritts `id: wahl` im Job `auswahl` (Einrueckung entfernt). */
function auswahlRun(f) {
  const lines = workflowText(f).split("\n");
  const start = lines.findIndex((l) => /^ {8}id: wahl$/.test(l));
  assert.ok(start > 0, `${f}: kein Schritt id: wahl`);
  const run = lines.findIndex((l, i) => i > start && /^ {8}run: \|$/.test(l));
  const out = [];
  for (let i = run + 1; i < lines.length; i++) {
    if (lines[i].trim() !== "" && !lines[i].startsWith("          ")) break;
    out.push(lines[i].slice(10));
  }
  return out.join("\n");
}

const PFAD_AUSWAHL = FILES.filter((f) => /^ {8}id: wahl$/m.test(workflowText(f)))
  .filter((f) => /def push_ok|touched\(\)/.test(auswahlRun(f)));

test("WB-6 · Teilauswahl beim push liest die Dateiliste aus der Compare-API, nie aus der Commit-Liste", () => {
  assert.ok(PFAD_AUSWAHL.length >= 9, "erwartet: die Buendel mit Pfad-Auswahl, gefunden " + PFAD_AUSWAHL.join(","));
  for (const f of FILES) {
    assert.doesNotMatch(workflowText(f), /github\.event\.commits/, `${f}: github.event.commits traegt keine Dateiliste`);
  }
  for (const f of PFAD_AUSWAHL) {
    const run = auswahlRun(f);
    assert.match(run, /gh api "repos\/\$REPO\/compare\/\$BEFORE\.\.\.\$AFTER"/, `${f}: Dateiliste ueber die Compare-API`);
    assert.match(run, /0{40} \]; then PUSH_FILES_UNKNOWN=1/, `${f}: neuer Zweig = Liste unbekannt`);
    assert.match(run, /-lt 300 \] \|\| PUSH_FILES_UNKNOWN=1/, `${f}: abgeschnittene Liste = unbekannt`);
    assert.match(run, /if fs is None: return True|\[ "\$PUSH_FILES_UNKNOWN" = 1 \] && return 0/, `${f}: unbekannt = im Zweifel ausfuehren`);
    assert.match(workflowText(f), /GH_TOKEN: \$\{\{ github\.token \}\}/, `${f}: Token fuer die Compare-API`);
  }
});

/** Fuehrt den Auswahl-Schritt aus; `gh` ist ein Stub, der `dateien` liefert oder (null) scheitert. */
function waehle(f, { ref, dateien, before = "a".repeat(40), extraEnv = {} }) {
  const dir = mkdtempSync(join(tmpdir(), "wb7-"));
  try {
    const bin = join(dir, "bin"); execFileSync("mkdir", ["-p", bin]);
    writeFileSync(join(bin, "gh"), dateien === null ? "#!/bin/sh\nexit 1\n" : "#!/bin/sh\ncat <<'X'\n" + dateien.join("\n") + "\nX\n");
    chmodSync(join(bin, "gh"), 0o755);
    const output = join(dir, "out.txt"); writeFileSync(output, "");
    execFileSync("bash", ["-c", auswahlRun(f)], {
      env: { PATH: bin + ":" + process.env.PATH, EVENT: "push", REF: ref,
        BEFORE: before, AFTER: "b".repeat(40), REPO: "o/r", GH_TOKEN: "t", RUNNER_TEMP: dir, GITHUB_OUTPUT: output, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"] });
    return Object.fromEntries(readFileSync(output, "utf8").trim().split("\n").filter(Boolean).map((l) => l.split("=")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("WB-7 · Ein Merge auf main mit Worker-Aenderung rollt den Frage-Worker aus; Fremdaenderung nicht; Unbekannt = ausfuehren", () => {
  const main = "refs/heads/main";
  assert.equal(waehle("deploy.yml", { ref: main, dateien: ["workers/vu-ask/src/index.js"] }).frage_worker, "true",
    "Merge mit Worker-Datei muss den Frage-Worker ausrollen (Lauf 42598972028 waehlte false)");
  assert.equal(waehle("deploy.yml", { ref: main, dateien: ["konto/index.html"] }).navigation, "true");
  const fremd = waehle("deploy.yml", { ref: main, dateien: ["docs/README.md"] });
  assert.equal(fremd.frage_worker, "false"); assert.equal(fremd.navigation, "false");
  assert.equal(waehle("deploy.yml", { ref: main, dateien: null }).frage_worker, "true", "API-Fehler: im Zweifel ausfuehren");
  assert.equal(waehle("deploy.yml", { ref: main, dateien: [], before: "0".repeat(40) }).frage_worker, "true", "neuer Zweig: unbekannt");
  assert.equal(waehle("deploy.yml", { ref: "refs/heads/claude/x", dateien: ["workers/vu-ask/src/index.js"] }).frage_worker, "false",
    "Zweigfilter bleibt: frage-worker nur auf main");
  // Bash-Variante (pipeline-daily): Ledger-Aenderung auf main waehlt ki-depots
  const env = { SCHEDULE: "", TEIL: "", MSG: "", WR_NAME: "", WR_CONCLUSION: "" };
  assert.equal(waehle("pipeline-daily.yml", { ref: main, dateien: ["docs/research/edge2/ki/ledger-A.jsonl"], extraEnv: env }).ki_depots, "true");
  assert.equal(waehle("pipeline-daily.yml", { ref: main, dateien: ["README.md"], extraEnv: env }).ki_depots, "false");
});
