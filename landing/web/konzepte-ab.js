/* Konzepte A und B (Owner 19.11.2026), nur Branch-Vorschau unter /konzepte/. */
(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  /* Menü-Pille wie bei DLS: klappt eine schwarze Karte auf */
  document.querySelectorAll(".kx-pill").forEach(function (p) {
    var b = p.querySelector(".kx-mbtn"), m = p.querySelector(".kx-menu");
    function set(on) { m.hidden = !on; b.setAttribute("aria-expanded", String(on)); p.classList.toggle("open", on); b.querySelector("span").textContent = on ? "Schließen" : "Menü"; }
    b.addEventListener("click", function (e) { e.stopPropagation(); set(m.hidden); });
    m.addEventListener("click", function (e) { if (e.target.closest("a")) set(false); });
    document.addEventListener("click", function (e) { if (!p.contains(e.target)) set(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") set(false); });
  });
  /* Reihen: Pfeile am Desktop */
  document.querySelectorAll(".kx-row, .kx-feat").forEach(function (r) {
    var t = r.querySelector(".kx-track"); if (!t) return;
    r.querySelectorAll("[data-dir]").forEach(function (b) {
      b.addEventListener("click", function () { t.scrollBy({ left: Number(b.dataset.dir) * t.clientWidth * 0.85, behavior: reduce ? "auto" : "smooth" }); });
    });
  });
  /* Filme: Fenster mit Ton beim Antippen */
  document.querySelectorAll(".kx-fc").forEach(function (b) {
    b.addEventListener("click", function () {
      var d = document.createElement("dialog"); d.className = "kx-film";
      var v = document.createElement("video"); v.controls = true; v.playsInline = true; v.src = b.dataset.vid;
      var c = document.createElement("button"); c.type = "button"; c.textContent = "Schließen";
      c.addEventListener("click", function () { d.close(); });
      d.addEventListener("close", function () { v.pause(); d.remove(); });
      d.appendChild(v); d.appendChild(c); document.body.appendChild(d); d.showModal(); try { v.play(); } catch (e) {}
    });
  });
  /* Karussell (Konzept B): schaltet alle 6 Sekunden weiter, Fortschrittsbalken unten */
  var show = document.querySelector(".kx-show");
  if (show) {
    var slides = [].slice.call(show.querySelectorAll(".kx-slide")), dots = [].slice.call(show.querySelectorAll("[data-go]")), cur = 0, timer = null;
    function go(i) {
      cur = (i + slides.length) % slides.length;
      slides.forEach(function (s, k) { s.classList.toggle("on", k === cur); });
      dots.forEach(function (d, k) { d.classList.toggle("on", k === cur); d.classList.remove("run"); void d.offsetWidth; if (k === cur && !reduce) d.classList.add("run"); });
      clearTimeout(timer); if (!reduce) timer = setTimeout(function () { go(cur + 1); }, 6000);
    }
    dots.forEach(function (d, k) { d.addEventListener("click", function () { go(k); }); });
    go(0);
  }
})();
