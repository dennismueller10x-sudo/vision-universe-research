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

test("PD1 — der Datensatz traegt das ganze Universum und echte Historie ausserhalb der Golden Five", () => {
  const d = baue(mkdtempSync(join(tmpdir(), "vu-pd-")));

  assert.equal(d.kind, "DERIVED_UNIVERSE");

  /* HIER STAND EINE FESTE 5684, UND DAS WAR FALSCH. Die Zahl stammte
     aus einem Lauf; der naechste lieferte 5.683, weil ein Titel aus
     Tiingos Stammdaten verschwand. Ein Test, der eine MESSUNG als
     Invariante festschreibt, meldet dann die Wirklichkeit als Fehler.

     Geprueft wird jetzt die Beziehung: der Datensatz traegt genau das
     Universum, das im Gate-Artefakt steht - wie gross es gerade ist,
     entscheidet der Anbieter. Die Untergrenze faengt den Fall ab, dass
     das Universum still zusammenschrumpft. */
  const universum = JSON.parse(readFileSync(
    join(root, "quant/data/market/scale/universe-FULL_UNIVERSE.json"), "utf8"));
  assert.equal(d.rows.length, universum.securities.length,
    "jeder Titel des Gate-Universums muss auffindbar sein");
  assert.ok(d.rows.length > 5000,
    `nur ${d.rows.length} Titel - das Universum ist zusammengeschrumpft`);

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
  assert.equal(u.derivedUniverse.securities, d.rows.length,
    "die Bilanz muss zaehlen, was wirklich dasteht");

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

  /* DIESE PRUEFUNG SCHRIEB EINEN MANGEL FEST. Sie verlangte
     withFactorRow === 5 und ueber 5.000 Titel OHNE Faktoren - der
     Zustand, als die Zeilen noch mit der Arbeitsablage starben. Seit es
     das dauerhafte Artefakt gibt, ist das Gegenteil richtig, und der
     Test meldete den Fortschritt als Fehler.

     Ein Test darf einen Mangel beschreiben, aber nie verlangen. Geprueft
     wird deshalb, was in beiden Welten gilt: die Zaehlung stimmt mit den
     Zeilen ueberein, und was fehlt, ist benannt. */
  const mitFaktoren = d.rows.filter((r) => r.factorsStatus === "PRESENT");
  const ohneFaktoren = d.rows.filter((r) => r.factorsStatus !== "PRESENT");
  assert.equal(d.coverage.withFactorRow, mitFaktoren.length,
    "die Bilanz muss zaehlen, was wirklich dasteht");
  assert.equal(mitFaktoren.length + ohneFaktoren.length, d.rows.length);

  /* Jede Zeile ohne Faktoren sagt das ausdruecklich - kein leeres Feld,
     das wie ein Nullwert aussieht. */
  assert.ok(ohneFaktoren.every((r) => r.factorsStatus === "NOT_IN_DELIVERED_ARTEFACTS"),
    "ein fehlender Faktorsatz muss benannt sein");
  assert.ok(ohneFaktoren.every((r) => r.factors === null));
  assert.ok(mitFaktoren.every((r) => r.factors && r.factors.values),
    "PRESENT ohne Werte waere die schlimmste Variante");

  /* Und wenn das Artefakt vorliegt, muss es auch ankommen: sonst haette
     der Lauf umsonst gerechnet. */
  if (d.factorArtefact && d.factorArtefact.present) {
    assert.ok(mitFaktoren.length > 5000,
      `Artefakt mit ${d.factorArtefact.securities} Zeilen, aber nur ${mitFaktoren.length} im Datensatz`);
    assert.ok(mitFaktoren.some((r) => r.factorsSource === "DURABLE_ARTEFACT"));
    /* Die Verweise muessen aufloesbar sein - ein Verweis ins Leere ist
       schlimmer als ein fehlendes Feld. */
    for (const r of mitFaktoren.slice(0, 200)) {
      assert.equal(typeof r.factors.fieldStatusRef, "number", `${r.ticker} ohne Vorlagenverweis`);
      assert.ok(d.fieldStatusTemplates[r.factors.fieldStatusRef],
        `${r.ticker} verweist auf eine Vorlage, die es nicht gibt`);
    }
  }

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

  /* AUCH HIER STAND EINE MESSUNG ALS INVARIANTE: matched === 2926. Das
     ist die Zahl eines Handelstages. Am naechsten waren es 2.821, und
     der Test meldete den Markt als Fehler.

     Was wirklich gelten MUSS, ist die Bilanz: Treffer, Nichttreffer und
     nicht entscheidbar ergeben zusammen die Grundgesamtheit. Faellt die
     auseinander, ist eine Zaehlung kaputt - und DAS faengt kein
     Literalwert. */
  assert.equal(typeof ueberSMA200.matched, "number");
  assert.equal(ueberSMA200.matched + ueberSMA200.notMatched + ueberSMA200.notEvaluable,
    ueberSMA200.evaluatedOf,
    "Treffer + Nichttreffer + nicht entscheidbar muss die Grundgesamtheit ergeben");
  assert.ok(ueberSMA200.matched > 0 && ueberSMA200.matched < ueberSMA200.evaluatedOf,
    "eine Zaehlung an einem der beiden Anschlaege ist verdaechtig, nicht plausibel");
  assert.ok(ueberSMA200.evaluatedOf > 5000, "die Frage laeuft ueber das Universum");

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

test("PD9 — die Ansicht baut ihre Tabelle beim Laden auf", () => {
  /* DIESER AUFRUF FEHLTE. Die Seite lieferte Kopfzeile, Filter und eine
     leere Tabelle aus, bis jemand etwas tippte - also genau die Sorte
     "erreichbar, aber nichts zu sehen", die schon einmal faelschlich als
     bestanden gemeldet wurde. Der Test haelt den Aufruf fest. */
  const dir = mkdtempSync(join(tmpdir(), "vu-pd-"));
  baue(dir);
  const seite = readFileSync(join(root, "preview-universe", "index.html"), "utf8");

  /* Ein Aufruf von zeichne() ausserhalb jedes Handlers. Die beiden
     Handler-Zeilen werden ausgeschlossen, damit der Test nicht deren
     Aufrufe als Erstaufbau durchgehen laesst. */
  const ersterAufbau = seite.split("\n").filter((z) =>
    /^\s*zeichne\(\);\s*$/.test(z) && !/addEventListener/.test(z));
  assert.ok(ersterAufbau.length >= 1,
    "ohne Erstaufbau zeigt die Vorschau eine leere Tabelle");

  /* Und der Einzeltitel, den die Suche braucht: ohne Ziel ist
     'auffindbar' nur die Haelfte der Zusage. */
  assert.match(seite, /function zeigeTitel/, "die Ansicht braucht einen Einzeltitel");
  assert.match(seite, /\?ticker=/, "der Einzeltitel braucht einen tiefen Link");

  /* Und die Faktoren werden GEZEIGT. Sie fuer jeden auswertbaren Titel zu
     berechnen, zu committen und dann nicht anzuzeigen waere ein Lauf ins
     Leere. */
  assert.match(seite, /class="faktoren"/, "der Einzeltitel muss die Faktoren zeigen");
  assert.match(seite, /Gleitende Durchschnitte/);
  assert.match(seite, /52-Wochen-Fenster/);
  /* Mit dem Hinweis, dass die Kursniveaus dahinter fehlen - ein Abstand
     ohne diese Angabe liest sich wie ein vollstaendiger Datensatz. */
  assert.match(seite, /WITHHELD_REDISTRIBUTION/,
    "der Block muss sagen, dass die Kursniveaus zurueckgehalten sind");
});

test("PD10 — die Rangfragen tragen echte Ranglisten mit Wert und Qualitaet", () => {
  const d = baue(mkdtempSync(join(tmpdir(), "vu-pd-")));
  const fragen = d.screenerQuestions;

  /* HIER LAG EIN FEHLER, UND ZWAR MEINER: die Rangfragen wurden auf
     q.tickers abgebildet, ein Feld, das nur die Zaehlfragen fuehren. Die
     Rangfragen legen ihre Namen unter q.top ab - sie lagen die ganze Zeit
     im Artefakt. Gemeldet wurde "die Rangliste fehlt". Es fehlte nichts.
     Dieser Test haelt fest, dass sie ankommen. */
  const zaehlend = fragen.filter((f) => f.kind === "boolean");
  const ordnend = fragen.filter((f) => f.kind === "ranked");
  assert.equal(zaehlend.length, 9);
  assert.equal(ordnend.length, 9);

  for (const f of fragen) {
    assert.ok(["PRESENT", "NOT_IN_DELIVERED_ARTEFACTS"].includes(f.resultStatus),
      `${f.id} traegt keinen Ergebnisstatus`);
  }
  assert.ok(zaehlend.every((f) => f.resultStatus === "PRESENT" && typeof f.matched === "number"));
  assert.ok(ordnend.every((f) => f.resultStatus === "PRESENT"),
    "die Ranglisten liegen im Artefakt vor und muessen ankommen");

  const momentum = fragen.find((f) => f.id === "strongestMomentum12M");
  assert.equal(momentum.entries.length, 50);
  assert.ok(momentum.evaluated > 5000, "die Rangliste laeuft ueber das Universum");

  /* Der WERT muss mit. An der Spitze stehen Titel mit Werten, die kein
     Kursverlauf hergibt, sondern eine Bereinigungsluecke - ohne Wert und
     ohne Qualitaetsmerkmal liest sich das wie der staerkste Titel des
     Universums. */
  for (const e of momentum.entries) {
    assert.equal(typeof e.value, "number", `${e.ticker} ohne Rangwert`);
    assert.ok(e.dataQuality, `${e.ticker} ohne Qualitaetsmerkmal`);
  }

  const seite = readFileSync(join(root, "preview-universe", "index.html"), "utf8");
  assert.match(seite, /class="rangzeile"/, "die Ansicht muss die Rangliste zeigen");
  assert.match(seite, /nicht entscheidbar/,
    "die nicht entscheidbaren Titel gehoeren neben die Liste - sonst liest sich eine Luecke wie ein Befund");
});

test("PD11 — der Vorschau-Nachweis nennt die Reichweite seines Zugangsbelegs", () => {
  /* Der Bypass-Token belegt, dass die Schutzschicht einen berechtigten
     Aufrufer durchlaesst - nicht, dass ein Mensch sich anmelden kann.
     Wer das verwechselt, behauptet einen Nachweis, den es nicht gibt. */
  const s = readFileSync(join(root, "scripts/site/verify-vercel-preview.mjs"), "utf8");
  assert.match(s, /authenticationProofScope/);
  assert.match(s, /NICHT.*SSO-Anmeldung eines Menschen/s);

  /* Ein uebersprungener Nachweis darf nie als bestanden zaehlen. Geprueft
     wird die Urteilslogik selbst, nicht ein Wortabstand: ein Suchmuster
     ueber "SKIPPED ... PASS" schlug auf das Wort BYPASS an, in dem PASS
     steckt - dieselbe Sorte Fehlalarm wie schon zweimal zuvor. */
  assert.match(s, /status === "SKIPPED" \|\| c\.status === "UNKNOWN"/,
    "SKIPPED und UNKNOWN muessen gemeinsam als 'nicht belegt' gefuehrt werden");
  assert.match(s, /offenGeblieben\.length\s*\?\s*"PARTIALLY_VERIFIED"/,
    "was uebersprungen wurde, darf das Urteil nicht auf bestanden lassen");
  assert.match(s, /"PREVIEW_VERIFIED"/);

  /* Und das Token selbst darf in keinem Bericht landen. */
  assert.match(s, /function entschaerfe/);
  assert.match(s, /entschaerfe\(JSON\.stringify\(bericht/);
});

test("PD12 — das dauerhafte Faktorartefakt verliert nichts und traegt keinen Kurs", () => {
  /* Der Kern der Anforderung: die Faktorzeilen sollen den Runner
     ueberleben. Geprueft wird an GATE_500, dessen Zeilen im Repository
     liegen - so braucht dieser Test keinen Anbieterlauf. */
  const dir = mkdtempSync(join(tmpdir(), "vu-fa-"));
  execFileSync(process.execPath,
    [join(root, "scripts/preview/build-factor-artefact.mjs"), "--gate", "GATE_500", "--out", dir],
    { encoding: "utf8", cwd: root });
  const a = JSON.parse(readFileSync(join(dir, "factors-GATE_500.json"), "utf8"));
  const orig = JSON.parse(readFileSync(
    join(root, "quant/data/market/factors/factors-GATE_500.json"), "utf8")).securities;

  assert.equal(a.kind, "DERIVED_FACTOR_ROWS");
  assert.equal(a.securities.length, orig.length);

  /* VERLUSTFREI. Eine Verdichtung, die etwas wegwirft, ist keine
     Verdichtung, sondern ein stiller Datenverlust. */
  const ordne = (o) => JSON.stringify(o, Object.keys(o).sort());
  for (let i = 0; i < orig.length; i++) {
    const r = Object.assign({}, a.securities[i]);
    const ref = r.fieldStatusRef;
    delete r.fieldStatusRef;
    r.fieldStatus = a.fieldStatusTemplates[ref];
    assert.equal(ordne(r), ordne(orig[i]), `${orig[i].ticker} kam nicht unveraendert zurueck`);
  }

  /* Und kleiner: fieldStatus war ueber die Haelfte des Umfangs und nimmt
     nur zwei Formen an. */
  assert.ok(a.fieldStatusTemplates.length <= 4,
    `${a.fieldStatusTemplates.length} Vorlagen - die Verdichtung greift nicht`);
  assert.ok(JSON.stringify(a).length < JSON.stringify(orig).length,
    "das Artefakt muss kleiner sein als die Zeilen, aus denen es entsteht");

  /* Kein Kursniveau. Das Skript weigert sich zu schreiben, wenn eines
     drin ist - hier die Gegenprobe am Ergebnis. */
  const text = JSON.stringify(a.securities);
  assert.ok(!/"sma200":\s*[0-9]/.test(text), "ein SMA-Kursniveau ist im Artefakt");
  assert.ok(!/"close":\s*[0-9]/.test(text));
  assert.ok(!/"high52w":\s*[0-9]/.test(text));

  /* Die Berechtigung steht IM Artefakt - wer es kopiert, kann sie nicht
     uebersehen. */
  assert.equal(a.entitlement.delivery, "PROTECTED_PREVIEW_ONLY");
  assert.equal(a.entitlement.publicPages, "NOT_DELIVERED");
});

test("PD13 — das Artefakt liegt nicht im oeffentlich ausgelieferten Baum", () => {
  /* quant/data/market/factors/ liefert Pages oeffentlich aus - dort
     liegen die Zeilen von GATE_100 und GATE_500 schon. Die Zeilen ALLER
     Titel dorthin zu legen hiesse, die Substanz der geschuetzten
     Vorschau oeffentlich zu machen. */
  const s = readFileSync(join(root, "scripts/preview/build-factor-artefact.mjs"), "utf8");
  assert.match(s, /_preview-data/, "das Artefakt gehoert nicht in den oeffentlichen Baum");
  assert.ok(!/join\(root, "quant", "data", "market", "factors"\)\s*\)?\s*;?\s*$/m.test(
    s.split("const OUT_DIR")[1].split("\n")[0] || ""),
    "OUT_DIR darf nicht auf den oeffentlichen Faktorbaum zeigen");

  /* Der Waechter muss den neuen Pfad kennen. Ohne ihn waere ein Kurs im
     Artefakt erst beim Anbieter aufgefallen. */
  const w = readFileSync(join(root, "scripts/market/assert-public-data-hygiene.mjs"), "utf8");
  assert.match(w, /_preview-data/,
    "assert-public-data-hygiene.mjs muss den Artefaktpfad pruefen");
  assert.match(w, /PROTECTED_PREVIEW_ONLY/,
    "der Waechter muss die Berechtigung im Artefakt verlangen");

  /* Und heute die harte Zusicherung: nicht auf main. Pages liefert von
     main; was dort nicht liegt, kann dort nicht erscheinen. */
  let aufMain = "";
  try {
    aufMain = execFileSync("git", ["ls-tree", "-r", "--name-only", "origin/main", "_preview-data"],
      { cwd: root, encoding: "utf8" }).trim();
  } catch (err) { return; }              /* kein origin/main: nichts zu pruefen */
  assert.equal(aufMain, "",
    `das Artefakt liegt auf main und damit im Pages-Baum: ${aufMain}`);
});
