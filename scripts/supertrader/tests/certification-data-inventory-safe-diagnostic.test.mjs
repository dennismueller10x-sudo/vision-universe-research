import test from 'node:test';
import assert from 'node:assert/strict';
import {safeCanonicalDiagnostic} from '../research/certification/data-inventory.mjs';

test('canonical public diagnostic exposes only allowlisted symbolic metadata',()=>{
 const value=safeCanonicalDiagnostic({reason:'HISTORICAL_DATA_LOAD_FAILED',privateDiagnostics:{phase:'R2_SERIES',message:'provider key and object details',stack:'private'}});
 assert.deepEqual(value,{reason:'HISTORICAL_DATA_LOAD_FAILED',phase:'R2_SERIES'});
 assert.equal(JSON.stringify(value).includes('provider'),false);
});

test('unknown canonical failure metadata stays private',()=>{
 assert.equal(safeCanonicalDiagnostic({reason:'SENSITIVE_PROVIDER_ERROR',privateDiagnostics:{phase:'PRIVATE_PHASE',message:'private'}}),null);
});
