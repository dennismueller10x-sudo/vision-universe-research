/* =========================================================================
   VISION UNIVERSE DISCOVER — browser-qa.mjs

   Die Prüfungen, die sich in Node nicht nachstellen lassen: Eingangsfläche,
   Reihen, Poster-Varianten, Hover, Suche, Kategorie, Detail, Chart,
   Zustände ohne ausgelieferte Kursreihe, Modelluniversum, Telefon,
   reduzierte Bewegung und horizontaler Überlauf.

   Warum das hier steht und nicht in der CI: dieses Repository hat keinen
   Paketmanager-Stand und keine Browser-Abhängigkeit. Eine hinzuzufügen,
   nur damit eine Prüfung automatisch läuft, wäre ein größerer Eingriff in
   das bestehende System als das ganze Modul. Das Skript ist deshalb
   ausführbar, wo Playwright vorhanden ist - und es ist genau der Ablauf,
   mit dem diese Fassung visuell abgenommen wurde.

   Voraussetzung:  npm i playwright   (oder ein vorhandener Chromium)
   Ausführen:      node scripts/discover/browser-qa.mjs [--url http://localhost:8765]
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
function assert(condition, message) { if (!condition) throw new Error(message); }

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

/* Konsolenfehler gelten als Fehlschlag - ausser den beiden, die nichts mit
   der Anwendung zu tun haben. Geprüft wird die HERKUNFT der Meldung, nicht
   ihr Text: der Browser meldet einen fehlgeschlagenen Abruf als "Failed to
   load resource" ohne URL, und ein Textfilter darauf würde auch echte
   Fehler verschlucken. */
const IGNORE = /fonts\.googleapis|fonts\.gstatic|favicon\.ico/;

async function openPage(options) {
  const page = await browser.newPage(options);
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
  if (SHOTS) await page.screenshot({ path: join(SHOTS, name + ".png") });
}
async function ueberstand(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/* =============================================================== DESKTOP */
const desktop = await openPage({ viewport: { width: 1440, height: 900 } });
await desktop.goto(BASE + "/discover/", { waitUntil: "networkidle" });
await desktop.waitForTimeout(3200);

await check("Eingangsfläche trägt einen echten Titel mit Signal und Kennzahlen", async () => {
  await desktop.waitForSelector(".dx-hero-title", { timeout: 10000 });
  const titel = (await desktop.textContent(".dx-hero-title")).trim();
  const kicker = (await desktop.textContent(".dx-kicker")).trim();
  const stats = await desktop.$$(".dx-hero-stats .dx-stat");
  assert(titel.length > 1, "kein Titel in der Eingangsfläche");
  assert(kicker.length > 3, "kein Signal in der Eingangsfläche");
  assert(stats.length >= 2, "weniger als zwei Kennzahlen");
  const cta = await desktop.getAttribute(".dx-cta .dx-btn", "href");
  assert(/#\/s\//.test(cta || ""), "die Eingangsfläche führt nicht auf einen Titel");
  await shot(desktop, "01-hero");
});

await check("Eingangsfläche zeigt ein Datenbild aus echten Werten", async () => {
  const pfade = await desktop.$$eval(".dx-hero-chart path", (ns) => ns.length);
  assert(pfade > 0, "kein Verlauf in der Eingangsfläche");
  const bildunterschrift = await desktop.textContent(".dx-hero-caption");
  assert(/Renditepfad|Kursverlauf/.test(bildunterschrift), "das Datenbild ist nicht benannt");
});

await check("Featured-Wechsel über die Striche", async () => {
  const striche = await desktop.$$(".dx-hero-nav button");
  assert(striche.length >= 2, "nur ein Featured-Titel");
  const vorher = await desktop.textContent(".dx-hero-title");
  await striche[1].click();
  await desktop.waitForTimeout(600);
  const nachher = await desktop.textContent(".dx-hero-title");
  assert(vorher !== nachher, "der Wechsel ändert die Eingangsfläche nicht");
});

await check("Signature-Reihe: TOP 10 mit Rangziffern", async () => {
  const ziffern = await desktop.$$eval('[data-row="top-10"] .dx-rank-num',
    (ns) => ns.map((n) => n.textContent.trim()));
  assert(ziffern.length === 10, "TOP 10 zeigt " + ziffern.length + " Titel");
  assert(ziffern[0] === "01" && ziffern[9] === "10", "Rangziffern stimmen nicht: " + ziffern.join(","));
  await shot(desktop, "02-top10");
});

await check("Die Reihen haben verschiedene Formen (§6)", async () => {
  const formen = await desktop.evaluate(() => ({
    rang: document.querySelectorAll(".dx-rank").length,
    poster: document.querySelectorAll(".dx-poster:not(.dx-poster--compact)").length,
    kompakt: document.querySelectorAll(".dx-poster--compact").length,
    sektor: document.querySelectorAll(".dx-sector").length
  }));
  assert(formen.rang >= 10, "keine Rang-Poster");
  assert(formen.poster > 0, "keine Standard-Poster");
  assert(formen.kompakt > 0, "keine kompakten Poster");
  assert(formen.sektor > 0, "keine Sektorkacheln");
});

await check("Jedes Poster zeigt Symbol, Signal und einen Verlauf", async () => {
  const befund = await desktop.$$eval(".dx-poster", (posters) => posters.slice(0, 24).map((p) => ({
    sym: (p.querySelector(".dx-poster-sym") || {}).textContent || "",
    media: p.querySelectorAll(".dx-poster-media svg path").length,
    text: p.textContent
  })));
  for (const p of befund) {
    assert(p.sym.trim().length > 0, "Poster ohne Symbol");
    assert(p.media > 0, p.sym + ": kein Verlauf gezeichnet");
    assert(!/\b(NaN|undefined|null)\b/.test(p.text), p.sym + ": Platzhalterwert auf der Karte");
  }
});

await check("Keine Wiederholung derselben Titel über die Startseite (§6)", async () => {
  const symbole = await desktop.$$eval(".dx-rail-section .dx-poster .dx-poster-sym",
    (ns) => ns.map((n) => n.textContent.trim()));
  const zaehler = {};
  symbole.forEach((s) => { zaehler[s] = (zaehler[s] || 0) + 1; });
  const mehrfach = Object.keys(zaehler).filter((s) => zaehler[s] > 1);
  assert(mehrfach.length === 0, "mehrfach auf der Startseite: " + mehrfach.join(", "));
});

await check("Hover zeigt zusätzliche Intelligence", async () => {
  const poster = desktop.locator(".dx-rail-section .dx-poster").nth(11);
  await poster.hover();
  await desktop.waitForTimeout(600);
  const sichtbar = await poster.evaluate((node) => {
    const reveal = node.querySelector(".dx-reveal");
    return reveal ? Number(getComputedStyle(reveal).opacity) : -1;
  });
  assert(sichtbar > 0.7, "der Hover-Vorhang bleibt unsichtbar (" + sichtbar + ")");
  const skaliert = await poster.evaluate((node) => getComputedStyle(node).transform);
  assert(skaliert !== "none", "das Poster reagiert nicht auf den Zeiger");
  await shot(desktop, "03-hover");
});

await check("Kartennavigation führt auf die Detailseite", async () => {
  const sym = await desktop.$eval(".dx-rail-section .dx-poster .dx-poster-sym", (n) => n.textContent.trim());
  await desktop.click(".dx-rail-section .dx-poster");
  await desktop.waitForSelector(".dx-dhero h1", { timeout: 8000 });
  assert(desktop.url().indexOf("#/s/") !== -1, "der Hash wurde nicht gesetzt");
  const kopf = await desktop.textContent(".dx-dhero-meta");
  assert(kopf.indexOf(sym) !== -1, "die Detailseite zeigt ein anderes Symbol");
});

/* ------------------------------------------------------------- Suche */
await check("Suche öffnet über die Tastatur und findet einen Titel", async () => {
  await desktop.goto(BASE + "/discover/", { waitUntil: "networkidle" });
  await desktop.waitForTimeout(2800);
  await desktop.keyboard.press("/");
  await desktop.waitForTimeout(500);
  const offen = await desktop.$eval(".dx-search", (n) => n.classList.contains("on"));
  assert(offen, "das Such-Overlay öffnet nicht über die Tastatur");
  await desktop.fill(".dx-search input", "NV");
  await desktop.waitForTimeout(700);
  const treffer = await desktop.$$(".dx-result");
  assert(treffer.length > 0, "kein Treffer für NV");
  await shot(desktop, "04-search");
});

await check("Suche: Pfeiltasten wählen, Enter öffnet", async () => {
  await desktop.keyboard.press("ArrowDown");
  await desktop.waitForTimeout(250);
  const markiert = await desktop.$$eval(".dx-result[aria-selected='true']", (ns) => ns.length);
  assert(markiert === 1, "kein Treffer markiert");
  await desktop.keyboard.press("Enter");
  await desktop.waitForTimeout(1800);
  assert(/#\/s\//.test(desktop.url()), "Enter öffnet keinen Titel: " + desktop.url());
});

await check("Suche ohne Treffer sagt das, statt leer zu bleiben", async () => {
  await desktop.goto(BASE + "/discover/", { waitUntil: "networkidle" });
  await desktop.waitForTimeout(2800);
  await desktop.keyboard.press("/");
  await desktop.waitForTimeout(400);
  await desktop.fill(".dx-search input", "ZZZQQQ");
  await desktop.waitForTimeout(700);
  const hinweis = await desktop.textContent(".dx-search-hint");
  assert(/passt zu/.test(hinweis), "kein Hinweis auf das leere Ergebnis");
  await desktop.keyboard.press("Escape");
  await desktop.waitForTimeout(400);
  const offen = await desktop.$eval(".dx-search", (n) => n.classList.contains("on"));
  assert(!offen, "Escape schliesst das Overlay nicht");
});

/* -------------------------------------------------------- Kategorie */
await check("Kategorieseite: Gitter, Filter und Abdeckung", async () => {
  const start = Date.now();
  await desktop.goto(BASE + "/discover/#/c/US_REAL/market-leaders", { waitUntil: "networkidle" });
  await desktop.waitForSelector(".dx-poster", { timeout: 9000 });
  await desktop.waitForTimeout(500);
  const karten = await desktop.$$(".dx-poster");
  assert(karten.length >= 20, "nur " + karten.length + " Karten");
  assert(Date.now() - start < 4000, "die Kategorie baut zu langsam auf");
  const filter = await desktop.$$(".dx-filters button");
  assert(filter.length > 1, "keine Filter");
  await filter[1].click();
  await desktop.waitForTimeout(500);
  const danach = await desktop.$$(".dx-poster");
  const leer = await desktop.$(".dx-empty");
  assert(danach.length <= karten.length, "der Filter vergrössert die Liste");
  assert(danach.length > 0 || leer, "der Filter liefert nichts und sagt nichts");
  await shot(desktop, "05-kategorie");
});

/* ----------------------------------------------------------- Detail */
await check("Detail: Kopf, Begründung und Chart", async () => {
  await desktop.goto(BASE + "/discover/#/s/US_REAL/NVDA", { waitUntil: "networkidle" });
  await desktop.waitForSelector(".dx-chart svg", { timeout: 12000 });
  const score = await desktop.textContent(".dx-dhero-score b");
  assert(/\d/.test(score), "kein Leadership Score im Kopf");
  const warum = await desktop.textContent(".dx-why");
  assert(/Warum/.test(warum), "keine Begründung");
  const gruende = await desktop.$$(".dx-why-item");
  assert(gruende.length > 0, "keine Einzelbefunde");
  const pfade = await desktop.$$eval(".dx-chart svg path", (ns) => ns.length);
  assert(pfade > 0, "der Chart enthält keine Linie");
  await shot(desktop, "06-detail");
});

await check("Detail: Zeitraumwechsel zeichnet neu", async () => {
  const vorher = await desktop.$eval(".dx-chart svg", (s) => s.innerHTML.length);
  await desktop.click('.dx-tf button:text-is("3M")');
  await desktop.waitForTimeout(900);
  const nachher = await desktop.$eval(".dx-chart svg", (s) => s.innerHTML.length);
  const aktiv = await desktop.$eval('.dx-tf button:text-is("3M")', (b) => b.getAttribute("aria-pressed"));
  assert(aktiv === "true", "der gewählte Zeitraum ist nicht markiert");
  assert(vorher !== nachher, "der Chart hat sich nicht verändert");
});

await check("Detail: gesperrte Zeiträume sind abgeblendet und begründet", async () => {
  const eintag = await desktop.$('.dx-tf button:text-is("1T")');
  assert(eintag, "kein 1T-Knopf");
  assert((await eintag.getAttribute("disabled")) !== null, "1T ist nicht gesperrt");
  const hinweis = await desktop.textContent(".dx-chapter");
  assert(/Intraday/.test(hinweis), "der gesperrte Zeitraum nennt keinen Grund");
});

await check("Detail: Schnellzugriff und erweiterte Technik", async () => {
  await desktop.click('.dx-ctrl:text-is("EMA 20")');
  await desktop.waitForTimeout(700);
  assert(/EMA 20/.test(await desktop.textContent(".dx-legend")), "die Legende kennt die Serie nicht");
  await desktop.click('.dx-ctrl:text-is("Struktur")');
  await desktop.waitForTimeout(800);
  const zonen = await desktop.$$eval(".dx-chart svg .ann-zone", (ns) => ns.length);
  assert(zonen > 0, "keine Struktur-Zonen gezeichnet");
  const erweitert = await desktop.$('.dx-ctrl[aria-expanded]');
  await erweitert.click();
  await desktop.waitForTimeout(400);
  const sichtbar = await desktop.$$eval(".dx-more-controls .dx-ctrl", (ns) => ns.length);
  assert(sichtbar > 3, "die erweiterte Technik bleibt verborgen");
  await shot(desktop, "07-overlays");
});

await check("Detail: weiter entdecken (Zugehörigkeit und Nachbarn)", async () => {
  const chips = await desktop.$$(".dx-chips .dx-chip");
  assert(chips.length > 0, "keine Zugehörigkeiten");
  const ziel = await chips[0].getAttribute("href");
  assert(/#\/c\//.test(ziel || ""), "die Zugehörigkeit führt nirgendwohin");
  const nachbarn = await desktop.$$(".dx-chapter .dx-rail .dx-poster");
  assert(nachbarn.length >= 4, "keine ähnlichen Titel");
});

await check("Titel ohne ausgelieferte Kursreihe bleibt hochwertig (§23)", async () => {
  await desktop.goto(BASE + "/discover/#/s/US_REAL/VLO", { waitUntil: "networkidle" });
  await desktop.waitForTimeout(2600);
  const text = await desktop.textContent(".dx-detail");
  assert(/Kursreihe/.test(text), "kein Hinweis auf die fehlende Kursreihe");
  const pfad = await desktop.$$eval(".dx-chart svg path", (ns) => ns.length);
  assert(pfad > 0, "ohne Kursreihe fehlt auch der Renditepfad");
  const preis = await desktop.textContent(".dx-price");
  assert(!/NaN|0,00/.test(preis), "erfundener Kurs statt Begründung");
  await shot(desktop, "08-ohne-kursreihe");
});

await check("Elliott wird nie als Ergebnis gezeigt, wenn keines vorliegt", async () => {
  const zustand = (await desktop.textContent(".dx-ti-state")).trim();
  assert(["Verfügbar", "Geringe Konfidenz", "Wird berechnet", "Nicht verfügbar"].indexOf(zustand) !== -1,
    "unbekannter Elliott-Zustand: " + zustand);
  if (zustand === "Nicht verfügbar") {
    assert(!/Welle \d/.test(await desktop.textContent(".dx-ti")),
      "eine Welle wird genannt, obwohl keine vorliegt");
  }
});

await check("Modelluniversum zeigt Kurs, Verlauf und Chart", async () => {
  await desktop.goto(BASE + "/discover/#/u/VU_MODEL", { waitUntil: "networkidle" });
  await desktop.waitForSelector(".dx-poster", { timeout: 10000 });
  await desktop.waitForTimeout(1200);
  const preise = await desktop.$$eval(".dx-poster-right b", (ns) => ns.map((n) => n.textContent));
  assert(preise.some((p) => /\$/.test(p)), "kein Kurs im Modelluniversum");
  const hinweis = await desktop.textContent(".dx-inline-note");
  assert(/Modelluniversum/.test(hinweis), "das Modelluniversum ist nicht gekennzeichnet");
  await shot(desktop, "09-modelluniversum");
});

await check("kein horizontaler Überlauf auf dem Desktop", async () => {
  const ueber = await ueberstand(desktop);
  assert(ueber <= 2, "die Seite ist " + ueber + " px zu breit");
});

await check("keine Konsolenfehler auf dem Desktop", async () => {
  assert(desktop.__errors.length === 0, desktop.__errors.join(" | "));
});

/* ============================================================== TELEFON */
const mobil = await openPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await mobil.goto(BASE + "/discover/", { waitUntil: "networkidle" });
await mobil.waitForTimeout(3200);

await check("mobil: nichts läuft seitlich aus dem Bild", async () => {
  const ueber = await ueberstand(mobil);
  assert(ueber <= 2, "die Seite ist " + ueber + " px zu breit");
  await shot(mobil, "10-mobil-start");
});

await check("mobil: die Eingangsfläche lässt Platz für Inhalt", async () => {
  const hoehe = await mobil.$eval(".dx-hero", (n) => n.getBoundingClientRect().height);
  assert(hoehe < 1100, "die Eingangsfläche ist mit " + Math.round(hoehe) + " px zu hoch");
  const stats = await mobil.$eval(".dx-hero-stats", (n) => getComputedStyle(n).gridTemplateColumns);
  assert(stats.split(" ").length === 3, "die Kennzahlen stehen nicht nebeneinander");
});

await check("mobil: kein Hover-Vorhang", async () => {
  const sichtbar = await mobil.$$eval(".dx-reveal",
    (ns) => ns.filter((n) => getComputedStyle(n).display !== "none").length);
  assert(sichtbar === 0, "der Hover-Vorhang ist auf dem Telefon vorhanden");
});

await check("mobil: die Reihen lassen sich wischen", async () => {
  const messung = await mobil.$eval(".dx-rail", (r) => ({ scroll: r.scrollWidth, sicht: r.clientWidth }));
  assert(messung.scroll > messung.sicht + 40, "die Reihe scrollt nicht");
  await mobil.$eval(".dx-rail", (r) => { r.scrollLeft = 260; });
  await mobil.waitForTimeout(400);
  assert((await mobil.$eval(".dx-rail", (r) => r.scrollLeft)) > 100, "die Reihe bewegt sich nicht");
  await shot(mobil, "11-mobil-reihen");
});

await check("mobil: Suche als Vollbild", async () => {
  await mobil.click(".dx-searchbtn");
  await mobil.waitForTimeout(600);
  const box = await mobil.$eval(".dx-search", (n) => n.getBoundingClientRect().toJSON());
  assert(box.width >= 380 && box.height >= 700, "das Overlay füllt den Bildschirm nicht");
  await mobil.fill(".dx-search input", "A");
  await mobil.waitForTimeout(700);
  assert((await mobil.$$(".dx-result")).length > 0, "keine Treffer");
  await shot(mobil, "12-mobil-suche");
  await mobil.keyboard.press("Escape");
  await mobil.waitForTimeout(400);
});

await check("mobil: Detail und Chart passen in die Breite", async () => {
  await mobil.goto(BASE + "/discover/#/s/US_REAL/NVDA", { waitUntil: "networkidle" });
  await mobil.waitForSelector(".dx-chart svg", { timeout: 12000 });
  await mobil.waitForTimeout(900);
  const breite = await mobil.$eval(".dx-chart svg", (s) => s.getBoundingClientRect().width);
  assert(breite <= 390, "der Chart ist " + Math.round(breite) + " px breit");
  const ueber = await ueberstand(mobil);
  assert(ueber <= 2, "die Detailseite ist " + ueber + " px zu breit");
  const knopf = await mobil.$eval(".dx-tf button", (b) => b.getBoundingClientRect().height);
  assert(knopf >= 30, "die Zeitraumknöpfe sind mit " + Math.round(knopf) + " px zu klein");
  await shot(mobil, "13-mobil-detail");
});

await check("keine Konsolenfehler auf dem Telefon", async () => {
  assert(mobil.__errors.length === 0, mobil.__errors.join(" | "));
});

/* ================================================= REDUZIERTE BEWEGUNG */
const ruhig = await openPage({ viewport: { width: 1440, height: 900 },
                               reducedMotion: "reduce" });
await ruhig.goto(BASE + "/discover/", { waitUntil: "networkidle" });
await ruhig.waitForTimeout(3000);

await check("reduzierte Bewegung: Inhalte sind sofort sichtbar", async () => {
  const unsichtbar = await ruhig.$$eval(".dx-fade",
    (ns) => ns.filter((n) => Number(getComputedStyle(n).opacity) < 0.9).length);
  assert(unsichtbar === 0, unsichtbar + " Abschnitte bleiben unsichtbar");
});

await check("reduzierte Bewegung: die Eingangsfläche wechselt nicht von selbst", async () => {
  const vorher = await ruhig.textContent(".dx-hero-title");
  await ruhig.waitForTimeout(11000);
  const nachher = await ruhig.textContent(".dx-hero-title");
  assert(vorher === nachher, "die Eingangsfläche wechselt trotz reduzierter Bewegung");
});

await check("reduzierte Bewegung: keine Konsolenfehler", async () => {
  assert(ruhig.__errors.length === 0, ruhig.__errors.join(" | "));
});

await browser.close();

console.log("\nVision Universe DISCOVER — Browser-QA\n");
for (const [status, name] of results) console.log(`  ${status}  ${name}`);
console.log(`\n  ${results.length - failures}/${results.length} bestanden\n`);
process.exit(failures ? 1 : 0);
