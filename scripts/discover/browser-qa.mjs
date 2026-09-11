/* =========================================================================
   VISION UNIVERSE DISCOVER — browser-qa.mjs

   Die Pruefungen aus §19/§20 des Auftrags, die sich NICHT in Node
   nachstellen lassen: Chart-Aufbau, Zeitraumwechsel, Kartennavigation,
   Suche, Ueberlagerungen, Leerzustaende und das Verhalten auf einem
   kleinen Display.

   Warum das hier steht und nicht in der CI: dieses Repository hat keinen
   Paketmanager-Stand und keine Browser-Abhaengigkeit. Eine hinzuzufuegen,
   nur damit eine Pruefung automatisch laeuft, waere ein groesserer
   Eingriff in das bestehende System als das ganze Modul. Das Skript ist
   deshalb ausfuehrbar, wo Playwright vorhanden ist - und es ist genau der
   Ablauf, mit dem diese Fassung visuell abgenommen wurde.

   Voraussetzung:  npm i playwright   (oder ein vorhandener Chromium)
   Ausfuehren:     node scripts/discover/browser-qa.mjs [--url http://localhost:8765]
                   [--shots verzeichnis]

   Einen lokalen Server startet man vorher mit:
                   python3 -m http.server 8765
   ========================================================================= */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf("--" + name);
  return i === -1 ? fallback : args[i + 1];
}
const BASE = arg("url", "http://localhost:8765");
const SHOTS = arg("shots", null);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch (err) {
  console.error("Playwright ist nicht installiert. 'npm i playwright' und erneut versuchen.");
  process.exit(2);
}

const results = [];
let failures = 0;

async function check(name, fn) {
  try {
    await fn();
    results.push(["ok  ", name]);
  } catch (err) {
    failures++;
    results.push(["FAIL", name + " — " + (err && err.message ? err.message : err)]);
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined
});

/* Konsolenfehler gelten als Fehlschlag - ausser den beiden, die nichts mit
   der Anwendung zu tun haben: die Webfont-Quelle und das fehlende Favicon.
   Geprueft wird die HERKUNFT der Meldung, nicht ihr Text: der Browser
   meldet einen fehlgeschlagenen Abruf als "Failed to load resource" ohne
   die URL, und ein Textfilter darauf wuerde auch echte Fehler verschlucken. */
const IGNORE = /fonts\.googleapis|fonts\.gstatic|favicon\.ico/;

async function openPage(viewport, mobile) {
  const page = await browser.newPage({ viewport, isMobile: !!mobile, hasTouch: !!mobile });
  const errors = [];
  page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const herkunft = (m.location && m.location().url) || "";
    if (IGNORE.test(herkunft) || IGNORE.test(m.text())) return;
    errors.push("CONSOLE " + m.text() + " (" + herkunft + ")");
  });
  page.on("requestfailed", (r) => {
    if (IGNORE.test(r.url())) return;
    errors.push("REQUEST " + r.url() + " " + ((r.failure() && r.failure().errorText) || ""));
  });
  page.__errors = errors;
  return page;
}

async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, name + ".png"), fullPage: false });
}

/* ------------------------------------------------------------ Startseite */
const desktop = await openPage({ width: 1440, height: 900 });
await desktop.goto(BASE + "/discover/", { waitUntil: "networkidle" });
await desktop.waitForTimeout(2600);

await check("Startseite baut alle Zeilen auf", async () => {
  const zeilen = await desktop.$$(".d-row");
  assert(zeilen.length >= 6, "nur " + zeilen.length + " Zeilen gerendert");
});

await check("jede Zeile zeigt Karten oder einen benannten Leerzustand", async () => {
  const befund = await desktop.$$eval(".d-row", (rows) => rows.map((r) => ({
    titel: r.querySelector("h2") ? r.querySelector("h2").textContent : "?",
    karten: r.querySelectorAll(".d-card").length,
    leer: !!r.querySelector(".d-empty")
  })));
  for (const row of befund) {
    assert(row.karten > 0 || row.leer, "Zeile " + row.titel + " ist leer ohne Erklaerung");
  }
});

await check("keine Karte zeigt einen Platzhalterwert statt einer Auskunft", async () => {
  const texte = await desktop.$$eval(".d-card", (cards) => cards.map((c) => c.textContent));
  for (const text of texte) {
    assert(!/\b(NaN|undefined|null|0,00 \$)\b/.test(text), "Karte enthaelt: " + text.slice(0, 80));
  }
});

await check("grosse Liste: 24 Karten in einer Kategorie unter 3 Sekunden", async () => {
  const start = Date.now();
  await desktop.goto(BASE + "/discover/#/c/US_REAL/market-leaders", { waitUntil: "networkidle" });
  await desktop.waitForSelector(".d-card", { timeout: 8000 });
  await desktop.waitForTimeout(600);
  const karten = await desktop.$$(".d-card");
  const dauer = Date.now() - start;
  assert(karten.length >= 20, "nur " + karten.length + " Karten");
  assert(dauer < 3000, "Aufbau dauerte " + dauer + " ms");
  await shot(desktop, "kategorie");
});

await check("Filter greift und meldet auch den leeren Fall", async () => {
  const chips = await desktop.$$(".d-chip");
  assert(chips.length > 1, "keine Filterchips");
  const vorher = (await desktop.$$(".d-card")).length;
  await chips[1].click();
  await desktop.waitForTimeout(500);
  const nachher = (await desktop.$$(".d-card")).length;
  const leer = await desktop.$(".d-empty");
  assert(nachher <= vorher, "Filter hat die Liste vergroessert");
  assert(nachher > 0 || leer, "Filter liefert nichts und sagt nichts");
});

await check("Kartennavigation fuehrt auf die Detailseite", async () => {
  await desktop.goto(BASE + "/discover/", { waitUntil: "networkidle" });
  await desktop.waitForTimeout(2400);
  const symbol = await desktop.$eval(".d-card .d-sym", (n) => n.textContent);
  await desktop.click(".d-card");
  await desktop.waitForSelector(".d-detail-id h1", { timeout: 8000 });
  assert(desktop.url().indexOf("#/s/") !== -1, "Hash wurde nicht gesetzt: " + desktop.url());
  const ueberschrift = await desktop.textContent(".d-detail-id p");
  assert(ueberschrift.indexOf(symbol) !== -1, "Detailseite zeigt ein anderes Symbol");
});

/* --------------------------------------------------------------- Suche */
await check("Suche findet einen Titel und oeffnet ihn", async () => {
  await desktop.goto(BASE + "/discover/", { waitUntil: "networkidle" });
  await desktop.waitForTimeout(2400);
  await desktop.fill(".d-search input", "NV");
  await desktop.waitForTimeout(800);
  const treffer = await desktop.$$(".d-results button");
  assert(treffer.length > 0, "kein Treffer fuer NV");
  await treffer[0].click();
  await desktop.waitForSelector(".d-detail-id h1", { timeout: 8000 });
});

await check("Suche ohne Treffer sagt das, statt leer zu bleiben", async () => {
  await desktop.goto(BASE + "/discover/", { waitUntil: "networkidle" });
  await desktop.waitForTimeout(2400);
  await desktop.fill(".d-search input", "ZZZZQQ");
  await desktop.waitForTimeout(800);
  const text = await desktop.textContent(".d-results");
  assert(/passt zu/.test(text), "kein Hinweis auf das leere Ergebnis");
});

/* ---------------------------------------------------------------- Chart */
await check("Chart wird aufgebaut (Titel mit Kursreihe)", async () => {
  await desktop.goto(BASE + "/discover/#/s/US_REAL/NVDA", { waitUntil: "networkidle" });
  await desktop.waitForSelector(".d-chart-box svg", { timeout: 10000 });
  const pfade = await desktop.$$eval(".d-chart-box svg path", (ns) => ns.length);
  assert(pfade > 0, "der Chart enthaelt keine Linie");
  await shot(desktop, "chart");
});

await check("Zeitraumwechsel zeichnet neu", async () => {
  const vorher = await desktop.$eval(".d-chart-box svg", (s) => s.innerHTML.length);
  await desktop.click('.d-tf button:text-is("3M")');
  await desktop.waitForTimeout(900);
  const nachher = await desktop.$eval(".d-chart-box svg", (s) => s.innerHTML.length);
  const aktiv = await desktop.$eval('.d-tf button:text-is("3M")', (b) => b.getAttribute("aria-pressed"));
  assert(aktiv === "true", "der gewaehlte Zeitraum ist nicht markiert");
  assert(vorher !== nachher, "der Chart hat sich nicht veraendert");
});

await check("gesperrte Zeitraeume sind abgeblendet und begruendet", async () => {
  const eintag = await desktop.$('.d-tf button:text-is("1D")');
  assert(eintag, "kein 1D-Knopf");
  const disabled = await eintag.getAttribute("disabled");
  const titel = await eintag.getAttribute("title");
  assert(disabled !== null, "1D ist nicht gesperrt, obwohl Intraday aus ist");
  assert(titel && titel.length > 10, "der gesperrte Zeitraum nennt keinen Grund");
});

await check("Ueberlagerungen lassen sich zuschalten", async () => {
  await desktop.click('.d-ov:text-is("EMA 20")');
  await desktop.waitForTimeout(800);
  const legende = await desktop.textContent(".d-chart-legend");
  assert(/EMA 20/.test(legende), "die Legende kennt die zugeschaltete Serie nicht");
  await desktop.click('.d-ov:text-is("Support / Resistance")');
  await desktop.waitForTimeout(900);
  const zonen = await desktop.$$eval(".d-chart-box svg .ann-zone", (ns) => ns.length);
  assert(zonen > 0, "keine Support-/Resistance-Zonen gezeichnet");
  await shot(desktop, "overlays");
});

await check("Indikator-Panels erscheinen", async () => {
  await desktop.click('.d-ov:text-is("RSI 14")');
  await desktop.waitForTimeout(900);
  const text = await desktop.textContent(".d-detail");
  assert(/RSI 14/.test(text), "kein RSI-Panel");
});

await check("Titel ohne Kursreihe nennt den Grund statt einer leeren Flaeche", async () => {
  await desktop.goto(BASE + "/discover/#/s/US_REAL/VLO", { waitUntil: "networkidle" });
  await desktop.waitForTimeout(2000);
  const text = await desktop.textContent(".d-detail");
  assert(/Kursreihe/.test(text), "kein Hinweis auf die fehlende Kursreihe");
  const spanne = await desktop.$(".d-range-track");
  assert(spanne, "ohne Kursreihe fehlt auch die Jahresspanne");
});

await check("Elliott wird nie als Ergebnis gezeigt, wenn keines vorliegt", async () => {
  const zustand = await desktop.$eval(".d-ti-state", (n) => n.textContent.trim());
  const text = await desktop.textContent(".d-ti");
  assert(["Verfuegbar", "Geringe Konfidenz", "Wird berechnet", "Nicht verfuegbar"].indexOf(zustand) !== -1,
    "unbekannter Elliott-Zustand: " + zustand);
  if (zustand === "Nicht verfuegbar") {
    assert(!/Welle \d/.test(text), "eine Welle wird genannt, obwohl keine vorliegt");
  }
});

await check("keine Konsolenfehler auf dem Desktop", async () => {
  assert(desktop.__errors.length === 0, desktop.__errors.join(" | "));
});

/* --------------------------------------------------------------- Mobil */
const mobil = await openPage({ width: 390, height: 844 }, true);
await mobil.goto(BASE + "/discover/", { waitUntil: "networkidle" });
await mobil.waitForTimeout(2600);

await check("mobil: nichts laeuft seitlich aus dem Bild", async () => {
  const ueberstand = await mobil.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(ueberstand <= 2, "die Seite ist " + ueberstand + " px zu breit");
  await shot(mobil, "mobil-start");
});

await check("mobil: die Reihen lassen sich horizontal wischen", async () => {
  const messung = await mobil.$eval(".d-rail", (r) => ({ scroll: r.scrollWidth, sicht: r.clientWidth }));
  assert(messung.scroll > messung.sicht + 40, "die Reihe scrollt nicht");
  await mobil.$eval(".d-rail", (r) => { r.scrollLeft = 260; });
  await mobil.waitForTimeout(400);
  const danach = await mobil.$eval(".d-rail", (r) => r.scrollLeft);
  assert(danach > 100, "die Reihe hat sich nicht bewegt");
});

await check("mobil: der Chart passt in die Breite", async () => {
  await mobil.goto(BASE + "/discover/#/s/US_REAL/NVDA", { waitUntil: "networkidle" });
  await mobil.waitForSelector(".d-chart-box svg", { timeout: 10000 });
  await mobil.waitForTimeout(900);
  const breite = await mobil.$eval(".d-chart-box svg", (s) => s.getBoundingClientRect().width);
  assert(breite <= 390, "der Chart ist " + Math.round(breite) + " px breit");
  const ueberstand = await mobil.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(ueberstand <= 2, "die Detailseite ist " + ueberstand + " px zu breit");
  await shot(mobil, "mobil-chart");
});

await check("mobil: die Zeitraumleiste bleibt bedienbar", async () => {
  const knoepfe = await mobil.$$(".d-tf button");
  assert(knoepfe.length >= 5, "zu wenige Zeitraeume");
  const hoehe = await mobil.$eval(".d-tf button", (b) => b.getBoundingClientRect().height);
  assert(hoehe >= 30, "die Knoepfe sind mit " + Math.round(hoehe) + " px zu klein zum Tippen");
});

await check("keine Konsolenfehler auf dem Telefon", async () => {
  assert(mobil.__errors.length === 0, mobil.__errors.join(" | "));
});

await browser.close();

console.log("\nVision Universe DISCOVER — Browser-QA\n");
for (const [status, name] of results) console.log(`  ${status}  ${name}`);
console.log(`\n  ${results.length - failures}/${results.length} bestanden\n`);
process.exit(failures ? 1 : 0);
