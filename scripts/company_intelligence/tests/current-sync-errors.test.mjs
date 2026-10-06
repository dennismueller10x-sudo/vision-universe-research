import test from 'node:test';
import assert from 'node:assert/strict';
import {safeFailureCode} from '../sync-state.mjs';

test('state handoff distinguishes missing namespace from authorization failure without SDK secrets',()=>{
  assert.equal(safeFailureCode(new Error('REMOTE_STATE_MISSING_INITIALIZATION_REQUIRED')),'REMOTE_STATE_MISSING_INITIALIZATION_REQUIRED');
  assert.equal(safeFailureCode({$metadata:{httpStatusCode:403},message:'private endpoint and credential'}),'PRIVATE_STATE_READ_ACCESS_DENIED');
  assert.equal(safeFailureCode({name:'NoSuchKey',message:'private object key'}),'PRIVATE_STATE_OBJECT_NOT_FOUND');
  assert.equal(safeFailureCode(new Error('credential=SECRET https://private.example/object')),'PRIVATE_STATE_STORAGE_REQUEST_FAILED');
});
