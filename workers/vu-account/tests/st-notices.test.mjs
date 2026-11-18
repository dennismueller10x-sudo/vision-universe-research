// Supertrader-Stufen-Meldungen (Owner 16.11.2026): aus dem Kandidatenstand, Wortlaut nur nach Regel, Pflicht-Hinweis,
// Zustellung ueber den bestehenden App-Push (eine gebuendelte Nachricht am Tag).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {stageEvents, noticeText, noticeMessage, eventId, METHOD_NAME, RESEARCH, TITLE, SF_INDEX_URL, SF_SCHEMA} from '../src/st-notices.mjs';
import {runPush, stageNotices, digestMessage} from '../src/push.mjs';

const require = createRequire(import.meta.url);
const ROOT = new URL('../../../', import.meta.url);
const LEGAL = JSON.parse(readFileSync(new URL('assets/legal-notices.json', ROOT), 'utf8'));
const STNames = require('../../../supertrader/assets/st-names.js');

// Verbotene Woerter (Auftrag 16.11.2026, docs/legal/WORTWAHL.md): kein Signal, keine Empfehlung, kein Einstieg, keine Aufforderung.
export const FORBIDDEN = [/signal/i, /empfehl/i, /einstieg/i, /\bkauf/i, /verkauf/i, /jetzt handeln/i, /\bhandeln\b/i, /chance/i, /kursziel/i,
  /\bdu\b|\bdich\b|\bdir\b/i, /sollte|solltest|lohnt|günstig|interessant|kaufzone|\bstopp?\b|\bziel\b/i, /entscheid/i];

const fixture = (over = {}) => ({
  schema: SF_SCHEMA, asOf: '2026-11-14',
  strategies: [{strategyId: 'SF_MINERVINI_SEPA_VCP', candidateId: 'C06'}, {strategyId: 'SF_TURTLE_S1', candidateId: 'C01'}, {strategyId: 'kaputt', candidateId: 'C02'}],
  candidates: [{c: 'C06', t: 'NVDA', n: 'NVIDIA', s: 'CONFIRMED_RESEARCH_SETUP'}, {c: 'C01', t: 'ANET', n: 'Arista Networks', s: 'MODELED_TRADE_PLAN'},
    {c: 'C06', t: 'AAPL', n: 'Apple', s: 'CHART_CANDIDATE'}, {c: 'C01', t: 'MSFT', n: 'Microsoft', s: 'CHART_CANDIDATE'}, {c: 'C06', t: 'AMD', n: 'Advanced Micro Devices', s: 'CONFIRMED_RESEARCH_SETUP'}],
  changes: {status: 'COMPARED', previousAsOf: '2026-11-13', added: ['C06|NVDA', 'C01|ANET', 'C06|AAPL', 'C02|XYZ', 'C06|FEHLT'],
    removed: ['C01|TSLA'], restaged: [{key: 'C01|MSFT', from: 'CONFIRMED_RESEARCH_SETUP', to: 'CHART_CANDIDATE'},
      {key: 'C06|AMD', from: 'MODELED_TRADE_PLAN', to: 'CONFIRMED_RESEARCH_SETUP'}, {key: 'C06|AAPL', from: 'CHART_CANDIDATE', to: 'CHART_CANDIDATE'}]},
  ...over,
});

test('Stufen aus dem Kandidatenstand: erreicht, verlassen, entfallen; unbekannte Methode oder Stufe faellt weg', () => {
  const ev = stageEvents(fixture());
  const brief = ev.map(e => [e.ticker, e.subtype, e.stageBefore, e.stage, e.strategyId]);
  assert.deepEqual(brief, [
    ['ANET', 'STAGE_REACHED', null, 'MODELED_TRADE_PLAN', 'SF_TURTLE_S1'],
    ['NVDA', 'STAGE_REACHED', null, 'CONFIRMED_RESEARCH_SETUP', 'SF_MINERVINI_SEPA_VCP'],
    ['AAPL', 'STAGE_REACHED', null, 'CHART_CANDIDATE', 'SF_MINERVINI_SEPA_VCP'],
    ['AMD', 'STAGE_LEFT', 'MODELED_TRADE_PLAN', 'CONFIRMED_RESEARCH_SETUP', 'SF_MINERVINI_SEPA_VCP'],
    ['MSFT', 'STAGE_LEFT', 'CONFIRMED_RESEARCH_SETUP', 'CHART_CANDIDATE', 'SF_TURTLE_S1'],
    ['TSLA', 'STAGE_LEFT', null, null, 'SF_TURTLE_S1'],
  ]);
  for (const e of ev) {
    assert.match(e.eventId, /^ev_[a-f0-9]{16}$/);
    assert.equal(e.kind, 'ST_STAGE'); assert.equal(e.type, 'SUPERTRADER_SIGNAL'); assert.equal(e.instrumentId, null);
  }
  assert.equal(new Set(ev.map(e => e.eventId)).size, ev.length, 'eindeutig');
  assert.deepEqual(stageEvents(fixture()).map(e => e.eventId), ev.map(e => e.eventId), 'deterministisch');
  assert.notEqual(stageEvents(fixture({asOf: '2026-11-17'}))[0].eventId, ev[0].eventId, 'neuer Stand, neue Kennung');
  assert.equal(eventId('a'), eventId('a'));
  for (const bad of [null, {}, fixture({schema: 'x'}), fixture({asOf: '14.11.'}), fixture({changes: {status: 'NO_PREVIOUS'}}), fixture({candidates: null})])
    assert.deepEqual(stageEvents(bad), [], 'kein Vergleich, keine Meldung');
});

test('Wortlaut: nur Tatsachen nach Regel, nie Entscheidung oder Aufforderung; jede Meldung mit Forschungshinweis', () => {
  const texts = Object.fromEntries(stageEvents(fixture()).map(e => [e.ticker, noticeText(e)]));
  assert.deepEqual(texts, {
    NVDA: 'NVIDIA: Regel erfüllt laut Methode Minervini · VCP (Stand 14.11.)',
    ANET: 'Arista Networks: Plan fertig laut Methode Turtle · 20 Tage – Zone und Ungültig-Marke laut Methode stehen fest (Stand 14.11.)',
    AAPL: 'Apple: Muster erkannt laut Methode Minervini · VCP (Stand 14.11.)',
    AMD: 'Advanced Micro Devices: Plan laut Methode Minervini · VCP entfällt, die Regel ist weiter erfüllt (Stand 14.11.)',
    MSFT: 'Microsoft: erfüllt die Regel der Methode Turtle · 20 Tage nicht mehr, Muster weiter erkannt (Stand 14.11.)',
    TSLA: 'TSLA: Muster laut Methode Turtle · 20 Tage nicht mehr erkannt (Stand 14.11.)',
  });
  assert.equal(LEGAL.labels.research, RESEARCH, 'Pflicht-Hinweis aus assets/legal-notices.json');
  const messages = stageEvents(fixture()).map(noticeMessage).concat([digestMessage(3, true)]);
  for (const m of messages) {
    assert.ok(m.body.includes(RESEARCH), m.body);
    for (const re of FORBIDDEN) { assert.doesNotMatch(m.body, re, m.body); assert.doesNotMatch(m.title, re, m.title); }
  }
  assert.equal(TITLE, 'Supertrader · Regel-Ergebnis der Methode');
  // Zone erscheint nur als „Zone laut Methode“ (WORTWAHL Grundsatz 3).
  for (const m of messages) for (const hit of m.body.matchAll(/Zone/g)) assert.match(m.body.slice(hit.index), /^Zone und Ungültig-Marke laut Methode/);
  // Kein Fremdtext: Steuerzeichen und spitze Klammern aus Firmennamen fallen weg.
  const evil = stageEvents(fixture({candidates: [{c: 'C06', t: 'NVDA', n: '<b>NVIDIA</b>\nJETZT', s: 'CONFIRMED_RESEARCH_SETUP'}], changes: {status: 'COMPARED', added: ['C06|NVDA']}}));
  assert.equal(noticeText(evil[0]), 'bNVIDIA/b JETZT: Regel erfüllt laut Methode Minervini · VCP (Stand 14.11.)');
});

test('Ein Name je Methode wie auf der Seite (st-names.js)', () => {
  for (const [cid, name] of Object.entries(METHOD_NAME)) assert.equal(name, STNames.name(cid), cid);
  assert.equal(Object.keys(METHOD_NAME).length, 13);
});

test('Veroeffentlichter Kandidatenstand: Methoden-Kennungen passen (nur gelesen)', {skip: !existsSync(new URL('supertrader/data/sf-candidates/index.json', ROOT))}, () => {
  const index = JSON.parse(readFileSync(new URL('supertrader/data/sf-candidates/index.json', ROOT), 'utf8'));
  assert.equal(index.schema, SF_SCHEMA);
  assert.deepEqual(index.strategies.map(s => s.candidateId).sort(), Object.keys(METHOD_NAME).sort());
  for (const s of index.strategies) assert.match(s.strategyId, /^SF_[A-Z0-9_]{2,48}$/);
  const ev = stageEvents(index);
  assert.ok(ev.length <= 4000);
  // Firmennamen sind fremder Text (z. B. „Gamestop“): geprueft wird der Satz der Meldung.
  for (const e of ev) for (const re of FORBIDDEN) assert.doesNotMatch(noticeText({...e, name: 'Firma'}), re, noticeText(e));
});

test('runPush: Stufen-Meldungen mit erstem Blick, eine einzelne Meldung woertlich, sonst Tagesuebersicht', async () => {
  const now = Date.parse('2026-11-16T08:00:00Z'), index = fixture(), calls = [], sent = [];
  const fetchImpl = async url => url === SF_INDEX_URL ? {ok: true, text: async () => JSON.stringify(index)} : {ok: false};
  const ev = stageEvents(index), nvda = ev.find(e => e.ticker === 'NVDA');
  let claims = [{token: 'device-a', count: 1, stage: 1, ids: [nvda.eventId]}, {token: 'device-b', count: 4, stage: 2, ids: ['ev_0000000000000001']},
    {token: 'device-c', count: 2, stage: 0, ids: ['ev_0000000000000001', 'ev_0000000000000002']}];
  const service = {rpc: async (fn, args) => {
    calls.push([fn, args]);
    if (fn === 'supertrader_stage_seen') return '2026-11-15T22:10:00+00:00';
    return claims;
  }};
  const fcm = {configured: true, send: async (token, count, message) => { sent.push([token, count, message]); }};
  assert.deepEqual(await runPush({fcm, service, fetchImpl, now: () => now, stageAlerts: true}), {sent: 3, failed: 0});
  assert.deepEqual(calls[0], ['supertrader_stage_seen', {p_as_of: '2026-11-14'}]);
  const events = calls[1][1].p_events;
  assert.equal(events.length, ev.length, 'Watchlist-Ereignisse fehlen, Stufen-Meldungen gehen trotzdem raus');
  assert.ok(events.every(e => e.occurredAt === '2026-11-15T22:10:00.000Z'));
  assert.deepEqual(Object.keys(events[0]).sort(), ['eventId', 'kind', 'occurredAt', 'stage', 'strategyId', 'subtype', 'ticker', 'type'], 'nur Zuordnung, kein Text an die Datenbank');
  assert.deepEqual(sent[0], ['device-a', 1, {title: TITLE, body: 'NVIDIA: Regel erfüllt laut Methode Minervini · VCP (Stand 14.11.) · Forschung, nicht zertifiziert'}]);
  assert.deepEqual(sent[1][2], digestMessage(4, true));
  assert.equal(sent[2][2], null, 'nur Watchlist-Ereignisse: bisherige Tagesuebersicht');

  // Erster Blick aelter als 24 Stunden: der Stand wird nicht wieder gemeldet.
  const old = {rpc: async fn => fn === 'supertrader_stage_seen' ? '2026-11-14T22:00:00Z' : []};
  assert.deepEqual(await stageNotices({service: old, fetchImpl, now: () => now}), []);
  assert.deepEqual(await runPush({fcm, service: old, fetchImpl, now: () => now, stageAlerts: true}), {skipped: 'EVENTS_UNAVAILABLE'});
  // Kandidatenstand nicht erreichbar oder kaputt: keine Stufen-Meldung, kein Datenbankaufruf dafuer.
  const none = {rpc: async () => { throw Error('nicht aufrufen'); }};
  assert.deepEqual(await stageNotices({service: none, fetchImpl: async () => ({ok: false}), now: () => now}), []);
  assert.deepEqual(await stageNotices({service: none, fetchImpl: async () => ({ok: true, text: async () => JSON.stringify({schema: 'x'})}), now: () => now}), []);
});
