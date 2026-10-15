import test from 'node:test';
import assert from 'node:assert/strict';
import {safeCanonicalDiagnostic,safeCanonicalRejections} from '../research/certification/data-inventory.mjs';

test('canonical public diagnostic exposes only allowlisted symbolic metadata',()=>{
 const value=safeCanonicalDiagnostic({reason:'HISTORICAL_DATA_LOAD_FAILED',privateDiagnostics:{phase:'R2_SERIES',errorName:'NoSuchKey',code:'SlowDown',message:'provider key and object details',stack:'private'}});
 assert.deepEqual(value,{reason:'HISTORICAL_DATA_LOAD_FAILED',phase:'R2_SERIES',errorName:'NoSuchKey',errorCode:'SlowDown'});
 assert.equal(JSON.stringify(value).includes('provider'),false);
});

test('unknown canonical failure metadata stays private',()=>{
 assert.equal(safeCanonicalDiagnostic({reason:'SENSITIVE_PROVIDER_ERROR',privateDiagnostics:{phase:'PRIVATE_PHASE',message:'private'}}),null);
 assert.deepEqual(safeCanonicalDiagnostic({reason:'HISTORICAL_DATA_LOAD_FAILED',privateDiagnostics:{phase:'R2_SERIES',errorName:'SecretException',code:'secret-provider-value'}}),{reason:'HISTORICAL_DATA_LOAD_FAILED',phase:'R2_SERIES'});
});

test('canonical rejection receipt exposes only bounded reason aggregates',()=>{
 const value=safeCanonicalRejections({INSUFFICIENT_BARS:1,CORPORATE_ACTION_CONTRADICTED:1,PRIVATE_TICKER_ABC:1,OHLCV_INVALID:'2'},{CORPORATE_ACTION_CONTRADICTED:{SPLIT_FACTOR_OUT_OF_RANGE:1,PRIVATE_DETAIL:1}});
 assert.deepEqual(value,{reasons:{INSUFFICIENT_BARS:1,CORPORATE_ACTION_CONTRADICTED:1},unknownReasonCount:1,details:{CORPORATE_ACTION_CONTRADICTED:{SPLIT_FACTOR_OUT_OF_RANGE:1}},unknownDetailCount:1});
 assert.equal(JSON.stringify(value).includes('PRIVATE_TICKER'),false);assert.equal(JSON.stringify(value).includes('PRIVATE_DETAIL'),false);
});
