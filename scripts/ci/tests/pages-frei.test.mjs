/* pages-frei.sh mit einem Fake-gh: frei nur ohne offenen Dispatch-Lauf, API-Fehler nie als frei (Steuerung 23.11.2026). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "pages-frei.sh");

/** antworten: Liste je Aufruf: {runs:[...]} (Erfolg) oder {fehler:true} oder {roh:"..."}; der letzte Eintrag gilt weiter. */
function lauf(antworten, max = 0, { dow = "6", hm = "1200", pr = null, dateien = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "vu-pf-"));
  try {
    const plan = join(dir, "plan.json"), log = join(dir, "calls.log"), sleeps = join(dir, "sleeps.log");
    writeFileSync(plan, JSON.stringify(antworten)); writeFileSync(log, ""); writeFileSync(sleeps, "");
    writeFileSync(join(dir, "gh"), `#!/usr/bin/env node
const fs=require("fs");const a=process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)},a.join(" ")+"\\n");
if(a.join(" ").includes("/files")){const f=JSON.parse(fs.readFileSync(${JSON.stringify(plan)}.replace("plan.json","dateien.json")));if(f===null){process.stderr.write("gh: HTTP 500\\n");process.exit(1);}process.stdout.write(f.join("\\n")+(f.length?"\\n":""));process.exit(0);}
const q=JSON.parse(fs.readFileSync(${JSON.stringify(plan)}));const r=q.length>1?q.shift():q[0];fs.writeFileSync(${JSON.stringify(plan)},JSON.stringify(q));
if(r.fehler){process.stderr.write("gh: HTTP 500\\n");process.exit(1);}
process.stdout.write(r.roh!==undefined?r.roh:JSON.stringify({workflow_runs:r.runs}));
`);
    writeFileSync(join(dir, "dateien.json"), JSON.stringify(dateien));
    // Fake-date: nur Wochentag (%u) und Uhrzeit (%H%M) sind einstellbar, alles andere echt (Testhilfe, kein Schalter des Skripts)
    writeFileSync(join(dir, "date"), `#!/bin/sh\ncase "$*" in *%u*) echo ${dow};; *%H%M*) echo ${hm};; *) exec /bin/date "$@";; esac\n`); chmodSync(join(dir, "date"), 0o755);
    chmodSync(join(dir, "gh"), 0o755);
    writeFileSync(join(dir, "sleep.sh"), `#!/bin/sh\necho "$1" >> ${sleeps}\nsleep 0.02\n`); chmodSync(join(dir, "sleep.sh"), 0o755);
    const r = spawnSync("bash", [SCRIPT, ...(pr ? ["--pr", String(pr)] : []), String(max)], { encoding: "utf8", timeout: 20000, env: { ...process.env, PATH: dir + ":" + process.env.PATH, PAGES_FREI_SLEEP: join(dir, "sleep.sh") } });
    return { ...r, calls: readFileSync(log, "utf8").trim().split("\n").filter(Boolean), sleeps: readFileSync(sleeps, "utf8").trim().split("\n").filter(Boolean) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const run = (status, id = 1) => ({ id, status, created_at: "2026-11-23T05:41:50Z" });

test("PF-1 ohne Dispatch-Laeufe oder nur abgeschlossene: frei (Exit 0), eine REST-Abfrage auf die Dispatch-Laeufe von pages-release", () => {
  for (const runs of [[], [run("completed")]]) {
    const r = lauf([{ runs }]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /frei/);
    assert.equal(r.calls.length, 1);
    assert.match(r.calls[0], /pages-release\.yml\/runs\?event=workflow_dispatch/);
  }
});
test("PF-2 ein offener Dispatch-Lauf (queued, waiting, pending, in_progress) belegt die Gruppe: Exit 1, Lauf wird genannt", () => {
  for (const s of ["queued", "waiting", "pending", "in_progress"]) {
    const r = lauf([{ runs: [run("completed", 1), run(s, 42)] }]);
    assert.equal(r.status, 1, s);
    assert.match(r.stderr, new RegExp(`42 ${s}`));
  }
});
test("PF-3 mit Wartezeit: wird frei, sobald der Dispatch-Lauf fertig ist (Exit 0 nach Warten)", () => {
  const r = lauf([{ runs: [run("in_progress", 7)] }, { runs: [run("completed", 7)] }], 5);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.sleeps.length >= 1, "hat gewartet");
});
test("PF-4 Fehler sind nie 'frei': API-Fehler und unlesbare Antwort enden mit Exit 2", () => {
  assert.equal(lauf([{ fehler: true }]).status, 2);
  assert.equal(lauf([{ roh: "<html>" }]).status, 2);
});
test("PF-5 ein einzelner API-Fehler beim Warten wird wiederholt, nicht als frei gewertet", () => {
  const r = lauf([{ fehler: true }, { runs: [run("in_progress")] }, { runs: [] }], 5);
  assert.equal(r.status, 0, r.stderr);
});

/* ---------- Boersenfenster (Steuerung 23.11.2026): Mo-Fr 13:30 <= UTC < 21:00, nur fuer Merges mit Pfaden, die pages-release ausloesen ---------- */
const frei = { runs: [] };
const mitPfad = ["landing/scripts/ratgeber.mjs", "docs/x.md"], nurDoku = ["docs/a.md", "scripts/ci/pages-frei.sh", "scripts/ci/tests/pages-frei.test.mjs", "CLAUDE.md", "news/tests/x.test.mjs"];
test("PF-6 Boersenfenster: Merge mit Produkt-Pfad (Mo-Fr 13:30-20:59 UTC) endet mit Exit 1 und dem Grund Boersenfenster; Grenzen 13:29 frei, 13:30 und 20:59 gesperrt, 21:00 frei", () => {
  for (const [hm, erwartet] of [["1329", 0], ["1330", 1], ["1424", 1], ["2059", 1], ["2100", 0]]) {
    const r = lauf([frei], 0, { dow: "1", hm, pr: 9, dateien: mitPfad });
    assert.equal(r.status, erwartet, `${hm}: ${r.stderr}`);
    if (erwartet === 1) assert.match(r.stderr, /Boersenfenster.*PR 9.*landing\/scripts\/ratgeber\.mjs/);
  }
});
test("PF-7 Boersenfenster: Doku-, Test- und scripts/ci-Pfade sind ausgenommen (weiter nur die Dispatch-Pruefung); Dispatch belegt bleibt Exit 1", () => {
  assert.equal(lauf([frei], 0, { dow: "3", hm: "1500", pr: 9, dateien: nurDoku }).status, 0);
  assert.equal(lauf([{ runs: [run("in_progress", 5)] }], 0, { dow: "3", hm: "1500", pr: 9, dateien: nurDoku }).status, 1);
});
test("PF-8 Wochenende und alle Tage Mo-Fr ausserhalb des Fensters: kein Boersenfenster (Sa/So 15:00, Fr 21:00, Mo 07:00)", () => {
  for (const [dow, hm] of [["6", "1500"], ["7", "1500"], ["5", "2100"], ["1", "0700"]]) assert.equal(lauf([frei], 0, { dow, hm, pr: 9, dateien: mitPfad }).status, 0, `${dow} ${hm}`);
  for (const dow of ["1", "2", "3", "4", "5"]) assert.equal(lauf([frei], 0, { dow, hm: "1500", pr: 9, dateien: mitPfad }).status, 1, `Tag ${dow}`);
});
test("PF-9 Boersenfenster ohne --pr: Inhalt unbekannt, Exit 1 (kein Umgehen ohne PR-Nummer); Dateiliste nicht lesbar oder leer: Exit 2", () => {
  const r = lauf([frei], 0, { dow: "2", hm: "1400" });
  assert.equal(r.status, 1); assert.match(r.stderr, /PR-Nummer fehlt/);
  assert.equal(lauf([frei], 0, { dow: "2", hm: "1400", pr: 9, dateien: null }).status, 2);
  assert.equal(lauf([frei], 0, { dow: "2", hm: "1400", pr: 9, dateien: [] }).status, 2);
});
