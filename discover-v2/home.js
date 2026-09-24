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
  var rangeLabels = { '1M': '1 Monat', '3M': '3 Monate', '6M': '6 Monate', '1J': '1 Jahr' };
  var freshnessLabels = { LIVE: 'Realtime', LAST_SESSION: 'Letzte Sitzung', STALE: 'Nicht aktuell', UNAVAILABLE: 'Nicht verfügbar' };
  function bindArtworkCaption(media, caption, card, ctx, range) {
    var observer;
    function update() {
      var svg = media.querySelector('svg.dx-art');
      var renderedCard = card, series = card.priceSeries;
      var cached = series && series.path && D.SeriesLoader && D.SeriesLoader.peek(series.path);
      if (cached) renderedCard = Object.assign({}, card, { priceSeries: D.SeriesLoader.merge(series, cached) });
      var rendered = D.Artwork.verlauf(renderedCard, range);
      var liveState = media.getAttribute('data-freshness');
      var sessionDate = media.getAttribute('data-session');
      if (media.hasAttribute('data-live')) {
        caption.textContent = 'Tagesverlauf · ' + (freshnessLabels[liveState] || 'Sitzungsstand') +
          (sessionDate ? ' · ' + D.Cards.dateShort(sessionDate) : '');
      } else if (rendered) {
        caption.textContent = 'Kursverlauf · ' + (rangeLabels[rendered.range] || rendered.range) +
          ' · Stand ' + D.Cards.dateShort(rendered.asOf) + ' · Tagesschlusskurse';
      } else if (svg && svg.querySelector('.dx-art-none')) {
        caption.textContent = 'Keine Kursreihe oder Renditen verfügbar';
      } else {
        caption.textContent = 'Renditen über 1, 3, 6 und 12 Monate · kein Kursverlauf';
      }
      if (!svg) return false;
      var values = rendered && rendered.werte.filter(function (v) { return typeof v === 'number' && Number.isFinite(v); });
      // Visual direction only: no metric or ranking is recomputed.
      if (!media.hasAttribute('data-live') && (!values || values.length < 2 || values[0] === values[values.length - 1])) svg.setAttribute('data-direction', 'neutral');
      // A lazy historical chart may be replaced by the existing intraday
      // client moments later. Keep watching that bounded host until the
      // structured live state arrives; static inline charts need no observer.
      if (observer && (media.hasAttribute('data-live') || !media.hasAttribute('data-series'))) observer.disconnect();
      return true;
    }
    // Inline series settle synchronously; only lazy series need an observer.
    if (!update() && global.MutationObserver) {
      observer = new MutationObserver(update);
      observer.observe(media, { childList: true, subtree: true });
      ctx.artworkDisposers.push(function () { observer.disconnect(); });
    }
  }
  var tones = ['green', 'blue', 'violet', 'amber', 'teal', 'rose'];
  function stock(card, ctx, options) {
    options = options || {};
    if (!options.hero) return tile(card, ctx, options);
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
    var chartRange = options.range || '1J';
    var media = D.Cards.lazyArtwork(card, { width: options.hero ? 800 : 380, height: options.hero ? 260 : 150, range: chartRange, live: options.live !== false, ticker: false, scale: 'hero' });
    a.appendChild(media);
    var caption = node('span', 'v2-stock-caption'); a.appendChild(caption);
    bindArtworkCaption(media, caption, card, ctx, chartRange);
    if (card.hook && card.hook.text) a.appendChild(node('p', 'v2-stock-hook', card.hook.text));
    if (!options.hero) a.appendChild(node('span', 'v2-stock-cta', 'Entdecken ↗'));
    return a;
  }
  /* Kompakte Aktien-Kachel: mehrere pro Bildschirm, seitlich wischbar.
     Werte, Klartext, Kursverlauf und Frische stammen unveraendert aus den
     kanonischen Renderern; die Kachel ordnet sie nur dichter an. */
  function tile(card, ctx, options) {
    options = options || {};
    var plain = D.Cards.klartext(card, options.rowId) || card.plain || {};
    var a = link('', '#/s/' + ctx.universeId + '/' + encodeURIComponent(card.symbol), 'v2-stock v2-tile' + (options.large ? ' v2-tile-lg' : ''));
    a.setAttribute('data-symbol', card.symbol);
    a.setAttribute('data-tone', tones[(options.position || 0) % tones.length]);
    var head = node('div', 'v2-tile-head'), copy = node('div', 'v2-stock-copy');
    var id = node('div', 'v2-tile-id');
    id.appendChild(node('span', 'v2-stock-symbol', card.symbol + (card.was ? ' · ' + card.was : '')));
    id.appendChild(node(options.large ? 'h2' : 'h3', 'v2-stock-name', card.companyName || card.symbol));
    head.appendChild(id);
    if (options.rank) { var rank = node('span', 'v2-stock-rank', String(options.rank).padStart(2, '0')); rank.setAttribute('aria-label', 'Rang ' + options.rank); head.appendChild(rank); }
    copy.appendChild(head);
    if (plain.zahl) {
      var number = node('div', 'v2-stock-performance');
      number.appendChild(node('strong', plain.zahl.ton || '', plain.zahl.wert));
      number.appendChild(node('span', '', plain.zahl.label)); copy.appendChild(number);
    }
    if (plain.story) copy.appendChild(node('p', 'v2-stock-why', plain.story));
    a.appendChild(copy);
    var chartRange = options.range || '1J';
    var media = D.Cards.lazyArtwork(card, { width: options.large ? 420 : 300, height: options.large ? 120 : 90, range: chartRange, live: options.live !== false, ticker: false, scale: 'hero' });
    a.appendChild(media);
    var caption = node('span', 'v2-stock-caption'); a.appendChild(caption);
    bindArtworkCaption(media, caption, card, ctx, chartRange);
    // Kurs der Karte mit ihrem Datum: Der Chart darueber kann eine neuere
    // Sitzung zeigen, eine Tagesveraenderung ohne Datum wuerde dem widersprechen.
    var price = D.Cards.valueOf(card.price);
    var foot = node('div', 'v2-tile-foot');
    if (typeof price === 'number' && Number.isFinite(price)) {
      foot.appendChild(node('span', 'v2-tile-price', D.Cards.money(price, card.asOf)));
      if (card.asOf) { var asof = node('span', 'v2-tile-asof', D.Cards.dateShort(card.asOf).slice(0, 6)); asof.title = 'Schlusskurs vom ' + D.Cards.dateShort(card.asOf); foot.appendChild(asof); }
    }
    foot.appendChild(node('span', 'v2-stock-cta', '↗'));
    a.appendChild(foot);
    return a;
  }
  /* ---------- Themenwelten ---------- */
  var T = function () { return V.Themes; };
  function themeVisual(theme, cls) {
    var art = node('div', cls || 'v2-theme-art');
    art.style.setProperty('--tone', theme.tone);
    if (theme.photo) {
      var img = el('img', { src: theme.photo, alt: '', loading: 'lazy', decoding: 'async', width: '1672', height: '941' });
      img.addEventListener('error', function () { img.remove(); art.classList.add('is-empty'); });
      art.appendChild(img);
    } else art.classList.add('is-empty');
    art.setAttribute('aria-hidden', 'true');
    return art;
  }
  function themeTile(theme, ctx) {
    var count = T().count(theme, ctx.meta, ctx.universeId);
    var a = link('', T().href(theme), 'v2-theme-tile');
    a.dataset.group = theme.group; a.dataset.theme = theme.slug;
    a.style.setProperty('--tone', theme.tone);
    a.appendChild(themeVisual(theme));
    var copy = node('div', 'v2-theme-tile-copy');
    copy.appendChild(node('h3', '', theme.title));
    copy.appendChild(node('p', '', theme.line));
    var foot = node('div', 'v2-theme-tile-foot');
    foot.appendChild(node('span', 'v2-theme-count', count ? count + ' Aktien' : 'In Vorbereitung'));
    foot.appendChild(node('span', 'v2-theme-go', '→'));
    copy.appendChild(foot); a.appendChild(copy);
    a.setAttribute('aria-label', theme.title + ' – ' + theme.short + (count ? ', ' + count + ' Aktien' : ', in Vorbereitung'));
    return a;
  }
  function themeBanner(theme, options) {
    options = options || {};
    var box = node(options.tag || 'div', 'v2-theme-banner' + (options.page ? ' v2-theme-banner-page' : ''));
    box.style.setProperty('--tone', theme.tone);
    box.appendChild(themeVisual(theme, 'v2-theme-banner-art'));
    var copy = node('div', 'v2-theme-banner-copy');
    copy.appendChild(node('span', 'v2-eyebrow', options.eyebrow || 'Themenwelt'));
    copy.appendChild(node(options.page ? 'h1' : 'h2', '', options.title || theme.title));
    copy.appendChild(node('p', 'v2-theme-banner-lead', options.subtitle || (theme.short + ' — ' + theme.line)));
    if (options.evidence) copy.appendChild(node('p', 'v2-world-evidence', options.evidence));
    if (options.href) copy.appendChild(link(options.cta || 'Themenwelt entdecken →', options.href, 'v2-pill v2-pill-light'));
    box.appendChild(copy);
    return box;
  }
  function themesRail(ctx) {
    var section = node('section', 'v2-world v2-themes');
    section.dataset.archetype = 'themes'; section.dataset.block = 'themenwelten';
    var header = node('div', 'v2-world-head'), intro = node('div', '');
    intro.appendChild(node('h2', '', 'Themenwelten'));
    intro.appendChild(node('p', 'v2-world-subtitle', 'Megatrends heute. Chancen für morgen. ' + T().all.length + ' Welten zum Entdecken.'));
    header.appendChild(intro); header.appendChild(link('Alle Themenwelten →', '#/welten', 'v2-world-more'));
    section.appendChild(header);
    var track = el('div', { class: 'v2-track v2-theme-track', role: 'list', 'aria-label': 'Themenwelten' });
    T().all.forEach(function (theme) { var item = node('div', 'v2-track-item v2-theme-item'); item.setAttribute('role', 'listitem'); item.dataset.group = theme.group; item.appendChild(themeTile(theme, ctx)); track.appendChild(item); });
    section.appendChild(D.Cards.withRailNav(track, { label: 'Themenwelten', universeId: ctx.universeId }));
    return section;
  }
  function archetypeFor(surface, index) {
    if (surface.index) return 'index';
    if (surface.type === 'theme') return 'theme';
    if (surface.type === 'ranking') return surface.world === 'cashflow' ? 'ranking-ledger' : 'ranking';
    if (['growth', 'cashflow'].indexOf(surface.world) >= 0) return 'fundamental';
    if (surface.world === 'compounder' || surface.world === 'quality') return 'cinema';
    if (surface.world === 'breakout' || surface.world === 'comeback') return 'spotlight';
    if (surface.world === 'highs' || surface.world === 'momentum') return 'compact';
    if (surface.world === 'strength') return index % 2 ? 'split' : 'performance';
    if (['tech', 'health', 'energy', 'finance', 'consumer'].indexOf(surface.world) >= 0) return 'sector';
    return index % 3 === 0 ? 'wide' : index % 3 === 1 ? 'performance' : 'compact';
  }
  function rail(surface, ctx, index) {
    var archetype = archetypeFor(surface, index);
    var section = node('section', 'v2-world v2-world-' + archetype);
    section.dataset.archetype = archetype;
    section.dataset.surface = surface.id; section.dataset.surfaceType = surface.type;
    section.dataset.world = surface.world || 'default'; section.dataset.sequence = String(index + 1);
    var theme = surface.type === 'theme' && T() ? T().byRow(surface.rowId) : null;
    if (theme) {
      section.appendChild(themeBanner(theme, { title: title(surface.title), subtitle: surface.subtitle || theme.line, href: T().href(theme),
        evidence: surface.editorial ? 'Redaktionelle Themenzuordnung' : null }));
    } else {
      var header = node('div', 'v2-world-head'), intro = node('div', '');
      if (surface.type === 'theme') intro.appendChild(node('span', 'v2-eyebrow', 'Themenwelt'));
      intro.appendChild(node('h2', '', title(surface.title)));
      if (surface.subtitle) intro.appendChild(node('p', 'v2-world-subtitle', surface.subtitle));
      if (surface.editorial) intro.appendChild(node('p', 'v2-world-evidence', 'Redaktionelle Themenzuordnung'));
      if (surface.index && surface.index.asOf) intro.appendChild(node('p', 'v2-world-evidence', 'Mitglieder laut ' + (surface.index.proxy && surface.index.proxy.etf ? 'ETF-Bestand ' + surface.index.proxy.etf : 'Indexeigentümer') + ' · ' + D.Cards.dateShort(surface.index.asOf)));
      header.appendChild(intro);
      if (surface.href) header.appendChild(link('Alle ansehen →', surface.href, 'v2-world-more'));
      section.appendChild(header);
    }
    var track = el('div', { class: 'v2-track' + (surface.type === 'ranking' ? ' v2-track-ranking' : ''), role: 'list', 'aria-label': title(surface.title) });
    (surface.cards || []).forEach(function (card, i) { var item = node('div', 'v2-track-item'); item.setAttribute('role', 'listitem'); item.appendChild(stock(card, ctx, { rowId: surface.rowId, rank: surface.type === 'ranking' ? i + 1 : null, range: surface.microRange || '1J', position: i })); track.appendChild(item); });
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
    var introCopy = node('div', 'v2-intro-copy');
    introCopy.appendChild(node('p', 'v2-intro-kicker', 'Entdecken. Verstehen. Investieren.'));
    introCopy.appendChild(el('h1', {}, [el('span', { class: 'v2-intro-brand' }, [document.createTextNode('VISION UNIVERSE'), el('sup', { text: '®' })]), document.createTextNode(' '), node('span', 'v2-intro-product', 'Discovery')]));
    introCopy.appendChild(el('p', { class: 'v2-intro-lead' }, [document.createTextNode('Neue Perspektiven. Starke Unternehmen. '), el('br'), document.createTextNode('Aktien entdecken und die Märkte von morgen klarer sehen.')]));
    var actions = node('div', 'v2-intro-actions');
    actions.appendChild(link('Jetzt entdecken →', '#/einzeln/' + ctx.universeId, 'v2-pill v2-pill-dark v2-intro-cta'));
    actions.appendChild(link('Themenwelten', '#/welten', 'v2-pill v2-pill-ghost'));
    introCopy.appendChild(actions);
    var search = el('button', { class: 'v2-search-prompt', type: 'button', 'aria-label': 'Unternehmen oder Symbol suchen' }, [node('span', '', '⌕'), node('span', '', 'Unternehmen oder Symbol suchen'), node('span', 'v2-search-arrow', '↗')]);
    search.addEventListener('click', ctx.openSearch); introCopy.appendChild(search);
    intro.appendChild(introCopy);
    // Hero-Bild 16:9 (1672×941): die Flaeche hat dasselbe Seitenverhaeltnis, es wird nichts beschnitten.
    var visual = node('div', 'v2-intro-visual'); visual.setAttribute('aria-hidden', 'true');
    visual.appendChild(el('img', { src: '/assets/themen/00-discovery-hero.webp', alt: '', width: '1672', height: '941', decoding: 'async', fetchpriority: 'high' }));
    visual.appendChild(node('p', 'v2-intro-tag', 'Bessere Entscheidungen für eine hellere Zukunft.'));
    intro.appendChild(visual);
    page.appendChild(intro);
    // Themenwelten mit Fotos direkt unter dem Einstieg - vor den Aktien-Reihen.
    if (T()) page.appendChild(themesRail(ctx));
    var body = node('div', 'v2-journey'); page.appendChild(body);
    var loading = node('p', 'v2-load-state', 'Aktien werden geladen …'); loading.setAttribute('role', 'status'); body.appendChild(loading);
    var home = (ctx.meta.home || []).find(function (h) { return h.universeId === ctx.universeId; });
    if (!home || !home.chunks || !home.chunks.length) { loading.textContent = 'Die Entdeckungsseite ist momentan nicht verfügbar. Die Suche bleibt erreichbar.'; return; }
    var seen = new Set(), count = 0, observer;
    function active() { return page.isConnected; }
    function draw(surface) {
      var view;
      if (surface.type === 'hero') {
        view = node('section', 'v2-spotlight v2-world'); view.dataset.archetype = 'cinematic';
        var head = node('div', 'v2-world-head'), hi = node('div', '');
        hi.appendChild(node('h2', '', 'Im Blick'));
        hi.appendChild(node('p', 'v2-world-subtitle', 'Die Discover-Auswahl' + ((surface.cards || [])[0] && surface.cards[0].asOf ? ' · Stand ' + D.Cards.dateShort(surface.cards[0].asOf) : '') + ' · Wischen für die nächste Aktie'));
        head.appendChild(hi); head.appendChild(link('Vollbild entdecken →', '#/einzeln/' + ctx.universeId, 'v2-world-more v2-feed-entry'));
        view.appendChild(head);
        var track = el('div', { class: 'v2-hero-track v2-track', role: 'list', 'aria-label': 'Aktien im Blick' });
        (surface.cards || []).forEach(function (card, i) { var item = node('div', 'v2-hero-item v2-track-item'); item.setAttribute('role', 'listitem'); item.appendChild(tile(card, ctx, { large: true, position: i + 1 })); track.appendChild(item); });
        view.appendChild(D.Cards.withRailNav(track, { label: 'Aktien im Blick', universeId: ctx.universeId }));
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
  V.Home = { render: render, title: title, tile: tile, themeTile: themeTile, themeBanner: themeBanner };
})(window);
