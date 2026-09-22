/* =========================================================================
   VISION UNIVERSE — build-fx-history-ecb.mjs   (Currency Layer, O-7)

   HOLT DIE EZB-REFERENZKURSE ALS HISTORISCHEN FALLBACK.

   Nur dort, wo Tiingo nicht liefert. Der Owner-Entscheid O-7 ist an
   dieser Stelle eindeutig: eine zweite Quelle, kein zweiter
   Wahrheitsstand. Die Rangfolge steht in quant/config/fx-license.json
   und wird von fx-rates.js durchgesetzt, nicht von diesem Skript.

   DIE NAHTSTELLE IST DER INTERESSANTE TEIL

   Ab 2020-03-30 liefern beide Quellen. Ein Chart, der vor diesem Datum
   EZB-Kurse und danach Tiingo-Kurse verwendet, hat dort eine Naht - und
   wenn die beiden Quellen an derselben Stelle verschiedene Zahlen
   nennen, sieht ein Anleger einen Sprung, den es nie gegeben hat.

   Ein Fixing um 16:00 MEZ und ein Tagesschluss sind nicht dasselbe. Die
   Frage ist nicht, OB sie abweichen, sondern um wie viel. Dieses Skript
   misst es auf dem Ueberlappungsbereich und schreibt die Verteilung in
   den Bericht: Median, 95. Perzentil, Maximum. Erst diese Zahl
   entscheidet, ob die Naht vertretbar ist - nicht die Hoffnung.

   LIZENZ

   Die EZB gestattet die Wiedergabe unter Nennung der Quelle. Anders als
   die Anbieterreihen duerfen diese Reihen deshalb im ausgelieferten Pfad
   liegen. Ob sie es sollen, entscheidet --publish; der Standard bleibt
   die Arbeitsablage, weil ein Vollbestand ab 1999 gross ist und die
   meisten Laeufe ihn nicht brauchen.

   Ausfuehren:
     node scripts/market/build-fx-history-ecb.mjs
     node scripts/market/build-fx-history-ecb.mjs --feed=FULL_HISTORY
     node scripts/market/build-fx-history-ecb.mjs --dry-run
   ========================================================================= */
import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ECB = require(join(ROOT, "providers", "ecb", "adapter.js"));
const Rates = require(join(ROOT, "quant", "engines", "fx", "fx-rates.js"));
const Registry = require(join(ROOT, "quant", "engines", "fx", "currency-registry.js"));

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const DRY_RUN = flags.has("--dry-run");
const PUBLISH = flags.has("--publish");
const feedArg = args.find((a) => a.startsWith("--feed="));
const FEED = ECB.FEEDS[feedArg ? feedArg.slice("--feed=".length) : "FULL_HISTORY"] || ECB.FEEDS.FULL_HISTORY;

const OUT_DIR = PUBLISH
  ? resolve(ROOT, "quant", "data", "market", "fx", "ecb")
  : resolve(ROOT, ".market-cache", "currency", "fx-ecb");
const REPORT = PUBLISH
  ? resolve(ROOT, "quant", "data", "market", "fx", "ecb-coverage.json")
  : resolve(ROOT, ".market-cache", "currency", "ecb-coverage.json");

function readFirst(...candidates) {
  for (const file of candidates) if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  return null;
}

/* Welche Waehrungen der Bestand ueberhaupt braucht - datengetrieben aus
   O-3, nicht aus einer Liste in diesem Skript. Alles andere waere die
   handgepflegte Parallelwelt, die O-3 ausschliesst. */
const requirements = readFirst(
  resolve(ROOT, "quant", "data", "market", "fx", "pair-requirements.json"),
  resolve(ROOT, ".market-cache", "currency", "pair-requirements.json"));

const neededCurrencies = requirements
  ? [...new Set([
      ...Object.keys(requirements.reportingCurrencies || {}),
      ...Object.keys(requirements.tradingCurrencies || {})
    ])].filter((c) => Registry.normalize(c)).sort()
  : [];

async function main() {
  if (DRY_RUN) {
    console.log(`--dry-run: wuerde ${FEED.label} holen (${FEED.url}, ca. ${Math.round(FEED.approxBytes / 1024)} KB).`);
    console.log(`  Gebrauchte Waehrungen laut Bestand: ${neededCurrencies.length}`);
    console.log(`  ${neededCurrencies.join(", ")}`);
    console.log(`  Ziel: ${OUT_DIR.replace(ROOT + "/", "")}`);
    process.exit(0);
  }

  const started = Date.now();
  let xml;
  try {
    const res = await fetch(FEED.url, { headers: { Accept: "application/xml" } });
    if (!res.ok) {
      console.error(`ABBRUCH: HTTP ${res.status} von ${FEED.url}`);
      process.exit(2);
    }
    xml = await res.text();
  } catch (err) {
    console.error(`ABBRUCH: Abruf fehlgeschlagen - ${err && err.message}`);
    console.error("  Die EZB ist eine oeffentliche Quelle ohne Zugangsdaten; ein Fehlschlag ist ein Netz- oder Richtlinienproblem.");
    process.exit(2);
  }

  const parsed = ECB.parseEurofxref(xml);
  if (!parsed.days.length) {
    console.error(`ABBRUCH: kein auswertbarer Inhalt (${parsed.reason}).`);
    process.exit(2);
  }
  const allSeries = ECB.toPairSeries(parsed.days);
  const durationMs = Date.now() - started;

  /* Nur die gebrauchten Waehrungen ablegen. Die EZB fuehrt gut dreissig;
     was das Universum nicht braucht, ist Ballast im Repository. */
  const wanted = neededCurrencies.length
    ? allSeries.filter((s) => neededCurrencies.includes(s.quote))
    : allSeries;

  mkdirSync(OUT_DIR, { recursive: true });
  const asOf = new Date().toISOString();
  const written = [];

  for (const s of wanted) {
    /* Gegenprobe im Store, bevor etwas geschrieben wird. */
    const store = Rates.createStore();
    const stats = store.ingest(s.base, s.quote, s.points,
      { source: "ecb", role: "FALLBACK", frequency: "DAILY" });
    if (!stats.observations) continue;

    writeFileSync(join(OUT_DIR, `${s.base}${s.quote}.json`), JSON.stringify({
      schema: "vu-fx-series-1.0.0",
      base: s.base, quote: s.quote,
      source: "ecb", role: "FALLBACK", frequency: "DAILY",
      priceBasis: "EZB-Referenzkurs, erhoben gegen 16:00 MEZ",
      attribution: "Wechselkurse: Europäische Zentralbank (EZB-Referenzkurse).",
      feed: FEED.id, asOf,
      first: stats.first, last: stats.last,
      observations: stats.observations,
      rejectedRows: stats.rejectedRows, duplicateDates: stats.duplicateDates,
      points: s.points
    }, null, 2) + "\n");
    written.push({ pair: `${s.base}/${s.quote}`, observations: stats.observations,
                   first: stats.first, last: stats.last });
  }

  /* --------------------------------------------------------------- */
  /* Die Nahtstelle messen                                             */
  /* --------------------------------------------------------------- */
  const tiingoDirs = [
    resolve(ROOT, ".market-cache", "currency", "fx"),
    resolve(ROOT, "quant", "data", "market", "fx")
  ];
  const seam = [];
  for (const dir of tiingoDirs) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_"))) {
      let t;
      try { t = JSON.parse(readFileSync(join(dir, file), "utf8")); } catch { continue; }
      if (t.source !== "tiingo" || !Array.isArray(t.points) || !t.points.length) continue;

      /* Beide Reihen in einen Store, jede mit ihrer Quelle. Verglichen
         wird, was die Engine an denselben Tagen aus beiden macht - nicht
         zwei Rohreihen nebeneinander. */
      const store = Rates.createStore();
      store.ingest(t.base, t.quote, t.points, { source: "tiingo", role: "PRIMARY", frequency: "DAILY" });
      const ecbSeries = allSeries.find((s) => s.quote === t.quote && t.base === "EUR")
        || allSeries.find((s) => s.quote === t.base && t.quote === "EUR");
      if (!ecbSeries) continue;

      const ecbStore = Rates.createStore();
      ecbStore.ingest("EUR", ecbSeries.quote, ecbSeries.points, { source: "ecb", role: "FALLBACK", frequency: "DAILY" });

      const diffs = [];
      for (const [date] of t.points) {
        const a = store.rateAt(t.base, t.quote, date);
        const b = ecbStore.rateAt(t.base, t.quote, date);
        if (!a.available || !b.available) continue;
        if (a.method !== "DAILY_AT_DATE" || b.method !== "DAILY_AT_DATE") continue;
        diffs.push(Math.abs(a.rate - b.rate) / b.rate);
      }
      if (diffs.length < 30) continue;
      diffs.sort((x, y) => x - y);
      const pick = (p) => diffs[Math.min(diffs.length - 1, Math.floor(diffs.length * p))];
      seam.push({
        pair: `${t.base}/${t.quote}`,
        overlapDays: diffs.length,
        medianRelDiff: pick(0.5),
        p95RelDiff: pick(0.95),
        maxRelDiff: diffs[diffs.length - 1]
      });
    }
    if (seam.length) break;
  }

  const worst = seam.length ? Math.max(...seam.map((s) => s.p95RelDiff)) : null;

  const report = {
    schema: "vu-ecb-coverage-1.0.0",
    generatedAtUtc: asOf,
    provider: "ecb",
    role: "FALLBACK",
    feed: { id: FEED.id, url: FEED.url, label: FEED.label },
    attribution: "Wechselkurse: Europäische Zentralbank (EZB-Referenzkurse).",
    durationMs,
    daysParsed: parsed.days.length,
    rejectedRows: parsed.rejected,
    earliest: parsed.days[0] ? parsed.days[0].date : null,
    latest: parsed.days[parsed.days.length - 1] ? parsed.days[parsed.days.length - 1].date : null,
    currenciesPublished: allSeries.map((s) => s.quote).sort(),
    currenciesNeeded: neededCurrencies,
    currenciesCovered: wanted.map((s) => s.quote).sort(),
    currenciesMissing: neededCurrencies.filter((c) => c !== "EUR" && !allSeries.some((s) => s.quote === c)),
    seriesWritten: written,
    outputDir: OUT_DIR.replace(ROOT + "/", ""),
    published: PUBLISH,
    /* Die Zahl, die ueber die Naht entscheidet. */
    seamAnalysis: {
      note: "Relative Abweichung zwischen EZB-Fixing (16:00 MEZ) und Tiingo-Tagesschluss auf dem " +
            "Ueberlappungsbereich. Ein Chart wechselt am Beginn der Tiingo-Historie die Quelle; " +
            "diese Zahl sagt, wie gross der Sprung an der Naht hoechstens ist.",
      pairs: seam,
      worstP95: worst,
      verdict: worst === null ? "NOT_MEASURED"
             : worst < 0.005 ? "SEAM_ACCEPTABLE"
             : worst < 0.02 ? "SEAM_VISIBLE"
             : "SEAM_UNACCEPTABLE"
    }
  };

  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");

  console.log(`EZB-Referenzkurse: ${parsed.days.length} Handelstage, ${report.earliest} bis ${report.latest}`);
  console.log(`  Waehrungen veroeffentlicht: ${allSeries.length}, davon gebraucht: ${wanted.length}`);
  if (report.currenciesMissing.length) {
    console.log(`  NICHT bei der EZB: ${report.currenciesMissing.join(", ")}`);
  }
  console.log(`  Reihen geschrieben: ${written.length} nach ${report.outputDir}`);
  if (seam.length) {
    console.log(`  Naht (EZB vs. Tiingo auf der Ueberlappung):`);
    for (const s of seam.slice(0, 8)) {
      console.log(`    ${s.pair.padEnd(9)} ${s.overlapDays} Tage  Median ${(s.medianRelDiff * 100).toFixed(4)} %  p95 ${(s.p95RelDiff * 100).toFixed(4)} %  max ${(s.maxRelDiff * 100).toFixed(4)} %`);
    }
    console.log(`  Befund: ${report.seamAnalysis.verdict}`);
  } else {
    console.log(`  Naht nicht gemessen - kein Tiingo-Bestand zum Vergleich vorhanden.`);
  }
  console.log(`\nBericht: ${REPORT}`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
