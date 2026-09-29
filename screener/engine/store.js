/* =========================================================================
   VISION UNIVERSE SCREENER — engine/store.js

   GESPEICHERTE SCREENS · VERLAUF · MONITORING · BENACHRICHTIGUNGEN

   Speicher: dieses Geraet (localStorage). Das Format ist versioniert und
   so geschnitten, dass es unveraendert an eine Server-API gehen kann
   (Nutzerkonto, Sync, Benachrichtigungs-Backend).

   SavedScreen = {
     id, name, description,
     query,                     vollstaendiges Screen-Modell (query.js):
                                filters, groups, operators, sorting,
                                ranking, viewMode, columns, universe
     createdAt, updatedAt,
     runs: [{ at, asOf, count, symbols[] }]   hoechstens 2: vorher / jetzt
     notify: { newMatches, removed, bigChanges, weekly, channel, active:false }
   }

   Ein neuer Lauf wird nur gespeichert, wenn sich der DATENSTAND (asOf)
   geaendert hat. So vergleicht "Veraenderungen" immer zwei verschiedene
   Marktstaende und nie zwei Aufrufe am selben Tag.
   ========================================================================= */
(function (global) {
  'use strict';
  var KEY = 'vu-screener-v1';
  var WATCH_KEY = 'vu-discover-watchlist-v1'; // gemeinsame Watchlist mit Discover
  var MAX_SCREENS = 50, MAX_HISTORY = 12, MAX_SYMBOLS = 2000;

  function create(storage) {
    storage = storage || null;
    var mem = { v: 1, screens: [], history: [] };
    function read() {
      try {
        var raw = storage ? storage.getItem(KEY) : null;
        if (!raw) return mem;
        var d = JSON.parse(raw);
        if (!d || d.v !== 1 || !Array.isArray(d.screens) || !Array.isArray(d.history)) return mem;
        return d;
      } catch (e) { return mem; }
    }
    function write(d) {
      mem = d;
      try { if (storage) storage.setItem(KEY, JSON.stringify(d)); return true; } catch (e) { return false; }
    }
    function id() { return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    function now() { return new Date().toISOString(); }

    var api = {
      screens: function () { return read().screens.slice().sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); }); },
      get: function (sid) { return read().screens.filter(function (s) { return s.id === sid; })[0] || null; },
      save: function (input) {
        var d = read(), t = now();
        var name = String(input.name || '').trim().slice(0, 60);
        if (!name) throw Error('NAME_REQUIRED');
        var existing = input.id ? d.screens.filter(function (s) { return s.id === input.id; })[0] : null;
        if (existing) {
          existing.name = name; existing.description = String(input.description || '').slice(0, 280);
          existing.query = input.query; existing.updatedAt = t;
          if (input.notify) existing.notify = Object.assign({}, existing.notify, input.notify);
          write(d); return existing;
        }
        if (d.screens.length >= MAX_SCREENS) throw Error('TOO_MANY_SCREENS');
        var s = { id: id(), name: name, description: String(input.description || '').slice(0, 280), query: input.query, createdAt: t, updatedAt: t,
          runs: [], notify: { newMatches: false, removed: false, bigChanges: false, weekly: false, channel: 'push', active: false } };
        d.screens.push(s); write(d); return s;
      },
      remove: function (sid) { var d = read(); d.screens = d.screens.filter(function (s) { return s.id !== sid; }); write(d); },
      setNotify: function (sid, patch) {
        var d = read(), s = d.screens.filter(function (x) { return x.id === sid; })[0];
        if (!s) return null;
        s.notify = Object.assign({}, s.notify, patch, { active: false }); // Zustellung erst mit Backend
        write(d); return s;
      },
      /**
       * Merkt sich einen Lauf. Neuer Eintrag nur bei neuem Datenstand;
       * sonst wird der aktuelle Lauf aktualisiert.
       */
      recordRun: function (sid, run) {
        var d = read(), s = d.screens.filter(function (x) { return x.id === sid; })[0];
        if (!s) return null;
        var entry = { at: now(), asOf: run.asOf, count: run.count, symbols: (run.symbols || []).slice(0, MAX_SYMBOLS), truncated: (run.symbols || []).length > MAX_SYMBOLS };
        var last = s.runs[s.runs.length - 1];
        if (last && last.asOf === run.asOf) s.runs[s.runs.length - 1] = Object.assign(entry, { firstAt: last.firstAt || last.at });
        else { s.runs.push(entry); if (s.runs.length > 2) s.runs = s.runs.slice(-2); }
        write(d); return s;
      },
      history: function () { return read().history.slice(); },
      remember: function (entry) {
        var d = read();
        d.history = d.history.filter(function (h) { return h.key !== entry.key; });
        d.history.unshift({ key: entry.key, params: entry.params, label: String(entry.label || '').slice(0, 120), count: entry.count, filters: entry.filters, at: now(), screenId: entry.screenId || null });
        d.history = d.history.slice(0, MAX_HISTORY);
        write(d);
      },
      clearHistory: function () { var d = read(); d.history = []; write(d); },
      watchlist: function () {
        try { var a = JSON.parse(storage.getItem(WATCH_KEY) || '[]'); return Array.isArray(a) ? a.filter(function (s) { return /^[A-Z0-9.\-]{1,24}$/.test(s); }).slice(0, 100) : []; } catch (e) { return []; }
      },
      toggleWatch: function (symbol) {
        var list = api.watchlist(), i = list.indexOf(symbol);
        if (i < 0) list.unshift(symbol); else list.splice(i, 1);
        try { storage.setItem(WATCH_KEY, JSON.stringify(list.slice(0, 100))); } catch (e) { /* ohne Speicher */ }
        return i < 0;
      },
      isWatched: function (symbol) { return api.watchlist().indexOf(symbol) >= 0; }
    };
    return api;
  }

  /** Relative Zeitangabe fuer den Verlauf: Heute, Gestern, Vor 4 Tagen. */
  function relativeDay(iso, ref) {
    var d = new Date(iso), r = ref ? new Date(ref) : new Date();
    var a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()), b = Date.UTC(r.getFullYear(), r.getMonth(), r.getDate());
    var days = Math.round((b - a) / 864e5);
    if (days <= 0) return 'Heute';
    if (days === 1) return 'Gestern';
    if (days < 7) return 'Vor ' + days + ' Tagen';
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  var API = { VERSION: 'vu-screener-store-1.0.0', KEY: KEY, WATCH_KEY: WATCH_KEY, create: create, relativeDay: relativeDay };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.VUScreenerStore = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
