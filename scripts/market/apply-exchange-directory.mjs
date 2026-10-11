#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — apply-exchange-directory.mjs

   Die WERTPAPIERBEZEICHNUNG der Boerse als Beleg fuer die Gattung.

   DAS PROBLEM
   Der Stamm und die Namensschicht (company-names.json) kennen je Ticker
   nur den Namen des EMITTENTEN: KMPB heisst dort "Kemper Corporation",
   genau wie die Stammaktie KMPR. Die Namensregeln des Klassierers
   (DEBT, ETN, ETF, PREFERRED ...) haben damit nichts zu greifen - eine
   nachrangige Anleihe ("5.875% ... Junior Subordinated Debentures due
   2062") bleibt EQUITY_COMMON/ELIGIBLE. Das ist kein Einzelfall, sondern
   strukturell: jede boersennotierte Schuldverschreibung, jeder ETN und
   jeder ETF ohne Gattungskennzeichen im Ticker faellt durch.

   DER BELEG
   Das Symbolverzeichnis der Boersen (Nasdaq Trader, nasdaqlisted.txt und
   otherlisted.txt; bereits Quelle in tiingo2-refresh.mjs) fuehrt je
   Ticker die Bezeichnung DES PAPIERS ("Oxford Lane Capital Corp. - 5.00%
   Notes due 2027"), eine ETF-Kennung und eine Testpapier-Kennung. US-
   Ticker sind boersenuebergreifend eindeutig; die Zuordnung laeuft
   ueber core/identity.js (ADR-001).

   DIE REGEL (deterministisch, je Klasse festgelegt)
   Derselbe Klassierer (us-security-master.js#classifySecurity), dieselbe
   Eignungsentscheidung (decideProductEligibility) - nur mit dem Beleg,
   der vorher fehlte. Uebernommen wird ein Befund nur, wenn er CLASSIFIED
   ist und die Klassenregel ihn traegt:
     (Standard: DEBT, ETN, PREFERRED, WARRANT/RIGHT/UNIT; ETF nur mit --classes, s. DEFAULT_CLASSES)
     DEBT       Name weist Schuldverschreibung aus (Notes/Debentures due ...)
     ETN        Name weist Exchange Traded Note aus
     ETF        Name weist ETF aus UND Verzeichnis-Kennung ETF = Y
     PREFERRED  Name weist Vorzug aus UND kein Hinterlegungsschein auf
                Stamm-/Ordinary-Aktien (ITUB, PBR-A: ADR auf Vorzuege sind
                die Hauptnotiz der Gesellschaft, keine Vorzugsanleihe)
     WARRANT / RIGHT / UNIT  nur Bestaetigung eines bestehenden Verdachts
                (REVIEW -> belegt), nie Umstufung einer Stammaktie
   Nicht angewendet (Produktpolicy, nicht Datenfehler; im Bericht gezaehlt):
     ADR, REIT, SPAC, TRUST, CEF (Nasdaq fuehrt BDCs wie ARCC als
     "Closed End Fund"), Umstufungen ZUR Stammaktie.
   Die Form aus dem Tickerkennzeichen (-P-, W, U, R) steht weiter ueber
   dem Namen (dieselbe Vorrangregel wie build-us-eligibility.mjs).

   AKTIVITAET
   Eine Entscheidung "UNCONFIRMED:LISTING_INACTIVE", deren Ticker im
   heutigen Verzeichnis als handelbares Papier (kein Testpapier) steht,
   ist belegt aktiv. Sie wird mit active=true und dem bisherigen Namen
   neu beurteilt; die Gattung bleibt (nur die Aktivitaet war falsch).

   Kursabfragen: 0. Die Mitgliedschaft (universe-FULL_UNIVERSE.json)
   bleibt unveraendert; jede Aenderung steht mit Bezeichnung, Quelle und
   Regel in eligibility-reconciliation.json.

   Ausfuehren:
     node scripts/market/apply-exchange-directory.mjs [--dir <ordner>] [--today JJJJ-MM-TT] [--dry-run]
       --dir: Ordner mit nasdaqlisted.txt und otherlisted.txt; fehlen sie,
              werden sie von nasdaqtrader.com geladen (nicht committet).
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Master = require(join(root, "quant", "engines", "us-security-master.js"));
const Identity = require(join(root, "core", "identity.js"));

export const RULE_VERSION = "exchange-directory-class-1.0.0";
export const SOURCE = "NASDAQ_TRADER_SYMBOL_DIRECTORY";
export const KNOWN_CLASSES = ["DEBT", "ETN", "ETF", "PREFERRED", "WARRANT", "RIGHT", "UNIT"];
/* Standard ohne ETF: SPY und andere ETFs stehen heute als Benchmark und mit eigener Seite im Produktuniversum
   (benchmark-reference, capability-matrix). Ihre Herausnahme ist eine Policy-Migration mit eigenem PR, kein Datenfehler-Fix;
   --classes ...,ETF wendet sie an, sobald die Abhaengigkeiten geloest sind. Bis dahin zaehlt der Bericht sie. */
export const DEFAULT_CLASSES = ["DEBT", "ETN", "PREFERRED", "WARRANT", "RIGHT", "UNIT"];
const FORM = ["PREFERRED", "WARRANT", "UNIT", "RIGHT"];
const CONFIRM_ONLY = ["WARRANT", "RIGHT", "UNIT"];
const EXCHANGE = { N: "NYSE", A: "NYSE AMERICAN", P: "NYSE ARCA", Z: "BATS", V: "IEX", M: "NYSE CHICAGO" };

/** Ein Verzeichnis (Pipe-Format) → Zeilen; wirft bei falschem Format (kein stilles Leerergebnis). */
export function parseDirectory(text, source) {
  const lines = String(text).trim().split(/\r?\n/), fields = lines.shift().split("|");
  const symbolField = source === "nasdaqlisted" ? "Symbol" : "ACT Symbol";
  if (!fields.includes(symbolField) || !fields.includes("Security Name")) throw new Error("INVALID_EXCHANGE_DIRECTORY:" + source);
  const rows = [];
  for (const line of lines) {
    if (line.startsWith("File Creation Time:")) continue;
    const cells = line.split("|");
    if (cells.length !== fields.length) throw new Error("INVALID_EXCHANGE_DIRECTORY_ROW:" + source);
    const r = Object.fromEntries(fields.map((f, i) => [f, cells[i]]));
    rows.push({ ticker: r[symbolField].replaceAll(".", "-"), securityName: r["Security Name"], etf: r.ETF === "Y", test: r["Test Issue"] === "Y",
                exchange: source === "nasdaqlisted" ? "NASDAQ" : (EXCHANGE[r.Exchange] || r.Exchange), source });
  }
  return rows;
}
/** Verzeichniszeilen je securityId (Identitaet ueber core/identity.js). */
export function directoryIndex(rows) {
  const m = new Map();
  for (const r of rows) {
    let id; try { id = Identity.securityIdForTicker(r.ticker); } catch (e) { continue; }   // Verzeichnis-Schreibweisen ohne Produktidentitaet (ABR$D)
    m.set(id, r);
  }
  return m;
}

/** Klassenregel: traegt die Bezeichnung die Gattung? (zusaetzlich zum CLASSIFIED-Befund des Klassierers) */
export function classRuleHolds(cls, entry) {
  if (cls === "ETF") return entry.etf === true;
  if (cls === "PREFERRED") return !/\b(AMERICAN DEPOSIT[AO]RY|ADRS?|ADS|GLOBAL DEPOSIT[AO]RY|ORDINARY SHARES?)\b/i.test(entry.securityName);
  return true;
}

/**
 * Reine Entscheidung je Zeile — testbar ohne Dateien.
 * @returns {null | {next, rule}}  null = unveraendert
 */
export function judgeWithDirectory(decision, entry, member, companyName, opts, classes = DEFAULT_CLASSES) {
  if (!entry || entry.test) return null;
  const decide = (c) => Master.decideProductEligibility({ instrumentType: c.instrumentType, classificationStatus: c.classificationStatus,
    policyBucket: c.policyBucket, eligible: c.eligibleUsEquity === true, reason: c.eligibilityReason });
  const row = (name, active) => ({ ticker: decision.ticker, exchange: decision.exchange, assetType: member && member.assetType, name,
    currency: (member && member.currency) || "USD", startDate: decision.start_date || (member && member.startDate), active });
  const active = decision.active_status === "ACTIVE" ? true : decision.active_status === "INACTIVE" ? false : undefined;
  /* 1. Gattung aus der Wertpapierbezeichnung */
  const c = Master.classifySecurity(row(entry.securityName, active === false ? true : active), opts);
  const from = decision.instrument_type;
  const typeOk = c.classificationStatus === "CLASSIFIED" && classes.includes(c.instrumentType) && classRuleHolds(c.instrumentType, entry);
  const confirm = typeOk && c.instrumentType === from && decision.product_eligibility === "REVIEW";   // Verdacht → belegt
  const change = typeOk && c.instrumentType !== from && !FORM.includes(from) && !CONFIRM_ONLY.includes(c.instrumentType);
  if (change || confirm) {
    const d = decide(c);
    return { rule: "DIRECTORY_NAME:" + c.instrumentType + (confirm ? ":CONFIRMED" : ""), next: { ...decision, instrument_type: c.instrumentType, classification_status: c.classificationStatus,
      classification_confidence: c.classificationConfidence, active_status: "ACTIVE", product_eligibility: d.status, product_eligibility_reason: d.reason,
      evidence_source: String(decision.evidence_source || "") + "+EXCHANGE_DIRECTORY",
      review_flags: (decision.review_flags || []).filter((f) => f !== "NAME_MISSING_ADR_REIT_SPAC_UNVERIFIED").concat(["EXCHANGE_DIRECTORY_RECLASSIFIED:" + from]) } };
  }
  /* 2. Aktivitaet: im heutigen Verzeichnis gelistet → aktiv; Gattung bleibt */
  if (decision.product_eligibility_reason === "UNCONFIRMED:LISTING_INACTIVE") {
    const a = Master.classifySecurity(row(companyName || entry.securityName, true), opts);
    if (a.instrumentType !== from) return null;
    const d = decide(a);
    if (d.status === decision.product_eligibility) return null;
    return { rule: "DIRECTORY_LISTED:ACTIVE", next: { ...decision, active_status: "ACTIVE", classification_status: a.classificationStatus, classification_confidence: a.classificationConfidence,
      product_eligibility: d.status, product_eligibility_reason: d.reason, evidence_source: String(decision.evidence_source || "") + "+EXCHANGE_DIRECTORY",
      review_flags: (decision.review_flags || []).concat(["EXCHANGE_DIRECTORY_LISTED_ACTIVE"]) } };
  }
  return null;
}

/** Zaehler aus den Entscheidungen (nicht fortgeschrieben) — wie apply-name-layer-class.mjs. */
export function countDecisions(decisions) {
  const counts = { universeMembers: decisions.length, ELIGIBLE: 0, SEPARATE_CLASS: 0, EXCLUDED: 0, REVIEW: 0 }, excludedByClass = {}, separateByClass = {};
  for (const d of decisions) {
    counts[d.product_eligibility]++;
    if (d.product_eligibility === "EXCLUDED") excludedByClass[d.instrument_type] = (excludedByClass[d.instrument_type] || 0) + 1;
    if (d.product_eligibility === "SEPARATE_CLASS") separateByClass[d.instrument_type] = (separateByClass[d.instrument_type] || 0) + 1;
  }
  counts.productUniverse = counts.ELIGIBLE + counts.SEPARATE_CLASS + counts.REVIEW;
  return { counts, excludedByClass, separateByClass };
}

async function loadDirectory(dir) {
  const rows = [];
  for (const name of ["nasdaqlisted", "otherlisted"]) {
    const f = join(dir, name + ".txt");
    if (!existsSync(f)) {
      const r = await fetch("https://www.nasdaqtrader.com/dynamic/SymDir/" + name + ".txt", { signal: AbortSignal.timeout(45000) });
      if (!r.ok) throw new Error("EXCHANGE_DIRECTORY_HTTP_" + r.status);
      mkdirSync(dir, { recursive: true }); writeFileSync(f, await r.text());
    }
    const text = readFileSync(f, "utf8");
    rows.push(...parseDirectory(text, name));
    const m = text.match(/File Creation Time:\s*(\d{2})(\d{2})(\d{4})/), stamp = m ? m[3] + "-" + m[1] + "-" + m[2] : null;   // MMTTJJJJhh:mm
    loadDirectory.asOf = loadDirectory.asOf || stamp || null;
  }
  return rows;
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const DRY = argv.includes("--dry-run");
  const SM = join(root, "quant", "data", "market", "security-master");
  const ELIG = arg("--eligibility", join(SM, "eligibility.json"));
  const RECON = arg("--reconciliation", join(SM, "eligibility-reconciliation.json"));
  const PRODUCT = arg("--product-universe", join(root, "quant", "data", "market", "scale", "universe-ELIGIBLE_US_EQUITY.json"));
  const FULL = join(root, "quant", "data", "market", "scale", "universe-FULL_UNIVERSE.json");
  const NAMES = join(SM, "company-names.json");
  const DIR = arg("--dir", join(root, ".market-cache", "exchange-directory"));
  const today = arg("--today", new Date().toISOString().slice(0, 10));
  const classes = String(arg("--classes", DEFAULT_CLASSES.join(","))).split(",").map((x) => x.trim()).filter(Boolean);
  for (const k of classes) if (!KNOWN_CLASSES.includes(k)) { console.error("unbekannte Klasse " + k); process.exit(2); }

  const rows = await loadDirectory(DIR), byId = directoryIndex(rows);
  const elig = JSON.parse(readFileSync(ELIG, "utf8")), full = JSON.parse(readFileSync(FULL, "utf8"));
  const names = existsSync(NAMES) ? new Map((JSON.parse(readFileSync(NAMES, "utf8")).rows || []).filter((r) => r.companyName).map((r) => [r.securityId, r.companyName])) : new Map();
  const memberOf = new Map((full.securities || []).map((s) => [s.securityId, s]));
  const opts = { today, listedRoots: Master.collectListedRoots(full.securities || []) };
  const changes = [], before = countDecisions(elig.decisions);
  let matched = 0;
  elig.decisions = elig.decisions.map((d) => {
    const e = byId.get(d.securityId); if (e) matched++;
    const j = judgeWithDirectory(d, e, memberOf.get(d.securityId), names.get(d.securityId), opts, classes);
    if (!j) return d;
    changes.push({ securityId: d.securityId, ticker: d.ticker, from: { instrumentType: d.instrument_type, productEligibility: d.product_eligibility, activeStatus: d.active_status },
      to: { instrumentType: j.next.instrument_type, productEligibility: j.next.product_eligibility, activeStatus: j.next.active_status },
      securityName: e.securityName, directoryExchange: e.exchange, etfFlag: e.etf, source: SOURCE, directoryAsOf: loadDirectory.asOf || null, rule: j.rule, ruleVersion: RULE_VERSION, classifier: Master.VERSION });
    return j.next;
  });
  const after = countDecisions(elig.decisions);
  const byRule = {};
  for (const c of changes) { const k = c.from.instrumentType + "/" + c.from.productEligibility + " -> " + c.to.instrumentType + "/" + c.to.productEligibility; byRule[k] = (byRule[k] || 0) + 1; }
  console.log(`Verzeichnis: ${rows.length} Zeilen (Stand ${loadDirectory.asOf || "?"}), ${matched} von ${elig.decisions.length} Entscheidungen zugeordnet`);
  console.log(`Geaendert: ${changes.length}`);
  for (const [k, n] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);
  console.log("Vorher:", JSON.stringify(before.counts));
  console.log("Nachher:", JSON.stringify(after.counts));
  if (DRY || !changes.length) return;

  const at = new Date().toISOString();
  const applied = { at, ruleVersion: RULE_VERSION, source: SOURCE, directoryAsOf: loadDirectory.asOf || null, classes, changed: changes.length, byTransition: byRule,
                    countsBefore: before.counts, script: "scripts/market/apply-exchange-directory.mjs" };
  Object.assign(elig, { counts: after.counts, excludedByClass: after.excludedByClass, separateByClass: after.separateByClass, exchangeDirectoryApplied: applied });
  writeFileSync(ELIG, JSON.stringify(elig, null, 1) + "\n");

  const recon = JSON.parse(readFileSync(RECON, "utf8"));
  recon.changes = (recon.changes || []).concat(changes.map((c) => ({ ...c, at })));
  recon.totals = { ...(recon.totals || {}), changed: recon.changes.length };
  recon.exchangeDirectoryApplied = applied;
  writeFileSync(RECON, JSON.stringify(recon, null, 1) + "\n");

  const product = JSON.parse(readFileSync(PRODUCT, "utf8"));
  const byIdD = new Map(elig.decisions.map((d) => [d.securityId, d]));
  product.securities = product.securities.filter((s) => { const d = byIdD.get(s.securityId); return !d || d.product_eligibility !== "EXCLUDED"; })
    .map((s) => { const d = byIdD.get(s.securityId); return d ? { ...s, productEligibility: d.product_eligibility } : s; });
  product.actualSize = product.securities.length;
  product.counts = { ELIGIBLE: after.counts.ELIGIBLE, SEPARATE_CLASS: after.counts.SEPARATE_CLASS, REVIEW: after.counts.REVIEW, EXCLUDED_NOT_LISTED_HERE: after.counts.EXCLUDED };
  writeFileSync(PRODUCT, JSON.stringify(product, null, 1) + "\n");
  console.log(`Produktuniversum: ${product.actualSize} Titel`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e.message); process.exit(1); });
