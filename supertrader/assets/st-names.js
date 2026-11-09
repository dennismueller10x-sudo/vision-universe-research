/* Vision Universe® — Supertrader: ein Name je Methode (Konzept „Das Rezept eines Profis“, Entscheidung 2, Folie K3).
   Regel „Trader · Muster“. Der Name gilt auf jeder Seite, in Leiste, Protokoll, Filtern und Musterdepot.
   Technische Namen (strategy_name, „VU Adaptation – …“, Katalognamen) stehen nur noch in Methodik und Quellen.
   Nur Darstellung: keine Regel, kein Musterdepot und kein Datenstand ändert sich.
   UMD: im Browser window.STNames, in Node module.exports (Vertragstest st-recipe-names.test.mjs). */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.STNames = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  /* Die 13 quellentreuen Methoden: [Trader, Muster, Trader ausgeschrieben, Stil, ein Satz in Alltagssprache, Musterdepot (strategy_id)] */
  var METHODS = {
    C04: ['Weinstein', 'Investor', 'Stan Weinstein', 'Trend', 'Aktie verlässt eine lange Seitwärtsphase nach oben.', 'WEINSTEIN_STAGE'],
    C05: ['Weinstein', 'Trader', 'Stan Weinstein', 'Trend', 'Neuer Anlauf nach oben in einem laufenden Aufwärtstrend.', null],
    C06: ['Minervini', 'VCP', 'Mark Minervini', 'Ausbruch', 'Schwankungen werden kleiner, dann folgt der Ausbruch.', 'MINERVINI_VCP'],
    C11: ['Morales & Kacher', 'Pocket Pivot', 'Gil Morales, Chris Kacher', 'Volumen', 'Aufwärtstag mit mehr Volumen als jeder Abwärtstag der letzten 10 Tage.', null],
    C12: ['Morales & Kacher', 'Buyable Gap-Up', 'Gil Morales, Chris Kacher', 'Kurslücke', 'Kurslücke nach oben mit sehr hohem Volumen.', null],
    C13: ['Raschke', 'Holy Grail', 'Linda Raschke', 'Rücksetzer', 'Starker Trend, dann erster Rücksetzer an die 20-Tage-Linie.', null],
    C03: ['Darvas', 'Box', 'Nicolas Darvas', 'Ausbruch', 'Kurs pendelt in einer Kiste und bricht nach oben aus.', 'DARVAS_BOX'],
    C01: ['Turtle', '20 Tage', 'Richard Dennis', 'Trend', 'Kurs steigt über das Hoch der letzten 20 Tage.', 'DONCHIAN_TURTLE'],
    C02: ['Turtle', '55 Tage', 'Richard Dennis', 'Trend', 'Kurs steigt über das Hoch der letzten 55 Tage.', null],
    C09: ['Kullamägi', 'Episodic Pivot', 'Kristjan Kullamägi', 'Kurslücke', 'Kurssprung um mindestens 10 % nach einer Überraschung.', null],
    C07: ['Minervini', 'Power Play', 'Mark Minervini', 'Ausbruch', 'Erst +100 % in acht Wochen, dann eine ruhige Pause.', null],
    C08: ['Kullamägi', 'Breakout', 'Kristjan Kullamägi', 'Ausbruch', 'Starker Lauf, enge Pause, dann Ausbruch.', 'MOMENTUM_BREAKOUT'],
    C10: ['Kullamägi', 'Parabolic', 'Kristjan Kullamägi', 'Short', 'Überhitzte Aktie, Wette auf Rückgang. Nur Forschung.', null]
  };
  var ORDER = ['C04', 'C05', 'C06', 'C11', 'C12', 'C13', 'C03', 'C01', 'C02', 'C09', 'C07', 'C08', 'C10'];
  var STYLES = ['Ausbruch', 'Trend', 'Kurslücke', 'Volumen', 'Rücksetzer', 'Short'];
  /* Musterdepot (strategy_id) → Methode. Die fünf Musterdepots tragen den Namen ihrer Methode. */
  var DEPOT = {};
  Object.keys(METHODS).forEach(function (c) { if (METHODS[c][5]) DEPOT[METHODS[c][5]] = c; });
  /* Modelle der früheren Reihe „Weitere 7“: erscheinen als „Weitere Modelle in der Forschung“ unter ihrem bisherigen Namen. */
  var RESEARCH_LABEL = 'Weitere Modelle in der Forschung';
  /* Namenskarten der Registry, die dieselbe Methode beschreiben wie eine der 13 (kein Musterdepot): gleicher Name. */
  var ALIAS = { KK_EPISODIC_PIVOT: 'C09', KK_PARABOLIC_SHORT: 'C10' };

  function method(cid) {
    var m = METHODS[cid]; if (!m) return null;
    return { id: cid, trader: m[0], pattern: m[1], name: m[0] + ' · ' + m[1], author: m[2], style: m[3], plain: m[4], depot: m[5] };
  }
  /** Anzeigename einer Methode (Cxx) oder eines Musterdepots (strategy_id); sonst der übergebene Rückfallname. */
  function name(id, fallback) {
    var c = METHODS[id] ? id : DEPOT[id] || ALIAS[id];
    return c ? METHODS[c][0] + ' · ' + METHODS[c][1] : (fallback || id || '');
  }
  /** Anzeigename eines Registry-Eintrags (registry.strategies[]). */
  function ofStrategy(s) { return s ? name(s.strategy_id, s.world_name) : ''; }
  function methodOfDepot(strategyId) { return DEPOT[strategyId] || null; }
  /** Gehört der Registry-Eintrag zu einer der 13 Methoden (Musterdepot oder gleiche Namenskarte)? */
  function isMethod(strategyId) { return !!(DEPOT[strategyId] || ALIAS[strategyId]); }
  function all() { return ORDER.map(method); }
  /* „So denkt die Methode“ in drei Schritten (Screen t-method), für die fünf Methoden mit Musterdepot; Kurzfassung der Regelkarte. */
  var THINK = {
    C06: [['Aufwärtstrend', 'Kurs über den Durchschnitten'], ['Wird ruhiger', 'jede Schwankung kleiner'], ['Ausbruch', 'über die Zone, mit Volumen']],
    C01: [['Ausbruch', 'Kurs über dem 20-Tage-Hoch'], ['Mitlaufen', 'Ungültig-Marke 2 Tagesspannen darunter'], ['Abgabe', 'Schluss unter dem 10-Tage-Tief']],
    C03: [['Kiste', 'Hoch und Tief bestätigt'], ['Ausbruch', 'Kurs über die Kiste'], ['Nachziehen', 'Ungültig-Marke unter die neue Kiste']],
    C04: [['Basis', 'lange Seitwärtsphase'], ['Ausbruch', 'über die 30-Wochen-Linie, mit Volumen'], ['Trend', 'Stufe 2 laufen lassen']],
    C08: [['Starker Lauf', 'Kurs unter den stärksten'], ['Enge Pause', 'ruhig nahe am Hoch'], ['Ausbruch', 'über die Pause']]
  };
  function think(cid) { return THINK[cid] || null; }
  /* Seite je Methode: Musterdepots haben ihre erzeugte Seite (scripts/supertrader/build.mjs), die übrigen die Kandidatenansicht. */
  var SLUG = { WEINSTEIN_STAGE: 'weinstein-stages', MINERVINI_VCP: 'minervini-vcp', DARVAS_BOX: 'darvas-boxes', DONCHIAN_TURTLE: 'donchian-turtle', MOMENTUM_BREAKOUT: 'momentum-breakout' };
  function href(cid) { var m = METHODS[cid]; return m && m[5] && SLUG[m[5]] ? '/supertrader/strategies/' + SLUG[m[5]] + '/' : '/supertrader/strategies/?sf=' + encodeURIComponent(cid); }
  return { version: 'st-names-1.0.0', METHODS: METHODS, ORDER: ORDER, STYLES: STYLES, DEPOT: DEPOT, RESEARCH_LABEL: RESEARCH_LABEL, method: method, name: name, ofStrategy: ofStrategy, methodOfDepot: methodOfDepot, isMethod: isMethod, ALIAS: ALIAS, all: all, SLUG: SLUG, href: href, THINK: THINK, think: think };
});
