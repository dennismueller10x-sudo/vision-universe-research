#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — screenshots-acceptance.mjs

   Die Aufnahmen fuer die Abnahme, nach §23 des Owner-Auftrags vom
   17.09.2026.

   Sie ersetzen kein Urteil. Sie sind das, was ein Mensch ansieht, wenn
   er entscheidet, ob das Produkt fertig aussieht - und sie sind in
   beiden Farbschemata aufgenommen, weil die Haelfte der Nutzer das
   andere benutzt.

   Der laufende Kurs ist hier NICHT zu sehen: diese Umgebung erreicht
   Cloudflare nicht. Die Live-Aufnahmen entstehen in GitHub Actions
   (browser-qa-realtime.mjs) und tragen "live" im Namen.
   ========================================================================= */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

function arg(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const BASE = arg("url", "http://localhost:8765").replace(/\/$/, "");
const OUT = arg("out", "docs/screenshots/discover-v41-realtime");
/* Heute gemessen: VLO steht im Plus, MSFT im Minus. Die Farbregel wird
   an echten Zahlen gezeigt, nicht an gewaehlten. */
const POSITIV = arg("positiv", "VLO");
const NEGATIV = arg("negativ", "MSFT");
mkdirSync(OUT, { recursive: true });

const MOBIL = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const DESK = { viewport: { width: 1440, height: 900 } };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function seite(schema, geraet) {
  const ctx = await browser.newContext(Object.assign({ colorScheme: schema }, geraet));
  return ctx.newPage();
}
const warte = (p, ms) => p.waitForTimeout(ms);

/* Die Abschnitte tragen keine eigenen Klassen, aber sprechende
   Ueberschriften - und die sind ohnehin das, was ein Mensch sucht. */
async function zuAbschnitt(p, ueberschrift) {
  return p.evaluate((text) => {
    const h = [...document.querySelectorAll("h2")]
      .find((x) => x.textContent.toLowerCase().includes(text.toLowerCase()));
    if (!h) return false;
    (h.closest("section") || h).scrollIntoView({ block: "start" });
    return true;
  }, ueberschrift);
}

const gemacht = [];
async function schuss(p, name) {
  await p.screenshot({ path: OUT + "/" + name + ".png" });
  gemacht.push(name);
  console.log("  " + name);
}

for (const schema of ["light", "dark"]) {
  const k = schema === "light" ? "hell" : "dunkel";

  /* 1 Discover, erster Bildschirm */
  const start = await seite(schema, MOBIL);
  await start.goto(BASE + "/discover/", { waitUntil: "networkidle" });
  await warte(start, 2500);
  await schuss(start, "mobil-" + k + "-01-discover-erster-bildschirm");

  /* 7 Schwebende Navigation - sie steht auf jedem Bildschirm, hier im
     gescrollten Zustand, damit sie ueber Inhalt liegt. */
  await start.evaluate(() => window.scrollBy(0, 900));
  await warte(start, 900);
  await schuss(start, "mobil-" + k + "-07-schwebende-navigation");

  /* 8 Entdecken-Feed - ueber denselben Knopf, den auch ein Nutzer
     drueckt (.dx-fnav-entdecken), und vom Seitenanfang aus: gescrollt
     liegt die schwebende Leiste teils unter Inhalt. */
  await start.evaluate(() => window.scrollTo(0, 0));
  await warte(start, 600);
  await start.click(".dx-fnav-entdecken");
  await warte(start, 2800);
  await schuss(start, "mobil-" + k + "-08-entdecken-feed");
  await start.context().close();

  /* 2-6 Aktienseite: grosser Chart, Journey, Cluster, Bewertung */
  const aktie = await seite(schema, MOBIL);
  await aktie.goto(BASE + "/discover/#/s/US_REAL/AAPL", { waitUntil: "networkidle" });
  await warte(aktie, 3000);
  await schuss(aktie, "mobil-" + k + "-02-grosser-chart");

  const abschnitte = [
    ["entwickelt hat", "04-fundamental-journey"],   /* Wie sich X entwickelt hat */
    ["wie steht", "05-metric-cluster"],             /* Wie steht X da? - die Cluster */
    ["ist apple teuer", "06-bewertung"],            /* Ist X teuer? - die Bewertung */
    ["dafür spricht", "10-chancen-und-risiken"],
    ["kennzahlen und herleitung", "11-analyse-hinter-der-grenze"]
  ];
  for (const [ueberschrift, name] of abschnitte) {
    if (await zuAbschnitt(aktie, ueberschrift)) {
      await warte(aktie, 1100);
      await schuss(aktie, "mobil-" + k + "-" + name);
    } else {
      console.log("  (nicht gefunden: " + ueberschrift + ")");
    }
  }
  await aktie.context().close();

  /* Farbregel an echten Zahlen */
  for (const [sym, wort] of [[POSITIV, "positiv-gruen"], [NEGATIV, "negativ-rot"]]) {
    const p = await seite(schema, MOBIL);
    await p.goto(BASE + "/discover/#/s/US_REAL/" + sym, { waitUntil: "networkidle" });
    await warte(p, 3000);
    await schuss(p, "mobil-" + k + "-09-" + wort + "-" + sym.toLowerCase());
    await p.context().close();
  }

  /* Schreibtisch */
  const d1 = await seite(schema, DESK);
  await d1.goto(BASE + "/discover/", { waitUntil: "networkidle" });
  await warte(d1, 2500);
  await schuss(d1, "desktop-" + k + "-01-discover");
  await d1.goto(BASE + "/discover/#/s/US_REAL/AAPL", { waitUntil: "networkidle" });
  await warte(d1, 3000);
  await schuss(d1, "desktop-" + k + "-02-aktienseite");
  await d1.context().close();
}

await browser.close();
console.log("");
console.log(gemacht.length + " Aufnahmen in " + OUT);
