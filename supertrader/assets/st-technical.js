/* Vision Universe® — Supertrader: Technical-Stand derselben Aktie (Aktienseite)
   Gegenrichtung zu „Diese Aktie in Quant und Supertrader“ in Chart Studio. Die Aktienseite zeigt, was die Produktwelt
   Technical zu dieser Aktie veröffentlicht hat: Vorlagen und Analyseziele (erfüllt / fast erfüllt), Formationen,
   Trendzustand, Datenqualität und Stand. Nur Lesen, keine eigene Rechnung, kein Supertrader-Signal.

   Quelle (Erzeuger scripts/technical/world/build-screener.mjs, docs/technical/STOCK_SUMMARY.md):
     /technical/data/meta.json              stock.shards nennt die veröffentlichten Scherben (4 KB)
     /technical/data/stock/<shardKey>.json  Technical-Stand je Aktie, Scherbe = core/identity.js#shardKey
   Eine Scherbe wird nur angefragt, wenn meta.json sie nennt: vor der ersten Veröffentlichung und für Kürzel ohne
   Scherbe gibt es keine vergebliche Anfrage. Fehlt etwas oder passt das Schema nicht, heißt das „keine Angabe“,
   nie „nichts erkannt“. Link nach Chart Studio über core/stock-context.js#href(ctx, "technical").

   Browser: window.STTechnical (von supertrader.js auf der Aktienseite nachgeladen); Node: module.exports (Tests). */
(function (root) {
  'use strict';
  var isNode = typeof module === 'object' && module.exports;
  var META = '/technical/data/meta.json';
  var DIR = '/technical/data/stock/';
  var SCHEMA = 'vu-technical-stock-1.0.0';
  var VERSION = 'st-technical-1.0.0';
  /* Ergebnis einer Vorlage: Ton und kurze Marke; der Satz („fast erfüllt – ein Kriterium fehlt“) kommt aus den Daten. */
  var FIT = { FULL: ['good', 'Erfüllt'], NEAR: ['info', 'Fast erfüllt'], INCOMPLETE: ['mute', 'Unvollständig'] };
  var FORM_TONE = { CONFIRMED: 'good', DETECTED: 'info', INVALIDATED: 'bad' };
  var DQ_TONE = { warn: 'warn', bad: 'bad', info: 'info' };
  var SHOW_FORMATIONS = 4;

  function identity() { return isNode ? require('../../core/identity.js') : root.VUCore && root.VUCore.Identity; }
  function str(x) { return x == null ? '' : String(x); }
  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function dateDe(d) { if (!d) return '–'; var p = String(d).slice(0, 10).split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }

  /** Adresse der Scherbe oder null, wenn meta.json sie nicht nennt (dann keine Anfrage). */
  function shardPath(meta, ticker) {
    var I = identity(); if (!I || !isObj(meta) || !isObj(meta.stock) || meta.stock.schema !== SCHEMA || !Array.isArray(meta.stock.shards)) return null;
    var key = I.shardKey(ticker);
    return meta.stock.shards.indexOf(key) >= 0 ? DIR + key + '.json' : null;
  }

  /**
   * Anzeigemodell. meta: technical/data/meta.json, shard: Scherbe (oder null), ticker, opts: {chartHref, supertraderAsOf}.
   * -> {state:'AVAILABLE', ...} | {state:'UNAVAILABLE', reason:'NOT_PUBLISHED'|'NOT_COVERED'|'INVALID_ARTIFACT', chart}
   */
  function view(meta, shard, ticker, opts) {
    var T = str(ticker).toUpperCase(), o = opts || {};
    var chart = typeof o.chartHref === 'function' ? o.chartHref(T) : null;
    function link(q) { return chart ? chart + (q ? '?' + q : '') : null; }
    if (!isObj(meta) || !isObj(meta.stock)) return { state: 'UNAVAILABLE', reason: 'NOT_PUBLISHED', chart: chart };
    if (meta.stock.schema !== SCHEMA) return { state: 'UNAVAILABLE', reason: 'INVALID_ARTIFACT', chart: chart };
    if (!shard) return { state: 'UNAVAILABLE', reason: 'NOT_COVERED', chart: null };
    var I = identity();
    if (!isObj(shard) || shard.schema !== SCHEMA || !isObj(shard.stocks) || !isObj(shard.labels) || (I && shard.shard !== I.shardKey(T))) return { state: 'UNAVAILABLE', reason: 'INVALID_ARTIFACT', chart: chart };
    var r = shard.stocks[T];
    if (!r) return { state: 'UNAVAILABLE', reason: 'NOT_COVERED', chart: null };
    if (r.s !== T || (I && r.sid !== I.securityIdForTicker(T))) return { state: 'UNAVAILABLE', reason: 'INVALID_ARTIFACT', chart: chart };
    var L = shard.labels, LT = L.templates || {}, LG = L.goals || {};
    function fits(list, lab, kind) {
      return (list || []).filter(function (f) { return f && FIT[f.status] && lab[f.id]; }).map(function (f) {
        return { kind: kind, title: lab[f.id].title, status: f.status, tone: FIT[f.status][0], mark: FIT[f.status][1], label: f.label, pass: f.pass, total: f.total, href: link(lab[f.id].q) };
      });
    }
    var all = fits(r.templates, LT, 'Vorlage').concat(fits(r.goals, LG, 'Analyseziel'));
    var asOf = r.asOf || shard.asOf || null, stAsOf = o.supertraderAsOf || null;
    return {
      state: 'AVAILABLE', ticker: T, asOf: asOf, shardAsOf: shard.asOf || null, fresh: r.fresh === true,
      otherDay: !!(stAsOf && shard.asOf && stAsOf !== shard.asOf), supertraderAsOf: stAsOf,
      structure: r.structure ? { code: r.structure, label: (L.structures && L.structures[r.structure]) || r.structure } : null,
      trend: (L.trend || []).map(function (t, k) { var v = r.trend ? r.trend[k] : null; return { label: t.label, value: v === true ? true : v === false ? false : null }; }),
      rsRank: typeof r.rsRank === 'number' && isFinite(r.rsRank) ? r.rsRank : null,
      formations: (r.formations || []).map(function (f) {
        return { name: (L.formations && L.formations[f.type]) || f.type, weekly: f.tf === '1W', badge: f.badge, tone: FORM_TONE[f.state] || 'mute', text: f.text };
      }),
      fits: all.filter(function (f) { return f.status !== 'INCOMPLETE'; }),
      incomplete: all.filter(function (f) { return f.status === 'INCOMPLETE'; }),
      checked: L.checked || null, excluded: r.fresh !== true,
      dq: (r.dq || []).map(function (d) { return { tone: DQ_TONE[d.tone] || 'info', short: d.short, long: d.long }; }),
      limits: shard.limits || null, chart: chart
    };
  }

  /* ------------------------------------------------------------ DOM */
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) { var v = attrs[k]; if (v === null || v === undefined || v === false) continue; if (k === 'text') e.textContent = v; else e.setAttribute(k, v === true ? '' : v); }
    (kids || []).forEach(function (c) { if (c === null || c === undefined || c === false) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function tag(text, tone, title) { return h('span', { class: 'st-tag', 'data-t': tone || null, title: title || null, text: text }); }
  function head(more) {
    return h('div', { class: 'st-sec-h vu-sec-head' }, [h('div', null, [h('div', { class: 'st-kick vu-eyebrow', text: 'Technical · Research, kein Supertrader-Signal' }), h('h2', { class: 'vu-sec-title', text: 'Technischer Zustand' })]), more]);
  }
  function chartLink(href, text) { return href ? h('a', { class: 'st-more', href: href, text: text || 'In Chart Studio öffnen' }) : null; }

  function render(v) {
    var sec = h('section', { class: 'st-sec vu-sec st-tech', id: 'st-technical', 'data-state': v.state === 'AVAILABLE' ? 'AVAILABLE' : v.reason });
    if (v.state !== 'AVAILABLE') {
      var txt = v.reason === 'NOT_PUBLISHED' ? 'Der Technical-Stand je Aktie ist noch nicht veröffentlicht. Er erscheint mit dem nächsten Technical-Lauf.'
        : v.reason === 'NOT_COVERED' ? 'Technical führt zu ' + v.ticker + ' keinen Eintrag. Keine Angabe – das heißt nicht, dass nichts erkannt wurde.'
        : 'Der Technical-Stand ist gerade nicht lesbar. Keine Angabe.';
      sec.appendChild(head(chartLink(v.chart)));
      sec.appendChild(h('p', { class: 'st-hint st-tech-empty', text: txt }));
      return sec;
    }
    sec.appendChild(head(chartLink(v.chart)));
    /* Stand und Datenqualitaet zuerst: was die Aussage einschraenkt, steht oben. */
    var meta = [tag('Stand ' + dateDe(v.asOf), v.fresh ? null : 'warn')];
    if (v.otherDay) meta.push(h('span', { class: 'st-tech-note', text: 'Supertrader rechnet auf dem ' + dateDe(v.supertraderAsOf) + '.' }));
    v.dq.forEach(function (d) { meta.push(tag(d.short, d.tone, d.long)); });
    sec.appendChild(h('div', { class: 'st-tech-meta' }, meta));
    var dqLong = v.dq.filter(function (d) { return d.tone === 'bad' || d.tone === 'warn'; })[0];
    if (dqLong && dqLong.long) sec.appendChild(h('p', { class: 'st-tech-dq', 'data-t': dqLong.tone, role: 'note', text: dqLong.long }));

    /* Vorlagen und Analyseziele: nur erfuellt und fast erfuellt, mit Link auf die Pruefleiste in Chart Studio. */
    var fitsBox = h('div', { class: 'st-tech-block' }, [h('h3', { text: 'Vorlagen und Analyseziele' })]);
    if (v.excluded) fitsBox.appendChild(h('p', { class: 'st-hint', text: 'Nicht eingeordnet – kein aktueller Kurs.' }));
    else if (!v.fits.length) fitsBox.appendChild(h('p', { class: 'st-hint', text: 'Keine Vorlage und kein Analyseziel erfüllt oder fast erfüllt' + (v.checked ? ' (' + v.checked.templates + ' Vorlagen, ' + v.checked.goals + ' Analyseziele geprüft)' : '') + '.' }));
    else fitsBox.appendChild(h('ul', { class: 'st-tech-fits' }, v.fits.map(function (f) {
      var inner = [h('span', { class: 'st-tech-fit-t' }, [h('strong', { text: f.title }), h('span', { class: 'st-tech-kind', text: f.kind })]),
        h('span', { class: 'st-tech-fit-r' }, [tag(f.mark, f.tone), h('span', { class: 'st-tech-n', text: f.pass + '/' + f.total })])];
      return h('li', { 'data-s': f.status }, [f.href ? h('a', { href: f.href, title: f.label }, inner) : h('div', { title: f.label }, inner)]);
    })));
    if (v.incomplete.length) fitsBox.appendChild(h('p', { class: 'st-tech-note', text: 'Unvollständig (Werte fehlen): ' + v.incomplete.map(function (f) { return f.title; }).join(', ') + '.' }));
    sec.appendChild(fitsBox);

    /* Trend: Marktstruktur und vier Linienzustaende des Tagescharts. */
    var trend = h('div', { class: 'st-tech-block' }, [h('h3', { text: 'Trend' })]);
    var row = [v.structure ? tag(v.structure.label, v.structure.code === 'BULLISH' ? 'good' : v.structure.code === 'BEARISH' ? 'bad' : null) : null,
      v.rsRank !== null ? h('span', { class: 'st-tech-note', text: 'Relative Stärke: Rang ' + Math.round(v.rsRank) + ' von 100' }) : null];
    trend.appendChild(h('div', { class: 'st-tech-meta' }, row));
    trend.appendChild(h('ul', { class: 'st-tech-trend' }, v.trend.map(function (t) {
      var m = t.value === true ? ['ok', '✓', 'ja'] : t.value === false ? ['no', '✕', 'nein'] : ['nd', '…', 'unbekannt'];
      return h('li', { 'data-s': m[0] }, [h('span', { class: 'i', 'aria-hidden': 'true', text: m[1] }), h('span', { text: t.label }), h('span', { class: 'st-sr', text: ' – ' + m[2] })]);
    })));
    sec.appendChild(trend);

    /* Formationen: die ersten vier sichtbar, der Rest aufklappbar. */
    var fm = h('div', { class: 'st-tech-block' }, [h('h3', { text: 'Formationen' })]);
    function item(f) { return h('li', null, [h('div', { class: 'r1' }, [h('strong', { text: f.name }), f.weekly ? tag('Woche') : null, tag(f.badge, f.tone)]), h('p', { text: f.text })]); }
    if (!v.formations.length) fm.appendChild(h('p', { class: 'st-hint', text: v.excluded ? 'Keine Formationen – kein aktueller Kurs.' : 'Keine aktive Formation.' }));
    else {
      fm.appendChild(h('ul', { class: 'st-tech-forms' }, v.formations.slice(0, SHOW_FORMATIONS).map(item)));
      var rest = v.formations.slice(SHOW_FORMATIONS);
      if (rest.length) fm.appendChild(h('details', { class: 'vu-more st-vmore' }, [h('summary', { text: 'Weitere Formationen (' + rest.length + ')' }), h('div', { class: 'vu-more-body' }, [h('ul', { class: 'st-tech-forms' }, rest.map(item))])]));
    }
    sec.appendChild(fm);
    sec.appendChild(h('p', { class: 'st-tech-limits', text: 'Technical beschreibt den Chart nach eigenen Kriterien; die Supertrader-Modelle entscheiden nach ihren eigenen Regeln. ' + (v.limits || '') }));
    return sec;
  }

  function getJSON(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(url + ' HTTP ' + r.status); return r.json(); }); }

  /** Laedt meta.json und (falls genannt) die Scherbe, setzt den Abschnitt in host. opts: {chartHref, supertraderAsOf}. */
  function mount(host, ticker, opts) {
    var T = str(ticker).toUpperCase();
    if (!host || !T) return Promise.resolve(null);
    return getJSON(META).catch(function () { return null; }).then(function (meta) {
      var p = shardPath(meta, T);
      return (p ? getJSON(p).catch(function () { return { schema: null }; }) : Promise.resolve(null)).then(function (shard) {
        var v = view(meta, shard, T, opts);
        v.ticker = T;
        var node = render(v);
        host.replaceChildren(node);
        return v;
      });
    });
  }

  var api = { VERSION: VERSION, SCHEMA: SCHEMA, META: META, DIR: DIR, shardPath: shardPath, view: view, mount: mount };
  if (isNode) module.exports = api;
  else root.STTechnical = api;
})(typeof window !== 'undefined' ? window : globalThis);
