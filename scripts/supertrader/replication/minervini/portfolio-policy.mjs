// MinerviniReplicationPortfolioPolicy – Positionsgroesse, Exposure, Reihenfolge (MR-SIZ-01/02, MR-PF-01/02/06/07).
// Jeder Wert kommt aus dem Regelbuch (params.mjs); keine generische VU-Portfolio-Policy, kein PORTFOLIO_DEFAULTS.
import { requireP } from './trend-template.mjs';

export const POLICY_ID = 'MinerviniReplicationPortfolioPolicy@1.0.0';

// MR-PF-02 (VU-Formalisierung): Startquote, nach einem Gewinn-Trade voll, nach einem Verlust-Trade zurueck.
// lastClosedPnl: Ergebnis des zuletzt abgeschlossenen Trades (bzw. Summe des letzten Abschlusstags); null = noch keiner.
// MR-PF-07: kein Indexfilter - die Rueckmeldung kommt nur aus den eigenen Trades.
export function exposureCeiling(lastClosedPnl, P) {
  requireP(P);
  if (lastClosedPnl === null || lastClosedPnl === undefined) return P['pf.initialExposureCeiling'];
  return lastClosedPnl > 0 ? P['pf.fullExposureCeiling'] : P['pf.initialExposureCeiling'];
}

// Abrunden auf ganze echte Aktien: unit = bereinigte Stueckzahl je Roh-Aktie (Split-Geometrie der Messreihe).
export function wholeShares(shares, unit) { return Math.floor(shares / unit + WHOLE_SHARE_TOLERANCE) * unit; }
const WHOLE_SHARE_TOLERANCE = 1e-9; // nur Gleitkomma-Rundung

// MR-SIZ-01/02: Stueckzahl aus Risiko und Hoechstgewicht, geplanter Kurs = Pivot plus Slippage.
export function sizeOrder({ equity, pivot, stop, unit }, P) {
  requireP(P);
  if (!(unit > 0)) throw new Error('sizeOrder: unit fehlt');
  const px = pivot * (1 + P['exe.slippageBps'] / 1e4);
  const riskPerShare = px - stop;
  if (!(equity > 0) || !(riskPerShare > 0)) return { shares: 0, price: px };
  const byRisk = (equity * P['size.riskPerTrade']) / riskPerShare;
  const byWeight = (equity * P['size.maxPositionPct']) / px;
  return { shares: wholeShares(Math.min(byRisk, byWeight), unit), price: px, byRisk: byRisk <= byWeight };
}

// MR-PF-06: Fuehrer zuerst (VU-RS-Rangwert, Stand Vortag), dann engere Basis (kleinerer Stopabstand).
// Exakte Gleichstaende bilden eine Gruppe; die Gruppe wird nur ganz reserviert (kein Alphabet, kein Zufall).
export function rankOrders(orders) {
  const key = (o) => [Number.isFinite(o.rsScore) ? o.rsScore : -Infinity, o.stopPct];
  const sorted = orders.slice().sort((a, b) => { const ka = key(a), kb = key(b); return kb[0] - ka[0] || ka[1] - kb[1]; });
  const groups = [];
  for (const o of sorted) {
    const g = groups[groups.length - 1];
    if (g && key(g[0])[0] === key(o)[0] && key(g[0])[1] === key(o)[1]) g.push(o); else groups.push([o]);
  }
  return groups;
}

// Reservierung vor dem Handelstag aus dem Stand zum Vortagesschluss (MR-EXE-01).
// state: {equity, openValue, openCount, cash}; gibt [{order, shares, price, cost}] zurueck.
export function reserveOrders(groups, state, P) {
  requireP(P);
  const ceiling = state.ceiling;
  const comm = P['exe.commissionBps'] / 1e4;
  let count = state.openCount, exposure = state.openValue, cash = state.cash;
  const out = [];
  const tryOne = (o) => {
    const s = sizeOrder({ equity: state.equity, pivot: o.pivot, stop: o.stop, unit: o.unit }, P);
    let shares = s.shares;
    const room = Math.min(ceiling * state.equity - exposure, cash / (1 + comm));
    if (shares * s.price > room) shares = wholeShares(Math.max(0, room) / s.price, o.unit);
    if (!(shares > 0) || count + 1 > P['pf.maxPositions']) return null;
    const cost = shares * s.price;
    count += 1; exposure += cost; cash -= cost * (1 + comm);
    return { order: o, shares, price: s.price, cost };
  };
  for (const g of groups) {
    if (g.length === 1) { const r = tryOne(g[0]); if (r) out.push(r); continue; }
    // Gleichstandsgruppe: alles oder nichts.
    const snap = { count, exposure, cash };
    const res = [];
    for (const o of g) { const r = tryOne(o); if (!r) { res.length = 0; break; } res.push(r); }
    if (res.length === g.length) out.push(...res); else { count = snap.count; exposure = snap.exposure; cash = snap.cash; }
  }
  return out;
}
