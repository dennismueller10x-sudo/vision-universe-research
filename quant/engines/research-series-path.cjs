/* =========================================================================
   VISION UNIVERSE — quant/engines/research-series-path.cjs

   Forschung liest private Kopien (Teil B2b, Steuerung 21.11.2026).
   Die Umfangsfolge darf Reihen ausserhalb des Produktumfangs loeschen,
   nachdem sie sie byte-gleich privat gesichert hat (B2a, R2
   research-series-long/). Forschungs-Loader lesen weiter den Repo-Pfad;
   fehlt die Datei dort, lesen sie dieselben Bytes aus dem
   wiederhergestellten Verzeichnis VU_RESEARCH_SERIES_DIR
   (scripts/market/restore-research-series.mjs). sourcePath und
   sourceBytesHash bleiben dadurch gleich.
   ========================================================================= */
"use strict";
const fs = require("fs");
const path = require("path");

/** Absoluter Pfad fuer eine Repo-relative Reihe: Repo, sonst private Kopie, sonst der Repo-Pfad (ENOENT wie bisher). */
function resolveSeriesFile(root, rel, env) {
  const repo = path.join(root, rel);
  if (fs.existsSync(repo)) return repo;
  const dir = (env || process.env).VU_RESEARCH_SERIES_DIR;
  if (dir) { const priv = path.join(dir, rel); if (fs.existsSync(priv)) return priv; }
  return repo;
}

function readSeries(root, rel, env) { return fs.readFileSync(resolveSeriesFile(root, rel, env), "utf8"); }

module.exports = { resolveSeriesFile, readSeries };
