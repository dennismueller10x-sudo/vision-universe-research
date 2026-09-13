/* =========================================================================
   VISION UNIVERSE DISCOVER — ui/surfaces.js

   SECHS ARTEN, EINE FLÄCHE ZU FÜLLEN

   Die Startseite war eine Folge von Reihen, die alle gleich aussahen:
   Überschrift, Karten, Chart, Prozent - und dann dasselbe noch einmal.
   Das ergibt keine Welt, sondern eine Tabelle mit Bildern. Hier stehen
   die Bausteine, aus denen die Startseite jetzt gebaut wird:

     ranking        die nummerierte Rangliste (grosse Ziffern)
     row            die Reihe - breit, normal oder kompakt
     theme          die Themenwelt: Kicker, Lead, Hinweis auf die
                    redaktionelle Zuordnung, dann die Reihe
     featured-card  EINE Aktie über fast die ganze Breite
     sectors        Sektorkacheln
     immersive      der Einstieg in "Einzeln entdecken"
     recent         "Zuletzt angesehen" - aus dem Gedächtnis des Geräts

   Was hier NICHT entschieden wird: welche Karten in einer Surface
   stehen. Das hat der Build entschieden (buildHome), nachvollziehbar und
   nachgerechnet. Dieses Modul zeichnet.
   ========================================================================= */
(function (global) {
  "use strict";

  var S = global.QuantShell;
  var el = S.el;
  var D = global.VUDiscover;
  function C() { return D.Cards; }
  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }

  /** Aus einer Surface die Zeilenform, die Cards.rail kennt. */
  function rowPayload(surface, ctx) {
    return {
      rowId: surface.rowId, title: surface.title, subtitle: surface.subtitle,
      world: surface.world, universeId: ctx.universeId, universeLabel: ctx.universeLabel,
      asOf: ctx.asOf,
      coverage: isNum(surface.total)
        ? { matched: surface.total, universeSize: ctx.universeSize, returned: surface.cards.length }
        : null,
      cards: surface.cards || []
    };
  }

  function render(surface, ctx) {
    switch (surface.type) {
      case "ranking": return ranking(surface, ctx);
      case "row": return row(surface, ctx);
      case "theme": return theme(surface, ctx);
      case "featured-card": return featured(surface, ctx);
      case "sectors": return sectors(surface, ctx);
      case "immersive": return immersive(surface, ctx);
      default: return null;
    }
  }

  function markieren(section, surface) {
    if (!section) return section;
    section.setAttribute("data-surface", surface.id || surface.type);
    section.setAttribute("data-surface-type", surface.type);
    if (surface.rowId) section.setAttribute("data-row", surface.rowId);
    return section;
  }

  /* ---------------------------------------------------------- Rangliste */
  function ranking(surface, ctx) {
    var konfig = (ctx.meta && ctx.meta.topTen) || {};
    var payload = Object.assign(rowPayload(surface, ctx), {
      rowId: "top-10", title: konfig.title || surface.title,
      subtitle: konfig.subtitle || surface.subtitle
    });
    var section = C().rail(payload, { variant: "rank", universeId: ctx.universeId,
                                      limit: surface.cards.length, label: surface.rowId });
    var mehr = section.querySelector(".dx-more");
    if (mehr) mehr.setAttribute("href", surface.href || "#/c/" + ctx.universeId + "/" + surface.rowId);
    return markieren(section, surface);
  }

  /* --------------------------------------------------------------- Reihe */
  function row(surface, ctx) {
    var section = C().rail(rowPayload(surface, ctx), {
      variant: surface.variant || "poster", universeId: ctx.universeId,
      limit: surface.cards.length, label: surface.rowId
    });
    if (surface.href) {
      var mehr = section.querySelector(".dx-more");
      if (mehr) mehr.setAttribute("href", surface.href);
    }
    return markieren(section, surface);
  }

  /* ---------------------------------------------------------- Themenwelt */
  function theme(surface, ctx) {
    var section = el("section", { class: "dx-theme dx-fade", "data-world": surface.world || "sectors" });
    section.appendChild(el("div", { class: "dx-theme-bg", "aria-hidden": "true" }));
    section.appendChild(el("div", { class: "dx-theme-head" }, [
      el("p", { class: "dx-kicker", text: "Themenwelt" }),
      el("h2", { text: surface.title }),
      surface.subtitle ? el("p", { class: "dx-theme-lead", text: surface.subtitle }) : null,
      el("p", { class: "dx-theme-note" }, [
        el("b", { text: "Redaktionelle Zuordnung" }),
        document.createTextNode(" · " + (isNum(surface.total) ? surface.total : surface.cards.length) +
          " Unternehmen des Themas im Universum. Die Zahlen auf den Karten sind gerechnet, die " +
          "Zugehörigkeit ist eine Einordnung.")
      ]),
      surface.href ? el("a", { class: "dx-more", href: surface.href }, [
        document.createTextNode("Thema öffnen"), document.createTextNode(" →")
      ]) : null
    ]));
    var track = el("div", { class: "dx-rail", role: "list", "aria-label": surface.title });
    (surface.cards || []).forEach(function (card, i) {
      var item = C().poster(card, { rowId: surface.rowId, universeId: ctx.universeId,
                                    variant: "poster", world: surface.world, position: i + 1 });
      item.setAttribute("role", "listitem");
      track.appendChild(item);
    });
    section.appendChild(C().withRailNav(track, { label: surface.rowId, universeId: ctx.universeId }));
    return markieren(section, surface);
  }

  /* -------------------------------------------------------- Grosse Karte */
  function featured(surface, ctx) {
    var card = (surface.cards || [])[0];
    if (!card) return null;
    var text = C().klartext(card, surface.rowId) || {};
    var section = el("section", { class: "dx-featured dx-fade", "data-world": surface.world || card.world || null });
    section.appendChild(el("div", { class: "dx-featured-bg", "aria-hidden": "true" }));
    var MC = D.MicroChart;
    var echt = MC && MC.hasSeries(card.priceSeries);
    var kunst = D.Artwork.stockArtwork(card, { width: 640, height: 260, ticker: true, scale: "hero",
                                                range: surface.microRange || "6M" });
    var link = el("a", { class: "dx-featured-card", href: surface.href || "#/s/" + ctx.universeId + "/" + card.symbol,
                         "data-symbol": card.symbol,
                         "aria-label": (card.companyName || card.symbol) + " ansehen" }, [
      el("div", { class: "dx-featured-copy" }, [
        el("p", { class: "dx-kicker", text: surface.kicker || "Im Blick" }),
        el("h2", { class: "dx-featured-name", text: card.companyName || card.symbol }),
        card.was ? el("p", { class: "dx-was-line", text: card.was }) : null,
        text.story ? el("p", { class: "dx-featured-story" }, [
          el("i", { class: "dx-story-dot", "aria-hidden": "true" }),
          document.createTextNode(text.story)
        ]) : null,
        text.zahl ? el("div", { class: "dx-featured-zahl" }, [
          el("b", { class: "num " + (text.zahl.ton || ""), text: text.zahl.wert }),
          el("span", { text: text.zahl.label })
        ]) : null,
        text.zusatz ? el("p", { class: "dx-zusatz", text: text.zusatz }) : null,
        el("span", { class: "dx-btn dx-featured-cta" }, [
          document.createTextNode((card.companyName || card.symbol) + " ansehen"),
          document.createTextNode(" →")
        ])
      ]),
      el("div", { class: "dx-featured-media" }, [
        kunst,
        el("p", { class: "dx-featured-caption", text: echt
          ? "Echter Kursverlauf, Tagesschlusskurse — Quelle " + card.priceSeries.source +
            ", Stand " + (card.priceSeries.asOf || "")
          : "Rendite über 1, 3, 6 und 12 Monate als Balken — kein Kursverlauf. Absolute Kurse " +
            "bleiben zurück." })
      ])
    ]);
    link.addEventListener("click", function () {
      if (D.Analytics) D.Analytics.track("card_open", { universeId: ctx.universeId, rowId: surface.rowId,
                                                       symbol: card.symbol, position: 1 });
    });
    section.appendChild(link);
    return markieren(section, surface);
  }

  /* ------------------------------------------------------------ Sektoren */
  function sectors(surface, ctx) {
    var section = el("section", { class: "dx-rail-section dx-fade", "data-world": "sectors" });
    var liste = surface.sectors || [];
    section.appendChild(C().railHead(surface.title || "DIE STÄRKSTEN JE BRANCHE",
      surface.subtitle || "Die stärksten Titel je Sektor.", {
        count: liste.length + " Sektoren",
        href: surface.href || "#/c/" + ctx.universeId + "/sector-leaders", moreLabel: "Alle Sektoren"
      }));
    if (!liste.length) {
      section.appendChild(C().emptyState("Keine kuratierte Sektorzuordnung",
        "Für dieses Universum liegt keine kuratierte Sektorzuordnung vor. Ein Sektorrang aus " +
        "einer unbelegten Zuordnung wäre ein Rang über eine Vermutung."));
      return markieren(section, surface);
    }
    var track = el("div", { class: "dx-rail", role: "list", "aria-label": "Sektoren" });
    var welten = ctx.sectorWorlds || {};
    liste.forEach(function (sector) {
      var tile = C().sectorTile(sector, { universeId: ctx.universeId, world: welten[sector.sector] || "sectors" });
      tile.setAttribute("role", "listitem");
      track.appendChild(tile);
    });
    section.appendChild(C().withRailNav(track, { label: "sector-leaders", universeId: ctx.universeId }));
    if (isNum(surface.withoutSector) && surface.withoutSector > 0) {
      section.appendChild(el("p", { class: "dx-inline-note" }, [
        el("b", { text: "Sektorabdeckung · " }),
        document.createTextNode(surface.withoutSector + " Titel dieses Universums tragen keine " +
          "kuratierte Sektorzuordnung und erscheinen deshalb in keiner Sektorreihe.")
      ]));
    }
    return markieren(section, surface);
  }

  /* --------------------------------------------------- Einzeln entdecken */
  function immersive(surface, ctx) {
    var section = el("section", { class: "dx-immersive dx-fade" }, [
      el("div", { class: "dx-immersive-bg", "aria-hidden": "true" }),
      el("div", { class: "dx-immersive-inner" }, [
        el("p", { class: "dx-kicker", text: "Einzeln entdecken" }),
        el("h2", { text: surface.title || "Noch nichts gefunden?" }),
        el("p", { class: "dx-immersive-lead", text: surface.lead ||
          "Entdecke Aktien eine nach der anderen — eine pro Bildschirm, endlich viele." }),
        el("div", { class: "dx-cta" }, [
          el("a", { class: "dx-btn", href: surface.href || "#/einzeln/" + ctx.universeId }, [
            document.createTextNode("Entdecken"), document.createTextNode(" →")
          ])
        ])
      ])
    ]);
    return markieren(section, surface);
  }

  /* ---------------------------------------------------- Zuletzt angesehen */
  /**
   * Aus dem Gedächtnis des Geräts (engines/memory.js). Keine Karte, nur
   * Verweise: was man gesehen hat, weiss man - hier steht der Weg zurück.
   */
  function recent(memory, ctx) {
    var eintraege = memory ? memory.recent(ctx.universeId) : [];
    if (!eintraege.length) return null;
    var section = el("section", { class: "dx-recent dx-fade", "data-surface": "recent",
                                  "data-surface-type": "recent" });
    section.appendChild(el("div", { class: "dx-rail-head" }, [
      el("h2", { text: "ZULETZT ANGESEHEN" }),
      el("p", { text: "Bleibt auf diesem Gerät. Kein Konto, keine Übertragung." }),
      el("button", { class: "dx-recent-clear", type: "button", text: "Verlauf löschen",
                     onclick: function () { memory.clear(); section.remove(); } })
    ]));
    var track = el("div", { class: "dx-recent-track", role: "list" });
    eintraege.forEach(function (e) {
      track.appendChild(el("a", { class: "dx-recent-chip", role: "listitem",
                                  href: "#/s/" + e.universeId + "/" + e.symbol,
                                  "data-world": e.world || null }, [
        el("i", { "aria-hidden": "true" }),
        el("b", { text: e.companyName || e.symbol }),
        el("span", { text: e.symbol })
      ]));
    });
    section.appendChild(track);
    return section;
  }

  global.VUDiscover = global.VUDiscover || {};
  global.VUDiscover.Surfaces = { render: render, recent: recent, ranking: ranking, row: row,
                                 theme: theme, featured: featured, sectors: sectors,
                                 immersive: immersive };
})(window);
