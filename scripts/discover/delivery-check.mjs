/* =========================================================================
   VISION UNIVERSE DISCOVER — delivery-check.mjs

   IST ES WIRKLICH DRAUSSEN?

   Ein gruener Pages-Build beweist, dass GitHub etwas gebaut hat. Er beweist
   nicht, dass die Seite funktioniert: ein falscher absoluter Pfad, eine
   fehlende JSON-Datei, ein Gross-/Kleinschreibungsfehler im Dateinamen -
   all das laesst den Build gruen und die Seite leer.

   Dieses Skript prueft die Auslieferung selbst. Es bedient einen Baum genau
   so streng, wie GitHub Pages ihn bedient (Verzeichnis -> index.html,
   sonst 404, Gross-/Kleinschreibung zaehlt), faehrt die sieben Punkte ab,
   an denen das Produkt abgenommen wird, und protokolliert JEDE Netzanfrage
   mit ihrem Status. Am Ende steht keine Vermutung, sondern eine Liste.

   Den veroeffentlichten Baum bekommt man ohne Arbeitskopie so:

     git archive main | tar -x -C /tmp/pages && \
       node scripts/discover/delivery-check.mjs --root /tmp/pages

   Ohne --root wird das Repository selbst bedient.

   Voraussetzung: Playwright (oder ein vorhandener Chromium via
   CHROMIUM_PATH). Das Repository hat bewusst keinen Paketmanager-Stand -
   deshalb laeuft diese Pruefung von Hand, wie browser-qa.mjs.
   ========================================================================= */
import http from "node:http";
import { createReadStream, existsSync, statSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf("--" + name);
  return i === -1 ? fallback : args[i + 1];
}
const ROOT = path.resolve(arg("root", process.cwd()));
const PORT = Number(arg("port", 8099));
const SHOTS = arg("shots", null);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

/* ------------------------------------------------------------- der Server */
/* Bewusst streng: kein Rueckfall auf index.html bei unbekannten Pfaden, kein
   Erraten von Endungen. Pages tut das auch nicht - und ein Server, der
   grosszuegiger ist als die Produktion, verdeckt genau die Fehler, die
   gesucht werden. */
const TYPEN = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8"
};
const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, "http://x").pathname); }
  catch (err) { res.writeHead(400); res.end(); return; }
  let datei = path.join(ROOT, p);
  if (!datei.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  if (p.endsWith("/")) datei = path.join(datei, "index.html");
  else if (existsSync(datei) && statSync(datei).isDirectory()) {
    res.writeHead(301, { Location: p + "/" }); res.end(); return;
  }
  if (!existsSync(datei) || !statSync(datei).isFile()) {
    const nf = path.join(ROOT, "404.html");
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(existsSync(nf) ? readFileSync(nf) : "<h1>404</h1>");
    return;
  }
  res.writeHead(200, { "Content-Type": TYPEN[path.extname(datei)] || "application/octet-stream" });
  createReadStream(datei).pipe(res);
});
await new Promise((ok) => server.listen(PORT, ok));
const BASE = "http://127.0.0.1:" + PORT;

let chromium;
try { ({ chromium } = await import("playwright")); }
catch (err) {
  console.error("Playwright fehlt. 'npm i playwright' und erneut versuchen.");
  server.close(); process.exit(2);
}

const anfragen = [];
const punkte = [];
let fehler = 0;
function pruef(name, ok, detail) {
  punkte.push([ok ? "ok  " : "FAIL", name, detail || ""]);
  if (!ok) fehler++;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined
});
async function seite(ctx, marke) {
  const page = await ctx.newPage();
  page.__meldungen = [];
  /* Gezaehlt wird nur, was aus UNSEREM Baum kommt. Eine blockierte
     Web-Schrift oder das fehlende favicon.ico sagen nichts ueber die
     Auslieferung von Discover - sie wuerden die Pruefung nur unbrauchbar
     machen, weil sie immer rot ist. */
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const ort = (m.location() && m.location().url) || "";
    if (ort && !ort.startsWith(BASE)) return;
    if (ort.indexOf("/favicon.ico") !== -1) return;
    page.__meldungen.push(m.text() + (ort ? "  <- " + ort.replace(BASE, "") : ""));
  });
  page.on("pageerror", (e) => page.__meldungen.push("pageerror: " + e.message));
  page.on("response", (r) => anfragen.push(
    { marke, status: r.status(), url: r.url().replace(BASE, ""), typ: r.request().resourceType() }));
  page.on("requestfailed", (r) => anfragen.push(
    { marke, status: "FEHLGESCHLAGEN", url: r.url().replace(BASE, ""), typ: r.resourceType(),
      grund: r.failure() && r.failure().errorText }));
  return page;
}

/* =============================================================== Desktop */
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const d = await seite(desktop, "desktop");
await d.goto(BASE + "/discover/", { waitUntil: "networkidle" });

pruef("1 Discover-Startseite: Reihen", (await d.locator(".dx-rail").count()) >= 3,
  "Reihen: " + (await d.locator(".dx-rail").count()));
pruef("1 Discover-Startseite: Karten", (await d.locator(".dx-poster").count()) >= 10,
  "Karten: " + (await d.locator(".dx-poster").count()));
pruef("6 Gemeinsame Navigation mit Discover-Eintrag", await d.evaluate(() => {
  const n = document.querySelector("vu-navigation");
  return !!(n && n.shadowRoot &&
    [...n.shadowRoot.querySelectorAll("a")].some((a) => /discover/i.test(a.textContent)));
}));
pruef("6 Navigation: dunkles Thema auf Discover",
  await d.evaluate(() => document.querySelector("vu-navigation").getAttribute("theme") === "dark"));
if (SHOTS) await d.screenshot({ path: SHOTS + "/01-discover-desktop.png" });

const spur = await d.evaluate(async () => {
  const r = document.querySelectorAll(".dx-rail")[1];
  if (!r) return null;
  const vor = r.scrollLeft; r.scrollLeft = vor + 600;
  await new Promise((ok) => setTimeout(ok, 250));
  return { vor, nach: r.scrollLeft, spur: r.scrollWidth, fenster: r.clientWidth };
});
pruef("4 Swipe-Reihe scrollt horizontal",
  !!spur && spur.nach > spur.vor && spur.spur > spur.fenster, JSON.stringify(spur));
if (SHOTS) await d.screenshot({ path: SHOTS + "/02-swipe-desktop.png" });

const route = await d.evaluate(() => {
  const a = document.querySelector(".dx-poster");
  return a ? a.getAttribute("href") : null;
});
pruef("2 Karte traegt Hash-Route", !!route && /^#\/s\//.test(route), String(route));
await d.goto(BASE + "/discover/" + route, { waitUntil: "networkidle" });
await d.waitForTimeout(1200);
pruef("2 Aktienseite rendert",
  ((await d.locator(".dx-dhero").first().textContent()) || "").trim().length > 20);
pruef("3 Chart mit gezeichnetem Pfad", await d.evaluate(() => {
  const c = document.querySelector("#d-root svg path, #d-root canvas");
  if (!c) return false;
  return c.tagName === "path" ? (c.getAttribute("d") || "").length > 40 : c.width > 100;
}));
pruef("3 Zeitraum-Umschalter", (await d.locator(".dx-chip").count()) > 0,
  "Knoepfe: " + (await d.locator(".dx-chip").count()));
if (SHOTS) await d.screenshot({ path: SHOTS + "/03-aktienseite-desktop.png" });
pruef("Desktop ohne Konsolenfehler", d.__meldungen.length === 0, d.__meldungen.slice(0, 3).join(" | "));

/* ================================================================ iPhone */
const iphone = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
  isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
             "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
});
const m = await seite(iphone, "iphone");
await m.goto(BASE + "/discover/", { waitUntil: "networkidle" });
await m.waitForTimeout(600);
let ueber = await m.evaluate(() =>
  ({ seite: document.documentElement.scrollWidth, fenster: window.innerWidth }));
pruef("7 Mobil Discover: kein horizontaler Ueberlauf",
  ueber.seite - ueber.fenster <= 1, JSON.stringify(ueber));
pruef("7 Mobil Discover: Karten sichtbar", (await m.locator(".dx-poster").count()) >= 5,
  "Karten: " + (await m.locator(".dx-poster").count()));
if (SHOTS) await m.screenshot({ path: SHOTS + "/04-discover-iphone.png" });

await m.goto(BASE + "/discover/#/einzeln/US_REAL", { waitUntil: "networkidle" });
await m.waitForTimeout(1200);
const feed = await m.evaluate(() => {
  if (!document.querySelector(".dx-feed")) return null;
  const s = document.querySelectorAll(".dx-feed-screen");
  const erste = s[0] && s[0].getBoundingClientRect();
  return { bildschirme: s.length, hoehe: erste ? Math.round(erste.height) : null,
           fenster: window.innerHeight };
});
pruef("5 Einzeln entdecken: Bildschirme", !!feed && feed.bildschirme > 3, JSON.stringify(feed));
pruef("5 Einzeln entdecken: ein Bildschirm passt ins Fenster",
  !!feed && feed.hoehe > 0 && feed.hoehe <= feed.fenster + 2, JSON.stringify(feed));
if (SHOTS) await m.screenshot({ path: SHOTS + "/05-einzeln-iphone.png" });

await m.goto(BASE + "/discover/" + route, { waitUntil: "networkidle" });
await m.waitForTimeout(1200);
ueber = await m.evaluate(() =>
  ({ seite: document.documentElement.scrollWidth, fenster: window.innerWidth }));
pruef("7 Mobil Aktienseite: kein horizontaler Ueberlauf",
  ueber.seite - ueber.fenster <= 1, JSON.stringify(ueber));
if (SHOTS) await m.screenshot({ path: SHOTS + "/06-aktienseite-iphone.png" });
pruef("iPhone ohne Konsolenfehler", m.__meldungen.length === 0, m.__meldungen.slice(0, 3).join(" | "));

/* =============================================================== 404-Weg */
const vierNullVier = await d.goto(BASE + "/Discover/", { waitUntil: "domcontentloaded" });
pruef("404-Verhalten: falsche Schreibweise liefert 404 mit Rueckweg",
  vierNullVier.status() === 404 &&
  (await d.locator('a[href="/discover/"]').count()) > 0,
  "Status " + vierNullVier.status());
const ohneStrich = await d.goto(BASE + "/discover", { waitUntil: "domcontentloaded" });
pruef("Ohne Schrägstrich: Umleitung auf /discover/",
  ohneStrich.url().endsWith("/discover/"), ohneStrich.url());

await browser.close();
server.close();

/* ============================================================= Auswertung */
/* Fremde Hosts (Schriften, Karten) gelten nicht als Auslieferungsfehler
   dieses Repositories - sie liegen nicht in unserem Baum. */
const eigene = anfragen.filter((a) => a.url.startsWith("/"));
const schlecht = eigene.filter((a) =>
  a.status === "FEHLGESCHLAGEN" || (typeof a.status === "number" && a.status >= 400 &&
  a.url !== "/favicon.ico" && !a.url.startsWith("/Discover")));
console.log("\n=== AUSLIEFERUNG (" + ROOT + ") ===");
console.log("eigene Anfragen: " + eigene.length + " | mit Fehlerstatus: " + schlecht.length);
const gesehen = new Set();
schlecht.forEach((a) => {
  const k = a.status + a.url;
  if (gesehen.has(k)) return;
  gesehen.add(k);
  console.log("  " + a.status + "  " + a.typ + "  " + a.url + (a.grund ? "  (" + a.grund + ")" : ""));
});
console.log("\n=== ABNAHMEPUNKTE ===");
punkte.forEach((p) => console.log(p[0] + "  " + p[1] + (p[2] ? "   [" + p[2] + "]" : "")));
console.log("\nFehlschlaege: " + (fehler + schlecht.length));
process.exit(fehler + schlecht.length ? 1 : 0);
