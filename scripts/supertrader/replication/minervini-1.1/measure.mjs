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
import { verifyFreeze, FREEZE_PATH } from './freeze.mjs';
import { RULEBOOK } from './params.mjs';
import { buildParamTable, paramAccessor, P as P2A } from '../minervini/params.mjs';
import { simulatePortfolio as simulate2A } from '../minervini/portfolio-sim.mjs';
import { exposureDiagnostics, cashAttribution, exitRuleProvenance, postExitDiagnostics, forwardReturns, publicDiagnostics, publicExitCounts } from './diagnostics.mjs';
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

// 1.0.0-Vergleich: 1.1-Simulation mit den Stufenwerten von 1.0.0 (Startstufe 50 %, Gewicht 25 %). Alle anderen Parameter
// sind identisch (MR11-T-PARAMS-DELTA). Gleichheit mit der eingefrorenen 2A-Simulation wird im selben Lauf geprueft.
export function params10Equivalent() {
  const rb = JSON.parse(JSON.stringify(RULEBOOK));
  const pf2 = rb.rules.find((r) => r.id === 'MR-PF-02').formalization.parameters;
  pf2['pf.initialExposureCeiling'].value = P2A['pf.initialExposureCeiling'];
  pf2['pf.initialMaxPositionPct'].value = P2A['size.maxPositionPct'];
  return paramAccessor(buildParamTable(rb));
}

export const exitTriggerPrice = (bookedPrice, Pv) => bookedPrice / (1 - Pv['exe.slippageBps'] / 1e4);

// Diagnose eines Portfoliolaufs (Exposure, Bargeldgruende, Entwicklung nach dem Ausstieg).
function portfolioDiagnostics(run, days, segById, Pv, provenanceOf) {
  const exits = [];
  for (const t of run.trades) {
    if (t.kind !== 'EXIT') continue;
    const s = segById.get(t.segId), last = t.exits[t.exits.length - 1];
    const exitIndex = s.date.indexOf(t.exitDate);
    if (exitIndex < 0) continue;
    // Kurs vor Slippage (portfolio-sim bucht price * (1 - slip)); Bezugspunkt = Ausloesekurs der Regel.
    exits.push({ seg: t.segId, exitIndex, exitPrice: exitTriggerPrice(last.price, Pv), entryPrice: t.entryBase, finalRule: last.ruleId, partial: t.exits.some((x) => x.ruleId === 'MR-EXIT-02') });
  }
  return { exposure: exposureDiagnostics(run.curve), cash: cashAttribution(days, run.curve, Pv), postExit: postExitDiagnostics(exits, segById, provenanceOf) };
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
  const frozen = JSON.parse(fs.readFileSync(FREEZE_PATH, 'utf8'));
  const wantBuild = frozen.dataBuilds?.[L.WINDOW_NAME]?.commit;
  if (!LIMIT && (!wantBuild || ev.commit !== wantBuild)) { console.error(`Datenlayer stammt nicht aus dem im Freeze festgehaltenen Bau (${ev.commit} statt ${wantBuild}).`); process.exit(3); }
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
      for (const x of simulateSignals(s, P)) if (x.entryDate >= W.from && x.entryDate <= W.to) {
        const su = s.setups.get(x.entryIndex - 1);
        const entryPrice = Number.isFinite(s.open[x.entryIndex]) ? Math.max(s.open[x.entryIndex], su.pivot) : su.pivot;
        signals.push({ ...x, seg: s.id, entryPrice });
      }
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
  const days11 = [], days10 = [];
  const run = simulatePortfolio(portfolioSegs, cal, P, { onDay: (d) => days11.push(d) });
  const P10 = params10Equivalent();
  const run10 = simulatePortfolio(portfolioSegs, cal, P10, { onDay: (d) => days10.push(d) });
  const run2A = simulate2A(portfolioSegs, cal, P2A);
  const equivalentTo2A = JSON.stringify(run10.trades) === JSON.stringify(run2A.trades) && JSON.stringify(run10.curve.map(({ stage, ...c }) => c)) === JSON.stringify(run2A.curve);
  if (!equivalentTo2A) log('WARNUNG: 1.0-Vergleichslauf weicht von der eingefrorenen 2A-Simulation ab');
  const segById = new Map(portfolioSegs.map((s) => [s.id, s]));
  const provenanceOf = exitRuleProvenance(RULEBOOK);
  const diag11 = portfolioDiagnostics(run, days11, segById, P, provenanceOf), diag10 = portfolioDiagnostics(run10, days10, segById, P10, provenanceOf);
  const sigExits = signals.filter((x) => !x.open).map((x) => { const s = segById.get(x.seg); return { seg: x.seg, exitIndex: x.exitIndex, exitPrice: s.close[x.exitIndex], entryPrice: x.entryPrice, finalRule: x.exits[x.exits.length - 1], partial: x.exits.includes('MR-EXIT-02') }; }).filter((x) => x.finalRule !== 'MR-EXE-04-DELIST');
  const signalDiag = { forward: forwardReturns(signals, segById, new Map(spyTR.map((p) => [p.date, p.value]))), postExitCloseRef: postExitDiagnostics(sigExits, segById, provenanceOf) };
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
    diagnostics: { v11: diag11, v10: diag10, signals: signalDiag, comparison10: { equivalentTo2A, portfolio: curveStats(run10.curve), trades: tradeStats(run10.trades), turnoverPerYear: turnover(run10.trades, run10.curve) } },
    tradesCompact,
    curve: run.curve,
  };
  const pem = fs.readFileSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  const name = `minervini-adaptation-1.1-${L.WINDOW_NAME.toLowerCase()}${LIMIT ? '-smoke' : ''}`;
  fs.writeFileSync(path.join(OUT, `${name}.sealed.json`), L.encryptForOwner(pem, Buffer.from(JSON.stringify(result))));
  log(`Trades Portfolio ${result.portfolio.trades.count}, Signale ${result.signals.count}; Branche bekannt ${ind.known}/${ind.setups} Setups; Ereignisdaten ${earn.withEventData}/${earn.trades} Trades`);
  const pub = { v11: publicDiagnostics(diag11), v10: publicDiagnostics(diag10), exits11: publicExitCounts(diag11.postExit), exits10: publicExitCounts(diag10.postExit), signalExits: publicExitCounts(signalDiag.postExitCloseRef), signalsN: signals.length, trades11: run.trades.length, trades10: run10.trades.length, equivalentTo2A };
  // Struktur-, Zaehl- und Anteilswerte (keine Renditen/Kurse) – oeffentlich; im Probelauf ebenfalls nur Technik.
  log(`DIAGNOSE ${JSON.stringify(pub)}`);
  if (!LIMIT) {
    const p10 = curveStats(run10.curve), dir = (a, b) => (a > b ? 'hoeher' : 'niedriger');
    log(`Richtung 1.1 vs 1.0: CAGR ${dir(pf.cagr, p10.cagr)}; Max Drawdown ${pf.maxDrawdown > p10.maxDrawdown ? 'kleiner' : 'groesser'}; Volatilitaet ${dir(pf.volatility, p10.volatility)}`);
    const fw = signalDiag.forward;
    log(`Richtung Signale vs SPY (Mittel/Median): ${Object.entries(fw).map(([h, v]) => `${h}T ${v.meanExcessVsSpy > 0 ? 'ueber' : 'unter'}/${v.medianExcessVsSpy > 0 ? 'ueber' : 'unter'} (Anteil ueber SPY ${v.shareAboveSpy === null ? '?' : Math.round(v.shareAboveSpy * 100)} %)`).join('; ')}`);
  }
  if (!LIMIT) log(`Richtung: CAGR ${pf && spy ? (pf.cagr > spy.cagr ? 'ueber' : 'unter') : '?'} SPY; Max Drawdown ${pf && spy ? (pf.maxDrawdown > spy.maxDrawdown ? 'kleiner' : 'groesser') : '?'} als SPY; Signale im Mittel ${result.signals.vsSpySameHolding.meanExcess > 0 ? 'ueber' : 'unter'} SPY bei gleicher Haltedauer`);
  log(`verschluesselt: ${name}.sealed.json`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
