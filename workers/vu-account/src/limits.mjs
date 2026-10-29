// Ratenbegrenzung in zwei Stufen:
//   1  Cloudflare Rate Limiting Binding (env.VU_ACCOUNT_LIMITER), wenn eingerichtet
//      - gilt ueber alle Isolates.
//   2  Fester Zeitfensterzaehler je Isolate als Untergrenze.
// Dahinter liegen die Grenzen von Supabase Auth selbst (je Client-IP, sofern
// Sb-Forwarded-For freigeschaltet ist; docs/accounts/SETUP.md S3).

import {HttpError} from './http.mjs';

export const LIMITS = Object.freeze({
  login: {limit: 10, windowSec: 300},
  loginAccount: {limit: 30, windowSec: 3600}, // je Adresse, gegen verteiltes Raten (hoch genug gegen Aussperren)
  signup: {limit: 5, windowSec: 3600},
  recover: {limit: 5, windowSec: 3600},
  cancellation: {limit: 5, windowSec: 3600},
  cancellationEmail: {limit: 3, windowSec: 86400}, // Bestaetigungen an dieselbe Adresse
  sensitive: {limit: 10, windowSec: 3600}, // Passwort, Loeschung, Checkout
  watchlist: {limit: 120, windowSec: 60},
  planIntent: {limit: 30, windowSec: 3600}, // Tarifwahl merken/verwerfen je Konto // Merken/Entfernen je Konto (Lesezeichen in den Produktwelten)
});

export function createLimiter({binding, now = () => Date.now()} = {}) {
  const windows = new Map();
  return async function check(kind, key) {
    const rule = LIMITS[kind];
    if (!rule || !key) return;
    if (binding && typeof binding.limit === 'function') {
      const {success} = await binding.limit({key: `${kind}:${key}`});
      if (!success) throw new HttpError(429, 'RATE_LIMITED');
    }
    const bucket = `${kind}:${key}:${Math.floor(now() / 1000 / rule.windowSec)}`;
    const count = (windows.get(bucket) || 0) + 1;
    windows.set(bucket, count);
    if (windows.size > 5000) for (const k of [...windows.keys()].slice(0, 2500)) windows.delete(k);
    if (count > rule.limit) throw new HttpError(429, 'RATE_LIMITED');
  };
}
