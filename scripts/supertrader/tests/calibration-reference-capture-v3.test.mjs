import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyReferenceCaptureBindings} from '../research/calibration/capture-reference-v3.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const CAL=path.join(ROOT,'scripts/supertrader/research/calibration');

test('V3 reference capture binds official inputs, candidate plan, and exact parser bytes',()=>{
 const planBytes=fs.readFileSync(path.join(CAL,'CALIBRATION-V3-REFERENCE-SOURCE-PLAN.json'));
 const plan=JSON.parse(planBytes),freeze=JSON.parse(fs.readFileSync(path.join(CAL,'BACKTEST-CALIBRATION-FREEZE-V3.json')));
 const parserBytes=fs.readFileSync(path.join(CAL,'reference-return-arithmetic.mjs'));
 assert.equal(verifyReferenceCaptureBindings({plan,planBytes,freeze,parserBytes}),true);
 assert.throws(()=>verifyReferenceCaptureBindings({plan,planBytes:Buffer.from('changed'),freeze,parserBytes}),/V3_REFERENCE_PLAN_FREEZE_HASH_MISMATCH/);
});
