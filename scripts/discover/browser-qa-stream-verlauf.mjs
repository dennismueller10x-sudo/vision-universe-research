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
const JETZT = Date.parse("2026-11-13T14:40:00Z");
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
  await p.route(/\/quant\/data\/market\/intraday\/2026-11-13\//, (r) => r.fulfill({ status: 404, body: "" }));
  await p.clock.install({ time: new Date(JETZT) });
  await p.goto(BASE + "/discover/#/s/US_REAL/" + TICKER, { waitUntil: "networkidle" });
  await p.clock.runFor(1500);
  const verbunden = await p.evaluate(() => !!window.__ws);
  ok(breite + "px Strom verbindet", verbunden);
  /* 14:36 bis 14:40 UTC: Ticks in zwei 5-Minuten-Faechern (10:35 und 10:40 waere falsch - 09:35 und 09:40 New York) */
  const ticks = [[JETZT - 4 * 60000, 101.0], [JETZT - 3 * 60000, 101.4], [JETZT - 1000, 102.2]];
  await p.evaluate(({ t, ticks }) => {
    const ws = window.__ws;
    ws.onmessage({ data: JSON.stringify({ op: "hello", priceType: "REALTIME_REFERENCE", source: "TIINGO_IEX_LEVEL6" }) });
    ticks.forEach(([at, preis]) => ws.onmessage({ data: JSON.stringify({ op: "u", v: [[t, preis, at, preis, preis, preis, preis, at - 50]] }) }));
  }, { t: TICKER, ticks });
  await p.clock.runFor(1500);
  await p.locator(".dx-tf button", { hasText: /^1T$/ }).first().click();
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
  ok(breite + "px letzter Kurs ist der Strom-Kurs", /102,2/.test(befund.kopf || ""), (befund.kopf || "").slice(0, 80));
  ok(breite + "px kein horizontaler Ueberlauf", befund.ueberlauf <= 1, String(befund.ueberlauf));
  ok(breite + "px keine Konsolenfehler", konsole.length === 0, konsole.join(" | ").slice(0, 200));
  await ctx.close();
}
await browser.close();
process.exit(fehler ? 1 : 0);
