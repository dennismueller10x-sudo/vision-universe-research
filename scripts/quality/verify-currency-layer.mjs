/* =========================================================================
   VISION UNIVERSE — verify-currency-layer.mjs   (Currency Layer V1, §56, §57, §58)

   DER NACHWEIS AN ECHTEN TITELN - UND DIE EHRLICHE ANGABE, WAS DABEI
   ECHT IST UND WAS NICHT.

   Dieses Skript rechnet den Currency Layer an den Daten nach, die im
   Repository tatsaechlich liegen:

     Kurse          quant/data/market/discover-series-long/ref_<TICKER>.json
                    (Tiingo, SPLIT_ADJUSTED, currency USD, ab 1990)
     Fundamentals   quant/data/sec/consumer/CIK<...>.json
                    (SEC, echte Geschaeftsjahre, echte Stichtage)

   Was NICHT echt ist, solange keine qualifizierte FX-Quelle vorliegt:
   die Wechselkurse. Dieses Skript erfindet keine und tut nicht so, als
   haette es welche. Es meldet:

     fxSource: PRODUCTION  ein qualifizierter FX-Bestand liegt vor
     fxSource: FIXTURE     gerechnet wird mit der Testreihe; die REGELN
                           sind damit belegt, die KURSE nicht

   Und im zweiten Fall ist der Gesamtbefund NICHT "PASS", sondern
   "PASS_RULES_ONLY". Ein gruener Haken, der zwei verschiedene Dinge
   bedeuten kann, ist kein gruener Haken. §58 sagt dasselbe fuer den
   Realtime-Nachweis bei geschlossener Boerse: fehlender Nachweis wird
   dokumentiert, nicht als bestanden gemeldet.

   Ausfuehren:
     node scripts/quality/verify-currency-layer.mjs
     node scripts/quality/verify-currency-layer.mjs --json
     node scripts/quality/verify-currency-layer.mjs --publish
   ========================================================================= */
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { buildUsdEurSeries, HOLIDAYS_2021 } from "../../quant/tests/fixtures/fx-usd-eur.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FXDIR = join(ROOT, "quant", "engines", "fx");

const Rates    = require(join(FXDIR, "fx-rates.js"));
const Engine   = require(join(FXDIR, "currency-engine.js"));
const Registry = require(join(FXDIR, "currency-registry.js"));
const Format   = require(join(FXDIR, "money-format.js"));
const Contract = require(join(FXDIR, "currency-contract.js"));

const JSON_OUT = process.argv.includes("--json");

/* Wie bei der Faehigkeitssondierung: der Bericht traegt einen Zeitstempel
   und landet darum standardmaessig in der Arbeitsablage. Die CI prueft
   weiter unten mit `git diff --exit-code -- quant/data/market`, dass ein
   Lauf ohne Zugang den committeten Stand unveraendert laesst - ein
   Nachweis, der diese Pruefung selbst bricht, waere ein schlechter
   Nachweis. */
const PUBLISH = process.argv.includes("--publish");
const REPORT = PUBLISH
  ? resolve(ROOT, "quant", "data", "market", "capabilities", "currency-layer-proof.json")
  : resolve(ROOT, ".market-cache", "currency", "currency-layer-proof.json");

const SERIES_DIR = join(ROOT, "quant", "data", "market", "discover-series-long");
const FX_STORE_DIR = join(ROOT, "quant", "data", "market", "fx");
const PROBE = join(ROOT, "quant", "data", "market", "capabilities", "tiingo-fx-probe.json");

const GOLDEN = ["AAPL", "NVDA", "MSFT"];

const checks = [];
function check(id, title, fn) {
  try {
    const result = fn();
    checks.push({ id, title, state: result.state || "PASS", detail: result.detail || null, rows: result.rows || null });
  } catch (err) {
    checks.push({ id, title, state: "FAIL", detail: String(err && err.message || err), rows: null });
  }
}

/* --------------------------------------------------------------------- */
/* Die FX-Quelle bestimmen - und benennen, was sie ist                     */
/* --------------------------------------------------------------------- */
function loadFxStore() {
  const store = Rates.createStore();

  /* Produktionsbestand, falls build-fx-history.mjs bereits gelaufen ist. */
  if (existsSync(FX_STORE_DIR)) {
    const files = readdirSync(FX_STORE_DIR).filter((f) => f.endsWith(".json"));
    let ingested = 0;
    for (const file of files) {
      const data = JSON.parse(readFileSync(join(FX_STORE_DIR, file), "utf8"));
      if (!data.base || !data.quote || !Array.isArray(data.points)) continue;
      store.ingest(data.base, data.quote, data.points,
        { source: data.source || "unknown", frequency: data.frequency || "DAILY", ingestedAt: data.asOf });
      ingested++;
    }
    if (ingested) return { store, kind: "PRODUCTION", note: `${ingested} Paar(e) aus ${FX_STORE_DIR}.` };
  }

  const probe = existsSync(PROBE) ? JSON.parse(readFileSync(PROBE, "utf8")) : null;
  const probeNote = probe
    ? `Die Faehigkeitssondierung steht auf ${Object.values(probe.capabilities || {}).every((v) => v === null) ? "ungeprueft" : "teilweise gemessen"}.`
    : "Es liegt keine Faehigkeitssondierung vor.";

  store.ingest("USD", "EUR", buildUsdEurSeries("1990-01-01", "2026-09-21", HOLIDAYS_2021),
    { source: "fixture", frequency: "DAILY" });
  return {
    store, kind: "FIXTURE",
    note: `Kein qualifizierter FX-Bestand unter ${FX_STORE_DIR}. ${probeNote} ` +
          "Gerechnet wird mit der Testreihe: die Regeln sind damit belegt, die Kursstaende nicht."
  };
}

const fx = loadFxStore();
const engine = Engine.createEngine({ store: fx.store, now: Date.now() });

/* --------------------------------------------------------------------- */
/* §57 Kurshistorie an echten Titeln                                       */
/* --------------------------------------------------------------------- */
function loadSeries(ticker) {
  const file = join(SERIES_DIR, `ref_${ticker}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8"));
}

function pickNear(points, targetIso) {
  /* Der Punkt mit dem groessten Datum <= Ziel. Kein Look-Ahead, auch
     nicht bei der Stichprobenwahl. */
  let best = null;
  for (const [date, value] of points) {
    if (date <= targetIso) best = [date, value]; else break;
  }
  return best;
}

for (const ticker of GOLDEN) {
  check(`P-${ticker}`, `${ticker}: historische EUR-Kurse punktweise nachgerechnet`, () => {
    const series = loadSeries(ticker);
    if (!series) return { state: "SKIP", detail: `Keine Kursreihe fuer ${ticker} im Repository.` };

    const native = Registry.normalize(series.currency);
    if (!native) return { state: "FAIL", detail: `${ticker}: die Reihe fuehrt keine Waehrung.` };

    const last = series.points[series.points.length - 1][0];
    const targets = [
      ["heute", last],
      ["vor 1 Monat", shift(last, -30)],
      ["vor 1 Jahr", shift(last, -365)],
      ["vor 5 Jahren", shift(last, -1826)]
    ];

    const rows = [];
    for (const [label, targetIso] of targets) {
      const point = pickNear(series.points, targetIso);
      if (!point) { rows.push({ label, state: "NO_POINT" }); continue; }
      const [date, nativePrice] = point;

      const money = engine.convertMoney(nativePrice, native, "EUR", date, "MARKET_PRICE");
      if (!money.available) { rows.push({ label, date, nativePrice, state: "NO_FX", reason: money.reason }); continue; }

      /* Die Gegenprobe von Hand: Kurs mal Wechselkurs. Wenn Engine und
         Handrechnung auseinanderlaufen, ist die Engine falsch - nicht die
         Handrechnung. */
      const rate = fx.store.rateAt(native, "EUR", date).rate;
      const erwartet = nativePrice * rate;
      if (Math.abs(money.display.value - erwartet) > 1e-9) {
        throw new Error(`${ticker} ${date}: Engine ${money.display.value} != Handrechnung ${erwartet}`);
      }
      if (money.fx.asOf > date) throw new Error(`${ticker} ${date}: FX-Stand ${money.fx.asOf} liegt NACH dem Kurstag (Look-Ahead)`);
      if (money.native.value !== nativePrice) throw new Error(`${ticker} ${date}: der Originalwert wurde veraendert`);

      rows.push({
        label, date, nativePrice, nativeCurrency: native,
        fxRate: Number(rate.toFixed(6)), fxAsOf: money.fx.asOf, fxMethod: money.fx.method,
        displayEur: Number(money.display.value.toFixed(4)),
        formatted: Format.formatPrice(money.display.value, "EUR")
      });
    }
    const usable = rows.filter((r) => r.displayEur !== undefined);
    if (!usable.length) return { state: "BLOCKED", detail: `${ticker}: kein Stuetzpunkt umrechenbar.`, rows };
    return { detail: `${usable.length} von ${rows.length} Stuetzpunkten nachgerechnet.`, rows };
  });

  check(`R-${ticker}`, `${ticker}: USD-Rendite vs. EUR-Rendite ist mathematisch erklaerbar`, () => {
    const series = loadSeries(ticker);
    if (!series) return { state: "SKIP", detail: "Keine Kursreihe." };
    const native = Registry.normalize(series.currency);
    const last = series.points[series.points.length - 1][0];
    const start = pickNear(series.points, shift(last, -1826));
    if (!start) return { state: "SKIP", detail: "Keine Fuenfjahreshistorie." };

    const window = series.points.filter(([d]) => d >= start[0]);
    const converted = engine.convertSeries(window, native, "EUR");
    if (!converted.available) return { state: "BLOCKED", detail: `Reihe nicht umrechenbar: ${converted.reason}` };
    const perf = engine.priceReturn(converted);

    /* Die Identitaet, die gelten MUSS:
         (1 + r_eur) = (1 + r_usd) x (fx_ende / fx_anfang)
       Wenn sie nicht gilt, ist die Umrechnung irgendwo nicht punktweise
       erfolgt - und genau das ist der Fehler, den §40 verbietet. */
    const fxStart = converted.points[0].rate;
    const fxEnd = converted.points[converted.points.length - 1].rate;
    const linkeSeite = 1 + perf.displayReturnPct / 100;
    const rechteSeite = (1 + perf.nativeReturnPct / 100) * (fxEnd / fxStart);
    if (Math.abs(linkeSeite - rechteSeite) > 1e-9) {
      throw new Error(`Zerlegung geht nicht auf: ${linkeSeite} != ${rechteSeite}`);
    }

    return {
      detail: "Die Zerlegung (1+r_EUR) = (1+r_USD) x (FX_Ende/FX_Anfang) geht exakt auf.",
      rows: [{
        von: converted.dates[0], bis: converted.dates[converted.dates.length - 1],
        punkte: converted.dates.length,
        renditeUSD: Number(perf.nativeReturnPct.toFixed(2)),
        renditeEUR: Number(perf.displayReturnPct.toFixed(2)),
        waehrungseffektPp: Number(perf.currencyEffectPp.toFixed(2)),
        fxAnfang: Number(fxStart.toFixed(6)), fxEnde: Number(fxEnd.toFixed(6))
      }]
    };
  });
}

function shift(iso, days) {
  return new Date(Date.parse(iso + "T00:00:00Z") + days * 86400000).toISOString().slice(0, 10);
}

/* --------------------------------------------------------------------- */
/* §56 Fundamentals an echten Faellen                                      */
/* --------------------------------------------------------------------- */
const CONSUMER_DIR = join(ROOT, "quant", "data", "sec", "consumer");

function loadConsumer(cik) {
  const file = join(CONSUMER_DIR, `CIK${cik}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

check("F1", "Abweichendes Geschaeftsjahr: Periodengrenzen aus den Daten, nicht aus dem Kalender", () => {
  /* AAR Corp, CIK 0000001750 - Geschaeftsjahresende 31. Mai. */
  const data = loadConsumer("0000001750");
  if (!data) return { state: "SKIP", detail: "CIK0000001750 nicht im Repository." };

  const reporting = Registry.normalize(data.units && data.units.revenue) || null;
  if (!reporting) return { state: "FAIL", detail: "Die Berichtswaehrung steht nicht in units.revenue." };

  const rows = (data.annual.revenue || []).map(([fy, fp, end, v]) => ({ fy, fp, end, v }));
  const chain = Engine.resolvePeriodChain(rows);
  const out = [];

  for (const entry of chain.slice(-3)) {
    if (!entry.periodStart) { out.push({ fy: entry.row.fy, state: "PERIOD_START_UNKNOWN" }); continue; }
    if (entry.periodStart.slice(5) === "01-01") {
      throw new Error(`FY${entry.row.fy}: Periodenanfang ${entry.periodStart} sieht nach Kalenderjahr aus`);
    }
    const money = engine.convertMetric({
      metricId: "revenue", value: entry.row.v, unit: "USD", currency: reporting,
      periodStart: entry.periodStart, periodEnd: entry.periodEnd
    }, "EUR");
    if (!money.available) { out.push({ fy: entry.row.fy, state: "NO_FX", reason: money.reason }); continue; }
    if (money.fx.method !== "PERIOD_AVERAGE") throw new Error(`FY${entry.row.fy}: ${money.fx.method} statt PERIOD_AVERAGE`);
    out.push({
      fy: entry.row.fy, periodStart: entry.periodStart, periodEnd: entry.periodEnd,
      provenance: entry.provenance,
      nativeValue: entry.row.v, nativeCurrency: reporting,
      fxAverage: Number(money.fx.rate.toFixed(6)), fxObservations: money.fx.observations,
      fxCoverage: Number(money.fx.coverage.toFixed(3)),
      displayEur: Number(money.display.value.toFixed(0)),
      formatted: Format.formatCompact(money.display.value, "EUR")
    });
  }
  return { detail: `${data.name}, Geschaeftsjahresende ${data.calendar.latestFiscalYearEnd}. ` +
                   "Periodenanfaenge aus der Vorperiode abgeleitet, nicht aus dem Kalender.", rows: out };
});

check("F2", "Bilanzstichtag am Wochenende faellt deterministisch auf den Vortag zurueck", () => {
  const data = loadConsumer("0000320193") || loadConsumer("0000001750");
  if (!data) return { state: "SKIP", detail: "Kein Consumer-Datensatz gefunden." };

  const reporting = Registry.normalize(data.units && data.units.cash_and_equivalents);
  const rows = data.annual.cash_and_equivalents || data.annual.total_assets || [];
  const weekend = rows.filter(([, , end]) => {
    const dow = new Date(Date.parse(end + "T00:00:00Z")).getUTCDay();
    return dow === 0 || dow === 6;
  });
  if (!weekend.length) return { state: "SKIP", detail: `${data.name}: kein Bilanzstichtag am Wochenende in der Reihe.` };

  const out = [];
  for (const [fy, fp, end, v] of weekend.slice(-3)) {
    const money = engine.convertMetric(
      { metricId: "cash_and_equivalents", value: v, unit: "USD", currency: reporting, end }, "EUR");
    if (!money.available) { out.push({ fy, end, state: "NO_FX", reason: money.reason }); continue; }
    if (money.fx.asOf >= end) throw new Error(`${end}: FX-Stand ${money.fx.asOf} ist nicht vor dem Wochenendstichtag`);
    if (money.fx.method !== "PREVIOUS_AVAILABLE") throw new Error(`${end}: ${money.fx.method} statt PREVIOUS_AVAILABLE`);
    out.push({
      fy, fp, periodEnd: end, wochentag: ["So","Mo","Di","Mi","Do","Fr","Sa"][new Date(Date.parse(end+"T00:00:00Z")).getUTCDay()],
      fxAsOf: money.fx.asOf, fxMethod: money.fx.method,
      freshness: money.freshness.state,
      nativeValue: v, displayEur: Number(money.display.value.toFixed(0))
    });
  }
  return { detail: `${data.name}: ${out.length} Wochenendstichtag(e) geprueft, jeder auf den letzten vorherigen Kurs.`, rows: out };
});

check("F3", "SEC ist NICHT automatisch USD - gemessen am ganzen Universum (§16)", () => {
  /* Der Befund, um den es in §16 geht, ist im eigenen Bestand messbar.
     Deshalb hier kein Stichprobenumfang, sondern jede Datei: eine
     Annahme, die fuer 75 Prozent stimmt, ist keine Annahme, sondern ein
     Fehler mit guter Trefferquote. */
  const files = existsSync(CONSUMER_DIR) ? readdirSync(CONSUMER_DIR).filter((f) => f.endsWith(".json")) : [];
  if (!files.length) return { state: "SKIP", detail: "Kein Consumer-Verzeichnis." };

  const distribution = {};
  const beispiele = {};
  let ohne = 0;
  for (const file of files) {
    const data = JSON.parse(readFileSync(join(CONSUMER_DIR, file), "utf8"));
    const code = Registry.normalize(data.units && data.units.revenue);
    if (!code) { ohne++; continue; }
    distribution[code] = (distribution[code] || 0) + 1;
    if (code !== "USD" && !beispiele[code]) beispiele[code] = (data.tickers || [])[0] || data.name;
  }

  const usd = distribution.USD || 0;
  const mitAngabe = files.length - ohne;
  const nichtUsd = mitAngabe - usd;
  const fremdwaehrungen = Object.keys(distribution).filter((c) => c !== "USD").sort();

  /* Die Gegenprobe fuer jede Fremdwaehrung: kann der Layer sie ueberhaupt
     bedienen? Ohne FX-Paar wird nicht umgerechnet - und das ist der
     richtige Ausgang, aber es muss sichtbar sein. */
  const ohnePaar = fremdwaehrungen.filter((code) => !fx.store.rateAt(code, "EUR", null).available);

  return {
    detail: `${files.length} SEC-Datensaetze, jeder mit der Waehrung aus units gelesen. ` +
            `${nichtUsd} von ${mitAngabe} berichten NICHT in USD (${(nichtUsd / mitAngabe * 100).toFixed(1)} %) — ` +
            `in ${fremdwaehrungen.length} verschiedenen Waehrungen. ` +
            `${ohne} Datensaetze fuehren keine Waehrung und werden nicht umgerechnet. ` +
            (ohnePaar.length
              ? `OFFEN: fuer ${ohnePaar.length} dieser Waehrungen liegt kein FX-Paar vor (${ohnePaar.join(", ")}); ` +
                "ihre monetaeren Werte bleiben in der Originalwaehrung."
              : "Fuer jede Fremdwaehrung liegt ein FX-Paar vor."),
    rows: [
      { verteilung: distribution, ohneAngabe: ohne },
      { beispiele },
      { fremdwaehrungenOhneFxPaar: ohnePaar }
    ]
  };
});

check("F4", "Prozentkennzahlen und Multiples sind unter dem Waehrungswechsel unveraendert", () => {
  const layer = Contract.createLayer({ store: fx.store, storage: null });
  const proben = [
    { metricId: "operatingMargin", value: 31.24, unit: "pct" },
    { metricId: "roic", value: 29.91, unit: "pct" },
    { metricId: "revenueGrowth", value: 18.2, unit: "pct" },
    { metricId: "evToEbitda", value: 24.3, unit: "x" },
    { metricId: "quantScore", value: 87, unit: "score" }
  ];
  const out = [];
  for (const fact of proben) {
    layer.setDisplayCurrency("EUR");
    const eur = layer.metric(fact);
    layer.setDisplayCurrency("USD");
    const usd = layer.metric(fact);
    if (eur.display.value !== fact.value || usd.display.value !== fact.value) {
      throw new Error(`${fact.metricId} hat sich unter dem Waehrungswechsel veraendert`);
    }
    out.push({ metricId: fact.metricId, klasse: eur.currencyClass, eur: eur.formatted, usd: usd.formatted });
  }
  return { detail: "Werte identisch; nur die Zahlenformatierung folgt der Locale.", rows: out };
});

/* --------------------------------------------------------------------- */
/* §58 Realtime                                                            */
/* --------------------------------------------------------------------- */
check("RT1", "Realtime-Nachweis bei offener US-Sitzung", () => {
  /* Ein Realtime-Nachweis braucht einen laufenden Stream und eine offene
     Boerse. Beides gibt es in einem CI-Lauf nicht, und §58 ist an dieser
     Stelle ausdruecklich: fehlender Nachweis wird dokumentiert, nicht als
     PASS gemeldet. */
  return {
    state: "NOT_PROVEN",
    detail: "Kein laufender Realtime-Stream und keine gemessene offene US-Sitzung in diesem Lauf. " +
            "Der Pfad ist in quant/tests/currency-fx-matrix.test.mjs (I10-I12) gegen den Store geprueft: " +
            "ein FX-Stand bedient viele Ticks, doppelte Umrechnung wird verhindert, STALE verbietet den Realtime-Anspruch. " +
            "Der Nachweis am offenen Markt steht aus und wird nicht als erbracht gemeldet."
  };
});

/* --------------------------------------------------------------------- */
/* Bericht                                                                 */
/* --------------------------------------------------------------------- */
const counts = checks.reduce((acc, c) => { acc[c.state] = (acc[c.state] || 0) + 1; return acc; }, {});
const hardFail = checks.some((c) => c.state === "FAIL");

const verdict = hardFail
  ? "FAIL"
  : (fx.kind === "PRODUCTION" ? "PASS" : "PASS_RULES_ONLY");

const report = {
  schema: "vu-currency-layer-proof-1.0.0",
  generatedAtUtc: new Date().toISOString(),
  contractVersion: Engine.CONTRACT_VERSION,
  fxSource: fx.kind,
  fxSourceNote: fx.note,
  verdict,
  verdictMeaning: {
    PASS: "Regeln belegt UND mit qualifizierten FX-Kursen gerechnet.",
    PASS_RULES_ONLY: "Die Umrechnungsregeln sind an echten Kurs- und Fundamentaldaten belegt. " +
                     "Die verwendeten WECHSELKURSE stammen aus der Testreihe - ein Produktionsnachweis steht aus.",
    FAIL: "Mindestens eine Regel verhaelt sich nicht wie vertraglich zugesagt."
  }[verdict],
  counts,
  checks
};

mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\nCURRENCY LAYER — NACHWEIS  (${report.contractVersion})`);
  console.log(`FX-Quelle: ${fx.kind} — ${fx.note}\n`);
  for (const c of checks) {
    const mark = { PASS: "ok  ", SKIP: "--  ", BLOCKED: "!!  ", NOT_PROVEN: "??  ", FAIL: "FAIL" }[c.state] || c.state;
    console.log(`${mark} ${c.id}  ${c.title}`);
    if (c.detail) console.log(`       ${c.detail}`);
    if (c.rows) for (const row of c.rows) console.log(`       ${JSON.stringify(row)}`);
  }
  console.log(`\nBefund: ${verdict} — ${report.verdictMeaning}`);
  console.log(`Bericht: ${REPORT}\n`);
}

process.exit(hardFail ? 1 : 0);
