#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — apply-ended-listings.mjs

   Beendete Notierungen verlassen das Produktuniversum (Steuerung 17.11.2026).

   DAS PROBLEM
   Ein Titel, den der Wertpapierstamm INACTIVE fuehrt, bekommt in der
   Eignung REVIEW ("UNCONFIRMED:LISTING_INACTIVE") und bleibt damit im
   Produktuniversum (#1822: Verdacht ohne Beleg bleibt). Tiingo schrieb fuer
   viele dieser Titel den letzten Schluss monatelang fort; seit dem 06.11.2026
   liefert es fuer 222 von ihnen nichts mehr. Sie stehen weiter im Universum,
   tragen aber weder Kurs noch Faktorwert (Faktordeckung 94 %).

   DER BELEG (beides noetig, Kursabfragen: 0)
   A  Stamm INACTIVE (keine ACTIVE-Zeile, core/listing-staleness.js#masterIndex; die Entscheidung fuehrt
      active_status INACTIVE - REVIEW "LISTING_INACTIVE" ebenso wie inaktive SPACs und Vorzuege in SEPARATE_CLASS)
      UND die Tagesreihe ist zu Ende: ihre letzte Bar liegt mehr als MAX_LAG
      Sitzungen hinter der neuesten Sitzung DES DATENBESTANDS (nicht der Uhr -
      faellt der Kursabruf aus, bleibt jeder Titel unberuehrt).
      -> EXCLUDED, "CONFIRMED_LISTING_ENDED:MASTER_INACTIVE"
      Eine laufende Reihe (Ticker-Wiederverwendung, MASTER_INACTIVE_SERIES_CURRENT)
      bleibt REVIEW. Ohne Reihe kein Beleg: bleibt REVIEW.
   B  Ein Eintrag im quellengebundenen Register quant/config/listing-ended-evidence.json
      (Uebernahme mit Stichtag, Kaeufer, Quelle) UND die Reihe endet spaetestens
      GRACE_DAYS nach dem Stichtag und ist zu Ende wie unter A.
      -> EXCLUDED, "CONFIRMED_LISTING_ENDED:" + event
   Belegte Ticker-Wiederverwendung (quant/config/ticker-reuse-quarantine.json)
   wird nie umgestuft - dieselbe Regel wie apply-exchange-directory.mjs.

   Die Mitgliedschaft (universe-FULL_UNIVERSE.json) bleibt unveraendert; jede
   Aenderung steht mit Beleg und Regel in eligibility-reconciliation.json.
   Ueber die Grenzen je Lauf (core/registry/eligibility-gate.json) geht es nur
   mit Freigabeliste und eigenem PR (security-master-eligibility.yml, approved_catchup).

   Ausfuehren:
     node scripts/market/apply-ended-listings.mjs [--eligibility F] [--reconciliation F] [--product-universe F]
       [--series-dir D] [--master F] [--evidence F] [--dry-run]
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { loadTickerReuseQuarantine } from "./universe-source.mjs";
import { countDecisions } from "./apply-exchange-directory.mjs";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Staleness = require(join(root, "core", "listing-staleness.js"));
const TS = require(join(root, "quant", "engines", "realtime", "trading-session.js"));

export const RULE_VERSION = "ended-listings-1.0.0";
export const EVIDENCE_SCHEMA = "listing-ended-evidence-1.0.0";
export const MAX_LAG = 2;
export const GRACE_DAYS = 7;
const EVENTS = ["ACQUISITION"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function addDays(date, n) { const d = new Date(date + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

/** Register -> Map securityId -> Eintrag. Fail closed bei jedem Formfehler. */
export function indexEvidence(doc) {
  const by = new Map();
  if (doc === null || doc === undefined) return by;
  if (!doc || doc.schemaVersion !== EVIDENCE_SCHEMA || !Array.isArray(doc.records)) throw new Error("LISTING_ENDED_EVIDENCE_INVALID: schemaVersion " + EVIDENCE_SCHEMA + " mit records[] erwartet");
  doc.records.forEach((r, i) => {
    const bad = (m) => { throw new Error("LISTING_ENDED_EVIDENCE_INVALID: records[" + i + "] " + m); };
    if (!r || typeof r.securityId !== "string" || !/^ref_/.test(r.securityId)) bad("securityId");
    if (typeof r.ticker !== "string" || !r.ticker) bad("ticker");
    if (!EVENTS.includes(r.event)) bad("event " + r.event);
    if (!ISO.test(r.effectiveDate || "")) bad("effectiveDate");
    if (typeof r.counterparty !== "string" || !r.counterparty) bad("counterparty");
    if (!Array.isArray(r.sources) || !r.sources.length || !r.sources.every((u) => /^https:\/\//.test(u))) bad("sources");
    if (by.has(r.securityId)) bad("doppelt " + r.securityId);
    by.set(r.securityId, Object.freeze({ ...r }));
  });
  return by;
}

/** Sitzungsabstand ueber den Handelskalender. */
export function lagFn(calendar) {
  return (date, ref) => {
    if (!date || !ref) return null;
    if (date >= ref) return 0;
    let d = date, n = 0;
    while (d < ref && n < 400) { d = TS.nextTradingDay(d, { calendar }); if (!d) return null; n++; }
    return n;
  };
}

/**
 * Reine Entscheidung je Zeile - testbar ohne Dateien.
 * @returns {null | {next, rule, evidence}}  null = unveraendert
 */
export function judgeEnded(decision, series, state, evidence, ref, lag) {
  if (!decision || decision.product_eligibility === "EXCLUDED") return null;
  const t = series ? Staleness.tailRun(series.points) : null;
  if (!t) return null;
  const behind = lag(t.to, ref);
  if (behind === null || behind <= MAX_LAG) return null;
  const base = { seriesTo: t.to, sessionsBehind: behind, referenceSession: ref, tailRun: t.run, tailSince: t.since };
  const exclude = (reason, rule, ev) => ({ rule, evidence: { ...base, ...ev }, next: { ...decision, product_eligibility: "EXCLUDED", product_eligibility_reason: reason,
    evidence_source: String(decision.evidence_source || "") + "+ENDED_LISTING", review_flags: (decision.review_flags || []).concat([rule]) } });
  if (decision.active_status === "INACTIVE" && state && !state.active) {
    return exclude("CONFIRMED_LISTING_ENDED:MASTER_INACTIVE", "ENDED_LISTING:MASTER_INACTIVE", { master: state.status, masterEnd: state.maxEnd });
  }
  if (evidence && t.to <= addDays(evidence.effectiveDate, GRACE_DAYS)) {
    return exclude("CONFIRMED_LISTING_ENDED:" + evidence.event, "ENDED_LISTING:" + evidence.event,
      { event: evidence.event, effectiveDate: evidence.effectiveDate, counterparty: evidence.counterparty, sources: evidence.sources });
  }
  return null;
}

/**
 * Regel C (22.11.2026): Fortschreibung. Nach der Bereinigung entfernt die Umfangsfolge die Kursreihen der beendeten
 * Notierungen (privat gesichert, B2a). Ohne Reihe fehlte Regel A/B der Beleg "Reihe zu Ende", und der Titel kaeme
 * beim naechsten Lauf zurueck. Ein Titel bleibt deshalb EXCLUDED mit seinem bisherigen Grund, wenn
 *   - der VORIGE Stand ihn als CONFIRMED_LISTING_ENDED:* fuehrte,
 *   - es keine Reihe gibt (eine wieder auftauchende Reihe - Neuvergabe des Kuerzels - entscheidet neu nach A/B),
 *   - und sein Beleg weiter gilt: Stamm INACTIVE (Regel A) bzw. Registereintrag (Regel B).
 * @returns {null | {next, rule, evidence}}
 */
export function judgeCarried(decision, previous, series, state, evidence) {
  if (!decision || decision.product_eligibility === "EXCLUDED" || !previous) return null;
  const why = String(previous.product_eligibility_reason || "");
  if (previous.product_eligibility !== "EXCLUDED" || !why.startsWith("CONFIRMED_LISTING_ENDED:")) return null;
  if (series && Array.isArray(series.points) && series.points.length) return null;
  const event = why.slice("CONFIRMED_LISTING_ENDED:".length);
  const stillProven = event === "MASTER_INACTIVE" ? !!(state && !state.active) : !!(evidence && evidence.event === event);
  if (!stillProven) return null;
  return { rule: "ENDED_LISTING:CARRIED", evidence: { previousReason: why, seriesRemoved: true, master: state ? state.status : null, register: evidence ? evidence.securityId : null },
    next: { ...decision, product_eligibility: "EXCLUDED", product_eligibility_reason: why,
      evidence_source: String(decision.evidence_source || "") + "+ENDED_LISTING", review_flags: (decision.review_flags || []).concat(["ENDED_LISTING:CARRIED"]) } };
}

/** Neueste Sitzung des Datenbestands: die haeufigste letzte Bar unter allen Reihen, die nicht weiter zurueckliegt als die neueste. */
export function referenceSession(lastDates) {
  const m = new Map();
  for (const d of lastDates) if (d) m.set(d, (m.get(d) || 0) + 1);
  if (!m.size) return null;
  return [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0][0];
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const DRY = argv.includes("--dry-run");
  const SM = join(root, "quant", "data", "market", "security-master");
  const ELIG = arg("--eligibility", join(SM, "eligibility.json"));
  const RECON = arg("--reconciliation", join(SM, "eligibility-reconciliation.json"));
  const PRODUCT = arg("--product-universe", join(root, "quant", "data", "market", "scale", "universe-ELIGIBLE_US_EQUITY.json"));
  const SERIES = arg("--series-dir", join(root, "quant", "data", "market", "discover-series"));
  const MASTER = arg("--master", join(SM, "us-security-master.json"));
  const EVID = arg("--evidence", join(root, "quant", "config", "listing-ended-evidence.json"));
  /* voriger Stand fuer Regel C: im Workflow die committete Eignung (der Kandidat liegt in RUNNER_TEMP) */
  const PREV = arg("--previous", join(SM, "eligibility.json"));
  const calendar = JSON.parse(readFileSync(join(root, "quant", "config", "market-calendar.json"), "utf8"));

  const elig = JSON.parse(readFileSync(ELIG, "utf8"));
  const prevById = new Map((existsSync(PREV) ? JSON.parse(readFileSync(PREV, "utf8")).decisions || [] : []).map((d) => [d.securityId, d]));
  const mIdx = Staleness.masterIndex(JSON.parse(readFileSync(MASTER, "utf8")));
  const evidence = indexEvidence(existsSync(EVID) ? JSON.parse(readFileSync(EVID, "utf8")) : null);
  const series = new Map();
  for (const f of readdirSync(SERIES).filter((n) => /^ref_.*\.json$/.test(n))) {
    try { const s = JSON.parse(readFileSync(join(SERIES, f), "utf8")); if (s && s.securityId && Array.isArray(s.points)) series.set(s.securityId, s); } catch (e) { /* unlesbar: kein Beleg */ }
  }
  const ref = referenceSession([...series.values()].map((s) => s.points.length ? s.points[s.points.length - 1][0] : null));
  if (!ref) throw new Error("ENDED_LISTINGS_NO_REFERENCE_SESSION");
  const lag = lagFn(calendar);
  const reuse = loadTickerReuseQuarantine(root);
  const reuseIds = reuse ? reuse.records : new Map();
  const changes = [], before = countDecisions(elig.decisions), usedEvidence = new Set();
  let skippedReuse = 0;
  elig.decisions = elig.decisions.map((d) => {
    if (reuseIds.has(d.securityId)) { skippedReuse++; return d; }
    const j = judgeEnded(d, series.get(d.securityId), mIdx.byId[d.securityId], evidence.get(d.securityId), ref, lag)
      || judgeCarried(d, prevById.get(d.securityId), series.get(d.securityId), mIdx.byId[d.securityId], evidence.get(d.securityId));
    if (!j) return d;
    if (evidence.has(d.securityId)) usedEvidence.add(d.securityId);
    changes.push({ securityId: d.securityId, ticker: d.ticker, from: { productEligibility: d.product_eligibility, reason: d.product_eligibility_reason },
      to: { productEligibility: j.next.product_eligibility, reason: j.next.product_eligibility_reason }, rule: j.rule, ruleVersion: RULE_VERSION, evidence: j.evidence });
    return j.next;
  });
  const unusedEvidence = [...evidence.keys()].filter((id) => !usedEvidence.has(id));
  const after = countDecisions(elig.decisions), byRule = {};
  for (const c of changes) byRule[c.rule] = (byRule[c.rule] || 0) + 1;
  console.log(`Bezugssitzung ${ref} · Reihen ${series.size} · Register ${evidence.size} (ungenutzt: ${unusedEvidence.join(", ") || "keins"})`);
  console.log(`Geaendert: ${changes.length} ${JSON.stringify(byRule)} (Ticker-Wiederverwendung ausgelassen: ${skippedReuse})`);
  console.log("Vorher:", JSON.stringify(before.counts));
  console.log("Nachher:", JSON.stringify(after.counts));
  if (DRY || !changes.length) return;

  const at = new Date().toISOString();
  const applied = { at, ruleVersion: RULE_VERSION, referenceSession: ref, maxLag: MAX_LAG, graceDays: GRACE_DAYS, changed: changes.length, byRule,
                    skippedTickerReuse: skippedReuse, unusedEvidence, countsBefore: before.counts, script: "scripts/market/apply-ended-listings.mjs" };
  Object.assign(elig, { counts: after.counts, excludedByClass: after.excludedByClass, separateByClass: after.separateByClass, endedListingsApplied: applied });
  writeFileSync(ELIG, JSON.stringify(elig, null, 1) + "\n");
  const recon = JSON.parse(readFileSync(RECON, "utf8"));
  recon.changes = (recon.changes || []).concat(changes.map((c) => ({ ...c, at })));
  recon.totals = { ...(recon.totals || {}), changed: recon.changes.length };
  recon.endedListingsApplied = applied;
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
