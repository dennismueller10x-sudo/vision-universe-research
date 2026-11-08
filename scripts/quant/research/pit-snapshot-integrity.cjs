#!/usr/bin/env node
'use strict';
// Integritaetsbericht der PIT-Historien im Repository (P2.1) und Prognose je HISTORY-Gate (P2.2),
// Schema pit-snapshot-integrity-1.0.0. Nur lesen: keine Gate-Definition, keine Schwelle, kein Artefakt wird geaendert.
//
// Reihen (genau die, die der Zertifizierungs-Builder scripts/quant/build-backtest-certification.mjs zaehlt):
//   FACTOR_SNAPSHOTS     quant/data/product/factor-evidence-history/<neueste Methodikversion>/<Datum>.json.gz
//                        (Index index.json; contentHash = sha256(JSON ohne contentHash)[0..16], build-factor-evidence.mjs)
//   MEMBERSHIP_<INDEX>   quant/data/market/index-membership/history/<SP500|NDX|DJIA>/<Datum>.json (ohne contentHash;
//                        geprueft wird asOf gegen den Dateinamen). Die Gates zaehlen SP500.
//   SETUP_OBSERVATIONS   quant/data/product/setup-observation-history/setup-mapping-1.0.0/<Datum>.json.gz
//                        (contentHash = sha256(JSON ohne contentHash)[0..32], build-setup-outcomes.mjs#snapshotHash)
// Je Reihe: Index gegen Platte, contentHash, asOf gegen Dateiname, Hash-Kette ueber die entpackten Bytes, Monate,
// fehlende Monate, fehlende Handelstage (XNYS laut quant/config/market-calendar.json) bzw. Wochen, Luecken ueber
// maxGapDays. Zaehlung wie im Builder (quant/engines/profile-backtest.js#historyCoverage).
// Prognose: fruehestes Datum, an dem jedes HISTORY-Gate aus dem heutigen Takt erfuellbar waere. Schwellen aus
// quant/methodology/backtest-certification-v1.json (nur gelesen). Monatsgates: ein Stand je Folgemonat; Stichtagsgates:
// ein Stand je Handelstag (lueckenlos) und zum beobachteten Takt; Setup-Ergebnisgates: Ereignisdatum + 183 Tage
// (Formel des Builders fuer firstCompletedM6), Untergrenze, weil ein Ergebnis auch Kurse braucht.
//   node scripts/quant/research/pit-snapshot-integrity.cjs [--as-of JJJJ-MM-TT] [--out <datei>] [--alarm-detail <datei>] [--fail-on-missing-month]
// Ohne --out nach stdout. Exit 1, wenn eine Integritaetspruefung fehlschlaegt (Index, contentHash, asOf, Lesefehler);
// mit --fail-on-missing-month auch, wenn einer gezaehlten Reihe ein Kalendermonat fehlt (P2.3). --alarm-detail schreibt
// den Befund als Text fuer ALARM_DETAIL_FILE von scripts/ci/pipeline-alarm.mjs.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SCHEMA = 'pit-snapshot-integrity-1.0.0';
const M6_DAYS = 183; // build-backtest-certification.mjs: firstCompletedM6 = erstes Ereignis + 183 Tage
const DAY = 86400000;
const P = (...p) => path.join(ROOT, ...p);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const iso = t => new Date(t).toISOString().slice(0, 10);
const addDays = (d, n) => iso(Date.parse(d + 'T00:00:00Z') + n * DAY);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const monthOf = d => d.slice(0, 7);
function addMonths(ym, n) { const [y, m] = ym.split('-').map(Number), t = y * 12 + (m - 1) + n; return String(Math.floor(t / 12)).padStart(4, '0') + '-' + String(t % 12 + 1).padStart(2, '0'); }
function monthsBetween(a, b) { const out = []; for (let m = a; m <= b; m = addMonths(m, 1)) out.push(m); return out; }
const isDate = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && iso(Date.parse(x + 'T00:00:00Z')) === x;

/* ------------------------------------------------------------- Kalender */
function calendar(root = ROOT) {
  const c = JSON.parse(fs.readFileSync(path.join(root, 'quant/config/market-calendar.json'), 'utf8'));
  const x = c.exchanges.XNYS;
  return { id: c.calendarId, from: c.coverage.from, to: c.coverage.to, holidays: new Set([...(x.holidays || []), ...Object.keys(c.coverage.specialClosures || {})]), weekdays: x.weekdays || [1, 2, 3, 4, 5] };
}
function isTradingDay(cal, d) { const wd = new Date(d + 'T00:00:00Z').getUTCDay(); return cal.weekdays.includes(wd) && !cal.holidays.has(d); }
function tradingDays(cal, from, to) { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) if (isTradingDay(cal, d)) out.push(d); return out; }
/* n-ter Handelstag nach d (ausschliesslich d). */
function nthTradingDayAfter(cal, d, n) { let x = d, k = 0; while (k < n) { x = addDays(x, 1); if (isTradingDay(cal, x)) k++; } return x; }

/* --------------------------------------------------------------- Lesen */
function readSnapshot(file) {
  const raw = fs.readFileSync(file);
  const bytes = file.endsWith('.gz') ? zlib.gunzipSync(raw) : raw;
  return { bytes, doc: JSON.parse(bytes.toString('utf8')) };
}
const contentHashOf = (doc, len) => { const body = { ...doc }; delete body.contentHash; return sha(JSON.stringify(body)).slice(0, len); };
/* identisch zu quant/engines/profile-backtest.js#historyCoverage */
function coverage(dates, asOf) {
  const PB = require(P('quant/engines/profile-backtest.js'));
  return PB.historyCoverage(dates, asOf);
}

function seriesDefs(root = ROOT) {
  const factorIndex = JSON.parse(fs.readFileSync(path.join(root, 'quant/data/product/factor-evidence-history/index.json'), 'utf8'));
  const factorVersion = Object.keys(factorIndex.series).sort().pop();
  const setupIndex = JSON.parse(fs.readFileSync(path.join(root, 'quant/data/product/setup-observation-history/index.json'), 'utf8'));
  const defs = [
    { id: 'FACTOR_SNAPSHOTS', label: 'Faktor-Snapshots ' + factorVersion, dir: 'quant/data/product/factor-evidence-history/' + factorVersion, ext: '.json.gz', index: factorIndex.series[factorVersion], hashLen: 16, cadence: 'TRADING_DAY' },
    ...['SP500', 'NDX', 'DJIA'].map(ix => ({ id: 'MEMBERSHIP_' + ix, label: 'Index-Mitgliedschaft ' + ix, dir: 'quant/data/market/index-membership/history/' + ix, ext: '.json', index: null, hashLen: null, cadence: 'WEEKLY', informationOnly: ix !== 'SP500' })),
    { id: 'SETUP_OBSERVATIONS', label: 'Setup-Stichtage setup-mapping-1.0.0', dir: 'quant/data/product/setup-observation-history/setup-mapping-1.0.0', ext: '.json.gz', index: setupIndex.series['setup-mapping-1.0.0'], hashLen: 32, cadence: 'TRADING_DAY' }
  ];
  return { defs, factorVersion };
}

function inspectSeries(def, asOf, cal, root = ROOT) {
  const re = new RegExp('^\\d{4}-\\d{2}-\\d{2}' + def.ext.replace(/\./g, '\\.') + '$');
  const files = fs.existsSync(path.join(root, def.dir)) ? fs.readdirSync(path.join(root, def.dir)).filter(f => re.test(f)).sort() : [];
  const inWindow = files.filter(f => f.slice(0, 10) <= asOf);
  const dates = inWindow.map(f => f.slice(0, 10));
  const problems = [];
  let chain = '', verified = 0;
  for (const f of inWindow) {
    let s;
    try { s = readSnapshot(path.join(root, def.dir, f)); } catch (e) { problems.push({ date: f.slice(0, 10), code: 'UNREADABLE' }); continue; }
    if (s.doc.asOf !== f.slice(0, 10)) problems.push({ date: f.slice(0, 10), code: 'AS_OF_DIFFERS_FROM_FILE_NAME' });
    if (def.hashLen) { if (s.doc.contentHash !== contentHashOf(s.doc, def.hashLen)) problems.push({ date: f.slice(0, 10), code: 'CONTENT_HASH_MISMATCH' }); else verified++; }
    chain = sha(chain + '|' + f.slice(0, 10) + '|' + sha(s.bytes));
  }
  let indexCheck = null;
  if (def.index) {
    const idx = def.index.filter(d => d <= asOf).sort();
    const onlyIndex = idx.filter(d => !dates.includes(d)), onlyDisk = dates.filter(d => !idx.includes(d));
    indexCheck = { dates: idx.length, onlyInIndex: onlyIndex, onlyOnDisk: onlyDisk };
    for (const d of onlyIndex) problems.push({ date: d, code: 'IN_INDEX_NOT_ON_DISK' });
    for (const d of onlyDisk) problems.push({ date: d, code: 'ON_DISK_NOT_IN_INDEX' });
  }
  const cov = coverage(dates, asOf);
  const missingMonths = dates.length ? monthsBetween(monthOf(dates[0]), monthOf(asOf)).filter(m => !dates.some(d => monthOf(d) === m) && m !== monthOf(asOf)) : [];
  let missingSlots = null;
  if (dates.length && def.cadence === 'TRADING_DAY') {
    const td = tradingDays(cal, dates[0], dates.at(-1));
    missingSlots = { unit: 'XNYS_TRADING_DAY', expected: td.length, missing: td.filter(d => !dates.includes(d)), calendarCoverage: dates.at(-1) <= cal.to };
  } else if (dates.length && def.cadence === 'WEEKLY') {
    const gaps = dates.slice(1).map((d, i) => ({ from: dates[i], to: d, days: daysBetween(dates[i], d) })).filter(g => g.days > 7);
    missingSlots = { unit: 'WEEK', expected: null, missing: gaps.map(g => g.from + '..' + g.to + ' (' + g.days + ' Tage)'), calendarCoverage: true };
  }
  const tdSinceFirst = dates.length ? tradingDays(cal, dates[0], asOf).length : 0;
  return { id: def.id, label: def.label, dir: def.dir, informationOnly: !!def.informationOnly, cadence: def.cadence, snapshots: dates.length, earliest: cov.earliest, latest: cov.latest, months: cov.months,
    maxGapDays: cov.maxGapDays, medianGapDays: cov.medianGapDays, missingMonths, missingSlots, index: indexCheck,
    contentHash: def.hashLen ? { length: def.hashLen, verified, of: dates.length } : { length: null, verified: null, of: dates.length, note: 'Reihe fuehrt keinen contentHash; geprueft werden asOf und die Hash-Kette' },
    chainHash: chain || null, observedCadence: tdSinceFirst ? Math.round(dates.length / tdSinceFirst * 1000) / 1000 : null,
    integrity: problems.length ? 'FAIL' : 'PASS', problems };
}

/* ------------------------------------------------------------ Prognose */
function monthForecast(have, need, latest, asOf, rule = 'ein Stand in jedem Folgemonat') {
  if (have >= need) return { met: true, earliestMonth: null, rule };
  const start = latest && monthOf(latest) === monthOf(asOf) ? addMonths(monthOf(asOf), 1) : monthOf(asOf);
  return { met: false, remaining: need - have, earliestMonth: addMonths(start, need - have - 1), rule };
}
function setupEvents(asOf, root = ROOT) {
  const f = path.join(root, 'quant/data/product/setup-outcomes-v1.json');
  if (!fs.existsSync(f)) return null;
  const o = JSON.parse(fs.readFileSync(f, 'utf8'));
  return (o.events || []).filter(e => e[2] <= asOf).map(e => ({ ticker: e[0], type: e[1], date: e[2] }));
}

function forecast(series, req, asOf, cal, root = ROOT) {
  const factor = series.find(s => s.id === 'FACTOR_SNAPSHOTS'), member = series.find(s => s.id === 'MEMBERSHIP_SP500'), setup = series.find(s => s.id === 'SETUP_OBSERVATIONS');
  const sreq = req.STRATEGY_BACKTEST.requirements, freq = req.FACTOR_RANKING_BACKTEST.requirements, ureq = req.SETUP_BACKTEST.requirements;
  const gate = (kind, id, have, need, unit, f) => ({ kind, gate: id, have, required: need, unit, met: have >= need, ...f });
  const gap = (s, max) => ({ maxGapDays: s.maxGapDays, allowed: max, met: (s.maxGapDays ?? 0) <= max });
  const out = [];
  out.push(gate('STRATEGY_BACKTEST', 'membershipHistory', member.months, sreq.membershipSnapshotsMonthly, 'MONTHS', monthForecast(member.months, sreq.membershipSnapshotsMonthly, member.latest, asOf)));
  out.push(gate('STRATEGY_BACKTEST', 'factorHistory', factor.months, sreq.factorSnapshotsMonthly, 'MONTHS', monthForecast(factor.months, sreq.factorSnapshotsMonthly, factor.latest, asOf)));
  out.push({ kind: 'STRATEGY_BACKTEST', gate: 'continuity', unit: 'DAYS', have: Math.max(member.maxGapDays || 0, factor.maxGapDays || 0), required: sreq.maxGapDays, met: gap(member, sreq.maxGapDays).met && gap(factor, sreq.maxGapDays).met, earliestMonth: null, rule: 'größte Lücke höchstens ' + sreq.maxGapDays + ' Tage' });
  out.push(gate('FACTOR_RANKING_BACKTEST', 'factorHistory', factor.months, freq.factorSnapshotsMonthly, 'MONTHS', monthForecast(factor.months, freq.factorSnapshotsMonthly, factor.latest, asOf)));
  const fwdNeed = freq.completedForwardMonths + 3; // Builder: max(0, months - 3) >= completedForwardMonths
  out.push(gate('FACTOR_RANKING_BACKTEST', 'completedForward', Math.max(0, factor.months - 3), freq.completedForwardMonths, 'MONTHS', monthForecast(factor.months, fwdNeed, factor.latest, asOf, 'Faktormonate minus 3 ≥ ' + freq.completedForwardMonths + ', ein Stand in jedem Folgemonat')));
  out.push(gate('FACTOR_RANKING_BACKTEST', 'membershipHistory', member.months, freq.factorSnapshotsMonthly, 'MONTHS', monthForecast(member.months, freq.factorSnapshotsMonthly, member.latest, asOf)));
  // Setup: Stichtage, Spanne, Ergebnisse
  const remainingDates = Math.max(0, ureq.historyDates - setup.snapshots);
  const full = remainingDates ? nthTradingDayAfter(cal, asOf, remainingDates) : null;
  const observed = remainingDates && setup.observedCadence ? nthTradingDayAfter(cal, asOf, Math.ceil(remainingDates / setup.observedCadence)) : null;
  out.push({ kind: 'SETUP_BACKTEST', gate: 'historyDates', unit: 'DATES', have: setup.snapshots, required: ureq.historyDates, met: !remainingDates, remaining: remainingDates,
    earliestDate: full, observedCadenceDate: observed, calendarCoverage: !full || full <= cal.to, rule: 'ein Stichtag je XNYS-Handelstag ab dem Stichtag; zweites Datum zum beobachteten Takt (' + String(setup.observedCadence).replace('.', ',') + ' Stände je Handelstag)' });
  const span = setup.earliest ? daysBetween(setup.earliest, setup.latest) : 0;
  out.push({ kind: 'SETUP_BACKTEST', gate: 'historySpan', unit: 'DAYS', have: span, required: ureq.historySpanDays, met: span >= ureq.historySpanDays,
    earliestDate: span >= ureq.historySpanDays ? null : addDays(setup.earliest || nthTradingDayAfter(cal, asOf, 1), ureq.historySpanDays), rule: 'erster Stichtag + ' + ureq.historySpanDays + ' Tage, solange die Reihe weiterläuft' });
  const ev = setupEvents(asOf, root);
  if (ev) {
    const types = ['SETUP_CONFIRMED', 'SETUP_NEW'];
    const byType = Object.fromEntries(types.map(t => [t, ev.filter(e => e.type === t).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)]));
    const nth = (t, n) => byType[t].length >= n ? addDays(byType[t][n - 1].date, M6_DAYS) : null;
    const minDate = list => list.filter(Boolean).sort()[0] || null;
    const outcomesDate = minDate(types.map(t => nth(t, ureq.completedOutcomesM6)));
    out.push({ kind: 'SETUP_BACKTEST', gate: 'completedOutcomes', unit: 'OUTCOMES_M6', have: null, required: ureq.completedOutcomesM6, met: false,
      eventsToDate: Object.fromEntries(types.map(t => [t, byType[t].length])), earliestDate: outcomesDate, lowerBound: true,
      rule: 'Datum des ' + ureq.completedOutcomesM6 + '. Ereignisses einer Art + ' + M6_DAYS + ' Tage (Untergrenze: ein Ergebnis braucht auch Kurse)' });
    const titlesDate = minDate(types.filter(t => new Set(byType[t].map(e => e.ticker)).size >= ureq.titles).map(t => nth(t, 1)));
    out.push({ kind: 'SETUP_BACKTEST', gate: 'titles', unit: 'TITLES', have: null, required: ureq.titles, met: false,
      titlesToDate: Object.fromEntries(types.map(t => [t, new Set(byType[t].map(e => e.ticker)).size])), earliestDate: titlesDate, lowerBound: true,
      rule: 'erstes abgeschlossenes 6-Monats-Ergebnis einer Art mit mindestens ' + ureq.titles + ' Titeln (Builder zählt dann alle Titel der Art)' });
    const evMonths = [...new Set(ev.map(e => monthOf(e.date)))].sort();
    out.push(gate('SETUP_BACKTEST', 'independence', evMonths.length, ureq.eventCalendarMonths ?? ureq.independentWeeks, 'EVENT_MONTHS', monthForecast(evMonths.length, ureq.eventCalendarMonths ?? ureq.independentWeeks, evMonths.length ? evMonths.at(-1) + '-01' : null, asOf, 'Ereignisse in jedem Folgemonat (der Builder zählt Monate mit Ereignissen)')));
    const firstM6 = minDate(types.map(t => nth(t, 1)));
    out.push({ kind: 'SETUP_BACKTEST', gate: 'entryVariant', unit: null, have: null, required: null, met: false, earliestDate: firstM6, lowerBound: true, rule: 'erst mit abgeschlossenen Ergebnissen messbar; ob es besteht, ist offen' });
    out.push({ kind: 'SETUP_BACKTEST', gate: 'oos', unit: null, have: null, required: ureq.oosMinPerSegment, met: false, earliestDate: null, rule: 'nicht aus Stichtagen prognostizierbar: Segmentierung A1–A6 entschieden 04.11.2026 (Schnitt 2027-05-31, Embargo 183 Tage); je Ereignisart ' + ureq.oosMinPerSegment + ' effektive Ereignistage je Segment, laut Vorlage frühestens um 2028-01-08' });
  }
  return out;
}

function kindEarliest(gates) {
  const kinds = [...new Set(gates.map(g => g.kind))];
  return kinds.map(k => {
    const open = gates.filter(g => g.kind === k && !g.met);
    const dates = open.map(g => g.earliestDate || (g.earliestMonth ? g.earliestMonth + '-01' : null));
    const unknown = open.filter((g, i) => !dates[i]).map(g => g.gate);
    const known = dates.filter(Boolean).sort();
    return { kind: k, openHistoryGates: open.map(g => g.gate), earliestAllHistoryGates: unknown.length ? null : known.at(-1) || null, latestKnownBound: known.at(-1) || null, notForecastable: unknown };
  });
}

function report({ asOf = iso(Date.now()), root = ROOT } = {}) {
  if (!isDate(asOf)) throw Error('AS_OF_INVALID');
  const cal = calendar(root);
  const { defs, factorVersion } = seriesDefs(root);
  const series = defs.map(d => inspectSeries(d, asOf, cal, root));
  const req = JSON.parse(fs.readFileSync(path.join(root, 'quant/methodology/backtest-certification-v1.json'), 'utf8')).kinds;
  const gates = forecast(series, req, asOf, cal, root);
  return { schemaVersion: SCHEMA, asOf, calendar: { id: cal.id, coverage: { from: cal.from, to: cal.to } }, factorVersion,
    integrity: series.some(s => s.integrity !== 'PASS') ? 'FAIL' : 'PASS', series, gates, kinds: kindEarliest(gates),
    note: 'Nur gelesen. Schwellen aus quant/methodology/backtest-certification-v1.json; Zählung wie scripts/quant/build-backtest-certification.mjs. Prognosen sind früheste Daten bei unveraendertem Takt, keine Zusage.' };
}

/* P2.3 (FV-8): Befund fuer den bestehenden Pipeline-Alarm (scripts/ci/pipeline-alarm.mjs, ALARM_DETAIL_FILE). Rot ist
   ein Integritaetsfehler oder ein fehlender Kalendermonat in einer Reihe, die ein Gate zaehlt (nicht NDX/DJIA). Der
   laufende Monat zaehlt nie als fehlend. Die Anbindung im Workflow ist die offene Freigabe; hier nur Text und Exit-Code. */
function alarmFindings(rep) {
  const out = [];
  for (const s of rep.series) {
    if (s.integrity !== 'PASS') out.push(s.id + ': Integritaet ' + s.integrity + ' (' + s.problems.slice(0, 5).map(p => p.date + ' ' + p.code).join(', ') + ')');
    if (!s.informationOnly && s.missingMonths.length) out.push(s.id + ': fehlende Monate ' + s.missingMonths.join(', ') + ' – die Monatsgates verschieben sich je Monat um einen Monat');
  }
  return out;
}
function alarmText(rep) {
  const f = alarmFindings(rep);
  return ['PIT-Historien (pit-snapshot-integrity, Stichtag ' + rep.asOf + '): ' + (f.length ? 'ROT' : 'GRUEN'), ...f.map(x => '- ' + x),
    ...rep.kinds.map(k => '- ' + k.kind + ': offene Zeitgates ' + (k.openHistoryGates.join(', ') || 'keine') + (k.earliestAllHistoryGates ? ', fruehestens ' + k.earliestAllHistoryGates.slice(0, 7) : ''))].join('\n') + '\n';
}

function main(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--fail-on-missing-month') { o.failOnMissingMonth = true; continue; }
    if ((argv[i] === '--as-of' || argv[i] === '--out' || argv[i] === '--alarm-detail') && argv[i + 1] && o[argv[i].slice(2)] === undefined) o[argv[i].slice(2)] = argv[++i];
    else throw Error('INVALID_ARGUMENTS:' + argv[i]);
  }
  const rep = report({ asOf: o['as-of'] || undefined });
  const text = JSON.stringify(rep, null, 1) + '\n';
  if (o.out) fs.writeFileSync(o.out, text); else process.stdout.write(text);
  if (o['alarm-detail']) fs.writeFileSync(o['alarm-detail'], alarmText(rep));
  if (rep.integrity !== 'PASS') return 1;
  return o.failOnMissingMonth && alarmFindings(rep).length ? 1 : 0;
}
if (require.main === module) { try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error('ABBRUCH: ' + e.message); process.exitCode = 2; } }
module.exports = { SCHEMA, report, alarmFindings, alarmText, calendar, tradingDays, nthTradingDayAfter, addMonths, monthForecast, contentHashOf, inspectSeries };
