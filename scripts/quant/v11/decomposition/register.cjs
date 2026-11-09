#!/usr/bin/env node
'use strict';
// V11 DECOMPOSITION - registration stage (no outcomes). Writes docs/quant-recovery/v11/decomposition/registration-1.0.0.json.
// Usage: node register.cjs [--out <file>]   (default: the committed docs path)
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../../..');
const V = require(ROOT + '/quant/engines/research-validation.cjs');
const { plan, PROTOCOL_FILE } = require('./plan.cjs');
const REG_FILE = path.join(ROOT, 'docs/quant-recovery/v11/decomposition/registration-1.0.0.json');

function protocolHash() {
  const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, PROTOCOL_FILE))).digest('hex');
  const want = fs.readFileSync(path.join(ROOT, PROTOCOL_FILE.replace(/\.json$/, '.sha256')), 'utf8').split(/\s+/)[0];
  if (h !== want) throw Error('PROTOCOL_HASH_MISMATCH');
  return h;
}
function readRegistration(file = REG_FILE) {
  const reg = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (V.hash(reg.registration) !== reg.registrationHash) throw Error('REGISTRATION_HASH_MISMATCH');
  if (reg.registration.protocol.sha256 !== protocolHash()) throw Error('PROTOCOL_CHANGED_SINCE_REGISTRATION');
  return reg;
}
if (require.main === module) {
  const i = process.argv.indexOf('--out'), out = i > 0 ? path.resolve(process.argv[i + 1]) : REG_FILE;
  if (out === REG_FILE && fs.existsSync(REG_FILE)) { console.log(JSON.stringify({ state: 'REGISTRATION_EXISTS', registrationHash: readRegistration().registrationHash })); process.exit(0); }
  const body = { ...plan(protocolHash()), registeredAt: new Date().toISOString() };
  const doc = { registration: body, registrationHash: V.hash(body) };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
  console.log(JSON.stringify({ registrationHash: doc.registrationHash, out: path.relative(ROOT, out) }));
}
module.exports = { readRegistration, protocolHash, REG_FILE, ROOT };
