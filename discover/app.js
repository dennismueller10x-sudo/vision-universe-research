(function (global) {
  'use strict';
  const S = global.QuantShell, D = global.VUDiscover;
  const V = (global.VUDiscover = global.VUDiscover || {}).Views = global.VUDiscover.Views || {};
  const el = S.el, BASE = '/discover/data/';
  let generation = 0, meta, calendar, search, theme, previousFocus, homeDispose, marketDispose;
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
  const WATCH_KEY='vu-discover-watchlist-v1';
  function watchlist(){try{const data=JSON.parse(localStorage.getItem(WATCH_KEY)||'[]');return Array.isArray(data)?data.filter(s=>/^[A-Z0-9.\-]{1,24}$/.test(s)).slice(0,100):[];}catch(_){return [];}}
  function saveWatchlist(symbol){
    const list=watchlist(),index=list.indexOf(symbol);
    if(index<0)list.unshift(symbol);else list.splice(index,1);
    try{localStorage.setItem(WATCH_KEY,JSON.stringify(list));}catch(_){}
    return index<0;
  }
  function watchButton(root,symbol){
    const button=el('button',{type:'button',class:'v2-watch-button'});
    const paint=()=>{const saved=watchlist().includes(symbol);button.textContent=saved?'♥ Auf Watchlist':'♡ Zur Watchlist';button.setAttribute('aria-pressed',String(saved));button.setAttribute('aria-label',symbol+(saved?' aus Watchlist entfernen':' zur Watchlist hinzufügen'));};
    button.onclick=()=>{saveWatchlist(symbol);paint();};paint();root.prepend(button);
  }
  D.EuropeView.attachApp({ctx,route,isReady:()=>meta});
  function settings(root){
    document.title='Einstellungen — Discover — Vision Universe®';
    root.append(el('p',{class:'v2-eyebrow',text:'Deine Ansicht'}),el('h1',{text:'Einstellungen'}),el('p',{class:'v2-lead',text:'Währung und Darstellung gelten für deine Ansicht auf diesem Gerät.'}));
    const box=el('section',{class:'v2-settings'});
    const currency=el('div',{class:'v2-settings-row'},[el('div',{},[el('h2',{text:'Währung'}),el('p',{text:'Anzeige in Euro oder US-Dollar, sofern Kurse verfügbar sind.'})])]);
    const layer=global.VUFx&&global.VUFx.layer;
    if(layer&&global.VUFx.Switch)currency.append(global.VUFx.Switch.create({layer}));
    const appearance=el('div',{class:'v2-settings-row'},[el('div',{},[el('h2',{text:'Darstellung'}),el('p',{text:'Standard ist Hell. Dunkel kannst du hier auswählen.'})])]);
    const choices=el('div',{class:'v2-settings-choices',role:'group','aria-label':'Darstellung'});
    const paint=()=>{choices.replaceChildren();[['light','Hell'],['dark','Dunkel']].forEach(([mode,label])=>{const b=el('button',{type:'button',text:label,'aria-pressed':String(theme.mode()===mode)});b.onclick=()=>{theme.set(mode);paint();};choices.append(b);});};paint();appearance.append(choices);
    box.append(currency,appearance);root.append(box);
  }
  const THEME_GROUPS=[['t','Technologie & Vernetzung'],['h','Gesundheit'],['e','Energie & Rohstoffe'],['i','Industrie & Infrastruktur'],['f','Finanzen & Immobilien'],['c','Konsum & Mobilität']];
  function themeRail(cards,detailCtx,title,rowId){
    if(!cards.length)return null;
    const section=el('section',{class:'v2-theme-stocks v2-world'},[el('div',{class:'v2-world-head'},[el('h2',{text:title})])]);
    const track=el('div',{class:'v2-track',role:'list','aria-label':title});
    cards.forEach((card,i)=>{const item=el('div',{class:'v2-track-item',role:'listitem'});item.append(V.Home.tile(card,detailCtx,{rowId,position:i}));track.append(item);});
    section.append(D.Cards.withRailNav(track,{label:title,universeId:detailCtx.universeId}));return section;
  }
  function footer() {
    return el('footer',{class:'v2-footer'},[
      el('b',{text:'VISION UNIVERSE®'}),
      el('p',{text:'Aktien entdecken. Unternehmen verstehen.'}),
      el('p',{text:meta.disclaimer || 'Informationen zur eigenen Recherche.'}),
      el('p',{},[el('a',{href:'#/maerkte',text:'Märkte'}),document.createTextNode(' · '),el('a',{href:'#/daten',text:'Daten & Quellen'})])
    ]);
  }
  function shell() {
    const host=document.getElementById('v2-shell'); S.clear(host);
    const main=el('main',{id:'v2-main',class:'v2-main',tabindex:'-1'});
    host.append(main,footer()); return main;
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
      const dock=document.getElementById('vu-dock');if(dock)dock.inert=isOpen;
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
    watchButton(root,symbol);
  }
  async function route(k) {
    if(!meta)return;const y=k===1?scrollY:0;
    const id=++generation,active=()=>generation===id;
    if(homeDispose){homeDispose();homeDispose=null;}
    if(marketDispose){marketDispose();marketDispose=null;}
    if(V.Detail&&V.Detail.dispose)V.Detail.dispose();
    const parts=location.hash.replace(/^#\/?/,'').split('/').filter(Boolean);
    if(D.EuropeView.bindRoute(parts,ctx))return;
    document.body.classList.toggle('dx-feed-aktiv',parts[0]==='einzeln');
    document.body.classList.toggle('v2-feed-active',parts[0]==='einzeln');
    const root=shell();root.setAttribute('aria-busy','true');
    document.title='Discover — Vision Universe®';if(!y)global.scrollTo(0,0);
    try {
      await D.EuropeView.loadIndex(ctx);if(!active())return;
      if(D.EuropeView.handles(parts,ctx)){await D.EuropeView.render(root,{parts,ctx,route,active,message});}
      else if(parts[0]==='s'&&parts[2]){
        const symbol=decodeURIComponent(parts[2]).toUpperCase();
        if(!/^[A-Z0-9.\-]{1,24}$/.test(symbol))throw Error('Ungültiges Aktienkürzel');
        const index=await S.loadJSON(BASE+'stock-index/'+ctx.universeId+'.json');if(!active())return;
        if(index.symbols.includes(symbol)){
          const detail=await S.loadJSON(BASE+'stocks/'+ctx.universeId+'/'+symbol+'.json');if(!active())return;
          root.classList.add('dx-detail');V.Detail.render(root,detail,ctx);
          watchButton(root,symbol);
          document.title=(detail.companyName||symbol)+' — Discover';
          if(D.memory)D.memory.recordView(symbol,{universeId:ctx.universeId,companyName:detail.companyName,sector:detail.sector,world:detail.world});
        }else await instrument(root,symbol,active);
      } else if(parts[0]==='settings'){
        settings(root);
      } else if(parts[0]==='suche'){
        root.append(el('h1',{text:'Aktien suchen'}),el('p',{class:'v2-lead',text:'Finde Unternehmen über den Namen oder das Börsenkürzel.'}));
        const open=el('button',{class:'v2-button',type:'button',text:'Suche öffnen'});open.onclick=()=>search.open();root.append(open);
        setTimeout(()=>{if(active())search.open();},0);
      } else if(parts[0]==='watchlist'){
        document.title='Watchlist — Discover — Vision Universe®';
        root.append(el('p',{class:'v2-eyebrow',text:'Deine Auswahl'}),el('h1',{text:'Watchlist'}));
        const symbols=watchlist();
        if(!symbols.length){root.append(el('p',{class:'v2-lead',text:'Noch keine Aktien gespeichert. Öffne eine Aktie und tippe auf „Zur Watchlist“.'}),el('a',{class:'v2-pill v2-pill-dark',href:'#/',text:'Aktien entdecken →'}));}
        else{
          const list=el('div',{class:'v2-watch-list'});root.append(list);
          symbols.forEach(symbol=>{const row=el('div',{class:'v2-watch-row'},[el('a',{href:'#/s/'+ctx.universeId+'/'+encodeURIComponent(symbol),text:symbol}),el('button',{type:'button',text:'Entfernen','aria-label':symbol+' aus Watchlist entfernen'})]);row.querySelector('button').onclick=()=>{saveWatchlist(symbol);row.remove();if(!list.children.length)route();};list.append(row);});
        }
      } else if(parts[0]==='welten'){
        root.append(el('p',{class:'v2-eyebrow',text:'Dein nächster Blickwinkel'}),el('h1',{text:'Themenwelten'}),el('p',{class:'v2-lead',text:'Entdecke Megatrends und Branchen. Wähle eine Welt und entdecke die Aktien dahinter.'}));
        root.append(el('div',{class:'v2-collection-hero'},[el('img',{src:V.Home.perspectiveImage('megatrends'),alt:'',width:'1254',height:'1254',decoding:'async'})]));
        root.append(el('div',{class:'v2-section-head'},[el('h2',{text:'Themenwelten'}),el('span',{text:V.Themes.all.length+' Welten'})]));
        const jumps=el('nav',{class:'v2-theme-jumps','aria-label':'Themenbereiche'});root.append(jumps);
        THEME_GROUPS.forEach(([group,label])=>{
          const themes=V.Themes.all.filter(t=>t.group===group);if(!themes.length)return;
          const jump=el('button',{type:'button',text:label});jump.onclick=()=>document.getElementById('v2-group-'+group)?.scrollIntoView({block:'start',behavior:'smooth'});jumps.append(jump);
          const section=el('section',{class:'v2-theme-group',id:'v2-group-'+group});
          section.append(el('div',{class:'v2-section-head'},[el('h2',{text:label}),el('span',{text:themes.length+' Themen'})]));
          const grid=el('div',{class:'v2-theme-grid'});themes.forEach(t=>grid.append(V.Home.themeTile(t,ctx)));
          section.append(grid);root.append(section);
        });
      } else if(parts[0]==='strategien'){
        document.title='Strategien — Discover — Vision Universe®';
        root.append(el('p',{class:'v2-eyebrow',text:'Gezielt entdecken'}),el('h1',{text:'Strategien'}),el('p',{class:'v2-lead',text:'Aktienauswahlen nach Wachstum, Qualität und Marktbewegung. Entdecke die Regeln und Unternehmen hinter jeder Auswahl.'}));
        const rows=(meta.rows||[]).find(entry=>entry.universeId===ctx.universeId);
        const list=el('div',{class:'v2-collection-links'});
        ((rows&&rows.rows)||[]).filter(row=>row.returned>0&&!V.Themes.byRow(row.rowId)).forEach(row=>list.append(V.Home.strategyLink(row,ctx)));
        root.append(list);
      } else if(parts[0]==='thema'&&parts[1]){
        const theme=V.Themes.bySlug(parts[1]);
        if(!theme){message(root,'Themenwelt nicht gefunden','Diese Themenwelt gibt es nicht. Alle Welten findest du in der Übersicht.');return;}
        document.title=theme.title+' — Discover';
        root.append(el('a',{class:'v2-back',href:'#/welten',text:'← Alle Themenwelten'}));
        const row=theme.rowId?await S.loadJSON(BASE+'rows/'+ctx.universeId+'/'+theme.rowId+'.json').catch(()=>null):null;if(!active())return;
        const count=row&&(row.cards||[]).length;
        root.append(V.Home.themeBanner(theme,{page:true,eyebrow:'Themenwelt '+String(theme.n).padStart(2,'0'),subtitle:theme.short+' — '+theme.line,
          evidence:count?count+' Aktien · Redaktionelle Themenzuordnung':'In Vorbereitung'}));
        const overview=el('section',{class:'v2-theme-overview'},[el('h2',{text:'Überblick'}),el('p',{text:theme.line})]);
        if(count)overview.append(el('p',{class:'v2-theme-facts',text:count+' Aktien aus dem Discover-Universum'+(row.asOf?' · Stand '+D.Cards.dateShort(row.asOf):'')+' · Redaktionelle Zuordnung'}));
        root.append(overview);
        if(row&&count){
          if(row.rule){root.append(el('details',{class:'v2-rule',open:true},[el('summary',{text:'Wie entsteht diese Auswahl?'}),el('p',{text:row.rule})]));}
          if(D.memory)D.memory.recordCollection(row.rowId||theme.rowId);
          const detailCtx=Object.assign({},ctx,{artworkDisposers:[]});
          const featured=themeRail(row.cards.slice(0,4),detailCtx,'Im Blick',row.rowId);
          const more=themeRail(row.cards.slice(4),detailCtx,'Weitere Aktien dieser Themenwelt',row.rowId);
          if(featured)root.append(featured);if(more)root.append(more);
          homeDispose=()=>detailCtx.artworkDisposers.forEach(dispose=>dispose());
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
        const rowTheme=V.Themes.byRow(row.rowId||parts[2]);
        root.append(el('a',{class:'v2-back',href:rowTheme?'#/welten':'#/strategien',text:rowTheme?'← Themenwelten':'← Strategien'}));
        if(rowTheme)root.append(V.Home.themeBanner(rowTheme,{page:true,title:V.Home.title(row.title),subtitle:row.subtitle||rowTheme.line,evidence:(row.cards||[]).length+' Aktien'}));
        else {
          const photo=V.Home.perspectiveImage(row.rowId||parts[2]);
          if(photo)root.append(el('div',{class:'v2-collection-hero'},[el('img',{src:photo,alt:'',width:'1254',height:'1254',decoding:'async'})]));
          root.append(el('h1',{text:V.Home.title(row.title)}),el('p',{class:'v2-lead',text:row.subtitle||''}));
        }
        if(row.index&&row.index.asOf)root.append(el('p',{class:'v2-collection-source',text:'Mitglieder laut '+(row.index.proxy&&row.index.proxy.etf?'ETF-Bestand '+row.index.proxy.etf:'Indexeigentümer')+' · '+D.Cards.dateShort(row.index.asOf)}));
        if(row.editorial)root.append(el('p',{text:'Redaktionelle Themenzuordnung. Die Reihenfolge folgt der bestehenden Methodik.'}));
        if(row.rule){const rule=el('details',{class:'v2-rule',open:true},[el('summary',{text:'Wie entsteht diese Auswahl?'}),el('p',{text:row.rule})]);root.append(rule);}
        if(D.memory)D.memory.recordCollection(row.rowId||parts[2]);
        if(row.sectors)root.append(D.Surfaces.sectors({title:row.title,sectors:row.sectors},ctx));
        else root.append(D.Cards.grid(row.cards||[],{rowId:row.rowId,universeId:ctx.universeId,world:row.world}));
      } else if(parts[0]==='einzeln'){
        const feed=await S.loadJSON(BASE+'feed/'+ctx.universeId+'.json');if(!active())return;
        const feedKey='feed:'+ctx.universeId;
        const resume=D.memory?D.memory.position(feedKey):0;
        const fullOrder=feed.order||[],batch=feed.batchSize||12;
        const start=Number.isInteger(resume)&&resume>0&&resume<fullOrder.length?resume:0;
        const order=fullOrder.slice(start);
        const cards=start?await Promise.all(order.slice(0,batch).map(async entry=>{
          const card=await S.loadJSON(BASE+'stocks/'+ctx.universeId+'/'+entry.s+'.json');
          return Object.assign({},card,{herkunft:entry.herkunft||card.herkunft||null});
        })):feed.cards||[];
        if(!active())return;
        const feedHost=D.Feed.render(root,cards,{universeId:ctx.universeId,zurueck:'#/',order,batchSize:batch,
          merken:index=>{if(active()&&D.memory)D.memory.setPosition(feedKey,start+index);},
          weiter:[{label:'Strategien entdecken',href:'#/strategien'}]});
        if(start){
          const restart=el('button',{type:'button',class:'v2-feed-restart',text:'Von vorn'});
          restart.onclick=()=>{if(D.memory)D.memory.setPosition(feedKey,0);route();};
          const continuation=el('div',{class:'v2-feed-resume'},[el('span',{text:'Fortgesetzt'}),restart]);
          feedHost.querySelector('.dx-feed-bar').insertBefore(continuation,feedHost.querySelector('.dx-feed-zaehler'));
          feedHost.setAttribute('aria-label','Aktien weiter entdecken · '+order.length+' Titel in der verbleibenden Auswahl');
        }
      } else if(parts[0]==='maerkte'&&parts[1]==='einordnung'){
        await D.Markets.renderEinordnung(root,{calendar,isActive:active,teil:parts[2]});
      } else if(parts[0]==='maerkte'&&parts[1]){
        document.title='Märkte — Discover — Vision Universe®';
        const dispose=await D.MarketDetail.render(root,decodeURIComponent(parts[1]),{calendar,isActive:active});
        if(typeof dispose==='function'){if(active())marketDispose=dispose;else dispose();}
      } else if(parts[0]==='maerkte'){
        document.title='Märkte — Discover — Vision Universe®';
        await D.Markets.render(root,{calendar,isActive:active});
      } else if(parts[0]==='daten'){
        root.append(D.Daten.render({meta,universe:meta.universes.find(u=>u.universeId===ctx.universeId),calendar}));
      } else {
        const result=await V.Home.render(root,Object.assign({},ctx,{isActive:active}));
        if(typeof result==='function')homeDispose=result;
      }
      if(active()){
        D.Cards.revealOnScroll(root);
        if(y)scrollTo(0,y);else if(parts[0]==='c'||parts[0]==='thema')global.requestAnimationFrame(()=>{if(active())global.scrollTo(0,0);});
      }
    } catch(err) {
      if(active())message(root,'Gerade nicht erreichbar','Die Daten konnten nicht geladen werden. Bitte versuche es noch einmal.',true);
      console.error('Discover route',err);
    } finally {if(active()){root.setAttribute('aria-busy','false');if(global.VUNavigation)global.VUNavigation.dock({});}}
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
      theme=D.Theme.create({storage,document});D.theme=theme;D.memory=D.Memory.create();
      theme.onChange(state=>{syncThemeChrome(state);document.dispatchEvent(new Event('vu-theme-change'));});syncThemeChrome({resolved:theme.resolved()});
      document.querySelector('vu-navigation')?.renderSettings();
      setupSearch();global.addEventListener('hashchange',route);
      if('scrollRestoration' in history)history.scrollRestoration='manual';
      document.addEventListener('vu-currency-change',()=>route(1));
      document.addEventListener('vu-fx-ready',()=>route(1));
      if(global.VUFx&&global.VUFx.Bootstrap){
        global.VUFx.Bootstrap.boot().catch(()=>{ /* ohne Kurse bleibt die Originalwaehrung */ });
      }
      await route();
    }catch(err){message(document.getElementById('v2-shell'),'Discover ist gerade nicht erreichbar','Bitte lade die Seite erneut.');}
  }
  boot();
})(window);
