'use strict';
const {cors, json, preflight} = require('../../server/http.js');
let driverPromise;
function configuredDriver() {
  if (!driverPromise) driverPromise = import('../market/storage/s3-driver.mjs').then(m => m.createS3DriverFromEnv());
  return driverPromise;
}
function createHandler({env = process.env, getDriver = configuredDriver, now = Date.now} = {}) {
  return async function handler(req, res) {
    if (preflight(req, res)) return;
    if (req.method !== 'GET') return json(req, res, 405, {state: 'METHOD_NOT_ALLOWED'});
    if (!cors(req, res)) return json(req, res, 403, {state: 'ORIGIN_NOT_ALLOWED'});
    if (env.COMPANY_INTELLIGENCE_ENABLED !== 'true') return json(req, res, 200, {state: 'DISABLED'});
    const namespace = env.COMPANY_INTELLIGENCE_CONSUMER_NAMESPACE;
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(namespace || '')) return json(req, res, 200, {state: 'UNAVAILABLE', reason: 'NOT_CONFIGURED'});
    const url = new URL(req.url, 'http://localhost');
    const asset = url.searchParams.get('asset');
    if ([...url.searchParams.keys()].some(k => k !== 'asset') || url.searchParams.getAll('asset').length !== 1) return json(req, res, 400, {state: 'INVALID_REQUEST'});
    try {
      const delivery = await import('./public-delivery.mjs');
      if (!delivery.allowedAsset(asset)) return json(req, res, 400, {state: 'INVALID_PATH'});
      const result = await delivery.readAsset(await getDriver(), {namespace, asset, now: now()});
      res.setHeader('X-Company-Intelligence-Generation', result.generation);
      res.setHeader('X-Company-Intelligence-Stale', String(result.stale));
      return json(req, res, 200, JSON.parse(result.bytes));
    } catch {
      return json(req, res, 200, {state: 'UNAVAILABLE', reason: 'CONSUMER_UNAVAILABLE'});
    }
  };
}
module.exports = createHandler();
module.exports.createHandler = createHandler;
