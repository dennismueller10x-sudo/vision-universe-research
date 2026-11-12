/* =========================================================================
   VISION UNIVERSE — willkommen/start/prefs.js
   Wahl aus dem ersten Start (Mockup E11) und „Wo stehst du?“ der Startseite (E01):
   Ziel, Erfahrung, erste Aktien. Gespeichert wird lokal auf dem Gerät.

   Schnittstelle (Gerät; Konto über toAccount → PATCH /v1/me settings.goal / experienceLevel / onboardedAt):
     localStorage "vu-start-v1" = {"v":1,"goal":GOAL|null,"mode":MODE|null,"tickers":[…],"at":ISO,"done":bool,"acct":USER_ID|null}
       acct: Konto, in das die Gerätewahl schon übernommen wurde (adopt, einmal je Konto).
       GOAL: "vorsorge" | "aktie" | "ideen" | "signale"
       MODE: "beginner" (Einsteiger) | "advanced" (Fortgeschritten) | "pro" (Profi)
     localStorage "vu-start-path" (Startseite, nur Vorauswahl): "anfaenger" | "verstehen" | "profi"
   Ohne Anmeldung bleibt die Wahl auf dem Gerät; nach der Anmeldung übernimmt adopt() sie einmal ins Konto,
   solange das Konto den ersten Start noch nicht kennt (settings.onboardedAt leer). Danach gilt das Konto.
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
    signale: { title: 'Strategien und Regel-Ergebnisse', text: 'Methoden der Profis, Backtests, 13F-Daten der Fonds.', world: 'supertrader', worldName: 'Supertrader',
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
      at: typeof o.at === 'string' ? o.at : null, done: o.done === true,
      acct: typeof o.acct === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(o.acct) ? o.acct : null };
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
  /* Konto (Z1, workers/vu-account): settings.goal vorsorge|aktie|ideen|strategien, settings.experienceLevel beginner|advanced|pro,
     settings.onboardedAt (PATCH true, der Server setzt die Zeit). Auf dem Gerät heißt das Ziel „signale“. */
  var GOAL_TO_ACCOUNT = { vorsorge: 'vorsorge', aktie: 'aktie', ideen: 'ideen', signale: 'strategien' };
  var GOAL_FROM_ACCOUNT = { vorsorge: 'vorsorge', aktie: 'aktie', ideen: 'ideen', strategien: 'signale' };
  /** Einstellungs-Patch für PATCH /v1/me ({settings: …}); nur gewählte Felder. */
  function toAccount(st, finished) {
    var out = {};
    if (st && GOAL_TO_ACCOUNT[st.goal]) out.goal = GOAL_TO_ACCOUNT[st.goal];
    if (st && MODES[st.mode]) out.experienceLevel = st.mode;
    if (finished) out.onboardedAt = true;
    return out;
  }
  /** Konto zuerst (settings.goal / settings.experienceLevel), sonst Gerät. Die Erfahrung des Kontos zählt erst,
      wenn der erste Start im Konto erledigt ist (sonst steht dort nur der Vorgabewert). */
  function effective(me, ls) {
    var local = read(ls), st = (me && me.settings) || {};
    var goal = GOAL_FROM_ACCOUNT[st.goal] || null, mode = MODES[st.experienceLevel] ? st.experienceLevel : null;
    if (!st.onboardedAt && local.mode) mode = null;
    return { goal: goal || local.goal, mode: mode || local.mode, done: local.done || !!st.onboardedAt, tickers: local.tickers, preset: !!local.preset };
  }
  /** Patch für die einmalige Übernahme nach der Anmeldung, sonst null: nur wenn das Konto den ersten Start
      noch nicht kennt, auf dem Gerät etwas gewählt ist und dieses Gerät das Konto noch nicht übernommen hat. */
  function adoptPatch(me, ls) {
    var local = read(ls), st = me && me.settings, id = me && me.user && me.user.id;
    if (!st || !id || st.onboardedAt || local.acct === id || local.preset) return null;
    var patch = toAccount(local, local.done);
    return Object.keys(patch).length ? patch : null;
  }
  /** Gerätewahl einmal ins Konto (PATCH /v1/me). A = VUAccount. Liefert das neue me oder das alte. */
  function adopt(A, me, ls) {
    var patch = adoptPatch(me, ls), id = me && me.user && me.user.id;
    if (!patch || !A || !A.patch) return Promise.resolve(me);
    return A.patch('/v1/me', { settings: patch }).then(function (r) {
      if (!r || !r.ok) return me;
      write({ acct: id }, ls);
      return r.data || me;
    }, function () { return me; });
  }
  function goalCard(goal) { return GOALS[goal] || NO_GOAL; }
  return Object.freeze({ KEY: KEY, PATH_KEY: PATH_KEY, GOALS: GOALS, GOAL_ORDER: GOAL_ORDER, MODES: MODES, MODE_ORDER: MODE_ORDER, FROM_PATH: FROM_PATH,
    POPULAR: POPULAR, NO_GOAL: NO_GOAL, read: read, write: write, effective: effective, toAccount: toAccount, adoptPatch: adoptPatch, adopt: adopt, goalCard: goalCard });
});
