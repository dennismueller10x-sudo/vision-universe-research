// Piotroski F-Score — TEILPRUEFUNG (8 von 9 Signalen).
//
// Original (PRIMARY_EXPLICIT, Piotroski 2000, SSRN 249455): neun binaere
// Signale aus dem Jahresabschluss, angewandt auf Titel mit hohem
// Buch-/Marktwert (oberes Quintil). Das Signal "Liquiditaet: Umlaufquote
// steigt" ist NICHT pruefbar - Umlaufvermoegen und kurzfristige
// Verbindlichkeiten fehlen in den oeffentlichen Daten. Ausgewiesen wird
// deshalb ein Teil-Score von 0-8, nie ein F-Score.
//
// VU-Formalisierungen (markiert):
//  - Verschuldung: langfristige Schulden / Bilanzsumme (Original: / durchschnittliche Bilanzsumme)
//  - Aktienausgabe: Aktienzahl; Spruenge >= 1,8x oder <= 0,55x gelten als Split -> nicht pruefbar
//  - Werte sind die zuletzt berichteten (restated), keine Erstmeldungen.
export const SIGNALS = [
  { id: 'ROA', ruleId: 'PIO-ROA-01', label: 'Rentabel', short: 'Gewinn / Bilanzsumme Vorjahr > 0' },
  { id: 'CFO', ruleId: 'PIO-CFO-01', label: 'Operativer Cashflow positiv', short: 'Operativer Cashflow > 0' },
  { id: 'DROA', ruleId: 'PIO-DROA-01', label: 'Rentabilität steigt', short: 'Gesamtkapitalrendite höher als im Vorjahr' },
  { id: 'ACCRUAL', ruleId: 'PIO-ACC-01', label: 'Gewinnqualität', short: 'Cashflow übersteigt den Gewinn' },
  { id: 'DLEVER', ruleId: 'PIO-LEV-VU', label: 'Verschuldung sinkt', short: 'Langfristige Schulden / Bilanzsumme gesunken' },
  { id: 'DLIQUID', ruleId: 'PIO-LIQ-NA', label: 'Liquidität steigt', short: 'Nicht prüfbar — Umlaufvermögen fehlt' },
  { id: 'EQ_OFFER', ruleId: 'PIO-EQ-VU', label: 'Keine neuen Aktien', short: 'Aktienzahl nicht gestiegen' },
  { id: 'DMARGIN', ruleId: 'PIO-GM-01', label: 'Bruttomarge steigt', short: 'Bruttomarge höher als im Vorjahr' },
  { id: 'DTURN', ruleId: 'PIO-TURN-01', label: 'Kapitalumschlag steigt', short: 'Umsatz / Bilanzsumme höher als im Vorjahr' },
];
export const CHECKABLE = SIGNALS.filter((s) => s.id !== 'DLIQUID').map((s) => s.id);
export const PARAMS = Object.freeze({ maxYearAgeDays: 550, minPartialScore: 7, bookToMarketQuintile: 0.8 });

const r4 = (v) => (Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : null);

// annual: { metric: [[fy, fp, end, v, filed, accn, derived], ...] }
function byYear(rows) {
  const m = new Map();
  for (const r of rows || []) if (r[1] === 'FY' && Number.isFinite(r[3])) m.set(String(r[2]), r[3]);
  return m;
}

export function evaluate(annual, asOf, p = PARAMS) {
  const ni = byYear(annual?.net_income), ta = byYear(annual?.total_assets), cfo = byYear(annual?.operating_cash_flow);
  const ltd = byYear(annual?.long_term_debt), sh = byYear(annual?.shares_outstanding), gp = byYear(annual?.gross_profit), rev = byYear(annual?.revenue);
  const ends = [...ta.keys()].sort();
  const status = (ok) => (ok === null ? { status: 'NO_DATA' } : { status: ok ? 'PASS' : 'FAIL' });
  const out = Object.fromEntries(SIGNALS.map((s) => [s.id, { status: 'NO_DATA' }]));
  out.DLIQUID = { status: 'NOT_AVAILABLE' };
  if (ends.length < 3) return { signals: out, score: null, checked: 0, fiscalYearEnd: null, note: 'weniger als 3 Bilanzstichtage' };
  const [e2, e1, e0] = ends.slice(-3); // vorvorjahr, vorjahr, aktuell
  if ((new Date(asOf) - new Date(e0)) / 864e5 > p.maxYearAgeDays) return { signals: out, score: null, checked: 0, fiscalYearEnd: e0, note: `jüngstes Geschäftsjahr ${e0} veraltet` };
  const has = (m, k) => m.has(k);
  const roa = (k, kPrev) => (has(ni, k) && has(ta, kPrev) && ta.get(kPrev) > 0 ? ni.get(k) / ta.get(kPrev) : null);
  const roa0 = roa(e0, e1), roa1 = roa(e1, e2);
  out.ROA = { ...status(roa0 === null ? null : roa0 > 0), value: r4(roa0) };
  out.CFO = { ...status(has(cfo, e0) ? cfo.get(e0) > 0 : null) };
  out.DROA = { ...status(roa0 !== null && roa1 !== null ? roa0 > roa1 : null) };
  out.ACCRUAL = { ...status(has(cfo, e0) && has(ta, e1) && roa0 !== null ? cfo.get(e0) / ta.get(e1) > roa0 : null) };
  const lev = (k) => (has(ltd, k) && has(ta, k) && ta.get(k) > 0 ? ltd.get(k) / ta.get(k) : null);
  const l0 = lev(e0), l1 = lev(e1);
  out.DLEVER = { ...status(l0 !== null && l1 !== null ? l0 <= l1 : null) };
  if (has(sh, e0) && has(sh, e1) && sh.get(e1) > 0) {
    const ratio = sh.get(e0) / sh.get(e1);
    out.EQ_OFFER = ratio >= 1.8 || ratio <= 0.55 ? { status: 'NO_DATA', note: 'Aktienzahl springt (vermutlich Split)' } : { status: ratio <= 1.0 ? 'PASS' : 'FAIL', value: r4(ratio - 1) };
  }
  const gm = (k) => (has(gp, k) && has(rev, k) && rev.get(k) > 0 ? gp.get(k) / rev.get(k) : null);
  const g0 = gm(e0), g1 = gm(e1);
  out.DMARGIN = { ...status(g0 !== null && g1 !== null ? g0 > g1 : null) };
  const turn = (k, kPrev) => (has(rev, k) && has(ta, kPrev) && ta.get(kPrev) > 0 ? rev.get(k) / ta.get(kPrev) : null);
  const t0 = turn(e0, e1), t1 = turn(e1, e2);
  out.DTURN = { ...status(t0 !== null && t1 !== null ? t0 > t1 : null) };
  const checked = CHECKABLE.filter((k) => out[k].status === 'PASS' || out[k].status === 'FAIL');
  const score = CHECKABLE.filter((k) => out[k].status === 'PASS').length;
  return { signals: out, score: checked.length === CHECKABLE.length ? score : null, checked: checked.length, partialScore: score, fiscalYearEnd: e0 };
}
