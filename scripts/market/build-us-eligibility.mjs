/* =========================================================================
   VISION UNIVERSE — build-us-eligibility.mjs

   Die Produkteignung als eigene Schicht - neben der Mitgliedschaft,
   nicht statt ihrer.

   DAS PROBLEM

   Der Backfill hat 2.119 Titel aufgenommen. 583 davon sind keine
   Stammaktien: Warrants, Units und Rights in der punktlosen
   NASDAQ-Schreibweise (AACBW statt AACB-W). Sie stehen im gelieferten
   Universum, sie haben eine Historie in R2, und sie gehoeren nicht ins
   Produkt.

   DIE FALSCHE LOESUNG WAERE, SIE ZU LOESCHEN

   Sie aus universe-FULL_UNIVERSE.json zu entfernen hiesse: eine Datei,
   die als Bestand gilt, wird kleiner. Ein spaeterer Lauf kann dann
   nicht mehr sagen, ob ein Titel nie da war oder still verschwand.
   Dieselbe Ueberlegung wie in der Entdeckungsphase - ein Abgleich, der
   einen Titel weglaesst, erzeugt gar nichts, und niemand vermisst eine
   Zeile, die es nie gab.

   DIE SCHICHT

   Die Mitgliedschaft bleibt unveraendert. Daneben entsteht eine
   Eignungsschicht, die zu JEDEM Mitglied sagt, ob es ins Produkt
   gehoert und warum:

     eligibility.json                 die Entscheidung je Titel
     universe-ELIGIBLE_US_EQUITY.json das Produktuniversum
     eligibility-reconciliation.json  JEDE Aenderung gegenueber vorher

   Drei Ausgaenge, nicht zwei:

     ELIGIBLE        Stammaktie, aktiv, Primaerhandelsplatz
     SEPARATE_CLASS  belegt aktienartig, aber getrennt zu fuehren -
                     vor allem Vorzuege (BAC-P-E). Sie sind im Produkt,
                     zaehlen aber nicht in die Stammaktienzahl.
     EXCLUDED        belegte Nicht-Aktie (Warrant/Unit/Right/Testpapier)
     REVIEW          Verdacht ohne Beleg - BLEIBT, wird nicht ausgeschlossen

   Der letzte Ausgang ist der Grund, warum diese Datei nicht drei
   Zeilen lang ist. Ein fuenfstelliger Ticker auf W ist ohne
   gelisteten Stamm ein Verdacht; es gibt Gesellschaften, deren Ticker
   zufaellig so endet. Ein faelschlich ausgeschlossenes Unternehmen ist
   teurer als ein durchgerutschter Warrant.

   KEINE KURSABFRAGE

   Dieses Skript holt nichts. Es liest den Stamm, das Universum und -
   wenn vorhanden - die Anbieterzeilen aus der Arbeitsablage.
   TIINGO PRICE REQUESTS = 0.

   Ausfuehren:
     node scripts/market/build-us-eligibility.mjs
     node scripts/market/build-us-eligibility.mjs --master <pfad>
     node scripts/market/build-us-eligibility.mjs --dry-run
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Master = require(join(root, "quant", "engines", "us-security-master.js"));
const SCALE = JSON.parse(readFileSync(join(root, "quant", "config", "tiingo-scale.json"), "utf8"));

const argv = process.argv.slice(2);
function arg(name, fallback = null) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}
const has = (n) => argv.includes(n);

const DRY_RUN = has("--dry-run");
const TODAY = arg("--today", new Date().toISOString().slice(0, 10));
const UNIVERSE_FILE = arg("--universe",
  join(root, "quant", "data", "market", "scale", "universe-FULL_UNIVERSE.json"));
const MASTER_FILE = arg("--master",
  join(root, SCALE.storage.workingDir, "tiingo", "security-master", "us-security-master.json"));
const OUT_DIR = arg("--out", join(root, "quant", "data", "market", "security-master"));
const SCALE_DIR = arg("--scale-out", join(root, "quant", "data", "market", "scale"));
const PREVIOUS = arg("--previous", join(OUT_DIR, "eligibility.json"));

const stamp = new Date().toISOString();
const sha = (b) => createHash("sha256").update(b).digest("hex");

console.log("VISION UNIVERSE — Produkteignung des US-Aktienuniversums");
console.log(`  Stichtag ${TODAY}${DRY_RUN ? "   [TROCKENLAUF]" : ""}`);
console.log("  Kursabfragen: 0 (dieses Skript holt keine Kurse)\n");

/* ------------------------------------------------------- 1. Eingaben */
if (!existsSync(UNIVERSE_FILE)) {
  console.error(`FEHLER: Universum nicht gefunden: ${UNIVERSE_FILE}`);
  process.exit(2);
}
const universeRaw = readFileSync(UNIVERSE_FILE);
const universeShaBefore = sha(universeRaw);
const universe = JSON.parse(universeRaw);
const members = universe.securities || [];
console.log(`  Universum: ${members.length} Mitglieder (${UNIVERSE_FILE.replace(root + "/", "")})`);

/* Anbieterzeilen aus der Arbeitsablage, wenn der Entdeckungslauf sie
   hinterlassen hat. Sie sind der STAERKSTE Stammbeleg: sie kennen auch
   Staemme, die es nicht ins Universum geschafft haben. Fehlen sie,
   traegt das Universum selbst den Beleg - schwaecher, aber ehrlich
   ausgewiesen. */
let masterRows = null;
let rootEvidence = "UNIVERSE_AND_BASELINE_ONLY";
let masterRejected = null;
if (existsSync(MASTER_FILE)) {
  const m = JSON.parse(readFileSync(MASTER_FILE, "utf8"));
  /* Ein Stamm aus einer aelteren Klassiererversion traegt aeltere
     Urteile. Ihn zu uebernehmen hiesse, die Korrektur genau dort nicht
     anzuwenden, wo sie gebraucht wird: bei den Zeilen, die der alte
     Klassierer falsch eingeordnet hat. Er wird deshalb nicht
     "vorsichtshalber" benutzt, sondern abgelehnt - laut. */
  if (m.version !== Master.VERSION) {
    masterRejected = { file: MASTER_FILE.replace(root + "/", ""),
                       found: m.version || null, expected: Master.VERSION,
                       rows: (m.rows || []).length };
    console.log(`  Arbeitsablage VERWORFEN: Version ${m.version} != ${Master.VERSION}.`);
    console.log("    Aeltere Urteile werden nicht uebernommen. Die Eignung wird " +
                "aus den Universumszeilen neu bestimmt.");
  } else {
    masterRows = m.rows || null;
    if (masterRows && masterRows.length) {
      rootEvidence = "PROVIDER_SUPPORTED_TICKERS";
      console.log(`  Stamm aus Arbeitsablage: ${masterRows.length} Anbieterzeilen ` +
                  `(Version ${m.version})`);
    }
  }
}
if (!masterRows) {
  console.log("  Keine Arbeitsablage gefunden - der Stammbeleg kommt aus dem Universum selbst.");
}

/* ------------------------------------------- 2. Stammbeleg und Urteil

   Die Wurzelmenge speist sich aus allem, was wir an gelisteten
   Kurztickern kennen. Ein Stamm, den nur eine der Quellen fuehrt,
   belegt sein Derivat trotzdem. */
const listedRoots = Master.collectListedRoots(masterRows || [], members);
console.log(`  Stammbeleg: ${Object.keys(listedRoots).length} eigenstaendig gelistete Kurzticker\n`);

/* Urteile des Stamms, sofern vorhanden - nach Ticker UND Handelsplatz,
   weil Tiingo denselben Ticker mehrfach fuehrt. */
const masterByKey = new Map();
const masterByTicker = new Map();
if (masterRows) {
  for (const r of masterRows) {
    const t = String(r.ticker || "").toUpperCase();
    const k = t + "|" + String(r.exchange || "").toUpperCase();
    if (!masterByKey.has(k)) masterByKey.set(k, r);
    if (!masterByTicker.has(t)) masterByTicker.set(t, []);
    masterByTicker.get(t).push(r);
  }
}

const CLASSIFY_OPTS = { today: TODAY, listedRoots };

function judge(sec) {
  const t = String(sec.ticker || "").toUpperCase();
  const ex = String(sec.exchange || "").toUpperCase();

  /* Erst der Stamm. Er hat die Anbieterzeile gesehen, samt endDate. */
  let row = masterByKey.get(t + "|" + ex) || null;
  if (!row) {
    const group = masterByTicker.get(t);
    if (group && group.length === 1) row = group[0];
  }

  if (row) {
    return {
      instrumentType: row.instrument_type,
      classificationStatus: row.classification_status,
      confidence: row.classification_confidence,
      activeStatus: row.active_status,
      policyBucket: row.policy_bucket,
      eligible: row.eligible_us_equity === true,
      reason: row.eligibility_reason,
      flags: row.review_flags || [],
      source: "SECURITY_MASTER"
    };
  }

  /* Ohne Stammzeile wird das Universumsmitglied selbst klassifiziert.
     Es traegt weniger Felder - kein endDate -, deshalb wird active
     durchgereicht statt abgeleitet. */
  const c = Master.classifySecurity({
    ticker: sec.ticker, exchange: sec.exchange, assetType: sec.assetType,
    name: sec.company, currency: sec.currency, startDate: sec.startDate,
    endDate: sec.endDate || null,
    active: typeof sec.active === "boolean" ? sec.active : undefined
  }, CLASSIFY_OPTS);
  return {
    instrumentType: c.instrumentType,
    classificationStatus: c.classificationStatus,
    confidence: c.classificationConfidence,
    activeStatus: c.active === null ? "UNKNOWN" : c.active ? "ACTIVE" : "INACTIVE",
    policyBucket: c.policyBucket,
    eligible: c.eligibleUsEquity === true,
    reason: c.eligibilityReason,
    flags: c.flags || [],
    source: "UNIVERSE_ROW_CLASSIFIED"
  };
}

/* ------------------------------------------------------- 3. Entscheiden

   Der Ausgang haengt nicht nur an der Eignung, sondern daran, wie gut
   sie belegt ist. Ein Ausschluss braucht einen Befund; ein Verdacht
   bekommt REVIEW und bleibt im Produkt sichtbar, aber markiert. */
const decisions = [];
const byStatus = { ELIGIBLE: 0, SEPARATE_CLASS: 0, EXCLUDED: 0, REVIEW: 0 };
const excludedByClass = {};
const separateByClass = {};
const reviewByReason = {};

for (const sec of members) {
  const t = String(sec.ticker || "").toUpperCase();
  const j = judge(sec);

  /* Die Entscheidung faellt im Klassierer, nicht hier. Sie dort zu
     halten heisst, dass ein Test sie angreifen kann, ohne dieses
     Skript zu starten - und dass es genau EINE Stelle gibt, an der
     "belegt" definiert ist. */
  const decision = Master.decideProductEligibility(j);
  const status = decision.status;
  const why = decision.reason;
  if (status === "EXCLUDED") {
    excludedByClass[j.instrumentType] = (excludedByClass[j.instrumentType] || 0) + 1;
  } else if (status === "SEPARATE_CLASS") {
    separateByClass[j.instrumentType] = (separateByClass[j.instrumentType] || 0) + 1;
  } else if (status === "REVIEW") {
    reviewByReason[why] = (reviewByReason[why] || 0) + 1;
  }
  byStatus[status]++;

  decisions.push({
    ticker: t,
    securityId: sec.securityId,
    exchange: sec.exchange,
    instrument_type: j.instrumentType,
    classification_status: j.classificationStatus,
    classification_confidence: j.confidence,
    active_status: j.activeStatus,
    product_eligibility: status,
    product_eligibility_reason: why,
    evidence_source: j.source,
    review_flags: j.flags,
    start_date: sec.startDate || null
  });
}

console.log("  Produkteignung");
for (const k of ["ELIGIBLE", "SEPARATE_CLASS", "EXCLUDED", "REVIEW"]) {
  console.log(`    ${k.padEnd(15)} ${String(byStatus[k]).padStart(6)}`);
}
console.log(`    ${"Summe".padEnd(15)} ${String(members.length).padStart(6)}\n`);

if (byStatus.ELIGIBLE + byStatus.SEPARATE_CLASS + byStatus.EXCLUDED + byStatus.REVIEW !== members.length) {
  console.error("FEHLER: Die Eignungsschicht zaehlt nicht alle Mitglieder.");
  process.exit(3);
}

console.log("  Ausschluesse nach Gattung");
for (const [k, v] of Object.entries(excludedByClass).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${k.padEnd(16)} ${String(v).padStart(5)}`);
}
if (Object.keys(separateByClass).length) {
  console.log("  Getrennt gefuehrt (im Produkt, nicht in der Stammaktienzahl)");
  for (const [k, v] of Object.entries(separateByClass).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k.padEnd(16)} ${String(v).padStart(5)}`);
  }
}
console.log("");

/* --------------------------------------- 4. Abgleich gegen vorher

   Jede Aenderung der Produkteignung wird einzeln ausgewiesen. Nicht
   eine Zahl "583 entfernt", sondern 583 Zeilen mit Ticker, Gattung,
   Beleg und vorherigem Zustand. */
let previous = null;
if (existsSync(PREVIOUS)) {
  try { previous = JSON.parse(readFileSync(PREVIOUS, "utf8")); } catch { previous = null; }
}
const prevByTicker = new Map();
if (previous && previous.decisions) {
  for (const d of previous.decisions) prevByTicker.set(d.ticker, d.product_eligibility);
}

const changes = [];
for (const d of decisions) {
  /* Ohne Vorgaengerdatei gilt der Zustand VOR dieser Schicht: das
     gelieferte Universum hat jedes Mitglied als Produkttitel gefuehrt.
     Genau das ist der Zustand, gegen den berichtet werden muss. */
  const before = prevByTicker.has(d.ticker) ? prevByTicker.get(d.ticker) : "ELIGIBLE";
  if (before === d.product_eligibility) continue;
  changes.push({
    ticker: d.ticker, exchange: d.exchange,
    from: before, to: d.product_eligibility,
    instrument_type: d.instrument_type,
    classification_confidence: d.classification_confidence,
    reason: d.product_eligibility_reason,
    evidence: d.review_flags.filter((f) => f.indexOf("NASDAQ_FIFTH_LETTER") === 0 ||
                                           f === "PROVIDER_TEST_SECURITY" ||
                                           f === "EXCLUSION_CANDIDATE_UNCONFIRMED"),
    start_date: d.start_date,
    historyRetained: true,
    historyNote: "Die Historie in R2 bleibt bestehen. Diese Aenderung betrifft " +
                 "ausschliesslich die Produktzugehoerigkeit."
  });
}
const changeCounts = {};
for (const c of changes) {
  const k = c.from + "->" + c.to;
  changeCounts[k] = (changeCounts[k] || 0) + 1;
}
console.log(`  Eignungsaenderungen gegenueber ${previous ? "dem letzten Lauf" : "dem gelieferten Universum"}: ${changes.length}`);
for (const [k, v] of Object.entries(changeCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${k.padEnd(24)} ${String(v).padStart(5)}`);
}
console.log("");

/* ----------------------------------------------------- 5. Schreiben */
const eligibleTickers = decisions
  .filter((d) => d.product_eligibility === "ELIGIBLE")
  .map((d) => d.ticker);
const eligibleSet = new Set(eligibleTickers);
const labelByTicker = new Map(decisions.map((d) => [d.ticker, d.product_eligibility]));

/* Das Produktuniversum. Verdachtsfaelle sind DRIN - sie sind nicht
   widerlegt - aber sie tragen ihre Markierung mit. */
const IN_PRODUCT = new Set(Master.IN_PRODUCT_UNIVERSE);
const productMembers = members.filter((s) =>
  IN_PRODUCT.has(labelByTicker.get(String(s.ticker || "").toUpperCase()))
).map((s) => ({
  ...s, productEligibility: labelByTicker.get(String(s.ticker || "").toUpperCase())
}));

const eligibility = {
  generatedAt: stamp,
  version: Master.VERSION,
  coverageEngine: require(join(root, "quant", "engines", "coverage-metrics.js")).VERSION,
  today: TODAY,
  phase: "POST_BACKFILL_CLEANUP_NO_PRICE_REQUESTS",
  tiingoPriceRequests: 0,
  scope: "US_LISTED_EQUITIES_PRODUCT_ELIGIBILITY",
  rootEvidence,
  securityMasterRejected: masterRejected,
  listedRootCount: Object.keys(listedRoots).length,
  nonDestructive: {
    universeFile: UNIVERSE_FILE.replace(root + "/", ""),
    universeMembersBefore: members.length,
    universeMembersAfter: members.length,
    universeSha256: universeShaBefore,
    membersRemoved: 0,
    r2ObjectsDeleted: 0,
    note: "Die Mitgliedschaft wird nicht angetastet. Eignung ist eine " +
          "zweite Schicht daneben, kein Eingriff in den Bestand."
  },
  counts: {
    universeMembers: members.length,
    ELIGIBLE: byStatus.ELIGIBLE,
    SEPARATE_CLASS: byStatus.SEPARATE_CLASS,
    EXCLUDED: byStatus.EXCLUDED,
    REVIEW: byStatus.REVIEW,
    productUniverse: productMembers.length
  },
  excludedByClass,
  separateByClass,
  reviewByReason,
  decisions
};

const reconciliation = {
  generatedAt: stamp,
  version: Master.VERSION,
  today: TODAY,
  phase: "POST_BACKFILL_CLEANUP_NO_PRICE_REQUESTS",
  comparedAgainst: previous
    ? { kind: "PREVIOUS_ELIGIBILITY_RUN", generatedAt: previous.generatedAt }
    : { kind: "DELIVERED_UNIVERSE_MEMBERSHIP",
        note: "Vor dieser Schicht galt jedes Universumsmitglied als Produkttitel." },
  totals: { universeMembers: members.length, changed: changes.length, ...changeCounts },
  invariants: {
    noMemberRemoved: true,
    noR2ObjectDeleted: true,
    noPriceRequest: true,
    everyChangeListed: true
  },
  changes
};

const productUniverse = {
  generatedAt: stamp,
  gate: "ELIGIBLE_US_EQUITY",
  derivedFrom: UNIVERSE_FILE.replace(root + "/", ""),
  derivedFromSha256: universeShaBefore,
  version: Master.VERSION,
  today: TODAY,
  method: "PRODUCT_ELIGIBILITY_LAYER",
  provider: "tiingo",
  actualSize: productMembers.length,
  counts: { ELIGIBLE: byStatus.ELIGIBLE, SEPARATE_CLASS: byStatus.SEPARATE_CLASS,
            REVIEW: byStatus.REVIEW, EXCLUDED_NOT_LISTED_HERE: byStatus.EXCLUDED },
  note: "Abgeleitet, nicht gepflegt. Die Mitgliedschaft steht in " +
        "universe-FULL_UNIVERSE.json und bleibt dort vollstaendig. " +
        "Verdachtsfaelle (REVIEW) sind enthalten und markiert.",
  securities: productMembers
};

if (DRY_RUN) {
  console.log("  TROCKENLAUF: nichts geschrieben.");
} else {
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(SCALE_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "eligibility.json"), JSON.stringify(eligibility, null, 1));
  writeFileSync(join(OUT_DIR, "eligibility-reconciliation.json"), JSON.stringify(reconciliation, null, 1));
  writeFileSync(join(SCALE_DIR, "universe-ELIGIBLE_US_EQUITY.json"), JSON.stringify(productUniverse, null, 1));
  console.log("  Geschrieben");
  for (const f of [join(OUT_DIR, "eligibility.json"),
                   join(OUT_DIR, "eligibility-reconciliation.json"),
                   join(SCALE_DIR, "universe-ELIGIBLE_US_EQUITY.json")]) {
    console.log(`    ${f.replace(root + "/", "").padEnd(58)} ${(statSync(f).size / 1024).toFixed(0)} KiB`);
  }
}

/* --------------------------------- 6. Die Zusage nachrechnen, nicht behaupten */
const universeShaAfter = sha(readFileSync(UNIVERSE_FILE));
if (universeShaAfter !== universeShaBefore) {
  console.error("\nFEHLER: universe-FULL_UNIVERSE.json wurde veraendert. " +
                "Dieses Skript darf den Bestand nicht anfassen.");
  process.exit(4);
}
console.log(`\n  NICHT-DESTRUKTIV bestaetigt: universe-FULL_UNIVERSE.json unveraendert ` +
            `(sha256 ${universeShaBefore.slice(0, 12)}…)`);
console.log("  R2-Objekte geloescht: 0   Kursabfragen: 0");
