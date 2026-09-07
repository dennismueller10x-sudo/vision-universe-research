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

/* Gruende, die nichts ueber den Anbieter aussagen.
   
   Ein erschoepftes Kontingent ist keine fehlende Faehigkeit. Ein Abbruch
   der Verbindung auch nicht. Wer das als FAILED verbucht, traegt eine
   Widerlegung in die Faehigkeitsmatrix ein, die nur besagt, dass gerade
   niemand nachsehen konnte - und die naechste Anzeige behauptet dann,
   Tiingo koenne etwas nicht, was es sehr wohl kann.
   
   Der Fall ist nicht hypothetisch: nach fuenf Laeufen in einer Stunde
   hat Tiingo genau das gemeldet, und der Nachweis schrieb prompt
   apiAccess FAILED. */
const NICHT_AUSSAGEKRAEFTIG = ["quotaExceeded", "rateLimited", "networkError",
                               "timeout", "notConfigured"];

function unbrauchbar(reason) {
  return NICHT_AUSSAGEKRAEFTIG.indexOf(reason) !== -1;
}

/** FAILED nur, wenn der Anbieter wirklich geantwortet hat. */
function befund(res) {
  return unbrauchbar(res && res.reason) ? "INCONCLUSIVE" : "FAILED";
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
  const art = befund(meta);
  record("apiAccess", art, { reason: meta.reason, message: meta.message }, 1);
  console.log(`        ${art === "INCONCLUSIVE" ? "NICHT MESSBAR" : "FEHLGESCHLAGEN"}: ${meta.reason}`);
  console.log("\n  Ohne Zugang sind die uebrigen Pruefungen gegenstandslos.");
  /* Ein Kontingentproblem ist kein Fehlschlag des Nachweises, sondern
     seine Vertagung. Der Lauf endet dann ohne Fehler - und ohne Bericht,
     damit ein vorhandener, aussagekraeftiger nicht ueberschrieben wird. */
  finish(art === "INCONCLUSIVE" ? 0 : 1, art === "INCONCLUSIVE");
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
  record("historyDepth", deep.available ? "EMPTY" : befund(deep),
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
    splitDay,
    /* Aussagen statt Werte. Der Befund haengt an den Vergleichen, nicht an
       den Zahlen - und die Zahlen sind Kursdaten des Anbieters, die in
       einem oeffentlichen Repository nichts zu suchen haben. */
    rawSeriesJumpsAtSplitDay: rawJump !== null,
    rawJumpMatchesKnownSplitRatio: rawJump !== null && rawJump > 3 && rawJump < 5,
    adjustedSeriesContinuousAtSplitDay: adjJump !== null && Math.abs(adjJump - 1) < 0.2,
    interpretation: splitAdjusted
      ? "Der unbereinigte Kurs springt um den Splitfaktor, der bereinigte nicht. Splitbereinigung bestaetigt."
      : "Kein eindeutiger Befund. Entweder liegt der Split ausserhalb des Fensters, oder die Reihe ist nicht splitbereinigt."
  }, 1);
  record("splits", splitFlagged.length ? "PASSED" : "FAILED", {
    /* Nur die Anzahl und die Ereignistage. Der Splitfaktor selbst ist eine
       Unternehmensmeldung, aber er steht hier als Anbieterfeld - also raus. */
    flaggedDayCount: splitFlagged.length,
    flaggedDates: splitFlagged.map((b) => b.date),
    allFlagsDifferFromOne: splitFlagged.every((b) => b.splitFactor !== 1),
    interpretation: splitFlagged.length
      ? "splitFactor kennzeichnet den Splittag in der Kursreihe."
      : "Kein splitFactor ungleich 1 im Fenster gefunden."
  }, 0);
  console.log(`        Rohreihe springt: ${rawJump !== null ? "ja" : "nein"}, ` +
              `bereinigte Reihe stetig: ${adjJump !== null && Math.abs(adjJump - 1) < 0.2 ? "ja" : "nein"}, ` +
              `splitFactor gesetzt: ${splitFlagged.length ? "ja" : "nein"}`);
} else {
  record("splitAdjustedPrices", befund(nvda), { reason: nvda.reason }, 1);
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

      /* Die zweite Aussage ist die eigentliche - und sie braucht den
         SCHRITT ueber den Ex-Tag, nicht den Abstand davor.
         
         Der kumulierte Bereinigungsfaktor traegt alle Ausschuettungen von
         diesem Tag bis zum Ende der Reihe. Bei einem Dividendenwert ueber
         zweieinhalb Jahre sind das rund 7 %, waehrend die eine
         Ausschuettung nur 0,8 % ausmacht. Ein Vergleich des Abstands mit
         der Einzelrendite wuerde also einen voellig richtigen Befund als
         falsch ausweisen - er misst schlicht etwas anderes.
         
         Der Schritt ueber den Ex-Tag misst genau diese eine
         Ausschuettung. */
      const vorEx = bars[idx - 1];
      let schrittPasst = null;
      if (idx > 0 && vorEx && vorEx.adjustedOpen && vorEx.open &&
          exDay.adjustedOpen && exDay.open && exDay.dividend > 0) {
        const fVor = vorEx.adjustedOpen / vorEx.open;
        const fEx = exDay.adjustedOpen / exDay.open;
        const beobachtet = fEx / fVor - 1;
        const erwartet = exDay.dividend / vorEx.close / (1 - exDay.dividend / vorEx.close);
        schrittPasst = Math.abs(beobachtet - erwartet) < Math.max(0.0005, erwartet * 0.35);
      }

      evidence = {
        exDate: exDay.date, priorDay: vorher.date,
        adjustedBelowRawBeforeExDate: totalReturn,
        /* null heisst: der Schritt liess sich an diesen Bars nicht messen -
           nicht, dass er falsch waere. */
        factorStepAtExDateMatchesDividend: schrittPasst,
        toleranceNote: "Abweichung des Faktorschritts unter 5 Basispunkten oder 35 % der Ausschuettungsrendite.",
        interpretation: totalReturn
          ? "Der bereinigte Kurs vor dem Ex-Tag liegt unter dem unbereinigten. Die Dividende ist eingerechnet — das ist TOTAL_RETURN."
          : "Bereinigter und unbereinigter Kurs stimmen ueberein. Die Dividende ist NICHT eingerechnet — das waere nur SPLIT_ADJUSTED."
      };
    }
  }
  record("adjustedPrices", divDays.length === 0 ? "UNKNOWN" : (totalReturn ? "PASSED" : "FAILED"),
         evidence || { reason: "Keine Dividende im Fenster gefunden" }, 1);
  record("dividends", divDays.length ? "PASSED" : "FAILED", {
    /* Anzahl und Ex-Tage ja, Betraege nein: aus einer Liste von
       Ausschuettungsbetraegen laesst sich der Datenbestand des Anbieters
       nachbilden, aus dem Ereigniskalender nicht. */
    count: divDays.length,
    exDates: divDays.slice(0, 4).map((b) => b.date),
    allAmountsPositive: divDays.every((b) => b.dividend > 0)
  }, 0);
  console.log(`        ${divDays.length} Ausschuettung(en); Total Return: ` +
              `${divDays.length ? (totalReturn ? "ja" : "NEIN") : "unbestimmt"}`);
} else {
  record("adjustedPrices", befund(ko), { reason: ko.reason }, 1);
  record("dividends", "UNKNOWN", { reason: "Reihe nicht abrufbar" }, 0);
  console.log(`        FEHLGESCHLAGEN: ${ko.reason}`);
}

/* --------------------------------------- 5. Sonderzeichen im Ticker */

console.log("  [5/6] Ticker mit Sonderzeichen (BRK-B) …");
const brk = await provider.getDailyBars("ref_BRKB", { from: "2026-08-01" });
record("symbolEncoding", brk.available ? "PASSED" : befund(brk), {
  symbol: "BRK-B", bars: brk.available ? brk.data.bars.length : 0,
  reason: brk.available ? null : brk.reason
}, 1);
console.log(`        ${brk.available ? "OK — " + brk.data.bars.length + " Bars" : "FEHLGESCHLAGEN: " + brk.reason}`);

/* ------------------------------------------------ 6. Intraday / IEX */

console.log("  [6/6] Intraday ueber IEX …");
const intra = await provider.getIntradayBars("ref_AAPL", { interval: "5min" });
record("intraday", intra.available ? "PASSED" : befund(intra), {
  bars: intra.available ? intra.data.bars.length : 0,
  reason: intra.available ? null : intra.reason,
  message: intra.available ? null : String(intra.message || "").slice(0, 200),
  note: "Technische Verfuegbarkeit. Ob die Daten oeffentlich angezeigt werden duerfen, " +
        "ist eine Lizenzfrage und wird von MarketDataDisplayPolicy getrennt behandelt."
}, 1);
console.log(`        ${intra.available ? "OK — " + intra.data.bars.length + " Bars" : "nicht verfuegbar: " + intra.reason}`);

finish(0);

/* ------------------------------------------------------------ Ausgabe */

function finish(code, ohneBericht) {
  const quota = provider.quota();
  const stats = provider.stats();

  const report = {
    generatedAt: new Date().toISOString(),
    provider: "tiingo",
    plan: "free",
    verificationLevel: "RUNTIME_VERIFIED",
    note: "Jeder Befund in dieser Datei stammt aus einer echten Anfrage. Was hier nicht " +
          "steht, wurde nicht gemessen.",
    /* Woher der Befund stammt. Eine Messung ohne nachpruefbare Herkunft ist
       nur eine Behauptung mit Zeitstempel: mit diesen Angaben laesst sich
       der erzeugende Lauf im Actions-Protokoll wiederfinden. Lokal
       ausgefuehrt bleiben die Felder leer - dann ist die Datei ein
       Arbeitsstand und kein Nachweis. */
    run: {
      source: process.env.GITHUB_ACTIONS === "true" ? "github-actions" : "local",
      repository: process.env.GITHUB_REPOSITORY || null,
      runId: process.env.GITHUB_RUN_ID || null,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
      commit: process.env.GITHUB_SHA || null,
      ref: process.env.GITHUB_REF_NAME || null
    },
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
      .map((f) => f.capability),
    /* Nicht widerlegt, nur nicht gemessen. Der Unterschied ist der Kern
       der dreiwertigen Faehigkeitsmatrix und muss bis in den Bericht
       durchgehalten werden. */
    inconclusiveCapabilities: findings
      .filter((f) => f.result === "INCONCLUSIVE")
      .map((f) => f.capability)
  };

  if (ohneBericht) {
    console.log("\n  Kein Bericht geschrieben: dieser Lauf konnte nichts messen.");
    console.log("  Ein vorhandener Nachweis bleibt damit unberuehrt - ihn durch einen");
    console.log("  leeren zu ersetzen hiesse, gemessene Befunde wegen einer");
    console.log("  Kontingentgrenze zu verlieren.");
  } else {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify(report, null, 2));
  }

  if (AS_JSON) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("\n  ─────────────────────────────────────────────");
    console.log("  Ergebnis\n");
    for (const f of findings) {
      const mark = { PASSED: "+", FAILED: "-", UNKNOWN: "?", EMPTY: "?",
                     INCONCLUSIVE: "~" }[f.result] || "?";
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
