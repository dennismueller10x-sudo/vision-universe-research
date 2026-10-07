// Minervini Ground Truth Replay – Lauf ueber die privaten PIT-Daten (GitHub Actions, Modus gt-replay[-holdout|-smoke]).
// Reine Diagnose: eingefrorene Signal-Engine (1.1.0 = 1.0.0 bei den Signalregeln), kein Portfolio, keine Rueckwirkung.
// Je Fall: Identitaet (damaliges Listing, CIK, Splits, Delisting), Regel fuer Regel an t*, Signal +-5/Fenster,
// 10 Zufallskontrollen (Seed SHA-256(case_id)), Branche (nur Protokoll). Dazu Jahres-/Marktphasen-Trichter.
// Voll verschluesselt; das Log enthaelt nur Entscheidungen, Regel-Ergebnisse, Abstaende, Strukturkennzahlen,
// SEC-Kennzahlen (oeffentlich) und Zaehlwerte - keine Kurse (Tiingo-Nutzungsrechte).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as L from '../validation/lib.mjs';
import { loadPitData } from '../validation/analyze-methods.mjs';
import { P } from '../replication/minervini-1.1/params.mjs';
import { makeSplitRatio } from '../replication/minervini/sepa.mjs';
import { SEC_STORE_KEY } from '../replication/minervini/measure.mjs';
import { verifyFreeze } from '../replication/minervini-1.1/freeze.mjs';
import { STORE_KEY as EVENTS_STORE_KEY } from '../data-layer/sec/build-sec-events.mjs';
import { sicAt } from '../data-layer/sec/industry-sic.mjs';
import { industryRecord } from '../replication/minervini-1.1/industry-record.mjs';
import { dollarVolume } from '../engine/indicators.mjs';
import { replayCase, yearlyFunnel, seededSample, indexOnOrBefore } from './replay.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
export const CASES_PATH = path.join(root, 'scripts/supertrader/fidelity/MINERVINI-GROUND-TRUTH-CASES.json');
export const GT_FREEZE_PATH = path.join(root, 'scripts/supertrader/fidelity/MINERVINI-GROUND-TRUTH-FREEZE.json');
export const CONTROLS_PER_CASE = 10;
const tickerOf = (id) => String(id).split(':')[2];
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);

// Oeffentliche Sicht eines Replay-Ergebnisses: keine Kurse, nur Regeln, Abstaende, Strukturkennzahlen.
export function publicView(r) {
  if (!r || !r.layers) return r ? { decision: r.decision, reason: r.reason || null } : null;
  const l = r.layers;
  return {
    decision: r.decision, mode: r.mode, evaluatedClose: r.evaluatedClose, anchorDate: r.anchorDate, setupAtTStar: r.setupAtTStar,
    timing: r.timing, nearestSignalAnyDistance: r.nearestSignalAnyDistance, signalsInRange: r.signalsInRange, segmentSignalsTotal: r.segmentSignalsTotal,
    pivotPctDeviation: r.pivot ? r3(r.pivot.pctDeviation) : null,
    universe: { ok: l.universe.ok, rawCloseOk: l.universe.rawCloseOk, dollarVolumeOk: l.universe.dollarVolumeOk },
    trend: { ok: l.trend.ok, failed: Object.entries(l.trend.rules).filter(([, v]) => !v).map(([k]) => k), rsPercentile: Number.isFinite(l.trend.facts.rsPercentile) ? Math.round(l.trend.facts.rsPercentile) : null, sma200RisingSessions: l.trend.facts.sma200RisingSessions },
    vcp: { ok: l.vcp.ok, reason: l.vcp.reason, baseLength: l.vcp.baseLength, contractions: l.vcp.contractions.length, depths: l.vcp.contractions.map(r3), baseDepthClass: l.vcp.baseDepthClass, volumeRatio: r2(l.vcp.volumeRatio), stopPct: r3(l.vcp.stopPct), pivotDate: l.vcp.pivotDate },
    sepa: { ok: l.sepa.ok, ruleId: l.sepa.ruleId, reason: l.sepa.reason, facts: l.sepa.facts ? { quarterEnd: l.sepa.facts.quarterEnd, filed: l.sepa.facts.filed, form: l.sepa.facts.form, epsGrowth: r3(l.sepa.facts.epsGrowth), epsGrowthPrev: r3(l.sepa.facts.epsGrowthPrev), revGrowth: r3(l.sepa.facts.revGrowth), revGrowthPrev: r3(l.sepa.facts.revGrowthPrev), revAccel: l.sepa.facts.revAccel ?? null, code33: l.sepa.facts.code33 ?? null } : null },
    passedLayers: l.passed, attribution: r.attribution,
  };
}

// Damaliges Listing: Segment mit dem Ticker, dessen Reihe den Anker (bzw. Fensterbeginn) abdeckt.
export function resolveSegment(segs, ticker, date) {
  const hits = segs.filter((s) => tickerOf(s.id) === ticker);
  const cover = hits.filter((s) => s.raw[0].date <= date && s.raw[s.raw.length - 1].date >= date);
  return { seg: cover[0] || null, candidates: hits.length, covering: cover.length, ranges: hits.map((s) => [s.raw[0].date, s.raw[s.raw.length - 1].date]) };
}

function ctxOf(seg, facts) {
  const a = L.adjustSeries(seg.raw);
  return { a, ctx: { bars: { date: a.date, open: a.open, high: a.high, low: a.low, close: a.close, volume: a.volume }, rawClose: a.rawClose, rsPct: seg.cross?.rs || [], fund: facts[seg.id.split('#')[0]] || null, splitRatio: makeSplitRatio(seg.raw) } };
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const OUT = arg('--out') || path.join(os.tmpdir(), 'gt-replay');
  const LIMIT = arg('--limit') ? Number(arg('--limit')) : 0;
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  const log = (m) => console.log(`[gt-replay ${L.WINDOW_NAME} +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);

  const freeze = verifyFreeze();
  if (!freeze.ok || freeze.sharedChanged.length) { console.error('Engine 1.1.0 nicht im eingefrorenen Zustand: ' + (freeze.reason || freeze.sharedChanged.join(', '))); process.exit(3); }
  const casesBuf = fs.readFileSync(CASES_PATH);
  const casesHash = crypto.createHash('sha256').update(casesBuf).digest('hex');
  const gtFreeze = fs.existsSync(GT_FREEZE_PATH) ? JSON.parse(fs.readFileSync(GT_FREEZE_PATH, 'utf8')) : null;
  if (!LIMIT && (!gtFreeze || gtFreeze.status !== 'FROZEN' || gtFreeze.casesHash !== casesHash)) { console.error('Kein Replay ohne Ground-Truth-Freeze (Fallliste nach Red Team eingefroren).'); process.exit(3); }
  log(`Engine-Freeze ok (${freeze.codeHash.slice(0, 12)}); Fallliste ${casesHash.slice(0, 12)}${gtFreeze ? `, GT-Freeze ${gtFreeze.status}` : ''}`);
  const CASES = JSON.parse(casesBuf.toString('utf8')).cases.filter((c) => c.replay_spec);

  const W = L.WINDOW;
  const D = await loadPitData({ LIMIT, log, excludeNonEquity: true, delistPit: true });
  const { segs, spyTR, mine, driver, budget, dataFingerprint, listings, members } = D;
  budget.consumeClassB(1, 'GET sec facts gt');
  const sbuf = await driver.get(mine.seriesPrefix + SEC_STORE_KEY);
  const facts = sbuf ? JSON.parse(zlib.gunzipSync(sbuf).toString('utf8')).records || {} : {};
  budget.consumeClassB(1, 'GET sec events gt');
  const ebuf = await driver.get(mine.seriesPrefix + EVENTS_STORE_KEY);
  const ev = ebuf ? JSON.parse(zlib.gunzipSync(ebuf).toString('utf8')) : { listingCik: {}, byCik: {} };
  const cikOf = (id) => ev.listingCik[id.split('#')[0]] || null;
  const memberIds = new Set(members.map((m) => m.l.id));
  log(`Segmente ${segs.length}; SEC-Faktensaetze ${Object.keys(facts).length}; Faelle mit Replay ${CASES.length}`);

  // Kontrollkandidaten: Segmente, die einen Tag abdecken (Universum erst nach der Auswahl geprueft, deterministisch).
  const dateIndex = (seg, d) => { const r = seg.raw; let lo = 0, hi = r.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (r[m].date === d) return m; if (r[m].date < d) lo = m + 1; else hi = m - 1; } return -1; };
  const results = [], pub = [];
  for (const c of CASES) {
    const spec = { ...c.replay_spec };
    const startDate = spec.window ? spec.window[0] : spec.anchorDate === 'PREVIOUS_SESSION_OF_POST' ? c.source.postDate : spec.anchorDate;
    const out = { case_id: c.case_id, ticker: c.ticker, group: c.evaluation_group };
    if (startDate < W.from || startDate > W.to) { out.replay = { decision: 'NOT_EVALUABLE', reason: 'DATA_WINDOW' }; results.push(out); pub.push(out); continue; }
    const res = resolveSegment(segs, c.ticker, startDate);
    const listed = listings.filter((l) => l.ticker === c.ticker);
    out.identity = {
      segments: res.candidates, covering: res.covering, ranges: res.ranges,
      listingsWithTicker: listed.length, inUniverse: listed.some((l) => memberIds.has(l.id)),
      listingSources: [...new Set(listed.map((l) => l.source))],
    };
    if (!res.seg) { out.replay = { decision: 'NOT_EVALUABLE', reason: res.candidates ? 'SECURITY_MAPPING_NO_COVERING_SEGMENT' : listed.length ? 'SECURITY_MAPPING_EXCLUDED_FROM_UNIVERSE' : 'SECURITY_MAPPING_NOT_IN_PROVIDER_LIST' }; results.push(out); pub.push(out); continue; }
    const seg = res.seg;
    const { ctx, a } = ctxOf(seg, facts);
    if (spec.anchorDate === 'PREVIOUS_SESSION_OF_POST') { const i = a.date.indexOf(c.source.postDate) >= 0 ? a.date.indexOf(c.source.postDate) : a.date.findIndex((d) => d > c.source.postDate); spec.anchorDate = i > 0 ? a.date[i - 1] : null; }
    const cik = cikOf(seg.id);
    const splits = seg.raw.filter((b) => Number.isFinite(b.splitFactor) && b.splitFactor !== 1);
    Object.assign(out.identity, {
      segId: seg.id, exchange: seg.id.split(':')[1], cik, secFacts: !!ctx.fund, delisted: !!seg.delisted, delistClass: seg.delistClass || null,
      splitsBeforeAnchor: splits.filter((b) => b.date < (spec.anchorDate || startDate)).map((b) => [b.date, b.splitFactor]),
      splitsAfterAnchor: splits.filter((b) => b.date >= (spec.anchorDate || startDate)).map((b) => [b.date, b.splitFactor]),
      sicAtAnchor: cik && ev.byCik[cik] ? sicAt(ev.byCik[cik].sic, spec.anchorDate || startDate) : null,
    });
    const r = replayCase(ctx, spec, P);
    out.replay = publicView(r);
    out.sealed = r;
    // Branche (MR-SEPA-12, nur Protokoll) am bewerteten Schluss.
    if (r.evaluatedClose) {
      const d = r.evaluatedClose;
      const mem = [];
      for (const s of segs) { const i = dateIndex(s, d); if (i >= 0 && Number.isFinite(s.cross?.rs?.[i])) { const ck = cikOf(s.id); mem.push({ id: s.id, cik: ck, sic: ck && ev.byCik[ck] ? sicAt(ev.byCik[ck].sic, d) : null, rsPct: s.cross.rs[i] }); } }
      const ir = industryRecord(mem, seg.id, P);
      out.industry = ir.known ? { sic: ir.sic, level: ir.level, groupSize: ir.groupSize, rank: ir.rank, topN: ir.topN } : { known: false, reason: ir.reason };
    }
    // Zufallskontrollen (praeregistriert): 10 Titel, die am Schluss t* den Messrahmen bestehen, ohne den Falltitel.
    if (r.evaluatedClose && c.class_group === 'POSITIVE') {
      const d = r.evaluatedClose;
      const pool = segs.filter((s) => s !== seg && tickerOf(s.id) !== c.ticker && dateIndex(s, d) >= 252).map((s) => s.id).sort();
      const order = seededSample(pool, pool.length, crypto.createHash('sha256').update(c.case_id).digest('hex'));
      const byId = new Map(segs.map((s) => [s.id, s]));
      const ctrl = [];
      for (const id of order) {
        if (ctrl.length >= CONTROLS_PER_CASE) break;
        const s = byId.get(id); const x = ctxOf(s, facts);
        const t = x.a.date.indexOf(d);
        const dv = t >= 0 ? dollarVolume(x.a.close, x.a.volume, P['uni.dollarVolumeSessions'])[t] : NaN;
        if (!(x.a.rawClose[t] >= P['uni.minRawClose'] && dv >= P['uni.minDollarVolume20'])) continue;
        const cr = replayCase(x.ctx, { ...spec, classGroup: 'POSITIVE' }, P);
        ctrl.push({ id, decision: cr.decision, setupAtTStar: !!cr.setupAtTStar, passedLayers: cr.layers?.passed ?? null, trend: cr.layers?.trend.ok ?? null, vcp: cr.layers?.vcp.ok ?? null, sepa: cr.layers?.sepa.ok ?? null });
      }
      out.controls = { n: ctrl.length, setupAtTStar: ctrl.filter((x) => x.setupAtTStar).length, detected: ctrl.filter((x) => x.decision === 'DETECTED').length, trend: ctrl.filter((x) => x.trend).length, vcp: ctrl.filter((x) => x.vcp).length, sepa: ctrl.filter((x) => x.sepa).length };
      out.sealedControls = ctrl;
    }
    results.push(out);
    const { sealed, sealedControls, ...p } = out; pub.push(p);
    log(`FALL ${JSON.stringify(p)}`);
  }

  // Selektivitaet: Trichter je Jahr und Marktphase (SPY-Gesamtrendite ueber/unter ihrem 200-Tage-Mittel).
  const spyVals = spyTR.map((p) => p.value), regime = new Map();
  for (let i = 0; i < spyTR.length; i++) { if (i < 199) { regime.set(spyTR[i].date, 'NA'); continue; } let s = 0; for (let k = i - 199; k <= i; k++) s += spyVals[k]; regime.set(spyTR[i].date, spyVals[i] > s / 200 ? 'UP' : 'DOWN'); }
  const funnel = {}, add = (key, y) => { const f = (funnel[key] ||= { evaluated: 0, universe: 0, trend: 0, vcp: 0, setups: 0, signals: 0, titles: 0 }); for (const k of Object.keys(y)) f[k] += y[k]; };
  for (const seg of segs) {
    const { ctx, a } = ctxOf(seg, facts);
    const fromIndex = a.date.findIndex((d) => d >= W.from);
    if (fromIndex < 0) continue;
    const yr = yearlyFunnel(ctx, P, { fromIndex, toDate: W.to, keyOf: (d) => `${d.slice(0, 4)}|${regime.get(d) || 'NA'}` });
    for (const [k, v] of Object.entries(yr)) add(k, v);
  }
  log(`TRICHTER ${JSON.stringify(funnel)}`);

  const summary = { schema: 'vu-minervini-ground-truth-replay-1.0.0', window: L.WINDOW_NAME, at: new Date().toISOString(), commit: process.env.GITHUB_SHA || null, engineFreeze: { rulebookHash: freeze.rulebookHash, codeHash: freeze.codeHash }, casesHash, dataFingerprint, cases: pub, funnel };
  const pem = fs.readFileSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  const name = `minervini-ground-truth-${L.WINDOW_NAME.toLowerCase()}${LIMIT ? '-smoke' : ''}`;
  fs.writeFileSync(path.join(OUT, `${name}.sealed.json`), L.encryptForOwner(pem, Buffer.from(JSON.stringify({ ...summary, cases: results }))));
  log(`ZUSAMMENFASSUNG ${JSON.stringify({ evaluated: pub.length, decisions: pub.reduce((m, x) => { const k = `${x.group}:${x.replay?.decision}`; m[k] = (m[k] || 0) + 1; return m; }, {}) })}`);
  log(`verschluesselt: ${name}.sealed.json`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
