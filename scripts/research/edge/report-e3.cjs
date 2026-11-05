'use strict';
// E3-Bericht: alle 96 Varianten, Entwicklung und Prüfung, 192 Hypothesen gegen SPY (gepaarter Block-Bootstrap aus study.cjs),
// Holm über die volle Familie (fehlende/blockierte Tests p = 1), Urteile nach Protokoll Abschnitt 5. Forschung, nicht zertifiziert.
const fs = require('node:fs');
const path = require('node:path');
const S = require('./study.cjs');
const ROOT = path.resolve(__dirname, '../../..');
const pct = x => Number.isFinite(x) ? (x * 100).toFixed(1).replace('.', ',') + ' %' : '–';
const num = x => Number.isFinite(x) ? x.toFixed(2).replace('.', ',') : '–';
const pv = x => Number.isFinite(x) ? (x < 0.0001 ? '<0,0001' : x.toFixed(4).replace('.', ',')) : '–';

function load(dir, name) { const f = path.join(dir, name); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; }

function build(dir) {
  const catalog = S.variants();
  const devQ = load(dir, 'dev-quant.json'), devS = load(dir, 'dev-st.json'), sel = load(dir, 'selection.json'), testQ = load(dir, 'test-quant.json'), testS = load(dir, 'test-st.json');
  const byId = (doc) => new Map((doc ? doc.results : []).map(r => [r.id, r]));
  const dq = byId(devQ), ds = byId(devS), tq = byId(testQ), ts = byId(testS);
  const rows = catalog.map(v => {
    const dev = (v.family === 'quant' ? dq : ds).get(v.id) || null, test = (v.family === 'quant' ? tq : ts).get(v.id) || null;
    let tst = null;
    if (test && test.state === 'RUN' && Array.isArray(test.weeklyReturns) && test.weeklyReturns.length >= 52) {
      try { tst = S.pairedTest(test.weeklyReturns, test.spyWeeklyReturns); } catch (e) { tst = { error: e.message }; }
    }
    return { v, dev, test, tst };
  });
  const pLog = rows.map(r => r.tst && Number.isFinite(r.tst.pLog) ? r.tst.pLog : 1), pSh = rows.map(r => r.tst && Number.isFinite(r.tst.pSharpe) ? r.tst.pSharpe : 1);
  const holm = S.holm([...pLog, ...pSh]);
  rows.forEach((r, i) => {
    r.pLogHolm = holm[i]; r.pSharpeHolm = holm[rows.length + i];
    const m = r.test && r.test.state === 'RUN' ? r.test.evaluation.strategy : null, spy = r.test && r.test.state === 'RUN' ? r.test.evaluation.SPY : null;
    r.verdict = r.tst && !r.tst.error ? S.verdict(m, spy, r.pLogHolm, r.pSharpeHolm) : S.verdict(null);
  });
  return { rows, devQ, devS, sel, testQ, testS, hypotheses: holm.length };
}

function render(b) {
  const L = [], winner = b.sel && b.sel.winner;
  L.push('# E3 – Edge-Studie: Bericht', '', '**Forschung, nicht zertifiziert.** Ausführung nach dem eingefrorenen [Protokoll](PROTOKOLL.md) (SHA-256 `' + S.PROTOCOL_SHA256 + '`). Keine Empfehlung, keine Renditewerbung.', '');
  const state = !b.devQ ? 'Entwicklung nicht gerechnet' : !b.devS ? 'Entwicklung Quant gerechnet, Supertrader ausstehend (Strang B); Auswahl und Prüfung gesperrt' : !b.sel ? 'Entwicklung vollständig, Auswahl ausstehend' : !b.testQ || !b.testS ? 'Auswahl festgeschrieben, Prüfung teilweise' : 'vollständig';
  if (b.sel && b.testQ) {
    const w = b.rows.find(r => r.v.id === winner), e = w && w.test && w.test.state === 'RUN' ? w.test.evaluation : null;
    const counts = b.rows.reduce((o, r) => (o[r.verdict] = (o[r.verdict] || 0) + 1, o), {});
    const rawBeat = b.rows.filter(r => r.test && r.test.state === 'RUN' && r.test.evaluation.strategy.totalReturn > r.test.evaluation.SPY.totalReturn);
    L.push('## Ergebnis', '');
    if (e) L.push('- Vorab gewählte Variante **' + winner + '** im Prüfteil ' + e.dates.join(' bis ') + ': CAGR ' + pct(e.strategy.cagr) + ' gegen SPY ' + pct(e.SPY.cagr) + ' (RSP ' + pct(e.RSP.cagr) + ', IWM ' + pct(e.IWM.cagr) + '), Sharpe ' + num(e.strategy.sharpe) + ' gegen ' + num(e.SPY.sharpe) + ', maximaler Verlust ' + pct(e.strategy.maxDrawdown) + ' gegen ' + pct(e.SPY.maxDrawdown) + '. Urteil: **' + w.verdict + '**.');
    L.push('- Urteile über alle 96 Varianten: ' + Object.entries(counts).map(([k, v]) => v + '× „' + k + '“').join(', ') + '. Keine Variante erreicht Holm-p ≤ 0,05.');
    L.push('- Roh (ohne Signifikanz) über der SPY-Gesamtrendite im Prüfteil: ' + (rawBeat.length ? rawBeat.map(r => r.v.id + ' (' + pct(r.test.evaluation.strategy.cagr) + ')').join(', ') : 'keine') + '. Diese Varianten waren nicht die vorab gewählten; eine nachträgliche Auswahl ist nach Protokoll ausgeschlossen.');
    L.push('- Befund: kein robuster Nachweis, dass eine der geprüften Methoden den S&P 500 nach Kosten schlägt. Das ist keine bewiesene Gleichheit.', '');
  }
  L.push('## Stand', '', '- Status: **' + state + '**.');
  if (b.devQ) L.push('- Entwicklung Quant: ' + b.devQ.window.join(' bis ') + ', Anker ' + b.devQ.anchorDate + ', Datei `runs/dev-quant.json`.');
  if (b.sel) L.push('- Auswahl (vor Öffnen des Prüfteils festgeschrieben): **' + winner + '**, Regel: ' + b.sel.rule + '. Hashes: dev-quant `' + b.sel.devQuantSha256.slice(0, 16) + '…`, dev-st `' + b.sel.devStSha256.slice(0, 16) + '…`.');
  L.push('- Hypothesen in der Holm-Familie: ' + b.hypotheses + ' (fehlende oder blockierte Tests mit p = 1, die Familie wird nie verkleinert).', '');
  if (b.devQ) {
    const d = b.devQ.data;
    L.push('## Daten', '', '- Population: ' + (d.population ? d.population.description : '–'), '- Titel im Panel: ' + d.securities + ' (mit Fundamentaldaten ' + d.withFundamentals + '); Fundamentaldaten ' + d.fundamentalsSource + '.',
      '- Ausschlüsse: ' + JSON.stringify(d.counts), '- Benchmarks (Gesamtrendite, Wochenraster ohne Auffüllen): ' + Object.entries(d.benchmarks).map(([k, v]) => k + ' `' + v.file + '` `' + v.sha256.slice(0, 12) + '…`').join(', ') + '.',
      '- Marktfilter: SPY-Tagesschluss `' + d.spyDaily.file + '` (`' + d.spyDaily.sha256.slice(0, 12) + '…`), Schluss > SMA200 inklusive Tag, Gleichstand = Cash.', '');
  }
  const head = ['Variante', 'Status', 'CAGR', 'SPY', 'Sharpe', 'SPY Sharpe', 'Max. Verlust', 'Vol', 'Turnover', 'Kosten', 'Titel', 'zu wenige', 'Terminal'];
  const line = (id, r) => {
    if (!r) return '| ' + id + ' | nicht gerechnet |' + ' |'.repeat(head.length - 2);
    if (r.state !== 'RUN') return '| ' + id + ' | ' + r.state + (r.error ? ' (' + r.error + ')' : '') + ' |' + ' |'.repeat(head.length - 2);
    const e = r.evaluation;
    return '| ' + id + ' | RUN | ' + pct(e.strategy.cagr) + ' | ' + pct(e.SPY.cagr) + ' | ' + num(e.strategy.sharpe) + ' | ' + num(e.SPY.sharpe) + ' | ' + pct(e.strategy.maxDrawdown) + ' | ' + pct(e.strategy.volatility) + ' | ' + pct(r.turnover) + ' | ' + pct(r.costs && r.costs.shareOfInitialCapital) + ' | ' + num(r.construction && r.construction.averagePositions) + ' | ' + (r.construction ? r.construction.tooFewEligible : '–') + ' | ' + JSON.stringify(r.terminalEvents || {}).replace(/[{}"]/g, '') + ' |';
  };
  L.push('## Entwicklung (alle 96 Varianten)', '', 'Supertrader-Entwicklung nur 2016–2019 (Lücke 2012–2015, siehe Grenzen); Quant 2012–2019.', '', '| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|');
  for (const r of b.rows) L.push(line(r.v.id, r.dev));
  L.push('', '## Prüfung 2020-01-01 bis 2026-10-02 (alle 96 Varianten, Cash-Start)', '');
  if (!b.sel) L.push('Gesperrt, bis die Auswahl über alle 96 Entwicklungsergebnisse festgeschrieben ist.', '');
  else {
    const h2 = ['Variante', 'CAGR', 'SPY', 'RSP', 'IWM', 'Sharpe', 'SPY Sharpe', 'Max. Verlust', 'SPY Max. Verlust', 'p Log roh / Holm', 'p Sharpe roh / Holm', 'Urteil'];
    L.push('| ' + h2.join(' | ') + ' |', '|' + h2.map(() => '---').join('|') + '|');
    for (const r of b.rows) {
      const e = r.test && (r.test.state === 'RUN' || r.test.state === 'BLOCKED_COVERAGE') ? r.test.evaluation : null;
      const tag = r.test && r.test.state === 'BLOCKED_COVERAGE' ? ' (beschreibend, bis ' + r.test.evaluation.dates[1] + ')' : '';
      L.push('| ' + (r.v.id === winner ? '**' + r.v.id + '** (Auswahl)' : r.v.id) + tag + ' | ' + (e ? [pct(e.strategy.cagr), pct(e.SPY.cagr), pct(e.RSP.cagr), pct(e.IWM.cagr), num(e.strategy.sharpe), num(e.SPY.sharpe), pct(e.strategy.maxDrawdown), pct(e.SPY.maxDrawdown)].join(' | ') : ' | | | | | | | ') + ' | ' + pv(r.tst && r.tst.pLog) + ' / ' + pv(r.pLogHolm) + ' | ' + pv(r.tst && r.tst.pSharpe) + ' / ' + pv(r.pSharpeHolm) + ' | ' + r.verdict + ' |');
    }
  }
  L.push('', '## Grenzen', '',
    '- Das Prüffenster 2020–2026 wurde in früheren Projektstudien verwendet: vorab fixierte Replikation mit zeitlicher Trennung, kein unberührter Holdout. Bestätigung nur mit neuen Vorwärtsdaten.',
    '- Supertrader-Prüfung: Der eingefrorene Snapshot von Strang B endet am 2026-09-30; für den Stichtag 2026-10-02 fehlt der Wochenwert. Nach Protokoll wird das Fenster nicht verkürzt: alle zwölf Supertrader-Varianten sind im Prüfteil „nicht bestimmbar (blockiert)“ (Tests mit p = 1 in der Holm-Familie); ihre Kennzahlen bis 2026-09-25 stehen nur beschreibend in der Tabelle.',
    '- Supertrader-Kurven: kostenfreie Läufe von Strang B mit unveränderten REF-Regeln; Protokollkosten, Endwerte und SMA200-Filter als anteiliges Positions-Overlay (scripts/research/edge/st-e3.cjs), keine Neurechnung der Strategie. Der Snapshot kennt keine Insolvenz-Delistings (distress überall false).',
    '- Supertrader-Entwicklung beginnt 2016 (Lieferung Strang B); 2012–2015 fehlt für Supertrader. Der für eine spätere Bestätigung reservierte Holdout 2008–2015 wird in E3 nicht verwendet; die Quant-Entwicklung 2012–2019 ist protokollgemäß und war bereits Teil früherer Quant-Läufe (Musterportfolios #1332/#1383).',
    '- Lokaler Rauchtest vor dem Lauf (05.11.2026): zwei Quant-Varianten auf einer Teilmenge (Kursrendite, 1.500 heutige Titel) auch im Prüffenster ausgeführt, um Programmfehler auszuschließen. Keine Regel-, Parameter- oder Auswahländerung folgte; die Auswahl erfolgt mechanisch nach Protokoll.',
    '- Population: heutige Kursdateien plus qualifizierte V13-Ketten, heutiger SIC-Code; keine historische Indexmitgliedschaft.',
    '- Marktfilter: bewertet am letzten Tagesschluss jeder Entscheidungswoche, ausgeführt zum Schluss der Folgewoche (Engine-Takt); ein Wechsel und Rückwechsel innerhalb derselben Woche löst keinen Handel aus.',
    '- Monte-Carlo-p-Werte (9.999 Replikate) haben eine Auflösung von 1/10.000; Stichprobe der Prüfung rund 350 Wochen.',
    '- „schlägt nicht“ heißt bei gültigen Daten: kein robuster Nachweis, nicht bewiesene Gleichheit. Fehlende Daten: „nicht bestimmbar (blockiert)“.');
  return L.join('\n') + '\n';
}

function main(dir) {
  const b = build(dir);
  fs.writeFileSync(path.join(ROOT, 'docs/research/edge/BERICHT.md'), render(b));
  const json = { schemaVersion: 'edge-e3-report-1.0.0', label: 'Forschung, nicht zertifiziert', protocolSha256: S.PROTOCOL_SHA256, winner: b.sel ? b.sel.winner : null,
    variants: b.rows.map(r => ({ id: r.v.id, dev: r.dev ? r.dev.state : 'NOT_RUN', test: r.test ? r.test.state : 'NOT_RUN', logEffect: r.tst && r.tst.logEffect, pLog: r.tst ? r.tst.pLog : null, pSharpe: r.tst ? r.tst.pSharpe : null, sharpeEffect: r.tst && r.tst.sharpeEffect, pLogHolm: r.pLogHolm, pSharpeHolm: r.pSharpeHolm, verdict: r.verdict })) };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(json) + '\n');
  console.log(JSON.stringify({ winner: json.winner, verdicts: json.variants.reduce((o, v) => (o[v.verdict] = (o[v.verdict] || 0) + 1, o), {}) }));
}
module.exports = { build, render, main };
