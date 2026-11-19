/* Technik-Konzepte (Owner 19.11.2026): gleicher Inhalt wie www.visionuniverse.de, andere Technik. Nur Branch-Vorschau. */
(function () {
  "use strict";
  var root = document.documentElement, T = (root.className.match(/tk-(t\d)/) || [])[1];
  if (!T) return;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var story = document.querySelector(".story"), steps = document.querySelector(".steps");
  var hero = document.querySelector(".step.first");
  var chs = [].slice.call(document.querySelectorAll(".steps > .step:not(.first)"));
  var label = function (s) { var t = s.querySelector(".tagm"); return t ? t.textContent.split("·")[0].trim() : (s.querySelector("h2") || {}).textContent || ""; };
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  /* Alle Varianten: Menü wie bei DLS – kleine Pille oben rechts, die das vorhandene Menü als Karte öffnet */
  var sheet = document.querySelector(".sheet"), mbtn = document.querySelector(".nav [data-menu]");
  if (sheet && mbtn) {
    mbtn.insertAdjacentHTML("beforeend", '<span class="tk-mtxt">Menü</span>');
    sheet.classList.add("tk-card");
  }

  /* Hero vor die Kapitel holen (T1, T3, T4, T5): die Kapitel bekommen eine eigene Bühne */
  if (T !== "t2" && hero && story) {
    var heroWrap = el("div", "tk-hero w"); heroWrap.appendChild(hero); story.parentNode.insertBefore(heroWrap, story);
  }
  // Sprungleiste: Klick führt zum Kapitel in der jeweiligen Technik
  function jumpTo(id) {
    var i = chs.findIndex(function (s) { return s.id === id; });
    if (i < 0) return false; show(i, true); return true;
  }
  var show = function () {};

  /* T1 Karussell: Kapitel nebeneinander, wischen oder Pfeile */
  if (T === "t1" || T === "t5") {
    var nav = el("div", "tk-nav w"), dots = el("div", "tk-dots");
    var prev = el("button", "tk-arr", "‹"), next = el("button", "tk-arr", "›");
    prev.type = next.type = "button"; prev.setAttribute("aria-label", "Zurück"); next.setAttribute("aria-label", "Weiter");
    chs.forEach(function (s, k) { var b = el("button", "", label(s)); b.type = "button"; b.addEventListener("click", function () { show(k, true); }); dots.appendChild(b); });
    nav.appendChild(prev); nav.appendChild(dots); nav.appendChild(next);
    story.parentNode.insertBefore(nav, story);
    var cur = 0;
    var mark = function (k) { cur = k; [].forEach.call(dots.children, function (b, j) { b.classList.toggle("on", j === k); if (j === k) dots.scrollTo({ left: b.offsetLeft - dots.clientWidth / 2 + b.clientWidth / 2, behavior: "smooth" }); }); };
    if (T === "t1") {
      show = function (k, scroll) { k = Math.max(0, Math.min(chs.length - 1, k)); steps.scrollTo({ left: chs[k].offsetLeft - steps.offsetLeft, behavior: reduce ? "auto" : "smooth" }); mark(k); if (scroll) nav.scrollIntoView({ behavior: reduce ? "auto" : "smooth" }); };
      steps.addEventListener("scroll", function () { var k = Math.round(steps.scrollLeft / steps.clientWidth); if (k !== cur) mark(k); }, { passive: true });
    } else {
      /* T5: Runterscrollen schiebt die Kapitel seitwärts (Bühne bleibt stehen) */
      story.style.setProperty("--n", chs.length);
      var onScroll = function () {
        var r = story.getBoundingClientRect(), total = story.offsetHeight - innerHeight, p = Math.min(1, Math.max(0, -r.top / total));
        steps.style.transform = "translateX(" + (-p * (chs.length - 1) * 100) + "%)";
        var k = Math.round(p * (chs.length - 1)); if (k !== cur) mark(k);
      };
      show = function (k) { var total = story.offsetHeight - innerHeight; scrollTo({ top: story.offsetTop + total * k / (chs.length - 1) - 10, behavior: reduce ? "auto" : "smooth" }); };
      addEventListener("scroll", onScroll, { passive: true }); addEventListener("resize", onScroll); onScroll();
    }
    prev.addEventListener("click", function () { show(cur - 1); }); next.addEventListener("click", function () { show(cur + 1); });
    mark(0);
  }

  /* T2 Vollbild-Folien: jede Folie rastet ein, Punkte rechts */
  if (T === "t2") {
    var slides = [].slice.call(document.querySelectorAll(".steps > .step, main > section.full, main > section.joinw"));
    var rail = el("nav", "tk-rail"); rail.setAttribute("aria-label", "Folien");
    slides.forEach(function (s, k) { var b = el("button", "", "<span>" + (k === 0 ? "Start" : label(s) || s.getAttribute("data-lbl") || "") + "</span>"); b.type = "button"; b.addEventListener("click", function () { s.scrollIntoView({ behavior: reduce ? "auto" : "smooth" }); }); rail.appendChild(b); });
    document.body.appendChild(rail);
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { var k = slides.indexOf(e.target); [].forEach.call(rail.children, function (b, j) { b.classList.toggle("on", j === k); }); } }); }, { threshold: .55 });
    slides.forEach(function (s) { io.observe(s); });
    show = function (k) { chs[k].scrollIntoView({ behavior: reduce ? "auto" : "smooth" }); };
  }

  /* T3 Bühne mit Reitern: immer nur ein Kapitel, Reiter wechseln, läuft von selbst weiter */
  if (T === "t3") {
    var tabs = el("div", "tk-tabs w"), timer = null, auto = true, k3 = 0;
    chs.forEach(function (s, k) { var b = el("button", "", label(s) + "<i></i>"); b.type = "button"; b.addEventListener("click", function () { auto = false; show(k); }); tabs.appendChild(b); });
    story.parentNode.insertBefore(tabs, story);
    show = function (k) {
      k3 = (k + chs.length) % chs.length;
      chs.forEach(function (s, j) { s.classList.toggle("tk-on", j === k3); });
      [].forEach.call(tabs.children, function (b, j) { b.classList.toggle("on", j === k3); b.classList.remove("run"); void b.offsetWidth; if (j === k3 && auto && !reduce) b.classList.add("run"); if (j === k3) tabs.scrollTo({ left: b.offsetLeft - tabs.clientWidth / 2 + b.clientWidth / 2, behavior: "smooth" }); });
      clearTimeout(timer); if (auto && !reduce) timer = setTimeout(function () { show(k3 + 1); }, 7000);
    };
    show(0);
  }

  /* T4 Akkordeon: Kapitel als Zeilen, ein Tipp klappt auf */
  if (T === "t4") {
    chs.forEach(function (s, k) {
      var head = el("button", "tk-acc"); head.type = "button";
      head.innerHTML = (s.querySelector(".tagm") || {}).outerHTML + '<b>' + ((s.querySelector("h2") || {}).textContent || "") + '</b><i aria-hidden="true">+</i>';
      head.setAttribute("aria-expanded", "false");
      s.insertBefore(head, s.firstChild);
      head.addEventListener("click", function () { var open = !s.classList.contains("tk-open"); chs.forEach(function (o) { o.classList.remove("tk-open"); o.firstChild.setAttribute("aria-expanded", "false"); }); if (open) { s.classList.add("tk-open"); head.setAttribute("aria-expanded", "true"); setTimeout(function () { s.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); }, 60); } });
    });
    show = function (k) { var s = chs[k]; if (!s.classList.contains("tk-open")) s.firstChild.click(); else s.scrollIntoView({ behavior: "smooth" }); };
  }

  // Sprungleiste und Kapitel-Links in der jeweiligen Technik
  document.addEventListener("click", function (e) {
    var a = e.target.closest('a[href^="#k-"]'); if (!a) return;
    if (jumpTo(a.getAttribute("href").slice(1))) e.preventDefault();
  }, true);
})();
