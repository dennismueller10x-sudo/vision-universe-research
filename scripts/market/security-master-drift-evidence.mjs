#!/usr/bin/env node
/**
 * Nachholdrift des US-Wertpapierstamms vor dem einmaligen Klassifiziererwechsel 1.1.0 → 1.3.0.
 *
 * Der committete Stamm stammt vom 11.09.2026. Ein Lauf des Workflows security-master-weekly.yml bringt deshalb neben
 * dem Wechsel (138 Typ- und 138 Eignungswechsel, v130-approved-changes.json) die gesamte Anbieterdrift seit diesem
 * Tag mit. Dieses Werkzeug misst sie aus einem Probelauf derselben Erzeuger, ordnet jeden Wechsel einer Klasse zu und
 * schreibt eine Freigabedatei (Schema 1.1.0) nur für die vorsichtige Richtung. Was einen Identitätsbefund trägt, bleibt
 * draußen und zählt im Lauf weiter gegen die unveränderten Grenzen.
 *
 *   node scripts/market/security-master-drift-evidence.mjs --prev <dir> --next <dir> --prev-names <file>
 *        --next-names <file> --measured-on YYYY-MM-DD --out <dir> [--include-duplicates]
 *        [--v130 docs/data/security-master/v130-approved-changes.json] [--series-dir quant/data/market/discover-series]
 *
 * <prev> = committeter Stand (git show HEAD:…), <next> = Probelauf von build-us-security-master.mjs --require-provider
 * mit --out. Kein Netzzugriff, schreibt nur nach --out. Ausgaben:
 *   drift-approved-changes.json   Freigabedatei für das Gate (--approved-changes, zusätzlich zur v130-Datei)
 *   drift-evidence.json           alle Wechsel mit Klasse, Begründung und erwartetem Gate-Ergebnis
 *   drift-lists.md                dieselben Listen zum Lesen
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { compareMasters, compareNames, identityFindings, baselineIndex, evaluateRefresh, APPROVED_DRIFT_SCHEMA } from "./security-master-refresh-gate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DRIFT_EVIDENCE_VERSION = "security-master-drift-evidence-1.0.0";
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
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

/** Letzter Kurstag der öffentlichen Tagesreihe (Produktuniversum) oder null. */
function seriesEnd(seriesDir, id) {
  const p = join(seriesDir, `${id}.json`);
  if (!existsSync(p)) return null;
  const s = readJson(p);
  return typeof s.to === "string" ? s.to.slice(0, 10) : null;
}

/**
 * Rein: Probelauf gegen committeten Stand. reviewIds sind Titel mit Identitätsbefund; sie gehen in keine Freigabe.
 */
export function buildDriftEvidence({ prevMaster, nextMaster, prevNames, nextNames, v130, seriesEnd: endOf, measuredOn, prevMasterSha256, nextMasterSha256, includeDuplicates = false }) {
  const cmp = compareMasters(prevMaster, nextMaster), B = baselineIndex(nextMaster);
  const v130Type = new Set(v130.instrumentTypeChanges.map((x) => `${x.securityId}|${x.from}|${x.to}`));
  const v130Elig = new Set(v130.eligibilityFlips.map((x) => `${x.securityId}|${x.from}|${x.to}`));
  const key = (x) => `${x.securityId}|${x.from}|${x.to}`;

  // Delistings: Anbieter-endDate gegen unsere eigene Tagesreihe. Läuft die Reihe nach dem Ende weiter (Tickerwiederverwendung,
  // Anbieterkorrektur alter Listings), ist das ein Identitätsbefund und keine Drift.
  const deactivations = cmp.deactivations.map((x) => {
    const rows = B.get(x.securityId), end = rows.map((r) => r.end_date).filter(Boolean).sort().at(-1) ?? null, s = endOf(x.securityId);
    const cls = s === null ? "NO_PRODUCT_SERIES" : end !== null && s <= end ? "SERIES_ENDS_WITH_PROVIDER" : "SERIES_CONTINUES_AFTER_PROVIDER_END";
    return { securityId: x.securityId, ticker: x.ticker, providerEndDate: end, seriesEnd: s, class: cls };
  });
  const reviewIds = new Set(deactivations.filter((d) => d.class === "SERIES_CONTINUES_AFTER_PROVIDER_END").map((d) => d.securityId));

  const canonicalIdChanges = cmp.canonicalIdChanges.map((x) => ({ ...x, class: canonicalClass(x.from, x.to) }));
  const instrumentTypeChanges = cmp.instrumentTypeChanges.filter((x) => !v130Type.has(key(x))).map((x) => ({ ...x, class: /ETF/.test(x.to) ? "ETF_LISTING_SAME_TICKER" : "OTHER" }));
  const eligibilityFlips = cmp.eligibilityFlips.filter((x) => !v130Elig.has(key(x))).map((x) => ({
    ...x,
    class: x.from === true && x.to === false
      ? (cmp.deactivations.some((d) => d.securityId === x.securityId) ? "LOST_BY_DEACTIVATION" : cmp.canonicalIdChanges.some((d) => d.securityId === x.securityId) ? "LOST_BY_AMBIGUOUS_LISTING" : "LOST_OTHER")
      : "GAINED",
  }));
  const knownDup = new Set(identityFindings(prevMaster).duplicateCanonicalIds);
  const newDuplicateCanonicalIds = identityFindings(nextMaster).duplicateCanonicalIds.filter((k) => !knownDup.has(k)).map((k) => ({
    canonicalId: k, rows: nextMaster.rows.filter((r) => r.canonical_id === k).map((r) => ({ securityId: r.baseline_security_id ?? null, active_status: r.active_status, end_date: r.end_date })),
  }));
  const names = compareNames(prevNames, nextNames), prevSource = new Map((prevNames.rows || []).map((r) => [r.securityId, r.nameSource || null]));
  const nameChanges = names.nameChanges.map((x) => ({
    ...x, prevSource: prevSource.get(x.securityId) ?? null,
    class: x.from === null ? "NAME_GAP_FILLED" : x.source === "TIINGO_METADATA" ? "SWITCH_TO_TIINGO_METADATA" : prevSource.get(x.securityId) === "VU_CURATED" ? "CURATED_NAME_REPLACED" : x.source === "SEC_COMPANY_TICKERS" ? "SEC_NAME" : "OTHER_SOURCE",
  }));
  const reactivations = cmp.reactivations, tickerChanges = cmp.tickerChanges, lostIds = cmp.lostIds, newIds = cmp.newIds;

  // Freigabe nur für die vorsichtige Richtung und ohne Identitätsbefund. Namen: Lücken aus SEC gefüllt oder SEC-Name
  // statt eines anderen (P5); ein Wechsel hin zu Tiingo-Metadaten oder weg von einem kuratierten Namen bleibt draußen.
  const ok = (x) => !reviewIds.has(x.securityId);
  const approved = {
    schema: APPROVED_DRIFT_SCHEMA,
    purpose: `EINMALIGE_NACHHOLDRIFT seit ${String(prevMaster.generatedAt).slice(0, 10)} vor dem Wechsel 1.1.0 → 1.3.0 (gemessen ${measuredOn})`,
    fromVersion: prevMaster.version, toVersion: nextMaster.version, prevMasterSha256, measuredOn,
    source: { probeMasterSha256: nextMasterSha256, providerRows: nextMaster.counts?.providerRows ?? null, generator: DRIFT_EVIDENCE_VERSION },
    instrumentTypeChanges: instrumentTypeChanges.filter(ok).map(({ securityId, from, to }) => ({ securityId, from, to })),
    eligibilityFlips: eligibilityFlips.filter((x) => ok(x) && x.class !== "GAINED").map(({ securityId, from, to }) => ({ securityId, from, to })),
    canonicalIdChanges: canonicalIdChanges.filter(ok).map(({ securityId, from, to }) => ({ securityId, from, to })),
    deactivations: deactivations.filter((d) => d.class !== "SERIES_CONTINUES_AFTER_PROVIDER_END").map(({ securityId }) => ({ securityId })),
    nameChanges: nameChanges.filter((x) => x.class === "NAME_GAP_FILLED" || x.class === "SEC_NAME").map(({ securityId, from, to }) => ({ securityId, from, to })),
    newDuplicateCanonicalIds: includeDuplicates ? newDuplicateCanonicalIds.map((d) => d.canonicalId) : [],
  };
  const count = (xs) => xs.reduce((m, x) => ((m[x.class] = (m[x.class] || 0) + 1), m), {});
  return {
    evidence: {
      version: DRIFT_EVIDENCE_VERSION, measuredOn,
      prev: { version: prevMaster.version, generatedAt: prevMaster.generatedAt, sha256: prevMasterSha256 },
      probe: { version: nextMaster.version, generatedAt: nextMaster.generatedAt, sha256: nextMasterSha256 },
      counts: {
        canonicalIdChanges: count(canonicalIdChanges), deactivations: count(deactivations), eligibilityFlipsBeyondV130: count(eligibilityFlips),
        instrumentTypeChangesBeyondV130: count(instrumentTypeChanges), nameChanges: count(nameChanges), newDuplicateCanonicalIds: newDuplicateCanonicalIds.length,
        reactivations: reactivations.length, tickerChanges: tickerChanges.length, lostIds: lostIds.length, newIds: newIds.length,
      },
      identityReview: [...reviewIds].sort(),
      lists: { canonicalIdChanges, deactivations, eligibilityFlips, instrumentTypeChanges, nameChanges, newDuplicateCanonicalIds, reactivations, tickerChanges, lostIds, newIds },
    },
    approved,
  };
}

export function driftListsMarkdown(ev, gate) {
  const L = ev.lists, row = (...c) => `| ${c.map((x) => String(x ?? "–").replace(/\|/g, " / ")).join(" | ")} |`;
  const out = [
    `# Security Master – Nachholdrift seit ${String(ev.prev.generatedAt).slice(0, 10)} (gemessen ${ev.measuredOn})`, "",
    `Erzeugt von \`scripts/market/security-master-drift-evidence.mjs\` (${ev.version}). Ausgangsstamm \`${ev.prev.sha256}\` (${ev.prev.version}), Probelauf \`${ev.probe.sha256}\` (${ev.probe.version}). Nicht von Hand ändern.`, "",
    "## Erwartetes Gate-Ergebnis im Probelauf", "",
    row("Freigaben", "Ergebnis", "Blockiert durch"), row("---", "---", "---"),
    ...gate.map((g) => row(g.label, g.pass ? "PASS" : "BLOCKED", g.failures.join("; ") || "–")), "",
    `Identitätsbefunde (in keiner Freigabe, zählen gegen die Grenzen): ${ev.identityReview.length ? ev.identityReview.join(", ") : "keine"}`, "",
    "## Zählung je Klasse", "", "```json", JSON.stringify(ev.counts, null, 2), "```", "",
    `## Delistings (${L.deactivations.length})`, "", row("securityId", "Ticker", "Anbieter-Ende", "Ende eigene Reihe", "Klasse"), row("---", "---", "---", "---", "---"),
    ...L.deactivations.map((d) => row(d.securityId, d.ticker, d.providerEndDate, d.seriesEnd, d.class)), "",
    `## canonical_id-Wechsel (${L.canonicalIdChanges.length})`, "", row("securityId", "vorher", "nachher", "Klasse"), row("---", "---", "---", "---"),
    ...L.canonicalIdChanges.map((x) => row(x.securityId, x.from, x.to, x.class)), "",
    `## Eignungswechsel über v130 hinaus (${L.eligibilityFlips.length})`, "", row("securityId", "vorher", "nachher", "Klasse"), row("---", "---", "---", "---"),
    ...L.eligibilityFlips.map((x) => row(x.securityId, x.from, x.to, x.class)), "",
    `## Instrumenttyp-Wechsel über v130 hinaus (${L.instrumentTypeChanges.length})`, "", row("securityId", "vorher", "nachher", "Klasse"), row("---", "---", "---", "---"),
    ...L.instrumentTypeChanges.map((x) => row(x.securityId, x.from, x.to, x.class)), "",
    `## Neue doppelte canonical_id (${L.newDuplicateCanonicalIds.length})`, "",
    ...L.newDuplicateCanonicalIds.map((d) => `- \`${d.canonicalId}\`: ${d.rows.map((r) => `${r.securityId} ${r.active_status} bis ${r.end_date}`).join("; ")}`), "",
    `## Namenswechsel (${L.nameChanges.length})`, "", row("securityId", "vorher", "nachher", "Quelle vorher → nachher", "Klasse"), row("---", "---", "---", "---", "---"),
    ...L.nameChanges.filter((x) => x.class !== "NAME_GAP_FILLED").map((x) => row(x.securityId, x.from, x.to, `${x.prevSource} → ${x.source}`, x.class)),
    `| … ${L.nameChanges.filter((x) => x.class === "NAME_GAP_FILLED").length} gefüllte Namenslücken (vorher ohne Namen) | | | | NAME_GAP_FILLED |`, "",
  ];
  return out.join("\n");
}

function main() {
  const argv = process.argv.slice(2), arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const need = ["--prev", "--next", "--prev-names", "--next-names", "--measured-on", "--out"].filter((k) => !arg(k));
  if (need.length) { console.error(`[drift-evidence] fehlt: ${need.join(", ")}`); process.exit(2); }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(arg("--measured-on"))) { console.error("[drift-evidence] --measured-on JJJJ-MM-TT"); process.exit(2); }
  const out = arg("--out"), seriesDir = arg("--series-dir") || join(ROOT, "quant/data/market/discover-series");
  const v130Path = arg("--v130") || join(ROOT, "docs/data/security-master/v130-approved-changes.json");
  const prevBytes = readFileSync(join(arg("--prev"), "us-security-master.json")), nextBytes = readFileSync(join(arg("--next"), "us-security-master.json"));
  const v130 = readJson(v130Path);
  const { evidence, approved } = buildDriftEvidence({
    prevMaster: JSON.parse(prevBytes), nextMaster: JSON.parse(nextBytes), prevNames: readJson(arg("--prev-names")), nextNames: readJson(arg("--next-names")),
    v130, seriesEnd: (id) => seriesEnd(seriesDir, id), measuredOn: arg("--measured-on"), prevMasterSha256: sha(prevBytes), nextMasterSha256: sha(nextBytes),
    includeDuplicates: argv.includes("--include-duplicates"),
  });
  // erwartetes Gate-Ergebnis mit genau den Eingaben des Probelaufs
  const inputs = {
    prevMaster: JSON.parse(prevBytes), nextMaster: JSON.parse(nextBytes), prevSummary: readJson(join(arg("--prev"), "summary.json")),
    nextSummary: readJson(join(arg("--next"), "summary.json")), nextReconciliation: readJson(join(arg("--next"), "reconciliation.json")),
    prevNames: readJson(arg("--prev-names")), nextNames: readJson(arg("--next-names")),
  };
  const run = (label, approvedChanges) => ({ label, ...evaluateRefresh(inputs, { today: arg("--measured-on"), allowVersionChange: true, approvedChanges, prevMasterSha256: sha(prevBytes) }) });
  const gate = [run("nur v130", v130), run("v130 + Nachholdrift", [v130, approved])].map(({ label, pass, decision, failures }) => ({ label, pass, decision, failures }));
  evidence.expectedGate = gate;
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "drift-approved-changes.json"), JSON.stringify(approved, null, 1) + "\n");
  writeFileSync(join(out, "drift-evidence.json"), JSON.stringify(evidence, null, 1) + "\n");
  writeFileSync(join(out, "drift-lists.md"), driftListsMarkdown(evidence, gate) + "\n");
  for (const g of gate) console.log(`[drift-evidence] ${g.label}: ${g.pass ? "PASS" : "BLOCKED"} ${g.failures.join(" | ")}`);
  console.log(`[drift-evidence] Identitätsbefunde: ${evidence.identityReview.length}; Freigabe: ${Object.entries(approved).filter(([, v]) => Array.isArray(v)).map(([k, v]) => `${k} ${v.length}`).join(", ")}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
