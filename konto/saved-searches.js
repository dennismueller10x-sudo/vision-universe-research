/* =========================================================================
   VISION UNIVERSE — konto/saved-searches.js   Gespeicherte Suchen im Konto (Z3)
   Gemeinsamer Weg für Screener (S04), Quant (Q02) und Technical (T04) zu
   GET/POST/PATCH /v1/searches und POST /v1/searches/remove (workers/vu-account/src/searches.mjs).

   Ohne Anmeldung bleibt alles auf dem Gerät (jede Welt hat ihren eigenen Speicher).
   Mit Anmeldung:
     sync(adapter)    Konto lesen; Suchen aus dem Konto, die das Gerät nicht kennt, kommen dazu;
                      gleiche Suche (Name + Abfrage) wird verknüpft; im Konto gelöschte werden nur entkoppelt.
     pushPending(a)   „Im Konto speichern“: alle noch nicht verknüpften Suchen hochladen (höchstens 50 je Konto).
     saved(a, id) / removed(acct)  spiegeln jede spätere Änderung einer verknüpften Suche.
   Adapter je Welt: { world, list() → [{id, name, query, acct}], link(id, acct), unlink(id), add({name, query, acct}) }.
   Die Abfrage ist ein JSON-Objekt (höchstens 4 KB); ihren Inhalt bestimmt die Welt.
   UMD: Browser globalThis.VUSavedSearches, Node module.exports (Tests).
   ========================================================================= */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.VUSavedSearches = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var LIMIT = 50, SESSION_HINT = 'vu-account-session-v1';
  var loading = null;

  function hint() { try { return root.localStorage && root.localStorage.getItem(SESSION_HINT) === '1'; } catch (e) { return false; } }
  function script(src) {
    var doc = root.document;
    if (!doc || !doc.head) return Promise.resolve(false);
    return new Promise(function (done) {
      var s = doc.createElement('script'); s.src = src; s.async = true;
      s.onload = function () { done(true); }; s.onerror = function () { done(false); };
      doc.head.appendChild(s);
    });
  }
  /** VUAccount laden, nur wenn Konten verbunden sind und das Gerät eine Anmeldung kennt. Liefert VUAccount oder null. */
  function account() {
    if (root.VUAccount && root.VUAccount.available && root.VUAccount.available()) return Promise.resolve(root.VUAccount);
    if (!hint()) return Promise.resolve(null);
    if (!loading) loading = (root.VU_ACCOUNT_CONFIG ? Promise.resolve(true) : script('/konto/config.js'))
      .then(function () { return root.VUAccount ? true : script('/konto/account-api.js'); })
      .then(function () { var A = root.VUAccount; return A && A.available && A.available() ? A : null; }, function () { return null; });
    return loading;
  }
  function same(a, b) { return a.name === b.name && JSON.stringify(a.query) === JSON.stringify(b.query); }

  /** Rein: Abgleich Gerät ↔ Konto. remote = [{id, name, query}] einer Welt. */
  function reconcile(local, remote) {
    var byId = {}, used = {}, out = { link: [], add: [], unlink: [], pending: [] };
    (remote || []).forEach(function (r) { byId[r.id] = r; });
    (local || []).forEach(function (l) { if (l.acct && byId[l.acct]) used[l.acct] = true; });
    (local || []).forEach(function (l) {
      if (l.acct) { if (!byId[l.acct]) out.unlink.push(l.id); return; }
      var hit = (remote || []).filter(function (r) { return !used[r.id] && same(l, r); })[0];
      if (hit) { used[hit.id] = true; out.link.push({ id: l.id, acct: hit.id }); } else out.pending.push(l.id);
    });
    out.add = (remote || []).filter(function (r) { return !used[r.id]; });
    return out;
  }

  function list(A, world) {
    return A.get('/v1/searches?world=' + encodeURIComponent(world)).then(function (r) {
      return r.ok && r.data ? { ok: true, searches: r.data.searches || [], limit: r.data.limit || LIMIT } : { ok: false, state: r.state, status: r.status };
    });
  }
  /** Konto lesen und mit dem Gerät abgleichen. → {signedIn, count, limit, pending, state?} */
  function sync(a) {
    return account().then(function (A) {
      if (!A) return { signedIn: false };
      return list(A, a.world).then(function (r) {
        if (!r.ok) return { signedIn: r.status !== 401 && r.state !== 'NOT_AUTHENTICATED' ? null : false, state: r.state };
        var plan = reconcile(a.list(), r.searches);
        plan.link.forEach(function (x) { a.link(x.id, x.acct); });
        plan.unlink.forEach(function (id) { a.unlink(id); });
        plan.add.forEach(function (s) { a.add({ name: s.name, query: s.query, acct: s.id }); });
        return { signedIn: true, count: r.searches.length, limit: r.limit, pending: plan.pending.length };
      });
    });
  }
  /** „Im Konto speichern“: alle unverknüpften Suchen hochladen, nacheinander; stoppt an der Grenze. */
  function pushPending(a) {
    return account().then(function (A) {
      if (!A) return { signedIn: false, saved: 0 };
      var todo = a.list().filter(function (l) { return !l.acct; }), saved = 0;
      function next(i) {
        if (i >= todo.length) return { signedIn: true, saved: saved, state: 'OK' };
        var l = todo[i];
        return A.post('/v1/searches', { world: a.world, name: String(l.name).slice(0, 80), query: l.query }).then(function (r) {
          if (!r.ok) return { signedIn: r.status !== 401, saved: saved, state: r.state, message: A.message(r.state) };
          a.link(l.id, r.data.search.id); saved++;
          return next(i + 1);
        });
      }
      return next(0);
    });
  }
  /** Nach dem Speichern auf dem Gerät: verknüpfte Suche im Konto nachziehen, neue anlegen (wenn angemeldet). */
  function saved(a, id) {
    return account().then(function (A) {
      var l = A && a.list().filter(function (x) { return x.id === id; })[0];
      if (!l) return { signedIn: !!A };
      var req = l.acct ? A.patch('/v1/searches', { id: l.acct, name: String(l.name).slice(0, 80), query: l.query })
        : A.post('/v1/searches', { world: a.world, name: String(l.name).slice(0, 80), query: l.query });
      return req.then(function (r) {
        if (r.ok && !l.acct) a.link(l.id, r.data.search.id);
        if (!r.ok && l.acct && r.status === 404) a.unlink(l.id);
        return { signedIn: r.status !== 401, ok: r.ok, state: r.state, message: r.ok ? null : A.message(r.state) };
      });
    });
  }
  /** Nach dem Löschen auf dem Gerät: auch im Konto entfernen. */
  function removed(acct) {
    if (!acct) return Promise.resolve({ ok: true });
    return account().then(function (A) {
      if (!A) return { ok: false };
      return A.post('/v1/searches/remove', { id: acct }).then(function (r) { return { ok: r.ok, state: r.state }; });
    });
  }
  /** Ein Satz zum Stand für die Seite. */
  function line(st) {
    if (!st || st.signedIn === false) return 'Ohne Anmeldung bleiben Suchen nur in diesem Browser.';
    if (st.signedIn === null) return 'Das Konto ist gerade nicht erreichbar. Deine Suchen bleiben auf diesem Gerät.';
    return 'Im Konto: ' + st.count + ' von ' + st.limit + (st.pending ? ' · ' + st.pending + (st.pending === 1 ? ' Suche nur auf diesem Gerät' : ' Suchen nur auf diesem Gerät') : ' · auf allen Geräten');
  }

  /** Einfacher Gerätespeicher für Welten ohne eigenen (Quant): [{id, name, query, acct, createdAt, updatedAt}]. */
  function localStore(key, storage) {
    function ls() { try { return storage || root.localStorage || null; } catch (e) { return null; } }
    function read() { try { var v = JSON.parse((ls() && ls().getItem(key)) || '[]'); return Array.isArray(v) ? v.filter(function (x) { return x && x.id && x.name && x.query && typeof x.query === 'object'; }).slice(0, LIMIT) : []; } catch (e) { return []; } }
    function write(v) { try { if (ls()) ls().setItem(key, JSON.stringify(v.slice(0, LIMIT))); return true; } catch (e) { return false; } }
    function patch(id, p) { var v = read(); v.forEach(function (x) { if (x.id === id) Object.assign(x, p); }); write(v); }
    var n = 0;
    return {
      list: read,
      save: function (name, query) {
        var v = read(), t = new Date().toISOString(), hit = v.filter(function (x) { return JSON.stringify(x.query) === JSON.stringify(query); })[0];
        if (hit) { hit.name = String(name).slice(0, 60); hit.updatedAt = t; write(v); return hit; }
        if (v.length >= LIMIT) return null;
        var s = { id: 'q' + Date.now().toString(36) + (n++).toString(36), name: String(name).slice(0, 60), query: query, acct: null, createdAt: t, updatedAt: t };
        v.unshift(s); return write(v) ? s : null;
      },
      remove: function (id) { var v = read(), hit = v.filter(function (x) { return x.id === id; })[0]; write(v.filter(function (x) { return x.id !== id; })); return hit || null; },
      link: function (id, acct) { patch(id, { acct: acct }); },
      unlink: function (id) { patch(id, { acct: null }); },
      add: function (s) { var v = read(); if (v.length >= LIMIT) return; var t = new Date().toISOString(); v.push({ id: 'q' + Date.now().toString(36) + (n++).toString(36), name: String(s.name).slice(0, 60), query: s.query, acct: s.acct, createdAt: t, updatedAt: t }); write(v); }
    };
  }

  return Object.freeze({ LIMIT: LIMIT, account: account, reconcile: reconcile, sync: sync, pushPending: pushPending, saved: saved, removed: removed, line: line, localStore: localStore });
});
