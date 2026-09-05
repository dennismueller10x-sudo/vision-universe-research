/* =========================================================================
   VISION UNIVERSE MACRO INTELLIGENCE — app.js

   UI-Schicht: laedt die vier Datendateien, ruft die Berechnungslogik aus
   calc.js auf und rendert die 11 Ansichten. Enthaelt bewusst KEINE
   Scoring-Regeln (die leben in calc.js) und KEINE redaktionellen Texte
   ausserhalb von data/content.json — nur Layout, Formatierung und die
   automatisch generierten, aus echten Zahlen abgeleiteten Kurzinterpretationen.
   ========================================================================= */
(function () {
  "use strict";

  var isNum = window.MacroCalc.isNum;

  var CATEGORY_LABELS = {
    liquidity: "LIQUIDITÄT", rates: "ZINSEN", financialConditions: "FINANCIAL CONDITIONS",
    credit: "CREDIT", inflation: "INFLATION", growth: "WACHSTUM", labor: "ARBEITSMARKT",
    housing: "HOUSING", global: "GLOBAL"
  };

  var UNIT_FORMAT = {
    "% YoY": { digits: 1, suffix: "%" },
    "%": { digits: 2, suffix: "%" },
    "USD Mrd.": { digits: 1, suffix: " Mrd. USD" },
    "Pp": { digits: 2, suffix: " Pp" },
    "Index": { digits: 2, suffix: "" },
    "Tsd. Stellen": { digits: 0, suffix: " Tsd." },
    "Tsd.": { digits: 0, suffix: " Tsd." },
    "Std.": { digits: 1, suffix: " Std." },
    "Tsd. (annualisiert)": { digits: 0, suffix: " Tsd. (SAAR)" },
    "Mio. (annualisiert)": { digits: 2, suffix: " Mio. (SAAR)" },
    "USD/Barrel": { digits: 2, suffix: " USD/bbl" },
    "USD/Feinunze": { digits: 2, suffix: " USD/oz" }
  };

  var S = { config: null, current: null, content: null, history: null, scored: {}, catScores: {}, regime: null, view: "overview" };

  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return [].slice.call(document.querySelectorAll(sel)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function fmtVal(v, unit, forceSign) {
    if (!isNum(v)) return "n/v";
    var f = UNIT_FORMAT[unit] || { digits: 2, suffix: unit ? " " + unit : "" };
    var s = v.toLocaleString("de-DE", { minimumFractionDigits: f.digits, maximumFractionDigits: f.digits });
    if (forceSign && v > 0) s = "+" + s;
    return s + f.suffix;
  }

  function fmtObsDate(d) {
    if (!d) return "n/v";
    var m = String(d).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (!m) return d; // z.B. "2026-Q2"
    var months = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
    if (m[3]) return m[3] + ". " + months[parseInt(m[2], 10) - 1] + " " + m[1];
    return months[parseInt(m[2], 10) - 1] + " " + m[1];
  }

  function signalLabelDE(signal) {
    return { positive: "GÜNSTIG", negative: "BELASTEND", neutral: "NEUTRAL", unknown: "N/V" }[signal] || "N/V";
  }
  function arrowClassFor(status) {
    return status === "IMPROVING" ? "pos" : status === "DETERIORATING" ? "neg" : "neu";
  }

  /* ---------------- Data loading ---------------- */
  function get(path) {
    return fetch(path).then(function (r) { if (!r.ok) throw new Error(path + " " + r.status); return r.json(); });
  }

  function boot() {
    Promise.all([get("data/config.json"), get("data/current.json"), get("data/content.json"), get("data/history.json")])
      .then(function (res) {
        S.config = res[0]; S.current = res[1]; S.content = res[2]; S.history = res[3];
        compute();
        renderShellMeta();
        renderAllViews();
        setupNav();
        window.addEventListener("hashchange", applyHash);
        applyHash();
      })
      .catch(function (err) {
        console.error(err);
        $("#app").innerHTML = '<div class="mstate">Die Makrodaten konnten nicht geladen werden. Bitte Seite neu laden.</div>';
      });
  }

  /* ---------------- Calculation pass ---------------- */
  function compute() {
    var raw = S.current.indicators, cfg = S.config;
    Object.keys(raw).forEach(function (id) {
      var pol = cfg.polarity[id];
      if (pol === undefined) return;
      S.scored[id] = MacroCalc.scoreIndicator(raw[id], pol, cfg);
    });
    // Net Liquidity Proxy (VISION UNIVERSE COMPOSITE)
    S.netLiquidityProxy = computeNetLiquidityProxy(raw);
    S.scored.net_liquidity_proxy = MacroCalc.scoreIndicator(S.netLiquidityProxy, true, cfg);

    Object.keys(cfg.categoryMembers).filter(function (k) { return k[0] !== "_"; }).forEach(function (cat) {
      S.catScores[cat] = MacroCalc.aggregateCategory(S.scored, cfg.categoryMembers[cat]);
    });
    S.regime = MacroCalc.computeRegime(S.catScores, cfg.regimeWeights, cfg.regimeBands);
    S.yieldCurve = MacroCalc.yieldCurveRegime(raw.spread_10y2y, raw.treasury_2y, raw.treasury_10y, cfg.inflectionRules);
    S.fedFlex = MacroCalc.fedFlexibility(S.catScores.inflation.score, cfg);
    S.creditStress = MacroCalc.statusLabel(cfg.creditStressBands, S.catScores.credit.score);
    S.growthMomentum = MacroCalc.statusLabel(cfg.growthMomentumBands, S.catScores.growth.score);
    S.profitCycleScore = MacroCalc.aggregateCategory(S.scored, cfg.categoryMembers.profitCycle);
    S.profitCycle = MacroCalc.statusLabel(cfg.profitCycleBands, S.profitCycleScore.score);
    S.inflections = MacroCalc.detectInflections(raw, S.scored, cfg);
    S.whatChanged = computeWhatChanged();
    S.creditImpulse = computeCreditImpulse();
  }

  function computeNetLiquidityProxy(raw) {
    var fb = raw.fed_balance_sheet, tga = raw.treasury_general_account, rrp = raw.reverse_repo;
    function combine(field) {
      return (isNum(fb[field]) && isNum(tga[field]) && isNum(rrp[field])) ? (fb[field] - tga[field] - rrp[field]) : null;
    }
    return {
      name: "Net Liquidity Proxy", category: "liquidity", unit: "USD Mrd.", frequency: "wöchentlich (abgeleitet)",
      source: "VISION UNIVERSE COMPOSITE", seriesId: null, isComposite: true,
      observationDate: fb.observationDate,
      currentValue: combine("currentValue"), previousValue: combine("previousValue"),
      threeMonthsAgo: combine("threeMonthsAgo"), sixMonthsAgo: combine("sixMonthsAgo"), oneYearAgo: combine("oneYearAgo")
    };
  }

  function computeCreditImpulse() {
    var members = S.config.categoryMembers.credit;
    var pos = 0, neg = 0;
    members.forEach(function (id) {
      var sc = S.scored[id]; if (!sc) return;
      if (sc.momentum === "positive") pos++;
      if (sc.momentum === "negative") neg++;
    });
    if (pos > neg) return "IMPROVING";
    if (neg > pos) return "WORSENING";
    return "STABLE";
  }

  function computeWhatChanged() {
    var items = [];
    Object.keys(S.config.categoryMembers).filter(function (k) { return k[0] !== "_" && CATEGORY_LABELS[k]; }).forEach(function (cat) {
      var members = S.config.categoryMembers[cat];
      var best = null;
      members.forEach(function (id) {
        var sc = S.scored[id]; if (!sc) return;
        var mag = Math.abs(sc.score - 50);
        if (!best || mag > Math.abs(best.sc.score - 50)) best = { id: id, sc: sc, mag: mag };
      });
      if (best && best.mag >= 8) items.push({ category: cat, id: best.id, sc: best.sc, mag: best.mag });
    });
    items.sort(function (a, b) { return b.mag - a.mag; });
    return items.slice(0, 6);
  }

  /* ---------------- Narrative generation (Level x Trend x Beschleunigung) ---------------- */
  function directionWord(dir) { return { up: "steigt", down: "fällt", flat: "bleibt stabil", unknown: "ist unklar" }[dir] || "ist unklar"; }
  function accelPhrase(acc) {
    return {
      accelerating: "Das Tempo beschleunigt sich.",
      decelerating: "Das Tempo verlangsamt sich.",
      reversing: "Die Richtung hat sich zuletzt gedreht.",
      stable: "Das Tempo bleibt stabil.",
      unknown: ""
    }[acc] || "";
  }
  function momentumClosing(mom) {
    return { positive: "Das ist tendenziell positiv für Risikoassets.", negative: "Das ist tendenziell negativ für Risikoassets.", neutral: "", unknown: "" }[mom] || "";
  }

  function buildNarrative(meta, sc) {
    if (!isNum(meta.currentValue)) {
      return "Für diesen Indikator konnte in der aktuellen Recherche kein verifizierter Aktuellwert gefunden werden — es wird bewusst kein Wert geschätzt.";
    }
    var parts = [meta.name + " steht bei " + fmtVal(meta.currentValue, meta.unit) + " (" + fmtObsDate(meta.observationDate) + ")."];
    var points = [];
    if (isNum(meta.oneYearAgo)) points.push({ l: "vor 1 Jahr", v: meta.oneYearAgo });
    if (isNum(meta.sixMonthsAgo)) points.push({ l: "vor 6 Monaten", v: meta.sixMonthsAgo });
    if (isNum(meta.threeMonthsAgo)) points.push({ l: "vor 3 Monaten", v: meta.threeMonthsAgo });
    if (isNum(meta.previousValue) && meta.previousValue !== meta.threeMonthsAgo) points.push({ l: "zuletzt", v: meta.previousValue });
    if (points.length) {
      parts.push("Verlauf: " + points.map(function (p) { return fmtVal(p.v, meta.unit) + " (" + p.l + ")"; }).join(" → ") + " → " + fmtVal(meta.currentValue, meta.unit) + " (aktuell).");
    } else {
      parts.push("Für frühere Vergleichszeiträume liegt aktuell kein verifizierter Wert vor.");
    }
    var ap = accelPhrase(sc.acceleration); if (ap) parts.push(ap);
    var mc = momentumClosing(sc.momentum); if (mc) parts.push(mc);
    return parts.join(" ");
  }

  function shortSignalPhrase(id) {
    var meta = S.current.indicators[id], sc = S.scored[id];
    if (!meta || !sc || !isNum(meta.currentValue)) return (meta ? meta.name : id) + ": keine verifizierten Daten";
    var acc = { accelerating: " (beschleunigt)", decelerating: " (verlangsamt)", reversing: " (Richtungswechsel)" }[sc.acceleration] || "";
    return meta.name + " " + directionWord(sc.direction) + acc;
  }

  /* ---------------- Mini trend chart (5-Punkte, echte Datenpunkte) ---------------- */
  function miniChart(meta, signalClass) {
    var pts = [meta.oneYearAgo, meta.sixMonthsAgo, meta.threeMonthsAgo, meta.previousValue, meta.currentValue].filter(isNum);
    if (pts.length < 2) return "";
    var W = 130, H = 38, pad = 5;
    var lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts), span = (hi - lo) || Math.max(Math.abs(hi), 1) * 0.1 || 1;
    var stepX = (W - 2 * pad) / (pts.length - 1);
    function x(i) { return pad + i * stepX; }
    function y(v) { return H - pad - ((v - lo) / span) * (H - 2 * pad); }
    var path = pts.map(function (v, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1); }).join(" ");
    var lastDot = '<circle class="kpi-dot ' + signalClass + '" cx="' + x(pts.length - 1).toFixed(1) + '" cy="' + y(pts[pts.length - 1]).toFixed(1) + '" r="3"/>';
    return '<svg class="kpi-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"><path class="kpi-line ' + signalClass + '" d="' + path + '"/>' + lastDot + '</svg>';
  }

  /* ---------------- KPI card ---------------- */
  var noteCounter = 0;
  function kpiCard(id, overrideMeta) {
    var meta = overrideMeta || S.current.indicators[id];
    if (!meta) return "";
    var sc = S.scored[id] || { direction: "unknown", momentum: "unknown", acceleration: "unknown", signal: "unknown", score: 50 };
    var hasData = isNum(meta.currentValue);
    var change = (isNum(meta.currentValue) && isNum(meta.previousValue)) ? (meta.currentValue - meta.previousValue) : null;
    var chart = hasData ? miniChart(meta, sc.signal) : "";
    noteCounter++;
    var noteId = "kpinote" + noteCounter;
    var noteBtn = meta.notes ? '<button class="kpi-note-toggle" type="button" data-target="' + noteId + '">Datenhinweis anzeigen</button><p class="kpi-note" id="' + noteId + '" hidden>' + esc(meta.notes) + "</p>" : "";
    return '' +
      '<div class="kpi-card' + (hasData ? "" : " nodata") + '">' +
      '<div class="kpi-top">' +
      '<div><div class="kpi-name">' + esc(meta.name) + '</div>' +
      '<div class="kpi-series">' + (meta.seriesId ? esc(meta.seriesId) + " · " : "") + esc(meta.source || "") + '</div></div>' +
      '<span class="kpi-signal ' + sc.signal + '">' + signalLabelDE(sc.signal) + '</span>' +
      '</div>' +
      (hasData ? (
        '<div class="kpi-value-row"><span class="kpi-value">' + fmtVal(meta.currentValue, meta.unit) + '</span>' +
        (change != null ? '<span class="kpi-change ' + sc.signal + '">' + fmtVal(change, meta.unit, true) + '</span>' : '') +
        '</div>' + chart +
        '<div class="kpi-meta"><span>' + esc(meta.frequency || "") + '</span><span>' + fmtObsDate(meta.observationDate) + '</span></div>' +
        '<p class="kpi-interp">' + esc(buildNarrative(meta, sc)) + '</p>'
      ) : '<p class="kpi-interp kpi-nv">Für diesen Indikator konnte in der aktuellen Recherche kein verifizierter Wert gefunden werden.</p>') +
      noteBtn +
      '</div>';
  }

  /* ---------------- Signal card (Overview) ---------------- */
  function signalCard(cat) {
    var catScore = S.catScores[cat];
    var status = MacroCalc.statusLabel(S.config.subscoreStatusBands, catScore.score);
    var members = S.config.categoryMembers[cat].slice(0, 3);
    return '' +
      '<div class="signal-card">' +
      '<div class="signal-card-top"><span class="signal-card-name">' + CATEGORY_LABELS[cat] + '</span></div>' +
      '<div class="signal-card-score"><b>' + (isNum(catScore.score) ? catScore.score : "–") + '</b><span>/ 100</span></div>' +
      '<span class="signal-status ' + arrowClassFor(status) + '">' + (status === "IMPROVING" ? "↑ " : status === "DETERIORATING" ? "↓ " : "→ ") + status + '</span>' +
      '<ul class="signal-bullets">' + members.map(function (id) { return "<li>" + esc(shortSignalPhrase(id)) + "</li>"; }).join("") + '</ul>' +
      '</div>';
  }

  /* ---------------- Regime scale (Hero) ---------------- */
  function regimeScaleHtml(score) {
    var bands = S.config.regimeBands;
    var total = bands[bands.length - 1].max - bands[0].min || 100;
    var segs = bands.map(function (b) {
      var w = (b.max - b.min + 1) / total * 100;
      return '<div class="regime-scale-seg" style="width:' + w + '%;background:' + toneColor(b.tone) + '"></div>';
    }).join("");
    var pct = isNum(score) ? Math.max(0, Math.min(100, score)) : 50;
    return '' +
      '<div class="regime-scale">' +
      '<div class="regime-scale-labels"><span>RISK-OFF</span><span>NEUTRAL</span><span>RISK-ON</span></div>' +
      '<div class="regime-scale-track">' + segs + '<div class="regime-scale-marker" style="left:' + pct + '%"></div></div>' +
      '</div>';
  }
  function toneColor(tone) {
    return {
      "stress": "#7a201a", "off": "#d84d43", "off-lite": "#f2b8a9", "neutral": "#d8d8dc",
      "on-lite": "#8fe0b2", "on": "#14b85a", "strong-on": "#0e7a3c"
    }[tone] || "#d8d8dc";
  }

  function gaugeScaleHtml(score) {
    var pct = isNum(score) ? Math.max(0, Math.min(100, score)) : 50;
    return '' +
      '<div class="gauge-scale">' +
      '<div class="gauge-scale-labels"><span>Risk-Off</span><span>Neutral</span><span>Risk-On</span></div>' +
      '<div class="gauge-scale-track"><div class="gauge-scale-marker" style="left:' + pct + '%"></div></div>' +
      '</div>';
  }

  /* ---------------- View renderers ---------------- */
  function renderShellMeta() {
    var d = new Date(S.current.meta.generatedAt);
    $("#lastUpdate").textContent = "Datenstand " + d.toLocaleDateString("de-DE", { year: "numeric", month: "long" });
  }

  function renderOverview() {
    var r = S.regime, band = MacroCalc.bandLookup(S.config.regimeBands, r.score);
    var html = "";
    html += '<div class="mkicker">VISION UNIVERSE®</div><h1 class="mtitle">MACRO REGIME</h1>' +
      '<p class="msubtitle">Ein datenbasierter Blick auf Liquidität, Kredit, Financial Conditions, Zinsen, Wachstum, Inflation und Arbeitsmarkt — nicht nur der Level zählt, sondern Trend und Beschleunigung.</p>';

    html += '<div class="regime-hero">' +
      '<div class="mkicker">GESAMT-SCORE</div>' +
      '<div class="regime-score-row"><div class="regime-score">' + r.score + '<sup>/100</sup></div>' +
      '<div class="regime-label tone-' + r.tone + '">' + r.label + '</div></div>' +
      regimeScaleHtml(r.score) +
      '<div class="regime-updated">Gewichtung: Liquidität 20% · Credit 15% · Financial Conditions 15% · Zinsen 15% · Wachstum 15% · Inflation 10% · Arbeitsmarkt 10% — zentral konfigurierbar in data/config.json.</div>' +
      '</div>';

    html += '<div class="msection-label">MACRO SIGNAL CARDS</div>' +
      '<div class="signal-grid">' + Object.keys(CATEGORY_LABELS).filter(function (c) { return S.config.regimeWeights[c] !== undefined; }).map(signalCard).join("") + '</div>';

    html += '<div class="msection-label">WAS HAT SICH VERÄNDERT?<span>datenbasiert, ggü. letztverfügbaren Vergleichszeiträumen</span></div>';
    if (S.whatChanged.length) {
      html += '<div class="change-grid">' + S.whatChanged.map(function (it) {
        var meta = it.id === "net_liquidity_proxy" ? S.netLiquidityProxy : S.current.indicators[it.id];
        var arrow = it.sc.momentum === "positive" ? "↑" : it.sc.momentum === "negative" ? "↓" : "→";
        var arrowCls = it.sc.momentum === "positive" ? "pos" : it.sc.momentum === "negative" ? "neg" : "neu";
        return '<div class="change-card"><div class="change-head"><span class="change-arrow ' + arrowCls + '">' + arrow + '</span><span class="change-cat">' + CATEGORY_LABELS[it.category] + '</span></div>' +
          '<p class="change-text">' + esc(buildNarrative(meta, it.sc)) + '</p></div>';
      }).join("") + '</div>';
    } else {
      html += '<div class="mstate">Keine signifikanten Veränderungen gegenüber den verfügbaren Vergleichszeiträumen.</div>';
    }

    html += '<div class="msection-label">VISION UNIVERSE MACRO READ<span>Stand ' + S.content.macroRead.asOf + ', redaktionell, monatlich aktualisiert</span></div>' +
      '<div class="read-grid">' +
      '<div class="read-card tailwinds"><h3>Tailwinds</h3><ul>' + S.content.macroRead.tailwinds.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + '</ul></div>' +
      '<div class="read-card headwinds"><h3>Headwinds</h3><ul>' + S.content.macroRead.headwinds.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + '</ul></div>' +
      '<div class="read-card regime-change"><h3>Regime Change</h3><p style="font-size:13.5px;line-height:1.6;color:#333;margin:0">' + esc(S.content.macroRead.regimeChange) + '</p></div>' +
      '<div class="read-card bottom-line"><h3>Bottom Line</h3><p>' + esc(S.content.macroRead.bottomLine) + '</p></div>' +
      '</div>';

    html += '<div class="msection-label">MACRO INFLECTION POINTS<span>regelbasiert aus den Rohdaten erkannt</span></div>';
    html += inflectionListHtml(S.inflections);

    html += '<div class="msection-label">ASSET IMPLICATIONS<span>qualitative Makro-Sensitivität, keine Anlageempfehlung</span></div>' +
      '<div class="asset-grid">' + S.content.assetImplications.map(function (a) {
        return '<div class="asset-card"><div class="asset-head"><span class="asset-name">' + esc(a.asset) + '</span><span class="asset-stance ' + a.stance + '">' + (a.stance === "positive" ? "POSITIVE" : a.stance === "negative" ? "NEGATIVE" : "NEUTRAL") + '</span></div>' +
          '<div class="asset-line"><b>Tailwind:</b> ' + esc(a.tailwind) + '</div><div class="asset-line"><b>Headwind:</b> ' + esc(a.headwind) + '</div></div>';
      }).join("") + '</div>';

    html += '<div class="msection-label">MACRO REGIME HISTORY<span>monatliche Snapshots, wird laufend ergänzt</span></div>' + historyChartHtml();

    $("#view-overview").innerHTML = html;
    bindNoteToggles($("#view-overview"));
  }

  function inflectionListHtml(list) {
    if (!list.length) return '<div class="inflection-empty">Aktuell keine Wendepunkte, die die konfigurierten Schwellenwerte auslösen.</div>';
    return '<div class="inflection-list">' + list.map(function (inf) {
      var badgeCls = inf.direction === "positive" ? "positive" : inf.direction === "negative" ? "negative" : "neutral";
      var badgeChar = inf.direction === "positive" ? "↑" : inf.direction === "negative" ? "↓" : "→";
      return '<div class="inflection-row"><div class="inflection-badge ' + badgeCls + '">' + badgeChar + '</div>' +
        '<div class="inflection-body"><div class="inflection-cat">' + CATEGORY_LABELS[inf.category] + '</div>' +
        '<div class="inflection-title">' + esc(inf.title) + '</div>' +
        '<div class="inflection-desc">' + esc(inf.description) + '</div></div>' +
        '<div class="inflection-severity">' + (inf.severity === "high" ? "HOCH" : "MEDIUM") + '</div></div>';
    }).join("") + '</div>';
  }

  function historyChartHtml() {
    var snaps = S.history.snapshots;
    if (snaps.length < 2) {
      var s0 = snaps[0];
      return '<div class="history-chart-wrap"><div class="history-empty">Erster Snapshot: ' + s0.month + ' — Score ' + s0.regimeScore + '/100 (' + s0.regimeLabel + '). Die Historie wird ab dem nächsten monatlichen Update automatisch fortgeschrieben (siehe data/history.json, Archiv unter data/archive/).</div></div>';
    }
    var W = 900, H = 180, pad = 30;
    var max = 100, min = 0;
    var stepX = (W - 2 * pad) / (snaps.length - 1 || 1);
    var barW = Math.min(48, stepX * 0.5);
    function y(v) { return H - pad - (v - min) / (max - min) * (H - 2 * pad); }
    var bars = snaps.map(function (s, i) {
      var x = pad + i * stepX;
      var yv = y(s.regimeScore);
      return '<rect class="hbar" x="' + (x - barW / 2).toFixed(1) + '" y="' + yv.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + (H - pad - yv).toFixed(1) + '" rx="4"/>' +
        '<text class="haxis" x="' + x.toFixed(1) + '" y="' + (yv - 8).toFixed(1) + '" text-anchor="middle">' + s.regimeScore + '</text>' +
        '<text class="haxis" x="' + x.toFixed(1) + '" y="' + (H - pad + 16).toFixed(1) + '" text-anchor="middle">' + s.month + '</text>';
    }).join("");
    return '<div class="history-chart-wrap"><svg class="history-svg" viewBox="0 0 ' + W + ' ' + H + '">' +
      '<line class="hgrid" x1="' + pad + '" x2="' + (W - pad) + '" y1="' + y(50) + '" y2="' + y(50) + '"/>' + bars + '</svg></div>';
  }

  function categoryHeaderHtml(cat, score, status, statusClass, description) {
    return '<div class="cat-header">' +
      '<div class="cat-score-wrap"><div class="cat-score">' + (isNum(score) ? score : "–") + '</div><div class="cat-score-label">/ 100</div>' +
      '<span class="cat-status ' + statusClass + '">' + status + '</span></div>' +
      '<div class="cat-body"><h2>' + CATEGORY_LABELS[cat] + '</h2><p>' + esc(description) + '</p>' + gaugeScaleHtml(score) + '</div>' +
      '</div>';
  }

  function renderLiquidity() {
    var score = S.catScores.liquidity.score, status = MacroCalc.statusLabel(S.config.subscoreStatusBands, score);
    var html = '<div class="mkicker">LIQUIDITÄT</div><h1 class="mtitle">Liquidität</h1>';
    html += categoryHeaderHtml("liquidity", score, status, arrowClassFor(status) === "pos" ? "pos" : arrowClassFor(status) === "neg" ? "neg" : "neu", S.content.categoryIntro.liquidity);
    html += '<div class="msection-label">NET LIQUIDITY PROXY<span>Fed-Bilanz − TGA − Reverse Repo</span></div>';
    html += '<div class="composite-card"><span class="composite-tag">VISION UNIVERSE COMPOSITE</span>' +
      kpiCard("net_liquidity_proxy", S.netLiquidityProxy) +
      '<p class="composite-formula">' + esc(S.content.compositeNotes.net_liquidity_proxy) + '<br><code>Fed-Bilanzsumme (WALCL) − Treasury General Account (WTREGEN) − Overnight Reverse Repo (RRPONTSYD)</code></p></div>';
    html += '<div class="msection-label">INDIKATOREN</div><div class="kpi-grid">' +
      S.config.categoryMembers.liquidity.filter(function (id) { return id !== "net_liquidity_proxy"; }).map(function (id) { return kpiCard(id); }).join("") + '</div>';
    $("#view-liquidity").innerHTML = html;
    bindNoteToggles($("#view-liquidity"));
  }

  function renderRates() {
    var score = S.catScores.rates.score, status = MacroCalc.statusLabel(S.config.subscoreStatusBands, score);
    var html = '<div class="mkicker">ZINSEN</div><h1 class="mtitle">Zinsen & Zinsstrukturkurve</h1>';
    html += categoryHeaderHtml("rates", score, status, arrowClassFor(status) === "pos" ? "pos" : arrowClassFor(status) === "neg" ? "neg" : "neu", S.content.categoryIntro.rates);
    html += '<div class="msection-label">YIELD CURVE REGIME<span>10J–2J-Spread-basiert</span></div>' +
      '<div class="composite-card"><span class="composite-tag">VISION UNIVERSE COMPOSITE</span>' +
      '<h3 style="margin:0 0 6px;font-size:20px;font-weight:900">' + esc(S.yieldCurve.regime) + '</h3>' +
      '<p class="composite-formula">' + esc(S.content.compositeNotes.yield_curve_regime) + '</p></div>';
    html += '<div class="msection-label">LEITZINS & TREASURY-RENDITEN</div><div class="kpi-grid">' +
      ["fed_funds_rate", "treasury_2y", "treasury_5y", "treasury_10y", "treasury_30y"].map(function (id) { return kpiCard(id); }).join("") + '</div>';
    html += '<div class="msection-label">SPREADS & REALRENDITEN</div><div class="kpi-grid">' +
      ["spread_10y2y", "spread_10y3m", "real_yield_5y", "real_yield_10y"].map(function (id) { return kpiCard(id); }).join("") + '</div>';
    $("#view-rates").innerHTML = html;
    bindNoteToggles($("#view-rates"));
  }

  function renderFinancialConditions() {
    var score = S.catScores.financialConditions.score, status = MacroCalc.statusLabel(S.config.subscoreStatusBands, score);
    var html = '<div class="mkicker">FINANCIAL CONDITIONS</div><h1 class="mtitle">Financial Conditions</h1>';
    html += categoryHeaderHtml("financialConditions", score, status, arrowClassFor(status) === "pos" ? "pos" : arrowClassFor(status) === "neg" ? "neg" : "neu", S.content.categoryIntro.financialConditions);
    html += '<div class="callout muted">EASING ←──────── NEUTRAL ────────→ TIGHTENING. Negative Indexwerte = lockerer als der historische Durchschnitt. Coverage in V1 eingeschränkt, da für NFCI/ANFCI nur vereinzelte historische Vergleichspunkte recherchierbar waren (siehe Datenhinweise).</div>';
    html += '<div class="msection-label">INDIKATOREN</div><div class="kpi-grid">' +
      S.config.categoryMembers.financialConditions.map(function (id) { return kpiCard(id); }).join("") + '</div>';
    $("#view-financialConditions").innerHTML = html;
    bindNoteToggles($("#view-financialConditions"));
  }

  function renderCredit() {
    var score = S.catScores.credit.score, statusLabel = S.creditStress;
    var cls = (statusLabel === "HEALTHY" || statusLabel === "NORMAL") ? "pos" : (statusLabel === "STRESS RISING" || statusLabel === "HIGH STRESS") ? "neg" : "neu";
    var html = '<div class="mkicker">CREDIT</div><h1 class="mtitle">Credit</h1>';
    html += categoryHeaderHtml("credit", score, statusLabel, cls, S.content.categoryIntro.credit);
    html += '<div class="msection-label">CREDIT STRESS SCORE & CREDIT IMPULSE</div>' +
      '<div class="composite-card"><span class="composite-tag">VISION UNIVERSE COMPOSITE</span>' +
      '<p class="composite-formula">' + esc(S.content.compositeNotes.credit_stress_score) + ' Aktueller Status: <b>' + statusLabel + '</b>. Credit Impulse (Richtung der Bewegung über die vier Kreditindikatoren hinweg): <b>' + S.creditImpulse + '</b>.</p></div>';
    html += '<div class="msection-label">INDIKATOREN</div><div class="kpi-grid">' +
      S.config.categoryMembers.credit.map(function (id) { return kpiCard(id); }).join("") + '</div>';
    html += '<div class="callout muted">Senior Loan Officer Opinion Survey (Lending Standards / Loan Demand) ist architektonisch vorbereitet, aber in diesem Datensatz noch nicht gepflegt — sobald verlässliche Werte recherchiert sind, ergänzt ein künftiges Update diese Kennzahl hier, ohne Code-Änderungen.</div>';
    $("#view-credit").innerHTML = html;
    bindNoteToggles($("#view-credit"));
  }

  function renderInflation() {
    var score = S.catScores.inflation.score, status = MacroCalc.statusLabel(S.config.subscoreStatusBands, score);
    var html = '<div class="mkicker">INFLATION</div><h1 class="mtitle">Inflation</h1>';
    html += categoryHeaderHtml("inflation", score, status, arrowClassFor(status) === "pos" ? "pos" : arrowClassFor(status) === "neg" ? "neg" : "neu", S.content.categoryIntro.inflation);
    html += '<div class="msection-label">FED FLEXIBILITY<span>abgeleitet aus dem Inflations-Subscore</span></div>' +
      '<div class="composite-card"><span class="composite-tag">VISION UNIVERSE COMPOSITE</span>' +
      '<h3 style="margin:0 0 6px;font-size:20px;font-weight:900">' + S.fedFlex + '</h3>' +
      '<p class="composite-formula">' + esc(S.content.compositeNotes.fed_flexibility) + '</p></div>';
    html += '<div class="msection-label">HEADLINE VS. CORE</div><div class="kpi-grid">' +
      ["cpi_yoy", "core_cpi_yoy", "pce_yoy", "core_pce_yoy", "ppi_yoy"].map(function (id) { return kpiCard(id); }).join("") + '</div>';
    html += '<div class="msection-label">MARKET INFLATION EXPECTATIONS</div><div class="kpi-grid">' +
      ["breakeven_5y", "breakeven_10y", "wage_growth_yoy"].map(function (id) { return kpiCard(id); }).join("") + '</div>';
    $("#view-inflation").innerHTML = html;
    bindNoteToggles($("#view-inflation"));
  }

  function renderGrowth() {
    var score = S.catScores.growth.score;
    var html = '<div class="mkicker">WACHSTUM</div><h1 class="mtitle">Wachstum</h1>';
    html += categoryHeaderHtml("growth", score, S.growthMomentum, arrowClassFor(MacroCalc.statusLabel(S.config.subscoreStatusBands, score)), S.content.categoryIntro.growth);
    html += '<div class="msection-label">INDIKATOREN</div><div class="kpi-grid">' +
      S.config.categoryMembers.growth.map(function (id) { return kpiCard(id); }).join("") + '</div>';
    html += '<div class="msection-label">CORPORATE PROFITS & PROFIT CYCLE</div>' +
      '<div class="composite-card"><span class="composite-tag">VISION UNIVERSE COMPOSITE</span>' +
      '<p class="composite-formula">' + esc(S.content.compositeNotes.profit_cycle) + ' Aktueller Status: <b>' + S.profitCycle + '</b> (Datenabdeckung eingeschränkt — für beide Reihen liegt aktuell nur der jüngste Quartalswert ohne Vorquartalsvergleich vor).</p></div>' +
      '<div class="kpi-grid">' + ["corporate_profits_yoy", "unit_labor_costs_yoy"].map(function (id) { return kpiCard(id); }).join("") + '</div>';
    $("#view-growth").innerHTML = html;
    bindNoteToggles($("#view-growth"));
  }

  function renderLabor() {
    var score = S.catScores.labor.score, status = MacroCalc.statusLabel(S.config.subscoreStatusBands, score);
    var html = '<div class="mkicker">ARBEITSMARKT</div><h1 class="mtitle">Arbeitsmarkt</h1>';
    html += categoryHeaderHtml("labor", score, status, arrowClassFor(status) === "pos" ? "pos" : arrowClassFor(status) === "neg" ? "neg" : "neu", S.content.categoryIntro.labor);
    var sahm = S.current.indicators.sahm_rule;
    html += '<div class="msection-label">SAHM-REGEL — RECESSION MONITOR<span>kein alleiniger Frühindikator</span></div>' +
      '<div class="composite-card"><span class="composite-tag">FRED · SAHMREALTIME</span>' +
      '<p class="composite-formula">Aktuell: <b>' + fmtVal(sahm.currentValue, sahm.unit) + '</b> (' + fmtObsDate(sahm.observationDate) + ') — Auslöseschwelle liegt bei ' + S.config.inflectionRules.sahmTriggerLevel + ' Pp. ' + (isNum(sahm.currentValue) && sahm.currentValue >= S.config.inflectionRules.sahmTriggerLevel ? "Schwelle erreicht/überschritten." : "Deutlich unterhalb der Rezessions-Schwelle — aktuell kein Signal.") + '</p></div>';
    html += '<div class="msection-label">INDIKATOREN</div><div class="kpi-grid">' +
      S.config.categoryMembers.labor.map(function (id) { return kpiCard(id); }).join("") + '</div>';
    $("#view-labor").innerHTML = html;
    bindNoteToggles($("#view-labor"));
  }

  function renderHousing() {
    var cat = S.catScores.housing;
    var status = MacroCalc.statusLabel(S.config.subscoreStatusBands, cat.score);
    var html = '<div class="mkicker">HOUSING</div><h1 class="mtitle">Housing</h1>';
    html += categoryHeaderHtml("housing", cat.score, status, arrowClassFor(status), S.content.categoryIntro.housing);
    html += '<div class="msection-label">HOUSING MOMENTUM<span>zinssensitiver Frühindikator</span></div>' +
      '<div class="kpi-grid">' + S.config.categoryMembers.housing.map(function (id) { return kpiCard(id); }).join("") + '</div>';
    $("#view-housing").innerHTML = html;
    bindNoteToggles($("#view-housing"));
  }

  function renderGlobal() {
    var cat = S.catScores.global;
    var status = MacroCalc.statusLabel(S.config.subscoreStatusBands, cat.score);
    var html = '<div class="mkicker">GLOBAL</div><h1 class="mtitle">Global Macro</h1>';
    html += categoryHeaderHtml("global", cat.score, status, arrowClassFor(status), S.content.categoryIntro.global);
    var known = S.config.categoryMembers.global.filter(function (id) { var sc = S.scored[id]; return sc && sc.direction !== "unknown"; });
    html += '<div class="msection-label">GLOBAL LIQUIDITY PRESSURE</div>';
    if (known.length >= 2) {
      html += '<div class="callout info">Mehrere globale Indikatoren zeigen eine gemeinsame Richtung — siehe Einzelkarten unten für Details.</div>';
    } else {
      html += '<div class="callout muted">Für eine belastbare Einschätzung von Dollar, Öl und Realrenditen in Kombination fehlen aktuell historische Vergleichspunkte für mindestens zwei der drei Reihen (siehe Datenhinweise) — es wird bewusst keine Aussage erzwungen.</div>';
    }
    html += '<div class="msection-label">INDIKATOREN</div><div class="kpi-grid">' +
      S.config.categoryMembers.global.map(function (id) { return kpiCard(id); }).join("") + '</div>';
    html += '<div class="callout muted"><b>Für V2 vorbereitet, noch nicht befüllt:</b> China Credit Impulse, globale Einkaufsmanagerindizes (PMI), USD/JPY, EZB/Fed-Zinsdifferenz, weitere globale Liquiditätsindikatoren. Es werden bewusst keine Platzhalterwerte angezeigt, um keine Daten vorzutäuschen.</div>';
    $("#view-global").innerHTML = html;
    bindNoteToggles($("#view-global"));
  }

  function renderPlaybook() {
    var html = '<div class="mkicker">MACRO PLAYBOOK</div><h1 class="mtitle">Druckenmiller-Playbook</h1>' +
      '<p class="msubtitle">Konzeptionelle Denkprinzipien hinter diesem Dashboard — kein Zitat-Archiv, sondern der Rahmen, an dem sich die Berechnungslogik orientiert.</p>' +
      '<div class="playbook-grid">' + S.content.playbook.map(function (p, i) {
        return '<div class="playbook-card"><div class="playbook-num">PRINZIP ' + (i + 1) + '</div><h3>' + esc(p.title) + '</h3><p>' + esc(p.text) + '</p></div>';
      }).join("") + '</div>';
    $("#view-playbook").innerHTML = html;
  }

  function renderAllViews() {
    renderOverview(); renderLiquidity(); renderRates(); renderFinancialConditions(); renderCredit();
    renderInflation(); renderGrowth(); renderLabor(); renderHousing(); renderGlobal(); renderPlaybook();
  }

  function bindNoteToggles(root) {
    (root.querySelectorAll ? [].slice.call(root.querySelectorAll(".kpi-note-toggle")) : []).forEach(function (btn) {
      btn.onclick = function () {
        var el = document.getElementById(btn.dataset.target);
        if (!el) return;
        el.hidden = !el.hidden;
        btn.textContent = el.hidden ? "Datenhinweis anzeigen" : "Datenhinweis ausblenden";
      };
    });
  }

  /* ---------------- Navigation ---------------- */
  var VIEWS = ["overview", "liquidity", "rates", "financialConditions", "credit", "inflation", "growth", "labor", "housing", "global", "playbook"];

  function setupNav() {
    $("#mtabs").addEventListener("click", function (e) {
      var btn = e.target.closest(".mtab");
      if (!btn) return;
      location.hash = "#" + btn.dataset.view;
    });
  }

  function applyHash() {
    var v = (location.hash || "#overview").replace("#", "");
    if (VIEWS.indexOf(v) === -1) v = "overview";
    S.view = v;
    $all(".mview").forEach(function (el) { el.classList.toggle("on", el.id === "view-" + v); });
    $all(".mtab").forEach(function (el) { el.classList.toggle("on", el.dataset.view === v); });
    window.scrollTo(0, 0);
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
