/* =========================================================================
   VISION UNIVERSE SCREENER — vocab.js (UMD, ohne Abhaengigkeiten)

   Ein Wort, eine Regel (Konzept „Verstehen. Finden.“, Entscheidung 5):
   Die Satz-Bausteine („Zeig mir Aktien, die …“) und die fertigen Ideen stehen
   an genau einer Stelle. Gleiche Woerter bedeuten ueberall dieselbe Regel –
   „gut verdienen“ ist im Satz und in jeder Idee Nettomarge ueber 15 %;
   eine Nettomarge ueber 0 % heisst „Profitabel“.
   screener/tests/vocab.test.mjs haelt das fest.
   ========================================================================= */
(function (global) {
  'use strict';

  /* Eigenschaften in Alltagssprache (Satz-Bauer). Jede ist genau ein Filter. */
  var PROPS = [
    { id: 'growth', word: 'stark wachsen', sub: 'Umsatz +20 % in 12 Monaten', f: { field: 'revenueGrowth', op: 'gt', value: 0.2 } },
    { id: 'profit', word: 'gut verdienen', sub: 'Nettomarge über 15 %', f: { field: 'netMargin', op: 'gt', value: 0.15 } },
    { id: 'cheap', word: 'günstig sind', sub: 'KGV unter 20', f: { field: 'pe', op: 'lt', value: 20 } },
    { id: 'trend', word: 'im Aufwärtstrend sind', sub: 'Kurs über der 200-Tage-Linie', f: { field: 'priceVsSma200', op: 'gt', value: 0 } },
    { id: 'cash', word: 'mehr Geld als Schulden haben', sub: 'Netto-Cash über 0', f: { field: 'netCash', op: 'gt', value: 0 } },
    { id: 'calm', word: 'ruhig schwanken', sub: 'Schwankung unter 25 % im Jahr', f: { field: 'volatility', op: 'lt', value: 0.25 } }
  ];

  /* Fertige Ideen: echte Trefferzahl live aus der Engine, nie hart kodiert. */
  /* Die drei Checklisten (screener/engine/checklists.js, Konzept PR 5) stehen vorn: jede ist eine Screener-Vorlage
     mit allen Punkten (UND). */
  var CK = typeof module !== 'undefined' && module.exports && typeof require === 'function' ? require('./checklists.js') : global.VUChecklists;
  var CHECK_IDEAS = CK ? CK.CHECKLISTS.map(function (c) { return { id: 'checkliste-' + c.id, title: 'Checkliste ' + c.name, sub: c.items.length + ' Punkte, alle erfüllt', checklist: c.id, glyph: 'check', fs: CK.filters(c) }; }) : [];
  var IDEAS = CHECK_IDEAS.concat([
    { id: 'fairer-preis', title: 'Wachstum zum fairen Preis', sub: 'PEG ≤ 1,5, Umsatz 3 J ≥ 10 % p. a., Gewinn', world: 'fundamental', fs: [{ field: 'peg', op: 'lte', value: 1.5 }, { field: 'revenueCagr3', op: 'gte', value: 0.1 }, { field: 'netMargin', op: 'gt', value: 0 }] },
    { id: 'niedrige-bewertung', title: 'Niedrige Bewertung', sub: 'KGV unter 15, Gewinn', world: 'fundamental', fs: [{ field: 'pe', op: 'lt', value: 15 }, { field: 'netMargin', op: 'gt', value: 0 }] },
    { id: 'wachsen-stark', title: 'Wachsen stark', sub: 'Umsatz +20 % in 12 Monaten', world: 'fundamental', fs: [{ field: 'revenueGrowth', op: 'gt', value: 0.2 }] },
    { id: 'profitabel', title: 'Profitabel', sub: 'Nettomarge über 0 %', world: 'fundamental', fs: [{ field: 'netMargin', op: 'gt', value: 0 }] },
    { id: 'aufwaertstrend', title: 'Im Aufwärtstrend', sub: 'Kurs über der 200-Tage-Linie', world: 'technical', fs: [{ field: 'priceVsSma200', op: 'gt', value: 0 }] }
  ]);

  /* Woerterbuch: Begriff -> genau eine Regel. Jeder Titel/Satz, der den Begriff traegt, muss diese Regel enthalten. */
  var TERMS = [
    { re: /\b(stark wachsen|wachsen stark)\b/i, f: { field: 'revenueGrowth', op: 'gt', value: 0.2 } },
    { re: /\b(gut verdienen|verdienen gut)\b/i, f: { field: 'netMargin', op: 'gt', value: 0.15 } },
    { re: /\bprofitabel/i, f: { field: 'netMargin', op: 'gt', value: 0 } },
    { re: /aufwärtstrend/i, f: { field: 'priceVsSma200', op: 'gt', value: 0 } },
    { re: /mehr Geld als Schulden/i, f: { field: 'netCash', op: 'gt', value: 0 } },
    { re: /günstig/i, f: { field: 'pe', op: 'lt', value: 20 } }
  ];

  function sameFilter(f, g) { return f.field === g.field && f.op === g.op && Number(f.value) === Number(g.value); }
  function propOf(f) { return PROPS.filter(function (p) { return sameFilter(f, p.f); })[0] || null; }

  var api = { PROPS: PROPS, IDEAS: IDEAS, TERMS: TERMS, sameFilter: sameFilter, propOf: propOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.VUScreenerVocab = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
