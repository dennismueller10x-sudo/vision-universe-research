/* =========================================================================
   VISION UNIVERSE DISCOVER — ui/home-market.js

   DIE MARKTLEISTE DER STARTSEITE ("Heute bei Vision Universe") UND DER
   MARKET-PULSE-TEASER

   Aus home.js herausgeloest, damit die gezaehlten Startseiten-Dateien
   (discover/(app|home|detail|themes).(js|css), Budget in
   scripts/discover/browser-qa.mjs) nicht wachsen. Darstellung und Texte
   sind unveraendert.

   KEINE GANZE REIHE FUER DREISSIG PUNKTE

   Die Kurslinie einer Kachel zeigt die letzten 30 Schlusskurse. Der
   Product Contract (quant/api/multi-asset-contract.js) traegt dieselbe
   Reihe bereits im Snapshot: history.recent = points.slice(-66), mit
   history.path === tracker.history.path. recent.slice(-30) ist damit
   genau series.points.slice(-30). Die volle Reihe (180-220 KB je Markt)
   wird nur noch geholt, wenn der Snapshot das nicht belegt
   (discover/tests/home-market.test.mjs).
   ========================================================================= */
(function (global) {
  'use strict';
  var SPARK_POINTS = 30;

  /** Woher die Kurslinie kommt: {points} aus dem Snapshot, {path} zum
   *  Nachladen, null wenn es keine Reihe gibt. */
  function sparkSource(raw) {
    var t = raw && raw.tracker && raw.tracker.history, h = raw && raw.history;
    if (!t || !t.path) return null;
    if (h && h.path === t.path && Array.isArray(h.recent) && h.recent.length >= SPARK_POINTS) return { points: h.recent };
    return { path: t.path };
  }

  function miniLine(points) {
    var last = (points || []).slice(-SPARK_POINTS).map(function (p) { return Array.isArray(p) ? p[1] : null; }).filter(function (v) { return typeof v === 'number' && Number.isFinite(v); });
    if (last.length < 2) return null;
    var lo = Math.min.apply(null,last), hi = Math.max.apply(null,last), span = hi - lo || 1;
    var path = last.map(function (v,i) { return (i ? 'L' : 'M') + (i * 100 / (last.length - 1)).toFixed(1) + ',' + (28 - (v - lo) / span * 24).toFixed(1); }).join(' ');
    var svg = global.document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 100 32');svg.setAttribute('role','img');svg.setAttribute('aria-label','Schlusskursverlauf der letzten 30 Handelstage');svg.classList.add('v2-market-spark');
    var line = global.document.createElementNS('http://www.w3.org/2000/svg','path');line.setAttribute('d',path);svg.appendChild(line);return svg;
  }

  function today(ctx) {
    var D = global.VUDiscover, S = global.QuantShell, el = S.el;
    function node(tag, cls, text) { return el(tag, { class: cls, text: text }); }
    function link(text, href, cls) { return el('a', { class: cls, href: href, text: text }); }
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
        var source=available?sparkSource(raw):null;
        function draw(points){if(a.isConnected){var spark=miniLine(points);if(spark)a.insertBefore(spark,a.querySelector('.v2-market-fresh'));}}
        if(source&&source.points)draw(source.points);
        else if(source)S.loadJSON(source.path).then(function(series){draw(series.points);}).catch(function(){});
      });
      if(!grid.children.length)grid.appendChild(node('p','v2-market-loading','Marktstände sind momentan nicht verfügbar.'));
    }).catch(function(){if(section.isConnected)grid.replaceChildren(node('p','v2-market-loading','Marktstände sind momentan nicht verfügbar.'));});
    return section;
  }

  function pulse() {
    var D = global.VUDiscover, S = global.QuantShell, el = S.el;
    function node(tag, cls, text) { return el(tag, { class: cls, text: text }); }
    var section=node('section','v2-pulse-teaser');section.dataset.surface='market-pulse';
    section.dataset.archetype='market';
    var copy=node('div','');copy.append(node('p','v2-eyebrow','Discover · Märkte'),node('h2','','Market Pulse'),node('p','v2-pulse-statement','Wie sieht der Markt gerade insgesamt aus?'));
    copy.appendChild(el('a',{class:'v2-pill v2-pill-light',href:'#/maerkte/einordnung',text:'Marktbarometer verstehen →'}));section.appendChild(copy);
    S.loadJSON('/quant/data/market/intelligence/market-pulse.json').then(function(p){
      if(!section.isConnected||!p.environment)return;
      var env=p.environment;copy.querySelector('.v2-pulse-statement').textContent=env.statement||'Das Marktumfeld im Überblick.';
      var state=node('div','v2-pulse-state');state.append(node('span','','Marktumfeld'),node('strong','',env.label||'Nicht bestimmbar'));
      if(p.evaluation&&p.evaluation.dataAsOf)state.append(node('small','','Datenstand '+D.Cards.dateShort(p.evaluation.dataAsOf)));
      section.appendChild(state);
    }).catch(function(){});
    return section;
  }

  var api = { today: today, pulse: pulse, sparkSource: sparkSource, miniLine: miniLine, SPARK_POINTS: SPARK_POINTS };
  global.VUDiscover = global.VUDiscover || {};
  global.VUDiscover.HomeMarket = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
