'use strict';
// V13 research extension (opt-in, offline research only): weekly series of delisted listings fetched in the controlled V13 run
// (scripts/quant/v13/delisted), qualified under docs/quant-recovery/v13/delisted/protocol-1.0.0.json + amendment 1.0.1.
// The series themselves are private (provider data, never committed); this module binds every private file to the public
// register row (chainId, status, pointsSha256) and fails closed on any mismatch. No product loader reads it.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const REGISTER = 'docs/quant-recovery/v13/delisted/register-1.0.0.json';
const SCHEMA = 'v13-delisted-register-1.0.0';
// V13c (docs/quant-recovery/v13c/study-registration-3.0.0.json): opt-in register 1.1.0 (V13b HIST, 13 chains CA_UNRESOLVED -> QUALIFIED).
// Same row format; pinned by file SHA-256. The default (no registerVersion, or '1.0.0') is byte-identical to the 1.0.0-only module.
const REGISTER_110 = Object.freeze({ file: 'docs/quant-recovery/v13b/hist/register-1.1.0.json', schema: 'v13-delisted-register-1.1.0',
  sha256: '19e108e79c25d602ead7ec79583af50a8e0b620571667460ab04a017b936b270', basedOn100: 'ea986202ab4dee0b33ff12f31d005bc2435e11014e5c4925be2fcacf86657a6f' });
const REGISTER_VERSIONS = Object.freeze(['1.0.0', '1.1.0']);
const STATUSES_LOADABLE = Object.freeze(['QUALIFIED', 'PRICE_ONLY_CENSORED_END']);
const EXCHANGES = Object.freeze({ NASDAQ: 'XNAS', NYSE: 'XNYS', AMEX: 'XASE', 'NYSE MKT': 'XASE', 'NYSE ARCA': null });

// The register hash is computed by Python (json.dumps, separators (',', ':')); serialise floats the same way.
function pyFloat(x) {
  if (!Number.isFinite(x)) throw Error('DELISTED_NON_FINITE');
  if (Number.isInteger(x) && Math.abs(x) < 1e16) return x.toFixed(1);
  if (Math.abs(x) < 1e-4 || Math.abs(x) >= 1e16) return x.toExponential().replace(/e([+-])(\d)$/, 'e$10$2').replace('e+', 'e+');
  return String(x);
}
function pointsHash(points) {
  const s = '[' + points.map(([d, v]) => '["' + d + '",' + pyFloat(v) + ']').join(',') + ']';
  return crypto.createHash('sha256').update(s).digest('hex');
}
function readRegister(root, version) {
  if (version === '1.1.0') return readRegister110(root);
  const reg = JSON.parse(fs.readFileSync(path.join(root, REGISTER), 'utf8'));
  if (reg.schemaVersion !== SCHEMA || reg.productionApproved !== false || reg.certificationStatus !== 'NOT_CERTIFIED') throw Error('DELISTED_REGISTER_INVALID');
  if (!reg.controls || reg.controls.pass !== true) throw Error('DELISTED_CONTROLS_FAILED');
  const ix = Object.fromEntries(reg.columns.map((c, i) => [c, i]));
  const rows = new Map();
  for (const r of reg.rows) {
    if (rows.has(r[ix.chainId])) throw Error('DELISTED_DUPLICATE_CHAIN');
    rows.set(r[ix.chainId], { chainId: r[ix.chainId], cik: r[ix.cik], status: r[ix.status], endSourced: r[ix.endSourced], terminalClass: r[ix.terminalClass], weeks: r[ix.weeks], pointsSha256: r[ix.pointsSha256] });
  }
  return { reg, rows, registerHash: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, REGISTER))).digest('hex') };
}

function readRegister110(root) {
  const buf = fs.readFileSync(path.join(root, REGISTER_110.file)), registerHash = crypto.createHash('sha256').update(buf).digest('hex');
  if (registerHash !== REGISTER_110.sha256) throw Error('DELISTED_REGISTER_110_HASH_MISMATCH');
  const reg = JSON.parse(buf.toString('utf8'));
  if (reg.schemaVersion !== REGISTER_110.schema || reg.productionApproved !== false || reg.certificationStatus !== 'NOT_CERTIFIED') throw Error('DELISTED_REGISTER_INVALID');
  if (!reg.basedOn || reg.basedOn['register-1.0.0.json'] !== REGISTER_110.basedOn100) throw Error('DELISTED_REGISTER_110_BASE_MISMATCH');
  if (!reg.controls || reg.controls.pass !== true) throw Error('DELISTED_CONTROLS_FAILED');
  const ix = Object.fromEntries(reg.columns.map((c, i) => [c, i]));
  for (const c of ['chainId', 'cik', 'status', 'endSourced', 'terminalClass', 'weeks', 'pointsSha256']) if (!(c in ix)) throw Error('DELISTED_REGISTER_INVALID');
  const rows = new Map();
  for (const r of reg.rows) {
    if (rows.has(r[ix.chainId])) throw Error('DELISTED_DUPLICATE_CHAIN');
    rows.set(r[ix.chainId], { chainId: r[ix.chainId], cik: r[ix.cik], status: r[ix.status], endSourced: r[ix.endSourced], terminalClass: r[ix.terminalClass], weeks: r[ix.weeks], pointsSha256: r[ix.pointsSha256] });
  }
  return { reg, rows, registerHash };
}

// loadDelisted(root, { dir, include }) -> { docs: Map(id -> doc), counts, registerHash }
// include: 'QUALIFIED' (default; only source-backed ends) or 'ALL_LOADABLE' (adds PRICE_ONLY_CENSORED_END, censored, for sensitivities).
// V13c opt-in: { registerVersion: '1.1.0', extraDirs: [dir, ...] } loads register 1.1.0; files are searched in dir and extraDirs
// (a chain present in more than one directory fails closed). extraDirs are rejected with register 1.0.0.
function loadDelisted(root, options) {
  if (!options || typeof options.dir !== 'string') throw Error('DELISTED_DIR_REQUIRED');
  const include = options.include || 'QUALIFIED';
  if (!['QUALIFIED', 'ALL_LOADABLE'].includes(include)) throw Error('DELISTED_INCLUDE_INVALID');
  const version = options.registerVersion == null ? '1.0.0' : options.registerVersion;
  if (!REGISTER_VERSIONS.includes(version)) throw Error('DELISTED_REGISTER_VERSION_INVALID');
  if (options.extraDirs != null && (version !== '1.1.0' || !Array.isArray(options.extraDirs) || !options.extraDirs.every(d => typeof d === 'string'))) throw Error('DELISTED_EXTRA_DIRS_INVALID');
  const v110 = version === '1.1.0', dirs = v110 ? [options.dir, ...(options.extraDirs || [])] : null;
  const { rows, registerHash } = readRegister(root, version);
  const want = [...rows.values()].filter(r => include === 'QUALIFIED' ? r.status === 'QUALIFIED' : STATUSES_LOADABLE.includes(r.status));
  const docs = new Map(), counts = { requested: want.length, loaded: 0, missingFile: 0 };
  for (const r of want) {
    let file = path.join(options.dir, r.chainId + '.json');
    if (v110) {
      const hits = dirs.map(d => path.join(d, r.chainId + '.json')).filter(f => fs.existsSync(f));
      if (hits.length > 1) throw Error('DELISTED_SERIES_AMBIGUOUS:' + r.chainId);
      file = hits[0] || file;
    }
    if (!fs.existsSync(file)) { counts.missingFile++; continue; }
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (s.chainId !== r.chainId || s.status !== r.status || String(s.cik) !== String(r.cik)) throw Error('DELISTED_REGISTER_MISMATCH:' + r.chainId);
    if (!Array.isArray(s.points) || s.points.length !== r.weeks || pointsHash(s.points) !== r.pointsSha256 || s.pointsSha256 !== r.pointsSha256) throw Error('DELISTED_POINTS_HASH_MISMATCH:' + r.chainId);
    for (let k = 1; k < s.points.length; k++) if (!(s.points[k][0] > s.points[k - 1][0]) || !(s.points[k][1] > 0)) throw Error('DELISTED_INVALID_BAR:' + r.chainId);
    const mic = EXCHANGES[s.exchange] || null;
    const id = 'dl_' + r.chainId;
    const doc = {
      dataMode: 'real', securityId: id, ticker: s.ticker, listingId: 'v13delisted:' + s.exchange + ':' + r.chainId, listingStart: s.points[0][0],
      mic, currency: 'USD', provider: 'tiingo', returnBasis: 'PRICE_RETURN', adjustment: 'SPLIT_ADJUSTED', points: s.points, totalReturnPoints: s.totalReturn,
      asOf: s.lastTradeDate, identityHash: r.pointsSha256, masterGeneratedAt: null,
      listingLifecycle: { schemaVersion: SCHEMA, registryHash: registerHash, status: r.status === 'QUALIFIED' ? 'DELISTED_SOURCED_END' : 'DELISTED_CENSORED_END', cik: s.cik,
        lastTradeDate: s.lastTradeDate, lastObservedDate: s.points.at(-1)[0], terminal: { kind: s.terminal.class, scenarios: s.terminal.scenarios, secEventDate: s.terminal.secEventDate, reason: s.terminal.reason, lastRawClose: s.lastRawClose } },
      warnings: ['V13_DELISTED_RESEARCH_SERIES', 'PRIVATE_PROVIDER_DATA_HASH_BOUND', 'TERMINAL_CONSIDERATION_NOT_VERIFIED_SCENARIOS_ONLY'],
    };
    if (v110) {
      // lifecycle record schema unchanged (same row format); register identity recorded separately
      Object.assign(doc.listingLifecycle, { registerVersion: '1.1.0', registerSchemaVersion: REGISTER_110.schema });
      doc.warnings = doc.warnings.concat(['V13B_REGISTER_1_1_0']);
    }
    docs.set(id, doc);
    counts.loaded++;
  }
  return v110 ? { docs, counts, registerHash, include, registerVersion: '1.1.0' } : { docs, counts, registerHash, include };
}

module.exports = { loadDelisted, pointsHash, pyFloat, REGISTER, SCHEMA, REGISTER_110, REGISTER_VERSIONS };
