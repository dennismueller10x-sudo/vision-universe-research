#!/usr/bin/env node
/**
 * Nachweis für den einmaligen Klassifiziererwechsel des US-Wertpapierstamms (Owner P1/P3, 28.10.2026).
 *
 * Isoliert die Wirkung des Klassifizierers: Der committete Stamm (heute 1.1.0) wird mit derselben Anbieterliste
 * (aus seinen eigenen Anbieterzeilen rekonstruiert), demselben Bestand und demselben Zeitstempel mit der aktuellen Engine
 * (quant/engines/us-security-master.js) neu klassifiziert. Kein Abruf, keine Schreibzugriffe außerhalb von --out.
 *
 *   node scripts/market/security-master-v130-evidence.mjs --out <dir> [--master <datei>] [--baseline <datei>]
 *
 * Ausgabe:
 *  - v130-switch-evidence.json   vollständige Listen: Typwechsel, Eignungswechsel, entfallende/neue backtestfähige IDs mit
 *                                Identitätsprüfung (core/identity.js), Langreihe, Discover-Universum und Produkteignung
 *  - v130-switch-lists.md       dieselben Listen als Tabellen (je securityId eine Zeile)
 *  - v130-approved-changes.json  Sonderfreigabe für das Übernahme-Gate: genau diese Typ- und Eignungswechsel, gebunden an
 *                                Quellversion, Zielversion und den SHA-256 des Ausgangsstamms (security-master-refresh-gate.mjs)
 *  - v130-count-reconciliation.json  Zählabgleich je securityId und je Zeile (138 / 149 / zwei verschiedene 127 / frühere 133)
 * Die Vergleichslogik ist die des Gates (compareMasters), die Zählweise also dieselbe.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { compareMasters, baselineIndex } from "./security-master-refresh-gate.mjs";

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Engine = require(join(ROOT, "quant/engines/us-security-master.js"));
const Identity = require(join(ROOT, "core/identity.js"));
export const EVIDENCE_VERSION = "security-master-v130-evidence-1.0.0";
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** Backtestfähig wie im Wochen-Adapter (quant/engines/weekly-real-adapter.cjs): genau eine Zeile, aktiv, geeignet, Stammaktie. */
export function backtestable(master) {
  const out = new Set();
  for (const [id, rows] of baselineIndex(master)) {
    if (rows.length !== 1) continue;
    const r = rows[0];
    if (r.active_status === "ACTIVE" && r.eligible_us_equity === true && r.instrument_type === "EQUITY_COMMON") out.add(id);
  }
  return out;
}

/** Klassifizierer auf unveränderter Anbieterliste, Bestand und Zeitstempel neu anwenden (rein bis auf die Engine). */
export function reclassify(prev, baseline) {
  const providerRows = prev.rows.filter((r) => r.source_provenance === "PROVIDER_SUPPORTED_TICKERS").map((r) => ({
    ticker: r.provider_symbol_id || r.ticker, exchange: r.exchange, assetType: r.asset_type, currency: r.currency,
    startDate: r.start_date, endDate: r.end_date, name: r.security_name,
  }));
  const res = Engine.buildSecurityMaster({ providerRows, baseline, today: prev.today, providerAvailable: true, stamp: prev.generatedAt });
  return { version: Engine.VERSION, generatedAt: prev.generatedAt, rows: res.rows.filter((r) => r.baseline_member), providerRows: providerRows.length };
}

export function buildEvidence({ prevBytes, prev, next, root = ROOT }) {
  const cmp = compareMasters(prev, next), a = backtestable(prev), b = backtestable(next), byNext = baselineIndex(next);
  const universe = new Set(JSON.parse(readFileSync(join(root, "discover/data/stock-index/US_REAL.json"), "utf8")).symbols);
  const elig = new Map((JSON.parse(readFileSync(join(root, "quant/data/market/security-master/eligibility.json"), "utf8")).decisions || []).map((d) => [d.securityId, d.product_eligibility]));
  const describe = (id) => {
    const rows = byNext.get(id) || [], r = rows[0] || {}, series = join(root, "quant/data/market/discover-series-long", `${id}.json`);
    let longSeries = null;
    if (existsSync(series)) { const s = JSON.parse(readFileSync(series, "utf8")); longSeries = { dataMode: s.dataMode, priceSeriesType: s.priceSeriesType, bars: (s.points || []).length, from: s.from ?? null, to: s.to ?? null }; }
    return {
      securityId: id, ticker: r.ticker ?? null, name: r.security_name ?? null, instrumentType: r.instrument_type ?? null,
      eligible: r.eligible_us_equity ?? null, activeStatus: r.active_status ?? null, classificationStatus: r.classification_status ?? null,
      identityConsistent: !!r.ticker && Identity.consistent(r.ticker, id), longSeries,
      inDiscoverUniverse: !!r.ticker && universe.has(r.ticker), productEligibility: elig.get(id) ?? null,
    };
  };
  const lost = [...a].filter((id) => !b.has(id)).sort(), gained = [...b].filter((id) => !a.has(id)).sort();
  const pairs = (xs) => xs.map((x) => `${x.from}->${x.to}`).reduce((m, k) => ((m[k] = (m[k] || 0) + 1), m), {});
  return {
    version: EVIDENCE_VERSION,
    inputs: { masterSha256: sha256(prevBytes), masterVersion: prev.version, masterGeneratedAt: prev.generatedAt, engineVersion: next.version, rules: Engine.CLASSIFICATION_RULE_VERSION ?? null, baselineRows: prev.rows.length },
    counts: {
      rows: { prev: prev.rows.length, next: next.rows.length }, canonicalIdChanges: cmp.canonicalIdChanges.length, lostIds: cmp.lostIds.length, newIds: cmp.newIds.length,
      deactivations: cmp.deactivations.length, reactivations: cmp.reactivations.length, tickerChanges: cmp.tickerChanges.length,
      instrumentTypeChanges: cmp.instrumentTypeChanges.length, eligibilityFlips: cmp.eligibilityFlips.length,
      backtestable: { prev: a.size, next: b.size, lost: lost.length, gained: gained.length },
      lostWithLongSeries: lost.filter((id) => existsSync(join(root, "quant/data/market/discover-series-long", `${id}.json`))).length,
    },
    byTransition: { instrumentType: pairs(cmp.instrumentTypeChanges), eligibility: pairs(cmp.eligibilityFlips) },
    instrumentTypeChanges: cmp.instrumentTypeChanges.map((x) => ({ ...x, ticker: describe(x.securityId).ticker })),
    eligibilityFlips: cmp.eligibilityFlips.map((x) => ({ ...x, ticker: describe(x.securityId).ticker })),
    backtestableLost: lost.map(describe),
    backtestableGained: gained.map(describe),
    // wo die entfallenden IDs heute stehen: eingefrorene Quant-Evidenz (docs/quant-recovery, bleibt unberührt) und Produktinventare
    quantReferences: references(root, lost, ["docs/quant-recovery", "quant/data/product"]),
    unchangedCategories: { canonicalIdChanges: cmp.canonicalIdChanges, deactivations: cmp.deactivations, reactivations: cmp.reactivations, tickerChanges: cmp.tickerChanges, lostIds: cmp.lostIds, newIds: cmp.newIds },
  };
}

function references(root, ids, dirs) {
  const files = [], walk = (d) => { if (!existsSync(join(root, d))) return; for (const e of readdirSync(join(root, d), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p); else if (/\.(json|md|csv|txt)$/.test(e.name)) files.push(p); } };
  dirs.forEach(walk);
  const out = {};
  for (const f of files.sort()) { const t = readFileSync(join(root, f), "utf8"), n = ids.filter((id) => t.includes(`"${id}"`)).length; if (n) out[f] = n; }
  return { scanned: dirs, files: out };
}

/** Tabellen für die Owner-Prüfung; Inhalt = v130-switch-evidence.json. */
export function listsMarkdown(ev) {
  const lost = new Map(ev.backtestableLost.map((x) => [x.securityId, x])), elig = new Map(ev.eligibilityFlips.map((x) => [x.securityId, x]));
  const row = (t) => { const l = lost.get(t.securityId), e = elig.get(t.securityId);
    return `| ${t.ticker ?? "–"} | \`${t.securityId}\` | ${t.from} → ${t.to} | ${e ? `${e.from} → ${e.to}` : "–"} | ${l ? "entfällt" : "– (zwei Zeilen, eine inaktiv: zählt in der Survivorship-Kontrolle)"} | ${l ? (l.identityConsistent ? "ja" : "**nein**") : "–"} | ${l?.longSeries ? `${l.longSeries.bars} (${l.longSeries.from} … ${l.longSeries.to})` : "–"} | ${l?.productEligibility ?? "–"} |`; };
  return [
    `# Klassifiziererwechsel ${ev.inputs.masterVersion} → ${ev.inputs.engineVersion}: vollständige Listen`, "",
    `Erzeugt von \`scripts/market/security-master-v130-evidence.mjs\` (${ev.version}) aus dem committeten Stamm \`${ev.inputs.masterSha256}\` (generatedAt ${ev.inputs.masterGeneratedAt}). Nicht von Hand ändern.`, "",
    `- Typwechsel: ${ev.counts.instrumentTypeChanges} (${Object.entries(ev.byTransition.instrumentType).map(([k, n]) => `${k} ${n}`).join(", ")})`,
    `- Eignungswechsel: ${ev.counts.eligibilityFlips} (${Object.entries(ev.byTransition.eligibility).map(([k, n]) => `${k} ${n}`).join(", ")}), dieselben IDs wie die Typwechsel: ${ev.eligibilityFlips.every((x) => ev.instrumentTypeChanges.some((t) => t.securityId === x.securityId)) ? "ja" : "nein"}`,
    `- backtestfähig: ${ev.counts.backtestable.prev} → ${ev.counts.backtestable.next} (−${ev.counts.backtestable.lost} / +${ev.counts.backtestable.gained}), ${ev.counts.lostWithLongSeries} mit Langreihe`,
    `- unverändert: canonical_id ${ev.counts.canonicalIdChanges}, Deaktivierungen ${ev.counts.deactivations}, Reaktivierungen ${ev.counts.reactivations}, Tickerwechsel ${ev.counts.tickerChanges}, verlorene IDs ${ev.counts.lostIds}, neue IDs ${ev.counts.newIds}`, "",
    "| Ticker | securityId | Instrumenttyp | eligible_us_equity | backtestfähig | Identität (core/identity.js) | Langreihe (Bars) | Produkteignung |", "|---|---|---|---|---|---|---|---|",
    ...ev.instrumentTypeChanges.slice().sort((a, b) => (a.securityId < b.securityId ? -1 : 1)).map(row), "",
  ].join("\n");
}

/**
 * Zählabgleich (Workstream D2, 29.10.2026): was genau zählen 138, 127 und die frühere Angabe 133?
 * Rein: dieselben Eingaben wie buildEvidence (committeter Stamm, rekonstruierte Anbieterliste, Engine), kein Abruf.
 * Zählt dieselben Wechsel einmal je stabiler securityId (Zählweise des Gates, compareMasters) und einmal je Zeile
 * (Paarung über canonical_id, securityId, Ticker, Börse, Anbietersymbol, Aktivstatus).
 */
export const RECONCILIATION_VERSION = "security-master-v130-count-reconciliation-1.0.0";
export function countReconciliation({ prevBytes, prev, next }) {
  const cmp = compareMasters(prev, next), a = baselineIndex(prev), b = baselineIndex(next);
  const key = (r) => [r.canonical_id, r.baseline_security_id, r.ticker, r.exchange, r.provider_symbol_id, r.active_status].join("|");
  const nextRows = new Map(next.rows.map((r) => [key(r), r]));
  const tally = (xs, f) => xs.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
  const prevRows = prev.rows.filter((r) => r.baseline_member && r.baseline_security_id);
  const paired = prevRows.map((r) => [r, nextRows.get(key(r))]), unpaired = paired.filter(([, n]) => !n).length;
  const typeRows = paired.filter(([r, n]) => n && r.instrument_type !== n.instrument_type);
  const eligT2F = paired.filter(([r, n]) => n && r.eligible_us_equity === true && n.eligible_us_equity !== true).length;
  const eligF2T = paired.filter(([r, n]) => n && r.eligible_us_equity !== true && n.eligible_us_equity === true).length;
  const eligibleRows = (m) => m.rows.filter((r) => r.baseline_member && r.eligible_us_equity === true).length;
  const typeIds = new Set(cmp.instrumentTypeChanges.map((x) => x.securityId)), eligIds = new Set(cmp.eligibilityFlips.map((x) => x.securityId));
  const rowsOf = (id) => a.get(id).length;
  const multiRow = [...typeIds].filter((id) => rowsOf(id) > 1).sort();
  const toPreferred = cmp.instrumentTypeChanges.filter((x) => x.to === "PREFERRED").map((x) => x.securityId).sort();
  const pa = backtestable(prev), pb = backtestable(next), lost = [...pa].filter((id) => !pb.has(id)).sort();
  const lostByType = tally(lost, (id) => b.get(id)[0].instrument_type);
  const overlap = toPreferred.filter((id) => lost.includes(id)).length;
  return {
    version: RECONCILIATION_VERSION,
    inputs: { masterSha256: sha256(prevBytes), masterVersion: prev.version, engineVersion: next.version, baselineRows: prevRows.length },
    perSecurityId: {
      meaning: "Zählweise des Gates (compareMasters): je stabiler securityId ein Wechsel, egal wie viele Zeilen sie hat",
      instrumentTypeChanges: cmp.instrumentTypeChanges.length, instrumentTypeByTransition: tally(cmp.instrumentTypeChanges, (x) => `${x.from}->${x.to}`),
      eligibilityFlips: cmp.eligibilityFlips.length, eligibilityByTransition: tally(cmp.eligibilityFlips, (x) => `${x.from}->${x.to}`),
      sameIdsForTypeAndEligibility: typeIds.size === eligIds.size && [...eligIds].every((id) => typeIds.has(id)),
      byRowCount: tally([...typeIds], (id) => `${rowsOf(id)}_ZEILEN`),
    },
    perRow: {
      meaning: "je Zeile des Bestands, gepaart über canonical_id, securityId, Ticker, Börse, Anbietersymbol und Aktivstatus",
      unpairedRows: unpaired, instrumentTypeRowChanges: typeRows.length,
      instrumentTypeRowsByTransition: tally(typeRows, ([r, n]) => `${r.instrument_type}->${n.instrument_type} ${r.active_status} eligible ${r.eligible_us_equity}->${n.eligible_us_equity}`),
      eligibilityRowsTrueToFalse: eligT2F, eligibilityRowsFalseToTrue: eligF2T,
      eligibleRows: { prev: eligibleRows(prev), next: eligibleRows(next), delta: eligibleRows(next) - eligibleRows(prev) },
    },
    twoDifferent127: {
      meaning: "Zwei verschiedene Mengen mit derselben Größe 127; sie sind nicht dieselben IDs",
      equityCommonToPreferredIds: toPreferred.length,
      equityCommonToPreferredIdsByRowCount: tally(toPreferred, (id) => `${rowsOf(id)}_ZEILEN`),
      backtestableLost: lost.length, backtestableLostByNewType: lostByType,
      overlap, onlyPreferredNotLost: toPreferred.length - overlap, onlyLostNotPreferred: lost.length - overlap,
      multiRowIds: multiRow,
    },
    claim133: {
      claim: "„133 Eignungswechsel“ (frühere grobe Zählung; Herleitung im Dokument: 127 eindeutige + 14 mehrdeutige true → false − 4 mehrdeutige false → true)",
      derivationArithmetic: 127 + 14 - 4,
      multiRowEligibilityRowsTrueToFalse: paired.filter(([r, n]) => n && rowsOf(r.baseline_security_id) > 1 && r.eligible_us_equity === true && n.eligible_us_equity !== true).length,
      multiRowEligibilityRowsFalseToTrue: paired.filter(([r, n]) => n && rowsOf(r.baseline_security_id) > 1 && r.eligible_us_equity !== true && n.eligible_us_equity === true).length,
      reproducibleFromCommittedInputs: [cmp.eligibilityFlips.length, eligT2F, eligT2F - eligF2T, Math.abs(eligibleRows(next) - eligibleRows(prev))].includes(133),
    },
  };
}

export function approvedChanges(evidence) {
  return {
    schema: "security-master-approved-changes-1.0.0", purpose: "EINMALIGER_KLASSIFIZIERERWECHSEL (Owner P1/P3, 28.10.2026)",
    fromVersion: evidence.inputs.masterVersion, toVersion: evidence.inputs.engineVersion, prevMasterSha256: evidence.inputs.masterSha256,
    instrumentTypeChanges: evidence.instrumentTypeChanges.map(({ securityId, from, to }) => ({ securityId, from, to })),
    eligibilityFlips: evidence.eligibilityFlips.map(({ securityId, from, to }) => ({ securityId, from, to })),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2), arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const out = arg("--out"); if (!out) { console.error("--out erforderlich"); process.exit(2); }
  const masterPath = arg("--master") || join(ROOT, "quant/data/market/security-master/us-security-master.json");
  const baselinePath = arg("--baseline") || join(ROOT, "quant/data/market/scale/universe-FULL_UNIVERSE.json");
  const prevBytes = readFileSync(masterPath), prev = JSON.parse(prevBytes.toString("utf8"));
  const next = reclassify(prev, JSON.parse(readFileSync(baselinePath, "utf8")).securities);
  const ev = buildEvidence({ prevBytes, prev, next });
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "v130-switch-evidence.json"), JSON.stringify(ev, null, 1) + "\n");
  writeFileSync(join(out, "v130-switch-lists.md"), listsMarkdown(ev));
  writeFileSync(join(out, "v130-approved-changes.json"), JSON.stringify(approvedChanges(ev), null, 1) + "\n");
  writeFileSync(join(out, "v130-count-reconciliation.json"), JSON.stringify(countReconciliation({ prevBytes, prev, next }), null, 1) + "\n");
  console.log(`[v130-evidence] ${ev.inputs.masterVersion} -> ${ev.inputs.engineVersion}: Typ ${ev.counts.instrumentTypeChanges}, Eignung ${ev.counts.eligibilityFlips}, canonical ${ev.counts.canonicalIdChanges}, backtestfähig ${ev.counts.backtestable.prev} -> ${ev.counts.backtestable.next} (−${ev.counts.backtestable.lost}/+${ev.counts.backtestable.gained}, ${ev.counts.lostWithLongSeries} mit Langreihe)`);
}
