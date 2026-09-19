(function (global) {
  'use strict';
  const S = global.QuantShell, D = global.VUDiscover;
  const V = global.VUDiscoverV2 = global.VUDiscoverV2 || {};
  const el = S.el, BASE = '/discover/data/';
  let generation = 0, meta, calendar, search, theme, previousFocus, homeDispose;
  const ctx = { universeId: 'US_REAL', openSearch: () => search.open() };
  function message(root, title, copy, retry) {
    S.clear(root);
    root.append(el('section', {class:'v2-message'}, [el('h1',{text:title}),el('p',{text:copy})]));
    if (retry) { const b=el('button',{class:'v2-button',type:'button',text:'Erneut versuchen'});b.onclick=route;root.firstChild.append(b); }
  }
  function footer() {
    return el('footer',{class:'v2-footer'},[
      el('b',{text:'VISION UNIVERSE®'}),
      el('p',{text:'Aktien entdecken. Unternehmen verstehen.'}),
      el('p',{text:meta.disclaimer || 'Informationen zur eigenen Recherche.'}),
      el('a',{href:'#/daten',text:'Daten & Quellen'}),document.createTextNode(' · '),
      el('a',{href:'/discover/',text:'Discover 1.0 öffnen'})
    ]);
  }
  function shell() {
    const host=document.getElementById('v2-shell'); S.clear(host);
    const themeButton=el('button',{type:'button',class:'v2-theme',text:'Darstellung'});
    const label=()=>{themeButton.textContent=theme.label(theme.mode());themeButton.setAttribute('aria-label','Darstellung: '+theme.label(theme.mode()));};
    label();themeButton.onclick=()=>{theme.cycle();label();};
    const bar=el('div',{class:'v2-bar'},[
      el('a',{href:'#/',class:'v2-wordmark',text:'Discover 2.0'}),el('span',{class:'v2-preview',text:'Preview'}),
      el('a',{href:'/discover/',class:'v2-compare',text:'Discover 1.0 ↗'}),themeButton
    ]);
    const main=el('main',{id:'v2-main',class:'v2-main',tabindex:'-1'});
    const find=el('button',{type:'button',text:'Suchen',class:'v2-dock-search'});find.onclick=()=>search.open();
    const dock=el('nav',{class:'v2-dock','aria-label':'Aktien entdecken'},[
      el('a',{href:'#/',text:'Übersicht'}),find,el('a',{href:'#/einzeln/'+ctx.universeId,text:'Entdecken'})
    ]);
    host.append(bar,main,footer(),dock); return main;
  }
  function setupSearch() {
    search=D.Search.create({universeId:()=>ctx.universeId});document.body.append(search.node);
    const open=search.open;
    search.open=()=>{previousFocus=document.activeElement;open();};
    document.addEventListener('keydown',event=>{if(event.key==='/'&&!search.node.classList.contains('on'))previousFocus=document.activeElement;},true);
    let wasOpen=false;
    new MutationObserver(()=>{
      const isOpen=search.node.classList.contains('on');
      document.getElementById('v2-shell').inert=isOpen;
      const nav=document.querySelector('vu-navigation');if(nav)nav.inert=isOpen;
      if(isOpen&&!wasOpen&&!previousFocus)previousFocus=document.activeElement;
      if(!isOpen&&wasOpen&&previousFocus&&previousFocus.isConnected)previousFocus.focus();
      wasOpen=isOpen;
    }).observe(search.node,{attributes:true,attributeFilter:['class']});
    search.node.addEventListener('keydown',event=>{
      if(event.key!=='Tab')return;
      const nodes=Array.from(search.node.querySelectorAll('button,input,a[href]')).filter(n=>n.getClientRects().length);
      const first=nodes[0],last=nodes[nodes.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    });
  }
  async function instrument(root,symbol,active) {
    const dir=global.VUInstrumentDirectory.create({});
    const result=await dir.getInstrument(symbol);
    if(!active())return;
    if(result.status!=='OK'){message(root,'Aktie nicht gefunden','Prüfe das Kürzel oder suche nach dem Unternehmensnamen.');return;}
    const [manifest,hits]=await Promise.all([dir.manifest().catch(()=>null),dir.search(symbol,{limit:1}).catch(()=>null)]);
    if(!active())return;
    root.classList.add('dx-detail');
    V.Detail.renderInstrument(root,{instrument:result.instrument,alternateListings:result.alternateListings,
      capabilities:dir.capabilities(hits&&hits.entries&&hits.entries[0]),masterVersion:manifest&&manifest.version,asOf:manifest&&manifest.asOf},ctx);
  }
  async function route() {
    if(!meta)return;
    const id=++generation,active=()=>generation===id;
    if(homeDispose){homeDispose();homeDispose=null;}
    if(V.Detail&&V.Detail.dispose)V.Detail.dispose();
    const parts=location.hash.replace(/^#\/?/,'').split('/').filter(Boolean);
    document.body.classList.toggle('dx-feed-aktiv',parts[0]==='einzeln');
    document.body.classList.toggle('v2-feed-active',parts[0]==='einzeln');
    const root=shell();root.setAttribute('aria-busy','true');
    document.title='Discover 2.0 — Vision Universe®';global.scrollTo(0,0);
    try {
      await D.LiveHub.loadIndex().catch(()=>null);if(!active())return;
      if(parts[0]==='s'&&parts[2]){
        const symbol=decodeURIComponent(parts[2]).toUpperCase();
        if(!/^[A-Z0-9.\-]{1,24}$/.test(symbol))throw Error('Ungültiges Aktienkürzel');
        const index=await S.loadJSON(BASE+'stock-index/'+ctx.universeId+'.json');if(!active())return;
        if(index.symbols.includes(symbol)){
          const detail=await S.loadJSON(BASE+'stocks/'+ctx.universeId+'/'+symbol+'.json');if(!active())return;
          root.classList.add('dx-detail');V.Detail.render(root,detail,ctx);
          document.title=(detail.companyName||symbol)+' — Discover 2.0';
          if(D.memory)D.memory.recordView(symbol,{universeId:ctx.universeId,companyName:detail.companyName,sector:detail.sector,world:detail.world});
        }else await instrument(root,symbol,active);
      } else if(parts[0]==='c'&&parts[2]){
        if(!/^[a-zA-Z0-9_-]+$/.test(parts[2]))throw Error('Ungültige Sammlung');
        const row=await S.loadJSON(BASE+'rows/'+ctx.universeId+'/'+parts[2]+'.json');if(!active())return;
        root.append(el('a',{class:'v2-back',href:'#/',text:'← Übersicht'}));
        root.append(el('h1',{text:row.title}),el('p',{class:'v2-lead',text:row.subtitle||''}));
        if(row.editorial)root.append(el('p',{text:'Redaktionelle Themenzuordnung. Die Reihenfolge folgt der bestehenden Methodik.'}));
        if(row.rule){const rule=el('details',{class:'v2-rule'},[el('summary',{text:'Wie entsteht diese Auswahl?'}),el('p',{text:row.rule})]);root.append(rule);}
        if(row.sectors)root.append(D.Surfaces.sectors({title:row.title,sectors:row.sectors},ctx));
        else root.append(D.Cards.grid(row.cards||[],{rowId:row.rowId,universeId:ctx.universeId,world:row.world}));
      } else if(parts[0]==='einzeln'){
        const feed=await S.loadJSON(BASE+'feed/'+ctx.universeId+'.json');if(!active())return;
        D.Feed.render(root,feed.cards||[],{universeId:ctx.universeId,zurueck:'#/',order:feed.order,batchSize:feed.batchSize||12,
          weiter:[{label:'Zur Übersicht',href:'#/'}]});
      } else if(parts[0]==='daten'){
        root.append(D.Daten.render({meta,universe:meta.universes.find(u=>u.universeId===ctx.universeId),calendar}));
      } else {
        const result=await V.Home.render(root,Object.assign({},ctx,{isActive:active}));
        if(typeof result==='function')homeDispose=result;
      }
      if(active())D.Cards.revealOnScroll(root);
    } catch(err) {
      if(active())message(root,'Gerade nicht erreichbar','Die Daten konnten nicht geladen werden. Bitte versuche es noch einmal.',true);
      console.error('Discover 2.0 route',err);
    } finally {if(active())root.setAttribute('aria-busy','false');}
  }
  async function boot(){
    try {
      [meta,calendar]=await Promise.all([S.loadJSON(BASE+'meta.json'),S.loadJSON('/quant/config/market-calendar.json').catch(()=>null)]);
      ctx.meta=meta;ctx.calendar=calendar;global.VUDiscoverMeta=meta;
      const universe=meta.universes.find(u=>u.universeId===ctx.universeId);
      Object.assign(ctx,{universeLabel:universe.label,universeSize:universe.securities,asOf:universe.asOf,sectorWorlds:(meta.visualLanguage||{}).sectorWorlds||{}});
      D.LiveHub.init({realtime:meta.realtime,calendar});
      document.querySelector('.v2-skip').onclick=event=>{event.preventDefault();const main=document.getElementById('v2-main');if(main){main.focus();main.scrollIntoView();}};
      let storage;try{storage=global.localStorage;}catch(_){}
      theme=D.Theme.create({storage,document,matchMedia:q=>global.matchMedia(q)});D.theme=theme;D.memory=D.Memory.create();
      setupSearch();global.addEventListener('hashchange',route);await route();
    }catch(err){message(document.getElementById('v2-shell'),'Discover 2.0 ist gerade nicht erreichbar','Bitte lade die Seite erneut.');}
  }
  boot();
})(window);
