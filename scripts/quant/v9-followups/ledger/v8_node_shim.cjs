#!/usr/bin/env node
'use strict';
// Stand-in for `node -e <runPortfolio>` used by scripts/quant/verify-research-portfolio.py (--node).
// Runs ENGINE (a research-portfolio.cjs path) on stdin and re-stamps only the identity fields with the
// recorded V8 runtime (V8_REF nodeRuntime) and the recorded 1.1.0 engine identity (OLD_IDENTITY json:
// {VERSION, sourceHashes}), then recomputes generation and resultHash exactly as the engine does.
// Equal recorded hashes therefore prove every non-identity field of the result is byte-identical.
const fs = require('node:fs'), path = require('node:path');
const P = require(path.resolve(process.env.ENGINE));
const OLD = JSON.parse(fs.readFileSync(process.env.OLD_IDENTITY, 'utf8'));
const runtime = JSON.parse(fs.readFileSync(process.env.V8_REF, 'utf8')).nodeRuntime;
const r = P.runPortfolio(JSON.parse(fs.readFileSync(0, 'utf8')));
const x = { ...r, schemaVersion: OLD.VERSION, sourceHashes: OLD.sourceHashes, runtime };
delete x.resultHash; delete x.generation;
x.generation = P.hash({ version: OLD.VERSION, inputHash: x.inputHash, sourceHashes: x.sourceHashes, runtime: x.runtime });
x.resultHash = P.hash(x);
process.stdout.write(JSON.stringify(x));
