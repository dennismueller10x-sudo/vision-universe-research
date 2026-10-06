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

// Ergebnis-Mitteilungen (8-K 2.02, ohne Aenderungen/Duplikate) waehrend der Haltedauer. Ex post, nur Beschreibung.
// Das Einreichungsdatum traegt keine Uhrzeit, die verlaesslich waere (acceptanceDateTime teils versetzt): Mitteilungen
// am Einstiegs- oder Ausstiegstag sind mehrdeutig (vor oder nach dem Kauf / vor dem Gap-Ausstieg) und werden getrennt
// gezaehlt. strict = entry < Einreichung < exit; inclusive = entry <= Einreichung <= exit.
export function releasesDuringHold(events, entryDate, exitDate) {
  const rel = (events || []).filter((e) => e[EV.TYPE] === EVENT.EARNINGS_RELEASE);
  return {
    strict: rel.filter((e) => e[EV.FILED] > entryDate && e[EV.FILED] < exitDate).length,
    entryDay: rel.filter((e) => e[EV.FILED] === entryDate).length,
    exitDay: rel.filter((e) => e[EV.FILED] === exitDate && exitDate !== entryDate).length,
    inclusive: rel.filter((e) => e[EV.FILED] >= entryDate && e[EV.FILED] <= exitDate).length,
  };
}
// Mindestabdeckung des Datenlayers (Anteil CIKs ohne Abruffehler); sonst kein Messlauf (fail closed).
export const MIN_LAYER_COVERAGE = 0.99;

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
  if (freeze.sharedChanged.length) { console.error('Gemeinsame Bausteine seit dem Freeze geaendert: ' + freeze.sharedChanged.join(', ')); process.exit(3); }
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
  if (!ev.stats || !(ev.stats.ciks > 0) || (ev.stats.ciks - ev.stats.errors) / ev.stats.ciks < MIN_LAYER_COVERAGE) { console.error('SEC-Datenlayer unvollstaendig oder ohne Statistik (neu bauen).'); process.exit(3); }
  const cikOf = (segId) => ev.listingCik[segId.split('#')[0]] || null;
  const dataOf = (segId) => { const c = cikOf(segId); return c ? ev.byCik[c] || null : null; };
  log(`SEC-Erstmeldungen ${Object.keys(facts).length} Listings; Datenlayer ${Object.keys(ev.byCik).length} CIKs (${ev.schema.events}, ${ev.schema.sic})`);

  const scanTotals = { evaluated: 0, universe: 0, trend: 0, vcp: 0, setups: 0, rejected: {} };
  const portfolioSegs = [], signals = [];
  const setupDates = new Set(); // Querschnitt nur an Setup-Tagen (zweiter Durchlauf)
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
      for (const t of scan.setups.keys()) setupDates.add(a.date[t]);
      for (const x of simulateSignals(s, P)) if (x.entryDate >= W.from && x.entryDate <= W.to) signals.push(x);
    }
    if (++k % 1000 === 0) log(`Titel ${k}/${segs.length}`);
  }
  log(`Setups ${scanTotals.setups}, Titel mit Setup ${portfolioSegs.length}, Titel mit SEC-Daten ${withFund}/${segs.length}`);

  // MR-SEPA-12 (Protokoll): Querschnitt an Setup-Tagen - RS-Perzentil (kompakt: Segmentindex + Wert) aller Titel;
  // SIC point-in-time erst bei der Auswertung je Tag. cross.rs ist 1:1 auf seg.raw ausgerichtet (adjustSeries).
  const buckets = new Map([...setupDates].map((d) => [d, { idx: [], rs: [] }]));
  segs.forEach((seg, si) => {
    const rs = seg.cross?.rs || [];
    for (let i = 0; i < seg.raw.length; i++) { const b = buckets.get(seg.raw[i].date); if (b && Number.isFinite(rs[i])) { b.idx.push(si); b.rs.push(rs[i]); } }
  });
  const setupsByDate = new Map();
  for (const s of portfolioSegs) for (const t of s.setups.keys()) (setupsByDate.get(s.date[t]) || setupsByDate.set(s.date[t], []).get(s.date[t])).push([s]);
  const ind = { setups: 0, known: 0, topN: 0, reasons: {} }, industryOf = new Map();
  for (const [d, list] of setupsByDate) {
    const b = buckets.get(d);
    const members = b.idx.map((si, q) => { const id = segs[si].id, data = dataOf(id); return { id, cik: cikOf(id), sic: data ? sicAt(data.sic, d) : null, rsPct: b.rs[q] }; });
    for (const [s] of list) {
      const rec = industryRecord(members, s.id, P);
      industryOf.set(`${s.id}|${d}`, rec);
      ind.setups++;
      if (rec.known) { ind.known++; if (rec.topN) ind.topN++; } else ind.reasons[rec.reason] = (rec.reason in ind.reasons ? ind.reasons[rec.reason] : 0) + 1;
    }
    buckets.delete(d);
  }

  const cal = calendar.filter((d) => d >= W.from && d <= W.to);
  const run = simulatePortfolio(portfolioSegs, cal, P);
  const spyByDate = new Map(spyTR.map((p) => [p.date, p.value]));
  const pf = curveStats(run.curve), spy = benchmarkStats(spyTR, cal[0], cal[cal.length - 1]);
  const stageDays = run.curve.reduce((m, c) => { m[c.stage] = (c.stage in m ? m[c.stage] : 0) + 1; return m; }, {});
  // Ereignisdaten gelten nur als vorhanden, wenn die CIK im Fenster ueberhaupt Ergebnismitteilungen (8-K 2.02) hat
  // (Auslandsemittenten mit 6-K haben keine; 'keine Mitteilung' waere dort falsch).
  const earn = { trades: 0, withEventData: 0, heldThroughStrict: 0, heldThroughInclusive: 0, releaseOnEntryDay: 0, releaseOnExitDay: 0 };
  const tradesCompact = run.trades.map((t) => {
    const evs = dataOf(t.segId)?.events || null;
    const hasReleases = !!evs && evs.some((e) => e[EV.TYPE] === EVENT.EARNINGS_RELEASE);
    const n = hasReleases ? releasesDuringHold(evs, t.entryDate, t.exitDate) : null;
    earn.trades++;
    if (n) { earn.withEventData++; if (n.strict) earn.heldThroughStrict++; if (n.inclusive) earn.heldThroughInclusive++; if (n.entryDay) earn.releaseOnEntryDay++; if (n.exitDay) earn.releaseOnExitDay++; }
    const ir = industryOf.get(`${t.segId}|${t.setup?.setupDate}`) || null;
    return { seg: t.segId, entry: t.entryDate, exit: t.exitDate, kind: t.kind, ret: t.returnPct, r: t.rMultiple, mfe: t.mfe, mae: t.mae, hold: t.holdSessions, exits: t.exits.map((x) => x.ruleId), code33: t.setup?.sepa?.code33 ?? null, breakoutVolumeRatio: t.setup?.breakoutVolumeRatio ?? null, releasesDuringHold: n, industry: ir, shares0: t.shares0, entryPrice: t.entryPrice };
  });
  const result = {
    schema: 'vu-minervini-adaptation-measurement-1.1.0',
    label: 'GESEHENE DATEN: DEV und HOLDOUT wurden in R14 geoeffnet. Nur Beschreibung, keine Optimierung, keine Rueckwirkung auf die Engine.',
    window: L.WINDOW_NAME, from: cal[0], to: cal[cal.length - 1], at: new Date().toISOString(), commit: process.env.GITHUB_SHA || null,
    engine: { id: ENGINE.id, version: ENGINE.version, canonicalName: CLASSIFICATION.canonicalName, productClass: CLASSIFICATION.productClass, parent: ENGINE.parent },
    freeze: { rulebookHash: freeze.rulebookHash, codeHash: freeze.codeHash, frozenCommit: freeze.commit },
    data: { dataFingerprint, segments: segs.length, withSecFacts: withFund, delistCoverage, secSchema: store.schema, eventsSchema: ev.schema, eventsCiks: Object.keys(ev.byCik).length, eventsBuild: { stats: ev.stats, builtAt: ev.builtAt, commit: ev.commit } },
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
