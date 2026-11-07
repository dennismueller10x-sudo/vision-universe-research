/* E5: public assets stale-while-revalidate; public data at most 30 s fresh.
   Navigations always use the network, then the explicit offline page. No
   account/API responses, failed responses or third-party resources cached. */
'use strict';
var PREFIX = 'vu-shell-', CACHE = PREFIX + 'e5-v1', DATA = CACHE + '-data';
var PRECACHE = ['/offline.html', '/assets/icons/icon-192.png'];
var FRESH_MS = 30000, ASSET_LIMIT = 160, DATA_LIMIT = 32;
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
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (event) {
  var req = event.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(function () { return caches.match('/offline.html').then(function (r) { return r || Response.error(); }); }));
    return;
  }
  // Version query strings remain distinct. Never persist signed/token URLs.
  if (Array.from(url.searchParams.keys()).some(function (k) { return k !== 'v'; })) return;
  var publicData = /^\/(quant|discover|supertrader|technical|fundamental|screener)\/data\//.test(url.pathname) && /\.json(?:\.gz)?$/.test(url.pathname);
  var asset = /^\/(assets|discover|quant|technical|fundamental|supertrader|analysten)\//.test(url.pathname) && /\.(?:css|js|woff2|png|webp|jpg|svg)$/.test(url.pathname);
  if (!publicData && !asset) return;
  // Never mix independently updated unversioned code from two deployments.
  if (asset && /\.(?:js|css)$/.test(url.pathname) && !url.searchParams.get('v')) return;
  if (req.cache === 'no-store') return;
  // The fetch promise is attached synchronously to waitUntil (including cache
  // hits), so revalidation survives the response and a closing browser tab.
  var task = caches.open(publicData ? DATA : CACHE).then(function (cache) {
    return cache.match(req).then(function (hit) {
      var age = hit ? Date.now() - Number(hit.headers.get('x-vu-cached-at') || 0) : Infinity;
      var fresh = publicData && hit && age >= 0 && age < FRESH_MS;
      var force = req.cache === 'reload' || req.cache === 'no-cache';
      // Offline does not refresh or serve data. Navigation shows the offline
      // notice; existing tabs retain their explicitly dated displayed values.
      if (publicData && self.navigator.onLine === false) return {response: Promise.reject(new Error('offline')), done: Promise.resolve()};
      if (fresh && !force) return {response: Promise.resolve(hit), done: Promise.resolve()};
      var network = fetch(req, publicData ? {cache: req.cache === 'reload' ? 'reload' : 'no-cache'} : undefined);
      var done = network.then(function (r) { return save(cache, req, r, publicData ? DATA_LIMIT : ASSET_LIMIT, publicData); }).catch(function () {});
      return {response: !publicData && hit && !force ? Promise.resolve(hit) : network, done: done};
    });
  });
  event.respondWith(task.then(function (x) { return x.response; }));
  event.waitUntil(task.then(function (x) { return x.done; }).catch(function () {}));
});
