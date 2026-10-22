/* Core · Verfuegbarkeits-Manifest des Aktien-Navigators (scripts/core/stock-availability.mjs, VU3 Stufe 2.1). */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { writeAvailability, buildShards, AVAILABILITY_DIR, SHARD_BUDGET } from "../../scripts/core/stock-availability.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SC = require(join(ROOT, "core", "stock-context.js"));

test("Bestand · Manifest aus den veroeffentlichten Artefakten, nur in --out, im Budget", () => {
  const out = mkdtempSync(join(tmpdir(), "vu-avail-"));
  try {
    const r = writeAvailability({ root: ROOT, out });
    assert.deepEqual(r.skipped, {});
    assert.ok(r.counts.discover.US > 1000 && r.counts.discover.EUROPE > 100 && r.counts.quant.US > 1000 && r.counts.supertrader.US > 100 && r.counts.fundamental.US > 1000, JSON.stringify(r.counts));
    const files = readdirSync(out);
    assert.equal(files.length, r.shards);
    for (const f of files) assert.ok(readFileSync(join(out, f)).length <= SHARD_BUDGET, f);
    const state = (ctx) => {
      const doc = JSON.parse(readFileSync(join(out, SC.availabilityShard(ctx) + ".json"), "utf8"));
      assert.equal(doc.shard, SC.availabilityShard(ctx));
      return Object.fromEntries(SC.availability(ctx, doc).map((m) => [m.product, m.state]));
    };
    const nvda = state(SC.fromUs("NVDA"));
    assert.equal(nvda.discover, "available");
    assert.equal(nvda.quant, "available");
    assert.equal(nvda.fundamental, "available");
    /* Fundamental nur mit SEC-Zahlen in der Discover-Datei: ACU hat eine Discover-Seite, aber keine Fundamentaldaten. */
    const acu = state(SC.fromUs("ACU"));
    assert.deepEqual([acu.discover, acu.fundamental], ["available", "unavailable"]);
    const sapDe = state(SC.parse("/discover/#/s/EUROPE/ref_SAP_DE_XETR").ctx);
    assert.equal(sapDe.discover, "available");
    assert.equal(sapDe.quant, "unavailable");
    /* Supertrader nur mit Seite UND Daten: AAL hat eine Seite, aber keine Daten. */
    assert.equal(state(SC.fromUs("AAL")).supertrader, "unavailable");
    /* Ein Name je Aktie (VU3-Finalisierung): der Anzeigename des Security-Masters steht im Ausschnitt. */
    const master = JSON.parse(readFileSync(join(ROOT, "quant/data/market/security-master/company-names.json"), "utf8")).rows.find((x) => x.ticker === "PLTR");
    const pl = JSON.parse(readFileSync(join(out, SC.availabilityShard(SC.fromUs("PLTR")) + ".json"), "utf8"));
    assert.equal(pl.names.PLTR, master.displayName);
    assert.ok(r.named > 5000, "zu wenige Namen: " + r.named);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test("Regel · belegtes Modul mit leerer Liste ist 'unavailable', fehlende Quelle bleibt 'unknown'", () => {
  const shards = buildShards({ discover: { US: ["NVDA"] }, quant: { US: ["AAPL"] } });
  const nv = shards.NV;
  assert.deepEqual(nv.modules.quant.US, []);
  const st = Object.fromEntries(SC.availability(SC.fromUs("NVDA"), nv).map((m) => [m.product, m.state]));
  assert.equal(st.discover, "available");
  assert.equal(st.quant, "unavailable");
  assert.equal(st.supertrader, "unknown", "keine Quelle -> kein Urteil");
  assert.equal(shards.ZZ, undefined);
});

test("Release · build-release.mjs schreibt das Manifest nur in die Auslieferung und faellt neutral aus", () => {
  const src = readFileSync(join(ROOT, "scripts", "vu2", "build-release.mjs"), "utf8");
  assert.match(src, /writeAvailability\(\{root,out:resolve\(output,AVAILABILITY_DIR\)\}\)/);
  assert.match(src, /STOCK_AVAILABILITY_SKIPPED/);
  assert.equal(AVAILABILITY_DIR, SC.availabilityUrl(SC.fromUs("NVDA")).slice(1, -"NV.json".length));
});
