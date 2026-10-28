// Vorschlag masterContentHash (Entwurf, nicht verdrahtet): Golden Cases, Gegenproben und die Festschreibung der
// bestehenden masterHash-Semantik (ganze Datei), die dieser Entwurf ausdrücklich NICHT ändert.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import crypto from "node:crypto";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const C = require("../engines/security-master-content-hash.js");
const A = require("../engines/weekly-real-adapter.cjs");
const MASTER = "quant/data/market/security-master/us-security-master.json";
const bytes = readFileSync(join(ROOT, MASTER), "utf8"), master = () => JSON.parse(bytes);
const BYTES_1_1_0 = "26c82617913ab0dcbd08d24c80eb818134ccced74cc01e9eac819b4635498332";

test("MCH-1 · Golden Case: committeter Stamm 1.1.0 (11.09.2026) hat den festgeschriebenen Inhalts-Fingerabdruck", (t) => {
  if (A.hash(bytes) !== BYTES_1_1_0) return t.skip("Stamm seit dem Entwurf geändert: Golden Case gilt für 26c82617…");
  assert.equal(C.contentHash(master()), "cf5fbebf0a0e88fbec53dc76637eda4ff8f83dd4f64393e3e3274fcffc29fb20");
  assert.equal(C.ALGORITHM, "us-security-master-backtest-content-1");
  assert.deepEqual([...C.FIELDS], ["baseline_security_id", "canonical_id", "ticker", "provider", "currency", "start_date", "active_status", "eligible_us_equity", "instrument_type", "source_provenance"]);
});

test("MCH-2 · gleich bei rein flüchtigen Änderungen: generatedAt, Zeilen-Zeitstempel, Zähler, Reihenfolge, nicht gebundene Felder", () => {
  const base = C.contentHash(master());
  const g = master(); g.generatedAt = "2026-10-28T00:00:00.000Z"; g.today = "2026-10-28";
  assert.equal(C.contentHash(g), base); assert.notEqual(A.hash(JSON.stringify(g, null, 2)), A.hash(bytes), "masterHash wechselt dabei weiter");
  const v = master(); for (const r of v.rows) { r.first_seen_at = r.last_seen_at = "2026-10-28T00:00:00.000Z"; r.listing_status = "x"; r.end_date = "2026-10-27"; r.security_name = "egal"; } v.counts = {}; v.rows.reverse();
  assert.equal(C.contentHash(v), base);
});

test("MCH-3 · ändert sich bei jeder Identitäts- oder Klassenänderung, Doppelung und Versionswechsel", () => {
  const base = C.contentHash(master()), k = master().rows.findIndex((r) => r.baseline_security_id === "ref_NVDA");
  const mut = (f) => { const m = master(); f(m, m.rows[k]); return C.contentHash(m); };
  for (const [name, f] of [
    ["instrument_type", (m, r) => { r.instrument_type = "PREFERRED"; }], ["eligible_us_equity", (m, r) => { r.eligible_us_equity = !r.eligible_us_equity; }],
    ["active_status", (m, r) => { r.active_status = "INACTIVE"; }], ["canonical_id", (m, r) => { r.canonical_id += "x"; }], ["ticker", (m, r) => { r.ticker += "X"; }],
    ["start_date", (m, r) => { r.start_date = "1990-01-01"; }], ["currency", (m, r) => { r.currency = "eur"; }], ["provider", (m, r) => { r.provider = "x"; }],
    ["source_provenance", (m, r) => { r.source_provenance = "BASELINE_ONLY"; }], ["baseline_security_id", (m, r) => { r.baseline_security_id = null; }],
    ["Doppelung", (m, r) => { m.rows.push({ ...r }); }], ["Zeile fehlt", (m) => { m.rows.splice(k, 1); }], ["Version", (m) => { m.version = "us-security-master-1.3.0"; }],
  ]) assert.notEqual(mut(f), base, name);
});

test("MCH-4 · fail closed: fehlende Felder, falsche Typen, kein Stamm", () => {
  const k = 0;
  for (const [code, f] of [
    [/UNHASHABLE/, (m) => { delete m.version; }], [/UNHASHABLE/, (m) => { m.rows = null; }], [/ROW_INVALID/, (m) => { m.rows[k] = null; }],
    [/FIELD_MISSING:instrument_type/, (m) => { delete m.rows[k].instrument_type; }],
    [/FIELD_TYPE:eligible_us_equity/, (m) => { m.rows[k].eligible_us_equity = "true"; }], [/FIELD_TYPE:ticker/, (m) => { m.rows[k].ticker = null; }],
  ]) { const m = master(); f(m); assert.throws(() => C.contentHash(m), code); }
  assert.throws(() => C.contentHash(null), /UNHASHABLE/);
});

test("MCH-5 · bestehender Vertrag unverändert: masterHash = SHA-256 der ganzen Datei (Adapter, Loader)", () => {
  assert.equal(A.createLoader(ROOT).masterHash, crypto.createHash("sha256").update(bytes).digest("hex"));
  assert.equal(A.createLoader(ROOT).masterHash, A.hash(bytes));
  // der Entwurf ist nirgends verdrahtet: kein Verbraucher lädt das Modul
  const users = ["quant/engines/weekly-real-adapter.cjs", "server/quant-backtest-freshness.cjs", "server/quant-backtest-reader.cjs", "scripts/quant/materialize-real-backtest-read.cjs"]
    .filter((p) => readFileSync(join(ROOT, p), "utf8").includes("security-master-content-hash"));
  assert.deepEqual(users, []);
});

test("MCH-6 · Festschreibung heute: Freshness meldet SECURITY_MASTER schon bei einem reinen generatedAt-Wechsel (Byte-Semantik)", async () => {
  const F = require("../../server/quant-backtest-freshness.cjs");
  const root = mkdtempSync(join(tmpdir(), "mch-")), dir = join(root, "gen");
  try {
    const put = (p, s) => { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), s); return A.hash(s); };
    const id = "ref_AAA", m = { version: "us-security-master-1.1.0", generatedAt: "2026-09-11T00:00:00Z", rows: [{ baseline_security_id: id, ticker: "AAA" }] };
    const sourceHash = put(`quant/data/market/discover-series-long/${id}.json`, JSON.stringify({ points: [] }));
    const masterHash = put(MASTER, JSON.stringify(m));
    const ev = "quant/engines/research-classification-evidence.cjs", evHash = put(ev, readFileSync(join(ROOT, ev), "utf8"));
    const modelText = readFileSync(join(ROOT, "scripts/quant/contracts/weekly-execution-model-v2.json"), "utf8"); put("scripts/quant/contracts/weekly-execution-model-v2.json", modelText);
    const input = { sources: [{ securityId: id, sourceHash }], masterHash, codes: { [ev]: evHash }, benchmarkInputs: {}, productShardHashes: {}, model: JSON.parse(modelText) };
    const generation = A.hash(input); mkdirSync(join(dir, generation), { recursive: true }); writeFileSync(join(dir, generation, "snapshot.json"), JSON.stringify({ generation, input }));
    const check = () => F.create({ root, directory: dir, clock: () => Date.parse("2026-10-28T00:00:00Z") })({ generation, identity: { sourceSecurityId: id }, asOf: "2026-10-23" });
    assert.deepEqual((await check()).changedDependencies, []);
    put(MASTER, JSON.stringify({ ...m, generatedAt: "2026-10-28T00:00:00Z" }));
    const r = await check(); assert.equal(r.state, "STALE_INPUT_SNAPSHOT"); assert.deepEqual(r.changedDependencies, ["SECURITY_MASTER"]);
    // derselbe Inhalt laut Vorschlag (hier mit den Feldern, die der Fingerabdruck verlangt)
    const full = (g) => ({ version: m.version, generatedAt: g, rows: [Object.fromEntries(C.FIELDS.map((f) => [f, f === "eligible_us_equity" ? true : f === "baseline_security_id" ? id : "x"]))] });
    assert.equal(C.contentHash(full("2026-09-11")), C.contentHash(full("2026-10-28")));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
