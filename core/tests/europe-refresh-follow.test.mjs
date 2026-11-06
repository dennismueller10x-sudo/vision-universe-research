/* Folgekette des Europa-Refreshs (05./06.11.2026): die globale Suche (discover/data/search/GLOBAL.json) und die globale
   Startseite projizieren Katalog und Manifest der Europa-Veroeffentlichung (catalogSha256, asOf je Eintrag). Erneuert
   der Refresh das Manifest ohne die Projektion, faellt Europa bis zum naechsten Nachtlauf aus der Suche und Core ist rot.
   Vertrag: der Refresh baut die Projektion mit ihrem Erzeuger vor der Pruefung und committet sie mit. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WF = readFileSync(join(ROOT, ".github/workflows/europe-discover-refresh.yml"), "utf8");
const BUILD = readFileSync(join(ROOT, "scripts/discover/build-discover-data.mjs"), "utf8");

test("ER-1 · der Europa-Refresh baut die globale Projektion vor der Pruefung und committet sie", () => {
  const projection = WF.indexOf("node scripts/discover/global-search-index.mjs");
  const verify = WF.indexOf("core/tests/discover-universe.test.mjs");
  const add = WF.match(/git add ([^\n]+)/);
  assert.ok(projection > 0, "Projektion fehlt im Refresh");
  assert.ok(verify > projection, "Pruefung der Suche muss nach der Projektion laufen");
  assert.ok(add && /discover\/data\/europe/.test(add[1]) && /discover\/data\/search\/GLOBAL\.json/.test(add[1]) && /discover\/data\/global\/home\.json/.test(add[1]), "Commit ohne GLOBAL.json oder global/home.json");
});

test("ER-2 · derselbe Erzeuger wie im Discover-Neubau (keine zweite Ableitung)", () => {
  assert.match(BUILD, /import\('\.\/global-search-index\.mjs'\)\)\.produceGlobal\(root\)/);
  const src = readFileSync(join(ROOT, "scripts/discover/global-search-index.mjs"), "utf8");
  assert.match(src, /discover\/data\/search\/GLOBAL\.json/);
  assert.match(src, /discover\/data\/global/);
});
