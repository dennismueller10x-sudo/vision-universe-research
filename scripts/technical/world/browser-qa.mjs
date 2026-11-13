#!/usr/bin/env node
import {navigate} from '../../quality/browser-navigation.mjs';
/* =========================================================================
   VISION UNIVERSE TECHNICAL — browser-qa.mjs
   BROWSER-PRUEFUNG DER PRODUKTWELT /technical/ (Chromium, 360, 390 und 1280 px,
   Hell und Dunkel)

   Prueft gegen das Repository (statischer Server, keine Auslieferung).
   Struktur nach dem Redesign 2027 (Folien T01–T06); Absicht der Checks unveraendert:
     Start        Frage, drei Kacheln mit Zahlen, Markt heute mit Urteil, fertige Suchen,
                  vier Bestenlisten, Dock vorhanden
     Screener     Schnellsuche liefert Treffer mit Befund-Pille, Filter-Sheet: ein Chip
                  aendert Trefferzahl und Adresse, Trichter vorhanden; Profi-Tabelle
     Chart        Einsteiger: Urteil, Linie (keine Kerzen), drei Saetze, Preise, Signal-Sheet
     Chart Studio (PRO, #/chart/<T>/studio) Kerzen gezeichnet, Zeitraum 3M zeichnet weniger Kerzen,
                  Abschnitt "Diese Aktie in Quant und Supertrader" (Stufen ohne
                  Zahl, Links, Research-Status),
                  RSI-Schicht legt den Indikatorbereich an, Befundkarten,
                  Aroon-Unterfenster, Ichimoku-Linien
     Assistent    Ziel waehlen, Zweck, Kriterium an/aus aendert Adresse und Treffer,
                  Begriffe, Abfrage -> Screener mit gleicher Trefferzahl, Treffer ->
                  Chart Studio mit Pruefleiste, vier Ebenen (Vorteil "nicht nachgewiesen")
     Suche        Suche in Worten: Vorschau (erkannt/nicht erkannt), Ausfuehren,
                  "Erkannt als" und Treffer
     Fokus        Befundkarte -> Chart nur mit dieser Formation
     Baukasten    Bedingung hinzufuegen, RSI waehlen, anwenden, speichern;
                  Gespeichert zeigt Beschreibung und heutige Trefferzahl
     Signale      Befunde und Erkennungshistorie
     Menue        eigene Gruppe nach Fundamental, Chart Studio aktiv
     Muster       Heute im Markt (9 Muster), Beleg-Karte; Regeln: Indikatorkatalog,
                  Evidenztabelle der Formationen (#/methodik zeigt dieselbe Seite)
   Kein Rot und kein Gruen: Kerzen, Pillen und Zonen nur in Schwarz, Weiss, Neongruen, Grau.
   Je Ansicht: keine Seitenfehler, keine Konsolenfehler (ausser den zwei
   Pfaden, die nur der Release-Bau schreibt), kein horizontales Scrollen.

   Aufruf: NODE_PATH=<playwright> node scripts/technical/world/browser-qa.mjs [--out DIR]
   Exit 1 bei einem Befund; Bericht als JSON auf stdout und in --out.
   ========================================================================= */
import { createServer } from "node:http";
import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, normalize, extname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outArg = process.argv.indexOf("--out");
const out = outArg > 0 ? process.argv[outArg + 1] : null;

/* Nur der Release-Bau schreibt diese Ausschnitte; lokal greift der Rueckfall (Scherbe bzw. neutraler Navigator). */
export const RELEASE_ONLY = [/\/quant\/data\/product\/technical-signals-v1\/by-ticker\//, /\/core\/data\/stock-availability\//];
/* Aktienkopf (assets/stock-navigator.js#head): fehlt ein Logo, faellt der Kopf auf das Monogramm zurueck (gewollt, kein Fehler). */
export const OPTIONAL = [/\/discover\/logos\/files\/[^/]+\.png$/];

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json",
  ".svg": "image/svg+xml", ".gz": "application/gzip", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2" };

function serve(dir) {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      const file = normalize(join(dir, p));
      if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
      const s = await stat(file);
      if (!s.isFile()) throw new Error("not a file");
      res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
      res.end(await readFile(file));
    } catch { res.writeHead(404).end("not found"); }
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

async function main() {
  const { chromium } = require("playwright");
  const server = await serve(root), base = "http://127.0.0.1:" + server.address().port + "/technical/";
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined});
  const results = [];
  async function check(name, fn) {
    const t0 = Date.now();
    try { await fn(); results.push({ name, pass: true, ms: Date.now() - t0 }); }
    catch (e) { results.push({ name, pass: false, ms: Date.now() - t0, error: String(e && e.message || e).slice(0, 400) }); }
  }
  function assert(ok, msg) { if (!ok) throw new Error(msg); }

  for (const theme of ["light", "dark"]) for (const width of [360, 390, 1280]) {
    const key = width + "-" + theme;
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    await ctx.addInitScript((t) => { try { localStorage.setItem("vu-discover-theme-v1", t); } catch (e) { /* privat */ } }, theme);
    const page = await ctx.newPage(), errors = [];
    page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
    page.on("response", (r) => { if (r.status() >= 400 && !RELEASE_ONLY.concat(OPTIONAL).some((re) => re.test(r.url()))) errors.push("HTTP " + r.status() + " " + new URL(r.url()).pathname); });
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("CONSOLE " + m.text()); });
    async function clean(view) {
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      assert(sw <= width + 1, view + ": horizontales Scrollen (" + sw + " > " + width + ")");
      assert(await page.evaluate((t) => document.documentElement.getAttribute("data-theme") === t, theme), view + ": Farbschema nicht gesetzt");
      const errs = errors.splice(0);
      assert(!errs.length, view + ": " + errs.join(" | "));
    }

    await check(key + " Start", async () => {
      /* Konzept „Der Chart in drei Sätzen“ TX01: Markt als Zeile, Heute neu als Karten, fertige Suchen als Schiene, Muster als Raster. */
      await navigate(page,base + "#/");
      await page.waitForSelector(".tc-idc", { timeout: 30000 });
      assert(/Was zeigt\s*der Chart/.test(await page.locator("h1").innerText()), "Titel als Frage fehlt");
      assert(await page.locator(".tc-idc").count() === 5, "fünf fertige Suchen fehlen");
      assert(/über der 200-Tage-Linie/.test(await page.locator(".tc-ms").innerText()), "Markt heute als Zeile fehlt");
      await page.waitForSelector(".tc-mgrid .tc-mg", { timeout: 30000 });
      assert(await page.locator(".tc-mgrid .tc-mg").count() === 4, "Muster-Raster fehlt");
      assert(await page.locator(".tc-tiles3, .tc-ranks, .tc-tcard").count() === 0, "alte Zahlen- oder Bestenlisten-Kacheln");
      await page.waitForSelector(".tc-rail .tc-nc, .tc-rail .tc-note", { timeout: 30000 });
      await page.waitForFunction(() => !!document.getElementById("vu-dock"), null, { timeout: 10000 });
      await clean("Start");
    });

    await check(key + " Screener", async () => {
      await navigate(page,base + "#/screener?preset=breakout");
      await page.waitForSelector(".tc-hit .tc-befund", { timeout: 30000 });
      await navigate(page,base + "#/screener?trend=sma200");
      await page.waitForSelector(".tc-countcard");
      const before = await page.locator(".tc-countcard b").innerText();
      await page.locator(".tc-filter-btn").click();
      await page.waitForSelector("#tc-filter-sheet:not([hidden])");
      const cta0 = await page.locator(".tc-sheet-cta").innerText();
      await page.getByRole("button", { name: "Dreiecksformation", exact: true }).click();
      await page.waitForFunction((b) => document.querySelector(".tc-sheet-cta").innerText !== b, cta0);
      await page.locator(".tc-sheet-cta").click();
      await page.waitForFunction(() => /muster=dreieck/.test(location.hash));
      await page.waitForFunction((b) => document.querySelector(".tc-countcard b") && document.querySelector(".tc-countcard b").innerText !== b, before);
      assert(await page.locator(".tc-funnel li").count() >= 2, "Trichter ohne Filterschritt");
      await navigate(page,base + "#/screener?trend=sma200&muster=dreieck&ansicht=tabelle");
      await page.waitForSelector(".tc-ptable tbody tr", { timeout: 30000 });
      await clean("Screener");
    });

    await check(key + " Vorlagen", async () => {
      await navigate(page,base + "#/screener?reiter=vorlagen");
      await page.waitForSelector(".tc-tpl-group .tc-row", { timeout: 30000 });
      assert(await page.locator(".tc-tpl-group .tc-row").count() >= 12, "Vorlagen fehlen");
      const counts = await page.locator(".tc-tpl-group .tc-row-count").allTextContents();
      assert(counts.every((t) => /\d/.test(t)), "Vorlage ohne Trefferzahl: " + counts.join(","));
      await clean("Vorlagen-Auswahl");
      await navigate(page,base + "#/vorlagen/uptrendBasic");
      await page.waitForSelector(".tc-hit .tc-ticks", { timeout: 30000 });
      assert(await page.locator(".tc-hit").first().locator(".tc-ticks li").count() === 5, "Checkliste ohne 5 Kriterien");
      assert(await page.locator(".tc-tpl-seg a", { hasText: "Fast erfüllt" }).count() === 1, "Fast erfüllt fehlt");
      assert(await page.locator(".tc-tpl-crit .tc-crit").count() === 5, "Regelliste unvollstaendig");
      await page.locator("summary", { hasText: "Trendfilter dazunehmen" }).click();
      await page.getByRole("button", { name: "Langfristiger Trend (Woche)", exact: true }).click();
      await page.waitForFunction(() => /plus=lang/.test(location.hash));
      await page.waitForFunction(() => document.querySelector(".tc-hit .tc-ticks") && document.querySelectorAll(".tc-hit .tc-ticks")[0].children.length === 6);
      await page.locator(".tc-tpl-seg a", { hasText: "Fast erfüllt" }).click();
      await page.waitForSelector(".tc-hit .tc-miss");
      await page.locator(".tc-hit").first().click();
      await page.waitForFunction(() => /[?&]v=uptrendBasic/.test(location.hash));
      await page.waitForSelector(".tc-tpl-panel .tc-crit-why", { timeout: 30000 });
      assert(/fast erfüllt/.test(await page.locator(".tc-tpl-panel summary").innerText()), "Pruefleiste nennt den Status nicht");
      await page.waitForSelector(".tc-chart svg", { timeout: 45000 });
      await clean("Vorlage und Chart");
    });

    await check(key + " Assistent", async () => {
      /* Entscheidung 8: #/assistent leitet auf „Lernen“; dort stehen die Ziele als Fragen, die den Screener öffnen. */
      await navigate(page,base + "#/assistent");
      await page.waitForFunction(() => /#\/lernen$/.test(location.hash), null, { timeout: 15000 });
      await page.waitForSelector(".tc-asks .vu-chip", { timeout: 30000 });
      assert(await page.locator(".tc-asks .vu-chip").count() === 7, "Fragen an den Chart fehlen");
      assert(/screener\?z=trendfolge/.test(await page.locator(".tc-asks .vu-chip").first().getAttribute("href")), "Frage öffnet nicht den Screener");
      await clean("Lernen-Fragen");
      await navigate(page,base + "#/assistent/trendfolge");
      await page.waitForSelector(".tc-hit .tc-ticks", { timeout: 30000 });
      assert(await page.locator(".tc-hit").first().locator(".tc-ticks li").count() === 4, "Checkliste ohne 4 Kriterien");
      assert((await page.locator(".tc-step-n").allTextContents()).join(",") === "1,2,3,4,5,6", "Schritte 1–6 nicht vollstaendig");
      await page.locator(".tc-goal-jumps a", { hasText: "Treffer" }).click();
      await page.waitForFunction(() => document.getElementById("tc-treffer").getBoundingClientRect().top < 200, null, { timeout: 5000 });
      assert(await page.locator(".tc-level").count() === 4, "vier Ebenen fehlen");
      assert(/Nicht nachgewiesen/.test(await page.locator(".tc-level.is-fail").innerText()), "Vorteil nicht als nicht nachgewiesen ausgewiesen");
      const full = await page.locator(".tc-tpl-seg a", { hasText: "Erfüllt" }).first().innerText();
      await page.locator(".tc-term summary", { hasText: "Begriff: ADX" }).click();
      assert(/Trend/.test(await page.locator(".tc-term[open] p").first().innerText()), "Begriff nicht erklaert");
      await page.locator(".tc-opt", { hasText: "RS-Rang mindestens 70" }).locator("input").check();
      await page.waitForFunction(() => /k=.*rsRank70/.test(location.hash));
      await page.waitForFunction(() => document.querySelector(".tc-hit .tc-ticks") && document.querySelector(".tc-hit .tc-ticks").children.length === 5, null, { timeout: 30000 });
      const full2 = await page.locator(".tc-tpl-seg a", { hasText: "Erfüllt" }).first().innerText();
      assert(full2 !== full, "Treffer aendern sich nicht mit dem Kriterium");
      const n = Number(full2.replace(/\D/g, ""));
      // Datenqualitaet: Hinweis nennt genau die gekennzeichneten Treffer der Liste (Datensatz-abhaengig, daher nur Konsistenz)
      const dq = await page.evaluate(() => { const nt = document.querySelector(".tc-dq-note"); return { note: nt ? Number(nt.textContent.replace(/\D.*$/, "")) : 0 }; });
      assert(dq.note <= n, "Datenqualitaets-Hinweis zaehlt mehr Treffer (" + dq.note + ") als die Liste hat (" + n + ")");
      await clean("Analyseziel");
      await page.locator("a", { hasText: "Im Screener bearbeiten" }).click();
      await page.waitForFunction(() => /#\/screener\?z=trendfolge/.test(location.hash));
      await page.waitForSelector(".tc-countcard", { timeout: 30000 });
      assert(/Analyse-Assistenten/.test(await page.locator(".tc-preset").first().innerText()), "Herkunft im Screener fehlt");
      const cta = Number((await page.locator(".tc-countcard b").innerText()).replace(/\D/g, ""));
      assert(cta === n, "Screener " + cta + " != Assistent " + n);
      await page.goBack();
      await page.waitForSelector(".tc-hit .tc-ticks", { timeout: 30000 });
      await page.locator(".tc-hit").first().click();
      await page.waitForFunction(() => /[?&]z=trendfolge/.test(location.hash));
      await page.waitForSelector(".tc-tpl-panel .tc-crit-why", { timeout: 30000 });
      assert(/Trendfolge/.test(await page.locator(".tc-tpl-panel summary").innerText()), "Pruefleiste ohne Analyseziel");
      await page.waitForSelector(".tc-chart svg", { timeout: 45000 });
      await clean("Analyseziel und Chart");
      await navigate(page,base + "#/assistent/ausbruch?k=");
      await page.waitForSelector(".tc-state", { timeout: 15000 });
      assert(/Kein Kriterium/.test(await page.locator(".tc-state").innerText()), "leere Auswahl ohne Zustand");
      await navigate(page,base + "#/assistent/gibtsnicht");
      await page.waitForSelector(".tc-title");
      assert(/nicht gefunden/.test(await page.locator(".tc-title").innerText()), "unbekanntes Ziel ohne Zustand");
      await clean("Assistent-Zustaende");
    });

    await check(key + " Suche in Worten", async () => {
      await navigate(page,base + "#/screener");
      await page.waitForSelector("#tc-ts-input", { timeout: 30000 });
      await page.fill("#tc-ts-input", "Dreieck über der SMA 200 mit Mondphase");
      await page.waitForSelector(".tc-ts-preview .tc-mini.is-warn");
      assert(await page.locator(".tc-ts-preview .tc-mini.is-ok").count() === 2, "Vorschau: erkannte Bausteine fehlen");
      await page.fill("#tc-ts-input", "Dreieck über der SMA 200");
      await page.locator(".tc-textsearch button[type=submit]").click();
      await page.waitForFunction(() => /q=Dreieck/.test(location.hash));
      await page.waitForSelector(".tc-preset");
      const txt = await page.locator(".tc-preset p").textContent();
      assert(/Dreieck/.test(txt) && /200-Tage-Linie|SMA 200/.test(txt), "Erkannt als: " + txt);
      assert(await page.locator(".tc-hit").count() >= 1, "keine Treffer fuer Dreieck ueber SMA 200");
      await clean("Suche in Worten");
    });

    await check(key + " Baukasten und Gespeichert", async () => {
      await navigate(page,base + "#/screener");
      await page.waitForSelector(".tc-filter-btn", { timeout: 30000 });
      await page.locator(".tc-filter-btn").click();
      await page.waitForSelector(".tc-builder summary", { timeout: 30000 });
      await page.locator(".tc-builder summary").click();
      await page.locator(".tc-builder .tc-bgroup .tc-btn-ghost").first().click();
      const sel = page.locator(".tc-builder .tc-bgroup .tc-brow").nth(1).locator("select").first();
      await sel.selectOption("rsi14");
      const val = page.locator(".tc-builder .tc-bgroup .tc-brow").nth(1).locator("input.tc-num-in").first();
      await val.fill("45"); await val.dispatchEvent("change");
      await page.locator(".tc-builder").getByRole("button", { name: "Anwenden", exact: true }).click();
      await page.waitForFunction(() => /q=/.test(location.hash) && /rsi14/.test(decodeURIComponent(location.hash)));
      await page.waitForSelector(".tc-preset");
      assert(/RSI 14/.test(await page.locator(".tc-preset p").textContent()), "Baukasten-Abfrage nicht erkannt");
      await page.locator(".tc-save-btn").click();
      await page.fill(".tc-save-form input", "QA Baukasten");
      await page.locator(".tc-save-form button[type=submit]").click();
      await navigate(page,base + "#/screener?reiter=gespeichert");
      await page.waitForSelector(".tc-saved");
      await page.waitForFunction(() => /\d/.test(document.querySelector(".tc-saved .tc-hit-score b").textContent));
      assert(/RSI 14/.test(await page.locator(".tc-saved .tc-row-text span").first().innerText()), "Beschreibung fehlt");
      await clean("Baukasten und Gespeichert");
    });

    await check(key + " Chart einfach", async () => {
      await navigate(page,base + "#/chart/NVDA");
      await page.waitForSelector(".tc-sayrow [data-verdict]", { timeout: 45000 });
      /* Seit 13.11.2026 zeichnet die Einsteigeransicht den gemeinsamen Aktienchart (quant/app/chart.js, assets/vu-chart.js). */
      await page.waitForSelector(".tc-simple-chart .qc-chart svg .vu-chart-line", { timeout: 45000 });
      assert(await page.locator(".tc-chart .tc-up rect, .tc-chart .tc-down rect").count() === 0, "Kerzen in der Einsteigeransicht");
      const leiste = await page.locator(".tc-simple-chart .qc-ranges button:not([hidden])").allInnerTexts();
      assert(leiste.join(",") === "1T,1W,1M,1J,5J,Max,Mehr", "Zeitraumleiste nicht 1T 1W 1M 1J 5J Max: " + leiste.join(","));
      assert(await page.locator(".vu-shead .vu-snav, .vu-shead-nav").count() >= 1, "Aktienkopf mit Perspektiven fehlt");
      assert(await page.locator(".tc-story-r [data-verdict]").count() === 3, "drei Saetze mit Urteil fehlen");
      assert(await page.locator(".tc-zt").count() === 2, "Zonen-Kacheln fehlen");
      assert(await page.locator(".tc-ep").count() === 3, "Kapitel fehlen");
      assert(await page.locator(".tc-worlds").count() === 0, "Quant-/Supertrader-Block (Entscheidung 6)");
      if (await page.locator(".tc-bf").count()) {
        await page.locator(".tc-bf").first().click(); await page.waitForSelector("#tc-signal-sheet:not([hidden])");
        assert(/Erkannt/.test(await page.locator("#tc-signal-sheet").innerText()), "Befund-Sheet ohne Erkannt");
        await page.keyboard.press("Escape");
      }
      /* Kein Rot und kein Gruen auf der Seite (Regel 1): alle sichtbaren Hintergruende und Schriften.
         Einzige Ausnahme: die Tagesveraenderung im gemeinsamen Aktienkopf (Owner 06.11.2026, #1493/#1520, alle Aktien:
         Minus rot, Plus gruen). Sie ist kein Teil von Chart oder Urteil und traegt Pfeil und Vorzeichen, Farbe ist
         nicht das einzige Signal - das prueft dieser Schritt eigens. */
      const pills = await page.evaluate(() => [...document.querySelectorAll("#tc-main .vu-shead .vu-shead-change")]
        .map((e) => ({ dir: (e.closest("[data-direction]") || {}).dataset?.direction || "", text: e.textContent })));
      for (const p of pills) if (p.dir === "up" || p.dir === "down")
        assert((p.dir === "up" ? /\u25b2/ : /\u25bc/).test(p.text) && /\d/.test(p.text), "Tagesveraenderung ohne Pfeil und Zahl: " + p.text);
      const bad = await page.evaluate(() => [...document.querySelectorAll("#tc-main *")].filter((e) => !e.closest(".vu-shead .vu-shead-change")).map((e) => [getComputedStyle(e).color, getComputedStyle(e).backgroundColor, e.getAttribute && e.tagName === "rect" ? getComputedStyle(e).fill : ""]).flat()
        .filter((c) => { const m = /rgba?\((\d+), (\d+), (\d+)/.exec(c || ""); if (!m) return false; const [r, g, b] = m.slice(1).map(Number); return (r > 150 && g < 90 && b < 90) || (g > 120 && r < 110 && b < 110); }).slice(0, 3));
      assert(!bad.length, "Rot oder Gruen: " + bad.join(" "));
      await clean("Chart einfach");
    });

    await check(key + " Chart Studio", async () => {
      await navigate(page,base + "#/chart/NVDA/studio");
      await page.waitForSelector(".tc-chart svg", { timeout: 45000 });
      const candles = () => page.locator(".tc-chart .tc-up rect, .tc-chart .tc-down rect").count();
      const year = await candles();
      assert(year > 200, "Tageschart mit zu wenigen Kerzen: " + year);
      await page.getByRole("radio", { name: "3M", exact: true }).click();
      await page.waitForFunction((n) => document.querySelectorAll(".tc-chart .tc-up rect, .tc-chart .tc-down rect").length < n, year);
      const q = await candles();
      assert(q >= 55 && q <= 70, "3M zeichnet " + q + " Kerzen");
      await page.getByRole("button", { name: "RSI", exact: true }).click();
      await page.waitForSelector(".tc-chart .tc-pane");
      assert(await page.locator(".tc-signals .tc-bf").count() >= 2, "Befunde unter dem Studio fehlen");
      assert(await page.locator(".tc-zt").count() === 2, "Zonen unter dem Studio fehlen");
      await page.getByRole("button", { name: "Aroon", exact: true }).click();
      await page.waitForFunction(() => /Aroon/.test((document.querySelector(".tc-chart .tc-pane-title") || {}).textContent || ""));
      const before = await page.locator(".tc-chart .tc-overlay").count();
      await page.getByRole("button", { name: "Ichimoku", exact: true }).click();
      await page.waitForFunction((n) => document.querySelectorAll(".tc-chart .tc-overlay").length >= n + 3, before);
      /* Kerzenmuster (AP5): Marken erscheinen, hoechstens je Richtung eine Beschriftung, Schicht wieder abschaltbar. */
      const marks = () => page.locator(".tc-chart circle.tc-marker").count();
      const m0 = await marks();
      await page.getByRole("button", { name: "Kerzenmuster", exact: true }).click();
      await page.waitForFunction((n) => document.querySelectorAll(".tc-chart circle.tc-marker").length > n, m0, { timeout: 15000 });
      assert(await page.locator(".tc-legend", { hasText: "Kerzenmuster nach oben" }).count() === 1, "Legende Kerzenmuster fehlt");
      await page.getByRole("button", { name: "Kerzenmuster", exact: true }).click();
      await page.waitForFunction((n) => document.querySelectorAll(".tc-chart circle.tc-marker").length === n, m0);
      /* AP5b: jedes Screener-Indikatorfeld hat eine Darstellung; neue Unterfenster und Schichten zeichnen. */
      for (const [btn, title] of [["Vortex", /Vortex/], ["ROC", /ROC 21/], ["Elder Impulse", /Elder/], ["Connors RSI", /Connors/], ["Ulcer", /Ulcer/]]) {
        await page.getByRole("button", { name: btn, exact: true }).click();
        await page.waitForFunction((src) => new RegExp(src).test((document.querySelector(".tc-chart .tc-pane-title") || {}).textContent || ""), title.source);
      }
      const ov = await page.locator(".tc-chart .tc-overlay").count();
      await page.getByRole("button", { name: "Hull MA 20", exact: true }).click();
      await page.getByRole("button", { name: "Chandelier-Stop", exact: true }).click();
      await page.waitForFunction((n) => document.querySelectorAll(".tc-chart .tc-overlay").length >= n + 2, ov);
      assert(await page.locator(".tc-worlds").count() === 0, "Quant-/Supertrader-Block (Entscheidung 6)");
      await clean("Chart Studio");
    });

    await check(key + " Formationsfokus", async () => {
      await navigate(page,base + "#/chart/AAPL/signale");
      await page.waitForSelector(".tc-history", { timeout: 45000 });
      assert(await page.locator(".tc-detail dt", { hasText: "Historisch" }).count() >= 1, "Evidenzzeile in der Befundkarte fehlt");
      const href = await page.locator(".tc-detail a[href*='/studio?f=']").first().getAttribute("href");
      assert(href, "kein Fokus-Link in den Befundkarten");
      await navigate(page,base + href);
      await page.waitForSelector(".tc-focus b", { timeout: 45000 });
      await page.waitForSelector(".tc-chart svg");
      /* Das Fenster beginnt am ersten Formationspunkt, also liegt der Erkennungstag darin. */
      assert(await page.locator(".tc-chart text.tc-badge-text", { hasText: "Erkannt" }).count() === 1, "Erkennungsmarke im Fokus fehlt");
      const overlap = await page.evaluate(() => {
        const r = [...document.querySelectorAll(".tc-chart rect.tc-badge")].map((e) => e.getBBox());
        return r.some((a, i) => r.some((b, j) => j > i && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height));
      });
      assert(!overlap, "Beschriftungen im Chart ueberdecken sich");
      await clean("Formationsfokus");
    });

    await check(key + " Signale", async () => {
      await navigate(page,base + "#/chart/AAPL/signale");
      await page.waitForSelector(".tc-history", { timeout: 45000 });
      assert(await page.locator(".tc-signal").count() >= 1, "keine Befunde");
      assert(await page.locator(".tc-history .tc-tl-r").count() >= 1, "Verlauf als Zeitleiste fehlt");
      assert(await page.locator(".tc-worlds").count() === 0, "Quant-/Supertrader-Block (Entscheidung 6)");
      await clean("Signale");
    });

    await check(key + " Menue", async () => {
      await navigate(page,base + "#/chart/NVDA");
      await page.waitForFunction(() => !!document.getElementById("vu-dock"), null, { timeout: 10000 });
      await page.locator("#vu-dock button.menu").click();
      await page.waitForFunction(() => { const p = document.querySelector("vu-navigation").shadowRoot.querySelector(".panel"); return getComputedStyle(p).visibility === "visible"; }, null, { timeout: 3000 });
      /* Zwei Menue-Generationen: das Akkordeon (bis 11/2026) und das Raster des Redesigns (Mockup N3: Kacheln,
         darunter "In <Welt>" mit den Unterseiten der aktuellen Welt). Gepruefte Absicht bleibt: Technical ist eine
         eigene Welt, ihre fuenf Unterseiten sind erreichbar, Chart Studio ist auf der Chart-Route markiert. */
      const m = await page.evaluate(() => {
        const root = document.querySelector("vu-navigation").shadowRoot, g = root.querySelector(".group[data-group=technical]");
        if (g) return { kind: "accordion", heads: [...root.querySelectorAll(".group h2")].map((h) => h.textContent),
          links: [...g.querySelectorAll(".links a")].map((a) => a.getAttribute("href")),
          open: g.querySelector(".disclosure").getAttribute("aria-expanded"),
          current: (g.querySelector(".links a[aria-current=page]") || {}).textContent };
        const here = root.querySelector(".here"), tile = root.querySelector(".tile.is-current");
        return { kind: "grid", heads: [...root.querySelectorAll(".tile b")].map((h) => h.textContent), tile: tile && tile.dataset.group,
          links: [...root.querySelectorAll(".here-links a")].map((a) => a.getAttribute("href")),
          open: here && !here.hidden ? "true" : "false",
          current: ((root.querySelector(".here-links a[aria-current=page]") || {}).textContent || "").trim() };
      });
      if (m.kind === "accordion") {
        const i = m.heads.indexOf("Technical");
        assert(i > 0 && m.heads[i - 1] === "Fundamental", "Technical-Gruppe nicht nach Fundamental: " + m.heads.join("|"));
      } else {
        assert(m.heads.includes("Technical") && m.heads.includes("Fundamental") && m.tile === "technical", "Technical-Kachel fehlt oder nicht aktiv: " + JSON.stringify(m));
      }
      assert(m.links.length === 5 && m.links[2] === "/technical/#/chart", "Unterpunkte: " + m.links.join(","));
      assert(m.open === "true" && m.current === "Chart Studio", "Chart Studio nicht aktiv: " + JSON.stringify(m));
      await page.keyboard.press("Escape");
      await clean("Menue");
    });

    await check(key + " Muster", async () => {
      await navigate(page,base + "#/muster");
      await page.waitForSelector(".tc-mgrid .tc-mg", { timeout: 30000 });
      assert(await page.locator(".tc-mgrid .tc-mg").count() === 8, "Heute im Markt: 8 Muster mit Bild erwartet");
      assert(await page.locator(".tc-mgrid .tc-mg svg.tc-shape").count() === 8, "Musterbilder fehlen");
      await page.waitForSelector(".tc-hilft .tc-kvrow [data-verdict]", { timeout: 15000 });
      await clean("Muster");
      await navigate(page,base + "#/methodik?reiter=regeln");
      await page.waitForSelector(".tc-defs dt", { timeout: 30000, state: "attached" });
      assert(await page.locator(".tc-defs dt").count() >= 18, "Indikatorkatalog unvollstaendig");
      await page.waitForSelector(".tc-table tbody tr", { timeout: 15000, state: "attached" });
      assert(await page.locator(".tc-table tbody tr").count() >= 10, "Evidenztabelle unvollstaendig");
      await clean("Muster Regeln");
    });
    await ctx.close();
  }
  await browser.close();
  server.close();
  const report = { checks: results.length, passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass), results };
  if (out) { await mkdir(out, { recursive: true }); await writeFile(join(out, "technical-browser-qa.json"), JSON.stringify(report, null, 1)); }
  console.log(JSON.stringify({ checks: report.checks, passed: report.passed, failed: report.failed }, null, 1));
  if (report.failed.length) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
