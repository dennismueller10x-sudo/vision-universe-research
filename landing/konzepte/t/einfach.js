/* Konzept „Einfach“ (Owner 21.11.2026): die Module von www.visionuniverse.de unverändert,
   die Kapitel in ihrer Reihenfolge in einer Box zum Wischen, damit die Seite kürzer wird. Nur Branch-Vorschau. */
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

  /* Start bleibt oben */
  var top = el("div", "ez-top w"); top.appendChild(hero);
  story.parentNode.insertBefore(top, story);

  /* Alle Kapitel in ihrer Reihenfolge in einer Box; darüber die vorhandene Kapitel-Leiste */
  var chs = $$(".steps > .step:not(.first)");
  var sec = el("section", "ez-grp w"), tr = el("div", "ez-track");
  chs.forEach(function (s) { s.classList.add("ez-card"); tr.appendChild(s); });
  var ids = chs.map(function (s) { return "#" + s.id; });
  var bar = null;
  if (jbar) {
    bar = jbar.cloneNode(true); bar.className = "ez-bar";
    $$("a", bar).forEach(function (a) { if (ids.indexOf(a.getAttribute("href")) < 0) a.parentNode.removeChild(a); });
    jbar.parentNode.removeChild(jbar);
  }
  var hd = el("div", "ez-hd"); if (bar) hd.appendChild(bar); hd.appendChild(arrows(tr));
  var cnt = el("p", "ez-cnt");
  sec.appendChild(hd); sec.appendChild(tr); sec.appendChild(cnt);
  story.parentNode.insertBefore(sec, story);
  story.parentNode.removeChild(story);

  function go(k) { var s = chs[k]; if (s) tr.scrollTo({ left: s.offsetLeft - tr.offsetLeft, behavior: reduce ? "auto" : "smooth" }); }
  var cur = -1;
  function mark() {
    var w = chs[0].getBoundingClientRect().width + 16, k = Math.max(0, Math.min(chs.length - 1, Math.round(tr.scrollLeft / w)));
    if (tr.scrollLeft + tr.clientWidth > tr.scrollWidth - 4) k = chs.length - 1;
    if (k === cur) return; cur = k; cnt.textContent = (k + 1) + " / " + chs.length;
    if (bar) $$("a", bar).forEach(function (a) {
      var on = a.getAttribute("href") === ids[k]; a.classList.toggle("cur", on);
      if (on) { var jin = a.parentNode; jin.scrollTo({ left: a.offsetLeft - jin.offsetLeft - jin.clientWidth / 2 + a.clientWidth / 2, behavior: reduce ? "auto" : "smooth" }); }
    });
  }
  tr.addEventListener("scroll", function () { requestAnimationFrame(mark); }, { passive: true }); setTimeout(mark, 300);

  /* Kapitel-Links (Leiste, Menü, Fuß) blättern die Box zum Kapitel */
  document.addEventListener("click", function (e) {
    var a = e.target.closest('a[href^="#k-"]'); if (!a) return;
    var k = ids.indexOf(a.getAttribute("href")); if (k < 0) return;
    e.preventDefault(); go(k);
    if (!a.closest(".ez-bar")) sec.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  }, true);

  /* News: Kacheln als Reihe zum Wischen */
  var nt = $("#news .ntiles"), nh = $("#news .hh");
  if (nt && nh) { nt.classList.add("ez-row"); nh.appendChild(arrows(nt)); }
})();
