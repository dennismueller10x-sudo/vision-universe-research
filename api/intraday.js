/* =========================================================================
   VISION UNIVERSE — api/intraday.js

   INTRADAY-BARS, SERVERSEITIG GEHOLT - FUER JEDE BERECHTIGTE US-AKTIE.

     Browser --HTTPS--> diese Funktion --HTTPS--> api.tiingo.com/iex/...

   Der Zugangsschluessel bleibt hier. Was den Browser erreicht, sind Bars.

   KEINE TICKERLISTE IM CODE

   Frueher stand hier eine Freigabeliste mit fuenf Namen. Das war richtig,
   solange nur fuenf Titel ueberhaupt angezeigt werden durften - und es
   waere jetzt falsch: das bereinigte Produktuniversum umfasst 7.004
   Titel, und jeder davon soll sich oeffnen lassen. Die Grenze kommt
   deshalb aus dem Eignungslauf (api/_scope.js), nicht aus einer Konstante
   in dieser Datei.

   ZUSTAENDE, DIE AUSEINANDERGEHALTEN GEHOEREN

     INTRADAY_AVAILABLE     Bars sind da
     INTRADAY_UNAVAILABLE   der Anbieter hat fuer dieses Symbol keine
     PROVIDER_UNAVAILABLE   der Anbieter hat abgelehnt oder geschwiegen
     NOT_ELIGIBLE           ausgeschlossenes Papier (Warrant, Unit, ...)
     SYMBOL_NOT_SUPPORTED   nicht im Produktuniversum
     NOT_CONFIGURED         kein Schluessel in dieser Umgebung

   "Keine Bars" ist KEIN Fehler: ausserhalb der Handelszeiten, bei einem
   jungen Boersengang oder einem duennen Titel ist es die Wahrheit. Der
   Marktzustand steht deshalb in jeder Antwort daneben - wer beides
   verwechselt, meldet Wochenende als Stoerung.
   ========================================================================= */
"use strict";

const Scope = require("./_scope.js");

const BASIS = "https://api.tiingo.com/iex";
const ERLAUBTE_FREQUENZEN = ["1min", "5min", "15min", "30min", "1hour"];

function antwort(res, status, koerper) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.end(JSON.stringify(koerper));
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const scope = Scope.scope() || {};
  const regeln = scope.intraday || {};
  const sitzung = Scope.sitzung();

  const pruefung = Scope.pruefe(url.searchParams.get("ticker"));
  const gemeinsam = { ticker: pruefung.ticker, marketStatus: sitzung.marketStatus, session: sitzung };

  if (pruefung.state !== "SUPPORTED") {
    /* Jeder dieser Zustaende ist eine Auskunft, keine Stoerung - ausser
       SCOPE_UNREADABLE, und genau deshalb steht dort eine Abhilfe. */
    return antwort(res, pruefung.state === "INVALID_IDENTITY" ? 400 : 200,
      Object.assign({ state: pruefung.state, reason: pruefung.reason }, gemeinsam, {
        instrumentClass: pruefung.instrumentClass || null,
        remedy: pruefung.remedy || null,
        productUniverse: pruefung.universeSize || null
      }));
  }

  if (regeln.enabled === false) {
    return antwort(res, 200, Object.assign({
      state: "INTRADAY_UNAVAILABLE",
      reason: "Intraday ist in dieser Vorschau ausgeschaltet (quant/config/realtime-preview-scope.json)."
    }, gemeinsam));
  }

  const freq = String(url.searchParams.get("freq") || regeln.resampleFreq || "5min");
  if (!ERLAUBTE_FREQUENZEN.includes(freq)) {
    return antwort(res, 400, Object.assign({ state: "INVALID_FREQUENCY", allowed: ERLAUBTE_FREQUENZEN }, gemeinsam));
  }
  const grenze = Number(regeln.maxDays) || 5;
  const tage = Math.min(grenze, Math.max(1, parseInt(url.searchParams.get("days") || "2", 10) || 2));

  const key = Scope.schluessel();
  if (!key) {
    return antwort(res, 200, Object.assign({
      state: "NOT_CONFIGURED",
      reason: "TIINGO_API_KEY ist in dieser Umgebung nicht gesetzt.",
      remedy: "Vercel → Projekt → Settings → Environment Variables → TIINGO_API_KEY (Scope: Preview), danach neu bauen."
    }, gemeinsam));
  }

  const start = new Date(Date.now() - tage * 86400000).toISOString().slice(0, 10);
  const ziel = `${BASIS}/${encodeURIComponent(pruefung.ticker)}/prices` +
               `?startDate=${start}&resampleFreq=${encodeURIComponent(freq)}&columns=open,high,low,close,volume`;

  const ctl = new AbortController();
  const uhr = setTimeout(() => ctl.abort(), 12000);
  const begonnen = Date.now();
  try {
    const anbieter = await fetch(ziel, {
      signal: ctl.signal,
      headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" }
    });
    if (!anbieter.ok) {
      /* 404 heisst bei diesem Anbieter "fuer dieses Symbol nichts", nicht
         "kaputt". Der Unterschied gehoert in die Antwort. */
      const text = await anbieter.text().catch(() => "");
      return antwort(res, 200, Object.assign({
        state: anbieter.status === 404 ? "INTRADAY_UNAVAILABLE" : "PROVIDER_UNAVAILABLE",
        providerStatus: anbieter.status,
        reason: anbieter.status === 404
          ? "Der Anbieter fuehrt fuer dieses Symbol keine Intraday-Serie."
          : "Der Anbieter hat den Abruf abgelehnt.",
        providerMessage: String(text || "").slice(0, 200) || null
      }, gemeinsam));
    }
    const roh = await anbieter.json();
    const bars = (Array.isArray(roh) ? roh : [])
      .map((b) => ({
        date: typeof b.date === "string" ? b.date : null,
        open: zahl(b.open), high: zahl(b.high), low: zahl(b.low),
        close: zahl(b.close), volume: zahl(b.volume)
      }))
      .filter((b) => b.date && b.close !== null);

    return antwort(res, 200, Object.assign({
      state: bars.length ? "INTRADAY_AVAILABLE" : "INTRADAY_UNAVAILABLE",
      eligibility: pruefung.eligibility,
      freq, bars,
      barCount: bars.length,
      first: bars.length ? bars[0].date : null,
      last: bars.length ? bars[bars.length - 1].date : null,
      source: "tiingo/iex",
      fetchedAt: new Date().toISOString(),
      fetchMs: Date.now() - begonnen,
      priceTypeConfirmed: false,
      reason: bars.length ? null
        : (sitzung.marketStatus === "CLOSED"
            ? "Der Anbieter hat fuer dieses Fenster keine Bars geliefert. Die Boerse ist geschlossen."
            : "Der Anbieter hat fuer dieses Fenster keine Bars geliefert.")
    }, gemeinsam));
  } catch (err) {
    return antwort(res, 200, Object.assign({
      state: "PROVIDER_UNAVAILABLE",
      reason: (err && err.name) === "AbortError" ? "Zeitueberschreitung beim Anbieter." : "Abruf gescheitert."
    }, gemeinsam));
  } finally { clearTimeout(uhr); }
};

function zahl(v) { return typeof v === "number" && Number.isFinite(v) ? v : null; }

module.exports.config = { maxDuration: 20 };
