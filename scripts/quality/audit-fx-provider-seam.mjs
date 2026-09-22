/* =========================================================================
   VISION UNIVERSE — audit-fx-provider-seam.mjs   (Currency Layer, O-14)

   WARUM TIINGO UND EZB AM SELBEN TAG VERSCHIEDENE KURSE ZEIGEN.

   Gemessen wurde eine Abweichung von 2,06 % bei AAPL am 2026-09-21 und
   ein Maximum von 2,39 % ueber den Ueberlappungsbereich. Der Owner
   verlangt zu Recht, dass diese Zahl nicht durch die Anbieterrangfolge
   verdeckt wird, sondern eine Ursache bekommt.

   DIE FRAGE IST NICHT "WELCHE ZAHL STIMMT"

   Sie lautet: beschreiben die beiden Zahlen ueberhaupt denselben
   oekonomischen Zeitpunkt? Wenn nicht, ist die Differenz kein Datenfehler,
   sondern die Definition - und dann waere jede Angleichung eine
   Faelschung.

   DREI HYPOTHESEN, DIE SICH UNTERSCHEIDEN LASSEN

     H1 ZEITVERSATZ     Die Kurse gelten zu verschiedenen Tageszeiten.
                        Dann ist die Differenz unverzerrt (Median nahe
                        null), kleiner als die Tagesbewegung, und - das
                        ist der entscheidende Teil - sie korreliert
                        NEGATIV mit der Tagesrendite: an einem Tag, der
                        steigt, liegt das frueher erhobene Fixing unter
                        dem spaeteren Schluss.

     H2 DEFINITION      Verschiedene Preisarten (Geld statt Mitte) oder
                        eine andere Zusammensetzung. Dann traegt die
                        Differenz ein systematisches Vorzeichen: der
                        Median liegt sichtbar neben null und bleibt dort.

     H3 FEHLER          Falsche Richtung, falsche Inversion, verschobene
                        Tagesgrenze. Dann ist die Differenz gross, mit
                        der Tagesrendite nahezu vollstaendig erklaerbar
                        (Steigung nahe -1 bei Tagesversatz) oder
                        strukturell (Faktor statt Versatz).

   H1 sagt eine ZAHL voraus, nicht nur ein Vorzeichen. Die Tiingo-Bar
   traegt gemessen den Stempel 00:00:00.000Z, ist also ein UTC-Kalendertag;
   ihr Schluss liegt am Tagesende. Die EZB erhebt gegen 14:15 UTC. Damit
   sind rund 41 % des UTC-Tages noch offen, wenn die EZB fixiert - die
   Regression von Differenz auf Tagesrendite sollte eine Steigung nahe
   -0,41 ergeben. Trifft das zu, ist H1 nicht nur plausibel, sondern
   gemessen.

   WAS DIESES SKRIPT NICHT TUT

   Es gleicht nichts an. Es verschiebt keine Reihe, es interpoliert
   nicht, es waehlt nicht je Tag den "besseren" Kurs. Es misst und
   benennt.

   AUSGABE

   quant/data/market/fx/provider-seam-audit.json - ohne einen einzigen
   Kursstand. Relative Differenzen, Korrelationen und Kalenderbefunde
   sind abgeleitete Groessen und keine Zeitreihe, die jemand
   weiterverwenden koennte.

   Aufruf:
     node scripts/quality/audit-fx-provider-seam.mjs [--publish]
   ========================================================================= */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FXDIR = join(ROOT, "quant", "engines", "fx");
const Rates = require(join(FXDIR, "fx-rates.js"));
const Providers = require(join(FXDIR, "fx-provider-registry.js"));

const args = new Set(process.argv.slice(2));
const PUBLISH = args.has("--publish");
const OUT = PUBLISH
  ? join(ROOT, "quant", "data", "market", "fx", "provider-seam-audit.json")
  : join(ROOT, ".market-cache", "currency", "provider-seam-audit.json");

const TIINGO_DIRS = [
  join(ROOT, ".market-cache", "currency", "fx"),
  join(ROOT, "quant", "data", "market", "fx")
];
const ECB_DIRS = [
  join(ROOT, ".market-cache", "currency", "fx-ecb"),
  join(ROOT, "quant", "data", "market", "fx", "ecb")
];

/* --------------------------------------------------------------------- */
/* Reihen einlesen                                                        */
/* --------------------------------------------------------------------- */
function loadSeries(dirs, expectSource) {
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const out = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_"))) {
      let d;
      try { d = JSON.parse(readFileSync(join(dir, file), "utf8")); } catch { continue; }
      if (!d.base || !d.quote || !Array.isArray(d.points) || !d.points.length) continue;
      if (expectSource && d.source !== expectSource) continue;
      out.push(d);
    }
    if (out.length) return { dir, series: out };
  }
  return { dir: null, series: [] };
}

/* --------------------------------------------------------------------- */
/* Statistik - klein gehalten und ohne Bibliothek                         */
/* --------------------------------------------------------------------- */
function quantile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)))];
}
function median(values) { return quantile([...values].sort((a, b) => a - b), 0.5); }
function mean(values) { return values.reduce((a, b) => a + b, 0) / values.length; }

/** Korrelation und Regressionssteigung von y auf x. */
function fit(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 30) return { n, corr: null, slope: null, intercept: null };
  const mx = mean(x.slice(0, n)), my = mean(y.slice(0, n));
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return { n, corr: null, slope: null, intercept: null };
  return {
    n,
    corr: sxy / Math.sqrt(sxx * syy),
    slope: sxy / sxx,
    intercept: my - (sxy / sxx) * mx
  };
}

function isWeekend(iso) {
  const day = new Date(iso + "T00:00:00Z").getUTCDay();
  return day === 0 || day === 6;
}

/* --------------------------------------------------------------------- */
/* Die Semantik, wie sie GEMESSEN und wie sie dokumentiert ist            */
/* --------------------------------------------------------------------- */
function timestampSemantics() {
  let probe = null;
  for (const f of [join(ROOT, "quant", "data", "market", "capabilities", "tiingo-fx-probe.json"),
                   join(ROOT, ".market-cache", "currency", "tiingo-fx-probe.json")]) {
    if (!existsSync(f)) continue;
    try { probe = JSON.parse(readFileSync(f, "utf8")); } catch { /* weiter */ }
    if (probe) break;
  }
  const ts = (probe && probe.timestampSemantics) || null;
  const dir = (probe && probe.directionality) || null;

  return {
    tiingo: {
      field: "close",
      fieldsServed: (probe && probe.evidence && probe.evidence.fxDaily && probe.evidence.fxDaily.fields) || null,
      rawDateExample: ts ? ts.raw : null,
      hasTime: ts ? ts.hasTime : null,
      hasZone: ts ? ts.hasZone : null,
      midnightUtc: ts ? ts.midnight : null,
      dayBoundary: ts && ts.midnight && ts.hasZone ? "UTC-Kalendertag" : "UNBEKANNT",
      priceBasis: "Tagesschluss der Bar (resampleFreq=1day)",
      closeInstantUtcApprox: ts && ts.midnight ? 24.0 : null,
      /* Gemessen, nicht gelesen: die Sondierung haelt den Rohstempel
         fest. Ein Stempel 00:00:00.000Z mit Zone bedeutet, dass die Bar
         einen UTC-Kalendertag umfasst - nicht eine Boersensitzung. */
      basis: "probe-tiingo-fx.json#timestampSemantics",
      servedDirections: dir ? dir.directions.map((d) => ({ pair: d.pair, served: d.ok })) : null,
      inversionRequired: dir ? dir.inversionRequired : null
    },
    ecb: {
      field: "eurofxref rate",
      dayBoundary: "TARGET-Geschaeftstag",
      priceBasis: "Referenzkurs (Fixing), ueblicherweise gegen 14:15 UTC erhoben, gegen 16:00 MEZ veroeffentlicht",
      fixingInstantUtcApprox: 14.25,
      quotation: "EUR-basiert: Einheiten Fremdwaehrung je 1 EUR",
      basis: "providers/ecb/adapter.js; EZB-Veroeffentlichungspraxis",
      inversionRequired: "nur fuer Nicht-EUR-Basis"
    },
    /* Der Anteil des UTC-Tages, der beim EZB-Fixing noch offen ist.
       Genau diesen Wert sollte die Regression unten als negative
       Steigung wiederfinden, wenn H1 zutrifft. */
    expectedSlopeIfTimingOnly: -(24.0 - 14.25) / 24.0,
    sameEconomicInstant: false,
    sameEconomicInstantBasis:
      "Tiingo-Bar endet am UTC-Tagesende, EZB fixiert gegen 14:15 UTC. " +
      "Die beiden Zahlen beschreiben denselben KALENDERTAG, aber nicht denselben ZEITPUNKT."
  };
}

/* --------------------------------------------------------------------- */
/* Der Vergleich je Paar                                                  */
/* --------------------------------------------------------------------- */
function comparePair(tiingoSeries, ecbSeries) {
  /* Beide in EUR-Notierung bringen - die der EZB. Verglichen werden
     Kurse, nicht Dateinamen: wer die Richtung nicht vereinheitlicht,
     misst die Inversion statt der Abweichung. */
  const quote = ecbSeries.quote;
  const tStore = Rates.createStore();
  tStore.ingest(tiingoSeries.base, tiingoSeries.quote, tiingoSeries.points,
    Providers.ingestMeta("tiingo", { frequency: "DAILY" }));
  const eStore = Rates.createStore();
  eStore.ingest("EUR", quote, ecbSeries.points,
    Providers.ingestMeta("ecb", { frequency: "DAILY" }));

  const tDates = new Set(tiingoSeries.points.map((p) => String(p[0]).slice(0, 10)));
  const eDates = new Set(ecbSeries.points.map((p) => String(p[0]).slice(0, 10)));

  /* Gemeinsame Tage, chronologisch. Nur echte Treffer auf beiden
     Seiten - ein fortgeschriebener Kurs (PREVIOUS_AVAILABLE) wuerde
     hier eine Abweichung erzeugen, die der Kalender verursacht hat und
     nicht die Quelle. */
  const common = [...tDates].filter((d) => eDates.has(d)).sort();

  const rows = [];
  for (const date of common) {
    const a = tStore.rateAt("EUR", quote, date, { allowTriangulation: false });
    const b = eStore.rateAt("EUR", quote, date, { allowTriangulation: false });
    if (!a.available || !b.available) continue;
    if (a.method !== "DAILY_AT_DATE" || b.method !== "DAILY_AT_DATE") continue;
    rows.push({ date, tiingo: a.rate, ecb: b.rate });
  }
  if (rows.length < 60) return null;

  /* d_t = EZB(t) / Tiingo(t) - 1, und die Tagesrendite der Tiingo-Reihe
     ueber DENSELBEN Tag. Beide in derselben Notierung, sonst dreht sich
     das Vorzeichen und die ganze Auswertung mit ihm. */
  const d = [], rSame = [], rNext = [], absD = [], absR = [];
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1], cur = rows[i];
    /* Nur aufeinanderfolgende Handelstage: ueber ein Wochenende hinweg
       ist "die Tagesrendite" drei Tage lang und der Vergleich schief. */
    const gap = (Date.parse(cur.date) - Date.parse(prev.date)) / 86400000;
    if (gap > 4) continue;
    const diff = cur.ecb / cur.tiingo - 1;
    const ret = cur.tiingo / prev.tiingo - 1;
    d.push(diff); rSame.push(ret);
    absD.push(Math.abs(diff)); absR.push(Math.abs(ret));
    if (i + 1 < rows.length) rNext.push(rows[i + 1].tiingo / cur.tiingo - 1);
  }
  if (d.length < 60) return null;

  const sameDay = fit(rSame, d);
  const nextDay = fit(rNext, d.slice(0, rNext.length));
  const sortedAbs = [...absD].sort((a, b) => a - b);

  /* Inversion auf Exaktheit pruefen: 1/(1/x) muss x ergeben. Eine
     Abweichung hier waere ein Rechenfehler der Engine, kein
     Quellenunterschied - deshalb getrennt gemessen. */
  let maxRoundTrip = 0;
  for (const row of rows.slice(0, 500)) {
    const back = 1 / (1 / row.ecb);
    maxRoundTrip = Math.max(maxRoundTrip, Math.abs(back - row.ecb) / row.ecb);
  }

  return {
    pair: `EUR/${quote}`,
    tiingoStoredAs: `${tiingoSeries.base}/${tiingoSeries.quote}`,
    tiingoInverted: !(tiingoSeries.base === "EUR" && tiingoSeries.quote === quote),
    overlapDays: rows.length,
    comparedDays: d.length,

    medianAbsRelDiff: quantile(sortedAbs, 0.5),
    p95AbsRelDiff: quantile(sortedAbs, 0.95),
    maxAbsRelDiff: sortedAbs[sortedAbs.length - 1],
    /* Der Median des VORZEICHENBEHAFTETEN Unterschieds. Nahe null =
       unverzerrt = H1. Sichtbar daneben = H2. */
    medianSignedRelDiff: median(d),
    meanSignedRelDiff: mean(d),

    medianAbsDailyReturn: median(absR),
    /* Kleiner als 1 heisst: die Quellen trennen weniger als ein
       Handelstag Bewegung. */
    diffToMoveRatio: median(absR) ? median(absD) / median(absR) : null,

    corrWithSameDayReturn: sameDay.corr,
    slopeOnSameDayReturn: sameDay.slope,
    corrWithNextDayReturn: nextDay.corr,
    slopeOnNextDayReturn: nextDay.slope,
    /* Aus der Steigung zurueckgerechnet: zu welcher Tageszeit muesste
       das Fixing liegen, damit genau diese Steigung entsteht? */
    impliedFixingHourUtc: sameDay.slope === null ? null : 24 * (1 + sameDay.slope),

    maxInversionRoundTripError: maxRoundTrip,
    weekendRowsTiingo: [...tDates].filter(isWeekend).length,
    weekendRowsEcb: [...eDates].filter(isWeekend).length,
    daysOnlyTiingo: [...tDates].filter((x) => !eDates.has(x) && !isWeekend(x)).length,
    daysOnlyEcb: [...eDates].filter((x) => !tDates.has(x) && !isWeekend(x)).length,
    worstDays: rows
      .map((r) => ({ date: r.date, relDiff: r.ecb / r.tiingo - 1 }))
      .sort((a, b) => Math.abs(b.relDiff) - Math.abs(a.relDiff))
      .slice(0, 5)
  };
}

/* --------------------------------------------------------------------- */
/* Lauf                                                                   */
/* --------------------------------------------------------------------- */
const tiingo = loadSeries(TIINGO_DIRS, "tiingo");
const ecb = loadSeries(ECB_DIRS, "ecb");

const pairs = [];
for (const t of tiingo.series) {
  const quote = t.base === "EUR" ? t.quote : (t.quote === "EUR" ? t.base : null);
  if (!quote) continue;                       /* Kreuz ohne EUR-Bein */
  const e = ecb.series.find((s) => s.base === "EUR" && s.quote === quote);
  if (!e) continue;
  const row = comparePair(t, e);
  if (row) pairs.push(row);
}
pairs.sort((a, b) => b.comparedDays - a.comparedDays);

const semantics = timestampSemantics();

/* ---- Das Urteil, aus den Messwerten und nicht aus der Erwartung ------ */
function verdictFor(p) {
  const unbiased = Math.abs(p.medianSignedRelDiff) < 0.25 * p.medianAbsRelDiff;
  const smallerThanMove = p.diffToMoveRatio !== null && p.diffToMoveRatio < 1;
  const negCorr = p.corrWithSameDayReturn !== null && p.corrWithSameDayReturn < -0.2;
  const slopeFits = p.slopeOnSameDayReturn !== null &&
                    p.slopeOnSameDayReturn < 0 && p.slopeOnSameDayReturn > -1.1;
  if (negCorr && slopeFits && smallerThanMove) {
    return unbiased ? "TIMING_DIFFERENCE" : "TIMING_DIFFERENCE_WITH_BIAS";
  }
  if (!negCorr && !unbiased) return "DEFINITIONAL_DIFFERENCE";
  if (p.slopeOnSameDayReturn !== null && p.slopeOnSameDayReturn < -1.5) return "SUSPECTED_DAY_SHIFT";
  return "INCONCLUSIVE";
}
pairs.forEach((p) => { p.verdict = verdictFor(p); });

const counts = pairs.reduce((acc, p) => { acc[p.verdict] = (acc[p.verdict] || 0) + 1; return acc; }, {});
const majority = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
const eurusd = pairs.find((p) => p.pair === "EUR/USD") || null;

const report = {
  schema: "vu-fx-provider-seam-audit-1.0.0",
  generatedAtUtc: new Date().toISOString(),
  note: "Wurzelursache der Abweichung zwischen Tiingo-Tagesschluss und EZB-Referenzkurs (O-14). " +
        "Enthaelt keine Kursstaende - nur relative Differenzen, Korrelationen und Kalenderbefunde.",
  hypotheses: {
    H1: "Zeitversatz: verschiedene Tageszeitpunkte. Unverzerrt, kleiner als die Tagesbewegung, negativ mit der Tagesrendite korreliert.",
    H2: "Definition: andere Preisart oder Zusammensetzung. Systematisches Vorzeichen.",
    H3: "Fehler: Richtung, Inversion oder Tagesgrenze. Steigung nahe -1 oder strukturelle Abweichung."
  },
  timestampSemantics: semantics,
  sourcesLoaded: { tiingo: tiingo.series.length, ecb: ecb.series.length,
                   tiingoDir: tiingo.dir, ecbDir: ecb.dir },
  pairsCompared: pairs.length,
  verdictCounts: counts,
  verdict: majority ? majority[0] : "NO_DATA",
  headline: eurusd ? {
    pair: eurusd.pair,
    comparedDays: eurusd.comparedDays,
    medianAbsRelDiff: eurusd.medianAbsRelDiff,
    p95AbsRelDiff: eurusd.p95AbsRelDiff,
    maxAbsRelDiff: eurusd.maxAbsRelDiff,
    medianSignedRelDiff: eurusd.medianSignedRelDiff,
    corrWithSameDayReturn: eurusd.corrWithSameDayReturn,
    slopeOnSameDayReturn: eurusd.slopeOnSameDayReturn,
    expectedSlopeIfTimingOnly: semantics.expectedSlopeIfTimingOnly,
    impliedFixingHourUtc: eurusd.impliedFixingHourUtc,
    verdict: eurusd.verdict
  } : null,
  pairs
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");

/* --------------------------------------------------------------------- */
/* Protokoll                                                              */
/* --------------------------------------------------------------------- */
console.log("FX-NAHT: WURZELURSACHE (O-14)\n");
console.log(`  Reihen: tiingo ${tiingo.series.length}, ecb ${ecb.series.length}`);
console.log(`  Tiingo-Tagesgrenze: ${semantics.tiingo.dayBoundary} (Stempel ${semantics.tiingo.rawDateExample})`);
console.log(`  EZB-Fixing: ~${semantics.ecb.fixingInstantUtcApprox} UTC`);
console.log(`  Erwartete Steigung, wenn NUR Zeitversatz: ${semantics.expectedSlopeIfTimingOnly.toFixed(3)}\n`);

if (!pairs.length) {
  console.log("  Kein Paar mit ausreichender Ueberlappung. Ohne Anbieterhistorie ist der Audit nicht fuehrbar.");
} else {
  const pct = (x) => x === null ? "   -   " : (x * 100).toFixed(3).padStart(7) + " %";
  const num = (x) => x === null ? "  -  " : x.toFixed(3).padStart(6);
  console.log(`  ${"Paar".padEnd(10)}${"Tage".padEnd(7)}${"Median|d|".padEnd(11)}${"Median d".padEnd(11)}${"corr(r)".padEnd(8)}${"Steigung".padEnd(10)}Urteil`);
  for (const p of pairs.slice(0, 20)) {
    console.log(`  ${p.pair.padEnd(10)}${String(p.comparedDays).padEnd(7)}${pct(p.medianAbsRelDiff).padEnd(11)}` +
                `${pct(p.medianSignedRelDiff).padEnd(11)}${num(p.corrWithSameDayReturn).padEnd(8)}` +
                `${num(p.slopeOnSameDayReturn).padEnd(10)}${p.verdict}`);
  }
  console.log("");
  console.log(`  Urteil ueber ${pairs.length} Paare: ${JSON.stringify(counts)}`);
  if (eurusd) {
    console.log(`  EUR/USD: Differenz betraegt ${(eurusd.diffToMoveRatio * 100).toFixed(0)} % einer Tagesbewegung; ` +
                `implizierter Fixing-Zeitpunkt ${eurusd.impliedFixingHourUtc === null ? "-" : eurusd.impliedFixingHourUtc.toFixed(1)} UTC ` +
                `(EZB veroeffentlicht gegen ${semantics.ecb.fixingInstantUtcApprox} UTC).`);
  }
}
console.log(`\nBericht: ${OUT}`);

/* Ein Audit urteilt, es faellt nicht durch. Das Gate haengt an der
   Rollenverteilung, nicht an dieser Messung. */
process.exit(0);
