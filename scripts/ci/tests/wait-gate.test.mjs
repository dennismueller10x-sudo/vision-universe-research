/* wait-gate.sh mit einem Fake-gh: REST statt GraphQL, bedingte Abfragen (ETag), Takt, Limit, Dauerfehler. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "wait-gate.sh");

/** Fake-gh: liest Antworten je Pfad-Muster aus einem Skript (Zeilen: muster<TAB>status<TAB>etag<TAB>body<TAB>zusatzheader). */
function lauf(antworten, { max = 1, erwartet = "" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "vu-wg-"));
  try {
    const plan = join(dir, "plan.json"), log = join(dir, "calls.log"), sleeps = join(dir, "sleeps.log");
    writeFileSync(plan, JSON.stringify(antworten)); writeFileSync(log, ""); writeFileSync(sleeps, "");
    writeFileSync(join(dir, "gh"), `#!/usr/bin/env node
const fs=require("fs");const a=process.argv.slice(2);const path=a[a.indexOf("-i")+1];
const inm=a.includes("-H")?a[a.indexOf("-H")+1]:"";
fs.appendFileSync(${JSON.stringify(log)},path+"|"+inm+"\\n");
const plan=JSON.parse(fs.readFileSync(${JSON.stringify(plan)}));
const key=path.includes("check-runs")?"gate":path.includes("/pulls/")?"pr":"other";
const q=plan[key];const r=q.length>1?q.shift():q[0];fs.writeFileSync(${JSON.stringify(plan)},JSON.stringify(plan));
const etag=r.etag?'Etag: "'+r.etag+'"\\r\\n':"";
if(inm.includes(r.etag||"@@")&&r.status===200){process.stdout.write("HTTP/1.1 304 Not Modified\\r\\n"+etag+"X-Ratelimit-Remaining: 4000\\r\\n\\r\\n");process.stderr.write("gh: HTTP 304\\n");process.exit(1);}
process.stdout.write("HTTP/1.1 "+r.status+" X\\r\\n"+etag+"X-Ratelimit-Remaining: "+(r.remaining??4000)+"\\r\\n"+(r.headers||"")+"\\r\\n"+JSON.stringify(r.body||{}));
process.exit(r.status<300?0:1);
`);
    chmodSync(join(dir, "gh"), 0o755);
    writeFileSync(join(dir, "sleep.sh"), `#!/bin/sh\necho "$1" >> ${sleeps}\nsleep 0.05\n`); chmodSync(join(dir, "sleep.sh"), 0o755);
    const r = spawnSync("bash", [SCRIPT, "7", String(max), erwartet], {
      encoding: "utf8", timeout: 20000,
      env: { ...process.env, PATH: dir + ":" + process.env.PATH, GH_REPO: "o/r", WAIT_GATE_SLEEP: join(dir, "sleep.sh"), WAIT_GATE_MAX_S: process.env.WG_MAX_S || "60" }
    });
    return { ...r, calls: readFileSync(log, "utf8").trim().split("\n").filter(Boolean), sleeps: readFileSync(sleeps, "utf8").trim().split("\n").filter(Boolean) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const pr = (sha = "abc") => ({ status: 200, etag: "p-" + sha, body: { head: { sha } } });
const gate = (c, s = "completed", etag = "g" + Math.random()) => ({ status: 200, etag, body: { check_runs: [{ id: 1, status: s, conclusion: c }] } });

test("wait-gate: gruen beendet mit 0, nur REST-Pfade, nur der Check ci-gate", () => {
  const r = lauf({ pr: [pr()], gate: [gate("success")] });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /ci-gate gruen \(abc\)/);
  assert.ok(r.calls.every((c) => c.startsWith("repos/{owner}/{repo}/")), "kein pr view / GraphQL");
  assert.ok(r.calls.some((c) => /check_name=ci-gate&filter=latest&per_page=1/.test(c)));
});
test("wait-gate: rot beendet mit 1", () => {
  assert.equal(lauf({ pr: [pr()], gate: [gate("failure")] }).status, 1);
});
test("wait-gate: der zweite Abruf desselben Pfads geht bedingt raus (If-None-Match)", () => {
  const r = lauf({ pr: [pr()], gate: [{ status: 200, etag: "g1", body: { check_runs: [{ id: 1, status: "in_progress", conclusion: null }] } }, gate("success")] }, { max: 1 });
  // Der Fake liefert beim ersten Mal 200 (offen), danach success; zweiter Pr-Aufruf muss bedingt sein.
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.calls.some((c) => c.includes("/pulls/7|If-None-Match")), r.calls.join("\n"));
});
test("wait-gate: Limit (403 mit Remaining 0) wartet, statt zu zaehlen; Dauerfehler endet mit 2", () => {
  const limit = lauf({ pr: [{ status: 403, remaining: 0, headers: "Retry-After: 5\r\n" }, pr()], gate: [gate("success")] });
  assert.equal(limit.status, 0, limit.stderr);
  assert.ok(limit.sleeps.includes("5"), "Retry-After beachtet");
  const kaputt = lauf({ pr: [{ status: 404 }], gate: [gate("success")] });
  assert.equal(kaputt.status, 2);
  assert.match(kaputt.stderr, /nicht lesbar/);
});

test("wait-gate: mit erwartetem Head-sha zaehlt der gruene Check eines anderen (alten) Heads nicht", () => {
  process.env.WG_MAX_S = "2"; const alt = lauf({ pr: [pr("alt")], gate: [gate("success")] }, { max: 1, erwartet: "neu" }); delete process.env.WG_MAX_S;
  assert.equal(alt.status, 2, "nur der alte Head ist sichtbar: Zeitlimit statt gruen");
  const ok = lauf({ pr: [pr("alt"), pr("neu")], gate: [gate("success")] }, { max: 1, erwartet: "neu" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /\(neu\)/);
});
