/* Vision Universe® — Supertrader: „Folgen“ (Fenster „Methode“) und „Melden“ (Fenster „Ablauf“ einer Aktie), App-Konzept 2.
   Owner 16.11.2026: „Wir dürfen halt nie sagen, dass es eine Entscheidung ist, sondern einfach, dass die Regel halt erfüllt
   worden ist der Methode und fertig.“

   Folgen  = Konto folgt einer Methode (Konto-API /v1/supertrader/follows). Gemeldet wird, wenn eine Aktie bei dieser Methode
             „Regel erfüllt“ oder „Plan fertig“ erreicht.
   Melden  = die Aktie steht in der persönlichen Watchlist, ihr Eintrag hat die Art SUPERTRADER_SIGNAL nicht ausgeschaltet
             (bestehender Alarm je Aktie, /v1/watchlist). Gemeldet wird jede neue oder verlassene Stufe bei einer Methode.
   Beides braucht die Art SUPERTRADER_SIGNAL im Konto („Supertrader: Regel-Ergebnisse der Methoden“, /konto/einstellungen/);
   der Knopf schaltet sie mit ein. Zustellung: App-Push, höchstens eine gebündelte Nachricht am Tag
   (workers/vu-account/src/push.mjs). Den internen Code SUPERTRADER_SIGNAL zeigt die Seite nirgends.

   Ohne Konto, ohne Anmeldung oder solange Konten ausgeschaltet sind, sagt der Knopf es ehrlich und führt zur Anmeldung.
   Ohne Anmeldemerker (vu-account-session-v1) fragt die Datei die Konto-API nicht an.
   UMD: Browser globalThis.VUSTFollow, Node module.exports (scripts/supertrader/tests/st-follow.test.mjs). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.VUSTFollow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var VERSION = 'st-follow-1.0.0';
  var SESSION = 'vu-account-session-v1', ALERT = 'SUPERTRADER_SIGNAL', WL_STORE = 'vu-watchlist-ids-v1';

  /* Alle sichtbaren Sätze an einer Stelle (Wortwahl-Test: kein Signal, keine Empfehlung, keine Aufforderung). */
  var TEXT = {
    method: {
      off: 'Folgen', on: 'Gefolgt',
      aria: function (name, on) { return on ? 'Methode ' + name + ': gefolgt. Antippen beendet das Folgen.' : 'Methode ' + name + ' folgen'; },
      done: 'Gefolgt. Eine Meldung kommt, wenn eine Aktie bei dieser Methode „Regel erfüllt“ oder „Plan fertig“ erreicht.',
      undone: 'Nicht mehr gefolgt. Zu dieser Methode kommen keine Meldungen mehr.'
    },
    stock: {
      off: 'Melden', on: 'Gemeldet',
      aria: function (name, on) { return on ? name + ': gemeldet. Antippen beendet die Meldungen.' : name + ' melden'; },
      done: 'Gemeldet. Eine Meldung kommt, wenn die Aktie bei einer Methode eine Stufe erreicht oder verlässt. Die Aktie steht dafür in der Watchlist.',
      undone: 'Keine Meldungen mehr zu dieser Aktie. Sie bleibt in der Watchlist.'
    },
    account: 'Benachrichtigungen gibt es mit einem Konto.',
    closed: 'Benachrichtigungen gibt es mit einem Konto. Konten sind gerade noch nicht geöffnet.',
    login: 'Anmelden',
    app: 'Meldungen kommen über die App, höchstens eine am Tag.',
    noApp: 'Meldungen kommen über die App, höchstens eine am Tag. Melde dich in der App an, sonst kommt keine Nachricht an.',
    noPush: 'Meldungen kommen über die App, höchstens eine am Tag. Der Versand ist noch nicht eingerichtet; deine Wahl ist im Konto gespeichert.',
    error: 'Das hat nicht geklappt. Bitte später erneut versuchen.',
    unresolved: 'Diese Aktie lässt sich gerade nicht eindeutig zuordnen.',
    note: 'Meldungen beschreiben Regel-Ergebnisse der Methode. Forschung, nicht zertifiziert. Keine Empfehlung.'
  };

  /* ------------------------------------------------------------ Zustand (rein, getestet) */
  /** Rein: Antworten von /v1/me, /v1/supertrader/follows und /v1/watchlist -> Zustand. */
  function fromApi(me, follows, watch) {
    if (!me) return { mode: 'signed-out', notif: {}, push: {}, follows: {}, items: [] };
    var f = {};
    ((follows && follows.follows) || []).forEach(function (x) { if (x && x.strategyId) f[x.strategyId] = true; });
    return { mode: 'in', notif: (me.settings && me.settings.notifications) || {}, push: me.push || {}, follows: f,
      items: ((watch && watch.items) || []).map(function (i) { return { instrumentId: i.instrumentId, listId: i.listId, ticker: i.ticker, alerts: i.alerts || {} }; }) };
  }
  /** Rein: ist der Knopf an? Dieselbe Regel wie die Zustellung (push_claim_daily): Art im Konto an, und bei der Aktie
      ein Watchlist-Eintrag, der die Art nicht ausgeschaltet hat. */
  function isOn(st, kind, key) {
    if (!st || st.mode !== 'in' || st.notif[ALERT] !== true) return false;
    if (kind === 'method') return st.follows[key] === true;
    return st.items.some(function (i) { return i.ticker === key && i.alerts[ALERT] !== false; });
  }
  /** Rein: ein Satz zur Zustellung. */
  function line(st) {
    if (!st || st.mode !== 'in') return TEXT.account;
    if (st.push.available !== true) return TEXT.noPush;
    return Number(st.push.devices) > 0 ? TEXT.app : TEXT.noApp;
  }
  /** Rein: Konto-Einstellungen mit eingeschalteter Art (die übrigen Arten bleiben, wie sie sind). */
  function notifPatch(notif) {
    var out = {}; Object.keys(notif || {}).forEach(function (k) { out[k] = notif[k]; });
    out[ALERT] = true;
    return { settings: { notifications: out } };
  }

  /* ------------------------------------------------------------ Konto */
  function hint() { try { return root.localStorage && root.localStorage.getItem(SESSION) === '1'; } catch (e) { return false; } }
  function script(src) {
    var doc = root.document;
    if (!doc || !doc.head) return Promise.resolve(false);
    return new Promise(function (done) { var s = doc.createElement('script'); s.src = src; s.async = true; s.onload = function () { done(true); }; s.onerror = function () { done(false); }; doc.head.appendChild(s); });
  }
  var cfgP = null, apiP = null, stateP = null;
  /* Konten eingerichtet? (/konto/config.js: leerer Endpunkt = Konten aus). */
  function configured() {
    if (!cfgP) cfgP = (root.VU_ACCOUNT_CONFIG ? Promise.resolve(true) : script('/konto/config.js')).then(function () {
      var c = root.VU_ACCOUNT_CONFIG; return !!(c && c.endpoint);
    }, function () { return false; });
    return cfgP;
  }
  function account() {
    if (!apiP) apiP = configured().then(function (on) {
      if (!on) return null;
      return (root.VUAccount ? Promise.resolve(true) : script('/konto/account-api.js')).then(function () {
        var A = root.VUAccount; return A && A.available && A.available() ? A : null;
      });
    }, function () { return null; });
    return apiP;
  }
  function load() {
    if (stateP) return stateP;
    if (!hint()) return Promise.resolve(fromApi(null));
    stateP = account().then(function (A) {
      if (!A) return fromApi(null);
      return Promise.all([A.get('/v1/me'), A.get('/v1/supertrader/follows'), A.get('/v1/watchlist')]).then(function (r) {
        return r[0].ok ? fromApi(r[0].data, r[1].ok ? r[1].data : null, r[2].ok ? r[2].data : null) : fromApi(null);
      });
    }).catch(function () { return fromApi(null); });
    return stateP;
  }
  function ensureNotif(A, st) {
    if (st.notif[ALERT] === true) return Promise.resolve({ ok: true });
    return A.patch('/v1/me', notifPatch(st.notif)).then(function (r) {
      if (r.ok) st.notif = (r.data.settings && r.data.settings.notifications) || notifPatch(st.notif).settings.notifications;
      return r;
    });
  }
  function watchChanged(id, ticker) {
    try { root.sessionStorage.removeItem(WL_STORE); } catch (e) { /* nur Komfort */ }
    if (root.dispatchEvent && root.CustomEvent) root.dispatchEvent(new root.CustomEvent('vu-watchlist-change', { detail: { instrumentId: id, ticker: ticker, saved: true } }));
  }
  /* Genau ein aktives Listing zum Ticker (assets/watchlist-button.js#resolveInstrument, Company Master über core/identity.js). */
  function instrument(ticker) {
    var ready = root.VUCore && root.VUCore.Identity ? Promise.resolve() : script('/core/identity.js');
    return ready.then(function () { return root.VUWatchButton ? true : script('/assets/watchlist-button.js'); })
      .then(function () { return root.VUWatchButton ? root.VUWatchButton.resolveInstrument(ticker) : null; });
  }
  function setStock(A, st, ticker, on) {
    var mine = st.items.filter(function (i) { return i.ticker === ticker; });
    var patchAll = function (list, value) {
      return Promise.all(list.map(function (i) {
        var alerts = {}; Object.keys(i.alerts).forEach(function (k) { alerts[k] = i.alerts[k]; }); alerts[ALERT] = value;
        return A.patch('/v1/watchlist/items', { instrumentId: i.instrumentId, listId: i.listId, alerts: alerts }).then(function (r) { if (r.ok) i.alerts = alerts; return r; });
      })).then(function (rs) { return rs.filter(function (r) { return !r.ok; })[0] || { ok: true }; });
    };
    if (!on) return patchAll(mine, false);
    var add = mine.length ? Promise.resolve({ ok: true }) : instrument(ticker).then(function (id) {
      if (!id) return { ok: false, state: 'INSTRUMENT_NOT_RESOLVED' };
      return A.post('/v1/watchlist/items', { instrumentId: id, ticker: ticker }).then(function (r) {
        if (!r.ok) return r;
        watchChanged(id, ticker);
        return A.get('/v1/watchlist').then(function (w) {
          if (w.ok) st.items = fromApi({}, null, w.data).items;
          mine = st.items.filter(function (i) { return i.ticker === ticker; });
          return { ok: true };
        });
      });
    });
    return add.then(function (r) {
      if (!r.ok) return r;
      return patchAll(mine.filter(function (i) { return i.alerts[ALERT] !== true; }), true);
    }).then(function (r) { return r.ok ? ensureNotif(A, st) : r; });
  }
  function setMethod(A, st, id, on) {
    var req = on ? A.post('/v1/supertrader/follows', { strategyId: id }) : A.post('/v1/supertrader/follows/remove', { strategyId: id });
    return req.then(function (r) {
      if (!r.ok) return r;
      if (on) st.follows[id] = true; else delete st.follows[id];
      return on ? ensureNotif(A, st) : r;
    });
  }

  /* ------------------------------------------------------------ Darstellung */
  var buttons = [];
  /* Die Knöpfe zeichnet st-redesign.js (bellHtml: .stp-btn.stp-btn--ol.stp-bell mit data-st-follow, data-key, data-name);
     hier kommen Zustand, Beschriftung und Klick dazu. */
  function paint(btn, st) {
    var kind = btn.getAttribute('data-st-follow'), on = isOn(st, kind, btn.getAttribute('data-key')), t = TEXT[kind];
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('aria-label', t.aria(btn.getAttribute('data-name'), on));
    var label = btn.querySelector('.stp-bell-t'); if (label) label.textContent = on ? t.on : t.off;
  }
  function paintAll(st) { buttons = buttons.filter(function (b) { return b.isConnected; }); buttons.forEach(function (b) { paint(b, st); }); }
  function say(btn, text, link) {
    var host = btn.closest('.stp-sheet') || btn.parentNode, box = host.querySelector('.stp-bell-note');
    if (!box) return;
    box.textContent = text;
    if (link) { var a = root.document.createElement('a'); a.className = 'stp-lk'; a.href = link.href; a.textContent = link.label; box.appendChild(root.document.createTextNode(' ')); box.appendChild(a); }
    box.hidden = false;
  }
  function loginHref() {
    var l = root.location, next = l ? l.pathname + l.search + l.hash : '/supertrader/';
    return '/konto/anmelden/?next=' + encodeURIComponent(next);
  }
  function click(btn) {
    var kind = btn.getAttribute('data-st-follow'), key = btn.getAttribute('data-key');
    load().then(function (st) {
      if (st.mode !== 'in') {
        return configured().then(function (on) { say(btn, on ? TEXT.account : TEXT.closed, on ? { href: loginHref(), label: TEXT.login } : null); });
      }
      var want = !isOn(st, kind, key);
      btn.disabled = true;
      return account().then(function (A) {
        if (!A) { btn.disabled = false; return say(btn, TEXT.closed); }
        return (kind === 'method' ? setMethod(A, st, key, want) : setStock(A, st, key, want)).then(function (r) {
          btn.disabled = false;
          paintAll(st);
          if (!r.ok) {
            if (r.status === 401) { stateP = null; return say(btn, TEXT.account, { href: loginHref(), label: TEXT.login }); }
            if (r.state === 'INSTRUMENT_NOT_RESOLVED') return say(btn, TEXT.unresolved);
            if (r.state === 'WATCHLIST_ITEMS_LIMIT_REACHED') return say(btn, A.message(r.state), { href: '/konto/tarife/', label: 'Tarife' });
            return say(btn, (A.message && A.message(r.state)) || TEXT.error);
          }
          say(btn, (want ? TEXT[kind].done : TEXT[kind].undone) + (want ? ' ' + line(st) : ''), { href: '/konto/einstellungen/#supertrader-meldungen', label: 'Meldungen im Konto' });
        });
      });
    }).catch(function () { btn.disabled = false; say(btn, TEXT.error); });
  }
  /** Bindet alle Knöpfe in host, zeichnet den Stand (angemeldet) und nimmt Klicks an. */
  function bind(host) {
    if (!host) return;
    Array.prototype.forEach.call(host.querySelectorAll('[data-st-follow]'), function (btn) {
      if (btn.getAttribute('data-bound')) return;
      btn.setAttribute('data-bound', '1');
      buttons.push(btn);
      btn.addEventListener('click', function () { click(btn); });
    });
    load().then(paintAll);
  }

  return Object.freeze({ VERSION: VERSION, TEXT: TEXT, ALERT: ALERT, fromApi: fromApi, isOn: isOn, line: line, notifPatch: notifPatch,
    bind: bind, load: load,
    /* Schreibweg eines Klicks ohne Oberfläche (Tests): kind 'method' | 'stock', on = gewünschter Zustand. */
    apply: function (A, st, kind, key, on) { return kind === 'method' ? setMethod(A, st, key, on) : setStock(A, st, key, on); },
    _reset: function () { cfgP = null; apiP = null; stateP = null; buttons = []; } });
});
