#!/usr/bin/env node
'use strict';
// Öffentlicher Export der KI-Depots A und B (Owner-Entscheidung 06.11.2026 über die Steuerung): Bestand, Gewichte,
// Begründung je Titel, Aufnahmedatum und -kurs, Wertentwicklung ab Live-Start je Position und je Depot.
// Beschriftung „Rechenmodell, kein echtes Geld“ (assets/legal-notices.json modelPortfolio). Keine Backtest-Zahlen.
// Quelle: die hash-verketteten Ledger docs/research/edge2/ki/ledger-{A,B}.jsonl und die veröffentlichten Schlusskurse
// quant/data/market/discover-series/<securityId>.json (Vertrag über quant/engines/published-close.js).
//
//   node scripts/research/edge2/ki-export.cjs [--today YYYY-MM-DD] [--out quant/data/product/ki-depots-v1.json]
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const Close = require(path.join(ROOT, 'quant/engines/published-close.js'));
const SCHEMA = 'ki-depots-1.0.0';
const LIVE_START = '2026-11-06';
const COST_PER_SIDE = 0.0011; // 1 bp Gebühr + 5 bp Slippage + ~5 bp Spread je Seite (wie der Forschungs-Ledger, pauschal)
const DEPOTS = [
  { key: 'A', id: 'EDGE2-KI-A-PAPER', slug: 'a', name: 'KI-Depot A', rule: 'Monatlich 4–20 Titel aus 50 zufällig gezogenen Kandidaten, Gewichte 2–25 %, höchstens 30 % je Branche; Einstieg zum Schluss des nächsten Handelstags; fester, versionierter Prompt (v2).', method: 'Eine KI wählt monatlich 4 bis 20 Titel aus 50 zufällig gezogenen Kandidaten. Sie sieht nur anonymisierte Kennzahlen (kein Name, kein Ticker, keine Branche im Klartext, kein Datum). Dieselbe Regel wird historisch blind geprüft.' },
  { key: 'B', id: 'EDGE2-KI-B-PAPER', slug: 'b', name: 'KI-Depot B', rule: 'Monatlich 4–20 Titel aus 25 zufällig gezogenen Kandidaten mit Analysten-Konsens und selbst recherchierten Nachrichten (Quelle und Datum je Fund); Gewichte 2–25 %, höchstens 30 % je Branche; fester, versionierter Prompt (B v3).', method: 'Wie Depot A, zusätzlich mit Ticker, Analysten-Konsens und aktuellen Nachrichten. Nur vorwärts, ohne historische Prüfung.' },
];
const r4 = x => (Number.isFinite(x) ? Math.round(x * 1e4) / 1e4 : null);
const r6 = x => (Number.isFinite(x) ? Math.round(x * 1e6) / 1e6 : null);
function args(argv) { const a = {}; for (let i = 2; i < argv.length; i++) { a[argv[i].slice(2)] = argv[i + 1]; i++; } return a; }
const readLedger = f => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : []);

function series(securityId, today, cache) {
  if (cache.has(securityId)) return cache.get(securityId);
  const f = path.join(ROOT, 'quant/data/market/discover-series', securityId + '.json');
  let out = null;
  if (fs.existsSync(f)) { const doc = JSON.parse(fs.readFileSync(f, 'utf8')); if (Close.lastPoint(doc, today)) out = doc.points.filter(p => p[0] <= today && p[1] > 0); }
  cache.set(securityId, out);
  return out;
}
// Schluss am Tag d oder davor (Fortschreibung bei fehlendem Kurs); erster Schluss nach d für den Einstieg.
const closeOnOrBefore = (pts, d) => { let v = null; for (const p of pts || []) { if (p[0] > d) break; v = p; } return v; };
const firstAfter = (pts, d) => (pts || []).find(p => p[0] > d) || null;

/** Ein Depot aus seinem Ledger: Beine je gültiger Entscheidung, Tageswerte ab Live-Start, heutiger Bestand. */
function buildDepot(def, rows, today, cache) {
  const decisions = rows.filter(r => r.type === 'DECISION');
  const usable = decisions.filter(r => r.valid);
  const calendar = (series('ref_SPY', today, cache) || []).map(p => p[0]).filter(d => d >= LIVE_START);
  let value = 1, held = [], cash = 1;
  const valueSeries = [], protocol = [];
  const entries = usable.map(d => ({ d, entryDate: (firstAfter(series('ref_SPY', today, cache), d.decisionDate) || [null])[0] })).filter(x => x.entryDate);
  let k = 0;
  for (const day of calendar) {
    // Umschichtung zum Schluss des Einstiegstags: alte Positionen zum heutigen Schluss bewerten, Kosten auf den Umschlag, neue Gewichte.
    while (k < entries.length && entries[k].entryDate === day) {
      const { d } = entries[k];
      const now = held.map(h => ({ ...h, px: (closeOnOrBefore(series(h.securityId, today, cache), day) || [null, h.lastPx])[1] }));
      let nav = cash + now.reduce((s, h) => s + h.units * h.px, 0);
      const oldW = new Map(now.map(h => [h.securityId, h.units * h.px / nav])), newW = new Map(d.picks.map(p => [p.securityId, p.weight]));
      let turnover = 0; for (const id of new Set([...oldW.keys(), ...newW.keys()])) turnover += Math.abs((newW.get(id) || 0) - (oldW.get(id) || 0));
      nav *= 1 - turnover * COST_PER_SIDE;
      for (const h of now) if (!newW.has(h.securityId)) protocol.push({ date: day, action: 'RAUS', ticker: h.ticker, weight: null, price: h.px });
      const prev = new Map(held.map(h => [h.securityId, h]));
      held = []; cash = nav;
      for (const p of d.picks) {
        const px = (closeOnOrBefore(series(p.securityId, today, cache), day) || [null, null])[1];
        if (!(px > 0)) { protocol.push({ date: day, action: 'OHNE_KURS', ticker: p.ticker, weight: p.weight, price: null }); continue; }
        const old = prev.get(p.securityId);
        if (!old) protocol.push({ date: day, action: 'REIN', ticker: p.ticker, weight: p.weight, price: px });
        held.push({ securityId: p.securityId, ticker: p.ticker, units: p.weight * nav / px, weight: p.weight, reason: p.reason, since: old ? old.since : day, entryPrice: old ? old.entryPrice : px, lastPx: px, decisionDate: d.decisionDate });
        cash -= p.weight * nav;
      }
      k++;
    }
    for (const h of held) { const c = closeOnOrBefore(series(h.securityId, today, cache), day); if (c) { h.lastPx = c[1]; h.lastDate = c[0]; } }
    value = cash + held.reduce((s, h) => s + h.units * h.lastPx, 0);
    if (entries.length && day >= entries[0].entryDate) valueSeries.push([day, r4(100 * value)]);
  }
  const last = usable.at(-1);
  // Entscheidung ohne Einstiegskurs (Schluss des nächsten Handelstags noch nicht veröffentlicht): als ausstehend zeigen.
  const lastEntered = entries.length && k > 0 ? entries[k - 1].d : null;
  const pendingD = last && last !== lastEntered ? last : null;
  const pending = pendingD ? { decisionDate: pendingD.decisionDate, entry: 'Schluss des nächsten Handelstags nach dem Entscheidungsdatum', count: pendingD.count, countReason: pendingD.countReason,
    positions: pendingD.picks.map(p => ({ ticker: p.ticker, securityId: p.securityId, name: nameOf(p.securityId), currency: 'USD', targetWeight: r6(p.weight), ...reasonOf(p.reason), news: newsFor(pendingD, p.securityId) })) } : null;
  return {
    id: def.id, slug: def.slug, name: def.name, method: def.method, rule: def.rule,
    prompt: last ? last.prompt.version : null, lastDecision: last ? last.decisionDate : null, decisions: decisions.length, invalidDecisions: decisions.filter(r => !r.valid).length,
    count: last ? last.count : 0, countReason: last ? last.countReason : null,
    positions: held.map(h => ({ ticker: h.ticker, securityId: h.securityId, name: nameOf(h.securityId), currency: 'USD', targetWeight: r6(h.weight), currentWeight: r6(h.units * h.lastPx / value), since: h.since, entryPrice: h.entryPrice, lastPrice: h.lastPx, lastDate: h.lastDate || h.since,
      changeSinceEntry: r4(h.lastPx / h.entryPrice - 1), ...reasonOf(h.reason), news: newsFor(last, h.securityId) })),
    cashWeight: r6(value > 0 ? cash / value : null), pending,
    performance: { start: valueSeries.length ? valueSeries[0][0] : null, index: valueSeries, changeSinceStart: valueSeries.length ? r4(valueSeries.at(-1)[1] / 100 - 1) : null, costModel: 'pauschal 0,11 % je Seite auf den Umschlag' },
    protocol,
    ledger: { file: 'docs/research/edge2/ki/ledger-' + def.key + '.jsonl', entries: rows.length, lastHash: rows.length ? rows.at(-1).hash : null },
  };
}
// Wortwahl (docs/legal/WORTWAHL.md): Die KI-Begründung bleibt im Ledger unverändert. Im öffentlichen Export werden
// Handlungs- und Empfehlungsbegriffe neutral ersetzt oder gestrichen; reasonNeutralized zeigt das an.
const WORDING = [
  [/[,;]?\s*(der|ein|einen)?\s*(jüngste[rn]?\s+)?(Rücksetzer|Rückgang)?\s*(bietet|und damit|damit)\s+(einen\s+)?günstigere[nr]?\s+Einstieg[^.;,]*/gi, ''],
  [/\b(Kauf|Einstiegs)(zone|chance|gelegenheit|marke|signal)\b/gi, 'Zone laut Methode'],
  [/\bgünstige[nr]?\s+Einstieg\b/gi, 'niedrigere Bewertung'],
  [/\b(Kaufempfehlung|Verkaufssignal|Kaufsignal|empfohlen|empfehlen|Empfehlung)\b/gi, 'Ergebnis der Methode'],
  [/\b(kaufen|verkaufen)\b/gi, 'aufnehmen'],
  [/\bChancen?\b/gi, ''],
];
function neutral(text) {
  let t = String(text || '');
  for (const [re, rep] of WORDING) t = t.replace(re, rep);
  t = t.replace(/\s{2,}/g, ' ').replace(/\s+([.,;])/g, '$1').replace(/^[\s,;]+|[\s,;]+$/g, '');
  if (t && !/[.!?]$/.test(t)) t += '.';
  return { text: t, changed: t !== String(text || '').trim() && t + '' !== String(text || '').trim() + '.' };
}
const reasonOf = r => { const n = neutral(r); return { reason: n.text, reasonNeutralized: n.changed }; };
let NAMES = null;
function nameOf(securityId) {
  if (!NAMES) { NAMES = new Map(); const f = path.join(ROOT, 'quant/data/market/security-master/company-names.json'); if (fs.existsSync(f)) for (const r of JSON.parse(fs.readFileSync(f, 'utf8')).rows || []) if (r.displayName) NAMES.set(r.securityId, r.displayName); }
  return NAMES.get(securityId) || null;
}
function newsFor(decision, securityId) {
  const p = decision && decision.picks.find(x => x.securityId === securityId);
  return p && Array.isArray(p.news) ? p.news.slice(0, 3).map(n => ({ date: n.date, title: n.title, source: n.source, url: n.url })) : [];
}

function build(today) {
  const notices = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/legal-notices.json'), 'utf8'));
  const mp = (notices.notices || notices).modelPortfolio;
  const cache = new Map();
  const depots = DEPOTS.map(d => buildDepot(d, readLedger(path.join(ROOT, 'docs/research/edge2/ki/ledger-' + d.key + '.jsonl')), today, cache));
  // asOf = letzter veröffentlichter Schluss (SPY-Reihe als Kalender), auch solange eine Entscheidung noch auf ihren Einstieg wartet.
  const asOf = ((series('ref_SPY', today, cache) || []).at(-1) || [null])[0];
  return { schemaVersion: SCHEMA, label: mp.label, recommendation: false, notice: { key: 'modelPortfolio', label: mp.label, text: mp.text, links: mp.links }, research: 'Forschung, nicht zertifiziert. Keine Backtest-Zahlen.',
    liveStart: LIVE_START, asOf, depots };
}
function main() {
  const a = args(process.argv), today = a.today || new Date().toISOString().slice(0, 10);
  const out = path.resolve(ROOT, a.out || 'quant/data/product/ki-depots-v1.json');
  const doc = build(today);
  const prev = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
  const body = JSON.stringify({ ...doc, contentSha256: crypto.createHash('sha256').update(JSON.stringify(doc)).digest('hex') }) + '\n';
  if (prev === body) { console.log(JSON.stringify({ state: 'UNCHANGED', asOf: doc.asOf })); return; }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, body);
  console.log(JSON.stringify({ state: 'WRITTEN', asOf: doc.asOf, depots: doc.depots.map(d => [d.id, d.positions.length]) }));
}
if (require.main === module) main();
module.exports = { SCHEMA, LIVE_START, build, buildDepot, neutral };
