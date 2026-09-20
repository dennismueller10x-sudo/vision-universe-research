(function (global) {
  'use strict';
  var V = global.VUDiscoverV2 = global.VUDiscoverV2 || {};
  var D = global.VUDiscover, S = global.QuantShell, el = S.el;
  function node(tag, cls, text) { return el(tag, { class: cls, text: text }); }
  function link(text, href, cls) { return el('a', { class: cls, href: href, text: text }); }
  // Presentation-only typography: German nouns retain their capital letters.
  // Unknown future contract titles are preserved exactly, never guessed.
  var titles = {
    'BEKANNTE NAMEN IN BEWEGUNG': 'Bekannte Namen in Bewegung',
    'DIE STÄRKSTEN AKTIEN': 'Die stärksten Aktien',
    'TOP 10 · S&P 500': 'Top 10 · S&P 500',
    'TOP 10 · NASDAQ-100': 'Top 10 · Nasdaq-100',
    'TOP 10 · DOW JONES': 'Top 10 · Dow Jones',
    'NEUE JAHRESHOCHS': 'Neue Jahreshochs',
    'DIE ENTWICKLUNG': 'Die Entwicklung',
    'UMSATZ WÄCHST STARK': 'Umsatz wächst stark',
    'GEWINNE BESCHLEUNIGEN': 'Gewinne beschleunigen',
    'TOP 10 · CASHFLOW-MASCHINEN': 'Top 10 · Cashflow-Maschinen',
    'QUALITÄT + WACHSTUM': 'Qualität + Wachstum',
    'MARGEN WERDEN STÄRKER': 'Margen werden stärker',
    'KÜNSTLICHE INTELLIGENZ': 'Künstliche Intelligenz',
    'GERADE IN BEWEGUNG': 'Gerade in Bewegung',
    'SEIT MONATEN IM AUFWIND': 'Seit Monaten im Aufwind',
    'LANGFRISTIGE COMPOUNDER': 'Langfristige Compounder',
    'DEM MARKT VORAUS': 'Dem Markt voraus',
    'DIE STÄRKSTEN JE BRANCHE': 'Die stärksten je Branche',
    'TECHNOLOGIE': 'Technologie',
    'GESUNDHEIT': 'Gesundheit',
    'QUALITÄT ZUM VERNÜNFTIGEN PREIS': 'Qualität zum vernünftigen Preis',
    'ROBOTIK & AUTOMATION': 'Robotik & Automation',
    'COMEBACK?': 'Comeback?',
    'FUNDAMENTALE TURNAROUNDS': 'Fundamentale Turnarounds',
    'AUTOS & MOBILITÄT': 'Autos & Mobilität',
    'ENERGIE': 'Energie',
    'FINANZEN': 'Finanzen',
    'KONSUM': 'Konsum',
    'STARKE BILANZ + WACHSTUM': 'Starke Bilanz + Wachstum',
    'STABILE AUFWÄRTSTRENDS': 'Stabile Aufwärtstrends',
    'UNTER DEM RADAR': 'Unter dem Radar',
    'PROFITABLES WACHSTUM': 'Profitables Wachstum'
  };
  function title(text) { return text ? (Object.prototype.hasOwnProperty.call(titles, text) ? titles[text] : text) : 'Aktien entdecken'; }
  function bindArtworkCaption(media, caption, card, ctx) {
    var observer;
    function update() {
      var svg = media.querySelector('svg.dx-art');
      if (!svg) { caption.textContent = 'Kursverlauf wird geladen …'; return false; }
      var description = svg.getAttribute('aria-label') || '';
      var priceCaption = description.match(/Kursverlauf über [^,]+, Tagesschlusskurse, Stand [^,]+/);
      caption.textContent = priceCaption ? priceCaption[0] : 'Renditen über 1, 3, 6 und 12 Monate · kein Kursverlauf';
      if (svg.querySelector('.dx-art-none')) caption.textContent = 'Keine Kursreihe oder Renditen verfügbar';
      var renderedCard = card, series = card.priceSeries;
      var cached = series && series.path && D.SeriesLoader && D.SeriesLoader.peek(series.path);
      if (cached) renderedCard = Object.assign({}, card, { priceSeries: D.SeriesLoader.merge(series, cached) });
      var rendered = D.Artwork.verlauf(renderedCard, '1J');
      var values = rendered && rendered.werte.filter(function (v) { return typeof v === 'number' && Number.isFinite(v); });
      // Visual direction only: no metric or ranking is recomputed.
      if (!values || values.length < 2 || values[0] === values[values.length - 1] || !priceCaption) svg.setAttribute('data-direction', 'neutral');
      if (observer) observer.disconnect();
      return true;
    }
    // Inline series settle synchronously; only lazy series need an observer.
    if (!update() && global.MutationObserver) {
      observer = new MutationObserver(update);
      observer.observe(media, { childList: true, subtree: true });
      ctx.artworkDisposers.push(function () { observer.disconnect(); });
    }
  }
  function stock(card, ctx, options) {
    options = options || {};
    var plain = D.Cards.klartext(card, options.rowId) || card.plain || {};
    var a = link('', '#/s/' + ctx.universeId + '/' + encodeURIComponent(card.symbol), 'v2-stock' + (options.hero ? ' v2-stock-hero' : ''));
    a.setAttribute('data-symbol', card.symbol);
    if (options.rank) { var rank = node('span', 'v2-stock-rank', String(options.rank).padStart(2, '0')); rank.setAttribute('aria-label', 'Rang ' + options.rank); a.appendChild(rank); }
    var copy = node('div', 'v2-stock-copy');
    copy.appendChild(node('span', 'v2-stock-symbol', card.symbol + (card.was ? ' / ' + card.was : '')));
    copy.appendChild(node(options.hero ? 'h2' : 'h3', 'v2-stock-name', card.companyName || card.symbol));
    if (plain.zahl) {
      var number = node('div', 'v2-stock-performance');
      number.appendChild(node('strong', plain.zahl.ton || '', plain.zahl.wert));
      number.appendChild(node('span', '', plain.zahl.label)); copy.appendChild(number);
    }
    if (plain.story) copy.appendChild(node('p', 'v2-stock-why', plain.story));
    if (options.hero) copy.appendChild(node('span', 'v2-stock-cta', 'Aktie entdecken ↗'));
    a.appendChild(copy);
    // The existing renderer owns series selection and semantic chart colors.
    var media = D.Cards.lazyArtwork(card, { width: options.hero ? 800 : 380, height: options.hero ? 260 : 150, range: '1J', live: false, ticker: false, scale: 'hero' });
    a.appendChild(media);
    var caption = node('span', 'v2-stock-caption'); a.appendChild(caption);
    bindArtworkCaption(media, caption, card, ctx);
    if (card.hook && card.hook.text) a.appendChild(node('p', 'v2-stock-hook', card.hook.text));
    if (!options.hero) a.appendChild(node('span', 'v2-stock-cta', 'Entdecken ↗'));
    return a;
  }
  function rail(surface, ctx, index) {
    var archetype = surface.index ? 'index' : surface.type === 'theme' ? 'theme' : surface.type === 'ranking' ? 'ranking' : ['growth','cashflow','compounder'].indexOf(surface.world) >= 0 ? 'fundamental' : index % 3 === 0 ? 'wide' : 'performance';
    var section = node('section', 'v2-world v2-world-' + archetype);
    section.dataset.archetype = archetype;
    section.dataset.surface = surface.id; section.dataset.surfaceType = surface.type;
    section.dataset.world = surface.world || 'default';
    var header = node('div', 'v2-world-head'), intro = node('div', '');
    intro.appendChild(node('span', 'v2-eyebrow', surface.type === 'theme' ? 'Themenwelt' : surface.index ? 'Die großen Indizes' : surface.type === 'ranking' ? 'Das Ranking entdecken' : 'Neue Perspektiven'));
    intro.appendChild(node('h2', '', title(surface.title)));
    if (surface.subtitle) intro.appendChild(node('p', 'v2-world-subtitle', surface.subtitle));
    if (surface.editorial) intro.appendChild(node('p', 'v2-world-evidence', 'Redaktionelle Themenzuordnung'));
    if (surface.index && surface.index.asOf) intro.appendChild(node('p', 'v2-world-evidence', 'Mitglieder laut ' + (surface.index.proxy && surface.index.proxy.etf ? 'ETF-Bestand ' + surface.index.proxy.etf : 'Indexeigentümer') + ' · ' + D.Cards.dateShort(surface.index.asOf)));
    header.appendChild(intro);
    if (surface.href) header.appendChild(link('Alle ansehen ↗', surface.href, 'v2-world-more'));
    section.appendChild(header);
    var track = el('div', { class: 'v2-track' + (surface.type === 'ranking' ? ' v2-track-ranking' : '') + (index % 4 === 2 ? ' v2-track-wide' : ''), role: 'list', 'aria-label': title(surface.title) });
    (surface.cards || []).forEach(function (card, i) { var item = node('div', 'v2-track-item'); item.setAttribute('role', 'listitem'); item.appendChild(stock(card, ctx, { rowId: surface.rowId, rank: surface.type === 'ranking' ? i + 1 : null })); track.appendChild(item); });
    section.appendChild(D.Cards.withRailNav(track, { label: surface.title, universeId: ctx.universeId }));
    return section;
  }
  function story(surface, ctx) {
    var card = surface.cards[0], rows = (surface.compare && surface.compare.rows || []).filter(function (r) { return r.then && r.now && Number.isFinite(r.then.value) && Number.isFinite(r.now.value); });
    // Signed comparisons stay with the canonical renderer and its zero baseline.
    if (rows.some(function (r) { return r.then.value < 0 || r.now.value < 0; })) return D.Surfaces.render(surface, ctx);
    if (!rows.length) return D.Surfaces.render(surface, ctx);
    var section = node('section', 'v2-business-story'); section.dataset.archetype = 'business-story';
    section.appendChild(node('p', 'v2-eyebrow', 'Hinter dem Kurs · Die Unternehmensentwicklung'));
    section.appendChild(node('h2', '', card.companyName || card.symbol));
    var tabs = el('div', { class: 'v2-story-tabs', role: 'tablist', 'aria-label': 'Unternehmenskennzahl' });
    var panel = el('div', { class: 'v2-story-panel', role: 'tabpanel', id: 'v2-story-' + surface.id });
    function fmt(row, value) { if (row.kind === 'margin') return (value * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %'; return value.toLocaleString('de-DE', { notation: 'compact', maximumFractionDigits: 1 }) + (row.unit === 'USD' ? ' $' : row.unit === 'USD/shares' ? ' $ je Aktie' : ''); }
    function select(index) {
      var row = rows[index]; panel.replaceChildren();
      Array.from(tabs.children).forEach(function (button, i) { button.setAttribute('aria-selected', String(i === index)); button.tabIndex = i === index ? 0 : -1; });
      panel.setAttribute('aria-labelledby', 'v2-story-tab-' + surface.id + '-' + index);
      var statements = surface.story && surface.story.statements || [], statement = statements.find(function (s) { var e = s.evidence; return e && e.metric === row.id && e.periodStart && e.periodEnd && e.periodStart.fy === row.then.fy && e.periodEnd.fy === row.now.fy && e.valueStart === row.then.value && e.valueEnd === row.now.value; });
      if (statement) panel.appendChild(node('p', 'v2-story-statement', statement.text));
      var bars = node('div', 'v2-story-bars'), scale = Math.max(Math.abs(row.then.value), Math.abs(row.now.value), 1);
      ['then', 'now'].forEach(function (key) { var datum = row[key], column = node('div', 'v2-story-column'); column.appendChild(node('strong', '', fmt(row, datum.value))); var bar = node('div', 'v2-story-bar'); bar.style.height = Math.max(3, Math.abs(datum.value) / scale * 190) + 'px'; bar.setAttribute('aria-hidden', 'true'); if (datum.value < 0) bar.classList.add('is-negative'); column.appendChild(bar); column.appendChild(node('span', '', String(datum.fy))); bars.appendChild(column); });
      panel.appendChild(bars);
      panel.appendChild(node('p', 'v2-story-evidence', 'Vergleich zweier Geschäftsjahre · ' + row.label + ' · ' + (row.unit || '') + ' · SEC · Stand ' + D.Cards.dateShort(row.evidence && row.evidence.asOf || surface.story && surface.story.asOf)));
    }
    rows.forEach(function (row, index) { var button = el('button', { class: 'v2-story-tab', type: 'button', role: 'tab', id: 'v2-story-tab-' + surface.id + '-' + index, 'aria-controls': panel.id, text: row.label }); button.addEventListener('click', function () { select(index); }); button.addEventListener('keydown', function (event) { var next = event.key === 'ArrowRight' ? (index + 1) % rows.length : event.key === 'ArrowLeft' ? (index + rows.length - 1) % rows.length : event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : null; if (next !== null) { event.preventDefault(); select(next); tabs.children[next].focus(); } }); tabs.appendChild(button); });
    section.appendChild(tabs); section.appendChild(panel); select(0);
    section.appendChild(link('Das Unternehmen entdecken ↗', '#/s/' + ctx.universeId + '/' + encodeURIComponent(card.symbol), 'v2-story-link'));
    return section;
  }
  async function render(root, ctx) {
    ctx = Object.assign({}, ctx, { artworkDisposers: [] });
    var page = node('div', 'v2-home'); root.appendChild(page);
    var intro = node('header', 'v2-intro');
    intro.appendChild(el('h1', {}, [document.createTextNode('Aktien entdecken.'), node('span', '', 'Mehr sehen. Mehr verstehen.')]));
    var search = el('button', { class: 'v2-search-prompt', type: 'button', 'aria-label': 'Unternehmen oder Symbol suchen' }, [node('span', '', '⌕'), node('span', '', 'Unternehmen oder Symbol suchen'), node('span', 'v2-search-arrow', '↗')]);
    search.addEventListener('click', ctx.openSearch); intro.appendChild(search); page.appendChild(intro);
    var body = node('div', 'v2-journey'); page.appendChild(body);
    var loading = node('p', 'v2-load-state', 'Aktien werden geladen …'); loading.setAttribute('role', 'status'); body.appendChild(loading);
    var home = (ctx.meta.home || []).find(function (h) { return h.universeId === ctx.universeId; });
    if (!home || !home.chunks || !home.chunks.length) { loading.textContent = 'Die Entdeckungsseite ist momentan nicht verfügbar. Die Suche bleibt erreichbar.'; return; }
    var seen = new Set(), count = 0, observer;
    function active() { return page.isConnected; }
    function draw(surface) {
      var view;
      if (surface.type === 'hero') {
        view = node('section', 'v2-spotlight'); view.dataset.archetype = 'cinematic';
        view.appendChild(node('p', 'v2-eyebrow', 'Im Blick · Discover-Auswahl' + ((surface.cards || [])[0] && surface.cards[0].asOf ? ' · ' + D.Cards.dateShort(surface.cards[0].asOf) : '')));
        var track = el('div', { class: 'v2-hero-track', role: 'list', 'aria-label': 'Aktien im Blick' });
        (surface.cards || []).forEach(function (card) { var item = node('div', 'v2-hero-item'); item.setAttribute('role', 'listitem'); item.appendChild(stock(card, ctx, { hero: true })); track.appendChild(item); });
        view.appendChild(D.Cards.withRailNav(track, { label: 'Aktien im Blick', universeId: ctx.universeId }));
        var flow = node('div', 'v2-discovery-flow'); flow.appendChild(node('p', 'v2-swipe-hint', '← Wischen. Nächste Aktie. →')); flow.appendChild(link('Vollbild entdecken ↗', '#/einzeln/' + ctx.universeId, 'v2-feed-entry')); view.appendChild(flow);
      } else if (['row', 'ranking', 'theme'].indexOf(surface.type) >= 0 && (surface.cards || []).length) view = rail(surface, ctx, count++);
      else if (surface.type === 'featured-card' && (surface.cards || []).length) {
        view = node('section', 'v2-feature'); view.appendChild(node('p', 'v2-eyebrow', title(surface.kicker || surface.title))); view.appendChild(stock(surface.cards[0], ctx, { hero: true, rowId: surface.rowId }));
      } else if (surface.type === 'story' && (surface.cards || []).length) view = story(surface, ctx);
      else view = D.Surfaces.render(surface, ctx);
      if (view) { view.dataset.surface = surface.id; view.dataset.surfaceType = surface.type; if (!view.dataset.archetype) view.dataset.archetype = surface.type; view.classList.add('in'); body.appendChild(view); }
    }
    function finish() {
      var end = node('section', 'v2-finish'); end.appendChild(node('p', 'v2-eyebrow', 'Die nächste Perspektive wartet'));
      end.appendChild(node('h2', '', 'Eine Aktie. Deine volle Aufmerksamkeit.'));
      end.appendChild(link('Einzeln entdecken ↗', '#/einzeln/' + ctx.universeId, 'v2-finish-link')); body.appendChild(end);
    }
    function next(url) {
      var button = el('button', { class: 'v2-load-more', type: 'button', text: 'Weitere Aktienwelten entdecken' }); body.appendChild(button);
      var busy = false;
      async function load() {
        if (busy || !active()) return; busy = true; button.disabled = true; button.textContent = 'Weitere Welten werden geladen …';
        try {
          if (seen.has(url)) { button.remove(); return; }
          var chunk = await S.loadJSON(url); if (!active()) return;
          seen.add(url); button.remove(); (chunk.surfaces || []).forEach(draw);
          if (chunk.next) next(chunk.next); else finish();
        } catch (error) { if (active()) { button.disabled = false; button.textContent = 'Weitere Welten konnten nicht geladen werden · Erneut versuchen'; busy = false; } }
      }
      button.addEventListener('click', load);
      if (global.IntersectionObserver) { observer = new IntersectionObserver(function (entries, io) { if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); load(); } }, { rootMargin: '600px' }); observer.observe(button); }
    }
    try {
      var first = await S.loadJSON(home.chunks[0]); if (!active()) return;
      seen.add(home.chunks[0]); loading.remove(); (first.surfaces || []).forEach(draw);
      if (first.next) next(first.next); else finish();
    } catch (error) { loading.textContent = 'Die Aktienwelten konnten nicht geladen werden.'; var retry = el('button', { type: 'button', text: 'Erneut versuchen', class: 'v2-load-more' }); retry.addEventListener('click', function () { page.remove(); render(root, ctx); }); body.appendChild(retry); }
    return function () { if (observer) observer.disconnect(); ctx.artworkDisposers.forEach(function (dispose) { dispose(); }); ctx.artworkDisposers.length = 0; };
  }
  V.Home = { render: render };
})(window);
