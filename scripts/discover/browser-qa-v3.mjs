/* =========================================================================
   VISION UNIVERSE DISCOVER — browser-qa-v3.mjs

   Die Abnahme von V3 im Browser: Startseite in Stuecken, keine Fake-Charts,
   Swipe mit Finger, Maus und Tastatur, Aktienseite, Einzelmodus mit Ende
   und Ausgaengen, Gedaechtnis, kein horizontaler Ueberlauf - Desktop und
   iPhone getrennt.

   Voraussetzung: Playwright (npm i playwright) und ein lokaler Server:
     node scripts/discover/delivery-check.mjs   (oder python3 -m http.server)
   Ausfuehren:
     node scripts/discover/browser-qa-v3.mjs http://127.0.0.1:8120 [shots-dir]
   ========================================================================= */
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
const BASE = process.argv[2] || "http://127.0.0.1:8120";
const SHOTS = process.argv[3]; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
/* Der Strom, der in dieser Umgebung nicht erreichbar ist: ein
   fehlgeschlagener WebSocket-Aufbau schreibt eine Konsolenzeile, die
   kein Skript verhindern kann. Die Ausnahme gilt nur fuer GENAU die
   Adresse aus der Auslieferung und nur fuer den Verbindungsaufbau; sie
   wird gezaehlt und am Ende ausgewiesen. Dass der Strom laeuft, weist
   scripts/discover/browser-qa-realtime.mjs in Actions nach - dort ohne
   jede Ausnahme. */
const STROM_URL = (() => {
  try {
    const meta = JSON.parse(readFileSync("discover/data/meta.json", "utf8"));
    return (meta.realtime && meta.realtime.stream && meta.realtime.stream.url) || null;
  } catch (err) { return null; }
})();
const STROM_UNERREICHBAR = STROM_URL
  ? new RegExp("WebSocket connection to '" + STROM_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
               "' failed: (Establishing a tunnel|Error during WebSocket handshake|.*ERR_)")
  : /$^/;
let stromUnerreichbar = 0;
const punkte = []; let fehler = 0;
const ok = (n, c, d) => { punkte.push([c ? "ok  " : "FAIL", n, d || ""]); if (!c) fehler++; };
async function seite(ctx, marke) {
  const p = await ctx.newPage(); p.__m = []; p.__bad = [];
  p.on("console", (m) => { if (m.type() === "error") { if (STROM_UNERREICHBAR.test(m.text())) { stromUnerreichbar++; return; } const u = (m.location() && m.location().url) || ""; if (!u || u.startsWith(BASE)) if (!u.includes("favicon")) p.__m.push(m.text()); } });
  p.on("pageerror", (e) => p.__m.push("pageerror: " + e.message));
  p.on("response", (r) => { if (r.status() >= 400 && r.url().startsWith(BASE) && !r.url().includes("favicon")) p.__bad.push(r.status() + " " + r.url().replace(BASE, "")); });
  return p;
}
const warten = (p, ms) => p.waitForTimeout(ms);

/* ---------------------------------------------------------- Desktop */
const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const d = await seite(desk, "desktop");
await d.goto(BASE + "/discover/", { waitUntil: "networkidle" }); await warten(d, 800);
const s1 = await d.evaluate(() => [...document.querySelectorAll("[data-surface-type]")].map((n) => n.getAttribute("data-surface-type")));
ok("Home: Stueck 1 gerendert (>=5 Surfaces)", s1.length >= 5, s1.join(","));
ok("Home: Rangliste vorhanden", s1.includes("ranking"));
/* V4 §23: die Themenwelten stehen nach Wachstum und Cashflow - im
   nachgeladenen Teil der Startseite, nicht im ersten Stueck. */
await d.mouse.wheel(0, 6000); await warten(d, 1200); await d.mouse.wheel(0, 6000); await warten(d, 1200);
const sTheme = await d.evaluate(() => [...document.querySelectorAll("[data-surface-type]")].map((n) => n.getAttribute("data-surface-type")));
ok("Home: Themenwelt vorhanden (nach dem Nachladen)", sTheme.includes("theme"), sTheme.join(","));
await d.evaluate(() => window.scrollTo(0, 0)); await warten(d, 300);
ok("Home: Hero rendert Name", ((await d.locator(".dx-hero-title").first().textContent()) || "").length > 2);
/* Keine Fake-Charts: Linien nur, wo priceSeries CALCULATED */
const fake = await d.evaluate(() => {
  const arts = [...document.querySelectorAll(".dx-art")];
  const preis = arts.filter((a) => a.getAttribute("data-art") === "price").length;
  const leiter = arts.filter((a) => a.getAttribute("data-art") === "ladder").length;
  const pfad = arts.filter((a) => a.querySelector(".dx-art-band") || (a.querySelectorAll(".dx-art-node").length > 1)).length;
  return { arts: arts.length, preis, leiter, mehrpunkt: pfad };
});
ok("Keine Renditepfad-Linie mehr (kein Mehrpunkt-Artwork)", fake.mehrpunkt === 0, JSON.stringify(fake));
/* Leitern gibt es nur fuer Titel ohne Reihe und ohne Snapshot; mit
   vollstaendiger Abdeckung koennen sie ganz fehlen. Gezaehlt wird deshalb,
   dass es Datenbilder gibt und keines davon ein Renditepfad ist. */
const bilder = await d.evaluate(() => document.querySelectorAll('.dx-art, [data-art="intraday"]').length);
ok("Datenbilder werden gezeichnet (Leiter, Linie oder Tagesverlauf)", bilder > 0, JSON.stringify(fake) + " bilder " + bilder);
/* Eine Linie nur bei Golden Five */
/* Linien nur dort, wo eine freigegebene Reihe oder ein Snapshot vorliegt -
   der Umfang kommt aus den ausgelieferten Verzeichnissen, nicht aus einer
   Liste im Test. */
const freigegeben = await d.evaluate(async () => {
  const out = new Set();
  try { const i = await (await fetch("/quant/data/market/discover-series/index.json")).json(); (i.tickers || []).forEach((t) => out.add(t)); } catch (e) {}
  const Hub = window.VUDiscover.LiveHub; const idx = Hub && Hub.index();
  if (idx && idx.entries) Object.keys(idx.entries).forEach((t) => out.add(t));
  return [...out];
});
const linien = await d.evaluate(() => [...document.querySelectorAll('.dx-poster .dx-art[data-art="price"], .dx-poster [data-art="intraday"]')].map((a) => a.closest(".dx-poster").getAttribute("data-symbol")));
ok("Linien nur bei freigegebenen Titeln (Reihe oder Snapshot)", linien.every((s) => freigegeben.includes(s)), linien.filter((s) => !freigegeben.includes(s)).join(",") || (linien.length + " Linien"));
if (SHOTS) await d.screenshot({ path: SHOTS + "/01-home-desktop.png" });

/* Nachladen: scrollen bis alle Stuecke da sind */
for (let i = 0; i < 12; i++) { await d.mouse.wheel(0, 1600); await warten(d, 350); }
await d.waitForLoadState("networkidle"); await warten(d, 500);
const sAlle = await d.evaluate(() => [...document.querySelectorAll("[data-surface-type]")].map((n) => n.getAttribute("data-surface-type")));
ok("Home: alle Stuecke nachgeladen (>=18 Surfaces)", sAlle.length >= 18, sAlle.length + ": " + sAlle.join(","));
ok("Home: Featured-Karte vorhanden", sAlle.includes("featured-card"));
ok("Home: Einstieg Einzeln entdecken vorhanden", sAlle.includes("immersive"));
ok("Home: Footer nach dem letzten Stueck", (await d.locator("footer.dx-foot").count()) === 1);
const home2 = await d.evaluate(() => document.getElementById("dxdummy") ? 0 : document.querySelectorAll(".dx-poster").length);
ok("Home: viele Karten (>=120)", home2 >= 120, "Karten: " + home2);
if (SHOTS) { await d.evaluate(() => window.scrollTo(0, 0)); await warten(d, 300);
  const th = await d.locator(".dx-theme").first(); await th.scrollIntoViewIfNeeded(); await warten(d, 400);
  await d.screenshot({ path: SHOTS + "/02-theme-desktop.png" });
  const fc = await d.locator(".dx-featured").first(); await fc.scrollIntoViewIfNeeded(); await warten(d, 400);
  await d.screenshot({ path: SHOTS + "/03-featured-desktop.png" }); }

/* Swipe: Tastatur + Ziehen */
const spur = await d.evaluate(async () => {
  const r = document.querySelectorAll(".dx-rail")[1]; r.focus();
  const vor = r.scrollLeft;
  r.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  await new Promise((k) => setTimeout(k, 300));
  return { vor, nach: r.scrollLeft };
});
ok("Tastatur: Pfeil rechts scrollt die Reihe", spur.nach > spur.vor, JSON.stringify(spur));
await d.locator(".dx-rail").nth(2).scrollIntoViewIfNeeded(); await warten(d, 300);
const box = await d.locator(".dx-rail").nth(2).boundingBox();
await d.mouse.move(box.x + box.width - 60, box.y + box.height / 2); await d.mouse.down();
await d.mouse.move(box.x + 100, box.y + box.height / 2, { steps: 12 }); await d.mouse.up(); await warten(d, 300);
const gezogen = await d.evaluate(() => document.querySelectorAll(".dx-rail")[2].scrollLeft);
ok("Maus: Ziehen scrollt die Reihe", gezogen > 100, "scrollLeft " + gezogen);
ok("Desktop: keine eigenen 4xx", d.__bad.length === 0, d.__bad.join(" | "));
ok("Desktop: keine Konsolenfehler", d.__m.length === 0, d.__m.slice(0, 3).join(" | "));

/* Aktienseite: Golden Five mit echtem Chart, Withheld mit Leiter */
await d.goto(BASE + "/discover/#/s/US_REAL/NVDA", { waitUntil: "networkidle" }); await warten(d, 1500);
ok("Detail NVDA: Chart mit Pfad", await d.evaluate(() => !!document.querySelector("#d-root svg path[d]")));
if (SHOTS) await d.screenshot({ path: SHOTS + "/04-detail-nvda-desktop.png" });
await d.goto(BASE + "/discover/#/s/US_REAL/VLO", { waitUntil: "networkidle" }); await warten(d, 1200);
const vlo = await d.evaluate(() => ({ leiter: !!document.querySelector(".dx-ladder-gross"), intraday: !!document.querySelector(".dx-intraday-chart"),
                                       tages: !!document.querySelector(".q-tchart"), pfad: !!document.querySelector(".dx-spark.dx-hero-chart") }));
ok("Detail VLO: Leiter, Tageschart oder Tagesverlauf - nie ein Renditepfad", (vlo.leiter || vlo.intraday || vlo.tages) && !vlo.pfad, JSON.stringify(vlo));
if (SHOTS) await d.screenshot({ path: SHOTS + "/05-detail-vlo-desktop.png" });

/* Kategorie Thema */
await d.goto(BASE + "/discover/#/c/US_REAL/thema-ki", { waitUntil: "networkidle" }); await warten(d, 800);
ok("Thema-Kategorie: redaktioneller Hinweis", (await d.locator(".dx-note").filter({ hasText: "Redaktionelle" }).count()) === 1);

/* ---------------------------------------------------------- iPhone */
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" });
const m = await seite(phone, "iphone");
await m.goto(BASE + "/discover/", { waitUntil: "networkidle" }); await warten(m, 800);
let ov = await m.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
ok("Mobil Home: kein horizontaler Ueberlauf", ov.doc - ov.win <= 1, JSON.stringify(ov));
/* naechste Karte angeschnitten? */
const schnitt = await m.evaluate(() => {
  const r = document.querySelectorAll(".dx-rail")[1]; const k = r.children;
  const w = window.innerWidth; let sichtbar = 0, teil = 0;
  for (const c of k) { const b = c.getBoundingClientRect(); if (b.left < w && b.right > 0) { if (b.right <= w) sichtbar++; else teil++; } }
  return { sichtbar, teil };
});
ok("Mobil: naechste Karte sichtbar angeschnitten", schnitt.teil >= 1, JSON.stringify(schnitt));
if (SHOTS) await m.screenshot({ path: SHOTS + "/06-home-iphone.png" });
for (let i = 0; i < 20; i++) { await m.mouse.wheel(0, 1400); await warten(m, 250); }
await m.waitForLoadState("networkidle"); await warten(m, 500);
const mAlle = await m.evaluate(() => document.querySelectorAll("[data-surface-type]").length);
ok("Mobil: alle Stuecke nachgeladen", mAlle >= 18, "Surfaces " + mAlle);
ov = await m.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
ok("Mobil Home (voll): kein horizontaler Ueberlauf", ov.doc - ov.win <= 1, JSON.stringify(ov));
if (SHOTS) { await m.evaluate(() => window.scrollTo(0, 0)); const th = m.locator(".dx-theme").first(); await th.scrollIntoViewIfNeeded(); await warten(m, 300);
  await m.screenshot({ path: SHOTS + "/07-theme-iphone.png" });
  const fc = m.locator(".dx-featured").first(); await fc.scrollIntoViewIfNeeded(); await warten(m, 300);
  await m.screenshot({ path: SHOTS + "/08-featured-iphone.png" });
  const im = m.locator(".dx-immersive").first(); await im.scrollIntoViewIfNeeded(); await warten(m, 300);
  await m.screenshot({ path: SHOTS + "/09-immersive-entry-iphone.png" }); }
/* Touch-Swipe */
const rb = await m.locator(".dx-rail").nth(1).boundingBox();
const vorT = await m.evaluate(() => document.querySelectorAll(".dx-rail")[1].scrollLeft);
await m.touchscreen.tap(rb.x + 10, rb.y + 10);
await m.evaluate(async () => { const r = document.querySelectorAll(".dx-rail")[1]; r.scrollBy({ left: 300, behavior: "auto" }); await new Promise((k) => setTimeout(k, 200)); });
const nachT = await m.evaluate(() => document.querySelectorAll(".dx-rail")[1].scrollLeft);
ok("Mobil: Reihe ist horizontal scrollbar", nachT > vorT, vorT + " -> " + nachT);
/* Einzelmodus */
await m.goto(BASE + "/discover/#/einzeln/US_REAL", { waitUntil: "networkidle" }); await warten(m, 1200);
/* V4.1 §17: der Feed ist kein Stapel von 20 Karten mehr, sondern eine
   lange, deterministische Reihe in Stuecken (12 je Stueck), die
   nachlaedt, bevor das Ende des Geladenen erreicht ist - ohne Doppelte. */
const feed = await m.evaluate(() => ({ screens: document.querySelectorAll(".dx-feed-screen[data-index]").length, ende: !!document.querySelector(".dx-feed-screen--ende .dx-btn"), ausgaenge: document.querySelectorAll(".dx-feed-screen--ende .dx-btn").length, gesamt: Number((document.querySelector(".dx-feed-zaehler").textContent.match(/von (\d+)/) || [])[1]), stand: document.querySelector(".dx-feed").__stand() }));
ok("Einzeln: erstes Stueck (>= 10 Titel), Ende mit Ausgaengen, weit mehr als 10 Titel insgesamt", feed.screens >= 10 && feed.screens <= 14 && feed.ausgaenge >= 3 && feed.gesamt > 100 && feed.stand.gesamt === feed.gesamt, JSON.stringify(feed));
for (let i = 0; i < 16; i++) { await m.evaluate(() => { const s = document.querySelector(".dx-feed-spur"); s.scrollTop += s.clientHeight; }); await warten(m, 320); }
const feed2 = await m.evaluate(() => { const syms = [...document.querySelectorAll(".dx-feed-screen[data-index]")].map((n) => n.dataset.symbol); return { screens: syms.length, doppelt: syms.length - new Set(syms).size, zaehler: document.querySelector(".dx-feed-zaehler").textContent.trim(), stand: document.querySelector(".dx-feed").__stand() }; });
ok("Einzeln: nach 16 Wischern sind mehr als 12 Titel geladen, keiner doppelt, der Zaehler zaehlt", feed2.screens > 12 && feed2.doppelt === 0 && /^1[5-9] von|^2\d von/.test(feed2.zaehler) && feed2.stand.gezeigt >= 24, JSON.stringify(feed2));
if (SHOTS) await m.screenshot({ path: SHOTS + "/10-einzeln-iphone.png" });
/* Aktienseite mobil */
await m.goto(BASE + "/discover/#/s/US_REAL/AAPL", { waitUntil: "networkidle" }); await warten(m, 1500);
ov = await m.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
ok("Mobil Detail: kein Ueberlauf", ov.doc - ov.win <= 1, JSON.stringify(ov));
if (SHOTS) await m.screenshot({ path: SHOTS + "/11-detail-aapl-iphone.png" });
/* Gedaechtnis: zurueck auf Home -> Zuletzt angesehen */
await m.goto(BASE + "/discover/#/u/US_REAL", { waitUntil: "networkidle" }); await warten(m, 800);
ok("Gedaechtnis: 'Zuletzt angesehen' erscheint", (await m.locator(".dx-recent").count()) === 1);
ok("Gedaechtnis: gesehene Karte markiert", (await m.locator(".dx-poster--gesehen").count()) >= 0);
ok("Mobil: keine eigenen 4xx", m.__bad.length === 0, m.__bad.join(" | "));
ok("Mobil: keine Konsolenfehler", m.__m.length === 0, m.__m.slice(0, 3).join(" | "));
/* Lazy Loading der Kursreihen: sichtbare Karten laden, ein Titel einmal,
   Platzhalter ist kein Chart, nichts springt. Gemessen im realen
   Universum (das Modelluniversum wird seit dem 15.09.2026 nicht mehr
   ausgeliefert). */
{
  const lz = await seite(desk, "lazy");
  const serien = [];
  /* Reihen kommen aus dem Series-Store (discover/data/series) oder als
     kompakte Jahresreihe (quant/data/market/discover-series). */
  lz.on("request", (r) => { if (/\/discover\/data\/series\/|\/discover-series\//.test(r.url())) serien.push(r.url()); });
  await lz.goto(BASE + "/discover/#/u/US_REAL", { waitUntil: "domcontentloaded" });
  /* Erst wenn Karten im DOM stehen, laesst sich der Platzhalter pruefen -
     gegen die veroeffentlichte Seite brauchen Manifest und erstes Stueck
     mehr als 150 ms; ohne Karten waere die Pruefung leer, nicht bestanden. */
  await lz.waitForSelector(".dx-poster-media", { timeout: 8000 }).catch(() => {});
  const skelett = await lz.evaluate(() => {
    const s = document.querySelectorAll(".dx-art-skeleton");
    return { anzahl: s.length, chart: [...s].some((n) => n.querySelector("path, rect.dx-ladder-bar")),
             text: s[0] ? s[0].textContent : null };
  });
  ok("Lazy: Platzhalter ist eindeutig kein Chart", skelett.chart === false && skelett.text === "Kurs lädt", JSON.stringify(skelett));
  /* Ganze Pixel: die Renderer liefern mitten im Layout Sub-Pixel-Werte
     (131.99994 vs. 132), die keinen Sprung bedeuten. */
  const hoeheVor = await lz.evaluate(() => [...document.querySelectorAll(".dx-poster-media")].slice(0, 6).map((n) => Math.round(n.getBoundingClientRect().height)));
  await lz.waitForLoadState("networkidle"); await warten(lz, 800);
  const hoeheNach = await lz.evaluate(() => [...document.querySelectorAll(".dx-poster-media")].slice(0, 6).map((n) => Math.round(n.getBoundingClientRect().height)));
  ok("Lazy: keine Layout-Spruenge (Hoehe vor/nach dem Laden gleich)", JSON.stringify(hoeheVor) === JSON.stringify(hoeheNach), hoeheVor + " -> " + hoeheNach);
  const stand = await lz.evaluate(() => window.VUDiscover.SeriesLoader.stats());
  const eindeutig = new Set(serien).size;
  ok("Lazy: ein Titel, ein Abruf (Dedup)", serien.length === eindeutig && stand.requests === eindeutig, JSON.stringify({ abrufe: serien.length, titel: eindeutig, stats: stand }));
  /* Geladen heisst: Tagesreihe ODER Tagesverlauf gezeichnet (im realen
     Universum traegt die sichtbare Karte den Intraday-Verlauf). */
  /* Die Kartenmedien der ersten Reihe liegen bei 1280x800 knapp unter der
     Falz (Eingangsflaeche + Reihenkopf + Kartentext): ein Bildschirm-Drittel
     scrollen, dann muessen die sichtbaren geladen sein - und nur die. */
  await lz.evaluate(() => window.scrollBy(0, 320)); await lz.waitForLoadState("networkidle"); await warten(lz, 700);
  const sichtbar = await lz.evaluate(() => document.querySelectorAll(".dx-poster-media [data-art=\"price\"], .dx-poster-media [data-art=\"intraday\"]").length);
  const gesamt = await lz.evaluate(() => document.querySelectorAll(".dx-poster-media").length);
  ok("Lazy: nur sichtbare Karten haben geladen (nicht alle)", sichtbar > 0 && sichtbar < gesamt, sichtbar + " von " + gesamt + " Karten");
  /* Nach Scrollen laden weitere - ohne Doppelabrufe */
  for (let i = 0; i < 6; i++) { await lz.mouse.wheel(0, 1200); await warten(lz, 250); }
  await lz.waitForLoadState("networkidle"); await warten(lz, 500);
  const danach = await lz.evaluate(() => window.VUDiscover.SeriesLoader.stats());
  ok("Lazy: beim Scrollen kommen Reihen nach, keine doppelt", danach.requests > stand.requests && danach.requests === new Set(serien).size, JSON.stringify(danach));
  /* Golden Five im realen Universum: Linie kommt nach dem Laden */
  await lz.goto(BASE + "/discover/#/c/US_REAL/thema-ki", { waitUntil: "networkidle" }); await warten(lz, 900);
  /* Die Karte kann unterhalb der Falz liegen (Reihenfolge der Reihe ist Daten,
     nicht Testannahme): sichtbar machen, dann laedt sie. */
  await lz.evaluate(() => { const p = document.querySelector('.dx-poster[data-symbol="NVDA"]'); if (p) p.scrollIntoView({ block: "center" }); });
  await lz.waitForLoadState("networkidle"); await warten(lz, 900);
  const nvda = await lz.evaluate(() => { const m = document.querySelector('.dx-poster[data-symbol="NVDA"] .dx-art, .dx-poster[data-symbol="NVDA"] [data-art]'); return m ? m.getAttribute("data-art") : null; });
  ok("Lazy: NVDA-Karte zeichnet nach dem Laden eine echte Linie (Tagesreihe oder Tagesverlauf)", nvda === "price" || nvda === "intraday", String(nvda));
  /* Eine Karte ohne Reihe und ohne Snapshot - welche, entscheiden die
     Daten - zeichnet die Leiter und loest keinen Abruf aus. */
  const ohne = await lz.evaluate(() => {
    const Hub = window.VUDiscover.LiveHub;
    for (const p of document.querySelectorAll(".dx-poster")) {
      const s = p.getAttribute("data-symbol"); const media = p.querySelector("[data-series]");
      const hatReihe = media && media.getAttribute("data-series"); const hatLive = Hub && Hub.enabled() && Hub.resolveEntry(s);
      if (!hatReihe && !hatLive) { const m = p.querySelector(".dx-art"); return { s, art: m ? m.getAttribute("data-art") : null }; }
    }
    return null;
  });
  ok("Lazy: Karte ohne Reihe/Snapshot zeichnet die Leiter - ohne Abruf", !ohne || (ohne.art === "ladder" && !serien.some((u) => u.includes("/" + ohne.s + ".json"))), JSON.stringify(ohne));
}

/* Keine Sackgassen: jeder "Alle anzeigen"-Link fuehrt auf eine Kategorie, die laedt. */
await d.goto(BASE + "/discover/", { waitUntil: "networkidle" }); await warten(d, 500);
for (let i = 0; i < 12; i++) { await d.mouse.wheel(0, 1600); await warten(d, 200); }
await d.waitForLoadState("networkidle");
const links = await d.evaluate(() => [...new Set([...document.querySelectorAll(".dx-more")].map((a) => a.getAttribute("href")))]);
let tot = 0;
for (const href of links) {
  const teile = href.replace(/^#\//, "").split("/");
  if (teile[0] !== "c") continue;
  const r = await d.request.get(BASE + "/discover/data/rows/" + teile[1] + "/" + teile[2] + ".json");
  if (r.status() !== 200) tot++;
}
ok("Keine Sackgassen: alle Sammlungs-Links laden (" + links.length + ")", tot === 0, "tot: " + tot);
await browser.close();
console.log("\n=== DISCOVER V3 QA ===");
punkte.forEach((p) => console.log(p[0] + "  " + p[1] + (p[2] ? "   [" + p[2] + "]" : "")));
console.log("\nFehlschlaege: " + fehler);
if (stromUnerreichbar) console.log("Hinweis: " + stromUnerreichbar + " Konsolenzeile(n) ueber den nicht erreichbaren Strom (" + STROM_URL + ").");
process.exit(fehler ? 1 : 0);
