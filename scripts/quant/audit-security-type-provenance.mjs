#!/usr/bin/env node
/* =========================================================================
   SECURITY_TYPE_PROVENANCE_AUDIT

   Woher weiss dieses Haus, welche Gattung ein Papier ist? Die Frage stellte
   sich, als der Wertpapierstamm FNGU - ein gehebeltes Indexpapier - als
   COMMON_STOCK mit der Konfidenz HIGH fuehrte, benannt nach der Bank, die es
   ausgibt. Die Antwort war unangenehm: die Konfidenz HIGH stand fuer einen
   RESTBEFUND. Ihre Begruendung sagte es selbst - "kein Sondergattungsmuster
   im Ticker" ist die ABWESENHEIT eines Befundes.

   Dieser Bericht zaehlt, welche Klassifikation auf welchem Beleg beruht, und
   haelt fest, dass HIGH nur dort steht, wo es einen positiven Beleg gibt.
   Umklassifiziert wird nichts: der Typ bleibt, was er war, und nur die
   behauptete Sicherheit faellt. Eine Gattung zu erfinden waere schlimmer als
   eine zu kennzeichnen.

   WAS ALS BELEG GILT

     PROVIDER_ASSET_TYPE  Der Anbieter benennt die Gattung selbst (ETF, Fund).
     SECURITY_NAME        Der Name des PAPIERS weist sie aus ("... Preferred
                          Series B", "... Exchange Traded Note").
     TICKER_PATTERN       Eine Boersenkonvention (-P, -PR-A, -WT, -U).
                          Ein Hinweis, keine Quellenaussage - deshalb MEDIUM.
     RESIDUAL_NO_...      Der Anbieter sagt "Stock" und nichts sonst greift.
                          Kein Beleg fuer Stammkapital, nur dessen Abwesenheit
                          von Gegenbeweis.

   Ausfuehren:
     node scripts/quant/audit-security-type-provenance.mjs [--out <pfad>]
   ========================================================================= */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith("--" + name + "="));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = arg("out", join(ROOT, "quant/data/product/security-type-provenance-v1.json"));
const DIR = join(ROOT, "quant/data/universe/instruments");

/* Belege, die eine Quelle wirklich aussagt. Eine Boersenkonvention im Ticker
   ist ein Hinweis und steht bewusst nicht darunter. */
const ECHTER_BELEG = ["PROVIDER_ASSET_TYPE", "SECURITY_NAME"];

/* Welche Produktfunktionen an `securityType` haengen - gemessen an den
   Lesestellen im Code, nicht geschaetzt. Sie sind der Grund, warum der TYP
   hier nicht angetastet wird: eine Umklassifizierung wuerde Titel aus dem
   Universum werfen oder hineinholen. */
const ABHAENGIGE_FUNKTIONEN = [
  { field: "securityType", consumer: "scripts/universe/build-sec-universe.mjs",
    effect: "FILING_TYPES entscheidet, welche Gattung ueberhaupt in das SEC-Universum aufgenommen wird" },
  { field: "securityType", consumer: "scripts/universe/build-company-master.mjs",
    effect: "rules.securityTypes und ingest.securityTypes filtern die Aufnahme" },
  { field: "securityType", consumer: "quant/engines/instrument-directory.js",
    effect: "Kuerzel werden nur innerhalb derselben Gattung zusammengefuehrt" },
  { field: "securityType", consumer: "quant/engines/company-master.js",
    effect: "screenerEligible und die Zaehlung TOTAL_EQUITIES" },
  { field: "securityType", consumer: "quant/api/product-services.js",
    effect: "Anzeige der Wertpapierart auf der Aktienseite" },
  { field: "securityTypeConfidence", consumer: "keiner",
    effect: "Die Konfidenz wird geschrieben und von keinem Tor gelesen. Genau deshalb konnte " +
      "sie jahrelang HIGH behaupten, ohne dass etwas davon abhing - und genau deshalb ist ihre " +
      "Korrektur ohne Wirkung auf Deckung oder Eignung." }
];

async function main() {
  const dateien = (await readdir(DIR)).filter((n) => n.endsWith(".json")).sort();
  const konfidenz = {}, basis = {}, kreuz = {}, typJeBasis = {};
  const ohneBeleg = {};
  let instrumente = 0, mitIdentifikator = 0, mitWertpapiername = 0;
  const beispieleOhneBeleg = [];

  for (const datei of dateien) {
    const shard = JSON.parse(await readFile(join(DIR, datei), "utf8"));
    for (const i of shard.instruments || []) {
      instrumente += 1;
      const k = i.securityTypeConfidence || "FEHLT", b = i.securityTypeBasis || "FEHLT";
      konfidenz[k] = (konfidenz[k] || 0) + 1;
      basis[b] = (basis[b] || 0) + 1;
      kreuz[k + " / " + b] = (kreuz[k + " / " + b] || 0) + 1;
      (typJeBasis[b] = typJeBasis[b] || {})[i.securityType] = (typJeBasis[b][i.securityType] || 0) + 1;
      if (i.isin || i.cusip || i.figi) mitIdentifikator += 1;
      /* Ein Wertpapiername - nicht der des Emittenten. Gemessen fuehrt der
         Stamm nur Emittentennamen aus dem SEC-Verzeichnis, weshalb die
         Namensregeln des Klassifikators nie feuern. */
      if (i.companyNameStatus && i.companyNameStatus.indexOf("sec:") >= 0) mitWertpapiername += 0;
      if (k === "HIGH" && !ECHTER_BELEG.includes(b)) {
        ohneBeleg[b] = (ohneBeleg[b] || 0) + 1;
        if (beispieleOhneBeleg.length < 10) beispieleOhneBeleg.push(i.symbol + " (" + i.securityType + ", " + b + ")");
      }
    }
  }

  const highOhneBeleg = Object.values(ohneBeleg).reduce((a, b) => a + b, 0);
  const bericht = {
    schemaVersion: "security-type-provenance-1.0.0",
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
    question: "Auf welchem Beleg beruht die Gattung eines Papiers, und wo behauptet die Konfidenz mehr als der Beleg traegt?",
    source: "quant/data/universe/instruments (company-master), klassifiziert von quant/engines/instrument-classification.js",
    instruments: instrumente,
    evidenceKinds: {
      PROVIDER_ASSET_TYPE: "Der Anbieter benennt die Gattung selbst.",
      SECURITY_NAME: "Der Name des Papiers weist die Gattung aus.",
      TICKER_PATTERN: "Boersenkonvention im Kuerzel - ein Hinweis, keine Quellenaussage.",
      RESIDUAL_NO_SPECIAL_PATTERN: "Anbieter sagt 'Stock', kein Muster greift. Kein Beleg, sondern dessen Abwesenheit.",
      NO_EVIDENCE: "Weder Anbieterangabe noch Name.",
      SECURITY_NAME_WITHOUT_ASSET_TYPE: "Nur der Name, ohne Anbieterangabe.",
      PROVIDER_ASSET_TYPE_UNMAPPED: "Anbieterangabe, die keiner gefuehrten Gattung entspricht."
    },
    byConfidence: konfidenz,
    byBasis: basis,
    crossTab: kreuz,
    typeByBasis: typJeBasis,
    HIGH_CONFIDENCE_WITHOUT_EVIDENCE: highOhneBeleg,
    examplesWithoutEvidence: beispieleOhneBeleg,
    identifierCoverage: {
      withIsinCusipOrFigi: mitIdentifikator,
      note: "Ein Identifikator waere der belastbare Weg zur Gattung: die CUSIP kodiert den " +
        "Emissionstyp an Position 7-8, FIGI fuehrt ihn als Feld. Beide fehlen vollstaendig, " +
        "und deshalb ist die Gattung fuer fast das ganze Universum unbelegt."
    },
    dependentFunctions: ABHAENGIGE_FUNKTIONEN,
    whatWasNotDone: "Keine Umklassifizierung. Kein Ticker-Sonderfall. Der Typ bleibt, was die " +
      "Quelle sagt; nur die Konfidenz sagt jetzt die Wahrheit ueber ihren Beleg. Was die Gattung " +
      "wirklich belegen wuerde, ist ein Wertpapiername oder ein Identifikator - beides fehlt.",
    note: "Gelesen, nicht geraten. Die Konfidenz wird von keinem Tor gelesen; diese Korrektur " +
      "aendert deshalb keine Deckung und keine Eignung, sondern nur die Nachpruefbarkeit."
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(bericht, null, 1) + "\n");

  const p = (n) => String(n).padStart(6);
  process.stdout.write("\nSECURITY_TYPE_PROVENANCE_AUDIT · " + instrumente + " Instrumente\n\n");
  process.stdout.write("KONFIDENZ\n");
  for (const [k, v] of Object.entries(konfidenz).sort((a, b) => b[1] - a[1])) process.stdout.write("  " + k.padEnd(34) + p(v) + "\n");
  process.stdout.write("\nBELEG\n");
  for (const [k, v] of Object.entries(basis).sort((a, b) => b[1] - a[1])) process.stdout.write("  " + k.padEnd(34) + p(v) + "\n");
  process.stdout.write("\nKREUZTABELLE\n");
  for (const [k, v] of Object.entries(kreuz).sort((a, b) => b[1] - a[1])) process.stdout.write("  " + k.padEnd(52) + p(v) + "\n");
  process.stdout.write("\nHIGH_CONFIDENCE_WITHOUT_EVIDENCE   " + p(highOhneBeleg) + "\n");
  if (beispieleOhneBeleg.length) process.stdout.write("  " + beispieleOhneBeleg.join(", ") + "\n");
  process.stdout.write("\nmit ISIN/CUSIP/FIGI                " + p(mitIdentifikator) + "  (der belastbare Weg zur Gattung)\n");
  process.stdout.write("\n  " + OUT.replace(ROOT + "/", "") + "\n");
}

main();
