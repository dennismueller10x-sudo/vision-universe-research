#!/usr/bin/env node
/* =========================================================================
   GATTUNGSSICHERHEIT — WER BEKOMMT EINE AKTIENANALYSE, UND WARUM.

   Owner-Entscheidung vom 28.09.2026: ein generisches `assetType = "Stock"`
   ist KEIN ausreichender Beleg für eine Aktie, wenn der veröffentlichte
   Wertpapiername ausdrücklich eine andere Gattung nennt. Freigegeben als
   positive Evidenz ist ausschließlich ein ausdrückliches "ETF" oder
   "Exchange-Traded Fund" — nicht "Trust", nicht "Fund" allein, keine
   Tickersuffixe, nicht der Emittentenname, keine Vermutung aus Branche oder
   Kursverhalten.

   Dieser Bericht zählt genau die Größen, die der Auftrag nennt, und er
   liest dafür die veröffentlichten Artefakte statt eine zweite Regel zu
   formulieren. Die Grenze selbst kommt aus dem Klassifikator
   (`EXPLICIT_FUND_WRAPPER`); zwei Kopien davon wären zwei Freigaben.

   Ausführen:
     node scripts/quant/measure-security-type-safety.mjs [--out <pfad>]
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
const FactorEvidence = require(join(ROOT, "quant/engines/factor-evidence.js"));
const argv = process.argv.slice(2);
const arg = (n, f) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : f; };
const OUT = arg("out", join(ROOT, "quant/data/product/security-type-safety-v1.json"));

/* Mehrdeutige Muster - sie MÜSSEN unverändert bleiben, und der Bericht
   beweist das mit einer Zahl statt es zu behaupten. */
const AMBIGUOUS = [
  { id: "TRUST", re: /\bTRUST\b/i, counterExample: "American Assets Trust ist ein REIT, also eine Aktie." },
  { id: "FUND", re: /\bFUND\b/i, counterExample: "Ein Name mit Fund kann ein geschlossener Fonds oder eine Beteiligungsgesellschaft sein." },
  { id: "INDEX", re: /\bINDEX\b/i, counterExample: "Ein Indexanbieter wäre ein Betrieb." },
  { id: "PORTFOLIO", re: /\bPORTFOLIO\b/i, counterExample: "Altisource Portfolio Solutions ist eine Betriebsgesellschaft." }
];
const EQUITY_TYPES = new Set(["COMMON_STOCK", "ADR"]);
const EVIDENCE_BASIS = new Set(["SECURITY_NAME", "PROVIDER_ASSET_TYPE"]);

async function main() {
  const dir = join(ROOT, "quant/data/universe/instruments");
  const instrumente = [];
  for (const datei of (await readdir(dir)).sort()) {
    if (!datei.endsWith(".json")) continue;
    instrumente.push(...(JSON.parse(await readFile(join(dir, datei), "utf8")).instruments || []));
  }

  const kandidaten = instrumente.filter((i) =>
    i.companyName && Classification.EXPLICIT_FUND_WRAPPER.test(i.companyName));
  const reklassifiziert = kandidaten.filter((i) => !EQUITY_TYPES.has(i.securityType));
  const nochAktie = kandidaten.filter((i) => EQUITY_TYPES.has(i.securityType));

  /* Wer belegt keine Aktie ist - dieselbe Bedingung wie im Materialisierer. */
  const belegtKeineAktie = instrumente.filter((i) => !EQUITY_TYPES.has(i.securityType) &&
    i.securityTypeConfidence === "HIGH" && EVIDENCE_BASIS.has(i.securityTypeBasis));
  const belegtSet = new Set(belegtKeineAktie.map((i) => i.symbol));

  /* Was sie im Aktienscreener und in der Faktorschicht NICHT mehr haben. */
  const imScreener = belegtKeineAktie.filter((i) => i.screenerEligible);
  const zusammenfassung = existsSync(join(ROOT, "quant/data/product/factor-evidence-v1/summary.json"))
    ? JSON.parse(await readFile(join(ROOT, "quant/data/product/factor-evidence-v1/summary.json"), "utf8")) : null;

  /* Faktorzeilen, Bewertungen und Stiltreffer - gezählt AM ARTEFAKT. */
  let faktorZeilen = 0, mitBewertung = 0, mitBoersenwert = 0;
  const fdir = join(ROOT, "quant/data/product/factor-evidence-v1");
  if (existsSync(fdir)) {
    for (const datei of await readdir(fdir)) {
      if (!datei.endsWith(".json.gz") || datei === "screening.json.gz" || datei === "summary.json.gz") continue;
      const shard = JSON.parse(gunzipSync(await readFile(join(fdir, datei))).toString("utf8"));
      for (const [ticker, src] of Object.entries(shard.securities || {})) {
        if (!belegtSet.has(ticker)) continue;
        faktorZeilen += 1;
        if (Number.isFinite(src.marketCap)) mitBoersenwert += 1;
        const record = FactorEvidence.hydrate(src, shard);
        const wert = FactorEvidence.ordered(record).find((f) => f.id === "value");
        if (wert && wert.state === "AVAILABLE") mitBewertung += 1;
      }
    }
  }
  let imScreeningArtefakt = 0;
  const screeningPfad = join(fdir, "screening.json.gz");
  if (existsSync(screeningPfad)) {
    const screening = JSON.parse(gunzipSync(await readFile(screeningPfad)).toString("utf8"));
    imScreeningArtefakt = Object.keys(screening.rows || {}).filter((t) => belegtSet.has(t)).length;
  }
  let stilTreffer = 0;
  const stilPfad = join(ROOT, "quant/data/product/strategy-index-v1.json.gz");
  if (existsSync(stilPfad)) {
    const index = JSON.parse(gunzipSync(await readFile(stilPfad)).toString("utf8"));
    for (const profil of index.profiles || []) {
      for (const ticker of profil.tickers || []) if (belegtSet.has(ticker)) stilTreffer += 1;
    }
  }

  const mehrdeutig = AMBIGUOUS.map((m) => {
    const treffer = instrumente.filter((i) => i.companyName && m.re.test(i.companyName) &&
      !Classification.EXPLICIT_FUND_WRAPPER.test(i.companyName));
    return { id: m.id, counterExample: m.counterExample, titles: treffer.length,
      stillCommonStock: treffer.filter((i) => i.securityType === "COMMON_STOCK").length };
  });

  const bericht = {
    schemaVersion: "security-type-safety-1.0.0",
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
    ownerDecision: {
      date: "2026-09-28",
      released: ["explizites \"ETF\"", "explizites \"Exchange-Traded Fund\""],
      notReleased: ["\"Trust\" allein", "\"Fund\" allein", "Tickersuffix-Heuristiken",
        "Emittentenname statt Wertpapiername", "Vermutung aus Branche oder Kursverhalten"],
      pattern: String(Classification.EXPLICIT_FUND_WRAPPER)
    },
    ETF_NAME_EVIDENCE_CANDIDATES: kandidaten.length,
    ETF_RECLASSIFIED: reklassifiziert.length,
    STILL_EQUITY_AFTER_EVIDENCE: nochAktie.length,
    AMBIGUOUS_NOT_CHANGED: mehrdeutig.reduce((n, m) => n + m.stillCommonStock, 0),
    STOCK_SCREENER_REMOVED: belegtKeineAktie.length - imScreener.length,
    STOCK_SCREENER_REMAINING: imScreener.length,
    VALUE_FACTORS_REMOVED: (zusammenfassung && zusammenfassung.counts.notAnEquityListing) || 0,
    STRATEGY_MATCHES_REMOVED: (zusammenfassung && zusammenfassung.counts.notAnEquityListing) || 0,
    /* Und der Nachweis, dass wirklich nichts mehr da ist: alle drei Zahlen
       müssen null sein, sonst bekommt ein Fonds noch eine Aktienaussage. */
    residual: {
      factorRows: faktorZeilen, valueFactors: mitBewertung, marketCaps: mitBoersenwert,
      screeningRows: imScreeningArtefakt, strategyMatches: stilTreffer,
      note: "Alle fünf müssen 0 sein. Jede Zahl darüber ist eine Aktienaussage über ein Papier, das keine Aktie ist."
    },
    provenNonEquity: {
      total: belegtKeineAktie.length,
      byType: belegtKeineAktie.reduce((z, i) => { z[i.securityType] = (z[i.securityType] || 0) + 1; return z; }, {}),
      byBasis: belegtKeineAktie.reduce((z, i) => { z[i.securityTypeBasis] = (z[i.securityTypeBasis] || 0) + 1; return z; }, {}),
      stillInInstrumentUniverse: belegtKeineAktie.filter((i) =>
        i.productEligibility && i.productEligibility !== "EXCLUDED").length,
      examples: belegtKeineAktie.slice(0, 8).map((i) => ({ ticker: i.symbol, type: i.securityType, name: i.companyName }))
    },
    ambiguousLeftAlone: mehrdeutig,
    allCandidates: kandidaten.map((i) => ({ ticker: i.symbol, name: i.companyName, type: i.securityType,
      basis: i.securityTypeBasis, screenerEligible: i.screenerEligible })).sort((a, b) => (a.ticker < b.ticker ? -1 : 1))
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(bericht, null, 1) + "\n");

  const p = (n) => String(n).padStart(6);
  process.stdout.write("Gattungssicherheit · " + instrumente.length + " Instrumente\n\n");
  for (const key of ["ETF_NAME_EVIDENCE_CANDIDATES", "ETF_RECLASSIFIED", "STILL_EQUITY_AFTER_EVIDENCE",
    "AMBIGUOUS_NOT_CHANGED", "STOCK_SCREENER_REMOVED", "STOCK_SCREENER_REMAINING",
    "VALUE_FACTORS_REMOVED", "STRATEGY_MATCHES_REMOVED"]) {
    process.stdout.write("  " + p(bericht[key]) + "  " + key + "\n");
  }
  process.stdout.write("\n  Rest (muss null sein): Faktorzeilen " + faktorZeilen + " · Bewertungen " + mitBewertung +
    " · Boersenwerte " + mitBoersenwert + " · Screening " + imScreeningArtefakt + " · Stiltreffer " + stilTreffer + "\n");
  process.stdout.write("  belegt keine Aktie: " + belegtKeineAktie.length + " " +
    JSON.stringify(bericht.provenNonEquity.byType) + " · im Instrumentenuniversum " +
    bericht.provenNonEquity.stillInInstrumentUniverse + "\n");
  process.stdout.write("  mehrdeutig unveraendert: " +
    mehrdeutig.map((m) => m.id + " " + m.stillCommonStock + "/" + m.titles).join(" · ") + "\n");
  process.stdout.write("  " + OUT.replace(ROOT + "/", "") + "\n");
}

main();
