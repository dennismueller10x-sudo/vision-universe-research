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

const pick = (b, col) => { const k = b.cols.indexOf(col); if (k < 0) throw new Error('COLUMN_MISSING ' + col + ' in ' + b.cols.join(',')); return new Map(b.rows.map((r) => [r[0], r[k + 1]])); };

export function analyzeAtlas(texts) {
  const fac = firstMonthlyBlock(texts[FACTORS]), months = fac.rows.map((r) => r[0]);
  const rf = series(pick(fac, 'RF'), months), mkt = series(pick(fac, 'Mkt-RF'), months).map((x, i) => (x === null ? null : x + rf[i]));
  const rows = FEATURES.map(([name, file, good, bad, pub, who]) => {
    const b = firstMonthlyBlock(texts[file]), g = series(pick(b, good), months), w = series(pick(b, bad), months);
    const first = g.findIndex((x) => x !== null), full = metrics(g, rf, months, first), m = metrics(mkt, rf, months, first), weak = metrics(w, rf, months, first);
    let after = null;
    if (pub) { const a = months.findIndex((x) => +x.slice(0, 4) >= pub); after = { from: pub, cagr: metrics(g, rf, months, a).cagr, market: metrics(mkt, rf, months, a).cagr, weak: metrics(w, rf, months, a).cagr }; }
    const since2008 = months.findIndex((x) => +x.slice(0, 4) >= 2008);
    return { name, source: who, from: months[first], cagr: full.cagr, market: m.cagr, excess: full.cagr - m.cagr, weakSide: weak.cagr, maxDrawdown: full.maxDrawdown, marketMaxDrawdown: m.maxDrawdown, sharpe: full.sharpe, marketSharpe: m.sharpe,
      rel10y: relative(g, mkt, months, 120), afterPublication: after,
      since2008: { cagr: metrics(g, rf, months, since2008).cagr, market: metrics(mkt, rf, months, since2008).cagr },
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
  L.push('| Merkmal (gute Seite) | ab | Vorsprung gesamt | veröffentlicht | Vorsprung danach | seit 2008 (Merkmal / Markt) | 10-J.-Fenster vorn | max. Verlust (Markt) | nach 1 % Kosten |', '|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const a = r.afterPublication;
    L.push(`| ${r.name} | ${ym(r.from)} | ${pp(r.excess)} | ${a ? a.from + ' (' + r.source + ')' : '–'} | ${a ? pp(a.cagr - a.market) : '–'} | ${pct(r.since2008.cagr)} / ${pct(r.since2008.market)} | ${Math.round(r.rel10y.winShare * 100)} % | ${pct(r.maxDrawdown)} (${pct(r.marketMaxDrawdown)}) | ${pp(r.excessAfterCost1)} |`);
  }
  L.push('', '## Lesehilfe', '',
    '- „Vorsprung danach“: Rendite p. a. des Merkmals minus Gesamtmarkt ab dem Jahr der ersten Veröffentlichung. Hält ein Merkmal dort, war es vermutlich kein Zufallsfund.',
    '- „seit 2008“: derselbe Zeitraum wie Backtest 2.0; zeigt, ob das Merkmal in der Ära der Mega-Caps noch funktionierte.',
    '- Kosten: Momentum und kurzfristige Umkehr schichten monatlich viel um (realistisch 1–3 % p. a., bei kurzfristiger Umkehr mehr); Bewertung, Profitabilität, Investition, Accruals und Rückkäufe jährlich (deutlich unter 1 % p. a.).',
    '- Portfolios über alle US-Aktien (CRSP) mit Pleiten und Delistings; „Zehntel“ heißt Hunderte Titel, wertgewichtet. Keine Einzelaktien aus der App.', '');
  return L.join('\n') + '\n';
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
  console.log(atlasReport(res));
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
