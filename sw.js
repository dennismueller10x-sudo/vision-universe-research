/* Vision Universe Service Worker – Stufe 1.
   Bewusst minimal: Er cached KEINE Daten, KEIN JavaScript und KEINE Seiten.
   Kurse, Rankings und Kennzahlen kommen immer frisch aus dem Netz; ein veralteter
   Stand aus einem Cache waere fuer ein Finanzprodukt falsch.
   Einzige Aufgabe: Wenn eine Seitennavigation ohne Netz scheitert, zeigt er
   /offline.html statt der Browser-Fehlerseite. */
'use strict';
var CACHE = 'vu-shell-v1';
var PRECACHE = ['/offline.html', '/assets/icons/icon-192.png'];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(PRECACHE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  // Nur Seitennavigationen; alles andere (Daten, Skripte, Bilder) geht ungefiltert ans Netz.
  if (req.mode !== 'navigate' || req.method !== 'GET') return;
  event.respondWith(fetch(req).catch(function () {
    return caches.match('/offline.html').then(function (r) { return r || Response.error(); });
  }));
});
