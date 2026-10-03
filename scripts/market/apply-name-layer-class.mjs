#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — apply-name-layer-class.mjs

   Eine NEUE Namensregel des Klassierers (us-security-master.js) auf die
   bestehende Eignungsschicht anwenden - ohne den ganzen Eignungslauf neu
   zu bauen.

   WARUM NICHT build-us-eligibility.mjs
   Der volle Lauf urteilt gegen den Wertpapierstamm der Arbeitsablage
   (Runner) neu. Lokal ergibt er gegen den committeten Stand 167 weitere
   Abweichungen, die mit der neuen Regel nichts zu tun haben. Eine
   Regelaenderung soll genau das aendern, was die Regel betrifft.

   WAS GESCHIEHT
   Fuer jede Entscheidung, zu der die Namensschicht (company-names.json,
   Quelle des Namens je Zeile) einen Namen hat, klassifiziert derselbe
   Klassierer mit diesem Namen. Uebernommen wird das Ergebnis NUR, wenn es
   eine der genannten Klassen (--classes, z. B. DEBT) belegt
   (CLASSIFIED), und nicht gegen die Form aus dem Tickerkennzeichen
   (PREFERRED/WARRANT/UNIT/RIGHT) - dieselbe Vorrangregel wie
   build-us-eligibility.mjs withName(). Die Produkteignung entscheidet
   decideProductEligibility(), wie ueberall. Jede Aenderung steht mit Name
   und Namensquelle in der Abgleichsdatei.

   Kursabfragen: 0. Die Mitgliedschaft (universe-FULL_UNIVERSE.json) bleibt
   unveraendert; das Produktuniversum wird aus der Eignung abgeleitet.

   Ausfuehren:
     node scripts/market/apply-name-layer-class.mjs --classes DEBT [--dry-run]
   ========================================================================= */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Master = require(join(root, "quant", "engines", "us-security-master.js"));
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const CLASSES = String(arg("--classes", "")).split(",").map((s) => s.trim()).filter(Boolean);
const DRY = argv.includes("--dry-run");
const SM = join(root, "quant", "data", "market", "security-master");
const ELIG = arg("--eligibility", join(SM, "eligibility.json"));
const NAMES = arg("--names", join(SM, "company-names.json"));
const RECON = arg("--reconciliation", join(SM, "eligibility-reconciliation.json"));
const PRODUCT = arg("--product-universe", join(root, "quant", "data", "market", "scale", "universe-ELIGIBLE_US_EQUITY.json"));
const FULL = join(root, "quant", "data", "market", "scale", "universe-FULL_UNIVERSE.json");
const FORM = ["PREFERRED", "WARRANT", "UNIT", "RIGHT"];

/** Reine Entscheidung je Zeile - testbar ohne Dateien. */
export function rejudge(decision, name, member, classes, opts) {
  if (!name || !classes.length) return null;
  const c = Master.classifySecurity({ ticker: decision.ticker, exchange: decision.exchange, assetType: member && member.assetType,
    name, currency: (member && member.currency) || "USD", startDate: decision.start_date || (member && member.startDate),
    active: decision.active_status === "ACTIVE" ? true : decision.active_status === "INACTIVE" ? false : undefined }, opts);
  if (!classes.includes(c.instrumentType) || c.classificationStatus !== "CLASSIFIED") return null;
  if (c.instrumentType === decision.instrument_type) return null;
  if (FORM.includes(decision.instrument_type)) return null;          /* Tickerform vor Name */
  const d = Master.decideProductEligibility({ instrumentType: c.instrumentType, classificationStatus: c.classificationStatus,
    policyBucket: c.policyBucket, eligible: c.eligibleUsEquity === true, reason: c.eligibilityReason });
  return { ...decision, instrument_type: c.instrumentType, classification_status: c.classificationStatus,
    classification_confidence: c.classificationConfidence, product_eligibility: d.status, product_eligibility_reason: d.reason,
    evidence_source: String(decision.evidence_source || "") + "+NAME_LAYER",
    review_flags: (decision.review_flags || []).filter((f) => f !== "NAME_MISSING_ADR_REIT_SPAC_UNVERIFIED")
      .concat(["NAME_LAYER_RECLASSIFIED:" + decision.instrument_type]) };
}

function main() {
  if (!CLASSES.length) { console.error("--classes fehlt (z. B. DEBT)"); process.exit(2); }
  for (const k of CLASSES) if (!Master.CLASSES.includes(k)) { console.error("unbekannte Klasse " + k); process.exit(2); }
  const elig = JSON.parse(readFileSync(ELIG, "utf8"));
  const names = JSON.parse(readFileSync(NAMES, "utf8"));
  const full = JSON.parse(readFileSync(FULL, "utf8"));
  const nameOf = new Map((names.rows || []).filter((r) => r.companyName).map((r) => [r.securityId, r]));
  const memberOf = new Map((full.securities || []).map((s) => [s.securityId, s]));
  const listedRoots = Master.collectListedRoots(full.securities || []);
  const today = arg("--today", new Date().toISOString().slice(0, 10));
  const changes = [];
  elig.decisions = elig.decisions.map((d) => {
    const n = nameOf.get(d.securityId);
    const next = rejudge(d, n && n.companyName, memberOf.get(d.securityId), CLASSES, { today, listedRoots });
    if (!next) return d;
    changes.push({ securityId: d.securityId, ticker: d.ticker, from: { instrumentType: d.instrument_type, productEligibility: d.product_eligibility },
      to: { instrumentType: next.instrument_type, productEligibility: next.product_eligibility }, name: n.companyName, nameSource: n.nameSource || null,
      rule: "NAME_RULE:" + next.instrument_type, classifier: Master.VERSION });
    return next;
  });
  /* Zaehler aus den Entscheidungen, nicht fortgeschrieben. */
  const counts = { universeMembers: elig.decisions.length, ELIGIBLE: 0, SEPARATE_CLASS: 0, EXCLUDED: 0, REVIEW: 0 };
  const excludedByClass = {}, separateByClass = {};
  for (const d of elig.decisions) {
    counts[d.product_eligibility]++;
    if (d.product_eligibility === "EXCLUDED") excludedByClass[d.instrument_type] = (excludedByClass[d.instrument_type] || 0) + 1;
    if (d.product_eligibility === "SEPARATE_CLASS") separateByClass[d.instrument_type] = (separateByClass[d.instrument_type] || 0) + 1;
  }
  counts.productUniverse = counts.ELIGIBLE + counts.SEPARATE_CLASS + counts.REVIEW;
  console.log(`Namensregel ${CLASSES.join(",")}: ${changes.length} Entscheidungen geaendert`);
  for (const c of changes) console.log(`  ${c.ticker.padEnd(8)} ${c.from.instrumentType}/${c.from.productEligibility} -> ${c.to.instrumentType}/${c.to.productEligibility}  "${c.name}" (${c.nameSource})`);
  console.log("Zaehler:", JSON.stringify(counts));
  if (DRY || !changes.length) return;

  const at = new Date().toISOString();
  /* Die neue Version unterscheidet sich von der alten nur um die genannten
     Namensklassen (nur ueber den Namen belegbar, NAME_ONLY_CLASSES), und
     diese Klassen wurden eben ueber alle Zeilen mit Namen neu beurteilt.
     Das ist die Neubeurteilung mit der aktuellen Version - so steht sie da,
     mit dem Weg, auf dem sie geschah. */
  const rejudged = elig.securityMasterRejudged
    ? { ...elig.securityMasterRejudged, expected: Master.VERSION, via: "NAME_LAYER_CLASSES:" + CLASSES.join(",") }
    : null;
  Object.assign(elig, { version: Master.VERSION, counts, excludedByClass, separateByClass, securityMasterRejudged: rejudged,
    nameLayerClassApplied: { at, classes: CLASSES, changed: changes.length, script: "scripts/market/apply-name-layer-class.mjs" } });
  writeFileSync(ELIG, JSON.stringify(elig, null, 1) + "\n");

  const recon = JSON.parse(readFileSync(RECON, "utf8"));
  recon.changes = (recon.changes || []).concat(changes.map((c) => ({ ...c, at })));
  recon.totals = { ...(recon.totals || {}), changed: recon.changes.length };
  recon.nameLayerClassApplied = elig.nameLayerClassApplied;
  writeFileSync(RECON, JSON.stringify(recon, null, 1) + "\n");

  const product = JSON.parse(readFileSync(PRODUCT, "utf8"));
  const out = new Set(changes.filter((c) => c.to.productEligibility === "EXCLUDED").map((c) => c.securityId));
  const byId = new Map(elig.decisions.map((d) => [d.securityId, d]));
  product.securities = product.securities.filter((s) => !out.has(s.securityId)).map((s) => { const d = byId.get(s.securityId); return d ? { ...s, productEligibility: d.product_eligibility } : s; });
  product.actualSize = product.securities.length;
  product.counts = { ELIGIBLE: counts.ELIGIBLE, SEPARATE_CLASS: counts.SEPARATE_CLASS, REVIEW: counts.REVIEW, EXCLUDED_NOT_LISTED_HERE: counts.EXCLUDED };
  product.version = Master.VERSION;
  writeFileSync(PRODUCT, JSON.stringify(product, null, 1) + "\n");
  console.log(`Produktuniversum: ${product.actualSize} Titel`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
