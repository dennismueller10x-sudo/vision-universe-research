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

   Reihenfolge: dynamisch eingefuegte Skripte mit async=false laufen in
   Einfuegereihenfolge; gleiche Adressen (ohne Query) werden nur einmal
   geladen, auch wenn zwei Gruppen sie nennen.
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

  function script(src) {
    var key = src.split('?')[0];
    if (scripts[key]) return scripts[key];
    scripts[key] = new Promise(function (resolve, reject) {
      var node = doc().createElement('script');
      node.src = src;
      node.async = false;
      node.onload = function () { resolve(); };
      node.onerror = function () { delete scripts[key]; if (node.remove) node.remove(); reject(new Error('LAZY_SCRIPT_FAILED:' + src)); };
      doc().head.appendChild(node);
    });
    return scripts[key];
  }

  /** Laedt eine Gruppe (einmal). Bei einem Fehler wird die Gruppe beim naechsten Aufruf erneut versucht. */
  function load(name) {
    if (groups[name]) return groups[name];
    var promise;
    try { promise = Promise.all(sources(name).map(script)).then(function () {}); }
    catch (error) { return Promise.reject(error); }
    groups[name] = promise.catch(function (error) { delete groups[name]; throw error; });
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

  return { ROUTES: ROUTES, WARM: WARM, load: load, forRoute: forRoute, warm: warm, settled: settled, image: image, onHome: onHome, routeOf: routeOf, watch: watch, sources: sources };
});
