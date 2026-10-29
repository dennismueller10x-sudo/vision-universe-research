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
function readRegister(root) {
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

// loadDelisted(root, { dir, include }) -> { docs: Map(id -> doc), counts, registerHash }
// include: 'QUALIFIED' (default; only source-backed ends) or 'ALL_LOADABLE' (adds PRICE_ONLY_CENSORED_END, censored, for sensitivities).
function loadDelisted(root, options) {
  if (!options || typeof options.dir !== 'string') throw Error('DELISTED_DIR_REQUIRED');
  const include = options.include || 'QUALIFIED';
  if (!['QUALIFIED', 'ALL_LOADABLE'].includes(include)) throw Error('DELISTED_INCLUDE_INVALID');
  const { rows, registerHash } = readRegister(root);
  const want = [...rows.values()].filter(r => include === 'QUALIFIED' ? r.status === 'QUALIFIED' : STATUSES_LOADABLE.includes(r.status));
  const docs = new Map(), counts = { requested: want.length, loaded: 0, missingFile: 0 };
  for (const r of want) {
    const file = path.join(options.dir, r.chainId + '.json');
    if (!fs.existsSync(file)) { counts.missingFile++; continue; }
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (s.chainId !== r.chainId || s.status !== r.status || String(s.cik) !== String(r.cik)) throw Error('DELISTED_REGISTER_MISMATCH:' + r.chainId);
    if (!Array.isArray(s.points) || s.points.length !== r.weeks || pointsHash(s.points) !== r.pointsSha256 || s.pointsSha256 !== r.pointsSha256) throw Error('DELISTED_POINTS_HASH_MISMATCH:' + r.chainId);
    for (let k = 1; k < s.points.length; k++) if (!(s.points[k][0] > s.points[k - 1][0]) || !(s.points[k][1] > 0)) throw Error('DELISTED_INVALID_BAR:' + r.chainId);
    const mic = EXCHANGES[s.exchange] || null;
    const id = 'dl_' + r.chainId;
    docs.set(id, {
      dataMode: 'real', securityId: id, ticker: s.ticker, listingId: 'v13delisted:' + s.exchange + ':' + r.chainId, listingStart: s.points[0][0],
      mic, currency: 'USD', provider: 'tiingo', returnBasis: 'PRICE_RETURN', adjustment: 'SPLIT_ADJUSTED', points: s.points, totalReturnPoints: s.totalReturn,
      asOf: s.lastTradeDate, identityHash: r.pointsSha256, masterGeneratedAt: null,
      listingLifecycle: { schemaVersion: SCHEMA, registryHash: registerHash, status: r.status === 'QUALIFIED' ? 'DELISTED_SOURCED_END' : 'DELISTED_CENSORED_END', cik: s.cik,
        lastTradeDate: s.lastTradeDate, lastObservedDate: s.points.at(-1)[0], terminal: { kind: s.terminal.class, scenarios: s.terminal.scenarios, secEventDate: s.terminal.secEventDate, reason: s.terminal.reason, lastRawClose: s.lastRawClose } },
      warnings: ['V13_DELISTED_RESEARCH_SERIES', 'PRIVATE_PROVIDER_DATA_HASH_BOUND', 'TERMINAL_CONSIDERATION_NOT_VERIFIED_SCENARIOS_ONLY'],
    });
    counts.loaded++;
  }
  return { docs, counts, registerHash, include };
}

module.exports = { loadDelisted, pointsHash, pyFloat, REGISTER, SCHEMA };
