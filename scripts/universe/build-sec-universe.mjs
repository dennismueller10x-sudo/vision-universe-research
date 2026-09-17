/* =========================================================================
   VISION UNIVERSE — build-sec-universe.mjs   (§23, §24, §56)

   Erzeugt das SEC-Universum aus dem Company Master.

   WARUM ES BISHER FUENF TITEL WAREN

   Nicht wegen einer Grenze in der Pipeline - die traegt Checkpoints,
   Wiederaufnahme, Fehlerschlange und Ratenbegrenzung und ist fuer viele
   Emittenten gebaut. Es waren fuenf, weil
   `quant/config/sec-universe.json` fuenf Unternehmen von Hand fuehrt:
   NVDA, AAPL, MSFT, JPM, XOM, ausgewaehlt nach Rechnungslegungsstruktur
   und Fiskalkalender. Das ist ein VALIDIERUNGSSATZ und war nie als
   Produktuniversum gemeint.

   Diese Datei aendert daran nichts. Sie legt ein zweites Universum
   daneben, das aus dem Company Master und der CIK-Zuordnung entsteht -
   und die fuenf stehen darin an erster Stelle, weil eine Regression an
   ihnen weiterhin zuerst auffallen soll.

   DIE REIHENFOLGE IST DIE EIGENTLICHE ENTSCHEIDUNG

   Ein Lauf ueber tausende Emittenten wird abgebrochen, unterbrochen oder
   begrenzt (`--limit`). Was zuerst geholt wird, entscheidet deshalb,
   was nach einem halben Lauf da ist:

     1. Validierungssatz        Regression zuerst.
     2. Titel mit Aktienseite   Was heute jemand aufschlaegt.
     3. Alles uebrige           Nach Kuerzel, damit die Reihenfolge
                                zwischen zwei Laeufen dieselbe ist.

   Ausfuehren:
     node scripts/universe/build-sec-universe.mjs
     node scripts/universe/build-sec-universe.mjs --max 2000
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

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
/* Eine Obergrenze gibt es nur, wenn jemand sie ausdruecklich angibt -
   etwa fuer einen ersten Lauf mit begrenztem Zeitfenster. Standard ist
   null: das ganze Universum (§6). */
const MAX = arg("--max", null) ? parseInt(arg("--max"), 10) : null;
const OUT = pfad(arg("--out", "quant/data/universe/sec-universe.json"));

/* Welche Gattungen ueberhaupt Geschaeftszahlen einreichen. ETFs und ETNs
   reichen keine 10-K ein; sie hier zu fuehren hiesse, fuer jeden von
   ihnen eine Anfrage zu stellen, die sicher leer zurueckkommt (§25). */
const FILING_TYPES = new Set(["COMMON_STOCK", "ADR", "PREFERRED"]);

function readJSON(p) { return JSON.parse(readFileSync(p, "utf8")); }

function loadMaster() {
  const dir = join(root, "quant", "data", "universe", "instruments");
  if (!existsSync(dir)) {
    console.error("  Kein Company Master. Erst scripts/universe/build-company-master.mjs.");
    process.exit(2);
  }
  const out = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    for (const r of readJSON(join(dir, f)).instruments || []) out.push(r);
  }
  return out;
}

function main() {
  console.log("Vision Universe — SEC-Universum aus dem Company Master\n");

  const instruments = loadMaster();
  const validation = readJSON(join(root, "quant", "config", "sec-universe.json"));
  const validationTickers = new Set(validation.companies.map((c) => c.ticker));

  const cikMapFile = pfad(arg("--cik-map", "quant/data/universe/cik-map.json"));
  const cikMap = existsSync(cikMapFile) ? readJSON(cikMapFile) : { status: "ABSENT" };

  const delivered = new Set();
  const deliveredIndex = join(root, "discover", "data", "stock-index", "US_REAL.json");
  if (existsSync(deliveredIndex)) {
    for (const s of readJSON(deliveredIndex).symbols || []) delivered.add(s);
  }

  const reasons = { noCik: 0, notUs: 0, wrongType: 0, inactive: 0, duplicateCik: 0 };
  const seenCik = new Set();
  const candidates = [];

  for (let inst of instruments) {
    if (inst.country !== "US") { reasons.notUs++; continue; }
    if (!FILING_TYPES.has(inst.securityType)) { reasons.wrongType++; continue; }
    /* Die CIK steht normalerweise schon am Instrument (der Masterbau
       traegt sie ein). Eine hier uebergebene Zuordnung hat trotzdem
       Vorrang: sie kann neuer sein als der letzte Masterlauf, und fuer
       einen Test ist sie die einzige Moeglichkeit, diesen Weg ohne
       Netzzugang zu pruefen. */
    const ausMap = cikMap.byTicker && cikMap.byTicker[inst.symbol];
    const cik = (ausMap && ausMap.cik) || inst.cik;
    if (!cik) { reasons.noCik++; continue; }
    inst = Object.assign({}, inst, { cik,
      cikSource: ausMap ? "sec:" + ausMap.source : inst.cikSource,
      companyName: inst.companyName || (ausMap && ausMap.name) || null });
    /* Eine CIK zweimal zu holen kostet eine Anfrage und liefert dasselbe
       Dokument: Aktienklassen desselben Emittenten teilen sich die CIK.
       Der erste Titel gewinnt, die anderen stehen als `alsoTickers`
       daneben - verloren geht keiner. */
    if (seenCik.has(cik)) {
      reasons.duplicateCik++;
      const first = candidates.find((c) => c.cik === cik);
      if (first) (first.alsoTickers || (first.alsoTickers = [])).push(inst.symbol);
      continue;
    }
    seenCik.add(cik);
    candidates.push({
      ticker: inst.symbol,
      name: inst.companyName || null,
      cik,
      instrumentId: inst.instrumentId,
      exchange: inst.exchange,
      active: inst.active,
      cikSource: inst.cikSource,
      why: null
    });
  }

  const rang = (c) => {
    if (validationTickers.has(c.ticker)) return 0;
    if (delivered.has(c.ticker)) return 1;
    return 2;
  };
  candidates.sort((a, b) => {
    const ra = rang(a), rb = rang(b);
    if (ra !== rb) return ra - rb;
    return a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0;
  });

  /* Der Validierungssatz vollstaendig und mit seiner Begruendung - auch
     wenn ein Titel aus dem Master herausgefallen waere. Er ist die
     Regressionsprobe und darf nicht davon abhaengen, was ein
     Kursdatenanbieter gerade fuehrt. */
  const byTicker = new Map(candidates.map((c) => [c.ticker, c]));
  const companies = [];
  for (const v of validation.companies) {
    const fromMaster = byTicker.get(v.ticker);
    companies.push(Object.assign({}, v, {
      instrumentId: fromMaster ? fromMaster.instrumentId : null,
      role: "validation"
    }));
    byTicker.delete(v.ticker);
  }
  for (const c of candidates) {
    if (!byTicker.has(c.ticker)) continue;
    companies.push(Object.assign({}, c, {
      role: delivered.has(c.ticker) ? "deliveredStockPage" : "universe",
      why: delivered.has(c.ticker)
        ? "Traegt heute eine Aktienseite."
        : "Aus dem Company Master; US-Emittent mit CIK."
    }));
  }

  const limited = MAX ? companies.slice(0, MAX) : companies;

  const payload = {
    schema_version: 1,
    generated: true,
    generated_at_utc: new Date().toISOString(),
    generator: "scripts/universe/build-sec-universe.mjs",
    description:
      "SEC-Universum aus dem kanonischen Company Master. NICHT von Hand pflegen - " +
      "Aenderungen gehoeren in den Master oder in die CIK-Zuordnung. " +
      "quant/config/sec-universe.json bleibt der handgepflegte Validierungssatz und steht " +
      "hier an erster Stelle; eine Regression an diesen fuenf Titeln faellt damit weiterhin " +
      "zuerst auf. Das Feld `cik` ist wie dort ein Hinweis: die Pipeline loest den Ticker " +
      "gegen die SEC-Ticker-Map auf. Fuer ein generiertes Universum gehoert " +
      "`--skip-unresolved` dazu - ein Kuerzel, das die SEC nicht kennt, ist hier der " +
      "Normalfall und kein Konfigurationsfehler.",
    sources: {
      companyMaster: "quant/data/universe/instruments/**",
      cikMap: { file: "quant/data/universe/cik-map.json", status: cikMap.status,
                generatedAt: cikMap.generatedAt || null },
      validationSet: "quant/config/sec-universe.json",
      deliveredStockPages: "discover/data/stock-index/US_REAL.json"
    },
    ordering: ["validationSet", "deliveredStockPage", "remainingUniverseByTicker"],
    orderingNote:
      "Ein begrenzter oder abgebrochener Lauf soll das Nuetzlichste zuerst geholt haben.",
    limit: MAX,
    limitNote: MAX === null
      ? "Keine Obergrenze. Die Groesse ergibt sich aus dem Master und der CIK-Zuordnung."
      : "Ausdruecklich begrenzt ueber --max " + MAX + ". Kein Bestandteil des Modells.",
    totals: {
      instrumentsInMaster: instruments.length,
      candidates: candidates.length,
      companies: limited.length,
      validationSet: validation.companies.length,
      withDeliveredStockPage: limited.filter((c) => c.role === "deliveredStockPage").length,
      excluded: reasons
    },
    requestBudget: {
      submissionsRequests: limited.length,
      companyFactsRequests: limited.length,
      companyFactsRequestsWithBulk: 1,
      note: "Zwei Anfragen je Emittent auf dem Einzelweg. Mit --bulk wird die zweite zu " +
            "EINER Anfrage fuer alle zusammen; die Einreichungsuebersicht bleibt je " +
            "Emittent, weil es sie als Sammelform nicht gibt. Bei fuenf Anfragen je " +
            "Sekunde sind " + limited.length + " Emittenten rund " +
            Math.round(limited.length / 5 / 60) + " Minuten reine Anfragezeit.",
      rateLimit: "5 Anfragen/s (scripts/quant/sec/http_client.py), die Haelfte der von " +
                 "der SEC genannten Obergrenze."
    },
    companies: limited
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n");

  console.log(`  Master:           ${instruments.length} Instrumente`);
  console.log(`  CIK-Zuordnung:    ${cikMap.status}` +
              (cikMap.totals ? ` (${cikMap.totals.tickers} Kuerzel)` : ""));
  console.log(`  Kandidaten:       ${candidates.length}`);
  console.log(`  ausgeschlossen:   ohne CIK ${reasons.noCik} · nicht US ${reasons.notUs} · ` +
              `Gattung ${reasons.wrongType} · CIK doppelt ${reasons.duplicateCik}`);
  console.log(`  Universum:        ${limited.length} Emittenten` +
              (MAX ? ` (begrenzt auf ${MAX})` : " (keine Obergrenze)"));
  console.log(`\n  ${OUT.replace(root + "/", "")}`);

  if (cikMap.status !== "OK" && cikMap.status !== "FROM_CACHE") {
    console.log("\n  Hinweis: ohne CIK-Zuordnung bleibt nur der Validierungssatz. " +
                "scripts/universe/build-cik-map.mjs braucht Zugang zu sec.gov.");
  }
}

main();
