#!/usr/bin/env node
/* =========================================================================
   Measure what the return basis does to the Quant V2 momentum factor.

   THE QUESTION, AND WHY IT IS NOT ALREADY ANSWERED

   Chart, technical, setup and Elliott read price movement, so they take a
   split-adjusted price: a distribution is a real gap at the ex-date, and
   removing it would invent a move the market never showed. Backtest,
   portfolio and benchmark read investor outcome, so they take total
   return.

   Momentum sits between them. It is a price-movement measure used as a
   factor, and the answer does not follow from the split above - which is
   exactly why it is not decided silently.

   WHAT THIS MEASURES, AND WHAT IT CANNOT

   It computes each momentum horizon on both bases over every series that
   carries BOTH columns, and reports the difference. That quantifies how
   much the choice moves the number.

   It does NOT decide the factor. Deciding it needs the RANKING to move
   across the universe - momentum is a percentile among peers, and a
   uniform shift changes no rank at all. Both columns exist today for 5 of
   6,403 titles, so a ranking study is not possible and this report says
   so rather than implying one.

   Reads only committed files. Makes no provider call. Changes no
   published value.
   ========================================================================= */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DAILY = join(ROOT, "quant/data/market/golden-preview/daily");
const UNIVERSE = join(ROOT, "quant/data/product/factor-evidence-v1/screening.json.gz");
const OUT = join(ROOT, "quant/data/providers/momentum-return-basis-study.json");

/* The horizons quant-v2.0.0 actually uses, in trading days. */
const HORIZONS = [
  { id: "momentum1M", days: 21 },
  { id: "momentum3M", days: 63 },
  { id: "momentum6M", days: 126 },
  { id: "momentum12M", days: 252 },
  { id: "momentum12m1m", days: 252, skip: 21 }
];

const finite = (v) => typeof v === "number" && Number.isFinite(v);

function momentum(closes, horizon) {
  const end = closes.length - 1 - (horizon.skip || 0);
  const start = end - horizon.days;
  if (start < 0 || !finite(closes[start]) || !finite(closes[end]) || closes[start] <= 0) return null;
  return closes[end] / closes[start] - 1;
}

function main() {
  if (!existsSync(DAILY)) throw new Error("no series to study: " + DAILY);
  const series = [];

  for (const file of readdirSync(DAILY).filter((f) => f.endsWith(".json")).sort()) {
    const payload = JSON.parse(readFileSync(join(DAILY, file), "utf8"));
    const bars = (payload.bars || []).filter((b) => finite(b.close) && b.close > 0 && finite(b.adjustedClose) && b.adjustedClose > 0);
    if (bars.length < 300) continue;

    /* The raw close still carries splits, so it is not a usable price
       basis on its own. The split-adjusted series is reconstructed from
       splitFactor - the same way publish-discover-series does it - so the
       comparison is total return against SPLIT-adjusted price, which is
       the actual choice, and not against an unadjusted one. */
    const splitAdjusted = new Array(bars.length);
    let factor = 1;
    splitAdjusted[bars.length - 1] = bars[bars.length - 1].close;
    for (let i = bars.length - 1; i > 0; i--) {
      const sf = bars[i].splitFactor;
      if (finite(sf) && sf > 0 && sf !== 1) factor *= sf;
      splitAdjusted[i - 1] = bars[i - 1].close / factor;
    }
    const totalReturn = bars.map((b) => b.adjustedClose);

    const dividends = bars.filter((b) => b.dividend > 0);
    const paid = dividends.reduce((sum, b) => sum + b.dividend, 0);
    const lastClose = bars[bars.length - 1].close;

    const horizons = HORIZONS.map((horizon) => {
      const price = momentum(splitAdjusted, horizon);
      const total = momentum(totalReturn, horizon);
      if (price === null || total === null) return { id: horizon.id, price: null, total: null, difference: null };
      return {
        id: horizon.id,
        price, total,
        /* In percentage points of return, which is the unit anyone
           comparing two momentum figures would use. */
        difference: total - price
      };
    });

    series.push({
      ticker: payload.ticker,
      bars: bars.length,
      from: bars[0].date,
      to: bars[bars.length - 1].date,
      dividendEvents: dividends.length,
      dividendsPaidPerShare: Math.round(paid * 1e4) / 1e4,
      approximateAnnualYield: dividends.length
        ? Math.round((paid / ((bars.length / 252) || 1) / lastClose) * 1e5) / 1e5
        : 0,
      horizons
    });
  }

  const differences = series.flatMap((s) => s.horizons.filter((h) => h.difference !== null).map((h) => Math.abs(h.difference)));
  differences.sort((a, b) => a - b);
  const median = differences.length ? differences[Math.floor(differences.length / 2)] : null;
  const worst = differences.length ? differences[differences.length - 1] : null;

  /* THE FINDING THIS SAMPLE DOES SUPPORT.
  
     The difference is not noise and not a uniform shift: it is positive
     for every series and scales with dividend yield and horizon. On a
     total-return basis a high-yield title therefore gains momentum
     relative to a low-yield one - which IS a ranking effect, and a
     systematic one. Five series cannot size it across the universe, but
     they are enough to establish its direction, and a decision taken
     without knowing that direction would be taken blind. */
  const longest = series
    .map((s) => ({ yield: s.approximateAnnualYield, difference: (s.horizons.find((h) => h.id === "momentum12m1m") || {}).difference }))
    .filter((row) => finite(row.difference));
  const allPositive = longest.length > 0 && longest.every((row) => row.difference >= 0);
  const byYield = longest.slice().sort((a, b) => a.yield - b.yield);
  /* Rank correlation rather than strict monotonicity. Over five noisy
     points a single inversion - here AAPL and MSFT, whose differences are
     both under one percentage point - would flip a monotone flag to false
     and hide a relationship that is plainly there. Spearman answers the
     question that is actually being asked: do the two orders agree. */
  const spearman = (rows, a, b) => {
    const rank = (key) => {
      const order = rows.map((row, i) => [row[key], i]).sort((x, y) => x[0] - y[0]);
      const out = new Array(rows.length);
      order.forEach(([, index], position) => { out[index] = position + 1; });
      return out;
    };
    const ra = rank(a), rb = rank(b), n = rows.length;
    if (n < 3) return null;
    const d2 = ra.reduce((sum, value, i) => sum + (value - rb[i]) ** 2, 0);
    return 1 - (6 * d2) / (n * (n * n - 1));
  };
  const rho = spearman(longest, "yield", "difference");
  const yieldTilt = {
    horizon: "momentum12m1m",
    everySeriesHigherOnTotalReturn: allPositive,
    spearmanYieldVsDifference: rho,
    sampleSize: longest.length,
    lowestYield: byYield[0] || null,
    highestYield: byYield[byYield.length - 1] || null,
    reading: allPositive && rho !== null && rho >= 0.7
      ? "Jede Reihe steht auf Gesamtrendite hoeher, und der Abstand folgt der Ausschuettung. Der Momentumfaktor bekaeme damit eine systematische Dividendenneigung, die er auf Kursbasis nicht hat - eine Rangwirkung, keine blosse Verschiebung. Bei " + longest.length + " Reihen ist das eine Richtung, keine Groesse."
      : "Kein einheitliches Muster in dieser Stichprobe."
  };

  /* How many of the universe could even take part. Stated as a number,
     because "not enough data" without one is an excuse. */
  let universeSize = null;
  if (existsSync(UNIVERSE)) {
    try { universeSize = Object.keys(JSON.parse(gunzipSync(readFileSync(UNIVERSE)).toString("utf8")).rows || {}).length; }
    catch { universeSize = null; }
  }

  const report = {
    schemaVersion: "momentum-return-basis-study-1.0.0",
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
    versions: { study_logic: "1.0.0" },
    question: "Ist der Quant-V2-Momentumfaktor auf splitbereinigter Kursbasis oder auf Gesamtrendite zu rechnen?",
    method: "Je Reihe wird jede Momentum-Laufzeit auf beiden Grundlagen gerechnet. Die splitbereinigte Reihe wird aus splitFactor rekonstruiert, damit der Vergleich Gesamtrendite gegen SPLITBEREINIGTEN Kurs lautet - das ist die tatsaechliche Wahl - und nicht gegen eine unbereinigte Reihe.",
    horizons: HORIZONS.map((h) => h.id),
    seriesStudied: series.length,
    universeSize,
    medianAbsoluteDifference: median,
    worstAbsoluteDifference: worst,
    yieldTilt,
    /* The honest limit, in the report rather than in a footnote. */
    canDecideTheFactor: false,
    whyNot: "Momentum ist ein Perzentil unter Vergleichstiteln. Ueber die Hoehe entscheidet nicht der Unterschied je Titel, sondern ob sich die RANGFOLGE verschiebt - und eine gleichmaessige Verschiebung aendert keinen einzigen Rang. Dafuer braeuchte es beide Spalten ueber das Universum; sie liegen fuer " + series.length + " von " + (universeSize || "?") + " Titeln vor.",
    whatWouldDecideIt: "Beide Kursspalten ueber das Produktuniversum, dann derselbe Vergleich als Rangkorrelation je Stichtag. Das ist ein Datenabruf, keine Methodikfrage.",
    note: "Nur eine Messung. Sie aendert keinen veroeffentlichten Wert und keine Faktorbasis.",
    series
  };

  writeFileSync(OUT, JSON.stringify(report, null, 1) + "\n");

  process.stdout.write("Momentum · Kursbasis gegen Gesamtrendite · " + series.length + " Reihen\n");
  for (const row of series) {
    process.stdout.write("  " + String(row.ticker).padEnd(6) +
      "Rendite p.a. ~" + (row.approximateAnnualYield * 100).toFixed(2).padStart(5) + " %  ");
    process.stdout.write(row.horizons.filter((h) => h.difference !== null)
      .map((h) => h.id.replace("momentum", "") + " " + (h.difference * 100 >= 0 ? "+" : "") + (h.difference * 100).toFixed(2))
      .join("  ") + "\n");
  }
  process.stdout.write("  Median |Differenz| " + (median * 100).toFixed(2) + " Prozentpunkte · groesste " +
    (worst * 100).toFixed(2) + "\n");
  process.stdout.write("  Befund: " + (yieldTilt.everySeriesHigherOnTotalReturn ? "jede Reihe hoeher auf Gesamtrendite" : "kein einheitliches Vorzeichen") +
    " · Rangkorrelation Ausschuettung/Differenz " + (rho === null ? "n/a" : rho.toFixed(2)) + " bei n=" + yieldTilt.sampleSize + "\n");
  process.stdout.write("  Entscheidet den Faktor: nein — die Rangverschiebung ueber das Universum ist damit nicht gemessen.\n");
}

main();
