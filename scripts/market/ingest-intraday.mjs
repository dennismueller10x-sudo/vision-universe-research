/* =========================================================================
   VISION UNIVERSE — ingest-intraday.mjs

   INTRADAY-SNAPSHOTS FUER DAS PRODUKTUNIVERSUM

   Holt je Titel den Tagesverlauf EINER Sitzung (5-Minuten-Bars ueber den
   bestehenden Tiingo-Adapter, providers/tiingo/adapter.js#getIntradayBars)
   und legt ihn als Snapshot ab:

     quant/data/market/intraday/<sessionDate>/<securityId>.json
     quant/data/market/intraday/index.json        (Verzeichnis fuer den Client)
     quant/data/market/intraday/status.json       (Bilanz des Laufs, keine Kurse)

   Welche Sitzung? Der Trading Session Resolver entscheidet
   (quant/engines/realtime/trading-session.js): laeuft die Boerse, die
   laufende; sonst die letzte abgeschlossene. Ein Snapshot einer
   abgeschlossenen Sitzung ist unveraenderlich und kostet keinen zweiten
   Abruf. Waehrend der Sitzung waechst er mit jedem Lauf um die neuen
   Bars - und nur um die.

   Zwei Umfaenge, beide aus der Konfiguration (development-preview.json,
   intraday.scopes):
     --scope=discover   die Titel auf den Discover-Flaechen
                        (discover/data/live-scope/<Universum>.json)
     --scope=universe   das ganze Produktuniversum (nach Handelsschluss)
     --scope=auto       bei offener Boerse: discover; sonst universe, wenn
                        die letzte abgeschlossene Sitzung noch nicht fuer
                        das Universum vorliegt (Nachzug nach einem
                        ausgefallenen Lauf), andernfalls discover
     --scope=AAPL,MSFT  eine Liste, fuer Nachweise

   Der Vorfall vom 15.09.2026 (Seite zeigte Freitag, Montag war gehandelt)
   hatte seine Ursache vor diesem Skript: der Zeitplan lief nur auf dem
   Default-Branch, und dort lag der Workflow noch nicht. Was dieses Skript
   seither garantiert: der Nachzug (--scope=auto), eine Aufbewahrung, die
   die juengste Universumssitzung nie loescht, und ein Verzeichnis, das
   die letzte abgeschlossene Sitzung und die Frische seiner Eintraege
   nennt (freshness.js) - der Health-Check (check-freshness.mjs) liest sie.

   Kein Punkt entsteht hier. Kein Abruf ohne Gate (ENABLE_LIVE_MARKET_DATA),
   keine Veroeffentlichung ohne Grundlage in der Anzeigerichtlinie. Der
   Schluessel bleibt in der Umgebung; kein Schluessel, kein Abruf, keine
   Demo-Daten.

   Aufruf:
     TIINGO_API_KEY=... node scripts/market/ingest-intraday.mjs --scope=discover
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { loadPreviewConfig, resolveScope, expandPreviewConfig } from "./preview-scope.mjs";

const require = createRequire(import.meta.url);
const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(name + "="));
  return hit ? hit.slice(name.length + 1) : fallback;
};
const flag = (name) => argv.includes(name);

const root = arg("--root", DEFAULT_ROOT);
const engines = join(root, "quant", "engines");
const SymbolMapping = require(join(engines, "symbol-mapping.js"));
const MarketStore = require(join(engines, "market-store.js"));
const DisplayPolicy = require(join(engines, "display-policy.js"));
const TradingSession = require(join(engines, "realtime", "trading-session.js"));
const Snapshot = require(join(engines, "realtime", "intraday-snapshot.js"));
const Freshness = require(join(engines, "realtime", "freshness.js"));
const Tiingo = require(join(root, "providers", "tiingo", "adapter.js"));

const CALENDAR = JSON.parse(readFileSync(join(root, "quant", "config", "market-calendar.json"), "utf8"));
const GATE_CONFIG = JSON.parse(readFileSync(join(root, "quant", "config", "feature-gates.json"), "utf8"));
const config = loadPreviewConfig(root);
const INTRADAY = config.intraday || {};
const DRY_RUN = flag("--dry-run");
let SCOPE = arg("--scope", "discover");
const SCOPE_ARG = SCOPE;
/* Ab welchem Anteil des Umfangs gilt eine Sitzung als "fuer das Universum
   geholt"? Rund ein Viertel der Titel liefert keine regulaeren Bars
   (noRegularBars) und bekommt keinen Snapshot; 50 % ist deshalb die
   Grenze zwischen "Universumslauf war da" und "nur Discover-Umfang". */
const UNIVERSE_COVERAGE = 0.5;
const UNIVERSE_ID = arg("--universe", "US_REAL");
const SESSION_ARG = arg("--session", "auto");
const INTERVAL = arg("--interval", INTRADAY.interval || "5min");
const EXTENDED = INTRADAY.extendedHours !== false && !flag("--no-extended");
const MAX_REQUESTS = parseInt(arg("--max-requests", String(INTRADAY.maxRequestsPerRun || 5000)), 10);
const CONCURRENCY = parseInt(arg("--concurrency", "4"), 10);
const REFRESH_MINUTES = INTRADAY.refreshMinutes || 10;
const RETENTION = INTRADAY.retentionSessions || 2;
const NOW = arg("--now", null) ? new Date(arg("--now")) : new Date();

export const INTRADAY_DIR = join("quant", "data", "market", "intraday");
const OUT_DIR = join(root, INTRADAY_DIR);

console.log("Vision Universe — Intraday-Snapshots\n");

/* ------------------------------------------------------------ Gates */
const gates = DisplayPolicy.gatesFromConfig(GATE_CONFIG);
Object.keys(DisplayPolicy.GATES).forEach((name) => {
  /* Die Umgebung darf nur zusaetzlich abschalten, nie freischalten. */
  if (process.env[name] !== undefined) gates[name] = gates[name] && String(process.env[name]).toLowerCase() === "true";
});
if (INTRADAY.enabled === false) {
  console.log("  intraday.enabled ist false (development-preview.json). Es wird nichts abgerufen.");
  process.exit(0);
}
const resolvedScope = resolveScope(root, config);
DisplayPolicy.declareFromConfig(expandPreviewConfig(config, resolvedScope));

const intern = DisplayPolicy.check({ providerId: "tiingo", dataClass: "intraday", audience: "internal", form: "raw", gates });
if (!intern.allowed) {
  console.error(`  ABBRUCH: ${intern.message}`);
  process.exit(1);
}
const oeffentlich = DisplayPolicy.check({ providerId: "tiingo", dataClass: "intraday", audience: "public", form: "raw", gates });
console.log(`  Veroeffentlichung: ${oeffentlich.allowed ? "freigegeben - " + oeffentlich.basis : "NICHT freigegeben (" + oeffentlich.message + ")"}`);

/* ---------------------------------------------------------- Sitzung */
const lage = TradingSession.resolve(NOW, { calendar: CALENDAR });
const session = SESSION_ARG === "auto" ? lage.displaySession : TradingSession.sessionFor(SESSION_ARG, { calendar: CALENDAR });
if (!session) { console.error("  Keine Sitzung bestimmbar."); process.exit(1); }
console.log(`  Jetzt: ${lage.now} = ${lage.localDate} ${lage.localTime} New York · ${lage.marketState}`);
console.log(`  Sitzung: ${session.sessionDate} (${session.kind || "explizit"}, ${session.openLocal}–${session.closeLocal}` +
            `${session.earlyClose ? ", verkuerzt" : ""}, ${session.isComplete ? "abgeschlossen" : session.isRunning ? "laeuft" : "noch nicht begonnen"})`);
if (session.kind === "current" && !session.hasStarted) {
  console.log("  Die Sitzung hat noch nicht begonnen - nichts zu holen.");
  process.exit(0);
}

/* ------------------------------------------------------------ Umfang */
const byTicker = new Map(resolvedScope.securities.map((s) => [s.ticker, s]));
function sessionCoverage(date) {
  const dir = join(OUT_DIR, date);
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((n) => n.endsWith(".json")).length / Math.max(1, resolvedScope.securities.length);
}
if (SCOPE === "auto") {
  if (lage.marketState === "OPEN") {
    SCOPE = "discover";
    console.log("  Umfang auto: Boerse offen -> discover");
  } else {
    const deckung = sessionCoverage(session.sessionDate);
    SCOPE = deckung < UNIVERSE_COVERAGE ? "universe" : "discover";
    console.log(`  Umfang auto: letzte Sitzung ${session.sessionDate} liegt fuer ${(deckung * 100).toFixed(0)} % des Universums vor -> ${SCOPE}`);
  }
}
let symbole;
let scopeLabel = SCOPE;
if (SCOPE === "universe") {
  symbole = resolvedScope.securities.map((s) => s.ticker);
} else if (SCOPE === "discover") {
  const file = join(root, "discover", "data", "live-scope", UNIVERSE_ID + ".json");
  if (!existsSync(file)) {
    console.error(`  ABBRUCH: ${file.replace(root + "/", "")} fehlt. Der Discover-Build schreibt die Titel der Flaechen dorthin.`);
    process.exit(1);
  }
  const ls = JSON.parse(readFileSync(file, "utf8"));
  symbole = (ls.symbols || []).filter((t) => byTicker.has(t));
  scopeLabel = "discover (" + file.replace(root + "/", "") + ")";
} else {
  symbole = SCOPE.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
  const unbekannt = symbole.filter((t) => !byTicker.has(t));
  if (unbekannt.length) { console.error(`  ABBRUCH: nicht im Umfang: ${unbekannt.join(", ")}`); process.exit(1); }
}
symbole = [...new Set(symbole)].sort();
console.log(`  Umfang: ${scopeLabel} - ${symbole.length} Titel · Intervall ${INTERVAL}${EXTENDED ? " + erweiterte Zeiten" : ""}`);
console.log(`  Budget: hoechstens ${MAX_REQUESTS} Anfragen, ${CONCURRENCY} gleichzeitig\n`);

/* ---------------------------------------------------- Was liegt schon? */
const sessionDir = join(OUT_DIR, session.sessionDate);
function readPublished(securityId) {
  const f = join(sessionDir, securityId + ".json");
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, "utf8")); } catch (e) { return null; }
}
const store = MarketStore.createMarketStore({ root, providerId: "tiingo" });
const seriesDir = join(root, "quant", "data", "market", "discover-series");
function previousCloseFor(securityId) {
  /* Der Tagesschluss VOR der Sitzung: aus der kompakten Discover-Reihe
     (veroeffentlicht) oder der Arbeitsablage. Ohne ihn bleibt das Feld
     null - die Startlinie ist dann der erste Punkt, nicht ein geratener. */
  const f = join(seriesDir, securityId + ".json");
  let punkte = null;
  if (existsSync(f)) {
    try { punkte = JSON.parse(readFileSync(f, "utf8")).points; } catch (e) { punkte = null; }
  }
  if (!punkte) {
    const w = store.readBars(securityId, "working");
    if (w && Array.isArray(w.bars)) punkte = w.bars.map((b) => [b.date, b.close]);
  }
  if (!punkte) return null;
  for (let i = punkte.length - 1; i >= 0; i--) if (punkte[i][0] < session.sessionDate) return punkte[i][1];
  return null;
}

/* ---------------------------------------------------------- Zugang */
const apiKey = process.env.TIINGO_API_KEY || null;
/* --index-only: nur das Verzeichnis aus den vorhandenen Snapshots neu
   schreiben - kein Abruf, kein Schluessel noetig. */
if (flag("--index-only")) {
  const idx = writeIndex();
  console.log(`  Verzeichnis neu geschrieben: ${idx.entryCount} Eintraege (Discover-Umfang), ` +
              Object.keys(idx.available).map((d) => d + ": " + idx.available[d].length + " Titel").join(", "));
  process.exit(0);
}
const bilanz = { requested: symbole.length, fetched: 0, written: 0, grown: 0, unchanged: 0,
                 skippedImmutable: 0, notPublishable: 0, failed: 0, requests: 0, reasons: {} };
const perSymbol = {};
const zaehle = (reason) => { bilanz.reasons[reason] = (bilanz.reasons[reason] || 0) + 1; };

if (!apiKey) {
  console.log("  Kein TIINGO_API_KEY gesetzt. Es wird nichts abgerufen und NICHT auf Demo-Daten zurueckgefallen.");
  if (!DRY_RUN) writeStatus({ configured: false, notice: "Kein Zugang. Keine Snapshots geholt." });
  process.exit(0);
}

const registry = SymbolMapping.createRegistry(symbole.map((t) => {
  const s = byTicker.get(t);
  return { securityId: s.securityId, providerId: Tiingo.PROVIDER_ID, providerSymbol: s.providerSymbol || t,
           ticker: t, exchange: s.exchange, mic: s.mic, currency: "USD", country: "US", confidence: "inferred",
           note: "Aus dem aufgeloesten Umfang abgeleitet." };
}));
const capabilities = Tiingo.commercialPlanCapabilities();
capabilities.limits = Object.assign({}, capabilities.limits, {
  requestsPerHour: Math.max(capabilities.limits.requestsPerHour, MAX_REQUESTS),
  requestsPerDay: Math.max(capabilities.limits.requestsPerDay, MAX_REQUESTS * 4),
  concurrency: CONCURRENCY
});
const provider = Tiingo.createTiingoProvider({
  apiKey, capabilities, symbolRegistry: registry,
  baseUrl: process.env.TIINGO_BASE_URL || undefined,
  fetchImpl: (url, init) => fetch(url, init)
});

/* ------------------------------------------------------------- Lauf */
const t0 = Date.now();
let abbruch = null;
const warteschlange = symbole.slice();

async function einer(ticker) {
  const s = byTicker.get(ticker);
  const id = s.securityId;
  const vorher = readPublished(id);
  if (vorher && vorher.regularComplete && vorher.isComplete && vorher.sessionDate === session.sessionDate) {
    bilanz.skippedImmutable++;
    perSymbol[ticker] = { ok: true, reason: "immutable", points: vorher.pointCount };
    return;
  }
  if (bilanz.requests >= MAX_REQUESTS) { abbruch = "budget"; perSymbol[ticker] = { ok: false, reason: "budget" }; return; }
  if (DRY_RUN) { perSymbol[ticker] = { ok: true, reason: "dryRun" }; return; }

  bilanz.requests++;
  const res = await provider.getIntradayBars(id, { interval: INTERVAL, from: session.sessionDate,
                                                   to: session.sessionDate, extendedHours: EXTENDED });
  if (!res.available) {
    bilanz.failed++; zaehle(res.reason || "requestFailed");
    perSymbol[ticker] = { ok: false, reason: res.reason, message: String(res.message || "").slice(0, 80) };
    if (res.reason === "rateLimited" || res.reason === "quotaExceeded") abbruch = res.reason;
    return;
  }
  bilanz.fetched++;
  const snap = Snapshot.build({
    security: { securityId: id, ticker }, bars: res.data.bars, session, now: NOW,
    marketState: lage.marketState, provider: Tiingo.PROVIDER_ID, venue: "IEX", interval: INTERVAL,
    previousClose: previousCloseFor(id), permission: oeffentlich.allowed ? oeffentlich : null,
    delayMinutes: REFRESH_MINUTES
  });
  if (!snap.publishable) {
    bilanz.notPublishable++; zaehle("noRegularBars");
    perSymbol[ticker] = { ok: true, reason: "noRegularBars", bars: res.data.bars.length, discarded: snap.discardedBars };
    return;
  }
  const pruefung = Snapshot.validate(snap);
  if (!pruefung.ok) {
    bilanz.notPublishable++; zaehle("invalid:" + pruefung.findings[0]);
    perSymbol[ticker] = { ok: false, reason: "invalid", findings: pruefung.findings.slice(0, 3) };
    return;
  }
  const m = Snapshot.merge(vorher, snap);
  if (m.chosen === vorher) { bilanz.unchanged++; perSymbol[ticker] = { ok: true, reason: m.reason, points: vorher.pointCount }; return; }
  /* Gleiche Punkte, nur neuer Abrufzeitpunkt: nichts neu schreiben - ein
     Commit ohne neue Kurse waere Rauschen in der Historie. */
  if (m.reason === "refreshed" && vorher && JSON.stringify(vorher.points) === JSON.stringify(snap.points) &&
      JSON.stringify(vorher.extended) === JSON.stringify(snap.extended) && vorher.regularComplete === snap.regularComplete) {
    bilanz.unchanged++; perSymbol[ticker] = { ok: true, reason: "unchanged", points: vorher.pointCount }; return;
  }
  mkdirSync(sessionDir, { recursive: true });
  writeFileSync(join(sessionDir, id + ".json"), JSON.stringify(m.chosen));
  bilanz.written++;
  if (m.reason === "grown") bilanz.grown++;
  perSymbol[ticker] = { ok: true, reason: m.reason, points: m.chosen.pointCount, asOfLocal: m.chosen.asOfLocal };
}

async function arbeiter() {
  while (warteschlange.length && !abbruch) {
    const t = warteschlange.shift();
    try { await einer(t); }
    catch (err) { bilanz.failed++; zaehle("exception"); perSymbol[t] = { ok: false, reason: "exception", message: String(err.message).slice(0, 80) }; }
  }
}
await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, arbeiter));
if (abbruch === "budget") { for (const t of warteschlange) perSymbol[t] = { ok: false, reason: "budget" }; }

/* --------------------------------------------------------- Aufraeumen */
if (!DRY_RUN && existsSync(OUT_DIR)) {
  const sitzungen = readdirSync(OUT_DIR).filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n)).sort();
  const behalten = sitzungen.slice(-RETENTION);
  /* Die juengste Sitzung, die fuer das ganze Universum vorliegt, bleibt -
     auch wenn zwei neuere Sitzungen nur den Discover-Umfang tragen. Sonst
     verloere jede Aktienseite ausserhalb der Flaechen ihr 1T, bis der
     naechste Universumslauf kommt. */
  const universumsSitzungen = sitzungen.filter((d) => sessionCoverage(d) >= UNIVERSE_COVERAGE);
  const juengsteUniversum = universumsSitzungen[universumsSitzungen.length - 1];
  if (juengsteUniversum && !behalten.includes(juengsteUniversum)) behalten.push(juengsteUniversum);
  for (const alt of sitzungen) {
    if (behalten.includes(alt)) continue;
    rmSync(join(OUT_DIR, alt), { recursive: true, force: true });
    console.log(`  entfernt: ${INTRADAY_DIR}/${alt} (aelter als ${RETENTION} Sitzungen)`);
  }
}

/* --------------------------------------------------------- Verzeichnis */
function writeIndex() {
  const sitzungen = existsSync(OUT_DIR)
    ? readdirSync(OUT_DIR).filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n)).sort() : [];
  /* Snapshots von Titeln, die nicht (mehr) im Umfang stehen (Wechsel der
     Universumsquelle, ausgeschlossene Papiere), verschwinden - der Guard
     wuerde sie sonst zu Recht als Leck melden. */
  const imUmfang = new Set(resolvedScope.securities.map((s) => s.securityId + ".json"));
  for (const date of sitzungen) {
    for (const name of readdirSync(join(OUT_DIR, date)).filter((n) => n.endsWith(".json"))) {
      if (!imUmfang.has(name)) { rmSync(join(OUT_DIR, date, name)); console.log(`  entfernt: ${INTRADAY_DIR}/${date}/${name} (nicht im Umfang)`); }
    }
  }
  const sessions = {};
  const entries = {};
  /* Der Client braucht: welche Titel haben fuer welche Sitzung einen
     Snapshot - fuer den Discover-Umfang je Titel der juengste. Das
     ganze Universum steht nur in den Zaehlungen; die Aktienseite holt
     ihren Snapshot ueber den Pfad (Sitzung + securityId) direkt. */
  const discoverFile = join(root, "discover", "data", "live-scope", UNIVERSE_ID + ".json");
  const discoverSymbole = new Set(existsSync(discoverFile) ? (JSON.parse(readFileSync(discoverFile, "utf8")).symbols || []) : []);
  /* Das ganze Universum steht nur als Liste von Kuerzeln je Sitzung im
     Verzeichnis (available) - ein Eintrag mit Metadaten je Titel waere bei
     4.000+ Snapshots fast ein Megabyte, das jede Seite laden muesste. Die
     Aktienseite baut den Pfad aus Sitzung und Kuerzel (idPattern), die
     Ausnahmen stehen daneben. */
  const available = {}, idExceptions = {};
  const explizit = SCOPE !== "discover" && SCOPE !== "universe" ? new Set(symbole) : new Set();
  for (const date of sitzungen) {
    const dateien = readdirSync(join(OUT_DIR, date)).filter((n) => n.endsWith(".json"));
    let complete = 0;
    available[date] = [];
    for (const name of dateien) {
      let snap; try { snap = JSON.parse(readFileSync(join(OUT_DIR, date, name), "utf8")); } catch (e) { continue; }
      if (snap.regularComplete) complete++;
      const sym = snap.symbol;
      available[date].push(sym);
      if (snap.securityId !== "ref_" + sym) idExceptions[sym] = snap.securityId;
      if (discoverSymbole.has(sym) || explizit.has(sym)) {
        const alt = entries[sym];
        if (!alt || alt.sessionDate < date) {
          entries[sym] = { securityId: snap.securityId, sessionDate: date, asOf: snap.asOf, asOfLocal: snap.asOfLocal,
                           points: snap.pointCount, regularComplete: !!snap.regularComplete,
                           path: "/" + INTRADAY_DIR + "/" + date + "/" + snap.securityId + ".json" };
        }
      }
    }
    sessions[date] = { count: dateien.length, regularComplete: complete };
    available[date].sort();
  }
  /* Frische je Eintrag (Discover-Umfang) und der Datenstand des ganzen
     Verzeichnisses: die juengste Sitzung mit Snapshots, ihr spaetester
     Stand, und ob sie fuer das Universum vorliegt. Der Client (Statuszeile)
     und der Health-Check lesen das, statt es zu erraten. */
  const befunde = Object.keys(entries).map((sym) => {
    const e = entries[sym];
    return Freshness.assess({ resolution: lage, series: { symbol: sym, securityId: e.securityId, sessionDate: e.sessionDate,
                                                          asOf: e.asOf, asOfLocal: e.asOfLocal, regularComplete: e.regularComplete },
                              kind: "intraday", now: NOW, calendar: CALENDAR, options: { refreshMinutes: REFRESH_MINUTES } });
  });
  befunde.forEach((b) => { entries[b.symbol].freshnessState = b.freshnessState; });
  const zusammenfassung = Freshness.summarize(befunde);
  const universeSessions = sitzungen.filter((d) => sessionCoverage(d) >= UNIVERSE_COVERAGE);
  const neueste = sitzungen[sitzungen.length - 1] || null;
  let dataSession = null;
  if (neueste) {
    let asOfMax = null, asOfLocalMax = null, komplett = 0, gesamt = 0;
    for (const name of readdirSync(join(OUT_DIR, neueste)).filter((n) => n.endsWith(".json"))) {
      let snap; try { snap = JSON.parse(readFileSync(join(OUT_DIR, neueste, name), "utf8")); } catch (e) { continue; }
      gesamt++;
      if (snap.regularComplete) komplett++;
      if (snap.asOf && (!asOfMax || snap.asOf > asOfMax)) { asOfMax = snap.asOf; asOfLocalMax = snap.asOfLocal; }
    }
    dataSession = { sessionDate: neueste, asOf: asOfMax, asOfLocal: asOfLocalMax,
                    regularComplete: gesamt > 0 && komplett === gesamt, snapshots: gesamt,
                    universe: universeSessions.includes(neueste) };
  }
  const last = lage.lastCompletedSession;
  const index = {
    schemaVersion: "intraday-index-1.1.0",
    generatedAt: new Date().toISOString(),
    provider: "tiingo", venue: "IEX", interval: INTERVAL,
    refreshMinutes: REFRESH_MINUTES,
    marketStateAtRun: lage.marketState,
    localTimeAtRun: lage.localDate + " " + lage.localTime,
    displaySession: { sessionDate: session.sessionDate, kind: session.kind || "explicit",
                      isRunning: !!session.isRunning, isComplete: !!session.isComplete },
    lastCompletedSession: last ? { sessionDate: last.sessionDate, close: last.close, closeLocal: last.closeLocal } : null,
    dataSession,
    universeSessions,
    universeCoverageThreshold: UNIVERSE_COVERAGE,
    freshness: { contractVersion: Freshness.CONTRACT_VERSION, checkedAt: new Date(NOW).toISOString(),
                 byState: zusammenfassung.byState, byReason: zusammenfassung.byReason,
                 stale: zusammenfassung.stale.slice(0, 50) },
    sessions,
    pathPattern: "/" + INTRADAY_DIR + "/<sessionDate>/<securityId>.json",
    idPattern: "ref_<symbol>",
    idExceptions,
    entryCount: Object.keys(entries).length,
    entries,
    available,
    note: "Verzeichnis der Intraday-Snapshots. entries: Discover-Umfang, je Titel die juengste Sitzung mit Stand und Frische " +
          "(freshness.js). available: alle Kuerzel mit Snapshot je Sitzung; der Pfad folgt pathPattern + idPattern (idExceptions). " +
          "dataSession: die juengste Sitzung mit Snapshots; lastCompletedSession: was zum Zeitpunkt des Laufs gelten muesste."
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "index.json"), JSON.stringify(index));
  return index;
}

function writeStatus(extra) {
  const stats = provider ? provider.stats() : null;
  const quota = provider ? provider.quota() : null;
  const status = Object.assign({
    generatedAt: new Date().toISOString(), provider: "tiingo", interval: INTERVAL, extendedHours: EXTENDED,
    scope: scopeLabel, scopeArg: SCOPE_ARG, universeId: UNIVERSE_ID,
    session: { sessionDate: session.sessionDate, kind: session.kind || "explicit", isRunning: !!session.isRunning,
               isComplete: !!session.isComplete, earlyClose: !!session.earlyClose },
    marketStateAtRun: lage.marketState, localTimeAtRun: lage.localDate + " " + lage.localTime,
    gates: { ENABLE_LIVE_MARKET_DATA: gates.ENABLE_LIVE_MARKET_DATA === true,
             ENABLE_PUBLIC_LIVE_MARKET_DATA: gates.ENABLE_PUBLIC_LIVE_MARKET_DATA === true },
    publicDisplay: { allowed: oeffentlich.allowed, basis: oeffentlich.basis, reason: oeffentlich.reason },
    summary: Object.assign({}, bilanz, { stopped: abbruch, runtimeMs: Date.now() - t0,
      providerRequests: stats ? stats.requests : null, retries: stats ? stats.retries : null }),
    quota: quota ? { hourUsed: quota.hourUsed, hourLimit: quota.hourLimit, dayUsed: quota.dayUsed, dayLimit: quota.dayLimit } : null,
    perSymbol,
    note: "Bilanz des Intraday-Laufs. Keine Kurse - nur Zaehlungen und Gruende."
  }, extra || {});
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "status.json"), JSON.stringify(status, null, 2));
  return status;
}

if (!DRY_RUN) { const idx = writeIndex(); console.log(`  Verzeichnis: ${idx.entryCount} Eintraege, Sitzungen ${Object.keys(idx.sessions).join(", ")}`); writeStatus(); }

console.log("\n  Ergebnis:");
console.log(`    abgerufen ${bilanz.fetched} · geschrieben ${bilanz.written} (gewachsen ${bilanz.grown}) · unveraendert ${bilanz.unchanged}`);
console.log(`    unveraenderlich uebersprungen ${bilanz.skippedImmutable} · ohne regulaere Bars ${bilanz.notPublishable} · fehlgeschlagen ${bilanz.failed}`);
console.log(`    Anfragen ${bilanz.requests}${abbruch ? " · ABBRUCH: " + abbruch : ""} · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (Object.keys(bilanz.reasons).length) console.log(`    Gruende: ${JSON.stringify(bilanz.reasons)}`);
if (DRY_RUN) console.log("\n  Probelauf - nichts abgerufen, nichts geschrieben.");
