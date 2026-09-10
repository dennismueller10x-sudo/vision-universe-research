/* =========================================================================
   VISION UNIVERSE — preview-dataset.test.mjs

   DER VORSCHAUDATENSATZ UND SEINE TRENNUNG

   Zwei Auslieferungen aus einem Repository: GitHub Pages oeffentlich,
   Vercel geschuetzt. Die Trennung haelt nur, solange der reichere
   Datensatz zur BAUZEIT entsteht und nie im Repository landet. Genau das
   pruefen die Tests hier - und dazu die Unterscheidung, auf der alles
   steht:

     ABGELEITETES UNIVERSUM   Zustaende und Zaehlungen je Titel
     KURSHISTORIEN-BESTAND    rund 7,4 GB Kursreihen - NICHT ausgeliefert

   Wer die beiden verwechselt, behauptet einen Bestand, den es nicht gibt.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function baue(outDir) {
  execFileSync(process.execPath,
    [join(root, "scripts/preview/build-preview-dataset.mjs"), "--out", outDir],
    { encoding: "utf8", cwd: root });
  return JSON.parse(readFileSync(join(outDir, "universe.json"), "utf8"));
}

test("PD1 — der Datensatz traegt alle 5.684 Titel und echte Historie ausserhalb der Golden Five", () => {
  const d = baue(mkdtempSync(join(tmpdir(), "vu-pd-")));

  assert.equal(d.kind, "DERIVED_UNIVERSE");
  assert.equal(d.rows.length, 5684, "alle Titel des Universums muessen auffindbar sein");

  /* Der Kern der Anforderung: Titel ausserhalb des Canary sind
     auffindbar UND tragen belegte Werte, nicht nur einen Namen. */
  const canary = new Set(["AAPL", "MSFT", "NVDA", "JPM", "XOM"]);
  const echt = d.rows.filter((r) => !canary.has(r.ticker) && r.bars > 0 && r.historyFrom);
  assert.ok(echt.length > 3000,
    `nur ${echt.length} Titel ausserhalb des Canary mit belegter Historie`);

  /* Stichprobe: ein bekannter Titel, der nicht zu den Golden Five zaehlt. */
  const orcl = d.rows.find((r) => r.ticker === "ORCL");
  assert.ok(orcl, "ORCL muss im Universum sein");
  assert.ok(orcl.bars > 5000, "ORCL muss eine belegte Historie tragen");
  assert.equal(orcl.isMock, false);
  assert.ok(["TOTAL_RETURN", "SPLIT_ADJUSTED", "UNKNOWN"].includes(orcl.adjustment));

  /* Kein Titel darf als Mock durchgehen - das ist der Unterschied zur
     oeffentlichen Seite. */
  assert.equal(d.rows.filter((r) => r.isMock).length, 0);
});

test("PD2 — abgeleitetes Universum und Kurshistorien-Bestand sind unterschieden", () => {
  const d = baue(mkdtempSync(join(tmpdir(), "vu-pd-")));
  const u = d.datasetScope;

  assert.equal(u.derivedUniverse.status, "PRESENT");
  assert.equal(u.derivedUniverse.securities, 5684);

  /* Die Aussage, auf die es ankommt: der grosse Bestand ist NICHT da,
     und der Datensatz sagt das von sich aus. */
  assert.equal(u.fullHistoricalOhlcvStore.status, "NOT_DEPLOYED");
  assert.match(u.fullHistoricalOhlcvStore.approximateSize, /7\.4 GB/);
  assert.equal(u.priceLevels.status, "WITHHELD_REDISTRIBUTION");
});

test("PD3 — kein Kursniveau und keine Kursreihe im Datensatz", () => {
  const d = baue(mkdtempSync(join(tmpdir(), "vu-pd-")));
  const text = JSON.stringify(d);

  /* Genau die Formen, die ein Kurs annehmen wuerde. */
  assert.ok(!/"price":\s*[0-9]/.test(text), "ein Kursniveau ist im Datensatz");
  assert.ok(!/"close":\s*[0-9]/.test(text), "ein Schlusskurs ist im Datensatz");
  assert.ok(!/"open":\s*[0-9]/.test(text));
  assert.ok(!/"bars":\s*\[/.test(text), "eine Kursreihe ist im Datensatz");
  assert.ok(!/"sma200":\s*[0-9]/.test(text), "ein SMA-Kursniveau ist im Datensatz");
  assert.ok(!/"high52w":\s*[0-9]/.test(text));

  /* "bars" als ZAHL ist erlaubt und erwuenscht - das ist eine Zaehlung,
     kein Kurs. Die Gegenprobe stellt sicher, dass die Pruefung oben
     nicht einfach alles verbietet. */
  assert.ok(/"bars":\s*[0-9]+/.test(text), "die Bar-ZAHL muss vorhanden sein");
});

test("PD4 — was fehlt, sagt der Datensatz selbst", () => {
  const d = baue(mkdtempSync(join(tmpdir(), "vu-pd-")));

  /* Die Faktorzeilen je Titel starben mit der Arbeitsablage. Der
     Datensatz darf das nicht als leeres Feld tarnen. */
  const ohneFaktoren = d.rows.filter((r) => r.factorsStatus === "NOT_IN_DELIVERED_ARTEFACTS");
  assert.ok(ohneFaktoren.length > 5000, "die fehlenden Faktoren muessen benannt sein");
  assert.equal(d.coverage.withFactorRow, 5, "nur der Canary hat Faktorzeilen");

  /* Titel ohne eigene Qualitaetszeile sind sauber durchgelaufen - nicht
     "unbekannt". Der Unterschied steht im Feld. */
  const nichtEinzeln = d.rows.filter((r) => r.dataQuality === "PASS_NOT_ITEMISED");
  assert.ok(nichtEinzeln.length > 2000);
  assert.match(nichtEinzeln[0].dataQualityReason, /Detailgrenze|§26|nicht einzeln/i);

  /* Firmenname und Sektor fehlen im Zugang - ausgewiesen, nicht geraten. */
  assert.ok(d.rows.some((r) => r.nameStatus === "SOURCE_MISSING"));
  assert.ok(d.rows.every((r) => r.name === null || typeof r.name === "string"));
  assert.ok(!d.rows.some((r) => r.name === r.ticker),
    "der Ticker darf nicht als Firmenname ausgegeben werden");
});

test("PD5 — die Screener-Zaehlungen sind echt und vollstaendig, die Namenslisten gekuerzt", () => {
  const d = baue(mkdtempSync(join(tmpdir(), "vu-pd-")));
  assert.equal(d.screenerQuestions.length, 18);

  const ueberSMA200 = d.screenerQuestions.find((q) => q.id === "aboveSMA200");
  assert.equal(ueberSMA200.matched, 2926, "die Zaehlung stammt aus dem echten Lauf");
  assert.equal(ueberSMA200.evaluatedOf, 5639);

  /* Die Kuerzung wird ausgewiesen. Eine Liste mit 50 Namen neben einer
     Zahl von 2.926 waere sonst irrefuehrend. */
  assert.equal(ueberSMA200.tickersTruncated, true);
  assert.match(ueberSMA200.tickersNote, /gekuerzt/);
  assert.ok(ueberSMA200.tickers.length <= 50);
});

test("PD6 — Datensatz und Ansicht landen nie im Repository", () => {
  /* Das ist die Zusicherung "GitHub Pages bleibt unveraendert": die
     reichen Dateien entstehen zur Bauzeit und sind ignoriert. */
  for (const pfad of ["quant/data/preview/universe.json", "preview-universe/index.html"]) {
    /* git check-ignore endet mit 1, wenn der Pfad NICHT ignoriert wird.
       Der Wurf ist hier der Befund - also ausdruecklich fangen und als
       Fehlschlag melden, statt ihn durchschlagen zu lassen. */
    let ignoriert = true;
    try {
      execFileSync("git", ["check-ignore", "-q", pfad],
        { cwd: root, stdio: ["ignore", "ignore", "ignore"] });
    } catch (err) { ignoriert = false; }
    assert.ok(ignoriert,
      `${pfad} ist NICHT ignoriert - damit landete er auf GitHub Pages`);
  }
  /* Und sie sind nicht versioniert. */
  const verfolgt = execFileSync("git", ["ls-files", "quant/data/preview", "preview-universe"],
    { cwd: root, encoding: "utf8" }).trim();
  assert.equal(verfolgt, "", `versionierte Bauzeit-Dateien: ${verfolgt}`);
});

test("PD7 — die Vercel-Konfiguration baut den Datensatz und schliesst die Arbeitsablage aus", () => {
  const v = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
  assert.match(v.buildCommand, /build-preview-dataset\.mjs/,
    "ohne diesen Schritt bekaeme Vercel dieselbe Mock-Seite wie Pages");
  assert.equal(v.framework, null);

  const kopf = v.headers.find((h) => h.source === "/(.*)");
  assert.ok(kopf.headers.some((k) => k.key === "X-Robots-Tag" && /noindex/.test(k.value)),
    "eine geschuetzte Vorschau gehoert nicht in einen Suchindex");

  const ignoriert = readFileSync(join(root, ".vercelignore"), "utf8");
  assert.match(ignoriert, /^\.market-cache$/m,
    "die Arbeitsablage mit den Kursreihen darf nie in eine Auslieferung");
  assert.match(ignoriert, /^preview$/m,
    "das eigene Schloss bleibt draussen - Vercel schuetzt ueber seine Zugangsschicht");
});

test("PD8 — keine oeffentliche Datei wurde fuer die Vorschau veraendert", () => {
  /* research.visionuniverse.de soll unveraendert bleiben. Geprueft wird
     der Diff gegen main: die Vorschau darf nur HINZUFUEGEN, nie an
     Seiten, Skripten oder Daten der oeffentlichen Auslieferung ruehren. */
  let diff = "";
  try {
    diff = execFileSync("git", ["diff", "--name-only", "origin/main...HEAD"],
      { cwd: root, encoding: "utf8" }).trim();
  } catch (err) { return; }               /* kein origin/main: dann nichts zu pruefen */
  if (!diff) return;

  const oeffentlich = diff.split("\n").filter((f) =>
    /^(index\.html|dashboard\/|quant\/(?!data\/preview)(?!tests\/).*\.(html|js)$|morning\/|etf\/|news\/|macro\/)/.test(f));
  assert.deepEqual(oeffentlich, [],
    `diese oeffentlichen Dateien wurden veraendert: ${oeffentlich.join(", ")}`);

  /* Und die Freigabeschalter sind unangetastet. */
  const gates = JSON.parse(readFileSync(join(root, "quant/config/feature-gates.json"), "utf8"));
  assert.equal(gates.gates.ENABLE_PUBLIC_LIVE_MARKET_DATA.enabled, false);
  assert.equal(gates.gates.ENABLE_LIVE_MARKET_DATA.enabled, false);
});
