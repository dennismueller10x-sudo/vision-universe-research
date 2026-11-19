/* Mockups (Owner 19.11.2026): die heutigen Bausteine von www.visionuniverse.de in ihrem heutigen Design,
   angeordnet nach dem technischen Aufbau von dls-consulting.de (D) und rockstargames.com (R).
   Keine neuen Elemente, Farben, Bilder oder Filme. Nur Branch-Vorschau. */
(function () {
  "use strict";
  var root = document.documentElement, V = (root.className.match(/rf-(d|r)\b/) || [])[1];
  if (!V) return;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return [].slice.call((c || document).querySelectorAll(s)); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  var story = $("main > .story"), hero = $(".step.first"), chs = $$(".steps > .step:not(.first)");
  var news = $("#news"), filme = $("#filme"), jbar = $(".jbar"), hl = hero ? $(".hl", hero) : null;

  function arrows(track) {
    var w = el("span", "rf-arr", '<button type="button" aria-label="Zurück">‹</button><button type="button" aria-label="Weiter">›</button>');
    var b = $$("button", w);
    b[0].addEventListener("click", function () { track.scrollBy({ left: -track.clientWidth * .8, behavior: reduce ? "auto" : "smooth" }); });
    b[1].addEventListener("click", function () { track.scrollBy({ left: track.clientWidth * .8, behavior: reduce ? "auto" : "smooth" }); });
    var upd = function () { b[0].disabled = track.scrollLeft < 4; b[1].disabled = track.scrollLeft + track.clientWidth > track.scrollWidth - 4; };
    track.addEventListener("scroll", upd, { passive: true }); addEventListener("resize", upd); setTimeout(upd, 400);
    return w;
  }
  // Reihe mit Überschrift aus einem vorhandenen Kopf (kap + h2) und Pfeilen
  function row(headNodes, items, cls) {
    var r = el("section", "full rf-row " + (cls || "")), hd = el("div", "rf-rhd"), t = el("div");
    headNodes.forEach(function (n) { if (n) t.appendChild(n); });
    var tr = el("div", "rf-track"); items.forEach(function (x) { tr.appendChild(x); });
    hd.appendChild(t); hd.appendChild(arrows(tr)); r.appendChild(hd); r.appendChild(tr); return r;
  }
  if (hl) hl.remove(); if (jbar) jbar.remove();

  /* ───────── D: Aufbau wie DLS ─────────
     Menü als Pille oben rechts · großer Kopf · darunter Reihen zum Wischen mit Pfeilen */
  if (V === "d") {
    var mb = $(".nav [data-menu]"); if (mb) mb.insertAdjacentHTML("beforeend", "<span>Menü</span>");
    var top = el("div", "rf-hero w"); top.appendChild(hero);
    var appRow = row([el("p", "kap", ((document.querySelector(".nav .links a") || {}).textContent || "Die App"))], chs.map(function (s) { s.classList.add("rf-card"); return s; }), "rf-apps");
    var parts = [top, appRow];
    if (news) {
      var nk = $(".hh", news) || $(".kap", news);
      var items = $$(".nfix .hlm", news).concat($$(".ntile", news));
      var nr = row([nk], items, "rf-news"); var al = $(".lnk", news); if (al) nr.appendChild(al);
      parts.push(nr);
    }
    if (filme) {
      var fr = row([$(".hh", filme)], $$(".fan button", filme), "rf-films"); parts.push(fr);
    }
    var wrap = (news || filme).parentNode, first = wrap.firstChild;
    story.parentNode.insertBefore(top, story);
    parts.slice(1).forEach(function (p) { wrap.insertBefore(p, first); });
    appRow.classList.add("w"); story.parentNode.insertBefore(appRow, story);
    story.remove(); if (news) news.remove(); if (filme) filme.remove();
  }

  /* ───────── R: Aufbau wie Rockstar Games ─────────
     Menüleiste bleibt · große Bühne, die von selbst durch Start und Kapitel wechselt (Punkte mit Fortschritt, Pause)
     · darunter News: großer Aufmacher links, Liste rechts · dann die Filme als Raster */
  if (V === "r") {
    var stage = el("section", "rf-stage"), track = el("div", "rf-slides w");
    var slides = [hero].concat(chs); slides.forEach(function (s) { track.appendChild(s); });
    stage.appendChild(track);
    var ctl = el("div", "rf-ctl w"), pause = el("button", "rf-pause", "❚❚"), dots = el("div", "rf-dots");
    pause.type = "button"; pause.setAttribute("aria-label", "Pause");
    slides.forEach(function (s, k) { var d = el("button", "", "<i></i>"); d.type = "button"; d.setAttribute("aria-label", (k === 0 ? "Start" : ($(".tagm", s) || {}).textContent || "") ); d.addEventListener("click", function () { go(k); }); dots.appendChild(d); });
    ctl.appendChild(pause); ctl.appendChild(dots); stage.appendChild(ctl);
    var at = 0, timer = null, playing = !reduce, DUR = 9000;
    function go(k) {
      at = (k + slides.length) % slides.length;
      slides.forEach(function (s, j) { s.classList.toggle("rf-on", j === at); });
      $$("button", dots).forEach(function (d, j) { d.classList.toggle("on", j === at); d.classList.remove("run"); void d.offsetWidth; if (j === at && playing) d.classList.add("run"); });
      clearTimeout(timer); if (playing) timer = setTimeout(function () { go(at + 1); }, DUR);
    }
    pause.addEventListener("click", function () { playing = !playing; pause.textContent = playing ? "❚❚" : "▶"; pause.setAttribute("aria-label", playing ? "Pause" : "Abspielen"); go(at); });
    var sx = 0; track.addEventListener("touchstart", function (e) { sx = e.touches[0].clientX; }, { passive: true });
    track.addEventListener("touchend", function (e) { var dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 60) go(at + (dx < 0 ? 1 : -1)); }, { passive: true });
    // Kapitel-Links springen zur Folie
    document.addEventListener("click", function (e) {
      var a = e.target.closest('a[href^="#k-"],a[href="#start"]'); if (!a) return;
      var k = slides.findIndex(function (s) { return "#" + s.id === a.getAttribute("href"); });
      if (k >= 0) { e.preventDefault(); go(k); stage.scrollIntoView({ behavior: reduce ? "auto" : "smooth" }); }
    }, true);
    var parts2 = [stage];
    if (news) {
      var wire = el("section", "full rf-wire"), hh = $(".hh", news);
      var tiles = $$(".ntile", news);
      var g = el("div", "rf-wgrid"), lead = el("div", "rf-lead"), list = el("div", "rf-list");
      if (tiles[0]) lead.appendChild(tiles[0]);
      tiles.slice(1, 5).forEach(function (t) { list.appendChild(t); });
      g.appendChild(lead); g.appendChild(list);
      if (hh) wire.appendChild(hh); wire.appendChild(g);
      var nf = $(".nfix", news); if (nf) wire.appendChild(nf);
      var al2 = $(".lnk", news); if (al2) { var pp = el("p", "rf-all"); pp.appendChild(al2); wire.appendChild(pp); }
      parts2.push(wire);
    }
    if (filme) { var fan = $(".fan", filme); if (fan) fan.classList.add("rf-grid"); }
    story.parentNode.insertBefore(stage, story);
    if (parts2[1] && news) news.parentNode.insertBefore(parts2[1], news);
    story.remove(); if (news) news.remove();
    go(0);
  }
})();
