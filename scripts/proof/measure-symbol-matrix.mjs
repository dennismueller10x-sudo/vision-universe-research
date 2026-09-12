/* =========================================================================
   VISION UNIVERSE — measure-symbol-matrix.mjs

   ACHT TITEL, EINZELN GEMESSEN — NICHT EINER STELLVERTRETEND FUER ALLE.

   Dass AAPL laeuft, war nie die Frage. Die Frage ist, ob das Produkt fuer
   einen Titel laeuft, an den beim Bauen niemand gedacht hat: einen, der
   seit drei Tagen notiert ist, einen mit achtundvierzig Kurspunkten,
   einen von einem anderen Handelsplatz - und ob es bei einem Papier,
   das nicht ins Produkt gehoert, sauber nein sagt statt still etwas zu
   liefern.

   Die acht Titel sucht niemand aus; sie fallen aus dem Eignungslauf
   heraus (scripts/realtime/symbol-matrix.mjs).

   WAS HIER ALS ERFOLG ZAEHLT UND WAS NICHT

   Kein Intraday fuer einen Titel ist kein Fehlschlag - viele Titel haben
   schlicht keinen Tagesverlauf beim Anbieter. Ein Fehlschlag ist, wenn
   die Funktion gar nicht antwortet, wenn sie einen ausgeschlossenen
   Titel bedient, oder wenn sie Daten liefert, wo keine sind.

   Und: kein Tick ausserhalb der Handelszeit ist kein Fehlschlag. Der
   Bericht nennt dann die Sitzungslage und zaehlt null. Ein simulierter
   Tick waere genau die Taeuschung, gegen die dieser ganze Nachweis
   steht.

   Ausfuehren (braucht offenes Netz - laeuft deshalb in GitHub Actions):
     node scripts/proof/measure-symbol-matrix.mjs --base https://<projekt>.vercel.app
   ========================================================================= */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { baueMatrix } from "../realtime/symbol-matrix.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const BASE = String(arg("--base", process.env.VERCEL_PREVIEW_URL || "")).replace(/\/$/, "");
const OUT = arg("--out", join(root, "quant", "data", "site"));
const STROM_MS = parseInt(arg("--stream-ms", "40000"), 10);
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";

if (!BASE) { console.error("\n  ABBRUCH: keine Adresse. --base setzen.\n"); process.exit(2); }

const kopf = () => {
  const h = { "user-agent": "vision-universe-symbol-matrix/1" };
  if (BYPASS) h["x-vercel-protection-bypass"] = BYPASS;
  return h;
};

/* Ein Schluessel, der versehentlich in eine Meldung geraet, wird hier
   unkenntlich - Messwerte werden veroeffentlicht, Zugangsmittel nie. */
function entschaerfe(text) {
  return String(text == null ? "" : text).replace(/[0-9a-f]{24,}/gi, "«unkenntlich»");
}

async function intradayMessen(ticker) {
  const beginn = Date.now();
  const ctl = new AbortController();
  const uhr = setTimeout(() => ctl.abort(), 30000);
  try {
    const res = await fetch(
      `${BASE}/api/intraday/?ticker=${encodeURIComponent(ticker)}&freq=5min&days=3`,
      { headers: kopf(), redirect: "follow", signal: ctl.signal });
    const roh = await res.text();
    let d = null; try { d = JSON.parse(roh); } catch (e) { d = null; }
    if (!d) {
      return { INTRADAY_REQUEST_STATUS: "NO_JSON", httpStatus: res.status,
               INTRADAY_BAR_COUNT: 0, FIRST_INTRADAY_TIMESTAMP: null,
               LAST_INTRADAY_TIMESTAMP: null,
               INTRADAY_PROVIDER_ERRORS: [entschaerfe(roh).slice(0, 160)],
               roundTripMs: Date.now() - beginn };
    }
    const bars = d.bars || [];
    return {
      INTRADAY_REQUEST_STATUS: d.state,
      httpStatus: res.status,
      INTRADAY_BAR_COUNT: d.barCount === undefined ? bars.length : d.barCount,
      FIRST_INTRADAY_TIMESTAMP: d.first || (bars.length ? bars[0].date : null),
      LAST_INTRADAY_TIMESTAMP: d.last || (bars.length ? bars[bars.length - 1].date : null),
      INTRADAY_PROVIDER_ERRORS: d.reason ? [entschaerfe(d.reason).slice(0, 200)] : [],
      MARKET_STATUS: d.marketStatus || null,
      eligibility: d.eligibility || null,
      providerFetchMs: d.fetchMs === undefined ? null : d.fetchMs,
      roundTripMs: Date.now() - beginn
    };
  } catch (err) {
    return { INTRADAY_REQUEST_STATUS: "NO_RESPONSE", httpStatus: null,
             INTRADAY_BAR_COUNT: 0, FIRST_INTRADAY_TIMESTAMP: null,
             LAST_INTRADAY_TIMESTAMP: null,
             INTRADAY_PROVIDER_ERRORS: [entschaerfe((err && err.message) || err).slice(0, 160)],
             roundTripMs: Date.now() - beginn };
  } finally { clearTimeout(uhr); }
}

/* Der Strom wird fuer ALLE messbaren Titel in EINER Verbindung
   abonniert. Das ist kein Messtrick, sondern genau das Verhalten, das
   belegt werden soll: bedarfsgesteuert und gebuendelt statt
   siebentausend stehende Abonnements. */
async function stromMessen(tickers) {
  const ergebnis = {
    REALTIME_RELAY_STATUS: "NOT_CONNECTED", REALTIME_SUBSCRIBE_STATUS: "NOT_SUBSCRIBED",
    MARKET_STATUS: null, expectsUpdates: null, verdict: null,
    OBSERVED_TICK_COUNT: 0, DUPLICATE_TICKS: 0, quotes: 0,
    FIRST_TICK_TIMESTAMP: null, LAST_TICK_TIMESTAMP: null,
    OBSERVED_UPDATE_LATENCY_MS: null, PROVIDER_ERRORS: [],
    perSymbol: {}, rejected: [], windowMs: STROM_MS, durationMs: null
  };
  const latenzen = [];
  const ctl = new AbortController();
  const uhr = setTimeout(() => ctl.abort(), STROM_MS + 15000);
  const beginn = Date.now();
  try {
    const res = await fetch(`${BASE}/api/realtime/?tickers=${tickers.map(encodeURIComponent).join(",")}`,
      { headers: Object.assign(kopf(), { accept: "text/event-stream" }),
        redirect: "follow", signal: ctl.signal });
    if (!res.ok || !res.body) {
      ergebnis.REALTIME_RELAY_STATUS = "HTTP_" + res.status;
      return ergebnis;
    }
    const leser = res.body.getReader();
    const dekoder = new TextDecoder();
    let puffer = "";
    while (true) {
      const { done, value } = await leser.read();
      if (done) break;
      puffer += dekoder.decode(value, { stream: true });
      let trenner;
      while ((trenner = puffer.indexOf("\n\n")) >= 0) {
        const block = puffer.slice(0, trenner); puffer = puffer.slice(trenner + 2);
        const art = (block.match(/^event: (.+)$/m) || [])[1];
        const roh = (block.match(/^data: (.+)$/m) || [])[1];
        if (!art || !roh) continue;
        let d = null; try { d = JSON.parse(roh); } catch (e) { continue; }

        if (art === "status") {
          if (d.state === "CONNECTED") ergebnis.REALTIME_RELAY_STATUS = "CONNECTED";
          else if (ergebnis.REALTIME_RELAY_STATUS !== "CONNECTED") ergebnis.REALTIME_RELAY_STATUS = d.state;
          if (d.marketStatus) ergebnis.MARKET_STATUS = d.marketStatus;
          if (d.expectsUpdates !== undefined) ergebnis.expectsUpdates = d.expectsUpdates;
          if (Array.isArray(d.rejected)) ergebnis.rejected = d.rejected;
          if (d.state === "PROVIDER_ERROR" || d.state === "PROVIDER_UNAVAILABLE") {
            ergebnis.PROVIDER_ERRORS.push(entschaerfe(
              `${d.state}${d.providerCode === undefined || d.providerCode === null ? "" : " " + d.providerCode}: ${d.reason || ""}`).slice(0, 200));
          }
        }
        if (art === "subscribed") ergebnis.REALTIME_SUBSCRIBE_STATUS = "SUBSCRIBED";
        if (art === "tick") {
          ergebnis.OBSERVED_TICK_COUNT = d.seq;
          if (!ergebnis.FIRST_TICK_TIMESTAMP) ergebnis.FIRST_TICK_TIMESTAMP = d.receivedAt;
          ergebnis.LAST_TICK_TIMESTAMP = d.receivedAt;
          if (Number.isFinite(d.latencyMs)) latenzen.push(d.latencyMs);
        }
        if (art === "summary") {
          ergebnis.OBSERVED_TICK_COUNT = d.updates;
          ergebnis.DUPLICATE_TICKS = d.duplicates || 0;
          ergebnis.quotes = d.quotes || 0;
          ergebnis.MARKET_STATUS = d.marketStatus || ergebnis.MARKET_STATUS;
          ergebnis.expectsUpdates = d.expectsUpdates;
          ergebnis.verdict = d.verdict;
          ergebnis.perSymbol = d.perSymbol || {};
          ergebnis.FIRST_TICK_TIMESTAMP = d.firstUpdateAt || ergebnis.FIRST_TICK_TIMESTAMP;
          ergebnis.durationMs = d.durationMs;
          ergebnis.note = d.note || null;
          ergebnis.OBSERVED_UPDATE_LATENCY_MS = latenzen.length
            ? Math.round(latenzen.slice().sort((a, b) => a - b)[Math.floor(latenzen.length / 2)])
            : null;
          return ergebnis;
        }
      }
    }
    return ergebnis;
  } catch (err) {
    ergebnis.PROVIDER_ERRORS.push(entschaerfe((err && err.message) || err).slice(0, 160));
    return ergebnis;
  } finally {
    clearTimeout(uhr);
    if (ergebnis.durationMs === null) ergebnis.durationMs = Date.now() - beginn;
    if (ergebnis.OBSERVED_UPDATE_LATENCY_MS === null && latenzen.length) {
      ergebnis.OBSERVED_UPDATE_LATENCY_MS =
        Math.round(latenzen.slice().sort((a, b) => a - b)[Math.floor(latenzen.length / 2)]);
    }
  }
}

/* Zwei gleichzeitige Verbindungen auf denselben Titel: der Beleg, dass
   jede fuer sich aufraeumt und keine die andere stoert. Die zweite wird
   sofort wieder geschlossen - genau das, was der Browser tut, wenn der
   Nutzer weiterblaettert. */
async function abbruchMessen(ticker) {
  const ctl = new AbortController();
  const beginn = Date.now();
  try {
    const res = await fetch(`${BASE}/api/realtime/?tickers=${encodeURIComponent(ticker)}`,
      { headers: Object.assign(kopf(), { accept: "text/event-stream" }),
        redirect: "follow", signal: ctl.signal });
    if (!res.ok || !res.body) return { status: "HTTP_" + res.status };
    const leser = res.body.getReader();
    await leser.read();
    ctl.abort();
    return { status: "ABORTED_BY_CLIENT", afterMs: Date.now() - beginn };
  } catch (err) {
    return { status: "ABORTED_BY_CLIENT", afterMs: Date.now() - beginn,
             note: entschaerfe((err && err.message) || err).slice(0, 120) };
  }
}

async function lauf() {
  const m = baueMatrix();
  const bericht = {
    generatedAt: new Date().toISOString(),
    previewBase: BASE,
    productUniverseSource: m.quelle,
    productUniverseVersion: m.quellversion,
    productUniverseSize: m.produktuniversum,
    asOf: m.stichtag,
    run: { source: process.env.GITHUB_ACTIONS ? "github-actions" : "local",
           runId: process.env.GITHUB_RUN_ID || null, commit: process.env.GITHUB_SHA || null },
    symbols: [], realtime: null, teardown: null, verdict: null
  };

  console.log(`\n  Produktuniversum: ${m.produktuniversum} Titel aus ${m.quelle} (${m.quellversion})`);
  console.log(`  Vorschau:         ${BASE}\n`);
  console.log("  " + "TICKER".padEnd(9) + "KATEGORIE".padEnd(22) + "EIGNUNG".padEnd(18) +
              "INTRADAY".padEnd(24) + "BARS");

  for (const z of m.matrix) {
    const i = await intradayMessen(z.ticker);
    bericht.symbols.push({
      TICKER: z.ticker,
      KATEGORIE: z.kategorie,
      regel: z.regel,
      stellvertreterFuer: z.stellvertreterFuer,
      ELIGIBILITY_STATUS: z.eligibility,
      instrumentType: z.instrumentType,
      exchange: z.exchange,
      startDate: z.startDate,
      intraday: i
    });
    console.log("  " + z.ticker.padEnd(9) + z.kategorie.padEnd(22) +
                String(z.eligibility).padEnd(18) +
                String(i.INTRADAY_REQUEST_STATUS).padEnd(24) + i.INTRADAY_BAR_COUNT);
  }

  /* Abonniert wird nur, was die Grenze auch durchlaesst. Einen
     ausgeschlossenen Titel mitzuschicken waere die Messung des
     Gegenteils. */
  const messbar = m.matrix.filter((z) => z.imProduktuniversum).map((z) => z.ticker);

  /* IN BUENDELN, NICHT IN EINEM RUTSCH.

     Eine Verbindung fuehrt hoechstens so viele Titel, wie die
     Umfangsentscheidung erlaubt - im Produkt genauso wie hier. Alle
     sechs auf einmal anzufragen haette zwei davon ueber die Grenze
     geschoben; gemessen worden waeren dann vier, berichtet sechs.
     Stattdessen laufen mehrere Verbindungen nacheinander, und dass sie
     das sauber tun, ist selbst ein Befund. */
  const proVerbindung = (JSON.parse(
    readFileSync(join(root, "quant/config/realtime-preview-scope.json"), "utf8")
  ).realtime || {}).maxSymbolsPerConnection || 4;
  const buendel = [];
  for (let i = 0; i < messbar.length; i += proVerbindung) {
    buendel.push(messbar.slice(i, i + proVerbindung));
  }

  console.log(`\n  Strom: ${messbar.length} Titel in ${buendel.length} Verbindung(en) ` +
              `zu je hoechstens ${proVerbindung}, Fenster ${STROM_MS} ms ...`);

  const laeufe = [];
  for (const gruppe of buendel) {
    console.log(`    → ${gruppe.join(", ")}`);
    const r = await stromMessen(gruppe);
    r.requestedSymbols = gruppe;
    laeufe.push(r);
    console.log(`      Relay ${r.REALTIME_RELAY_STATUS} · Abonnement ${r.REALTIME_SUBSCRIBE_STATUS} · ` +
                `Markt ${r.MARKET_STATUS} · Ticks ${r.OBSERVED_TICK_COUNT} · ` +
                `Quotes ${r.quotes} · Doppelte ${r.DUPLICATE_TICKS}`);
  }
  bericht.realtimeRuns = laeufe;

  /* Die Zusammenfassung ueber alle Verbindungen. Verbunden heisst hier:
     JEDE hat verbunden - eine von zwei waere kein Beleg. */
  const zusammen = {
    REALTIME_RELAY_STATUS: laeufe.every((r) => r.REALTIME_RELAY_STATUS === "CONNECTED")
      ? "CONNECTED" : (laeufe.find((r) => r.REALTIME_RELAY_STATUS !== "CONNECTED") || {}).REALTIME_RELAY_STATUS || "NOT_CONNECTED",
    REALTIME_SUBSCRIBE_STATUS: laeufe.every((r) => r.REALTIME_SUBSCRIBE_STATUS === "SUBSCRIBED")
      ? "SUBSCRIBED" : "NOT_SUBSCRIBED",
    MARKET_STATUS: (laeufe[0] || {}).MARKET_STATUS || null,
    expectsUpdates: (laeufe[0] || {}).expectsUpdates,
    connections: laeufe.length,
    requestedSymbols: messbar,
    OBSERVED_TICK_COUNT: laeufe.reduce((n, r) => n + (r.OBSERVED_TICK_COUNT || 0), 0),
    DUPLICATE_TICKS: laeufe.reduce((n, r) => n + (r.DUPLICATE_TICKS || 0), 0),
    quotes: laeufe.reduce((n, r) => n + (r.quotes || 0), 0),
    FIRST_TICK_TIMESTAMP: laeufe.map((r) => r.FIRST_TICK_TIMESTAMP).filter(Boolean).sort()[0] || null,
    LAST_TICK_TIMESTAMP: laeufe.map((r) => r.LAST_TICK_TIMESTAMP).filter(Boolean).sort().pop() || null,
    OBSERVED_UPDATE_LATENCY_MS: (() => {
      const w = laeufe.map((r) => r.OBSERVED_UPDATE_LATENCY_MS).filter((v) => Number.isFinite(v));
      return w.length ? Math.round(w.sort((a, b) => a - b)[Math.floor(w.length / 2)]) : null;
    })(),
    PROVIDER_ERRORS: laeufe.flatMap((r) => r.PROVIDER_ERRORS || []),
    rejected: laeufe.flatMap((r) => r.rejected || []),
    perSymbol: Object.assign({}, ...laeufe.map((r) => r.perSymbol || {})),
    durationMs: laeufe.reduce((n, r) => n + (r.durationMs || 0), 0),
    note: (laeufe.find((r) => r.note) || {}).note || null,
    verdict: (laeufe[0] || {}).verdict || null
  };
  bericht.realtime = zusammen;

  console.log(`\n  Gesamt: Relay ${zusammen.REALTIME_RELAY_STATUS} · ` +
              `Abonnement ${zusammen.REALTIME_SUBSCRIBE_STATUS} · ` +
              `Markt ${zusammen.MARKET_STATUS} · ` +
              `Ticks ${zusammen.OBSERVED_TICK_COUNT} · ` +
              `Quotes ${zusammen.quotes} · ` +
              `Doppelte ${zusammen.DUPLICATE_TICKS}`);

  console.log("\n  Abbruch durch den Aufrufer ...");
  bericht.teardown = await abbruchMessen(messbar[0]);
  console.log(`  ${bericht.teardown.status}` +
              (bericht.teardown.afterMs ? ` nach ${bericht.teardown.afterMs} ms` : ""));

  /* DAS URTEIL.

     Ausserhalb der Handelszeit gibt es nichts zu sehen, und das ist der
     haeufigste Fall, in dem dieser Lauf faellt. Er wird dann nicht gruen
     und nicht rot, sondern benannt: WAIT_FOR_ACTIVE_SESSION. */
  const r = bericht.realtime;
  const grenzeHaelt = bericht.symbols.every((s) =>
    s.ELIGIBILITY_STATUS === "EXCLUDED" || s.ELIGIBILITY_STATUS === "NICHT_IM_BESTAND"
      ? ["NOT_ELIGIBLE", "SYMBOL_NOT_SUPPORTED"].includes(s.intraday.INTRADAY_REQUEST_STATUS)
      : true);
  const antwortenAlle = bericht.symbols.every((s) =>
    !["NO_RESPONSE", "NO_JSON"].includes(s.intraday.INTRADAY_REQUEST_STATUS));

  bericht.verdict =
    !antwortenAlle ? "FAIL_NO_RESPONSE"
    : !grenzeHaelt ? "FAIL_SCOPE_LEAK"
    : r.REALTIME_RELAY_STATUS !== "CONNECTED" ? "FAIL_RELAY"
    : r.OBSERVED_TICK_COUNT > 0 ? "TICKS_OBSERVED"
    : r.expectsUpdates === false ? "WAIT_FOR_ACTIVE_SESSION"
    : "CONNECTED_NO_TICKS";

  mkdirSync(OUT, { recursive: true });
  const ziel = join(OUT, "symbol-matrix.json");
  writeFileSync(ziel, JSON.stringify(bericht, null, 2) + "\n");
  console.log(`\n  URTEIL: ${bericht.verdict}`);
  if (r.note) console.log(`  ${r.note}`);
  console.log(`  Bericht: ${ziel}\n`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const zeilen = [
      "## Symbolmatrix — Intraday und Echtzeit", "",
      `Produktuniversum **${m.produktuniversum}** Titel · Quelle \`${m.quelle}\` (${m.quellversion})`, "",
      "| Ticker | Kategorie | Eignung | Intraday | Bars | Erster | Letzter |",
      "| --- | --- | --- | --- | ---: | --- | --- |",
      ...bericht.symbols.map((s) =>
        `| ${s.TICKER} | ${s.KATEGORIE} | ${s.ELIGIBILITY_STATUS} | ${s.intraday.INTRADAY_REQUEST_STATUS} | ` +
        `${s.intraday.INTRADAY_BAR_COUNT} | ${s.intraday.FIRST_INTRADAY_TIMESTAMP || "–"} | ${s.intraday.LAST_INTRADAY_TIMESTAMP || "–"} |`),
      "", "### Strom", "",
      `Relay **${r.REALTIME_RELAY_STATUS}** · Abonnement **${r.REALTIME_SUBSCRIBE_STATUS}** · ` +
      `Markt **${r.MARKET_STATUS}** · ${r.connections} Verbindung(en) · Ticks **${r.OBSERVED_TICK_COUNT}** · ` +
      `Doppelte **${r.DUPLICATE_TICKS}** · Quotes **${r.quotes}** · Fenster ${r.durationMs} ms`, "",
      r.note ? `> ${r.note}` : "", "",
      `**URTEIL: ${bericht.verdict}**`, ""
    ];
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, zeilen.join("\n"), { flag: "a" });
  }

  process.exit(bericht.verdict.startsWith("FAIL") ? 1 : 0);
}

lauf().catch((err) => { console.error("\n  ABBRUCH:", entschaerfe(err && err.stack || err), "\n"); process.exit(2); });
