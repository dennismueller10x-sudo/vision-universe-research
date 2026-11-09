/* =========================================================================
   VISION UNIVERSE — mein-dashboard/events.js
   „Was sich getan hat“ (Konzept docs/design/mein-bereich-2026-11, HANDOVER Entscheidung 2):
   je Watchlist-Aktie die Ereignisse aus den veröffentlichten Daten der Welten.

   Nur gelesen, nichts gespeichert, kein eigenes Modell. Je Welt dieselbe Datei, die die Welt
   selbst ausliefert und liest:
     Technical    /technical/data/stock/<shardKey>.json (nur Schalen aus meta.stock.shards):
                  ein Tages-Befund (tf 1D), erkannt am letzten oder vorletzten Handelstag
                  (Datum aus dem Satz „erkannt am TT.MM.JJJJ“, so wie die Welt ihn schreibt)
     Quant        /quant/data/product/strategy-index-v1.json.gz: Anlagestil neu erfüllt / nicht mehr
                  erfüllt zwischen den zwei veröffentlichten Ständen (historicalEvidence.transitions)
     Supertrader  /supertrader/data/sf-candidates/summary.json + ticker/<shardKey>.json: eine Methode,
                  deren Regel am Stichtag neu erfüllt ist (changes.added bzw. restaged); Forschung,
                  nicht zertifiziert; ohne die Short-Methode
     Hedgefonds   Watchlist-Übersicht (funds13f): neue Positionen großer Fonds im jüngsten Quartal (13F)
     Discover     /discover/data/membership/US_REAL.json: bester Platz in einer Reihe.
   Hedgefonds und Discover sind Zustände ohne Tagesdatum (Quartal bzw. heutige Reihe): Sie stehen nur als
   Zusatzzeile auf einer Karte, die schon ein Ereignis von heute hat, und zählen nicht als „neue Ereignisse“.
   Eine Aktie ohne Ereignis bekommt keine Karte. Fehlt eine Quelle, fehlen nur ihre Zeilen.

   UMD: Browser globalThis.VUDashboardEvents, Node module.exports (Tests).
   ========================================================================= */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.VUDashboardEvents = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var PATHS = {
    technicalMeta: '/technical/data/meta.json',
    technical: function (k) { return '/technical/data/stock/' + k + '.json'; },
    quant: '/quant/data/product/strategy-index-v1.json.gz',
    stSummary: '/supertrader/data/sf-candidates/summary.json',
    st: function (k) { return '/supertrader/data/sf-candidates/ticker/' + k + '.json'; },
    discover: '/discover/data/membership/US_REAL.json'
  };
  /* Reihenfolge der Zeilen auf einer Karte (wie im Mockup). */
  var WORLDS = ['technical', 'quant', 'supertrader', 'hedgefonds', 'discover'];
  var LABEL = { technical: 'Technical', quant: 'Quant', supertrader: 'Supertrader', hedgefonds: 'Hedgefonds', discover: 'Discover' };
  /* Stufen der quellentreuen Methoden, bei denen die Regel erfüllt ist (supertrader/assets/sf-research.js, VERDICT_OF). */
  var MET = ['CONFIRMED_RESEARCH_SETUP', 'MODELED_TRADE_PLAN'];
  var SHORT_ONLY = ['C10'];
  /* Reihen-Namen wie discover/ui/v3.js (TITLES); Themen- und Branchenreihen zählen nicht (discover/ui/overview.js). */
  var ROW_TITLES = {
    'new-52-week-highs': 'Neue Jahreshochs', 'market-leaders': 'Die stärksten Aktien', 'sp500-staerkste': 'Stärkste im S&P 500',
    'ndx-staerkste': 'Stärkste im Nasdaq-100', 'djia-staerkste': 'Stärkste im Dow Jones', 'momentum-leaders': 'Seit Monaten im Aufwind',
    'breakout-watch': 'Gerade in Bewegung', 'relative-strength': 'Dem Markt voraus', 'trend-quality': 'Stabile Aufwärtstrends',
    'bekannte-namen': 'Bekannte Namen in Bewegung', 'comeback': 'Comeback?', 'ueberraschungen': 'Überraschungen',
    'umsatz-waechst-stark': 'Umsatz wächst stark', 'gewinne-beschleunigen': 'Gewinne beschleunigen', 'margen-werden-staerker': 'Margen werden stärker',
    'cashflow-maschinen': 'Cashflow-Maschinen', 'qualitaet-wachstum': 'Qualität + Wachstum', 'langfristige-compounder': 'Langfristige Compounder',
    'profitables-wachstum': 'Profitables Wachstum', 'fundamentale-turnarounds': 'Fundamentale Turnarounds',
    'qualitaet-zum-preis': 'Qualität zum vernünftigen Preis', 'starke-bilanz-wachstum': 'Starke Bilanz + Wachstum'
  };
  var DOWN = /DOWN|BEAR|TOP|HEAD_AND_SHOULDERS|DESCENDING|RISING_WEDGE/;
  var UP = /UP\b|_UP|BULL|BOTTOM|BREAKOUT|ASCENDING|FALLING_WEDGE|SUPPORT/;

  function isoOf(s) { return /^\d{4}-\d{2}-\d{2}/.test(String(s || '')) ? String(s).slice(0, 10) : null; }
  function dm(iso) { return iso ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' : ''; }
  /** Handelstage (Mo–Fr) zwischen zwei Daten: 0 = derselbe Tag, 1 = Vortag (Freitag vor einem Montag zählt als 1). */
  function weekdaysBetween(fromIso, toIso) {
    var a = new Date(fromIso + 'T12:00:00Z'), b = new Date(toIso + 'T12:00:00Z');
    if (isNaN(a) || isNaN(b) || a > b) return -1;
    var n = 0;
    for (var d = new Date(a); d < b; d.setUTCDate(d.getUTCDate() + 1)) { var w = d.getUTCDay(); if (w !== 0 && w !== 6) n++; }
    return n;
  }
  function quarter(iso) { var m = +String(iso || '').slice(5, 7); return m ? 'Q' + Math.ceil(m / 3) : ''; }

  /* ------------------------------------------------------------ je Welt (rein) */
  /** Technical: Tages-Befunde, erkannt am Stichtag oder am Handelstag davor. rec = stocks[T], labels = Schale.labels */
  function technical(rec, labels, asOf) {
    if (!rec || rec.fresh === false || !Array.isArray(rec.formations)) return [];
    var stand = isoOf(rec.asOf) || isoOf(asOf);
    return rec.formations.filter(function (f) { return f && f.tf === '1D'; }).map(function (f) {
      var m = /erkannt am (\d{2})\.(\d{2})\.(\d{4})/.exec(f.text || ''), seen = m ? m[3] + '-' + m[2] + '-' + m[1] : null;
      if (!seen || !stand) return null;
      var lag = weekdaysBetween(seen, stand);
      if (lag < 0 || lag > 1) return null;
      var name = (labels && labels.formations && labels.formations[f.type]) || null;
      if (!name) return null;
      var dir = DOWN.test(f.type) ? ['weak', 'nach unten'] : UP.test(f.type) ? ['strong', 'nach oben'] : ['mid', 'Muster'];
      return { world: 'technical', text: 'Neuer Befund: ' + name + ' (' + dm(seen) + ')', verdict: dir[0], pill: dir[1], date: seen };
    }).filter(Boolean);
  }
  /** Quant: Anlagestil neu erfüllt oder nicht mehr erfüllt zwischen den zwei veröffentlichten Ständen. */
  function quant(index, ticker) {
    var h = index && index.historicalEvidence;
    if (!h || h.state !== 'AVAILABLE' || !Array.isArray(h.transitions) || !isoOf(h.to)) return [];
    var label = {};
    (index.profiles || []).forEach(function (p) { if (p && p.profileId) label[p.profileId] = p.label || p.profileId; });
    var out = [];
    h.transitions.forEach(function (t) {
      if (!t || !label[t.profileId]) return;
      if ((t.entered || []).indexOf(ticker) >= 0) out.push({ world: 'quant', text: 'Neu im Anlagestil ' + label[t.profileId] + ' (' + dm(isoOf(h.to)) + ')', verdict: 'strong', pill: 'neu erfüllt', date: isoOf(h.to) });
      if ((t.exited || []).indexOf(ticker) >= 0) out.push({ world: 'quant', text: 'Nicht mehr im Anlagestil ' + label[t.profileId] + ' (' + dm(isoOf(h.to)) + ')', verdict: 'weak', pill: 'nicht mehr', date: isoOf(h.to) });
    });
    return out;
  }
  /** Supertrader: Regel einer quellentreuen Methode am Stichtag neu erfüllt (neu aufgenommen oder neu auf diese Stufe). */
  function supertrader(summary, views, ticker, names) {
    if (!summary || !summary.changes || summary.changes.status !== 'COMPARED') return [];
    var asOf = isoOf(summary.asOf), added = {}, restaged = {};
    (summary.changes.added || []).forEach(function (k) { added[k] = true; });
    (summary.changes.restaged || []).forEach(function (r) { if (r && MET.indexOf(r.from) < 0) restaged[r.key] = true; });
    return (views || []).filter(function (v) {
      var key = v && v.candidateId + '|' + v.ticker;
      return v && v.ticker === ticker && isoOf(v.asOf) === asOf && MET.indexOf(v.stage) >= 0 && SHORT_ONLY.indexOf(v.candidateId) < 0 && (added[key] || restaged[key]);
    }).map(function (v) {
      var n = names && names(v.candidateId);
      return { world: 'supertrader', text: (n || v.candidateId) + ': Regel erfüllt laut Methode', verdict: 'strong', pill: 'erkannt', date: asOf, research: true };
    });
  }
  /** Hedgefonds: neue Positionen großer Fonds im jüngsten gemeldeten Quartal (13F, Angabe Dritter). funds = view.funds13f */
  function hedgefonds(funds, latestPeriod) {
    if (!funds || funds.state !== 'AVAILABLE' || !Array.isArray(funds.newPositions) || !funds.newPositions.length) return [];
    if (!isoOf(funds.period) || (latestPeriod && isoOf(funds.period) !== isoOf(latestPeriod))) return [];
    var n = funds.newPositions.length;
    return [{ world: 'hedgefonds', text: 'Neu bei ' + n + ' großen Fonds im ' + quarter(funds.period) + ' (13F' + (typeof funds.holders === 'number' ? ', ' + funds.holders + ' Fonds halten' : '') + ')', verdict: 'strong', pill: 'gekauft', date: isoOf(funds.period), state: true }];
  }
  /** Discover: bester Platz in einer Reihe (Zustand). membership: {rows:[{id,matched}], members:{T:[[idx, rank]]}} */
  function discover(membership, ticker) {
    var list = membership && membership.members && membership.members[ticker];
    if (!Array.isArray(list)) return [];
    var best = null;
    list.forEach(function (m) {
      var row = membership.rows && membership.rows[m[0]];
      if (!row || !ROW_TITLES[row.id] || typeof m[1] !== 'number') return;
      if (!best || m[1] < best.rank) best = { rank: m[1], title: ROW_TITLES[row.id] };
    });
    return best ? [{ world: 'discover', text: 'Platz ' + best.rank + ' in ' + best.title, verdict: 'mid', pill: 'Reihe', state: true }] : [];
  }

  /**
   * compose(stocks, data) -> {cards, events, stocks}
   * stocks: [{ticker, name, priceText, changePct, href, funds13f}] (Reihenfolge der Watchlist)
   * data:   {technical: {T: {rec, labels}}, technicalAsOf, quant, stSummary, stViews: {T: views}, stNames(cid), membership, fundsPeriod}
   * Eine Karte nur, wenn die Aktie mindestens ein Ereignis mit Datum hat; Discover ergänzt nur.
   */
  function compose(stocks, data) {
    var d = data || {}, cards = [];
    (stocks || []).forEach(function (s) {
      var t = s && s.ticker;
      if (!t) return;
      var tech = d.technical && d.technical[t];
      var rows = [].concat(
        technical(tech && tech.rec, tech && tech.labels, d.technicalAsOf),
        quant(d.quant, t),
        supertrader(d.stSummary, d.stViews && d.stViews[t], t, d.stNames));
      if (!rows.length) return;
      rows = rows.concat(hedgefonds(s.funds13f, d.fundsPeriod), discover(d.membership, t));
      rows.sort(function (a, b) { return WORLDS.indexOf(a.world) - WORLDS.indexOf(b.world); });
      rows.forEach(function (r) { r.label = LABEL[r.world]; });
      cards.push({ ticker: t, name: s.name || t, priceText: s.priceText || '', changePct: s.changePct, href: s.href || null, rows: rows });
    });
    var events = cards.reduce(function (n, c) { return n + c.rows.filter(function (r) { return !r.state; }).length; }, 0);
    return { cards: cards, events: events, stocks: cards.length, research: cards.some(function (c) { return c.rows.some(function (r) { return r.research; }); }) };
  }

  /**
   * load(fetchJson, fetchGz, Id, stocks) -> Promise<data> für compose(). Lädt nur die Schalen der Watchlist-Aktien;
   * jede Quelle einzeln, ein Fehler lässt nur ihre Zeilen weg.
   */
  function load(fetchJson, fetchGz, Id, stocks, opts) {
    var o = opts || {}, tickers = (stocks || []).map(function (s) { return s && s.ticker; }).filter(Boolean);
    function key(t) { try { return Id.shardKey(t); } catch (e) { return null; } }
    function safe(p) { return p.then(function (x) { return x; }, function () { return null; }); }
    var uniq = function (a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); };
    var data = { technical: {}, stViews: {}, stNames: o.names || null, fundsPeriod: o.fundsPeriod || null };
    if (!tickers.length) return Promise.resolve(data);
    var tech = safe(fetchJson(PATHS.technicalMeta)).then(function (meta) {
      var st = meta && meta.stock;
      if (!st || st.schema !== 'vu-technical-stock-1.0.0') return;
      data.technicalAsOf = meta.asOf;
      var keys = uniq(tickers.map(key)).filter(function (k) { return (st.shards || []).indexOf(k) >= 0; });
      return Promise.all(keys.map(function (k) { return safe(fetchJson(PATHS.technical(k))); })).then(function (parts) {
        parts.forEach(function (p) {
          if (!p || !p.stocks) return;
          tickers.forEach(function (t) { if (p.stocks[t]) data.technical[t] = { rec: p.stocks[t], labels: p.labels }; });
        });
      });
    });
    var q = fetchGz ? safe(fetchGz(PATHS.quant)).then(function (x) { data.quant = x; }) : Promise.resolve();
    var st = safe(fetchJson(PATHS.stSummary)).then(function (sum) {
      if (!sum) return;
      data.stSummary = sum;
      var keys = uniq(tickers.map(key)).filter(function (k) { return (sum.tickerShards || []).indexOf(k) >= 0; });
      return Promise.all(keys.map(function (k) { return safe(fetchJson(PATHS.st(k))); })).then(function (parts) {
        parts.forEach(function (p) { (p && p.views || []).forEach(function (v) { if (tickers.indexOf(v.ticker) >= 0) (data.stViews[v.ticker] = data.stViews[v.ticker] || []).push(v); }); });
      });
    });
    return Promise.all([tech, q, st]).then(function () {
      // Discover nur, wenn es überhaupt eine Karte gibt (die Reihen-Datei ist die größte Quelle).
      if (!compose(stocks, data).cards.length) return data;
      return safe(fetchJson(PATHS.discover)).then(function (m) { data.membership = m; return data; });
    });
  }

  return Object.freeze({ PATHS: PATHS, WORLDS: WORLDS, ROW_TITLES: ROW_TITLES, weekdaysBetween: weekdaysBetween,
    technical: technical, quant: quant, supertrader: supertrader, hedgefonds: hedgefonds, discover: discover, compose: compose, load: load });
});
