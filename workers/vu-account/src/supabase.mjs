// Supabase ohne SDK: Auth (GoTrue) und Datenbank (PostgREST).
//
// Schluessel:
//   publishable  sb_publishable_… - nur zusammen mit dem Nutzer-JWT: Postgres
//                prueft dann RLS als Rolle "authenticated".
//   secret       sb_secret_… - nur im Worker (Secret), nie im Browser. Fuer
//                Abrechnungsfunktionen (billing_*), Admin-Loeschung und Auth-
//                Aufrufe mit weitergereichter Client-IP (Sb-Forwarded-For).

export class SupabaseError extends Error {
  constructor(status, code, message) {
    super(code || 'SUPABASE_ERROR');
    this.status = status;
    this.code = code;
    this.upstreamMessage = message;
  }
}

export function createSupabase({url, publishableKey, secretKey, fetchImpl, forwardClientIp = false}) {
  const serviceHeaders = () => {
    const h = {apikey: secretKey};
    if (secretKey.startsWith('eyJ')) h.Authorization = `Bearer ${secretKey}`; // altes service_role-JWT
    return h;
  };

  async function call(path, {method = 'GET', headers = {}, body, query} = {}) {
    let target = url + path;
    if (query) target += '?' + new URLSearchParams(query).toString();
    const res = await fetchImpl(target, {method, headers: {Accept: 'application/json', ...(body !== undefined ? {'Content-Type': 'application/json'} : {}), ...headers},
      body: body !== undefined ? JSON.stringify(body) : undefined});
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok) {
      throw new SupabaseError(res.status, data?.error_code || data?.code || data?.error || 'SUPABASE_ERROR',
        data?.msg || data?.message || data?.error_description || '');
    }
    return data;
  }

  const authHeaders = (ip, token) => ({...serviceHeaders(), ...(token ? {Authorization: `Bearer ${token}`} : {}),
    ...(forwardClientIp && ip ? {'Sb-Forwarded-For': ip} : {})});

  const auth = {
    signUp: ({email, password, data, codeChallenge, redirectTo, ip}) => call('/auth/v1/signup', {method: 'POST',
      headers: authHeaders(ip), query: {redirect_to: redirectTo},
      body: {email, password, data, code_challenge: codeChallenge, code_challenge_method: 's256'}}),
    signInWithPassword: ({email, password, ip}) => call('/auth/v1/token', {method: 'POST', headers: authHeaders(ip),
      query: {grant_type: 'password'}, body: {email, password}}),
    refresh: ({refreshToken, ip}) => call('/auth/v1/token', {method: 'POST', headers: authHeaders(ip),
      query: {grant_type: 'refresh_token'}, body: {refresh_token: refreshToken}}),
    exchangeCode: ({authCode, codeVerifier, ip}) => call('/auth/v1/token', {method: 'POST', headers: authHeaders(ip),
      query: {grant_type: 'pkce'}, body: {auth_code: authCode, code_verifier: codeVerifier}}),
    recover: ({email, codeChallenge, redirectTo, ip}) => call('/auth/v1/recover', {method: 'POST', headers: authHeaders(ip),
      query: {redirect_to: redirectTo}, body: {email, code_challenge: codeChallenge, code_challenge_method: 's256'}}),
    updatePassword: ({accessToken, password, ip}) => call('/auth/v1/user', {method: 'PUT',
      headers: authHeaders(ip, accessToken), body: {password}}),
    // Eigenes Konto lesen bzw. user_metadata ergaenzen (Tarifwahl vor der Registrierung, kein Recht, nur ein Hinweis).
    getUser: ({accessToken, ip}) => call('/auth/v1/user', {headers: authHeaders(ip, accessToken)}),
    updateUserData: ({accessToken, data, ip}) => call('/auth/v1/user', {method: 'PUT',
      headers: authHeaders(ip, accessToken), body: {data}}),
    logout: ({accessToken, ip}) => call('/auth/v1/logout', {method: 'POST', headers: authHeaders(ip, accessToken),
      query: {scope: 'local'}}),
    adminDeleteUser: userId => call(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {method: 'DELETE', headers: serviceHeaders()}),
  };

  // Nutzerdaten mit RLS: publishable key + Nutzer-JWT.
  const asUser = token => ({apikey: publishableKey, Authorization: `Bearer ${token}`});
  const user = {
    select: (token, table, query) => call(`/rest/v1/${table}`, {headers: asUser(token), query: {select: '*', ...query}}),
    update: (token, table, filter, body) => call(`/rest/v1/${table}`, {method: 'PATCH',
      headers: {...asUser(token), Prefer: 'return=representation'}, query: filter, body}),
    rpc: (token, fn, args = {}) => call(`/rest/v1/rpc/${fn}`, {method: 'POST', headers: asUser(token), body: args}),
  };

  // Oeffentlicher Katalog: publishable key ohne Nutzer (Rolle anon).
  const anon = {
    select: (table, query) => call(`/rest/v1/${table}`, {headers: {apikey: publishableKey}, query: {select: '*', ...query}}),
  };

  const service = {
    rpc: (fn, args = {}) => call(`/rest/v1/rpc/${fn}`, {method: 'POST', headers: serviceHeaders(), body: args}),
  };

  return {auth, user, anon, service};
}

// Abrechnungsspeicher: jede Methode ist genau eine Datenbankfunktion
// (supabase/migrations/20261025000300_billing.sql). Keine Logik hier.
export function createBillingStore(service) {
  return {
    claimEvent: (provider, eventId, type, livemode, objectId) => service.rpc('billing_claim_event',
      {p_provider: provider, p_event_id: eventId, p_event_type: type, p_livemode: livemode, p_object_id: objectId}),
    finishEvent: (provider, eventId, status, error = null, userId = null) => service.rpc('billing_finish_event',
      {p_provider: provider, p_event_id: eventId, p_status: status, p_error: error, p_user_id: userId}),
    linkCustomer: (userId, provider, customerId) => service.rpc('billing_link_customer',
      {p_user_id: userId, p_provider: provider, p_customer_id: customerId}),
    customerForUser: (userId, provider) => service.rpc('billing_customer_for_user', {p_user_id: userId, p_provider: provider}),
    applySubscription: snapshot => service.rpc('billing_apply_subscription', {p: snapshot}),
    applyInvoice: snapshot => service.rpc('billing_apply_invoice', {p: snapshot}),
    blockingSubscription: userId => service.rpc('billing_blocking_subscription', {p_user_id: userId}),
    entitlements: userId => service.rpc('effective_entitlements', {p_user_id: userId}),
    recordDeletion: (userId, canceled) => service.rpc('billing_record_deletion', {p_user_id: userId, p_canceled: canceled}),
    recordCancellation: entry => service.rpc('billing_record_cancellation', {p: entry}),
    updateCancellation: (id, patch) => service.rpc('billing_update_cancellation', {p_id: id, p: patch}),
    userByEmail: email => service.rpc('billing_user_by_email', {p_email: email}),
    getCancellation: id => service.rpc('billing_cancellation_get', {p_id: id}),
    proposeCancellationMatch: id => service.rpc('billing_propose_cancellation_match', {p_id: id}),
    setCancellationMatch: (id, userId, operator) => service.rpc('billing_set_cancellation_match',
      {p_id: id, p_user: userId, p_operator: operator}),
    cancellationQueue: (limit = 50) => service.rpc('billing_cancellation_queue', {p_limit: limit}),
    cancellationHealth: () => service.rpc('billing_cancellation_health'),
    enqueueMail: entry => service.rpc('billing_enqueue_mail', {p: entry}),
    claimDueMails: (limit = 20) => service.rpc('billing_claim_due_mails', {p_limit: limit}),
    mailResult: (id, result, error = null) => service.rpc('billing_mail_result', {p_id: id, p_result: result, p_error: error}),
    resolveMails: (cancellationId, action, operator, note = null) => service.rpc('billing_resolve_mails',
      {p_cancellation: cancellationId, p_action: action, p_operator: operator, p_note: note}),
  };
}
