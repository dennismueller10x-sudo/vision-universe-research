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
  const val = {}; Object.keys(C.HIST_VAL).forEach((id) => { val[id] = { issuers: 0, withYear: 0, years: 0, verified: 0, reasons: {} }; });
  const depth = { years: [], quarters: [] }, sample = {};
  for (const [t, h] of issuers) {
    const stock = JSON.parse(await readFile(join(root, 'discover/data/stocks/US_REAL', t + '.json'), 'utf8'));
    const b = C.fromHistory(h, stock); if (!b) continue;
    depth.years.push(b.years.length); depth.quarters.push(b.quarters.length);
    // Gepruefte Bewertung nach jedem Jahresbericht (wie die Seite nach dem Laden der Wochenreihe)
    const lp = stock.series && stock.series.long && C.longSeriesPath(stock.series.long.path);
    const long = lp && existsSync(join(root, lp.slice(1))) ? JSON.parse(await readFile(join(root, lp.slice(1)), 'utf8')) : null;
    const hv = long ? C.attachValuation(b, long) : null;
    if (hv && !hv.reason) for (const [id, k] of Object.entries(val)) {
      const rows = hv.full[id] || []; k.issuers++;
      if (rows.some((r) => isNum(r.v))) k.withYear++;
      for (const r of rows) { k.years++; if (isNum(r.v)) k.verified++; else if (r.reason) k.reasons[r.reason] = (k.reasons[r.reason] || 0) + 1; }
    }
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
    let ph = null;
    if (long && b.currency === 'USD') {
      ph = C.historicalPe(b, long);
      pe.issuers++;
      for (const r of ph.rows) { pe.years++; if (isNum(r.v)) pe.verified++; else pe.reasons[r.reason] = (pe.reasons[r.reason] || 0) + 1; }
      if (ph.state === 'AVAILABLE') pe.withYear++;
    }
    if (SAMPLE.includes(t)) {
      const c = FLOWS.flatMap((m) => quarterConsistency(b, m).concat((b.mismatch[m] || []).map(() => ({ ok: false }))));
      sample[t] = { currency: b.currency, years: b.years.length ? b.years[0] + '–' + b.years[b.years.length - 1] : '–', quarters: b.quarters.length,
        metrics: cat.filter((x) => isNum(x.cur.v)).length, of: cat.length, missing: cat.filter((x) => !x.available).map((x) => x.def.id),
        consistency: c.length ? c.filter((x) => x.ok).length + '/' + c.length : '–', ttm: tc ? (tc.ok ? 'ok' : 'Abweichung') : '–',
        pe: ph ? ph.rows.filter((r) => isNum(r.v)).length + '/' + ph.rows.length : (b.currency !== 'USD' ? 'nicht USD' : '–'), splits: b.splits.length,
        history: cat.filter((x) => x.rows.filter((r) => isNum(r.v)).length > 1).length,
        valuation: hv && !hv.reason ? ['ps', 'pb', 'ev_ebitda'].map((id) => (hv.series[id] || []).filter((r) => isNum(r.v)).length).join(' / ') : hv ? C.reason(hv.reason) : '–' };
    }
  }
  for (const t of SAMPLE) if (!sample[t]) sample[t] = null;
  return { generatedAt: new Date().toISOString(), universe: !!U, stats, issuers: issuers.length, per, cons, ttm, pe, val, depth, sample };
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
    L.push('| ' + LABEL[m.id] + ' | ' + pct(p.cur, r.issuers) + ' | ' + (m.snap && !m.hist ? 'nur aktuell' : (quant(p.years, 0.5) ?? '–') + (m.hist ? ' (geprüft, je Jahresbericht)' : '')) + ' | ' + (m.q ? pct(p.quarterly, r.issuers) : '–') + ' |');
  }
  L.push('', '## Konsistenz Jahr gegen Quartale', '');
  L.push('Geschäftsjahre, für die alle vier eigenständigen Quartale vorliegen: Summe der Quartale gegen den Jahreswert, Toleranz ' + Math.round(C.QUARTER_TOL * 100) + ' %. Unstimmige Geschäftsjahre werden in Fundamental nicht quartalsweise gezeigt (`catalog.js#quarterMismatch`, Grund „Quartale ergeben nicht den Jahreswert“); der Jahreswert bleibt.', '');
  L.push('| Kennzahl | geprüfte Jahre | stimmig | gesperrt | betroffene Unternehmen |', '|---|---:|---:|---:|---:|');
  for (const [m, k] of Object.entries(r.cons)) L.push('| ' + LABEL[m] + ' | ' + k.years + ' | ' + pct(k.ok, k.years) + ' | ' + k.blocked + ' | ' + k.issuers + ' |');
  L.push('', 'LTM-Umsatz gegen Summe der letzten vier Quartale (Toleranz 0,5 %): ' + pct(r.ttm.ok, r.ttm.checked) + ' von ' + r.ttm.checked + ' Unternehmen stimmig.', '');
  L.push('## Historisches KGV', '');
  L.push('Regel: `fundamental/engine/catalog.js#historicalPe` (Split-Beleg des Kursanbieters, Bereinigung nur für Splits nach dem Meldedatum, Gegenprobe Nettogewinn ÷ bereinigte Aktienzahl ±' + Math.round(C.PE_TOLERANCE * 100) + ' %, keine Aktienbasis-Sprünge, erster Wochenschluss ≤ 10 Tage nach dem 10-K, positiver Gewinn).', '');
  L.push('| | Wert |', '|---|---:|', '| Unternehmen mit Kursreihe (USD-Bericht) | ' + r.pe.issuers + ' |', '| davon mindestens ein geprüftes Jahr | ' + r.pe.withYear + ' (' + pct(r.pe.withYear, r.pe.issuers) + ') |', '| Geschäftsjahre gesamt | ' + r.pe.years + ' |', '| mit veröffentlichtem KGV | ' + r.pe.verified + ' (' + pct(r.pe.verified, r.pe.years) + ') |');
  for (const [k, v] of Object.entries(r.pe.reasons).sort((a, b) => b[1] - a[1])) L.push('| leer: ' + C.reason(k) + ' | ' + v + ' |');
  L.push('', '## Bewertung nach jedem Jahresbericht', '');
  L.push('Regel: `fundamental/engine/catalog.js#historicalValuation`. Kurs = erster Wochenschluss nach Einreichung des 10-K (≤ 10 Tage danach, splitbereinigt), also ohne Kenntnis späterer Zahlen; ausstehende Aktien und Bilanz dieses Geschäftsjahres, Umsatz/EBITDA/Free Cashflow/Dividenden des Geschäftsjahres. Aktienzahl nur um Splits nach ihrem Meldedatum bereinigt; Gegenprobe gegen die bereinigte verwässerte Durchschnittszahl ±' + Math.round(C.SHARE_TOLERANCE * 100) + ' %, kein Sprung in Split-Größe. Unternehmenswert = Börsenwert + Finanzschulden − Zahlungsmittel. Nur USD-Berichte.', '');
  L.push('| Kennzahl | Unternehmen geprüft | mit ≥ 1 Jahr | Geschäftsjahre | mit Wert | häufigste Gründe für Lücken |', '|---|---:|---:|---:|---:|---|');
  for (const [id, k] of Object.entries(r.val)) {
    const top = Object.entries(k.reasons).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => C.reason(c) + ' (' + n + ')').join(', ');
    L.push('| ' + LABEL[id] + ' | ' + k.issuers + ' | ' + k.withYear + ' (' + pct(k.withYear, k.issuers) + ') | ' + k.years + ' | ' + k.verified + ' (' + pct(k.verified, k.years) + ') | ' + (top || '–') + ' |');
  }
  L.push('', 'Nicht berechnet: PEG (braucht je Stichtag ein dreijähriges, splitfestes Wachstum des Gewinns je Aktie) und Verhältnisse für Berichte in anderer Währung als US-Dollar (kein Wechselkurs je Stichtag in der Auslieferung).', '');
  L.push('## Zählung im Kennzahlenkatalog', '');
  L.push('Der Katalog definiert ' + C.METRICS.length + ' Kennzahlen (Gewinnrendite und Kurs/Free Cashflow sind als Kehrwerte von KGV und Free-Cashflow-Rendite entfernt). Je Aktie zeigt die Kopfzeile drei Zahlen: definiert, mit Wert für dieses Unternehmen (aktueller Wert oder mindestens ein Jahreswert) und mit Verlauf (mindestens zwei Jahreswerte). Ohne Wert zählt eine Kennzahl nicht als verfügbar; sie steht unter „Ohne Angabe“ mit Grund.', '');
  L.push('Die frühere Anzeige „56“ bei NVDA stammte aus einer Zählung vor dem Laden der Vergleichsdaten (KBV, EV-Kennzahlen, Kurs/FCF, PEG kommen aus dem Screener-Universum); die Kopfzeile wurde danach nicht aktualisiert. Jetzt wird erst gezählt, wenn Vergleichsdaten und Kursreihe geladen sind.', '');
  L.push('## Repräsentative Aktien', '');
  L.push('| Aktie | Währung | Geschäftsjahre | Quartale | aktueller Wert | mit Verlauf | Jahr = Σ Quartale | LTM = Σ 4 Q | KGV-Jahre geprüft | KUV / KBV / EV/EBITDA geprüfte Jahre | Aktienbasis-Sprünge | ohne Angabe |', '|---|---|---|---:|---:|---:|---:|---|---:|---|---:|---|');
  for (const [t, s] of Object.entries(r.sample)) {
    if (!s) { L.push('| ' + t + ' | – | keine SEC-Historie | | | | | | | | | |'); continue; }
    L.push('| ' + t + ' | ' + s.currency + ' | ' + s.years + ' | ' + s.quarters + ' | ' + s.metrics + ' / ' + s.of + ' | ' + s.history + ' | ' + s.consistency + ' | ' + s.ttm + ' | ' + s.pe + ' | ' + s.valuation + ' | ' + s.splits + ' | ' + (s.missing.length ? s.missing.map((m) => LABEL[m]).join(', ') : '–') + ' |');
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
