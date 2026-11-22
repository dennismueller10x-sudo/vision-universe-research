/* Unterseiten im Stil der Startseite (Owner 22.11.2026): Telefon im Einstieg bekommt den restlichen Platz,
   die Grafik in „So funktioniert es“ spielt ab, dunkle Kopfzeile über dunklen Flächen, News-Seite „Top Shelf“. */
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
  if (document.querySelector("main.ts")) root.classList.add("vw-ondark", "ts-dark"); /* News: ganze Seite dunkel, Kopfzeile auch */
  else if (darks.length) { addEventListener("scroll", tone, { passive: true }); tone(); }
  /* News „Top Shelf“: Bühne wechselt alle 6 Sekunden (Wischen, Striche antippen; steht bei reduzierter Bewegung),
     Reihen mit Pfeilen, „Nach Aktien“ und „Nach Themen“ zeigen die passenden Artikel. */
  var hero = document.querySelector(".ts-hero");
  if (hero) {
    var sl = $$(".ts-sl", hero), dots = $$(".ts-dots button", hero), cur = 0, timer = null;
    var show = function (n) {
      sl[cur].classList.remove("on"); sl[cur].setAttribute("aria-hidden", "true"); $$("a", sl[cur]).forEach(function (a) { a.setAttribute("tabindex", "-1"); });
      cur = (n + sl.length) % sl.length;
      sl[cur].classList.add("on"); sl[cur].removeAttribute("aria-hidden"); $$("a", sl[cur]).forEach(function (a) { a.removeAttribute("tabindex"); });
      dots.forEach(function (d, k) { d.classList.remove("on", "done"); d.removeAttribute("aria-current"); if (k < cur) d.classList.add("done"); });
      void dots[cur].offsetWidth; dots[cur].classList.add("on"); dots[cur].setAttribute("aria-current", "true");
      clearTimeout(timer); if (!reduce) timer = setTimeout(function () { show(cur + 1); }, 6000);
    };
    dots.forEach(function (d, k) { d.addEventListener("click", function () { show(k); }); });
    var x0 = null;
    hero.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    hero.addEventListener("touchend", function (e) { if (x0 === null) return; var dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) show(cur + (dx < 0 ? 1 : -1)); x0 = null; });
    hero.addEventListener("focusin", function () { clearTimeout(timer); hero.classList.add("still"); });
    if (sl.length > 1) show(0);
  }
  $$(".ts-shelf").forEach(function (s) {
    var heads = $$(".ts-arr", s);
    heads.forEach(function (h) {
      var tr = h.parentElement.nextElementSibling, b = $$("button", h);
      if (!tr || b.length < 2) return;
      b[0].addEventListener("click", function () { tr.scrollBy({ left: -tr.clientWidth * .8, behavior: reduce ? "auto" : "smooth" }); });
      b[1].addEventListener("click", function () { tr.scrollBy({ left: tr.clientWidth * .8, behavior: reduce ? "auto" : "smooth" }); });
    });
  });
  $$(".ts-pick").forEach(function (sec) {
    var tk = sec.getAttribute("data-kind") === "tk", items = $$(tk ? ".ts-f" : ".ts-t", sec), h = sec.querySelector(".ts-ph h3"), res = sec.querySelector(".ts-res");
    var pick = function (it) {
      items.forEach(function (x) { x.classList.toggle("on", x === it); x.setAttribute("aria-pressed", x === it ? "true" : "false"); });
      var k = it.getAttribute("data-k"), label = it.querySelector(tk ? "span" : "b").textContent;
      $$(".ts-c", res).forEach(function (c) { var v = c.getAttribute(tk ? "data-tk" : "data-th") || ""; c.hidden = v.split(tk ? " " : "|").indexOf(k) < 0; });
      h.textContent = (tk ? "Artikel zu " : "Artikel zum Thema ") + label; res.scrollLeft = 0;
    };
    items.forEach(function (it) { it.addEventListener("click", function () { pick(it); }); });
    if (items[0]) pick(items[0]);
  });
})();
