/* =========================================================================
   VISION UNIVERSE — api/history.js

   TAGESKURSE AUS DEM DAUERHAFTEN SPEICHER, SERVERSEITIG GEHOLT.

   Die dritte und letzte Stufe derselben Frage wie bei Intraday und
   Echtzeit: kann die geschuetzte Umgebung Kurse liefern, ohne ein
   Zugangsmittel in den Browser zu legen? Sie kann.

     Browser --HTTPS--> diese Funktion --SigV4--> Cloudflare R2

   Der Browser sieht NIE:
     - R2-Zugangsdaten          (sie stehen nur in der Serverumgebung)
     - die R2-Adresse           (er ruft /api/history auf, sonst nichts)
     - Tiingo-Zugangsdaten      (hier wird der Anbieter gar nicht gefragt)

   Dieser Weg fragt den Anbieter NICHT. Er liest, was der Backfill
   abgelegt hat: 7.802 Reihen unter v1/tiingo/daily/US/. Ein Aufruf
   kostet einen GET (Class B) und nichts sonst - kein Schreibvorgang,
   keine Anbieteranfrage, keine Zwischenablage.

   WAS AUSGELIEFERT WIRD, IST DAS MINIMUM

   Der Hauptchart der Einzeltitelseite zeichnet Schlusskurse. Genau die
   gehen hier hinaus: Datum und Schluss. Wer OHLC braucht - der
   Technical-Arbeitsplatz - fragt sie mit columns=ohlcv ausdruecklich an.
   Ein Endpunkt, der vorsorglich alles mitschickt, liefert bei 9.240
   Kerzen das Fuenffache ohne Anlass.

   WARUM DAS HIER UND NICHT AUF GITHUB PAGES STEHT

   Diese Datei ist eine Serverfunktion. Auf der oeffentlichen
   Auslieferung gibt es sie nicht - dort gibt es keine Serverseite. Die
   oeffentlichen Gates (ENABLE_PUBLIC_LIVE_MARKET_DATA) bleiben
   unangetastet; sie regeln die oeffentliche Auslieferung, und die
   bekommt von hier nichts.
   ========================================================================= */
"use strict";

const { createHistoryStore } = require("../quant/engines/history-store.js");
const Guard = require("../quant/engines/zero-cost-guard.js");
const Contract = require("../quant/engines/market-data-contract.js");

/* Der S3-Treiber ist ein ES-Modul, diese Funktion ist CommonJS. Der
   dynamische Import ueberbrueckt das und wird EINMAL je warmer Instanz
   bezahlt - deshalb steht das Versprechen im Modulraum, nicht im
   Handler. Den Treiber nachzubauen waere die schlechtere Wahl: die
   SigV4-Signatur ist geprueft, und zwei Fassungen derselben Regel sind
   eine Fehlerquelle. */
let treiberVersprechen = null;
function s3Treiber() {
  if (!treiberVersprechen) {
    treiberVersprechen = import("../scripts/market/storage/s3-driver.mjs")
      .then((m) => m.createS3DriverFromEnv());
  }
  return treiberVersprechen;
}

function antwort(res, status, koerper) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  /* Kursdaten gehoeren nicht in einen geteilten Zwischenspeicher. */
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader("X-Vision-Universe-Dataset", "DAILY_OHLCV_FROM_DURABLE_STORE");
  res.end(JSON.stringify(koerper));
}

function konfiguriert() {
  return Boolean((process.env.VU_HISTORY_S3_BUCKET || "").trim() &&
                 (process.env.VU_HISTORY_S3_ACCESS_KEY_ID || "").trim() &&
                 (process.env.VU_HISTORY_S3_SECRET_ACCESS_KEY || "").trim());
}

/* Ein Datum in der Form YYYY-MM-DD, oder null. Alles andere wird
   verworfen statt ausgelegt: ein missverstandener Stichtag schneidet
   still das falsche Fenster. */
function datum(v) {
  const s = String(v || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/* Zuschneiden VOR dem Umformen: bei MAX sind das 9.240 Kerzen, und jede
   Umformung, die danach wieder verworfen wird, ist Arbeit ohne Wirkung.

   Ausgelagert, damit ein Test die Nutzlast angreifen kann, ohne R2 zu
   brauchen. Was hier herausfaellt, ist die ganze Zusage "nur das
   Minimum": steht spaeter ein Feld mehr drin, faellt es hier auf. */
function schneideUndForme(bars, opt) {
  opt = opt || {};
  let liste = Array.isArray(bars) ? bars : [];
  if (opt.von) liste = liste.filter((b) => String(b.date).slice(0, 10) >= opt.von);
  if (opt.bis) liste = liste.filter((b) => String(b.date).slice(0, 10) <= opt.bis);
  return opt.spalten === "ohlcv"
    ? liste.map((b) => ({ date: b.date, open: b.open, high: b.high,
                          low: b.low, close: b.close, volume: b.volume }))
    : liste.map((b) => ({ date: b.date, close: b.close }));
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const ticker = String(url.searchParams.get("ticker") || "").toUpperCase().trim();
  const spalten = String(url.searchParams.get("columns") || "close").toLowerCase();
  const von = datum(url.searchParams.get("from"));
  const bis = datum(url.searchParams.get("to"));

  /* Dieselbe Tickerform wie ueberall sonst. Sie laesst Punkt und
     Bindestrich zu - BRK-B und BAC-P-E sind echte Ticker. */
  if (!/^[A-Z0-9.-]{1,12}$/.test(ticker)) {
    return antwort(res, 400, { state: "INVALID_IDENTITY", reason: "Kein gueltiger Ticker." });
  }
  if (spalten !== "close" && spalten !== "ohlcv") {
    return antwort(res, 400, { state: "INVALID_COLUMNS", allowed: ["close", "ohlcv"] });
  }
  if (!konfiguriert()) {
    return antwort(res, 200, {
      state: "NOT_CONFIGURED",
      contractState: Contract.resolveHistorical({ storeReachable: false }).state,
      ticker,
      reason: "Die Zugangsdaten des Historienspeichers sind in dieser Umgebung nicht gesetzt.",
      remedy: "Vercel → Projekt → Settings → Environment Variables → " +
              "VU_HISTORY_S3_ENDPOINT, VU_HISTORY_S3_BUCKET, VU_HISTORY_S3_REGION, " +
              "VU_HISTORY_S3_ACCESS_KEY_ID, VU_HISTORY_S3_SECRET_ACCESS_KEY (Scope: Preview)."
    });
  }

  try {
    /* Das Budget ist klein und ausdruecklich: ein Lesevorgang, kein
       Schreibvorgang. Ueberschreitet der Lauf es, wirft der Waechter -
       und das ist richtig: eine Funktion, die mehr liest als geplant,
       soll auffallen und nicht stillschweigend Kosten machen. */
    const budget = Guard.createBudget({ classAOperations: 0, classBOperations: 4 });
    const store = createHistoryStore({
      driver: await s3Treiber(), provider: "tiingo", market: "US", budget
    });

    const reihe = await store.getSeries(ticker);
    if (!reihe || !Array.isArray(reihe.bars) || !reihe.bars.length) {
      const zustand = Contract.resolveHistorical({ barCount: 0 });
      return antwort(res, 200, {
        state: "NOT_STORED",
        /* Der Vertragszustand daneben: jedes Frontend liest denselben
           Wortschatz, statt sich aus state und reason einen eigenen zu
           bauen. */
        contractState: zustand.state,
        ticker,
        reason: zustand.reason,
        note: "Das ist eine Aussage ueber den Speicher, nicht ueber den Titel: " +
              "es kann sein, dass der Anbieter fuer ihn nie eine Reihe gefuehrt hat."
      });
    }

    const schmal = schneideUndForme(reihe.bars, { spalten, von, bis });

    const zustand = Contract.resolveHistorical({ barCount: schmal.length });
    return antwort(res, 200, {
      state: schmal.length ? "AVAILABLE" : "EMPTY",
      contractState: zustand.state,
      ticker,
      columns: spalten,
      bars: schmal,
      barCount: schmal.length,
      first: schmal.length ? String(schmal[0].date).slice(0, 10) : null,
      last: schmal.length ? String(schmal[schmal.length - 1].date).slice(0, 10) : null,
      storedBars: reihe.bars.length,
      /* Wie die Reihe bereinigt ist, entscheidet ueber ihre Lesart.
         Fehlt die Angabe, steht das da - geraten wird nicht. */
      adjustmentStatus: (reihe.meta && reihe.meta.adjustmentStatus) || null,
      source: "durable-store/r2",
      providerRequests: 0,
      servedAt: new Date().toISOString(),
      reason: schmal.length ? null
        : "Im gewaehlten Fenster liegen keine Kerzen. Die Reihe selbst ist vorhanden."
    });
  } catch (err) {
    /* Die Meldung des Waechters ist eine Aussage und gehoert
       durchgereicht; alles andere wird zusammengefasst, damit keine
       Innerei nach aussen geht. */
    const blockiert = String((err && err.message) || "").includes(Guard.BLOCKED);
    /* Ein nicht erreichbarer Speicher ist PROVIDER_UNAVAILABLE und nicht
       HISTORICAL_UNAVAILABLE: die Reihe ist da, der Weg nicht. */
    return antwort(res, 200, {
      state: blockiert ? "BUDGET_BLOCKED" : "STORE_UNREACHABLE",
      contractState: Contract.resolveHistorical({ storeReachable: false }).state,
      ticker,
      reason: blockiert
        ? "Die Nullkostenschranke hat den Lesevorgang gestoppt."
        : "Der Historienspeicher hat nicht geantwortet."
    });
  }
};

module.exports.config = { maxDuration: 20 };
module.exports.schneideUndForme = schneideUndForme;
