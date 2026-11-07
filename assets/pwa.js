/* Registriert den E5-Cache für öffentliche Assets und den Offline-Hinweis. */
(function(){
 if(!('serviceWorker' in navigator)||location.protocol!=='https:'&&location.hostname!=='localhost'&&location.hostname!=='127.0.0.1')return;
 function register(){navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(function(){});}
 if(document.readyState==='complete')register();else window.addEventListener('load',register,{once:true});
})();
