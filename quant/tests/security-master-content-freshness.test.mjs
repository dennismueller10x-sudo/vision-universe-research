// Migrationsschritte 2 und 3 (docs/SECURITY_MASTER_CONTENT_HASH.md): Materialisierung schreibt masterContentHash und
// masterContentAlgorithm in neue Snapshots; Freshness meldet SECURITY_MASTER_UNCHANGED_CONTENT nur bei abweichendem
// Bytes-Hash und exakt gleichem Fingerabdruck mit exakt diesem Algorithmus. Sonst gilt die heutige Byte-Regel.
// Der Leser behandelt den neuen Zustand weiter als nicht aktuell (Schritt 4 ist nicht Teil dieser Änderung).
// Alle Schreibzugriffe nur in mkdtemp-Ordnern.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = resolve(import.meta.dirname, "..", "..");
const H = require("../engines/security-master-content-hash.js");
const A = require("../engines/weekly-real-adapter.cjs");
const F = require("../../server/quant-backtest-freshness.cjs");
const MASTER = "quant/data/market/security-master/us-security-master.json";
const BYTES = fs.readFileSync(join(ROOT, MASTER), "utf8");
const CONTENT = H.contentHash(JSON.parse(BYTES));
const GEN_AT = /"generatedAt": "[^"]+"/;
const onlyGeneratedAt = (bytes) => { assert.match(bytes, GEN_AT); return bytes.replace(GEN_AT, '"generatedAt": "2026-10-30T00:00:00.000Z"'); };
const mutateNvda = (f) => { const m = JSON.parse(BYTES), r = m.rows.find((x) => x.baseline_security_id === "ref_NVDA"); f(r, m); return JSON.stringify(m, null, 2); };

test("MCF-0 · Golden Case: Fingerabdruck des committeten Stamms 1.1.0 (nur wenn die Bytes unverändert sind)", (t) => {
  if (A.hash(BYTES) !== "26c82617913ab0dcbd08d24c80eb818134ccced74cc01e9eac819b4635498332") return t.skip("Stamm seit dem Entwurf geändert");
  assert.equal(CONTENT, "cf5fbebf0a0e88fbec53dc76637eda4ff8f83dd4f64393e3e3274fcffc29fb20");
});

// ---- Freshness-Einheit auf dem committeten Stamm --------------------------------------------------------------
const dir = fs.mkdtempSync(join(tmpdir(), "vu-mcf-"));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
let unit = 0;
async function freshness(extra, currentMaster) {
  const root = join(dir, "unit-" + (unit++)), gens = join(root, "..", "gens-" + unit);
  const put = (p, s) => { fs.mkdirSync(dirname(join(root, p)), { recursive: true }); fs.writeFileSync(join(root, p), s); return A.hash(s); };
  const id = "ref_NVDA", sourceHash = put(`quant/data/market/discover-series-long/${id}.json`, JSON.stringify({ points: [] }));
  const ev = "quant/engines/research-classification-evidence.cjs", evHash = put(ev, fs.readFileSync(join(ROOT, ev), "utf8"));
  const modelText = fs.readFileSync(join(ROOT, "scripts/quant/contracts/weekly-execution-model-v2.json"), "utf8"); put("scripts/quant/contracts/weekly-execution-model-v2.json", modelText);
  const masterHash = put(MASTER, BYTES);
  const input = { sources: [{ securityId: id, sourceHash }], masterHash, codes: { [ev]: evHash }, benchmarkInputs: {}, productShardHashes: {}, model: JSON.parse(modelText), ...extra };
  const generation = A.hash(input); fs.mkdirSync(join(gens, generation), { recursive: true });
  fs.writeFileSync(join(gens, generation, "snapshot.json"), JSON.stringify({ generation, input }));
  const check = F.create({ root, directory: gens, clock: () => Date.parse("2026-10-30T00:00:00Z") });
  const call = () => check({ generation, identity: { sourceSecurityId: id }, asOf: "2026-10-23" });
  const before = await call();
  put(MASTER, currentMaster);
  const after = await call();
  fs.rmSync(root, { recursive: true, force: true });
  return { before, after, gens, generation, input, call };
}
const WITH = { masterContentHash: CONTENT, masterContentAlgorithm: H.ALGORITHM };

test("MCF-1 · alter Snapshot ohne Fingerabdruck: nur generatedAt neu → SECURITY_MASTER (wie heute)", async () => {
  const r = await freshness({}, onlyGeneratedAt(BYTES));
  assert.deepEqual(r.before.changedDependencies, []);
  assert.equal(r.after.state, "STALE_INPUT_SNAPSHOT"); assert.deepEqual(r.after.changedDependencies, ["SECURITY_MASTER"]);
});

test("MCF-2 · Snapshot mit Fingerabdruck: nur generatedAt neu → SECURITY_MASTER_UNCHANGED_CONTENT (weiter STALE)", async () => {
  const r = await freshness(WITH, onlyGeneratedAt(BYTES));
  assert.equal(r.before.state, "CURRENT_INPUT_SNAPSHOT"); assert.deepEqual(r.before.changedDependencies, []);
  assert.equal(r.after.state, "STALE_INPUT_SNAPSHOT"); assert.deepEqual(r.after.changedDependencies, ["SECURITY_MASTER_UNCHANGED_CONTENT"]);
  // auch Zeilen-Zeitstempel und Zähler sind flüchtig
  const v = JSON.parse(BYTES); for (const row of v.rows) row.last_seen_at = "2026-10-30T00:00:00.000Z"; v.counts = {};
  assert.deepEqual((await freshness(WITH, JSON.stringify(v))).after.changedDependencies, ["SECURITY_MASTER_UNCHANGED_CONTENT"]);
});

test("MCF-3 · Inhaltsänderung (instrument_type, eligible, Doppelung, Version) → SECURITY_MASTER", async () => {
  for (const [name, f] of [
    ["instrument_type", (r) => { r.instrument_type = "PREFERRED"; }], ["eligible_us_equity", (r) => { r.eligible_us_equity = !r.eligible_us_equity; }],
    ["Doppelung", (r, m) => { m.rows.push({ ...r }); }], ["Version", (r, m) => { m.version = "us-security-master-1.3.0"; }],
  ]) assert.deepEqual((await freshness(WITH, mutateNvda(f))).after.changedDependencies, ["SECURITY_MASTER"], name);
});

test("MCF-4 · manipulierter oder unvollständiger Fingerabdruck im Snapshot → SECURITY_MASTER", async () => {
  const bad = CONTENT.slice(0, -1) + (CONTENT.endsWith("0") ? "1" : "0");
  for (const [name, extra] of [
    ["anderer Hash", { ...WITH, masterContentHash: bad }], ["kein Hex", { ...WITH, masterContentHash: "x".repeat(64) }],
    ["Großbuchstaben", { ...WITH, masterContentHash: CONTENT.toUpperCase() }], ["Hash fehlt", { masterContentAlgorithm: H.ALGORITHM }],
    ["Hash kein String", { ...WITH, masterContentHash: 1 }],
  ]) assert.deepEqual((await freshness(extra, onlyGeneratedAt(BYTES))).after.changedDependencies, ["SECURITY_MASTER"], name);
  // nachträglich im Snapshot geändert, ohne neue Generation: ungültiger Snapshot wie heute
  const r = await freshness(WITH, onlyGeneratedAt(BYTES)), file = join(r.gens, r.generation, "snapshot.json"), s = JSON.parse(fs.readFileSync(file));
  s.input.masterContentHash = bad; fs.writeFileSync(file, JSON.stringify(s));
  const fresh = F.create({ root: join(dir, "unused"), directory: r.gens });
  await assert.rejects(fresh({ generation: r.generation, identity: { sourceSecurityId: "ref_NVDA" }, asOf: "2026-10-23" }), /INVALID_SNAPSHOT/);
});

test("MCF-5 · falscher oder fehlender Algorithmus → SECURITY_MASTER", async () => {
  for (const alg of ["us-security-master-backtest-content-2", "US-SECURITY-MASTER-BACKTEST-CONTENT-1", "", null, undefined])
    assert.deepEqual((await freshness({ masterContentHash: CONTENT, masterContentAlgorithm: alg }, onlyGeneratedAt(BYTES))).after.changedDependencies, ["SECURITY_MASTER"], String(alg));
});

test("MCF-6 · aktueller Stamm nicht hashbar (Feld fehlt, kaputtes JSON) → SECURITY_MASTER", async () => {
  assert.deepEqual((await freshness(WITH, mutateNvda((r) => { delete r.instrument_type; }))).after.changedDependencies, ["SECURITY_MASTER"]);
  assert.deepEqual((await freshness(WITH, BYTES.slice(0, -10))).after.changedDependencies, ["SECURITY_MASTER"]);
});

// ---- Ende-zu-Ende: Materialisierung und Leser auf einer Kopie (nur tmp) ---------------------------------------
const fixture = join(dir, "source"), output = join(dir, "private"), ids = ["ref_NVDA"];
const copy = (p) => { const to = join(fixture, p); fs.mkdirSync(dirname(to), { recursive: true }); fs.cpSync(join(ROOT, p), to, { recursive: true }); };
for (const p of ["quant/engines", "quant/api", "quant/methodology", "quant/data/universe/instruments", MASTER, "quant/data/market/multi-asset/series/SPY.json", "quant/data/market/multi-asset/instruments.json", "quant/data/market/discover-series/ref_SPY.json", "scripts/quant/materialize-real-backtest-read.cjs", "scripts/quant/run-real-weekly-backtest.cjs", "scripts/quant/contracts/weekly-execution-model-v2.json", "quant/config/development-preview.json", "quant/config/feature-gates.json"]) copy(p);
for (const id of ids) copy("quant/data/market/discover-series-long/" + id + ".json");

test("MCF-7 · Materialisierung schreibt beide Felder; masterHash und calculationKey bleiben an die Bytes gebunden", () => {
  const { materialize } = require("../../scripts/quant/materialize-real-backtest-read.cjs");
  const report = materialize({ root: fixture, output, ids });
  assert.equal(report.state, "COMPLETE");
  const snap = JSON.parse(fs.readFileSync(join(output, report.generation, "snapshot.json"))), input = snap.input;
  assert.equal(A.hash(input), report.generation);
  assert.equal(input.masterContentAlgorithm, "us-security-master-backtest-content-1");
  assert.equal(input.masterContentHash, CONTENT);
  assert.equal(input.masterHash, A.hash(BYTES)); assert.equal(input.masterHash, A.createLoader(fixture).masterHash);
  // genau zwei neue Schlüssel; alles andere wie bisher
  assert.deepEqual(Object.keys(input).sort(), ["benchmark", "benchmarkInputs", "calculationRuntime", "codes", "masterContentAlgorithm", "masterContentHash", "masterHash", "model", "productShardHashes", "schemaVersion", "sources"]);
  assert.equal(Object.keys(input.codes).some((p) => p.includes("security-master-content-hash")), false, "Modul ist keine Rechen-Abhängigkeit");
  // calculationKey per Konstruktion: dieselbe Formel ohne die neuen Felder trifft den Cache-Eintrag
  const s = JSON.parse(fs.readFileSync(join(output, report.generation, "listings/ref_NVDA/summary.json")));
  const key = A.hash({ calculationRuntime: input.calculationRuntime, id: "ref_NVDA", sourceHash: input.sources[0].sourceHash, masterHash: input.masterHash, productIdentity: s.identity.productIdentity, model: input.model, codes: input.codes, benchmarkInputs: input.benchmarkInputs });
  assert.deepEqual(fs.readdirSync(join(output, ".calculation-cache")), [key + ".json.gz"]);
  assert.equal(s.periods.MAX.source.masterHash, input.masterHash);
});

test("MCF-8 · Leser unverändert: SECURITY_MASTER_UNCHANGED_CONTENT wird weiter als Neuaufbau zurückgehalten", async () => {
  const Reader = require("../../server/quant-backtest-reader.cjs");
  const reader = Reader.create({ directory: output, root: fixture, enabled: true, audience: "INTERNAL_REVIEW", allowedTickers: ["NVDA"] });
  const ok = await reader.getRealBacktest("NVDA");
  assert.equal(ok.delivery.state, "CURRENT_INPUT_SNAPSHOT"); assert.deepEqual(ok.delivery.changedDependencies, []);
  const file = join(fixture, MASTER), check = F.create({ root: fixture, directory: output });
  const probe = () => check({ generation: ok.generation, identity: { sourceSecurityId: "ref_NVDA" }, asOf: ok.asOf });
  try {
    fs.writeFileSync(file, onlyGeneratedAt(BYTES));
    assert.deepEqual((await probe()).changedDependencies, ["SECURITY_MASTER_UNCHANGED_CONTENT"]);
    const held = await reader.getRealBacktest("NVDA");
    assert.equal(held.state, "UNAVAILABLE"); assert.equal(held.reason, "BACKTEST_IDENTITY_CHANGED_REBUILD_REQUIRED"); assert.equal(held.result, undefined);
    fs.writeFileSync(file, mutateNvda((r) => { r.instrument_type = "PREFERRED"; }));
    assert.deepEqual((await probe()).changedDependencies, ["SECURITY_MASTER"]);
    assert.equal((await reader.getRealBacktest("NVDA")).reason, "BACKTEST_IDENTITY_CHANGED_REBUILD_REQUIRED");
  } finally { fs.writeFileSync(file, BYTES); }
  assert.equal((await reader.getRealBacktest("NVDA")).delivery.state, "CURRENT_INPUT_SNAPSHOT");
});
