import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("DH1 · Oeffentliche Pfade enthalten keine ungeklärten Provider-Rohbars", () => {
  const result = spawnSync(process.execPath, [join(root, "scripts", "market", "assert-public-data-hygiene.mjs")], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /no commercial-provider raw bars/i);
});

test("DH2 · Provider-Abrufe schreiben standardmaessig nur in die private Arbeitsablage", () => {
  const source = join(root, "scripts", "market", "fetch-market-data.mjs");
  const result = spawnSync(process.execPath, [source], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Mock-Modus/);
  assert.doesNotMatch(result.stdout, /quant[\\/]data[\\/]market[\\/]status\.json/);
});
