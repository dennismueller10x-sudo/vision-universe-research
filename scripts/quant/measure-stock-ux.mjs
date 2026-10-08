#!/usr/bin/env node
/* =========================================================================
   AKTIENSEITE: KOGNITIVE LAST, GEMESSEN STATT BEHAUPTET.

   Oeffnet /quant/#/aktie/<T> bei 390 x 844 (alle Aufklapper zu, wie ein
   Nutzer die Seite sieht) und zaehlt:

     firstViewWords      sichtbare Woerter in der ersten Bildschirmhoehe
     wordsToSetup        Woerter von oben bis die Setup-Invalidierung mit
                         Preis zum ersten Mal zu lesen ist
     wordsToEvidence     Woerter bis Signal gegen Markt zum ersten Mal
                         nebeneinander stehen
     setupCoreAt /       Scrolltiefe (px) bis zu diesen Stellen
     evidenceCoreAt
     cards               gleichzeitig gerenderte Karten (Flaeche mit Rahmen
                         oder eigener Fuellung, breiter als 200 px)
     firstViewTargets /  Klickziele (a, button, summary) in der ersten
     targets             Bildschirmhoehe / auf der ganzen Seite
     longSentences       gerenderte Saetze mit mehr als 20 Woertern
     jargon              Fachbegriffe im gerenderten Text
     words, height       gerenderte Woerter gesamt, Seitenhoehe

   Liest nur die ausgelieferten Dateien eines Verzeichnisses (--site, Standard
   Repository-Wurzel) und schreibt NUR nach --out. Kein Produktionsartefakt.

     node scripts/quant/measure-stock-ux.mjs --site . --out /tmp/ux.json NVDA AAPL
   Playwright kommt ueber NODE_PATH (wie scripts/vu2/production-smoke.mjs).
   ========================================================================= */
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, extname, sep, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : d; };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const site = resolve(opt("site", ROOT));
const out = opt("out", null);
const width = Number(opt("width", 390)), height = Number(opt("height", 844));
const tickers = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--")));
if (!tickers.length) tickers.push("NVDA", "AAPL", "JPM", "O", "ACAA");

const JARGON = ["Out-of-Sample", "Walk-Forward", "Survivorship", "Look-Ahead", "Base Rate", "Point-in-Time", "PIT", "Median", "Pp",
  "Invalidation", "Entry Zone", "Higher High", "Strukturtief", "Basisszenario", "Komponente", "Gewicht", "Perzentil", "Stichtag", "Backtest"];

const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2" };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://l").pathname);
    if (p.endsWith("/")) p += "index.html";
    const f = resolve(site, "." + p); if (!f.startsWith(site + sep)) throw Error("x");
    res.setHeader("Content-Type", mime[extname(f)] || "application/octet-stream");
    res.end(await readFile(f));
  } catch { res.statusCode = 404; res.end("404"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"], executablePath: process.env.VU_CHROMIUM || undefined });
const results = [];
for (const t of tickers) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.addInitScript(() => { try { localStorage.setItem("vu-discover-theme-v1", "dark"); } catch (e) { /* ohne Speicher */ } });
  await page.goto(origin + "/quant/#/aktie/" + encodeURIComponent(t));
  await page.waitForFunction(() => { const m = document.querySelector("main#qx-main"); return m && m.dataset.ready === "true" && m.getAttribute("aria-busy") === "false" && !m.querySelector(".qx-loading"); }, null, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const m = await page.evaluate(({ H, JARGON }) => {
    const main = document.querySelector("main#qx-main");
    const words = (s) => (s.match(/[0-9A-Za-zÄÖÜäöüß][^\s]*/g) || []).length;
    const rendered = (n) => n && n.checkVisibility ? n.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : true;
    /* Woerter mit ihrer Lage auf der Seite, nur was gerendert ist. */
    const tw = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    const pieces = [];
    while (tw.nextNode()) {
      const n = tw.currentNode, s = n.textContent.trim();
      if (!s || !rendered(n.parentElement)) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      const b = r.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      pieces.push({ top: b.top + scrollY, bottom: b.bottom + scrollY, w: words(s) });
    }
    const wordsAbove = (y) => pieces.filter((p) => p.top < y).reduce((a, p) => a + p.w, 0);
    const docTop = (n) => n ? n.getBoundingClientRect().bottom + scrollY : null;
    /* Verstanden ist ein Setup, sobald die Invalidierung mit Preis zu lesen
       ist - wo immer sie zuerst steht (Antwort oben oder Kapitel Setup).
       Die Evidenz, sobald Signal und Markt nebeneinander stehen. */
    const first = (list) => list.filter(rendered).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0] || null;
    const setupEl = first([...main.querySelectorAll("small,dt,span,div")].filter((n) => /^Ungültig( unter)?$/.test((n.firstChild && n.firstChild.nodeType === 3 ? n.firstChild.textContent : n.textContent || "").trim()) || (/^Ungültig unter/.test((n.textContent || "").trim()) && n.children.length <= 4 && n.closest("#setup"))));
    const evEl = first([...main.querySelectorAll(".q-mini-compare, #historie .q-ev-compare")]);
    const setupCoreAt = setupEl && rendered(setupEl) ? docTop(setupEl.parentElement || setupEl) : null;
    const evidenceCoreAt = evEl && rendered(evEl) ? docTop(evEl) : null;
    const body = getComputedStyle(document.body).backgroundColor;
    let cards = 0;
    main.querySelectorAll("*").forEach((n) => {
      if (!rendered(n)) return;
      const cs = getComputedStyle(n), b = n.getBoundingClientRect();
      if (b.width <= 200 || b.height < 24) return;
      const framed = ["Top", "Right", "Bottom", "Left"].every((k) => parseFloat(cs["border" + k + "Width"]) > 0);
      const filled = cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== body && parseFloat(cs.borderTopLeftRadius) > 6;
      if (framed || filled) cards++;
    });
    const targets = [...main.querySelectorAll("a[href],button,summary")].filter(rendered);
    const firstViewTargets = targets.filter((n) => { const b = n.getBoundingClientRect(); return b.top + scrollY < H && b.bottom > 0; }).length;
    const text = main.innerText;
    const sentences = text.replace(/\n+/g, ". ").split(/(?<=[.!?])\s+/).filter((s) => words(s) > 20);
    const jargon = {};
    JARGON.forEach((j) => { const c = (text.match(new RegExp("(^|[^A-Za-zÄÖÜäöü])" + j.replace(/[-]/g, "\\-") + "(?![A-Za-zÄÖÜäöü])", "g")) || []).length; if (c) jargon[j] = c; });
    return {
      firstViewWords: wordsAbove(H), wordsToSetup: setupCoreAt === null ? null : wordsAbove(setupCoreAt), wordsToEvidence: evidenceCoreAt === null ? null : wordsAbove(evidenceCoreAt),
      setupCoreAt: setupCoreAt === null ? null : Math.round(setupCoreAt), evidenceCoreAt: evidenceCoreAt === null ? null : Math.round(evidenceCoreAt),
      cards, firstViewTargets, targets: targets.length, longSentences: sentences.length,
      jargon, jargonTotal: Object.values(jargon).reduce((a, b) => a + b, 0), words: words(text), height: document.documentElement.scrollHeight
    };
  }, { H: height, JARGON });
  results.push(Object.assign({ ticker: t }, m));
  console.log(t.padEnd(6) + JSON.stringify(m));
  await page.close();
}
await browser.close(); server.close();
if (out) await writeFile(out, JSON.stringify({ schemaVersion: "stock-ux-measure-1.0.0", viewport: [width, height], results }, null, 1) + "\n");
