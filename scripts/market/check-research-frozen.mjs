#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — scripts/market/check-research-frozen.mjs

   Vorpruefung vor dem Commit einer neuen Eignung (Steuerung 22.11.2026):
   Jeder Titel, der das Produktuniversum verlaesst, verliert in der
   Umfangsfolge seine Kursreihen (discover-series/, discover-series-long/;
   vorher privat nach R2 gesichert, B2a). Ist eine davon eine Forschungsreihe
   (core/registry/research-series-sources.json), brauchen die Forschungs-Tests
   ihre eingefrorene Kopie unter quant/tests/fixtures/research-series/
   (scripts/quant/lib/data-fixture.mjs#researchSeriesRoot). Fehlt sie, waere
   main nach dem Lauf rot (22.11.2026: sieben Schuldtitel). Diese Pruefung
   bricht dann VOR dem Commit ab - zuerst einfrieren:
     node scripts/quant/freeze-research-series-fixture.mjs --cleanup <Freigabeliste>

   node scripts/market/check-research-frozen.mjs --prev-universe <F> --next-universe <F> [--root DIR]
   Exit 0: alles eingefroren (oder kein Abgang mit Forschungsreihe); Exit 3: fehlt.
   ========================================================================= */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { researchSeriesIds } from "./lib/research-series.mjs";
import { GUARDED_DIRS } from "./backup-series.mjs";
import { RESEARCH_SERIES_FIXTURE } from "../quant/lib/data-fixture.mjs";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Abgaenge (securityId) mit Forschungsreihe im Repo, deren Kopie im Fixture fehlt. */
export function notFrozen(root, prevUniverse, nextUniverse, ids = researchSeriesIds(root)) {
  const next = new Set((nextUniverse.securities || []).map((s) => s.securityId));
  const missing = [];
  for (const s of prevUniverse.securities || []) {
    if (next.has(s.securityId) || !ids.has(s.securityId)) continue;
    for (const d of GUARDED_DIRS) {
      const rel = d + "/" + s.securityId + ".json";
      if (existsSync(join(root, rel)) && !existsSync(join(root, RESEARCH_SERIES_FIXTURE, rel))) missing.push({ securityId: s.securityId, ticker: s.ticker, path: rel });
    }
  }
  return missing;
}

function main(argv) {
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const root = arg("--root") || DEFAULT_ROOT;
  if (!arg("--prev-universe") || !arg("--next-universe")) throw new Error("Aufruf: --prev-universe <F> --next-universe <F>");
  const j = (p) => JSON.parse(readFileSync(p, "utf8"));
  const missing = notFrozen(root, j(arg("--prev-universe")), j(arg("--next-universe")));
  if (!missing.length) { console.log("Forschungsreihen der Abgaenge: alle eingefroren (oder keine)"); return 0; }
  console.log(`::error::RESEARCH_SERIES_NOT_FROZEN: ${missing.length} Reihen von Abgaengen fehlen im Forschungs-Fixture - zuerst einfrieren (scripts/quant/freeze-research-series-fixture.mjs --cleanup <Freigabeliste>), dann erneut starten:`);
  for (const m of missing.slice(0, 40)) console.log("  " + m.ticker + "  " + m.path);
  return 3;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exitCode = 2; }
}
