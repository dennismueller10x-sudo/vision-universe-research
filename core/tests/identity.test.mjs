/* Core · Eine Identitaetsregel (core/identity.js, ADR-001). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Identity = require(join(ROOT, "core", "identity.js"));
const Master = require(join(ROOT, "quant", "engines", "company-master.js"));
const json = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));

test("Regel · Bindestrich, Punkt und Schraegstrich ergeben dieselbe kanonische ID", () => {
  assert.equal(Identity.securityIdForTicker("BRK-B"), "ref_BRK_B");
  assert.equal(Identity.securityIdForTicker("brk.b"), "ref_BRK_B");
  assert.equal(Identity.securityIdForTicker("BRK/B"), "ref_BRK_B");
  assert.equal(Identity.securityIdForTicker("AAPL"), "ref_AAPL");
  assert.equal(Identity.matchKey("BRK.B"), "BRKB");
  assert.throws(() => Identity.securityIdForTicker(""), /INVALID_TICKER/);
  assert.throws(() => Identity.securityIdForTicker("../etc"), /INVALID_TICKER/);
  assert.throws(() => Identity.securityIdForTicker("/abs"), /INVALID_TICKER/);
  assert.equal(Identity.securityIdForTicker("BFS_P_D"), "ref_BFS_P_D");
  assert.equal(Identity.securityIdForTicker("BRK B"), "ref_BRK_B");
});

test("Regel · byte-gleich zur Bildung des Company Master (legacySecurityId)", () => {
  /* Zwei Regeln fuer dieselbe ID waeren zwei IDs. Geprueft gegen jeden
     Ticker des Produktuniversums. */
  const decisions = json("quant/data/market/security-master/eligibility.json").decisions;
  assert.ok(decisions.length > 5000);
  for (const d of decisions) {
    assert.equal(Identity.securityIdForTicker(d.ticker), Master.legacySecurityId(d.ticker), d.ticker);
    assert.equal(Identity.shardKey(d.ticker), Master.shardKey(d.ticker), "Scherbe " + d.ticker);
  }
});

test("Bestand · jede securityId in Konfiguration und Universen folgt der Regel", () => {
  /* Vorfall 03.10.2026: quant/config/tiingo-universe.json fuehrte BRK-B als
     ref_BRKB, der Wertpapierstamm als ref_BRK_B. preview-scope.mjs nahm die
     erste - BRK-B fehlte danach in Faktoren und Discover. */
  const fehler = [];
  const pruefe = (quelle, rows) => {
    for (const s of rows || []) {
      if (s && typeof s.ticker === "string" && typeof s.securityId === "string" && s.securityId.startsWith("ref_") &&
          !Identity.consistent(s.ticker, s.securityId)) fehler.push(quelle + ": " + s.ticker + " -> " + s.securityId);
    }
  };
  pruefe("tiingo-universe.json", json("quant/config/tiingo-universe.json").securities);
  pruefe("eligibility.json", json("quant/data/market/security-master/eligibility.json").decisions);
  for (const f of readdirSync(join(ROOT, "quant/data/market/scale")).filter((n) => /^universe-.*\.json$/.test(n))) {
    pruefe(f, json("quant/data/market/scale/" + f).securities);
  }
  assert.deepEqual(fehler, []);
});

test("Bestand · keine doppelte securityId und kein doppelter Ticker im Produktuniversum", () => {
  const d = json("quant/data/market/security-master/eligibility.json").decisions;
  const ids = new Set(), tickers = new Set(), dup = [];
  for (const r of d) {
    if (ids.has(r.securityId)) dup.push("id " + r.securityId); ids.add(r.securityId);
    if (tickers.has(r.ticker)) dup.push("ticker " + r.ticker); tickers.add(r.ticker);
  }
  assert.deepEqual(dup, []);
});

test("Kein Produktskript bildet die securityId mehr roh aus dem Ticker", () => {
  /* Die rohe Verkettung "ref_" + ticker ergab fuer BF-B, BRK-A, MOG-A ...
     Pfade, die es nicht gibt (Supertrader-Charts, Intraday-Siegel). */
  /* Supertrader (scripts/supertrader/build.mjs) folgt im eigenen PR - der
     Supertrader-Workstream erlaubt in seinen PRs nur Supertrader-Pfade
     (Gate A) und umgekehrt. */
  const dateien = ["scripts/market/preview-scope.mjs", "scripts/market/universe-source.mjs",
    "scripts/market/build-capability-matrix.mjs", "scripts/market/check-freshness.mjs", "scripts/social/visual-data.mjs"];
  for (const f of dateien) {
    const src = readFileSync(join(ROOT, f), "utf8");
    assert.ok(!/["'`]ref_["'`]\s*\+|`ref_\$\{/.test(src), f + " bildet ref_ roh");
  }
  const intraday = readFileSync(join(ROOT, "scripts/market/ingest-intraday.mjs"), "utf8");
  const siegel = intraday.slice(intraday.indexOf("function discoverVersiegelt"), intraday.indexOf("if (SCOPE === \"auto\")"));
  assert.ok(siegel.includes("Identity.securityIdForTicker"), "Discover-Siegel ohne kanonische ID");
});
