// Insights: Themenkandidaten für den Tageslauf aus den Vision-Universe-Daten.
//   node products/insights/themen.mjs [--json]
// Liefert je Gruppe die größten Tagesbewegungen des letzten Handelstags (Schlusskurs), damit der Tageslauf einen Anlass hat:
//   gross    Marktwert ab 50 Mrd. $   (Tagesthema)
//   neben    Marktwert 2 bis 50 Mrd. $ (Nebenwert im Fokus)
// Aktien, über die Insights in den letzten 14 Tagen geschrieben hat, sind markiert. Das ist eine Vorauswahl, kein Urteil:
// ob ein Thema trägt, entscheidet die Recherche (Anlass in den Nachrichten, mindestens drei Quellen).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = path.join(root, 'discover/data/stocks/US_REAL');
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const artikel = fs.existsSync(path.join(root, 'insights/artikel.json')) ? J(path.join(root, 'insights/artikel.json')).artikel : [];
const grenze = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
const kuerzlich = new Set(artikel.filter((a) => a.datum >= grenze).flatMap((a) => a.ticker));

const alle = [];
for (const f of fs.readdirSync(dir)) {
  let d; try { d = J(path.join(dir, f)); } catch { continue; }
  const mcap = d.fundamentals?.valuation?.marketCap?.value ?? d.marketCap?.value ?? d.marketCap ?? null;
  const tag = d.changePercent?.value;
  if (typeof mcap !== 'number' || typeof tag !== 'number' || !d.price?.value) continue;
  alle.push({ t: d.symbol, name: d.companyName, sektor: d.sector || '', mcap, tag: Math.round(tag * 10) / 10, kurs: d.price.value, schon: kuerzlich.has(d.symbol) });
}
const top = (liste) => [...liste].sort((a, b) => Math.abs(b.tag) - Math.abs(a.tag)).slice(0, 12);
const gruppen = { gross: top(alle.filter((x) => x.mcap >= 50e9)), neben: top(alle.filter((x) => x.mcap >= 2e9 && x.mcap < 50e9)) };

if (process.argv.includes('--json')) console.log(JSON.stringify(gruppen, null, 1));
else for (const [g, liste] of Object.entries(gruppen)) {
  console.log(`\n${g === 'gross' ? 'Große Werte (ab 50 Mrd. $)' : 'Nebenwerte (2 bis 50 Mrd. $)'}: größte Tagesbewegungen`);
  for (const x of liste) console.log(`  ${x.t.padEnd(6)} ${(x.tag > 0 ? '+' : '') + x.tag}%`.padEnd(18) + `${(x.mcap / 1e9).toFixed(0).padStart(5)} Mrd. $  ${x.name}${x.schon ? '  (schon in Insights)' : ''}`);
}
