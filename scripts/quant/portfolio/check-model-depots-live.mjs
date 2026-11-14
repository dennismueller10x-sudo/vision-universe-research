#!/usr/bin/env node
/* Alarm (kein Code-Gate): Ist die ausgelieferte Musterdepot-Datei frisch und gefüllt?
   Der Test quant/tests/model-depots.test.mjs prüft nur den Erzeuger auf eingefrorenen Daten (Befund O, 14.11.2026);
   ob der Samstagslauf (pipeline-weekly, Teil musterdepots) die Live-Datei geschrieben hat, meldet dieser Check im
   Freshness-Monitor. Frischegrenze aus core/registry/domains.json (modelDepots.freshness.staleAfter, Stunden).
   Aufruf: node scripts/quant/portfolio/check-model-depots-live.mjs --site=https://research.visionuniverse.de
   Exit 1 bei Befund (der Monitor wird rot, GitHub meldet es). Schreibt nichts. */
import { readFileSync } from 'node:fs';

const site = (process.argv.find(a => a.startsWith('--site='))?.slice(7) || 'https://research.visionuniverse.de').replace(/\/$/, '');
const domain = JSON.parse(readFileSync(new URL('../../../core/registry/domains.json', import.meta.url), 'utf8'))
  .domains.find(d => d.id === 'modelDepots');
const url = site + domain.artifact;
const befunde = [];
let doc = null;
try {
  const res = await fetch(url + '?t=' + Date.now(), { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) befunde.push(`HTTP ${res.status}`); else doc = await res.json();
} catch (e) { befunde.push('nicht lesbar: ' + e.message); }
if (doc) {
  const ageH = (Date.now() - Date.parse(doc.asOf + 'T23:59:59Z')) / 3600e3;
  if (!(ageH <= domain.freshness.staleAfter)) befunde.push(`Stand ${doc.asOf} älter als ${domain.freshness.staleAfter} h`);
  if (!Array.isArray(doc.depots) || doc.depots.length !== 5) befunde.push('nicht fünf Depots');
  for (const d of doc.depots || []) if (!(d.positions || []).length) befunde.push(`${d.profileId}: leer (${d.decision && d.decision.state})`);
}
console.log(`Musterdepots live (${url}): ${befunde.length ? 'BEFUND - ' + befunde.join('; ') : 'OK, Stand ' + doc.asOf}`);
process.exit(befunde.length ? 1 : 0);
