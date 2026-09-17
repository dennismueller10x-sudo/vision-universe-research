/* =========================================================================
   VISION UNIVERSE — publish-discover-series.mjs

   DIE KOMPAKTE KURSREIHE FUER DISCOVER

   Discover braucht fuer einen Micro-Chart keine 9.000 OHLCV-Bars je Titel,
   sondern ein Jahr Tagesschlusskurse - rund 260 Punkte, split-bereinigt,
   mit Herkunft und Stand. Das sind 5 KB je Titel statt 500 KB; 500 Titel
   sind 2,5 MB, 7.000 Titel 35 MB. Das passt in ein Repository und auf
   GitHub Pages, und es ist ein anderer Ausschnitt als die vollstaendige
   Historie: weniger Daten, dieselbe Wahrheit.

   WOHER: aus der Arbeitsablage des MarketStore (.market-cache, dort liegen
   die vollen Reihen nach einem Ingest) - oder mit --from-published aus
   dem bereits veroeffentlichten Golden-Five-Ausschnitt, damit die Kette
   auch ohne Zugang und ohne Arbeitsablage bis zum Chart durchlaeuft.

   WOHIN: quant/data/market/discover-series/<securityId>.json

   OB: entscheidet je Titel dieselbe Anzeigerichtlinie wie fuer alles
   andere (quant/engines/display-policy.js) ueber den Umfang aus
   quant/config/development-preview.json. Dieses Skript erweitert den
   Umfang nicht - es liefert aus, was die Konfiguration freigibt, und
   nichts sonst. Ein Titel ausserhalb des Umfangs wird nicht geschrieben,
   und assert-public-data-hygiene.mjs schlaegt an, wenn einer dort liegt.

   Ausfuehren:
     node scripts/market/publish-discover-series.mjs                 (Arbeitsablage)
     node scripts/market/publish-discover-series.mjs --from-published
     node scripts/market/publish-discover-series.mjs --dry-run
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { loadPreviewConfig, resolveScope, expandPreviewConfig } from "./preview-scope.mjs";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = join(HERE, "..", "..");

export const SERIES_DIR = join("quant", "data", "market", "discover-series");
export const SERIES_SCHEMA = "discover-series-1.1.0";
/* Ein Jahr Handelstage plus Reserve, damit "1J" im Chart wirklich ein
   Jahr zeigt, auch nach Feiertagen. */
export const DEFAULT_POINTS = 270;

function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
function round2(v) { return Math.round(v * 100) / 100; }

/* Split-bereinigte Schlusskurse aus Rohbars - dieselbe Ableitung wie in
   scripts/discover/build-discover-data.mjs und golden-five-series.mjs:
   aus splitFactor, nicht aus der adjClose-Spalte des Anbieters. */
export function splitAdjustedCloses(bars) {
  const n = bars.length;
  const factors = new Array(n).fill(1);
  let cumulative = 1;
  for (let i = n - 1; i >= 0; i--) {
    factors[i] = cumulative;
    const sf = bars[i].splitFactor;
    if (isNum(sf) && sf !== 1) cumulative *= sf;
  }
  return bars.map((b, i) => ({ date: String(b.date).slice(0, 10),
                               close: isNum(b.close) ? b.close / factors[i] : null }));
}

/**
 * Baut die kompakte Reihe aus einer Bar-Nutzlast des MarketStore.
 * @returns {object|null}  null, wenn zu wenig Historie
 */
export function compactSeries(payload, security, permission, opts) {
  opts = opts || {};
  const maxPoints = opts.maxPoints || DEFAULT_POINTS;
  const bars = (payload && payload.bars) || [];
  const dated = splitAdjustedCloses(bars).filter((b) => isNum(b.close));
  if (dated.length < 30) return null;
  const fenster = dated.slice(-maxPoints);
  return {
    schemaVersion: SERIES_SCHEMA,
    /* Dieselben Felder, die der Chart Truth Contract im Client verlangt
       (status, source): die Karte laedt diese Datei direkt, ohne Kopie. */
    status: "CALCULATED",
    source: payload.provider || "tiingo",
    securityId: security.securityId,
    ticker: security.ticker,
    instrumentId: security.ticker,
    provider: payload.provider || "tiingo",
    dataMode: "real",
    priceSeriesType: "SPLIT_ADJUSTED",
    currency: payload.currency || "USD",
    range: "1Y",
    grain: "daily",
    from: fenster[0].date,
    to: fenster[fenster.length - 1].date,
    asOf: fenster[fenster.length - 1].date,
    points: fenster.map((b) => [b.date, round2(b.close)]),
    barCount: fenster.length,
    sourceBarCount: bars.length,
    /* Der Stand der Quelle, nicht die Wanduhr: derselbe Bestand ergibt
       dieselbe Datei. */
    sourceUpdatedAt: payload.updatedAt || payload.fetchedAt || null,
    publishBasis: permission.basis,
    publishCheckedAt: permission.checkedAt || null,
    note: "Kompakte Reihe fuer Discover: Tagesschlusskurse, split-bereinigt, letzte " +
          fenster.length + " Handelstage. Kein Intraday, keine Volumina, keine OHLC."
  };
}

/**
 * Veroeffentlicht die kompakten Reihen fuer den Umfang der Konfiguration.
 *
 * @param {object} opt { root, fromPublished, dryRun, workingDir, log }
 * @returns {{ written: string[], skipped: Array, unresolved: string[] }}
 */
export function publishDiscoverSeries(opt) {
  opt = opt || {};
  const root = opt.root || DEFAULT_ROOT;
  const log = opt.log || (() => {});
  const engines = join(root, "quant", "engines");
  const DisplayPolicy = require(join(engines, "display-policy.js"));
  const MarketStore = require(join(engines, "market-store.js"));

  const config = loadPreviewConfig(root);
  const resolved = resolveScope(root, config);
  DisplayPolicy.declareFromConfig(expandPreviewConfig(config, resolved));

  const gateConfig = JSON.parse(readFileSync(join(root, "quant", "config", "feature-gates.json"), "utf8"));
  const gates = DisplayPolicy.gatesFromConfig(gateConfig);

  const store = MarketStore.createMarketStore({ root, providerId: "tiingo",
                                                workingDir: opt.workingDir || undefined });
  const publishedDir = join(root, "quant", "data", "market", "golden-preview", "daily");
  const outDir = join(root, SERIES_DIR);

  const written = [], skipped = [];
  const erwartet = new Set();
  /* --prune-only: nichts neu schreiben, nur entfernen, was nicht mehr im
     Umfang steht (z. B. nach einem Wechsel der Universumsquelle), und das
     Verzeichnis nachziehen. */
  if (opt.pruneOnly) {
    const imUmfang = new Set(resolved.securities.map((s) => s.securityId + ".json"));
    let entfernt = 0;
    if (existsSync(outDir)) for (const name of readdirSync(outDir)) {
      if (name === "index.json" || !name.endsWith(".json")) continue;
      if (imUmfang.has(name)) { erwartet.add(name); written.push(name.replace(/^ref_/, "").replace(/\.json$/, "")); continue; }
      rmSync(join(outDir, name)); entfernt++; log(`    entfernt: ${name} (nicht mehr im Umfang)`);
    }
    if (!opt.dryRun) writeIndex(outDir, resolved, written, skipped);
    return { written, skipped, unresolved: resolved.unresolved, scope: resolved, pruned: entfernt };
  }
  for (const security of resolved.securities) {
    /* Oeffentliche Freigabe zuerst (Eigentuemerentscheidung 2026-09-13,
       grants mit publicRawDisplayAllowed); fehlt sie, gilt je Titel die
       enge Development-Preview-Erlaubnis. Zwei Stufen derselben
       Richtlinie, keine zweite Regel. */
    let anzeige = DisplayPolicy.check({
      providerId: "tiingo", dataClass: "marketData", audience: "public", form: "raw", gates
    });
    if (!anzeige.allowed) {
      anzeige = DisplayPolicy.check({
        providerId: "tiingo", dataClass: "marketData", audience: "development_preview",
        form: "raw", ticker: security.ticker, gates
      });
    }
    if (!anzeige.allowed) {
      skipped.push({ ticker: security.ticker, reason: "notPermitted", message: anzeige.message });
      continue;
    }
    let payload = store.readBars(security.securityId, "working");
    let quelle = "working";
    if (!payload && opt.fromPublished) {
      const file = join(publishedDir, security.securityId + ".json");
      if (existsSync(file)) { payload = JSON.parse(readFileSync(file, "utf8")); quelle = "golden-preview"; }
    }
    if (!payload) {
      skipped.push({ ticker: security.ticker, reason: "noWorkingData",
                     message: "Keine Bars in der Arbeitsablage" + (opt.fromPublished ? " und nicht veroeffentlicht" : "") + "." });
      continue;
    }
    const reihe = compactSeries(payload, security, anzeige, opt);
    if (!reihe) {
      skipped.push({ ticker: security.ticker, reason: "insufficientHistory", message: "Weniger als 30 Schlusskurse." });
      continue;
    }
    reihe.sourceScope = quelle;
    erwartet.add(security.securityId + ".json");
    const file = join(outDir, security.securityId + ".json");
    if (!opt.dryRun) {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(file, JSON.stringify(reihe));
    }
    written.push(security.ticker);
    log(`    ${security.ticker.padEnd(6)} ${reihe.barCount} Punkte ${reihe.from} … ${reihe.to} (${quelle})`);
  }

  /* Was nicht mehr im Umfang steht, verschwindet - eine Reihe, die
     einmal freigegeben war, bleibt nicht aus Versehen liegen. */
  if (!opt.dryRun && existsSync(outDir)) {
    for (const name of readdirSync(outDir)) {
      if (name === "index.json" || erwartet.has(name)) continue;
      if (name.endsWith(".json")) { rmSync(join(outDir, name)); log(`    entfernt: ${name} (nicht mehr im Umfang)`); }
    }
    writeIndex(outDir, resolved, written, skipped);
  }
  return { written, skipped, unresolved: resolved.unresolved, scope: resolved };
}

function writeIndex(outDir, resolved, written, skipped) {
  {
    writeFileSync(join(outDir, "index.json"), JSON.stringify({
      schemaVersion: SERIES_SCHEMA,
      note: "Kompakte Discover-Kursreihen (1 Jahr Tagesschlusskurse, split-bereinigt) fuer den in " +
            "quant/config/development-preview.json freigegebenen Umfang. Erzeugt von " +
            "scripts/market/publish-discover-series.mjs; geprueft von assert-public-data-hygiene.mjs.",
      scope: { tickers: [...resolved.tickers].sort(), universeFile: resolved.universeFile },
      count: written.length,
      tickers: written.slice().sort(),
      skipped: skipped.map((s) => ({ ticker: s.ticker, reason: s.reason }))
    }, null, 2));
  }
}

/* ------------------------------------------------------------ als Skript */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = new Set(process.argv.slice(2));
  const rootArg = process.argv.find((a) => a.startsWith("--root="));
  console.log("Vision Universe — kompakte Discover-Kursreihen\n");
  const result = publishDiscoverSeries({
    root: rootArg ? rootArg.slice(7) : DEFAULT_ROOT,
    fromPublished: args.has("--from-published"),
    dryRun: args.has("--dry-run"),
    pruneOnly: args.has("--prune-only"),
    log: (m) => console.log(m)
  });
  console.log(`\n  Umfang: ${result.scope.tickers.size} Titel` +
              (result.scope.universeFile ? ` (scopeUniverse: ${result.scope.universeFile})` : " (Tickerliste)"));
  console.log(`  geschrieben: ${result.written.length}`);
  const gruende = {};
  result.skipped.forEach((s) => { gruende[s.reason] = (gruende[s.reason] || 0) + 1; });
  if (result.skipped.length) console.log(`  uebersprungen: ${result.skipped.length} ` + JSON.stringify(gruende));
  if (result.unresolved.length) console.log(`  ohne Wertpapierdaten (securityId abgeleitet): ${result.unresolved.join(", ")}`);
  if (args.has("--dry-run")) console.log("\n  Probelauf - nichts geschrieben.");
}
