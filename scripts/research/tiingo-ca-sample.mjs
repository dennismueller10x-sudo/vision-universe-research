#!/usr/bin/env node
/*
 * Tiingo Corporate Actions – gezielte Stichprobe (Eigentuemerfreigabe 04.11.2026: hoechstens 20 Anfragen
 * insgesamt; 3 verbraucht in Lauf 41780055920, hier also HOECHSTENS 17).
 *
 * 17 feste Ticker-Anfragen (ganze Split-Historie), sequentiell, ohne Wiederholung, Zeitlimit je Anfrage.
 * Abbruch ohne weitere Anfragen bei 401/402/403/429 (Abo-, Abrechnungs- oder Kontingentproblem).
 * Schluessel nur im Header.
 *
 * Datenschutz (oeffentliches Repository): keine Rohantwort, kein roher CA-Wert in Log oder Datei.
 * Ausgabe nur abgeleitet: Status, Anzahlen, Schema, Treffer-Booleans gegen den im Repository liegenden
 * EOD-splitFactor (quant/data/market/discover-series-long, corporateActions.splits / supplemented) und
 * Klassen je offenem Quant-Fall (docs/quant-recovery/v10/corporate-actions/verdicts.json, provider-errors.json).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUDGET_TOTAL = 20;
export const BUDGET_USED_BEFORE = 3; // Lauf 41780055920
export const MAX_REQUESTS = 17;
export const TIMEOUT_MS = 20000;
export const GAP_MS = 1200;
export const STOP_STATUSES = Object.freeze([401, 402, 403, 429]);
const BASE = 'https://api.tiingo.com/tiingo/corporate-actions';
if (BUDGET_USED_BEFORE + MAX_REQUESTS > BUDGET_TOTAL) throw new Error('BUDGET');

/* group: E4 = Quant-Anbieterfehler-Vorschlag, PZZA = SEC-ergaenzter Split (Positivkontrolle),
 * TECH = frischer Reverse-Split (Technical/S4), QUANT = meiste offene V10-Faelle 2004+ */
export const TICKERS = Object.freeze([
  ['gctk', 'E4'], ['govx', 'E4'], ['inbs', 'E4'], ['ino', 'E4'], ['mnpr', 'E4'], ['mtva', 'E4'], ['zone', 'E4'],
  ['pzza', 'SEC_SUPPLEMENT'],
  ['atyr', 'TECH'], ['omex', 'TECH'],
  ['atlx', 'QUANT'], ['poci', 'QUANT'], ['abvc', 'QUANT'], ['wksp', 'QUANT'], ['scnx', 'QUANT'], ['ped', 'QUANT'], ['txmd', 'QUANT'],
].map(([ticker, group]) => Object.freeze({ ticker, group, securityId: 'ref_' + ticker.toUpperCase(), startExDate: '1960-01-01' })));
if (TICKERS.length > MAX_REQUESTS) throw new Error('TOO_MANY_TICKERS');

const DAY = 86400000;
const d10 = (x) => String(x ?? '').slice(0, 10);
const t = (s) => Date.parse(s + 'T00:00:00Z');
const relEq = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && b !== 0 && Math.abs(a - b) / Math.abs(b) <= tol;
const explainsMove = (ratio, f) => Number.isFinite(ratio) && Number.isFinite(f) && f > 0 && Math.abs(Math.log(ratio * f)) <= Math.log(1.25);
const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; return o; };

export function createClient({ key, fetchImpl, cap = MAX_REQUESTS, timeoutMs = TIMEOUT_MS, gapMs = GAP_MS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  if (!key) throw new Error('NO_KEY');
  if (typeof fetchImpl !== 'function') throw new Error('NO_FETCH');
  let sent = 0;
  return {
    get sent() { return sent; },
    async get(url) {
      if (sent >= cap) throw new Error('REQUEST_CAP_REACHED');
      if (!url.startsWith(BASE + '/')) throw new Error('URL_NOT_ALLOWED');
      if (sent > 0) await sleep(gapMs);
      sent += 1; // vor dem Senden zaehlen
      const t0 = Date.now();
      try {
        const r = await fetchImpl(url, { headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
        const text = await r.text();
        return { status: r.status, ok: r.ok, bytes: Buffer.byteLength(text), text, ms: Date.now() - t0 };
      } catch (e) {
        return { status: null, ok: false, error: String(e?.name || 'Error'), ms: Date.now() - t0 };
      }
    },
  };
}

export function schemaOf(records) {
  const f = {};
  for (const r of records) for (const [k, v] of Object.entries(r || {})) (f[k] ||= new Set()).add(v === null ? 'null' : typeof v);
  return Object.fromEntries(Object.keys(f).sort().map((k) => [k, [...f[k]].sort().join('|')]));
}

const factorOf = (r) => { const f = Number(r.splitFactor); if (Number.isFinite(f) && f > 0) return f; const a = Number(r.splitTo), b = Number(r.splitFrom); return b > 0 ? a / b : NaN; };

/* Kern: Vergleich einer Ticker-Antwort mit EOD-Reihe, offenen Faellen und E4-Vorschlaegen. */
export function analyse(records, series, openCases, e4) {
  const ca = records.map((r) => ({ exDate: d10(r.exDate), factor: factorOf(r) })).filter((x) => x.exDate);
  const ca1 = ca.filter((x) => relEq(x.factor, 1, 1e-9)).length; // Faktor 1 waere kein Split
  const ev = ca.filter((x) => !relEq(x.factor, 1, 1e-9));
  const sAll = (series?.corporateActions?.splits || []).map(([date, f]) => ({ date: d10(date), factor: Number(f) }));
  const suppl = new Set((series?.corporateActions?.supplemented || []).map((s) => d10(s.date)));
  const from = d10(series?.from), to = d10(series?.to);
  const used = new Set();
  const eod = sAll.map((e) => {
    let i = ev.findIndex((x) => x.exDate === e.date);
    const exact = i >= 0;
    if (!exact) i = ev.findIndex((x, j) => !used.has(j) && Math.abs(t(x.exDate) - t(e.date)) <= 5 * DAY);
    if (i >= 0) used.add(i);
    const m = i >= 0 ? ev[i] : null;
    return { eodDate: e.date, kind: suppl.has(e.date) ? 'SEC_SUPPLEMENT' : 'PROVIDER_EOD', caDateExact: exact, caWithin5d: !!m,
      caRatioExact: !!m && relEq(m.factor, e.factor, 1e-4), caRatioLoose: !!m && relEq(m.factor, e.factor, 2e-2) };
  });
  const extra = ev.map((x, j) => ({ ...x, j })).filter((x) => !used.has(x.j));
  const moves = new Map((series?.corporateActions?.moves || []).map((m) => [d10(m.week), m]));
  const extraCls = { beforeSeriesStart: 0, afterSeriesEnd: 0, withinSeries: 0, withinSeriesInOpenCaseWeek: 0, withinSeriesInOtherMoveWeek: 0, withinSeriesExplainsWeekMove: 0 };
  for (const x of extra) {
    if (from && x.exDate < from) { extraCls.beforeSeriesStart++; continue; }
    if (to && x.exDate > to) { extraCls.afterSeriesEnd++; continue; }
    extraCls.withinSeries++;
    const wk = [...moves.keys()].find((w) => t(x.exDate) <= t(w) && t(x.exDate) > t(w) - 7 * DAY);
    if (wk && openCases.some((c) => c.week === wk)) extraCls.withinSeriesInOpenCaseWeek++;
    else if (wk) extraCls.withinSeriesInOtherMoveWeek++;
    if (wk && explainsMove(Number(moves.get(wk).weeklyRatio), x.factor)) extraCls.withinSeriesExplainsWeekMove++;
  }
  const eodDates = new Set(sAll.map((e) => e.date));
  const cases = openCases.map((c) => {
    const W = t(c.week);
    const inWeek = ev.filter((x) => t(x.exDate) <= W && t(x.exDate) > W - 7 * DAY);
    const near = ev.filter((x) => Math.abs(t(x.exDate) - W) <= 10 * DAY);
    const mv = moves.get(c.week);
    let cls;
    if (!inWeek.length) cls = near.length ? 'CA_EVENT_NEAR_NOT_IN_WEEK' : 'NO_CA_EVENT';
    else if (inWeek.every((x) => eodDates.has(x.exDate) || [...eodDates].some((d) => Math.abs(t(d) - t(x.exDate)) <= 5 * DAY))) cls = 'CA_EVENT_MIRRORS_EOD';
    else if (!mv) cls = 'CA_ONLY_EVENT_MOVE_GONE_IN_CURRENT_SERIES';
    else cls = inWeek.some((x) => explainsMove(Number(mv.weeklyRatio), x.factor)) ? 'CA_ONLY_EVENT_EXPLAINS_MOVE' : 'CA_ONLY_EVENT_NOT_EXPLAINING';
    const out = { week: c.week, verdict: c.verdict, cls, moveStillInCurrentSeries: !!mv };
    const p = e4.find((q) => q.week === c.week);
    if (p) out.e4ProposalFactorMatchesCa = inWeek.some((x) => relEq(x.factor, Number(p.factor), 2e-2)) || near.some((x) => relEq(x.factor, Number(p.factor), 2e-2));
    return out;
  });
  return {
    caEvents: ev.length, caFactorOne: ca1,
    eodEvents: sAll.length, eodSecSupplemented: eod.filter((e) => e.kind === 'SEC_SUPPLEMENT').length,
    eodMatchedExactDateAndRatio: eod.filter((e) => e.caDateExact && e.caRatioExact).length,
    eodDetail: eod, extraCaEvents: extra.length, extraCls, cases,
  };
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

export async function run({ root, key, fetchImpl, log = console.log, sleep }) {
  const V = readJson(path.join(root, 'docs/quant-recovery/v10/corporate-actions/verdicts.json'));
  const rows = V.rows.map((r) => Object.fromEntries(V.columns.map((c, i) => [c, r[i]])));
  const PE = readJson(path.join(root, 'docs/quant-recovery/v10/corporate-actions/provider-errors.json'));
  const client = createClient({ key, fetchImpl, sleep });
  const out = { schema: 'tiingo-ca-sample-public-1.0.0', budget: { total: BUDGET_TOTAL, usedBefore: BUDGET_USED_BEFORE, cap: MAX_REQUESTS }, retries: 0, stoppedBy: null, tickers: [] };
  for (const q of TICKERS) {
    if (out.stoppedBy) { out.tickers.push({ securityId: q.securityId, group: q.group, skipped: 'STOPPED' }); continue; }
    const r = await client.get(`${BASE}/${q.ticker}/splits?startExDate=${q.startExDate}`);
    const row = { securityId: q.securityId, group: q.group, httpStatus: r.status, error: r.error || null, ms: r.ms, bytes: r.bytes ?? null };
    if (STOP_STATUSES.includes(r.status)) out.stoppedBy = `HTTP_${r.status}`;
    if (r.ok) {
      let parsed = null;
      try { parsed = JSON.parse(r.text); } catch { row.parse = 'NOT_JSON'; }
      if (Array.isArray(parsed)) {
        row.records = parsed.length;
        row.schema = schemaOf(parsed);
        row.distinctPermaTickers = new Set(parsed.map((x) => x?.permaTicker).filter(Boolean)).size;
        row.tickerFieldMatchesRequest = parsed.every((x) => String(x?.ticker || '').toLowerCase() === q.ticker);
        const sp = path.join(root, 'quant/data/market/discover-series-long', `${q.securityId}.json`);
        const series = fs.existsSync(sp) ? readJson(sp) : null;
        row.seriesPresent = !!series;
        const open = rows.filter((v) => v.securityId === q.securityId && v.verdict !== 'GENUINE_MOVE').map((v) => ({ week: d10(v.week), verdict: v.verdict }));
        const e4 = (PE.proposals || []).filter((p) => p.securityId === q.securityId).map((p) => ({ week: d10(p.week), factor: p.proposal?.splitFactor }));
        row.openCases = open.length;
        row.analysis = analyse(parsed, series, open, e4);
      } else if (parsed !== null) row.shape = typeof parsed;
    }
    delete r.text;
    out.tickers.push(row);
    log(`${q.securityId}: HTTP ${row.httpStatus ?? row.error}`);
  }
  out.requestsSent = client.sent;
  // Zusammenfassung
  const S = { http: {}, eodEvents: 0, eodSecSupplemented: 0, eodMatchedExact: 0, eodDateMismatch: 0, eodRatioMismatch: 0, extraCaEvents: 0, extraCls: {}, casesByCls: {}, casesByVerdictCls: {}, e4FactorMatch: 0, e4Checked: 0, multiPermaTicker: 0 };
  for (const x of out.tickers) {
    inc(S.http, String(x.httpStatus ?? x.error ?? x.skipped));
    const a = x.analysis; if (!a) continue;
    if (x.distinctPermaTickers > 1) S.multiPermaTicker++;
    S.eodEvents += a.eodEvents; S.eodSecSupplemented += a.eodSecSupplemented; S.eodMatchedExact += a.eodMatchedExactDateAndRatio;
    S.eodDateMismatch += a.eodDetail.filter((e) => !e.caWithin5d).length;
    S.eodRatioMismatch += a.eodDetail.filter((e) => e.caWithin5d && !e.caRatioExact).length;
    S.extraCaEvents += a.extraCaEvents; for (const [k, v] of Object.entries(a.extraCls)) inc(S.extraCls, k, v);
    for (const c of a.cases) { inc(S.casesByCls, c.cls); inc(S.casesByVerdictCls, `${c.verdict}|${c.cls}`); if ('e4ProposalFactorMatchesCa' in c) { S.e4Checked++; if (c.e4ProposalFactorMatchesCa) S.e4FactorMatch++; } }
  }
  out.summary = S;
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--root');
  const root = i > 0 ? process.argv[i + 1] : process.cwd();
  if (process.env.SAMPLE_ALLOW_RUN !== 'once') { console.error('SAMPLE_NOT_ALLOWED'); process.exit(3); }
  run({ root, key: process.env.TIINGO_API_KEY, fetchImpl: globalThis.fetch })
    .then((out) => {
      const json = JSON.stringify(out, null, 1);
      console.log(json);
      if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## Tiingo CA Stichprobe (nur abgeleitete Werte)\n\n```json\n' + JSON.stringify(out.summary, null, 1) + '\n```\n');
      process.exit(out.requestsSent <= MAX_REQUESTS ? 0 : 9);
    })
    .catch((e) => { console.error('SAMPLE_FAILED', String(e?.message || e).replace(/Token\s+\S+/g, 'Token ***')); process.exit(1); });
}
