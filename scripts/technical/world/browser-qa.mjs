#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE TECHNICAL — browser-qa.mjs
   BROWSER-PRUEFUNG DER PRODUKTWELT /technical/ (Chromium, 360, 390 und 1280 px,
   Hell und Dunkel)

   Prueft gegen das Repository (statischer Server, keine Auslieferung):
     Start        Ranglisten und Kennzahlen aus dem Datensatz, Dock vorhanden
     Screener     Vorlage liefert Treffer, ein Filter-Pill aendert Adresse
                  und Trefferzahl, Trichter vorhanden
     Chart Studio Kerzen gezeichnet, Zeitraum 3M zeichnet weniger Kerzen,
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
     Methodik     Indikatorkatalog, Evidenztabelle der Formationen
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
  const browser = await chromium.launch();
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
    page.on("response", (r) => { if (r.status() >= 400 && !RELEASE_ONLY.some((re) => re.test(r.url()))) errors.push("HTTP " + r.status() + " " + new URL(r.url()).pathname); });
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("CONSOLE " + m.text()); });
    async function clean(view) {
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      assert(sw <= width + 1, view + ": horizontales Scrollen (" + sw + " > " + width + ")");
      assert(await page.evaluate((t) => document.documentElement.getAttribute("data-theme") === t, theme), view + ": Farbschema nicht gesetzt");
      const errs = errors.splice(0);
      assert(!errs.length, view + ": " + errs.join(" | "));
    }

    await check(key + " Start", async () => {
      await page.goto(base + "#/");
      await page.waitForSelector(".tc-row", { timeout: 30000 });
      assert(await page.locator(".tc-row").count() >= 7, "Fokus-Setups und Ranglisten fehlen");
      const kpi = await page.locator(".tc-kpis b").allTextContents();
      assert(kpi.length === 3 && kpi.every((t) => /\d/.test(t)), "Kennzahlen ohne Werte: " + kpi.join(","));
      await page.waitForFunction(() => !!document.getElementById("vu-dock"), null, { timeout: 10000 });
      await clean("Start");
    });

    await check(key + " Screener", async () => {
      await page.goto(base + "#/screener?preset=breakout");
      await page.waitForSelector(".tc-hit", { timeout: 30000 });
      await page.goto(base + "#/screener");
      await page.waitForSelector(".tc-cta");
      const before = await page.locator(".tc-cta").innerText();
      await page.getByRole("button", { name: "Dreiecksformation", exact: true }).click();
      await page.waitForFunction(() => /muster=dreieck/.test(location.hash));
      await page.waitForFunction((b) => document.querySelector(".tc-cta") && document.querySelector(".tc-cta").innerText !== b, before);
      assert(await page.locator(".tc-funnel li").count() >= 2, "Trichter ohne Filterschritt");
      await clean("Screener");
    });

    await check(key + " Vorlagen", async () => {
      await page.goto(base + "#/vorlagen");
      await page.waitForSelector(".tc-tpl-group .tc-row", { timeout: 30000 });
      assert(await page.locator(".tc-tpl-group .tc-row").count() >= 12, "Vorlagen fehlen");
      const counts = await page.locator(".tc-tpl-group .tc-row-count").allTextContents();
      assert(counts.every((t) => /\d/.test(t)), "Vorlage ohne Trefferzahl: " + counts.join(","));
      await clean("Vorlagen-Auswahl");
      await page.goto(base + "#/vorlagen/uptrendBasic");
      await page.waitForSelector(".tc-hit .tc-ticks", { timeout: 30000 });
      assert(await page.locator(".tc-hit").first().locator(".tc-ticks li").count() === 5, "Checkliste ohne 5 Kriterien");
      assert(await page.locator(".tc-tpl-seg a", { hasText: "Fast erfüllt" }).count() === 1, "Fast erfüllt fehlt");
      await page.locator(".tc-tpl-crit summary").click();
      assert(await page.locator(".tc-tpl-crit .tc-crit").count() === 5, "Kriterienliste unvollstaendig");
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
      await page.goto(base + "#/assistent");
      await page.waitForSelector(".tc-goal", { timeout: 30000 });
      assert(await page.locator(".tc-goals .tc-goal").count() === 8, "Analyseziele fehlen");
      await clean("Assistent-Auswahl");
      await page.locator(".tc-goals .tc-goal", { hasText: "Trendfolge" }).click();
      await page.waitForFunction(() => /#\/assistent\/trendfolge$/.test(location.hash));
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
      await page.waitForSelector(".tc-cta", { timeout: 30000 });
      assert(/Analyse-Assistenten/.test(await page.locator(".tc-preset").first().innerText()), "Herkunft im Screener fehlt");
      const cta = Number((await page.locator(".tc-cta").innerText()).replace(/\D/g, ""));
      assert(cta === n, "Screener " + cta + " != Assistent " + n);
      await page.goBack();
      await page.waitForSelector(".tc-hit .tc-ticks", { timeout: 30000 });
      await page.locator(".tc-hit").first().click();
      await page.waitForFunction(() => /[?&]z=trendfolge/.test(location.hash));
      await page.waitForSelector(".tc-tpl-panel .tc-crit-why", { timeout: 30000 });
      assert(/Trendfolge/.test(await page.locator(".tc-tpl-panel summary").innerText()), "Pruefleiste ohne Analyseziel");
      await page.waitForSelector(".tc-chart svg", { timeout: 45000 });
      await clean("Analyseziel und Chart");
      await page.goto(base + "#/assistent/ausbruch?k=");
      await page.waitForSelector(".tc-state", { timeout: 15000 });
      assert(/Kein Kriterium/.test(await page.locator(".tc-state").innerText()), "leere Auswahl ohne Zustand");
      await page.goto(base + "#/assistent/gibtsnicht");
      await page.waitForSelector(".tc-title");
      assert(/nicht gefunden/.test(await page.locator(".tc-title").innerText()), "unbekanntes Ziel ohne Zustand");
      await clean("Assistent-Zustaende");
    });

    await check(key + " Suche in Worten", async () => {
      await page.goto(base + "#/screener");
      await page.waitForSelector("#tc-ts-input", { timeout: 30000 });
      await page.fill("#tc-ts-input", "Dreieck über der SMA 200 mit Mondphase");
      await page.waitForSelector(".tc-ts-preview .tc-mini.is-warn");
      assert(await page.locator(".tc-ts-preview .tc-mini.is-ok").count() === 2, "Vorschau: erkannte Bausteine fehlen");
      await page.fill("#tc-ts-input", "Dreieck über der SMA 200");
      await page.locator(".tc-textsearch button[type=submit]").click();
      await page.waitForFunction(() => /q=Dreieck/.test(location.hash));
      await page.waitForSelector(".tc-preset");
      const txt = await page.locator(".tc-preset p").innerText();
      assert(/Dreieck/.test(txt) && /SMA 200/.test(txt), "Erkannt als: " + txt);
      assert(await page.locator(".tc-hit").count() >= 1, "keine Treffer fuer Dreieck ueber SMA 200");
      await clean("Suche in Worten");
    });

    await check(key + " Baukasten und Gespeichert", async () => {
      await page.goto(base + "#/screener");
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
      assert(/RSI 14/.test(await page.locator(".tc-preset p").innerText()), "Baukasten-Abfrage nicht erkannt");
      await page.locator(".tc-save summary").click();
      await page.fill(".tc-save-form input", "QA Baukasten");
      await page.locator(".tc-save-form button[type=submit]").click();
      await page.goto(base + "#/screener/gespeichert");
      await page.waitForSelector(".tc-saved");
      await page.waitForFunction(() => /\d/.test(document.querySelector(".tc-saved .tc-hit-score b").textContent));
      assert(/RSI 14/.test(await page.locator(".tc-saved .tc-row-text span").first().innerText()), "Beschreibung fehlt");
      await clean("Baukasten und Gespeichert");
    });

    await check(key + " Chart Studio", async () => {
      await page.goto(base + "#/chart/NVDA");
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
      assert(await page.locator(".tc-signals .tc-signal").count() >= 2, "Befundkarten fehlen");
      assert(await page.locator(".tc-level-card").count() === 2, "Niveaus fehlen");
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
      assert(await page.locator(".tc-legend", { hasText: "Kerzenmuster bullisch" }).count() === 1, "Legende Kerzenmuster fehlt");
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
      /* Diese Aktie in Quant und Supertrader: bleibt nach jedem Neuzeichnen stehen, Stufen und Links aus den Artefakten. */
      await page.waitForSelector(".tc-worlds .tc-world-card[data-world=supertrader]", { timeout: 30000 });
      const w = await page.evaluate(() => {
        const q = document.querySelector(".tc-world-card[data-world=quant]"), s = document.querySelector(".tc-world-card[data-world=supertrader]");
        return { n: document.querySelectorAll(".tc-worlds").length, chips: q.querySelectorAll(".tc-world-chips li").length, lead: (q.querySelector(".tc-world-lead") || {}).textContent || "",
          qHref: (q.querySelector("a.tc-link") || {}).getAttribute ? q.querySelector("a.tc-link").getAttribute("href") : null,
          sHref: s.querySelector("a.tc-link") ? s.querySelector("a.tc-link").getAttribute("href") : null, sText: s.textContent,
          digits: [...q.querySelectorAll(".tc-world-chips b")].some((b) => /\d/.test(b.textContent)) };
      });
      assert(w.n === 1, "Abschnitt Quant/Supertrader " + w.n + "-mal");
      assert(w.chips >= 1 && w.lead.length > 20 && !w.digits, "Quant-Stufen fehlen oder zeigen Zahlen: " + JSON.stringify(w));
      assert(w.qHref === "/quant/#/aktie/NVDA" && w.sHref === "/supertrader/stock/NVDA/", "Links: " + w.qHref + " " + w.sHref);
      assert(/Modellsignale/.test(w.sText) && /Research, keine Empfehlung/.test(w.sText) && /nicht zertifiziert/.test(w.sText), "Supertrader-Status fehlt: " + w.sText.slice(0, 200));
      await clean("Chart Studio");
    });

    await check(key + " Formationsfokus", async () => {
      await page.goto(base + "#/chart/AAPL");
      await page.waitForSelector(".tc-chart svg", { timeout: 45000 });
      assert(await page.locator(".tc-signals .tc-detail dt", { hasText: "Historisch" }).count() >= 1, "Evidenzzeile in der Befundkarte fehlt");
      const href = await page.locator(".tc-signals a[href*='?f=']").first().getAttribute("href");
      assert(href, "kein Fokus-Link in den Befundkarten");
      await page.goto(base + href);
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
      await page.goto(base + "#/chart/AAPL/signale");
      await page.waitForSelector(".tc-history", { timeout: 45000 });
      assert(await page.locator(".tc-signal").count() >= 1, "keine Befunde");
      await page.waitForSelector(".tc-worlds .tc-world-card[data-world=quant]", { timeout: 30000 });
      assert(await page.locator(".tc-worlds a[href='/quant/#/aktie/AAPL']").count() === 1, "Signale: Link zur Quant-Analyse fehlt");
      await clean("Signale");
    });

    await check(key + " Menue", async () => {
      await page.goto(base + "#/chart/NVDA");
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

    await check(key + " Methodik", async () => {
      await page.goto(base + "#/methodik");
      await page.waitForSelector(".tc-defs dt", { timeout: 30000 });
      assert(await page.locator(".tc-defs dt").count() >= 18, "Indikatorkatalog unvollstaendig");
      await page.waitForSelector(".tc-table tbody tr", { timeout: 15000, state: "attached" });
      assert(await page.locator(".tc-table tbody tr").count() >= 10, "Evidenztabelle unvollstaendig");
      await clean("Methodik");
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
