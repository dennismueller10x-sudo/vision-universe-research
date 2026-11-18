// Supertrader: Stufen-Meldungen der 13 quellentreuen Methoden (Owner 16.11.2026: „nie sagen, dass es eine Entscheidung
// ist, sondern einfach, dass die Regel erfuellt worden ist der Methode und fertig“).
//
// Quelle: der veroeffentlichte Kandidatenstand supertrader/data/sf-candidates/index.json (Erzeuger: Kandidaten-Tageslauf,
// nur gelesen). Er vergleicht selbst mit dem vorigen Stand (changes: added, removed, restaged); hier wird daraus je
// Aktie und Methode eine Meldung, ohne eine Stufe nachzurechnen:
//   added      -> STAGE_REACHED (Stufe aus candidates)
//   restaged   -> hoeher: STAGE_REACHED, niedriger: STAGE_LEFT (von/nach)
//   removed    -> STAGE_LEFT (keine Stufe mehr; die vorige Stufe nennt der Stand nicht)
// Wer was bekommt, entscheidet die Datenbank (push_claim_daily): gemeldete Aktien jede Stufe, gefolgte Methoden nur
// „Regel erfuellt“ und „Plan fertig“ erreicht. Der interne Code SUPERTRADER_SIGNAL bleibt intern; sichtbar sind nur die
// Saetze aus noticeText(). Jede Meldung traegt „Forschung, nicht zertifiziert“ (assets/legal-notices.json, labels.research).

export const SF_INDEX_URL = 'https://research.visionuniverse.de/supertrader/data/sf-candidates/index.json';
export const SF_SCHEMA = 'supertrader-sf8-candidates-1.0.0';
export const RESEARCH = 'Forschung, nicht zertifiziert';
export const TITLE = 'Supertrader · Regel-Ergebnis der Methode';
export const STAGES = Object.freeze(['CHART_CANDIDATE', 'CONFIRMED_RESEARCH_SETUP', 'MODELED_TRADE_PLAN']);
export const STAGE_WORD = Object.freeze({CHART_CANDIDATE: 'Muster erkannt', CONFIRMED_RESEARCH_SETUP: 'Regel erfüllt', MODELED_TRADE_PLAN: 'Plan fertig'});
// Ein Name je Methode wie auf der Seite (supertrader/assets/st-names.js, Regel „Trader · Muster“; Test prueft Gleichheit).
export const METHOD_NAME = Object.freeze({
  C01: 'Turtle · 20 Tage', C02: 'Turtle · 55 Tage', C03: 'Darvas · Box', C04: 'Weinstein · Investor', C05: 'Weinstein · Trader',
  C06: 'Minervini · VCP', C07: 'Minervini · Power Play', C08: 'Kullamägi · Breakout', C09: 'Kullamägi · Episodic Pivot',
  C10: 'Kullamägi · Parabolic', C11: 'Morales & Kacher · Pocket Pivot', C12: 'Morales & Kacher · Buyable Gap-Up', C13: 'Raschke · Holy Grail',
});
const MAX_EVENTS = 4000;
const step = s => STAGES.indexOf(s);

// Zwei FNV-1a-32-Durchlaeufe mit verschiedenem Startwert: stabile eventId ohne asynchrones Hashing und ohne BigInt
// (ev_ + 16 Hex, wie die Watchlist-Ereignisse; ein Cron-Lauf baut einige tausend Kennungen).
export function eventId(text) {
  let a = 0x811c9dc5, b = 0x050c5d1f;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193); b = Math.imul(b ^ c, 0x01000193) ^ (b >>> 13);
  }
  return 'ev_' + (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
// Was die Datenbank zum Zuordnen braucht (push_claim_daily); Name, Methode und Text bleiben im Worker.
export const forClaim = e => ({eventId: e.eventId, kind: e.kind, type: e.type, subtype: e.subtype, stage: e.stage, strategyId: e.strategyId,
  ticker: e.ticker, occurredAt: e.occurredAt});
const shortDate = d => { const p = String(d || '').split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.` : ''; };
const clean = s => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);

/** Rein: Kandidatenstand -> Stufen-Meldungen (ohne Zeitpunkt; den setzt runPush mit dem ersten Blick). */
export function stageEvents(index) {
  if (!index || index.schema !== SF_SCHEMA || !/^\d{4}-\d{2}-\d{2}$/.test(index.asOf || '')) return [];
  const ch = index.changes;
  if (!ch || ch.status !== 'COMPARED' || !Array.isArray(index.candidates) || !Array.isArray(index.strategies)) return [];
  const strategy = new Map(index.strategies.filter(s => s && /^C\d\d$/.test(s.candidateId) && /^SF_[A-Z0-9_]{2,48}$/.test(s.strategyId))
    .map(s => [s.candidateId, s.strategyId]));
  const now = new Map(index.candidates.map(c => [c.c + '|' + c.t, c]));
  const out = [];
  const add = (key, subtype, stage, stageBefore) => {
    const [cid, ticker] = String(key).split('|'), sid = strategy.get(cid);
    if (!sid || !/^[A-Z0-9.\-]{1,24}$/.test(ticker || '') || (stage && step(stage) < 0) || (stageBefore && step(stageBefore) < 0)) return;
    const c = now.get(key);
    out.push({eventId: eventId([index.asOf, key, stageBefore || '', stage || ''].join('|')), kind: 'ST_STAGE', type: 'SUPERTRADER_SIGNAL',
      subtype, instrumentId: null, ticker, strategyId: sid, candidateId: cid, stage: stage || null, stageBefore: stageBefore || null,
      name: clean(c && c.n) || ticker, method: METHOD_NAME[cid] || sid, asOf: index.asOf});
  };
  for (const key of Array.isArray(ch.added) ? ch.added : []) { const c = now.get(key); if (c) add(key, 'STAGE_REACHED', c.s, null); }
  for (const r of Array.isArray(ch.restaged) ? ch.restaged : []) {
    if (!r || step(r.to) < 0 || step(r.from) < 0 || r.to === r.from) continue;
    add(r.key, step(r.to) > step(r.from) ? 'STAGE_REACHED' : 'STAGE_LEFT', r.to, r.from);
  }
  for (const key of Array.isArray(ch.removed) ? ch.removed : []) add(key, 'STAGE_LEFT', null, null);
  // Hoechstens MAX_EVENTS (push_claim_daily nimmt 5000 zusammen mit den Watchlist-Ereignissen): erreichte hoehere Stufen zuerst.
  const rank = e => (e.subtype === 'STAGE_REACHED' ? 0 : 3) + (2 - Math.max(0, step(e.stage)));
  return out.sort((a, b) => rank(a) - rank(b) || (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0)).slice(0, MAX_EVENTS);
}

/** Der eine Satz je Meldung: nur Tatsachen nach Regel, keine Entscheidung, keine Aufforderung. */
export function noticeText(e) {
  const who = e.name || e.ticker, m = e.method, stand = ` (Stand ${shortDate(e.asOf)})`;
  if (e.subtype === 'STAGE_REACHED') {
    if (e.stage === 'MODELED_TRADE_PLAN') return `${who}: Plan fertig laut Methode ${m} – Zone und Ungültig-Marke laut Methode stehen fest${stand}`;
    if (e.stage === 'CONFIRMED_RESEARCH_SETUP') return `${who}: Regel erfüllt laut Methode ${m}${stand}`;
    return `${who}: Muster erkannt laut Methode ${m}${stand}`;
  }
  if (e.stage === 'CONFIRMED_RESEARCH_SETUP') return `${who}: Plan laut Methode ${m} entfällt, die Regel ist weiter erfüllt${stand}`;
  if (e.stage === 'CHART_CANDIDATE') return `${who}: erfüllt die Regel der Methode ${m} nicht mehr, Muster weiter erkannt${stand}`;
  return `${who}: Muster laut Methode ${m} nicht mehr erkannt${stand}`;
}

/** Push-Inhalt einer einzelnen Stufen-Meldung. */
export function noticeMessage(e) {
  return {title: TITLE, body: `${noticeText(e)} · ${RESEARCH}`};
}
