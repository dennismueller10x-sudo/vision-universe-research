#!/usr/bin/env node
/* =========================================================================
   FULL-UNIVERSE RETURN-BASIS AUDIT — Schritte 2 bis 9.

   Baut ueber das gesamte identifizierbare Universum BEIDE Return-Reihen,
   rechnet dieselben Momentumgroessen zweimal und misst, was sich
   zwischen den beiden Basen bewegt: Werte, Perzentile, Raenge,
   Dividenden- und Sektorschieflage, Strategiewirkung, und das Ganze an
   mehreren historischen Stichtagen.

   WAS DIESES SKRIPT NICHT TUT

   Es entscheidet nichts. QUANT_V2_MOMENTUM_RETURN_BASIS bleibt
   PENDING_METHOD_DECISION; hier entstehen die Zahlen, auf denen die
   Entscheidung dann steht. Es schreibt auch keine Produktionszahl um:
   die Strategiewirkung ist eine Simulation neben der Produktion, kein
   Eingriff in sie.

   KEINE NEUE PIPELINE

   Gelesen wird derselbe wiederhergestellte kanonische Barstore, den die
   Materialisierung ohnehin liest, dazu das veroeffentlichte Factor
   Evidence und die bestehenden Strategieprofile. Kein Anbieter wird
   angefragt, keine Reihe geholt.
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import zlib from "node:zlib";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Series = require(join(ROOT, "quant/engines/return-series.js"));
const Compare = require(join(ROOT, "quant/engines/return-basis-comparison.js"));
const Taxonomy = require(join(ROOT, "quant/engines/sic-peer-taxonomy.js"));

function arg(name, fallback) {
  const at = process.argv.indexOf(name);
  return at === -1 ? fallback : process.argv[at + 1];
}
const WORK_DIR = arg("--work-dir", join(ROOT, ".market-cache"));
const PROVIDER = arg("--provider", "tiingo");
const BENCHMARK = arg("--benchmark", "SPY");
const BARS_DIR = join(WORK_DIR, PROVIDER, "daily");
const GOLDEN = join(ROOT, "quant/data/market/golden-preview/daily");
/* Standardziel ist das veroeffentlichte Artefakt. --out gibt es, damit
   ein Test die Studie laufen lassen kann, ohne den veroeffentlichten
   Stand zu ueberschreiben: eine Regression, die den Baum anfasst, macht
   jeden Testlauf zu einer Aenderung. */
const OUT = arg("--out", join(ROOT, "quant/data/providers/return-basis-universe-study.json"));

/* Die historischen Stichtage als Abstand in Handelstagen vom letzten
   Benchmarktag. Null ist heute, 252 ein Jahr zurueck. Jeder Stichtag
   sieht ausschliesslich Bars bis zu seinem eigenen Datum - der Rest der
   Reihe existiert fuer ihn nicht, sonst waere es Future Leakage. */
const CUTOFF_OFFSETS = arg("--cutoffs", "0,252,504,756,1008")
  .split(",").map((x) => parseInt(x.trim(), 10)).filter((x) => Number.isFinite(x) && x >= 0);

const MEASURES = ["3M", "6M", "12M", "12M-1M", "RELATIVE_STRENGTH"];
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const round = (v, d) => (finite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

/* ------------------------------------------------------------- Eingaenge */

function productUniverse() {
  const file = join(ROOT, "quant/data/market/scale/universe-ELIGIBLE_US_EQUITY.json");
  const payload = JSON.parse(readFileSync(file, "utf8"));
  return payload.securities || [];
}

function readSeries(securityId) {
  const fromStore = join(BARS_DIR, securityId + ".json");
  if (existsSync(fromStore)) return { source: "CANONICAL_STORE", payload: JSON.parse(readFileSync(fromStore, "utf8")) };
  const fromGolden = join(GOLDEN, securityId + ".json");
  if (existsSync(fromGolden)) return { source: "GOLDEN_PREVIEW", payload: JSON.parse(readFileSync(fromGolden, "utf8")) };
  return null;
}

/* Das veroeffentlichte Factor Evidence: gebraucht werden die
   Faktorwerte, die NICHT vom Momentum abhaengen. Die Simulation tauscht
   nur das Momentum aus und laesst alles andere so, wie es heute
   ausgeliefert wird. */
function publishedFactors() {
  const dir = join(ROOT, "quant/data/product/factor-evidence-v1");
  const map = new Map();
  map.asOf = null;
  if (!existsSync(dir)) return map;
  const summaryFile = join(dir, "summary.json");
  if (existsSync(summaryFile)) {
    map.asOf = JSON.parse(readFileSync(summaryFile, "utf8")).asOf || null;
  }
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json.gz"))) {
    const shard = JSON.parse(zlib.gunzipSync(readFileSync(join(dir, file))));
    for (const key of Object.keys(shard.securities || {})) {
      const entry = shard.securities[key];
      const scores = {};
      for (const [name, factor] of Object.entries(entry.factors || {})) {
        scores[name] = factor && factor.state === "AVAILABLE" && finite(factor.score) ? factor.score : null;
      }
      map.set(entry.securityId, {
        scores,
        priceBasis: entry.priceBasis || null,
        sic: entry.peer && Number.isFinite(entry.peer.industry) ? entry.peer.industry : null,
        /* Wann die Fundamentaldaten hinter den nicht-momentumbasierten
           Noten oeffentlich waren. Das ist die Groesse, an der sich
           entscheidet, ob ein Titel an einem Stichtag ueberhaupt
           bewertbar ist, ohne die Zukunft zu benutzen. */
        fundamentalsAvailableAt: entry.fundamentalsAvailableAt || null
      });
    }
  }
  return map;
}

/* ------------------------------------------------------------- Sektoren

   Die Universumsdatei fuehrt ein Feld `sector`, gefuellt ist es fuer 100
   von 6.874 Titeln. Ein Sektorbefund daraus waere eine Aussage ueber
   eineinhalb Prozent des Universums mit der Ueberschrift des ganzen.

   Gebraucht wird also die Klassifikation, die das Produkt ohnehin
   benutzt: die SIC-Zuordnung aus dem veroeffentlichten Factor Evidence,
   ueber die auch die Peergruppen der Faktorperzentile laufen. Die
   Division kommt aus sic-peer-taxonomy.js - keine zweite Taxonomie,
   dieselbe.

   Daneben die acht Sektoren, die der Auditauftrag namentlich nennt. Die
   SIC-Bereiche dafuer stehen unten und im Bericht, sie gelten NUR fuer
   diese Studie und sind keine Produkttaxonomie: das Produkt klassifiziert
   weiter nach Division. Wer die Tabelle liest, kann jede Zuordnung
   nachrechnen. */
const NAMED_SECTORS = [
  { sector: "Energy", ranges: [[1200, 1399], [2900, 2999], [4600, 4619]] },
  { sector: "Utilities", ranges: [[4900, 4991]] },
  { sector: "REITs", ranges: [[6798, 6798]] },
  { sector: "Financials", ranges: [[6000, 6499], [6700, 6797], [6799, 6799]] },
  { sector: "Real Estate", ranges: [[6500, 6599]] },
  { sector: "Health Care", ranges: [[2833, 2836], [3826, 3826], [3841, 3851], [8000, 8099]] },
  { sector: "Technology", ranges: [[3570, 3579], [3600, 3699], [7370, 7379]] },
  { sector: "Communication", ranges: [[2700, 2799], [4800, 4899], [7800, 7841]] },
  { sector: "Materials", ranges: [[1000, 1099], [1400, 1499], [2600, 2699], [2800, 2824], [2840, 2899], [3200, 3399]] },
  { sector: "Consumer Staples", ranges: [[2000, 2199], [2825, 2832], [5400, 5499], [5912, 5912]] },
  { sector: "Consumer Discretionary", ranges: [[2200, 2399], [3700, 3799], [5200, 5399], [5500, 5911], [5913, 5999], [7000, 7099], [7900, 7999]] },
  { sector: "Industrials", ranges: [[1500, 1799], [3400, 3569], [3580, 3599], [3710, 3728], [4000, 4599], [4620, 4799], [8700, 8748]] }
];

function namedSector(sic) {
  if (!Number.isFinite(sic)) return "(unclassified)";
  for (const entry of NAMED_SECTORS) {
    for (const [min, max] of entry.ranges) if (sic >= min && sic <= max) return entry.sector;
  }
  return "(other)";
}

function strategyProfiles() {
  const file = join(ROOT, "quant/methodology/strategy-profiles-v1.json");
  const payload = JSON.parse(readFileSync(file, "utf8"));
  /* Der Auditauftrag nennt vier Strategien. Die Profile heissen im
     Produkt teils anders - gematcht wird ueber die Profil-Id, damit hier
     keine zweite Strategiedefinition entsteht. */
  const wanted = ["momentum-leader", "quality-momentum", "value-momentum", "future-leader"];
  return (payload.profiles || []).filter((p) => wanted.includes(p.profileId));
}

/* Der Total-Return-Nachweis liegt in der Reihen-Engine, damit ihn ein
   Test mit konstruierten Bars gegen jede Kante fahren kann - er
   entscheidet ueber das Urteil der ganzen Studie. */
const verifyTotalReturn = Series.verifyTotalReturn;

/* -------------------------------------------------------- Hilfsgroessen */

function sliceMax(series, from, to) {
  let peak = -Infinity;
  for (let i = from; i <= to; i++) if (finite(series[i]) && series[i] > peak) peak = series[i];
  return peak === -Infinity ? null : peak;
}

function sma(series, i, window) {
  if (i + 1 < window) return null;
  let sum = 0;
  for (let k = i - window + 1; k <= i; k++) {
    if (!finite(series[k])) return null;
    sum += series[k];
  }
  return sum / window;
}

/* Die beiden Komponenten, die das Produkt als Kursstruktur fuehrt.
   Sie stehen hier mit, weil die Momentumnote der Produktion sie zu
   zwanzig Prozent traegt - eine Simulation ohne sie waere nicht die
   Groesse, die ueber die Strategiezugehoerigkeit entscheidet. */
function structureComponents(series, i) {
  const high = i >= 251 ? sliceMax(series, i - 251, i) : null;
  const mean = sma(series, i, 200);
  return {
    distanceTo52wHigh: finite(high) && high > 0 && finite(series[i]) ? (high - series[i]) / high : null,
    distanceToSma200: finite(mean) && mean > 0 && finite(series[i]) ? (series[i] - mean) / mean : null
  };
}

/* Nachlaufende Dividendenrendite ueber ein Jahr.

   Jede Ausschuettung wird gegen den Kurs IHRES Tages gerechnet und die
   Quotienten summiert. Das ist splitfest ohne Bereinigung: ein Split
   teilt Dividende und Kurs im selben Verhaeltnis, der Quotient bleibt.
   Eine Summe der Betraege geteilt durch den heutigen Kurs waere ueber
   einen Split hinweg falsch. */
function trailingYield(bars, i) {
  let sum = 0, events = 0;
  for (let k = Math.max(0, i - 251); k <= i; k++) {
    const bar = bars[k];
    if (finite(bar.dividend) && bar.dividend > 0 && finite(bar.close) && bar.close > 0) {
      sum += bar.dividend / bar.close;
      events += 1;
    }
  }
  return { yield: sum, events };
}

function yieldSegment(y, events) {
  if (events === 0) return "NO_DIVIDEND";
  if (y < 0.02) return "LOW_YIELD";
  if (y < 0.04) return "MEDIUM_YIELD";
  return "HIGH_YIELD";
}

/* --------------------------------------- Methodiktext gegen Implementierung

   Die veroeffentlichten componentSpecs nennen fuer jede Komponente ihre
   Eingabe. Zwei der sechs Momentumkomponenten sind dort als
   "split-adjusted close" beschrieben, gerechnet wird aber - wie
   priceBasis in jedem Eintrag ausweist - auf adjustedClose. Solange
   diese Spalte splitbereinigt waere, faellt das nicht auf; sie ist
   nachweislich gesamtrenditebereinigt, also ist es ein Unterschied.

   Das Skript entscheidet nichts daran. Es schreibt den Befund auf. */
function specFindings() {
  const summaryFile = join(ROOT, "quant/data/product/factor-evidence-v1/summary.json");
  if (!existsSync(summaryFile)) return [];
  const summary = JSON.parse(readFileSync(summaryFile, "utf8"));
  const specs = summary.componentSpecs || {};
  const findings = [];
  for (const [id, spec] of Object.entries(specs)) {
    if (!id.startsWith("momentum:")) continue;
    const declaresSplitAdjusted = /split-adjusted/i.test(String(spec.input || "") + " " + String(spec.note || ""));
    if (!declaresSplitAdjusted) continue;
    findings.push({
      component: id,
      weightInFactor: spec.weight,
      declaredInput: spec.input,
      computedOn: "adjustedClose",
      finding: "SPEC_DECLARES_SPLIT_ADJUSTED_BUT_COMPUTED_ON_TOTAL_RETURN_COLUMN",
      note: "Die veroeffentlichte Komponentenbeschreibung nennt den splitbereinigten Kurs, gerechnet wird auf der gesamtrenditebereinigten Spalte. Kein Eingriff durch diese Studie - ein Methodikpunkt fuer die anstehende Entscheidung."
    });
  }
  return findings;
}

/* ----------------------------------------------------------- Hauptlauf */

function main() {
  const started = Date.now();
  const universe = productUniverse();
  const published = publishedFactors();
  const profiles = strategyProfiles();

  /* Die Benchmark traegt beide Basen. Eine Gesamtrenditereihe gegen
     einen Kursindex zu halten waere ein Vergleich zweier Massstaebe -
     die relative Staerke misst dann die Dividendenrendite des Index
     mit, nicht die Staerke des Titels. */
  const benchFound = readSeries("ref_" + BENCHMARK);
  const bench = benchFound ? Series.build(benchFound.payload) : null;
  if (!bench || !bench.usable) {
    process.stdout.write("Benchmark " + BENCHMARK + " nicht verfuegbar - relative Staerke bleibt leer.\n");
  }
  const benchDates = bench && bench.usable ? bench.dates : null;

  /* Der Handelskalender. Er kommt von der Benchmark, sonst haette jeder
     Titel seinen eigenen Stichtag und die Querschnitte waeren nicht
     vergleichbar.

     Fehlt die Benchmark, wird ersatzweise die laengste gefundene Reihe
     zum Kalender - der Vergleich beider Basen braucht keine Benchmark,
     nur die relative Staerke tut es, und die bleibt dann leer statt
     geraten. Welcher Kalender es war, steht im Bericht. */
  let calendar = benchDates, calendarSource = "BENCHMARK";
  if (!calendar) {
    let longest = null;
    for (const security of universe) {
      const found = readSeries(security.securityId);
      if (!found) continue;
      const built = Series.build(found.payload);
      if (!built.usable) continue;
      if (!longest || built.bars > longest.bars) longest = { bars: built.bars, dates: built.dates, id: security.securityId };
      if (longest.bars > 3000) break;
    }
    if (longest) { calendar = longest.dates; calendarSource = "LONGEST_SERIES:" + longest.id; }
  }

  const cutoffs = [];
  if (calendar) {
    for (const offset of CUTOFF_OFFSETS) {
      const at = calendar.length - 1 - offset;
      if (at >= 252) cutoffs.push({ offset, date: calendar[at], benchIndex: benchDates ? at : -1 });
    }
  }
  if (!cutoffs.length) {
    process.stdout.write("Kein Stichtag mit ausreichender Historie - Studie nicht moeglich.\n");
  }

  const perCutoff = cutoffs.map((c) => ({
    cutoff: c, rows: [], sectors: new Map(), segments: new Map()
  }));

  const counters = {
    CANONICAL_PRODUCT_UNIVERSE: universe.length,
    SERIES_FOUND: 0,
    DUAL_RETURN_SERIES_CAPABLE_UNIVERSE: 0
  };
  const exclusions = {};
  const bySource = {};
  const verification = { securities: 0, events: 0, consistent: 0, worstError: 0,
    classes: {}, buckets: {}, affectedSecurities: 0, inconsistentSecurities: [] };

  for (const security of universe) {
    const found = readSeries(security.securityId);
    if (!found) { exclusions.NO_SERIES = (exclusions.NO_SERIES || 0) + 1; continue; }
    bySource[found.source] = (bySource[found.source] || 0) + 1;
    counters.SERIES_FOUND += 1;

    const built = Series.build(found.payload);
    if (!built.usable) {
      exclusions[built.reason] = (exclusions[built.reason] || 0) + 1;
      continue;
    }
    counters.DUAL_RETURN_SERIES_CAPABLE_UNIVERSE += 1;

    const bars = found.payload.bars;
    const check = verifyTotalReturn(bars, 24);
    if (check.checked > 0) {
      verification.securities += 1;
      verification.events += check.checked;
      verification.consistent += check.consistent;
      if (check.worst > verification.worstError) verification.worstError = check.worst;
      for (const [klass, count] of Object.entries(check.classes)) {
        verification.classes[klass] = (verification.classes[klass] || 0) + count;
      }
      for (const [bucket, byClass] of Object.entries(check.buckets || {})) {
        verification.buckets[bucket] = verification.buckets[bucket] || {};
        for (const [klass, count] of Object.entries(byClass)) {
          verification.buckets[bucket][klass] = (verification.buckets[bucket][klass] || 0) + count;
        }
      }
      if (check.consistent < check.checked) verification.affectedSecurities += 1;
      if (check.consistent < check.checked && verification.inconsistentSecurities.length < 50) {
        verification.inconsistentSecurities.push({
          securityId: security.securityId, checked: check.checked,
          consistent: check.consistent, worstError: round(check.worst, 6),
          classes: check.classes, samples: check.samples
        });
      }
    }

    /* Die Klassifikation kommt aus dem veroeffentlichten Evidence, nicht
       aus dem fast leeren sector-Feld der Universumsdatei. */
    const evidence = published.get(security.securityId);
    const sic = evidence && Number.isFinite(evidence.sic) ? evidence.sic : null;
    const division = Taxonomy.divisionForSic(sic);
    const sector = division ? division.id + " · " + division.name : "(unclassified)";
    const namedSectorLabel = namedSector(sic);

    for (let ci = 0; ci < cutoffs.length; ci++) {
      const cutoff = cutoffs[ci];
      /* Der letzte Bar bis einschliesslich zum Stichtag - nie ein
         spaeterer. Das ist die einzige Stelle, an der Future Leakage
         entstehen koennte, und sie ist eine Zeile lang. */
      let i = -1;
      for (let k = 0; k < built.dates.length && built.dates[k] <= cutoff.date; k++) i = k;
      if (i < 252) continue;

      const priceMomentum = Compare.momentumAt(built.price, i, bench && bench.price, cutoff.benchIndex);
      const totalMomentum = Compare.momentumAt(built.total, i, bench && bench.total, cutoff.benchIndex);
      const priceStructure = structureComponents(built.price, i);
      const totalStructure = structureComponents(built.total, i);
      const yieldInfo = trailingYield(bars, i);

      perCutoff[ci].rows.push({
        securityId: security.securityId,
        ticker: security.ticker,
        sector,
        namedSector: namedSectorLabel,
        sic,
        segment: yieldSegment(yieldInfo.yield, yieldInfo.events),
        trailingYield: yieldInfo.yield,
        price: priceMomentum,
        total: totalMomentum,
        priceStructure,
        totalStructure
      });
    }
  }

  /* ------------------------------------------------- Auswertung je Stichtag */

  const results = [];
  for (const bucket of perCutoff) {
    const rows = bucket.rows;
    if (!rows.length) continue;

    const measures = {};
    for (const measure of MEASURES) {
      /* RELATIVE STAERKE OHNE BENCHMARK

         Bei festem Stichtag ist der Benchmarkterm fuer JEDEN Titel
         derselbe: RS_i = log(P_i(t)/P_i(t-252)) - log(B(t)/B(t-252)).
         Der zweite Summand haengt nicht von i ab. Eine Konstante
         verschiebt aber keinen Rang - die Rangfolge der relativen
         Staerke ist damit exakt die Rangfolge der Zwoelfmonatsrendite,
         und diese Studie misst ausschliesslich Raenge.

         Die Benchmark liegt nicht im kanonischen Bestand: SPY ist kein
         Universumsmitglied, und die Repositoriumskopie traegt eine
         Spalte und rund 270 Punkte - fuer eine Gesamtrenditereihe
         reicht das nicht. Statt hier eine leere Zeile zu lassen oder
         die 12M-Zahlen unter fremdem Namen zu wiederholen, steht der
         Grund da, warum die Zeile 12M die Antwort ist. */
      if (measure === "RELATIVE_STRENGTH" && !(bench && bench.usable)) {
        measures[measure] = {
          state: "RANK_EQUIVALENT_TO_12M",
          reason: "BENCHMARK_NOT_IN_CANONICAL_STORE",
          rankStatisticsIdenticalTo: "12M",
          note: "Bei festem Stichtag ist der Benchmarkterm fuer alle Titel gleich. Relative Staerke ist dann die Zwoelfmonatsrendite minus einer Konstante, und eine Konstante aendert keinen Rang. Die Rangstatistik steht deshalb vollstaendig in der Zeile 12M; sie hier zu wiederholen waere dieselbe Messung unter zwei Namen.",
          benchmark: BENCHMARK
        };
        continue;
      }
      const a = Compare.rankField(rows.map((r) => r.price[measure]));
      const b = Compare.rankField(rows.map((r) => r.total[measure]));
      a.values = rows.map((r) => r.price[measure]);
      b.values = rows.map((r) => r.total[measure]);
      const stats = Compare.shiftStatistics(a, b);
      const churn = Compare.decileChurn(a, b);

      /* Segmentierte Schieflage: nach Dividendenrendite (Schritt 6) und
         nach Sektor (Schritt 7). Die Gruppen kommen aus den Zeilen, die
         Engine rechnet nur, was in ihnen passiert. */
      const bySegment = {}, bySector = {}, byNamedSector = {};
      rows.forEach((row, idx) => {
        (bySegment[row.segment] = bySegment[row.segment] || []).push(idx);
        (bySector[row.sector] = bySector[row.sector] || []).push(idx);
        (byNamedSector[row.namedSector] = byNamedSector[row.namedSector] || []).push(idx);
      });

      const largest = stats.UNIVERSE_N
        ? rows.map((r, idx) => ({ idx, delta: finite(a.percentiles[idx]) && finite(b.percentiles[idx])
              ? b.percentiles[idx] - a.percentiles[idx] : null }))
            .filter((x) => finite(x.delta))
            .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
            .slice(0, 15)
            .map((x) => ({
              ticker: rows[x.idx].ticker, sector: rows[x.idx].sector,
              segment: rows[x.idx].segment,
              trailingYield: round(rows[x.idx].trailingYield, 4),
              PRICE_RETURN_VALUE: round(a.values[x.idx], 6),
              TOTAL_RETURN_VALUE: round(b.values[x.idx], 6),
              PRICE_RETURN_PERCENTILE: round(a.percentiles[x.idx], 2),
              TOTAL_RETURN_PERCENTILE: round(b.percentiles[x.idx], 2),
              RANK_DELTA: round(b.ranks[x.idx] - a.ranks[x.idx], 1),
              PERCENTILE_DELTA: round(x.delta, 2)
            }))
        : [];

      measures[measure] = {
        priceRanked: a.n,
        totalRanked: b.n,
        UNIVERSE_N: stats.UNIVERSE_N,
        SPEARMAN_RANK_CORRELATION: round(stats.SPEARMAN_RANK_CORRELATION, 6),
        MEDIAN_ABSOLUTE_RANK_CHANGE: round(stats.MEDIAN_ABSOLUTE_RANK_CHANGE, 1),
        P90_RANK_CHANGE: round(stats.P90_RANK_CHANGE, 1),
        P95_RANK_CHANGE: round(stats.P95_RANK_CHANGE, 1),
        MAX_RANK_CHANGE: round(stats.MAX_RANK_CHANGE, 1),
        TITLES_MOVING_1_PERCENTILE: stats.TITLES_MOVING_1_PERCENTILE,
        TITLES_MOVING_5_PERCENTILES: stats.TITLES_MOVING_5_PERCENTILES,
        TITLES_MOVING_10_PERCENTILES: stats.TITLES_MOVING_10_PERCENTILES,
        topDecile: {
          TOP_DECILE_PRICE: churn.TOP_DECILE_A,
          TOP_DECILE_TOTAL: churn.TOP_DECILE_B,
          LEAVING: churn.LEAVING,
          ENTERING: churn.ENTERING
        },
        DIVIDEND_BIAS: Compare.segmentStatistics(bySegment, a, b),
        SECTOR_BIAS: Compare.segmentStatistics(bySector, a, b),
        NAMED_SECTOR_BIAS: Compare.segmentStatistics(byNamedSector, a, b),
        largestPercentileMoves: largest
      };
    }

    /* ---------------------------------------- Schritt 8: Strategiewirkung

       Die Momentumnote wird auf beiden Basen mit denselben sechs
       Komponenten und denselben Gewichten wie in der Produktion
       nachgebaut - aber ausschliesslich auf Universumsperzentilen. Die
       Produktion mischt zusaetzlich Peergruppen dazu; das ist hier nicht
       nachgebaut, und deshalb steht neben dem Ergebnis, wie nah die
       Simulation an der veroeffentlichten Note liegt. Ohne diese Zahl
       waere die Strategiewirkung eine Behauptung ueber ein Modell, das
       niemand geprueft hat. */
    const COMPONENT_WEIGHTS = Compare.PRODUCTION_MOMENTUM_WEIGHTS;
    const DIRECTION_LOWER = new Set(Compare.LOWER_IS_BETTER);

    function simulatedMomentum(basis) {
      const fields = {};
      for (const component of Object.keys(COMPONENT_WEIGHTS)) {
        const key = Compare.COMPONENT_SOURCE[component];
        const values = rows.map((r) => {
          if (key === "distanceTo52wHigh" || key === "distanceToSma200") {
            return (basis === "price" ? r.priceStructure : r.totalStructure)[key];
          }
          return (basis === "price" ? r.price : r.total)[key];
        });
        const ranked = Compare.rankField(values);
        fields[component] = DIRECTION_LOWER.has(component)
          ? ranked.percentiles.map((p) => (finite(p) ? 100 - p : null))
          : ranked.percentiles;
      }
      return rows.map((_, idx) => {
        let weighted = 0, weight = 0;
        for (const [key, w] of Object.entries(COMPONENT_WEIGHTS)) {
          const p = fields[key][idx];
          if (!finite(p)) continue;
          weighted += p * w; weight += w;
        }
        /* Dieselbe Regel wie im Faktorengine: fehlende Komponenten
           werden nicht mit null gefuellt, sondern aus dem Gewicht
           genommen - und unter halber Abdeckung gibt es keine Note. */
        return weight >= 0.5 ? weighted / weight : null;
      });
    }

    const simPrice = simulatedMomentum("price");
    const simTotal = simulatedMomentum("total");
    const simPriceRank = Compare.rankField(simPrice);
    const simTotalRank = Compare.rankField(simTotal);

    /* WELCHE STRATEGIEWIRKUNG AN DIESEM STICHTAG UEBERHAUPT MESSBAR IST

       Die Simulation tauscht nur das Momentum aus; Qualitaet, Wachstum,
       Wert, Profitabilitaet und Risiko kommen aus dem veroeffentlichten
       Evidence. Das hat EINEN Stichtag, und er liegt hier nach dem
       letzten Tag des kanonischen Barstores - der Bestand haengt der
       taeglichen Aktualisierung nach.

       Drei Faelle, und keiner davon wird stillschweigend genommen:

       - Evidence am oder vor dem Stichtag: sauber.
       - Evidence danach, aber jede benutzte Fundamentalzahl war am
         Stichtag schon oeffentlich: messbar, mit benannter Einschraenkung
         - die Peerperzentile wurden in einem spaeteren Querschnitt
         gerechnet. Titel, deren Fundamentaldaten erst nach dem Stichtag
         oeffentlich wurden, fallen raus statt mitgerechnet zu werden.
       - Sonst: nicht messbar, und dann steht das da statt einer Zahl. */
    const lagDays = published.asOf
      ? Math.round((Date.parse(published.asOf + "T00:00:00Z") -
                    Date.parse(bucket.cutoff.date + "T00:00:00Z")) / 86400000)
      : null;
    const evidenceAtOrBefore = published.asOf !== null && published.asOf <= bucket.cutoff.date;
    /* Nur am juengsten Stichtag. An einem Stichtag von vor drei Jahren
       waeren auch die Fundamentaldaten von heute die Zukunft, und kein
       Verfuegbarkeitsdatum rettet das. */
    const isPrimary = bucket === perCutoff.find((b) => b.rows.length);
    const fundamentalsUsable = (securityId) => {
      const entry = published.get(securityId);
      if (!entry) return false;
      if (evidenceAtOrBefore) return true;
      return entry.fundamentalsAvailableAt !== null &&
             entry.fundamentalsAvailableAt <= bucket.cutoff.date;
    };
    const strategyBasis = evidenceAtOrBefore
      ? "EVIDENCE_AT_OR_BEFORE_CUTOFF"
      : (isPrimary && published.asOf ? "FUNDAMENTALS_AT_OR_BEFORE_CUTOFF" : "NOT_APPLICABLE");
    const contemporaneous = strategyBasis !== "NOT_APPLICABLE";
    const publishedScores = rows.map((r) => {
      const entry = published.get(r.securityId);
      return entry && finite(entry.scores.momentum) ? entry.scores.momentum : null;
    });
    const publishedRank = Compare.rankField(publishedScores);
    const fidelity = contemporaneous ? Compare.spearman(simTotalRank.ranks, publishedRank.ranks) : null;
    const fidelityPrice = contemporaneous ? Compare.spearman(simPriceRank.ranks, publishedRank.ranks) : null;

    /* Dasselbe Argument fuer die Strategiewirkung: sie mischt
       veroeffentlichte Qualitaets-, Wachstums- und Risikonoten von heute
       mit einem Momentum von damals. An einem historischen Stichtag
       waere das Future Leakage, und ein Ergebnis daraus waere schlimmer
       als keines. */
    const strategyImpact = contemporaneous ? {} : {
      state: "NOT_APPLICABLE",
      reason: "PUBLISHED_FACTOR_EVIDENCE_IS_NOT_POINT_IN_TIME",
      note: "Die nicht-momentumbasierten Faktornoten liegen nur zum Stichtag " +
            (published.asOf || "(unbekannt)") + " vor. Sie auf einen frueheren Stichtag zu legen waere Future Leakage."
    };
    let excludedForFundamentals = 0;
    for (const profile of (contemporaneous ? profiles : [])) {
      function members(momentumPercentiles) {
        const list = [];
        rows.forEach((row, idx) => {
          const entry = published.get(row.securityId);
          if (!entry) return;
          if (!fundamentalsUsable(row.securityId)) return;
          let ok = true;
          for (const condition of profile.conditions) {
            const factorName = String(condition.field).split(".").pop();
            const value = factorName === "momentum" ? momentumPercentiles[idx] : entry.scores[factorName];
            /* Ein Titel ohne Wert erfuellt die Bedingung NICHT. Er
               faellt nicht durch, weil er schlecht ist, sondern weil er
               nicht gemessen ist - und beides an dieser Stelle gleich zu
               behandeln waere eine erfundene Aussage. Der Unterschied
               zaehlt hier trotzdem nicht, weil er auf beiden Basen
               identisch wirkt. */
            if (!finite(value)) { ok = false; break; }
            if (condition.operator === "gte" && !(value >= condition.value)) { ok = false; break; }
            if (condition.operator === "lte" && !(value <= condition.value)) { ok = false; break; }
          }
          if (ok) list.push(idx);
        });
        return list;
      }
      if (!excludedForFundamentals) {
        excludedForFundamentals = rows.filter((row) => published.has(row.securityId) &&
          !fundamentalsUsable(row.securityId)).length;
      }
      const onPrice = members(simPriceRank.percentiles);
      const onTotal = members(simTotalRank.percentiles);
      const setPrice = new Set(onPrice), setTotal = new Set(onTotal);
      const leaving = onPrice.filter((i) => !setTotal.has(i));
      const entering = onTotal.filter((i) => !setPrice.has(i));
      strategyImpact[profile.profileId] = {
        label: profile.label,
        MEMBERS_ON_PRICE_RETURN: onPrice.length,
        MEMBERS_ON_TOTAL_RETURN: onTotal.length,
        LEAVING: leaving.length,
        ENTERING: entering.length,
        MEMBERSHIP_CHURN_SHARE: onPrice.length
          ? round((leaving.length + entering.length) / Math.max(onPrice.length, onTotal.length), 4) : null,
        leavingExamples: leaving.slice(0, 10).map((i) => rows[i].ticker),
        enteringExamples: entering.slice(0, 10).map((i) => rows[i].ticker)
      };
    }

    results.push({
      cutoffDate: bucket.cutoff.date,
      tradingDaysBack: bucket.cutoff.offset,
      securitiesWithCutoff: rows.length,
      measures,
      simulation: {
        note: "Momentumnote aus denselben sechs Komponenten und Gewichten wie die Produktion, aber nur auf Universumsperzentilen. Die Produktion mischt Peergruppen dazu.",
        contemporaneousWithPublishedEvidence: contemporaneous,
        strategyBasis,
        publishedEvidenceAsOf: published.asOf,
        publishedEvidenceLagDays: lagDays,
        excludedForLateFundamentals: contemporaneous ? excludedForFundamentals : null,
        limitation: strategyBasis === "FUNDAMENTALS_AT_OR_BEFORE_CUTOFF"
          ? "Die benutzten Fundamentalzahlen waren am Stichtag oeffentlich, ihre Peerperzentile wurden aber in einem " +
            lagDays + " Tage spaeteren Querschnitt gerechnet. Titel mit spaeter verfuegbaren Fundamentaldaten sind ausgeschlossen."
          : null,
        SIMULATION_FIDELITY_TOTAL_VS_PUBLISHED: contemporaneous ? round(fidelity, 6) : null,
        SIMULATION_FIDELITY_PRICE_VS_PUBLISHED: contemporaneous ? round(fidelityPrice, 6) : null,
        publishedScored: contemporaneous ? publishedRank.n : null,
        simulatedScoredOnPrice: simPriceRank.n,
        simulatedScoredOnTotal: simTotalRank.n,
        momentumScoreShift: (() => {
          const s = Compare.shiftStatistics(simPriceRank, simTotalRank);
          return {
            UNIVERSE_N: s.UNIVERSE_N,
            SPEARMAN_RANK_CORRELATION: round(s.SPEARMAN_RANK_CORRELATION, 6),
            MEDIAN_ABSOLUTE_RANK_CHANGE: round(s.MEDIAN_ABSOLUTE_RANK_CHANGE, 1),
            P95_RANK_CHANGE: round(s.P95_RANK_CHANGE, 1),
            MAX_RANK_CHANGE: round(s.MAX_RANK_CHANGE, 1),
            TITLES_MOVING_5_PERCENTILES: s.TITLES_MOVING_5_PERCENTILES,
            TITLES_MOVING_10_PERCENTILES: s.TITLES_MOVING_10_PERCENTILES
          };
        })()
      },
      STRATEGY_IMPACT: strategyImpact
    });
  }

  /* ------------------------------------------------------------- Bericht */

  const storeSeen = bySource.CANONICAL_STORE || 0;
  const primary = results[0] || null;
  /* DAS URTEIL

     Bestaetigt ist die Gesamtrendite-Eigenschaft, wenn jedes gepruefte
     Ereignis passt - oder wenn die Ausnahmen ausschliesslich die
     Signatur einer zusaetzlichen Ausschuettung tragen beziehungsweise um
     einen Tag versetzt bereinigt wurden. Beides heisst: bereinigt
     wurde, nur nicht nach der einfachen Formel.

     Nicht bestaetigt ist sie, sobald ein Ereignis GAR NICHT oder
     WENIGER als die Bardividende bereinigt wurde. Das ist kein
     Formelproblem, sondern eine Reihe, die an diesem Tag keine
     Gesamtrendite ist.

     Die Schwelle ist bewusst hart: eine einzige unerklaerte Nicht-
     bereinigung reicht nicht, um alles zu verwerfen - dafuer steht der
     Anteil daneben -, aber sie steht im Urteil und faellt nicht unter
     eine Toleranz. */
  const unexplained = (verification.classes.NO_ADJUSTMENT_AT_ALL || 0) +
                      (verification.classes.ADJUSTMENT_INCONSISTENT || 0);
  const explained = (verification.classes.ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT || 0) +
                    (verification.classes.ADJUSTMENT_ON_NEIGHBOURING_DAY || 0);
  const totalReturnVerdict = verification.events < 30
    ? "NOT_MEASURED"
    : (verification.consistent === verification.events
        ? "TOTAL_RETURN_CONFIRMED"
        : (unexplained === 0
            ? "TOTAL_RETURN_CONFIRMED_WITH_CORPORATE_ACTIONS"
            : "TOTAL_RETURN_NOT_UNIFORM"));

  const report = {
    schemaVersion: "return-basis-universe-study-1.0.0",
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
    versions: {
      study_logic: "1.0.0",
      return_series: Series.ENGINE_VERSION,
      comparison: Compare.ENGINE_VERSION
    },
    scope: storeSeen > 0 ? "CANONICAL_HISTORY" : "REPOSITORY_ONLY",
    scopeNote: storeSeen > 0
      ? "Gelesen wurde der wiederhergestellte kanonische Barstore."
      : "Der kanonische Barstore war nicht verfuegbar. Gemessen wurde ausschliesslich, was im Repository liegt. Dieser Lauf ist KEINE Universumsstudie und darf nicht als eine gelesen werden.",
    inputs: {
      universeFile: "quant/data/market/scale/universe-ELIGIBLE_US_EQUITY.json",
      barsDir: BARS_DIR.replace(ROOT, "."),
      benchmark: bench && bench.usable
        ? { id: BENCHMARK, bars: bench.bars, last: bench.dates[bench.dates.length - 1] }
        : { id: BENCHMARK, state: "SOURCE_MISSING" },
      calendarSource,
      cutoffOffsets: CUTOFF_OFFSETS,
      sectorTaxonomy: {
        primary: "SIC_DIVISION",
        source: "quant/data/product/factor-evidence-v1 (peer.industry) via quant/engines/sic-peer-taxonomy.js",
        why: "Das Feld 'sector' der Universumsdatei ist fuer rund hundert von knapp siebentausend Titeln gefuellt. Die SIC-Zuordnung ist die Klassifikation, ueber die auch die Peerperzentile des Produkts laufen.",
        namedSectors: {
          taxonomy: "AUDIT_LOCAL_SIC_RANGES",
          note: "Gilt nur fuer diese Studie und ist keine Produkttaxonomie. Die Bereiche stehen hier, damit jede Zuordnung nachrechenbar ist.",
          ranges: NAMED_SECTORS
        }
      }
    },
    counters,
    bySource,
    exclusions,
    /* Der Total-Return-Nachweis ueber das Universum statt ueber fuenf
       Titel. Ohne ihn waere Reihe B eine Annahme. */
    totalReturnVerification: {
      verdict: totalReturnVerdict,
      securitiesChecked: verification.securities,
      eventsChecked: verification.events,
      eventsConsistent: verification.consistent,
      worstError: round(verification.worstError, 6),
      tolerance: 0.002,
      failureClasses: verification.classes,
      /* Getrennt nach Groesse der Ausschuettung: eine gewoehnliche
         Quartalsdividende liegt unter zwei Prozent des Kurses, alles ab
         fuenf ist der Sache nach etwas anderes. */
      byDistributionSize: verification.buckets,
      adjustmentBand: Series.ADJUSTMENT_BAND,
      affectedSecurities: verification.affectedSecurities,
      affectedSecuritiesShare: verification.securities
        ? round(verification.affectedSecurities / verification.securities, 6) : null,
      explainedByCorporateAction: explained,
      unexplained,
      unexplainedShare: verification.events ? round(unexplained / verification.events, 6) : null,
      inconsistentSecurities: verification.inconsistentSecurities
    },
    /* Wo die veroeffentlichte Methodik etwas anderes sagt als der Code
       tut. Kein Befund aus dem Vergleich, sondern aus dem Nebeneinander
       von componentSpecs und priceBasis - aber er gehoert genau hierher,
       weil er dieselbe Frage betrifft. */
    specImplementationFindings: specFindings(),
    /* Der kanonische Barstore und die taeglich aktualisierten
       Marktfaktoren stehen nicht auf demselben Tag. Fuer diese Studie
       ist das eine Einschraenkung mit Namen, kein Nebensatz: sie
       entscheidet, ob die Strategiewirkung ueberhaupt ohne Future
       Leakage messbar ist. */
    dataFreshnessFindings: (() => {
      const storeLast = results.length ? results[0].cutoffDate : null;
      if (!storeLast || !published.asOf) return [];
      if (published.asOf <= storeLast) return [];
      return [{
        finding: "CANONICAL_STORE_LAGS_PUBLISHED_EVIDENCE",
        canonicalStoreLastDate: storeLast,
        publishedEvidenceAsOf: published.asOf,
        lagDays: Math.round((Date.parse(published.asOf + "T00:00:00Z") -
                             Date.parse(storeLast + "T00:00:00Z")) / 86400000),
        note: "Die wiederhergestellte kanonische Historie endet frueher als der Stichtag des veroeffentlichten Factor Evidence, das aus dem Arbeitsbestand des taeglichen Marktdatenlaufs gebaut wurde. Diese Studie repariert das nicht; sie benennt die Folge fuer ihre eigene Messung."
      }];
    })(),
    /* Was die Produktion heute rechnet - gemessen, nicht angenommen.
       Solange das offen war, stand im Vertrag UNKNOWN_UNTIL_MEASURED. */
    publishedBasis: (() => {
      const basisCounts = {};
      for (const entry of published.values()) {
        basisCounts[entry.priceBasis || "(none)"] = (basisCounts[entry.priceBasis || "(none)"] || 0) + 1;
      }
      return {
        artefact: "quant/data/product/factor-evidence-v1",
        entries: published.size,
        priceBasisCounts: basisCounts,
        measuredQuantV2MomentumBasis: basisCounts.adjustedClose === published.size && published.size > 0 &&
          (totalReturnVerdict === "TOTAL_RETURN_CONFIRMED" ||
           totalReturnVerdict === "TOTAL_RETURN_CONFIRMED_WITH_CORPORATE_ACTIONS")
          ? "TOTAL_RETURN" : "MIXED_OR_UNCONFIRMED"
      };
    })(),
    cutoffs: results,
    gateStatus: {
      FULL_UNIVERSE_RETURN_AUDIT: storeSeen > 0 ? "PASS" : "REPOSITORY_ONLY",
      DUAL_RETURN_SERIES_CAPABLE_UNIVERSE: counters.DUAL_RETURN_SERIES_CAPABLE_UNIVERSE,
      PRICE_VS_TOTAL_RANK_CORRELATION: primary
        ? Object.fromEntries(MEASURES.map((m) => [m,
            primary.measures[m].state ? primary.measures[m].state
                                      : primary.measures[m].SPEARMAN_RANK_CORRELATION]))
        : null,
      DIVIDEND_BIAS: primary ? "MEASURED" : "NOT_MEASURED",
      SECTOR_BIAS: primary ? "MEASURED" : "NOT_MEASURED",
      STRATEGY_IMPACT: primary ? "MEASURED" : "NOT_MEASURED",
      HISTORICAL_ROBUSTNESS: results.length > 1 ? "MEASURED" : "SINGLE_CUTOFF_ONLY",
      /* Entscheidungsreif heisst: alle sieben Messungen liegen vor, ueber
         den kanonischen Bestand, an mehr als einem Stichtag. Es heisst
         NICHT, dass eine Basis gewonnen hat - das entscheidet der Owner. */
      METHODOLOGY_DECISION_READY: (storeSeen > 0 && primary && results.length > 1 &&
        (totalReturnVerdict === "TOTAL_RETURN_CONFIRMED" ||
         totalReturnVerdict === "TOTAL_RETURN_CONFIRMED_WITH_CORPORATE_ACTIONS")) ? "PASS" : "FAIL",
      QUANT_V2_MOMENTUM_RETURN_BASIS: "PENDING_METHOD_DECISION"
    },
    runtimeMs: Date.now() - started
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 1) + "\n");

  process.stdout.write("FULL-UNIVERSE RETURN-BASIS AUDIT · Schritte 2-9\n");
  process.stdout.write("  Bestand: " + report.scope + "\n");
  process.stdout.write("  Reihen gefunden: " + counters.SERIES_FOUND +
    " · beide Basen baubar: " + counters.DUAL_RETURN_SERIES_CAPABLE_UNIVERSE + "\n");
  process.stdout.write("  Total-Return-Nachweis: " + totalReturnVerdict +
    " (" + verification.consistent + "/" + verification.events + " Ereignisse, " +
    verification.securities + " Titel, schlechtester Fehler " +
    round(verification.worstError * 100, 4) + "%)\n");
  if (Object.keys(verification.classes).length) {
    process.stdout.write("    Abweichungen: " + Object.entries(verification.classes)
      .map(([k, n]) => k + " " + n).join(" · ") + "\n");
  }
  process.stdout.write("  Veroeffentlichte Basis: " + report.publishedBasis.measuredQuantV2MomentumBasis + "\n");
  for (const result of results) {
    process.stdout.write("  Stichtag " + result.cutoffDate + " (" + result.securitiesWithCutoff + " Titel)\n");
    for (const measure of MEASURES) {
      const m = result.measures[measure];
      if (m.state) { process.stdout.write("    " + measure.padEnd(18) + " " + m.state + " (" + m.reason + ")\n"); continue; }
      process.stdout.write("    " + measure.padEnd(18) +
        " rho=" + String(m.SPEARMAN_RANK_CORRELATION).padEnd(9) +
        " medRang=" + String(m.MEDIAN_ABSOLUTE_RANK_CHANGE).padStart(6) +
        " p95=" + String(m.P95_RANK_CHANGE).padStart(6) +
        " >5Pz=" + String(m.TITLES_MOVING_5_PERCENTILES).padStart(5) +
        " Dezil ab/zu=" + m.topDecile.LEAVING + "/" + m.topDecile.ENTERING + "\n");
    }
    process.stdout.write("    Simulation rho zur Produktion: " +
      (result.simulation.contemporaneousWithPublishedEvidence
        ? result.simulation.SIMULATION_FIDELITY_TOTAL_VS_PUBLISHED
        : "entfaellt (Evidence nicht gleichzeitig)") + "\n");
    for (const [id, impact] of Object.entries(result.STRATEGY_IMPACT)) {
      if (!impact || typeof impact !== "object" || !("MEMBERS_ON_PRICE_RETURN" in impact)) continue;
      process.stdout.write("    " + id.padEnd(18) + " Kurs " +
        String(impact.MEMBERS_ON_PRICE_RETURN).padStart(5) + " · Gesamt " +
        String(impact.MEMBERS_ON_TOTAL_RETURN).padStart(5) +
        " · ab " + impact.LEAVING + " zu " + impact.ENTERING + "\n");
    }
  }
  process.stdout.write("  METHODOLOGY_DECISION_READY: " + report.gateStatus.METHODOLOGY_DECISION_READY + "\n");
  process.stdout.write("  Bericht: " + OUT.replace(ROOT, ".") + "\n");
}

main();
