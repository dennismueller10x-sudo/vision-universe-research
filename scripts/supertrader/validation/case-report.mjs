// Supertrader R10 - Auswertung der Fallpruefung (PREREGISTRATION-R10-CASES.json, causes).
// Reine Funktionen auf dem entschluesselten Ergebnis von case-study.mjs; keine Daten im Repository.

export const CAUSES = ['DATA_NOT_IN_UNIVERSE', 'DATA_GAP', 'PRICE_LIQUIDITY', 'NOT_CANDIDATE', 'NO_ENTRY', 'NOT_IN_PORTFOLIO', 'EARLY_EXIT', 'CAPTURED'];
const CANDIDATE = new Set(['SETUP', 'ENTRY_READY']);
const PRICE_LIQ = new Set(['RAW_GATE', 'RAW_PRICE', 'LIQ_DOLLAR_VOLUME', 'LIQ_ADR']);

// Haeufigkeit nicht erfuellter Regeln an Tagen ohne Kandidatenstufe.
export function blockingRules(days) {
  const n = {};
  for (const [, stage, failed] of days) if (!CANDIDATE.has(stage)) for (const r of (stage === 'RAW_GATE' ? ['RAW_GATE'] : failed)) n[r] = (n[r] || 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1]);
}

// Eine Hauptursache je Fall und Methode, Reihenfolge laut Protokoll.
// trace: case-study traces[seg][engine]; trades: portfolios[engine].cases[seg]; gain: Episode-Anstieg.
export function classify(trace, trades, gain) {
  if (!trace) return { cause: 'DATA_NOT_IN_UNIVERSE' };
  const [ws, we] = trace.episode;
  const out = { blocking: blockingRules(trace.days).slice(0, 5) };
  if (trace.gaps > 5 || trace.segEnd < we) return { ...out, cause: 'DATA_GAP', gaps: trace.gaps, segEnd: trace.segEnd };
  const days = trace.days;
  if (days.length && days.every(([, st, f]) => !CANDIDATE.has(st) && (st === 'RAW_GATE' || (f.length && f.every((x) => PRICE_LIQ.has(x)))))) return { ...out, cause: 'PRICE_LIQUIDITY' };
  const inWin = (trades || []).filter((t) => t.entry.date >= trace.window[0] && t.entry.date <= we);
  const firstCand = days.find(([, st]) => CANDIDATE.has(st));
  out.firstCandidate = firstCand ? firstCand[0] : null;
  if (!firstCand && !inWin.length) return { ...out, cause: 'NOT_CANDIDATE' };
  if (!inWin.length) {
    const inv = (trace.signals || []).flatMap((s) => s.transitions.filter((x) => x[1] === 'INVALIDATED').map((x) => x[2]));
    const n = {}; for (const r of inv) n[r] = (n[r] || 0) + 1;
    return { ...out, cause: 'NO_ENTRY', invalidations: Object.entries(n).sort((a, b) => b[1] - a[1]) };
  }
  const taken = inWin.filter((t) => t.taken);
  out.entries = inWin.map((t) => ({ date: t.entry.date, taken: t.taken, skip: t.skipReason, weight: t.weightAtEntry, ret: t.returnPct, exit: t.exits.length ? [t.exits[t.exits.length - 1].date, t.exits[t.exits.length - 1].ruleId] : null, sameDayRank: t.sameDayRank, sameDayCount: t.sameDayCount }));
  if (!taken.length) return { ...out, cause: 'NOT_IN_PORTFOLIO', skipReasons: [...new Set(inWin.map((t) => t.skipReason))] };
  const compounded = taken.reduce((a, t) => a * (1 + (t.returnPct ?? 0)), 1) - 1;
  out.captured = gain > 0 ? compounded / gain : null;
  out.tradeReturn = compounded;
  out.smallWeight = taken.every((t) => (t.weightAtEntry ?? 0) < 0.05);
  out.maxWeight = Math.max(...taken.map((t) => t.weightAtEntry ?? 0));
  return { ...out, cause: out.captured !== null && out.captured >= 0.25 ? 'CAPTURED' : 'EARLY_EXIT' };
}

// Zaehlung je Methode und Rolle.
export function tally(rows) {
  const t = {};
  for (const r of rows) {
    const k = `${r.engine}|${r.role}`;
    const x = t[k] ||= Object.fromEntries(CAUSES.map((c) => [c, 0]));
    x[r.cause]++;
  }
  return t;
}
