// Detail-QA fuer die Kurzhistorie-Seiten (neu an der Boerse, < 30 Handelstage; Steuerung 21.11.2026, ANT/AXNX).
// Aufruf: node scripts/discover/browser-qa-kurzhistorie.mjs <Basis-URL> [Ausgabeordner]
// Liest stock-index/US_REAL.json (kurzhistorie: [...]), prueft je Titel Daten (Etikett, kein Score, Kurzreihe) und die
// gerenderte Seite im Browser (Etikett, Kurs, Chart ab 2 Schlusskursen, keine Seitenfehler). Hinter dem Entwicklungs-Passwort
// meldet sich der Lauf mit dem Secret RESEARCH_ACCESS_PASSWORD an (Zugangszustand wie in den Gate-Tests, accessStateFor);
// ohne Secret laufen nur die Datenpruefungen. Keine Kurzhistorie-Titel im Index ist kein Fehler (alle haben 30 Tage).
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { accessStateFor, STORAGE_KEY } from "../access-gate/build.mjs";

const base = String(process.argv[2] || "").replace(/\/$/, "");
const out = resolve(process.argv[3] || "smoke-shots/kurzhistorie");
if (!/^https?:\/\//.test(base)) { console.error("Aufruf: browser-qa-kurzhistorie.mjs <Basis-URL> [Ausgabeordner]"); process.exit(2); }
const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); console.log((ok ? "  ok   " : "  FEHL ") + msg); };
const getJSON = async (path) => { const r = await fetch(base + path); if (!r.ok) throw new Error(path + " HTTP " + r.status); return r.json(); };

const index = await getJSON("/discover/data/stock-index/US_REAL.json");
const titel = (index.kurzhistorie || []).slice(0, 5);
console.log(`Kurzhistorie-Titel im Index: ${titel.length ? titel.join(", ") : "keine"}`);
if (!titel.length) { console.log("Nichts zu pruefen (kein Neuemittent unter 30 Handelstagen)."); process.exit(0); }

const details = {};
for (const t of titel) {
  const d = details[t] = await getJSON(`/discover/data/stocks/US_REAL/${t}.json`);
  check(d.kurzhistorie && d.kurzhistorie.status === "ZU_KURZE_HISTORIE", `${t}: Daten tragen den Block kurzhistorie`);
  check(/Kennzahlen folgen ab 30 Handelstagen/.test((d.kurzhistorie || {}).label || ""), `${t}: Etikett nennt die Schwelle 30`);
  check(["leadership", "momentum", "relativeStrength"].every((k) => d.scores && d.scores[k] && d.scores[k].score === null), `${t}: kein Score`);
  check(d.ranks && d.ranks.leadershipPercentile === null, `${t}: keine Rangliste`);
  check(d.price && Number.isFinite(d.price.value) && d.price.value > 0, `${t}: Kurs vorhanden`);
  if (d.series && d.series.available) {
    const s = await getJSON(d.series.path);
    check(s.short === true && Array.isArray(s.points) && s.points.length >= 2 && s.points.length < 30, `${t}: Kurzreihe ${s.points && s.points.length} Punkte (2-29, short)`);
  } else console.log(`  info ${t}: noch keine Kurzreihe (Chart folgt mit dem naechsten Marktdatenlauf)`);
}

const password = process.env.RESEARCH_ACCESS_PASSWORD;
if (!password) {
  console.log("Kein RESEARCH_ACCESS_PASSWORD: gerenderte Seite nicht geprueft (nur Daten).");
} else {
  const { chromium } = createRequire(import.meta.url)("playwright");
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    const state = accessStateFor(password);
    const ctx = await browser.newContext({ viewport: { width: 420, height: 1000 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) { /* ohne Speicher */ } }, [STORAGE_KEY, JSON.stringify(state)]);
    for (const t of titel) {
      const page = await ctx.newPage();
      const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
      await page.goto(`${base}/discover/#/s/US_REAL/${t}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(2500);
      const text = await page.evaluate(() => document.body.innerText);
      check(!/Zugang öffnen/.test(text), `${t}: Seite hinter dem Zugang geoeffnet`);
      check(/Zu kurze Historie/.test(text), `${t}: Etikett 'Zu kurze Historie' sichtbar`);
      check(/Neu an der Börse/i.test(text), `${t}: Kennzeile 'Neu an der Börse' sichtbar`);
      check(/\d+,\d{2,4}\s*\$/.test(text), `${t}: Kurs in Dollar sichtbar`);
      check(!/Leadership|Rangliste Platz/i.test(text), `${t}: kein Score und kein Rang auf der Seite`);
      if (details[t].series && details[t].series.available) check((await page.locator(".dx-chart svg, .dx-chart canvas").count()) > 0, `${t}: Chart gezeichnet (Kurzreihe >= 2 Schlusskurse)`);
      check(errs.length === 0, `${t}: keine Seitenfehler${errs.length ? " (" + errs[0] + ")" : ""}`);
      await page.screenshot({ path: resolve(out, `${t}.png`) });
      await page.close();
    }
  } finally { await browser.close(); }
}
console.log(problems.length ? `\n${problems.length} Abweichung(en).` : "\nKurzhistorie-QA bestanden.");
process.exit(problems.length ? 1 : 0);
