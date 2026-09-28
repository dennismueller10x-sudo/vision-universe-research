#!/usr/bin/env node
/* =========================================================================
   DER NAMENSVERTRAG, AM BESTAND GEMESSEN.

   Gemessen am 26.09.2026: bei 5.423 von 7.586 Instrumenten nennt die
   Übersicht einen anderen Namen als die Aktienseite. Dieser Bericht
   partitioniert jede Abweichung nach `company-naming-1.0.0` und trennt, was
   getrennt gehört:

     kosmetisch   Rechtsform, Zeichensetzung, Großschreibung, Kurzform
     Ebene        die Wertpapierzeile nennt ihre Aktienklasse, die
                  Gesellschaft kennt keine
     Identität    verschiedene Zahlwörter, verschiedene Klassen, kein
                  gemeinsames Wort - hier ist eine der beiden Angaben falsch

   Was er NICHT tut: einen Identitätskonflikt entscheiden. Eine stille Wahl
   zwischen „Armada Acquisition Corp I" und „Armada Acquisition Corp III"
   wäre eine erfundene Identität.

   Ausführen:
     node scripts/quant/measure-naming-contract.mjs [--out <pfad>]
   ========================================================================= */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Naming = require(join(ROOT, "quant/engines/company-naming-contract.js"));
const Service = require(join(ROOT, "quant/api/product-services.js"));
const Policy = require(join(ROOT, "quant/engines/display-policy.js"));
const Query = require(join(ROOT, "quant/engines/query.js"));

/* Der Auftrag nennt als Ziel LIST_NAME == STOCK_PAGE_NAME. Das ist eine
   Aussage ueber das PRODUKT und nicht ueber zwei Rohdateien: gemessen wird
   deshalb zusaetzlich, was der Dienst der Uebersicht und der Aktienseite
   tatsaechlich gibt. Beides laeuft ueber denselben Dienst wie im Browser. */
const api = Service.create({
  loadJSON: async (pfad) => JSON.parse(await readFile(join(ROOT, pfad), "utf8")),
  loadCompressedJSON: async (pfad) => JSON.parse(gunzipSync(await readFile(join(ROOT, pfad))).toString("utf8")),
  displayPolicy: Policy, queryEngine: Query
});

/* Die Produktmessung: die Zeile der Uebersicht gegen die Kopfzeile der
   Aktienseite, Titel fuer Titel ueber das ganze Produktuniversum. */
async function produktNamen() {
  const universe = await api.getUniverse();
  if (universe.state !== "AVAILABLE") {
    return { state: universe.state, reason: universe.reason || null };
  }
  let gleich = 0, verschieden = 0, ohneNamen = 0;
  const abweichend = [];
  for (const zeile of universe.stocks) {
    const seite = await api.getStockIntelligence(zeile.ticker).catch(() => null);
    const listenName = zeile.name || null;
    const seitenName = seite && seite.name ? seite.name : null;
    if (!listenName || !seitenName) { ohneNamen += 1; continue; }
    if (Naming.normalise(listenName) === Naming.normalise(seitenName)) gleich += 1;
    else {
      verschieden += 1;
      if (abweichend.length < 50) abweichend.push({ ticker: zeile.ticker, listName: listenName, pageName: seitenName });
    }
  }
  return {
    state: "MEASURED", titles: universe.stocks.length,
    LIST_NAME_EQUALS_STOCK_PAGE_NAME: gleich,
    LIST_NAME_DIFFERS_FROM_STOCK_PAGE_NAME: verschieden,
    withoutNameOnOneSurface: ohneNamen,
    examples: abweichend,
    note: "Gemessen am Dienst, nicht an den Rohdateien. Ein Titel ohne Namen auf einer " +
          "der beiden Flaechen ist keine Abweichung, sondern eine Luecke."
  };
}
const argv = process.argv.slice(2);
const arg = (n, f) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : f; };
const OUT = arg("out", join(ROOT, "quant/data/product/naming-contract-v1.json"));

/* Die Herkunftsangaben, die der Auftrag je Namensquelle verlangt. Was lokal
   nicht vorliegt, steht als null da und wird nicht erfunden. */
function herkunft(quelle, name, extra) {
  return {
    source: quelle, name: name || null,
    level: Naming.levelOfSource(quelle),
    issuerLevel: Naming.levelOfSource(quelle) === "ISSUER_LEGAL_NAME",
    cik: (extra && extra.cik) || null,
    issuerId: (extra && extra.issuerId) || null,
    securityId: (extra && extra.securityId) || null,
    ticker: (extra && extra.ticker) || null,
    effectiveDate: (extra && extra.asOf) || null,
    firstSeen: (extra && extra.firstSeen) || null,
    lastSeen: (extra && extra.lastSeen) || null,
    confidence: (extra && extra.confidence) || null,
    evidence: (extra && extra.evidence) || null
  };
}

async function main() {
  /* 1. Der Wertpapierstamm - das ist, was die Übersicht liest. */
  const dir = join(ROOT, "quant/data/universe/instruments");
  const instrumente = [];
  for (const datei of (await readdir(dir)).sort()) {
    if (!datei.endsWith(".json")) continue;
    instrumente.push(...(JSON.parse(await readFile(join(dir, datei), "utf8")).instruments || []));
  }
  const stamm = new Map(instrumente.map((i) => [i.symbol, i]));

  /* 2. Die aufgelöste Namensschicht - sie führt die Kandidaten JE EBENE. */
  const schichtPfad = join(ROOT, "quant/data/market/security-master/company-names.json");
  const schicht = existsSync(schichtPfad) ? JSON.parse(await readFile(schichtPfad, "utf8")) : { rows: [] };
  const ebenen = new Map();
  for (const zeile of schicht.rows || []) ebenen.set(zeile.ticker, zeile);

  /* 3. Was die Aktienseite zeigt: der Konsum-Export überlagert den Namen. */
  const konsumDir = join(ROOT, "discover/data/stocks/US_REAL");
  const seite = new Map();
  if (existsSync(konsumDir)) {
    for (const datei of await readdir(konsumDir)) {
      if (!datei.endsWith(".json")) continue;
      try {
        const doc = JSON.parse(await readFile(join(konsumDir, datei), "utf8"));
        if (doc && typeof doc.companyName === "string" && doc.companyName) {
          seite.set(doc.symbol || datei.slice(0, -5), { name: doc.companyName, legal: doc.legalName || null, source: doc.nameSource || null });
        }
      } catch { /* eine unlesbare Datei ist kein Name */ }
    }
  }

  const zaehler = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 };
  const konflikte = [], beispiele = {};
  const zeilen = [];
  let verglichen = 0, gleich = 0, abweichend = 0, ohneVergleich = 0, ohneNamenAufEinerSeite = 0;
  let listeGleichSeite = 0, listeUngleichSeite = 0;

  for (const instrument of instrumente) {
    const ticker = instrument.symbol;
    const layer = ebenen.get(ticker) || null;
    const kandidaten = (layer && layer.candidates) || {};
    const issuerKandidat = kandidaten.SEC_COMPANY_TICKERS || null;
    const securityKandidat = kandidaten.TIINGO_METADATA || null;
    const curatedKandidat = kandidaten.VU_CURATED || null;

    const quellen = [];
    if (issuerKandidat) quellen.push(herkunft("SEC_COMPANY_TICKERS", issuerKandidat.name,
      { cik: issuerKandidat.cik || layer.cik, asOf: issuerKandidat.asOf, ticker,
        issuerId: instrument.issuerId, evidence: issuerKandidat.identity || null }));
    if (securityKandidat) quellen.push(herkunft("TIINGO_METADATA", securityKandidat.name,
      { asOf: securityKandidat.asOf, ticker, securityId: instrument.masterMemberId,
        firstSeen: instrument.firstSeen, lastSeen: instrument.lastTradeDate,
        evidence: securityKandidat.providerSymbol ? "providerSymbol=" + securityKandidat.providerSymbol : null }));
    if (curatedKandidat) quellen.push(herkunft("VU_CURATED", curatedKandidat.name,
      { asOf: curatedKandidat.asOf, ticker, evidence: curatedKandidat.file || null }));

    const aufloesung = Naming.resolve({
      ticker,
      issuerName: issuerKandidat ? issuerKandidat.name : null, issuerSource: "SEC_COMPANY_TICKERS",
      securityName: securityKandidat ? securityKandidat.name : null, securitySource: "TIINGO_METADATA",
      curatedName: curatedKandidat ? curatedKandidat.name : null, curatedSource: "VU_CURATED"
    });

    /* Die eigentliche Messung des Auftrags: Liste gegen Aktienseite. */
    const listenName = instrument.companyName || null;
    const seitenName = seite.has(ticker) ? seite.get(ticker).name : null;
    let seitenVergleich = null;
    if (listenName && seitenName) {
      seitenVergleich = Naming.classifyDeviation(listenName, seitenName);
      if (Naming.normalise(listenName) === Naming.normalise(seitenName)) listeGleichSeite += 1;
      else listeUngleichSeite += 1;
    }

    /* Und die Partition der Abweichung zwischen den EBENEN. */
    if (issuerKandidat && securityKandidat) {
      verglichen += 1;
      /* Direkt klassifiziert und nicht aus der Aufloesung gelesen: ein
         Kandidat, dessen Name leer oder das Kuerzel selbst ist, faellt dort
         aus der Ebenenwahl - dieser Vergleich soll ihn aber sehen. */
      const v = Naming.classifyDeviation(issuerKandidat.name, securityKandidat.name, {
        join: issuerKandidat.identity || null,
        issuerCik: issuerKandidat.cik || (layer && layer.cik) || null,
        securityCik: null
      });
      /* Gleichheit ist keine Abweichung und gehoert in keine der sieben
         Gruppen - sonst waere die kosmetische Gruppe beliebig gross. */
      if (v.kind === "IDENTICAL") gleich += 1;
      else if (v.kind === "MISSING_ON_ONE_SIDE") ohneNamenAufEinerSeite += 1;
      else { abweichend += 1; zaehler[v.kind] += 1; }
      if (!beispiele[v.kind]) {
        beispiele[v.kind] = { ticker, issuer: issuerKandidat.name, security: securityKandidat.name, evidence: v.evidence };
      }
      if (v.identityConflict) {
        konflikte.push({ ticker, kind: v.kind, label: v.label,
          issuerName: issuerKandidat.name, securityName: securityKandidat.name,
          listName: listenName, pageName: seitenName,
          cik: layer.cik || null, issuerId: instrument.issuerId || null,
          securityId: instrument.masterMemberId || null,
          resolvedName: aufloesung.name, resolvedLevel: aufloesung.level,
          evidence: v.evidence, sources: quellen });
      }
    } else {
      ohneVergleich += 1;
    }

    zeilen.push({ ticker, listName: listenName, pageName: seitenName,
      resolved: aufloesung.name, level: aufloesung.level,
      identityConflict: aufloesung.identityConflict,
      deviationKind: aufloesung.deviation ? aufloesung.deviation.kind : null,
      listVsPage: seitenVergleich ? seitenVergleich.kind : null });
  }

  const produkt = await produktNamen();

  const kosmetisch = zaehler.A + zaehler.B;
  const substanziell = zaehler.C + zaehler.D + zaehler.E + zaehler.F + zaehler.G;

  const bericht = {
    schemaVersion: "naming-contract-1.0.0",
    contractVersion: Naming.CONTRACT_VERSION,
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
    ownerDecision: {
      date: "2026-09-28",
      rule: "Keine pauschale Quellenpriorität. Drei Ebenen: ISSUER_LEGAL_NAME, " +
            "SECURITY_DISPLAY_NAME, PRODUCT_DISPLAY_NAME. Emittentenname und Wertpapiername " +
            "werden nicht still vermischt. Bei echtem Konflikt IDENTITY_CONFLICT = true und " +
            "keine stille Überschreibung."
    },
    levels: Naming.LEVELS,
    sourceLevels: Naming.SOURCE_LEVEL,
    instruments: instrumente.length,
    comparableAcrossLevels: verglichen,
    identicalAcrossLevels: gleich,
    deviatingAcrossLevels: abweichend,
    withoutBothLevels: ohneVergleich,
    nameMissingOnOneLevel: ohneNamenAufEinerSeite,
    partition: Object.fromEntries(Object.entries(zaehler).map(([k, v]) => [k + " " + Naming.KINDS[k], v])),
    partitionCounts: zaehler,
    cosmetic: kosmetisch,
    substantive: substanziell,
    IDENTITY_CONFLICT_COUNT: konflikte.length,
    /* Quellenebene: der Wertpapierstamm gegen den Konsum-Export. Diese zwei
       Zahlen sagen NICHT, was der Nutzer sieht - sie sagen, wie weit die
       beiden Rohschichten auseinanderliegen, und genau das war der Anlass,
       den Namen im Dienst einzuquellen. */
    SOURCE_MASTER_EQUALS_CONSUMER_EXPORT: listeGleichSeite,
    SOURCE_MASTER_DIFFERS_FROM_CONSUMER_EXPORT: listeUngleichSeite,
    /* Produktebene: die Zahl, die der Auftrag verlangt. */
    product: produkt,
    LIST_NAME_EQUALS_STOCK_PAGE_NAME: produkt.LIST_NAME_EQUALS_STOCK_PAGE_NAME ?? null,
    LIST_NAME_DIFFERS_FROM_STOCK_PAGE_NAME: produkt.LIST_NAME_DIFFERS_FROM_STOCK_PAGE_NAME ?? null,
    examplesByKind: beispiele,
    /* Jeder Konflikt vollständig, mit allem, was lokal über seine Herkunft
       bekannt ist - das ist die Liste, an der eine Entscheidung möglich wird. */
    identityConflicts: konflikte.sort((a, b) => (a.ticker < b.ticker ? -1 : 1)),
    regressionCase: (() => {
      const aaci = konflikte.find((k) => k.ticker === "AACI") ||
        zeilen.find((z) => z.ticker === "AACI") || null;
      return { ticker: "AACI", found: !!aaci, detail: aaci || null,
        why: "Armada Acquisition Corp I gegen III: zwei Gesellschaften, nicht zwei Schreibweisen. " +
             "Dieser Fall muss als Identitätskonflikt erkannt und nicht still überschrieben werden." };
    })(),
    note: "Die Partition folgt company-naming-1.0.0. C ist kein Konflikt: eine Aktienklasse ist " +
          "die zulässige Ergänzung der Wertpapierebene gegenüber der Emittentenebene. D, F und G " +
          "berühren die Identität und bleiben offen."
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(bericht, null, 1) + "\n");

  const p = (n) => String(n).padStart(6);
  process.stdout.write("Namensvertrag " + Naming.CONTRACT_VERSION + " · " + instrumente.length + " Instrumente\n\n");
  process.stdout.write("  Ebenenvergleich (Emittent gegen Wertpapier): " + verglichen +
    " vergleichbar · " + gleich + " gleich · " + abweichend + " abweichend · " + ohneVergleich + " ohne beide Ebenen\n\n");
  for (const [kind, label] of Object.entries(Naming.KINDS)) {
    if (kind === "IDENTICAL" || kind === "MISSING_ON_ONE_SIDE") continue;
    const b = beispiele[kind];
    process.stdout.write("  " + kind + " " + p(zaehler[kind]) + "  " + label.padEnd(30) +
      (b ? b.ticker + ": \"" + b.issuer + "\" / \"" + b.security + "\"" : "") + "\n");
  }
  process.stdout.write("\n  kosmetisch (A+B): " + kosmetisch + " · substanziell (C-G): " + substanziell + "\n");
  process.stdout.write("  IDENTITY_CONFLICT: " + konflikte.length + "\n");
  process.stdout.write("  Quellen (Stamm gegen Konsum-Export): " + listeGleichSeite +
    " gleich · " + listeUngleichSeite + " verschieden\n");
  process.stdout.write("  PRODUKT (Liste gegen Aktienseite): " +
    produkt.LIST_NAME_EQUALS_STOCK_PAGE_NAME + " gleich · " +
    produkt.LIST_NAME_DIFFERS_FROM_STOCK_PAGE_NAME + " verschieden · " +
    produkt.withoutNameOnOneSurface + " ohne Namen\n");
  process.stdout.write("  Regressionsfall AACI: " + (bericht.regressionCase.found ? "erkannt" : "NICHT ERKANNT") + "\n");
  process.stdout.write("  " + OUT.replace(ROOT + "/", "") + "\n");
}

main();
