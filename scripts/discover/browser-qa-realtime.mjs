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
   "Markt geoeffnet - Live" ueberhaupt entstehen.

   Dritter Lauf: mit der Korrektur am Etikett (isLive und Ortszeit in der
   abgeleiteten Sicht). */

const bericht = {
  schemaVersion: "vu-realtime-browser-qa-1.1.0",
  auftrag: "Owner 17.09.2026 §19/§20: Realtime auf der Aktienseite, im echten Browser",
  checkedAt: new Date().toISOString(),
  origin: URSPRUNG,
  session: { phase: sitzung.phase, localTime: sitzung.localTime, isOpen: sitzung.isOpen },
  note: "Die Seite laeuft unter ihrem echten Ursprung; nur der Name ist im Testbrowser auf 127.0.0.1 " +
        "abgebildet. Die Ursprungspruefung des Workers laeuft dabei unveraendert.",
  honesty: "Ein Titel ohne Marktereignis liefert keinen Kurs. Das ist kein Systemfehler und wird hier " +
           "auch nicht als Latenz gezaehlt.",
  symbols: [], reconnect: null, expiry: null, checks: [], result: "UNKNOWN", reason: null
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

/* Der Chart liegt unter dem Kopf. Fuer eine Aufnahme, die den laufenden
   Kurs zeigen soll, wird dorthin gescrollt - und der Kopf mit seiner
   Kurszahl bleibt gerade noch im Bild, damit beide Zahlen zugleich zu
   sehen sind. */
async function zumChart(p) {
  await p.evaluate(() => {
    const h = [...document.querySelectorAll("h2")].find((x) => /kursverlauf/i.test(x.textContent));
    if (h) (h.closest("section") || h).scrollIntoView({ block: "start" });
    else window.scrollBy(0, 700);
  });
  await p.waitForTimeout(900);
}

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

  /* §5: der Kopf und der Chart duerfen nicht zwei verschiedene Kurse
     zeigen. Vor der Korrektur stand oben der letzte ausgelieferte
     Tagesschluss und darunter der laufende - beide richtig, beide auf
     etwas anderes bezogen, und der Leser durfte raten. */
  const kurse = await p.evaluate(() => {
    const kopf = document.querySelector(".dx-price b.num");
    const chart = document.querySelector(".dx-chart-hero-preis > b.num");
    const zahl = (n) => {
      if (!n) return null;
      const t = n.textContent.replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", ".");
      const v = parseFloat(t);
      return isFinite(v) ? v : null;
    };
    return { kopf: zahl(kopf), chart: zahl(chart),
             kopfText: kopf ? kopf.parentElement.textContent.trim().slice(0, 60) : null };
  });
  const abweichung = (kurse.kopf && kurse.chart)
    ? Math.abs(kurse.kopf - kurse.chart) / kurse.chart : null;

  const eintrag = {
    symbol: sym,
    prices: Object.assign({}, kurse, { deviation: abweichung }),
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
    /* Auf den Chart, nicht auf den Seitenanfang: die Aufnahme soll
       zeigen, worum es geht. Beim ersten Versuch war der laufende Kurs
       unter der Falz. */
    await zumChart(p);
    await p.screenshot({ path: SHOTS + "/mobil-dunkel-03-live-" + sym.toLowerCase() + ".png" });
  }
  await p.context().close();

  /* Und dieselbe Flaeche im hellen Schema - die Haelfte der Nutzer sieht
     sie so, und ein Etikett, das nur im Dunkeln lesbar ist, ist keines. */
  if (SHOTS && (sym === "AAPL" || sym === "NVDA")) {
    const hell = await seite(Object.assign({}, MOBIL, { colorScheme: "light" }));
    await aktienseite(hell, sym);
    await hell.waitForTimeout(10000);
    await zumChart(hell);
    await hell.screenshot({ path: SHOTS + "/mobil-hell-03-live-" + sym.toLowerCase() + ".png" });
    await hell.context().close();
  }
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
if (sitzung.phase === "REGULAR") {
  /* Ein Prozent Toleranz: der Kopf zeigt gerundet, der Chart auch, und
     zwischen zwei Ticks liegt eine Sekunde. Fuenf Prozent Unterschied
     wie am 17.09. bei NVDA sind keine Rundung. */
  const auseinander = bericht.symbols.filter(
    (s) => s.ticks > 0 && s.prices.deviation !== null && s.prices.deviation > 0.01);
  alleOk = pruefung("einKurs", "Kopf und Chart zeigen denselben Kurs",
                    auseinander.length === 0,
                    bericht.symbols.map((s) => s.symbol + ": " + JSON.stringify(s.prices))) && alleOk;
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

/* §20 dritter Teil: der Widerruf.
 *
 * Der zweite Teil zeigt den Abriss - aber nicht, dass das Etikett
 * danach auch verschwindet. Direkt nach dem Abriss steht dort mit Recht
 * noch "Live": der letzte Kurs ist eine Drittelsekunde alt. Die Zusage
 * aus §4 ist eine andere - eine Kursreferenz, die aelter als 90
 * Sekunden ist, darf nicht mehr "Live" heissen.
 *
 * Also wird hier der Wiederanlauf verhindert (die Fabrik liefert einen
 * Socket, der nie aufgeht - ein Funkloch, das bleibt) und gewartet, bis
 * das Fenster abgelaufen ist. Danach muss dort der ehrliche Stand mit
 * Uhrzeit stehen, und der Chart muss noch da sein. */
if (sitzung.phase === "REGULAR") {
  const p = await seite();
  await aktienseite(p, "AAPL");
  await p.waitForTimeout(8000);

  const vorher = await p.evaluate(() => {
    const l = document.querySelector(".dx-live-label");
    return { label: l ? l.textContent.trim() : null,
             live: window.VUDiscover.LiveHub.liveValue("AAPL") ? true : false };
  });

  /* Erst das Funkloch, dann der Abriss - in dieser Reihenfolge, sonst
     ist die Verbindung nach einer Sekunde wieder da. */
  await p.evaluate(() => {
    window.WebSocket = function Funkloch() {
      this.readyState = 3;
      setTimeout(() => { if (this.onerror) this.onerror({ type: "error" });
                         if (this.onclose) this.onclose({ code: 1006, reason: "Funkloch" }); }, 10);
    };
    window.WebSocket.prototype.send = function () {};
    window.WebSocket.prototype.close = function () {};
    window.VUDiscover.LiveHub.liveClose("testVerfall");
  });

  /* Das Fenster ist 90 Sekunden; gewartet wird bis sicher darueber. */
  const frisch = await p.evaluate(() => {
    const m = window.VUDiscoverMeta;
    const s = m && m.realtime && m.realtime.stream;
    return (s && s.freshSeconds) || 90;
  });
  await p.waitForTimeout(frisch * 1000 + 8000);

  const nachher = await p.evaluate(() => {
    const Hub = window.VUDiscover.LiveHub;
    const l = document.querySelector(".dx-live-label");
    const svg = document.querySelector(".dx-intraday-chart, .dx-intraday svg");
    const punkte = svg ? (svg.querySelector("path[d]") || {}).getAttribute : null;
    return { label: l ? l.textContent.trim() : null,
             connected: Hub.liveState().connected, state: Hub.liveState().state,
             chartDa: !!svg, chartHatLinie: !!punkte,
             kopf: (document.querySelector(".dx-chart-hero-preis > b.num") || {}).textContent || null };
  });

  bericht.expiry = { freshSeconds: frisch, vorher, nachher };
  console.log("");
  console.log("  Widerruf: '" + vorher.label + "' -> '" + nachher.label + "' nach " + frisch + " s ohne Kurs");

  alleOk = pruefung("liveWiderrufen",
                    "nach " + frisch + " s ohne frischen Kurs sagt die Seite nicht mehr 'Live'",
                    !!nachher.label && !/Live/i.test(nachher.label), nachher) && alleOk;
  alleOk = pruefung("snapshotUebernimmt",
                    "der Snapshot uebernimmt: ehrlicher Stand mit Uhrzeit, Chart bleibt gezeichnet",
                    !!nachher.chartDa && !!nachher.chartHatLinie && /Stand|Handelstag/i.test(nachher.label || ""),
                    nachher) && alleOk;
  if (SHOTS) { await zumChart(p); await p.screenshot({ path: SHOTS + "/realtime-widerruf.png" }); }
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
