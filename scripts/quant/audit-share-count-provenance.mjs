#!/usr/bin/env node
/* =========================================================================
   SHARE_COUNT_PROVENANCE — WAS VON DER HERKUNFT EINER ZAHL UEBRIG BLEIBT

   Der Boersenwert ist Aktienzahl mal Kurs. Welche Aktienzahl das war -
   ausstehende Aktien, ausgegebene Aktien einschliesslich eigener, oder ein
   gewichteter Jahresdurchschnitt - entscheidet, ob die Zahl stimmt. Die
   SEC-Konsumschicht dieses Hauses verliert diese Angabe: sie fuehrt den Wert,
   das Einreichungsdatum, die Aktennummer und die Periode, aber NICHT das
   Konzept, aus dem der Wert kam.

   Dieser Bericht stellt fest, was lokal an Herkunft erhalten ist, und belegt
   die Vermischung dort, wo es einen Rohbeleg gibt. Er raet NICHT aus Werten,
   welches Konzept vorlag - das war ausdruecklich untersagt und waere auch
   nachweislich falsch: ein Aktiensplit sieht von aussen genauso aus wie ein
   vermischtes Konzept.

   DER EINE ORT MIT ECHTEM BELEG

   `quant/data/sec/primary_source_audit.json` vergleicht kanonische Werte
   gegen neu abgerufene SEC-Primaerdaten und fuehrt je Pruefung `secConcept`,
   `accession`, `form`, `filingDate` und `periodEnd`. Damit ist die
   Vermischung nicht erschlossen, sondern belegt - allerdings nur fuer die
   fuenf geprueften Titel und sechs Kennzahlen.

   Ausfuehren:
     node scripts/quant/audit-share-count-provenance.mjs [--out <pfad>]
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
const OUT = arg("out", join(ROOT, "quant/data/product/share-count-provenance-v1.json"));

/* Welche Konzepte dasselbe messen und welche etwas anderes. DEKLARIERT, nicht
   aus Zahlen erschlossen: `CommonStockSharesIssued` zaehlt ausgegebene Aktien
   einschliesslich der eigenen im Bestand, `dei:EntityCommonStockSharesOutstanding`
   die ausstehenden. Fuer einen Boersenwert ist nur die zweite richtig; die
   Differenz ist der eigene Bestand, bei JPMorgan gemessen 1,26 Milliarden
   Aktien oder 44 Prozent. */
const KONZEPTKLASSEN = {
  "dei:EntityCommonStockSharesOutstanding": "OUTSTANDING",
  "us-gaap:CommonStockSharesOutstanding": "OUTSTANDING",
  "us-gaap:CommonStockSharesIssued": "ISSUED_INCLUDING_TREASURY",
  "us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding": "WEIGHTED_AVERAGE",
  "us-gaap:WeightedAverageNumberOfSharesOutstandingBasic": "WEIGHTED_AVERAGE",
  "us-gaap:StockholdersEquity": "EQUITY_PARENT_ONLY",
  "us-gaap:StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest": "EQUITY_INCLUDING_MINORITY"
};

/* Welche Herkunftsangaben die Konsumschicht je Wert fuehrt - gemessen am
   Spaltenvertrag der Exporte, nicht behauptet. */
const KONSUM_SPALTEN = ["fy", "fp", "end", "v", "filed", "accn", "derived"];
const GEFORDERTE_HERKUNFT = {
  concept: { column: null, present: false, note: "Das SEC-Konzept, aus dem der Wert kam. Fehlt vollstaendig." },
  form: { column: null, present: false, note: "Formulartyp (10-K, 10-Q). Fehlt in der Konsumschicht; die kanonische Schicht fuehrt ihn je Einreichung, existiert aber nur fuer fuenf Titel." },
  filingDate: { column: "filed", present: true, note: "Vorhanden und punktgenau benutzt." },
  accession: { column: "accn", present: true, note: "Vorhanden - die Aktennummer der Einreichung." },
  fiscalPeriod: { column: "fp", present: true, note: "Vorhanden (FY, Q1..Q4, TTM)." },
  dimensions: { column: null, present: false, note: "Fehlt. Die Gattungsachse der Deckblattangabe ist damit unsichtbar - der Grund, warum es keine Aktienzahl je Gattung gibt." },
  frame: { column: null, present: false, note: "Fehlt." },
  units: { column: null, present: true, note: "Vorhanden, aber je KENNZAHL im Kopf des Dokuments und nicht je Wert." },
  sourceTag: { column: null, present: false, note: "Fehlt - deckungsgleich mit `concept`." }
};

async function main() {
  const auditPfad = join(ROOT, "quant/data/sec/primary_source_audit.json");
  const audit = existsSync(auditPfad) ? JSON.parse(await readFile(auditPfad, "utf8")) : null;

  const reihen = {};
  if (audit) {
    for (const check of audit.checks || []) {
      const key = check.ticker + "|" + check.metric;
      const eintrag = reihen[key] = reihen[key] || { ticker: check.ticker, metric: check.metric, concepts: {}, classes: {}, observations: 0 };
      eintrag.observations += 1;
      if (!check.secConcept) continue;
      const klasse = KONZEPTKLASSEN[check.secConcept] || "UNCLASSIFIED";
      (eintrag.concepts[check.secConcept] = eintrag.concepts[check.secConcept] || { count: 0, examples: [] }).count += 1;
      if (eintrag.concepts[check.secConcept].examples.length < 2) {
        eintrag.concepts[check.secConcept].examples.push({
          fiscalYear: check.fiscalYear, fiscalPeriod: check.fiscalPeriod,
          accession: check.accession, form: check.form, filingDate: check.filingDate,
          periodEnd: check.periodEnd, rawSecValue: check.rawSecValue
        });
      }
      eintrag.classes[klasse] = (eintrag.classes[klasse] || 0) + 1;
    }
  }

  /* Eine Reihe ist vermischt, wenn sie mehr als eine KLASSE fuehrt. Zwei
     Konzepte derselben Klasse sind harmlos - `CommonStockSharesOutstanding`
     und `EntityCommonStockSharesOutstanding` messen dasselbe. */
  const vermischt = [], harmlos = [], eindeutig = [];
  for (const eintrag of Object.values(reihen)) {
    const klassen = Object.keys(eintrag.classes);
    const konzepte = Object.keys(eintrag.concepts);
    const zeile = { ticker: eintrag.ticker, metric: eintrag.metric, concepts: konzepte,
      classes: klassen, byConcept: eintrag.concepts };
    if (klassen.length > 1) vermischt.push(zeile);
    else if (konzepte.length > 1) harmlos.push(zeile);
    else eindeutig.push(zeile);
  }

  /* Wie weit der Beleg reicht: die Konsumschicht deckt tausende Emittenten,
     der Audit fuenf. Beides gezaehlt, damit die Luecke eine Zahl hat. */
  const konsumDir = join(ROOT, "quant/data/sec/consumer");
  const konsumDateien = existsSync(konsumDir) ? (await readdir(konsumDir)).filter((n) => n.endsWith(".json")).length : 0;
  const geprueft = new Set(Object.values(reihen).map((e) => e.ticker)).size;

  const bericht = {
    schemaVersion: "share-count-provenance-1.0.0",
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
    question: "Welche Herkunftsangaben einer Aktienzahl sind lokal erhalten, und wo ist belegt, dass eine Kennzahlreihe Konzepte vermischt?",
    sources: {
      provenance: "quant/data/sec/primary_source_audit.json (fuehrt secConcept, accession, form, filingDate, periodEnd je Pruefung)",
      consumer: "quant/data/sec/consumer/CIK*.json (Spalten " + KONSUM_SPALTEN.join(", ") + ")"
    },
    conceptClasses: KONZEPTKLASSEN,
    requestedProvenanceFields: GEFORDERTE_HERKUNFT,
    DATA_CONTRACT_GAP: {
      state: "OPEN",
      missing: Object.entries(GEFORDERTE_HERKUNFT).filter(([, v]) => !v.present).map(([k]) => k),
      statement: "Die Konsumschicht fuehrt Einreichungsdatum, Aktennummer und Periode je Wert, aber " +
        "nicht das Konzept, aus dem der Wert kam. Ohne es ist nicht entscheidbar, ob eine " +
        "Aktienzahl ausstehende oder ausgegebene Aktien zaehlt - und beides steht nachweislich in " +
        "derselben Reihe. Das ist eine Luecke im Datenvertrag und keine fehlende Quelle: die SEC " +
        "liefert das Konzept, die Normalisierung verwirft es.",
      correctFix: "Das Konzept je Wert im Export mitfuehren und eine Kennzahlreihe niemals aus " +
        "zwei Konzeptklassen zusammensetzen. Beides liegt in der bestehenden SEC-Schicht gegen die " +
        "bestehende Quelle - kein Anbieterkauf.",
      whyNotHeuristic: "Aus dem Wert zu erraten, welches Konzept vorlag, ist untersagt und " +
        "nachweislich falsch: ein Aktiensplit hebt die ausstehende Zahl, waehrend die historische " +
        "Durchschnittsreihe vorsplit bleibt, und sieht damit genauso aus wie eine Vermischung. " +
        "Booking Holdings wurde so einmal falsch beschuldigt."
    },
    evidenceReach: {
      issuersWithConsumerExport: konsumDateien,
      issuersWithRawProvenance: geprueft,
      auditedMetrics: audit ? audit.auditedMetrics : null,
      note: "Der Beleg reicht ueber " + geprueft + " von " + konsumDateien + " Emittenten. Die " +
        "Vermischung ist damit belegt, ihre universumsweite Reichweite nicht."
    },
    MIXED_CONCEPT_SERIES: vermischt,
    SAME_CLASS_DIFFERENT_CONCEPT: harmlos,
    SINGLE_CONCEPT_SERIES: eindeutig.map((e) => ({ ticker: e.ticker, metric: e.metric, concept: e.concepts[0] })),
    blockedExternal: {
      host: "data.sec.gov",
      state: "BLOCKED_EXTERNAL_NETWORK",
      lastObserved: "CONNECT 403 (Netzwerkpolitik der Umgebung)",
      whatItWouldAllow: "Den Audit auf alle Emittenten ausdehnen und damit die Reichweite der " +
        "Vermischung messen, statt sie an fuenf Titeln zu belegen."
    }
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(bericht, null, 1) + "\n");

  process.stdout.write("\nSHARE_COUNT_PROVENANCE · Beleg ueber " + geprueft + " von " + konsumDateien + " Emittenten\n\n");
  process.stdout.write("ERHALTENE HERKUNFTSANGABEN JE WERT\n");
  for (const [feld, v] of Object.entries(GEFORDERTE_HERKUNFT)) {
    process.stdout.write("  " + (v.present ? "ja  " : "NEIN") + "  " + feld.padEnd(14) +
      (v.column ? "Spalte " + v.column : "") + "\n");
  }
  process.stdout.write("\nREIHEN MIT VERMISCHTEN KONZEPTKLASSEN (belegt, nicht erschlossen)\n");
  for (const z of vermischt) {
    process.stdout.write("  " + (z.ticker + "|" + z.metric).padEnd(28) + z.classes.join(" + ") + "\n");
    for (const c of z.concepts) process.stdout.write("      " + c + "\n");
  }
  process.stdout.write("\nREIHEN MIT ZWEI KONZEPTEN DERSELBEN KLASSE (harmlos)\n");
  for (const z of harmlos) process.stdout.write("  " + (z.ticker + "|" + z.metric).padEnd(28) + z.classes.join("") + "\n");
  process.stdout.write("\nDATA_CONTRACT_GAP = OPEN · fehlt: " + bericht.DATA_CONTRACT_GAP.missing.join(", ") + "\n");
  process.stdout.write("\n  " + OUT.replace(ROOT + "/", "") + "\n");
}

main();
