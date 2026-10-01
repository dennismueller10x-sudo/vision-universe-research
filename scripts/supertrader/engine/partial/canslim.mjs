// CAN SLIM — TEILPRUEFUNG (kein vollstaendiges CAN-SLIM-Signal).
//
// William O'Neil beschreibt sieben Kriterien. Mit den oeffentlichen Daten
// lassen sich nur einzelne pruefen; jedes Kriterium traegt deshalb einen
// eigenen Status:
//   PASS / FAIL       geprueft
//   NO_DATA           fuer diesen Titel fehlen Werte (oder sie sind veraltet)
//   NOT_AVAILABLE     fuer KEINEN Titel pruefbar (Datenquelle fehlt)
//   DISPLAY_ONLY      angezeigt, nicht bewertet (keine belegte Schwelle)
// Ein Titel, der alle pruefbaren Kriterien erfuellt, ist ein "Teiltreffer",
// nie ein CAN-SLIM-Signal: I (institutionelle Nachfrage) ist nicht pruefbar.
//
// VU-Formalisierungen (markiert):
//  C, A: Nettogewinn statt Gewinn je Aktie - die oeffentliche EPS-Historie mischt
//        Werte vor und nach Aktiensplits (Beispiel NVDA FY2019 6,63 / FY2020 1,13).
//  N:    nur der Kursteil ("nahe/auf neuem Hoch"); neue Produkte/Management
//        sind nicht maschinell pruefbar.
//  L:    VU-RS-Perzentil (kein IBD-RS-Rating).
//  M:    SPY ueber steigender 200-Tage-Linie und ueber der 50-Tage-Linie - ein
//        Ersatz fuer O'Neils Follow-Through-/Distribution-Days (Indexvolumen fehlt).
export const PARAMS = Object.freeze({
  cMinGrowth: 0.25,        // CS-C-01
  aMinCagr: 0.25,          // CS-A-01
  aYears: 3,
  nMaxBelowHigh: 0.15,     // CS-N-VU
  lMinRsPercentile: 80,    // CS-L-01
  maxQuarterAgeDays: 200,  // juengstes Quartal hoechstens ~2 Berichtsperioden alt
  maxYearAgeDays: 550,
});

export const CRITERIA = [
  { id: 'C', ruleId: 'CS-C-01', label: 'Aktueller Quartalsgewinn', short: 'Quartalsgewinn ≥ +25 % ggü. Vorjahresquartal' },
  { id: 'A', ruleId: 'CS-A-01', label: 'Jährliches Gewinnwachstum', short: 'Gewinn 3 Jahre in Folge gestiegen, ≥ 25 % p. a.' },
  { id: 'N', ruleId: 'CS-N-VU', label: 'Neues (Kurs-)Hoch', short: 'Kurs höchstens 15 % unter dem 52-Wochen-Hoch' },
  { id: 'S', ruleId: 'CS-S-INFO', label: 'Angebot und Nachfrage', short: 'Aktienzahl und Volumen werden angezeigt' },
  { id: 'L', ruleId: 'CS-L-01', label: 'Marktführer', short: 'Relative Stärke im oberen 20-%-Bereich' },
  { id: 'I', ruleId: 'CS-I-NA', label: 'Institutionelle Nachfrage', short: 'Nicht prüfbar — keine Fondsbestände je Aktie' },
  { id: 'M', ruleId: 'CS-M-VU', label: 'Marktrichtung', short: 'SPY über steigender 200-Tage-Linie und über der 50-Tage-Linie' },
];
export const CHECKABLE = ['C', 'A', 'N', 'L', 'M'];

const days = (a, b) => (new Date(b) - new Date(a)) / 864e5;
const r4 = (v) => (Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : null);

// rows: [fy, fp, end, value, filed, accn, derived]
export function evalC(quarterly, asOf, p = PARAMS) {
  const rows = (quarterly || []).filter((r) => Number.isFinite(r[3])).sort((a, b) => String(a[2]).localeCompare(String(b[2])));
  if (rows.length < 5) return { status: 'NO_DATA', note: 'weniger als 5 Quartale' };
  const last = rows[rows.length - 1];
  if (days(last[2], asOf) > p.maxQuarterAgeDays) return { status: 'NO_DATA', note: `jüngstes Quartal ${last[2]} veraltet` };
  const yearAgo = rows.find((r) => Math.abs(days(r[2], last[2]) - 364) <= 20);
  if (!yearAgo) return { status: 'NO_DATA', note: 'Vorjahresquartal fehlt' };
  const cur = last[3], prev = yearAgo[3];
  const growth = prev > 0 ? cur / prev - 1 : null;
  const pass = cur > 0 && prev > 0 && growth >= p.cMinGrowth;
  return { status: pass ? 'PASS' : 'FAIL', value: r4(growth), periodEnd: last[2], filed: last[4], note: prev <= 0 ? 'Vorjahresquartal ohne Gewinn' : null };
}

export function evalA(annual, asOf, p = PARAMS) {
  const rows = (annual || []).filter((r) => Number.isFinite(r[3]) && r[1] === 'FY').sort((a, b) => String(a[2]).localeCompare(String(b[2])));
  if (rows.length < p.aYears + 1) return { status: 'NO_DATA', note: `weniger als ${p.aYears + 1} Geschäftsjahre` };
  const last = rows[rows.length - 1];
  if (days(last[2], asOf) > p.maxYearAgeDays) return { status: 'NO_DATA', note: `jüngstes Geschäftsjahr ${last[2]} veraltet` };
  const win = rows.slice(-(p.aYears + 1)).map((r) => r[3]);
  const rising = win.every((v, i) => v > 0 && (i === 0 || v > win[i - 1]));
  const cagr = win[0] > 0 && win[win.length - 1] > 0 ? (win[win.length - 1] / win[0]) ** (1 / p.aYears) - 1 : null;
  return { status: rising && cagr >= p.aMinCagr ? 'PASS' : 'FAIL', value: r4(cagr), periodEnd: last[2], filed: last[4], note: rising ? null : 'nicht in jedem Jahr gestiegen' };
}

export function evalN(close, high252, p = PARAMS) {
  if (!Number.isFinite(close) || !Number.isFinite(high252) || high252 <= 0) return { status: 'NO_DATA' };
  const below = 1 - close / high252;
  return { status: below <= p.nMaxBelowHigh ? 'PASS' : 'FAIL', value: r4(-below) };
}

export function evalL(rsPercentile, p = PARAMS) {
  if (!Number.isFinite(rsPercentile)) return { status: 'NO_DATA' };
  return { status: rsPercentile >= p.lMinRsPercentile ? 'PASS' : 'FAIL', value: Math.round(rsPercentile) };
}

// SPY-Tagesschluesse [[date, close], ...]
export function evalM(spyPoints) {
  const c = spyPoints.map((x) => x[1]);
  const n = c.length;
  if (n < 230) return { status: 'NO_DATA' };
  const avg = (from, to) => { let s = 0; for (let i = from; i <= to; i++) s += c[i]; return s / (to - from + 1); };
  const sma50 = avg(n - 50, n - 1), sma200 = avg(n - 200, n - 1), sma200prev = avg(n - 221, n - 22);
  const pass = c[n - 1] > sma50 && c[n - 1] > sma200 && sma200 > sma200prev;
  return { status: pass ? 'PASS' : 'FAIL', value: r4(c[n - 1] / sma200 - 1), asOf: spyPoints[n - 1][0], note: `SPY ${pass ? 'über' : 'nicht über'} steigender 200-Tage-Linie und 50-Tage-Linie` };
}

export function evaluate({ fund, close, high252, rsPercentile, volumeRatio, market, asOf }) {
  const out = {
    C: evalC(fund?.quarterly?.net_income, asOf),
    A: evalA(fund?.annual?.net_income, asOf),
    N: evalN(close, high252),
    S: { status: 'DISPLAY_ONLY', value: Number.isFinite(volumeRatio) ? r4(volumeRatio) : null, shares: fund?.sharesOutstanding ?? null },
    L: evalL(rsPercentile),
    I: { status: 'NOT_AVAILABLE' },
    M: market,
  };
  const passed = CHECKABLE.filter((k) => out[k].status === 'PASS');
  const failed = CHECKABLE.filter((k) => out[k].status === 'FAIL');
  const noData = CHECKABLE.filter((k) => out[k].status === 'NO_DATA');
  return { criteria: out, passed, failed, noData, partialMatch: passed.length === CHECKABLE.length };
}
