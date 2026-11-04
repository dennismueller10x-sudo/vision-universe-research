// Konto-API mit Bearer-Token. Endpunkte existieren bereits im Worker; hier wird nichts Neues vorausgesetzt.
import {OFFLINE} from './auth.js';

export class ApiError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status || 0; }
}

export function createApi({config, auth, fetchImpl = (...a) => globalThis.fetch(...a)}) {
  async function call(method, path, body, retried = false) {
    const token = await auth.accessToken();
    if (!token) throw new ApiError('NOT_AUTHENTICATED', 401);
    let res;
    try {
      res = await fetchImpl(config.accountApi + path, {method, headers: {Authorization: `Bearer ${token}`,
        ...(body ? {'Content-Type': 'application/json'} : {})}, body: body ? JSON.stringify(body) : undefined});
    } catch { throw new ApiError(OFFLINE, 0); }
    if (res.status === 401 && !retried) {              // Token knapp abgelaufen: einmal erneuern, einmal wiederholen
      try { await auth.forceRefresh(); } catch { throw new ApiError('NOT_AUTHENTICATED', 401); }
      return call(method, path, body, true);
    }
    let data = null;
    try { data = await res.json(); } catch { /* leer */ }
    if (!res.ok) throw new ApiError(String(data?.state || data?.error || 'API_ERROR'), res.status);
    return data;
  }
  return {
    me: () => call('GET', '/v1/me'),
    watchlist: () => call('GET', '/v1/watchlist'),
    removeFromWatchlist: ({instrumentId, listId}) => call('POST', '/v1/watchlist/items/remove', {instrumentId, listId}),
    entitlement: feature => call('GET', '/v1/entitlements/check?feature=' + encodeURIComponent(feature)),
  };
}
