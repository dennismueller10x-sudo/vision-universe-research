#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE DISCOVER — Browser-QA V4.1 (Consumer Experience)

   Prueft im echten Browser (Chromium/Playwright), was der V4.1-Auftrag
   (§32) verlangt und was die aelteren Suiten nicht kennen:

     Farbregel der Kurscharts (gruen bei Plus, rot bei Minus - Hero,
       Karten, Aktienseite), Farbschema System/Hell/Dunkel mit Speicher,
       schwebende Navigation (Suchen · Entdecken) mit Safe Area und
       Scroll-Verhalten, Such-Overlay, Feed in Stuecken (> 10 Titel, keine
       Doppelten, Wiederaufnahme), keine Testsymbole und keine Anbieter-
       namen in der Verbraucher-Oberflaeche, Daten & Quellen vorhanden,
       keine "Development Preview"-Plakette, Kennzahlwechsel in der
       Fundamental Journey, Bewertungs-Sanity, Statuszeile ehrlich,
       Analyse hinter der Grenze, kein Ueberlauf, keine Konsolenfehler.

   Ausfuehren:  node scripts/discover/browser-qa-v41.mjs [--url BASE] [--shots DIR]
   Exit-Code 1 bei mindestens einem Fehlschlag.
   ========================================================================= */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

function arg(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const BASE = arg("url", "http://localhost:8765").replace(/\/$/, "");
const SHOTS = arg("shots", null);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const results = [];
async function check(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log("  ok    " + name); }
  catch (err) { results.push({ name, ok: false, err: err.message }); console.log("  FAIL  " + name + " — " + err.message); }
}
function assert(c, m) { if (!c) throw new Error(m); }
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: SHOTS + "/" + name + ".png" }); }

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
/* Konsolenfehler werden je Seite gesammelt. Ein Schriftdienst, den eine
   abgeschottete Umgebung nicht erreicht, ist kein Fehler des Produkts. */
const IGNORIERT = /fonts\.googleapis|fonts\.gstatic|ERR_CERT_AUTHORITY_INVALID/;
async function openPage(opts) {
  const ctx = await browser.newContext(Object.assign({ colorScheme: "dark" }, opts));
  const p = await ctx.newPage();
  p.__errors = []; p.__bad = [];
  p.on("pageerror", (e) => p.__errors.push(String(e.message)));
  p.on("console", (m) => { if (m.type() === "error" && !IGNORIERT.test(m.text())) p.__errors.push(m.text()); });
  p.on("response", (r) => { if (r.status() >= 400 && r.url().startsWith(BASE)) p.__bad.push(r.status() + " " + r.url()); });
  return p;
}
const MOBIL = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const DESK = { viewport: { width: 1440, height: 900 } };
const warten = (p, ms) => p.waitForTimeout(ms);
const rgb = (s) => (s || "").replace(/\s+/g, "");
const tokens = (p) => p.evaluate(() => { const cs = getComputedStyle(document.body); return { up: cs.getPropertyValue("--discover-up").trim(), down: cs.getPropertyValue("--discover-down").trim() }; });
async function tokenRgb(p) { return p.evaluate(() => { const d = document.createElement("i"); document.body.appendChild(d); d.style.color = "var(--discover-up)"; const up = getComputedStyle(d).color; d.style.color = "var(--discover-down)"; const down = getComputedStyle(d).color; d.remove(); return { up: up.replace(/\s+/g, ""), down: down.replace(/\s+/g, "") }; }); }
const PROVIDER = /\b(Tiingo|EDGAR|XBRL|Polygon|Finnhub|Alpha ?Vantage|companyfacts)\b|\bSEC-|\bbei der SEC\b|TEST_SECURITY|Development Preview/i;

console.log("Browser-QA V4.1 gegen " + BASE);

/* ============================================================ TELEFON */
const m = await openPage(MOBIL);
await m.goto(BASE + "/discover/", { waitUntil: "networkidle" }); await warten(m, 2500);

await check("Farbschema: Standard ist SYSTEM und folgt dem Geraet (dunkel)", async () => {
  const w = await m.evaluate(() => ({ mode: document.documentElement.getAttribute("data-theme-mode"), theme: document.documentElement.getAttribute("data-theme"), nav: document.querySelector("vu-navigation").getAttribute("theme"), meta: document.querySelector('meta[name="theme-color"]').content, scheme: getComputedStyle(document.body).colorScheme }));
  assert(w.mode === "system", "Modus ist nicht system: " + w.mode);
  assert(w.theme === "dark" && w.nav === "dark" && w.meta === "#08080a", "dunkles Geraet wird nicht dunkel gezeichnet: " + JSON.stringify(w));
  assert(/dark/.test(w.scheme), "color-scheme folgt nicht: " + w.scheme);
});

await check("Statuszeile: ehrliche Worte, 'Live' nur bei LIVE", async () => {
  const s = await m.evaluate(() => { const n = document.querySelector(".dx-status"); return { text: n.innerText.replace(/\s+/g, " ").trim(), haupt: n.querySelector("b").innerText.trim(), fresh: n.getAttribute("data-freshness"), sichtbar: getComputedStyle(n.querySelector("b")).display !== "none" }; });
  assert(s.sichtbar, "das Hauptwort der Statuszeile ist auf dem Telefon versteckt");
  assert(/^(Markt geöffnet|Markt geschlossen|Letzter Handelstag|Heute · Stand \d\d:\d\d|Stand .+)$/i.test(s.haupt), "unerwartetes Hauptwort: " + s.haupt);
  if (/live/i.test(s.text)) assert(s.fresh === "LIVE", "'Live' steht da, aber der Vertrag sagt " + s.fresh);
  if (s.fresh === "STALE") assert(/nicht aktuell/i.test(s.text), "STALE ohne 'nicht aktuell': " + s.text);
  assert(!PROVIDER.test(s.text), "Anbietername in der Statuszeile: " + s.text);
});

await check("keine Plakette 'Development Preview' auf Discover", async () => {
  const w = await m.evaluate(() => { const nav = document.querySelector("vu-navigation"); return { badge: !!nav.shadowRoot.querySelector(".preview"), text: nav.shadowRoot.textContent, attr: nav.getAttribute("no-preview") }; });
  assert(!w.badge && !/Development Preview/.test(w.text), "die Plakette steht noch im Kopf");
  assert(w.attr !== null, "Discover setzt no-preview nicht");
  assert(!/Development Preview/i.test(await m.evaluate(() => document.body.innerText)), "'Development Preview' steht im Seitentext");
});

await check("Farbregel: Hero-Chart und Karten-Charts sind gruen bei Plus, rot bei Minus", async () => {
  /* Die Karten-Charts laden erst, wenn die Karte im Bild ist - also ein
     Stueck herunterblaettern und warten, dann messen. */
  await m.evaluate(() => window.scrollTo(0, 1200)); await warten(m, 1500);
  await m.evaluate(() => window.scrollTo(0, 0)); await warten(m, 300);
  const t = await tokenRgb(m);
  const w = await m.evaluate(() => {
    const out = [];
    const hero = document.querySelector(".dx-hero-chart");
    if (hero) { const l = hero.querySelector(".dx-art-line"); out.push({ art: "hero", dir: hero.getAttribute("data-direction"), stroke: l && getComputedStyle(l).stroke.replace(/\s+/g, ""), pct: (document.querySelector(".dx-hero-pct, .dx-hero .dx-pct, .dx-hero-value") || {}).innerText }); }
    document.querySelectorAll(".dx-micro[data-direction]").forEach((n, i) => { if (i < 12) { const l = n.querySelector(".dx-art-line"); out.push({ art: "micro", dir: n.getAttribute("data-direction"), stroke: l ? getComputedStyle(l).stroke.replace(/\s+/g, "") : getComputedStyle(n).color.replace(/\s+/g, "") }); } });
    return out;
  });
  assert(w.length >= 3, "zu wenige Charts gefunden: " + w.length);
  for (const c of w) {
    assert(c.dir === "up" || c.dir === "down", c.art + " ohne Richtung");
    const soll = c.dir === "up" ? t.up : t.down;
    assert(c.stroke === soll, c.art + " " + c.dir + " ist " + c.stroke + ", erwartet " + soll);
  }
});

await check("schwebende Navigation: Suchen · Entdecken, >= 44 px, ueber der Safe Area, ohne Telefon-Symbol", async () => {
  await m.evaluate(() => window.scrollTo(0, 0)); await warten(m, 400);
  const w = await m.evaluate(() => {
    const n = document.querySelector(".dx-fnav"); const r = n.getBoundingClientRect();
    return { sichtbar: getComputedStyle(n).display !== "none" && !n.classList.contains("dx-fnav--weg"),
             abstand: Math.round(window.innerHeight - r.bottom),
             knoepfe: [...n.querySelectorAll(".dx-fnav-btn")].map((b) => ({ t: b.innerText.trim(), h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width) })),
             kopfSuche: getComputedStyle(document.querySelector(".dx-searchbtn")).display, kopfEntdecken: getComputedStyle(document.querySelector(".dx-entdecken")).display,
             alt: !!document.querySelector(".dx-einzeln"), text: document.body.innerText };
  });
  assert(w.sichtbar, "die Leiste ist nicht sichtbar");
  assert(w.abstand >= 12, "die Leiste klebt am Rand: " + w.abstand);
  assert(w.knoepfe.map((k) => k.t).join("|") === "Suchen|Entdecken", "Knoepfe: " + JSON.stringify(w.knoepfe));
  assert(w.knoepfe.every((k) => k.h >= 44 && k.w >= 44), "Ziel kleiner als 44 px: " + JSON.stringify(w.knoepfe));
  assert(w.kopfSuche === "none" && w.kopfEntdecken === "none", "Kopf und Leiste doppeln Suchen/Entdecken auf dem Telefon");
  assert(!w.alt && !/Aktien entdecken/.test(w.text), "der alte Einstieg (Telefon-Symbol / 'Aktien entdecken') ist noch da");
  await shot(m, "01-fnav-mobil");
});

await check("schwebende Navigation: zieht sich beim Herunterblaettern zurueck, kommt beim Hochblaettern wieder", async () => {
  await m.evaluate(() => window.scrollTo(0, 800)); await warten(m, 120);
  await m.evaluate(() => window.scrollTo(0, 1500)); await warten(m, 200);
  const weg = await m.evaluate(() => document.querySelector(".dx-fnav").classList.contains("dx-fnav--weg"));
  assert(weg, "die Leiste bleibt beim Herunterblaettern stehen");
  await m.evaluate(() => window.scrollTo(0, 1100)); await warten(m, 250);
  const zurueck = await m.evaluate(() => !document.querySelector(".dx-fnav").classList.contains("dx-fnav--weg"));
  assert(zurueck, "die Leiste kommt beim Hochblaettern nicht wieder");
  await m.evaluate(() => window.scrollTo(0, 0)); await warten(m, 300);
});

await check("Such-Overlay: 'Welche Aktie suchst du?', Treffer, Leiste weg, Escape schliesst", async () => {
  await m.click(".dx-fnav-suchen"); await warten(m, 500);
  const w = await m.evaluate(() => ({ offen: document.body.classList.contains("dx-suche-offen"), fnav: getComputedStyle(document.querySelector(".dx-fnav")).display, ph: document.querySelector(".dx-search input").placeholder, h2: (document.querySelector(".dx-search h2") || {}).innerText, box: document.querySelector(".dx-search").getBoundingClientRect().toJSON() }));
  assert(w.offen && w.ph === "Welche Aktie suchst du?", "Overlay oder Platzhalter falsch: " + JSON.stringify(w));
  assert(w.fnav === "none", "die schwebende Leiste liegt ueber der Suche");
  assert(w.box.width >= 380 && w.box.height >= 700, "das Overlay fuellt den Bildschirm nicht");
  await m.keyboard.type("nvid"); await warten(m, 700);
  const treffer = await m.$$eval(".dx-result", (ns) => ns.map((n) => n.innerText.replace(/\s+/g, " ")));
  assert(treffer.length > 0 && /NVDA/.test(treffer[0]), "kein passender Treffer: " + treffer[0]);
  await shot(m, "02-suche-mobil");
  await m.keyboard.press("Escape"); await warten(m, 400);
  assert(await m.evaluate(() => !document.body.classList.contains("dx-suche-offen") && getComputedStyle(document.querySelector(".dx-fnav")).display !== "none"), "nach Escape ist die Suche nicht zu oder die Leiste nicht zurueck");
});

await check("Feed: Stuecke nachladen, > 10 Titel, keine Doppelten, Zaehler, Leiste weg", async () => {
  await m.click(".dx-fnav-entdecken"); await warten(m, 2500);
  const start = await m.evaluate(() => ({ z: document.querySelector(".dx-feed-zaehler").innerText.trim(), fnav: getComputedStyle(document.querySelector(".dx-fnav")).display, stand: document.querySelector(".dx-feed").__stand(), screens: document.querySelectorAll(".dx-feed-screen[data-index]").length }));
  assert(/^1 von \d+$/i.test(start.z), "der Zaehler beginnt nicht bei 1: " + start.z);
  assert(start.stand.gesamt > 100, "der Feed endet frueh: " + start.stand.gesamt);
  assert(start.screens >= 10 && start.screens <= 14, "erstes Stueck: " + start.screens);
  assert(start.fnav === "none", "die schwebende Leiste liegt ueber dem Feed");
  await shot(m, "03-feed-1");
  for (let i = 0; i < 16; i++) { await m.evaluate(() => { const s = document.querySelector(".dx-feed-spur"); s.scrollTop += s.clientHeight; }); await warten(m, 320); }
  const w = await m.evaluate(() => { const syms = [...document.querySelectorAll(".dx-feed-screen[data-index]")].map((n) => n.dataset.symbol); return { n: syms.length, doppelt: syms.length - new Set(syms).size, z: document.querySelector(".dx-feed-zaehler").innerText.trim(), stand: document.querySelector(".dx-feed").__stand(), kauf: /jetzt kaufen|jetzt verkaufen|nicht verpassen|nur heute|\bbuy now\b|\bsell now\b/i.test(document.body.innerText) }; });
  assert(w.n > 12 && w.stand.gezeigt >= 24, "nach 16 Wischern nur " + w.n + " Titel geladen");
  assert(w.doppelt === 0, w.doppelt + " Titel doppelt");
  assert(/^(1[5-9]|2\d) von/i.test(w.z), "der Zaehler zaehlt nicht mit: " + w.z);
  assert(!w.kauf, "Kauf-/Dringlichkeitssprache im Feed");
  await shot(m, "04-feed-nach-16");
});

await check("Feed: Wiederaufnahme an der letzten Stelle (Geraet, kein Konto)", async () => {
  const vorher = await m.evaluate(() => document.querySelector(".dx-feed-zaehler").innerText.trim());
  await m.goto(BASE + "/discover/", { waitUntil: "networkidle" }); await warten(m, 800);
  await m.goto(BASE + "/discover/#/einzeln/US_REAL", { waitUntil: "networkidle" }); await warten(m, 2500);
  const nachher = await m.evaluate(() => document.querySelector(".dx-feed-zaehler").innerText.trim());
  assert(nachher === vorher, "Wiederaufnahme: " + vorher + " -> " + nachher);
});

for (const sym of ["AAPL", "NVDA", "VLO", "PANW"]) {
  await m.goto(BASE + "/discover/#/s/US_REAL/" + sym, { waitUntil: "networkidle" }); await warten(m, 2500);
  await check(sym + ": grosser Chart 50-70 % des Bildschirms, Farbe nach Vorzeichen, kein Ueberlauf", async () => {
    const b = m.locator(".dx-tf button", { hasText: /^1J$/ });
    if (await b.count()) { await b.first().click(); await warten(m, 700); }
    const t = await tokenRgb(m);
    const w = await m.evaluate(() => {
      const svg = document.querySelector(".dx-range-chart, .dx-intraday-chart"); const r = svg.getBoundingClientRect();
      const line = svg.querySelector(".dx-art-line");
      const pct = (document.querySelector(".dx-chart-hero-pct, .dx-chart-hero .dx-pct") || document.querySelector(".dx-chart-hero") || {}).innerText || "";
      const mm = pct.match(/([+−-])\s?\d/);
      return { anteil: r.height / window.innerHeight, dir: svg.getAttribute("data-direction"), stroke: line && getComputedStyle(line).stroke.replace(/\s+/g, ""), vorzeichen: mm ? mm[1] : null, breit: document.documentElement.scrollWidth - window.innerWidth };
    });
    assert(w.anteil >= 0.5 && w.anteil <= 0.7, "Chart-Hoehe " + Math.round(w.anteil * 100) + " % des Bildschirms");
    assert(w.dir === "up" || w.dir === "down", "Chart ohne Richtung");
    assert(w.stroke === (w.dir === "up" ? t.up : t.down), "Farbe " + w.stroke + " passt nicht zur Richtung " + w.dir);
    if (w.vorzeichen) assert((w.vorzeichen === "+") === (w.dir === "up"), "Vorzeichen " + w.vorzeichen + " vs. Richtung " + w.dir);
    assert(w.breit <= 2, "Seite " + w.breit + " px zu breit");
  });
  await check(sym + ": Fundamental Journey mit Kennzahlwechsel, Cluster statt Liste, Bewertung mit Sanity", async () => {
    const hat = await m.$("#journey");
    if (!hat) { console.log("        (keine Geschaeftszahlen fuer " + sym + " - Journey entfaellt ehrlich)"); return; }
    const tabs = await m.$$eval("#journey .dx-journey-tab", (ns) => ns.map((n) => ({ id: n.getAttribute("data-track"), t: n.innerText.trim(), an: n.getAttribute("aria-selected") })));
    assert(tabs.length >= 4, "zu wenige Kennzahlen zum Wechseln: " + tabs.length);
    const vorher = await m.$eval("#journey .dx-journey-kopf", (n) => n.innerText);
    const ziel = tabs.find((x) => x.an !== "true");
    await m.evaluate((id) => document.querySelector('#journey .dx-journey-tab[data-track="' + id + '"]').click(), ziel.id); await warten(m, 300);
    const nachher = await m.$eval("#journey .dx-journey-kopf", (n) => n.innerText);
    assert(nachher !== vorher, "der Kennzahlwechsel aendert nichts");
    const cluster = await m.$$eval(".dx-zahlen-karte", (ns) => ns.map((n) => n.getAttribute("data-cluster")));
    assert(cluster.length >= 3 && cluster.includes("growth") && cluster.includes("profitability"), "Cluster fehlen: " + cluster.join(","));
    const listen = await m.$$eval(".dx-chapter .dx-firma > div, .dx-chapter table.dx-kennzahlen tr", (ns) => ns.length);
    const weitere = await m.$("details.dx-weitere");
    assert(weitere, "'Weitere Kennzahlen' fehlt (progressive Enthuellung)");
    const bew = await m.$eval(".dx-bewertung-satz, .dx-chapter--bewertung .dx-kapitel-lead, .dx-bewertung", (n) => n.innerText).catch(() => "");
    assert(bew.length > 20, "die Bewertung hat keinen Satz");
    const kgv = await m.evaluate(() => { const t = document.body.innerText; const mm = t.match(/Kurs-Gewinn-Verhältnis\s+([\d.,]+)/) || t.match(/KGV[^\d]{0,12}([\d.,]+)/); return mm ? parseFloat(mm[1].replace(/\./g, "").replace(",", ".")) : null; });
    if (kgv !== null && kgv > 75) assert(/eingeschränkt|nur eingeschränkt|wenig aussagekräftig/i.test(bew), "KGV " + kgv + " ohne Sanity-Hinweis: " + bew.slice(0, 120));
  });
  await check(sym + ": Chancen & Risiken kompakt, Analyse zugeklappt aber vorhanden, keine Anbieternamen", async () => {
    const w = await m.evaluate(() => ({
      offen: [...document.querySelectorAll(".dx-waage-spalte")].map((s) => s.querySelectorAll(":scope > ul > li").length),
      analyse: document.querySelector(".dx-analyse") ? document.querySelector(".dx-analyse").open : null,
      panels: !!document.querySelector(".dx-analyse .dx-panels"),
      text: document.body.innerText
    }));
    if (w.offen.length) assert(w.offen.every((n) => n <= 3), "mehr als drei Punkte offen je Seite: " + w.offen.join("/"));
    assert(w.analyse === false, "die Analyse ist auf dem Telefon nicht zugeklappt: " + w.analyse);
    assert(w.panels, "die Analyse (Kennzahlen und Herleitung) ist verschwunden");
    const treffer = w.text.match(PROVIDER);
    assert(!treffer, "Anbietername/Testsymbol im Seitentext: " + (treffer && treffer[0]));
  });
  await shot(m, "05-" + sym + "-mobil");
}

await check("Farbschema: Wahl wird gemerkt und ueberlebt das Neuladen; zurueck zu System", async () => {
  await m.goto(BASE + "/discover/", { waitUntil: "networkidle" }); await warten(m, 2000);
  await m.click(".dx-schema"); await warten(m, 200);
  const hell = await m.evaluate(() => ({ mode: document.documentElement.getAttribute("data-theme-mode"), theme: document.documentElement.getAttribute("data-theme"), nav: document.querySelector("vu-navigation").getAttribute("theme"), bg: getComputedStyle(document.body).backgroundColor, stored: localStorage.getItem("vu-discover-theme-v1"), scheme: getComputedStyle(document.body).colorScheme }));
  assert(hell.mode === "light" && hell.theme === "light" && hell.nav === "light" && hell.stored === "light", "erster Wechsel: " + JSON.stringify(hell));
  assert(hell.bg === "rgb(247, 247, 244)" && /light/.test(hell.scheme), "helle Flaeche fehlt: " + hell.bg + " " + hell.scheme);
  await shot(m, "06-discover-hell-mobil");
  await m.reload({ waitUntil: "networkidle" }); await warten(m, 1500);
  const nach = await m.evaluate(() => ({ theme: document.documentElement.getAttribute("data-theme"), mode: document.documentElement.getAttribute("data-theme-mode"), bg: getComputedStyle(document.body).backgroundColor }));
  assert(nach.theme === "light" && nach.mode === "light" && nach.bg === "rgb(247, 247, 244)", "nach dem Neuladen: " + JSON.stringify(nach));
  await m.click(".dx-schema"); await warten(m, 200);
  assert(await m.evaluate(() => document.documentElement.getAttribute("data-theme-mode") === "dark" && localStorage.getItem("vu-discover-theme-v1") === "dark"), "zweiter Wechsel fuehrt nicht zu dunkel");
  await m.click(".dx-schema"); await warten(m, 200);
  assert(await m.evaluate(() => document.documentElement.getAttribute("data-theme-mode") === "system" && localStorage.getItem("vu-discover-theme-v1") === null), "dritter Wechsel fuehrt nicht zu System");
});

await check("Farbschema hell: Charts, Leiste und Kopf funktionieren auch auf Weiss", async () => {
  await m.evaluate(() => localStorage.setItem("vu-discover-theme-v1", "light"));
  /* Eine Hash-Navigation laedt die Seite nicht neu; die gespeicherte
     Wahl greift wie bei einem echten Besuch: beim Laden. */
  await m.goto(BASE + "/discover/#/s/US_REAL/AAPL", { waitUntil: "networkidle" });
  await m.reload({ waitUntil: "networkidle" }); await warten(m, 2500);
  const t = await tokenRgb(m);
  const w = await m.evaluate(() => { const svg = document.querySelector(".dx-range-chart, .dx-intraday-chart"); const l = svg.querySelector(".dx-art-line"); return { theme: document.documentElement.getAttribute("data-theme"), dir: svg.getAttribute("data-direction"), stroke: getComputedStyle(l).stroke.replace(/\s+/g, ""), text: getComputedStyle(document.body).color, fnav: getComputedStyle(document.querySelector(".dx-fnav")).display }; });
  assert(w.theme === "light", "Seite ist nicht hell");
  assert(w.stroke === (w.dir === "up" ? t.up : t.down), "Chart-Farbe im hellen Schema: " + w.stroke);
  assert(w.text === "rgb(20, 20, 24)", "Textfarbe im hellen Schema: " + w.text);
  await shot(m, "07-aapl-hell-mobil");
  await m.evaluate(() => localStorage.removeItem("vu-discover-theme-v1"));
});

await check("mobil: keine eigenen 4xx, keine Konsolenfehler", async () => {
  assert(m.__bad.length === 0, m.__bad.slice(0, 3).join(" | "));
  assert(m.__errors.length === 0, m.__errors.slice(0, 3).join(" | "));
});

/* ========================================================== SCHREIBTISCH */
const d = await openPage(DESK);
await d.goto(BASE + "/discover/", { waitUntil: "networkidle" }); await warten(d, 2500);

await check("Schreibtisch: Kopf mit Suchen und Entdecken, leichte schwebende Leiste, Schema-Knopf in der Zeile", async () => {
  const w = await d.evaluate(() => {
    const bar = document.querySelector(".dx-bar"); const kids = [...bar.children].map((k) => ({ k: k.className.split(" ")[0], top: Math.round(k.getBoundingClientRect().top), d: getComputedStyle(k).display }));
    const f = document.querySelector(".dx-fnav").getBoundingClientRect();
    return { kids, bar: Math.round(bar.getBoundingClientRect().height), fnav: { r: Math.round(window.innerWidth - f.right), b: Math.round(window.innerHeight - f.bottom) } };
  });
  const sichtbar = w.kids.filter((k) => k.d !== "none");
  assert(sichtbar.some((k) => k.k === "dx-searchbtn") && sichtbar.some((k) => k.k === "dx-entdecken") && sichtbar.some((k) => k.k === "dx-schema"), "Kopf: " + JSON.stringify(sichtbar));
  const tops = new Set(sichtbar.map((k) => Math.round(k.top / 10)));
  assert(tops.size <= 2 && w.bar < 80, "der Kopf bricht um: " + JSON.stringify(w.kids) + " Hoehe " + w.bar);
  assert(w.fnav.r >= 10 && w.fnav.b >= 10, "die leichte Leiste sitzt nicht rechts unten: " + JSON.stringify(w.fnav));
  await shot(d, "08-discover-desktop");
});

await check("Schreibtisch: Analyse offen, Grenze sichtbar, Kennzahlen und Herleitung vorhanden", async () => {
  await d.goto(BASE + "/discover/#/s/US_REAL/NVDA", { waitUntil: "networkidle" }); await warten(d, 2500);
  const w = await d.evaluate(() => ({ open: document.querySelector(".dx-analyse").open, trenner: !!document.querySelector("summary.dx-trenner"), panels: document.querySelectorAll(".dx-analyse .dx-panel").length, ti: !!document.querySelector(".dx-analyse .dx-ti-state") }));
  assert(w.open === true, "die Analyse ist am Schreibtisch zugeklappt");
  assert(w.trenner && w.panels >= 4 && w.ti, "Analyse unvollstaendig: " + JSON.stringify(w));
});

await check("Daten & Quellen: eigene Seite mit Herkunft, Aktualisierung und Lizenz - die Anbieter stehen NUR dort", async () => {
  await d.goto(BASE + "/discover/#/daten", { waitUntil: "networkidle" }); await warten(d, 1500);
  const text = await d.evaluate(() => document.body.innerText);
  assert(/Daten & Quellen/.test(text), "die Seite hat keinen Titel");
  assert(/Tiingo/.test(text) && /EDGAR|SEC/.test(text), "die Quellenseite nennt die Anbieter nicht");
  assert(/Lizenz|lizenz/.test(text) && /Aktualisier/.test(text), "Lizenz oder Aktualisierung fehlt");
  await d.goto(BASE + "/discover/#/c/US_REAL/market-leaders", { waitUntil: "networkidle" }); await warten(d, 2000);
  const inhalt = await d.evaluate(() => document.body.innerText + " " + [...document.querySelectorAll("[title]")].map((n) => n.getAttribute("title")).join(" "));
  const treffer = inhalt.match(PROVIDER);
  assert(!treffer, "Anbietername in einer Sammlung: " + (treffer && treffer[0]));
});

await check("Farbschema: SYSTEM folgt einem hellen Geraet", async () => {
  const h = await openPage(Object.assign({}, DESK, { colorScheme: "light" }));
  await h.goto(BASE + "/discover/", { waitUntil: "networkidle" }); await warten(h, 2000);
  const w = await h.evaluate(() => ({ mode: document.documentElement.getAttribute("data-theme-mode"), theme: document.documentElement.getAttribute("data-theme"), nav: document.querySelector("vu-navigation").getAttribute("theme"), bg: getComputedStyle(document.body).backgroundColor }));
  assert(w.mode === "system" && w.theme === "light" && w.nav === "light" && w.bg === "rgb(247, 247, 244)", JSON.stringify(w));
  await shot(h, "09-discover-hell-desktop");
  assert(h.__errors.length === 0, h.__errors.slice(0, 3).join(" | "));
  await h.context().close();
});

await check("Schreibtisch: kein Ueberlauf, keine eigenen 4xx, keine Konsolenfehler", async () => {
  await d.goto(BASE + "/discover/", { waitUntil: "networkidle" }); await warten(d, 2000);
  const breit = await d.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(breit <= 2, "Seite " + breit + " px zu breit");
  assert(d.__bad.length === 0, d.__bad.slice(0, 3).join(" | "));
  assert(d.__errors.length === 0, d.__errors.slice(0, 3).join(" | "));
});

/* Zero-Cost Realtime V1 §2/§12: der Strom ist ein eigenes Tor, und es
   ist zu, solange der Worker nicht ausgerollt ist. Diese Pruefung ist
   der Riegel dagegen, dass eine nicht ausgerollte Adresse trotzdem
   angewaehlt wird - das waere auf jeder Aktienseite ein
   Verbindungsversuch ins Leere und ein "Live", das keines ist. */
await check("Strom: Tor zu, kein WebSocket, kein Schluessel in der Auslieferung", async () => {
  const p = await openPage(MOBIL);
  /* WebSocket faelschen, BEVOR die Seite laeuft - danach waere es zu spaet. */
  await p.addInitScript(() => {
    window.__sockets = [];
    const Echt = window.WebSocket;
    window.WebSocket = function (url) { window.__sockets.push(String(url)); return new Echt(url); };
    window.WebSocket.prototype = Echt.prototype;
  });
  await p.goto(BASE + "/discover/#/s/US_REAL/AAPL", { waitUntil: "networkidle" });
  await warten(p, 3000);

  const befund = await p.evaluate(() => {
    const Hub = window.VUDiscover && window.VUDiscover.LiveHub;
    const meta = window.VUDiscoverMeta || {};
    const stream = (meta.realtime && meta.realtime.stream) || null;
    return {
      sockets: window.__sockets || [],
      streamAvailable: stream ? stream.available : null,
      streamUrl: stream ? stream.url : null,
      priceType: stream ? stream.priceType : null,
      hubLive: !!(Hub && typeof Hub.live === "function"),
      hubState: Hub && Hub.liveState ? Hub.liveState().state : null
    };
  });

  assert(befund.hubLive, "der Hub kennt live() nicht - die Erweiterung fehlt");
  assert(befund.streamAvailable === false, "der Strom ist eingeschaltet, obwohl der Worker nicht ausgerollt ist");
  assert(befund.streamUrl === null, "eine Adresse wird ausgeliefert, obwohl der Strom aus ist: " + befund.streamUrl);
  assert(befund.priceType === "REALTIME_REFERENCE", "priceType ist " + befund.priceType);
  assert(befund.sockets.length === 0, "es wurde verbunden: " + befund.sockets.join(", "));
  assert(befund.hubState === "IDLE", "Hub-Zustand " + befund.hubState);

  /* Und die Aktienseite zeigt trotzdem ihren Tagesverlauf - "nichts
     wird schlechter" ist keine Absichtserklaerung, sondern pruefbar. */
  const chart = await p.$(".dx-intraday-chart, .dx-chart svg, .dx-chart-hero, svg.dx-line");
  assert(chart !== null, "ohne Strom fehlt der Chart");
  assert(p.__errors.length === 0, p.__errors.slice(0, 3).join(" | "));
  await p.context().close();
});

await browser.close();
const fails = results.filter((r) => !r.ok);
console.log("\n  " + (results.length - fails.length) + "/" + results.length + " bestanden");
if (fails.length) { fails.forEach((f) => console.log("  FAIL  " + f.name + " — " + f.err)); process.exit(1); }
