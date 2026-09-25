(function (global) {
  'use strict';
  const S = global.QuantShell, D = global.VUDiscover;
  const V = (global.VUDiscover = global.VUDiscover || {}).Views = global.VUDiscover.Views || {};
  const el = S.el, BASE = '/discover/data/';
  let generation = 0, meta, calendar, search, theme, previousFocus, homeDispose;
  const ctx = { universeId: 'US_REAL', openSearch: () => search.open() };
  function syncThemeChrome(state) {
    const color=state&&state.resolved==='light'?'#ffffff':'#08080a';
    const tag=document.querySelector('meta[name="theme-color"]');if(tag)tag.setAttribute('content',color);
  }
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
      el('p',{},[el('a',{href:'#/maerkte',text:'Märkte'}),document.createTextNode(' · '),el('a',{href:'#/daten',text:'Daten & Quellen'})])
    ]);
  }
  function navigation() {
    const routeKey=location.hash.replace(/^#\/?/,'').split('/')[0]||'home';
    const current=(routeKey==='c'||routeKey==='thema')?'welten':routeKey;
    const nav=el('nav',{class:'v2-dock','aria-label':'Aktien entdecken'});
    [['home','Start','#/','home'],['welten','Welten','#/welten','worlds'],['einzeln','Entdecken','#/einzeln/'+ctx.universeId,'explore'],['suche','Suchen',null,'search']].forEach(([key,label,href,icon])=>{
      const item=el(href?'a':'button',{class:'v2-nav-item v2-nav-'+icon+(!href?' v2-dock-search':''),...(href?{href}:{type:'button','aria-haspopup':'dialog','aria-expanded':'false'}),...(current===key?{'aria-current':'page'}:{})},[
        el('span',{class:'v2-nav-icon v2-icon-'+icon,'aria-hidden':'true'}),el('span',{text:label})
      ]);
      if(!href)item.onclick=()=>search.open();
      nav.appendChild(item);
    });
    return nav;
  }
  function shell() {
    const host=document.getElementById('v2-shell'); S.clear(host);
    const themeButton=el('button',{type:'button',class:'v2-theme',text:'Darstellung'});
    const label=()=>{themeButton.textContent=theme.label(theme.mode());themeButton.setAttribute('aria-label','Darstellung: '+theme.label(theme.mode()));};
    label();themeButton.onclick=()=>{theme.cycle();label();};
    /* Der Umschalter des zentralen Currency Contracts. Discover baut ihn
       nicht nach - ein zweiter haette einen zweiten Zustand, und ein
       Nutzer, der anderswo auf USD stellt, saehe hier wieder Euro. */
    const waehrung=(global.VUFx&&global.VUFx.Switch&&global.VUFx.layer)
      ? global.VUFx.Switch.create({layer:global.VUFx.layer}) : null;
    const bar=el('div',{class:'v2-bar'},[
      el('a',{href:'#/',class:'v2-wordmark',text:'Discover'}),
      waehrung,themeButton
    ].filter(Boolean));
    const main=el('main',{id:'v2-main',class:'v2-main',tabindex:'-1'});
    const dock=navigation();
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
      const searchButton=document.querySelector('.v2-dock-search');
      if(searchButton){searchButton.setAttribute('aria-expanded',String(isOpen));searchButton.classList.toggle('is-active',isOpen);}
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
    document.title='Discover — Vision Universe®';global.scrollTo(0,0);
    try {
      await D.LiveHub.loadIndex().catch(()=>null);if(!active())return;
      if(parts[0]==='s'&&parts[2]){
        const symbol=decodeURIComponent(parts[2]).toUpperCase();
        if(!/^[A-Z0-9.\-]{1,24}$/.test(symbol))throw Error('Ungültiges Aktienkürzel');
        const index=await S.loadJSON(BASE+'stock-index/'+ctx.universeId+'.json');if(!active())return;
        if(index.symbols.includes(symbol)){
          const detail=await S.loadJSON(BASE+'stocks/'+ctx.universeId+'/'+symbol+'.json');if(!active())return;
          root.classList.add('dx-detail');V.Detail.render(root,detail,ctx);
          document.title=(detail.companyName||symbol)+' — Discover';
          if(D.memory)D.memory.recordView(symbol,{universeId:ctx.universeId,companyName:detail.companyName,sector:detail.sector,world:detail.world});
        }else await instrument(root,symbol,active);
      } else if(parts[0]==='welten'){
        root.append(el('p',{class:'v2-eyebrow',text:'Dein nächster Blickwinkel'}),el('h1',{text:'Themenwelten & Aktienwelten'}),el('p',{class:'v2-lead',text:'Megatrends, Branchen und Rankings. Wähle eine Welt und entdecke die Aktien dahinter.'}));
        root.append(el('div',{class:'v2-section-head'},[el('h2',{text:'Themenwelten'}),el('span',{text:V.Themes.all.length+' Welten'})]));
        const themeGrid=el('div',{class:'v2-theme-grid'});
        V.Themes.all.forEach(theme=>themeGrid.append(V.Home.themeTile(theme,ctx)));
        root.append(themeGrid);
        root.append(el('div',{class:'v2-section-head'},[el('h2',{text:'Aktienwelten'}),el('span',{text:'Rankings & Perspektiven'})]));
        const rows=(meta.rows||[]).find(entry=>entry.universeId===ctx.universeId);
        const worlds=el('div',{class:'v2-world-directory'});
        ((rows&&rows.rows)||[]).filter(row=>row.returned>0).forEach((row,index)=>{
          worlds.append(el('a',{href:'#/c/'+ctx.universeId+'/'+row.rowId,class:'v2-world-door','data-tone':String(index%4)},[
            el('span',{class:'v2-world-door-count',text:row.returned+' Aktien'}),el('h2',{text:row.title}),el('p',{text:row.subtitle||''}),el('span',{class:'v2-world-door-arrow',text:'Entdecken ↗'})
          ]));
        });
        root.append(worlds);
      } else if(parts[0]==='thema'&&parts[1]){
        const theme=V.Themes.bySlug(parts[1]);
        if(!theme){message(root,'Themenwelt nicht gefunden','Diese Themenwelt gibt es nicht. Alle Welten findest du in der Übersicht.');return;}
        document.title=theme.title+' — Discover';
        root.append(el('a',{class:'v2-back',href:'#/welten',text:'← Alle Themenwelten'}));
        const row=theme.rowId?await S.loadJSON(BASE+'rows/'+ctx.universeId+'/'+theme.rowId+'.json').catch(()=>null):null;if(!active())return;
        const count=row&&(row.cards||[]).length;
        root.append(V.Home.themeBanner(theme,{page:true,eyebrow:'Themenwelt '+String(theme.n).padStart(2,'0'),subtitle:theme.short+' — '+theme.line,
          evidence:count?count+' Aktien · Redaktionelle Themenzuordnung':'In Vorbereitung'}));
        if(row&&count){
          if(row.rule){root.append(el('details',{class:'v2-rule'},[el('summary',{text:'Wie entsteht diese Auswahl?'}),el('p',{text:row.rule})]));}
          if(D.memory)D.memory.recordCollection(row.rowId||theme.rowId);
          root.append(D.Cards.grid(row.cards,{rowId:row.rowId,universeId:ctx.universeId,world:row.world}));
        } else {
          const soon=el('section',{class:'v2-theme-soon'},[el('h2',{text:'Die Aktienauswahl entsteht gerade.'}),
            el('p',{text:'Diese Themenwelt wird redaktionell zusammengestellt. Bis dahin findest du einzelne Unternehmen über die Suche.'})]);
          const b=el('button',{type:'button',class:'v2-pill v2-pill-dark',text:'Unternehmen suchen'});b.onclick=()=>search.open();soon.append(b);root.append(soon);
        }
        const related=V.Themes.all.filter(t=>t!==theme&&t.group===theme.group);
        if(related.length){
          root.append(el('div',{class:'v2-section-head'},[el('h2',{text:'Verwandte Themenwelten'}),el('a',{href:'#/welten',text:'Alle ansehen →'})]));
          const grid=el('div',{class:'v2-theme-grid'});related.forEach(t=>grid.append(V.Home.themeTile(t,ctx)));root.append(grid);
        }
      } else if(parts[0]==='c'&&parts[2]){
        if(!/^[a-zA-Z0-9_-]+$/.test(parts[2]))throw Error('Ungültige Sammlung');
        const row=await S.loadJSON(BASE+'rows/'+ctx.universeId+'/'+parts[2]+'.json');if(!active())return;
        root.append(el('a',{class:'v2-back',href:'#/',text:'← Übersicht'}));
        const rowTheme=V.Themes.byRow(row.rowId||parts[2]);
        if(rowTheme)root.append(V.Home.themeBanner(rowTheme,{page:true,title:V.Home.title(row.title),subtitle:row.subtitle||rowTheme.line,evidence:(row.cards||[]).length+' Aktien'}));
        else root.append(el('h1',{text:V.Home.title(row.title)}),el('p',{class:'v2-lead',text:row.subtitle||''}));
        if(row.index&&row.index.asOf)root.append(el('p',{class:'v2-collection-source',text:'Mitglieder laut '+(row.index.proxy&&row.index.proxy.etf?'ETF-Bestand '+row.index.proxy.etf:'Indexeigentümer')+' · '+D.Cards.dateShort(row.index.asOf)}));
        if(row.editorial)root.append(el('p',{text:'Redaktionelle Themenzuordnung. Die Reihenfolge folgt der bestehenden Methodik.'}));
        if(row.rule){const rule=el('details',{class:'v2-rule'},[el('summary',{text:'Wie entsteht diese Auswahl?'}),el('p',{text:row.rule})]);root.append(rule);}
        if(D.memory)D.memory.recordCollection(row.rowId||parts[2]);
        if(row.sectors)root.append(D.Surfaces.sectors({title:row.title,sectors:row.sectors},ctx));
        else root.append(D.Cards.grid(row.cards||[],{rowId:row.rowId,universeId:ctx.universeId,world:row.world}));
      } else if(parts[0]==='einzeln'){
        const feed=await S.loadJSON(BASE+'feed/'+ctx.universeId+'.json');if(!active())return;
        const feedKey='feed:'+ctx.universeId;
        const resume=D.memory?D.memory.position(feedKey):0;
        const fullOrder=feed.order||[],batch=feed.batchSize||12;
        const start=Number.isInteger(resume)&&resume>0&&resume<fullOrder.length?resume:0;
        // A continuation is the untouched suffix of the canonical order.
        // Only its first batch is loaded; earlier viewed stocks need no DOM
        // or additional requests, even after a very deep session.
        const order=fullOrder.slice(start);
        const cards=start?await Promise.all(order.slice(0,batch).map(async entry=>{
          const card=await S.loadJSON(BASE+'stocks/'+ctx.universeId+'/'+entry.s+'.json');
          return Object.assign({},card,{herkunft:entry.herkunft||card.herkunft||null});
        })):feed.cards||[];
        if(!active())return;
        const feedHost=D.Feed.render(root,cards,{universeId:ctx.universeId,zurueck:'#/',order,batchSize:batch,
          merken:index=>{if(active()&&D.memory)D.memory.setPosition(feedKey,start+index);},
          weiter:[{label:'Andere Aktienwelten',href:'#/welten'}]});
        if(start){
          const restart=el('button',{type:'button',class:'v2-feed-restart',text:'Von vorn'});
          restart.onclick=()=>{if(D.memory)D.memory.setPosition(feedKey,0);route();};
          const continuation=el('div',{class:'v2-feed-resume'},[el('span',{text:'Fortgesetzt'}),restart]);
          feedHost.querySelector('.dx-feed-bar').insertBefore(continuation,feedHost.querySelector('.dx-feed-zaehler'));
          feedHost.setAttribute('aria-label','Aktien weiter entdecken · '+order.length+' Titel in der verbleibenden Auswahl');
        }
      } else if(parts[0]==='maerkte'){
        document.title='Märkte — Discover — Vision Universe®';
        await D.Markets.render(root,{calendar,isActive:active});
      } else if(parts[0]==='daten'){
        root.append(D.Daten.render({meta,universe:meta.universes.find(u=>u.universeId===ctx.universeId),calendar}));
      } else {
        const result=await V.Home.render(root,Object.assign({},ctx,{isActive:active}));
        if(typeof result==='function')homeDispose=result;
      }
      if(active())D.Cards.revealOnScroll(root);
    } catch(err) {
      if(active())message(root,'Gerade nicht erreichbar','Die Daten konnten nicht geladen werden. Bitte versuche es noch einmal.',true);
      console.error('Discover route',err);
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
      theme.onChange(syncThemeChrome);syncThemeChrome({resolved:theme.resolved()});
      setupSearch();global.addEventListener('hashchange',route);
      /* Zwei Gruende, neu zu zeichnen: die Kurse sind da, oder der
         Nutzer hat umgeschaltet. Discover rechnet nichts um; es
         fragt den Vertrag und stellt dar, was er sagt. */
      document.addEventListener('vu-currency-change',route);
      document.addEventListener('vu-fx-ready',route);
      if(global.VUFx&&global.VUFx.Bootstrap){
        global.VUFx.Bootstrap.boot().catch(()=>{ /* ohne Kurse bleibt die Originalwaehrung */ });
      }
      await route();
    }catch(err){message(document.getElementById('v2-shell'),'Discover ist gerade nicht erreichbar','Bitte lade die Seite erneut.');}
  }
  boot();
})(window);
