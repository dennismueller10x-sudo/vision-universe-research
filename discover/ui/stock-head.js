/* =========================================================================
   VISION UNIVERSE — discover/ui/stock-head.js          Aktienseite (VU3)

   Einheitlicher Aktienkopf (assets/stock-navigator.js#head) mit dem
   Navigator der sieben Analysewelten unter Kurs und Chart, und die ruhige
   Seite: Erklaerungen, Wiederholungen und Metadaten hinter "Mehr" bzw. in
   EINEM Block "Daten & Methodik" am Ende. Nichts wird geloescht, nur
   verlegt. Laeuft nach ui/detail.js (Kapitel) aus discover/detail.js.
   Braucht /core/identity.js, /core/stock-context.js, /assets/stock-navigator.js.
   ========================================================================= */
(function (global) {
  "use strict";
  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }
  /** <details class="vu-more"> mit Summary und leerem .vu-more-body (lastChild). */
  function more(label, content) {
    var box = node("details", "vu-more");
    box.appendChild(node("summary", "", label));
    var body = node("div", "vu-more-body");
    box.appendChild(body);
    (content || []).forEach(function (n) { if (n) body.appendChild(n); });
    return box;
  }
  /** Kontext der Aktie fuer Kopf und Navigator (core/stock-context.js): US ueber das Kuerzel, Europa ueber die securityId. */
  function stockContext(SC, detail) {
    try {
      if (detail.region === "EUROPE") {
        try {
          return SC.fromEurope({ securityId: detail.securityId, ticker: detail.symbol, companyId: detail.companyId, isin: detail.isin, name: detail.companyName });
        } catch (e) {
          var hit = SC.parse("/discover/" + global.location.hash);
          return hit ? hit.ctx : SC.fromEurope({ securityId: detail.securityId });
        }
      }
      return SC.fromUs(detail.symbol, { name: detail.companyName });
    } catch (e) { return null; }
  }
  /**
   * Einheitlicher Aktienkopf (assets/stock-navigator.js#head): Logo, Name, Kuerzel und Boerse, Watchlist.
   * Der Kurs bleibt im Discover-Kurschart direkt darunter (live, mit Art und Zeitbezug); der Navigator der
   * sieben Analysewelten steht unmittelbar unter Kurs und Chart.
   */
  function stockHead(page, detail) {
    var N = global.VUStockNavigator, SC = global.VUCore && global.VUCore.StockContext;
    var hero = page.querySelector(".dx-dhero"), chart = page.querySelector(".dx-chapter--chart");
    if (!N || !SC || !hero) return null;
    var ctx = stockContext(SC, detail);
    if (!ctx) return null;
    var title = hero.querySelector(".dx-dhero-title"), img = title && title.querySelector("img");
    var back = page.querySelector(".dx-back"), host = node("div", "dv2-head");
    hero.parentNode.insertBefore(host, hero);
    var head = N.head(host, {
      ctx: ctx, current: "discover", name: detail.companyName || detail.symbol,
      exchange: [detail.exchange, detail.sector].filter(Boolean).join(" · "),
      logo: img && img.getAttribute("src") ? img.getAttribute("src") : false,
      back: back ? { href: back.getAttribute("href"), label: "Aktien entdecken" } : null,
      actions: node("div", "dv2-head-actions")
    });
    if (!head.el) { host.remove(); return null; }
    if (back) back.remove();
    var badges = hero.querySelector(".dx-index-badges"), names = head.el.querySelector(".vu-shead-names");
    if (badges && names) names.appendChild(badges);
    [title, hero.querySelector(".dx-dhero-meta")].forEach(function (n) { if (n) n.remove(); });
    var nav = head.el.querySelector(".vu-shead-nav"), observer = null;
    if (nav && chart) {
      /* Wie in allen Welten: direkt unter Name und Kurs, vor dem Chart. Der Kurs steht live im Chart-Hero;
         der Chart zeichnet Hero und Linie bei jedem Zeitraum neu - der Navigator wird dann wieder hinter
         den Hero gesetzt. Ohne Hero (Kursreihe laedt, keine Reihe) steht er vor dem Kapitel. */
      nav.classList.add("dv2-head-nav");
      var place = function () {
        var price = chart.querySelector(".dx-chart-hero");
        if (price) { if (price.nextSibling !== nav) price.insertAdjacentElement("afterend", nav); }
        else if (!nav.isConnected || nav.parentNode !== chart.parentNode) chart.insertAdjacentElement("beforebegin", nav);
      };
      observer = new MutationObserver(place);
      observer.observe(chart, { childList: true, subtree: true });
      place();
    }
    return { dispose: head.dispose, observer: observer };
  }
  function text(n) { return (n && n.textContent || "").replace(/\s+/g, " ").trim(); }
  /**
   * VU3: weniger sichtbarer Text. Erklaerungen und Wiederholungen hinter "Mehr", Quellen, Datenstaende und
   * Hinweise in EINEN Block "Daten & Methodik" am Ende. Nichts wird geloescht, nur verlegt.
   */
  function calm(page, detail) {
    page.querySelectorAll(".dv2-detail-disclosure").forEach(function (d) { d.classList.add("vu-more"); });
    /* Warum hier: ohne Signal nur eine Erklaerung - hinter Klick. */
    var why = page.querySelector(".dx-why");
    if (why && why.querySelector(".dx-why-empty") && !why.querySelector(".dx-why-lead,.dx-why-grid")) {
      var whyTitle = why.querySelector("h2");
      var whyMore = more(text(whyTitle) || "Warum diese Aktie hier steht");
      if (whyTitle) whyTitle.remove();
      while (why.firstChild) whyMore.lastChild.appendChild(why.firstChild);
      why.appendChild(whyMore);
      why.classList.add("dv2-why-quiet");
    }
    /* Entwicklung: Stufe und Balken sichtbar, die Saetze dazu hinter Klick. */
    var journey = page.querySelector(".dx-chapter--journey");
    if (journey) {
      var extra = [journey.querySelector(".dx-story-list"), journey.querySelector(".dx-pvf")].filter(Boolean);
      if (extra.length) {
        var jm = more("Was die Zahlen zeigen");
        extra[0].parentNode.insertBefore(jm, extra[0]);
        extra.forEach(function (n) { jm.lastChild.appendChild(n); });
      }
      var intro = journey.querySelector(".dv2-detail-intro");
      if (intro) intro.remove();
    }
    /* Bewertung: der lange Einordnungssatz hinter Klick, die Frage bleibt. */
    var satz = page.querySelector(".dv2-stock-valuation .dx-bewertung-satz");
    if (satz && text(satz).split(" ").length > 22) {
      var sm = more("Einordnung lesen");
      satz.parentNode.insertBefore(sm, satz);
      sm.lastChild.appendChild(satz);
    }
    /* Weiter entdecken: die erste Vergleichsreihe sichtbar, die weiteren hinter Klick. */
    var next = page.querySelector(".dv2-stock-next");
    if (next) {
      var heads = Array.prototype.slice.call(next.querySelectorAll(":scope > .dx-rail-head"));
      /* Weitere Reihen (auch "Aehnliches Kursverhalten" aus "Auch enthalten in") gesammelt hinter Klick. */
      var moved = [];
      page.querySelectorAll(".dv2-stock-neighbors:not(.dv2-stock-next) > .dx-rail-head").forEach(function (h) {
        moved.push(h);
        if (h.nextElementSibling && h.nextElementSibling.classList.contains("dx-rail-wrap")) moved.push(h.nextElementSibling);
      });
      var count = heads.length - 1 + moved.filter(function (m) { return m.classList.contains("dx-rail-head"); }).length;
      if (heads.length && count > 0) {
        var rest = more("Weitere Vergleiche (" + count + ")");
        var anchor = heads[1] || next.querySelector(":scope > .dx-cta");
        next.insertBefore(rest, anchor || null);
        var n = rest.nextSibling;
        while (n && !(n.classList && n.classList.contains("dx-cta"))) {
          var after = n.nextSibling;
          rest.lastChild.appendChild(n);
          n = after;
        }
        moved.forEach(function (m) { rest.lastChild.appendChild(m); });
      }
    }
    /* Daten & Methodik: Stand, Quellen, Kapitelhinweise, Logo-Herkunft - einmal, am Ende. */
    var foot = page.querySelector(".dx-foot");
    var dm = node("details", "vu-dm dv2-dm"), sum = node("summary", "", "Daten & Methodik ");
    if (detail.asOf) sum.appendChild(node("small", "", "Stand " + String(detail.asOf).slice(8, 10) + "." + String(detail.asOf).slice(5, 7) + "."));
    dm.appendChild(sum);
    var dl = node("dl");
    function row(label, content) {
      if (!content) return;
      dl.appendChild(node("dt", "", label));
      var dd = node("dd");
      if (typeof content === "string") dd.textContent = content; else dd.appendChild(content);
      dl.appendChild(dd);
    }
    var links = foot && foot.querySelector(".dx-foot-links");
    if (links) row("Stand und Quellen", links);
    if (detail.universeLabel) row("Universum", detail.universeLabel);
    var seen = {};
    page.querySelectorAll(".dx-kapitel-fuss").forEach(function (p) {
      if (p.closest(".dx-analyse")) return;
      var t = text(p);
      if (!t || seen[t]) { if (t) p.remove(); return; }
      seen[t] = 1;
      var c = p.closest(".dx-chapter"), k = c && c.className || "";
      row(/journey/.test(k) ? "Entwicklung" : /zahlen/.test(k) ? "Kennzahlen" : /bewertung/.test(k) ? "Bewertung" :
        /risks/.test(k) ? "Chancen und Risiken" : /business/.test(k) ? "Unternehmen" : "Hinweis", p);
    });
    var lead = page.querySelector(".dx-chapter--zahlen > .dx-chapter-lead");
    if (lead) row("Kennzahlen", lead);
    var credit = foot && foot.querySelector(".dx-logo-credit");
    if (credit) row("Logo", credit);
    dm.appendChild(dl);
    if (foot) {
      /* Der Hinweis "keine Anlageempfehlung" steht im Seitenfuss (app.js) und in Daten & Methodik. */
      foot.replaceChildren(dm);
      foot.classList.add("dv2-foot");
    } else page.appendChild(dm);
  }
  (global.VUDiscover = global.VUDiscover || {}).StockHead = { head: stockHead, calm: calm, more: more, context: stockContext };
})(window);
