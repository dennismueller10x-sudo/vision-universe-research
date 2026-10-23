// FUNDAMENTAL – Datenabdeckung und Konsistenz (Pruefbericht, schreibt nur nach --out).
//
// Liest dieselben Quellen wie die Seite: die SEC-Historie (in memory aus scripts/fundamental/build-history.mjs),
// die Discover-Aktiendateien und die Wochenreihen mit Split-Beleg. Misst je Kennzahl des Katalogs
// (fundamental/engine/catalog.js), wie viele Unternehmen einen aktuellen Wert und wie viele Jahre Historie haben,
// ob vier eigenstaendige Quartale den Jahreswert ergeben und ob die LTM der Summe der letzten vier Quartale entspricht.
//
// Aufruf: node scripts/fundamental/coverage-report.mjs --out=<datei.md> [--json=<datei.json>]
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { buildHistory } from './build-history.mjs';
const require = createRequire(import.meta.url);
const C = require('../../fundamental/engine/catalog.js');

export const SAMPLE = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'JPM', 'BRK-B', 'KO', 'XOM', 'JNJ', 'WMT', 'PLTR', 'AAL', 'CMG', 'O', 'SAP'];
const FLOWS = ['revenue', 'gross_profit', 'operating_income', 'net_income', 'operating_cash_flow', 'free_cash_flow'];
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const pct = (a, b) => (b ? (100 * a / b).toFixed(1).replace('.', ',') + ' %' : '–');
const quant = (arr, q) => { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

/* Jahr gegen Quartale: nur Geschaeftsjahre mit allen vier eigenstaendigen Quartalen. Toleranz 1 % (Rundung der Meldungen). */
export function quarterConsistency(b, metric, tol = 0.01) {
  const s = b.base[metric]; if (!s) return [];
  const out = [];
  for (const a of s.annual) {
    const q = s.quarterly.filter((r) => r.fy === a.fy);
    if (q.length !== 4 || !isNum(a.v) || a.v === 0) continue;
    const sum = q.reduce((x, r) => x + r.v, 0), dev = Math.abs(sum - a.v) / Math.abs(a.v);
    out.push({ fy: a.fy, annual: a.v, sum, dev, ok: dev <= tol, derivedQ: q.some((r) => r.derived) });
  }
  return out;
}
export function ttmConsistency(b, metric, tol = 0.005) {
  const s = b.base[metric]; if (!s || !s.ttm || s.ttm.kind !== 'TTM') return null;
  const roll = C.rolling(b, metric), last = roll[roll.length - 1];
  if (!last) return null;
  return { ok: Math.abs(last.v - s.ttm.v) <= Math.max(1, Math.abs(s.ttm.v)) * tol, ttm: s.ttm.v, sum: last.v };
}

export async function coverage({ root, universe }) {
  root = resolve(root);
  const U = universe ? C.universe(JSON.parse(await readFile(universe, 'utf8'))) : null;
  const { shards, stats } = await buildHistory({ root });
  const issuers = Object.values(shards).flatMap((s) => Object.entries(s.issuers));
  const per = {}; C.METRICS.forEach((m) => { per[m.id] = { cur: 0, years: [], quarterly: 0 }; });
  const cons = {}; FLOWS.forEach((m) => { cons[m] = { years: 0, ok: 0, blocked: 0, issuers: 0 }; });
  const ttm = { checked: 0, ok: 0 }, pe = { issuers: 0, withYear: 0, years: 0, verified: 0, reasons: {} };
  const depth = { years: [], quarters: [] }, sample = {};
  for (const [t, h] of issuers) {
    const stock = JSON.parse(await readFile(join(root, 'discover/data/stocks/US_REAL', t + '.json'), 'utf8'));
    const b = C.fromHistory(h, stock); if (!b) continue;
    depth.years.push(b.years.length); depth.quarters.push(b.quarters.length);
    const cat = C.catalogFor(b, { snap: C.snapshot(stock, U ? U.get(t) : null) });
    for (const x of cat) {
      const p = per[x.def.id];
      if (isNum(x.cur.v)) p.cur++;
      const n = x.rows.filter((r) => isNum(r.v)).length; if (n) p.years.push(n);
      if (x.quarterly) p.quarterly++;
    }
    // catalog.js#quarterMismatch hat unstimmige Geschaeftsjahre bereits aus den Quartalen genommen (b.mismatch):
    // gemessen werden beide Seiten – veroeffentlichte (stimmige) und gesperrte Jahre.
    for (const m of FLOWS) {
      const k = cons[m], okYears = quarterConsistency(b, m), blocked = (b.mismatch[m] || []).length;
      k.years += okYears.length + blocked; k.ok += okYears.filter((c) => c.ok).length; k.blocked += blocked; if (blocked) k.issuers++;
    }
    const tc = ttmConsistency(b, 'revenue'); if (tc) { ttm.checked++; if (tc.ok) ttm.ok++; }
    const lp = stock.series && stock.series.long && C.longSeriesPath(stock.series.long.path);
    let ph = null;
    if (lp && b.currency === 'USD' && existsSync(join(root, lp.slice(1)))) {
      ph = C.historicalPe(b, JSON.parse(await readFile(join(root, lp.slice(1)), 'utf8')));
      pe.issuers++;
      for (const r of ph.rows) { pe.years++; if (isNum(r.v)) pe.verified++; else pe.reasons[r.reason] = (pe.reasons[r.reason] || 0) + 1; }
      if (ph.state === 'AVAILABLE') pe.withYear++;
    }
    if (SAMPLE.includes(t)) {
      const c = FLOWS.flatMap((m) => quarterConsistency(b, m).concat((b.mismatch[m] || []).map(() => ({ ok: false }))));
      sample[t] = { currency: b.currency, years: b.years.length ? b.years[0] + '–' + b.years[b.years.length - 1] : '–', quarters: b.quarters.length,
        metrics: cat.filter((x) => isNum(x.cur.v)).length, of: cat.length, missing: cat.filter((x) => !x.available).map((x) => x.def.id),
        consistency: c.length ? c.filter((x) => x.ok).length + '/' + c.length : '–', ttm: tc ? (tc.ok ? 'ok' : 'Abweichung') : '–',
        pe: ph ? ph.rows.filter((r) => isNum(r.v)).length + '/' + ph.rows.length : (b.currency !== 'USD' ? 'nicht USD' : '–'), splits: b.splits.length };
    }
  }
  for (const t of SAMPLE) if (!sample[t]) sample[t] = null;
  return { generatedAt: new Date().toISOString(), universe: !!U, stats, issuers: issuers.length, per, cons, ttm, pe, depth, sample };
}

const LABEL = Object.fromEntries(C.METRICS.map((m) => [m.id, m.label]));
export function markdown(r) {
  const L = [];
  L.push('# Fundamental – Datenabdeckung und Konsistenz', '');
  L.push('Erzeugt mit `node scripts/fundamental/coverage-report.mjs --universe=<screener/data/universe-US_REAL.json> --out=docs/FUNDAMENTAL_DATA_COVERAGE.md` am ' + r.generatedAt.slice(0, 10) + '. Quellen: SEC-Verbraucherdateien (Projektion wie im Release), Discover-Aktiendateien, Wochenreihen mit Split-Beleg. ' + (r.universe ? 'Bewertungskennzahlen aus dem Screener-Universum (KBV, EV-Kennzahlen, Kurs/FCF, PEG) sind mitgezählt (`--universe=`).' : 'Bewertungskennzahlen aus dem Screener-Universum (KBV, EV-Kennzahlen, Kurs/FCF, PEG) sind nicht gezählt (ohne `--universe=`).'), '');
  L.push('## Umfang', '');
  L.push('| | Anzahl |', '|---|---:|');
  L.push('| Discover-Aktiendateien | ' + r.stats.stocks + ' |', '| mit SEC-Historie (Projektion) | ' + r.stats.projected + ' |', '| ohne SEC-Geschäftszahlen | ' + r.stats.noFundamentals + ' |', '| SEC-Datei ohne Jahres-/Quartalsreihen | ' + r.stats.invalid + ' |');
  L.push('| Geschäftsjahre je Unternehmen (Median / 10 % / 90 %) | ' + quant(r.depth.years, 0.5) + ' / ' + quant(r.depth.years, 0.1) + ' / ' + quant(r.depth.years, 0.9) + ' |');
  L.push('| Eigenständige Quartale je Unternehmen (Median / 90 %) | ' + quant(r.depth.quarters, 0.5) + ' / ' + quant(r.depth.quarters, 0.9) + ' |', '');
  L.push('Die SEC-Verbraucherdateien führen höchstens die letzten acht bis zehn Quartale; ältere Quartale liegen nicht vor.', '');
  L.push('## Kennzahlen', '');
  L.push('Aktueller Wert = LTM, letztes Geschäftsjahr oder Kurs; Jahre = Geschäftsjahre mit Wert (Median über Unternehmen mit Reihe).', '');
  L.push('| Kennzahl | aktueller Wert | Jahre (Median) | auch quartalsweise |', '|---|---:|---:|---:|');
  for (const m of C.METRICS) {
    const p = r.per[m.id];
    L.push('| ' + LABEL[m.id] + ' | ' + pct(p.cur, r.issuers) + ' | ' + (m.id === 'pe' ? 'aktuell + geprüfte GJ (unten)' : m.snap ? 'nur aktuell' : (quant(p.years, 0.5) ?? '–')) + ' | ' + (m.q ? pct(p.quarterly, r.issuers) : '–') + ' |');
  }
  L.push('', '## Konsistenz Jahr gegen Quartale', '');
  L.push('Geschäftsjahre, für die alle vier eigenständigen Quartale vorliegen: Summe der Quartale gegen den Jahreswert, Toleranz ' + Math.round(C.QUARTER_TOL * 100) + ' %. Unstimmige Geschäftsjahre werden in Fundamental nicht quartalsweise gezeigt (`catalog.js#quarterMismatch`, Grund „Quartale ergeben nicht den Jahreswert“); der Jahreswert bleibt.', '');
  L.push('| Kennzahl | geprüfte Jahre | stimmig | gesperrt | betroffene Unternehmen |', '|---|---:|---:|---:|---:|');
  for (const [m, k] of Object.entries(r.cons)) L.push('| ' + LABEL[m] + ' | ' + k.years + ' | ' + pct(k.ok, k.years) + ' | ' + k.blocked + ' | ' + k.issuers + ' |');
  L.push('', 'LTM-Umsatz gegen Summe der letzten vier Quartale (Toleranz 0,5 %): ' + pct(r.ttm.ok, r.ttm.checked) + ' von ' + r.ttm.checked + ' Unternehmen stimmig.', '');
  L.push('## Historisches KGV', '');
  L.push('Regel: `fundamental/engine/catalog.js#historicalPe` (Split-Beleg des Kursanbieters, Bereinigung nur für Splits nach dem Meldedatum, Gegenprobe Nettogewinn ÷ bereinigte Aktienzahl ±' + Math.round(C.PE_TOLERANCE * 100) + ' %, keine Aktienbasis-Sprünge, Wochenschluss ≤ 10 Tage vor GJ-Ende, positiver Gewinn).', '');
  L.push('| | Wert |', '|---|---:|', '| Unternehmen mit Kursreihe (USD-Bericht) | ' + r.pe.issuers + ' |', '| davon mindestens ein geprüftes Jahr | ' + r.pe.withYear + ' (' + pct(r.pe.withYear, r.pe.issuers) + ') |', '| Geschäftsjahre gesamt | ' + r.pe.years + ' |', '| mit veröffentlichtem KGV | ' + r.pe.verified + ' (' + pct(r.pe.verified, r.pe.years) + ') |');
  for (const [k, v] of Object.entries(r.pe.reasons).sort((a, b) => b[1] - a[1])) L.push('| leer: ' + C.reason(k) + ' | ' + v + ' |');
  L.push('', '## Repräsentative Aktien', '');
  L.push('| Aktie | Währung | Geschäftsjahre | Quartale | Kennzahlen mit aktuellem Wert | Jahr = Σ Quartale | LTM = Σ 4 Q | KGV-Jahre geprüft | Aktienbasis-Sprünge | ohne Angabe |', '|---|---|---|---:|---:|---:|---|---:|---:|---|');
  for (const [t, s] of Object.entries(r.sample)) {
    if (!s) { L.push('| ' + t + ' | – | keine SEC-Historie | | | | | | | |'); continue; }
    L.push('| ' + t + ' | ' + s.currency + ' | ' + s.years + ' | ' + s.quarters + ' | ' + s.metrics + ' / ' + s.of + ' | ' + s.consistency + ' | ' + s.ttm + ' | ' + s.pe + ' | ' + s.splits + ' | ' + (s.missing.length ? s.missing.map((m) => LABEL[m]).join(', ') : '–') + ' |');
  }
  L.push('');
  return L.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => (process.argv.find((a) => a.startsWith('--' + k + '=')) || '').split('=').slice(1).join('=');
  const out = arg('out');
  if (!out) { console.error('--out=<datei.md> fehlt'); process.exit(2); }
  const r = await coverage({ root: arg('root') || '.', universe: arg('universe') ? resolve(arg('universe')) : null });
  await writeFile(resolve(out), markdown(r));
  if (arg('json')) await writeFile(resolve(arg('json')), JSON.stringify(r, null, 1));
  console.log('geschrieben: ' + out);
}
