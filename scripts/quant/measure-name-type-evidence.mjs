#!/usr/bin/env node
/* =========================================================================
   WAS DER NAME ÜBER DIE GATTUNG SAGT — UND WAS ER NICHT SAGT.

   M37 hat gemessen, dass keine lokale Angabe ein Nicht-Eigenkapital-Papier
   von einer Stammaktie trennt: `assetType` lautet für 7.801 von 7.803
   Instrumenten "Stock", CUSIP, FIGI und ISIN fehlen für alle, und das
   SEC-Verzeichnis nennt für jede Zeile denselben Firmennamen. Diese Aussage
   war richtig über die Felder, die damals geprüft wurden - und sie wurde
   getroffen, bevor der Stamm Namen für diese Zeilen hatte. Seit M41 hat er
   sie (1.082 neu, 6.857 von 6.875 Titeln), und ein Name ist ein Beleg.

   Dieser Bericht trennt drei Dinge, die nicht dasselbe sind:

     EINDEUTIG   Der Name nennt die Gattung selbst: "... ETF",
                 "... Senior Notes Due 2030", "ADR", "Depositary Shares".
                 Ein Papier heißt nicht ETF, wenn es keines ist.
     MEHRDEUTIG  "Trust", "Fund", "Index", "Portfolio". Eine
                 Immobiliengesellschaft heißt "American Assets Trust" und ist
                 eine ganz normale Aktie; "Altisource Portfolio Solutions"
                 ist ein Betrieb. Eine Regel darauf würde REITs und
                 Betriebsgesellschaften umklassifizieren - das wäre geraten.
     GESPERRT    Was der Klassifikator heute ausdrücklich NICHT aus dem Namen
                 ableitet, obwohl der Name es sagt.

   Der Bericht entscheidet nichts. Er legt die Zahlen für eine Entscheidung
   hin, die den Umfang des Produktuniversums berührt und deshalb dem Owner
   gehört.

   Ausführen:
     node scripts/quant/measure-name-type-evidence.mjs [--out <pfad>]
   ========================================================================= */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Classification = require(join(ROOT, "quant/engines/instrument-classification.js"));
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const OUT = arg("out", join(ROOT, "quant/data/product/name-type-evidence-v1.json"));

/* Muster, die die Gattung SELBST nennen. Jeder Eintrag trägt die Begründung,
   warum er eindeutig ist - eine Liste ohne Begründung wäre eine Behauptung. */
const EINDEUTIG = [
  { id: "ETF", re: /\bETF\b/i, type: "ETF",
    why: "Ein börsengehandelter Fonds nennt sich so. Kein Betrieb trägt ETF im Namen." },
  { id: "ETN", re: /\bETN\b|\bEXCHANGE[- ]TRADED NOTES?\b/i, type: "ETN",
    why: "Eine börsengehandelte Schuldverschreibung nennt sich so. Sie ist eine Forderung gegen " +
         "den Emittenten und kein Anteil an einem Unternehmen - Eigenkapitalkennzahlen gelten für sie nicht." },
  { id: "SENIOR_NOTES", re: /\bSENIOR NOTES?\b|\bNOTES? DUE\b/i, type: "BOND",
    why: "Eine Anleihe mit Laufzeitangabe im Namen ist kein Eigenkapital." },
  { id: "ADR_ADS", re: /\b(ADR|ADS)\b|\bAMERICAN DEPOSITAR(Y|IES)\b/i, type: "ADR",
    why: "Eine Hinterlegung auf eine ausländische Aktie nennt sich ADR oder ADS." },
  { id: "DEPOSITARY_SHARE", re: /\bDEPOSITARY SHARES?\b/i, type: "PREFERRED_OR_ADR",
    why: "Eine Hinterlegung. Ob auf Vorzugsaktien oder auf eine ausländische Stammaktie, " +
         "entscheidet der Rest des Namens - deshalb kein einzelner Zieltyp." },
  { id: "PREFERRED", re: /\b(PREFERRED|PFD)\b/i, type: "PREFERRED",
    why: "Der Name nennt die Vorzugsaktie selbst. Sie hat einen festen Anspruch und keinen Anteil " +
         "am Gewinnwachstum; eine Bewertung über Gewinn oder Umsatz beschreibt sie nicht. " +
         "Achtung: steht zusätzlich ETF oder Fonds im Namen, gewinnt die Hülle - das prüft die Regelreihenfolge." },
  { id: "WARRANT", re: /\bWARRANTS?\b/i, type: "WARRANT",
    why: "Der Name nennt den Optionsschein selbst. Er ist ein Recht auf einen Bezug und kein " +
         "Unternehmensanteil; Kursreihe und Geschäftszahlen gehören nicht zusammen." }
];

/* Muster, die NICHT ausreichen - mit dem Gegenbeispiel, das sie widerlegt. */
const MEHRDEUTIG = [
  { id: "TRUST", re: /\bTRUST\b/i, counterExample: "American Assets Trust ist ein REIT, also eine Aktie." },
  { id: "FUND", re: /\bFUND\b/i, counterExample: "Ein Name mit Fund kann ein geschlossener Fonds oder eine Beteiligungsgesellschaft sein." },
  { id: "INDEX", re: /\bINDEX\b/i, counterExample: "Bitwise 10 Crypto Index Fund ist ein Fonds, ein Indexanbieter wäre ein Betrieb." },
  { id: "PORTFOLIO", re: /\bPORTFOLIO\b/i, counterExample: "Altisource Portfolio Solutions ist eine Betriebsgesellschaft." },
  { id: "UNIT", re: /\bUNITS?\b/i, counterExample: "Units können eine SPAC-Einheit oder eine Personengesellschaft sein." }
];

async function main() {
  const dir = join(ROOT, "quant/data/universe/instruments");
  if (!existsSync(dir)) throw new Error("kein Instrumentenbestand");
  const instrumente = [];
  for (const datei of (await readdir(dir)).sort()) {
    if (!datei.endsWith(".json")) continue;
    const shard = JSON.parse(await readFile(join(dir, datei), "utf8"));
    instrumente.push(...(shard.instruments || []));
  }

  const mitNamen = instrumente.filter((i) => i.companyName);
  const gruppen = [];
  for (const muster of EINDEUTIG) {
    const treffer = mitNamen.filter((i) => muster.re.test(i.companyName));
    const alsStammaktie = treffer.filter((i) => i.securityType === "COMMON_STOCK");
    gruppen.push({
      id: muster.id, evidence: "UNAMBIGUOUS", nameSaysType: muster.type, why: muster.why,
      titles: treffer.length,
      carriedAsCommonStock: alsStammaktie.length,
      alreadyClassified: treffer.length - alsStammaktie.length,
      inProductUniverse: alsStammaktie.filter((i) => i.productEligibility && i.productEligibility !== "EXCLUDED").length,
      screenerEligible: alsStammaktie.filter((i) => i.screenerEligible).length,
      examples: alsStammaktie.slice(0, 5).map((i) => ({ ticker: i.symbol, name: i.companyName }))
    });
  }
  for (const muster of MEHRDEUTIG) {
    const treffer = mitNamen.filter((i) => muster.re.test(i.companyName));
    gruppen.push({
      id: muster.id, evidence: "AMBIGUOUS", nameSaysType: null,
      why: "Kein Beleg: " + muster.counterExample,
      titles: treffer.length,
      carriedAsCommonStock: treffer.filter((i) => i.securityType === "COMMON_STOCK").length,
      examples: treffer.filter((i) => i.securityType === "COMMON_STOCK").slice(0, 3)
        .map((i) => ({ ticker: i.symbol, name: i.companyName }))
    });
  }

  /* WAS DER KLASSIFIKATOR HEUTE ABSICHTLICH NICHT TUT.
     Sagt der Anbieter assetType "Stock" und der Name "ETF", gewinnt der
     Anbieter - so steht es in der Engine. M37 hat gemessen, dass dieses Feld
     für 7.801 von 7.803 Zeilen "Stock" lautet und damit fast nichts
     unterscheidet. Beides gleichzeitig ist der Befund. */
  const etfGruppe = gruppen.find((g) => g.id === "ETF");
  const gesperrt = {
    rule: "instrument-classification: bei assetType='Stock' wird ein Name, der ETF oder FUND sagt, " +
          "nicht als Gattung übernommen (byName.type !== 'ETF' && byName.type !== 'FUND').",
    measuredReason: "Der Anbieter gilt als Autorität über assetType. Gemessen (M37) trägt dieses Feld " +
                    "für 7.801 von 7.803 Instrumenten den Wert 'Stock' und trennt damit nahezu nichts.",
    titlesAffected: etfGruppe ? etfGruppe.carriedAsCommonStock : 0,
    consequenceToday: "Diese Titel erhalten eine Aktien-Einordnung. Gemessen am 26.09.2026 tragen " +
                      "27 von ihnen mindestens eine bewertete Eigenschaft und 5 einen berechneten " +
                      "Börsenwert; eine bewertete BEWERTUNG hat keiner.",
    decisionBelongsToOwner: "Eine Umklassifizierung nimmt Titel aus dem Screener-Umfang " +
                            "(ETF ist nicht screenerEligible) und verändert damit den Umfang des " +
                            "Produktuniversums. Das ist eine Produktentscheidung und kein Fix."
  };

  const bericht = {
    schemaVersion: "name-type-evidence-1.0.0",
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
    instruments: instrumente.length,
    withName: mitNamen.length,
    withoutName: instrumente.length - mitNamen.length,
    classificationEngine: Classification.VERSION || null,
    typeCounts: instrumente.reduce((z, i) => { z[i.securityType] = (z[i.securityType] || 0) + 1; return z; }, {}),
    basisCounts: instrumente.reduce((z, i) => { z[i.securityTypeBasis || "null"] = (z[i.securityTypeBasis || "null"] || 0) + 1; return z; }, {}),
    groups: gruppen,
    withheldRule: gesperrt,
    correctsEarlierStatement: "M37 hält fest, keine lokale Angabe trenne Nicht-Eigenkapital von " +
      "Stammaktien. Das war richtig über assetType, CUSIP, FIGI, ISIN und das SEC-Verzeichnis - und " +
      "es wurde gemessen, bevor der Stamm Namen für diese Zeilen hatte. Der Name ist ein Beleg, und " +
      "für die eindeutigen Muster oben ist er der einzige vorhandene.",
    doNotDo: "Keine Umklassifizierung anhand mehrdeutiger Wörter (Trust, Fund, Index, Portfolio) und " +
      "keine anhand von Ticker-Suffixen. Ein Gegenbeispiel je Muster steht oben."
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(bericht, null, 1) + "\n");

  process.stdout.write("Namensbeleg zur Gattung · " + mitNamen.length + " von " + instrumente.length + " Instrumenten mit Namen\n\n");
  process.stdout.write("  " + "Muster".padEnd(18) + "Beleg".padEnd(13) + "Titel".padStart(6) + "  als Stammaktie\n");
  for (const g of bericht.groups) {
    process.stdout.write("  " + g.id.padEnd(18) + g.evidence.padEnd(13) +
      String(g.titles).padStart(6) + "  " + String(g.carriedAsCommonStock).padStart(14) + "\n");
  }
  process.stdout.write("\n  Gesperrte Regel: " + gesperrt.titlesAffected + " Titel, deren Name ETF sagt, gelten als Stammaktie.\n");
  process.stdout.write("  " + OUT.replace(ROOT + "/", "") + "\n");
}

main();
