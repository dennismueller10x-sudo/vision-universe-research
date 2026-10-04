/* Core-Adoption, Identitaet (ADR-001): kein Produkt- oder Erzeugercode
   bildet eine securityId selbst. Die Regel steht in core/identity.js.

   Jede Ausnahme steht unten mit Grund. Eine Ausnahme, die nicht mehr
   zutrifft, laesst den Test ebenfalls scheitern - die Liste schrumpft
   nur, sie veraltet nicht still. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const Identity = require(join(ROOT, "core", "identity.js"));
const CompanyMaster = require(join(ROOT, "quant", "engines", "company-master.js"));

/* "ref_" + x, `ref_${x}`, 'ref_'+x */
const EIGENE_ID = /["'`]ref_["'`]\s*\+|`ref_\$\{/;

const AUSNAHMEN = {
  "quant/engines/company-master.js": "legacySecurityId: dieselbe Regel, wirft nicht (Test unten haelt die Gleichheit fest)",
  "quant/engines/realtime/intraday-scope.js": "nur Kommentar, beschreibt den behobenen Fehler",
  "quant/api/market-signal-contract.js": "nur Kommentar, beschreibt den behobenen Fehler",
  "scripts/market/ingest-intraday.mjs": "Protokoll idPattern + idExceptions; Gegenstueck discover/ui/live-hub.js",
  "scripts/market/expand-us-universe.mjs": "regelgleich (/[^A-Z0-9]/gi) auf rohen Anbieterzeilen, darf nicht werfen",
  "scripts/market/select-gate-universe.mjs": "regelgleich (/[^A-Z0-9]/gi) auf rohen Anbieterzeilen, darf nicht werfen",
  "scripts/market/tiingo2-refresh.mjs": "Workstream Tiingo 2.0, regelgleich",
  "scripts/universe/verify-company-master.mjs": "prueft, dass instrumentId KEINE Ticker-ID ist",
  "scripts/supertrader/build.mjs": "Umstellung in PR #387 (Supertrader-Gate A verlangt eigenen PR)",
  "scripts/discover/assert-source-state-coverage.mjs": "Umstellung in eigenem Discover-PR",
  "scripts/vorsorge/build-etf-data.mjs": "Workstream Vorsorge (#417, 04.10.2026): Dateipfad der Discover-Reihe; core/identity.js liegt erst mit #386 auf main - danach securityIdForTicker"
};

function produktcode() {
  return execFileSync("git", ["ls-files", "*.js", "*.mjs"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter((f) =>
    f && !/(^|\/)(tests?|fixtures)\//.test(f) && !/\.test\.m?js$/.test(f) && !/^(core|docs)\//.test(f));
}

test("Kein Produkt- oder Erzeugercode bildet eine securityId selbst", () => {
  const treffer = produktcode().filter((f) => EIGENE_ID.test(readFileSync(join(ROOT, f), "utf8")));
  assert.deepEqual(treffer.filter((f) => !AUSNAHMEN[f]), [], "neue eigene ID-Bildung: core/identity.js#securityIdForTicker verwenden");
  const veraltet = Object.keys(AUSNAHMEN).filter((f) => !treffer.includes(f));
  assert.deepEqual(veraltet, [], "Ausnahme trifft nicht mehr zu - aus der Liste nehmen");
});

test("company-master.legacySecurityId ist dieselbe Regel wie core/identity.js", () => {
  const symbole = JSON.parse(readFileSync(join(ROOT, "discover", "data", "stock-index", "US_REAL.json"), "utf8")).symbols;
  assert.ok(symbole.length > 5000);
  for (const s of [...symbole, "BRK-B", "BRK.B", "MOG-A", "BF/B"]) assert.equal(CompanyMaster.legacySecurityId(s), Identity.securityIdForTicker(s), s);
});

test("Screener und Signal-Vertrag nutzen die Core-Identitaet (Share Class)", () => {
  const signal = readFileSync(join(ROOT, "quant", "api", "market-signal-contract.js"), "utf8");
  assert.match(signal, /securityId=Identity\.securityIdForTicker\(ticker\)/);
  const screener = readFileSync(join(ROOT, "screener", "engine", "adapters.js"), "utf8");
  assert.match(screener, /Identity\.securityIdForTicker\(symbol\)/);
  for (const page of ["quant/index.html", "screener/index.html"]) {
    const html = readFileSync(join(ROOT, page), "utf8");
    assert.ok(html.indexOf("/core/identity.js") > 0, page + " laedt core/identity.js");
  }
  assert.equal(Identity.securityIdForTicker("BRK-B"), "ref_BRK_B");
});
