// Minervini Ground Truth Replay – reiner Diagnosemodus (keine Regel, kein Portfolio, keine Rueckwirkung auf die Engine).
//
// Prueft fuer einen von Minervini selbst dokumentierten Fall, ob die eingefrorene Engine minervini-adaptation-1.1.0
// (Signal-Regeln identisch zu 1.0.0) das Setup zum damaligen Zeitpunkt erkennt – Regel fuer Regel.
// Alle Schichten werden UNABHAENGIG ausgewertet (die Engine selbst bricht an der ersten Schicht ab); das Setup und
// das Signal stammen dagegen unveraendert aus scanSegment (Engine-Logik), damit die Entscheidung identisch bleibt.
// Toleranzen und Definitionen: scripts/supertrader/fidelity/MINERVINI-GROUND-TRUTH-PREREG.json (vor der Auswertung).
import { dollarVolume } from '../engine/indicators.mjs';
import { prepareIndicators, trendTemplate } from '../replication/minervini/trend-template.mjs';
import { detectVcp } from '../replication/minervini/vcp.mjs';
import { evaluateSepa } from '../replication/minervini/sepa.mjs';
import { scanSegment } from '../replication/minervini/signal-engine.mjs';

// Praeregistrierte Toleranzklassen (Handelstage). Nicht je Fall anpassen.
export const TIMING_CLASSES = Object.freeze([['EXACT', 0], ['PLUS_MINUS_1', 1], ['PLUS_MINUS_3', 3], ['PLUS_MINUS_5', 5]]);
export const DETECTION_TOLERANCE = 5;

export function timingClass(offset) {
  if (offset === null || offset === undefined) return 'MISS';
  for (const [name, k] of TIMING_CLASSES) if (Math.abs(offset) <= k) return name;
  return 'MISS';
}

// Erster Handelstag >= date (Index), sonst -1.
export function indexOnOrAfter(dates, date) { for (let i = 0; i < dates.length; i++) if (dates[i] >= date) return i; return -1; }
export function indexOnOrBefore(dates, date) { for (let i = dates.length - 1; i >= 0; i--) if (dates[i] <= date) return i; return -1; }

// Alle Schichten an Schluss t unabhaengig. ctx wie scanSegment: {bars, rawClose, rsPct, fund, splitRatio}.
export function layersAt(ctx, ind, dv, t, P) {
  const { bars } = ctx;
  const rc = ctx.rawClose[t];
  const universe = { ok: rc >= P['uni.minRawClose'] && dv[t] >= P['uni.minDollarVolume20'], rawCloseOk: rc >= P['uni.minRawClose'], dollarVolumeOk: dv[t] >= P['uni.minDollarVolume20'] };
  const tt = trendTemplate(bars, ind, ctx.rsPct?.[t], t, P);
  const vcp = detectVcp(bars, ind.volAvg, t, P);
  const execDate = bars.date[t + 1] || null;
  const sepa = execDate ? evaluateSepa(ctx.fund, execDate, ctx.splitRatio, P) : { ok: false, ruleId: 'MR-SEPA-00', reason: 'NO_NEXT_SESSION', facts: null };
  const passed = [universe.ok, tt.ok, vcp.ok, sepa.ok].filter(Boolean).length;
  return {
    date: bars.date[t], universe, trend: { ok: tt.ok, rules: tt.rules, facts: tt.facts },
    vcp: { ok: vcp.ok, reason: vcp.reason, baseLength: vcp.baseLength ?? null, contractions: (vcp.contractions || []).map((c) => c.depth), firstDepth: vcp.firstDepth ?? null, baseDepthClass: vcp.baseDepthClass ?? null, volumeRatio: vcp.volumeRatio ?? null, stopPct: vcp.stopPct ?? null, pivot: vcp.pivot ?? null, pivotDate: Number.isInteger(vcp.pivotIndex) ? bars.date[vcp.pivotIndex] : null },
    sepa: { ok: sepa.ok, ruleId: sepa.ruleId, reason: sepa.reason, facts: sepa.facts },
    passed,
  };
}

// Mechanische Erstzuordnung der Fehlerkategorie aus den blockierenden Schichten (Praeregistrierung + Nachtrag A1).
// tags: Fall-Kennzeichen (z. B. FOREIGN_PRIVATE_ISSUER_NO_10Q, PARTNERSHIP_UNITS).
export const SEPA_DATA_RULES = new Set(['MR-SEPA-00', 'MR-PIT-01']);
export function sepaIsDataGap(sepa) { return SEPA_DATA_RULES.has(sepa.ruleId) || sepa.reason === 'SEPA_ACCEL_NOT_DEMONSTRABLE' || sepa.reason === 'NO_NEXT_SESSION'; }
export function attribute(layers, tags = []) {
  const out = [];
  if (!layers.universe.ok) out.push({ category: 'DATA_DEFINITION_MISMATCH', layer: 'MR-UNI-01', detail: layers.universe.rawCloseOk ? 'DOLLAR_VOLUME' : 'RAW_CLOSE' });
  if (!layers.trend.ok) for (const [id, ok] of Object.entries(layers.trend.rules)) if (!ok) out.push({ category: 'TREND_MISMATCH', layer: id });
  if (!layers.vcp.ok) out.push({ category: layers.vcp.reason === 'DATA_GAP' ? 'DATA_MISSING' : 'VCP_MISMATCH', layer: 'VCP', detail: layers.vcp.reason });
  if (!layers.sepa.ok) {
    const s = layers.sepa, structural = tags.includes('FOREIGN_PRIVATE_ISSUER_NO_10Q') || tags.includes('PARTNERSHIP_UNITS');
    if (sepaIsDataGap(s)) out.push({ category: structural ? 'DATA_DEFINITION_MISMATCH' : 'DATA_MISSING', layer: s.ruleId, detail: s.reason, fundamentals: 'DATA' });
    else if (s.reason === 'SEPA_BASE_NOT_POSITIVE') out.push({ category: 'FUNDAMENTAL_MISMATCH', layer: s.ruleId, detail: s.reason, fundamentals: 'RULE', also: ['EPS_DEFINITION_GAAP_VS_ADJUSTED_POSSIBLE', 'PRE_PROFIT_SCOPE'] });
    else out.push({ category: 'FUNDAMENTAL_MISMATCH', layer: s.ruleId, detail: s.reason, fundamentals: 'RULE' });
  }
  return out;
}

// Signale der Engine: Setup an t (scanSegment) und Hoch[t+1] > Pivot (MR-ENT-01). Rueckgabe: Signaltage (Index t+1).
export function engineSignals(ctx, setups) {
  const out = [];
  for (const [t, s] of setups) if (t + 1 < ctx.bars.date.length && ctx.bars.high[t + 1] > s.pivot) out.push({ setupIndex: t, signalIndex: t + 1, pivot: s.pivot, stopPct: s.stopPct });
  return out.sort((a, b) => a.signalIndex - b.signalIndex);
}

// Fall auswerten. spec: {anchorDate|null, window:[from,to]|null, documentedPivot|null, classGroup:'POSITIVE'|'NEGATIVE'}.
export function replayCase(ctx, spec, P) {
  const { bars } = ctx;
  const n = bars.date.length;
  const ind = prepareIndicators(bars, P);
  const dv = dollarVolume(bars.close, bars.volume, P['uni.dollarVolumeSessions']);
  const scan = scanSegment(ctx, P);
  const signals = engineSignals(ctx, scan.setups);
  let tStar, searchFrom, searchTo, D = null, mode;
  if (spec.anchorDate) {
    mode = 'ANCHOR';
    D = indexOnOrAfter(bars.date, spec.anchorDate);
    if (D < 1) return { decision: 'NOT_EVALUABLE', reason: 'ANCHOR_OUTSIDE_SERIES' };
    tStar = D - 1; searchFrom = D - DETECTION_TOLERANCE; searchTo = D + DETECTION_TOLERANCE;
  } else if (spec.window) {
    mode = 'WINDOW';
    const a = indexOnOrAfter(bars.date, spec.window[0]), b = indexOnOrBefore(bars.date, spec.window[1]);
    if (a < 1 || b < a) return { decision: 'NOT_EVALUABLE', reason: 'WINDOW_OUTSIDE_SERIES' };
    searchFrom = a; searchTo = b;
    // t* = Schluss im Fenster (Setup-Schluesse a-1 .. b-1) mit den meisten bestandenen Schichten; Gleichstand -> fruehester.
    let best = -1, bestPassed = -1;
    for (let t = a - 1; t <= b - 1; t++) { const l = layersAt(ctx, ind, dv, t, P); if (l.passed > bestPassed) { bestPassed = l.passed; best = t; } }
    tStar = best;
  } else return { decision: 'NOT_EVALUABLE', reason: 'NO_ANCHOR' };
  if (tStar < 252) return { decision: 'NOT_EVALUABLE', reason: 'HISTORY_TOO_SHORT', history: tStar };
  const layers = layersAt(ctx, ind, dv, tStar, P);
  const inRange = signals.filter((s) => s.signalIndex >= searchFrom && s.signalIndex <= searchTo);
  let nearest = null;
  if (inRange.length) {
    const ref = mode === 'ANCHOR' ? D : null;
    nearest = ref === null ? inRange[0] : inRange.reduce((a, b) => (Math.abs(b.signalIndex - ref) < Math.abs(a.signalIndex - ref) ? b : a));
  }
  const offset = nearest && mode === 'ANCHOR' ? nearest.signalIndex - D : null;
  // Naechstes Engine-Signal ausserhalb der Toleranz (zu frueh / zu spaet / nie) - nur Diagnose, keine Erkennung.
  const ref = mode === 'ANCHOR' ? D : searchFrom;
  const anyNearest = signals.length ? signals.reduce((a, b) => (Math.abs(b.signalIndex - ref) < Math.abs(a.signalIndex - ref) ? b : a)) : null;
  const detected = !!nearest;
  const setupAtTStar = scan.setups.has(tStar);
  // Pivot-Vergleich: VU-Pivot auf damaligen Rohpreis umgerechnet (pivot x rawClose/close am Setup-Schluss).
  let pivotCmp = null;
  const pivSrc = nearest ? { t: nearest.setupIndex, pivot: nearest.pivot } : (layers.vcp.pivot ? { t: tStar, pivot: layers.vcp.pivot } : null);
  if (spec.documentedPivot && pivSrc) {
    const raw = pivSrc.pivot * (ctx.rawClose[pivSrc.t] / bars.close[pivSrc.t]);
    pivotCmp = { pctDeviation: raw / spec.documentedPivot - 1, source: nearest ? 'SIGNAL' : 'VCP_AT_TSTAR' };
  }
  const decision = spec.classGroup === 'NEGATIVE' ? (detected ? 'FALSE_POSITIVE' : 'CORRECT_REJECT') : (detected ? 'DETECTED' : 'REJECTED');
  return {
    decision, mode, evaluatedClose: bars.date[tStar], anchorDate: D !== null ? bars.date[D] : null,
    detected, setupAtTStar, signalsInRange: inRange.length,
    nearestSignalAnyDistance: anyNearest ? { offsetSessions: anyNearest.signalIndex - ref, date: bars.date[anyNearest.signalIndex] } : null,
    timing: { offsetSessions: offset, class: mode === 'ANCHOR' ? timingClass(offset) : (detected ? 'IN_WINDOW' : 'MISS'), signalDate: nearest ? bars.date[nearest.signalIndex] : null },
    pivot: pivotCmp,
    layers: { ...layers, vcp: { ...layers.vcp, pivot: undefined } }, // Preise nicht in die oeffentliche Ausgabe
    attribution: detected ? [] : attribute(layers, spec.tags || []),
    segmentSignalsTotal: signals.length,
  };
}

// Jahrestrichter wie scanSegment (gleiche Reihenfolge und Bedingungen), je Kalenderjahr des Ausfuehrungstags t+1
// gezaehlt (der erste bewertete Schluss liegt vor dem Fenster, seine Order im Fenster).
export function yearlyFunnel(ctx, P, { fromIndex = 0, toDate = null, keyOf = (d) => d.slice(0, 4) } = {}) {
  const { bars } = ctx;
  const n = bars.date.length;
  const ind = prepareIndicators(bars, P);
  const dv = dollarVolume(bars.close, bars.volume, P['uni.dollarVolumeSessions']);
  const years = {};
  const y = (t) => (years[keyOf(bars.date[t + 1])] ||= { evaluated: 0, universe: 0, trend: 0, vcp: 0, setups: 0, signals: 0 });
  for (let t = Math.max(0, fromIndex - 1); t < n - 1; t++) {
    if (toDate && bars.date[t + 1] > toDate) break;
    const Y = y(t); Y.evaluated++;
    if (!(ctx.rawClose[t] >= P['uni.minRawClose']) || !(dv[t] >= P['uni.minDollarVolume20'])) continue;
    Y.universe++;
    if (!trendTemplate(bars, ind, ctx.rsPct?.[t], t, P).ok) continue;
    Y.trend++;
    const v = detectVcp(bars, ind.volAvg, t, P);
    if (!v.ok) continue;
    Y.vcp++;
    if (!evaluateSepa(ctx.fund, bars.date[t + 1], ctx.splitRatio, P).ok) continue;
    Y.setups++;
    if (bars.high[t + 1] > v.pivot) Y.signals++;
  }
  return years;
}

// Deterministische Kontrollauswahl (Seed = SHA-256 der case_id): Fisher-Yates mit xorshift aus dem Hash.
export function seededSample(items, k, seedHex) {
  let s = BigInt('0x' + seedHex.slice(0, 16)) || 1n;
  const next = () => { s ^= (s << 13n) & 0xffffffffffffffffn; s ^= s >> 7n; s ^= (s << 17n) & 0xffffffffffffffffn; return Number(s % 4294967296n) / 4294967296; };
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, k);
}
