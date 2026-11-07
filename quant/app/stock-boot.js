/* Early C04/C05 from the validated public-service delivery view. The full
   router adopts these nodes; it still reads and validates its normal data. */
(function (w) {
  'use strict';
  var doc=w.document;
  if(!w.VUQuantHeadDeliveryEnabled||!doc||!w.VUCore||!w.VUCore.StockContext||!w.VUStockNavigator)return;
  var isHome=(!w.location.hash||/^#\/?$/.test(w.location.hash))&&!/[?&]view=/.test(w.location.search);
  if(isHome&&w.VUQuantHomeIntro){
    var home=null,active=true;
    w.VUQuantBoot={takeMain:function(root){return active&&home&&home.main.parentNode===root?home.main:null;},get:function(t,main){return active&&t==='home'&&home&&home.main===main&&home.page.isConnected?home:null;}};
    function mountHome(){
      var root=doc.getElementById('qx-app');if(!root)return false;
      var main=root.querySelector('main')||el('main','qx-main'),page=el('div','q-home vu-ui qv3');
      main.id='qx-main';main.tabIndex=-1;page.innerHTML=w.VUQuantHomeIntro;var intro=page.firstElementChild;
      var pending=el('div','vu-skeleton');pending.setAttribute('aria-hidden','true');pending.style.height='180px';pending.append(el('i'),el('i'),el('i'));page.appendChild(pending);
      main.replaceChildren(page);if(!main.parentNode)root.appendChild(main);home={main:main,page:page,intro:intro};return true;
    }
    if(!mountHome()){var homeObserver=new MutationObserver(function(){if(mountHome())homeObserver.disconnect();});homeObserver.observe(doc.documentElement,{childList:true,subtree:true});}
    w.addEventListener('hashchange',function(){if(w.location.hash&&!/^#\/?$/.test(w.location.hash))active=false;});return;
  }
  var parsed=w.VUCore.StockContext.parse(w.location.href);
  if(!parsed||parsed.product!=='quant'||!/^#\/aktie\/[A-Z0-9.-]{1,12}(?:$|\?)/i.test(w.location.hash))return;
  var ticker=parsed.ctx.ticker,view=null,live=true;
  function el(tag,cls,text){var n=doc.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
  function style(){
    var meta=doc.querySelector('meta[name="vu-release"]'),id=meta&&meta.getAttribute('content'),product=meta&&meta.getAttribute('data-product');
    if(!/^[0-9a-f]{8,64}$/.test(id||'')||!/^[a-z0-9-]{1,32}$/.test(product||''))id=null;
    var href='/quant/app/stock.css'+(id?'?v='+id:'');
    return new Promise(function(resolve){var link=doc.createElement('link');link.rel='stylesheet';link.href=href;link.onload=function(){resolve(true);};link.onerror=function(){resolve(false);};doc.head.appendChild(link);});
  }
  var api={ticker:ticker,styleReady:style(),get:function(t,main){return live&&t===ticker&&view&&!view.authoritative&&view.main===main&&view.article.isConnected?view:null;},takeMain:function(root){return live&&view&&view.main.parentNode===root?view.main:null;}};
  w.VUQuantBoot=api;
  var key=w.VUCore.Identity.shardKey(ticker);
  var data=fetch('/quant/data/product/stock-head-v1/'+key+'.json',{cache:'no-cache',credentials:'omit',priority:'high'}).then(function(r){if(!r.ok)throw Error('HEAD_UNAVAILABLE');return r.json();}).then(function(d){
    var record=d&&d.entries&&d.entries[ticker];
    if(d.schema!=='quant-stock-head-view-1'||! /^[0-9a-f]{16}$/.test(d.version||'')||d.shard!==key||!record||record.ticker!==ticker||record.masterMemberId!==parsed.ctx.securityId||!Number.isFinite(record.price&&record.price.value)||!/^\d{4}-\d{2}-\d{2}$/.test(record.asOf)||record.asOf>new Date().toISOString().slice(0,10))throw Error('HEAD_CONTRACT');
    return record;
  });
  data.catch(function(){});
  function mount(){
    var root=doc.getElementById('qx-app');if(!root||!live)return false;
    var main=root.querySelector('main');if(!main){main=el('main','qx-main');root.appendChild(main);}main.id='qx-main';main.tabIndex=-1;main.setAttribute('aria-busy','true');main.dataset.view='aktie';main.dataset.ready='false';
    var article=el('article','qx-stock q-stock qv-stock'),heroHost=el('div','qx-hero-host'),hero=el('div','qx-stock-hero qv-head'),body=el('div','qx-body-host');
    heroHost.setAttribute('aria-busy','true');heroHost.appendChild(hero);
    var layout=el('div','qx-stock-layout qv2-overview'),chart=el('section','qc-chart'),line=el('p','qc-head'),box=el('div','vu-chart vu-chart--bleed qc-box'),plot=el('div','qc-plot qx-boot-plot'),ranges=el('div','vu-ranges qc-ranges qx-boot-ranges'),about=el('div','qc-about qx-boot-about'),card=el('section','qx-glance qv-glance qv2-glance');
    chart.setAttribute('aria-hidden','true');plot.style.height=w.matchMedia('(max-width:760px)').matches?'180px':'300px';box.appendChild(plot);ranges.style.height='44px';about.style.height='44px';chart.append(line,box,ranges,about);layout.append(chart,card);body.appendChild(layout);article.append(heroHost,body);main.replaceChildren(article);
    view={ticker:ticker,main:main,article:article,heroHost:heroHost,hero:hero,bodyHost:body,headApi:null,question:null,authoritative:false};
    Promise.all([data,api.styleReady]).then(function(values){
      var record=values[0];if(!values[1]||!live||!article.isConnected||view.authoritative)return;
      var action=el('span','qx-boot-action');action.setAttribute('aria-hidden','true');action.style.cssText='display:block;width:136px;height:46px;border-radius:999px;background:var(--vu-hair)';
      var head=w.VUStockNavigator.head(hero,{ctx:parsed.ctx,current:'quant',name:record.name,price:record.price,back:{href:'#/aktien',label:'Aktien'},actions:action});view.headApi=head;var quote=head.el.querySelector('.vu-shead-pricebox');quote.classList.add('qx-quote','q-stock-price');quote.setAttribute('aria-live','polite');
      var meta=head.el.querySelector('.vu-shead-meta');meta.classList.add('qx-stock-id');meta.replaceChildren(el('b','',ticker));if(record.industry)meta.appendChild(el('span','',record.industry));
      var kinds={ETF:'ETF',PREFERRED:'Vorzugsaktie',ADR:'ADR (Hinterlegungsschein)'};
      if(record.securityType&&record.securityType!=='COMMON_STOCK')meta.appendChild(el('span','dx-index-badge qx-tag',kinds[record.securityType]||'keine Stammaktie'));
      if(record.listingCount>1)meta.appendChild(el('span','dx-index-badge qx-tag','eine von '+record.listingCount+' Aktiengattungen'));
      var question=el('h2',record.questionClass,record.question);view.question=question;
      if(record.questionClass==='qv3-step-q'){var kicker=el('p','qv3-step-k');kicker.appendChild(el('span','','Überblick'));card.appendChild(kicker);}card.appendChild(question);
      var skeleton=el('div','vu-skeleton');skeleton.setAttribute('aria-hidden','true');skeleton.append(el('i'),el('i'),el('i'));card.appendChild(skeleton);
      heroHost.setAttribute('aria-busy','false');main.setAttribute('aria-busy','false');doc.title=record.name+' ('+ticker+') – Quant-Analyse · Vision Universe®';
    }).catch(function(){/* Full router retains the existing error/retry path. */});
    return true;
  }
  if(!mount()){
    var observer=new MutationObserver(function(){if(mount())observer.disconnect();});observer.observe(doc.documentElement,{childList:true,subtree:true});
  }
  w.addEventListener('hashchange',function(){if(!/^#\/aktie\//i.test(w.location.hash)||w.VUCore.StockContext.parse(w.location.href)?.ctx.ticker!==ticker){live=false;if(view&&!view.authoritative&&view.headApi)view.headApi.dispose();}});
})(typeof window!=='undefined'?window:globalThis);
