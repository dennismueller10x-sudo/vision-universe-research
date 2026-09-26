#!/usr/bin/env node
/* =========================================================================
   WAS DIE BEWERTUNG HEUTE TRAEGT - UND WAS SIE BEWUSST NICHT SAGT.

   Diese Messung beantwortet eine Frage, die nach M34 offen war: wie viel
   Bewertungsdeckung ist geblieben, wie viel wurde zurueckgehalten, und aus
   welchem Grund. Sie rechnet nichts nach, sondern zaehlt, was im
   veroeffentlichten Faktor-Artefakt steht.

   WARUM MULTI_CLASS UND NON_EQUITY EINE ZAHL SIND UND NICHT ZWEI

   Der Auftrag fragt beide getrennt. Sie sind nicht trennbar, und genau das
   ist der Befund: keine lokale Quelle unterscheidet eine Stammaktie von
   einer Vorzugsaktie, einer Anleihe oder einer Indexschuldverschreibung.
   Gemessen ueber die 7.803 Instrumente des Wertpapierstamms traegt
   `assetType` fuer 7.801 den Wert "Stock" - darunter FNGU, ein gehebeltes
   Indexpapier, und AMJB, eine Schuldverschreibung; `instrumentType` lautet
   fuer alle COMMON_STOCK; CUSIP, FIGI und ISIN fehlen fuer alle 7.803; und
   das SEC-Verzeichnis nennt fuer jede Zeile denselben Firmennamen. Eine
   Aufteilung hier waere geraten, und dann stuende eine geratene Zahl neben
   einer gemessenen. Der Bericht nennt deshalb die gemeinsame Zahl und die
   Gruppengroessen, aus denen sich ablesen laesst, wie viele Emittenten
   ueberhaupt betroffen sind.

   Ausfuehren:
     node scripts/quant/measure-valuation-coverage.mjs [--out <pfad>]
   ========================================================================= */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith("--" + name + "="));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = arg("out", join(ROOT, "quant/data/product/valuation-coverage-v1.json"));
const DIR = join(ROOT, "quant/data/product/factor-evidence-v1");

/* Titel, an denen ein Leser sofort erkennt, ob die Regel richtig greift.
   Sie stehen hier, weil ihre Bewertung in M34 zurueckgehalten wurde und der
   Auftrag ausdruecklich nach ihnen fragt - nicht als Sonderlogik, sondern
   als Stichprobe im Bericht. */
const STICHPROBE = ["JPM", "T", "SO", "GOOG", "GOOGL", "AGNC", "AAPL", "NVDA", "MSFT", "WSBCO", "BKNG"];

async function main() {
  const dateien = (await readdir(DIR)).filter((n) => n.endsWith(".json.gz")
    && n !== "screening.json.gz" && n !== "summary.json.gz").sort();

  const z = {
    titel: 0, mitFundamentaldaten: 0,
    marketCapVorhanden: 0,
    bewertungVerfuegbar: 0, bewertungZu: 0,
    zurueckgehaltenWegenZuordnung: 0,
    ohneAnteilsbestand: 0, ohneKurs: 0,
    zeilenOhneJedenFaktor: 0,
    sectorTemplateMissing: 0
  };
  const gruende = {};
  const proEmittent = new Map();
  const stichprobe = {};

  for (const datei of dateien) {
    const shard = JSON.parse(gunzipSync(await readFile(join(DIR, datei))).toString("utf8"));
    for (const [ticker, row] of Object.entries(shard.securities || {})) {
      z.titel += 1;
      if (row.fundamentalsAsOf) z.mitFundamentaldaten += 1;
      if (Number.isFinite(row.marketCap)) z.marketCapVorhanden += 1;

      const wert = row.factors.value || {};
      if (wert.state === "AVAILABLE") z.bewertungVerfuegbar += 1; else z.bewertungZu += 1;
      if (wert.reason) gruende[wert.reason] = (gruende[wert.reason] || 0) + 1;

      if (row.marketCapReason === "SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING") z.zurueckgehaltenWegenZuordnung += 1;
      if (row.marketCapReason === "NO_PIT_SHARE_COUNT") z.ohneAnteilsbestand += 1;
      if (row.marketCapReason === "NO_PUBLISHED_CLOSE") z.ohneKurs += 1;

      if (!Object.values(row.factors).some((f) => f.state === "AVAILABLE")) z.zeilenOhneJedenFaktor += 1;
      if (Object.values(row.factors).some((f) => f.reason === "SECTOR_TEMPLATE_MISSING")) z.sectorTemplateMissing += 1;

      if (row.cik) {
        const key = String(row.cik);
        if (!proEmittent.has(key)) proEmittent.set(key, []);
        proEmittent.get(key).push(ticker);
      }
      if (STICHPROBE.includes(ticker)) {
        stichprobe[ticker] = {
          marketCap: row.marketCap, marketCapReason: row.marketCapReason || null,
          issuerListings: row.issuerListings || null,
          value: wert.state, valueReason: wert.reason || null,
          fundamentalYears: row.fundamentalYears ?? null, bars: row.bars
        };
      }
    }
  }

  /* Gruppengroessen: wie viele Emittenten mehr als eine notierte Zeile
     fuehren, und wie viele Zeilen das zusammen sind. */
  let emittentenMitMehrerenZeilen = 0, zeilenInGruppen = 0;
  const groessen = {};
  for (const zeilen of proEmittent.values()) {
    if (zeilen.length < 2) continue;
    emittentenMitMehrerenZeilen += 1;
    zeilenInGruppen += zeilen.length;
    groessen[zeilen.length] = (groessen[zeilen.length] || 0) + 1;
  }

  /* Die Zuordnungslücke der SEC-Schicht, gelesen aus dem Klassifikator -
     nicht hier neu berechnet. */
  const klassPfad = join(ROOT, "quant/data/providers/zero-factor-classification.json");
  const klass = existsSync(klassPfad) ? JSON.parse(await readFile(klassPfad, "utf8")) : null;

  const bericht = {
    schemaVersion: "valuation-coverage-1.0.0",
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
    question: "Wie viel Bewertungsdeckung traegt das Produkt, wie viel wird zurueckgehalten, und aus welchem Grund?",
    source: "quant/data/product/factor-evidence-v1 (gelesen, nicht nachgerechnet)",
    VALUE_FACTOR_COVERAGE: { available: z.bewertungVerfuegbar, unavailable: z.bewertungZu, universe: z.titel },
    MARKET_CAP_COVERAGE: { present: z.marketCapVorhanden, universe: z.titel,
      withFundamentals: z.mitFundamentaldaten },
    /* Eine Zahl, kein Paar - die Begruendung steht im Kopf dieser Datei. */
    MULTI_CLASS_OR_NON_EQUITY_WITHHELD: {
      listings: z.zurueckgehaltenWegenZuordnung,
      issuersWithSeveralListings: emittentenMitMehrerenZeilen,
      listingsInThoseIssuers: zeilenInGruppen,
      groupSizes: groessen,
      separable: false,
      whyNotSeparable: "Keine lokale Quelle unterscheidet Stammaktie, Vorzugsaktie, Anleihe und " +
        "Indexschuldverschreibung: assetType ist fuer 7.801 von 7.803 Instrumenten 'Stock', " +
        "instrumentType fuer alle COMMON_STOCK, CUSIP/FIGI/ISIN fehlen vollstaendig, und das " +
        "SEC-Verzeichnis nennt fuer jede Zeile denselben Firmennamen."
    },
    MARKET_CAP_WITHHELD_BY_REASON: {
      SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING: z.zurueckgehaltenWegenZuordnung,
      NO_PIT_SHARE_COUNT: z.ohneAnteilsbestand,
      NO_PUBLISHED_CLOSE: z.ohneKurs
    },
    VALUE_FACTOR_REASONS: gruende,
    ZERO_FACTOR_ROWS: z.zeilenOhneJedenFaktor,
    SECTOR_TEMPLATE_MISSING: z.sectorTemplateMissing,
    SEC_MAPPING_GAPS: klass ? {
      internalMappingGap: klass.features?.INTERNAL_MAPPING_GAP ?? null,
      rawFactsWithoutMapping: klass.chain?.ROHFAKTEN_OHNE_ZUORDNUNG ?? null,
      exportRunSilentlySkipped: klass.features?.EXPORT_RUN_SILENTLY_SKIPPED ?? null,
      exportRunReportedFailure: klass.features?.EXPORT_RUN_REPORTED_FAILURE ?? null
    } : null,
    sample: stichprobe,
    note: "Korrektheit vor Reichweite: eine hoehere Deckung ist hier kein Erfolg, wenn sie aus " +
      "einer Zahl entsteht, die nicht berechenbar war. Die zurueckgehaltenen Zeilen tragen ihren Grund."
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(bericht, null, 1) + "\n");

  const p = (n) => String(n).padStart(6);
  process.stdout.write("\nBEWERTUNGSDECKUNG · " + z.titel + " Titel\n");
  process.stdout.write("  VALUE_FACTOR_COVERAGE      " + p(z.bewertungVerfuegbar) + " verfuegbar · " + z.bewertungZu + " zu\n");
  process.stdout.write("  MARKET_CAP_COVERAGE        " + p(z.marketCapVorhanden) + " von " + z.titel +
    " (" + z.mitFundamentaldaten + " mit Fundamentaldaten)\n");
  process.stdout.write("  ZERO_FACTOR_ROWS           " + p(z.zeilenOhneJedenFaktor) + "\n");
  process.stdout.write("  SECTOR_TEMPLATE_MISSING    " + p(z.sectorTemplateMissing) + "\n");
  process.stdout.write("\nZURUECKGEHALTEN, JE GRUND\n");
  for (const [k, v] of Object.entries(bericht.MARKET_CAP_WITHHELD_BY_REASON)) {
    process.stdout.write("  " + k.padEnd(42) + p(v) + "\n");
  }
  process.stdout.write("\nMULTI_CLASS / NON_EQUITY (nicht trennbar, eine Zahl)\n");
  process.stdout.write("  Zeilen zurueckgehalten     " + p(z.zurueckgehaltenWegenZuordnung) + "\n");
  process.stdout.write("  Emittenten mit >1 Zeile    " + p(emittentenMitMehrerenZeilen) +
    " · " + zeilenInGruppen + " Zeilen · Gruppengroessen " + JSON.stringify(groessen) + "\n");
  process.stdout.write("\nGRUENDE DES BEWERTUNGSFAKTORS\n");
  for (const [k, v] of Object.entries(gruende).sort((a, b) => b[1] - a[1])) {
    process.stdout.write("  " + k.padEnd(42) + p(v) + "\n");
  }
  process.stdout.write("\nSTICHPROBE\n");
  for (const t of STICHPROBE) {
    const e = stichprobe[t];
    if (!e) { process.stdout.write("  " + t.padEnd(7) + "nicht im Artefakt\n"); continue; }
    process.stdout.write("  " + t.padEnd(7) +
      (e.marketCap === null ? "kein Boersenwert" : (e.marketCap / 1e9).toFixed(1) + " Mrd").padEnd(17) +
      "Bewertung " + e.value.padEnd(12) +
      (e.valueReason ? e.valueReason : "-").padEnd(42) +
      (e.issuerListings ? e.issuerListings.length + " Zeilen des Emittenten" : "") + "\n");
  }
  process.stdout.write("\n  " + OUT.replace(ROOT + "/", "") + "\n");
}

main();
