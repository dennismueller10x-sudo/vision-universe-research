#!/usr/bin/env node
/**
 * Holdout 2008–2015: Zusammenführung der beiden versiegelten Teile (Supertrader, Quant) nach dem Protokoll. Holm über die 12
 * primären Hypothesen, getrennt für Log- und Sharpe-Abstand; Urteil mit study.cjs#verdict. Forschung, nicht zertifiziert.
 *
 *   node scripts/research/holdout/combine.mjs --st <entschlüsselt st-holdout.json> --quant <entschlüsselt quant-holdout.json> \
 *        --out <Ordner außerhalb des Repos>
 *
 * Schreibt holdout-summary.sealed.owner.json (an den Owner-Schlüssel) und holdout-summary.public.json (nur Status, Hashes,
 * Zahl der Urteile je Klasse, keine Rendite und kein Urteil je Methode). Den Klartext nie committen.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const require = createRequire(import.meta.url);
const S = require('../edge/study.cjs');
const PIN = require('./protocol-pin.cjs');
const sha = (x) => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');

/** Primäre Hypothesen in Protokollreihenfolge: [{ id, metrics, spy, test }]. */
export function hypotheses(st, quant) {
  if (st.protocolSha256 !== PIN.PROTOCOL_SHA256 || quant.protocolSha256 !== PIN.PROTOCOL_SHA256) throw new Error('PROTOCOL_MISMATCH');
  const rows = st.methods.map((k) => { const x = st.stats[k]; return { id: x.candidateId, key: k, family: 'supertrader', metrics: x.metrics, spy: x.spy, test: x.test, weeks: x.weeks, from: x.from, to: x.to }; });
  const q = quant.primary, ev = q.evaluation || {};
  let test = null;
  try { test = S.pairedTest(q.weeklyReturns, q.spyWeeklyReturns); } catch { test = null; }
  rows.push({ id: quant.variant, key: quant.variant, family: 'quant', metrics: ev.strategy ?? null, spy: ev.SPY ?? null, test, weeks: ev.weeks ?? null, from: ev.dates?.[0] ?? null, to: ev.dates?.[1] ?? null });
  return rows;
}
export function combine(st, quant) {
  const rows = hypotheses(st, quant);
  if (rows.length !== 12) throw new Error(`HYPOTHESES_NOT_12 ${rows.length}`);
  const pl = rows.map((r) => (r.test ? r.test.pLog : 1)), ps = rows.map((r) => (r.test ? r.test.pSharpe : 1));
  const hl = S.holm(pl), hs = S.holm(ps);
  const out = rows.map((r, i) => ({ ...r, pLogRaw: pl[i], pSharpeRaw: ps[i], pLogHolm: hl[i], pSharpeHolm: hs[i], verdict: r.test ? S.verdict(r.metrics, r.spy, hl[i], hs[i]) : 'nicht bestimmbar (blockiert)', rawAboveSpy: !!(r.metrics && r.spy && r.metrics.cagr > r.spy.cagr) }));
  const tally = out.reduce((o, r) => { o[r.verdict] = (o[r.verdict] || 0) + 1; return o; }, {});
  return { schema: 'vu-holdout-summary-1.0.0', label: 'Forschung, nicht zertifiziert', protocolSha256: PIN.PROTOCOL_SHA256, hypotheses: out, tally, beatsSpy: out.filter((r) => r.verdict === 'schlägt').map((r) => r.id), rawAboveSpy: out.filter((r) => r.rawAboveSpy).map((r) => r.id), inputs: { stResultSha256: st.receipt?.resultSha256 ?? null, quantResultSha256: quant.receipt?.resultSha256 ?? null } };
}

async function main() {
  const argv = process.argv.slice(2), arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const out = path.resolve(arg('--out') || '');
  if (!arg('--out') || out === ROOT || out.startsWith(ROOT + path.sep)) throw new Error('OUT_OUTSIDE_REPOSITORY_REQUIRED');
  const st = JSON.parse(fs.readFileSync(arg('--st'), 'utf8')), quant = JSON.parse(fs.readFileSync(arg('--quant'), 'utf8'));
  const sum = combine(st, quant);
  const L = await import(path.join(ROOT, 'scripts/supertrader/validation/lib.mjs'));
  fs.mkdirSync(out, { recursive: true });
  const plain = JSON.stringify(sum);
  fs.writeFileSync(path.join(out, 'holdout-summary.sealed.owner.json'), L.encryptForOwner(fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8'), Buffer.from(plain)));
  fs.writeFileSync(path.join(out, 'holdout-summary.json'), plain);
  fs.writeFileSync(path.join(out, 'holdout-summary.public.json'), JSON.stringify({ schema: 'vu-holdout-summary-public-1.0.0', label: sum.label, protocolSha256: sum.protocolSha256, hypotheses: sum.hypotheses.length, privateSha256: sha(plain), inputs: sum.inputs }, null, 1) + '\n');
  console.log(JSON.stringify({ hypotheses: sum.hypotheses.length, privateSha256: sha(plain) }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
