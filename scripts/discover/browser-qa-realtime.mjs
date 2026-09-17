#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — browser-qa-realtime.mjs

   DER NACHWEIS, DEN NUR EIN ECHTER BROWSER FUEHREN KANN

   Owner §19/§20: die Aktienseite soll sich waehrend der Sitzung von
   selbst mit live.visionuniverse.de verbinden, den Chart fortschreiben,
   ohne Neuladen - und bei einem Abriss sichtbar zurueckfallen.

   WARUM DIE SEITE UNTER IHREM ECHTEN NAMEN LAEUFT

   Der Worker prueft den Ursprung an der Verbindung selbst. Von
   http://localhost kommt keiner herein, und das ist richtig so - die
   Freigabe gilt genau drei Vision-Universe-Ursprüngen.

   Statt die Freigabe fuer den Test aufzuweichen, laeuft der Test unter
   dem echten Ursprung: der Arbeitsbaum wird ueber TLS ausgeliefert, und
   Chromium bekommt research.visionuniverse.de per --host-resolver-rules
   auf 127.0.0.1 gelegt. Die Seite ist dann wirklich
   https://research.visionuniverse.de, der Ursprungskopf ist echt, und
   die Pruefung im Worker laeuft unveraendert.

   Nichts an der Produktion wird dafuer geaendert. Die veroeffentlichte
   Seite bleibt, wo sie ist; abgebildet wird nur der Name im Testbrowser.

   WAS GEMESSEN WIRD (§19)

     Anbieter-Zeitstempel  wann Tiingo den Kurs gesehen hat
     Cloudflare-Empfang    wann das Durable Object ihn hatte
     Client-Empfang        wann der Browser ihn hatte
     Chart-Zeichnung       wann die Flaeche sich veraendert hat

   Und die Ehrlichkeitsregel dazu: ein illiquider Titel, der nicht
   handelt, ist KEINE Systemlatenz. Das steht so im Bericht.
   ========================================================================= */

import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MarketHours = require(join(root, "quant", "engines", "realtime", "market-hours.js"));
const kalender = JSON.parse(require("node:fs").readFileSync(
  join(root, "quant", "config", "market-calendar.json"), "utf8"));

function arg(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
}
const PORT = arg("port", "8443");
/* Der Ursprung muss EXAKT stimmen - mit Port waere er ein anderer.

   Beim ersten Lauf lief der Server auf 8443, und der Browser schickte
   "https://research.visionuniverse.de:8443" als Ursprung. Der Worker
   hat mit 403 abgewiesen, voellig zu Recht: das ist nicht die Adresse,
   die freigegeben ist. Ein schoener Beleg dafuer, dass die Pruefung
   wirklich prueft - und ein Hinweis, dass die Abbildung den Port
   mitnehmen muss.

   MAP <name>:443 -> 127.0.0.1:<port> laesst den Browser glauben, er
   spreche auf dem Standardport; dann laesst er ihn im Ursprung weg. */
const URSPRUNG = "https://research.visionuniverse.de";
const BASIS = URSPRUNG;
const SYMBOLE = String(arg("symbols", "AAPL,NVDA,MSFT,VLO,PANW")).split(",").map((s) => s.trim().toUpperCase());
const BEOBACHTUNG_MS = Math.max(10000, parseInt(arg("watch-seconds", "60"), 10) * 1000);
const SHOTS = arg("shots", null);
const OUT = arg("out", join(root, "quant", "data", "market", "commercial"));
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const sitzung = MarketHours.sessionAt(Date.now(), { calendar: kalender, exchange: "XNYS" });
/* Messfenster 17.09.2026, zweiter Lauf: jetzt mit den heutigen
   Intraday-Snapshots auf dem Branch. Erst damit hat der laufende Kurs
   etwas, woran er anknuepfen kann - und erst dann darf das Etikett
   "Markt geoeffnet - Live" ueberhaupt entstehen. */

const bericht = {
  schemaVersion: "vu-realtime-browser-qa-1.0.0",
  auftrag: "Owner 17.09.2026 §19/§20: Realtime auf der Aktienseite, im echten Browser",
  checkedAt: new Date().toISOString(),
  origin: URSPRUNG,
  session: { phase: sitzung.phase, localTime: sitzung.localTime, isOpen: sitzung.isOpen },
  note: "Die Seite laeuft unter ihrem echten Ursprung; nur der Name ist im Testbrowser auf 127.0.0.1 " +
        "abgebildet. Die Ursprungspruefung des Workers laeuft dabei unveraendert.",
  honesty: "Ein Titel ohne Marktereignis liefert keinen Kurs. Das ist kein Systemfehler und wird hier " +
           "auch nicht als Latenz gezaehlt.",
  symbols: [], reconnect: null, checks: [], result: "UNKNOWN", reason: null
};

function pruefung(id, frage, ok, detail) {
  bericht.checks.push({ id, question: frage, ok: !!ok, detail: detail === undefined ? null : detail });
  console.log("  " + (ok ? "ok    " : "FEHLT ") + frage + (detail && !ok ? "  " + JSON.stringify(detail) : ""));
  return !!ok;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: [
    /* Der Name zeigt im Testbrowser auf den lokalen Server. Sonst
       nichts - kein Abschalten von Sicherheitsmerkmalen ausser dem
       selbstsignierten Zertifikat. */
    "--host-resolver-rules=MAP research.visionuniverse.de:443 127.0.0.1:" + PORT,
    "--ignore-certificate-errors",
    /* Ohne das laeuft die Namensaufloesung ueber einen Proxy, und die
       Abbildung oben greift nicht - der Browser landet dann bei der
       echten, veroeffentlichten Seite statt beim Arbeitsbaum. */
    "--no-proxy-server"
  ]
});

const MOBIL = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
                deviceScaleFactor: 2, ignoreHTTPSErrors: true };

async function seite(opts) {
  const ctx = await browser.newContext(Object.assign({ colorScheme: "dark" }, opts || MOBIL));
  const p = await ctx.newPage();
  p.__errors = [];
  p.on("pageerror", (e) => p.__errors.push(String(e.message)));
  p.on("console", (m) => {
    if (m.type() === "error" && !/fonts\.googleapis|fonts\.gstatic|ERR_CERT/.test(m.text())) {
      p.__errors.push(m.text());
    }
  });
  return p;
}

/* Der Beobachter im Browser: er haengt sich an den Hub und schreibt
   mit, was ankommt - Werte, Zeiten und die Revision der Chartflaeche. */
const BEOBACHTER = () => {
  window.__vuRealtime = { ticks: [], labels: [], states: [], chartRevs: [], fehler: [] };
  const Hub = window.VUDiscover && window.VUDiscover.LiveHub;
  if (!Hub || !Hub.liveState) { window.__vuRealtime.fehler.push("kein LiveHub"); return; }
  const sichtbar = () => {
    const svg = document.querySelector(".dx-intraday-chart, .dx-intraday svg");
    if (!svg) return null;
    const d = svg.querySelector("path[d]");
    return d ? d.getAttribute("d").length + ":" + (d.getAttribute("d").slice(-40)) : null;
  };
  window.__vuBeobachte = (symbol) => {
    const bis = Date.now() + 1000;
    return new Promise((r) => setTimeout(r, Math.max(0, bis - Date.now())));
  };
  setInterval(() => {
    const st = Hub.liveState ? Hub.liveState() : null;
    if (st) window.__vuRealtime.states.push({ at: Date.now(), state: st.state, reason: st.reason,
                                              connected: st.connected, symbols: st.symbols });
    const w = Hub.liveValue ? Hub.liveValue(window.__vuSymbol || "") : null;
    if (w) {
      const letzte = window.__vuRealtime.ticks[window.__vuRealtime.ticks.length - 1];
      if (!letzte || letzte.receivedAt !== w.receivedAt) {
        window.__vuRealtime.ticks.push({ price: w.price, at: w.at, providerAt: w.providerAt || null,
                                         receivedAt: w.receivedAt, seenAt: Date.now() });
      }
    }
    const rev = sichtbar();
    const letzteRev = window.__vuRealtime.chartRevs[window.__vuRealtime.chartRevs.length - 1];
    if (rev && (!letzteRev || letzteRev.rev !== rev)) {
      window.__vuRealtime.chartRevs.push({ at: Date.now(), rev });
    }
    const label = document.querySelector(".dx-live-label");
    if (label) {
      const t = label.textContent.trim();
      const l = window.__vuRealtime.labels[window.__vuRealtime.labels.length - 1];
      if (!l || l.text !== t) window.__vuRealtime.labels.push({ at: Date.now(), text: t });
    }
  }, 250);
};

async function aktienseite(p, symbol) {
  await p.goto(BASIS + "/discover/#/s/US_REAL/" + symbol, { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  await p.evaluate((s) => { window.__vuSymbol = s; }, symbol);
  await p.evaluate(BEOBACHTER);
  await p.evaluate((s) => { window.__vuSymbol = s; }, symbol);
}

/* ------------------------------------------------------- Der Durchlauf */

console.log("Realtime-Browser-QA gegen " + BASIS);
console.log("Sitzung: " + sitzung.phase + " (" + sitzung.localTime + " New York)");
console.log("");

let alleOk = true;

for (const sym of SYMBOLE) {
  const p = await seite();
  await aktienseite(p, sym);

  const start = Date.now();
  await p.waitForTimeout(BEOBACHTUNG_MS);
  const r = await p.evaluate(() => window.__vuRealtime);
  const zustand = await p.evaluate(() => {
    const Hub = window.VUDiscover.LiveHub;
    return { live: Hub.liveState(), stats: Hub.liveStats(), available: Hub.liveAvailable() };
  });

  const ticks = r.ticks || [];
  const ersterTick = ticks.length ? ticks[0] : null;
  const latenzen = ticks.filter((t) => t.providerAt).map((t) => ({
    providerZuCloudflare: t.at - t.providerAt,
    cloudflareZuClient: t.receivedAt - t.at,
    gesamt: t.receivedAt - t.providerAt
  }));
  const mittel = (f) => latenzen.length
    ? Math.round(latenzen.reduce((a, x) => a + x[f], 0) / latenzen.length) : null;
  const chartAenderungen = (r.chartRevs || []).filter((c) => c.at > start + 1500).length;

  const eintrag = {
    symbol: sym,
    connected: zustand.live.connected,
    streamState: zustand.live.state,
    subscribed: zustand.live.subscribed,
    ticks: ticks.length,
    firstTickMs: ersterTick ? ersterTick.seenAt - start : null,
    chartUpdatesAfterLoad: chartAenderungen,
    labels: (r.labels || []).map((l) => l.text).slice(0, 6),
    latencyMs: latenzen.length ? {
      samples: latenzen.length,
      providerToCloudflare: mittel("providerZuCloudflare"),
      cloudflareToClient: mittel("cloudflareZuClient"),
      endToEnd: mittel("gesamt"),
      max: Math.max(...latenzen.map((x) => x.gesamt))
    } : null,
    consoleErrors: p.__errors.slice(0, 5),
    /* Kein Kurs heisst nicht kaputt. Es heisst: kein Marktereignis. */
    verdict: ticks.length > 0 ? "TICKS" : (zustand.live.connected ? "CONNECTED_NO_TRADE" : "NO_STREAM")
  };
  bericht.symbols.push(eintrag);
  console.log("  " + sym.padEnd(6) + eintrag.verdict.padEnd(20) +
              ticks.length + " Ticks, erster nach " + (eintrag.firstTickMs === null ? "—" : eintrag.firstTickMs + " ms") +
              (eintrag.latencyMs ? ", E2E " + eintrag.latencyMs.endToEnd + " ms" : "") +
              ", Chart " + chartAenderungen + "x");

  if (SHOTS && (sym === "AAPL" || sym === "NVDA")) {
    await p.screenshot({ path: SHOTS + "/realtime-" + sym.toLowerCase() + "-dark.png" });
  }
  await p.context().close();
}

/* §20: verbunden, Chart bewegt sich, keine Konsolenfehler. */
const mitStrom = bericht.symbols.filter((s) => s.connected);
const mitTicks = bericht.symbols.filter((s) => s.ticks > 0);
const mitChart = bericht.symbols.filter((s) => s.chartUpdatesAfterLoad > 0);
const fehlerfrei = bericht.symbols.every((s) => s.consoleErrors.length === 0);

alleOk = pruefung("connected", "jede Aktienseite verbindet sich mit dem Strom",
                  mitStrom.length === SYMBOLE.length,
                  { verbunden: mitStrom.length, von: SYMBOLE.length }) && alleOk;
if (sitzung.phase === "REGULAR") {
  alleOk = pruefung("ticksAAPLNVDA", "AAPL und NVDA liefern Kurse ohne Neuladen",
                    ["AAPL", "NVDA"].every((s) => (bericht.symbols.find((x) => x.symbol === s) || {}).ticks > 0),
                    bericht.symbols.filter((s) => ["AAPL", "NVDA"].includes(s.symbol))
                      .map((s) => s.symbol + ":" + s.ticks)) && alleOk;
  alleOk = pruefung("chartBewegt", "der Chart zeichnet sich neu, ohne Neuladen",
                    mitChart.length >= 2, { charts: mitChart.map((s) => s.symbol) }) && alleOk;
}
alleOk = pruefung("keineFehler", "keine Konsolenfehler auf den Aktienseiten", fehlerfrei,
                  bericht.symbols.filter((s) => s.consoleErrors.length).map((s) => s.symbol)) && alleOk;

/* §4: das Etikett ist die eine Aussage, die der Nutzer liest. Es darf
   "Live" nur sagen, wenn der Strom wirklich frisch ist - und es MUSS es
   sagen, wenn er es ist. Beides wird hier geprueft. */
if (sitzung.phase === "REGULAR") {
  const mitLive = bericht.symbols.filter((s) => s.labels.some((l) => /Live/i.test(l)));
  const liveOhneTicks = bericht.symbols.filter(
    (s) => s.ticks === 0 && s.labels.some((l) => /Live/i.test(l)));
  alleOk = pruefung("liveEtikett", "ein Titel mit frischen Kursen zeigt 'Markt geoeffnet · Live'",
                    mitLive.length >= 2,
                    bericht.symbols.map((s) => s.symbol + ": " + JSON.stringify(s.labels))) && alleOk;
  alleOk = pruefung("keinLiveOhneKurs", "kein Titel zeigt 'Live' ohne frische Kurse",
                    liveOhneTicks.length === 0,
                    liveOhneTicks.map((s) => s.symbol)) && alleOk;
}

/* §20 zweiter Teil: Abriss, Rueckfall, Wiederanlauf. */
{
  const p = await seite();
  await aktienseite(p, "AAPL");
  await p.waitForTimeout(6000);
  const vorher = await p.evaluate(() => {
    const Hub = window.VUDiscover.LiveHub;
    const l = document.querySelector(".dx-live-label");
    return { state: Hub.liveState().state, connected: Hub.liveState().connected,
             label: l ? l.textContent.trim() : null };
  });

  /* Der Abriss: dem Browser wird die Verbindung unter den Fuessen
     weggezogen, so wie es ein Funkloch tun wuerde. */
  await p.evaluate(() => {
    const Hub = window.VUDiscover.LiveHub;
    window.__vuVorAbriss = Hub.liveStats();
    Hub.liveClose("testAbriss");
  });
  /* Sofort nachsehen, nicht erst nach zwei Sekunden. Der Wiederanlauf
     setzt nach einer Sekunde ein - wer spaeter misst, misst ihn und
     nicht den Abriss. Genau das ist beim ersten Lauf passiert: "nach
     dem Abriss noch verbunden" war kein Befund ueber das Produkt,
     sondern einer ueber meinen Messzeitpunkt. */
  await p.waitForTimeout(300);
  const nachAbriss = await p.evaluate(() => {
    const Hub = window.VUDiscover.LiveHub;
    const l = document.querySelector(".dx-live-label");
    const svg = document.querySelector(".dx-intraday-chart, .dx-intraday svg");
    return { state: Hub.liveState().state, connected: Hub.liveState().connected,
             label: l ? l.textContent.trim() : null, chartDa: !!svg };
  });

  /* Und zurueck: der Hub baut von selbst wieder auf, sobald jemand
     zusieht und die Boerse offen ist. */
  await p.evaluate(() => {
    const Hub = window.VUDiscover.LiveHub;
    /* Sichtbarkeitswechsel ist der Weg, den auch ein Nutzer nimmt. */
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await p.waitForTimeout(8000);
  const nachWiederanlauf = await p.evaluate(() => {
    const Hub = window.VUDiscover.LiveHub;
    const l = document.querySelector(".dx-live-label");
    return { state: Hub.liveState().state, connected: Hub.liveState().connected,
             label: l ? l.textContent.trim() : null, stats: Hub.liveStats() };
  });

  bericht.reconnect = { vorher, nachAbriss, nachWiederanlauf };
  console.log("");
  console.log("  Abriss: " + vorher.state + " -> " + nachAbriss.state + " -> " + nachWiederanlauf.state);
  console.log("  Etikett: '" + vorher.label + "' -> '" + nachAbriss.label + "' -> '" + nachWiederanlauf.label + "'");

  alleOk = pruefung("abrissGemeldet", "nach dem Abriss ist der Strom nicht mehr verbunden",
                    nachAbriss.connected === false, nachAbriss) && alleOk;
  alleOk = pruefung("chartBleibt", "der Chart bleibt nach dem Abriss stehen (kein leerer Chart)",
                    nachAbriss.chartDa === true, nachAbriss) && alleOk;
  if (sitzung.phase === "REGULAR") {
    alleOk = pruefung("wiederanlauf", "der Strom baut von selbst wieder auf",
                      nachWiederanlauf.connected === true, nachWiederanlauf) && alleOk;
  }
  if (SHOTS) await p.screenshot({ path: SHOTS + "/realtime-fallback.png" });
  await p.context().close();
}

await browser.close();

bericht.result = alleOk ? "PASS" : "FAIL";
bericht.reason = alleOk ? null : bericht.checks.filter((c) => !c.ok).map((c) => c.id).join(",");
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "vu-realtime-browser-qa.json"), JSON.stringify(bericht, null, 2) + "\n");
console.log("");
console.log("ERGEBNIS: " + bericht.result + (bericht.reason ? " (" + bericht.reason + ")" : ""));
if (!alleOk) process.exit(1);
