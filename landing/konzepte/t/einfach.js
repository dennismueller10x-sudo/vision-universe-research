/* Konzept „Einfach“ (Owner 21.11.2026): die Module von www.visionuniverse.de unverändert,
   aber in Boxen zum Wischen gruppiert, damit die Seite kürzer wird. Nur Branch-Vorschau. */
(function () {
  "use strict";
  var root = document.documentElement;
  if (!root.classList.contains("ez")) return;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return [].slice.call((c || document).querySelectorAll(s)); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  var story = $("main > .story"), hero = $(".step.first"), jbar = $(".jbar");
  if (!story || !hero) return;

  function arrows(track) {
    var w = el("span", "ez-arr", '<button type="button" aria-label="Zurück">‹</button><button type="button" aria-label="Weiter">›</button>');
    var b = $$("button", w), step = function () { var c = track.firstElementChild; return c ? c.getBoundingClientRect().width + 16 : track.clientWidth; };
    b[0].addEventListener("click", function () { track.scrollBy({ left: -step(), behavior: reduce ? "auto" : "smooth" }); });
    b[1].addEventListener("click", function () { track.scrollBy({ left: step(), behavior: reduce ? "auto" : "smooth" }); });
    var upd = function () { b[0].disabled = track.scrollLeft < 4; b[1].disabled = track.scrollLeft + track.clientWidth > track.scrollWidth - 4; };
    track.addEventListener("scroll", upd, { passive: true }); addEventListener("resize", upd); setTimeout(upd, 400);
    return w;
  }
  function dots(track) {
    var d = el("div", "ez-dots"); var n = track.children.length;
    for (var i = 0; i < n; i++) d.appendChild(el("i"));
    var upd = function () { var w = track.firstElementChild.getBoundingClientRect().width + 16, k = Math.round(track.scrollLeft / w); $$("i", d).forEach(function (x, j) { x.classList.toggle("on", j === k); }); };
    track.addEventListener("scroll", upd, { passive: true }); setTimeout(upd, 300);
    return d;
  }

  /* Gruppen wie im Menü der Live-Seite: Entdecken, Verstehen, Methoden, Vorsorgen */
  var groups = [], byId = {};
  $$(".nav .mcol").forEach(function (col) {
    var name = ($(".mg", col) || {}).textContent || "", ids = $$("a", col).map(function (a) { return "k-" + a.getAttribute("href").replace(/.*produkte\//, "").replace(/\/.*/, ""); });
    var g = { name: name, ids: ids, steps: [] }; groups.push(g); ids.forEach(function (id) { byId[id] = g; });
  });
  var chs = $$(".steps > .step:not(.first)");
  chs.forEach(function (s) { var g = byId[s.id] || groups[1]; g.steps.push(s); });

  var top = el("div", "ez-top w"); top.appendChild(hero);
  story.parentNode.insertBefore(top, story);
  groups.forEach(function (g) {
    if (!g.steps.length) return;
    var sec = el("section", "ez-grp w"), hd = el("div", "ez-hd");
    hd.innerHTML = '<div><p class="kap">' + g.steps.length + (g.steps.length === 1 ? " Bereich" : " Bereiche") + '</p><h2 class="ez-h"></h2></div>';
    $("h2", hd).textContent = g.name + ".";
    var tr = el("div", "ez-track"); g.steps.forEach(function (s) { s.classList.add("ez-card"); tr.appendChild(s); });
    if (g.steps.length > 1) hd.appendChild(arrows(tr));
    sec.appendChild(hd); sec.appendChild(tr); if (g.steps.length > 1) sec.appendChild(dots(tr));
    story.parentNode.insertBefore(sec, story);
  });
  story.remove(); if (jbar) jbar.remove();

  /* News: Kacheln als Reihe zum Wischen */
  var nt = $("#news .ntiles"), nh = $("#news .hh");
  if (nt && nh) { nt.classList.add("ez-row"); nh.appendChild(arrows(nt)); }

  /* Kapitel-Links (Menü, Fuß) springen zur Box */
  document.addEventListener("click", function (e) {
    var a = e.target.closest('a[href^="#k-"]'); if (!a) return;
    var s = document.getElementById(a.getAttribute("href").slice(1)); if (!s || !s.classList.contains("ez-card")) return;
    e.preventDefault(); var tr = s.parentNode;
    tr.scrollTo({ left: s.offsetLeft - tr.offsetLeft, behavior: reduce ? "auto" : "smooth" });
    tr.parentNode.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  }, true);
})();
