/* =========================================================================
   VISION UNIVERSE — konto/account-api.js
   Browser-Client der Konto-API (workers/vu-account). UMD wie die Engines:
   laeuft im Browser (globalThis.VUAccount) und in Node-Tests.

   Der Browser haelt KEIN Token: Die Sitzung liegt in HttpOnly-Cookies des
   API-Hosts. Jede Anfrage geht mit credentials:"include" und dem Kopf
   X-VU-Client:web (CSRF-Schutz, siehe workers/vu-account/src/http.mjs).
   Die Pruefungen hier (Passwort, E-Mail) sind nur Hinweise; verbindlich
   prueft der Server.
   ========================================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VUAccount = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MESSAGES = {
    ACCOUNTS_NOT_CONFIGURED: 'Konten sind für Vision Universe noch nicht freigeschaltet.',
    NOT_AUTHENTICATED: 'Bitte melde dich an.',
    INVALID_CREDENTIALS: 'E-Mail-Adresse oder Passwort stimmen nicht.',
    EMAIL_NOT_CONFIRMED: 'Bitte bestätige zuerst deine E-Mail-Adresse. Den Link haben wir dir geschickt.',
    REGISTRATION_CLOSED: 'Die Registrierung ist derzeit noch nicht geöffnet.',
    TERMS_REQUIRED: 'Bitte bestätige die Nutzungsbedingungen und die Datenschutzhinweise.',
    EMAIL_INVALID: 'Bitte gib eine gültige E-Mail-Adresse ein.',
    PASSWORD_LENGTH: 'Das Passwort braucht 10 bis 72 Zeichen.',
    PASSWORD_WEAK: 'Das Passwort braucht drei von vier: Kleinbuchstaben, Großbuchstaben, Ziffern, Sonderzeichen.',
    PASSWORD_UNCHANGED: 'Das neue Passwort muss sich vom bisherigen unterscheiden.',
    PASSWORD_REQUIRED: 'Bitte gib dein Passwort ein.',
    CURRENT_PASSWORD_INVALID: 'Das aktuelle Passwort stimmt nicht.',
    REAUTHENTICATION_REQUIRED: 'Bitte bestätige zuerst dein aktuelles Passwort.',
    RATE_LIMITED: 'Zu viele Versuche. Bitte warte einige Minuten.',
    ALREADY_SUBSCRIBED: 'Du hast bereits ein aktives Abonnement. Tarifwechsel und Laufzeit änderst du in der Abo-Verwaltung.',
    PRICE_NOT_AVAILABLE: 'Dieser Tarif ist gerade nicht buchbar.',
    NO_BILLING_ACCOUNT: 'Für dein Konto gibt es noch keine Zahlungsdaten.',
    NO_ACTIVE_SUBSCRIPTION: 'Es gibt kein laufendes Abonnement, das gekündigt werden kann.',
    MANAGED_BY_STORE: 'Dieses Abonnement wurde im App Store bzw. bei Google Play abgeschlossen und wird dort gekündigt.',
    BILLING_NOT_CONFIGURED: 'Abonnements sind noch nicht freigeschaltet.',
    BILLING_LIVE_MODE_NOT_APPROVED: 'Abonnements sind noch nicht freigeschaltet.',
    BILLING_WEBHOOK_NOT_CONFIGURED: 'Abonnements sind noch nicht freigeschaltet.',
    NAME_REQUIRED: 'Bitte gib deinen Namen an, damit wir die Kündigung zuordnen können.',
    CONFIRMATION_REQUIRED: 'Bitte bestätige die Löschung.',
    ORIGIN_NOT_ALLOWED: 'Diese Seite darf die Konto-Funktion nicht nutzen.',
    UPSTREAM_UNAVAILABLE: 'Der Dienst ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.',
    NETWORK: 'Keine Verbindung. Bitte prüfe deine Internetverbindung.',
    TIMEOUT: 'Die Antwort dauert zu lange. Bitte versuche es noch einmal.',
    WATCHLIST_ITEMS_LIMIT_REACHED: 'Deine Watchlist ist voll. Mit Plus oder Pro kannst du mehr Aktien beobachten.',
    WATCHLIST_LIMIT_REACHED: 'Du hast die Zahl der Watchlists deines Tarifs erreicht.',
    FEATURE_NOT_IN_PLAN: 'Diese Funktion ist in deinem Tarif nicht enthalten.',
    INSTRUMENT_INVALID: 'Diese Aktie kann nicht gespeichert werden.',
    WATCHLIST_ITEM_NOT_FOUND: 'Dieser Eintrag ist nicht mehr auf deiner Watchlist.',
    ALERTS_INVALID: 'Diese Benachrichtigung gibt es nicht.',
    TEXT_TOO_LONG: 'Die Notiz darf höchstens 500 Zeichen lang sein.',
    IMPORT_INVALID: 'Die Übernahme ist nicht möglich.'
  };

  var STATUS = {
    verified: {kind: 'ok', text: 'Deine E-Mail-Adresse ist bestätigt. Willkommen bei Vision Universe.'},
    verified_other_device: {kind: 'ok', text: 'Deine E-Mail-Adresse ist bestätigt. Bitte melde dich an.'},
    link_invalid: {kind: 'error', text: 'Der Link ist ungültig. Bitte fordere einen neuen an.'},
    link_expired: {kind: 'error', text: 'Der Link ist abgelaufen oder wurde schon verwendet.'},
    link_other_device: {kind: 'error', text: 'Bitte öffne den Link auf dem Gerät, auf dem du ihn angefordert hast, oder fordere einen neuen an.'},
    password_changed: {kind: 'ok', text: 'Dein Passwort wurde geändert.'},
    deleted: {kind: 'ok', text: 'Dein Konto wurde gelöscht.'}
  };

  var SUBSCRIPTION_STATUS = {
    incomplete: 'Zahlung ausstehend', trialing: 'Testzeitraum', active: 'Aktiv', past_due: 'Zahlung fehlgeschlagen',
    in_grace_period: 'Zahlung fehlgeschlagen', on_hold: 'Pausiert (Zahlung)', paused: 'Pausiert', unpaid: 'Unbezahlt',
    canceled: 'Beendet', expired: 'Abgelaufen', revoked: 'Widerrufen'
  };

  var PAYMENT_HOSTS = ['checkout.stripe.com', 'billing.stripe.com'];

  function config() {
    var c = (typeof globalThis !== 'undefined' && globalThis.VU_ACCOUNT_CONFIG) || {};
    return {endpoint: String(c.endpoint || '').replace(/\/+$/, ''), paymentHosts: PAYMENT_HOSTS.concat(c.paymentHosts || []),
      localSimulation: c.localSimulation === true};
  }

  function message(state) { return MESSAGES[state] || 'Das hat nicht geklappt. Bitte versuche es noch einmal.'; }

  /* Merker "angemeldet" (localStorage, kein Geheimnis: die Sitzung bleibt im HttpOnly-Cookie). Nur damit
     assets/watchlist-button.js auf Produktseiten ohne Anmeldung keine Konto-Anfrage stellt; ein veralteter
     Merker kostet hoechstens eine Anfrage und verschwindet mit der 401. Gleicher Schluessel dort. */
  var SESSION_HINT = 'vu-account-session-v1';
  function remember(path, r) {
    try {
      var ls = globalThis.localStorage;
      if (!ls) return;
      var signedIn = path === '/v1/session' ? !!(r.ok && r.data && r.data.authenticated)
        : r.status === 401 || path === '/v1/auth/logout' || (path === '/v1/me/delete' && r.ok) ? false
        : r.ok && (path === '/v1/auth/login' || path === '/v1/me' || path.indexOf('/v1/watchlist') === 0) ? true : null;
      if (signedIn === true) ls.setItem(SESSION_HINT, '1');
      else if (signedIn === false) ls.removeItem(SESSION_HINT);
    } catch (e) { /* nur Komfort */ }
  }

  function request(method, path, body, opts) {
    opts = opts || {};
    var endpoint = config().endpoint;
    if (!endpoint) return Promise.resolve({ok: false, status: 0, state: 'ACCOUNTS_NOT_CONFIGURED', data: null});
    var fetchImpl = opts.fetch || globalThis.fetch;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, opts.timeoutMs || 15000) : null;
    var headers = {'X-VU-Client': 'web'};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return fetchImpl(endpoint + path, {method: method, credentials: 'include', headers: headers, cache: 'no-store',
      body: body === undefined ? undefined : JSON.stringify(body), signal: controller ? controller.signal : undefined})
      .then(function (res) {
        return res.text().then(function (text) {
          var data = null;
          try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
          return {ok: res.ok, status: res.status, state: (data && data.state) || (res.ok ? 'OK' : 'ERROR'), data: data};
        });
      }, function (err) {
        return {ok: false, status: 0, state: err && err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK', data: null};
      })
      .then(function (r) { if (timer) clearTimeout(timer); remember(path, r); return r; });
  }

  // Dieselben Regeln wie workers/vu-account/src/validate.mjs.
  function passwordProblems(pw) {
    pw = String(pw || '');
    var problems = [];
    var bytes = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(pw).length : pw.length;
    if (pw.length < 10 || bytes > 72) problems.push('PASSWORD_LENGTH');
    var classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(function (r) { return r.test(pw); }).length;
    if (classes < 3) problems.push('PASSWORD_WEAK');
    return problems;
  }

  function emailValid(value) {
    var v = String(value || '').trim();
    return v.length <= 254 && /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(v);
  }

  // Nur https zu den bekannten Zahlungsseiten (gegen offene Weiterleitung).
  function safePaymentUrl(url) {
    try {
      var u = new URL(String(url)), c = config();
      // Nur der lokale Entwicklungsserver (scripts/account/dev-server.mjs) darf http://localhost nutzen.
      var local = c.localSimulation && u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
      return (u.protocol === 'https:' && c.paymentHosts.indexOf(u.hostname) !== -1) || local ? u.toString() : null;
    } catch (e) { return null; }
  }

  function money(cents, currency) {
    if (typeof cents !== 'number') return '–';
    return new Intl.NumberFormat('de-DE', {style: 'currency', currency: currency || 'EUR'}).format(cents / 100);
  }

  function date(iso) {
    if (!iso) return '–';
    var d = new Date(iso);
    return isNaN(d) ? '–' : d.toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: 'numeric'});
  }

  return {
    config: config, available: function () { return Boolean(config().endpoint); }, request: request, message: message,
    statusMessage: function (code) { return STATUS[code] || null; },
    subscriptionStatus: function (s) { return SUBSCRIPTION_STATUS[s] || s; },
    passwordProblems: passwordProblems, emailValid: emailValid, safePaymentUrl: safePaymentUrl, money: money, date: date,
    get: function (p, o) { return request('GET', p, undefined, o); },
    post: function (p, b, o) { return request('POST', p, b === undefined ? {} : b, o); },
    patch: function (p, b, o) { return request('PATCH', p, b, o); }
  };
});
