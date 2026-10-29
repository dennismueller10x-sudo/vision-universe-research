#!/usr/bin/env node
'use strict';
// V13 STUDIES - writes the F0 source manifest (V10 common.sourceManifest of the lifecycle frame) into a private run directory
// as input for the independent Python check (same convention as verify_v10_studies.py: loader qualification is an input).
//   node scripts/quant/v13/studies/export-f0-manifest.cjs --private <dir>
const path = require('node:path');
const W = require('./lib.cjs'), K = W.K;
const o = W.args(process.argv.slice(2), { private: null });
const fr0 = K.buildFrame(W.F0_LOADER), man = K.sourceManifest(fr0);
K.writeJson(path.join(K.privateDir(o.private), 'F0-source-manifest.json.gz'), man, true);
console.log(JSON.stringify({ frame: fr0.frame.length, manifestHash: K.V.hash(man) }));
