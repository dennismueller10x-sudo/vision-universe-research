(function(global){
  'use strict';
  var D=global.VUDiscover,S=global.QuantShell,el=S.el;
  var modes=[['chart','Chart'],['revenue','Umsatz'],['net_income','Gewinn'],['free_cash_flow','Cashflow']];
  var details=new Map(),serial=0;
  function node(tag,cls,value){return el(tag,{class:cls,text:value});}
  function link(value,href,cls){return el('a',{class:cls,href:href,text:value});}
  function load(card,ctx){
    var path='/discover/data/stocks/'+ctx.universeId+'/'+encodeURIComponent(card.symbol)+'.json';
    if(!details.has(path))details.set(path,S.loadJSON(path).catch(function(){return null;}));
    return details.get(path);
  }
  function visible(box,callback){
    if(!global.IntersectionObserver){callback();return;}
    var observer=new IntersectionObserver(function(entries){
      if(entries.some(function(entry){return entry.isIntersecting;})){observer.disconnect();callback();}
    },{rootMargin:'80px'});
    observer.observe(box);
  }
  function cap(value,when){
    if(!Number.isFinite(value))return 'Nicht verfügbar';
    var currency='USD',layer=global.VUFx&&global.VUFx.layer;
    if(layer&&when){
      var conversion=layer.money(value,'USD',when,'MARKET_PRICE');
      if(conversion&&conversion.conversionAvailable&&conversion.display&&Number.isFinite(conversion.display.value)){
        value=conversion.display.value;currency=conversion.display.currency;
      }
    }
    var format=global.VUFx&&global.VUFx.Format;
    if(format&&format.formatCompact)return format.formatCompact(value,currency,{numberLocale:'de-DE',decimals:1});
    return new Intl.NumberFormat('de-DE',{style:'currency',currency:currency,notation:'compact',maximumFractionDigits:1}).format(value);
  }
  function controller(card,ctx,box,stage,chart,compact){
    var uid='v2-stock-view-'+(++serial),detail=null,loaded=false,loading=null,selected=0;
    stage.id=uid;stage.setAttribute('role','tabpanel');stage.setAttribute('aria-label','Chart');
    var tabs=el('div',{class:'v2-focus-tabs',role:'tablist','aria-label':'Diagramm für '+(card.companyName||card.symbol)});
    var buttons=modes.map(function(mode,i){
      var b=el('button',{type:'button',role:'tab',text:mode[1],'aria-selected':String(i===0),tabindex:i===0?'0':'-1','aria-controls':uid});
      tabs.appendChild(b);return b;
    });
    var market=node('div','v2-stock-market-cap');
    market.append(node('span','','Marktkapitalisierung'),node('strong','','–'));
    function ensure(){
      if(!loading)loading=load(card,ctx).then(function(value){
        detail=value;loaded=true;
        if(!box.isConnected)return;
        var valuation=value&&value.fundamentals&&value.fundamentals.valuation;
        market.querySelector('strong').textContent=cap(valuation&&valuation.marketCap&&valuation.marketCap.value,value&&value.asOf);
        if(selected)show(selected);
      });
      return loading;
    }
    function annual(mode){return detail&&detail.fundamentals&&detail.fundamentals.journey&&detail.fundamentals.journey.tracks&&detail.fundamentals.journey.tracks[mode]||[];}
    function show(i){
      selected=i;
      buttons.forEach(function(b,j){b.setAttribute('aria-selected',String(j===i));b.tabIndex=j===i?0:-1;});
      stage.replaceChildren();stage.setAttribute('aria-label',modes[i][1]);
      if(i===0){chart();return;}
      if(!loaded){stage.appendChild(node('p','v2-focus-empty','Geschäftszahlen laden …'));ensure();return;}
      var points=annual(modes[i][0]).filter(function(p){return Number.isFinite(p.v)&&Number.isFinite(p.fy);}).slice(-8);
      if(points.length<2){stage.appendChild(node('p','v2-focus-empty','Für diese Kennzahl liegen noch keine vergleichbaren Geschäftsjahre vor.'));return;}
      var values=points.map(function(p){return p.v;}),min=Math.min(0,Math.min.apply(null,values)),max=Math.max(0,Math.max.apply(null,values)),span=max-min||1;
      var bars=el('div',{class:'v2-focus-bars',role:'img','aria-label':modes[i][1]+' nach Geschäftsjahr: '+points.map(function(p){return p.fy+' '+(p.v/1e9).toLocaleString('de-DE',{maximumFractionDigits:1})+' Milliarden US-Dollar';}).join(', ')});
      points.forEach(function(p){
        var item=node('div','v2-focus-bar'),area=node('div','v2-focus-bar-area');
        var height=Math.max(3,Math.abs(p.v)/span*100),bar=node('span','v2-focus-bar-fill'+(p.v<0?' is-negative':''));
        bar.style.height=height+'%';bar.style.bottom=((0-min)/span*100-(p.v<0?height:0))+'%';
        var year=el('small',{text:compact?String(p.fy).slice(-2):String(p.fy),title:'Geschäftsjahr '+p.fy});
        area.appendChild(bar);item.append(area,year);bars.appendChild(item);
      });
      var full=modes[i][1]+' · Geschäftsjahre '+points[0].fy+'–'+points[points.length-1].fy+' · Milliarden US-Dollar · SEC';
      var short=modes[i][1]+' · GJ '+String(points[0].fy).slice(-2)+'–'+String(points[points.length-1].fy).slice(-2)+' · Mrd. US-$';
      var caption=node('span','v2-stock-caption',box.classList.contains('dx-feed-metrics')?short:full);
      caption.title=full;stage.append(bars,caption);
    }
    buttons.forEach(function(b,i){
      b.addEventListener('click',function(){show(i);});
      b.addEventListener('keydown',function(e){
        var next=e.key==='ArrowRight'?(i+1)%buttons.length:e.key==='ArrowLeft'?(i+buttons.length-1)%buttons.length:e.key==='Home'?0:e.key==='End'?buttons.length-1:null;
        if(next!==null){e.preventDefault();buttons[next].click();buttons[next].focus();}
      });
    });
    if(compact){box.append(tabs,market);}else{box.append(market,tabs);}
    visible(box,ensure);
  }
  function spotlightCard(card,ctx){
    var href='#/s/'+ctx.universeId+'/'+encodeURIComponent(card.symbol);
    var plain=D.Cards.klartext(card)||card.plain||{};
    var box=node('article','v2-focus v2-stock');box.dataset.symbol=card.symbol;
    var top=node('div','v2-focus-top');
    var identity=node('div','');identity.append(node('span','v2-eyebrow',card.symbol+(card.was?' · '+card.was:'')),node('h3','',card.companyName||card.symbol));
    if(D.Logos)identity.prepend(D.Logos.mark(card.symbol,{name:card.companyName,size:'md'}));
    top.append(identity,link('Unternehmensprofil ↗',href,'v2-focus-link'));box.appendChild(top);
    if(plain.zahl){var performance=node('div','v2-focus-performance');performance.append(node('strong',plain.zahl.ton||'',plain.zahl.wert),node('span','',plain.zahl.label));box.appendChild(performance);}
    var stage=node('div','v2-focus-stage');box.appendChild(stage);
    function chart(){
      stage.appendChild(D.Cards.lazyArtwork(card,{width:720,height:220,range:'1J',live:false,ticker:false,scale:'hero'}));
      stage.appendChild(node('span','v2-stock-caption','Kursverlauf · 1 Jahr · Tagesschlusskurse'+(card.priceSeries&&card.priceSeries.asOf?' · Stand '+D.Cards.dateShort(card.priceSeries.asOf):'')));
    }
    chart();controller(card,ctx,box,stage,chart,false);
    if(plain.story)box.appendChild(node('p','v2-focus-story',plain.story));
    box.appendChild(link('Aktie ansehen →',href,'v2-focus-cta'));
    return box;
  }
  function compactCard(card,ctx,anchor,stage){
    if(card.quantAvailable===false||card.technicalAvailable===false)return anchor;
    var box=node('article','v2-tile-shell');box.dataset.symbol=card.symbol;box.appendChild(anchor);
    var content=Array.from(stage.childNodes);
    function chart(){stage.append.apply(stage,content);}
    controller(card,ctx,box,stage,chart,true);
    return box;
  }
  function feedCard(card,ctx,box,stage){
    var content=Array.from(stage.childNodes);
    function chart(){stage.append.apply(stage,content);}
    controller(card,ctx,box,stage,chart,true);
  }
  D.Featured={card:spotlightCard,compact:compactCard,feed:feedCard};
})(window);
