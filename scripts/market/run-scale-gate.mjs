/* =========================================================================
   VISION UNIVERSE — run-scale-gate.mjs   (Tiingo Commercial, §8–§12, §27, §32)

   Fuehrt ein Scale Gate aus und bilanziert es.

   Ein Gate ist kein Import mit mehr Titeln. Es ist eine Messung mit einer
   Entscheidung am Ende: laeuft die Pipeline in dieser Groessenordnung, und
   was kostet sie. Deshalb steht am Schluss nicht "fertig", sondern PASS
   oder FAIL - und bei FAIL wird nicht weiter skaliert (§37).

   REIHENFOLGE, UND WARUM SIE SO IST

     1. Canary (§12). Die Golden Five zuerst, immer. Eine Regression an
        fuenf bekannten Titeln kostet eine Minute; sie an 2.000 Titeln zu
        entdecken kostet einen Lauf und ein Kontingent.
     2. Erst danach das Gate-Universum.

   Ein Canary-Fehlschlag bricht ab, bevor der erste Gate-Titel angefasst
   wird. Das ist der ganze Zweck.

   FORTSETZBARKEIT (§27)

   Ein Lauf ueber 2.000 Titel bricht ab. Der Checkpoint des MarketStore
   traegt, welche Titel erledigt sind; ein zweiter Start macht dort
   weiter. Ohne das waere ein Gate ueber 2.000 Titel ein Vorhaben mit
   einem Versuch.

   Ausfuehren:
     TIINGO_API_KEY=... node scripts/market/run-scale-gate.mjs --gate GATE_100
     node scripts/market/run-scale-gate.mjs --gate GATE_100 --dry-run
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const engines = join(root, "quant", "engines");

const SymbolMapping = require(join(engines, "symbol-mapping.js"));
const MarketQuality = require(join(engines, "market-quality.js"));
const MarketStore = require(join(engines, "market-store.js"));
const DisplayPolicy = require(join(engines, "display-policy.js"));
const Tiingo = require(join(root, "providers", "tiingo", "adapter.js"));

const SCALE = JSON.parse(readFileSync(join(root, "quant", "config", "tiingo-scale.json"), "utf8"));

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const GATE = arg("--gate", "GATE_100");
const DRY_RUN = argv.includes("--dry-run");
const SKIP_CANARY = argv.includes("--skip-canary");
/* --assess-only: Universum bewerten, ohne Kurse zu holen.

   Fuer FULL_UNIVERSE ist das der einzige verantwortbare erste Schritt.
   Die Ablage waechst gemessen mit rund 3 GB je 1.000 Titel; bei den
   ueber 8.000 Aktien der Primaerboersen waeren das mehr als 24 GB - mehr
   freier Platz, als ein Standard-Runner hat. Ein Lauf, der das
   herausfindet, indem er auf halbem Weg an der Platte scheitert, hat
   Kontingent verbrannt und nichts belegt.

   Die Bewertung rechnet statt zu laden: Groesse, Zusammensetzung und die
   Hochrechnung aus den gemessenen Raten der kleineren Gates (§25, §26). */
const ASSESS_ONLY = argv.includes("--assess-only");
/* Der Schutz gehoert in das Skript und nicht in die Workflow-Datei.

   Der Grund ist eine teure Erfahrung: die Entscheidung "bewerten statt
   laden" stand in einer Shell-Bedingung im Workflow, und der Lauf hat
   trotzdem einen vollstaendigen Backfill begonnen - stundenlang, mit
   absehbarem Platzmangel. Eine Sicherung, die man von aussen umgehen
   oder falsch verdrahten kann, ist keine.

   Ab hier gilt: ein Backfill des Vollausbaustadiums verlangt
   --allow-full-backfill, unabhaengig davon, wer das Skript aufruft.
   Ohne die Angabe bewertet es. */
const ALLOW_FULL_BACKFILL = argv.includes("--allow-full-backfill");
const LIMIT = parseInt(arg("--limit", "0"), 10) || 0;
/* Ab wie vielen Titeln wandert die Einzelzeile in die Arbeitsablage?

   Ein Gate ueber 5.684 Titel erzeugt 2,1 MB perSymbol - in jedem Lauf
   erneut in die Versionierung geschrieben. Die interessanten Zeilen sind
   ohnehin die anderen: was NICHT sauber durchlief. Die bleiben immer im
   ausgelieferten Bericht, der Rest wandert ab dieser Groesse in die
   Arbeitsablage (§26). */
const DETAIL_LIMIT = parseInt(arg("--detail-limit", "500"), 10) || 500;
/* --request-budget: unser eigenes Stundenbudget, ausdruecklich als
   solches.

   Vorgeschichte, weil sie die Bauart erklaert: der FULL_UNIVERSE-Lauf
   vom 2026-09-09 endete nach exakt 5.000 Anfragen. 686 Titel blieben
   ungefragt, drei Pruefungen rissen, und der Bericht las sich wie ein
   Anbieterlimit. Es war unsere eigene Zahl aus COMMERCIAL_LIMITS - der
   Anbieter wurde fuer diese 686 Titel nie gefragt und hat nie etwas
   abgelehnt.

   Die Zahl bleibt einstellbar, aber sie heisst jetzt, was sie ist: ein
   Budget. Wer es erreicht, hat ueber Tiingo nichts gelernt. */
const REQUEST_BUDGET = parseInt(arg("--request-budget", "0"), 10) || 0;
/* Das Minutenbudget ist der eigentliche Taktgeber: 100/min ergeben die
   gemessenen 0,6 s je Titel. Es bleibt getrennt einstellbar, weil es
   eine andere Frage beantwortet als das Stundenbudget - "wie schnell"
   statt "wie viel insgesamt". */
const MINUTE_BUDGET = parseInt(arg("--minute-budget", "0"), 10) || 0;
/* Wie lange darf ein Abruf auf einen freien Platz warten?

   Der Standardwert 65 s stammt aus dem Oberflaechenbetrieb, wo niemand
   laenger vor einem Ladebalken sitzen soll. In einem Backfill ist er
   falsch: er hat 686 Titel verworfen, weil der naechste freie Platz 652
   Sekunden entfernt war. Warten waere hier billiger gewesen als
   aufgeben. */
const MAX_WAIT_MS = parseInt(arg("--max-wait-ms", "0"), 10) || 0;
/* Fortsetzen statt neu anfangen. Der Checkpoint traegt, was fertig ist;
   --fresh wirft ihn weg und beginnt von vorn. */
const FRESH = argv.includes("--fresh");
/* --scale-dir und --work-dir sind Testschalter derselben Art wie
   TIINGO_BASE_URL: sie lenken Eingabe, Bericht und Arbeitsablage auf
   einen Wegwerfbaum um, damit ein Test den echten Lauf pruefen kann,
   ohne in quant/data/ oder .market-cache zu schreiben. Ohne sie bleibt
   alles, wo es hingehoert. */
const SCALE_DIR = arg("--scale-dir", join(root, "quant", "data", "market", "scale"));
const WORK_DIR = arg("--work-dir", null);
const apiKey = process.env.TIINGO_API_KEY || null;

/* ------------------------------------------------------------ Aufbau */

const universeFile = join(SCALE_DIR, `universe-${GATE}.json`);
if (!existsSync(universeFile)) {
  console.error(`Kein Gate-Universum unter ${universeFile}.`);
  console.error(`Zuerst: node scripts/market/select-gate-universe.mjs --gate ${GATE}`);
  process.exit(2);
}
const universe = JSON.parse(readFileSync(universeFile, "utf8"));
let securities = universe.securities || [];
if (LIMIT) securities = securities.slice(0, LIMIT);

console.log(`Vision Universe — Scale Gate ${GATE}\n`);
console.log(`  Universum: ${securities.length} Titel (${universe.method})`);
console.log(`  Historie:  ab ${SCALE.history.initialFrom} (${SCALE.history.policy})`);

function writeReport(report) {
  mkdirSync(SCALE_DIR, { recursive: true });
  const file = join(SCALE_DIR, `gate-${GATE}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
  console.log(`\n  Bilanz: ${file.replace(root + "/", "")}`);
  return file;
}

/* --assess-only und --dry-run brauchen keinen Zugang: sie rechnen und
   holen nichts. Ein Abbruch wegen fehlendem Schluessel waere hier eine
   Huerde ohne Zweck - und genau die stand beim ersten Versuch im Weg. */
if (!apiKey && !DRY_RUN && !ASSESS_ONLY) {
  console.log("\n  Kein TIINGO_API_KEY gesetzt. Es wird nichts abgerufen.");
  writeReport({
    generatedAt: new Date().toISOString(), gate: GATE, provider: "tiingo",
    verdict: "UNAVAILABLE", verdictReason: "notConfigured",
    message: "Ohne Zugang laesst sich ein Gate weder bestehen noch nicht bestehen. " +
             "Es wird ausdruecklich nicht auf Modelldaten zurueckgefallen.",
    requested: securities.length
  });
  process.exit(0);
}

/* Die Bewertung braucht weder Adapter noch Registry noch Speicher - sie
   liest den bereits geschriebenen Universumsbericht und die Bilanzen der
   gelaufenen Gates. Sie steht deshalb vor dem Aufbau und nicht darin. */
/* Bewerten statt laden - entweder auf Verlangen oder weil die Groesse
   es gebietet. */
if (ASSESS_ONLY) {
  assessOnly("angefordert (--assess-only)");
}
if (GATE === "FULL_UNIVERSE" && !ALLOW_FULL_BACKFILL) {
  console.log("\n  FULL_UNIVERSE ohne --allow-full-backfill: es wird bewertet, nicht geladen.");
  console.log("  Gemessen sind rund 3 GB Ablage je 1.000 Titel. Ein vollstaendiger Lauf");
  console.log("  braucht mehr Platz, als ein Standard-Runner frei hat - und ein Lauf, der");
  console.log("  das auf halbem Weg herausfindet, hat Kontingent verbrannt und nichts belegt.");
  assessOnly("Groessenschutz: FULL_UNIVERSE ohne --allow-full-backfill");
}

const allSymbols = securities.map((s) => ({ securityId: s.securityId, ticker: s.ticker,
                                            exchange: s.exchange, mic: null }));
const canarySymbols = SCALE.canary.symbols.map((t) => ({
  securityId: "ref_" + t, ticker: t, exchange: null, mic: null
}));

/* Die Benchmark. Sie steht NICHT im Gate-Universum, weil sie ein ETF ist
   und damit ausdruecklich nicht screenerfaehig - gebraucht wird sie
   trotzdem: ohne sie bleibt die relative Staerke fuer jeden Titel
   SOURCE_MISSING, in den Faktoren wie in der Technical Intelligence.
   Genau das war das Ergebnis des ersten GATE_100-Laufs. Kostet eine
   Anfrage je Lauf. */
const benchmarkSpec = SCALE.benchmark
  ? { securityId: SCALE.benchmark.securityId, ticker: SCALE.benchmark.symbol,
      exchange: null, mic: null }
  : null;

const registry = SymbolMapping.createRegistry(
  allSymbols.concat(canarySymbols, benchmarkSpec ? [benchmarkSpec] : []).map((s) => ({
    securityId: s.securityId, providerId: Tiingo.PROVIDER_ID,
    providerSymbol: s.ticker, ticker: s.ticker, exchange: s.exchange,
    currency: "USD", country: "US", confidence: "inferred",
    note: "Aus dem Gate-Universum abgeleitet."
  }))
);

const capabilities = Tiingo.commercialPlanCapabilities();
/* Das Budget anheben, wenn der Aufrufer es verlangt - und die Herkunft
   mitverschieben. Eine angehobene Zahl ohne neue Herkunft waere genau
   der Fehler, den diese Nacharbeit abstellt: sie saehe hinterher aus wie
   eine Messung. Sie bleibt SAFETY_CEILING, nur eben eine andere. */
if (REQUEST_BUDGET > 0 || MINUTE_BUDGET > 0) {
  capabilities.limits = Object.assign({}, capabilities.limits,
    REQUEST_BUDGET > 0 ? {
      requestsPerHour: REQUEST_BUDGET,
      requestsPerDay: Math.max(capabilities.limits.requestsPerDay, REQUEST_BUDGET)
    } : {},
    MINUTE_BUDGET > 0 ? { requestsPerMinute: MINUTE_BUDGET } : {});
  capabilities.limits.provenance = Object.assign({}, capabilities.limits.provenance, {
    requestsPerHour: "SAFETY_CEILING",
    requestsPerMinute: "SAFETY_CEILING",
    budgetNote: `Vom Aufrufer gesetzt (--request-budget/--minute-budget): ` +
      `${capabilities.limits.requestsPerHour}/h, ${capabilities.limits.requestsPerMinute}/min. ` +
      "Weiterhin unsere Zahlen, nicht Tiingos. Was der Anbieter erlaubt, steht in providerObserved."
  });
}
/* TIINGO_BASE_URL ist ausschliesslich fuer Tests da: ein lokaler Server
   an derselben Schnittstelle laesst den ganzen Gate-Lauf pruefen, ohne
   das Kontingent des Anbieters anzufassen. Fehlt die Variable, laeuft
   alles gegen die echte Adresse - es gibt keinen stillen Testmodus. */
const provider = Tiingo.createTiingoProvider({
  apiKey, capabilities, symbolRegistry: registry,
  baseUrl: process.env.TIINGO_BASE_URL || undefined,
  fetchImpl: (url, init) => fetch(url, init)
});
const store = MarketStore.createMarketStore({
  root, providerId: Tiingo.PROVIDER_ID,
  workingDir: WORK_DIR || undefined
});

/* Der Abruf selbst ist eine interne Handlung und wird an derselben
   Richtlinie geprueft wie jede andere (§34). */
const permitted = DisplayPolicy.check({
  providerId: "tiingo", dataClass: "marketData", audience: "internal", form: "raw",
  gates: DisplayPolicy.gatesFromConfig(
    JSON.parse(readFileSync(join(root, "quant", "config", "feature-gates.json"), "utf8")))
});
if (!permitted.allowed && !DRY_RUN) {
  console.error(`\n  ABBRUCH: ${permitted.message}`);
  process.exit(1);
}

function assessOnly(grund) {
  /* Die Hochrechnung stuetzt sich auf die Bilanzen der bereits
     gelaufenen Gates und nicht auf eine Annahme. Fehlen sie, sagt der
     Bericht das - eine Hochrechnung ohne Messgrundlage waere eine
     Zahl ohne Deckung. */
  const measured = [];
  for (const g of SCALE.gates) {
    const file = join(SCALE_DIR, `gate-${g.id}.json`);
    if (!existsSync(file)) continue;
    try {
      const r = JSON.parse(readFileSync(file, "utf8"));
      if (r.verdict === "PASS" && r.accounting && r.accounting.storageBytes) {
        measured.push({
          gate: g.id, symbols: r.accounting.requested,
          storageMB: r.accounting.storageMB,
          storageMBPer1000: r.accounting.storageMBPer1000Symbols,
          secondsPerSymbol: r.run.runtimeSecondsPerSymbol,
          requests: r.accounting.requests,
          bytesReceivedMB: r.accounting.bytesReceivedMB
        });
      }
    } catch (err) { /* ein unlesbarer Bericht ist keine Messgrundlage */ }
  }

  const basis = measured.length ? measured[measured.length - 1] : null;
  const n = securities.length;
  const report = {
    generatedAt: new Date().toISOString(),
    gate: GATE, provider: "tiingo", plan: "commercial",
    verdict: "ASSESSED",
    verdictReason: "assessOnly",
    /* Warum bewertet wurde: auf Verlangen oder weil die Groesse es
       gebietet. Der Unterschied gehoert in den Bericht - sonst liest sich
       ein Groessenschutz wie eine Entscheidung des Aufrufers. */
    assessReason: grund || "angefordert",
    message: "Bewertung ohne Abruf. Es wurde kein Kurs geladen und kein Kontingent " +
             "verbraucht - die Zahlen unten sind Hochrechnungen aus gemessenen Raten, " +
             "ausdruecklich gekennzeichnet als solche.",
    universe: {
      file: `quant/data/market/scale/universe-${GATE}.json`,
      method: universe.method, targetSize: universe.targetSize, actualSize: n,
      bySector: universe.bySector, byExchange: universe.byExchange,
      notes: universe.notes || []
    },
    measurementBasis: measured,
    projection: basis ? {
      basis: `Gemessen an ${basis.gate} (${basis.symbols} Titel).`,
      symbols: n,
      storageGB: Math.round(basis.storageMBPer1000 * n / 1000 / 1024 * 10) / 10,
      downloadGB: Math.round(basis.bytesReceivedMB / basis.symbols * n / 1024 * 10) / 10,
      requests: n,
      gateMinutes: Math.round(basis.secondsPerSymbol * n / 60),
      note: "Linear hochgerechnet. Die gemessenen Raten waren zwischen 100 und 500 " +
            "Titeln stabil (0,60 s je Titel), deshalb ist die Annahme belegt und nicht " +
            "geraten. Sie deckt NICHT ab, was passiert, wenn der Platz ausgeht."
    } : {
      status: "NO_MEASUREMENT_BASIS",
      note: "Kein bestandenes Gate mit Bilanz vorhanden. Ohne Messgrundlage wird hier " +
            "nicht hochgerechnet."
    },
    feasibility: basis ? (() => {
      const storageGB = basis.storageMBPer1000 * n / 1000 / 1024;
      /* Ein GitHub-Standard-Runner hat rund 14 GB frei. Die Zahl steht
         hier als Vergleichsgroesse und wird im Lauf selbst gemessen
         (Schritt "Platz auf dem Laufwerk"). */
      const runnerGB = 14;
      return {
        storageGB: Math.round(storageGB * 10) / 10,
        typicalRunnerFreeGB: runnerGB,
        fitsOnStandardRunner: storageGB < runnerGB * 0.8,
        verdict: storageGB < runnerGB * 0.8 ? "FEASIBLE_AS_IS" : "STORAGE_MIGRATION_REQUIRED",
        recommendation: storageGB < runnerGB * 0.8
          ? "Der Backfill passt auf einen Standard-Runner."
          : "Ein vollstaendiger Backfill in einem Lauf passt nicht auf einen " +
            "Standard-Runner. Zwei Wege, beide ohne Datenverlust: den Backfill in " +
            "Abschnitten fahren (der Checkpoint traegt das schon) oder die Ablage " +
            "von JSON je Titel auf ein kompakteres Format umstellen. Was NICHT " +
            "empfohlen wird: die Historie zu kuerzen - sie ist der Grund, warum " +
            "dieser Zugang bezahlt wird."
      };
    })() : { verdict: "UNKNOWN", recommendation: "Ohne Messgrundlage keine Aussage." }
  };
  writeReport(report);
  console.log(`\n  Bewertung ohne Abruf: ${n} Titel`);
  if (report.projection.storageGB !== undefined) {
    console.log(`  Hochrechnung: ${report.projection.storageGB} GB Ablage, ` +
                `${report.projection.downloadGB} GB Download, ${report.projection.requests} Anfragen, ` +
                `${report.projection.gateMinutes} min Gate-Laufzeit`);
    console.log(`  ${report.feasibility.verdict}`);
    console.log(`  ${report.feasibility.recommendation}`);
  }
  process.exit(0);
}

/* --------------------------------------------------------- Abrufkern */

const today = new Date().toISOString().slice(0, 10);

async function fetchAndAssess(sec, opts) {
  opts = opts || {};
  const from = opts.incremental
    ? store.nextFetchFrom(sec.securityId, { initialFrom: SCALE.history.initialFrom })
    : SCALE.history.initialFrom;

  if (from > today) {
    const stored = store.readBars(sec.securityId, "working");
    return { ticker: sec.ticker, securityId: sec.securityId, fetched: false,
             reason: "upToDate", assessment: MarketQuality.assessSeries(stored, { today }) };
  }

  const started = Date.now();
  const res = await provider.getDailyBars(sec.securityId,
    MAX_WAIT_MS ? { from, maxWaitMs: MAX_WAIT_MS } : { from });
  const latencyMs = Date.now() - started;

  if (!res.available) {
    return { ticker: sec.ticker, securityId: sec.securityId, fetched: false,
             providerError: { reason: res.reason, message: String(res.message || "").slice(0, 200),
                              status: res.status || null,
                              /* Wer hat abgelehnt? "clientBudget" heisst: wir haben
                                 nicht gefragt. "provider" heisst: Tiingo hat nein
                                 gesagt. Nur das zweite ist eine Aussage ueber das
                                 Konto. */
                              source: res.source || (res.reason === "rateLimited" ? "clientBudget" : "provider") },
             latencyMs };
  }

  const bars = res.data.bars || [];
  let merged = null;
  if (bars.length) {
    merged = store.mergeBars(sec.securityId, bars, {
      ticker: sec.ticker, name: sec.company || null, exchange: sec.exchange || null,
      currency: "USD", adjustmentStatus: res.data.adjustmentStatus,
      provider: Tiingo.PROVIDER_ID, fetchedAt: new Date().toISOString()
    });
  }

  const stored = store.readBars(sec.securityId, "working");
  const assessment = MarketQuality.assessSeries(stored, { today });
  return { ticker: sec.ticker, securityId: sec.securityId, fetched: true,
           added: merged ? merged.added : 0, total: merged ? merged.total : (stored ? stored.bars.length : 0),
           first: merged ? merged.first : null, last: merged ? merged.last : null,
           adjustmentStatus: res.data.adjustmentStatus, latencyMs, assessment };
}

/** Fuehrt `tasks` mit begrenzter Gleichzeitigkeit aus. */
async function pool(items, worker, size) {
  const out = new Array(items.length);
  let next = 0;
  const runners = new Array(Math.max(1, Math.min(size, items.length))).fill(0).map(async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

/* ------------------------------------------------------------ Canary */

async function runCanary() {
  console.log(`\n  Canary (§12): ${SCALE.canary.symbols.join(", ")}`);
  const results = await pool(canarySymbols, (s) => fetchAndAssess(s, { incremental: true }),
                             capabilities.limits.concurrency || 2);
  const rules = SCALE.canary.regression;
  const details = results.map((r) => {
    const a = r.assessment;
    const failures = [];
    if (r.providerError) failures.push("providerError:" + r.providerError.reason);
    if (!a || a.status === "UNAVAILABLE") failures.push("noSeries");
    else {
      if (a.metrics.bars < rules.minBars) failures.push(`tooFewBars:${a.metrics.bars}<${rules.minBars}`);
      if (a.metrics.staleTradingDays !== null && a.metrics.staleTradingDays > rules.maxStaleTradingDays) {
        failures.push(`stale:${a.metrics.staleTradingDays}`);
      }
      if (a.status === "FAIL") failures.push("qualityFail:" + a.statusReason);
      if (rules.requireSplitsPresent.includes(r.ticker) && a.metrics.splits === 0) {
        failures.push("noSplitsFound");
      }
      if (rules.requireAdjustmentConsistency && a.metrics.adjustmentClaimed &&
          a.metrics.adjustmentInferred && a.metrics.adjustmentInferred !== "UNKNOWN") {
        const rank = { UNADJUSTED: 0, SPLIT_ADJUSTED: 1, TOTAL_RETURN: 2 };
        const claimed = rank[a.metrics.adjustmentClaimed];
        const inferred = rank[a.metrics.adjustmentInferred];
        if (claimed !== undefined && inferred !== undefined && claimed > inferred) {
          failures.push(`adjustmentContradicted:${a.metrics.adjustmentClaimed}>${a.metrics.adjustmentInferred}`);
        }
      }
    }
    const ok = failures.length === 0;
    console.log(`    ${r.ticker.padEnd(6)} ${ok ? "OK  " : "FAIL"} ` +
                (a && a.metrics ? `${String(a.metrics.bars).padStart(5)} Bars, ${a.metrics.first}→${a.metrics.last}, ` +
                 `${a.metrics.splits} Split(s), Status ${a.status}` : (r.providerError ? r.providerError.reason : "-")) +
                (ok ? "" : `  [${failures.join(", ")}]`));
    return { ticker: r.ticker, ok, failures,
             status: a ? a.status : "UNAVAILABLE",
             bars: a && a.metrics ? a.metrics.bars : 0,
             first: a && a.metrics ? a.metrics.first : null,
             last: a && a.metrics ? a.metrics.last : null,
             splits: a && a.metrics ? a.metrics.splits : null,
             dividends: a && a.metrics ? a.metrics.dividends : null,
             adjustmentClaimed: a && a.metrics ? a.metrics.adjustmentClaimed : null,
             adjustmentInferred: a && a.metrics ? a.metrics.adjustmentInferred : null,
             providerError: r.providerError || null };
  });
  const passed = details.filter((d) => d.ok).length;
  return { symbols: SCALE.canary.symbols, passed, of: details.length,
           passRate: details.length ? passed / details.length : 0,
           regression: passed < details.length, details };
}

/* -------------------------------------------------------------- Lauf */

async function main() {
  const t0 = Date.now();

  if (DRY_RUN) {
    console.log("\n  Probelauf. Es wird nichts abgerufen.");
    securities.slice(0, 10).forEach((s) => {
      const last = store.lastStoredDate(s.securityId);
      console.log(`    ${s.ticker.padEnd(8)} ab ${last ? store.nextFetchFrom(s.securityId, { initialFrom: SCALE.history.initialFrom }) : SCALE.history.initialFrom}` +
                  (last ? ` (gespeichert bis ${last})` : " (nichts gespeichert)"));
    });
    if (securities.length > 10) console.log(`    ... und ${securities.length - 10} weitere`);
    process.exit(0);
  }

  /* Zuerst die Benchmark, dann der Canary, dann das Gate. Die
     Reihenfolge ist keine Vorliebe: die Benchmark wird von den
     Auswertungsschritten gebraucht, und wenn sie fehlt, soll das im
     Bericht dieses Laufs stehen und nicht erst im naechsten auffallen. */
  let benchmark = null;
  if (benchmarkSpec) {
    const b = await fetchAndAssess(benchmarkSpec, { incremental: true });
    benchmark = {
      symbol: benchmarkSpec.ticker,
      securityId: benchmarkSpec.securityId,
      status: b.providerError ? "UNAVAILABLE"
             : b.assessment ? b.assessment.status : "UNAVAILABLE",
      bars: b.assessment && b.assessment.metrics ? b.assessment.metrics.bars : 0,
      first: b.assessment && b.assessment.metrics ? b.assessment.metrics.first : null,
      last: b.assessment && b.assessment.metrics ? b.assessment.metrics.last : null,
      providerError: b.providerError || null,
      note: "Vergleichsgroesse fuer relative Staerke. Nicht Teil des Gate-Universums und " +
            "nicht in der Bilanz - sie wird gebraucht, nicht bewertet."
    };
    console.log(`\n  Benchmark ${benchmarkSpec.ticker}: ` +
                (benchmark.status === "UNAVAILABLE"
                  ? `NICHT VERFUEGBAR (${benchmark.providerError ? benchmark.providerError.reason : "?"}) — ` +
                    "die relative Staerke bleibt fuer alle Titel leer."
                  : `${benchmark.bars} Bars, ${benchmark.first} → ${benchmark.last}`));
  }

  let canary = null;
  if (!SKIP_CANARY) {
    canary = await runCanary();
    if (canary.regression) {
      console.error(`\n  STOP: Canary-Regression (${canary.passed}/${canary.of} bestanden).`);
      console.error("  Das Gate wird nicht ausgefuehrt. Ursache zuerst beheben (§12, §37).");
      writeReport({
        generatedAt: new Date().toISOString(), gate: GATE, provider: "tiingo",
        verdict: "FAIL", verdictReason: "canaryRegression",
        message: "Canary-Regression vor dem Gate. Kein Full-Universe-Durchlauf.",
        requested: securities.length, canary, benchmark,
        runtimeMs: Date.now() - t0
      });
      process.exit(1);
    }
  }

  /* -------------------------------------------------- Gate-Universum */

  const runId = `gate-${GATE}`;
  if (FRESH) store.clearCheckpoint(runId);
  const checkpoint = store.loadCheckpoint(runId);
  if (!checkpoint.startedAt) checkpoint.startedAt = new Date().toISOString();

  /* Der Checkpoint ist eine Menge, keine Liste.

     Als Liste wuchs sie bei jedem Fortsetzen um die schon erledigten
     Titel weiter - doppelte Eintraege, und "wie viele sind fertig" war
     nicht mehr aus ihrer Laenge zu lesen. Die Menge macht das
     Fortsetzen idempotent: zweimal fortsetzen ist dasselbe wie einmal. */
  const done = new Set(checkpoint.done || []);
  checkpoint.done = Array.from(done);
  const pending = securities.filter((s) => !done.has(s.securityId));
  const resumed = done.size > 0;

  console.log(`\n  Gate-Lauf: ${pending.length} ausstehend` +
              (done.size ? ` (${done.size} aus einem frueheren Lauf erledigt — Fortsetzung)` : ""));
  console.log(`  Gleichzeitigkeit: ${capabilities.limits.concurrency}, ` +
              `eigenes Budget ${capabilities.limits.requestsPerHour}/h ` +
              `(SAFETY_CEILING, kein Anbieterlimit)`);
  if (MAX_WAIT_MS) console.log(`  Wartebereitschaft je Abruf: ${Math.round(MAX_WAIT_MS / 1000)} s`);
  console.log("");

  const perSymbol = {};
  let processed = 0;
  const t1 = Date.now();

  /* Der Checkpoint wird zeitgesteuert gesichert, nicht alle N Titel.

     Die alte Bedingung (done.length % 50 === 0) konnte bei
     gleichzeitigen Abrufen ueberspringen: zwei Worker schieben kurz
     hintereinander, die Laenge springt von 49 auf 51, und es wird nie
     gesichert. Eine Uhr kann nicht uebersprungen werden. */
  let lastSave = Date.now();
  const SAVE_EVERY_MS = 10000;
  function noteDone(securityId) {
    if (done.has(securityId)) return;
    done.add(securityId);
    checkpoint.done.push(securityId);
    if (Date.now() - lastSave >= SAVE_EVERY_MS) {
      store.saveCheckpoint(checkpoint);
      lastSave = Date.now();
    }
  }

  /* Ein Abbruch von aussen darf den Fortschritt nicht mitnehmen. Ohne
     diesen Haken kostet ein abgebrochener Actions-Lauf jede seit der
     letzten Sicherung geholte Reihe erneut. */
  let interrupted = null;
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
      interrupted = sig;
      try { store.saveCheckpoint(checkpoint); } catch (err) { /* Beim Abbruch nicht noch scheitern. */ }
      console.error(`\n  ${sig}: Fortschritt gesichert (${checkpoint.done.length} Titel). ` +
                    "Ein erneuter Aufruf setzt hier fort.");
      process.exit(130);
    });
  }

  const results = await pool(pending, async (sec) => {
    const r = await fetchAndAssess(sec, { incremental: true });
    processed++;
    if (processed % 25 === 0 || processed === pending.length) {
      const rate = processed / Math.max(1, (Date.now() - t1) / 1000);
      const heapMB = Math.round(process.memoryUsage().heapUsed / 1048576);
      console.log(`    ${String(processed).padStart(5)}/${pending.length}  ` +
                  `${rate.toFixed(1)} Titel/s  ${heapMB} MB Heap`);

      /* Den Antwortzwischenspeicher leeren.

         Der MarketClient haelt jede Antwort bis zum Ablauf ihrer
         Lebensdauer - bei Historienabrufen 30 Tage. Das ist fuer eine
         Oberflaeche richtig und fuer einen Gate-Lauf falsch: hier wird
         jeder Titel genau einmal abgerufen, und eine volle Historie ist
         je Titel mehrere Megabyte im Speicher. Ueber 2.000 Titel waeren
         das mehrere Gigabyte fuer Daten, die niemand mehr anfragt - der
         Lauf wuerde am Speicher scheitern, nicht am Kontingent (§32).

         Ein Treffer geht dabei nicht verloren, weil es keinen geben
         kann. Die Zaehler (Anfragen, Bytes) bleiben unberuehrt. */
      provider.clearCache();
    }
    if (!r.providerError) noteDone(sec.securityId);
    return r;
  }, capabilities.limits.concurrency || 2);

  store.saveCheckpoint(checkpoint);

  /* Was ein frueherer Lauf schon geholt hat, gehoert in die Bilanz.

     Ohne diesen Schritt zaehlt ein fortgesetzter Lauf nur, was ER selbst
     abgerufen hat - die 4.998 Titel aus dem Lauf davor waeren
     verschwunden, und der Bericht saehe schlechter aus als der Bestand.
     Das kostet keine einzige Anfrage: die Reihen liegen in der
     Arbeitsablage, sie werden nur erneut bewertet. */
  const ausBestand = [];
  if (resumed) {
    for (const sec of securities) {
      if (!done.has(sec.securityId)) continue;
      if (pending.some((p) => p.securityId === sec.securityId)) continue;
      const stored = store.readBars(sec.securityId, "working");
      ausBestand.push({
        ticker: sec.ticker, securityId: sec.securityId, fetched: false,
        fromCheckpoint: true,
        assessment: MarketQuality.assessSeries(stored, { today })
      });
    }
    if (ausBestand.length) {
      console.log(`  ${ausBestand.length} Titel aus dem Bestand des vorigen Laufs bewertet ` +
                  "(keine Anfrage).");
    }
  }
  const alleErgebnisse = results.concat(ausBestand);
  const runtimeMs = Date.now() - t0;

  /* ------------------------------------------------------- Bilanz */

  const counts = { requested: securities.length, resolved: 0, success: 0, warning: 0,
                   fail: 0, unavailable: 0 };
  const providerErrors = {};
  /* Vom eigenen Budget abgewiesen - getrennt gezaehlt. Diese Titel sind
     nicht schlecht, sie sind ungefragt. Sie mit Datenfehlern in einen
     Topf zu werfen, war der Berichtsfehler des ersten
     FULL_UNIVERSE-Laufs. */
  const budgetBlocked = [];
  const providerRefused = [];
  const qualityReasons = {};
  let historyCovered = 0, factorReady = 0, totalBars = 0;
  let oldestFirst = null, newestLast = null;

  const byTicker = new Map();
  for (const r of alleErgebnisse) {
    if (!r) continue;
    byTicker.set(r.ticker, r);
    const a = r.assessment;
    if (r.providerError) {
      counts.unavailable++;
      const key = r.providerError.reason || "unknown";
      providerErrors[key] = (providerErrors[key] || 0) + 1;
      if (r.providerError.source === "clientBudget") budgetBlocked.push(r.ticker);
      else if (r.providerError.reason === "quotaExceeded") providerRefused.push(r.ticker);
      perSymbol[r.ticker] = { status: "UNAVAILABLE", reason: key,
                              source: r.providerError.source || null,
                              message: r.providerError.message };
      continue;
    }
    counts.resolved++;
    if (!a || a.status === "UNAVAILABLE") {
      counts.unavailable++;
      perSymbol[r.ticker] = { status: "UNAVAILABLE", reason: a ? a.statusReason : "noAssessment" };
      continue;
    }
    if (a.status === "PASS") counts.success++;
    else if (a.status === "WARNING") counts.warning++;
    else counts.fail++;
    qualityReasons[a.statusReason] = (qualityReasons[a.statusReason] || 0) + 1;

    const m = a.metrics;
    totalBars += m.bars;
    if (m.usable >= SCALE.pass.historyCoverageMinBars) historyCovered++;
    if (m.factorReady) factorReady++;
    if (m.first && (!oldestFirst || m.first < oldestFirst)) oldestFirst = m.first;
    if (m.last && (!newestLast || m.last > newestLast)) newestLast = m.last;

    perSymbol[r.ticker] = {
      status: a.status, reason: a.statusReason,
      bars: m.bars, usable: m.usable, first: m.first, last: m.last,
      historyYears: m.historyYears, staleTradingDays: m.staleTradingDays,
      splits: m.splits, dividends: m.dividends,
      adjustmentClaimed: m.adjustmentClaimed, adjustmentInferred: m.adjustmentInferred,
      factorReady: m.factorReady,
      errors: m.errors, warnings: m.warnings
    };
  }

  /* Speicher: was der Lauf tatsaechlich auf die Platte gelegt hat. Die
     Zahl entscheidet §26 - nicht eine Schaetzung. */
  const inventory = store.inventory("working");
  const inGate = new Set(securities.map((s) => s.securityId));
  const gateInventory = inventory.filter((e) => inGate.has(e.securityId));
  const storageBytes = gateInventory.reduce((sum, e) => sum + (e.bytes || 0), 0);

  const stats = provider.stats();
  const quota = provider.quota();

  const rate = (a, b) => (b ? a / b : 0);
  const resolvedRate = rate(counts.resolved, counts.requested);
  const successRate = rate(counts.success + counts.warning, counts.requested);
  const failRate = rate(counts.fail, counts.requested);
  const historyRate = rate(historyCovered, counts.requested);
  const canaryRate = canary ? canary.passRate : null;

  const checks = [
    { id: "resolvedRate", value: resolvedRate, min: SCALE.pass.minResolvedRate,
      ok: resolvedRate >= SCALE.pass.minResolvedRate },
    { id: "successRate", value: successRate, min: SCALE.pass.minSuccessRate,
      ok: successRate >= SCALE.pass.minSuccessRate },
    { id: "failRate", value: failRate, max: SCALE.pass.maxFailRate,
      ok: failRate <= SCALE.pass.maxFailRate },
    { id: "historyCoverageRate", value: historyRate, min: SCALE.pass.minHistoryCoverageRate,
      ok: historyRate >= SCALE.pass.minHistoryCoverageRate },
    { id: "canaryPassRate", value: canaryRate, min: SCALE.pass.minCanaryPassRate,
      ok: canary === null ? null : canaryRate >= SCALE.pass.minCanaryPassRate,
      note: canary === null ? "Canary uebersprungen (--skip-canary): kein Ergebnis, kein Bestehen." : null }
  ];
  const failed = checks.filter((c) => c.ok === false);
  const skipped = checks.filter((c) => c.ok === null);

  /* FAIL heisst: die Daten taugen nicht. Es heisst NICHT: wir haben
     aufgehoert zu fragen.

     Der erste FULL_UNIVERSE-Lauf hat genau das verwechselt. 686 Titel
     blieben ungefragt, weil unser eigenes Budget zu Ende war; die drei
     Quoten wurden trotzdem ueber das volle Universum gerechnet und
     rissen. Eine Quote ueber einen Nenner, der nie abgerufen wurde,
     misst nicht die Daten - sie misst den Abbruch.

     Ab hier gilt: sind Titel am eigenen Budget haengengeblieben, lautet
     das Urteil INCOMPLETE_RESUMABLE. Der Lauf ist nicht gescheitert, er
     ist nicht fertig, und der Checkpoint sagt, wo er weitergeht. Die
     Qualitaetsquoten stehen weiter im Bericht - aber ueber dem Nenner,
     der wirklich abgerufen wurde. */
  let verdict;
  if (budgetBlocked.length || providerRefused.length) verdict = "INCOMPLETE_RESUMABLE";
  else if (failed.length) verdict = "FAIL";
  else if (skipped.length) verdict = "INCOMPLETE";
  else verdict = "PASS";

  /* Die Qualitaet der tatsaechlich geholten Titel - unabhaengig davon,
     wie viele noch ausstehen. Diese Quote ist bei einem abgebrochenen
     Lauf die einzige, die etwas ueber die Daten aussagt. */
  const qualityOfResolved = counts.resolved
    ? { of: counts.resolved,
        successRate: Math.round((counts.success + counts.warning) / counts.resolved * 10000) / 10000,
        failRate: Math.round(counts.fail / counts.resolved * 10000) / 10000 }
    : null;

  const gateSpec = SCALE.gates.find((g) => g.id === GATE);
  const report = {
    generatedAt: new Date().toISOString(),
    gate: GATE,
    provider: "tiingo",
    plan: "commercial",
    verdict,
    verdictReason: budgetBlocked.length
      ? `eigenesBudget:${budgetBlocked.length}TitelUngefragt`
      : providerRefused.length
      ? `anbieterAblehnung:${providerRefused.length}Titel`
      : failed.length ? failed.map((c) => c.id).join(",")
                      : skipped.length ? "incompleteChecks" : "allChecksPassed",
    /* Fortsetzbarkeit ist Teil des Urteils, nicht eine Fussnote. Wer den
       Bericht liest, muss ohne Nachfrage wissen, ob ein erneuter Aufruf
       die Luecke schliesst oder ob erst etwas repariert werden muss. */
    resumable: (budgetBlocked.length || providerRefused.length) ? {
      status: "RESUMABLE",
      pending: budgetBlocked.length + providerRefused.length,
      completed: checkpoint.done.length,
      checkpoint: `${runId}`,
      cause: budgetBlocked.length ? "clientBudget" : "providerLimit",
      causeNote: budgetBlocked.length
        ? "Unser eigenes Stundenbudget, nicht Tiingos Limit. Der Anbieter wurde " +
          "fuer diese Titel nicht gefragt und hat nichts abgelehnt."
        : "Der Anbieter hat mit HTTP 429 abgelehnt. Das ist eine echte Grenze des Kontos " +
          "und gehoert in providerObserved - kein Datenfehler.",
      howTo: `node scripts/market/run-scale-gate.mjs --gate ${GATE}` +
             (GATE === "FULL_UNIVERSE" ? " --allow-full-backfill" : "") +
             " (der Checkpoint wird automatisch fortgesetzt)"
    } : { status: "COMPLETE", pending: 0, completed: checkpoint.done.length },
    qualityOfResolved,
    nextGate: verdict === "PASS" ? (gateSpec && gateSpec.next) || null : null,
    nextGateNote: verdict === "PASS"
      ? "Freigegeben. Erst jetzt darf die naechste Stufe laufen (§37)."
      : "Nicht freigegeben. Ursache analysieren, beheben, Gate wiederholen (§37).",
    run: {
      source: process.env.GITHUB_ACTIONS ? "github-actions" : "local",
      runId: process.env.GITHUB_RUN_ID || null,
      commit: process.env.GITHUB_SHA || null,
      ref: process.env.GITHUB_REF_NAME || null,
      startedAt: new Date(t0).toISOString(),
      runtimeMs,
      runtimeSecondsPerSymbol: counts.requested ? Math.round(runtimeMs / counts.requested) / 1000 : null
    },
    universe: {
      file: `quant/data/market/scale/universe-${GATE}.json`,
      method: universe.method, targetSize: universe.targetSize,
      bySector: universe.bySector, byExchange: universe.byExchange
    },
    accounting: {
      requested: counts.requested,
      resolved: counts.resolved,
      success: counts.success,
      warning: counts.warning,
      fail: counts.fail,
      unavailable: counts.unavailable,
      providerErrors,
      qualityReasons,
      requests: stats.requests,
      cacheHits: stats.cacheHits,
      retries: stats.retries,
      bytesReceived: stats.bytesReceived,
      bytesReceivedMB: Math.round(stats.bytesReceived / 1048576 * 10) / 10,
      storageBytes,
      storageMB: Math.round(storageBytes / 1048576 * 10) / 10,
      storageMBPer1000Symbols: counts.requested
        ? Math.round(storageBytes / 1048576 / counts.requested * 1000 * 10) / 10 : null,
      quota: quota,
      /* ANBIETER gegen UNS - die Unterscheidung, die dieser Phase gefehlt hat.

         requestBudget ist unsere Zahl. providerObserved ist, was Tiingo
         von sich aus gesagt hat. Solange http429Seen false bleibt und
         keine Kontingentkoepfe ankommen, ist ueber das tatsaechliche
         Limit des Kontos nichts belegt - und dann darf auch niemand
         behaupten, es seien 5.000. */
      requestBudget: {
        requestsPerHour: capabilities.limits.requestsPerHour,
        requestsPerMinute: capabilities.limits.requestsPerMinute,
        provenance: "SAFETY_CEILING",
        owner: "vision-universe",
        note: "Unser Budget, nicht Tiingos Limit."
      },
      providerObserved: {
        http429Seen: stats.provider429 > 0,
        http429Count: stats.provider429 || 0,
        rateLimitHeaders: stats.rateLimitHeaders || null,
        retryAfterSeconds: stats.retryAfterSeconds || null,
        symbolsRefusedByProvider: providerRefused.length,
        symbolsBlockedByOwnBudget: budgetBlocked.length,
        highestRequestsInThisRun: stats.requests,
        status: stats.provider429 > 0 ? "PROVIDER_LIMIT_OBSERVED"
              : stats.rateLimitHeaders ? "RATE_LIMIT_HEADERS_PRESENT"
              : "NO_PROVIDER_STATEMENT",
        note: stats.provider429 > 0
          ? "Der Anbieter hat abgelehnt. Diese Zahl ist ein Beleg."
          : "Der Anbieter hat in diesem Lauf nichts abgelehnt und keine Kontingentkoepfe " +
            "gesendet. Ueber sein tatsaechliches Limit sagt der Lauf damit nichts - ausser, " +
            "dass es mindestens so hoch ist wie die hier gestellten Anfragen."
      },
      /* Was der Lauf an Speicher gebraucht hat. Die Zahl entscheidet
         mit, ob die naechste Stufe auf demselben Weg laufen kann (§24,
         §32) - eine Hochrechnung aus der Titelzahl allein wuerde den
         Zwischenspeicher uebersehen. */
      peakHeapMB: Math.round(process.memoryUsage().heapUsed / 1048576),
      rssMB: Math.round(process.memoryUsage().rss / 1048576)
    },
    historyCoverage: {
      minBars: SCALE.pass.historyCoverageMinBars,
      covered: historyCovered,
      rate: Math.round(historyRate * 10000) / 10000,
      factorReady,
      factorReadyRate: Math.round(rate(factorReady, counts.requested) * 10000) / 10000,
      totalBars,
      averageBars: counts.resolved ? Math.round(totalBars / counts.resolved) : 0,
      oldestFirstDate: oldestFirst,
      newestLastDate: newestLast
    },
    dataQuality: {
      PASS: counts.success, WARNING: counts.warning, FAIL: counts.fail,
      UNAVAILABLE: counts.unavailable, reasons: qualityReasons
    },
    canary,
    benchmark,
    checks,
    perSymbol,
    note: "Kein Feld dieses Berichts ist geschaetzt. Fehlende Werte stehen als null mit " +
          "Grund; Kurse selbst enthaelt der Bericht nicht (§34)."
  };

  /* Einzelzeilen: immer vollstaendig in die Arbeitsablage, im
     ausgelieferten Bericht nur bis DETAIL_LIMIT. Was auffiel - alles
     ausser PASS - bleibt in jedem Fall drin: ein Bericht ohne seine
     Befunde waere keiner. */
  const detailInRepo = Object.keys(perSymbol).length <= DETAIL_LIMIT;
  if (!detailInRepo) {
    /* In DIE Arbeitsablage, die dieser Lauf benutzt - nicht in die des
       Repositories. Ohne diese Unterscheidung schreibt ein Lauf mit
       --work-dir seine Einzelzeilen woanders hin als seine Kursreihen,
       und ein Test findet sie nicht dort, wo er sie hingelenkt hat. */
    const detailFile = join(WORK_DIR || join(root, SCALE.storage.workingDir),
                            "tiingo", "gates", `gate-${GATE}-perSymbol.json`);
    mkdirSync(dirname(detailFile), { recursive: true });
    writeFileSync(detailFile, JSON.stringify(perSymbol));

    const auffaellig = {};
    Object.keys(perSymbol).forEach((t) => {
      if (perSymbol[t].status !== "PASS") auffaellig[t] = perSymbol[t];
    });
    report.perSymbol = auffaellig;
    report.perSymbolDetail = {
      location: "workingStore",
      file: detailFile.replace(root + "/", ""),
      symbolsTotal: Object.keys(perSymbol).length,
      symbolsInReport: Object.keys(auffaellig).length,
      reason: `Mehr als ${DETAIL_LIMIT} Titel. Ausgeliefert werden die Befunde - alles ` +
              `ausser PASS - und die Bilanz; die vollstaendige Liste liegt in der ` +
              `Arbeitsablage (§26).`
    };
  } else {
    report.perSymbolDetail = { location: "report", symbolsTotal: Object.keys(perSymbol).length };
  }

  writeReport(report);

  console.log("\n  Ergebnis:");
  console.log(`    angefragt ${counts.requested} · aufgeloest ${counts.resolved} · ` +
              `PASS ${counts.success} · WARNING ${counts.warning} · FAIL ${counts.fail} · ` +
              `UNAVAILABLE ${counts.unavailable}`);
  console.log(`    Anfragen ${stats.requests} · ${report.accounting.bytesReceivedMB} MB empfangen · ` +
              `${report.accounting.storageMB} MB Ablage`);
  console.log(`    Laufzeit ${(runtimeMs / 1000).toFixed(1)} s ` +
              `(${report.run.runtimeSecondsPerSymbol} s/Titel)`);
  console.log(`    Historie: ${historyCovered}/${counts.requested} mit ≥${SCALE.pass.historyCoverageMinBars} Bars, ` +
              `Schnitt ${report.historyCoverage.averageBars} Bars`);
  checks.forEach((c) => {
    const mark = c.ok === true ? "OK  " : c.ok === false ? "FAIL" : "n/a ";
    console.log(`    ${mark} ${c.id.padEnd(20)} ${c.value === null ? "-" : (c.value * 100).toFixed(1) + " %"}` +
                (c.min !== undefined ? ` (min ${(c.min * 100).toFixed(0)} %)` : "") +
                (c.max !== undefined ? ` (max ${(c.max * 100).toFixed(0)} %)` : ""));
  });
  console.log(`\n  URTEIL: ${verdict}`);
  if (verdict === "PASS" && report.nextGate) console.log(`  Naechste Stufe freigegeben: ${report.nextGate}`);

  process.exit(verdict === "FAIL" ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
