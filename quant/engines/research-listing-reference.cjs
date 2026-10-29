'use strict';
// Historical listing reference (V12 P3, strand LISTREF) for OFFLINE research only.
// Reads docs/quant-recovery/v12/listref/coverage-by-year-segment.json (built by scripts/quant/v12/listref/build_reference.cjs)
// and answers, per calendar year and segment, how much of the historical US exchange-listed common population our
// weekly price holdings and the V10/V11 research frame cover, how many listings ended (delisted) and how many of those
// carry a source-verified lifecycle. Opt-in: nothing in the product or in the weekly research loader reads this module.
// Fail-closed: a missing, malformed, internally inconsistent or hash-mismatched register throws LISTING_REFERENCE_UNAVAILABLE.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const REGISTER = 'docs/quant-recovery/v12/listref/coverage-by-year-segment.json';
const SCHEMA = 'v12-listref-coverage-by-year-segment-1.0.2';
const READINESS = ['INSUFFICIENT', 'PARTIAL', 'STUDY_READY_TRANSPARENT_GAP'];
const COLUMNS = ['year', 'segment', 'value', 'ref', 'withSeries', 'frameQualified', 'seriesCoverage', 'frameCoverage', 'refDelistings', 'delistingsWithSeries', 'delistingsWithLifecycle',
  'referenceCompletenessLower', 'referenceCompletenessUpper', 'readiness', 'readinessAtLowerCompleteness', 'completenessSource'];

function fail(msg) { throw new Error('LISTING_REFERENCE_UNAVAILABLE: ' + msg); }

function validate(doc) {
  if (!doc || doc.schemaVersion !== SCHEMA) fail('schemaVersion');
  if (doc.certificationStatus !== 'NOT_CERTIFIED' || doc.productionApproved !== false) fail('certification fields');
  if (JSON.stringify(doc.columns) !== JSON.stringify(COLUMNS)) fail('columns');
  if (!Array.isArray(doc.rows) || !doc.rows.length) fail('rows');
  const seen = new Set();
  for (const r of doc.rows) {
    if (!Array.isArray(r) || r.length !== COLUMNS.length) fail('row width');
    const o = Object.fromEntries(COLUMNS.map((c, i) => [c, r[i]]));
    const key = o.year + '|' + o.segment + '|' + o.value;
    if (seen.has(key)) fail('duplicate row ' + key);
    seen.add(key);
    if (!Number.isInteger(o.ref) || o.ref < 0 || o.withSeries > o.ref || o.frameQualified > o.withSeries) fail('counts ' + key);
    if (o.refDelistings > o.ref || o.delistingsWithSeries > o.refDelistings || o.delistingsWithLifecycle > o.refDelistings) fail('delisting counts ' + key);
    if (o.ref && Math.abs(o.seriesCoverage - o.withSeries / o.ref) > 1e-4) fail('seriesCoverage ' + key);
    if (!READINESS.includes(o.readiness) || !READINESS.includes(o.readinessAtLowerCompleteness)) fail('readiness ' + key);
  }
  return true;
}

function createListingReference(root, options = {}) {
  const file = path.join(root, options.register || REGISTER);
  let raw;
  try { raw = fs.readFileSync(file); } catch (e) { fail('missing ' + file); }
  if (options.expectedSha256) {
    const got = crypto.createHash('sha256').update(raw).digest('hex');
    if (got !== options.expectedSha256) fail('sha256 mismatch');
  }
  let doc;
  try { doc = JSON.parse(raw.toString('utf8')); } catch (e) { fail('json'); }
  validate(doc);
  const index = new Map();
  for (const r of doc.rows) { const o = Object.fromEntries(COLUMNS.map((c, i) => [c, r[i]])); index.set(o.year + '|' + o.segment + '|' + o.value, Object.freeze(o)); }
  const get = (year, segment = 'all', value = 'ALL') => index.get(year + '|' + segment + '|' + value) || null;
  return Object.freeze({
    schemaVersion: doc.schemaVersion,
    ruleVersion: doc.ruleVersion,
    coverage: get,
    // survivorship gap of our holdings against the reference for one cell; null when the cell does not exist
    survivorshipGap(year, segment = 'all', value = 'ALL') {
      const o = get(year, segment, value);
      if (!o) return null;
      return { ref: o.ref, missing: o.ref - o.withSeries, missingShare: o.ref ? (o.ref - o.withSeries) / o.ref : null, outsideFrame: o.ref - o.frameQualified,
        refDelistings: o.refDelistings, delistingsWithoutSeries: o.refDelistings - o.delistingsWithSeries, delistingsWithoutLifecycle: o.refDelistings - o.delistingsWithLifecycle,
        referenceCompleteness: [o.referenceCompletenessLower, o.referenceCompletenessUpper], readiness: o.readiness, readinessAtLowerCompleteness: o.readinessAtLowerCompleteness };
    },
    // years whose readiness reaches minReadiness for the segment cell, ascending
    readyYears(segment = 'all', value = 'ALL', minReadiness = 'STUDY_READY_TRANSPARENT_GAP') {
      const need = READINESS.indexOf(minReadiness);
      if (need < 0) throw new Error('unknown readiness ' + minReadiness);
      return [...index.values()].filter(o => o.segment === segment && o.value === value && READINESS.indexOf(o.readiness) >= need).map(o => o.year).sort((a, b) => a - b);
    },
    segments() { return [...new Set([...index.values()].map(o => o.segment + '|' + o.value))].sort(); },
  });
}

module.exports = { REGISTER, SCHEMA, COLUMNS, READINESS, createListingReference, validate };
