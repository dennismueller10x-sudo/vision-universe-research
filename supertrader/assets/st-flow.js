/* Vision Universe® — Supertrader: die eine Ablauf-Leiste (Konzept „Das Rezept eines Profis“, Entscheidung 1, Folie K1).
   Zwei Fragen, eine Leiste:
   Erkennen (13 Methoden, über alle US-Aktien): Muster erkannt · Regel erfüllt · Plan fertig.
   Musterdepot (fünf Methoden, ohne echtes Geld): Wartet · Aufgenommen · Im Musterdepot · Abgegeben; „Muster zerfallen“
   liegt neben der Leiste. Die Zustände dahinter (Stufen der Kandidaten, Zustände des Musterdepots) bleiben unverändert;
   hier ändern sich nur Namen und Darstellung. Die Wörter gelten auf allen Seiten, im Protokoll, in Filtern und Hilfetexten.
   UMD: im Browser window.STFlow, in Node module.exports (Vertragstest st-recipe-names.test.mjs). */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.STFlow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var ERK = [['Muster erkannt', 'Der Chart sieht aus wie das Muster.'], ['Regel erfüllt', 'Alle prüfbaren Regeln der Methode stimmen.'], ['Plan fertig', 'Zone und Ungültig-Marke laut Methode stehen fest.']];
  var DEP = [['Wartet', 'Kurs noch unter der Zone laut Methode.'], ['Aufgenommen', 'Das Musterdepot nimmt die Aktie auf.'], ['Im Musterdepot', 'Läuft nach Regel weiter.'], ['Abgegeben', 'Regel sagt raus; Ergebnis im Protokoll.']];
  var BROKEN = ['Muster zerfallen', 'Der Kurs fiel unter die Ungültig-Marke laut Methode.'];
  /* Stufen der 13 Methoden (Datenstand sf-candidates) → Schritt der Leiste Erkennen */
  var STAGE = { CHART_CANDIDATE: 0, CONFIRMED_RESEARCH_SETUP: 1, MODELED_TRADE_PLAN: 2 };
  /* Zustände des Musterdepots (signals.json) → Schritt der Leiste Musterdepot; -1 = neben der Leiste */
  var STATE = { DISCOVERED: 0, WATCH: 0, SETUP: 0, ENTRY_READY: 0, TRIGGERED: 1, ACTIVE: 2, WARNING: 2, EXIT: 3, CLOSED: 3, INVALIDATED: -1 };
  var STATE_WORD = { DISCOVERED: 'Wartet', WATCH: 'Wartet', SETUP: 'Wartet', ENTRY_READY: 'Plan fertig', TRIGGERED: 'Aufgenommen', ACTIVE: 'Im Musterdepot', WARNING: 'Im Musterdepot',
    EXIT: 'Abgegeben', CLOSED: 'Abgegeben', INVALIDATED: 'Muster zerfallen', RETIRED_BY_RULE_VERSION: 'Durch neue Regel ersetzt', REASSESSED_AFTER_RULE_CHANGE: 'Nach Regeländerung neu bewertet' };
  /* Hilfetext, der beide Leisten erklärt (für „?“) */
  var HELP = ERK.map(function (x) { return x[0] + ': ' + x[1]; }).join(' ') + ' ' + DEP.map(function (x) { return x[0] + ': ' + x[1]; }).join(' ') + ' Ohne echtes Geld.';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function stepOfStage(stage) { return stage in STAGE ? STAGE[stage] : -1; }
  function stepOfState(state) { return state in STATE ? STATE[state] : -1; }
  function wordOfStage(stage) { var i = stepOfStage(stage); return i >= 0 ? ERK[i][0] : ''; }
  function wordOfState(state) { return STATE_WORD[state] || ''; }
  /** Große Leiste: alle Schritte mit Wort; Schritte vor `on` sind erledigt (schwarz), `on` ist neongrün. */
  function bar(labels, on, o) {
    var x = o || {}, aria = labels.map(function (l, i) { return (l[0] || l) + (i < on ? ' (erledigt)' : i === on ? ' (aktuell)' : ''); }).join(', ');
    return '<div class="st-flow' + (x.dk ? ' st-flow--dk' : '') + '" role="img" aria-label="' + esc((x.label ? x.label + ': ' : '') + aria) + '">' + labels.map(function (l, i) {
      return '<div class="' + (i < on ? 'is-done' : i === on ? 'is-on' : '') + '"><i></i><span>' + esc(l[0] || l) + '</span></div>';
    }).join('') + '</div>';
  }
  function erk(on, o) { return bar(ERK, on, Object.assign({ label: 'Erkennen' }, o || {})); }
  function dep(on, o) { return bar(DEP, on, Object.assign({ label: 'Musterdepot' }, o || {})); }
  /** Mini-Leiste (Zeilen, Listen): nur Felder, Wort daneben im Text. */
  function mini(on, total, label) {
    var a = []; for (var i = 0; i < total; i++) a.push('<i class="' + (i < on ? 'is-done' : i === on ? 'is-on' : '') + '"></i>');
    return '<span class="st-flow-mini" role="img" aria-label="' + esc(label || ('Schritt ' + (on + 1) + ' von ' + total)) + '">' + a.join('') + '</span>';
  }
  function miniStage(stage) { var i = stepOfStage(stage); return i < 0 ? mini(-1, 3, 'nicht erkannt') : mini(i, 3, ERK[i][0]); }
  function miniState(state) { var i = stepOfState(state); return i < 0 ? '' : mini(i, 4, DEP[i][0]); }
  return { version: 'st-flow-1.0.0', ERK: ERK, DEP: DEP, BROKEN: BROKEN, STAGE: STAGE, STATE: STATE, STATE_WORD: STATE_WORD, HELP: HELP,
    stepOfStage: stepOfStage, stepOfState: stepOfState, wordOfStage: wordOfStage, wordOfState: wordOfState, bar: bar, erk: erk, dep: dep, mini: mini, miniStage: miniStage, miniState: miniState };
});
