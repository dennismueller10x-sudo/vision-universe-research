/* Core · Tickerwechsel: die alte securityId bleibt die ID der Historie, die neue fuehrt weiter (core/ticker-succession.js, ADR-009). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { withPredecessor } from "../../scripts/market/lib/ticker-succession-bars.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Identity = require(join(ROOT, "core", "identity.js"));
const TS = require(join(ROOT, "core", "ticker-succession.js"));
const json = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
const REG = json("quant/config/ticker-successions.json");

test("TS-1 · Register: TCBI -> TXCP loest auf, fremde IDs bleiben, Vorgaenger ist auffindbar", () => {
  const map = TS.tickerSuccessions(REG);
  assert.equal(TS.resolveSecurityId("ref_TCBI", map), "ref_TXCP");
  assert.equal(TS.resolveSecurityId("ref_TXCP", map), "ref_TXCP");
  assert.equal(TS.resolveSecurityId("ref_NVDA", map), "ref_NVDA");
  assert.equal(TS.predecessorOf("ref_TXCP", map).from, "ref_TCBI");
  assert.equal(TS.predecessorOf("ref_NVDA", map), null);
});

test("TS-2 · jeder Eintrag: IDs aus core/identity.js, Ticker passend, Beleg vor dem Stichtag (CIK-Gleichheit prueft das Eignungs-Gate, EG-10)", () => {
  for (const e of REG.successions) {
    assert.equal(Identity.securityIdForTicker(e.fromTicker), e.from, e.from);
    assert.equal(Identity.securityIdForTicker(e.toTicker), e.to, e.to);
    assert.ok(e.source.filed <= e.effective && e.source.quote && e.issuer, e.from);
  }
});

test("TS-3 · fail closed: fehlender Beleg, fehlende CIK, zwei Nachfolger, Kette", () => {
  const ok = { from: "ref_A", to: "ref_B", effective: "2026-01-05", cik: "0000000001", source: { type: "SEC_8K", accession: "0000000001-26-000001", filed: "2026-01-02" } };
  assert.doesNotThrow(() => TS.tickerSuccessions({ successions: [ok] }));
  assert.throws(() => TS.tickerSuccessions({ successions: [{ ...ok, source: {} }] }), /Belegart/);
  assert.throws(() => TS.tickerSuccessions({ successions: [{ ...ok, source: { type: "SEC_8K", filed: "2026-01-02" } }] }), /Accession/);
  assert.throws(() => TS.tickerSuccessions({ successions: [{ ...ok, source: { ...ok.source, filed: "2026-02-01" } }] }), /vor dem Stichtag/);
  assert.throws(() => TS.tickerSuccessions({ successions: [{ ...ok, cik: "1" }] }), /CIK/);
  assert.throws(() => TS.tickerSuccessions({ successions: [ok, { ...ok, to: "ref_C" }] }), /zwei Nachfolger/);
  assert.throws(() => TS.tickerSuccessions({ successions: [ok, { ...ok, from: "ref_X" }] }), /zwei Vorgaenger/);
  assert.throws(() => TS.tickerSuccessions({ successions: [ok, { ...ok, from: "ref_B", to: "ref_C" }] }), /Kette/);
});

test("TS-4 · Reihen verbinden: Vorgaenger strikt vor dem Stichtag, Nachfolger ab dem Stichtag, Luecke bleibt Luecke", () => {
  const bar = (d, c) => ({ date: d + "T00:00:00.000Z", close: c });
  const pred = [bar("2026-11-05", 100), bar("2026-11-06", 101), bar("2026-11-09", 999)];
  const succ = [bar("2026-11-06", 555), bar("2026-11-11", 102), bar("2026-11-12", 103)];
  const j = TS.joinBars(pred, succ, "2026-11-09");
  assert.deepEqual(j.bars.map((b) => b.close), [100, 101, 102, 103]);
  assert.equal(j.lastPredecessor, "2026-11-06"); assert.equal(j.firstSuccessor, "2026-11-11");
  assert.throws(() => TS.joinBars(pred, succ, "9.11."), /Stichtag/);
});

test("TS-5 · Verbraucher: Nachfolger traegt die Vorgaenger-Bars, alle anderen Titel bleiben dasselbe Objekt", () => {
  const succ = { TS, map: TS.tickerSuccessions(REG) };
  const p = { provider: "tiingo", bars: [{ date: "2026-11-11", close: 102 }] };
  const gelesen = [];
  const r = withPredecessor(p, { securityId: "ref_TXCP", ticker: "TXCP" }, succ, (e) => { gelesen.push(e.from); return { bars: [{ date: "2026-11-06", close: 101 }] }; });
  assert.deepEqual(gelesen, ["ref_TCBI"]);
  assert.deepEqual(r.payload.bars.map((b) => b.date), ["2026-11-06", "2026-11-11"]);
  assert.equal(r.payload.provider, "tiingo"); assert.equal(r.joined.predecessorBars, 1);
  const n = { bars: [] };
  assert.equal(withPredecessor(n, { securityId: "ref_NVDA", ticker: "NVDA" }, succ, () => assert.fail("kein Lesen")).payload, n);
});

test("TS-6 · identity.js bleibt ohne Tickerwechsel-Regel (Supertrader pinnt ihren Hash)", () => {
  const src = readFileSync(join(ROOT, "core", "identity.js"), "utf8");
  assert.ok(!/succession|Nachfolge/i.test(src));
});
