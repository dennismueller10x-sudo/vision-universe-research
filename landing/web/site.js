/* Vision Universe · www.visionuniverse.de · Story-Website. Handarbeit. Keine Anfrage an andere Adressen. */
document.documentElement.classList.add("js");
/* Mock-up: Formular sendet nichts. Start-Knopf unten erscheint nach dem Hero und geht, sobald die Anmeldung im Bild ist. */
(function () {
  document.querySelectorAll("form.mail").forEach(function (f) {
    f.addEventListener("submit", function (e) { e.preventDefault(); f.classList.add("sent"); });
  });
  var dock = document.querySelector(".dock"), hero = document.querySelector("[data-hero]"), join = document.getElementById("newsletter");
  if (dock && hero && "IntersectionObserver" in window) {
    var heroIn = true, joinIn = false;
    var upd = function () { dock.classList.toggle("on", !heroIn && !joinIn); };
    new IntersectionObserver(function (es) { heroIn = es[0].isIntersecting; upd(); }).observe(hero);
    if (join) new IntersectionObserver(function (es) { joinIn = es[0].isIntersecting; upd(); }).observe(join);
  }
})();

/* Story: Fortschritt, Handy-Wechsel, Filme-Fächer, Menü, News aus news.json */
(function () {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Menü-Blatt am Handy */
  var sheet = document.querySelector(".sheet");
  document.querySelectorAll("[data-menu]").forEach(function (b) {
    b.addEventListener("click", function () { sheet.classList.toggle("on"); b.setAttribute("aria-expanded", sheet.classList.contains("on")); });
  });
  if (sheet) sheet.addEventListener("click", function (e) { if (e.target === sheet || e.target.closest("a")) sheet.classList.remove("on"); });

  /* Fortschritt und Handy */
  var chs = [].slice.call(document.querySelectorAll("[data-ch]"));
  var bars = [].slice.call(document.querySelectorAll(".prog a"));
  var box = document.getElementById("ph"), lbl = document.getElementById("phl"), cur = -1;
  function media(src) {
    return /\.mp4$/.test(src) ? '<video src="' + src + '" autoplay muted loop playsinline></video>' : '<img src="' + src + '" alt="">';
  }
  function set(i) {
    if (i === cur) return; cur = i;
    bars.forEach(function (b, k) { b.classList.toggle("done", k < i); b.classList.toggle("cur", k === i); });
    var c = chs[i], src = c.getAttribute("data-img");
    var im = box && box.querySelector(".scr img");
    if (im && src && box.getAttribute("data-src") !== src) {
      box.setAttribute("data-src", src);
      var key = src.split("/").pop().replace(/\.[a-z]+$/, ""), H = (JSON.parse(document.body.dataset.apph || "{}"))[key] || 788;
      im.style.opacity = 0;
      setTimeout(function () { im.src = src; im.style.setProperty("--H", H); im.style.setProperty("--dur", Math.max(10, Math.round(H / 110)) + "s"); im.style.animation = "none"; void im.offsetWidth; im.style.animation = ""; im.style.opacity = 1; }, reduce ? 0 : 180);
    }
    if (lbl && c.getAttribute("data-lbl")) lbl.textContent = c.getAttribute("data-lbl");
    var jb = document.querySelector(".jbar");
    if (jb) {
      var id = c.id || (c.querySelector("[id]") || {}).id || "", hit = null;
      jb.querySelectorAll("a").forEach(function (a) { var on = a.getAttribute("href") === "#" + id; a.classList.toggle("cur", on); if (on) hit = a; });
      if (hit) { var jin = jb.querySelector(".jin"); jin.scrollTo({ left: hit.offsetLeft - jin.clientWidth / 2 + hit.clientWidth / 2, behavior: reduce ? "auto" : "smooth" }); }
    }
    var stk = document.querySelector(".stick"); if (stk) stk.classList.toggle("hero-on", i === 0);
  }
  bars.forEach(function (b, k) { b.addEventListener("click", function () { chs[k].scrollIntoView({ behavior: reduce ? "auto" : "smooth" }); }); });
  if (chs.length) {
    set(0);
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) set(chs.indexOf(e.target)); }); }, { rootMargin: "-45% 0px -45% 0px" });
      chs.forEach(function (c) { io.observe(c); });
    }
  }

  /* Filme: Fenster mit Ton entsteht erst beim Antippen */
  function openFilm(src, poster) {
    var d = document.createElement("dialog"); d.className = "vbox"; d.setAttribute("aria-label", "Film");
    var v = document.createElement("video"); v.controls = true; v.playsInline = true; v.src = src; if (poster) v.poster = poster;
    var c = document.createElement("button"); c.type = "button"; c.className = "vclose"; c.textContent = "Schließen";
    c.addEventListener("click", function () { d.close(); });
    d.addEventListener("close", function () { v.pause(); d.remove(); });
    d.appendChild(v); d.appendChild(c); document.body.appendChild(d);
    if (d.showModal) d.showModal(); else d.setAttribute("open", "");
    try { v.play(); } catch (e) {}
  }
  document.querySelectorAll(".fan button, .reel9").forEach(function (b) {
    b.addEventListener("click", function () { var im = b.querySelector("img"); openFilm(b.getAttribute("data-vid"), im ? im.src : ""); });
  });

  /* Aktienreport: kippt mit Maus oder Finger, Tippen dreht um */
  document.querySelectorAll(".r3").forEach(function (b) {
    var inner = b.querySelector(".r3in");
    function tilt(e) {
      var r = b.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      inner.style.setProperty("--ry", (x * 26).toFixed(1) + "deg"); inner.style.setProperty("--rx", (-y * 20).toFixed(1) + "deg");
      inner.style.setProperty("--gx", ((x + .5) * 100).toFixed(0) + "%"); inner.style.setProperty("--gy", ((y + .5) * 100).toFixed(0) + "%");
    }
    function reset() { inner.style.setProperty("--ry", "0deg"); inner.style.setProperty("--rx", "0deg"); }
    if (!reduce) { b.addEventListener("pointermove", tilt); b.addEventListener("pointerleave", reset); }
    b.addEventListener("click", function () { b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true")); });
  });

  /* Claim-Vorschläge: index.html#claim-2 usw. zeigt einen anderen Claim im Hero */
  var CLAIMS = {
    "claim-1": ["Die Börse ist laut. Wir bringen Ordnung hinein.", 'Aktien und Finanzen <mark>richtig verstehen.</mark>'],
    "claim-2": ["Aktien und Finanzen richtig verstehen.", 'Die Börse ist laut. Wir bringen <mark>Ordnung</mark> hinein.'],
    "claim-3": ["Die Börse ist laut. Wir bringen Ordnung hinein.", 'Aktien und Börse <mark>richtig verstehen.</mark>'],
    "claim-4": ["Aktien und Finanzen richtig verstehen.", 'Weniger Lärm. <mark>Mehr Durchblick.</mark>'],
    "claim-5": ["Die Börse ist laut. Wir bringen Ordnung hinein.", 'Jede Aktie. Jede Zahl. <mark>Ein Satz.</mark>'],
    "claim-6": ["Aktien und Finanzen richtig verstehen.", 'Sieh, was hinter dem <mark>Kurs</mark> steckt.']
  };
  function claim() { var h = document.getElementById("claim"), l = document.getElementById("claimline"), k = location.hash.slice(1); if (h && CLAIMS[k]) { h.innerHTML = CLAIMS[k][1]; if (l) l.textContent = CLAIMS[k][0]; } }
  claim(); window.addEventListener("hashchange", claim);

  /* Produkte-Menü: schließt bei Klick daneben oder mit Escape */
  var mega = document.querySelector(".mega");
  if (mega) {
    document.addEventListener("click", function (e) { if (mega.open && !mega.contains(e.target)) mega.open = false; });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") mega.open = false; });
  }

  /* Schnellsuche: Vorschläge filtern, Enter springt zum ersten Treffer */
  var qi = document.getElementById("qsin");
  if (qi) {
    var chips = [].slice.call(document.querySelectorAll(".qschips a"));
    qi.addEventListener("input", function () { var v = qi.value.trim().toLowerCase(); chips.forEach(function (c) { var w = v.split(/\s+/).filter(Boolean); c.hidden = w.length && !w.every(function (x) { return c.dataset.q.indexOf(x) >= 0; }); }); });
    qi.addEventListener("keydown", function (e) { if (e.key === "Enter") { var f = chips.find(function (c) { return !c.hidden; }); if (f) { e.preventDefault(); location.hash = f.getAttribute("href").slice(1); } } });
  }

  /* Grafiken spielen ab, sobald ihr Kapitel im Bild ist */
  if ("IntersectionObserver" in window && !reduce) {
    var po = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("play"); po.unobserve(e.target); } }); }, { threshold: .2 });
    document.querySelectorAll("[data-ch]").forEach(function (c) { if (c.querySelector(".wd")) po.observe(c); });
  }
  /* Discover: Ranglisten wechseln sich ab */
  var lists = [].slice.call(document.querySelectorAll(".ranks .rank"));
  if (lists.length > 1 && !reduce) {
    var li = 0;
    setInterval(function () { lists[li].hidden = true; li = (li + 1) % lists.length; lists[li].hidden = false; }, 4500);
  }

})();
