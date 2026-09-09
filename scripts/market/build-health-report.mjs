/* =========================================================================
   VISION UNIVERSE — build-health-report.mjs   (Tiingo Commercial, §29, §30)

   Ein maschinenlesbarer Zustandsbericht ueber die gesamte Marktdatenkette.

   Der Zweck steht in §29 und ist eine Zumutungsvermeidung: bei tausenden
   Titeln darf niemand durch Dateien klicken muessen, um zu erfahren, ob
   die Daten von heute sind. Dieser Bericht fasst zusammen, was die
   einzelnen Laeufe hinterlassen haben - und sagt ausdruecklich, wenn ein
   Lauf FEHLT.

   DAS FEHLENDE IST DER EIGENTLICHE INHALT

   Ein Gesundheitsbericht, der nur zeigt, was da ist, ist eine
   Erfolgsmeldung. Dieser hier traegt fuer jede Quelle einen Status:

     OK              gelesen, aktuell
     STALE           gelesen, aber aelter als die Frist
     MISSING         der Lauf hat nie stattgefunden
     UNREADABLE      die Datei ist da und nicht lesbar

   Ausfuehren:
     node scripts/market/build-health-report.mjs
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCALE = JSON.parse(readFileSync(join(root, "quant", "config", "tiingo-scale.json"), "utf8"));

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const DATA_ROOT = arg("--data-root", join(root, "quant", "data"));
const OUT_DIR = arg("--out", join(root, "quant", "data", "market", "health"));
/* Ab wann gilt ein Lauf als veraltet. Ein Marktdatenlauf, der drei Tage
   alt ist, hat ein verlaengertes Wochenende ueberdauert; einer, der
   sieben Tage alt ist, laeuft nicht mehr. */
const STALE_HOURS = parseInt(arg("--stale-hours", "72"), 10) || 72;

function load(relative) {
  const file = join(DATA_ROOT, relative);
  if (!existsSync(file)) {
    return { status: "MISSING", file: relative, data: null,
             note: "Dieser Lauf hat nicht stattgefunden. Der Bericht traegt hier keine Zahl - " +
                   "eine Null waere eine Aussage ueber Daten, die es nicht gibt." };
  }
  let data;
  try { data = JSON.parse(readFileSync(file, "utf8")); }
  catch (err) {
    return { status: "UNREADABLE", file: relative, data: null,
             note: "Datei vorhanden, aber nicht lesbar: " + String(err.message).slice(0, 120) };
  }
  const generatedAt = data.generatedAt || null;
  const ageHours = generatedAt
    ? Math.round((Date.now() - Date.parse(generatedAt)) / 3600000 * 10) / 10 : null;
  const stale = ageHours !== null && ageHours > STALE_HOURS;
  return {
    status: stale ? "STALE" : "OK",
    file: relative, generatedAt, ageHours,
    staleAfterHours: STALE_HOURS,
    data,
    note: stale ? `Der letzte Lauf liegt ${ageHours} Stunden zurueck (Frist ${STALE_HOURS}).` : null
  };
}

function gateIds() {
  const dir = join(DATA_ROOT, "market", "scale");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^gate-.*\.json$/.test(f))
    .map((f) => f.replace(/^gate-/, "").replace(/\.json$/, ""));
}

const universe = load(join("market", "universe", "summary.json"));
const capability = load(join("market", "commercial", "capability-retest.json"));
const liveCandle = load(join("market", "commercial", "live-candle-verification.json"));

const gates = {};
let lastSuccessfulUpdate = null;
let latestPassedGate = null;

for (const id of gateIds()) {
  const g = load(join("market", "scale", `gate-${id}.json`));
  /* Die Deckungsbilanz zuerst: sie wird immer ausgeliefert. Die
     Einzelzeilen liegen ab einer gewissen Groesse in der Arbeitsablage
     (§26), und ein Gesundheitsbericht, der auf sie angewiesen waere,
     meldete dann MISSING fuer einen Lauf, den es gab. */
  const factorsSummary = load(join("market", "factors", `factors-${id}-summary.json`));
  const factors = factorsSummary.data
    ? factorsSummary
    : load(join("market", "factors", `factors-${id}.json`));
  const screener = load(join("market", "factors", `screener-${id}.json`));
  const technical = load(join("technical", "scale", `technical-coverage-${id}.json`));

  const d = g.data;
  /* ASSESSED zaehlt ausdruecklich nicht als bestanden: es wurde nichts
     geladen, also ist nichts belegt. */
  if (d && d.verdict === "PASS") {
    const order = SCALE.gates.map((x) => x.id);
    if (!latestPassedGate || order.indexOf(id) > order.indexOf(latestPassedGate)) latestPassedGate = id;
  }
  if (g.status === "OK" && d && d.generatedAt &&
      (!lastSuccessfulUpdate || d.generatedAt > lastSuccessfulUpdate)) {
    lastSuccessfulUpdate = d.generatedAt;
  }

  /* Ein Gate, das an der Canary-Regression abgebrochen ist, schreibt
     einen kurzen Bericht OHNE Bilanz - das Universum wurde ja nie
     angefasst (§12). Der Gesundheitsbericht muss genau das abbilden
     koennen, statt daran zu scheitern: ein abgebrochener Lauf ist der
     Zustand, ueber den er berichten soll. */
  const hasAccounting = !!(d && d.accounting && d.dataQuality && d.historyCoverage);

  gates[id] = {
    gate: { status: g.status, generatedAt: g.generatedAt, ageHours: g.ageHours,
            verdict: d ? d.verdict : null, verdictReason: d ? d.verdictReason : null,
            note: g.note },
    marketData: hasAccounting ? {
      requested: d.accounting.requested, resolved: d.accounting.resolved,
      PASS: d.dataQuality.PASS, WARNING: d.dataQuality.WARNING,
      FAIL: d.dataQuality.FAIL, UNAVAILABLE: d.dataQuality.UNAVAILABLE,
      historyCoverageRate: d.historyCoverage.rate,
      factorReadyRate: d.historyCoverage.factorReadyRate,
      averageBars: d.historyCoverage.averageBars,
      storageMB: d.accounting.storageMB,
      runtimeMs: d.run.runtimeMs
    } : { status: d ? (d.verdict === "ASSESSED" ? "ASSESSED_ONLY" : "ABORTED") : g.status,
          reason: d ? d.verdictReason : null,
          projection: d && d.projection ? d.projection : null,
          feasibility: d && d.feasibility ? d.feasibility : null,
          note: !d ? g.note
            : d.verdict === "ASSESSED"
              ? "Bewertung ohne Abruf. Es wurde nichts geladen; die Zahlen unter projection " +
                "sind Hochrechnungen aus gemessenen Raten und ausdruecklich als solche " +
                "gekennzeichnet."
              : "Der Lauf ist vor dem Gate-Universum abgebrochen (" + d.verdictReason + "). " +
                "Es gibt keine Bilanz, weil nichts geladen wurde - und keine Null, die so " +
                "aussaehe, als waere geladen worden." },
    /* Backtest-Tauglichkeit (§31). Bewusst abgeleitet und nicht neu
       gemessen: alles, was die Frage beantwortet, steht bereits im
       Gate-Bericht.

       Die drei Punkte, an denen ein Backtest falsch wird:

         - Bereinigungsstufe unklar. Eine Reihe, die als TOTAL_RETURN
           deklariert ist und sich nicht so verhaelt, erzeugt eine
           Rendite, die es nie gab. Deshalb stehen deklarierte und
           gemessene Stufe getrennt und werden hier gegeneinander
           gezaehlt.
         - Zukunftsdaten. validateBars() verwirft Bars mit einem Datum
           nach heute - sie entstehen durch Zeitzonenfehler und wirken im
           Backtest als Look-Ahead.
         - Zu kurze Historie. Sie macht einen Backtest nicht falsch,
           aber bedeutungslos.

       Was hier NICHT steht, ist ein Leistungsversprechen. Der Block
       sagt, ob die Daten die Frage tragen - nicht, was aus ihnen folgt. */
    backtestReadiness: hasAccounting ? (() => {
      const rows = Object.values(d.perSymbol || {});
      const byInferred = {};
      let contradicted = 0, withEvents = 0, futureBars = 0, tooShort = 0;
      for (const r of rows) {
        const inferred = r.adjustmentInferred || "UNKNOWN";
        byInferred[inferred] = (byInferred[inferred] || 0) + 1;
        const rank = { UNADJUSTED: 0, SPLIT_ADJUSTED: 1, TOTAL_RETURN: 2 };
        const c = rank[String(r.adjustmentClaimed || "").toUpperCase()];
        const i = rank[inferred];
        if (c !== undefined && i !== undefined && c > i) contradicted++;
        if ((r.splits || 0) + (r.dividends || 0) > 0) withEvents++;
        if (r.reason === "future_bar") futureBars++;
        if (!r.factorReady) tooShort++;
      }
      return {
        symbols: rows.length,
        byInferredAdjustment: byInferred,
        adjustmentContradicted: contradicted,
        withCorporateActions: withEvents,
        rejectedForFutureBars: futureBars,
        notFactorReady: tooShort,
        rawAndAdjustedStoredSeparately: true,
        note: "Roh- und bereinigte Spalte liegen in der Arbeitsablage nebeneinander; die " +
              "Bereinigungsstufe wird gemessen und nicht uebernommen. Zukunftsbars werden " +
              "verworfen, bevor sie den Bestand erreichen. Ein Leistungsversprechen ist " +
              "damit nicht verbunden.",
        readiness: contradicted === 0 && futureBars === 0
          ? "DATA_SUPPORTS_BACKTEST"
          : "REVIEW_REQUIRED",
        readinessReason: contradicted === 0 && futureBars === 0
          ? "Keine widersprochene Bereinigungsstufe und keine Zukunftsbars im Bestand."
          : `${contradicted} Reihe(n) mit widersprochener Bereinigungsstufe, ` +
            `${futureBars} mit Zukunftsbars. Beides muss vor einem Backtest geklaert sein.`
      };
    })() : { status: "MISSING",
             note: "Ohne Gate-Bilanz laesst sich die Backtest-Tauglichkeit nicht beurteilen." },

    canary: d && d.canary ? {
      passed: d.canary.passed, of: d.canary.of, regression: d.canary.regression,
      symbols: d.canary.symbols
    } : { status: "MISSING",
          note: "Ohne Canary-Ergebnis ist die Gate-Bilanz nicht einzuordnen (§12)." },
    factors: factors.data ? {
      status: factors.status,
      computed: factors.data.coverage.computed,
      skipped: factors.data.coverage.skipped,
      skippedByReason: factors.data.coverage.skippedByReason,
      /* Die vier Durchschnitte einzeln: §14 fragt nach ihnen, und eine
         Sammelzahl verdeckt, wenn ausgerechnet SMA200 fehlt.

         Die Feldnamen tragen "Calculated", und das ist kein Schmuck: der
         Wert ist eine ANZAHL von Titeln, kein Kursniveau. Ein Feld namens
         "sma200" mit einer Zahl darin ist von einem SMA-Kurs nicht zu
         unterscheiden - weder fuer einen Leser noch fuer die
         Hygienepruefung, die genau solche Felder in ausgelieferten
         Artefakten sucht. Sie hat diesen Bericht beim ersten Lauf zu
         Recht angehalten. */
      smaCoverage: [20, 50, 100, 200].reduce((acc, p) => {
        const c = factors.data.coverage.fieldCoverage["sma" + p];
        acc["sma" + p + "Calculated"] = c ? c.CALCULATED : 0;
        return acc;
      }, {}),
      momentumCoverage: ["1M", "3M", "6M", "12M"].reduce((acc, h) => {
        const c = factors.data.coverage.fieldCoverage["returns." + h];
        acc[h] = c ? c.CALCULATED : 0;
        return acc;
      }, {}),
      relativeStrengthCoverage: (() => {
        const c = factors.data.coverage.fieldCoverage["relativeStrength.12M"];
        return c ? { calculated: c.CALCULATED, sourceMissing: c.SOURCE_MISSING,
                     insufficientHistory: c.INSUFFICIENT_HISTORY } : null;
      })(),
      riskCoverage: (() => {
        const c = factors.data.coverage.fieldCoverage.volatility60d;
        const dd = factors.data.coverage.fieldCoverage.maxDrawdown252d;
        return { volatility60d: c ? c.CALCULATED : 0, maxDrawdown252d: dd ? dd.CALCULATED : 0 };
      })()
    } : { status: factors.status, note: factors.note },
    screener: screener.data ? {
      status: screener.status,
      evaluable: screener.data.evaluable,
      notEvaluable: screener.data.notEvaluable,
      questions: screener.data.questions.map((q) => ({
        id: q.id, kind: q.kind,
        matched: q.matched !== undefined ? q.matched : q.evaluated,
        notEvaluable: q.notEvaluable
      }))
    } : { status: screener.status, note: screener.note },
    technical: technical.data ? {
      status: technical.status,
      READY: technical.data.coverage.TECHNICAL_READY,
      PARTIAL: technical.data.coverage.TECHNICAL_PARTIAL,
      FAILED: technical.data.coverage.TECHNICAL_FAILED,
      INSUFFICIENT_HISTORY: technical.data.coverage.INSUFFICIENT_HISTORY,
      SOURCE_MISSING: technical.data.coverage.SOURCE_MISSING,
      msPerSymbol: technical.data.performance.msPerSymbol,
      elliott: technical.data.elliott.coverage
    } : { status: technical.status, note: technical.note }
  };
}

/* --------------------------------------------------- Gesamturteil

   Bewusst grob und bewusst pessimistisch. Der Bericht soll die Frage
   "kann ich damit arbeiten" beantworten, nicht eine Note vergeben. */
let overall, overallReason;
if (universe.status === "MISSING") {
  overall = "NOT_READY";
  overallReason = "Kein Marktuniversum. Ohne das gibt es kein Gate und keinen Screener.";
} else if (!Object.keys(gates).length) {
  overall = "NOT_READY";
  overallReason = "Kein Gate ist bisher gelaufen.";
} else if (!latestPassedGate) {
  overall = "NOT_READY";
  overallReason = "Kein Gate hat bestanden. Ursache im jeweiligen Gate-Bericht (§37).";
} else {
  const g = gates[latestPassedGate];
  const canaryOk = g.canary && g.canary.regression === false;
  if (!canaryOk) {
    overall = "NOT_READY";
    overallReason = "Das zuletzt bestandene Gate traegt keinen sauberen Canary.";
  } else {
    const spec = SCALE.gates.find((x) => x.id === latestPassedGate);
    overall = spec && spec.next ? "READY_FOR_NEXT_SCALE_GATE" : "READY_FOR_FULL_MARKET_DATA_INGEST";
    overallReason = spec && spec.next
      ? `${latestPassedGate} bestanden. Freigegeben ist ${spec.next} - und nur das.`
      : `${latestPassedGate} bestanden.`;
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  provider: "tiingo",
  plan: "commercial",
  schemaVersion: 1,
  note: "Maschinenlesbarer Zustandsbericht. Jede Quelle traegt einen Status; MISSING heisst, " +
        "dass der Lauf nicht stattgefunden hat, und ist ausdruecklich keine Null.",
  run: {
    source: process.env.GITHUB_ACTIONS ? "github-actions" : "local",
    runId: process.env.GITHUB_RUN_ID || null,
    commit: process.env.GITHUB_SHA || null,
    staleAfterHours: STALE_HOURS
  },
  overall,
  overallReason,
  lastSuccessfulUpdate,
  latestPassedGate,
  universe: universe.data ? {
    status: universe.status, generatedAt: universe.generatedAt, ageHours: universe.ageHours,
    rows: universe.data.totals ? universe.data.totals.rows : null,
    screenerEligible: universe.data.totals ? universe.data.totals.screenerEligible : null,
    byInstrumentType: universe.data.totals ? universe.data.totals.byInstrumentType : null,
    coverageGaps: universe.data.coverageGaps || null
  } : { status: universe.status, note: universe.note },
  commercialCapabilities: capability.data ? {
    status: capability.status, generatedAt: capability.generatedAt,
    verificationLevel: capability.data.verificationLevel,
    accountCapabilities: capability.data.accountCapabilities,
    sessionAtRun: capability.data.sessionAtRun
  } : { status: capability.status, note: capability.note },
  realtime: liveCandle.data ? {
    status: liveCandle.status, generatedAt: liveCandle.generatedAt,
    LIVE_CHART_READY: liveCandle.data.LIVE_CHART_READY,
    reason: liveCandle.data.liveChartReason,
    /* Die Kursart gehoert in den Zustandsbericht, weil sie ueber die
       Verwendung entscheidet und nicht nur ueber die Anzeige. Ein
       nachgelagerter Dienst, der hier BLOCKED liest, weiss ohne
       Nachfrage, dass er auf dieser Kerze nicht rechnen darf (§11). */
    priceSemantics: liveCandle.data.priceSemantics ? {
      outcome: liveCandle.data.priceSemantics.outcome,
      priceType: liveCandle.data.priceSemantics.priceType,
      tracksField: liveCandle.data.priceSemantics.tracksField || null,
      providerConfirmationRequired:
        !!liveCandle.data.priceSemantics.providerConfirmationRequired,
      intradayIntelligence: liveCandle.data.priceSemantics.intradayIntelligence
        ? liveCandle.data.priceSemantics.intradayIntelligence.status : null
    } : { outcome: "UNKNOWN", priceType: null, tracksField: null,
          providerConfirmationRequired: true, intradayIntelligence: "BLOCKED",
          note: "Kein Stromnachweis mit Kursartbefund vorhanden. Bis dahin gesperrt." },
    sessionAtRun: liveCandle.data.sessionAtRun
  } : { status: liveCandle.status, note: liveCandle.note,
        LIVE_CHART_READY: "UNKNOWN",
        priceSemantics: { outcome: "UNKNOWN", intradayIntelligence: "BLOCKED",
                          providerConfirmationRequired: true } },
  gates
};

mkdirSync(OUT_DIR, { recursive: true });
const file = join(OUT_DIR, "health.json");
writeFileSync(file, JSON.stringify(report, null, 2) + "\n");

console.log("Vision Universe — Gesundheitsbericht Marktdaten\n");
console.log(`  Universum:  ${report.universe.status}` +
            (report.universe.screenerEligible !== undefined && report.universe.screenerEligible !== null
              ? ` (${report.universe.screenerEligible} screenerfaehige Aktien)` : ""));
console.log(`  Commercial: ${report.commercialCapabilities.status}`);
console.log(`  Realtime:   LIVE_CHART_READY = ${report.realtime.LIVE_CHART_READY}` +
            (report.realtime.priceSemantics
              ? `, Kursart ${report.realtime.priceSemantics.outcome}` +
                ` (Intraday-Nutzung ${report.realtime.priceSemantics.intradayIntelligence})` : ""));
Object.keys(gates).forEach((id) => {
  const g = gates[id];
  console.log(`  ${id.padEnd(15)} ${String(g.gate.verdict || g.gate.status).padEnd(11)}` +
              (g.marketData && g.marketData.PASS !== undefined
                ? ` PASS ${g.marketData.PASS} · WARN ${g.marketData.WARNING} · ` +
                  `FAIL ${g.marketData.FAIL} · n/a ${g.marketData.UNAVAILABLE}` : ""));
});
console.log(`\n  Gesamt: ${overall}`);
console.log(`  ${overallReason}`);
console.log(`\n  ${file.replace(root + "/", "")}`);
