// Greenblatt Value Engine — Magic Formula, US-Originalvariante.
//
// Portfoliomechanik PRIMARY_EXPLICIT (magicformulainvesting.com): US-Aktien,
// keine Finanzwerte/Versorger, mindestens 20-30 Titel, gleiche Betraege,
// ca. ein Jahr halten. Kennzahlen MULTI_SOURCE_CONFIRMED:
//   Earnings Yield  = EBIT / Enterprise Value                (GB-EY-01)
//   Return on Capital = EBIT / (Net Working Capital + Net Fixed Assets) (GB-ROC-01)
//
// Diese Datei rechnet KEIN Ranking, solange eine Pflichtgroesse im
// kanonischen Fundamentaldatensatz fehlt. Ein ROC-Ersatz (etwa EBIT /
// Bilanzsumme) waere eine andere Strategie und darf nicht unter
// Greenblatts Namen laufen.

export const REQUIRED_FIELDS = [
  { id: 'operating_income', role: 'EBIT (Näherung: operatives Ergebnis)', rule: 'GB-EY-01, GB-ROC-01' },
  { id: 'market_cap', role: 'Marktkapitalisierung (für Enterprise Value)', rule: 'GB-EY-01' },
  { id: 'total_debt', role: 'Finanzschulden (für Enterprise Value)', rule: 'GB-EY-01' },
  { id: 'cash_and_equivalents', role: 'Liquide Mittel (für Enterprise Value)', rule: 'GB-EY-01' },
  { id: 'current_assets', role: 'Umlaufvermögen (für Net Working Capital)', rule: 'GB-ROC-01' },
  { id: 'current_liabilities', role: 'Kurzfristige Verbindlichkeiten (für Net Working Capital)', rule: 'GB-ROC-01' },
  { id: 'net_ppe', role: 'Sachanlagen netto (Net Fixed Assets)', rule: 'GB-ROC-01' },
  { id: 'sic', role: 'Branchenschlüssel für den Ausschluss von Finanzwerten und Versorgern', rule: 'GB-UNIV-01' },
];

// SIC-Division H (6000-6799) = Finance, Insurance, Real Estate;
// SIC 4900-4999 = Electric, Gas, Sanitary Services (Versorger).
export function excludedBySic(sic) {
  const n = Number(sic);
  if (!Number.isFinite(n)) return null;
  return (n >= 6000 && n <= 6799) || (n >= 4900 && n <= 4999);
}

// Prueft je Titel, welche Pflichtfelder der kanonische Datensatz liefert.
export function coverage(companies) {
  const counts = Object.fromEntries(REQUIRED_FIELDS.map((f) => [f.id, 0]));
  let eligible = 0, excluded = 0, unknownSector = 0;
  for (const c of companies) {
    for (const f of REQUIRED_FIELDS) if (c.fields[f.id] !== undefined && c.fields[f.id] !== null) counts[f.id]++;
    const ex = excludedBySic(c.fields.sic);
    if (ex === null) unknownSector++; else if (ex) excluded++; else eligible++;
  }
  const missing = REQUIRED_FIELDS.filter((f) => counts[f.id] === 0).map((f) => f.id);
  return {
    universe: companies.length, eligible, excludedFinancialsUtilities: excluded, unknownSector,
    fieldCoverage: REQUIRED_FIELDS.map((f) => ({ ...f, available: counts[f.id], share: companies.length ? counts[f.id] / companies.length : 0 })),
    missingFields: missing,
    rankingComputable: missing.length === 0,
  };
}

export default {
  id: 'GREENBLATT_VALUE', variant: 'GREENBLATT_US_ORIGINAL', version: '1.0.0', timeframe: 'annual-rebalance',
  REQUIRED_FIELDS, coverage, excludedBySic,
};
