/* =========================================================================
   VISION UNIVERSE DISCOVER — price-coverage.mjs

   WIE VIELE KARTEN HABEN EINEN ECHTEN CHART - UND WARUM DIE ANDEREN NICHT

   Der Bericht, den die Abnahme verlangt, aus den Daten, nicht aus dem
   Gedaechtnis: je Titel des realen Universums, ob der Anbieter Historie
   hat (Gate-Bilanz und Faktoren), ob sie im freigegebenen Umfang liegt,
   ob eine Reihe ausgeliefert wird und ob die Startseite sie zeichnet.

   Ausfuehren: node scripts/discover/price-coverage.mjs [--md docs/...]
   ========================================================================= */
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveScope } from "../market/preview-scope.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = join(root, "discover", "data");
const readJSON = (p) => JSON.parse(readFileSync(p, "utf8"));
const args = process.argv.slice(2);
const mdOut = args.includes("--md") ? args[args.indexOf("--md") + 1] : null;

const meta = readJSON(join(DATA, "meta.json"));
const scope = resolveScope(root);
const realMeta = (meta.universes || []).find((u) => u.universeId === "US_REAL") || {};
const gateName = (realMeta.factorCoverage && realMeta.factorCoverage.factorsGate) || "FULL_UNIVERSE";
const gate = readJSON(join(root, "quant", "data", "market", "scale", `gate-${gateName}.json`));
const factors = readJSON(join(root, realMeta.sourceFile || `quant/data/market/factors/factors-${gateName}.json`));
const factorReady = new Set(factors.securities.filter((s) => s.values && s.values.returns &&
  Number.isFinite(s.values.returns["12M"])).map((s) => s.ticker));
const profile = readJSON(join(root, "quant", "config", "provider-profiles.json")).providers.tiingo;

const out = { generatedAt: meta.generatedAt, universes: [] };
for (const u of meta.universes) {
  const stocksDir = join(DATA, "stocks", u.universeId);
  const stocks = readdirSync(stocksDir).filter((n) => n.endsWith(".json")).map((n) => readJSON(join(stocksDir, n)));
  /* Ausgelieferte Reihen: der Series-Store des Builds (Modelluniversum)
     oder die kanonische kompakte Reihe (reales Universum). */
  const seriesDir = join(DATA, "series", u.universeId);
  const seriesFiles = existsSync(seriesDir) ? new Set(readdirSync(seriesDir).map((n) => n.replace(/\.json$/, ""))) : new Set();
  const kanonisch = join(root, "quant", "data", "market", "discover-series");
  if (u.kind === "real" && existsSync(kanonisch)) {
    for (const n of readdirSync(kanonisch)) {
      if (n === "index.json" || !n.endsWith(".json")) continue;
      const r = readJSON(join(kanonisch, n));
      if (r && r.ticker && Array.isArray(r.points) && r.points.length >= 5) seriesFiles.add(r.ticker);
    }
  }
  /* Intraday-Snapshots: welche Titel tragen einen Tagesverlauf? */
  const intradayDir = join(root, "quant", "data", "market", "intraday");
  const intradaySymbols = new Set();
  let intradaySessions = [];
  if (u.kind === "real" && existsSync(intradayDir)) {
    intradaySessions = readdirSync(intradayDir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    for (const d of intradaySessions) for (const n of readdirSync(join(intradayDir, d))) {
      if (!n.endsWith(".json")) continue;
      const snap = readJSON(join(intradayDir, d, n));
      if (snap && snap.symbol && Array.isArray(snap.points) && snap.points.length >= 2) intradaySymbols.add(snap.symbol);
    }
  }
  const homeFiles = readdirSync(join(DATA, "home")).filter((n) => n.startsWith(u.universeId) && n.endsWith(".json"));
  const homeCards = homeFiles.flatMap((f) => readJSON(join(DATA, "home", f)).surfaces || []).flatMap((s) => s.cards || []);
  const homeSymbols = new Set(homeCards.map((c) => c.symbol));
  const homeWithChart = new Set(homeCards.filter((c) => c.priceSeries && c.priceSeries.status === "CALCULATED").map((c) => c.symbol));

  const rows = stocks.map((s) => {
    const real = s.dataMode === "real";
    const providerHistory = real ? factorReady.has(s.symbol) : true;
    const inScope = real ? scope.tickers.has(s.symbol) : true;
    const delivered = seriesFiles.has(s.symbol);
    let reason = null;
    if (!delivered) {
      if (real && !providerHistory) reason = "NO_PROVIDER_HISTORY";
      else if (real && !inScope) reason = "NOT_IN_PREVIEW_SCOPE";
      else reason = "NOT_PUBLISHED_YET";
    }
    return { symbol: s.symbol, providerHistory, inScope, delivered, onHome: homeSymbols.has(s.symbol),
             chartOnHome: homeWithChart.has(s.symbol), intraday: intradaySymbols.has(s.symbol), reason };
  });
  const n = (f) => rows.filter(f).length;
  out.universes.push({
    universeId: u.universeId, kind: u.kind, securities: rows.length,
    providerHistory: n((r) => r.providerHistory),
    inPreviewScope: n((r) => r.inScope),
    seriesDelivered: n((r) => r.delivered),
    homeCards: homeCards.length, homeSymbols: homeSymbols.size,
    homeCardsWithChart: homeCards.filter((c) => c.priceSeries && c.priceSeries.status === "CALCULATED").length,
    homeSymbolsWithChart: homeWithChart.size,
    intraday: { sessions: intradaySessions, symbols: intradaySymbols.size,
                onHome: [...homeSymbols].filter((sym) => intradaySymbols.has(sym)).length,
                homeCards: homeCards.filter((c) => intradaySymbols.has(c.symbol)).length },
    withoutChart: rows.filter((r) => !r.delivered).reduce((acc, r) => { acc[r.reason] = (acc[r.reason] || 0) + 1; return acc; }, {}),
    examplesWithoutChart: rows.filter((r) => !r.delivered && r.onHome).slice(0, 12).map((r) => r.symbol + " (" + r.reason + ")")
  });
}
out.provider = {
  id: "tiingo", plan: gate.plan, licensingStatus: profile.licensing.status,
  findings: profile.licensing.findings,
  gate500: { requested: gate.accounting.requested, resolved: gate.accounting.resolved,
             historyCovered: gate.historyCoverage.covered, factorReady: gate.historyCoverage.factorReady,
             averageBars: gate.historyCoverage.averageBars, oldest: gate.historyCoverage.oldestFirstDate,
             newest: gate.historyCoverage.newestLastDate, storageMB: gate.accounting.storageMB }
};
out.scope = { tickerCount: scope.tickers.size, universeFile: scope.universeFile, fullHistory: [...scope.fullHistory].sort(),
              universeSource: scope.universeSource ? { source: scope.universeSource.source, file: scope.universeSource.file,
                                                       counts: scope.universeSource.counts, handover: scope.universeSource.handover.status } : null };

console.log(JSON.stringify(out, null, 2));
if (mdOut) {
  const r = out.universes.find((x) => x.kind === "real");
  const md = `# Discover — Abdeckung der Kursreihen

Erzeugt von \`scripts/discover/price-coverage.mjs\`, Stand ${out.generatedAt}.

| Frage | Antwort |
|---|---|
| Titel im realen Universum | ${r.securities} |
| davon mit Historie beim Anbieter (Tiingo, ${gateName}: ${out.provider.gate500.historyCovered}/${out.provider.gate500.requested} mit ≥ 250 Bars, im Schnitt ${out.provider.gate500.averageBars} Bars ab ${out.provider.gate500.oldest}) | ${r.providerHistory} |
| davon im freigegebenen Umfang (\`development-preview.json\`: ${out.scope.universeFile ? "scopeUniverse " + out.scope.universeFile : "Tickerliste"}; Umfang gesamt ${out.scope.tickerCount} Titel) | ${r.inPreviewScope} |
| davon mit ausgelieferter Kursreihe (\`quant/data/market/discover-series/\`) | ${r.seriesDelivered} |
| davon mit Intraday-Snapshot (\`quant/data/market/intraday/\`, Sitzungen ${r.intraday.sessions.join(", ") || "—"}) | ${r.intraday.symbols} |
| Karten auf der Startseite | ${r.homeCards} (${r.homeSymbols} Titel) |
| davon mit echtem Tageschart (Kursreihe) | ${r.homeCardsWithChart} (${r.homeSymbolsWithChart} Titel) |
| davon mit Tagesverlauf (Intraday) | ${r.intraday.homeCards} (${r.intraday.onHome} Titel) |
| ohne Kursreihe, nach Grund | ${Object.entries(r.withoutChart).map(([k, v]) => k + ": " + v).join(", ") || "—"} |
| Universumsquelle | ${out.scope.universeSource ? out.scope.universeSource.source + " (" + out.scope.universeSource.file + "), Company Master: " + out.scope.universeSource.handover : "—"} |
| Lizenzstatus Tiingo (\`provider-profiles.json\`) | ${out.provider.licensingStatus}; externalDisplay ${out.provider.findings.externalDisplay}, redistribution ${out.provider.findings.redistribution}, publicGithubStorage ${out.provider.findings.publicGithubStorage} |

Beispiele ohne Chart auf der Startseite: ${r.examplesWithoutChart.join(", ")}.
`;
  writeFileSync(join(root, mdOut), md);
  console.error("geschrieben: " + mdOut);
}
