/* VISION UNIVERSE ELLIOTT — aktie.js: Aktienbild /elliott/#/<T> nach App-Konzept 2 (Owner 14.11.2026). Nur Darstellung.
   Das Aktienbild baut weiter quant/app/page-chartbild.js (unberührt). Diese Datei lädt nur mit dem Aktienbild (app.js,
   loadStack) und ordnet das fertige Markup um, sobald die Ansicht fertig gemeldet ist (main[data-view=elliott][data-ready=true]):
   Kapitel und „Daten & Methodik“ öffnen als Fenster (C16) statt an Ort und Stelle, der Tipp zum Chart steht hinter „?“,
   „Hauptlesart | Alternative“ und die Zeitreise stehen beim Chart, den sie steuern, die Zeile „← Elliott · Frag VU“ steht am
   Seitenende, davor die „Weiter“-Karte. Balken entstehen nur aus Zahlen, die auf der Seite stehen.
   Hier entsteht keine Zahl und kein Satz: jeder Knoten wird verschoben, nicht neu geschrieben. Einzige neue Elemente sind die
   „Weiter“-Karte (Wortlaut und Ziel der bestehenden Karte „Chart-Lage in Technical ansehen“) und die Balken.
   Fehlt VUUI oder ein Baustein, bleibt das bisherige Aussehen (die Klasse is-ak2 schaltet die zugehörigen Stile in wellen.css). */
(function (global) {
  "use strict";
  if (global.VUElliottAktie) return;
  var doc = global.document;

  function node(html) { var t = doc.createElement("template"); t.innerHTML = html; return t.content.firstElementChild; }
  function make(tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function text(scope, sel) { var n = scope && scope.querySelector(sel); return n ? n.textContent.trim() : ""; }
  /* Kapitel und Aufklapper füllen sich beim ersten „toggle“ (page-chartbild.js#ewChapter): einmal auslösen, ohne aufzuklappen. */
  function fill(d) { if (d.open) return; d.open = true; d.dispatchEvent(new global.Event("toggle")); d.open = false; }

  /* Fenster (C16) im Aktienbild selbst: der Inhalt behält seine Stile (#el-detail .cb …) und der Beobachter aus app.js setzt
     Quant-Links wie auf der Seite. inhalt ist der echte Knoten (mit seinen Schaltern), er kehrt beim Schließen nach heim zurück. */
  function fenster(cb, titel, dach, inhalt, heim) {
    var U = global.VUUI, alt = doc.getElementById("ew-pop");
    if (alt) U.closeSheet(alt);
    var wrap = make("div"); wrap.innerHTML = U.sheet("ew-pop", titel, "");
    var el = wrap.firstChild, body = el.querySelector(".vu-sheet-body"), watch = null;
    el.classList.add("ew-pop");
    if (dach) body.appendChild(make("p", "vu-ltag ew-pop-k", dach));
    body.appendChild(inhalt);
    cb.appendChild(el);
    function gone() {
      if (!el) return;
      var e = el; el = null;
      if (watch) watch.disconnect();
      global.removeEventListener("hashchange", away);
      heim.appendChild(inhalt);
      if (e.parentNode) e.remove();
    }
    function away() { var e = el; if (e) { U.closeSheet(e); gone(); } }
    el.addEventListener("vu-sheet-close", gone);
    global.addEventListener("hashchange", away);
    U.openSheet(el);
    /* Schließt etwas anderes das Fenster (Gesten der App setzen nur hidden), kehrt der Inhalt trotzdem zurück. */
    if (global.MutationObserver) { watch = new global.MutationObserver(function () { if (el && el.hidden) { U.closeSheet(el); gone(); } }); watch.observe(el, { attributes: true, attributeFilter: ["hidden"] }); }
    /* Ein Knopf „Im Chart zeigen“ schließt das Fenster: der Chart liegt dahinter. */
    body.addEventListener("click", function (ev) { if (ev.target.closest && ev.target.closest(".cb-pj-btn")) away(); });
    return el;
  }
  function alsFenster(cb, d, titel, dach, inhaltSel) {
    var sum = d.querySelector(":scope > summary");
    if (!sum) return;
    sum.setAttribute("aria-haspopup", "dialog");
    sum.addEventListener("click", function (ev) {
      ev.preventDefault();
      fill(d);
      var inhalt = d.querySelector(inhaltSel);
      if (inhalt) fenster(cb, titel(), dach(), inhalt, d);
    });
  }

  /* Balken neben Anteilen, die als „35 %“ auf der Seite stehen (Forschungsblock: erreicht gegen Zufall, gleiche Skala 0–100). */
  function balken(scope) {
    var U = global.VUUI;
    if (!U.meter) return;
    Array.prototype.forEach.call(scope.querySelectorAll(".cb-stats .cb-stat"), function (st, i) {
      var v = st.querySelector("strong"), m = v && /^(\d{1,3}) %$/.exec(v.textContent.trim());
      if (!m || +m[1] > 100 || st.querySelector(".vu-meter")) return;
      var bar = node(U.meter(+m[1], { lime: i === 0, label: text(st, ".cb-stat-label") }));
      bar.classList.add("ew-bar"); v.after(bar);
    });
  }

  /* Leiter im Kapitel „Die Wellen im Chart“: je Welle ein Punkt auf derselben Skala (tiefster bis höchster Wellenkurs der Liste).
     Gelesen wird der Kurs, der in der Zeile steht („53,36 $“); fehlt er in einer Zeile, entsteht keine Leiter. */
  function leiter(scope) {
    var rows = Array.prototype.slice.call(scope.querySelectorAll(".cb-ew-waves > li")), vals = rows.map(function (li) {
      var m = /·\s(-?[\d.]+,\d{2})\s\$/.exec(li.textContent);
      return m ? parseFloat(m[1].replace(/\./g, "").replace(",", ".")) : NaN;
    });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (rows.length < 2 || vals.some(isNaN) || !(hi > lo) || scope.querySelector(".ew-lad")) return;
    rows.forEach(function (li, i) {
      var bar = make("span", "ew-lad"), dot = make("i");
      bar.setAttribute("aria-hidden", "true"); dot.style.setProperty("--p", ((vals[i] - lo) / (hi - lo) * 100).toFixed(1));
      bar.appendChild(dot); li.appendChild(bar);
    });
  }

  /* Kurs gegen Ungültig-Marke (Prototyp „App-Konzept 2“, Fenster „ablauf“: Balken mit Ungültig-Marke und Schluss; Owner 16.11.2026:
     gemessen gegen den Wochenschluss). Die Zahlen rechnet VUElliottHome.gapOfAnalysis aus der Analyse, die das Aktienbild schon
     geladen hat (VUTechnicalIntelligence.getAnalysis liefert sie aus seinem Speicher, keine zweite Anfrage): Marke der Zeile „Grenze“
     (Hauptlesart) und Schluss der letzten Wochenkerze. Nur mit Zählung (Kachel „Die Lesart in drei Sätzen“); fehlt eine Zahl, kein Balken. */
  function gapCard(g) {
    var sec = make("section", "ew-gap is-" + g.side), bar = make("div", "ew-gap-bar"), fill = make("i", "ew-gap-fill");
    sec.setAttribute("aria-label", "Kurs gegen Ungültig-Marke");
    sec.appendChild(make("p", "vu-ltag ew-gap-k", "Kurs gegen Ungültig-Marke"));
    var h = sec.appendChild(make("p", "ew-gap-h"));
    if (g.beyond) h.appendChild(make("span", "ew-gap-t", g.line));
    else { h.appendChild(make("b", "ew-gap-n num", g.pctText)); h.appendChild(make("span", "ew-gap-t", "Abstand zur Ungültig-Marke (Wochenschluss " + g.dateText + ")")); }
    bar.setAttribute("role", "img"); bar.setAttribute("aria-label", g.aria);
    bar.style.setProperty("--p", (g.pos * 100).toFixed(1));
    bar.appendChild(make("span", "ew-gap-tr")).appendChild(fill);
    bar.appendChild(make("i", "ew-gap-mk")); bar.appendChild(make("i", "ew-gap-dot"));
    sec.appendChild(bar);
    var cols = sec.appendChild(make("div", "ew-gap-cols")), mk = make("div", "ew-gap-c ew-gap-c--mk"), cl = make("div", "ew-gap-c ew-gap-c--cl");
    mk.appendChild(make("span", "", g.markLabel)); mk.appendChild(make("b", "num", g.markText));
    cl.appendChild(make("span", "", g.closeLabel)); cl.appendChild(make("b", "num", g.closeText));
    cols.appendChild(mk); cols.appendChild(cl);
    return sec;
  }
  function abstand(cb, t) {
    var M = global.VUElliottHome, TI = global.VUTechnicalIntelligence, story = cb.querySelector(":scope > .cb-story");
    if (!story || !t || !M || !M.gapOfAnalysis || !TI || !TI.getAnalysis) return;
    TI.getAnalysis(t).then(function (r) {
      var g = r && r.state === "AVAILABLE" ? M.gapOfAnalysis(r.analysis) : null;
      if (g && story.isConnected && !cb.querySelector(".ew-gap")) story.after(gapCard(g));
    }).catch(function () { /* ohne Analyse kein Balken */ });
  }

  function ticker() {
    var M = global.VUElliottHome, t = M && M.parseHash ? M.parseHash(global.location.hash).ticker : null;
    return t || (/^#\/([A-Za-z0-9.-]{1,12})(\?|$)/.exec(global.location.hash) || [])[1] || null;
  }

  function enhance(main) {
    var U = global.VUUI;
    if (!main || main.dataset.ak2 || main.dataset.view !== "elliott" || main.dataset.ready !== "true") return;
    var cb = main.querySelector(":scope > .cb");
    if (!cb || !U || !U.sheet || !U.openSheet || !U.closeSheet) return;
    main.dataset.ak2 = "1"; cb.classList.add("is-ak2");
    var card = cb.querySelector(".cb-chart-card"), ctr = card && card.querySelector(".cb-controls");

    /* Kapitel: Kachel öffnet das Fenster. Die Zeile unter dem Titel („Forschung, nicht zertifiziert“ …) steht dort über dem Inhalt. */
    Array.prototype.forEach.call(cb.querySelectorAll(".cb-eps > details.cb-ep"), function (d) {
      fill(d);
      alsFenster(cb, d, function () { return text(d, ".cb-ep-t b"); }, function () { return text(d, ".cb-ep-t span"); }, ":scope > .cb-ep-body");
    });
    /* Was den Chart steuert, steht beim Chart: Hauptlesart | Alternative (Kapitel 1) und die Zeitreise (Kapitel 3). */
    var lesart = cb.querySelector('.cb-ep-body .cb-seg[aria-label="Lesart im Chart"]');
    if (lesart && ctr) { lesart.classList.add("ew-lesart"); ctr.appendChild(lesart); }
    var zeit = cb.querySelector(".cb-ep-body #zeitreise");
    if (zeit && card) { zeit.classList.add("ew-zeit"); card.after(zeit); }
    balken(cb); leiter(cb); abstand(cb, ticker());

    /* Tipp zum Chart: ein Tipp entfernt hinter „?“ (C09), derselbe Satz. */
    var tip = card && card.querySelector(":scope > p.cb-small.cb-dim");
    if (tip && ctr && U.q && U.bindHelp) { tip.hidden = true; ctr.appendChild(node(U.q(tip.textContent.trim(), "Wellenmarken im Chart"))).classList.add("ew-q"); U.bindHelp(cb); }

    /* Daten & Methodik: Kachel öffnet das Fenster. */
    var dm = cb.querySelector(":scope > details.cb-foot");
    if (dm) alsFenster(cb, dm, function () { return text(dm, "summary > span"); }, function () { return text(dm, "summary > small"); }, ":scope > dl");

    /* Seitenende: „Weiter“-Karte (nur mit Zählung; ohne Zählung stehen die beiden Wege schon als Karten da), dann Rückweg und Frag VU. */
    var end = make("div", "ew-end"), t = ticker(), crumbs = main.querySelector(":scope > .cb-crumbs");
    if (cb.querySelector(".cb-ew-say") && U.next && t) end.appendChild(node(U.next({ title: "Chart-Lage in Technical ansehen", sub: "Trend, Zonen, Befunde", href: "/technical/#/chart/" + encodeURIComponent(t) })));
    if (crumbs) end.appendChild(crumbs);
    /* Prototyp end(): „Daten & Hinweise“ unter der „Weiter“-Karte öffnet das Fenster des Rahmens mit dem Aktien-Hinweis
       (assets/legal-notices.json „stock“); der Elliott-Satz und die Methodik stehen weiter im Fenster „Daten & Methodik“. */
    var N = global.VUNavigation;
    if (N && N.openHinweise && N.hinweis) {
      var lk = make("button", "ew-lk", "Daten & Hinweise");
      lk.type = "button"; lk.setAttribute("aria-haspopup", "dialog");
      lk.addEventListener("click", function () { N.hinweis("stock"); N.openHinweise(); });
      end.appendChild(make("div", "ew-end-l")).appendChild(lk);
    }
    if (end.firstChild) main.appendChild(end);
  }

  function scan() { Array.prototype.forEach.call(doc.querySelectorAll('#el-detail main[data-view="elliott"][data-ready="true"]'), function (m) { try { enhance(m); } catch (e) { if (global.console) console.error("Elliott Aktie", e); } }); }
  global.VUElliottAktie = { enhance: enhance };
  if (global.MutationObserver && doc.body) new global.MutationObserver(function (list) {
    for (var i = 0; i < list.length; i++) if (list[i].target.dataset && list[i].target.dataset.ready === "true") { scan(); return; }
  }).observe(doc.body, { subtree: true, attributes: true, attributeFilter: ["data-ready"] });
  scan();
})(window);
