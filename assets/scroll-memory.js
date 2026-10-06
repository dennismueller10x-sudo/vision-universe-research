/* =========================================================================
   VISION UNIVERSE — assets/scroll-memory.js

   Zurueck landet dort, wo man war. Fuer Seiten mit Hash-Routen (Discover):
   die Seite setzt beim Routenwechsel scrollTo(0,0) und rendert neu - ohne
   Gedaechtnis landete "Zurueck" immer oben (UI-Audit 03.10.2026).

   Gemeinsames Modul statt Einbau je App: das Discover-View-Budget
   (180.000 Byte fuer app/home/detail/themes) laesst keinen Platz, und
   dieselbe Regel soll fuer jede Hash-Route gelten.

   Regel:
   - Vor jedem Routenwechsel wird die Position der verlassenen Adresse
     gemerkt (sessionStorage, nur in diesem Tab).
   - Jeder neue Verlaufseintrag bekommt einen Index in history.state.
     Traegt die Zieladresse schon einen Index, ist es Zurueck/Vor - nur
     dann wird wiederhergestellt; ein neuer Klick beginnt oben.
   - Wiederhergestellt wird erst, wenn die Seite hoch genug gerendert ist,
     hoechstens 2,5 s lang; jede Eingabe des Nutzers bricht ab.
   Ohne sessionStorage oder history.state (z. B. replaceState(null)) tut
   das Modul nichts - kein Sprung, kein Fehler.
   ========================================================================= */
(function (g) {
  "use strict";
  if (!g.history || !g.addEventListener) return;
  var KEY = "vu-scroll-memory-v1", MAX = 50;
  var mem = {};
  try { mem = JSON.parse(g.sessionStorage.getItem(KEY)) || {}; } catch (e) { mem = {}; }
  function store() {
    var keys = Object.keys(mem);
    if (keys.length > MAX) keys.slice(0, keys.length - MAX).forEach(function (k) { delete mem[k]; });
    try { g.sessionStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* privat/voll: nur ohne Gedaechtnis */ }
  }
  function idx() { var s = g.history.state; return s && typeof s.vuScrollIdx === "number" ? s.vuScrollIdx : null; }
  function mark(n) {
    var s = g.history.state && typeof g.history.state === "object" ? g.history.state : {};
    var neu = {}; for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) neu[k] = s[k];
    neu.vuScrollIdx = n;
    try { g.history.replaceState(neu, ""); } catch (e) { /* ohne Verlauf: nichts */ }
  }
  var zaehler = 0;
  if (idx() === null) mark(zaehler); else zaehler = idx();
  var aktuell = g.location.href, abbruch = null;

  function stop() { if (abbruch) { abbruch(); abbruch = null; } }
  function restore(ziel) {
    stop();
    var start = Date.now(), still = 0, aus = false;
    function ende() { aus = true; ["wheel", "touchstart", "keydown", "mousedown"].forEach(function (t) { g.removeEventListener(t, ende, true); }); }
    ["wheel", "touchstart", "keydown", "mousedown"].forEach(function (t) { g.addEventListener(t, ende, true); });
    abbruch = ende;
    (function schritt() {
      if (aus || Date.now() - start > 2500) { ende(); return; }
      var max = Math.max(0, (g.document.documentElement.scrollHeight || 0) - g.innerHeight);
      if (max >= ziel) {
        if (Math.abs(g.scrollY - ziel) > 2) { g.scrollTo(0, ziel); still = 0; } else if (++still > 10) { ende(); return; }
      }
      g.requestAnimationFrame(schritt);
    })();
  }

  /* capture: vor dem Router der Seite, solange noch die alte Seite steht. */
  g.addEventListener("hashchange", function () {
    mem[aktuell] = g.scrollY; store();
    aktuell = g.location.href;
    var i = idx();
    if (i === null) { mark(++zaehler); stop(); return; }   /* neuer Eintrag: oben beginnen */
    zaehler = Math.max(zaehler, i);
    var ziel = mem[aktuell];
    if (typeof ziel === "number" && ziel > 0) restore(ziel);
  }, true);
  g.addEventListener("pagehide", function () { mem[aktuell] = g.scrollY; store(); });

  g.VUScrollMemory = { _mem: mem };
})(typeof window !== "undefined" ? window : this);
