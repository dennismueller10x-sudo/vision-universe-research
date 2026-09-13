/* =========================================================================
   VISION UNIVERSE DISCOVER — browser-qa-live.mjs

   Die Abnahme der Live-Schicht im Browser: Tagesverlauf auf Karten,
   Eingangsflaeche und Aktienseite; Abonnements nur fuer sichtbare Karten,
   Kuendigung beim Scrollen, keine Fake-Linie, keine Konsolenfehler, kein
   horizontaler Ueberlauf - Desktop und iPhone-Breite getrennt.

   Voraussetzung: Playwright und ein lokaler Server, der die Seite samt
   Intraday-Snapshots ausliefert (quant/data/market/intraday/). Mit
   --clock=<ISO> laeuft die Seite mit gestellter Uhr (z. B. Freitag 15:00
   New York = 2026-09-11T19:00:00Z), sonst mit der echten.

   Ausfuehren:
     node scripts/discover/browser-qa-live.mjs http://127.0.0.1:8121 [shots-dir] [--clock=ISO]
   ========================================================================= */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const BASE = args[0] || "http://127.0.0.1:8121";
const SHOTS = args[1]; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const CLOCK = (process.argv.find((a) => a.startsWith("--clock=")) || "").slice(8) || null;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const punkte = []; let fehler = 0;
const ok = (n, c, d) => { punkte.push([c ? "ok  " : "FAIL", n, d || ""]); if (!c) fehler++; };
async function seite(ctx) {
  const p = await ctx.newPage(); p.__m = []; p.__bad = []; p.__req = [];
  if (CLOCK) { await p.clock.install({ time: new Date(CLOCK) }); }
  p.on("console", (m) => { if (m.type() === "error") { const u = (m.location() && m.location().url) || ""; if ((!u || u.startsWith(BASE)) && !u.includes("favicon")) p.__m.push(m.text()); } });
  p.on("pageerror", (e) => p.__m.push("pageerror: " + e.message));
  p.on("request", (r) => { if (r.url().startsWith(BASE)) p.__req.push(r.url().replace(BASE, "")); });
  p.on("response", (r) => { if (r.status() >= 400 && r.url().startsWith(BASE) && !r.url().includes("favicon")) p.__bad.push(r.status() + " " + r.url().replace(BASE, "")); });
  return p;
}
const warten = (p, ms) => p.waitForTimeout(ms);
const stats = (p) => p.evaluate(() => window.VUDiscover.LiveHub.stats());
const lage = (p) => p.evaluate(() => { const r = window.VUDiscover.LiveHub.resolution(); return r ? { state: r.marketState, display: r.displaySession.sessionDate, local: r.localDate + " " + r.localTime } : null; });

/* ---------------------------------------------------------- Desktop */
const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const d = await seite(desk);
await d.goto(BASE + "/discover/", { waitUntil: "networkidle" }); await warten(d, 1200);
const l0 = await lage(d);
const eintraege = await d.evaluate(() => (window.VUDiscover.LiveHub.enabled() && window.VUDiscover.LiveHub.index()) ? (window.VUDiscover.LiveHub.index().entryCount || 0) : -1);
ok("Hub aktiv (meta.realtime.available) und Verzeichnis geladen", eintraege >= 0, JSON.stringify(l0) + " entries " + eintraege);
if (eintraege === 0) {
  /* Noch kein Intraday-Lauf: der Hub muss still bleiben - kein Abruf, kein
     Fehler, Karten zeigen Tagesreihe oder Leiter. Der Rest der Pruefung
     braucht Snapshots und entfaellt hier ausdruecklich. */
  await d.mouse.wheel(0, 900); await warten(d, 1200);
  const s0 = await stats(d);
  ok("Ohne Snapshots: keine Snapshot-Abrufe, kein Polling", s0.snapshotRequests === 0 && s0.polling === false, JSON.stringify(s0));
  ok("Ohne Snapshots: keine Intraday-Linie", (await d.evaluate(() => document.querySelectorAll('[data-art="intraday"]').length)) === 0);
  ok("Ohne Snapshots: Karten zeigen Tagesreihe oder Leiter", (await d.evaluate(() => document.querySelectorAll('.dx-art[data-art="price"], .dx-art[data-art="ladder"]').length)) > 5);
  ok("Desktop: keine Konsolenfehler", d.__m.length === 0, d.__m.slice(0, 3).join(" | "));
  ok("Desktop: keine 4xx/5xx auf eigene Pfade", d.__bad.length === 0, d.__bad.slice(0, 3).join(" | "));
  await browser.close();
  console.log("\nDiscover Live-QA (ohne Snapshots) — " + punkte.length + " Pruefpunkte, " + fehler + " Fehler\n");
  for (const [s, n, dd] of punkte) console.log(`  ${s} ${n}${dd ? "  — " + dd : ""}`);
  process.exit(fehler ? 1 : 0);
}
/* Die Eingangsflaeche fuellt den ersten Bildschirm; die Karten beginnen
   darunter. Ein Bildschirm weiter muessen Tagesverlaeufe stehen. */
await d.mouse.wheel(0, 700); await warten(d, 900);
const intra = await d.evaluate(() => [...document.querySelectorAll('[data-art="intraday"]')].length);
ok("Tagesverlauf auf Karten gezeichnet (>=5 nach einem Bildschirm)", intra >= 5, "intraday svgs: " + intra);
const labels = await d.evaluate(() => [...new Set([...document.querySelectorAll(".dx-live-label")].map((n) => n.textContent.trim()))]);
ok("Beschriftung in Seitensprache (Heute/Letzter Handelstag)", labels.length > 0 && labels.every((t) => /^(Heute · (live|Stand \d\d:\d\d|Schluss \d\d:\d\d)|Letzter Handelstag · )/.test(t)), labels.join(" | "));
ok("Keine technischen Codes auf Karten", labels.every((t) => !/OPEN|CLOSED|PRE_MARKET|AFTER_HOURS|HOLIDAY|Keine Live-Daten/.test(t)));
/* Kein Fake: jede Intraday-Linie stammt aus einem validen Snapshot */
const fake = await d.evaluate(() => [...document.querySelectorAll('[data-art="intraday"]')].map((s) => ({ sess: s.getAttribute("data-session"), n: s.querySelectorAll(".dx-art-line").length, title: s.querySelector("title") && s.querySelector("title").textContent })));
ok("Jede Intraday-Linie traegt Sitzung, Quelle und Stand", fake.every((f) => f.sess && f.n === 1 && /Quelle tiingo.*Stand/.test(f.title || "")), JSON.stringify(fake[0]));
const s1 = await stats(d);
const sichtbar = await d.evaluate(() => [...document.querySelectorAll("[data-live]")].filter((n) => { const r = n.getBoundingClientRect(); return r.bottom > -80 && r.top < innerHeight + 80; }).length);
ok("Abonnements nur fuer sichtbare Karten (Abonnenten <= sichtbare Live-Karten + Hero)", s1.subscribers <= sichtbar + 2, "subscribers " + s1.subscribers + ", sichtbar " + sichtbar);
ok("Ein Verzeichnis-Abruf, jeder Snapshot hoechstens einmal geholt (requests == cached, keine Fehler)",
   s1.indexLoads === 1 && s1.snapshotRequests === s1.cachedSnapshots && s1.failures === 0, JSON.stringify(s1));
ok("Hero traegt den Tagesverlauf", (await d.locator(".dx-hero-live svg").count()) >= 1);
if (SHOTS) await d.screenshot({ path: SHOTS + "/live-01-home-desktop.png" });
/* Scrollen: Abmeldungen passieren, Anzahl bleibt begrenzt */
for (let i = 0; i < 8; i++) { await d.mouse.wheel(0, 1400); await warten(d, 300); }
await warten(d, 600);
const s2 = await stats(d);
ok("Beim Scrollen werden Abonnements gekuendigt", s2.unsubscriptions > 0, "unsubscriptions " + s2.unsubscriptions);
ok("Abonnenten bleiben begrenzt (<= 40 nach 8 Bildschirmen)", s2.subscribers <= 40, "subscribers " + s2.subscribers + ", cached " + s2.cachedSnapshots);
ok("Snapshot-Abrufe bleiben unter der Kartenzahl", s2.snapshotRequests < (await d.evaluate(() => document.querySelectorAll(".dx-poster").length)), "requests " + s2.snapshotRequests);
const nachlade = await d.evaluate(() => [...document.querySelectorAll("[data-live]")].length);
ok("Nachgeladene Karten zeigen ebenfalls Tagesverlauf", nachlade > intra, nachlade + " > " + intra);
if (SHOTS) await d.screenshot({ path: SHOTS + "/live-02-home-scrolled-desktop.png" });
/* Polling-Zustand passt zur Marktlage */
ok("Polling nur bei offener Boerse", (l0 && l0.state === "OPEN") ? s2.polling === true : s2.polling === false, "state " + (l0 && l0.state) + ", polling " + s2.polling);

/* Aktienseite: Standard 1T */
const sym = await d.evaluate(() => { const e = window.VUDiscover.LiveHub.index().entries; return Object.keys(e)[0]; });
await d.goto(BASE + "/discover/#/s/US_REAL/" + sym, { waitUntil: "networkidle" }); await warten(d, 1500);
ok("Aktienseite: 1T ist Standard", (await d.locator('.dx-tf button[aria-pressed="true"]').first().textContent()) === "1T");
ok("Aktienseite: Intraday-Chart mit Zeitachse", (await d.locator(".dx-intraday-chart .dx-micro-axis").count()) >= 3);
ok("Aktienseite: Beschriftung mit Stand und Quelle", /Stand|Schluss|Letzter Handelstag/.test(await d.locator(".dx-intraday-note").textContent()));
ok("Aktienseite: 5T entfaellt (eine Sitzung je Titel)", (await d.locator('.dx-tf button', { hasText: /^(1W|5T)$/ }).count()) === 0);
const s3 = await stats(d);
ok("Aktienseite: wenige Abonnenten (Chart, Kopf, sichtbare Nachbarkarten; <= 6)", s3.subscribers <= 6, "subscribers " + s3.subscribers);
if (SHOTS) await d.screenshot({ path: SHOTS + "/live-03-detail-desktop.png" });
/* Zeitraumwechsel auf 1J, wenn verfuegbar */
const j = d.locator('.dx-tf button', { hasText: /^1J$/ });
if (await j.count()) { const disabled = await j.first().isDisabled(); if (!disabled) { await j.first().click(); await warten(d, 400); ok("Aktienseite: 1J zeichnet den Jahreschart", (await d.locator(".q-tchart").count()) === 1); } else ok("Aktienseite: 1J gesperrt mit Begruendung", !!(await j.first().getAttribute("title"))); }
ok("Desktop: keine Konsolenfehler", d.__m.length === 0, d.__m.slice(0, 3).join(" | "));
ok("Desktop: keine 4xx/5xx auf eigene Pfade", d.__bad.length === 0, d.__bad.slice(0, 3).join(" | "));
ok("Desktop: kein horizontaler Ueberlauf", await d.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

/* ---------------------------------------------------------- iPhone */
const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
const m = await seite(mob);
await m.goto(BASE + "/discover/", { waitUntil: "networkidle" }); await warten(m, 1500);
await m.mouse.wheel(0, 600); await warten(m, 900);
const mi = await m.evaluate(() => document.querySelectorAll('[data-art="intraday"]').length);
ok("Mobil: Tagesverlauf auf Karten", mi >= 2, "intraday svgs: " + mi);
const sm = await stats(m);
ok("Mobil: Abonnenten begrenzt (<= 14 im ersten Bild)", sm.subscribers <= 14, JSON.stringify(sm));
ok("Mobil: kein horizontaler Ueberlauf", await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
/* Kein Layout-Sprung: Hoehe des Kartenbilds vor/nach Live */
const hoehen = await m.evaluate(() => [...document.querySelectorAll(".dx-poster-media")].slice(0, 6).map((n) => Math.round(n.getBoundingClientRect().height)));
ok("Mobil: Kartenbilder gleich hoch (kein Sprung durch Live)", new Set(hoehen).size <= 2, hoehen.join(","));
if (SHOTS) await m.screenshot({ path: SHOTS + "/live-04-home-mobile.png" });
await m.goto(BASE + "/discover/#/s/US_REAL/" + sym, { waitUntil: "networkidle" }); await warten(m, 1500);
ok("Mobil: Aktienseite 1T mit Chart", (await m.locator(".dx-intraday-chart").count()) === 1);
if (SHOTS) await m.screenshot({ path: SHOTS + "/live-05-detail-mobile.png" });
ok("Mobil: keine Konsolenfehler", m.__m.length === 0, m.__m.slice(0, 3).join(" | "));

/* Sichtbarkeit: verstecktes Fenster haelt das Polling an */
await d.goto(BASE + "/discover/", { waitUntil: "networkidle" }); await warten(d, 800);
await d.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
const sh = await stats(d);
ok("Verstecktes Fenster: kein Polling", sh.polling === false, "polling " + sh.polling);
await d.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });

await browser.close();
console.log("\nDiscover Live-QA" + (CLOCK ? " (Uhr: " + CLOCK + ")" : "") + " — " + punkte.length + " Pruefpunkte, " + fehler + " Fehler\n");
for (const [s, n, dd] of punkte) console.log(`  ${s} ${n}${dd ? "  — " + dd : ""}`);
process.exit(fehler ? 1 : 0);
