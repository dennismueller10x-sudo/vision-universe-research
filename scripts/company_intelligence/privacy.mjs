/* Read-only bucket privacy proof before any private acceptance snapshot upload.
   A prefix is not an ACL. Never print credentials/account/bucket values. */
import { pathToFileURL } from 'node:url';

export async function inspectPrivacy(env = process.env, fetcher = fetch) {
  const required = ['VU_HISTORY_S3_ENDPOINT', 'VU_HISTORY_S3_BUCKET', 'VU_HISTORY_S3_ACCESS_KEY_ID', 'VU_HISTORY_S3_SECRET_ACCESS_KEY'];
  const missing = required.filter(name => !env[name]);
  if (missing.length) return {status: 'BLOCKED', reason: 'MISSING_R2_BINDINGS', missing};
  const account = /^https:\/\/([a-f0-9]{32})\.r2\.cloudflarestorage\.com\/?$/i.exec(env.VU_HISTORY_S3_ENDPOINT)?.[1];
  if (!account) return {status: 'BLOCKED', reason: 'UNSUPPORTED_R2_ENDPOINT_PRIVACY_PROOF'};
  const token = env.CLOUDFLARE_API_TOKEN || env.CLOUDFLARE_TOKEN || env.CF_API_TOKEN || env.CLOUDFLARE_API;
  if (!token) return {status: 'BLOCKED', reason: 'BUCKET_PRIVACY_READ_TOKEN_UNAVAILABLE'};
  const base = `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${encodeURIComponent(env.VU_HISTORY_S3_BUCKET)}/domains/`;
  const result = {};
  for (const kind of ['managed', 'custom']) {
    const response = await fetcher(base + kind, {headers: {Authorization: 'Bearer ' + token}, signal: AbortSignal.timeout(15000), redirect: 'error'});
    if (!response.ok) return {status: 'BLOCKED', reason: 'BUCKET_PRIVACY_READ_DENIED', httpStatus: response.status};
    const data = await response.json();
    if (data.success !== true || !data.result) return {status: 'BLOCKED', reason: 'BUCKET_PRIVACY_RESPONSE_INVALID'};
    result[kind] = data.result;
  }
  if (typeof result.managed.enabled !== 'boolean' || !Array.isArray(result.custom.domains)) return {status: 'BLOCKED', reason: 'BUCKET_PRIVACY_RESPONSE_INVALID'};
  // Even a currently inactive custom domain could later recover. Require none.
  const publicConfigured = result.managed.enabled || result.custom.domains.length > 0;
  return {status: publicConfigured ? 'BLOCKED' : 'VERIFIED_NON_PUBLIC',
          reason: publicConfigured ? 'R2_BUCKET_HAS_PUBLIC_DOMAIN_CONFIGURATION' : 'MANAGED_DISABLED_NO_CUSTOM_DOMAINS',
          managedDomainEnabled: result.managed.enabled, customDomainCount: result.custom.domains.length};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await inspectPrivacy(); console.log(JSON.stringify(result));
    if (result.status !== 'VERIFIED_NON_PUBLIC') process.exitCode = 1;
  } catch { console.error('BUCKET_PRIVACY_PROOF_FAILED'); process.exitCode = 1; }
}
