/* Cross-Consumer-Konsistenz der SEC-Fundamentaldaten (Fundamental-Data-Integrity-Audit, Vertrag C-X-1).

   Dasselbe Bundle, dasselbe Konzept, dieselbe Periode, dieselbe Sicht: Quant, Discover (Aktienseite) und Screener
   muessen denselben Wert lesen. Wo ein Consumer bewusst eine andere Groesse zeigt (Discover-KGV ohne TTM-EPS:
   TTM-Nettogewinn / Aktien), ist die Abweichung hier ausdruecklich festgehalten, nicht still.

   Fixtures: echte Consumer-Bundles, gebaut mit dem korrigierten Kern (normalization_logic 1.19.0, Registry 1.9.0, Umsatzbelege 1.1.0)
   aus SEC companyfacts.zip (Stand 2026-10-07): AMT (E2), CECO (E9), FLS (E2-R), TNDM (E1), AAPL (Split), BMI (TTM-EPS vorhanden). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const Inputs = require(path.join(root, "quant/engines/fundamental-inputs.js"));
const Fundamentals = require(path.join(root, "discover/engines/fundamentals.js"));
const Unternehmen = require(path.join(root, "discover/engines/unternehmen.js"));

const FIXTURES = path.join(here, "fixtures", "fundamentals-consumer");
const bundles = fs.readdirSync(FIXTURES).filter((f) => f.endsWith(".json")).sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(FIXTURES, f), "utf8")));
const byTicker = Object.fromEntries(bundles.map((b) => [b.tickers[0], b]));
const CUTOFF = "9999-12-31";
const COL = Inputs.COL;

test("Fixtures sind echte Bundles des korrigierten Kerns", () => {
  assert.deepEqual(Object.keys(byTicker).sort(), ["AAPL", "AMT", "BMI", "CECO", "FLS", "TNDM"]);
  for (const b of bundles) {
    assert.equal(b.schema, "vu-consumer-fundamentals-1.0.0");
    assert.equal(b.versions.normalization_logic, "1.19.0", b.tickers[0]);
    assert.equal(b.versions.metric_registry.mapping_version, "1.9.0", b.tickers[0]);
  }
});

test("C-X-1: juengstes Geschaeftsjahr - Quant, Aktienseite und Screener lesen denselben Wert", () => {
  for (const b of bundles) {
    const model = Fundamentals.fromBundle(b);
    const latest = Fundamentals.latest(model);
    const journey = Fundamentals.journey(model);
    for (const metric of ["revenue", "net_income", "eps_diluted"]) {
      const quant = Inputs.annualSeries(b, metric, CUTOFF).at(-1);
      if (!quant) continue;
      const detail = latest.annual[metric];
      const track = (journey.tracks[metric] || []).at(-1);
      const label = `${b.tickers[0]} ${metric}`;
      assert.ok(detail, `${label}: Aktienseite ohne Wert, Quant hat ${quant.value}`);
      assert.ok(track, `${label}: Screener-Spur ohne Wert, Quant hat ${quant.value}`);
      assert.equal(detail.end, quant.end, `${label}: Periode Aktienseite`);
      assert.equal(track.end, quant.end, `${label}: Periode Screener`);
      assert.equal(detail.v, quant.value, `${label}: Wert Aktienseite`);
      assert.equal(track.v, quant.value, `${label}: Wert Screener`);
    }
  }
});

test("C-X-1: TTM-Umsatz - Quant, Aktienseite und Geschaeftszahlen-Karte lesen dieselbe Summe", () => {
  for (const b of bundles) {
    const quant = Inputs.ttmValue(b, "revenue", CUTOFF);
    if (!quant) continue;
    const model = Fundamentals.fromBundle(b);
    const latest = Fundamentals.latest(model);
    const karte = Unternehmen.ausConsumerBundle(model, { preis: 100 });
    assert.equal(latest.ttm.revenue.v, quant.value, `${b.tickers[0]} Aktienseite`);
    // Die Karte zeigt Umsatz und Ergebnis aus EINER Periode. Ohne TTM-Ergebnis (1.16.0: CECO, Konzeptmix
    // NetIncomeLoss/ProfitLoss mit belegtem Unterschied -> ttmAbsent) ist ihre Basis ausgewiesen das Geschaeftsjahr.
    if (!b.ttm.net_income) {
      assert.equal(karte.basis, "FY", `${b.tickers[0]}: ohne TTM-Ergebnis keine TTM-Karte`);
      assert.ok(b.ttmAbsent && b.ttmAbsent.net_income, `${b.tickers[0]}: Grund fuer fehlendes TTM-Ergebnis`);
      continue;
    }
    assert.equal(karte.basis, "TTM", b.tickers[0]);
    assert.ok(Math.abs(karte.umsatzTTM * 1e6 - quant.value) <= 0.005e6, `${b.tickers[0]} Karte ${karte.umsatzTTM} Mio.`);
  }
});

test("Sicht ist ausgewiesen: das Bundle ist LATEST_RESTATED (as_of_latest), nie eine Erstmeldungs-Sicht", () => {
  for (const b of bundles) {
    assert.equal(b.policy, "as_of_latest", b.tickers[0]);
    assert.match(b.asOf, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test("EPS-Vertrag: EPS_TTM ist VERIFIED aus vier Quartalen oder NOT_AVAILABLE mit Grund - nie das Geschaeftsjahr", () => {
  for (const b of bundles) {
    for (const [field, metric] of [["ttmDiluted", "eps_diluted"], ["ttmBasic", "eps_basic"]]) {
      const e = b.eps[field];
      if (e.status === "VERIFIED") {
        assert.equal(e.v, b.ttm[metric].v, `${b.tickers[0]} ${field}`);
        assert.equal(b.ttm[metric].fp, "TTM");
      } else {
        assert.equal(e.status, "NOT_AVAILABLE", `${b.tickers[0]} ${field}`);
        assert.ok(e.reason, `${b.tickers[0]} ${field}: Grund`);
        assert.equal(b.ttm[metric], undefined, `${b.tickers[0]}: kein TTM-Wert ohne Status VERIFIED`);
      }
    }
    assert.equal(b.views.bundle, "LATEST_RESTATED");
    assert.equal(b.views.ttm, "CURRENT_TTM");
  }
});

test("D2/D6: je Kennzahl und Periodenende genau eine Zeile; kein Geschaeftsjahreslabel doppelt", () => {
  for (const b of bundles) {
    for (const section of ["annual", "quarterly"]) {
      for (const [metric, rows] of Object.entries(b[section] || {})) {
        const ends = rows.map((r) => r[COL.end]);
        assert.equal(new Set(ends).size, ends.length, `${b.tickers[0]} ${section}.${metric}: doppeltes Periodenende`);
        const labels = rows.map((r) => `${r[COL.fy]}${r[1]}`);
        assert.equal(new Set(labels).size, labels.length, `${b.tickers[0]} ${section}.${metric}: doppeltes Label`);
      }
    }
  }
});

test("D4: Einheiten je Konzept - Geld in einer ISO-Waehrung, EPS je Aktie", () => {
  for (const b of bundles) {
    assert.match(b.units.revenue, /^[A-Z]{3}$/, b.tickers[0]);
    assert.match(b.units.net_income, /^[A-Z]{3}$/, b.tickers[0]);
    assert.match(b.units.eps_diluted, /^[A-Z]{3}\/shares$/, b.tickers[0]);
  }
});

test("D7: TTM-EPS nur als Summe von vier gemeldeten Quartalen; fehlt eines, gibt es keinen TTM-EPS", () => {
  for (const b of bundles) {
    const ttm = b.ttm.eps_diluted;
    const quarters = (b.quarterly.eps_diluted || []).filter((r) => !ttm || r[COL.end] <= ttm.end);
    if (!ttm) continue;
    const last4 = quarters.slice(-4);
    assert.equal(last4.length, 4, `${b.tickers[0]}: TTM-EPS ohne vier Quartale`);
    assert.equal(last4.at(-1)[COL.end], ttm.end, b.tickers[0]);
    const sum = last4.reduce((s, r) => s + r[COL.v], 0);
    assert.ok(Math.abs(sum - ttm.v) < 1e-9, `${b.tickers[0]}: ${sum} != ${ttm.v}`);
  }
  assert.ok(byTicker.BMI.ttm.eps_diluted, "BMI meldet alle vier Quartale; TTM-EPS muss vorhanden sein");
  assert.equal(byTicker.AAPL.ttm.eps_diluted, undefined, "AAPL meldet kein Q4-EPS; FY minus 9M ist kein EPS");
});

test("Bewusste Abweichung: ohne TTM-EPS rechnet die Geschaeftszahlen-Karte TTM-Gewinn / Aktien (andere Groesse, ausdruecklich)", () => {
  const b = byTicker.AAPL;
  const model = Fundamentals.fromBundle(b);
  const karte = Unternehmen.ausConsumerBundle(model, { preis: 100 });
  const shares = (b.annual.shares_outstanding || b.annual.diluted_weighted_average_shares).at(-1)[COL.v];
  assert.equal(karte.basis, "TTM");
  assert.ok(Math.abs(karte.gewinnJeAktie - b.ttm.net_income.v / shares) < 1e-4, `${karte.gewinnJeAktie}`);
  // Und sie ist NICHT das Geschaeftsjahres-EPS, das Quant und Screener zeigen - zwei Sichten, nicht ein Wert.
  assert.notEqual(karte.gewinnJeAktie, Inputs.annualSeries(b, "eps_diluted", CUTOFF).at(-1).value);
});

test("Fallwerte aus der SEC-Ground-Truth (E2, E9, E2-R)", () => {
  const ceco = Object.fromEntries(byTicker.CECO.annual.revenue.map((r) => [r[COL.end], r[COL.v]]));
  assert.equal(ceco["2025-12-31"], 774381000, "CECO FY2025: USD-Umsatz, nicht 750 Mio. EUR");
  assert.equal(byTicker.CECO.units.revenue, "USD");
  const amt = Object.fromEntries(byTicker.AMT.quarterly.revenue.map((r) => [r[COL.end], r[COL.v]]));
  for (const [end, v] of Object.entries(amt)) assert.ok(v > 2e9, `AMT ${end}: ${v} ist kein Gesamtumsatz`);
  // FLS taggt Revenues = 0 in jedem 10-Q; der Umsatz ist der Vertragsumsatz (Q2 2026: 1.169,175 Mio.).
  const fls = Object.fromEntries(byTicker.FLS.quarterly.revenue.map((r) => [r[COL.end], r[COL.v]]));
  assert.equal(fls["2026-06-30"], 1169175000);
  for (const [end, v] of Object.entries(fls)) assert.ok(v > 5e8, `FLS ${end}: ${v} ist kein Gesamtumsatz`);
});
