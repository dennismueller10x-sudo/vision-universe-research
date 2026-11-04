#!/usr/bin/env node
/*
 * Tiingo Corporate Actions – kontrollierter Funktionstest (Eigentuemerfreigabe 04.11.2026).
 *
 * Hoechstens DREI Anfragen an api.tiingo.com, fest im Code, sequentiell, ohne Wiederholung,
 * Zeitlimit je Anfrage. Der Schluessel geht nur im Header mit, nie in URL oder Log.
 *
 * Datenschutz (oeffentliches Repository): Rohantworten und rohe Corporate-Action-Werte werden
 * weder ausgegeben noch gespeichert. Ausgegeben werden nur abgeleitete Groessen:
 * HTTP-Status, Anzahl Datensaetze, Feldnamen/Typen (Schema), Statuszaehlung und je Vergleich
 * Treffer-Booleans gegen den bereits im Repository liegenden EOD-splitFactor
 * (quant/data/market/discover-series-long/<id>.json, corporateActions.splits) sowie gegen die
 * offenen Quant-CA-Faelle (docs/quant-recovery/v10/corporate-actions/verdicts.json).
 * Nichts wird committet, kein Artefakt hochgeladen.
 *
 * Aufruf:  TIINGO_API_KEY=... node scripts/research/tiingo-ca-probe.mjs [--root <repo>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_REQUESTS = 3;
export const TIMEOUT_MS = 20000;
export const GAP_MS = 1500;
const BASE = 'https://api.tiingo.com/tiingo/corporate-actions';

/* Die drei Anfragen, vorab festgelegt. Je Ticker die ganze Split-Historie ab startExDate. */
export const REQUESTS = Object.freeze([
  Object.freeze({ id: 'R1-AAPL', role: 'KONTROLLE_AKTIV_VORWAERTS', ticker: 'aapl', securityId: 'ref_AAPL', startExDate: '1980-01-01' }),
  Object.freeze({ id: 'R2-GE', role: 'KONTROLLE_REVERSE_UND_SPINOFF', ticker: 'ge', securityId: 'ref_GE', startExDate: '1980-01-01' }),
  Object.freeze({ id: 'R3-ACCS', role: 'OFFENER_FALL_2006_2012', ticker: 'accs', securityId: 'ref_ACCS', startExDate: '2000-01-01' }),
]);

const DAY = 86400000;
const d10 = (x) => String(x ?? '').slice(0, 10);
const t = (s) => Date.parse(s + 'T00:00:00Z');
const relEq = (a, b, tol = 1e-4) => Number.isFinite(a) && Number.isFinite(b) && b !== 0 && Math.abs(a - b) / Math.abs(b) <= tol;

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
      sent += 1; // vor dem Senden zaehlen: auch ein Fehlschlag verbraucht die Anfrage
      const t0 = Date.now();
      try {
        const r = await fetchImpl(url, { headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
        const text = await r.text();
        return { status: r.status, ok: r.ok, contentType: String(r.headers?.get?.('content-type') || '').split(';')[0], bytes: Buffer.byteLength(text), text, ms: Date.now() - t0 };
      } catch (e) {
        return { status: null, ok: false, error: String(e?.name || 'Error'), ms: Date.now() - t0 }; // keine Meldungstexte
      }
    },
  };
}

export function schemaOf(records) {
  const fields = {};
  for (const r of records) for (const [k, v] of Object.entries(r || {})) {
    const ty = v === null ? 'null' : typeof v;
    (fields[k] ||= new Set()).add(ty);
  }
  return Object.fromEntries(Object.keys(fields).sort().map((k) => [k, [...fields[k]].sort().join('|')]));
}

const factorOf = (rec) => {
  const f = Number(rec.splitFactor);
  if (Number.isFinite(f) && f > 0) return f;
  const a = Number(rec.splitTo), b = Number(rec.splitFrom);
  return Number.isFinite(a) && Number.isFinite(b) && b > 0 ? a / b : NaN;
};

/* Vergleich einer Ticker-Antwort mit dem EOD-splitFactor und den Bewegungswochen derselben Reihe. */
export function compare(records, series, openWeeks) {
  const ca = records.map((r) => ({ exDate: d10(r.exDate), factor: factorOf(r), status: String(r.splitStatus ?? '?').toLowerCase(),
    selfConsistent: relEq(Number(r.splitFactor), Number(r.splitTo) / Number(r.splitFrom), 1e-6) }));
  const active = ca.filter((x) => x.status !== 'c');
  const eod = (series?.corporateActions?.splits || []).map(([date, f]) => ({ date: d10(date), factor: Number(f) }));
  const from = d10(series?.from), to = d10(series?.to);
  const used = new Set();
  const eodEvents = eod.map((e) => {
    const exact = active.findIndex((x) => x.exDate === e.date);
    const near = exact >= 0 ? exact : active.findIndex((x) => Math.abs(t(x.exDate) - t(e.date)) <= 3 * DAY);
    if (near >= 0) used.add(near);
    const m = near >= 0 ? active[near] : null;
    return { eodDate: e.date, dateExact: exact >= 0, dateWithin3d: near >= 0, ratioMatch: !!m && relEq(m.factor, e.factor, 1e-4), ratioMatchLoose: !!m && relEq(m.factor, e.factor, 1e-2) };
  });
  const caOnly = active.filter((_, i) => !used.has(i));
  const moves = (series?.corporateActions?.moves || []).map((mv) => {
    const W = t(d10(mv.week));
    const inWeek = active.filter((x) => t(x.exDate) <= W && t(x.exDate) > W - 7 * DAY);
    const nearWeek = active.filter((x) => Math.abs(t(x.exDate) - W) <= 10 * DAY);
    const explains = inWeek.some((x) => Number.isFinite(x.factor) && Math.abs(Math.log(Number(mv.weeklyRatio) * x.factor)) <= Math.log(1.25));
    const onJumpDay = inWeek.some((x) => x.exDate === d10(mv.maxDailyDate));
    return { week: d10(mv.week), openQuantCase: openWeeks.has(d10(mv.week)), caSplitInWeek: inWeek.length > 0, caSplitWithin10d: nearWeek.length > 0, onJumpDay, factorExplainsMove: explains };
  });
  return {
    caRecords: ca.length,
    caStatus: ca.reduce((o, x) => ((o[x.status === 'a' ? 'active' : x.status === 'c' ? 'cancelled' : 'other'] += 1), o), { active: 0, cancelled: 0, other: 0 }),
    splitFactorEqualsToOverFrom: ca.filter((x) => x.selfConsistent).length,
    eodEvents: eod.length,
    eodMatchedExactDateAndRatio: eodEvents.filter((e) => e.dateExact && e.ratioMatch).length,
    eodEventsDetail: eodEvents,
    caOnly: {
      total: caOnly.length,
      beforeSeriesStart: caOnly.filter((x) => from && x.exDate < from).length,
      withinSeries: caOnly.filter((x) => (!from || x.exDate >= from) && (!to || x.exDate <= to)).length,
      afterSeriesEnd: caOnly.filter((x) => to && x.exDate > to).length,
    },
    moveWeeks: moves.length,
    moveWeeksDetail: moves,
  };
}

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

export async function run({ root, key, fetchImpl, log = console.log, sleep }) {
  const verdicts = readJson(path.join(root, 'docs/quant-recovery/v10/corporate-actions/verdicts.json'));
  const vrows = verdicts.rows.map((r) => Object.fromEntries(verdicts.columns.map((c, i) => [c, r[i]])));
  const client = createClient({ key, fetchImpl, sleep });
  const out = { schema: 'tiingo-ca-probe-public-1.0.0', maxRequests: MAX_REQUESTS, timeoutMs: TIMEOUT_MS, retries: 0, requests: [] };
  for (const q of REQUESTS) {
    const url = `${BASE}/${q.ticker}/splits?startExDate=${q.startExDate}`;
    const r = await client.get(url);
    const row = { id: q.id, role: q.role, securityId: q.securityId, httpStatus: r.status, ok: r.ok, ms: r.ms, error: r.error || null, contentType: r.contentType || null, bytes: r.bytes ?? null };
    if (r.ok) {
      let parsed = null;
      try { parsed = JSON.parse(r.text); } catch { row.parse = 'NOT_JSON'; }
      if (parsed !== null) {
        const records = Array.isArray(parsed) ? parsed : null;
        row.shape = Array.isArray(parsed) ? 'array' : typeof parsed;
        if (records) {
          row.schema = schemaOf(records);
          row.permaTickerPresent = records.length > 0 && records.every((x) => typeof x?.permaTicker === 'string' && x.permaTicker.length > 0);
          row.tickerFieldMatchesRequest = records.length > 0 && records.every((x) => String(x?.ticker || '').toLowerCase() === q.ticker);
          const sPath = path.join(root, 'quant/data/market/discover-series-long', `${q.securityId}.json`);
          const series = fs.existsSync(sPath) ? readJson(sPath) : null;
          const openWeeks = new Set(vrows.filter((v) => v.securityId === q.securityId && v.verdict !== 'GENUINE_MOVE').map((v) => d10(v.week)));
          row.openQuantCases = openWeeks.size;
          row.comparison = compare(records, series, openWeeks);
        } else {
          row.topLevelKeys = parsed && typeof parsed === 'object' ? Object.keys(parsed).sort() : [];
        }
      }
    }
    delete r.text; // Rohantwort sofort verwerfen
    out.requests.push(row);
    log(`${q.id}: HTTP ${row.httpStatus ?? row.error}`);
  }
  out.requestsSent = client.sent;
  out.accessWorks = out.requests.some((x) => x.httpStatus === 200 && x.shape === 'array');
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--root');
  const root = i > 0 ? process.argv[i + 1] : process.cwd();
  if (process.env.PROBE_ALLOW_RUN !== 'once') { console.error('PROBE_NOT_ALLOWED'); process.exit(3); }
  run({ root, key: process.env.TIINGO_API_KEY, fetchImpl: globalThis.fetch })
    .then((out) => {
      const json = JSON.stringify(out, null, 1);
      console.log(json);
      if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## Tiingo CA Probe (nur abgeleitete Werte)\n\n```json\n' + json + '\n```\n');
      process.exit(out.requestsSent <= MAX_REQUESTS ? 0 : 9);
    })
    .catch((e) => { console.error('PROBE_FAILED', String(e?.message || e).replace(/Token\s+\S+/g, 'Token ***')); process.exit(1); });
}
