#!/usr/bin/env node
/**
 * Supertrader 9 – Veröffentlichungsvertrag des automatischen Tageslaufs (sf8-auto-publication-1.0.0).
 *
 * Ersetzt im Normalbetrieb die manuelle Freigabe des Fingerabdrucks (docs/SUPERTRADER_8_FIRST_RELEASE.md, Lauf A/B)
 * durch eine technische Prüfung. Der Workflow ruft ihn NACH Eingangsprüfung, Produkttests, Budget und DQ-SF8-1..8 auf.
 * Er entscheidet nur, ob das geprüfte Ergebnis ohne Mensch committet werden darf:
 *
 *   PUBLISH            alles erfüllt, neuere Sitzung als der veröffentlichte Stand
 *   SKIP_SAME_SESSION  dieselbe Sitzung ist schon veröffentlicht (idempotent, kein Commit, kein Fehler)
 *   BLOCKED            mindestens ein Vertragspunkt verletzt: kein Commit, roter Lauf, Alarm.
 *                      Der veröffentlichte Stand bleibt unverändert; ein Mensch kann ihn nur über den manuellen
 *                      Weg (commit=true + expected_sha256) ersetzen.
 *
 * Vertragspunkte (alle fail closed):
 *   C1 reproduzierbar     zwei unabhängige Läufe derselben Eingaben ergeben denselben Fingerabdruck
 *   C2 vollständige DQ    DQ-SF8-1..8 im Bericht, jede PASS mit checked > 0
 *   C3 Forschungsstatus   LIVE_NOT_APPROVED / DIAGNOSTIC_NOT_CERTIFIED / LOCKED_FOR_ALL_13 / NONE; 0 VALIDATED_TRADE_SIGNAL;
 *                         alle 13 Methoden LIVE_NOT_APPROVED; dieselben 13 Methoden wie im veröffentlichten Stand
 *   C4 gleiche Fachmodelle Versionen (Pipeline, Adapter, DQ, Detektoren, Vertrag samt SHA-256, Kriterien) wie im
 *                         veröffentlichten Stand. Nach einer Modelländerung ist die erste Veröffentlichung manuell.
 *   C5 Zeitachse          neuer Stand nie älter als der veröffentlichte; gleiche Sitzung = SKIP; nextSession > asOf
 *   C6 Plausibilität      Kandidaten 50–200 % des veröffentlichten Stands, Titel mit Daten mindestens 90 %,
 *                         keine verworfenen Eingaben oder Datensätze
 *   C7 Freigabe           Registry-Eintrag im Dauerbetrieb, also ohne `activation` (vom Workflow geprüft und übergeben;
 *                         ACTIVATING gilt nur für den manuellen Weg)
 *
 * Rein bis auf die CLI. Kein Netzzugriff. Schreibt nur --out.
 *   node publication-contract.mjs --next <dir> --prev <dir> --fingerprint <sha> --rebuild-fingerprint <sha>
 *        --dq <report.json> --registry-ok true|false [--code-commit <sha>] [--run <id>] --out <record.json>
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const PUBLICATION_CONTRACT = 'sf8-auto-publication-1.0.0';
/** Grenzen der Plausibilität: Datenbetrieb, keine Fachregel. Ein Verstoß verlangt den manuellen Weg, er ändert nichts. */
export const PLAUSIBILITY = Object.freeze({ minCandidateRatio: 0.5, maxCandidateRatio: 2.0, minSecuritiesRatio: 0.9 });
export const STATUS_INVARIANT = Object.freeze({ liveReadiness: 'LIVE_NOT_APPROVED', certification: 'DIAGNOSTIC_NOT_CERTIFIED', validatedTradeSignal: 'LOCKED_FOR_ALL_13', orders: 'NONE' });
export const STRATEGY_COUNT = 13;
const DQ_RULES = Array.from({ length: 8 }, (_, i) => `DQ-SF8-${i + 1}`);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const SHA = /^[0-9a-f]{64}$/;

/** Fingerabdruck der Eingaben, wie ihn der Erzeuger in summary.inputs.inputsSha256 schreibt (je Titel die Eingaben). */
export const inputsSha256 = (summary) => (SHA.test(String(summary?.inputs?.inputsSha256)) ? summary.inputs.inputsSha256 : null);
/** Zusätzlich: SHA-256 der Liste der Quelldateien samt ihrer SHA-256 (summary.inputs.sourceFiles). */
export const sourceFilesSha256 = (summary) => createHash('sha256').update(JSON.stringify(summary?.inputs?.sourceFiles ?? null)).digest('hex');

/**
 * Rein. next/prev: summary.json des neuen bzw. veröffentlichten Stands (prev null = noch nichts veröffentlicht → BLOCKED,
 * die erste Veröffentlichung ist immer manuell). dq: Bericht von data-quality.mjs --json.
 */
export function evaluatePublication({ next, prev, fingerprint, rebuildFingerprint, dq, registryOk }) {
  const f = [];
  // C1
  if (!SHA.test(String(fingerprint)) || fingerprint !== rebuildFingerprint) f.push(`C1 nicht reproduzierbar: ${fingerprint} vs. ${rebuildFingerprint}`);
  // C2
  const rules = Array.isArray(dq?.rules) ? dq.rules.filter((r) => DQ_RULES.includes(r.id)) : [];
  if (rules.length !== DQ_RULES.length || new Set(rules.map((r) => r.id)).size !== DQ_RULES.length) f.push(`C2 DQ-SF8-Regeln unvollständig (${rules.length} von ${DQ_RULES.length})`);
  for (const r of rules) if (r.status !== 'PASS' || !(r.checked > 0)) f.push(`C2 ${r.id} ${r.status} [${r.failed}/${r.checked}]`);
  if (!next || typeof next !== 'object') { f.push('C5 neuer Stand fehlt'); return { decision: 'BLOCKED', failures: f }; }
  if (!prev || typeof prev !== 'object') { f.push('C5 kein veröffentlichter Stand: die erste Veröffentlichung ist manuell (expected_sha256)'); return { decision: 'BLOCKED', failures: f }; }
  // C3
  for (const [k, v] of Object.entries(STATUS_INVARIANT)) if (next.status?.[k] !== v) f.push(`C3 status.${k} = ${next.status?.[k]} (erwartet ${v})`);
  if (next.counts?.validatedTradeSignal !== 0) f.push(`C3 validatedTradeSignal = ${next.counts?.validatedTradeSignal}`);
  if (next.counts?.byStage && Object.keys(next.counts.byStage).some((s) => /VALIDATED/.test(s))) f.push('C3 Stufe VALIDATED im neuen Stand');
  const ids = (s) => (Array.isArray(s?.strategies) ? s.strategies.map((x) => x.candidateId).sort() : []);
  const ni = ids(next), pi = ids(prev);
  if (ni.length !== STRATEGY_COUNT || new Set(ni).size !== STRATEGY_COUNT) f.push(`C3 ${ni.length} Methoden statt ${STRATEGY_COUNT}`);
  if (JSON.stringify(ni) !== JSON.stringify(pi)) f.push(`C3 Methoden weichen ab: ${ni.join(',')} vs. ${pi.join(',')}`);
  for (const s of next.strategies || []) if (s.liveReadiness !== STATUS_INVARIANT.liveReadiness) f.push(`C3 ${s.candidateId} liveReadiness ${s.liveReadiness}`);
  // C4
  if (next.schema !== prev.schema) f.push(`C4 Schema ${prev.schema} → ${next.schema}`);
  const nv = next.versions || {}, pv = prev.versions || {};
  for (const k of [...new Set([...Object.keys(nv), ...Object.keys(pv)])].sort()) if (nv[k] !== pv[k]) f.push(`C4 versions.${k} ${pv[k]} → ${nv[k]} (Modelländerung: erste Veröffentlichung manuell)`);
  const engines = (s) => JSON.stringify((s.strategies || []).map((x) => [x.candidateId, x.engine?.engineVersion ?? null]).sort());
  for (const s of next.strategies || []) if (typeof s.engine?.engineVersion !== 'string' || !s.engine.engineVersion) f.push(`C4 ${s.candidateId} ohne Engine-Version`);
  if (engines(next) !== engines(prev)) f.push('C4 Engine-Versionen der Methoden weichen ab (Modelländerung: erste Veröffentlichung manuell)');
  if (!inputsSha256(next) || !Array.isArray(next.inputs?.sourceFiles) || !next.inputs.sourceFiles.length) f.push('C1 Eingaben-Fingerabdruck oder Quelldateien fehlen in summary.inputs');
  // C5
  if (!ISO.test(String(next.asOf)) || !ISO.test(String(prev.asOf))) f.push(`C5 asOf ungültig (${prev.asOf} → ${next.asOf})`);
  else if (next.asOf < prev.asOf) f.push(`C5 neuer Stand ${next.asOf} älter als der veröffentlichte ${prev.asOf}`);
  if (!ISO.test(String(next.nextSession)) || !(next.nextSession > next.asOf)) f.push(`C5 nextSession ${next.nextSession} nicht nach asOf ${next.asOf}`);
  // C6
  const n = next.counts?.candidates, p = prev.counts?.candidates;
  if (!(Number.isInteger(n) && Number.isInteger(p) && p > 0)) f.push(`C6 Kandidatenzahl unlesbar (${p} → ${n})`);
  else if (n < p * PLAUSIBILITY.minCandidateRatio || n > p * PLAUSIBILITY.maxCandidateRatio) f.push(`C6 Kandidaten ${p} → ${n} außerhalb ${PLAUSIBILITY.minCandidateRatio * 100}–${PLAUSIBILITY.maxCandidateRatio * 100} %`);
  const ns = next.dataQuality?.securities, ps = prev.dataQuality?.securities;
  if (!(Number.isInteger(ns) && Number.isInteger(ps) && ps > 0) || ns < ps * PLAUSIBILITY.minSecuritiesRatio) f.push(`C6 Titel mit Daten ${ps} → ${ns} (mindestens ${PLAUSIBILITY.minSecuritiesRatio * 100} %)`);
  if (next.dataQuality?.rejectedInputs !== 0) f.push(`C6 verworfene Eingaben ${next.dataQuality?.rejectedInputs}`);
  if (next.counts?.rejectedRecords !== 0) f.push(`C6 verworfene Datensätze ${next.counts?.rejectedRecords}`);
  // C7
  if (registryOk !== true) f.push('C7 Registry-Eintrag nicht freigegeben');
  if (f.length) return { decision: 'BLOCKED', failures: f };
  return { decision: next.asOf === prev.asOf ? 'SKIP_SAME_SESSION' : 'PUBLISH', failures: [] };
}

/** Nachweis je Lauf: steht im CI-Artefakt und als Trailer in der Commit-Nachricht. */
export function publicationRecord({ next, prev, fingerprint, decision, failures, codeCommit = null, run = null }) {
  return {
    contract: PUBLICATION_CONTRACT, decision, failures,
    asOf: next?.asOf ?? null, previousAsOf: prev?.asOf ?? null, fingerprint,
    inputsSha256: next ? inputsSha256(next) : null, sourceFilesSha256: next ? sourceFilesSha256(next) : null, codeCommit, run,
    counts: next?.counts ?? null, versions: next?.versions ?? null, status: next?.status ?? null,
  };
}

function main() {
  const argv = process.argv.slice(2), arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const read = (p) => { try { return p && existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; } catch { return null; } };
  const next = read(join(arg('--next') || '', 'summary.json')), prev = read(join(arg('--prev') || '', 'summary.json'));
  const input = { next, prev, fingerprint: arg('--fingerprint'), rebuildFingerprint: arg('--rebuild-fingerprint'), dq: read(arg('--dq')), registryOk: arg('--registry-ok') === 'true' };
  let res;
  try { res = evaluatePublication(input); } catch (e) { res = { decision: 'BLOCKED', failures: [`Ausnahme im Vertrag: ${e && e.message}`] }; }
  const rec = publicationRecord({ ...input, ...res, codeCommit: arg('--code-commit'), run: arg('--run') });
  if (arg('--out')) writeFileSync(arg('--out'), JSON.stringify(rec, null, 2) + '\n');
  console.log(`[sf8-publication] ${PUBLICATION_CONTRACT}: ${res.decision} (Stand ${rec.asOf}, veröffentlicht ${rec.previousAsOf})`);
  for (const x of res.failures) console.log(`::error::${x}`);
  if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `decision=${res.decision}\ninputs_sha256=${rec.inputsSha256}\n`, { flag: 'a' });
  process.exit(res.decision === 'BLOCKED' ? 5 : 0);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
