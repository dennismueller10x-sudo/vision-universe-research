#!/usr/bin/env node
// Coverage der historischen SIC-Basis (quant/data/sec/sic-history) auf dem Produktuniversum.
// Reine Messung, keine Schwelle, die irgendwo entscheidet. Schreibt nur nach --out.
//
//   node scripts/quant/sic-history-coverage.mjs --out docs/historical-sic/COVERAGE.json [--from 2016-01-01] [--to 2026-09-30]
//
// Identitaet: Instrumentenstamm (quant/data/universe/instruments). Die CIK dort stammt aus der HEUTIGEN
// SEC-Tickerliste; belegt ist sie deshalb nur ab firstTradeDate des Instruments. Davor: IDENTITY_HOLD.
// Altersklassen der letzten Beobachtung sind Berichtsklassen, keine Entscheidungsgrenzen.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadSicHistory, DEFAULT_DIR } from '../core/load-sic-history.mjs';

const require = createRequire(import.meta.url);
const IC = require('../../core/industry-classification.js');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); const i = process.argv.indexOf(`--${k}`); return a ? a.split('=')[1] : i > 0 ? process.argv[i + 1] : d; };

export function monthEnds(from, to) {
  const out = [];
  let y = +from.slice(0, 4), m = +from.slice(5, 7);
  for (;;) {
    const d = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    if (d > to) break;
    if (d >= from) out.push(d);
    if (++m === 13) { m = 1; y++; }
  }
  return out;
}

const AGE_BUCKETS = [[100, 'le100d'], [200, 'le200d'], [400, 'le400d'], [Infinity, 'gt400d']];

export function measure({ instruments, classification, index, from, to }) {
  const dates = monthEnds(from, to);
  const withCik = instruments.filter((x) => x.cik);
  const ciks = [...new Set(withCik.map((x) => IC.normalizeCik(x.cik)))];
  const byCik = new Map();
  for (const x of withCik) { const c = IC.normalizeCik(x.cik); (byCik.get(c) || byCik.set(c, []).get(c)).push(x.symbol); }
  const points = { notListed: 0, total: 0, identityHold: 0, OBSERVED: 0, NO_SIC_ASSIGNED: 0, UNKNOWN_BEFORE_FIRST_OBSERVATION: 0, UNKNOWN_NO_OBSERVATIONS: 0, CONFLICT: 0 };
  const age = Object.fromEntries(AGE_BUCKETS.map(([, k]) => [k, 0]));
  const holdReasons = {};
  const gaps = {}; // cik -> fruehester Punkt vor der ersten Beobachtung (Eingabe fuer den Header-Lueckenschluss)
  for (const inst of instruments) {
    const cands = inst.cik ? [{ cik: inst.cik, evidence: inst.cikSource, validFrom: inst.firstTradeDate || null, validTo: inst.delistedAt || null }] : [];
    for (const d of dates) {
      // vor dem ersten Handelstag / nach dem Delisting existiert das Listing nicht: kein Coverage-Punkt
      if ((inst.firstTradeDate && d < inst.firstTradeDate) || (inst.delistedAt && d > inst.delistedAt)) { points.notListed++; continue; }
      points.total++;
      const who = IC.resolveIssuer(cands, d);
      if (who.status !== 'RESOLVED') { points.identityHold++; holdReasons[who.reason] = (holdReasons[who.reason] || 0) + 1; continue; }
      const r = classification.getIndustryClassification(who.cik, d);
      points[r.status] = (points[r.status] || 0) + 1;
      if (r.status === 'UNKNOWN_BEFORE_FIRST_OBSERVATION' || r.status === 'UNKNOWN_NO_OBSERVATIONS') {
        if (!gaps[who.cik] || d < gaps[who.cik].from) gaps[who.cik] = { from: d, status: r.status };
      }
      if (r.status === 'OBSERVED') age[AGE_BUCKETS.find(([lim]) => r.ageDays <= lim)[1]]++;
    }
  }
  let observations = 0, changes = 0, changesInWindow = 0, issuersWithChange = 0, inData = 0;
  const fromIso = from + 'T00:00:00Z', toIso = to + 'T23:59:59Z';
  for (const c of ciks) {
    const h = classification.history(c);
    if (!h) continue;
    inData++;
    const runs = h.runs.filter((r) => r.sic);
    const ch = runs.slice(1).filter((r, i) => r.sic !== runs[i].sic);
    changes += ch.length;
    changesInWindow += ch.filter((r) => r.firstKnownAt >= fromIso && r.firstKnownAt <= toIso).length;
    if (ch.length) issuersWithChange++;
    for (const r of h.runs) observations += r.observations;
  }
  const pct = (a, b) => (b ? Math.round((1e4 * a) / b) / 100 : null);
  const resolvedPoints = points.total - points.identityHold;
  const turtleUsable = points.OBSERVED;
  return {
    gaps,
    schemaVersion: 'sic-history-coverage/1.0.0',
    universe: 'Produktuniversum quant/data/universe/instruments (heutiger Stand; delistete Titel fehlen dort)',
    window: { from, to, grid: 'Monatsende', dates: dates.length, note: 'Punkte = Listing x Monatsende, nur solange das Listing gehandelt wurde (firstTradeDate..delistedAt)' },
    dataset: { fsdsQuarters: index.fsdsQuarters.length, fsdsLastQuarter: index.fsdsLastQuarter, headers: index.headers, observedThrough: index.observedThrough, issuersTotal: index.stats.issuers, observationsTotal: index.stats.observations },
    companies: {
      instruments: instruments.length,
      instrumentsWithCik: withCik.length,
      instrumentsWithoutCik: instruments.length - withCik.length,
      cikShare: pct(withCik.length, instruments.length),
      uniqueCiks: ciks.length,
      ciksWithSeveralListings: [...byCik.values()].filter((l) => l.length > 1).length,
      cikSource: Object.entries(withCik.reduce((a, x) => ({ ...a, [x.cikSource]: (a[x.cikSource] || 0) + 1 }), {})).map(([k, v]) => ({ source: k, instruments: v })),
      ciksInSicHistory: inData,
      ciksInSicHistoryShare: pct(inData, ciks.length),
    },
    observations: { forUniverseCiks: observations, sicChangesBetweenCodes: changes, sicChangesInWindow: changesInWindow, issuersWithChange },
    points: {
      ...points,
      identityHoldReasons: holdReasons,
      shares: {
        identityHold: pct(points.identityHold, points.total),
        observedOfAll: pct(points.OBSERVED, points.total),
        observedOfResolved: pct(points.OBSERVED, resolvedPoints),
        unknownBeforeFirstOfResolved: pct(points.UNKNOWN_BEFORE_FIRST_OBSERVATION, resolvedPoints),
        noObservationsOfResolved: pct(points.UNKNOWN_NO_OBSERVATIONS, resolvedPoints),
        conflictOfResolved: pct(points.CONFLICT, resolvedPoints),
      },
      observedAgeBuckets: age,
      observedAgeShares: Object.fromEntries(Object.entries(age).map(([k, v]) => [k, pct(v, points.OBSERVED)])),
    },
    use: {
      turtleDataUsablePoints: turtleUsable,
      turtleDataUsableShare: pct(turtleUsable, points.total),
      turtleBinding: 'DATA_BLOCKED (Owner: SIC-Ebene eng/lose, maxAgeDays)',
      weinsteinMembershipUsableShare: pct(turtleUsable, points.total),
      weinsteinGroupStageUsableShare: 0,
      weinsteinBinding: 'DATA_BLOCKED (Gruppenchart-Konstruktion offen)',
    },
    semantics: {
      real: 'OBSERVED mit Alter <= 100 Tage: eine Beobachtung aus dem laufenden Berichtszyklus',
      extrapolated: 'OBSERVED mit hoeherem Alter: fortgeschriebene letzte Beobachtung (INFERRED_INTERVAL)',
      note: 'Altersklassen sind Berichtsklassen, keine Entscheidungsgrenzen',
    },
  };
}

function loadInstruments() {
  const dir = join(ROOT, 'quant', 'data', 'universe', 'instruments');
  const out = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const arr = Array.isArray(j) ? j : (j.instruments || Object.values(j));
    for (const x of arr) if (x && x.symbol) out.push({ symbol: x.symbol, cik: x.cik || null, cikSource: x.cikSource || null, firstTradeDate: x.firstTradeDate || null, delistedAt: x.delistedAt || null });
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = arg('out');
  if (!out) { console.error('--out fehlt'); process.exit(2); }
  const instruments = loadInstruments();
  const dir = arg('data', DEFAULT_DIR);
  const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
  const classification = loadSicHistory({ dir, ciks: instruments.filter((x) => x.cik).map((x) => x.cik) });
  const report = measure({ instruments, classification, index, from: arg('from', '2016-01-01'), to: arg('to', '2026-09-30') });
  const { gaps, ...body } = report;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(body, null, 1) + '\n');
  const gapsOut = arg('gaps-out');
  if (gapsOut) writeFileSync(gapsOut, JSON.stringify(Object.fromEntries(Object.entries(gaps).sort()), null, 1) + '\n');
  console.log(JSON.stringify({ companies: report.companies, points: report.points.shares, age: report.points.observedAgeShares }, null, 1));
}
