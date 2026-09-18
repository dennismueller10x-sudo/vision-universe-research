/* =========================================================================
   DAS REGISTER MUSS AUCH DANN ETWAS SAGEN, WENN ES LEER IST

   Lauf 35366297664 war vollstaendig gruen - 64 Minuten Abruf, Faktoren,
   Technical, Verifier, Discover, Capability-Matrix, Freshness, Waechter,
   Hygiene und die ganze Regressionssuite - und hat trotzdem nichts
   veroeffentlicht:

     fatal: pathspec 'quant/data/market/commercial/rejection-ledger.json'
            did not match any files

   Das Klassifikationsskript stieg ohne Arbeitsablage aus, bevor es den
   Bericht schrieb, und `git add` brach an der fehlenden Datei mit exit
   128 ab. Zwei Riegel dagegen: das Skript schreibt jetzt immer (hier
   geprueft), und der Workflow sammelt nur ein, was es gibt.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const skript = join(root, "scripts", "market", "classify-rejections.mjs");

function lauf(t, { checkpoint = null } = {}) {
  const ablage = mkdtempSync(join(tmpdir(), "vu-classify-"));
  t.after(() => rmSync(ablage, { recursive: true, force: true }));
  if (checkpoint) {
    mkdirSync(join(ablage, "cache", "tiingo"), { recursive: true });
    writeFileSync(join(ablage, "cache", "tiingo", "checkpoint-incremental.json"),
                  JSON.stringify(checkpoint));
  }
  const bericht = join(ablage, "ledger.json");
  const r = spawnSync(process.execPath,
    [skript, "--json", bericht, "--cache", join(ablage, "cache")],
    { encoding: "utf8", timeout: 20000 });
  return { r, bericht, ablage };
}

test("CR-1 · ohne Arbeitsablage entsteht trotzdem ein Bericht", (t) => {
  const { r, bericht } = lauf(t);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(existsSync(bericht), "der Bericht muss auch ohne Checkpoint geschrieben werden");
  const b = JSON.parse(readFileSync(bericht, "utf8"));
  assert.equal(b.checkpointsFound, 0);
  assert.deepEqual(b.totals, { before: 0, retryDue: 0, keptBlocked: 0, removed: 0 });
  assert.deepEqual(b.files, []);
});

test("CR-2 · mit Ablehnungen zaehlt der Bericht sie", (t) => {
  const alt = new Date(Date.now() - 40 * 86400000).toISOString();
  const { r, bericht } = lauf(t, {
    checkpoint: { runId: "incremental", done: [], failed: [], requests: 0,
                  rejected: { "SEC-1": { at: alt, codes: "too_few_bars" },
                              "SEC-2": { at: new Date().toISOString(), codes: "INVALID_OHLC" } } }
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const b = JSON.parse(readFileSync(bericht, "utf8"));
  assert.equal(b.checkpointsFound, 1);
  assert.equal(b.totals.before, 2, JSON.stringify(b.totals));
  assert.equal(b.applied, false, "ohne --apply wird nichts entfernt");
  assert.equal(b.totals.removed, 0);
});
