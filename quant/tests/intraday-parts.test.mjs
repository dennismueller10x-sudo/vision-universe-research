/* Teilcommits im Taktgeber (Steuerung 12.11.2026): ein Zyklus holt und veroeffentlicht in N disjunkten Teilen.
   Geprueft wird die Aufteilung selbst (Trockenlauf des Ingest, kein Abruf, kein Schreiben) und die Verdrahtung im Taktgeber. */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TICKER = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "JPM", "V", "XOM", "WMT"];

function teil(k, n) {
  const r = spawnSync(process.execPath, ["scripts/market/ingest-intraday.mjs", "--scope=" + TICKER.join(","), "--dry-run",
    "--part=" + k + "/" + n, "--now=2026-11-12T16:00:00Z"], { cwd: root, encoding: "utf8", env: { ...process.env, TIINGO_API_KEY: "test" } });
  return r;
}

test("IP-1 die Teile sind disjunkt und decken den Umfang genau ab", () => {
  const n = 3, groessen = [];
  for (let k = 1; k <= n; k++) {
    const r = teil(k, n);
    assert.equal(r.status, 0, r.stderr);
    const m = /Teil (\d+)\/(\d+): (\d+) von (\d+) Titeln/.exec(r.stdout);
    assert.ok(m, "Teil-Zeile fehlt: " + r.stdout.slice(0, 300));
    assert.equal(+m[4], TICKER.length);
    groessen.push(+m[3]);
  }
  assert.equal(groessen.reduce((a, b) => a + b, 0), TICKER.length);
  assert.ok(Math.max(...groessen) - Math.min(...groessen) <= 1, "gleichmaessig: " + groessen);
});

test("IP-2 ungueltige Teile werden abgewiesen", () => {
  for (const [k, n] of [[0, 3], [4, 3]]) assert.equal(teil(k, n).status, 1, k + "/" + n);
  const r = spawnSync(process.execPath, ["scripts/market/ingest-intraday.mjs", "--scope=AAPL", "--dry-run", "--part=x"], { cwd: root, encoding: "utf8", env: { ...process.env, TIINGO_API_KEY: "test" } });
  assert.equal(r.status, 1);
});

test("IP-3 der Taktgeber holt und veroeffentlicht je Teil, nur im Discover-Umfang, mit Rueckfall --parts=1", () => {
  const src = readFileSync(join(root, "scripts/market/run-pacemaker.mjs"), "utf8");
  assert.match(src, /arg\("parts", "3"\)/, "Standard: 3 Teile");
  assert.match(src, /SCOPE === "discover" \? PARTS : 1/, "nur der Discover-Umfang");
  assert.match(src, /"--part=" \+ teil \+ "\/" \+ TEILE/, "Teil an den Ingest");
  const schleife = src.slice(src.indexOf("for (let teil = 1"), src.indexOf("if (teileOk === 0)"));
  assert.match(schleife, /ingest-intraday\.mjs/);
  assert.match(schleife, /ledgerSchreiben\(/, "Register je Teil im selben Commit");
  assert.match(schleife, /veroeffentlichen\(ZYKLUS_PFADE/, "Commit und Push je Teil");
  const ws = readFileSync(join(root, ".github/workflows/intraday-pacemaker.yml"), "utf8");
  assert.ok(!/--parts=/.test(ws), "Standard gilt, solange der Workflow nichts anderes sagt");
});
