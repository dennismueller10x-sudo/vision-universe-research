// Insights: friert die Vision-Universe-Daten eines Artikels ein (Kurs, Kennzahlen, Chart, 13F) und schreibt sie
// in das Feld "daten" der Artikeldatei. Ein Artikel zeigt immer den Stand seines Erscheinens; vorhandene Daten
// werden nicht überschrieben, außer mit --neu.
//   node products/insights/snapshot.mjs products/insights/artikel/<datei>.json [--neu]
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const file = path.resolve(process.argv[2] || '');
const A = JSON.parse(fs.readFileSync(file, 'utf8'));
if (A.daten && !process.argv.includes('--neu')) { console.error('Daten sind eingefroren (--neu zum Neubau).'); process.exit(1); }
const J = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const has = (p) => fs.existsSync(path.join(root, p));
const r = (v, d = 4) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

const H = J('hedgefonds/data/hedgefonds.json');
const fundName = (id) => (H.funds || []).find((f) => f.id === id || f.slug === id)?.name || null;
function fonds(t) {
  for (const f of fs.readdirSync(path.join(root, 'hedgefonds/data/stocks'))) {
    if (f === 'index.json') continue;
    const x = Object.values(J(`hedgefonds/data/stocks/${f}`)).find((s) => s.ticker === t);
    if (!x) continue;
    const named = (list, art) => (list || []).map((h) => ({ name: fundName(h.s), art: art(h), wert: h.v, d: h.d ?? null })).filter((h) => h.name).slice(0, 4);
    return {
      stichtag: H.latestPeriod, quartal: H.latestPeriodLabel, anzahl: x.fundCount, kaeufer: x.buyers, verkaeufer: x.sellersCount, wertUSD: x.valueUSD,
      genannt: [...named(x.holders, (h) => h.st || 'gehalten'), ...named(x.sellers, () => 'verkauft')],
    };
  }
  return null;
}

A.daten = { commit: execSync('git rev-parse HEAD', { cwd: root }).toString().trim(), aktien: {} };
for (const t of A.ticker) {
  const d = J(`discover/data/stocks/US_REAL/${t}.json`), mt = d.metrics, f = d.fundamentals || {};
  const pts = J(`quant/data/market/discover-series/${d.securityId}.json`).points;
  const sh = `technical/data/stock/${t.slice(0, 2)}.json`, ts = has(sh) ? J(sh).stocks[t] : null;
  A.daten.aktien[t] = {
    name: d.companyName, kursStand: pts.at(-1)[0], kurs: d.price.value, r1m: r(mt.return1M), r12m: r(mt.return12M), abstandHoch: r(mt.distanceTo52wHigh),
    kgv: mt.f_pe ?? null, kuv: r(mt.f_ps, 2), wachstum: r(mt.f_revenueGrowthTTM), nettomarge: r(mt.f_netMargin), fcfMarge: r(mt.f_fcfMargin),
    marktwert: f.valuation?.marketCap?.value ?? null, umsatzTTM: f.latest?.ttm?.revenue?.v ?? null, ttmBis: f.ttmThrough ?? null, fundStand: f.asOf ?? null,
    gesundheit: (f.health?.categories || []).map((c) => [c.label.replace('Profitabilitaet', 'Profitabilität'), c.grade]),
    rs: r(d.ranks?.relativeStrengthPercentile, 0), trend: ts?.structure ?? null, trendStand: ts?.asOf ?? null,
    logo: has(`discover/logos/files/${t}.png`) ? `/discover/logos/files/${t}.png` : null,
    serie: pts.slice(-130).map(([dt, v]) => [dt, r(v, 2)]), fonds: fonds(t),
  };
}
fs.writeFileSync(file, JSON.stringify(A, null, 1) + '\n');
console.log(`${path.basename(file)}: Daten für ${A.ticker.join(', ')} eingefroren (Commit ${A.daten.commit.slice(0, 10)}).`);
