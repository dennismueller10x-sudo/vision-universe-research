/* Unterseiten im Stil der Startseite (Owner 22.11.2026): Telefon im Einstieg bekommt den restlichen Platz,
   die Grafik in „So funktioniert es“ spielt ab, dunkle Kopfzeile über dunklen Flächen, Pfeile der News-Reihe. */
(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function $$(s, c) { return [].slice.call((c || document).querySelectorAll(s)); }
  var root = document.documentElement, c = document.querySelector(".fh-copy");
  function size() { if (c) root.style.setProperty("--fh-copy", c.offsetHeight + "px"); }
  size(); addEventListener("resize", size);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(size);
  $$(".ps-how-v").forEach(function (v) { v.classList.add("play"); });
  var nav = document.querySelector(".nav"), darks = $$("[data-dark]");
  function tone() { var y = (nav ? nav.offsetHeight : 66) / 2; root.classList.toggle("vw-ondark", darks.some(function (d) { var r = d.getBoundingClientRect(); return r.top <= y && r.bottom >= y; })); }
  if (darks.length) { addEventListener("scroll", tone, { passive: true }); tone(); }
  $$(".vw-row").forEach(function (r) {
    var tr = r.querySelector(".vw-track"), b = $$(".vw-arr button", r); if (!tr || b.length < 2) return;
    b[0].addEventListener("click", function () { tr.scrollBy({ left: -tr.clientWidth * .8, behavior: reduce ? "auto" : "smooth" }); });
    b[1].addEventListener("click", function () { tr.scrollBy({ left: tr.clientWidth * .8, behavior: reduce ? "auto" : "smooth" }); });
  });
})();
