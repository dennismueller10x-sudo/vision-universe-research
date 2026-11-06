#!/usr/bin/env node
// VU Hausstrategie: Beobachtungsdepot HS4-V03 live (LIVE-HS4-V03.json). Vorwaertslauf mit eingefrorenen Regeln.
//
// Am letzten Handelstag eines Monats (nach Schluss, Daten des Tages vorhanden) wird die Monatsentscheidung
// gerechnet und VOR der Ausfuehrung zur naechsten Eroeffnung mit Zeitstempel ins Repository geschrieben
// Owner-Linie 05.11.2026 (Plan §11, EINORDNUNG §0 L2/L3): Vision Universe zeigt keine Kauf- oder Verkaufsempfehlungen.
// Der vollstaendige Ledger (aktueller Bestand, Kaeufe/Verkaeufe) liegt deshalb nur privat in der History-Ablage
// (PRIVATE_LEDGER_KEY). Oeffentlich (supertrader/data/ledger/VU_HOUSE_HS4_V03.json, Schema 2.0.0) stehen je Entscheidung
// Datum, Zahl der Titel und ein SHA-256 des Bestands; die Titel selbst erst, wenn der Stichtag mindestens
// HOLDINGS_LAG_DAYS (365) Tage zurueckliegt. Kein aktueller Bestand, kein Rein/Raus-Protokoll, keine Kurse, keine Renditen.
//
//   node scripts/supertrader/house/live.mjs [--force] [--dry-run]
//     --force    Entscheidung auch ausserhalb des Monatsendes (nur Vorschau-Datei, nie Ledger)
//     --dry-run  nichts schreiben, nur Zaehlwerte loggen
//     --start    Startentscheidung ausserhalb des Monatsendes, nur solange das Ledger leer ist (einmalig)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import os from 'node:os';
import crypto from 'node:crypto';
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

export const HOLDINGS_LAG_DAYS = 365;
export const PUBLIC_SCHEMA = 'supertrader-house-ledger-2.0.0';
export const PRIVATE_LEDGER_KEY = 'supertrader-house/VU_HOUSE_HS4_V03/ledger-private-1.json';

// Bestands-Fingerabdruck: Titel-IDs und Gewichte, sortiert; ohne Kenntnis der Titel nicht umkehrbar.
export function holdingsSha256(holdings) {
  const rows = (holdings || []).map((h) => [h.id, h.weight]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
const minusDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') - n * 864e5).toISOString().slice(0, 10);

// Oeffentliche Sicht des privaten Ledgers am Stichtag asOf: kein aktueller Bestand, keine Kaeufe/Verkaeufe; Titel nur
// fuer Entscheidungen mit Datum <= asOf - HOLDINGS_LAG_DAYS.
export function publicLedger(priv, asOf) {
  const cutoff = minusDays(asOf, HOLDINGS_LAG_DAYS);
  return {
    schema: PUBLIC_SCHEMA, strategyId: priv.strategyId ?? LIVE.id, label: priv.label ?? LIVE.label, status: 'LIVE_MODEL_OBSERVATION',
    note: LIVE.note, rules: LIVE.ruleText, liveSince: priv.liveSince ?? null, nextDecision: priv.nextDecision ?? null,
    asOf, holdingsLagDays: HOLDINGS_LAG_DAYS, holdingsVisibleThrough: cutoff,
    disclosure: 'Keine Anlageempfehlung. Bestaende erscheinen erst, wenn der Stichtag mindestens 365 Tage zurueckliegt; davor nur Zahl der Titel und Fingerabdruck.',
    decisions: (priv.decisions || []).map((d) => ({
      date: d.date, kind: d.kind ?? null, executeOn: d.executeOn ?? null, decidedAt: d.decidedAt ?? null, commit: d.commit ?? null, rulesHash: d.rulesHash ?? null,
      eligible: d.eligible ?? null, count: (d.holdings || []).length, holdingsSha256: holdingsSha256(d.holdings),
      holdings: d.date <= cutoff ? (d.holdings || []).map((h) => ({ id: h.id, ticker: h.ticker, weight: h.weight })) : null,
    })),
  };
}

// Privater Ledger aus der History-Ablage; fehlt er, einmalige Uebernahme aus dem alten oeffentlichen Ledger (Schema 1.0.0).
export function resolvePrivate(stored, pub) {
  if (stored) return { ledger: stored, migrated: false };
  if (pub && pub.schema === 'supertrader-house-ledger-1.0.0') return { ledger: pub, migrated: true };
  if (pub && pub.schema === PUBLIC_SCHEMA && (pub.decisions || []).length) throw new Error('Privater Ledger fehlt, oeffentlicher Ledger hat Entscheidungen - Bestand unbekannt (fail closed).');
  return { ledger: emptyLedger(), migrated: false };
}
// Abgleich: jede oeffentliche Entscheidung muss zum privaten Ledger passen (gleiches Datum, gleicher Fingerabdruck).
export function assertPublicMatchesPrivate(pub, priv) {
  if (!pub || pub.schema !== PUBLIC_SCHEMA) return;
  const byDate = new Map((priv.decisions || []).map((d) => [d.date, holdingsSha256(d.holdings)]));
  for (const d of pub.decisions || []) if (byDate.get(d.date) !== d.holdingsSha256) throw new Error(`Oeffentlicher und privater Ledger weichen ab (${d.date}) - fail closed.`);
}

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
  const pub = fs.existsSync(LEDGER_PATH) ? JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')) : null;
  const { createS3DriverFromEnv } = await import(path.join(root, 'scripts/market/storage/s3-driver.mjs'));
  const driver = createS3DriverFromEnv(process.env);
  const storedBuf = await driver.get(PRIVATE_LEDGER_KEY);
  const { ledger, migrated } = resolvePrivate(storedBuf ? JSON.parse(storedBuf.toString('utf8')) : null, pub);
  assertPublicMatchesPrivate(pub, ledger);
  const writePublic = (asOf) => { fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true }); fs.writeFileSync(LEDGER_PATH, JSON.stringify(publicLedger(ledger, asOf), null, 2) + '\n'); };
  if (!DRY && (migrated || (pub && pub.schema !== PUBLIC_SCHEMA))) {
    // Umstellung (Owner-Linie 05.11.2026): erst privat sichern, dann die oeffentliche Sicht ohne aktuellen Bestand schreiben
    await driver.put(PRIVATE_LEDGER_KEY, Buffer.from(JSON.stringify(ledger)), { contentType: 'application/json' });
    writePublic(new Date().toISOString().slice(0, 10));
    log('Ledger umgestellt: privat gesichert, oeffentlich ohne aktuellen Bestand (Schema 2.0.0)');
  }

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
  if (!monthEnd && !START) { fs.writeFileSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'house-hs4-v03-preview.json'), JSON.stringify({ preview: true, ...entry }, null, 2) + '\n'); log('Vorschau geschrieben (nur temporaer, nie im Repository)'); return; }
  ledger.liveSince ||= D;
  ledger.current = { date: D, holdings: dec.holdings };
  ledger.nextDecision = (() => { let d = nextTradingDay(D, holidays); while (!isMonthEnd(d, holidays)) d = nextTradingDay(d, holidays); return d; })();
  ledger.decisions.push(entry);
  // zuerst privat (vollstaendig), dann die oeffentliche Sicht; scheitert die private Sicherung, entsteht kein oeffentlicher Stand
  await driver.put(PRIVATE_LEDGER_KEY, Buffer.from(JSON.stringify(ledger)), { contentType: 'application/json' });
  writePublic(D);
  log('Ledger geschrieben (privat vollstaendig, oeffentlich ohne aktuellen Bestand)');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
