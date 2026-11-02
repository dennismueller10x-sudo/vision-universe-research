/* =========================================================================
   VISION UNIVERSE TECHNICAL — live-qa.mjs

   Browser-Pruefung der Strategie-Vorlagen gegen eine AUSGELIEFERTE Seite
   (Produktion in GitHub Actions, lokal gegen einen statischen Server) auf
   iPhone-Breite mit einem einfachen mobilen Leistungsprofil.

   Zugangstor: Der Anmeldezustand wird aus RESEARCH_ACCESS_PASSWORD (GitHub
   Secret) abgeleitet und nur im Browser-Speicher der eigenen Domain gesetzt -
   nie ausgegeben, nie geschrieben (wie scripts/vorsorge/live-smoke.mjs). Das
   Tor selbst wird nicht veraendert; ohne Anmeldung muss es die App verdecken.

   Prueft je Vorlage (alle aus VUTechnical.Templates.list()):
     - Zaehler Erfuellt / Fast erfuellt / Unvollstaendig = index-v1.json der Seite,
     - keine Konsolen- oder Seitenfehler, keine fehlgeschlagenen Anfragen,
     - kein seitliches Scrollen bei 390 px,
     - Chart Studio: Pruefleiste des ersten Treffers zeigt "alle Kriterien erfuellt".
   Misst (Profil "mobil-einfach": CPU x4, 150 ms Latenz, 1,6 Mbit/s):
     Kaltstart Vorlagenliste, erste Vorlage (mit Screener-Datensatz), Wechsel
     zwischen Vorlagen, Screener-Abfrage aus einer Vorlage, Chart Studio.
   Aufruf: node scripts/technical/world/live-qa.mjs <site> <out-dir> [--no-throttle]
   Exit 1 bei einem Befund. Bericht: <out-dir>/report.json und report.md.
   ========================================================================= */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");

const SITE = (process.argv[2] || "https://research.visionuniverse.de").replace(/\/$/, "");
const OUT = process.argv[3] || "technical-live-qa";
const THROTTLE = !process.argv.includes("--no-throttle");
const PROFILE = { name: "mobil-einfach", cpu: 4, latency: 150, down: 1.6e6 / 8, up: 750e3 / 8 };
mkdirSync(OUT, { recursive: true });

let gate = null;
if (process.env.RESEARCH_ACCESS_PASSWORD) {
  const { accessStateFor, STORAGE_KEY } = await import(new URL("../../access-gate/build.mjs", import.meta.url));
  gate = { key: STORAGE_KEY, value: JSON.stringify(accessStateFor(process.env.RESEARCH_ACCESS_PASSWORD)) };
}
const gated = await fetch(SITE + "/__research/config.json").then((r) => r.ok).catch(() => false);

const problems = [], lines = [], timings = {}, templates = [];
const ms = (t0) => Math.round(performance.now() - t0);
const browser = await chromium.launch();

/* 1. Zugangstor: ohne Anmeldung keine Technical-Inhalte (nur pruefen, nichts aendern). */
if (gated) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(SITE + "/technical/#/vorlagen/establishedUptrend", { waitUntil: "domcontentloaded" }).catch(() => null);
  await p.waitForTimeout(1500);
  const g = await p.evaluate(() => ({ gate: !!document.getElementById("research-access-gate"), app: !!document.querySelector(".tc-tpl-seg, .tc-hit, .tc-row") }));
  lines.push("Zugangstor ohne Anmeldung: Tor " + (g.gate ? "sichtbar" : "fehlt") + ", App " + (g.app ? "sichtbar" : "verdeckt"));
  if (!g.gate || g.app) problems.push("GATE_NOT_ENFORCED /technical/");
  await ctx.close();
}
if (gated && !gate) {
  lines.push("Kein RESEARCH_ACCESS_PASSWORD: Vorlagen nicht live geprueft.");
  problems.push("NO_ACCESS: ohne autorisierten Testzugang keine Live-Pruefung");
}

/* 2. Angemeldet, iPhone-Breite, mobiles Leistungsprofil. */
if (!gated || gate) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  if (gate) await ctx.addInitScript(([k, v, o]) => { try { if (location.origin === o) localStorage.setItem(k, v); } catch (e) {} }, [gate.key, gate.value, new URL(SITE).origin]);
  const page = await ctx.newPage();
  const errs = [], failed = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e.message).slice(0, 200)));
  page.on("response", (r) => { if (r.status() >= 400 && new URL(r.url()).origin === new URL(SITE).origin) failed.push(r.status() + " " + new URL(r.url()).pathname); });
  const cdp = await ctx.newCDPSession(page);
  if (THROTTLE) {
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: PROFILE.latency, downloadThroughput: PROFILE.down, uploadThroughput: PROFILE.up });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: PROFILE.cpu });
  }
  const step = async (label, fn) => {
    const e0 = errs.length, f0 = failed.length;
    try { await fn(); } catch (e) { problems.push(label + ": " + String(e.message).split("\n")[0].slice(0, 200)); }
    if (errs.length > e0) problems.push(label + ": Konsole " + errs.slice(e0).join(" | "));
    if (failed.length > f0) problems.push(label + ": Anfragen " + failed.slice(f0).join(", "));
    const sw = await page.evaluate(() => document.documentElement.scrollWidth).catch(() => 0);
    if (sw > 391) problems.push(label + ": seitliches Scrollen (" + sw + " px)");
  };
  const segCounts = () => page.$$eval(".tc-tpl-seg a, .tc-tpl-seg button", (as) => {
    const o = { full: 0, near: 0, incomplete: 0 };
    for (const a of as) {
      const t = a.textContent.replace(/\s+/g, " ").trim(), n = Number((t.match(/[\d.]+$/) || ["0"])[0].replace(/\./g, ""));
      if (/^Erfüllt/.test(t)) o.full = n; else if (/^Fast/.test(t)) o.near = n; else if (/^Unvollständig/.test(t)) o.incomplete = n;
    }
    return o;
  });
  const hashTo = (h) => page.evaluate((x) => { location.hash = x; }, h);

  await step("Kaltstart Vorlagenliste", async () => {
    if (THROTTLE) await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    const t0 = performance.now();
    await page.goto(SITE + "/technical/#/vorlagen", { waitUntil: "commit" });
    await page.waitForSelector(".tc-tpl-group .tc-row", { timeout: 90000 });
    timings.coldTemplateList = ms(t0);
    if (THROTTLE) await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
  });
  /* Nutzerpfad: Liste lesen (3 s), dann die erste Vorlage antippen. Gemessen ab dem Antippen. */
  await page.waitForTimeout(3000);
  const ix = await page.evaluate(() => fetch("/technical/data/index-v1.json").then((r) => r.json())).catch(() => null);
  const list = await page.evaluate(() => (window.VUTechnical && window.VUTechnical.Templates ? window.VUTechnical.Templates.list().map((t) => ({ id: t.id, title: t.title, n: t.criteria.length })) : []));
  const version = await page.evaluate(() => window.VUTechnical && window.VUTechnical.Templates && window.VUTechnical.Templates.TEMPLATES_VERSION);
  lines.push("Vorlagen-Modul " + version + ", " + list.length + " Vorlagen, Index " + (ix && ix.schemaVersion) + ", Stichtag " + (ix && (ix.asOf || ix.stand) || "?"));
  if (!list.length) problems.push("keine Vorlagen im Modul");

  const switchTimes = [];
  for (const [k, t] of list.entries()) {
    const row = { id: t.id, title: t.title, criteria: t.n };
    await step("Vorlage " + t.id, async () => {
      const t0 = performance.now();
      await hashTo("#/vorlagen/" + t.id);
      await page.waitForFunction((id) => location.hash.indexOf(id) >= 0 && document.querySelector(".tc-tpl-seg") && (document.querySelector(".tc-hits .tc-hit") || /Keine/.test(document.body.innerText)), t.id, { timeout: 120000 });
      const dt = ms(t0);
      if (k === 0) timings.firstTemplateWithDataset = dt; else switchTimes.push(dt);
      row.ms = dt;
      row.counts = await segCounts();
      const want = ix && ix.templates && ix.templates[t.id];
      row.index = want || null;
      if (!want) throw new Error("Index ohne Zaehler fuer " + t.id);
      if (row.counts.full !== want[0] || row.counts.near !== want[1] || row.counts.incomplete !== want[2]) throw new Error("Zaehler " + JSON.stringify(row.counts) + " != Index " + JSON.stringify(want));
      row.first = await page.$eval(".tc-hits .tc-hit", (a) => (a.getAttribute("href") || "").match(/#\/chart\/([^/?]+)/)?.[1] || null).catch(() => null);
      await page.screenshot({ path: join(OUT, "vorlage-" + t.id + ".png") });
    });
    templates.push(row);
  }
  timings.templateSwitch = switchTimes.length ? { n: switchTimes.length, median: switchTimes.sort((a, b) => a - b)[Math.floor(switchTimes.length / 2)], max: Math.max(...switchTimes) } : null;

  await step("Screener aus Vorlage", async () => {
    const t0 = performance.now();
    await hashTo("#/screener?vorlage=establishedUptrend");
    await page.waitForFunction(() => /vorlage=establishedUptrend/.test(location.hash) && (document.querySelector(".tc-hit") || /Keine Treffer/.test(document.body.innerText)), null, { timeout: 60000 });
    timings.screenerFromTemplate = ms(t0);
    timings.queryInPage = await page.evaluate(() => {
      const Q = window.VUTechnical.Query, T = window.VUTechnical.Templates;
      return fetch("/technical/data/screener-v1.json").then((r) => r.json()).then((a) => {
        const ds = Q.createDataset(a), q = Object.assign({}, T.toQuery(T.get("establishedUptrend")).query, { limit: 200 });
        const r = []; for (let i = 0; i < 5; i++) { const t = performance.now(); Q.evaluate(ds, q); r.push(performance.now() - t); }
        r.sort((x, y) => x - y); return Math.round(r[2]);
      });
    });
    await page.screenshot({ path: join(OUT, "screener-vorlage.png") });
  });

  const tgt = (templates.find((r) => r.id === "establishedUptrend") || {}).first;
  await step("Chart Studio " + (tgt || "?"), async () => {
    if (!tgt) throw new Error("kein erster Treffer fuer establishedUptrend");
    const t0 = performance.now();
    await hashTo("#/chart/" + tgt + "?v=establishedUptrend");
    await page.waitForSelector(".tc-chart svg", { timeout: 90000 });
    timings.chartStudio = ms(t0);
    await page.waitForSelector(".tc-tpl-panel .tc-crit-why", { timeout: 60000 });
    await page.click(".tc-tpl-panel > summary");
    const txt = (await page.$eval(".tc-tpl-panel", (p) => p.innerText)).replace(/\s+/g, " ");
    lines.push("Chart Studio " + tgt + ": " + txt.slice(0, 120));
    if (!/alle Kriterien erfüllt/.test(txt)) throw new Error("Pruefleiste nicht 'alle Kriterien erfuellt'");
    await page.locator(".tc-tpl-panel").screenshot({ path: join(OUT, "chart-pruefleiste-" + tgt + ".png") });
  });
  await ctx.close();
}
await browser.close();

const report = { site: SITE, at: new Date().toISOString(), profile: THROTTLE ? PROFILE : "ohne Drosselung", viewport: "390x844 @3x, mobil", gated, loggedIn: !!gate, timings, templates, lines, problems };
writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
const md = ["### Technical Live-QA " + SITE, "", "Profil: " + (THROTTLE ? "CPU x" + PROFILE.cpu + ", " + PROFILE.latency + " ms, 1,6 Mbit/s" : "ohne Drosselung") + " · 390 px · angemeldet: " + (gate ? "ja" : "nein"), "",
  "| Vorlage | Kriterien | Erfüllt | Fast | Unvollst. | = Index | ms |", "|---|---|---|---|---|---|---|",
  ...templates.map((r) => "| " + r.title + " | " + r.criteria + " | " + (r.counts ? r.counts.full + " | " + r.counts.near + " | " + r.counts.incomplete : "– | – | –") + " | " + (r.index && r.counts && r.counts.full === r.index[0] && r.counts.near === r.index[1] && r.counts.incomplete === r.index[2] ? "ja" : "NEIN") + " | " + (r.ms || "–") + " |"),
  "", "Messwerte: " + JSON.stringify(timings), "", ...lines.map((l) => "- " + l), "", problems.length ? "**Befunde (" + problems.length + "):**\n" + problems.map((p) => "- " + p).join("\n") : "**Keine Befunde.**"];
writeFileSync(join(OUT, "report.md"), md.join("\n") + "\n");
console.log(md.join("\n"));
process.exit(problems.length ? 1 : 0);
