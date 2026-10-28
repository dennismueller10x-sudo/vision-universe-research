#!/usr/bin/env node
'use strict';
// V10 SETUP Aufgabe 3: Entscheidungsvorlage Unabhaengigkeitsgate (NICHT aktiviert, keine Vertragsaenderung).
// Liest: Original-Bestandsaufnahme, Rekonstruktionsergebnis (beide in docs/quant-recovery/v10/setup/), setup-outcomes-v1.json.
// Rechnet die Projektion der effektiven Stichprobe der ORIGINALEN Beobachtungen (nur reife M6-Ergebnisse) unter dem
// vorregistrierten Modell und leitet daraus das frueheste Erfuellungsdatum je Gate-Variante ab. Schreibt nur --out.
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.resolve(__dirname, '../../../..');
const C = require(path.join(ROOT, 'quant/engines/research-contract.cjs'));
const L = require('./setup-lib.cjs');
const DOCS = 'docs/quant-recovery/v10/setup';
const INV = DOCS + '/setup-original-inventory-1.0.0.json', REC = DOCS + '/setup-reconstruction-result-1.0.0.json', OUTCOMES = 'quant/data/product/setup-outcomes-v1.json';
const H = 126, ENTRY = ['SETUP_NEW', 'SETUP_CONFIRMED'];
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

// Projektion: beobachtete Ereignis-Panels (je veroeffentlichtem Datum Titel+Anzahl) werden an jeder kuenftigen NYSE-Sitzung
// zyklisch fortgeschrieben. Untere Schranke: Titel wiederholen sich wie in den Panels (gleiche Titel alle 20 Sitzungen);
// obere Schranke: alle kuenftigen Ereignisse neue Titel. Reif = Einstieg + 126 Sitzungen <= Auswertungssitzung.
function projection(events, kind, rho, until) {
  const dates = [...new Set(events.map(e => e[2]))].sort();
  const panels = dates.map(d => { const m = new Map(); for (const e of events) if (e[2] === d && (kind === 'ENTRY' ? ENTRY.includes(e[1]) : e[1] === kind)) m.set(e[0], (m.get(e[0]) || 0) + 1); return m; });
  const same = panels.map(a => panels.map(b => { let s = 0; const [x, y] = a.size < b.size ? [a, b] : [b, a]; for (const [t, c] of x) s += c * (y.get(t) || 0); return s; }));
  const cnt = panels.map(p => [...p.values()].reduce((a, b) => a + b, 0));
  const axis = L.sessions(L.nextSession(dates[0]), until), idx = new Map(axis.map((d, i) => [d, i]));
  const pos = [];
  for (let k = 0; k < dates.length; k++) pos.push({ p: idx.get(L.nextSession(dates[k])), panel: k, observed: true });
  const lastObs = L.nextSession(dates.at(-1));
  for (let i = idx.get(lastObs) + 1, j = 0; i < axis.length; i++, j++) pos.push({ p: i, panel: j % dates.length, observed: false });
  const out = { lower: [], upper: [] };
  for (const mode of ['lower', 'upper']) {
    let total = 0, n = 0; const series = [];
    for (let a = 0; a < pos.length; a++) {
      const A = pos[a]; if (!cnt[A.panel]) { series.push(null); continue; }
      const sameAA = cnt[A.panel]; total += rho * (cnt[A.panel] ** 2 - sameAA) + sameAA; n += cnt[A.panel];
      for (let b = a - 1; b >= 0 && A.p - pos[b].p < H; b--) {
        const Bq = pos[b], ov = (H - (A.p - Bq.p)) / H;
        const s = mode === 'upper' && !(A.observed && Bq.observed) ? 0 : same[A.panel][Bq.panel];
        total += 2 * ov * (rho * (cnt[A.panel] * cnt[Bq.panel] - s) + s);
      }
      series.push({ entry: axis[A.p], maturity: axis[A.p + H] || null, n, nEff: n * n / total, observedEntry: A.observed });
    }
    out[mode] = series.filter(Boolean);
  }
  return { axisStart: axis[0], panels: dates.length, eventsPerPanelMean: cnt.reduce((a, b) => a + b, 0) / dates.length, ...out };
}
// Fruehestes Datum: M6-reife Ereignisse erreichen N_eff >= nMin UND disjunkte M6-Fenster >= k.
function earliest(proj, nMin, k, mode) {
  const s = proj[mode], first = s[0].entry, axis = L.sessions(first, '2032-12-31'), idx = new Map(axis.map((d, i) => [d, i]));
  for (const x of s) { if (!x.maturity) break; const blocks = Math.floor((idx.get(x.entry) - 0) / H) + 1; if (x.nEff >= nMin && blocks >= k) return { date: x.maturity, lastMaturedEntry: x.entry, nMatured: x.n, nEff: +x.nEff.toFixed(2), disjointM6Windows: blocks }; }
  return null;
}

function main() {
  const argv = process.argv.slice(2), out = argv[argv.indexOf('--out') + 1]; if (!argv.includes('--out') || !out) throw Error('--out REQUIRED');
  const inv = read(INV), rec = read(REC), events = read(OUTCOMES).events;
  const rhoDaily = inv.independence.rho.rhoSpyExcess, rhoWeekly = rec.independenceModel.rho.rhoSpyExcess, rhoStress = rec.independenceModel.rho.maxYearExcess;
  const RHO_FLOOR = 0.05; // aus der Rekonstruktion (Langfrist-Wochen-rho SPY-Ueberschuss 0.047, aufgerundet)
  const rhoGate = Math.max(rhoDaily, RHO_FLOOR);
  const cell = (k, x = 'M6_TIME') => rec.cells.find(c => c.eventKind === k && c.entryVariant === 'NEXT_WEEK_CLOSE' && c.exitVariant === x);
  const sd = Math.max(cell('SETUP_NEW').performance.sdBenchmarkExcess, cell('SETUP_CONFIRMED').performance.sdBenchmarkExcess);
  const halfWidth = n => 1.96 * sd / Math.sqrt(n);
  const nFor = d => Math.ceil((1.96 * sd / d) ** 2);
  const until = '2031-12-31';
  const projections = {};
  for (const kind of ['SETUP_NEW', 'SETUP_CONFIRMED']) for (const [label, rho] of [['gate', rhoGate], ['stress', rhoStress]]) projections[kind + '|' + label] = projection(events, kind, rho, until);
  const grid = [];
  for (const nMin of [30, 50, 100]) for (const k of [1, 2, 4]) for (const kind of ['SETUP_NEW', 'SETUP_CONFIRMED']) for (const label of ['gate', 'stress']) {
    const p = projections[kind + '|' + label];
    grid.push({ nMin, disjointM6Windows: k, eventKind: kind, rho: label === 'gate' ? rhoGate : rhoStress, rhoLabel: label,
      repeatedTitles: earliest(p, nMin, k, 'lower'), newTitles: earliest(p, nMin, k, 'upper'),
      note: 'repeatedTitles = Titel wiederholen sich wie in den beobachteten Panels (konservativ, spaeteres Datum); newTitles = alle kuenftigen Ereignisse neue Titel (optimistisch, frueheres Datum)' });
  }
  const range = g => g.newTitles && g.repeatedTitles ? g.newTitles.date + ' bis ' + g.repeatedTitles.date : 'nach 2031';  const pick = (nMin, k, kind, label = 'gate') => grid.find(g => g.nMin === nMin && g.disjointM6Windows === k && g.eventKind === kind && g.rhoLabel === label);
  const satAt = (kind, label) => { const p = projections[kind + '|' + label]; const s = p.lower.filter(x => x.observedEntry); return +s.at(-1).nEff.toFixed(2); };
  const months = inv.gateCalendar.gates.find(g => g.gate === 'independentWeeks');
  const others = inv.gateCalendar.gates.filter(g => ['historyDates', 'historySpanDays', 'completedOutcomesM6', 'titles'].includes(g.gate)).map(g => g.earliest).sort().at(-1);
  const recommended = { nMin: 50, k: 4 };
  const atMonthGate = (() => { const s = projections['SETUP_NEW|gate'].lower, axis = L.sessions(s[0].entry, until), idx = new Map(axis.map((d, i) => [d, i]));
    const x = s.filter(e => e.maturity && e.maturity <= months.earliest).at(-1); return { date: months.earliest, lastMaturedEntry: x.entry, nMatured: x.n, nEff: +x.nEff.toFixed(2), disjointM6Windows: Math.floor(idx.get(x.entry) / H) + 1 }; })();
  const recDates = ['SETUP_NEW', 'SETUP_CONFIRMED'].map(k => ({ eventKind: k, gate: pick(recommended.nMin, recommended.k, k), stress: pick(recommended.nMin, recommended.k, k, 'stress') }));
  const latest = (xs) => xs.filter(Boolean).sort().at(-1) || null;
  const doc = {
    schemaVersion: 'quant-v10-setup-independence-decision-1.0.0', status: 'DECISION_TEMPLATE_NOT_APPROVED_NOT_ACTIVATED', evidenceKind: 'SOURCE_EVIDENCE', decidedBy: null,
    ownerContext: 'Owner 28.10.2026: ISO-Wochen-Aenderung NICHT freigegeben; backtest-certification-1.0.0 bleibt unveraendert. Diese Vorlage aendert keinen Vertrag und kein Gate.',
    sources: Object.fromEntries([INV, REC, OUTCOMES, DOCS + '/setup-reconstruction-registration-1.0.0.json', 'docs/quant-recovery/v9/setup-independence-1.0.0.json', 'docs/quant-recovery/v9/setup-decision-recommendation-1.0.0.json', 'quant/methodology/backtest-certification-v1.json'].map(p => [p, C.shaFile(path.join(ROOT, p))])),
    question: 'Welches Unabhaengigkeitsgate macht die Setup-Zertifizierung fachlich eindeutig, und ab wann waere es mit ORIGINALEN Beobachtungen fruehestens erfuellbar?',
    measured: {
      original: { events: inv.events.total, entryEvents: inv.independence.byKind.ENTRY.n, eventDates: inv.events.eventDates, calendarMonths: inv.events.calendarMonths.length, isoWeeks: inv.events.isoWeeks,
        nEffSpyExcess: Object.fromEntries(['ALL', 'ENTRY', 'SETUP_NEW', 'SETUP_CONFIRMED'].map(k => [k, +inv.independence.byKind[k].nEffSpyExcess.toFixed(2)])),
        nEffRaw: Object.fromEntries(['ALL', 'ENTRY', 'SETUP_NEW', 'SETUP_CONFIRMED'].map(k => [k, +inv.independence.byKind[k].nEffRaw.toFixed(2)])),
        rho: { dailyTrailing126Raw: inv.independence.rho.rhoRaw, dailyTrailing126SpyExcess: rhoDaily, window: inv.independence.rho.window, titles: inv.independence.rho.titles },
        maturedM6: 0, disjointM6Windows: inv.overlap.disjointM6Windows, maxEntryEventsOnOneDate: inv.overlap.maxEntryEventsOnOneDate },
      reconstruction: { studyId: rec.studyId, registrationHash: rec.registrationHash, listings: rec.population.frameCount, period: rec.period.signals,
        rho: { weeklyLongRunRaw: rec.independenceModel.rho.rhoRaw, weeklyLongRunSpyExcess: rhoWeekly, maxYearSpyExcess: rhoStress, titles: rec.independenceModel.rho.titles },
        m6: Object.fromEntries(['SETUP_NEW', 'SETUP_CONFIRMED'].map(k => { const c = cell(k); return [k, { n: c.performance.n, titles: c.performance.titles, nEffModelSpyExcess: +c.independence.nEffModelSpyExcess.toFixed(1), nEffModelRaw: +c.independence.nEffModelRaw.toFixed(1),
          nEffBootstrap: +c.independence.nEffBootstrap.toFixed(1), nEffStressRho: +c.independence.nEffModelSpyExcessMaxYearRho.toFixed(1), disjointM6Windows: c.independence.disjointWindows, sdSpyExcess: +c.performance.sdBenchmarkExcess.toFixed(4),
          meanSpyExcess: +c.performance.meanBenchmarkExcess.toFixed(4), ci95Block: c.uncertainty.calendarBlock.ci95.map(x => +x.toFixed(4)), pHolm: c.multipleTesting.pHolm }]; })),
        modelVsBootstrap: 'Modell-N_eff (SPY-Ueberschuss) und bootstrap-implizites N_eff liegen in derselben Groessenordnung (siehe m6); das Modell ist dort eher vorsichtiger.' },
      saturation: { note: 'Fuer SPY-Ueberschuss saettigt N_eff je Ereignisdatum bei etwa 1/rho; mehr Titel am selben Tag helfen kaum. Wachstum kommt nur ueber Zeit (nicht ueberlappende M6-Fenster).',
        perDateCeilingGateRho: +(1 / rhoGate).toFixed(1), observedNEffAfter20DatesGateRho: { SETUP_NEW: satAt('SETUP_NEW', 'gate'), SETUP_CONFIRMED: satAt('SETUP_CONFIRMED', 'gate') } }
    },
    proposedGate: {
      fields: {
        eventCalendarMonths: { value: 20, meaning: 'verschiedene Kalendermonate mit mindestens einem Ereignis - genau das, was der Auswerter heute zaehlt (bisher irrefuehrend independentWeeks genannt)', role: 'AUDIT_FIELD_NOT_AN_INDEPENDENCE_PROOF' },
        m6SpyExcessEffectiveSampleSize: { minimum: recommended.nMin, counts: 'effektive Stichprobengroesse des mittleren M6-SPY-Ueberschusses der REIFEN Original-Ereignisse je Ereignisart (NEXT_CLOSE)',
          model: { id: 'setup-neff-overlap-1.0.0', formula: 'N_eff = n^2 / sum_ij rho_ij * overlap_ij / 126; overlap_ij = gemeinsame Sitzungen der M6-Fenster; rho_ij = 1 gleicher Titel, sonst rho',
            rho: 'max(mittlere paarweise Korrelation der taeglichen SPY-Ueberschuss-Log-Renditen ueber die letzten 126 Sitzungen aller Titel mit voller Abdeckung, 0.05)', rhoFloorSource: 'Rekonstruktion 2005-2025: Langfrist-Wochen-rho SPY-Ueberschuss ' + rhoWeekly.toFixed(4),
            reference: 'scripts/quant/v9/setup-independence.py, scripts/quant/v10/setup/setup-lib.cjs#nEff', preRegistered: true },
          rationale: `Mit der gemessenen Streuung des M6-SPY-Ueberschusses (sd ${sd.toFixed(3)}, Rekonstruktion) ergibt N_eff ${recommended.nMin} ein 95-%-Intervall von etwa +-${(100 * halfWidth(recommended.nMin)).toFixed(1)} Pp; N_eff 30 nur +-${(100 * halfWidth(30)).toFixed(1)} Pp. Fuer +-10 Pp braucht es ${nFor(0.10)}.` },
        disjointM6Windows: { minimum: recommended.k, counts: 'disjunkte 126-Sitzungen-Fenster der Einstiege reifer Ereignisse (greedy, frueheste zuerst)', rationale: 'Mindestens vier zeitlich getrennte M6-Ergebnisblocks (rund zwei Jahre Einstiege): eine einzelne Marktphase kann die Aussage nicht allein tragen. Die Rekonstruktion hat 42/37 disjunkte Fenster.' }
      },
      appliesTo: 'SETUP_BACKTEST, je zertifizierter Ereignisart; ersetzt die Unabhaengigkeitsdeutung von independentWeeks; alle anderen Gates unveraendert',
      reportingDuty: 'Jeder Zertifizierungslauf meldet N_eff roh und SPY-Ueberschuss, rho, disjunkte M6-Fenster; nie Unabhaengigkeit aus Ereigniszahlen ableiten.'
    },
    earliestFulfilment: {
      assumptions: ['Veroeffentlichung an jeder NYSE-Sitzung ab ' + L.nextSession(inv.asOfPublished) + ' (bisher 21 von ' + inv.snapshots.nyseSessionsInSpan + ' Sitzungen)', 'Ereignisdichte wie in den 20 beobachteten Ereignisdaten', 'rho unveraendert', 'alle Ereignisse bepreist; keine unbekannte Sonderschliessung', 'nichts rueckdatiert: reif = Einstieg + 126 Sitzungen'],
      recommendedGate: recDates, underUnchangedContract: { independentWeeksMonthCounter: months.earliest, otherTimeGatesLatest: others, oos: 'nie ohne Auswerter-Aenderung (konstant false)' },
      grid },
    options: {
      A: { title: 'Status quo: Vertrag 1.0.0 unveraendert (Monatszaehler 20 unter dem Namen independentWeeks)', earliestIndependenceGate: months.earliest,
        consequences: ['Das Gate misst Kalendermonate, keine Unabhaengigkeit; der Name bleibt irrefuehrend.', null,'Ohne Auswerter-Aenderung bleibt OOS konstant false: keine Zertifizierung zu irgendeinem Datum.'] },
      B: { title: 'Empfohlen: Vertrag 1.1.0 - independentWeeks in eventCalendarMonths umbenennen (Zaehlung unveraendert, nur Audit) und neues Unabhaengigkeitsgate m6SpyExcessEffectiveSampleSize >= ' + recommended.nMin + ' UND disjointM6Windows >= ' + recommended.k,
        earliestIndependenceGate: { SETUP_NEW: recDates[0].gate, SETUP_CONFIRMED: recDates[1].gate },
        consequences: ['Das Gate zaehlt, was es behauptet; der Schwellenwert ist aus gemessener Streuung und Abhaengigkeit begruendet.', 'Gegenueber A (' + months.earliest + ') verschiebt sich das Unabhaengigkeitsgate auf ' + range(pick(recommended.nMin, recommended.k, 'SETUP_NEW')) + ' (SETUP_NEW) bzw. ' + range(pick(recommended.nMin, recommended.k, 'SETUP_CONFIRMED')) + ' (SETUP_CONFIRMED); bindend ist N_eff, die Blockbedingung allein waere ' + range(pick(30, recommended.k, 'SETUP_NEW')) + ' erfuellt. Mit Stress-rho ' + rhoStress.toFixed(3) + ': ' + range(pick(recommended.nMin, recommended.k, 'SETUP_NEW', 'stress')) + '.', 'Auch mit erfuelltem Gate bleibt die Zertifizierung bis zur OOS-Implementierung, Gesamtrendite und Owner-Freigabe gesperrt.', 'Monatszaehler bleibt sichtbar, gated aber nicht mehr.', 'Erfordert Owner-Freigabe und einen eigenen PR (Vertrag + Auswerter, Vorher/Nachher).'] },
      C: { title: 'Rekonstruktion als Ersatz fuer die Unabhaengigkeit anerkennen (Replay 2005-2025 erfuellt N_eff und Bloecke bereits)', earliestIndependenceGate: 'sofort (Rekonstruktion N_eff ' + cell('SETUP_NEW').independence.nEffModelSpyExcess.toFixed(0) + ' / ' + cell('SETUP_CONFIRMED').independence.nEffModelSpyExcess.toFixed(0) + ')',
        consequences: ['Widerspricht setup-backtest-contract-1.0.0 (Replay ausdruecklich keine Ergebnisquelle) und dem Grundsatz, dass Rueckrechnungen vorwaerts gesammelte Historie nicht ersetzen.', 'Rekonstruktion: 120 heutige Ueberlebende, Wochenraster, Kursrendite, damals nicht veroeffentlicht.', 'Nicht empfohlen; hoechstens als zusaetzliche Plausibilitaetsevidenz.'] }
    },
    recommendation: { option: 'B', summary: `Gate "m6SpyExcessEffectiveSampleSize >= ${recommended.nMin}" plus "disjointM6Windows >= ${recommended.k}" unter dem Modell setup-neff-overlap-1.0.0; independentWeeks ehrlich in eventCalendarMonths umbenennen (nur Audit). Fruehestes Erfuellungsdatum mit Originalbeobachtungen: SETUP_NEW ${range(recDates[0].gate)}, SETUP_CONFIRMED ${range(recDates[1].gate)} (frueheres Datum: kuenftig nur neue Titel; spaeteres: Titel wiederholen sich wie beobachtet).`,
      separateDecisionNeeded: 'Der OOS-Auswerter ist konstant false und braucht eine eigene Segmentdefinition (oosMinPerSegment 30); unabhaengig von dieser Vorlage.' },
    activeGateChanged: false, productionApproved: false, certificationStatus: 'NOT_CERTIFIED'
  };
  doc.options.A.consequences[1] = 'Fruehestens ' + months.earliest + ' erfuellt; die effektive Stichprobe der dann reifen M6-Ergebnisse ist nicht gesteuert (Projektion: N_eff 30 erreicht SETUP_NEW ' + range(pick(30, 1, 'SETUP_NEW')) + ', N_eff 50 erst ' + range(pick(50, 1, 'SETUP_NEW')) + '); am Datum des Monatsgates liegen ' + atMonthGate.disjointM6Windows + ' disjunkte M6-Fenster und N_eff ' + atMonthGate.nEff + ' (SETUP_NEW, wiederholte Titel) vor.';
  doc.options.A.atMonthGateDate = atMonthGate;
  doc.reproHash = C.hash({ sources: doc.sources, code: [__filename, path.join(__dirname, 'setup-lib.cjs')].map(f => C.shaFile(f)) });
  fs.writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
  console.log(JSON.stringify({ rhoGate, rhoStress, sd, nFor10pp: nFor(0.1), rec: recDates, saturation: doc.measured.saturation, A: months.earliest, others }, null, 0));
  for (const g of grid) if (g.rhoLabel === 'gate') console.log(g.nMin, g.disjointM6Windows, g.eventKind, g.newTitles?.date, g.repeatedTitles?.date, g.newTitles?.nEff, g.repeatedTitles?.nEff);
}
if (require.main === module) main();
module.exports = { projection, earliest };
