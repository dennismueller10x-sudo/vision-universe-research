/* Bausteine (Owner 19.11.2026): www.visionuniverse.de bleibt wie sie ist. Dazu nur:
   Menü wie DLS, Bewegung wie DLS, Fortschritt wie Rockstar, Wisch-Reihen. Nur Branch-Vorschau. */
(function () {
  "use strict";
  var root = document.documentElement;
  if (!root.classList.contains("bx")) return;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function $$(s, c) { return [].slice.call((c || document).querySelectorAll(s)); }

  /* 1 Menü wie DLS: die vorhandene Menü-Taste bekommt „Menü“, das vorhandene Menü klappt als Karte auf */
  var mb = document.querySelector(".nav [data-menu]");
  if (mb) mb.insertAdjacentHTML("beforeend", '<span class="bx-mt">Menü</span>');

  /* 2 Bewegung wie DLS: Inhalte fahren beim Scrollen weich ein, Überschriften Zeile für Zeile */
  if (!reduce && "IntersectionObserver" in window) {
    var items = $$(".steps > .step:not(.first) > *:not(.aphone), main > section.full .hh, main > section.full > h2, main > section.full > .kap, .ncompact, .fan, .sbars, .faq, .joinw > div > *");
    items.forEach(function (e) { e.classList.add("bx-in"); });
    $$(".steps > .step, main > section.full, .joinw").forEach(function (s) {
      $$(".bx-in", s).forEach(function (e, k) { e.style.setProperty("--d", Math.min(k, 6) * 70 + "ms"); });
    });
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("bx-on"); io.unobserve(e.target); } }); }, { rootMargin: "0px 0px -12% 0px" });
    items.forEach(function (e) { io.observe(e); });
    // Startseite: Überschrift baut sich auf
    var h1 = document.querySelector(".step.first h1");
    if (h1) { h1.classList.add("bx-h1"); requestAnimationFrame(function () { h1.classList.add("bx-on"); }); }
  }

  /* 3 Fortschritt wie Rockstar: der aktive Punkt der Sprungleiste wird zum Balken, der mit dem Kapitel mitläuft */
  var jb = document.querySelector(".jbar");
  if (jb) {
    $$("a", jb).forEach(function (a) { a.insertAdjacentHTML("beforeend", '<i class="bx-bar" aria-hidden="true"></i>'); });
    var tick = function () {
      var a = jb.querySelector("a.cur"); if (!a) return;
      var t = document.querySelector(a.getAttribute("href")); if (!t) return;
      var r = t.getBoundingClientRect(), p = Math.min(1, Math.max(0, (innerHeight * .5 - r.top) / Math.max(1, r.height)));
      $$("a", jb).forEach(function (x) { if (x !== a) x.style.removeProperty("--p"); });
      a.style.setProperty("--p", p.toFixed(3));
    };
    addEventListener("scroll", function () { requestAnimationFrame(tick); }, { passive: true });
    tick();
  }

  /* 4 Wisch-Reihen: News und „Heute neu“ werden Reihen mit Pfeilen wie bei DLS (Filme bleiben der Fächer) */
  function arrows(track, host) {
    var w = document.createElement("span"); w.className = "bx-arr";
    w.innerHTML = '<button type="button" aria-label="Zurück">‹</button><button type="button" aria-label="Weiter">›</button>';
    var b = w.querySelectorAll("button");
    b[0].addEventListener("click", function () { track.scrollBy({ left: -track.clientWidth * .8, behavior: reduce ? "auto" : "smooth" }); });
    b[1].addEventListener("click", function () { track.scrollBy({ left: track.clientWidth * .8, behavior: reduce ? "auto" : "smooth" }); });
    var upd = function () { b[0].disabled = track.scrollLeft < 4; b[1].disabled = track.scrollLeft + track.clientWidth > track.scrollWidth - 4; };
    track.addEventListener("scroll", upd, { passive: true }); addEventListener("resize", upd); setTimeout(upd, 300);
    host.appendChild(w);
  }
  var nt = document.querySelector("#news .ntiles"), st = document.querySelector("#news .nstand");
  if (nt) { nt.classList.add("bx-row"); if (st) { st.classList.add("bx-rh"); arrows(nt, st); } }
  var hl = document.querySelector(".hlnews"), hk = document.querySelector(".hl > .kap");
  if (hl && hk) { hk.classList.add("bx-rh"); arrows(hl, hk); }
})();
