/* Registriert den minimalen Service Worker (/sw.js): nur Offline-Hinweis, kein Daten-Cache. */
(function(){
 if(!('serviceWorker' in navigator)||location.protocol!=='https:'&&location.hostname!=='localhost'&&location.hostname!=='127.0.0.1')return;
 window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(function(){});});
})();
