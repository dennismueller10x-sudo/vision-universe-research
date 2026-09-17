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
  /* V4 §19: die Index-Reihe nennt ihre Herkunft in der Unterzeile. */
  function subtitleOf(surface) {
    var ix = surface.index;
    if (!ix || !ix.asOf) return surface.subtitle;
    var quelle = ix.proxy && ix.proxy.etf ? "Bestand " + ix.proxy.etf : "Liste des Indexeigentümers";
    return (surface.subtitle ? surface.subtitle + " " : "") + "Mitglieder laut " + quelle + ", Stand " + C().dateShort(ix.asOf) + ".";
  }
  function rowPayload(surface, ctx) {
    return {
      rowId: surface.rowId, title: surface.title, subtitle: subtitleOf(surface),
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
      case "story": return story(surface, ctx);
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
    /* Die Signature-Rangliste traegt den Titel der Methodik; jede weitere
       Rangliste (z. B. TOP 10 CASHFLOW-MASCHINEN) den ihrer Flaeche. */
    var konfig = (surface.id === "top-10" && ctx.meta && ctx.meta.topTen) || {};
    var payload = Object.assign(rowPayload(surface, ctx), {
      rowId: surface.id === "top-10" ? "top-10" : surface.rowId, title: konfig.title || surface.title,
      subtitle: konfig.subtitle || subtitleOf(surface)
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
    var ps = card.priceSeries || {};
    var echt = ps.status === "CALCULATED" && !!ps.source;
    var kunst = C().lazyArtwork(card, { width: 640, height: 260, ticker: true, scale: "hero",
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
          ? "Echter Kursverlauf, Tagesschlusskurse, split-bereinigt — Stand " + C().dateShort(ps.asOf)
          : "Rendite über 1, 3, 6 und 12 Monate als Balken — kein Kursverlauf. Für diesen Titel " +
            "liegt noch keine Kursreihe vor." })
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

  /* ------------------------------------------- Die Entwicklung (Story) */
  /**
   * EIN Unternehmen, dessen Zahlen eine Geschichte erzaehlen: die Karte,
   * die belegten Saetze der Fundamental Story und DAMALS VS. HEUTE in vier
   * Zeilen. Alles aus dem Build (fundamentals.js); hier wird gezeichnet.
   */
  function fmtGeld(v, unit) {
    if (!isNum(v)) return "–";
    if (unit === "USD/shares") return (Math.round(v * 100) / 100).toFixed(2).replace(".", ",") + " $";
    if (unit === "shares") return Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(2).replace(".", ",") + " Mrd." : (v / 1e6).toFixed(0) + " Mio.";
    var a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(1).replace(".", ",") + " Mrd. $";
    if (a >= 1e6) return (v / 1e6).toFixed(0) + " Mio. $";
    return Math.round(v).toLocaleString("de-DE") + " $";
  }
  function fmtWert(row, seite) {
    var v = row[seite].value;
    if (row.kind === "margin") return isNum(v) ? (v * 100).toFixed(1).replace(".", ",") + " %" : "–";
    return fmtGeld(v, row.unit);
  }
  function fmtAenderung(row) {
    var c = row.change || {};
    if (row.kind === "margin") return isNum(c.pp) ? ((c.pp >= 0 ? "+" : "") + c.pp.toFixed(1).replace(".", ",") + " Pp.") : "–";
    if (isNum(c.pct)) return (c.pct >= 0 ? "+" : "") + Math.round(c.pct * 100) + " %";
    if (isNum(c.abs)) return (c.abs >= 0 ? "+" : "") + fmtGeld(c.abs, row.unit);
    return "–";
  }
  function story(surface, ctx) {
    var card = (surface.cards || [])[0];
    if (!card || !surface.story) return null;
    var section = el("section", { class: "dx-story-surface dx-fade", "data-world": "fundamentals" });
    section.appendChild(el("div", { class: "dx-story-bg", "aria-hidden": "true" }));
    var name = card.companyName || card.symbol;
    var h = surface.story.horizon;
    var jahre = h ? (h.from + " → " + h.to) : "";
    var saetze = el("ul", { class: "dx-story-list" }, (surface.story.statements || []).map(function (s) {
      return el("li", {}, [el("i", { class: "dx-story-dot", "aria-hidden": "true" }), document.createTextNode(s.text)]);
    }));
    var tabelle = null;
    if (surface.compare && surface.compare.rows && surface.compare.rows.length) {
      tabelle = el("table", { class: "dx-damals" }, [
        el("thead", {}, [el("tr", {}, [
          el("th", { text: "" }), el("th", { text: "Vor " + surface.compare.horizon.years + " Jahren" }), el("th", { text: "Heute" }), el("th", { text: "Veränderung" })
        ])]),
        el("tbody", {}, surface.compare.rows.map(function (r) {
          var ton = r.kind === "margin" ? (r.change.pp > 0 ? "up" : r.change.pp < 0 ? "down" : "") : (isNum(r.change.pct) ? (r.change.pct > 0 ? "up" : r.change.pct < 0 ? "down" : "") : "");
          return el("tr", {}, [
            el("th", { scope: "row", text: r.label }),
            el("td", { class: "num", text: fmtWert(r, "then") }),
            el("td", { class: "num", text: fmtWert(r, "now") }),
            el("td", { class: "num " + ton, text: fmtAenderung(r) })
          ]);
        }))
      ]);
    }
    var link = el("a", { class: "dx-story-card", href: surface.href || "#/s/" + ctx.universeId + "/" + card.symbol,
                         "data-symbol": card.symbol, "aria-label": name + " — die Entwicklung ansehen" }, [
      el("div", { class: "dx-story-copy" }, [
        el("p", { class: "dx-kicker", text: surface.kicker || "Die Entwicklung" }),
        el("h2", { class: "dx-story-name", text: name }),
        el("p", { class: "dx-story-sub", text: card.symbol + (card.sector ? " · " + card.sector : "") + (jahre ? " · Geschäftsjahre " + jahre : "") }),
        saetze,
        el("span", { class: "dx-btn dx-story-cta" }, [document.createTextNode(name + " verstehen"), document.createTextNode(" →")])
      ]),
      el("div", { class: "dx-story-media" }, [
        tabelle,
        el("p", { class: "dx-story-caption", text: "Aus den Jahresabschlüssen bei der SEC (Geschäftsjahre" + (jahre ? " " + jahre : "") +
          "), Stand " + (surface.story.asOf || "") + ". Jeder Satz ist rechnerisch belegt; die Aktienseite zeigt die Belege." })
      ])
    ]);
    link.addEventListener("click", function () {
      if (D.Analytics) D.Analytics.track("card_open", { universeId: ctx.universeId, rowId: surface.rowId, symbol: card.symbol, position: 1 });
    });
    section.appendChild(link);
    return markieren(section, surface);
  }

  /* ------------------------------------ Weil du ... angesehen hast */
  /**
   * Die einzige Personalisierung, die es heute ehrlich gibt: das Geraet
   * erinnert sich, was man zuletzt geoeffnet hat, und die Aktienseite
   * dieses Titels traegt seine Nachbarn (discoverNext, im Build gerechnet).
   * Kein Konto, keine Uebertragung, keine Behauptung ueber Vorlieben.
   */
  function becauseYouViewed(memory, ctx) {
    var eintraege = memory ? memory.recent(ctx.universeId) : [];
    var letzter = eintraege && eintraege[0];
    if (!letzter) return null;
    var section = el("section", { class: "dx-rail-section dx-fade dx-because", "data-surface": "because",
                                  "data-surface-type": "because", "data-world": letzter.world || null });
    section.appendChild(C().railHead("WEIL DU " + (letzter.companyName || letzter.symbol).toUpperCase() + " ANGESEHEN HAST",
      "Ähnliche Aktien nach Kursverhalten, Wachstum, Marge und Bewertung — vom Gerät gemerkt, nirgends übertragen.", {}));
    var track = el("div", { class: "dx-rail", role: "list", "aria-label": "Ähnlich wie " + letzter.symbol });
    section.appendChild(C().withRailNav(track, { label: "because", universeId: ctx.universeId }));
    S.loadJSON("/discover/data/stocks/" + letzter.universeId + "/" + letzter.symbol + ".json").then(function (detail) {
      var karten = (detail.discoverNext && detail.discoverNext.similar && detail.discoverNext.similar.cards) || detail.similar || [];
      if (!karten.length) { section.remove(); return; }
      karten.slice(0, 10).forEach(function (card, i) {
        var item = C().poster(card, { rowId: "because", universeId: ctx.universeId, variant: "compact", position: i + 1 });
        item.setAttribute("role", "listitem");
        track.appendChild(item);
      });
    }).catch(function () { section.remove(); });
    return section;
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
  global.VUDiscover.Surfaces = { render: render, recent: recent, becauseYouViewed: becauseYouViewed,
                                 ranking: ranking, row: row, theme: theme, featured: featured,
                                 sectors: sectors, immersive: immersive, story: story };
})(window);
