/* Fundamental 1.0 – Modell (UMD, ohne Abhaengigkeiten).
 * Liest NUR den bestehenden Block `fundamentals` der Discover-Aktiendatei (discover/data/stocks/US_REAL/<T>.json,
 * Erzeuger scripts/discover/build-discover-data.mjs aus den SEC-Companyfacts). Keine neue Datenquelle, kein Score,
 * kein Urteil: Werte, Veraenderung zum Vorjahr, Luecken und Herkunft je Geschaeftsjahr. Bewertungskennzahlen (KGV, KUV,
 * FCF-Rendite) und ihr Abstand zum Marktmedian stammen unveraendert aus dem Block `valuation` desselben Erzeugers.
 * Richtung (auf/ab/gleich) ist neutral gemeint; ob mehr Schulden oder weniger Aktien "gut" ist, entscheidet hier niemand. */
(function (global) {
  'use strict';
  var VERSION = 'fundamental-model-1.3.0';
  var STOCK_BASE = '/discover/data/stocks/US_REAL/';
  var SEARCH_PATH = '/discover/data/search/US_REAL.json';

  /* Kacheln in fester Reihenfolge. track: Schluessel in journey.tracks, latest: Schluessel in latest.annual/ttm. */
  var METRICS = [
    { id: 'revenue', label: 'Umsatz', track: 'revenue', latest: 'revenue', unit: 'USD' },
    { id: 'net_income', label: 'Nettogewinn', track: 'net_income', latest: 'net_income', unit: 'USD' },
    { id: 'free_cash_flow', label: 'Free Cashflow', track: 'free_cash_flow', latest: 'free_cash_flow', unit: 'USD' },
    { id: 'operating_cash_flow', label: 'Operativer Cashflow', track: 'operating_cash_flow', latest: 'operating_cash_flow', unit: 'USD' },
    { id: 'eps_diluted', label: 'Gewinn je Aktie', track: 'eps_diluted', latest: 'eps_diluted', unit: 'USD/shares' },
    { id: 'cash', label: 'Liquide Mittel', track: 'cash', latest: 'cash_and_equivalents', unit: 'USD' },
    { id: 'debt', label: 'Langfristige Schulden', track: 'debt', latest: 'long_term_debt', unit: 'USD' },
    { id: 'shares', label: 'Aktienanzahl (verwässert)', track: 'shares', latest: 'diluted_weighted_average_shares', unit: 'shares' }
  ];
  var MARGINS = [
    { id: 'gross', label: 'Bruttomarge' }, { id: 'operating', label: 'Operative Marge' }, { id: 'net', label: 'Nettomarge' }
  ];
  var KPIS = ['revenue', 'net_income', 'free_cash_flow'];

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function normTicker(t) { return String(t == null ? '' : t).trim().toUpperCase(); }
  function validTicker(t) { return /^[A-Z0-9][A-Z0-9.-]{0,11}$/.test(t); }
  function stockPath(t) { return STOCK_BASE + encodeURIComponent(normTicker(t)) + '.json'; }

  function tracksOf(journey) {
    var t = journey && journey.tracks;
    if (!t) return {};
    if (Array.isArray(t)) { var o = {}; t.forEach(function (p) { if (Array.isArray(p)) o[p[0]] = p[1]; }); return o; }
    return t;
  }

  /* Veraenderung zwischen zwei Werten. Bei Vorzeichenwechsel oder Vorwert 0 gibt es keine sinnvolle Prozentzahl. */
  function change(prev, last) {
    if (!isNum(prev) || !isNum(last)) return null;
    var dir = last > prev ? 'up' : last < prev ? 'down' : 'flat';
    var pct = prev !== 0 && (prev > 0) === (last > 0) ? (last - prev) / Math.abs(prev) : null;
    return { dir: dir, pct: pct, abs: last - prev, signFlip: prev !== 0 && last !== 0 && (prev > 0) !== (last > 0) };
  }

  /* Punkte je Geschaeftsjahr ueber die ganze Spanne `years`; fehlende Jahre werden als Luecke (v:null) gefuehrt. */
  function series(points, years) {
    var byFy = {};
    (points || []).forEach(function (p) { if (p && isNum(p.fy) && isNum(p.v)) byFy[p.fy] = p; });
    return (years || []).map(function (fy) {
      var p = byFy[fy];
      return p ? { fy: fy, v: p.v, end: p.end || null, filed: p.filed || null, accn: p.accn || null } : { fy: fy, v: null, gap: true };
    });
  }
  function lastTwo(rows) {
    var have = rows.filter(function (r) { return isNum(r.v); });
    return { last: have[have.length - 1] || null, prev: have[have.length - 2] || null, count: have.length };
  }

  /* ---------------------------------------------- Wachstum, Profitabilitaet, Bilanz, Bewertung
   * Alles aus Werten, die die Datei bereits traegt; nichts wird geschaetzt. Fehlt eine Voraussetzung, steht ein Grund da. */
  var GROWTH = ['revenue', 'net_income', 'free_cash_flow', 'eps_diluted'];
  var HORIZONS = [3, 5, 10];

  /* Jaehrliche Rate ueber genau n Geschaeftsjahre bis zum letzten Jahr mit Wert. Nur bei positivem Anfangs- und Endwert. */
  function cagr(rows, n) {
    var have = rows.filter(function (r) { return isNum(r.v); }), end = have[have.length - 1];
    var out = { years: n, rate: null, from: null, to: end ? end.fy : null, reason: null };
    if (!end) { out.reason = 'NO_DATA'; return out; }
    var start = have.filter(function (r) { return r.fy === end.fy - n; })[0];
    if (!start) { out.reason = 'TOO_SHORT'; return out; }
    out.from = start.fy; out.fromV = start.v; out.toV = end.v;
    if (!(start.v > 0) || !(end.v > 0)) { out.reason = 'NOT_POSITIVE'; return out; }
    out.rate = Math.pow(end.v / start.v, 1 / n) - 1;
    out.multiple = end.v / start.v;
    return out;
  }
  /* Veraenderung je Jahr nur zwischen direkt aufeinanderfolgenden Geschaeftsjahren; eine Luecke unterbricht die Reihe. */
  function yoy(rows) {
    return rows.slice(1).map(function (r, i) {
      var p = rows[i];
      if (!isNum(r.v) || !isNum(p.v)) return { fy: r.fy, gap: true };
      var c = change(p.v, r.v);
      return { fy: r.fy, pct: c.pct, dir: c.dir, signFlip: c.signFlip };
    });
  }
  /* Vom Umsatz zum Free Cashflow im letzten Geschaeftsjahr: Anteil je Stufe am Umsatz. */
  var LADDER = [['revenue', 'Umsatz'], ['gross_profit', 'Bruttogewinn'], ['operating_income', 'Operatives Ergebnis'], ['net_income', 'Nettogewinn'], ['free_cash_flow', 'Free Cashflow']];
  function ladder(annual) {
    var rev = annual.revenue;
    if (!rev || !(rev.v > 0)) return null;
    var steps = LADDER.map(function (s) { var a = annual[s[0]]; return a && isNum(a.v) ? { id: s[0], label: s[1], v: a.v, share: a.v / rev.v } : null; }).filter(Boolean);
    return steps.length > 1 ? { end: rev.end || null, steps: steps } : null;
  }
  function pick(a) { return a && isNum(a.v) ? a.v : null; }
  function balance(annual, derived) {
    var cash = pick(annual.cash_and_equivalents), debt = pick(annual.total_debt), lt = pick(annual.long_term_debt);
    var equity = pick(annual.stockholders_equity), assets = pick(annual.total_assets);
    var debtV = debt != null ? debt : lt, net = pick(annual.net_debt);
    if (net == null && cash != null && debtV != null) net = debtV - cash;
    if (cash == null && debtV == null && equity == null && assets == null) return null;
    var endOf = function (k) { return annual[k] && annual[k].end; };
    return {
      end: endOf('total_assets') || endOf('cash_and_equivalents') || endOf('stockholders_equity') || null,
      cash: cash, debt: debtV, debtKind: debt != null ? 'total' : lt != null ? 'long_term' : null, net: net,
      equity: equity, assets: assets, equityRatio: equity != null && assets > 0 ? equity / assets : null,
      roe: isNum(derived.roe) ? derived.roe : null
    };
  }
  var VAL_REASON = { SOURCE_MISSING: 'nicht berechenbar', NON_USD_REPORTING: 'Meldung nicht in US-Dollar', FOREIGN_FILER: 'ausländischer Emittent',
    IMPLAUSIBLE_SHARE_BASIS: 'Aktienanzahl nicht plausibel', NO_CURRENT_SHARE_COUNT: 'keine aktuelle Aktienanzahl', LOSS: 'Verlust in den letzten 12 Monaten' };
  function valuation(v, ttm) {
    if (!v || !v.available) return null;
    var ctx = v.context || {}, rel = v.relative || {};
    var loss = ttm.net_income && isNum(ttm.net_income.v) && ttm.net_income.v < 0;
    var pe = v.pe && isNum(v.pe.value) ? v.pe : null, ps = v.ps && isNum(v.ps.value) ? v.ps : null, fy = v.fcfYield && isNum(v.fcfYield.value) ? v.fcfYield : null;
    if (!pe && !ps && !fy) return null;
    return {
      price: isNum(v.price) ? v.price : null, basis: v.basis || null,
      marketCap: v.marketCap && isNum(v.marketCap.value) ? v.marketCap.value : null,
      pe: pe ? { value: pe.value, basis: pe.basis || null, ratio: isNum(rel.peVsMedian) ? rel.peVsMedian : (ctx.peMedian > 0 ? pe.value / ctx.peMedian : null) } : null,
      peReason: pe ? null : (loss ? 'LOSS' : v.peReason || 'SOURCE_MISSING'),
      ps: ps ? { value: ps.value, ratio: ctx.psMedian > 0 ? ps.value / ctx.psMedian : null } : null,
      fcfYield: fy ? fy.value : null,
      peMedian: isNum(ctx.peMedian) ? ctx.peMedian : null, psMedian: isNum(ctx.psMedian) ? ctx.psMedian : null,
      peCount: ctx.peCount || null, label: rel.label || null, stufe: rel.stufe || null
    };
  }
  function reasonText(code) { return VAL_REASON[code] || 'nicht berechenbar'; }
  function multiple(v) { return isNum(v) ? num(v, v >= 100 ? 0 : 1) : '–'; }

  /* ---------------------------------------------- Im Vergleich
   * Vergleichsgruppen nur aus bestehenden Discover-Auswahlen, mit sichtbarer Regel:
   *  1. gleicher kuratierter Sektor (discoverNext.similar, nur Titel mit demselben Sektor),
   *  2. gleiches redaktionelles Thema (Discover-Zeile thema-<id>, Reihenfolge der Zeile = Discover-Rang).
   * Die Discover-Liste "similar" ohne kuratierten Sektor misst nur Abstand in Kennzahlen und Kursverhalten
   * und waere kein Branchenvergleich; sie wird dann nicht verwendet. */
  var ROWS_BASE = '/discover/data/rows/US_REAL/';
  var PEERS = 4;
  function titleCase(s) {
    return String(s || '').toLowerCase().replace(/(^|[\s,&\-\/(])([a-zäöüß])/g, function (m, a, b) { return a + b.toUpperCase(); });
  }
  function peerOptions(stock) {
    var out = [], self = stock ? normTicker(stock.symbol) : null;
    var sim = stock && stock.discoverNext && stock.discoverNext.similar;
    if (stock && stock.sector && sim && sim.cards) {
      var same = sim.cards.filter(function (c) { return c && c.symbol && normTicker(c.symbol) !== self && c.sector === stock.sector; })
        .slice(0, PEERS).map(function (c) { return { ticker: normTicker(c.symbol), name: c.companyName || c.symbol, was: c.was || null }; });
      if (same.length) out.push({ id: 'sector', kind: 'sector', label: 'Sektor ' + stock.sector, rule: 'gleicher Sektor · nächste nach Wachstum, Marge, Bewertung und Kursverhalten', peers: same });
    }
    (stock && stock.themes || []).forEach(function (t) {
      if (t && /^thema-[a-z0-9-]+$/.test(t.rowId || '')) out.push({ id: t.rowId, kind: 'theme', label: titleCase(t.title), rule: 'gleiches Discover-Thema · ähnlichste Umsatzgröße', row: ROWS_BASE + t.rowId + '.json' });
    });
    return out;
  }
  /* Aus der Themenzeile die Titel mit der aehnlichsten Umsatzgroesse (Abstand im Verhaeltnis, f_revenue der Zeile);
   * ohne eigenen Umsatz in der Reihenfolge der Zeile. */
  function peersFromRow(row, self, n, revenue) {
    var list = ((row && row.cards) || []).filter(function (c) { return c && c.symbol && normTicker(c.symbol) !== normTicker(self) && c.dataMode !== 'synthetic'; });
    if (revenue > 0) {
      list = list.filter(function (c) { return c.metrics && c.metrics.f_revenue > 0; })
        .map(function (c, i) { return { c: c, d: Math.abs(Math.log(c.metrics.f_revenue / revenue)), i: i }; })
        .sort(function (a, b) { return a.d - b.d || a.i - b.i; }).map(function (x) { return x.c; });
    }
    return list.slice(0, n || PEERS).map(function (c) { return { ticker: normTicker(c.symbol), name: c.companyName || c.symbol, was: c.was || null }; });
  }
  /* Eine Zeile je Unternehmen, fuer alle mit denselben Definitionen wie auf der eigenen Seite. */
  function compareRow(f) {
    if (!f || !f.available) return { ticker: f && f.ticker, name: f && f.name, available: false };
    var by = function (id) { return f.metrics.filter(function (m) { return m.id === id; })[0]; };
    // Eine Marge ueber 100 % des Umsatzes (z. B. Banken mit abweichender Umsatzzeile) ist nicht vergleichbar: kein Wert.
    var plaus = function (v) { return isNum(v) && Math.abs(v) <= 1 ? v : null; };
    var mg = function (id) { var m = f.margins.filter(function (x) { return x.id === id; })[0]; return m && m.last ? plaus(m.last.v) : null; };
    var rev = by('revenue'), g3 = cagr(rev.rows, 3), y = yoy(rev.rows).filter(function (r) { return !r.gap; }).slice(-1)[0];
    var last = rev.last, fcfStep = f.ladder && f.ladder.steps.filter(function (s) { return s.id === 'free_cash_flow'; })[0];
    var v = f.valuation;
    return {
      ticker: f.ticker, name: f.name, available: true, fy: last ? last.fy : f.latestFiscalYear, stale: !!(f.stale && f.stale.stale),
      revenue: last ? last.v : null,
      growth3: g3.rate, growth3Reason: g3.rate == null ? g3.reason : null,
      growth1: y && y.pct != null && y.fy === (last && last.fy) ? y.pct : null,
      opMargin: mg('operating'), netMargin: mg('net'), fcfMargin: fcfStep ? plaus(fcfStep.share) : null,
      pe: v && v.pe ? v.pe.value : null, peBasis: v && v.pe ? v.pe.basis : null, peReason: v ? v.peReason : 'NO_VALUATION',
      ps: v && v.ps ? v.ps.value : null, fcfYield: v && v.fcfYield != null ? v.fcfYield : null
    };
  }
  /* Werte einer Kennzahl ueber die Gruppe: Skala ab Null, Rang (hoechster Wert = 1), Median der vorhandenen Werte. */
  function compareScale(rows, key, cap) {
    var vals = rows.map(function (r) { return r[key]; }).filter(isNum).sort(function (a, b) { return a - b; });
    if (!vals.length) return null;
    var mid = vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2;
    var max = Math.max(0, vals[vals.length - 1]), min = Math.min(0, vals[0]);
    if (cap && mid > 0 && max > cap * mid) max = cap * mid;
    return { min: min, max: max, median: mid, count: vals.length, rank: function (v) { return isNum(v) ? vals.filter(function (x) { return x > v; }).length + 1 : null; } };
  }

  /* ---------------------------------------------- Startseite: Entdecken
   * Bestehende Discover-Zeilen, deren Regel nur auf SEC-Kennzahlen beruht. Die Kachelwerte (f_*) sind dieselben,
   * die das Modell auf der Unternehmensseite berechnet (Test haelt das fest). */
  var HOME_ROWS = ['profitables-wachstum', 'langfristige-compounder', 'cashflow-maschinen', 'qualitaet-zum-preis', 'starke-bilanz-wachstum', 'margen-werden-staerker'];
  function homeTile(card) {
    var m = (card && card.metrics) || {}, n = function (v) { return isNum(v) ? v : null; };
    // Wie im Vergleich: eine Marge ueber 100 % des Umsatzes gilt als nicht plausibel und wird nicht als Wert gezeigt.
    var odd = function (v) { return isNum(v) && Math.abs(v) > 1; }, mg = function (v) { return odd(v) ? null : n(v); };
    return { ticker: normTicker(card.symbol), name: card.companyName || card.symbol, was: card.was || null,
      revenue: n(m.f_revenue), growth3: n(m.f_revenueGrowth3y), netMargin: mg(m.f_netMargin), fcfMargin: mg(m.f_fcfMargin), pe: n(m.f_pe),
      implausible: { netMargin: odd(m.f_netMargin), fcfMargin: odd(m.f_fcfMargin) } };
  }
  function homeRow(row) {
    if (!row || !Array.isArray(row.cards)) return null;
    return { id: row.rowId, title: titleCase(row.title), subtitle: row.subtitle || null, rule: row.rule || null, asOf: row.asOf || null,
      matched: row.coverage && row.coverage.matched, tiles: row.cards.filter(function (c) { return c && c.symbol && c.dataMode !== 'synthetic'; }).map(homeTile) };
  }

  function fromStock(stock) {
    var f = stock && stock.fundamentals;
    var base = { version: VERSION, ticker: stock ? normTicker(stock.symbol) : null, name: stock ? (stock.companyName || stock.legalName || stock.symbol) : null };
    if (!f || f.available === false) return Object.assign(base, { available: false, reason: f && f.reason ? f.reason : 'NO_FUNDAMENTALS' });
    var journey = f.journey || {}, tracks = tracksOf(journey);
    var years = (journey.years && journey.years.length ? journey.years : f.fiscalYears) || [];
    years = years.filter(isNum).sort(function (a, b) { return a - b; });
    var latest = f.latest || {}, annual = latest.annual || {}, ttm = latest.ttm || {};
    var caveats = journey.caveats || {};
    var metrics = METRICS.map(function (m) {
      var rows = series(tracks[m.track], years), lt = lastTwo(rows);
      var t = ttm[m.latest];
      return {
        id: m.id, label: m.label, unit: m.unit, rows: rows,
        available: lt.count > 0,
        gaps: rows.filter(function (r) { return r.gap; }).map(function (r) { return r.fy; }),
        last: lt.last, prev: lt.prev, change: lt.last && lt.prev ? change(lt.prev.v, lt.last.v) : null,
        ttm: t && isNum(t.v) ? { v: t.v, end: t.end || null, through: t.through || null, derived: !!t.derived } : null,
        caveat: caveats[m.track] || null
      };
    });
    var mtr = tracks.margins || {};
    var margins = MARGINS.map(function (m) {
      var rows = series(mtr[m.id], years), lt = lastTwo(rows);
      return { id: m.id, label: m.label, unit: 'ratio', rows: rows, available: lt.count > 0, last: lt.last, prev: lt.prev,
        change: lt.last && lt.prev ? change(lt.prev.v, lt.last.v) : null, gaps: rows.filter(function (r) { return r.gap; }).map(function (r) { return r.fy; }) };
    });
    // Herkunft je Geschaeftsjahr: eine Meldung (accn) kann mehrere Jahre tragen (spaetere 10-K mit Vorjahreswerten).
    var sources = years.map(function (fy) {
      var seen = {}, list = [];
      metrics.concat(margins).forEach(function (m) { m.rows.forEach(function (r) { if (r.fy === fy && r.accn && !seen[r.accn]) { seen[r.accn] = 1; list.push({ accn: r.accn, filed: r.filed, end: r.end }); } }); });
      var values = metrics.filter(function (m) { return m.rows.some(function (r) { return r.fy === fy && isNum(r.v); }); }).length;
      return { fy: fy, filings: list, values: values, of: metrics.length };
    });
    var stale = latest.staleness || null;
    var byId = {}; metrics.forEach(function (m) { byId[m.id] = m; });
    return Object.assign(base, {
      available: true, cik: f.cik || null, asOf: f.asOf || null, source: f.source || null,
      years: years, latestFiscalYear: f.latestFiscalYear || (years.length ? years[years.length - 1] : null),
      ttmThrough: f.ttmThrough || null, stale: stale, derived: latest.derived || null,
      metrics: metrics, margins: margins, sources: sources,
      // Mit Hinweis (Split ohne rueckwirkende Bereinigung, z. B. Gewinn je Aktie) waere jede Rate ueber den Sprung falsch: keine Rate.
      growth: GROWTH.map(function (id) {
        var m = byId[id];
        return { id: id, label: m.label, unit: m.unit, caveat: m.caveat, horizons: HORIZONS.map(function (n) {
          var g = cagr(m.rows, n);
          if (m.caveat && g.rate != null) { g.rate = null; g.multiple = null; g.reason = 'NOT_COMPARABLE'; }
          return g;
        }) };
      }).filter(function (g) { return g.horizons.some(function (h) { return h.rate != null || h.reason === 'NOT_COMPARABLE'; }); }),
      yoy: yoy(byId.revenue.rows),
      ladder: ladder(annual),
      balance: balance(annual, latest.derived || {}),
      valuation: valuation(f.valuation, ttm),
      kpis: KPIS.map(function (id) { return metrics.filter(function (m) { return m.id === id; })[0]; }).filter(function (m) { return m && m.available; }),
      caveats: Object.keys(caveats).map(function (k) { return { track: k, text: caveats[k] }; })
    });
  }

  /* --------------------------------------------------------------- Formatierung (de-DE) */
  function num(v, d) { return v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function money(v) {
    if (!isNum(v)) return '–';
    var a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 1e12) return s + num(a / 1e12, 2) + ' Bio. $';
    if (a >= 1e9) return s + num(a / 1e9, a >= 1e11 ? 0 : a >= 1e10 ? 1 : 2) + ' Mrd. $';
    if (a >= 1e6) return s + num(a / 1e6, a >= 1e8 ? 0 : 1) + ' Mio. $';
    return s + num(a, 0) + ' $';
  }
  function count(v) {
    if (!isNum(v)) return '–';
    if (Math.abs(v) >= 1e9) return num(v / 1e9, 2) + ' Mrd.';
    if (Math.abs(v) >= 1e6) return num(v / 1e6, 1) + ' Mio.';
    return num(v, 0);
  }
  function pct(v, d) { return isNum(v) ? (v < 0 ? '−' : '') + num(Math.abs(v) * 100, d == null ? 1 : d) + ' %' : '–'; }
  function value(m, v) {
    if (m.unit === 'ratio') return pct(v);
    if (m.unit === 'shares') return count(v);
    if (m.unit === 'USD/shares') return isNum(v) ? (v < 0 ? '−' : '') + num(Math.abs(v), 2) + ' $' : '–';
    return money(v);
  }
  function changeText(m, c) {
    if (!c) return null;
    var sym = c.dir === 'up' ? '▲' : c.dir === 'down' ? '▼' : '■';
    if (m.unit === 'ratio') return sym + ' ' + (c.abs >= 0 ? '+' : '−') + num(Math.abs(c.abs) * 100, 1) + ' Pp.';
    if (c.dir === 'flat') return sym + ' unverändert';
    if (c.signFlip) return sym + ' Vorzeichenwechsel';
    return sym + ' ' + (c.pct == null ? (c.dir === 'flat' ? 'unverändert' : '–') : (c.pct >= 0 ? '+' : '−') + num(Math.abs(c.pct) * 100, 1) + ' %');
  }
  function dateDe(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? m[3] + '.' + m[2] + '.' + m[1] : '–';
  }
  /* Jahreslisten als Bereiche: [2015,2016,2017,2020] -> "2015–2017, 2020". */
  function yearRanges(years) {
    var ys = (years || []).filter(isNum).slice().sort(function (a, b) { return a - b; }), out = [], i = 0;
    while (i < ys.length) { var j = i; while (j + 1 < ys.length && ys[j + 1] === ys[j] + 1) j++; out.push(j > i ? ys[i] + '–' + ys[j] : String(ys[i])); i = j + 1; }
    return out.join(', ');
  }
  /* Ordner der Meldung im EDGAR-Archiv (CIK ohne fuehrende Nullen, Accession ohne Bindestriche). */
  function secFilingUrl(cik, accn) {
    if (!/^\d{1,10}$/.test(String(cik || '')) || !/^\d{10}-\d{2}-\d{6}$/.test(String(accn || ''))) return null;
    return 'https://www.sec.gov/Archives/edgar/data/' + String(Number(cik)) + '/' + accn.replace(/-/g, '') + '/';
  }

  /* Suche in der Discover-Suchliste (entries: {s:Symbol, n:Name}). Exakter Ticker zuerst, dann Anfang, dann enthalten. */
  function search(entries, q, limit) {
    var t = String(q || '').trim().toLowerCase();
    if (!t) return [];
    var out = [];
    (entries || []).forEach(function (e) {
      if (!e || !e.s) return;
      var s = e.s.toLowerCase(), n = String(e.n || '').toLowerCase(), r = -1;
      if (s === t) r = 0; else if (s.indexOf(t) === 0) r = 1; else if (n.indexOf(t) === 0) r = 2; else if (n.indexOf(t) >= 0) r = 3;
      if (r >= 0) out.push({ r: r, s: e.s, n: e.n || e.s });
    });
    out.sort(function (a, b) { return a.r - b.r || a.s.length - b.s.length || (a.s < b.s ? -1 : 1); });
    return out.slice(0, limit || 8).map(function (x) { return { ticker: x.s, name: x.n }; });
  }

  function parseRoute(hash) {
    var h = String(hash || '').replace(/^#\/?/, '');
    var t = normTicker(decodeURIComponent(h.split('?')[0].split('/')[0] || ''));
    if (!t) return { view: 'home' };
    if (t === 'METHODIK') return { view: 'method' };
    // Ziele des Produkt-Docks: Ansichten der Startseite (Abschnitt "Entdecken", Suche mit Fokus)
    if (t === 'ENTDECKEN') return { view: 'home', focus: 'entdecken' };
    if (t === 'SUCHE') return { view: 'home', focus: 'suche' };
    // Fundamental 2.0: Ranglisten und Branchen der Startseite (zweiteilig, damit core/stock-context.js sie nicht als Aktie liest)
    var parts = h.split('?')[0].split('/').map(function (x) { try { return decodeURIComponent(x); } catch (e) { return ''; } });
    if (t === 'RANGLISTE') return /^[a-z]{3,20}$/.test(parts[1] || '') ? { view: 'ranking', id: parts[1] } : { view: 'home', focus: 'entdecken' };
    if (t === 'BRANCHE') return /^\d{2}$/.test(parts[1] || '') ? { view: 'industry', id: parts[1] } : { view: 'home', focus: 'entdecken' };
    if (!validTicker(t)) return { view: 'home', invalid: true };
    // Unteransichten der Aktie nur im Query-Teil: #/<T>?ansicht=kennzahlen|kennzahl|vergleich|finanzen|mehr|<bereich>&k=<id>
    var out = { view: 'company', ticker: t }, q = h.indexOf('?') >= 0 ? h.slice(h.indexOf('?') + 1) : '';
    q.split('&').forEach(function (kv) {
      var i = kv.indexOf('='), k = i >= 0 ? kv.slice(0, i) : kv, v = i >= 0 ? kv.slice(i + 1) : '';
      if (k === 'ansicht' && /^[a-z]{3,20}$/.test(v)) out.sub = v;
      else if (k === 'k' && /^[a-z0-9_]{2,40}$/.test(v)) out.metric = v;
      else if (k === 't' && /^[a-z]{3,12}$/.test(v)) out.tab = v;
      else if (k === 'p' && (v === 'q' || v === 'j')) out.period = v === 'q' ? 'quarterly' : 'annual';
      // Kennzahl-Detail: weitere Kennzahlen im selben Verlauf (&plus=a.b.c) und Darstellung (&d=achsen|index|getrennt)
      else if (k === 'plus' && /^[a-z0-9_]{2,40}(\.[a-z0-9_]{2,40}){0,5}$/.test(v)) out.plus = v.split('.');
      else if (k === 'd' && /^(achsen|index|getrennt)$/.test(v)) out.dmode = v;
    });
    return out;
  }

  var api = { VERSION: VERSION, METRICS: METRICS, MARGINS: MARGINS, STOCK_BASE: STOCK_BASE, SEARCH_PATH: SEARCH_PATH,
    fromStock: fromStock, change: change, series: series, money: money, count: count, pct: pct, value: value, changeText: changeText,
    dateDe: dateDe, yearRanges: yearRanges, cagr: cagr, yoy: yoy, HOME_ROWS: HOME_ROWS, homeRow: homeRow, homeTile: homeTile, peerOptions: peerOptions, peersFromRow: peersFromRow, compareRow: compareRow, compareScale: compareScale, titleCase: titleCase, ROWS_BASE: ROWS_BASE, reasonText: reasonText, multiple: multiple, HORIZONS: HORIZONS, secFilingUrl: secFilingUrl, search: search, parseRoute: parseRoute, stockPath: stockPath, normTicker: normTicker, validTicker: validTicker };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.VUFundamental = global.VUFundamental || {};
  global.VUFundamental.Model = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
