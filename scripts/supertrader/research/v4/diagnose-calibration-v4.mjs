/**
 * V4.1 POST-RESULT DIAGNOSTIC (does not change the frozen V4.1 verdict NOT_CERTIFIED; nothing here is a
 * calibration amendment). Attributes the EW control failure and the internal reconciliation failure of run
 * 38722939085 (freeze V4-beae51ae1b07768b): extreme security-month returns, their data signature, and the months
 * where the share ledger and the TR arithmetic diverge.
 *
 * Public output: counts by class and correlations of clearly labelled diagnostic variants. Private (sealed):
 * the security-level evidence.
 * Usage: node diagnose-calibration-v4.mjs --freeze <file> --input-dir <private> --oracle-parsed <file> --out <private> --public-out <file>
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadCanonicalData } from '../certification/canonical-input.mjs';
import { prepareRerunData } from '../certification/run-rerun.mjs';
import { computeContentBinding } from '../calibration/capture-v3-inrunner.mjs';
import * as Listing from '../../validation/lib.mjs';
import { applyCausalTerminals } from './measurement/measurement-policy-v4.mjs';
import { priceSanityCensus, applyPriceSanityQuarantine, exchangeOf } from './measurement/price-sanity-v4.mjs';
import { buildConstructions, sessionCalendar, holdingReturn } from './oracle/constructions-v4.mjs';
import { correlation } from './oracle/compare-v4.mjs';
import { runEqualWeightBook } from './oracle/book-v4.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../../..');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const PROTOCOL = JSON.parse(fs.readFileSync(path.join(HERE, '../tournament/protocol.json')));
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
const mean = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : null);
function q(sorted, p) { if (!sorted.length) return null; const h = (sorted.length - 1) * p, lo = Math.floor(h); return sorted[lo] + (h - lo) * ((sorted[Math.ceil(h)] ?? sorted[lo]) - sorted[lo]); }
function idxAtOrBefore(bars, d) { let lo = 0, hi = bars.length; while (lo < hi) { const m = (lo + hi) >> 1; if (bars[m].date <= d) lo = m + 1; else hi = m; } return lo - 1; }

/** Data signature of one security-month (F, E]. */
export function signature(s, F, E) {
  const i0 = idxAtOrBefore(s.bars, F), i1 = idxAtOrBefore(s.bars, E);
  let maxRawJump = 1, minRawJump = 1, declaredSplits = 0, trVsPriceGap = 0;
  for (let i = i0 + 1; i <= i1; i++) {
    const a = s.bars[i - 1], b = s.bars[i];
    if (b.splitFactor && b.splitFactor !== 1) declaredSplits++;
    else if (a.rawClose > 0 && b.rawClose > 0) { const j = b.rawClose / a.rawClose; maxRawJump = Math.max(maxRawJump, j); minRawJump = Math.min(minRawJump, j); }
    if (a.totalReturnIndex > 0 && a.close > 0) { const trR = b.totalReturnIndex / a.totalReturnIndex, pxR = (b.close + (b.dividend || 0)) / a.close; trVsPriceGap = Math.max(trVsPriceGap, Math.abs(Math.log(trR / pxR))); }
  }
  const start = s.bars[i0], end = s.bars[i1];
  return { rawStart: start?.rawClose ?? null, rawEnd: end?.rawClose ?? null, maxRawJump, minRawJump, declaredSplits, trVsPriceLogGap: trVsPriceGap };
}
export function classifyOutlier(sig) {
  if (sig.trVsPriceLogGap > Math.log(2)) return 'TR_INDEX_INCONSISTENT_WITH_PRICE';
  if (sig.maxRawJump >= 10 || sig.minRawJump <= 0.1) return 'UNDECLARED_RAW_JUMP_10X';
  if (sig.declaredSplits > 0) return 'DECLARED_SPLIT_IN_MONTH';
  if ((sig.rawStart ?? 99) < 1) return 'SUB_DOLLAR_GENUINE_OR_UNVERIFIED';
  return 'UNEXPLAINED_PRICE_MOVE';
}

export function diagnose(data, oracle) {
  const calendar = sessionCalendar(data), calIdx = new Map(calendar.map((d, i) => [d, i])), byId = new Map(data.securities.map((s) => [s.id, s]));
  const base = buildConstructions(data, {});
  const ref = new Map(oracle.EW_MARKET.map((r) => [r.month, r.ret]));
  const variants = { BASELINE: [], EXCLUDE_ABS_RET_GT_100PCT: [], EXCLUDE_ABS_RET_GT_300PCT: [], WINSORIZE_1_99: [], EXCLUDE_RAW_START_BELOW_1: [], EXCLUDE_OUTLIER_CLASS_DATA_SIGNATURE: [] };
  const outliers = [], classCounts = {}, extremeCounts = { gt100pct: 0, gt1000pct: 0, ltMinus99pct: 0 };
  let maxRet = -Infinity;
  for (const m of base.months) {
    const rows = m.EW_MARKET.privateMembership.map((id) => { const s = byId.get(id), h = holdingReturn(s, m.formation, m.end, calIdx); return { s, ...h }; }).filter((x) => Number.isFinite(x.ret));
    const rets = rows.map((x) => x.ret), sorted = rets.slice().sort((a, b) => a - b), lo = q(sorted, 0.01), hi = q(sorted, 0.99);
    const flagged = new Set();
    for (const x of rows) {
      maxRet = Math.max(maxRet, x.ret);
      if (x.ret > 1) extremeCounts.gt100pct++; if (x.ret > 10) extremeCounts.gt1000pct++; if (x.ret < -0.99) extremeCounts.ltMinus99pct++;
      if (Math.abs(x.ret) > 1) {
        const sig = signature(x.s, m.formation, m.end), cls = classifyOutlier(sig);
        classCounts[cls] = (classCounts[cls] || 0) + 1;
        if (cls !== 'UNEXPLAINED_PRICE_MOVE' && cls !== 'SUB_DOLLAR_GENUINE_OR_UNVERIFIED') flagged.add(x.s.id);
        outliers.push({ month: m.month, id: x.s.id, ticker: x.s.ticker, ret: x.ret, category: x.category, exchange: exchangeOf(x.s), cls, ...sig, ewContribution: x.ret / rows.length });
      }
    }
    variants.BASELINE.push([m.month, mean(rets)]);
    variants.EXCLUDE_ABS_RET_GT_100PCT.push([m.month, mean(rets.filter((r) => Math.abs(r) <= 1))]);
    variants.EXCLUDE_ABS_RET_GT_300PCT.push([m.month, mean(rets.filter((r) => Math.abs(r) <= 3))]);
    variants.WINSORIZE_1_99.push([m.month, mean(rets.map((r) => Math.min(hi, Math.max(lo, r))))]);
    variants.EXCLUDE_RAW_START_BELOW_1.push([m.month, mean(rows.filter((x) => (x.s.bars[idxAtOrBefore(x.s.bars, m.formation)]?.rawClose ?? 0) >= 1).map((x) => x.ret))]);
    variants.EXCLUDE_OUTLIER_CLASS_DATA_SIGNATURE.push([m.month, mean(rows.filter((x) => !flagged.has(x.s.id)).map((x) => x.ret))]);
  }
  const corr = (series) => { const ms = series.filter(([mo, v]) => Number.isFinite(v) && Number.isFinite(ref.get(mo))); return correlation(ms.map(([, v]) => v), ms.map(([mo]) => ref.get(mo))); };
  const meanDiff = (series) => { const ms = series.filter(([mo, v]) => Number.isFinite(v) && Number.isFinite(ref.get(mo))); return mean(ms.map(([mo, v]) => v - ref.get(mo))); };
  const gapMonths = variants.BASELINE.map(([mo, v]) => ({ month: mo, diff: v - ref.get(mo) })).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  // internal reconciliation attribution
  const book = runEqualWeightBook(data, base.months, { mode: 'CLOSE' });
  const internalGaps = base.months.map((m) => ({ month: m.month, diff: (book.monthly.get(m.month) ?? NaN) - m.EW_MARKET.ret })).filter((x) => Number.isFinite(x.diff)).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  const outlierMonths = new Set(outliers.map((o) => o.month));
  const failingInternal = internalGaps.filter((g) => Math.abs(g.diff) > 5e-4);
  return {
    public: {
      extremeSecurityMonths: extremeCounts, maxSecurityMonthReturnOrder: Number.isFinite(maxRet) ? Math.round(Math.log10(Math.max(1, maxRet))) : null,
      outliersAbsRetGt100pctByClass: classCounts,
      diagnosticVariants: Object.fromEntries(Object.entries(variants).map(([k, v]) => [k, { correlationWithOracle: r3(corr(v)), meanMonthlyDifferenceSign: Math.sign(meanDiff(v) ?? 0) }])),
      ewGapConcentration: { monthsAbsDiffGt5pct: gapMonths.filter((g) => Math.abs(g.diff) > 0.05).length, top5MonthsShareOfSquaredGap: r3(gapMonths.slice(0, 5).reduce((a, g) => a + g.diff ** 2, 0) / gapMonths.reduce((a, g) => a + g.diff ** 2, 0)) },
      internalReconciliation: { failingMonths: failingInternal.length, failingMonthsThatAlsoContainAbsRetGt100pct: failingInternal.filter((g) => outlierMonths.has(g.month)).length, unexecutableHeld: book.stats.unexecutableHeld, unavailableSettlements: book.stats.unavailableSettlements },
    },
    private: { outliers: outliers.sort((a, b) => Math.abs(b.ret) - Math.abs(a.ret)).slice(0, 500), gapMonths, internalGaps: internalGaps.slice(0, 40), variants },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), args = {}; for (let i = 0; i < a.length; i += 2) args[a[i]] = a[i + 1];
  (async () => {
    const freeze = JSON.parse(fs.readFileSync(args['--freeze'])), inputDir = path.resolve(args['--input-dir']), out = path.resolve(args['--out']);
    fs.mkdirSync(out, { recursive: true, mode: 0o700 });
    const binding = computeContentBinding(inputDir), frozen = freeze.dataContract.canonicalCapture;
    const sameData = ['normalizedPartListSha256', 'normalizedManifestSha256', 'dataFingerprint'].every((k) => binding[k] === frozen[k]);
    const raw = await loadCanonicalData(inputDir, { sourceProvenanceOverlay: true, expectedSourceMetadataSha256: sha(fs.readFileSync(path.join(inputDir, 'data-certification-inputs.json'))) });
    const prepared = prepareRerunData(raw, PROTOCOL).data;
    const data = applyCausalTerminals(applyPriceSanityQuarantine(prepared, priceSanityCensus(prepared.securities)).data).data;
    const oracle = JSON.parse(fs.readFileSync(args['--oracle-parsed'])).parsed;
    const d = diagnose(data, oracle);
    const bytes = Buffer.from(JSON.stringify({ schema: 'supertrader-v4-diagnostic-private-1.0.0', freezeId: freeze.freezeId, ...d.private }));
    const keys = [['owner', 'scripts/supertrader/validation/results-public-key.pem'], ['session', 'scripts/supertrader/research/tournament/session-public-key.pem']];
    const envelopes = keys.map(([aud, p]) => { const f = path.join(out, `SUPERTRADER-V4-DIAGNOSTIC-PRIVATE.${aud}.sealed.json`), s = Listing.encryptForOwner(fs.readFileSync(path.join(ROOT, p), 'utf8'), bytes); fs.writeFileSync(f, s, { mode: 0o600, flag: 'wx' }); return { audience: aud, file: path.basename(f), sha256: sha(Buffer.from(s)) }; });
    const summary = { schema: 'supertrader-v4-diagnostic-public-1.0.0', kind: 'POST_RESULT_DIAGNOSTIC_NO_VERDICT_EFFECT', diagnosedFreezeId: freeze.freezeId, diagnosedRunId: 38722939085, runId: process.env.GITHUB_RUN_ID ?? null,
      sameCanonicalPriceContentAsFreeze: sameData, ...d.public, sealed: { plaintextSha256: sha(bytes), envelopes } };
    fs.writeFileSync(args['--public-out'], JSON.stringify(summary, null, 2) + '\n');
    process.stdout.write(JSON.stringify(d.public) + '\n');
  })().catch((e) => { process.stderr.write(JSON.stringify({ phase: 'V4_DIAGNOSTIC', code: /^[A-Z0-9_:]+$/.test(e.message) ? e.message : 'PRIVATE_RUN_FAILURE', hint: /^[A-Za-z0-9 ,.:'()_\-/]{1,160}$/.test(e.message) ? e.message : null, stack: (e.stack || '').split('\n').slice(1, 5).map((l) => l.replace(/\(.*\/scripts\//, '(scripts/')).join(' | ') }) + '\n'); process.exitCode = 1; });
}
