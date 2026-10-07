// Supertrader — VU Trendfolge 52W live (Runde 12, PREREGISTRATION-R12): Modelldepot mit Ledger.
//
// Das Ledger (data/ledger/VU_TREND_52W.json) speichert den Zustand (Bargeld, Positionen, offene
// Modellorders) und alle Transaktionen. Jeder Lauf verarbeitet nur neue Handelstage ab dem letzten
// Stand - fruehere Entscheidungen werden nie neu gerechnet (Datenrevisionen aendern sie nicht).
// Start: Die erste Monatsentscheidung faellt am ersten Monatsende nach dem Live-Start; vorher zeigt
// das Produkt nur die vorbereitete Rangliste. Keine Rueckrechnung (kein verdeckter Backtest).
//
// Veroeffentlicht werden Zusammensetzung, Gewichte, Orders, Gruende und Ergebnisse einzelner
// abgeschlossener Trades - keine Gesamtrendite und keine Kurve (Rechte an abgeleiteten Kennzahlen).
import { simulateRotation, metricsAt, buyReasons, PARAMS, VERSION } from './engine/rotation-52w.mjs';

export const TREND52_SCHEMA = 'supertrader-trend52-1.0.0';
export const RULE_TEXT = {
  'TR52-LIQ': 'Tagesumsatz unter 1 Mio. USD',
  'TR52-PERF': 'weniger als 100 % über dem 52-Wochen-Tief',
  'TR52-HIGH20': 'kein neues 52-Wochen-Hoch in den letzten 20 Handelstagen',
  'TR52-GAP': 'keine Kurslücke von mindestens 6 % in den letzten 20 Handelstagen',
  'TR52-SELL-WEIGHT': 'Gewicht unter 3 % – Position zu klein',
  'TR52-SELL-PERF': 'weniger als 100 % über dem 52-Wochen-Tief',
  'TR52-SELL-STALE': 'kein neues 52-Wochen-Hoch in 65 Handelstagen',
  'TR52-CAP-MARKET': 'Marktampel rot: Position auf höchstens 5 % reduziert',
  'TR52-TRIM': 'Gewicht über 20 %: auf 15 % reduziert',
  'TR52-SELL-MARKET': 'Marktampel rot',
  DELISTED: 'Notierung beendet',
  NO_SLOT: 'kein freier Platz – alle 10 Plätze belegt oder Rang zu niedrig',
  MARKET_FILTER: 'Marktampel rot – keine Neukäufe',
  NO_CASH: 'zu wenig Bargeld für eine Position von mindestens 3 %',
  NO_BAR: 'kein Kurs am Ausführungstag',
};

const r4 = (v) => (Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : null);
function nextMonthBounds(asOf) {
  // Naechster Entscheidungstermin = letzter Werktag des laufenden Monats (Feiertage nicht bekannt -> "voraussichtlich").
  const d = new Date(asOf + 'T00:00:00Z');
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  while (last.getUTCDay() % 6 === 0) last.setUTCDate(last.getUTCDate() - 1);
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  while (first.getUTCDay() % 6 === 0) first.setUTCDate(first.getUTCDate() + 1);
  return { decision: last.toISOString().slice(0, 10), execution: first.toISOString().slice(0, 10) };
}

export function emptyLedger(asOf) {
  return { schema: 'supertrader-ledger-trend52-1.0.0', strategyId: 'VU_TREND_52W', version: VERSION, variant: 'PP', rank: 'CLENOW', liveSince: asOf, initialEquity: 100000,
    state: { cash: 100000, positions: [], pending: null, lastPx: {}, lastDate: asOf }, trades: [], decisions: [], notTaken: [], executions: [] };
}

// instruments: Map(symbol -> { symbol, bars:{date,open,high,low,close,volume} }); spy: {date[], close[]}
export function runTrend52Live({ instruments, spy, ledger, asOf }) {
  const L = ledger || emptyLedger(asOf);
  const stocks = [...instruments.values()].filter((i) => i.bars && i.bars.open && i.bars.date.length).map((i) => ({ id: i.symbol, symbol: i.symbol, bars: i.bars }));
  const cal = spy.date.filter((d) => d <= asOf);
  const from = cal.find((d) => d > L.state.lastDate);
  let r = null;
  if (from) {
    r = simulateRotation(stocks, cal, spy, { variant: L.variant, rank: L.rank, from, to: asOf, state: L.state, startDate: L.liveSince, preview: true });
    L.trades.push(...r.trades);
    L.decisions.push(...r.decisions);
    L.notTaken.push(...r.skipped.map((x) => ({ date: x.date, symbol: x.listingId, reason: x.reason })));
    const before = new Map((L.state.positions || []).map((q) => [q.listingId, q.exits.length]));
    for (const q of r.state.positions) { const n0 = before.get(q.listingId); if (n0 === undefined) L.executions.push({ date: q.entryDate, symbol: q.listingId, side: 'BUY', price: q.entryPrice, weight: q.weightAtEntry, rank: q.rankAtEntry }); for (const x of q.exits.slice(n0 || 0)) L.executions.push({ date: x.date, symbol: q.listingId, side: 'SELL', price: x.price, fraction: x.fraction, ruleId: x.ruleId }); }
    for (const t of r.trades) { const n0 = before.get(t.listingId); if (n0 === undefined) L.executions.push({ date: t.entry.date, symbol: t.listingId, side: 'BUY', price: t.entry.price, weight: t.weightAtEntry, rank: t.rankAtEntry }); for (const x of t.exits.slice(n0 || 0)) L.executions.push({ date: x.date, symbol: t.listingId, side: 'SELL', price: x.price, fraction: x.fraction, ruleId: x.ruleId }); }
    L.state = r.state;
  } else {
    r = simulateRotation(stocks, cal, spy, { variant: L.variant, rank: L.rank, from: asOf, to: asOf, state: L.state, previewOnly: true, preview: true });
  }
  L.lastProcessed = asOf;
  return { ledger: L, preview: r.preview, stocks };
}

// Ausgabe fuer das Produkt (data/trend52.json).
export function trend52View({ ledger, preview, stocks, spy, asOf }) {
  const byId = new Map(stocks.map((s) => [s.id, s]));
  const at = (sym) => { const s = byId.get(sym); if (!s) return null; const i = s.bars.date.lastIndexOf(asOf) >= 0 ? s.bars.date.lastIndexOf(asOf) : s.bars.date.length - 1; return { s, i }; };
  const si = spy.date.lastIndexOf(asOf); let ma = null;
  if (si >= PARAMS.spyMaDays - 1) { let x = 0; for (let k = si - PARAMS.spyMaDays + 1; k <= si; k++) x += spy.close[k]; ma = x / PARAMS.spyMaDays; }
  const green = ma != null ? spy.close[si] > ma : null;
  const st = ledger.state;
  let mv = 0;
  const positions = st.positions.map((q) => {
    const a = at(q.listingId); const px = a ? a.s.bars.close[a.i] : st.lastPx[q.listingId] ?? q.entryPrice; mv += q.shares * px;
    const m = a ? metricsAt(a.s.bars, a.i) : null;
    return { symbol: q.listingId, entryDate: q.entryDate, entryPrice: r4(q.entryPrice), lastPrice: r4(px), shares: r4(q.shares), rankAtEntry: q.rankAtEntry, weightAtEntry: r4(q.weightAtEntry), exits: q.exits.map((x) => ({ date: x.date, ruleId: x.ruleId, text: RULE_TEXT[x.ruleId] || x.ruleId, fraction: r4(x.fraction) })),
      perfSinceLow: m ? r4(m.perf) : null, freshHigh65: m ? m.freshHigh65 : null, holdChecks: m ? { perf: m.perf >= 1, freshHigh: m.freshHigh65 } : null };
  });
  const equity = st.cash + mv;
  for (const p of positions) p.weight = r4((p.shares * p.lastPrice) / equity);
  positions.sort((a, b) => b.weight - a.weight);
  const held = new Set(st.positions.map((q) => q.listingId));
  const free = PARAMS.slots - held.size;
  const cands = (preview?.candidates || []).slice(0, 25).map((c, k) => ({ symbol: c.symbol, rank: c.rank, score: r4(c.score), perfSinceLow: r4(c.perf), wouldGetSlot: green === true && k < free }));
  // Knapp verfehlt: liquide Titel, die genau eine Kaufregel verfehlen (hoechste Trendstaerke zuerst)
  const near = [];
  const dv = [];
  for (const s of stocks) { const i = s.bars.date.lastIndexOf(asOf); if (i < PARAMS.lookback) continue; let x = 0; for (let k = i - PARAMS.advDays + 1; k <= i; k++) x += s.bars.close[k] * (s.bars.volume[k] || 0); dv.push({ s, i, adv63: x / PARAMS.advDays }); }
  dv.sort((a, b) => b.adv63 - a.adv63);
  for (const r of dv.slice(0, PARAMS.universeSize)) {
    if (held.has(r.s.id)) continue;
    const m = metricsAt(r.s.bars, r.i); if (!m) continue;
    const why = buyReasons(m, PARAMS.variants.PP);
    if (why.length === 1 && m.perf >= 0.7) near.push({ symbol: r.s.id, missing: why[0], text: RULE_TEXT[why[0]], perfSinceLow: r4(m.perf), score: r4(m.clenow) });
  }
  near.sort((a, b) => (b.score ?? -9) - (a.score ?? -9));
  const sched = nextMonthBounds(asOf);
  const lastDecision = ledger.decisions[ledger.decisions.length - 1] || null;
  return {
    schema: TREND52_SCHEMA, strategyId: 'VU_TREND_52W', version: ledger.version, variant: ledger.variant, asOf, liveSince: ledger.liveSince,
    market: { spyClose: r4(spy.close[si]), spyMa200: r4(ma), green, text: green === true ? 'Grün: SPY über seinem 200-Tage-Durchschnitt – Neukäufe erlaubt.' : green === false ? 'Rot: SPY unter seinem 200-Tage-Durchschnitt – keine Neukäufe, Positionen höchstens 5 %.' : 'Unbekannt' },
    schedule: { nextDecision: sched.decision, nextExecution: sched.execution, note: 'Entscheidung nach Handelsschluss am letzten Handelstag des Monats, Ausführung zur Eröffnung am ersten Handelstag des Folgemonats (Termine voraussichtlich, Feiertage nicht berücksichtigt).' },
    portfolio: { cashPct: r4(st.cash / equity), investedPct: r4(mv / equity), slots: PARAMS.slots, used: held.size, positions },
    orders: st.pending ? { decidedOn: lastDecision?.date || null, executesAt: 'Eröffnung des nächsten Handelstags', buys: st.pending.buys.map((b) => ({ symbol: b.listingId, rank: b.rank })), sells: st.pending.sells.map((x) => ({ symbol: x.listingId, ruleId: x.ruleId, text: RULE_TEXT[x.ruleId] || x.ruleId, target: x.target })) } : null,
    prepared: { asOf, free: Math.max(0, free), green, candidates: cands, sellsIfToday: (preview?.sells || []).map((x) => ({ symbol: x.listingId, ruleId: x.ruleId, text: RULE_TEXT[x.ruleId] || x.ruleId, target: x.target })), note: 'Rangliste mit dem heutigen Schlusskurs. Verbindlich ist erst die Entscheidung am Monatsende.' },
    nearMisses: near.slice(0, 12),
    closed: ledger.trades.slice().reverse().slice(0, 60).map((t) => ({ symbol: t.listingId, entryDate: t.entry.date, exitDate: t.exits[t.exits.length - 1]?.date || null, exitRuleId: t.exits[t.exits.length - 1]?.ruleId || null, exitText: RULE_TEXT[t.exits[t.exits.length - 1]?.ruleId] || null, returnPct: r4(t.returnPct) })),
    notTaken: ledger.notTaken.slice(-60).reverse().map((x) => ({ ...x, text: RULE_TEXT[x.reason] || x.reason })),
    decisions: ledger.decisions.slice(-12).reverse().map((d) => ({ date: d.date, green: d.green, candidates: d.candidates, buys: d.buys.map((b) => b.listingId), sells: d.sells.map((s) => ({ symbol: s.listingId, ruleId: s.ruleId, text: RULE_TEXT[s.ruleId] || s.ruleId })) })),
    executions: ledger.executions.slice(-80).reverse().map((x) => ({ ...x, price: r4(x.price), text: x.ruleId ? RULE_TEXT[x.ruleId] || x.ruleId : null })),
    publication: 'Zusammensetzung, Orders, Gründe und Einzeltrades. Gesamtrendite und Kurve werden bis zur Klärung der Rechte an abgeleiteten Kennzahlen nicht veröffentlicht.',
  };
}
