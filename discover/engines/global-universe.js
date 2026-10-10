/* Browser composition of canonical contracts; independent of provider or route. */
(function(root){'use strict';const D=root.VUDiscover,S=root.QuantShell;let authorityCache,authorityExpires=0;
 async function authority(){if(authorityCache&&Date.now()<authorityExpires)return authorityCache;authorityExpires=Date.now()+30000;authorityCache=resolveAuthority();return authorityCache;}
 async function resolveAuthority(){try{if(!D.europePublicLoader){await new Promise(resolve=>{const done=()=>{clearTimeout(timer);document.removeEventListener('vu-europe-available',done);resolve();};const timer=setTimeout(done,2000);document.addEventListener('vu-europe-available',done,{once:true});});}return D.europePublicLoader?await D.europePublicLoader.authority():null;}catch(_){return null;}}
 const client=root.VUCore.Client.create({load:path=>S.loadJSON(path)});
 function data(result){if(result.state!=='AVAILABLE')throw Error(result.reason);return result.data;}
 D.GlobalUniverse={ready:authority,async search(q){return data(await client.getDiscoverSearch(q,{authority:await authority()}));},async home(){return data(await client.getDiscoverHome({authority:await authority()})).cards;},async browse(region,offset,limit){return data(await client.getDiscoverUniverse({region,offset,limit,authority:await authority()})).entries;}};
})(window);
