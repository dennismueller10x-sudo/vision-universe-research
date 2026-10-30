#!/usr/bin/env node
/**
 * Übernahme-Gate der wöchentlichen Aktualisierung von US-Wertpapierstamm und Firmennamen
 * (.github/workflows/security-master-weekly.yml). Erzeugt nichts selbst: es vergleicht den Lauf der bestehenden
 * Erzeuger (scripts/market/build-us-security-master.mjs, scripts/market/build-company-names.mjs) mit dem
 * committeten Stand und entscheidet, ob er übernommen werden darf.
 *
 *   node scripts/market/security-master-refresh-gate.mjs --prev <dir> --next <dir>
 *        [--prev-names <file>] [--next-names <file>] [--today YYYY-MM-DD] [--allow-version-change]
 *        [--thresholds <json-file>] [--approved-changes <file> ...] [--out <report.json>]
 *
 * Fail closed (Exit 4, nichts wird übernommen):
 *   G1  Anbieterliste nicht erhoben (summary.status != OK, providerFetch != FETCHED)
 *   G2  Bestand nicht vollständig abgeglichen (BASELINE_ACCOUNTED_FOR != BASELINE_COUNT, destructiveViolations > 0)
 *   G3  Anbieterzeilen weichen mehr als maxProviderRowChangePct vom letzten Stand ab
 *   G4  ausgelieferte Zeilen fallen um mehr als maxRowsDrop
 *   G5  eine Bestands-securityId fehlt, oder eine securityId ist nicht core/identity.js-konform
 *   G6  neue doppelte canonical_id (bekannte Doppelungen der Anbieterliste werden nur ausgewiesen)
 *   G7  mehr Änderungen als erlaubt: canonical_id, Instrumenttyp, aktiv → inaktiv, Eignung, Ticker je securityId
 *   G8  Klassifikator-Version weicht ab, ohne --allow-version-change (erster Lauf 1.1.0 → 1.3.0: Owner-Prüfung)
 *   G9  Firmennamen: Produktuniversum weicht ab, securityIds fehlen, Namensabdeckung fällt, zu viele Namenswechsel
 *   G10 Eingaben fehlen oder sind nicht lesbar
 *
 * Entscheidung bei bestandenem Gate (Idempotenz und Datenwachstum): COMMIT, wenn sich fachlich etwas geändert hat
 * oder der letzte Stand mindestens maxAgeDays alt ist; sonst SKIP_NO_MATERIAL_CHANGE (der Erzeuger schreibt je
 * Lauf alle Zeitstempel neu, ein Commit ohne fachliche Änderung brächte nur Datenwachstum und machte die
 * Quant-Backtest-Schlüssel ungültig).
 *
 * Rein lesend; schreibt nur den Bericht nach --out. Kein Netzzugriff.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Identity = createRequire(import.meta.url)(join(ROOT, "core", "identity.js"));

export const GATE_VERSION = "security-master-refresh-gate-1.0.0";
/** Vorgeschlagene Grenzen (Owner-Entscheidung; Begründung in docs/data/SECURITY_MASTER_WEEKLY.md). */
export const DEFAULT_THRESHOLDS = Object.freeze({
  maxProviderRowChangePct: 5,
  maxRowsDrop: 50,
  maxCanonicalIdChanges: 25,
  maxInstrumentTypeChanges: 25,
  maxDeactivations: 50,
  maxEligibilityFlips: 50,
  maxTickerChanges: 25,
  maxNamesCoverageDrop: 20,
  maxNameChanges: 200,
  maxAgeDays: 21,
});
const SAMPLE = 50;

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const sortedSet = (xs) => [...new Set(xs.filter((x) => x !== null && x !== undefined).map(String))].sort().join("|");

/** Bestandszeilen je baseline_security_id (mehrdeutige Titel haben mehrere Zeilen). */
export function baselineIndex(master) {
  const by = new Map();
  for (const r of master.rows || []) {
    if (!r.baseline_member || !r.baseline_security_id) continue;
    if (!by.has(r.baseline_security_id)) by.set(r.baseline_security_id, []);
    by.get(r.baseline_security_id).push(r);
  }
  return by;
}

function aspect(rows) {
  return {
    canonical: sortedSet(rows.map((r) => r.canonical_id)),
    type: sortedSet(rows.map((r) => r.instrument_type)),
    active: rows.some((r) => r.active_status === "ACTIVE"),
    eligible: rows.some((r) => r.eligible_us_equity === true),
    ticker: sortedSet(rows.map((r) => r.ticker)),
  };
}

/** Fachlicher Vergleich zweier Stände (rein). */
export function compareMasters(prev, next) {
  const a = baselineIndex(prev), b = baselineIndex(next);
  const out = { lostIds: [], newIds: [], canonicalIdChanges: [], instrumentTypeChanges: [], deactivations: [], reactivations: [], eligibilityFlips: [], tickerChanges: [] };
  for (const [id, rows] of a) {
    if (!b.has(id)) { out.lostIds.push(id); continue; }
    const x = aspect(rows), y = aspect(b.get(id));
    if (x.canonical !== y.canonical) out.canonicalIdChanges.push({ securityId: id, from: x.canonical, to: y.canonical });
    if (x.type !== y.type) out.instrumentTypeChanges.push({ securityId: id, from: x.type, to: y.type });
    if (x.active && !y.active) out.deactivations.push({ securityId: id, ticker: y.ticker });
    if (!x.active && y.active) out.reactivations.push({ securityId: id, ticker: y.ticker });
    if (x.eligible !== y.eligible) out.eligibilityFlips.push({ securityId: id, from: x.eligible, to: y.eligible });
    if (x.ticker !== y.ticker) out.tickerChanges.push({ securityId: id, from: x.ticker, to: y.ticker });
  }
  for (const id of b.keys()) if (!a.has(id)) out.newIds.push(id);
  return out;
}

/** Identität: jede Bestands-securityId folgt core/identity.js; keine canonical_id doppelt. */
export function identityFindings(master) {
  const bad = [], seen = new Map(), dup = [];
  for (const r of master.rows || []) {
    if (r.baseline_member && r.baseline_security_id) {
      let ok = false;
      try { ok = Identity.consistent(r.ticker, r.baseline_security_id); } catch { ok = false; }
      if (!ok) bad.push(r.baseline_security_id);
    }
    if (r.canonical_id) { seen.set(r.canonical_id, (seen.get(r.canonical_id) || 0) + 1); }
  }
  for (const [k, n] of seen) if (n > 1) dup.push(k);
  return { nonCanonicalIds: [...new Set(bad)].sort(), duplicateCanonicalIds: dup.sort() };
}

/** Firmennamen: Universum, Abdeckung, Wechsel je securityId. */
export function compareNames(prev, next) {
  const p = new Map((prev.rows || []).map((r) => [r.securityId, r])), n = new Map((next.rows || []).map((r) => [r.securityId, r]));
  const lost = [...p.keys()].filter((k) => !n.has(k)), added = [...n.keys()].filter((k) => !p.has(k));
  const changes = [];
  for (const [id, r] of n) { const q = p.get(id); if (q && (q.companyName || null) !== (r.companyName || null)) changes.push({ securityId: id, from: q.companyName || null, to: r.companyName || null, source: r.nameSource || null }); }
  const withName = (d) => (d.rows || []).filter((r) => r.inProductUniverse && r.companyName).length;
  const product = (d) => (d.rows || []).filter((r) => r.inProductUniverse).length;
  return { lostIds: lost.sort(), addedIds: added.sort(), nameChanges: changes, withName: { prev: withName(prev), next: withName(next) }, productUniverse: { prev: product(prev), next: product(next) } };
}

const days = (from, to) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(String(from).slice(0, 10) + "T00:00:00Z")) / 864e5;

/**
 * Gesamturteil (rein). inputs: { prevMaster, nextMaster, prevSummary, nextSummary, nextReconciliation, prevNames,
 * nextNames } – fehlende Namen = Namen nicht Teil dieses Laufs.
 */
/**
 * Sonderfreigabe für den einmaligen Klassifiziererwechsel (Owner P1/P3, 28.10.2026): nimmt GENAU die belegten Typ- und
 * Eignungswechsel (securityId, from, to) aus der G7-Zählung. Gebunden an Quell-/Zielversion und den SHA-256 des
 * Ausgangsstamms; nur zusammen mit allowVersionChange. Jeder andere Wechsel zählt weiter gegen die unveränderten Grenzen.
 * Erzeugt von scripts/market/security-master-v130-evidence.mjs.
 */
export const APPROVED_CHANGES_SCHEMA = "security-master-approved-changes-1.0.0";
/**
 * Nachholfreigabe (Schema 1.1.0): die in einem datierten Probelauf gemessene Anbieterdrift seit dem letzten Stand,
 * Liste für Liste vom Owner geprüft (scripts/market/security-master-drift-evidence.mjs). Dieselbe Bindung wie 1.0.0
 * (Versionen, SHA-256 des Ausgangsstamms, nur mit --allow-version-change). Zulässig nur in Richtung „weniger“:
 * Deaktivierungen, Eignung true → false, canonical_id-Wechsel, Typwechsel, gefüllte oder geänderte Firmennamen und
 * genannte neue Doppelungen. Reaktivierungen, neue Eignung, Tickerwechsel, neue oder verlorene IDs sind nie freigebbar.
 */
export const APPROVED_DRIFT_SCHEMA = "security-master-approved-changes-1.1.0";
const PAIR_KINDS = { instrumentTypeChanges: "string", eligibilityFlips: "boolean", canonicalIdChanges: "string" };
const KINDS_BY_SCHEMA = {
  [APPROVED_CHANGES_SCHEMA]: ["instrumentTypeChanges", "eligibilityFlips"],
  [APPROVED_DRIFT_SCHEMA]: ["instrumentTypeChanges", "eligibilityFlips", "canonicalIdChanges", "deactivations", "nameChanges", "newDuplicateCanonicalIds"],
};
const ALL_KINDS = KINDS_BY_SCHEMA[APPROVED_DRIFT_SCHEMA];
const HEADER = ["schema", "purpose", "fromVersion", "toVersion", "prevMasterSha256", "measuredOn", "source", "note"];
const nameKey = (x) => `${x.securityId}|${x.from === null ? "\u2205" : x.from}|${x.to === null ? "\u2205" : x.to}`;
const pairKey = (x) => `${x.securityId}|${x.from}|${x.to}`;

function validEntry(kind, x, schema) {
  if (kind === "newDuplicateCanonicalIds") return typeof x === "string" && x.length > 0;
  if (!x || typeof x.securityId !== "string" || !x.securityId) return false;
  if (kind === "deactivations") return Object.keys(x).every((k) => k === "securityId" || k === "ticker");
  if (kind === "nameChanges") return (x.from === null || typeof x.from === "string") && typeof x.to === "string" && x.from !== x.to;
  const t = PAIR_KINDS[kind];
  if (typeof x.from !== t || typeof x.to !== t || x.from === x.to) return false;
  // Nachholdrift nur in die vorsichtige Richtung: eine Eignung darf entfallen, nie entstehen
  if (kind === "eligibilityFlips" && schema === APPROVED_DRIFT_SCHEMA && !(x.from === true && x.to === false)) return false;
  return true;
}
const entryKey = (kind, x) => kind === "newDuplicateCanonicalIds" ? x : kind === "deactivations" ? x.securityId : kind === "nameChanges" ? nameKey(x) : pairKey(x);

/**
 * Sonderfreigaben (eine oder mehrere Dateien): nehmen GENAU die belegten Wechsel aus der G6/G7/G9-Zählung. Jede Datei
 * ist an Quell-/Zielversion und den SHA-256 des Ausgangsstamms gebunden und gilt nur mit allowVersionChange. Jeder
 * nicht genannte Wechsel zählt weiter gegen die unveränderten Grenzen; nicht genutzte Einträge blockieren nicht.
 */
function applyApproval(cmp, approvedList, ctx, fail) {
  const list = Array.isArray(approvedList) ? approvedList : [approvedList];
  const allow = Object.fromEntries(ALL_KINDS.map((k) => [k, new Map()]));
  for (const [i, approved] of list.entries()) {
    const kinds = approved && KINDS_BY_SCHEMA[approved.schema];
    if (!kinds || !Array.isArray(approved.instrumentTypeChanges) || !Array.isArray(approved.eligibilityFlips)) { fail.push("G10 Sonderfreigabe unlesbar oder falsches Schema"); return null; }
    const extra = Object.keys(approved).filter((k) => !HEADER.includes(k) && !kinds.includes(k));
    if (extra.length) { fail.push(`G10 Sonderfreigabe: nicht freigebbare Art ${extra.join(", ")}`); return null; }
    // Einträge streng: securityId und Typen als Text, Eignung als Wahrheitswert, keine Doppelungen (kein stilles Umdeuten)
    for (const k of kinds) {
      if (approved[k] === undefined) continue;
      if (!Array.isArray(approved[k])) { fail.push(`G10 Sonderfreigabe: ${k} ist keine Liste`); return null; }
      const seen = new Set();
      for (const x of approved[k]) {
        if (!validEntry(k, x, approved.schema)) { fail.push(`G10 Sonderfreigabe: ungültiger Eintrag in ${k}`); return null; }
        const id = k === "newDuplicateCanonicalIds" ? x : x.securityId;
        if (seen.has(id) || [...allow[k].values()].some((v) => v.id === id)) { fail.push(`G10 Sonderfreigabe: doppelte securityId ${id} in ${k}`); return null; }
        seen.add(id);
        allow[k].set(entryKey(k, x), { id, file: i });
      }
    }
    if (approved.fromVersion !== ctx.prevVersion || approved.toVersion !== ctx.nextVersion) fail.push(`G8 Sonderfreigabe gilt für ${approved.fromVersion} → ${approved.toVersion}, nicht für ${ctx.prevVersion} → ${ctx.nextVersion}`);
    if (!ctx.prevMasterSha256 || approved.prevMasterSha256 !== ctx.prevMasterSha256) fail.push("G8 Sonderfreigabe gehört zu einem anderen Ausgangsstamm (SHA-256)");
  }
  if (!ctx.allowVersionChange) fail.push("G8 Sonderfreigabe nur zusammen mit --allow-version-change");
  const present = ALL_KINDS.filter((k) => list.some((a) => a[k] !== undefined));
  const used = Object.fromEntries(present.map((k) => [k, 0])), hit = (k, key) => { const ok = allow[k].has(key); if (ok) used[k]++; return ok; };
  const out = { ...cmp };
  for (const k of ["instrumentTypeChanges", "eligibilityFlips", "canonicalIdChanges", "deactivations"]) {
    if (!present.includes(k)) continue;
    out[k] = cmp[k].filter((x) => !hit(k, k === "deactivations" ? x.securityId : pairKey(x)));
  }
  const unused = () => Object.fromEntries(present.map((k) => [k, allow[k].size - used[k]]));
  return {
    cmp: out,
    keepName: (x) => !(present.includes("nameChanges") && hit("nameChanges", nameKey(x))),
    keepDuplicate: (k) => !(present.includes("newDuplicateCanonicalIds") && hit("newDuplicateCanonicalIds", k)),
    applied: used, unused, files: list.map((a) => ({ schema: a.schema, purpose: a.purpose ?? null, measuredOn: a.measuredOn ?? null })),
  };
}

export function evaluateRefresh(inputs, { today, allowVersionChange = false, thresholds = DEFAULT_THRESHOLDS, approvedChanges = null, prevMasterSha256 = null } = {}) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds }, fail = [], { prevMaster, nextMaster, prevSummary, nextSummary, nextReconciliation } = inputs;
  if (!prevMaster || !nextMaster || !prevSummary || !nextSummary || !nextReconciliation) return { version: GATE_VERSION, pass: false, decision: "BLOCKED", failures: ["G10 Eingaben fehlen"], report: null };
  // Grenzen nur als endliche, nicht negative Zahlen (sonst gingen Vergleiche wie n > "x" still durch)
  const badT = Object.keys(DEFAULT_THRESHOLDS).filter((k) => !(typeof t[k] === "number" && Number.isFinite(t[k]) && t[k] >= 0));
  if (badT.length) return { version: GATE_VERSION, pass: false, decision: "BLOCKED", failures: [`G10 ungültige Grenzen: ${badT.join(", ")}`], report: null };
  if (!Array.isArray(prevMaster.rows) || !Array.isArray(nextMaster.rows) || !(prevMaster.rowsDelivered >= 0)) return { version: GATE_VERSION, pass: false, decision: "BLOCKED", failures: ["G10 Stamm ohne Zeilen oder ohne rowsDelivered"], report: null };
  if (nextSummary.status !== "OK" || nextReconciliation.providerFetch?.status !== "FETCHED") fail.push(`G1 Anbieterliste nicht erhoben (status ${nextSummary.status}, providerFetch ${nextReconciliation.providerFetch?.status})`);
  const h = nextSummary.headline || {}, inv = nextReconciliation.invariants || {};
  if (h.BASELINE_ACCOUNTED_FOR !== h.BASELINE_COUNT || !(h.BASELINE_COUNT > 0)) fail.push(`G2 Bestand nicht vollständig abgeglichen (${h.BASELINE_ACCOUNTED_FOR}/${h.BASELINE_COUNT})`);
  if (inv.destructiveViolations !== 0) fail.push(`G2 destructiveViolations ${inv.destructiveViolations}`);
  const pr = prevSummary.headline?.RAW_US_PROVIDER_CANDIDATES, nr = h.RAW_US_PROVIDER_CANDIDATES;
  if (!(pr > 0) || !(nr > 0) || Math.abs(nr / pr - 1) * 100 > t.maxProviderRowChangePct) fail.push(`G3 Anbieterzeilen ${pr} → ${nr} (Grenze ±${t.maxProviderRowChangePct} %)`);
  if (!(nextMaster.rowsDelivered >= prevMaster.rowsDelivered - t.maxRowsDrop)) fail.push(`G4 ausgelieferte Zeilen ${prevMaster.rowsDelivered} → ${nextMaster.rowsDelivered} (höchstens −${t.maxRowsDrop})`);
  const cmp = compareMasters(prevMaster, nextMaster), idf = identityFindings(nextMaster);
  if (cmp.lostIds.length) fail.push(`G5 ${cmp.lostIds.length} Bestands-securityIds fehlen (z. B. ${cmp.lostIds.slice(0, 5).join(", ")})`);
  if (idf.nonCanonicalIds.length) fail.push(`G5 ${idf.nonCanonicalIds.length} securityIds nicht nach core/identity.js (z. B. ${idf.nonCanonicalIds.slice(0, 5).join(", ")})`);
  // bekannte Doppelungen der Anbieterliste (heute 7, als REVIEW geführt) bleiben sichtbar; neue blockieren
  const approval = approvedChanges ? applyApproval(cmp, approvedChanges, { allowVersionChange, prevVersion: prevMaster.version, nextVersion: nextMaster.version, prevMasterSha256 }, fail) : null;
  const knownDup = new Set(identityFindings(prevMaster).duplicateCanonicalIds), newDup = idf.duplicateCanonicalIds.filter((k) => !knownDup.has(k));
  const countedDup = approval ? newDup.filter(approval.keepDuplicate) : newDup;
  if (countedDup.length) fail.push(`G6 ${countedDup.length} neue doppelte canonical_id (z. B. ${countedDup.slice(0, 5).join(", ")})${approval && countedDup.length < newDup.length ? ", ohne die freigegebenen" : ""}`);
  const lim = [["canonicalIdChanges", "maxCanonicalIdChanges", "canonical_id-Wechsel"], ["instrumentTypeChanges", "maxInstrumentTypeChanges", "Instrumenttyp-Wechsel"], ["deactivations", "maxDeactivations", "aktiv → inaktiv (Delistings)"], ["eligibilityFlips", "maxEligibilityFlips", "Eignungswechsel"], ["tickerChanges", "maxTickerChanges", "Tickerwechsel je securityId"]];
  const counted = approval ? approval.cmp : cmp;
  for (const [k, tk, label] of lim) if (counted[k].length > t[tk]) fail.push(`G7 ${counted[k].length} ${label} (Grenze ${t[tk]}${approval && k in approval.applied ? ", ohne die freigegebenen" : ""})`);
  const versionChanged = prevMaster.version !== nextMaster.version;
  if (versionChanged && !allowVersionChange) fail.push(`G8 Klassifikator-Version ${prevMaster.version} → ${nextMaster.version}: nur mit --allow-version-change nach Vorher/Nachher-Prüfung`);
  let names = null;
  if (inputs.prevNames || inputs.nextNames) {
    if (!inputs.prevNames || !inputs.nextNames) fail.push("G10 Firmennamen nur teilweise vorhanden");
    else {
      names = compareNames(inputs.prevNames, inputs.nextNames);
      if (names.productUniverse.prev !== names.productUniverse.next) fail.push(`G9 Produktuniversum der Namensschicht ${names.productUniverse.prev} → ${names.productUniverse.next}`);
      if (names.lostIds.length) fail.push(`G9 ${names.lostIds.length} securityIds fehlen in den Firmennamen`);
      if (names.withName.next < names.withName.prev - t.maxNamesCoverageDrop) fail.push(`G9 Namensabdeckung ${names.withName.prev} → ${names.withName.next} (höchstens −${t.maxNamesCoverageDrop})`);
      const countedNames = approval ? names.nameChanges.filter(approval.keepName) : names.nameChanges;
      if (countedNames.length > t.maxNameChanges) fail.push(`G9 ${countedNames.length} Namenswechsel (Grenze ${t.maxNameChanges}${approval && "nameChanges" in approval.applied ? ", ohne die freigegebenen" : ""})`);
    }
  }
  const material = cmp.canonicalIdChanges.length + cmp.instrumentTypeChanges.length + cmp.deactivations.length + cmp.reactivations.length + cmp.eligibilityFlips.length + cmp.tickerChanges.length + cmp.newIds.length + (versionChanged ? 1 : 0) + (names ? names.nameChanges.length + names.addedIds.length : 0);
  const ageDays = today ? days(prevMaster.generatedAt, today) : null;
  const pass = fail.length === 0;
  const decision = !pass ? "BLOCKED" : material > 0 ? "COMMIT" : ageDays !== null && ageDays >= t.maxAgeDays ? "COMMIT" : "SKIP_NO_MATERIAL_CHANGE";
  const s = (xs) => xs.slice(0, SAMPLE);
  return {
    version: GATE_VERSION, pass, decision, failures: fail, thresholds: t,
    report: {
      prev: { version: prevMaster.version, generatedAt: prevMaster.generatedAt, rowsDelivered: prevMaster.rowsDelivered, providerRows: pr },
      next: { version: nextMaster.version, generatedAt: nextMaster.generatedAt, rowsDelivered: nextMaster.rowsDelivered, providerRows: nr, newProviderListings: h.NEW_ELIGIBLE_ADDITIONS ?? null, redistribution: nextMaster.redistribution ?? null },
      ageDays, materialChanges: material, versionChanged,
      approval: approval && (() => { const first = [].concat(approvedChanges)[0]; return { fromVersion: first.fromVersion, toVersion: first.toVersion, prevMasterSha256: first.prevMasterSha256, applied: approval.applied, unused: approval.unused(), files: approval.files }; })(),
      counts: Object.fromEntries(Object.entries(cmp).map(([k, v]) => [k, v.length])),
      samples: Object.fromEntries(Object.entries(cmp).map(([k, v]) => [k, s(v)])),
      identity: { nonCanonicalIds: s(idf.nonCanonicalIds), duplicateCanonicalIds: s(idf.duplicateCanonicalIds), newDuplicateCanonicalIds: s(newDup) },
      names: names && { ...names, nameChanges: s(names.nameChanges), lostIds: s(names.lostIds), addedIds: s(names.addedIds), nameChangeCount: names.nameChanges.length },
    },
  };
}

const blocked = (msg) => ({ version: GATE_VERSION, pass: false, decision: "BLOCKED", failures: [msg], report: null });

function main() {
  const argv = process.argv.slice(2), arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const prev = arg("--prev"), next = arg("--next");
  const load = (dir, f) => { const p = dir && join(dir, f); try { return p && existsSync(p) ? readJson(p) : null; } catch { return null; } };
  const loadFile = (p) => { try { return p && existsSync(p) ? readJson(p) : null; } catch { return null; } };
  let thresholds = DEFAULT_THRESHOLDS, res;
  // Sonderfreigabe: Datei unlesbar → G10; der SHA-256 kommt aus den Bytes des Ausgangsstamms, nicht aus der Datei selbst
  // mehrfach zulässig (Klassifiziererwechsel und Nachholdrift); jede Datei wird einzeln gebunden
  const approvalArgs = () => {
    const at = argv.flatMap((a, i) => (a === "--approved-changes" ? [i] : []));
    if (!at.length) return {};
    const files = at.map((i) => { const f = argv[i + 1]; if (!f || f.startsWith("--")) throw new Error("G10 --approved-changes ohne Datei"); return f; });
    const list = files.map((f) => { const a = loadFile(f); if (!a) throw new Error("G10 --approved-changes nicht lesbar"); return a; });
    const pm = prev && join(prev, "us-security-master.json");
    return { approvedChanges: list.length === 1 ? list[0] : list, prevMasterSha256: pm && existsSync(pm) ? createHash("sha256").update(readFileSync(pm)).digest("hex") : null };
  };
  // jeder Ausgang schreibt eine Entscheidung (BLOCKED bei jedem Fehler), auch bei unlesbaren Grenzen oder einer Ausnahme
  try {
  if (arg("--thresholds")) { const t = loadFile(arg("--thresholds")); if (!t || typeof t !== "object") throw new Error("G10 --thresholds nicht lesbar"); thresholds = t; }
  res = evaluateRefresh({
    prevMaster: load(prev, "us-security-master.json"), nextMaster: load(next, "us-security-master.json"),
    prevSummary: load(prev, "summary.json"), nextSummary: load(next, "summary.json"), nextReconciliation: load(next, "reconciliation.json"),
    prevNames: arg("--prev-names") ? loadFile(arg("--prev-names")) ?? undefined : undefined,
    nextNames: arg("--next-names") ? loadFile(arg("--next-names")) ?? undefined : undefined,
  }, { today: arg("--today"), allowVersionChange: argv.includes("--allow-version-change"), thresholds, ...approvalArgs() });
  if (arg("--prev-names") && !res.report?.names && res.pass) { res.pass = false; res.decision = "BLOCKED"; res.failures.push("G10 Firmennamen angegeben, aber nicht lesbar"); }
  } catch (e) { res = blocked(String(e && e.message || e).startsWith("G10") ? String(e.message) : `G10 Ausnahme im Gate: ${e && e.message}`); }
  if (arg("--out")) writeFileSync(arg("--out"), JSON.stringify(res, null, 2) + "\n");
  console.log(`[security-master-gate] ${res.pass ? "PASS" : "BLOCKED"} · Entscheidung ${res.decision}`);
  for (const f of res.failures) console.log(`::error::${f}`);
  if (res.report) console.log(`  Änderungen ${JSON.stringify(res.report.counts)}, fachlich ${res.report.materialChanges}, Alter ${res.report.ageDays} Tage${res.report.names ? `, Namenswechsel ${res.report.names.nameChangeCount}, Abdeckung ${res.report.names.withName.prev} → ${res.report.names.withName.next}` : ""}`);
  if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `decision=${res.decision}\n`, { flag: "a" });
  process.exit(res.pass ? 0 : 4);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
