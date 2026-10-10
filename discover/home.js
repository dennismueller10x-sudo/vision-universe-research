(function (global) {
  'use strict';
  var V = (global.VUDiscover = global.VUDiscover || {}).Views = global.VUDiscover.Views || {};
  var D = global.VUDiscover, S = global.QuantShell, el = S.el;
  function node(tag, cls, text) { return el(tag, { class: cls, text: text }); }
  function link(text, href, cls) { return el('a', { class: cls, href: href, text: text }); }
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
  var perspectiveImages = {
    'profitables-wachstum':'profitables-wachstum', 'umsatz-waechst-stark':'umsatz-waechst-stark',
    'gewinne-beschleunigen':'gewinne-beschleunigen', 'cashflow-maschinen':'cashflow-maschinen',
    'margen-werden-staerker':'margen-werden-staerker', 'langfristige-compounder':'langfristige-compounder',
    'relative-strength':'dem-markt-voraus', 'comeback':'comeback',
    'fundamentale-turnarounds':'fundamentale-turnarounds', 'starke-bilanz-wachstum':'starke-bilanz-wachstum',
    'trend-quality':'stabile-aufwaertstrends', 'ueberraschungen':'unter-dem-radar',
    'momentum-leaders':'seit-monaten-im-aufwind', 'breakout-watch':'gerade-in-bewegung',
    'new-52-week-highs':'neue-jahreshochs', 'sector-leaders':'die-staerksten-je-branche',
    'bekannte-namen':'bekannte-namen-in-bewegung', 'market-leaders':'die-staerksten-aktien',
    'top-10':'momentum-leader', 'megatrends':'megatrends',
    'sp500-staerkste':'sp500-staerkste', 'djia-staerkste':'djia-staerkste',
    'ndx-staerkste':'ndx-staerkste', 'qualitaet-zum-preis':'qualitaet-zum-preis',
    'qualitaet-wachstum':'qualitaet-wachstum'
  };
  function perspectiveImage(rowId) { return perspectiveImages[rowId] ? '/assets/discover-perspektiven/' + perspectiveImages[rowId] + '.jpeg' : null; }
  function strategyLink(surface,ctx){
    var href=surface.href||('#/c/'+ctx.universeId+'/'+surface.rowId);
    var a=link('',href,'v2-collection-link'),visual=node('span','v2-collection-art');visual.setAttribute('aria-hidden','true');
    var photo=perspectiveImage(surface.rowId||surface.id);
    if(photo){visual.classList.add('has-image');visual.appendChild(el('img',{class:'v2-collection-image',src:photo,alt:'',width:'1254',height:'1254',loading:'lazy',decoding:'async'}));}
    else visual.appendChild(node('span','v2-collection-glyph','↗'));
    visual.appendChild(node('span','v2-collection-art-label',title(surface.title)));
    var copy=node('span','v2-collection-copy');copy.append(node('strong','',title(surface.title)),node('span','',surface.subtitle||'Aktien entdecken'));
    a.append(visual,copy,node('span','v2-collection-arrow','→'));return a;
  }
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
      if (!media.hasAttribute('data-live') && (!values || values.length < 2 || values[0] === values[values.length - 1])) svg.setAttribute('data-direction', 'neutral');
      if (observer && (media.hasAttribute('data-live') || !media.hasAttribute('data-series'))) observer.disconnect();
      return true;
    }
    if (!update() && global.MutationObserver) {
      observer = new MutationObserver(update);
      observer.observe(media, { childList: true, subtree: true });
      ctx.artworkDisposers.push(function () { observer.disconnect(); });
    }
  }
  var tones = ['green', 'blue', 'violet', 'amber', 'teal', 'rose'];
  function tile(card, ctx, options) {
    options = options || {};
    var plain = D.Cards.klartext(card, options.rowId) || card.plain || {};
    var a = link('', card.href || '#/s/' + ctx.universeId + '/' + encodeURIComponent(card.symbol), 'v2-stock v2-tile' + (options.large ? ' v2-tile-lg' : ''));
    a.setAttribute('data-symbol', card.symbol);
    a.setAttribute('data-tone', tones[(options.position || 0) % tones.length]);
    var head = node('div', 'v2-tile-head'), copy = node('div', 'v2-stock-copy');
    if (D.Logos) head.appendChild(D.Logos.mark(card.symbol, { name: card.companyName, size: options.large ? 'md' : 'sm' }));
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
    var stage = node('div', 'v2-tile-stage'); stage.appendChild(media);
    var caption = node('span', 'v2-stock-caption'); stage.appendChild(caption); a.appendChild(stage);
    bindArtworkCaption(media, caption, card, ctx, chartRange);
    var price = D.Cards.valueOf(card.price);
    var foot = node('div', 'v2-tile-foot');
    if (typeof price === 'number' && Number.isFinite(price)) {
      foot.appendChild(node('span', 'v2-tile-price', D.Cards.money(price, card.asOf)));
      if (card.asOf) { var asof = node('span', 'v2-tile-asof', D.Cards.dateShort(card.asOf).slice(0, 6)); asof.title = 'Schlusskurs vom ' + D.Cards.dateShort(card.asOf); foot.appendChild(asof); }
    }
    foot.appendChild(node('span', 'v2-stock-cta', '↗'));
    a.appendChild(foot);
    return D.Featured.compact(card, ctx, a, stage);
  }
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
    section.dataset.archetype = 'themes'; section.dataset.block = 'themenwelten'; section.dataset.surface = 'themenwelten'; section.dataset.surfaceType = 'themes';
    var header = node('div', 'v2-world-head'), intro = node('div', '');
    intro.appendChild(node('h2', '', 'Themenwelten'));
    intro.appendChild(node('p', 'v2-world-subtitle', 'Megatrends heute. Chancen für morgen. ' + T().all.length + ' Welten zum Entdecken.'));
    header.appendChild(intro); header.appendChild(link('Alle Themenwelten →', '#/welten', 'v2-world-more'));
    section.appendChild(header);
    var track = el('div', { class: 'v2-track v2-theme-track', role: 'list', 'aria-label': 'Themenwelten' });
    var featured = ['kuenstliche-intelligenz','halbleiter-chips','erneuerbare-energien','biotechnologie','robotik-automation','cybersecurity','reisen-tourismus','luxus-premium'];
    featured.map(T().bySlug).filter(Boolean).forEach(function (theme) { var item = node('div', 'v2-track-item v2-theme-item'); item.setAttribute('role', 'listitem'); item.dataset.group = theme.group; item.appendChild(themeTile(theme, ctx)); track.appendChild(item); });
    section.appendChild(D.Cards.withRailNav(track, { label: 'Themenwelten', universeId: ctx.universeId }));
    return section;
  }
  function miniLine(points) {
    var last = (points || []).slice(-30).map(function (p) { return Array.isArray(p) ? p[1] : null; }).filter(function (v) { return typeof v === 'number' && Number.isFinite(v); });
    if (last.length < 2) return null;
    var lo = Math.min.apply(null,last), hi = Math.max.apply(null,last), span = hi - lo || 1;
    var path = last.map(function (v,i) { return (i ? 'L' : 'M') + (i * 100 / (last.length - 1)).toFixed(1) + ',' + (28 - (v - lo) / span * 24).toFixed(1); }).join(' ');
    var svg = document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 100 32');svg.setAttribute('role','img');svg.setAttribute('aria-label','Schlusskursverlauf der letzten 30 Handelstage');svg.classList.add('v2-market-spark');
    var line = document.createElementNS('http://www.w3.org/2000/svg','path');line.setAttribute('d',path);svg.appendChild(line);return svg;
  }
  function marketToday(ctx) {
    var section=node('section','v2-market-today v2-world');section.dataset.surface='market-today';
    var head=node('div','v2-world-head'),intro=node('div','');intro.appendChild(node('h2','','Heute bei Vision Universe'));
    intro.appendChild(node('p','v2-world-subtitle','Letzter verfügbarer Handelsstand der großen US-Märkte.'));
    head.append(intro,link('Märkte ansehen →','#/maerkte','v2-world-more'));section.appendChild(head);
    var grid=node('div','v2-market-today-grid');grid.appendChild(node('p','v2-market-loading','Marktdaten werden geladen …'));section.appendChild(grid);
    Promise.all([S.loadJSON('/quant/data/market/multi-asset/snapshot.json'),S.loadJSON('/quant/config/multi-asset.json').catch(function(){return null;})]).then(function(r){
      if(!section.isConnected)return;
      var MA=global.VUMultiAssetContract, M=D.Markets, snap=r[0];grid.replaceChildren();
      ['QQQ','SPY','DIA'].forEach(function(symbol){
        var raw=(snap.instruments||[]).find(function(c){return c.instrument&&c.instrument.symbol===symbol;});if(!raw)return;
        var c=MA&&MA.refresh?MA.refresh(raw,{now:new Date(),calendar:ctx.calendar,config:r[1]||{}}):raw;
        var label=M.kopfText(c),change=M.veraenderungText(c),available=c.quote&&c.quote.state==='AVAILABLE';
        var a=link('','#/maerkte/'+symbol,'v2-market-kpi');
        a.append(node('span','v2-market-name',label.titel),node('span','v2-market-change'+(c.quote.change&&c.quote.change.percent<0?' is-down':''),available?(change||'Keine Veränderung verfügbar'):'Kein aktueller Wert'));
        a.append(node('span','v2-market-fresh',label.klasse+' · '+M.frischeText(c)+(c.quote.asOf?' · '+M.standText(c.quote.asOf):'')));
        grid.appendChild(a);
        if(available&&raw.tracker&&raw.tracker.history&&raw.tracker.history.path){
          S.loadJSON(raw.tracker.history.path).then(function(series){if(a.isConnected){var spark=miniLine(series.points);if(spark)a.insertBefore(spark,a.querySelector('.v2-market-fresh'));}}).catch(function(){});
        }
      });
      if(!grid.children.length)grid.appendChild(node('p','v2-market-loading','Marktstände sind momentan nicht verfügbar.'));
    }).catch(function(){if(section.isConnected)grid.replaceChildren(node('p','v2-market-loading','Marktstände sind momentan nicht verfügbar.'));});
    return section;
  }
  function marketPulse() {
    var section=node('section','v2-pulse-teaser');section.dataset.surface='market-pulse';
    section.dataset.archetype='market';
    var copy=node('div','');copy.append(node('p','v2-eyebrow','Discover · Märkte'),node('h2','','Market Pulse'),node('p','v2-pulse-statement','Wie sieht der Markt gerade insgesamt aus?'));
    copy.appendChild(link('Marktbarometer verstehen →','#/maerkte/einordnung','v2-pill v2-pill-light'));section.appendChild(copy);
    S.loadJSON('/quant/data/market/intelligence/market-pulse.json').then(function(p){
      if(!section.isConnected||!p.environment)return;
      var env=p.environment;copy.querySelector('.v2-pulse-statement').textContent=env.statement||'Das Marktumfeld im Überblick.';
      var state=node('div','v2-pulse-state');state.append(node('span','','Marktumfeld'),node('strong','',env.label||'Nicht bestimmbar'));
      if(p.evaluation&&p.evaluation.dataAsOf)state.append(node('small','','Datenstand '+D.Cards.dateShort(p.evaluation.dataAsOf)));
      section.appendChild(state);
    }).catch(function(){});
    return section;
  }
  var topRows = [
    ['top-10','Momentum'],['top-ndx','Nasdaq 100'],['top-sp500','S&P 500'],
    ['top-djia','Dow Jones'],['bekannte-namen','Bekannte Namen']
  ];
  function topStocks(surfaces,ctx) {
    var section=node('section','v2-top-stocks v2-world');section.dataset.surface='top-aktien';
    section.dataset.archetype='ranking';
    var head=node('div','v2-world-head');head.append(node('h2','','Top-Aktien'),node('p','v2-world-subtitle','Fünf Perspektiven auf Aktien im Discover-Universum.'));
    section.appendChild(head);
    var tabs=el('div',{class:'v2-top-tabs',role:'tablist','aria-label':'Aktienauswahl'}),panels=node('div','v2-top-panels');
    var available=topRows.map(function(spec){return {id:spec[0],label:spec[1],surface:surfaces.find(function(s){return s.id===spec[0];})};}).filter(function(x){return x.surface&&x.surface.cards&&x.surface.cards.length;});
    available.forEach(function(entry,index){
      var id='v2-top-panel-'+entry.id,tab=el('button',{type:'button',role:'tab',id:'v2-top-tab-'+entry.id,'aria-controls':id,text:entry.label});
      var panel=el('div',{class:'v2-top-panel',role:'tabpanel',id:id,'aria-labelledby':tab.id});
      var track=el('div',{class:'v2-track',role:'list','aria-label':entry.label});
      entry.surface.cards.forEach(function(card,i){var item=node('div','v2-track-item');item.setAttribute('role','listitem');item.appendChild(tile(card,ctx,{rowId:entry.surface.rowId,rank:i+1,position:i}));track.appendChild(item);});
      panel.appendChild(D.Cards.withRailNav(track,{label:entry.label,universeId:ctx.universeId}));
      panel.appendChild(link('Alle '+entry.label+' ansehen →',entry.surface.href||('#/c/'+ctx.universeId+'/'+entry.surface.rowId),'v2-world-more'));
      function select(){available.forEach(function(_,i){var on=i===index;tabs.children[i].setAttribute('aria-selected',String(on));tabs.children[i].tabIndex=on?0:-1;panels.children[i].hidden=!on;});
        global.requestAnimationFrame(function(){var visible=panels.children[index].querySelector('.v2-track');if(visible)visible.dispatchEvent(new Event('scroll'));});}
      tab.addEventListener('click',select);
      tab.addEventListener('keydown',function(event){var next=event.key==='ArrowRight'?(index+1)%available.length:event.key==='ArrowLeft'?(index+available.length-1)%available.length:event.key==='Home'?0:event.key==='End'?available.length-1:null;if(next!==null){event.preventDefault();tabs.children[next].click();tabs.children[next].focus();}});
      tabs.appendChild(tab);panels.appendChild(panel);
    });
    section.append(tabs,panels);if(available.length)tabs.firstChild.click();return section;
  }
  function spotlight(surface,ctx) {
    var cards=surface.cards||[],section=node('section','v2-spotlight v2-world');section.dataset.archetype='featured';
    var head=node('div','v2-world-head'),intro=node('div','');intro.append(node('h2','','Im Blick'),node('p','v2-world-subtitle','Ein Unternehmen zuerst. Danach weitere Aktien zum Entdecken.'));
    head.append(intro,link('Vollbild entdecken →','#/einzeln/'+ctx.universeId,'v2-world-more v2-feed-entry'));section.appendChild(head);
    if(!cards.length)return section;
    var featured=node('div','v2-spotlight-featured');featured.appendChild(D.Featured.card(cards[0],ctx));section.appendChild(featured);
    if(cards.length>1){var track=el('div',{class:'v2-hero-track v2-track',role:'list','aria-label':'Weitere Aktien im Blick'});
      cards.slice(1).forEach(function(card,i){var item=node('div','v2-hero-item v2-track-item');item.setAttribute('role','listitem');item.appendChild(tile(card,ctx,{position:i+1}));track.appendChild(item);});
      section.appendChild(D.Cards.withRailNav(track,{label:'Weitere Aktien im Blick',universeId:ctx.universeId}));}
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
    (surface.cards || []).forEach(function (card, i) { var item = node('div', 'v2-track-item'); item.setAttribute('role', 'listitem'); item.appendChild(tile(card, ctx, { rowId: surface.rowId, rank: surface.type === 'ranking' ? i + 1 : null, range: surface.microRange || '1J', position: i })); track.appendChild(item); });
    section.appendChild(D.Cards.withRailNav(track, { label: surface.title, universeId: ctx.universeId }));
    return section;
  }
  function story(surface, ctx) {
    var card = surface.cards && surface.cards[0];
    if (!card || card.symbol !== 'LHX') return D.Surfaces.render(surface, ctx);
    var interlude = node('section', 'v2-motion-interlude');
    interlude.dataset.archetype = 'visual-interlude';
    interlude.append(node('p', 'v2-eyebrow', 'Weiter entdecken'), node('h2', '', 'Neue Perspektiven auf den Markt.'));
    var art = node('div', 'v2-motion-art'); art.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 6; i++) art.appendChild(node('span', 'v2-motion-orbit v2-motion-orbit-' + (i + 1)));
    interlude.append(art, link('Aktien entdecken ↗', '#/einzeln/' + ctx.universeId, 'v2-pill v2-pill-light'));
    return interlude;
  }
  async function render(root, ctx) {
    ctx = Object.assign({}, ctx, { artworkDisposers: [] });
    var page = node('div', 'v2-home'); root.appendChild(page);
    var intro = el('header', { class: 'v2-intro vu-product-hero vu-hero-fidelity', 'data-product': 'discover' });
    intro.appendChild(el('div', { class: 'vu-hero-scene', 'aria-hidden': 'true' }));
    var introCopy = node('div', 'v2-intro-copy vu-product-hero__copy');
    var icon = node('span', 'vu-product-icon vu-product-icon--hero'); icon.setAttribute('aria-hidden', 'true');
    var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), use = document.createElementNS(ns, 'use');
    svg.setAttribute('viewBox', '0 0 24 24'); use.setAttribute('href', '/assets/product-icons.svg#discover'); svg.appendChild(use); icon.appendChild(svg);
    introCopy.appendChild(icon);
    introCopy.appendChild(node('p', 'vu-hero-name', 'Discover'));
    introCopy.appendChild(node('h1', 'vu-product-title vu-hero-headline', 'Sieh den Markt mit anderen Augen.'));
    introCopy.appendChild(node('p', 'v2-intro-lead vu-product-lead vu-hero-description', 'Entdecke Unternehmen, Trends und Themenwelten weltweit.'));
    var actions = node('div', 'v2-intro-actions');
    actions.appendChild(link('Jetzt entdecken →', '#/aktien', 'v2-pill v2-pill-dark v2-intro-cta'));
    actions.appendChild(link('Themenwelten', '#/welten', 'v2-pill v2-pill-ghost'));
    actions.appendChild(link('Märkte', '#/maerkte', 'v2-pill v2-pill-ghost'));
    function searchGlyph(d) {
      var glyph = document.createElementNS(ns, 'svg'), path = document.createElementNS(ns, 'path');
      glyph.setAttribute('viewBox', '0 0 24 24'); glyph.setAttribute('width', '20'); glyph.setAttribute('height', '20'); glyph.setAttribute('aria-hidden', 'true');
      path.setAttribute('d', d); path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '1.8'); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round'); glyph.appendChild(path); return glyph;
    }
    var arrow = node('span', 'v2-search-arrow'); arrow.appendChild(searchGlyph('M5 12h14m-6-6 6 6-6 6'));
    var search = el('button', { class: 'v2-search-prompt', type: 'button', 'aria-label': 'Unternehmen oder Symbol suchen' }, [searchGlyph('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14m9 16-4-4'), node('span', '', 'Unternehmen oder Symbol suchen'), arrow]);
    search.addEventListener('click', ctx.openSearch); introCopy.appendChild(search);
    introCopy.appendChild(actions);
    intro.appendChild(introCopy);
    page.appendChild(intro);
    var body = node('div', 'v2-journey'); page.appendChild(body);
    body.appendChild(marketToday(ctx)); D.GlobalView.home(body,ctx);
    if (T()) body.appendChild(themesRail(ctx));
    var loading = node('p', 'v2-load-state', 'Aktien werden geladen …'); loading.setAttribute('role', 'status'); body.appendChild(loading);
    var home = (ctx.meta.home || []).find(function (h) { return h.universeId === ctx.universeId; });
    if (!home || !home.chunks || !home.chunks.length) { loading.textContent = 'Die Entdeckungsseite ist momentan nicht verfügbar. Die Suche bleibt erreichbar.'; return; }
    var seen = new Set(), count = 0, observer, rankings=[],topRendered=false,pulseRendered=false,collections=null;
    function active() { return page.isConnected; }
    function addCollection(surface){
      if(!collections){
        collections=node('section','v2-collection-directory v2-world');collections.dataset.surface='strategien';
        collections.dataset.archetype='directory';
        collections.append(node('p','v2-eyebrow','Gezielt entdecken'),node('h2','','Strategien'),node('p','v2-world-subtitle','Entdecke Aktien nach Wachstum, Qualität und Marktbewegung.'));
        collections.append(link('Alle Strategien →','#/strategien','v2-collection-all'));
        collections.appendChild(node('div','v2-collection-links'));body.appendChild(collections);
      }
      collections.querySelector('.v2-collection-links').appendChild(strategyLink(surface,ctx));
    }
    function draw(surface) {
      var view;
      if (surface.type === 'hero') {
        view=spotlight(surface,ctx);
      } else if (topRows.some(function(x){return x[0]===surface.id;})) {rankings.push(surface);return;}
      else if (surface.type==='theme') return;
      else if (surface.id&&surface.id.indexOf('sektor-')===0) return;
      else if (['row','ranking'].indexOf(surface.type)>=0 && (surface.cards||[]).length && ['new-52-week-highs','momentum-leaders','breakout-watch'].indexOf(surface.id)<0){addCollection(surface);return;}
      else if (['row','ranking'].indexOf(surface.type)>=0 && (surface.cards||[]).length) view=rail(surface,ctx,count++);
      else if (surface.type === 'featured-card' && (surface.cards || []).length) {
        view = node('section', 'v2-feature'); view.appendChild(node('p', 'v2-eyebrow', title(surface.kicker || surface.title))); view.appendChild(tile(surface.cards[0], ctx, { large: true, rowId: surface.rowId }));
      } else if (surface.type === 'story' && (surface.cards || []).length) view = story(surface, ctx);
      else view = D.Surfaces.render(surface, ctx);
      if (view) { view.dataset.surface = surface.id; view.dataset.surfaceType = surface.type; if (!view.dataset.archetype) view.dataset.archetype = surface.type; view.classList.add('in'); body.appendChild(view); }
      if(surface.type==='hero'&&!pulseRendered){body.appendChild(marketPulse());pulseRendered=true;}
    }
    function drawChunk(surfaces){
      (surfaces||[]).forEach(draw);
      if(rankings.length&&!topRendered){body.appendChild(topStocks(rankings,ctx));topRendered=true;}
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
          seen.add(url); button.remove(); drawChunk(chunk.surfaces);
          if (chunk.next) next(chunk.next); else finish();
        } catch (error) { if (active()) { button.disabled = false; button.textContent = 'Weitere Welten konnten nicht geladen werden · Erneut versuchen'; busy = false; } }
      }
      button.addEventListener('click', load);
      if (global.IntersectionObserver) { observer = new IntersectionObserver(function (entries, io) { if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); load(); } }, { rootMargin: '600px' }); observer.observe(button); }
    }
    try {
      var first = await S.loadJSON(home.chunks[0]); if (!active()) return;
      seen.add(home.chunks[0]); loading.remove(); drawChunk(first.surfaces);
      if (first.next) next(first.next); else finish();
    } catch (error) { loading.textContent = 'Die Aktienwelten konnten nicht geladen werden.'; var retry = el('button', { type: 'button', text: 'Erneut versuchen', class: 'v2-load-more' }); retry.addEventListener('click', function () { page.remove(); render(root, ctx); }); body.appendChild(retry); }
    return function () { if (observer) observer.disconnect(); ctx.artworkDisposers.forEach(function (dispose) { dispose(); }); ctx.artworkDisposers.length = 0; };
  }
  V.Home = { render: render, title: title, tile: tile, themeTile: themeTile, themeBanner: themeBanner, perspectiveImage: perspectiveImage, strategyLink: strategyLink };
})(window);
