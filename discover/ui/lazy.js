/* =========================================================================
   VISION UNIVERSE DISCOVER — ui/lazy.js

   SKRIPTGRUPPEN BEI BEDARF NACHLADEN

   Die Startseite braucht Kopf, Navigation, Marktleiste, Karten und Suche.
   Aktiendetail, Maerkte-Unterseiten, Daten & Quellen und der
   Einzelnansichts-Feed sind eigene Routen. Ihre Skripte (zusammen rund die
   Haelfte des Startseiten-JavaScripts) stehen deshalb nicht mehr als
   blockierende <script>-Tags in index.html, sondern als inerte
   <template id="dx-lazy-NAME"> - dieselben Adressen, dieselben ?v=-
   Schluessel der Release-Pipeline (version-consumer-assets.mjs ersetzt
   src-Attribute im ganzen Dokument), aber ohne Abruf beim Start.

   Geladen wird
     - sofort, wenn die Route die Gruppe braucht (forRoute, von app.js),
     - sofort, wenn jemand ein Ziel beruehrt oder darueber faehrt (Aktienkarte,
       Maerkte-Link): bis zum Loslassen laeuft der Abruf,
     - im Leerlauf nach der ersten Eingabe (Beruehrung, Taste) oder
       spaetestens WARM_AFTER_MS nach dem load-Ereignis - nie vor den ersten
       Karten der Startseite und nur, solange die Startseite offen ist. Wer auf eine Aktie tippt, wartet damit in aller
       Regel nicht auf Skripte. Bei Datensparmodus oder 2G entfaellt das
       Vorladen; die Route laedt ihre Gruppe dann beim Oeffnen.

   Reihenfolge und Wiederholung: Der Abruf der Skripte einer Gruppe laeuft parallel (<link rel=preload as=script>, gleiche Adresse
   inkl. ?v=, daher kein zweiter Download); eingefuegt und ausgefuehrt werden die <script>-Knoten strikt nacheinander in
   Gruppenreihenfolge. So kann ein voruebergehend ausgefallenes Skript (HTTP 5xx, Netzfehler) VOR seinen Nachfolgern
   wiederholt werden, und scheitert es endgueltig, laeuft kein Nachfolger (diese halten Globale beim Laden fest, z. B.
   detail.js: var Ranges = global.VUChartRanges). Die Gruppe meldet nie "geladen", wenn ein Skript nach seinen Nachfolgern
   lief. Gleiche Adressen (ohne Query) werden nur einmal geladen, auch wenn zwei Gruppen sie nennen. Ohne
   Vorladen-Unterstuetzung des Browsers werden die Skripte nacheinander abgerufen.

   DEPLOYMENT-WECHSEL MIT OFFENEM TAB
   Ein Tab, der vor einem Release geoeffnet wurde, hat das alte app.js im Speicher; die Gruppen kaemen aus dem neuen Release
   und passten nicht dazu (ein altes ?v= bekommt vom Server trotzdem die neue Datei). Deshalb fragt load() vor jeder Gruppe
   den Release-Waechter (quant/ui/release-guard.js): ist inzwischen ein neuer Code-Stand ausgeliefert, laedt die Seite
   einmal neu - kontrolliert, mit Route und Eingaben - statt neuen neben alten Code zu setzen. Ohne Waechter oder ohne
   Kennung (Quelltext, Tests) bleibt es beim bisherigen Verhalten: ein Ladefehler laedt einmal neu.
   ========================================================================= */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.VUDiscover = root.VUDiscover || {}; root.VUDiscover.Lazy = api; api.watch(); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  /** Route (erstes Hash-Segment) -> Gruppen, die sie vor dem Zeichnen braucht. */
  var ROUTES = { s: ['detail'], maerkte: ['markets'], daten: ['daten'], einzeln: ['feed'] };
  /** Reihenfolge des Vorladens im Leerlauf: wahrscheinlichster naechster Schritt zuerst. */
  var WARM = ['detail', 'markets', 'daten', 'feed'];
  var WARM_AFTER_MS = 8000;
  var DRAWN_WAIT_MS = 6000;

  var scripts = Object.create(null);   // Adresse ohne Query -> Promise
  var groups = Object.create(null);    // Gruppenname -> Promise

  function doc() { return root.document; }

  function sources(name) {
    var template = doc().getElementById('dx-lazy-' + name);
    if (!template) throw new Error('LAZY_GROUP_UNKNOWN:' + name);
    var scope = template.content || template;
    return Array.prototype.map.call(scope.querySelectorAll('script[src]'), function (s) { return s.getAttribute('src'); });
  }

  /**
   * Build-Stempel der Release-Pipeline: version-consumer-assets.mjs haengt ?v=<Hash> an detail.js (und Company-Intelligence).
   * Derselbe Stempel geht an die uebrigen nachgeladenen Skripte, damit ein Release sie unter neuer Adresse anbietet statt aus dem
   * 10-Minuten-Cache. Ohne Pipeline (Quelltext, Tests) gibt es keinen Stempel.
   */
  var stampValue;
  function stamp() {
    if (stampValue !== undefined) return stampValue;
    stampValue = '';
    try {
      var template = doc().getElementById('dx-lazy-detail');
      var all = template ? Array.prototype.map.call((template.content || template).querySelectorAll('script[src]'), function (s) { return s.getAttribute('src'); }) : [];
      var hit = all.filter(function (src) { return /\/ui\/detail\.js\?v=([0-9a-f]+)/.test(src); })[0];
      if (hit) stampValue = hit.split('?v=')[1];
    } catch (_) { /* ohne Stempel */ }
    return stampValue;
  }
  /** Release-Waechter mit Kennung dieses Tabs (Pipeline-Release), sonst null. */
  function guard() {
    var g = root.VUReleaseGuard;
    return g && typeof g.known === 'function' && g.known() ? g : null;
  }
  /**
   * Ein Ladefehler einer Gruppe (z. B. Skript nach einem Deploy nicht mehr da) laedt die Seite einmal neu - dann passen alle Teile zusammen.
   * Mit Waechter entscheidet dieser, ob ein neuer Release der Grund ist (sonst waere es ein Netzfehler und das Neuladen wertlos).
   */
  function reloadOnce() {
    try {
      if (!root.location || !root.location.reload || !root.sessionStorage) return;
      if (root.sessionStorage.getItem('vu-lazy-reload')) return;
      root.sessionStorage.setItem('vu-lazy-reload', '1');
      root.location.reload();
    } catch (_) { /* ohne Speicher keine Schleife riskieren */ }
  }

  /**
   * Kontrollierte Wiederholung bei voruebergehenden Serverfehlern (z. B. kurzes Pages-503).
   * Ein <script>/<link>-Tag meldet nur onerror, ohne Statuscode. Deshalb fragt der erste Fehler eine leichte Statusprobe
   * (HEAD, cache:'no-store', Body wird nie gelesen) auf dieselbe Adresse ab:
   *   5xx, 408, 429, Netzfehler/Zeitueberschreitung der Probe, oder Probe ok (Datei war nur kurz weg) -> erneut versuchen;
   *   sonstige 4xx (404/403 ...) oder keine Probe moeglich (kein fetch)                                -> sofort Fehler.
   * Grenzen je Skript: hoechstens `attempts` Versuche, Wartezeiten `delays` (+ Jitter), `budgetMs` als Obergrenze fuer die seit
   * dem ersten Versuch verstrichene Zeit (inkl. Proben) vor einer weiteren Wiederholung. Schlimmster Fall bis zum endgueltigen
   * Fehler: etwa budgetMs plus die Dauer der letzten Versuche. Im Normalfall (alles laedt) entsteht kein Zusatzrequest.
   */
  var RETRY = { attempts: 3, delays: [300, 900], jitter: 100, budgetMs: 3500, probeMs: 1500 };

  /** Statusprobe: Promise<{retry:boolean, status:number}> (status 0 = Netzfehler/Zeitueberschreitung/keine Probe). */
  function probe(src) {
    if (typeof root.fetch !== 'function') return Promise.resolve({ retry: false, status: 0 });
    return new Promise(function (resolve) {
      var done = false, timer = null;
      var ctl = typeof root.AbortController === 'function' ? new root.AbortController() : null;
      function end(result) { if (done) return; done = true; if (timer) root.clearTimeout(timer); resolve(result); }
      if (ctl) timer = root.setTimeout(function () { end({ retry: true, status: 0 }); try { ctl.abort(); } catch (_) { /* egal */ } }, RETRY.probeMs);
      try {
        root.fetch(src, { method: 'HEAD', cache: 'no-store', credentials: 'same-origin', signal: ctl ? ctl.signal : undefined })
          .then(function (response) {
            var status = Number(response && response.status) || 0;
            end({ retry: status >= 500 || status === 408 || status === 429 || (status >= 200 && status < 400), status: status });
          }, function () { end({ retry: true, status: 0 }); });
      } catch (_) { end({ retry: true, status: 0 }); }
    });
  }

  function pause(ms) { return new Promise(function (resolve) { root.setTimeout(resolve, ms); }); }

  /**
   * Adresse eines Wiederholungsversuchs: die Originaladresse plus `retry=<Versuch>`. WebKit (iOS) verwendet eine
   * fehlgeschlagene Preload-Ressource fuer jede IDENTISCHE Adresse erneut, ohne neuen Abruf; eine geaenderte Adresse laedt
   * frisch. Nur die Adresse des Abrufs aendert sich: Schluessel (`scripts`, `preloads`), Fehlermeldung
   * (LAZY_SCRIPT_FAILED:<Originaladresse>), ?v=-Stempel und Statusprobe bleiben auf der Originaladresse. Statische Server und
   * Pages ignorieren die Query; ein 503 wird nicht zwischengespeichert, es entsteht also kein fehlerhaftes Objekt unter der
   * neuen Adresse. Bei Erfolg liegt die Datei im Browser-Cache evtl. zusaetzlich unter der Wiederholungsadresse (nur nach
   * einem Ausfall, unkritisch).
   */
  function retryUrl(src, n) { return src + (src.indexOf('?') < 0 ? '?' : '&') + 'retry=' + n; }

  /** Fuehrt `doAttempt(src, url)` aus und wiederholt es kontrolliert (siehe RETRY). `state` teilt Zeit und letzten Status je Adresse. */
  function withRetry(src, state, doAttempt) {
    function run(n) {
      return doAttempt(src, n > 1 ? retryUrl(src, n) : src).catch(function (error) {
        error.attempts = n;
        error.status = state.last;
        if (n >= RETRY.attempts) throw error;
        return probe(src).then(function (result) {
          state.last = error.status = result.status;
          var wait = RETRY.delays[Math.min(n, RETRY.delays.length) - 1] + Math.floor(Math.random() * RETRY.jitter);
          if (!result.retry || Date.now() - state.started + wait > RETRY.budgetMs) throw error;
          if (root.console && root.console.warn) root.console.warn('Discover lazy retry', src, 'attempt ' + (n + 1) + '/' + RETRY.attempts, 'status ' + result.status);
          return pause(wait).then(function () { return run(n + 1); });
        });
      });
    }
    return run(1);
  }

  /** Ein einzelner Ladeversuch: <script>-Knoten einfuegen; bei Fehler Knoten entfernen und ablehnen. */
  function attempt(src, url) {
    return new Promise(function (resolve, reject) {
      var node = doc().createElement('script');
      node.src = url || src;
      node.async = false;
      node.onload = function () { resolve(); };
      node.onerror = function () { if (node.remove) node.remove(); reject(new Error('LAZY_SCRIPT_FAILED:' + src)); };
      doc().head.appendChild(node);
    });
  }

  /** Vorladen ohne Ausfuehrung (<link rel=preload as=script>, gleiche Adresse, same-origin: das spaetere <script> nutzt den Treffer). */
  function preloadAttempt(src) {
    return new Promise(function (resolve, reject) {
      var link = doc().createElement('link');
      function end() { if (link.remove) link.remove(); }
      link.rel = 'preload';
      link.as = 'script';
      link.href = src;
      link.onload = function () { end(); resolve(); };
      link.onerror = function () { end(); reject(new Error('LAZY_SCRIPT_FAILED:' + src)); };
      doc().head.appendChild(link);
    });
  }
  var preloads = Object.create(null);   // Adresse ohne Query -> laufendes Vorladen (zwei Gruppen mit demselben Modul laden es einmal)
  function preloaded(key, src) {
    return preloads[key] || (preloads[key] = preloadAttempt(src).catch(function () {}).then(function () { delete preloads[key]; }));
  }
  function canPreload() {
    try { var link = doc().createElement('link'); return !!(link.relList && link.relList.supports && link.relList.supports('preload')); } catch (_) { return false; }
  }

  function withStamp(src) { return src.indexOf('?') < 0 && stamp() ? src + '?v=' + stamp() : src; }
  function fresh() { return { started: Date.now(), last: 0 }; }

  function script(src) {
    var key = src.split('?')[0];
    src = withStamp(src);
    if (scripts[key]) return scripts[key];
    // Ein Eintrag je Adresse: gleichzeitige Aufrufer teilen sich Versuche und Ergebnis. Erst der endgueltige Fehler gibt ihn frei.
    scripts[key] = withRetry(src, fresh(), attempt).catch(function (error) { delete scripts[key]; throw error; });
    return scripts[key];
  }

  /**
   * Skripte einer Gruppe: Abruf parallel (Vorladen), Ausfuehrung strikt nacheinander in Gruppenreihenfolge. Faellt ein Skript
   * aus, wird es VOR seinen Nachfolgern wiederholt; scheitert es endgueltig, laeuft kein Nachfolger. So meldet die Gruppe nie
   * "geladen", waehrend ein Skript nach seinen Nachfolgern ausgefuehrt wurde (diese halten Globale beim Laden fest).
   * Ohne Vorladen-Unterstuetzung werden die Skripte nacheinander abgerufen (langsamer, aber gleich korrekt).
   */
  function loadScripts(list) {
    var preload = canPreload(), chain = Promise.resolve(), seen = Object.create(null);
    list.forEach(function (raw) {
      var key = raw.split('?')[0];
      if (seen[key]) return;
      seen[key] = true;
      var src = withStamp(raw);
      // Vorladen ist nur Beschleunigung: scheitert es, entscheidet der Ladeversuch des Skripts selbst (mit Statusprobe und Wiederholung).
      var ready = preload && !scripts[key] ? preloaded(key, src) : Promise.resolve();
      chain = chain.then(function () { return ready; }).then(function () { return script(raw); });
    });
    return chain;
  }

  /** Laedt eine Gruppe (einmal). Bei einem Fehler wird die Gruppe beim naechsten Aufruf erneut versucht. */
  function parsed() {
    if (!doc() || doc().readyState !== 'loading') return Promise.resolve();
    return new Promise(function (resolve) { doc().addEventListener('DOMContentLoaded', function () { resolve(); }, { once: true }); });
  }
  function load(name) {
    if (groups[name]) return groups[name];
    // Die Templates stehen am Dokumentende: vor dem Ende des Parsens kann eine Gruppe unvollstaendig sein.
    groups[name] = parsed().then(function () { var g = guard(); return g ? g.beforeLoad() : undefined; })
      .then(function () { return loadScripts(sources(name)); }).then(function () {})
      .catch(function (error) {
        delete groups[name];
        var g = guard();
        if (!g) { reloadOnce(); throw error; }
        // Neuer Release -> der Waechter laedt neu (Aufruf bleibt offen); sonst gilt der Fehler. RELEASE_STALE kommt vom Waechter selbst.
        return (error && error.message === 'RELEASE_STALE' ? Promise.resolve() : g.onMissing()).then(function () { throw error; });
      });
    return groups[name];
  }

  /** Alle Gruppen, die die Route (Hash-Segmente) vor dem Zeichnen braucht. */
  function forRoute(parts) {
    return Promise.all((ROUTES[(parts && parts[0]) || ''] || []).map(load)).then(function () {});
  }

  function warm(names) {
    return (names || WARM).reduce(function (chain, name) {
      return chain.then(function () { return load(name); }).catch(function () {});
    }, Promise.resolve());
  }

  function idle(fn, timeout) {
    if (typeof root.requestIdleCallback === 'function') root.requestIdleCallback(fn, { timeout: timeout || 2500 });
    else root.setTimeout(fn, 200);
  }

  var settledPromise = null, homeDrawn = false, afterDrawn = null;
  // Die Startseite meldet mit vu-home-drawn, dass die ersten Karten stehen (home.js). Das Ereignis kann vor dem ersten settled()-Aufruf kommen.
  if (doc() && doc().addEventListener) doc().addEventListener('vu-home-drawn', function () { homeDrawn = true; if (afterDrawn) afterDrawn(); });
  /** Ist die Startseite die aktuelle Route? (dieselbe Unterscheidung wie app.js und index.html) */
  function onHome() {
    var first = String((root.location && root.location.hash) || '').replace(/^#\/?/, '').split('/')[0];
    return !/^(s|settings|suche|aktien|watchlist|welten|strategien|thema|c|einzeln|maerkte|daten)$/.test(first);
  }
  /**
   * Aufgeloest, wenn die Seite geladen ist, der Browser Leerlauf hat und - auf der Startseite - die ersten Karten
   * gezeichnet sind (Ereignis vu-home-drawn, spaetestens DRAWN_WAIT_MS nach dem Laden). Fuer alles, was den ersten
   * Eindruck nicht bremsen darf: Marktbarometer-Teaser, Bilder weiter unten, Vorladen.
   */
  function settled() {
    if (settledPromise) return settledPromise;
    settledPromise = new Promise(function (resolve) {
      var loaded = false, drawn = homeDrawn || !onHome(), fired = false;
      function check() {
        if (loaded && drawn && !fired) { fired = true; idle(resolve, 2500); }
      }
      function onLoad() {
        loaded = true;
        if (!drawn) root.setTimeout(function () { drawn = true; check(); }, DRAWN_WAIT_MS);
        check();
      }
      if (!drawn) afterDrawn = function () { drawn = true; check(); };
      if (!doc() || doc().readyState === 'complete') onLoad();
      else root.addEventListener('load', onLoad, { once: true });
    });
    return settledPromise;
  }

  /** Setzt die Adresse eines Bildes erst, wenn die Seite zur Ruhe gekommen ist (settled). */
  function image(img, src) {
    settled().then(function () { img.src = src; });
    return img;
  }

  function saving() {
    var c = root.navigator && root.navigator.connection;
    return !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || '')));
  }

  /** Ziel-Route eines Links (#/s/..., #/maerkte, ...) als Hash-Segmente, sonst null. */
  function routeOf(node) {
    var a = node && node.closest && node.closest('a[href]');
    var href = a && a.getAttribute('href');
    return href && href.charAt(0) === '#' ? href.replace(/^#\/?/, '').split('/') : null;
  }

  /**
   * Vorladen. Wer ein Ziel beruehrt oder darueber faehrt (Aktienkarte, Maerkte-Link), bekommt dessen Gruppe sofort - bis zum
   * Loslassen laeuft der Abruf. Nach der ersten Eingabe oder spaetestens WARM_AFTER_MS laedt der Rest im Leerlauf;
   * nie vor dem load-Ereignis und den ersten Karten.
   */
  function watch() {
    if (!doc() || !root.addEventListener || saving()) return;
    var started = false, timer = null;
    var events = ['pointerdown', 'touchstart', 'keydown'];
    function start() {
      if (started) return;
      started = true;
      if (timer) root.clearTimeout(timer);
      events.forEach(function (name) { root.removeEventListener(name, onInput, true); });
      // Nur wer noch auf der Startseite steht, braucht das Vorladen; auf einer anderen Route soll es keine Arbeit neben der Bedienung machen.
      settled().then(function () { idle(function () { if (onHome()) warm(); }, 4000); });
    }
    function intent(event) {
      var parts = routeOf(event && event.target);
      if (parts) forRoute(parts).catch(function () {});
    }
    function onInput(event) { intent(event); start(); }
    events.forEach(function (name) { root.addEventListener(name, onInput, { capture: true, passive: true }); });
    root.addEventListener('mouseover', intent, { capture: true, passive: true });
    function afterLoad() { timer = root.setTimeout(start, WARM_AFTER_MS); }
    if (doc().readyState === 'complete') afterLoad(); else root.addEventListener('load', afterLoad, { once: true });
  }

  return { RETRY: RETRY, stamp: stamp, ROUTES: ROUTES, WARM: WARM, load: load, forRoute: forRoute, warm: warm, settled: settled, image: image, onHome: onHome, routeOf: routeOf, watch: watch, sources: sources };
});
