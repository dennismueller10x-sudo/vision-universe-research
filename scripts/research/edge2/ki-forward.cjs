#!/usr/bin/env node
'use strict';
// Edge 2 Teil 3a – KI-Depot vorwärts (docs/research/edge2/ki/BLIND_PROTOKOLL.json "forward", Prompt v1).
// Forschung, nicht zertifiziert. Die Entscheidung trifft eine Claude-Code-Sitzung im Abo (geplanter Auftrag), nicht die API.
// Depot A: dieselbe Regel wie im blinden Backtest (Ergänzung 1, Prompt v2): anonymes Paket (blind.cjs) aus den heutigen
// committeten Daten, 4–20 Titel mit Gewichten, einmal je Monat. Depot B (Prompt B v1, nur vorwärts): dasselbe Paket plus Ticker,
// Analysten-Konsens und Schlagzeilen. Ledger docs/research/edge2/ki/ledger-A.jsonl und ledger-B.jsonl, nur angehängt, hash-verkettet.
//
//   node scripts/research/edge2/ki-forward.cjs status [--depot A|B]                    -> ist diesen Monat eine Entscheidung fällig?
//   node scripts/research/edge2/ki-forward.cjs packet --out-dir <außerhalb des Repos>   -> packet-A.json, packet-B.json (für die KI), keys.json (nicht zeigen)
//   node scripts/research/edge2/ki-forward.cjs record --depot A|B --packet P --keys K --answer A [--attempt 2]
//   node scripts/research/edge2/ki-forward.cjs mark --depot A|B [--today YYYY-MM-DD]   -> Eintrag MARK (Schlusskurse über published-close.js)
//   node scripts/research/edge2/ki-forward.cjs evaluate --depot A|B                    -> Bewertung (nur Konsole, nicht committen)
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const B = require('./blind.cjs');
const Close = require(path.join(ROOT, 'quant/engines/published-close.js'));
const DEPOTS = Object.freeze({ A: { id: 'EDGE2-KI-A-PAPER', ledger: path.join(ROOT, 'docs/research/edge2/ki/ledger-A.jsonl') }, B: { id: 'EDGE2-KI-B-PAPER', ledger: path.join(ROOT, 'docs/research/edge2/ki/ledger-B.jsonl') } });
const depotOf = d => { const x = DEPOTS[d || 'A']; if (!x) throw Error('DEPOT_UNKNOWN ' + d); return x; };
const LEDGER = DEPOTS.A.ledger, DEPOT = DEPOTS.A.id;
const AMENDMENT = 'docs/research/edge2/ki/BLIND_ERGAENZUNG_1.json';
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
function promptInfo(depot) {
  const am = JSON.parse(fs.readFileSync(path.join(ROOT, AMENDMENT), 'utf8')), pr = depot === 'B' ? am.depotB.prompt : am.prompt;
  const h = sha(fs.readFileSync(path.join(ROOT, pr.file)));
  if (h !== pr.sha256) throw Error('PROMPT_CHANGED ' + pr.file);
  return { version: pr.version, file: pr.file, sha256: h, amendmentSha256: sha(fs.readFileSync(path.join(ROOT, AMENDMENT))) };
}
function closeOf(securityId, today) {
  const f = path.join(ROOT, 'quant/data/market/discover-series', securityId + '.json');
  if (!fs.existsSync(f)) return null;
  return Close.lastPoint(JSON.parse(fs.readFileSync(f, 'utf8')), today);
}

function status(today = today0(), depot = 'A') {
  const month = today.slice(0, 7), rows = ledger(depotOf(depot).ledger);
  const done = rows.some(r => r.type === 'DECISION' && r.decisionDate.slice(0, 7) === month && (r.valid || r.attempt >= 2));
  return { depot, month, decisionDue: !done, entries: rows.length };
}
// Kontext für Depot B: Analysten-Konsens (dashboard/data/analysts) und Schlagzeilen (dashboard/data/news_feed.json).
function contextB(securityId) {
  const ticker = securityId.replace(/^ref_/, ''), shard = ticker.slice(0, 2).toUpperCase();
  let analysts = null;
  const f = path.join(ROOT, 'dashboard/data/analysts/shards', shard + '.json');
  if (fs.existsSync(f)) {
    const e = (JSON.parse(fs.readFileSync(f, 'utf8')).entries || {})[securityId];
    if (e && e.ratingsState === 'AVAILABLE') { const h = e.history || [], old = h[3] || h.at(-1) || null; analysts = { asOf: e.asOf, analysts: e.analysts, now: e.counts, about3MonthsAgo: old ? { period: old.period, strongBuy: old.strongBuy, buy: old.buy, hold: old.hold, sell: old.sell, strongSell: old.strongSell } : null }; }
  }
  let news = [];
  const nf = path.join(ROOT, 'dashboard/data/news_feed.json');
  if (fs.existsSync(nf)) news = (JSON.parse(fs.readFileSync(nf, 'utf8')).items || []).filter(x => x.symbol === ticker).slice(0, 3).map(x => ({ date: String(x.published_at || '').slice(0, 10), title: x.title }));
  return { ticker, analysts, news };
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
  fs.writeFileSync(path.join(out, 'packet-A.json'), JSON.stringify({ features: r.features, path: r.path, packet: pk }) + '\n');
  const pkB = { ...pk, candidates: pk.candidates.map(c => ({ ...c, context: contextB(key.labels[c.label]) })) };
  fs.writeFileSync(path.join(out, 'packet-B.json'), JSON.stringify({ features: r.features, path: r.path, packet: pkB }) + '\n');
  fs.writeFileSync(path.join(out, 'keys.json'), JSON.stringify({ decisionDate, universe: rows.length, packetId: pk.packetId, packetSha256: key.packetSha256, labels: key.labels, panel: panel.meta }) + '\n');
  console.log(JSON.stringify({ decisionDate, packetId: pk.packetId, universe: rows.length }));
}

function record(a) {
  const dep = a.depot || 'A', D = depotOf(dep);
  const pkDoc = JSON.parse(fs.readFileSync(a.packet, 'utf8')), keys = JSON.parse(fs.readFileSync(a.keys, 'utf8'));
  const raw = fs.readFileSync(a.answer, 'utf8');
  let answer = null; try { answer = JSON.parse(raw); } catch { answer = null; }
  const pk = pkDoc.packet;
  if (pk.packetId !== keys.packetId) throw Error('KEYS_MISMATCH');
  if (!status(keys.decisionDate, dep).decisionDue) throw Error('DECISION_ALREADY_RECORDED_THIS_MONTH');
  const chk = B.checkAnswer(answer, pk);
  const picks = chk.problem ? [] : answer.picks.map(p => ({ label: p.label, securityId: keys.labels[p.label], ticker: keys.labels[p.label].replace(/^ref_/, ''), weight: Math.round(chk.weights[p.label] * 1e6) / 1e6, reason: String(p.reason || '').slice(0, 300) }));
  const row = append({ type: 'DECISION', decisionDate: keys.decisionDate, prompt: promptInfo(dep), packetId: pk.packetId, packetSha256: sha(JSON.stringify(pk)), universe: keys.universe,
    valid: !chk.problem, problem: chk.problem, attempt: Number(a.attempt || 1), count: picks.length, countReason: answer && !chk.problem ? String(answer.countReason || '').slice(0, 300) : null, picks,
    answerSha256: sha(raw), packet: pk,
    pricing: 'Einstieg zum Schlusskurs des nächsten Handelstags nach decisionDate (quant/data/market/discover-series über published-close.js), gehalten bis zum Einstieg der nächsten Entscheidung' }, D.ledger, D.id);
  console.log(JSON.stringify({ depot: dep, seq: row.seq, valid: row.valid, problem: chk.problem, count: picks.length, tickers: picks.map(p => p.ticker) }));
}

function mark(a) {
  const D = depotOf(a.depot), today = a.today || today0(), rows = ledger(D.ledger);
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
  const row = append({ type: 'MARK', asOf: today, source: 'quant/data/market/discover-series/<securityId>.json via quant/engines/published-close.js#lastPoint', closes }, D.ledger, D.id);
  console.log(JSON.stringify({ seq: row.seq, titles: Object.keys(closes).length, missing: Object.values(closes).filter(x => !x).length }));
}

/** Bewertung aus dem Ledger: monatliche Haltedauer, Einstieg am ersten Schluss nach der Entscheidung (Kursrendite). */
function evaluate(depot = 'A') {
  const rows = ledger(depotOf(depot).ledger), decisions = rows.filter(r => r.type === 'DECISION' && r.valid), marks = rows.filter(r => r.type === 'MARK');
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
  if (a._ === 'status') console.log(JSON.stringify(status(a.today, a.depot || 'A')));
  else if (a._ === 'packet') packet(a);
  else if (a._ === 'record') record(a);
  else if (a._ === 'mark') mark(a);
  else if (a._ === 'evaluate') console.log(JSON.stringify(evaluate(a.depot || 'A'), null, 1));
  else throw Error('COMMAND ' + a._);
}
if (require.main === module) main();
module.exports = { append, ledger, status, contextB, DEPOTS };
