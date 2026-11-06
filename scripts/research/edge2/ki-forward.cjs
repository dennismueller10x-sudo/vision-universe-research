#!/usr/bin/env node
'use strict';
// Edge 2 Teil 3a – KI-Depot vorwärts (docs/research/edge2/ki/BLIND_PROTOKOLL.json "forward", Prompt v1).
// Forschung, nicht zertifiziert. Die Entscheidung trifft eine Claude-Code-Sitzung im Abo (geplanter Auftrag), nicht die API.
// Dieselbe Regel wie im blinden Backtest: anonymes Paket (blind.cjs) aus den heutigen committeten Daten, 10 Titel, gleich gewichtet,
// einmal je Monat. Das Ledger docs/research/edge2/ki/ledger.jsonl ist nur angehängt und hash-verkettet.
//
//   node scripts/research/edge2/ki-forward.cjs status                       -> ist diesen Monat eine Entscheidung fällig?
//   node scripts/research/edge2/ki-forward.cjs packet --out-dir <außerhalb des Repos>   -> packet.json (für die KI), keys.json (nicht zeigen)
//   node scripts/research/edge2/ki-forward.cjs record --packet P --keys K --answer A    -> Eintrag DECISION
//   node scripts/research/edge2/ki-forward.cjs mark [--today YYYY-MM-DD]                -> Eintrag MARK (Schlusskurse über published-close.js)
//   node scripts/research/edge2/ki-forward.cjs evaluate                                 -> Bewertung (nur Konsole, nicht committen)
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const B = require('./blind.cjs');
const Close = require(path.join(ROOT, 'quant/engines/published-close.js'));
const LEDGER = path.join(ROOT, 'docs/research/edge2/ki/ledger.jsonl');
const PROTOCOL = 'docs/research/edge2/ki/BLIND_PROTOKOLL.json';
const DEPOT = 'EDGE2-KI-PAPER';
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const today0 = () => new Date().toISOString().slice(0, 10);

function args(argv) {
  const a = { _: argv[2] };
  for (let i = 3; i < argv.length; i++) { const k = argv[i]; if (!k.startsWith('--')) throw Error('ARG ' + k); a[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[i + 1]; i++; }
  return a;
}
function ledger(file = LEDGER) { return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : []; }
/** Hängt einen Eintrag an; prüft vorher die ganze Kette. */
function append(entry, file = LEDGER) {
  const rows = ledger(file);
  let prev = 'GENESIS';
  for (const r of rows) { const { hash, ...body } = r; if (body.prevHash !== prev || sha(JSON.stringify(body)) !== hash) throw Error('LEDGER_CHAIN_BROKEN at ' + r.seq); prev = hash; }
  const body = { seq: rows.length + 1, depot: DEPOT, prevHash: prev, recordedAt: new Date().toISOString(), ...entry };
  const row = { ...body, hash: sha(JSON.stringify(body)) };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(row) + '\n');
  return row;
}
function promptInfo() {
  const p = JSON.parse(fs.readFileSync(path.join(ROOT, PROTOCOL), 'utf8'));
  return { version: p.prompt.version, file: p.prompt.file, sha256: sha(fs.readFileSync(path.join(ROOT, p.prompt.file))), protocolSha256: sha(fs.readFileSync(path.join(ROOT, PROTOCOL))) };
}
function closeOf(securityId, today) {
  const f = path.join(ROOT, 'quant/data/market/discover-series', securityId + '.json');
  if (!fs.existsSync(f)) return null;
  return Close.lastPoint(JSON.parse(fs.readFileSync(f, 'utf8')), today);
}

function status(today = today0()) {
  const month = today.slice(0, 7), rows = ledger();
  const done = rows.some(r => r.type === 'DECISION' && r.decisionDate.slice(0, 7) === month);
  return { month, decisionDue: !done, entries: rows.length };
}

function packet(a) {
  const out = path.resolve(a.outDir || '');
  if (!a.outDir || out === ROOT || out.startsWith(ROOT + path.sep)) throw Error('OUT_DIR_OUTSIDE_REPOSITORY_REQUIRED');
  const MP = require(path.join(ROOT, 'scripts/quant/portfolio/model-portfolios.cjs')), MD = require(path.join(ROOT, 'scripts/quant/portfolio/model-depots.cjs'));
  const today = a.today || today0(), bench = MD.weeklySpy(today), decisionDate = bench.points.at(-1)[0];
  const panel = MP.buildPanel({ window: [bench.points[0][0], decisionDate], benchmark: bench, limit: Number(a.limit || 0) });
  // Vorwärts: die letzte Woche ist die Entscheidungswoche; t+1 gibt es noch nicht (Prüfung auf Kurs an t+1 entfällt).
  const T = panel.calendar.length;
  panel.calendar = panel.calendar.concat(['9999-12-31']);
  panel.benchmark = { ...panel.benchmark, levels: panel.benchmark.levels.concat([NaN]) };
  for (const s of panel.securities) { s.adj = Float64Array.from([...s.adj, s.adj[T - 1]]); s.raw = Float64Array.from([...s.raw, s.raw[T - 1]]); if (s.dv) s.dv = Float64Array.from([...s.dv, s.dv[T - 1]]); }
  const t = T - 1, salt = crypto.randomBytes(32).toString('hex');
  const rows = B.universeAt(panel, t);
  // Ein Monatspaket am letzten Stichtag (gleicher Bauplan wie buildPackets, Fenster = genau diese Woche).
  const r = B.buildPackets(panel, { window: [panel.calendar[t], panel.calendar[t]], salt, forceWeeks: [t] });
  if (!r.packets.length) throw Error('NO_PACKET ' + JSON.stringify(r.keys));
  const pk = r.packets[0], key = r.keys.find(k => k.state === 'BUILT');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'packet.json'), JSON.stringify({ features: r.features, path: r.path, packet: pk }, null, 0) + '\n');
  fs.writeFileSync(path.join(out, 'keys.json'), JSON.stringify({ decisionDate, universe: rows.length, packetId: pk.packetId, packetSha256: key.packetSha256, labels: key.labels, panel: panel.meta }) + '\n');
  console.log(JSON.stringify({ decisionDate, packetId: pk.packetId, universe: rows.length }));
}

function validAnswer(answer, pk) {
  const labels = new Set(pk.candidates.map(c => c.label)), group = new Map(pk.candidates.map(c => [c.label, c.group]));
  const picks = Array.isArray(answer.picks) ? answer.picks : [];
  const ls = picks.map(p => p && p.label);
  if (answer.packetId !== pk.packetId) return 'PACKET_ID_MISMATCH';
  if (ls.length !== 10 || new Set(ls).size !== 10 || !ls.every(l => labels.has(l))) return 'NOT_10_VALID_LABELS';
  const per = {}; for (const l of ls) per[group.get(l)] = (per[group.get(l)] || 0) + 1;
  if (Object.values(per).some(n => n > 3)) return 'MORE_THAN_3_PER_GROUP';
  return null;
}

function record(a) {
  const pkDoc = JSON.parse(fs.readFileSync(a.packet, 'utf8')), keys = JSON.parse(fs.readFileSync(a.keys, 'utf8'));
  const answer = JSON.parse(fs.readFileSync(a.answer, 'utf8'));
  const pk = pkDoc.packet;
  if (pk.packetId !== keys.packetId) throw Error('KEYS_MISMATCH');
  if (!status(keys.decisionDate).decisionDue) throw Error('DECISION_ALREADY_RECORDED_THIS_MONTH');
  const problem = validAnswer(answer, pk);
  const picks = problem ? [] : answer.picks.map(p => ({ label: p.label, securityId: keys.labels[p.label], ticker: keys.labels[p.label].replace(/^ref_/, ''), weight: 0.1, reason: String(p.reason || '').slice(0, 300) }));
  const row = append({ type: 'DECISION', decisionDate: keys.decisionDate, prompt: promptInfo(), packetId: pk.packetId, packetSha256: sha(JSON.stringify(pk)), universe: keys.universe,
    valid: !problem, problem, attempt: Number(a.attempt || 1), picks, packet: pk,
    pricing: 'Einstieg zum Schlusskurs des nächsten Handelstags nach decisionDate (quant/data/market/discover-series über published-close.js), gehalten bis zum Einstieg der nächsten Entscheidung' });
  console.log(JSON.stringify({ seq: row.seq, valid: row.valid, problem, tickers: picks.map(p => p.ticker) }));
}

function mark(a) {
  const today = a.today || today0(), rows = ledger();
  const ids = new Set(['ref_SPY']);
  for (const r of rows) if (r.type === 'DECISION') for (const p of r.picks) ids.add(p.securityId);
  const closes = {};
  for (const id of [...ids].sort()) {
    const c = closeOf(id, today);
    if (!c) { closes[id] = null; continue; }
    // Alle Schlüsse seit der ältesten Entscheidung (gleiche Reihe, also gleiche Split-Basis), damit Einstieg am Folgetag nachweisbar ist.
    const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/data/market/discover-series', id + '.json'), 'utf8'));
    const since = rows.filter(r => r.type === 'DECISION').map(r => r.decisionDate).sort()[0] || today;
    closes[id] = { last: c, points: doc.points.filter(p => p[0] > since && p[0] <= today) };
  }
  const row = append({ type: 'MARK', asOf: today, source: 'quant/data/market/discover-series/<securityId>.json via quant/engines/published-close.js#lastPoint', closes });
  console.log(JSON.stringify({ seq: row.seq, titles: Object.keys(closes).length, missing: Object.values(closes).filter(x => !x).length }));
}

/** Bewertung aus dem Ledger: monatliche Haltedauer, Einstieg am ersten Schluss nach der Entscheidung (Kursrendite). */
function evaluate() {
  const rows = ledger(), decisions = rows.filter(r => r.type === 'DECISION'), marks = rows.filter(r => r.type === 'MARK');
  if (!marks.length) return { state: 'NO_MARKS' };
  const m = marks.at(-1).closes;
  const px = (id, date) => { const s = m[id]; if (!s) return null; const p = s.points.find(q => q[0] > date); return p ? p : null; };
  const lastPx = id => (m[id] ? m[id].last : null);
  let value = 1, spy = 1;
  const legs = [];
  decisions.forEach((d, i) => {
    const next = decisions[i + 1], startSpy = px('ref_SPY', d.decisionDate);
    if (!startSpy) return;
    const endDate = next ? (px('ref_SPY', next.decisionDate) || [null])[0] : null;
    let r = 0;
    for (const p of d.picks) {
      const a = px(p.securityId, d.decisionDate); const b = endDate ? (m[p.securityId] && m[p.securityId].points.find(q => q[0] === endDate)) : lastPx(p.securityId);
      const rb = b ? (Array.isArray(b) ? b[1] : b.close) : null;
      r += a && rb ? p.weight * (rb / a[1] - 1) : 0; // fehlender Kurs: Position zählt mit 0 (konservativ, offengelegt)
    }
    const sEnd = endDate ? m['ref_SPY'].points.find(q => q[0] === endDate)[1] : lastPx('ref_SPY').close;
    const rs = sEnd / startSpy[1] - 1, cost = 2 * 0.0011; // 1 + 5 bp + ~5 bp Spread je Seite, volle Umschichtung angenommen
    value *= 1 + r - cost; spy *= 1 + rs;
    legs.push({ decisionDate: d.decisionDate, entry: startSpy[0], end: endDate || lastPx('ref_SPY').date, depot: r - cost, spyPrice: rs });
  });
  return { state: 'OK', basis: 'Kursrendite der Titel nach pauschalen Kosten gegen SPY-Kursrendite (Dividenden fehlen auf beiden Seiten; SPY-Gesamtrendite ergänzt die Bewertung nach 3/6/12 Monaten)', legs, depot: value - 1, spyPrice: spy - 1 };
}

function main() {
  const a = args(process.argv);
  if (a._ === 'status') console.log(JSON.stringify(status(a.today)));
  else if (a._ === 'packet') packet(a);
  else if (a._ === 'record') record(a);
  else if (a._ === 'mark') mark(a);
  else if (a._ === 'evaluate') console.log(JSON.stringify(evaluate(), null, 1));
  else throw Error('COMMAND ' + a._);
}
if (require.main === module) main();
module.exports = { append, ledger, validAnswer, status, DEPOT };
