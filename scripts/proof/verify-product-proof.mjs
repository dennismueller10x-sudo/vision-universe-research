/* =========================================================================
   VISION UNIVERSE — verify-product-proof.mjs

   LAEUFT DAS PRODUKT IN DER AUSGELIEFERTEN VORSCHAU?

   Der lokale Bau kann viel belegen, aber nicht das hier: was der
   Eigentuemer sieht, wenn er die geschuetzte Adresse oeffnet. Dieses
   Skript misst genau das - von aussen, am lebenden System, mit einem
   echten Browser.

   Vier Fragen, die getrennt bleiben muessen:

     1  Ist die Tuer zu?            (ohne Zugangsmittel abgewiesen)
     2  Steht dahinter das ganze
        Universum?                  (Zahlen aus dem Datensatz selbst)
     3  Laeuft die Oberflaeche?     (Suche, Einzeltitel, Screener, Chart)
     4  Traegt sie auf 390 px?      (kein Querlauf, Chart passt)

   WAS DIESER NACHWEIS NICHT ZEIGT

   Das Zugangsmittel ist Vercels Bypass-Token fuer Automaten. Es belegt,
   dass die Schutzschicht einen BERECHTIGTEN Aufrufer durchlaesst - nicht,
   dass die SSO-Anmeldung eines Menschen funktioniert. Ohne Token laeuft
   trotzdem der wichtigste Teil: die Abweisung. Alles Weitere wird dann
   als SKIPPED ausgewiesen. EIN UEBERSPRUNGENER NACHWEIS IST KEIN
   BESTANDENER.

   KEINE GEMESSENE ZAHL IM PRUEFCODE. Die Universumsgroesse kommt aus dem
   ausgelieferten Datensatz und wird gegen dessen eigene Bilanz gehalten,
   nicht gegen eine Zahl von gestern.

   Ausfuehren (braucht offenes Netz - laeuft deshalb in GitHub Actions):
     node scripts/proof/verify-product-proof.mjs --base https://<projekt>.vercel.app
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
const SHOTS = arg("--shots", join(root, "quant", "data", "site", "proof-shots"));
const TIMEOUT = parseInt(arg("--timeout", "45000"), 10) || 45000;

/* Nur aus der Umgebung: ein Argument steht in der Prozessliste. */
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";

if (!BASE) {
  console.error("\n  ABBRUCH: keine Vorschau-Adresse. --base oder VERCEL_PREVIEW_URL setzen.\n");
  process.exit(2);
}

const SCHUTZ_SPUREN = [/_vercel_sso_nonce/i, /Authentication Required/i, /vercel\.com\/sso/i,
                       /Vercel Authentication/i, /Deployment Protection/i];
const UNSER_INHALT = [/Full Universe/, /DERIVED_UNIVERSE/, /VUProof/, /Das ganze ausgelieferte Universum/];

const SCHLUESSELMUSTER = [
  { id: "tiingoTokenHeader", re: /Token\s+[0-9a-f]{32,}/i },
  { id: "apiKeyAssignment", re: /(api[_-]?key|apikey|secret|token|password)["'\s:=]+[A-Za-z0-9_\-]{24,}/i },
  { id: "tiingoEnvName", re: /TIINGO_API_KEY\s*[:=]\s*["'][^"']{8,}/i }
];

function entschaerfe(text) {
  if (!BYPASS) return String(text);
  return String(text).split(BYPASS).join("[BYPASS-TOKEN ENTFERNT]");
}

async function hole(url, { bypass = false } = {}) {
  const kopf = { "user-agent": "vision-universe-proof-verifier/1" };
  if (bypass && BYPASS) kopf["x-vercel-protection-bypass"] = BYPASS;
  const ctl = new AbortController();
  const uhr = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { headers: kopf, redirect: "manual", signal: ctl.signal });
    const typ = String(res.headers.get("content-type") || "");
    const koerper = /text|json|javascript|html/i.test(typ) || !typ
      ? await res.text().catch(() => "") : "";
    return { ok: true, status: res.status, location: res.headers.get("location") || null,
             contentType: typ, bytes: koerper.length, body: koerper };
  } catch (err) {
    return { ok: false, status: null, error: entschaerfe((err && err.message) || err).slice(0, 200) };
  } finally { clearTimeout(uhr); }
}

function bewerteAbweisung(a) {
  if (!a.ok) return { blocked: null, reason: "Aufruf gescheitert: " + a.error };
  const inhaltDa = UNSER_INHALT.some((re) => re.test(a.body || ""));
  const schutzDa = SCHUTZ_SPUREN.some((re) => re.test(a.body || "")) ||
                   /vercel\.com\/sso/i.test(a.location || "");
  if (a.status === 401 || a.status === 403) return { blocked: true, reason: `HTTP ${a.status}` };
  if (a.status >= 300 && a.status < 400 && schutzDa) return { blocked: true, reason: `HTTP ${a.status} auf die Anmeldung` };
  if (a.status === 200 && inhaltDa) return { blocked: false, reason: "HTTP 200 mit unserem Inhalt - die Vorschau ist OFFEN" };
  if (a.status === 200) {
    return schutzDa ? { blocked: true, reason: "HTTP 200, aber die Anmeldeseite statt unseres Inhalts" }
                    : { blocked: null, reason: "HTTP 200 ohne erkennbaren Inhalt und ohne Schutzspur" };
  }
  if (a.status === 404) return { blocked: null, reason: "HTTP 404 - der Pfad existiert nicht; kein Schutznachweis" };
  return { blocked: null, reason: `HTTP ${a.status}` };
}

const bericht = {
  generatedAt: new Date().toISOString(),
  previewBase: BASE, publicBase: PAGES,
  scope: "fullUniverseProductProof",
  note: "Prueft am ausgelieferten System: Abweisung ohne Zugangsmittel, Umfang des " +
        "Datensatzes, Bedienbarkeit der bestehenden Oberflaeche (Suche, Einzeltitel, " +
        "Screener, Chart) auf Desktop und 390 px.",
  authenticationProofScope: BYPASS
    ? "Bypass-Token fuer Automaten. Belegt den Durchlass fuer einen berechtigten Aufrufer - " +
      "nicht die SSO-Anmeldung eines Menschen."
    : "Kein Zugangsmittel gesetzt. Alles hinter der Tuer wurde NICHT geprueft.",
  run: { source: process.env.GITHUB_ACTIONS ? "github-actions" : "local",
         runId: process.env.GITHUB_RUN_ID || null, commit: process.env.GITHUB_SHA || null },
  universe: null, chart: null, checks: [], verdict: null
};

function pruefe(id, label, status, detail) {
  bericht.checks.push({ id, label, status, detail: detail === undefined ? null : detail });
  const marke = status === "PASS" ? "OK  " : status === "FAIL" ? "FAIL" : "----";
  console.log(`  [${marke}] ${id.padEnd(5)} ${label}`);
  if (detail) console.log(`         ${entschaerfe(typeof detail === "string" ? detail : JSON.stringify(detail))}`);
}

async function main() {
  console.log("\nVision Universe — Nachweis des Full-Universe-Produkts\n");
  console.log(`  Vorschau:      ${BASE}`);
  console.log(`  Zugangsmittel: ${BYPASS ? "Bypass-Token vorhanden" : "KEINES - nur die Abweisung wird geprueft"}\n`);

  /* ----------------------------------------------------------- P1
     Die Tuer. Vier Pfade, weil vier Dinge zu schuetzen sind: Ansicht,
     Screener, Einzeltitel und der Datensatz. Ein Schutz, der die Seite
     deckt und die JSON-Datei offen laesst, ist keiner. */
  const PFADE = ["/universe/", "/universe/screener/", "/universe/stock/?ticker=ORCL",
                 "/quant/data/proof/index.json"];
  const abweisungen = [];
  for (const p of PFADE) {
    const b = bewerteAbweisung(await hole(BASE + p));
    abweisungen.push({ path: p, blocked: b.blocked, reason: b.reason });
    console.log(`         ${p.padEnd(38)} ${b.reason}`);
  }
  const offen = abweisungen.filter((a) => a.blocked === false);
  const unklar = abweisungen.filter((a) => a.blocked === null);
  pruefe("P1", "Ohne Zugangsmittel abgewiesen — Seiten UND Datensatz",
    offen.length ? "FAIL" : unklar.length ? "SKIP" : "PASS",
    offen.length ? `offen: ${offen.map((o) => o.path).join(", ")}`
                 : unklar.length ? `unklar: ${unklar.map((o) => o.path + " (" + o.reason + ")").join("; ")}`
                 : "alle vier Pfade abgewiesen");

  if (!BYPASS) {
    for (const [id, label] of [["P2", "Datensatz traegt das ganze Universum"],
                               ["P3", "Jeder Titel ist aufrufbar (Stichprobe ueber alle Buendel)"],
                               ["P4", "Suche und Einzeltitel im Browser"],
                               ["P5", "Chart zeichnet echte Kerzen"],
                               ["P6", "Screener rechnet auf dem vollen Universum"],
                               ["P7", "390 px ohne Querlauf"],
                               ["P8", "Kein Schluessel im ausgelieferten Inhalt"],
                               ["P9", "Kein Strom vorgetaeuscht"]]) {
      pruefe(id, label, "SKIP", "ohne Bypass-Token nicht messbar");
    }
    return abschluss();
  }

  /* ----------------------------------------------------------- P2 */
  const metaRes = await hole(BASE + "/quant/data/proof/meta.json", { bypass: true });
  const indexRes = await hole(BASE + "/quant/data/proof/index.json", { bypass: true });
  let meta = null, index = null;
  try { meta = JSON.parse(metaRes.body); } catch (e) { /* bleibt null */ }
  try { index = JSON.parse(indexRes.body); } catch (e) { /* bleibt null */ }

  if (!meta || !index) {
    pruefe("P2", "Datensatz traegt das ganze Universum", "FAIL",
      `meta ${metaRes.status}/${metaRes.bytes} B, index ${indexRes.status}/${indexRes.bytes} B`);
  } else {
    bericht.universe = {
      securities: index.count, withFactors: index.withFactors,
      fields: index.fields.length, shards: index.shards,
      asOf: meta.asOf, dataSnapshotId: meta.dataSnapshotId,
      factorArtefact: meta.factorArtefact
    };
    bericht.chart = {
      historical: (meta.chart && meta.chart.historical && meta.chart.historical.scope) || [],
      intraday: meta.chart && meta.chart.intraday && meta.chart.intraday.status,
      realtime: meta.chart && meta.chart.realtime && meta.chart.realtime.status
    };
    /* Die Bilanz gegen sich selbst - keine Zahl von aussen. */
    const stimmig = index.count === meta.coverage.securities &&
                    index.tickers.length === index.count &&
                    index.withFactors === meta.coverage.withFactorRow;
    pruefe("P2", "Datensatz traegt das ganze Universum",
      stimmig && index.count > 5000 ? "PASS" : "FAIL",
      `${index.count} Titel, davon ${index.withFactors} mit Faktorzeile · Bilanz stimmig: ${stimmig}`);
  }

  /* ----------------------------------------------------------- P3
     Aufrufbar heisst: das Buendel des Titels liegt da und traegt ihn.
     Geprueft wird je Buendel ein Titel - so wird jedes einmal
     angefasst, ohne 5.683 Abrufe zu fahren. */
  if (index) {
    const proBuendel = new Map();
    for (let i = 0; i < index.tickers.length; i++) {
      const t = index.tickers[i];
      let h = 0;
      for (let k = 0; k < t.length; k++) h = (h * 31 + t.charCodeAt(k)) >>> 0;
      const s = h % index.shards;
      if (!proBuendel.has(s)) proBuendel.set(s, t);
    }
    let gefunden = 0, fehlend = [];
    for (const [shard, ticker] of proBuendel) {
      const r = await hole(`${BASE}/quant/data/proof/rows/${shard}.json`, { bypass: true });
      let ok = false;
      try { ok = !!JSON.parse(r.body).rows[ticker]; } catch (e) { ok = false; }
      if (ok) gefunden++; else fehlend.push(`${ticker} (Buendel ${shard})`);
    }
    pruefe("P3", "Jeder Titel ist aufrufbar (Stichprobe ueber alle Buendel)",
      fehlend.length ? "FAIL" : "PASS",
      `${gefunden} von ${proBuendel.size} Buendeln liefern ihren Titel` +
      (fehlend.length ? ` · fehlend: ${fehlend.slice(0, 5).join(", ")}` : ""));
  }

  /* ----------------------------------------------------------- P8
     Der Schluessel. Geprueft am ausgelieferten Text, nicht am Quellbaum. */
  const funde = [];
  for (const pfad of ["/universe/", "/universe/ui/proof.js", "/universe/stock/app.js",
                      "/universe/screener/app.js", "/quant/data/proof/meta.json"]) {
    const r = await hole(BASE + pfad, { bypass: true });
    for (const m of SCHLUESSELMUSTER) {
      if (m.re.test(r.body || "")) funde.push(`${pfad}: ${m.id}`);
    }
  }
  pruefe("P8", "Kein Schluessel im ausgelieferten Inhalt", funde.length ? "FAIL" : "PASS",
    funde.length ? funde.join(", ") : "fuenf Dateien geprueft");

  /* ----------------------------------------------------- Browser */
  let chromium = null;
  try { ({ chromium } = await import("playwright")); } catch (e) { chromium = null; }
  if (!chromium || !index) {
    for (const [id, label] of [["P4", "Suche und Einzeltitel im Browser"],
                               ["P5", "Chart zeichnet echte Kerzen"],
                               ["P6", "Screener rechnet auf dem vollen Universum"],
                               ["P7", "390 px ohne Querlauf"],
                               ["P9", "Kein Strom vorgetaeuscht"]]) {
      pruefe(id, label, "SKIP", chromium ? "kein Datensatz" : "kein Browser installiert");
    }
    return abschluss();
  }

  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const ergebnisse = { P4: [], P5: [], P6: [], P7: [], P9: [] };

  /* Ein zufaelliger Titel aus dem ausgelieferten Verzeichnis - nicht
     einer aus einer Beispielliste. Genau darum geht es: nicht die fuenf
     bekannten, sondern irgendeiner der Tausenden. */
  const zufall = index.tickers[Math.floor(Math.random() * index.tickers.length)];
  const mitChart = (bericht.chart.historical || [])[0] || null;

  for (const vp of [{ name: "desktop", width: 1440, height: 960 },
                    { name: "mobile", width: 390, height: 844 }]) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      extraHTTPHeaders: { "x-vercel-protection-bypass": BYPASS }
    });
    const page = await ctx.newPage();
    let stroeme = 0;
    page.on("websocket", () => { stroeme++; });

    // P4 — Suche und Einzeltitel
    try {
      await page.goto(BASE + "/universe/", { waitUntil: "domcontentloaded", timeout: TIMEOUT });
      await page.waitForSelector(".q-table tbody tr", { timeout: TIMEOUT });
      const gezaehlt = (await page.locator(".u-count b").innerText()).replace(/\D/g, "");
      await page.fill("#u-q", zufall);
      await page.waitForTimeout(400);
      await page.locator(".q-table tbody tr td a").first().click();
      await page.waitForSelector("h1.q-h1", { timeout: TIMEOUT });
      const titel = await page.locator("h1.q-h1").innerText();
      const inhalt = await page.locator("#q-main").innerText();
      const ok = titel === zufall && parseInt(gezaehlt, 10) === index.count &&
                 /Datenstatus/.test(inhalt);
      ergebnisse.P4.push(`${vp.name}: Suche ${zufall} → Seite ${titel}, gezaehlt ${gezaehlt}` + (ok ? "" : " FEHLER"));
      await page.screenshot({ path: join(SHOTS, `${vp.name}-stock.png`), fullPage: false });
      if (!ok) ergebnisse.P4.push(`${vp.name}: FEHLGESCHLAGEN`);
    } catch (err) { ergebnisse.P4.push(`${vp.name}: ${String(err.message).slice(0, 120)}`); }

    // P5 — Chart
    if (mitChart) {
      try {
        await page.goto(`${BASE}/universe/stock/?ticker=${mitChart}`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
        await page.waitForSelector(".q-chart-wrap svg", { timeout: TIMEOUT });
        const box = await page.locator(".q-chart-wrap svg").first().boundingBox();
        const kerzen = await page.locator(".q-chart-wrap svg rect").count();
        const passt = box && box.width <= vp.width && box.width > 200 && kerzen > 20;
        ergebnisse.P5.push(`${vp.name}: ${mitChart} ${box ? Math.round(box.width) + "x" + Math.round(box.height) : "kein svg"}, ${kerzen} Kerzen` + (passt ? "" : " FEHLER"));
        await page.screenshot({ path: join(SHOTS, `${vp.name}-chart.png`), fullPage: false });
      } catch (err) { ergebnisse.P5.push(`${vp.name}: ${String(err.message).slice(0, 120)}`); }
    }

    // P6 — Screener
    try {
      await page.goto(BASE + "/universe/screener/", { waitUntil: "domcontentloaded", timeout: TIMEOUT });
      await page.waitForSelector(".q-section-head h2", { timeout: TIMEOUT });
      const erst = parseInt((await page.locator(".q-section-head h2").first().innerText()).replace(/\D/g, ""), 10);
      const felder = page.locator(".q-filter-row input.q-input");
      let zweit = null;
      if (await felder.count()) {
        await felder.first().fill("50");
        await felder.first().dispatchEvent("change");
        await page.waitForTimeout(600);
        zweit = parseInt((await page.locator(".q-section-head h2").first().innerText()).replace(/\D/g, ""), 10);
      }
      const ok = erst > 0 && erst < index.count && (zweit === null || zweit <= erst);
      ergebnisse.P6.push(`${vp.name}: ${erst} Treffer` + (zweit !== null ? ` → ${zweit} nach strengerer Regel` : "") + (ok ? "" : " FEHLER"));
      await page.screenshot({ path: join(SHOTS, `${vp.name}-screener.png`), fullPage: false });
    } catch (err) { ergebnisse.P6.push(`${vp.name}: ${String(err.message).slice(0, 120)}`); }

    // P7 — Querlauf
    for (const pfad of ["/universe/", "/universe/screener/", `/universe/stock/?ticker=${mitChart || zufall}`]) {
      try {
        await page.goto(BASE + pfad, { waitUntil: "networkidle", timeout: TIMEOUT });
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        ergebnisse.P7.push(`${vp.name} ${pfad}: ${over}px` + (over > 0 ? " FEHLER" : ""));
      } catch (err) { ergebnisse.P7.push(`${vp.name} ${pfad}: ${String(err.message).slice(0, 90)}`); }
    }

    ergebnisse.P9.push(`${vp.name}: ${stroeme} WebSocket-Verbindungen`);
    await ctx.close();
  }
  await browser.close();

  const hatFehler = (liste) => liste.some((z) => /FEHLER|FEHLGESCHLAGEN|Timeout|timeout/.test(z));
  pruefe("P4", "Suche und Einzeltitel im Browser", ergebnisse.P4.length && !hatFehler(ergebnisse.P4) ? "PASS" : "FAIL", ergebnisse.P4.join(" · "));
  pruefe("P5", "Chart zeichnet echte Kerzen", ergebnisse.P5.length && !hatFehler(ergebnisse.P5) ? "PASS" : mitChart ? "FAIL" : "SKIP", ergebnisse.P5.join(" · "));
  pruefe("P6", "Screener rechnet auf dem vollen Universum", ergebnisse.P6.length && !hatFehler(ergebnisse.P6) ? "PASS" : "FAIL", ergebnisse.P6.join(" · "));
  pruefe("P7", "390 px ohne Querlauf", ergebnisse.P7.length && !hatFehler(ergebnisse.P7) ? "PASS" : "FAIL", ergebnisse.P7.join(" · "));
  /* Kein Strom: die Seite darf keinen aufmachen, solange keiner belegt
     ist. Eine WebSocket-Verbindung waere hier genau die Behauptung, die
     der Bericht ausdruecklich nicht aufstellt. */
  const stroemeGesamt = ergebnisse.P9.reduce((n, z) => n + parseInt(z.replace(/\D/g, ""), 10), 0);
  pruefe("P9", "Kein Strom vorgetaeuscht",
    stroemeGesamt === 0 && bericht.chart.realtime !== "AVAILABLE" ? "PASS" : "FAIL",
    `${ergebnisse.P9.join(" · ")} · Realtime-Status im Datensatz: ${bericht.chart.realtime}`);

  /* ---------------------------------------------------------- P10
     Und die oeffentliche Auslieferung kennt den Nachweis nicht. */
  const oeffentlich = await hole(PAGES + "/universe/");
  pruefe("P10", "Auf GitHub Pages gibt es den Nachweis nicht",
    oeffentlich.ok && oeffentlich.status === 404 ? "PASS" : oeffentlich.ok ? "FAIL" : "SKIP",
    oeffentlich.ok ? `HTTP ${oeffentlich.status}` : oeffentlich.error);

  return abschluss();
}

function abschluss() {
  const fail = bericht.checks.filter((c) => c.status === "FAIL");
  const skip = bericht.checks.filter((c) => c.status === "SKIP");
  bericht.verdict = fail.length ? "FAILED" : skip.length ? "PARTIALLY_VERIFIED" : "PROOF_VERIFIED";
  bericht.verdictReason = fail.length
    ? `${fail.length} Pruefung(en) gescheitert: ${fail.map((c) => c.id).join(", ")}`
    : skip.length
      ? `${skip.length} Pruefung(en) uebersprungen: ${skip.map((c) => c.id).join(", ")} — ` +
        "ein uebersprungener Nachweis ist kein bestandener."
      : "alle Pruefungen belegt";

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "full-universe-proof-verification.json"),
    entschaerfe(JSON.stringify(bericht, null, 2)) + "\n");

  console.log(`\n  Urteil: ${bericht.verdict}`);
  console.log(`  ${bericht.verdictReason}\n`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const zeilen = [
      `## Full-Universe-Produktnachweis — ${bericht.verdict}`, "",
      bericht.verdictReason, "",
      `Vorschau: \`${BASE}\``, "",
      bericht.universe
        ? `Universum: **${bericht.universe.securities}** Titel, davon **${bericht.universe.withFactors}** ` +
          `mit Faktorzeile · Datenstand ${bericht.universe.asOf}` : "",
      bericht.chart ? `Chart: historisch ${bericht.chart.historical.length} Titel · ` +
        `intraday ${bericht.chart.intraday} · realtime ${bericht.chart.realtime}` : "", "",
      "| Nachweis | Frage | Ergebnis |", "|---|---|---|",
      ...bericht.checks.map((c) => `| ${c.id} | ${c.label} | ${c.status} |`)
    ];
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, zeilen.join("\n") + "\n", { flag: "a" });
  }

  process.exit(bericht.verdict === "FAILED" ? 1 : 0);
}

main().catch((err) => {
  console.error("\n  ABBRUCH: " + entschaerfe((err && err.stack) || err) + "\n");
  process.exit(1);
});
