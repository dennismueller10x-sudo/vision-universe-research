/* Live-Pruefung des Abschnitts "Company Intelligence · Refresh" auf /status/ (Steuerung 28.11.2026).
   Prueft gegen die AUSGELIEFERTE Seite, hinter der Zugangsmaske: das Aggregat company-intelligence/data/refresh-slo.json ist erreichbar und
   gueltig (schema 1, Verlauf), und der Abschnitt rendert Zustand und Rueckstand und eine Tabelle der letzten Berichte.
   Zugangsmaske: Der Anmeldezustand wird aus RESEARCH_ACCESS_PASSWORD (GitHub Secret) abgeleitet und nur im Browser-Speicher der eigenen Domain
   gesetzt, nie ausgegeben, nie geschrieben (wie scripts/technical/world/live-qa.mjs). Kein Passwort, keine Umgehung: ohne Secret meldet die
   Pruefung NO_ACCESS statt zu raten.
   Aufruf: node scripts/company_intelligence/status-live-qa.mjs <site> <out-dir>
   Exit 1 bei einem Befund. Bericht: <out-dir>/report.json, report.md und status-refresh.png. Nur lesen. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const SITE = (process.argv[2] || "https://research.visionuniverse.de").replace(/\/$/, "");
const OUT = process.argv[3] || "ci-status-live-qa";
mkdirSync(OUT, { recursive: true });
const problems = [], lines = [];

/** Auswertung der Aggregat-Datei, rein (testbar). */
export function judgeAggregate(a) {
  const found = [];
  if (!a || a.schema !== 1) return ["AGGREGATE_SCHEMA"];
  if (!Number.isFinite(Date.parse(a.asOf))) found.push("AGGREGATE_ASOF");
  if (!Array.isArray(a.history) || !a.history.length) found.push("AGGREGATE_HISTORY_EMPTY");
  if (!Number.isFinite(a.dueOverSevenDays) || !Number.isFinite(a.eligibleSources)) found.push("AGGREGATE_BACKLOG_MISSING");
  if (a.sourceRowsIncluded !== false || a.contentIncluded !== false || a.privateOperationalRowsIncluded !== false) found.push("AGGREGATE_NOT_AGGREGATE_ONLY");
  if (/https?:\/\/|sourceId|companyId/i.test(JSON.stringify(a))) found.push("AGGREGATE_HAS_SOURCE_REFERENCE");
  return found;
}
/** Auswertung des gerenderten Abschnitts, rein (testbar). */
export function judgeSection({ stand, rows, tableVisible }) {
  const found = [];
  if (!stand || /wird geladen/i.test(stand)) found.push("SECTION_STILL_LOADING");
  else if (/nicht verf(ü|u)gbar/i.test(stand)) found.push("SECTION_UNAVAILABLE");
  else {
    if (!/Zustand\s+\S+/.test(stand)) found.push("SECTION_WITHOUT_STATUS");
    if (!/(\d[\d.]*)\s+von\s+(\d[\d.]*)\s+Quellen/.test(stand)) found.push("SECTION_WITHOUT_BACKLOG");
  }
  if (!(rows >= 1) || !tableVisible) found.push("SECTION_WITHOUT_HISTORY_TABLE");
  return found;
}

const isMain = process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href;
if (isMain) {
  /* 1. Die Datei selbst (oeffentlich, nur Zahlen). */
  const res = await fetch(SITE + "/company-intelligence/data/refresh-slo.json", { cache: "no-store" }).catch(() => null);
  let aggregate = null;
  if (!res || !res.ok) problems.push("AGGREGATE_HTTP " + (res ? res.status : "kein Ergebnis"));
  else { aggregate = await res.json().catch(() => null); const f = judgeAggregate(aggregate); problems.push(...f); lines.push("refresh-slo.json: HTTP 200, Stand " + (aggregate && aggregate.asOf) + ", Verlauf " + ((aggregate && aggregate.history && aggregate.history.length) || 0)); }

  /* 2. Die Seite hinter der Zugangsmaske. */
  const gated = await fetch(SITE + "/__research/config.json").then((r) => r.ok).catch(() => false);
  let gate = null;
  if (process.env.RESEARCH_ACCESS_PASSWORD) {
    const { accessStateFor, STORAGE_KEY } = await import(new URL("../access-gate/build.mjs", import.meta.url));
    gate = { key: STORAGE_KEY, value: JSON.stringify(accessStateFor(process.env.RESEARCH_ACCESS_PASSWORD)) };
  }
  if (gated && !gate) { lines.push("Kein RESEARCH_ACCESS_PASSWORD: Seite nicht geprueft."); problems.push("NO_ACCESS"); }
  else {
    const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
    if (gate) await ctx.addInitScript(([k, v, o]) => { try { if (location.origin === o) localStorage.setItem(k, v); } catch (e) {} }, [gate.key, gate.value, new URL(SITE).origin]);
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e.message).slice(0, 160)));
    await page.goto(SITE + "/status/", { waitUntil: "domcontentloaded" }).catch((e) => problems.push("PAGE_GOTO " + String(e.message).slice(0, 100)));
    await page.waitForSelector("#cir-stand", { timeout: 30000 }).catch(() => problems.push("SECTION_MISSING"));
    await page.waitForFunction(() => { const e = document.getElementById("cir-stand"); return e && !/wird geladen/i.test(e.textContent); }, null, { timeout: 30000 }).catch(() => {});
    const section = await page.evaluate(() => {
      const s = document.getElementById("cir-stand"), t = document.getElementById("cir-history");
      return { stand: s ? s.textContent.trim() : "", rows: t ? t.querySelectorAll("tbody tr").length : 0, tableVisible: !!t && !t.hidden };
    });
    if (!problems.includes("SECTION_MISSING")) problems.push(...judgeSection(section));
    lines.push("Abschnitt: " + (section.stand || "(leer)").slice(0, 400));
    lines.push("Tabelle: " + section.rows + " Zeilen, sichtbar: " + section.tableVisible);
    if (errs.length) { problems.push("PAGE_ERRORS " + errs.length); lines.push("Seitenfehler: " + errs.join(" | ")); }
    await page.locator("#cir").screenshot({ path: join(OUT, "status-refresh.png") }).catch(() => {});
    await browser.close();
  }
  const report = { site: SITE, problems, lines };
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 1) + "\n");
  writeFileSync(join(OUT, "report.md"), "# /status/ Company Intelligence · Refresh (live)\n\n" + lines.map((l) => "- " + l).join("\n") + "\n\n" + (problems.length ? "**Befunde:** " + problems.join(", ") : "**Keine Befunde.**") + "\n");
  console.log(lines.join("\n"));
  if (problems.length) { console.error("BEFUNDE: " + problems.join(", ")); process.exit(1); }
  console.log("Keine Befunde.");
}
