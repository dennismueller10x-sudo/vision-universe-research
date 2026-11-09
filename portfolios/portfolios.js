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
     /portfolios/#/<gruppe>/<id>      ein Depot: Methodenbild, Verteilung, seit Aufnahme mit Ungültig-Marke, Protokoll

   Quellen (Erzeuger siehe core/registry/domains.json):
     supertrader/data/portfolio.json, trend52.json, ledger/VU_HOUSE_HS4_V03.json, registry-core.json
     quant/data/product/model-depots-v1.json (Modell aus quant/musterdepots/depots.js)
     quant/data/product/ki-depots-v1.json (Strang Edge 2, Schema docs/research/edge2/ki/EXPORT_SCHEMA.md;
       fehlt er oder fehlt der erste Aufnahmekurs, zeigt die Kachel den Start)
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
    ki: "/quant/data/product/ki-depots-v1.json",
    names: "/quant/data/product/universe-list-v1.json.gz"
  };
  var GROUPS = [
    { id: "supertrader", label: "Supertrader", title: "Supertrader-Musterdepots", lead: "Methoden bekannter Trader, streng nach Regel gerechnet, mit Aufnahme und Ungültig-Marke je Position." },
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
    DARVAS_BOX: "Steigende Kisten: Aufnahme beim Ausbruch aus der Kiste, Ungültig-Marke an ihrer Unterkante.",
    WEINSTEIN_STAGE: "Jede Aktie durchläuft vier Phasen. Das Musterdepot hält nur Aktien in Phase 2, dem Aufwärtstrend.",
    MOMENTUM_BREAKOUT: "Die stärksten Aktien nach einer ruhigen Pause; Aufnahme beim Ausbruch aus der Pause.",
    VU_TREND_52W: "Die stärksten Aktien nahe dem 52-Wochen-Hoch, gehalten, bis der Trend nachlässt; monatlich geprüft."
  };
  /* Ein Name je Methode (supertrader/assets/st-names.js, „Trader · Muster“); ohne die Datei der Name aus der Registry. */
  function stName(strategyId, fallback) {
    var N = root.STNames, cid = N && N.methodOfDepot ? N.methodOfDepot(strategyId) : null;
    return cid ? N.method(cid).name : fallback;
  }
  /* Quant-Regel ohne „Kauft …“ am Satzanfang (gleicher Inhalt, neutrale Form). */
  function neutralRule(r) { var t = String(r || "").replace(/^Kauft\s+/, ""); return t.charAt(0).toUpperCase() + t.slice(1); }
  /* Texte der Erzeuger in der Wortwahl der Seite (docs/legal/WORTWAHL.md): „Einstieg“ → „Aufnahme“, „Stopp“ → „Ungültig-Marke“. */
  function neutralText(t) { return String(t || "").replace(/Einstiegs?(kurs)?/g, function (m, k) { return k ? "Aufnahmekurs" : "Aufnahme"; }).replace(/Stopp(-Marke)?/g, "Ungültig-Marke"); }
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
      return { group: "supertrader", id: m.slug || id.toLowerCase(), key: id, name: stName(id, m.world_name || id), fach: m.world_name || id, method: ST_METHOD[id] || m.tagline || "", by: m.originator || "",
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
  /* Schema ki-depots-1.0.0 (Edge 2): slug für die Adresse, performance.index (Start 100) mit changeSinceStart (Anteil),
     Positionen mit currentWeight/targetWeight und changeSinceEntry (Anteil), pending = Entscheidung ohne Aufnahmekurs. */
  function fromKi(doc) {
    if (!validKi(doc)) return KI_PENDING.map(function (k) { return { group: "ki", id: k.id, key: "KI_" + k.id.toUpperCase(), name: k.name, method: k.method, by: "KI", liveSince: KI_START, asOf: null, positions: [], protocol: [], perf: null, stops: false, reasons: true, pending: true }; });
    return doc.depots.map(function (d) {
      var slug = String(d.slug || d.id).toLowerCase(), pf = d.performance || {}, idx = Array.isArray(pf.index) && pf.index.length ? pf.index : null;
      var last = idx ? idx[idx.length - 1] : null;
      var perfPct = isNum(pf.changeSinceStart) ? pf.changeSinceStart * 100 : last && isNum(last[1]) && isNum(idx[0][1]) && idx[0][1] > 0 ? (last[1] / idx[0][1] - 1) * 100 : null;
      var positions = (d.positions || []).map(function (p) {
        return { ticker: p.ticker, name: p.name, weight: isNum(p.currentWeight) ? p.currentWeight : p.targetWeight, since: p.since, entryPrice: p.entryPrice, lastPrice: p.lastPrice, lastDate: p.lastDate,
          currency: p.currency || "USD", stop: null, changePct: isNum(p.changeSinceEntry) ? p.changeSinceEntry * 100 : sinceEntry(p.entryPrice, p.lastPrice), reason: p.reason || "", neutralized: p.reasonNeutralized === true, news: p.news || [] };
      });
      var pend = d.pending && Array.isArray(d.pending.positions) ? { date: d.pending.decisionDate, entry: d.pending.entry, positions: d.pending.positions.map(function (p) { return { ticker: p.ticker, name: p.name, weight: p.targetWeight, reason: p.reason || "", neutralized: p.reasonNeutralized === true, news: p.news || [] }; }) } : null;
      return { group: "ki", id: slug, key: d.id, name: d.name, method: d.method || "", rule: d.rule, by: "KI",
        liveSince: doc.liveStart || KI_START, asOf: doc.asOf, stops: false, reasons: true, cashPct: d.cashWeight,
        perf: perfPct !== null && positions.length ? { pct: perfPct, since: pf.start || doc.liveStart || KI_START, asOf: last ? last[0] : doc.asOf } : null,
        positions: positions, decision: pend,
        protocol: (d.protocol || []).map(function (e) { return { date: e.date, action: e.action, ticker: e.ticker, weight: e.weight, price: e.price }; }),
        pending: !positions.length };
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
      by[e.date][e.action === "RAUS" ? "raus" : "rein"].push(e);  // OHNE_KURS: Aufnahme ohne Aufnahmekurs, steht bei „rein“
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
  function cleanName(n) { return String(n || "").replace(/,? (Inc|Corp|Corporation|Ltd|Limited|plc|N\.V\.|S\.A\.|AG|SE|Holdings?|Co|Group Inc)\.?$/i, "").replace(/ Class [A-Z]$/, "").trim(); }
  function nameOf(p) { return cleanName(p.name || NAMES[p.ticker]) || p.ticker; }
  function pctW(w) { return isNum(w) ? U.num(w * 100, 1) + " %" : "–"; }
  function stockHref(t) { return "/aktie/" + encodeURIComponent(t); }
  /* ---------------------------------------------------------------- Methodenbild (rein, festes Bild, kein Fachmodell)
     Konzept mein-bereich-2026-11, Entscheidung 5: Weinstein vier Phasen (Phase 2 hervorgehoben), Darvas Kisten,
     Turtle Kanal, Quant Profil; andere Methoden die schlichte Variante mit Name und Satz (artKind „plain“). */
  var ART_OF = { WEINSTEIN_STAGE: "weinstein", DARVAS_BOX: "darvas", DONCHIAN_TURTLE: "turtle" };
  /* Quant-Profil als Bild: welche Eigenschaften die Regel des Profils betont (aus dem Regelsatz, fest). */
  var QUANT_PROFILE = {
    "quality-compounder": ["quality", "profitability", "risk", "growth"],
    "momentum-leader": ["momentum", "growth", "risk"],
    "garp": ["growth", "quality", "value"],
    "defensive-quality": ["risk", "quality", "profitability", "momentum"],
    "value-momentum": ["value", "momentum", "quality"]
  };
  var FACTORS = [["quality", "Qualität"], ["growth", "Wachstum"], ["momentum", "Trend"], ["value", "Preis"], ["profitability", "Gewinn"], ["risk", "Ruhe"]];
  function artKind(d) { return d.group === "quant" && QUANT_PROFILE[d.id] ? "quant" : ART_OF[d.key] || "plain"; }
  function methodArt(kind, o) {
    var x = o || {}, dark = !!x.dark, w = x.width || 330, ink = dark ? "#fff" : "#000", base = dark ? "#1a1a1a" : "#f0f0f0", mute = "#8c8c8c", lime = "#c8f531";
    /* Hell (Übersicht): Farben über Klassen, damit das Bild dem Theme folgt (portfolios.css .pf-art-*); dunkel (Kopf der Depotseite) fest. */
    var cls = function (c) { return dark ? "" : ' class="' + c + '"'; };
    var svg = function (h, body, label) { return '<svg class="pf-art" width="' + w + '" height="' + h + '" viewBox="0 0 330 ' + h + '" role="img" aria-label="' + esc(label) + '" style="display:block;max-width:100%;height:auto">' + body + "</svg>"; };
    var line = function (pts) { return '<path' + cls("pf-art-i") + ' d="' + pts.map(function (p, i) { return (i ? "L" : "M") + p[0] + " " + p[1]; }).join(" ") + '" fill="none" stroke="' + ink + '" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>'; };
    var text = function (xx, y, t, on) { return '<text' + (on && !dark ? cls("pf-art-it") : "") + ' x="' + xx + '" y="' + y + '" text-anchor="middle" font-size="11" font-weight="800" fill="' + (on ? (dark ? lime : ink) : mute) + '" font-family="Inter,sans-serif">' + esc(t) + "</text>"; };
    if (kind === "weinstein") {
      var zones = [[0, 110, "Basis", 1], [110, 205, "Aufwärts", 2], [205, 265, "Top", 3], [265, 330, "Abwärts", 4]];
      return svg(104, zones.map(function (z) {
        var on = z[3] === 2;
        return '<rect' + (on ? "" : cls("pf-art-b")) + ' x="' + z[0] + '" y="0" width="' + (z[1] - z[0]) + '" height="84" rx="8" fill="' + (on ? lime : base) + '" opacity="' + (on ? (dark ? 0.25 : 0.35) : 1) + '"/>' + text((z[0] + z[1]) / 2, 100, z[3] + " · " + z[2], on);
      }).join("") + line([[0, 70], [40, 66], [70, 72], [100, 64], [120, 58], [160, 38], [190, 26], [215, 18], [240, 22], [260, 16], [285, 30], [310, 50], [330, 66]]), "Vier Phasen nach Weinstein, das Musterdepot hält Phase 2, den Aufwärtstrend");
    }
    if (kind === "darvas") {
      var boxes = [[20, 52, 70, 22], [100, 34, 70, 22], [180, 16, 70, 22]];
      return svg(104, boxes.map(function (b, i) {
        var on = i === boxes.length - 1;
        return '<rect' + (on ? "" : cls("pf-art-b")) + ' x="' + b[0] + '" y="' + b[1] + '" width="' + b[2] + '" height="' + b[3] + '" rx="4" fill="' + (on ? lime : base) + '" opacity="' + (on ? 0.3 : 1) + '" stroke="' + (on ? lime : mute) + '" stroke-dasharray="' + (on ? "0" : "3 3") + '"/>';
      }).join("") + line([[0, 80], [20, 70], [40, 58], [60, 70], [85, 56], [100, 46], [125, 54], [150, 40], [170, 50], [190, 28], [215, 36], [240, 22], [260, 8], [300, 4]]) +
        '<circle' + cls("pf-art-s") + ' cx="260" cy="8" r="4.5" fill="' + lime + '" stroke="' + ink + '" stroke-width="1.6"/>' + text(55, 100, "Kiste", false) + text(135, 100, "Kiste", false) + text(215, 100, "Ausbruch", true), "Darvas-Kisten: Aufnahme beim Ausbruch aus der Kiste");
    }
    if (kind === "turtle") {
      return svg(104, '<path d="M0 30 L120 30 L120 22 L330 22" fill="none" stroke="' + mute + '" stroke-width="1.6" stroke-dasharray="4 4"/>' +
        '<path d="M0 76 L150 76 L150 62 L330 62" fill="none" stroke="' + mute + '" stroke-width="1.6" stroke-dasharray="4 4"/>' +
        '<rect x="230" y="0" width="100" height="84" rx="8" fill="' + lime + '" opacity="' + (dark ? 0.2 : 0.3) + '"/>' +
        line([[0, 60], [30, 48], [60, 66], [90, 40], [120, 56], [150, 44], [180, 52], [210, 36], [230, 20], [260, 12], [300, 16], [330, 8]]) +
        '<circle' + cls("pf-art-s") + ' cx="230" cy="20" r="4.5" fill="' + lime + '" stroke="' + ink + '" stroke-width="1.6"/>' + text(80, 100, "Kanal der letzten 20 Tage", false) + text(280, 100, "Ausbruch", true), "Turtle-Kanal: Aufnahme, wenn der Kurs über das Hoch der letzten 20 Tage steigt");
    }
    if (kind === "quant") {
      var on = QUANT_PROFILE[x.profile] || [];
      return svg(104, FACTORS.map(function (f, i) {
        var hit = on.indexOf(f[0]) >= 0, h = hit ? 64 : 26, bx = 8 + i * 54;
        return '<rect' + (hit ? "" : cls("pf-art-b")) + ' x="' + bx + '" y="' + (84 - h) + '" width="42" height="' + h + '" rx="7" fill="' + (hit ? lime : base) + '"/>' + text(bx + 21, 100, f[1], hit);
      }).join(""), "Profil: betont " + on.map(function (k) { return FACTORS.filter(function (f) { return f[0] === k; })[0][1]; }).join(", "));
    }
    return "";
  }

  /* ---------------------------------------------------------------- Verteilung (rein)
     Ein Feld je Aktie nach Modellgewicht; die kleineren Anteile ab der siebten Aktie als „+N“, Bargeld als eigenes Feld.
     Summe der Felder = Summe der Gewichte + Bargeld. */
  var ALLOC_SHOWN = 6;
  function allocation(positions, cashPct) {
    var rows = (positions || []).filter(function (p) { return isNum(p.weight) && p.weight > 0; }).slice().sort(function (a, b) { return b.weight - a.weight || String(a.ticker).localeCompare(String(b.ticker)); });
    var invested = rows.reduce(function (s, p) { return s + p.weight; }, 0);
    var cash = isNum(cashPct) ? Math.max(0, cashPct) : Math.max(0, 1 - invested);
    if (cash < 0.0005) cash = 0;
    var parts = rows.slice(0, ALLOC_SHOWN).map(function (p) { return { kind: "stock", ticker: p.ticker, weight: p.weight }; });
    var rest = rows.slice(ALLOC_SHOWN);
    if (rest.length) parts.push({ kind: "rest", count: rest.length, weight: rest.reduce(function (s, p) { return s + p.weight; }, 0) });
    if (cash) parts.push({ kind: "cash", weight: cash });
    return { parts: parts, invested: invested, cash: cash, count: rows.length };
  }
  function allocHtml(d) {
    var a = allocation(d.positions, d.cashPct);
    if (!a.count) return "";
    return '<div class="pf-alloc" role="img" aria-label="' + esc(a.count + " Aktien mit " + pctW(a.invested) + ", Bargeld " + pctW(a.cash)) + '">' + a.parts.map(function (p, i) {
      var label = p.kind === "cash" ? "Bargeld" : p.kind === "rest" ? "+" + p.count : p.weight >= 0.08 ? p.ticker : "";
      return '<i class="pf-alloc__' + p.kind + (i === 0 && p.kind === "stock" ? " is-first" : "") + '" style="flex:' + (p.weight * 100).toFixed(2) + '" title="' + esc(p.kind === "stock" ? p.ticker + " " + pctW(p.weight) : label + " " + pctW(p.weight)) + '"><span>' + esc(label) + "</span></i>";
    }).join("") + "</div>" +
      '<p class="vu-xs vu-mu pf-alloc__cap"><b>' + pctW(a.invested) + " in " + a.count + (a.count === 1 ? " Aktie" : " Aktien") + (a.cash ? " · " + pctW(a.cash) + " Bargeld laut Regel" : "") + "</b></p>";
  }

  /* ---------------------------------------------------------------- Mini-Chart seit Aufnahme (rein)
     points: [[iso, schluss]] der letzten 30 Handelstage (quant/data/market/discover-series). Aufnahmepunkt, neongrüne Fläche
     seit Aufnahme, gestrichelte Ungültig-Marke laut Methode (nur wenn die Methode eine führt). */
  function posChart(points, since, stop) {
    var pts = (points || []).filter(function (p) { return p && isNum(p[1]); });
    if (pts.length < 2) return "";
    var v = pts.map(function (p) { return p[1]; }).concat(isNum(stop) ? [stop] : []);
    var mn = Math.min.apply(null, v) * 0.99, mx = Math.max.apply(null, v) * 1.01, w = 92, h = 40;
    if (mx <= mn) mx = mn + 1;
    var X = function (i) { return i * w / (pts.length - 1); }, Y = function (x) { return h - (x - mn) / (mx - mn) * h; };
    var k = pts.findIndex(function (p) { return String(p[0]) >= String(since || ""); });
    var d = pts.map(function (p, i) { return (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(p[1]).toFixed(1); }).join(" ");
    return '<svg class="pf-mini" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '" aria-hidden="true">' +
      (k >= 0 ? '<rect x="' + X(k).toFixed(1) + '" y="0" width="' + (w - X(k)).toFixed(1) + '" height="' + h + '" fill="#c8f531" opacity=".22"/>' : "") +
      (isNum(stop) ? '<line x1="0" x2="' + w + '" y1="' + Y(stop).toFixed(1) + '" y2="' + Y(stop).toFixed(1) + '" class="pf-mini__stop" stroke-dasharray="3 3"/>' : "") +
      '<path d="' + d + '" fill="none" class="pf-mini__line" stroke-width="1.8"/>' +
      (k >= 0 ? '<circle cx="' + X(k).toFixed(1) + '" cy="' + Y(pts[k][1]).toFixed(1) + '" r="3.5" fill="#c8f531" class="pf-mini__dot" stroke-width="1.5"/>' : "") + "</svg>";
  }

  /* ---------------------------------------------------------------- Musterdepot-Seite (Screen p-depot) */
  var KICKER = { supertrader: "Supertrader-Musterdepot", quant: "Quant-Musterdepot", ki: "KI-Depot" };
  var ROWS_SHOWN = 6;
  function dmy(d) { var s = dDe(d); return s.length > 6 ? s.slice(0, 6) : s; }
  function methodHtml(text) { return esc(text).replace(/Phase 2/, '<b class="pf-hl">Phase 2</b>'); }
  function posRow(d, p, i) {
    var sub = "aufgenommen " + (p.since ? dmy(p.since) : "–") + " · " + pctW(p.weight);
    return '<li class="pf-pz' + (i >= ROWS_SHOWN ? " pf-more" : "") + '"' + (i >= ROWS_SHOWN ? " hidden" : "") + '><a class="pf-pz__a" href="' + esc(stockHref(p.ticker)) + '">' + U.logo(p.ticker) +
      '<span class="pf-pz__name"><b>' + esc(nameOf(p)) + "</b><span>" + esc(sub) + "</span></span>" +
      '<span class="pf-pz__chart" data-pf-chart="' + esc(p.ticker) + '"></span>' +
      '<span class="pf-pz__chg">' + U.chg(p.changePct) + "</span></a>" + reasonHtml(d, p) + "</li>";
  }
  function reasonHtml(d, p) {
    if (!d.reasons) return "";
    var news = (p.news || []).slice(0, 3).filter(function (n) { return n && n.title && /^https:\/\//.test(n.url || ""); });
    return '<p class="pf-reason"><b>Begründung laut Methode:</b> ' + esc(p.reason || "–") + (p.neutralized ? ' <span class="vu-xs vu-mu">(sprachlich neutralisiert)</span>' : "") + "</p>" +
      (news.length ? '<ul class="pf-news">' + news.map(function (n) { return '<li><a href="' + esc(n.url) + '" rel="noopener nofollow" target="_blank">' + esc(n.title) + '</a> <span class="vu-xs vu-mu">' + esc([n.source, dDe(n.date)].filter(Boolean).join(", ")) + " · Angabe Dritter</span></li>"; }).join("") + "</ul>" : "");
  }
  function decisionHtml(d) {
    var x = d.decision;
    return '<div class="vu-box pf-decision"><p class="vu-sm"><b>Entscheidung vom ' + dDe(x.date) + '</b>, Aufnahme zum ' + esc(x.entry || "Schluss des nächsten Handelstags") + ". Bis dahin stehen hier Zielgewicht und Begründung, Kurse folgen.</p>" +
      '<ul class="pf-list">' + x.positions.slice().sort(function (a, b) { return (b.weight || 0) - (a.weight || 0); }).map(function (p) {
        return '<li class="pf-pz"><a class="pf-pz__a pf-pz__a--plain" href="' + esc(stockHref(p.ticker)) + '">' + U.logo(p.ticker) + '<span class="pf-pz__name"><b>' + esc(nameOf(p)) + "</b><span>" + esc(p.ticker) + '</span></span><span class="pf-pz__chg"><span class="vu-xs vu-mu">Zielgewicht</span><b class="vu-num">' + pctW(p.weight) + "</b></span></a>" + reasonHtml(d, p) + "</li>";
      }).join("") + "</ul></div>";
  }
  /* Zeitleiste: je Tag und Richtung eine Zeile („Ashland aufgenommen“, „Nucor abgegeben“), darunter Kurse bzw. Veränderung. */
  function timeline(d) {
    var rows = [];
    groupedLog(d).forEach(function (g) {
      [["rein", "aufgenommen"], ["raus", "abgegeben"]].forEach(function (k) {
        var list = g[k[0]];
        if (!list.length) return;
        var names = list.map(function (e) { return nameOf({ ticker: e.ticker }); });
        var who = names.length === 1 ? names[0] : names.length <= 3 ? names.slice(0, -1).join(", ") + " und " + names[names.length - 1] : names.slice(0, 2).join(", ") + " und " + (names.length - 2) + " weitere";
        var sub = k[0] === "rein" ? list.map(function (e) { return e.action === "OHNE_KURS" ? "ohne Aufnahmekurs" : isNum(e.price) ? U.money(e.price, "USD") : ""; }).filter(Boolean).slice(0, 3).join(" · ")
          : list.length === 1 && isNum(list[0].returnPct) ? U.chg(list[0].returnPct, { digits: 1 }) : "";
        rows.push('<li class="pf-tl__r pf-tl__r--' + k[0] + '"><i aria-hidden="true"></i><div><b>' + dmy(g.date) + " · " + esc(who) + " " + k[1] + "</b>" + (sub ? "<span>" + (k[0] === "rein" ? esc(sub) : sub) + "</span>" : "") + "</div></li>");
      });
    });
    return rows;
  }
  function chapters(d) {
    var N = root.STNames, cid = N && N.methodOfDepot ? N.methodOfDepot(d.key) : null, m = cid && N.method(cid), steps = cid && N.think ? N.think(cid) : null;
    var list = [];
    if (d.group === "supertrader") {
      list.push(["Die Regeln der Methode", steps ? steps.map(function (s) { return s[0]; }).join(", ") : "Wann das Modell aufnimmt und abgibt", "book", d.source ? d.source.href : "/supertrader/strategies/"]);
      list.push(["Zur Methode in Supertrader", m ? m.name + " · " + m.style : d.name, "supertrader", "/supertrader/strategies/"]);
    } else if (d.group === "quant") {
      list.push(["Die Regeln des Profils", "Monatlich nach Regel umgeschichtet", "book", d.source ? d.source.href : "/quant/musterdepots/"]);
      list.push(["Zum Profil in Quant", d.name, "quant", "/quant/"]);
    }
    if (!list.length) return "";
    return '<ol class="pf-eps">' + list.map(function (c, i) {
      var icon = c[2] === "book" ? '<span class="vu-hud pf-eps__hud">' + U.glyph("book", 19) + "</span>" : U.hud(c[2], 40);
      return '<li><a class="pf-ep" href="' + esc(c[3]) + '"><b class="pf-ep__n">' + (i + 1) + "</b>" + icon + '<span class="pf-ep__t"><b>' + esc(c[0]) + "</b><span>" + esc(c[1]) + "</span></span>" + U.glyph("next", 15) + "</a></li>";
    }).join("") + "</ol>";
  }
  function detail(d) {
    var g = GROUPS.filter(function (x) { return x.id === d.group; })[0];
    var kind = artKind(d), art = kind === "plain" ? "" : methodArt(kind, { dark: true, profile: d.id });
    var minis = [["Aktien", d.pending ? "–" : String(d.positions.length)], ["live seit", dmy(d.liveSince)], ["Stand", dmy(d.asOf)]];
    var rows = d.positions.slice().sort(function (a, b) { return (b.weight || 0) - (a.weight || 0) || a.ticker.localeCompare(b.ticker); });
    var tl = timeline(d);
    var hero = '<header class="pf-hero"><div class="pf-hero__top"><a class="vu-round pf-hero__back" href="#/' + esc(d.group) + '" aria-label="Zurück zu ' + esc(g.title) + '">' + U.glyph("back", 18) + '</a><span class="vu-xs">' + esc(KICKER[d.group]) + " · Rechenmodell</span></div>" +
      '<h1 class="pf-hero__name">' + esc(d.name) + "</h1>" + '<p class="pf-hero__lead">' + methodHtml(neutralText(d.method)) + "</p>" +
      (art ? '<div class="pf-hero__art">' + art + "</div>" : "") +
      '<div class="pf-hero__minis">' + minis.map(function (m) { return '<div class="pf-mini-tile"><small>' + esc(m[0]) + '</small><b class="vu-num">' + esc(m[1]) + "</b></div>"; }).join("") + "</div>" +
      (d.perf ? '<p class="pf-hero__perf">Seit Start ' + U.chg(d.perf.pct, { digits: 1 }) + ' <span>nach Kosten, Stand ' + esc(dmy(d.perf.asOf)) + "</span></p>" : "") + "</header>";
    var body;
    if (d.pending) body = U.blank("Das Depot startet am " + dDe(d.liveSince) + ". Die ersten Positionen und Werte folgen mit dem ersten Aufnahmekurs.", { verdict: false }) + (d.decision && d.decision.positions.length ? decisionHtml(d) : "");
    else if (!rows.length) body = U.blank("Das Depot hält heute keine Aktie" + (isNum(d.cashPct) ? " (" + U.num(d.cashPct * 100, 0) + " % Bargeld im Modell)" : "") + ". Die Methode wartet auf ihr nächstes Muster.", { verdict: false });
    else body = '<section class="pf-sec">' + '<div class="vu-sect"><h2>So ist das Depot heute verteilt</h2><span class="pf-sect__r">Gewicht im Modell</span></div>' + allocHtml(d) + "</section>" +
      '<section class="pf-sec"><div class="vu-sect"><h2>Seit Aufnahme</h2>' + (rows.length > ROWS_SHOWN ? '<button type="button" class="pf-sect__r pf-all" data-pf-all>Alle ' + rows.length + "</button>" : "") + "</div>" +
      '<ul class="pf-pzl">' + rows.map(function (p, i) { return posRow(d, p, i); }).join("") + "</ul>" +
      '<p class="vu-xs vu-mu pf-cap">Neongrüne Fläche: seit Aufnahme.' + (d.stops ? " Gestrichelt: Ungültig-Marke laut Methode." : "") + " Rechts die Veränderung seit Aufnahme.</p></section>";
    return hero + '<div class="pf-body">' + body +
      (d.rule && d.rule !== d.method ? '<section class="pf-sec">' + U.sect("Regel", { level: 2 }) + '<p class="vu-sm">' + esc(neutralText(d.rule)) + "</p></section>" : "") +
      '<section class="pf-sec"><div class="vu-sect"><h2>Zuletzt im Protokoll</h2>' + (tl.length > 4 ? '<button type="button" class="pf-sect__r pf-all" data-pf-log>Alles</button>' : "") + "</div>" +
      (tl.length ? '<ol class="pf-tl">' + tl.map(function (r, i) { return i >= 4 ? r.replace('<li class="pf-tl__r', '<li hidden class="pf-more-log pf-tl__r') : r; }).join("") + "</ol>" : U.blank(d.pending ? "Noch kein Eintrag." : "Noch keine Bewegung.", { verdict: false })) + "</section>" +
      chapters(d) +
      U.help(d.stops ? "Ungültig-Marke laut Methode: Schließt der Kurs darunter, gibt das Musterdepot die Aktie nach Regel ab. Ein Rechenpunkt, kein Kursziel und keine Order." : "Ein Musterdepot ist ein Rechenmodell. Es zeigt, was die Regel tut, keine echten Orders.") + foot(d) + "</div>";
  }
  /* ---------------------------------------------------------------- Übersicht (Screen p-home) */
  /* Quant-Profil in Alltagssprache (Titel der Karte); der Profilname steht als Fachname darüber. */
  var QUANT_TITLE = {
    "quality-compounder": "Verlässlich und wächst lange",
    "momentum-leader": "Die stärksten Kurstrends",
    "garp": "Wachstum zum fairen Preis",
    "defensive-quality": "Ruhig und solide",
    "value-momentum": "Günstig, und der Trend dreht"
  };
  var NEW_DAYS = 2; /* „neu“: aufgenommen am Stichtag oder in den zwei Handelstagen davor */
  function weekdaysBetween(a, b) {
    var x = new Date(String(a).slice(0, 10) + "T12:00:00Z"), y = new Date(String(b).slice(0, 10) + "T12:00:00Z"), n = 0;
    if (isNaN(x) || isNaN(y) || x > y) return -1;
    for (var d = new Date(x); d < y; d.setUTCDate(d.getUTCDate() + 1)) { var w = d.getUTCDay(); if (w && w !== 6) n++; }
    return n;
  }
  /** Zahl der Positionen, die am Stichtag oder in den zwei Handelstagen davor aufgenommen wurden. */
  function newCount(d) {
    if (!d.asOf) return 0;
    return d.positions.filter(function (p) { var k = p.since ? weekdaysBetween(p.since, d.asOf) : -1; return k >= 0 && k <= NEW_DAYS; }).length;
  }
  function cardTitle(d) {
    if (d.group === "quant") return { fach: d.name, name: QUANT_TITLE[d.id] || d.name };
    if (d.group === "supertrader") return { fach: d.fach || d.by || "", name: d.name };
    return { fach: "KI-Depot", name: d.name };
  }
  function card(d) {
    var t = cardTitle(d), kind = artKind(d), n = newCount(d);
    var logos = d.positions.slice().sort(function (a, b) { return (b.weight || 0) - (a.weight || 0); }).slice(0, 5).map(function (p) { return U.logo(p.ticker); }).join("");
    var foot = d.pending ? '<span class="vu-xs vu-mu pf-dpc__start">startet am ' + dDe(d.liveSince) + ", erste Werte folgen</span>"
      : (logos ? '<span class="pf-dpc__logos">' + logos + "</span>" : "") + '<span class="vu-xs pf-dpc__n"><b>' + d.positions.length + (d.positions.length === 1 ? " Aktie" : " Aktien") + "</b></span>" +
        (d.perf ? '<span class="pf-dpc__perf">' + U.chg(d.perf.pct, { digits: 1 }) + '<span class="vu-xs vu-mu">seit ' + esc(dmy(d.perf.since)) + "</span></span>" : "") +
        (n ? '<span class="pf-new">' + n + " neu</span>" : !d.positions.length ? '<span class="vu-xs vu-mu">Stand ' + esc(dmy(d.asOf)) + "</span>" : "");
    return '<a class="pf-dpc" href="' + esc(href(d)) + '"><span class="pf-dpc__h"><span><span class="vu-ltag">' + esc(t.fach) + "</span><b>" + esc(t.name) + '</b><span class="vu-xs vu-mu">' + esc(neutralText(d.method)) + "</span></span>" + U.glyph("next", 16) + "</span>" +
      (kind !== "plain" ? '<span class="pf-dpc__art">' + methodArt(kind, { dark: false, width: 300, profile: d.id }) + "</span>" : "") +
      '<span class="pf-dpc__f">' + foot + "</span></a>";
  }
  function overview(all, groupId) {
    var groups = GROUPS.filter(function (g) { return !groupId || g.id === groupId; });
    var count = function (id) { return all.filter(function (d) { return d.group === id; }).length; };
    var asOf = maxDate(all.map(function (d) { return d.asOf; }));
    var tabs = '<nav class="vu-chips pf-tabs" aria-label="Depotgruppe">' + [{ id: "", label: "Alle " + all.length }].concat(GROUPS.map(function (g) { return { id: g.id, label: g.label + " " + count(g.id) }; })).map(function (t) {
      var on = (groupId || "") === t.id;
      return '<a class="vu-chip" href="#/' + t.id + '"' + (on ? ' aria-current="page"' : "") + ">" + esc(t.label) + "</a>";
    }).join("") + "</nav>";
    var today = '<div class="pf-today"><p class="vu-ltag">Musterdepots' + (asOf ? " · Stand " + esc(dmy(asOf)) : "") + '</p><ul class="pf-today__n">' +
      GROUPS.map(function (g) { return '<li><b class="vu-num">' + count(g.id) + "</b><span>" + esc(g.label) + "</span></li>"; }).join("") +
      '</ul><p class="vu-xs pf-today__note">Wertentwicklung seit Start: erscheint, sobald belastbar.</p></div>';
    return '<header class="pf-intro"><p class="vu-ltag">Portfolios</p><h1 class="vu-lt">Was die Regeln<br>gerade halten</h1>' +
      '<p class="vu-lead">' + all.length + " Musterdepots. Jedes nimmt Aktien streng nach seiner Methode auf und gibt sie ab, ohne echtes Geld.</p></header>" + tabs + today +
      groups.map(function (g) {
        var list = all.filter(function (d) { return d.group === g.id; });
        return '<section class="pf-sec" aria-labelledby="pf-g-' + g.id + '">' + '<div class="vu-sect"><h2 id="pf-g-' + g.id + '">' + esc(g.label) + "</h2>" + (groupId ? "" : '<a href="#/' + g.id + '">Alle ' + list.length + "</a>") + "</div>" +
          '<div class="pf-grid">' + (list.length ? list.map(card).join("") : U.blank("Diese Depots sind gerade nicht verfügbar.", { verdict: false })) + "</div></section>";
      }).join("") + foot(null);
  }
  function foot(d) {
    return (U.legal("modelPortfolio") || "") +
      '<p class="pf-foot">' + LABEL + ". " + (d ? "Datenstand " + dDe(d.asOf) + ". " : "") + "Kurse: veröffentlichte Schlusskurse, split-bereinigt. Musterdepots sind Rechenmodelle ohne echtes Geld. Keine Anlageberatung, keine Empfehlung.</p>";
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
  /* Kursreihen der letzten 30 Handelstage je Position (dieselbe Tagesreihe wie der veröffentlichte Schluss, ADR-002;
     Adresse über core/identity.js, ADR-001). Fehlt eine Reihe, bleibt nur ihr Mini-Chart leer. */
  var SERIES = "/quant/data/market/discover-series/", seriesCache = {};
  function seriesOf(ticker) {
    var Id = root.VUCore && root.VUCore.Identity, sid = null;
    try { sid = Id && Id.securityIdForTicker(ticker); } catch (e) { sid = null; }
    if (!sid) return Promise.resolve(null);
    if (!seriesCache[sid]) seriesCache[sid] = getJSON(SERIES + sid + ".json").then(function (s) { return (s && s.points || []).slice(-30); }, function () { return null; });
    return seriesCache[sid];
  }
  function enhance(main) {
    var r = parseRoute(root.location.hash), d = r.id && CURRENT.filter(function (x) { return x.group === r.group && x.id === r.id; })[0];
    if (!d) return;
    var byT = {}; d.positions.forEach(function (p) { byT[p.ticker] = p; });
    Array.prototype.forEach.call(main.querySelectorAll("[data-pf-chart]"), function (host) {
      var p = byT[host.getAttribute("data-pf-chart")];
      if (p) seriesOf(p.ticker).then(function (pts) { if (pts && host.isConnected) host.innerHTML = posChart(pts, p.since, d.stops ? p.stop : null); });
    });
    var all = main.querySelector("[data-pf-all]"), log = main.querySelector("[data-pf-log]");
    if (all) all.addEventListener("click", function () { Array.prototype.forEach.call(main.querySelectorAll(".pf-more"), function (x) { x.hidden = false; }); all.hidden = true; });
    if (log) log.addEventListener("click", function () { Array.prototype.forEach.call(main.querySelectorAll(".pf-more-log"), function (x) { x.hidden = false; }); log.hidden = true; });
  }
  var CURRENT = [];
  function start(doc) {
    U = root.VUUI;
    var main = doc.getElementById("pf-main"), all = null;
    function show(focus) {
      if (!all) return;
      main.innerHTML = render(all, root.location.hash);
      doc.documentElement.setAttribute("data-pf-view", parseRoute(root.location.hash).id ? "depot" : "list");
      enhance(main);
      var h = main.querySelector("h1"); doc.title = (h && h.textContent !== "Alle Musterdepots" ? h.textContent + " – " : "") + "Portfolios · Vision Universe®";
      if (focus) { main.focus(); root.scrollTo(0, 0); }
    }
    var keys = ["stPortfolio", "stTrend", "stHouse", "stRegistry", "quant", "ki"];
    Promise.all(keys.map(function (k) { return getJSON(SRC[k]).catch(function () { return null; }); })).then(function (r) {
      var src = {}; keys.forEach(function (k, i) { src[k] = r[i]; });
      all = collect(src); CURRENT = all;
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
    fromQuant: fromQuant, fromKi: fromKi, validKi: validKi, groupedLog: groupedLog, parseRoute: parseRoute, newCount: newCount, methodArt: function (k, o) { U = U || root.VUUI; return methodArt(k, o); }, artKind: artKind,
    allocation: allocation, posChart: posChart, render: function (all, hash) { U = U || root.VUUI; return render(all, hash); }, start: start, NAMES: NAMES };
});
