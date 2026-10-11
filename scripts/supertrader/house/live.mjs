#!/usr/bin/env node
// VU Hausstrategie: Beobachtungsdepot HS4-V03 live (LIVE-HS4-V03.json). Vorwaertslauf mit eingefrorenen Regeln.
//
// Am letzten Handelstag eines Monats (nach Schluss, Daten des Tages vorhanden) wird die Monatsentscheidung
// gerechnet und VOR der Ausfuehrung zur naechsten Eroeffnung mit Zeitstempel ins Repository geschrieben
// (supertrader/data/ledger/VU_HOUSE_HS4_V03.json). Veroeffentlicht werden nur Titel und Zielgewichte -
// keine Kurse, keine Renditen (Rechte an abgeleiteten Kennzahlen ungeklaert). Keine Rueckrechnung.
//
//   node scripts/supertrader/house/live.mjs [--force] [--dry-run]
//     --force    Entscheidung auch ausserhalb des Monatsendes (nur Vorschau-Datei, nie Ledger)
//     --dry-run  nichts schreiben, nur Zaehlwerte loggen
//     --start    Startentscheidung ausserhalb des Monatsendes, nur solange das Ledger leer ist (einmalig)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as L from '../validation/lib.mjs';
import { PIT_KEY_R13 } from '../validation/sec-pit.mjs';
import { prepareStock, crossSection, concentratedWeights } from './engine.mjs';
import { fileHash } from './seal.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const Store = require(path.join(root, 'quant/engines/history-store.js'));
const Guard = require(path.join(root, 'quant/engines/zero-cost-guard.js'));
const LIVE = JSON.parse(fs.readFileSync(path.join(here, 'LIVE-HS4-V03.json'), 'utf8'));
export const LEDGER_PATH = path.join(root, 'supertrader/data/ledger/VU_HOUSE_HS4_V03.json');

// Naechster Handelstag nach d (Wochenende und NYSE-Feiertage aus quant/config/market-calendar.json).
export function nextTradingDay(d, holidays) {
  const t = new Date(d + 'T00:00:00Z');
  for (;;) { t.setUTCDate(t.getUTCDate() + 1); const s = t.toISOString().slice(0, 10), wd = t.getUTCDay(); if (wd !== 0 && wd !== 6 && !holidays.has(s)) return s; }
}
export function isMonthEnd(d, holidays) { return nextTradingDay(d, holidays).slice(0, 7) !== d.slice(0, 7); }

// Eingefrorene Regeln: die Hashes in LIVE-HS4-V03.json muessen zu Engine und Vorregistrierung passen.
export function assertLiveFrozen() {
  for (const [file, want] of Object.entries(LIVE.hashes)) {
    const got = fileHash(path.join(here, file));
    if (got !== want) throw new Error(`Live gesperrt: ${file} seit dem Einfrieren veraendert (neue Version = neue Freigabe).`);
  }
}

// Entscheidung aus bereits geladenen Aktien (prepareStock-Form) am letzten Kalendertag. Rein, testbar.
export function decide(stocks, calendar, ledger) {
  const k = calendar.length - 1, D = calendar[k];
  const elig = crossSection(stocks, k, D);
  const held = new Set((ledger.current?.holdings || []).map((h) => h.id));
  const tw = concentratedWeights(elig, { factors: LIVE.rule.factors, n: LIVE.rule.n }, held);
  const holdings = [...tw.entries()].map(([id, x]) => ({ id, ticker: id.split(':')[2], weight: Math.round(x.w * 1e4) / 1e4 })).sort((a, b) => b.weight - a.weight || a.ticker.localeCompare(b.ticker));
  const before = new Set(held), after = new Set(holdings.map((h) => h.id));
  return { date: D, eligible: elig.length, holdings,
    buys: holdings.filter((h) => !before.has(h.id)).map((h) => h.ticker), sells: [...before].filter((id) => !after.has(id)).map((id) => id.split(':')[2]) };
}

export function emptyLedger() {
  return { schema: 'supertrader-house-ledger-1.0.0', strategyId: LIVE.id, label: LIVE.label, status: 'LIVE_MODEL_OBSERVATION',
    note: LIVE.note, rules: LIVE.ruleText, liveSince: null, current: null, decisions: [] };
}

function rawFromStoreBars(bars) {
  return bars.map((b) => ({ date: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? 0, adjClose: b.adjustedClose ?? b.adjClose ?? null, dividend: b.dividend ?? 0, splitFactor: b.splitFactor ?? 1 }))
    .filter((b) => b.close != null && b.date >= LIVE.historyFrom).sort((a, b) => a.date.localeCompare(b.date));
}

async function main() {
  const argv = process.argv.slice(2);
  const FORCE = argv.includes('--force'), DRY = argv.includes('--dry-run');
  const START = argv.includes('--start');
  const t0 = Date.now();
  const log = (m) => console.log(`[house-live +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
  assertLiveFrozen();
  const cal = JSON.parse(fs.readFileSync(path.join(root, 'quant/config/market-calendar.json'), 'utf8'));
  const holidays = new Set(cal.exchanges.XNYS.holidays);
  const ledger = fs.existsSync(LEDGER_PATH) ? JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')) : emptyLedger();

  // Universum: heute gelistete Stammaktien/ADR/REIT wie die Validierung (Listentabelle, ohne ETF/ETN/Fonds).
  const KEY = process.env.TIINGO_API_KEY || '';
  const zip = Buffer.from(await (await fetch(L.LIST_URL, { headers: KEY ? { Authorization: 'Token ' + KEY } : {} })).arrayBuffer());
  const rows = L.parseTickerCsv(L.unzipCsv(zip));
  const uni = JSON.parse(fs.readFileSync(path.join(root, 'quant/data/market/scale/universe-FULL_UNIVERSE.json'), 'utf8'));
  const elig = JSON.parse(fs.readFileSync(path.join(root, 'quant/data/market/security-master/eligibility.json'), 'utf8'));
  const cls = new Map(elig.decisions.map((d) => [d.ticker, d.instrument_type]));
  const storeActive = new Map(uni.securities.filter((s) => s.active !== false).map((s) => [s.ticker, { startDate: s.startDate, instrumentType: cls.get(s.ticker) || null }]));
  const names = fs.existsSync(path.join(root, 'quant/data/market/security-master/company-names.json')) ? new Map((JSON.parse(fs.readFileSync(path.join(root, 'quant/data/market/security-master/company-names.json'), 'utf8')).rows || []).map((r) => [r.ticker, r.companyName])) : new Map();
  const listings = L.buildListingTable(rows, storeActive, { today: new Date().toISOString().slice(0, 10) })
    .filter((l) => l.source === 'STORE_ACTIVE' && L.INCLUDED_CLASSES.has(l.storeClass) && !L.nonStockProduct({ ticker: l.ticker, exchange: l.exchange, name: names.get(l.ticker) }));
  log(`Listings ${listings.length}`);

  const { createS3DriverFromEnv } = await import(path.join(root, 'scripts/market/storage/s3-driver.mjs'));
  const driver = createS3DriverFromEnv(process.env);
  const budget = Guard.createBudget({ classAOperations: 10, classBOperations: 12000 });
  const main = Store.createHistoryStore({ driver, provider: 'tiingo', market: 'US', budget });
  const mine = Store.createHistoryStore({ driver, provider: 'tiingo-delisted', market: 'US', budget });
  budget.consumeClassB(1, 'GET sec pit r13');
  const sbuf = await driver.get(mine.seriesPrefix + PIT_KEY_R13);
  const pit = sbuf ? JSON.parse(zlib.gunzipSync(sbuf).toString('utf8')) : {};
  log(`SEC-Eintraege ${Object.keys(pit).length}`);

  // Kalender: SPY aus der kanonischen Ablage, sonst Vereinigung der Handelstage grosser Titel.
  let calendar = null;
  for (const key of ['SPY', 'ref_SPY']) { const s = await main.getSeries(key).catch(() => null); if (s?.bars?.length) { calendar = rawFromStoreBars(s.bars).map((b) => b.date); log(`Kalender aus ${key}`); break; } }
  // Vor dem teuren Laden aller Reihen: nur am Monatsende (oder erzwungen) und nur einmal je Stichtag.
  if (calendar) {
    const D0 = calendar.at(-1);
    if (ledger.decisions.some((x) => x.date === D0)) { log(`Entscheidung fuer ${D0} bereits im Ledger - nichts zu tun`); return; }
    if (START && ledger.decisions.length) { log('Startentscheidung nur bei leerem Ledger - nichts zu tun'); return; }
    if (!isMonthEnd(D0, holidays) && !FORCE && !START) { log(`${D0} ist kein Monatsende - nichts zu tun`); return; }
  }
  const raws = new Map();
  let n = 0;
  for (const l of listings) { const s = await main.getSeries(l.ticker).catch(() => null); if (s?.bars?.length) raws.set(l.id, rawFromStoreBars(s.bars)); if (++n % 1000 === 0) log(`geladen ${n}`); }
  if (!calendar) { const set = new Set(); for (const r of raws.values()) for (const b of r) set.add(b.date); calendar = [...set].sort(); log('Kalender aus Titelbalken'); }
  const calIndex = new Map(calendar.map((d, i) => [d, i]));
  const stocks = [];
  for (const l of listings) {
    const raw = (raws.get(l.id) || []).filter((b) => calIndex.has(b.date));
    const seg = L.splitSegments(raw).at(-1) || [];
    if (seg.length < 300) continue;
    const a = L.adjustSeries(seg), f = pit[l.id];
    stocks.push(prepareStock({ id: l.id, survivor: true, delisted: false, cls: l.storeClass, date: a.date, open: a.open, high: a.high, low: a.low, close: a.close,
      rawClose: a.rawClose, rawVolume: a.rawVolume, divAdj: a.divAdj, split: a.split, fund: f ? { eps: f.eps, rev: f.rev, shares: f.shares || [], cik: f.cik, taxonomy: f.taxonomy || null } : null }, calIndex));
  }
  const D = calendar.at(-1);
  log(`Aktien ${stocks.length}, letzter Handelstag ${D}`);
  const monthEnd = isMonthEnd(D, holidays);
  if (ledger.decisions.some((x) => x.date === D)) { log('Entscheidung fuer diesen Tag bereits im Ledger - nichts zu tun'); return; }
  if (START && ledger.decisions.length) { log('Startentscheidung nur bei leerem Ledger - nichts zu tun'); return; }
  if (!monthEnd && !FORCE && !START) { log('Kein Monatsende - nichts zu tun'); return; }
  const dec = decide(stocks, calendar, ledger);
  const entry = { ...dec, kind: START && !monthEnd ? 'START' : 'MONTH_END', executeOn: nextTradingDay(D, holidays), decidedAt: new Date().toISOString(), commit: process.env.GITHUB_SHA || null, rulesHash: LIVE.hashes['engine.mjs'] };
  log(`Entscheidung ${D}: zulaessig ${dec.eligible}, Titel ${dec.holdings.length}, Kaeufe ${dec.buys.length}, Verkaeufe ${dec.sells.length}`);
  if (DRY) return;
  if (!monthEnd && !START) { fs.writeFileSync(path.join(root, 'supertrader/data/house-hs4-v03-preview.json'), JSON.stringify({ preview: true, ...entry }, null, 2) + '\n'); log('Vorschau geschrieben (kein Monatsende, nicht im Ledger)'); return; }
  ledger.liveSince ||= D;
  ledger.current = { date: D, holdings: dec.holdings };
  ledger.nextDecision = (() => { let d = nextTradingDay(D, holidays); while (!isMonthEnd(d, holidays)) d = nextTradingDay(d, holidays); return d; })();
  ledger.decisions.push(entry);
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + '\n');
  log('Ledger geschrieben');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
