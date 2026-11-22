/* =========================================================================
   VISION UNIVERSE — scripts/quant/lib/frozen-data.mjs

   Eingefrorener Datenstand ohne Umbau des Tests (Steuerung 22.11.2026, Muster #2122 / data-fixture.mjs).

   Ein Test, der Produktionsdaten (quant|discover|supertrader|social|technical|core)/data liest, bekommt als ERSTEN Import
     import "../../scripts/quant/lib/frozen-data.mjs";
   Liegt neben dem Test ein Buendel fixtures/frozen/<testname>.json.gz (Erzeuger: scripts/quant/freeze-frozen-data.mjs), werden
   Lesezugriffe auf <Repo>/<...>/data/** auf eine Spiegelwurzel im Temp-Verzeichnis umgelenkt, die genau die eingefrorenen
   Dateien enthaelt (eine nicht eingefrorene Datei fehlt sichtbar: ENOENT). Code, Methodik und Konfiguration kommen weiter aus
   dem Repository; Schreibzugriffe und Kindprozesse sind nicht umgelenkt. Ohne Buendel oder mit DATA_FIXTURE_LIVE=1 tut der
   Import nichts. Den Live-Stand melden die Datenqualitaets-Regeln, nicht dieser Test.
   ========================================================================= */
import fs from "node:fs";
import { createRequire } from "node:module";
import { syncBuiltinESMExports } from "node:module";
import { basename, dirname, join, resolve, sep } from "node:path";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { REPO, mountFixture, dataDirOf, readFixture } from "./data-fixture.mjs";

export const frozenBundleFor = (testFile) => join(dirname(testFile), "fixtures", "frozen", basename(testFile).replace(/\.test\.(mjs|js)$/, "").replace(/\.mjs$/, "") + ".json.gz");

const MAP_FIRST = {
  sync: ["readFileSync", "readdirSync", "statSync", "lstatSync", "existsSync", "accessSync", "openSync", "opendirSync", "realpathSync", "readlinkSync"],
  cb: ["readFile", "readdir", "stat", "lstat", "access", "open", "createReadStream"],
  promises: ["readFile", "readdir", "stat", "lstat", "access", "open", "opendir"]
};

export function installFrozenData(bundle, { repo = REPO } = {}) {
  const { root: mirror } = mountFixture(bundle, { root: repo });
  const dirs = [...new Set(Object.keys(readFixture(bundle).files).map(dataDirOf))].map((d) => join(repo, d));
  const map = (p) => {
    let s;
    if (typeof p === "string") s = p; else if (p instanceof URL && p.protocol === "file:") s = fileURLToPath(p); else return p;
    const abs = resolve(s);
    for (const d of dirs) if (abs === d || abs.startsWith(d + sep)) return join(mirror, abs.slice(repo.length + 1));
    return p;
  };
  const wrap = (obj, name) => { const orig = obj[name]; if (typeof orig !== "function") return; obj[name] = function (p, ...a) { return orig.call(this, map(p), ...a); }; };
  for (const n of MAP_FIRST.sync) wrap(fs, n);
  for (const n of MAP_FIRST.cb) wrap(fs, n);
  for (const n of MAP_FIRST.promises) wrap(fs.promises, n);
  syncBuiltinESMExports();
  process.on("exit", () => rmSync(mirror, { recursive: true, force: true }));
  return { mirror, dirs };
}

const testFile = process.argv[1] || "";
if (process.env.DATA_FIXTURE_LIVE !== "1" && /\.test\.(mjs|js)$/.test(testFile)) {
  const bundle = frozenBundleFor(resolve(testFile));
  if (fs.existsSync(bundle)) installFrozenData(bundle);
}
