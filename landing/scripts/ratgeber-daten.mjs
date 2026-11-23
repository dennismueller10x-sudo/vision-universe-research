// Ratgeber: friert die Beispielwerte (Kurs, Gewinn je Aktie, KGV, Dividendenrendite, Umsatz, Gewinn) aus den
// Vision-Universe-Daten ein und schreibt sie nach landing/ratgeber-inhalt/daten.json. Die Ratgeber zeigen immer diesen
// Stand (mit Datum); neu einfrieren nur bewusst, z. B. bei der Quartalsprüfung.
//   node landing/scripts/ratgeber-daten.mjs [--out DATEI]
// Quelle: discover/data/stocks/US_REAL/<TICKER>.json (Kurse: Schlusskurs; Geschäftszahlen: SEC-Berichte, TTM).
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const landing = fileURLToPath(new URL('../', import.meta.url));
const repo = resolve(landing, '..');
export const TICKER = ['KO','PEP','PG','MSFT','AAPL','NVDA','AMZN','COST','TSLA'];

export function auszug(d) {
  const g = d.geschaeftszahlen || {}, v = d.fundamentals?.valuation || {}, t = d.fundamentals?.latest?.ttm || {};
  const n = (x, k = 4) => (x == null || Number.isNaN(+x) ? null : Math.round(+x * 10 ** k) / 10 ** k);
  return {
    name: d.companyName, sektor: d.sector || null, kurs: n(d.price?.value, 2), kursStand: d.asOf,
    gewinnJeAktie: n(v.pe?.eps ?? g.gewinnJeAktie, 2), kgv: n(v.pe?.value ?? g.kgv, 2),
    dividendenRendite: g.dividendenRenditeStatus === 'CALCULATED' ? n(g.dividendenRendite) : null,
    marktwertUSD: n(v.marketCap?.value, 0), aktienAnzahl: n(t.shares_outstanding?.v ?? v.marketCap?.shares, 0),
    umsatzUSD: g.umsatzTTM != null ? g.umsatzTTM * 1e6 : null, gewinnUSD: g.gewinnTTM != null ? g.gewinnTTM * 1e6 : null,
    marge: n(g.marge), umsatzWachstum: n(g.umsatzWachstum), zeitraum: g.zeitraum || v.pe?.period || null,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv.includes('--out') ? resolve(process.argv[process.argv.indexOf('--out') + 1]) : resolve(landing, 'ratgeber-inhalt/daten.json');
  const aktien = {}; let markt = null, stand = null;
  for (const t of TICKER) {
    const d = JSON.parse(readFileSync(resolve(repo, `discover/data/stocks/US_REAL/${t}.json`), 'utf8'));
    aktien[t] = auszug(d);
    stand = stand && stand > d.asOf ? stand : d.asOf;
    const c = d.fundamentals?.valuation?.context;
    if (c && !markt) markt = {kgvMedian: c.peMedian, anzahl: c.peCount};
  }
  const daten = {schema: 'vu-ratgeber-daten-1', stand, quelle: 'Vision Universe Datenbank: Schlusskurse; Geschäftszahlen aus den SEC-Berichten der Unternehmen (letzte vier Quartale)', markt, aktien};
  writeFileSync(out, JSON.stringify(daten, null, 1) + '\n');
  console.log(`Ratgeber-Daten: ${Object.keys(aktien).length} Aktien, Stand ${stand}, KGV-Median ${markt?.kgvMedian} (${markt?.anzahl} Aktien) → ${out}`);
}
