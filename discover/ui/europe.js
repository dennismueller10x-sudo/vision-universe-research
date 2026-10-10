/* Optional Europe screens use the existing Discover components and styles. */
(function (global) {
  'use strict';
  const D=global.VUDiscover, el=global.QuantShell.el;
  function navigationAllowed(){return false;}
  function attachApp({ctx,route,isReady}) {
    D.App={configureEurope(options){
      if(!D.EuropeProduct)throw Error('EUROPE_PRODUCT_MODULE_REQUIRED');
      D.europeProduct=D.EuropeProduct.create(options);
      if(isReady()&&ctx.universeId==='EUROPE')route();
      return D.europeProduct;
    },async selectUniverse(universeId){
      if(universeId==='EUROPE'&&!D.europeProduct&&D.europePublicLoader)await D.europePublicLoader.connect();
      if(!['US_REAL','EUROPE'].includes(universeId)||(universeId==='EUROPE'&&!D.europeProduct))throw Error('UNIVERSE_NOT_CONFIGURED');
      ctx.universeId=universeId;global.location.hash=universeId==='EUROPE'?'#/c/EUROPE/all':'#/';return route();
    },route};
  }
  function bindRoute(parts,ctx) {
    ctx.universeId = ['s','c','u','watchlist'].includes(parts[0]) && parts[1] === 'EUROPE' ? 'EUROPE' : 'US_REAL';
    return false;
  }
  function handles(parts,ctx) { return ctx.universeId==='EUROPE'&&['s','c','u','watchlist'].includes(parts[0]); }
  function loadIndex(ctx) { return ctx.universeId==='EUROPE'?null:D.LiveHub.loadIndex().catch(()=>null); }
  function watchButton(root,id,product,symbol) {
    const button=el('button',{type:'button',class:'v2-watch-button'});
    const paint=()=>{
      const saved=product.savedIds().includes(id);
      button.textContent=saved?'♥ Auf Watchlist':'♡ Zur Watchlist';
      button.setAttribute('aria-pressed',String(saved));
      button.setAttribute('aria-label',(saved?'Auf Watchlist · ':'')+symbol+(saved?' aus Watchlist entfernen':' zur Watchlist hinzufügen'));
    };
    button.onclick=async()=>{if((await product.toggle(id)).state==='AVAILABLE')paint();};
    paint();root.prepend(button);
  }
  async function render(root,{parts,ctx,route,active,message}) {
    if(!D.europeProduct&&D.europePublicLoader){try{await D.europePublicLoader.connect();}catch(_){}}
    if(!active())return;
    const product=D.europeProduct;
    if(!product){message(root,'Europa noch nicht verfügbar','Dieses Universum ist noch nicht freigegeben.');return;}
    if(parts[0]==='s'){
      const id=decodeURIComponent(parts[2]),result=await product.detail(id);if(!active())return;
      if(result.state!=='AVAILABLE'){message(root,'Aktie derzeit nicht verfügbar','Identität, Datenqualität oder Anzeigerechte sind noch nicht freigegeben.');return;}
      const detail=result.data;root.classList.add('dx-detail');
      D.Views.Detail.render(root,detail,Object.assign({},ctx,{universeId:'EUROPE'}));
      const title=root.querySelector('.dx-dhero-title h1');if(title)title.style.overflowWrap='anywhere';
      const states=el('section',{class:'dx-chapter','aria-label':'Verfügbarkeit der Analysen'},[
        el('p',{text:detail.quantMessage}),el('p',{text:detail.technicalMessage})]);
      if(detail.privatePreview)states.prepend(el('p',{class:'dx-intraday-note',text:detail.disclaimer}));
      if(detail.freshness==='DELAYED'||detail.freshness==='STALE')states.append(el('p',{class:'dx-intraday-note',text:'Verzögerter Tagesschlusskurs vom '+detail.asOf+'. Kein Echtzeitkurs.'}));
      const analysis=root.querySelector('.dx-analyse');
      if(analysis)analysis.before(states);else root.append(states);
      watchButton(root,id,product,detail.symbol);document.title=(detail.companyName||detail.symbol)+' — Discover';
    }else if(parts[0]==='watchlist'){
      document.title='Watchlist — Discover — Vision Universe®';
      root.append(el('p',{class:'v2-eyebrow',text:'Deine Auswahl'}),el('h1',{text:'Watchlist'}));
      const result=await product.saved();if(!active())return;
      const members=result.data.members,list=el('div',{class:'v2-watch-list'});root.append(list);
      if(!members.length)list.append(el('p',{class:'v2-lead',text:'Noch keine europäischen Aktien gespeichert.'}));
      members.forEach(member=>{
        const title=member.state==='AVAILABLE'?(member.name||member.ticker):'Gespeicherter Titel derzeit nicht verfügbar';
        const label=member.href?el('a',{href:member.href,text:title}):el('span',{text:title});
        const row=el('div',{class:'v2-watch-row'},[label,el('button',{type:'button',text:'Entfernen','aria-label':title+' aus Watchlist entfernen'})]);
        row.querySelector('button').onclick=()=>{product.remove(member.securityId);route();};list.append(row);
      });
    }else{
      const result=await product.browse({offset:0,limit:48});if(!active())return;
      if(result.state!=='AVAILABLE'){message(root,'Europa noch nicht verfügbar','Geprüfte Daten und Anzeigerechte werden vor der Freigabe benötigt.');return;}
      const grid=D.Cards.grid(result.data.cards,{universeId:'EUROPE'});
      grid.querySelectorAll('.dx-poster').forEach(card=>card.removeAttribute('aria-label'));
      root.append(el('h1',{text:result.data.title}),el('p',{class:'v2-lead',text:result.data.rule}),grid);
      let offset=result.data.nextOffset;
      if(offset!==null){const more=el('button',{type:'button',class:'v2-button',text:'Weitere Aktien'});root.append(more);
        more.onclick=async()=>{more.disabled=true;try{const next=await product.browse({offset,limit:48});if(!active())return;
          if(next.state!=='AVAILABLE'){more.textContent='Weitere Aktien derzeit nicht verfügbar';return;}
          const extra=D.Cards.grid(next.data.cards,{universeId:'EUROPE'});extra.querySelectorAll('.dx-poster').forEach(card=>card.removeAttribute('aria-label'));more.before(extra);
          offset=next.data.nextOffset;if(offset===null)more.remove();D.Cards.revealOnScroll(extra);
        }finally{more.disabled=false;}};}
    }
  }
  D.EuropeView={navigationAllowed,attachApp,bindRoute,handles,loadIndex,render};
})(typeof globalThis!=='undefined'?globalThis:this);
