#!/usr/bin/env node
// Minervini Canonical Replication – Messlauf (NUR Messung, keine Rueckwirkung auf die Engine).
//
//   ST_WINDOW=DEV|HOLDOUT node scripts/supertrader/replication/minervini/measure.mjs --out DIR [--limit N]
//
// Laeuft nur, wenn MINERVINI-FIDELITY-FREEZE.json den Status FROZEN traegt und die Hashes von Regelbuch
// und Code mit dem Stand im Arbeitsverzeichnis uebereinstimmen (sonst Abbruch mit Code 3).
// Beide Zeitraeume (DEV 2016-2026, HOLDOUT 2008-2015) wurden in R14 geoeffnet: GESEHENE DATEN.
// Daten: privater Eimer (Tiingo-Reihen, SEC-Erstmeldungen sec-pit-mrepl-1). Kennzahlen nur verschluesselt
// (Tiingo-Nutzungsrechte, wie R14); das Log zeigt Zaehlwerte und Richtungen ohne Zahlen.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import * as L from '../../validation/lib.mjs';
import { loadPitData } from '../../validation/analyze-methods.mjs';
import { P } from './params.mjs';
import { scanSegment } from './signal-engine.mjs';
import { makeSplitRatio } from './sepa.mjs';
import { simulatePortfolio, simulateSignals } from './portfolio-sim.mjs';
import { curveStats, tradeStats, turnover, benchmarkStats, signalVsSpy } from './metrics.mjs';
import { verifyFreeze } from './freeze.mjs';
import ENGINE, { CLASSIFICATION } from './engine.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..', '..');
export const SEC_STORE_KEY = '_validation/sec-pit-mrepl-1.json.gz';

// MR-TT-08: Die Datenschicht (loadPitData) berechnet den RS-Querschnitt fest im Code. Die Messung laeuft nur,
// wenn diese Definition der im Regelbuch registrierten entspricht.
export function checkRsDefinition(src) {
  const id = P['rs.definitionId'];
  const w = P['rs.weights'], h = P['rs.horizons'];
  const ok = id === 'VU-RS-PCT-0.4r63-0.2r126-0.2r189-0.2r252-DV20GE1M'
    && JSON.stringify(w) === '[0.4,0.2,0.2,0.2]' && JSON.stringify(h) === '[63,126,189,252]'
    && src.includes('const parts = [ind.ret63[t], ind.ret126[t], ind.ret189[t], ind.ret252[t]];')
    && src.includes('0.4 * parts[0] + 0.2 * parts[1] + 0.2 * parts[2] + 0.2 * parts[3]')
    && src.includes('if (!(ind.dollarVol20[t] >= 1e6)) continue;');
  return ok;
}

// Kompakte Reihe fuer die Portfolio-Simulation (nur Titel mit mindestens einem Setup).
function segmentOf(seg, a, scan) {
  return { id: seg.id, date: a.date, open: a.open, high: a.high, low: a.low, close: a.close, rawClose: a.rawClose, volume: a.volume, volAvg: scan.volAvg, divAdj: a.divAdj,
    delisted: !!seg.delisted, delistClass: seg.delistClass || null, setups: scan.setups };
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const OUT = arg('--out') || path.join(os.tmpdir(), 'mrepl');
  const LIMIT = arg('--limit') ? Number(arg('--limit')) : 0;
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  const log = (m) => console.log(`[mrepl ${L.WINDOW_NAME} +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);

  const freeze = verifyFreeze();
  if (!freeze.ok) { console.error('Kein Messlauf ohne gueltigen Fidelity Freeze: ' + freeze.reason); process.exit(3); }
  log(`Freeze ok: Regelbuch ${freeze.rulebookHash.slice(0, 12)}, Code ${freeze.codeHash.slice(0, 12)}, Engine ${ENGINE.id}@${ENGINE.version} (${CLASSIFICATION.canonicalName})`);
  if (!checkRsDefinition(fs.readFileSync(path.join(root, 'scripts/supertrader/validation/analyze-methods.mjs'), 'utf8'))) { console.error('RS-Definition der Datenschicht weicht vom Regelbuch ab (MR-TT-08).'); process.exit(3); }

  const W = L.WINDOW;
  const D = await loadPitData({ LIMIT, log, excludeNonEquity: true, delistPit: true });
  const { segs, calendar, spyTR, mine, driver, budget, dataFingerprint, delistCoverage } = D;
  budget.consumeClassB(1, 'GET sec facts mrepl');
  const sbuf = await driver.get(mine.seriesPrefix + SEC_STORE_KEY);
  if (!sbuf) { console.error(`SEC-Speicher ${SEC_STORE_KEY} fehlt (erst Modus mrepl-sec laufen lassen).`); process.exit(3); }
  const store = JSON.parse(zlib.gunzipSync(sbuf).toString('utf8'));
  const facts = store.records || {};
  log(`SEC-Erstmeldungen: ${Object.keys(facts).length} Listings (Schema ${store.schema})`);

  const scanTotals = { evaluated: 0, universe: 0, trend: 0, vcp: 0, setups: 0, rejected: {} };
  const portfolioSegs = [], signals = [];
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
      for (const x of simulateSignals(s, P)) if (x.entryDate >= W.from && x.entryDate <= W.to) signals.push(x);
    }
    if (++k % 1000 === 0) log(`Titel ${k}/${segs.length}`);
  }
  log(`Setups ${scanTotals.setups}, Titel mit Setup ${portfolioSegs.length}, Titel mit SEC-Daten ${withFund}/${segs.length}`);

  const cal = calendar.filter((d) => d >= W.from && d <= W.to);
  const run = simulatePortfolio(portfolioSegs, cal, P);
  const spyByDate = new Map(spyTR.map((p) => [p.date, p.value]));
  const pf = curveStats(run.curve), spy = benchmarkStats(spyTR, cal[0], cal[cal.length - 1]);
  const result = {
    schema: 'vu-minervini-replication-measurement-1.0.0',
    label: 'GESEHENE DATEN: DEV und HOLDOUT wurden in R14 geoeffnet. Nur Beschreibung, keine Optimierung, keine Rueckwirkung auf die Engine.',
    window: L.WINDOW_NAME, from: cal[0], to: cal[cal.length - 1], at: new Date().toISOString(), commit: process.env.GITHUB_SHA || null,
    engine: { id: ENGINE.id, version: ENGINE.version, canonicalName: CLASSIFICATION.canonicalName, productClass: CLASSIFICATION.productClass },
    freeze: { rulebookHash: freeze.rulebookHash, codeHash: freeze.codeHash, frozenCommit: freeze.commit },
    data: { dataFingerprint, segments: segs.length, withSecFacts: withFund, delistCoverage, secSchema: store.schema },
    scan: scanTotals,
    portfolio: { ...pf, turnoverPerYear: turnover(run.trades, run.curve), trades: tradeStats(run.trades), book: run.book },
    signals: { ...tradeStats(signals), vsSpySameHolding: signalVsSpy(signals, spyByDate) },
    spy,
    tradesCompact: run.trades.map((t) => ({ seg: t.segId, entry: t.entryDate, exit: t.exitDate, kind: t.kind, ret: t.returnPct, r: t.rMultiple, mfe: t.mfe, mae: t.mae, hold: t.holdSessions, exits: t.exits.map((x) => x.ruleId), code33: t.setup?.sepa?.code33 ?? null, breakoutVolumeRatio: t.setup?.breakoutVolumeRatio ?? null })),
    curve: run.curve,
  };
  const pem = fs.readFileSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  const name = `minervini-replication-${L.WINDOW_NAME.toLowerCase()}${LIMIT ? '-smoke' : ''}`;
  fs.writeFileSync(path.join(OUT, `${name}.sealed.json`), L.encryptForOwner(pem, Buffer.from(JSON.stringify(result))));
  // Oeffentliches Log: Zaehlwerte und Richtungen, keine Kennzahlen aus Kursdaten.
  log(`Trades Portfolio ${result.portfolio.trades.count}, Signale ${result.signals.count}`);
  // Technischer Probelauf (--limit): keine Richtungsangaben, damit er nichts ueber das Ergebnis verraet.
  if (!LIMIT) log(`Richtung: CAGR ${pf && spy ? (pf.cagr > spy.cagr ? 'ueber' : 'unter') : '?'} SPY; Max Drawdown ${pf && spy ? (pf.maxDrawdown > spy.maxDrawdown ? 'kleiner' : 'groesser') : '?'} als SPY; Signale im Mittel ${result.signals.vsSpySameHolding.meanExcess > 0 ? 'ueber' : 'unter'} SPY bei gleicher Haltedauer`);
  log(`verschluesselt: ${name}.sealed.json`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
