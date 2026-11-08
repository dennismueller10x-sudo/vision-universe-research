/* Screener · Europa (Strang M, 08.11.2026): einfache Kursspalten aus veröffentlichten, unbereinigten
   Tagesschlusskursen. Daten: /screener/data/universe-EUROPE.json (scripts/screener/build-europe.mjs,
   Regel in screener/europe-close-metrics.js). Kein Fachmodell, keine Schätzung: leere Zelle = „–“. */
(function (global) {
  'use strict';
  var doc = global.document, main = doc.getElementById('sc-main');
  var Cal = global.VUCore && global.VUCore.EuropeExchangeCalendar;
  var COLS = [
    { id: 'price', label: 'Kurs', money: true },
    { id: 'r1m', label: '1 Mon.', pct: true }, { id: 'r3m', label: '3 Mon.', pct: true },
    { id: 'r6m', label: '6 Mon.', pct: true }, { id: 'r1y', label: '1 Jahr', pct: true },
    { id: 'fromHigh52w', label: 'vom 52-W-Hoch', pct: true }, { id: 'vsSma50', label: 'zur 50-Tage-Linie', pct: true }
  ];
  var COUNTRY = { DE: 'Deutschland', FR: 'Frankreich', NL: 'Niederlande', BE: 'Belgien', IT: 'Italien', ES: 'Spanien', CH: 'Schweiz', AT: 'Österreich',
    SE: 'Schweden', DK: 'Dänemark', FI: 'Finnland', NO: 'Norwegen', LU: 'Luxemburg', IE: 'Irland', GB: 'Großbritannien', PT: 'Portugal' };
  var MAX_LAG = 3; /* wie Discover: mehr als drei abgeschlossene Börsentage alt = nicht angezeigt */

  function h(tag, attrs, kids) {
    var n = doc.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { var v = attrs[k]; if (v === null || v === undefined || v === false) return;
      if (k === 'text') n.textContent = v; else if (k === 'class') n.className = v; else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : String(v)); });
    (kids || []).forEach(function (c) { if (c !== null && c !== undefined) n.append(c); });
    return n;
  }
  function pct(v) { return v === null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %'; }
  function money(v, cur) { return v === null ? '–' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: cur, maximumFractionDigits: v < 10 ? 4 : 2 }).format(v); }
  function dateDe(d) { return d ? d.slice(8, 10) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4) : '–'; }
  function sign(v) { return v === null ? 'sc-muted' : v > 0 ? 'sc-up' : v < 0 ? 'sc-down' : 'sc-muted'; }
  /** Abgeschlossene Börsentage nach dem letzten Schluss (exakter Handelsplatz, aktuelle Uhrzeit). */
  function lag(row, now) {
    if (!Cal) return 0;
    try { var from = new Date(Date.parse(row.asOf) + 86400000).toISOString().slice(0, 10), to = new Date(now).toISOString().slice(0, 10);
      if (from > to) return 0; return Cal.sessions(row.mic, from, to).filter(function (s) { return Date.parse(s.close) <= now; }).length; } catch (e) { return 0; }
  }

  function render(data) {
    var now = Date.now(), rows = data.rows.filter(function (r) { return lag(r, now) <= MAX_LAG; }), stale = data.rows.length - rows.length;
    var state = { country: 'ALL', sort: 'r1m', dir: -1, q: '' };
    var countries = {}; rows.forEach(function (r) { countries[r.country] = (countries[r.country] || 0) + 1; });
    var order = Object.keys(countries).sort(function (a, b) { return a === 'DE' ? -1 : b === 'DE' ? 1 : countries[b] - countries[a]; });
    main.replaceChildren();
    doc.title = 'Europa · Screener — Vision Universe®';
    main.append(
      h('p', { class: 'vu-ltag', text: 'Screener · Europa' }),
      h('h1', { class: 'vu-lt', text: 'Europäische Aktien' }),
      h('p', { class: 'vu-lead', text: rows.length + ' Aktien an zehn Börsen · Schluss ' + dateDe(data.asOf) + ' · Kurse in Landeswährung, unbereinigt.' }),
      h('p', {}, [h('a', { href: '/screener/', text: '← Zum Screener (USA)' })])
    );
    var chips = h('div', { class: 'vu-chips', role: 'group', 'aria-label': 'Land' });
    [['ALL', 'Alle']].concat(order.map(function (c) { return [c, (COUNTRY[c] || c) + ' ' + countries[c]]; })).forEach(function (c) {
      chips.append(h('button', { type: 'button', class: 'vu-chip', 'data-country': c[0], 'aria-pressed': String(c[0] === state.country), text: c[1], onclick: function () { state.country = c[0];
        Array.prototype.forEach.call(chips.children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.country === state.country)); }); draw(); } }));
    });
    var find = h('input', { type: 'search', placeholder: 'Name, Kürzel oder ISIN', 'aria-label': 'Aktie suchen', autocomplete: 'off', class: 'sc-europe-find',
      style: 'width:100%;min-height:44px;margin:12px 0;padding:10px 12px;border-radius:12px;border:1px solid var(--sc-line);background:var(--sc-surface);color:inherit;font:inherit',
      oninput: function () { state.q = find.value.trim().toUpperCase(); draw(); } });
    var count = h('p', { class: 'sc-note', role: 'status' }), slot = h('div');
    main.append(chips, find, count, slot,
      h('p', { class: 'sc-note', text: 'Leere Felder (–) sind Absicht: Ein Wert steht nur, wenn mindestens 90 % der Börsentage im Fenster einen Schlusskurs haben ' +
        '(Kursveränderung: zusätzlich am ersten und letzten Tag; 52-Wochen-Hoch: 252 Börsentage; 50-Tage-Linie: 45 von 50 Tagen). Ein Sprung über 40 % zwischen zwei Schlüssen macht den Wert leer, weil die Kurse unbereinigt sind (möglicher Split). Lücken werden nie aufgefüllt.' }),
      stale ? h('p', { class: 'sc-note', text: stale + ' Aktien sind nicht aufgeführt, weil ihr letzter Schluss mehr als drei Börsentage zurückliegt.' }) : null,
      h('p', { class: 'sc-note', text: 'Für Europa gibt es noch keine Quant-, Technical- oder Supertrader-Auswertung. Keine Anlageempfehlung.' }));
    function draw() {
      var list = rows.filter(function (r) { return (state.country === 'ALL' || r.country === state.country) &&
        (!state.q || (r.name + ' ' + r.ticker + ' ' + r.isin).toUpperCase().indexOf(state.q) >= 0); });
      list.sort(function (a, b) { var x = a[state.sort], y = b[state.sort];
        if (state.sort === 'name') return a.name.localeCompare(b.name, 'de') * state.dir;
        if (x === null && y === null) return 0; if (x === null) return 1; if (y === null) return -1; return (x - y) * state.dir; });
      count.textContent = list.length + ' Treffer';
      var head = h('tr', {}, [{ id: 'name', label: 'Aktie' }].concat(COLS).map(function (c) {
        var on = state.sort === c.id;
        return h('th', { scope: 'col', 'aria-sort': on ? (state.dir > 0 ? 'ascending' : 'descending') : null }, [h('button', { type: 'button', text: c.label + (on ? (state.dir > 0 ? ' ↑' : ' ↓') : ''),
          onclick: function () { if (state.sort === c.id) state.dir = -state.dir; else { state.sort = c.id; state.dir = c.id === 'name' ? 1 : -1; } draw(); } })]);
      }));
      var body = h('tbody', {}, list.slice(0, 500).map(function (r) {
        var tr = h('tr', { 'data-security-id': r.securityId, onclick: function (e) { if (!e.target.closest('a')) global.location.href = r.href; } }, [
          h('td', { style: 'white-space:normal;min-width:120px;max-width:150px' }, [h('a', { href: r.href }, [h('b', { text: r.name, style: 'overflow-wrap:anywhere' })]), h('span', { text: r.ticker + ' · ' + r.mic })])
        ].concat(COLS.map(function (c) { var v = r[c.id]; return h('td', { class: c.pct ? sign(v) : null, text: c.money ? money(v, r.currency) : pct(v) }); })));
        return tr;
      }));
      slot.replaceChildren(h('div', { class: 'sc-tablewrap', role: 'region', 'aria-label': 'Europäische Aktien, horizontal scrollbar', tabindex: '0' },
        [h('table', { class: 'sc-table' }, [h('thead', {}, [head]), body])]));
    }
    draw();
    main.setAttribute('aria-busy', 'false');
  }

  fetch('/screener/data/universe-EUROPE.json', { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw Error('HTTP_' + r.status); return r.json(); })
    .then(function (d) { if (!d || d.schema !== 'vu-screener-europe-1') throw Error('SCHEMA_MISMATCH'); render(d); })
    .catch(function () { main.replaceChildren(h('h1', { class: 'vu-lt', text: 'Europäische Aktien' }), h('p', { class: 'sc-note', text: 'Die Europa-Daten sind gerade nicht verfügbar. Die Suche in Discover findet europäische Aktien weiterhin.' }),
      h('p', {}, [h('a', { href: '/discover/#/c/EUROPE/de', text: 'Europa in Discover öffnen' })])); main.setAttribute('aria-busy', 'false'); });
})(window);
