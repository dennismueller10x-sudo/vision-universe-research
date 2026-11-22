/* Startseite (Owner 21./22.11.2026): Kacheln öffnen ihr Kapitel, Schritte, laufende Bildschirme, News-Bühne,
   dunkle Kopfzeile über dunklen Flächen und Pfeile der News-Reihe. Grundlage Konzept „Welt“. Ohne fremde Quellen. */
(function () {
  "use strict";
  document.documentElement.setAttribute("data-home", "on");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return [].slice.call((c || document).querySelectorAll(s)); }

  /* Kopfzeile dunkel über dunklen Flächen */
  var root = document.documentElement, darks = $$("[data-dark]"), nav = $(".nav");
  function navTone() {
    var y = (nav ? nav.offsetHeight : 66) / 2;
    root.classList.toggle("vw-ondark", darks.some(function (d) { var r = d.getBoundingClientRect(); return r.top <= y && r.bottom >= y; }));
  }
  addEventListener("scroll", navTone, { passive: true }); navTone();

  /* Höhe des Bildschirms einmal beim Laden festhalten (und nur bei neuer Breite, z. B. Drehen): iOS ändert die
     sichtbare Höhe beim Wischen (Leisten ein- und ausblenden); sonst wächst und schrumpft das Telefon im Einstieg. */
  var vw0 = 0;
  function fhVh() { if (innerWidth === vw0) return; vw0 = innerWidth; document.documentElement.style.setProperty("--fh-vh", innerHeight + "px"); }
  fhVh(); addEventListener("resize", fhVh);
  /* Einstieg: Höhe des Textblocks messen, damit das Telefon genau den restlichen Platz bekommt */
  var fhc = $(".fh-copy");
  function fhSize() { if (fhc) document.documentElement.style.setProperty("--fh-copy", fhc.offsetHeight + "px"); }
  fhSize(); addEventListener("resize", fhSize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fhSize);

  /* Kachel klappt ihr Kapitel unter ihrer Zeile auf. Die Kapitel stehen versteckt in der Seite (.chapters)
     und werden nur verschoben, nicht kopiert: Ids, Links und Bausteine bleiben dieselben. */
  var store = $(".chapters"), pan = null, onTile = null, moved = null;
  function closePan() {
    if (moved && store) store.appendChild(moved);
    if (pan) pan.remove();
    pan = null; moved = null;
    if (onTile) { onTile.classList.remove("on"); onTile.setAttribute("aria-expanded", "false"); }
    onTile = null;
  }
  function openPan(t, scroll) {
    var sec = document.getElementById(t.getAttribute("data-open"));
    if (!sec) return false;
    closePan();
    var shot = $(".vw-shot img", t);
    pan = document.createElement("div"); pan.className = "vw-pan";
    pan.innerHTML = '<div class="pi"><button class="px" type="button" aria-label="Schließen">×</button><div class="slot"></div>' +
      (shot ? '<div class="side" aria-hidden="true"><div class="fh-ph"><img src="' + shot.getAttribute("src") + '" alt=""></div></div>' : "") + "</div>";
    $(".slot", pan).appendChild(sec); moved = sec; sec.classList.add("play");
    var bottom = t.offsetTop + t.offsetHeight - 4, last = t, n = t.nextElementSibling;
    while (n && n.classList.contains("vw-tile") && n.offsetTop < bottom) { last = n; n = n.nextElementSibling; }
    last.after(pan);
    t.classList.add("on"); t.setAttribute("aria-expanded", "true"); onTile = t;
    $(".px", pan).addEventListener("click", function () { var tt = onTile; closePan(); if (tt) { tt.focus(); tt.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" }); } });
    fit();
    if (scroll) scrollTo({ top: pan.getBoundingClientRect().top + scrollY - 140, behavior: reduce ? "auto" : "smooth" });
    return true;
  }
  $$("[data-open]").forEach(function (t) {
    t.addEventListener("click", function (e) {
      if (onTile === t) { e.preventDefault(); closePan(); return; }
      if (openPan(t, true)) e.preventDefault();
    });
  });
  /* Das Raster hat feste Zeilenhöhen: das Kapitel bekommt so viele Zeilen, wie es braucht. */
  function fit() {
    if (!pan) return;
    var cs = getComputedStyle(pan.parentElement), rh = parseFloat(cs.gridAutoRows) || 220, gap = parseFloat(cs.rowGap) || 14;
    pan.style.gridRow = "auto"; pan.style.height = "auto";
    var h = $(".pi", pan).scrollHeight;
    pan.style.gridRow = "span " + Math.max(1, Math.ceil((h + gap) / (rh + gap))); pan.style.height = "100%";
  }
  addEventListener("resize", fit);
  /* Alte Links auf #k-… (z. B. von Unterseiten) öffnen das passende Kapitel. */
  function fromHash() {
    var id = location.hash.slice(1), t = id && $('[data-open="' + id + '"]');
    if (t && onTile !== t) openPan(t, true);
  }
  addEventListener("hashchange", fromHash); fromHash();

  /* Drei Schritte: Linie füllt sich, Schritte leuchten nacheinander auf */
  var band = $(".st-band");
  if (band) {
    var go = function () { band.classList.add("go"); $$(".st-g li", band).forEach(function (li, i) { setTimeout(function () { li.classList.add("on"); }, reduce ? 0 : 200 + i * 900); }); };
    if ("IntersectionObserver" in window) { var sio = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { go(); sio.disconnect(); } }, { threshold: .35 }); sio.observe(band); } else go();
  }

  /* Kacheln: der kleine App-Bildschirm läuft, solange die Kachel sichtbar ist */
  if ("IntersectionObserver" in window && !reduce) {
    var tio = new IntersectionObserver(function (es) { es.forEach(function (e) { e.target.classList.toggle("play", e.isIntersecting); }); }, { threshold: .4 });
    $$(".vw-tile").forEach(function (t) { tio.observe(t); });
  }

  /* News-Reihen: Pfeile */
  $$(".vw-row").forEach(function (r) {
    var tr = $(".vw-track", r), b = $$(".vw-arr button", r); if (!tr || b.length < 2) return;
    b[0].addEventListener("click", function () { tr.scrollBy({ left: -tr.clientWidth * .8, behavior: reduce ? "auto" : "smooth" }); });
    b[1].addEventListener("click", function () { tr.scrollBy({ left: tr.clientWidth * .8, behavior: reduce ? "auto" : "smooth" }); });
  });

  /* News-Bühne: wechselt alle 6 Sekunden zwischen den neuesten Artikeln. Die Artikel der Bühne stehen
     dann nicht noch einmal in der Reihe darunter. Bei reduzierter Bewegung bleibt alles stehen. */
  var bill = $(".vw-bill");
  if (bill && !reduce) {
    var bg = $(".bg", bill), tag = $(".vw-tag", bill), h = $("h2", bill), p = $(".w > p:not(.vw-tag)", bill), link = $(".vw-bbtn a", bill);
    var items = [{ img: bg.getAttribute("src"), tag: tag.textContent, title: h.textContent, text: p ? p.textContent : "", href: link ? link.getAttribute("href") : "#" }];
    var track = $(".vw-row .vw-track");
    if (track) $$("a.vw-card", track).slice(0, 4).forEach(function (c) {
      var im = $("img", c), sm = $("small", c), b = $("b", c), em = $("em", c);
      if (im && b) { items.push({ img: im.getAttribute("src"), tag: sm ? sm.textContent : "", title: b.textContent, text: em ? em.textContent : "", href: c.getAttribute("href") }); c.remove(); }
    });
    if (items.length > 1) {
      var dots = document.createElement("div"); dots.className = "vw-dots"; dots.setAttribute("aria-hidden", "true");
      items.forEach(function () { dots.appendChild(document.createElement("i")); });
      $(".w", bill).appendChild(dots); dots.children[0].classList.add("on");
      var cur = 0;
      setInterval(function () {
        cur = (cur + 1) % items.length; var it = items[cur];
        $$("i", dots).forEach(function (d, k) { d.classList.remove("on"); if (k === cur) { void d.offsetWidth; d.classList.add("on"); } });
        bill.classList.add("swap");
        setTimeout(function () {
          bg.src = it.img; tag.textContent = it.tag; h.textContent = it.title;
          if (p) { p.textContent = it.text; p.style.display = it.text ? "" : "none"; }
          if (link) link.setAttribute("href", it.href);
          bill.classList.remove("swap");
        }, 450);
      }, 6000);
    }
  }
})();
