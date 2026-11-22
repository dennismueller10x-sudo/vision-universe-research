#!/usr/bin/env node
/**
 * Langfrist-Auswertung 1926–heute auf Faktor-Ebene (Kenneth R. French Data Library, Dartmouth, frei verfügbar;
 * Owner-Freigabe der Quelle 21.11.2026). Forschung, nicht zertifiziert. Bericht: docs/research/longrun/BERICHT.md.
 *
 * Frage: Lagen die Prinzipien hinter unseren Methoden (Momentum/Marktführer, Value, Qualität, Marktfilter) über fast
 * 100 Jahre vor dem Gesamtmarkt, wie stabil, mit welchen Einbrüchen, und blieb der Vorsprung nach der Veröffentlichung?
 * Grenzen: Portfolios der Wissenschaft (wertgewichtet, monatlich bzw. jährlich umgeschichtet, ohne Handelskosten), keine
 * Einzelaktien aus der App; Kosten nur als Empfindlichkeit (0–3 % p. a. Abzug).
 *
 *   node scripts/research/longrun/french.mjs --out DIR [--data-dir DIR]   (ohne --data-dir: Download nach DIR/raw)
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export const SOURCE = 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/';
export const FILES = Object.freeze({
  factors: 'F-F_Research_Data_Factors', mom10: '10_Portfolios_Prior_12_2', mom6: '6_Portfolios_ME_Prior_12_2',
  bm: 'Portfolios_Formed_on_BE-ME', op: 'Portfolios_Formed_on_OP',
});
export const PUBLISHED = Object.freeze({ momentum: 1993, value: 1992, quality: 2013 });

/** Erster Eintrag eines ZIP-Archivs (Deflate oder gespeichert). */
export function unzipFirst(buf) {
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error('ZIP_INVALID');
  const method = buf.readUInt16LE(8), size = buf.readUInt32LE(18), nameLen = buf.readUInt16LE(26), extra = buf.readUInt16LE(28);
  const data = buf.subarray(30 + nameLen + extra, 30 + nameLen + extra + size);
  return (method === 8 ? zlib.inflateRawSync(data) : data).toString('latin1');
}

/** Erster Datenblock einer French-CSV (wertgewichtet, monatlich): {cols, rows: [[yyyymm, ...Prozent]]}. */
export function firstMonthlyBlock(text) {
  const lines = text.split(/\r?\n/);
  const h = lines.findIndex((l) => l.startsWith(','));
  const cols = lines[h].split(',').slice(1).map((s) => s.trim());
  const rows = [];
  for (let i = h + 1; i < lines.length; i++) {
    const p = lines[i].split(',').map((s) => s.trim());
    if (!/^\d{6}$/.test(p[0])) break;
    rows.push([p[0], ...p.slice(1).map(Number)]);
  }
  return { cols, rows };
}

const pick = (block, col) => { const k = block.cols.indexOf(col); if (k < 0) throw new Error('COLUMN_MISSING ' + col); return new Map(block.rows.map((r) => [r[0], r[k + 1]])); };

/** Monatsrenditen (Dezimal) einer Strategie auf dem Monatsraster `months`; fehlend = null. */
export function series(map, months) { return months.map((m) => { const v = map.get(m); return v === undefined || v <= -99.99 ? null : v / 100; }); }

export function metrics(r, rf, months, from = 0, to = months.length - 1, costPa = 0) {
  let lv = 1, pk = 1, dd = 0, n = 0, sx = 0, sx2 = 0;
  const mc = costPa / 12;
  for (let i = from; i <= to; i++) {
    if (r[i] === null) continue;
    const x = r[i] - mc; lv *= 1 + x; pk = Math.max(pk, lv); dd = Math.min(dd, lv / pk - 1); n++;
    const ex = x - (rf[i] ?? 0); sx += ex; sx2 += ex * ex;
  }
  const mu = sx / n, sd = Math.sqrt(Math.max(0, sx2 / n - mu * mu));
  return { cagr: lv ** (12 / n) - 1, maxDrawdown: dd, sharpe: sd > 0 ? (mu / sd) * Math.sqrt(12) : 0, months: n, from: months[from], to: months[to] };
}

/** Anteil der rollierenden Fenster (Monate) mit höherer Rendite als der Vergleich, und längste Durststrecke relativ. */
export function relative(r, b, months, window) {
  const idx = r.map((x, i) => (x !== null && b[i] !== null ? i : -1)).filter((i) => i >= 0);
  let wins = 0, total = 0;
  for (let k = window; k <= idx.length; k++) {
    let a = 1, c = 1; for (let j = k - window; j < k; j++) { a *= 1 + r[idx[j]]; c *= 1 + b[idx[j]]; }
    total++; if (a > c) wins++;
  }
  let rel = 1, pk = 1, start = 0, longest = 0, from = null, to = null;
  for (let j = 0; j < idx.length; j++) {
    rel *= (1 + r[idx[j]]) / (1 + b[idx[j]]);
    if (rel >= pk) { pk = rel; start = j; } else if (j - start > longest) { longest = j - start; from = months[idx[start]]; to = months[idx[j]]; }
  }
  return { winShare: total ? wins / total : null, windows: total, longestBehindMonths: longest, longestBehind: [from, to] };
}

/** 10-Monats-Filter: im Monat t investiert, wenn der Gesamtrendite-Index der Benchmark zum Ende von t-1 über seinem 10-Monats-Schnitt lag. */
export function trendFiltered(r, signal, rf) {
  const out = Array(r.length).fill(null), idx = [];
  let lv = 1; const levels = [];
  for (let i = 0; i < signal.length; i++) { if (signal[i] !== null) lv *= 1 + signal[i]; levels.push(signal[i] === null ? null : lv); }
  for (let i = 0; i < r.length; i++) {
    if (r[i] === null) continue;
    const prev = []; for (let k = i - 1; k >= 0 && prev.length < 10; k--) if (levels[k] !== null) prev.push(levels[k]);
    if (prev.length < 10) continue;
    const on = prev[0] >= prev.reduce((a, b) => a + b, 0) / 10;
    out[i] = on ? r[i] : (rf[i] ?? 0); idx.push(on);
  }
  return { r: out, shareInvested: idx.filter(Boolean).length / idx.length };
}

export function analyze(texts) {
  const B = Object.fromEntries(Object.entries(texts).map(([k, t]) => [k, firstMonthlyBlock(t)]));
  const months = B.factors.rows.map((r) => r[0]);
  const mkRf = series(pick(B.factors, 'Mkt-RF'), months), rf = series(pick(B.factors, 'RF'), months);
  const mkt = mkRf.map((x, i) => (x === null ? null : x + rf[i]));
  const strat = {
    'Gesamtmarkt (alle US-Aktien)': mkt,
    'Momentum oberstes Zehntel': series(pick(B.mom10, 'Hi PRIOR'), months),
    'Momentum große Firmen': series(pick(B.mom6, 'BIG HiPRIOR'), months),
    'Value oberstes Zehntel': series(pick(B.bm, 'Hi 10'), months),
    'Qualität oberstes Zehntel (ab 1963)': series(pick(B.op, 'Hi 10'), months),
  };
  const filt = trendFiltered(mkt, mkt, rf), filtMom = trendFiltered(strat['Momentum große Firmen'], mkt, rf);
  strat['Gesamtmarkt mit 10-Monats-Filter'] = filt.r;
  strat['Momentum große Firmen mit Filter'] = filtMom.r;
  const pub = { 'Momentum oberstes Zehntel': PUBLISHED.momentum, 'Momentum große Firmen': PUBLISHED.momentum, 'Momentum große Firmen mit Filter': PUBLISHED.momentum, 'Value oberstes Zehntel': PUBLISHED.value, 'Qualität oberstes Zehntel (ab 1963)': PUBLISHED.quality };
  const rows = [];
  for (const [name, r] of Object.entries(strat)) {
    const first = r.findIndex((x) => x !== null);
    const full = metrics(r, rf, months, first), bench = metrics(mkt, rf, months, first);
    const decades = [];
    for (let d = Math.ceil(+months[first].slice(0, 4) / 10) * 10; d <= +months.at(-1).slice(0, 4); d += 10) {
      const a = months.findIndex((m) => +m.slice(0, 4) >= d), b = months.findLastIndex((m) => +m.slice(0, 4) < d + 10);
      if (a < 0 || b < a) continue;
      decades.push({ decade: d, cagr: metrics(r, rf, months, a, b).cagr, market: metrics(mkt, rf, months, a, b).cagr });
    }
    let after = null;
    if (pub[name]) {
      const a = months.findIndex((m) => +m.slice(0, 4) >= pub[name]);
      const s = metrics(r, rf, months, a), m = metrics(mkt, rf, months, a), before = metrics(r, rf, months, first, a - 1), mb = metrics(mkt, rf, months, first, a - 1);
      after = { published: pub[name], before: { cagr: before.cagr, market: mb.cagr }, after: { cagr: s.cagr, market: m.cagr, maxDrawdown: s.maxDrawdown, marketMaxDrawdown: m.maxDrawdown } };
    }
    const costs = [1, 2, 3].map((c) => ({ costPa: c / 100, excess: metrics(r, rf, months, first, months.length - 1, c / 100).cagr - bench.cagr }));
    rows.push({ name, ...full, market: bench, excess: full.cagr - bench.cagr, rel10y: relative(r, mkt, months, 120), rel3y: relative(r, mkt, months, 36), decades, afterPublication: after, costs });
  }
  return { schema: 'longrun-french-1.0.0', label: 'Forschung, nicht zertifiziert', source: SOURCE, dataThrough: months.at(-1), shareInvestedFilter: filt.shareInvested, rows };
}

const pct = (x) => (x == null || !Number.isFinite(x) ? '–' : (x >= 0 && x < 10 ? '' : '') + (x * 100).toFixed(1).replace('.', ',') + ' %');
const pp = (x) => (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(1).replace('.', ',') + ' Pp';
const ym = (s) => s ? s.slice(4) + '/' + s.slice(0, 4) : '–';

export function report(res) {
  const L = ['# Langfrist-Auswertung 1926–heute (Faktor-Ebene)', '', `**Forschung, nicht zertifiziert.** Quelle: Kenneth R. French Data Library (Dartmouth), frei verfügbar, Daten bis ${ym(res.dataThrough)}; Owner-Freigabe der Quelle 21.11.2026. Erzeuger: \`scripts/research/longrun/french.mjs\`.`, ''];
  L.push('Frage: Lagen die Prinzipien hinter unseren Methoden über fast 100 Jahre vor dem Gesamtmarkt, wie verlässlich, und blieb der Vorsprung nach der Veröffentlichung? Es sind Portfolios der Wissenschaft, keine Einzelaktien aus der App und **ohne Handelskosten** (Kosten unten als Empfindlichkeit).', '');
  L.push('## Gesamtzeitraum', '', '| Strategie | ab | CAGR | Markt | Vorsprung | max. Verlust | Sharpe | 10-Jahres-Fenster vorn | längste Durststrecke |', '|---|---|---|---|---|---|---|---|---|');
  for (const r of res.rows) L.push(`| ${r.name} | ${ym(r.from)} | ${pct(r.cagr)} | ${pct(r.market.cagr)} | ${r.name.startsWith('Gesamtmarkt (') ? '–' : pp(r.excess)} | ${pct(r.maxDrawdown)} | ${r.sharpe.toFixed(2).replace('.', ',')} | ${r.name.startsWith('Gesamtmarkt (') ? '–' : Math.round(r.rel10y.winShare * 100) + ' %'} | ${r.name.startsWith('Gesamtmarkt (') ? '–' : Math.round(r.rel10y.longestBehindMonths / 12) + ' Jahre (' + ym(r.rel10y.longestBehind[0]) + '–' + ym(r.rel10y.longestBehind[1]) + ')'} |`);
  L.push('', `Der 10-Monats-Filter war in ${Math.round(res.shareInvestedFilter * 100)} % der Monate investiert, sonst in Geldmarkt (T-Bills).`, '',
    '„10-Jahres-Fenster vorn“: Anteil aller rollierenden 10-Jahres-Zeiträume, in denen die Strategie mehr erzielte als der Markt. „Längste Durststrecke“: längste Zeit vom höchsten Vorsprung bis zum nächsten neuen Höchststand des Vorsprungs (läuft sie bis heute, ist der alte Höchststand noch nicht wieder erreicht). Beim Filter stammt der Höchststand aus dem Ausweichen vor dem Crash 1929–1932; seitdem hat der Filter in Summe keinen weiteren Vorsprung aufgebaut, aber Verluste begrenzt.', '');
  L.push('## Nach der Veröffentlichung', '', 'Ein Vorsprung, der nach der Veröffentlichung in der Wissenschaft verschwindet, war vermutlich Zufall oder wurde wegarbitriert.', '', '| Strategie | veröffentlicht | vorher: Strategie / Markt | nachher: Strategie / Markt | nachher max. Verlust (Markt) |', '|---|---|---|---|---|');
  for (const r of res.rows.filter((x) => x.afterPublication)) { const a = r.afterPublication; L.push(`| ${r.name} | ${a.published} | ${pct(a.before.cagr)} / ${pct(a.before.market)} | ${pct(a.after.cagr)} / ${pct(a.after.market)} | ${pct(a.after.maxDrawdown)} (${pct(a.after.marketMaxDrawdown)}) |`); }
  L.push('', '## Je Jahrzehnt (CAGR Strategie / Markt)', '');
  const decs = [...new Set(res.rows.flatMap((r) => r.decades.map((d) => d.decade)))].sort();
  L.push('| Strategie | ' + decs.map((d) => d + 'er').join(' | ') + ' |', '|---|' + decs.map(() => '---').join('|') + '|');
  for (const r of res.rows.filter((x) => !x.name.startsWith('Gesamtmarkt ('))) L.push(`| ${r.name} | ` + decs.map((d) => { const x = r.decades.find((y) => y.decade === d); return x ? `${pct(x.cagr)} / ${pct(x.market)}` : '–'; }).join(' | ') + ' |');
  L.push('', '## Empfindlichkeit für Handelskosten (Vorsprung zum Markt nach Kostenabzug)', '', '| Strategie | 1 % p. a. | 2 % p. a. | 3 % p. a. |', '|---|---|---|---|');
  for (const r of res.rows.filter((x) => !x.name.startsWith('Gesamtmarkt ('))) L.push(`| ${r.name} | ${r.costs.map((c) => pp(c.excess)).join(' | ')} |`);
  L.push('', 'Größenordnung der Kosten: Momentum schichtet monatlich einen großen Teil des Portfolios um (bei großen Firmen grob 1–2 % p. a. Kosten, im obersten Zehntel aller Firmen mehr); Value und Qualität werden jährlich umgeschichtet (deutlich unter 1 % p. a.).', '');
  L.push('## Grenzen', '', '- Portfolios über alle US-Aktien (CRSP: NYSE, AMEX, NASDAQ) mit Pleiten und Delistings, aber ohne Steuern und Handelskosten; „oberstes Zehntel“ heißt Hunderte Titel, wertgewichtet.', '- Rückschau: Diese Faktoren sind genau deshalb bekannt, weil sie in der Vergangenheit funktioniert haben. Das Kapitel „Nach der Veröffentlichung“ ist der ehrlichste Teil.', '- Kein Ersatz für Backtest 2.0: Dort werden unsere eigenen Regeln mit Kosten und Walk-forward geprüft (`docs/research/backtest2/PROTOKOLL.md`).');
  return L.join('\n') + '\n';
}

async function fetchTexts(raw) {
  fs.mkdirSync(raw, { recursive: true });
  const out = {};
  for (const [k, f] of Object.entries(FILES)) {
    const file = path.join(raw, f + '_CSV.zip');
    if (!fs.existsSync(file)) { const res = await fetch(SOURCE + f + '_CSV.zip'); if (!res.ok) throw new Error('DOWNLOAD ' + f + ' ' + res.status); fs.writeFileSync(file, Buffer.from(await res.arrayBuffer())); }
    out[k] = unzipFirst(fs.readFileSync(file));
  }
  return out;
}

async function main() {
  const a = {}; for (let i = 2; i < process.argv.length; i += 2) a[process.argv[i].slice(2)] = process.argv[i + 1];
  if (!a.out) throw new Error('--out ist Pflicht');
  const texts = a['data-dir'] ? Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, fs.readFileSync(path.join(a['data-dir'], f + '.csv'), 'latin1')])) : await fetchTexts(path.join(a.out, 'raw'));
  const res = analyze(texts);
  fs.mkdirSync(a.out, { recursive: true });
  fs.writeFileSync(path.join(a.out, 'results.json'), JSON.stringify(res, null, 1));
  fs.writeFileSync(path.join(a.out, 'BERICHT.md'), report(res));
  console.log(report(res));
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
