/* =========================================================================
   VISION UNIVERSE — measure-live-chart.mjs

   DER LIVE-CHART, GEMESSEN — NICHT BEHAUPTET.

   Ein Protokolleintrag "WebSocket verbunden" ist kein Produkterfolg. Der
   Eigentuemer will den Chart sich bewegen sehen. Dieses Skript misst
   genau das, und zwar im Browser:

     1  Es startet die Auslieferung lokal, samt Serverfunktionen.
     2  Es oeffnet die echte Produktseite (/vu2/?view=stock&ticker=...).
     3  Es liest ueber die Zeit ab, was dort STEHT: Verbindungszustand,
        Zahl der Aktualisierungen, angezeigter Kurs.
     4  Es schreibt einen Bericht mit genau diesen Zahlen.

   WARUM LOKAL UND NICHT AUF VERCEL

   Weil der Schluessel dort (noch) nicht hinterlegt ist. Hier kommt er aus
   demselben GitHub-Secret, mit dem schon der Bestandslauf gefahren ist -
   der Weg Browser → Serverfunktion → Anbieter ist derselbe, nur die
   Adresse ist eine andere. Was dieser Lauf belegt, ist der WEG; was er
   nicht belegen kann, ist die Einstellung in einem fremden Konto.

   AUSSERHALB DER HANDELSZEITEN KOMMT NICHTS, UND DAS IST KEIN FEHLER.
   Der Bericht nennt dann die Sitzungslage und zaehlt null. Er erfindet
   keine Bewegung; ein simulierter Tick waere genau die Taeuschung, gegen
   die dieser ganze Nachweis steht.

   Ausfuehren:
     TIINGO_API_KEY=… node scripts/proof/measure-live-chart.mjs --ticker AAPL
   ========================================================================= */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const PORT = parseInt(arg("--port", "8123"), 10);
const FENSTER_MS = parseInt(arg("--window-ms", "75000"), 10);
const OUT = arg("--out", join(root, "quant", "data", "site"));
const SHOTS = arg("--shots", join(OUT, "live-chart-shots"));

/* Der Titel kommt aus der Freigabeliste, nicht aus dem Code: eine
   Messung an einem nicht freigegebenen Titel waere zwecklos. */
const freigabe = JSON.parse(readFileSync(join(root, "quant/config/development-preview.json"), "utf8"));
const TICKER = String(arg("--ticker", (freigabe.scope || [])[0] || "AAPL")).toUpperCase();

const TYP = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

const funktionen = {
  "/api/realtime": require(join(root, "api", "realtime.js")),
  "/api/intraday": require(join(root, "api", "intraday.js"))
};

function sitzungslage() {
  /* Grob, aber ehrlich: die Boersenzeit New Yorks gegen die Uhr. Der
     genaue Kalender steht in quant/config/market-calendar.json; fuer die
     Einordnung eines Messfensters reicht die Tageszeit. */
  const jetzt = new Date();
  const et = new Date(jetzt.getTime() - 4 * 3600000);
  const minuten = et.getUTCHours() * 60 + et.getUTCMinutes();
  const werktag = et.getUTCDay() >= 1 && et.getUTCDay() <= 5;
  const lage = !werktag ? "WEEKEND"
    : minuten >= 570 && minuten <= 960 ? "REGULAR"
    : minuten >= 240 && minuten < 570 ? "PREMARKET"
    : minuten > 960 && minuten <= 1200 ? "AFTERHOURS" : "CLOSED";
  return { phase: lage, localTimeET: et.toISOString().slice(11, 16), utc: jetzt.toISOString() };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const fn = funktionen[url.pathname.replace(/\/$/, "")];
  if (fn) { try { await fn(req, res); } catch (e) { res.statusCode = 500; res.end(String(e.message)); } return; }
  let pfad = decodeURIComponent(url.pathname);
  if (pfad.endsWith("/")) pfad += "index.html";
  let datei = join(root, pfad);
  try {
    const s = await stat(datei).catch(() => null);
    if (!s || s.isDirectory()) datei = join(root, pfad, "index.html");
    res.setHeader("Content-Type", TYP[extname(datei)] || "application/octet-stream");
    res.end(await readFile(datei));
  } catch (e) { res.statusCode = 404; res.end("not found"); }
});

const bericht = {
  generatedAt: new Date().toISOString(),
  scope: "liveChartInProduct",
  ticker: TICKER,
  session: sitzungslage(),
  keyConfigured: !!process.env.TIINGO_API_KEY,
  windowMs: FENSTER_MS,
  relay: { connected: null, subscribed: null, state: null, updates: 0, firstUpdateAt: null },
  browser: { statusText: null, updatesText: null, priceSeen: [], priceChanged: null, sparklinePoints: 0 },
  verdict: null, verdictReason: null
};

async function main() {
  if (!existsSync(join(root, "quant", "data", "proof", "index.json"))) {
    console.error("\n  Kein Produktdatensatz. Erst die beiden Bauskripte laufen lassen.\n");
    process.exit(2);
  }
  await new Promise((f) => server.listen(PORT, "127.0.0.1", f));
  const basis = `http://127.0.0.1:${PORT}`;
  console.log(`\nVision Universe — Live-Chart im Produkt gemessen\n`);
  console.log(`  Titel:        ${TICKER}`);
  console.log(`  Sitzung:      ${bericht.session.phase} (ET ${bericht.session.localTimeET})`);
  console.log(`  Schluessel:   ${bericht.keyConfigured ? "vorhanden" : "FEHLT — es wird nichts kommen"}`);
  console.log(`  Messfenster:  ${Math.round(FENSTER_MS / 1000)} s\n`);

  let chromium;
  try { ({ chromium } = await import("playwright")); }
  catch (e) {
    bericht.verdict = "SKIPPED"; bericht.verdictReason = "Kein Browser installiert.";
    return abschluss();
  }

  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  /* Was der Browser vom Weiterleiter empfaengt, wird mitgezaehlt - so
     laesst sich spaeter unterscheiden, ob die Seite nichts ANZEIGTE oder
     nichts BEKAM. */
  await page.exposeFunction("vuMesspunkt", (art, daten) => {
    if (art === "status" && daten.state === "CONNECTED") { bericht.relay.connected = true; bericht.relay.state = "CONNECTED"; }
    if (art === "status" && daten.state !== "CONNECTED") { bericht.relay.state = daten.state; bericht.relay.connected = bericht.relay.connected || false; }
    if (art === "subscribed") bericht.relay.subscribed = true;
    if (art === "tick") {
      bericht.relay.updates = daten.seq || bericht.relay.updates + 1;
      if (!bericht.relay.firstUpdateAt) bericht.relay.firstUpdateAt = daten.receivedAt || new Date().toISOString();
    }
    if (art === "summary" && typeof daten.updates === "number") bericht.relay.updates = daten.updates;
  });
  await page.addInitScript(() => {
    const Original = window.EventSource;
    window.EventSource = function (url, init) {
      const es = new Original(url, init);
      ["status", "subscribed", "tick", "summary"].forEach((art) => {
        es.addEventListener(art, (e) => {
          try { window.vuMesspunkt(art, JSON.parse(e.data)); } catch (err) { /* egal */ }
        });
      });
      return es;
    };
    window.EventSource.prototype = Original.prototype;
  });

  await page.goto(`${basis}/vu2/?view=stock&ticker=${TICKER}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".vu-live", { timeout: 40000 });

  const bis = Date.now() + FENSTER_MS;
  const gesehen = new Set();
  while (Date.now() < bis) {
    await page.waitForTimeout(2500);
    const zustand = await page.evaluate(() => {
      const wurzel = document.querySelector(".vu-live");
      if (!wurzel) return null;
      const pille = wurzel.querySelector(".pill");
      const kurs = wurzel.querySelector(".quote");
      const zeilen = Array.prototype.slice.call(wurzel.querySelectorAll("p.muted"))
        .map((p) => p.textContent).filter((t) => /Aktualisierungen|Verbunden|Kursereignisse/.test(t));
      return {
        status: pille ? pille.textContent : null,
        kurs: kurs ? kurs.textContent : null,
        zeile: zeilen[0] || null,
        punkte: (wurzel.querySelector(".vu-live-spark polyline")?.getAttribute("points") || "").split(" ").filter(Boolean).length
      };
    });
    if (!zustand) break;
    bericht.browser.statusText = zustand.status;
    bericht.browser.updatesText = zustand.zeile;
    bericht.browser.sparklinePoints = Math.max(bericht.browser.sparklinePoints, zustand.punkte);
    if (zustand.kurs && zustand.kurs !== "–") gesehen.add(zustand.kurs);
    process.stdout.write(`  [${new Date().toISOString().slice(11, 19)}] ${String(zustand.status).padEnd(16)}` +
      ` Kurs ${String(zustand.kurs).padEnd(12)} ${zustand.zeile || ""}\n`);
  }

  bericht.browser.priceSeen = Array.from(gesehen).slice(0, 12);
  bericht.browser.priceChanged = gesehen.size > 1;
  await page.screenshot({ path: join(SHOTS, "live-chart.png") });
  await ctx.close(); await browser.close();
  return abschluss();
}

function abschluss() {
  const r = bericht.relay, b = bericht.browser;
  if (!bericht.keyConfigured) {
    bericht.verdict = "BLOCKED_NO_KEY";
    bericht.verdictReason = "Ohne TIINGO_API_KEY kann der Weiterleiter nichts holen. Das ist eine " +
      "Einstellung, kein Programmfehler.";
  } else if (r.updates > 0 && b.priceChanged) {
    bericht.verdict = "LIVE_CHART_VISIBLE";
    bericht.verdictReason = `${r.updates} Aktualisierungen im Fenster, und der angezeigte Kurs hat sich ` +
      `sichtbar geaendert (${b.priceSeen.length} verschiedene Werte).`;
  } else if (r.updates > 0) {
    bericht.verdict = "UPDATES_WITHOUT_VISIBLE_CHANGE";
    bericht.verdictReason = `${r.updates} Aktualisierungen empfangen, aber der angezeigte Wert hat sich ` +
      `nicht geaendert - das waere ein Anzeigefehler und kein Datenproblem.`;
  } else if (r.connected) {
    bericht.verdict = "CONNECTED_NO_EVENTS";
    bericht.verdictReason = `Der Weg steht: verbunden${r.subscribed ? " und abonniert" : ""}, aber im ` +
      `Messfenster kam kein Kursereignis. Sitzungslage: ${bericht.session.phase}. ` +
      (bericht.session.phase === "REGULAR"
        ? "Bei offener Boerse ist das ein Befund, der dem Anbieter gehoert."
        : "Ausserhalb der Handelszeiten ist das der Normalfall - es wird nichts erfunden.");
  } else {
    bericht.verdict = "NO_CONNECTION";
    bericht.verdictReason = `Der Weiterleiter kam nicht zustande (Zustand ${r.state || "unbekannt"}).`;
  }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "live-chart-measurement.json"), JSON.stringify(bericht, null, 2) + "\n");

  console.log(`\n  Verbunden:        ${r.connected}`);
  console.log(`  Abonniert:        ${r.subscribed}`);
  console.log(`  Aktualisierungen: ${r.updates}${r.firstUpdateAt ? " · erste " + r.firstUpdateAt : ""}`);
  console.log(`  Angezeigt:        ${b.statusText || "–"} · ${b.updatesText || "–"}`);
  console.log(`  Kurs sichtbar:    ${b.priceSeen.join(" → ") || "–"}`);
  console.log(`\n  Urteil: ${bericht.verdict}\n  ${bericht.verdictReason}\n`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, [
      `## Live-Chart im Produkt — ${bericht.verdict}`, "", bericht.verdictReason, "",
      `| Messpunkt | Wert |`, `|---|---|`,
      `| Titel | ${bericht.ticker} |`,
      `| Sitzung | ${bericht.session.phase} (ET ${bericht.session.localTimeET}) |`,
      `| Schluessel gesetzt | ${bericht.keyConfigured} |`,
      `| Verbindung | ${r.connected} |`,
      `| Abonnement | ${r.subscribed} |`,
      `| Aktualisierungen | ${r.updates} |`,
      `| Erste Aktualisierung | ${r.firstUpdateAt || "–"} |`,
      `| Angezeigter Zustand | ${b.statusText || "–"} |`,
      `| Kurs sichtbar geaendert | ${b.priceChanged} |`
    ].join("\n") + "\n", { flag: "a" });
  }

  server.close();
  /* Ein Messergebnis ist kein Fehlschlag: auch "kein Ereignis" ist ein
     Befund. Rot ist nur, was gar nicht laeuft. */
  process.exit(bericht.verdict === "NO_CONNECTION" ? 1 : 0);
}

main().catch((err) => {
  console.error("\n  ABBRUCH: " + ((err && err.stack) || err) + "\n");
  server.close();
  process.exit(1);
});
