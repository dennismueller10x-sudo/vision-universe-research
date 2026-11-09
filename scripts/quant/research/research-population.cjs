'use strict';
// Research-only population facade (opt-in, offline research; no product path, loader default or study reads this module).
// Location: scripts/quant/research/ (research tooling next to the V10-V13 study code it calls), deliberately NOT quant/engines:
// the isolation guards in quant/tests/research-{ca,identity}-evidence.test.mjs treat every quant/engines module that imports the
// research loader as a productive caller.
// One explicitly activated entry point over EXISTING pieces - nothing here derives a new frame rule, identity or price:
//   - research-weekly-loader.cjs options (validated against the loader's own option lists),
//   - the V10 frame rule scripts/quant/v10/studies/common.cjs#buildFrame / #sourceManifest (called, not re-implemented),
//   - the V13 delisted frames scripts/quant/v13/studies/run-frame.cjs#buildContext (FRAMES definitions, lib.mergeFrame,
//     lib.mergedManifestHash) over research-delisted-series.cjs (private, hash-bound series),
//   - availability/coverage of the PIT registers research-pit-market-cap.cjs and research-index-population.cjs (read only).
//
// buildPopulation({ profile, window, privateDirs }, deps?) -> population
//   profile      name of a preset in PROFILES (PRODUCT_DEFAULT = the exact default loader, i.e. the adapter's own loader)
//   window       optional [from, to] (ISO dates): restricts the returned listings and the coverage report; the frame rule and
//                the calendar are always computed on the full data (identical to the reference runs)
//   privateDirs  { delistedSeries } for the V13 delisted profiles; the directory must exist outside the repository.
//                Missing -> throws PRIVATE_DATA_UNAVAILABLE; missing files -> throws PRIVATE_DATA_INCOMPLETE (never silent).
// Returns { listings: Map(id -> loader doc), frameIds, calendar, calendarInWindow, coverage, dataQuality, inputHashes,
//           profile: {name, spec, specHash}, reference, populationHash, certification: 'NOT_CERTIFIED', productionApproved: false }
// summarize(population) drops the docs (JSON-safe report). availability(profile, {privateDirs}) checks inputs without building.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const L = require('../../../quant/engines/research-weekly-loader.cjs');

const VERSION = 'research-population-1.0.0';
const ROOT = path.resolve(__dirname, '..', '..', '..');
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LIFECYCLE = Object.freeze({ identityEvidence: true, corporateActionEvidence: true, listingLifecycleEvidence: true });
// Presets: loader options (validated by the loader itself) and, for the V13 frames, the run-frame.cjs FRAMES key.
const PROFILES = Object.freeze({
  PRODUCT_DEFAULT: Object.freeze({ loaderOptions: Object.freeze({}), delistedFrame: null, description: 'Default loader = weekly-real-adapter createLoader, byte-identical; survivor cohort only.' }),
  V10_PRIMARY: Object.freeze({ loaderOptions: Object.freeze({ identityEvidence: true, corporateActionEvidence: true }), delistedFrame: null, description: 'V10 primary studies (identity + CA evidence).' }),
  V10_LIFECYCLE: Object.freeze({ loaderOptions: LIFECYCLE, delistedFrame: null, description: 'V10 ca-id-lifecycle run = V12 requal frame = V13 F0.' }),
  V12_LARGECAP: Object.freeze({ loaderOptions: Object.freeze({ ...LIFECYCLE, identityEvidenceProtocolV10: true, identityEvidenceProtocolV12: true }), delistedFrame: null, description: 'V12 LARGECAP identity records (qualify-sets v12).' }),
  V13_LARGECAP: Object.freeze({ loaderOptions: Object.freeze({ ...LIFECYCLE, identityEvidenceProtocolV10: true, identityEvidenceProtocolV12: true, identityEvidenceProtocolV13Largecap: true }), delistedFrame: null, description: 'V13 LARGECAP closed intervals (amendment 1.0.1).' }),
  V13B_LARGECAP_STRICT: Object.freeze({ loaderOptions: Object.freeze({ ...LIFECYCLE, identityEvidenceProtocolV10: true, identityEvidenceProtocolV12: true, identityEvidenceProtocolV13Largecap: true, identityEvidenceProtocolV13LargecapStrict: true }), delistedFrame: null, description: 'V13b LARGECAP strict intervals (amendment 1.1.0).' }),
  V13_DELISTED_F1: Object.freeze({ loaderOptions: LIFECYCLE, delistedFrame: 'F1', description: 'V13 registered primary: F0 + QUALIFIED delisted series passing the frame rule.' }),
  V13_DELISTED_F1C: Object.freeze({ loaderOptions: LIFECYCLE, delistedFrame: 'F1c', description: 'V13 registered sensitivity: + PRICE_ONLY_CENSORED_END.' }),
  V13B_DELISTED_F1W: Object.freeze({ loaderOptions: LIFECYCLE, delistedFrame: 'F1w', description: 'V13 amendment 1.0.1 sensitivity: last-bar relabel.' }),
});
// Published reference values (docs/quant-recovery/...): used only to report drift of quant/data since those runs.
const REFERENCES = Object.freeze({
  V10_LIFECYCLE: Object.freeze({ source: 'docs/quant-recovery/v10/studies/ca-id-lifecycle/run-meta.json', frame: 4329, qualified: 4526, calendarLength: 1922,
    calendarHash: '48605c9a1b079cd73464963084d17e4df04f0d29ca8afc2b859d845bfdd54b8e', sourceManifestHash: '2c27039fd782cccced62ac28cebfb808eea07670ba2c79e58e373824bcc0b679' }),
  V13_DELISTED_F1: Object.freeze({ source: 'docs/quant-recovery/v13/studies/s2-population-1.0.0.json', frame: 4719, sourceManifestHash: 'f7d13db0900757050b8025a8c0e8e546dbe9d43618e6856a393c6144e9caa478' }),
  V13_DELISTED_F1C: Object.freeze({ source: 'docs/quant-recovery/v13/studies/s2-population-1.0.0.json', frame: 4758 }),
  V13B_DELISTED_F1W: Object.freeze({ source: 'docs/quant-recovery/v13/studies/s2-population-1.0.0.json', frame: 5905, sourceManifestHash: '066505661d92b62c6e5a4d0fe788c9629d5abde051c54f5309365016d64335f3' }),
});

function fail(code, detail) { const e = new Error(code + (detail ? ':' + detail : '')); e.code = code; throw e; }
function canonical(x) {
  if (x === null || typeof x === 'string' || typeof x === 'boolean' || typeof x === 'number') return JSON.stringify(x);
  if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
  return '{' + Object.keys(x).filter(k => x[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
}
const sha = x => crypto.createHash('sha256').update(typeof x === 'string' ? x : canonical(x)).digest('hex');
const shaFile = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const isDate = x => typeof x === 'string' && DATE.test(x) && new Date(x + 'T00:00:00Z').toISOString().slice(0, 10) === x;

/** Option names accepted by the research loader (read from the loader's own lists). */
function loaderOptionNames() { return [...L.LOADER_OPTIONS, ...L.LOADER_OPTIONS_V12, ...L.LOADER_OPTIONS_V13, ...L.LOADER_OPTIONS_V13B]; }
function profileSpec(name) {
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(PROFILES, name)) fail('POPULATION_PROFILE_UNKNOWN', String(name));
  const p = PROFILES[name], known = loaderOptionNames();
  for (const k of Object.keys(p.loaderOptions)) if (!known.includes(k)) fail('POPULATION_PROFILE_LOADER_OPTION_UNKNOWN', k); // a renamed loader option fails here
  const spec = { schemaVersion: VERSION, name, loaderOptions: { ...p.loaderOptions }, delistedFrame: p.delistedFrame };
  return { spec, specHash: sha(spec), description: p.description };
}
function frameDefs() { return require('../v13/studies/run-frame.cjs').FRAMES; }
function checkPrivateDir(dir, root) {
  if (typeof dir !== 'string' || !dir) return 'NOT_GIVEN';
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return 'NOT_FOUND';
  const real = fs.realpathSync(dir), r = fs.realpathSync(root);
  if (real === r || real.startsWith(r + path.sep)) return 'INSIDE_REPOSITORY';
  return 'OK';
}
/** Input availability without building (private data presence; never reads provider data). */
function availability(profile, { privateDirs = {}, root = ROOT } = {}) {
  const { spec } = profileSpec(profile);
  if (!spec.delistedFrame) return { profile, status: 'AVAILABLE', privateInputs: [] };
  const state = checkPrivateDir(privateDirs.delistedSeries, root);
  return { profile, status: state === 'OK' ? 'AVAILABLE' : state === 'INSIDE_REPOSITORY' ? 'PRIVATE_DIR_INSIDE_REPOSITORY' : 'PRIVATE_DATA_UNAVAILABLE',
    privateInputs: [{ name: 'delistedSeries', state, register: 'docs/quant-recovery/v13/delisted/register-1.0.0.json' }] };
}

function registerAvailability(frameIds) {
  const out = {};
  try {
    const M = require('../../../quant/engines/research-pit-market-cap.cjs'), r = M.loadRegister(), splits = new Set(Object.keys(r.meta.splits));
    out.pitMarketCap = { state: 'AVAILABLE_OPT_IN', module: 'quant/engines/research-pit-market-cap.cjs', ruleVersion: r.meta.ruleVersion, ruleSha256: r.meta.ruleSha256, observationsHash: r.meta.observationsHash,
      registerSha256: shaFile(require.resolve('../../../quant/engines/research-pit-market-cap-register.cjs')), correctedFactCiks: Object.keys(r.meta.facts).length, listingsWithSplitRecords: splits.size,
      frameListingsWithSplitRecords: frameIds.filter(id => splits.has(id)).length, note: 'Register of non-OK facts for its observation set; marketCapAt needs the V10 factor inputs (not built here).' };
  } catch (e) { out.pitMarketCap = { state: 'UNAVAILABLE', reason: String(e.message).split(':')[0] }; }
  try {
    const I = require('../../../quant/engines/research-index-population.cjs'), p = I.createIndexPopulation({ optIn: true });
    out.indexPopulation = { state: 'AVAILABLE_OPT_IN', module: 'quant/engines/research-index-population.cjs', ruleVersion: p.ruleVersion, dataSha256: p.dataSha256,
      populations: p.populations().map(x => ({ id: x.id, fund: x.fund, index: x.index, from: x.from, to: x.to, role: x.role, periods: x.periods, qualificationCounts: x.qualificationCounts })),
      note: 'SEC fund-holdings PIT membership; not joined to the weekly frame here (no new derivation).' };
  } catch (e) { out.indexPopulation = { state: 'UNAVAILABLE', reason: String(e.message).split(':')[0] }; }
  return out;
}

function defaultDeps(root) {
  return {
    root,
    buildFrame: loaderOptions => { const K = require('../v10/studies/common.cjs'); const fr = K.buildFrame(loaderOptions); return { fr, sourceManifestHash: K.V.hash(K.sourceManifest(fr)), f0ManifestHash: null, delistedInfo: null }; },
    buildDelistedFrame: (frameKey, seriesDir) => {
      const RF = require('../v13/studies/run-frame.cjs'), ctx = RF.buildContext(frameKey, seriesDir, null);
      return { fr: ctx.fr, sourceManifestHash: ctx.manifestHash, f0ManifestHash: ctx.f0ManifestHash, delistedInfo: ctx.delistedInfo };
    },
    pointsHash: points => require('../../../quant/engines/research-contract.cjs').hash(points),
    registers: registerAvailability,
  };
}

function yearOf(d) { return Number(d.slice(0, 4)); }
function coverageOf(fr, ids, window, loader, docs) {
  const [from, to] = window, perYear = new Map();
  const y0 = yearOf(from), y1 = yearOf(to);
  for (let y = y0; y <= y1; y++) perYear.set(y, { year: y, active: 0, entering: 0, ending: 0, delistedActive: 0, censoredEnding: 0 });
  const lifecycle = {}, terminal = {}, caQuality = {};
  let tr = 0, delisted = 0, ended = 0, censored = 0;
  const caBound = new Set(loader && loader.corporateActionEvidence ? loader.corporateActionEvidence.securityIds : []);
  const idBound = new Set(loader && loader.identityEvidence ? loader.identityEvidence.boundSecurityIds : []);
  const lastCal = fr.calendar.at(-1);
  for (const id of ids) {
    const d = docs.get(id), first = d.points[0][0], last = d.points.at(-1)[0], lc = d.listingLifecycle || null, isDl = id.startsWith('dl_');
    if (isDl) delisted++;
    if (Array.isArray(d.totalReturnPoints) && d.totalReturnPoints.length) tr++;
    const st = lc ? lc.status : 'NO_LIFECYCLE_RECORD'; lifecycle[st] = (lifecycle[st] || 0) + 1;
    if (lc && lc.terminal) terminal[lc.terminal.kind] = (terminal[lc.terminal.kind] || 0) + 1;
    const q = d.corporateActionQuality ? d.corporateActionQuality.status : 'NOT_REPORTED'; caQuality[q] = (caQuality[q] || 0) + 1;
    const isEnded = !!(lc && (lc.lastTradeDate || lc.lastObservedDate)) && last < lastCal, isCensored = !!lc && /CENSORED/.test(lc.status || '');
    if (isEnded) ended++; if (isCensored) censored++;
    for (let y = Math.max(y0, yearOf(first)); y <= Math.min(y1, yearOf(last)); y++) {
      const row = perYear.get(y); row.active++; if (isDl) row.delistedActive++;
      if (y === yearOf(first) && first >= from) row.entering++;
      if (y === yearOf(last) && isEnded) { row.ending++; if (isCensored) row.censoredEnding++; }
    }
  }
  const years = [...perYear.values()].map(r => ({ ...r, delistedShare: r.active ? r.delistedActive / r.active : null }));
  return { window: { from, to }, listings: ids.length, perYear: years, lifecycleStatus: lifecycle, terminalKind: terminal, endedBeforeCalendarEnd: ended, censoredEnds: censored,
    corporateActionQuality: caQuality, corporateActionEvidenceBound: ids.filter(id => caBound.has(id)).length, identityEvidenceBound: ids.filter(id => idBound.has(id)).length,
    totalReturnAvailable: tr, totalReturnShare: ids.length ? tr / ids.length : null, delistedListings: delisted, delistedShare: ids.length ? delisted / ids.length : null,
    qualificationCounts: { ...fr.reasons }, qualifiedBeforeFrameRule: fr.qualified.length, frameExclusions: Object.fromEntries(Object.entries(fr.excluded).map(([k, v]) => [k, v.length])) };
}

function buildPopulation(request = {}, depsIn = {}) {
  if (!request || typeof request !== 'object') fail('POPULATION_REQUEST_REQUIRED');
  for (const k of Object.keys(request)) if (!['profile', 'window', 'privateDirs', 'includePointsHashes'].includes(k)) fail('POPULATION_REQUEST_UNKNOWN_KEY', k);
  const root = depsIn.root || ROOT, deps = { ...defaultDeps(root), ...depsIn };
  const { spec, specHash, description } = profileSpec(request.profile);
  const window = request.window === undefined ? null : request.window;
  if (window !== null && (!Array.isArray(window) || window.length !== 2 || !isDate(window[0]) || !isDate(window[1]) || window[0] > window[1])) fail('POPULATION_WINDOW_INVALID');
  let built;
  if (spec.delistedFrame) {
    if (!(spec.delistedFrame in frameDefs())) fail('POPULATION_DELISTED_FRAME_UNKNOWN', spec.delistedFrame);
    const av = availability(request.profile, { privateDirs: request.privateDirs || {}, root });
    if (av.status !== 'AVAILABLE') fail(av.status, 'delistedSeries=' + av.privateInputs[0].state);
    built = deps.buildDelistedFrame(spec.delistedFrame, request.privateDirs.delistedSeries);
    const c = built.delistedInfo && built.delistedInfo.counts;
    if (!c || c.missingFile !== 0 || c.loaded !== c.requested) fail('PRIVATE_DATA_INCOMPLETE', c ? c.missingFile + ' of ' + c.requested + ' register rows without a private file' : 'no counts');
  } else built = deps.buildFrame({ ...spec.loaderOptions });
  const fr = built.fr, loader = fr.loader || null;
  const win = window || [fr.calendar[0], fr.calendar.at(-1)];
  const ids = fr.frame.filter(id => { const p = fr.docs.get(id).points; return p[0][0] <= win[1] && p.at(-1)[0] >= win[0]; });
  const listings = new Map(ids.map(id => [id, fr.docs.get(id)]));
  const coverage = coverageOf(fr, ids, win, loader, fr.docs);
  coverage.registers = deps.registers(fr.frame);
  // Data-quality warnings: facade level plus counts of the loader's own per-listing warnings.
  const docWarningCounts = {};
  for (const id of ids) for (const w of fr.docs.get(id).warnings || []) docWarningCounts[w] = (docWarningCounts[w] || 0) + 1;
  const warnings = [];
  if (!spec.loaderOptions.listingLifecycleEvidence && !spec.delistedFrame) warnings.push('SURVIVOR_COHORT_ONLY_NO_LIFECYCLE_EVIDENCE');
  if (!spec.delistedFrame) warnings.push('DELISTED_SERIES_NOT_INCLUDED');
  if (coverage.totalReturnAvailable === 0) warnings.push('PRICE_RETURN_ONLY_NO_TOTAL_RETURN_SERIES');
  else if (coverage.totalReturnAvailable < ids.length) warnings.push('TOTAL_RETURN_PARTIAL_' + coverage.totalReturnAvailable + '_OF_' + ids.length);
  warnings.push('EX_POST_SPLIT_ADJUSTED_SERIES_NOT_AS_PUBLISHED_PIT', 'FRAME_RULE_USES_FULL_DATA_MODAL_WEEK_LABELS');
  const ref = REFERENCES[request.profile] || null;
  let reference = null;
  if (ref) {
    const drift = {};
    if (ref.frame !== undefined && ref.frame !== fr.frame.length) drift.frame = { reference: ref.frame, actual: fr.frame.length };
    if (ref.qualified !== undefined && ref.qualified !== fr.qualified.length) drift.qualified = { reference: ref.qualified, actual: fr.qualified.length };
    if (ref.calendarLength !== undefined && ref.calendarLength !== fr.calendar.length) drift.calendarLength = { reference: ref.calendarLength, actual: fr.calendar.length };
    const calendarHash = require('../../../quant/engines/research-validation.cjs').hash(fr.calendar);
    if (ref.calendarHash !== undefined && ref.calendarHash !== calendarHash) drift.calendarHash = { reference: ref.calendarHash, actual: calendarHash };
    if (ref.sourceManifestHash !== undefined && ref.sourceManifestHash !== built.sourceManifestHash) drift.sourceManifestHash = { reference: ref.sourceManifestHash, actual: built.sourceManifestHash };
    reference = { source: ref.source, state: Object.keys(drift).length ? 'DATA_DRIFT_SINCE_REFERENCE_RUN' : 'MATCHES_REFERENCE_RUN', drift };
    if (Object.keys(drift).length) warnings.push('DATA_DRIFT_SINCE_REFERENCE_RUN');
  }
  const points = ids.map(id => [id, deps.pointsHash(fr.docs.get(id).points)]);
  const inputHashes = {
    masterHash: loader ? loader.masterHash ?? null : null,
    registers: {
      identityEvidence: loader && loader.identityEvidence ? { registryHash: loader.identityEvidence.registryHash, v12RegistryHash: loader.identityEvidence.v12RegistryHash ?? null, v13RegistryHash: loader.identityEvidence.v13RegistryHash ?? null, v13StrictRegistryHash: loader.identityEvidence.v13StrictRegistryHash ?? null } : null,
      corporateActionEvidence: loader && loader.corporateActionEvidence ? { registryHash: loader.corporateActionEvidence.registryHash, protocolSha256: loader.corporateActionEvidence.protocolSha256 } : null,
      listingLifecycleEvidence: loader && loader.listingLifecycleEvidence ? { registryHash: loader.listingLifecycleEvidence.registryHash, protocolSha256: loader.listingLifecycleEvidence.protocolSha256 } : null,
      delistedRegister: built.delistedInfo ? { registerHash: built.delistedInfo.registerHash, include: built.delistedInfo.include } : null,
      pitMarketCap: coverage.registers.pitMarketCap.registerSha256 ?? null, indexPopulation: coverage.registers.indexPopulation.dataSha256 ?? null,
    },
    sourceManifestHash: built.sourceManifestHash, f0ManifestHash: built.f0ManifestHash,
    calendarHash: require('../../../quant/engines/research-validation.cjs').hash(fr.calendar), calendarLength: fr.calendar.length,
    pointsHashRoot: sha(points), ...(request.includePointsHashes ? { pointsHashes: Object.fromEntries(points) } : {}),
  };
  const out = { schemaVersion: VERSION, certification: 'NOT_CERTIFIED', productionApproved: false, evidenceState: 'RESEARCH_INPUT_ONLY',
    profile: { name: request.profile, spec, specHash, description }, window: { from: win[0], to: win[1], requested: window !== null },
    frameIds: fr.frame.slice(), frameSize: fr.frame.length, calendar: fr.calendar.slice(), calendarInWindow: fr.calendar.filter(d => d >= win[0] && d <= win[1]),
    coverage, dataQuality: { warnings, docWarningCounts }, inputHashes, reference, delisted: built.delistedInfo };
  out.populationHash = sha(summarize(out));
  Object.defineProperty(out, 'listings', { value: listings, enumerable: false });
  Object.defineProperty(out, 'loader', { value: loader, enumerable: false });
  return out;
}
/** JSON-safe summary (no docs, no loader). */
function summarize(pop) { const { listings, loader, populationHash, ...rest } = pop; return JSON.parse(JSON.stringify(rest)); }
/** The research loader of a profile (PRODUCT_DEFAULT returns the adapter's own createLoader(root) loader). */
function createLoader(profile, root = ROOT) {
  const { spec } = profileSpec(profile);
  return L.createResearchLoader(root, Object.keys(spec.loaderOptions).length ? { ...spec.loaderOptions } : undefined);
}

module.exports = { VERSION, PROFILES, REFERENCES, buildPopulation, summarize, availability, profileSpec, loaderOptionNames, createLoader, coverageOf };
