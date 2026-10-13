/* =========================================================================
   VISION UNIVERSE — quant/ui/release-guard.js

   DEPLOYMENT-WECHSEL MIT OFFENEM TAB

   Ein Tab behaelt den Code, mit dem er geoeffnet wurde. Ein Release kann
   danach Dateien entfernen (die Zwei-Zeichen-Scherben der technischen
   Auswertung, #616) oder nachgeladene Skripte austauschen (Chartbild,
   Discover-Gruppen), ohne dass der alte Code davon weiss. Folge: neu
   aufgerufene Aktien zeigen "nicht verfuegbar", oder ein altes Buendel
   laeuft mit einem neuen Nachlade-Skript.

   Die Release-Pipeline (scripts/vu2/release-id.mjs) schreibt je Produkt eine
   Code-Kennung (Hash ueber die ausgelieferten JS-/CSS-Dateien) in
   <meta name="vu-release" data-product="quant" content="..."> und nach
   /release-id.json. Dieser Waechter vergleicht beide - und nur dann, wenn der
   Tab neuen Code oder neue Daten nachladen will:

     beforeLoad(grund)  vor jedem Nachladen von Skripten (Quant: loadScript,
                        Discover: lazy.js). Neuer Release -> nichts laden,
                        was nicht zum Code des Tabs passt.
     onMissing(pfad)    nach einem 404 auf eine Datendatei. Neuer Release ->
                        die Seite laedt neu, statt "nicht verfuegbar" zu
                        zeigen. Gleicher Release -> der Fehler gilt wie bisher.

   Neuladen nur kontrolliert:
     - Route, Merkliste usw. liegen in Adresse und localStorage und bleiben.
       Zusaetzlich werden geaenderte Formularfelder vor dem Neuladen in
       sessionStorage gesichert und danach wieder eingesetzt.
     - Nie mitten in einer Eingabe (Textfeld mit Inhalt hat den Fokus): dann
       nur ein Hinweis mit Knopf; das Neuladen holt der naechste Routenwechsel
       nach. Wer das Feld verlassen hat (Treffer angeklickt), ist nicht mehr in
       einer Eingabe.
     - Keine Schleife: ein Neuladen fuer dieselbe Kennung wird innerhalb von
       10 Minuten nicht wiederholt (Marke in sessionStorage); steht der Tab
       danach noch auf altem Code (veralteter Cache), bleibt der Hinweis.
     - Ohne sessionStorage kein automatisches Neuladen (Schleifenschutz
       waere nicht moeglich), nur der Hinweis.
     - Ohne Kennung (Quelltext, Tests, Seiten ohne Pipeline) oder ohne Netz
       passiert nichts.
   Der Service Worker (sw.js) cached nichts ausser der Offline-Seite und
   bleibt unberuehrt; die Passwortsperre ebenso: /release-id.json enthaelt
   nur Hashes und wird ohne Zugangsschluessel gelesen wie jede Datei.
   ========================================================================= */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.VUReleaseGuard = api; api.watch(); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var ID_URL = '/release-id.json';
  var MARK_KEY = 'vu.release.reload.v1';
  var FRESH_MS = 2000;       // Ein Befund gilt 2 Sekunden (gleichzeitige Aufrufe teilen eine Abfrage). Nachladen und 404 sind selten, jeder Anlass fragt neu.
  var FETCH_MS = 3000;       // Laenger wartet kein Nachladen auf die Abfrage.
  var LOOP_MS = 600000;      // Nach einem Neuladen fuer dieselbe Kennung 10 Minuten Ruhe.
  var RESTORE_MS = 120000;   // So lange gilt eine Sicherung der Felder.
  var MAX_FIELDS = 40;

  var ownCache;              // undefined = noch nicht gelesen, null = keine Kennung
  var verdict = null;        // {at, result: {state, current}}
  var inflight = null;
  var reloading = false;
  var deferredTarget = null;
  var banner = null;

  function now() { return Date.now(); }
  function doc() { return root.document || null; }
  function never() { return new Promise(function () {}); }

  /* ------------------------------------------------------------ Kennung */
  /** Kennung dieses Tabs: {product, id} aus dem Meta-Tag, sonst null. */
  function identity() {
    if (ownCache !== undefined) return ownCache;
    ownCache = null;
    try {
      var d = doc(), meta = d && d.querySelector && d.querySelector('meta[name="vu-release"]');
      var id = meta && meta.getAttribute('content'), product = meta && meta.getAttribute('data-product');
      if (id && product && /^[0-9a-f]{8,64}$/.test(id) && /^[a-z0-9-]{1,32}$/.test(product)) ownCache = { product: product, id: id };
    } catch (_) { /* keine Kennung */ }
    return ownCache;
  }
  /** Ist die Pruefung fuer diesen Tab aktiv? (Pipeline-Release mit Kennung) */
  function known() { return !!identity(); }

  /* ------------------------------------------------------------ Speicher */
  function readMark() {
    try {
      var raw = root.sessionStorage && root.sessionStorage.getItem(MARK_KEY);
      var mark = raw ? JSON.parse(raw) : null;
      return mark && typeof mark === 'object' && typeof mark.target === 'string' && isFinite(mark.at) ? mark : null;
    } catch (_) { return null; }
  }
  function writeMark(mark) {
    try {
      if (!root.sessionStorage) return false;
      root.sessionStorage.setItem(MARK_KEY, JSON.stringify(mark));
      return !!readMark();
    } catch (_) { return false; }
  }
  function clearMark() { try { root.sessionStorage && root.sessionStorage.removeItem(MARK_KEY); } catch (_) { /* egal */ } }

  /* ------------------------------------------------------------- Befund */
  /** Aktuelle Kennung des Produkts vom Server (ohne Cache), sonst null. */
  function fetchCurrent(own) {
    if (typeof root.fetch !== 'function') return Promise.resolve(null);
    var request = Promise.resolve().then(function () {
      return root.fetch(ID_URL + '?t=' + now(), { cache: 'no-store', credentials: 'omit' });
    }).then(function (res) { return res && res.ok ? res.json() : null; })
      .then(function (json) {
        var id = json && json.products && json.products[own.product];
        return typeof id === 'string' && /^[0-9a-f]{8,64}$/.test(id) ? id : null;
      }).catch(function () { return null; });
    var timeout = new Promise(function (resolve) { root.setTimeout(function () { resolve(null); }, FETCH_MS); });
    return Promise.race([request, timeout]);
  }

  /** {state: 'SAME' | 'NEWER' | 'UNKNOWN', current}. Ein Befund gilt FRESH_MS, ein NEWER-Befund bleibt. */
  function check() {
    var own = identity();
    if (!own) return Promise.resolve({ state: 'UNKNOWN', current: null });
    if (verdict && (verdict.result.state === 'NEWER' || now() - verdict.at < FRESH_MS)) return Promise.resolve(verdict.result);
    if (inflight) return inflight;
    inflight = fetchCurrent(own).then(function (current) {
      var result = !current ? { state: 'UNKNOWN', current: null } : { state: current === own.id ? 'SAME' : 'NEWER', current: current };
      verdict = { at: now(), result: result };
      inflight = null;
      return result;
    });
    return inflight;
  }

  /* --------------------------------------------------------- Eingaben */
  var TEXTUAL = /^(text|search|email|url|tel|number|password)?$/i;
  function busy() {
    var d = doc();
    if (!d) return false;
    var a = d.activeElement;
    if (!a || a === d.body) return false;
    var tag = String(a.tagName || '').toUpperCase();
    var editable = tag === 'TEXTAREA' || (tag === 'INPUT' && TEXTUAL.test(a.type || '')) || a.isContentEditable === true;
    return editable && String(a.value !== undefined ? a.value : a.textContent || '').length > 0;
  }

  var SKIP_TYPES = /^(password|file|hidden|submit|button|image|reset)$/i;
  function fieldKey(node, index) {
    if (node.id) return '#' + node.id;
    if (node.name) return '[name="' + node.name + '"]' + (index > 0 ? ':' + index : '');
    return null;
  }
  /** Geaenderte Formularfelder (Wert oder Haken weicht vom Ausgangswert ab). */
  function snapshot() {
    var d = doc(), out = { href: '', fields: [] };
    try {
      var loc = root.location;
      out.href = loc.pathname + loc.search + loc.hash;
      if (!d || !d.querySelectorAll) return out;
      var seen = {}, nodes = d.querySelectorAll('input,textarea,select');
      for (var i = 0; i < nodes.length && out.fields.length < MAX_FIELDS; i++) {
        var n = nodes[i], type = String(n.type || '');
        if (SKIP_TYPES.test(type)) continue;
        var base = n.id ? null : n.name, index = base ? (seen[base] = (seen[base] === undefined ? 0 : seen[base] + 1)) : 0;
        var key = fieldKey(n, index);
        if (!key) continue;
        if (/^(checkbox|radio)$/i.test(type)) { if (n.checked !== n.defaultChecked) out.fields.push({ k: key, c: !!n.checked }); }
        else if (String(n.tagName).toUpperCase() === 'SELECT') {
          var first = 0;
          for (var o = 0; o < n.options.length; o++) if (n.options[o].defaultSelected) { first = o; break; }
          if (n.selectedIndex !== first) out.fields.push({ k: key, v: String(n.value) });
        } else if (String(n.value) !== String(n.defaultValue === undefined ? '' : n.defaultValue) && String(n.value).length <= 2000) out.fields.push({ k: key, v: String(n.value) });
      }
    } catch (_) { /* Sicherung ist best effort */ }
    return out;
  }
  function findField(key) {
    var d = doc();
    try {
      var m = key.match(/^\[name="(.*)"\](?::(\d+))?$/);
      if (m) return d.querySelectorAll('[name="' + m[1].replace(/"/g, '\\"') + '"]')[Number(m[2] || 0)] || null;
      return d.getElementById(key.slice(1));
    } catch (_) { return null; }
  }
  function fire(node, type) {
    try { node.dispatchEvent(new root.Event(type, { bubbles: true })); } catch (_) { /* egal */ }
  }
  /** Sicherung nach dem Neuladen wieder einsetzen: Felder entstehen mit der Ansicht, deshalb kurz wiederholen. */
  function restore(saved) {
    var pending = (saved.fields || []).slice(), tries = 0;
    function apply() {
      pending = pending.filter(function (f) {
        var node = findField(f.k);
        if (!node) return true;
        if (f.c !== undefined) { if (node.checked !== f.c) { node.checked = f.c; fire(node, 'change'); } }
        else if (String(node.tagName).toUpperCase() === 'SELECT' || node.value === String(node.defaultValue || '')) { node.value = f.v; fire(node, 'input'); fire(node, 'change'); }
        return false;
      });
      if (pending.length && ++tries < 20) root.setTimeout(apply, 250);
    }
    apply();
  }

  /* ---------------------------------------------------------- Hinweis */
  function showBanner(kind) {
    var d = doc();
    if (!d || !d.body) return null;
    if (banner && banner.isConnected !== false && d.body.contains(banner)) return banner;
    var box = d.createElement('div');
    box.id = 'vu-release-banner';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    box.setAttribute('data-kind', kind);
    box.style.cssText = 'position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:2147483000;max-width:calc(100vw - 32px);' +
      'display:flex;gap:12px;align-items:center;flex-wrap:wrap;justify-content:center;padding:10px 14px;border-radius:12px;' +
      'background:#14171e;color:#f4f4f5;border:1px solid #383c47;box-shadow:0 6px 24px rgba(0,0,0,.35);font:14px/1.4 system-ui,sans-serif';
    var text = d.createElement('span');
    text.textContent = kind === 'busy' ? 'Eine neue Version ist verfügbar. Sie wird beim nächsten Seitenwechsel geladen.' : 'Eine neue Version ist verfügbar.';
    var button = d.createElement('button');
    button.type = 'button';
    button.textContent = 'Jetzt aktualisieren';
    button.style.cssText = 'font:inherit;font-weight:600;color:#fff;background:#bd2836;border:1px solid #d53240;border-radius:8px;padding:6px 12px;cursor:pointer';
    button.addEventListener('click', function () { reloadNow(); });
    box.appendChild(text);
    box.appendChild(button);
    d.body.appendChild(box);
    banner = box;
    return box;
  }

  /* ---------------------------------------------------------- Neuladen */
  function reloadNow() {
    var own = identity(), target = verdict && verdict.result.current || (own && own.id) || '';
    writeMark({ target: target, at: now(), snapshot: snapshot() });
    reloading = true;
    try { root.location.reload(); } catch (_) { reloading = false; }
  }
  /**
   * 'RELOADING' | 'DEFERRED' (Eingabe laeuft, Hinweis) | 'BLOCKED' (kein Neuladen erlaubt oder moeglich, Hinweis)
   */
  function update(target) {
    if (reloading) return 'RELOADING';
    var mark = readMark();
    if (mark && mark.target === target && now() - mark.at < LOOP_MS) { showBanner('blocked'); return 'BLOCKED'; }
    if (busy()) { deferredTarget = target; showBanner('busy'); armDeferred(); return 'DEFERRED'; }
    if (!writeMark({ target: target, at: now(), snapshot: snapshot() })) { showBanner('blocked'); return 'BLOCKED'; }
    reloading = true;
    try { root.location.reload(); } catch (_) { reloading = false; showBanner('blocked'); return 'BLOCKED'; }
    return 'RELOADING';
  }
  var armed = false;
  function armDeferred() {
    if (armed || !root.addEventListener) return;
    armed = true;
    // Naechster Routenwechsel: die Eingabe ist abgeschlossen, Route und Felder bleiben erhalten.
    root.addEventListener('hashchange', function () { if (deferredTarget && !busy()) update(deferredTarget); });
  }

  /**
   * Vor dem Nachladen von Code. Aufgeloest = darf laden; nie aufgeloest = die Seite laedt gerade neu;
   * abgelehnt (RELEASE_STALE) = neuer Release, aber kein Neuladen moeglich - kein gemischter Code.
   */
  function beforeLoad() {
    if (!known()) return Promise.resolve();
    return check().then(function (r) {
      if (r.state !== 'NEWER') return;
      var outcome = update(r.current);
      if (outcome === 'RELOADING') return never();
      throw new Error('RELEASE_STALE');
    });
  }
  /** Nach einem 404 auf eine Datendatei. Immer aufgeloest ausser beim Neuladen (dann nie). */
  function onMissing() {
    if (!known()) return Promise.resolve('UNKNOWN');
    return check().then(function (r) {
      if (r.state !== 'NEWER') return r.state;
      return update(r.current) === 'RELOADING' ? never() : 'NEWER';
    });
  }

  /* ----------------------------------------------------------- Start */
  function watch() {
    if (!doc()) return;
    var mark = readMark(), own = identity();
    if (!mark) return;
    if (own && mark.target === own.id) clearMark();     // Neuladen hat den neuen Stand gebracht
    if (mark.snapshot && mark.snapshot.fields && mark.snapshot.fields.length && now() - mark.at < RESTORE_MS) {
      var loc = root.location, here = loc ? loc.pathname + loc.search : '';
      if (String(mark.snapshot.href || '').indexOf(here) === 0) restore(mark.snapshot);
      mark.snapshot = null;
      if (!(own && mark.target === own.id)) writeMark(mark);   // Schleifenmarke bleibt, die Felder nicht
    }
  }

  function reset() { ownCache = undefined; verdict = null; inflight = null; reloading = false; deferredTarget = null; banner = null; armed = false; }

  return {
    ID_URL: ID_URL, MARK_KEY: MARK_KEY, LOOP_MS: LOOP_MS,
    identity: identity, known: known, check: check, busy: busy, snapshot: snapshot, restore: restore,
    update: update, beforeLoad: beforeLoad, onMissing: onMissing, reloadNow: reloadNow, watch: watch, reset: reset
  };
});
