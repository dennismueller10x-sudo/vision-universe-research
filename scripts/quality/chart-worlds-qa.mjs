#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE - scripts/quality/chart-worlds-qa.mjs

   DERSELBE CHART IN JEDER WELT (Owner-Befund AFG 13.11.2026: drei Welten, drei Ergebnisse).

   Dieselbe Aktie in Quant, Technical und (mit --worlds) Discover, mobil und Desktop:
     - der gemeinsame Chart ist da (assets/vu-chart.js: .vu-chart-line),
     - die Leiste ist 1T 1W 1M 1J 5J Max und "Mehr", läuft nicht über den Rand,
     - 1T ist bedienbar, wenn die Aktie einen Tagesverlauf hat,
     - die Zeitmarken der x-Achse liegen nicht übereinander,
     - der Kopfkurs ist in allen Welten derselbe Wert,
     - kein horizontales Scrollen, keine Seitenfehler.
   Prüft gegen das Repository (statischer Server, keine Auslieferung).

   Aufruf: NODE_PATH=<playwright> node scripts/quality/chart-worlds-qa.mjs [--worlds quant,technical,discover]
           [--tickers AFG,NVDA] [--widths 390,1440] [--out DIR]
   Exit 1 bei einem Befund; Bericht als JSON auf stdout und in --out.
   ========================================================================= */
import { createServer } from "node:http";
import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, normalize, extname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const WORLDS = arg("worlds", "quant,technical").split(",");
const TICKERS = arg("tickers", "AFG,NVDA").split(",");
const WIDTHS = arg("widths", "390,1440").split(",").map(Number);
const out = arg("out", null);

/* Je Welt: Adresse der Aktienseite und wo der Chart hängt. */
const ROUTE = {
  quant: (t) => "/quant/#/aktie/" + t,
  technical: (t) => "/technical/#/chart/" + t,
  discover: (t) => "/discover/#/s/US_REAL/" + t
};
export const LEISTE = ["1T", "1W", "1M", "1J", "5J", "Max", "Mehr"];
const RELEASE_ONLY = [/\/quant\/data\/product\/technical-signals-v1\/by-ticker\//, /\/core\/data\/stock-availability\//, /\/discover\/logos\/files\//];

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
  const server = await serve(root), origin = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const results = [], heads = {};
  /* Hat die Aktie einen Tagesverlauf im Repository? Nur dann muss 1T bedienbar sein. */
  const idx = await fetch(origin + "/quant/data/market/intraday/index.json").then((r) => r.ok ? r.json() : null).catch(() => null);
  const hasIntraday = (t) => !!(idx && ((idx.entries && idx.entries[t]) || Object.values(idx.available || {}).some((l) => Array.isArray(l) && l.includes(t))));

  for (const width of WIDTHS) for (const t of TICKERS) for (const world of WORLDS) {
    const name = `${world} ${t} ${width}px`, t0 = Date.now();
    const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
    const page = await ctx.newPage(), errors = [];
    page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("CONSOLE " + m.text()); });
    page.on("response", (r) => { if (r.status() >= 400 && !RELEASE_ONLY.some((re) => re.test(r.url()))) errors.push("HTTP " + r.status() + " " + new URL(r.url()).pathname); });
    try {
      await page.goto(origin + ROUTE[world](t), { waitUntil: "load" });
      await page.waitForSelector(".qc-chart svg .vu-chart-line", { timeout: 60000 });
      await page.waitForTimeout(2500); /* Tagesverlauf (Hub) kommt nach dem ersten Bild */
      const m = await page.evaluate(() => {
        const bar = document.querySelector(".qc-chart .qc-ranges");
        const visible = bar ? [...bar.querySelectorAll("button")].filter((b) => !b.hidden) : [];
        const day = bar && [...bar.querySelectorAll("button")].find((b) => b.dataset.range === "1D");
        const ticks = [...document.querySelectorAll(".qc-chart svg text.vu-chart-axis")].map((e) => e.getBBox()).filter((b) => b.y > 100);
        const bottom = ticks.filter((b) => b.y === Math.max(...ticks.map((x) => x.y)));
        const head = document.querySelector(".vu-shead-value");
        return {
          leiste: visible.map((b) => b.textContent.trim()), day: day ? !day.disabled : null,
          barOverflow: bar ? bar.scrollWidth - bar.clientWidth : 0, pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          xTicks: bottom.map((b) => ({ x: b.x, w: b.width })), head: head ? head.textContent.trim() : null
        };
      });
      const fails = [];
      if (m.leiste.join(",") !== LEISTE.join(",")) fails.push("Leiste " + m.leiste.join(","));
      if (hasIntraday(t) && m.day !== true) fails.push("1T nicht bedienbar, obwohl ein Tagesverlauf vorliegt");
      if (m.barOverflow > 1) fails.push("Leiste läuft über den Rand (" + m.barOverflow + " px)");
      if (m.pageOverflow > 1) fails.push("horizontales Scrollen (" + m.pageOverflow + " px)");
      const xs = m.xTicks.sort((a, b) => a.x - b.x);
      for (let i = 1; i < xs.length; i++) if (xs[i].x < xs[i - 1].x + xs[i - 1].w + 4) fails.push("x-Marken überlappen");
      if (errors.length) fails.push(errors.slice(0, 3).join(" | "));
      (heads[t + "@" + width] = heads[t + "@" + width] || {})[world] = m.head;
      results.push({ name, pass: !fails.length, ms: Date.now() - t0, ...(fails.length ? { error: fails.join("; ") } : {}), head: m.head });
    } catch (e) {
      results.push({ name, pass: false, ms: Date.now() - t0, error: String(e && e.message || e).slice(0, 300) });
    }
    await ctx.close();
  }
  /* Derselbe Kopfkurs in allen Welten. */
  for (const [key, per] of Object.entries(heads)) {
    const vals = Object.entries(per).filter(([, v]) => v);
    const same = new Set(vals.map(([, v]) => v)).size <= 1;
    results.push({ name: "Kopfkurs gleich " + key, pass: same, ms: 0, ...(same ? {} : { error: vals.map(([w, v]) => w + "=" + v).join(" ") }) });
  }
  await browser.close(); server.close();
  const report = { worlds: WORLDS, tickers: TICKERS, widths: WIDTHS, results, failed: results.filter((r) => !r.pass).length };
  if (out) { await mkdir(out, { recursive: true }); await writeFile(join(out, "chart-worlds-qa.json"), JSON.stringify(report, null, 2)); }
  console.log(JSON.stringify(report, null, 1));
  process.exit(report.failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
