#!/usr/bin/env node
// Supertrader Foundation — technischer Vorher/Nachher-Nachweis A4/A5/A8 auf identischen Eingaben.
//
// Laeuft jeden eingefrorenen Fall (cases.mjs) einmal im Legacy-Modus und einmal mit
// accounting RESEARCH_V1 durch validation/portfolio.mjs runPortfolioTR und schreibt
//   SUPERTRADER-ACCOUNTING-REGRESSION.json  (Ledger, Cash, Positionswerte, Equity, TR-Abgleich)
//   SUPERTRADER-EXECUTION-REGRESSION.json   (Fills, Settlement, Stueckzahlen, Ablehnungen)
// Kein Netz, keine Produktionsdaten. Aufruf: node build-accounting-evidence.mjs --out <dir>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES, buildCase } from './cases.mjs';
import { summarizeRun } from './summarize-run.mjs';
import { runPortfolioTR, reconcile, reconcileResearch } from '../validation/portfolio.mjs';
import * as AC from '../validation/accounting-contract.mjs';

const r8 = (v) => (Number.isFinite(v) ? Math.round(v * 1e8) / 1e8 + 0 : v);
const FINDING = {
  C04_STALE_LIMIT_REACHED: 'A4', C21_ZERO_VOLUME_STALE: 'A4', C05_PREMATURE_SERIES_END: 'A5', C06_GAP_SEGMENT_END: 'A5', C08_LATE_OBSERVED_QUARANTINE: 'A5', C09_ONTIME_QUARANTINE: 'A5',
  C15_EXIT_WITHOUT_SOURCE_BAR: 'A5', C17_NO_LOOKAHEAD_QUARANTINE: 'A4/A5', C18_FINAL_VALUATION: 'A5', C13_ROUNDING_RESIDUAL: 'A8', C14_OVERSHOOT_FRACTION: 'A8', C19_DUST_BELOW_LIMIT: 'A8', C16_TINY_ORDER: 'A8', C23_QUARANTINE_FROM_BEFORE_SERIES_END: 'A5', C24_QUARANTINED_BEFORE_ENTRY: 'A5', C25_DELISTED_AFTER_WINDOW: 'A5',
};

export function buildEvidence() {
  const acc = [], exe = [];
  for (const c of CASES) {
    const { calendar, trades, cfg } = buildCase(c);
    const legacyRun = runPortfolioTR(trades, calendar, cfg, { scenario: 'S1_MINUS_30' });
    const v1Run = runPortfolioTR(buildCase(c).trades, calendar, cfg, { scenario: 'S1_MINUS_30', accounting: AC.RESEARCH_ACCOUNTING_MODE });
    const L = summarizeRun(legacyRun, cfg), V = summarizeRun(v1Run, cfg);
    const lr = reconcile(legacyRun, cfg), vr = reconcileResearch(v1Run, cfg);
    const curveDiffDays = L.equityCurve.reduce((n, v, i) => n + (v !== V.equityCurve[i] ? 1 : 0), 0);
    const firstDiff = L.equityCurve.findIndex((v, i) => v !== V.equityCurve[i]);
    acc.push({
      case: c.id, title: c.title, finding: FINDING[c.id] || 'CONTROL',
      legacy: { finalEquity: L.finalEquity, cashEnd: L.cashEnd, openValueEnd: L.openValueEnd, positionsEnd: L.positionsEnd, totalReturn: L.totalReturn, pnlReconciliation: { expected: r8(lr.expected), end: r8(lr.end), relDiff: lr.relDiff }, ledger: 'NONE' },
      researchV1: { finalEquity: V.finalEquity, cashEnd: V.cashEnd, openValueEnd: V.openValueEnd, positionsEnd: V.positionsEnd, totalReturn: V.totalReturn, minCash: r8(v1Run.minCash), dustWriteOffs: v1Run.dustWriteOffs.map((w) => ({ date: w.date, shares: w.shares, value: r8(w.markValue) })), cashPrecisionCorrections: v1Run.cashPrecisionCorrections.length, reconciliation: { pass: vr.pass, checks: vr.checks, tolerance: vr.tolerance }, ledgerRows: v1Run.ledger.length },
      delta: { finalEquity: r8(V.finalEquity - L.finalEquity), totalReturnPct: r8((V.totalReturn - L.totalReturn) * 100), equityCurveDaysDifferent: curveDiffDays, firstDifferentDate: firstDiff >= 0 ? calendar[firstDiff] : null, identical: curveDiffDays === 0 && L.finalEquity === V.finalEquity },
    });
    const fills = (run, legacy) => legacy
      ? run.taken.flatMap((p) => p.tr.exits.filter((x) => p.done.has(x)).map((x) => ({ id: p.tr.id, date: x.date, fraction: x.fraction, price: x.price, ruleId: x.ruleId, onRealSourceBar: p.tr.marks.has(x.date) })))
      : run.ledger.filter((x) => x.side === 'SELL').map((x) => ({ id: x.id, date: x.date, shares: x.shares, price: x.price, ruleId: x.reason, onRealSourceBar: trades.find((t) => t.id === x.id).marks.has(x.date) }));
    const settle = (run) => run.taken.filter((p) => p.terminalPrice !== undefined).map((p) => ({ id: p.tr.id, kind: p.settlement?.kind || p.tr.terminal?.kind, date: p.settlement?.date || p.tr.terminal?.date, price: r8(p.terminalPrice), factor: p.settlement?.factor ?? null, ignoredExits: p.settlement?.ignoredExits ?? null }));
    exe.push({
      case: c.id, finding: FINDING[c.id] || 'CONTROL',
      legacy: { entries: legacyRun.taken.map((p) => ({ id: p.tr.id, date: p.entryDate, shares: p.entryShares })), sellFills: fills(legacyRun, true), terminalSettlements: settle(legacyRun), sharesLeft: legacyRun.taken.map((p) => p.shares), skipped: L.skipped },
      researchV1: { entries: v1Run.taken.map((p) => ({ id: p.tr.id, date: p.entryDate, shares: p.entryShares })), sellFills: fills(v1Run, false), terminalSettlements: settle(v1Run), sharesLeft: v1Run.taken.map((p) => p.shares), skipped: V.skipped, rejections: v1Run.rejections, endingPositionCheck: v1Run.endingPositionCheck, staleCounts: v1Run.staleCounts },
      fillsOnRealSourceBars: { legacy: fills(legacyRun, true).every((f) => f.onRealSourceBar), researchV1: fills(v1Run, false).every((f) => f.onRealSourceBar) },
    });
  }
  const meta = { contract: AC.describeContract(), inputs: 'scripts/supertrader/foundation/cases.mjs (eingefroren, synthetisch, deterministisch)', scenario: 'S1_MINUS_30 (wirtschaftliches Delisting -30 %), Datenereignis-Basis LAST_VALID_CLOSE', engine: 'scripts/supertrader/validation/portfolio.mjs runPortfolioTR', historicalFrozenInputAvailable: false,
    historicalNote: 'Fuer die frueheren Research-Laeufe existiert kein unveraenderlicher historischer Input (#763 Abschnitt 1). Ein exakter historischer Vorher/Nachher-Vergleich wird deshalb NICHT behauptet; der Nachweis erfolgt auf identischen eingefrorenen Eingaben.' };
  const changed = acc.filter((a) => !a.delta.identical).map((a) => a.case);
  return {
    accounting: { schema: 'supertrader-accounting-regression-1.0.0', ...meta, summary: { cases: acc.length, identical: acc.length - changed.length, changed, researchV1AllReconciled: acc.every((a) => a.researchV1.reconciliation.pass), researchV1NoNegativeCash: acc.every((a) => a.researchV1.minCash >= 0), dustWrittenOffTotalValue: r8(acc.reduce((s, a) => s + a.researchV1.dustWriteOffs.reduce((t, w) => t + w.value, 0), 0)) }, cases: acc },
    execution: { schema: 'supertrader-execution-regression-1.0.0', ...meta, summary: { cases: exe.length, legacyFillsWithoutSourceBar: exe.filter((e) => !e.fillsOnRealSourceBars.legacy).map((e) => e.case), researchV1FillsWithoutSourceBar: exe.filter((e) => !e.fillsOnRealSourceBars.researchV1).map((e) => e.case), researchV1EndingFreshnessPass: exe.every((e) => e.researchV1.endingPositionCheck.status === 'PASS') }, cases: exe },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const i = process.argv.indexOf('--out');
  if (i < 0 || !process.argv[i + 1]) { console.error('--out <dir> erforderlich'); process.exit(2); }
  const out = process.argv[i + 1];
  fs.mkdirSync(out, { recursive: true });
  const e = buildEvidence();
  fs.writeFileSync(path.join(out, 'SUPERTRADER-ACCOUNTING-REGRESSION.json'), JSON.stringify(e.accounting, null, 1) + '\n');
  fs.writeFileSync(path.join(out, 'SUPERTRADER-EXECUTION-REGRESSION.json'), JSON.stringify(e.execution, null, 1) + '\n');
  console.log(JSON.stringify({ accounting: e.accounting.summary, execution: e.execution.summary }));
}
