/* =========================================================================
   VISION UNIVERSE DISCOVER — browser-qa-stream-verlauf.mjs

   Aktienseite zur Boersenoeffnung: noch kein Snapshot der laufenden Sitzung,
   der Strom liefert Ticks. Erwartet: der 1T-Chart zeigt den Verlauf aus dem
   Strom (nicht den Vortag mit "heutige Kurse fehlen"), die Fussnote nennt
   ihn ehrlich, kein horizontaler Ueberlauf, keine Konsolenfehler.
   Gefaelschter WebSocket und gestellte Uhr (Freitag 14:40 UTC = 09:40 New York).

   Ausfuehren:
     node scripts/discover/browser-qa-stream-verlauf.mjs http://127.0.0.1:8121 [NVDA]
   ========================================================================= */
import { createRequire } from "node:module";
/* require statt import: das CI-Verzeichnis der Browser-Abhaengigkeiten kommt ueber NODE_PATH (nur CommonJS liest es). */
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.argv[2] || "http://127.0.0.1:8121";
const TICKER = process.argv[3] || "NVDA";
/* Die Messung liegt auf dem naechsten Handelstag NACH dem neuesten Datenstand des Repositories (14:40 UTC = 09:40 New York):
   ein Kurs aus dem Strom darf nie aelter sein als die Daten, die die Seite schon hat (sonst gewinnen die Daten, wie am 13.11. nach Handelsschluss). */
const FEIERTAGE = new Set(["2026-11-26", "2026-12-25", "2027-01-01"]);
const dataSession = (await (await fetch(BASE + "/quant/data/market/intraday/index.json")).json()).dataSession?.sessionDate || "2026-11-13";
const tag = new Date(Date.parse(dataSession + "T12:00:00Z"));
do { tag.setUTCDate(tag.getUTCDate() + 1); } while ([0, 6].includes(tag.getUTCDay()) || FEIERTAGE.has(tag.toISOString().slice(0, 10)));
const TAG = tag.toISOString().slice(0, 10);
const JETZT = Date.parse(TAG + "T14:40:00Z");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let fehler = 0;
const ok = (n, c, d) => { console.log((c ? "ok   " : "FAIL ") + n + (d ? "  " + d : "")); if (!c) fehler++; };
for (const breite of [390, 1440]) {
  const ctx = await browser.newContext({ viewport: { width: breite, height: 900 } });
  const p = await ctx.newPage();
  const konsole = [];
  /* Der fehlende Snapshot der laufenden Sitzung ist genau die Lage, die hier geprueft wird: sein 404 ist erwartet. */
  p.on("console", (m) => { if (m.type() === "error" && !/WebSocket|favicon|ERR_|status of 404/i.test(m.text())) konsole.push(m.text()); });
  p.on("pageerror", (e) => konsole.push("pageerror: " + e.message));
  await p.addInitScript(() => {
    window.__ws = null;
    window.WebSocket = function (url) {
      this.url = url; this.sent = []; window.__ws = this;
      setTimeout(() => this.onopen && this.onopen({}), 20);
    };
    window.WebSocket.prototype.send = function (d) { this.sent.push(d); };
    window.WebSocket.prototype.close = function () { if (this.onclose) this.onclose({ code: 1000 }); };
    window.WebSocket.OPEN = 1;
  });
  /* Der Snapshot der laufenden Sitzung gibt es noch nicht - unabhaengig davon, was das Repository inzwischen enthaelt. */
  await p.route(new RegExp("/quant/data/market/intraday/" + TAG + "/"), (r) => r.fulfill({ status: 404, body: "" }));
  await p.clock.install({ time: new Date(JETZT) });
  await p.goto(BASE + "/discover/#/s/US_REAL/" + TICKER, { waitUntil: "networkidle" });
  await p.clock.runFor(1500);
  const verbunden = await p.evaluate(() => !!window.__ws);
  ok(breite + "px Strom verbindet", verbunden);
  /* 14:36 bis 14:40 UTC: Ticks in zwei 5-Minuten-Faechern (10:35 und 10:40 waere falsch - 09:35 und 09:40 New York) */
  const senden = (ticks) => p.evaluate(({ t, ticks }) => {
    const ws = window.__ws;
    ticks.forEach(([at, preis]) => ws.onmessage({ data: JSON.stringify({ op: "u", v: [[t, preis, at, preis, preis, preis, preis, at - 50]] }) }));
  }, { t: TICKER, ticks });
  /* Die Ticks liegen nahe am letzten Tagesschluss vor heute (aus dem Repository): ein Preis weit daneben gilt als unplausibel und wird nicht angezeigt. */
  const basis = await p.evaluate(async ([t, TAG]) => {
    const j = await (await fetch("/quant/data/market/discover-series/ref_" + t + ".json")).json();
    const v = j.points.filter((x) => x[0] < TAG).pop();
    return v ? v[1] : 100;
  }, [TICKER, TAG]);
  const P1 = Math.round(basis * 1.01 * 100) / 100, P2 = Math.round(basis * 1.012 * 100) / 100, P3 = Math.round(basis * 1.0125 * 100) / 100;
  const de = (x) => x.toFixed(2).replace(".", ",");
  await p.evaluate(() => window.__ws.onmessage({ data: JSON.stringify({ op: "hello", priceType: "REALTIME_REFERENCE", source: "TIINGO_IEX_LEVEL6" }) }));
  /* ERSTER Tick: Kopf, Kurs und Tagesveraenderung sofort live (Steuerung 13.11.); nur die Linie darf auf den zweiten Punkt warten. */
  await senden([[JETZT - 4 * 60000, P1]]);
  await p.clock.runFor(1500);
  await p.locator(".dx-tf button", { hasText: /^1T$/ }).first().click();
  await p.clock.runFor(1500);
  const erster = await p.evaluate(() => {
    const kopf = document.querySelector(".dx-chart-hero");
    const pille = kopf && kopf.querySelector(".dx-chart-hero-preis > span.num");
    return { kopf: kopf ? kopf.textContent : "", pille: pille ? pille.textContent : "", leer: [...document.querySelectorAll(".dx-empty")].some((e) => /Der Verlauf beginnt gleich/.test(e.textContent)) };
  });
  ok(breite + "px erster Tick: Kopfkurs ist der Live-Kurs", erster.kopf.includes(de(P1)), erster.kopf.slice(0, 80));
  ok(breite + "px erster Tick: Tagesveraenderung gegen den Vortagesschluss, Live-Etikett", /Live/.test(erster.kopf) && /%/.test(erster.pille) && !/heutige Kurse fehlen/.test(erster.kopf), erster.pille);
  ok(breite + "px erster Tick: Linie folgt, ehrlicher Hinweis", erster.leer);
  await senden([[JETZT - 3 * 60000, P2], [JETZT - 1000, P3]]);
  await p.clock.runFor(1500);
  const befund = await p.evaluate(() => {
    const note = document.querySelector(".dx-intraday-note");
    const kopf = document.querySelector(".dx-chart-hero");
    const label = document.querySelector(".dx-chart-hero-meta");
    return {
      note: note ? note.textContent : null,
      kopf: kopf ? kopf.textContent : null,
      label: label ? label.textContent : null,
      stale: !!document.querySelector(".dx-live-label--stale"),
      ueberlauf: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
  ok(breite + "px Fussnote nennt den Verlauf aus dem Strom", !!befund.note && /Verlauf ab 09:3\d aus dem Live-Strom/.test(befund.note), String(befund.note).slice(0, 220));
  ok(breite + "px nicht als alter Stand beschriftet", !befund.stale && !/nicht aktuell|heutige Kurse fehlen/.test(befund.label || ""), befund.label);
  ok(breite + "px letzter Kurs ist der Strom-Kurs", (befund.kopf || "").includes(de(P3)), (befund.kopf || "").slice(0, 80));
  ok(breite + "px kein horizontaler Ueberlauf", befund.ueberlauf <= 1, String(befund.ueberlauf));
  ok(breite + "px keine Konsolenfehler", konsole.length === 0, konsole.join(" | ").slice(0, 200));
  await ctx.close();
}
await browser.close();
process.exit(fehler ? 1 : 0);
