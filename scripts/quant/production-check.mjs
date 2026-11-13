#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — scripts/quant/production-check.mjs

   TÄGLICHER PRODUKTIONS-CHECK VON QUANT (Strang AK, 13.11.2026)

   Owner-Klage: "Mit Quant haben wir immer wieder Probleme wegen Fehler und
   Ausfaelle." Befund der 30 Tage davor: Quant-Stoerungen fielen erst auf,
   wenn jemand die Seite oeffnete oder ein Test rot wurde. Dieser Check
   fragt die AUSGELIEFERTE Seite, nicht das Repository:

     1. Datenarten   jede Datenart mit Artefakt unter /quant/ (core/registry/
                     domains.json) wird live geladen und nach dem Frischevertrag
                     der Registry bewertet (core/health.js, wie /status/).
                     FAILED/STALE = Befund; DEGRADED/UNKNOWN = Hinweis.
     2. Routen       jede Quant-Route (ROUTES) wird in einem frischen Browser
                     geoeffnet: Seite wird bereit, kein JS-Fehler, keine
                     fehlgeschlagene oder >= 400 Anfrage der eigenen Seite,
                     Inhalt vorhanden. Gemessen werden Zeit bis bereit,
                     Anfragen und Bytes (Messbasis fuer ein Frontend-Budget).

   Schreibt nichts ins Repository. Exit 1 bei Befund, 0 sonst; der Alarm
   (Issue pipeline-alarm) entsteht im Workflow quant-produktionscheck.yml.

     node scripts/quant/production-check.mjs --site=https://research.visionuniverse.de \
          --out=check.json --detail=befund.txt [--nur-daten] [--nur-routen]
   ========================================================================= */
import { writeFileSync, appendFileSync } from "node:fs";
import { createRequire } from "node:module";
import { args, makeLoader, loadEngines, loadArtifacts } from "../core/lib.mjs";
import { accessStateFor, verifierForKey, STORAGE_KEY } from "../access-gate/build.mjs";

/* Routen. `bereit`: wann gilt die Seite als gerendert. Die Forschung
   (#/forschung) wird nur gelesen. eigen = eigene Seite ohne Quant-Hauptbereich.
   Hinter dem Zugangs-Tor (solange die Seite nicht oeffentlich ist) loggt sich der Check mit RESEARCH_ACCESS_PASSWORD ein. */
export const ROUTEN = [
  { pfad: "/quant/", name: "Start" },
  { pfad: "/quant/#/meldungen", name: "Meldungen" },
  { pfad: "/quant/#/screener", name: "Screener" },
  { pfad: "/quant/#/stile", name: "Anlagestile" },
  { pfad: "/quant/#/aktien", name: "Aktien" },
  { pfad: "/quant/#/aktie/NVDA", name: "Aktie NVDA", preis: true },
  { pfad: "/quant/#/aktie/JPM", name: "Aktie JPM (Bank)" },
  { pfad: "/quant/#/aktie/NVDA/zahlen", name: "NVDA Zahlen" },
  { pfad: "/quant/#/aktie/NVDA/chartbild", name: "NVDA Chartbild" },
  { pfad: "/quant/#/chartlagen", name: "Technische Lagen" },
  { pfad: "/quant/#/vergleich/NVDA,MSFT", name: "Vergleich" },
  { pfad: "/quant/#/methodik", name: "Methodik" },
  { pfad: "/quant/#/forschung", name: "Forschung (nur lesen)" },
  { pfad: "/quant/musterdepots/", name: "Musterdepots", eigen: true },
  { pfad: "/quant/ai/", name: "KI-Depots", eigen: true },
  { pfad: "/quant/backtests/", name: "Backtests", eigen: true }
];

/* Schwellen. Nicht streng: ein GitHub-Runner ist langsamer als ein Nutzer.
   Sie fangen "haengt" und "kaputt", nicht "etwas langsamer". */
export const SCHWELLEN = { bereitWarnMs: 8000, bereitFehlerMs: 25000, minText: 150 };

const FAIL = new Set(["FAILED", "STALE"]);
const WARN = new Set(["DEGRADED", "UNKNOWN"]);

/** Rein: Quant-Datenarten aus dem Bericht von Health.evaluate in Befunde und Hinweise zerlegen. */
export function bewerteDaten(report, istQuant = (d) => String(d.artifact || "").startsWith("/quant/")) {
  const rows = report.domains.filter(istQuant);
  const zeile = (d) => ({ id: d.id, label: d.label, artifact: d.artifact, status: d.status, reason: d.reason || null, asOf: d.asOf || (d.lastUpdate ? d.lastUpdate.slice(0, 16) : null), warnings: d.warnings || [] });
  return {
    rows: rows.map(zeile),
    befunde: rows.filter((d) => FAIL.has(d.status)).map((d) => `Datenart ${d.label} (${d.artifact}): ${d.status} ${d.reason || ""} ${(d.warnings || []).join("; ")}`.trim()),
    hinweise: rows.filter((d) => WARN.has(d.status)).map((d) => `Datenart ${d.label}: ${d.status} ${d.reason || ""}`.trim())
  };
}

/** Rein: eine Routenmessung bewerten. m = {fehler[], readyMs, text, bereit, preisGesehen, requests, kb} */
export function bewerteRoute(route, m, s = SCHWELLEN) {
  const befunde = [], hinweise = [];
  if (!m.bereit) befunde.push("Seite wurde nicht bereit (Zeitlimit)");
  /* Bekannt harmlos (13.11.2026, NVDA/chartbild): der Browser verwirft eine View Transition, die Seite zeigt sich normal.
     Als Hinweis fuehren, nicht alarmieren; jeder andere Seitenfehler bleibt Befund. */
  for (const f of m.fehler || []) (/Transition was aborted|ViewTransition/.test(f) ? hinweise : befunde).push(f);
  if (m.gate) befunde.push("Zugangs-Tor statt Seite (RESEARCH_ACCESS_PASSWORD fehlt oder passt nicht zum Release)");
  else if (m.bereit && m.text < s.minText) befunde.push(`kaum Inhalt (${m.text} Zeichen)`);
  if (route.preis && m.bereit && !m.preisGesehen) befunde.push("kein Kurs im Aktienkopf");
  if (m.readyMs > s.bereitFehlerMs) befunde.push(`bereit erst nach ${Math.round(m.readyMs / 1000)} s (Grenze ${s.bereitFehlerMs / 1000} s)`);
  else if (m.readyMs > s.bereitWarnMs) hinweise.push(`bereit nach ${Math.round(m.readyMs / 1000)} s`);
  return { befunde, hinweise };
}

/** Zugang wie die Live-QA (scripts/discover/global-live-qa.mjs): Passwort nur aus der Umgebung, nie ausgegeben. */
async function ladeZugang(site) {
  const pw = process.env.RESEARCH_ACCESS_PASSWORD;
  if (!pw) return null;
  const r = await fetch(site + "/__research/config.json", { headers: { "cache-control": "no-cache" } });
  if (!r.ok) return null; /* kein Tor ausgeliefert: nichts zu tun */
  const gate = await r.json();
  const state = accessStateFor(pw);
  if (verifierForKey(state.key) !== gate.verifier) throw new Error("RESEARCH_ACCESS_PASSWORD passt nicht zum ausgelieferten Release");
  return { key: gate.storageKey || STORAGE_KEY, state };
}

async function pruefeRoute(browser, site, route, zugang) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  if (zugang) await ctx.addInitScript(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), zugang);
  const page = await ctx.newPage();
  const origin = new URL(site).origin;
  const fehler = [];
  let requests = 0, bytes = 0;
  const offen = [];
  page.on("pageerror", (e) => fehler.push("JS-Fehler: " + String(e.message).split("\n")[0]));
  page.on("response", (r) => { if (r.url().startsWith(origin) && r.status() >= 400 && !/favicon/.test(r.url())) fehler.push(`HTTP ${r.status()} ${r.url().replace(origin, "")}`); });
  page.on("requestfailed", (r) => { if (r.url().startsWith(origin) && !/ERR_ABORTED/.test((r.failure() || {}).errorText || "")) fehler.push(`Anfrage fehlgeschlagen ${r.url().replace(origin, "")}`); });
  page.on("requestfinished", (r) => { requests++; offen.push(r.sizes().then((z) => { bytes += (z.responseBodySize || 0) + (z.responseHeadersSize || 0); }, () => {})); });
  const t0 = Date.now();
  let bereit = false, gateGesehen = false;
  try {
    await page.goto(site.replace(/\/$/, "") + route.pfad, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForLoadState("load", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(800);
    if (await page.evaluate(() => /Zugang öffnen/.test(document.body.innerText || "")).catch(() => false)) { bereit = true; gateGesehen = true; }
    else if (route.eigen) bereit = true;
    else await page.waitForFunction(() => { const m = document.querySelector("main#qx-main"); return !!m && m.dataset.ready === "true" && m.getAttribute("aria-busy") === "false" && !m.querySelector(".qx-loading"); }, null, { timeout: 45000 }).then(() => { bereit = true; }, () => {});
  } catch (e) { fehler.push("Navigation: " + String(e.message).split("\n")[0]); }
  const readyMs = Date.now() - t0;
  if (bereit) await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  const inhalt = await page.evaluate((eigen) => {
    const w = document.querySelector(eigen ? "body" : "main#qx-main");
    const t = w ? (w.innerText || "").trim() : "";
    return { text: t.length, preis: /(\$|USD)\s?\d|\d[\d.,]*\s?(\$|USD)/.test(t), gate: /Zugang öffnen/.test(document.body.innerText || "") };
  }, !!route.eigen).catch(() => ({ text: 0, preis: false }));
  await Promise.all(offen);
  await ctx.close();
  const m = { fehler: [...new Set(fehler)].slice(0, 8), readyMs, text: inhalt.text, bereit, preisGesehen: inhalt.preis, gate: gateGesehen || !!inhalt.gate, requests, kb: Math.round(bytes / 1024) };
  return Object.assign({ pfad: route.pfad, name: route.name }, m, bewerteRoute(route, m));
}

async function main() {
  const a = args();
  const site = String(a.site || "https://research.visionuniverse.de").replace(/\/$/, "");
  const out = { schema: "vu-quant-production-check-1", site, checkedAt: new Date().toISOString(), daten: null, routen: [] };
  const befunde = [], hinweise = [];

  if (!a["nur-routen"]) {
    const E = loadEngines();
    const artifacts = await loadArtifacts(E.registry, makeLoader({ site }));
    const report = E.Health.evaluate(E.registry, artifacts, { now: new Date(), calendar: E.calendar, tradingSession: E.TradingSession, target: "site" });
    out.daten = bewerteDaten(report);
    befunde.push(...out.daten.befunde); hinweise.push(...out.daten.hinweise);
  }

  if (!a["nur-daten"]) {
    const { chromium } = createRequire(import.meta.url)("playwright");
    const zugang = await ladeZugang(site);
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    try {
      for (const r of ROUTEN.filter((x) => typeof a.route !== "string" || x.pfad.includes(a.route))) {
        let res;
        try { res = await pruefeRoute(browser, site, r, zugang); }
        catch (e) { res = { pfad: r.pfad, name: r.name, bereit: false, readyMs: 0, requests: 0, kb: 0, fehler: [], befunde: ["Pruefung abgebrochen: " + String(e.message).split("\n")[0]], hinweise: [] }; }
        out.routen.push(res);
        if (res.gate) { befunde.push("Zugangs-Tor statt Seite - restliche Routen nicht pruefbar (RESEARCH_ACCESS_PASSWORD fehlt oder passt nicht)"); break; }
        befunde.push(...res.befunde.map((b) => `Route ${r.pfad}: ${b}`));
        hinweise.push(...res.hinweise.map((h) => `Route ${r.pfad}: ${h}`));
      }
    } finally { await browser.close(); }
  }

  out.ok = !befunde.length; out.befunde = befunde; out.hinweise = hinweise;
  const zeilen = [`Quant-Produktionscheck ${site} · ${out.checkedAt} · ${out.ok ? "OK" : "BEFUND"}`, ""];
  if (out.daten) zeilen.push("Datenarten: " + out.daten.rows.map((r) => `${r.id}=${r.status}`).join(" "), "");
  if (out.routen.length) zeilen.push("Routen (bereit ms · Anfragen · KB):", ...out.routen.map((r) => `  ${r.befunde.length ? "FEHLER" : "ok    "} ${r.pfad.padEnd(36)} ${String(r.readyMs).padStart(6)} · ${String(r.requests).padStart(3)} · ${String(r.kb).padStart(5)}`), "");
  if (befunde.length) zeilen.push("BEFUNDE:", ...befunde.map((b) => "  - " + b), "");
  if (hinweise.length) zeilen.push("Hinweise:", ...hinweise.map((b) => "  - " + b), "");
  const text = zeilen.join("\n");
  console.log(text);
  if (typeof a.out === "string") writeFileSync(a.out, JSON.stringify(out, null, 2) + "\n");
  if (typeof a.detail === "string") writeFileSync(a.detail, text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, "### Quant-Produktionscheck\n```\n" + text + "\n```\n");
  process.exit(out.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
