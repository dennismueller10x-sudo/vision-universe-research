#!/usr/bin/env node
'use strict';
// FV-1: Lesarten des Setup-Gates `independence` (Schwelle independentWeeks: 20) und ihre Wirkung auf das frueheste
// Datum (setup-independence-readings-1.0.0). Nur lesen: keine Gate-Definition, keine Schwelle, kein Artefakt aendert sich.
//
//   A  Monate (heute aktiv): der Builder zaehlt verschiedene Kalendermonate mit Ereignissen
//      (scripts/quant/build-backtest-certification.mjs, `new Set(outcomes.events.map((e) => e[2].slice(0, 7))).size`)
//   B  ISO-Wochen (Wortlaut der Schwelle): verschiedene ISO-Kalenderwochen (ISO-Wochenjahr) mit Ereignissen
// Gezaehlt werden wie im Builder alle Ereignisse aus quant/data/product/setup-outcomes-v1.json (auch SETUP_WEAKENED) bis
// zum Stichtag. Prognose: Ereignisse in jeder Folgeeinheit (Monat bzw. Woche), wie pit-snapshot-integrity.cjs.
// Die uebrigen Setup-Zeitgates kommen unveraendert aus pit-snapshot-integrity.cjs#report.
//   node scripts/quant/research/setup-independence-readings.cjs [--as-of JJJJ-MM-TT] [--out <datei>]
const fs = require('node:fs');
const path = require('node:path');
const I = require('./pit-snapshot-integrity.cjs');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const VERSION = 'setup-independence-readings-1.0.0';
const DAY = 86400000;
const iso = t => new Date(t).toISOString().slice(0, 10);
const json = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

/** ISO-Woche: [Wochenjahr, Woche] und Montag der Woche. */
function isoWeek(d) {
  const t = new Date(d + 'T00:00:00Z'), wd = (t.getUTCDay() + 6) % 7; // Montag 0
  const thursday = new Date(t.getTime() + (3 - wd) * DAY), year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4)), week1Monday = jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * DAY;
  const week = 1 + Math.round((t.getTime() - wd * DAY - week1Monday) / (7 * DAY));
  return { key: year + '-W' + String(week).padStart(2, '0'), monday: iso(t.getTime() - wd * DAY) };
}

// Herkunft der Schwelle. Die Commit-Angaben stammen aus der Repository-Historie (Einfuehrung beider Teile im selben
// Commit); der Arbeitsklon ist flach, deshalb stehen sie hier fest und werden nicht zur Laufzeit gesucht.
const ORIGIN = Object.freeze({
  commit: '7cd1c3656a85b1fe720bb3de4a0e3d93e8627b26', date: '2026-10-01', title: 'Quant Backtest Certification',
  facts: [
    'quant/methodology/backtest-certification-v1.json fuehrt seitdem SETUP_BACKTEST.requirements.independentWeeks: 20 (keine spaetere Aenderung).',
    'scripts/quant/build-backtest-certification.mjs zaehlt im selben Commit `eventWeeks = new Set(outcomes.events.map((e) => e[2].slice(0, 7))).size`: Variablenname Wochen, Rechnung Monate, Gate-Label „verschiedene Monate mit Ereignissen“.',
    'docs/VU_QUANT_BACKTEST_CERTIFICATION.md (selber Commit) nennt fuer Setup „Stichtage ca. 10.03.2027, erste 6-Monats-Ergebnisse ca. 26.03.2027“ und kein Datum 2028: Die Monatszaehlung war in der damaligen Prognose nicht bindend.'
  ]
});
const PRIOR = Object.freeze([
  ['docs/quant-recovery/v6/methodology-proposal.json', 'Diskrepanz setupWeeksVsMonths festgestellt; Erzeuger bewusst unveraendert, um das strengere beobachtete Gate nicht abzuschwaechen'],
  ['docs/quant-recovery/v8/setup-decision-current.json', 'Vorschlag mit beiden Zaehlungen'],
  ['docs/quant-recovery/v9/setup-decision-recommendation-1.0.0.json', 'Empfehlung B: ISO-Wochen nach Wortlaut, Monate als Auditfeld; zusaetzlich wochengeclusterte Unsicherheit'],
  ['docs/quant-recovery/v10/setup/setup-independence-decision-1.0.0.json', 'Empfehlung B (V10): Feld ehrlich in eventCalendarMonths umbenennen (Zaehlung bleibt), neues Gate N_eff >= 50 und >= 4 disjunkte M6-Fenster; frueheste Erfuellung 2029']
]);

function readings({ asOf, root = ROOT } = {}) {
  const rep = I.report({ asOf, root });
  const need = JSON.parse(fs.readFileSync(path.join(root, 'quant/methodology/backtest-certification-v1.json'), 'utf8')).kinds.SETUP_BACKTEST.requirements.independentWeeks;
  const outcomes = JSON.parse(fs.readFileSync(path.join(root, 'quant/data/product/setup-outcomes-v1.json'), 'utf8'));
  const dates = (outcomes.events || []).map(e => e[2]).filter(d => d <= rep.asOf).sort();
  const months = [...new Set(dates.map(d => d.slice(0, 7)))].sort();
  const weeks = [...new Set(dates.map(d => isoWeek(d).key))].sort();
  const lastWeek = dates.length ? isoWeek(dates.at(-1)) : null, asOfWeek = isoWeek(rep.asOf);
  // B: naechste Woche nach dem Stichtag, wenn die Woche des Stichtags schon ein Ereignis hat, sonst die Stichtagswoche.
  const startMonday = lastWeek && lastWeek.key === asOfWeek.key ? iso(Date.parse(asOfWeek.monday) + 7 * DAY) : asOfWeek.monday;
  const weekEarliest = weeks.length >= need ? null : iso(Date.parse(startMonday) + (need - weeks.length - 1) * 7 * DAY);
  const gates = rep.gates.filter(g => g.kind === 'SETUP_BACKTEST');
  const dateOf = g => g.earliestDate || (g.earliestMonth ? g.earliestMonth + '-01' : null);
  const monthGate = gates.find(g => g.gate === 'independence');
  const others = gates.filter(g => g.gate !== 'independence' && !g.met);
  const knownOthers = others.map(dateOf).filter(Boolean).sort();
  const unknown = others.filter(g => !dateOf(g)).map(g => g.gate);
  const binding = (indep) => { const all = [...knownOthers, ...(indep ? [indep] : [])].sort(); return { latestKnownTimeGate: all.at(-1) || null, notForecastable: unknown }; };
  const a = binding(dateOf(monthGate)), b = binding(weekEarliest);
  const v10 = (() => { try { const d = JSON.parse(fs.readFileSync(path.join(root, PRIOR[3][0]), 'utf8')); return { status: d.status, option: d.recommendation && d.recommendation.option, summary: d.recommendation && d.recommendation.summary }; } catch (e) { return null; } })();
  return {
    schemaVersion: VERSION, asOf: rep.asOf, threshold: { name: 'independentWeeks', value: need, source: 'quant/methodology/backtest-certification-v1.json' },
    evaluator: { file: 'scripts/quant/build-backtest-certification.mjs', code: 'new Set(outcomes.events.map((e) => e[2].slice(0, 7))).size', label: 'verschiedene Monate mit Ereignissen', unit: 'CALENDAR_MONTH' },
    origin: ORIGIN, prior: PRIOR.map(([file, note]) => { let status = null; try { status = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')).status || null; } catch (e) { /* fehlt */ } return { file, status, note }; }),
    events: { count: dates.length, first: dates[0] || null, last: dates.at(-1) || null, distinctDates: new Set(dates).size },
    readingA: { id: 'A', label: 'Monate (aktiv)', unit: 'CALENDAR_MONTH', have: months.length, required: need, earliest: monthGate ? (monthGate.met ? null : monthGate.earliestMonth) : null, setupTimeGatesEarliest: a.latestKnownTimeGate, independenceBinds: !!(dateOf(monthGate) && a.latestKnownTimeGate === dateOf(monthGate)), notForecastable: a.notForecastable },
    readingB: { id: 'B', label: 'ISO-Wochen (Wortlaut)', unit: 'ISO_WEEK', have: weeks.length, required: need, earliest: weekEarliest, setupTimeGatesEarliest: b.latestKnownTimeGate, independenceBinds: !!(weekEarliest && b.latestKnownTimeGate === weekEarliest), notForecastable: b.notForecastable },
    otherSetupTimeGates: others.map(g => ({ gate: g.gate, earliest: dateOf(g), lowerBound: !!g.lowerBound })),
    v10Recommendation: v10,
    statistics: 'Keine der beiden Zaehlungen misst Unabhaengigkeit: Alle M6-Fenster ueberlappen; V10 mass eine effektive Fallzahl je Ereignisdatum von etwa 12,6 (docs/quant-recovery/v10/setup/README.md).',
    note: 'Nur gelesen. Fruehestes Datum bei Ereignissen in jeder Folgeeinheit; die Ergebnisgates sind Untergrenzen; oos ist ohne A1–A6 nicht prognostizierbar.'
  };
}

function main(argv = process.argv.slice(2)) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === '--as-of' || argv[i] === '--out') && argv[i + 1] && o[argv[i].slice(2)] === undefined) o[argv[i].slice(2)] = argv[++i];
    else throw Error('INVALID_ARGUMENTS:' + argv[i]);
  }
  const text = JSON.stringify(readings({ asOf: o['as-of'] }), null, 1) + '\n';
  if (o.out) fs.writeFileSync(o.out, text); else process.stdout.write(text);
  return 0;
}
if (require.main === module) { try { process.exitCode = main(); } catch (e) { console.error('ABBRUCH: ' + e.message); process.exitCode = 2; } }
module.exports = { VERSION, ORIGIN, PRIOR, isoWeek, readings, main };
