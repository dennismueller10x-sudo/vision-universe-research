/* =========================================================================
   VISION UNIVERSE — verify-tiingo-runtime.mjs   (Phase 4A, §10, §33)

   Der Laufzeitnachweis. Was hier steht, ist gemessen, nicht gelesen.

   Phase 3 hat die Unterscheidung eingefuehrt, um die es geht: eine
   Faehigkeit, die in einer Dokumentation steht, ist etwas anderes als eine,
   die jemand an echten Daten gesehen hat. Dieses Skript stellt die
   Behauptungen des Tiingo-Adapters auf die Probe und schreibt auf, welche
   davon stimmen.

   Kostenbewusst: der ganze Lauf braucht hoechstens acht Anfragen von 50 pro
   Stunde. Jede einzelne ist begruendet.

   Die wichtigste Frage:

     Ist adjClose split- UND dividendenbereinigt (TOTAL_RETURN), oder nur
     splitbereinigt? Sekundaerquellen sagen das eine, belegt ist keines.
     Der Nachweis laeuft ueber zwei Titel: NVDA hat einen 4:1-Split ohne
     Dividende in der Naehe, KO zahlt regelmaessig ohne Split. Wenn adjClose
     bei NVDA den Split herausrechnet UND bei KO vor dem Ex-Tag unter close
     liegt, ist es Total Return.

   Ausfuehren (nur mit Zugang):
     TIINGO_API_KEY=... node scripts/market/verify-tiingo-runtime.mjs
     TIINGO_API_KEY=... node scripts/market/verify-tiingo-runtime.mjs --json
   ========================================================================= */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const engines = join(root, "quant", "engines");

const SymbolMapping = require(join(engines, "symbol-mapping.js"));
const Tiingo = require(join(root, "providers", "tiingo", "adapter.js"));

const AS_JSON = process.argv.includes("--json");
const apiKey = process.env.TIINGO_API_KEY || null;

const OUT = join(root, "quant", "data", "market", "tiingo-runtime-verification.json");

/* Die Pruefungen. Jede kostet genau eine Anfrage - ausser denen, die eine
   bereits geholte Reihe erneut auswerten. */
const findings = [];
function record(capability, result, evidence, requests) {
  findings.push({ capability, result, evidence, requests: requests || 0,
                  checkedAt: new Date().toISOString() });
}

if (!apiKey) {
  console.log("Kein TIINGO_API_KEY gesetzt.");
  console.log("Dieses Skript prueft ausschliesslich zur Laufzeit — ohne Zugang gibt es");
  console.log("nichts zu messen, und Messwerte zu erfinden waere der ganze Sinn dagegen.");
  console.log("\nAlle Faehigkeiten bleiben UNKNOWN.");
  process.exit(0);
}

const registry = SymbolMapping.createRegistry([
  { securityId: "ref_NVDA", providerId: "tiingo", providerSymbol: "NVDA", ticker: "NVDA",
    mic: "XNAS", currency: "USD", country: "US", confidence: "verified" },
  { securityId: "ref_KO", providerId: "tiingo", providerSymbol: "KO", ticker: "KO",
    mic: "XNYS", currency: "USD", country: "US", confidence: "verified" },
  { securityId: "ref_AAPL", providerId: "tiingo", providerSymbol: "AAPL", ticker: "AAPL",
    mic: "XNAS", currency: "USD", country: "US", confidence: "verified" },
  { securityId: "ref_BRKB", providerId: "tiingo", providerSymbol: "BRK-B", ticker: "BRK-B",
    mic: "XNYS", currency: "USD", country: "US", confidence: "verified" }
]);

/* Der Adapter wird hier bewusst OHNE bestaetigte Bereinigung betrieben.
   Sonst wuerde er adjustedClose fuellen, und die Pruefung liefe gegen ihre
   eigene Annahme. Die Rohwerte des Anbieters stehen in adjustedOpen/High/Low
   und adjustedVolume ohnehin bereit. */
const provider = Tiingo.createTiingoProvider({
  apiKey,
  capabilities: Tiingo.freePlanCapabilities(),
  symbolRegistry: registry,
  fetchImpl: (url, init) => fetch(url, init)
});

console.log("Tiingo — Laufzeitnachweis\n");
console.log(`  Kontingent vorher: ${provider.quota().hourUsed}/${provider.quota().hourLimit} Stunde\n`);

/* ------------------------------------------- 1. Grundsaetzlicher Zugang */

console.log("  [1/6] Zugang und Stammdaten …");
const meta = await provider.getMetadata("ref_AAPL");
if (!meta.available) {
  record("apiAccess", "FAILED", { reason: meta.reason, message: meta.message }, 1);
  console.log(`        FEHLGESCHLAGEN: ${meta.reason}`);
  console.log("\n  Ohne Zugang sind die uebrigen Pruefungen gegenstandslos.");
  finish(1);
} else {
  record("apiAccess", "PASSED", {
    name: meta.data.name, exchange: meta.data.exchange,
    historyFrom: meta.data.startDate, historyTo: meta.data.endDate
  }, 1);
  console.log(`        OK — ${meta.data.name}, Historie ab ${meta.data.startDate}`);
}

/* ------------------------------------------- 2. Historientiefe (§36.4) */

console.log("  [2/6] Wie weit reicht die Historie praktisch? …");
const deep = await provider.getDailyBars("ref_AAPL", { from: "1990-01-01", to: "1995-12-31" });
if (deep.available && deep.data.bars.length) {
  const b = deep.data.bars;
  record("historyDepth", "PASSED", {
    requestedFrom: "1990-01-01", actualFrom: b[0].date, bars: b.length
  }, 1);
  console.log(`        OK — ${b.length} Bars ab ${b[0].date}`);
} else {
  record("historyDepth", deep.available ? "EMPTY" : "FAILED",
         { reason: deep.reason, message: deep.message }, 1);
  console.log(`        ${deep.available ? "leer" : "FEHLGESCHLAGEN: " + deep.reason}`);
}

/* ------------------------- 3. Split-Bereinigung: NVDA 4:1 am 2021-07-20 */

console.log("  [3/6] Split-Bereinigung an NVDA (4:1, Juli 2021) …");
const nvda = await provider.getDailyBars("ref_NVDA", { from: "2021-07-12", to: "2021-07-23" });
if (nvda.available && nvda.data.bars.length > 3) {
  const bars = nvda.data.bars;
  /* Der Sprung im unbereinigten Kurs: rund Faktor 4 nach unten. */
  let rawJump = null, adjJump = null, splitDay = null;
  for (let i = 1; i < bars.length; i++) {
    const rawRatio = bars[i - 1].close / bars[i].close;
    if (rawRatio > 3 && rawRatio < 5) {
      rawJump = rawRatio; splitDay = bars[i].date;
      const a0 = bars[i - 1].adjustedOpen, a1 = bars[i].adjustedOpen;
      if (a0 && a1) adjJump = a0 / a1;
      break;
    }
  }
  const splitFlagged = bars.filter((b) => b.splitFactor && b.splitFactor !== 1);

  const splitAdjusted = rawJump !== null && adjJump !== null && Math.abs(adjJump - 1) < 0.2;
  record("splitAdjustedPrices", splitAdjusted ? "PASSED" : "FAILED", {
    splitDay, rawRatio: rawJump ? +rawJump.toFixed(3) : null,
    adjustedRatio: adjJump ? +adjJump.toFixed(3) : null,
    interpretation: splitAdjusted
      ? "Der unbereinigte Kurs springt um den Splitfaktor, der bereinigte nicht. Splitbereinigung bestaetigt."
      : "Kein eindeutiger Befund. Entweder liegt der Split ausserhalb des Fensters, oder die Reihe ist nicht splitbereinigt."
  }, 1);
  record("splits", splitFlagged.length ? "PASSED" : "FAILED", {
    flaggedDays: splitFlagged.map((b) => ({ date: b.date, factor: b.splitFactor })),
    interpretation: splitFlagged.length
      ? "splitFactor kennzeichnet den Splittag in der Kursreihe."
      : "Kein splitFactor ungleich 1 im Fenster gefunden."
  }, 0);
  console.log(`        Rohsprung ${rawJump ? rawJump.toFixed(2) : "—"}x, ` +
              `bereinigt ${adjJump ? adjJump.toFixed(3) : "—"}x, ` +
              `splitFactor gesetzt: ${splitFlagged.length ? "ja" : "nein"}`);
} else {
  record("splitAdjustedPrices", "FAILED", { reason: nvda.reason }, 1);
  record("splits", "UNKNOWN", { reason: "Reihe nicht abrufbar" }, 0);
  console.log(`        FEHLGESCHLAGEN: ${nvda.reason}`);
}

/* ------------------- 4. Dividendenbereinigung: KO, regelmaessige Zahlung */

console.log("  [4/6] Dividendenbereinigung an KO …");
const ko = await provider.getDailyBars("ref_KO", { from: "2024-01-01", to: "2024-12-31" });
if (ko.available && ko.data.bars.length) {
  const bars = ko.data.bars;
  const divDays = bars.filter((b) => b.dividend && b.dividend > 0);

  /* Der Nachweis: liegt der bereinigte Kurs VOR einem Ex-Tag unter dem
     unbereinigten? Genau das tut eine Dividendenbereinigung - sie rechnet
     die kuenftige Ausschuettung aus den frueheren Kursen heraus. */
  let evidence = null, totalReturn = false;
  if (divDays.length) {
    const exDay = divDays[0];
    const idx = bars.indexOf(exDay);
    const vorher = bars[Math.max(0, idx - 5)];
    if (vorher.adjustedOpen && vorher.open) {
      const ratio = vorher.adjustedOpen / vorher.open;
      totalReturn = ratio < 0.999;
      evidence = {
        exDate: exDay.date, dividend: exDay.dividend,
        priorDay: vorher.date, rawOpen: vorher.open, adjustedOpen: vorher.adjustedOpen,
        ratio: +ratio.toFixed(5),
        interpretation: totalReturn
          ? "Der bereinigte Kurs vor dem Ex-Tag liegt unter dem unbereinigten. Die Dividende ist eingerechnet — das ist TOTAL_RETURN."
          : "Bereinigter und unbereinigter Kurs stimmen ueberein. Die Dividende ist NICHT eingerechnet — das waere nur SPLIT_ADJUSTED."
      };
    }
  }
  record("adjustedPrices", divDays.length === 0 ? "UNKNOWN" : (totalReturn ? "PASSED" : "FAILED"),
         evidence || { reason: "Keine Dividende im Fenster gefunden" }, 1);
  record("dividends", divDays.length ? "PASSED" : "FAILED", {
    count: divDays.length,
    sample: divDays.slice(0, 4).map((b) => ({ date: b.date, amount: b.dividend }))
  }, 0);
  console.log(`        ${divDays.length} Ausschuettung(en); Total Return: ` +
              `${divDays.length ? (totalReturn ? "ja" : "NEIN") : "unbestimmt"}`);
} else {
  record("adjustedPrices", "FAILED", { reason: ko.reason }, 1);
  record("dividends", "UNKNOWN", { reason: "Reihe nicht abrufbar" }, 0);
  console.log(`        FEHLGESCHLAGEN: ${ko.reason}`);
}

/* --------------------------------------- 5. Sonderzeichen im Ticker */

console.log("  [5/6] Ticker mit Sonderzeichen (BRK-B) …");
const brk = await provider.getDailyBars("ref_BRKB", { from: "2026-08-01" });
record("symbolEncoding", brk.available ? "PASSED" : "FAILED", {
  symbol: "BRK-B", bars: brk.available ? brk.data.bars.length : 0,
  reason: brk.available ? null : brk.reason
}, 1);
console.log(`        ${brk.available ? "OK — " + brk.data.bars.length + " Bars" : "FEHLGESCHLAGEN: " + brk.reason}`);

/* ------------------------------------------------ 6. Intraday / IEX */

console.log("  [6/6] Intraday ueber IEX …");
const intra = await provider.getIntradayBars("ref_AAPL", { interval: "5min" });
record("intraday", intra.available ? "PASSED" : "FAILED", {
  bars: intra.available ? intra.data.bars.length : 0,
  reason: intra.available ? null : intra.reason,
  message: intra.available ? null : String(intra.message || "").slice(0, 200),
  note: "Technische Verfuegbarkeit. Ob die Daten oeffentlich angezeigt werden duerfen, " +
        "ist eine Lizenzfrage und wird von MarketDataDisplayPolicy getrennt behandelt."
}, 1);
console.log(`        ${intra.available ? "OK — " + intra.data.bars.length + " Bars" : "nicht verfuegbar: " + intra.reason}`);

finish(0);

/* ------------------------------------------------------------ Ausgabe */

function finish(code) {
  const quota = provider.quota();
  const stats = provider.stats();

  const report = {
    generatedAt: new Date().toISOString(),
    provider: "tiingo",
    plan: "free",
    verificationLevel: "RUNTIME_VERIFIED",
    note: "Jeder Befund in dieser Datei stammt aus einer echten Anfrage. Was hier nicht " +
          "steht, wurde nicht gemessen.",
    findings,
    quotaUsed: {
      requests: stats.requests,
      hour: quota.hourUsed + "/" + quota.hourLimit,
      day: quota.dayUsed + "/" + quota.dayLimit,
      bytes: quota.bytesUsed
    },
    /* Die Ableitung: welche Faehigkeiten duerfen jetzt auf true? */
    confirmedCapabilities: findings
      .filter((f) => f.result === "PASSED")
      .map((f) => f.capability),
    refutedCapabilities: findings
      .filter((f) => f.result === "FAILED")
      .map((f) => f.capability)
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));

  if (AS_JSON) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("\n  ─────────────────────────────────────────────");
    console.log("  Ergebnis\n");
    for (const f of findings) {
      const mark = { PASSED: "+", FAILED: "-", UNKNOWN: "?", EMPTY: "?" }[f.result] || "?";
      console.log(`    ${mark} ${f.capability.padEnd(22)} ${f.result}`);
      if (f.evidence && f.evidence.interpretation) {
        console.log(`        ${f.evidence.interpretation}`);
      }
    }
    console.log(`\n  Verbrauch: ${stats.requests} Anfragen ` +
                `(${quota.hourUsed}/${quota.hourLimit} Stunde, ` +
                `${(quota.bytesUsed / 1048576).toFixed(2)} MB)`);
    console.log(`  Bericht:   quant/data/market/tiingo-runtime-verification.json`);
  }
  process.exit(code);
}
