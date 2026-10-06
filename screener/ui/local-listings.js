/* The regional view lives inside the existing Screener. Quotes and verified
   indicators come from Core; the existing Query/Engine performs the screen. */
(function (global) {
  'use strict';
  var F = global.VUScreenerFields, Q = global.VUScreenerQuery;
  function script(path) { return new Promise(function (resolve, reject) { var s = document.createElement('script'); s.src = path; s.onload = resolve; s.onerror = reject; document.head.append(s); }); }
  async function boot(root, helpers) {
    var h = helpers.h, main = h('main', { id: 'sc-main', class: 'sc-app sc-europe', tabindex: '-1' });
    root.replaceChildren(main);
    main.append(h('h1', { text: 'Screener · Deutschland & Europa' }), h('p', { class: 'sc-lead', text: 'Lokale Aktien nach belegten Kursen und technischen Kriterien auswählen.' }),
      h('nav', { class: 'sc-eu-nav', 'aria-label': 'Aktienregion' }, [h('a', { href: '/screener/' }, 'USA'), h('a', { href: '/screener/?u=EUROPE', 'aria-current': 'page' }, 'Deutschland & Europa'), h('a', { href: '/discover/#/de-eu' }, 'In Discover öffnen')]));
    var status = h('p', { class: 'sc-note', role: 'status', text: 'Lokale Listings werden geladen …' }); main.append(status);
    try {
      await Promise.all(['/core/client.js', '/screener/engine/local-listings.js', '/discover/engines/local-listings.js', '/discover/ui/logos.js'].map(script));
      var L = global.VUScreenerLocalListings, D = global.VUDiscover, storage;
      try { storage = global.localStorage; } catch (_) {}
      var core = global.VUCore.Client.create({ load: function (path) { return fetch(path).then(function (r) { if (!r.ok) throw Error('HTTP_' + r.status); return r.json(); }); } });
      if (typeof core.getListingScreener !== 'function') throw Error('PRODUCT_INTEGRATION_MISSING');
      var prepared = L.prepare(await core.getListingScreener()), rows = prepared.rows, ds = prepared.dataset, params = new URLSearchParams(location.search);
      var q = Q.fromParams(params); if (!params.get('sort')) q.sort = { field: 'name', dir: 'asc' };
      var currency = params.get('currency') || '', search = params.get('q') || '', issuerCountry = params.get('issuerCountry') || '', shown = 30;
      L.validate(q, { currency: currency, issuerCountry: issuerCountry });
      var controls = h('form', { class: 'sc-card sc-eu-controls', onsubmit: function (e) { e.preventDefault(); } });
      var results = h('section', { class: 'sc-eu-results', 'aria-label': 'Lokale Screener-Treffer' });
      function label(text, child) { return h('label', {}, [h('span', { text: text }), child]); }
      function select(name, options, current) {
        return h('select', { 'aria-label': name }, options.map(function (o) { return h('option', { value: o[0], selected: o[0] === current || null, disabled: o[2] || null }, o[1]); }));
      }
      function unique(values) { return Array.from(new Set(values.filter(Boolean))).sort(); }
      function value(id) { var f = Q.filters(q).find(function (f) { return f.field === id; }); return f ? f.value[0] : ''; }
      function replace(id, next) {
        Q.filters(q).filter(function (f) { return f.field === id; }).forEach(function (f) { q = Q.removeFilter(q, f.id); });
        if (next) q = Q.addFilter(q, { field: id, op: 'in', value: [next] }).query;
      }
      function updateURL() {
        var p = Q.toParams(q); p.set('u', 'EUROPE');
        if (currency) p.set('currency', currency); if (search) p.set('q', search);
        if (issuerCountry) p.set('issuerCountry', issuerCountry);
        history.replaceState({ sc: 1 }, '', '/screener/?' + p.toString());
      }
      var query = h('input', { type: 'search', placeholder: 'Name, Ticker oder ISIN', 'aria-label': 'Europäische Aktien suchen', value: search });
      query.oninput = function () { search = query.value; shown = 30; paint(); };
      controls.append(label('Aktie suchen', query));
      var displayNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['de'], { type: 'region' }) : null;
      var issuer = select('Emittentenland', [['', 'Alle']].concat(unique(rows.map(L.issuerCountry)).map(function (code) { return [code, displayNames ? displayNames.of(code) : code]; })), issuerCountry);
      if (rows.some(function (row) { return !L.issuerCountry(row); })) issuer.append(h('option', { value: 'UNKNOWN', selected: issuerCountry === 'UNKNOWN' || null }, 'Nicht belegt'));
      issuer.onchange = function () { issuerCountry = issuer.value; shown = 30; paint(); }; controls.append(label('Emittentenland', issuer));
      [['country', 'Börsenland', unique(rows.map(function (r) { return r.listingCountry; }))], ['exchange', 'Handelsplatz / MIC', unique(rows.map(function (r) { return r.mic; }))],
        ['index', 'Indexmitgliedschaft', unique(rows.flatMap(function (r) { return r.indexMemberships || []; }))]].forEach(function (item) {
        var input = select(item[1], [['', 'Alle']].concat(item[2].map(function (code) {
          return [code, item[0] === 'country' && displayNames ? displayNames.of(code) : code === 'EURO_STOXX_50' ? 'EURO STOXX 50' : code === 'TECDAX' ? 'TecDAX' : code];
        })), value(item[0]));
        input.onchange = function () { replace(item[0], input.value); shown = 30; paint(); }; controls.append(label(item[1], input));
      });
      var currencies = unique(rows.map(L.quoteUnit)), ccy = select('Kurswährung / Notierungseinheit', [['', 'Alle · kein Kursvergleich']].concat(currencies.map(function (c) { return [c, c]; })), currency);
      ccy.onchange = function () { currency = ccy.value; if (!currency && q.sort.field === 'price') q.sort = { field: 'name', dir: 'asc' }; paintControls(); paint(); };
      controls.append(label('Kurswährung / Notierungseinheit', ccy));
      var priceControl = h('div'), metricControls = h('div', { class: 'sc-eu-metrics' }); controls.append(priceControl, metricControls); main.append(controls, results);
      function paintControls() {
        var activePrice = Q.filters(q).find(function (f) { return f.field === 'price'; });
        var price = h('input', { type: 'number', min: '0', step: 'any', disabled: !currency || null, 'aria-label': 'Mindestkurs', value: activePrice ? activePrice.value : '' });
        price.onchange = function () {
          Q.filters(q).filter(function (f) { return f.field === 'price'; }).forEach(function (f) { q = Q.removeFilter(q, f.id); });
          if (price.value !== '' && Number.isFinite(Number(price.value))) q = Q.addFilter(q, { field: 'price', op: 'gte', value: Number(price.value) }).query;
          paint();
        };
        priceControl.replaceChildren(label('Mindestkurs' + (currency ? ' in ' + currency : ' · Währung zuerst wählen'), price));
        if (!currency && activePrice) q = Q.removeFilter(q, activePrice.id);
        metricControls.replaceChildren();
        Q.filters(q).filter(function (f) { return L.METRICS.includes(f.field); }).forEach(function (filter) {
          metricControls.append(h('div', { class: 'sc-eu-criterion' }, [h('span', { text: F.describeFilter(filter) }), h('button', { type: 'button', class: 'sc-btn sc-btn-secondary', 'aria-label': F.field(filter.field).label + ' entfernen', onclick: function () { q = Q.removeFilter(q, filter.id); paintControls(); paint(); } }, 'Entfernen')]));
        });
        var available = L.METRICS.filter(function (id) { return ds.coverage(id) > 0; });
        var field = select('Technisches Kriterium', [['', 'Kriterium auswählen']].concat(L.METRICS.map(function (id) { return [id, F.field(id).label + (ds.coverage(id) ? '' : ' · nicht verfügbar'), !ds.coverage(id)]; })), '');
        var op = select('Vergleich', [['gte', 'mindestens'], ['lte', 'höchstens']], 'gte');
        var input = h('input', { type: 'number', step: 'any', 'aria-label': 'Kriterienwert', placeholder: 'Prozent als Prozentzahl' });
        var add = h('button', { type: 'button', class: 'sc-btn sc-btn-secondary', disabled: !available.length || null, onclick: function () {
          if (!field.value || input.value === '') return;
          var v = F.fromInput(F.field(field.value), input.value); if (v === null) return;
          try { q = Q.addFilter(q, { field: field.value, op: op.value, value: v }).query; paintControls(); paint(); } catch (e) { status.textContent = e.message; }
        } }, 'Kriterium hinzufügen');
        metricControls.append(label('Technische Filter', field), op, input, add,
          h('p', { class: 'sc-note', text: available.length ? 'Nur belegte Werte der vorhandenen VU-Engines. Prozentwerte als Prozentzahl eingeben; Stückzahlen und Vielfache ohne Umrechnung.' : 'Technische Filter sind für diesen Bestand noch nicht freigegeben. Fehlende Werte bleiben nicht verfügbar.' }));
      }
      var sort = select('Sortierung', [['name', 'Name'], ['price', 'Kurs']].concat(L.METRICS.filter(function (id) { return ds.coverage(id); }).map(function (id) { return [id, F.field(id).label]; })), q.sort.field);
      var direction = select('Sortierrichtung', [['asc', 'Aufsteigend'], ['desc', 'Absteigend']], q.sort.dir);
      sort.onchange = direction.onchange = function () { q.sort = { field: sort.value, dir: direction.value }; paint(); };
      controls.append(label('Sortierung', sort), label('Sortierrichtung', direction));
      function paint() {
        try {
          var r = L.execute(prepared, q, { currency: currency, query: search, issuerCountry: issuerCountry }); updateURL();
          status.textContent = r.total + ' passende Listings von ' + r.universe + ' in der Auswahl · Referenzstand ' + (prepared.data.referenceAsOf || 'unbekannt') + ' · Datenstand ' + (prepared.data.dataAsOf || 'unbekannt');
          sort.querySelector('option[value="price"]').disabled = !currency;
          sort.value = q.sort.field;
          results.replaceChildren();
          var missing = Object.values(r.perFilter).reduce(function (n, f) { return n + f.missing; }, 0);
          if (missing) results.append(h('p', { class: 'sc-note', text: 'Fehlende Werte erfüllen keinen Filter. ' + missing + ' fehlende Einzelwerte in den aktiven Kriterien.' }));
          r.rows.slice(0, shown).forEach(function (row) {
            var p = row.price, unit = L.quoteUnit(row), freshness = p && ({ CURRENT: 'bestätigte letzte Sitzung', STALE: 'veralteter Quellenstand', STALE_CACHE: 'veralteter Quellenstand' }[p.freshness] || 'Aktualität nicht bestätigt');
            var price = p ? new Intl.NumberFormat('de-DE', { maximumFractionDigits: p.close >= 1 ? 2 : 6 }).format(p.close) + ' ' + unit : 'Kurs nicht verfügbar';
            var watch = h('button', { type: 'button', class: 'sc-btn sc-btn-secondary' });
            function watchState() { var saved = D.LocalListings.contains(storage, row); watch.textContent = saved ? 'Auf Watchlist' : 'Zur Watchlist'; watch.setAttribute('aria-pressed', String(saved)); watch.setAttribute('aria-label', row.name + (saved ? ' aus Watchlist entfernen' : ' zur Watchlist hinzufügen')); }
            watch.onclick = function () { try { D.LocalListings.toggle(storage, row); watchState(); } catch (_) { watch.textContent = 'Speichern nicht möglich'; } }; watchState();
            var details = h('div', {}, [h('a', { class: 'sc-eu-stock', href: '/discover/#/listing/' + encodeURIComponent(row.listingId) }, row.name || row.ticker),
              h('p', { class: 'sc-note', text: [row.ticker, row.isin, row.mic, unit, (row.indexMemberships || []).join(', ')].filter(Boolean).join(' · ') }),
              h('p', { class: 'sc-note', text: 'Emittentenland: ' + (L.issuerCountry(row) ? displayNames ? displayNames.of(L.issuerCountry(row)) : L.issuerCountry(row) : 'nicht belegt') }),
              h('p', { class: 'sc-num sc-eu-price', text: price }), h('p', { class: 'sc-note', text: p ? 'Letzter Handelsschluss: ' + p.date + ' · ' + freshness : 'Keine freigegebene Kursbasis vorhanden.' })]);
            Q.filters(q).filter(function (f) { return L.METRICS.includes(f.field); }).forEach(function (filter) {
              details.append(h('p', { class: 'sc-note', text: F.field(filter.field).label + ': ' + F.format(filter.field, ds.value(filter.field, ds.indexOf(row.listingId))) }));
            });
            results.append(h('article', { class: 'sc-card sc-eu-row', 'data-listing-id': row.listingId }, [D.Logos.mark(D.LocalListings.logoSymbol(row), { name: row.name, size: 'sm' }), details, watch]));
          });
          if (!r.total) results.append(h('p', { class: 'sc-note', text: 'Keine Listings erfüllen diese Kriterien.' }));
          if (r.total > shown) results.append(h('button', { type: 'button', class: 'sc-btn sc-btn-secondary', onclick: function () { shown += 30; paint(); } }, 'Weitere Treffer anzeigen'));
        } catch (e) { results.replaceChildren(); status.textContent = 'Dieser Screen kann nicht ausgeführt werden: ' + e.message; }
      }
      main.append(h('p', { class: 'sc-note', text: 'Emittentenland bezeichnet den belegten Unternehmenssitz. Börsenland und MIC bezeichnen den Handelsplatz. Fehlende Sitzangaben bleiben nicht belegt. Kursvergleiche gelten nur in der ausgewählten Notierungseinheit. Quant-Scores und globale Rankings sind für diesen regionalen Bestand nicht verfügbar.' }),
        h('a', { class: 'sc-link', href: '/discover/#/watchlist' }, 'Gemeinsame Watchlist in Discover öffnen'));
      paintControls(); paint();
    } catch (e) { status.textContent = 'Der lokale Datenbestand ist nicht verfügbar (' + String(e && e.message || e) + ').'; }
  }
  global.VUScreenerLocalView = { boot: boot };
})(window);
