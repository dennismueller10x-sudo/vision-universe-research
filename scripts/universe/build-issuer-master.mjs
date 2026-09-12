/* =========================================================================
   VISION UNIVERSE — build-issuer-master.mjs   (§3, §15)

   DIE EMITTENTENEBENE.

   Fundamentaldaten gehoeren nicht zum Papier, sondern zur Gesellschaft.
   Alphabet hat zwei Aktienklassen und EINEN Jahresabschluss. Wer
   Geschaeftszahlen am Instrument fuehrt, fuehrt sie doppelt - und wer
   dann Emittenten zaehlt, zaehlt Papiere.

   Diese Datei zieht deshalb eine zweite Identitaetsebene ein:

     instrumentId   ein Listing:  Ticker, Boerse, Aktienklasse
     masterMemberId ein Mitglied des US-Wertpapierstamms
     issuerId       eine Gesellschaft:  CIK, Fundamentalhistorie

   DIE CIK IST DIE IDENTITAET, UND NICHTS SONST.

   Kein Firmenname, kein Ticker-Praefix, keine Heuristik. "Alphabet Inc
   Class A" und "Alphabet Inc Class C" sind derselbe Emittent; "Berkshire
   Hathaway Inc" und "Berkshire Hills Bancorp" sind es nicht - und aus
   den Namen allein ist dieser Unterschied nicht zu holen. Ohne CIK gibt
   es deshalb keine Emittenten-ID, sondern einen Eintrag in
   CIK_UNRESOLVED.

   DREI ZUSTAENDE, NICHT ZWEI (§3)

     CIK_RESOLVED    eine CIK, belegt
     CIK_UNRESOLVED  keine CIK - die SEC kennt das Kuerzel nicht
     CIK_AMBIGUOUS   mehrere Kandidaten, keiner belegt

   AMBIGUOUS ist ausdruecklich nicht UNRESOLVED: das eine heisst "wir
   wissen es nicht", das andere "wir haetten die Wahl und duerfen sie
   nicht treffen".

   Ausfuehren: node scripts/universe/build-issuer-master.mjs
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
function pfad(p) { return p.startsWith("/") ? p : join(root, p); }

const CONFIG = readJSON(join(root, "quant", "config", "company-master.json"));
const OUT_ROOT = pfad(arg("--out", CONFIG.storage.root));
const INSTRUMENT_DIR = join(OUT_ROOT, "instruments");
const ISSUER_DIR = join(OUT_ROOT, "issuers");

function readJSON(p) { return JSON.parse(readFileSync(p, "utf8")); }
function writeJSON(p, data, pretty) {
  mkdirSync(dirname(p), { recursive: true });
  const json = (pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)) + "\n";
  writeFileSync(p, json);
  return Buffer.byteLength(json);
}

function loadMaster() {
  if (!existsSync(INSTRUMENT_DIR)) {
    console.error("  Kein Company Master. Erst scripts/universe/build-company-master.mjs.");
    process.exit(2);
  }
  const out = [];
  for (const f of readdirSync(INSTRUMENT_DIR).filter((f) => f.endsWith(".json")).sort()) {
    for (const r of readJSON(join(INSTRUMENT_DIR, f)).instruments || []) out.push(r);
  }
  return out;
}

/* Die Scherbe eines Emittenten. Nach den letzten drei Ziffern der CIK -
   sie sind gleichverteilt, waehrend die ersten es nicht sind (alte
   Gesellschaften haben kleine Nummern). 1.000 Scherben tragen auch
   100.000 Emittenten noch mit hundert Zeilen je Datei. */
function issuerShard(cik) {
  const d = String(cik).replace(/\D/g, "").padStart(10, "0");
  return d.slice(-3);
}

function main() {
  console.log("Vision Universe — Emittentenstamm (§15)\n");

  const instruments = loadMaster();
  console.log(`  Instrumente: ${instruments.length}`);

  const cikMapFile = pfad(arg("--cik-map", join(CONFIG.storage.root, "cik-map.json")));
  const cikMap = existsSync(cikMapFile) ? readJSON(cikMapFile) : { status: "ABSENT", byTicker: {} };

  /* ------------------------------------------------- CIK-Aufloesung (§3) */
  const issuers = new Map();
  const resolved = [], unresolved = [], ambiguous = [];

  for (const inst of instruments) {
    const member = inst.masterMemberId || inst.instrumentId;
    const eintragImMap = (cikMap.byTicker || {})[inst.symbol];

    /* Die CIK am Instrument gewinnt: sie ist beim Masterbau gesetzt
       worden und traegt dort ihre Herkunft, einschliesslich erklaerter
       Uebersteuerungen. Die Zuordnungsdatei fuellt nur, was dort fehlt -
       sie kann neuer sein als der letzte Masterlauf. Ein ambiger Eintrag
       fuellt gar nichts. */
    const ausMap = eintragImMap && eintragImMap.status !== "AMBIGUOUS" && eintragImMap.cik
      ? { cik: String(eintragImMap.cik).replace(/\D/g, "").padStart(10, "0"),
          source: "sec:" + (eintragImMap.source || "cik-map") }
      : null;
    const cik = inst.cik || (ausMap && ausMap.cik) || null;
    const cikSource = inst.cik ? (inst.cikSource || null) : (ausMap && ausMap.source);

    if (cik) {
      const issuerId = Master.issuerIdFromCik(cik);
      if (!issuers.has(issuerId)) {
        issuers.set(issuerId, {
          issuerId, cik, cikSource: cikSource || null,
          name: null, nameSource: null,
          members: new Set(), instruments: [], tickers: new Set(), exchanges: new Set(),
          securityClasses: new Set(), productEligibility: new Set(), shareClasses: new Set(),
          active: false, firstTradeDate: null, inProductUniverse: false
        });
      }
      const iss = issuers.get(issuerId);
      iss.members.add(member);
      iss.instruments.push(inst.instrumentId);
      iss.tickers.add(inst.symbol);
      if (inst.exchange) iss.exchanges.add(inst.exchange);
      if (inst.securityClass) iss.securityClasses.add(inst.securityClass);
      if (inst.productEligibility) iss.productEligibility.add(inst.productEligibility);
      if (inst.shareClass) iss.shareClasses.add(inst.shareClass);
      if (inst.active !== false) iss.active = true;
      if (Master.inProductUniverse(inst)) iss.inProductUniverse = true;
      if (inst.firstTradeDate && (!iss.firstTradeDate || inst.firstTradeDate < iss.firstTradeDate)) {
        iss.firstTradeDate = inst.firstTradeDate;
      }
      /* Der Name: der erste, den ein Listing dieses Emittenten traegt.
         Eine bessere Regel braeuchte den Namen aus der SEC selbst - und
         genau den bringt die CIK-Zuordnung mit, sobald sie laeuft. */
      if (!iss.name && inst.companyName) {
        iss.name = inst.companyName;
        iss.nameSource = inst.companyNameStatus;
      }
      resolved.push({ member, instrumentId: inst.instrumentId, symbol: inst.symbol,
                      cik, issuerId, source: cikSource });
      continue;
    }

    if (eintragImMap && eintragImMap.status === "AMBIGUOUS") {
      ambiguous.push({ member, instrumentId: inst.instrumentId, symbol: inst.symbol,
                       candidates: eintragImMap.candidates || [],
                       reason: "Mehrere CIK-Kandidaten in den SEC-Verzeichnissen; keiner belegt." });
      continue;
    }

    unresolved.push({
      member, instrumentId: inst.instrumentId, symbol: inst.symbol,
      exchange: inst.exchange, securityClass: inst.securityClass,
      productEligibility: inst.productEligibility,
      reason: cikMap.status === "OK" || cikMap.status === "FROM_CACHE"
        ? "Kuerzel steht nicht in den SEC-Verzeichnissen."
        : "CIK-Zuordnung nicht verfuegbar (" + cikMap.status + ")."
    });
  }

  /* Nur Emittenten mit mindestens einem Produkttitel bekommen spaeter
     Fundamentaldaten. Die Zahl steht trotzdem an jedem Emittenten. */
  const rows = [];
  for (const iss of issuers.values()) {
    const memberList = Array.from(iss.members).sort();
    const imProdukt = iss.inProductUniverse;
    rows.push({
      issuerId: iss.issuerId,
      cik: iss.cik,
      cikSource: iss.cikSource,
      name: iss.name,
      nameSource: iss.nameSource,
      memberCount: memberList.length,
      members: memberList,
      instruments: iss.instruments.slice().sort(),
      tickers: Array.from(iss.tickers).sort(),
      exchanges: Array.from(iss.exchanges).sort(),
      shareClasses: Array.from(iss.shareClasses).sort(),
      securityClasses: Array.from(iss.securityClasses).sort(),
      productEligibility: Array.from(iss.productEligibility).sort(),
      inProductUniverse: imProdukt,
      active: iss.active,
      firstTradeDate: iss.firstTradeDate,
      /* Die Fundamentalschicht fuellt das spaeter. Die Felder stehen hier,
         damit ein Emittent ohne Zahlen von einem ohne Feld zu
         unterscheiden ist. */
      fundamentals: { status: "NOT_INGESTED", annualPeriods: 0, quarterlyPeriods: 0,
                      firstPeriodEnd: null, lastPeriodEnd: null, historyYears: null }
    });
  }
  rows.sort((a, b) => (a.issuerId < b.issuerId ? -1 : 1));

  /* --------------------------------------------------------- Schreiben */
  const shards = new Map();
  for (const r of rows) {
    const k = issuerShard(r.cik);
    (shards.get(k) || shards.set(k, []).get(k)).push(r);
  }
  mkdirSync(ISSUER_DIR, { recursive: true });
  const stale = new Set(readdirSync(ISSUER_DIR).filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5)));
  let bytes = 0;
  const index = [];
  for (const [key, list] of Array.from(shards.entries()).sort()) {
    bytes += writeJSON(join(ISSUER_DIR, key + ".json"),
      { shard: key, engine: Master.VERSION, count: list.length, issuers: list });
    index.push({ shard: key, count: list.length });
    stale.delete(key);
  }
  for (const s of stale) rmSync(join(ISSUER_DIR, s + ".json"));

  const mitProdukt = rows.filter((r) => r.inProductUniverse).length;
  const mehrklassig = rows.filter((r) => r.memberCount > 1).length;

  writeJSON(join(OUT_ROOT, "issuer-manifest.json"), {
    version: Master.VERSION,
    generatedAt: new Date().toISOString(),
    note: "Ein Emittent ist eine Gesellschaft, kein Papier. Mehrere Aktienklassen und " +
          "Vorzuege zeigen auf denselben Emittenten und teilen sich EINE Fundamentalhistorie (§15).",
    identity: {
      key: "cik",
      rule: "issuerId = iss_cik_<10-stellige CIK>. Ohne CIK keine Emittenten-ID - " +
            "Aktienklassen ueber Firmennamen zusammenzufassen waere geraten."
    },
    totals: {
      instruments: instruments.length,
      issuers: rows.length,
      issuersInProductUniverse: mitProdukt,
      issuersWithMultipleMembers: mehrklassig,
      CIK_RESOLVED: resolved.length,
      CIK_UNRESOLVED: unresolved.length,
      CIK_AMBIGUOUS: ambiguous.length
    },
    cikSource: { status: cikMap.status, generatedAt: cikMap.generatedAt || null,
                 reason: cikMap.reason || null },
    shards: { by: "cikLast3", count: index.length, index },
    bytes
  }, true);

  /* Die Aufloesungsbilanz als eigenes Artefakt: sie ist der Beleg fuer
     §3 und die Eingangsgroesse jeder spaeteren Coverage-Aussage. */
  writeJSON(join(OUT_ROOT, "cik-resolution.json"), {
    version: Master.VERSION,
    generatedAt: new Date().toISOString(),
    source: { cikMap: cikMap.status, config: "quant/config/sec-universe.json" },
    note: "Drei Zustaende, nicht zwei. AMBIGUOUS heisst: es gaebe eine Wahl, und sie wird " +
          "nicht getroffen (§3). Keine geratene CIK.",
    totals: { CIK_RESOLVED: resolved.length, CIK_UNRESOLVED: unresolved.length,
              CIK_AMBIGUOUS: ambiguous.length, instruments: instruments.length },
    unresolvedByEligibility: unresolved.reduce((acc, u) => {
      acc[u.productEligibility || "UNKNOWN"] = (acc[u.productEligibility || "UNKNOWN"] || 0) + 1;
      return acc;
    }, {}),
    resolved: resolved.slice(0, 2000),
    resolvedTruncated: resolved.length > 2000,
    ambiguous,
    unresolvedSample: unresolved.slice(0, 200),
    unresolvedTruncated: unresolved.length > 200
  }, true);

  console.log(`  CIK_RESOLVED:   ${resolved.length}`);
  console.log(`  CIK_UNRESOLVED: ${unresolved.length}`);
  console.log(`  CIK_AMBIGUOUS:  ${ambiguous.length}`);
  console.log(`  Emittenten:     ${rows.length} (${mitProdukt} mit Produkttitel, ` +
              `${mehrklassig} mit mehreren Mitgliedern)`);
  console.log(`\n  ${join(OUT_ROOT, "issuer-manifest.json").replace(root + "/", "")}`);
  console.log(`  ${join(OUT_ROOT, "cik-resolution.json").replace(root + "/", "")}`);
}

main();
