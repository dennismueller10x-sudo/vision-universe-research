/* Basisansicht im bestehenden Discover: nur belegte Listingdaten und dieselbe
   zentrale Preisreihe wie der Kursvertrag. Keine Rankings oder Ersatzscores. */
(function (global) {
  'use strict';
  var D = global.VUDiscover, S = global.QuantShell, M = D.LocalListings, el = S.el;
  var api;
  function service() {
    if (!api) api = M.create({ core: global.VUCore.Client.create({ load: S.loadJSON }) });
    return api;
  }
  function mark(row, size) {
    return D.Logos.mark(M.logoSymbol(row), { name: row.name || row.ticker, size: size || 'sm' });
  }
  function money(value, currency) {
    if (!Number.isFinite(value)) return 'nicht verfügbar';
    return new Intl.NumberFormat('de-DE', { maximumFractionDigits: value >= 1 ? 2 : 6 }).format(value) + ' ' + (currency || '');
  }
  function freshnessLabel(value) {
    return { STALE_CACHE: 'veralteter Quellenstand', STALE: 'veralteter Quellenstand', UNKNOWN: 'Aktualität nicht bestätigt',
      FRESH: 'letzte bestätigte Handelssitzung' }[value] || 'Aktualität nicht bestätigt';
  }
  function watchButton(row) {
    var button = el('button', { type: 'button', class: 'v2-watch-button' });
    function paint() {
      var saved = false; try { saved = M.contains(global.localStorage, row); } catch (_) {}
      button.textContent = saved ? '♥ Auf Watchlist' : '♡ Zur Watchlist';
      button.setAttribute('aria-pressed', String(saved));
      button.setAttribute('aria-label', (row.name || row.ticker) + (saved ? ' aus Watchlist entfernen' : ' zur Watchlist hinzufügen'));
    }
    button.onclick = function () {
      try { M.toggle(global.localStorage, row); paint(); }
      catch (_) { button.textContent = 'Speichern nicht möglich'; }
    };
    paint(); return button;
  }
  async function renderList(root, active) {
    S.clear(root);
    root.append(el('p', { class: 'v2-eyebrow', text: 'Lokale Listings' }), el('h1', { text: 'Deutschland & Europa' }),
      el('p', { class: 'v2-lead', text: 'DAX, MDAX, SDAX, TecDAX, EURO STOXX 50 und weitere belegte europäische Aktien. Indexmitgliedschaft und Handelsplatz sind getrennt ausgewiesen.' }));
    var controls = el('div', { class: 'v2-settings dx-local-controls' });
    var query = el('input', { type: 'search', placeholder: 'Name, Kürzel oder ISIN', 'aria-label': 'Lokale Listings suchen' });
    var filter = el('select', { 'aria-label': 'Index auswählen' });
    [['', 'Alle Titel'], ['DAX', 'DAX'], ['MDAX', 'MDAX'], ['SDAX', 'SDAX'], ['TECDAX', 'TecDAX'], ['EURO_STOXX_50', 'EURO STOXX 50']].forEach(function (x) {
      filter.append(el('option', { value: x[0], text: x[1] }));
    });
    var region = el('select', { 'aria-label': 'Handelsregion auswählen' });
    [['', 'Europa'], ['DE', 'Deutschland (Handelsplatz)']].forEach(function (x) { region.append(el('option', { value: x[0], text: x[1] })); });
    controls.append(query, filter, region); root.append(controls);
    var status = el('p', { class: 'dx-hint', role: 'status' }), rows = el('div', { class: 'v2-watch-list' });
    root.append(status, rows); var generation = 0;
    async function paint() {
      var token = ++generation, filters = { query: query.value, index: filter.value || undefined };
      var responses = await Promise.all([service().list(filters), service().screen(filters).catch(function () { return { state: 'UNAVAILABLE' }; })]);
      var response = responses[0], prices = new Map((responses[1].state === 'AVAILABLE' ? responses[1].data.listings : []).map(function (row) { return [row.listingId, row.price]; }));
      if (!active() || token !== generation) return;
      S.clear(rows);
      if (response.state !== 'AVAILABLE') { status.textContent = 'Der lokale Datenbestand ist nicht verfügbar (' + response.reason + ').'; return; }
      var listings = response.data.listings || [];
      if (region.value) listings = listings.filter(function (row) { return row.listingCountry === region.value; });
      status.textContent = listings.length + ' lokale Listings · Referenzstand ' + (response.data.referenceAsOf || 'unbekannt');
      listings.forEach(function (row) {
        var link = el('a', { href: M.href(row), class: 'v2-watch-row' }, [mark(row), el('span', {}, [
          el('b', { text: row.name || row.ticker }), el('span', { text: ' · ' + [row.ticker, row.mic, row.tradingCurrency, (row.indexMemberships || []).join(', ')].filter(Boolean).join(' · ') })])]);
        var p = prices.get(row.listingId), unit = p && p.quoteUnit;
        link.append(el('span', { class: 'dx-hint', text: p ? money(p.close, M.unitLabel(p.currency, unit)) + ' · ' + p.date + ' · ' + freshnessLabel(p.freshness) : 'Kurs nicht verfügbar' }));
        rows.append(link);
      });
      if (!listings.length) rows.append(el('p', { text: 'Keine passenden belegten Listings.' }));
    }
    query.oninput = paint; filter.onchange = paint; region.onchange = paint; await paint();
  }
  async function renderDetail(root, id, active) {
    var result = await service().detail(id); if (!active()) return;
    S.clear(root);
    if (result.listing.state !== 'AVAILABLE') {
      root.append(el('h1', { text: 'Listing nicht verfügbar' }), el('p', { text: result.listing.reason })); return;
    }
    var row = result.listing.data, price = result.price, series = result.series;
    root.setAttribute('data-listing-id', row.listingId);
    document.title = (row.name || row.ticker) + ' · ' + row.mic + ' — Discover';
    root.append(el('a', { class: 'dx-back', href: '#/de-eu', text: '← Deutschland & Europa' }), watchButton(row));
    root.append(el('header', { class: 'dx-hero dx-hero--schmal' }, [mark(row, 'lg'),
      el('p', { class: 'dx-hero-kicker', text: [row.exchange || row.mic, ({ORDINARY_SHARE:'Stammaktie',REGISTERED_ORDINARY_SHARE:'Namensaktie',PREFERRED_SHARE:'Vorzugsaktie',UNKNOWN:'Gattung ungeklärt',NON_EQUITY_CFI:'Gattung prüfen'})[row.shareClass], row.tradingCurrency].filter(Boolean).join(' · ') }),
      el('h1', { text: row.name || row.ticker }), el('p', { class: 'dx-hero-sub', text: row.ticker + ' · ' + row.isin })]));
    var quote = el('section', { class: 'dx-chapter' }, [el('h2', { text: 'Letzter Handelsschluss' })]);
    if (price.state === 'AVAILABLE') {
      var p = price.data;
      var unit = p.quoteUnit || row.quoteUnit;
      quote.append(el('p', { class: 'v2-lead', text: money(p.close, M.unitLabel(p.currency, unit)) }),
        el('p', { class: 'dx-hint', text: p.date + ' · Marketstack Tageskurs · ' + row.mic + ' · ' + freshnessLabel(p.freshness) }));
      if (p.retrievedAt) quote.append(el('p', { class: 'dx-hint', text: 'Abruf des Quellenstands: ' + p.retrievedAt }));
      if (Number.isFinite(p.changePercent)) quote.append(el('p', { text: p.changePercent.toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ' % gegenüber ' + p.previousDate }));
    } else quote.append(el('p', { text: 'Nicht verfügbar (' + price.reason + ').' }));
    root.append(quote);
    var chart = el('section', { class: 'dx-chapter' }, [el('h2', { text: 'Kursverlauf' })]);
    if (series.state === 'AVAILABLE') {
      var data = series.data, quality = data.quality || {}, ps = { status: 'CALCULATED', points: data.points, source: series.source, from: data.from, to: data.to, priceSeriesType: data.basis, asOf: series.asOf };
      var uncertain = quality.completenessVerified !== true || quality.quarantinedCandles > 0 || (quality.missingSessions || []).length > 0;
      var graphic = D.MicroChart.render(ps, { width: 720, height: 260, dates: true, symbol: row.ticker, range: 'MAX', pointsOnly: uncertain });
      if (graphic) chart.append(graphic); else chart.append(el('p', { text: 'Kurze Historie: ' + data.points.length + ' belegte Tageskurse; für diesen Chart noch zu kurz.' }));
      chart.append(el('p', { class: 'dx-hint', text: data.from + ' bis ' + data.to + ' · ' + (/UNVERIFIED|UNKNOWN/.test(data.basis || '') ? 'Bereinigungsbasis ungeklärt' : data.basis || 'Feldbasis nicht verfügbar') + ' · ' + (M.unitLabel(data.currency || row.tradingCurrency, data.quoteUnit || row.quoteUnit) || '') }));
      if (quality.priceBasis === 'PROVIDER_REPORTED_UNVERIFIED' || !data.basis || /UNVERIFIED|UNKNOWN/.test(data.basis))
        chart.append(el('p', { class: 'dx-hint', text: 'Bereinigungsbasis ungeprüft.' }));
      if (uncertain) chart.append(el('p', { class: 'dx-hint', text: (quality.quarantinedCandles > 0 || (quality.missingSessions || []).length > 0 ? 'Historie mit belegten Datenlücken; ' : '') +
        'Vollständigkeit nicht bestätigt. Darstellung als einzelne Kursbeobachtungen; keine Verbindung über ungeprüfte Lücken.' }));
    } else chart.append(el('p', { text: 'Nicht verfügbar (' + series.reason + ').' }));
    root.append(chart);
    var info = [['ISIN', row.isin], ['Handelsplatz / MIC', row.mic], ['Handelswährung', row.tradingCurrency], ['Notierungseinheit', row.quoteUnit === 'MAJOR' ? 'Haupteinheit der Handelswährung' : M.unitLabel(row.tradingCurrency, row.quoteUnit)],
      ['Indexmitgliedschaften', (row.indexMemberships || []).join(', ')], ['Emittentendomizil', row.companyCountry || 'nicht belegt']];
    var facts = el('dl', { class: 'dx-stammdaten' }); info.forEach(function (x) { facts.append(el('dt', { text: x[0] }), el('dd', { text: x[1] || 'nicht verfügbar' })); });
    root.append(el('section', { class: 'dx-chapter' }, [el('h2', { text: 'Stammdaten' }), facts]),
      el('section', { class: 'dx-chapter' }, [el('h2', { text: 'Analyse' }), el('p', { text: 'Quant, SuperTrader und Fundamentalkennzahlen sind für dieses Listing noch nicht freigegeben. Fehlende Bewertungsdaten werden nicht ersetzt.' })]));
  }
  async function renderWatchlist(root, onRemove, active) {
    var rows; try { rows = M.saved(global.localStorage); } catch (_) { return; }
    if (!rows.length) return;
    var directory = await service().list();
    if (active && !active()) return;
    rows = M.resolveSaved(global.localStorage, directory.state === 'AVAILABLE' ? directory.data.listings : []);
    var list = el('div', { class: 'v2-watch-list' });
    rows.forEach(function (ref) {
      var remove = el('button', { type: 'button', text: 'Entfernen', 'aria-label': (ref.name || ref.ticker) + ' aus Watchlist entfernen' });
      remove.onclick = function () { try { M.toggle(global.localStorage, ref); onRemove(); } catch (_) { remove.textContent = 'Entfernen nicht möglich'; } };
      list.append(el('div', { class: 'v2-watch-row' }, [mark(ref), el('a', { href: M.href(ref), text: [ref.name || ref.ticker, ref.ticker, ref.mic, ref.tradingCurrency || ref.currency].filter(Boolean).join(' · ') }), remove]));
    });
    root.append(el('h2', { text: 'Lokale Listings' }), list);
  }
  D.LocalListingsView = { service: service, mark: mark, renderList: renderList, renderDetail: renderDetail, renderWatchlist: renderWatchlist };
})(window);
