/* =========================================================================
   VISION UNIVERSE — portfolios/portfolios.js            Bereich „Portfolios“

   Bündelt alle Musterdepots an einer Stelle (Owner 06.11.2026, Plan §11):
     Supertrader-Musterdepots je Methode + VU Trendfolge 52W + Hausstrategie,
     Quant-Musterdepots (fünf Profile), KI-Depot A und B.
   Nur Darstellung: liest die Artefakte der Erzeuger und rechnet keine Regel, keinen Bestand
   und keine Depot-Wertentwicklung nach. Eine Depot-Wertentwicklung erscheint nur, wenn der
   Export sie selbst führt (Quant: nav mit performance.state = PUBLISHED; KI: nav). Je Position
   steht die Veränderung seit Aufnahme (Schluss laut Export gegen Aufnahmekurs), wie auf
   /quant/musterdepots/ und im Supertrader-Reiter. Keine Backtest-Renditen.

     /portfolios/                     alle Depots als Kacheln
     /portfolios/#/<gruppe>           nur Supertrader, Quant oder KI
     /portfolios/#/<gruppe>/<id>      ein Depot: Bestand, Einstieg/Stopp, Begründung, Protokoll

   Quellen (Erzeuger siehe core/registry/domains.json):
     supertrader/data/portfolio.json, trend52.json, ledger/VU_HOUSE_HS4_V03.json, registry-core.json
     quant/data/product/model-depots-v1.json (Modell aus quant/musterdepots/depots.js)
     portfolios/data/ki-depots-v1.json (Strang Edge 2; fehlt er, zeigt die Kachel den Start)
   Bausteine aus assets/vu-ui.js (VUUI, Redesign 2027).
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUPortfolios = api;
  if (root.document && root.document.getElementById("pf-main")) api.start(root.document);
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  var LABEL = "Rechenmodell, kein echtes Geld";
  var KI_START = "2026-11-06";
  var SRC = {
    stPortfolio: "/supertrader/data/portfolio.json",
    stTrend: "/supertrader/data/trend52.json",
    stHouse: "/supertrader/data/ledger/VU_HOUSE_HS4_V03.json",
    stRegistry: "/supertrader/data/registry-core.json",
    quant: "/quant/data/product/model-depots-v1.json",
    ki: "/portfolios/data/ki-depots-v1.json",
    names: "/quant/data/product/universe-list-v1.json.gz"
  };
  var GROUPS = [
    { id: "supertrader", label: "Supertrader", title: "Supertrader-Musterdepots", lead: "Methoden bekannter Trader, streng nach Regel gerechnet, mit Einstieg und Stopp je Position." },
    { id: "quant", label: "Quant", title: "Quant-Musterdepots", lead: "Fünf Faktor-Profile, einmal im Monat nach Regel umgeschichtet." },
    { id: "ki", label: "KI", title: "KI-Depots", lead: "Zwei Depots, die eine KI nach fester Regel zusammenstellt, mit Begründung je Titel." }
  ];
  /* Methode in einem Satz für Depots, deren Erzeuger keinen eigenen Satz liefert (Supertrader nutzt tagline). */
  var KI_PENDING = [
    { id: "a", name: "KI-Depot A", method: "Eine KI wählt Aktien anonym nur aus Kennzahlen, nach einer vorher festgelegten und rückgerechneten Regel." },
    { id: "b", name: "KI-Depot B", method: "Eine KI wählt Aktien mit Kennzahlen, Nachrichten und Einschätzungen von Analysten und begründet jeden Titel." }
  ];

  /* Methode in einem Satz, neutral nach docs/legal/WORTWAHL.md („Aufnahme/Abgabe“ statt Kauf/Verkauf); die Taglines der
     Registry bleiben auf den Supertrader-Seiten. Fehlt ein Eintrag, gilt die Tagline. */
  var ST_METHOD = {
    MINERVINI_VCP: "Führende Aktien, deren Schwankungen kleiner werden; das Modell nimmt sie beim Ausbruch auf.",
    DONCHIAN_TURTLE: "Aufnahme, wenn der Kurs über das Hoch der letzten 20 Tage steigt; Abgabe, wenn der Trend bricht.",
    DARVAS_BOX: "Steigende Kisten: Aufnahme beim Ausbruch aus der Kiste, Stopp an ihrer Unterkante.",
    WEINSTEIN_STAGE: "Jede Aktie durchläuft vier Phasen; das Modell hält nur Aktien in Phase 2, dem Aufwärtstrend.",
    MOMENTUM_BREAKOUT: "Die stärksten Aktien nach einer ruhigen Pause; Aufnahme beim Ausbruch aus der Pause.",
    VU_TREND_52W: "Die stärksten Aktien nahe dem 52-Wochen-Hoch, gehalten, bis der Trend nachlässt; monatlich geprüft."
  };
  /* Quant-Regel ohne „Kauft …“ am Satzanfang (gleicher Inhalt, neutrale Form). */
  function neutralRule(r) { var t = String(r || "").replace(/^Kauft\s+/, ""); return t.charAt(0).toUpperCase() + t.slice(1); }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function dDe(d) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || "")); return m ? m[3] + "." + m[2] + "." + m[1] : "–"; }
  function maxDate(list) { return list.filter(Boolean).sort().pop() || null; }
  function sinceEntry(entry, last) { return isNum(entry) && isNum(last) && entry > 0 ? (last / entry - 1) * 100 : null; }

  /* ---------------------------------------------------------------- Modell (rein, testbar)
     Ein Depot: { group, id, name, method, by, liveSince, asOf, positions[], protocol[], perf, stops, reasons,
                  pending, source:{href,label}, note }
     Position:  { ticker, name, weight, since, entryPrice, lastPrice, lastDate, currency, stop, changePct, reason }
     Protokoll: { date, action: REIN|RAUS, ticker, weight, price, returnPct, reason } */
  function fromSupertrader(pf, reg) {
    var meta = {};
    ((reg && reg.strategies) || []).forEach(function (s) { meta[s.strategy_id] = s; });
    return Object.keys((pf && pf.strategies) || {}).map(function (id) {
      var s = pf.strategies[id], m = meta[id] || {};
      var positions = (s.positions || []).map(function (p) {
        return { ticker: p.symbol, weight: p.weightPct, since: p.entryDate, entryPrice: p.entryPrice, lastPrice: p.lastPrice, lastDate: s.asOf,
          currency: "USD", stop: isNum(p.stop) ? p.stop : null, changePct: sinceEntry(p.entryPrice, p.lastPrice) };
      });
      var protocol = [];
      (s.positions || []).forEach(function (p) { protocol.push({ date: p.entryDate, action: "REIN", ticker: p.symbol, weight: p.initialWeightPct, price: p.entryPrice }); });
      (s.closed || []).forEach(function (c) {
        protocol.push({ date: c.entryDate, action: "REIN", ticker: c.symbol });
        protocol.push({ date: c.exitDate, action: "RAUS", ticker: c.symbol, returnPct: isNum(c.returnPct) ? c.returnPct * 100 : null });
      });
      return { group: "supertrader", id: m.slug || id.toLowerCase(), key: id, name: m.world_name || id, method: ST_METHOD[id] || m.tagline || "", by: m.originator || "",
        liveSince: s.startDate, asOf: s.asOf, positions: positions, protocol: protocol, perf: null, stops: true, cashPct: s.cashPct,
        source: { href: m.slug ? "/supertrader/strategies/" + m.slug + "/" : "/supertrader/strategies/#musterdepots", label: "Methode in Supertrader" } };
    });
  }
  function fromTrend52(t, reg) {
    if (!t || !t.portfolio) return null;
    var m = ((reg && reg.strategies) || []).filter(function (s) { return s.strategy_id === t.strategyId; })[0] || {};
    var positions = (t.portfolio.positions || []).map(function (p) {
      return { ticker: p.symbol, weight: p.weight, since: p.entryDate, entryPrice: p.entryPrice, lastPrice: p.lastPrice, lastDate: t.asOf, currency: "USD", stop: null, changePct: sinceEntry(p.entryPrice, p.lastPrice) };
    });
    var protocol = (t.executions || []).map(function (e) { return { date: e.date, action: e.side === "SELL" ? "RAUS" : "REIN", ticker: e.symbol, weight: e.side === "SELL" ? null : e.weight, price: e.price }; });
    return { group: "supertrader", id: m.slug || "vu-trendfolge-52w", key: t.strategyId, name: m.world_name || "VU Trendfolge 52W", method: ST_METHOD[t.strategyId] || m.tagline || "", by: "Vision Universe",
      liveSince: t.liveSince, asOf: t.asOf, positions: positions, protocol: protocol, perf: null, stops: false, cashPct: t.portfolio.cashPct,
      source: { href: m.slug ? "/supertrader/strategies/" + m.slug + "/" : "/supertrader/strategies/", label: "Methode in Supertrader" } };
  }
  function fromHouse(h) {
    if (!h || !h.current) return null;
    var buys = {};
    (h.decisions || []).forEach(function (d) { (d.buys || []).forEach(function (t) { buys[t] = d.executeOn || d.date; }); });
    var positions = (h.current.holdings || []).map(function (x) { return { ticker: x.ticker, weight: x.weight, since: buys[x.ticker] || null, entryPrice: null, lastPrice: null, currency: "USD", stop: null, changePct: null }; });
    var protocol = [];
    (h.decisions || []).forEach(function (d) {
      var on = d.executeOn || d.date;
      (d.buys || []).forEach(function (t) { protocol.push({ date: on, action: "REIN", ticker: t }); });
      (d.sells || []).forEach(function (t) { protocol.push({ date: on, action: "RAUS", ticker: t }); });
    });
    return { group: "supertrader", id: "hausstrategie", key: h.strategyId, name: "VU Hausstrategie", method: "20 große US-Firmen im Aufwärtstrend, mit Kaufdruck im Volumen und starken Quartalszahlen; die Regeln sind eingefroren.", by: "Vision Universe",
      liveSince: h.liveSince, asOf: h.current.date, positions: positions, protocol: protocol, perf: null, stops: false, nextDecision: h.nextDecision,
      source: { href: "/supertrader/hausstrategie/", label: "Hausstrategie in Supertrader" } };
  }
  function fromQuant(doc) {
    if (!doc || doc.schemaVersion !== "model-depots-1.0.0" || doc.label !== LABEL || doc.recommendation !== false || !Array.isArray(doc.depots)) return [];
    var pub = !!(doc.performance && doc.performance.state === "PUBLISHED");
    return doc.depots.map(function (d) {
      var n = Array.isArray(d.nav) && d.nav.length ? d.nav[d.nav.length - 1] : null;
      return { group: "quant", id: d.profileId, key: d.profileId, name: d.name, method: neutralRule(d.rule), by: "Quant-Profil",
        liveSince: doc.liveStart, asOf: doc.asOf, stops: false,
        perf: pub && n ? { pct: (n[1] - 1) * 100, since: doc.liveStart, asOf: n[0] } : null,
        positions: (d.positions || []).map(function (p) { return { ticker: p.ticker, weight: p.weight, since: p.since, entryPrice: p.entryPrice, lastPrice: pub ? p.lastPrice : null, lastDate: p.lastDate, currency: "USD", stop: null, changePct: pub ? sinceEntry(p.entryPrice, p.lastPrice) : null }; }),
        protocol: (d.protocol || []).map(function (e) { return { date: e.date, action: e.action, ticker: e.ticker, weight: e.action === "REIN" ? e.weight : null, price: e.price }; }),
        nextDecision: d.nextRebalance,
        source: { href: "/quant/musterdepots/#/" + encodeURIComponent(d.profileId), label: "Depot in Quant" } };
    });
  }
  function validKi(doc) { return !!(doc && /^ki-depots-1\./.test(doc.schemaVersion || "") && doc.label === LABEL && doc.recommendation === false && Array.isArray(doc.depots)); }
  function fromKi(doc) {
    if (!validKi(doc)) return KI_PENDING.map(function (k) { return { group: "ki", id: k.id, key: "KI_" + k.id.toUpperCase(), name: k.name, method: k.method, by: "KI", liveSince: KI_START, asOf: null, positions: [], protocol: [], perf: null, stops: false, reasons: true, pending: true }; });
    return doc.depots.map(function (d) {
      var n = Array.isArray(d.nav) && d.nav.length ? d.nav[d.nav.length - 1] : null;
      return { group: "ki", id: String(d.id), key: "KI_" + String(d.id).toUpperCase(), name: d.name, method: d.method || d.rule || "", rule: d.rule, by: "KI",
        liveSince: doc.liveStart || KI_START, asOf: doc.asOf, stops: (d.positions || []).some(function (p) { return isNum(p.stop); }), reasons: true,
        perf: n && isNum(n[1]) ? { pct: (n[1] - 1) * 100, since: doc.liveStart || KI_START, asOf: n[0] } : null,
        positions: (d.positions || []).map(function (p) { return { ticker: p.ticker, name: p.name, weight: p.weight, since: p.since, entryPrice: p.entryPrice, lastPrice: p.lastPrice, lastDate: p.lastDate, currency: p.currency || "USD", stop: isNum(p.stop) ? p.stop : null, changePct: sinceEntry(p.entryPrice, p.lastPrice), reason: p.reason || "" }; }),
        protocol: (d.protocol || []).map(function (e) { return { date: e.date, action: e.action, ticker: e.ticker, weight: e.weight, price: e.price, reason: e.reason || "" }; }),
        pending: false };
    });
  }
  /** Alle Depots in fester Reihenfolge: Supertrader (Methoden nach Positionen, dann Trendfolge, Hausstrategie), Quant, KI. */
  function collect(src) {
    var s = src || {};
    var st = fromSupertrader(s.stPortfolio, s.stRegistry).sort(function (a, b) { return b.positions.length - a.positions.length || a.name.localeCompare(b.name, "de"); });
    return [].concat(st, [fromTrend52(s.stTrend, s.stRegistry), fromHouse(s.stHouse)].filter(Boolean), fromQuant(s.quant), fromKi(s.ki));
  }
  function groupedLog(depot) {
    var by = {}, order = [];
    (depot.protocol || []).forEach(function (e) {
      if (!e.date) return;
      if (!by[e.date]) { by[e.date] = { date: e.date, rein: [], raus: [] }; order.push(e.date); }
      by[e.date][e.action === "RAUS" ? "raus" : "rein"].push(e);
    });
    return order.sort().reverse().map(function (d) { return by[d]; });
  }
  function parseRoute(hash) {
    var p = String(hash || "").replace(/^#\/?/, "").split("?")[0].split("/").filter(Boolean).map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } });
    var g = GROUPS.filter(function (x) { return x.id === p[0]; })[0];
    return { group: g ? g.id : null, id: g && p[1] ? p[1] : null, unknown: !!p[0] && !g };
  }
  function href(d) { return "#/" + d.group + "/" + encodeURIComponent(d.id); }

  /* ---------------------------------------------------------------- Ansichten */
  var U = null, NAMES = {};
  function esc(s) { return U.esc(s); }
  function nameOf(p) { return p.name || NAMES[p.ticker] || p.ticker; }
  function pctW(w) { return isNum(w) ? U.num(w * 100, 1) + " %" : "–"; }
  function stockHref(t) { return "/aktie/" + encodeURIComponent(t); }
  function label() { return '<p class="pf-label">' + U.glyph("check", 14) + "<span>" + LABEL + "</span></p>"; }
  function perfLine(d) {
    if (d.pending) return '<span class="pf-perf vu-xs vu-mu">startet am ' + dDe(d.liveSince) + ", erste Werte folgen</span>";
    if (d.perf) return '<span class="pf-perf">' + U.chg(d.perf.pct, { digits: 1 }) + '<span class="vu-xs vu-mu">seit ' + dDe(d.perf.since) + "</span></span>";
    return '<span class="pf-perf vu-xs vu-mu">Depot-Wertentwicklung noch nicht veröffentlicht</span>';
  }
  function card(d) {
    var meta = d.pending ? "" : '<span><b class="vu-num">' + d.positions.length + "</b> Positionen</span><span>Stand " + dDe(d.asOf) + "</span>";
    return '<a class="pf-card" href="' + esc(href(d)) + '"><span class="pf-card__top"><b class="pf-card__name">' + esc(d.name) + "</b>" + U.glyph("next", 16) + "</span>" +
      (d.by ? '<span class="pf-card__by">' + esc(d.by) + "</span>" : "") +
      '<span class="pf-card__method">' + esc(d.method) + "</span>" +
      '<span class="pf-card__meta">' + meta + "</span>" + perfLine(d) + "</a>";
  }
  function overview(all, groupId) {
    var groups = GROUPS.filter(function (g) { return !groupId || g.id === groupId; });
    var tabs = '<nav class="vu-chips pf-tabs" aria-label="Depotgruppe">' + [{ id: "", label: "Alle " + all.length }].concat(GROUPS.map(function (g) { return { id: g.id, label: g.label + " " + all.filter(function (d) { return d.group === g.id; }).length }; })).map(function (t) {
      var on = (groupId || "") === t.id;
      return '<a class="vu-chip" href="#/' + t.id + '"' + (on ? ' aria-current="page"' : "") + ">" + esc(t.label) + "</a>";
    }).join("") + "</nav>";
    return '<header class="pf-intro"><p class="vu-ltag">Portfolios</p><h1 class="vu-lt">Alle Musterdepots</h1>' +
      '<p class="vu-lead">Jedes Depot nimmt Aktien streng nach seiner Methode auf und gibt sie nach Regel wieder ab. So sieht man, was eine Methode tut, nicht, was du tun solltest.</p>' + label() + "</header>" + tabs +
      groups.map(function (g) {
        var list = all.filter(function (d) { return d.group === g.id; });
        return '<section class="pf-sec" aria-labelledby="pf-g-' + g.id + '">' + '<div class="vu-sect"><h2 id="pf-g-' + g.id + '">' + esc(g.title) + "</h2></div>" +
          '<p class="vu-sm vu-mu pf-glead">' + esc(g.lead) + "</p>" +
          '<div class="pf-grid">' + (list.length ? list.map(card).join("") : U.blank("Diese Depots sind gerade nicht verfügbar.", { verdict: false })) + "</div></section>";
      }).join("") +
      U.help("Wertentwicklung zeigen wir nur ab dem Start des Depots (vorwärts) und nur, wenn der Erzeuger sie veröffentlicht. Ergebnisse aus Rückrechnungen (Backtests) zeigen wir hier nicht.") + foot(null);
  }
  function posRow(d, p) {
    var facts = [["Gewicht", pctW(p.weight)], ["Aufnahme", dDe(p.since)], [d.stops ? "Einstieg laut Methode" : "Aufnahmekurs", U.money(p.entryPrice, p.currency)]];
    if (d.stops) facts.push(["Stopp laut Methode", U.money(p.stop, p.currency)]);
    if (isNum(p.lastPrice)) facts.push(["Schluss " + (p.lastDate ? dDe(p.lastDate).slice(0, 6) : ""), U.money(p.lastPrice, p.currency)]);
    return '<li class="pf-pos"><a class="pf-pos__head" href="' + esc(stockHref(p.ticker)) + '">' + U.logo(p.ticker) +
      '<span class="pf-pos__name"><b>' + esc(nameOf(p)) + "</b><span>" + esc(p.ticker) + "</span></span>" +
      '<span class="pf-pos__chg"><span class="vu-xs vu-mu">seit Aufnahme</span>' + U.chg(p.changePct, { digits: 1 }) + "</span></a>" +
      '<dl class="pf-facts">' + facts.map(function (f) { return "<div><dt>" + esc(f[0]) + '</dt><dd class="vu-num">' + esc(f[1]) + "</dd></div>"; }).join("") + "</dl>" +
      (d.reasons ? '<p class="pf-reason"><b>Begründung des Modells:</b> ' + esc(p.reason || "–") + "</p>" : "") + "</li>";
  }
  function logEntry(e, kind) {
    var extra = kind === "rein" ? (isNum(e.price) ? " zu " + U.money(e.price, "USD") : "") + (isNum(e.weight) ? " · " + pctW(e.weight) : "") : "";
    return '<li class="pf-log__e pf-log__e--' + kind + '"><span class="pf-log__mark" aria-hidden="true">' + (kind === "rein" ? "+" : "−") + "</span>" +
      '<a href="' + esc(stockHref(e.ticker)) + '"><b>' + esc(nameOf({ ticker: e.ticker })) + "</b> <span class=\"vu-mu\">" + esc(e.ticker) + "</span></a>" +
      '<span class="pf-log__x vu-xs vu-mu">' + (kind === "rein" ? "rein" : "raus") + esc(extra) + "</span>" +
      (kind === "raus" && isNum(e.returnPct) ? U.chg(e.returnPct, { digits: 1 }) : "") +
      (e.reason ? '<span class="pf-log__why vu-xs">' + esc(e.reason) + "</span>" : "") + "</li>";
  }
  function detail(d) {
    var g = GROUPS.filter(function (x) { return x.id === d.group; })[0];
    var log = groupedLog(d);
    var tiles = [U.tile("Positionen", d.pending ? "–" : String(d.positions.length)), U.tile("Live seit", dDe(d.liveSince)), U.tile("Datenstand", dDe(d.asOf))];
    tiles.push(d.perf ? '<div class="vu-tile"><div class="vu-tile__label">Seit Start</div><div class="vu-tile__value">' + U.chg(d.perf.pct, { big: true, digits: 1 }) + '</div><div class="vu-tile__sub">Stand ' + esc(dDe(d.perf.asOf)) + ", nach Kosten</div></div>"
      : U.tile("Seit Start", "–", d.pending ? "erste Werte folgen" : "nicht veröffentlicht"));
    var rows = d.positions.slice().sort(function (a, b) { return (b.weight || 0) - (a.weight || 0) || a.ticker.localeCompare(b.ticker); });
    var body = d.pending ? U.blank("Das Depot startet am " + dDe(d.liveSince) + ". Die ersten Positionen und Werte folgen mit dem ersten Lauf.", { verdict: false })
      : rows.length ? '<ul class="pf-list">' + rows.map(function (p) { return posRow(d, p); }).join("") + "</ul>"
        : U.blank("Das Depot hält heute keine Aktie" + (isNum(d.cashPct) ? " (" + U.num(d.cashPct * 100, 0) + " % Bargeld im Modell)" : "") + ". Die Methode wartet auf ihr nächstes Muster.", { verdict: false });
    return '<a class="pf-back" href="#/' + d.group + '">' + U.glyph("back", 16) + "<span>" + esc(g.title) + "</span></a>" +
      '<header class="pf-intro"><p class="vu-ltag">Portfolios · ' + esc(g.label) + '</p><h1 class="vu-lt">' + esc(d.name) + "</h1>" +
      (d.by ? '<p class="vu-sm vu-mu">' + esc(d.by) + "</p>" : "") + '<p class="vu-lead">' + esc(d.method) + "</p>" + label() + "</header>" +
      '<div class="vu-grid pf-tiles">' + tiles.join("") + "</div>" +
      '<section class="pf-sec">' + U.sect("Bestand", { level: 2 }) +
      '<p class="vu-xs vu-mu pf-cap">Gewicht im Modell, Aufnahme mit Datum und Kurs' + (d.stops ? ", Stopp laut Methode" : "") + "; rechts die Veränderung seit Aufnahme." + (d.reasons ? " Je Titel die Begründung des Modells." : "") + "</p>" + body + "</section>" +
      (d.rule && d.rule !== d.method ? '<section class="pf-sec">' + U.sect("Regel", { level: 2 }) + '<p class="vu-sm">' + esc(d.rule) + "</p></section>" : "") +
      '<section class="pf-sec">' + U.sect("Protokoll rein/raus", { level: 2 }) +
      (log.length ? '<div class="vu-stack">' + log.map(function (x) {
        return '<div class="vu-box pf-log"><h3 class="vu-sm">' + dDe(x.date) + '</h3><p class="vu-xs vu-mu">' + x.rein.length + " rein · " + x.raus.length + " raus</p>" +
          '<ul class="pf-log__l">' + x.rein.map(function (e) { return logEntry(e, "rein"); }).join("") + x.raus.map(function (e) { return logEntry(e, "raus"); }).join("") + "</ul></div>";
      }).join("") + "</div>" : U.blank(d.pending ? "Noch kein Eintrag." : "Noch keine Bewegung.", { verdict: false })) + "</section>" +
      (d.source ? '<section class="pf-sec"><div class="vu-stack">' + U.navcard({ glyph: "list", title: d.source.label, sub: "Regeln, Herkunft und weitere Angaben", href: d.source.href }) + "</div></section>" : "") +
      U.help(d.stops ? "Stopp laut Methode: Fällt der Kurs darunter, gibt das Musterdepot die Aktie nach Regel ab. Ein Rechenpunkt, kein Kursziel und keine Order." : "Ein Musterdepot ist ein Rechenmodell. Es zeigt, was die Regel tut, keine echten Orders.") + foot(d);
  }
  function foot(d) {
    return (U.legal("modelPortfolio") || "") +
      '<p class="pf-foot">' + (d ? "Datenstand " + dDe(d.asOf) + ". " : "") + "Kurse: veröffentlichte Schlusskurse (Tiingo, split-bereinigt). Musterdepots sind Rechenmodelle ohne echtes Geld. Keine Anlageberatung, keine Empfehlung.</p>";
  }
  function render(all, hash) {
    var r = parseRoute(hash);
    if (r.unknown) return overview(all, null);
    if (r.id) {
      var d = all.filter(function (x) { return x.group === r.group && x.id === r.id; })[0];
      if (!d) return '<a class="pf-back" href="#/">' + U.glyph("back", 16) + "<span>Alle Musterdepots</span></a>" + U.blank("Dieses Musterdepot gibt es nicht.");
      return detail(d);
    }
    return overview(all, r.group);
  }

  /* ---------------------------------------------------------------- Laden */
  function getJSON(path) { return root.fetch(path, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); }); }
  function getGz(path) {
    return root.fetch(path, { cache: "no-cache" }).then(function (r) { if (!r.ok || typeof root.DecompressionStream !== "function") throw new Error("GZ"); return new root.Response(r.body.pipeThrough(new root.DecompressionStream("gzip"))).json(); });
  }
  function start(doc) {
    U = root.VUUI;
    var main = doc.getElementById("pf-main"), all = null;
    function show(focus) {
      if (!all) return;
      main.innerHTML = render(all, root.location.hash);
      var h = main.querySelector("h1"); doc.title = (h && h.textContent !== "Alle Musterdepots" ? h.textContent + " – " : "") + "Portfolios · Vision Universe®";
      if (focus) { main.focus(); root.scrollTo(0, 0); }
    }
    var keys = ["stPortfolio", "stTrend", "stHouse", "stRegistry", "quant", "ki"];
    Promise.all(keys.map(function (k) { return getJSON(SRC[k]).catch(function () { return null; }); })).then(function (r) {
      var src = {}; keys.forEach(function (k, i) { src[k] = r[i]; });
      all = collect(src);
      if (!all.some(function (d) { return !d.pending; })) throw new Error("EMPTY");
      show(false);
      root.addEventListener("hashchange", function () { show(true); });
      getGz(SRC.names).then(function (n) { (n && n.entries || []).forEach(function (e) { if (e && e.s && e.n && e.n !== e.s) NAMES[e.s] = e.n; }); show(false); }).catch(function () {});
    }).catch(function () {
      main.innerHTML = '<p class="vu-ltag">Portfolios</p><h1 class="vu-lt">Alle Musterdepots</h1>' + U.blank("Die Musterdepots sind gerade nicht verfügbar. Bitte später erneut versuchen.");
    });
    if (U.bindHelp) U.bindHelp(main);
  }

  return { LABEL: LABEL, SRC: SRC, GROUPS: GROUPS, KI_START: KI_START, collect: collect, fromSupertrader: fromSupertrader, fromTrend52: fromTrend52, fromHouse: fromHouse,
    fromQuant: fromQuant, fromKi: fromKi, validKi: validKi, groupedLog: groupedLog, parseRoute: parseRoute, render: function (all, hash) { U = U || root.VUUI; return render(all, hash); }, start: start, NAMES: NAMES };
});
