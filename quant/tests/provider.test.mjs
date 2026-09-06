// Provider- und Mock-Datensatz-Tests.
// Ausfuehren: node --test quant/tests/
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Provider = require("../engines/provider.js");
const Schema = require("../engines/schema.js");
const Generator = require("../engines/mock-generator.js");
const MockProvider = require("../engines/mock-provider.js");

const dataset = Generator.generateDataset();
const mp = MockProvider.createMockProvider({ dataset });

test("MockProvider erfuellt alle sieben Provider-Interfaces", () => {
  for (const iface of Object.keys(Provider.INTERFACES)) {
    assert.deepEqual(Provider.missingMethods(iface, mp), [], `${iface} unvollstaendig`);
  }
});

test("Registry lehnt einen unvollstaendigen Adapter ab", () => {
  const registry = Provider.createRegistry();
  assert.throws(() => registry.register("MarketDataProvider", { getPriceBars() {} }), /does not implement/);
});

test("Datensatz ist deterministisch: gleicher Seed, gleicher Snapshot", () => {
  const a = Generator.generateDataset({ includePrices: false });
  const b = Generator.generateDataset({ includePrices: false });
  assert.equal(a.meta.dataSnapshotId, b.meta.dataSnapshotId);
  assert.equal(a.securities[7].name, b.securities[7].name);
  assert.equal(
    JSON.stringify(a.financials["sec_VU0002"].slice(0, 3)),
    JSON.stringify(b.financials["sec_VU0002"].slice(0, 3))
  );
});

test("Anderer Seed erzeugt einen anderen Datensatz", () => {
  const other = Generator.generateDataset({ seed: "andere-welt", includePrices: false });
  assert.notEqual(other.meta.dataSnapshotId, dataset.meta.dataSnapshotId);
});

test("500 synthetische Securities plus 11 Edge-Case-Fixtures", () => {
  assert.equal(dataset.securities.length, 511);
  const fixtures = dataset.securities.filter((s) => s.fixtureId);
  assert.equal(fixtures.length, 11);
  const expected = [
    "MOCK_HIGH_QUALITY", "MOCK_HIGH_MOMENTUM", "MOCK_HIGH_GROWTH", "MOCK_DEEP_VALUE",
    "MOCK_VALUE_TRAP", "MOCK_LOW_VOL", "MOCK_MISSING_DATA", "MOCK_DELISTED",
    "MOCK_RESTATEMENT", "MOCK_FUTURE_DATA_LEAK", "MOCK_CORPORATE_ACTION"
  ];
  assert.deepEqual(fixtures.map((f) => f.fixtureId).sort(), expected.slice().sort());
});

test("Jede Security ist schema-valide und als Mock gekennzeichnet", () => {
  for (const s of dataset.securities) {
    const res = Schema.validate("Security", s);
    assert.ok(res.valid, res.errors.join("; "));
    assert.equal(s.isMock, true);
    assert.match(s.ticker, /^VU(F\d{3}|\d{4})$/);
  }
});

test("Keine realen Unternehmensnamen: alle Namen tragen die Mock-Kennzeichnung", () => {
  for (const s of dataset.securities) assert.match(s.name, /^VU Mock /);
});

test("Expandierte FundamentalFacts sind schema-valide", () => {
  const facts = mp.getFacts("sec_VU0005", { quarters: 4 }).data;
  assert.ok(facts.length > 0);
  for (const f of facts) {
    const res = Schema.validate("FundamentalFact", f);
    assert.ok(res.valid, res.errors.join("; "));
  }
});

test("Kanonische Daten enthalten keine Vendor-Felder", () => {
  const samples = [
    dataset.securities[0],
    mp.getFacts("sec_VU0010", { quarters: 2 }).data[0],
    mp.getPriceBars("sec_VU0010", { from: "2026-08-03", to: "2026-08-07" }).data[0],
    dataset.corporateActions[0]
  ];
  for (const s of samples) assert.deepEqual(Provider.findVendorLeakage(s), []);
});

test("Jeder Datenpunkt traegt Provenance mit asOf und Mock-Kennzeichen", () => {
  const res = mp.getFacts("sec_VU0010", { quarters: 1 });
  assert.equal(res.available, true);
  assert.equal(res.provenance.isMock, true);
  assert.ok(res.provenance.asOf);
  assert.ok(res.provenance.dataSnapshotId);
  assert.equal(res.provenance.provider, "VisionUniverseMock");
});

test("Fehlende Provider-Daten werden gemeldet, nicht erfunden", () => {
  for (const res of [mp.getEstimates("sec_VU0001"), mp.getRevisionHistory("sec_VU0001"),
                     mp.getIndicator("CPI"), mp.getNews("sec_VU0001")]) {
    assert.equal(res.available, false);
    assert.equal(res.data, null);
    assert.ok(res.reason.length > 20, "Begruendung fehlt");
  }
});

test("Point-in-Time: Fundamentaldaten sind vor availableAt unsichtbar", () => {
  const periods = dataset.financials["sec_VU0003"].filter((p) => p.revisionId === 0);
  const target = periods[periods.length - 5];
  const dayBefore = Generator.addDays(target.availableAt, -1);

  const before = mp.getFacts("sec_VU0003", { asOf: dayBefore, periodEnd: target.periodEnd, metricId: "revenue" });
  assert.equal(before.data.length, 0, "Periode war vor availableAt bereits sichtbar");

  const after = mp.getFacts("sec_VU0003", { asOf: target.availableAt, periodEnd: target.periodEnd, metricId: "revenue" });
  assert.equal(after.data.length, 1);
});

test("MOCK_FUTURE_DATA_LEAK taucht heute nirgends auf", () => {
  const today = dataset.meta.end;
  const facts = mp.getFacts("sec_VUF010", { asOf: today, quarters: 12 }).data;
  assert.ok(facts.length > 0);
  for (const f of facts) {
    assert.ok(f.availableAt <= today, `Zukunftsdatensatz sichtbar: ${f.periodEnd}`);
    assert.notEqual(f.periodEnd, "2026-09-30");
  }
  const raw = dataset.financials["sec_VUF010"];
  assert.ok(raw.some((p) => p.periodEnd === "2026-09-30"), "Fixture enthaelt den Zukunftsdatensatz nicht mehr");
});

test("MOCK_RESTATEMENT: die Korrektur wirkt nicht rueckwaerts", () => {
  const periodEnd = "2017-03-31";
  const original = mp.getFacts("sec_VUF009", { asOf: "2018-01-15", periodEnd, metricId: "revenue" }).data[0];
  const restated = mp.getFacts("sec_VUF009", { asOf: "2019-01-15", periodEnd, metricId: "revenue" }).data[0];

  assert.equal(original.revisionId, 0);
  assert.equal(original.restatementStatus, "original");
  assert.equal(restated.revisionId, 1);
  assert.equal(restated.restatementStatus, "restated");
  assert.ok(restated.value < original.value, "Korrektur muss den Wert senken");
});

test("MOCK_DELISTED bleibt im historischen Universum und verschwindet heute", () => {
  const historic = mp.getSecurities({ asOf: "2018-06-01" }).data;
  const today = mp.getSecurities({ asOf: dataset.meta.end }).data;
  assert.ok(historic.some((s) => s.fixtureId === "MOCK_DELISTED"));
  assert.ok(!today.some((s) => s.fixtureId === "MOCK_DELISTED"));

  const membership2018 = mp.getUniverseMembership("US_EQUITIES", "2018-06-01").data;
  assert.ok(membership2018.some((m) => m.securityId === "sec_VUF008"));
});

test("Corporate Actions sind vor ihrer Ankuendigung unsichtbar", () => {
  const action = dataset.corporateActions.find((a) => a.type === "split");
  const before = mp.getCorporateActions(action.securityId, { asOf: Generator.addDays(action.announcedAt, -1) }).data;
  assert.ok(!before.some((a) => a.actionId === action.actionId));
  const after = mp.getCorporateActions(action.securityId, { asOf: action.announcedAt }).data;
  assert.ok(after.some((a) => a.actionId === action.actionId));
});

test("MOCK_CORPORATE_ACTION: Split senkt den Kurs, nicht die Total Return Reihe", () => {
  const bars = mp.getPriceBars("sec_VUF011", { from: "2021-08-25", to: "2021-09-03" }).data;
  const splitIdx = bars.findIndex((b) => b.date === "2021-08-31");
  assert.ok(splitIdx > 0);
  const ratio = bars[splitIdx - 1].close / bars[splitIdx].close;
  assert.ok(ratio > 3.5 && ratio < 4.5, `Split-Verhaeltnis ${ratio.toFixed(2)} statt ~4`);
  const adjMove = Math.abs(bars[splitIdx].adjustedClose / bars[splitIdx - 1].adjustedClose - 1);
  assert.ok(adjMove < 0.12, `adjustedClose sprang um ${(adjMove * 100).toFixed(1)} %`);
});

test("MOCK_MISSING_DATA hat tatsaechlich fehlende Kennzahlen", () => {
  const facts = mp.getFacts("sec_VUF007", { quarters: 4 }).data;
  const fcf = facts.filter((f) => f.metricId === "freeCashFlow");
  assert.ok(fcf.length > 0);
  assert.ok(fcf.every((f) => f.value === undefined), "freeCashFlow muesste fehlen");
  const revenue = facts.filter((f) => f.metricId === "revenue");
  assert.ok(revenue.every((f) => Number.isFinite(f.value)), "revenue muesste vorhanden sein");
});

test("Preisreihen sind oekonomisch plausibel (keine Nullkurse bei aktiven Titeln)", () => {
  const last = dataset.tradingDays.length - 1;
  let checked = 0;
  for (const s of dataset.securities) {
    if (s.status !== "active") continue;
    const series = dataset.prices[s.securityId];
    if (!series || series.endIndex !== last) continue;
    assert.ok(series.close[last] > 0.5, `${s.ticker} bei ${series.close[last]}`);
    checked++;
  }
  assert.ok(checked > 400);
});

test("Der Benchmark enthaelt spaeter delistete Titel (kein Survivorship Bias)", () => {
  const bars = mp.getBenchmarkBars(Generator.BENCHMARK_ID, { from: "2006-01-02", to: "2026-09-04" }).data.bars;
  assert.ok(bars.length > 5000);
  assert.ok(bars[0].level > 0 && bars[bars.length - 1].level > bars[0].level);
});

test("Der Datensatz enthaelt echte Marktzyklen (Drawdown > 30 %)", () => {
  const level = dataset.benchmark.level;
  let peak = 0, maxDd = 0;
  for (let i = 0; i < level.length; i++) {
    peak = Math.max(peak, level[i]);
    maxDd = Math.min(maxDd, level[i] / peak - 1);
  }
  assert.ok(maxDd < -0.3, `maximaler Drawdown nur ${(maxDd * 100).toFixed(1)} %`);
});
