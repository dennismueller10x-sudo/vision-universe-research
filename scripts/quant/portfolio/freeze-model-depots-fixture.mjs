#!/usr/bin/env node
// Friert die Eingangsdaten der Musterdepots (scripts/quant/portfolio/model-depots.cjs) für den Test ein.
// Der Erstlauf-Test rechnet damit auf festen Daten statt auf dem Tagesstand: unter der Woche fehlt sonst der
// Wochenpunkt der langen Kursreihen (Vollauf samstags), und der Test würde rot, obwohl am Erzeuger nichts falsch ist
// (CLAUDE.md: Daten lösen Alarm aus und blockieren keinen Code-PR). Die Frische der Live-Datei prüft der Monitor.
//
// Aufruf (nur nach einem Samstags-Vollauf, wenn lange Reihen und Tagesreihen dieselbe Woche haben):
//   node scripts/quant/portfolio/freeze-model-depots-fixture.mjs --out quant/tests/fixtures/model-depots/inputs.json.gz [--n 80] [--from 2022-01-01]
// Kurspunkte vor --from fallen weg (Größe); die Faktoren brauchen höchstens drei Jahre Kursgeschichte.
// Ausgabe: eine gzip-JSON-Datei { asOf, files: { <Pfad relativ zur Datenwurzel>: <Inhalt> } }; der Test entpackt sie in ein
// Temp-Verzeichnis und ruft build({ dataRoot }) auf. Auswahl: jeder k-te zulässige Titel nach securityId (deterministisch).
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const Identity = createRequire(import.meta.url)(join(ROOT, 'core/identity.js'));
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const out = arg('--out'), n = Number(arg('--n') || 80), from = arg('--from') || '2022-01-01';
if (!out) throw Error('--out fehlt');
const txt = p => readFileSync(join(ROOT, p), 'utf8');
const json = p => JSON.parse(txt(p));

const SPY = 'quant/data/market/multi-asset/series/SPY.json', UNI = 'quant/data/market/scale/universe-ELIGIBLE_US_EQUITY.json';
const Q = 'quant/config/ticker-reuse-quarantine.json', TAX = 'quant/data/product/sic-peer-taxonomy-v1.json';
const LONG = 'quant/data/market/discover-series-long', DAILY = 'quant/data/market/discover-series', SEC = 'quant/data/sec/consumer';

const spy = json(SPY), asOf = spy.points.at(-1)[0];
const quarantined = new Set(json(Q).records.map(r => r.securityId));
const bundleOf = new Map();
for (const f of readdirSync(join(ROOT, SEC)).filter(f => /^CIK\d{10}\.json$/.test(f)))
  for (const id of JSON.parse(txt(join(SEC, f))).securityIds || []) bundleOf.set(id, f);
const uni = json(UNI);
const ok = uni.securities.filter(s => s.productEligibility === 'ELIGIBLE' && !quarantined.has(s.securityId)
  && Identity.securityIdForTicker(s.ticker) === s.securityId && bundleOf.has(s.securityId)
  && existsSync(join(ROOT, LONG, s.securityId + '.json')) && existsSync(join(ROOT, DAILY, s.securityId + '.json'))
  && JSON.parse(txt(join(LONG, s.securityId + '.json'))).points.at(-1)?.[0] >= asOf.slice(0, 8) + '01')
  .sort((a, b) => a.securityId < b.securityId ? -1 : 1);
const step = Math.max(1, Math.floor(ok.length / n)), pick = ok.filter((_, i) => i % step === 0).slice(0, n);
const ids = new Set(pick.map(s => s.securityId));

const files = {};
files[SPY] = JSON.stringify({ ...spy, points: spy.points.filter(p => p[0] >= from) });
files[UNI] = JSON.stringify({ ...uni, securities: uni.securities.filter(s => ids.has(s.securityId)), note: 'Fixture: Auswahl aus ' + UNI });
files[Q] = txt(Q);
const tax = json(TAX), col = tax.rowColumns.indexOf('securityId');
files[TAX] = JSON.stringify({ version: tax.version, rowColumns: tax.rowColumns, rows: tax.rows.filter(r => ids.has(r[col])) });
for (const id of ids) {
  const long = json(join(LONG, id + '.json'));
  files[join(LONG, id + '.json')] = JSON.stringify({ ...long, points: long.points.filter(p => p[0] >= from) });
  files[join(DAILY, id + '.json')] = txt(join(DAILY, id + '.json'));
  files[join(SEC, bundleOf.get(id))] = txt(join(SEC, bundleOf.get(id)));
}
// Lauftag des Tests: der jüngste Tagesstand der ausgewählten Tagesreihen (published-close#lastPoint verlangt asOf <= Lauftag).
const today = [...ids].map(id => JSON.parse(files[join(DAILY, id + '.json')]).asOf).sort().at(-1);
mkdirSync(dirname(join(process.cwd(), out)), { recursive: true });
writeFileSync(out, gzipSync(JSON.stringify({ asOf, today, securities: ids.size, files }), { level: 9 }));
console.log(JSON.stringify({ out, asOf, today, securities: ids.size, files: Object.keys(files).length }));
