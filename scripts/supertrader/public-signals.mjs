/**
 * Supertrader: öffentliche Sicht der Signale (Owner-Linie 05.11.2026, Plan §11, EINORDNUNG §0 L2).
 * Vision Universe zeigt keine Kauf- oder Verkaufsempfehlungen. Öffentlich bleiben Zustand, Datum und erfüllte Regeln
 * („erfüllt die Regel, Stand …“); keine Trigger-, Invalidierungs-, Stopp-, Limit-, Einstiegs- oder Ausstiegskurse,
 * kein Plan, kein anstehender Auftrag, keine Rendite je simuliertem Trade. Die Ledger (Zustand des Nachtlaufs) behalten
 * alles; diese Sicht entsteht nur beim Schreiben von signals.json, signals-core.json und stock/<SYM>.json.
 */
export const PUBLIC_SIGNALS_VERSION = 'supertrader-public-signals-1.0.0';

// ganze Teilobjekte eines Signals, die Order-, Stopp- oder Ergebnisgrößen tragen
export const DROP_SIGNAL_KEYS = Object.freeze(['levels', 'levelHistory', 'plan', 'entry', 'stop', 'initialStop', 'stopHistory', 'exits', 'order', 'result']);
// einzelne Kennzahlen, aus denen sich eine Order- oder Stoppmarke ergibt
export const DROP_FACT_KEYS = Object.freeze(['distanceToTrigger', 'nPct']);
// Felder der Zustandsübergänge, die ein Kurs sind
export const DROP_TRANSITION_KEYS = Object.freeze(['price', 'priceBasis', 'trigger', 'invalidation']);

export function publicSignal(x) {
  if (!x || typeof x !== 'object') return x;
  const out = {};
  for (const [k, v] of Object.entries(x)) {
    if (DROP_SIGNAL_KEYS.includes(k)) continue;
    if (k === 'facts' && v && typeof v === 'object') { out.facts = Object.fromEntries(Object.entries(v).filter(([j]) => !DROP_FACT_KEYS.includes(j))); continue; }
    if (k === 'transitions' && Array.isArray(v)) { out.transitions = v.map((t) => Object.fromEntries(Object.entries(t).filter(([j]) => !DROP_TRANSITION_KEYS.includes(j)))); continue; }
    if (k === 'confirmation' && v && typeof v === 'object') { out.confirmation = { date: v.date ?? null }; continue; }
    out[k] = v;
  }
  return out;
}

const LISTS = ['open', 'closed', 'invalidated', 'retired'];
export function publicSignals(signals) {
  const strategies = {};
  for (const [id, st] of Object.entries(signals.strategies || {})) {
    const c = { ...st };
    for (const k of LISTS) if (Array.isArray(st[k])) c[k] = st[k].map(publicSignal);
    if (st.scanner && typeof st.scanner === 'object') {
      c.scanner = { ...st.scanner };
      for (const k of ['top', 'watch', 'discovered']) if (Array.isArray(st.scanner[k])) c.scanner[k] = st.scanner[k].map(publicSignal);
    }
    strategies[id] = c;
  }
  return { ...signals, publicView: PUBLIC_SIGNALS_VERSION, strategies };
}

// Prüfung (Tests, DQ): kein Schlüssel der Sperrlisten in einer Signalliste
export function orderMarksIn(signals) {
  const hits = [];
  const check = (x, where) => {
    for (const k of DROP_SIGNAL_KEYS) if (x && k in x) hits.push(`${where}.${k}`);
    for (const k of DROP_FACT_KEYS) if (x?.facts && k in x.facts) hits.push(`${where}.facts.${k}`);
    for (const t of x?.transitions || []) for (const k of DROP_TRANSITION_KEYS) if (k in t) hits.push(`${where}.transitions.${k}`);
  };
  for (const [id, st] of Object.entries(signals.strategies || {})) {
    for (const k of LISTS) if (Array.isArray(st[k])) st[k].forEach((x, i) => check(x, `${id}.${k}[${i}]`));
    for (const k of ['top', 'watch', 'discovered']) if (Array.isArray(st.scanner?.[k])) st.scanner[k].forEach((x, i) => check(x, `${id}.scanner.${k}[${i}]`));
  }
  return hits;
}

/* ------------------------------------------------------------------------------------------------------------------
 * L3 (Owner-Linie 05.11.2026, Steuerung bestätigt): keine heutigen Bestände, kein Rein/Raus-Protokoll. Positionen und
 * abgeschlossene simulierte Trades erscheinen öffentlich erst mit Stichtag mindestens HOLDINGS_LAG_DAYS zurück und ohne
 * Kurse; Setups ohne Einstieg (Regel erfüllt, Stand …) bleiben sichtbar. Der volle Zustand (Ledger) liegt privat.
 * ---------------------------------------------------------------------------------------------------------------- */
export const HOLDINGS_LAG_DAYS = 365;
export const POSITION_STATES = Object.freeze(['TRIGGERED', 'ACTIVE', 'WARNING', 'EXIT']);
export const lagCutoff = (asOf) => new Date(Date.parse(asOf + 'T00:00:00Z') - HOLDINGS_LAG_DAYS * 864e5).toISOString().slice(0, 10);

/** Letztes Datum eines Eintrags (letzter Übergang, sonst letzter Ausstieg, sonst Entscheidungsdatum). */
export function lastDateOf(x) {
  return x?.transitions?.at(-1)?.date ?? x?.exits?.at(-1)?.date ?? x?.lastDecisionDate ?? x?.createdAt ?? null;
}
/** War der Eintrag je eine Position (Einstieg) oder ist er es? */
export const wasPosition = (x) => !!x && (POSITION_STATES.includes(x.state) || !!x.entry || (x.transitions || []).some((t) => POSITION_STATES.includes(t.state)));

/** Öffentlich zeigbar: kein offener Bestand; ein (früherer) Bestand nur, wenn sein letztes Datum <= cutoff. */
export function visibleAt(x, cutoff) {
  if (!wasPosition(x)) return true;
  if (POSITION_STATES.includes(x.state)) return false;
  const d = lastDateOf(x);
  return !!d && d <= cutoff;
}

export function publicSignalsLagged(signals) {
  const cutoff = lagCutoff(signals.asOf), base = publicSignals(signals), raw = signals.strategies || {};
  const strategies = {};
  for (const [id, st] of Object.entries(base.strategies)) {
    const c = { ...st };
    for (const k of LISTS) if (Array.isArray(raw[id]?.[k])) c[k] = raw[id][k].filter((x) => visibleAt(x, cutoff)).map(publicSignal);
    // Zähler bleiben (Zahl offener Positionen ist kein Bestand); die Listen tragen nur das Sichtbare
    if (Array.isArray(raw[id]?.closed)) { c.closedTotal = raw[id].closed.length; c.closedVisible = c.closed.length; }
    strategies[id] = c;
  }
  const hidden = new Set();
  for (const st of Object.values(raw)) for (const k of LISTS) for (const x of (Array.isArray(st[k]) ? st[k] : [])) if (!visibleAt(x, cutoff)) hidden.add(x.id);
  const bySymbol = {};
  for (const [sym, arr] of Object.entries(signals.bySymbol || {})) {
    const keep = arr.filter((e) => !POSITION_STATES.includes(e.state) && !(e.id && hidden.has(e.id)));
    if (keep.length) bySymbol[sym] = keep;
  }
  return { ...base, strategies, bySymbol, holdingsLagDays: HOLDINGS_LAG_DAYS, holdingsVisibleThrough: cutoff };
}

/** portfolio.json: Einstellungen und Zahl offener Positionen; abgeschlossene/nicht genommene erst nach 365 Tagen, ohne Kurse. */
export function publicPortfolio(p) {
  const cutoff = lagCutoff(p.asOf), strategies = {};
  for (const [id, s] of Object.entries(p.strategies || {})) {
    strategies[id] = {
      schema: s.schema, strategyId: s.strategyId, currentVersion: s.currentVersion, asOf: s.asOf, config: s.config, publication: s.publication, startDate: s.startDate,
      openCount: s.openCount ?? (s.positions || []).length, note: s.note,
      positions: [],
      closed: (s.closed || []).filter((c) => c.exitDate && c.exitDate <= cutoff).map((c) => ({ symbol: c.symbol, signalId: c.signalId, version: c.version, entryDate: c.entryDate, exitDate: c.exitDate, exitRuleId: c.exitRuleId })),
      closedTotal: (s.closed || []).length,
      notTaken: (s.notTaken || []).filter((n) => (n.entryDate || n.date) && (n.entryDate || n.date) <= cutoff).map((n) => ({ symbol: n.symbol, signalId: n.signalId, entryDate: n.entryDate ?? n.date, reason: n.reason })),
    };
  }
  return { schema: p.schema, asOf: p.asOf, publicView: PUBLIC_SIGNALS_VERSION, holdingsLagDays: HOLDINGS_LAG_DAYS, holdingsVisibleThrough: cutoff, strategies };
}

/** trend52.json: Ampel, Termine, Rangliste (ohne „bekäme einen Platz“), Fehlschläge; Bestand nur als Zahl, Protokoll nach 365 Tagen ohne Kurse. */
export function publicTrend52(t) {
  const cutoff = lagCutoff(t.asOf), old = (d) => !!d && d <= cutoff;
  return {
    schema: t.schema, strategyId: t.strategyId, version: t.version, variant: t.variant, asOf: t.asOf, liveSince: t.liveSince, market: t.market, schedule: t.schedule,
    publicView: PUBLIC_SIGNALS_VERSION, holdingsLagDays: HOLDINGS_LAG_DAYS, holdingsVisibleThrough: cutoff,
    portfolio: { slots: t.portfolio?.slots ?? null, used: t.portfolio?.used ?? (t.portfolio?.positions || []).length, positions: [] },
    orders: null,
    prepared: t.prepared ? { asOf: t.prepared.asOf, green: t.prepared.green, candidates: (t.prepared.candidates || []).map((c) => ({ symbol: c.symbol, rank: c.rank, score: c.score, perfSinceLow: c.perfSinceLow })) } : null,
    nearMisses: t.nearMisses,
    closed: (t.closed || []).filter((c) => old(c.exitDate)).map((c) => ({ symbol: c.symbol, entryDate: c.entryDate, exitDate: c.exitDate, reason: c.reason ?? c.exitRuleId ?? null })),
    notTaken: (t.notTaken || []).filter((n) => old(n.date)).map((n) => ({ date: n.date, symbol: n.symbol, reason: n.reason, text: n.text })),
    decisions: (t.decisions || []).map((d) => (old(d.date) ? { date: d.date, green: d.green, candidates: d.candidates, buys: d.buys, sells: d.sells } : { date: d.date, green: d.green, candidates: d.candidates })),
    executions: (t.executions || []).filter((e) => old(e.date)).map((e) => ({ date: e.date, symbol: e.symbol, side: e.side })),
    publication: 'Keine heutigen Bestände, keine Orders, keine Kurse. Zusammensetzung, Entscheidungen und Einzeltrades erscheinen erst, wenn der Stichtag mindestens 365 Tage zurückliegt.',
  };
}

/** replay.json: historische Beispiele erst nach 365 Tagen und ohne Kurse (Prüfschritte und Regeln bleiben). */
export function publicReplay(r) {
  const cutoff = lagCutoff(String(r.dataAsOf || r.generatedAt || '').slice(0, 10) || new Date().toISOString().slice(0, 10));
  const noPrice = (o) => (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k, v]) => typeof v !== 'number' || /count|sessions|index/i.test(k)).map(([k, v]) => [k, v && typeof v === 'object' && !Array.isArray(v) ? noPrice(v) : v])) : o);
  const examples = (r.examples || []).filter((e) => { const d = e.result?.exit?.date ?? e.result?.entry?.date ?? e.signal?.createdAt; return !!d && d <= cutoff; })
    .map((e) => ({ ...e, signal: e.signal ? publicSignal(e.signal) : e.signal, result: e.result ? { entryDate: e.result.entry?.date ?? null, exitDate: e.result.exit?.date ?? null } : null, checks: noPrice(e.checks) }));
  return { ...r, publicView: PUBLIC_SIGNALS_VERSION, holdingsLagDays: HOLDINGS_LAG_DAYS, holdingsVisibleThrough: cutoff, examples, examplesTotal: (r.examples || []).length };
}

/** Öffentliche Sicht eines Strategie-Ledgers (der volle Zustand liegt privat). */
export function publicLedger(l, asOf) {
  const cutoff = lagCutoff(asOf || l.lastProcessed || new Date().toISOString().slice(0, 10));
  if (l.schema === 'supertrader-ledger-trend52-1.0.0') return { schema: 'supertrader-ledger-public-1.0.0', strategyId: l.strategyId, variant: l.variant, liveSince: l.liveSince, lastProcessed: l.lastProcessed, holdingsLagDays: HOLDINGS_LAG_DAYS, holdingsVisibleThrough: cutoff, note: 'Der Zustand des Modelldepots liegt privat; siehe trend52.json.' };
  const vis = (arr) => (arr || []).filter((x) => visibleAt(x, cutoff)).map(publicSignal);
  return { schema: 'supertrader-ledger-public-1.0.0', strategyId: l.strategyId, variant: l.variant, version: l.version, liveSince: l.liveSince, lastProcessed: l.lastProcessed,
    holdingsLagDays: HOLDINGS_LAG_DAYS, holdingsVisibleThrough: cutoff, counts: { open: (l.open || []).length, closed: (l.closed || []).length, invalidated: (l.invalidated || []).length },
    open: vis((l.open || []).filter((x) => !wasPosition(x))), closed: vis(l.closed), invalidated: vis(l.invalidated) };
}
export const FULL_LEDGER_SCHEMAS = Object.freeze(['supertrader-ledger-1.0.0', 'supertrader-ledger-trend52-1.0.0']);
