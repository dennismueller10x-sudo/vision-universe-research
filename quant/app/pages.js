/* =========================================================================
   VISION UNIVERSE QUANT — app/pages.js
   Home · Quant Screener · Strategien · Aktien

   Jede Seite startet bei einer Frage des Nutzers, nicht bei einer Engine.
   Zahlen erscheinen nur mit Bedeutung und Stichtag; wo nichts belegt ist,
   steht nichts - oder ein Satz, warum.
   ========================================================================= */
(function (global) {
  "use strict";
  var X = global.QX, el = X.el, VM = global.VUQuantViewModel;
  var FIELD = function (id) { return "quantV2.factorEvidence." + id; };

  /* Die vier Einstiege als Discovers farbige Tueren (v2-world-door). */
  /* Die Wege als helle Kacheln (Quick Access der Tafeln). */
  function doors(items) {
    return el("div", { class: "q-tiles qx-doors" }, items.map(function (d) {
      var t = X.tile({ icon: d.icon, title: d.title, text: d.text, href: d.href });
      t.classList.add("qx-door"); t.dataset.kicker = d.kicker;
      return t;
    }));
  }
  /* Die Szenario-Engine beschreibt ihre Bestaetigung in Fachsprache ("Entry
     Zone", "Higher High"). Die Karte uebersetzt genau diese zwei festen Saetze;
     jeder andere Text bleibt, wie er ist. */
  var PLAIN_TRIGGER = {
    "Kurs haelt die Entry Zone bzw. das letzte Strukturtief und erzeugt ein neues Higher High.": "der Kurs über der Zone laut Methode bzw. dem letzten Tief bleibt und ein neues Hoch bildet.",
    "Kurs scheitert an der Entry Zone bzw. dem letzten Strukturhoch und erzeugt ein neues Lower Low.": "der Kurs an der Zone laut Methode bzw. dem letzten Hoch scheitert und ein neues Tief bildet."
  };
  function plainTrigger(t) { return PLAIN_TRIGGER[t] || t; }
  function nameOf(ctx, t) { var s = ctx.names && ctx.names[t]; return s || ""; }
  /* PRODUKTPOSITIONIERUNG (Owner-Auftrag 04.10.2026, docs/VU_QUANT_PRODUCT_POSITIONING.md).
     Ein Satz, vier Versprechen - jedes durch eine Funktion eingeloest, die
     live ist. Quant verkauft keine Note, sondern eine nachvollziehbare Situation. */
  var CLAIM = "Quant zeigt dir jeden Tag, bei welchen Aktien sich etwas verändert – und wie oft das früher besser lief als der Markt.";
  var CLAIM_LEAD = "Quant beobachtet über 6.000 US-Aktien nach festen Regeln, erklärt jede Veränderung mit Auslöser und nächster Bedingung – und sagt offen, wie belastbar der historische Vergleich ist.";
  var HERO_TITLE = "Jeden Tag sehen, was sich verändert.";
  var PROMISES = [
    { id: "neu", title: "Sehen, was heute neu ist", text: "Neue Setups, neue Jahreshochs, Strategie-Wechsel und steigende Risiken – täglich, mit Datum.", route: function () { return X.routes.radar(); } },
    { id: "warum", title: "Verstehen, warum es zählt", text: "Auslöser, Ungültig-Marke und die nächste Bedingung – erst die Bedeutung, dann die Zahlen.", route: function () { return X.routes.stocks(); } },
    { id: "frueher", title: "Prüfen, ob es früher ein Vorteil war", text: "Wie oft ähnliche Fälle höher lagen – immer neben der Quote des ganzen Markts.", route: function () { return X.routes.backtest(); } },
    { id: "belastbar", title: "Wissen, wie belastbar das ist", text: "Beobachtet, getestet oder zertifiziert – und was geprüft ist und was noch fehlt.", route: function () { return X.routes.method(); } }
  ];
  /* Was Quant fuer eine beobachtete Aktie verfolgt - der Nutzen von "Beobachten". */
  var WATCH_VALUE = ["Setup-Wechsel (entsteht, bestätigt, nicht mehr erfüllt)", "neue historische Evidenz zu einem Regelereignis", "Wechsel in oder aus einer Strategie", "steigende Risiken", "neue Regelereignisse wie ein 52-Wochen-Hoch"];
  function promiseList() {
    return el("ol", { class: "q-promises", "aria-label": "Was Quant für dich tut" }, PROMISES.map(function (p, i) {
      return el("li", {}, [el("a", { href: p.route(), dataset: { promise: p.id } }, [el("span", { class: "q-promise-n", "aria-hidden": "true", text: String(i + 1) }),
        el("span", {}, [el("strong", { text: p.title }), el("small", { text: p.text })])])]);
    }));
  }
  /* Beweis statt Behauptung: ein echtes, getestetes Signal aus dem aktuellen
     Radar - Quote, Markt, Differenz, Vertrauen. Kein Text-Beispiel. */
  function proofCard(radarState) {
    var E = global.QXEvidence, T = global.VUQuantRadar ? global.VUQuantRadar.TYPE : {};
    if (!E || !radarState || !radarState.cards) return null;
    var ev = null;
    radarState.cards.some(function (c) { return (c.events || []).some(function (e) { if (e.backtest && e.backtest.state === "AVAILABLE" && Array.isArray(e.backtest.deltaCi)) { ev = e; return true; } return false; }); });
    if (!ev) return null;
    var label = (T[ev.eventType] || {}).label || ev.eventType;
    return el("div", { class: "q-proof" }, [
      el("p", { class: "q-proof-claim" }, [el("b", { text: "Nicht „stark“, sondern gemessen." }), el("span", { text: " So sieht ein Beleg bei Quant aus – live aus dem heutigen Radar:" })]),
      E.signalEvidence(ev.backtest, { compact: true, label: "„" + label + "“ marktweit" }),
      el("p", { class: "qx-small", text: "Gezeigt wird immer, wie oft das Regelereignis früher höher lag, neben der Quote des ganzen Markts in denselben Wochen. Liegt der Unterschied im Rauschen, steht dort „kein messbarer Vorteil“." })]);
  }
  /* Eine Aktienkarte mit eigener Aussage: die staerkste gemessene
     Eigenschaft als Wert ("Kursstärke 92"), die Quant-Einordnung als Satz -
     aus den veroeffentlichten Faktorwerten. Beschriftet wird der Wert mit
     der Eigenschaft, die er misst; eine Gesamtnote gibt es nicht. */
  function quantPoster(ctx, t, rowBy, opts) {
    opts = opts || {};
    var v = rowBy && rowBy[t] ? VM.fromScreeningRow(rowBy[t], rowBy._dist) : null;
    /* Die staerkste Eigenschaft nach POSITION: Faktorwerte verschiedener
       Eigenschaften sind nicht gleich verteilt und nicht direkt vergleichbar. */
    var best = v ? v.factors.filter(function (f) { return f.state === "AVAILABLE"; }).sort(function (a, b) { return (b.position == null ? -1 : b.position) - (a.position == null ? -1 : a.position) || b.score - a.score; })[0] : null;
    return X.poster({ ticker: t, name: nameOf(ctx, t),
      big: best ? String(Math.round(best.score)) : null, bigLabel: best ? best.name : null, tone: best ? best.tone : null,
      story: opts.story || (v && v.overall.id !== "KEINE_DATEN" ? v.overall.count : null), foot: opts.foot, initialOnly: !!opts.initialOnly });
  }
  function screeningRows(ctx) {
    return ctx.api.getFactorEvidenceScreening().then(function (sc) {
      var by = {}; if (sc && sc.state === "AVAILABLE") sc.rows.forEach(function (r) { by[r.ticker] = r; });
      Object.defineProperty(by, "_dist", { value: sc && sc.state === "AVAILABLE" ? VM.sortedDistribution(sc.rows) : null, enumerable: false });
      return by;
    }).catch(function () { return {}; });
  }
  var REGIME = { BROAD_WEAKNESS: "Breite Schwäche", BROAD_STRENGTH: "Breite Stärke", NARROW_LEADERSHIP: "Schmale Führung", MIXED: "Gemischte Lage" };
  /* Bildwelt der Anlagestile: dieselben Fotografien wie Discovers Perspektiven, je nach Sinn zugeordnet. Steht hier, wo
     sie gebraucht wird (Strategien) - die Aktienseite liegt im Release in einem eigenen Paket (QUANT_PACKS). */
  var STRATEGY_ART = {
    "quality-compounder": "langfristige-compounder", "momentum-leader": "momentum-leader", "quality-momentum": "stabile-aufwaertstrends",
    "garp": "qualitaet-zum-preis", "future-leader": "umsatz-waechst-stark", "defensive-quality": "starke-bilanz-wachstum",
    "value-momentum": "comeback", "earnings-revision-leader": "gewinne-beschleunigen"
  };
  function strategyArt(id) {
    var key = STRATEGY_ART[id] || STRATEGY_ART[String(id || "").toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "")];
    return key ? "/assets/discover-perspektiven/" + key + ".jpeg" : null;
  }

  /* ================================================================ HOME
     Nach den Tafeln "Quant Home & Einstieg" und "Neuer Aufbau": Hero mit
     Weltkugel und Suche, Chips, Quick Access, Heute interessant, dann die
     Wege Backtesting und Historische Faelle, zuletzt der Aufbau in vier
     Schritten. */
  /* ============================================================ RADAR
     Eine Radar-Karte beantwortet: welche Aktie, was ist neu, warum
     relevant, seit wann, was ist der naechste Trigger, welche historische
     Evidenz gibt es. Alles aus radar-v1 (quant-radar-1.1.0); fehlt ein
     Teil, steht er nicht da - es wird nichts aufgefuellt. */
  var RadarC = global.VUQuantRadar;
  function U() { return global.VUUI; }
  function frag(html) { var t = document.createElement("template"); t.innerHTML = html; return t.content; }
  function usd(n) { return typeof n === "number" && isFinite(n) ? n.toLocaleString("de-DE", { maximumFractionDigits: 2 }) + " $" : null; }
  function zoneText(z) { return Array.isArray(z) && z.length === 2 ? (z[0] === z[1] ? usd(z[0]) : z[0].toLocaleString("de-DE", { maximumFractionDigits: 2 }) + "–" + usd(z[1])) : null; }
  function lifecycleLabel(id) { var l = RadarC ? RadarC.LIFECYCLE.filter(function (x) { return x.id === id; })[0] : null; return l ? l.label : id; }
  function radarCard(ctx, c, opts) {
    opts = opts || {};
    var T = RadarC ? RadarC.TYPE : {};
    var first = c.events[0], t0 = T[first.eventType] || {};
    var rows = [];
    var tr = c.trade && c.trade.state === "AVAILABLE" ? c.trade : null;
    if (tr && zoneText(tr.entry)) rows.push(["Zone laut Methode", zoneText(tr.entry)]);
    var inv = tr && typeof tr.invalidation === "number" ? tr.invalidation : c.setup && typeof c.setup.invalidation === "number" ? c.setup.invalidation : null;
    if (inv !== null && c.setup && c.setup.state !== "NO_SETUP") rows.push(["Ungültig laut Methode", usd(inv)]);
    var ev = c.replay && c.replay.sufficient
      ? Math.round(c.replay.positiveShare * 100) + " % der " + c.replay.completed + " ähnlichen Fälle lagen nach 6 Monaten höher (Median " + VM.pct(c.replay.medianReturn, 1, true) + ")"
      : c.replay && c.replay.state === "AVAILABLE" ? "zu wenige ähnliche Fälle (" + c.replay.episodes + ")" : null;
    var E = global.QXEvidence;
    var tested = c.events.filter(function (e) { return e.backtest && e.backtest.state === "AVAILABLE"; })[0];
    var testedNode = tested && E ? E.signalEvidence(tested.backtest, { compact: true, label: "„" + ((T[tested.eventType] || {}).label || tested.eventType) + "“ marktweit" }) : null;
    var withheld = !tested ? c.events.filter(function (e) { return e.backtest && e.backtest.state !== "AVAILABLE"; })[0] : null;
    var tone = first.direction || t0.tone || "info";
    var hit = E && E.alertMatch ? c.events.map(function (e) { return E.alertMatch(c.ticker, e); }).filter(Boolean)[0] : null;
    /* Visual First (VU3): Kopf -> Kennzahlen -> Belege als Chips -> Details auf Tipp.
       Die Chips zeigen nur Werte, die die Karte schon traegt; jede Quote steht mit n.
       Der bisherige Inhalt bleibt vollstaendig im DOM, eingeklappt unter "Details". */
    var chips = [];
    if (c.replay && c.replay.sufficient) chips.push(evChip("observed", "Beobachtet", Math.round(c.replay.positiveShare * 100) + " % höher", ["n " + c.replay.completed, "Median " + VM.pct(c.replay.medianReturn, 1, true)]));
    else if (c.replay && c.replay.state === "AVAILABLE") chips.push(evChip("observed", "Beobachtet", "zu wenige Fälle", ["n " + c.replay.episodes], true));
    if (tested && E) {
      var tb = tested.backtest, edge = E.edgeOf(tb);
      chips.push(evChip("tested", "Getestet", typeof tb.deltaPositiveShare === "number" ? E.pp(tb.deltaPositiveShare) + " ggü. Markt" : E.share1(tb.positiveShare) + " höher",
        [E.EDGE_SHORT[edge.id], "n " + E.int(tb.n) + " marktweit", "Evidenz " + (E.TRUST_SHORT[tb.trust] || "nicht bereit")].filter(Boolean), false, edge.tone));
    } else if (withheld) chips.push(evChip("tested", "Getestet", "noch keine Aussage", [], true));
    if (c.events.length > 1) chips.push(el("span", { class: "q-rc-chip is-count", title: c.events.slice(1).map(function (e) { return (T[e.eventType] || {}).label || e.eventType; }).join(" · "),
      text: "+" + (c.events.length - 1) + (c.events.length > 2 ? " Ereignisse" : " Ereignis") }));
    /* Schon in einem frueheren Lauf gemeldet (Alert-Ledger, isNew=false):
       die Karte sagt es, statt eine alte Meldung als heutige zu zeigen. Datum und "Details" teilen sich eine Zeile. */
    var details = el("details", { class: "q-rc-details" }, [el("summary", {}, [
        el("small", { class: "q-rc-date", text: (first.isNew === false ? "Bereits gemeldet · " : "") + "Stand " + X.dateDe(first.occurredAt) }),
        el("span", { class: "q-rc-dlabel" }, [document.createTextNode("Details"), el("span", { class: "qx-sr", text: " zu " + nameOf(ctx, c.ticker) })])]),
      el("div", { class: "q-rc-detail-body" }, [
        c.setup && c.setup.state !== "NO_SETUP" ? el("p", { class: "q-rc-since", text: lifecycleLabel(c.setup.state) + " seit " + X.dateDe(c.setup.since) }) : null,
        el("p", { class: "q-rc-what" }, [el("b", { text: t0.label || first.eventType }), el("span", { text: first.explanation })]),
        c.events.length > 1 ? el("ul", { class: "q-rc-more" }, c.events.slice(1, 4).map(function (e) {
          var t = T[e.eventType] || {};
          return el("li", { class: "tone-" + (e.direction || t.tone || "info"), text: (t.label || e.eventType) + (e.direction === "up" && e.eventType === "FACTOR_CHANGED" ? " ↑" : e.direction === "down" && e.eventType === "FACTOR_CHANGED" ? " ↓" : "") });
        })) : null,
        tr && tr.trigger ? el("p", { class: "q-rc-next" }, [el("b", { text: "Bestätigt, wenn " }), el("span", { text: plainTrigger(tr.trigger) })])
          : c.next && c.next.open && c.next.open.length ? el("p", { class: "q-rc-next" }, [el("b", { text: "Nächster Schritt: " }), el("span", { text: "für „" + lifecycleLabel(c.next.state) + "“ fehlen " + c.next.open.length + " von " + c.next.total + " Bedingungen" })]) : null,
        ev ? el("p", { class: "q-rc-evidence" }, [el("span", { class: "q-ev-tier tier-observed", text: "Beobachtet" }), el("span", { text: " Bei dieser Aktie: " + ev + "." })]) : null,
        testedNode,
        withheld && E ? el("p", { class: "q-rc-withheld" }, [el("span", { class: "q-ev-tier tier-tested is-off", text: "Getestet" }), el("span", { text: " " + E.reasonText(withheld.backtest.reason) })]) : null,
        el("p", { class: "q-rc-link" }, [X.link("Zur Analyse von " + c.ticker, X.routes.stock(c.ticker))])
      ])]);
    return el("article", { class: "q-radar-card q-rc-compact tone-" + tone, dataset: { symbol: c.ticker } }, [
      el("a", { class: "q-rc-head", href: X.routes.stock(c.ticker) }, [X.logo(c.ticker, nameOf(ctx, c.ticker), "md", { initialOnly: !opts.logo }),
        el("span", { class: "q-rc-id" }, [el("b", { text: nameOf(ctx, c.ticker) }),
          el("span", { class: "q-rc-meta" }, [el("span", { class: "q-rc-ticker", text: c.ticker }),
            el("span", { class: "q-rc-status tone-" + tone }, [el("i", { "aria-hidden": "true", text: tone === "up" ? "▲" : tone === "down" ? "▼" : "●" }), el("span", { text: t0.label || first.eventType })])])])]),
      rows.length ? el("dl", { class: "q-rc-kpis" }, rows.map(function (r) { return el("div", {}, [el("dt", { text: r[0] }), el("dd", { class: "num", text: r[1] })]); })) : null,
      chips.length ? el("div", { class: "q-rc-chips" }, chips) : null,
      hit ? el("p", { class: "q-alert-hit", text: "Passt zu deiner Benachrichtigung: " + hit }) : null,
      details
    ]);
  }
  /* Beleg-Chip: Zeichen + Stufe + Hauptwert + Bezugsgroessen. Gestrichelt (off): noch keine Aussage. */
  function evChip(tier, label, value, rest, off, tone) {
    return el("span", { class: "q-rc-chip tier-" + tier + (off ? " is-off" : "") + (tone ? " tone-" + tone : "") }, [
      el("i", { "aria-hidden": "true", text: tier === "observed" ? "◉" : "▣" }), el("b", { text: label }), el("span", { class: "num", text: value }),
      rest.length ? el("small", { text: rest.join(" · ") }) : null]);
  }
  /* Visual First (VU3): jede Zaehlung traegt ihr Richtungszeichen (▲ verbessert, ▼ verschlechtert, ▣ historisch getestet - wie
     auf der Karte) und fuehrt zum passenden Filter. onPick: auf der Radar-Seite filtert der Tipp direkt, sonst fuehrt er zum Radar. */
  var STAT_GLYPH = { up: "▲", down: "▼", tested: "▣" };
  function radarSummary(radar, onPick) {
    var sm = radar.summary;
    function tile(label, value, sub, tone, filter) {
      var kids = [el("b", { class: "num" }, [el("i", { class: "q-rstat-glyph", "aria-hidden": "true", text: STAT_GLYPH[tone] }), document.createTextNode(value)]), el("span", { text: label }), sub ? el("small", { text: sub }) : null];
      var cls = "q-stat qx-stat q-rstat tone-" + tone;
      if (!filter) return el("div", { class: cls }, kids);
      return onPick ? el("button", { type: "button", class: cls, dataset: { pick: filter }, onclick: function () { onPick(filter); } }, kids)
        : el("a", { class: cls, href: X.routes.radar("filter=" + filter) }, kids);
    }
    return [tile("Neue Setups", String(sm.newSetups), "Stand " + X.dateDe(radar.sources.setup.to), "up", "setups"),
      tile("Setups bestätigt", String(sm.confirmedSetups), "Stand " + X.dateDe(radar.sources.setup.to), "up", "setups"),
      tile("Aktien verbessern sich", sm.improvingTickers.toLocaleString("de-DE"), "mindestens ein positives Ereignis", "up", null),
      tile("Risiko steigt", String(sm.riskRisingTickers), "Risiko-Faktor fällt eine Stufe", "down", "faktoren"),
      tile("Neues 52-Wochen-Hoch", String(sm.newHighs), "Stand " + X.dateDe(radar.sources.market.asOf), "up", "hoch"),
      tile("Neu in einer Strategie", String(sm.newStrategyMatches), "Stand " + X.dateDe(radar.sources.strategy.to), "up", "strategien")]
      .concat(typeof sm.edgeTickers === "number" ? [
        tile("Mit messbarem historischen Vorteil", sm.edgeTickers.toLocaleString("de-DE"), "Regelereignis lag historisch über dem Markt – meist nur leicht", "tested", "vorteil"),
        tile("Historisch schwächer als der Markt", sm.weakerEdgeTickers.toLocaleString("de-DE"), "Regelereignis lag historisch unter dem Markt", "down", null)] : []);
  }
  /* Richtung eines Ereignisses wie im Typ-Katalog der Engine (tone up/down/info; FACTOR_CHANGED mit eigener Richtung). */
  function eventTone(e) {
    var t = RadarC && RadarC.TYPE[e.eventType];
    var tone = e.eventType === "FACTOR_CHANGED" && (e.direction === "up" || e.direction === "down") ? e.direction : t && t.tone;
    return tone === "up" ? "good" : tone === "down" ? "bad" : "neutral";
  }
  /* Warum der historische Vorteil nicht sortiert - aus der aktuellen Evidenz, nicht fest geschrieben. */
  function edgeSortNote(r) {
    var E = global.QXEvidence, best = null;
    Object.keys(r.backtestEvidence || {}).forEach(function (k) {
      var b = r.backtestEvidence[k];
      if (b && b.state === "AVAILABLE" && Array.isArray(b.deltaCi) && b.deltaCi[0] > 0 && (!best || b.deltaPositiveShare > best.b.deltaPositiveShare)) best = { id: k, b: b };
    });
    var base = "Ein historischer Vorteil gegenüber dem Markt sortiert eine Karte bewusst nicht nach oben";
    if (!best) return base + ": Zum aktuellen Stand hat kein getestetes Regelereignis einen messbaren Vorteil.";
    var label = (RadarC && RadarC.TYPE[best.id] || {}).label || best.id;
    return base + ": Der größte messbare Vorteil („" + label + "“) beträgt " + (E ? E.pp(best.b.deltaPositiveShare) : "") +
      (best.b.edgeOutOfSample ? "." : " und hat sich in neueren Daten nicht bestätigt.") + " Wer nur solche Fälle sehen will, nutzt den Filter „Mit messbarem Vorteil“.";
  }
  /* ================================================================ MELDUNGEN (Konzept Quant 2026-11, QX02, Screen q-radar)
     Radar heißt „Meldungen“ (#/meldungen). Chips nach Art mit Zahl, Reiter Alle · Besser · Schlechter, eine Zeile je Aktie
     je Tag (Logo, Name, Meldung, Urteil), Details im Sheet beim Antippen, „Weitere N laden“. Daten: radar-v1, unverändert. */
  var MELD_FILTERS = [
    { id: "alle", label: "Alle", types: null, chip: true },
    { id: "setups", label: "Setups", types: ["SETUP_CONFIRMED", "SETUP_NEW", "SETUP_WEAKENED", "SETUP_INVALIDATED"], chip: true },
    { id: "stile", label: "Anlagestile", types: ["STRATEGY_MATCH_NEW", "STRATEGY_MATCH_LOST"], chip: true },
    { id: "momentum", label: "Kurs & Trend", types: ["MOMENTUM_IMPROVED", "MOMENTUM_DETERIORATED", "TREND_UP", "TREND_DOWN"], chip: true },
    { id: "hoch", label: "Jahreshoch", types: ["NEW_52W_HIGH"], chip: true },
    { id: "faktoren", label: "Eigenschaften", types: ["FACTOR_CHANGED", "RISK_RISING"], chip: true },
    { id: "evidenz", label: "Rückblick verändert", types: ["EVIDENCE_CHANGED", "PATTERN_MATCH_NEW"] },
    { id: "historisch", label: "Marktweit geprüft", evidence: true },
    { id: "vorteil", label: "Mit messbarem Vorteil", edge: true },
    { id: "beobachtet", label: "Beobachtet", watched: true }
  ];
  var MELD_ALIAS = { strategien: "stile" };
  var NEW_TYPES = ["SETUP_CONFIRMED", "STRATEGY_MATCH_NEW", "NEW_52W_HIGH", "PATTERN_MATCH_NEW"];
  /* Die Meldung einer Zeile: Art des ersten Ereignisses; bei Stilen der deutsche Name des Stils. */
  function meldungText(e) {
    var t = RadarC && RadarC.TYPE[e.eventType] || {};
    if (e.eventType === "STRATEGY_MATCH_NEW" || e.eventType === "STRATEGY_MATCH_LOST") {
      var id = String(e.id || "").split("_").pop(), nm = VM.STYLE_NAME[id];
      return nm ? (e.eventType === "STRATEGY_MATCH_NEW" ? "Neu in „" + nm + "“" : "Nicht mehr in „" + nm + "“") : (t.label || e.eventType);
    }
    if (e.eventType === "FACTOR_CHANGED" || e.eventType === "RISK_RISING") {
      var f = String(e.id || "").split("_").pop(); var w = VM.FACTORS[f] ? VM.FACTORS[f].name : null;
      if (w) return w + (eventTone(e) === "good" ? " stärker" : eventTone(e) === "bad" ? " schwächer" : " verändert");
    }
    return t.label || e.eventType;
  }
  /* Urteil rechts: neu (▲), besser (▲), schlechter (▼), beobachten (◆) – Farben nach Redesign, kein Rot. */
  function meldungVerdict(e) {
    var tone = eventTone(e);
    if (e.eventType === "SETUP_NEW") return U().verdict("mid", "Beobachten"); /* entsteht erst, Mockup q-radar */
    if (tone === "good") return U().verdict("strong", NEW_TYPES.indexOf(e.eventType) >= 0 ? "Neu" : "Besser");
    if (tone === "bad") return U().verdict("weak", "Schlechter");
    return U().verdict("mid", "Beobachten");
  }
  function meldungRow(ctx, c, f) {
    var e = c.events[0];
    if (f && f.types) e = c.events.filter(function (x) { return f.types.indexOf(x.eventType) >= 0; })[0] || e;
    return '<button type="button" class="qk-mr" data-ticker="' + U().esc(c.ticker) + '" aria-haspopup="dialog">' + U().logo(c.ticker) + '<span><b>' + U().esc(qName(ctx, c.ticker)) + "</b><span>" + U().esc(meldungText(e)) + "</span></span>" + meldungVerdict(e) + "</button>";
  }
  function dayLong(iso) {
    var d = iso ? new Date(iso + "T12:00:00Z") : null;
    return d && !isNaN(d) ? ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"][d.getUTCDay()] + ", " + iso.slice(8, 10) + "." + iso.slice(5, 7) + "." : "Ohne Datum";
  }
  async function radar(main, ctx, params) {
    var page = el("div", { class: "vu-ui qv3 qk qk-meld" });
    main.append(page);
    page.innerHTML = '<header class="qv3-intro"><p class="vu-ltag">Meldungen</p><h1 class="vu-lt">Was ist heute neu?</h1><p class="vu-lead">Eine Zeile je Aktie, Details beim Antippen.</p></header>';
    var r = await ctx.api.getQuantRadar().catch(function () { return null; });
    if (!r || r.state !== "AVAILABLE") { page.append(frag(U().blank("Die Meldungen konnten gerade nicht geladen werden. Suche und Screener funktionieren weiterhin."))); return; }
    var head = page.querySelector(".qv3-intro");
    head.querySelector(".vu-ltag").textContent = "Meldungen · Stand " + deDay(r.asOf);
    head.querySelector(".vu-lead").textContent = r.cards.length.toLocaleString("de-DE") + " Aktien mit einer Meldung. Eine Zeile je Aktie, Details beim Antippen.";
    var current = MELD_ALIAS[params && params.get("filter")] || (params && params.get("filter")) || "alle";
    if (!MELD_FILTERS.some(function (f) { return f.id === current; })) current = "alle";
    var tone = params && /^(besser|schlechter)$/.test(params.get("richtung") || "") ? params.get("richtung") : "alle";
    var onlyWatched = !!(params && params.get("beobachtet") === "1");
    var watched = X.watch.list(), PAGE0 = 8, STEP = 25, shown = PAGE0;
    function matches(f, c) {
      if ((f.watched || onlyWatched) && watched.indexOf(c.ticker) < 0) return false;
      if (f.evidence) return c.events.some(function (e) { return e.backtest && e.backtest.state === "AVAILABLE"; });
      if (f.edge) return c.events.some(function (e) { return e.backtest && e.backtest.state === "AVAILABLE" && Array.isArray(e.backtest.deltaCi) && e.backtest.deltaCi[0] > 0; });
      return !f.types || c.events.some(function (e) { return f.types.indexOf(e.eventType) >= 0; });
    }
    function lead(f, c) { return f.types ? c.events.filter(function (e) { return f.types.indexOf(e.eventType) >= 0; })[0] || c.events[0] : c.events[0]; }
    var chips = el("nav", { class: "vu-chips qk-chips", "aria-label": "Meldungen nach Art" });
    var seg = el("div", { class: "vu-seg qk-seg", role: "group", "aria-label": "Richtung" });
    var list = el("div", { class: "qk-days", "aria-live": "polite" });
    var more = el("button", { type: "button", class: "vu-btn vu-btn--line vu-btn--block qk-more" });
    page.append(chips, seg, list, more);
    var visible = MELD_FILTERS.filter(function (f) { return f.chip || f.id === current || (f.watched && watched.length); });
    visible.forEach(function (f) {
      var n = r.cards.filter(function (c) { return matches(f, c); }).length;
      chips.append(el("button", { type: "button", class: "vu-chip", dataset: { filter: f.id }, "aria-pressed": "false", onclick: function () { current = f.id; shown = PAGE0; sync(); draw(); } }, [document.createTextNode(f.label + " "), el("small", { class: "num", text: n.toLocaleString("de-DE") })]));
    });
    function sync() { var q = []; if (current !== "alle") q.push("filter=" + current); if (tone !== "alle") q.push("richtung=" + tone); if (onlyWatched) q.push("beobachtet=1"); history.replaceState(null, "", X.routes.radar(q.join("&"))); }
    function draw() {
      var f = MELD_FILTERS.filter(function (x) { return x.id === current; })[0];
      chips.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.filter === f.id ? "true" : "false"); });
      var inF = r.cards.filter(function (c) { return matches(f, c); });
      var nGood = inF.filter(function (c) { return eventTone(lead(f, c)) === "good"; }).length, nBad = inF.filter(function (c) { return eventTone(lead(f, c)) === "bad"; }).length;
      seg.replaceChildren.apply(seg, [["alle", "Alle", null], ["besser", "Besser", nGood], ["schlechter", "Schlechter", nBad]].map(function (t) {
        return el("button", { type: "button", "aria-pressed": tone === t[0] ? "true" : "false", onclick: function () { tone = t[0]; shown = PAGE0; sync(); draw(); } }, [document.createTextNode(t[1]), t[2] != null ? el("small", { class: "num", text: " " + t[2].toLocaleString("de-DE") }) : null].filter(Boolean));
      }));
      var cards = inF.filter(function (c) { var tt = eventTone(lead(f, c)); return tone === "alle" || (tone === "besser" ? tt === "good" : tt === "bad"); });
      cards.sort(function (a, b) { var da = lead(f, a).occurredAt || "", db = lead(f, b).occurredAt || ""; return da < db ? 1 : da > db ? -1 : 0; });
      var days = [], by = {};
      cards.slice(0, shown).forEach(function (c) { var d = lead(f, c).occurredAt || ""; if (!by[d]) { by[d] = []; days.push(d); } by[d].push(c); });
      list.replaceChildren(frag(days.length ? days.map(function (d, i) {
        return '<div class="qk-rh qk-day"><div class="qk-rh-t"><h2>' + U().esc(dayLong(d)) + "</h2>" + (i ? "" : '<span class="vu-xs vu-mu qk-sort">Neueste zuerst</span>') + "</div></div>" +
          '<div class="vu-box qk-list">' + by[d].map(function (c) { return meldungRow(ctx, c, f); }).join("") + "</div>";
      }).join("") : U().blank(f.watched ? "Keine beobachtete Aktie mit Meldung. Tippe auf einer Aktienseite auf ♡ – dann erscheint sie hier." : "Zum aktuellen Stand gibt es keine Meldung dieser Art.")));
      var rest = cards.length - shown;
      more.hidden = rest <= 0;
      more.textContent = "Weitere " + rest.toLocaleString("de-DE") + " laden";
      list.querySelectorAll("button.qk-mr").forEach(function (b) { b.addEventListener("click", function () { openDetail(b.dataset.ticker); }); });
    }
    more.addEventListener("click", function () { shown += STEP; draw(); });
    /* Details im Sheet: die bisherige Karte mit Ereignissen, Marken laut Methode, Rückblick und Weg zur Aktie. */
    var sheet = frag(U().sheet("qk-meld-sheet", "Meldung", '<div class="qk-sheet-body"></div><button type="button" class="vu-btn vu-btn--ink vu-btn--block" data-close style="margin-top:14px">Schließen</button>')).firstElementChild;
    document.body.append(sheet);
    sheet.querySelector("[data-close]").addEventListener("click", function () { U().closeSheet(sheet); });
    var off = function () { if (sheet.parentNode) sheet.remove(); global.removeEventListener("hashchange", off); };
    global.addEventListener("hashchange", off);
    function openDetail(t) {
      var c = r.cards.filter(function (x) { return x.ticker === t; })[0]; if (!c) return;
      var card = radarCard(ctx, c, { logo: true }), det = card.querySelector("details"); if (det) det.open = true;
      var h = sheet.querySelector("h2, .vu-sheet__title"); if (h) h.textContent = nameOf(ctx, t) || t;
      sheet.querySelector(".qk-sheet-body").replaceChildren(card);
      U().openSheet(sheet);
    }
    page.append(frag('<div class="qk-help">' + U().help("Eine Meldung beschreibt, was sich nach festen Regeln geändert hat. Ob das früher einen Vorteil hatte, steht unter Forschung.") + "</div>"));
    var rev = r.caveats && r.caveats.setupReversal;
    page.append(el("details", { class: "vu-box qk-how" }, [el("summary", { text: "Wie Meldungen entstehen und sortiert sind" }), el("div", {}, [
      el("ol", { class: "q-rule" }, r.priorityRule.keys.map(function (k) { return el("li", { text: k.plain }); })),
      el("p", { class: "qx-small", text: "Regel " + r.priorityRule.version + ": Die Zeilen werden nach diesen Schlüsseln der Reihe nach geordnet, der erste Unterschied entscheidet. Es entsteht keine Gesamtnote." }),
      el("p", { class: "qx-small", text: edgeSortNote(r) }),
      rev ? el("p", { class: "qx-small", text: "Setup-Wechsel sind unruhig: Gemessen kehren sich " + Math.round(rev.share * 100) + " % der Wechsel beim nächsten Stand wieder um (" + rev.reversals + " von " + rev.candidates + ")." }) : null,
      el("p", { class: "qx-small", text: "Quellen: Setup " + X.dateDe(r.sources.setup.from) + " → " + X.dateDe(r.sources.setup.to) + " · Signale " + X.dateDe(r.sources.signals.asOf) + " · Anlagestile " + X.dateDe(r.sources.strategy.from) + " → " + X.dateDe(r.sources.strategy.to) + "." })
    ].filter(Boolean))]));
    draw();
  }

  /* ================================================================ HOME (Redesign 2027, Folie Q01)
     Zuerst die Frage „Was hat sich heute verändert?“, dann Suche, „So arbeitet Quant“ (Sheet), Marktlage, sechs
     Tageszahlen, PRO-Vergleich, bestätigte Setups, Strategie-Wechsel als Liste, Wege, Vertrauen. Alle Zahlen aus
     radar-home-v1, market-regime-v1, setup-screen-index und strategy-index; fehlt eine Quelle, entfällt ihr Block. */
  var STEPS = [["Misst", "sieben Eigenschaften je Aktie", "Jede Aktie hat ein Profil aus sieben Eigenschaften: Verdient gut, Wächst, Zahlen solide, Kurs läuft, Günstig, Ruhiger Kurs und Analysten (heute ohne Daten)."],
    ["Meldet", "was sich seit gestern ändert", "Ändert sich etwas, meldet Quant es mit Auslöser und Datum, z. B. „Neu in Strategie“ oder „Risiko steigt“."],
    ["Vergleicht", "was früher in gleicher Lage geschah", "Quant zeigt, was früher in derselben Lage geschah, und sagt offen, wie belastbar das ist."]];
  /* ------------------------------------------------ Konzept Quant „Ein Profil je Aktie“ (docs/design/quant-2026-11)
     Gemeinsame Bausteine der Seiten Start, Meldungen, Screener und Anlagestile: Schienenkopf, Schiene, Profil-Poster,
     Aktienzeile mit Profil, Stil-Karte mit Regel-Chips. Werte aus denselben Artefakten wie bisher. */
  function deDay(iso) { var d = iso ? new Date(iso + "T12:00:00Z") : null; return d && !isNaN(d) ? ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][d.getUTCDay()] + ". " + iso.slice(8, 10) + "." + iso.slice(5, 7) + "." : ""; }
  /* Anzeigename wie im Mockup: ohne Rechtsform-Anhang („Inc.“, „Corp“, „Holdings, Inc.“, „/New/“). */
  function cleanName(n) { return String(n || "").replace(/\s*\/[A-Za-z]{2,}\/?$|\/$/g, "").replace(/,?\s+(Holdings?,?\s+Inc\.?|Inc\.?|Corp(oration)?\.?|Co\.?|Ltd\.?|plc|N\.?V\.?|S\.?A\.?|Companies,?\s+Inc\.?|Group,?\s+Inc\.?)$/i, "").replace(/,?\s+(Inc\.?|Corp\.?)$/i, "").trim(); }
  /* Kürzt die Rechtsform weg; bliebe dadurch nur das Kürzel stehen (FIGS Inc., YETI Holdings, CTS Corp), gilt der volle Name. */
  function qName(ctx, t) { var full = nameOf(ctx, t), c = cleanName(full); return (c && c.toUpperCase() !== String(t).toUpperCase() ? c : String(full || "").trim()) || t; }
  function railHead(title, count, href, sub, tag) {
    return '<div class="qk-rh"><div class="qk-rh-t"><h2>' + U().esc(title) + "</h2>" + (tag ? '<span class="qk-tag">' + U().esc(tag) + "</span>" : "") +
      (href ? '<a href="' + U().esc(href) + '">' + (count != null ? "Alle " + U().esc(typeof count === "number" ? count.toLocaleString("de-DE") : count) : "Alle") + U().glyph("next", 13) + "</a>" : "") + "</div>" + (sub ? "<p>" + U().esc(sub) + "</p>" : "") + "</div>";
  }
  function rail(items, label) { return '<div class="qk-rail" role="list" tabindex="0" aria-label="' + U().esc(label || "") + '">' + items.map(function (x) { return '<div role="listitem">' + x + "</div>"; }).join("") + "</div>"; }
  function profileOf(rowBy, t) { var r = rowBy && rowBy[t]; return r ? VM.profileValues(r) : null; }
  /* Profil-Poster für Schienen: Logo, Name, Kürzel, Profil klein, ein Chip. */
  function qPoster(ctx, rowBy, t, chip) {
    var pv = profileOf(rowBy, t);
    return '<a class="qk-pc" href="' + U().esc(X.routes.stock(t)) + '">' + U().logo(t) + '<b class="qk-pc-n">' + U().esc(qName(ctx, t)) + '</b><span class="qk-pc-t">' + U().esc(t) + "</span>" +
      '<span class="qk-pc-p">' + (pv ? U().profileMini(pv, { width: 110, height: 34 }) : '<span class="vu-xs vu-mu">Kein Profil veröffentlicht</span>') + "</span>" +
      (chip ? '<span class="qk-pc-c">' + U().esc(chip) + "</span>" : "") + "</a>";
  }
  /* Aktienzeile mit Profil: Logo, Name, Zeile darunter, Profil klein, rechts ein Wert oder Etikett. */
  function qRow(ctx, rowBy, t, sub, right, href) {
    var pv = profileOf(rowBy, t);
    return '<a class="qk-pr" href="' + U().esc(href || X.routes.stock(t)) + '">' + U().logo(t) + '<span class="qk-pr-n"><b>' + U().esc(qName(ctx, t)) + "</b><span>" + U().esc(sub || t) + "</span></span>" +
      (pv ? U().profileMini(pv, { width: 60, height: 26 }) : '<span class="vu-xs vu-mu qk-pr-na">kein Profil</span>') + (right || "") + "</a>";
  }
  function scoreP(v, label) { return typeof v === "number" ? '<span class="qk-sp' + (v >= 75 ? " is-hi" : "") + '"><small>' + U().esc(label) + '</small><b class="vu-num">' + Math.round(v) + "</b></span>" : '<span class="qk-sp is-na"><small>' + U().esc(label) + '</small><b class="vu-num">–</b></span>'; }
  function ruleChip(c) { return '<span class="qk-rc">' + U().glyph(U().PROFILE.glyph[c.id] || "check", 13) + U().esc(VM.FACTORS[c.id] ? VM.FACTORS[c.id].name : c.id) + " <b>ab " + U().esc(c.value) + "</b></span>"; }
  /* Stil-Karte: Fachname klein, deutscher Satz groß, Trefferzahl, Regel-Chips, Logos, „seit gestern +N · −N“. */
  function stilCard(ctx, p, ix, tr) {
    var count = ix && typeof ix.count === "number" ? ix.count : null, inN = tr ? (tr.entered || []).length : null, outN = tr ? (tr.exited || []).length : null;
    var logos = ctx.commonFirst((ix && ix.tickers) || []).slice(0, 4);
    return '<a class="qk-stc" href="' + U().esc(X.routes.strategy(p.profileId)) + '" data-profile="' + U().esc(p.profileId) + '"><span class="qk-stc-h"><span><span class="vu-ltag">' + U().esc(String(p.label || p.profileId).split(" · ")[0]) + "</span><b>" + U().esc(VM.styleName(p.profileId, p.label)) + "</b></span>" +
      '<span class="qk-stc-n"><b class="vu-num">' + (count == null ? "–" : count.toLocaleString("de-DE")) + '</b><span class="vu-xs vu-mu">Aktien heute</span></span></span>' +
      '<span class="qk-rcs">' + (p.conditions || []).map(ruleChip).join("") + "</span>" +
      '<span class="qk-stc-f"><span class="qk-logos">' + logos.map(function (t) { return U().logo(t); }).join("") + "</span>" + (inN != null && (inN || outN) ? '<span class="vu-xs vu-mu"><b>seit gestern +' + inN + " · −" + outN + "</b></span>" : "") + "</span></a>";
  }
  function qSetupCard(ctx, c) {
    var tr = c.trade && c.trade.state === "AVAILABLE" ? c.trade : null;
    var inv = tr && typeof tr.invalidation === "number" ? tr.invalidation : c.setup && typeof c.setup.invalidation === "number" ? c.setup.invalidation : null;
    var box = function (l, v) { return '<div class="qk-mini"><small>' + U().esc(l) + '</small><b class="vu-num">' + U().esc(v || "–") + "</b></div>"; };
    /* Rückblick nur, wo er heute schon steht, immer mit Etikett (Entscheidung 6). */
    var name = qName(ctx, c.ticker);
    var back = c.replay && c.replay.sufficient ? "Ähnliche Lagen bei " + name + ": " + Math.round(c.replay.positiveShare * 100) + " % von " + c.replay.completed + " Fällen später höher · Forschung, nicht zertifiziert"
      : c.replay && c.replay.state === "AVAILABLE" ? "Zu wenige frühere Fälle für eine Aussage." : null;
    return '<a class="vu-box qk-setup" href="' + U().esc(X.routes.stock(c.ticker)) + '"><span class="qk-setup-h">' + U().logo(c.ticker) + '<span class="qk-setup-n"><b>' + U().esc(name) + '</b><span class="vu-xs vu-mu"><b>' + U().esc(c.ticker) + "</b></span></span>" + U().verdict("strong", "Bestätigt") + "</span>" +
      '<span class="qk-grid2">' + box("Zone laut Methode", tr && zoneText(tr.entry)) + box("Ungültig laut Methode", inv != null ? usd(inv) : null) + "</span>" +
      (back ? '<span class="vu-xs vu-mu qk-setup-b">' + U().esc(back) + "</span>" : "") + "</a>";
  }

  async function home(main, ctx) {
    if (!U()) return homeLegacy(main, ctx);
    var early = global.VUQuantBoot && global.VUQuantBoot.get("home", main);
    var page = early ? early.page : el("div", { class: "q-home vu-ui qv3 qk" });
    page.classList.add("qk");
    if (early) page.replaceChildren(early.intro); else main.append(page);
    /* QX01 (Screen q-home): Frage, ein Satz zum Profil, Suche, „Heute bei Quant“, Markt in einer Zeile, Schienen. */
    if (!early) page.append(frag('<header class="qv3-intro"><p class="vu-ltag">Quant</p><h1 class="vu-lt">Was hat sich heute verändert?</h1><p class="vu-lead">Jede Aktie hat ein Profil aus sieben Eigenschaften. Quant meldet, wenn sich etwas ändert.</p></header>'));
    var search = el("button", { type: "button", class: "vu-find qv3-search q-searchbar", "aria-label": "Aktie suchen, z. B. NVDA … und analysieren", onclick: ctx.openSearch });
    search.innerHTML = U().glyph("search", 18) + "<span>Aktie suchen, z. B. NVDA …</span><i aria-hidden=\"true\">" + U().glyph("spark", 18) + "</i>";
    page.append(search);
    var todayHost = el("div", { class: "qk-today-host" }), regimeHost = el("div", { class: "qv3-regime-host" }), newHost = el("div"), setupHost = el("div"), stilHost = el("div"), watchHost = el("div"), tiAlertHost = el("div");
    todayHost.innerHTML = U().skeleton("card"); todayHost.setAttribute("aria-busy", "true");
    page.append(todayHost, regimeHost, watchHost, tiAlertHost, newHost, setupHost, stilHost);
    /* So arbeitet Quant: drei Kacheln, „Alle“ öffnet das Sheet mit Erklärung und Beleg. */
    var how = frag(railHead("So arbeitet Quant", null, "#qk-how") + '<div class="qk-grid3">' + STEPS.map(function (st, i) { return '<div class="vu-box qk-step"><i class="qk-stepn">' + (i + 1) + "</i><b>" + st[0] + '</b><span class="vu-xs vu-mu">' + st[1] + "</span></div>"; }).join("") + "</div>");
    page.append(how);
    var sheet = frag(U().sheet("qv3-how-sheet", "So arbeitet Quant", '<p class="vu-ltag" style="margin:0">Drei Schritte, jeden Tag gleich</p><div class="vu-stack" style="margin-top:14px">' + STEPS.map(function (st, i) { return '<div class="qv3-sstep"><i>' + (i + 1) + "</i><div><b>" + ["Messen", "Melden", "Vergleichen"][i] + '</b><p class="vu-sm vu-mu">' + st[2] + "</p></div></div>"; }).join("") + "</div>" +
      '<div class="vu-box" style="margin-top:14px;display:flex;gap:10px;align-items:center">' + U().verdict("none", "Keine Empfehlung") + '<span class="vu-sm">Quant sagt nie „kaufen“ oder „verkaufen“.</span></div><div class="qv3-proof"></div><button type="button" class="vu-btn vu-btn--ink vu-btn--block" data-close style="margin-top:14px">Verstanden</button>')).firstElementChild;
    document.body.append(sheet);
    var proofHost = sheet.querySelector(".qv3-proof");
    proofHost.append(promiseList());
    page.querySelector('a[href="#qk-how"]').addEventListener("click", function (e) { e.preventDefault(); U().openSheet(sheet); });
    sheet.querySelector("[data-close]").addEventListener("click", function () { U().closeSheet(sheet); });
    var off = function () { if (sheet.parentNode) sheet.remove(); global.removeEventListener("hashchange", off); };
    global.addEventListener("hashchange", off);
    page.append(frag('<a class="vu-box vu-box--lime qv3-trust" href="' + U().esc(X.routes.method()) + '"><span class="qv3-trust-i">' + U().glyph("book", 18) + '</span><span><b>Warum kann ich dem vertrauen?</b><span class="vu-xs">Methodik, Daten, Grenzen offen erklärt</span></span>' + U().glyph("next", 18) + "</a>" +
      '<p class="vu-xs vu-mu qk-foot">Quant ordnet ein und vergleicht. Keine Anlageempfehlung, keine Prognose, kein Kursziel. <span class="qk-asof"></span></p>'));

    var watched = X.watch.list();
    var TI = global.VUTechnicalIntelligence;
    if (watched.length && TI && TI.getWatchlistAlerts) TI.getWatchlistAlerts(watched).then(function (a) {
      if (a.state !== "AVAILABLE" || !a.events.length) return;
      tiAlertHost.replaceChildren(frag(railHead("Chartbild bei deinen Aktien", null, null, "Was der Kurs seit dem letzten Lauf im Chart getan hat. Szenarien sind Bedingungen, keine Prognose.") +
        '<div class="vu-box qk-list">' + a.events.slice(0, 8).map(function (e) { return '<a class="qk-mr" href="' + U().esc(X.routes.chart(e.symbol)) + '">' + U().logo(e.symbol) + '<span><b>' + U().esc(qName(ctx, e.symbol)) + "</b><span>" + U().esc(e.text) + "</span></span></a>"; }).join("") + "</div>"));
    });

    var dataP = Promise.all([ctx.api.getSetupScreenIndex().catch(function () { return null; }), ctx.api.getStrategyIndex().catch(function () { return null; }),
      ctx.api.getMarketRegime().catch(function () { return null; }), ctx.api.getStrategyProfiles().catch(function () { return null; }),
      ctx.api.getQuantRadarHome().catch(function () { return null; }), watched.length ? ctx.api.getRadarCards(watched).catch(function () { return []; }) : Promise.resolve([]), screeningRows(ctx)]);
    await Promise.all([ctx.loadNames(), ctx.loadBacktestView()]);
    var r = await dataP;
    var setupIdx = r[0], stratIdx = r[1], regime = r[2], profiles = r[3], radar = r[4], hits = r[5] || [], rowBy = r[6];
    var asOf = (radar && radar.asOf) || (stratIdx && stratIdx.asOf) || (regime && regime.asOf);
    var ltag = page.querySelector(".qv3-intro .vu-ltag"); if (ltag && asOf) ltag.textContent = "Quant · Schluss " + deDay(asOf);
    var asOfHost = page.querySelector(".qk-asof"); if (asOfHost && asOf) asOfHost.textContent = "Stand " + X.dateDe(asOf) + ".";

    /* Heute bei Quant: schwarze Karte mit drei Zahlen und dem Weg zu allen Meldungen. */
    todayHost.setAttribute("aria-busy", "false");
    if (radar && radar.state === "AVAILABLE") {
      var sm = radar.summary, total = radar.cardCount;
      todayHost.replaceChildren(frag('<a class="qk-today" href="' + U().esc(X.routes.radar()) + '"><span class="vu-ltag">Heute bei Quant · Stand ' + U().esc(deDay(radar.asOf)) + '</span><span class="qk-tg">' +
        [[sm.newStrategyMatches, "neu in einem Anlagestil"], [sm.confirmedSetups, "Setups bestätigt"], [sm.riskRisingTickers, "Risiko steigt"]].map(function (x) { return '<span><b class="vu-num">' + U().esc(typeof x[0] === "number" ? x[0].toLocaleString("de-DE") : "–") + "</b><span>" + x[1] + "</span></span>"; }).join("") +
        '</span><span class="qk-today-l"><span>' + (typeof total === "number" ? "Alle " + total.toLocaleString("de-DE") + " Meldungen" : "Alle Meldungen") + "</span>" + U().glyph("next", 16) + "</span></a>"));
      var proof = proofCard(radar);
      if (proof) proofHost.append(proof);
    } else todayHost.replaceChildren(frag(U().blank("Gerade keine Meldungen abrufbar. Die Tageszahlen erscheinen, sobald der Lauf veröffentlicht ist.")));

    /* Markt als eine Zeile: Lage, Anteil über der 200-Tage-Linie, Balken. */
    if (regime && regime.state === "AVAILABLE") {
      var mm = {}; (regime.measures || []).forEach(function (x) { mm[x.id] = x; });
      var above = mm.above200 && typeof mm.above200.share === "number" ? mm.above200.share : null;
      regimeHost.replaceChildren(frag('<a class="vu-box qk-ms" href="' + "/quant/markt/" + '"><span><span class="vu-ltag">Markt heute</span><b>' + U().esc(REGIME[regime.regime] || "Marktlage") +
        (above != null ? ' <span class="vu-xs vu-mu">' + Math.round(above * 100) + " % über der 200-Tage-Linie</span>" : "") + "</b>" + (above != null ? '<span class="qk-bar" aria-hidden="true"><i style="width:' + Math.round(above * 100) + '%"></i></span>' : "") + "</span>" + U().glyph("next", 14) + "</a>"));
    }

    var labels = {}, conds = {};
    ((profiles && profiles.contract && profiles.contract.profiles) || []).forEach(function (p) { labels[p.profileId] = p.label; conds[p.profileId] = p; });
    var trBy = {}; ((stratIdx && stratIdx.historicalEvidence && stratIdx.historicalEvidence.transitions) || []).forEach(function (t) { trBy[t.profileId] = t; });
    /* Neu in einem Anlagestil: je Stil die bekanntesten neuen Treffer als Profil-Poster. */
    if (stratIdx && stratIdx.state === "AVAILABLE") {
      var fresh = [];
      VM.STYLE_ORDER.forEach(function (id) { var t = trBy[id]; if (t) ctx.commonFirst(t.entered || []).slice(0, 2).forEach(function (tk) { fresh.push([tk, id]); }); });
      var newCount = radar && radar.summary ? radar.summary.newStrategyMatches : fresh.length;
      if (fresh.length) newHost.replaceChildren(frag(railHead("Neu in einem Anlagestil", newCount, X.routes.radar("filter=stile"), "Seit gestern erfüllt die Aktie alle Regeln eines Stils.") +
        rail(fresh.slice(0, 10).map(function (x) { return qPoster(ctx, rowBy, x[0], VM.styleName(x[1], labels[x[1]])); }), "Neu in einem Anlagestil") + U().profileLegend()));
    }
    /* Setup bestätigt: zwei Karten, Zone und Ungültig-Marke laut Methode, Rückblick mit Etikett. */
    /* Die Startseite liest nur die Projektion (radar-home-v1), nicht den ganzen Radar. */
    var confirmed = radar && radar.state === "AVAILABLE" ? (radar.cards || []).filter(function (c) { return c.events && c.events.some(function (e) { return e.eventType === "SETUP_CONFIRMED"; }); }) : [];
    var conf = setupIdx && setupIdx.state === "AVAILABLE" ? (setupIdx.states || []).filter(function (st) { return st.state === "CONFIRMED" && typeof st.count === "number"; })[0] : null;
    if (confirmed.length) setupHost.replaceChildren(frag(railHead("Setup bestätigt", conf ? conf.count : null, X.routes.screener("frage=setups"), "Der Chart zeigt eine Lage mit klaren Regeln.") +
      '<div class="vu-stack">' + confirmed.slice(0, 2).map(function (c) { return qSetupCard(ctx, c); }).join("") + "</div>"));
    /* Anlagestile als Schiene. */
    if (stratIdx && stratIdx.state === "AVAILABLE") {
      var ixBy = {}; (stratIdx.profiles || []).forEach(function (p) { ixBy[p.profileId] = p; });
      var cards = VM.STYLE_ORDER.filter(function (id) { return conds[id] && ixBy[id] && ixBy[id].availability && ixBy[id].availability.state === "AVAILABLE"; });
      if (cards.length) stilHost.replaceChildren(frag(railHead("Anlagestile", cards.length, X.routes.strategies(), "Jeder Stil ist eine feste Regel. Quant prüft sie täglich.") +
        rail(cards.map(function (id) { return stilCard(ctx, conds[id], ixBy[id], trBy[id]); }), "Anlagestile")));
    }
    /* Beobachtete Aktien mit Meldung: eine Zeile je Aktie. */
    if (hits.length) watchHost.replaceChildren(frag(railHead("Deine Aktien", hits.length, X.routes.radar("filter=beobachtet"), hits.length + " von " + watched.length + " beobachteten Aktien melden eine Veränderung.") +
      '<div class="vu-box qk-list">' + hits.slice(0, 5).map(function (c) { return meldungRow(ctx, c, null); }).join("") + "</div>"));
  }

  /* Bisherige Startseite (ohne Bausteine VUUI). */
  async function homeLegacy(main, ctx) {
    /* GERUEST ZUERST. Hero, Tafel "Heute bei Quant" und die Platzhalter sind statisch; sie stehen, sobald das Woerterbuch
       da ist. Namen und Evidenz-Ansicht laufen seit dem Routenstart (app.js) und werden dort abgewartet, wo
       Daten gezeichnet werden. Wer Beobachtetes oder Zuletzt-Angesehenes hat, braucht die Namen schon beim Aufbau
       ("Deine Aktien") - fuer ihn bleibt es beim Warten wie bisher. */
    if (X.recent.list().length || X.watch.list().length) await ctx.loadNames();
    var page = el("div", { class: "q-home" });
    main.append(page);
    var productIcon = el("span", { class: "vu-product-icon vu-product-icon--hero", "aria-hidden": "true" });
    var ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg"), use = document.createElementNS(ns, "use");
    svg.setAttribute("viewBox", "0 0 24 24"); use.setAttribute("href", "/assets/product-icons.svg#quant"); svg.appendChild(use); productIcon.appendChild(svg);
    var scene = X.globe(); scene.setAttribute("class", "q-globe vu-hero-scene");
    page.append(el("header", { class: "q-hero v2-intro qx-intro qx-hero vu-product-hero vu-hero-fidelity", "data-product": "quant" }, [
      scene,
      productIcon,
      el("p", { class: "q-product-name vu-hero-name", text: "Quant" }),
      el("h1", { class: "q-claim vu-product-title vu-hero-headline", text: HERO_TITLE }),
      el("p", { class: "q-hero-lead qx-lead vu-product-lead vu-hero-description", text: CLAIM }),
      el("button", { type: "button", class: "q-searchbar qx-searchbox", onclick: ctx.openSearch, "aria-label": "Aktie suchen, z. B. NVDA … und analysieren" }, [
        X.icon("search"), el("span", { text: "Aktie suchen, z. B. Apple oder NVDA …" }), el("i", { "aria-hidden": "true", text: "→" })]),
      el("p", { class: "q-intro-note", text: CLAIM_LEAD }),
      /* VU3: die vier Versprechen sind Erklaerung - sie stehen hinter "Mehr", die Ergebnisse darunter zuerst. */
      X.more("So arbeitet Quant", function () { return promiseList(); })
    ]));

    /* Owner-Auftrag "Quant Daily Usefulness" (01.10.2026): Home zeigt
       zuerst, was heute neu ist - der Radar. Danach erst die Werkzeuge. */
    var kpis = el("div", { class: "q-stats qx-kpis" }, [X.loading("Aktuelle Stände werden geladen …")]);
    var radarHost = el("div", { class: "q-radar-grid q-radar-top" }, [X.loading("Radar wird geladen …")]);
    page.append(X.world("Heute bei Quant", "Was sich seit dem letzten Stand verändert hat – gezählt und mit Datum. Keine Kaufempfehlung.", [kpis, radarHost], { href: X.routes.radar(), label: "Zum Radar" }, "v2-market-today"));
    var watchHost = el("div"), tiAlertHost = el("div");
    page.append(watchHost, tiAlertHost);

    var rails = el("div", { class: "qx-rails" });
    var proofHost = el("div");

    var recent = X.recent.list(), watched = X.watch.list();
    if (recent.length || watched.length) {
      var mine = ctx.commonFirst(watched.concat(recent.filter(function (t) { return watched.indexOf(t) < 0; }))).slice(0, 14);
      page.append(X.world("Deine Aktien", watched.length ? "Beobachtet und zuletzt analysiert. Quant verfolgt für dich Setup-Wechsel, neue Evidenz, Strategie-Wechsel und Risiken." : "Zuletzt analysiert. Tippe auf einer Aktienseite auf „Beobachten“, dann verfolgt Quant Veränderungen für dich.", [X.rail(mine.map(function (t) {
        return X.poster({ ticker: t, name: nameOf(ctx, t), story: watched.indexOf(t) >= 0 ? "Beobachtet" : "Zuletzt analysiert", foot: "Analyse" });
      }), "Deine Aktien")], { href: X.routes.stocks(), label: "Alle ansehen" }));
    }
    page.append(rails);
    /* VU3: die Abgrenzung zum Screener ist Erklaerung - hinter "Mehr", mit dem echten Beleg aus dem Radar. */
    page.append(el("details", { class: "qx-more qv-home-more" }, [el("summary", {}, [el("span", { text: "Warum Quant mehr ist als ein Screener" })]),
      el("div", { class: "qx-more-body" }, [el("p", { class: "qx-small", text: "Ein Screener findet Aktien, die deine Bedingungen erfüllen. Quant beobachtet Zustände und Veränderungen – und vergleicht sie mit dem, was früher im ganzen Markt geschah." }), proofHost])]));

    /* Werkzeuge erst nach dem, was heute neu ist (Owner-Reihenfolge 04.10.2026). */
    page.append(X.section("Selbst suchen", null, [doors([
      { kicker: "Aktie", icon: "bars", title: "Aktie analysieren", text: "Was ist jetzt wichtig – und was geschah früher?", href: X.routes.stocks() },
      { kicker: "Quant Screener", icon: "filter", title: "Quant Screener", text: "Aktien nach deinen Bedingungen finden", href: X.routes.screener() },
      { kicker: "Strategien", icon: "network", title: "Strategien", text: "Welche Aktien heute zu einem Anlagestil passen", href: X.routes.strategies() },
      { kicker: "Kursbild", icon: "setups", title: "Aktuelle Setups", text: "Wo im Kursbild gerade etwas entsteht", href: X.routes.screener("frage=setups") }
    ])], { href: X.routes.backtest(), label: "Backtesting" }));
    page.append(X.actions([X.btn("Warum kann ich dem vertrauen?", X.routes.method(), "secondary")]),
      el("p", { class: "qx-small", text: "Quant gibt keine Anlageempfehlungen und macht keine Prognosen. Zone und Ungültig-Marke laut Methode beschreiben Szenarien der technischen Analyse." }));

    /* Chartbild-Ereignisse der beobachteten Aktien - nur in der App. Ohne
       sauberen Vergleichslauf (Ausgangszustand, Methodikwechsel) bleibt der
       Bereich leer statt Migrationsartefakte zu melden. */
    var TI = global.VUTechnicalIntelligence;
    if (watched.length && TI && TI.getWatchlistAlerts) TI.getWatchlistAlerts(watched).then(function (a) {
      if (a.state !== "AVAILABLE") return;
      tiAlertHost.replaceChildren(X.world("Chartbild bei deinen beobachteten Aktien", "Was der Kurs seit dem letzten Lauf im Chart getan hat. Szenarien sind Bedingungen, keine Prognose und keine Empfehlung.",
        [el("div", { class: "q-rows" }, a.events.slice(0, 12).map(function (e) {
          var nm = nameOf(ctx, e.symbol);
          return el("a", { class: "q-rowlink", href: X.routes.chart(e.symbol) }, [el("span", { class: "q-icon", "aria-hidden": "true" }, [X.icon("bars")]),
            el("span", {}, [el("strong", { text: e.symbol + (nm ? " · " + nm : "") }), el("small", { text: e.text + (e.asOf ? " · Stand " + X.dateDe(e.asOf) : "") })])]);
        }))]));
    });

    var dataP = Promise.all([ctx.api.getSetupScreenIndex().catch(function () { return null; }), ctx.api.getStrategyIndex().catch(function () { return null; }),
      /* Die Startseite liest nur die Radar-Projektion (Kennzahlen und
         erste Karten, ~3 KB); der ganze Radar (bis 211 KB, gemessen
         03.10.2026) bleibt der Radar-Seite. */
      null, ctx.api.getMarketRegime().catch(function () { return null; }),
      ctx.api.getStrategyProfiles().catch(function () { return null; }), screeningRows(ctx),
      ctx.api.getQuantRadarHome().catch(function () { return null; })]);
    /* Die Abrufe laufen schon; abgewartet werden zuerst die Voraussetzungen des Zeichnens. */
    await Promise.all([ctx.loadNames(), ctx.loadBacktestView()]);
    var r = await dataP;
    var setupIdx = r[0], stratIdx = r[1], regime = r[3], profiles = r[4], rowBy = r[5], radarState = r[6];
    var tiles = [], sections = [];
    var open = function (st) { return st && st.availability && st.availability.state === "AVAILABLE" && typeof st.count === "number"; };
    if (setupIdx && setupIdx.state === "AVAILABLE") {
      /* Nur offene Stufen tragen eine Zahl; eine geschlossene hat count null. */
      var conf = setupIdx.states.filter(function (st) { return st.state === "CONFIRMED" && open(st); })[0], form = setupIdx.states.filter(function (st) { return st.state === "SETUP_FORMING" && open(st); })[0];
      tiles.push(X.stat("Bestätigte Setups gesamt", (conf ? conf.count : 0).toLocaleString("de-DE"), (form ? "bei weiteren " + form.count.toLocaleString("de-DE") + " entsteht eines · " : "") + "Stand " + X.dateDe(setupIdx.asOf)));
    }
    if (stratIdx && stratIdx.state === "AVAILABLE" && stratIdx.historicalEvidence && stratIdx.historicalEvidence.transitions) {
      var labels = {}; ((profiles && profiles.contract && profiles.contract.profiles) || stratIdx.profiles || []).forEach(function (p) { labels[p.profileId] = p.label; });
      var he = stratIdx.historicalEvidence;
      var entered = he.transitions.filter(function (t) { return t.entered && t.entered.length; });
      var total = entered.reduce(function (n, t) { return n + t.entered.length; }, 0);

      entered.slice().sort(function (a, b) { return b.entered.length - a.entered.length; }).forEach(function (t, i) {
        var label = (labels[t.profileId] || t.profileId).split(" · ")[0];
        var list = ctx.commonFirst(t.entered);
        /* Eine Reihe je Strategie - das Datum steht EINMAL im Kopf. */
        if (i < 3) sections.push(X.world("Neu in „" + label + "“", t.entered.length + (t.entered.length === 1 ? " Aktie erfüllt" : " Aktien erfüllen") + " seit dem Stand vom " + X.dateDe(he.to) + " neu alle Bedingungen (vorher " + X.dateDe(he.from) + ")" +
          (t.exited && t.exited.length ? "; " + t.exited.length + (t.exited.length === 1 ? " ist" : " sind") + " herausgefallen" : "") + ".", [X.rail(list.slice(0, 14).map(function (tk) {
          /* Logos nur in "Heute interessant" - in den Schienen darunter die
             Buchstaben-Marke, sonst sprengen die Bilder das Anfragebudget. */
          return quantPoster(ctx, tk, rowBy, { story: "Erfüllt jetzt alle Bedingungen", initialOnly: true });
        }), "Neu in " + label)], { href: X.routes.strategy(t.profileId), label: "Strategie ansehen" }));
      });
    }
    if (regime && regime.state === "AVAILABLE") {
      var above = (regime.measures || []).filter(function (m) { return m.id === "above200"; })[0];
      tiles.push(X.stat("Marktlage", REGIME[regime.regime] || "Marktlage", (above ? Math.round(above.share * 100) + " % über der 200-Tage-Linie · " : "") + "Stand " + X.dateDe(regime.asOf)));
    }
    if (radarState && radarState.state === "AVAILABLE") {
      tiles = radarSummary(radarState).concat(tiles);
      radarHost.replaceChildren.apply(radarHost, radarState.cards.slice(0, 4).map(function (c) { return radarCard(ctx, c, { logo: true, compact: true }); }));
      var proof = proofCard(radarState);
      if (proof) proofHost.replaceChildren(proof);
      /* Beobachtete Aktien: was der Radar fuer sie meldet. Watchlist ist
         keine Depotverwaltung - nur "zeig mir, wenn sich hier etwas tut". */
      var watchedList = X.watch.list();
      if (watchedList.length) {
        var hits = await ctx.api.getRadarCards(watchedList).catch(function () { return []; });
        watchHost.replaceChildren(X.world("Deine beobachteten Aktien", hits.length ? hits.length + " von " + watchedList.length + " beobachteten Aktien melden eine Veränderung." : "Bei deinen " + watchedList.length + " beobachteten Aktien hat sich zum letzten Stand nichts geändert.",
          hits.length ? [el("div", { class: "q-radar-grid" }, hits.slice(0, 6).map(function (c) { return radarCard(ctx, c, { compact: true }); }))] : [], { href: X.routes.radar("filter=beobachtet"), label: "Alle beobachteten" }));
      }
    } else radarHost.replaceChildren(X.notice("Radar derzeit nicht verfügbar", "Der aktuelle Radar-Stand konnte nicht geladen werden. Suche und Screener funktionieren weiterhin."));;
    kpis.replaceChildren.apply(kpis, tiles.length ? tiles : [X.notice("Gerade keine Veränderungen abrufbar", "Die aktuellen Stände konnten nicht geladen werden. Suche und Screener funktionieren weiterhin.")]);
    rails.replaceChildren.apply(rails, sections);
  }

  /* ============================================================ SCREENER */
  var QUESTIONS = [
    { id: "qualitaet", chip: "Qualität", title: "Ich suche starke Qualitätsunternehmen", hint: "Profitabel und mit belastbarer Bilanz", factors: ["profitability", "quality"],
      sentence: "Du suchst Aktien, die profitabel sind und eine belastbare Bilanz haben." },
    { id: "momentum", chip: "Momentum", title: "Ich suche Aktien mit Momentum", hint: "Kurs läuft stark, auch gegenüber dem Markt", factors: ["momentum"],
      sentence: "Du suchst Aktien mit starker Kursentwicklung." },
    { id: "wachstum-qualitaet", chip: "Wachstum + Qualität", title: "Ich suche Wachstum + Qualität", hint: "Wächst kräftig und verdient gut", factors: ["growth", "profitability"],
      sentence: "Du suchst wachsende Unternehmen, die dabei gut verdienen." },
    { id: "guenstig", chip: "Günstig bewertet", title: "Ich suche günstig bewertete Aktien", hint: "Viel Gewinn und Substanz für den Preis", factors: ["value"],
      sentence: "Du suchst Aktien, die im Verhältnis zu Gewinn und Substanz günstig sind." },
    { id: "ruhig", chip: "Ruhige Aktien", title: "Ich suche ruhige Aktien", hint: "Geringe Schwankung, kleine Rückschläge", factors: ["risk"],
      sentence: "Du suchst Aktien mit ruhigem Kursverlauf." },
    { id: "setups", chip: "Setups", title: "Ich suche neue Setups", hint: "Bestätigt oder gerade im Aufbau", setups: true,
      sentence: "Du suchst Aktien, bei denen sich im Kursbild ein Setup zeigt." },
    { id: "hoch", chip: "Nahe 52-Wochen-Hoch", title: "Ich suche Aktien nahe am 52-Wochen-Hoch", hint: "Höchstens 3 % unter dem Jahreshoch", high: true,
      sentence: "Du suchst Aktien, die höchstens 3 % unter ihrem 52-Wochen-Hoch stehen." }
  ];
  /* Dieselbe Schwelle wie bisher im einfachen Screener (70): stark heisst
     hier "Wert 70 oder mehr" - fuer jede Frage gleich, nicht angepasst,
     damit eine Frage mehr Treffer liefert. */
  var SIMPLE_THRESHOLD = 70;
  /* Redesign 2027 (Folie Q02): Schnellwahl als Fragekarten (Alltagsfrage + Fachname), „Deine Frage“ als Satz mit Regel. */
  /* Konzept Quant 2026-11 (QX03, Screen q-screener): Fragen als Chips, „Deine Frage“ als kurzer Satz mit Regel-Chips. */
  var ASK_Q = { qualitaet: ["Verdient gut, solide Zahlen", "Verdient gut + Zahlen solide"], momentum: ["Kurs läuft besser als der Markt", "Kurs läuft"], "wachstum-qualitaet": ["Wächst und verdient", "Wächst + Verdient gut"],
    guenstig: ["Eher günstig", "Günstig"], ruhig: ["Ruhiger Kurs", "Ruhiger Kurs"], setups: ["Setup im Chart", "Setups"], hoch: ["Nahe am Jahreshoch", "52-Wochen-Hoch"] };
  var ASK_SENT = { qualitaet: "Verdient gut und hat solide Zahlen", momentum: "Der Kurs läuft besser als der Markt", "wachstum-qualitaet": "Wächst und verdient dabei gut",
    guenstig: "Ist im Verhältnis zu Gewinn und Substanz günstig", ruhig: "Hat einen ruhigen Kurs", setups: "Der Chart zeigt ein Setup", hoch: "Steht höchstens 3 % unter dem Jahreshoch" };
  var FACTOR_SHORT = { profitability: "Verdient gut", quality: "Zahlen solide", growth: "Wächst", momentum: "Kurs läuft", value: "Günstig", risk: "Ruhiger Kurs", revisions: "Analysten" };
  function ruleLine(factors, min, max) { return factors.map(function (id) { return (FACTOR_SHORT[id] || shortName(id)) + " ≥ " + min + (max < 100 ? " und ≤ " + max : ""); }).join(" · "); }
  function shortWhy(row, factorIds) { return factorIds.map(function (id) { var v = row && row[FIELD(id)]; return (FACTOR_SHORT[id] || shortName(id)) + " " + (typeof v === "number" ? Math.round(v) : "–"); }).join(" · "); }

  /* Stufe neben dem Wert: die gezaehlte Position unter allen bewerteten
     Aktien (factor-band-2.0.0), aus derselben Verteilung wie die Aktienseite. */
  function screeningWhy(row, factorIds, dist) {
    return factorIds.map(function (id) {
      var v = row[FIELD(id)];
      return VM.FACTORS[id].name + ": " + (typeof v === "number" ? VM.factorLabel(id, v, dist ? VM.positionIn(dist[id], v) : null).toLowerCase() : "ohne Wert");
    }).join(" · ");
  }
  function distOrNull(ctx) { return ctx.distributionRows ? ctx.distributionRows().catch(function () { return null; }) : Promise.resolve(null); }

  /* Die Filter-Chips der Screener-Tafel. Nur, was Quant misst, ist
     waehlbar; Erwartungstrend und Sentiment stehen da, sind aber ohne Datenbasis
     und deshalb gesperrt - mit dem Grund am Chip. */
  var FILTER_CHIPS = [
    { id: "profitability", label: "Verdient gut" }, { id: "growth", label: "Wächst" }, { id: "quality", label: "Zahlen solide" },
    { id: "momentum", label: "Kurs läuft" }, { id: "value", label: "Günstig" }, { id: "risk", label: "Ruhiger Kurs" },
    { id: "revisions", label: "Analysten", off: "Für „Analysten“ (Erwartungstrend) gibt es keine lizenzierte, zeitpunktgenaue Datenquelle." },
    { id: "sentiment", label: "Sentiment", off: "Quant verwendet keine Sentiment-Daten." }
  ];
  function shortName(id) { var c = FILTER_CHIPS.filter(function (x) { return x.id === id; })[0]; return c ? c.label : (VM.FACTORS[id] ? VM.FACTORS[id].name : id); }

  async function screener(main, ctx, params, pro) {
    if (global.VUUI && !pro) {
      main.append(el("header", { class: "qv3-intro qv3-pad" }, [el("p", { class: "vu-ltag", text: "Quant Screener" }), el("h1", { class: "vu-lt", text: "Welche Aktien suchst du?" }),
        el("nav", { class: "vu-seg qv3-mode", "aria-label": "Screener-Modus" }, [el("a", { href: X.routes.screener(), "aria-current": "page", text: "Einfach" }), el("a", { href: X.routes.screenerPro(), text: "Profi" })])]));
    } else main.append(el("header", { class: "q-hero q-hero--screener" }, [
      X.globe(),
      el("p", { class: "q-kicker", text: "Vision Universe Quant" }),
      el("h1", { class: "qx-h1", text: pro ? "Quant Screener · Profi" : "Quant Screener" }),
      el("p", { class: "q-hero-lead v2-lead qx-lead", text: pro ? "Alle Kennzahlen und Faktoren, frei kombinierbar. Jede Regel ist sichtbar und teilbar." : "Finde datenbasierte Ideen. Prüfe, warum eine Aktie dabei ist. Nutze sie direkt für deine Analyse." }),
      el("p", { class: "q-note-line qx-small" }, [el("span", { text: "Der Screener findet Aktien nach deinen Bedingungen. Was sich gerade verändert, meldet der " }), el("a", { href: X.routes.radar(), text: "Radar" }), el("span", { text: "." })]),
      el("nav", { class: "qx-mode", "aria-label": "Screener-Modus" }, [
        el("a", { href: X.routes.screener(), "aria-current": pro ? null : "page", text: "Einfach" }),
        el("a", { href: X.routes.screenerPro(), "aria-current": pro ? "page" : null, text: "Profi" })])
    ]));
    if (pro) return screenerPro(main, ctx, params);
    if (global.VUUI) main.classList.add("qk");

    /* Die Fragen der ersten Fassung sind die Schnellwahl-Chips; jede setzt
       Faktoren und Schwelle. Eigene Filter entstehen aus den Faktor-Chips
       und dem Wertebereich. */
    var chosen = QUESTIONS.filter(function (q) { return q.id === params.get("frage"); })[0] || (params.get("faktoren") ? null : QUESTIONS[0]);
    var sel = { factors: chosen && chosen.factors ? chosen.factors.slice() : (params.get("faktoren") || "momentum").split(",").filter(function (id) { return VM.FACTORS[id]; }),
      min: Number(params.get("min")) || SIMPLE_THRESHOLD, max: Number(params.get("max")) || 100 };
    if (!sel.factors.length) sel.factors = ["momentum"];
    var list = el("div", { class: global.VUUI ? "vu-chips qk-chips qk-ask" : "qx-questions", role: "group", "aria-label": "Fragen" });
    QUESTIONS.forEach(function (q) {
      var ask = ASK_Q[q.id] || [q.chip, q.hint];
      if (global.VUUI) { list.append(el("button", { type: "button", class: "vu-chip", "aria-pressed": q === chosen ? "true" : "false", dataset: { question: q.id }, title: ask[1], text: ask[0],
        onclick: function () { history.replaceState(null, "", X.routes.screener("frage=" + q.id)); chosen = q; if (q.factors) { sel.factors = q.factors.slice(); sel.min = SIMPLE_THRESHOLD; sel.max = 100; } sync(); run(); } })); return; }
      list.append(el("button", { type: "button", class: "qx-question", "aria-pressed": q === chosen ? "true" : "false", dataset: { question: q.id }, title: q.hint,
        onclick: function () { history.replaceState(null, "", X.routes.screener("frage=" + q.id)); chosen = q; if (q.factors) { sel.factors = q.factors.slice(); sel.min = SIMPLE_THRESHOLD; sel.max = 100; } sync(); run(); } },
        [el("strong", { text: ask[0] }), el("span", { text: ask[1] }), el("i", { class: "qx-q-mark", "aria-hidden": "true" })]));
    });
    /* Faktor-Filter */
    var chipsHost = el("div", { class: "q-chips", role: "group", "aria-label": "Faktoren" });
    FILTER_CHIPS.forEach(function (c) {
      var b = el("button", { type: "button", class: "q-chip" + (c.off ? " is-off" : ""), dataset: { factor: c.id }, "aria-pressed": "false", disabled: c.off ? true : null, title: c.off || null, text: c.label });
      if (!c.off) b.addEventListener("click", function () {
        var i = sel.factors.indexOf(c.id);
        if (i >= 0 && sel.factors.length > 1) sel.factors.splice(i, 1); else if (i < 0) sel.factors.push(c.id);
        chosen = null; custom(); });
      chipsHost.append(b);
    });
    var minIn = el("input", { type: "range", min: "0", max: "100", step: "5", "aria-label": "Mindestwert" });
    var maxIn = el("input", { type: "range", min: "0", max: "100", step: "5", "aria-label": "Höchstwert" });
    var fill = el("span", { class: "q-range-fill" }), rangeText = el("b");
    function onRange(which) {
      var a = Number(minIn.value), b = Number(maxIn.value);
      if (a > b) { if (which === "min") maxIn.value = String(a); else minIn.value = String(b); }
      sel.min = Number(minIn.value); sel.max = Number(maxIn.value); chosen = null; drawRange();
    }
    minIn.addEventListener("input", function () { onRange("min"); }); maxIn.addEventListener("input", function () { onRange("max"); });
    minIn.addEventListener("change", custom); maxIn.addEventListener("change", custom);
    function drawRange() { fill.style.left = sel.min + "%"; fill.style.width = (sel.max - sel.min) + "%"; rangeText.textContent = "Min. " + sel.min + " – Max. " + sel.max; }
    /* VU3: Schnellwahl und Treffer zuerst; der Faktor-Filter (eigene Bedingungen) steht hinter einer Aufklappzeile -
       offen, wenn die Adresse eigene Bedingungen traegt. Das Ergebnis selbst liegt nie in einem Aufklapper. */
    var panel = el("details", { class: "qx-more q-filter-more" }, [el("summary", {}, [el("span", { text: "Eigene Bedingung" }), el("small", { class: "qx-own-hint", text: "z. B. Wachstum ab 70" })]), el("section", { class: "q-filter", "aria-label": "Faktor-Filter" }, [
      el("h3", {}, [el("span", { text: "Faktor-Filter" }), el("a", { href: X.routes.method("faktoren"), text: "Alle Faktoren →" })]),
      chipsHost,
      el("div", { class: "q-range" }, [el("div", { class: "q-range-head" }, [el("span", { text: "Wertebereich (0–100) je gewählter Eigenschaft" }), rangeText]),
        el("div", { class: "q-range-track" }, [fill, minIn, maxIn]), el("div", { class: "q-range-ends" }, [el("span", { text: "0" }), el("span", { text: "100" })]),
        el("div", { class: "q-selects" }, [
          el("label", {}, [el("span", { text: "Region" }), el("select", { disabled: true, "aria-label": "Region" }, [el("option", { text: "USA" })])]),
          el("label", {}, [el("span", { text: "Universum" }), el("select", { disabled: true, "aria-label": "Universum" }, [el("option", { text: "US-Aktien" })])]),
          el("label", {}, [el("span", { text: "Stand" }), el("select", { disabled: true, "aria-label": "Stand" }, [el("option", { text: "letzter Lauf" })])])])]),
      el("div", { class: "q-filter-foot" }, [el("span", { class: "qx-small", style: "margin:0", text: "Quant prüft US-Aktien; Region und Universum sind deshalb fest." }),
        el("a", { class: "q-toggle", href: X.routes.screenerPro() }, [el("i", { "aria-hidden": "true" }), el("span", { text: "Pro Modus einschalten" })])])
    ])]);
    function syncChips() { chipsHost.querySelectorAll("button[data-factor]").forEach(function (b) { b.setAttribute("aria-pressed", sel.factors.indexOf(b.dataset.factor) >= 0 ? "true" : "false"); }); minIn.value = String(sel.min); maxIn.value = String(sel.max); drawRange(); }
    function sync() { list.querySelectorAll("button[data-question]").forEach(function (b) { b.setAttribute("aria-pressed", chosen && b.dataset.question === chosen.id ? "true" : "false"); }); if (own) own.setAttribute("aria-pressed", chosen ? "false" : "true"); syncChips(); }
    function custom() {
      history.replaceState(null, "", X.routes.screener("faktoren=" + sel.factors.join(",") + "&min=" + sel.min + "&max=" + sel.max));
      sync(); run();
    }
    var sentenceText = el("p", { class: "qx-sentence", "aria-live": "polite" });
    var sentenceBox = el("div", { class: "vu-box vu-box--lime qv3-ask" }, [el("p", { class: "vu-ltag", text: "Deine Frage" }), sentenceText, el("div", { class: "qv3-ask-rule qk-rcs" })]);
    var sentence = global.VUUI ? sentenceBox : sentenceText;
    var out = el("div", { "aria-live": "polite" });
    var results = el("section", { class: "q-results", "aria-label": "Ergebnisse" }, [out]);
    panel.open = !chosen;
    /* Redesign 2027 (q02-c): „Eigene Bedingung“ öffnet ein Sheet mit den sechs Fragen, Schwelle ab 50/70/90 oder eigener Wert
       und der Trefferzahl auf dem Knopf. Dieselbe Auswertung wie der Faktor-Filter (factorHits). */
    var own = null;
    if (global.VUUI) {
      var U3 = global.VUUI, OWN = [["growth", "Wächst die Firma?"], ["profitability", "Verdient sie gut?"], ["value", "Ist sie günstig?"], ["momentum", "Läuft der Kurs gut?"], ["risk", "Wie ruhig ist der Kurs?"], ["quality", "Sind die Zahlen solide?"]];
      var tmp = { factors: [], min: 70 };
      var shEl = document.createElement("div"); shEl.innerHTML = U3.sheet("qv3-own-sheet", "Eigene Bedingung", '<p class="vu-sm vu-mu" style="margin:-4px 0 8px">Welche Eigenschaft soll stark sein?</p><div data-q></div><div data-seg></div><button type="button" class="vu-btn vu-btn--block" data-go style="margin-top:14px">Hinzufügen</button>');
      var sheetEl = shEl.firstElementChild; document.body.append(sheetEl);
      global.addEventListener("hashchange", function off() { sheetEl.remove(); global.removeEventListener("hashchange", off); });
      sheetEl.querySelector("[data-close]") && sheetEl.querySelector("[data-close]").addEventListener("click", function () { U3.closeSheet(sheetEl); });
      var qHost = sheetEl.querySelector("[data-q]"), segHost = sheetEl.querySelector("[data-seg]"), go = sheetEl.querySelector("[data-go]");
      var cnt = 0;
      async function countOwn() {
        var mine = ++cnt;
        if (!tmp.factors.length) { go.disabled = true; go.textContent = "Eigenschaft wählen"; return; }
        go.disabled = false; go.textContent = "Hinzufügen · …";
        var r = await factorHits(ctx, tmp.factors, tmp.min, 100).catch(function () { return null; });
        if (mine !== cnt) return;
        go.textContent = r && !r.error ? "Hinzufügen · " + (r.total || r.rows.length).toLocaleString("de-DE") + " Treffer" : "Hinzufügen";
      }
      function paintOwn() {
        qHost.replaceChildren.apply(qHost, OWN.map(function (o) {
          var on = tmp.factors.indexOf(o[0]) >= 0, b = el("button", { type: "button", class: "qv3-li qv3-li-btn", "aria-pressed": on ? "true" : "false" }, [el("span", {}, [el("b", { class: "vu-sm", text: o[1] }), el("span", { class: "vu-xs vu-mu", text: VM.FACTORS[o[0]] ? VM.FACTORS[o[0]].name : o[0] })])]);
          b.insertAdjacentHTML("beforeend", on ? '<span class="vu-chip vu-chip--lime qv3-own-on">ab ' + tmp.min + "</span>" : U3.glyph("plus", 18));
          b.addEventListener("click", function () { var i = tmp.factors.indexOf(o[0]); if (i >= 0) tmp.factors.splice(i, 1); else tmp.factors.push(o[0]); paintOwn(); countOwn(); });
          return b;
        }).concat([el("div", { class: "qv3-li is-off" }, [el("span", {}, [el("b", { class: "vu-sm", text: "Heben Analysten Schätzungen an?" }), el("span", { class: "vu-xs vu-mu", text: "Analysten · heute keine Daten" })])])]));
        var seg = el("div", { class: "vu-seg", role: "group", "aria-label": "Schwelle", style: "margin-top:10px" });
        [50, 70, 90].forEach(function (v) { seg.append(el("button", { type: "button", "aria-pressed": tmp.min === v ? "true" : "false", text: "ab " + v, onclick: function () { tmp.min = v; paintOwn(); countOwn(); } })); });
        var custom3 = el("input", { type: "number", min: "0", max: "100", step: "1", inputmode: "numeric", "aria-label": "Eigener Wert", placeholder: "eigener Wert", value: [50, 70, 90].indexOf(tmp.min) < 0 ? String(tmp.min) : "" });
        custom3.addEventListener("change", function () { var v = Math.max(0, Math.min(100, Math.round(Number(custom3.value)))); if (isFinite(v)) { tmp.min = v; paintOwn(); countOwn(); } });
        seg.append(custom3);
        segHost.replaceChildren(seg);
      }
      go.addEventListener("click", function () { if (!tmp.factors.length) return; sel.factors = tmp.factors.slice(); sel.min = tmp.min; sel.max = 100; chosen = null; U3.closeSheet(sheetEl); custom(); });
      own = el("button", { type: "button", class: "vu-chip qk-own", "aria-pressed": "false", title: "z. B. Wächst ab 70" });
      own.innerHTML = U3.glyph("plus", 15) + "Eigene Bedingung";
      own.addEventListener("click", function () { tmp = { factors: chosen ? [] : sel.factors.slice(), min: chosen ? 70 : sel.min }; paintOwn(); countOwn(); U3.openSheet(sheetEl); });
      panel = own;
    }
    if (global.VUUI) { list.append(own); main.append(list, sentence, results); }
    else main.append(el("p", { class: "q-kicker", style: "margin-top:20px", text: "Schnellwahl" }), list, panel, sentence, results);
    var rowByP = global.VUUI ? screeningRows(ctx) : null;
    var run_id = 0;
    async function run() {
      var mine = ++run_id, q = chosen;
      sentenceText.textContent = global.VUUI ? (q ? ASK_SENT[q.id] || q.sentence : sel.factors.map(function (id) { return FACTOR_SHORT[id] || shortName(id); }).join(" und ") + (sel.max < 100 ? " zwischen " + sel.min + " und " + sel.max : " ab " + sel.min))
        : q ? q.sentence : "Du suchst Aktien mit " + sel.factors.map(shortName).join(" und ") + " zwischen " + sel.min + " und " + sel.max + " von 100.";
      var ruleNode = sentenceBox.querySelector(".qv3-ask-rule");
      ruleNode.textContent = q && q.setups ? "Setup bestätigt oder im Aufbau" : q && q.high ? "Abstand zum 52-Wochen-Hoch ≤ 3 %" : ruleLine(sel.factors, sel.min, sel.max);
      out.replaceChildren(X.loading("Wird gesucht …"));
      var result;
      try {
        if (q && q.setups) result = await setupHits(ctx);
        else if (q && q.high) result = await highHits(ctx);
        else result = await factorHits(ctx, sel.factors, sel.min, sel.max);
      } catch (e) { result = { error: true }; }
      if (mine !== run_id) return;
      if (result.error) { out.replaceChildren(X.notice("Treffer derzeit nicht verfügbar", "Die Auswertung konnte nicht geladen werden. Bitte versuche es erneut.")); return; }
      var total = result.total || result.rows.length;
      if (global.VUUI) { await drawV4(result, total, q, await rowByP); return; }
      var FIRST = global.VUUI ? 10 : 40, shown = el("div", { class: "qx-list" }, result.rows.slice(0, FIRST));
      var moreBtn = result.rows.length > FIRST ? el("button", { type: "button", class: "vu-btn vu-btn--line vu-btn--block qv3-all", text: "Alle " + Math.min(total, result.rows.length).toLocaleString("de-DE") + " zeigen",
        onclick: function () { shown.append.apply(shown, result.rows.slice(FIRST)); moreBtn.remove(); } }) : null;
      X.fill(out, el("div", { class: "q-results-head" }, [el("b", { text: total.toLocaleString("de-DE") + (global.VUUI ? " Treffer" : " Ergebnisse") }), el("span", { text: global.VUUI ? "Sortiert: " + (result.sortLabel || "Nach Wert").replace(/^Nach /, "") : result.sortLabel || "Nach Wert" })]),
        el("p", { class: "qx-count", text: result.summary }),
        result.rows.length ? shown : X.notice("Keine Treffer", "Heute erfüllt keine Aktie alle Bedingungen dieser Auswahl."),
        moreBtn,
        result.rows.length > 400 && total > result.rows.length ? el("p", { class: "qx-small", text: "Im Profi-Modus lassen sich alle " + total.toLocaleString("de-DE") + " Treffer sortieren und weiter eingrenzen." }) : null,
        global.VUUI ? (function () { var h = document.createElement("div"); h.className = "qv3-help"; h.innerHTML = global.VUUI.help(result.method); return h; })() : el("p", { class: "qx-small", text: result.method }),
        X.actions([X.btn("Im Profi-Modus verfeinern", X.routes.screenerPro(result.query ? "query=" + encodeURIComponent(global.VUScreenerWorkspace.encode(result.query)) : ""), "secondary")]));
    }
    /* QX03: Trefferzeile mit Profil klein und der gesuchten Zahl, Legende, „Alle N zeigen“, „Im Profi-Modus verfeinern“. */
    async function drawV4(result, total, q, rowBy) {
      var U4 = global.VUUI, FIRST = 7, items = result.items || [];
      var ruleNode = sentenceBox.querySelector(".qv3-ask-rule");
      ruleNode.innerHTML = (result.rule || []).map(function (r) { return typeof r === "string" ? '<span class="qk-rc">' + U4.glyph("check", 13) + U4.esc(r) + "</span>" : ruleChip({ id: r.id, value: r.max < 100 ? r.value + "–" + r.max : r.value }); }).join("");
      var head = '<div class="qk-rh qk-hits"><div class="qk-rh-t"><h2>' + total.toLocaleString("de-DE") + ' Treffer</h2><span class="vu-xs vu-mu qk-sort">Sortiert: ' + U4.esc(String(result.sortLabel || "Nach Wert").replace(/^Nach /, "")) + "</span></div></div>";
      var rows = function (a) { return a.map(function (it) { return qRow(ctx, rowBy, it.ticker, it.sub, it.right); }).join(""); };
      out.innerHTML = head + (items.length ? '<div class="qk-hitlist">' + rows(items.slice(0, FIRST)) + "</div>" + U4.profileLegend() : U4.blank("Heute erfüllt keine Aktie alle Bedingungen dieser Frage."));
      var hitlist = out.querySelector(".qk-hitlist");
      if (items.length > FIRST) {
        var all = el("button", { type: "button", class: "vu-btn vu-btn--line vu-btn--block qk-more", text: "Alle " + Math.min(total, items.length).toLocaleString("de-DE") + " zeigen" });
        all.addEventListener("click", function () { hitlist.insertAdjacentHTML("beforeend", rows(items.slice(FIRST))); all.remove(); });
        out.append(all);
      }
      out.append(el("a", { class: "vu-btn vu-btn--ink vu-btn--block qk-pro", href: X.routes.screenerPro(result.query ? "query=" + encodeURIComponent(global.VUScreenerWorkspace.encode(result.query)) : ""), text: "Im Profi-Modus verfeinern" }));
      var help = el("div", { class: "qk-help" }); help.innerHTML = U4.help(result.summary + " " + result.method); out.append(help);
    }
    sync(); await run();
  }

  var strategyByTicker = null;
  function strategyLabels(ctx) {
    if (!strategyByTicker) strategyByTicker = Promise.all([ctx.api.getStrategyIndex().catch(function () { return null; }), ctx.api.getStrategyProfiles().catch(function () { return null; })]).then(function (r) {
      var labels = {}, by = {};
      ((r[1] && r[1].contract && r[1].contract.profiles) || []).forEach(function (p) { labels[p.profileId] = p.label.split(" · ")[0]; });
      ((r[0] && r[0].profiles) || []).forEach(function (p) { (p.tickers || []).forEach(function (t) { if (!by[t]) by[t] = labels[p.profileId] || p.profileId; }); });
      return by;
    }).catch(function () { return {}; });
    return strategyByTicker;
  }

  async function factorHits(ctx, factors, min, max) {
    var W = global.VUScreenerWorkspace;
    var filters = factors.map(function (id) { return { field: FIELD(id), operator: "gte", value: min, scale: "raw" }; });
    if (max < 100) factors.forEach(function (id) { filters.push({ field: FIELD(id), operator: "lte", value: max, scale: "raw" }); });
    var sortBy = [{ field: FIELD(factors[0]), direction: "desc" }];
    var query = W.build(filters, sortBy);
    /* Dieselbe Abfrage, nur mit dem groessten zulaessigen Limit: der
       Editor begrenzt auf 50, die Frage soll alle Treffer zaehlen. */
    var wide = global.VUQuery.createQuery({ filters: filters, sort: sortBy, limit: global.VUQuery.MAX_LIMIT || 500 });
    var r = await Promise.all([ctx.api.screen(wide), strategyLabels(ctx), distOrNull(ctx)]);
    var res = r[0], strat = r[1], dist = r[2];
    if (!res || res.state !== "AVAILABLE") return { error: true };
    var second = factors[1] || (factors[0] === "quality" ? "profitability" : "quality");
    var items = (res.stocks || []).map(function (s) {
      var val = s.evidence && s.evidence[FIELD(factors[0])], v2 = s.evidence && s.evidence[FIELD(second)];
      return { ticker: s.ticker, name: X.companyName(s), evidence: s.evidence, sub: s.ticker + " · " + FACTOR_SHORT[second] + " " + (typeof v2 === "number" ? Math.round(v2) : "–"), right: global.VUUI ? scoreP(val, FACTOR_SHORT[factors[0]].split(" ")[0]) : "" };
    });
    var rows = (res.stocks || []).map(function (s, i) {
      var v = VM.fromScreeningRow(s.evidence, dist), val = s.evidence && s.evidence[FIELD(factors[0])];
      return X.stockRow({ ticker: s.ticker, name: X.companyName(s), kicker: strat[s.ticker] || null, why: global.VUUI ? shortWhy(s.evidence, factors.length > 1 ? factors : factors.concat(factors[0] === "quality" ? [] : ["quality"])) : screeningWhy(s.evidence, factors, dist), withLogo: !global.VUUI && i < 8,
        score: { label: shortName(factors[0]), value: typeof val === "number" ? Math.round(val) : null, tone: typeof val === "number" && dist ? VM.factorView({ id: factors[0], state: "AVAILABLE", score: val, position: VM.positionIn(dist[factors[0]], val), components: [] }).tone : null },
        profile: global.VUUI ? VM.profileValues(s.evidence) : null,
        verdict: !global.VUUI && v && v.overall.id !== "KEINE_DATEN" ? { text: "Eigenschaften: " + v.overall.count, tone: "neutral" } : null });
    });
    /* Die Zahl der Treffer wird gezaehlt, nicht aus der begrenzten Liste
       abgelesen: dieselben veroeffentlichten Faktorwerte, dieselbe Regel. */
    var total = rows.length;
    if (rows.length >= (global.VUQuery.MAX_LIMIT || 500)) {
      var scr = await ctx.api.getFactorEvidenceScreening().catch(function () { return null; });
      if (scr && scr.state === "AVAILABLE") total = scr.rows.filter(function (row) { return factors.every(function (id) { var v = row[FIELD(id)]; return typeof v === "number" && v >= min && v <= max; }); }).length;
    }
    var names = factors.map(function (id) { return VM.FACTORS[id].name; }).join(" und ");
    return { rows: rows, items: items, total: total, query: query, sortLabel: "Nach " + shortName(factors[0]), rule: factors.map(function (id) { return { id: id, value: min, max: max }; }),
      summary: total.toLocaleString("de-DE") + " von " + (res.eligible || 0).toLocaleString("de-DE") + " bewerteten Aktien erfüllen das · Stand " + X.dateDe(res.asOf) + ".",
      method: (min === SIMPLE_THRESHOLD && max === 100 ? "Gesucht wird ein Wert von 70 oder mehr (von 100) in " + names + " – eine feste Schwelle auf den Wert. Die Stufe neben jeder Aktie („stark“, „sehr stark“ …) ist dagegen ihre Position unter allen bewerteten Aktien." : "Gefiltert: Wert zwischen " + min + " und " + max + " (von 100) in " + names + ".") +
        " Sortiert nach " + VM.FACTORS[factors[0]].name + "; der Wert rechts ist dieser eine Faktor, keine Gesamtnote. Die Zeile nennt dazu die Gesamteinordnung aus allen gemessenen Eigenschaften – eine Aktie kann in der gesuchten Eigenschaft stark und insgesamt gemischt sein." };
  }
  async function setupHits(ctx) {
    var idx = await ctx.api.getSetupScreenIndex();
    if (!idx || idx.state !== "AVAILABLE") return { error: true };
    var rows = [], items = [], count = 0;
    ["CONFIRMED", "SETUP_FORMING"].forEach(function (state) {
      var st = idx.states.filter(function (s) { return s.state === state; })[0];
      if (!st) return;
      st.rules.forEach(function (rule) {
        (rule.tickers || []).forEach(function (t) {
          count++;
          if (rows.length < 400) { rows.push(X.stockRow({ ticker: t, name: nameOf(ctx, t), why: rule.plain, pill: { text: VM.setupLabel(state), tone: state === "CONFIRMED" ? "good" : "neutral" } }));
            items.push({ ticker: t, sub: t + " · " + VM.setupLabel(state), right: global.VUUI ? global.VUUI.verdict(state === "CONFIRMED" ? "strong" : "mid", state === "CONFIRMED" ? "Bestätigt" : "Entsteht") : "" }); }
        });
      });
    });
    return { rows: rows, items: items, total: count, sortLabel: "Bestätigt zuerst", rule: ["Setup bestätigt oder im Aufbau"], summary: count.toLocaleString("de-DE") + " Aktien mit bestätigtem oder entstehendem Setup · Stand " + X.dateDe(idx.asOf) + ".",
      method: "Setups folgen der freigegebenen Zuordnung " + idx.mappingVersion + ". Ein Setup beschreibt das Kursbild am Stichtag – kein Kursziel und keine Einstiegsregel." };
  }
  async function highHits(ctx) {
    var u = await ctx.api.getUniverse();
    if (!u || u.state !== "AVAILABLE") return { error: true };
    var measured = u.stocks.filter(function (s) { return s.distanceTo52wHigh && typeof s.distanceTo52wHigh.value === "number"; });
    var hits = measured.filter(function (s) { return s.distanceTo52wHigh.value >= -0.03; })
      .sort(function (a, b) { return b.distanceTo52wHigh.value - a.distanceTo52wHigh.value || (b.momentum6m && b.momentum6m.value || 0) - (a.momentum6m && a.momentum6m.value || 0); });
    var items = hits.map(function (s) { var d = s.distanceTo52wHigh.value; return { ticker: s.ticker, sub: s.ticker + " · " + (d >= -0.0005 ? "auf dem Jahreshoch" : VM.pct(-d, 1) + " darunter"), right: s.price && typeof s.price.value === "number" ? '<span class="qk-px"><b class="vu-num">' + X.money(s.price.value) + "</b><small>" + (s.price.asOf ? X.dateDe(s.price.asOf) : "") + "</small></span>" : "" }; });
    var rows = hits.map(function (s) {
      var d = s.distanceTo52wHigh.value;
      return X.stockRow({ ticker: s.ticker, name: X.companyName(s), why: d >= -0.0005 ? "Auf dem 52-Wochen-Hoch" : VM.pct(-d, 1) + " unter dem 52-Wochen-Hoch",
        side: s.price && typeof s.price.value === "number" ? X.money(s.price.value) : null, sideNote: s.price && s.price.asOf ? X.dateDe(s.price.asOf) : null });
    });
    return { rows: rows, items: items, sortLabel: "Nähe zum Hoch", rule: ["Höchstens 3 % unter dem Jahreshoch"], summary: rows.length.toLocaleString("de-DE") + " von " + measured.length.toLocaleString("de-DE") + " Aktien mit Kurshistorie stehen höchstens 3 % unter ihrem 52-Wochen-Hoch.",
      method: "Abstand des letzten Schlusskurses zum höchsten Tageskurs (Tageshoch) der letzten 52 Wochen (252 Handelstage), aus den split-bereinigten Tageskursen. Ein Jahreshoch beschreibt den bisherigen Verlauf – keine Prognose." };
  }

  /* Redesign 2027 (Folie Q02, q02-b): Profi dunkel. Je Eigenschaft ein Bereichsregler 0–100, Bedingung hinzufügen,
     Datenbasis, Sortierung, Regeln teilen, sortierbare Tabelle aller Treffer mit Spaltenwahl. Gleiche Abfrage wie bisher
     (VUScreenerWorkspace, Quant V2 Faktorevidenz): ein Bereich ist „mindestens“ plus „höchstens“. Andere Datenbasis
     (Quant V1 & Marktdaten) öffnet den bisherigen Regel-Editor (?daten=v1). */
  /* Ein Wort je Eigenschaft (Konzept Quant 2026-11, Entscheidung 1), in der Reihenfolge des Profils. */
  var PRO_F = [["profitability", "Verdient gut", "Verdient"], ["growth", "Wächst", "Wächst"], ["quality", "Zahlen solide", "Zahlen"],
    ["momentum", "Kurs läuft", "Kurs"], ["value", "Günstig", "Günstig"], ["risk", "Ruhiger Kurs", "Ruhiger"]];
  var PRO_ASK = { growth: "Wächst die Firma?", profitability: "Verdient sie gut?", risk: "Wie ruhig ist der Kurs?", momentum: "Läuft der Kurs gut?", value: "Ist sie günstig?", quality: "Sind die Zahlen solide?" };
  var PRO_COLS_KEY = "vu.quant.pro.cols.v1";
  async function screenerProV3(main, ctx, params) {
    var W = global.VUScreenerWorkspace, U = global.VUUI, api = ctx.api;
    var conds = [], sortF = null, sortDir = "desc";
    function dropHero() { var hero = main.querySelector(".q-hero--screener"); if (hero) hero.remove(); }
    if (params.get("query")) {
      var q; try { q = W.decode(params.get("query")); } catch (e) { return false; }
      if (q && (W.methodologyOf(q) || {}).id === "legacy") return false;
      (q.filters || []).forEach(function (f) {
        var id = String(f.field).replace("quantV2.factorEvidence.", ""), c = conds.filter(function (x) { return x.id === id; })[0];
        if (!PRO_ASK[id]) return;
        if (!c) { c = { id: id, lo: 0, hi: 100 }; conds.push(c); }
        if (f.operator === "gte" || f.operator === "gt") c.lo = Math.max(0, Math.min(100, Number(f.value) || 0));
        if (f.operator === "lte" || f.operator === "lt") c.hi = Math.max(0, Math.min(100, Number(f.value) || 0));
      });
      if (q.sort && q.sort[0]) { sortF = String(q.sort[0].field).replace("quantV2.factorEvidence.", ""); sortDir = q.sort[0].direction === "asc" ? "asc" : "desc"; }
    }
    var DEFAULT = function () { return [{ id: "profitability", lo: 70, hi: 100 }, { id: "quality", lo: 70, hi: 100 }]; };
    if (!conds.length) conds = DEFAULT();
    if (!sortF || !PRO_ASK[sortF]) sortF = conds[0].id;
    var cols; try { cols = JSON.parse(localStorage.getItem(PRO_COLS_KEY) || "null"); } catch (e) { cols = null; }
    if (!Array.isArray(cols) || !cols.length) cols = ["profitability", "quality", "growth", "momentum", "risk"];
    var nameOfF = function (id) { return (PRO_F.filter(function (f) { return f[0] === id; })[0] || [id, id, id]); };
    dropHero(); /* die dunkle Profi-Fläche trägt Titel und Umschalter selbst */
    /* Konzept Quant 2026-11 (QX03, Screen q-screener-pro, Entscheidung 8): Profi bleibt hell, Bedingungen als Chips,
       Tabellenkopf mit Symbol und Wort bleibt beim Scrollen stehen, Zellen ab 75 neongrün. */
    var page = el("div", { class: "vu-ui qv3 qv3-pro qk qk-pro-light" }), html = function (h) { var d = el("div"); d.innerHTML = h; return d.firstElementChild; };
    main.append(page);
    page.append(el("div", { class: "qv3-pro-head" }, [el("h1", { class: "qv3-pro-t", text: "Quant Screener" }), html(U.pro())]),
      el("nav", { class: "vu-seg qv3-mode", "aria-label": "Screener-Modus" }, [el("a", { href: X.routes.screener(), text: "Einfach" }), el("a", { href: X.routes.screenerPro(), "aria-current": "page", text: "Profi" })]));
    var head = el("div", { class: "qk-cond-h" }, [el("span", { class: "vu-ltag", text: "Bedingungen" })]), reset = el("button", { type: "button", class: "qv3-linkbtn", text: "Zurücksetzen" });
    head.append(reset);
    var condHost = el("div", { class: "qk-rcs qv3-conds" }), addBtn = el("button", { type: "button", class: "qk-rc qk-add" });
    addBtn.innerHTML = U.glyph("plus", 13) + "Bedingung";
    var sortChip = el("button", { type: "button", class: "vu-chip" }), shareChip = el("button", { type: "button", class: "vu-chip" });
    shareChip.innerHTML = U.glyph("share", 14) + " Regeln teilen";
    /* Z3: Regeln speichern. Ohne Anmeldung auf dem Gerät (vu.quant.searches.v1), mit Anmeldung im Konto
       (konto/saved-searches.js, Welt quant, Abfrage { query: kodierte Regeln }). */
    var SS = global.VUSavedSearches || null, qStore = SS ? SS.localStore("vu.quant.searches.v1") : null;
    var qAcct = qStore && { world: "quant", list: qStore.list, link: qStore.link, unlink: qStore.unlink, add: qStore.add };
    var saveChip = el("button", { type: "button", class: "vu-chip" }), savedHost = el("div", { class: "vu-stack qv3-saved", style: "margin-top:12px;gap:8px", "aria-live": "polite" }), acctSt = null;
    saveChip.innerHTML = U.glyph("check", 14) + " Regeln speichern";
    if (!qStore) saveChip.hidden = true;
    var baseChip = el("a", { class: "vu-chip vu-chip--on", href: X.routes.screenerPro("daten=v1"), title: "Andere Datenbasis: Quant V1 & Marktdaten" , text: "Datenbasis: Faktoren" });
    var count = el("b", { class: "qv3-pro-n" }), colsBtn = el("button", { type: "button", class: "qv3-linkbtn" }), table = el("div", { class: "qv3-ptable", role: "table", "aria-label": "Treffer" }), foot = el("p", { class: "vu-xs vu-mu" });
    colsBtn.innerHTML = "Spalten " + U.glyph("gear", 12);
    page.append(el("div", { class: "vu-box qk-cond" }, [head, condHost]), el("div", { class: "qv3-pro-bar" }, [count, colsBtn]), table, foot,
      el("div", { class: "vu-chips qv3-pro-chips" }, [baseChip, sortChip, shareChip, saveChip]), savedHost);
    /* Sheets: Bedingung hinzufügen, Spalten */
    function sheet(id, title) {
      var sh = html(U.sheet(id, title, "<div data-body></div>"));
      document.body.append(sh);
      sh.querySelector("[data-close]") && sh.querySelector("[data-close]").addEventListener("click", function () { U.closeSheet(sh); });
      global.addEventListener("hashchange", function off() { sh.remove(); global.removeEventListener("hashchange", off); });
      return sh;
    }
    var addSheet = sheet("qv3-pro-add", "Bedingung hinzufügen"), colSheet = sheet("qv3-pro-cols", "Spalten"), editSheet = sheet("qv3-pro-edit", "Bedingung");
    function slider(c) {
      var f = nameOfF(c.id), box = el("div", { class: "vu-box qv3-cond" });
      var val = el("b", { class: "num qv3-cond-v" }), lo = el("input", { type: "range", min: "0", max: "100", step: "1", value: String(c.lo), "aria-label": f[1] + " ab" }),
        hi = el("input", { type: "range", min: "0", max: "100", step: "1", value: String(c.hi), "aria-label": f[1] + " bis" });
      var track = el("div", { class: "qv3-range" }, [el("i", { class: "qv3-range-fill" }), lo, hi]);
      var del = el("button", { type: "button", class: "qv3-cond-x", "aria-label": f[1] + " entfernen", text: "×" });
      function paint() { val.textContent = c.lo + "–" + c.hi; track.style.setProperty("--a", c.lo + "%"); track.style.setProperty("--b", c.hi + "%"); render(); }
      lo.addEventListener("input", function () { c.lo = Math.min(Number(lo.value), c.hi); lo.value = c.lo; paint(); schedule(); });
      hi.addEventListener("input", function () { c.hi = Math.max(Number(hi.value), c.lo); hi.value = c.hi; paint(); schedule(); });
      del.addEventListener("click", function () { conds = conds.filter(function (x) { return x !== c; }); U.closeSheet(editSheet); render(); schedule(); });
      paint();
      box.append(el("div", { class: "qv3-cond-h" }, [el("span", {}, [el("b", { class: "vu-sm", text: f[1] }), el("span", { class: "vu-xs vu-mu", text: PRO_ASK[c.id] })]), val, del]), track);
      return box;
    }
    /* Bedingung als Chip „{Eigenschaft} ab {Schwelle}“ mit Symbol; Antippen öffnet den Regler im Sheet. */
    function condChip(c) {
      var f = nameOfF(c.id), b = el("button", { type: "button", class: "qk-rc", "aria-label": f[1] + " " + c.lo + " bis " + c.hi + ", ändern" });
      b.innerHTML = U.glyph(U.PROFILE.glyph[c.id] || "check", 13) + U.esc(f[1]) + " <b>" + (c.hi < 100 ? c.lo + "–" + c.hi : "ab " + c.lo) + "</b>";
      b.addEventListener("click", function () { var body = editSheet.querySelector("[data-body]"); body.replaceChildren(slider(c)); U.openSheet(editSheet); });
      return b;
    }
    function render() {
      condHost.replaceChildren.apply(condHost, conds.map(condChip).concat([addBtn]));
      addBtn.hidden = conds.length >= PRO_F.length;
      var f = nameOfF(sortF); sortChip.textContent = "Sortieren: " + f[1] + (sortDir === "desc" ? " ▼" : " ▲");
    }
    addBtn.addEventListener("click", function () {
      var body = addSheet.querySelector("[data-body]"); body.replaceChildren();
      PRO_F.filter(function (f) { return !conds.some(function (c) { return c.id === f[0]; }); }).forEach(function (f) {
        var b = el("button", { type: "button", class: "qv3-li qv3-li-btn" }, [el("span", {}, [el("b", { class: "vu-sm", text: PRO_ASK[f[0]] }), el("span", { class: "vu-xs vu-mu", text: f[1] })])]);
        b.insertAdjacentHTML("beforeend", U.glyph("plus", 18));
        b.addEventListener("click", function () { conds.push({ id: f[0], lo: 70, hi: 100 }); U.closeSheet(addSheet); render(); schedule(); });
        body.append(b);
      });
      body.append(el("div", { class: "qv3-li is-off" }, [el("span", {}, [el("b", { class: "vu-sm", text: "Heben Analysten Schätzungen an?" }), el("span", { class: "vu-xs vu-mu", text: "Analysten · heute keine Daten" })])]));
      U.openSheet(addSheet);
    });
    colsBtn.addEventListener("click", function () {
      var body = colSheet.querySelector("[data-body]"); body.replaceChildren();
      PRO_F.forEach(function (f) {
        var box = el("input", { type: "checkbox", checked: cols.indexOf(f[0]) >= 0 ? "checked" : null });
        box.checked = cols.indexOf(f[0]) >= 0;
        box.addEventListener("change", function () {
          cols = PRO_F.map(function (x) { return x[0]; }).filter(function (id) { return id === f[0] ? box.checked : cols.indexOf(id) >= 0; });
          if (!cols.length) { cols = [f[0]]; box.checked = true; }
          try { localStorage.setItem(PRO_COLS_KEY, JSON.stringify(cols)); } catch (e) { /* nur Komfort */ }
          paintTable();
        });
        body.append(el("label", { class: "qv3-li qv3-colpick" }, [el("span", {}, [el("b", { class: "vu-sm", text: f[1] })]), box]));
      });
      U.openSheet(colSheet);
    });
    sortChip.addEventListener("click", function () { sortDir = sortDir === "desc" ? "asc" : "desc"; render(); schedule(); });
    reset.addEventListener("click", function () { conds = DEFAULT(); sortF = conds[0].id; sortDir = "desc"; render(); schedule(); });
    var lastQuery = null, lastRes = null;
    shareChip.addEventListener("click", function () {
      if (!lastQuery) return;
      var url = location.origin + location.pathname + X.routes.screenerPro("query=" + encodeURIComponent(W.encode(lastQuery)));
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { shareChip.lastChild.textContent = " Link kopiert"; }, function () { prompt("Link zu diesen Regeln", url); });
    });
    function ruleName() { return conds.map(function (c) { return nameOfF(c.id)[2] + " " + c.lo + "–" + c.hi; }).join(" · ").slice(0, 60) || "Gesamtes Universum"; }
    function paintSaved(msg) {
      if (!qStore) return;
      var list = qStore.list();
      savedHost.replaceChildren();
      if (list.length) savedHost.append(el("p", { class: "vu-ltag", text: "Gespeicherte Regeln" }), el("div", { class: "vu-chips" }, list.map(function (s) {
        var a = el("a", { class: "vu-chip", href: X.routes.screenerPro("query=" + encodeURIComponent(s.query.query)), text: s.name });
        var x = el("button", { type: "button", class: "qv3-cond-x", "aria-label": s.name + " löschen", text: "×" });
        x.addEventListener("click", function () { var gone = qStore.remove(s.id); if (gone && gone.acct) SS.removed(gone.acct); paintSaved(); });
        return el("span", { class: "qv3-saved-item", style: "display:inline-flex;align-items:center;gap:4px" }, [a, x]);
      })));
      var line = el("p", { class: "vu-xs vu-mu", text: msg || SS.line(acctSt) });
      savedHost.append(line);
      if (acctSt && acctSt.signedIn && acctSt.pending) {
        var up = el("button", { type: "button", class: "vu-chip", text: "Im Konto speichern" });
        up.addEventListener("click", function () { up.disabled = true; SS.pushPending(qAcct).then(function (r) { syncSaved(r.state !== "OK" ? r.message : null); }); });
        savedHost.append(up);
      } else if (!acctSt || acctSt.signedIn === false) savedHost.append(el("a", { class: "vu-xs", href: "/konto/anmelden/?next=" + encodeURIComponent(location.pathname + location.hash), text: "Anmelden und im Konto speichern" }));
    }
    function syncSaved(msg) { if (qAcct) SS.sync(qAcct).then(function (st) { acctSt = st; paintSaved(msg); }); }
    saveChip.addEventListener("click", function () {
      if (!lastQuery || !qStore) return;
      var s = qStore.save(ruleName(), { query: W.encode(lastQuery) });
      if (!s) { paintSaved("Auf diesem Gerät ist Platz für 50 Regeln."); return; }
      saveChip.lastChild.textContent = " Gespeichert";
      paintSaved();
      SS.saved(qAcct, s.id).then(function (r) { syncSaved(r && r.ok === false ? r.message : null); });
    });
    syncSaved();
    function paintTable() {
      var res = lastRes;
      if (!res) return;
      var show = PRO_F.filter(function (f) { return cols.indexOf(f[0]) >= 0; });
      table.style.setProperty("--cols", show.length);
      var hr = el("div", { class: "qv3-prow qv3-prow--h", role: "row" }, [el("span", { role: "columnheader", text: "Aktie" })].concat(show.map(function (f) {
        var b = el("button", { type: "button", class: "num", role: "columnheader", "aria-label": f[1] + (sortF === f[0] ? (sortDir === "desc" ? ", absteigend sortiert" : ", aufsteigend sortiert") : ", sortieren"), "aria-sort": sortF === f[0] ? (sortDir === "desc" ? "descending" : "ascending") : "none" });
        b.innerHTML = U.glyph(U.PROFILE.glyph[f[0]] || "check", 14) + "<small>" + U.esc(f[2]) + (sortF === f[0] ? (sortDir === "desc" ? " ▼" : " ▲") : "") + "</small>";
        b.addEventListener("click", function () { if (sortF === f[0]) sortDir = sortDir === "desc" ? "asc" : "desc"; else { sortF = f[0]; sortDir = "desc"; } render(); schedule(); });
        return b;
      })));
      var rowsEl = res.stocks.slice(0, 500).map(function (st) {
        var ev = st.evidence || {};
        return el("a", { class: "qv3-prow", role: "row", href: X.routes.stock(st.ticker), title: X.companyName(st) }, [el("b", { role: "cell", text: st.ticker })].concat(show.map(function (f) {
          var v = ev[FIELD(f[0])];
          return el("span", { role: "cell", class: "num" + (sortF === f[0] ? " is-sort" : "") + (typeof v === "number" && v >= 75 ? " is-hi" : ""), text: typeof v === "number" ? String(Math.round(v)) : "–" });
        })));
      });
      table.replaceChildren.apply(table, [hr].concat(rowsEl));
      foot.textContent = "„–“: kein Wert, Daten fehlen. " + (res.stocks.length > 500 ? "Gezeigt werden die ersten 500 von " + res.stocks.length.toLocaleString("de-DE") + " Treffern. " : "Alle " + res.stocks.length.toLocaleString("de-DE") + " Treffer sortierbar, ") + "Regeln teilbar. Faktorwerte 0–100 je Eigenschaft (Quant V2), Stand " + X.dateDe(res.asOf) + ".";
    }
    var timer = 0, request = 0;
    function schedule() { clearTimeout(timer); timer = setTimeout(run, 180); }
    async function run() {
      var mine = ++request, filters = [];
      conds.forEach(function (c) {
        if (c.lo > 0) filters.push({ field: FIELD(c.id), operator: "gte", value: c.lo, scale: "raw" });
        if (c.hi < 100) filters.push({ field: FIELD(c.id), operator: "lte", value: c.hi, scale: "raw" });
      });
      if (!filters.length && conds.length) filters.push({ field: FIELD(conds[0].id), operator: "gte", value: 0, scale: "raw" });
      var query;
      try { query = W.build(filters.length ? filters : [{ field: FIELD("profitability"), operator: "gte", value: 0, scale: "raw" }], [{ field: FIELD(sortF), direction: sortDir }]); }
      catch (e) { count.textContent = "Regeln nicht ausführbar"; table.replaceChildren(); return; }
      count.textContent = "…";
      var res = await api.screen(query).catch(function () { return null; });
      if (mine !== request) return;
      if (!res || res.state !== "AVAILABLE") { count.textContent = "Ergebnisse derzeit nicht verfügbar"; table.replaceChildren(); return; }
      lastQuery = query; lastRes = res;
      try { history.replaceState(null, "", X.routes.screenerPro("query=" + encodeURIComponent(W.encode(query)))); } catch (e) { /* Adresse ist nur Komfort */ }
      count.textContent = res.stocks.length.toLocaleString("de-DE") + " Treffer";
      paintTable();
    }
    render();
    await run();
    return true;
  }

  /* -------------------------------------------------------- Profi-Modus */
  async function screenerPro(main, ctx, params) {
    /* Redesign 2027 (q02-b): dunkle Profi-Ansicht; die Datenbasis Quant V1 & Marktdaten (?daten=v1) bleibt im Regel-Editor. */
    if (global.VUUI && params.get("daten") !== "v1" && await screenerProV3(main, ctx, params)) return;
    var W = global.VUScreenerWorkspace, api = ctx.api;
    var initial, invalidLink = false;
    try { initial = params.get("query") ? W.decode(params.get("query")) : W.build([{ field: FIELD("momentum"), operator: "gte", value: 70, scale: "raw" }], [{ field: FIELD("momentum"), direction: "desc" }]); }
    catch (e) { invalidLink = true; main.append(X.notice("Gespeicherte Regeln konnten nicht geöffnet werden", "Die Abfrage enthält ungültige Kriterien. Es wurden keine Ersatzregeln ausgeführt – stelle unten eigene Regeln zusammen und tippe auf „Treffer anzeigen“.")); initial = W.build([{ field: FIELD("momentum"), operator: "gte", value: 70, scale: "raw" }], [{ field: FIELD("momentum"), direction: "desc" }]); }
    /* Weitergeleitet vom frueheren Strategy Lab (quant/ui/legacy-redirect.js):
       ehrlich sagen, was es dort gab und hier nicht gibt. */
    if (params.get("hinweis") === "strategy-lab") main.append(X.notice("Das Strategy Lab ist umgezogen", "Eigene historische Strategietests bietet Quant derzeit nicht an: dafür müsste die vollständige Kurshistorie einschließlich delisteter Titel ausgeliefert werden, und das ist nicht möglich. Eigene Regeln stellst du hier auf dem aktuellen Datenstand zusammen."));
    var current = W.methodologyOf(initial) || W.methodologies[0];
    var methodSelect = el("select", { class: "qx-select", "aria-label": "Datenbasis" }, W.methodologies.map(function (m) { return el("option", { value: m.id, text: m.label }); }));
    methodSelect.value = current.id;
    var note = el("span");
    var rulesHost = el("div", { class: "qx-rules" }), rows = [];
    var sort = el("select", { class: "qx-select", "aria-label": "Sortieren nach" }), dir = el("select", { class: "qx-select", "aria-label": "Reihenfolge" }, [el("option", { value: "desc", text: "Absteigend" }), el("option", { value: "asc", text: "Aufsteigend" })]);
    var out = el("section", { "aria-live": "polite" }), code = el("pre", { class: "qx-code" }), share = el("a", { class: "qx-btn secondary", href: "#", text: "Link zu dieser Auswahl" });
    function fields() { return current.fields; }
    function fillSort(v) { sort.replaceChildren.apply(sort, fields().filter(function (f) { return f.type === "number"; }).map(function (f) { return el("option", { value: f.id, text: f.label }); })); if (v) sort.value = v; }
    function describe() { note.textContent = current.label + " · " + current.methodologyVersion + ". " + current.note; }
    function addRule(filter) {
      if (rows.length >= W.maxFilters) return;
      filter = filter || { field: current.defaultField, operator: "gte", value: 0 };
      var field = el("select", { "aria-label": "Kennzahl" }, fields().map(function (f) { return el("option", { value: f.id, text: f.label }); }));
      var op = el("select", { "aria-label": "Vergleich" }), value = el("input", { type: "number", step: "any", "aria-label": "Vergleichswert" });
      var row = el("div", { class: "qx-rule" }), item = { row: row, field: field, op: op, get value() { return value; } };
      field.value = filter.field;
      function configure(raw, pref) {
        var def = fields().filter(function (f) { return f.id === field.value; })[0] || fields()[0];
        var next = def.type === "number" ? el("input", { type: "number", step: "any", value: String(raw === undefined || raw === null ? 0 : raw), "aria-label": "Vergleichswert" })
          : el("select", { "aria-label": "Vergleichswert" }, def.values.map(function (v) { return el("option", { value: v, text: v.replace(/_/g, " ") }); }));
        if (def.type !== "number") next.value = def.values.indexOf(raw) >= 0 ? raw : def.values[0];
        value.replaceWith(next); value = next;
        op.replaceChildren.apply(op, W.operators.filter(function (o) { return def.operatorIds.indexOf(o.id) >= 0; }).map(function (o) { return el("option", { value: o.id, text: o.label }); }));
        op.value = def.operatorIds.indexOf(pref) >= 0 ? pref : def.operatorIds[0];
      }
      field.onchange = function () { configure(undefined, op.value); };
      row.append(field, op, value, el("button", { type: "button", class: "qx-remove", text: "Entfernen", "aria-label": "Kriterium entfernen", onclick: function () { rows = rows.filter(function (r) { return r !== item; }); row.remove(); } }));
      rows.push(item); rulesHost.append(row);
      configure(filter.value, filter.operator);
    }
    methodSelect.onchange = function () { current = W.methodology(methodSelect.value); rows = []; rulesHost.replaceChildren(); fillSort(); describe(); addRule(); };
    fillSort(initial.sort && initial.sort[0] && initial.sort[0].field); if (initial.sort && initial.sort[0]) dir.value = initial.sort[0].direction; describe();
    initial.filters.forEach(addRule);
    var request = 0;
    async function apply() {
      var mine = ++request, filters;
      try {
        filters = rows.map(function (r) {
          var def = fields().filter(function (f) { return f.id === r.field.value; })[0], raw = r.value.value;
          if (!String(raw).trim()) throw Error("invalid");
          var v = def.type === "number" ? Number(raw) : raw; if (def.type === "number" && !isFinite(v)) throw Error("invalid");
          return { field: r.field.value, operator: r.op.value, value: v, scale: "raw" };
        });
      } catch (e) { out.replaceChildren(X.notice("Regel unvollständig", "Bitte gib für jede Regel einen gültigen Wert ein.")); return; }
      var query;
      try { query = W.build(filters, [{ field: sort.value, direction: dir.value }]); }
      catch (e) { out.replaceChildren(X.notice("Regeln nicht ausführbar", "Mindestens eine Regel liegt außerhalb dessen, was die Kennzahl zulässt. Es werden keine Treffer gezeigt, bis die Regeln gültig sind.")); return; }
      out.replaceChildren(X.loading("Wird gesucht …"));
      var res = await api.screen(query).catch(function () { return null; });
      var dist = await distOrNull(ctx);
      if (mine !== request) return;
      code.textContent = JSON.stringify(query, null, 2);
      share.href = X.routes.screenerPro("query=" + encodeURIComponent(W.encode(query)));
      if (!res || res.state !== "AVAILABLE") { out.replaceChildren(X.notice("Ergebnisse derzeit nicht verfügbar", "Die Daten konnten nicht geladen werden. Deine Regeln bleiben erhalten.")); return; }
      var sel = fields().filter(function (f) { return f.id === sort.value; })[0];
      var v2 = current.id !== "legacy";
      X.fill(out, el("p", { class: "qx-count", text: res.stocks.length.toLocaleString("de-DE") + " Treffer in " + (res.eligible || 0).toLocaleString("de-DE") + " auswertbaren Aktien · " + current.label + (res.asOf ? " · Stand " + X.dateDe(res.asOf) : "") }),
        res.stocks.length ? el("div", { class: "qx-list" }, res.stocks.slice(0, 100).map(function (s) {
          var why, side = null;
          if (v2 && s.evidence) {
            var ids = filters.map(function (f) { return f.field.replace("quantV2.factorEvidence.", ""); }).filter(function (id) { return VM.FACTORS[id]; });
            why = screeningWhy(s.evidence, ids.length ? ids : ["momentum"], dist);
          } else {
            var m = sel && s[sel.productKey];
            why = sel ? sel.label + ": " + (m && typeof m.value === "number" ? m.value.toLocaleString("de-DE", { maximumFractionDigits: 2 }) + (m.unit === "percent" ? " %" : m.unit === "ratio" ? "" : "") : "ohne Wert") : null;
            side = s.price && typeof s.price.value === "number" ? X.money(s.price.value) : null;
          }
          return X.stockRow({ ticker: s.ticker, name: X.companyName(s), why: why, side: side });
        })) : X.notice("Keine Treffer", "Keine Aktie erfüllt alle Regeln."),
        res.stocks.length > 100 ? el("p", { class: "qx-small", text: "Gezeigt werden die ersten 100 Treffer." }) : null);
    }
    share.className = "v2-pill v2-pill-ghost qx-btn secondary";
    main.append(el("section", { class: "qx-editor" }, [
      el("label", { text: "Datenbasis" }), methodSelect, el("p", { class: "qx-small", style: "max-width:70ch" }, [note]),
      el("label", { style: "margin-top:24px", text: "Regeln" }), rulesHost,
      X.actions([el("button", { type: "button", class: "v2-pill v2-pill-ghost qx-btn secondary", text: "+ Regel", onclick: function () { addRule(); } })]),
      el("label", { style: "margin-top:24px", text: "Sortieren" }),
      el("div", { class: "qx-rule", style: "grid-template-columns:minmax(0,2fr) minmax(0,1fr)" }, [sort, dir]),
      X.actions([el("button", { type: "button", class: "v2-pill v2-pill-dark qx-btn", text: "Treffer anzeigen", onclick: apply }), share])
    ]), el("div", { class: "qx-section", style: "margin-top:30px" }, [out]), X.more("Die Abfrage als Regeltext", function () { return code; }));
    if (!invalidLink) await apply();
  }

  /* ========================================================== STRATEGIEN */
  function conditionText(c) {
    var id = String(c.field || "").replace("quantV2.factorEvidence.", "");
    var name = VM.FACTORS[id] ? VM.FACTORS[id].name : c.label || id;
    return name + " " + (c.operator === "gte" ? "mindestens " : c.operator === "lte" ? "höchstens " : "") + c.value + " von 100";
  }
  async function strategies(main, ctx, id) {
    var r = await Promise.all([ctx.api.getStrategyProfiles().catch(function () { return null; }), ctx.api.getStrategyIndex().catch(function () { return null; })]);
    var profiles = r[0], index = r[1];
    if (!profiles || profiles.state !== "AVAILABLE") {
      main.append(el("h1", { class: "qx-h1", text: "Strategien" }), X.notice("Strategien derzeit nicht verfügbar", "Die Strategieprofile konnten nicht geladen werden."));
      return;
    }
    var byId = {}; ((index && index.profiles) || []).forEach(function (p) { byId[p.profileId] = p; });
    var list = profiles.contract.profiles;
    if (id) return strategyDetail(main, ctx, list.filter(function (p) { return p.profileId === id; })[0], byId[id], index, profiles.contract);
    if (global.VUUI) return strategiesV3(main, list, byId, index, ctx);
    /* Wie Discovers Strategien-Seite: Bild, Name, ein Satz, Pfeil. */
    main.append(el("header", { class: "q-hero q-hero--page" }, [X.globe(), el("p", { class: "q-kicker", text: "Strategien" }),
      el("h1", { class: "qx-h1", text: "Welche Art von Unternehmen suchst du?" }),
      el("p", { class: "q-hero-lead v2-lead", text: "Jeder Anlagestil sucht eine bestimmte Art von Unternehmen. Quant prüft täglich, welche Aktien alle Bedingungen erfüllen – für jede Aktie mit denselben Regeln." }),
      X.more("Was „passt heute“ heißt", function () { return el("p", { class: "q-intro-note", text: "„Passt heute“ heißt: die Bedingungen sind heute erfüllt. Wie sich ein Stil historisch entwickelt hat, ist noch nicht getestet und nicht zertifiziert – neue Treffer meldet der Radar." }); })]));
    main.append(el("div", { class: "v2-collection-links qx-strats" }, list.map(function (p) {
      var ix = byId[p.profileId], art = strategyArt(p.profileId);
      var blocked = ix && ix.availability && ix.availability.state !== "AVAILABLE";
      var countText = blocked || !ix || typeof ix.count !== "number" ? "Derzeit nicht prüfbar: " + VM.reasonText(ix && ix.availability && ix.availability.reason, "Eine benötigte Eigenschaft hat für keine Aktie Werte.") : ix.count.toLocaleString("de-DE") + " Aktien erfüllen heute alle Bedingungen";
      return el("a", { class: "v2-collection-link qx-strat", href: X.routes.strategy(p.profileId), dataset: { profile: p.profileId } }, [
        el("span", { class: "v2-collection-art" + (art ? " has-image" : ""), "aria-hidden": "true" }, [art ? el("img", { class: "v2-collection-image", src: art, alt: "", width: "1254", height: "1254", loading: "lazy", decoding: "async" }) : el("span", { class: "v2-collection-glyph", text: "↗" }),
          el("span", { class: "v2-collection-art-label", text: p.label.split(" · ")[0] })]),
        el("span", { class: "v2-collection-copy" }, [el("strong", { text: p.label }), el("span", { text: p.plain }),
          el("small", { text: p.conditions.map(function (c) { return (VM.FACTORS[c.id] ? VM.FACTORS[c.id].name : c.id) + " ≥ " + c.value; }).join(" · ") + " — " + countText })]),
        el("span", { class: "v2-collection-arrow", text: "→" })]);
    })), el("p", { class: "qx-small", style: "margin-top:20px;max-width:70ch", text: "Es gibt bewusst keine Erfolgs- oder Trefferquote: Wie ein Stil in der Vergangenheit abgeschnitten hätte, ist ein Backtest – und der bleibt geschlossen, bis Universum, Kapitalmaßnahmen und Ausführung zertifiziert sind. Stand " + X.dateDe(index && index.asOf) + "." }),
      X.actions([X.btn("Wie Strategien geprüft werden", X.routes.method("strategien"), "secondary")]));
  }

  /* Konzept Quant 2026-11 (QX04, Screen q-stile, Entscheidung 4): der deutsche Satz ist der Name, der Fachname klein
     darüber; Regeln als Chips „{Eigenschaft} ab {Schwelle}“ mit Symbol, Trefferzahl, „seit gestern +N · −N“, Logos.
     Ein Stil ohne Daten erscheint als Fußnote, nicht als Karte. Dazu der Forschungs-Hinweis. */
  function strategiesV3(main, list, byId, index, ctx) {
    var byP = {}; list.forEach(function (p) { byP[p.profileId] = p; });
    var trBy = {}; ((index && index.historicalEvidence && index.historicalEvidence.transitions) || []).forEach(function (t) { trBy[t.profileId] = t; });
    var ids = VM.STYLE_ORDER.filter(function (id) { return byP[id]; }).concat(list.map(function (p) { return p.profileId; }).filter(function (id) { return VM.STYLE_ORDER.indexOf(id) < 0; }));
    var ok = function (id) { var ix = byId[id]; return ix && typeof ix.count === "number" && (!ix.availability || ix.availability.state === "AVAILABLE"); };
    var open = ids.filter(ok), closed = ids.filter(function (id) { return !ok(id); });
    var h = '<header class="qv3-intro"><p class="vu-ltag">Anlagestile</p><h1 class="vu-lt">Welche Art von Firma suchst du?</h1><p class="vu-lead">Jeder Stil ist eine feste Regel aus Eigenschaften. Quant prüft täglich, welche Aktien alle Regeln erfüllen.</p></header>' +
      '<div class="vu-stack qk-stack qv3-strategies">' + open.map(function (id) { return stilCard(ctx, byP[id], byId[id], trBy[id]); }).join("") + "</div>" +
      closed.map(function (id) { return '<p class="vu-xs vu-mu qk-foot" data-profile="' + U().esc(id) + '">„' + U().esc(VM.styleName(id, byP[id].label)) + "“ erscheint, sobald es dafür Daten gibt.</p>"; }).join("") +
      '<a class="vu-box qk-research" href="' + U().esc(X.routes.backtest()) + '"><span class="vu-ltag">Forschung, nicht zertifiziert</span><b>Wie gut war ein Stil früher?</b><span class="vu-sm vu-mu">Gesperrt, bis Universum, Kapitalmaßnahmen und Ausführung geprüft sind.</span></a>' +
      '<p class="vu-xs vu-mu qk-foot">„Erfüllt“ heißt nur: Die Aktie passt heute zu den Regeln. Bewusst keine Trefferquote, keine Anlageempfehlung, keine Prognose. Stand ' + U().esc(X.dateDe(index && index.asOf)) + '. <a href="' + U().esc(X.routes.method("strategien")) + '">Wie Anlagestile geprüft werden</a></p>';
    var box = el("div", { class: "vu-ui qv3 qk" }); box.innerHTML = h; main.append(box);
  }
  /* Visual First (VU3): je Bedingung ein Balken 0-100 mit der Schwelle als Strich und dem Wert als Zahl -
     dieselben veroeffentlichten Faktorwerte wie im Satz (screeningWhy), der als aria-label an der Zeile bleibt. */
  function condMeters(row, conditions, dist) {
    return el("span", { class: "qx-cmeters" + (conditions.length > 3 ? " is-many" : ""), "aria-hidden": "true", style: "--n:" + Math.min(4, conditions.length) }, conditions.map(function (c) {
      var v = row[c.field], ok = typeof v === "number";
      var tone = ok && dist ? VM.factorView({ id: c.id, state: "AVAILABLE", score: v, position: VM.positionIn(dist[c.id], v), components: [] }).tone : "unknown";
      return el("span", { class: "qx-cm tone-" + tone }, [el("small", { text: VM.FACTORS[c.id] ? VM.FACTORS[c.id].name : c.id }),
        el("i", { style: "--v:" + (ok ? Math.max(2, Math.min(100, v)) : 0) + "%;--t:" + c.value + "%" }),
        el("b", { class: "num", text: ok ? String(Math.round(v)) : "–" })]);
    }));
  }
  async function strategyDetail(main, ctx, p, ix, index, contract, legacy) {
    if (global.VUUI && p && !legacy) return strategyDetailV3(main, ctx, p, ix, index, contract);
    main.append(el("a", { class: "v2-back qx-back", href: X.routes.strategies(), text: "← Strategien" }));
    if (!p) { main.append(el("h1", { class: "qx-h1", text: "Strategie nicht gefunden" }), X.notice("Unbekannte Strategie", "Diese Strategie gibt es in der veröffentlichten Methodik nicht.")); return; }
    document.title = p.label + " – Quant-Strategie · Vision Universe®";
    var art = strategyArt(p.profileId);
    if (art) main.append(el("div", { class: "v2-collection-hero qx-strat-hero" }, [el("img", { src: art, alt: "", width: "1254", height: "1254", decoding: "async" })]));
    main.append(el("h1", { class: "qx-h1", text: p.label }), el("p", { class: "v2-lead", text: p.plain }));
    main.append(el("details", { class: "v2-rule qx-rules-box", open: true }, [el("summary", { text: "Welche Bedingungen gelten?" }),
      el("ul", { class: "qx-conds" }, p.conditions.map(function (c) {
        return el("li", { class: "tone-unknown" }, [el("i", { class: "dx-waage-marke", "aria-hidden": "true", text: "•" }), el("div", {}, [el("b", { text: conditionText(c) }), el("span", { text: c.rationale })])]);
      })),
      el("p", { class: "qx-small", text: "Die Schwellen sind für jede Aktie gleich und nicht an vergangenen Ergebnissen optimiert. Typisches Risiko dieses Stils: " + (p.mainRisk || "–") }),
      el("p", { class: "qx-small", text: "Ob eine Aktie passt, wird täglich neu geprüft: gezählt wird, welche Bedingungen sie heute erfüllt. Eine Aktie kann morgen herausfallen, ohne dass sich an ihrem Geschäft etwas geändert hat." })]));
    var members = (ix && ix.tickers) || [];
    var membersHost = el("div");
    var countable = ix && typeof ix.count === "number" && (!ix.availability || ix.availability.state === "AVAILABLE");
    main.append(X.world("Wer passt heute?", countable ? ix.count.toLocaleString("de-DE") + " Aktien erfüllen am " + X.dateDe(index.asOf) + " alle Bedingungen." : "Diese Strategie ist derzeit nicht prüfbar: " + VM.reasonText(ix && ix.availability && ix.availability.reason, "eine benötigte Eigenschaft hat für keine Aktie Werte."), [membersHost]));
    var tr = index && index.historicalEvidence && (index.historicalEvidence.transitions || []).filter(function (t) { return t.profileId === p.profileId; })[0];
    var screening = await ctx.api.getFactorEvidenceScreening().catch(function () { return null; });
    var dist = await distOrNull(ctx);
    var rowBy = {}; ((screening && screening.rows) || []).forEach(function (r) { rowBy[r.ticker] = r; });
    var ids = p.conditions.map(function (c) { return c.id; });
    X.add(membersHost, !countable ? X.notice("Keine Zuordnung", "Solange eine benötigte Eigenschaft keine Werte hat, wird keine Aktie diesem Stil zugeordnet – auch nicht näherungsweise.") : members.length ? el("div", {}, [el("p", { class: "qx-small qx-cm-legend", text: "Je Bedingung: Balken = Wert 0–100, Strich = Schwelle der Bedingung, Farbe = Stufe unter allen bewerteten Aktien." }), el("div", { class: "qx-list" }, members.slice(0, 30).map(function (t) {
      var row = rowBy[t];
      return X.stockRow({ ticker: t, name: nameOf(ctx, t), why: row ? screeningWhy(row, ids, dist) : null, whyNode: row ? condMeters(row, p.conditions, dist) : null });
    }))]) : X.notice("Heute kein Treffer", "Keine Aktie erfüllt derzeit alle Bedingungen."),
      members.length > 30 ? el("div", { style: "margin-top:16px" }, [el("p", { class: "qx-small", text: "Weitere Treffer:" }), X.tickerChips(members.slice(30), 80)]) : null);
    if (tr) {
      main.append(X.world("Was hat sich verändert?", "Seit dem Stand vom " + X.dateDe(index.historicalEvidence.from) + " (jetzt " + X.dateDe(index.historicalEvidence.to) + ").", [
        el("div", { class: "dv2-valuation-grid qx-stats" }, [X.stat("Neu dabei", String((tr.entered || []).length)), X.stat("Herausgefallen", String((tr.exited || []).length))]),
        (tr.entered || []).length ? X.rail(ctx.commonFirst(tr.entered).slice(0, 14).map(function (t) { return quantPoster(ctx, t, rowBy, { story: "Neu dabei", foot: "Neu seit " + X.dateDe(index.historicalEvidence.to) }); }), "Neu dabei") : null,
        (tr.exited || []).length ? el("div", {}, [el("p", { class: "qx-small", text: "Herausgefallen:" }), X.tickerChips(tr.exited, 30)]) : null]));
    }
    /* Was einen Match verhindert: unter den Aktien, die GENAU EINE
       Bedingung verfehlen, wird gezaehlt, welche es ist. Aus denselben
       veroeffentlichten Faktorwerten, keine neue Rechnung. */
    if (screening && screening.state === "AVAILABLE") {
      var misses = {}, near = [];
      screening.rows.forEach(function (r) {
        var failed = [], unknown = 0;
        p.conditions.forEach(function (c) {
          var v = r[c.field];
          if (typeof v !== "number") unknown++;
          else if (c.operator === "gte" ? v < c.value : v > c.value) failed.push(c.id);
        });
        if (!unknown && failed.length === 1) { misses[failed[0]] = (misses[failed[0]] || 0) + 1; near.push({ t: r.ticker, c: failed[0], v: r[FIELD(failed[0])] }); }
      });
      var total = near.length;
      if (total) main.append(X.world("Was verhindert einen Match?", total.toLocaleString("de-DE") + " Aktien verfehlen genau eine Bedingung. So verteilt es sich:", [
        el("div", { class: "dx-bewertung-bild qx-bars2" }, p.conditions.map(function (c) {
          var n = misses[c.id] || 0;
          return el("div", { class: "dx-bewertung-zeile" }, [el("span", { class: "dx-bewertung-name", text: VM.FACTORS[c.id] ? VM.FACTORS[c.id].name : c.id }),
            el("span", { class: "dx-bewertung-balken", "aria-hidden": "true" }, [el("i", { style: "width:" + Math.max(1, n / total * 100).toFixed(1) + "%" })]), el("b", { class: "num", text: String(n) })]);
        })),
        el("p", { class: "qx-small", text: "Knapp daneben (nur eine Bedingung verfehlt):" }),
        X.tickerChips(near.sort(function (a, b) { return (b.v || 0) - (a.v || 0); }).map(function (x) { return x.t; }), 16)
      ]));
    }
    main.append(X.actions([X.btn("Methodik der Strategien", X.routes.method("strategien"), "secondary"),
      X.btn("Im Quant Screener öffnen", X.routes.screenerPro("query=" + encodeURIComponent(global.VUScreenerWorkspace.encode(global.VUScreenerWorkspace.build(p.conditions.map(function (c) { return { field: c.field, operator: c.operator, value: c.value, scale: "raw" }; }), [{ field: p.conditions[0].field, direction: "desc" }])))), "secondary")]),
      el("p", { class: "qx-small", text: "Keine Erfolgs- oder Trefferquote: Ein Strategy Match zählt erfüllte Bedingungen. Methodik " + contract.methodologyVersion + "." }));
  }

  /* Redesign 2027 (Folie Q03, q03-b): Titel und Satz, zwei Kacheln, Regeln als Fragen mit Schwelle, bekannte Namen als
     Aktienzeilen (C10), neu seit gestern, Melden (Z4: bald), Knopf in den Screener. Die bisherige Auswertung
     (alle Treffer mit Balken, „Was verhindert einen Match?“) steht vollständig unter „Mehr zu dieser Strategie“. */
  async function strategyDetailV3(main, ctx, p, ix, index, contract) {
    /* Konzept Quant 2026-11 (QX04, Screen q-stil): dunkler Kopf wie eine Discover-Reihe, „{N} von {Gesamt}“, „N neu · N raus“,
       Regel mit Schwellen-Balken, Liste mit Profil, NEU-Etikett für neue Treffer, „im Screener anpassen“. */
    var U = global.VUUI, page = el("div", { class: "vu-ui qv3 qv3-sdetail qk" }), html = function (h) { var d = el("div"); d.innerHTML = h; return d; };
    var german = VM.styleName(p.profileId, p.label), tech = p.label.split(" · ")[0];
    document.title = german + " – Anlagestil · Vision Universe®";
    main.append(page);
    var members = (ix && ix.tickers) || [];
    var countable = ix && typeof ix.count === "number" && (!ix.availability || ix.availability.state === "AVAILABLE");
    var r0 = await Promise.all([ctx.api.getFactorEvidenceScreening().catch(function () { return null; }), screeningRows(ctx)]);
    var screening = r0[0], rowBy = r0[1] || {};
    var rated = screening && screening.rows ? screening.rows.length : null;
    var he = index && index.historicalEvidence, tr = he && (he.transitions || []).filter(function (t) { return t.profileId === p.profileId; })[0];
    var inN = tr ? (tr.entered || []).length : null, outN = tr ? (tr.exited || []).length : null;
    var entered = tr ? (tr.entered || []) : [];
    var words = german.split(" "), cut = Math.ceil(words.length / 2);
    var first = p.conditions[0], second = p.conditions[1];
    var listHref = X.routes.screenerPro("query=" + encodeURIComponent(global.VUScreenerWorkspace.encode(global.VUScreenerWorkspace.build(p.conditions.map(function (c) { return { field: c.field, operator: c.operator, value: c.value }; })))));
    var val = function (t, c) { var r = rowBy[t]; var v = r && c ? r[c.field] : null; return typeof v === "number" ? v : null; };
    var sorted = members.slice().sort(function (a, b) { var ea = entered.indexOf(a) >= 0, eb = entered.indexOf(b) >= 0; if (ea !== eb) return ea ? -1 : 1; return (val(b, first) || -1) - (val(a, first) || -1); });
    var short = function (id) { return VM.FACTORS[id] ? VM.FACTORS[id].name : id; };
    var row = function (t) { var v2 = val(t, second);
      return qRow(ctx, rowBy, t, t + (second ? " · " + short(second.id) + " " + (v2 == null ? "–" : Math.round(v2)) : ""), entered.indexOf(t) >= 0 ? '<span class="qk-tag">Neu</span>' : scoreP(val(t, first), short(first.id).split(" ")[0])); };
    var thr = p.conditions.map(function (c) {
      var x = Math.max(0, Math.min(100, Number(c.value) || 0)), up = c.operator !== "lte";
      return '<div class="qk-thr"><span>' + U.glyph(U.PROFILE.glyph[c.id] || "check", 15) + U.esc(short(c.id)) + '</span><span class="qk-thr-b" aria-hidden="true"><em style="left:' + (up ? x : 0) + "%;width:" + (up ? 100 - x : x) + '%"></em><i style="left:' + x + '%"></i></span><b>' + (up ? "ab " : "bis ") + U.esc(c.value) + "</b></div>";
    }).join("");
    var n = p.conditions.length, nWord = ["", "Sie muss", "Beide müssen", "Alle drei müssen", "Alle vier müssen", "Alle fünf müssen"][n] || "Alle müssen";
    var h = '<div class="qk-hero"><div class="qk-hero-top"><a class="vu-round" href="' + U.esc(X.routes.strategies()) + '" aria-label="Zurück zu den Anlagestilen">' + U.glyph("back", 18) + '</a><button type="button" class="vu-round" disabled title="Melden, wenn eine Aktie neu dazukommt – bald über Mein Bereich" aria-label="Melden (bald)">' + U.glyph("bell", 18) + "</button></div>" +
      '<span class="qk-hero-tag">Anlagestil · ' + U.esc(tech) + '</span><h1 class="qk-hero-t">' + U.esc(words.slice(0, cut).join(" ")) + "<br><span>" + U.esc(words.slice(cut).join(" ")) + "</span></h1>" +
      '<p class="qk-hero-s">' + U.esc(p.plain) + "</p>" +
      '<div class="qk-grid2"><div class="qk-mini dk"><small>Erfüllen heute</small><b>' + (countable ? ix.count.toLocaleString("de-DE") + (rated ? " von " + rated.toLocaleString("de-DE") : "") : "nicht prüfbar") + '</b></div><div class="qk-mini dk"><small>Seit gestern</small><b>' + (inN == null ? "–" : inN + " neu · " + outN + " raus") + "</b></div></div></div>" +
      '<div class="qk-body"><div class="vu-box qk-rule"><span class="vu-ltag">Die Regel</span>' + thr + '<div class="qk-help">' + U.help(nWord + " erfüllt sein. " + (first ? first.value + " heißt: ein Wert von mindestens " + first.value + " von 100 bei dieser Eigenschaft." : "")) + "</div></div>" +
      (countable && members.length ? '<div class="qk-rh"><div class="qk-rh-t"><h2>Die ' + members.length.toLocaleString("de-DE") + (members.length === 1 ? " Aktie" : " Aktien") + '</h2><span class="vu-xs vu-mu qk-sort">Sortiert: ' + U.esc(short(first.id)) + "</span></div></div>" +
        '<div class="qk-hitlist">' + sorted.slice(0, 6).map(row).join("") + "</div>" + U.profileLegend() +
        '<a class="vu-btn vu-btn--line vu-btn--block qk-more" href="' + U.esc(listHref) + '">Alle ' + members.length.toLocaleString("de-DE") + " · im Screener anpassen</a>"
        : '<div class="vu-box vu-box--line" style="margin-top:14px">' + U.verdict("none", countable ? "Heute kein Treffer" : "Nicht prüfbar") + '<p class="vu-xs vu-mu" style="margin:6px 0 0">' + U.esc(countable ? "Keine Aktie erfüllt derzeit alle Regeln." : VM.reasonText(ix && ix.availability && ix.availability.reason, "Eine benötigte Eigenschaft hat für keine Aktie Werte.")) + "</p></div>") +
      "</div>";
    page.append(html(h));
    /* Alles Bisherige bleibt erreichbar: volle Trefferliste mit Balken, Veränderung und „Was verhindert einen Match?“. */
    var more = el("details", { class: "qv3-more qk-body", id: "qv3-all" }, [el("summary", { text: "Mehr zu diesem Anlagestil" })]);
    page.append(more);
    var legacy = el("div");
    more.append(legacy);
    await strategyDetail(legacy, ctx, p, ix, index, contract, true);
    var old = legacy.querySelector(".qx-back"); if (old) old.remove();
    var oldH = legacy.querySelector("h1"); if (oldH) oldH.replaceWith(el("h2", { class: "qx-h2", text: "Alle Treffer und Bedingungen" }));
    if (location.hash.indexOf("#qv3-all") >= 0) more.open = true;
    page.querySelector('a[href="#qv3-all"]') && page.querySelector('a[href="#qv3-all"]').addEventListener("click", function (e) { e.preventDefault(); more.open = true; more.scrollIntoView({ behavior: "smooth", block: "start" }); });
  }

  /* ============================================================== AKTIEN */
  var KNOWN = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "JPM", "V", "KO", "PG", "JNJ", "XOM", "T", "SO", "O"];
  /* Redesign 2027 (Folie Q04): Frage als Titel, Suche + bekannte Namen, ehrlicher Leerzustand, Listen statt Karussells. */
  var KNOWN_CHIPS = [["NVDA", "NVIDIA"], ["AAPL", "Apple"], ["MSFT", "Microsoft"], ["AMD", "AMD"]];
  async function stocksV3(main, ctx) {
    var U = global.VUUI, page = el("div", { class: "vu-ui qv3" });
    main.append(page);
    var input = el("input", { type: "search", class: "qx-stock-search", placeholder: "Name oder Kürzel, z. B. Apple", "aria-label": "Aktie suchen", autocomplete: "off" });
    var results = el("div", { "aria-live": "polite", class: "qv3-sresults" });
    var field = el("label", { class: "vu-find qv3-search" }); field.innerHTML = U.glyph("search", 18); field.append(input); field.insertAdjacentHTML("beforeend", '<i aria-hidden="true">' + U.glyph("spark", 18) + "</i>");
    page.append(el("header", { class: "qv3-intro" }, [el("p", { class: "vu-ltag", text: "Quant" }), el("h1", { class: "vu-lt", text: "Welche Aktie willst du verstehen?" })]), field,
      el("div", { class: "vu-chips qv3-known" }, KNOWN_CHIPS.map(function (k) { return el("a", { class: "vu-chip", href: X.routes.stock(k[0]), text: k[1] }); })), results);
    var req = 0;
    input.addEventListener("input", async function () {
      var mine = ++req, q = input.value.trim();
      if (!q) { results.replaceChildren(); return; }
      results.replaceChildren(el("p", { class: "qx-small", text: "Wird gesucht …" }));
      var r = await ctx.api.searchInstruments(q, 12).catch(function () { return { state: "SOURCE_MISSING", entries: [] }; });
      if (mine !== req) return;
      if (r.state !== "AVAILABLE") { results.replaceChildren(X.notice("Suche derzeit nicht verfügbar", "Das Verzeichnis konnte nicht geladen werden.")); return; }
      results.replaceChildren(r.entries.length ? el("div", { class: "qx-list" }, r.entries.map(function (e) { return X.stockRow({ ticker: e.ticker, name: X.companyName(e) === "Firmenname nicht veröffentlicht" ? "" : e.name }); }))
        : el("p", { class: "qx-small", text: "Keine passenden Aktien gefunden." }));
    });
    var html = function (h) { var d = el("div"); d.innerHTML = h; return d; };
    var row = function (t, sub) { return U.stockRow({ ticker: t, name: nameOf(ctx, t) || t, sub: sub, href: X.routes.stock(t), noPrice: true }); };
    var recent = X.recent.list(), watched = X.watch.list();
    /* Beobachten: ehrlicher Leerzustand oder Aktienzeilen; was gemeldet wird, steht im Sheet. */
    var sheet = html(U.sheet("qv3-watch-sheet", "Was Quant für beobachtete Aktien verfolgt", '<ul class="qv3-watch">' + WATCH_VALUE.map(function (w) { return "<li>" + U.esc(w) + "</li>"; }).join("") + '</ul><p class="vu-xs vu-mu">Kein Depot: keine Stückzahl, kein Einstand.</p><button type="button" class="vu-btn vu-btn--ink vu-btn--block" data-close style="margin-top:14px">Verstanden</button>')).firstElementChild;
    document.body.append(sheet);
    sheet.querySelector("[data-close]").addEventListener("click", function () { U.closeSheet(sheet); });
    global.addEventListener("hashchange", function off() { sheet.remove(); global.removeEventListener("hashchange", off); });
    var watchHead = html(U.sect("Beobachten")).firstElementChild;
    var what = el("button", { type: "button", class: "qv3-linkbtn", text: "Was wird gemeldet?", onclick: function () { U.openSheet(sheet); } });
    watchHead.append(what);
    page.append(watchHead, watched.length ? html('<div class="qv3-rows">' + watched.slice(0, 12).map(function (t) { return row(t, "Beobachtet"); }).join("") + "</div>")
      : html('<div class="vu-box qv3-empty"><div class="qv3-empty-h">' + U.verdict("none", "Noch leer") + '<b class="vu-sm">Du beobachtest noch keine Aktie.</b></div><p class="vu-xs vu-mu">Tippe auf einer Aktienseite auf ♡. Quant meldet dir dann neue Setups, Strategie-Wechsel und steigendes Risiko.</p></div>'));
    if (recent.length) page.append(html(U.sect("Zuletzt angesehen") + '<div class="qv3-rows">' + recent.slice(0, 6).map(function (t) { return row(t, "Zuletzt analysiert"); }).join("") + "</div>"));
    var setupHost = el("div"), stratHost = el("div");
    page.append(setupHost, stratHost, html(U.sect("Bekannte Aktien") + '<div class="qv3-rows">' + KNOWN.slice(0, 6).map(function (t) { return row(t, ""); }).join("") + "</div>" +
      U.sect("Mehr finden") + U.navcard({ glyph: "line", title: "Technische Lagen", sub: "Charts mit klarer Lage, nach Regel", href: X.routes.chartlagen() })));
    var r = await Promise.all([ctx.api.getQuantRadarHome().catch(function () { return null; }), ctx.api.getStrategyIndex().catch(function () { return null; }), ctx.api.getSetupScreenIndex().catch(function () { return null; }), screeningRows(ctx)]);
    var radar = r[0], idx = r[1], setupIdx = r[2], rowBy = r[3];
    if (radar && radar.state === "AVAILABLE") {
      var confirmed = (radar.cards || []).filter(function (c) { return c.events && c.events.some(function (e) { return e.eventType === "SETUP_CONFIRMED"; }); }).slice(0, 3);
      var conf = setupIdx && setupIdx.state === "AVAILABLE" ? (setupIdx.states || []).filter(function (st) { return st.state === "CONFIRMED" && typeof st.count === "number"; })[0] : null;
      if (confirmed.length) setupHost.append(html(U.sect("Setup bestätigt", { href: X.routes.screener("frage=setups"), link: conf ? "Alle " + conf.count.toLocaleString("de-DE") : "Alle" }) + '<div class="vu-stack">' + confirmed.map(function (c) {
        var tr = c.trade && c.trade.state === "AVAILABLE" ? c.trade : null, z = tr && zoneText(tr.entry);
        return '<a class="vu-box qv3-mini" href="' + U.esc(X.routes.stock(c.ticker)) + '">' + U.logo(c.ticker) + '<span class="qv3-mini-t"><b>' + U.esc(nameOf(ctx, c.ticker) || c.ticker) + '</b><span class="vu-xs vu-mu"><b>' + U.esc(z ? "Zone laut Methode: " + z : c.ticker) + "</b></span></span>" + U.verdict("strong", "Bestätigt") + "</a>";
      }).join("") + "</div>"));
    }
    if (idx && idx.historicalEvidence && idx.historicalEvidence.transitions) {
      var he = idx.historicalEvidence, labels = {};
      (idx.profiles || []).forEach(function (p) { labels[p.profileId] = (p.label || p.profileId).split(" · ")[0]; });
      var items = [];
      he.transitions.forEach(function (t) { var tk = ctx.commonFirst(t.entered || [])[0]; if (tk) items.push([tk, t.profileId]); });
      if (items.length) stratHost.append(html(U.sect("Neu in einer Strategie", { href: X.routes.strategies(), link: "Alle" }) + '<div class="vu-box qv3-strats">' + items.slice(0, 5).map(function (it) {
        var v = rowBy && rowBy[it[0]] ? VM.fromScreeningRow(rowBy[it[0]], rowBy._dist) : null;
        var best = v ? v.factors.filter(function (f) { return f.state === "AVAILABLE"; }).sort(function (a, b) { return b.score - a.score; })[0] : null;
        return '<a class="qv3-strat" href="' + U.esc(X.routes.stock(it[0])) + '">' + U.logo(it[0]) + '<span class="qv3-strat-t"><b class="vu-sm">' + U.esc(nameOf(ctx, it[0]) || it[0]) + '</b><span class="vu-xs vu-mu">neu in ' + U.esc(labels[it[1]] || it[1]) + "</span></span>" +
          (best ? '<span class="vu-chip vu-chip--lime qv3-best">' + U.esc((FACTOR_SHORT[best.id] || best.name) + " " + Math.round(best.score)) + "</span>" : "") + "</a>";
      }).join("") + '</div><p class="vu-xs vu-mu" style="margin:6px 0 0">Zwischen den Ständen ' + U.esc(X.dateDe(he.from)) + " und " + U.esc(X.dateDe(he.to)) + ".</p>"));
    }
  }
  async function stocks(main, ctx) {
    if (global.VUUI) return stocksV3(main, ctx);
    var input = el("input", { type: "search", class: "qx-stock-search",
      placeholder: "Name oder Kürzel, z. B. Apple oder NVDA", "aria-label": "Aktie suchen", autocomplete: "off" });
    var results = el("div", { "aria-live": "polite", style: "margin-top:12px" });
    main.append(el("header", { class: "q-hero q-hero--page" }, [X.globe(), el("p", { class: "q-kicker", text: "Aktien" }),
      el("h1", { class: "qx-h1", text: "Welche Aktie möchtest du verstehen?" }),
      el("label", { class: "q-searchbar qx-search-field" }, [X.icon("search"), input, el("i", { "aria-hidden": "true", text: "→" })]),
      el("p", { class: "q-intro-note", text: "Jede Aktienseite beginnt mit „Was ist jetzt wichtig?“ – dann Setup, historische Evidenz gegen den Markt und wie belastbar sie ist." })]), results);
    var req = 0;
    input.addEventListener("input", async function () {
      var mine = ++req, q = input.value.trim();
      if (!q) { results.replaceChildren(); return; }
      results.replaceChildren(el("p", { class: "qx-small", text: "Wird gesucht …" }));
      var r = await ctx.api.searchInstruments(q, 12).catch(function () { return { state: "SOURCE_MISSING", entries: [] }; });
      if (mine !== req) return;
      if (r.state !== "AVAILABLE") { results.replaceChildren(X.notice("Suche derzeit nicht verfügbar", "Das Verzeichnis konnte nicht geladen werden.")); return; }
      results.replaceChildren(r.entries.length ? el("div", { class: "qx-list" }, r.entries.map(function (e) { return X.stockRow({ ticker: e.ticker, name: X.companyName(e) === "Firmenname nicht veröffentlicht" ? "" : e.name }); }))
        : el("p", { class: "qx-small", text: "Keine passenden Aktien gefunden." }));
    });
    var recent = X.recent.list(), watched = X.watch.list();
    var watchValue = el("div", {}, [el("p", { class: "qx-small", text: "Beobachten heißt: Quant verfolgt für dich" }), el("ul", { class: "q-watch-value" }, WATCH_VALUE.map(function (w) { return el("li", { text: w }); })),
      el("p", { class: "qx-small", text: "Du siehst es im Radar und im Verlauf unten. Kein Depot: keine Stückzahl, kein Einstand." })]);
    /* VU3: was "Beobachten" bedeutet, steht hinter einer Aufklappzeile. */
    var watchMore = X.more("Was Quant für beobachtete Aktien verfolgt", function () { return watchValue; });
    if (!watched.length) main.append(X.world("Beobachten", "Tippe auf einer Aktienseite auf „Beobachten“.", [watchMore]));
    if (watched.length) main.append(X.world("Beobachtet", watched.length + (watched.length === 1 ? " Aktie" : " Aktien") + " beobachtest du.", [watchMore, X.rail(watched.slice(0, 24).map(function (t) { return X.poster({ ticker: t, name: nameOf(ctx, t), story: "Beobachtet" }); }), "Gemerkt"),
      watched.length > 1 ? X.actions([X.btn("Beobachtete vergleichen", X.routes.compare(watched.slice(0, 4)), "secondary")]) : null]));
    /* Evidenz-Verlauf je beobachteter Aktie: was jetzt gilt, was davor galt,
       was historisch getestet ist, was als Naechstes fehlt. Kein Portfolio. */
    if (watched.length && ctx.api.getSignalTracking) {
      var tlHost = el("div", { class: "q-watch-tls", "aria-live": "polite" }, [X.loading()]);
      main.append(X.world("Verlauf deiner beobachteten Aktien", "Was sich bei ihnen zuletzt geändert hat – mit Datum. Keine Empfehlung und kein Depot.", [tlHost]));
      Promise.all([ctx.loadBacktestView().catch(function () { return null; })].concat(watched.slice(0, 12).map(function (t) { return ctx.api.getSignalTracking(t).catch(function () { return null; }); }))).then(function (all) {
        var trs = all.slice(1);
        if (!tlHost.isConnected) return;
        if (!global.QXEvidence) { tlHost.replaceChildren(el("p", { class: "qx-small", text: "Der Verlauf konnte nicht geladen werden." })); return; }
        tlHost.replaceChildren.apply(tlHost, watched.slice(0, 12).map(function (t, i) { return global.QXEvidence.watchTimeline(t, nameOf(ctx, t), trs[i], X.routes.stock(t)); }));
      });
    }
    main.append(X.world("Zuletzt analysiert", recent.length ? null : "Aktien, die du analysierst oder beobachtest, erscheinen hier. Tippe auf einer Aktienseite auf „Beobachten“.",
      recent.length ? [X.rail(recent.slice(0, 12).map(function (t) { return X.poster({ ticker: t, name: nameOf(ctx, t), story: "Zuletzt analysiert" }); }), "Zuletzt analysiert")] : []));
    var interesting = el("div", {}, [X.loading()]);
    main.append(interesting);
    main.append(X.world("Bekannte Aktien", "Ein schneller Einstieg.", [X.rail(KNOWN.map(function (t) { return X.poster({ ticker: t, name: nameOf(ctx, t), story: "Analyse öffnen" }); }), "Bekannte Aktien")]));
    var r = await Promise.all([ctx.api.getSetupScreenIndex().catch(function () { return null; }), ctx.api.getStrategyIndex().catch(function () { return null; }), screeningRows(ctx)]);
    var parts = [], rowBy = r[2];
    /* Neu in einer Strategie: EINE Reihe je Strategie, das Datum einmal im
       Kopf - statt derselben Klammer an jeder Zeile. */
    if (r[1] && r[1].historicalEvidence && r[1].historicalEvidence.transitions) {
      var he = r[1].historicalEvidence;
      he.transitions.filter(function (t) { return t.entered && t.entered.length; }).forEach(function (t) {
        var label = ((r[1].profiles || []).filter(function (p) { return p.profileId === t.profileId; })[0] || {}).label || t.profileId;
        parts.push(X.world("Neu in „" + label.split(" · ")[0] + "“", "Zwischen den veröffentlichten Ständen vom " + X.dateDe(he.from) + " und " + X.dateDe(he.to) + " – kein Ereignis von heute.",
          [X.rail(ctx.commonFirst(t.entered).slice(0, 12).map(function (tk) { return quantPoster(ctx, tk, rowBy, { story: "Erfüllt jetzt alle Bedingungen", foot: "Neu seit " + X.dateDe(he.to) }); }), "Neu in " + label)],
          { href: X.routes.strategy(t.profileId), label: "Strategie ansehen →" }));
      });
    }
    if (r[0] && r[0].state === "AVAILABLE") {
      var conf = r[0].states.filter(function (st) { return st.state === "CONFIRMED"; })[0];
      var rows = conf ? [].concat.apply([], conf.rules.map(function (x) { return (x.tickers || []).map(function (t) { return { t: t, plain: x.plain }; }); })) : [];
      if (rows.length) parts.unshift(X.world("Setup bestätigt", "Alle Bedingungen eines Setups erfüllt · Stand " + X.dateDe(r[0].asOf) + ".",
        [X.rail(ctx.commonFirst(rows.map(function (x) { return x.t; })).slice(0, 12).map(function (t) { return quantPoster(ctx, t, rowBy, { story: "Setup bestätigt", foot: "Setup bestätigt" }); }), "Setup bestätigt")], { href: X.routes.screener("frage=setups"), label: "Alle Setups →" }));
    }
    interesting.replaceChildren.apply(interesting, parts.length ? parts : [X.notice("Gerade nichts abrufbar", "Die aktuellen Stände konnten nicht geladen werden.")]);
  }

  global.QXPages = { CLAIM: CLAIM, CLAIM_LEAD: CLAIM_LEAD, PROMISES: PROMISES, WATCH_VALUE: WATCH_VALUE, home: home, radar: radar, radarCard: radarCard, screener: screener, strategies: strategies, stocks: stocks, QUESTIONS: QUESTIONS, SIMPLE_THRESHOLD: SIMPLE_THRESHOLD };
})(window);
