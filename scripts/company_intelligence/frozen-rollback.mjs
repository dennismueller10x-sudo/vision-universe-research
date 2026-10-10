/* Explicit rollback only: an independently restored frozen generation may
   replace the inactive slot, even when that slot contains a newer generation.
   Normal incremental publication retains its monotonic timestamp guard. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {preflight} from './public-delivery.mjs';
import {refreshApproved,frozenTickers} from './refresh-approval.mjs';
import {prepareCandidate} from './refresh-storage.mjs';
export async function prepareFrozenRollback(driver,{namespace,directory,good,frozen}){
 const manifest=JSON.parse(readFileSync(join(directory,'manifest.json')));
 assert(refreshApproved(frozen?.manifest),'APPROVED_FROZEN_ROLLBACK_REQUIRED');
 assert.deepEqual(manifest,frozen.manifest,'FROZEN_ROLLBACK_MANIFEST_MISMATCH');
 assert.deepEqual([...manifest.tickers].sort(),[...frozenTickers].sort(),'FROZEN_ROLLBACK_SCOPE_MISMATCH');
 preflight(directory,manifest);
 // Keep the current GOOD protected. Only the inactive previous slot is reused;
 // the separate frozen namespace remains immutable and hash-verified.
 return prepareCandidate(driver,{namespace,directory,good:good?{...good,previous:null}:null});
}
