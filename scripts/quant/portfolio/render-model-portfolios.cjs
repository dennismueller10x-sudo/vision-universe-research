#!/usr/bin/env node
'use strict';
// Bericht (Markdown) aus model-portfolios.json. Nur Darstellung, keine Rechnung.
//   node scripts/quant/portfolio/render-model-portfolios.cjs --in FILE --out FILE.md
const fs = require('node:fs');
const a = process.argv, get = k => { const i = a.indexOf(k); return i > 0 ? a[i + 1] : null; };
const doc = JSON.parse(fs.readFileSync(get('--in'), 'utf8'));
const pct = x => x === null || x === undefined || !Number.isFinite(x) ? '–' : (x * 100).toFixed(1).replace('.', ',') + ' %';
const num = x => x === null || x === undefined || !Number.isFinite(x) ? '–' : x.toFixed(2).replace('.', ',');
const NAMES = { 'quality-compounder': 'Quality Compounder', 'momentum-leader': 'Momentum Leader', garp: 'GARP', 'defensive-quality': 'Defensive Quality', 'value-momentum': 'Value Momentum', 'quality-momentum': 'Quality Momentum', 'future-leader': 'Future Leader' };
const L = [];
L.push('# Musterportfolios nach dem VU-Portfolio-Standard (Forschung, nicht zertifiziert)', '');
L.push('> Erzeugt von `scripts/quant/portfolio/render-model-portfolios.cjs` aus `model-portfolios.json` (' + doc.schemaVersion + '). Nicht von Hand ändern.', '');
L.push('**Forschung, nicht zertifiziert.** Historische Rekonstruktion, keine Empfehlung, keine Renditezusage. Interne Vorschau; eine öffentliche Darstellung braucht die Owner-Freigabe (öffentliche Renditeaussage) und die Abstimmung mit der Rechtsberatung.', '');
L.push('## Datenbasis', '');
L.push('| Größe | Wert |', '|---|---|');
L.push('| Zeitraum angefragt | ' + (doc.requestedWindow || doc.window).join(' bis ') + ' |');
L.push('| Zeitraum realisiert | ' + (doc.realizedWindow ? doc.realizedWindow.join(' bis ') : '–') + (doc.windowAlarm ? ' (**verkürzt:** Benchmark endet ' + doc.windowAlarm.benchmarkLastDate + ', ' + doc.windowAlarm.missingWeeks + ' Wochen fehlen)' : '') + ' |');
if (doc.population) L.push('| Population | ' + doc.population.description + ' |');
L.push('| Rendite-Basis | ' + doc.data.basis + ' |', '| Benchmark | ' + doc.data.benchmark + ' |', '| Kurse | ' + doc.data.priceSource + ' |', '| delistete Titel | ' + doc.data.delistedSource + ' |');
L.push('| Fundamentaldaten | ' + doc.data.fundamentalsSource + ' |', '| Titel im Panel | ' + doc.data.securities + ' (mit Fundamentaldaten ' + doc.data.withFundamentals + ') |');
L.push('| Gewichtung | ' + doc.weighting + ' (Risikoparität auf Ledoit/Wolf-geschrumpfter Kovarianz, 104 Wochen) |');
L.push('| Standard | ' + doc.standard.minPositions + '–' + doc.standard.maxPositions + ' Titel (Ziel ' + doc.standard.targetPositions + '), max. ' + pct(doc.standard.maxPositionWeight) + ' je Titel, max. ' + pct(doc.standard.maxSectorWeight) + ' je Branche (Fama/French 12 aus SIC), Kurs ≥ ' + doc.standard.minPrice + ' USD, ADV ≥ ' + doc.standard.minDollarVolumeUsd / 1e6 + ' Mio. USD (ersatzweise Marktkap. ≥ ' + doc.standard.minMarketCapUsd / 1e6 + ' Mio.), höchstens ' + pct(doc.standard.maxParticipationOfAdv) + ' des ADV bei ' + doc.standard.assumedPortfolioUsd / 1e6 + ' Mio. USD Vermögen |');
L.push('| Kosten je Seite | Gebühr ' + doc.standard.feeBps + ' bp + Slippage ' + doc.standard.slippageBps + ' bp + halber Spread nach Liquiditätsklasse (2–50 bp) |');
L.push('| Rebalancing | alle ' + doc.defaults.rebalanceWeeks + ' Wochen, Entscheidung zum Wochenschluss, Ausführung zum Schluss der Folgewoche |');
L.push('| Endwert delisteter Titel | Übernahme 100 %, unbekannt 70 %, Notlage 0 % des letzten Schlusses: Klassenannahme, kein beobachteter Erlös (Sensitivität unten) |', '');
const cn = doc.data.counts || {};
L.push('Ausgeschlossen: ' + (cn.noSector ?? 0) + ' heutige Titel ohne Branche, ' + (cn.delistedNoSector ?? 0) + ' delistete ohne Branche, ' + (cn.delistedExcludedNoTotalReturn ?? 0) + ' delistete ohne Gesamtrendite, ' + ((cn.delistedExcludedRawMissing ?? 0) + (cn.delistedExcludedRawMismatch ?? 0)) + ' delistete ohne passende Tagesbalken.', '');
L.push('## Ergebnis je Musterportfolio', '');
L.push('| Portfolio | CAGR | Benchmark CAGR | Differenz | Volatilität | Max. Drawdown | Beta | Sharpe (rf 0) | Turnover p. a. | Ø Titel |', '|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|');
for (const r of doc.results) {
  if (r.state !== 'RUN') { L.push('| ' + (NAMES[r.profileId] || r.profileId) + ' | nicht konstruierbar | | | | | | | | |'); continue; }
  const m = r.metrics;
  L.push('| ' + (NAMES[r.profileId] || r.profileId) + ' | ' + pct(m.cagr) + ' | ' + pct(m.benchmarkCagr) + ' | ' + pct(m.excessCagr) + ' | ' + pct(m.annualizedVolatility) + ' | ' + pct(m.maxDrawdown) + ' | ' + num(m.beta) + ' | ' + num(m.sharpeRf0) + ' | ' + pct(m.annualizedOneWayTurnover) + ' | ' + num(r.construction.averagePositions) + ' |');
}
L.push('', 'Benchmark: Volatilität und Max. Drawdown je Lauf in `model-portfolios.json` (`benchmarkVolatility`, `benchmarkMaxDrawdown`).', '');
L.push('## Walk-forward: je Testfenster', '', 'Die Regeln sind vorab festgelegt und werden nicht angepasst; Risikomodell und Scores werden je Stichtag nur aus der Vergangenheit geschätzt. Die Tabelle zeigt jedes Drei-Jahres-Fenster für sich.', '');
L.push('| Portfolio | Fenster | CAGR | Benchmark | Differenz | Max. Drawdown | Beta |', '|---|---|--:|--:|--:|--:|--:|');
for (const r of doc.results) if (r.state === 'RUN') for (const f of r.folds) L.push('| ' + (NAMES[r.profileId] || r.profileId) + ' | ' + f.from + ' bis ' + f.to + ' | ' + pct(f.cagr) + ' | ' + pct(f.benchmarkCagr) + ' | ' + pct(f.excessCagr) + ' | ' + pct(f.maxDrawdown) + ' | ' + num(f.beta) + ' |');
if (doc.sensitivity && doc.sensitivity.length) {
  L.push('', '## Sensitivität', '', 'Varianten gegen den Standardlauf: Gleichgewichtung, Umschlag-Puffer (gehaltene Titel bleiben, solange sie unter den besten 50 liegen), Quartalsrhythmus (13 Wochen) und Endwertannahmen.', '', '| Portfolio | Variante | CAGR | Benchmark | Volatilität | Max. Drawdown | Beta | Turnover p. a. |', '|---|---|--:|--:|--:|--:|--:|--:|');
  for (const s of doc.sensitivity) L.push('| ' + (NAMES[s.profileId] || s.profileId) + ' | ' + s.variant + ' | ' + pct(s.cagr) + ' | ' + pct(s.benchmarkCagr) + ' | ' + pct(s.vol) + ' | ' + pct(s.maxDrawdown) + ' | ' + num(s.beta) + ' | ' + pct(s.turnover) + ' |');
}
if (doc.dqQuarantine) {
  const q = doc.dqQuarantine, base = new Map(q.base.map(b => [b.profileId, b]));
  L.push('', '## Datenqualität: Kurssprünge (DQ-K5, vorher/nachher)', '',
    'Ein Tag, dessen Gesamtrendite das Fünffache des Vortags erreicht oder auf ein Fünftel davon fällt, deutet oft auf einen nicht bereinigten (Reverse-)Split hin. Er kann aber auch eine echte Bewegung sein.',
    'Wie bei Supertrader wird ein solcher Titel an dieser Stelle geschnitten, nicht korrigiert. Kein Faktor greift über den Sprung zurück.',
    'BOOK rechnet eine gehaltene Position mit dem Kurs der Sprungwoche ab, PRIOR mit dem Kurs der Woche davor. Delistete V13-Ketten werden mangels Tagesbalken mit dem Wochenrelativ geprüft.', '');
  for (const pol of q.policies) L.push('- ' + pol.policy + ': ' + pol.flaggedSecurities + ' Titel mit ' + pol.flags + ' markierten Wochen, ' + pol.pieces + ' Stücke, ' + pol.droppedPieces + ' kurze Stücke entfallen.');
  L.push('', '| Portfolio | CAGR ohne Filter | größte Wochenrendite | CAGR BOOK | größte Wochenrendite | CAGR PRIOR | größte Wochenrendite | Benchmark |', '|---|--:|--:|--:|--:|--:|--:|--:|');
  const [B, P] = [q.policies.find(x => x.policy === 'DQ-K5-BOOK'), q.policies.find(x => x.policy === 'DQ-K5-PRIOR')];
  for (const [id, b] of base) {
    const rb = B && B.results.find(r => r.profileId === id), rp = P && P.results.find(r => r.profileId === id);
    L.push('| ' + (NAMES[id] || id) + ' | ' + pct(b.cagr) + ' | ' + pct(b.maxWeeklyReturn) + ' | ' + pct(rb && rb.cagr) + ' | ' + pct(rb && rb.maxWeeklyReturn) + ' | ' + pct(rp && rp.cagr) + ' | ' + pct(rp && rp.maxWeeklyReturn) + ' | ' + pct((rp || rb || {}).benchmarkCagr) + ' |');
  }
}
L.push('', '## Abdeckung je Jahr (Stichtag 30.06.)', '', '| Jahr | Titel mit Kurs | mit frischen Fundamentaldaten | davon später delistet |', '|--:|--:|--:|--:|');
for (const c of doc.data.coverageByYear) L.push('| ' + c.year + ' | ' + (c.priced ?? '–') + ' | ' + (c.withFreshFundamentals ?? '–') + ' | ' + (c.laterDelisted ?? '–') + ' |');
L.push('', '## Offene Grenzen', '');
const TEXT = {
  POPULATION_HEUTIGE_DATEIEN_PLUS_V13_KETTEN: 'Population: heute vorhandene Kursdateien mit heutigem SIC-Code plus qualifizierte V13-Ketten delisteter Titel. Das ist keine vollständige damalige Population; Titel ohne SIC und nicht qualifizierte Delistings fehlen (Zählung in model-portfolios.json, data.counts).',
  MITGLIEDSCHAFT_AUS_AUSFUEHRBARKEIT: 'Die je Stichtag gespeicherte Mitgliedschaft enthält nur in der Folgewoche ausführbare Titel; nicht ausgeführte Ziele stehen getrennt (unfilledAtExecution) und bleiben Cash.',
  WALK_FORWARD_OHNE_HOLDOUT_UND_MEHRFACHTEST: 'Walk-forward heißt hier rollierende Schätzung mit festen Regeln. Es gibt keine unberührte OOS-Periode, die Testfenster teilen denselben Pfad, und über die fünf Profile wird nicht für Mehrfachtests korrigiert.',
  ZEITRAUM_VERKUERZT: 'Der realisierte Zeitraum endet früher als angefragt, weil die Benchmark-Reihe früher endet (siehe Datenbasis).',
  DELISTETE_TITEL_NUR_QUALIFIZIERTE_KETTEN_MIT_GESAMTRENDITE_UND_ROHBALKEN: 'Delistete Titel nur mit vollständiger Gesamtrendite-Reihe und passenden Tagesbalken (Rohschluss je Datum über splitFactors, Tagesumsatz aus den Balken); andere werden ausgeschlossen und gezählt.',
  KEINE_HISTORISCHE_INDEXMITGLIEDSCHAFT: 'Keine historische Indexmitgliedschaft: Universum sind alle damals handelbaren US-Stammaktien mit SIC, Kurs- und Liquiditätsfilter, nicht der S&P 500 von damals.',
  SIC_HEUTIGER_STAND: 'Branche aus dem heutigen SIC-Code (SEC), keine historische Klassifikation.',
  SPREAD_MODELLIERT_NICHT_BEOBACHTET: 'Spread aus Liquiditätsklassen modelliert, keine beobachteten Geld-Brief-Kurse.',
  ENDWERT_DELISTETER_TITEL_ANNAHME_JE_KLASSE: 'Endwert delisteter Titel ist eine vorab festgelegte Annahme je Klasse (Sensitivität oben).',
  NUR_KURSRENDITE_KEINE_DIVIDENDEN: 'Nur Kursrendite, keine Dividenden (lokaler Lauf ohne Tagesbalken).',
  NUR_HEUTIGE_TITEL_SURVIVORSHIP: 'Nur heutige Titel (Survivorship-Verzerrung, lokaler Lauf).',
  FUNDAMENTALDATEN_VERZOEGERT_ZULETZT_EINGEREICHT: 'Fundamentaldaten in der zuletzt eingereichten Fassung, stark verzögert.',
  DELISTETE_TITEL_OHNE_TAGESUMSATZ_LIQUIDITAET_UEBER_MARKTKAPITALISIERUNG: 'Delistete Titel ohne Tagesumsatz: Liquidität über die Marktkapitalisierung (SEC-Aktienzahl × Kurs).',
};
for (const k of doc.openLimits) L.push('- ' + (TEXT[k] || k));
L.push('- Faktoren sind eine dokumentierte Rekonstruktion (`portfolio-pit-factors-1.0.0`), nicht die Live-Faktorevidenz; earnings-revision-leader fehlt (keine historischen Analystenrevisionen).');
L.push('- Ein Ergebnis über oder unter dem Index ist kein Beleg für eine dauerhafte Kante; die Quant-Forschung V10–V13c fand nach Mehrfachtest-Korrektur keinen robusten Vorsprung gegenüber dem S&P 500.');
fs.writeFileSync(get('--out'), L.join('\n') + '\n');
