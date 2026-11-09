#!/usr/bin/env node
'use strict';
// Quant-Musterdepots (öffentlich): die fünf Profile des VU-Portfolio-Standards, monatlich nach Regel VORWÄRTS gerechnet.
// Rechenmodell, kein echtes Geld. Keine Empfehlung (assets/legal-notices.json, modelPortfolio).
//
//   node scripts/quant/portfolio/model-depots.cjs [--out quant/data/product/model-depots-v1.json] [--today YYYY-MM-DD]
//
// Regeln (docs/quant/PORTFOLIO_STANDARD.md, Abschnitt „Musterdepots“):
// - Grundgesamtheit: heutiges Produktuniversum, nur ELIGIBLE (US-Stammaktie am Primärplatz), ohne belegte
//   Ticker-Wiederverwendungen (quant/config/ticker-reuse-quarantine.json); Kurse aus den veröffentlichten Wochenreihen,
//   Fundamentaldaten aus den committeten SEC-Bündeln (zuletzt eingereichte Fassung = heute bekannte Fassung).
// - Entscheidung mit derselben Engine wie die Forschung (portfolio-backtest.cjs#decide, Risikoparität, 15–30 Titel,
//   8 % je Titel, 25 % je Branche, Liquidität), am letzten Wochenschluss der Daten.
// - Umschichtung einmal je Kalendermonat: beim ersten Lauf eines Monats, sonst nur Bewertung zum Datenstand.
// - Aufnahmekurs = veröffentlichter Schluss zum Entscheidungslauf (quant/engines/published-close.js#lastPoint, ADR-002).
// - Das Protokoll (rein/raus) wird nur fortgeschrieben, nie geändert: ein Lauf übernimmt alle früheren Einträge unverändert.
// - Wertentwicklung ab Live-Start: wird mitgerechnet, aber nur veröffentlicht, wenn die Owner-Freigabe im Plan steht
//   (öffentliche Renditeaussage, CLAUDE.md). Backtest-Renditen 2012–2026 stehen hier nie.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const MP = require(path.join(ROOT, 'scripts/quant/portfolio/model-portfolios.cjs'));
const BT = require(path.join(ROOT, 'quant/engines/portfolio-backtest.cjs'));
const C = require(path.join(ROOT, 'quant/engines/portfolio-construction.cjs'));
const Close = require(path.join(ROOT, 'quant/engines/published-close.js'));
const Identity = require(path.join(ROOT, 'core/identity.js'));

const SCHEMA = 'model-depots-1.0.0';
const OUT = 'quant/data/product/model-depots-v1.json';
const LABEL = 'Rechenmodell, kein echtes Geld';
const PROFILES = ['quality-compounder', 'momentum-leader', 'garp', 'defensive-quality', 'value-momentum'];
const NAMES = { 'quality-compounder': 'Quality Compounder', 'momentum-leader': 'Momentum Leader', garp: 'GARP', 'defensive-quality': 'Defensive Quality', 'value-momentum': 'Value Momentum' };
const RULES = {
  'quality-compounder': 'Kauft Firmen mit hoher Qualität, guter Rendite auf das Kapital, ruhigem Kurs und Wachstum.',
  'momentum-leader': 'Kauft Aktien mit dem stärksten Kurstrend, die zugleich wachsen und nicht zu stark schwanken.',
  garp: 'Kauft wachsende Firmen mit guter Qualität, die im Vergleich noch günstig bewertet sind.',
  'defensive-quality': 'Kauft ruhige, solide und profitable Firmen mit stabilem Kurstrend.',
  'value-momentum': 'Kauft günstig bewertete Aktien, deren Kurstrend schon dreht und deren Qualität stimmt.',
};
// Owner-Freigabe für die öffentliche Wertentwicklung ab Live-Start: genau dieser Satz im Plan.
const APPROVAL_FILE = 'docs/PLAN_NEUSTART_2026-11.md';
const APPROVAL_MARKER = 'Freigabe Musterdepot-Wertentwicklung';
const COST_BPS = C.STANDARD.feeBps + C.STANDARD.slippageBps;

const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const r6 = x => Math.round(x * 1e6) / 1e6;

function args(argv) {
  const a = { out: OUT, today: new Date().toISOString().slice(0, 10) };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--out') a.out = argv[++i];
    else if (argv[i] === '--today') a.today = argv[++i];
    else if (argv[i] === '--limit') a.limit = Number(argv[++i]);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.today)) throw Error('TODAY_INVALID');
  return a;
}

// Wochenkalender aus der SPY-Tagesreihe (letzter Handelstag je ISO-Woche, bis heute).
function weeklySpy(today) {
  const file = 'quant/data/market/multi-asset/series/SPY.json', bytes = fs.readFileSync(path.join(ROOT, file));
  const pts = JSON.parse(bytes).points.filter(p => p[0] <= today && p[1] > 0);
  const byWeek = new Map();
  for (const p of pts) byWeek.set(MP.isoWeek(p[0]), [p[0], p[1]]);
  return { points: [...byWeek.values()], label: 'SPY_PRICE_RETURN', sourceHash: sha(bytes), file };
}

function universe() {
  const u = read('quant/data/market/scale/universe-ELIGIBLE_US_EQUITY.json');
  const q = read('quant/config/ticker-reuse-quarantine.json');
  const quarantined = new Set(q.records.map(r => r.securityId));
  const byId = new Map();
  for (const s of u.securities) {
    if (s.productEligibility !== 'ELIGIBLE' || quarantined.has(s.securityId)) continue;
    if (Identity.securityIdForTicker(s.ticker) !== s.securityId) continue; // Identität nur über core/identity.js
    byId.set(s.securityId, s);
  }
  return { byId, asOf: u.today || u.generatedAt || null };
}

function closeOf(id, today) {
  const f = path.join(ROOT, 'quant/data/market/discover-series', id + '.json');
  if (!fs.existsSync(f)) return null;
  return Close.lastPoint(JSON.parse(fs.readFileSync(f, 'utf8')), today);
}

function approved() {
  const f = path.join(ROOT, APPROVAL_FILE);
  return fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes(APPROVAL_MARKER);
}

// Bewertung eines Depots zu heutigen Kursen (fehlt ein Kurs, bleibt der letzte bekannte und die Position ist markiert).
function revalue(depot, today) {
  let value = depot.cash;
  for (const p of depot.positions) {
    const c = closeOf(p.securityId, today);
    if (c) { p.lastPrice = c.close; p.lastDate = c.date; p.priceStale = false; } else p.priceStale = true;
    value += p.units * p.lastPrice;
  }
  return value;
}

function rebalance(depot, built, uni, decisionDate, today, nav) {
  const targets = Object.entries(built.weights).filter(([, w]) => w > 0);
  const prev = new Map(depot.positions.map(p => [p.securityId, p]));
  const next = [], protocol = [];
  let cash = nav, traded = 0;  // traded: Umschlag in Geld (Verkäufe und Käufe)
  // Raus: gehaltene Titel, die nicht mehr im Ziel stehen (zum heutigen Kurs, sonst zum letzten bekannten).
  for (const p of depot.positions) if (!targets.some(([id]) => id === p.securityId)) {
    protocol.push({ date: decisionDate, action: 'RAUS', ticker: p.ticker, securityId: p.securityId, weight: null, price: p.lastPrice, since: p.since });
    traded += p.units * p.lastPrice;
  }
  // Kosten zuerst: Umschlag zu Zielgewichten auf dem ganzen Wert, dann wird nur der Wert nach Kosten angelegt.
  const priced = targets.sort((a, b) => b[1] - a[1]).map(([id, w]) => [id, w, uni.byId.get(id), closeOf(id, today)]).filter(x => x[2] && x[3]);
  for (const [id, w, , c] of priced) { const old = prev.get(id); traded += Math.abs(w * nav / c.close - (old ? old.units : 0)) * c.close; }
  const cost = traded * COST_BPS / 10000, investable = nav - cost;
  for (const [id, w, s, c] of priced) { // ohne veröffentlichten Kurs keine Aufnahme; der Anteil bleibt Bargeld
    const old = prev.get(id), units = w * investable / c.close;
    if (!old) protocol.push({ date: decisionDate, action: 'REIN', ticker: s.ticker, securityId: id, weight: r6(w), price: c.close });
    next.push({ ticker: s.ticker, securityId: id, weight: r6(w), units, since: old ? old.since : decisionDate, entryPrice: old ? old.entryPrice : c.close, entryDate: old ? old.entryDate : c.date,
      lastPrice: c.close, lastDate: c.date, priceStale: false });
    cash -= units * c.close;
  }
  depot.positions = next; depot.cash = Math.max(0, cash - cost); depot.costs = (depot.costs || 0) + cost;
  depot.protocol = depot.protocol.concat(protocol);
  depot.lastRebalance = decisionDate;
  return protocol.length;
}

function build(a) {
  const prevDoc = fs.existsSync(path.resolve(ROOT, a.out)) ? JSON.parse(fs.readFileSync(path.resolve(ROOT, a.out), 'utf8')) : null;
  if (prevDoc && prevDoc.schemaVersion !== SCHEMA) throw Error('PREVIOUS_SCHEMA_UNKNOWN');
  const bench = weeklySpy(a.today), uni = universe();
  const decisionDate = bench.points.at(-1)[0];
  const panel = MP.buildPanel({ window: [bench.points[0][0], decisionDate], benchmark: bench, limit: a.limit || 0 });
  panel.securities = panel.securities.filter(s => uni.byId.has(s.id));
  const t = panel.calendar.length - 1;
  const month = decisionDate.slice(0, 7);
  const liveStart = prevDoc ? prevDoc.liveStart : decisionDate;
  const std = C.standardOf({});
  const depots = [];
  for (const profileId of PROFILES) {
    const old = prevDoc && prevDoc.depots.find(d => d.profileId === profileId);
    const depot = old ? JSON.parse(JSON.stringify(old)) : { profileId, name: NAMES[profileId], rule: RULES[profileId], startCapital: 1e6, cash: 1e6, costs: 0, positions: [], protocol: [], lastRebalance: null, nav: [] };
    depot.name = NAMES[profileId]; depot.rule = RULES[profileId];
    const nav = revalue(depot, a.today);
    const due = !depot.lastRebalance || depot.lastRebalance.slice(0, 7) < month;
    depot.decision = { due, state: 'NOT_DUE' };
    if (due) {
      const d = BT.decide(panel, t, { ...BT.DEFAULTS, profileId, weighting: 'RISK_PARITY', standard: C.STANDARD }, std, null);
      depot.decision = { due, state: d.built.state, universe: d.universe, scored: d.scored, liquid: d.liquid };
      if (d.built.state === 'CONSTRUCTED') depot.decision.changes = rebalance(depot, d.built, uni, decisionDate, a.today, nav);
    }
    const value = depot.positions.reduce((s, p) => s + p.units * p.lastPrice, depot.cash);
    // Wertentwicklung je Lauf (ein Punkt je Datenstand). Ohne Owner-Freigabe wird die Reihe nicht gespeichert (die Datei
    // ist öffentlich); Bestand, Bargeld und Protokoll genügen, um sie später aus den Kursreihen nachzurechnen.
    depot.nav = (depot.nav || []).filter(x => x[0] < decisionDate).concat([[decisionDate, r6(value / depot.startCapital)]]);
    depot.invested = value > 0 ? r6(1 - depot.cash / value) : 0;
    depot.nextRebalance = nextMonthFirst(month);
    depots.push(depot);
  }
  const showPerformance = approved();
  const doc = {
    schemaVersion: SCHEMA, label: LABEL, legalNotice: 'modelPortfolio', certification: 'NOT_CERTIFIED', recommendation: false,
    liveStart, asOf: decisionDate, universeAsOf: uni.asOf,
    rules: { engine: BT.VERSION, construction: C.VERSION, standard: C.STANDARD, weighting: 'RISK_PARITY', rebalance: 'MONTHLY_FIRST_RUN_OF_MONTH', costsBpsPerSide: COST_BPS,
      population: 'PRODUKTUNIVERSUM_ELIGIBLE_OHNE_TICKER_WIEDERVERWENDUNG', entryPrice: 'PUBLISHED_CLOSE_AT_DECISION_RUN', fundamentals: 'COMMITTED_SEC_CONSUMER_LATEST_FILING' },
    performance: showPerformance ? { state: 'PUBLISHED', basis: 'MODEL_NAV_SINCE_LIVE_START', note: 'Wertentwicklung des Rechenmodells ab Live-Start, nach Kosten, ohne Steuern.' }
      : { state: 'AWAITING_OWNER_APPROVAL', note: 'Die Wertentwicklung ab Live-Start wird gerechnet, aber erst nach Owner-Freigabe gezeigt.' },
    benchmark: { file: bench.file, sourceHash: bench.sourceHash },
    depots: depots.map(d => ({ ...d, nav: showPerformance ? d.nav : undefined })),
  };
  // Das Protokoll ist nur fortschreibbar: jeder frühere Eintrag bleibt byte-gleich.
  if (prevDoc) for (const d of doc.depots) {
    const old = prevDoc.depots.find(x => x.profileId === d.profileId);
    if (old && JSON.stringify(d.protocol.slice(0, old.protocol.length)) !== JSON.stringify(old.protocol)) throw Error('PROTOCOL_REWRITTEN: ' + d.profileId);
  }
  return doc;
}

function nextMonthFirst(month) {
  const [y, m] = month.split('-').map(Number);
  return (m === 12 ? (y + 1) + '-01' : y + '-' + String(m + 1).padStart(2, '0')) + '-01';
}

function main() {
  const a = args(process.argv);
  const doc = build(a);
  const out = path.resolve(ROOT, a.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
  console.log(JSON.stringify({ out: a.out, asOf: doc.asOf, liveStart: doc.liveStart, performance: doc.performance.state,
    depots: doc.depots.map(d => [d.profileId, d.decision.state, d.positions.length, d.decision.changes || 0]) }));
}
if (require.main === module) main();
module.exports = { SCHEMA, PROFILES, RULES, APPROVAL_MARKER, build, nextMonthFirst, weeklySpy };
