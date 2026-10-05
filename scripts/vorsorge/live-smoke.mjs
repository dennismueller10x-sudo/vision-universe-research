/* =========================================================================
   VISION UNIVERSE VORSORGE — live-smoke.mjs

   Browser-Rauchtest gegen die VEROEFFENTLICHTE Seite (nicht den Arbeitsbaum).
   Laeuft in GitHub Actions (Marker [vorsorge-live-smoke]); lokal ist die
   Produktionsdomain gesperrt.

   Zugangstor: Der Anmeldezustand wird aus RESEARCH_ACCESS_PASSWORD (GitHub
   Secret) abgeleitet und nur im Browser-Speicher gesetzt - nie ausgegeben,
   nie geschrieben. Ohne Passwort prueft der Lauf nur, dass das Tor erscheint.

   Prueft je Route und Viewport: HTTP-Status der Seite, Konsolen- und
   Seitenfehler, fehlgeschlagene Anfragen (4xx/5xx), NaN/undefined im Text,
   horizontalen Ueberlauf, haengende Ladeanzeigen, leere Seiten.
   Aufruf: node scripts/vorsorge/live-smoke.mjs <site> <screenshot-dir>
   ========================================================================= */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");

const SITE = (process.argv[2] || "https://research.visionuniverse.de").replace(/\/$/, "");
const SHOTS = process.argv[3] || "vorsorge-live-shots";
mkdirSync(SHOTS, { recursive: true });

let gate = null;
if (process.env.RESEARCH_ACCESS_PASSWORD) {
  const { accessStateFor, STORAGE_KEY } = await import(new URL("../access-gate/build.mjs", import.meta.url));
  gate = { key: STORAGE_KEY, value: JSON.stringify(accessStateFor(process.env.RESEARCH_ACCESS_PASSWORD)) };
}

const ROUTES = ["#/", "#/plan", "#/plan/luecke", "#/kosten", "#/etfs", "#/etfs?holdings=1", "#/etf/IVV", "#/etf/IVV?tab=bestandteile",
  "#/etf/IVV?tab=xray", "#/etf/IVV?tab=aenderungen", "#/etf/IVV?tab=kosten", "#/etf/IVV?tab=daten", "#/etf/VTI?tab=xray",
  "#/etf/QQQM?tab=aenderungen", "#/vergleich?s=IVV,QQQM,VTI", "#/portfolio", "#/watchlist", "#/monitor", "#/europa",
  "#/europa/IE00B4L5Y983", "#/daten", "#/foerderung"];
const VPS = { desktop: [1440, 900], mobile: [390, 844] };
const SEED = { watchlist: ["IVV", "QQQM", "AGG"], portfolio: [{ symbol: "VTI", weight: 0.5 }, { symbol: "QQQM", weight: 0.3 }, { symbol: "IVV", weight: 0.2 }] };

const browser = await chromium.launch();
const problems = [], lines = [];
// Einstieg ohne Hash (Deep Link /vorsorge/) und eine statische SEO-Seite
const direct = ["/vorsorge/", "/vorsorge/sitemap.xml", "/vorsorge/etf/IVV/", "/vorsorge/etf/VTI/"];
{
  const ctx = await browser.newContext();
  if (gate) await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) {} }, [gate.key, gate.value]);
  const p = await ctx.newPage();
  for (const path of direct) {
    const res = await p.goto(SITE + path, { waitUntil: "domcontentloaded" }).catch((e) => ({ status: () => 0, err: e }));
    const st = res && res.status ? res.status() : 0;
    lines.push("DIRECT " + path + " " + st);
    if (st >= 400 || st === 0) problems.push("DIRECT " + path + " HTTP " + st);
  }
  if (!gate) { const t = await p.evaluate(() => document.body.innerText.slice(0, 200)); lines.push("GATE-TEXT " + t.replace(/\s+/g, " ")); }
  await ctx.close();
}
if (gate) for (const [vp, [w, h]] of Object.entries(VPS)) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(([k, v, seed]) => { try { localStorage.setItem(k, v); if (!localStorage.getItem("vu-vorsorge-v1")) localStorage.setItem("vu-vorsorge-v1", seed); } catch (e) {} }, [gate.key, gate.value, JSON.stringify(SEED)]);
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e.message).slice(0, 200)));
  page.on("requestfailed", (r) => { if (!/favicon|google|analytics|beacon/.test(r.url())) errs.push("REQFAIL " + r.url().replace(SITE, "")); });
  page.on("response", (r) => { if (r.status() >= 400 && r.url().startsWith(SITE) && !/favicon/.test(r.url())) errs.push("HTTP " + r.status() + " " + r.url().replace(SITE, "")); });
  for (const r of ROUTES) {
    errs.length = 0;
    const t0 = Date.now();
    await page.goto(SITE + "/vorsorge/" + r, { waitUntil: "networkidle", timeout: 60000 }).catch((e) => errs.push("GOTO " + String(e.message).slice(0, 120)));
    await page.waitForTimeout(800);
    const info = await page.evaluate(() => {
      const rootEl = document.querySelector("#vs-root"); const txt = rootEl ? rootEl.innerText : "";
      const sw = document.documentElement.scrollWidth, iw = window.innerWidth;
      return { gate: !rootEl, sw, iw, loading: rootEl ? rootEl.querySelectorAll(".vs-loading").length : 0, len: txt.length,
        nan: /\bNaN\b|undefined|\[object/.test(txt), head: txt.replace(/\s+/g, " ").slice(0, 160) };
    });
    const tag = vp + " " + r;
    lines.push(tag + " " + (Date.now() - t0) + "ms len=" + info.len + " | " + info.head);
    if (info.gate) problems.push(tag + " ZUGANGSTOR/LEER (kein #vs-root)");
    if (info.sw > info.iw + 1) problems.push(tag + " H-OVERFLOW " + info.sw + ">" + info.iw);
    if (info.loading) problems.push(tag + " STILL-LOADING " + info.loading);
    if (info.nan) problems.push(tag + " NaN/undefined im Text");
    if (info.len < 150) problems.push(tag + " LEER? " + info.len);
    if (errs.length) problems.push(tag + " FEHLER " + errs.slice(0, 3).join(" || "));
    await page.screenshot({ path: join(SHOTS, vp + "_" + r.replace(/[^a-z0-9]+/gi, "_") + ".png"), fullPage: vp === "mobile" });
  }
  await ctx.close();
}
await browser.close();
const out = ["# Vorsorge Live-Smoke " + SITE, "", "Zugang: " + (gate ? "angemeldet (Secret)" : "OHNE Passwort - nur Tor geprueft"), "", "## Befunde", ...(problems.length ? problems.map((p) => "- " + p) : ["- keine"]), "", "## Routen", ...lines.map((l) => "- " + l)];
writeFileSync(join(SHOTS, "report.md"), out.join("\n") + "\n");
console.log(out.join("\n"));
if (!gate || problems.length) process.exit(1);
