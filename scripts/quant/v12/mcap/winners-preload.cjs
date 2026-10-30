'use strict';
// V12 MCAP: preload for re-running the V11 winners build (scripts/quant/v11/winners/build.cjs) with the corrected PIT
// market cap, without changing any V10/V11 file:
//   node -r ./scripts/quant/v12/mcap/winners-preload.cjs scripts/quant/v11/winners/build.cjs --private <dir>
// It wraps scripts/quant/v10/studies/common.cjs#buildPanel (to know each listing's date array), factors.cjs#marketCapAt
// (V10 value first, then quant/engines/research-pit-market-cap.cjs#marketCapAt). Listing identity is resolved from the
// date array that build.cjs passes (the panel entry's own array, identity checked, fail-closed).
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../../../..');
const K = require(ROOT + '/scripts/quant/v10/studies/common.cjs');
const X = require(ROOT + '/scripts/quant/v10/factor/factors.cjs');
const Fc = require(ROOT + '/scripts/quant/v10/factor/common.cjs');
const M = require(ROOT + '/quant/engines/research-pit-market-cap.cjs');

const register = M.loadRegister(), peers = Fc.peerTable(), byDates = new Map(), counts = {};
const origBuild = K.buildPanel, origMc = X.marketCapAt;
K.buildPanel = (...a) => { const panel = origBuild(...a); for (const p of panel) byDates.set(p.dates, p); return panel; };
X.marketCapAt = args => {
  const base = origMc(args);
  if (base.value === null) return base;
  const p = byDates.get(args.dates);
  if (!p) throw Error('MCAP_PRELOAD_LISTING_UNKNOWN');
  const cik = p.doc.identityEvidenceBinding?.cik || peers.get(p.id)?.cik || null;
  const splits = (p.doc.corporateActions?.splits || []).map(s => [s[0], s[1]]);
  const r = M.marketCapAt({ ...args, securityId: p.id, cik, splits }, base, register);
  const k = r.status + (r.classes.length ? ':' + r.classes.join('+') : ''); counts[k] = (counts[k] || 0) + 1;
  return r.value === null ? { value: null, reason: 'V12_MCAP_' + (r.reason || 'EXCLUDED') } : { ...base, value: r.value };
};
process.on('exit', () => { process.stderr.write('v12-mcap-correction ' + JSON.stringify({ ruleVersion: register.meta.ruleVersion, counts }) + '\n'); });
