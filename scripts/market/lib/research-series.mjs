/* =========================================================================
   VISION UNIVERSE — scripts/market/lib/research-series.mjs

   Loeschschutz fuer Forschungsreihen (Teil B1, Steuerung 21.11.2026).
   Die Umfangsfolge loescht Kursreihen, deren securityId nicht mehr im
   Produktumfang steht. Am 17.11. traf das Reihen, auf die eingefrorene
   Forschung verweist (V10-Population, Elliott-Registry M11-P6, Backtests),
   und die Bereinigung musste zurueckgenommen werden.

   researchSeriesIds() rechnet aus core/registry/research-series-sources.json
   bei jedem Lauf neu aus, welche securityIds die Forschung nennt.
   assertNoResearchSeries() bricht VOR dem ersten Loeschen ab, wenn eine
   zu loeschende Reihe darunter ist (ausser sie ist privat gesichert,
   securedIds, Teil B2).
   ========================================================================= */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";

export const SOURCES_FILE = "core/registry/research-series-sources.json";
const ID = /\bref_[A-Z0-9_]+\b/g;

export function loadSources(root) {
  const f = join(root, SOURCES_FILE);
  if (!existsSync(f)) throw new Error("RESEARCH_SERIES_SOURCES_MISSING:" + SOURCES_FILE);
  return JSON.parse(readFileSync(f, "utf8"));
}

/** Map securityId -> [Quellpfade]. Eine fehlende Pflichtquelle ist ein Fehler (fail closed). */
export function researchSeriesIds(root, doc = loadSources(root)) {
  const out = new Map();
  const add = (text, path) => { for (const id of new Set(text.match(ID) || [])) (out.get(id) || out.set(id, []).get(id)).push(path); };
  for (const s of doc.sources || []) {
    if (s.path) {
      const f = join(root, s.path);
      if (!existsSync(f)) throw new Error("RESEARCH_SERIES_SOURCE_MISSING:" + s.path);
      add(readFileSync(f, "utf8"), s.path);
    } else if (s.glob) {
      const dir = dirname(s.glob), pat = new RegExp("^" + basename(s.glob).replace(/[.]/g, "\\.").replace(/\*/g, ".*") + "$");
      for (const name of readdirSync(join(root, dir)).filter((n) => pat.test(n)).sort()) {
        const text = readFileSync(join(root, dir, name), "utf8");
        if (!s.mentions || text.includes(s.mentions)) add(text, dir + "/" + name);
      }
    }
  }
  return out;
}

/**
 * @param {string} root
 * @param {string[]} fileNames  zu loeschende Dateinamen (ref_X.json) oder securityIds
 * @param {string} where        Verzeichnis (fuer die Meldung)
 */
export function assertNoResearchSeries(root, fileNames, where) {
  if (!fileNames.length) return;
  const doc = loadSources(root), ids = researchSeriesIds(root, doc), secured = new Set(doc.securedIds || []);
  const hits = [];
  for (const n of fileNames) {
    const id = String(n).replace(/\.json$/, "");
    if (ids.has(id) && !secured.has(id)) hits.push(id + " (" + ids.get(id).slice(0, 2).join(", ") + (ids.get(id).length > 2 ? ", ..." : "") + ")");
  }
  if (hits.length) {
    const e = new Error("RESEARCH_SERIES_PROTECTED: " + hits.length + " Forschungsreihen in " + where + " sollen geloescht werden, Abbruch vor dem Loeschen. " +
      "Erst privat sichern (securedIds in " + SOURCES_FILE + ", Teil B2). " + hits.slice(0, 10).join("; "));
    e.code = "RESEARCH_SERIES_PROTECTED"; e.hits = hits;
    throw e;
  }
}
