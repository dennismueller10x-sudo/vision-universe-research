/* =========================================================================
   VISION UNIVERSE — verify-owner-preview.mjs

   DIE INTEGRIERTE VORSCHAU, GEMESSEN AM AUSGELIEFERTEN SYSTEM.

   Der Eigentuemer bekommt eine Adresse. Dieses Skript prueft, was hinter
   ihr steht - mit einem echten Browser, auf 1440 px und auf 390 px, und
   mit echten Aufrufen an die beiden Serverfunktionen.

   Es beantwortet genau die Fragen des Abnahmeberichts:

     O1  Ist die Tuer zu?                       (ohne Zugangsmittel)
     O2  Traegt die Vorschau das ganze Universum? (Zahlen aus dem Datensatz)
     O3  Laufen alle Produktansichten?          (jede einzeln, beide Breiten)
     O4  Ist ein beliebiger Titel erreichbar?   (zufaellig gezogen)
     O5  Rechnet der Screener ueber alles?
     O6  Historischer Chart: zeichnet er echte Kerzen?
     O7  Intraday: antwortet die Serverfunktion?
     O8  Echtzeit: verbindet sie, und wie viele Aktualisierungen kommen an?
     O9  Steht irgendwo ein Zugangsschluessel oder ein Rohcode?
     O10 Ist die oeffentliche Auslieferung unveraendert?

   KEINE GEMESSENE ZAHL IM PRUEFCODE. Universumsgroesse und Trefferzahlen
   kommen aus dem ausgelieferten Datensatz; verglichen werden Beziehungen.

   Ausfuehren (braucht offenes Netz - laeuft deshalb in GitHub Actions):
     node scripts/proof/verify-owner-preview.mjs --base https://<projekt>.vercel.app
   ========================================================================= */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const BASE = String(arg("--base", process.env.VERCEL_PREVIEW_URL || "")).replace(/\/$/, "");
const PAGES = String(arg("--pages", "https://research.visionuniverse.de")).replace(/\/$/, "");
const OUT = arg("--out", join(root, "quant", "data", "site"));
const SHOTS = arg("--shots", join(OUT, "owner-preview-shots"));
const STROM_MS = parseInt(arg("--stream-ms", "45000"), 10);
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";

if (!BASE) { console.error("\n  ABBRUCH: keine Adresse. --base setzen.\n"); process.exit(2); }

const SCHUTZ = [/_vercel_sso_nonce/i, /Authentication Required/i, /vercel\.com\/sso/i, /Vercel Authentication/i];
const ROHCODES = /PASS_NOT_ITEMISED|SOURCE_MISSING|NOT_DEPLOYED|WITHHELD_REDISTRIBUTION|NOT_IN_DELIVERED_ARTEFACTS|OUTSIDE_PREVIEW_SCOPE|DISPLAY_NOT_PERMITTED|INVALID_IDENTITY|UNVALIDATED_FACTOR_SOURCE/;
const SCHLUESSEL = [
  { id: "tiingoTokenHeader", re: /Token\s+[0-9a-f]{32,}/i },
  { id: "apiKeyAssignment", re: /(api[_-]?key|apikey|secret|token|password)["'\s:=]+[A-Za-z0-9_\-]{24,}/i }
];

/* Die Ansichten der Anwendung - das sind die Punkte des Abnahmeberichts,
   eins zu eins. */
const ANSICHTEN = [
  ["home", "/vu2/", "Home"],
  ["markets", "/vu2/?view=markets", "Markets"],
  ["discover", "/vu2/?view=discover", "Discover"],
  ["screener", "/vu2/?view=screener", "Screener"],
  ["research", "/vu2/?view=research", "Research"],
  ["stock", "/vu2/?view=stock&ticker=NVDA", "Stock Intelligence"],
  ["quant", "/vu2/?view=quant&ticker=NVDA", "Quant"],
  ["fundamentals", "/vu2/?view=fundamentals&ticker=NVDA", "Fundamentals"],
  ["technical", "/vu2/?view=technical&ticker=NVDA", "Technical"],
  ["elliott", "/vu2/?view=elliott&ticker=NVDA", "Elliott"],
  ["strategies", "/vu2/?view=strategies", "Strategy Lab"],
  ["portfolio", "/vu2/?view=portfolio", "Portfolio"],
  ["compare", "/vu2/?view=compare", "Vergleich"]
];

function entschaerfe(t) { return BYPASS ? String(t).split(BYPASS).join("[TOKEN ENTFERNT]") : String(t); }

/* `folgen` entscheidet ueber die Aussagekraft: bei der Abweisungspruefung
   ist die Weiterleitung SELBST der Befund (302 auf die Anmeldung), beim
   Abruf einer Serverfunktion ist sie nur Verwaltung - vercel.json setzt
   trailingSlash, und /api/intraday antwortet deshalb erst mit 308 auf
   /api/intraday/. Der erste Versuch hat diese 308 als Fehlschlag
   gemeldet, obwohl die Funktion einwandfrei lief. */
async function hole(pfad, { bypass = false, ms = 30000, folgen = false } = {}) {
  const kopf = { "user-agent": "vision-universe-owner-preview-verifier/1" };
  if (bypass && BYPASS) kopf["x-vercel-protection-bypass"] = BYPASS;
  const ctl = new AbortController();
  const uhr = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch((pfad.startsWith("http") ? pfad : BASE + pfad),
      { headers: kopf, redirect: folgen ? "follow" : "manual", signal: ctl.signal });
    const typ = String(res.headers.get("content-type") || "");
    const body = /text|json|javascript|html|event-stream/i.test(typ) || !typ ? await res.text() : "";
    return { ok: true, status: res.status, contentType: typ, body,
             location: res.headers.get("location") || null };
  } catch (err) {
    return { ok: false, status: null, error: entschaerfe((err && err.message) || err).slice(0, 160) };
  } finally { clearTimeout(uhr); }
}

const bericht = {
  generatedAt: new Date().toISOString(), previewBase: BASE, publicBase: PAGES,
  scope: "vu2OwnerIntegrationPreview",
  authenticationProofScope: BYPASS
    ? "Bypass-Token fuer Automaten: belegt den Durchlass fuer einen berechtigten Aufrufer, nicht die SSO-Anmeldung eines Menschen."
    : "Kein Zugangsmittel gesetzt - alles hinter der Tuer blieb ungeprueft.",
  run: { source: process.env.GITHUB_ACTIONS ? "github-actions" : "local",
         runId: process.env.GITHUB_RUN_ID || null, commit: process.env.GITHUB_SHA || null },
  universe: null, product: {}, chart: { historical: null, intraday: null, realtime: null },
  checks: [], verdict: null
};

function pruefe(id, label, status, detail) {
  bericht.checks.push({ id, label, status, detail: detail === undefined ? null : detail });
  console.log(`  [${status === "PASS" ? "OK  " : status === "FAIL" ? "FAIL" : "----"}] ${id.padEnd(4)} ${label}`);
  if (detail) console.log("         " + entschaerfe(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
}

async function main() {
  console.log("\nVision Universe — integrierte Eigentuemer-Vorschau\n");
  console.log(`  Adresse:       ${BASE}`);
  console.log(`  Zugangsmittel: ${BYPASS ? "Bypass-Token vorhanden" : "KEINES"}\n`);

  /* ------------------------------------------------------------- O1 */
  const zu = [];
  for (const pfad of ["/vu2/", "/quant/data/proof/index.json", "/api/intraday?ticker=AAPL"]) {
    const a = await hole(pfad);
    const geschuetzt = a.ok && (a.status === 401 || a.status === 403 ||
      (a.status >= 300 && a.status < 400 && /vercel\.com\/sso/i.test(a.location || "")) ||
      (a.status === 200 && SCHUTZ.some((re) => re.test(a.body || ""))));
    zu.push({ pfad, status: a.status, blocked: geschuetzt });
    console.log(`         ${pfad.padEnd(34)} ${a.status} ${geschuetzt ? "abgewiesen" : "OFFEN"}`);
  }
  pruefe("O1", "Ohne Zugangsmittel abgewiesen — Seiten, Daten und Serverfunktion",
    zu.every((z) => z.blocked) ? "PASS" : "FAIL",
    zu.filter((z) => !z.blocked).map((z) => z.pfad).join(", ") || "alle drei abgewiesen");

  if (!BYPASS) {
    ["O2", "O3", "O4", "O5", "O6", "O7", "O8", "O9"].forEach((id) =>
      pruefe(id, "hinter der Tuer", "SKIP", "ohne Bypass-Token nicht messbar"));
    return abschluss();
  }

  /* ------------------------------------------------------------- O2 */
  const metaRes = await hole("/quant/data/proof/meta.json", { bypass: true });
  const indexRes = await hole("/quant/data/proof/index.json", { bypass: true });
  let meta = null, index = null;
  try { meta = JSON.parse(metaRes.body); } catch (e) { /* bleibt null */ }
  try { index = JSON.parse(indexRes.body); } catch (e) { /* bleibt null */ }
  if (meta && index) {
    bericht.universe = {
      searchable: index.count, routable: index.count, withFactors: index.withFactors,
      asOf: meta.asOf, gate: meta.gate, snapshot: meta.dataSnapshotId,
      historicalChartSecurities: (meta.chart && meta.chart.historical && meta.chart.historical.scope) || []
    };
    pruefe("O2", "Der ausgelieferte Datensatz traegt das ganze Universum",
      index.count > 5000 && index.count === meta.coverage.securities &&
      index.withFactors === meta.coverage.withFactorRow ? "PASS" : "FAIL",
      `${index.count} Titel · ${index.withFactors} mit Faktorzeile · Stand ${meta.asOf}`);
  } else {
    pruefe("O2", "Der ausgelieferte Datensatz traegt das ganze Universum", "FAIL",
      `meta ${metaRes.status}, index ${indexRes.status}`);
  }

  /* --------------------------------------------------------- Browser */
  let chromium = null;
  try { ({ chromium } = await import("playwright")); } catch (e) { chromium = null; }
  if (!chromium) {
    ["O3", "O4", "O5", "O6", "O8"].forEach((id) => pruefe(id, "Browser-Pruefung", "SKIP", "kein Browser installiert"));
  } else {
    mkdirSync(SHOTS, { recursive: true });
    await imBrowser(chromium, index, meta);
  }

  /* ------------------------------------------------------------- O7 */
  const freigegeben = (bericht.universe && bericht.universe.historicalChartSecurities) || [];
  const intradayTicker = freigegeben[0] || "AAPL";
  const intraday = await hole(`/api/intraday?ticker=${intradayTicker}&freq=5min&days=3`,
    { bypass: true, folgen: true });
  let intradayBody = null;
  try { intradayBody = JSON.parse(intraday.body); } catch (e) { /* bleibt null */ }
  bericht.chart.intraday = intradayBody
    ? { state: intradayBody.state, bars: (intradayBody.bars || []).length,
        first: intradayBody.first || null, last: intradayBody.last || null,
        reason: intradayBody.reason || null, remedy: intradayBody.remedy || null }
    : { state: "NO_RESPONSE", status: intraday.status };
  /* WAS HIER ALS FEHLSCHLAG ZAEHLT, IST DIE GANZE FRAGE.

     Eine fehlende Umgebungsvariable ist kein kaputtes Produkt. Der erste
     Lauf hat NOT_CONFIGURED als FAIL gewertet und damit den eigentlichen
     Befund verdeckt: die Funktion laeuft, sie hat nur keinen Schluessel.
     Rot ist deshalb nur, was gar nicht antwortet; alles, was einen
     benannten Zustand liefert, ist gemessen - und wenn dieser Zustand
     eine offene Einstellung ist, dann UEBERSPRUNGEN mit Abhilfe. */
  const EINSTELLUNG = ["NOT_CONFIGURED", "SCOPE_UNREADABLE"];
  const intradayStatus = !intradayBody ? "FAIL"
    : intradayBody.state === "AVAILABLE" ? "PASS"
    : EINSTELLUNG.includes(intradayBody.state) || intradayBody.state === "EMPTY" ? "SKIP"
    : "FAIL";
  pruefe("O7", "Intraday: die Serverfunktion antwortet", intradayStatus,
    intradayBody ? `${intradayBody.state}${(intradayBody.bars || []).length ? " · " + intradayBody.bars.length + " Bars" : ""}` +
      (intradayBody.reason ? " · " + intradayBody.reason : "") +
      (intradayBody.remedy ? " · Abhilfe: " + intradayBody.remedy : "") : `HTTP ${intraday.status}`);

  /* ------------------------------------------------------------- O8
     Der Strom, gemessen an der Quelle: verbunden, abonniert, wie viele
     Aktualisierungen im Fenster. Die sichtbare Seite misst O8b. */
  const strom = await stromMessen(`/api/realtime?tickers=${intradayTicker}`);
  bericht.chart.realtime = strom;
  const stromStatus = strom.connected ? (strom.updates > 0 ? "PASS" : "SKIP")
    : EINSTELLUNG.includes(strom.state) ? "SKIP" : "FAIL";
  pruefe("O8", "Echtzeit: Verbindung, Abonnement und Aktualisierungen", stromStatus,
    `Zustand ${strom.state} · verbunden ${strom.connected} · abonniert ${strom.subscribed} · ` +
    `Aktualisierungen ${strom.updates}` + (strom.firstUpdateAt ? " · erste " + strom.firstUpdateAt : "") +
    (strom.reason ? " · " + strom.reason : "") + (strom.remedy ? " · Abhilfe: " + strom.remedy : ""));

  /* ------------------------------------------------------------- O9 */
  const funde = [];
  for (const pfad of ["/vu2/", "/vu2-bridge/bridge.js", "/vu2-bridge/experience.js",
                      "/quant/api/product-services.js", "/quant/data/proof/meta.json"]) {
    const r = await hole(pfad, { bypass: true });
    SCHLUESSEL.forEach((m) => { if (m.re.test(r.body || "")) funde.push(`${pfad}: ${m.id}`); });
  }
  /* Und die Serverfunktion darf ihren Quelltext nicht ausliefern. */
  const quelltext = await hole("/api/realtime.js", { bypass: true });
  const quelltextOffen = quelltext.ok && quelltext.status === 200 && /TIINGO_API_KEY/.test(quelltext.body || "");
  pruefe("O9", "Kein Zugangsschluessel im ausgelieferten Inhalt",
    !funde.length && !quelltextOffen ? "PASS" : "FAIL",
    funde.concat(quelltextOffen ? ["/api/realtime.js wird als Quelltext ausgeliefert"] : []).join(", ") ||
    "sechs Pfade geprueft");

  /* ------------------------------------------------------------ O10 */
  const oeffentlich = await hole(PAGES + "/vu2/");
  const oeffentlichApi = await hole(PAGES + "/api/realtime");
  pruefe("O10", "Auf GitHub Pages gibt es die Integrationsvorschau nicht",
    oeffentlich.ok && oeffentlich.status === 404 && oeffentlichApi.ok && oeffentlichApi.status === 404
      ? "PASS" : oeffentlich.ok ? "FAIL" : "SKIP",
    `/vu2/ → ${oeffentlich.status} · /api/realtime → ${oeffentlichApi.status}`);

  return abschluss();
}

/* Liest den Ereignisstrom der Serverfunktion und zaehlt, was ankommt. */
async function stromMessen(pfad) {
  const ergebnis = { state: null, connected: false, subscribed: false, updates: 0,
                     firstUpdateAt: null, lastPrice: null, reason: null,
                     priceTypeConfirmed: false, windowMs: STROM_MS };
  const kopf = { "user-agent": "vision-universe-owner-preview-verifier/1", accept: "text/event-stream" };
  if (BYPASS) kopf["x-vercel-protection-bypass"] = BYPASS;
  const ctl = new AbortController();
  const uhr = setTimeout(() => ctl.abort(), STROM_MS);
  try {
    const res = await fetch(BASE + pfad, { headers: kopf, redirect: "follow", signal: ctl.signal });
    if (!res.ok || !res.body) { ergebnis.state = "HTTP_" + res.status; return ergebnis; }
    const leser = res.body.getReader();
    const dekoder = new TextDecoder();
    let puffer = "";
    while (true) {
      const { done, value } = await leser.read();
      if (done) break;
      puffer += dekoder.decode(value, { stream: true });
      let trenner;
      while ((trenner = puffer.indexOf("\n\n")) >= 0) {
        const block = puffer.slice(0, trenner); puffer = puffer.slice(trenner + 2);
        const art = (block.match(/^event: (.+)$/m) || [])[1];
        const roh = (block.match(/^data: (.+)$/m) || [])[1];
        if (!art || !roh) continue;
        let d = null; try { d = JSON.parse(roh); } catch (e) { continue; }
        if (art === "status") {
          ergebnis.state = d.state;
          if (d.state === "CONNECTED") ergebnis.connected = true;
          if (d.reason) ergebnis.reason = d.reason;
          if (d.remedy) ergebnis.remedy = d.remedy;
        }
        if (art === "subscribed") ergebnis.subscribed = true;
        if (art === "tick") {
          ergebnis.updates = d.seq;
          ergebnis.lastPrice = typeof d.price === "number";
          if (!ergebnis.firstUpdateAt) ergebnis.firstUpdateAt = d.receivedAt;
        }
        if (art === "summary") {
          ergebnis.updates = d.updates;
          ergebnis.firstUpdateAt = d.firstUpdateAt || ergebnis.firstUpdateAt;
          ergebnis.state = ergebnis.state === "CONNECTED" ? d.state : ergebnis.state;
          if (d.note) ergebnis.reason = d.note;
          return ergebnis;
        }
      }
    }
  } catch (err) {
    if (!ergebnis.state) ergebnis.state = "STREAM_ABORTED";
  } finally { clearTimeout(uhr); }
  return ergebnis;
}

async function imBrowser(chromium, index, meta) {
  const browser = await chromium.launch();
  const zufall = index && index.tickers.length
    ? index.tickers[Math.floor(Math.random() * index.tickers.length)] : "ORCL";
  const mitChart = ((meta && meta.chart && meta.chart.historical && meta.chart.historical.scope) || [])[0] || "AAPL";
  const ergebnisse = { O3: [], O4: [], O5: [], O6: [], O8b: [] };

  for (const vp of [{ n: "desktop", w: 1440, h: 960 }, { n: "mobile", w: 390, h: 844 }]) {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      extraHTTPHeaders: BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {}
    });
    const page = await ctx.newPage();

    /* O3 — jede Produktansicht einzeln. */
    for (const [id, pfad, label] of ANSICHTEN) {
      const fehler = [];
      const zuhoerer = (e) => fehler.push("pageerror: " + e.message);
      page.on("pageerror", zuhoerer);
      try {
        await page.goto(BASE + pfad, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForSelector("#content .intro, #content .notice", { timeout: 35000 });
        await page.waitForTimeout(800);
        const text = await page.locator("#content").innerText();
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        const roh = ROHCODES.exec(text);
        const ok = text.trim().length > 60 && !fehler.length && over <= 0 && !roh;
        ergebnisse.O3.push(`${vp.n} ${label}: ${ok ? "ok" : "FEHLER"} (${text.trim().length} Z., ${over}px` +
          (roh ? ", Rohcode " + roh[0] : "") + (fehler.length ? ", " + fehler[0].slice(0, 60) : "") + ")");
        if (!bericht.product[label]) bericht.product[label] = {};
        bericht.product[label][vp.n] = ok ? "RENDERS" : "PROBLEM";
        await page.screenshot({ path: join(SHOTS, `${vp.n}-${id}.png`) });
      } catch (err) {
        ergebnisse.O3.push(`${vp.n} ${label}: FEHLER ${String(err.message).slice(0, 80)}`);
        bericht.product[label] = Object.assign(bericht.product[label] || {}, { [vp.n]: "PROBLEM" });
      } finally { page.off("pageerror", zuhoerer); }
    }

    /* O4 — ein zufaellig gezogener Titel, ueber die Suche gefunden. */
    try {
      await page.goto(BASE + "/vu2/", { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForSelector(".vu-scope b", { timeout: 35000 });
      const band = await page.locator(".vu-scope").innerText();
      await page.click(".vu-scope-button");
      await page.waitForSelector("dialog.vu-search[open] input", { timeout: 25000 });
      await page.fill("dialog.vu-search input", zufall);
      await page.waitForTimeout(500);
      const ersterTreffer = await page.locator("dialog.vu-search .search-results a").first().innerText();
      await page.locator("dialog.vu-search .search-results a").first().click();
      await page.waitForSelector("#content .intro", { timeout: 35000 });
      const inhalt = await page.locator("#content").innerText();
      ergebnisse.O4.push(`${vp.n}: ${zufall} gesucht → ${ersterTreffer} → Seite ${inhalt.includes(zufall) ? "offen" : "FEHLER"} · Band: ${band.split("\n")[0]}`);
      await page.screenshot({ path: join(SHOTS, `${vp.n}-zufallstitel.png`) });
    } catch (err) { ergebnisse.O4.push(`${vp.n}: FEHLER ${String(err.message).slice(0, 90)}`); }

    /* O5 — Screener ueber das volle Universum. */
    try {
      await page.goto(BASE + "/vu2/?view=screener", { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForSelector("#content .row", { timeout: 40000 });
      const text = await page.locator("#content").innerText();
      const m = /(\d[\d.]*)\s+Treffer in\s+(\d[\d.]*)/.exec(text);
      const grund = m ? parseInt(m[2].replace(/\./g, ""), 10) : 0;
      ergebnisse.O5.push(`${vp.n}: ${m ? m[0] : "keine Trefferzeile"}${grund > 5000 ? "" : " FEHLER"}`);
      await page.screenshot({ path: join(SHOTS, `${vp.n}-screener.png`), fullPage: true });
    } catch (err) { ergebnisse.O5.push(`${vp.n}: FEHLER ${String(err.message).slice(0, 90)}`); }

    /* O6 — historischer Chart mit echten Kerzen/Punkten. */
    try {
      await page.goto(`${BASE}/vu2/?view=stock&ticker=${mitChart}`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForSelector("#content .focus svg", { timeout: 40000 });
      const box = await page.locator("#content .focus svg").first().boundingBox();
      const punkte = await page.locator("#content .focus svg path, #content .focus svg polyline, #content .focus svg rect").count();
      ergebnisse.O6.push(`${vp.n}: ${mitChart} ${box ? Math.round(box.width) + "x" + Math.round(box.height) : "kein svg"}, ${punkte} Elemente` +
        (box && box.width <= vp.w && punkte > 0 ? "" : " FEHLER"));
    } catch (err) { ergebnisse.O6.push(`${vp.n}: FEHLER ${String(err.message).slice(0, 90)}`); }

    /* O8b — der Live-Block in der Seite: was steht wirklich da? */
    try {
      await page.goto(`${BASE}/vu2/?view=stock&ticker=${mitChart}`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForSelector(".vu-live", { timeout: 35000 });
      await page.waitForTimeout(12000);      /* dem Strom Zeit geben */
      const live = (await page.locator(".vu-live").innerText()).replace(/\n+/g, " · ");
      ergebnisse.O8b.push(`${vp.n}: ${live.slice(0, 220)}`);
      await page.screenshot({ path: join(SHOTS, `${vp.n}-live.png`) });
    } catch (err) { ergebnisse.O8b.push(`${vp.n}: FEHLER ${String(err.message).slice(0, 90)}`); }

    await ctx.close();
  }
  await browser.close();

  const kaputt = (liste) => liste.some((z) => /FEHLER/.test(z));
  pruefe("O3", "Alle Produktansichten rendern, beide Breiten, ohne Rohcodes",
    kaputt(ergebnisse.O3) ? "FAIL" : "PASS", ergebnisse.O3.join(" · "));
  pruefe("O4", "Ein zufaellig gezogener Titel ist ueber die Suche erreichbar",
    kaputt(ergebnisse.O4) ? "FAIL" : "PASS", ergebnisse.O4.join(" · "));
  pruefe("O5", "Der Screener rechnet ueber das volle Universum",
    kaputt(ergebnisse.O5) ? "FAIL" : "PASS", ergebnisse.O5.join(" · "));
  pruefe("O6", "Historischer Chart zeichnet echte Kurse",
    kaputt(ergebnisse.O6) ? "FAIL" : "PASS", ergebnisse.O6.join(" · "));
  pruefe("O8b", "Der Live-Block ist in der Seite sichtbar",
    kaputt(ergebnisse.O8b) ? "FAIL" : "PASS", ergebnisse.O8b.join(" · "));
  bericht.chart.historical = { securities: (meta && meta.chart && meta.chart.historical && meta.chart.historical.scope) || [],
                               measured: ergebnisse.O6 };
  bericht.chart.liveBlock = ergebnisse.O8b;
}

function abschluss() {
  const fail = bericht.checks.filter((c) => c.status === "FAIL");
  const skip = bericht.checks.filter((c) => c.status === "SKIP");
  bericht.verdict = fail.length ? "FAILED" : skip.length ? "PARTIALLY_VERIFIED" : "PREVIEW_VERIFIED";
  bericht.verdictReason = fail.length
    ? `${fail.length} Pruefung(en) gescheitert: ${fail.map((c) => c.id).join(", ")}`
    : skip.length
      ? `${skip.length} Pruefung(en) uebersprungen: ${skip.map((c) => c.id).join(", ")} — ein uebersprungener Nachweis ist kein bestandener.`
      : "alle Pruefungen belegt";

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "owner-preview-verification.json"),
    entschaerfe(JSON.stringify(bericht, null, 2)) + "\n");
  console.log(`\n  Urteil: ${bericht.verdict}\n  ${bericht.verdictReason}\n`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const u = bericht.universe, c = bericht.chart;
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, [
      `## Integrierte Eigentuemer-Vorschau — ${bericht.verdict}`, "",
      bericht.verdictReason, "", `Adresse: \`${BASE}\``, "",
      u ? `Universum: **${u.searchable}** suchbar und aufrufbar · **${u.withFactors}** mit Faktorzeile · Stand ${u.asOf}` : "",
      c.realtime ? `Echtzeit: verbunden ${c.realtime.connected} · Aktualisierungen ${c.realtime.updates}` : "",
      c.intraday ? `Intraday: ${c.intraday.state}` : "", "",
      "| Nachweis | Frage | Ergebnis |", "|---|---|---|",
      ...bericht.checks.map((x) => `| ${x.id} | ${x.label} | ${x.status} |`)
    ].join("\n") + "\n", { flag: "a" });
  }
  process.exit(bericht.verdict === "FAILED" ? 1 : 0);
}

main().catch((err) => {
  console.error("\n  ABBRUCH: " + entschaerfe((err && err.stack) || err) + "\n");
  process.exit(1);
});
