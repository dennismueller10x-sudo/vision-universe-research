/* =========================================================================
   VISION UNIVERSE — build-factor-artefact.mjs

   DIE FAKTORZEILEN SOLLEN DEN RUNNER UEBERLEBEN

   Bisher liefen die Faktorzeilen von 5.684 Titeln in die Arbeitsablage
   des Runners (§26, DETAIL_LIMIT 500) und starben mit ihm. Der Screener
   hatte danach echte Zaehlungen, aber keine Rangfragen, und jede Zeile
   trug factorsStatus NOT_IN_DELIVERED_ARTEFACTS. Wer sie zurueckhaben
   wollte, musste 5.686 Anfragen erneut bezahlen.

   Dieses Skript macht daraus ein dauerhaftes Artefakt: einmal erzeugt,
   committet, und bei JEDEM Vercel-Build vorhanden.

   WARUM NICHT EINFACH factors-FULL_UNIVERSE.json COMMITTEN

   Zwei Gruende, und beide sind der ganze Punkt:

   ERSTENS DIE GROESSE. Die Zeilen sind mit Einrueckung 15,5 MB. Mehr als
   die Haelfte davon ist fieldStatus - und der ist ueber alle Titel
   nahezu gleich: er sagt, WELCHE Felder berechnet und welche
   zurueckgehalten sind, nicht was ein Titel tut. Ein Schema, das je
   Zeile wiederholt wird, ist kein Datensatz, sondern Ballast. Hier steht
   er einmal oben als Vorlage, und die Zeile verweist darauf.

   ZWEITENS DIE BERECHTIGUNG. quant/data/market/factors/ wird von GitHub
   Pages OEFFENTLICH ausgeliefert - dort liegen die Zeilen von GATE_100
   und GATE_500 schon. Die Zeilen aller 5.684 Titel dorthin zu legen
   hiesse, die Substanz der geschuetzten Vorschau oeffentlich zu
   machen. Genau dagegen ist die Vorschau gebaut. Das Artefakt liegt
   deshalb unter _preview-data/ und wird nicht oeffentlich ausgeliefert.

   WAS "NICHT OEFFENTLICH" HIER HEISST — UND WAS NICHT

   Heute: die Datei liegt auf dem Vorschauzweig und NICHT auf main. Pages
   liefert von main aus; was dort nicht liegt, kann dort nicht erscheinen.
   Das ist pruefbar mit `git ls-tree origin/main`, keine Annahme.

   Zusaetzlich beginnt der Verzeichnisname mit einem Unterstrich. Jekyll -
   und Pages laeuft ohne .nojekyll mit Jekyll - nimmt solche Verzeichnisse
   nicht in die Ausgabe. Das ist eine Konvention, nicht eine Messung;
   sie greift erst, falls die Datei je auf main landet, und wird dann
   von V10 des Vorschaunachweises am lebenden System GEMESSEN. Bis dahin
   traegt sie kein Gewicht, und dieses Skript behauptet sie nicht.

   Ausfuehren (braucht die Faktorzeilen - im Repository oder in der
   Arbeitsablage des laufenden Jobs):
     node scripts/preview/build-factor-artefact.mjs --gate FULL_UNIVERSE
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const GATE = arg("--gate", "FULL_UNIVERSE");
const OUT_DIR = arg("--out", join(root, "_preview-data"));
const WORK_DIR = arg("--work-dir", null);

const SCALE = JSON.parse(readFileSync(join(root, "quant", "config", "tiingo-scale.json"), "utf8"));

/* Feldnamen, die ein Kursniveau tragen. Dieselbe Liste wie in
   assert-public-data-hygiene.mjs, und bewusst hier wiederholt: dieses
   Skript soll sich WEIGERN zu schreiben, nicht erst in der CI auffallen.
   Ein Artefakt, das einmal committet ist, steht fuer immer in der
   Versionsgeschichte - dort ist "spaeter entfernt" kein Zustand. */
const PRICE_LEVEL_KEYS = new Set([
  "close", "open", "high", "low",
  "adjustedClose", "adjustedOpen", "adjustedHigh", "adjustedLow",
  "adjClose", "adjOpen", "adjHigh", "adjLow",
  "sma20", "sma50", "sma100", "sma200",
  "high52w", "low52w", "price", "last", "previousClose", "referencePrice"
]);

function findePreisniveaus(wert, pfad, treffer) {
  if (wert === null || wert === undefined) return;
  if (Array.isArray(wert)) {
    for (let i = 0; i < wert.length; i++) findePreisniveaus(wert[i], `${pfad}[${i}]`, treffer);
    return;
  }
  if (typeof wert !== "object") return;
  for (const [schluessel, kind] of Object.entries(wert)) {
    /* Der Wert entscheidet, nicht der Name: fieldStatus.sma200 traegt die
       Zeichenkette "WITHHELD_REDISTRIBUTION" und ist genau der Beleg,
       dass der Kurs NICHT dabei ist. Nur eine ZAHL unter einem
       Kursfeldnamen ist ein Kurs. */
    if (PRICE_LEVEL_KEYS.has(schluessel) && typeof kind === "number") {
      treffer.push(`${pfad}.${schluessel}`);
      continue;
    }
    findePreisniveaus(kind, `${pfad}.${schluessel}`, treffer);
  }
}

/* Woher kommen die Zeilen? Erst das Repository (kleine Gates liefern sie
   dort aus), dann die Arbeitsablage des laufenden Jobs (grosse Gates).
   Die Reihenfolge ist wichtig: im Job existieren beide Orte, und der
   aktuelle Stand steht in der Arbeitsablage. */
const kandidaten = [
  { ort: "workingStore",
    pfad: join(WORK_DIR || join(root, SCALE.storage.workingDir), "tiingo", "factors",
               `factors-${GATE}.json`) },
  { ort: "repository",
    pfad: join(root, "quant", "data", "market", "factors", `factors-${GATE}.json`) }
];
const quelle = kandidaten.find((k) => existsSync(k.pfad));

if (!quelle) {
  console.error(`\n  ABBRUCH: keine Faktorzeilen fuer ${GATE} gefunden. Gesucht:`);
  for (const k of kandidaten) console.error(`    ${k.pfad.replace(root + "/", "")}`);
  console.error("\n  Die Zeilen entstehen in build-market-factors.mjs. Ohne einen Lauf,\n" +
                "  der Kurse geladen hat, gibt es sie nicht - und dieses Skript\n" +
                "  erfindet sie nicht.\n");
  process.exit(2);
}

const detail = JSON.parse(readFileSync(quelle.pfad, "utf8"));
const zeilen = detail.securities || [];
if (!zeilen.length) {
  console.error(`\n  ABBRUCH: ${quelle.pfad.replace(root + "/", "")} traegt keine Zeilen.\n`);
  process.exit(2);
}

/* fieldStatus einmal oben, Verweis in der Zeile.

   Ueber 498 Zeilen von GATE_500 gemessen: 2 verschiedene Formen, 53 % des
   Umfangs. Die Vorlagen bleiben vollstaendig erhalten - gekuerzt wird die
   WIEDERHOLUNG, nicht die Aussage. */
const vorlagen = [];
const vorlagenIndex = new Map();
function vorlageFuer(fieldStatus) {
  const schluessel = JSON.stringify(fieldStatus === undefined ? null : fieldStatus);
  if (vorlagenIndex.has(schluessel)) return vorlagenIndex.get(schluessel);
  const i = vorlagen.length;
  vorlagen.push(fieldStatus === undefined ? null : fieldStatus);
  vorlagenIndex.set(schluessel, i);
  return i;
}

const kompakt = zeilen.map((z) => {
  const rest = Object.assign({}, z);
  delete rest.fieldStatus;
  rest.fieldStatusRef = vorlageFuer(z.fieldStatus);
  return rest;
});

const artefakt = {
  generatedAt: new Date().toISOString(),
  kind: "DERIVED_FACTOR_ROWS",
  gate: GATE,
  provider: detail.provider || "tiingo",
  engine: detail.engine || null,
  benchmark: detail.benchmark || null,
  /* Woher die Zeilen kamen und aus welchem Lauf. Ohne das ist ein
     committetes Artefakt eine Zahl ohne Herkunft. */
  derivedFrom: {
    source: quelle.ort,
    file: quelle.pfad.replace(root + "/", ""),
    gateRun: detail.run || null,
    detailGeneratedAt: detail.generatedAt || null
  },
  run: {
    source: process.env.GITHUB_ACTIONS ? "github-actions" : "local",
    runId: process.env.GITHUB_RUN_ID || null,
    commit: process.env.GITHUB_SHA || null,
    ref: process.env.GITHUB_REF_NAME || null
  },
  redistribution: detail.redistribution || null,
  /* Die Berechtigung steht IM Artefakt. Wer es spaeter woandershin
     kopiert, kann sie nicht uebersehen. */
  entitlement: {
    delivery: "PROTECTED_PREVIEW_ONLY",
    publicPages: "NOT_DELIVERED",
    reason: "Abgeleitete Faktorzeilen aller Titel. Sie tragen keine Kursniveaus, aber " +
            "sie sind die Substanz der geschuetzten Vorschau. quant/data/market/factors/ " +
            "wird oeffentlich ausgeliefert - dieses Artefakt bewusst nicht.",
    protectionToday: "Die Datei liegt auf dem Vorschauzweig und nicht auf main. Pages " +
                     "liefert von main; pruefbar mit `git ls-tree origin/main`.",
    protectionIfMerged: "Verzeichnisse mit fuehrendem Unterstrich nimmt Jekyll nicht in " +
                        "die Pages-Ausgabe. Das ist eine Konvention und wird von V10 des " +
                        "Vorschaunachweises am lebenden System gemessen, nicht angenommen."
  },
  coverage: {
    securities: kompakt.length,
    fieldStatusTemplates: vorlagen.length,
    requested: detail.coverage ? detail.coverage.requested : null,
    computed: detail.coverage ? detail.coverage.computed : null,
    skipped: detail.coverage ? detail.coverage.skipped : null,
    skippedByReason: detail.coverage ? detail.coverage.skippedByReason : null
  },
  /* Die uebersprungenen Titel bleiben benannt. "Nicht auswertbar" mit
     Grund ist eine Aussage; ein fehlender Eintrag ist keine. */
  skipped: detail.skipped || [],
  encoding: {
    note: "fieldStatus steht einmal in fieldStatusTemplates; jede Zeile verweist mit " +
          "fieldStatusRef auf ihre Vorlage. Auflegen: " +
          "row.fieldStatus = artefakt.fieldStatusTemplates[row.fieldStatusRef].",
    fieldStatusTemplates: vorlagen.length
  },
  fieldStatusTemplates: vorlagen,
  securities: kompakt
};

/* Die Weigerung. Erst pruefen, dann schreiben - nicht umgekehrt. */
const treffer = [];
findePreisniveaus(artefakt, "", treffer);
if (treffer.length) {
  console.error(`\n  ABBRUCH: das Artefakt traegt ${treffer.length} Kursniveau(s):`);
  for (const t of treffer.slice(0, 8)) console.error(`    ${t}`);
  console.error("\n  Kursniveaus sind Anbieterkurse und bleiben in der Arbeitsablage.\n" +
                "  Es wird NICHTS geschrieben.\n");
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
const datei = join(OUT_DIR, `factors-${GATE}.json`);
writeFileSync(datei, JSON.stringify(artefakt) + "\n");

const mb = statSync(datei).size / 1048576;
const vorher = statSync(quelle.pfad).size / 1048576;

console.log("\nVision Universe — dauerhaftes Faktorartefakt\n");
console.log(`  Stufe:            ${GATE}`);
console.log(`  Quelle:           ${quelle.ort} (${vorher.toFixed(1)} MB)`);
console.log(`  Zeilen:           ${kompakt.length}`);
console.log(`  fieldStatus-Vorlagen: ${vorlagen.length} statt ${kompakt.length} Wiederholungen`);
console.log(`  Groesse:          ${mb.toFixed(1)} MB  (${Math.round((1 - mb / vorher) * 100)} % kleiner)`);
console.log(`  Kursniveaus:      keine`);
console.log(`  Auslieferung:     PROTECTED_PREVIEW_ONLY (Pages: nicht ausgeliefert)`);
console.log(`\n  ${datei.replace(root + "/", "")}\n`);
