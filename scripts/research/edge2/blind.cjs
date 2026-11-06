'use strict';
// Edge 2 Teil 3b – blinder KI-Backtest (docs/research/edge2/ki/BLIND_PROTOKOLL.json). Forschung, nicht zertifiziert.
// Baut je Monat ein anonymes Paket mit 50 zufällig gezogenen Kandidaten aus dem Panel (keine Ticker, keine Namen, kein
// Datum, keine Branche im Klartext; Kurse relativ zum gleichgewichteten Universum, Startwert 100; Kennzahlen als Dezile im
// Universum). Ziehung, Gruppenbuchstaben und Paket-IDs hängen an einem geheimen Salz (nur im Runner erzeugt); die
// Zuordnung Paket -> Datum/Titel liegt nur im privaten Eimer und versiegelt beim Owner. Dieses Modul liest keine Dateien.
const crypto = require('node:crypto');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../../..');
const F = require(path.join(ROOT, 'quant/engines/portfolio-pit-factors.cjs'));
const C = require(path.join(ROOT, 'quant/engines/portfolio-construction.cjs'));
const P = require(path.join(ROOT, 'quant/engines/research-portfolio.cjs'));
const VERSION = 'edge2-blind-1.0.0';
const isNum = x => typeof x === 'number' && Number.isFinite(x);
const sha = x => crypto.createHash('sha256').update(typeof x === 'string' ? x : P.canonical(x)).digest('hex');
// Kennzahlen im Paket (Dezil 1 = niedrigster Wert im Universum, 10 = höchster; null = nicht verfügbar).
const FEATURES = Object.freeze([
  ['momentum12_1', 'Kursmomentum 12 Monate ohne letzten Monat'],
  ['volatility52', 'Volatilität 52 Wochen'],
  ['marketCap', 'Marktkapitalisierung'],
  ['earningsYield', 'Gewinnrendite (Gewinn / Marktwert)'],
  ['fcfYield', 'Free-Cashflow-Rendite'],
  ['bookToPrice', 'Buchwert / Marktwert'],
  ['grossMargin', 'Bruttomarge'],
  ['netMargin', 'Nettomarge'],
  ['fcfMargin', 'Free-Cashflow-Marge'],
  ['revenueGrowthYoy', 'Umsatzwachstum 1 Jahr'],
  ['revenueCagr3y', 'Umsatzwachstum 3 Jahre p. a.'],
  ['equityToAssets', 'Eigenkapitalquote'],
]);
const PATH_POINTS = 14, PATH_STEP = 4; // 13 Abschnitte à 4 Wochen = 52 Wochen

function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function seedOf(...parts) { return parseInt(sha(parts.join('|')).slice(0, 8), 16); }
function shuffle(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function decile(p) { return isNum(p) ? Math.min(10, Math.max(1, Math.ceil(p * 10))) : null; }

/** Entscheidungswochen: erste Panelwoche jedes Kalendermonats (MONTHLY) bzw. jedes Quartals (QUARTERLY) im Fenster. */
function decisionWeeks(panel, window, cadence = 'MONTHLY') {
  const cal = panel.calendar, out = [];
  for (let t = 1; t < cal.length - 1; t++) {
    if (!(cal[t] >= window[0] && cal[t] <= window[1]) || cal[t].slice(0, 7) === cal[t - 1].slice(0, 7)) continue;
    if (cadence === 'QUARTERLY' && !['01', '04', '07', '10'].includes(cal[t].slice(5, 7))) continue;
    out.push(t);
  }
  return out;
}

/** Zulässiges Universum an t: Kurs, Branche, 104 Wochen Historie, Liquidität wie VU-Standard, kein Ende vor t+1. */
// topByMarketCap (Blind v2): nur die N größten Titel nach point-in-time-Marktwert an t (Aktien × Rohschluss, SEC wie eingereicht).
function universeAt(panel, t, { topByMarketCap = null } = {}) {
  const std = C.standardOf({}), rows = [];
  for (const s of panel.securities) {
    if (!(s.adj[t] > 0) || !(s.adj[t + 1] > 0) || !s.sector) continue;
    if (!(s.adj[t - 104] > 0) || !(s.adj[t - 52] > 0)) continue;
    if (s.terminal && s.terminal.lastIdx <= t) continue;
    const pf = F.priceFactors(s.adj, t), ff = F.fundamentalFactors(s.bundle, panel.calendar[t], s.raw[t]);
    const c = { price: s.raw[t], dollarVolume: s.dv ? s.dv[t] : undefined, marketCap: isNum(ff.marketCap) ? ff.marketCap : undefined };
    if (!C.liquidity(c, std).eligible) continue;
    rows.push({ s, f: { ...pf, ...ff, volatility52: isNum(pf.negVol52) ? -pf.negVol52 : null } });
  }
  if (topByMarketCap) return rows.filter(r => isNum(r.f.marketCap)).sort((a, b) => b.f.marketCap - a.f.marketCap || (a.s.id < b.s.id ? -1 : 1)).slice(0, topByMarketCap);
  return rows;
}

function buildPackets(panel, { window, salt, candidates = 50, forceWeeks = null, cadence = 'MONTHLY', topByMarketCap = null }) {
  if (typeof salt !== 'string' || salt.length < 32) throw Error('SALT_REQUIRED');
  const seed = salt;
  const weeks = forceWeeks || decisionWeeks(panel, window, cadence), cal = panel.calendar, packets = [], keys = [];
  for (const t of weeks) {
    const rows = universeAt(panel, t, { topByMarketCap });
    if (rows.length < candidates * 2) { keys.push({ t, date: cal[t], state: 'TOO_FEW', universe: rows.length }); continue; }
    const pct = Object.fromEntries(FEATURES.map(([k]) => [k, F.percentiles(rows.map(r => r.f[k]))]));
    // Gleichgewichtetes Universum (Gesamtrendite) als Marktpfad; Kandidatenpfad relativ dazu.
    const mkt = [1];
    for (let k = t - 51; k <= t; k++) {
      let sum = 0, n = 0;
      for (const r of rows) { const a = r.s.adj[k], b = r.s.adj[k - 1]; if (a > 0 && b > 0) { sum += a / b - 1; n++; } }
      mkt.push(mkt.at(-1) * (1 + (n ? sum / n : 0)));
    }
    const r = rng(seedOf(seed, 'draw', cal[t]));
    const pick = shuffle(rows.map((_, i) => i), r).slice(0, candidates);
    const groups = shuffle([...new Set(rows.map(x => x.s.sector))].sort(), rng(seedOf(seed, 'groups', cal[t])));
    const groupOf = new Map(groups.map((g, i) => [g, String.fromCharCode(65 + i)]));
    const cands = [], map = {};
    pick.forEach((i, n) => {
      const x = rows[i], label = 'K' + String(n + 1).padStart(2, '0'), pathRel = [];
      for (let j = 0; j < PATH_POINTS; j++) {
        const k = t - 52 + j * PATH_STEP, a = x.s.adj[k], a0 = x.s.adj[t - 52];
        pathRel.push(a > 0 && a0 > 0 ? Math.round(100 * (a / a0) / (mkt[j * PATH_STEP] / mkt[0]) * 10) / 10 : null);
      }
      const dec = Object.fromEntries(FEATURES.map(([k]) => [k, decile(pct[k][i])]));
      cands.push({ label, group: groupOf.get(x.s.sector), relativePath: pathRel, deciles: dec });
      map[label] = x.s.id;
    });
    const packetId = 'P' + sha([seed, 'id', cal[t]].join('|')).slice(0, 10);
    const packet = { packetId, candidates: cands };
    packets.push(packet);
    keys.push({ t, date: cal[t], state: 'BUILT', packetId, universe: rows.length, labels: map, packetSha256: sha(packet) });
  }
  // Paketreihenfolge ohne Chronologie (nach Paket-ID sortiert).
  packets.sort((a, b) => (a.packetId < b.packetId ? -1 : 1));
  return { version: VERSION, features: FEATURES.map(([k, label]) => ({ key: k, label })), path: { points: PATH_POINTS, stepWeeks: PATH_STEP, basis: 'Gesamtrendite relativ zum gleichgewichteten Universum, Startwert 100 vor 52 Wochen' }, packets, keys, packetsSha256: sha(packets) };
}

/** Antwortprüfung nach Ergänzung 1: 4–20 Labels, Gewicht je Titel 0,02–0,25, Summe 1 ± 0,02, je Gruppe <= 0,30. */
function checkAnswer(answer, packet) {
  const labels = new Set(packet.candidates.map(c => c.label)), group = new Map(packet.candidates.map(c => [c.label, c.group]));
  const picks = answer && Array.isArray(answer.picks) ? answer.picks : [];
  if (!answer || answer.packetId !== packet.packetId) return { problem: 'PACKET_ID_MISMATCH' };
  const ls = picks.map(p => p && p.label);
  if (ls.length < 4 || ls.length > 20 || new Set(ls).size !== ls.length || !ls.every(l => labels.has(l))) return { problem: 'NOT_4_TO_20_VALID_LABELS' };
  const w = picks.map(p => Number(p.weight));
  if (!w.every(x => Number.isFinite(x) && x >= 0.02 - 1e-9 && x <= 0.25 + 1e-9)) return { problem: 'WEIGHT_OUT_OF_RANGE' };
  const sum = w.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 0.02) return { problem: 'WEIGHTS_DO_NOT_SUM_TO_1' };
  const weights = Object.fromEntries(ls.map((l, i) => [l, w[i] / sum])), per = {};
  for (const l of ls) per[group.get(l)] = (per[group.get(l)] || 0) + weights[l];
  if (Object.values(per).some(x => x > 0.305)) return { problem: 'GROUP_WEIGHT_ABOVE_30' };
  return { problem: null, weights };
}

/** Auswahlen -> Ziele für quant-e3.cjs#ledgerFromTargets (gleichgewichtet, Ausführung t+1, bis zur nächsten Entscheidung). */
function targetsFromPicks(panel, keys, picks, { variant = 'KI' } = {}) {
  const cal = panel.calendar, byId = new Map(panel.securities.map(s => [s.id, s]));
  const targets = [], memberships = [], problems = [];
  for (const k of keys.filter(x => x.state === 'BUILT').sort((a, b) => a.t - b.t)) {
    // picks[packetId]: Array von Labels (gleich gewichtet) oder {label: Gewicht}; leer = Cash.
    let pk = picks[k.packetId];
    if (pk === undefined || pk === null) { problems.push({ packetId: k.packetId, problem: 'NO_PICKS' }); pk = {}; }
    if (Array.isArray(pk)) { const u = [...new Set(pk)]; pk = Object.fromEntries(u.map(l => [l, 1 / u.length])); }
    const valid = Object.entries(pk).filter(([l]) => k.labels[l]);
    if (valid.length !== Object.keys(pk).length) problems.push({ packetId: k.packetId, problem: 'INVALID_LABELS' });
    const e = k.t + 1, w = {}, hs = {};
    for (const [l, x] of valid) {
      const id = k.labels[l], s = byId.get(id);
      if (s.adj[e] > 0 && !(s.terminal && s.terminal.lastIdx < e)) { w[id] = x; hs[id] = C.halfSpreadBps({ price: s.raw[k.t], dollarVolume: s.dv ? s.dv[k.t] : undefined }).bps; }
    }
    const members = Object.keys(w).sort(), mh = sha({ date: cal[k.t], members, variant });
    memberships.push({ effectiveAt: cal[k.t] + 'T00:00:00Z', availableAt: cal[k.t] + 'T00:00:00Z', sourceHash: mh, members });
    targets.push({ decisionDate: cal[k.t], executionDate: cal[e], availableAt: cal[k.t] + 'T23:59:59.999Z', membershipHash: mh, weights: w, hs });
  }
  return { targets, memberships, problems };
}

module.exports = { VERSION, FEATURES, decisionWeeks, universeAt, buildPackets, checkAnswer, targetsFromPicks, seedOf };
