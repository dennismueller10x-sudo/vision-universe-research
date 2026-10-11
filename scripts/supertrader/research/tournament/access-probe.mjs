// Read-only configured R2 probe. No credential or provider value reaches stdout.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createS3DriverFromEnv } from '../../../market/storage/s3-driver.mjs';
const require = createRequire(import.meta.url);
const Store = require('../../../../quant/engines/history-store.js');
const out = process.argv[process.argv.indexOf('--out') + 1];
if (!out || out === process.argv[0]) throw new Error('Explicit --out required');
fs.mkdirSync(out, {recursive:true});
let result;
try {
  const driver = createS3DriverFromEnv(process.env);
  const store = Store.createHistoryStore({driver,provider:'tiingo-delisted',market:'US'});
  const raw = await driver.get(store.seriesPrefix + '_validation/manifest.json.gz');
  const manifest = raw ? JSON.parse(zlib.gunzipSync(raw)) : null;
  result = {schema:'supertrader-tournament-access-1',status:manifest ? 'AVAILABLE' : 'MISSING_MANIFEST',entries:Object.keys(manifest?.entries || {}).length};
} catch { result = {schema:'supertrader-tournament-access-1',status:'PRIVATE_ACCESS_FAILED',entries:0}; }
fs.writeFileSync(path.join(out,'access-status.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
if (result.status !== 'AVAILABLE') process.exitCode = 2;
