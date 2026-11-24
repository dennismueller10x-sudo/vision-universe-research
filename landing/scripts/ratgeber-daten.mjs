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
    cashflowUSD: n(t.operating_cash_flow?.v, 0), investitionenUSD: n(t.capital_expenditures?.v, 0), freeCashflowUSD: n(t.free_cash_flow?.v, 0),
    schuldenUSD: n(t.total_debt?.v, 0), barUSD: t.cash_and_equivalents?.v != null ? n((t.cash_and_equivalents?.v || 0) + (t.short_term_investments?.v || 0), 0) : null,
    nettoschuldenUSD: n(t.net_debt?.v, 0), rendite12m: n(d.metrics?.return12M),
  };
}

// Indexverläufe (Gesamtrendite mit wieder angelegten Ausschüttungen) über die ETFs, die den Index abbilden:
// SPY (S&P 500), URTH (MSCI World), ACWI (MSCI ACWI). Zehn Jahre, alle vier Wochen ein Punkt, Start = 10.000 $.
export function indexReihen(repo) {
  const reihe = (t) => {
    const d = JSON.parse(readFileSync(resolve(repo, `vorsorge/data/series/${t}.json`), 'utf8'));
    const w = d.total.weekly; let tag = new Date(w.t0 + 'T00:00:00Z').getTime();
    return w.v.map((v, i) => { tag += w.dt[i] * 864e5; return [new Date(tag).toISOString().slice(0, 10), v]; });
  };
  const roh = {SPY: reihe('SPY'), URTH: reihe('URTH'), ACWI: reihe('ACWI')};
  const bis = roh.URTH.at(-1)[0];
  const von = new Date(new Date(bis + 'T00:00:00Z').getTime() - 3652 * 864e5).toISOString().slice(0, 10);
  const reihen = {};
  let daten = null;
  for (const [t, r] of Object.entries(roh)) {
    const ab = r.filter(([d]) => d >= von && d <= bis);
    const punkte = ab.filter((_, i) => i % 4 === 0 || i === ab.length - 1);
    if (punkte.at(-1)[0] !== ab.at(-1)[0]) punkte.push(ab.at(-1));
    reihen[t] = punkte.map(([, v]) => Math.round(v / punkte[0][1] * 10000));
    daten = daten || punkte.map(([d]) => d);
  }
  return {von: daten[0], bis: daten.at(-1), daten, reihen};
}

// Weitere Aktien zum Stand der bestehenden Beispiele ergänzen, ohne die vorhandenen neu einzufrieren:
//   node landing/scripts/ratgeber-daten.mjs --ergaenzen AMD,AVGO [--out DATEI]
// Kurs = Schlusskurs am Stichtag aus der Kursreihe, KGV und Marktwert daraus neu gerechnet; Geschäftszahlen wie gemeldet.
// Kurze Anzeigenamen für Grafiken (statt „Alphabet Class A“, „Advanced Micro Devices“).
export const KURZNAMEN = {AMD: 'AMD', MU: 'Micron', GOOGL: 'Alphabet', META: 'Meta', CRWV: 'CoreWeave', SPCX: 'SpaceX', AVGO: 'Broadcom'};
export function zumStichtag(d, punkte, tag) {
  const a = auszug(d), p = punkte.filter(([t]) => t <= tag), kurs = p.at(-1)?.[1];
  if (kurs == null) return null;
  const vor = punkte.filter(([t]) => t <= `${Number(tag.slice(0, 4)) - 1}${tag.slice(4)}`).at(-1)?.[1];
  const r = (x, k = 2) => (x == null ? null : Math.round(x * 10 ** k) / 10 ** k);
  return {...a, name: KURZNAMEN[d.symbol] || a.name, kurs: r(kurs), kursStand: p.at(-1)[0], kgv: a.gewinnJeAktie > 0 ? r(kurs / a.gewinnJeAktie) : null,
    marktwertUSD: a.aktienAnzahl ? Math.round(kurs * a.aktienAnzahl) : a.marktwertUSD, rendite12m: vor ? r(kurs / vor - 1, 4) : null};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv.includes('--out') ? resolve(process.argv[process.argv.indexOf('--out') + 1]) : resolve(landing, 'ratgeber-inhalt/daten.json');
  // Kursreihe seit dem ersten Handelstag bis zum Stichtag (z. B. für junge Börsengänge): --serie SPCX
  if (process.argv.includes('--serie')) {
    const daten = JSON.parse(readFileSync(out, 'utf8'));
    for (const t of process.argv[process.argv.indexOf('--serie') + 1].split(',')) {
      const d = JSON.parse(readFileSync(resolve(repo, `discover/data/stocks/US_REAL/${t}.json`), 'utf8'));
      const punkte = JSON.parse(readFileSync(resolve(repo, `quant/data/market/discover-series/${d.securityId}.json`), 'utf8')).points.filter(([x]) => x <= daten.stand);
      daten.serien = {...(daten.serien || {}), [t]: punkte};
      console.log(`${t}: ${punkte.length} Kurse ${punkte[0][0]} bis ${punkte.at(-1)[0]}`);
    }
    writeFileSync(out, JSON.stringify(daten, null, 1) + '\n');
    process.exit(0);
  }
  if (process.argv.includes('--ergaenzen')) {
    const daten = JSON.parse(readFileSync(out, 'utf8'));
    for (const t of process.argv[process.argv.indexOf('--ergaenzen') + 1].split(',')) {
      const d = JSON.parse(readFileSync(resolve(repo, `discover/data/stocks/US_REAL/${t}.json`), 'utf8'));
      const punkte = JSON.parse(readFileSync(resolve(repo, `quant/data/market/discover-series/${d.securityId}.json`), 'utf8')).points;
      daten.aktien[t] = zumStichtag(d, punkte, daten.stand);
      console.log(`${t}: ${daten.aktien[t]?.kurs} $ am ${daten.aktien[t]?.kursStand}, KGV ${daten.aktien[t]?.kgv}`);
    }
    writeFileSync(out, JSON.stringify(daten, null, 1) + '\n');
    process.exit(0);
  }
  const aktien = {}; let markt = null, stand = null;
  for (const t of TICKER) {
    const d = JSON.parse(readFileSync(resolve(repo, `discover/data/stocks/US_REAL/${t}.json`), 'utf8'));
    aktien[t] = auszug(d);
    stand = stand && stand > d.asOf ? stand : d.asOf;
    const c = d.fundamentals?.valuation?.context;
    if (c && !markt) markt = {kgvMedian: c.peMedian, anzahl: c.peCount};
  }
  // Kursverlauf für die Charttechnik (ein Jahr Schlusskurse) und 13F-Depots bekannter Investoren.
  const ms = JSON.parse(readFileSync(resolve(repo, 'discover/data/stocks/US_REAL/MSFT.json'), 'utf8'));
  const serie = JSON.parse(readFileSync(resolve(repo, `quant/data/market/discover-series/${ms.securityId}.json`), 'utf8')).points.slice(-260);
  const fonds = {};
  for (const slug of ['berkshire', 'pershing-square', 'scion']) {
    const f = JSON.parse(readFileSync(resolve(repo, `hedgefonds/data/funds/${slug}.json`), 'utf8'));
    const h = f.holdings || f.positions || [];
    fonds[slug] = {name: f.name, manager: f.manager, stichtag: f.reportDate, gemeldet: f.filedDate, positionen: h.length,
      top: h.slice(0, 5).map((x) => ({name: x.displayName, ticker: x.ticker, anteil: x.weightPct, status: x.status, art: x.putCall || null}))};
  }
  const daten = {schema: 'vu-ratgeber-daten-1', stand, indizes: indexReihen(repo), serie: {ticker: 'MSFT', name: ms.companyName, punkte: serie}, fonds, quelle: 'Vision Universe Datenbank: Schlusskurse; Geschäftszahlen aus den SEC-Berichten der Unternehmen (letzte vier Quartale)', markt, aktien};
  writeFileSync(out, JSON.stringify(daten, null, 1) + '\n');
  console.log(`Ratgeber-Daten: ${Object.keys(aktien).length} Aktien, Stand ${stand}, KGV-Median ${markt?.kgvMedian} (${markt?.anzahl} Aktien) → ${out}`);
}
