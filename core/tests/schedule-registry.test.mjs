/* Ein Zeitgeber (Plan Neustart §3, Strang O): Vertragstest SZ.
   core/registry/schedule.json ist die einzige Zeitplan-Liste; der Cloudflare-Wecker stoesst die Eintraege
   mit timer "waker" an (worker-waker/src/zeitplan.mjs). Geprueft wird, dass Register, Workflows und Wecker
   uebereinstimmen und kein Termin zwei Zeitgeber (Doppelstart) oder keinen hat. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { inventory, loadRegistry, drift, workflowCrons, dispatchInputs } from "../../scripts/core/schedule-registry.mjs";
import { leseCron, cronTrifft, faellig, takte, marke } from "../../worker-waker/src/zeitplan.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REG = loadRegistry(ROOT);
const wf = (f) => readFileSync(join(ROOT, ".github/workflows", f), "utf8");
const T = (iso) => Date.parse(iso);

test("SZ-1 · Register: eindeutige Eintraege, gueltige Crons, stimmt mit den Workflows ueberein", () => {
  assert.equal(REG.schema, "vu-schedule-1");
  const ids = REG.entries.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, "ids eindeutig");
  const pairs = REG.entries.map((e) => e.workflow + "|" + e.cron);
  assert.equal(new Set(pairs).size, pairs.length, "je Workflow und Cron genau ein Eintrag");
  for (const e of REG.entries) {
    assert.ok(["github", "waker"].includes(e.timer), e.id);
    assert.ok(existsSync(join(ROOT, ".github/workflows", e.workflow)), e.id + " Workflow fehlt");
    assert.doesNotThrow(() => leseCron(e.cron), e.id);
  }
  assert.deepEqual(drift(REG, inventory(ROOT)), [], "Register und Workflows weichen ab: node scripts/core/schedule-registry.mjs --sync");
});

test("SZ-2 · Wecker-Eintraege: kein Cron im Workflow, Eingang zeitplan, Marke im run-name, Weiche wie beim Zeitplan", () => {
  const waker = [...new Set(REG.entries.filter((e) => e.timer === "waker").map((e) => e.workflow))];
  for (const f of waker) {
    const text = wf(f);
    for (const e of REG.entries.filter((x) => x.workflow === f)) {
      assert.ok(!workflowCrons(text).some((c) => c.cron === e.cron), f + ": Cron " + e.cron + " steht noch im Workflow (Doppelstart)");
    }
    assert.match(text, /workflow_dispatch:\s*\n\s+inputs:[\s\S]*?\n\s{6}zeitplan:\s*\n/, f + ": Eingang zeitplan fehlt");
    /* Der Wecker erkennt seinen Lauf am Ende des Titels: "… · Takt <cron>" (worker-waker/src/zeitplan.mjs#marke).
       Einzeilig mit beliebigen Marken davor, oder mehrzeilig (Buendel mit Teil-Marken), dann als letzter Baustein. */
    const einzeilig = /^run-name: \$\{\{ inputs\.zeitplan && format\('[^']*· Takt \{(\d)\}', [^)]*inputs\.zeitplan\) \|\| .+ \}\}$/m.test(text);
    const block = /^run-name: >-\n((?: {2}.*\n)+)/m.exec(text);
    const mehrzeilig = !!block && /inputs\.zeitplan && format\(' · Takt \{0\}', inputs\.zeitplan\) \|\| ''\) \}\}\s*$/.test(block[1]);
    assert.ok(einzeilig || mehrzeilig, f + ": run-name mit Marke '· Takt <cron>' am Ende fehlt");
    const ohne = text.replace(/^\s*#.*$/gm, "");
    for (const m of ohne.matchAll(/github\.event\.schedule(?! \|\| inputs\.zeitplan)/g)) assert.fail(f + ": github.event.schedule ohne inputs.zeitplan @" + m.index);
    for (const m of ohne.matchAll(/github\.event_name == 'schedule'(?! \|\| inputs\.zeitplan)/g)) assert.fail(f + ": Zeitplan-Weiche ohne inputs.zeitplan @" + m.index);
    for (const m of ohne.matchAll(/github\.event_name == 'workflow_dispatch'(?! && !inputs\.zeitplan)/g)) assert.fail(f + ": manuelle Weiche greift auch beim Takt @" + m.index);
    for (const m of ohne.matchAll(/github\.event_name != '(schedule|workflow_dispatch)'/g)) assert.fail(f + ": != auf schedule/workflow_dispatch ist beim Takt mehrdeutig @" + m.index);
    for (const l of ohne.split("\n")) if (/\$\{\{[^}]*inputs\.zeitplan/.test(l) && !/^\s*-?\s*[A-Za-z_][A-Za-z0-9_-]*:\s*\$\{\{/.test(l)) assert.fail(f + ": inputs.zeitplan im Shell-Text (ADR-005: ueber env): " + l.trim());
    for (const m of ohne.matchAll(/GITHUB_EVENT_NAME/g)) assert.fail(f + ": GITHUB_EVENT_NAME heisst beim Takt workflow_dispatch, erwartet VU_EVENT @" + m.index);
    for (const m of ohne.matchAll(/\$\{\{\s*github\.event_name\s*\}\}/g)) assert.fail(f + ": nacktes github.event_name, erwartet inputs.zeitplan && 'schedule' || github.event_name @" + m.index);
  }
});

test("SZ-3 · Company Intelligence bleibt bei GitHub (Auftrag Strang O)", () => {
  for (const e of REG.entries.filter((x) => /^company-intelligence/.test(x.workflow))) {
    assert.equal(e.timer, "github", e.id);
    assert.ok(e.ausnahme, e.id + " braucht eine Begruendung");
  }
});

test("SZ-4 · Cron-Lesart wie GitHub: UTC, Listen, Bereiche, Schritte, Sonntag 0/7, Tag ODER Wochentag", () => {
  assert.equal(cronTrifft("17 5,11,17 * * *", T("2026-11-09T11:17:00Z")), true);
  assert.equal(cronTrifft("17 5,11,17 * * *", T("2026-11-09T11:18:00Z")), false);
  assert.equal(cronTrifft("*/15 13-21 * * 1-5", T("2026-11-09T21:45:00Z")), true);
  assert.equal(cronTrifft("*/15 13-21 * * 1-5", T("2026-11-08T14:00:00Z")), false, "Sonntag");
  assert.equal(cronTrifft("0 8 * * 0", T("2026-11-08T08:00:00Z")), true);
  assert.equal(cronTrifft("0 8 * * 7", T("2026-11-08T08:00:00Z")), true);
  assert.equal(cronTrifft("47 2-22/4 * * *", T("2026-11-09T06:47:00Z")), true);
  assert.equal(cronTrifft("47 2-22/4 * * *", T("2026-11-09T04:47:00Z")), false);
  assert.equal(cronTrifft("17 7 10-20 2,5,8,11 *", T("2026-11-12T07:17:00Z")), true);
  assert.equal(cronTrifft("17 7 10-20 2,5,8,11 *", T("2026-10-12T07:17:00Z")), false);
  // POSIX: Tag 1-7 ODER Samstag (so laeuft long-series.yml bei GitHub heute)
  assert.equal(cronTrifft("40 7 1-7 * 6", T("2026-11-03T07:40:00Z")), true, "Dienstag, der 3.");
  assert.equal(cronTrifft("40 7 1-7 * 6", T("2026-11-14T07:40:00Z")), true, "Samstag, der 14.");
  assert.equal(cronTrifft("40 7 1-7 * 6", T("2026-11-10T07:40:00Z")), false);
  for (const bad of ["* * * *", "60 * * * *", "1-x * * * *", "5 24 * * *"]) assert.throws(() => leseCron(bad), bad);
});

const REG_T = { schema: "vu-schedule-1", nachholenMinuten: [0, 5, 10, 15], entries: [
  { id: "a", workflow: "a.yml", cron: "17 * * * *", timer: "waker" },
  { id: "b", workflow: "b.yml", cron: "17 * * * *", timer: "github" },
  { id: "c", workflow: "c.yml", cron: "20 6 * * *", timer: "waker", inputs: { teil: "x" } }
] };

test("SZ-5 · faellig: nur waker-Eintraege, zur Terminminute und zu den Nachholminuten", () => {
  assert.deepEqual(faellig(REG_T, T("2026-11-09T10:17:30Z")).map((f) => [f.eintrag.id, f.abstand]), [["a", 0]]);
  assert.deepEqual(faellig(REG_T, T("2026-11-09T10:27:00Z")).map((f) => [f.eintrag.id, f.abstand]), [["a", 10]]);
  assert.deepEqual(faellig(REG_T, T("2026-11-09T10:18:00Z")), []);
  assert.deepEqual(faellig(REG_T, T("2026-11-09T10:33:00Z")), [], "nach 15 Minuten nicht mehr");
});

function netz(antworten) {
  const gerufen = [], orig = globalThis.fetch;
  globalThis.fetch = async (url, o) => {
    gerufen.push({ url: String(url), method: (o && o.method) || "GET", body: o && o.body });
    const a = antworten.find((x) => String(url).includes(x.enthaelt));
    if (!a) throw new Error("unerwartet: " + url);
    return { ok: a.ok !== false, status: a.status || (a.ok === false ? 500 : 204), json: async () => a.json || {} };
  };
  return { gerufen, zurueck: () => { globalThis.fetch = orig; } };
}
const ENV = { GITHUB_REPO: "o/r" };

test("SZ-6 · takte: startet mit Marke und Eingaben, nie doppelt, holt nach, raet nicht beim Nachholen", async () => {
  let n = netz([{ enthaelt: "c.yml/runs", json: { workflow_runs: [] } }, { enthaelt: "c.yml/dispatches", json: {} }]);
  try {
    const r = await takte(ENV, {}, REG_T, T("2026-11-09T06:20:00Z"));
    assert.deepEqual(r, [{ id: "c", grund: "gestartet" }]);
    const d = n.gerufen.find((g) => g.method === "POST");
    assert.deepEqual(JSON.parse(d.body), { ref: "main", inputs: { teil: "x", zeitplan: "20 6 * * *" } });
    assert.match(n.gerufen[0].url, /created=%3E%3D2026-11-09T06%3A20%3A00Z/);
  } finally { n.zurueck(); }
  n = netz([{ enthaelt: "c.yml/runs", json: { workflow_runs: [{ display_title: "C " + marke("20 6 * * *") }] } }]);
  try {
    assert.deepEqual(await takte(ENV, {}, REG_T, T("2026-11-09T06:25:00Z")), [{ id: "c", grund: "laeuft" }]);
    assert.ok(!n.gerufen.some((g) => g.method === "POST"), "kein Doppelstart");
  } finally { n.zurueck(); }
  n = netz([{ enthaelt: "c.yml/runs", json: { workflow_runs: [{ display_title: "C · Takt 9 9 * * *" }] } }, { enthaelt: "c.yml/dispatches", json: {} }]);
  try { assert.deepEqual(await takte(ENV, {}, REG_T, T("2026-11-09T06:30:00Z")), [{ id: "c", grund: "nachgeholt" }]); }
  finally { n.zurueck(); }
  n = netz([{ enthaelt: "c.yml/runs", ok: false, status: 502 }, { enthaelt: "c.yml/dispatches", json: {} }]);
  try {
    assert.deepEqual(await takte(ENV, {}, REG_T, T("2026-11-09T06:35:00Z")), [{ id: "c", grund: "lageUnbekannt" }]);
    assert.ok(!n.gerufen.some((g) => g.method === "POST"));
    assert.deepEqual(await takte(ENV, {}, REG_T, T("2026-11-09T06:20:00Z")), [{ id: "c", grund: "gestartet" }], "zur Terminminute wird trotzdem gestartet");
  } finally { n.zurueck(); }
});

test("SZ-7 · der Wecker tickt jede Minute und liest dieses Register", () => {
  const toml = readFileSync(join(ROOT, "worker-waker/wrangler.toml"), "utf8");
  assert.match(toml, /crons = \["\* \* \* \* \*"\]/);
  const src = readFileSync(join(ROOT, "worker-waker/src/zeitplan.mjs"), "utf8");
  assert.match(src, /core\/registry\/schedule\.json/);
  assert.match(readFileSync(join(ROOT, "worker-waker/src/index.mjs"), "utf8"), /zeitgeber\(env, tick\)/);
});

test("SZ-8 · ohne faelligen Termin fragt der Wecker GitHub nicht einmal nach einem Token", async () => {
  const { zeitgeber } = await import("../../worker-waker/src/index.mjs");
  const n = netz([{ enthaelt: "raw.githubusercontent.com/o/r/main/core/registry/schedule.json", status: 200, json: REG_T }]);
  const log = console.log; console.log = () => {};
  try {
    const r = await zeitgeber(ENV, T("2026-11-09T10:18:00Z"));
    assert.equal(r.grund, "nichtsFaellig");
    assert.equal(n.gerufen.length, 1);
  } finally { n.zurueck(); console.log = log; }
  const m = netz([{ enthaelt: "raw.githubusercontent.com", ok: false, status: 404 }]);
  console.log = () => {};
  try { assert.equal((await zeitgeber(ENV, T("2026-11-09T10:17:00Z"))).grund, "registerHttp404"); }
  finally { m.zurueck(); console.log = log; }
});

test("SZ-9 · direkt im Wecker getaktete Workflows stehen im Wecker und haben keinen eigenen Zeitplan im Register", () => {
  const src = readFileSync(join(ROOT, "worker-waker/src/index.mjs"), "utf8");
  for (const d of REG.direktImWecker || []) {
    assert.ok(existsSync(join(ROOT, ".github/workflows", d.workflow)), d.workflow);
    assert.ok(src.includes('"' + d.workflow + '"'), d.workflow + " fehlt im Wecker");
    assert.deepEqual(workflowCrons(wf(d.workflow)), [], d.workflow + ": kein GitHub-Cron neben dem Wecker");
  }
});

test("SZ-10 · der Wecker-Dispatch passt zu den Eingaengen des Workflows (sonst lehnt GitHub mit 422 ab)", () => {
  for (const e of REG.entries.filter((x) => x.timer === "waker")) {
    const inp = dispatchInputs(wf(e.workflow));
    assert.ok(inp && inp.zeitplan, e.id + ": Eingang zeitplan fehlt");
    for (const [k, v] of Object.entries(e.inputs || {})) {
      assert.ok(inp[k], e.id + ": Eingang " + k + " gibt es im Workflow nicht");
      if (inp[k].options) assert.ok(inp[k].options.includes(String(v)), e.id + ": " + k + "=" + v + " ist keine Option (" + inp[k].options.join(", ") + ")");
      if (inp[k].type === "boolean") assert.equal(typeof v, "boolean", e.id + ": " + k + " ist boolean");
    }
    for (const [k, v] of Object.entries(inp)) {
      if (v.required && !v.hasDefault) assert.ok(e.inputs && k in e.inputs, e.id + ": Pflichteingang " + k + " ohne Standardwert muss im Register stehen");
    }
  }
});

test("SZ-11 · dispatchInputs liest Block- und Fluss-Form", () => {
  const t = "on:\n  workflow_dispatch:\n    inputs:\n      teil:\n        type: choice\n        required: true\n        options:\n          - a-b\n          - c\n      zahl: {description: 'x', default: '2'}\n      zeitplan:\n        type: string\n        default: ''\n  push:\n";
  assert.deepEqual(dispatchInputs(t), {
    teil: { required: true, hasDefault: false, type: "choice", options: ["a-b", "c"] },
    zahl: { required: false, hasDefault: true, type: "string", options: null },
    zeitplan: { required: false, hasDefault: true, type: "string", options: null } });
});
