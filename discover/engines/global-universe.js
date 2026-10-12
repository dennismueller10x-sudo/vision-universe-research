/* Browser composition of canonical contracts; independent of provider or route. */
(function(root){'use strict';const D=root.VUDiscover,S=root.QuantShell;let authorityCache,authorityExpires=0;
 async function authority(){if(authorityCache&&Date.now()<authorityExpires)return authorityCache;authorityExpires=Date.now()+30000;authorityCache=resolveAuthority().then(a=>{if(!a)authorityExpires=0;return a;});return authorityCache;}
 // europe-bootstrap.js ist das letzte Skript des Starts; ein frueher Aufruf (vorgeholte Daten, gemerkter Tipp auf die Suche) kann ihm zuvorkommen.
 function bootstrap(){return new Promise(resolve=>{const t0=Date.now();(function poll(){if(D.EuropeBootstrap||Date.now()-t0>8000)resolve(D.EuropeBootstrap);else setTimeout(poll,25);})();});}
 function within(promise,ms){let timer;return Promise.race([promise,new Promise(resolve=>{timer=setTimeout(resolve,ms);})]).finally(()=>clearTimeout(timer));}
 // Das Europa-Verzeichnis wird erst hier angefordert (Suche, Alle-Aktien-Liste, Watchlist), nicht beim Seitenstart.
 // Die Suche wartet auf die Antwort, statt nach 2 s ohne Europa-Treffer zu antworten (langsame Netze).
 async function resolveAuthority(){try{const B=D.europePublicLoader?null:await bootstrap();if(!D.europePublicLoader){if(B&&B.ensure)await within(B.ensure(),20000);else await new Promise(resolve=>{const done=()=>{clearTimeout(timer);document.removeEventListener('vu-europe-available',done);resolve();};const timer=setTimeout(done,2000);document.addEventListener('vu-europe-available',done,{once:true});});}return D.europePublicLoader?await D.europePublicLoader.authority():null;}catch(_){return null;}}
 const client=root.VUCore.Client.create({load:path=>S.loadJSON(path)});
 function data(result){if(result.state!=='AVAILABLE')throw Error(result.reason);return result.data;}
 D.GlobalUniverse={ready:authority,warm(){return Promise.all([authority(),client.getDiscoverSearch('')]).then(()=>true,()=>false);},async search(q){return data(await client.getDiscoverSearch(q,{authority:await authority()}));},async home(){return data(await client.getDiscoverHome({authority:await authority()})).cards;},async browse(region,offset,limit){return data(await client.getDiscoverUniverse({region,offset,limit,authority:await authority()})).entries;}};
})(window);
