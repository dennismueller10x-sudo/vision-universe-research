#!/usr/bin/env node
/* =========================================================================
   DIE ZEILEN OHNE EINEN EINZIGEN FAKTORWERT - VOLLSTAENDIG KLASSIFIZIERT.

   Gemessen ueber die Sitzung hinweg tauchte immer dieselbe Zahl auf: rund 795
   Screening-Zeilen tragen `availableFactors: 0`. Bisher stand daneben nur das
   Wort "Datengrenze". Diese Datei beantwortet, WELCHE Grenze es je Titel ist -
   und wie viel davon ohne neue Datenquelle loesbar waere.

   SIE LIEST NUR, WAS DER PRODUZENT SCHON ENTSCHIEDEN HAT

   Kein zweites Regelwerk: die Faktor-Evidenz-Shards tragen je Titel und je
   Faktor den Zustand, den Grund und je Komponente den Grund, den der
   Materialisierungslauf selbst gesetzt hat (FUNDAMENTALS_UNAVAILABLE,
   INPUT_NOT_MATERIALIZED, SECTOR_TEMPLATE_MISSING, BLOCKED_EXTERNAL,
   INSUFFICIENT_COMPONENTS, MANDATORY_COMPONENT_MISSING). Dazu kommen die
   Eingangslagen, die derselbe Lauf mitschreibt: CIK, Balkenzahl,
   Fundamentalstand, Marktkapitalisierung, Vergleichsgruppe.

   Zusaetzlich gelesen, ebenfalls nur vorhandene Dateien:
     - quant/data/sec/consumer/CIK*.json   der Konsum-Export je Emittent
     - quant/data/sec/consumer_coverage.json  der Deckungsbericht
     - quant/data/universe/market-capability.json  die Vormerkungen
     - quant/data/universe/search/sym/*.json  Namen und Wertpapierart

   WAS SIE NICHT TUT

   Sie kauft nichts, ruft keinen Anbieter, aendert keine Pipeline und leitet
   keine Kaufentscheidung ab. Sie sagt, wo der Weg heute endet und woran.

   Ausfuehren:
     node scripts/quant/classify-zero-factor-rows.mjs [--out <pfad>]
   ========================================================================= */
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const OUT = arg("out", join(ROOT, "quant/data/providers/zero-factor-classification.json"));

const json = async (p) => JSON.parse(await readFile(p, "utf8"));
const gz = async (p) => JSON.parse(gunzipSync(await readFile(p)).toString("utf8"));

/* Die Mindesthistorie, die die Preisfaktoren brauchen - aus den Fenstern der
   Komponenten, nicht geraten: 252 Handelstage fuer Schwankungsbreite und Beta,
   rund 273 fuer "12 Monate ohne den letzten". */
const BARS_FOR_RISK = 252;
const BARS_FOR_MOMENTUM_12M1M = 273;

/* Branchenschluessel, die eine eigene Aussage erlauben. Sie stehen so im
   veroeffentlichten Peer-Feld; interpretiert wird nur ihre Bedeutung nach der
   SIC-Systematik, und zwar zurueckhaltend:
     6770 Blank Checks - die Rechtsform, in der eine Uebernahmegesellschaft
          (SPAC) notiert, bevor sie ein Geschaeft hat
     6726 Investment Offices - Fonds, geschlossene Fonds, ETF-Huellen
     6199/6221 Finanzvermittlung und Warenboersen
   Ein Titel mit einem dieser Schluessel hat nicht "fehlende Daten", sondern
   kein operatives Geschaeft, das die Faktoren messen wollen. */
const SIC_OHNE_OPERATIVES_GESCHAEFT = { 6770: "Blank Check (SPAC-Huelle)", 6726: "Investment Office (Fonds)", 6199: "Finanzvermittlung", 6221: "Warenboerse" };

async function namenUndArten() {
  const dir = join(ROOT, "quant/data/universe/search/sym");
  const namen = new Map(), arten = new Map(), secFlag = new Map();
  if (!existsSync(dir)) return { namen, arten, secFlag };
  for (const datei of (await readdir(dir)).filter((n) => n.endsWith(".json"))) {
    const shard = await json(join(dir, datei));
    for (const e of shard.entries || []) {
      if (!e || !e.s) continue;
      if (e.n) namen.set(e.s, e.n);
      if (e.t) arten.set(e.s, e.t);
      /* `HAS_SEC` sagt, dass der Company-Master diesen Titel mit
         SEC-Material verbunden sieht - unabhaengig davon, ob der Faktorlauf
         einen Konsum-Export gefunden hat. Genau diese Differenz ist die
         Frage "Mapping oder Quelle". */
      secFlag.set(e.s, Array.isArray(e.cap) && e.cap.indexOf("HAS_SEC") >= 0);
    }
  }
  return { namen, arten, secFlag };
}

/* Welche SEC-Kennzahlen der Konsum-Export eines Emittenten wirklich traegt.
   Gelesen wird die Datei, die der Faktorlauf auch liest. */
async function konsumExport(cik) {
  if (!cik) return null;
  const pfad = join(ROOT, "quant/data/sec/consumer", "CIK" + String(cik).padStart(10, "0") + ".json");
  if (!existsSync(pfad)) return { fehlt: true };
  try {
    const doc = await json(pfad);
    const quarterly = doc.quarterly || {}, annual = doc.annual || {};
    const metriken = Object.keys(quarterly).filter((k) => Array.isArray(quarterly[k]) && quarterly[k].length);
    const jahresMetriken = Object.keys(annual).filter((k) => Array.isArray(annual[k]) && annual[k].length);
    /* WIE TIEF DIE JAHRESHISTORIE WIRKLICH IST.
     *
     * Die Faktoren mit Dreijahresfenster (Umsatz-, Gewinn-, Cashflow-CAGR,
     * Margenausweitung, ROIC-Median) brauchen drei Geschaeftsjahre. Gezaehlt
     * werden deshalb die verschiedenen Geschaeftsjahre, die im Jahresteil
     * ueberhaupt stehen - nicht die Datenpunkte, denn zehn Punkte aus zwei
     * Jahren sind keine drei Jahre. */
    const jahre = new Set();
    for (const k of jahresMetriken) for (const reihe of annual[k]) if (Array.isArray(reihe) && Number.isFinite(reihe[0])) jahre.add(reihe[0]);
    return {
      fehlt: false, schema: doc.schema || null, asOf: doc.asOf || null,
      metriken, metrikenZahl: metriken.length,
      punkte: metriken.reduce((summe, k) => summe + quarterly[k].length, 0),
      jahresMetriken, fiscalYears: jahre.size, fiscalYearList: [...jahre].sort(),
      /* NICHT JEDER FUNDAMENTALFAKTOR BRAUCHT DREI JAHRE.
       *
       * Die Renditen der Bewertung und die Margen der Profitabilitaet rechnen
       * auf TTM, also vier Quartalen. Wer nur die Jahresfenster zaehlt,
       * unterschaetzt, was mit einem Jahr Berichten schon moeglich waere -
       * und wer nur Quartale zaehlt, ueberschaetzt die Dreijahresfenster.
       * Deshalb beides. */
      maxQuarters: metriken.reduce(function (max, k) { return Math.max(max, quarterly[k].length); }, 0)
    };
  } catch { return { fehlt: false, unlesbar: true, metriken: [], metrikenZahl: 0 }; }
}

async function main() {
  const dir = join(ROOT, "quant/data/product/factor-evidence-v1");
  const dateien = (await readdir(dir)).filter((n) => n.endsWith(".json.gz") && n !== "summary.json.gz").sort();
  const capability = await json(join(ROOT, "quant/data/universe/market-capability.json"));
  const vormerkung = new Map((capability.members || []).map((m) => [m.s, m]));
  const coverage = existsSync(join(ROOT, "quant/data/sec/consumer_coverage.json"))
    ? await json(join(ROOT, "quant/data/sec/consumer_coverage.json")) : null;
  const { namen, arten, secFlag } = await namenUndArten();

  const zeilen = [];
  const komponentenInputs = {};
  const exportCache = new Map();
  let geprueft = 0;

  for (const datei of dateien) {
    const shard = await gz(join(dir, datei));
    /* DER PRODUZENT HAT DIE ZUORDNUNG SCHON EINMAL VEROEFFENTLICHT.
     *
     * `componentSpecs` steht je Shard und traegt zu jeder Komponente ihr
     * Fenster und den konkreten Eingangsausdruck. Erst habe ich sie aus den
     * Komponenten JE TITEL sammeln wollen - dort steht sie nicht, weil der
     * Lauf sie genau deshalb ausgelagert hat. Zwei Shards duerfen sich darin
     * nicht widersprechen; tun sie es, faellt es hier auf. */
    for (const [key, spec] of Object.entries(shard.componentSpecs || {})) {
      if (!spec || !spec.input) continue;
      if (komponentenInputs[key] && komponentenInputs[key] !== spec.input) {
        throw new Error("COMPONENT_SPEC_CONFLICT:" + key + " in " + datei);
      }
      komponentenInputs[key] = spec.input;
    }
    for (const [ticker, row] of Object.entries(shard.securities || {})) {
      geprueft += 1;
      const faktoren = row.factors || {};
      const verfuegbar = Object.values(faktoren).filter((f) => f.state === "AVAILABLE").length;
      if (verfuegbar > 0) continue;               /* nur die Nullzeilen */

      const cik = row.cik || null;
      if (cik && !exportCache.has(cik)) exportCache.set(cik, await konsumExport(cik));
      const exp = cik ? exportCache.get(cik) : null;

      /* Je Faktor: Zustand, Grund, und welche Komponenten mit welchem Grund
         fehlen - unveraendert aus dem Artefakt. */
      const jeFaktor = {};
      for (const [fid, f] of Object.entries(faktoren)) {
        const fehlend = (f.components || []).filter((c) => c.state !== "AVAILABLE");
        const vorhanden = (f.components || []).filter((c) => c.state === "AVAILABLE");
        jeFaktor[fid] = {
          state: f.state, reason: f.reason || null,
          availableWeight: f.availableWeight ?? null,
          componentsTotal: (f.components || []).length,
          componentsAvailable: vorhanden.length,
          /* Nur Kennung und Grund je Zeile. DIE ZUORDNUNG KOMPONENTE ->
             SEC-INPUT IST FUER ALLE TITEL DIESELBE und stand deshalb 795 mal
             in der Datei - das waren vier Megabyte Wiederholung. Sie steht
             jetzt einmal unter `componentInputs`; verloren geht dabei nichts. */
          missing: fehlend.map((c) => ({ id: c.id, reason: c.reason || "UNAVAILABLE" }))
        };

      }

      const bars = Number.isFinite(row.bars) ? row.bars : null;
      const sic = row.peer && Number.isFinite(row.peer.industry) ? row.peer.industry : null;
      const ohneGeschaeft = sic !== null && SIC_OHNE_OPERATIVES_GESCHAEFT[sic] ? SIC_OHNE_OPERATIVES_GESCHAEFT[sic] : null;
      const sektorBlockiert = Object.values(jeFaktor).some((f) => f.reason === "SECTOR_TEMPLATE_MISSING"
        || (f.missing || []).some((m) => m.reason === "SECTOR_TEMPLATE_MISSING"));
      const fundamentalsFehlen = Object.values(jeFaktor).some((f) =>
        (f.missing || []).some((m) => m.reason === "FUNDAMENTALS_UNAVAILABLE"));
      const preisfaktorenDuenn = (bars !== null && bars < BARS_FOR_RISK);

      /* ----------------------------------------------------------------
         DIE EINE PRIMAERE KLASSE. Reihenfolge ist Absicht: sie geht vom
         Unumstoesslichen zum Behebbaren, damit ein Titel nicht in der
         mildesten Klasse landet, obwohl eine haertere Grenze gilt.
         ---------------------------------------------------------------- */
      let klasse, klasseDetail;
      if (ohneGeschaeft) {
        klasse = "NOT_APPLICABLE";
        klasseDetail = "Branchenschluessel " + sic + ": " + ohneGeschaeft +
          " - kein operatives Geschaeft, das diese Faktoren messen";
      } else if (!cik) {
        /* ZWEI LAGEN, NICHT EINE.
         *
         * Gemessen: von 452 Titeln ohne nutzbare SEC-Quelle tragen 45 im
         * Company-Master das Flag HAS_SEC. "Keine CIK" und "CIK da, aber kein
         * Export" sind verschiedene Befunde - der erste sagt, das Kuerzel
         * steht nicht in den SEC-Verzeichnissen, der zweite, dass der Export
         * fuer diesen Emittenten fehlt. Nur der erste ist ueberhaupt ein
         * Kandidat fuer eine fremde Quelle; der zweite liegt im Haus. */
        klasse = "SEC_NO_CIK";
        klasseDetail = "kein CIK zugeordnet - das Kuerzel steht nicht in den SEC-Verzeichnissen" +
          (secFlag.get(ticker) ? " (der Company-Master sieht trotzdem SEC-Material: Mapping pruefen)" : "");
      } else if (exp && exp.fehlt) {
        klasse = "SEC_CIK_BUT_NO_EXPORT";
        klasseDetail = "CIK " + cik + " vorhanden, aber kein Konsum-Export unter diesem Emittenten";
      } else if (exp && exp.metrikenZahl === 0) {
        klasse = "TRUE_NO_FUNDAMENTALS";
        klasseDetail = "Konsum-Export vorhanden, traegt aber keine einzige Kennzahlreihe";
      } else if (sektorBlockiert) {
        klasse = "NOT_APPLICABLE";
        klasseDetail = "Branchenvorlage fehlt (SECTOR_TEMPLATE_MISSING) fuer Branchenschluessel " + (sic ?? "unbekannt");
      } else if (fundamentalsFehlen) {
        klasse = "PARTIAL_FUNDAMENTALS";
        klasseDetail = "Konsum-Export mit " + exp.metrikenZahl + " Kennzahlreihen vorhanden, der Faktorlauf " +
          "hat ihn aber nicht als Fundamentalsatz uebernommen (fundamentalsAsOf fehlt)";
      } else if (preisfaktorenDuenn) {
        klasse = "INSUFFICIENT_HISTORY";
        klasseDetail = bars + " Handelstage - Schwankungsbreite und Beta brauchen " + BARS_FOR_RISK;
      } else {
        klasse = "RAW_FUNDAMENTALS_PRESENT";
        klasseDetail = "Rohkennzahlen und Historie vorhanden; es scheitern einzelne Komponenten";
      }

      zeilen.push({
        ticker, name: namen.get(ticker) || null, securityType: arten.get(ticker) || null,
        cik, sic, peerLevel: row.peer ? row.peer.level : null,
        masterSeesSec: secFlag.get(ticker) === true,
        bars, marketCap: Number.isFinite(row.marketCap) ? row.marketCap : null,
        fundamentalsAsOf: row.fundamentalsAsOf || null,
        capabilityFundamentalsReady: vormerkung.get(ticker) ? vormerkung.get(ticker).fr === true : null,
        consumerExport: exp ? { present: !exp.fehlt, metrics: exp.metriken || [], metricCount: exp.metrikenZahl || 0,
          points: exp.punkte || 0, annualMetrics: exp.jahresMetriken || [], fiscalYears: exp.fiscalYears || 0,
          fiscalYearList: exp.fiscalYearList || [], maxQuarters: exp.maxQuarters || 0 } : null,
        priceFactorsThin: preisfaktorenDuenn,
        barsShortOf: { risk: bars !== null ? Math.max(0, BARS_FOR_RISK - bars) : null,
                       momentum12m1m: bars !== null ? Math.max(0, BARS_FOR_MOMENTUM_12M1M - bars) : null },
        klasse, klasseDetail,
        factors: jeFaktor
      });
    }
  }

  /* ---------------- Aggregate ---------------- */
  const klassen = {};
  for (const z of zeilen) klassen[z.klasse] = (klassen[z.klasse] || 0) + 1;

  /* Ueberlappende Messungen - ausdruecklich KEINE Partition, weil ein Titel
     mehrere dieser Eigenschaften zugleich haben kann. */
  const merkmale = {
    RAW_FUNDAMENTALS_PRESENT: zeilen.filter((z) => z.consumerExport && z.consumerExport.metricCount > 0).length,
    PARTIAL_FUNDAMENTALS: zeilen.filter((z) => z.consumerExport && z.consumerExport.metricCount > 0 && !z.fundamentalsAsOf).length,
    INSUFFICIENT_HISTORY: zeilen.filter((z) => z.priceFactorsThin).length,
    NOT_APPLICABLE: zeilen.filter((z) => z.klasse === "NOT_APPLICABLE").length,
    SEC_SOURCE_UNAVAILABLE: zeilen.filter((z) => !z.cik || (z.consumerExport && !z.consumerExport.present)).length,
    SEC_NO_CIK: zeilen.filter((z) => !z.cik).length,
    SEC_CIK_BUT_NO_EXPORT: zeilen.filter((z) => z.cik && z.consumerExport && !z.consumerExport.present).length,
    MASTER_SEES_SEC_BUT_RUN_DOES_NOT: zeilen.filter((z) => z.masterSeesSec && (!z.cik || (z.consumerExport && !z.consumerExport.present))).length,
    TRUE_NO_FUNDAMENTALS: zeilen.filter((z) => z.consumerExport && z.consumerExport.present && z.consumerExport.metricCount === 0).length
  };
  /* Ein Titel ist erst dann Kandidat fuer einen externen Anbieter, wenn die
     SEC-Quelle ihn NICHT deckt und er ein operatives Geschaeft hat - sonst
     wuerde ein Anbieter etwas liefern, das die Methodik gar nicht messen will,
     oder etwas, das schon hier liegt. */
  merkmale.EXTERNAL_PROVIDER_CANDIDATE = zeilen.filter((z) =>
    z.klasse === "SEC_NO_CIK" && !SIC_OHNE_OPERATIVES_GESCHAEFT[z.sic]).length;

  /* ----------------------------------------------------------------------
     WAS EINE PERFEKTE FUNDAMENTALQUELLE HEUTE BRINGEN WUERDE - UND WAS NICHT.

     Ohne diesen Querschnitt liest sich die Klassenverteilung, als koennte eine
     fremde Quelle 407 Titel oeffnen. Zwei Faktoren dieser Methodik haengen
     aber an KEINER Fundamentalzahl: Kursentwicklung und Schwankungsbreite
     brauchen 252 beziehungsweise 273 Handelstage. Und die Dreijahresfenster
     der Fundamentalfaktoren brauchen drei Geschaeftsjahre, die ein Titel mit
     einem einzigen Quartalsbericht nicht haben kann - von keinem Anbieter.
     ---------------------------------------------------------------------- */
  const querschnitt = {
    note: "Gezaehlt werden Titel, nicht Faktoren. `priceFactorsBlockedByHistory` waere auch mit " +
      "vollstaendigen Fundamentaldaten weiter ohne Kursentwicklung und Schwankungsbreite.",
    priceFactorsBlockedByHistory: zeilen.filter((z) => z.bars !== null && z.bars < BARS_FOR_RISK).length,
    priceFactorsPossibleToday: zeilen.filter((z) => z.bars !== null && z.bars >= BARS_FOR_RISK).length,
    threeFiscalYearsAvailable: zeilen.filter((z) => z.consumerExport && z.consumerExport.fiscalYears >= 3).length,
    oneOrTwoFiscalYears: zeilen.filter((z) => z.consumerExport && z.consumerExport.fiscalYears > 0 && z.consumerExport.fiscalYears < 3).length,
    noFiscalYearAtAll: zeilen.filter((z) => !z.consumerExport || z.consumerExport.fiscalYears === 0).length,
    /* Ein Titel, bei dem BEIDES heute moeglich waere: genug Handelstage und
       drei Geschaeftsjahre. Nur hier koennte eine bessere Zuordnung oder eine
       fremde Quelle heute einen Faktor freischalten. */
    bothPossibleToday: zeilen.filter((z) => z.bars !== null && z.bars >= BARS_FOR_RISK
      && z.consumerExport && z.consumerExport.fiscalYears >= 3).length,
    /* Vier Quartale in derselben Reihe: die Schwelle, ab der TTM ueberhaupt
       rechenbar ist - also Bewertungsrenditen und Margen. */
    fourQuartersInOneMetric: zeilen.filter((z) => z.consumerExport && z.consumerExport.maxQuarters >= 4).length,
    fewerThanFourQuarters: zeilen.filter((z) => z.consumerExport && z.consumerExport.maxQuarters > 0 && z.consumerExport.maxQuarters < 4).length
  };

  /* ----------------------------------------------------------------------
     NOT_APPLICABLE IST NICHT EINE LAGE, SONDERN ZWEI.

     (a) Keine operative Gesellschaft: eine Uebernahmehuelle (SIC 6770) oder
         ein Fonds hat kein Geschaeft, dessen Qualitaet oder Wachstum man
         messen koennte. Hier fehlt nichts - die Frage passt nicht.
     (b) Operatives Geschaeft, aber der Methodik fehlt die Branchenvorlage
         (SECTOR_TEMPLATE_MISSING): Banken, Sparinstitute, Broker und REITs.
         Gemessen tragen mehrere davon TIEFE Fundamentaldaten - ADAMO,
         RWTQ, RWTS und WSBCO je zwoelf Geschaeftsjahre. Ihre Zurueckhaltung
         ist eine Methodikentscheidung im Haus und keine Datengrenze.
     ---------------------------------------------------------------------- */
  const strukturell = zeilen.filter((z) => z.klasse === "NOT_APPLICABLE" && SIC_OHNE_OPERATIVES_GESCHAEFT[z.sic]);
  const vorlageFehlt = zeilen.filter((z) => z.klasse === "NOT_APPLICABLE" && !SIC_OHNE_OPERATIVES_GESCHAEFT[z.sic]);
  const naAufteilung = {
    noOperatingBusiness: strukturell.length,
    noOperatingBusinessBySic: strukturell.reduce((acc, z) => { acc[z.sic] = (acc[z.sic] || 0) + 1; return acc; }, {}),
    sectorTemplateMissing: vorlageFehlt.length,
    sectorTemplateMissingBySic: vorlageFehlt.reduce((acc, z) => { acc[z.sic] = (acc[z.sic] || 0) + 1; return acc; }, {}),
    sectorTemplateMissingWithDeepHistory: vorlageFehlt
      .filter((z) => z.consumerExport && z.consumerExport.fiscalYears >= 3)
      .map((z) => ({ ticker: z.ticker, sic: z.sic, fiscalYears: z.consumerExport.fiscalYears,
                     metricCount: z.consumerExport.metricCount, bars: z.bars }))
      .sort((a, b) => b.fiscalYears - a.fiscalYears)
  };

  /* Je Faktor die haeufigsten fehlenden Inputs. */
  const jeFaktorInputs = {};
  for (const z of zeilen) {
    for (const [fid, f] of Object.entries(z.factors)) {
      jeFaktorInputs[fid] = jeFaktorInputs[fid] || { factorState: {}, reasons: {}, components: {} };
      jeFaktorInputs[fid].factorState[f.state] = (jeFaktorInputs[fid].factorState[f.state] || 0) + 1;
      if (f.reason) jeFaktorInputs[fid].reasons[f.reason] = (jeFaktorInputs[fid].reasons[f.reason] || 0) + 1;
      for (const m of f.missing || []) {
        const eintrag = jeFaktorInputs[fid].components[m.id] = jeFaktorInputs[fid].components[m.id]
          || { titles: 0, input: komponentenInputs[fid + ":" + m.id] || null, reasons: {} };
        eintrag.titles += 1;
        eintrag.reasons[m.reason] = (eintrag.reasons[m.reason] || 0) + 1;
      }
    }
  }

  const bericht = {
    schemaVersion: "zero-factor-classification-1.0.0",
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
    question: "Welche Grenze genau haelt die Screening-Zeilen ohne einen einzigen Faktorwert auf, " +
      "und wie viel davon waere ohne neue Datenquelle loesbar?",
    sources: {
      factors: "quant/data/product/factor-evidence-v1 (Zustaende und Gruende je Titel, je Faktor, je Komponente)",
      consumer: "quant/data/sec/consumer/CIK*.json",
      coverage: "quant/data/sec/consumer_coverage.json",
      capability: "quant/data/universe/market-capability.json",
      names: "quant/data/universe/search/sym"
    },
    note: "Gelesen, nicht gerechnet: die Gruende stammen aus dem Materialisierungslauf selbst. " +
      "`classes` ist eine Partition (jeder Titel genau einmal), `features` sind ueberlappende Merkmale.",
    componentInputs: komponentenInputs,
    universeChecked: geprueft,
    TOTAL_ZERO_FACTOR_ROWS: zeilen.length,
    classes: klassen,
    features: merkmale,
    secCoverageContext: coverage ? {
      productUniverse: coverage.productUniverse, cikMapped: coverage.cikMapped, withoutCik: coverage.withoutCik,
      secAvailable: coverage.secAvailable, notInCompanyFacts: coverage.notInCompanyFacts,
      annualHistory: coverage.annualHistory, history3y: coverage.history3y
    } : null,
    notApplicableBreakdown: naAufteilung,
    whatABetterSourceWouldChange: querschnitt,
    perFactor: jeFaktorInputs,
    rows: zeilen
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(bericht, null, 1) + "\n");

  /* ---------------- Ausgabe ---------------- */
  const p = (n) => String(n).padStart(5);
  process.stdout.write("\nZeilen ohne einen einzigen Faktorwert: " + zeilen.length + " von " + geprueft + " geprueften Titeln\n\n");
  process.stdout.write("PRIMAERE KLASSE (Partition, jeder Titel genau einmal)\n");
  for (const [k, v] of Object.entries(klassen).sort((a, b) => b[1] - a[1])) {
    process.stdout.write("  " + k.padEnd(28) + p(v) + "   " + (100 * v / zeilen.length).toFixed(1) + " %\n");
  }
  process.stdout.write("\nMERKMALE (ueberlappend)\n");
  for (const [k, v] of Object.entries(merkmale)) process.stdout.write("  " + k.padEnd(28) + p(v) + "\n");
  process.stdout.write("\nNOT_APPLICABLE, AUFGETEILT\n");
  process.stdout.write("  keine operative Gesellschaft     " + p(naAufteilung.noOperatingBusiness) +
    "   SIC " + JSON.stringify(naAufteilung.noOperatingBusinessBySic) + "\n");
  process.stdout.write("  Branchenvorlage fehlt            " + p(naAufteilung.sectorTemplateMissing) +
    "   SIC " + JSON.stringify(naAufteilung.sectorTemplateMissingBySic) + "\n");
  process.stdout.write("    davon mit >= 3 Geschaeftsjahren " + p(naAufteilung.sectorTemplateMissingWithDeepHistory.length) +
    "   " + naAufteilung.sectorTemplateMissingWithDeepHistory.slice(0, 6)
      .map((x) => x.ticker + " (" + x.fiscalYears + "J)").join(" · ") + "\n");
  process.stdout.write("\nWAS EINE PERFEKTE FUNDAMENTALQUELLE HEUTE AENDERN WUERDE\n");
  for (const [k, v] of Object.entries(querschnitt)) if (k !== "note") process.stdout.write("  " + k.padEnd(34) + p(v) + "\n");
  process.stdout.write("\nJE FAKTOR: Zustand und die haeufigsten fehlenden Komponenten\n");
  for (const [fid, f] of Object.entries(jeFaktorInputs)) {
    process.stdout.write("  " + fid + "  " + Object.entries(f.factorState).map(([s, n]) => s + " " + n).join(" · ") +
      "  |  Gruende: " + Object.entries(f.reasons).sort((a, b) => b[1] - a[1]).map(([r, n]) => r + " " + n).join(" · ") + "\n");
    const top = Object.entries(f.components).sort((a, b) => b[1].titles - a[1].titles).slice(0, 6);
    for (const [cid, c] of top) {
      process.stdout.write("      " + cid.padEnd(28) + p(c.titles) + " Titel   " +
        Object.entries(c.reasons).sort((a, b) => b[1] - a[1]).map(([r, n]) => r + " " + n).join(" · ") +
        (c.input ? "   [" + c.input + "]" : "") + "\n");
    }
  }
  process.stdout.write("\n  " + OUT.replace(ROOT + "/", "") + "\n");
}

main();
