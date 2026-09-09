/* =========================================================================
   VISION UNIVERSE QUANT — verify-golden-five-backtest-readiness.mjs (Phase 6)

   Mission-Abschnitt 9: "Pruefe nur die Datenvoraussetzungen. Noch keinen
   grossen Production-Backtest ueber Golden Five behaupten." Dieses Skript
   ruft quant/engines/backtest.js NICHT auf - es prueft nur, ob die vier
   Zutaten, die ein Backtest braucht, fuer die Golden Five tatsaechlich
   vorhanden sind UND zueinander passen:

     Historical SEC PIT   + Historical Market Data
     + Corporate Actions  + decisionTime/executionTime

   Ein "Golden Case" je Titel: ein Stichtag (decisionDate) mitten in der
   veroeffentlichten Kurshistorie, an dem SEC-Fakten UND ein Kurs bereits
   bekannt waren, und der naechste Handelstag danach (executionDate) - die
   Reihenfolge, die jeder Backtest voraussetzt: am Stichtag entscheiden,
   am naechsten Handelstag ausfuehren, nie umgekehrt.

   Kein Performance-Versprechen, keine Kennzahl, kein Score - nur die
   Komposition der Rohdaten.

   Ausfuehren:  node scripts/quant/verify-golden-five-backtest-readiness.mjs
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const SecAdapterModule = require(join(root, "providers", "sec", "adapter.js"));
const SecAdapter = SecAdapterModule.createSecProvider();

const GOLDEN_FIVE = [
  { ticker: "AAPL", securityId: "sec_AAPL" },
  { ticker: "MSFT", securityId: "sec_MSFT" },
  { ticker: "NVDA", securityId: "sec_NVDA" },
  { ticker: "JPM", securityId: "sec_JPM" },
  { ticker: "XOM", securityId: "sec_XOM" }
];

const MARKET_DIR = join(root, "quant", "data", "market", "golden-preview", "daily");
/* Dasselbe Geschwisterverzeichnis wie build-golden-five-pit-coverage.mjs -
   bewusst NICHT unter quant/data/sec/, das die parallele SEC-Scaling-
   Pipeline wortwoertlich scannt (siehe deren Kommentar dort). */
const OUT_DIR = join(root, "quant", "data", "golden-five-pit-coverage");
mkdirSync(OUT_DIR, { recursive: true });

const results = [];
const problems = [];

for (const entry of GOLDEN_FIVE) {
  const marketFile = join(MARKET_DIR, "ref_" + entry.ticker + ".json");
  const result = { ticker: entry.ticker };

  if (!existsSync(marketFile)) {
    result.ok = false;
    result.reason = "Keine veroeffentlichte Golden-Five-Kursreihe.";
    problems.push(entry.ticker + ": " + result.reason);
    results.push(result);
    continue;
  }
  const market = JSON.parse(readFileSync(marketFile, "utf8"));
  const bars = market.bars || [];
  if (bars.length < 200) {
    result.ok = false;
    result.reason = "Kursreihe zu kurz (" + bars.length + " Bars) fuer einen Golden Case.";
    problems.push(entry.ticker + ": " + result.reason);
    results.push(result);
    continue;
  }

  /* Stichtag mitten in der Historie - nicht am Rand, damit "davor" und
     "danach" beide echt geprueft werden. */
  const decisionIndex = Math.floor(bars.length / 2);
  const decisionDate = bars[decisionIndex].date;
  const executionBar = bars[decisionIndex + 1];
  if (!executionBar) {
    result.ok = false;
    result.reason = "Kein Handelstag nach dem Stichtag vorhanden.";
    problems.push(entry.ticker + ": " + result.reason);
    results.push(result);
    continue;
  }
  const executionDate = executionBar.date;

  /* 1) Historical Market Data: Schlusskurs am Ausfuehrungstag vorhanden. */
  const hasExecutionPrice = typeof executionBar.close === "number" && Number.isFinite(executionBar.close);

  /* 2) decisionTime < executionTime, nie umgekehrt. */
  const orderingOk = decisionDate < executionDate;

  /* 3) Historical SEC PIT: am Stichtag bereits bekannte Fakten, ueber
     genau dieselbe Regel wie das Produkt (kein zweiter PIT-Pfad). */
  const factsAsOf = SecAdapter.getFacts(entry.securityId, { asOf: decisionDate });
  const secOk = factsAsOf.available && factsAsOf.data.length > 0;
  /* Gegenprobe zur Regel selbst: kein zurueckgegebener Fakt darf NACH dem
     Stichtag verfuegbar geworden sein - genau die Look-Ahead-Sperre, die
     quant/engines/schema.js durchsetzt, hier am Golden Case nachgemessen. */
  const noLeak = secOk && factsAsOf.data.every((f) => f.availableAt <= decisionDate);

  /* 4) Corporate Actions: liegen in der Kursreihe selbst (splitFactor/
     dividend je Bar, wie Tiingo sie liefert) - ueber die GESAMTE
     veroeffentlichte Historie, nicht nur am Stichtag, sonst waere ein
     Titel ohne Ereignis just an diesem einen Tag faelschlich "ohne
     Kapitalmassnahmen-Unterstuetzung". */
  const hasSplitField = bars.every((b) => "splitFactor" in b);
  const hasDividendField = bars.every((b) => "dividend" in b);
  const splitEvents = bars.filter((b) => b.splitFactor !== null && b.splitFactor !== undefined && b.splitFactor !== 1).length;
  const dividendEvents = bars.filter((b) => b.dividend !== null && b.dividend !== undefined && b.dividend > 0).length;

  result.ok = hasExecutionPrice && orderingOk && secOk && noLeak && hasSplitField && hasDividendField;
  result.decisionDate = decisionDate;
  result.executionDate = executionDate;
  result.marketData = { hasExecutionPrice, orderingOk };
  result.secPit = { available: secOk, factsKnownAtDecisionDate: secOk ? factsAsOf.data.length : 0, noFutureLeak: noLeak };
  result.corporateActions = { schemaPresent: hasSplitField && hasDividendField, splitEvents, dividendEvents };
  if (!result.ok) problems.push(entry.ticker + ": Golden Case nicht vollstaendig (siehe Bericht).");
  results.push(result);

  console.log(`  ${entry.ticker.padEnd(6)} Stichtag ${decisionDate} -> Ausfuehrung ${executionDate} | ` +
              `SEC-Fakten bekannt: ${result.secPit.factsKnownAtDecisionDate} | Splits: ${splitEvents} | ` +
              `Dividenden: ${dividendEvents} | ${result.ok ? "BEREIT" : "NICHT BEREIT"}`);
}

const summary = {
  generatedAtUtc: new Date().toISOString(),
  note: "Golden-Case-Datenvoraussetzungspruefung je Titel: Historical SEC PIT + Historical Market Data + " +
        "Corporate Actions + decisionTime/executionTime. Ruft quant/engines/backtest.js NICHT auf - kein " +
        "Backtest-Lauf, keine Kennzahl, kein Performance-Versprechen. Bestaetigt nur, dass die vier " +
        "Zutaten vorhanden sind und in der richtigen Reihenfolge zueinander stehen.",
  tickers: results
};
writeFileSync(join(OUT_DIR, "backtest-readiness.json"), JSON.stringify(summary, null, 2) + "\n");
console.log("\nGeschrieben: " + join(OUT_DIR, "backtest-readiness.json").replace(root + "/", ""));

if (problems.length) {
  console.error("\nPROBLEME:");
  problems.forEach((p) => console.error("  - " + p));
  process.exit(1);
}
