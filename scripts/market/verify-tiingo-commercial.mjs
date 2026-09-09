/* =========================================================================
   VISION UNIVERSE — verify-tiingo-commercial.mjs   (Tiingo Commercial, §4)

   Was hat der Commercial-Zugang tatsaechlich veraendert?

   Der Account wurde hochgestuft und der Schluessel rotiert. Beides sind
   Verwaltungsvorgaenge; keiner von beiden ist ein Befund. Dieses Skript
   stellt die Frage neu, an denselben fuenf Titeln, und beantwortet sie
   ausschliesslich aus echten Antworten des Anbieters:

     Authentication          kommt der Schluessel durch?
     EOD                     Tageskurse, volle Historie
     Adjusted EOD            traegt die Antwort adjClose/adjOpen/...?
     Intraday                IEX-Bars
     Latest Price            /iex Kursabfrage
     Reference Price         Tiingos tngoLast neben dem IEX-last
     Extended Hours          Bars ausserhalb 09:30-16:00 ET
     Corporate Actions       splitFactor und divCash in der Reihe

   WAS DIESES SKRIPT NICHT TUT

   Es meldet nichts als VERIFIED, was es nicht gesehen hat. Ein Feld, das
   in der Antwort fehlt, ist ABSENT. Ein Abruf, der am Kontingent oder am
   Netz scheitert, ist ERROR - und ausdruecklich kein FAILED: eine
   Faehigkeit zu widerlegen, weil gerade niemand nachsehen konnte, waere
   derselbe Fehler wie sie zu behaupten.

   Der WebSocket steht NICHT hier. Er braucht eine offene Boerse, eine
   laengere Messung und eine eigene Bewertung - scripts/market/
   verify-live-candle.mjs.

   Ausfuehren:
     TIINGO_API_KEY=... node scripts/market/verify-tiingo-commercial.mjs
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const engines = join(root, "quant", "engines");

const Tiingo = require(join(root, "providers", "tiingo", "adapter.js"));
const MarketHours = require(join(engines, "realtime", "market-hours.js"));
const MarketQuality = require(join(engines, "market-quality.js"));

const SCALE = JSON.parse(readFileSync(join(root, "quant", "config", "tiingo-scale.json"), "utf8"));
const calendar = JSON.parse(
  readFileSync(join(root, "quant", "config", "market-calendar.json"), "utf8"));

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const OUT_DIR = arg("--out", join(root, "quant", "data", "market", "commercial"));
const SYMBOLS = (arg("--symbols", SCALE.canary.symbols.join(","))).split(",").map((s) => s.trim());
const apiKey = process.env.TIINGO_API_KEY || null;

/* Gruende, die ueber den Zugang nichts aussagen. Uebernommen aus
   verify-tiingo-realtime.mjs, damit beide Nachweise dieselbe Grenze
   ziehen. */
const NICHT_AUSSAGEKRAEFTIG = ["quotaExceeded", "rateLimited", "networkError",
                               "timeout", "notConfigured", "symbolUnmapped"];
function verdictFor(res) {
  const reason = res && res.reason;
  return NICHT_AUSSAGEKRAEFTIG.indexOf(reason) !== -1 ? "ERROR" : "FAILED";
}

const findings = [];
let requests = 0;
function record(symbol, capability, result, evidence) {
  findings.push({ symbol, capability, result, evidence: evidence || null,
                  checkedAt: new Date().toISOString() });
}

function summarize() {
  const byCapability = {};
  for (const f of findings) {
    const c = (byCapability[f.capability] = byCapability[f.capability] ||
      { PASSED: 0, FAILED: 0, ABSENT: 0, ERROR: 0, UNKNOWN: 0, INFO: 0 });
    c[f.result] = (c[f.result] || 0) + 1;
  }
  /* Eine Faehigkeit gilt fuer den Zugang als belegt, wenn sie an
     mindestens einem Titel gemessen wurde und an keinem widerlegt.
     Ein Titel genuegt fuer den Beleg, weil die Faehigkeit am Konto
     haengt und nicht am Papier; ein Gegenbefund genuegt fuer den
     Zweifel, weil er zeigt, dass sie nicht durchgaengig traegt. */
  const accountLevel = {};
  Object.keys(byCapability).forEach((cap) => {
    const c = byCapability[cap];
    if (c.INFO && !c.PASSED && !c.FAILED && !c.ABSENT) { accountLevel[cap] = "INFO"; return; }
    if (c.FAILED > 0) accountLevel[cap] = "REFUTED";
    else if (c.ABSENT > 0 && c.PASSED === 0) accountLevel[cap] = "ABSENT";
    else if (c.PASSED > 0) accountLevel[cap] = "VERIFIED";
    else accountLevel[cap] = "UNKNOWN";
  });
  return { byCapability, accountLevel };
}

async function main() {
  const session = MarketHours.sessionAt(Date.now(), { calendar, exchange: "XNYS" });
  console.log("Vision Universe — Tiingo-Commercial-Faehigkeitsnachweis\n");
  console.log(`  Titel:   ${SYMBOLS.join(", ")}`);
  console.log(`  Sitzung: ${session.phase}${session.closedReason ? " (" + session.closedReason + ")" : ""}` +
              `  ${session.localDate} ${session.localTime} ET\n`);

  if (!apiKey) {
    console.log("  Kein TIINGO_API_KEY gesetzt. Es wird nichts abgerufen und nichts behauptet.");
    return finish(session, "NOT_VERIFIED");
  }

  const provider = Tiingo.createTiingoProvider({
    apiKey,
    baseUrl: process.env.TIINGO_BASE_URL || undefined,
    /* Ausdruecklich ohne Vorbefund: dieser Lauf soll messen, nicht einen
       frueheren Befund bestaetigen. Und ausdruecklich die
       Commercial-Faehigkeiten, weil genau die zur Debatte stehen. */
    capabilities: Tiingo.commercialPlanCapabilities({ evidence: null }),
    fetchImpl: (url, init) => fetch(url, init)
  });

  for (const symbol of SYMBOLS) {
    console.log(`  ${symbol}`);

    /* ---------------------------------------- 1. EOD / Authentication */
    const t0 = Date.now();
    const eod = await provider.getDailyBars(symbol, { from: SCALE.history.initialFrom });
    requests++;
    if (!eod.available) {
      /* Ein Authentifizierungsfehler ist der einzige Befund, der beide
         Fragen zugleich beantwortet - und er beantwortet sie negativ. */
      const authFailed = eod.reason === "authError" || eod.status === 401 || eod.status === 403;
      record(symbol, "authentication", authFailed ? "FAILED" : "ERROR",
             { reason: eod.reason, status: eod.status || null,
               message: String(eod.message || "").slice(0, 200) });
      record(symbol, "eod", verdictFor(eod), { reason: eod.reason });
      ["adjustedEod", "corporateActions", "historyDepth"].forEach((c) =>
        record(symbol, c, "UNKNOWN", { reason: "EOD-Abruf nicht verfuegbar." }));
      console.log(`    EOD          FEHLER (${eod.reason})`);
      continue;
    }

    record(symbol, "authentication", "PASSED",
           { interpretation: "Der Schluessel wird vom Anbieter angenommen.",
             latencyMs: Date.now() - t0 });

    const bars = eod.data.bars || [];
    record(symbol, "eod", bars.length ? "PASSED" : "FAILED", {
      bars: bars.length,
      first: bars.length ? bars[0].date : null,
      last: bars.length ? bars[bars.length - 1].date : null,
      latencyMs: Date.now() - t0
    });

    /* Historientiefe. §10 verlangt MAX - hier steht, was MAX bei diesem
       Konto tatsaechlich heisst. */
    const years = bars.length
      ? Math.round((Date.parse(bars[bars.length - 1].date) - Date.parse(bars[0].date)) / 31557600000 * 10) / 10
      : 0;
    record(symbol, "historyDepth", bars.length ? "PASSED" : "FAILED", {
      bars: bars.length, years,
      requestedFrom: SCALE.history.initialFrom,
      interpretation: bars.length
        ? `Der Anbieter liefert ${years} Jahre ab ${bars[0].date}. Angefragt war ab ` +
          `${SCALE.history.initialFrom}; frueher beginnt seine Historie fuer diesen Titel nicht.`
        : "Keine Bars."
    });

    /* --------------------------------------------- 2. Adjusted EOD */
    const withAdj = bars.filter((b) => b.adjustedOpen !== null && b.adjustedHigh !== null &&
                                       b.adjustedLow !== null).length;
    /* adjustedClose traegt der Adapter nur bei belegter Stufe. Der
       Rohbefund - kam die Spalte ueberhaupt mit? - steht in
       adjustedOpen/High/Low, die er unabhaengig davon durchreicht. */
    const adjustedPresent = withAdj > 0;
    let adjustmentCheck = null;
    if (adjustedPresent && bars.length > 1) {
      adjustmentCheck = MarketQuality.validateAdjustmentConsistency(bars, {
        claimedStatus: eod.data.adjustmentStatus
      });
    }
    record(symbol, "adjustedEod", adjustedPresent ? "PASSED" : "ABSENT", {
      barsWithAdjustedColumns: withAdj,
      of: bars.length,
      declaredStatus: eod.data.adjustmentStatus,
      inferredStatus: adjustmentCheck ? adjustmentCheck.inferredStatus : null,
      inferredFrom: adjustmentCheck ? adjustmentCheck.observed.inferredFrom : null,
      splitEvents: adjustmentCheck ? adjustmentCheck.observed.splitEvents.length : null,
      dividendEvents: adjustmentCheck ? adjustmentCheck.observed.dividendEvents.length : null,
      interpretation: adjustedPresent
        ? "Die Antwort traegt die bereinigten Spalten. Welche Stufe sie belegen, sagt " +
          "inferredStatus - nicht die Anbieterdokumentation."
        : "Keine bereinigten Spalten in der Antwort."
    });

    /* -------------------------------------- 3. Corporate Actions */
    const splits = bars.filter((b) => b.splitFactor !== null && b.splitFactor !== 1).length;
    const dividends = bars.filter((b) => b.dividend !== null && b.dividend > 0).length;
    record(symbol, "corporateActions", (splits + dividends) > 0 ? "PASSED" : "ABSENT", {
      splits, dividends,
      interpretation: (splits + dividends) > 0
        ? "splitFactor und/oder divCash sind in der Kursreihe belegt."
        : "Weder Split noch Ausschuettung im gelieferten Zeitraum. Das kann am Titel " +
          "liegen und ist deshalb ABSENT, nicht FAILED."
    });

    console.log(`    EOD          ${bars.length} Bars, ${years} Jahre ` +
                `(${bars.length ? bars[0].date : "-"} → ${bars.length ? bars[bars.length - 1].date : "-"})`);
    console.log(`    Adjusted     ${adjustedPresent ? "vorhanden" : "FEHLT"}` +
                (adjustmentCheck ? `, belegt: ${adjustmentCheck.inferredStatus}` : ""));
    console.log(`    Kapitalmass. ${splits} Split(s), ${dividends} Ausschuettung(en)`);

    /* --------------------------------------------- 4. Latest Price */
    const quote = await provider.getQuote(symbol);
    requests++;
    if (!quote.available) {
      record(symbol, "latestQuote", verdictFor(quote), { reason: quote.reason });
      record(symbol, "referencePrice", "UNKNOWN", { reason: "Kursabfrage nicht verfuegbar." });
      console.log(`    Kurs         FEHLER (${quote.reason})`);
    } else {
      const q = quote.data;
      const lagS = q.timestamp
        ? Math.round((Date.now() - new Date(q.timestamp).getTime()) / 1000) : null;
      record(symbol, "latestQuote", q && q.last !== null ? "PASSED" : "ABSENT", {
        hasLast: q ? q.last !== null : false,
        hasTimestamp: !!(q && q.timestamp),
        lagSeconds: lagS,
        sessionPhase: session.phase,
        /* Kein Kurs im Beleg (§34) - nur ob einer da war und wie alt. */
        interpretation: "Der Betrag selbst steht bewusst nicht im Bericht."
      });

      /* Der Referenzkurs. Genau die Frage aus §4. */
      const hasRef = q && q.referencePrice !== null && q.referencePrice !== undefined;
      record(symbol, "referencePrice", hasRef ? "PASSED" : "ABSENT", {
        present: !!hasRef,
        differsFromLast: hasRef && q.last !== null ? q.referencePrice !== q.last : null,
        /* Der Abstand als Verhaeltnis, nicht als Betrag: er sagt, ob die
           beiden Felder dasselbe meinen, ohne einen Kurs zu nennen. */
        relativeDeviation: hasRef && q.last ? Math.round((q.referencePrice / q.last - 1) * 1e6) / 1e6 : null,
        hasBidAsk: !!(q && q.bid !== null && q.ask !== null),
        interpretation: hasRef
          ? "Tiingo liefert seinen Referenzkurs (tngoLast) neben dem IEX-Kurs."
          : "Kein tngoLast in der Antwort dieses Kontos."
      });
      console.log(`    Kurs         ${q.last !== null ? "vorhanden" : "FEHLT"}` +
                  `, Referenzkurs ${hasRef ? "vorhanden" : "FEHLT"}` +
                  (lagS !== null ? `, Abstand ${lagS} s` : ""));
    }

    /* ------------------------------------------------- 5. Intraday */
    const intraday = await provider.getIntradayBars(symbol, { interval: "1min", extendedHours: false });
    requests++;
    if (!intraday.available) {
      record(symbol, "intraday", verdictFor(intraday), { reason: intraday.reason,
        message: String(intraday.message || "").slice(0, 200) });
      record(symbol, "extendedHours", "UNKNOWN", { reason: "Intraday nicht verfuegbar." });
      console.log(`    Intraday     FEHLER (${intraday.reason})`);
    } else {
      const ib = intraday.data.bars || [];
      record(symbol, "intraday", ib.length ? "PASSED" : "ABSENT", {
        bars: ib.length, interval: intraday.data.interval,
        first: ib.length ? ib[0].timestamp : null,
        last: ib.length ? ib[ib.length - 1].timestamp : null
      });

      /* Erweiterte Zeiten: ausdruecklich angefragt und an den
         Zeitstempeln nachgerechnet. Ein afterHours=true, das der Anbieter
         ignoriert, sieht sonst aus wie eine Faehigkeit. */
      const ext = await provider.getIntradayBars(symbol, { interval: "1min", extendedHours: true });
      requests++;
      if (!ext.available) {
        record(symbol, "extendedHours", verdictFor(ext), { reason: ext.reason });
        console.log(`    Extended     FEHLER (${ext.reason})`);
      } else {
        const eb = ext.data.bars || [];
        let outside = 0;
        for (const b of eb) {
          if (!b.timestamp) continue;
          const phase = MarketHours.sessionAt(new Date(b.timestamp).getTime(),
                                              { calendar, exchange: "XNYS" }).phase;
          if (phase === "PRE_MARKET" || phase === "AFTER_HOURS") outside++;
        }
        record(symbol, "extendedHours", outside > 0 ? "PASSED" : "ABSENT", {
          requested: ext.data.extendedHoursRequested,
          barsWithExtendedHoursTimestamp: outside,
          barsTotal: eb.length,
          barsWithoutExtended: ib.length,
          interpretation: outside > 0
            ? "Bars mit Zeitstempeln ausserhalb der regulaeren Sitzung sind belegt."
            : "Keine Bar ausserhalb der regulaeren Sitzung. Das kann am Zeitfenster des " +
              "Laufs liegen und ist deshalb ABSENT, nicht FAILED. Ein Lauf in der " +
              "vorboerslichen oder nachboerslichen Phase entscheidet es."
        });
        console.log(`    Intraday     ${ib.length} Bars, erweitert ${eb.length} ` +
                    `(davon ${outside} ausserhalb der Sitzung)`);
      }
    }
  }

  finish(session, "RUNTIME_VERIFIED");
}

function finish(session, level) {
  const { byCapability, accountLevel } = summarize();
  const report = {
    generatedAt: new Date().toISOString(),
    provider: "tiingo",
    plan: "commercial",
    scope: "commercialCapabilityRetest",
    verificationLevel: level,
    note: "Jeder Eintrag stammt aus einer echten Antwort des Anbieters oder sagt ausdruecklich, " +
          "dass keine gestellt wurde. Der Bericht enthaelt keine Kurse und keinen Zugangsschluessel - " +
          "nur Anzahlen, Zeitabstaende und Aussagen. ABSENT heisst 'kam nicht mit', FAILED heisst " +
          "'wurde abgelehnt', ERROR heisst 'konnte nicht geprueft werden'. Die drei zu verwechseln " +
          "waere der eigentliche Fehler.",
    run: {
      source: process.env.GITHUB_ACTIONS ? "github-actions" : "local",
      repository: process.env.GITHUB_REPOSITORY || null,
      runId: process.env.GITHUB_RUN_ID || null,
      commit: process.env.GITHUB_SHA || null,
      ref: process.env.GITHUB_REF_NAME || null,
      requests
    },
    symbols: SYMBOLS,
    sessionAtRun: session ? {
      phase: session.phase, localDate: session.localDate, localTime: session.localTime,
      closedReason: session.closedReason || null,
      note: "Welche Befunde ueberhaupt moeglich waren, haengt an dieser Zeile - " +
            "erweiterte Zeiten und Kursabstaende vor allem."
    } : null,
    accountCapabilities: accountLevel,
    byCapability,
    findings
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, "capability-retest.json");
  writeFileSync(file, JSON.stringify(report, null, 2) + "\n");

  console.log("\n  Kontostand je Faehigkeit:");
  Object.keys(accountLevel).sort().forEach((c) => {
    console.log(`    ${c.padEnd(20)} ${accountLevel[c]}`);
  });
  console.log(`\n  Anfragen: ${requests}`);
  console.log(`  Bericht:  ${file.replace(root + "/", "")}`);
  return report;
}

main().catch((err) => { console.error(err); process.exit(1); });
