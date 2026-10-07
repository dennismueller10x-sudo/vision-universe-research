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

// Blockierende Schichten eines abgelehnten Falls (alle, nicht nur die erste). SEPA getrennt nach Datenluecke und Regel.
const SEPA_DATA = (sp) => sp.ruleId === 'MR-SEPA-00' || sp.ruleId === 'MR-PIT-01' || sp.reason === 'SEPA_ACCEL_NOT_DEMONSTRABLE' || sp.reason === 'NO_NEXT_SESSION';
export function blockers(rp) {
  const out = [];
  if (!rp.universe?.ok) out.push('MR-UNI-01');
  if (!rp.trend?.ok) for (const r of rp.trend.failed) out.push(r);
  if (!rp.vcp?.ok) out.push('VCP:' + rp.vcp.reason);
  if (!rp.sepa?.ok) out.push((SEPA_DATA(rp.sepa) ? 'SEPA_DATA:' : 'SEPA_RULE:') + rp.sepa.reason);
  return out;
}
export const layerOf = (b) => (b === 'MR-UNI-01' ? 'UNIVERSE' : b === 'MR-TT-08' ? 'RS' : b.startsWith('MR-TT') ? 'TREND' : b.startsWith('VCP') ? 'VCP' : b.startsWith('SEPA_DATA') ? 'FUNDAMENTALS_DATA' : 'FUNDAMENTALS_RULE');
const SEC_UNAVAILABLE = ['FOREIGN_PRIVATE_ISSUER_NO_10Q', 'PARTNERSHIP_UNITS'];
const isEval = (c) => ['DETECTED', 'REJECTED'].includes(c.replay?.decision);

export function evaluate(cases, funnels) {
  const groups = {};
  for (const c of cases) (groups[c.group] ||= []).push(c);
  const recallOf = (list) => {
    const ev = list.filter(isEval);
    const det = ev.filter((c) => c.replay.decision === 'DETECTED');
    const timing = {}, sign = { vuEarlier: 0, same: 0, vuLater: 0 };
    for (const c of ev) inc(timing, c.replay.timing?.class || 'MISS');
    for (const c of det) { const o = c.replay.timing?.offsetSessions; if (Number.isFinite(o)) inc(sign, o < 0 ? 'vuEarlier' : o > 0 ? 'vuLater' : 'same'); }
    const ne = {};
    for (const c of list.filter((x) => x.replay?.decision === 'NOT_EVALUABLE')) inc(ne, c.replay.reason);
    return { cases: list.length, evaluable: ev.length, detected: det.length, missed: ev.length - det.length, recall: share(det.length, ev.length), strongEvidenceExactOrPlusMinus1: (timing.EXACT || 0) + (timing.PLUS_MINUS_1 || 0), timing, signOfOffset: sign, notEvaluable: ne, setupAtTStar: ev.filter((c) => c.replay.setupAtTStar).length, setupAtTStarRate: share(ev.filter((c) => c.replay.setupAtTStar).length, ev.length) };
  };
  const postLevel = (list) => {
    const byPost = new Map();
    for (const c of list.filter(isEval)) { const k = c.statusId || c.case_id; const v = byPost.get(k) || { n: 0, det: false }; v.n++; v.det = v.det || c.replay.decision === 'DETECTED'; byPost.set(k, v); }
    const posts = [...byPost.values()];
    return { posts: posts.length, detectedPosts: posts.filter((x) => x.det).length, recall: share(posts.filter((x) => x.det).length, posts.length), clusteredCaseShare: share(posts.filter((x) => x.n > 1).reduce((a, x) => a + x.n, 0), list.filter(isEval).length) };
  };
  const main = groups.MAIN || [], sens = groups.SENSITIVITY || [], watch = groups.WATCHLIST || [], neg = groups.NEGATIVE || [], notModelled = groups.ENTRY_TYPE_NOT_MODELLED || [];
  const R = recallOf(main);
  const strata = {
    MAIN_A_OWN_ENTRY: recallOf(main.filter((c) => c.stratum === 'MAIN_A_OWN_ENTRY')),
    MAIN_B_SETUP_AFFIRMED_NO_OWN_BUY: recallOf(main.filter((c) => c.stratum === 'MAIN_B_SETUP_AFFIRMED_NO_OWN_BUY')),
    MAIN_WITHOUT_SEC_QUARTERLY_UNAVAILABLE: recallOf(main.filter((c) => !(c.tags || []).some((t) => SEC_UNAVAILABLE.includes(t)))),
    MAIN_WITHOUT_EX_POST_ANCHOR: recallOf(main.filter((c) => !(c.tags || []).includes('EX_POST_ANCHOR'))),
    MAIN_POST_LEVEL: postLevel(main),
    SENSITIVITY: recallOf(sens), SENSITIVITY_POST_LEVEL: postLevel(sens),
  };
  // Watchlist/Vor-Ausbruch: Setup am Schluss vor dem Beitrag; naechstes Signal nur beschreibend. Kein Recall.
  const watchlist = { cases: watch.length, evaluable: watch.filter(isEval).length, setupAtTStar: watch.filter((c) => isEval(c) && c.replay.setupAtTStar).length, passedLayers: watch.filter(isEval).map((c) => ({ ticker: c.ticker, passedLayers: c.replay.passedLayers, setupAtTStar: c.replay.setupAtTStar, nearestSignalOffset: c.replay.nearestSignalAnyDistance?.offsetSessions ?? null })), notEvaluable: watch.filter((c) => c.replay?.decision === 'NOT_EVALUABLE').map((c) => [c.ticker, c.replay.reason]), note: 'kein Recall; Primaermass setupAtTStar' };
  const evNeg = neg.filter((c) => ['FALSE_POSITIVE', 'CORRECT_REJECT'].includes(c.replay?.decision));
  // Fehlermatrix ueber abgelehnte MAIN-Faelle (SENSITIVITY getrennt): jede blockierende Schicht und "einzige Sperre".
  const matrix = (list) => {
    const rejected = list.filter((c) => c.replay?.decision === 'REJECTED');
    const byRule = {}, byLayer = {}, sole = {};
    for (const c of rejected) {
      const b = blockers(c.replay);
      for (const x of b) inc(byRule, x);
      const layers = [...new Set(b.map(layerOf))];
      for (const l of layers) inc(byLayer, l);
      if (layers.length === 1) inc(sole, layers[0]);
      if (!layers.length) inc(sole, 'NO_LAYER_BLOCKS_AT_TSTAR_TIMING_OR_TRIGGER');
    }
    return { rejected: rejected.length, byLayer: Object.fromEntries(Object.entries(byLayer).map(([k, v]) => [k, { cases: v, share: share(v, rejected.length) }])), byRule, soleBlockingLayer: sole };
  };
  const fmMain = matrix(main), fmSens = matrix(sens);
  // Kontrollen (MAIN): Signal-Rate gegen Recall, Setup-Rate an t* gegen Setup-Rate der Faelle.
  const ctlSum = (key) => {
    const ctl = main.filter((c) => c[key]);
    const n = ctl.reduce((a, c) => a + c[key].n, 0);
    const o = { cases: ctl.length, controls: n };
    for (const k of ['setupAtTStar', 'detected', 'trend', 'vcp', 'sepa']) o[k] = ctl.reduce((a, c) => a + c[key][k], 0);
    o.setupRate = share(o.setupAtTStar, n); o.detectedRate = share(o.detected, n);
    return o;
  };
  const controls = { universeOnly: ctlSum('controls'), trendTemplatePassing: ctlSum('controlsTrend'), comparison: { caseRecall: R.recall, caseSetupAtTStarRate: R.setupAtTStarRate } };
  // VCP-Konfusion (Schicht allein an t*): alle MAIN-Positiven sind von Minervini bejahte Setups.
  const evMain = main.filter(isEval);
  const vcpYes = evMain.filter((c) => c.replay.vcp.ok).length;
  const vcpReasons = {};
  for (const c of evMain.filter((x) => !x.replay.vcp.ok)) inc(vcpReasons, c.replay.vcp.reason);
  const vcpConfusion = { positives: evMain.length, vuVcpYes: vcpYes, vuVcpNo: evMain.length - vcpYes, recall: share(vcpYes, evMain.length), falseNegativeRate: share(evMain.length - vcpYes, evMain.length), precision: 'NOT_MEASURABLE (keine VCP-Negativfaelle)', falsePositiveRate: 'NOT_MEASURABLE', reasons: vcpReasons };
  const trendRules = {}, sepaReasons = {};
  for (const c of evMain) { for (const r of c.replay.trend.failed) inc(trendRules, r); if (!c.replay.sepa.ok) inc(sepaReasons, c.replay.sepa.reason); }
  // Entscheidungsbaum: Schwellen praeregistriert; Vergleich gleichartiger Groessen und Datenluecken getrennt (Nachtrag A1).
  const tree = [];
  const cr = controls.universeOnly.detectedRate;
  if (R.recall !== null && R.recall >= 0.7) tree.push(cr !== null && cr <= R.recall / 2 ? 'A' : 'C');
  if (R.recall !== null && R.recall < 0.4) tree.push('B');
  const ranked = Object.entries(fmMain.byLayer).sort((a, b) => b[1].cases - a[1].cases);
  const topCases = ranked.length ? ranked[0][1].cases : 0;
  const tops = ranked.filter(([, v]) => v.cases === topCases).map(([k]) => k);
  if (tops.includes('FUNDAMENTALS_RULE')) tree.push('D');
  if (tops.includes('VCP')) tree.push('E');
  const scorecard = {
    positiveCasesMain: main.length, evaluable: R.evaluable, correctlyDetected: R.detected, missed: R.missed,
    exact: R.timing.EXACT || 0, plusMinus1: R.timing.PLUS_MINUS_1 || 0, plusMinus3: R.timing.PLUS_MINUS_3 || 0, plusMinus5: R.timing.PLUS_MINUS_5 || 0,
    fundamentalRuleFailures: fmMain.byLayer.FUNDAMENTALS_RULE?.cases || 0, fundamentalDataGaps: fmMain.byLayer.FUNDAMENTALS_DATA?.cases || 0,
    vcpFailures: fmMain.byLayer.VCP?.cases || 0, trendFailures: fmMain.byLayer.TREND?.cases || 0, rsFailures: fmMain.byLayer.RS?.cases || 0, universeFailures: fmMain.byLayer.UNIVERSE?.cases || 0,
    negativeControls: neg.length, negativeEvaluable: evNeg.length, falsePositives: evNeg.length >= 5 ? evNeg.filter((c) => c.replay.decision === 'FALSE_POSITIVE').length : 'NOT_MEASURABLE (< 5 Negativfaelle)',
    pivot: 'NOT_MEASURABLE (kein dokumentierter Pivot)',
    note: 'Fehlerzahlen ueber abgelehnte MAIN-Faelle; ein Fall kann an mehreren Schichten scheitern.',
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
    recall: { MAIN: R, ...strata }, watchlist,
    entryTypeNotModelled: notModelled.map((c) => ({ ticker: c.ticker, decision: c.replay?.decision, passedLayers: c.replay?.passedLayers ?? null, blockers: c.replay?.trend ? blockers(c.replay) : [] })),
    precision: 'NOT_MEASURABLE (< 5 auswertbare Negativfaelle)',
    negatives: neg.map((c) => ({ case_id: c.case_id, ticker: c.ticker, decision: c.replay?.decision, reason: c.replay?.reason || null, note: 'Einzelbeobachtung' })),
    failureMatrix: fmMain, failureMatrixSensitivity: fmSens,
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
  const failures = cases.filter((c) => c.replay && c.replay.decision !== 'DETECTED').map((c) => ({ case_id: c.case_id, ticker: c.ticker, group: c.group, stratum: c.stratum || null, tags: c.tags || [], decision: c.replay.decision, reason: c.replay.reason || null, blockingRules: c.replay.trend ? blockers(c.replay) : [], layers: c.replay.trend ? [...new Set(blockers(c.replay).map(layerOf))] : [], mechanicalAttribution: c.replay.attribution || [], identity: c.identity || null }));
  fs.writeFileSync(arg('--out-failures'), JSON.stringify({ schema: 'vu-minervini-ground-truth-failures-1.0.0', failures }, null, 2) + '\n');
  console.log(`Faelle ${cases.length}; Recall MAIN ${res.recall.MAIN.recall}; Baum ${res.decisionTree.join(',') || '-'}`);
}
