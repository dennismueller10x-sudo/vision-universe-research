/* Technical-Stand je Aktie (technical/engine/stock-summary.js, docs/technical/STOCK_SUMMARY.md): kleine Scherben fuer andere
   Produktwelten. Gebaut aus dem committeten Screener-Datensatz; jede Einordnung stimmt mit templates.js#checklist ueberein,
   die Scherbe ist core/identity.js#shardKey, keine Signal- oder Renditesprache. Schreibt nur in ein temporaeres Verzeichnis. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, writeFileSync, readdirSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const S = require(join(root, "technical/engine/stock-summary.js"));
const TPL = require(join(root, "technical/engine/templates.js"));
const AS = require(join(root, "technical/engine/assistant.js"));
const Q = require(join(root, "quant/engines/technical/technical-query.js"));
const PJ = require(join(root, "quant/engines/technical/price-jumps.js"));
const Identity = require(join(root, "core/identity.js"));
const artifact = JSON.parse(readFileSync(join(root, "technical/data/screener-v1.json"), "utf8"));
const meta = JSON.parse(readFileSync(join(root, "technical/data/meta.json"), "utf8"));
const built = S.build(artifact);
const ds = Q.createDataset(artifact);
const recOf = (t) => built.shards[Identity.shardKey(t)].stocks[t];

test("jede Aktie genau einmal, in ihrer Scherbe nach core/identity.js#shardKey", () => {
  const seen = new Set();
  for (const [key, shard] of Object.entries(built.shards)) {
    assert.deepEqual(S.check(shard, key), [], key);
    for (const t of Object.keys(shard.stocks)) { assert.ok(!seen.has(t), t); seen.add(t); assert.equal(Identity.shardKey(t), key, t); }
    assert.equal(shard.asOf, artifact.asOf);
  }
  assert.equal(seen.size, artifact.count);
  assert.equal(built.count, artifact.count);
  assert.equal(S.path("NVDA"), "/technical/data/stock/NV.json");
  assert.equal(S.path("F"), "/technical/data/stock/F_.json");
});

test("Groesse: jede Scherbe unter dem Budget, eine Aktie im Median unter 1,5 KB", () => {
  const per = [];
  for (const shard of Object.values(built.shards)) {
    assert.ok(JSON.stringify(shard).length <= S.SHARD_BUDGET, shard.shard + " " + JSON.stringify(shard).length);
    Object.values(shard.stocks).forEach((r) => per.push(JSON.stringify(r).length));
  }
  per.sort((a, b) => a - b);
  assert.ok(per[per.length >> 1] < 1500, "Median " + per[per.length >> 1]);
});

test("Vorlagen und Analyseziele: dieselbe Einordnung wie templates.js#checklist (Chart Studio)", () => {
  const goals = AS.list().map((g) => ({ id: g.id, t: AS.build(g.id, null) })).filter((g) => g.t);
  const step = Math.max(1, Math.floor(ds.size / 400));
  let compared = 0;
  for (let i = 0; i < ds.size; i += step) {
    const t = ds.cols.s[i], rec = recOf(t);
    for (const [list, defs] of [[rec.templates, TPL.list().map((x) => ({ id: x.id, t: x }))], [rec.goals, goals]]) {
      for (const d of defs) {
        const ck = TPL.checklist(ds, d.t, t), hit = list.find((x) => x.id === d.id);
        if (S.SHOWN.includes(ck.status)) {
          assert.ok(hit, t + "/" + d.id + " fehlt (" + ck.status + ")");
          assert.equal(hit.status, ck.status, t + "/" + d.id);
          assert.equal(hit.pass, ck.pass); assert.equal(hit.total, ck.states.length);
          assert.equal(hit.label, S.statusText(ck.status, ck.unknown));
        } else assert.equal(hit, undefined, t + "/" + d.id + " " + ck.status);
        compared++;
      }
    }
  }
  assert.ok(compared > 5000, String(compared));
});

test("Trend, Struktur und Formationen kommen unveraendert aus der Zeile", () => {
  const shard = built.shards.NV, rec = shard.stocks.NVDA, row = ds.row(ds.indexOf("NVDA"));
  assert.deepEqual(shard.labels.trend.map((x) => x.id), S.TREND);
  S.TREND.forEach((id, k) => assert.equal(rec.trend[k], row[id] === null ? null : row[id], id));
  assert.equal(rec.structure, row.structure);
  assert.equal(shard.labels.structures[rec.structure], Q.STRUCTURES[row.structure]);
  const daily = rec.formations.filter((f) => f.tf === "1D");
  assert.deepEqual(daily.map((f) => [f.type, f.state]), (row.formations || []).map((f) => [f[0], f[1]]));
  const weekly = rec.formations.filter((f) => f.tf === "1W").map((f) => f.type);
  assert.deepEqual(weekly, row["formationActive@1W"] || []);
  rec.formations.forEach((f) => assert.equal(shard.labels.formations[f.type], Q.FORMATION_TYPES[f.type]));
});

test("veraltete oder eingefrorene Aktien: keine Einordnung, Hinweis in dq", () => {
  let stale = 0;
  for (const shard of Object.values(built.shards)) for (const r of Object.values(shard.stocks)) {
    if (r.fresh) continue;
    stale++;
    assert.equal(r.templates.length + r.goals.length, 0, r.s);
    assert.ok(r.dq.some((d) => d.code === (r.frozenSince ? "FROZEN" : "BEHIND")), r.s);
  }
  assert.equal(stale, meta.counts.stale);
});

test("Kurssprung: Text aus price-jumps.js#describe, Ton nach Status", () => {
  const i = ds.cols.suspectJumpAt.findIndex((x) => !!x);
  assert.ok(i >= 0, "kein Kurssprung im Datensatz");
  const row = ds.row(i), d = recOf(row.s).dq.find((x) => /^PRICE_JUMP/.test(x.code));
  assert.ok(d, row.s);
  const want = PJ.describe({ date: row.suspectJumpAt, factor: row.suspectJumpFactor, status: row.suspectJumpStatus || "SUSPECT", splitSignature: PJ.splitSignature(row.suspectJumpFactor) }, (x) => x.slice(8, 10) + "." + x.slice(5, 7) + "." + x.slice(0, 4));
  assert.equal(d.short, want.short);
  assert.equal(d.tone, row.suspectJumpStatus === "CONFIRMED" ? "bad" : "warn");
});

test("keine Signal-, Empfehlungs- oder Renditesprache", () => {
  const BANNED = /Kaufsignal|Verkaufssignal|kaufen|verkaufen|Rendite|Gewinn|empfehl|garantiert/i;
  const shard = built.shards.IN;
  const texts = [].concat(Object.values(shard.labels.templates).map((x) => x.title), Object.values(shard.labels.goals).map((x) => x.title));
  for (const s of Object.values(built.shards)) for (const r of Object.values(s.stocks)) {
    r.formations.forEach((f) => texts.push(f.text, f.badge));
    r.templates.concat(r.goals).forEach((f) => texts.push(f.label));
  }
  texts.forEach((t) => assert.doesNotMatch(String(t), BANNED, t));
  assert.match(shard.limits, /kein Kauf- oder Verkaufssignal/);
});

test("Erzeuger: writeStockSummary schreibt nur stock/<XX>.json, raeumt alte Scherben, verweigert bei Verstoss", async () => {
  const { writeStockSummary } = await import(join(root, "scripts/technical/world/build-screener.mjs"));
  const out = mkdtempSync(join(tmpdir(), "tw-stock-"));
  try {
    mkdirSync(join(out, "stock"));
    writeFileSync(join(out, "stock", "_.json"), "{}");
    writeFileSync(join(out, "stock", "README.txt"), "bleibt");
    const r = writeStockSummary(out, artifact);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.keys.slice().sort(), Object.keys(built.shards).sort());
    assert.equal(r.stocks, artifact.count);
    const files = readdirSync(join(out, "stock"));
    assert.ok(!files.includes("_.json"), "alte Scherbe entfernt");
    assert.ok(files.includes("README.txt"));
    assert.equal(files.filter((f) => f.endsWith(".json")).length, Object.keys(built.shards).length);
    assert.deepEqual(JSON.parse(readFileSync(join(out, "stock", "NV.json"), "utf8")), JSON.parse(JSON.stringify(built.shards.NV)));
    /* Verstoss (falsche securityId): nichts geschrieben, nichts geloescht. */
    const bad = JSON.parse(JSON.stringify(artifact));
    bad.cols.sid[bad.cols.s.indexOf("NVDA")] = "ref_XXX";
    const out2 = mkdtempSync(join(tmpdir(), "tw-stock-bad-"));
    try {
      const r2 = writeStockSummary(out2, bad);
      assert.ok(r2.errors.some((e) => /SECURITY_ID NVDA/.test(e)), JSON.stringify(r2.errors.slice(0, 3)));
      assert.ok(!existsSync(join(out2, "stock")));
    } finally { rmSync(out2, { recursive: true, force: true }); }
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test("veroeffentlichte Scherben (nach dem naechsten Lauf) erfuellen den Vertrag und tragen den Stand von meta.json", () => {
  const dir = join(root, "technical/data/stock");
  if (!existsSync(dir)) return; /* erscheint mit dem naechsten Lauf von technical-world.yml */
  const files = readdirSync(dir).filter((f) => /^[A-Z0-9_]{1,2}\.json$/.test(f));
  assert.ok(files.length > 0);
  let stocks = 0;
  for (const f of files) {
    const shard = JSON.parse(readFileSync(join(dir, f), "utf8"));
    assert.deepEqual(S.check(shard, f.slice(0, -5)), [], f);
    assert.equal(shard.asOf, meta.asOf, f);
    stocks += Object.keys(shard.stocks).length;
  }
  assert.equal(stocks, meta.counts.rows);
  /* Leser fragen nur Scherben aus meta.stock.shards an. */
  assert.equal(meta.stock && meta.stock.schema, S.SCHEMA);
  assert.deepEqual([...meta.stock.shards].sort(), files.map((f) => f.slice(0, -5)).sort());
  assert.equal(meta.paths.stock, S.DIR + "<shardKey>.json");
});
