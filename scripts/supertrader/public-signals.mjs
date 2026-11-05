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
