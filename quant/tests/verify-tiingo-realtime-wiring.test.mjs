/* =========================================================================
   REGRESSION — verify-tiingo-realtime.mjs muss einen echten HTTP-Client
   verdrahten

   Fehlerbild, das dieser Test verhindert: scripts/market/
   verify-tiingo-realtime.mjs rief Tiingo.createTiingoProvider() ohne
   fetchImpl auf. Der MarketClient meldet ohne fetchImpl JEDE Anfrage als
   "notConfigured" (quant/engines/market-client.js, Zeile ~221) -
   unabhaengig vom TIINGO_API_KEY. latestQuote/historicalIntraday/
   extendedHoursBars wurden dadurch nie wirklich angefragt; der Bericht
   behauptete "nicht konfiguriert", wo in Wahrheit nur der HTTP-Client
   fehlte. Genau die Verwechslung, die dieser Nachweis eigentlich
   ausschliessen soll ("Behaupte nicht UNAVAILABLE, ohne es echt getestet
   zu haben").

   Kein Netzwerkzugriff: reine Quelltextpruefung, dieselbe Verdrahtung wie
   in den bereits funktionierenden Geschwisterskripten.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(ROOT, "scripts", "market", "verify-tiingo-realtime.mjs");

function createTiingoProviderCallArgs(src) {
  const m = src.match(/createTiingoProvider\(\{([\s\S]*?)\}\)/);
  assert.ok(m, "createTiingoProvider(...) Aufruf nicht gefunden");
  return m[1];
}

test("verify-tiingo-realtime.mjs verdrahtet fetchImpl in createTiingoProvider", () => {
  const src = readFileSync(SCRIPT, "utf8");
  const args = createTiingoProviderCallArgs(src);
  assert.match(args, /fetchImpl\s*:\s*\(url,\s*init\)\s*=>\s*fetch\(url,\s*init\)/,
    "Ohne fetchImpl bleibt der MarketClient unkonfiguriert und jede Anfrage " +
    "meldet faelschlich notConfigured, unabhaengig vom API-Schluessel.");
});

test("verify-tiingo-realtime.mjs verdrahtet fetchImpl wie seine Geschwisterskripte", () => {
  const siblings = [
    "scripts/market/ingest-tiingo.mjs",
    "scripts/market/fetch-market-data.mjs",
    "scripts/market/evaluate-provider.mjs",
    "scripts/market/verify-tiingo-runtime.mjs"
  ];
  const pattern = /fetchImpl:\s*\(url,\s*init\)\s*=>\s*fetch\(url,\s*init\)/;
  for (const rel of siblings) {
    const siblingSrc = readFileSync(join(ROOT, rel), "utf8");
    assert.match(siblingSrc, pattern, rel + ": erwartete fetchImpl-Verdrahtung fehlt (Referenz fuer diesen Test).");
  }
  const src = readFileSync(SCRIPT, "utf8");
  assert.match(src, pattern, "verify-tiingo-realtime.mjs: fetchImpl-Verdrahtung fehlt oder weicht ab.");
});
