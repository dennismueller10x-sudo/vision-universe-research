// Wiederverwendete Kuerzel (quant/config/ticker-reuse-quarantine.json, #1206) in den Quant-Erzeugern:
// Verzeichnis ohne Namen der alten Gesellschaft, keine Faktorzeile, kein Radar-Ereignis. Schreibt nur nach tmp.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { loadTickerReuseQuarantine } from "../../scripts/market/universe-source.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p) => readFileSync(join(ROOT, p), "utf8");

test("TRC-1 · Faktor-Evidenz und Radar lesen das Register und schliessen markierte Titel aus", () => {
  const fe = src("scripts/quant/build-factor-evidence.mjs");
  assert.match(fe, /identityStatus !== "IDENTITY_QUARANTINED"/);
  assert.match(fe, /identityQuarantined: identityQuarantined\.length/);
  const rd = src("scripts/quant/build-quant-radar.mjs");
  assert.match(rd, /loadTickerReuseQuarantine\(ROOT\)/);
  assert.match(rd, /if \(REUSE\.has\(e\.ticker\)\) \{ reuseSkipped\+\+; return; \}/, "kein Ereignis, auch nicht im Methodenvergleich");
  assert.match(rd, /\|\| REUSE\.has\(t\)\) continue;/, "keine Historie je Aktie");
  assert.match(rd, /RADAR_EVENTS_SUPPRESSED_TICKER_REUSE: reuseSkipped/);
});

test("TRC-2 · Verzeichnis: alte Gesellschaft ohne Namen, Konflikt TICKER_REUSE, keine Faktoren; ETF-Namen bleiben; sonst nichts geaendert", () => {
  const tmp = mkdtempSync(join(tmpdir(), "trc-"));
  try {
    const out = join(tmp, "ul.json.gz");
    execFileSync(process.execPath, [join(ROOT, "scripts/quant/build-universe-list.mjs"), "--out", out], { cwd: ROOT, stdio: "ignore" });
    const doc = JSON.parse(gunzipSync(readFileSync(out)).toString("utf8")), by = new Map(doc.entries.map((e) => [e.s, e]));
    const reg = loadTickerReuseQuarantine(ROOT);
    assert.equal(reg.records.size, 13);
    let flagged = 0;
    for (const r of reg.records.values()) {
      const e = by.get(r.ticker); if (!e) continue;
      if (e.t === "ETF") { assert.equal(e.ic, undefined, r.ticker); assert.equal(e.ne, 1, r.ticker); continue; }
      flagged++;
      assert.equal(e.n, undefined, r.ticker + ": kein Name der alten Gesellschaft");
      assert.equal(e.ic, "TICKER_REUSE", r.ticker); assert.equal(e.ne, 1, r.ticker);
    }
    assert.ok(flagged >= 1); assert.equal(doc.coverage.tickerReuseQuarantined, flagged);
    for (const t of ["NVDA", "MSFT", "EDVA"]) { assert.ok(by.get(t).n, t); assert.equal(by.get(t).ic === "TICKER_REUSE", false, t); }
    assert.equal(doc.entries.filter((e) => e.ic === "TICKER_REUSE").length, flagged);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
