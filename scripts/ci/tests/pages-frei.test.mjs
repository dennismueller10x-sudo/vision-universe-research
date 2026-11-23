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
function lauf(antworten, max = 0) {
  const dir = mkdtempSync(join(tmpdir(), "vu-pf-"));
  try {
    const plan = join(dir, "plan.json"), log = join(dir, "calls.log"), sleeps = join(dir, "sleeps.log");
    writeFileSync(plan, JSON.stringify(antworten)); writeFileSync(log, ""); writeFileSync(sleeps, "");
    writeFileSync(join(dir, "gh"), `#!/usr/bin/env node
const fs=require("fs");const a=process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)},a.join(" ")+"\\n");
const q=JSON.parse(fs.readFileSync(${JSON.stringify(plan)}));const r=q.length>1?q.shift():q[0];fs.writeFileSync(${JSON.stringify(plan)},JSON.stringify(q));
if(r.fehler){process.stderr.write("gh: HTTP 500\\n");process.exit(1);}
process.stdout.write(r.roh!==undefined?r.roh:JSON.stringify({workflow_runs:r.runs}));
`);
    chmodSync(join(dir, "gh"), 0o755);
    writeFileSync(join(dir, "sleep.sh"), `#!/bin/sh\necho "$1" >> ${sleeps}\nsleep 0.02\n`); chmodSync(join(dir, "sleep.sh"), 0o755);
    const r = spawnSync("bash", [SCRIPT, String(max)], { encoding: "utf8", timeout: 20000, env: { ...process.env, PATH: dir + ":" + process.env.PATH, PAGES_FREI_SLEEP: join(dir, "sleep.sh") } });
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
