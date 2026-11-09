// Wiederverwendete Kuerzel (quant/config/ticker-reuse-quarantine.json, #1206) in den Quant-Erzeugern:
// Verzeichnis ohne Namen der alten Gesellschaft, keine Faktorzeile, kein Radar-Ereignis. Schreibt nur nach tmp.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, cpSync } from "node:fs";
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

test("TRC-3 · Suchindex: alte Gesellschaft ohne Namen und nicht in den Namensscherben; ETF-Namen bleiben; alter Name nur als ia", () => {
  const tmp = mkdtempSync(join(tmpdir(), "trc-search-"));
  try {
    cpSync(join(ROOT, "quant/data/universe/instruments"), join(tmp, "instruments"), { recursive: true });
    execFileSync(process.execPath, [join(ROOT, "scripts/universe/build-universe-indexes.mjs"), "--out", tmp], { cwd: ROOT, stdio: "ignore" });
    const lies = (p) => JSON.parse(readFileSync(join(tmp, "search", p), "utf8"));
    const man = lies("manifest.json");
    const sym = new Map(), nameIds = new Set();
    for (const d of man.sym) for (const e of lies("sym/" + d.shard + ".json").entries) sym.set(e.s, e);
    for (const d of man.name) for (const e of lies("name/" + d.shard + ".json").entries) nameIds.add(e.i);
    const reg = loadTickerReuseQuarantine(ROOT);
    const withheld = [];
    for (const r of reg.records.values()) {
      const e = sym.get(r.ticker); if (!e) continue;
      if (e.t === "ETF") { assert.ok(e.n, r.ticker + ": ETF-Name bleibt"); assert.equal(e.ic, undefined, r.ticker); assert.ok(nameIds.has(e.i), r.ticker); continue; }
      withheld.push(r.ticker);
      assert.equal(e.n, null, r.ticker + ": kein Name der alten Gesellschaft");
      assert.equal(e.ic, "TICKER_REUSE", r.ticker);
      assert.ok(e.ia, r.ticker + ": alter Name nur als andere Quelle");
      assert.equal(nameIds.has(e.i), false, r.ticker + ": nicht ueber den alten Namen auffindbar");
    }
    assert.ok(withheld.includes("PCLN"));
    assert.equal(sym.get("PCLN").ia, "Priceline.com");
    assert.equal(man.totals.tickerReuseNameWithheld, withheld.length);
    assert.deepEqual(man.tickerReuse.nameWithheld, withheld.slice().sort());
    assert.equal(man.tickerReuse.sha256, reg.sha256);
    for (const t of ["NVDA", "MSFT", "EDVA", "BKNG"]) { assert.ok(sym.get(t).n, t); assert.equal(sym.get(t).ic, undefined, t); assert.ok(nameIds.has(sym.get(t).i), t); }
    assert.equal([...sym.values()].filter((e) => e.ic === "TICKER_REUSE").length, withheld.length);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test("TRC-4 · Verzeichnis liest den alten Namen aus ia des Suchindex, nie als Namen", () => {
  const ul = src("scripts/quant/build-universe-list.mjs");
  assert.match(ul, /eintrag\.ic === "TICKER_REUSE" && eintrag\.ia/);
  assert.match(ul, /const name = wiederverwendet \? null : namen\.get\(member\.s\) \|\| null;/);
});
