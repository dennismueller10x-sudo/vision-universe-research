// Minervini Adaptation 1.1.0 – Diagnose (NUR Messung). Erklaert, WARUM ein Ergebnis entsteht; aendert nichts an der Engine.
// Alle Schwellen hier sind Messkonventionen der Diagnose, keine Strategiezahlen (keine Wirkung auf Signale oder Trades).
import { sizeOrder } from '../minervini/portfolio-policy.mjs';
import { withMaxPositionPct } from './params.mjs';

export const EXPOSURE_BUCKETS = Object.freeze([[0, 0.25], [0.25, 0.5], [0.5, 0.75], [0.75, 1.0000001]]);
export const NEARLY_FULL = 0.95;            // "praktisch voll investiert"
export const POST_EXIT_SESSIONS = 252;      // Beobachtungsfenster nach dem Ausstieg
export const POST_EXIT_THRESHOLDS = Object.freeze([0.25, 0.5, 1.0]);
export const FORWARD_HORIZONS = Object.freeze([21, 63, 126]);
const EPS = 1e-9;

const median = (xs) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b), k = s.length; return k % 2 ? s[(k - 1) / 2] : (s[k / 2 - 1] + s[k / 2]) / 2; };
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const inc = (o, k, v) => { o[k] = (k in o ? o[k] : 0) + v; };

// 1. Exposure und Positionen aus der Tageskurve (exposure = Positionswert / Kapital zum Schluss).
export function exposureDiagnostics(curve) {
  const exp = curve.map((c) => c.exposure), pos = curve.map((c) => c.positions);
  const buckets = EXPOSURE_BUCKETS.map(([a, b]) => ({ from: a, to: Math.min(b, 1), shareOfDays: exp.filter((x) => x >= a && x < b).length / exp.length }));
  const sizes = curve.filter((c) => c.positions > 0).map((c) => c.exposure / c.positions);
  const stage = {};
  for (const c of curve) if (c.stage) inc(stage, c.stage, 1 / curve.length);
  return {
    days: curve.length, grossExposureMean: mean(exp), grossExposureMedian: median(exp), buckets,
    shareNearlyFull: exp.filter((x) => x >= NEARLY_FULL).length / exp.length, shareZero: exp.filter((x) => x <= EPS).length / exp.length,
    positionsMean: mean(pos), positionsMedian: median(pos), positionSizeMean: mean(sizes), positionSizeMedian: median(sizes),
    cashShareMean: mean(exp.map((x) => 1 - x)), stageShareOfDays: stage,
  };
}

// 2. Bargeld nach dominanter Bindung des Tages. Je Tag wird der Bargeldanteil (1 - Exposure zum Schluss) genau einem
// Grund zugeordnet (Diagnose-Konvention, Reihenfolge der Pruefung = Reihenfolge der Liste):
//   NO_SIGNAL         keine Order fuer den Tag (kein Setup am Vortag)
//   OTHER_RULES       Orders vorhanden, aber alle durch Haltebestand / neue Basis nach Ausstieg (MR-RE-01) ausgeschlossen
//   POSITION_COUNT    nicht reservierte Order, weil die Positionszahl (MR-PF-01) erreicht war
//   START_EXPOSURE    Startstufe bindet: Exposure-Obergrenze 25 % erreicht oder Position auf 5 % gekappt (MR-PF-02)
//   EXPOSURE_CEILING  volle Stufe: Obergrenze 100 % erreicht (nur bei Bargeld 0 relevant)
//   CASH_FUNDING      Bargeld zum Vortagesschluss reichte nicht (keine Gleichtagsfinanzierung, MR-EXE-01)
//   POSITION_CAP      volle Stufe: Position auf 25 % gekappt (MR-SIZ-02)
//   RISK              Position durch 1,25 % Risiko kleiner als die Gewichtsgrenze (MR-SIZ-01)
//   NOT_TRIGGERED     reservierte Orders loesten nicht aus (Hoch unter Pivot) – zaehlt zu "fehlende Signale"
// day: Protokoll aus portfolio-sim (onDay), curvePoint: Kurvenpunkt desselben Tages.
export function classifyCashDay(day, P) {
  if (!day.rawOrders) return 'NO_SIGNAL';
  if (!day.candidates) return 'OTHER_RULES';
  const Ps = withMaxPositionPct(P, day.maxPositionPct);
  const pilot = day.stage === 'PILOT';
  if (day.reserved.length < day.candidates) {
    if (day.openCount + day.reserved.length >= P['pf.maxPositions']) return 'POSITION_COUNT';
    const used = day.openValue + day.reserved.reduce((a, r) => a + r.shares * r.price, 0);
    const room = day.ceiling * day.equity - used;
    const cashLeft = day.cash - day.reserved.reduce((a, r) => a + r.shares * r.price, 0) * (1 + P['exe.commissionBps'] / 1e4);
    if (room <= cashLeft) return pilot ? 'START_EXPOSURE' : 'EXPOSURE_CEILING';
    return 'CASH_FUNDING';
  }
  if (!day.filled) return 'NOT_TRIGGERED';
  let capped = false;
  for (const r of day.reserved) { const s = sizeOrder({ equity: day.equity, pivot: r.pivot, stop: r.stop, unit: r.unit }, Ps); if (!s.byRisk) capped = true; }
  if (capped) return pilot ? 'START_EXPOSURE' : 'POSITION_CAP';
  return 'RISK';
}

export function cashAttribution(days, curve, P) {
  const byDate = new Map(curve.map((c) => [c.date, c]));
  const cash = {}, count = {};
  let total = 0;
  for (const d of days) {
    const c = byDate.get(d.date);
    if (!c) continue;
    const reason = classifyCashDay(d, P), share = 1 - c.exposure;
    inc(cash, reason, share); inc(count, reason, 1); total += share;
  }
  const out = {};
  for (const k of Object.keys(cash)) out[k] = { shareOfCash: total > 0 ? cash[k] / total : null, days: count[k] };
  const group = (ks) => ks.reduce((a, k) => a + (k in out ? out[k].shareOfCash : 0), 0);
  return { byReason: out, groups: { missingSignals: group(['NO_SIGNAL', 'NOT_TRIGGERED']), startExposureRule: group(['START_EXPOSURE']), positionLimits: group(['POSITION_COUNT', 'POSITION_CAP', 'EXPOSURE_CEILING']), risk: group(['RISK']), otherRules: group(['OTHER_RULES', 'CASH_FUNDING']) } };
}

// 3. Herkunft der Ausstiegsregeln (fuer die Frage: schneidet eine belegte Regel oder unsere Formalisierung Gewinner ab?).
// Klasse = schwaechste Herkunft der Regel und ihrer Parameter (ORIGINAL < ORIGINAL_INTERPRETATION < VU_FORMALIZATION).
const RANK = ['ORIGINAL', 'ORIGINAL_INTERPRETATION', 'VU_FORMALIZATION', 'VU_OWN'];
export function exitRuleProvenance(rulebook) {
  const out = {};
  for (const r of rulebook.rules) {
    let k = RANK.includes(r.provenanceClass) ? r.provenanceClass : 'ORIGINAL';
    for (const p of Object.values(r.formalization.parameters)) if (RANK.indexOf(p.provenance) > RANK.indexOf(k)) k = p.provenance;
    out[r.id] = k;
  }
  out['MR-EXE-04-DELIST'] = 'VU_OWN'; out.OPEN_AT_END_MARK = 'MEASUREMENT';
  return out;
}

// 4. Entwicklung nach dem Ausstieg. exits: [{seg, exitIndex, exitPrice, entryPrice, finalRule, partial}] auf
// bereinigten Kursen desselben Segments; Fenster endet am Segmentende (Delisting) – Abdeckung wird mitgezaehlt.
export function postExitDiagnostics(exits, segById, provenanceOf) {
  const agg = (list) => {
    const o = { n: list.length, fullWindow: 0, laterAboveExit: {}, laterAboveEntry: {}, fwdAboveExitMean: null };
    for (const t of POST_EXIT_THRESHOLDS) { o.laterAboveExit[t] = 0; o.laterAboveEntry[t] = 0; }
    const fwd = [];
    for (const x of list) {
      const s = segById.get(x.seg);
      const end = Math.min(s.close.length - 1, x.exitIndex + POST_EXIT_SESSIONS);
      if (x.exitIndex + POST_EXIT_SESSIONS <= s.close.length - 1) o.fullWindow++;
      let mx = -Infinity;
      for (let i = x.exitIndex + 1; i <= end; i++) if (Number.isFinite(s.high[i])) mx = Math.max(mx, s.high[i]);
      if (!Number.isFinite(mx)) continue;
      for (const t of POST_EXIT_THRESHOLDS) { if (mx >= x.exitPrice * (1 + t)) o.laterAboveExit[t]++; if (mx >= x.entryPrice * (1 + t)) o.laterAboveEntry[t]++; }
      if (Number.isFinite(s.close[end])) fwd.push(s.close[end] / x.exitPrice - 1);
    }
    o.fwdAboveExitMean = mean(fwd);
    return o;
  };
  const byRule = {}, byProv = {};
  for (const x of exits) { (byRule[x.finalRule] ||= []).push(x); (byProv[provenanceOf[x.finalRule] || 'UNKNOWN'] ||= []).push(x); }
  return {
    window: POST_EXIT_SESSIONS, all: agg(exits),
    byFinalRule: Object.fromEntries(Object.entries(byRule).map(([k, v]) => [k, { provenance: provenanceOf[k] || 'UNKNOWN', ...agg(v) }])),
    byProvenance: Object.fromEntries(Object.entries(byProv).map(([k, v]) => [k, agg(v)])),
    partialThenStopped: agg(exits.filter((x) => x.partial)),
  };
}

// 5. Signalqualitaet: Vorwaertsrendite ab Einstieg ueber feste Horizonte gegen SPY (gleiche Tage), MFE/MAE.
// sig: {seg, entryIndex, entryPrice}; spyByDate: Map(date -> Gesamtrenditeindex).
export function forwardReturns(sigs, segById, spyByDate) {
  const out = {};
  for (const h of FORWARD_HORIZONS) {
    const ex = [], raw = [];
    for (const g of sigs) {
      const s = segById.get(g.seg), j = g.entryIndex + h;
      if (j >= s.close.length || !(g.entryPrice > 0)) continue;
      const r = s.close[j] / g.entryPrice - 1, a = spyByDate.get(s.date[g.entryIndex]), b = spyByDate.get(s.date[j]);
      raw.push(r);
      if (a > 0 && b > 0) ex.push(r - (b / a - 1));
    }
    out[h] = { n: raw.length, meanReturn: mean(raw), medianReturn: median(raw), meanExcessVsSpy: mean(ex), medianExcessVsSpy: median(ex), shareAboveSpy: ex.length ? ex.filter((x) => x > 0).length / ex.length : null };
  }
  return out;
}

// Oeffentliches Log: nur Struktur-, Zaehl- und Anteilswerte (keine Renditen oder Kurse; Nutzungsrechte wie R14).
export function publicDiagnostics(d) {
  const r = (x) => (x === null || x === undefined ? null : Math.round(x * 1000) / 1000);
  return {
    exposure: { mean: r(d.exposure.grossExposureMean), median: r(d.exposure.grossExposureMedian), buckets: d.exposure.buckets.map((b) => r(b.shareOfDays)), nearlyFull: r(d.exposure.shareNearlyFull), zero: r(d.exposure.shareZero), positionsMean: r(d.exposure.positionsMean), positionsMedian: d.exposure.positionsMedian, positionSizeMean: r(d.exposure.positionSizeMean), cashMean: r(d.exposure.cashShareMean), stage: Object.fromEntries(Object.entries(d.exposure.stageShareOfDays).map(([k, v]) => [k, r(v)])) },
    cash: Object.fromEntries(Object.entries(d.cash.groups).map(([k, v]) => [k, r(v)])),
    cashByReason: Object.fromEntries(Object.entries(d.cash.byReason).map(([k, v]) => [k, r(v.shareOfCash)])),
  };
}
export function publicExitCounts(pe) {
  const c = (o) => ({ n: o.n, fullWindow: o.fullWindow, aboveExit: o.laterAboveExit, aboveEntry: o.laterAboveEntry });
  return { all: c(pe.all), byFinalRule: Object.fromEntries(Object.entries(pe.byFinalRule).map(([k, v]) => [k, { provenance: v.provenance, ...c(v) }])), byProvenance: Object.fromEntries(Object.entries(pe.byProvenance).map(([k, v]) => [k, c(v)])) };
}
