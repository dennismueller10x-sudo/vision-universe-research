/* =========================================================================
   VISION UNIVERSE — api/_scope.js

   DIE GEMEINSAME GRENZE BEIDER SERVERFUNKTIONEN.

   Der fuehrende Unterstrich ist Absicht: Vercel macht aus Dateien in
   /api Endpunkte, ausser aus denen, die so beginnen. Dies ist kein
   Endpunkt, sondern das, was beide benutzen - damit die Frage "darf
   dieses Symbol?" genau EINMAL beantwortet wird und nicht zweimal
   verschieden.

   WAS HIER NICHT ENTSCHIEDEN WIRD

   Die Eignung. Sie stammt aus dem Eignungslauf und wird ueber das
   Symbolverzeichnis gelesen (quant/data/market/realtime/product-symbols.json,
   erzeugt aus quant/data/market/security-master/eligibility.json). Dieser
   Workstream rechnet sie nicht nach und veraendert sie nicht.

   VIER ZUSTAENDE, DIE MAN NICHT VERWECHSELN DARF

     SUPPORTED             im Produktuniversum, Abruf erlaubt
     NOT_ELIGIBLE          bekannt, aber ausdruecklich ausgeschlossen
                           (Warrant, Unit, Right, Testpapier, ETF)
     SYMBOL_NOT_SUPPORTED  dem Produktuniversum unbekannt
     SCOPE_UNREADABLE      das Verzeichnis fehlt zur Laufzeit

   Die letzten beiden sind verschiedene Dinge: das eine ist eine Auskunft
   ueber ein Symbol, das andere ein Einrichtungsfehler. Sie als dasselbe
   zu melden hiesse, einen Betriebsfehler als Produktaussage auszugeben.
   ========================================================================= */
"use strict";

const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const MarketHours = require("../quant/engines/realtime/market-hours.js");

/* Einmal je warmer Instanz gelesen, nicht je Aufruf: das Verzeichnis
   aendert sich nur mit einer neuen Auslieferung. */
let verzeichnisCache = null;
let scopeCache = null;
let kalenderCache = null;

function lies(pfad) {
  try { return JSON.parse(readFileSync(join(process.cwd(), pfad), "utf8")); }
  catch (e) { return null; }
}

function scope() {
  if (scopeCache === null) scopeCache = lies("quant/config/realtime-preview-scope.json") || false;
  return scopeCache || null;
}

function verzeichnis() {
  if (verzeichnisCache === null) {
    const v = lies("quant/data/market/realtime/product-symbols.json");
    if (!v || !v.symbols) { verzeichnisCache = false; return null; }
    /* Mengen statt Listen: 7.004 Eintraege einmal indizieren, danach
       kostet jede Frage nichts. */
    const mengen = {};
    for (const klasse of Object.keys(v.symbols)) mengen[klasse] = new Set(v.symbols[klasse]);
    const ausgeschlossen = new Map();
    for (const art of Object.keys(v.excluded || {})) {
      for (const t of v.excluded[art]) ausgeschlossen.set(t, art);
    }
    verzeichnisCache = { roh: v, mengen, ausgeschlossen };
  }
  return verzeichnisCache || null;
}

/** Gueltige Tickerform - bevor irgendetwas nachgeschlagen wird. */
function normalisiere(roh) {
  const t = String(roh || "").toUpperCase().trim();
  return /^[A-Z0-9.-]{1,12}$/.test(t) ? t : null;
}

/**
 * Darf dieses Symbol? Antwortet mit einem der vier Zustaende und
 * begruendet jeden davon.
 */
function pruefe(rohTicker) {
  const ticker = normalisiere(rohTicker);
  if (!ticker) {
    return { state: "INVALID_IDENTITY", ticker: null,
             reason: "Kein gueltiger Ticker." };
  }
  const v = verzeichnis();
  if (!v) {
    return { state: "SCOPE_UNREADABLE", ticker,
             reason: "Das Symbolverzeichnis ist zur Laufzeit nicht lesbar.",
             remedy: "vercel.json → functions.includeFiles muss quant/data/market/realtime/** enthalten." };
  }
  const erlaubt = (scope() && scope().allowedEligibility) || ["ELIGIBLE", "SEPARATE_CLASS", "REVIEW"];
  for (const klasse of erlaubt) {
    if (v.mengen[klasse] && v.mengen[klasse].has(ticker)) {
      return { state: "SUPPORTED", ticker, eligibility: klasse,
               universeSize: v.roh.counts.productUniverse };
    }
  }
  if (v.ausgeschlossen.has(ticker)) {
    const art = v.ausgeschlossen.get(ticker);
    return {
      state: "NOT_ELIGIBLE", ticker, instrumentClass: art,
      reason: `Dieses Papier ist im Eignungslauf ausgeschlossen (${art}). Es wird nicht wie eine Aktie behandelt.`
    };
  }
  return {
    state: "SYMBOL_NOT_SUPPORTED", ticker,
    universeSize: v.roh.counts.productUniverse,
    reason: "Das Symbol gehoert nicht zum Produktuniversum dieser Vorschau."
  };
}

/** Der Zugangsschluessel - getrimmt, weil eingefuegte Werte oft einen
    Zeilenumbruch mitbringen. Er verlaesst diese Datei nur Richtung
    Anbieter. */
function schluessel() { return (process.env.TIINGO_API_KEY || "").trim(); }

/** Handelt die Boerse gerade? Aus der bestehenden Engine, nicht aus einer
    zweiten Rechnung mit festen UTC-Zeiten. */
function sitzung(when) {
  if (kalenderCache === null) kalenderCache = lies("quant/config/market-calendar.json") || false;
  const s = MarketHours.sessionAt(when || Date.now(),
    { calendar: kalenderCache || undefined, exchange: "XNYS" });
  return {
    phase: s.phase,
    isOpen: !!s.isOpen,
    isTradingDay: !!s.isTradingDay,
    closedReason: s.closedReason || null,
    localDate: s.localDate, localTime: s.localTime,
    expectsUpdates: MarketHours.expectsUpdates(s, true),
    calendarCoverage: !!s.calendarCoverage,
    marketStatus: s.phase === "REGULAR" ? "OPEN"
      : (s.phase === "PRE" || s.phase === "AFTER") ? "EXTENDED_HOURS" : "CLOSED"
  };
}

/**
 * Das Urteil ueber ein Messfenster - als reine Funktion, damit es
 * pruefbar ist, ohne auf einen Handelstag zu warten.
 *
 * Die eine Verwechslung, die hier nie passieren darf: Boerse geschlossen
 * ist kein kaputter Strom. Wer beides als Fehler meldet, schult den
 * Nutzer darauf, Warnungen zu ignorieren.
 */
function verdictFor(x) {
  if (!x || x.connected !== true) return "NOT_CONNECTED";
  if (x.updates > 0) return "TICKS_OBSERVED";
  if (x.expectsUpdates !== true) return "MARKET_CLOSED_NO_TICKS_EXPECTED";
  return "CONNECTED_NO_TICKS";
}

module.exports = { pruefe, normalisiere, schluessel, sitzung, scope, verzeichnis, verdictFor };
