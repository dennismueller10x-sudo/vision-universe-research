#!/usr/bin/env node
// Supertrader - IEX-Minuten fuer den Live-Lauf (Runde 9).
//
//   SUPERTRADER_INTRADAY_CACHE=/tmp/x.json TIINGO_API_KEY=... node scripts/supertrader/intraday-prefetch.mjs
//
// Fuer jede Kauf-Stop-Methode: wartende Setups im Protokoll, deren Tageshoch an einem
// noch nicht verarbeiteten Handelstag den Trigger erreichte -> ein Abruf (1-Minuten-IEX,
// ein Tag). Die Datei liegt ausserhalb des Repositorys und wird nicht committet; das Log
// zeigt nur Zaehlwerte. Ohne Schluessel oder bei Fehlern entsteht keine Datei - der Lauf
// faellt dann auf die Tagesbalken-Annahme zurueck.
import fs from 'node:fs';
import { loadUniverse, loadBars, loadLedger, LIVE_ENGINES } from './build.mjs';
import { fetchMinutes, compactBars } from './validation/intraday-oracle.mjs';

const PENDING = new Set(['SETUP', 'ENTRY_READY', 'WATCH']);

export function candidates(engines, ledgerOf, bars) {
  const out = new Set();
  for (const e of engines.filter((x) => x.entryMode === 'BUY_STOP_INTRADAY')) {
    const l = ledgerOf(e);
    for (const s of l.open || []) {
      if (!PENDING.has(s.state) || !Number.isFinite(s.levels?.trigger)) continue;
      const inst = bars.get(s.symbol);
      if (!inst) continue;
      inst.bars.date.forEach((d, i) => { if (d > (l.lastProcessed || '') && inst.bars.high[i] >= s.levels.trigger) out.add(`${s.symbol}|${d}`); });
    }
  }
  return [...out];
}

async function main() {
  const file = process.env.SUPERTRADER_INTRADAY_CACHE, key = process.env.TIINGO_API_KEY;
  if (!file || !key) { console.log('Minutenquelle: kein Schluessel oder Zielpfad - Tagesbalken-Annahme'); return; }
  const { instruments } = loadBars(loadUniverse());
  const todo = candidates(LIVE_ENGINES, loadLedger, instruments);
  const days = {};
  for (const k of todo) { const [t, d] = k.split('|'); const r = await fetchMinutes(t, d, key); days[k] = compactBars(Array.isArray(r.body) ? r.body : []); await new Promise((res) => setTimeout(res, 150)); }
  fs.writeFileSync(file, JSON.stringify({ schema: 'supertrader-intraday-live-1.0.0', fetchedAt: new Date().toISOString(), days }));
  console.log(`Minutenquelle: ${todo.length} Kauf-Stop-Tage, mit Minuten ${Object.values(days).filter((v) => v.m && v.m.length).length}`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error('Minutenquelle fehlgeschlagen: ' + String(e?.message || e).slice(0, 120)); process.exit(0); });
