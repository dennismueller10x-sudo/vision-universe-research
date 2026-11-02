#!/usr/bin/env node
/**
 * Unabhaengiger Vorher/Nachher-Vergleich zweier oeffentlicher Validierungsausgaben (`*.public.json`), C09-Neulauf.
 *
 * Liest nur den oeffentlichen Block: Zaehlungen, Reason Codes und Hashes. Rohkurse, Minutenwerte, Ticker und
 * Kennzahlen stehen dort nicht und werden hier weder gelesen noch ausgegeben. Eingaben sind entweder die
 * `*.public.json` selbst oder das Actions-Log eines Laufs (der Workflow gibt die Datei mit `cat` aus).
 *
 *   node scripts/supertrader/validation/compare-public-runs.mjs --before <log|json> --after <log|json> [--out <file>]
 *
 * Schemas: supertrader-kk-intraday-public-1.0.0 (C09/C10) und supertrader-sf5-lifecycle-public-1.0.0 (SF5).
 * Das Ergebnis ist ein Aggregat; ein Vergleich ist nur gueltig, wenn die Eingaben identisch sind (inputsEqual).
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const KK = 'supertrader-kk-intraday-public-1.0.0';
const SF5 = 'supertrader-sf5-lifecycle-public-1.0.0';

/** Laufbezogene Quittungsfelder, die sich bei jedem Lauf aendern duerfen (keine Eingabe). */
const RUN_FIELDS = new Set(['runId', 'commit', 'researchCodeSha256', 'codeVersionChanged']);

/** Kanonisches JSON (Schluessel sortiert), damit der Hash nicht von der Ausgabereihenfolge abhaengt. */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
export const hashOf = (v) => crypto.createHash('sha256').update(canonical(v)).digest('hex');

/** Den oeffentlichen JSON-Block aus einem Actions-Log lesen (Zeilen nach "done; public ...", bis zur naechsten Gruppe). */
export function publicFromLog(text) {
  const lines = text.split('\n').map((l) => l.replace(/^[^\t]*\t[^\t]*\t﻿?\d{4}-\d\d-\d\dT[\d:.]+Z ?/, '').replace(/^﻿?\d{4}-\d\d-\d\dT[\d:.]+Z ?/, ''));
  const i = lines.findIndex((l) => /done; public \S+\.public\.json/.test(l));
  if (i < 0) throw new Error('PUBLIC_BLOCK_NOT_FOUND');
  const buf = [];
  for (let j = i + 1; j < lines.length; j++) { if (lines[j].startsWith('##[')) break; buf.push(lines[j]); }
  return JSON.parse(buf.join('\n'));
}

export function readPublic(file) {
  const text = fs.readFileSync(file, 'utf8');
  return /^\s*\{/.test(text) ? JSON.parse(text) : publicFromLog(text);
}

/** Pfade der Blaetter, in denen sich a und b unterscheiden (fehlende Schluessel zaehlen als Unterschied). */
export function diffPaths(a, b, pre = '') {
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const out = [];
    for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) out.push(...diffPaths(a[k], b[k], pre ? `${pre}.${k}` : k));
    return out;
  }
  return canonical(a) === canonical(b) ? [] : [pre];
}

/** Zaehler-Differenz je Schluessel (nachher - vorher), nur Schluessel mit Aenderung. */
export function countDelta(a = {}, b = {}) {
  const out = {};
  for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) { const d = (b[k] ?? 0) - (a[k] ?? 0); if (d) out[k] = d; }
  return out;
}

function receiptInputs(r) { const o = {}; for (const [k, v] of Object.entries(r ?? {})) if (!RUN_FIELDS.has(k)) o[k] = v; return o; }

/** Ein EP-Varianten-Block (Lifecycle-Engine, INTRADAY_RESOLVED): Zaehlungen und Hashes vorher/nachher. */
export function epVariantRow(before, after) {
  const b = before ?? {}, a = after ?? {};
  return {
    trades: [b.trades ?? null, a.trades ?? null], closed: [b.closed ?? null, a.closed ?? null], openAtDataEnd: [b.openAtDataEnd ?? null, a.openAtDataEnd ?? null],
    tradesSha256Equal: b.tradesSha256 !== undefined && b.tradesSha256 === a.tradesSha256,
    ledgerSha256Equal: b.ledgerSha256 !== undefined && b.ledgerSha256 === a.ledgerSha256,
    rejectionsDelta: countDelta(b.rejections, a.rejections), exitReasonsDelta: countDelta(b.exitReasons, a.exitReasons),
    blockEqual: canonical(b) === canonical(a),
  };
}

export function compareKk(before, after) {
  const inputs = {
    receipt: diffPaths(receiptInputs(before.receipt), receiptInputs(after.receipt)),
    candidates: canonical(before.candidates) === canonical(after.candidates),
    intradayCoverage: canonical(before.intradayCoverage) === canonical(after.intradayCoverage),
    sampling: canonical(before.sampling) === canonical(after.sampling),
  };
  const inputsEqual = !inputs.receipt.length && inputs.candidates && inputs.intradayCoverage && inputs.sampling;
  const ep = {};
  for (const set of Object.keys(after.ep?.sets ?? {})) {
    ep[set] = {};
    for (const id of Object.keys(after.ep.sets[set].variants)) ep[set][id] = epVariantRow(before.ep?.sets?.[set]?.variants?.[id], after.ep.sets[set].variants[id]);
  }
  const sf7Execution = {};
  for (const id of Object.keys(after.ep?.sf7Execution?.variants ?? {})) sf7Execution[id] = epVariantRow(before.ep?.sf7Execution?.variants?.[id], after.ep.sf7Execution.variants[id]);
  const extEp = {};
  for (const id of Object.keys(after.extE7_6?.ep?.variants ?? {})) extEp[id] = epVariantRow(before.extE7_6?.ep?.variants?.[id], after.extE7_6.ep.variants[id]);
  for (const id of Object.keys(after.extE7_6?.ep?.sf7Execution ?? {})) extEp[id] = epVariantRow(before.extE7_6?.ep?.sf7Execution?.[id], after.extE7_6.ep.sf7Execution[id]);
  const { ep: extEpB, ...extRestB } = before.extE7_6 ?? {}; const { ep: extEpA, ...extRestA } = after.extE7_6 ?? {};
  const ps = {
    ps: { equal: canonical(before.ps) === canonical(after.ps), sha256: [hashOf(before.ps ?? null), hashOf(after.ps ?? null)], diff: diffPaths(before.ps, after.ps).length },
    extE7_6Rest: { equal: canonical(extRestB) === canonical(extRestA), diff: diffPaths(extRestB, extRestA).length },
  };
  const rows = [...Object.values(ep).flatMap((s) => Object.values(s)), ...Object.values(sf7Execution), ...Object.values(extEp)];
  const sf7Validation = { equal: canonical(before.ep?.sf7Validation) === canonical(after.ep?.sf7Validation), diff: diffPaths(before.ep?.sf7Validation, after.ep?.sf7Validation) };
  return {
    schema: KK, inputs, inputsEqual,
    code: { before: before.receipt?.researchCodeSha256 ?? null, after: after.receipt?.researchCodeSha256 ?? null },
    ep, sf7Execution, extE7_6Ep: extEp, ps, sf7Validation,
    summary: { epVariantBlocks: rows.length, epBlocksEqual: rows.filter((r) => r.blockEqual).length, epTradesShaEqual: rows.filter((r) => r.tradesSha256Equal).length, psEqual: ps.ps.equal && ps.extE7_6Rest.equal },
  };
}

export function compareSf5(before, after) {
  const inputs = { receipt: diffPaths(receiptInputs(before.receipt), receiptInputs(after.receipt)) };
  const strategies = {};
  let blocks = 0, equal = 0;
  const allocation = {};
  for (const [key, s] of Object.entries(after.lifecycle?.strategies ?? {})) {
    const sb = before.lifecycle?.strategies?.[key] ?? {};
    const vs = { ...(s.variants ?? {}), ...Object.fromEntries(Object.entries(s.sf7Execution?.variants ?? {}).map(([k, v]) => [`sf7:${k}`, v])) };
    const vb = { ...(sb.variants ?? {}), ...Object.fromEntries(Object.entries(sb.sf7Execution?.variants ?? {}).map(([k, v]) => [`sf7:${k}`, v])) };
    const diff = [];
    for (const id of Object.keys(vs)) {
      blocks++;
      if (canonical(vb[id]) === canonical(vs[id])) equal++; else diff.push(id);
      const n = vs[id]?.counts?.intradayAllocationByMinute; if (n) allocation[`${key}/${id}`] = n;
    }
    const { variants: _a, sf7Execution: _b, ...restA } = s; const { variants: _c, sf7Execution: _d, ...restB } = sb;
    strategies[key] = { variants: Object.keys(vs).length, differing: diff, restEqual: canonical(restA) === canonical(restB) };
  }
  const lifecycleRestEqual = canonical({ ...after.lifecycle, strategies: null }) === canonical({ ...before.lifecycle, strategies: null });
  return {
    schema: SF5, inputs, inputsEqual: !inputs.receipt.length,
    code: { before: before.receipt?.researchCodeSha256 ?? null, after: after.receipt?.researchCodeSha256 ?? null },
    strategies, intradayAllocationByMinute: allocation,
    summary: { variantBlocks: blocks, equal, allEqual: blocks === equal && Object.values(strategies).every((s) => s.restEqual) && lifecycleRestEqual, publicSha256: [hashOf({ ...before, receipt: null }), hashOf({ ...after, receipt: null })] },
  };
}

export function comparePublic(before, after) {
  if (before.schema !== after.schema) throw new Error(`SCHEMA_MISMATCH:${before.schema}:${after.schema}`);
  if (after.schema === KK) return compareKk(before, after);
  if (after.schema === SF5) return compareSf5(before, after);
  throw new Error(`UNKNOWN_SCHEMA:${after.schema}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
  const before = arg('--before'), after = arg('--after'), out = arg('--out');
  if (!before || !after) { console.error('usage: --before <log|json> --after <log|json> [--out <file>]'); process.exit(2); }
  const res = comparePublic(readPublic(before), readPublic(after));
  const text = JSON.stringify(res, null, 1) + '\n';
  if (out) fs.writeFileSync(out, text); else process.stdout.write(text);
}
