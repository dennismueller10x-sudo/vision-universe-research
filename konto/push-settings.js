/* =========================================================================
   VISION UNIVERSE — konto/push-settings.js   Benachrichtigungen über die App (Z4)
   Schalter je Ereignisart im Konto: PATCH /v1/me {settings: {notifications: {ART: bool}}}.
   Versand nur als App-Push (FCM, workers/vu-account/src/push.mjs): höchstens eine gebündelte
   Nachricht am Tag, für Titel der Watchlist, nur wenn das Konto die Art eingeschaltet hat und der
   Watchlist-Eintrag sie nicht ausgeschaltet hat (supabase/migrations/20261107000100_push_preferences.sql).
   Keine E-Mail-Benachrichtigungen (eigene Owner-Freigabe).

   Zustellbar (ready:true): alle Arten, die build-watchlist-events erzeugt und push.mjs zustellt (Regel bis 1.5.0).
   Arten ohne Erzeuger (Suchtreffer, ETF) bleiben sichtbar, aber gesperrt („noch keine Daten“): nichts
   täuscht eine Funktion vor. Ohne Anmeldung, ohne App oder ohne FCM-Zugang sagt ein Satz, warum
   nichts kommt. Texte nach docs/legal/WORTWAHL.md: beschreiben, keine Aufforderung, kein „Signal“.

   Seiten laden die Datei erst, wenn sie die Schalter zeigen:
     VUPush.mount(host, {keys: [...]})   Schalterzeilen an Ort und Stelle (D08, W04, V08)
     VUPush.open({focus: [...]})         Sheet mit allen Arten, die genannten zuerst (T02, T04)
   UMD: Browser globalThis.VUPush, Node module.exports (Tests).
   ========================================================================= */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.VUPush = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var SESSION_HINT = 'vu-account-session-v1';
  /* key = Ereignisart in core/contracts/events.schema.json bzw. user_settings.notification_settings.
     ready = der Erzeuger (scripts/account/build-watchlist-events.mjs) liefert sie, und der Worker stellt sie zu. */
  var TYPES = [
    { key: 'PRICE_MOVE', title: 'Kursbewegung über ±5 % am Tag', sub: 'Tagesbewegung eines Titels', ready: true },
    { key: 'PRICE_EVENT', title: 'Neues Jahreshoch', sub: 'Höchster Schlusskurs seit 52 Wochen oder auffälliges Volumen', ready: true },
    { key: 'EARNINGS', title: 'Neue Quartalszahlen', sub: 'Neuer Unternehmensbericht', ready: true },
    { key: 'SUPERTRADER_SIGNAL', title: 'Setups der Methoden', sub: 'Eine Regel einer Methode ist neu erfüllt oder nicht mehr erfüllt', ready: true },
    { key: 'QUANT_CHANGE', title: 'Quant-Eigenschaften', sub: 'Eine Eigenschaft ändert sich um mindestens zwei Stufen', ready: true },
    { key: 'FUND_13F', title: 'Neue 13F-Meldungen', sub: 'Ein großer Fonds meldet seine Positionen', ready: true },
    { key: 'SEARCH_HITS', title: 'Neue Treffer gespeicherter Suchen', sub: 'Eine Aktie kommt in eine Suche oder fällt heraus', ready: false },
    { key: 'ELLIOTT_CHANGE', title: 'Elliott-Lesarten', sub: 'Neue, bestätigte oder überarbeitete Lesart', ready: true },
    { key: 'VORSORGE_CHANGE', title: 'Veränderungen bei ETFs', sub: 'Kosten oder Bestände eines ETFs ändern sich', ready: false }
  ];
  var BY = {}; TYPES.forEach(function (t) { BY[t.key] = t; });
  var RULES = 'Höchstens eine gebündelte Nachricht am Tag, für Titel deiner Watchlist. Keine E-Mail. Eine Nachricht beschreibt, dass eine Regel erfüllt ist oder sich Daten geändert haben, und ist keine Kauf- oder Verkaufsaufforderung.';
  var loading = null, cached = null, views = [];

  function hint() { try { return root.localStorage && root.localStorage.getItem(SESSION_HINT) === '1'; } catch (e) { return false; } }
  function script(src) {
    var doc = root.document;
    if (!doc || !doc.head) return Promise.resolve(false);
    return new Promise(function (done) { var s = doc.createElement('script'); s.src = src; s.async = true; s.onload = function () { done(true); }; s.onerror = function () { done(false); }; doc.head.appendChild(s); });
  }
  function account() {
    if (root.VUAccount && root.VUAccount.available && root.VUAccount.available()) return Promise.resolve(root.VUAccount);
    if (!hint()) return Promise.resolve(null);
    if (!loading) loading = (root.VU_ACCOUNT_CONFIG ? Promise.resolve(true) : script('/konto/config.js'))
      .then(function () { return root.VUAccount ? true : script('/konto/account-api.js'); })
      .then(function () { var A = root.VUAccount; return A && A.available && A.available() ? A : null; }, function () { return null; });
    return loading;
  }

  /** Rein: Stand aus GET /v1/me. → {signedIn, available, devices, on: {ART: bool}} */
  function fromMe(me) {
    if (!me) return { signedIn: false, available: false, devices: 0, on: {} };
    var p = me.push || {}, n = (me.settings && me.settings.notifications) || {}, on = {};
    TYPES.forEach(function (t) { on[t.key] = t.ready && n[t.key] === true; });
    return { signedIn: true, available: p.available === true, devices: Number(p.devices) || 0, on: on };
  }
  /** Rein: ein Satz zum Zustand (warum etwas kommt oder nicht). */
  function line(st) {
    if (!st || !st.signedIn) return 'Benachrichtigungen kommen über die App. Melde dich an, dann stellst du sie hier im Konto ein.';
    if (!st.available) return 'Benachrichtigungen kommen über die App. Der Versand ist noch nicht eingerichtet; deine Wahl ist im Konto gespeichert.';
    if (!st.devices) return 'Benachrichtigungen kommen über die App. Melde dich in der App an, sonst kommt keine Nachricht an.';
    return 'Benachrichtigungen kommen über die App' + (st.devices === 1 ? ' auf deinem Gerät.' : ' auf deinem zuletzt genutzten von ' + st.devices + ' Geräten.');
  }
  /** Rein: Patch für PATCH /v1/me; nur Arten, die es gibt (ready). */
  function patchFor(on) {
    var out = {};
    TYPES.forEach(function (t) { if (t.ready) out[t.key] = on[t.key] === true; });
    return { settings: { notifications: out } };
  }
  function load() {
    if (cached) return cached;
    cached = account().then(function (A) {
      if (!A) return fromMe(null);
      return A.get('/v1/me').then(function (r) { return r.ok ? fromMe(r.data) : fromMe(null); });
    });
    return cached;
  }
  function save(key, value) {
    return Promise.all([account(), load()]).then(function (x) {
      var A = x[0], st = x[1];
      if (!A || !st.signedIn || !BY[key] || !BY[key].ready) return { ok: false, st: st };
      var on = Object.assign({}, st.on); on[key] = value;
      return A.patch('/v1/me', patchFor(on)).then(function (r) {
        if (r.ok) { var next = fromMe(r.data); cached = Promise.resolve(next); paintAll(next); return { ok: true, st: next }; }
        return { ok: false, st: st, message: A.message(r.state) };
      });
    });
  }

  /* ------------------------------------------------------------ Darstellung */
  var CSS = '.vu-push-row{display:flex;align-items:center;gap:12px;min-height:52px;padding:8px 0;border-top:1px solid var(--vu-hair,rgba(127,127,127,.25))}' +
    '.vu-push-row:first-child{border-top:0}.vu-push-t{flex:1;min-width:0}.vu-push-t b{display:block;font-size:14px}.vu-push-t small{display:block;font-size:12.5px;opacity:.8}' +
    '.vu-box--lime .vu-btn--line{color:#000;border-color:rgba(0,0,0,.45)}.vu-box--lime .vu-push-row{border-top-color:rgba(0,0,0,.18)}' +
    '.vu-push-off{font-size:12px;font-weight:700;white-space:nowrap}.vu-push-line{font-size:13px;margin:10px 0 0}.vu-push-rules{font-size:12.5px;margin:8px 0 0;opacity:.85}';
  function style(doc) { if (doc.getElementById('vu-push-css')) return; var s = doc.createElement('style'); s.id = 'vu-push-css'; s.textContent = CSS; doc.head.appendChild(s); }
  function el(doc, tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function row(doc, t, uid) {
    var r = el(doc, 'div', 'vu-push-row'), txt = el(doc, 'span', 'vu-push-t'), id = 'vu-push-' + t.key + '-' + uid;
    var b = el(doc, 'b', '', t.title); b.id = id + '-l';
    txt.append(b, el(doc, 'small', '', t.sub));
    var sw = el(doc, 'input', 'vu-switch'); sw.type = 'checkbox'; sw.setAttribute('role', 'switch'); sw.setAttribute('aria-labelledby', id + '-l'); sw.dataset.key = t.key; sw.disabled = true;
    r.append(txt);
    if (!t.ready) { var off = el(doc, 'span', 'vu-push-off', 'noch keine Daten'); r.append(off); sw.setAttribute('aria-describedby', id + '-o'); off.id = id + '-o'; }
    r.append(sw);
    sw.addEventListener('change', function () {
      var v = sw.checked; sw.disabled = true;
      save(t.key, v).then(function (res) { if (!res.ok) { sw.checked = !v; paintAll(res.st, res.message); } });
    });
    return r;
  }
  function paint(view, st, msg) {
    Array.prototype.forEach.call(view.querySelectorAll('input[data-key]'), function (sw) {
      var t = BY[sw.dataset.key];
      sw.checked = !!(st && st.on[t.key]);
      sw.disabled = !t.ready || !st || !st.signedIn;
    });
    var l = view.querySelector('.vu-push-line');
    if (l) { l.textContent = msg || line(st); }
    var a = view.querySelector('.vu-push-login'); if (a) { a.hidden = !!(st && st.signedIn); a.style.display = a.hidden ? 'none' : ''; }
  }
  function paintAll(st, msg) { views = views.filter(function (v) { return v.isConnected; }); views.forEach(function (v) { paint(v, st, msg); }); }
  var uid = 0;
  function build(doc, keys) {
    style(doc);
    var box = el(doc, 'div', 'vu-push'), list = el(doc, 'div', 'vu-push-list'), n = ++uid;
    keys.forEach(function (k) { if (BY[k]) list.append(row(doc, BY[k], n)); });
    var l = el(doc, 'p', 'vu-push-line', line(null)); l.setAttribute('role', 'status');
    var login = el(doc, 'a', 'vu-btn vu-btn--line vu-btn--block vu-push-login', 'Anmelden');
    login.href = '/konto/anmelden/?next=' + encodeURIComponent((root.location && root.location.pathname + root.location.search + root.location.hash) || '/');
    login.style.marginTop = '10px';
    box.append(list, l, login);
    views.push(box);
    load().then(function (st) { paint(box, st); });
    return box;
  }
  /** Schalterzeilen in host (ersetzt dessen Inhalt). */
  function mount(host, opts) {
    if (!host) return null;
    var box = build(host.ownerDocument, (opts && opts.keys) || TYPES.map(function (t) { return t.key; }));
    host.textContent = '';
    host.append(box);
    if (opts && opts.more) {
      var b = el(host.ownerDocument, 'button', 'vu-btn vu-btn--line vu-btn--block', 'Alle Benachrichtigungen');
      b.type = 'button'; b.style.marginTop = '8px';
      b.addEventListener('click', function () { open({ focus: opts.keys }); });
      host.append(b);
    }
    return box;
  }
  /** Sheet mit allen Arten (die genannten zuerst). */
  function open(opts) {
    var doc = root.document, U = root.VUUI, focus = (opts && opts.focus) || [];
    var keys = focus.filter(function (k) { return BY[k]; }).concat(TYPES.map(function (t) { return t.key; }).filter(function (k) { return focus.indexOf(k) < 0; }));
    var old = doc.getElementById('vu-push-sheet'); if (old) old.remove();
    var wrap = doc.createElement('div');
    wrap.innerHTML = U && U.sheet ? U.sheet('vu-push-sheet', 'Benachrichtigungen', '') : '<div class="vu-sheet-backdrop" id="vu-push-sheet" hidden><div class="vu-sheet-ui" role="dialog" aria-modal="true" aria-label="Benachrichtigungen"><h2 class="vu-mt">Benachrichtigungen</h2><div class="vu-sheet-body"></div></div></div>';
    var sh = wrap.firstChild, body = sh.querySelector('.vu-sheet-body');
    if (opts && opts.note) body.append(el(doc, 'p', 'vu-push-rules', opts.note));
    body.append(build(doc, keys), el(doc, 'p', 'vu-push-rules', RULES));
    var close = el(doc, 'button', 'vu-btn vu-btn--block', 'Fertig'); close.type = 'button'; close.style.marginTop = '12px';
    body.append(close);
    doc.body.append(sh);
    var opener = doc.activeElement;
    var done = function () { if (U && U.closeSheet) U.closeSheet(sh); else sh.hidden = true; sh.remove(); if (opener && opener.focus) opener.focus(); };
    close.addEventListener('click', done);
    if (U && U.openSheet) U.openSheet(sh); else sh.hidden = false;
    var sw = sh.querySelector('input,button'); if (sw && sw.focus) sw.focus();
    return sh;
  }
  return Object.freeze({ TYPES: TYPES, RULES: RULES, fromMe: fromMe, line: line, patchFor: patchFor, mount: mount, open: open,
    reset: function () { cached = null; loading = null; } });
});
