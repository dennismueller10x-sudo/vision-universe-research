/* =========================================================================
   VISION UNIVERSE — product-proof.test.mjs

   DER PRODUKTNACHWEIS AUF DEM VOLLEN UNIVERSUM

   Die Vorschau (preview-dataset.test.mjs) prueft die INTERNE Ansicht:
   eine Tabelle, die zeigt, was gemessen wurde. Hier geht es um die
   andere Frage - laeuft das BEKANNTE PRODUKT auf dem ganzen Markt?

   Drei Zusagen, und jede wird gemessen statt behauptet:

     1  Jeder ausgelieferte Titel ist suchbar UND aufrufbar.
     2  Die Oberflaeche ist die bestehende: sie laedt quant.css, shell.js,
        components.js und charts.js - und veraendert keine Datei darunter.
     3  Was fehlt, sagt warum. Keine Null an der Stelle einer Aussage,
        kein simulierter Chart an der Stelle eines Stroms.

   KEINE GEMESSENE ZAHL IM PRUEFCODE. Universumsgroesse und Zeilenzahl
   aendern sich mit jedem Lauf; hier stehen Beziehungen und Untergrenzen.
   Genau diese Verwechslung hat auf dem Vorschauzweig schon vier Tests
   fehlschlagen lassen.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = join(root, "_proof-src", "universe");

/* Dieser Zweig ist eine INTEGRATIONSVORSCHAU: er fuehrt die VU2-Arbeit
   von Astra/Codex zusammen, ohne sie zu veraendern. Ein Diff gegen main
   enthaelt deshalb zwangslaeufig deren Dateien - sie stammen aus dem
   Merge, nicht aus dieser Arbeit.

   Die Zusage, die hier zaehlt, bleibt trotzdem pruefbar: eine Datei gilt
   als UNVERAENDERT, wenn ihr Blob identisch mit dem des gemergten
   Zweiges ist. Wer eine davon anfasst, faellt weiter auf. */
function ausFremdemZweig(datei) {
  const zweige = ["origin/workstream/vu2-strategy-workspace", "origin/workstream/vu2-eod-gates"];
  let hier;
  try {
    hier = execFileSync("git", ["rev-parse", `HEAD:${datei}`], { cwd: root, encoding: "utf8" }).trim();
  } catch (err) { return false; }
  return zweige.some((zweig) => {
    try {
      return execFileSync("git", ["rev-parse", `${zweig}:${datei}`],
        { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() === hier;
    } catch (err) { return false; }
  });
}


/* Einmal bauen, von allen Tests gelesen. Der Bau haengt am
   Vorschaudatensatz - der entsteht selbst zur Bauzeit und liegt in CI
   nicht vor, also wird er hier zuerst erzeugt. Beides in temporaere
   Verzeichnisse: ein Test, der in den Arbeitsbaum schreibt, hinterlaesst
   genau die Dateien, deren Abwesenheit er spaeter prueft. */
let gebaut = null;
function baue() {
  if (gebaut) return gebaut;
  const vorschau = mkdtempSync(join(tmpdir(), "vu-pp-vorschau-"));
  execFileSync(process.execPath,
    [join(root, "scripts/preview/build-preview-dataset.mjs"), "--out", vorschau],
    { encoding: "utf8", cwd: root });

  const daten = mkdtempSync(join(tmpdir(), "vu-pp-daten-"));
  const seite = mkdtempSync(join(tmpdir(), "vu-pp-seite-"));
  execFileSync(process.execPath, [
    join(root, "scripts/proof/build-product-proof.mjs"),
    "--in", join(vorschau, "universe.json"),
    "--out", daten, "--site", join(seite, "universe")
  ], { encoding: "utf8", cwd: root });

  const lies = (p) => JSON.parse(readFileSync(join(daten, p), "utf8"));
  gebaut = {
    daten, seite: join(seite, "universe"),
    quelle: JSON.parse(readFileSync(join(vorschau, "universe.json"), "utf8")),
    meta: lies("meta.json"),
    index: lies("index.json"),
    buendel: readdirSync(join(daten, "rows")).map((n) => lies(join("rows", n)))
  };
  return gebaut;
}

const seitenQuelle = (datei) => readFileSync(join(src, datei), "utf8");

test("PP1 — jeder ausgelieferte Titel ist suchbar und aufrufbar", () => {
  const b = baue();

  /* Die Beziehung, nicht die Zahl: das Verzeichnis traegt genau das
     Universum, das der Vorschaudatensatz traegt - und der wiederum das
     des Gate-Artefakts (PD1). */
  assert.equal(b.index.count, b.quelle.rows.length,
    "das Verzeichnis muss jeden Titel des Universums fuehren");
  assert.equal(b.index.tickers.length, b.index.count);
  assert.ok(b.index.count > 5000,
    `nur ${b.index.count} Titel - das Universum ist zusammengeschrumpft`);

  /* Suchbar allein genuegt nicht. Ein Treffer, der keine Seite oeffnet,
     ist eine Sackgasse - deshalb wird JEDER Titel in seinem Buendel
     nachgeschlagen, nicht eine Stichprobe. */
  const nachTicker = new Map();
  for (const b2 of b.buendel) for (const t of Object.keys(b2.rows)) nachTicker.set(t, b2.rows[t]);
  const fehlend = b.index.tickers.filter((t) => !nachTicker.has(t));
  assert.deepEqual(fehlend.slice(0, 10), [],
    `${fehlend.length} Titel sind suchbar, aber nicht aufrufbar`);
  assert.equal(nachTicker.size, b.index.count,
    "die Buendel duerfen keinen Titel zusaetzlich oder doppelt fuehren");

  /* Und es ist nicht die bekannte Auswahl: Titel weit ausserhalb der
     Golden Five tragen belegte Werte. */
  const canary = new Set(["AAPL", "MSFT", "NVDA", "JPM", "XOM"]);
  const fremde = b.index.tickers.filter((t) => !canary.has(t) && nachTicker.get(t).bars > 0);
  assert.ok(fremde.length > 3000,
    `nur ${fremde.length} Titel ausserhalb des Canary mit belegter Historie`);
});

test("PP2 — Browser und Bauskript streuen die Buendel gleich", () => {
  const b = baue();

  /* Zwei Implementierungen derselben Regel sind eine Fehlerquelle: geht
     eine auseinander, sieht es aus wie ein fehlender Titel und nicht wie
     ein Rechenfehler. Die Regel aus proof.js wird hier tatsaechlich
     ausgefuehrt, nicht nachgebaut. */
  const quelle = seitenQuelle("ui/proof.js");
  const treffer = quelle.match(/function shardOf\(ticker\) \{[\s\S]*?\n  \}/);
  assert.ok(treffer, "shardOf fehlt in proof.js");
  const shardOf = new Function("SHARDS", `${treffer[0]}; return shardOf;`)(b.index.shards);

  for (const buendel of b.buendel) {
    for (const ticker of Object.keys(buendel.rows)) {
      assert.equal(shardOf(ticker), buendel.shard,
        `${ticker} liegt in Buendel ${buendel.shard}, der Browser sucht in ${shardOf(ticker)}`);
    }
  }
});

test("PP3 — kein Kursniveau und keine Kursreihe im Nachweis", () => {
  const b = baue();

  /* Dieselbe Grenze wie im Vorschaudatensatz (§34): ausgeliefert werden
     Zustaende, Abstaende und Renditen - nie ein Kurs.

     EINE ZEICHENKETTENSUCHE REICHT DAFUER NICHT, und der erste Versuch
     ist genau daran gescheitert: "sma20" steht sehr wohl in meta.json -
     als Deckungsbilanz ({CALCULATED: n, INSUFFICIENT_HISTORY: m}) und im
     fieldStatus als WITHHELD_REDISTRIBUTION. Beides ist die Angabe, DASS
     der Wert fehlt, und damit genau richtig. Verboten ist die ZAHL an
     dieser Stelle. Geprueft wird deshalb die Struktur: unter einem
     Kursnamen darf nie ein Zahlenwert stehen. */
  const kursnamen = new Set(["sma20", "sma50", "sma100", "sma200", "high52w", "low52w",
                             "lastClose", "close", "adjustedClose", "open", "high", "low",
                             "price", "marketCap"]);
  const funde = [];
  function pruefe(wert, pfad) {
    if (Array.isArray(wert)) { wert.forEach((w, i) => pruefe(w, `${pfad}[${i}]`)); return; }
    if (!wert || typeof wert !== "object") return;
    for (const [k, v] of Object.entries(wert)) {
      if (kursnamen.has(k) && typeof v === "number") funde.push(`${pfad}.${k} = ${v}`);
      pruefe(v, `${pfad}.${k}`);
    }
  }
  pruefe(b.meta, "meta");
  pruefe(b.index, "index");
  for (const x of b.buendel) pruefe(x, `rows/${x.shard}`);
  assert.deepEqual(funde.slice(0, 10), [], `Kursniveaus im Nachweis: ${funde.length}`);

  /* Und keine Kursreihe: eine Liste von Bars waere der ganze Bestand
     durch die Hintertuer. */
  for (const x of b.buendel) {
    for (const zeile of Object.values(x.rows)) {
      assert.ok(!Array.isArray(zeile.bars), `${zeile.ticker} traegt eine Kursreihe`);
    }
  }

  /* Die Bilanz sagt es ausserdem von sich aus. */
  assert.equal(b.meta.datasetScope.priceLevels.status, "WITHHELD_REDISTRIBUTION");
  assert.equal(b.meta.datasetScope.fullHistoricalOhlcvStore.status, "NOT_DEPLOYED");
});

test("PP4 — fehlende Werte sind ausgewiesen, nicht still", () => {
  const b = baue();
  const zeilen = [].concat(...b.buendel.map((x) => Object.values(x.rows)));

  const ohne = zeilen.filter((z) => z.factorsStatus !== "PRESENT");
  const mit = zeilen.filter((z) => z.factorsStatus === "PRESENT");
  assert.ok(mit.length > 5000, `nur ${mit.length} Titel mit Faktorzeile`);
  assert.equal(mit.length, b.index.hasFactors.filter((x) => x === 1).length,
    "das Verzeichnis muss dieselbe Deckung melden wie die Buendel");

  for (const z of ohne) {
    assert.equal(z.factorsStatus, "NOT_IN_DELIVERED_ARTEFACTS",
      `${z.ticker} hat keine Faktoren und sagt nicht warum`);
    assert.equal(z.factors, null, `${z.ticker} traegt einen Ersatzwert statt einer Luecke`);
  }

  /* Die Spalten duerfen fuer diese Titel nichts vortaeuschen: eine 0 in
     einer Zahlenspalte liest sich wie eine Messung. */
  const ohneIndex = b.index.tickers
    .map((t, i) => (b.index.hasFactors[i] ? -1 : i)).filter((i) => i >= 0);
  for (const i of ohneIndex.slice(0, 50)) {
    assert.equal(b.index.columns["returns.12M"][i], null,
      `${b.index.tickers[i]} traegt eine Rendite ohne Faktorzeile`);
    assert.equal(b.index.columns.priceAboveSMA200[i], null);
  }
});

test("PP5 — die Oberflaeche ist die bestehende und veraendert sie nicht", () => {
  const seiten = ["index.html", "screener/index.html", "stock/index.html"];
  for (const s of seiten) {
    const html = seitenQuelle(s);
    for (const abhaengigkeit of ["/quant/ui/quant.css", "/quant/ui/shell.js",
                                 "/quant/ui/components.js", "/quant/ui/charts.js"]) {
      assert.ok(html.includes(abhaengigkeit),
        `${s} bindet ${abhaengigkeit} nicht ein - das waere ein zweites Designsystem`);
    }
    assert.ok(html.includes("vu-navigation"), `${s} ohne Vision-Universe-Navigation`);
    assert.match(html, /noindex, nofollow/, `${s} gehoert nicht in einen Suchindex`);
  }

  /* Die harte Zusage: keine Datei der bestehenden Anwendung wurde
     angefasst. Ohne origin/main gibt es nichts zu vergleichen - dann
     schweigt der Test, statt eine Zusicherung zu erfinden. */
  let diff = "";
  try {
    diff = execFileSync("git", ["diff", "--name-only", "origin/main...HEAD"],
      { cwd: root, encoding: "utf8" }).trim();
  } catch (err) { return; }
  if (!diff) return;

  const angefasst = diff.split("\n").filter((f) =>
    /^quant\/(ui|engines|stock|screener|ranking|markt|radar|watchlist|technical|ai|api|methodology|strategies|backtests)\//.test(f) ||
    f === "quant/app.js" || f === "quant/index.html" ||
    /^assets\//.test(f) || f === "index.html")
    .filter((f) => !ausFremdemZweig(f));
  assert.deepEqual(angefasst, [],
    `der Nachweis hat bestehende Produktdateien veraendert: ${angefasst.join(", ")}`);
});

test("PP6 — die Ausgabe entsteht zur Bauzeit und wird nie committet", () => {
  for (const pfad of ["quant/data/proof/index.json", "universe/index.html"]) {
    let ignoriert = true;
    try {
      execFileSync("git", ["check-ignore", "-q", pfad],
        { cwd: root, stdio: ["ignore", "ignore", "ignore"] });
    } catch (err) { ignoriert = false; }
    assert.ok(ignoriert, `${pfad} ist NICHT ignoriert - damit landete er auf GitHub Pages`);
  }
  const verfolgt = execFileSync("git", ["ls-files", "quant/data/proof", "universe"],
    { cwd: root, encoding: "utf8" }).trim();
  assert.equal(verfolgt, "", `versionierte Bauzeit-Dateien: ${verfolgt}`);

  /* Und Vercel baut ihn wirklich - sonst faende die Seite dort dieselbe
     Leere wie auf Pages. Gelesen aus dem Baubefehl, nicht abgeschrieben. */
  const v = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
  assert.match(v.buildCommand, /build-product-proof\.mjs/,
    "ohne diesen Schritt gibt es den Produktnachweis in der Vorschau nicht");
  assert.match(v.buildCommand, /build-preview-dataset\.mjs[\s\S]*build-product-proof\.mjs/,
    "der Produktnachweis liest den Vorschaudatensatz - er muss danach laufen");

  /* Die Quelle der Oberflaeche traegt einen fuehrenden Unterstrich:
     Jekyll traegt solche Verzeichnisse nicht in die Ausgabe von Pages. */
  assert.ok(existsSync(join(root, "_proof-src")), "die Quelle der Oberflaeche fehlt");
});

test("PP7 — der Chart sagt getrennt, was laeuft und was nicht", () => {
  const b = baue();
  const c = b.meta.chart;

  /* Drei Fragen, drei Antworten. Ein Sammelurteil waere die eine
     Verwechslung, die der Eigentuemer ausdruecklich ausgeschlossen hat. */
  assert.ok(c.historical && c.intraday && c.realtime);

  /* Historisch: die Titel mit Kursreihe werden GEZAEHLT, nicht behauptet -
     die Liste entsteht aus den Dateien auf der Platte. */
  for (const t of c.historical.scope) {
    assert.ok(existsSync(join(root, `quant/data/market/golden-preview/daily/ref_${t}.json`)),
      `${t} steht im Chart-Umfang, hat aber keine Kursreihe`);
    assert.ok(c.historical.series[t].bars > 100);
  }

  assert.equal(c.intraday.status, "UNAVAILABLE",
    "es liegen keine Intraday-Bars im Repository");
  assert.notEqual(c.realtime.status, "AVAILABLE");

  /* Der Backend-Beleg darf mitkommen, aber nie als Produkterfolg. */
  if (c.realtime.backendProof) {
    assert.match(c.realtime.note, /Backend-Test ist kein Produkterfolg|laeuft er NICHT/);
  }

  /* Und nichts in der Oberflaeche taeuscht einen Strom vor. */
  for (const datei of ["app.js", "stock/app.js", "screener/app.js", "ui/proof.js"]) {
    const text = seitenQuelle(datei);
    assert.doesNotMatch(text, /setInterval/,
      `${datei} treibt etwas periodisch an - ein simulierter Live-Chart waere die schlimmste Variante`);
    assert.doesNotMatch(text, /Math\.random/,
      `${datei} erzeugt Zufallszahlen - in einem Nachweis mit echten Daten hat das nichts zu suchen`);
  }
});

test("PP8 — der Screener rechnet auf gemessenen Groessen, nicht auf Modellnamen", () => {
  const b = baue();
  const namen = b.index.fields.map((f) => f.id);

  /* Die Felder des synthetischen Modelluniversums duerfen hier nicht
     auftauchen: derselbe Name mit anderer Bedeutung ist schlimmer als
     ein fehlendes Feld. */
  for (const modellfeld of ["quantScore", "momentum6m", "qualityScore", "valueScore", "fcfYield"]) {
    assert.ok(!namen.includes(modellfeld),
      `${modellfeld} stammt aus dem Modelluniversum und bedeutet hier etwas anderes`);
  }
  for (const gemessen of ["returns.12M", "distanceToSMA200", "volatility252d", "relativeStrength.12M"]) {
    assert.ok(namen.includes(gemessen), `${gemessen} fehlt im Feldkatalog`);
  }

  /* Fehlende Werte erfuellen keine Regel. Geprueft an der Ausfuehrung
     selbst: die Spalte fuehrt null, und der Filter bricht dort ab. */
  const screener = seitenQuelle("screener/app.js");
  assert.match(screener, /if \(w === null \|\| w === undefined\) \{ unbekannt = true; passt = false; break; \}/,
    "ein fehlender Wert darf nie als erfuellt gelten");
  assert.match(screener, /notEvaluable/, "nicht auswertbare Titel muessen ausgewiesen werden");

  /* Die 18 Fragen des Laufs kommen unveraendert durch. */
  assert.equal(b.meta.screenerQuestions.length, b.quelle.screenerQuestions.length);
  assert.ok(b.meta.screenerQuestions.every((f) => f.resultStatus));
});

test("PP9 — keine rohe Diagnosemarke als erste Auskunft", () => {
  /* §30: was fehlt, sagt warum - aber in normalem Deutsch. Die Marke des
     Laufs bleibt daneben stehen, damit die Angabe pruefbar bleibt. */
  const stock = seitenQuelle("stock/app.js");
  for (const marke of ["INSUFFICIENT_HISTORY", "large_move_matching_split_ratio", "stale_last_bar"]) {
    assert.ok(stock.includes(marke),
      `${marke} wird nicht uebersetzt - dann steht die Rohmarke in der Oberflaeche`);
  }
  assert.match(stock, /zu wenig Historie/);
  assert.match(stock, /Pruefmarke des Laufs/,
    "die pruefbare Marke muss erhalten bleiben, nur nicht als Ueberschrift");
});

test("PP10 — der Bau erfindet nichts und bricht ohne Quelle ab", () => {
  /* Der Nachweis darf nur formen, was schon gemessen wurde. Ohne
     Vorschaudatensatz muss er abbrechen - eine Oberflaeche mit
     erfundenen Zahlen waere schlimmer als gar keine. */
  const leer = mkdtempSync(join(tmpdir(), "vu-pp-leer-"));
  let abgebrochen = false, ausgabe = "";
  try {
    execFileSync(process.execPath, [
      join(root, "scripts/proof/build-product-proof.mjs"),
      "--in", join(leer, "gibtesnicht.json"), "--out", join(leer, "raus")
    ], { encoding: "utf8", cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    abgebrochen = true;
    ausgabe = String(err.stderr || "");
  }
  assert.ok(abgebrochen, "ohne Quelle darf nichts gebaut werden");
  assert.match(ausgabe, /Kein Vorschaudatensatz/);

  /* Und die Werte, die durchkommen, sind dieselben - Stichprobe gegen
     die Quelle, Feld fuer Feld. */
  const b = baue();
  const quelleNachTicker = new Map(b.quelle.rows.map((r) => [r.ticker, r]));
  const buendelNachTicker = new Map();
  for (const x of b.buendel) for (const t of Object.keys(x.rows)) buendelNachTicker.set(t, x.rows[t]);

  let geprueft = 0;
  for (const ticker of b.index.tickers) {
    const q = quelleNachTicker.get(ticker), z = buendelNachTicker.get(ticker);
    assert.deepEqual(z, q, `${ticker} kam veraendert im Nachweis an`);
    if (++geprueft >= 400) break;
  }

  /* Auch die Spalten muessen die Zeile treffen - sie sind die Grundlage
     von Suche und Screener. */
  const i = b.index.tickers.indexOf("ORCL");
  if (i >= 0) {
    const orcl = quelleNachTicker.get("ORCL");
    assert.equal(b.index.columns["returns.12M"][i], orcl.factors.values.returns["12M"]);
    assert.equal(b.index.columns.priceAboveSMA200[i], orcl.factors.values.priceAboveSMA200 ? 1 : 0);
    assert.equal(b.index.enums.exchange[b.index.columns.exchange[i]], orcl.exchange);
  }
});
