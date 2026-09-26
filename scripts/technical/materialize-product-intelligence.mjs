/* Materialize Technical, Signals and Elliott Product Data from the existing
 * private canonical history. No provider request and no public history API. */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";

const require = createRequire(import.meta.url);
const rootDefault = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
function arg(name, fallback = null) { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback; }
const root = arg("--root", rootDefault);
const workDir = arg("--work-dir", join(root, ".market-cache"));
const outDir = arg("--out", join(root, "quant", "data", "product", "technical-signals-v1"));
const limit = parseInt(arg("--limit", "0"), 10) || 0;
const now = arg("--now", new Date().toISOString());
const minTechnicalBars = 300;
const signalLookbacks = [5, 20, 60];
/* Zustaende der Vormerkung, die dieser Lauf selbst und mit frischeren Daten
   nachmisst - sie duerfen deshalb kein Veto sprechen. Begruendung an der
   Verwendungsstelle (`vormerkungVeto`). Wird die Liste erweitert, muss der
   nachmessende Code danebenstehen: ein Zustand ohne eigene Pruefung waere
   ein stiller Fallback. */
const RECHECKED_HERE = new Set(["INSUFFICIENT_HISTORY", "SOURCE_MISSING"]);

const Canonical = require(join(root, "quant/engines/technical/canonical-bars.js"));
const Analysis = require(join(root, "quant/engines/technical/technical-analysis.js"));
const Product = require(join(root, "quant/engines/technical/product-materialization.js"));
const MarketSignals = require(join(root, "quant/api/market-signal-contract.js"));
const TechnicalWorkspace = require(join(root, "quant/api/technical-workspace-contract.js"));
const MarketHours = require(join(root, "quant/engines/realtime/market-hours.js"));
const Service = require(join(root, "quant/api/product-services.js"));
const Policy = require(join(root, "quant/engines/display-policy.js"));
const Query = require(join(root, "quant/engines/query.js"));
const calendar = JSON.parse(readFileSync(join(root, "quant/config/market-calendar.json"), "utf8"));
const methodology = {
  technical: JSON.parse(readFileSync(join(root, "quant/methodology/technical-v1.json"), "utf8")),
  elliott: JSON.parse(readFileSync(join(root, "quant/methodology/elliott-v1.json"), "utf8"))
};
const recipes = Service.create({ loadJSON: async () => { throw new Error("NO_IO"); }, displayPolicy: Policy, queryEngine: Query }).getRecipes();

function load(path) { return JSON.parse(readFileSync(path, "utf8")); }
function historyFile(securityId) { return join(workDir, "tiingo", "daily", securityId + ".json"); }
function isDate(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T00:00:00Z")); }
function roundNumbers(_key, value) { return typeof value === "number" && !Number.isInteger(value) ? Math.round(value * 1e6) / 1e6 : value; }
function writeGzip(path, payload) {
  mkdirSync(dirname(path), { recursive: true });
  const raw = Buffer.from(JSON.stringify(payload, roundNumbers));
  const compressed = gzipSync(raw, { level: 9, mtime: 0 });
  writeFileSync(path, compressed);
  return { raw: raw.length, compressed: compressed.length };
}

/* Welche Deklarationen dieser Pfad annimmt.

   Er rechnet ausschliesslich auf der SPLIT_ADJUSTED-Reihe, die er unten
   selbst aus close und den Kapitalmassnahmen rekonstruiert
   (Canonical.fromPriceBars) - die adjClose-Spalte des Anbieters wird
   dabei ERSETZT, nicht gelesen. Technical, Setup und Elliott stehen seit
   Option C ohnehin auf SPLIT_ADJUSTED_PRICE.

   Deshalb gilt hier dasselbe wie in market-factors: eine widerlegte
   Gesamtrendite-Spalte sperrt die Gesamtrendite, nicht diese Reihe. Waere
   'splitAdjustedReconstructible' hier nicht zugelassen, haette die
   Trennung die relative Staerke im Faktorlauf gerettet und sie im
   Technical-Lauf verloren - inklusive der SPY-Vergleichsreihe, die diese
   Datei genauso braucht. */
const ACCEPTED_ADJUSTMENT = new Set(["adjusted", "splitAdjustedReconstructible"]);

function validatedInput(payload, member) {
  if (!payload || payload.ticker !== member.s || payload.securityId !== member.m || payload.provider !== "tiingo" ||
      !ACCEPTED_ADJUSTMENT.has(payload.adjustmentStatus) || !Array.isArray(payload.bars)) throw new Error("INVALID_HISTORY_PROVENANCE");
  let previous = null, splits = 0, dividends = 0;
  for (const bar of payload.bars) {
    if (!bar || bar.securityId !== member.m || !isDate(bar.date) || (previous && bar.date <= previous) ||
        ![bar.open, bar.high, bar.low, bar.close, bar.adjustedClose, bar.volume, bar.splitFactor].every(Number.isFinite) ||
        bar.open <= 0 || bar.high <= 0 || bar.low <= 0 || bar.close <= 0 || bar.adjustedClose <= 0 ||
        bar.volume < 0 || bar.splitFactor <= 0 || bar.high < Math.max(bar.open, bar.close, bar.low) ||
        bar.low > Math.min(bar.open, bar.close)) throw new Error("INVALID_HISTORY_BAR");
    if (bar.splitFactor !== 1) splits++;
    if (Number.isFinite(bar.dividend) && bar.dividend > 0) dividends++;
    previous = bar.date;
  }
  const observedAt = payload.updatedAt || payload.durableUpdatedAt;
  if (!observedAt || !Number.isFinite(Date.parse(observedAt)) || observedAt.slice(0, 10) < payload.bars.at(-1)?.date || Date.parse(observedAt) > Date.parse(now)) {
    throw new Error("INVALID_HISTORY_OBSERVED_AT");
  }
  const actions = [];
  for (const bar of payload.bars) {
    if (bar.splitFactor !== 1) actions.push({ type: "split", exDate: bar.date, ratio: bar.splitFactor });
    if (Number.isFinite(bar.dividend) && bar.dividend > 0) actions.push({ type: "dividend", exDate: bar.date, amount: bar.dividend });
  }
  const worlds = Canonical.fromPriceBars(payload.bars, actions, { instrumentId: member.s, source: "tiingo",
    sourceRevision: observedAt, currency: payload.currency || "USD", exchange: payload.exchange || "US" });
  const series = worlds.SPLIT_ADJUSTED, validation = Canonical.validateSeries(series);
  if (!validation.valid) throw new Error("INVALID_CANONICAL_SERIES:" + validation.errors[0]);
  const reconciled = { status: "PASS", method: "CANONICAL_SPLIT_FACTORS_V1", priceSeriesType: "SPLIT_ADJUSTED", events: splits };
  const signalBars = payload.bars.map((bar, i) => ({ ...bar, adjustedClose: series.close[i] }));
  return { series, signalSource: { ticker: member.s, securityId: member.m, provider: "tiingo", dataMode: "real",
    isMock: false, publishBasis: "CANONICAL_PRODUCT_MATERIALIZATION", currency: payload.currency || "USD",
    adjustmentStatus: "adjusted", updatedAt: observedAt, bars: signalBars, corporateActionReconciliation: reconciled },
    provenance: { observedAt, adjustmentStatus: payload.adjustmentStatus, splitEvents: splits, dividendEvents: dividends,
      corporateActionReconciliation: reconciled } };
}

/* ZWEI WAHRHEITEN UNTER EINEM CODE - GETRENNT, WEIL SIE ES SIND.
 *
 * Bis hierher endete jeder Fehlschlag dieser Pruefung als
 * TECHNICAL_CALENDAR_INVALID. Der Satz klingt nach einem Defekt UNSERES
 * Kalenders und schickt jeden, der nachsieht, an die falsche Stelle.
 * Gemessen am 26.09.2026 ueber die 42 betroffenen Titel sind es zwei
 * verschiedene Lagen:
 *
 *   2 Titel tragen eine Bar an einem Tag, an dem die Boerse zu war
 *     (2026-02-16 Presidents' Day, 2026-04-03 Karfreitag, 2026-05-25
 *     Memorial Day). Das ist ein Datenfehler des Anbieters, an einem
 *     nennbaren Datum.
 *
 *   39 Titel werden so duenn gehandelt, dass ihre letzten 270 BARS 1,1 bis
 *     4,0 JAHRE zurueckreichen (AAAP: 67 Bars im Jahr). Das Fenster
 *     verlaesst damit die Kalenderdeckung (ab 2022-01-01), und ausserhalb
 *     entscheidet der Kalender nur nach Wochentag - eine Sitzungsaussage
 *     ist dort nicht gesichert. Der Ausschluss ist richtig: 270 Sitzungen
 *     ueber vier Jahre beschreiben keine "aktuelle Kursstruktur". Falsch
 *     war nur der Grund.
 *
 * Kein Kursfeld aendert sich dadurch; es sind zwei Gruende statt einem. */
/* DIE ENTSCHEIDUNG, OB EIN TITEL EIN BUNDLE BEKOMMT - AN EINER STELLE.
 *
 * Exportiert, damit sie geprueft werden kann, ohne ein Universum zu
 * faelschen: die Regel ist eine Funktion von zwei Werten, und genau das
 * soll ein Test sehen. Der Aufrufer unten benutzt dieselbe Funktion; ein
 * Test haelt auch das fest, sonst waere sie Zierde. */
export function bundleGate(capabilityState, bars) {
  const vetoed = capabilityState !== "TECHNICAL_READY" && !RECHECKED_HERE.has(capabilityState);
  if (vetoed) return { ok: false, reason: "NOT_TECHNICAL_READY", detail: { capabilityState: capabilityState || null } };
  if (!Number.isFinite(bars) || bars < minTechnicalBars) return { ok: false, reason: "INSUFFICIENT_HISTORY", detail: null };
  return { ok: true, reason: null, detail: null };
}

/* Der Grund steckt im Fehlertext, das Detail dahinter. Getrennt wird genau
   einmal, hier - nicht an jeder Fangstelle neu. */
export function splitReason(message, capabilityState) {
  const text = String(message || "");
  const code = text.split(":")[0] || "TECHNICAL_FAILED";
  const rest = text.slice(code.length + 1);
  if (code === "TECHNICAL_SESSION_NOT_A_TRADING_DAY" && rest) {
    return { code, detail: { nonTradingDay: rest, exchange: "XNYS", contract: "quant/config/market-calendar.json" } };
  }
  if (code === "TECHNICAL_WINDOW_OUTSIDE_CALENDAR" && rest) {
    const [uncovered, first, last] = rest.split("|");
    return { code, detail: { uncoveredDate: uncovered || null, windowFirst: first || null, windowLast: last || null,
      windowSessions: Product.DISPLAY_BARS, calendarFrom: (calendar.coverage && calendar.coverage.from) || null } };
  }
  if (code === "NOT_TECHNICAL_READY" && capabilityState) return { code, detail: { capabilityState } };
  return { code, detail: null };
}

export function validateTechnicalCalendar(series) {
  const dates = series.timestamps.slice(-Product.DISPLAY_BARS);
  for (const date of dates) {
    const session = MarketHours.sessionAt(date + "T12:00:00Z", { calendar, exchange: "XNYS" });
    if (!session.calendarCoverage) {
      throw new Error("TECHNICAL_WINDOW_OUTSIDE_CALENDAR:" + date + "|" + dates[0] + "|" + dates.at(-1));
    }
    if (!session.isTradingDay) throw new Error("TECHNICAL_SESSION_NOT_A_TRADING_DAY:" + date);
  }
  return { status: "PASS", contract: "quant/config/market-calendar.json", exchange: "XNYS",
    first: dates[0], last: dates.at(-1), sessions: dates.length };
}

export function materialize(options = {}) {
  const target = options.outDir || outDir, sourceDir = options.workDir || workDir;
  const universe = load(join(root, "quant/data/universe/market-capability.json"));
  let members = universe.members.slice().sort((a, b) => a.s.localeCompare(b.s));
  if (options.tickers) { const wanted = new Set(options.tickers); members = members.filter(m => wanted.has(m.s)); }
  else if (limit) members = members.slice(0, limit);
  const pathFor = (securityId) => join(sourceDir, "tiingo", "daily", securityId + ".json");

  rmSync(target, { recursive: true, force: true }); mkdirSync(target, { recursive: true });
  const signalPayloads = Object.fromEntries(signalLookbacks.map(n => [n, []]));
  let currentShard = null, currentInstruments = {}, rawBytes = 0, compressedBytes = 0, shardCount = 0;
  const writtenShards = new Set();
  const reasons = {}, rows = {}, stats = { productUniverse: members.length, historiesFound: 0, historiesValidated: 0,
    lookbackCovered: 0, adjustedProvenance: 0, splitFactors: 0, corporateActionsValidated: 0,
    calendarValidated: 0, technicalFullBundles: 0, signalsCapable: 0, elliottCapable: 0 };

  let benchmark = null;
  const benchmarkMember = universe.members.find(m => m.s === "SPY");
  if (benchmarkMember && existsSync(pathFor(benchmarkMember.m))) {
    try { benchmark = validatedInput(load(pathFor(benchmarkMember.m)), benchmarkMember).series; } catch { benchmark = null; }
  }

  function unavailableSignals(ticker, reason) {
    for (const lookback of signalLookbacks) signalPayloads[lookback].push({ ticker, state: "UNAVAILABLE", reason, events: [] });
  }
  /* WARUM EIN TITEL KEIN BUNDLE HAT - AN DER STELLE, AN DER DIE SEITE
     OHNEHIN NACHSIEHT.

     Gemessen am 25.09.2026 ueber 6.875 Titel: 5.590 sind vollstaendig,
     990 haben zu wenig Historie (COOL: 20 Bars, notiert seit 6 Wochen),
     208 liegen mit ihrem Fenster ausserhalb der Kalenderdeckung, einer hat
     keine Reihe. Der Grund steht je Titel in summary.json#rows - und die
     Datei ist 813 KB gross, also fuer eine Aktienseite unbrauchbar.

     Die Seite laedt fuer einen Titel ohnehin genau seinen Shard. Der Grund
     gehoert deshalb hierher, aber NICHT in `instruments`: dort prueft der
     Leser Bundle-Felder und wuerde an einem Grund-Eintrag scheitern. Also
     ein eigener Block mit eigener Version - der bestehende Vertrag bleibt
     Byte fuer Byte, was er war.

     Was ein Nutzer davon hat: statt "Technische Analyse derzeit nicht
     verfuegbar" steht dort, dass sein Titel seit zwanzig Handelstagen
     notiert und die Analyse dreihundert braucht. Das ist dieselbe
     Auskunft, nur wahr. */
  /* 1.1.0 (2026-09-26): dieselben Schluessel, zwei neue Gruende und ein
     optionales `detail`. Die Gruende sind die Aufspaltung von
     TECHNICAL_CALENDAR_INVALID (siehe validateTechnicalCalendar); `detail`
     traegt, was den Satz erst brauchbar macht - das Datum der Bar an einem
     geschlossenen Tag, oder die Spanne des Fensters, das die
     Kalenderdeckung verlaesst. Ein Leser von 1.0.0 findet `reason`, `bars`
     und `requiredBars` unveraendert an ihrer Stelle. */
  const UNAVAILABLE_SCHEMA = "technical-unavailable-1.1.0";
  let currentUnavailable = {};
  function noteUnavailable(ticker, reason, bars, detail) {
    currentUnavailable[ticker] = { reason: reason,
      bars: Number.isFinite(bars) ? bars : null,
      requiredBars: reason === "INSUFFICIENT_HISTORY" ? minTechnicalBars : null,
      detail: detail && Object.keys(detail).length ? detail : null };
  }
  function flushShard() {
    if (!currentShard) return;
    const result = writeGzip(join(target, currentShard + ".json.gz"), { schemaVersion: Product.VERSION,
      shard: currentShard, generatedAt: now, instruments: currentInstruments,
      unavailableSchemaVersion: UNAVAILABLE_SCHEMA, unavailable: currentUnavailable });
    rawBytes += result.raw; compressedBytes += result.compressed; shardCount++;
    writtenShards.add(currentShard);
    currentInstruments = {}; currentUnavailable = {};
  }

  for (const member of members) {
    /* Der Shard eines Titels steht VOR der Analyse fest - nur so kann ein
       Titel OHNE Bundle seinen Grund im eigenen Shard hinterlassen. Die
       Mitglieder sind nach Ticker sortiert, ihre Shard-Schluessel damit
       zusammenhaengend; an 6.875 Titeln nachgerechnet: 646 Shards, kein
       einziger Wiedereintritt. Trifft er doch ein, ueberschriebe er eine
       fertige Datei - deshalb bricht er den Lauf ab statt still zu sein. */
    let key;
    try { key = Product.shardKey(member.s); }
    catch {
      rows[member.s] = { technical: "INVALID_PRODUCT_TICKER", signals: "INVALID_PRODUCT_TICKER", elliott: "NOT_RUN" };
      unavailableSignals(member.s, "INVALID_PRODUCT_TICKER");
      reasons.INVALID_PRODUCT_TICKER = (reasons.INVALID_PRODUCT_TICKER || 0) + 1; continue;
    }
    if (key !== currentShard) {
      flushShard();
      if (writtenShards.has(key)) throw new Error("SHARD_REOPENED:" + key);
      currentShard = key;
    }
    const file = pathFor(member.m);
    if (!existsSync(file)) { rows[member.s] = { technical: "SOURCE_MISSING", signals: "SOURCE_MISSING", elliott: "NOT_RUN" }; unavailableSignals(member.s, "SOURCE_MISSING"); noteUnavailable(member.s, "SOURCE_MISSING", null); reasons.SOURCE_MISSING = (reasons.SOURCE_MISSING || 0) + 1; continue; }
    stats.historiesFound++;
    let input;
    try { input = validatedInput(load(file), member); }
    catch (error) { const reason = String(error.message).split(":")[0]; rows[member.s] = { technical: reason, signals: reason, elliott: "NOT_RUN" }; unavailableSignals(member.s, reason); noteUnavailable(member.s, reason, null); reasons[reason] = (reasons[reason] || 0) + 1; continue; }
    stats.historiesValidated++; stats.adjustedProvenance++; stats.corporateActionsValidated++;
    stats.splitFactors += input.provenance.splitEvents;
    if (input.series.length >= 261) stats.lookbackCovered++;

    let signal60 = null;
    for (const lookback of signalLookbacks) {
      const result = MarketSignals.build(input.signalSource, { ticker: member.s, securityId: member.m, recipes, lookback, calendar, now });
      signalPayloads[lookback].push({ ticker: member.s, ...result });
      if (lookback === 60) signal60 = result;
    }
    if (signal60?.state === "AVAILABLE") { stats.signalsCapable++; stats.calendarValidated++; }
    else { const reason = "SIGNAL_" + (signal60?.reason || "UNAVAILABLE"); reasons[reason] = (reasons[reason] || 0) + 1; }

    /* DIE ZAHL ENTSCHEIDET, NICHT DIE VORMERKUNG - JETZT AUCH IM CODE.
     *
     * Der Satz stand hier schon, die Bedingung tat aber etwas anderes: sie
     * liess die Vormerkung `member.t` ein Veto sprechen, auch wenn die
     * Reihe die Schwelle inzwischen erfuellt. Diese Vormerkung stammt aus
     * technical-coverage-ELIGIBLE_US_EQUITY.json, und dieser Bericht
     * entsteht in einem EIGENEN Lauf (run-technical-scale.mjs).
     *
     * Gemessen am 26.09.2026: der Bericht ist vom 11.09. (Lauf
     * 34611793308). 26 Titel standen dort mit 290 bis 298 Bars unter
     * INSUFFICIENT_HISTORY - heute haben dieselben Titel 301 bis 309, also
     * mehr als die 300, die DIESER Lauf selbst verlangt. Sie bekamen
     * trotzdem kein Bundle, und mit ihnen keine Setup-Zeile: die
     * Setup-Beobachtung liest genau dieses Universum. Jeder Titel, der die
     * Schwelle nach dem Berichtsdatum ueberschreitet, blieb bis zum
     * naechsten Bericht draussen.
     *
     * Deshalb: Zustaende, die dieser Lauf mit frischeren Daten selbst
     * nachmisst, duerfen nicht vetoen. INSUFFICIENT_HISTORY wird hier an
     * `input.series.length` gemessen, SOURCE_MISSING an der Existenz der
     * Datei - beides eine Zeile weiter oben und mit dem heutigen Stand.
     * Alles andere (TECHNICAL_PARTIAL, TECHNICAL_FAILED) weiss der Bericht
     * aus seinem eigenen Lauf, und das bleibt ein Veto. */
    const gate = bundleGate(member.t, input.series.length);
    if (!gate.ok) {
      rows[member.s] = { technical: gate.reason, signals: signal60?.state || "UNAVAILABLE", elliott: "NOT_RUN", bars: input.series.length };
      noteUnavailable(member.s, gate.reason, input.series.length, gate.detail);
      reasons[gate.reason] = (reasons[gate.reason] || 0) + 1;
      continue;
    }
    try {
      input.provenance.calendarValidation = validateTechnicalCalendar(input.series);
      const bundle = Analysis.analyze({ series: input.series,
        benchmarkSeries: member.s === "SPY" ? null : benchmark,
        methodology, options: { elliott: true, annotations: true, includeChartSeries: true, displayWindow: "1Y" } });
      const required = ["trend", "momentum", "volatility", "volume", "structure", "supportResistance", "confluence", "opportunityScore", "scenarios", "tradeSetup"];
      const missing = required.filter(key => !bundle[key]);
      if (missing.length) throw new Error("TECHNICAL_PARTIAL:" + missing.join(","));
      const artifact = JSON.parse(JSON.stringify(Product.project({ ticker: member.s, securityId: member.m, series: input.series, bundle,
        benchmarkId: benchmark && member.s !== "SPY" ? "SPY" : null, provenance: input.provenance }), roundNumbers));
      const workspace = TechnicalWorkspace.build(artifact, { ticker: member.s, now: now.slice(0, 10) });
      if (workspace.state !== "AVAILABLE") throw new Error("TECHNICAL_CONTRACT_" + (workspace.reason || "UNAVAILABLE"));
      currentInstruments[member.s] = artifact;
      stats.technicalFullBundles++;
      const elliottCapable = !!bundle.elliott && bundle.elliott.status !== "UNAVAILABLE" && bundle.elliott.status !== "INSUFFICIENT_DATA";
      if (elliottCapable) stats.elliottCapable++;
      rows[member.s] = { technical: "AVAILABLE", signals: signal60?.state === "AVAILABLE" ? "AVAILABLE" : signal60?.reason || "UNAVAILABLE",
        elliott: elliottCapable ? "AVAILABLE" : "UNAVAILABLE", bars: input.series.length, asOf: bundle.dataCutoff, shard: key };
    } catch (error) {
      const { code: reason, detail } = splitReason(error.message, member.t);
      rows[member.s] = { technical: reason, signals: signal60?.state === "AVAILABLE" ? "AVAILABLE" : signal60?.reason || "UNAVAILABLE", elliott: "NOT_RUN", bars: input.series.length };
      noteUnavailable(member.s, reason, input.series.length, detail);
      reasons[reason] = (reasons[reason] || 0) + 1;
    }
  }
  flushShard();
  for (const lookback of signalLookbacks) {
    const results = signalPayloads[lookback], available = results.filter(r => r.state === "AVAILABLE");
    writeGzip(join(target, "signals-" + lookback + ".json.gz"), { schemaVersion: "market-signals-product-1.0.0",
      generatedAt: now, lookback, scope: "CANONICAL_PRODUCT_UNIVERSE", results,
      events: available.flatMap(r => r.events).sort((a, b) => b.asOf.localeCompare(a.asOf) || a.ticker.localeCompare(b.ticker)),
      counts: { requested: results.length, available: available.length, unavailable: results.length - available.length } });
  }
  const summary = { schemaVersion: "technical-signals-product-summary-1.0.0", generatedAt: now,
    source: { history: "CANONICAL_R2_V1_TIINGO_DAILY_US", historyOwner: "quant/engines/history-store.js",
      technicalOwner: "quant/engines/technical/technical-analysis.js", signalOwner: "quant/api/market-signal-contract.js",
      calendar: "quant/config/market-calendar.json", methodology: methodology.technical.methodologyVersion,
      elliottMethodology: methodology.elliott.methodologyVersion }, counts: stats, reasons,
    artifacts: { shardCount, rawBytes, compressedBytes, compression: "gzip", displayBars: Product.DISPLAY_BARS }, rows };
  writeFileSync(join(target, "summary.json"), JSON.stringify(summary));
  return summary;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const summary = materialize();
  console.log(JSON.stringify({ generatedAt: summary.generatedAt, counts: summary.counts, reasons: summary.reasons, artifacts: summary.artifacts }, null, 2));
  if (!limit && summary.counts.technicalFullBundles === 0) process.exitCode = 1;
}
