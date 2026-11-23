/* ci-gate-sync: ereignisgesteuerter Gate (22.11.2026). Fail-closed: Gruen nur bei vollstaendig abgeschlossenen, nicht roten Laeufen.
   Lauf: node --test "scripts/ci/tests/*.test.mjs" */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { entscheide, setzeCheck, sync, EIGENE, GRACE_MS, ROT_GRACE_MS, eigenerLauf, apiClient } from "../ci-gate-sync.mjs";

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

test("CG-14 ci-gate.yml: workflow_run nennt JEDEN Workflow mit pull_request (ausser den Gates), Job-Filter, Rechte, Gruppe je Commit", () => {
  const gate = text("ci-gate.yml");
  const liste = [...(gate.match(/workflow_run:\n    workflows:\n((?:      - [^\n]+\n)+)/) || [, ""])[1].matchAll(/- '?([^'\n]+)'?\n/g)].map((m) => m[1].trim());
  const erwartet = readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f) && !/^ci-gate/.test(f) && hatPullRequest(f)).map(name);
  assert.ok(erwartet.length >= 8, "PR-Workflows gefunden");
  assert.deepEqual(erwartet.filter((n) => !liste.includes(n)), [], "Workflow loest den Gate nicht aus (Check bliebe in_progress)");
  assert.deepEqual(liste.filter((n) => !erwartet.includes(n)), [], "Eintrag ohne PR-Workflow");
  assert.match(gate, /if: github\.event_name == 'pull_request' \|\| github\.event\.workflow_run\.event == 'pull_request'/, "Push-Laeufe derselben Workflows brauchen keinen Runner");
  assert.match(gate, /permissions:\n  contents: read\n  actions: read\n  checks: write\n/);
  assert.match(gate, /group: ci-gate-\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(gate, /cancel-in-progress: false/);
  assert.match(gate, /GATE_NAME: ci-gate\n/, "Check-Name ci-gate");
  assert.doesNotMatch(gate, /GATE_SHADOW|head_ref/, "keine Schatten-Ausnahme mehr");
  assert.match(gate, /node scripts\/ci\/ci-gate-sync\.mjs/);
});

/* ---------- Pfadfilter: Pruefungen, die ein PR gar nicht ausloest, duerfen den Gate nie haengen lassen (Steuerung 23.11.) ---------- */
test("CG-15 Pfadfilter: nur die Laeufe, die es gibt, zaehlen; fehlende (nie gestartete) Pruefungen blockieren nicht", () => {
  // Nur ein Produkt-CI und ein Core-Lauf entstehen (Pfadfilter der anderen Workflows greifen nicht), alles abgeschlossen: gruen.
  const nur = [lauf("CI", "completed", "success"), lauf("Core", "completed", "success")];
  const gruen = entscheide({ runs: nur, nowMs: T0 + GRACE_MS + 1000, mode: "event" });
  assert.equal(gruen.aktion, "gruen");
  // Kein einziger Workflow (reiner Doku-PR): beim Start gruen, im Ereignismodus nie (ohne Lauf kein Ereignis, fail-closed).
  assert.equal(entscheide({ runs: [], nowMs: T0, mode: "start" }).aktion, "gruen");
  assert.equal(entscheide({ runs: [], nowMs: T0, mode: "event" }).aktion, "offen");
  // Ein ausgeloester, aber noch laufender Workflow haelt den Check offen, auch wenn alle anderen fertig sind.
  assert.equal(entscheide({ runs: [...nur, lauf("Quant CI", "in_progress", null)], nowMs: T0 + GRACE_MS + 1000, mode: "event" }).aktion, "offen");
  // Ein Lauf, der wegen des Pfadfilters als "skipped" endet, gilt als bestanden.
  assert.equal(entscheide({ runs: [...nur, lauf("Quant CI", "completed", "skipped")], nowMs: T0 + GRACE_MS + 1000, mode: "event" }).aktion, "gruen");
});

/* ---------- 403 auf dem Check-Run eines Actions-Jobs (23.11.2026, #2312): nie aendern, neuer Check ---------- */
const gruen = { status: "completed", conclusion: "success", title: "ok", summary: "ok" };
test("CG-16 Der Check-Run eines Actions-Jobs (details_url .../job/<id>) wird nicht geaendert: neuer Check-Run, kein PATCH", async () => {
  const api = fakeApi([[]], { checks: [{ id: 7, name: "ci-gate", status: "in_progress", details_url: "https://github.com/o/r/actions/runs/1/job/2", app: { slug: "github-actions" } }] });
  await setzeCheck({ api, repo: "o/r", sha: SHA, name: "ci-gate", entscheidung: gruen });
  assert.equal(api.log.filter((l) => l.method === "PATCH").length, 0);
  assert.equal(api.log.filter((l) => l.method === "POST").length, 1);
});
test("CG-17 403/404/422 beim Aendern: neuer Check-Run (latest gilt), andere Fehler (500) brechen ab, nie stilles Gruen", async () => {
  const mk = (status) => {
    const api = fakeApi([[]], { checks: [{ id: 7, name: "ci-gate", status: "in_progress", details_url: "https://github.com/o/r/actions/runs/1", app: { slug: "github-actions" } }] });
    const send = api.send; api.send = async (m, p, b) => { if (m === "PATCH") throw new Error(`${status} https://api.github.com${p}`); return send(m, p, b); };
    return api;
  };
  const a403 = mk(403); await setzeCheck({ api: a403, repo: "o/r", sha: SHA, name: "ci-gate", entscheidung: gruen });
  assert.equal(a403.log.filter((l) => l.method === "POST").length, 1);
  await assert.rejects(() => setzeCheck({ api: mk(500), repo: "o/r", sha: SHA, name: "ci-gate", entscheidung: gruen }), /500/);
});

/* ---------- Eigener Lauf (run-name) zaehlt nie als offene Pruefung (23.11.2026, #2321) ---------- */
test("CG-18 eigener Lauf: run-name 'ci-gate PR n', 'ci-gate nach X', alter Name 'ci-gate-neu PR n' und der Pfad der Datei zaehlen nicht mit; fremde Namen mit ci-gate im Namen schon", () => {
  for (const n of ["ci-gate PR 2321", "ci-gate nach CI (Pruefungen je Produkt)", "ci-gate-neu PR 7", "ci-gate-neu nach Quant CI", "ci-gate", "ci-gate-neu"]) assert.equal(eigenerLauf({ name: n }), true, n);
  assert.equal(eigenerLauf({ name: "Irgendwas", path: ".github/workflows/ci-gate.yml@refs/pull/9/merge" }), true);
  assert.equal(eigenerLauf({ name: "Irgendwas", path: ".github/workflows/ci-gate.yml" }), true);
  for (const n of ["CI (Pruefungen je Produkt)", "ci-gates sammeln", "Core - Tests", "Quant 2.0 Production Pages"]) assert.equal(eigenerLauf({ name: n, path: ".github/workflows/ci.yml" }), false, n);
});
test("CG-19 Start-Job nach einem Rerun: alle anderen Laeufe fertig, nur der eigene Lauf 'ci-gate PR n' ist in_progress -> gruen (kein Warten auf sich selbst); mit offenem fremdem Lauf bleibt es offen", () => {
  const fertig = [lauf("CI (Pruefungen je Produkt)", "completed", "success"), lauf("Core - Tests", "completed", "success")];
  const eigen = lauf("ci-gate PR 2321", "in_progress", null);
  assert.equal(entscheide({ runs: [...fertig, eigen], nowMs: T0, mode: "start" }).aktion, "gruen");
  assert.equal(entscheide({ runs: [eigen], nowMs: T0, mode: "start" }).aktion, "gruen", "reiner Doku-PR: nur der eigene Lauf");
  assert.equal(entscheide({ runs: [...fertig, lauf("Quant CI", "in_progress", null), eigen], nowMs: T0, mode: "start" }).aktion, "offen");
  assert.equal(entscheide({ runs: [...fertig, lauf("Quant CI", "completed", "failure"), eigen], nowMs: T0 + ROT_GRACE_MS + 1, mode: "start", rotFrist: false }).aktion, "rot");
  assert.equal(entscheide({ runs: [eigen], nowMs: T0, mode: "event" }).aktion, "offen", "Ereignismodus ohne fremden Lauf: nie gruen");
});
test("CG-20 apiClient: 5xx und Netzfehler werden mit Backoff wiederholt (2 s, 6 s), 4xx nie, nach dem Ende bleibt der Fehler (nie stilles Gruen)", async () => {
  const antwort = (status, body = {}) => ({ status, ok: status < 300, url: "https://api.github.com/x?y=1", headers: new Map(), json: async () => body });
  const lauf_ = async (folge) => {
    const calls = []; const pausen = [];
    const fetchFn = async () => { calls.push(1); const r = folge[Math.min(calls.length - 1, folge.length - 1)]; if (r instanceof Error) throw r; return r; };
    const api = apiClient("t", { fetchFn, schlafen: async (ms) => { pausen.push(ms); } });
    return { api, calls, pausen };
  };
  let x = await lauf_([antwort(500), antwort(200, { ok: 1 })]);
  assert.deepEqual(await x.api.send("POST", "/x", {}), { ok: 1 }); assert.deepEqual(x.pausen, [2000]); assert.equal(x.calls.length, 2);
  x = await lauf_([antwort(502), antwort(503), antwort(200, { ok: 2 })]);
  assert.deepEqual(await x.api.get("/x"), { ok: 2 }); assert.deepEqual(x.pausen, [2000, 6000]);
  x = await lauf_([antwort(500)]);
  await assert.rejects(() => x.api.send("PATCH", "/x", {}), /^Error: 500 /); assert.equal(x.calls.length, 3, "1 Versuch + 2 Wiederholungen");
  x = await lauf_([antwort(403)]);
  await assert.rejects(() => x.api.send("PATCH", "/x", {}), /^Error: 403 /); assert.equal(x.calls.length, 1, "4xx wird nicht wiederholt");
  x = await lauf_([new TypeError("fetch failed"), antwort(200, { ok: 3 })]);
  assert.deepEqual(await x.api.get("/x"), { ok: 3 });
});
