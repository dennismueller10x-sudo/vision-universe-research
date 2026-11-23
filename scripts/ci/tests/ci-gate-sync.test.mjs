/* ci-gate-sync: ereignisgesteuerter Gate (22.11.2026). Fail-closed: Gruen nur bei vollstaendig abgeschlossenen, nicht roten Laeufen.
   Lauf: node --test "scripts/ci/tests/*.test.mjs" */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { entscheide, setzeCheck, sync, EIGENE, GRACE_MS, ROT_GRACE_MS } from "../ci-gate-sync.mjs";

const SHA = "a".repeat(40);
const T0 = Date.parse("2026-11-22T22:00:00Z");
const vor = (min) => new Date(T0 - min * 60000).toISOString();
let nextId = 1;
const lauf = (name, status, conclusion, { created = 10, updated = 5 } = {}) => ({ id: nextId++, name, status, conclusion, created_at: vor(created), updated_at: vor(updated) });

/** Fake-API: Laeufe je Aufruf aus einer Liste (der naechste Aufruf liest den naechsten Stand), Check-Runs im Speicher. */
function fakeApi(staende, { checks = [], fehler = false } = {}) {
  const log = [];
  let i = 0;
  const api = {
    log, checks,
    async get(path) {
      if (fehler) throw new Error("500 api");
      if (path.includes("/actions/runs")) return { workflow_runs: staende[Math.min(i++, staende.length - 1)] };
      if (path.includes("/check-runs")) return { check_runs: checks.filter((c) => path.includes(encodeURIComponent(c.name))) };
      throw new Error("unerwartet " + path);
    },
    async send(method, path, body) {
      log.push({ method, path, body });
      if (method === "POST") { const c = { id: 100 + checks.length, app: { slug: "github-actions" }, ...body }; checks.push(c); return c; }
      const c = checks.find((x) => path.endsWith("/" + x.id)); Object.assign(c, body); return c;
    },
  };
  return api;
}
const ohneSchlaf = { jetzt: () => T0, schlafen: async () => {}, log: () => {} };

test("CG-1 gruen: alle Laeufe abgeschlossen und nicht rot (skipped/neutral zaehlen), Gate-Laeufe zaehlen nicht", () => {
  const e = entscheide({ runs: [lauf("CI", "completed", "success"), lauf("Core", "completed", "skipped"), lauf("Q", "completed", "neutral"), lauf("ci-gate", "in_progress", null), lauf("ci-gate-neu", "in_progress", null)], nowMs: T0, mode: "event" });
  assert.equal(e.aktion, "gruen");
  assert.equal(e.conclusion, "success");
});

test("CG-2 offen: ein wartender oder laufender Lauf haelt das Gate offen, nie gruen", () => {
  for (const status of ["queued", "in_progress", "waiting", "pending", "requested"]) {
    const e = entscheide({ runs: [lauf("CI", "completed", "success"), lauf("Core", status, null)], nowMs: T0, mode: "event" });
    assert.equal(e.aktion, "offen", status);
    assert.equal(e.conclusion, null);
    assert.equal(e.status, "in_progress");
  }
});

test("CG-3 rot: ein roter Lauf (failure, cancelled, timed_out ...) macht das Gate rot, auch wenn der Rest gruen ist", () => {
  for (const conclusion of ["failure", "cancelled", "timed_out", "startup_failure", "action_required"]) {
    const e = entscheide({ runs: [lauf("CI", "completed", "success"), lauf("Core", "completed", conclusion, { updated: 30 })], nowMs: T0, mode: "event" });
    assert.equal(e.aktion, "rot", conclusion);
    assert.equal(e.conclusion, "failure");
  }
});

test("CG-4 fehlende Pruefung: ohne jeden Lauf ist ein Ereignis nie gruen; der Start nach der Gnadenfrist (Doku-PR) schon", () => {
  assert.equal(entscheide({ runs: [], nowMs: T0, mode: "event" }).aktion, "offen");
  assert.equal(entscheide({ runs: [lauf("ci-gate", "in_progress", null)], nowMs: T0, mode: "event" }).aktion, "offen");
  const doku = entscheide({ runs: [lauf("ci-gate", "in_progress", null)], nowMs: T0, mode: "start" });
  assert.equal(doku.aktion, "gruen");
  assert.match(doku.summary, /Doku/);
});

test("CG-5 Gnadenfrist: Laeufe, die gerade erst erschienen sind, werden nicht gruen (weitere koennen folgen)", () => {
  const jung = entscheide({ runs: [lauf("CI", "completed", "success", { created: (GRACE_MS / 60000) / 2, updated: 0 })], nowMs: T0, mode: "event" });
  assert.equal(jung.aktion, "offen");
  const alt = entscheide({ runs: [lauf("CI", "completed", "success", { created: 5, updated: 1 })], nowMs: T0, mode: "event" });
  assert.equal(alt.aktion, "gruen");
});

test("CG-6 neuester Lauf je Name zaehlt (Altlauf abgebrochen, Wiederholung gruen; Wiederholung rot)", () => {
  const a = { ...lauf("x", "completed", "cancelled"), id: 1 }, b = { ...lauf("x", "completed", "success"), id: 2 };
  assert.equal(entscheide({ runs: [a, b], nowMs: T0, mode: "event" }).aktion, "gruen");
  const c = { ...lauf("x", "completed", "success"), id: 1 }, d = { ...lauf("x", "completed", "failure", { updated: 30 }), id: 2 };
  assert.equal(entscheide({ runs: [c, d], nowMs: T0, mode: "event" }).aktion, "rot");
});

test("CG-7 roter Lauf juenger als die Frist: erst abwarten (Infrastruktur-Retry), dann entscheiden", () => {
  const e = entscheide({ runs: [lauf("CI", "completed", "failure", { updated: 1 })], nowMs: T0, mode: "event" });
  assert.equal(e.aktion, "rotAbwarten");
  assert.equal(e.status, "in_progress");
  assert.ok(e.abwartenMs > 0 && e.abwartenMs <= ROT_GRACE_MS + 5000);
  assert.equal(entscheide({ runs: [lauf("CI", "completed", "failure", { updated: 1 })], nowMs: T0, mode: "event", rotFrist: false }).aktion, "rot");
});

test("CG-8 sync: gruen legt den Check an (POST completed/success), ein vorhandener in_progress-Check wird aktualisiert (PATCH)", async () => {
  const stand = [[lauf("CI", "completed", "success"), lauf("Core", "completed", "success")]];
  const api = fakeApi(stand);
  await sync({ api, repo: "o/r", sha: SHA, name: "ci-gate-neu", mode: "event", ...ohneSchlaf });
  assert.equal(api.log.length, 1);
  assert.equal(api.log[0].method, "POST");
  assert.equal(api.log[0].body.conclusion, "success");
  assert.equal(api.log[0].body.head_sha, SHA);
  const api2 = fakeApi(stand, { checks: [{ id: 7, name: "ci-gate-neu", status: "in_progress", app: { slug: "github-actions" } }] });
  await sync({ api: api2, repo: "o/r", sha: SHA, name: "ci-gate-neu", mode: "event", ...ohneSchlaf });
  assert.equal(api2.log[0].method, "PATCH");
  assert.match(api2.log[0].path, /\/check-runs\/7$/);
});

test("CG-9 sync: rot nach Gnadenfrist, Retry gruen -> der Check wird NICHT rot (Wiederholung laeuft)", async () => {
  const rot = [lauf("CI", "completed", "failure", { updated: 1 })];
  const nachRetry = [{ ...rot[0], status: "in_progress", conclusion: null }];
  const api = fakeApi([rot, nachRetry]);
  let geschlafen = 0;
  const e = await sync({ api, repo: "o/r", sha: SHA, name: "ci-gate", mode: "event", jetzt: () => T0, schlafen: async (ms) => { geschlafen = ms; }, log: () => {} });
  assert.ok(geschlafen > 0, "wartet die Frist ab");
  assert.equal(e.aktion, "offen");
  assert.equal(api.checks.at(-1).status, "in_progress");
  assert.ok(!api.log.some((l) => l.body.conclusion === "failure"));
});

test("CG-10 sync: rot bleibt rot, wenn nach der Frist kein Retry gestartet ist", async () => {
  const rot = [lauf("CI", "completed", "failure", { updated: 1 })];
  const api = fakeApi([rot, rot]);
  const e = await sync({ api, repo: "o/r", sha: SHA, name: "ci-gate", mode: "event", ...ohneSchlaf });
  assert.equal(e.aktion, "rot");
  assert.equal(api.checks.at(-1).conclusion, "failure");
});

test("CG-11 sync: API-Fehler -> Ausnahme und KEIN Check-Update (nie gruen ohne Entscheidung)", async () => {
  const api = fakeApi([[]], { fehler: true });
  await assert.rejects(() => sync({ api, repo: "o/r", sha: SHA, name: "ci-gate", mode: "event", ...ohneSchlaf }), /500/);
  assert.equal(api.log.length, 0);
});

test("CG-12 ein abgeschlossener Check wird nicht auf in_progress zurueckgesetzt, sondern neu angelegt (latest gilt)", async () => {
  const api = fakeApi([[]], { checks: [{ id: 9, name: "ci-gate", status: "completed", conclusion: "failure", app: { slug: "github-actions" } }] });
  await setzeCheck({ api, repo: "o/r", sha: SHA, name: "ci-gate", entscheidung: { status: "in_progress", conclusion: null, title: "Wartet", summary: "x" } });
  assert.equal(api.log[0].method, "POST");
});

test("CG-13 EIGENE: beide Gate-Namen werden ausgeschlossen", () => {
  assert.ok(EIGENE.has("ci-gate") && EIGENE.has("ci-gate-neu"));
});

/* ---------- Workflow-Vertrag: jeder PR-Workflow loest den Gate aus, sonst bliebe er offen (fail-closed, aber haengend) ---------- */
const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".github", "workflows");
const text = (f) => readFileSync(join(DIR, f), "utf8");
const name = (f) => (text(f).match(/^name:\s*(.+)$/m) || [])[1]?.trim().replace(/^['"]|['"]$/g, "");
const hatPullRequest = (f) => {
  const zeilen = text(f).split("\n"); const i = zeilen.findIndex((l) => /^on:/.test(l));
  if (/^on:.*\bpull_request\b/.test(zeilen[i] || "")) return true;
  for (let k = i + 1; k < zeilen.length && !/^\S/.test(zeilen[k]); k++) if (/^  pull_request(:|\s*$)/.test(zeilen[k])) return true;
  return false;
};

test("CG-14 ci-gate-neu.yml: workflow_run nennt JEDEN Workflow mit pull_request (ausser den Gates), Job-Filter, Rechte, Gruppe je Commit", () => {
  const gate = text("ci-gate-neu.yml");
  const liste = [...(gate.match(/workflow_run:\n    workflows:\n((?:      - [^\n]+\n)+)/) || [, ""])[1].matchAll(/- '?([^'\n]+)'?\n/g)].map((m) => m[1].trim());
  const erwartet = readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f) && !/^ci-gate/.test(f) && hatPullRequest(f)).map(name);
  assert.ok(erwartet.length >= 8, "PR-Workflows gefunden");
  assert.deepEqual(erwartet.filter((n) => !liste.includes(n)), [], "Workflow loest den Gate nicht aus (Check bliebe in_progress)");
  assert.deepEqual(liste.filter((n) => !erwartet.includes(n)), [], "Eintrag ohne PR-Workflow");
  assert.match(gate, /if: github\.event_name == 'pull_request' \|\| github\.event\.workflow_run\.event == 'pull_request'/, "Push-Laeufe derselben Workflows brauchen keinen Runner");
  assert.match(gate, /permissions:\n  contents: read\n  actions: read\n  checks: write\n/);
  assert.match(gate, /group: ci-gate-neu-\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(gate, /cancel-in-progress: false/);
  assert.match(gate, /GATE_NAME: ci-gate-neu/);
  assert.match(gate, /node scripts\/ci\/ci-gate-sync\.mjs/);
});
