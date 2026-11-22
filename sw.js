/* E5 + Zweitbesuch. Programmdateien mit Inhaltshash (?v=<16+ Hex>): cache-first, nie neu geladen (der Hash IST die Version).
   Sonstige Assets mit ?v=: stale-while-revalidate. Daten: bei offenem US-Markt (Mo-Fr 04:00-20:00 New York, Feiertage
   konservativ als offen) nie aus dem Cache und nie gespeichert; sonst frisch bis 2 min, bis 30 min veraltet nur mit
   Hintergrund-Abgleich, danach Netz. Navigationen immer Netz, dann Offline-Seite. Konto, Login, Zahlung, Gate, API,
   Anfragen mit Anmeldung, Drittanbieter und fehlerhafte Antworten nie. Notausschalter: /sw-kill.json {"kill":true}. */
'use strict';
var PREFIX = 'vu-shell-', CACHE = PREFIX + 'e5-v2', DATA = CACHE + '-data';
var PRECACHE = ['/offline.html', '/assets/icons/icon-192.png'];
var FRESH_MS = 120000, STALE_MS = 1800000, ASSET_LIMIT = 160, DATA_LIMIT = 32, KILL_EVERY_MS = 600000;
var EXCLUDE = /^\/(konto|mein-dashboard|willkommen|v1|api|auth|login|logout|checkout|stripe|zahlung|admin|company-intelligence|worker|workers|supabase|server)(\/|$)|(^|\/)(login|checkout|auth|protected|gate|passwort|password)([\/.\-_]|$)|sw-kill\.json$/i;
var killed = false, killCheckedAt = 0;
/* Boerse offen (Vor-/Nachmarkt eingeschlossen): Mo-Fr 04:00-20:00 America/New_York. Feiertage zaehlen als offen: kostet nur Cache. */
function marketOpen(ms) {
  try {
    var p = {}; new Intl.DateTimeFormat('en-US', {timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    if (p.weekday === 'Sat' || p.weekday === 'Sun') return false;
    var m = Number(p.hour) * 60 + Number(p.minute); return m >= 240 && m < 1200;
  } catch (e) { return true; }
}
function wipe() {
  killed = true;
  return caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k.indexOf(PREFIX) === 0; }).map(function (k) { return caches.delete(k); })); })
    .then(function () { return self.registration && self.registration.unregister ? self.registration.unregister() : null; }).catch(function () {});
}
function checkKill(force) {
  if (killed || (!force && Date.now() - killCheckedAt < KILL_EVERY_MS)) return Promise.resolve();
  killCheckedAt = Date.now();
  return fetch('/sw-kill.json', {cache: 'no-store'}).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && j.kill === true) return wipe(); }).catch(function () {});
}
function trim(cache, limit) {
  return cache.keys().then(function (keys) { return Promise.all(keys.filter(function (key) { return PRECACHE.indexOf(new URL(key.url).pathname) < 0; }).slice(0, Math.max(0, keys.length - limit)).map(function (key) { return cache.delete(key); })); });
}
function storable(response) {
  return response.ok && !response.redirected && !/no-store|private/i.test(response.headers.get('cache-control') || '');
}
function save(cache, request, response, limit, stamp) {
  if (!storable(response)) return Promise.resolve();
  var copy = response.clone();
  if (stamp) {
    var headers = new Headers(copy.headers); headers.set('x-vu-cached-at', String(Date.now()));
    copy = new Response(copy.body, {status: copy.status, statusText: copy.statusText, headers: headers});
  }
  return cache.put(request, copy).then(function () { return trim(cache, limit); }).catch(function () {});
}
self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(PRECACHE); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf(PREFIX) === 0 && k !== CACHE && k !== DATA; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return checkKill(true); }).then(function () { return killed ? null : self.clients.claim(); }));
});
self.addEventListener('fetch', function (event) {
  var req = event.request, url = new URL(req.url);
  if (killed || req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.waitUntil(checkKill(false));
    event.respondWith(fetch(req).catch(function () { return caches.match('/offline.html').then(function (r) { return r || Response.error(); }); }));
    return;
  }
  // Version query strings remain distinct. Never persist signed/token URLs.
  if (EXCLUDE.test(url.pathname) || req.credentials === 'include' || (req.headers && req.headers.has && req.headers.has('authorization'))) return;
  if (Array.from(url.searchParams.keys()).some(function (k) { return k !== 'v'; })) return;
  var publicData = /^\/(quant|discover|supertrader|technical|fundamental|screener)\/data\//.test(url.pathname) && /\.json(?:\.gz)?$/.test(url.pathname);
  var asset = /^\/(assets|discover|quant|technical|fundamental|supertrader|analysten)\//.test(url.pathname) && /\.(?:css|js|woff2|png|webp|jpg|svg)$/.test(url.pathname);
  if (!publicData && !asset) return;
  // Never mix independently updated unversioned code from two deployments.
  if (asset && /\.(?:js|css)$/.test(url.pathname) && !url.searchParams.get('v')) return;
  if (req.cache === 'no-store') return;
  // The fetch promise is attached synchronously to waitUntil (including cache
  // hits), so revalidation survives the response and a closing browser tab.
  var open = publicData && marketOpen(Date.now());
  // Offener Markt: Daten nie aus dem Cache, nie speichern. Immer am Browser-Cache vorbei zum Netz (GitHub Pages: max-age 600).
  if (open) { event.respondWith(fetch(req, {cache: req.cache === 'reload' ? 'reload' : 'no-cache'})); return; }
  var hashed = asset && /^[0-9a-f]{16,}$/.test(url.searchParams.get('v') || '');
  var task = caches.open(publicData ? DATA : CACHE).then(function (cache) {
    return cache.match(req).then(function (hit) {
      var age = hit ? Date.now() - Number(hit.headers.get('x-vu-cached-at') || 0) : Infinity;
      var force = req.cache === 'reload' || req.cache === 'no-cache';
      // Inhaltshash im Namen: cache-first, der Treffer ist die Version selbst.
      if (hashed && hit && !force) return {response: Promise.resolve(hit), done: Promise.resolve()};
      var fresh = publicData && hit && age >= 0 && age < FRESH_MS;
      var stale = publicData && hit && age >= FRESH_MS && age < STALE_MS;
      // Offline does not refresh or serve data. Navigation shows the offline
      // notice; existing tabs retain their explicitly dated displayed values.
      if (publicData && self.navigator.onLine === false) return {response: Promise.reject(new Error('offline')), done: Promise.resolve()};
      if (fresh && !force) return {response: Promise.resolve(hit), done: Promise.resolve()};
      var network = fetch(req, publicData ? {cache: req.cache === 'reload' ? 'reload' : 'no-cache'} : undefined);
      var done = network.then(function (r) { return save(cache, req, r, publicData ? DATA_LIMIT : ASSET_LIMIT, publicData); }).catch(function () {});
      // Daten: veraltet (2-30 min, Markt zu) sofort zeigen, im Hintergrund abgleichen. Assets mit ?v=: wie bisher.
      return {response: (stale || (!publicData && hit)) && !force ? Promise.resolve(hit) : network, done: done};
    });
  });
  event.respondWith(task.then(function (x) { return x.response; }));
  event.waitUntil(task.then(function (x) { return x.done; }).catch(function () {}));
});
