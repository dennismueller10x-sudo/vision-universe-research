// Minervini Rule Fidelity – private Kursdiagnose (GitHub Actions, Modus rf-diag[-smoke]).
// Prueft Power Play und Basismessung gegen die eingefrorenen Ground-Truth-Faelle. NUR Diagnose:
// keine Regel, kein Parameter, kein Portfolio, keine Rueckwirkung auf Engine 1.1.0 oder auf die Faelle.
// Definitionen und Vorhersagen: scripts/supertrader/fidelity/MINERVINI-RULE-FIDELITY-PRIVATE-DIAG-PREREG.json.
// Datenschutz: Das Log (oeffentlich) enthaelt je Fall nur Wahrheitswerte, ganze Zahlen und Kennungen (publicRow bricht sonst ab).
// Alle Detailwerte (Verhaeltnisse, Tiefen) stehen nur im mit dem Eigentuemerschluessel verschluesselten Ergebnis.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as L from '../validation/lib.mjs';
import { loadPitData } from '../validation/analyze-methods.mjs';
import { P } from '../replication/minervini-1.1/params.mjs';
import { verifyFreeze } from '../replication/minervini-1.1/freeze.mjs';
import { prepareIndicators } from '../replication/minervini/trend-template.mjs';
import { detectVcp } from '../replication/minervini/vcp.mjs';
import { verifyGtFreeze } from './freeze.mjs';
import { resolveSegment, CASES_PATH } from './run-replay.mjs';
import { powerPlayAt, powerPlayWindow, baseMeasures, engineBase, publicRow } from './rf-diag-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const FID = path.join(root, 'scripts/supertrader/fidelity');
const LOSS_TO_LOSS = new Set(['ZGNX', 'ROKU', 'ACAD', 'SG', 'REPL', 'TNDM', 'RVNC']);
const SHORT_BASE = new Set(['DECK', 'RICK', 'TNDM', 'RVNC', 'MTLS']);

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const OUT = arg('--out') || path.join(os.tmpdir(), 'rf-diag');
  const LIMIT = arg('--limit') ? Number(arg('--limit')) : 0;
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  const log = (m) => console.log(`[rf-diag ${L.WINDOW_NAME} +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);

  const freeze = verifyFreeze();
  if (!freeze.ok || freeze.sharedChanged.length) { console.error('Engine 1.1.0 nicht im eingefrorenen Zustand'); process.exit(3); }
  const casesBuf = fs.readFileSync(CASES_PATH);
  const casesHash = crypto.createHash('sha256').update(casesBuf).digest('hex');
  const pre = JSON.parse(fs.readFileSync(path.join(FID, 'MINERVINI-RULE-FIDELITY-PRIVATE-DIAG-PREREG.json'), 'utf8'));
  if (casesHash !== pre.frozenInputs.casesSha256) { console.error('Fallliste weicht von der Praeregistrierung ab'); process.exit(3); }
  const resBuf = fs.readFileSync(path.join(FID, 'MINERVINI-GROUND-TRUTH-RESULTS.json'));
  if (crypto.createHash('sha256').update(resBuf).digest('hex') !== pre.frozenInputs.resultsSha256) { console.error('Ergebnisse weichen von der Praeregistrierung ab'); process.exit(3); }
  const gt = verifyGtFreeze();
  log(`Engine-Freeze ok (${freeze.codeHash.slice(0, 12)}); Fallliste ${casesHash.slice(0, 12)}; GT-Freeze ${gt.ok ? 'ok' : 'nicht ok (nur Probelauf zulaessig)'}`);
  if (!LIMIT && !gt.ok) { console.error('Kein voller Lauf ohne gueltigen Ground-Truth-Freeze'); process.exit(3); }

  const frozen = Object.fromEntries(JSON.parse(resBuf.toString('utf8')).cases.map((c) => [c.case_id, c]));
  const classes = JSON.parse(fs.readFileSync(path.join(FID, 'MINERVINI-RULE-FIDELITY-CASE-CLASSES.json'), 'utf8')).cases;
  const blockersOf = Object.fromEntries(classes.map((c) => [c.id, c]));
  const CASES = JSON.parse(casesBuf.toString('utf8')).cases.filter((c) => c.replay_spec);

  const D = await loadPitData({ LIMIT, log, excludeNonEquity: true, delistPit: true });
  const { segs } = D;
  log(`Segmente ${segs.length}; Faelle mit Replay ${CASES.length}`);

  const sealedRows = [], publicRows = [];
  for (const c of CASES) {
    const fr = frozen[c.case_id]?.replay;
    const head = { case_id: c.case_id, ticker: c.ticker, group: c.evaluation_group };
    if (!fr || !fr.evaluatedClose) { const row = publicRow({ ...head, status: 'NOT_EVALUABLE_FROZEN' }); publicRows.push(row); sealedRows.push(row); continue; }
    const aliases = c.ticker_aliases || [c.ticker];
    const res = resolveSegment(segs, aliases, fr.evaluatedClose);
    if (!res.seg) { const row = publicRow({ ...head, status: 'NO_SEGMENT' }); publicRows.push(row); sealedRows.push(row); log(`FALL ${JSON.stringify(row)}`); continue; }
    const seg = res.seg;
    const frozenSeg = frozen[c.case_id].identity?.segId;
    if (frozenSeg && frozenSeg !== seg.id) { const row = publicRow({ ...head, status: 'SEGMENT_MISMATCH' }); publicRows.push(row); sealedRows.push(row); log(`FALL ${JSON.stringify(row)}`); continue; }
    const a = L.adjustSeries(seg.raw);
    const bars = { date: a.date, open: a.open, high: a.high, low: a.low, close: a.close, volume: a.volume };
    const t = a.date.indexOf(fr.evaluatedClose);
    if (t < 252) { const row = publicRow({ ...head, status: 'DATE_NOT_IN_SERIES' }); publicRows.push(row); sealedRows.push(row); log(`FALL ${JSON.stringify(row)}`); continue; }

    // Selbsttest gegen die eingefrorenen Werte (gleicher Datenstand?)
    const eb = engineBase(bars.high, bars.low, t, P['vcp.maxBaseSessions']);
    const ind = prepareIndicators(bars, P);
    const v = detectVcp(bars, ind.volAvg, t, P);
    const frozenBase = fr.vcp?.baseLength ?? null;
    const selfBase = eb ? eb.baseSessions === frozenBase : frozenBase === null;
    const selfVcp = (v.reason ?? null) === (fr.vcp?.reason ?? null) && Boolean(v.ok) === Boolean(fr.vcp?.ok);
    const selfCheck = selfBase && selfVcp;

    const pp = powerPlayAt(bars, t);
    const ppw = powerPlayWindow(bars, t, 5);
    const bm = baseMeasures(bars, t, P['vcp.maxBaseSessions']);

    // Erklaerung (nur MAIN, abgelehnt): verbleibende Blocker nach den Praeregistrierungsregeln
    const bl = blockersOf[c.case_id];
    let explainedBy = 'NA', remaining = null;
    if (c.evaluation_group === 'MAIN' && bl && bl.decision === 'REJECTED') {
      const layers = new Set(bl.blockers.map((b) => b.layer));
      const ppPossible = pp.verdict !== 'NO' || ppw.verdict !== 'NO';
      const byPP = ppPossible && !layers.has('UNIVERSE') && !layers.has('TREND');
      const others = bl.blockers.filter((b) => !(b.layer === 'VCP' && /BASE_TOO_SHORT/.test(b.detail)));
      const byBase = bm.baseFinding === 'FLAT_BASE_MISSED' && others.length === 0;
      explainedBy = byPP && byBase ? 'BOTH' : byPP ? 'POWER_PLAY' : byBase ? 'BASE_MEASUREMENT' : 'NEITHER';
      remaining = [...layers].filter((l) => l !== 'VCP' || !byBase).join('+') || 'NONE';
    }
    const cls = !selfCheck ? 'SELF_CHECK_FAILED' : bm.baseFinding === 'FLAT_BASE_MISSED' ? 'IMPLEMENTATION_DEFECT' : (pp.verdict !== 'NO' || bm.baseFinding === 'SHORT_PAUSE_AT_HIGHS') ? 'FORMALIZATION_LIMIT' : (bm.baseFinding === 'NOT_SHORT' && pp.verdict === 'NO') ? 'NO_FINDING' : 'DISCRETION';

    const row = publicRow({
      ...head, status: 'EVALUATED', selfCheck, engineDecision: fr.decision ?? 'NA',
      engineBaseSessions: bm.baseSessions ?? null, engineVcpReason: fr.vcp?.reason ?? 'OK',
      ppVerdict: pp.verdict, ppFirstFail: pp.firstFail ?? 'NONE', thrustStrict: pp.thrustStrict, thrustLoose: pp.thrustLoose,
      flagSessions: pp.flagSessions, flagLenOk: pp.flagLenOk, flagLe10: pp.flagLe10, flagLe20: pp.flagLe20, flagLe25: pp.flagLe25, vcpLike: pp.vcpLike,
      ppWindowVerdict: ppw.verdict, ppWindowOffset: ppw.offset,
      pauseSessions: bm.pauseSessions ?? null, pauseLe10: bm.pauseLe10 ?? null, pauseLe15: bm.pauseLe15 ?? null, pauseLe25: bm.pauseLe25 ?? null,
      flatSessions15: bm.flatSessions15 ?? null, flatSessions10: bm.flatSessions10 ?? null, baseFinding: bm.baseFinding,
      explainedBy, remainingBlockers: remaining === null ? 'NA' : remaining.replace(/[^A-Za-z0-9_.+-]/g, '_'), classification: cls,
    });
    publicRows.push(row);
    sealedRows.push({ ...row, sealed: { pp: pp.detail, ppWindow: ppw, base: bm.detail, frozenBase, selfBase, selfVcp } });
    log(`FALL ${JSON.stringify(row)}`);
  }

  // Auswertung der vorab registrierten Vorhersagen (nur Zaehlwerte)
  const ev = publicRows.filter((r) => r.status === 'EVALUATED');
  const mainEv = ev.filter((r) => r.group === 'MAIN');
  const selfFail = ev.filter((r) => !r.selfCheck).length;
  const loss = mainEv.filter((r) => LOSS_TO_LOSS.has(r.ticker));
  const short = mainEv.filter((r) => SHORT_BASE.has(r.ticker));
  const rejectedMain = mainEv.filter((r) => r.engineDecision === 'REJECTED');
  const explained = rejectedMain.filter((r) => ['POWER_PLAY', 'BASE_MEASUREMENT', 'BOTH'].includes(r.explainedBy));
  const count = (rows, f) => rows.filter(f).length;
  const summary = {
    evaluated: ev.length, mainEvaluated: mainEv.length, selfCheckFailed: selfFail, selfCheckAbort: selfFail > 2,
    P2_lossCasesPowerPlayAtTStar: count(loss, (r) => r.ppVerdict !== 'NO'), P2_lossCasesPowerPlayInWindow: count(loss, (r) => r.ppWindowVerdict !== 'NO'), lossCases: loss.length,
    P3_shortBase: { SHORT_PAUSE_AT_HIGHS: count(short, (r) => r.baseFinding === 'SHORT_PAUSE_AT_HIGHS'), NO_BASE_STRUCTURE: count(short, (r) => r.baseFinding === 'NO_BASE_STRUCTURE'), FLAT_BASE_MISSED: count(short, (r) => r.baseFinding === 'FLAT_BASE_MISSED'), NOT_SHORT: count(short, (r) => r.baseFinding === 'NOT_SHORT'), n: short.length },
    P4_explainedMissed: explained.length, missedMain: rejectedMain.length,
    hypotheticalRecallNumerator: 3 + explained.length, recallDenominator: 15,
    classification: ev.reduce((m, r) => { m[r.classification] = (m[r.classification] || 0) + 1; return m; }, {}),
  };
  log(`ZUSAMMENFASSUNG ${JSON.stringify(summary)}`);

  const pem = fs.readFileSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  const name = `minervini-rule-fidelity-private-diag${LIMIT ? '-smoke' : ''}`;
  fs.writeFileSync(path.join(OUT, `${name}.sealed.json`), L.encryptForOwner(pem, Buffer.from(JSON.stringify({ schema: 'vu-minervini-rule-fidelity-private-diag-1.0.0', at: new Date().toISOString(), commit: process.env.GITHUB_SHA || null, casesHash, summary, rows: sealedRows }))));
  log(`verschluesselt: ${name}.sealed.json`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
