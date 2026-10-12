/* =========================================================================
   PIPELINE-ALARM (10/2026)

   AL1  rot ohne offenes Issue -> Label + Issue mit Lauf, Schritt, Tests
   AL2  rot mit offenem Issue derselben Quelle -> Kommentar, kein zweites Issue
   AL3  gruen -> offenes Issue wird kommentiert und geschlossen
   AL4  gruen, aber Gate C rot -> Beobachtungs-Issue, Hauptalarm geschlossen
   AL5  Workflows: Refresh und Freshness-Monitor rufen den Alarm immer auf
   Gegen einen lokalen Nachbau der GitHub-API, nicht gegen GitHub.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SCRIPT = join(ROOT, "scripts", "ci", "pipeline-alarm.mjs");

function mockApi(issues) {
  const calls = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const json = body ? JSON.parse(body) : null;
      calls.push({ method: req.method, url: req.url, json, auth: req.headers.authorization });
      const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
      if (req.method === "GET" && /\/actions\/runs\/\d+\/jobs/.test(req.url)) {
        return send(200, { jobs: [{ name: "refresh", conclusion: "failure",
          steps: [{ name: "Gate A: Code-Regression vor dem Abruf", conclusion: "failure" }, { name: "Set up job", conclusion: "success" }] }] });
      }
      if (req.method === "GET" && req.url.startsWith("/repos/o/r/issues")) return send(200, issues.filter((i) => i.state === "open"));
      if (req.method === "POST" && req.url === "/repos/o/r/labels") return send(422, {});
      if (req.method === "POST" && req.url === "/repos/o/r/issues") { const n = { number: 100 + issues.length, state: "open", ...json }; issues.push(n); return send(201, n); }
      const c = /\/repos\/o\/r\/issues\/(\d+)(\/comments)?$/.exec(req.url);
      if (c && req.method === "POST") return send(201, { id: 1 });
      if (c && req.method === "PATCH") { const i = issues.find((x) => x.number === Number(c[1])); if (i) Object.assign(i, json); return send(200, i || {}); }
      send(404, {});
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, calls, url: "http://127.0.0.1:" + server.address().port })));
}

function lauf(api, extra) {
  const dir = mkdtempSync(join(tmpdir(), "vu-alarm-"));
  const gates = join(dir, "gates");
  mkdirSync(gates, { recursive: true });
  for (const [name, inhalt] of Object.entries(extra.gates || {})) writeFileSync(join(gates, name), JSON.stringify(inhalt));
  const envVars = Object.assign({}, process.env, {
    GITHUB_TOKEN: "t", GITHUB_REPOSITORY: "o/r", GITHUB_RUN_ID: "42", GITHUB_SERVER_URL: "https://github.com",
    GITHUB_API_URL: api.url, ALARM_SOURCE: "market-data-refresh", GATE_DIR: gates, GITHUB_STEP_SUMMARY: ""
  }, extra.env);
  for (const k of Object.keys(envVars)) if (k.startsWith("RESULT_") && !(extra.env || {})[k]) delete envVars[k];
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [SCRIPT], { env: envVars });
    let out = "", err = "";
    p.stdout.on("data", (d) => { out += d; }); p.stderr.on("data", (d) => { err += d; });
    p.on("close", (code) => { rmSync(dir, { recursive: true, force: true }); resolve({ code, out, err }); });
  });
}

const GATE_A_ROT = { "gate-pre.json": { phase: "pre", class: "PRE_FETCH_CODE_REGRESSION", blocking: true, red: true, passed: 600, failed: 1,
  failures: [{ name: "rechnet die Faktoren", location: "quant/tests/tiingo.test.mjs:12" }] } };

test("AL1 · rot ohne offenes Issue: Label und Issue mit Lauf, Schritt und Test", async () => {
  const issues = [];
  const api = await mockApi(issues);
  try {
    const r = await lauf(api, { env: { RESULT_REFRESH: "failure", RESULT_MATERIALIZE: "skipped", RESULT_FRESHNESS: "skipped" }, gates: GATE_A_ROT });
    assert.equal(r.code, 0, r.err);
    assert.equal(issues.length, 1);
    assert.match(issues[0].title, /^\[market-data-refresh\] /);
    assert.deepEqual(issues[0].labels, ["pipeline-alarm"]);
    assert.match(issues[0].body, /actions\/runs\/42/);
    assert.match(issues[0].body, /refresh › Gate A: Code-Regression vor dem Abruf/);
    assert.match(issues[0].body, /rechnet die Faktoren \(`quant\/tests\/tiingo\.test\.mjs:12`\)/);
    assert.ok(api.calls.every((c) => c.auth === "Bearer t"));
  } finally { api.server.close(); }
});

test("AL2 · rot mit offenem Issue derselben Quelle: Kommentar statt zweitem Issue", async () => {
  const issues = [{ number: 7, state: "open", title: "[market-data-refresh] Datenlauf fehlgeschlagen" },
                  { number: 8, state: "open", title: "[freshness-monitor] Discover veraltet" }];
  const api = await mockApi(issues);
  try {
    const r = await lauf(api, { env: { RESULT_REFRESH: "failure" }, gates: GATE_A_ROT });
    assert.equal(r.code, 0, r.err);
    assert.equal(issues.length, 2);
    assert.ok(api.calls.some((c) => c.method === "POST" && c.url === "/repos/o/r/issues/7/comments" && /Gate A/.test(c.json.body)));
    assert.ok(!api.calls.some((c) => c.url === "/repos/o/r/issues/8/comments"));
  } finally { api.server.close(); }
});

test("AL3 · gruen: offenes Issue wird mit Verweis geschlossen", async () => {
  const issues = [{ number: 7, state: "open", title: "[market-data-refresh] Datenlauf fehlgeschlagen" }];
  const api = await mockApi(issues);
  try {
    const r = await lauf(api, { env: { RESULT_REFRESH: "success", RESULT_MATERIALIZE: "success", RESULT_FRESHNESS: "success" } });
    assert.equal(r.code, 0, r.err);
    assert.equal(issues[0].state, "closed");
    assert.ok(api.calls.some((c) => c.url === "/repos/o/r/issues/7/comments" && /Behoben: gruener Lauf .*runs\/42/.test(c.json.body)));
  } finally { api.server.close(); }
});

test("AL4 · gruen, Gate C rot: eigenes Beobachtungs-Issue, der Hauptalarm bleibt zu", async () => {
  const issues = [];
  const api = await mockApi(issues);
  try {
    const r = await lauf(api, { env: { RESULT_REFRESH: "success" }, gates: {
      "gate-observability.json": { phase: "observability", class: "NON_BLOCKING_OBSERVABILITY", blocking: false, red: true, passed: 3000, failed: 1,
        failures: [{ name: "zaehlt Ereignisse", location: "quant/tests/market-signal-contract.test.mjs:5" }] } } });
    assert.equal(r.code, 0, r.err);
    assert.equal(issues.length, 1);
    assert.match(issues[0].title, /^\[market-data-refresh · Beobachtung\]/);
    assert.match(issues[0].body, /nicht blockierend/);
  } finally { api.server.close(); }
});

test("AL5 · Refresh und Freshness-Monitor rufen den Alarm immer auf (always), mit Schreibrecht nur fuer Issues", () => {
  for (const [datei, quelle] of [["market-data-refresh.yml", "market-data-refresh"], ["freshness-monitor.yml", "freshness-monitor"]]) {
    const wf = readFileSync(join(ROOT, ".github", "workflows", datei), "utf8");
    const job = wf.slice(wf.indexOf("\n  alarm:"));
    assert.ok(job.length > 20, datei + " ohne alarm-Job");
    assert.match(job, /if: always\(\)/);
    assert.match(job, /issues: write/);
    assert.match(job, /contents: read/);
    assert.match(job, new RegExp("ALARM_SOURCE: " + quelle));
    assert.match(job, /node scripts\/ci\/pipeline-alarm\.mjs/);
  }
});
