#!/usr/bin/env node
/**
 * Merkmals-Atlas 1926/1963–heute (Kenneth R. French Data Library, frei verfügbar; Owner-Freigabe der Quelle 21.11.2026).
 * Forschung, nicht zertifiziert. Bericht: docs/research/longrun/MERKMALE.md.
 *
 * Frage (Owner 22.11.2026, „den Spieß umdrehen“): Welche Aktienmerkmale lagen über Jahrzehnte vor dem Gesamtmarkt, und hielt
 * das nach der Veröffentlichung? Je Merkmal das wertgewichtete Zehntel der „guten Seite“ (z. B. hohe Profitabilität, wenige
 * neue Aktien) gegen den Gesamtmarkt. Ohne Handelskosten; Kosten als Empfindlichkeit. Ergebnis fließt in die Merkmals-Studie
 * auf unseren eigenen Daten (docs/research/backtest2/PROTOKOLL.md, Stufe 2) und in Vorschläge für das Quant-Modell.
 *
 *   node scripts/research/longrun/atlas.mjs --out DIR [--data-dir DIR]
 */
import fs from 'node:fs';
import path from 'node:path';
import { SOURCE, unzipFirst, firstMonthlyBlock, series, metrics, relative } from './french.mjs';

/** Merkmal, Datei, Spalte der guten Seite, Spalte der schlechten Seite, Jahr der Veröffentlichung, Quelle der Erstveröffentlichung. */
export const FEATURES = Object.freeze([
  ['Momentum 12 Monate (Marktführer)', '10_Portfolios_Prior_12_2', 'Hi PRIOR', 'Lo PRIOR', 1993, 'Jegadeesh/Titman'],
  ['Kurzfristige Umkehr (Verlierer des letzten Monats)', '10_Portfolios_Prior_1_0', 'Lo PRIOR', 'Hi PRIOR', 1990, 'Jegadeesh'],
  ['Langfristige Umkehr (Verlierer der letzten 5 Jahre)', '10_Portfolios_Prior_60_13', 'Lo PRIOR', 'Hi PRIOR', 1985, 'De Bondt/Thaler'],
  ['Günstig nach Buchwert', 'Portfolios_Formed_on_BE-ME', 'Hi 10', 'Lo 10', 1992, 'Fama/French'],
  ['Günstig nach Gewinn (KGV niedrig)', 'Portfolios_Formed_on_E-P', 'Hi 10', 'Lo 10', 1977, 'Basu'],
  ['Günstig nach Cashflow', 'Portfolios_Formed_on_CF-P', 'Hi 10', 'Lo 10', 1994, 'Lakonishok/Shleifer/Vishny'],
  ['Hohe Dividendenrendite', 'Portfolios_Formed_on_D-P', 'Hi 10', 'Lo 10', 1979, 'Litzenberger/Ramaswamy'],
  ['Hohe operative Profitabilität', 'Portfolios_Formed_on_OP', 'Hi 10', 'Lo 10', 2013, 'Novy-Marx'],
  ['Wenig Investition (geringes Bilanzwachstum)', 'Portfolios_Formed_on_INV', 'Lo 10', 'Hi 10', 2008, 'Cooper/Gulen/Schill'],
  ['Saubere Gewinne (niedrige Accruals)', 'Portfolios_Formed_on_AC', 'Lo 10', 'Hi 10', 1996, 'Sloan'],
  ['Aktienrückkäufe (Nettoemission < 0)', 'Portfolios_Formed_on_NI', '< 0', 'Hi 10', 2008, 'Pontiff/Woodgate'],
  ['Niedriges Beta', 'Portfolios_Formed_on_BETA', 'Lo 10', 'Hi 10', 1972, 'Black/Jensen/Scholes'],
  ['Niedrige Schwankung', 'Portfolios_Formed_on_VAR', 'Lo 10', 'Hi 10', 2006, 'Ang/Hodrick/Xing/Zhang'],
  ['Niedrige Eigen-Schwankung', 'Portfolios_Formed_on_RESVAR', 'Lo 10', 'Hi 10', 2006, 'Ang/Hodrick/Xing/Zhang'],
  ['Kleine Firmen', 'Portfolios_Formed_on_ME', 'Lo 10', 'Hi 10', 1981, 'Banz'],
  ['Größte Firmen (wie S&P 500)', 'Portfolios_Formed_on_ME', 'Hi 10', 'Lo 10', null, '–'],
]);
const FACTORS = 'F-F_Research_Data_Factors';
/** Kombinationen je halb/halb, monatlich neu gewichtet (Namen aus FEATURES). Prüft, ob sich Merkmale über die Phasen ergänzen. */
export const COMBOS = Object.freeze([
  ['Kombination Momentum + Günstig nach Buchwert', 'Momentum 12 Monate (Marktführer)', 'Günstig nach Buchwert'],
  ['Kombination Momentum + Profitabilität', 'Momentum 12 Monate (Marktführer)', 'Hohe operative Profitabilität'],
  ['Kombination Momentum + Rückkäufe', 'Momentum 12 Monate (Marktführer)', 'Aktienrückkäufe (Nettoemission < 0)'],
  ['Kombination Profitabilität + Günstig nach Gewinn', 'Hohe operative Profitabilität', 'Günstig nach Gewinn (KGV niedrig)'],
]);

const pick = (b, col) => { const k = b.cols.indexOf(col); if (k < 0) throw new Error('COLUMN_MISSING ' + col + ' in ' + b.cols.join(',')); return new Map(b.rows.map((r) => [r[0], r[k + 1]])); };

export function analyzeAtlas(texts) {
  const fac = firstMonthlyBlock(texts[FACTORS]), months = fac.rows.map((r) => r[0]);
  const rf = series(pick(fac, 'RF'), months), mkt = series(pick(fac, 'Mkt-RF'), months).map((x, i) => (x === null ? null : x + rf[i]));
  const goodSeries = {}, badSeries = {};
  for (const [name, file, good, bad] of FEATURES) { const b = firstMonthlyBlock(texts[file]); goodSeries[name] = series(pick(b, good), months); badSeries[name] = series(pick(b, bad), months); }
  const mix = (a, b) => a.map((x, i) => (x === null || b[i] === null ? null : (x + b[i]) / 2));
  for (const [name, a, b] of COMBOS) { goodSeries[name] = mix(goodSeries[a], goodSeries[b]); badSeries[name] = mix(badSeries[a], badSeries[b]); }
  const list = [...FEATURES.map((f) => f), ...COMBOS.map(([name, a, b]) => [name, null, null, null, Math.max(FEATURES.find((f) => f[0] === a)[4], FEATURES.find((f) => f[0] === b)[4]), 'beide veröffentlicht'])];
  const rows = list.map(([name, , , , pub, who]) => {
    const g = goodSeries[name], w = badSeries[name];
    const first = g.findIndex((x) => x !== null), full = metrics(g, rf, months, first), m = metrics(mkt, rf, months, first), weak = metrics(w, rf, months, first);
    let after = null;
    if (pub) { const a = months.findIndex((x) => +x.slice(0, 4) >= pub); after = { from: pub, cagr: metrics(g, rf, months, a).cagr, market: metrics(mkt, rf, months, a).cagr, weak: metrics(w, rf, months, a).cagr }; }
    const since2008 = months.findIndex((x) => +x.slice(0, 4) >= 2008);
    // Phasenfestigkeit: Vorsprung je vollem Jahrzehnt ab dem ersten vollständigen Jahrzehnt (laufendes Jahrzehnt beschreibend)
    const decades = [];
    for (let d = Math.ceil(+months[first].slice(0, 4) / 10) * 10; d <= +months.at(-1).slice(0, 4); d += 10) {
      const a = months.findIndex((x) => +x.slice(0, 4) >= d), z = months.findLastIndex((x) => +x.slice(0, 4) < d + 10);
      if (a < 0 || z <= a) continue;
      decades.push({ decade: d, excess: metrics(g, rf, months, a, z).cagr - metrics(mkt, rf, months, a, z).cagr, complete: +months[z].slice(0, 4) === d + 9 && months[z].slice(4) === '12' });
    }
    return { name, source: who, from: months[first], cagr: full.cagr, market: m.cagr, excess: full.cagr - m.cagr, weakSide: weak.cagr, maxDrawdown: full.maxDrawdown, marketMaxDrawdown: m.maxDrawdown, sharpe: full.sharpe, marketSharpe: m.sharpe,
      rel10y: relative(g, mkt, months, 120), afterPublication: after,
      since2008: { cagr: metrics(g, rf, months, since2008).cagr, market: metrics(mkt, rf, months, since2008).cagr },
      decades, decadesAhead: decades.filter((x) => x.complete && x.excess > 0).length, decadesComplete: decades.filter((x) => x.complete).length,
      excessAfterCost1: metrics(g, rf, months, first, months.length - 1, 0.01).cagr - m.cagr };
  });
  return { schema: 'longrun-atlas-1.0.0', label: 'Forschung, nicht zertifiziert', source: SOURCE, dataThrough: months.at(-1), rows };
}

const pct = (x) => (x == null || !Number.isFinite(x) ? '–' : (x * 100).toFixed(1).replace('.', ',') + ' %');
const pp = (x) => (x == null || !Number.isFinite(x) ? '–' : (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(1).replace('.', ',') + ' Pp');
const ym = (s) => (s ? s.slice(4) + '/' + s.slice(0, 4) : '–');

export function atlasReport(res) {
  const L = ['# Merkmals-Atlas: Welche Aktienmerkmale lagen vor dem Markt?', '', `**Forschung, nicht zertifiziert.** Quelle: Kenneth R. French Data Library (Dartmouth), Daten bis ${ym(res.dataThrough)}; Owner-Freigabe der Quelle 21.11.2026. Erzeuger: \`scripts/research/longrun/atlas.mjs\`.`, ''];
  L.push('Je Merkmal das wertgewichtete Zehntel aller US-Aktien auf der „guten Seite“ gegen den Gesamtmarkt, ohne Handelskosten. Sortiert nach dem Vorsprung **nach der Veröffentlichung** – das ist der ehrlichste Maßstab, denn vorher wusste niemand davon.', '');
  const rows = [...res.rows].sort((a, b) => ((b.afterPublication?.cagr ?? b.cagr) - (b.afterPublication?.market ?? b.market)) - ((a.afterPublication?.cagr ?? a.cagr) - (a.afterPublication?.market ?? a.market)));
  L.push('| Merkmal (gute Seite) | ab | Vorsprung gesamt | veröffentlicht | Vorsprung danach | seit 2008 (Merkmal / Markt) | 10-J.-Fenster vorn | Jahrzehnte vorn | max. Verlust (Markt) | nach 1 % Kosten |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const a = r.afterPublication;
    L.push(`| ${r.name} | ${ym(r.from)} | ${pp(r.excess)} | ${a ? a.from + ' (' + r.source + ')' : '–'} | ${a ? pp(a.cagr - a.market) : '–'} | ${pct(r.since2008.cagr)} / ${pct(r.since2008.market)} | ${Math.round(r.rel10y.winShare * 100)} % | ${r.decadesAhead} von ${r.decadesComplete} | ${pct(r.maxDrawdown)} (${pct(r.marketMaxDrawdown)}) | ${pp(r.excessAfterCost1)} |`);
  }
  const decs = [...new Set(res.rows.flatMap((r) => r.decades.map((d) => d.decade)))].sort((a, b) => a - b);
  L.push('', '## Phasenfestigkeit: Vorsprung je Jahrzehnt (Prozentpunkte p. a. gegenüber dem Gesamtmarkt)', '',
    'Ein Merkmal, das nur in einer Ära funktioniert, taugt nicht als Grundlage für eine Strategie, die in jeder Phase bestehen soll. Laufendes Jahrzehnt (2020er) beschreibend, nicht in „Jahrzehnte vorn“ gezählt.', '',
    '| Merkmal | ' + decs.map((d) => d + 'er').join(' | ') + ' |', '|---|' + decs.map(() => '---').join('|') + '|');
  for (const r of rows) L.push(`| ${r.name} | ` + decs.map((d) => { const x = r.decades.find((y) => y.decade === d); return x ? pp(x.excess) : '–'; }).join(' | ') + ' |');
  L.push('', '## Lesehilfe', '',
    '- „Vorsprung danach“: Rendite p. a. des Merkmals minus Gesamtmarkt ab dem Jahr der ersten Veröffentlichung. Hält ein Merkmal dort, war es vermutlich kein Zufallsfund.',
    '- „seit 2008“: derselbe Zeitraum wie Backtest 2.0; zeigt, ob das Merkmal in der Ära der Mega-Caps noch funktionierte.',
    '- „Jahrzehnte vorn“: in wie vielen abgeschlossenen Jahrzehnten das Merkmal vor dem Markt lag. Kriterium für die Merkmals-Studie (Backtest 2.0, Stufe 2): ein Merkmal gilt als phasenfest, wenn es in mindestens zwei Dritteln der Jahrzehnte vorn lag und nach der Veröffentlichung nicht verschwand.',
    '- Kosten: Momentum und kurzfristige Umkehr schichten monatlich viel um (realistisch 1–3 % p. a., bei kurzfristiger Umkehr mehr); Bewertung, Profitabilität, Investition, Accruals und Rückkäufe jährlich (deutlich unter 1 % p. a.).',
    '- Portfolios über alle US-Aktien (CRSP) mit Pleiten und Delistings; „Zehntel“ heißt Hunderte Titel, wertgewichtet. Keine Einzelaktien aus der App.', '');
  return L.join('\n') + '\n';
}

/** Kompakte Fassung für die Forschungsseite (/quant/#/forschung): nur abgeleitete Kennzahlen, keine Monatsreihen. */
export function frontendSummary(res) {
  const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10000) / 10000 : null);
  return {
    schema: 'longrun-atlas-frontend-1.0.0', label: 'Forschung, nicht zertifiziert', producer: 'scripts/research/longrun/atlas.mjs',
    source: 'Kenneth R. French Data Library (Dartmouth), frei verfügbar; Owner-Freigabe der Quelle 21.11.2026', dataThrough: res.dataThrough,
    note: 'Wertgewichtete Portfolios aller US-Aktien (CRSP) mit Pleiten und Delistings, ohne Handelskosten; keine Einzelaktien aus der App. Vergangenheit, keine Prognose.',
    rows: res.rows.map((r) => ({ name: r.name, combo: r.name.startsWith('Kombination'), from: r.from, excess: r1(r.excess), published: r.afterPublication?.from ?? null,
      excessAfterPublication: r.afterPublication ? r1(r.afterPublication.cagr - r.afterPublication.market) : null,
      since2008: r1(r.since2008.cagr - r.since2008.market), decadesAhead: r.decadesAhead, decadesComplete: r.decadesComplete, windows10yAhead: r1(r.rel10y.winShare),
      maxDrawdown: r1(r.maxDrawdown), marketMaxDrawdown: r1(r.marketMaxDrawdown),
      phaseRobust: r.decadesComplete > 0 && r.decadesAhead >= (2 / 3) * r.decadesComplete && (r.afterPublication ? r.afterPublication.cagr > r.afterPublication.market : r.excess > 0),
      decades: r.decades.map((d) => ({ decade: d.decade, excess: r1(d.excess), complete: d.complete })) })),
  };
}

async function load(name, dir, raw) {
  if (dir) return fs.readFileSync(path.join(dir, name + '.csv'), 'latin1');
  const f = path.join(raw, name + '_CSV.zip');
  if (!fs.existsSync(f)) { const r = await fetch(SOURCE + name + '_CSV.zip'); if (!r.ok) throw new Error('DOWNLOAD ' + name + ' ' + r.status); fs.mkdirSync(raw, { recursive: true }); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); }
  return unzipFirst(fs.readFileSync(f));
}

async function main() {
  const a = {}; for (let i = 2; i < process.argv.length; i += 2) a[process.argv[i].slice(2)] = process.argv[i + 1];
  if (!a.out) throw new Error('--out ist Pflicht');
  const names = [...new Set([FACTORS, ...FEATURES.map((f) => f[1])])], texts = {};
  for (const n of names) texts[n] = await load(n, a['data-dir'], path.join(a.out, 'raw'));
  const res = analyzeAtlas(texts);
  fs.mkdirSync(a.out, { recursive: true });
  fs.writeFileSync(path.join(a.out, 'atlas.json'), JSON.stringify(res, null, 1));
  fs.writeFileSync(path.join(a.out, 'MERKMALE.md'), atlasReport(res));
  if (a['json-out']) fs.writeFileSync(a['json-out'], JSON.stringify(frontendSummary(res), null, 1) + '\n');
  console.log(atlasReport(res));
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
