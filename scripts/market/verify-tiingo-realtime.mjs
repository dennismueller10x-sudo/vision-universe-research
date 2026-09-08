/* =========================================================================
   VISION UNIVERSE — verify-tiingo-realtime.mjs   (§19, §28)

   Der Laufzeitnachweis fuer die Echtzeitpfade.

   Der Nachweis aus Phase 4A (verify-tiingo-runtime.mjs) hat gemessen, was
   sich an historischen Daten messen laesst: Historientiefe, Splits,
   Dividenden, Bereinigung, Intraday. Was er nicht messen konnte, ist die
   Frage dieses Workstreams:

     Liefert DIESES Konto Kurse von JETZT?

   Sie ist schwerer als sie klingt, weil ein Kursendpunkt, der antwortet,
   noch nichts beweist. Eine Antwort mit einem Kurs von vor fuenfzehn
   Minuten sieht genauso aus wie eine mit einem Kurs von vor drei
   Sekunden - der Unterschied steht im Zeitstempel, und nur der zaehlt.

   DESHALB DREI REGELN

   1. Gemessen wird der Abstand zwischen dem Zeitstempel des Anbieters und
      der Uhr dieses Laufs. Nichts anderes.

   2. Gemessen wird nur bei offener Boerse. Ein Kurs von Freitag 22:00 ist
      am Samstag fuenfzehn Stunden alt und trotzdem der richtige - daraus
      folgt weder "verzoegert" noch "Echtzeit". Ausserhalb der
      Handelszeiten lautet der Befund UNKNOWN, und das ist ein Ergebnis:
      es sagt, dass der Lauf zur falschen Zeit stattfand.

   3. Kein Kurs verlaesst diesen Lauf. Der Bericht enthaelt Abstaende in
      Sekunden, Anzahlen und Aussagen - keine Preise, keine Volumina,
      keinen Schluessel. Das Repository ist oeffentlich.

   Ausfuehren (nur mit Zugang, sinnvoll nur bei offener Boerse):
     TIINGO_API_KEY=... node scripts/market/verify-tiingo-realtime.mjs
     TIINGO_API_KEY=... node scripts/market/verify-tiingo-realtime.mjs --json
     TIINGO_API_KEY=... node scripts/market/verify-tiingo-realtime.mjs --with-stream
   ========================================================================= */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const engines = join(root, "quant", "engines");

const Tiingo = require(join(root, "providers", "tiingo", "adapter.js"));
const TiingoRealtime = require(join(root, "providers", "tiingo", "realtime.js"));
const MarketHours = require(join(engines, "realtime", "market-hours.js"));
const SessionPolicy = require(join(engines, "realtime", "session-policy.js"));

const AS_JSON = process.argv.includes("--json");
const WITH_STREAM = process.argv.includes("--with-stream");
const apiKey = process.env.TIINGO_API_KEY || null;
const OUT = join(root, "quant", "data", "market", "tiingo-realtime-verification.json");

const calendar = JSON.parse(readFileSync(join(root, "quant", "config", "market-calendar.json"), "utf8"));

/* Der Titel. Ein liquider Wert, weil ein selten gehandelter auch bei
   offener Boerse minutenlang keinen neuen Trade hat - und ein solcher
   Befund saegte an der falschen Frage. */
const SYMBOL = process.env.VU_VERIFY_SYMBOL || "AAPL";

const findings = [];
function record(capability, result, evidence, requests) {
  findings.push({
    capability, result, evidence: evidence || null,
    requests: requests || 0, checkedAt: new Date().toISOString()
  });
}

/* Gruende, die nichts ueber den Zugang aussagen. Uebernommen aus dem
   Nachweis der Phase 4A und aus demselben Grund: ein erschoepftes
   Kontingent als "kann kein Realtime" zu verbuchen, traegt eine
   Widerlegung ein, die nur besagt, dass gerade niemand nachsehen konnte. */
const NICHT_AUSSAGEKRAEFTIG = ["quotaExceeded", "rateLimited", "networkError",
                               "timeout", "notConfigured", "symbolUnmapped"];
function befund(res) {
  const reason = res && res.reason;
  return NICHT_AUSSAGEKRAEFTIG.indexOf(reason) !== -1 ? "ERROR" : "FAILED";
}

/* Die Schwelle, ab der ein Kurs nicht mehr als Echtzeit gilt. Bewusst
   grosszuegig: ein Netzweg und ein Pollingtakt kosten Sekunden, und ein
   Nachweis, der an zwei Sekunden Latenz scheitert, misst die Leitung und
   nicht den Tarif. Verzoegerte Feeds liegen ueblicherweise bei 15
   Minuten - dazwischen ist reichlich Platz. */
const REALTIME_MAX_LAG_S = 90;
const DELAYED_MIN_LAG_S = 600;

function lagSeconds(timestamp, nowMs) {
  if (!timestamp) return null;
  const t = new Date(timestamp).getTime();
  if (isNaN(t)) return null;
  return Math.round((nowMs - t) / 1000);
}

async function main() {
  if (!apiKey) {
    console.log("Kein TIINGO_API_KEY gesetzt. Es wird nichts abgerufen und nichts behauptet.");
    console.log("Alle Echtzeitfaehigkeiten bleiben ungeprueft (UNKNOWN).");
    return finish(0, true);
  }

  const provider = Tiingo.createTiingoProvider({
    apiKey,
    /* Ohne diese Zeile bleibt der MarketClient ohne HTTP-Client und meldet
       jede Anfrage als "notConfigured" - unabhaengig vom Schluessel. Genau
       der Fehler, den dieser Nachweis eigentlich aufdecken soll: eine
       Kapazitaet als nicht verfuegbar auszugeben, obwohl sie nie echt
       angefragt wurde. Dieselbe Verdrahtung wie in ingest-tiingo.mjs,
       verify-tiingo-runtime.mjs, fetch-market-data.mjs, evaluate-provider.mjs. */
    fetchImpl: (url, init) => fetch(url, init),
    /* Ausdruecklich ohne Vorbefund: dieser Lauf soll messen, nicht einen
       frueheren Befund bestaetigen. */
    capabilities: Tiingo.freePlanCapabilities(undefined, null)
  });

  const session = MarketHours.sessionAt(Date.now(), { calendar, exchange: "XNYS" });
  const marktOffen = session.phase === "REGULAR";

  record("marketSession", "INFO", {
    phase: session.phase,
    closedReason: session.closedReason,
    localDate: session.localDate,
    localTime: session.localTime,
    calendarCoverage: session.calendarCoverage,
    interpretation: marktOffen
      ? "Regulaerer Handel. Ein Zeitstempelabstand ist aussagekraeftig."
      : "Kein regulaerer Handel. Jeder Abstand misst die Boersenpause, nicht den Tarif."
  }, 0);

  /* ---------------------------------------------- 1. Kursendpunkt */
  const t0 = Date.now();
  const quote = await provider.getQuote(SYMBOL);
  if (!quote.available) {
    record("latestQuote", befund(quote), { reason: quote.reason || null }, 1);
    record("realtimeQuote", "UNKNOWN", { reason: "Kursabfrage nicht verfuegbar." }, 0);
    record("delayedQuote", "UNKNOWN", { reason: "Kursabfrage nicht verfuegbar." }, 0);
  } else {
    const hatKurs = typeof quote.data?.last === "number" && isFinite(quote.data.last);
    const lag = lagSeconds(quote.data?.timestamp, Date.now());
    record("latestQuote", hatKurs ? "PASSED" : "FAILED", {
      hasPrice: hatKurs,
      hasTimestamp: quote.data?.timestamp !== null && quote.data?.timestamp !== undefined,
      responseMs: Date.now() - t0,
      /* Kein Kurs im Bericht. Was zaehlt, ist, dass einer da war. */
      interpretation: hatKurs
        ? "Der Kursendpunkt antwortet mit einem Kurs. Das sagt nichts ueber sein Alter."
        : "Antwort ohne verwertbaren Kurs."
    }, 1);

    if (lag === null) {
      record("realtimeQuote", "UNKNOWN", {
        reason: "Die Antwort traegt keinen lesbaren Zeitstempel. Ohne ihn laesst sich " +
                "Echtzeit weder belegen noch ausschliessen."
      }, 0);
      record("delayedQuote", "UNKNOWN", { reason: "Kein Zeitstempel." }, 0);
    } else if (!marktOffen) {
      record("realtimeQuote", "UNKNOWN", {
        lagSeconds: lag,
        sessionPhase: session.phase,
        reason: "Ausserhalb des regulaeren Handels. Der Abstand misst die Boersenpause. " +
                "Der Lauf muss bei offener Boerse wiederholt werden."
      }, 0);
      record("delayedQuote", "UNKNOWN", { sessionPhase: session.phase }, 0);
    } else if (lag <= REALTIME_MAX_LAG_S) {
      record("realtimeQuote", "PASSED", {
        lagSeconds: lag, thresholdSeconds: REALTIME_MAX_LAG_S,
        sessionPhase: session.phase,
        interpretation: "Bei offenem regulaerem Handel lag der Zeitstempel innerhalb der " +
                        "Echtzeitschwelle. Echtzeit-Kursabfrage belegt."
      }, 0);
      record("delayedQuote", "FAILED", {
        lagSeconds: lag,
        interpretation: "Der Kurs ist nicht verzoegert - er ist aktuell."
      }, 0);
    } else if (lag >= DELAYED_MIN_LAG_S) {
      record("realtimeQuote", "FAILED", {
        lagSeconds: lag, thresholdSeconds: REALTIME_MAX_LAG_S,
        sessionPhase: session.phase,
        interpretation: "Bei offenem Handel war der Kurs deutlich aelter als die " +
                        "Echtzeitschwelle. Dieser Zugang liefert keine Echtzeitkurse."
      }, 0);
      record("delayedQuote", "PASSED", {
        lagSeconds: lag,
        interpretation: "Verzoegerte Kurse belegt."
      }, 0);
    } else {
      /* Dazwischen. Weder das eine noch das andere - und das ist ein
         eigener Befund, kein gerundetes Ja. */
      record("realtimeQuote", "UNKNOWN", {
        lagSeconds: lag,
        realtimeThresholdSeconds: REALTIME_MAX_LAG_S,
        delayedThresholdSeconds: DELAYED_MIN_LAG_S,
        reason: "Der Abstand liegt zwischen den Schwellen. Moeglich sind ein duenn " +
                "gehandelter Moment, eine Pause im Handel oder ein Zwischentarif. " +
                "Der Lauf ist zu wiederholen."
      }, 0);
      record("delayedQuote", "UNKNOWN", { lagSeconds: lag }, 0);
    }
  }

  /* ------------------------------------- 2. Intraday-Historie */
  const von = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
  const intra = await provider.getIntradayBars(SYMBOL, { interval: "5min", from: von });
  if (!intra.available) {
    record("historicalIntraday", befund(intra), { reason: intra.reason || null }, 1);
  } else {
    const bars = intra.data?.bars || [];
    const mitZeit = bars.filter((b) => !!b.timestamp).length;
    const aufsteigend = bars.every((b, i) => i === 0 || String(bars[i - 1].timestamp) <= String(b.timestamp));
    record("historicalIntraday", bars.length >= 2 ? "PASSED" : "FAILED", {
      requestedFrom: von, bars: bars.length,
      barsWithTimestamp: mitZeit,
      ascending: aufsteigend,
      interpretation: bars.length >= 2
        ? "Intraday-Historie ueber mehrere Tage abrufbar."
        : "Zu wenige Bars fuer eine Aussage."
    }, 1);

    /* Die juengste Intraday-Bar sagt etwas ueber die Aktualitaet des
       Intraday-Pfads - und zwar unabhaengig vom Kursendpunkt. */
    const letzte = bars.length ? bars[bars.length - 1] : null;
    const barLag = letzte ? lagSeconds(letzte.timestamp, Date.now()) : null;
    record("intradayFreshness", barLag === null ? "UNKNOWN" : (marktOffen ? "INFO" : "INFO"), {
      lastBarLagSeconds: barLag,
      sessionPhase: session.phase,
      interpretation: barLag === null
        ? "Keine lesbare Zeit an der letzten Bar."
        : "Abstand der juengsten Intraday-Bar zur Laufzeit. Bei geschlossener Boerse " +
          "erwartungsgemaess gross."
    }, 0);
  }

  /* ------------------------------- 2b. Erweiterte Handelszeiten */

  /* Zwei Fragen, zwei Befunde - und die zweite laesst sich nur in einer
     erweiterten Sitzung beantworten.

     Der Vergleich laeuft ueber die Zeitstempel: kommen mit
     afterHours=true Bars zurueck, die ausserhalb 09:30-16:00 New Yorker
     Zeit liegen? Das ist eine Aussage ueber den Bestand und jederzeit
     messbar. Ob diese Bars waehrend der Vorboerse auch AKTUELL sind,
     zeigt nur ein Lauf zwischen 04:00 und 09:30 bzw. 16:00 und 20:00. */
  const jetzt = SessionPolicy.sessionAt(Date.now(), { calendar, exchange: "XNYS" });
  const extra = await provider.getIntradayBars(SYMBOL, {
    interval: "5min", from: von, extendedHours: true
  });

  if (!extra.available) {
    record("extendedHoursBars", befund(extra), { reason: extra.reason || null }, 1);
    record("extendedHoursRealtime", "UNKNOWN", { reason: "Abruf nicht verfuegbar." }, 0);
  } else {
    const eBars = extra.data?.bars || [];
    /* Welche Bars liegen ausserhalb der regulaeren Sitzung? Gemessen an
       der Boersenortszeit, nicht an UTC - sonst zaehlte die halbe
       regulaere Sitzung als erweitert. */
    const sessionsJeBar = eBars.map((b) =>
      SessionPolicy.sessionAt(b.timestamp || b.date, { calendar, exchange: "XNYS" }).session);
    const preCount = sessionsJeBar.filter((x) => x === "PRE_MARKET").length;
    const afterCount = sessionsJeBar.filter((x) => x === "AFTER_HOURS").length;
    const regularCount = sessionsJeBar.filter((x) => x === "REGULAR").length;
    const hatErweiterte = preCount + afterCount > 0;

    record("extendedHoursBars", hatErweiterte ? "PASSED" : "FAILED", {
      requested: extra.data?.extendedHoursRequested === true,
      bars: eBars.length,
      preMarketBars: preCount,
      afterHoursBars: afterCount,
      regularBars: regularCount,
      /* Die Gegenprobe: liefert derselbe Zeitraum ohne den Schalter
         weniger Bars? Sonst waere der Schalter wirkungslos und der
         Befund eine Selbsttaeuschung. */
      interpretation: hatErweiterte
        ? "Mit afterHours=true kommen Bars ausserhalb der regulaeren Sitzung zurueck."
        : "Keine Bar ausserhalb 09:30-16:00 Ortszeit. Dieser Zugang liefert im " +
          "geprueften Zeitraum keine erweiterten Handelszeiten."
    }, 1);

    /* Die Aktualitaetsfrage. */
    if (!jetzt.isExtended) {
      record("extendedHoursRealtime", "UNKNOWN", {
        sessionAtRun: jetzt.session,
        localTime: jetzt.localTime,
        reason: "Der Lauf faellt nicht in eine erweiterte Sitzung. Ob die Bars dort " +
                "aktuell waeren, laesst sich jetzt nicht messen - nur zwischen 04:00 " +
                "und 09:30 oder zwischen 16:00 und 20:00 New Yorker Zeit."
      }, 0);
    } else if (!hatErweiterte) {
      record("extendedHoursRealtime", "FAILED", {
        sessionAtRun: jetzt.session,
        reason: "Erweiterte Sitzung laeuft, aber es kam keine Bar ausserhalb der " +
                "regulaeren Zeiten zurueck."
      }, 0);
    } else {
      const letzte = eBars[eBars.length - 1];
      const lag = lagSeconds(letzte?.timestamp, Date.now());
      const letzteSession = letzte
        ? SessionPolicy.sessionAt(letzte.timestamp, { calendar, exchange: "XNYS" }).session
        : null;
      /* Waehrend einer erweiterten Sitzung darf die juengste Bar nicht
         aelter sein als ein paar Intervalle. Grosszuegig gerechnet:
         erweiterte Zeiten sind duenn gehandelt, und eine Luecke von
         zwanzig Minuten kann schlicht heissen, dass niemand gehandelt
         hat. */
      const frisch = lag !== null && lag <= 20 * 60;
      record("extendedHoursRealtime", frisch ? "PASSED" : "UNKNOWN", {
        sessionAtRun: jetzt.session,
        lastBarSession: letzteSession,
        lastBarLagSeconds: lag,
        thresholdSeconds: 20 * 60,
        interpretation: frisch
          ? "Waehrend laufender erweiterter Sitzung lag die juengste Bar innerhalb der " +
            "Schwelle. Erweiterte Handelszeiten werden aktuell bedient."
          : "Die juengste Bar ist aelter als die Schwelle. Moeglich sind duenner Handel " +
            "oder ein Tarif ohne aktuelle erweiterte Daten - der Lauf ist zu wiederholen."
      }, 0);
    }
  }

  /* ------------------------------------- 3. WebSocket-Strom */
  if (!WITH_STREAM) {
    record("realtimeStream", "UNKNOWN", {
      reason: "Nicht geprueft. Der Stromtest wird nur mit --with-stream ausgefuehrt: " +
              "er oeffnet eine Verbindung und wartet, und beides soll eine Entscheidung " +
              "sein und kein Nebeneffekt."
    }, 0);
  } else {
    const streamBefund = await pruefeStrom();
    record("realtimeStream", streamBefund.result, streamBefund.evidence, 0);
  }

  return finish(0, false);
}

/**
 * Der Stromtest. Er oeffnet die Verbindung, meldet sich an und wartet
 * eine begrenzte Zeit auf eine verwertbare Nachricht.
 *
 * Was er NICHT tut: aus dem blossen Zustandekommen der Verbindung auf
 * Echtzeitdaten schliessen. Ein Socket, der sich oeffnet und nie eine
 * Kursnachricht sendet, ist kein Echtzeitzugang - er ist ein offener
 * Socket. Der Befund unterscheidet beides.
 */
function pruefeStrom() {
  return new Promise((resolve) => {
    if (typeof globalThis.WebSocket !== "function") {
      resolve({ result: "ERROR", evidence: {
        reason: "Diese Node-Laufzeit stellt kein WebSocket bereit." } });
      return;
    }
    const wartezeitMs = 45000;
    let socket = null;
    let geoeffnet = false;
    let nachrichten = 0;
    let ticks = 0;
    let fehler = null;
    let fertig = false;

    const stop = (result, evidence) => {
      if (fertig) return;
      fertig = true;
      clearTimeout(timer);
      try { if (socket) socket.close(); } catch (err) { /* geschlossen genug */ }
      resolve({ result, evidence });
    };

    const timer = setTimeout(() => {
      stop(geoeffnet ? (ticks ? "PASSED" : "UNKNOWN") : "FAILED", {
        opened: geoeffnet, messages: nachrichten, parsedTicks: ticks,
        waitedSeconds: Math.round(wartezeitMs / 1000),
        sessionPhaseAtStart: MarketHours.sessionAt(Date.now(), { calendar }).phase,
        interpretation: !geoeffnet
          ? "Die Verbindung kam nicht zustande."
          : ticks
            ? "Verbindung offen und Kursnachrichten empfangen."
            : "Verbindung offen, aber keine verwertbare Kursnachricht in der Wartezeit. " +
              "Bei geschlossener Boerse erwartbar; bei offener ein Hinweis darauf, dass " +
              "dieser Tarif den Strom nicht bedient."
      });
    }, wartezeitMs);

    try {
      socket = new globalThis.WebSocket(TiingoRealtime.DEFAULT_WS_URL);
    } catch (err) {
      stop("ERROR", { reason: "Verbindungsaufbau warf: " + (err && err.message) });
      return;
    }

    socket.onopen = () => {
      geoeffnet = true;
      try {
        socket.send(JSON.stringify({
          eventName: "subscribe",
          authorization: apiKey,
          eventData: { thresholdLevel: 5, tickers: [SYMBOL.toLowerCase()] }
        }));
      } catch (err) { fehler = "send: " + (err && err.message); }
    };
    socket.onmessage = (ev) => {
      nachrichten++;
      const parsed = TiingoRealtime.parseIexMessage(ev);
      if (parsed && parsed.tick) {
        ticks++;
        /* Ein einziger verwertbarer Tick genuegt als Beleg. Weitere zu
           sammeln kostet nur Zeit und Daten des Anbieters. */
        stop("PASSED", {
          opened: true, messages: nachrichten, parsedTicks: ticks,
          tickHasTimestamp: !!parsed.tick.timestamp,
          tickLagSeconds: lagSeconds(parsed.tick.timestamp, Date.now()),
          interpretation: "Der IEX-Strom liefert verwertbare Kursnachrichten an dieses Konto."
        });
      }
    };
    socket.onerror = (ev) => { fehler = (ev && ev.message) || "Socketfehler"; };
    socket.onclose = (ev) => {
      stop(geoeffnet ? (ticks ? "PASSED" : "FAILED") : "FAILED", {
        opened: geoeffnet, messages: nachrichten, parsedTicks: ticks,
        closeCode: ev && ev.code,
        error: fehler,
        interpretation: geoeffnet
          ? "Die Verbindung wurde vom Anbieter geschlossen, bevor ein Kurs kam. Ueblich, " +
            "wenn der Tarif den Strom nicht enthaelt."
          : "Die Verbindung kam nicht zustande."
      });
    };
  });
}

function finish(code, ohneBericht) {
  const bericht = {
    generatedAt: new Date().toISOString(),
    provider: "tiingo",
    plan: "unknown",
    scope: "realtime",
    verificationLevel: ohneBericht ? "NOT_VERIFIED" : "RUNTIME_VERIFIED",
    note: "Befunde ueber die Echtzeitpfade. Jeder Eintrag stammt aus einer echten Anfrage " +
          "oder sagt ausdruecklich, dass keine gestellt wurde. Der Bericht enthaelt keine " +
          "Kurse, keine Volumina und keinen Zugangsschluessel - nur Abstaende in Sekunden, " +
          "Anzahlen und Aussagen. UNKNOWN ist ein Ergebnis und keine Luecke.",
    run: {
      source: process.env.GITHUB_ACTIONS ? "github-actions" : "local",
      repository: process.env.GITHUB_REPOSITORY || null,
      runId: process.env.GITHUB_RUN_ID || null,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
      commit: process.env.GITHUB_SHA || null,
      ref: process.env.GITHUB_REF_NAME || null,
      streamTested: WITH_STREAM
    },
    symbol: SYMBOL,
    sessionAtRun: {
      session: SessionPolicy.sessionAt(Date.now(), { calendar, exchange: "XNYS" }).session,
      localTime: SessionPolicy.sessionAt(Date.now(), { calendar, exchange: "XNYS" }).localTime,
      note: "Welche Befunde ueberhaupt moeglich waren, haengt an dieser Zeile."
    },
    thresholds: {
      realtimeMaxLagSeconds: REALTIME_MAX_LAG_S,
      delayedMinLagSeconds: DELAYED_MIN_LAG_S
    },
    findings,
    confirmedCapabilities: findings.filter((f) => f.result === "PASSED").map((f) => f.capability),
    refutedCapabilities: findings.filter((f) => f.result === "FAILED").map((f) => f.capability),
    unknownCapabilities: findings.filter((f) => f.result === "UNKNOWN").map((f) => f.capability)
  };

  if (AS_JSON) {
    console.log(JSON.stringify(bericht, null, 2));
  } else {
    console.log("\nTiingo — Echtzeit-Laufzeitnachweis");
    console.log("".padEnd(52, "-"));
    for (const f of findings) {
      console.log(String(f.capability).padEnd(24) + f.result);
    }
    console.log("".padEnd(52, "-"));
    console.log("belegt:      " + (bericht.confirmedCapabilities.join(", ") || "—"));
    console.log("widerlegt:   " + (bericht.refutedCapabilities.join(", ") || "—"));
    console.log("ungeprueft:  " + (bericht.unknownCapabilities.join(", ") || "—"));
  }

  if (!ohneBericht) {
    mkdirSync(dirname(OUT), { recursive: true });
    /* Gegenprobe vor dem Schreiben. Der Workflow prueft es noch einmal;
       zwei Linien sind hier angemessen, weil die Datei committet werden
       koennte. */
    const serialisiert = JSON.stringify(bericht, null, 2);
    if (apiKey && apiKey.length >= 8 && serialisiert.includes(apiKey)) {
      console.error("ABBRUCH: der Bericht enthaelt den Zugangsschluessel. Nichts geschrieben.");
      process.exit(1);
    }
    writeFileSync(OUT, serialisiert + "\n");
    console.log("\nBericht: " + OUT.replace(root + "/", ""));
  }
  process.exit(code);
}

main().catch((err) => {
  console.error("Unerwarteter Fehler: " + (err && err.message));
  record("run", "ERROR", { reason: String(err && err.message) }, 0);
  finish(1, false);
});
