/* Konzept „Welt“ (Owner 21.11.2026): Scroll-Erzählung, Neigung, Reihen, dunkle Kopfzeile. Nur Branch-Vorschau. */
(function () {
  "use strict";
  var root = document.documentElement;
  if (!root.classList.contains("vw")) return;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return [].slice.call((c || document).querySelectorAll(s)); }

  /* Kopfzeile dunkel über dunklen Flächen */
  var darks = $$("[data-dark]"), nav = $(".nav");
  function navTone() {
    var y = (nav ? nav.offsetHeight : 66) / 2, on = darks.some(function (d) { var r = d.getBoundingClientRect(); return r.top <= y && r.bottom >= y; });
    root.classList.toggle("vw-ondark", on);
  }
  addEventListener("scroll", navTone, { passive: true }); navTone();

  /* Startbühne: iPhone neigt sich zur Maus */
  var tilt = $("[data-tilt]"), st = tilt && $(".stage.mob", tilt);
  if (st && !reduce && window.matchMedia("(hover:hover)").matches) {
    tilt.closest(".vw-hero").addEventListener("pointermove", function (e) {
      var x = e.clientX / innerWidth - .5, y = e.clientY / innerHeight - .5;
      st.style.setProperty("--ry", (-8 + x * 14).toFixed(1) + "deg"); st.style.setProperty("--rx", (4 - y * 10).toFixed(1) + "deg");
    });
  }

  /* Netflix-Reihen: Pfeile */
  $$(".vw-row").forEach(function (r) {
    var tr = $(".vw-track", r), a = $(".vw-arr", r); if (!tr || !a) return;
    var b = $$("button", a);
    b[0].addEventListener("click", function () { tr.scrollBy({ left: -tr.clientWidth * .8, behavior: reduce ? "auto" : "smooth" }); });
    b[1].addEventListener("click", function () { tr.scrollBy({ left: tr.clientWidth * .8, behavior: reduce ? "auto" : "smooth" }); });
  });

  /* Einblenden beim Scrollen */
  if (!reduce && "IntersectionObserver" in window) {
    var els = $$(".vw-bento .vw-k, .vw-bento .vw-h2, .vw-tile, .vw-trust > div, .vw-row");
    els.forEach(function (e, k) { e.classList.add("vw-rv"); if (e.classList.contains("vw-tile")) e.style.transitionDelay = (k % 4) * 70 + "ms"; });
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }); }, { rootMargin: "0px 0px -8% 0px" });
    els.forEach(function (e) { io.observe(e); });
  }
})();
