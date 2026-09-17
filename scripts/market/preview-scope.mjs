/* =========================================================================
   VISION UNIVERSE — preview-scope.mjs

   WELCHE TITEL DUERFEN KURSE ZEIGEN - UND WOHER KOMMT DIE LISTE

   quant/config/development-preview.json traegt die Entscheidung des
   Eigentuemers, fuer welche Titel echte Kursreihen in die oeffentliche
   Auslieferung duerfen. Bisher stand diese Liste an drei Stellen
   (Ingest, Hygiene-Guard, Discover-Build) je einmal als "die fuenf
   Ticker". Hier steht sie EINMAL, und sie kann zwei Formen haben:

     scope:          ["AAPL", "MSFT", ...]     eine Tickerliste
     scopeUniverse:  "PRODUCT_UNIVERSE"        die kanonische Universums-
                                               quelle (universe-source.mjs)
                     oder "GATE_500"           ein Universum aus
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
import { resolveUniverse, PRODUCT_UNIVERSE } from "./universe-source.mjs";

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
  /* Der Benchmark gehoert zum Abruf-Umfang (relative Staerke braucht ihn),
     steht aber nicht in `scope`: er ist kein Titel, der bewertet wird. */
  if (config.benchmark) tickers.add(String(config.benchmark).toUpperCase());
  let universeFile = null, universe = null;
  if (config.scopeUniverse) {
    /* PRODUCT_UNIVERSE ist die kanonische Quelle (universe-source.mjs:
       Company Master, sobald er im Branch liegt, sonst das groesste
       belegte Universum). Ein Gate-Name nennt ein Universum aus
       quant/data/market/scale/. Eine fehlende Datei ist ein Fehler, kein
       leerer Umfang. */
    try {
      universe = resolveUniverse(root, config.scopeUniverse);
    } catch (err) {
      throw new Error("development-preview.json nennt scopeUniverse " + config.scopeUniverse +
                      ", aber die Quelle fehlt: " + err.message);
    }
    universeFile = join(root, universe.file);
    for (const s of universe.securities) if (s.ticker) tickers.add(s.ticker);
  }
  const bekannt = knownSecurities(root);
  if (universe) for (const s of universe.securities) if (!bekannt.has(s.ticker)) bekannt.set(s.ticker, Object.assign({ source: universe.file }, s));
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
           unresolved, universeFile: universeFile ? universeFile.replace(root + "/", "") : null,
           universeSource: universe ? { source: universe.source, file: universe.file, version: universe.version,
                                        counts: universe.counts, sha256: universe.sha256,
                                        handover: universe.handover } : null };
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
