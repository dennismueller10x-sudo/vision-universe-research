/* =========================================================================
   VISION UNIVERSE — build-product-symbols.mjs

   DAS SYMBOLVERZEICHNIS FUER INTRADAY UND ECHTZEIT.

   Es entscheidet NICHTS. Es projiziert nur, was der Eignungslauf bereits
   entschieden hat (quant/data/market/security-master/eligibility.json),
   in eine Form, die eine Serverfunktion in wenigen Millisekunden lesen
   kann: 3,8 MB Entscheidungen werden zu rund 70 kB Tickerlisten.

   WARUM UEBERHAUPT EINE ZWEITE DATEI

   Weil die Alternative schlechter waere. Eine Serverfunktion, die bei
   jedem Aufruf 7.803 Entscheidungssaetze einliest, um EINE Frage zu
   beantworten - "darf dieses Symbol?" -, bezahlt das bei jedem Nutzer.
   Diese Datei ist keine zweite Wahrheit: sie traegt den sha256 ihrer
   Quelle, und ein Test rechnet die Zahlen gegen die Quelle nach. Weicht
   etwas ab, faellt der Test, nicht der Nutzer.

   DIE EINTEILUNG STAMMT NICHT VON HIER

   ELIGIBLE, SEPARATE_CLASS, REVIEW und EXCLUDED kommen aus dem
   Eignungslauf. Das Produktuniversum ist definiert als "alles ausser
   EXCLUDED" - dieselbe Rechnung, die die Quelle selbst unter
   counts.productUniverse fuehrt. Sie wird hier nachgerechnet und
   verglichen, nicht neu erfunden.

   Ausfuehren:
     node scripts/realtime/build-product-symbols.mjs
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const QUELLE = join(root, "quant/data/market/security-master/eligibility.json");
const ZIEL = join(root, "quant/data/market/realtime/product-symbols.json");

const roh = readFileSync(QUELLE);
const quelle = JSON.parse(roh.toString("utf8"));
const entscheidungen = quelle.decisions || [];

if (!entscheidungen.length) {
  console.error("\n  Die Eignungsquelle traegt keine Entscheidungen. Es wird nichts gebaut.\n");
  process.exit(1);
}

/* Die vier Klassen, wie sie die Quelle fuehrt. Ein unbekannter Wert ist
   ein Fehler und kein Grund, ihn stillschweigend als "darf" zu lesen. */
const KLASSEN = ["ELIGIBLE", "SEPARATE_CLASS", "REVIEW", "EXCLUDED"];

const symbole = { ELIGIBLE: [], SEPARATE_CLASS: [], REVIEW: [] };
const ausgeschlossen = {};        /* Klasse -> Ticker: sagt WARUM nicht */
const unbekannt = [];

for (const e of entscheidungen) {
  const ticker = String(e.ticker || "").toUpperCase();
  const klasse = e.product_eligibility;
  if (!ticker) continue;
  if (!KLASSEN.includes(klasse)) { unbekannt.push(`${ticker}:${klasse}`); continue; }
  if (klasse === "EXCLUDED") {
    const art = e.instrument_type || "UNKNOWN";
    (ausgeschlossen[art] || (ausgeschlossen[art] = [])).push(ticker);
    continue;
  }
  symbole[klasse].push(ticker);
}

if (unbekannt.length) {
  console.error(`\n  ${unbekannt.length} Entscheidungen mit unbekannter Eignungsklasse: ` +
                `${unbekannt.slice(0, 5).join(", ")}. Abbruch.\n`);
  process.exit(1);
}

for (const k of Object.keys(symbole)) symbole[k].sort();
for (const k of Object.keys(ausgeschlossen)) ausgeschlossen[k].sort();

const produktuniversum = symbole.ELIGIBLE.length + symbole.SEPARATE_CLASS.length + symbole.REVIEW.length;
const ausgeschlossenGesamt = Object.values(ausgeschlossen).reduce((n, l) => n + l.length, 0);

/* Die Gegenprobe gegen die Quelle. Stimmt sie nicht, ist die Projektion
   falsch - und dann darf sie nicht entstehen. */
const erwartet = quelle.counts || {};
const abweichungen = [];
if (erwartet.productUniverse !== undefined && erwartet.productUniverse !== produktuniversum) {
  abweichungen.push(`productUniverse ${produktuniversum} statt ${erwartet.productUniverse}`);
}
for (const k of ["ELIGIBLE", "SEPARATE_CLASS", "REVIEW"]) {
  if (erwartet[k] !== undefined && erwartet[k] !== symbole[k].length) {
    abweichungen.push(`${k} ${symbole[k].length} statt ${erwartet[k]}`);
  }
}
if (erwartet.EXCLUDED !== undefined && erwartet.EXCLUDED !== ausgeschlossenGesamt) {
  abweichungen.push(`EXCLUDED ${ausgeschlossenGesamt} statt ${erwartet.EXCLUDED}`);
}
if (abweichungen.length) {
  console.error(`\n  Die Projektion weicht von der Quelle ab: ${abweichungen.join("; ")}. Abbruch.\n`);
  process.exit(1);
}

const verzeichnis = {
  generatedAt: new Date().toISOString(),
  engine: "product-symbols-1.0.0",
  kind: "PRODUCT_SYMBOL_INDEX",
  note: "Projektion des Eignungslaufs, keine eigene Entscheidung. Das Produktuniversum " +
        "ist alles ausser EXCLUDED; die Klassen stammen unveraendert aus der Quelle.",
  source: {
    file: "quant/data/market/security-master/eligibility.json",
    sha256: createHash("sha256").update(roh).digest("hex"),
    version: quelle.version || null,
    generatedAt: quelle.generatedAt || null,
    scope: quelle.scope || null
  },
  counts: {
    universeMembers: entscheidungen.length,
    productUniverse: produktuniversum,
    ELIGIBLE: symbole.ELIGIBLE.length,
    SEPARATE_CLASS: symbole.SEPARATE_CLASS.length,
    REVIEW: symbole.REVIEW.length,
    EXCLUDED: ausgeschlossenGesamt
  },
  excludedByClass: Object.fromEntries(
    Object.entries(ausgeschlossen).map(([k, l]) => [k, l.length]).sort()),
  symbols: symbole,
  excluded: ausgeschlossen
};

mkdirSync(dirname(ZIEL), { recursive: true });
writeFileSync(ZIEL, JSON.stringify(verzeichnis) + "\n");

const kb = (n) => (n / 1024).toFixed(0) + " kB";
console.log(`
Vision Universe — Symbolverzeichnis fuer Intraday und Echtzeit

  Quelle:            ${verzeichnis.source.file}
  Stand der Quelle:  ${verzeichnis.source.generatedAt}
  sha256:            ${verzeichnis.source.sha256.slice(0, 16)}…

  Produktuniversum:  ${produktuniversum}
    ELIGIBLE         ${symbole.ELIGIBLE.length}
    SEPARATE_CLASS   ${symbole.SEPARATE_CLASS.length}
    REVIEW           ${symbole.REVIEW.length}
  Ausgeschlossen:    ${ausgeschlossenGesamt}  (${Object.entries(verzeichnis.excludedByClass).map(([k, n]) => k + " " + n).join(", ")})

  ${ZIEL.replace(root + "/", "")}  (${kb(JSON.stringify(verzeichnis).length)})
`);
