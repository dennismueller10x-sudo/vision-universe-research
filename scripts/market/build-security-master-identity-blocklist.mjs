#!/usr/bin/env node
/**
 * Backtest-Identitätssperre für den Wechsel des US-Wertpapierstamms (Owner-Entscheidung 30.10.2026).
 *
 * Der Stamm folgt ADR-001 (securityId = Ticker). Wechselt der Anbieter unter derselben securityId das Listing, gilt die
 * ID im Stamm weiter; für Backtests wäre das eine Zusammenführung zweier Instrumente über das gleiche Symbol. Diese
 * Sperrliste nennt jede ID, deren Identität der Wechsel nicht belastbar trägt. backtest-generation-freeze.cjs verlangt
 * sie beim Bau und beim Vergleich der neuen Generation; gesperrte IDs gehen in keine neue Generation.
 *
 * Unabhängig von der Freigabeliste des Gates (#1143): Die Sperre gilt auch für Wechsel, die der Stamm übernimmt oder
 * die unter einer Grenze liegen.
 *
 *   node scripts/market/build-security-master-identity-blocklist.mjs --prev <dir> --next <dir> --out <datei>
 *        [--series-dir quant/data/market/discover-series] [--measured-on JJJJ-MM-TT]
 *
 * <prev> = Stamm der eingefrorenen Generation, <next> = tatsächlich committeter (oder Probe-)Stamm. Kein Netzzugriff,
 * schreibt nur --out.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { compareMasters, identityFindings, baselineIndex } from "./security-master-refresh-gate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const BLOCKLIST_SCHEMA = "security-master-identity-blocklist-1.0.0";
export const BLOCKLIST_GENERATOR = "security-master-identity-blocklist-builder-1.0.0";
const sha = (b) => createHash("sha256").update(b).digest("hex");

/** Klasse eines canonical_id-Wechsels (canonical_id = provider:exchange:ticker:startDate, mehrere Zeilen mit „|“). */
export function canonicalClass(from, to) {
  const f = from.split("|"), t = to.split("|");
  if (t.length > f.length) return "NEW_LISTING_SAME_TICKER";
  if (t.length < f.length) return "LISTING_DROPPED";
  const pf = f.map((s) => s.split(":")), pt = t.map((s) => s.split(":"));
  if (pt.some((p) => /^OTC/.test(p[1])) && !pf.some((p) => /^OTC/.test(p[1]))) return "MOVED_TO_OTC";
  const ex = pf.some((p, i) => p[1] !== pt[i][1]), st = pf.some((p, i) => p[3] !== pt[i][3]);
  return ex && st ? "EXCHANGE_AND_START_DATE" : ex ? "EXCHANGE_LABEL" : st ? "START_DATE_REVISION" : "REORDERED";
}

/**
 * Rein. seriesEnd(id) → letzter Tag der eigenen Tagesreihe, null (keine Reihe) oder "UNREADABLE".
 * Gründe, je ID der erste zutreffende in dieser Reihenfolge.
 */
export function buildBlocklist({ prevMaster, nextMaster, seriesEnd, prevMasterSha256, nextMasterSha256, measuredOn = null }) {
  const cmp = compareMasters(prevMaster, nextMaster), B = baselineIndex(nextMaster), block = new Map();
  const add = (id, reason) => { if (id && !block.has(id)) block.set(id, reason); };
  // Delisting laut Anbieter, aber die eigene Reihe läuft weiter oder ist unlesbar (Tickerwiederverwendung, Anbieterkorrektur)
  for (const d of cmp.deactivations) {
    const end = B.get(d.securityId).map((r) => r.end_date).filter(Boolean).sort().at(-1) ?? null, s = seriesEnd(d.securityId);
    if (s === "UNREADABLE") add(d.securityId, "SERIES_UNREADABLE");
    else if (s !== null && (end === null || s > end)) add(d.securityId, "SERIES_CONTINUES_AFTER_PROVIDER_END");
  }
  for (const x of cmp.tickerChanges) add(x.securityId, "TICKER_CHANGED");
  for (const x of cmp.canonicalIdChanges) {
    const c = canonicalClass(x.from, x.to);
    if (c === "NEW_LISTING_SAME_TICKER") add(x.securityId, "TICKER_REUSE_NEW_LISTING");
    else if (c === "LISTING_DROPPED") add(x.securityId, "LISTING_DROPPED");
    else if (c === "START_DATE_REVISION" || c === "EXCHANGE_AND_START_DATE") add(x.securityId, "START_DATE_CHANGED");
  }
  for (const x of cmp.instrumentTypeChanges) if (/ETF/.test(x.to) && !/ETF/.test(x.from)) add(x.securityId, "TICKER_REUSE_ETF");
  const known = new Set(identityFindings(prevMaster).duplicateCanonicalIds);
  for (const k of identityFindings(nextMaster).duplicateCanonicalIds) if (!known.has(k)) for (const r of nextMaster.rows) if (r.canonical_id === k) add(r.baseline_security_id, "PROVIDER_DUPLICATE_ROW");
  return {
    schema: BLOCKLIST_SCHEMA, generator: BLOCKLIST_GENERATOR,
    purpose: "Backtest-Identitätssperre: diese securityIds gehen in keine neue Backtest-Generation (backtest-generation-freeze.cjs --blocklist)",
    measuredOn, prevMasterSha256, nextMasterSha256,
    entries: [...block].sort(([a], [b]) => (a < b ? -1 : 1)).map(([securityId, reason]) => ({ securityId, reason })),
  };
}

function main() {
  const argv = process.argv.slice(2), arg = (k) => { const i = argv.indexOf(k); const v = i >= 0 ? argv[i + 1] : null; return v && !v.startsWith("--") ? v : null; };
  const need = ["--prev", "--next", "--out"].filter((k) => !arg(k));
  if (need.length) { console.error(`[identity-blocklist] fehlt: ${need.join(", ")}`); process.exit(2); }
  const seriesDir = arg("--series-dir") || join(ROOT, "quant/data/market/discover-series");
  // ohne Reihenverzeichnis wäre jedes Delisting „ohne Reihe“ und keines gesperrt (fail closed)
  if (!existsSync(join(seriesDir, "index.json"))) { console.error(`[identity-blocklist] Reihenverzeichnis ohne index.json: ${seriesDir}`); process.exit(2); }
  const end = (id) => {
    const p = join(seriesDir, `${id}.json`);
    if (!existsSync(p)) return null;
    try { const s = JSON.parse(readFileSync(p, "utf8")); return typeof s.to === "string" && /^\d{4}-\d{2}-\d{2}/.test(s.to) ? s.to.slice(0, 10) : "UNREADABLE"; } catch { return "UNREADABLE"; }
  };
  const pb = readFileSync(join(arg("--prev"), "us-security-master.json")), nb = readFileSync(join(arg("--next"), "us-security-master.json"));
  const out = buildBlocklist({ prevMaster: JSON.parse(pb), nextMaster: JSON.parse(nb), seriesEnd: end, prevMasterSha256: sha(pb), nextMasterSha256: sha(nb), measuredOn: arg("--measured-on") });
  writeFileSync(arg("--out"), JSON.stringify(out, null, 1) + "\n");
  const c = out.entries.reduce((m, e) => ((m[e.reason] = (m[e.reason] || 0) + 1), m), {});
  console.log(`[identity-blocklist] ${out.entries.length} gesperrt ${JSON.stringify(c)}; alt ${out.prevMasterSha256.slice(0, 12)}…, neu ${out.nextMasterSha256.slice(0, 12)}…`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
