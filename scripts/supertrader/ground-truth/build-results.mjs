// Auswertung des Ground Truth Replay aus den oeffentlichen Logzeilen (FALL ..., TRICHTER ...).
// Vor dem Replay geschrieben und mit eingefroren: Kennzahlen und Entscheidungsbaum wie praeregistriert (+ Nachtrag A1).
// node scripts/supertrader/ground-truth/build-results.mjs --log <job-log> [--log <holdout-log>] --out-results <f> --out-failures <f>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const share = (a, b) => (b ? Math.round((a / b) * 1000) / 1000 : null);
const inc = (m, k, by = 1) => { m[k] = (m[k] || 0) + by; return m; };

export function parseLog(text) {
  const cases = [], funnels = [];
  for (const line of text.split('\n')) {
    let i = line.indexOf('] FALL ');
    if (i >= 0) { cases.push(JSON.parse(line.slice(i + 7))); continue; }
    i = line.indexOf('] TRICHTER ');
    if (i >= 0) { const w = /gt-replay (\w+)/.exec(line); funnels.push({ window: w ? w[1] : null, funnel: JSON.parse(line.slice(i + 11)) }); }
  }
  return { cases, funnels };
}

// Blockierende Schichten eines abgelehnten Falls (alle, nicht nur die erste).
export function blockers(rp) {
  const out = [];
  if (!rp.universe?.ok) out.push('MR-UNI-01');
  if (!rp.trend?.ok) for (const r of rp.trend.failed) out.push(r);
  if (!rp.vcp?.ok) out.push('VCP:' + rp.vcp.reason);
  if (!rp.sepa?.ok) out.push('SEPA:' + rp.sepa.reason);
  return out;
}
export const layerOf = (b) => (b === 'MR-UNI-01' ? 'UNIVERSE' : b === 'MR-TT-08' ? 'RS' : b.startsWith('MR-TT') ? 'TREND' : b.startsWith('VCP') ? 'VCP' : 'FUNDAMENTALS');

export function evaluate(cases, funnels) {
  const groups = {};
  for (const c of cases) (groups[c.group] ||= []).push(c);
  const recallOf = (list) => {
    const ev = list.filter((c) => ['DETECTED', 'REJECTED'].includes(c.replay?.decision));
    const det = ev.filter((c) => c.replay.decision === 'DETECTED');
    const timing = {};
    for (const c of ev) inc(timing, c.replay.timing?.class || 'MISS');
    const ne = {};
    for (const c of list.filter((x) => x.replay?.decision === 'NOT_EVALUABLE')) inc(ne, c.replay.reason);
    return { cases: list.length, evaluable: ev.length, detected: det.length, missed: ev.length - det.length, recall: share(det.length, ev.length), timing, notEvaluable: ne, setupAtTStar: ev.filter((c) => c.replay.setupAtTStar).length };
  };
  const main = groups.MAIN || [], sens = groups.SENSITIVITY || [], watch = groups.WATCHLIST || [], neg = groups.NEGATIVE || [];
  const evNeg = neg.filter((c) => ['FALSE_POSITIVE', 'CORRECT_REJECT'].includes(c.replay?.decision));
  const fp = evNeg.filter((c) => c.replay.decision === 'FALSE_POSITIVE').length;
  // Fehlermatrix ueber abgelehnte positive Faelle (MAIN + SENSITIVITY): jede blockierende Schicht und "einzige Sperre".
  const rejected = [...main, ...sens].filter((c) => c.replay?.decision === 'REJECTED');
  const byRule = {}, byLayer = {}, soleLayer = {};
  for (const c of rejected) {
    const b = blockers(c.replay);
    for (const x of b) inc(byRule, x);
    const layers = [...new Set(b.map(layerOf))];
    for (const l of layers) inc(byLayer, l);
    if (layers.length === 1) inc(soleLayer, layers[0]);
    if (!layers.length) inc(soleLayer, 'NO_LAYER_BLOCKS_AT_TSTAR_TIMING_OR_TRIGGER');
  }
  const failureMatrix = Object.fromEntries(Object.entries(byLayer).map(([k, v]) => [k, { cases: v, share: share(v, rejected.length) }]));
  // Kontrollen (nur MAIN): Rate Setup an t* und Signal in der Toleranz gegen die Erkennungsrate der Faelle.
  const ctl = main.filter((c) => c.controls);
  const cN = ctl.reduce((a, c) => a + c.controls.n, 0);
  const controls = { cases: ctl.length, controls: cN, setupAtTStar: ctl.reduce((a, c) => a + c.controls.setupAtTStar, 0), detected: ctl.reduce((a, c) => a + c.controls.detected, 0), trend: ctl.reduce((a, c) => a + c.controls.trend, 0), vcp: ctl.reduce((a, c) => a + c.controls.vcp, 0), sepa: ctl.reduce((a, c) => a + c.controls.sepa, 0) };
  controls.setupRate = share(controls.setupAtTStar, cN); controls.detectedRate = share(controls.detected, cN);
  // VCP-Konfusion (Schicht allein an t*): alle MAIN-Positiven sind von Minervini bejahte Setups.
  const evMain = main.filter((c) => ['DETECTED', 'REJECTED'].includes(c.replay?.decision));
  const vcpYes = evMain.filter((c) => c.replay.vcp.ok).length;
  const vcpReasons = {};
  for (const c of evMain.filter((x) => !x.replay.vcp.ok)) inc(vcpReasons, c.replay.vcp.reason);
  const vcpConfusion = { positives: evMain.length, vuVcpYes: vcpYes, vuVcpNo: evMain.length - vcpYes, recall: share(vcpYes, evMain.length), falseNegativeRate: share(evMain.length - vcpYes, evMain.length), precision: 'NOT_MEASURABLE (keine VCP-Negativfaelle)', falsePositiveRate: 'NOT_MEASURABLE', reasons: vcpReasons };
  const trendRules = {}, sepaReasons = {};
  for (const c of evMain) { for (const r of c.replay.trend.failed) inc(trendRules, r); if (!c.replay.sepa.ok) inc(sepaReasons, c.replay.sepa.reason); }
  const R = recallOf(main);
  // Entscheidungsbaum (Schwellen praeregistriert; "selten" = Kontroll-Setup-Rate hoechstens halb so hoch wie die Erkennungsrate, Nachtrag A1).
  const tree = [];
  if (R.recall !== null && R.recall >= 0.7) tree.push(controls.setupRate !== null && controls.setupRate <= R.recall / 2 ? 'A' : 'C');
  if (R.recall !== null && R.recall < 0.4) tree.push('B');
  const top = Object.entries(byLayer).sort((a, b) => b[1] - a[1])[0];
  if (top && top[0] === 'FUNDAMENTALS') tree.push('D');
  if (top && top[0] === 'VCP') tree.push('E');
  const scorecard = {
    positiveCasesMain: main.length, evaluable: R.evaluable, correctlyDetected: R.detected, missed: R.missed,
    exact: R.timing.EXACT || 0, plusMinus1: R.timing.PLUS_MINUS_1 || 0, plusMinus3: R.timing.PLUS_MINUS_3 || 0, plusMinus5: R.timing.PLUS_MINUS_5 || 0,
    fundamentalFailures: byLayer.FUNDAMENTALS || 0, vcpFailures: byLayer.VCP || 0, trendFailures: byLayer.TREND || 0, rsFailures: byLayer.RS || 0, universeFailures: byLayer.UNIVERSE || 0,
    negativeControls: neg.length, negativeEvaluable: evNeg.length, falsePositives: fp,
    note: 'Fehlerzahlen beziehen sich auf abgelehnte MAIN+SENSITIVITY-Faelle; ein Fall kann an mehreren Schichten scheitern.',
  };
  const funnel = funnels.map(({ window, funnel: f }) => {
    const years = {};
    for (const [k, v] of Object.entries(f)) { const [y, reg] = k.split('|'); const Y = (years[y] ||= {}); Y[reg] = v; }
    const perYear = Object.fromEntries(Object.entries(years).map(([y, regs]) => {
      const t = Object.values(regs).reduce((a, v) => { for (const k of Object.keys(v)) a[k] = (a[k] || 0) + v[k]; return a; }, {});
      return [y, { ...t, setupsPer1000: t.universe ? Math.round((t.setups / t.universe) * 1e4) / 10 : null, signalsPer1000: t.universe ? Math.round((t.signals / t.universe) * 1e4) / 10 : null, byRegime: regs }];
    }));
    return { window, perYear };
  });
  return {
    recall: { MAIN: R, SENSITIVITY: recallOf(sens), MAIN_PLUS_SENSITIVITY: recallOf([...main, ...sens]), WATCHLIST: recallOf(watch) },
    precision: evNeg.length >= 5 ? share(R.detected, R.detected + fp) : 'NOT_MEASURABLE (< 5 auswertbare Negativfaelle)',
    negatives: neg.map((c) => ({ case_id: c.case_id, ticker: c.ticker, decision: c.replay?.decision, reason: c.replay?.reason || null })),
    failureMatrix, failuresByRule: byRule, soleBlockingLayer: soleLayer, rejectedPositives: rejected.length,
    trendRuleFailures: trendRules, sepaReasons, vcpConfusion, controls, funnel, decisionTree: tree, scorecard,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const argv = process.argv.slice(2);
  const logs = argv.flatMap((a, i) => (a === '--log' ? [argv[i + 1]] : []));
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const all = logs.map((f) => parseLog(fs.readFileSync(f, 'utf8')));
  const cases = all.flatMap((x) => x.cases), funnels = all.flatMap((x) => x.funnels);
  const res = evaluate(cases, funnels);
  fs.writeFileSync(arg('--out-results'), JSON.stringify({ schema: 'vu-minervini-ground-truth-results-1.0.0', label: 'Diagnose, keine Optimierung; Performance ist keine Ground Truth', ...res, cases }, null, 2) + '\n');
  const failures = cases.filter((c) => c.replay && c.replay.decision !== 'DETECTED').map((c) => ({ case_id: c.case_id, ticker: c.ticker, group: c.group, decision: c.replay.decision, reason: c.replay.reason || null, blockingRules: c.replay.trend ? blockers(c.replay) : [], layers: c.replay.trend ? [...new Set(blockers(c.replay).map(layerOf))] : [], mechanicalAttribution: c.replay.attribution || [], identity: c.identity || null }));
  fs.writeFileSync(arg('--out-failures'), JSON.stringify({ schema: 'vu-minervini-ground-truth-failures-1.0.0', failures }, null, 2) + '\n');
  console.log(`Faelle ${cases.length}; Recall MAIN ${res.recall.MAIN.recall}; Baum ${res.decisionTree.join(',') || '-'}`);
}
