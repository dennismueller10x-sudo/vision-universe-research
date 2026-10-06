#!/usr/bin/env node
// Minervini Adaptation 1.1.0 – Messlauf (NUR Messung, keine Rueckwirkung auf die Engine).
//
//   ST_WINDOW=DEV|HOLDOUT node scripts/supertrader/replication/minervini-1.1/measure.mjs --out DIR [--limit N]
//
// Gleicher Rahmen wie 2A (Universum, Daten, Kosten, Kennzahlen, SEC-Speicher). Unterschiede: Portfolio-Stufe
// MR-PF-02 (1.1-Simulation) und zwei reine Protokolle: MR-SEPA-12 (SIC-Gruppenrang je Setup) und Ergebnis-
// Mitteilungen waehrend der Haltedauer (ex post, beschreibt den Bereich von MR-ERN-01; keine Regel).
// Laeuft nur gegen einen gueltigen 1.1.0-Freeze (sonst Code 3). DEV und HOLDOUT sind GESEHENE DATEN.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import * as L from '../../validation/lib.mjs';
import { loadPitData } from '../../validation/analyze-methods.mjs';
import { P } from './params.mjs';
import { scanSegment } from '../minervini/signal-engine.mjs';
import { makeSplitRatio } from '../minervini/sepa.mjs';
import { simulatePortfolio, simulateSignals } from './portfolio-sim.mjs';
import { curveStats, tradeStats, turnover, benchmarkStats, signalVsSpy } from '../minervini/metrics.mjs';
import { SEC_STORE_KEY, checkRsDefinition } from '../minervini/measure.mjs';
import { STORE_KEY as EVENTS_STORE_KEY } from '../../data-layer/sec/build-sec-events.mjs';
import { sicAt } from '../../data-layer/sec/industry-sic.mjs';
import { EV, EVENT } from '../../data-layer/sec/earnings-events.mjs';
import { industryRecord } from './industry-record.mjs';
import { verifyFreeze } from './freeze.mjs';
import ENGINE, { CLASSIFICATION } from './engine.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..', '..');

function segmentOf(seg, a, scan) {
  return { id: seg.id, date: a.date, open: a.open, high: a.high, low: a.low, close: a.close, rawClose: a.rawClose, volume: a.volume, volAvg: scan.volAvg, divAdj: a.divAdj,
    delisted: !!seg.delisted, delistClass: seg.delistClass || null, setups: scan.setups };
}

// Ergebnis-Mitteilungen (8-K 2.02, ohne Aenderungen/Duplikate) mit entry <= Einreichung < exit. Ex post, nur Beschreibung.
export function releasesDuringHold(events, entryDate, exitDate) {
  return (events || []).filter((e) => e[EV.TYPE] === EVENT.EARNINGS_RELEASE && e[EV.FILED] >= entryDate && e[EV.FILED] < exitDate).length;
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const OUT = arg('--out') || path.join(os.tmpdir(), 'mrepl11');
  const LIMIT = arg('--limit') ? Number(arg('--limit')) : 0;
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  const log = (m) => console.log(`[mrepl11 ${L.WINDOW_NAME} +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);

  const freeze = verifyFreeze();
  if (!freeze.ok) { console.error('Kein Messlauf ohne gueltigen Fidelity Freeze 1.1.0: ' + freeze.reason); process.exit(3); }
  log(`Freeze ok: Regelbuch ${freeze.rulebookHash.slice(0, 12)}, Code ${freeze.codeHash.slice(0, 12)}, Engine ${ENGINE.id}@${ENGINE.version} (${CLASSIFICATION.canonicalName})`);
  if (!checkRsDefinition(fs.readFileSync(path.join(root, 'scripts/supertrader/validation/analyze-methods.mjs'), 'utf8'))) { console.error('RS-Definition der Datenschicht weicht vom Regelbuch ab (MR-TT-08).'); process.exit(3); }

  const W = L.WINDOW;
  const D = await loadPitData({ LIMIT, log, excludeNonEquity: true, delistPit: true });
  const { segs, calendar, spyTR, mine, driver, budget, dataFingerprint, delistCoverage } = D;
  budget.consumeClassB(1, 'GET sec facts mrepl');
  const sbuf = await driver.get(mine.seriesPrefix + SEC_STORE_KEY);
  if (!sbuf) { console.error(`SEC-Speicher ${SEC_STORE_KEY} fehlt.`); process.exit(3); }
  const store = JSON.parse(zlib.gunzipSync(sbuf).toString('utf8'));
  const facts = store.records || {};
  budget.consumeClassB(1, 'GET sec events/sic');
  const ebuf = await driver.get(mine.seriesPrefix + EVENTS_STORE_KEY);
  if (!ebuf) { console.error(`SEC-Datenlayer ${EVENTS_STORE_KEY} fehlt (erst Modus sec-events laufen lassen).`); process.exit(3); }
  const ev = JSON.parse(zlib.gunzipSync(ebuf).toString('utf8'));
  const cikOf = (segId) => ev.listingCik[segId.split('#')[0]] || null;
  const dataOf = (segId) => { const c = cikOf(segId); return c ? ev.byCik[c] || null : null; };
  log(`SEC-Erstmeldungen ${Object.keys(facts).length} Listings; Datenlayer ${Object.keys(ev.byCik).length} CIKs (${ev.schema.events}, ${ev.schema.sic})`);

  const scanTotals = { evaluated: 0, universe: 0, trend: 0, vcp: 0, setups: 0, rejected: {} };
  const portfolioSegs = [], signals = [];
  const rsByDate = new Map(); // Datum -> [{id, rsPct}] nur fuer Setup-Tage (zweiter Durchlauf)
  let withFund = 0, k = 0;
  for (const seg of segs) {
    const a = L.adjustSeries(seg.raw);
    const fund = facts[seg.id.split('#')[0]] || null;
    if (fund) withFund++;
    const ctx = { bars: { date: a.date, open: a.open, high: a.high, low: a.low, close: a.close, volume: a.volume }, rawClose: a.rawClose, rsPct: seg.cross?.rs || [], fund, splitRatio: makeSplitRatio(seg.raw) };
    const fromIndex = a.date.findIndex((d) => d >= W.from);
    if (fromIndex < 0) continue;
    const scan = scanSegment(ctx, P, { fromIndex });
    for (const key of ['evaluated', 'universe', 'trend', 'vcp', 'setups']) scanTotals[key] += scan.stats[key];
    for (const [r, c] of Object.entries(scan.stats.rejected)) scanTotals.rejected[r] = (r in scanTotals.rejected ? scanTotals.rejected[r] : 0) + c;
    if (scan.setups.size) {
      const s = segmentOf(seg, a, scan);
      portfolioSegs.push(s);
      for (const t of scan.setups.keys()) rsByDate.set(a.date[t], null);
      for (const x of simulateSignals(s, P)) if (x.entryDate >= W.from && x.entryDate <= W.to) signals.push(x);
    }
    if (++k % 1000 === 0) log(`Titel ${k}/${segs.length}`);
  }
  log(`Setups ${scanTotals.setups}, Titel mit Setup ${portfolioSegs.length}, Titel mit SEC-Daten ${withFund}/${segs.length}`);

  // MR-SEPA-12 (Protokoll): Querschnitt an Setup-Tagen - RS-Perzentil und SIC point-in-time aller Titel.
  for (const d of rsByDate.keys()) rsByDate.set(d, []);
  for (const seg of segs) {
    const rs = seg.cross?.rs || [], dates = L.adjustSeries(seg.raw).date; // cross.rs ist auf die bereinigten Daten ausgerichtet
    const hist = dataOf(seg.id)?.sic || null;
    for (let i = 0; i < dates.length; i++) {
      const bucket = rsByDate.get(dates[i]);
      if (bucket && Number.isFinite(rs[i])) bucket.push({ id: seg.id, sic: hist ? sicAt(hist, dates[i]) : null, rsPct: rs[i] });
    }
  }
  const ind = { setups: 0, known: 0, topN: 0, reasons: {} };
  for (const s of portfolioSegs) for (const [t, setup] of s.setups) {
    const rec = industryRecord(rsByDate.get(s.date[t]) || [], s.id, P);
    setup.industry = rec;
    ind.setups++;
    if (rec.known) { ind.known++; if (rec.topN) ind.topN++; } else ind.reasons[rec.reason] = (rec.reason in ind.reasons ? ind.reasons[rec.reason] : 0) + 1;
  }
  rsByDate.clear();

  const cal = calendar.filter((d) => d >= W.from && d <= W.to);
  const run = simulatePortfolio(portfolioSegs, cal, P);
  const spyByDate = new Map(spyTR.map((p) => [p.date, p.value]));
  const pf = curveStats(run.curve), spy = benchmarkStats(spyTR, cal[0], cal[cal.length - 1]);
  const stageDays = run.curve.reduce((m, c) => { m[c.stage] = (c.stage in m ? m[c.stage] : 0) + 1; return m; }, {});
  const earn = { trades: 0, withEventData: 0, heldThroughRelease: 0 };
  const tradesCompact = run.trades.map((t) => {
    const evs = dataOf(t.segId)?.events || null;
    const n = evs ? releasesDuringHold(evs, t.entryDate, t.exitDate) : null;
    earn.trades++; if (evs) { earn.withEventData++; if (n > 0) earn.heldThroughRelease++; }
    return { seg: t.segId, entry: t.entryDate, exit: t.exitDate, kind: t.kind, ret: t.returnPct, r: t.rMultiple, mfe: t.mfe, mae: t.mae, hold: t.holdSessions, exits: t.exits.map((x) => x.ruleId), code33: t.setup?.sepa?.code33 ?? null, breakoutVolumeRatio: t.setup?.breakoutVolumeRatio ?? null, releasesDuringHold: n, shares0: t.shares0, entryPrice: t.entryPrice };
  });
  const result = {
    schema: 'vu-minervini-adaptation-measurement-1.1.0',
    label: 'GESEHENE DATEN: DEV und HOLDOUT wurden in R14 geoeffnet. Nur Beschreibung, keine Optimierung, keine Rueckwirkung auf die Engine.',
    window: L.WINDOW_NAME, from: cal[0], to: cal[cal.length - 1], at: new Date().toISOString(), commit: process.env.GITHUB_SHA || null,
    engine: { id: ENGINE.id, version: ENGINE.version, canonicalName: CLASSIFICATION.canonicalName, productClass: CLASSIFICATION.productClass, parent: ENGINE.parent },
    freeze: { rulebookHash: freeze.rulebookHash, codeHash: freeze.codeHash, frozenCommit: freeze.commit },
    data: { dataFingerprint, segments: segs.length, withSecFacts: withFund, delistCoverage, secSchema: store.schema, eventsSchema: ev.schema, eventsCiks: Object.keys(ev.byCik).length },
    scan: scanTotals,
    portfolio: { ...pf, turnoverPerYear: turnover(run.trades, run.curve), trades: tradeStats(run.trades), book: run.book, stageDays },
    signals: { ...tradeStats(signals), vsSpySameHolding: signalVsSpy(signals, spyByDate) },
    spy,
    recorded: { industry: ind, earningsDuringHold: earn },
    tradesCompact,
    curve: run.curve,
  };
  const pem = fs.readFileSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  const name = `minervini-adaptation-1.1-${L.WINDOW_NAME.toLowerCase()}${LIMIT ? '-smoke' : ''}`;
  fs.writeFileSync(path.join(OUT, `${name}.sealed.json`), L.encryptForOwner(pem, Buffer.from(JSON.stringify(result))));
  log(`Trades Portfolio ${result.portfolio.trades.count}, Signale ${result.signals.count}; Branche bekannt ${ind.known}/${ind.setups} Setups; Ereignisdaten ${earn.withEventData}/${earn.trades} Trades`);
  if (!LIMIT) log(`Richtung: CAGR ${pf && spy ? (pf.cagr > spy.cagr ? 'ueber' : 'unter') : '?'} SPY; Max Drawdown ${pf && spy ? (pf.maxDrawdown > spy.maxDrawdown ? 'kleiner' : 'groesser') : '?'} als SPY; Signale im Mittel ${result.signals.vsSpySameHolding.meanExcess > 0 ? 'ueber' : 'unter'} SPY bei gleicher Haltedauer`);
  log(`verschluesselt: ${name}.sealed.json`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
