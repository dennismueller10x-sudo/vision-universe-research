(function (global) {
  'use strict';
  const S = global.QuantShell, D = global.VUDiscover;
  const V = (global.VUDiscover = global.VUDiscover || {}).Views = global.VUDiscover.Views || {};
  const el = S.el, BASE = '/discover/data/';
  let generation = 0, meta, calendar, search, theme, previousFocus, homeDispose, marketDispose;
  const ctx = { universeId: 'US_REAL', openSearch: () => search.open() };
  function syncThemeChrome(state) {
    const color=state&&state.resolved==='light'?'#ffffff':'#08080a';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',color);
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
  // Angemeldet: lokal und Konto gekoppelt (assets/watchlist-button.js#couple, docs/accounts/WATCHLIST.md); sonst rein lokal.
  const localWatch={has:s=>watchlist().includes(s),toggle:saveWatchlist};
  function watchStore(){const W=window.VUWatchButton;return W&&W.couple?W.couple(localWatch):localWatch;}
  ctx.watch=watchStore;ctx.route=()=>route();
  function watchButton(root,symbol){
    const button=el('button',{type:'button',class:'v2-watch-button'});
    const paint=()=>{const saved=watchStore().has(symbol);button.textContent=saved?'♥ Auf Watchlist':'♡ Zur Watchlist';button.setAttribute('aria-pressed',String(saved));button.setAttribute('aria-label',(saved?'Auf Watchlist · ':'')+symbol+(saved?' aus Watchlist entfernen':' zur Watchlist hinzufügen'));};
    button.onclick=()=>{watchStore().toggle(symbol);paint();};paint();root.prepend(button);
    const repaint=()=>{if(button.isConnected)paint();else for(const e of['vu-watchlist-ready','vu-watchlist-change'])removeEventListener(e,repaint);};
    for(const e of['vu-watchlist-ready','vu-watchlist-change'])addEventListener(e,repaint);
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
  let keepIntro=null;
  function shell() {
    const host=document.getElementById('v2-shell'),keep=keepIntro,kept=keep&&keep.closest('main');keepIntro=null;
    // Der Kopf der Startseite (vorgerendert oder frueher gezeichnet) bleibt im DOM: kein neuer Paint, kein neuer LCP-Kandidat.
    if(kept){Array.from(host.children).forEach(n=>{if(n!==kept)n.remove();});return kept;}
    S.clear(host);
    const main=el('main',{id:'v2-main',class:'v2-main',tabindex:'-1'});
    host.append(main); return main;
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
  // Stil aus einem inerten <template> (wie markets.js#ensureStyles): einmal einsetzen, auf das Laden warten, bei Fehler erneut versuchen.
  const cssLoads={};
  function ensureCss(id){
    if(cssLoads[id])return cssLoads[id];
    const tpl=document.getElementById(id),link=tpl&&tpl.content&&tpl.content.firstElementChild&&document.importNode(tpl.content.firstElementChild,true);
    if(!link)return Promise.resolve(false);
    cssLoads[id]=new Promise(resolve=>{link.onload=()=>resolve(true);link.onerror=()=>{delete cssLoads[id];link.remove();resolve(false);};});
    tpl.before(link);return cssLoads[id];
  }
  let fxReady=null;
  async function route(k) {
    if(!meta)return;const y=k===1?scrollY:0;
    const id=++generation,active=()=>generation===id;
    if(homeDispose){homeDispose();homeDispose=null;}
    if(marketDispose){marketDispose();marketDispose=null;}
    if(V.Detail&&V.Detail.dispose)V.Detail.dispose();
    const [path,query]=location.hash.replace(/^#\/?/,'').split('?'),parts=path.split('/').filter(Boolean),q=new URLSearchParams(query||'');// Herkunft im Adress-Zusatz (?reihe=…, ?genre=…)
    // Redesign D05/D08: alte Adressen leiten weiter (#/einzeln/<U> -> #/swipen, #/c/<U>/<Auswahl> -> Thema bzw. Strategie).
    if(parts[0]==='einzeln'){location.replace('#/swipen');return;}
    if(parts[0]==='c'&&parts[1]==='US_REAL'&&parts[2]){const t=V.Themes.byRow(parts[2]);if(t){location.replace(V.Themes.href(t));return;}}
    if(parts[0]==='strategien'&&parts[1]){location.replace('#/c/'+ctx.universeId+'/'+parts[1]);return;}// Seite einer Reihe (Konzept „Reihe für Reihe“, n-row)
    if(D.EuropeView.bindRoute(parts,ctx))return;
    const home=!/^(s|settings|suche|aktien|watchlist|welten|strategien|thema|c|einzeln|swipen|maerkte|daten|reihen)$/.test(parts[0]||''),intro=keepIntro=home?document.querySelector('#v2-shell .v2-home>.dv3-intro'):null,root=shell();root.setAttribute('aria-busy','true');root.classList.toggle('dv3-main',home||/^(welten|strategien|thema|swipen|watchlist|suche|reihen|c)$/.test(parts[0])||(parts[0]==='maerkte'&&!parts[1]));
    document.title='Discover — Vision Universe®';if(!y)global.scrollTo(0,0);
    try {
      // Startseite: Kopf, Maerkte und Themen zeichnen sofort; home.js wartet vor den Karten auf das Intraday-Verzeichnis.
      const index=D.EuropeView.loadIndex(ctx);
      if(!home){await Promise.all([index,D.Lazy&&D.Lazy.forRoute(parts),parts[0]==='maerkte'&&D.Markets.ensureStyles(),parts[0]==='s'&&ensureCss('dx-snav-css'),parts[0]==='s'&&ensureCss('dx-overview-css')]);if(!active())return;}
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
          if(D.memory)D.memory.recordView(symbol,{universeId:ctx.universeId,companyName:detail.companyName,sector:detail.sector,world:detail.world,themes:(detail.themes||[]).map(t=>t&&t.rowId).filter(Boolean)});
        }else await instrument(root,symbol,active);
      } else if(parts[0]==='settings'){
        settings(root);
      } else if(parts[0]==='suche'){
        root.append(el('div',{class:'dv3 vu-ui'},[el('p',{class:'vu-ltag',text:'Discover · Suchen'}),el('h1',{class:'vu-lt',text:'Suchen'}),el('p',{class:'vu-lead',text:'Aktie, Thema oder Strategie – oder eine Frage an Atlas.'})]));
        const open=el('button',{class:'vu-btn vu-btn--ink',type:'button',text:'Suche öffnen'});open.onclick=()=>search.open();root.firstChild.append(open);
        setTimeout(()=>{if(active())search.open();},0);
      } else if(parts[0]==='aktien'){await D.GlobalView.browse(root,active);
      } else if(parts[0]==='watchlist'){
        await D.V3.watchlist(root,ctx,watchlist(),active);if(!active())return;
        await D.GlobalView.watchlist(root,{active,route});
      } else if(parts[0]==='welten'){D.V3.welten(root,ctx);
      } else if(parts[0]==='strategien'){D.V3.strategien(root,ctx);
      } else if(parts[0]==='thema'&&parts[1]){
        const theme=V.Themes.bySlug(parts[1]);
        if(!theme){message(root,'Themenwelt nicht gefunden','Diese Themenwelt gibt es nicht. Alle Welten findest du in der Übersicht.');return;}
        await D.V3.thema(root,ctx,theme,active);
      } else if(parts[0]==='c'&&parts[2]){await D.ReihenUI.rowPage(root,ctx,decodeURIComponent(parts[2]),active);
      } else if(parts[0]==='reihen'){D.ReihenUI.allRows(root,ctx);
      } else if(parts[0]==='swipen'&&q.get('reihe')){await D.ReihenUI.rowSwipe(root,ctx,q.get('reihe'),active);
      } else if(parts[0]==='swipen'){await D.V3.swipen(root,ctx,active);
      } else if(parts[0]==='maerkte'&&parts[1]==='einordnung'){
        await D.Markets.renderEinordnung(root,{calendar,isActive:active,teil:parts[2]});
      } else if(parts[0]==='maerkte'&&parts[1]){
        document.title='Märkte — Discover — Vision Universe®';
        const dispose=await D.MarketDetail.render(root,decodeURIComponent(parts[1]),{calendar,isActive:active});
        if(typeof dispose==='function'){if(active())marketDispose=dispose;else dispose();}
      } else if(parts[0]==='maerkte'){
        document.title='Märkte — Discover — Vision Universe®';
        await D.V3.maerkte(root,{calendar,isActive:active});
      } else if(parts[0]==='daten'){
        root.append(D.Daten.render({meta,universe:meta.universes.find(u=>u.universeId===ctx.universeId),calendar}));
      } else {
        const result=await V.Home.render(root,Object.assign({},ctx,{isActive:active,liveIndex:index,fxReady,intro}));
        if(typeof result==='function')homeDispose=result;
      }
      if(active()){
        D.Cards.revealOnScroll(root);
        if(y)scrollTo(0,y);else if(parts[0]==='c'||parts[0]==='thema'||parts[0]==='strategien')global.requestAnimationFrame(()=>{if(active())global.scrollTo(0,0);});
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
      setupSearch();global.addEventListener('hashchange',function(){return global.VUUI.transition(route);});
      global.VUUI.bindIntent(function(url){if(url.origin!==location.origin||url.pathname!=='/discover/')return null;const p=url.hash.replace(/^#\/?/,'').split('/');return p[0]==='s'&&p[1]===ctx.universeId&&/^[A-Z0-9.-]{1,24}$/.test(p[2]||'')?p[2]:null;},function(t){return S.loadJSON(BASE+'stocks/'+ctx.universeId+'/'+t+'.json');});
      if('scrollRestoration' in history)history.scrollRestoration='manual';
      document.addEventListener('vu-currency-change',()=>route(1));
      document.addEventListener('vu-fx-ready',()=>route(1));
      if(global.VUFx&&global.VUFx.Bootstrap){
        fxReady=global.VUFx.Bootstrap.boot().catch(()=>{ /* ohne Kurse bleibt die Originalwaehrung */ });
      }
      await route();
    }catch(err){message(document.getElementById('v2-shell'),'Discover ist gerade nicht erreichbar','Bitte lade die Seite erneut.');}
  }
  boot();
})(window);
