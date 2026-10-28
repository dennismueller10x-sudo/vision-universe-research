#!/usr/bin/env node
/**
 * Erweitert die eingefrorene Golden-Fixture von Supertrader 8.0 (sf8-golden-bars.json) um weitere echte Titel, ohne die
 * vorhandenen anzutasten. Quelle und Form wie die bestehenden Einträge:
 *  - Tagesbalken: quant/data/product/technical-signals-v1 über eod-adapter.mjs#loadEodSecurities, bis einschließlich asOf,
 *    die letzten 270 Sitzungen;
 *  - Wochenschlüsse: discover-series-long (eod-adapter.mjs#loadWeeklyCloses) ab der Woche, in die der Tag 14 Monate vor
 *    asOf fällt, davor nur der historische Höchstschluss.
 *
 *   node scripts/supertrader/source-faithful/product/golden-fixture-add.mjs --root <Checkout des Datenstands> --tickers WDAY,MGLD [--check AAPL] [--write]
 *
 * --root: die Materialisierung hält nur 270 Sitzungen. Für den Stand 2026-10-23 ist das ein Checkout von Commit
 *   7cc3f262739b (Daten vor der Materialisierung c04c7a5 vom 27.10.); ohne --root gilt der aktuelle Checkout.
 *
 * --check T baut T neu und vergleicht mit dem eingefrorenen Eintrag (Nachweis der Reproduzierbarkeit, Exit 1 bei
 * Abweichung). Ohne --write wird nur berichtet. Eine Erweiterung ist eine fachliche Änderung der Golden Cases.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEodSecurities, loadWeeklyCloses } from './eod-adapter.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(HERE, '..', '..', 'tests', 'fixtures', 'sf8-golden-bars.json');
const argv = process.argv.slice(2), arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const META_KEYS = ['companyName', 'exchange', 'instrumentType', 'activeStatus', 'adrHint', 'spacHint', 'listingStart', 'sic4', 'secBlankCheck', 'adjustmentStatus', 'caReconciliation', 'splitEvents', 'shard'];
const SESSIONS = 270;

export function fixtureEntry(sec, asOf, root) {
  const bars = sec.bars.filter((b) => b.date <= asOf).slice(-SESSIONS);
  if (bars.length < SESSIONS || bars.at(-1).date !== asOf) throw new Error(`${sec.ticker}: keine ${SESSIONS} Sitzungen bis ${asOf}`);
  const from = new Date(`${asOf}T00:00:00Z`); from.setUTCMonth(from.getUTCMonth() - 14);
  const cut = from.toISOString().slice(0, 10), weeklyAll = (loadWeeklyCloses(sec.id, root ? { root } : {}) || []).filter((w) => w.date <= asOf);
  // ab der letzten Woche vor dem Schnitt (die Woche, in die der Schnitt fällt), davor nur der Höchstschluss
  const first = Math.max(0, weeklyAll.findIndex((w) => w.date >= cut) - 1), before = weeklyAll.slice(0, first), after = weeklyAll.slice(first);
  const ath = before.reduce((m, w) => (m === null || w.close > m.close ? w : m), null);
  const weekly = [...(ath ? [ath] : []), ...after].map((w) => [w.date, w.close]);
  const meta = Object.fromEntries(META_KEYS.map((k) => [k, sec.meta[k] ?? null]));
  const col = (k) => bars.map((b) => b[k]);
  return { ticker: sec.ticker, id: sec.id, meta, cols: { d: col('date'), o: col('open'), h: col('high'), l: col('low'), c: col('close'), v: col('volume') }, weekly };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const F = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const tickers = (arg('--tickers') || '').split(',').map((t) => t.trim()).filter(Boolean), check = arg('--check');
  const root = arg('--root') ? path.resolve(arg('--root')) : undefined;
  const { securities } = loadEodSecurities({ ...(root ? { root } : {}), tickers: [...tickers, ...(check ? [check] : [])] });
  const by = new Map(securities.map((s) => [s.ticker, s]));
  if (check) {
    const want = F.securities.find((s) => s.ticker === check), got = by.get(check) && fixtureEntry(by.get(check), F.asOf, root);
    const same = JSON.stringify(want) === JSON.stringify(got);
    console.log(`[sf8-golden-add] Reproduktion ${check}: ${same ? 'bitgleich' : 'ABWEICHUNG'}`);
    if (!same) { for (const k of ['meta', 'weekly', 'cols', 'id']) if (JSON.stringify(want?.[k]) !== JSON.stringify(got?.[k])) console.log(`  ${k}: ${JSON.stringify(want?.[k]).slice(0, 300)}\n  ->  ${JSON.stringify(got?.[k]).slice(0, 300)}`); process.exit(1); }
  }
  const add = [];
  for (const t of tickers) {
    if (F.securities.some((s) => s.ticker === t)) { console.error(`${t} ist bereits enthalten`); process.exit(2); }
    if (!by.has(t)) { console.error(`${t} nicht im Universum oder abgelehnt`); process.exit(2); }
    add.push(fixtureEntry(by.get(t), F.asOf, root));
  }
  console.log(`[sf8-golden-add] ${add.map((a) => `${a.ticker} ${a.cols.d[0]}..${a.cols.d.at(-1)} (${a.weekly.length} Wochen)`).join(', ') || 'nichts hinzugefügt'}`);
  if (argv.includes('--write') && add.length) { F.securities.push(...add); fs.writeFileSync(FILE, JSON.stringify(F) + '\n'); }
}
