#!/usr/bin/env node
'use strict';
// V10 SETUP Pfad B: Bestandsaufnahme der ORIGINALEN (veroeffentlichten) Setup-Staende und exakter Reifekalender
// unter dem unveraenderten Vertrag (backtest-certification-1.0.0, setup-backtest-contract-1.0.0).
// Liest nur: quant/data/product/setup-observation-history/setup-mapping-1.0.0/*.json.gz, setup-outcomes-v1.json,
//            quant/data/market/discover-series/ref_*.json (Tageskurse, nur fuer rho), multi-asset SPY (Kalenderpruefung).
// Schreibt nur --out. Nichts wird rueckdatiert: Stichtage nach dem letzten veroeffentlichten Stand sind Projektionen
// ("fruehestens", Annahme: Veroeffentlichung an jeder kuenftigen NYSE-Sitzung, keine unbekannte Sonderschliessung).
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../../..');
const L = require('./setup-lib.cjs');
const C = require(path.join(ROOT, 'quant/engines/research-contract.cjs'));
const HIST = 'quant/data/product/setup-observation-history/setup-mapping-1.0.0';
const OUTCOMES = 'quant/data/product/setup-outcomes-v1.json';
const CERT = 'quant/methodology/backtest-certification-v1.json', BT = 'quant/methodology/setup-backtest-contract-v1.json';
const EVALUATOR = 'scripts/quant/build-backtest-certification.mjs';
const UP = { NO_SETUP: 0, WATCH: 1, SETUP_FORMING: 2, CONFIRMED: 3 };
function transitionType(a, b) { // identisch zur Vertragsregel (build-setup-outcomes.mjs#transitionType), hier neu geschrieben
  if (!(a in UP) || !(b in UP) || a === b) return null;
  if (b === 'CONFIRMED') return 'SETUP_CONFIRMED';
  if (b === 'SETUP_FORMING' && UP[a] < UP.SETUP_FORMING) return 'SETUP_NEW';
  if (UP[a] >= UP.SETUP_FORMING && UP[b] < UP[a]) return 'SETUP_WEAKENED';
  return null;
}
const ENTRY = ['SETUP_NEW', 'SETUP_CONFIRMED'];
const sha = p => C.shaFile(path.join(ROOT, p));
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

function loadSnapshots() {
  const files = fs.readdirSync(path.join(ROOT, HIST)).filter(f => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f)).sort();
  return files.map(f => {
    const s = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, HIST, f))).toString('utf8'));
    const body = { ...s }; delete body.contentHash;
    const ok = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 32) === s.contentHash;
    return { file: HIST + '/' + f, date: s.asOf, rows: s.rows, contentHashVerified: ok, fileSha256: sha(HIST + '/' + f) };
  });
}
function eventsOf(snaps) {
  const per = new Map();
  for (const s of snaps) for (const [t, row] of Object.entries(s.rows)) { if (!per.has(t)) per.set(t, []); per.get(t).push([s.date, row[0]]); }
  const ev = [];
  for (const [t, list] of per) for (let k = 1; k < list.length; k++) { const type = transitionType(list[k - 1][1], list[k][1]); if (type) ev.push([t, type, list[k][0]]); }
  return ev.sort((a, b) => a[2].localeCompare(b[2]) || a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
}
// rho wie V9 (letzte 127 Sitzungen der oeffentlichen Tagesreihen, Titel mit vollstaendiger Abdeckung), neu implementiert.
function rhoDaily(tickers) {
  const spyDoc = read('quant/data/market/discover-series/ref_SPY.json'); const spy = new Map(spyDoc.points);
  const window = spyDoc.points.map(p => p[0]).slice(-127);
  const cols = [], spyR = window.slice(1).map((d, i) => Math.log(spy.get(d) / spy.get(window[i])));
  for (const t of tickers) {
    const f = path.join(ROOT, 'quant/data/market/discover-series/ref_' + t + '.json'); if (!fs.existsSync(f)) continue;
    const d = JSON.parse(fs.readFileSync(f, 'utf8')); if (d.grain !== 'daily' || d.dataMode !== 'real') continue;
    const m = new Map(d.points); if (!window.every(x => m.has(x))) continue;
    cols.push(window.slice(1).map((x, i) => Math.log(m.get(x) / m.get(window[i]))));
  }
  return { window: [window[0], window.at(-1)], titles: cols.length, rhoRaw: L.meanPairwiseCorr(cols), rhoSpyExcess: L.meanPairwiseCorr(cols.map(c => c.map((x, i) => x - spyR[i]))) };
}

function main() {
  const argv = process.argv.slice(2), out = argv[argv.indexOf('--out') + 1];
  if (!argv.includes('--out') || !out) throw Error('--out REQUIRED');
  const cert = read(CERT), bt = read(BT), req = cert.kinds.SETUP_BACKTEST.requirements;
  const H6 = bt.horizons.find(h => h.id === 'm6').tradingDays, H3 = bt.horizons.find(h => h.id === 'm3').tradingDays;
  const snaps = loadSnapshots(), dates = snaps.map(s => s.date), events = eventsOf(snaps), outcomes = read(OUTCOMES);
  const published = outcomes.events.map(e => e.join('|')).sort(), mine = events.map(e => e.join('|')).sort();
  // Kalender: Regeln gegen beobachtete SPY-Tagesdaten (1998-01-02 .. letzter Punkt) pruefen.
  const spyDates = read('quant/data/market/multi-asset/series/SPY.json').points.map(p => p[0]).filter(d => d >= '1998-01-02');
  const cal = L.sessions(spyDates[0], spyDates.at(-1)), spySet = new Set(spyDates), calSet = new Set(cal);
  const calendarCheck = { from: spyDates[0], to: spyDates.at(-1), spySessions: spyDates.length, ruleSessions: cal.length,
    onlyInSpy: spyDates.filter(d => !calSet.has(d)), onlyInRules: cal.filter(d => !spySet.has(d)) };
  calendarCheck.state = !calendarCheck.onlyInSpy.length && !calendarCheck.onlyInRules.length ? 'EXACT_MATCH' : 'MISMATCH';
  if (calendarCheck.state !== 'EXACT_MATCH') throw Error('CALENDAR_MISMATCH');

  // Reife je Ereignisdatum (NEXT_CLOSE: Einstieg naechste Sitzung; Reife = Einstieg + h Sitzungen; Wert liegt nach Schluss dieser Sitzung vor).
  const byDate = new Map();
  for (const [t, type, d] of events) { if (!byDate.has(d)) byDate.set(d, { SETUP_NEW: 0, SETUP_CONFIRMED: 0, SETUP_WEAKENED: 0, titles: new Set() }); const x = byDate.get(d); x[type]++; x.titles.add(t); }
  const maturity = [...byDate].map(([d, x]) => { const e = L.nextSession(d); return { eventDate: d, entryNextClose: e, m1: L.addSessions(e, 21), m3: L.addSessions(e, H3), m6: L.addSessions(e, H6), m12: L.addSessions(e, 252),
    SETUP_NEW: x.SETUP_NEW, SETUP_CONFIRMED: x.SETUP_CONFIRMED, SETUP_WEAKENED: x.SETUP_WEAKENED, titles: x.titles.size }; });

  // Ueberlappung der Signale.
  const entries = events.filter(e => ENTRY.includes(e[1])), perTitle = new Map();
  for (const [t, , d] of entries) { if (!perTitle.has(t)) perTitle.set(t, []); perTitle.get(t).push(d); }
  const posOf = new Map(L.sessions('2026-01-02', '2027-12-31').map((d, i) => [d, i]));
  const entryPos = d => posOf.get(L.nextSession(d));
  const repeatedWithinM6 = [...perTitle.values()].reduce((n, ds) => n + ds.slice(1).filter((d, i) => entryPos(d) - entryPos(ds[i]) < H6).length, 0);
  const overlap = { entryEvents: entries.length, entryTitles: perTitle.size, titlesWithRepeatedEntry: [...perTitle.values()].filter(x => x.length > 1).length,
    repeatedEntryWithinOpenM6WindowOfSameTitle: repeatedWithinM6, maxEntryEventsOnOneDate: Math.max(...maturity.map(m => m.SETUP_NEW + m.SETUP_CONFIRMED)),
    entrySpanSessions: entryPos(entries.at(-1)[2]) - entryPos(entries[0][2]), allPairsOfM6WindowsOverlap: entryPos(entries.at(-1)[2]) - entryPos(entries[0][2]) < H6,
    nonOverlappingM6Blocks: L.nonOverlappingBlocks(entries.map(e => entryPos(e[2])), H6), disjointM6Windows: L.disjointWindows(entries.map(e => entryPos(e[2])), H6) };

  // N_eff (Modell V9) fuer die veroeffentlichten Ereignisse.
  const rho = rhoDaily([...new Set(events.map(e => e[0]))].sort());
  const neff = {};
  for (const kind of ['ALL', 'ENTRY', 'SETUP_NEW', 'SETUP_CONFIRMED', 'SETUP_WEAKENED']) {
    const sub = events.filter(e => kind === 'ALL' || (kind === 'ENTRY' ? ENTRY.includes(e[1]) : e[1] === kind)).map(e => ({ t: e[0], p: entryPos(e[2]) }));
    neff[kind] = { n: sub.length, nEffRaw: L.nEff(sub, rho.rhoRaw, H6).nEff, nEffSpyExcess: L.nEff(sub, rho.rhoSpyExcess, H6).nEff };
  }

  // Gate-Kalender unter unveraendertem Vertrag und unveraendertem Auswerter.
  const last = dates.at(-1), future = L.sessions(L.nextSession(last), '2030-12-31');
  const needDates = req.historyDates - dates.length;
  const spanDate = (() => { const t = L.utc(dates[0]) + req.historySpanDays * 86400000; let d = L.iso(t); while (!L.isSession(d)) d = L.nextSession(d); return d; })();
  // completedOutcomesM6: max ueber SETUP_CONFIRMED / SETUP_NEW (Auswerter Z. 132); Annahme: jedes Ereignis bepreist und reif.
  const cum = { SETUP_NEW: 0, SETUP_CONFIRMED: 0 }; let m6Date = null, m6Kind = null;
  for (const m of maturity) { cum.SETUP_NEW += m.SETUP_NEW; cum.SETUP_CONFIRMED += m.SETUP_CONFIRMED; if (!m6Date && Math.max(cum.SETUP_NEW, cum.SETUP_CONFIRMED) >= req.completedOutcomesM6) { m6Date = m.m6; m6Kind = cum.SETUP_NEW >= req.completedOutcomesM6 ? 'SETUP_NEW' : 'SETUP_CONFIRMED'; } }
  const eventMonths = [...new Set(events.map(e => e[2].slice(0, 7)))].sort();
  const monthsMissing = req.independentWeeks - eventMonths.length;
  const monthTarget = (() => { const [y, m] = eventMonths.at(-1).split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + monthsMissing, 1)); const first = t.toISOString().slice(0, 10); return L.isSession(first) ? first : L.nextSession(first); })();
  const firstM6 = maturity[0].m6;
  const evaluatorText = fs.readFileSync(path.join(ROOT, EVALUATOR), 'utf8').split('\n');
  const oosLine = evaluatorText.findIndex(l => /G\("oos"/.test(l)) + 1, titlesLine = evaluatorText.findIndex(l => /const completedTitles/.test(l)) + 1, monthsLine = evaluatorText.findIndex(l => /const eventWeeks/.test(l)) + 1;
  const gates = [
    { gate: 'historyDates', required: req.historyDates, observed: dates.length, earliest: future[needDates - 1], basis: `${needDates} weitere Veroeffentlichungen an aufeinanderfolgenden NYSE-Sitzungen ab ${future[0]}` },
    { gate: 'historySpanDays', required: req.historySpanDays, observed: Math.round((L.utc(last) - L.utc(dates[0])) / 86400000), earliest: spanDate, basis: `erster Stand ${dates[0]} + ${req.historySpanDays} Kalendertage, naechste Sitzung` },
    { gate: 'completedOutcomesM6', required: req.completedOutcomesM6, observed: 0, earliest: m6Date, basis: `Reife M6 (${H6} Sitzungen nach NEXT_CLOSE-Einstieg) der Ereignisse vom ${maturity[0].eventDate}; ${m6Kind} hat dort ${maturity[0][m6Kind]} Ereignisse (>= ${req.completedOutcomesM6}), Annahme: alle bepreist, keines INCOMPLETE` },
    { gate: 'titles', required: req.titles, observed: 0, earliest: firstM6, basis: `Auswerter Z. ${titlesLine} zaehlt ALLE Titel einer Ereignisart, sobald mindestens ein M6-Ergebnis abgeschlossen ist (heute ${outcomes.study.SETUP_NEW.titles} Titel SETUP_NEW); damit faellt das Gate mit der ersten M6-Reife` },
    { gate: 'independentWeeks', required: req.independentWeeks, observed: eventMonths.length, earliest: monthTarget, basis: `Auswerter Z. ${monthsLine} zaehlt verschiedene Kalendermonate (date.slice(0,7)) aller Ereignisse inkl. SETUP_WEAKENED; ${monthsMissing} weitere Monate, je mindestens ein Ereignis; frueheste Sitzung des ${req.independentWeeks}. Monats` },
    { gate: 'entryVariant', required: 'Delta Median M6 <= 1 Pp (SETUP_CONFIRMED)', observed: 'NOT_MEASURABLE_YET', earliest: maturity.find(m => m.SETUP_CONFIRMED > 0).m6, basis: 'erst messbar, sobald M6-Ergebnisse von SETUP_CONFIRMED vorliegen; Ergebnis offen (kann PASS oder OWNER_GATE_ENTRY_VARIANT sein)' },
    { gate: 'oos', required: `oosMinPerSegment ${req.oosMinPerSegment}`, observed: 'konstant false', earliest: null, basis: `Auswerter Z. ${oosLine} setzt das Gate unbedingt auf false (keine Segmentdefinition implementiert); ohne Codeaenderung zu keinem Datum erfuellbar` },
    { gate: 'returnBasis', required: 'TOTAL_RETURN', observed: outcomes.returnType, earliest: null, basis: 'strukturell: haengt an der Preisquelle des Pipeline-Laufs, nicht an der Zeit' },
    { gate: 'ownerApproval', required: 'setup-state-v1.json requirements.backtestCertification = CERTIFIED', observed: 'NOT_CERTIFIED', earliest: null, basis: 'Owner-Entscheidung; keine Zeitbedingung' }];
  const timeGates = gates.filter(g => ['historyDates', 'historySpanDays', 'completedOutcomesM6', 'titles', 'independentWeeks'].includes(g.gate));
  const doc = {
    schemaVersion: 'quant-v10-setup-original-inventory-1.0.0', evidenceKind: 'SOURCE_EVIDENCE', status: 'ANALYSIS_ONLY_NO_GATE_CHANGE',
    asOfPublished: last, sources: Object.fromEntries([OUTCOMES, CERT, BT, EVALUATOR, 'quant/data/market/discover-series/ref_SPY.json', 'quant/data/market/multi-asset/series/SPY.json'].map(p => [p, sha(p)])),
    snapshots: { count: snaps.length, from: dates[0], to: last, contentHashVerified: snaps.filter(s => s.contentHashVerified).length,
      gapsDays: dates.slice(1).map((d, i) => Math.round((L.utc(d) - L.utc(dates[i])) / 86400000)), nyseSessionsInSpan: L.sessions(dates[0], last).length,
      missedSessionsInSpan: L.sessions(dates[0], last).filter(d => !dates.includes(d)),
      perDate: snaps.map(s => ({ date: s.date, titles: Object.keys(s.rows).length, sha256: s.fileSha256 })) },
    events: { total: events.length, byType: Object.fromEntries(['SETUP_NEW', 'SETUP_CONFIRMED', 'SETUP_WEAKENED'].map(k => [k, events.filter(e => e[1] === k).length])),
      titles: new Set(events.map(e => e[0])).size, eventDates: byDate.size, calendarMonths: eventMonths, isoWeeks: [...new Set(events.map(e => { const t = new Date(L.utc(e[2])); t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7)); const y = t.getUTCFullYear(); return y + '-W' + String(Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7)).padStart(2, '0'); }))].length,
      recomputedEqualsPublished: JSON.stringify(published) === JSON.stringify(mine), recomputedHash: C.hash(mine) },
    maturedOutcomes: { M1: 'siehe setup-outcomes-v1 (Pipeline)', M3: 0, M6: 0, publishedStatusM6: { SETUP_NEW: outcomes.study.SETUP_NEW.variants.NEXT_CLOSE.m6.status, SETUP_CONFIRMED: outcomes.study.SETUP_CONFIRMED.variants.NEXT_CLOSE.m6.status },
      returnType: outcomes.returnType, note: 'Heute ist kein M3- und kein M6-Ergebnis reif; erste M3-Reife ' + maturity[0].m3 + ', erste M6-Reife ' + maturity[0].m6 + '.' },
    calendar: { rules: 'NYSE: Neujahr (Sa: kein Ersatz, So: Mo), MLK, Presidents Day, Karfreitag, Memorial Day, Juneteenth ab 2022, 4. Juli, Labor Day, Thanksgiving, Weihnachten (Sa: Fr, So: Mo) + belegte Sonderschliessungen', specialClosures: L.SPECIAL_CLOSURES, check: calendarCheck,
      holidays: { 2026: L.nyseHolidays(2026), 2027: L.nyseHolidays(2027), 2028: L.nyseHolidays(2028), 2029: L.nyseHolidays(2029) } },
    maturityByEventDate: maturity, overlap, independence: { model: 'wie docs/quant-recovery/v9/setup-independence-1.0.0.json (rho_ij*overlap/H, H=' + H6 + ' Sitzungen), JS-Neuimplementierung', rho, byKind: neff },
    gateCalendar: { contract: cert.schemaVersion, unchangedContract: true, gates, bindingTimeGate: timeGates.reduce((a, g) => (g.earliest > a.earliest ? g : a)),
      certifiableUnderUnchangedEvaluator: false, why: 'oos ist im Auswerter konstant false; returnBasis und Owner-Freigabe haben keine Zeitbedingung. Das spaeteste Zeit-Gate ist der Monatszaehler.' },
    certificationStatus: 'NOT_CERTIFIED', productionApproved: false, activeGateChanged: false };
  doc.reproHash = C.hash({ sources: doc.sources, snapshots: snaps.map(s => s.fileSha256), code: [__filename, path.join(__dirname, 'setup-lib.cjs')].map(f => C.shaFile(f)) });
  fs.writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
  console.log(JSON.stringify({ events: doc.events.total, recomputedEqualsPublished: doc.events.recomputedEqualsPublished, neff: neff.ALL, entry: neff.ENTRY, rho, binding: doc.gateCalendar.bindingTimeGate, gates: gates.map(g => [g.gate, g.earliest]) }));
}
if (require.main === module) main();
module.exports = { transitionType, eventsOf };
