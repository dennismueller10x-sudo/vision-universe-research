(function(global){
  'use strict';
  var D=global.VUDiscover,S=global.QuantShell,el=S.el;
  function node(tag,cls,value){return el(tag,{class:cls,text:value});}
  function link(value,href,cls){return el('a',{class:cls,href:href,text:value});}
  function spotlightCard(card,ctx) {
    var href='#/s/'+ctx.universeId+'/'+encodeURIComponent(card.symbol);
    var plain=D.Cards.klartext(card)||card.plain||{};
    var box=node('article','v2-focus v2-stock');box.dataset.symbol=card.symbol;
    var top=node('div','v2-focus-top');
    var identity=node('div','');identity.append(node('span','v2-eyebrow',card.symbol+(card.was?' · '+card.was:'')),node('h3','',card.companyName||card.symbol));
    top.append(identity,link('Unternehmensprofil ↗',href,'v2-focus-link'));box.appendChild(top);
    if(plain.zahl){var performance=node('div','v2-focus-performance');performance.append(node('strong',plain.zahl.ton||'',plain.zahl.wert),node('span','',plain.zahl.label));box.appendChild(performance);}
    var stage=node('div','v2-focus-stage');box.appendChild(stage);
    var tabs=el('div',{class:'v2-focus-tabs',role:'tablist','aria-label':'Diagramm für '+(card.companyName||card.symbol)});
    var modes=[['chart','Chart'],['revenue','Umsatz'],['net_income','Gewinn'],['free_cash_flow','Cashflow']];
    var buttons=modes.map(function(mode,i){var b=el('button',{type:'button',role:'tab',text:mode[1],'aria-selected':String(i===0),tabindex:i===0?'0':'-1','aria-controls':'v2-focus-stage'});tabs.appendChild(b);return b;});
    stage.id='v2-focus-stage';stage.setAttribute('role','tabpanel');stage.setAttribute('aria-label','Chart');
    var detail=null;
    function annual(mode){return detail&&detail.fundamentals&&detail.fundamentals.journey&&detail.fundamentals.journey.tracks&&detail.fundamentals.journey.tracks[mode]||[];}
    function show(i){
      buttons.forEach(function(b,j){b.setAttribute('aria-selected',String(j===i));b.tabIndex=j===i?0:-1;});
      var mode=modes[i],points=annual(mode[0]).filter(function(p){return Number.isFinite(p.v)&&Number.isFinite(p.fy);}).slice(-8);
      stage.replaceChildren();stage.setAttribute('aria-label',mode[1]);
      if(i===0){var media=D.Cards.lazyArtwork(card,{width:720,height:220,range:'1J',live:true,ticker:false,scale:'hero'});stage.appendChild(media);stage.appendChild(node('span','v2-stock-caption','Kursverlauf · letzter verfügbarer Handelsstand'));return;}
      if(points.length<2){stage.appendChild(node('p','v2-focus-empty','Für diese Kennzahl liegen noch keine vergleichbaren Geschäftsjahre vor.'));return;}
      var values=points.map(function(p){return p.v;}),min=Math.min(0,Math.min.apply(null,values)),max=Math.max(0,Math.max.apply(null,values)),span=max-min||1;
      var chart=el('div',{class:'v2-focus-bars',role:'img','aria-label':mode[1]+' nach Geschäftsjahr: '+points.map(function(p){return p.fy+' '+(p.v/1e9).toLocaleString('de-DE',{maximumFractionDigits:1})+' Milliarden US-Dollar';}).join(', ')});
      points.forEach(function(p){var item=node('div','v2-focus-bar');var area=node('div','v2-focus-bar-area');var height=Math.max(3,Math.abs(p.v)/span*100);var bar=node('span','v2-focus-bar-fill'+(p.v<0?' is-negative':''));bar.style.height=height+'%';bar.style.bottom=((0-min)/span*100-(p.v<0?height:0))+'%';area.appendChild(bar);item.append(area,node('small','',String(p.fy)));chart.appendChild(item);});
      stage.append(chart,node('span','v2-stock-caption',mode[1]+' · Geschäftsjahre '+points[0].fy+'–'+points[points.length-1].fy+' · Milliarden US-Dollar · SEC'));
    }
    buttons.forEach(function(b,i){b.addEventListener('click',function(){show(i);});b.addEventListener('keydown',function(e){var next=e.key==='ArrowRight'?(i+1)%buttons.length:e.key==='ArrowLeft'?(i+buttons.length-1)%buttons.length:e.key==='Home'?0:e.key==='End'?buttons.length-1:null;if(next!==null){e.preventDefault();buttons[next].click();buttons[next].focus();}});});
    box.appendChild(tabs);
    if(plain.story)box.appendChild(node('p','v2-focus-story',plain.story));
    box.appendChild(link('Aktie ansehen →',href,'v2-focus-cta'));
    show(0);
    S.loadJSON('/discover/data/stocks/'+ctx.universeId+'/'+encodeURIComponent(card.symbol)+'.json').then(function(value){if(!box.isConnected)return;detail=value;var selected=buttons.findIndex(function(b){return b.getAttribute('aria-selected')==='true';});if(selected>0)show(selected);}).catch(function(){});
    return box;
  }
  D.Featured={card:spotlightCard};
})(window);
