#!/usr/bin/env node
/**
 * Security Master 1.1.0 → 1.3.0: Prüfungen am Lauftag (nur lesend, kein Netz, schreibt nur nach --out).
 *
 * Drei Teile, einzeln oder zusammen aufrufbar:
 *
 *   --deadline [--today YYYY-MM-DD] [--root <dir>]
 *       Frist der SF8-Eingangsprüfung für Stamm und Firmennamen. Rechnet mit DERSELBEN Funktion wie der
 *       Kandidaten-Tageslauf (scripts/supertrader/source-faithful/product/input-gate.mjs#staleAuxiliary,
 *       AUX_MAX_AGE_DAYS), keine eigene Ableitung. Ausgabe je Quelle: generatedAt, Höchstalter, letzter
 *       zulässiger Lauftag (UTC), erster STALE-Lauftag.
 *
 *   --compare <probe/us-security-master.json> <produktiv/us-security-master.json>
 *       Bedingung der Freigabe: Der Folgestand des produktiven Laufs ist bytegleich mit dem des Probelaufs
 *       desselben Tages. Bei Abweichung: welche Zeilen (canonical_id|ticker) und welche Kopffelder.
 *
 *   --gate-report <sm-gate.json>
 *       Gate PASS · COMMIT, Versionssprung 1.1.0 → 1.3.0, kein ungenutzter Listeneintrag, jede gezählte
 *       Kategorie unter ihrer (unveränderten) Grenze.
 *
 * Exit 0 = alle angeforderten Prüfungen bestanden, 1 = mindestens eine nicht bestanden, 2 = Aufruffehler.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { AUX_MAX_AGE_DAYS, staleAuxiliary } from "../supertrader/source-faithful/product/input-gate.mjs";
import { DEFAULT_THRESHOLDS } from "./security-master-refresh-gate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PREFLIGHT_VERSION = "security-master-switch-preflight-1.0.0";
const FROM = "us-security-master-1.1.0", TO = "us-security-master-1.3.0";
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** Letzter zulässiger und erster STALE-Lauftag je Quelle, ermittelt mit staleAuxiliary selbst (kein Nachrechnen). */
export function deadlines({ root = ROOT, today, sources = ["master", "names"] } = {}) {
  const out = {};
  for (const key of sources) {
    const staleOn = (d) => staleAuxiliary(root, d).some((x) => x.source === key);
    // generatedAt so lesen, wie die Eingangsprüfung es liest: an einem fernen Tag meldet staleAuxiliary jede Quelle
    const far = staleAuxiliary(root, addDays(today, 3650)).find((x) => x.source === key);
    const generatedAt = far ? far.generatedAt : null;
    if (!generatedAt) { out[key] = { maxDays: AUX_MAX_AGE_DAYS[key], generatedAt: null, status: "OHNE_DATUM" }; continue; }
    let d = String(generatedAt).slice(0, 10), guard = 0;
    while (!staleOn(d) && guard++ < 4000) d = addDays(d, 1);
    out[key] = { maxDays: AUX_MAX_AGE_DAYS[key], generatedAt, lastCurrentRunDay: addDays(d, -1), firstStaleRunDay: d,
                 statusToday: staleOn(today) ? "STALE" : "CURRENT", daysLeftIncludingToday: Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5) };
  }
  return out;
}

/** Bytegleichheit zweier Folgestände; bei Abweichung die betroffenen Zeilen und Kopffelder. */
export function compareFollowStates(probeBytes, prodBytes) {
  const sha = (b) => createHash("sha256").update(b).digest("hex");
  const res = { probeSha256: sha(probeBytes), productiveSha256: sha(prodBytes) };
  res.byteEqual = res.probeSha256 === res.productiveSha256;
  if (res.byteEqual) return { ...res, rowsOnlyProbe: [], rowsOnlyProductive: [], rowsChanged: [], headerFields: [] };
  const A = JSON.parse(probeBytes.toString("utf8")), B = JSON.parse(prodBytes.toString("utf8"));
  const key = (r) => `${r.canonical_id}|${r.ticker}`;
  const ma = new Map((A.rows || []).map((r) => [key(r), JSON.stringify(r)])), mb = new Map((B.rows || []).map((r) => [key(r), JSON.stringify(r)]));
  const { rows: _a, ...ha } = A, { rows: _b, ...hb } = B;
  return { ...res,
    rowsOnlyProbe: [...ma.keys()].filter((k) => !mb.has(k)),
    rowsOnlyProductive: [...mb.keys()].filter((k) => !ma.has(k)),
    rowsChanged: [...ma.keys()].filter((k) => mb.has(k) && mb.get(k) !== ma.get(k)),
    headerFields: [...new Set([...Object.keys(ha), ...Object.keys(hb)])].filter((k) => JSON.stringify(ha[k]) !== JSON.stringify(hb[k])) };
}

/** Prüfung des Gate-Berichts gegen die Freigabebedingungen (Grenzen aus dem Gate selbst, nicht kopiert). */
export function checkGateReport(r, thresholds = DEFAULT_THRESHOLDS) {
  const fails = [];
  if (!r || r.pass !== true || r.decision !== "COMMIT") fails.push(`Gate nicht PASS · COMMIT (${r && r.pass} · ${r && r.decision})`);
  const rep = (r && r.report) || {}, a = rep.approval || null;
  if (!rep.prev || rep.prev.version !== FROM) fails.push(`Ausgangsstand nicht ${FROM}`);
  if (!rep.next || rep.next.version !== TO) fails.push(`Folgestand nicht ${TO}`);
  if (!a) fails.push("Gate ohne Sonderfreigabe (approved_changes nicht gesetzt?)");
  else {
    for (const [k, n] of Object.entries(a.unused || {})) if (n !== 0) fails.push(`ungenutzte Listeneinträge ${k}: ${n}`);
    const lim = { canonicalIdChanges: "maxCanonicalIdChanges", instrumentTypeChanges: "maxInstrumentTypeChanges", deactivations: "maxDeactivations", eligibilityFlips: "maxEligibilityFlips", tickerChanges: "maxTickerChanges", nameChanges: "maxNameChanges" };
    for (const [k, t] of Object.entries(lim)) { const n = (a.counted || {})[k]; if (Number.isFinite(n) && Number.isFinite(thresholds[t]) && n > thresholds[t]) fails.push(`${k} ${n} > ${thresholds[t]}`); }
    if (((a.counted || {}).newDuplicateCanonicalIds || 0) > 0) fails.push("neue doppelte canonical_id");
  }
  const headroom = a && a.counted ? { canonicalIdChanges: `${a.counted.canonicalIdChanges}/${thresholds.maxCanonicalIdChanges}`, deactivations: `${a.counted.deactivations}/${thresholds.maxDeactivations}`, eligibilityFlips: `${a.counted.eligibilityFlips}/${thresholds.maxEligibilityFlips}`, instrumentTypeChanges: `${a.counted.instrumentTypeChanges}/${thresholds.maxInstrumentTypeChanges}`, nameChanges: `${a.counted.nameChanges}/${thresholds.maxNameChanges}` } : null;
  return { ok: fails.length === 0, failures: fails, headroom, applied: a && a.applied, unused: a && a.unused };
}

function insideCommittedTree(p) { const r = relative(ROOT, resolve(p)); return !r.startsWith("..") && !isAbsolute(r); }

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const argv = process.argv.slice(2), has = (k) => argv.includes(k), arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const today = arg("--today") || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) { console.error("--today YYYY-MM-DD"); process.exit(2); }
  const out = arg("--out");
  if (out && insideCommittedTree(out)) { console.error("REFUSED_OUT_INSIDE_COMMITTED_TREE"); process.exit(2); }
  if (!has("--deadline") && !has("--compare") && !has("--gate-report")) { console.error("--deadline | --compare <probe> <prod> | --gate-report <json>"); process.exit(2); }
  const res = { version: PREFLIGHT_VERSION, today }; let ok = true;
  if (has("--deadline")) {
    res.deadlines = deadlines({ root: arg("--root") || ROOT, today });
    for (const [k, v] of Object.entries(res.deadlines)) console.log(`[frist] ${k}: generatedAt ${v.generatedAt}, max. ${v.maxDays} Tage → letzter CURRENT-Lauftag ${v.lastCurrentRunDay}, STALE ab ${v.firstStaleRunDay} (heute ${v.statusToday})`);
  }
  if (has("--compare")) {
    const i = argv.indexOf("--compare"), a = argv[i + 1], b = argv[i + 2];
    if (!a || !b) { console.error("--compare <probe> <prod>"); process.exit(2); }
    res.compare = compareFollowStates(readFileSync(a), readFileSync(b));
    ok = ok && res.compare.byteEqual;
    console.log(`[vergleich] ${res.compare.byteEqual ? "bytegleich" : "ABWEICHUNG"} ${res.compare.probeSha256.slice(0, 16)} / ${res.compare.productiveSha256.slice(0, 16)}`
      + (res.compare.byteEqual ? "" : ` · Zeilen nur Probe ${res.compare.rowsOnlyProbe.length}, nur produktiv ${res.compare.rowsOnlyProductive.length}, geändert ${res.compare.rowsChanged.length}, Kopf ${res.compare.headerFields.join(",")}`));
  }
  if (has("--gate-report")) {
    res.gate = checkGateReport(JSON.parse(readFileSync(arg("--gate-report"), "utf8")));
    ok = ok && res.gate.ok;
    console.log(`[gate] ${res.gate.ok ? "erfüllt" : "NICHT erfüllt"} · Spielraum ${JSON.stringify(res.gate.headroom)}${res.gate.failures.length ? " · " + res.gate.failures.join("; ") : ""}`);
  }
  res.ok = ok;
  if (out) writeFileSync(out, JSON.stringify(res, null, 2) + "\n");
  process.exit(ok ? 0 : 1);
}
