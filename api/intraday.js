/* =========================================================================
   VISION UNIVERSE — api/intraday.js

   INTRADAY-BARS, SERVERSEITIG GEHOLT.

   Dieselbe Frage wie beim Echtzeitstrom, eine Stufe darunter: kann die
   geschuetzte Umgebung Intraday-Kurse holen, ohne den Zugangsschluessel
   in den Browser zu legen? Sie kann - hier steht der Weg.

     Browser --HTTPS--> diese Funktion --HTTPS--> api.tiingo.com/iex/...

   Die Faehigkeit selbst ist laufzeitgeprueft (intraday: VERIFIED,
   quant/data/market/commercial/capability-retest.json). Was fehlte, war
   nie der Abruf, sondern der Weg in die Anzeige ohne Schluesselleck.

   GRENZEN, DIE BLEIBEN

   1. Nur Titel mit datierter Anzeigefreigabe
      (quant/config/development-preview.json). Alles andere wird
      abgelehnt, mit Begruendung.
   2. Nur die geschuetzte Vorschau. Diese Funktion existiert auf GitHub
      Pages nicht - dort gibt es keine Serverseite.
   3. Nichts wird zwischengespeichert und nichts geschrieben: die Bars
      gehen in die Antwort und sonst nirgendwohin.
   ========================================================================= */
"use strict";

const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const BASIS = "https://api.tiingo.com/iex";
const ERLAUBTE_FREQUENZEN = ["1min", "5min", "15min", "30min", "1hour"];

function lies(pfad, fallback) {
  try { return JSON.parse(readFileSync(join(process.cwd(), pfad), "utf8")); }
  catch (e) { return fallback; }
}

/* Kommt null zurueck, ist die FREIGABEDATEI nicht lesbar - das ist etwas
   anderes als "dieser Titel ist nicht freigegeben". Beides zu vermischen
   hiesse, einen Einrichtungsfehler als Lizenzentscheidung auszugeben.
   Auf Vercel kommt die Datei ueber functions.includeFiles mit. */
function erlaubteTitel() {
  const freigabe = lies("quant/config/development-preview.json", null);
  if (!freigabe || !Array.isArray(freigabe.scope)) return null;
  return freigabe.scope;
}

function antwort(res, status, koerper) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.end(JSON.stringify(koerper));
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const ticker = String(url.searchParams.get("ticker") || "").toUpperCase().trim();
  const freq = String(url.searchParams.get("freq") || "5min");
  const tage = Math.min(5, Math.max(1, parseInt(url.searchParams.get("days") || "2", 10) || 2));

  const erlaubt = erlaubteTitel();
  if (!/^[A-Z0-9.-]{1,12}$/.test(ticker)) {
    return antwort(res, 400, { state: "INVALID_IDENTITY", reason: "Kein gueltiger Ticker." });
  }
  if (!erlaubt) {
    return antwort(res, 200, {
      state: "SCOPE_UNREADABLE", ticker,
      reason: "Die Freigabeliste (quant/config/development-preview.json) ist zur Laufzeit nicht lesbar.",
      remedy: "vercel.json → functions.includeFiles muss quant/config/** enthalten."
    });
  }
  if (!erlaubt.includes(ticker)) {
    return antwort(res, 200, {
      state: "NOT_PERMITTED", ticker, scope: erlaubt,
      reason: "Fuer diesen Titel liegt keine datierte Anzeigefreigabe vor.",
      note: "Die Freigabe steht in quant/config/development-preview.json und ist eine " +
            "Eigentuemerentscheidung, keine Programmgrenze."
    });
  }
  if (!ERLAUBTE_FREQUENZEN.includes(freq)) {
    return antwort(res, 400, { state: "INVALID_FREQUENCY", allowed: ERLAUBTE_FREQUENZEN });
  }

  const key = process.env.TIINGO_API_KEY || "";
  if (!key) {
    return antwort(res, 200, {
      state: "NOT_CONFIGURED", ticker,
      reason: "TIINGO_API_KEY ist in dieser Umgebung nicht gesetzt.",
      remedy: "Vercel → Projekt → Settings → Environment Variables → TIINGO_API_KEY (Scope: Preview)."
    });
  }

  const start = new Date(Date.now() - tage * 86400000).toISOString().slice(0, 10);
  const ziel = `${BASIS}/${encodeURIComponent(ticker)}/prices` +
               `?startDate=${start}&resampleFreq=${encodeURIComponent(freq)}&columns=open,high,low,close,volume`;

  const ctl = new AbortController();
  const uhr = setTimeout(() => ctl.abort(), 12000);
  try {
    const antwortDesAnbieters = await fetch(ziel, {
      signal: ctl.signal,
      headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" }
    });
    if (!antwortDesAnbieters.ok) {
      return antwort(res, 200, {
        state: "PROVIDER_REJECTED", ticker, status: antwortDesAnbieters.status,
        reason: "Der Anbieter hat den Abruf abgelehnt."
      });
    }
    const roh = await antwortDesAnbieters.json();
    const bars = (Array.isArray(roh) ? roh : [])
      .map((b) => ({
        date: typeof b.date === "string" ? b.date : null,
        open: zahl(b.open), high: zahl(b.high), low: zahl(b.low),
        close: zahl(b.close), volume: zahl(b.volume)
      }))
      .filter((b) => b.date && b.close !== null);

    return antwort(res, 200, {
      state: bars.length ? "AVAILABLE" : "EMPTY",
      ticker, freq, bars,
      first: bars.length ? bars[0].date : null,
      last: bars.length ? bars[bars.length - 1].date : null,
      source: "tiingo/iex",
      fetchedAt: new Date().toISOString(),
      priceTypeConfirmed: false,
      reason: bars.length ? null
        : "Der Anbieter hat fuer diesen Zeitraum keine Bars geliefert. Ausserhalb der " +
          "Handelszeiten ist das der Normalfall."
    });
  } catch (err) {
    return antwort(res, 200, {
      state: "FETCH_FAILED", ticker,
      reason: String((err && err.name) === "AbortError" ? "Zeitueberschreitung" : "Abruf gescheitert")
    });
  } finally { clearTimeout(uhr); }
};

function zahl(v) { return typeof v === "number" && Number.isFinite(v) ? v : null; }

module.exports.config = { maxDuration: 20 };
