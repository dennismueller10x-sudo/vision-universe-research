/* Simple client-side development/marketing barrier; this is not server-side auth.
   Since version 2 the public verifier alone no longer opens pages (the browser
   must hold the password-derived key). The original documents under
   /__research/content/ remain directly retrievable - only a server-side gate
   closes that (see docs/RESEARCH_ACCESS_GATE.md). */
(function () {
  'use strict';
  var settings = document.getElementById('research-access-settings');
  var loader = document.querySelector('script[data-content]');
  var form = document.getElementById('research-access-form');
  var field = document.getElementById('research-password');
  var error = document.getElementById('research-access-error');
  var gate = document.getElementById('research-access-gate');
  var button = form.querySelector('button');
  var config = JSON.parse(settings.textContent);
  var route = location.pathname.replace(/\/index\.html$/, '').replace(/\/$/, '');
  var busy = false;

  function message(text) { error.textContent = text; error.hidden = false; }
  function clearAccess() {
    try { localStorage.removeItem(config.storageKey); } catch (_) { /* storage may be unavailable */ }
  }
  function hex(buffer) { return Array.from(new Uint8Array(buffer), function (byte) { return byte.toString(16).padStart(2, '0'); }).join(''); }
  async function verifierFor(key) {
    return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(config.keyContext + key)));
  }
  // Only the password-derived key opens pages. The published verifier is its
  // SHA-256; writing the verifier itself into storage no longer grants access.
  async function granted() {
    try {
      var state = JSON.parse(localStorage.getItem(config.storageKey) || 'null');
      var now = Date.now();
      if (state && state.version === config.version && typeof state.key === 'string' && /^[0-9a-f]{64}$/.test(state.key) &&
          Number.isFinite(state.expiresAt) && state.expiresAt > now && state.expiresAt <= now + config.durationMs &&
          await verifierFor(state.key) === config.verifier) return true;
    } catch (_) { /* absent, expired, forged or unavailable storage remains gated */ }
    clearAccess();
    return false;
  }
  function localTarget(value) {
    try {
      if (!value || value.charAt(0) !== '/' || /[\\\r\n]/.test(value)) return '/';
      var url = new URL(value, location.origin);
      if (url.origin !== location.origin || url.pathname.indexOf('/__research/') === 0) return '/';
      return url.pathname + url.search + url.hash;
    } catch (_) { return '/'; }
  }
  async function openPage() {
    if (route === '/__research/login') {
      location.replace(localTarget(new URLSearchParams(location.search).get('next')));
      return;
    }
    gate.hidden = true;
    try {
      var response = await fetch(loader.getAttribute('data-content'), {cache: 'no-cache'});
      if (!response.ok) throw Error('Page unavailable');
      var html = await response.text();
      // Keep the original URL, query, hash, relative asset URLs and script order.
      // Only the original document now parses/renders; no app code ran before access.
      document.open();
      document.write(html);
      document.close();
    } catch (_) {
      gate.hidden = false;
      message('Die Seite konnte nicht geladen werden. Bitte erneut laden.');
    }
  }
  if (route === '/__research/logout') {
    clearAccess();
    location.replace('/__research/login/');
    return;
  }

  async function login(event) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    button.disabled = true;
    error.hidden = true;
    try {
      if (!window.crypto || !crypto.subtle) throw Error('Browser unavailable');
      var salt = Uint8Array.from(atob(config.salt), function (character) { return character.charCodeAt(0); });
      var material = await crypto.subtle.importKey('raw', new TextEncoder().encode(field.value), 'PBKDF2', false, ['deriveBits']);
      var key = hex(await crypto.subtle.deriveBits({name: 'PBKDF2', salt: salt, iterations: config.iterations, hash: 'SHA-256'}, material, 256));
      if (await verifierFor(key) !== config.verifier) {
        message('Passwort nicht korrekt.');
        field.select();
        return;
      }
      try {
        localStorage.setItem(config.storageKey, JSON.stringify({version: config.version, key: key,
          expiresAt: Date.now() + config.durationMs}));
      } catch (_) {
        message('Bitte Website-Daten im Browser erlauben, damit der Zugang gespeichert werden kann.');
        return;
      }
      // A real document navigation also allows password managers to detect success.
      location.reload();
    } catch (_) {
      message('Der Zugang konnte nicht geöffnet werden. Bitte erneut versuchen.');
    } finally {
      busy = false;
      button.disabled = false;
    }
  }
  form.addEventListener('submit', login);
  granted().then(function (ok) { if (ok) openPage(); });
}());
