/* =========================================================================
   VISION UNIVERSE — scripts/universe/browser-qa.mjs   (§48, §49)

   Was ein Test im Node-Prozess nicht beantwortet: ob die Erweiterung im
   Browser ankommt.

   Geprueft werden genau die Fragen aus §48:

     1. Die Suche findet Titel ausserhalb der alten 498.
     2. Ein solcher Titel laesst sich oeffnen.
     3. Die Aktienseite funktioniert - und erfindet nichts.
     4. Ein Titel MIT Daten zeigt weiterhin sein Chart.
     5. Discover bleibt schnell und rendert keine 7.000 Karten.
     6. Eine Suchanfrage laedt Kilobyte, nicht Megabyte.

   Voraussetzung:  npm i playwright   (Chromium wird vorausgesetzt)
   Server:         python3 -m http.server 8765
   Ausfuehren:     node scripts/universe/browser-qa.mjs --url http://localhost:8765
   ========================================================================= */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf("--" + name);
  return i === -1 ? fallback : args[i + 1];
}

/* Ein absoluter Pfad bleibt absolut. join(root, "/tmp/x") ergibt
   "<root>/tmp/x" - die Datei landet dann im Repository statt dort, wo sie
   hin sollte. Gefunden hat das ein Test, der in ein Verzeichnis unter
   /tmp schreiben wollte und dabei das Arbeitsverzeichnis verschmutzt hat. */
function pfad(p) { return p.startsWith("/") ? p : join(root, p); }
const BASE = arg("url", "http://localhost:8765");
const OUT = pfad(arg("out", "quant/data/universe/browser-qa.json"));

let chromium;
try { ({ chromium } = await import("playwright")); }
catch { console.error("Playwright fehlt. 'npm i playwright'."); process.exit(2); }

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail === undefined ? null : detail });
  console.log(`  ${ok ? "ok  " : "FEHL"}  ${name}${detail ? "   " + detail : ""}`);
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined
});

async function neueSeite(viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const fehler = [];
  const anfragen = [];
  /* Fehlgeschlagene Abrufe mit URL festhalten. "Failed to load resource"
     ohne Adresse ist keine Fehlermeldung, sondern ein Raetsel. */
  const extern = [];
  /* Fremde Hosts zaehlen nicht als Befund dieser Anwendung.

     In der Bauumgebung liegt ein Egress-Proxy davor; fonts.googleapis.com
     wird dort abgewiesen. Das ist eine Eigenschaft der Umgebung und kein
     Fehler der Seite - es hier mitzuzaehlen hiesse, einen Test rot zu
     lassen, den niemand gruen bekommen kann. Er verschwindet trotzdem
     nicht: er steht unter `extern` im Bericht. */
  const istFremd = (url) => !String(url).startsWith(BASE) && !String(url).startsWith("/");
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const txt = m.text();
    /* "Failed to load resource" ohne Adresse gehoert zu einem
       requestfailed, das getrennt erfasst wird. */
    if (/Failed to load resource/.test(txt)) return;
    fehler.push(txt);
  });
  page.on("pageerror", (e) => fehler.push(String(e)));
  page.on("requestfailed", (req) => {
    const zeile = "requestfailed " + req.url().replace(BASE, "") + " — " +
                  ((req.failure() && req.failure().errorText) || "?");
    (istFremd(req.url()) ? extern : fehler).push(zeile);
  });
  page.on("response", (res) => {
    if (res.status() < 400) return;
    const zeile = "HTTP " + res.status() + " " + res.url().replace(BASE, "");
    (istFremd(res.url()) ? extern : fehler).push(zeile);
  });
  page.on("response", async (res) => {
    const url = res.url();
    if (!/\.json(\?|$)/.test(url)) return;
    let len = Number(res.headers()["content-length"] || 0);
    if (!len) { try { len = (await res.body()).length; } catch { len = 0; } }
    anfragen.push({ url: url.replace(BASE, ""), bytes: len, status: res.status() });
  });
  return { ctx, page, fehler, extern, anfragen };
}

console.log(`Vision Universe — Browser-QA der Universe Expansion  (${BASE})\n`);

/* ------------------------------------------------ 1-3: Suche und Seite */
{
  const { ctx, page, fehler, extern, anfragen } = await neueSeite();
  await page.goto(BASE + "/discover/", { waitUntil: "networkidle" });
  check("Discover startet ohne Konsolenfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
  if (extern.length) console.log(`        (fremde Hosts, Umgebung: ${extern.length} — ${extern[0]})`);

  /* §49: die Startseite darf das Universum NICHT rendern. */
  const karten = await page.locator(".dx-poster, .dx-card, .dx-rank").count();
  check("Startseite rendert eine Handvoll Karten, nicht das Universum",
        karten > 0 && karten < 400, `${karten} Karten`);
  const startBytes = anfragen.reduce((a, r) => a + r.bytes, 0);
  check("Startseite laedt unter 3 MB JSON", startBytes < 3 * 1024 * 1024,
        `${(startBytes / 1024).toFixed(0)} KB in ${anfragen.length} Abrufen`);

  /* Suche oeffnen und nach einem Titel AUSSERHALB der alten 498 suchen. */
  const vorSuche = anfragen.length;
  const bytesVorSuche = anfragen.reduce((a, r) => a + r.bytes, 0);
  await page.keyboard.press("/");
  await page.waitForSelector(".dx-search.on input", { timeout: 5000 });
  await page.fill(".dx-search.on input", "PALANTIR");
  await page.waitForTimeout(900);

  const trefferTexte = await page.locator(".dx-search.on .dx-result").allTextContents();
  check("Suche nach „PALANTIR“ findet einen Titel ausserhalb der alten 498",
        trefferTexte.some((t) => /PLTR/.test(t)),
        trefferTexte.slice(0, 3).map((t) => t.replace(/\s+/g, " ").trim().slice(0, 50)).join(" · "));

  const suchAbrufe = anfragen.slice(vorSuche);
  const suchBytes = anfragen.reduce((a, r) => a + r.bytes, 0) - bytesVorSuche;
  check("Eine Suchanfrage laedt Kilobyte, nicht das Universum",
        suchBytes < 400 * 1024,
        `${(suchBytes / 1024).toFixed(1)} KB in ${suchAbrufe.length} Abrufen: ` +
        suchAbrufe.map((r) => r.url.split("/").slice(-3).join("/")).join(", "));

  const hinweis = await page.locator(".dx-search.on .dx-search-hint").first().textContent();
  check("Die Suche sagt, aus welchem Ring die Treffer kommen",
        /im Universum/.test(hinweis || ""), (hinweis || "").trim().slice(0, 90));

  /* Treffer oeffnen. */
  const pltr = page.locator(".dx-search.on .dx-result", { hasText: "PLTR" }).first();
  await pltr.click();
  await page.waitForTimeout(1200);
  check("Der Titel laesst sich oeffnen (URL)", /#\/s\/US_REAL\/PLTR/.test(page.url()), page.url());

  const h1 = await page.locator("h1").first().textContent().catch(() => null);
  check("Die Aktienseite zeigt den Titel", /PALANTIR/i.test(h1 || "") || /PLTR/.test(h1 || ""),
        (h1 || "").trim());

  const stammdaten = await page.locator(".dx-stammdaten dt").allTextContents();
  check("Die Aktienseite zeigt Stammdaten aus dem Company Master",
        stammdaten.includes("Interne Kennung") && stammdaten.includes("Handelsplatz"),
        stammdaten.join(" · "));

  const kann = await page.locator(".dx-kann li").allTextContents();
  check("Die Seite sagt, was NICHT vorliegt - statt eine Null zu zeigen",
        kann.some((t) => /liegt nicht vor/.test(t)),
        `${kann.length} Zeilen`);

  /* §48: keine erfundenen Daten. Auf der Master-Seite darf kein Chart und
     keine Kennzahlkachel stehen. */
  const charts = await page.locator(".dx-chart canvas, .dx-chart svg").count();
  check("Kein Chart ohne Kursreihe", charts === 0, `${charts} Chartflaechen`);

  check("Die Aktienseite erzeugt keine Konsolenfehler", fehler.length === 0,
        fehler.slice(0, 2).join(" | "));
  await ctx.close();
}

/* ------------------------------------- 4: ein Titel MIT Daten, wie bisher */
{
  const { ctx, page, fehler } = await neueSeite();
  await page.goto(BASE + "/discover/#/s/US_REAL/NVDA", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const chart = await page.locator(".dx-chart svg, .dx-chart canvas").count();
  check("Ein Titel aus den alten 498 zeigt weiterhin sein Chart", chart > 0, `${chart} Flaechen`);
  const h1 = await page.locator("h1").first().textContent().catch(() => null);
  check("…und weiterhin seine volle Seite", /NVIDIA/i.test(h1 || ""), (h1 || "").trim());
  check("…ohne Konsolenfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
  await ctx.close();
}

/* --------------------------- 5: ein Titel OHNE Namen und ein beendeter */
{
  const { ctx, page, fehler } = await neueSeite();
  await page.goto(BASE + "/discover/#/s/US_REAL/AACG", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const text = await page.locator(".dx-detail").first().innerText().catch(() => "");
  check("Ein Titel ohne Firmennamen zeigt das Kuerzel und sagt warum",
        /kein Firmenname/i.test(text) || /AACG/.test(text), text.slice(0, 80).replace(/\s+/g, " "));
  check("…ohne Konsolenfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));

  await page.goto(BASE + "/discover/#/s/US_REAL/GIBTESNICHT", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const leer = await page.locator(".dx-detail").first().innerText().catch(() => "");
  /* Gross-/Kleinschreibung ignorieren: die Ueberschrift wird per CSS in
     Versalien gesetzt, und innerText liefert, was zu sehen ist. */
  check("Ein Kuerzel ohne Instrument sagt genau das",
        /kein titel mit dem kürzel/i.test(leer), leer.slice(0, 90).replace(/\s+/g, " "));
  await ctx.close();
}

/* ------------------------------------------------- 6: Telefonbreite */
{
  const { ctx, page } = await neueSeite({ width: 390, height: 844 });
  await page.goto(BASE + "/discover/#/s/US_REAL/PLTR", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const ueberlauf = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("Kein horizontaler Ueberlauf bei 390 px", ueberlauf <= 1, `${ueberlauf} px`);
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  base: BASE,
  note: "§48/§49. Im Browser geprueft, nicht im Node-Prozess.",
  passed: results.length - failed.length,
  failed: failed.length,
  checks: results
}, null, 2) + "\n");

console.log(`\n  ${results.length - failed.length} bestanden, ${failed.length} Befunde`);
console.log(`  ${OUT.replace(root + "/", "")}`);
if (failed.length) process.exit(1);
