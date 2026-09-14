/* Fundamentals-Engine: Damals vs. Heute, Journey, Story, Health, Signale -
   deterministisch, mit Beleg, ohne Vermischung von Annual/Quarterly/TTM.
   Ueber SYNTHETISCHE Bundles der SEC-Pipeline (scripts/quant/sec/consumer.py,
   Fixture aus quant/tests/fixtures.py) - keine echten Unternehmenszahlen. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const F = require("../engines/fundamentals.js");
const wachsend = JSON.parse(readFileSync(join(here, "fixtures", "fundamentals-synthetic.json"), "utf8"));
const jung = JSON.parse(readFileSync(join(here, "fixtures", "fundamentals-young.json"), "utf8"));
const M = F.fromBundle(wachsend), J = F.fromBundle(jung);

test("FU1 · Lesemodell: Jahresreihen aus dem kompakten Bundle, nur FY, aufsteigend", () => {
  assert.ok(M); assert.equal(M.tickers[0], "SYNT");
  assert.deepEqual(M.years, [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);
  assert.ok(M.annual.revenue.every((r) => r.fp === "FY" && typeof r.v === "number" && r.filed && r.accn));
  assert.equal(F.fromBundle({ schema: "anders" }), null);
  assert.equal(F.fromBundle(null), null);
});

test("FU2 · Horizont: 10 Jahre wenn valide, sonst 5, sonst 3, sonst erste vs. letzte Periode", () => {
  assert.deepEqual(F.horizon(M), { years: 10, from: 2015, to: 2025, kind: "FIXED" });
  assert.deepEqual(F.horizon(J), { years: 3, from: 2022, to: 2025, kind: "FIXED" });
  const zwei = F.fromBundle(Object.assign({}, jung, { annual: { revenue: jung.annual.revenue.slice(-2) } }));
  assert.deepEqual(F.horizon(zwei), { years: 1, from: 2024, to: 2025, kind: "FIRST_VS_LATEST" });
  assert.equal(F.horizon(F.fromBundle(Object.assign({}, jung, { annual: {} }))), null);
});

test("FU3 · Damals vs. Heute: nur vorhandene Werte, Perioden exakt benannt, Beleg je Zeile", () => {
  const c = F.compare(M);
  assert.ok(c.available); assert.equal(c.horizon.years, 10);
  const umsatz = c.rows.find((r) => r.id === "revenue");
  assert.equal(umsatz.then.fy, 2015); assert.equal(umsatz.now.fy, 2025);
  assert.ok(Math.abs(umsatz.change.pct - (Math.pow(1.12, 10) - 1)) < 1e-6, "Wachstum rechnerisch");
  assert.ok(Math.abs(umsatz.change.cagr - 0.12) < 1e-9);
  assert.equal(umsatz.evidence.metric, "revenue"); assert.equal(umsatz.evidence.periodStart.fy, 2015);
  assert.ok(umsatz.evidence.periodEnd.accession && umsatz.evidence.source && umsatz.evidence.asOf);
  const marge = c.rows.find((r) => r.id === "operating_margin");
  assert.ok(marge); assert.ok(typeof marge.change.pp === "number");
  assert.ok(!c.rows.some((r) => r.then.value === 0 && r.now.value === 0), "keine kuenstlichen Nullen");
  assert.ok(!c.rows.find((r) => r.id === "dividends"), "eine nie berichtete Kennzahl hat keine Zeile");
});

test("FU4 · Journey: Reihen je Kennzahl, Margen nur aus demselben Geschaeftsjahr", () => {
  const j = F.journey(M);
  assert.ok(j.available); assert.equal(j.tracks.revenue.length, 11);
  assert.ok(j.availableTracks.includes("margins") && j.availableTracks.includes("free_cash_flow"));
  const op = j.tracks.margins.operating;
  assert.ok(op.length >= 10 && op.every((p) => p.v > 0 && p.v < 1));
  assert.ok(j.tracks.shares.length >= 2);
});

test("FU5 · Story: nur rechnerisch belegte Saetze, jeder mit Beleg", () => {
  const s = F.story(M);
  assert.ok(s.available);
  const ids = s.statements.map((x) => x.id);
  assert.ok(ids.includes("revenue_doubled"), "12 % p. a. ueber 10 Jahre = mehr als verdoppelt: " + ids);
  for (const st of s.statements) {
    assert.ok(st.text.length > 10);
    const e = st.evidence;
    assert.ok(e.metric && e.periodStart && e.periodEnd && typeof e.valueStart === "number" && typeof e.valueEnd === "number");
    assert.ok(e.calculation && e.source === F.SOURCE && e.asOf === M.asOf && e.version === F.VERSION);
  }
  /* Ohne Historie: keine Geschichte. */
  assert.equal(F.story(F.fromBundle(Object.assign({}, jung, { annual: {} }))).available, false);
});

test("FU6 · Health: Kategorien nur mit Daten, Schwellen dokumentiert, Noten nachrechenbar", () => {
  const h = F.health(M);
  assert.ok(h.available);
  const ids = h.categories.map((c) => c.id);
  assert.deepEqual(ids, ["growth", "profitability", "cashflow", "balance", "dilution"]);
  const g = h.categories[0];
  assert.equal(g.grade, "Stark", "12 % CAGR liegt in [10 %, 20 %)");
  assert.ok(Array.isArray(g.thresholds) && g.evidence.calculation.startsWith("CAGR"));
  const p = h.categories.find((c) => c.id === "profitability");
  assert.equal(p.grade, "Stark", "19 % Nettomarge der Fixture");
  const d = h.categories.find((c) => c.id === "dilution");
  assert.equal(d.grade, "Gering", "konstante Aktienanzahl");
  /* Junge Emittentin ohne net_debt-Reihe? -> Bilanz nur, wenn Daten da sind. */
  const hj = F.health(J);
  assert.ok(hj.categories.every((c) => c.evidence && c.grade));
});

test("FU7 · latest: Geschaeftsjahr und TTM getrennt, TTM benennt das Quartal", () => {
  const l = F.latest(M);
  assert.ok(l.available); assert.equal(l.fiscalYear, 2025);
  assert.ok(l.annual.revenue && l.annual.revenue.end && l.annual.revenue.filed);
  assert.ok(l.ttm.revenue && /^FY\d{4}Q[1-4]$/.test(l.ttm.revenue.through));
  assert.ok(typeof l.derived.netMargin === "number" && typeof l.derived.roe === "number");
  assert.notEqual(l.annual.revenue, l.ttm.revenue, "Annual und TTM sind zwei Objekte");
});

test("FU8 · Signale fuer Sammlungen: belegte Kennzahlen, keine Behauptung ohne Reihe", () => {
  const s = F.signals(M);
  assert.ok(Math.abs(s.revenueGrowth3y.value - 0.12) < 1e-4);
  assert.ok(Math.abs(s.revenueGrowth10y.value - 0.12) < 1e-4);
  assert.ok(s.compounder.value === true, "10 J >= 10 % und immer profitabel");
  assert.ok(s.fcfPositiveThreeYears.value === true);
  assert.ok(s.netCash && typeof s.netCash.value === "boolean");
  assert.ok(s.revenueGrowth3y.evidence.periodStart.fy === 2022);
  const sj = F.signals(J);
  assert.ok(!sj.revenueGrowth10y, "ohne zehn Jahre kein 10J-Signal");
});

test("FU9 · Kurs + Fundamentals: nebeneinander, Perioden benannt, keine Kausalitaet", () => {
  const r = F.priceVsFundamentals(M, { date: "2023-01-03", close: 100 }, { date: "2026-09-11", close: 180 });
  assert.ok(r.available); assert.equal(r.fiscal.from, 2022); assert.equal(r.fiscal.to, 2025);
  assert.ok(Math.abs(r.price.change - 0.8) < 1e-9);
  assert.ok(Math.abs(r.revenueChange.value - (Math.pow(1.12, 3) - 1)) < 1e-4);
  assert.match(r.note, /nicht Ursache/);
  assert.equal(F.priceVsFundamentals(M, { date: "2025-06-01", close: 1 }, { date: "2025-09-01", close: 2 }).available, false);
});

test("FU10 · Capabilities aus der Coverage des Bundles", () => {
  const c = F.capabilities(M);
  assert.ok(c.HAS_FUNDAMENTALS && c.HAS_FUNDAMENTALS_10Y && c.HAS_TTM && c.HAS_QUARTERLY);
  assert.equal(c.latestFiscalYear, 2025);
  const cj = F.capabilities(J);
  assert.ok(cj.HAS_FUNDAMENTALS_3Y && !cj.HAS_FUNDAMENTALS_5Y);
  assert.deepEqual(F.capabilities(null), { HAS_FUNDAMENTALS: false });
});
