// FUNDAMENTAL – Sind neue SEC-Zahlen auf der veroeffentlichten Seite angekommen? (Pruefung, liest nur)
//
// Nach einem erfolgreichen Lauf des Erzeugers (sec-consumer-fundamentals.yml) und dem
// folgenden Release (pages-release.yml) vergleicht diese Pruefung das Repository mit der
// Auslieferung:
//  1. /fundamental/data/history/status.json: Historie verfuegbar und mit demselben Stand der
//     Verbraucherdaten gebaut wie das Repository (consumerAsOf).
//  2. Stichprobe: Unternehmen, deren juengste 10-Q/10-K (laut taeglicher SEC-Pipeline,
//     quant/data/fundamentals/daily/state.json) jetzt in ihrer Verbraucherdatei steht – die
//     ausgelieferte Scherbe muss genau diese Meldung enthalten.
// Kein Schreiben, keine Korrektur. Exit 1, wenn die Auslieferung den Repository-Stand nicht zeigt.
//
// Aufruf: node scripts/fundamental/verify-publication.mjs [--root=.] [--base=https://research.visionuniverse.de] [--out=<datei.json>] [--sample=8]
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { consumerLatest, PERIODIC } from './sec-freshness.mjs';
const require = createRequire(import.meta.url);
const Identity = require('../../core/identity.js');

export const SCHEMA = 'vu-fundamental-publication-check-1.0.0';
export const DEFAULT_BASE = 'https://research.visionuniverse.de';
const DAY = 864e5;

/** Repository-Seite: Stand der Verbraucherdaten und Stichprobe frisch uebernommener Meldungen. */
export async function expected({ root, sample = 8 }) {
  const dir = join(root, 'quant/data/sec/consumer'), state = JSON.parse(await readFile(join(root, 'quant/data/fundamentals/daily/state.json'), 'utf8'));
  const latest = new Map(); let consumerAsOf = null;
  for (const n of (await readdir(dir)).filter((x) => /^CIK\d{10}\.json$/.test(x))) {
    let doc; try { doc = JSON.parse(await readFile(join(dir, n), 'utf8')); } catch { continue; }
    latest.set(n.slice(3, 13), consumerLatest(doc));
    if (doc.asOf && (!consumerAsOf || doc.asOf > consumerAsOf)) consumerAsOf = doc.asOf;
  }
  const tickers = await tickerByCik(root);
  const since = consumerAsOf ? new Date(Date.parse(consumerAsOf) - 10 * DAY).toISOString().slice(0, 10) : '';
  const adopted = [];
  for (const [cik, x] of Object.entries(state.ISSUER_LAST_PROCESSED || {})) {
    const have = latest.get(cik), t = tickers.get(cik);
    if (!have || !t || !PERIODIC.test(String(x?.LATEST_FORM || '')) || !(x.LATEST_FILED_AT >= since)) continue;
    if (have.accns.has(x.LATEST_ACCESSION)) adopted.push({ cik, ticker: t, form: x.LATEST_FORM, filed: x.LATEST_FILED_AT, accession: x.LATEST_ACCESSION });
  }
  adopted.sort((a, b) => b.filed.localeCompare(a.filed) || a.ticker.localeCompare(b.ticker));
  return { consumerAsOf, sample: adopted.slice(0, sample), adoptedRecently: adopted.length };
}
async function tickerByCik(root) {
  const out = new Map(), dir = join(root, 'discover/data/stocks/US_REAL');
  if (!existsSync(dir)) return out;
  for (const n of (await readdir(dir)).filter((x) => /^[A-Z0-9.-]+\.json$/.test(x))) {
    try { const d = JSON.parse(await readFile(join(dir, n), 'utf8')); const c = d?.fundamentals?.cik; if (/^\d{10}$/.test(c || '') && !out.has(c)) out.set(c, d.symbol); } catch { /* weiter */ }
  }
  return out;
}

/** Auslieferung gegen Erwartung. fetchImpl: (url) -> Promise<Response> (Tests: Attrappe). */
export async function check({ want, base = DEFAULT_BASE, fetchImpl = fetch }) {
  const checks = [];
  const get = async (path) => { const r = await fetchImpl(base + path, { headers: { 'cache-control': 'no-cache' } }); if (!r.ok) throw Error('HTTP ' + r.status + ' ' + path); return r; };
  try {
    const st = await (await get('/fundamental/data/history/status.json?t=' + Date.now())).json();
    checks.push({ check: 'status', ok: st.state === 'AVAILABLE' && st.consumerAsOf === want.consumerAsOf, published: st.consumerAsOf || null, expected: want.consumerAsOf });
  } catch (e) { checks.push({ check: 'status', ok: false, error: e.message }); }
  for (const s of want.sample) {
    try {
      const buf = Buffer.from(await (await get('/fundamental/data/history/' + Identity.shardKey(s.ticker) + '.json.gz?t=' + Date.now())).arrayBuffer());
      const h = JSON.parse(gunzipSync(buf)).issuers?.[s.ticker];
      checks.push({ check: 'filing', ticker: s.ticker, form: s.form, filed: s.filed, accession: s.accession, ok: !!h && (h.filings || []).some((f) => f[0] === s.accession) });
    } catch (e) { checks.push({ check: 'filing', ticker: s.ticker, form: s.form, filed: s.filed, accession: s.accession, ok: false, error: e.message }); }
  }
  return { schema: SCHEMA, checkedAt: new Date().toISOString(), base, consumerAsOf: want.consumerAsOf, adoptedRecently: want.adoptedRecently, ok: checks.length > 0 && checks.every((c) => c.ok), checks };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => (process.argv.find((a) => a.startsWith('--' + k + '=')) || '').split('=').slice(1).join('=');
  const want = await expected({ root: resolve(arg('root') || '.'), sample: Number(arg('sample') || 8) });
  const r = await check({ want, base: arg('base') || DEFAULT_BASE });
  if (arg('out')) await writeFile(resolve(arg('out')), JSON.stringify(r, null, 1));
  console.log(JSON.stringify({ ok: r.ok, consumerAsOf: r.consumerAsOf, checks: r.checks.map((c) => (c.ok ? 'ok ' : 'FEHLT ') + (c.ticker ? c.ticker + ' ' + c.form + ' ' + c.filed + (c.error ? ' ' + c.error : '') : 'status ' + (c.published || c.error))) }));
  process.exit(r.ok ? 0 : 1);
}
