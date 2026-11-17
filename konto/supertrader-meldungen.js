/* =========================================================================
   VISION UNIVERSE — konto/supertrader-meldungen.js   Supertrader-Meldungen im Konto
   Zeigt auf /konto/einstellungen/ (#supertrader-meldungen), was „Folgen“ und „Melden“ im Supertrader
   (supertrader/assets/st-follow.js) gespeichert haben, und nimmt es zurück:
     gefolgte Methoden  GET /v1/supertrader/follows, Entfolgen POST /v1/supertrader/follows/remove
     gemeldete Aktien   Watchlist-Einträge (GET /v1/watchlist), deren Art SUPERTRADER_SIGNAL nicht aus ist;
                        „Nicht mehr melden“ setzt sie am Eintrag aus (PATCH /v1/watchlist/items), die Aktie bleibt.
   Eingebaut, AUS bis zur Prüfung durch einen Anwalt (Owner 16.11.2026): Der Abschnitt erscheint nur, wenn der Konto-Worker
   /v1/supertrader/follows beantwortet (Schalter VU_SUPERTRADER_ALERTS_ENABLED, docs/accounts/FREIGABEN.md).
   Ob überhaupt etwas kommt, entscheidet die Art „Supertrader: Regel-Ergebnisse der Methoden“ im Formular darüber.
   Texte nach docs/legal/WORTWAHL.md: beschreiben, keine Aufforderung, kein „Signal“.
   UMD: Browser globalThis.VUSTMeldungen, Node module.exports (konto/tests/supertrader-meldungen.test.mjs).
   ========================================================================= */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.VUSTMeldungen = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var ALERT = 'SUPERTRADER_SIGNAL';
  /* strategyId der 13 quellentreuen Methoden -> Name wie auf der Supertrader-Seite (supertrader/assets/st-names.js). */
  var METHODS = {
    SF_TURTLE_S1: ['C01', 'Turtle · 20 Tage'], SF_TURTLE_S2: ['C02', 'Turtle · 55 Tage'], SF_DARVAS_BOX: ['C03', 'Darvas · Box'],
    SF_WEINSTEIN_INVESTOR: ['C04', 'Weinstein · Investor'], SF_WEINSTEIN_TRADER: ['C05', 'Weinstein · Trader'],
    SF_MINERVINI_SEPA_VCP: ['C06', 'Minervini · VCP'], SF_MINERVINI_POWER_PLAY: ['C07', 'Minervini · Power Play'],
    SF_KK_BREAKOUT: ['C08', 'Kullamägi · Breakout'], SF_KK_EPISODIC_PIVOT: ['C09', 'Kullamägi · Episodic Pivot'],
    SF_KK_PARABOLIC_SHORT: ['C10', 'Kullamägi · Parabolic'], SF_MOKA_POCKET_PIVOT: ['C11', 'Morales & Kacher · Pocket Pivot'],
    SF_MOKA_BUYABLE_GAP_UP: ['C12', 'Morales & Kacher · Buyable Gap-Up'], SF_RASCHKE_HOLY_GRAIL: ['C13', 'Raschke · Holy Grail']
  };
  var TEXT = {
    off: 'Ausgeschaltet: Damit Meldungen kommen, oben „Supertrader: Regel-Ergebnisse der Methoden“ einschalten und speichern.',
    on: 'Eingeschaltet. Meldungen kommen über die App, höchstens eine am Tag.',
    noMethods: 'Du folgst noch keiner Methode. Im Supertrader im Fenster einer Methode auf „Folgen“ tippen.',
    noStocks: 'Noch keine Aktie gemeldet. Im Supertrader im Fenster „Ablauf“ einer Aktie auf „Melden“ tippen.',
    methodRule: 'Meldung, wenn eine Aktie bei der Methode „Regel erfüllt“ oder „Plan fertig“ erreicht.',
    stockRule: 'Meldung, wenn die Aktie bei einer Methode eine Stufe erreicht oder verlässt.',
    unfollow: 'Nicht mehr folgen', unreport: 'Nicht mehr melden'
  };

  function methodName(id) { return METHODS[id] ? METHODS[id][1] : id; }
  function methodHref(id) { return METHODS[id] ? '/supertrader/strategies/?sf=' + METHODS[id][0] : '/supertrader/'; }
  /** Rein: Antworten -> was die Seite zeigt. */
  function model(me, follows, watch) {
    var on = !!(me && me.settings && me.settings.notifications && me.settings.notifications[ALERT] === true);
    var seen = {};
    var stocks = ((watch && watch.items) || []).filter(function (i) {
      if (!i.ticker || (i.alerts || {})[ALERT] === false || seen[i.ticker]) return false;
      seen[i.ticker] = true; return true;
    }).map(function (i) { return { ticker: i.ticker, instrumentId: i.instrumentId }; });
    return { on: on, methods: ((follows && follows.follows) || []).map(function (f) { return { id: f.strategyId, name: methodName(f.strategyId), href: methodHref(f.strategyId) }; }), stocks: stocks };
  }

  function el(doc, tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function row(doc, label, href, sub, button, onClick) {
    var li = el(doc, 'li', 'ka-st-row'), t = el(doc, 'span', 'ka-st-t'), a = el(doc, 'a', 'ka-link', label);
    a.href = href; t.append(a, el(doc, 'small', 'ka-muted', sub));
    var b = el(doc, 'button', 'ka-btn ka-btn--secondary ka-st-btn', button); b.type = 'button';
    b.addEventListener('click', function () { b.disabled = true; onClick(b, li); });
    li.append(t, b);
    return li;
  }
  function render(doc, A, m, watchItems) {
    var box = doc.getElementById('supertrader-meldungen');
    if (!box) return;
    var status = doc.getElementById('st-meldungen-status'), ml = doc.getElementById('st-meldungen-methods'), sl = doc.getElementById('st-meldungen-stocks');
    status.textContent = m.on ? TEXT.on : TEXT.off;
    /* Schalter im Formular darüber: der Satz folgt der Wahl (gespeichert wird mit „Speichern“). */
    var sw = doc.querySelector('[data-notification="' + ALERT + '"]');
    if (sw && !sw.getAttribute('data-st-bound')) { sw.setAttribute('data-st-bound', '1'); sw.addEventListener('change', function () { status.textContent = sw.checked ? TEXT.on : TEXT.off; }); }
    ml.textContent = ''; sl.textContent = '';
    if (!m.methods.length) ml.append(el(doc, 'li', 'ka-muted', TEXT.noMethods));
    m.methods.forEach(function (x) {
      ml.append(row(doc, x.name, x.href, TEXT.methodRule, TEXT.unfollow, function (b, li) {
        A.post('/v1/supertrader/follows/remove', { strategyId: x.id }).then(function (r) { if (r.ok) li.remove(); else { b.disabled = false; status.textContent = A.message(r.state); } });
      }));
    });
    if (!m.stocks.length) sl.append(el(doc, 'li', 'ka-muted', TEXT.noStocks));
    m.stocks.forEach(function (x) {
      sl.append(row(doc, x.ticker, '/supertrader/stock/?s=' + encodeURIComponent(x.ticker), TEXT.stockRule, TEXT.unreport, function (b, li) {
        var mine = watchItems.filter(function (i) { return i.ticker === x.ticker; });
        Promise.all(mine.map(function (i) {
          var alerts = {}; Object.keys(i.alerts || {}).forEach(function (k) { alerts[k] = i.alerts[k]; }); alerts[ALERT] = false;
          return A.patch('/v1/watchlist/items', { instrumentId: i.instrumentId, listId: i.listId, alerts: alerts });
        })).then(function (rs) { var bad = rs.filter(function (r) { return !r.ok; })[0]; if (!bad) li.remove(); else { b.disabled = false; status.textContent = A.message(bad.state); } });
      }));
    });
    box.hidden = false;
  }
  /* Frontend-Schalter, schaltet gemeinsam mit ST_ALERTS_UI (supertrader/assets/st-redesign.js) und dem Worker
     (Vertragstest ST-ALERTS-5). AUS: keine Anfrage an /v1/supertrader/follows (sonst 404 in der Konsole), Abschnitt verborgen. */
  var ST_ALERTS_KONTO = false;
  function start(doc, opt) {
    var A = root.VUAccount, on = opt && typeof opt.enabled === 'boolean' ? opt.enabled : ST_ALERTS_KONTO;
    if (!on || !doc || !A || !A.available || !A.available()) return Promise.resolve(false);
    /* Zuerst die gefolgten Methoden: Solange „Folgen“/„Melden“ im Konto-Worker aus ist (VU_SUPERTRADER_ALERTS_ENABLED,
       aus bis zur Anwaltsprüfung), antwortet er 404 SUPERTRADER_ALERTS_NOT_ACTIVATED – dann bleibt der Abschnitt
       verborgen und es folgt keine weitere Anfrage. */
    return A.get('/v1/supertrader/follows').then(function (f) {
      if (!f.ok) return false;
      return Promise.all([A.get('/v1/me'), A.get('/v1/watchlist')]).then(function (r) {
        if (!r[0].ok) return false;
        var watch = r[1].ok ? r[1].data : { items: [] };
        render(doc, A, model(r[0].data, f.data, watch), watch.items || []);
        return true;
      });
    }).then(null, function () { return false; });
  }
  if (typeof module !== 'object' && root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', function () { start(root.document); });
    else start(root.document);
  }
  return Object.freeze({ METHODS: METHODS, TEXT: TEXT, model: model, methodName: methodName, start: start });
});
