/* =========================================================================
   EMERGING LEADERS – Studienprogramm (scripts/quant/build-emerging-leaders-study.mjs)

   ELS1  Synthetischer Lauf: Ergebnis traegt SYNTHETIC und EXPERIMENTAL,
         nie einen Evidenzstatus aus kuenstlichen Daten
   ELS2  Nur Aggregate: keine Kursreihe, keine Titel-Kennung im Artefakt
   ELS3  Modellwahl stammt aus VALIDATION und erfuellt die Vorregistrierung
   ELS4  Purge: kein Stichtag einer gesperrten Periode, dessen Ausstieg
         hinter dem Periodenende liegt (Stichtagszahl je Horizont faellt)
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "el-study-"));
const out = join(dir, "study.json");
execFileSync(process.execPath, [join(ROOT, "scripts/quant/build-emerging-leaders-study.mjs"), "--synthetic", "260", "--out", out], { stdio: "pipe" });
const S = JSON.parse(readFileSync(out, "utf8"));
const PREREG = JSON.parse(readFileSync(join(ROOT, "quant/methodology/emerging-leaders-v1.json"), "utf8"));

test("ELS1 · synthetischer Lauf ist nie ein Befund", () => {
  assert.equal(S.status, "SYNTHETIC");
  assert.equal(S.evidenceStatus, "EXPERIMENTAL");
  assert.equal(S.gate.reason, "SYNTHETIC_RUN");
  assert.equal(S.methodologyVersion, PREREG.methodologyVersion);
  assert.match(S.methodologySha256, /^[0-9a-f]{64}$/);
});

test("ELS2 · nur Aggregate", () => {
  const text = JSON.stringify(S);
  assert.ok(!/"bars"|"points"|"closes?"\s*:\s*\[/.test(text), "keine Reihen");
  assert.ok(!/SYN:(MAIN|EARLY):\d+/.test(text), "keine Titel-Kennung");
  assert.equal(S.aggregatesOnly, true);
  assert.equal(S.noProbabilities, true);
});

test("ELS3 · Modellwahl nur aus VALIDATION nach der Regel", () => {
  assert.equal(S.selection.basedOn, "VALIDATION");
  const v = S.results.VALIDATION;
  const ok = S.selection.candidates.filter((c) => typeof c.icT === "number" && c.icT >= 2 && typeof c.net === "number");
  for (const c of S.selection.candidates) {
    assert.equal(c.net, v[c.model][63].meanExcessNet ? v[c.model][63].meanExcessNet.BASE : null, c.model);
  }
  if (ok.length) assert.equal(S.selection.chosen, ok.sort((a, b) => b.net - a.net)[0].model);
  else assert.equal(S.selection.chosen, null);
});

test("ELS4 · Purge verkuerzt die gesperrten Perioden je Horizont", () => {
  for (const p of ["DEVELOPMENT", "VALIDATION", "HOLDOUT_EARLY"]) {
    const n = [21, 63, 126, 252].map((h) => S.results[p].UNIVERSE[h].dates);
    for (let k = 1; k < n.length; k++) assert.ok(n[k] < n[k - 1], p + " " + n.join(","));
  }
});
