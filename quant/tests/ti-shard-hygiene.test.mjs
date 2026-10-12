/* Shard-Hygiene: ein aus dem Produkt gefallener Titel darf keine Shard-Datei zuruecklassen. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { staleShardFiles, pruneStaleShards, auditShards } from "../../scripts/technical/lib/ti-shards.mjs";

const require = createRequire(import.meta.url);
const Materialization = require("../engines/technical/product-materialization.js");   // dieselbe Schluesselregel wie Build und Client
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const gz = (p, o) => writeFileSync(p, gzipSync(Buffer.from(JSON.stringify(o))));

function fixture(shards, indexSymbols) {
  const dir = mkdtempSync(join(tmpdir(), "ti-shards-")); mkdirSync(join(dir, "shards"));
  Object.entries(shards).forEach(([k, syms]) => gz(join(dir, "shards", k + ".json.gz"), { shard: k, instruments: Object.fromEntries(syms.map((s) => [s, {}])) }));
  gz(join(dir, "index.json.gz"), { rows: indexSymbols.map((t) => ({ t })) });
  return dir;
}

test("S-1 · verwaiste Shard-Datei wird erkannt und nur sie entfernt", () => {
  const dir = fixture({ AA: ["AAPL"], UZ: ["UZD", "UZE"] }, ["AAPL"]);
  assert.deepEqual(staleShardFiles(dir, ["AA"]), ["UZ.json.gz"]);
  assert.deepEqual(pruneStaleShards(dir, ["AA"]), ["UZ.json.gz"]);
  assert.ok(existsSync(join(dir, "shards", "AA.json.gz")) && !existsSync(join(dir, "shards", "UZ.json.gz")));
  rmSync(dir, { recursive: true });
});

test("S-2 · auditShards findet Dateien ohne Index-Titel und Titel ohne Index-Zeile", () => {
  const dir = fixture({ AA: ["AAPL", "AAXX"], UZ: ["UZD"] }, ["AAPL"]);
  const a = auditShards(dir, Materialization.shardKey);
  assert.deepEqual(a.orphanFiles, ["UZ.json.gz"]);
  assert.deepEqual(a.orphanSymbols.sort(), ["AA:AAXX", "UZ:UZD"]);
  rmSync(dir, { recursive: true });
});

test("S-3 · veroeffentlichte Produktdaten: keine verwaiste Shard-Datei, kein Titel ohne Index-Zeile", () => {
  const a = auditShards(join(ROOT, "quant/data/technical-intelligence/v3"), Materialization.shardKey);
  assert.deepEqual(a.orphanFiles, [], "verwaiste Shard-Dateien: " + a.orphanFiles.join(", "));
  assert.deepEqual(a.orphanSymbols, [], "Titel im Shard ohne Index-Zeile: " + a.orphanSymbols.join(", "));
});
