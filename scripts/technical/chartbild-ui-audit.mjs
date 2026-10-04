#!/usr/bin/env node
/* Chartbild — Bildschirm-Audit (Mission III §49–§51, §91).
   Echte Daten, echter Browser, keine Attrappen. Je Breite (390, 430, 768, 1280) und Bildschirm ein Screenshot und
   automatische Pruefungen: horizontaler Ueberlauf, abgeschnittene Texte, ueberlappende Wellen-Marken, Tippflaechen < 40 px,
   Konsolenfehler, Ladezeit. Bewertung der Gestaltung erfolgt danach durch Ansehen der Bilder (Bericht).
   Aufruf: node scripts/technical/chartbild-ui-audit.mjs [--out DIR] [--ticker AAPL] [--port 8791]
   Startet einen statischen Server auf dem Repository-Wurzelverzeichnis. */
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { createRequire } from "node:module";
import { ROOT } from "./lib/ti-data.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i < 0 ? d : process.argv[i + 1]; };
const OUT = arg("out", join(ROOT, "docs/technical-intelligence/ui-audit")), TICKER = arg("ticker", "AAPL"), PORT = +arg("port", "8791");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".gz": "application/gzip", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
const server = createServer(async (req, res) => {
  try {
    const u = decodeURIComponent(new URL(req.url, "http://x").pathname), p = normalize(join(ROOT, u.endsWith("/") ? u + "index.html" : u));
    if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const b = await readFile(p); res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" }); res.end(b);
  } catch (e) { res.writeHead(404).end(); }
}).listen(PORT);
const base = "http://127.0.0.1:" + PORT + "/quant/index.html";
const WIDTHS = [[390, 844, "390"], [430, 932, "430"], [768, 1024, "768-tablet"], [1280, 900, "1280-desktop"], [1440, 900, "1440-desktop"]];
const SCREENS = [
  { id: "chartbild-simple", hash: "#/aktie/" + TICKER + "/chartbild", prep: async (p) => { await p.evaluate(() => localStorage.setItem("vu-ti-view-v1", "simple")); } },
  { id: "chartbild-alt-scenario", hash: "#/aktie/" + TICKER + "/chartbild", act: async (p) => { const b = p.locator(".cb-switch-btn").nth(1); if (await b.count()) await b.click(); } },
  { id: "chartbild-alt-reading", hash: "#/aktie/" + TICKER + "/chartbild", act: async (p) => { const b = p.locator(".cb-ew-switch button").nth(1); if (await b.count()) { await b.click(); await p.locator(".cb-chart").scrollIntoViewIfNeeded(); } } },
  { id: "chartbild-pro", hash: "#/aktie/" + TICKER + "/chartbild?ansicht=profi", act: async (p) => { await p.locator(".cb-ew-panel").first().scrollIntoViewIfNeeded().catch(() => {}); } },
  { id: "elliott-inspector", hash: "#/aktie/" + TICKER + "/chartbild", act: async (p) => { const w = p.locator(".ti-wave.is-tap").last(); if (await w.count()) await w.click(); } },
  { id: "replay", hash: "#/aktie/" + TICKER + "/chartbild", act: async (p) => { const s = p.locator(".cb-scrub"); if (await s.count()) { await s.scrollIntoViewIfNeeded(); await s.evaluate((n) => { n.value = String(Math.floor(+n.max / 2)); n.dispatchEvent(new Event("input")); }); await p.locator(".cb-chart").scrollIntoViewIfNeeded(); } } },
  { id: "stock-teaser", hash: "#/aktie/" + TICKER },
  { id: "method", hash: "#/methodik/chartbild" },
  { id: "chartlagen", hash: "#/chartlagen" }
];
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
const report = { generatedAt: new Date().toISOString(), ticker: TICKER, results: [] };
for (const [w, h, tag] of WIDTHS) for (const sc of SCREENS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 800, isMobile: w < 800 });
  const page = await ctx.newPage(), errors = [];
  page.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT|ERR_NAME|ERR_TUNNEL|ERR_PROXY|net::ERR_/.test(m.text())) errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  const t0 = Date.now();
  await page.goto(base, { waitUntil: "load" });
  if (sc.prep) await sc.prep(page);
  await page.goto(base + sc.hash, { waitUntil: "load" });
  await page.waitForFunction(() => !document.querySelector(".qx-loading, .q-loading") && document.querySelector("main") && document.querySelector("main").textContent.length > 200, null, { timeout: 30000 }).catch(() => errors.push("timeout waiting for content"));
  const loadMs = Date.now() - t0;
  if (sc.act) await sc.act(page).catch((e) => errors.push("act: " + e.message));
  await page.waitForTimeout(400);
  const checks = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth, out = { overflowX: document.documentElement.scrollWidth - vw, wideEls: [], clipped: [], smallTargets: [], waveOverlaps: 0 };
    document.querySelectorAll("main *").forEach((n) => {
      const r = n.getBoundingClientRect(); if (!r.width) return;
      if (r.right > vw + 1 && getComputedStyle(n).position !== "fixed") { let p = n.parentElement, scroll = false; while (p) { const s = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(s.overflowX)) { scroll = true; break; } p = p.parentElement; } if (!scroll && out.wideEls.length < 6) out.wideEls.push((n.className || n.tagName) + " " + Math.round(r.right)); }
      /* absichtlich nur fuer Screenreader (Klasse oder 1-px-Clip wie .qd .qc-chart>h2) zaehlt nicht als abgeschnitten */
      const srOnly = (el) => { const cs = getComputedStyle(el); return (cs.position === "absolute" && el.offsetWidth <= 1 && el.offsetHeight <= 1) || /rect\(0/.test(cs.clip || ""); };
      if (n.children.length === 0 && !/(^|\\s)(cb-sr|sr-only|q-sr)(\\s|$)/.test(n.className || "") && !srOnly(n) && n.scrollWidth > n.clientWidth + 2 && getComputedStyle(n).overflow === "hidden" && getComputedStyle(n).textOverflow !== "ellipsis" && out.clipped.length < 6) out.clipped.push((n.className || n.tagName) + ": " + n.textContent.slice(0, 30));
    });
    document.querySelectorAll("main button, main a, main [role=tab], main input").forEach((n) => { const r = n.getBoundingClientRect(); if (r.width && r.height && (r.height < 40 && r.width < 40) && out.smallTargets.length < 8) out.smallTargets.push((n.className || n.tagName) + " " + Math.round(r.width) + "x" + Math.round(r.height)); });
    const badges = [...document.querySelectorAll(".ti-wave-badge")].map((b) => b.getBoundingClientRect());
    for (let i = 0; i < badges.length; i++) for (let j = i + 1; j < badges.length; j++) { const a = badges[i], b = badges[j]; if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) out.waveOverlaps++; }
    out.sheetOpen = !!document.querySelector(".cb-sheet");
    out.chartHeight = (document.querySelector(".cb-chart svg") || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height;
    return out;
  });
  const file = join(OUT, tag + "-" + sc.id + ".png");
  await page.screenshot({ path: file, fullPage: false });
  /* lange Seiten: weitere Bildschirmhoehen nacheinander (statt eines unlesbaren Ganzseitenbilds) */
  if (sc.id === "chartbild-simple" || sc.id === "chartbild-pro") for (let k = 1; k <= 3; k++) {
    await page.evaluate((y) => window.scrollTo(0, y), Math.round(k * h * 0.9)); await page.waitForTimeout(150);
    await page.screenshot({ path: join(OUT, tag + "-" + sc.id + "-" + (k + 1) + ".png"), fullPage: false });
  }
  report.results.push({ width: w, screen: sc.id, file: file.replace(ROOT + "/", ""), loadMs, errors, checks });
  process.stderr.write(tag + " " + sc.id + " " + loadMs + " ms" + (checks.overflowX > 0 ? " OVERFLOW " + checks.overflowX : "") + (errors.length ? " ERR " + errors[0].slice(0, 80) : "") + "\n");
  await ctx.close();
}
await browser.close(); server.close();
await writeFile(join(OUT, "ui-audit.json"), JSON.stringify(report, null, 1));
const bad = report.results.filter((r) => r.checks.overflowX > 0 || r.errors.length || r.checks.waveOverlaps);
console.log("screens", report.results.length, "with issues", bad.length);
