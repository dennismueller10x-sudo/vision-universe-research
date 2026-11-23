/* =========================================================================
   MARKTBRIEFING – WECHSELNDE THEMEN (Owner 23.11.2026)

   „Nicht immer gleich“: Neben dem festen Rahmen (Tag in Zahlen, Indizes,
   Einordnung, Ausblick) wählt diese Engine jeden Tag die auffälligsten
   Themen aus einem Vorrat. Jedes Thema rechnet aus veröffentlichten Daten
   einen Wert („wie auffällig ist das heute?“); was in den letzten Ausgaben
   schon lief, bekommt einen Abschlag (Rotation). Gezeigt werden höchstens
   MAX_TOPICS Themen über der Schwelle.

   Datenquellen (nur gelesen):
     technical/data/screener-v1.json   Kennzahlen je Aktie (RSI, Hochs/Tiefs,
                                        Kreuzungen, Volumen, Momentum)
     quant/data/market/index-membership/SP500.json  Auswahlrahmen S&P 500

   Wortwahl (docs/legal/WORTWAHL.md): beschreibend, keine Empfehlung,
   kein „jetzt kaufen“. Fachbegriffe werden in einem Satz erklärt.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  var MAX_TOPICS = 3, MIN_SCORE = 1, ROTATION = 0.35, MIN_ROWS = 3, ROWS = 7;

  function round(x, d) { var f = Math.pow(10, d == null ? 1 : d); return Math.round(x * f) / f; }
  function deDate(iso) { return iso.slice(8, 10) + "." + iso.slice(5, 7) + "."; }

  /* Zeilen aus dem spaltenweisen Screener, nur S&P-500-Mitglieder, nur Aktien mit Kurs vom Handelstag. */
  function rows(tech, members) {
    if (!tech || !tech.cols || !tech.cols.s) return [];
    var c = tech.cols, out = [], idx = {};
    (members || []).forEach(function (m) { idx[m.symbol] = m; });
    for (var i = 0; i < c.s.length; i++) {
      var m = idx[c.s[i]];
      if (!m) continue;
      var r = { s: c.s[i], name: tidy(m.name), weight: m.weight || 0 };
      ["close", "chg1d", "rsi14", "newHigh52w", "newLow52w", "goldenCrossDays", "deathCrossDays", "crossAboveSma200Days", "crossBelowSma200Days",
        "distSma200", "roc21", "roc63", "rsRank", "relVol", "volSpike", "distHigh52w", "asOf"].forEach(function (k) { r[k] = c[k] ? c[k][i] : null; });
      if (r.close == null) continue;
      out.push(r);
    }
    return out;
  }
  /* „APPLE INC“ → „Apple“ für die Unterzeile. */
  function tidy(n) {
    return String(n || "").toLowerCase().replace(/\b(inc|corp|corporation|co|ltd|plc|holdings?|group|company|class [a-z]|cl [a-z]|the)\b\.?/g, "")
      .replace(/[,.]+/g, " ").replace(/\s+/g, " ").trim().replace(/ [a-z]$/, "").replace(/\b\w/g, function (x) { return x.toUpperCase(); });
  }
  function pctRow(r, v, sub) { return { label: r.s, sub: sub != null ? sub : r.name, value: v }; }

  /* ---------- Vorrat: jedes Thema liefert {id, score, card} oder null ---------- */
  var POOL = [
    { id: "ueberverkauft", family: "schwach", label: "RSI unter 30", run: function (R, t) {
      var x = R.filter(function (r) { return r.rsi14 != null && r.rsi14 < 30; }).sort(function (a, b) { return a.rsi14 - b.rsi14; });
      if (x.length < MIN_ROWS) return null;
      return { score: x.length / 6 + (x.length >= 20 ? 1 : 0), card: { kicker: "Thema · Stark gefallen", title: x.length + " S&P-500-Aktien mit RSI unter 30",
        sub: "Der RSI misst die Kursstärke der letzten 14 Tage. Unter 30 gilt eine Aktie in der Charttechnik als überverkauft. Das ist eine Beschreibung, keine Kaufempfehlung.",
        bars: { unit: "", neutral: true, rows: x.slice(0, ROWS).map(function (r) { return pctRow(r, round(r.rsi14, 0), r.name + " · " + fmtChg(r.chg1d)); }) },
        stat: { label: "RSI unter 30", value: x.length, of: R.length } } };
    } },
    { id: "ueberkauft", family: "stark", label: "RSI über 70", run: function (R) {
      var x = R.filter(function (r) { return r.rsi14 != null && r.rsi14 > 70; }).sort(function (a, b) { return b.rsi14 - a.rsi14; });
      if (x.length < MIN_ROWS) return null;
      return { score: x.length / 8, card: { kicker: "Thema · Heiß gelaufen", title: x.length + " S&P-500-Aktien mit RSI über 70",
        sub: "Über 70 gilt eine Aktie in der Charttechnik als überkauft: Sie ist in kurzer Zeit stark gestiegen. Das ist eine Beschreibung, keine Verkaufsempfehlung.",
        bars: { unit: "", neutral: true, rows: x.slice(0, ROWS).map(function (r) { return pctRow(r, round(r.rsi14, 0), r.name + " · " + fmtChg(r.chg1d)); }) },
        stat: { label: "RSI über 70", value: x.length, of: R.length } } };
    } },
    { id: "momentum", family: "stark", label: "Neue Hochs mit Rückenwind", run: function (R) {
      var x = R.filter(function (r) { return r.newHigh52w === true && (r.rsRank || 0) >= 80; }).sort(function (a, b) { return (b.roc63 || 0) - (a.roc63 || 0); });
      if (x.length < MIN_ROWS) return null;
      return { score: x.length / 5, card: { kicker: "Thema · Momentum", title: x.length + " Aktien auf neuem 52-Wochen-Hoch",
        sub: "Aktien aus dem S&P 500 mit neuem Jahreshoch und hoher relativer Stärke. Die Zahl daneben zeigt das Plus der letzten drei Monate.",
        bars: { unit: "%", rows: x.slice(0, ROWS).map(function (r) { return pctRow(r, round((r.roc63 || 0) * 100, 1)); }) },
        stat: { label: "Neue Hochs", value: x.length, of: R.length } } };
    } },
    { id: "neue-tiefs", family: "schwach", label: "Neue Jahrestiefs", run: function (R) {
      var x = R.filter(function (r) { return r.newLow52w === true; }).sort(function (a, b) { return (a.roc63 || 0) - (b.roc63 || 0); });
      if (x.length < MIN_ROWS) return null;
      return { score: x.length / 5, card: { kicker: "Thema · Unter Druck", title: x.length + " S&P-500-Aktien auf neuem 52-Wochen-Tief",
        sub: "Aktien, die am Handelstag so tief schlossen wie seit einem Jahr nicht. Die Zahl daneben zeigt das Minus der letzten drei Monate.",
        bars: { unit: "%", rows: x.slice(0, ROWS).map(function (r) { return pctRow(r, round((r.roc63 || 0) * 100, 1)); }) },
        stat: { label: "Neue Tiefs", value: x.length, of: R.length } } };
    } },
    { id: "kreuzungen", family: "trend", label: "Golden und Death Cross", run: function (R) {
      var g = R.filter(function (r) { return r.goldenCrossDays != null && r.goldenCrossDays <= 1; });
      var d = R.filter(function (r) { return r.deathCrossDays != null && r.deathCrossDays <= 1; });
      if (g.length + d.length < 2) return null;
      var row = function (r) { return pctRow(r, round((r.distSma200 || 0) * 100, 1), r.name + " · Abstand zur 200-Tage-Linie"); };
      return { score: (g.length + d.length) / 2.5, card: { kicker: "Thema · Chartsignale", title: (g.length ? g.length + " Golden Cross" : "") + (g.length && d.length ? ", " : "") + (d.length ? d.length + " Death Cross" : ""),
        sub: "Golden Cross: Der 50-Tage-Durchschnitt steigt über den 200-Tage-Durchschnitt. Death Cross: Er fällt darunter. Beides beschreibt den Trend, es ist keine Empfehlung.",
        groups: [g.length ? { label: "Golden Cross", rows: g.slice(0, 4).map(row) } : null, d.length ? { label: "Death Cross", rows: d.slice(0, 4).map(row) } : null].filter(Boolean),
        stat: { label: "Kreuzungen", value: g.length + d.length, of: R.length } } };
    } },
    { id: "linie-200", family: "trend", label: "200-Tage-Linie", run: function (R) {
      var up = R.filter(function (r) { return r.crossAboveSma200Days === 0; }).sort(function (a, b) { return (b.chg1d || 0) - (a.chg1d || 0); }),
        dn = R.filter(function (r) { return r.crossBelowSma200Days === 0; }).sort(function (a, b) { return (a.chg1d || 0) - (b.chg1d || 0); });
      if (up.length + dn.length < 4) return null;
      var row = function (r) { return pctRow(r, round((r.chg1d || 0) * 100, 1)); };
      return { score: (up.length + dn.length) / 6, card: { kicker: "Thema · Trendwechsel", title: dn.length > up.length ? dn.length + " Aktien fallen unter die 200-Tage-Linie" : up.length + " Aktien springen über die 200-Tage-Linie",
        sub: "Die 200-Tage-Linie ist der Durchschnitt der Schlusskurse der letzten 200 Handelstage. Viele Anleger lesen sie als Grenze zwischen Auf- und Abwärtstrend.",
        groups: (dn.length > up.length ? [["Darunter gefallen", dn], ["Darüber gestiegen", up]] : [["Darüber gestiegen", up], ["Darunter gefallen", dn]])
          .filter(function (g) { return g[1].length; }).map(function (g) { return { label: g[0], rows: g[1].slice(0, 4).map(row) }; }),
        stat: { label: "Wechsel", value: up.length + dn.length, of: R.length } } };
    } },
    { id: "volumen", family: "volumen", label: "Ungewöhnliches Volumen", run: function (R) {
      var x = R.filter(function (r) { return (r.relVol || 0) >= 2.5 && Math.abs(r.chg1d || 0) >= 0.02; }).sort(function (a, b) { return b.relVol - a.relVol; });
      if (x.length < MIN_ROWS) return null;
      return { score: x.length / 5, card: { kicker: "Thema · Volumen", title: x.length + " Aktien mit 2,5-fachem Handelsvolumen und mehr",
        sub: "Wenn viel mehr gehandelt wird als im Schnitt der letzten Wochen, steckt oft eine Nachricht dahinter. Die Zahl daneben zeigt das Vielfache des üblichen Volumens.",
        bars: { unit: "x", neutral: true, rows: x.slice(0, ROWS).map(function (r) { return pctRow(r, round(r.relVol, 1), r.name + " · " + fmtChg(r.chg1d)); }) },
        stat: { label: "Volumen-Spitzen", value: x.length, of: R.length } } };
    } }
  ];
  function fmtChg(x) { if (x == null) return ""; var v = Math.abs(x * 100).toFixed(1).replace(".", ","); return (x > 0 ? "+" : x < 0 ? "−" : "") + v + " %"; }

  /* select(inputs, session, recent) → { cards, considered }
     recent: Themen-ids der letzten Ausgaben (neueste zuerst), für die Rotation. */
  function select(inp, session, recent) {
    var tech = inp.tech, considered = [];
    if (!tech || tech.asOf !== session) return { cards: [], considered: [{ id: "*", reason: "Technical-Daten nicht vom Handelstag (" + (tech && tech.asOf) + ")" }] };
    var R = rows(tech, inp.sp500 && inp.sp500.members);
    if (R.length < 100) return { cards: [], considered: [{ id: "*", reason: "zu wenige S&P-500-Zeilen (" + R.length + ")" }] };
    var last = (recent || []).slice(0, 2);
    POOL.forEach(function (t) {
      var res = null;
      try { res = t.run(R, t); } catch (e) { considered.push({ id: t.id, reason: "Fehler: " + e.message }); return; }
      if (!res) { considered.push({ id: t.id, score: 0 }); return; }
      var penalty = last.some(function (ids) { return (ids || []).indexOf(t.id) >= 0; }) ? ROTATION : 1;
      considered.push({ id: t.id, raw: round(res.score, 2), score: round(res.score * penalty, 2), card: res.card });
    });
    // Abwechslung: je Familie (schwach, stark, Trend, Volumen) höchstens ein Thema pro Ausgabe.
    var fam = {}, picked = considered.filter(function (c) { return c.card && c.score >= MIN_SCORE; }).sort(function (a, b) { return b.score - a.score; })
      .filter(function (c) { var f = (POOL.filter(function (t) { return t.id === c.id; })[0] || {}).family || c.id; if (fam[f]) return false; fam[f] = 1; return true; }).slice(0, MAX_TOPICS);
    var cards = picked.map(function (c) {
      var card = c.card; card.id = "thema-" + c.id; card.topic = c.id; card.type = "OWN"; card.score = c.score;
      card.source = "Vision Universe Technical (S&P 500, Tagesschluss " + deDate(session) + ")";
      return card;
    });
    return { cards: cards, considered: considered.map(function (c) { return { id: c.id, raw: c.raw, score: c.score, reason: c.reason, shown: picked.indexOf(c) >= 0 }; }) };
  }

  var api = { POOL: POOL, MAX_TOPICS: MAX_TOPICS, MIN_SCORE: MIN_SCORE, ROTATION: ROTATION, select: select, rows: rows, tidy: tidy };
  if (isNode) module.exports = api;
  else global.VUMarketBriefingTopics = api;
})(typeof window !== "undefined" ? window : globalThis);
