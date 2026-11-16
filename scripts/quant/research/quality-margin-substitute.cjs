#!/usr/bin/env node
'use strict';
// Ersatzpruefung fuer quant-v2.4.0 (a) (Steuerung 16.11.2026): Forschung, nicht zertifiziert.
// Die neue Margenkomponente (operatingMarginDrawdown) laesst sich auf dem V10-Panel nicht rueckwaerts pruefen, weil
// der Panel nur die Rohwerte je Stichtag traegt, keine Jahresmargen. Geprueft wird deshalb, was die ALTE Komponente
// (operatingMarginStability) zur Trennschaerfe von Quality beitrug:
//   mit  = Quality wie V10 (fuenf Teile, alte Margenstabilitaet 20 %)
//   ohne = Quality ohne Margenkomponente (vier Teile, innerhalb des Faktors umgewichtet)
// Die volle Pruefung mit Jahresmargen (drei Formen) rechnet quality-margin-pit.cjs auf neu gebauten PIT-Dokumenten.
// Usage: node quality-margin-substitute.cjs --panel <panel.jsonl.gz> --out <file.json>
const fs = require('node:fs'), path = require('node:path');
const F = require('../v10/factor/common.cjs');
const P = require('../v10/factor/panel.cjs');
const Q = require('./quality-margin-compare.cjs');
const C = F.C;

const HORIZONS = [13, 52];
const VARIANTS = { mit: Q.variant('operatingMarginStability'), ohne: Q.variant(null) };
function arg(name) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; }

function run(panelFile) {
  const t0 = Date.now();
  const panel = P.readPanel(panelFile, { withRaws: true });
  const frame = F.buildFrame(panel.loaderOptions), spy = F.spyWeekly(frame.calendar);
  const known = new Set(frame.listings.map(l => l.securityId));
  const scored = Q.scoreDates(panel.dates, VARIANTS, id => known.has(id));
  const names = Object.keys(VARIANTS);
  const per = Q.perDateOutcomes(scored, names, frame, spy, HORIZONS, k => process.stderr.write(k + ' ' + Math.round((Date.now() - t0) / 1000) + 's\n'));
  const s = Q.summarize(per, names, HORIZONS, [['mit', 'ohne']]);
  const titles = scored.map(d => d.rows.length).filter(n => n > 0).sort((a, b) => a - b);
  return {
    schemaVersion: 'quality-margin-substitute-1.1.0', label: 'Forschung, nicht zertifiziert', evidenceKind: 'RECONSTRUCTION',
    frage: 'Trug die alte Margenkomponente (Margenstabilitaet) zur Trennschaerfe von Quality bei?',
    varianten: Object.fromEntries(names.map(n => [n, VARIANTS[n].map(([id, w]) => [id, w])])),
    population: { rankDates: titles.length, titelJeStichtagMedian: titles[Math.floor(titles.length / 2)] || 0 },
    returnBasis: 'PRICE_RETURN', buckets: 5, ...s,
    grenzen: 'Rueckblickend auf heutigen Survivors (bedingte Population), Kursrendite ohne Kosten; prueft die alte Komponente, nicht die neue.',
    input: { panelHash: C.hash(panel.dates.map(d => [d.date, d.rows.length])), masterHash: frame.masterHash },
    certificationStatus: 'NOT_CERTIFIED', seconds: Math.round((Date.now() - t0) / 1000)
  };
}

function main() {
  const panelFile = arg('--panel'), out = arg('--out');
  if (!panelFile || !out) throw Error('usage: --panel <panel.jsonl.gz> --out <file.json>');
  const r = run(panelFile);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(r, null, 1) + '\n');
  for (const row of r.table) for (const c of row.vergleiche) console.log([row.horizonMonths + 'M', 'Tage ' + row.dates, c.a + '-' + c.b, 'IC ' + c.ic.mean?.toFixed(4) + ' t ' + c.ic.t?.toFixed(2), 'Q5-Q1 ' + c.spread.mean?.toFixed(4) + ' t ' + c.spread.t?.toFixed(2)].join('\t'));
}
if (require.main === module) main();
module.exports = { scoreQuality: Q.scoreQuality, VARIANTS, run };
