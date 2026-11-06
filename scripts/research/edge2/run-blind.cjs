#!/usr/bin/env node
'use strict';
// Edge 2 Teil 3b – blinder KI-Backtest (docs/research/edge2/ki/BLIND_PROTOKOLL.json, SHA-256 gepinnt). Forschung, nicht zertifiziert.
//
//   build:   node scripts/research/edge2/run-blind.cjs --phase build --work-dir D --delisted-dir D --delisted-raw-dir D --fundamentals D --out O
//            -> O/packets.json (anonym, wird committet), O/keys.sealed.{owner,reviewer}.json; Schlüssel und Salz in den privaten
//               Eimer (edge2-blind/keys-<packetsSha256>.json). Einmalig: steht edge2-blind/ledger.json auf BUILT, verweigert der Lauf.
//   resolve: node scripts/research/edge2/run-blind.cjs --phase resolve ... --out O
//            liest docs/research/edge2/ki/blind/{packets,picks,recognition}.json, Schlüssel aus dem Eimer, rechnet das Ledger.
//   --smoke 1: ohne R2 (committete Wochenreihen), Schlüssel nur nach O/keys.plain.json (nur lokal).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const B = require('./blind.cjs');
const Q = require('../edge/quant-e3.cjs');
const S = require('../edge/study.cjs');
const BT = require(path.join(ROOT, 'quant/engines/portfolio-backtest.cjs'));
const C = require(path.join(ROOT, 'quant/engines/portfolio-construction.cjs'));
// Studien: v1 (monatlich, ganzes liquides Universum) und v2 (quartalsweise, Marktwert-Top 500 point-in-time).
const PIN = require('./protocol-pin.cjs');
const STUDIES = Object.freeze({
  v1: { protocolFile: 'docs/research/edge2/ki/BLIND_PROTOKOLL.json', protocolSha256: PIN.BLIND_PROTOCOL_SHA256, dir: 'docs/research/edge2/ki/blind', prefix: 'edge2-blind', cadence: 'MONTHLY', topByMarketCap: null, amendment: true },
  v2: { protocolFile: 'docs/research/edge2/ki/BLIND_V2_PROTOKOLL.json', protocolSha256: PIN.BLIND_V2_PROTOCOL_SHA256, dir: 'docs/research/edge2/ki/blind-v2', prefix: 'edge2-blind-v2', cadence: 'QUARTERLY', topByMarketCap: 500, amendment: false },
});
let STUDY = STUDIES.v1, PROTOCOL_FILE = STUDY.protocolFile, PROTOCOL_SHA256 = STUDY.protocolSha256, DIR = path.join(ROOT, STUDY.dir), LEDGER_KEY = STUDY.prefix + '/ledger.json';
const WINDOW = ['2016-01-01', '2026-09-30'];
const VERSION = 'edge2-blind-run-1.1.0';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

function args(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) { const k = argv[i]; if (!k.startsWith('--')) throw Error('ARG ' + k); a[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[i + 1]; i++; }
  return a;
}
function protocol() {
  const bytes = fs.readFileSync(path.join(ROOT, PROTOCOL_FILE)), h = sha(bytes);
  if (h !== PROTOCOL_SHA256) throw Error('PROTOCOL_CHANGED ' + h);
  const doc = JSON.parse(bytes);
  const pr = sha(fs.readFileSync(path.join(ROOT, doc.prompt.file)));
  if (pr !== doc.prompt.sha256) throw Error('PROMPT_CHANGED ' + pr);
  if (!STUDY.amendment) return { doc, sha256: h, amendment: null, amendmentSha256: null };
  // Ergänzung 1 (vor der ersten Entscheidung): Prompt v2, 4–20 Titel mit Gewichten.
  const ab = fs.readFileSync(path.join(ROOT, PIN.BLIND_AMENDMENT_1_FILE));
  if (sha(ab) !== PIN.BLIND_AMENDMENT_1_SHA256) throw Error('AMENDMENT_CHANGED');
  const amendment = JSON.parse(ab);
  if (amendment.amends.sha256 !== h) throw Error('AMENDMENT_BASE_MISMATCH');
  if (sha(fs.readFileSync(path.join(ROOT, amendment.prompt.file))) !== amendment.prompt.sha256) throw Error('PROMPT_V2_CHANGED');
  return { doc, sha256: h, amendment, amendmentSha256: sha(ab) };
}
async function seal(out, name, plain) {
  const L = await import(path.join(ROOT, 'scripts/supertrader/validation/lib.mjs'));
  fs.writeFileSync(path.join(out, name + '.sealed.owner.json'), L.encryptForOwner(fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8'), plain));
  fs.writeFileSync(path.join(out, name + '.sealed.reviewer.json'), L.encryptForOwner(fs.readFileSync(path.join(ROOT, 'docs/research/edge2/reviewer-public.pem'), 'utf8'), plain));
}
async function driver(a) {
  if (a.smoke) return null;
  const { createS3DriverFromEnv } = await import(path.join(ROOT, 'scripts/market/storage/s3-driver.mjs'));
  return createS3DriverFromEnv(process.env);
}
function panelOf(a) {
  const MP = require(path.join(ROOT, 'scripts/quant/portfolio/model-portfolios.cjs'));
  const panel = MP.buildPanel({ workDir: a.workDir, delistedDir: a.delistedDir, delistedRawDir: a.delistedRawDir, fundamentals: a.fundamentals, window: WINDOW, limit: Number(a.limit || 0) });
  if (!a.smoke && panel.basis !== 'TOTAL_RETURN') throw Error('TOTAL_RETURN_PANEL_REQUIRED');
  return { MP, panel };
}

async function build(a, p, out) {
  const d = await driver(a);
  if (d) {
    const b = await d.get(LEDGER_KEY), l = b ? JSON.parse(b.toString('utf8')) : { schema: 'vu-edge2-blind-ledger-1.0.0', builds: [] };
    if (l.builds.some(x => x.status === 'BUILT')) throw Error('BLIND_ALREADY_BUILT');
  }
  const { panel } = panelOf(a);
  const salt = crypto.randomBytes(32).toString('hex');
  const r = B.buildPackets(panel, { window: WINDOW, salt, cadence: STUDY.cadence, topByMarketCap: STUDY.topByMarketCap });
  const packetsDoc = { schema: 'vu-edge2-blind-packets-1.0.0', label: p.doc.label, protocolSha256: p.sha256, builder: r.version, prompt: p.doc.prompt, features: r.features, path: r.path, packets: r.packets, packetsSha256: r.packetsSha256 };
  const keys = { schema: 'vu-edge2-blind-keys-1.0.0', protocolSha256: p.sha256, packetsSha256: r.packetsSha256, salt, keys: r.keys, data: panel.meta, runId: process.env.GITHUB_RUN_ID || 'local' };
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'packets.json'), JSON.stringify(packetsDoc) + '\n');
  const plain = Buffer.from(JSON.stringify(keys));
  if (d) {
    await d.put(STUDY.prefix + '/keys-' + r.packetsSha256 + '.json', plain, { contentType: 'application/json' });
    const b = await d.get(LEDGER_KEY), l = b ? JSON.parse(b.toString('utf8')) : { schema: 'vu-edge2-blind-ledger-1.0.0', builds: [] };
    l.builds.push({ status: 'BUILT', packetsSha256: r.packetsSha256, runId: keys.runId, commit: process.env.GITHUB_SHA || null, at: new Date().toISOString() });
    await d.put(LEDGER_KEY, Buffer.from(JSON.stringify(l)), { contentType: 'application/json' });
  } else fs.writeFileSync(path.join(out, 'keys.plain.json'), plain);
  await seal(out, 'keys', plain);
  console.log(JSON.stringify({ packets: r.packets.length, tooFew: r.keys.filter(k => k.state !== 'BUILT').length, packetsSha256: r.packetsSha256, bytes: fs.statSync(path.join(out, 'packets.json')).size }));
}

/** Erkennungstest auswerten (Protokoll recognitionTest.failIf). guesses: {packetId: {year, firms: {label: name}}}. */
function scoreRecognition(guesses, keys) {
  const byPacket = new Map(keys.keys.filter(k => k.state === 'BUILT').map(k => [k.packetId, k]));
  let n = 0, exact = 0, absErr = 0, cands = 0, firmHits = 0;
  const hits = [];
  for (const [pid, g] of Object.entries(guesses || {})) {
    const k = byPacket.get(pid); if (!k) continue;
    n++; const y = +k.date.slice(0, 4), gy = Number(g.year);
    if (gy === y) exact++;
    absErr += Number.isFinite(gy) ? Math.abs(gy - y) : 11;
    for (const [label, id] of Object.entries(k.labels)) {
      cands++;
      const guess = String((g.firms || {})[label] || '').trim().toUpperCase();
      const ticker = id.replace(/^(ref|dl)_/, '').split(':')[0].toUpperCase();
      if (guess && (guess === ticker || guess.split(/[\s(),]+/).includes(ticker))) { firmHits++; hits.push({ pid, label }); }
    }
  }
  const out = { packets: n, exactYearShare: n ? exact / n : null, meanAbsYearError: n ? absErr / n : null, candidates: cands, firmHitShare: cands ? firmHits / cands : null, firmHits: hits.length,
    note: 'Firmentreffer nur über den Ticker geprüft; genannte Firmennamen ohne Ticker prüft der Strang zusätzlich von Hand.' };
  out.failed = !n || out.exactYearShare > 0.25 || out.meanAbsYearError < 2.0 || out.firmHitShare > 0.02;
  return out;
}

async function resolve(a, p, out) {
  const d = await driver(a);
  const packets = JSON.parse(fs.readFileSync(path.join(a.blindDir || DIR, 'packets.json'), 'utf8'));
  if (packets.protocolSha256 !== p.sha256) throw Error('PACKETS_PROTOCOL_MISMATCH');
  const picksDoc = JSON.parse(fs.readFileSync(path.join(a.blindDir || DIR, 'picks.json'), 'utf8'));
  const recPath = path.join(a.blindDir || DIR, 'recognition.json'), rec = fs.existsSync(recPath) ? JSON.parse(fs.readFileSync(recPath, 'utf8')) : null;
  const keys = d ? JSON.parse((await d.get(STUDY.prefix + '/keys-' + packets.packetsSha256 + '.json')).toString('utf8')) : JSON.parse(fs.readFileSync(a.keys, 'utf8'));
  if (keys.packetsSha256 !== packets.packetsSha256) throw Error('KEYS_MISMATCH');
  const { MP, panel } = panelOf(a);
  const E3 = require('../edge/run-e3.cjs'), bm = E3.benchmarks(MP);
  // Gültigkeit wird hier aus den Antworten neu geprüft (Ergänzung 1), nicht aus einer Markierung übernommen.
  const byPid = new Map(packets.packets.map(x => [x.packetId, x]));
  const checked = (picksDoc.decisions || []).map(x => ({ packetId: x.packetId, ...B.checkAnswer(x.answer, byPid.get(x.packetId) || { candidates: [] }) }));
  const picks = Object.fromEntries(checked.map(x => [x.packetId, x.problem ? {} : x.weights]));
  const all50 = Object.fromEntries(packets.packets.map(x => [x.packetId, x.candidates.map(c => c.label)]));
  const cal = panel.calendar, idx = [...cal.keys()].filter(i => cal[i] >= WINDOW[0] && cal[i] <= '2026-10-02' && panel.benchmark.levels[i] > 0);
  const std = C.standardOf({ minPositions: 1, maxPositions: 50, targetPositions: 10, maxPositionWeight: 1 });
  const runOne = (pk, name, pan) => {
    const tg = B.targetsFromPicks(pan, keys.keys, pk, { variant: name });
    const r = Q.ledgerFromTargets(pan, { initialCapital: 1e6, terminalRecovery: BT.DEFAULTS.terminalRecovery }, std, idx, tg.targets, tg.memberships, STUDY.cadence === 'QUARTERLY' ? 14 : 8);
    const ev = r.state === 'RUN' ? E3.evaluate(r.equity, bm, MP) : null;
    let test = null; if (ev) { try { test = S.pairedTest(ev.returns, ev.spyReturns); } catch { test = null; } }
    return { name, state: r.state, problems: tg.problems, evaluation: ev ? { ...ev, returns: undefined, spyReturns: undefined } : null, test, weeklyReturns: ev ? ev.returns : null, equity: r.equity, costs: r.costs, turnover: r.turnover, terminalEvents: r.terminalEvents,
      verdict: ev && test ? S.verdict(ev.strategy, ev.SPY, test.pLog, test.pSharpe) : 'nicht bestimmbar (blockiert)' };
  };
  const ki = runOne(picks, 'KI', panel), pool = runOne(all50, 'POOL50', panel);
  let vsPool = null; try { vsPool = S.pairedTest(ki.weeklyReturns, pool.weeklyReturns); } catch { vsPool = null; }
  const { panel: dqp, census } = MP.applyDq(panel, 'DQ-K5-BOOK');
  const result = { schema: 'vu-edge2-blind-result-1.0.0', label: p.doc.label, version: VERSION, protocolSha256: p.sha256, packetsSha256: packets.packetsSha256, picksSha256: sha(fs.readFileSync(path.join(a.blindDir || DIR, 'picks.json'))),
    amendmentSha256: p.amendmentSha256, decisions: { total: packets.packets.length, answered: checked.length, valid: checked.filter(x => !x.problem).length, problems: checked.filter(x => x.problem).map(x => [x.packetId, x.problem]),
      positions: checked.filter(x => !x.problem).map(x => Object.keys(x.weights).length) }, recognition: rec ? scoreRecognition(rec.guesses, keys) : null,
    primary: { ki, pool50: pool, kiVsPool50: vsPool }, dqK5: { census, ki: runOne(picks, 'KI', dqp) }, runId: process.env.GITHUB_RUN_ID || 'local' };
  fs.mkdirSync(out, { recursive: true });
  const plain = Buffer.from(JSON.stringify(result));
  await seal(out, 'blind-result', plain);
  const pub = { schema: 'vu-edge2-blind-public-1.0.0', label: p.doc.label, protocolSha256: p.sha256, packetsSha256: packets.packetsSha256, picksSha256: result.picksSha256, decisions: result.decisions,
    recognitionFailed: result.recognition ? result.recognition.failed : null, state: ki.state, verdict: ki.verdict, privateSha256: sha(plain), runId: result.runId };
  fs.writeFileSync(path.join(out, 'blind-result.public.json'), JSON.stringify(pub, null, 1) + '\n');
  console.log(JSON.stringify({ state: ki.state, verdict: ki.verdict, privateSha256: pub.privateSha256 }));
}

async function main() {
  const a = args(process.argv);
  STUDY = STUDIES[a.study || 'v1']; if (!STUDY) throw Error('STUDY_UNKNOWN');
  PROTOCOL_FILE = STUDY.protocolFile; PROTOCOL_SHA256 = STUDY.protocolSha256; DIR = path.join(ROOT, STUDY.dir); LEDGER_KEY = STUDY.prefix + '/ledger.json';
  const p = protocol();
  if (!a.out) throw Error('OUT_REQUIRED');
  const out = path.resolve(a.out);
  if (out === ROOT || out.startsWith(ROOT + path.sep)) throw Error('OUT_INSIDE_REPOSITORY');
  if (!a.smoke && !a.workDir) throw Error('WORK_DIR_REQUIRED');
  if (a.phase === 'build') await build(a, p, out);
  else if (a.phase === 'resolve') await resolve(a, p, out);
  else throw Error('PHASE ' + a.phase);
}
if (require.main === module) main().catch(e => { console.error(String(e && e.stack || e)); process.exit(1); });
module.exports = { VERSION, scoreRecognition, WINDOW, STUDIES };
