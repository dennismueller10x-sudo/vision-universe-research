/* =========================================================================
   MARKTBRIEFING – ENGINE

   Rechnet aus veröffentlichten Artefakten das Briefing eines US-Handelstags:
   Karten mit Daten, Titeln und Quellen. Keine Datei- oder Netzzugriffe; der
   Aufrufer (build.mjs) lädt die Artefakte und übergibt sie.

   Drei Kartenarten (docs/publishing/HANDBUCH.md §10):
     MARKET  eigene Marktdaten der Sitzung
     OWN     eigene Auswertung nach fester Regel
     THIRD   Angabe Dritter aus dem Themen-Radar (nur Erscheinungstag = Sitzung)

   Frische: Alles stammt aus EINER Sitzung (movers.session des Market Pulse).
   Hängt eine Pflicht-Eingabe hinterher, ist das Briefing nicht frisch
   (fresh.ok = false) und enthält keine Karten. Ein altes Briefing wird nie
   unter neuem Datum gezeigt.

   Wortwahl nach docs/legal/WORTWAHL.md: beschreibend, „Größte Anstiege und
   Rückgänge“, keine Prognose.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;
  var PC = isNode ? require("../../../quant/engines/published-close.js") : global.VUPublishedClose;

  var SCHEMA = "vu-market-briefing-1.0.0";
  var METHOD = "market-briefing-1.0.0";

  var INDICES = [
    ["SPY", "S&P 500"], ["QQQ", "Nasdaq 100"], ["DIA", "Dow Jones"], ["IWM", "Russell 2000"],
    ["FEZ", "Euro Stoxx 50"], ["EEM", "Schwellenländer"], ["N225", "Nikkei 225"]
  ];
  var YIELDS = [["US2Y", "US 2 Jahre"], ["US5Y", "US 5 Jahre"], ["US10Y", "US 10 Jahre"], ["US30Y", "US 30 Jahre"], ["DE10Y", "Bund 10 Jahre"]];
  var ASSETS = [["XAUUSD", "Gold"], ["XAGUSD", "Silber"], ["BTCUSD", "Bitcoin"]];
  var MEGACAPS = ["NVDA", "MSFT", "AAPL", "AMZN", "META", "AVGO", "GOOGL"];
  var HYPERSCALERS = ["AMZN", "GOOGL", "MSFT", "META", "ORCL"];
  // Themen Dritter: nur Herausgeber aus dieser Liste (Primärquellen, Agenturen, seriöse Medien, öffentliches Research).
  var THIRD_SOURCES = ["Reuters", "Bloomberg", "AP", "dpa", "CNBC", "Financial Times", "Wall Street Journal", "Handelsblatt",
    "Federal Reserve", "EZB", "BLS", "Census Bureau", "BEA", "Destatis", "Eurostat", "CME FedWatch", "SEC",
    "Bank of America", "Goldman Sachs", "JPMorgan", "Morgan Stanley", "UBS", "FactSet", "Check Point", "Unternehmensmeldung"];
  var MAX_PER_SOURCE = 2;
  var WEEKDAY = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

  function isDate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }
  function pt(p) { return Array.isArray(p) ? p : [p && (p.date || p.d), p && (p.value != null ? p.value : p.close)]; }
  function round(x, d) { var f = Math.pow(10, d == null ? 2 : d); return Math.round(x * f) / f; }
  function deDate(iso) { return iso.slice(8, 10) + "." + iso.slice(5, 7) + "."; }
  function deDateY(iso) { return deDate(iso) + iso.slice(0, 4); }
  var MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  function monthYear(iso) { return MONTHS[+iso.slice(5, 7) - 1] + " " + iso.slice(0, 4); }

  /* Reihe (Multi-Asset) bis einschließlich Sitzung; Tages- und 5-Tages-Änderung. */
  function seriesUpTo(points, session) {
    var out = [];
    for (var i = 0; i < (points || []).length; i++) { var p = pt(points[i]); if (isDate(p[0]) && p[0] <= session && typeof p[1] === "number") out.push(p); }
    return out;
  }
  function move(points, session) {
    var s = seriesUpTo(points, session), n = s.length;
    if (n < 6 || s[n - 1][0] !== session) return null;
    return { date: session, close: s[n - 1][1], d1: (s[n - 1][1] / s[n - 2][1] - 1) * 100, d5: (s[n - 1][1] / s[n - 6][1] - 1) * 100 };
  }
  function bpMove(points, session) {
    var s = seriesUpTo(points, session), n = s.length;
    if (n < 2 || s[n - 1][0] !== session) return null;
    return { date: session, level: s[n - 1][1], bp: Math.round((s[n - 1][1] - s[n - 2][1]) * 100) };
  }

  /* Letzter Tag mit einer mindestens so starken Bewegung (gleiche Richtung) vor der Sitzung. */
  function lastComparable(points, session, horizon) {
    var s = seriesUpTo(points, session), n = s.length, h = horizon || 1;
    if (n <= h + 1) return null;
    var today = s[n - 1][1] / s[n - 1 - h][1] - 1;
    for (var i = n - 2; i - h >= 0; i--) {
      var r = s[i][1] / s[i - h][1] - 1;
      if ((today < 0 && r <= today) || (today > 0 && r >= today)) return { date: s[i][0], change: r * 100, today: today * 100 };
    }
    return { date: null, today: today * 100, since: s[0][0] };
  }

  /* Tage mit Bewegung von mindestens |thr| Prozent in eine Richtung (für die Einordnungsgrafik). */
  function bigDays(points, session, thr, from, down) {
    var s = seriesUpTo(points, session), out = [];
    for (var i = 1; i < s.length; i++) {
      var r = (s[i][1] / s[i - 1][1] - 1) * 100;
      if (s[i][0] >= from && (down ? r <= -Math.abs(thr) : r >= Math.abs(thr))) out.push([s[i][0], round(r, 1)]);
    }
    return out;
  }

  /* ---------- Frische ---------- */
  function checkFresh(inp) {
    var problems = [];
    var session = inp.pulse && inp.pulse.movers && inp.pulse.movers.session;
    if (!isDate(session)) return { ok: false, session: null, problems: ["Market Pulse ohne Sitzung (movers.session)"] };
    if (inp.pulse.movers.complete !== true) problems.push("Movers der Sitzung " + session + " unvollständig");
    ["SPY", "QQQ"].forEach(function (s) {
      var pts = seriesUpTo(inp.series[s] && inp.series[s].points, "9999-12-31");
      if (!pts.length || pts[pts.length - 1][0] !== session) problems.push(s + "-Reihe endet nicht am " + session);
    });
    var bl = (inp.pulseHistory && inp.pulseHistory.breadthLog) || [];
    if (!bl.length || bl[bl.length - 1].asOf !== session) problems.push("Marktbreite nicht vom " + session);
    var ad = (inp.pulseHistory && inp.pulseHistory.advDeclLog) || [];
    if (!ad.length || ad[ad.length - 1].session !== session) problems.push("Anstiege/Rückgänge nicht vom " + session);
    if (inp.expectSession && inp.expectSession !== session) problems.push("erwartete Sitzung " + inp.expectSession + ", Daten zeigen " + session);
    return { ok: problems.length === 0, session: session, problems: problems };
  }

  /* ---------- Karten ---------- */
  function headline(spy, qqq, dia) {
    var lead = qqq && spy && Math.abs(qqq.d1) > Math.abs(spy.d1) * 1.3 ? "tech" : dia && spy && Math.abs(dia.d1) > Math.abs(spy.d1) * 1.3 ? "dow" : "broad";
    var d = spy.d1;
    if (d <= -3) return lead === "tech" ? "Tech zieht die Wall Street tief ins Minus" : "Schwerer Verkaufstag an der Wall Street";
    if (d <= -1) return lead === "tech" ? "Tech belastet die Wall Street" : "Wall Street schließt im Minus";
    if (d >= 3) return lead === "tech" ? "Tech treibt die Wall Street kräftig an" : "Starker Tag an der Wall Street";
    if (d >= 1) return lead === "tech" ? "Tech führt die Wall Street ins Plus" : "Wall Street schließt im Plus";
    return "Wall Street kaum verändert";
  }

  function cardOverview(inp, ix, session, editorial) {
    var spy = ix.SPY, qqq = ix.QQQ;
    var others = INDICES.filter(function (x) { return ix[x[0]] && x[0] !== "SPY" && x[0] !== "QQQ"; })
      .map(function (x) { return { sym: x[0], name: x[1], d1: ix[x[0]].d1 }; })
      .sort(function (a, b) { return Math.abs(b.d1) - Math.abs(a.d1); });
    var third = editorial && editorial.stat ? editorial.stat : others[0] ? { label: others[0].name, value: others[0].d1, unit: "%", sub: "Tag" } : null;
    var intra = ((inp.intraday.QQQ && inp.intraday.QQQ.points) || []).filter(function (p) { return String(p[0]).slice(0, 10) === session; });
    var prev = seriesUpTo(inp.series.QQQ.points, session);
    var base = prev.length > 1 ? prev[prev.length - 2][1] : null;
    return {
      id: "overview", type: "MARKET",
      kicker: "Wall Street am " + WEEKDAY[new Date(session + "T12:00:00Z").getUTCDay()],
      title: (editorial && editorial.title) || headline(spy, qqq, ix.DIA),
      sub: (editorial && editorial.sub) || null,
      stats: [
        { label: "Nasdaq 100", value: round(qqq.d1, 2), unit: "%", sub: "Woche " + fmtPct(qqq.d5) },
        { label: "S&P 500", value: round(spy.d1, 2), unit: "%", sub: "Woche " + fmtPct(spy.d5) },
        third
      ].filter(Boolean),
      chart: base && intra.length > 10 ? { kind: "intraday", label: "Nasdaq 100 im Tagesverlauf, gegen Vortagesschluss",
        points: intra.map(function (p) { return [p[0], round((p[1] / base - 1) * 100, 3)]; }) } : null,
      source: "Indizes über ETF-Proxies (QQQ, SPY) · Tagesverlauf in 5-Minuten-Schritten, verzögert"
    };
  }

  function cardIndices(ix) {
    var rows = INDICES.filter(function (x) { return ix[x[0]]; }).map(function (x) {
      return { label: x[1], value: round(ix[x[0]].d1, 2), sub: "Woche " + fmtPct(ix[x[0]].d5) };
    });
    var sorted = rows.slice().sort(function (a, b) { return a.value - b.value; });
    var up = rows.filter(function (r) { return r.value > 0; }).length;
    var title = up === 0 ? "Weltweit rot: " + sorted[0].label + " am schwächsten"
      : up === rows.length ? "Weltweit grün: " + sorted[sorted.length - 1].label + " am stärksten"
      : sorted[sorted.length - 1].label + " vorn, " + sorted[0].label + " hinten";
    return { id: "indices", type: "MARKET", kicker: "Indizes", title: title, bars: { unit: "%", rows: rows },
      source: "Indizes über ETF-Proxies (SPY, QQQ, DIA, IWM, FEZ, EEM) · Nikkei 225: FRED" };
  }

  function cardContext(inp, ix, session) {
    var q = inp.series.QQQ.points, s = inp.series.SPY.points;
    var dq = lastComparable(q, session, 1), ds = lastComparable(s, session, 1);
    var wq = lastComparable(q, session, 5), ws = lastComparable(s, session, 5);
    var pick = Math.abs(ix.QQQ.d1) >= Math.abs(ix.SPY.d1) ? { sym: "QQQ", name: "Nasdaq 100", d: dq, w: wq, pts: q } : { sym: "SPY", name: "S&P 500", d: ds, w: ws, pts: s };
    var notable = Math.abs(pick.d.today) >= 2 || Math.abs(pick.w.today) >= 4;
    if (!notable) return null;
    var dir = pick.d.today < 0 ? "Verlust" : "Gewinn";
    var thr = pick.d.today < 0 ? Math.min(-2, Math.ceil(pick.d.today)) : Math.max(2, Math.floor(pick.d.today));
    var days = bigDays(pick.pts, session, thr, "2008-01-01", pick.d.today < 0);
    var recent = days.filter(function (x) { return daysBetween(x[0], session) <= 21; });
    var title;
    if (recent.length >= 2) {
      var cluster = findPrevCluster(days, recent.length);
      title = (["", "", "Zwei", "Drei", "Vier", "Fünf"][recent.length] || String(recent.length)) + " Tage mit " + (pick.d.today < 0 ? "über " + Math.abs(thr) + " % Minus" : "über " + thr + " % Plus") + " in drei Wochen";
      return { id: "context", type: "OWN", kicker: "Einordnung", title: title,
        sub: "Tage, an denen der " + pick.name + " (" + pick.sym + ") " + Math.abs(thr) + " % oder mehr " + (pick.d.today < 0 ? "verlor" : "gewann") + ", seit 2008." +
          (cluster ? " Eine solche Häufung gab es zuletzt im " + monthYear(cluster) + "." : ""),
        timeline: { from: "2008-01-01", to: session, days: days },
        stats: [statWeek("Nasdaq 100", wq), statWeek("S&P 500", ws)],
        source: pick.sym + "-Tagesschlüsse seit 2008 · eigene Auswertung" };
    }
    title = pick.d.date ? "Größter Tages" + dir.toLowerCase() + " im " + pick.name + " seit " + monthYear(pick.d.date)
      : "Größter Tages" + dir.toLowerCase() + " im " + pick.name + " seit Beginn der Reihe";
    return { id: "context", type: "OWN", kicker: "Einordnung", title: title,
      sub: pick.name + " (" + pick.sym + ") " + fmtPct(pick.d.today) + (pick.d.date ? "; zuletzt so stark am " + deDateY(pick.d.date) + " (" + fmtPct(pick.d.change) + ")." : "."),
      timeline: { from: "2008-01-01", to: session, days: days },
      stats: [statWeek("Nasdaq 100", wq), statWeek("S&P 500", ws)],
      source: pick.sym + "-Tagesschlüsse seit 2008 · eigene Auswertung" };
  }
  function findPrevCluster(days, k) {
    for (var i = days.length - 1 - k; i >= k - 1; i--) {
      if (daysBetween(days[i - k + 1][0], days[i][0]) <= 21) return days[i][0];
    }
    return null;
  }
  function daysBetween(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5); }
  function statWeek(name, w) {
    var verb = w.today < 0 ? "schwächste" : "stärkste";
    return { label: name + " in 5 Tagen", value: round(w.today, 2), unit: "%",
      sub: w.date ? verb + " Woche seit " + monthYear(w.date) : verb + " Woche seit Beginn der Reihe" };
  }

  function cardStocks(inp, session) {
    var rows = [];
    MEGACAPS.concat(inp.extraTickers || []).forEach(function (t) {
      var s = inp.stocks[t]; var c = s && PC.dayChange(s, session);
      if (!c || c.date !== session) return;
      var hi = s.points.reduce(function (m, p) { var q = pt(p); return q[1] > m[1] ? q : m; }, [null, -Infinity]);
      rows.push({ label: t, value: round(c.change * 100, 2), sub: "seit Hoch " + fmtPct((c.close / hi[1] - 1) * 100, 0), highDate: hi[0] });
    });
    if (rows.length < 3) return null;
    rows.sort(function (a, b) { return Math.abs(b.value) - Math.abs(a.value); });
    var top = rows[0];
    return { id: "megacaps", type: "MARKET", kicker: "Die Schwergewichte",
      title: top.label + " " + fmtPct(top.value, 1) + (top.value < 0 ? ": größter Rückgang der Schwergewichte" : ": größter Anstieg der Schwergewichte"),
      bars: { unit: "%", rows: rows.slice(0, 7) },
      source: "Tagesschlüsse · Hoch = höchster Schluss in 12 Monaten" };
  }

  function cardBreadth(inp, session) {
    var ad = inp.pulseHistory.advDeclLog[inp.pulseHistory.advDeclLog.length - 1];
    var bl = inp.pulseHistory.breadthLog;
    var last = bl[bl.length - 1], prev = bl[bl.length - 2];
    var maxLows = Math.max.apply(null, bl.slice(0, -1).map(function (x) { return x.newLows || 0; }));
    var maxHighs = Math.max.apply(null, bl.slice(0, -1).map(function (x) { return x.newHighs || 0; }));
    var share = ad.decliners / ad.evaluated;
    var upShare = ad.advancers / ad.evaluated;
    var title = share >= 0.75 ? "Fast alles fiel: " + Math.round(share * 100) + " % der Aktien im Minus"
      : upShare >= 0.75 ? "Breiter Anstieg: " + Math.round(upShare * 100) + " % der Aktien im Plus"
      : ad.decliners > ad.advancers ? "Mehr Aktien im Minus als im Plus" : "Mehr Aktien im Plus als im Minus";
    var hlNote = last.newLows > maxLows ? "meiste neue Tiefs seit Messbeginn am " + deDate(bl[0].asOf)
      : last.newHighs > maxHighs ? "meiste neue Hochs seit Messbeginn am " + deDate(bl[0].asOf)
      : "Vortag " + (prev ? prev.newHighs + " / " + prev.newLows : "–");
    var series = bl.slice(-40).map(function (x) { return [x.asOf, x.above50Pct]; });
    return { id: "breadth", type: "OWN", kicker: "Marktbreite", title: title,
      pairs: [
        { label: "Gestiegen / gefallen", a: ad.advancers, b: ad.decliners, total: ad.evaluated, sub: Math.round(share * 100) + " % von " + thousands(ad.evaluated) + " US-Aktien im Minus" },
        { label: "52-Wochen-Hochs / -Tiefs", a: last.newHighs, b: last.newLows, sub: hlNote }
      ],
      line: { label: "Anteil der Aktien über ihrer 50-Tage-Linie", unit: "%", points: series },
      source: "Vision Universe Marktbreite · US-Aktienuniversum · Tagesschluss" };
  }

  function cardRates(inp, session) {
    var rows = [];
    YIELDS.forEach(function (y) { var m = inp.series[y[0]] && bpMove(inp.series[y[0]].points, session); if (m) rows.push({ label: y[1], value: m.bp, sub: String(m.level).replace(".", ",") + " %", kind: "bp" }); });
    var assets = [];
    ASSETS.forEach(function (a) { var m = inp.series[a[0]] && move(inp.series[a[0]].points, session); if (m) assets.push({ label: a[1], value: round(m.d1, 2), sub: "Woche " + fmtPct(m.d5) }); });
    if (!rows.length) return null;
    var us10 = rows.filter(function (r) { return r.label === "US 10 Jahre"; })[0];
    var gold = assets.filter(function (r) { return r.label === "Gold"; })[0];
    var title = us10 && us10.value <= -8 ? (gold && gold.value < 0 ? "Flucht in Anleihen, selbst Gold fällt" : "Flucht in Anleihen: Renditen fallen deutlich")
      : us10 && us10.value >= 8 ? "Renditen steigen deutlich" : "Anleihen, Gold und Bitcoin";
    return { id: "rates", type: "MARKET", kicker: "Zinsen und Sachwerte", title: title,
      bars: { unit: "bp", neutral: true, rows: rows }, bars2: { unit: "%", rows: assets },
      source: "Renditen: US Treasury, Bundesbank · bp = Basispunkte" };
  }

  function cardMovers(inp) {
    var m = inp.pulse.movers;
    return { id: "movers", type: "MARKET", kicker: "Einzelwerte", title: "Größte Anstiege und Rückgänge",
      groups: [
        { label: "Größte Anstiege", rows: m.gainers.slice(0, 3).map(function (x) { return { label: x.symbol, sub: x.name, value: round(x.changePercent, 2) }; }) },
        { label: "Größte Rückgänge", rows: m.losers.slice(0, 4).map(function (x) { return { label: x.symbol, sub: x.name, value: round(x.changePercent, 2) }; }) }
      ],
      source: "Liquide US-Aktien (≥ 20 Mio. USD Umsatz, ≥ 5 USD) · Tagesschluss" };
  }

  function cardValuation(inp, session) {
    var rows = [];
    MEGACAPS.forEach(function (t) {
      var s = inp.stocks[t], f = inp.sec[t];
      var eps = f && f.ttm && f.ttm.eps_diluted;
      var last = s && PC.lastPoint(s, session);
      if (!eps || !(eps.v > 0) || !last || last.date !== session) return;
      var hi = s.points.reduce(function (m, p) { var q = pt(p); return q[1] > m[1] ? q : m; }, [null, -Infinity]);
      rows.push({ label: t, a: round(hi[1] / eps.v, 1), b: round(last.close / eps.v, 1), highDate: hi[0], epsEnd: eps.end });
    });
    if (rows.length < 4) return null;
    rows.sort(function (x, y) { return (y.a - y.b) / y.a - (x.a - x.b) / x.a; });
    var top = rows[0], drop = (top.a - top.b) / top.a;
    if (drop < 0.15) return null;
    var weeks = Math.round(daysBetween(top.highDate, session) / 7);
    var title = drop >= 0.45 ? top.label + ": KGV seit dem Kurshoch fast halbiert" : top.label + ": KGV seit dem Kurshoch um " + Math.round(drop * 100) + " % gesunken";
    return { id: "valuation", type: "OWN", kicker: "Bewertung", title: title,
      sub: "Kurs geteilt durch den Gewinn je Aktie der letzten vier gemeldeten Quartale. Am jeweiligen 12-Monats-Hoch und am " + deDate(session) + (weeks ? " (" + top.label + ": Hoch vor " + weeks + " Wochen)." : "."),
      columns: { legend: ["am Kurshoch", deDateY(session)], rows: rows.map(function (r) { return { label: r.label, values: [r.a, r.b] }; }) },
      source: "SEC EDGAR (Gewinn je Aktie, verwässert) · eigene Rechnung" };
  }

  /* Hyperscaler: Investitionen / operativer Cashflow. Nur wenn eine neue Meldung höchstens 3 Tage vor der Sitzung kam. */
  function cardCapex(inp, session) {
    var tot = { cx: 0, oc: 0 }, newest = null, years = {}, over = [];
    for (var i = 0; i < HYPERSCALERS.length; i++) {
      var f = inp.sec[HYPERSCALERS[i]];
      if (!f || !f.ttm || !f.ttm.capital_expenditures || !f.ttm.operating_cash_flow) return null;
      var cx = Math.abs(f.ttm.capital_expenditures.v), oc = f.ttm.operating_cash_flow.v;
      tot.cx += cx; tot.oc += oc;
      if (cx > oc) over.push(HYPERSCALERS[i]);
      var filed = f.ttm.capital_expenditures.filed; if (!newest || filed > newest) newest = filed;
      (f.annual.capital_expenditures || []).forEach(function (r) { years[r[0]] = years[r[0]] || { cx: 0, oc: 0, n: 0 }; years[r[0]].cx += Math.abs(r[3]); years[r[0]].n++; });
      (f.annual.operating_cash_flow || []).forEach(function (r) { if (years[r[0]]) years[r[0]].oc += r[3]; });
    }
    if (!newest || daysBetween(newest, session) > 3 || daysBetween(newest, session) < 0) return null;
    var cols = Object.keys(years).filter(function (y) { return years[y].n === HYPERSCALERS.length && years[y].oc > 0 && +y >= 2015; }).sort()
      .map(function (y) { return { label: "'" + y.slice(2), values: [Math.round(years[y].cx / years[y].oc * 100)] }; });
    var q = Math.round(tot.cx / tot.oc * 100);
    cols.push({ label: "12 M.", values: [q], highlight: true });
    return { id: "capex", type: "OWN", kicker: "KI-Investitionen", title: q + " % des Cashflows fließen in Investitionen",
      sub: "Investitionen von Amazon, Alphabet, Microsoft, Meta und Oracle im Verhältnis zu ihrem operativen Cashflow." +
        (over.length ? " Mehr investiert als operativ eingenommen: " + over.join(", ") + "." : ""),
      columns: { unit: "%", rows: cols },
      stats: [{ label: "Investitionen, letzte 12 Monate", value: Math.round(tot.cx / 1e9), unit: " Mrd. $", plain: true }],
      source: "SEC EDGAR · Geschäftsjahre (MSFT 06/, ORCL 05/) · eigene Rechnung · neue Meldung " + deDate(newest) };
  }

  function cardPicture(inp) {
    var g = inp.pulse.gauges || {};
    var stats = [];
    [["TREND", "Trend"], ["BREADTH", "Marktbreite"], ["MOMENTUM", "Momentum"], ["RISK", "Schwankung"]].forEach(function (k) {
      var x = g[k[0]]; if (!x) return;
      stats.push({ label: k[1], text: x.valueText, value: x.value, min: x.min, max: x.max, unit: x.unit, invert: !!x.invert, previous: x.previous });
    });
    if (!stats.length) return null;
    return { id: "picture", type: "OWN", kicker: "Unser Marktbild", title: inp.pulse.headline && inp.pulse.headline.text || "Marktbild",
      textStats: stats, note: "Das Marktbild beschreibt den beobachteten Zustand aus festen Regeln. Es ist keine Prognose und keine Anlageberatung.",
      source: "Vision Universe Market Pulse · Tagesschluss" };
  }

  /* Themen Dritter aus dem Radar: Pflichtfelder, Quelle in der Liste, erschienen am Sitzungstag (oder am Morgen danach
     vor dem Lauf), höchstens zwei Karten je Quelle. Verworfenes steht mit Grund im Ergebnis. */
  function thirdCards(radar, session, now) {
    var kept = [], dropped = [], per = {};
    (radar && radar.items || []).forEach(function (it, i) {
      var why = null;
      if (!it || !it.title || !it.source || !it.publisher || !isDate(it.published)) why = "Pflichtfeld fehlt";
      else if (THIRD_SOURCES.indexOf(it.publisher) < 0) why = "Herausgeber nicht in der Quellenliste: " + it.publisher;
      else if (it.published !== session && !(daysBetween(session, it.published) === 1 && now && now.slice(0, 10) === it.published)) why = "nicht vom Handelstag (" + it.published + ")";
      else if ((per[it.publisher] || 0) >= MAX_PER_SOURCE) why = "mehr als " + MAX_PER_SOURCE + " Karten von " + it.publisher;
      else if (!it.url || !/^https:\/\//.test(it.url)) why = "keine Quell-URL";
      if (why) { dropped.push({ index: i, title: it && it.title, reason: why }); return; }
      per[it.publisher] = (per[it.publisher] || 0) + 1;
      kept.push({ id: "third-" + (kept.length + 1), type: "THIRD", kicker: it.kicker || "Thema des Tages", title: it.title, sub: it.sub || null,
        columns: it.columns || null, bars: it.bars || null, quote: it.quote || null, stats: it.stats || null,
        source: it.source + " · " + deDateY(it.published), url: it.url, publisher: it.publisher });
    });
    return { kept: kept, dropped: dropped };
  }

  function thousands(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  function fmtPct(x, d) {
    var v = Math.abs(x).toFixed(d == null ? 1 : d).replace(".", ",");
    return (x > 0 ? "+" : x < 0 ? "−" : "") + v + " %";
  }

  /* buildBriefing(inputs) -> Briefing
     inputs: { pulse, pulseHistory, series: {SYM: series}, intraday: {SYM: intraday}, stocks: {TICKER: discover-series},
               sec: {TICKER: consumer-bundle}, radar?: {items: []}, editorial?: {title, sub, stat}, now: ISO, expectSession? } */
  function buildBriefing(inp) {
    var fresh = checkFresh(inp);
    var out = { schema: SCHEMA, method: METHOD, kind: "CLOSE", session: fresh.session, generatedAt: inp.now || null,
      fresh: fresh, cards: [], dropped: [],
      notes: { forecast: "Beschreibung des beobachteten Zustands, keine Prognose, keine Anlageberatung.",
        indices: "Indizes über ETF-Proxies; echte Indexstände sind eine Datenlücke (CAPABILITY_GAP)." } };
    if (!fresh.ok) return out;
    var session = fresh.session, ix = {};
    INDICES.forEach(function (x) { var s = inp.series[x[0]]; var m = s && move(s.points, session); if (m) ix[x[0]] = m; });
    if (!ix.SPY || !ix.QQQ) { out.fresh = { ok: false, session: session, problems: ["SPY/QQQ ohne Bewegung"] }; return out; }
    var third = thirdCards(inp.radar, session, inp.now);
    var cards = [
      cardOverview(inp, ix, session, inp.editorial),
      cardIndices(ix),
      cardContext(inp, ix, session),
      cardStocks(inp, session),
      third.kept[0] || null,
      cardValuation(inp, session),
      cardCapex(inp, session),
      third.kept[1] || null,
      cardBreadth(inp, session),
      third.kept[2] || null,
      cardRates(inp, session),
      cardMovers(inp),
      third.kept[3] || null,
      cardPicture(inp)
    ].filter(Boolean);
    third.kept.slice(4).forEach(function (c) { cards.splice(cards.length - 1, 0, c); });
    out.cards = cards;
    out.dropped = third.dropped;
    out.counts = { MARKET: 0, OWN: 0, THIRD: 0 };
    cards.forEach(function (c) { out.counts[c.type]++; });
    return out;
  }

  var api = { SCHEMA: SCHEMA, METHOD: METHOD, THIRD_SOURCES: THIRD_SOURCES, MAX_PER_SOURCE: MAX_PER_SOURCE,
    buildBriefing: buildBriefing, checkFresh: checkFresh, lastComparable: lastComparable, thirdCards: thirdCards,
    fmtPct: fmtPct, headline: headline };
  if (isNode) module.exports = api;
  else global.VUMarketBriefing = api;
})(typeof window !== "undefined" ? window : globalThis);
