/* Referenz-Konzepte (Owner 19.11.2026): Technik von dls-consulting.de (D) und rockstargames.com (R)
   auf www.visionuniverse.de übertragen. Texte, Bilder und Farben bleiben wie live. Nur Branch-Vorschau. */
(function () {
  "use strict";
  var root = document.documentElement, V = (root.className.match(/rf-(d|r)\b/) || [])[1];
  if (!V) return;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return [].slice.call((c || document).querySelectorAll(s)); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  var main = $("main") || document.body, story = $(".story"), hero = $(".step.first");
  var chs = $$(".steps > .step:not(.first)");
  var news = $("#news"), filme = $("#filme");
  var fans = filme ? $$(".fan button", filme) : [];
  var ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12h14M12.5 6l6 6-6 6"/></svg>';
  var START = ($(".step.first .acts .btn span") || {}).textContent || "Zum Start benachrichtigen";

  /* Daten je Kapitel, alles aus der Live-Seite gelesen */
  var info = chs.map(function (s) {
    var tag = $(".tagm", s), h2 = $("h2", s), lnk = $(".lnk", s);
    var parts = tag ? tag.textContent.split("·") : [""];
    var key = (s.id || "").replace("k-", "");
    var film = fans.filter(function (b) { return (b.getAttribute("data-vid") || "").indexOf("/" + key + ".mp4") >= 0; })[0];
    return {
      s: s, key: key, name: parts[0].trim(), q: (parts[1] || "").trim(), title: h2 ? h2.textContent : "",
      text: ($("p.t", s) || {}).textContent || "", img: s.getAttribute("data-img"), icon: tag ? ($(".ic", tag) || {}).outerHTML || "" : "",
      href: lnk ? lnk.getAttribute("href") : "", more: lnk ? lnk.textContent : "", film: film
    };
  });

  /* Kapitel öffnen sich als Ebene über der Seite (wie die Info-Karten bei DLS) */
  var hold = el("div", "rf-hold"); hold.hidden = true;
  var ov = el("div", "rf-ov"); ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.hidden = true;
  ov.innerHTML = '<div class="rf-box"><div class="rf-top"><span class="rf-cnt"></span><span class="rf-ctl"><button type="button" class="rf-p" aria-label="Voriges Kapitel">‹</button><button type="button" class="rf-n" aria-label="Nächstes Kapitel">›</button><button type="button" class="rf-x" aria-label="Schließen">×</button></span></div><div class="rf-body"></div></div>';
  document.body.appendChild(ov); document.body.appendChild(hold);
  var cur = -1, body = $(".rf-body", ov);
  function openCh(k) {
    k = (k + chs.length) % chs.length;
    if (cur >= 0) hold.appendChild(chs[cur]);
    cur = k; body.appendChild(chs[k]); $(".rf-cnt", ov).textContent = (k + 1) + " / " + chs.length + " · " + info[k].name;
    ov.hidden = false; root.classList.add("rf-lock"); $(".rf-box", ov).scrollTop = 0;
  }
  function closeCh() { if (cur >= 0) hold.appendChild(chs[cur]); cur = -1; ov.hidden = true; root.classList.remove("rf-lock"); }
  $(".rf-x", ov).addEventListener("click", closeCh);
  $(".rf-p", ov).addEventListener("click", function () { openCh(cur - 1); });
  $(".rf-n", ov).addEventListener("click", function () { openCh(cur + 1); });
  ov.addEventListener("click", function (e) { if (e.target === ov) closeCh(); });
  addEventListener("keydown", function (e) { if (ov.hidden) return; if (e.key === "Escape") closeCh(); if (e.key === "ArrowRight") openCh(cur + 1); if (e.key === "ArrowLeft") openCh(cur - 1); });
  document.addEventListener("click", function (e) {
    var a = e.target.closest('a[href^="#k-"]'); if (!a) return;
    var k = chs.findIndex(function (s) { return "#" + s.id === a.getAttribute("href"); });
    if (k >= 0) { e.preventDefault(); openCh(k); }
  }, true);

  /* Die Kapitel-Erzählung weicht: Kapitel liegen in der Ablage, Hero wird neu gebaut */
  chs.forEach(function (s) { hold.appendChild(s); });
  function card(i, k, cls) {
    var b = el("button", cls); b.type = "button";
    b.innerHTML = '<span class="rf-shot"><img src="' + i.img + '" alt="" loading="lazy"></span><span class="rf-i" aria-hidden="true">i</span><span class="rf-cap"><small>' + i.icon + i.name + '</small><b>' + i.title + '</b></span>';
    b.setAttribute("aria-label", i.name + ": " + i.title);
    b.addEventListener("click", function () { openCh(k); });
    return b;
  }
  function row(title, items, cls) {
    var r = el("section", "rf-row " + (cls || "")), hd = el("div", "rf-rhd w");
    hd.innerHTML = "<h3>" + title + '</h3><span class="rf-arrs"><button type="button" aria-label="Zurück">‹</button><button type="button" aria-label="Weiter">›</button></span>';
    var tr = el("div", "rf-track"); items.forEach(function (x) { tr.appendChild(x); });
    var bs = $$(".rf-arrs button", hd);
    bs[0].addEventListener("click", function () { tr.scrollBy({ left: -tr.clientWidth * .8, behavior: reduce ? "auto" : "smooth" }); });
    bs[1].addEventListener("click", function () { tr.scrollBy({ left: tr.clientWidth * .8, behavior: reduce ? "auto" : "smooth" }); });
    r.appendChild(hd); r.appendChild(tr); return r;
  }
  function newsCards() {
    var out = [];
    if (!news) return out;
    $$(".nfix .hlm", news).forEach(function (a) { var c = a.cloneNode(true); c.className = "rf-mag"; out.push(c); });
    $$(".ntile", news).forEach(function (a) { var c = a.cloneNode(true); c.className = "rf-news"; out.push(c); });
    return out;
  }

  /* ───────── D: Technik von DLS ───────── */
  if (V === "d") {
    var mb = $(".nav [data-menu]"); if (mb) mb.insertAdjacentHTML("beforeend", "<span>Menü</span>");
    var h = el("section", "rfd-hero w");
    var h1 = $("h1", hero), cl = $(".claimline", hero), tag = $(".apptag", hero);
    // Bilder in der Überschrift, wie die Logos bei DLS (Wörter unverändert)
    if (h1) {
      var tiles = '<span class="rfd-tiles" aria-hidden="true">' + ["apple", "discover", "ai"].map(function (n) { return '<img src="../../web/img/app/' + n + '.jpg" alt="">'; }).join("") + "</span>";
      h1.innerHTML = h1.innerHTML.replace("und Finanzen", tiles + " und Finanzen");
    }
    var tick = el("div", "rfd-tick"); var tl = el("div");
    info.concat(info).forEach(function (i) { tl.appendChild(el("span", "", i.name)); }); tick.appendChild(tl); tick.setAttribute("aria-hidden", "true");
    var head = el("div", "rfd-head"); [tag, cl, h1].forEach(function (x) { if (x) head.appendChild(x); });
    var foot = el("div", "rfd-foot"); [$("p.t", hero), $(".acts", hero), $(".stores", hero)].forEach(function (x) { if (x) foot.appendChild(x); });
    foot.insertAdjacentHTML("beforeend", '<a class="rfd-scroll" href="#rfd-show">Scrollen <i aria-hidden="true">↓</i></a>');
    h.appendChild(head); h.appendChild(tick); h.appendChild(foot);

    // Großer Film-Block, dann schwarze Bühne mit Reihen (wie „Entertainment-Formate“)
    var show = el("section", "rfd-show"); show.id = "rfd-show";
    var fh = filme ? $("h2", filme) : null, fs = filme ? $(".sub", filme) : null;
    show.innerHTML = '<div class="rfd-vid"><video src="../../partner/media/start.mp4" poster="../../partner/media/discover.jpg" muted loop playsinline preload="metadata"></video><div class="rfd-over w"><h2></h2><p></p><span class="rfd-btns"><button type="button" class="rfd-play">▶ Ansehen</button><a class="rfd-ghost" href="#newsletter">' + START + "</a></span></div></div>";
    $("h2", show).textContent = fh ? fh.textContent : ""; $("p", show).textContent = fs ? fs.textContent : "";
    var vid = $("video", show);
    $(".rfd-play", show).addEventListener("click", function () { vid.muted = false; vid.currentTime = 0; vid.controls = true; vid.play(); });
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting && !reduce) vid.play().catch(function () {}); else if (!e.isIntersecting) vid.pause(); }); }, { threshold: .25 }).observe(vid);
    var dark = el("div", "rfd-dark");
    dark.appendChild(row((($(".nav .links a") || {}).textContent || "Die App"), info.map(function (i, k) { return card(i, k, "rf-card"); }), "rf-apps"));
    var films = fans.map(function (b) { b.removeAttribute("style"); b.className = "rf-film"; return b; });
    dark.appendChild(row(fh ? fh.textContent : "", films, "rf-films"));
    var nh = news ? $("h2", news) : null;
    var nr = row(nh ? nh.textContent : "", newsCards(), "rf-newsrow");
    var al = news ? $(".lnk", news) : null; if (al) { var a2 = al.cloneNode(true); a2.className = "rf-all"; $(".rf-rhd", nr).insertBefore(a2, $(".rf-arrs", nr)); }
    dark.appendChild(nr);
    show.appendChild(dark); story.parentNode.insertBefore(h, story); story.parentNode.insertBefore(show, story);
    story.remove(); if (news) news.remove(); if (filme) filme.hidden = true;
  }

  /* ───────── R: Technik von Rockstar Games ───────── */
  if (V === "r") {
    var slides = [], stage = el("section", "rfr-hero");
    var mk = function (o) {
      var s = el("div", "rfr-slide");
      s.innerHTML = '<div class="rfr-bg" style="background-image:url(' + o.poster + ')"></div><div class="rfr-key"><video muted loop playsinline preload="none" poster="' + o.poster + '"></video></div>' +
        '<div class="rfr-cap w"><span class="rfr-th"><img src="' + o.thumb + '" alt=""></span><span class="rfr-tx"><small></small><b></b><span class="rfr-btns"><button type="button" class="rfr-a"></button><a class="rfr-b" href="#newsletter">' + START + ' <i>↗</i></a></span></span></div>';
      $("small", s).textContent = o.kicker; $("b", s).textContent = o.title; $(".rfr-a", s).textContent = o.more;
      $(".rfr-a", s).addEventListener("click", o.go);
      $("video", s).dataset.src = o.vid;
      if (o.film) $(".rfr-key", s).addEventListener("click", function () { o.film.click(); });
      return s;
    };
    var hh1 = $("h1", hero), htag = $(".apptag", hero);
    slides.push(mk({ poster: "../../partner/media/discover.jpg", vid: "../../partner/media/start.mp4", thumb: "../../web/img/app/apple.jpg", kicker: htag ? htag.textContent : "", title: hh1 ? hh1.textContent : "", more: "Mehr erfahren", go: function () { $("#rfr-apps").scrollIntoView({ behavior: reduce ? "auto" : "smooth" }); } }));
    info.forEach(function (i, k) {
      if (!i.film) return;
      slides.push(mk({ poster: i.film.querySelector("img").getAttribute("src"), vid: i.film.getAttribute("data-vid"), thumb: i.img, kicker: i.name, title: i.title, more: "Mehr erfahren", film: i.film, go: function () { openCh(k); } }));
    });
    var track = el("div", "rfr-track"); slides.forEach(function (s) { track.appendChild(s); }); stage.appendChild(track);
    var ctl = el("div", "rfr-ctl w"), pause = el("button", "rfr-pause", "❚❚"), dots = el("div", "rfr-dots");
    pause.type = "button"; pause.setAttribute("aria-label", "Pause");
    slides.forEach(function (s, k) { var d = el("button", "", "<i></i>"); d.type = "button"; d.setAttribute("aria-label", "Folie " + (k + 1)); d.addEventListener("click", function () { go(k); }); dots.appendChild(d); });
    ctl.appendChild(pause); ctl.appendChild(dots); stage.appendChild(ctl);
    var at = 0, timer = null, playing = !reduce, DUR = 8000;
    function go(k) {
      at = (k + slides.length) % slides.length;
      slides.forEach(function (s, j) {
        s.classList.toggle("on", j === at); var v = $("video", s);
        if (j === at) { if (!v.src) v.src = v.dataset.src; v.currentTime = 0; if (!reduce) v.play().catch(function () {}); } else v.pause();
      });
      $$("button", dots).forEach(function (d, j) { d.classList.toggle("on", j === at); d.classList.remove("run"); void d.offsetWidth; if (j === at && playing) d.classList.add("run"); });
      clearTimeout(timer); if (playing) timer = setTimeout(function () { go(at + 1); }, DUR);
    }
    pause.addEventListener("click", function () { playing = !playing; pause.textContent = playing ? "❚❚" : "▶"; pause.setAttribute("aria-label", playing ? "Pause" : "Abspielen"); go(at); });
    var sx = 0; stage.addEventListener("touchstart", function (e) { sx = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener("touchend", function (e) { var dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) go(at + (dx < 0 ? 1 : -1)); }, { passive: true });

    // Newswire: großer Aufmacher links, Liste rechts
    var wire = el("section", "rfr-wire"), win = el("div", "w");
    if (news) {
      var nh2 = $("h2", news), tiles2 = $$(".ntile", news), lead = tiles2[0];
      win.innerHTML = '<div class="rfr-whd"><h2></h2></div><div class="rfr-grid"><div class="rfr-lead"></div><div class="rfr-list"></div></div><div class="rfr-mags"></div>';
      $("h2", win).textContent = nh2 ? nh2.textContent : "";
      var al2 = $(".lnk", news); if (al2) $(".rfr-whd", win).appendChild(al2.cloneNode(true));
      if (lead) { var lc = lead.cloneNode(true); lc.className = "rfr-big"; $(".rfr-lead", win).appendChild(lc); }
      tiles2.slice(1, 5).forEach(function (t) { var c = t.cloneNode(true); c.className = "rfr-it"; $(".rfr-list", win).appendChild(c); });
      $$(".nfix .hlm", news).forEach(function (a) { var c = a.cloneNode(true); c.className = "rfr-mag"; $(".rfr-mags", win).appendChild(c); });
    }
    wire.appendChild(win);
    // Kacheln wie die Spiele-Übersicht
    var apps = el("section", "rfr-apps w"); apps.id = "rfr-apps";
    apps.innerHTML = "<h2>" + ((($(".nav .links a") || {}).textContent) || "Die App") + '</h2><div class="rfr-tiles"></div>';
    info.forEach(function (i, k) { $(".rfr-tiles", apps).appendChild(card(i, k, "rfr-tile")); });
    story.parentNode.insertBefore(stage, story); story.parentNode.insertBefore(wire, story); story.parentNode.insertBefore(apps, story);
    story.remove(); if (news) news.remove(); if (filme) filme.hidden = true;
    go(0);
  }
})();
