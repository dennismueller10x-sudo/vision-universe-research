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
                  RSI-Schicht legt den Indikatorbereich an, Befundkarten,
                  Aroon-Unterfenster, Ichimoku-Linien
     Suche        Suche in Worten: Vorschau (erkannt/nicht erkannt), Ausfuehren,
                  "Erkannt als" und Treffer
     Fokus        Befundkarte -> Chart nur mit dieser Formation
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
      await clean("Formationsfokus");
    });

    await check(key + " Signale", async () => {
      await page.goto(base + "#/chart/AAPL/signale");
      await page.waitForSelector(".tc-history", { timeout: 45000 });
      assert(await page.locator(".tc-signal").count() >= 1, "keine Befunde");
      await clean("Signale");
    });

    await check(key + " Menue", async () => {
      await page.goto(base + "#/chart/NVDA");
      await page.waitForFunction(() => !!document.getElementById("vu-dock"), null, { timeout: 10000 });
      await page.locator("#vu-dock button.menu").click();
      await page.waitForFunction(() => { const p = document.querySelector("vu-navigation").shadowRoot.querySelector(".panel"); return getComputedStyle(p).visibility === "visible"; }, null, { timeout: 3000 });
      const m = await page.evaluate(() => {
        const root = document.querySelector("vu-navigation").shadowRoot, g = root.querySelector(".group[data-group=technical]");
        return { heads: [...root.querySelectorAll(".group h2")].map((h) => h.textContent),
          links: g ? [...g.querySelectorAll(".links a")].map((a) => a.getAttribute("href")) : [],
          open: g ? g.querySelector(".disclosure").getAttribute("aria-expanded") : null,
          current: g ? (g.querySelector(".links a[aria-current=page]") || {}).textContent : null };
      });
      const i = m.heads.indexOf("Technical");
      assert(i > 0 && m.heads[i - 1] === "Fundamental", "Technical-Gruppe nicht nach Fundamental: " + m.heads.join("|"));
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
