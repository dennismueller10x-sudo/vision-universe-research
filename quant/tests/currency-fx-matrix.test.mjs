/* =========================================================================
   VISION UNIVERSE — currency-fx-matrix.test.mjs   (Currency Layer V1, §59)

   DIE TESTMATRIX DES CURRENCY LAYERS.

   Zwoelf Faelle sind im Auftrag benannt; sie stehen hier in derselben
   Reihenfolge und tragen ihre Nummer im Namen. Dazu kommen die
   Invarianten, ohne die der Layer ein Risiko waere: dass Originaldaten
   unveraendert bleiben, dass kein Look-Ahead passiert, dass Margen sich
   nicht bewegen und dass eine fehlende Quelle zu einer ehrlichen
   Anzeige fuehrt statt zu einer falschen Zahl.

   Die Kurse sind Fixtures (siehe fixtures/fx-usd-eur.mjs). Geprueft
   werden Regeln, nicht Kursstaende.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { buildUsdEurSeries, EXPLICIT, HOLIDAYS_2021 } from "./fixtures/fx-usd-eur.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FX = join(ROOT, "quant", "engines", "fx");

const Rates      = require(join(FX, "fx-rates.js"));
const Freshness  = require(join(FX, "fx-freshness.js"));
const Registry   = require(join(FX, "currency-registry.js"));
const Classifier = require(join(FX, "currency-class.js"));
const Engine     = require(join(FX, "currency-engine.js"));
const Format     = require(join(FX, "money-format.js"));
const Preference = require(join(FX, "currency-preference.js"));
const Contract   = require(join(FX, "currency-contract.js"));
const Capability = require(join(FX, "fx-capability.js"));
const RealtimeState = require(join(FX, "fx-realtime-state.js"));

const METHODOLOGY = JSON.parse(
  readFileSync(join(ROOT, "quant", "methodology", "currency-fx-v1.json"), "utf8"));

const NOW = "2026-09-22T12:00:00Z";

function store(opts = {}) {
  const s = Rates.createStore(opts.storeOptions);
  s.ingest("USD", "EUR", opts.rows || buildUsdEurSeries("2021-01-01", "2026-09-21", HOLIDAYS_2021),
    { source: "fixture", frequency: "DAILY" });
  if (opts.withChf) s.ingest("USD", "CHF", buildUsdEurSeries("2021-01-01", "2026-09-21", HOLIDAYS_2021)
    .map(([d, r]) => [d, Number((r * 1.08).toFixed(6))]), { source: "fixture", frequency: "DAILY" });
  return s;
}

function engine(opts = {}) {
  return Engine.createEngine({ store: opts.store || store(opts), now: opts.now || NOW });
}

/* ====================================================================== */
/* 1. USD -> EUR current                                                   */
/* ====================================================================== */
test("M1 · USD -> EUR, aktueller Wert: Betrag, Kurs und Herkunft kommen zusammen", () => {
  const e = engine();
  const m = e.convertMoney(181.42, "USD", "EUR", null, "CURRENT_VALUE");

  assert.equal(m.available, true);
  assert.equal(m.native.value, 181.42, "Der Originalwert wird nie ueberschrieben (§3)");
  assert.equal(m.native.currency, "USD");
  assert.equal(m.display.currency, "EUR");
  assert.equal(m.display.value, 181.42 * m.fx.rate, "display ist exakt native x rate, ungerundet");
  assert.equal(m.fx.method, "LATEST_AVAILABLE");
  assert.equal(m.fx.source, "fixture");
  assert.ok(m.fx.asOf, "Ohne asOf ist ein Kurs keine nachvollziehbare Angabe");
  assert.equal(m.freshness.state, "CURRENT");
});

/* ====================================================================== */
/* 2. EUR -> EUR identity                                                  */
/* ====================================================================== */
test("M2 · EUR -> EUR: Rate exakt 1, keine Datenquelle, keine Drift (§17)", () => {
  /* Ein leerer Store: der Fast Path darf nicht einmal nachsehen. */
  const empty = Rates.createStore();
  const e = Engine.createEngine({ store: empty, now: NOW });

  const m = e.convertMoney(1234.5678, "EUR", "EUR", null, "CURRENT_VALUE");
  assert.equal(m.available, true, "Eine EUR-Zahl in EUR darf nie an fehlenden Kursen scheitern");
  assert.equal(m.fx.rate, 1);
  assert.equal(m.fx.method, "IDENTITY");
  assert.equal(m.fx.source, "identity");
  assert.equal(m.display.value, 1234.5678, "Bit fuer Bit derselbe Wert - keine Multiplikation mit 1.0000001");
  assert.equal(m.freshness.state, "CURRENT");

  /* Auch historisch und auch fuer eine ganze Reihe. */
  const s = e.convertSeries([["2021-03-01", 10], ["2021-03-02", 11]], "EUR", "EUR");
  assert.equal(s.fxMethod, "IDENTITY");
  assert.deepEqual(s.displaySeries, s.nativeSeries);
});

/* ====================================================================== */
/* 3. Andere Waehrung -> EUR                                               */
/* ====================================================================== */
test("M3 · CHF -> EUR laeuft ueber das Pivot, ohne dass ein CHF/EUR-Paar gefuehrt wird", () => {
  const s = store({ withChf: true });
  const e = Engine.createEngine({ store: s, now: NOW });

  const m = e.convertMoney(1000, "CHF", "EUR", "2024-03-15", "MARKET_PRICE");
  assert.equal(m.available, true);
  assert.equal(m.fx.derivation, "TRIANGULATED");

  /* Gegenprobe von Hand: EUR/CHF = (USD/EUR) / (USD/CHF) ... die Engine
     rechnet quote/base, also CHF->EUR = (USD/EUR) / (USD/CHF). */
  const usdEur = s.rateAt("USD", "EUR", "2024-03-15").rate;
  const usdChf = s.rateAt("USD", "CHF", "2024-03-15").rate;
  assert.ok(Math.abs(m.fx.rate - usdEur / usdChf) < 1e-12);
  assert.ok(Math.abs(m.display.value - 1000 * (usdEur / usdChf)) < 1e-9);
});

test("M3b · Ein Kreuz aus zwei verschiedenen Tagen wird nicht gebildet", () => {
  const s = Rates.createStore();
  s.ingest("USD", "EUR", [["2024-03-15", 0.92]], { source: "fixture" });
  s.ingest("USD", "CHF", [["2024-03-11", 0.88]], { source: "fixture" });

  const q = s.rateAt("CHF", "EUR", "2024-03-15");
  assert.equal(q.available, false);
  assert.equal(q.reason, "triangulationDateMismatch");
});

/* ====================================================================== */
/* 4. Historischer Tageskurs                                               */
/* ====================================================================== */
test("M4 · Ein historischer Kurs nimmt den Kurs SEINES Tages, nicht den von heute (§9, §40)", () => {
  const s = Rates.createStore();
  s.ingest("USD", "EUR", [["2021-06-30", 0.82], ["2026-09-21", 0.85]], { source: "fixture" });
  const e = Engine.createEngine({ store: s, now: NOW });

  const damals = e.convertMoney(100, "USD", "EUR", "2021-06-30", "MARKET_PRICE");
  const heute  = e.convertMoney(200, "USD", "EUR", "2026-09-21", "MARKET_PRICE");

  assert.equal(damals.display.value, 82, "100 USD zu 0,82 sind 82 EUR - nicht 85");
  assert.equal(heute.display.value, 170);

  /* Und die Folge, die gewollt ist: USD- und EUR-Performance weichen ab. */
  const usdReturn = (200 / 100 - 1) * 100;
  const eurReturn = (170 / 82 - 1) * 100;
  assert.equal(usdReturn, 100);
  assert.ok(Math.abs(eurReturn - 107.317) < 0.01, "EUR-Rendite ist hoeher und das ist korrekt (§10)");
});

test("M4b · Die ganze Reihe wird punktweise umgerechnet, nie mit einem einzigen Kurs", () => {
  const s = store();
  const e = Engine.createEngine({ store: s, now: NOW });
  const points = [["2021-06-30", 100], ["2023-06-30", 150], ["2026-09-21", 200]];

  const converted = e.convertSeries(points, "USD", "EUR");
  const raten = converted.points.map((p) => p.rate);
  assert.equal(new Set(raten).size, 3, "Drei Punkte, drei verschiedene FX-Staende");

  /* Die Gegenprobe: mit einem einzigen Kurs waere die EUR-Rendite exakt
     gleich der USD-Rendite. Genau das darf nicht herauskommen. */
  const perf = e.priceReturn(converted);
  assert.ok(Math.abs(perf.displayReturnPct - perf.nativeReturnPct) > 0.5,
    "Ein Waehrungseffekt von faktisch null waere das Zeichen fuer eine Rueckrechnung mit dem heutigen Kurs");
  assert.equal(perf.method, "RECOMPUTED_FROM_DISPLAY_SERIES");
  assert.ok(Math.abs(perf.currencyEffectPp - (perf.displayReturnPct - perf.nativeReturnPct)) < 1e-9);
});

/* ====================================================================== */
/* 5. Wochenende                                                           */
/* ====================================================================== */
test("M5 · Wochenende: der letzte vorherige Stand, niemals der naechste (§15)", () => {
  const s = Rates.createStore();
  s.ingest("USD", "EUR", EXPLICIT, { source: "fixture" });
  const e = Engine.createEngine({ store: s, now: NOW });

  const samstag = e.convertMoney(100, "USD", "EUR", "2021-07-03", "BALANCE_SHEET");
  assert.equal(samstag.fx.asOf, "2021-07-02", "Freitag, nicht Dienstag");
  assert.equal(samstag.fx.method, "PREVIOUS_AVAILABLE");
  assert.equal(samstag.display.value, 85);
  assert.equal(samstag.freshness.state, "LAST_AVAILABLE");
  assert.ok(samstag.fx.fallbackReason, "Der Uebertrag wird benannt, nicht verschwiegen");
});

/* ====================================================================== */
/* 6. Feiertag                                                             */
/* ====================================================================== */
test("M6 · Feiertag folgt derselben Regel und ueberspringt das Wochenende davor", () => {
  const s = Rates.createStore();
  s.ingest("USD", "EUR", EXPLICIT, { source: "fixture" });

  const feiertag = s.rateAt("USD", "EUR", "2021-07-05");
  assert.equal(feiertag.available, true);
  assert.equal(feiertag.asOf, "2021-07-02");
  assert.equal(feiertag.method, "PREVIOUS_AVAILABLE");

  const danach = s.rateAt("USD", "EUR", "2021-07-06");
  assert.equal(danach.method, "DAILY_AT_DATE", "Am naechsten Handelstag gibt es wieder ein echtes Fixing");
  assert.equal(danach.rate, 0.86);
});

/* ====================================================================== */
/* 7. Fehlender FX-Tag                                                     */
/* ====================================================================== */
test("M7 · Eine echte Luecke wird nicht ueberbrueckt, sondern gemeldet", () => {
  const s = Rates.createStore({ maxCarryDays: 10 });
  s.ingest("USD", "EUR", [["2024-01-05", 0.91], ["2024-03-01", 0.92]], { source: "fixture" });

  /* Innerhalb der Uebertragsgrenze: zulaessiger Rueckgriff. */
  const nah = s.rateAt("USD", "EUR", "2024-01-12");
  assert.equal(nah.available, true);
  assert.equal(nah.asOf, "2024-01-05");

  /* Darueber hinaus: kein Kurs. Kein interpolierter, kein geschaetzter. */
  const fern = s.rateAt("USD", "EUR", "2024-02-15");
  assert.equal(fern.available, false);
  assert.equal(fern.reason, "carryLimitExceeded");
  assert.equal(fern.rate, null);
});

test("M7b · Kein Look-Ahead: vor dem Beginn der Reihe gibt es keinen Kurs", () => {
  const s = Rates.createStore();
  s.ingest("USD", "EUR", [["2024-01-05", 0.91]], { source: "fixture" });

  const davor = s.rateAt("USD", "EUR", "2023-12-20");
  assert.equal(davor.available, false);
  assert.equal(davor.reason, "beforeSeriesStart");
  assert.match(davor.detail, /Look-Ahead/, "Der Grund wird benannt, damit ihn niemand 'grosszuegiger' macht");
});

/* ====================================================================== */
/* 8. Bilanzstichtag                                                       */
/* ====================================================================== */
test("M8 · Bilanzwerte nehmen den Kurs ihres Stichtags (§32)", () => {
  const s = Rates.createStore();
  s.ingest("USD", "EUR", EXPLICIT, { source: "fixture" });
  const e = Engine.createEngine({ store: s, now: NOW });

  const cash = e.convertMetric(
    { metricId: "cash_and_equivalents", value: 48_000_000_000, unit: "USD", currency: "USD", end: "2021-06-30" },
    "EUR");

  assert.equal(cash.currencyClass, "MONETARY_STOCK");
  assert.equal(cash.context, "BALANCE_SHEET");
  assert.equal(cash.fx.asOf, "2021-06-30");
  assert.equal(cash.fx.method, "DAILY_AT_DATE");
  assert.equal(cash.display.value, 48_000_000_000 * 0.82);
});

/* ====================================================================== */
/* 9. Revenue Period Average                                               */
/* ====================================================================== */
test("M9 · Umsatz nimmt das Periodenmittel, nicht den Kurs des letzten Tages (§14, §31)", () => {
  const s = store();
  const e = Engine.createEngine({ store: s, now: NOW });

  const fact = { metricId: "revenue", value: 130_497_000_000, unit: "USD", currency: "USD",
                 periodStart: "2023-10-01", periodEnd: "2024-09-28" };
  const umsatz = e.convertMetric(fact, "EUR");

  assert.equal(umsatz.currencyClass, "MONETARY_FLOW");
  assert.equal(umsatz.fx.method, "PERIOD_AVERAGE");
  assert.equal(umsatz.fx.periodStart, "2023-10-01");
  assert.equal(umsatz.fx.periodEnd, "2024-09-28");
  assert.ok(umsatz.fx.observations > 200, "Ein Jahresmittel steht auf gut 250 Handelstagen");

  /* Der Unterschied zum bequemen Weg ist messbar - und genau deshalb
     darf er nicht dem Zufall ueberlassen bleiben. */
  const letzterTag = s.rateAt("USD", "EUR", "2024-09-28").rate;
  assert.ok(Math.abs(umsatz.fx.rate - letzterTag) > 1e-5,
    "Periodenmittel und Stichtagskurs sind verschieden; waeren sie gleich, wuerde hier nicht gemittelt");

  /* Und das Mittel steht wirklich auf den Tagesfixings. */
  const manuell = s.periodAverage("USD", "EUR", "2023-10-01", "2024-09-28");
  assert.equal(umsatz.fx.rate, manuell.rate);
});

test("M9b · Ohne Periodengrenzen wird kein Kalenderjahr unterstellt", () => {
  const e = engine();
  const ohne = e.convertMetric(
    { metricId: "revenue", value: 1e9, unit: "USD", currency: "USD", end: "2024-09-28" }, "EUR");

  assert.equal(ohne.available, false);
  assert.equal(ohne.reason, "periodRequired");
  assert.equal(ohne.native.value, 1e9, "Der Originalwert ueberlebt auch den Misserfolg");
});

/* ====================================================================== */
/* 10. Quartalsmittel                                                      */
/* ====================================================================== */
test("M10 · Ein Quartal mittelt ueber sein Quartal, nicht ueber das Jahr", () => {
  const s = store();
  const e = Engine.createEngine({ store: s, now: NOW });

  const q = e.convertMetric(
    { metricId: "revenue", value: 30_000_000_000, unit: "USD", currency: "USD",
      periodStart: "2024-06-30", periodEnd: "2024-09-28" }, "EUR");
  const fy = s.periodAverage("USD", "EUR", "2023-10-01", "2024-09-28");

  assert.equal(q.fx.method, "PERIOD_AVERAGE");
  assert.ok(q.fx.observations > 50 && q.fx.observations < 90, `Quartal, nicht Jahr (${q.fx.observations} Tage)`);
  assert.notEqual(q.fx.rate, fy.rate);
});

test("M10b · Eine Periode mit zu wenigen Fixings ergibt kein Mittel (§54)", () => {
  const s = Rates.createStore();
  s.ingest("USD", "EUR", [["2024-07-01", 0.92], ["2024-07-02", 0.921]], { source: "fixture" });

  const q = s.periodAverage("USD", "EUR", "2024-07-01", "2024-09-30");
  assert.equal(q.available, false);
  assert.equal(q.reason, "insufficientPeriodCoverage");
  assert.ok(q.coverage < 0.1);
});

/* ====================================================================== */
/* 11. Abweichendes Geschaeftsjahr                                         */
/* ====================================================================== */
test("M11 · Abweichendes Geschaeftsjahr: die Periode kommt aus den Daten, nicht aus dem Kalender", () => {
  /* AAR Corp schliesst am 31. Mai ab - ein echter Fall aus
     quant/data/sec/consumer/CIK0000001750.json. */
  const kette = Engine.resolvePeriodChain([
    { end: "2024-05-31", v: 2_100_000_000 },
    { end: "2025-05-31", v: 2_300_000_000 },
    { end: "2026-05-31", v: 2_500_000_000 }
  ]);

  assert.equal(kette[1].periodStart, "2024-06-01");
  assert.equal(kette[1].periodEnd, "2025-05-31");
  assert.equal(kette[1].provenance, "DERIVED_FROM_PRIOR_PERIOD");
  assert.notEqual(kette[1].periodStart, "2025-01-01", "Kein Kalenderjahr");

  /* Die erste Periode hat keinen Vorgaenger - und bekommt keinen geraten. */
  assert.equal(kette[0].periodStart, null);
  assert.equal(kette[0].provenance, "UNKNOWN");

  const s = store();
  const e = Engine.createEngine({ store: s, now: NOW });
  const fy = e.convertMetric(
    { metricId: "revenue", value: 2_300_000_000, unit: "USD", currency: "USD",
      periodStart: kette[1].periodStart, periodEnd: kette[1].periodEnd }, "EUR");
  const kalender = s.periodAverage("USD", "EUR", "2024-01-01", "2024-12-31");

  assert.equal(fy.available, true);
  assert.notEqual(fy.fx.rate, kalender.rate,
    "Das Geschaeftsjahr Jun-Mai hat einen anderen Durchschnittskurs als das Kalenderjahr");
});

/* ====================================================================== */
/* 12. EPS monetary                                                        */
/* ====================================================================== */
test("M12 · EPS ist monetaer und wird umgerechnet - EPS-Wachstum nicht (§34)", () => {
  const s = store();
  const e = Engine.createEngine({ store: s, now: NOW });

  const eps = e.convertMetric(
    { metricId: "eps_diluted", value: 4.20, unit: "USD/shares", currency: "USD",
      periodStart: "2023-10-01", periodEnd: "2024-09-28" }, "EUR");
  assert.equal(eps.currencyClass, "MONETARY_PER_SHARE");
  assert.equal(eps.converts, true);
  assert.equal(eps.fx.method, "PERIOD_AVERAGE", "EPS entsteht ueber eine Periode");
  assert.equal(eps.display.value, 4.20 * eps.fx.rate);

  const wachstum = e.convertMetric({ metricId: "epsGrowth", value: 18.0, unit: "pct" }, "EUR");
  assert.equal(wachstum.converts, false);
  assert.equal(wachstum.display.value, 18.0, "18 % bleiben 18 %");

  /* Buchwert je Aktie ist ebenfalls je Aktie - aber eine Stichtagsgroesse.
     Und zugleich der Fall aus §56: Apples Geschaeftsjahr 2024 endet am
     28.09.2024, einem SAMSTAG. Fuer einen Bilanzstichtag am Wochenende
     greift die PREVIOUS_AVAILABLE-Regel - der Freitag davor, nie der
     Montag danach. */
  const bvps = e.convertMetric(
    { metricId: "book_value_per_share", value: 12.5, unit: "USD/shares", currency: "USD",
      end: "2024-09-28", numeratorContext: "BALANCE_SHEET" }, "EUR");
  assert.equal(bvps.fx.method, "PREVIOUS_AVAILABLE");
  assert.equal(bvps.fx.asOf, "2024-09-27", "Freitag vor dem Stichtag");
  assert.ok(bvps.fx.asOf < "2024-09-28", "Kein Kurs nach dem Stichtag - kein Look-Ahead");
  assert.equal(bvps.freshness.state, "LAST_AVAILABLE");
  assert.equal(bvps.display.value, 12.5 * bvps.fx.rate);
});

/* ====================================================================== */
/* INVARIANTEN                                                             */
/* ====================================================================== */
test("I1 · Dimensionslose Kennzahlen bleiben Bit fuer Bit gleich (§33)", () => {
  const e = engine();
  const unveraendert = [
    ["operatingMargin", 31.24, "pct"], ["grossMargin", 45.9, "pct"], ["netMargin", 24.1, "pct"],
    ["fcfMargin", 22.4, "pct"], ["revenueGrowth", 18.2, "pct"], ["epsGrowth", 21.0, "pct"],
    ["roe", 34.6, "pct"], ["roa", 18.2, "pct"], ["roic", 29.9, "pct"],
    ["maxDrawdown", -34.2, "pct"], ["volatility", 28.9, "pct"],
    ["evToEbitda", 24.3, "x"], ["evToSales", 18.1, "x"], ["priceToFcf", 41.2, "x"],
    ["quantScore", 87, "score"], ["qualityScore", 92, "score"],
    ["sharesOutstanding", 24_600, "count_m"]
  ];
  for (const [metricId, value, unit] of unveraendert) {
    const m = e.convertMetric({ metricId, value, unit }, "EUR");
    assert.equal(m.converts, false, `${metricId} darf nicht umgerechnet werden`);
    assert.equal(m.display.value, value, `${metricId} hat sich veraendert`);
    assert.equal(Classifier.invariantUnderCurrencySwitch(metricId, { unit }), true);
  }
});

test("I2 · Kursrenditen sind der Sonderfall: nicht invariant, sondern neu zu berechnen (§10)", () => {
  for (const id of ["momentum12m", "priceReturn5y", "relativeStrength", "performance"]) {
    const c = Classifier.classify(id);
    assert.equal(c.currencyClass, "PRICE_RETURN");
    assert.equal(c.converts, false, "Multiplizieren waere falsch");
    assert.equal(c.recomputeFromDisplaySeries, true, "Neu berechnen ist richtig");
    assert.equal(Classifier.invariantUnderCurrencySwitch(id), false,
      "Eine Kursrendite ist NICHT invariant unter dem Waehrungswechsel - die pauschale Prozentregel waere hier falsch");
  }
});

test("I3 · Unbekannte Kennzahlen werden nicht umgerechnet", () => {
  const c = Classifier.classify("irgendwasNeues", { unit: "usd_m" });
  assert.equal(c.currencyClass, "UNKNOWN");
  assert.equal(c.converts, false);
  assert.match(c.note, /METRIC_CLASSES/, "Der Hinweis sagt, wo der Eintrag hingehoert");
});

test("I4 · Ohne Wechselkurs: native Waehrung und ehrlicher Status, nie 1:1 (§23)", () => {
  const leer = Rates.createStore();
  const e = Engine.createEngine({ store: leer, now: NOW });
  const m = e.convertMoney(181.42, "USD", "EUR", null, "CURRENT_VALUE");

  assert.equal(m.available, false);
  assert.equal(m.display.value, null, "Kein Wert in der Anzeigewaehrung");
  assert.equal(m.fallback.currency, "USD");
  assert.equal(m.fallback.value, 181.42);
  assert.equal(m.freshness.state, "UNAVAILABLE");
  assert.equal(m.freshness.displayAllowed, false);

  const f = Format.formatMoney(m);
  assert.match(f.text, /\$/, "Angezeigt wird der Dollarbetrag mit Dollarzeichen");
  assert.ok(!f.text.includes("€"), "Niemals derselbe Wert mit Eurozeichen");
  assert.equal(f.isFallback, true);
});

test("I5 · Die Berichtswaehrung wird belegt, nicht aus 'SEC' geschlossen (§16)", () => {
  assert.equal(Registry.reportingCurrency([]).currency, null);
  assert.equal(Registry.reportingCurrency([]).provenance, "UNKNOWN");

  const sek = Registry.reportingCurrency([{ unit: "usd_m", currency: "SEK", value: 1 }]);
  assert.equal(sek.currency, "SEK", "Die Einheit heisst usd_m, die Waehrung ist SEK - der Wert entscheidet");

  const gemischt = Registry.reportingCurrency([
    { unit: "usd_m", currency: "USD", value: 1 }, { unit: "usd_m", currency: "SEK", value: 2 }
  ]);
  assert.equal(gemischt.currency, null);
  assert.equal(gemischt.mixed, true, "Keine Mehrheitsentscheidung ueber die Berichtswaehrung");

  /* Kennzahlen ohne Waehrung (Verhaeltnisse, Stueckzahlen) duerfen die
     Ermittlung nicht stoeren. */
  const mitRatios = Registry.reportingCurrency([
    { unit: "ratio", currency: "", value: 1.2 },
    { unit: "count_m", currency: "", value: 24600 },
    { unit: "usd_m", currency: "USD", value: 1 }
  ]);
  assert.equal(mitRatios.currency, "USD");
});

test("I6 · Die Handelswaehrung wird nicht aus Boerse oder Land abgeleitet (§7)", () => {
  const ohne = Registry.tradingCurrency({ securityId: "sec_X", ticker: "X", exchangeId: "Nasdaq", country: "US" });
  assert.equal(ohne.currency, null);
  assert.equal(ohne.provenance, "UNKNOWN");
  assert.match(ohne.note, /Boerse oder Land/);

  const mit = Registry.tradingCurrency({ securityId: "sec_X", currency: "EUR" });
  assert.equal(mit.currency, "EUR");
  assert.equal(mit.provenance, "SOURCE_FIELD");
});

test("I7 · Formatierung veraendert den Wert nicht (§22, §52)", () => {
  const e = engine();
  const m = e.convertMoney(181.42, "USD", "EUR", null, "CURRENT_VALUE");
  const vorher = m.display.value;
  Format.formatMoney(m, { compact: true });
  Format.formatPrice(m.display.value, "EUR");
  assert.equal(m.display.value, vorher, "Der Formatter hat den Wert angefasst");

  /* Deutsche und amerikanische Skala sind nicht dieselbe Leiter. */
  assert.equal(Format.formatCompact(3.42e12, "EUR"), "3,42 Bio. €");
  assert.equal(Format.formatCompact(3.42e12, "USD"), "$3.42T");
  assert.equal(Format.formatCompact(1.186e11, "EUR"), "118,60 Mrd. €");
  assert.ok(!Format.formatCompact(1.186e11, "EUR").includes("bn"), "Keine Mischung aus bn und Mrd.");
});

test("I8 · Der Umschalter aendert Werte, nicht nur Symbole (§20, §43)", () => {
  const mem = {};
  const storage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; }, removeItem: (k) => { delete mem[k]; } };
  const layer = Contract.createLayer({ store: store(), now: NOW, storage });

  assert.equal(layer.state().displayCurrency, "EUR", "Deutschland: Vorgabe EUR");
  const eur = layer.price(181.42, "USD");
  layer.setDisplayCurrency("USD");
  const usd = layer.price(181.42, "USD");

  assert.notEqual(eur.display.value, usd.display.value, "Der Schalter aendert den Wert");
  assert.equal(usd.display.value, 181.42, "Im USD-Modus steht der native Wert");
  assert.match(eur.formatted, /€/);
  assert.match(usd.formatted, /\$/);

  /* Und die Reihe samt Performance zieht mit. */
  const punkte = [["2021-06-30", 100], ["2026-09-21", 200]];
  layer.setDisplayCurrency("EUR");
  const reiheEur = layer.series(punkte, "USD");
  layer.setDisplayCurrency("USD");
  const reiheUsd = layer.series(punkte, "USD");
  assert.notEqual(reiheEur.performance.displayReturnPct, reiheUsd.performance.displayReturnPct);
  assert.equal(reiheUsd.performance.displayReturnPct, 100);
});

test("I9 · Die Praeferenz ist produktuebergreifend - ein Schluessel, kein Produktname", () => {
  const mem = {};
  const storage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; }, removeItem: (k) => { delete mem[k]; } };

  const discover = Preference.create({ storage });
  discover.set("USD");
  const screener = Preference.create({ storage });
  assert.equal(screener.get(), "USD", "Was Discover merkt, sieht der Screener");
  assert.ok(!Preference.STORAGE_KEY.includes("discover"), "Der Schluessel gehoert keinem Produkt");

  /* Ohne Speicher bleibt alles bedienbar. */
  const ohne = Preference.create({ storage: null });
  assert.equal(ohne.get(), "EUR");
  assert.equal(ohne.set("USD").ok, true);
  assert.equal(ohne.state().persisted, false);

  /* Eine nicht mehr angebotene Waehrung faellt auf die Vorgabe zurueck. */
  mem[Preference.STORAGE_KEY] = JSON.stringify({ currency: "JPY" });
  const spaeter = Preference.create({ storage });
  assert.equal(spaeter.get(), "EUR");
  assert.equal(spaeter.state().source, "DEFAULT");
});

test("I10 · Realtime: ein FX-Stand bedient viele Ticks, ohne zweiten Stream (§11, §37)", () => {
  const s = store();
  const rt = RealtimeState.createState({ store: s, now: () => Date.parse(NOW) });

  const ticks = [];
  for (let i = 0; i < 100; i++) ticks.push(rt.decorate({ symbol: "NVDA", price: 182 + i * 0.01, currency: "USD" }, "EUR"));

  const snap = rt.snapshot();
  assert.equal(snap.stats.converted, 100);
  assert.ok(snap.stats.fxReads <= 2, `Ein Stand fuer viele Ticks, nicht einer je Tick (${snap.stats.fxReads} Abrufe)`);
  assert.ok(snap.stats.ticksPerFxRead > 10);
  assert.equal(ticks[0].currency, "USD", "Der urspruengliche Tick bleibt unveraendert");

  /* Der Stand ist ein TAGESKURS. Er ist frisch genug, um damit zu
     rechnen - aber nicht frisch genug, um das Ergebnis "Realtime EUR"
     zu nennen (§53). Der Aktienkurs ist realtime, die Umrechnung nicht. */
  assert.equal(ticks[0].fxFreshness.frequency, "DAILY");
  assert.equal(ticks[0].fxFreshness.state, "CURRENT", "Ein Tageskurs von gestern ist als Tageskurs aktuell");
  assert.equal(ticks[0].realtimeClaimAllowed, false,
    "Aber 'Realtime EUR' darf ueber einem mit dem Tagesschluss gerechneten Wert nicht stehen");
  assert.ok(ticks[0].display.value > 0, "Gerechnet wird trotzdem");
});

test("I11 · Keine doppelte Umrechnung", () => {
  const s = store();
  const rt = RealtimeState.createState({ store: s, now: () => Date.parse(NOW) });
  let tick = { symbol: "AAPL", price: 230, currency: "USD" };
  tick = rt.decorate(tick, "EUR");
  const einmal = tick.display.value;
  tick = rt.decorate(tick, "EUR");
  assert.equal(tick.display.value, einmal, "Kurs mal Kurs sieht aus wie ein Kurssturz");
  assert.equal(rt.snapshot().stats.skippedAlreadyConverted, 1);
});

test("I12 · Stale FX darf nicht 'Realtime EUR' heissen (§53)", () => {
  const alt = Rates.createStore();
  alt.ingest("USD", "EUR", [["2026-09-01", 0.85]], { source: "fixture", frequency: "DAILY" });
  const rt = RealtimeState.createState({ store: alt, now: () => Date.parse(NOW) });
  const tick = rt.decorate({ symbol: "MSFT", price: 500, currency: "USD" }, "EUR");

  assert.equal(tick.fxFreshness.state, "STALE");
  assert.equal(tick.realtimeClaimAllowed, false);
  assert.equal(tick.fxFreshness.displayAllowed, true, "Anzeigen ja");
  assert.equal(tick.fxFreshness.consumerVisible, true, "aber sichtbar gekennzeichnet");
  assert.ok(tick.display, "Der Wert wird trotzdem geliefert");
});

test("I13 · Der Vertrag aus der Methodikdatei und die Engine sagen dasselbe", () => {
  /* Eine gemeinsame Definition ohne gemeinsame Pruefung driftet
     auseinander - derselbe Befund wie bei der Bereinigungssemantik. */
  assert.equal(METHODOLOGY.methodologyVersion, Engine.CONTRACT_VERSION);
  assert.equal(METHODOLOGY.displayCurrencies.default, Registry.DEFAULT_DISPLAY_CURRENCY);
  assert.deepEqual(METHODOLOGY.displayCurrencies.supported, Registry.DISPLAY_CURRENCIES);

  for (const [name, spec] of Object.entries(METHODOLOGY.conversionContexts)) {
    assert.ok(Engine.CONTEXTS[name], `Kontext ${name} fehlt in der Engine`);
    assert.equal(Engine.CONTEXTS[name].fxMethod, spec.fxMethod, `Kontext ${name}: verschiedene FX-Methode`);
  }
  for (const [name, spec] of Object.entries(METHODOLOGY.metricClasses)) {
    assert.ok(Classifier.CLASSES[name], `Klasse ${name} fehlt in der Engine`);
    assert.equal(Classifier.CONVERTS[name], spec.converts, `Klasse ${name}: verschiedene converts-Zusage`);
  }
  for (const [state, spec] of Object.entries(METHODOLOGY.freshness)) {
    assert.equal(Freshness.RANK[state], spec.rank, `Freshness ${state}: verschiedener Rang`);
  }
  for (const [freq, spec] of Object.entries(METHODOLOGY.staleAfter)) {
    assert.equal(Freshness.STALE_AFTER[freq], spec.seconds, `staleAfter ${freq} weicht ab`);
  }
});

test("I14 · Die FX-Faehigkeiten von Tiingo sind ungeprueft und geben sich als solche (§5)", () => {
  const d = Capability.declareTiingoFx();
  for (const [cap, value] of Object.entries(d.sets.fx)) {
    assert.equal(value, null, `${cap} behauptet etwas, das niemand gemessen hat`);
  }
  assert.equal(d.verifiedAt, null);
  assert.equal(Capability.resolveRealtimeTier(d).tier, null,
    "Ohne belegte Faehigkeit gibt es keine Realtime-Stufe - auch nicht die einfachste");
  assert.equal(Capability.needsSecondSource(d).answer, "UNKNOWN",
    "Weder 'ja' noch 'nein': erst messen, dann entscheiden");
});

test("I15 · Semantik: ein umgerechneter Kurs behauptet keinen Handelsplatz (§36)", () => {
  const layer = Contract.createLayer({ store: store(), now: NOW, storage: null });
  const p = layer.price(181.42, "USD");
  assert.equal(p.semantics.kind, "CONVERTED_HOME_MARKET_QUOTE");
  assert.equal(p.semantics.tradingVenueClaim, false);
  assert.match(p.semantics.de, /kein an einer EUR-Boerse gehandelter Kurs/);

  layer.setDisplayCurrency("USD");
  assert.equal(layer.price(181.42, "USD").semantics, undefined,
    "Ohne Umrechnung gibt es auch nichts klarzustellen");
});

test("I16 · Die Reihenfolge der Transformationen ist festgelegt (§55)", () => {
  const e = engine();
  const converted = e.convertSeries([["2024-03-01", 100]], "USD", "EUR", { adjustmentStatus: "SPLIT_ADJUSTED" });
  assert.deepEqual(converted.transformationOrder, ["canonical_adjusted_native", "currency_conversion"]);
  assert.equal(converted.adjustmentStatus, "SPLIT_ADJUSTED",
    "Die Bereinigungsstufe reist mit und wird von der Umrechnung nicht neu interpretiert");
});

/* ====================================================================== */
/* O-5 · REALTIME FX: MARKTZEITEN, AUSFALL, STALE                          */
/* ====================================================================== */

test("O5-1 · Der Devisenmarkt hat einen eigenen Kalender (24/5, nicht 9:30-16:00)", () => {
  /* 2026-09-18 ist ein Freitag, 2026-09-19 ein Samstag, 2026-09-21 ein Montag. */
  assert.equal(Freshness.marketPhase("2026-09-22T12:00:00Z").phase, "OPEN", "Dienstag Mittag");
  assert.equal(Freshness.marketPhase("2026-09-18T12:00:00Z").phase, "OPEN", "Freitag Mittag");
  assert.equal(Freshness.marketPhase("2026-09-18T23:00:00Z").phase, "CLOSED_WEEKEND", "Freitag nach 22:00 UTC");
  assert.equal(Freshness.marketPhase("2026-09-19T12:00:00Z").phase, "CLOSED_WEEKEND", "Samstag");
  assert.equal(Freshness.marketPhase("2026-09-20T12:00:00Z").phase, "CLOSED_WEEKEND", "Sonntag vor 22:00 UTC");
  assert.equal(Freshness.marketPhase("2026-09-20T23:00:00Z").phase, "OPEN", "Sonntag nach Eroeffnung");

  /* Und ausdruecklich NICHT der Aktienkalender: mitten in der Nacht am
     Mittwoch laeuft Devisenhandel, eine Aktienboerse nicht. */
  assert.equal(Freshness.marketPhase("2026-09-23T03:00:00Z").phase, "OPEN");
});

test("O5-2 · Wochenende ist kein Stoerfall, ein stehengebliebener Kurs schon", () => {
  const now = "2026-09-19T12:00:00Z";                    // Samstag

  /* Ein Stand von kurz vor Marktschluss am Freitag: der geltende Kurs. */
  const freitagsschluss = Freshness.assess(
    { available: true, method: "LATEST_AVAILABLE", asOf: "2026-09-18T21:55:00Z", frequency: "REALTIME" },
    { now, frequency: "REALTIME" });
  assert.equal(freitagsschluss.state, "LAST_AVAILABLE",
    "Am Wochenende ist der Freitagsschluss aktuell, nicht veraltet");
  assert.equal(freitagsschluss.marketOpen, false);
  assert.equal(freitagsschluss.displayAllowed, true);
  assert.equal(freitagsschluss.realtimeClaimAllowed, false, "aber 'Realtime' darf er trotzdem nicht heissen");

  /* Ein Stand, der schon am Mittwoch stehen blieb: eine Luecke, die das
     Wochenende nicht erklaert. */
  const mittwoch = Freshness.assess(
    { available: true, method: "LATEST_AVAILABLE", asOf: "2026-09-16T10:00:00Z", frequency: "REALTIME" },
    { now, frequency: "REALTIME" });
  assert.equal(mittwoch.state, "STALE");
  assert.equal(mittwoch.reason, "staleBeforeMarketClose");
  assert.match(mittwoch.detail, /kein Wochenende/);

  /* Und am offenen Markt gilt die Toleranz ohne Milde. */
  const dienstag = Freshness.assess(
    { available: true, method: "LATEST_AVAILABLE", asOf: "2026-09-22T11:00:00Z", frequency: "REALTIME" },
    { now: "2026-09-22T12:00:00Z", frequency: "REALTIME" });
  assert.equal(dienstag.state, "STALE", "Eine Stunde alt bei offenem Markt ist nicht aktuell");
  assert.equal(dienstag.marketOpen, true);
});

test("O5-3 · Anbieterausfall wird als solcher benannt, nicht als ruhiger Markt", () => {
  const leer = Rates.createStore();
  let now = Date.parse("2026-09-22T12:00:00Z");
  const rt = RealtimeState.createState({ store: leer, now: () => now, refreshSeconds: 0 });

  assert.equal(rt.outageState("USD", "EUR").state, "UNKNOWN", "Vor der ersten Abfrage gibt es keinen Zustand");

  rt.decorate({ symbol: "X", price: 100, currency: "USD" }, "EUR");
  assert.equal(rt.outageState("USD", "EUR").state, "DEGRADED", "Ein Aussetzer ist noch kein Ausfall");

  rt.decorate({ symbol: "X", price: 100, currency: "USD" }, "EUR");
  rt.decorate({ symbol: "X", price: 100, currency: "USD" }, "EUR");
  const o = rt.outageState("USD", "EUR");
  assert.equal(o.state, "PROVIDER_OUTAGE");
  assert.equal(o.consecutiveFailures, 3);
});

test("O5-4 · Im Ausfall bleibt der letzte gueltige Stand gueltig - und altert sichtbar", () => {
  /* Ein Store, der erst liefert und dann nicht mehr. */
  const store = Rates.createStore();
  store.ingest("EUR", "USD", [["2026-09-22", 1.1726]], { source: "tiingo", frequency: "DAILY" });
  let now = Date.parse("2026-09-22T12:00:00Z");
  const rt = RealtimeState.createState({ store, now: () => now, refreshSeconds: 60 });

  const erster = rt.decorate({ symbol: "AAPL", price: 230, currency: "USD" }, "EUR");
  assert.equal(erster.fxOutage.state, "OK");
  assert.ok(erster.display.value > 0);
  const rate = erster.fx.rate;

  /* Die Quelle faellt aus: ein Store ohne Paare, derselbe Zustand. */
  const ausfall = RealtimeState.createState({
    store: { latest: () => ({ available: false, reason: "providerDown" }), rateAt: () => ({ available: false }) },
    now: () => now, refreshSeconds: 0
  });
  const waehrendAusfall = ausfall.decorate({ symbol: "AAPL", price: 230, currency: "USD" }, "EUR");
  assert.equal(waehrendAusfall.display, null, "Ohne je gueltigen Stand gibt es keine Anzeige in EUR");
  assert.equal(waehrendAusfall.fxFreshness.state, "UNAVAILABLE");
  assert.equal(waehrendAusfall.realtimeClaimAllowed, false);

  /* Der Cache haelt den zuletzt gueltigen Stand - aber ohne den
     Zeitstempel aufzufrischen. */
  now += 3600_000;
  const spaeter = rt.decorate({ symbol: "AAPL", price: 231, currency: "USD" }, "EUR");
  assert.equal(spaeter.fx.rate, rate, "Derselbe Stand, nicht neu erfunden");
});

test("O5-5 · Keine FX-Anfrage je Tick, auch nicht bei vielen Titeln", () => {
  const store = Rates.createStore();
  store.ingest("EUR", "USD", [["2026-09-22", 1.1726]], { source: "tiingo", frequency: "DAILY" });
  const now = Date.parse("2026-09-22T12:00:00Z");
  const rt = RealtimeState.createState({ store, now: () => now, refreshSeconds: 60 });

  /* 500 Ticks ueber 50 verschiedene Titel - alle in USD, alle nach EUR. */
  for (let i = 0; i < 500; i++) {
    rt.decorate({ symbol: "T" + (i % 50), price: 100 + i * 0.01, currency: "USD" }, "EUR");
  }
  const snap = rt.snapshot();
  assert.equal(snap.stats.converted, 500);
  assert.ok(snap.stats.fxReads <= 2,
    `500 Ticks, 50 Titel, aber nur ${snap.stats.fxReads} FX-Abruf(e) - ein Stand bedient alle (O-5)`);
  assert.ok(snap.stats.ticksPerFxRead >= 250);
  assert.equal(snap.pairs.length, 1, "Ein Paar im Cache, nicht 50");
});

test("O5-6 · Verfuegbare und gefahrene Realtime-Stufe sind zwei Angaben", () => {
  /* Der gemessene Stand aus dem Produktivlauf: fxRealtime ist belegt. */
  const gemessen = require("node:module").createRequire(import.meta.url)(
    join(ROOT, "quant", "engines", "capabilities.js")).declare("tiingo", {
    fx: { fxCurrent: true, fxDaily: true, fxHistoricalDaily: true, fxIntraday: true,
          fxRealtime: true, fxCrossPairs: false, fxBulkQuotes: null, fxWebsocket: null }
  });
  const tier = Capability.resolveRealtimeTier(gemessen);

  assert.equal(tier.available, "C", "Der Zugang gibt Realtime-FX her");
  assert.equal(tier.recommended, "A", "Gefahren wird trotzdem A (O-5: keine FX-Anfrage je Tick)");
  assert.equal(tier.tier, "A", "Wer nur ein Feld liest, soll den Betriebszustand sehen");
  assert.equal(tier.upgradePossible, true);
  assert.match(tier.reason, /Owner-Entscheidung/);

  /* Ohne belegtes fxCurrent gibt es keine Stufe - auch nicht die
     einfachste. */
  const ungeprueft = Capability.declareTiingoFx();
  assert.equal(Capability.resolveRealtimeTier(ungeprueft).tier, null);
});
