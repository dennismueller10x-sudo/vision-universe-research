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
  const sechs = { ...ok, source: { type: "SEC_6K", accession: "0000000001-26-000002", filed: "2026-01-05" } };
  assert.doesNotThrow(() => TS.tickerSuccessions({ successions: [sechs] }));
  assert.throws(() => TS.tickerSuccessions({ successions: [{ ...ok, source: { type: "SEC_6K", filed: "2026-01-02" } }] }), /6-K ohne Accession/);
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

test("TS-7 · Faktoren, Discover-Reihe und Wochenreihe verbinden die Nachfolge (19.11.2026: TXCP fehlte in Faktoren und Suche)", () => {
  const ROOT = new URL("../../", import.meta.url);
  for (const f of ["scripts/market/build-market-factors.mjs", "scripts/market/publish-discover-series.mjs", "scripts/market/publish-long-series.mjs"]) {
    const src = readFileSync(new URL(f, ROOT), "utf8");
    assert.match(src, /withPredecessor\(/, f + " liest die Arbeitsablage ohne Tickernachfolge");
  }
});

/* TS-8 (Steuerung 19.11.2026): kein Leser von Kursreihen rutscht durch. Jede Datei, die Bars je Titel aus der Arbeitsablage
   (readBars), der R2-Historie (getSeries) oder der runner-privaten Tageshistorie (tiingo/daily) liest, verbindet die
   Tickernachfolge ueber scripts/market/lib/ticker-succession-bars.mjs - oder steht hier mit Grund. Ein neuer Leser ohne
   beides macht den Test rot. */
const OHNE_NACHFOLGE = {
  "quant/engines/history-store.js": "Ablage selbst: liest und schreibt je gespeichertem Schluessel",
  "quant/engines/market-store.js": "Ablage selbst: liest und schreibt je gespeicherter ID",
  "scripts/market/ingest-tiingo.mjs": "Schreiber: fuehrt die eigene Reihe je ID fort",
  "scripts/market/ingest-intraday.mjs": "Schreiber: Intraday je ID",
  "scripts/market/sync-history-store.mjs": "Ablage-Abgleich je Schluessel",
  "scripts/market/repair-total-return-history.mjs": "Reparatur der gespeicherten Reihe je ID",
  "scripts/market/refresh-benchmark-history.mjs": "nur die Vergleichsreihe SPY",
  "scripts/market/guard-listing-continuity.mjs": "Pruefung der gespeicherten Reihe je Listing",
  "scripts/market/run-scale-gate.mjs": "Ablagedeckung je gespeicherter ID",
  "scripts/vu2/verify-history-handoff.mjs": "Uebergabepruefung der Ablage je ID",
  "scripts/core/equity-quality.mjs": "Datenqualitaet der gespeicherten Reihe je ID",
  "scripts/diagnose/adjustment-steps.mjs": "Diagnose einer gespeicherten Reihe",
  "scripts/diagnose/coverage-delta.mjs": "Ablagedeckung gegen den Bezugstag je ID",
  "scripts/technical/build-technical-intelligence.mjs": "nur Indexmitglieder (kein Nachfolger im Register)",
  "scripts/quant/lib/daily-prices.mjs": "Forschung/Backtest je securityId; Vorgaengerreihe offen (Teil B, Register der Forschungsreihen)",
  "scripts/quant/build-signal-backtest.mjs": "Forschung, liest ueber daily-prices",
  "scripts/quant/build-setup-backtest.mjs": "Forschung, liest ueber daily-prices",
  "scripts/quant/build-pattern-research.mjs": "Forschung, liest ueber daily-prices",
  "scripts/quant/replay-setup-history.mjs": "Forschung: kausales Replay je securityId",
  "scripts/quant/build-emerging-leaders-study.mjs": "Forschung: Studie je Ticker in der R2-Historie",
  "scripts/quant/build-survivorship-control.mjs": "Forschung: Survivorship-Inventar je gespeicherter Reihe"
};
const LESER = /readBars\(|getSeries\(|"tiingo", "daily"/;

test("TS-8 · jeder Leser von Kursreihen verbindet die Nachfolge oder ist mit Grund ausgenommen", () => {
  const { readdirSync, statSync } = require("node:fs");
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const dateien = [];
  const walk = (rel) => {
    for (const e of readdirSync(join(ROOT, rel))) {
      const r = rel + "/" + e;
      if (statSync(join(ROOT, r)).isDirectory()) { if (!["tests", "node_modules", "supertrader"].includes(e)) walk(r); }
      else if (/\.(mjs|cjs|js)$/.test(e)) dateien.push(r);
    }
  };
  walk("scripts"); walk("quant/engines");
  const leser = dateien.filter((f) => LESER.test(readFileSync(join(ROOT, f), "utf8")));
  const offen = leser.filter((f) => !/withPredecessor\(/.test(readFileSync(join(ROOT, f), "utf8")) && !OHNE_NACHFOLGE[f]);
  assert.deepEqual(offen, [], "Leser ohne Tickernachfolge: withPredecessor verwenden oder mit Grund in OHNE_NACHFOLGE eintragen");
  for (const f of Object.keys(OHNE_NACHFOLGE)) assert.ok(leser.includes(f), f + " liest keine Kursreihen mehr: Eintrag entfernen");
  for (const f of ["scripts/market/build-market-factors.mjs", "scripts/technical/run-technical-scale.mjs",
                   "scripts/technical/materialize-product-intelligence.mjs"]) assert.ok(leser.includes(f) && !OHNE_NACHFOLGE[f], f);
});

test("TS-9 · relabel: Vorgaenger-Bars tragen die ID des Nachfolgers, die Nutzlast nennt den Nachfolger", () => {
  const succ = { TS, map: TS.tickerSuccessions(REG) };
  const p = { ticker: "TXCP", securityId: "ref_TXCP", bars: [{ date: "2026-11-11", securityId: "ref_TXCP", close: 99 }] };
  const r = withPredecessor(p, { securityId: "ref_TXCP", ticker: "TXCP" }, succ,
    () => ({ ticker: "TCBI", securityId: "ref_TCBI", bars: [{ date: "2026-11-06", securityId: "ref_TCBI", close: 101 }] }), { relabel: true });
  assert.deepEqual(r.payload.bars.map((b) => b.securityId), ["ref_TXCP", "ref_TXCP"]);
  assert.equal(r.payload.ticker, "TXCP"); assert.equal(r.payload.securityId, "ref_TXCP");
  const ohne = withPredecessor(p, { securityId: "ref_TXCP", ticker: "TXCP" }, succ,
    () => ({ bars: [{ date: "2026-11-06", securityId: "ref_TCBI", close: 101 }] }));
  assert.equal(ohne.payload.bars[0].securityId, "ref_TCBI", "ohne relabel bleibt die Bar unveraendert");
});
