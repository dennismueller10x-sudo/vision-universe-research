/* =========================================================================
   VISION UNIVERSE — build-product-proof.mjs

   BAUT DEN PRODUKTNACHWEIS FUER DIE GESCHUETZTE VORSCHAU.

   Der Unterschied zu scripts/preview/build-preview-dataset.mjs ist der
   Zweck, nicht die Quelle. Jene Datei baut die INTERNE Pruefansicht
   (/preview-universe/) - eine Tabelle, die zeigt, was gemessen wurde.
   Dieses Skript baut den PRODUKTNACHWEIS: dieselbe Oberflaeche, die es
   schon gibt (Suche, Screener, Einzeltitel), auf dem vollen Universum.

   ES WIRD NICHTS NACHGERECHNET UND NICHTS GEHOLT.

   Quelle ist ausschliesslich quant/data/preview/universe.json - der
   Datensatz, den der Vorschaubau bereits aus den geprueften Artefakten
   des FULL_UNIVERSE-Laufs erzeugt hat. Dieses Skript formt ihn nur so um,
   dass eine Seite ihn benutzen kann, ohne 8,6 MB zu laden:

     meta.json      Umfang, Deckung, Herkunft, Screenerfragen   (klein)
     index.json     spaltenweise Tabelle ueber ALLE Titel       (Suche + Screener)
     rows/NN.json   je Titel alles, in 64 Buendeln              (Einzeltitel)

   Spaltenweise, weil es dieselbe Tabelle um ein Vielfaches kleiner macht:
   ein Feldname je Spalte statt je Zeile. Bei 5.683 Zeilen ist das der
   Unterschied zwischen "laedt auf dem Telefon" und "laedt nicht".

   AUSGABE WIRD NIE COMMITTET. Sie entsteht im Vercel-Bauschritt und ist
   gitignored - genauso wie der Vorschaudatensatz, aus dem sie stammt.
   GitHub Pages baut ohne diesen Schritt und bleibt Byte fuer Byte, was es
   war.

   Ausfuehren:
     node scripts/preview/build-preview-dataset.mjs
     node scripts/proof/build-product-proof.mjs
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, copyFileSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const IN = arg("--in", join(root, "quant", "data", "preview", "universe.json"));
const OUT = arg("--out", join(root, "quant", "data", "proof"));
const SRC = arg("--src", join(root, "_proof-src", "universe"));
const SITE = arg("--site", join(root, "universe"));
const SHARDS = 64;

/* Dieselbe Streuung im Browser (_proof-src/universe/ui/proof.js#shardOf).
   Zwei Implementierungen derselben Regel sind eine Fehlerquelle; sie
   stehen deshalb woertlich gleich da und werden am Ende gegengeprueft. */
function shardOf(ticker) {
  let h = 0;
  for (let i = 0; i < ticker.length; i++) h = (h * 31 + ticker.charCodeAt(i)) >>> 0;
  return h % SHARDS;
}

if (!existsSync(IN)) {
  console.error(`
  Kein Vorschaudatensatz unter ${relative(root, IN)}.

  Er entsteht in scripts/preview/build-preview-dataset.mjs und ist die
  einzige Quelle dieses Schritts. Ohne ihn wird nichts gebaut - eine
  Oberflaeche mit erfundenen Zahlen waere schlimmer als gar keine.
`);
  process.exit(1);
}

const quelle = JSON.parse(readFileSync(IN, "utf8"));
const zeilen = quelle.rows || [];
if (!zeilen.length) {
  console.error("\n  Der Vorschaudatensatz traegt keine Zeilen. Es wird nichts gebaut.\n");
  process.exit(1);
}

/* ------------------------------------------------------------ Felder

   Der Feldkatalog des Nachweises. Er ist bewusst NICHT der Katalog des
   synthetischen Modelluniversums (quant/engines/catalog.js): dort heisst
   ein Feld "momentum6m" und ist ein Perzentil im Modell, hier heisst es
   "returns.6M" und ist eine gemessene Rendite. Dieselben Namen mit
   anderer Bedeutung waeren die schlimmste Variante. */
const FELDER = [
  { id: "exchange", label: "Boerse", type: "enum", category: "reference" },
  { id: "sector", label: "Sektor", type: "enum", category: "reference" },
  { id: "instrumentType", label: "Instrumententyp", type: "enum", category: "reference" },
  { id: "active", label: "Aktiv gelistet", type: "bool", category: "reference" },
  { id: "dataQuality", label: "Datenqualitaet", type: "enum", category: "reference" },
  { id: "adjustment", label: "Kursbereinigung", type: "enum", category: "reference" },
  { id: "historyYears", label: "Historie (Jahre)", type: "number", unit: "years", digits: 1, category: "reference" },
  { id: "bars", label: "Handelstage", type: "number", unit: "count", digits: 0, category: "reference" },
  { id: "splits", label: "Splits", type: "number", unit: "count", digits: 0, category: "reference" },
  { id: "dividends", label: "Dividenden", type: "number", unit: "count", digits: 0, category: "reference" },

  { id: "priceAboveSMA20", label: "Ueber SMA20", type: "bool", category: "trend" },
  { id: "priceAboveSMA50", label: "Ueber SMA50", type: "bool", category: "trend" },
  { id: "priceAboveSMA100", label: "Ueber SMA100", type: "bool", category: "trend" },
  { id: "priceAboveSMA200", label: "Ueber SMA200", type: "bool", category: "trend" },
  { id: "aboveAllSMA", label: "Ueber allen SMA", type: "bool", category: "trend" },
  { id: "aboveSMA20And50And200", label: "Ueber SMA20+50+200", type: "bool", category: "trend" },
  { id: "distanceToSMA20", label: "Abstand SMA20", type: "number", unit: "pct", digits: 1, category: "trend" },
  { id: "distanceToSMA50", label: "Abstand SMA50", type: "number", unit: "pct", digits: 1, category: "trend" },
  { id: "distanceToSMA100", label: "Abstand SMA100", type: "number", unit: "pct", digits: 1, category: "trend" },
  { id: "distanceToSMA200", label: "Abstand SMA200", type: "number", unit: "pct", digits: 1, category: "trend" },

  { id: "distanceTo52wHigh", label: "Abstand 52W-Hoch", type: "number", unit: "pct", digits: 1, category: "range" },
  { id: "distanceTo52wLow", label: "Abstand 52W-Tief", type: "number", unit: "pct", digits: 1, category: "range" },
  { id: "newHigh52w", label: "Neues 52W-Hoch", type: "bool", category: "range" },
  { id: "closeAtHigh52w", label: "Schluss am 52W-Hoch", type: "bool", category: "range" },
  { id: "within5PctOf52wHigh", label: "Nahe 52W-Hoch (5 %)", type: "bool", category: "range" },

  { id: "returns.1M", label: "Rendite 1M", type: "number", unit: "pct", digits: 1, category: "momentum" },
  { id: "returns.3M", label: "Rendite 3M", type: "number", unit: "pct", digits: 1, category: "momentum" },
  { id: "returns.6M", label: "Rendite 6M", type: "number", unit: "pct", digits: 1, category: "momentum" },
  { id: "returns.12M", label: "Rendite 12M", type: "number", unit: "pct", digits: 1, category: "momentum" },
  { id: "return12M1M", label: "Rendite 12M ohne 1M", type: "number", unit: "pct", digits: 1, category: "momentum" },
  { id: "momentumAcceleration", label: "Momentum-Beschleunigung", type: "number", unit: "pct", digits: 1, category: "momentum" },
  { id: "relativeStrength.1M", label: "Relative Staerke 1M", type: "number", unit: "pct", digits: 1, category: "momentum" },
  { id: "relativeStrength.3M", label: "Relative Staerke 3M", type: "number", unit: "pct", digits: 1, category: "momentum" },
  { id: "relativeStrength.6M", label: "Relative Staerke 6M", type: "number", unit: "pct", digits: 1, category: "momentum" },
  { id: "relativeStrength.12M", label: "Relative Staerke 12M", type: "number", unit: "pct", digits: 1, category: "momentum" },

  { id: "volatility20d", label: "Volatilitaet 20T", type: "number", unit: "pct", digits: 1, category: "risk" },
  { id: "volatility60d", label: "Volatilitaet 60T", type: "number", unit: "pct", digits: 1, category: "risk" },
  { id: "volatility252d", label: "Volatilitaet 252T", type: "number", unit: "pct", digits: 1, category: "risk" },
  { id: "maxDrawdown252d", label: "Max. Rueckgang 252T", type: "number", unit: "pct", digits: 1, category: "risk" },

  { id: "avgVolume20d", label: "Volumen 20T", type: "number", unit: "count", digits: 0, category: "volume" },
  { id: "avgVolume60d", label: "Volumen 60T", type: "number", unit: "count", digits: 0, category: "volume" },
  { id: "volumeRatio20over60", label: "Volumenverhaeltnis 20/60", type: "number", unit: "ratio", digits: 2, category: "volume" },
  { id: "volumeSpikeRatio", label: "Volumenausschlag", type: "number", unit: "ratio", digits: 2, category: "volume" },
  { id: "volumeBreakout", label: "Volumenausbruch", type: "bool", category: "volume" }
];

const REFERENZ = new Set(["exchange", "sector", "instrumentType", "active", "dataQuality",
                          "adjustment", "historyYears", "bars", "splits", "dividends"]);

function faktorWert(zeile, id) {
  const w = zeile.factors && zeile.factors.values;
  if (!w) return null;
  const punkt = id.indexOf(".");
  if (punkt < 0) return w[id] === undefined ? null : w[id];
  const gruppe = w[id.slice(0, punkt)];
  if (!gruppe) return null;
  const v = gruppe[id.slice(punkt + 1)];
  return v === undefined ? null : v;
}

function wert(zeile, feld) {
  if (REFERENZ.has(feld.id)) {
    const v = zeile[feld.id];
    return v === undefined ? null : v;
  }
  return faktorWert(zeile, feld.id);
}

/* --------------------------------------------------- Spaltenweise Tabelle */

const enums = {};
function enumIndex(feldId, v) {
  if (v === null || v === undefined || v === "") return null;
  const liste = enums[feldId] || (enums[feldId] = []);
  const i = liste.indexOf(v);
  if (i >= 0) return i;
  liste.push(v);
  return liste.length - 1;
}

const tickers = zeilen.map((z) => z.ticker);
const spalten = {};
let mitFaktoren = 0;

for (const feld of FELDER) spalten[feld.id] = new Array(zeilen.length).fill(null);
const hatFaktoren = new Array(zeilen.length).fill(0);

zeilen.forEach((z, i) => {
  if (z.factorsStatus === "PRESENT") { hatFaktoren[i] = 1; mitFaktoren++; }
  for (const feld of FELDER) {
    const v = wert(z, feld);
    if (v === null || v === undefined) continue;
    if (feld.type === "enum") spalten[feld.id][i] = enumIndex(feld.id, v);
    else if (feld.type === "bool") spalten[feld.id][i] = v ? 1 : 0;
    else if (Number.isFinite(v)) spalten[feld.id][i] = v;
  }
});

const index = {
  generatedAt: new Date().toISOString(),
  gate: quelle.gate,
  asOf: quelle.asOf,
  dataSnapshotId: quelle.dataSnapshotId,
  shards: SHARDS,
  count: zeilen.length,
  withFactors: mitFaktoren,
  fields: FELDER,
  enums,
  tickers,
  hasFactors: hatFaktoren,
  columns: spalten
};

/* ------------------------------------------------------------- Buendel

   Der Einzeltitel laedt genau ein Buendel, nicht die ganze Tabelle. 64
   Buendel zu je rund 90 Titeln: klein genug fuers Telefon, wenig genug
   Dateien fuer eine statische Auslieferung. */
const buendel = Array.from({ length: SHARDS }, () => ({}));
for (const z of zeilen) {
  /* fieldStatus bleibt eine VORLAGE. Ihn je Zeile aufzulegen, hat die
     Buendel von 4 auf 15 MB gebracht - dasselbe Schema 5.636 mal. Er
     steht deshalb einmal in meta.json; die Zeile verweist mit
     fieldStatusRef darauf, und der Einzeltitel legt ihn beim Anzeigen
     auf. Meta laedt die Seite ohnehin. */
  buendel[shardOf(z.ticker)][z.ticker] = z;
}

/* -------------------------------------------------------------- Umfang */

const meta = {
  generatedAt: index.generatedAt,
  gate: quelle.gate,
  kind: "PRODUCT_PROOF",
  asOf: quelle.asOf,
  dataSnapshotId: quelle.dataSnapshotId,
  sourceGeneratedAt: quelle.generatedAt,
  datasetScope: quelle.datasetScope,
  coverage: quelle.coverage,
  factorArtefact: quelle.factorArtefact,
  factorCoverage: quelle.factorCoverage,
  technicalCoverage: quelle.technicalCoverage,
  screenerQuestions: quelle.screenerQuestions,
  fieldStatusTemplates: quelle.fieldStatusTemplates || [],
  shards: SHARDS,
  /* Was der Chart je Datenklasse kann - aus den committeten Belegen
     gelesen, nicht behauptet. Die Seite zeigt das unveraendert an. */
  chart: chartLage()
};

function lies(pfad) {
  const p = join(root, pfad);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")); } catch (e) { return null; }
}

function chartLage() {
  const gates = lies("quant/config/feature-gates.json");
  const freigabe = lies("quant/config/development-preview.json");
  const liveKerze = lies("quant/data/market/commercial/live-candle-verification.json");
  const retest = lies("quant/data/market/commercial/capability-retest.json");

  /* Welche Titel tragen tatsaechlich eine veroeffentlichte Kursreihe?
     Nicht die Freigabeliste zaehlt, sondern die Datei auf der Platte. */
  const verzeichnis = join(root, "quant/data/market/golden-preview/daily");
  const mitReihe = existsSync(verzeichnis)
    ? readdirSync(verzeichnis).filter((n) => n.startsWith("ref_") && n.endsWith(".json"))
        .map((n) => n.slice(4, -5)).sort()
    : [];

  const reihen = {};
  for (const t of mitReihe) {
    const d = lies(`quant/data/market/golden-preview/daily/ref_${t}.json`);
    if (d) reihen[t] = { bars: d.barCount, first: d.first, last: d.last,
                         adjustmentStatus: d.adjustmentStatus, name: d.name || null };
  }

  const gate = (id) => (gates && gates.gates && gates.gates[id]) || null;

  return {
    historical: {
      status: mitReihe.length ? "AVAILABLE" : "UNAVAILABLE",
      scope: mitReihe,
      series: reihen,
      basis: freigabe ? freigabe.decidedBy : null,
      note: "Echte Tiingo-EOD-Kurse. Die Freigabe gilt genau fuer diese Titel " +
            "(quant/config/development-preview.json); fuer alle anderen Titel des Universums " +
            "ist keine Kursreihe ausgeliefert - der Bestand von rund 7,4 GB liegt in keinem Zweig."
    },
    intraday: {
      status: "UNAVAILABLE",
      providerCapability: retest && retest.accountCapabilities ? retest.accountCapabilities.intraday : null,
      gate: gate("ENABLE_LIVE_MARKET_DATA"),
      note: "Der Zugang liefert Intraday (laufzeitgeprueft). Ausgeliefert ist nichts: es liegen keine " +
            "Intraday-Bars im Repository, und das Gate ENABLE_LIVE_MARKET_DATA steht auf false."
    },
    realtime: {
      status: "UNAVAILABLE_IN_THIS_DELIVERY",
      backendProof: liveKerze ? {
        LIVE_CHART_READY: liveKerze.LIVE_CHART_READY,
        reason: liveKerze.liveChartReason,
        wsUrl: liveKerze.run ? liveKerze.run.wsUrl : null,
        generatedAt: liveKerze.generatedAt,
        priceType: liveKerze.priceSemantics ? liveKerze.priceSemantics.priceType : null
      } : null,
      note: "Der Strom ist im Backend belegt (WebSocket, echte Minutenkerze). In dieser Auslieferung " +
            "laeuft er NICHT: eine statische Seite muesste den Anbieterschluessel im Browser fuehren, " +
            "und das ist ausgeschlossen. Ein Backend-Test ist kein Produkterfolg - deshalb steht hier " +
            "kein simulierter Chart."
    }
  };
}

/* -------------------------------------------------------------- Schreiben */

mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, "rows"), { recursive: true });
writeFileSync(join(OUT, "meta.json"), JSON.stringify(meta));
writeFileSync(join(OUT, "index.json"), JSON.stringify(index));
buendel.forEach((b, i) => {
  writeFileSync(join(OUT, "rows", `${i}.json`), JSON.stringify({ shard: i, rows: b }));
});

/* Die Oberflaeche selbst: aus _proof-src/ an ihren Platz kopiert. Sie
   liegt im Quellbaum unter einem fuehrenden Unterstrich - Jekyll traegt
   solche Verzeichnisse nicht in die oeffentliche Ausgabe, und der
   Zielpfad /universe/ ist gitignored. Auf GitHub Pages entsteht diese
   Ansicht damit gar nicht erst. */
function kopiereBaum(von, nach) {
  mkdirSync(nach, { recursive: true });
  for (const eintrag of readdirSync(von)) {
    const q = join(von, eintrag), z = join(nach, eintrag);
    if (statSync(q).isDirectory()) kopiereBaum(q, z);
    else copyFileSync(q, z);
  }
}
let dateien = 0;
if (existsSync(SRC)) {
  if (existsSync(SITE)) rmSync(SITE, { recursive: true, force: true });
  kopiereBaum(SRC, SITE);
  const zaehle = (p) => readdirSync(p).reduce((n, e) =>
    n + (statSync(join(p, e)).isDirectory() ? zaehle(join(p, e)) : 1), 0);
  dateien = zaehle(SITE);
} else {
  console.error(`\n  Keine Oberflaeche unter ${relative(root, SRC)}. Nur Daten gebaut.\n`);
}

/* Gegenprobe: jede Zeile muss in ihrem Buendel wiederfindbar sein. Eine
   Streuung, die im Bau anders rechnet als im Browser, faellt sonst erst
   auf, wenn ein Einzeltitel nicht aufgeht - und dann sieht es aus wie ein
   fehlender Titel, nicht wie ein Rechenfehler. */
let fehlend = 0;
for (const z of zeilen) if (!buendel[shardOf(z.ticker)][z.ticker]) fehlend++;
if (fehlend) {
  console.error(`\n  ${fehlend} Titel liegen in keinem Buendel. Abbruch.\n`);
  process.exit(1);
}

const mb = (n) => (n / 1048576).toFixed(1) + " MB";
const groesse = statSync(join(OUT, "index.json")).size;
const buendelGroesse = buendel.reduce((n, _, i) => n + statSync(join(OUT, "rows", `${i}.json`)).size, 0);

console.log(`
Vision Universe — Produktnachweis

  Gate:            ${quelle.gate}
  Titel:           ${zeilen.length}   (jeder suchbar und aufrufbar)
  mit Faktorzeile: ${mitFaktoren}
  Felder:          ${FELDER.length}
  Buendel:         ${SHARDS} (${mb(buendelGroesse)} zusammen)
  Tabelle:         ${mb(groesse)}
  Oberflaeche:     ${dateien} Dateien nach ${relative(root, SITE)}/

  Chart historisch: ${meta.chart.historical.scope.length} Titel mit echter EOD-Reihe
  Chart intraday:   ${meta.chart.intraday.status}
  Chart realtime:   ${meta.chart.realtime.status}

  ${relative(root, OUT)}/meta.json
  ${relative(root, OUT)}/index.json
  ${relative(root, OUT)}/rows/0..${SHARDS - 1}.json
`);
