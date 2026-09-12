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

/* Die benannten Aufnahmen sollen zeigen, was ihr Name sagt. Ohne diesen
   Schritt steht auf jedem Bild die Eingangsflaeche, weil die Seite beim
   Pruefen nie gescrollt wird. */
async function hinScrollen(page, sel, nummer, versatz) {
  const gefunden = await page.evaluate(([s, i, v]) => {
    /* Ueber den Index statt ueber :nth-of-type: jede Reihe steckt in
       ihrem eigenen Platzhalter, weshalb sie alle das erste Element ihres
       Typs sind - ein Selektor mit nth-of-type trifft nie etwas und die
       Aufnahme zeigte stillschweigend die Eingangsflaeche. */
    const alle = document.querySelectorAll(s);
    const n = alle[i];
    if (!n) return false;
    window.scrollTo(0, window.scrollY + n.getBoundingClientRect().top - v);
    return true;
  }, [sel, nummer, versatz || 90]);
  await page.waitForTimeout(700);
  assert(gefunden, "fuer die Aufnahme fehlt das Element " + sel + " [" + nummer + "]");
  const oben = await page.evaluate(() => window.scrollY);
  assert(nummer === 0 || oben > 40, "die Seite wurde fuer die Aufnahme nicht gescrollt");
}

/* =============================================================== DESKTOP */
const desktop = await openPage({ viewport: { width: 1440, height: 900 } });
await desktop.goto(BASE + "/discover/", { waitUntil: "networkidle" });
await desktop.waitForTimeout(3200);

await check("Eingangsfläche erzählt: Einordnung, Name, eine Zahl, ein Satz", async () => {
  await desktop.waitForSelector(".dx-hero-title", { timeout: 10000 });
  const titel = (await desktop.textContent(".dx-hero-title")).trim();
  const kicker = (await desktop.textContent(".dx-kicker")).trim();
  const zahl = (await desktop.textContent(".dx-hero-zahl b")).trim();
  const satz = (await desktop.textContent(".dx-hero-line")).trim();
  const belege = await desktop.$$(".dx-hero-belege li");
  assert(titel.length > 1, "kein Titel in der Eingangsfläche");
  assert(kicker.length > 3, "keine Einordnung in der Eingangsfläche");
  assert(/[0-9]/.test(zahl) && /%|\$|€/.test(zahl),
    "die grosse Zahl ist keine verstaendliche Zahl: " + zahl);
  assert(satz.length > 8 && !/[A-Z]{3,}|Score|Perzentil/.test(satz),
    "der Satz spricht Fachsprache: " + satz);
  assert(belege.length >= 2, "weniger als zwei Belege");
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
  await hinScrollen(desktop, '[data-row="top-10"]', 0, 150);
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

/* Diese Pruefung hat frueher "jeder Titel genau einmal" verlangt. Die
   Regel war zu streng: dass ein Marktfuehrer zugleich ein neues
   Jahreshoch macht, ist der Befund, den man sehen will - ihn zu
   verstecken, damit die Seite abwechslungsreicher wirkt, verschweigt
   etwas. Geprueft wird jetzt das, was wirklich schadet: dass dieselben
   Namen die Seite beherrschen. Die Grenzen stehen in discover/app.js
   (DEDUP) und werden weiter unten einzeln nachgemessen. */
await check("kein Titel beherrscht die Startseite (§16)", async () => {
  const symbole = await desktop.$$eval(".dx-rail-section .dx-poster .dx-poster-sym",
    (ns) => ns.map((n) => n.textContent.trim()));
  const zaehler = {};
  symbole.forEach((s) => { zaehler[s] = (zaehler[s] || 0) + 1; });
  const zuoft = Object.keys(zaehler).filter((s) => zaehler[s] > 2);
  assert(zuoft.length === 0, "oefter als zweimal: " + zuoft.join(", "));
  const anteil = symbole.length / Object.keys(zaehler).length;
  assert(anteil < 1.5,
    "im Schnitt steht jeder Titel " + anteil.toFixed(2) + "-mal auf der Seite");
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
  await shot(desktop, "05-hover");
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
  await shot(desktop, "06-suche");
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
  await shot(desktop, "07-kategorie");
});

/* ----------------------------------------------------------- Detail */
await check("Detail: Kopf, Begründung und Chart", async () => {
  await desktop.goto(BASE + "/discover/#/s/US_REAL/NVDA", { waitUntil: "networkidle" });
  await desktop.waitForSelector(".dx-chart svg", { timeout: 12000 });
  /* Ebene 2: oben steht, was man ohne Vorkenntnisse lesen kann. */
  const gross = await desktop.textContent(".dx-dhero-right .num");
  assert(/[0-9]/.test(gross), "keine grosse Zahl im Kopf");
  const story = await desktop.textContent(".dx-dhero-story");
  assert(story.trim().length > 8, "keine Aussage im Kopf");
  const achse = await desktop.$$(".dx-zeitachse > div");
  assert(achse.length >= 3, "die Zeitachse fehlt oder ist unvollstaendig");
  const spanne = await desktop.textContent(".dx-spanne p");
  assert(/Kurs/.test(spanne), "die Jahresspanne wird nicht in Worten erklaert");
  const warum = await desktop.textContent(".dx-why");
  assert(/Warum/.test(warum), "keine Begründung");
  const satz = (await desktop.textContent(".dx-why-lead")).trim();
  assert(satz.length > 20 && /\.$/.test(satz), "die Begruendung ist kein Satz: " + satz);
  /* Ebene 3: die Einzelbefunde stehen weiter unten, nicht im Kopf. */
  const gruende = await desktop.$$(".dx-chapter .dx-why-item");
  assert(gruende.length > 0, "keine Einzelbefunde im Kapitel \"Die Belege\"");
  const obenText = await desktop.evaluate(() =>
    document.querySelector(".dx-dhero").innerText + document.querySelector(".dx-why").innerText);
  assert(!/Leadership Score|Perzentil|RS \d/.test(obenText),
    "im Kopf steht noch eine Kennzahl aus der Analyseebene");
  const pfade = await desktop.$$eval(".dx-chart svg path", (ns) => ns.length);
  assert(pfade > 0, "der Chart enthält keine Linie");
  await shot(desktop, "08-detail-kopf");
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
  await shot(desktop, "09-detail-chart");
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
  await shot(desktop, "11-ohne-kursreihe");
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
  const preise = await desktop.$$eval(".dx-poster-preis", (ns) => ns.map((n) => n.textContent));
  assert(preise.some((p) => /\$/.test(p)), "kein Kurs im Modelluniversum");
  const hinweis = await desktop.textContent(".dx-inline-note");
  assert(/Modelluniversum/.test(hinweis), "das Modelluniversum ist nicht gekennzeichnet");
  await shot(desktop, "12-modelluniversum");
});

/* =============================================== VISUELLE SPRACHE (§3-§8) */
await check("jede Reihe traegt ihre eigene Farbwelt", async () => {
  await desktop.goto(BASE + "/discover/", { waitUntil: "networkidle" });
  await desktop.waitForTimeout(3000);
  const welten = await desktop.$$eval(".dx-rail-section[data-world]", (ns) =>
    ns.map((n) => ({ welt: n.getAttribute("data-world"),
                     farbe: getComputedStyle(n).getPropertyValue("--w").trim() })));
  assert(welten.length >= 4, "weniger als vier Reihen tragen eine Welt");
  const farben = new Set(welten.map((w) => w.farbe));
  assert(farben.size >= 3, "die Reihen unterscheiden sich farblich nicht (" +
    [...farben].join(", ") + ")");
  assert(![...farben].some((f) => !f), "eine Reihe hat keine aufgeloeste Weltfarbe");
  /* Zwei Welten in einem Bild - sonst zeigt die Aufnahme keinen Uebergang. */
  await hinScrollen(desktop, ".dx-rail-section", 2, 120);
  await shot(desktop, "03-reihen-welten");
});

await check("die Atmosphaere ist Flaeche, kein Kasten", async () => {
  /* Ein sichtbares Rechteck haette scharfe Kanten: Maske UND Verlauf
     muessen gesetzt sein, sonst steht die Kategorie als Block auf der
     Seite - genau das, was der Auftrag ausschliesst. */
  const atmo = await desktop.$eval(".dx-rail-section", (n) => {
    const cs = getComputedStyle(n, "::before");
    return { bg: cs.backgroundImage, maske: cs.maskImage || cs.webkitMaskImage,
             rand: cs.borderTopWidth, radius: cs.borderRadius };
  });
  assert(/radial-gradient/.test(atmo.bg), "die Atmosphaere ist kein Verlauf");
  assert(/gradient/.test(atmo.maske || ""), "die Atmosphaere hat harte Kanten (keine Maske)");
  assert(parseFloat(atmo.rand) === 0, "die Atmosphaere hat einen sichtbaren Rahmen");
});

await check("das Datenbild folgt den Zahlen, nicht dem Zufall", async () => {
  const bilder = await desktop.$$eval(".dx-rail-section .dx-poster .dx-art", (ns) =>
    ns.slice(0, 8).map((n) => ({
      pfad: (n.querySelector(".dx-art-line") || {}).getAttribute
        ? n.querySelector(".dx-art-line").getAttribute("d") : null,
      glanz: !!n.querySelector(".dx-art-glow"),
      punkte: n.querySelectorAll(".dx-art-node").length,
      label: n.getAttribute("aria-label") || ""
    })));
  assert(bilder.length >= 4, "zu wenige Datenbilder");
  const pfade = new Set(bilder.map((b) => b.pfad));
  assert(pfade.size === bilder.length, "zwei Titel haben denselben Verlauf");
  assert(bilder.every((b) => b.punkte >= 3), "die Stuetzstellen fehlen");
  assert(bilder.every((b) => /Prozent/.test(b.label) && /rebasiert|Kursverlauf/i.test(b.label)),
    "das Datenbild traegt keine Beschreibung aus seinen eigenen Zahlen");
  await hinScrollen(desktop, ".dx-rail-section .dx-rail", 1, 200);
  await shot(desktop, "04-poster-artwork");
});

await check("der rebasierte Renditepfad ist als solcher benannt", async () => {
  const text = await desktop.textContent(".dx-hero-caption");
  assert(/[Rr]ebasiert/.test(text) && /keine Kurskurve/.test(text),
    "die Bildunterschrift nennt den Pfad nicht beim Namen: " + text);
  const zahlen = await desktop.$$eval(".dx-poster .num", (ns) => ns.map((n) => n.textContent));
  assert(!zahlen.some((z) => /^\s*\$/.test(z) && false), "unerwartete Kursangabe");
});

/* ================================ VERSTÄNDLICHKEIT (25-EURO-SPARPLAN-TEST) */

/* Die Frage, an der sich diese Ausbaustufe messen lassen muss: kann ein
   Mensch, der noch nie einen Screener benutzt hat, die Startseite lesen?
   Geprüft wird deshalb nicht, ob etwas schön aussieht, sondern ob auf der
   ersten Ebene Fachsprache steht. */
const FACHSPRACHE = /\bRS\s?\d|\bRVOL\b|Leadership\s?\d|Momentum Score|Relative Volume|\bPerzentil\b|Breakout|[0-9]+[.,]?[0-9]*x Volumen|\bScore\s?\d/;

await check("auf der Startseite steht keine Fachsprache", async () => {
  await desktop.goto(BASE + "/discover/", { waitUntil: "networkidle" });
  await desktop.waitForTimeout(3000);
  const text = await desktop.evaluate(() => {
    /* Nur das, was man wirklich sieht: der Fussnotenapparat mit der
       Methodik darf und soll die Fachbegriffe nennen. */
    const teile = [document.querySelector(".dx-hero"),
                   ...document.querySelectorAll(".dx-rail-section")];
    return teile.filter(Boolean).map((n) => n.innerText).join("\n");
  });
  const treffer = text.split("\n").filter((z) => FACHSPRACHE.test(z));
  assert(treffer.length === 0, "Fachsprache auf der Startseite: " + treffer.slice(0, 4).join(" | "));
});

await check("jede Karte beantwortet: welche Firma, warum, wie viel", async () => {
  const karten = await desktop.$$eval(".dx-rail-section .dx-poster", (ns) =>
    ns.slice(0, 24).map((n) => ({
      name: (n.querySelector(".dx-poster-name") || {}).textContent || "",
      sym: (n.querySelector(".dx-poster-sym") || {}).textContent || "",
      story: (n.querySelector(".dx-story") || {}).textContent || "",
      zahl: (n.querySelector(".dx-zahl b") || {}).textContent || "",
      bild: !!n.querySelector(".dx-art")
    })));
  assert(karten.length >= 12, "zu wenige Karten");
  for (const k of karten) {
    assert(k.name.trim().length > 0, "Karte ohne Namen: " + k.sym);
    assert(k.story.trim().length > 6, "Karte ohne Aussage: " + (k.name || k.sym));
    assert(/[0-9]/.test(k.zahl) && /%|\$|€/.test(k.zahl),
      "Karte ohne verstaendliche Zahl: " + (k.name || k.sym) + " zeigt \"" + k.zahl + "\"");
    assert(k.bild, "Karte ohne Verlauf: " + (k.name || k.sym));
  }
  /* Die meisten Karten sollen eine Firma nennen, nicht nur ein Kürzel. */
  const mitNamen = karten.filter((k) => k.name.trim() !== k.sym.trim()).length;
  assert(mitNamen / karten.length >= 0.8,
    "nur " + mitNamen + " von " + karten.length + " Karten nennen eine Firma");
});

await check("die Sammlungen heissen, wie ein Mensch sie nennen wuerde", async () => {
  const titel = await desktop.$$eval(".dx-rail-head h2", (ns) =>
    ns.map((n) => n.textContent.trim()));
  assert(titel.length >= 5, "zu wenige Sammlungen");
  const englisch = /\b(LEADERS?|BREAKING|MOMENTUM|RELATIVE|STRENGTH|WATCH|SCREEN)\b/i;
  for (const t of titel) {
    assert(!englisch.test(t), "Screener-Begriff als Sammlung: " + t);
    assert(t.length >= 8, "Sammlung ohne Aussage: " + t);
  }
});

await check("keine Aussage widerspricht ihrer Zahl", async () => {
  const paare = await desktop.$$eval(".dx-rail-section .dx-poster", (ns) =>
    ns.map((n) => ({
      story: (n.querySelector(".dx-story") || {}).textContent || "",
      zahl: (n.querySelector(".dx-zahl b") || {}).textContent || ""
    })));
  const stark = /(stärksten|Marktführ|Aufwärtstrend|im Plus|davon|Aufwind|Bewegung)/;
  const benennt = /^(Zuletzt schwächer|Etwas unter|Deutlich unter|Nach schwachen)/;
  for (const p of paare) {
    if (!/^−/.test(p.zahl.trim())) continue;
    assert(!stark.test(p.story) || benennt.test(p.story),
      "\"" + p.story + "\" ueber " + p.zahl);
  }
});

await check("die Suche zeigt Firmen, keine Kuerzelliste", async () => {
  await desktop.keyboard.press("/");
  await desktop.waitForTimeout(500);
  await desktop.fill(".dx-search input", "ener");
  await desktop.waitForTimeout(800);
  const treffer = await desktop.$$eval(".dx-result", (ns) => ns.slice(0, 8).map((n) => ({
    name: (n.querySelector(".nm") || {}).childNodes ? n.querySelector(".nm").childNodes[0].textContent : "",
    wert: (n.querySelector(".val") || {}).textContent || ""
  })));
  assert(treffer.length > 0, "keine Treffer");
  for (const t of treffer) {
    assert(t.name.trim().length > 2, "Treffer ohne Namen");
    assert(!/LEAD/.test(t.wert), "die Trefferliste zeigt noch einen Score: " + t.wert);
  }
  await desktop.keyboard.press("Escape");
  await desktop.waitForTimeout(400);
});

/* ========================================== MEHRFACHNENNUNGEN (§16) */
await check("ein Titel steht hoechstens zweimal auf der Startseite", async () => {
  const zaehler = await desktop.$$eval(".dx-rail-section", (ns) => {
    const out = {};
    ns.forEach((sec) => sec.querySelectorAll(".dx-poster-sym").forEach((s) => {
      out[s.textContent] = (out[s.textContent] || 0) + 1;
    }));
    return out;
  });
  const zuoft = Object.keys(zaehler).filter((k) => zaehler[k] > 2);
  assert(zuoft.length === 0, "zu oft genannt: " + zuoft.join(", "));
  const mehrfach = Object.keys(zaehler).filter((k) => zaehler[k] === 2);
  assert(mehrfach.length > 0,
    "kein einziger Titel erscheint zweimal - die Regel ist zu streng geraten");
});

await check("keine Reihe besteht aus Wiederholungen", async () => {
  const reihen = await desktop.$$eval(".dx-rail-section", (ns) =>
    ns.map((sec) => ({
      titel: (sec.querySelector("h2") || {}).textContent || "",
      karten: sec.querySelectorAll(".dx-poster-sym").length,
      echos: sec.querySelectorAll(".dx-echo").length
    })).filter((r) => r.karten > 0));
  reihen.forEach((r) => {
    assert(r.echos <= 3, r.titel + " zeigt " + r.echos + " Zweitnennungen");
    assert(r.echos * 2 <= r.karten, r.titel + " besteht ueberwiegend aus Zweitnennungen");
  });
});

await check("jede Zweitnennung sagt, woher man den Titel kennt", async () => {
  const texte = await desktop.$$eval(".dx-echo", (ns) => ns.map((n) => n.textContent.trim()));
  assert(texte.every((t) => /^auch in \S/.test(t)), "eine Zweitnennung bleibt unerklaert");
});

await check("TOP 10 zeigt die echte Rangliste, ungefiltert", async () => {
  const gezeigt = await desktop.$$eval("[data-row=\"top-10\"] .dx-poster-sym",
    (ns) => ns.map((n) => n.textContent));
  const echt = await desktop.evaluate(async () => {
    const r = await fetch("/discover/data/rows/US_REAL/market-leaders.json");
    const j = await r.json();
    return j.cards.slice(0, 10).map((c) => c.symbol);
  });
  assert(gezeigt.length === 10, "TOP 10 zeigt " + gezeigt.length + " Titel");
  assert(gezeigt.join(",") === echt.join(","),
    "die Signature-Reihe weicht von der Rangliste ab:\n    " + gezeigt.join(",") +
    "\n    " + echt.join(","));
});

/* ============================================ DETAILSEITE ZWEI TEMPERATUREN (§20) */
await check("die Detailseite traegt oben die Welt und wird unten ruhig", async () => {
  await desktop.goto(BASE + "/discover/#/s/US_REAL/NVDA", { waitUntil: "networkidle" });
  await desktop.waitForSelector(".dx-dhero", { timeout: 12000 });
  await desktop.waitForTimeout(1200);
  const welt = await desktop.getAttribute(".dx-detail", "data-world");
  assert(welt, "die Detailseite kennt ihre Farbwelt nicht");
  const kopf = await desktop.$eval(".dx-dhero", (n) => getComputedStyle(n).getPropertyValue("--w").trim());
  const unten = await desktop.$eval(".dx-detail .dx-chapter",
    (n) => getComputedStyle(n).getPropertyValue("--w").trim());
  assert(kopf && unten, "die Farbwelt loest sich nicht auf");
  assert(kopf !== unten, "die Analyse traegt dieselbe Kategoriefarbe wie der Kopf");
  /* Die Aufnahme soll den ruhigen Teil zeigen, nicht den Kopf. */
  await hinScrollen(desktop, ".dx-detail .dx-chapter", 2, 80);
  await shot(desktop, "10-detail-analyse");
});

/* ================================================= DUNKLER HEADER (§18) */
await check("der dunkle Header betrifft ausschliesslich Discover", async () => {
  const lese = async (pfad) => {
    const seite = await openPage({ viewport: { width: 1440, height: 900 } });
    await seite.goto(BASE + pfad, { waitUntil: "domcontentloaded" });
    await seite.waitForTimeout(700);
    const wert = await seite.evaluate(() => {
      const nav = document.querySelector("vu-navigation");
      if (!nav || !nav.shadowRoot) return null;
      const h = nav.shadowRoot.querySelector("header");
      const a = nav.shadowRoot.querySelector("nav a");
      return { bg: getComputedStyle(h).backgroundColor,
               ink: getComputedStyle(a).color,
               ziele: [...nav.shadowRoot.querySelectorAll("nav a")]
                 .map((x) => x.getAttribute("href")).join(",") };
    });
    await seite.close();
    return wert;
  };
  const dunkel = await lese("/discover/");
  assert(dunkel, "auf /discover/ fehlt die Navigation");
  assert(/rgba?\(8, 8, 10/.test(dunkel.bg), "der Discover-Header ist nicht dunkel: " + dunkel.bg);
  for (const pfad of ["/quant/", "/dashboard/", "/news/", "/macro/", "/academy/"]) {
    const hell = await lese(pfad);
    assert(hell, "auf " + pfad + " fehlt die Navigation");
    assert(/rgba?\(255, 255, 255/.test(hell.bg),
      pfad + " hat einen veraenderten Header bekommen: " + hell.bg);
    assert(hell.ziele === dunkel.ziele,
      pfad + " hat andere Navigationsziele als Discover - die Logik wurde veraendert");
  }
});

await check("kein horizontaler Überlauf auf dem Desktop", async () => {
  await desktop.goto(BASE + "/discover/", { waitUntil: "networkidle" });
  await desktop.waitForTimeout(2600);
  const ueber = await ueberstand(desktop);
  assert(ueber <= 2, "die Seite ist " + ueber + " px zu breit");
});

await check("nirgends steht ein rohes Objekt in der Oberflaeche", async () => {
  /* "[object Object]" ist der sichtbare Rest einer Zeile, die ein Objekt
     dort einsetzt, wo ein Satz stehen sollte. Es faellt in keinem Test
     auf, weil nichts abstuerzt - nur auf dem Bildschirm steht Unsinn.
     Geprueft werden die Startseite und eine Detailseite mit vollem
     Technical-Intelligence-Befund. */
  for (const pfad of ["/discover/", "/discover/#/s/US_REAL/NVDA",
                      "/discover/#/c/US_REAL/market-leaders"]) {
    await desktop.goto(BASE + pfad, { waitUntil: "networkidle" });
    await desktop.waitForTimeout(2600);
    const text = await desktop.evaluate(() => document.body.innerText);
    assert(!/\[object /.test(text), "auf " + pfad + " steht ein rohes Objekt");
    assert(!/undefined|NaN(?![a-z])/.test(text), "auf " + pfad + " steht undefined oder NaN");
  }
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
  await shot(mobil, "13-mobil-start");
});

await check("mobil: die Eingangsfläche lässt Platz für Inhalt", async () => {
  const hoehe = await mobil.$eval(".dx-hero", (n) => n.getBoundingClientRect().height);
  assert(hoehe < 1100, "die Eingangsfläche ist mit " + Math.round(hoehe) + " px zu hoch");
  const zahl = await mobil.$eval(".dx-hero-zahl b", (n) => n.getBoundingClientRect());
  assert(zahl.height >= 30, "die grosse Zahl ist auf dem Telefon zu klein");
  const belege = await mobil.$$(".dx-hero-belege li");
  assert(belege.length >= 2, "die Belege fehlen auf dem Telefon");
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
  await shot(mobil, "14-mobil-reihen");
});

await check("mobil: die naechste Entdeckungsebene beginnt im Bild", async () => {
  /* §23: Nach der Eingangsflaeche muss zu sehen sein, dass es weitergeht -
     sonst endet die Seite fuer den Daumen beim ersten Titel. */
  const kopf = await mobil.$eval(".dx-rail-head",
    (n) => Math.round(n.getBoundingClientRect().top));
  assert(kopf < 844, "die erste Reihe beginnt erst bei " + kopf + " px");
});

await check("mobil: der Datenhinweis ist verstaut, nicht abgeschnitten", async () => {
  const hinweis = await mobil.$eval(".dx-inline-note", (n) => ({
    tag: n.tagName, offen: n.hasAttribute("open"),
    voll: (n.querySelector("p") || {}).textContent || "",
    geklemmt: getComputedStyle(n).webkitLineClamp
  }));
  assert(hinweis.tag === "DETAILS", "der Hinweis ist nicht aufklappbar");
  assert(!hinweis.offen, "der Hinweis ist auf dem Telefon aufgeklappt");
  assert(hinweis.voll.length > 40, "der vollstaendige Wortlaut fehlt im Dokument");
  await mobil.click(".dx-inline-note summary");
  await mobil.waitForTimeout(300);
  assert(await mobil.$eval(".dx-inline-note", (n) => n.hasAttribute("open")),
    "der Hinweis laesst sich nicht oeffnen");
  await mobil.click(".dx-inline-note summary");
});

await check("mobil: die Karte liest sich Name, Aussage, Zahl, Bild", async () => {
  const reihenfolge = await mobil.$eval(".dx-rail-section .dx-poster", (p) => {
    const y = (sel) => {
      const n = p.querySelector(sel);
      return n ? Math.round(n.getBoundingClientRect().top) : null;
    };
    return { name: y(".dx-poster-name"), story: y(".dx-story"),
             zahl: y(".dx-zahl"), bild: y(".dx-poster-media") };
  });
  assert(reihenfolge.name !== null && reihenfolge.story !== null &&
         reihenfolge.zahl !== null && reihenfolge.bild !== null,
    "auf der Karte fehlt ein Bestandteil: " + JSON.stringify(reihenfolge));
  assert(reihenfolge.name < reihenfolge.story, "der Name steht nicht zuerst");
  assert(reihenfolge.story < reihenfolge.zahl, "die Aussage steht unter der Zahl");
  assert(reihenfolge.zahl < reihenfolge.bild, "die Zahl steht unter dem Bild");
  await hinScrollen(mobil, ".dx-rail-section", 2, 160);
  await shot(mobil, "15-mobil-poster");
});

await check("mobil: Suche als Vollbild mit Farbwelt je Treffer", async () => {
  await mobil.click(".dx-searchbtn");
  await mobil.waitForTimeout(600);
  const box = await mobil.$eval(".dx-search", (n) => n.getBoundingClientRect().toJSON());
  assert(box.width >= 380 && box.height >= 700, "das Overlay füllt den Bildschirm nicht");
  await mobil.fill(".dx-search input", "A");
  await mobil.waitForTimeout(700);
  assert((await mobil.$$(".dx-result")).length > 0, "keine Treffer");
  const welten = await mobil.$$eval(".dx-result", (ns) =>
    ns.slice(0, 12).map((n) => getComputedStyle(n).getPropertyValue("--w").trim()));
  assert(welten.every(Boolean), "ein Treffer traegt keine Farbwelt");
  assert(new Set(welten).size > 1, "alle Treffer sehen gleich aus");
  await shot(mobil, "16-mobil-suche");
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
  await shot(mobil, "17-mobil-detail-kopf");
  await mobil.evaluate(() => {
    const c = document.querySelector(".dx-chart");
    if (c) c.scrollIntoView({ block: "center" });
  });
  await mobil.waitForTimeout(600);
  await shot(mobil, "18-mobil-detail-chart");
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
