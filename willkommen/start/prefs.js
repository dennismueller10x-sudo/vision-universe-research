/* =========================================================================
   VISION UNIVERSE — willkommen/start/prefs.js
   Wahl aus dem ersten Start (Mockup E11) und „Wo stehst du?“ der Startseite (E01):
   Ziel, Erfahrung, erste Aktien. Gespeichert wird lokal auf dem Gerät.

   Schnittstelle (für die spätere Konto-Speicherung settings.goal / settings.mode):
     localStorage "vu-start-v1" = {"v":1,"goal":GOAL|null,"mode":MODE|null,"tickers":[…],"at":ISO,"done":bool}
       GOAL: "vorsorge" | "aktie" | "ideen" | "signale"
       MODE: "beginner" (Einsteiger) | "advanced" (Fortgeschritten) | "pro" (Profi)
     localStorage "vu-start-path" (Startseite, nur Vorauswahl): "anfaenger" | "verstehen" | "profi"
   Liest zuerst das Konto (me.settings.goal / me.settings.mode, sobald es sie gibt), sonst das Gerät.
   UMD: Browser globalThis.VUStart, Node module.exports (Tests).
   ========================================================================= */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.VUStart = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var KEY = 'vu-start-v1', PATH_KEY = 'vu-start-path';
  var GOALS = {
    vorsorge: { title: 'Mit 10 € im Monat anfangen', text: 'Sparplan, ETF und Rente einfach erklärt.', world: 'vorsorge', worldName: 'Vorsorge',
      label: 'Dein Ziel: Mit einem Sparplan anfangen', step: 'Starte mit dem Vorsorge-Planer', href: '/vorsorge/#/plan' },
    aktie: { title: 'Eine Aktie verstehen', text: 'Eine Aktie, sieben Blickwinkel, ein klares Urteil.', world: 'discover', worldName: 'Aktienseite',
      label: 'Dein Ziel: Eine Aktie verstehen', step: 'Starte mit NVIDIA im Überblick', href: '/discover/#/s/US_REAL/NVDA' },
    ideen: { title: 'Ideen finden', text: 'Themen, Listen und Swipen statt langer Tabellen.', world: 'discover', worldName: 'Discover',
      label: 'Dein Ziel: Ideen finden', step: 'Starte mit den Themenwelten', href: '/discover/#/welten' },
    signale: { title: 'Strategien und Signale', text: 'Methoden der Profis, Backtests, 13F-Daten der Fonds.', world: 'supertrader', worldName: 'Supertrader',
      label: 'Dein Ziel: Wie ein Profi analysieren', step: 'Starte mit den Methoden', href: '/supertrader/strategies/' }
  };
  var GOAL_ORDER = ['vorsorge', 'aktie', 'ideen', 'signale'];
  var MODES = {
    beginner: { title: 'Einsteiger', text: 'Drei Urteile je Aktie, jede Zahl mit Erklärung, keine Fachbegriffe ohne „?“.' },
    advanced: { title: 'Fortgeschritten', text: 'Alle Perspektiven einer Aktie, Erklärungen auf Tipp.' },
    pro: { title: 'Profi', text: 'Alle Kennzahlen, Zonen im Chart, Fachbegriffe; Wellen und Methoden mit PRO-Marke.' }
  };
  var MODE_ORDER = ['beginner', 'advanced', 'pro'];
  /* „Wo stehst du?“ der Startseite → Vorauswahl im ersten Start. */
  var FROM_PATH = { anfaenger: { goal: 'vorsorge', mode: 'beginner' }, verstehen: { goal: 'aktie', mode: 'beginner' }, profi: { goal: 'signale', mode: 'pro' } };
  /* Beliebte Kürzel: feste Liste im Code, keine Empfehlung. */
  var POPULAR = ['NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AMD', 'MU', 'NFLX', 'COST', 'KO'];
  var NO_GOAL = { label: 'Noch kein Ziel gewählt', step: 'Wähle deinen Einstieg in drei Schritten', href: '/willkommen/start/' };

  function store(ls) { try { return ls || (typeof localStorage !== 'undefined' ? localStorage : null); } catch (e) { return null; } }
  function clean(x) {
    var o = x && typeof x === 'object' ? x : {};
    return { v: 1, goal: GOALS[o.goal] ? o.goal : null, mode: MODES[o.mode] ? o.mode : null,
      tickers: Array.isArray(o.tickers) ? o.tickers.filter(function (t) { return typeof t === 'string' && /^[A-Z0-9.\-]{1,12}$/.test(t); }).slice(0, 20) : [],
      at: typeof o.at === 'string' ? o.at : null, done: o.done === true };
  }
  function read(ls) {
    var s = store(ls), raw = null, path = null;
    try { raw = s && s.getItem(KEY); path = s && s.getItem(PATH_KEY); } catch (e) { raw = null; }
    var v = null; try { v = raw ? JSON.parse(raw) : null; } catch (e) { v = null; }
    var out = clean(v);
    if (!v && FROM_PATH[path]) { out.goal = FROM_PATH[path].goal; out.mode = FROM_PATH[path].mode; out.preset = true; }
    return out;
  }
  function write(patch, ls) {
    var s = store(ls), cur = read(ls), next = clean(Object.assign({}, cur, patch || {}, { at: new Date().toISOString() }));
    try { if (s) s.setItem(KEY, JSON.stringify(next)); } catch (e) { /* privater Modus: Wahl gilt nur für diese Seite */ }
    return next;
  }
  /** Konto zuerst (sobald settings.goal/mode existieren), sonst Gerät. */
  function effective(me, ls) {
    var local = read(ls), st = (me && me.settings) || {};
    return { goal: GOALS[st.goal] ? st.goal : local.goal, mode: MODES[st.mode] ? st.mode : local.mode, done: local.done, tickers: local.tickers, preset: !!local.preset };
  }
  function goalCard(goal) { return GOALS[goal] || NO_GOAL; }
  return Object.freeze({ KEY: KEY, PATH_KEY: PATH_KEY, GOALS: GOALS, GOAL_ORDER: GOAL_ORDER, MODES: MODES, MODE_ORDER: MODE_ORDER, FROM_PATH: FROM_PATH,
    POPULAR: POPULAR, NO_GOAL: NO_GOAL, read: read, write: write, effective: effective, goalCard: goalCard });
});
