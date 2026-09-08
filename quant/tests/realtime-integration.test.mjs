/* =========================================================================
   REALTIME §3, §5, §17, §18, §20 — DIE ZUSAGEN

   Was diese Datei prueft, sind keine Ablaeufe, sondern Versprechen:

     - "LIVE" steht nur da, wenn alle fuenf Bedingungen erfuellt sind
     - der Schluessel erreicht den Browser nicht
     - die oeffentliche Provenienz nennt keinen Anbieter ohne Erlaubnis
     - eine Tarifaenderung braucht keine Codeaenderung
     - technische Funktion ist keine Lizenzfreigabe

   Der Unterschied zu den anderen Testdateien: hier geht es nicht darum,
   dass etwas funktioniert, sondern darum, dass etwas NICHT passieren
   kann. Solche Tests altern gut - sie schlagen an, wenn jemand spaeter
   eine Abkuerzung nimmt.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, extname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createClock, buildFeed, negotiationFor, HANDEL, CALENDAR, THRESHOLDS } from "./realtime-fixtures.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const Tiingo = require("../../providers/tiingo/adapter.js");
const TiingoRealtime = require("../../providers/tiingo/realtime.js");
const Negotiation = require("../engines/realtime/capability-negotiation.js");
const DataStatus = require("../engines/realtime/data-status.js");
const Policy = require("../engines/display-policy.js");
const Provider = require("../engines/provider.js");
const Transport = require("../engines/realtime/transport.js");
const Capabilities = require("../engines/capabilities.js");

const GATES = JSON.parse(readFileSync(join(ROOT, "quant/config/feature-gates.json"), "utf8"));

/* ============================================ Tiingo: Faehigkeiten === */

test("I01 · Die Echtzeitfaehigkeiten von Tiingo stehen auf ungeprueft", () => {
  const caps = Tiingo.freePlanCapabilities();
  assert.equal(caps.sets.market.realtime, null,
    "Echtzeitkurse sind mit diesem Konto nicht nachgewiesen.");
  assert.equal(caps.sets.market.websocket, null,
    "Der IEX-Strom ist mit diesem Konto nicht nachgewiesen.");
  assert.equal(caps.sets.market.delayed, null);
  /* Was gemessen wurde, steht dagegen auf true - der Nachweis aus
     Phase 4A liegt im Baum. */
  assert.equal(caps.sets.market.intraday, true);
  assert.equal(caps.sets.market.historicalDaily, true);
});

test("I02 · Ohne Nachweisbericht bleibt alles Echtzeitbezogene ungeprueft", () => {
  const caps = Tiingo.freePlanCapabilities(undefined, null);
  assert.equal(caps.sets.market.realtime, null);
  assert.equal(caps.sets.market.websocket, null);
  assert.equal(caps.sets.market.intraday, null,
    "Ohne Bericht faellt auch Intraday auf ungeprueft zurueck.");
});

test("I03 · §20 — ein Echtzeitbericht schaltet den Pfad frei, ohne dass Code sich aendert", () => {
  /* Genau der Vorgang, der beim Tarifwechsel stattfaende: ein neuer
     Bericht kommt in den Baum, sonst nichts. */
  const bericht = {
    provider: "tiingo",
    generatedAt: "2026-09-08T14:00:00.000Z",
    run: { source: "github-actions", runId: "1", commit: "abc" },
    findings: [
      { capability: "realtimeQuote", result: "PASSED",
        evidence: { lagSeconds: 3 }, checkedAt: "2026-09-08T14:00:00.000Z" },
      { capability: "realtimeStream", result: "PASSED",
        evidence: { opened: true, parsedTicks: 1 }, checkedAt: "2026-09-08T14:00:00.000Z" }
    ]
  };
  const spec = Tiingo.applyRuntimeEvidence(
    { market: { realtime: null, websocket: null, historicalDaily: true, intraday: true } },
    bericht);
  const caps = Capabilities.declare("tiingo", spec);
  assert.equal(caps.sets.market.realtime, true);
  assert.equal(caps.sets.market.websocket, true);

  const n = Negotiation.negotiate({
    capabilities: caps, gates: { ENABLE_LIVE_MARKET_DATA: true }, providerId: "tiingo"
  });
  assert.equal(n.bestAvailable, "REALTIME_STREAM",
    "Die Fallback-Engine nimmt den besseren Pfad von selbst.");

  /* Und der Beleg traegt seine Herkunft mit. */
  assert.equal(caps.evidence.realtime.verificationLevel, "RUNTIME_VERIFIED");
  assert.equal(caps.evidence.realtime.source, "github-actions");
});

test("I04 · Ein FAILED-Befund widerlegt, ein ERROR-Befund nicht", () => {
  const abgelehnt = Capabilities.declare("tiingo", Tiingo.applyRuntimeEvidence(
    { market: { realtime: null } },
    { provider: "tiingo", findings: [{ capability: "realtimeQuote", result: "FAILED" }] }));
  assert.equal(abgelehnt.sets.market.realtime, false);

  const unveraendert = Capabilities.declare("tiingo", Tiingo.applyRuntimeEvidence(
    { market: { realtime: null } },
    { provider: "tiingo", findings: [{ capability: "realtimeQuote", result: "ERROR" }] }));
  assert.equal(unveraendert.sets.market.realtime, null);
});

/* ============================================== Tiingo: Transporte === */

test("I05 · Ohne uebergebenen Socket gibt es keinen Stromtransport", () => {
  const t = TiingoRealtime.createTiingoTransports({
    adapter: { getQuote: () => Promise.resolve({ available: false }),
               getIntradayBars: () => Promise.resolve({ available: false }),
               getDailyBars: () => Promise.resolve({ available: false }) },
    securityId: "AAPL"
  });
  assert.equal(t.REALTIME_STREAM.kind, "none");
  assert.equal(t.REALTIME_STREAM.reason, "transportUnavailable");
  assert.match(t.REALTIME_STREAM.message, /nicht auf Verdacht/);
});

test("I06 · Der Nachrichtenparser erfindet keinen Kurs", () => {
  const P = TiingoRealtime.parseIexMessage;
  assert.equal(P({ data: "kein json" }), null);
  assert.equal(P({ data: JSON.stringify({ messageType: "I" }) }), null);
  assert.equal(P({ data: JSON.stringify({ messageType: "A", data: ["Q", "t", "aapl", 1, 2] }) }), null,
    "Ein Geld-/Briefkurs ist kein ausgefuehrter Kurs.");
  assert.equal(P({ data: JSON.stringify({ messageType: "A", data: ["T", "t", "aapl"] }) }), null,
    "Ohne Kurs kein Tick.");
  const gut = P({ data: JSON.stringify({
    messageType: "A", data: ["T", "2026-09-08T13:30:00Z", "aapl", 0, 231.5, 100] }) });
  assert.equal(gut.tick.price, 231.5);
  assert.equal(gut.raw, null, "Die Rohnachricht wird nicht weitergereicht.");
});

test("I07 · Eine Kursabfrage ohne Kurs ergibt keinen Tick", () => {
  assert.equal(TiingoRealtime.quoteToTick(null, 0), null);
  assert.equal(TiingoRealtime.quoteToTick({ last: null }, 0), null);
  assert.equal(TiingoRealtime.quoteToTick({ last: NaN }, 0), null);
  const t = TiingoRealtime.quoteToTick({ last: 100, timestamp: "2026-09-08T18:00:00Z" }, 12345);
  assert.equal(t.price, 100);
  assert.equal(t.receivedAt, 12345, "Empfangszeit und Anbieterzeit bleiben getrennt.");
});

test("I08 · Die Abrufabstaende bleiben im Stundenkontingent des freien Zugangs", () => {
  const proStunde = 3600000 / TiingoRealtime.DEFAULT_INTERVALS.REALTIME_QUOTE;
  assert.ok(proStunde <= 60, "Ein Kursabruf oefter als jede Minute sprengt jedes Kontingent.");
  assert.ok(TiingoRealtime.DEFAULT_INTERVALS.INTRADAY >= 60000);
});

/* ====================================================== Das Etikett === */

function status(input) {
  return DataStatus.derive(Object.assign({
    negotiation: negotiationFor({ historicalDaily: true, intraday: true,
                                  realtime: true, websocket: true }),
    lastTimestamp: HANDEL
  }, input));
}

test("I09 · LIVE braucht alle fuenf Bedingungen", () => {
  const gut = {
    connection: { state: "LIVE", allowsLiveLabel: true },
    selection: { selected: "REALTIME_QUOTE", downgraded: false },
    staleness: { level: "FRESH" }
  };
  assert.equal(status(gut).code, "LIVE");

  /* 1. Verbindungszustand */
  assert.notEqual(status(Object.assign({}, gut, {
    connection: { state: "DEGRADED", allowsLiveLabel: false } })).code, "LIVE");
  /* 2. Datenklasse */
  assert.notEqual(status(Object.assign({}, gut, {
    selection: { selected: "INTRADAY" } })).code, "LIVE");
  /* 3. belegte Faehigkeit */
  assert.notEqual(status(Object.assign({}, gut, {
    negotiation: negotiationFor({ historicalDaily: true, realtime: null }) })).code, "LIVE");
  /* 4. frischer Stand */
  assert.notEqual(status(Object.assign({}, gut, {
    staleness: { level: "DEGRADED" } })).code, "LIVE");
  /* 5. kein Abstieg */
  assert.notEqual(status(Object.assign({}, gut, {
    selection: { selected: "REALTIME_QUOTE", downgraded: true,
                 downgradedFrom: "REALTIME_STREAM" } })).code, "LIVE");
});

test("I10 · Ein alter Kurs erscheint nie als LIVE — auch nicht bei gesunder Verbindung", () => {
  const s = status({
    connection: { state: "LIVE", allowsLiveLabel: true },
    selection: { selected: "REALTIME_QUOTE", downgraded: false },
    staleness: { level: "STALE" },
    lastTimestamp: HANDEL - 3600000
  });
  assert.equal(s.isLive, false);
  assert.equal(s.code, "DELAYED");
});

test("I11 · Die Etiketten entsprechen der Vorgabe aus §3", () => {
  const codes = Object.keys(DataStatus.STATUS);
  for (const noetig of ["LIVE", "INTRADAY", "DELAYED", "EOD", "UNAVAILABLE",
                        "RECONNECTING", "MARKET_CLOSED"]) {
    assert.ok(codes.includes(noetig), "Statuscode fehlt: " + noetig);
  }
  assert.equal(DataStatus.STATUS.LIVE.label, "LIVE");
  assert.equal(DataStatus.STATUS.DELAYED.label, "VERZÖGERT");
  assert.equal(DataStatus.STATUS.EOD.label, "LETZTER SCHLUSSKURS");
  assert.equal(DataStatus.STATUS.UNAVAILABLE.label, "MARKTDATEN DERZEIT NICHT VERFÜGBAR");
  assert.equal(DataStatus.STATUS.RECONNECTING.label, "VERBINDUNG WIRD WIEDERHERGESTELLT");
});

/* ===================================================== Provenienz === */

test("I12 · Die interne Provenienz ist vollstaendig, die oeffentliche zurueckhaltend", () => {
  const n = negotiationFor({ historicalDaily: true, intraday: true }, { providerId: "tiingo" });
  const eingabe = {
    negotiation: n,
    selection: { selected: "INTRADAY", preferred: "REALTIME_STREAM", ladder: [] },
    connection: { state: "FALLBACK_INTRADAY", fallbackReason: "reconnectExhausted", retryCount: 3 },
    staleness: { level: "DEGRADED", ageMs: 400000, session: { phase: "REGULAR" } },
    adjustmentStatus: "raw",
    lastTimestamp: HANDEL,
    status: { code: "INTRADAY", text: "INTRADAY · Stand 14:00" }
  };

  const intern = DataStatus.internalProvenance(eingabe);
  assert.equal(intern.provider, "tiingo");
  assert.equal(intern.fallbackReason, "reconnectExhausted");
  assert.equal(intern.retryCount, 3);

  const oeffentlichOhne = DataStatus.publicProvenance(eingabe, { allowed: false });
  assert.equal(oeffentlichOhne.provider, null,
    "Ohne Erlaubnis erscheint der Anbietername nicht.");
  assert.equal(oeffentlichOhne.providerDisclosure, "withheld");
  assert.equal(oeffentlichOhne.dataClass, "INTRADAY");
  assert.equal(oeffentlichOhne.delayed, true);
  assert.equal(/tiingo/i.test(JSON.stringify(oeffentlichOhne)), false);

  const oeffentlichMit = DataStatus.publicProvenance(eingabe, { allowed: true });
  assert.equal(oeffentlichMit.provider, "tiingo");
});

test("I13 · Es gibt keinen pauschalen Satz ueber synthetische Daten", () => {
  const n = negotiationFor({ historicalDaily: true }, { providerId: "tiingo" });
  const p = DataStatus.publicProvenance({
    negotiation: n, selection: { selected: "EOD" }, connection: {},
    staleness: { level: "FRESH" }, lastTimestamp: HANDEL
  }, { allowed: true });
  const text = JSON.stringify(p);
  assert.equal(/synthetisch|synthetic|mock/i.test(text), false);
});

/* ======================================================== Lizenzen === */

test("I14 · Die Gates stehen aus und tragen eine Begruendung mit Datum", () => {
  for (const name of ["ENABLE_LIVE_MARKET_DATA", "ENABLE_PUBLIC_LIVE_MARKET_DATA"]) {
    const gate = GATES.gates[name];
    assert.ok(gate, "Gate fehlt: " + name);
    assert.equal(gate.enabled, false, name + " darf in diesem Workstream nicht offen sein.");
    assert.ok(gate.reason && gate.reason.length > 20);
    assert.match(gate.changedAt, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test("I15 · Technische Funktion ist keine Lizenzfreigabe", () => {
  /* Alle Faehigkeiten belegt, beide Gates offen - und trotzdem darf
     oeffentlich nichts angezeigt werden, solange keine Erlaubnis
     eingetragen ist. */
  const n = Negotiation.negotiate({
    capabilities: Capabilities.declare("tiingo", { market: {
      historicalDaily: true, intraday: true, realtime: true, websocket: true } }),
    gates: { ENABLE_LIVE_MARKET_DATA: true, ENABLE_PUBLIC_LIVE_MARKET_DATA: true },
    audience: "public", providerId: "tiingo"
  });
  assert.equal(n.bestAvailable, "UNAVAILABLE");
  for (const dc of n.order) {
    assert.equal(n.classes[dc].state, "BLOCKED_BY_LICENSE", dc);
  }
});

test("I16 · Eine oeffentliche Erlaubnis ohne Grundlage wird abgelehnt", () => {
  assert.throws(() => Policy.declare("tiingo", "realtime", { publicRealtimeAllowed: true }),
    /Grundlage/);
  assert.throws(() => Policy.declare("tiingo", "realtime",
    { publicRealtimeAllowed: true, basis: "irgendwas" }), /Pruefdatum/);
});

/* ================================================ Schluesselsicherheit == */

const SKIP_DIRS = [".git", "node_modules", "__pycache__", ".venv", "venv"];
function walk(dir, extensions) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, extensions));
    else if (!extensions || extensions.includes(extname(full))) out.push(full);
  }
  return out;
}
const rel = (f) => relative(ROOT, f).split(sep).join("/");

test("I17 · Kein Realtime-Modul im Browser liest Umgebungsvariablen oder ruft einen Anbieter", () => {
  const dateien = [...walk(join(ROOT, "quant/engines/realtime"), [".js"]),
                   join(ROOT, "quant/ui/live-chart.js")];
  assert.ok(dateien.length >= 8, "Es sollten alle Realtime-Module geprueft werden.");
  for (const datei of dateien) {
    const text = readFileSync(datei, "utf8");
    assert.equal(/process\.env/.test(text), false, rel(datei) + " liest die Umgebung.");
    assert.equal(/api\.tiingo\.com|apiKey|API_KEY|Authorization/i.test(text), false,
      rel(datei) + " kennt Zugangsdaten oder eine Anbieteradresse.");
  }
});

test("I18 · Der Stromtransport baut keinen Socket selbst", () => {
  const text = readFileSync(join(ROOT, "quant/engines/realtime/transport.js"), "utf8");
  assert.equal(/new\s+WebSocket|new\s+global\w*\.WebSocket/.test(text), false,
    "transport.js darf keine Verbindung aus eigenem Antrieb oeffnen.");
});

test("I19 · Die Tiingo-Echtzeitdatei verweigert den Browser", () => {
  const text = readFileSync(join(ROOT, "providers/tiingo/realtime.js"), "utf8");
  assert.match(text, /typeof window !== "undefined"/);
  assert.match(text, /throw new Error/);
});

test("I20 · Kein Vendor-Feld verlaesst den Adapter", () => {
  const t = TiingoRealtime.quoteToTick({ last: 100, timestamp: "2026-09-08T18:00:00Z",
                                         volume: 5 }, 1);
  const leaks = Provider.findVendorLeakage(t);
  assert.deepEqual(leaks, [],
    "Der kanonische Tick traegt keinen Anbieternamen als Feldnamen.");
});

/* ================================================== Beobachtbarkeit === */

test("I21 · Die Diagnose nennt alles aus §24 und keinen Schluessel", async () => {
  const clock = createClock(HANDEL);
  const feed = buildFeed({
    negotiation: negotiationFor({ historicalDaily: true, intraday: true }),
    transports: { INTRADAY: Transport.createNullTransport({ dataClass: "INTRADAY",
                                                            reason: "transportUnavailable" }) },
    timers: clock.timers
  });
  feed.start();
  await clock.advance(10000);
  const d = feed.diagnostics();
  for (const feld of ["connectionState", "providerCapability", "lastRealtimeTimestamp",
                      "lastIntradayTimestamp", "lastEodTimestamp", "fallbackReason",
                      "retryCount", "lastError"]) {
    assert.ok(feld in d, "Diagnosefeld fehlt: " + feld);
  }
  const text = JSON.stringify(d);
  assert.equal(/token|apikey|api_key|authorization|secret/i.test(text), false);
});
