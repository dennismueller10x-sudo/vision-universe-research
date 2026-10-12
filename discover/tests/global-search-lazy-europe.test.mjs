/* Globales Aktienuniversum: US- und Europa-Aktien bleiben gemeinsam und vollstaendig in der Suche,
   auch wenn das Europa-Verzeichnis beim Seitenstart noch nicht geladen wurde (es wird erst bei Bedarf geholt). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = path => readFileSync(join(root, path), 'utf8');
const json = path => JSON.parse(read(path));
const Universe = require('../../core/discover-universe.js');

const DAY = 86400000;
function session(date, hour = 16, minute = 30) { return { date, close: date + 'T' + String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0') + ':00+00:00' }; }

/** Ein Europa-Kalender, der um "jetzt" herum gueltig ist: heutige Sitzung ist abgeschlossen oder steht noch aus. */
function liveCalendar(mic, now = Date.now()) {
  const sessions = [];
  for (let i = -12; i <= 12; i++) sessions.push(session(new Date(now + i * DAY).toISOString().slice(0, 10), 16, 30));
  const completed = sessions.filter(s => Date.parse(s.close) <= now);
  return { calendar: { mic, coverageFrom: sessions[0].date, coverageTo: sessions.at(-1).date, sessions }, lastCompleted: completed.at(-1).date };
}

const SHA = 'f'.repeat(64);
function fixtureIndex(asOf) {
  const us = (s, n) => ({ i: 'vu_' + s, s, n, m: 1, securityId: 'ref_' + s, companyId: 'iss_' + s, listingId: 'vu_' + s, ticker: s, region: 'US', href: '#/s/US_REAL/' + s, aliases: [], isin: null, homePrimary: true });
  const eu = (s, n, ticker) => ({ i: 'vu_' + s, s, n, m: 1, securityId: 'ref_' + s, companyId: 'iss_' + s, listingId: 'vu_' + s, ticker, region: 'EUROPE', mic: 'XETR', country: 'DE', catalogSha256: SHA, asOf, href: '#/s/EUROPE/ref_' + s, aliases: [], isin: null, homePrimary: true });
  return { schema: 'fixture', entries: [us('NVDA', 'NVIDIA'), us('PLTR', 'Palantir Technologies'), eu('RHM_DE_XETR', 'Rheinmetall', 'RHM'), eu('ALV_DE_XETR', 'Allianz', 'ALV'), eu('SAP_DE_XETR', 'SAP', 'SAP'), eu('2GB_DE_XETR', '2G Energy', '2GB')] };
}

/** Browser-aehnlicher Kontext mit den echten Dateien core/identity.js, core/discover-universe.js, core/client.js und global-universe.js. */
function browser({ index, ensure, loader, late }) {
  const loads = [];
  const D = {};
  const context = {
    VUDiscover: D,
    QuantShell: { async loadJSON(path) { loads.push(path); if (path === '/discover/data/search/GLOBAL.json') return index; throw Error('unexpected ' + path); } },
    document: { addEventListener() {}, removeEventListener() {} },
    setTimeout, clearTimeout, Date, Promise, console
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  for (const file of ['core/identity.js', 'core/discover-universe.js', 'core/client.js']) vm.runInContext(read(file), context, { filename: file });
  if (ensure && late) setTimeout(() => { D.EuropeBootstrap = { ensure: () => ensure(D) }; }, late);
  else if (ensure) D.EuropeBootstrap = { ensure: () => ensure(D) };
  if (loader) D.europePublicLoader = loader;
  vm.runInContext(read('discover/engines/global-universe.js'), context, { filename: 'global-universe.js' });
  return { D, loads };
}
const openAuthority = calendar => ({ allowed: true, catalogSha256: SHA, calendar: { calendars: { XETR: calendar } } });
const entries = result => result.entries || result;
const names = result => Array.from(entries(result), h => h.n).sort();

test('Europa-Verzeichnis wird nicht beim Laden des Moduls angefordert, erst bei Suche, Alle-Aktien-Liste oder Watchlist', async () => {
  let ensured = 0;
  const { D } = browser({ index: fixtureIndex('2026-01-01'), ensure: async () => { ensured++; return null; } });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(ensured, 0, 'Start darf das Europa-Verzeichnis nicht holen');
  await D.GlobalUniverse.search('nvidia');
  assert.equal(ensured, 1);
});

test('Suche wartet auf das noch ladende Europa-Verzeichnis und findet US und Europa gemeinsam', async () => {
  const { calendar, lastCompleted } = liveCalendar('XETR');
  const { D } = browser({
    index: fixtureIndex(lastCompleted),
    // langsames Netz: die Freigabe steht erst nach 2,5 s bereit - laenger als die fruehere Wartezeit von 2 s
    ensure: async d => { await new Promise(resolve => setTimeout(resolve, 2500)); d.europePublicLoader = { authority: async () => openAuthority(calendar) }; }
  });
  const started = Date.now();
  const all = await Promise.all(['NVIDIA', 'Palantir', 'Rheinmetall', 'Allianz', 'SAP', '2G Energy'].map(q => D.GlobalUniverse.search(q)));
  assert.ok(Date.now() - started >= 2400, 'die Suche hat nicht auf die Europa-Freigabe gewartet');
  assert.deepEqual(all.map(names), [['NVIDIA'], ['Palantir Technologies'], ['Rheinmetall'], ['Allianz'], ['SAP'], ['2G Energy']]);
  // gemeinsame Trefferliste: ein Begriff, der US- und Europa-Titel trifft
  const both = entries(await D.GlobalUniverse.search('a'));
  assert.ok(both.some(h => h.region === 'US') && both.some(h => h.region === 'EUROPE'));
});

test('ohne freigegebenes Europa bleibt die US-Suche vollstaendig, Europa-Treffer entfallen (wie zuvor)', async () => {
  const { D } = browser({ index: fixtureIndex('2026-01-01'), ensure: async () => null });
  assert.deepEqual(names(await D.GlobalUniverse.search('NVIDIA')), ['NVIDIA']);
  assert.equal(entries(await D.GlobalUniverse.search('Allianz')).length, 0);
});

test('ein Fehler beim Europa-Start laesst die Suche nicht haengen und nicht abstuerzen', async () => {
  const { D } = browser({ index: fixtureIndex('2026-01-01'), ensure: async () => { throw Error('offline'); } });
  assert.deepEqual(names(await D.GlobalUniverse.search('Palantir')), ['Palantir Technologies']);
});

test('GlobalUniverse.warm laedt Index und Freigabe vor, ohne Treffer zu verlangen', async () => {
  const { calendar, lastCompleted } = liveCalendar('XETR');
  const { D, loads } = browser({ index: fixtureIndex(lastCompleted), ensure: async d => { d.europePublicLoader = { authority: async () => openAuthority(calendar) }; } });
  assert.equal(await D.GlobalUniverse.warm(), true);
  assert.deepEqual(loads, ['/discover/data/search/GLOBAL.json']);
  assert.equal(names(await D.GlobalUniverse.search('Allianz')).length, 1);
  assert.deepEqual(loads, ['/discover/data/search/GLOBAL.json'], 'der Index wird nicht ein zweites Mal geholt');
});

test('Suchfeld stoesst beim Oeffnen das Vorladen an', () => {
  const source = read('discover/ui/search.js');
  assert.match(source, /D\.GlobalUniverse\.warm\(\)/);
});

test('die ausgelieferte Suchdatei enthaelt die Pflichttitel gemeinsam: NVIDIA, Palantir, Rheinmetall, Allianz, SAP, 2G Energy', () => {
  const index = json('discover/data/search/GLOBAL.json');
  const europe = index.entries.filter(d => d.region === 'EUROPE'), us = index.entries.filter(d => d.region === 'US');
  assert.ok(us.length > 400 && europe.length > 400, 'beide Regionen im selben Index');
  // Nur bewerten, was die Freigabe zulaesst: Stand der Europa-Daten als "jetzt" (die Kalender liegen als Datenartefakt bei)
  const asOf = europe.map(d => d.asOf).sort().at(-1), now = asOf + 'T20:00:00Z';
  const calendar = json('discover/data/europe/calendar.json'), manifest = json('discover/data/europe/manifest.json');
  const authority = { allowed: true, catalogSha256: manifest.catalog.sha256, calendar };
  for (const [query, region] of [['NVIDIA', 'US'], ['Palantir', 'US'], ['Rheinmetall', 'EUROPE'], ['Allianz', 'EUROPE'], ['SAP', 'EUROPE'], ['2G Energy', 'EUROPE']]) {
    const hits = Universe.search(index, query, { authority, now, limit: 5 });
    assert.ok(hits.length > 0, query + ' nicht auffindbar');
    assert.equal(hits[0].region, region, query + ': erster Treffer ' + hits[0].n);
  }
});

test('Suche vor dem letzten Startskript (europe-bootstrap.js): wartet, statt ohne Europa zu antworten', async () => {
  const { calendar, lastCompleted } = liveCalendar('XETR');
  const { D } = browser({
    index: fixtureIndex(lastCompleted), late: 120,
    ensure: async d => { d.europePublicLoader = { authority: async () => openAuthority(calendar) }; }
  });
  assert.equal(D.EuropeBootstrap, undefined);
  assert.deepEqual(names(await D.GlobalUniverse.search('Rheinmetall')), ['Rheinmetall']);
});

test('ein fehlgeschlagener Europa-Start wird nicht 30 s lang als "kein Europa" festgehalten', async () => {
  const { calendar, lastCompleted } = liveCalendar('XETR');
  let calls = 0;
  const { D } = browser({
    index: fixtureIndex(lastCompleted),
    ensure: async d => { if (++calls === 1) return null; d.europePublicLoader = { authority: async () => openAuthority(calendar) }; }
  });
  assert.equal(entries(await D.GlobalUniverse.search('Allianz')).length, 0);
  assert.deepEqual(names(await D.GlobalUniverse.search('Allianz')), ['Allianz']);
});
