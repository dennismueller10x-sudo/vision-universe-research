/* Vision Universe · www.visionuniverse.de
 * 1) Cookie-Einwilligung (Owner 17.11.2026): Google Analytics lädt erst nach „Akzeptieren“.
 *    Die Mess-ID steht im Kopf jeder Seite (<meta name="vu-ga" content="G-…">, gesetzt beim Bau aus
 *    LANDING_GA_ID). Ohne ID wird nichts geladen, auch nach Zustimmung nicht.
 *    Die Auswahl liegt im Browser (localStorage „vu-consent“), erst nach einem Klick.
 * 2) Newsletter-Fenster: nach der Cookie-Auswahl, einmal je Besuch. Es zeigt das bestehende
 *    Anmeldeformular der Seite (dasselbe Element, verschoben, nicht kopiert) und gibt es beim
 *    Schließen an seinen Platz zurück. Formular, Skript und Server bleiben unverändert.
 */
(function () {
  "use strict";
  var KEY = "vu-consent", VERSION = 1, POP = "vu-nl-popup";
  var meta = document.querySelector('meta[name="vu-ga"]');
  var GA = meta && /^G-[A-Z0-9]{4,16}$/.test(meta.content) ? meta.content : "";
  var root = (document.querySelector('link[rel="icon"]') || { getAttribute: function () { return "./assets/x"; } }).getAttribute("href").replace(/assets\/.*$/, "");

  function read() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || "null"); return v && v.v === VERSION ? v : null; } catch (e) { return null; }
  }
  function write(stats) {
    var v = { v: VERSION, stats: !!stats, t: new Date().toISOString().slice(0, 10) };
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {}
    return v;
  }

  /* Google Analytics: nur nach Zustimmung und nur mit Mess-ID */
  function loadGA() {
    if (!GA || window.__vuGA) return;
    window.__vuGA = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", GA, { anonymize_ip: true });
    var s = document.createElement("script"); s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GA);
    document.head.appendChild(s);
  }
  function dropGA() {
    document.cookie.split(";").forEach(function (c) {
      var n = c.split("=")[0].trim();
      if (/^_ga/.test(n) || n === "_gid") {
        ["", "; domain=.visionuniverse.de", "; domain=" + location.hostname].forEach(function (d) {
          document.cookie = n + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/" + d;
        });
      }
    });
  }

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  /* Banner */
  var banner = null, lastFocus = null;
  function close(choice) {
    var before = read(), v = write(choice);
    if (banner) { banner.remove(); banner = null; }
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    if (v.stats) loadGA();
    else if (before && before.stats) { dropGA(); location.reload(); return; }
    popupLater();
  }
  function show(settings) {
    if (banner) banner.remove();
    lastFocus = document.activeElement;
    var cur = read();
    banner = el("section", "cc", null);
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-modal", "false");
    banner.setAttribute("aria-labelledby", "cc-title");
    banner.innerHTML =
      '<div class="cc-in"><h2 id="cc-title">Cookies und Statistik</h2>' +
      '<p>Wir möchten verstehen, wie unsere Website genutzt wird, und sie so verbessern. Dafür nutzen wir Google Analytics und setzen Cookies, aber nur, wenn du zustimmst. ' +
      'Die Website funktioniert auch ohne. Deine Wahl kannst du jederzeit unten auf der Seite unter „Cookie-Einstellungen“ ändern. Mehr dazu in der <a href="' + root + 'datenschutz/">Datenschutzerklärung</a>.</p>' +
      (settings ?
        '<fieldset class="cc-opts"><legend class="sr-only">Auswahl</legend>' +
        '<label class="cc-opt"><input type="checkbox" checked disabled><span><b>Notwendig</b>Speichert deine Auswahl in diesem Browser. Immer an.</span></label>' +
        '<label class="cc-opt"><input type="checkbox" id="cc-stats"' + (cur && cur.stats ? " checked" : "") + '><span><b>Statistik</b>Google Analytics: welche Seiten wie oft besucht werden, ohne deinen Namen. Daten können in die USA übertragen werden.</span></label></fieldset>' +
        '<div class="cc-b"><button type="button" class="cc-btn" data-cc="no">Ablehnen</button><button type="button" class="cc-btn" data-cc="save">Auswahl speichern</button><button type="button" class="cc-btn" data-cc="yes">Alle akzeptieren</button></div>'
        :
        '<div class="cc-b"><button type="button" class="cc-btn" data-cc="no">Ablehnen</button><button type="button" class="cc-btn cc-set" data-cc="settings">Einstellungen</button><button type="button" class="cc-btn" data-cc="yes">Akzeptieren</button></div>') +
      "</div>";
    banner.addEventListener("click", function (e) {
      var b = e.target.closest("[data-cc]"); if (!b) return;
      var a = b.getAttribute("data-cc");
      if (a === "settings") { show(true); return; }
      if (a === "save") { var s = banner.querySelector("#cc-stats"); close(s && s.checked); return; }
      close(a === "yes");
    });
    banner.addEventListener("keydown", function (e) { if (e.key === "Escape" && read()) { banner.remove(); banner = null; } });
    document.body.appendChild(banner);
    var first = banner.querySelector(settings ? "#cc-stats" : "[data-cc]");
    if (first && settings) first.focus();
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-consent-open]");
    if (t) { e.preventDefault(); show(true); }
  });

  /* Newsletter-Fenster */
  var popTimer = null;
  function popupLater() {
    var form = document.getElementById("newsletter-form"), sec = document.getElementById("newsletter");
    if (!form || !sec || !window.HTMLDialogElement || popTimer) return;
    try { if (sessionStorage.getItem(POP)) return; } catch (e) { return; }
    var seen = false;
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { if (es[0].isIntersecting) seen = true; }).observe(sec);
    var fire = function () {
      window.removeEventListener("scroll", onScroll);
      if (seen || form.dataset.ready !== "true" || document.querySelector("dialog[open], section.cc")) return;
      openPopup(form);
    };
    var onScroll = function () { if (scrollY > (document.documentElement.scrollHeight - innerHeight) * 0.25) { clearTimeout(popTimer); fire(); } };
    popTimer = setTimeout(fire, 9000);
    window.addEventListener("scroll", onScroll, { passive: true });
  }
  function openPopup(form) {
    try { sessionStorage.setItem(POP, "1"); } catch (e) {}
    var home = form.parentNode, next = form.nextSibling;
    var d = el("dialog", "nlpop", null);
    d.setAttribute("aria-labelledby", "nlpop-title");
    d.innerHTML = '<button type="button" class="nlpop-x" aria-label="Schließen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
      '<p class="soon nlpop-tag">App bald verfügbar · kostenlos</p>' +
      '<h2 id="nlpop-title">Sei beim <mark>Start</mark> dabei.</h2>' +
      '<p class="nlpop-t">Vision Universe kommt bald in den App Store und zu Google Play. Trag dich ein, dann sagen wir dir Bescheid, sobald die App da ist.</p>' +
      '<div class="nlpop-f newsletter"></div><button type="button" class="nlpop-later">Später</button>';
    d.querySelector(".nlpop-f").appendChild(form);
    var shut = function () { if (d.open) d.close(); };
    d.querySelector(".nlpop-x").addEventListener("click", shut);
    d.querySelector(".nlpop-later").addEventListener("click", shut);
    d.addEventListener("click", function (e) { if (e.target === d) shut(); });
    d.addEventListener("close", function () { home.insertBefore(form, next); d.remove(); });
    document.body.appendChild(d);
    d.showModal();
    var email = form.querySelector("#email"); if (email && !email.disabled) email.focus();
  }

  var c = read();
  if (c) { if (c.stats) loadGA(); popupLater(); }
  else if (document.body) show(false);
  else document.addEventListener("DOMContentLoaded", function () { show(false); });
})();
