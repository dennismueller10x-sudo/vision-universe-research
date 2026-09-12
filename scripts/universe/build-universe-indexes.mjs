/* =========================================================================
   VISION UNIVERSE — build-universe-indexes.mjs   (§18, §19, §30, §43)

   Aus dem Company Master werden die Dinge, die eine Oberflaeche wirklich
   laedt: ein Suchindex in Scherben, eine Faehigkeitsmatrix und der
   Deckungsbericht.

   DER SUCHINDEX HAT ZWEI WEGE

   Wer "NVDA" tippt, sucht ein Kuerzel. Wer "Palantir" tippt, sucht einen
   Namen. Ein einziger Index, der beides kann, muss vollstaendig im
   Browser liegen - bei 5.700 Titeln sind das einige hundert Kilobyte, bei
   25.000 ein Megabyte, und das laedt niemand, nur weil ein Suchfeld
   aufgeht (§19, §49). Deshalb zwei Scherbenwege: nach Kuerzelanfang und
   nach Namensanfang, je zwei Zeichen. Eine Anfrage laedt hoechstens zwei
   kleine Dateien.

   DIE FAEHIGKEITSMATRIX TRENNT ZWEI FRAGEN (§30)

     PROVIDER_VERIFIED  Der Datenweg kann es liefern - gemessen, mit
                        Anbieterzugang, in einem echten Lauf.
     DELIVERED          Es liegt in diesem Repository und funktioniert
                        ohne Anbieterzugang.

   Ohne diese Trennung stuende fuer 5.684 Titel "hat Kursverlauf", und die
   Aktienseite zeigte fuer 5.679 davon ein leeres Chart. Die Oberflaeche
   fragt DELIVERED, bevor sie zeichnet.

   Ausfuehren: node scripts/universe/build-universe-indexes.mjs
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const Master = require(join(root, "quant", "engines", "company-master.js"));

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}

/* Ein absoluter Pfad bleibt absolut. join(root, "/tmp/x") ergibt
   "<root>/tmp/x" - die Datei landet dann im Repository statt dort, wo sie
   hin sollte. Gefunden hat das ein Test, der in ein Verzeichnis unter
   /tmp schreiben wollte und dabei das Arbeitsverzeichnis verschmutzt hat. */
function pfad(p) { return p.startsWith("/") ? p : join(root, p); }

const CONFIG = readJSON(join(root, "quant", "config", "company-master.json"));
const OUT_ROOT = pfad(arg("--out", CONFIG.storage.root));
const INSTRUMENT_DIR = join(OUT_ROOT, "instruments");
const SEARCH_DIR = join(OUT_ROOT, "search");

function readJSON(p) { return JSON.parse(readFileSync(p, "utf8")); }
function writeJSON(p, data, pretty) {
  mkdirSync(dirname(p), { recursive: true });
  const json = (pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)) + "\n";
  writeFileSync(p, json);
  return Buffer.byteLength(json);
}

function loadMaster() {
  if (!existsSync(INSTRUMENT_DIR)) {
    console.error("  Kein Company Master. Erst scripts/universe/build-company-master.mjs laufen lassen.");
    process.exit(2);
  }
  const out = [];
  for (const f of readdirSync(INSTRUMENT_DIR).filter((f) => f.endsWith(".json")).sort()) {
    for (const r of readJSON(join(INSTRUMENT_DIR, f)).instruments || []) out.push(r);
  }
  return out;
}

/* --------------------------------------------------------------- Belege

   Jede Faehigkeit braucht einen Beleg aus einer Datei, die es gibt. Was
   hier nicht eingesammelt wird, ist spaeter false - und zwar nicht, weil
   es unmoeglich waere, sondern weil es nicht gemessen wurde. */
function collectEvidence() {
  const ev = new Map();
  const sources = [];
  const get = (sym) => {
    const k = String(sym).toUpperCase();
    if (!ev.has(k)) ev.set(k, {});
    return ev.get(k);
  };

  /* 1. Kursdaten des Anbieters: die Gate-Laeufe fuehren je Titel, wie
        viele Bars geholt wurden und ob daraus Faktoren entstanden. */
  const scaleDir = join(root, "quant", "data", "market", "scale");
  if (existsSync(scaleDir)) {
    for (const f of readdirSync(scaleDir).filter((f) => /^gate-.*\.json$/.test(f)).sort()) {
      const gate = readJSON(join(scaleDir, f));
      const per = gate.perSymbol || {};
      let n = 0;
      for (const [sym, row] of Object.entries(per)) {
        const e = get(sym);
        const bars = Number(row.usable || row.bars || 0);
        if (bars > (e.priceHistoryBars || 0)) {
          e.priceHistoryBars = bars;
          e.priceHistoryFirst = row.first || null;
          e.priceHistoryLast = row.last || null;
          e.priceHistorySource = "gate:" + (gate.gate || f);
          e.factorReady = row.factorReady === true;
          e.dataQuality = row.status || null;
          /* Ein Kursstand gilt als vorhanden, wenn die letzte Bar nicht
             abgestanden ist. Die Schwelle steht im Lauf selbst. */
          e.priceSnapshot = bars > 0 && Number(row.staleTradingDays || 0) <= 5;
        }
        n++;
      }
      /* Der Gate-Bericht fuehrt Einzelzeilen nur fuer BEFUNDE - alles
         ausser PASS. Wer sauber durchgelaufen ist, steht nicht drin. Die
         Titel des Gate-Universums, die im Bericht fehlen, sind deshalb
         genau die geprueften ohne Beanstandung; sie bekommen ein
         belegtes Ja ohne Barzahl statt eines stillschweigenden Nein.
         (Ohne diese Zeile fehlten 2.238 einwandfreie Titel in der
         Faehigkeitsbilanz - und zwar die besten.) */
      const universeFile = join(scaleDir, f.replace(/^gate-/, "universe-"));
      let implied = 0;
      if (existsSync(universeFile)) {
        const detail = gate.perSymbolDetail || {};
        const reportIsPartial = detail.symbolsTotal && detail.symbolsInReport &&
                                detail.symbolsInReport < detail.symbolsTotal;
        if (reportIsPartial) {
          for (const sec of readJSON(universeFile).securities || []) {
            const sym = String(sec.ticker).toUpperCase();
            if (per[sym]) continue;
            const e = get(sym);
            if (e.priceHistoryBars || e.priceHistoryVerified) continue;
            e.priceHistoryVerified = true;
            e.priceHistoryBars = 0;
            e.priceSnapshot = true;
            e.factorReady = true;
            e.dataQuality = "PASS";
            e.priceHistorySource = "gate:" + (gate.gate || f) + " (PASS, ohne Einzelzeile im Bericht)";
            implied++;
          }
        }
      }
      if (n || implied) {
        sources.push({ file: "quant/data/market/scale/" + f, kind: "providerPriceHistory",
                       symbolsWithReportRow: n, symbolsImpliedPass: implied });
      }
    }
  }

  /* 2. Ausgelieferte Kursreihen. Im Repository liegen nur die der
        Development-Preview-Titel - alles andere bleibt aus
        Redistributionsgruenden in der Arbeitsablage. */
  const goldenDir = join(root, "quant", "data", "market", "golden-preview", "daily");
  if (existsSync(goldenDir)) {
    let n = 0;
    for (const f of readdirSync(goldenDir).filter((f) => f.endsWith(".json"))) {
      const payload = readJSON(join(goldenDir, f));
      const sym = (payload.ticker || payload.symbol || f.replace(/\.json$/, "")).toUpperCase();
      const bars = (payload.bars || payload.data || []).length;
      if (!bars) continue;
      const e = get(sym);
      e.deliveredPriceHistoryBars = bars;
      e.deliveredPriceSnapshot = true;
      n++;
    }
    if (n) sources.push({ file: "quant/data/market/golden-preview/daily/", kind: "deliveredPriceHistory", symbols: n });
  }

  /* 3. Ausgelieferte Discover-Payloads: fuer diese Titel gibt es heute
        eine Aktienseite mit gerechneten Kennzahlen. */
  const stockDir = join(root, "discover", "data", "stocks", "US_REAL");
  if (existsSync(stockDir)) {
    let n = 0;
    for (const f of readdirSync(stockDir).filter((f) => f.endsWith(".json"))) {
      const e = get(f.replace(/\.json$/, ""));
      e.deliveredProfile = true;
      e.deliveredMetrics = true;
      n++;
    }
    if (n) sources.push({ file: "discover/data/stocks/US_REAL/", kind: "deliveredStockPage", symbols: n });
  }

  /* 4. Intraday und Live sind AM KONTO gemessen, nicht am Titel. Die
        Messung lief an den Canary-Titeln; fuer alle anderen ist die
        Antwort "nicht gemessen" und nicht "ja". */
  const retest = join(root, "quant", "data", "market", "commercial", "capability-retest.json");
  if (existsSync(retest)) {
    const payload = readJSON(retest);
    const rows = payload.perSymbol || payload.symbols || payload.results || {};
    let n = 0;
    for (const [sym, row] of Object.entries(rows)) {
      const e = get(sym);
      const caps = row.capabilities || row;
      if (caps && (caps.intraday === "VERIFIED" || (caps.intraday && caps.intraday.status === "VERIFIED"))) {
        e.intraday = true; n++;
      }
    }
    if (n) sources.push({ file: "quant/data/market/commercial/capability-retest.json", kind: "intraday", symbols: n });
  }
  const live = join(root, "quant", "data", "market", "commercial", "live-candle-verification.json");
  if (existsSync(live)) {
    const payload = readJSON(live);
    const rows = payload.perSymbol || payload.symbols || payload.candles || {};
    let n = 0;
    for (const sym of Object.keys(rows)) { get(sym).live = true; n++; }
    if (n) sources.push({ file: "quant/data/market/commercial/live-candle-verification.json", kind: "live", symbols: n });
  }

  /* 5. SEC-Fundamentaldaten. Die kanonischen Factbooks liegen in der
        Arbeitsablage; ausgeliefert ist der Deckungsnachweis, und der
        nennt je Titel, wie viele Perioden vorliegen. */
  const secCoverage = join(root, "quant", "data", "sec", "coverage_matrix.json");
  if (existsSync(secCoverage)) {
    const payload = readJSON(secCoverage);
    const companies = payload.companies || payload.by_company || {};
    let n = 0;
    const each = Array.isArray(companies) ? companies : Object.values(companies);
    for (const c of each) {
      const sym = String(c.ticker || c.symbol || "").toUpperCase();
      if (!sym) continue;
      const periods = Number(c.periods || c.period_count ||
                             (c.periods_covered && c.periods_covered.length) || 0);
      const e = get(sym);
      e.fundamentalPeriods = periods || e.fundamentalPeriods || 0;
      if (c.cik) e.secCik = String(c.cik);
      n++;
    }
    if (n) sources.push({ file: "quant/data/sec/coverage_matrix.json", kind: "fundamentals", symbols: n });
  }
  const secIndex = join(root, "quant", "data", "sec", "canonical_index.json");
  if (existsSync(secIndex)) {
    const payload = readJSON(secIndex);
    const each = payload.companies || payload.entries || [];
    let n = 0;
    for (const c of each) {
      const sym = String(c.ticker || c.symbol || "").toUpperCase();
      if (!sym) continue;
      const e = get(sym);
      const periods = Number(c.periods || c.period_count || (c.annual || 0) + (c.quarterly || 0) || 0);
      if (periods > (e.fundamentalPeriods || 0)) e.fundamentalPeriods = periods;
      if (!e.fundamentalPeriods) e.fundamentalPeriods = 1;
      n++;
    }
    if (n) sources.push({ file: "quant/data/sec/canonical_index.json", kind: "fundamentals", symbols: n });
  }

  return { evidence: ev, sources };
}

/* ------------------------------------------------------------ Namensteile

   Woraus ein Namenstreffer entstehen darf. "Palantir Technologies Inc"
   wird unter PA und TE erreichbar - nicht unter IN: Rechtsformzusaetze
   erzeugen sonst Scherben mit tausenden Eintraegen, die niemand sucht. */
const NAME_STOPWORDS = new Set([
  "INC", "INCORPORATED", "CORP", "CORPORATION", "CO", "COMPANY", "LTD", "LIMITED",
  "LLC", "LP", "PLC", "SA", "NV", "AG", "THE", "CLASS", "CL", "COM", "COMMON",
  "STOCK", "SHARES", "SHS", "HOLDING", "HOLDINGS", "GROUP", "TRUST", "NEW",
  "AMERICAN", "DEPOSITARY", "ADR", "ADS", "SPONSORED"
]);

function nameTokens(name) {
  if (!name) return [];
  return String(name).toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !NAME_STOPWORDS.has(t));
}

function main() {
  console.log("Vision Universe — Suchindex, Faehigkeiten, Deckungsbericht\n");

  const instruments = loadMaster();
  console.log(`  Master:   ${instruments.length} Instrumente`);

  const { evidence, sources } = collectEvidence();
  console.log(`  Belege:   ${evidence.size} Titel aus ${sources.length} Quellen`);

  /* Faehigkeiten je Instrument, in zwei Stufen. */
  const t0 = Date.now();
  const capsByInstrument = new Map();
  const counts = {};
  Master.CAPABILITIES.forEach((c) => { counts[c] = { DELIVERED: 0, PROVIDER_VERIFIED: 0 }; });

  for (const inst of instruments) {
    const e = evidence.get(String(inst.symbol).toUpperCase()) || {};
    const provider = Master.capabilityMatrix(inst, {
      priceSnapshot: e.priceSnapshot === true,
      priceHistoryBars: e.priceHistoryBars || 0,
      priceHistoryVerified: e.priceHistoryVerified === true,
      intraday: e.intraday === true,
      live: e.live === true,
      fundamentalPeriods: e.fundamentalPeriods || 0,
      valuation: false, analysts: false, themes: null
    });
    const delivered = Master.capabilityMatrix(inst, {
      priceSnapshot: e.deliveredPriceSnapshot === true,
      priceHistoryBars: e.deliveredPriceHistoryBars || 0,
      intraday: false, live: false,
      fundamentalPeriods: e.fundamentalPeriods || 0,
      valuation: false, analysts: false, themes: null
    });
    /* HAS_PROFILE ist ausgeliefert, sobald das Instrument im Master steht -
       Kuerzel, Boerse, Gattung, Land reichen fuer eine ehrliche Kopfzeile.
       Kennzahlen sind eine andere Frage und stehen unter PRICE/METRICS. */
    delivered.HAS_PROFILE = true;
    delivered.HAS_SEC = provider.HAS_SEC;

    const levels = {};
    for (const c of Master.CAPABILITIES) {
      if (delivered[c]) { levels[c] = "DELIVERED"; counts[c].DELIVERED++; if (provider[c]) counts[c].PROVIDER_VERIFIED++; }
      else if (provider[c]) { levels[c] = "PROVIDER_VERIFIED"; counts[c].PROVIDER_VERIFIED++; }
    }
    capsByInstrument.set(inst.instrumentId, { levels, evidence: e });
  }
  const capMs = Date.now() - t0;

  /* --------------------------------------------------------- Suchindex */
  const t1 = Date.now();
  const symShards = new Map();
  const nameShards = new Map();
  let entries = 0, nameEntries = 0;

  for (const inst of instruments) {
    const caps = capsByInstrument.get(inst.instrumentId);
    const flags = Master.CAPABILITIES.filter((c) => caps.levels[c] === "DELIVERED");
    const entry = Master.searchEntry(inst, { capabilities: flags });
    entries++;

    const sk = Master.shardKey(inst.symbol);
    (symShards.get(sk) || symShards.set(sk, []).get(sk)).push(entry);

    const seen = new Set();
    for (const token of nameTokens(inst.companyName)) {
      const nk = Master.shardKey(token);
      if (seen.has(nk)) continue;
      seen.add(nk);
      (nameShards.get(nk) || nameShards.set(nk, []).get(nk)).push(entry);
      nameEntries++;
    }
  }

  let bytes = 0;
  const writeShards = (dir, shards) => {
    const full = join(SEARCH_DIR, dir);
    mkdirSync(full, { recursive: true });
    const stale = new Set(existsSync(full)
      ? readdirSync(full).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)) : []);
    const index = [];
    for (const [key, rows] of Array.from(shards.entries()).sort()) {
      rows.sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : 0));
      bytes += writeJSON(join(full, key + ".json"), { shard: key, count: rows.length, entries: rows });
      index.push({ shard: key, count: rows.length });
      stale.delete(key);
    }
    for (const s of stale) rmSync(join(full, s + ".json"));
    return index;
  };

  const symIndex = writeShards("sym", symShards);
  const nameIndex = writeShards("name", nameShards);
  const searchMs = Date.now() - t1;

  writeJSON(join(SEARCH_DIR, "manifest.json"), {
    version: Master.VERSION,
    generatedAt: new Date().toISOString(),
    shardBy: CONFIG.search.shardBy,
    minQueryLengthForMasterLookup: CONFIG.search.minQueryLengthForMasterLookup,
    totals: { instruments: instruments.length, symbolShards: symIndex.length,
              nameShards: nameIndex.length, nameIndexEntries: nameEntries,
              withSearchableName: instruments.filter((i) => i.companyName).length,
              withoutSearchableName: instruments.filter((i) => !i.companyName).length },
    note: "Die Suche laedt hoechstens zwei Scherben je Anfrage: eine nach Kuerzelanfang, " +
          "eine nach Namensanfang. Titel ohne Firmennamen sind ueber ihr Kuerzel auffindbar " +
          "und ueber ihren Namen nicht - die Zahl dazu steht oben und nicht im Kleingedruckten.",
    sym: symIndex,
    name: nameIndex
  }, true);

  /* ------------------------------------------------- Faehigkeitsbilanz */
  writeJSON(join(OUT_ROOT, "capability-summary.json"), {
    version: Master.VERSION,
    generatedAt: new Date().toISOString(),
    instruments: instruments.length,
    levels: {
      DELIVERED: "Liegt in diesem Repository und funktioniert ohne Anbieterzugang.",
      PROVIDER_VERIFIED: "In einem echten Lauf mit Anbieterzugang gemessen; die Daten selbst " +
                         "bleiben aus Redistributionsgruenden in der Arbeitsablage."
    },
    counts,
    evidenceSources: sources,
    notMeasured: {
      HAS_VALUATION: "Keine Bewertungskennzahlen im Bestand. Sie brauchen Fundamentaldaten " +
                     "je Titel; die kommen mit der SEC-Stufe.",
      HAS_ANALYSTS: "Keine Analystendaten. Sie sind lizenzpflichtig und ausgeschlossen (§32).",
      HAS_THEMES: "Themen sind im Modell vorgesehen (§35) und noch nicht befuellt."
    }
  }, true);

  /* ---------------------------------------------------- Deckungsbericht */
  const evidenceForCoverage = {};
  for (const inst of instruments) {
    const e = evidence.get(String(inst.symbol).toUpperCase());
    if (e) evidenceForCoverage[inst.instrumentId] = e;
  }
  const manifest = existsSync(join(OUT_ROOT, "master-manifest.json"))
    ? readJSON(join(OUT_ROOT, "master-manifest.json")) : null;

  const totals = Master.coverageReport(instruments, {
    evidence: evidenceForCoverage,
    providerInstruments: manifest && manifest.source && manifest.source.providerSource
      ? manifest.source.providerSource.rows : null
  });
  totals.TOTAL_WITH_DELIVERED_PRICE_HISTORY = instruments.filter(
    (i) => capsByInstrument.get(i.instrumentId).levels.HAS_PRICE_HISTORY === "DELIVERED").length;
  totals.TOTAL_WITH_PROVIDER_PRICE_HISTORY = instruments.filter(
    (i) => capsByInstrument.get(i.instrumentId).levels.HAS_PRICE_HISTORY).length;
  totals.TOTAL_WITH_DELIVERED_STOCK_PAGE = instruments.filter(
    (i) => (evidence.get(String(i.symbol).toUpperCase()) || {}).deliveredProfile === true).length;

  writeJSON(join(OUT_ROOT, "coverage-report.json"), {
    version: Master.VERSION,
    generatedAt: new Date().toISOString(),
    asOf: manifest ? manifest.asOf : null,
    source: manifest ? manifest.source : null,
    note: "§43. Jede Zahl ist gezaehlt, keine geschaetzt. Wo eine Quelle fehlt, steht null und " +
          "nicht 0 - der Unterschied zwischen 'nichts vorhanden' und 'nicht gemessen' ist der " +
          "ganze Punkt dieses Berichts.",
    before: {
      TOTAL_IN_COMPANY_MASTER: 498,
      source: "discover/data/search/US_REAL.json, abgeleitet aus " +
              "quant/data/market/factors/factors-GATE_500.json",
      why: "siehe docs/VU_UNIVERSE_EXPANSION.md"
    },
    totals,
    capabilities: counts
  }, true);

  console.log(`\n  Suchindex: ${symIndex.length} Kuerzel-Scherben, ${nameIndex.length} Namens-Scherben, ` +
              `${(bytes / 1024).toFixed(0)} KB  (${searchMs} ms)`);
  console.log(`  Faehigkeiten: ${capMs} ms`);
  console.log(`  Kursverlauf: ${totals.TOTAL_WITH_PROVIDER_PRICE_HISTORY} beim Anbieter belegt, ` +
              `${totals.TOTAL_WITH_DELIVERED_PRICE_HISTORY} ausgeliefert`);
  console.log(`  CIK: ${totals.TOTAL_WITH_CIK} · Namen: ${totals.TOTAL_WITH_NAME} · ` +
              `Common Stocks: ${totals.TOTAL_COMMON_STOCKS}`);
  console.log(`\n  ${join(SEARCH_DIR, "manifest.json").replace(root + "/", "")}`);
  console.log(`  ${join(OUT_ROOT, "coverage-report.json").replace(root + "/", "")}`);
}

main();
