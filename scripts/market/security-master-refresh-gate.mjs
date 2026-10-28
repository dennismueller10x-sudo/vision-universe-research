#!/usr/bin/env node
/**
 * Übernahme-Gate der wöchentlichen Aktualisierung von US-Wertpapierstamm und Firmennamen
 * (.github/workflows/security-master-weekly.yml). Erzeugt nichts selbst: es vergleicht den Lauf der bestehenden
 * Erzeuger (scripts/market/build-us-security-master.mjs, scripts/market/build-company-names.mjs) mit dem
 * committeten Stand und entscheidet, ob er übernommen werden darf.
 *
 *   node scripts/market/security-master-refresh-gate.mjs --prev <dir> --next <dir>
 *        [--prev-names <file>] [--next-names <file>] [--today YYYY-MM-DD] [--allow-version-change]
 *        [--thresholds <json-file>] [--out <report.json>]
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
export function evaluateRefresh(inputs, { today, allowVersionChange = false, thresholds = DEFAULT_THRESHOLDS } = {}) {
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
  const knownDup = new Set(identityFindings(prevMaster).duplicateCanonicalIds), newDup = idf.duplicateCanonicalIds.filter((k) => !knownDup.has(k));
  if (newDup.length) fail.push(`G6 ${newDup.length} neue doppelte canonical_id (z. B. ${newDup.slice(0, 5).join(", ")})`);
  const lim = [["canonicalIdChanges", "maxCanonicalIdChanges", "canonical_id-Wechsel"], ["instrumentTypeChanges", "maxInstrumentTypeChanges", "Instrumenttyp-Wechsel"], ["deactivations", "maxDeactivations", "aktiv → inaktiv (Delistings)"], ["eligibilityFlips", "maxEligibilityFlips", "Eignungswechsel"], ["tickerChanges", "maxTickerChanges", "Tickerwechsel je securityId"]];
  for (const [k, tk, label] of lim) if (cmp[k].length > t[tk]) fail.push(`G7 ${cmp[k].length} ${label} (Grenze ${t[tk]})`);
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
      if (names.nameChanges.length > t.maxNameChanges) fail.push(`G9 ${names.nameChanges.length} Namenswechsel (Grenze ${t.maxNameChanges})`);
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
  // jeder Ausgang schreibt eine Entscheidung (BLOCKED bei jedem Fehler), auch bei unlesbaren Grenzen oder einer Ausnahme
  try {
  if (arg("--thresholds")) { const t = loadFile(arg("--thresholds")); if (!t || typeof t !== "object") throw new Error("G10 --thresholds nicht lesbar"); thresholds = t; }
  res = evaluateRefresh({
    prevMaster: load(prev, "us-security-master.json"), nextMaster: load(next, "us-security-master.json"),
    prevSummary: load(prev, "summary.json"), nextSummary: load(next, "summary.json"), nextReconciliation: load(next, "reconciliation.json"),
    prevNames: arg("--prev-names") ? loadFile(arg("--prev-names")) ?? undefined : undefined,
    nextNames: arg("--next-names") ? loadFile(arg("--next-names")) ?? undefined : undefined,
  }, { today: arg("--today"), allowVersionChange: argv.includes("--allow-version-change"), thresholds });
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
