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

  /* O-14: die Aufloesungsklassen und ihre Rangfolge stehen in der
     Methodik UND im Code. Wer nur eine der beiden aendert, faellt hier
     durch - und genau dafuer gibt es diesen Test. */
  const klassen = METHODOLOGY.sourceHierarchy.classes;
  assert.deepEqual(Object.keys(klassen).sort(), Object.keys(Rates.CLASSES).sort(),
    "Die Methodik kennt andere Klassen als die Engine");
  for (const [name, spec] of Object.entries(klassen)) {
    assert.equal(Providers.roleFor(spec.PRIMARY, name), "PRIMARY",
      `${name}: ${spec.PRIMARY} ist in der Registry nicht PRIMARY`);
    assert.equal(Providers.roleFor(spec.FALLBACK, name), "FALLBACK",
      `${name}: ${spec.FALLBACK} ist in der Registry nicht FALLBACK`);
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

/* ====================================================================== */
/* ABDECKUNG: EIN NICHT GEFUEHRTES PAAR IST NICHT UNBEDIENT                */
/* ====================================================================== */

test("C1 · Ein Paar ohne eigene Reihe gilt als abgedeckt, wenn die Engine es bildet", () => {
  /* Der Fall aus dem Produktivlauf: der Anbieter fuehrt usdcny und
     eurusd, aber kein cnyeur. Die Abdeckungskarte meldete CNY/EUR
     deshalb als unbedient - mit 124 betroffenen Titeln und dem Zusatz
     "bleiben in der Originalwaehrung". Im selben Lauf rechnete Alibaba
     korrekt in Euro.

     Die Karte mass das Abrufprotokoll statt der Engine. Dieser Test
     haelt die Unterscheidung fest. */
  const s = Rates.createStore();
  s.ingest("EUR", "USD", [["2026-09-21", 1.1726]], { source: "tiingo", frequency: "DAILY" });
  s.ingest("USD", "CNY", [["2026-09-21", 7.0820]], { source: "tiingo", frequency: "DAILY" });

  /* Direkt gefuehrt ist CNY/EUR nicht. */
  assert.equal(s.has("CNY", "EUR"), false);
  assert.equal(s.has("EUR", "CNY"), false);

  /* Aufloesbar ist es trotzdem - und genau das ist die Frage, die eine
     Abdeckungskarte beantworten muss. */
  const hit = s.rateAt("CNY", "EUR", null);
  assert.equal(hit.available, true, "CNY/EUR muss ueber das Pivot aufloesen");
  assert.equal(hit.derivation, "TRIANGULATED");
  assert.deepEqual(hit.legs, ["USD/CNY", "USD/EUR"]);

  /* Und die Zahl muss stimmen: 1 CNY sind 1/7,0820 USD, und 1 USD sind
     1/1,1726 EUR. */
  const erwartet = (1 / 7.0820) / 1.1726;
  assert.ok(Math.abs(hit.rate - erwartet) < 1e-12,
    `Kreuzkurs ${hit.rate} weicht von der Handrechnung ${erwartet} ab`);

  /* Ein Betrag geht denselben Weg. */
  const e = Engine.createEngine({ store: s, now: NOW });
  const m = e.convertMoney(1_023_670_000_000, "CNY", "EUR", null, "CURRENT_VALUE");
  assert.equal(m.available, true);
  assert.equal(m.fx.derivation, "TRIANGULATED");
  assert.ok(Math.abs(m.display.value - 1_023_670_000_000 * erwartet) < 1e-3);
});

test("C2 · Eine Waehrung ohne jedes Bein bleibt unbedient - und sagt es", () => {
  const s = Rates.createStore();
  s.ingest("EUR", "USD", [["2026-09-21", 1.1726]], { source: "tiingo", frequency: "DAILY" });

  /* Kein USD/AFN, kein AFN/irgendwas: hier hilft auch das Pivot nicht. */
  const hit = s.rateAt("AFN", "EUR", null);
  assert.equal(hit.available, false);
  assert.equal(hit.rate, null);

  const e = Engine.createEngine({ store: s, now: NOW });
  const m = e.convertMoney(1_000_000, "AFN", "EUR", null, "CURRENT_VALUE");
  assert.equal(m.available, false);
  assert.equal(m.display.value, null);
  assert.equal(m.fallback.currency, "AFN", "Der Wert bleibt in seiner Waehrung");
  assert.equal(m.fallback.value, 1_000_000);
});

/* ====================================================================== */
/* PROVIDER-RANGFOLGE UND HERKUNFT (O-7)                                   */
/* ====================================================================== */

const Providers = require(join(FX, "fx-provider-registry.js"));

test("P1 · Die historische Reihe kommt aus EINER Quelle, der Uebergang liegt an der Gegenwart", () => {
  const s = Rates.createStore();
  /* Die Lage aus der Messung: die EZB reicht bis 1999 zurueck und
     veroeffentlicht bis gestern; Tiingo beginnt 2020 und traegt
     zusaetzlich den aktuellen Stand. */
  s.ingest("EUR", "USD", [["2015-06-01", 1.0888], ["2015-06-02", 1.1150],
                          ["2020-03-30", 1.1005], ["2026-09-19", 1.1490]],
    Providers.ingestMeta("ecb", { frequency: "DAILY" }));
  s.ingest("EUR", "USD", [["2020-03-30", 1.1010], ["2026-09-19", 1.1726]],
    Providers.ingestMeta("tiingo", { frequency: "DAILY" }));

  /* VOR dem Beginn der Anbieterhistorie: EZB, und zwar als PRIMARY
     dieser Klasse - nicht als Lueckenfueller. */
  const alt = s.rateAt("EUR", "USD", "2015-06-02");
  assert.equal(alt.provenance.source, "ecb");
  assert.equal(alt.provenance.role, "PRIMARY");
  assert.equal(alt.provenance.resolutionClass, "HISTORICAL_DAILY");

  /* NACH dem Beginn der Anbieterhistorie: immer noch EZB. Genau das ist
     der Punkt von O-14 - haette hier Tiingo uebernommen, laege im Chart
     an dieser Stelle ein Sprung, der nicht aus dem Markt stammt. */
  const spaet = s.rateAt("EUR", "USD", "2026-09-19");
  assert.equal(spaet.provenance.source, "ecb", "Kein Quellenwechsel mitten in der historischen Reihe");
  assert.equal(spaet.rate, 1.1490);
  assert.deepEqual(spaet.provenance.consideredSources, [],
    "Die historische Hauptquelle liefert; es wird nichts uebergangen");

  /* Die Gegenwart gehoert Tiingo. Derselbe Store, dieselben Reihen -
     nur die FRAGE ist eine andere. */
  const jetzt = s.latest("EUR", "USD");
  assert.equal(jetzt.provenance.source, "tiingo");
  assert.equal(jetzt.provenance.role, "PRIMARY");
  assert.equal(jetzt.provenance.resolutionClass, "CURRENT");
  assert.equal(jetzt.rate, 1.1726);
});

test("P1b · Wo die historische Hauptquelle nichts hat, traegt Tiingo - als FALLBACK", () => {
  /* ARS, CLP, COP, PEN und TWD veroeffentlicht die EZB nicht. Dort ist
     die Rangfolge nicht leer, sondern kippt - gemessen an denselben
     Regeln, nicht als Sonderfall. */
  const s = Rates.createStore();
  s.ingest("EUR", "TWD", [["2026-09-19", 37.42]], Providers.ingestMeta("tiingo", { frequency: "DAILY" }));
  const q = s.rateAt("EUR", "TWD", "2026-09-19");
  assert.equal(q.provenance.source, "tiingo");
  assert.equal(q.provenance.role, "FALLBACK", "Historisch ist Tiingo die zweite Wahl - auch wenn es die einzige ist");
  assert.equal(q.provenance.resolutionClass, "HISTORICAL_DAILY");
});

test("P2 · Die Rangfolge ist deterministisch, nicht von der Ingest-Reihenfolge abhaengig", () => {
  function build(order) {
    const s = Rates.createStore();
    for (const src of order) {
      s.ingest("EUR", "USD", [["2026-09-21", src === "tiingo" ? 1.1726 : 1.1700]],
        Providers.ingestMeta(src, { frequency: "DAILY" }));
    }
    return s.rateAt("EUR", "USD", "2026-09-21");
  }
  const a = build(["tiingo", "ecb"]);
  const b = build(["ecb", "tiingo"]);
  assert.equal(a.provenance.source, "ecb", "Historisch fuehrt die EZB");
  assert.equal(b.provenance.source, "ecb", "Wer zuerst eingespielt wurde, darf keine Rolle spielen");
  assert.equal(a.rate, b.rate);
});

test("P3 · Die Herkunft ueberlebt Inversion und Triangulation", () => {
  const s = Rates.createStore();
  s.ingest("EUR", "USD", [["2026-09-21", 1.1726]], Providers.ingestMeta("tiingo", { frequency: "DAILY" }));
  s.ingest("EUR", "CHF", [["2026-09-21", 0.9351]], Providers.ingestMeta("ecb", { frequency: "DAILY" }));

  /* Invers: EUR/USD liegt vor, USD/EUR wird gebildet. */
  const inv = s.rateAt("USD", "EUR", "2026-09-21");
  assert.equal(inv.derivation, "INVERSE");
  assert.equal(inv.provenance.source, "tiingo");
  assert.equal(inv.provenance.role, "FALLBACK",
    "role darf bei der Inversion nicht verlorengehen - und sie ist die der ANGEFRAGTEN Klasse");
  assert.equal(inv.provenance.resolutionClass, "HISTORICAL_DAILY");

  /* Trianguliert ueber EUR, mit Beinen aus zwei Quellen. */
  const cross = s.rateAt("USD", "CHF", "2026-09-21");
  assert.equal(cross.derivation, "TRIANGULATED");
  assert.equal(cross.provenance.role, "MIXED", "Ein Kreuz aus zwei Rollen ist keine davon");
  assert.match(cross.provenance.source, /tiingo/);
  assert.match(cross.provenance.source, /ecb/);
  /* Die Handrechnung: USD/CHF = (EUR/CHF) / (EUR/USD). */
  assert.ok(Math.abs(cross.rate - 0.9351 / 1.1726) < 1e-12);
});

test("P4 · Zwei Pivots, weil die Quellen verschieden notieren", () => {
  /* Tiingo notiert gegen USD, die EZB gegen EUR. Mit nur einem Pivot
     bliebe je nach Quelle die Haelfte der Kreuze unbildbar. */
  const nurEur = Rates.createStore();
  nurEur.ingest("EUR", "CNY", [["2026-09-21", 8.3016]], Providers.ingestMeta("ecb", { frequency: "DAILY" }));
  nurEur.ingest("EUR", "CHF", [["2026-09-21", 0.9351]], Providers.ingestMeta("ecb", { frequency: "DAILY" }));
  assert.equal(nurEur.rateAt("CNY", "CHF", "2026-09-21").available, true, "Kreuz ueber EUR");

  const nurUsd = Rates.createStore();
  nurUsd.ingest("USD", "CNY", [["2026-09-21", 7.0820]], Providers.ingestMeta("tiingo", { frequency: "DAILY" }));
  nurUsd.ingest("USD", "CHF", [["2026-09-21", 0.7975]], Providers.ingestMeta("tiingo", { frequency: "DAILY" }));
  assert.equal(nurUsd.rateAt("CNY", "CHF", "2026-09-21").available, true, "Kreuz ueber USD");

  assert.deepEqual(Rates.PIVOTS, ["USD", "EUR"], "Die Reihenfolge ist fest, nicht 'welcher gerade passt'");
});

/* ====================================================================== */
/* LIZENZ JE WERT (O-11)                                                   */
/* ====================================================================== */

test("L1 · Die Anzeigeerlaubnis haengt an der Quelle des Kurses, nicht am Produkt", () => {
  const s = Rates.createStore();
  s.ingest("EUR", "USD", [["2018-06-01", 1.1660]], Providers.ingestMeta("ecb", { frequency: "DAILY" }));
  s.ingest("EUR", "USD", [["2026-09-21", 1.1726]], Providers.ingestMeta("tiingo", { frequency: "DAILY" }));
  const e = Engine.createEngine({ store: s, now: NOW });

  const alt = e.convertMoney(100, "USD", "EUR", "2018-06-01", "MARKET_PRICE");
  const neu = e.convertMoney(100, "USD", "EUR", "2026-09-21", "MARKET_PRICE");

  assert.equal(alt.publicDisplayAllowed, true, "EZB-Kurse duerfen gezeigt werden - Quelle wird genannt");
  assert.ok(alt.attribution && alt.attribution.length, "und die Nennung reist mit dem Wert");
  assert.equal(neu.publicDisplayAllowed, false,
    "Tiingo-FX: die Vertragsfrage ist offen, also keine oeffentliche Anzeige (O-11 C)");

  /* Beide sind trotzdem gerechnet - interne Nutzung ist erlaubt. */
  assert.equal(alt.conversionAvailable, true);
  assert.equal(neu.conversionAvailable, true);
});

test("L2 · Ein Kreuz erbt die strengere Bedingung", () => {
  const frei = Providers.displayPermission("ecb");
  const gesperrt = Providers.displayPermission("tiingo");
  const gemischt = Providers.displayPermission("tiingo+ecb");

  assert.equal(frei.publicDerivedDisplayAllowed, true);
  assert.equal(gesperrt.publicDerivedDisplayAllowed, false);
  assert.equal(gemischt.publicDerivedDisplayAllowed, false,
    "Der gesperrte Kurs steckt rechnerisch im Kreuz - also ist das Kreuz gesperrt");
  assert.equal(gemischt.role, "MIXED");
});

test("L3 · Der Fast Path braucht keine Lizenz, eine unbekannte Quelle bekommt keine", () => {
  assert.equal(Providers.displayPermission("identity").publicDerivedDisplayAllowed, true,
    "Ohne Wechselkurs gibt es nichts zu lizenzieren");
  assert.equal(Providers.displayPermission("irgendein-anbieter").publicDerivedDisplayAllowed, false,
    "Eine Erlaubnis entsteht nicht dadurch, dass niemand widerspricht");
  assert.ok(Providers.escalation(), "Die offene Vertragsfrage ist abrufbar, nicht nur dokumentiert");
  assert.equal(Providers.escalation().state, "OWNER_CONFIRMATION_REQUIRED");
  assert.equal(Providers.escalation().id, "LICENSE_DISPLAY_DERIVED_FX");
  assert.match(Providers.escalation().questionForTiingo, /ohne die rohe FX-Zeitreihe zu redistribuieren/,
    "Die exakte Frage steht im Code-Pfad, nicht nur im Dokument");
});

/* ====================================================================== */
/* INTRADAY-FX-STATE (O-9)                                                 */
/* ====================================================================== */

test("O9-1 · Ein Stand je Paar, nicht je Aktie und nicht je Tick", () => {
  const s = Rates.createStore();
  s.ingest("EUR", "USD", [["2026-09-21", 1.1726]], Providers.ingestMeta("tiingo", { frequency: "DAILY" }));
  s.ingestCurrent("EUR", "USD", { rate: 1.1731, asOf: "2026-09-22T11:55:00Z",
    ...Providers.ingestMeta("tiingo", { frequency: "INTRADAY" }) });

  const rt = RealtimeState.createState({ store: s, now: () => Date.parse(NOW), refreshSeconds: 60 });
  for (let i = 0; i < 300; i++) {
    rt.decorate({ symbol: "T" + (i % 40), price: 100 + i, currency: "USD" }, "EUR");
  }
  const snap = rt.snapshot();
  assert.equal(snap.stats.converted, 300);
  assert.ok(snap.stats.fxReads <= 2, `300 Ticks ueber 40 Titel, ${snap.stats.fxReads} FX-Abruf(e)`);
  assert.equal(snap.pairs.length, 1, "Ein Paar im Cache, nicht 40");
});

test("O9-2 · Ein Intraday-Stand traegt den Realtime-Anspruch, ein Tageskurs nicht", () => {
  function claim(stateAsOf) {
    const s = Rates.createStore();
    s.ingest("EUR", "USD", [["2026-09-21", 1.1726]], Providers.ingestMeta("tiingo", { frequency: "DAILY" }));
    if (stateAsOf) {
      s.ingestCurrent("EUR", "USD", { rate: 1.1731, asOf: stateAsOf,
        ...Providers.ingestMeta("tiingo", { frequency: "INTRADAY" }) });
    }
    const rt = RealtimeState.createState({ store: s, now: () => Date.parse(NOW), refreshSeconds: 0 });
    return rt.decorate({ symbol: "AAPL", price: 230, currency: "USD" }, "EUR");
  }

  const nurTag = claim(null);
  assert.equal(nurTag.fxFreshness.frequency, "DAILY");
  assert.equal(nurTag.realtimeClaimAllowed, false);

  const frisch = claim("2026-09-22T11:50:00Z");       // 10 Minuten
  assert.equal(frisch.fxFreshness.frequency, "INTRADAY");
  assert.equal(frisch.fxFreshness.state, "CURRENT");
  assert.equal(frisch.realtimeClaimAllowed, true, "Frischer Intraday-Stand traegt den Anspruch (O-9)");

  const alt = claim("2026-09-22T10:00:00Z");          // 2 Stunden
  assert.equal(alt.fxFreshness.state, "STALE");
  assert.equal(alt.realtimeClaimAllowed, false, "Ein stale FX darf keinen vollstaendig aktuellen EUR-Wert behaupten");
  assert.equal(alt.fxFreshness.consumerVisible, true, "und der Zustand wird sichtbar");
  assert.ok(alt.display, "Gerechnet wird trotzdem");
});

test("O9-3 · Der Stand geht nur vorwaerts, und die Historie sieht ihn nie", () => {
  const s = Rates.createStore();
  s.ingest("EUR", "USD", [["2026-09-21", 1.1726]], Providers.ingestMeta("tiingo", { frequency: "DAILY" }));

  assert.equal(s.ingestCurrent("EUR", "USD", { rate: 1.1731, asOf: "2026-09-22T11:55:00Z", source: "tiingo" }).accepted, true);
  const zurueck = s.ingestCurrent("EUR", "USD", { rate: 9.99, asOf: "2026-09-22T09:00:00Z", source: "tiingo" });
  assert.equal(zurueck.accepted, false, "Ein verspaeteter aelterer Tick darf keinen Ruecksprung erzeugen");
  assert.equal(zurueck.reason, "olderThanStored");

  /* Und die historische Abfrage bleibt unberuehrt. */
  const hist = s.rateAt("EUR", "USD", "2026-09-21");
  assert.equal(hist.rate, 1.1726);
  assert.equal(hist.frequency, "DAILY");
  assert.notEqual(hist.asOf, "2026-09-22T11:55:00Z",
    "Der Kurs von jetzt hat in einer historischen Umrechnung nichts zu suchen");

  /* Ungueltiges wird abgewiesen, nicht gespeichert. */
  assert.equal(s.ingestCurrent("EUR", "USD", { rate: 0, asOf: "2026-09-22T12:00:00Z" }).accepted, false);
  assert.equal(s.ingestCurrent("EUR", "USD", { rate: 1.17, asOf: "nicht-datum" }).accepted, false);
});

/* ====================================================================== */
/* EUR | USD SWITCH CONTRACT                                               */
/* ====================================================================== */

test("SW1 · Der Switch tauscht Werte, nicht Symbole - ueber Kurs, Reihe und Kennzahl", () => {
  const s = Rates.createStore();
  /* Eine Reihe mit echtem FX-Verlauf: der Kurs bewegt sich, also muessen
     USD- und EUR-Performance auseinanderlaufen. */
  s.ingest("EUR", "USD", [
    ["2021-09-10", 1.1815], ["2023-09-08", 1.0700], ["2026-09-10", 1.1726]
  ], Providers.ingestMeta("tiingo", { frequency: "DAILY" }));

  const layer = Contract.createLayer({ store: s, now: NOW, storage: null });
  const punkte = [["2021-09-10", 148.97], ["2023-09-08", 178.18], ["2026-09-10", 326.57]];

  layer.setDisplayCurrency("EUR");
  assert.equal(layer.state().displayCurrency, "EUR", "Deutschland: Vorgabe EUR");
  const eur = layer.series(punkte, "USD");
  const eurKurs = layer.price(326.57, "USD");

  layer.setDisplayCurrency("USD");
  const usd = layer.series(punkte, "USD");
  const usdKurs = layer.price(326.57, "USD");

  /* 1. Der Kurs. */
  assert.notEqual(eurKurs.display.value, usdKurs.display.value);
  assert.equal(usdKurs.display.value, 326.57, "Im USD-Modus steht der native Wert");

  /* 2. Jeder Punkt der Reihe mit dem FX SEINES Tages. */
  const raten = eur.points.map((p) => p.rate);
  assert.equal(new Set(raten).size, 3, "Drei Punkte, drei verschiedene FX-Staende");
  for (let i = 0; i < punkte.length; i++) {
    const erwartet = punkte[i][1] * s.rateAt("USD", "EUR", punkte[i][0]).rate;
    assert.ok(Math.abs(eur.displaySeries[i] - erwartet) < 1e-9);
  }

  /* 3. Die Performance weicht ab - und das ist der Punkt. */
  assert.equal(usd.performance.displayReturnPct, usd.performance.nativeReturnPct);
  assert.notEqual(eur.performance.displayReturnPct, eur.performance.nativeReturnPct);
  assert.ok(Math.abs(eur.performance.currencyEffectPp) > 1,
    `Waehrungseffekt ${eur.performance.currencyEffectPp} - bei 1,18 auf 1,17 und zwischendurch 1,07 muss er spuerbar sein`);

  /* 4. Und die Zerlegung geht auf. */
  const linke = 1 + eur.performance.displayReturnPct / 100;
  const rechte = (1 + eur.performance.nativeReturnPct / 100) *
    (eur.points[eur.points.length - 1].rate / eur.points[0].rate);
  assert.ok(Math.abs(linke - rechte) < 1e-9);
});

test("SW2 · Was der Switch NICHT anfasst", () => {
  const s = Rates.createStore();
  s.ingest("EUR", "USD", [["2026-09-21", 1.1726]], Providers.ingestMeta("tiingo", { frequency: "DAILY" }));
  const layer = Contract.createLayer({ store: s, now: NOW, storage: null });

  const unveraendert = [
    { metricId: "operatingMargin", value: 31.24, unit: "pct" },
    { metricId: "roic", value: 29.91, unit: "pct" },
    { metricId: "revenueGrowth", value: 18.2, unit: "pct" },
    { metricId: "epsGrowth", value: 21.0, unit: "pct" },
    { metricId: "evToEbitda", value: 24.3, unit: "x" },
    { metricId: "priceToBook", value: 8.4, unit: "x" },
    { metricId: "quantScore", value: 87, unit: "score" },
    { metricId: "maxDrawdown", value: -34.2, unit: "pct" },
    { metricId: "sharesOutstanding", value: 24600, unit: "count_m" }
  ];

  for (const fact of unveraendert) {
    layer.setDisplayCurrency("EUR");
    const eur = layer.metric(fact);
    layer.setDisplayCurrency("USD");
    const usd = layer.metric(fact);
    assert.equal(eur.display.value, fact.value, `${fact.metricId} hat sich im EUR-Modus veraendert`);
    assert.equal(usd.display.value, fact.value, `${fact.metricId} hat sich im USD-Modus veraendert`);
    assert.equal(eur.converts, false);
  }
});

test("SW3 · Die Praeferenz gilt produktuebergreifend und ueberlebt den Neustart", () => {
  const mem = {};
  const storage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; }, removeItem: (k) => { delete mem[k]; } };
  const s = Rates.createStore();
  s.ingest("EUR", "USD", [["2026-09-21", 1.1726]], Providers.ingestMeta("tiingo", { frequency: "DAILY" }));

  const discover = Contract.createLayer({ store: s, now: NOW, storage });
  assert.equal(discover.state().displayCurrency, "EUR");
  discover.setDisplayCurrency("USD");

  /* Ein zweites Produkt, dieselbe Sitzung. */
  const screener = Contract.createLayer({ store: s, now: NOW, storage });
  assert.equal(screener.state().displayCurrency, "USD", "Was Discover merkt, sieht der Screener");

  /* Und ein Neustart. */
  const spaeter = Contract.createLayer({ store: s, now: NOW, storage });
  assert.equal(spaeter.state().displayCurrency, "USD");
  assert.equal(spaeter.state().source, "USER");
});

test("SW4 · O-13: ein Titel ohne FX-Pfad bleibt im Produkt", () => {
  const s = Rates.createStore();
  s.ingest("EUR", "USD", [["2026-09-21", 1.1726]], Providers.ingestMeta("tiingo", { frequency: "DAILY" }));
  const layer = Contract.createLayer({ store: s, now: NOW, storage: null });

  const ohne = layer.money(1_000_000, "AFN", null, "CURRENT_VALUE");
  assert.equal(ohne.conversionAvailable, false);
  assert.equal(ohne.conversionUnavailableReason, "conversionUnavailable");
  assert.equal(ohne.displayState, "NATIVE_CURRENCY", "Nicht UNAVAILABLE - der Wert ist da, nur nicht in EUR");
  assert.equal(ohne.native.value, 1_000_000, "Der Originalwert bleibt vollstaendig erhalten");
  assert.equal(ohne.native.currency, "AFN");
  assert.match(ohne.formatted, /1\.000\.000/, "und er wird angezeigt");
  assert.ok(ohne.displayNote, "mit einem Satz, der sagt warum");

  /* Ausdruecklich NICHT: ein EUR-Zeichen an einer AFN-Zahl. */
  assert.ok(!ohne.formatted.includes("€"));
});

/* ====================================================================== */
/* O-12 · MIGRATION: DIE DARSTELLUNG WANDERT, OHNE SICH ZU AENDERN         */
/* ====================================================================== */

test("M12-1 · Der zentrale Formatter reproduziert die bisherige Discover-Darstellung", () => {
  /* Die Migration der Klasse-A-Stellen darf das Aussehen nicht aendern -
     eine Migration, die nebenbei das Produkt umgestaltet, ist ein
     Redesign, und das ist ausdruecklich nicht der Auftrag (§28, §48).

     Die alte Formatierung steht hier als Gegenprobe. Sie ist bewusst
     kopiert und nicht importiert: waere sie importiert, wuerde der Test
     bei einer Aenderung der Quelle stillschweigend mitwandern und
     nichts mehr festhalten. */
  function alteDiscoverForm(v, unit) {
    if (unit === "USD/shares") return (Math.round(v * 100) / 100).toFixed(2).replace(".", ",") + " $";
    const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(1).replace(".", ",") + " Mrd. $";
    if (a >= 1e6) return (v / 1e6).toFixed(0) + " Mio. $";
    return Math.round(v).toLocaleString("de-DE") + " $";
  }
  function neueForm(v, unit) {
    const cur = (typeof unit === "string" && unit.indexOf("/") > 0) ? unit.split("/")[0] : (unit || "USD");
    const a = Math.abs(v);
    return (unit === "USD/shares")
      ? Format.formatPrice(v, cur, { numberLocale: "de-DE", decimals: 2 })
      : (a >= 1e6
          ? Format.formatCompact(v, cur, { numberLocale: "de-DE", decimals: a >= 1e9 ? 1 : 0 })
          : Format.formatPrice(v, cur, { numberLocale: "de-DE", decimals: 0 }));
  }

  for (const [v, unit] of [[4.2, "USD/shares"], [326.57, "USD"], [1234, "USD"], [45678, "USD"],
                           [1.186e11, "USD"], [5.4e9, "USD"], [8.42e8, "USD"], [2.5e6, "USD"], [999999, "USD"]]) {
    assert.equal(neueForm(v, unit), alteDiscoverForm(v, unit), `${v} ${unit} sieht anders aus als vorher`);
  }

  /* Die EINE beabsichtigte Abweichung, und sie ist eine Korrektur: der
     alte Formatter kannte keine Billionenstufe und schrieb bei einer
     Marktkapitalisierung von 3,42 Bio. "3420,0 Mrd. $" - genau die
     unleserliche Form, die §52 untersagt. */
    assert.equal(alteDiscoverForm(3.42e12, "USD"), "3420,0 Mrd. $");
  assert.equal(neueForm(3.42e12, "USD"), "3,4 Bio. $");
});

test("M12-2 · Der zentrale Formatter reproduziert die Hedgefonds-Darstellung", () => {
  function alteHedgefondsForm(n) {
    const s = n < 0 ? "-" : "", a = Math.abs(n);
    if (a >= 1e12) return s + "$" + (Math.round(a / 1e12 * 100) / 100).toString().replace(/\.?0+$/, "") + "T";
    if (a >= 1e9) return s + "$" + (Math.round(a / 1e9 * 10) / 10).toString().replace(/\.0$/, "") + "B";
    if (a >= 1e6) return s + "$" + (Math.round(a / 1e6 * 10) / 10).toString().replace(/\.0$/, "") + "M";
    if (a >= 1e3) return s + "$" + (Math.round(a / 1e3 * 10) / 10).toString().replace(/\.0$/, "") + "K";
    return s + "$" + Math.round(a);
  }
  function neueForm(n) {
    const a = Math.abs(n);
    return a >= 1e3
      ? Format.formatCompact(n, "USD", { decimals: a >= 1e12 ? 2 : 1, trimZeros: true })
      : Format.formatPrice(n, "USD", { decimals: 0 });
  }
  for (const v of [3.42e12, 3.4e12, 5.4e9, 5e9, 842e6, 2.5e6, 45e3, 999, -7.3e9, -42]) {
    assert.equal(neueForm(v), alteHedgefondsForm(v), `${v} sieht anders aus als vorher`);
  }
});

test("M12-3 · Das Minus steht vor dem Waehrungszeichen", () => {
  /* Aufgefallen beim Abgleich mit der Hedgefonds-Seite: die erste
     Fassung setzte das Zeichen stur voran und erzeugte "$-7.3B". */
  assert.equal(Format.formatCompact(-7.3e9, "USD", { decimals: 1, trimZeros: true }), "-$7.3B");
  assert.equal(Format.formatPrice(-42.5, "USD"), "-$42.50");
  assert.equal(Format.formatPrice(42.5, "USD"), "$42.50", "Positive Betraege bleiben unveraendert");
  /* Bei nachgestelltem Zeichen stellt sich die Frage nicht. */
  assert.equal(Format.formatPrice(-42.5, "EUR"), "-42,50 €");
});

test("M12-4 · Kein Consumer-Frontend rechnet mehr selbst um", () => {
  /* Der Guard prueft das im Lauf; dieser Test haelt die Zusage im
     Vertrag fest. Was die migrierten Dateien tun duerfen, ist
     formatieren - was sie nicht duerfen, ist einen Wechselkurs
     anwenden (§49). */
  const migrierteDateien = [
    "discover/ui/surfaces.js", "discover/ui/detail-fundamentals.js",
    "discover/ui/cards.js", "discover/ui/detail.js",
    "dashboard/app.js", "hedgefonds/index.html"
  ];
  const fs = require("node:fs");
  for (const datei of migrierteDateien) {
    const src = fs.readFileSync(join(ROOT, datei), "utf8");
    assert.match(src, /VUFx\s*\.\s*Format|vuFormat\s*\(/,
      `${datei} konsumiert den zentralen Formatter nicht`);
    assert.ok(!/usdToEur|eurToUsd|exchangeRate\s*[=:]|wechselkurs\s*[=:]/i.test(src),
      `${datei} enthaelt eigene Umrechnungslogik`);
  }
});


test("M12-5 · Die Consumer-Seiten laden den Currency Core in der richtigen Reihenfolge", () => {
  /* Die Module bauen aufeinander auf: currency-engine braucht
     fx-rates, currency-contract braucht alles davor. Eine falsche
     Reihenfolge faellt nicht beim Laden auf, sondern erst, wenn ein
     Produkt den Contract benutzt - also spaet.

     Der Test haelt zugleich fest, dass die Seiten ihn ueberhaupt
     laden: ohne die Skripte greift in den migrierten Dateien der
     Rueckfall, und die Migration waere folgenlos. */
  const soll = [
    "fx-provider-registry", "fx-rates", "fx-freshness", "currency-registry",
    "currency-class", "currency-engine", "money-format", "currency-preference",
    "currency-contract"
  ];
  for (const seite of ["discover/index.html", "discover-v2/index.html"]) {
    const src = readFileSync(join(ROOT, seite), "utf8");
    const geladen = [...src.matchAll(/quant\/engines\/fx\/([a-z-]+)\.js/g)].map((m) => m[1]);
    assert.deepEqual(geladen, soll, `${seite}: falsche Ladereihenfolge`);
  }
  /* Die Hedgefonds-Seite braucht nur die Formatierung, nicht die Engine -
     sie rechnet nichts um. Genau das soll so bleiben. */
  const hf = readFileSync(join(ROOT, "hedgefonds/index.html"), "utf8");
  assert.match(hf, /quant\/engines\/fx\/money-format\.js/);
  assert.ok(!/quant\/engines\/fx\/currency-engine\.js/.test(hf),
    "Die Hedgefonds-Seite soll nicht umrechnen koennen - sie formatiert nur");
});


/* =========================================================================
   O-14/O-15/O-13 — die finalen Gates
   ========================================================================= */

test("O14-1 · Die historische Reihe wechselt die Quelle nicht im Jahr 2020", () => {
  /* Der Kern des Owner-Entscheids. Vorher lieferte dieselbe Reihe vor
     2020 EZB-Kurse und danach Tiingo-Kurse; weil die beiden zu
     verschiedenen Tageszeiten gelten, lag im Chart an dieser Stelle ein
     Sprung, den der Markt nicht gemacht hat. */
  const s = Rates.createStore();
  const ecb = [], tiingo = [];
  for (let jahr = 2015; jahr <= 2026; jahr++) {
    ecb.push([`${jahr}-06-01`, 1.10 + (jahr - 2015) * 0.001]);
    if (jahr >= 2021) tiingo.push([`${jahr}-06-01`, 1.13 + (jahr - 2015) * 0.001]);
  }
  s.ingest("EUR", "USD", ecb, Providers.ingestMeta("ecb", { frequency: "DAILY" }));
  s.ingest("EUR", "USD", tiingo, Providers.ingestMeta("tiingo", { frequency: "DAILY" }));

  const quellen = new Set();
  for (let jahr = 2015; jahr <= 2026; jahr++) {
    const q = s.rateAt("EUR", "USD", `${jahr}-06-01`);
    assert.ok(q.available, `${jahr} fehlt`);
    quellen.add(q.provenance.source);
  }
  assert.deepEqual([...quellen], ["ecb"],
    "Ein historischer Chart kommt aus genau einer Quelle - sonst traegt er eine Naht");
});

test("O14-2 · Die Gegenwart kommt aus Tiingo, auch wenn die EZB denselben Tag fuehrt", () => {
  const s = Rates.createStore();
  s.ingest("EUR", "USD", [["2026-09-21", 1.1490]], Providers.ingestMeta("ecb", { frequency: "DAILY" }));
  s.ingest("EUR", "USD", [["2026-09-21", 1.1726]], Providers.ingestMeta("tiingo", { frequency: "DAILY" }));

  const historisch = s.rateAt("EUR", "USD", "2026-09-21");
  assert.equal(historisch.provenance.source, "ecb");
  assert.equal(historisch.rate, 1.1490);

  const jetzt = s.latest("EUR", "USD");
  assert.equal(jetzt.provenance.source, "tiingo");
  assert.equal(jetzt.rate, 1.1726);

  /* Und der Unterschied ist genau die gemessene Naht - er wird nicht
     wegdefiniert, sondern benannt. */
  assert.ok(Math.abs(jetzt.rate / historisch.rate - 1) > 0.02);
});

test("O14-3 · Die Klasse steht in der Herkunft, nicht nur im Ergebnis", () => {
  const s = Rates.createStore();
  s.ingest("EUR", "USD", [["2026-09-21", 1.1490]], Providers.ingestMeta("ecb", { frequency: "DAILY" }));
  assert.equal(s.rateAt("EUR", "USD", "2026-09-21").provenance.resolutionClass, "HISTORICAL_DAILY");
  assert.equal(s.rateAt("EUR", "USD", null).provenance.resolutionClass, "CURRENT");
  /* Ein Aufrufer darf die Klasse setzen - etwa ein Nachweis, der
     ausdruecklich den aktuellen Pfad pruefen will. */
  assert.equal(s.rateAt("EUR", "USD", "2026-09-21", { resolutionClass: "CURRENT" })
                .provenance.resolutionClass, "CURRENT");
});

test("O15-1 · Derselbe Titel beginnt in USD 1990 und in EUR 1999", () => {
  const s = Rates.createStore();
  s.ingest("EUR", "USD", [["1999-01-04", 1.1789], ["2026-09-19", 1.1490]],
    Providers.ingestMeta("ecb", { frequency: "DAILY" }));
  const layer = Contract.createLayer({ store: s, now: "2026-09-22T08:00:00Z" });

  const a = layer.availability("USD", "1990-01-05");
  assert.equal(a.byDisplayCurrency.USD.availableFrom, "1990-01-05");
  assert.equal(a.byDisplayCurrency.USD.limitedBy, "NATIVE_SERIES");
  assert.equal(a.byDisplayCurrency.EUR.availableFrom, "1999-01-04");
  assert.equal(a.byDisplayCurrency.EUR.limitedBy, "FX_HISTORY");
  assert.match(a.byDisplayCurrency.EUR.note, /davor wird nichts genaehert/);
});

test("O15-2 · Vor dem Beginn der FX-Historie gibt es keinen Punkt, auch keinen genaeherten", () => {
  const s = Rates.createStore();
  s.ingest("EUR", "USD", [["1999-01-04", 1.1789], ["1999-01-05", 1.1790]],
    Providers.ingestMeta("ecb", { frequency: "DAILY" }));
  const engine = Engine.createEngine({ store: s, now: "2026-09-22T08:00:00Z" });
  const reihe = engine.convertSeries(
    [{ date: "1990-01-05", value: 1 }, { date: "1999-01-05", value: 2 }], "USD", "EUR");
  const vorher = reihe.points.find((p) => p.date === "1990-01-05");
  assert.ok(!vorher || vorher.display === null,
    "Ein Punkt vor dem Beginn der FX-Historie darf nicht gefuellt werden");
});

test("O13-1 · Verfuegbarkeit ist ein Zeitpunkt: historisch ja, aktuell nein", () => {
  /* Der Rubel, wie gemessen: die EZB hat die Veroeffentlichung
     eingestellt. Wer Verfuegbarkeit je Waehrung fuehrt, muss hier
     luegen - in die eine oder die andere Richtung. */
  const s = Rates.createStore();
  /* Eine durchgehende Reihe bis zum Abriss - sonst misst der Test die
     Carry-Grenze zwischen zwei weit auseinanderliegenden Stuetzpunkten
     und nicht den Abriss selbst. */
  const punkte = [];
  for (let d = Date.parse("2005-04-01"); d <= Date.parse("2022-03-01"); d += 86400000) {
    punkte.push([new Date(d).toISOString().slice(0, 10), 35.7 + (d - Date.parse("2005-04-01")) / 2.6e11]);
  }
  s.ingest("EUR", "RUB", punkte, Providers.ingestMeta("ecb", { frequency: "DAILY" }));
  const engine = Engine.createEngine({ store: s, now: "2026-09-22T08:00:00Z" });
  const a = engine.availableFrom("RUB", "EUR", "2005-01-01");

  assert.equal(a.conversionAvailable, true, "Historisch ist der Titel umrechenbar");
  assert.equal(a.availableFrom, "2005-04-01");
  assert.equal(a.availableTo, "2022-03-01");
  assert.equal(a.currentConversionAvailable, false, "Heute ist er es nicht");
  assert.equal(a.currentUnavailableReason, "carryLimitExceeded");

  /* Und die einzelne Umrechnung sagt dasselbe. */
  const alt = engine.convertMoney(1000, "RUB", "EUR", "2015-06-01", "MARKET_PRICE");
  assert.equal(alt.conversionAvailable, true);
  const neu = engine.convertMoney(1000, "RUB", "EUR", "2026-09-21", "MARKET_PRICE");
  assert.equal(neu.conversionAvailable, false);
  assert.equal(neu.native.value, 1000, "Der native Wert bleibt sichtbar (O-13)");
  assert.equal(neu.native.currency, "RUB");
});

test("O13-2 · 'Gibt es nicht' und 'gilt heute nicht mehr' sind verschiedene Auskuenfte", () => {
  const s = Rates.createStore();
  s.ingest("EUR", "RUB", [["2022-03-01", 120.0]], Providers.ingestMeta("ecb", { frequency: "DAILY" }));

  const abgerissen = s.rateAt("RUB", "EUR", "2026-09-22");
  assert.equal(abgerissen.reason, "carryLimitExceeded",
    "Die Gegenrichtung ist gefuehrt - 'pairNotStored' waere falsch");
  assert.equal(abgerissen.lastAvailable, "2022-03-01");
  assert.ok(abgerissen.gapDays > 1000);

  const niedagewesen = s.rateAt("AFN", "EUR", "2026-09-22");
  assert.equal(niedagewesen.reason, "pairNotStored");
});

test("O11-1 · Das Lizenz-Gate traegt die exakte Frage und blockiert nur die Anzeige", () => {
  const gate = Providers.escalation();
  assert.equal(gate.id, "LICENSE_DISPLAY_DERIVED_FX");
  assert.equal(gate.state, "OWNER_CONFIRMATION_REQUIRED");
  assert.deepEqual(gate.needed, ["C", "D"]);
  assert.deepEqual(gate.notNeeded, ["E"]);
  assert.equal(gate.blocksTechnicalWork, false);
  assert.equal(gate.blocksPublicActivation, true);
  assert.equal(gate.repositoryEvidence.contractTextPresent, false,
    "Es wird keine Lizenz aus einem Dokument abgeleitet, das es nicht gibt");

  /* Und die Folge je Wert: historisch (EZB) zeigbar, aktuell (Tiingo)
     gesperrt. Das ist die Trennung, die den technischen Workstream
     nicht anhaelt. */
  assert.equal(Providers.displayPermission("ecb").publicDerivedDisplayAllowed, true);
  assert.equal(Providers.displayPermission("tiingo").publicDerivedDisplayAllowed, false);
});

test("O16-1 · Keine offene Klasse-A-Stelle mehr, und keine still weggeklassifizierte", () => {
  /* Der Registerstand ist die Zusage aus O-12/O-16. Er wird hier
     geprueft und nicht geglaubt: eine Stelle von A nach C zu schieben
     ist erlaubt, wenn ein Marker IM CODE den Grund traegt - und genau
     dafuer gibt es den Marker. */
  const register = JSON.parse(readFileSync(
    join(ROOT, "quant", "data", "market", "fx", "currency-debt-register.json"), "utf8"));
  assert.equal(register.openClassA, 0,
    "Jede produktive Monetary-Display-Stelle konsumiert den zentralen Contract");

  for (const e of register.entries) {
    if (e.class === "A") assert.fail(`${e.file}:${e.line} ist noch offen`);
  }
  /* Und der zurueckgestellte Fall ist benannt, nicht verschwunden. */
  const portfolio = readFileSync(join(ROOT, "quant", "api", "portfolio-workspace.js"), "utf8");
  assert.match(portfolio, /DEFERRED_PRODUCT_DECISION_MULTI_CURRENCY_PORTFOLIO/);
  assert.match(portfolio, /price\.unit===['"]USD['"]/,
    "Das Bewertungs-Gate bleibt unveraendert, bis der Owner entscheidet");
});

test("O16-2 · vu2 formatiert zentral und rechnet weiterhin nicht um", () => {
  const src = readFileSync(join(ROOT, "vu2", "experience.js"), "utf8");
  assert.match(src, /VUFx[\s\S]{0,80}Format/, "Die Formatierung kommt aus dem Core");
  assert.match(src, /vuFormat\(/, "und sie wird auch benutzt, nicht nur geladen");
  assert.ok(!/usdToEur|toEur\s*\(|\*\s*0\.8[0-9]/.test(src),
    "Diese Seite darf keine eigene Umrechnung besitzen (O-12)");

  const page = readFileSync(join(ROOT, "vu2", "index.html"), "utf8");
  const geladen = [...page.matchAll(/quant\/engines\/fx\/([a-z-]+)\.js/g)].map((m) => m[1]);
  assert.deepEqual(geladen, ["currency-registry", "money-format"],
    "Nur Registry und Formatierung - die Engine gehoert nicht auf eine Seite, die nichts umrechnet");

  /* Die Ausgabe bleibt Zeichen fuer Zeichen dieselbe. Die alte Form
     steht hier KOPIERT und nicht importiert: importiert wuerde sie bei
     einer Aenderung stillschweigend mitwandern. */
  const alt = (value, d) => value.toLocaleString("de-DE",
    { maximumFractionDigits: d, minimumFractionDigits: d }) + " $";
  for (const [wert, d] of [[326.57, 2], [1.5, 2], [0, 2], [-7.25, 2], [12345.678, 0]]) {
    assert.equal(Format.formatPrice(wert, "USD", { numberLocale: "de-DE", decimals: d }),
      alt(wert, d), `vu2-Darstellung weicht ab bei ${wert}`);
  }
});
