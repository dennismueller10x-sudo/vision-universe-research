/* =========================================================================
   VISION UNIVERSE — preview-scope.mjs

   WELCHE TITEL DUERFEN KURSE ZEIGEN - UND WOHER KOMMT DIE LISTE

   quant/config/development-preview.json traegt die Entscheidung des
   Eigentuemers, fuer welche Titel echte Kursreihen in die oeffentliche
   Auslieferung duerfen. Bisher stand diese Liste an drei Stellen
   (Ingest, Hygiene-Guard, Discover-Build) je einmal als "die fuenf
   Ticker". Hier steht sie EINMAL, und sie kann zwei Formen haben:

     scope:          ["AAPL", "MSFT", ...]     eine Tickerliste
     scopeUniverse:  "GATE_500"                ein Universum aus
                                               quant/data/market/scale/

   Beides zusammen ist die Vereinigung. Der Eigentuemer erweitert den
   Umfang, indem er hier EINE Zeile aendert - nicht, indem er fuenf
   Skripte anfasst. Und was diese Datei nicht nennt, wird nirgends
   ausgeliefert.

   Was dieses Modul NICHT tut: eine Erlaubnis erteilen. Es loest nur auf,
   fuer welche Titel die in der Konfiguration erteilte Erlaubnis gilt. Ob
   sie erteilt werden durfte, ist eine Lizenzfrage (provider-profiles.json:
   Tiingo licensing.status = LEGAL_REVIEW_REQUIRED) und bleibt beim
   Eigentuemer.
   ========================================================================= */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

function readJSON(file) { return JSON.parse(readFileSync(file, "utf8")); }

export function loadPreviewConfig(root) {
  return readJSON(join(root, "quant", "config", "development-preview.json"));
}

/**
 * Alle Wertpapiere, die das Repository kennt, je Ticker - aus dem
 * Testuniversum (quant/config/tiingo-universe.json) und aus allen
 * Gate-Universen (quant/data/market/scale/universe-*.json). Fehlt eine
 * Datei (Fixture-Baum im Test), fehlt sie eben.
 */
export function knownSecurities(root) {
  const byTicker = new Map();
  const merke = (s, quelle) => {
    if (!s || !s.ticker) return;
    if (byTicker.has(s.ticker)) return;
    byTicker.set(s.ticker, {
      securityId: s.securityId || "ref_" + s.ticker,
      ticker: s.ticker,
      providerSymbol: s.providerSymbol || s.ticker,
      exchange: s.exchange || null,
      mic: s.mic || null,
      source: quelle
    });
  };
  const testset = join(root, "quant", "config", "tiingo-universe.json");
  if (existsSync(testset)) {
    for (const s of readJSON(testset).securities || []) merke(s, "quant/config/tiingo-universe.json");
  }
  const scaleDir = join(root, "quant", "data", "market", "scale");
  if (existsSync(scaleDir)) {
    /* Kleine Gates zuerst: dieselben Titel mit derselben securityId, aber
       die Reihenfolge macht die Herkunft nachvollziehbar. */
    const files = readdirSync(scaleDir).filter((n) => /^universe-.*\.json$/.test(n)).sort();
    for (const file of files) {
      for (const s of readJSON(join(scaleDir, file)).securities || []) {
        merke(s, "quant/data/market/scale/" + file);
      }
    }
  }
  return byTicker;
}

/**
 * Loest den Umfang der Konfiguration in Ticker und Wertpapiere auf.
 *
 * @returns {{ tickers: Set<string>, securities: Array, fullHistory: Set<string>,
 *             unresolved: string[], universeFile: string|null }}
 */
export function resolveScope(root, config) {
  config = config || loadPreviewConfig(root);
  const tickers = new Set((config.scope || []).map((t) => String(t).toUpperCase()));
  let universeFile = null;
  if (config.scopeUniverse) {
    universeFile = join(root, "quant", "data", "market", "scale", "universe-" + config.scopeUniverse + ".json");
    if (!existsSync(universeFile)) {
      throw new Error("development-preview.json nennt scopeUniverse " + config.scopeUniverse +
                      ", aber " + universeFile + " existiert nicht.");
    }
    for (const s of readJSON(universeFile).securities || []) if (s.ticker) tickers.add(s.ticker);
  }
  const bekannt = knownSecurities(root);
  const securities = [], unresolved = [];
  for (const t of [...tickers].sort()) {
    const s = bekannt.get(t);
    if (s) securities.push(s);
    else { unresolved.push(t); securities.push({ securityId: "ref_" + t, ticker: t, providerSymbol: t,
                                                  exchange: null, mic: null, source: "abgeleitet" }); }
  }
  const fh = (config.discoverSeries && Array.isArray(config.discoverSeries.fullHistory))
    ? config.discoverSeries.fullHistory : (config.scope || []);
  return { tickers, securities, fullHistory: new Set(fh.map((t) => String(t).toUpperCase())),
           unresolved, universeFile: universeFile ? universeFile.replace(root + "/", "") : null };
}

/**
 * Dieselbe Konfiguration, aber mit dem aufgeloesten Umfang in jedem
 * Grant - damit display-policy.declareFromConfig() je Titel entscheiden
 * kann, ohne das Universumsformat kennen zu muessen.
 */
export function expandPreviewConfig(config, resolved) {
  const tickers = [...resolved.tickers];
  return Object.assign({}, config, {
    scope: tickers,
    grants: (config.grants || []).map((g) => Object.assign({}, g, {
      developmentPreviewScope: Array.isArray(g.developmentPreviewScope) && g.developmentPreviewScope.length
        ? [...new Set(g.developmentPreviewScope.concat(tickers))]
        : tickers
    }))
  });
}
