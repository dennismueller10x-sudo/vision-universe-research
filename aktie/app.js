/* =========================================================================
   VISION UNIVERSE — aktie/app.js            Die gemeinsame Aktienseite /aktie/#/<T>

   Prototyp „App-Konzept 2“ (Owner 14./15.11.2026), Bildschirm #v-aktie, 1:1:
   Kopf (Logo, Name, was die Firma macht, Herz) · Kurs groß mit Tagesbewegung ·
   Chart über die volle Breite · Zeiträume als Pillen · „In drei Sätzen“ ·
   „Analyse aus N Modulen“ (Kachel je Modul, Tipp öffnet ein Fenster mit dem
   Wichtigsten und dem Weg ins Modul) · „Das Geschäft“ · „Aus den News“ ·
   „Mehr wie …“ · „Vergleichen“ · „Daten & Hinweise“.

   Nur Darstellung. Modell, Grafiken und Daten: assets/vu-stock-sheet.js
   (VUStockSheet.model/.draw/.data). Die Aktienseiten der Module bleiben
   bestehen; jedes Fenster führt hinein.

   Klickentwurf „Modul-Aktienseiten“ (Owner 17.11.2026): Kachel, Fenster, „In drei
   Sätzen“ und Modulseite sagen dasselbe (Lesarten in VUStockSheet.model). Modul-
   Kontext in der Adresse: /aktie/#/<T>/<modul> (quant, technical, fundamental,
   hedgefonds, elliott, supertrader, discover) öffnet nach dem Laden das Fenster
   dieses Moduls über der Aktienseite; Schließen (X, daneben tippen, Griff nach
   unten, Esc) führt auf /aktie/#/<T>. /aktie/#/<T> bleibt gültig.
   ========================================================================= */
(function (root) {
  "use strict";
  var S = root.VUStockSheet, doc = root.document;
  if (!S || !doc) return;
  var D = S.draw, F = S.fmt, esc = F.esc, num = F.num;
  var main = doc.getElementById("ak-main");
  var US_TICKER = /^[A-Z0-9][A-Z0-9-]{0,11}$/;
  var HEDGE_SHARDS = 32; /* hedgefonds/app.js#STOCK_SHARDS */
  var state = null;

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  var SHEET_IDS = ["fundamental", "quant", "technical", "supertrader", "hedgefonds", "elliott", "discover"];
  /** Adresse #/<T> oder #/<T>/<modul> → {ticker, mod}; ein unbekanntes Modul zählt nicht (die Aktie öffnet ohne Fenster). */
  function routeOfHash() {
    var m = /^#\/([A-Za-z0-9-]{1,12})(?:\/([a-z]{1,16}))?\/?$/.exec(root.location.hash || ""), t = m ? m[1].toUpperCase() : null;
    return t && US_TICKER.test(t) ? { ticker: t, mod: m[2] && SHEET_IDS.indexOf(m[2]) >= 0 ? m[2] : null } : null;
  }
  function sh(title, more, attr) { return '<div class="k-sh"><h2>' + esc(title) + "</h2>" + (more ? "<button type=\"button\" class=\"k-tap\" " + (attr || "") + "><span>" + esc(more) + " ›</span></button>" : "") + "</div>"; }
  var MARK = { strong: "▲", weak: "▼", mid: "●" };
  function tonePill(word, tone, extra) { return '<span class="k-pill ' + (tone === "strong" || tone === "plain" ? "" : tone === "weak" ? "wh" : tone === "mid" ? "dk" : "ol") + '" style="align-self:flex-start' + (extra || "") + '">' + (MARK[tone] ? MARK[tone] + "\u00a0" : "") + esc(word) + "</span>"; }
  /* Bewegung über einen Zeitraum (kein Tageswert): Pille wie im Prototyp, Plus neongrün, Minus weiß. */
  function chg(v, digits) { return isNum(v) ? '<span class="k-pill ' + (v < 0 ? "wh" : "") + '">' + (v < 0 ? "▼" : "▲") + " " + esc(F.pct(v, digits == null ? 0 : digits)) + "</span>" : ""; }

  /* ---------------------------------------------------------------- Chart */
  var RANGES = [["1M", 31], ["6M", 183], ["1J", 366], ["5J", 1827, true], ["Max", 0, true]];
  function windowOf(points, days) {
    if (!days || !points.length) return points;
    var from = new Date(Date.parse(points[points.length - 1][0]) - days * 864e5).toISOString().slice(0, 10);
    return points.filter(function (p) { return p[0] >= from; });
  }
  function drawChart() {
    var host = doc.getElementById("ak-chart"), st = state;
    if (!host || !st) return;
    var r = RANGES.filter(function (x) { return x[0] === st.range; })[0] || RANGES[2];
    var src = r[2] ? st.long : st.daily;
    if (!src) { if (r[2] && !st.longAsked) { st.longAsked = true; S.data.loadSeries(st.ticker, true).then(function (p) { if (state === st) { st.long = p; drawChart(); } }); } return; }
    var pts = windowOf(src, r[1]);
    host.innerHTML = pts.length > 1 ? D.line(pts.map(function (p) { return p[1]; }), Math.max(280, Math.round(host.clientWidth || 390)), 230, { fill: true, base: true, sw: 2.4 }) : "";
    var note = doc.getElementById("ak-chart-note");
    if (note && pts.length > 1) { var a = pts[0], b = pts[pts.length - 1]; note.textContent = F.pct((b[1] / a[1] - 1) * 100, 1) + " seit " + F.dateShort(a[0]) + a[0].slice(0, 4); }
    Array.prototype.forEach.call(doc.querySelectorAll("#ak-ranges [data-range]"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-range") === st.range)); b.style.background = b.getAttribute("data-range") === st.range ? "" : "none"; });
  }

  /* ------------------------------------------------------------- Kacheln */
  function mtile(id, name, pill, graphic) {
    return '<button type="button" class="k-tile k-tap" data-ak-sheet="' + id + '" aria-haspopup="dialog" style="padding:13px;min-height:158px;display:flex;flex-direction:column"><div class="k-fl k-g8"><div class="k-hud" style="width:30px;height:30px;border-radius:9px">' + D.icon(id, 17) + '</div><b class="k-sm">' + name + '</b></div><div class="k-f1 k-fl" style="justify-content:center;padding:6px 0">' + graphic + "</div>" + pill + "</button>";
  }
  function seg2(m, h) {
    var n = m.buyers + m.sellers, a = n ? Math.round(m.buyers / n * 100) : 50;
    return '<div class="k-seg2"' + (h ? ' style="height:' + h + 'px"' : "") + '><i style="width:' + a + '%"></i><i style="width:' + (100 - a) + '%"></i></div>';
  }
  function modulesHtml(v) {
    var m = v.modules, t = [];
    if (m.fundamental) t.push(mtile("fundamental", "Fundamental", tonePill(m.fundamental.word, m.fundamental.tone), D.bars(m.fundamental.series, 130, 62)));
    if (m.quant) t.push(mtile("quant", "Quant", tonePill(m.quant.word, "mid"), D.radar(S.model.PROFILE_KEYS.map(function (k) { return m.quant.profile[k]; }), 96)));
    if (m.technical) t.push(mtile("technical", "Technical", tonePill(m.technical.word, m.technical.tone),
      state.daily && state.daily.length > 1 ? D.line(state.daily.map(function (p) { return p[1]; }), 130, 62, { sw: 2.2, zones: [m.technical.support, m.technical.resistance] }) : ""));
    if (m.supertrader) t.push(mtile("supertrader", "Supertrader", tonePill(m.supertrader.word, "none"), D.ring(m.supertrader.total ? m.supertrader.count / m.supertrader.total * 100 : 0, 66, 8, m.supertrader.total ? m.supertrader.count + "/" + m.supertrader.total : String(m.supertrader.count))));
    if (m.hedgefonds) t.push(mtile("hedgefonds", "Hedgefonds", tonePill(m.hedgefonds.word || num(m.hedgefonds.funds, 0) + " Fonds", m.hedgefonds.word ? m.hedgefonds.tone : "none"),
      m.hedgefonds.buyers != null && m.hedgefonds.sellers != null ? '<div style="width:100%">' + seg2(m.hedgefonds) + '<div class="k-fl k-sb k-xs k-b7 k-mt8"><span class="k-lc">' + num(m.hedgefonds.buyers, 0) + " auf</span><span>" + num(m.hedgefonds.sellers, 0) + " ab</span></div></div>"
        : '<div class="k-num" style="font-size:34px">' + num(m.hedgefonds.funds, 0) + "</div>"));
    if (m.elliott) t.push(mtile("elliott", "Elliott", tonePill(m.elliott.word, m.elliott.countable ? "mid" : "none"),
      m.elliott.countable ? '<div style="text-align:center"><div class="k-num k-lc" style="font-size:40px">' + esc(m.elliott.wave || "✓") + '</div><div class="k-xs k-mut k-b7 k-mt4">' + esc(m.elliott.pattern) + "</div></div>"
        : '<svg width="120" height="54" aria-hidden="true"><path class="ak-ew-none" d="M4 44 28 20 44 32 70 8 86 24 116 14" fill="none" stroke-width="2.2" stroke-dasharray="4 5" stroke-linejoin="round"/></svg>'));
    return t.join("");
  }
  function moduleCount(v) { return Object.keys(v.modules).length; }
  function moduleNote(v) {
    var tones = ["fundamental", "technical", "hedgefonds"].map(function (k) { return v.modules[k] && v.modules[k].word ? v.modules[k].tone : null; });
    var s = tones.filter(function (x) { return x === "strong"; }).length, w = tones.filter(function (x) { return x === "weak"; }).length;
    return [s ? s + " stark" : "", w ? w + " schwach" : ""].filter(Boolean).join(" · ");
  }
  function titleCase(s) { return String(s || "").toLocaleLowerCase("de-DE").replace(/(^|[\s+\-/])(\p{L})/gu, function (m, a, b) { return a + b.toLocaleUpperCase("de-DE"); }).replace(/\b(Im|In|Und|Mit|Von|Der|Die|Das|Für|Am|An|Auf|Zum|Zur)\b/g, function (x, w, i) { return i ? x.toLowerCase() : x; }); }

  /* --------------------------------------------------------------- Fenster
     Klickentwurf (Fenster m-*): Modul-Symbol, „<Name> in“, Modulname, Urteil als Pille, X; unten „Im Modul … öffnen“. */
  var XICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  function xbtn() { return '<button type="button" class="k-rnd k-x k-tap" data-ak-close aria-label="Schließen">' + XICON + "</button>"; }
  function mhead(v, id, name, word, tone) {
    return '<div class="k-fl k-g10"><div class="k-hud">' + D.icon(id, 22) + '</div><div style="flex:none"><div class="k-xs k-mut k-b7">' + esc(v.short) + ' in</div><h2 style="font-size:24px;white-space:nowrap">' + name + "</h2></div>" +
      (word ? tonePill(word, tone, ";align-self:center;flex:0 1 auto;margin-left:auto;min-width:0;white-space:normal;height:auto;min-height:26px;padding-block:4px;line-height:1.15") : "") + xbtn() + "</div>";
  }
  function mfoot(href, name) { return '<a class="k-btn k-mt16 k-tap" style="width:100%" href="' + esc(href) + '">Im Modul ' + name + " öffnen</a>"; }
  function dateDe(iso) { return iso ? F.dateShort(iso) + String(iso).slice(0, 4) : ""; }
  var SHEETS = {
    fundamental: function (v) {
      var m = v.modules.fundamental, tr = v.tracks[0];
      return mhead(v, "fundamental", "Fundamental", m.word, m.tone) +
        (m.text ? '<p class="k-md k-b8 k-mt12">' + esc(m.text) + ".</p>" : '<p class="k-md k-sec k-mt12">Für ' + esc(v.short) + " fehlen Wachstum oder Marge über mehrere Jahre. Die Zahlen gelten trotzdem.</p>") +
        (tr ? '<div class="k-fl k-g10 k-mt8" style="align-items:flex-end;flex-wrap:wrap"><span class="k-num" style="font-size:40px">' + esc(F.compact(tr.value, "USD")) + "</span>" + chg(tr.growthPct, 1) + '</div><div class="k-xs k-mut k-b7">Umsatz GJ ' + tr.fy + '</div><div class="k-mt8 ak-bars">' + D.bars(tr.points.map(function (p) { return p.v; }), 358, 110) + "</div>" : "") +
        v.facts.map(function (f) { return '<div class="k-fl k-g8 k-mt8"><span class="k-sm k-f1">' + esc(f.label) + '</span><b class="k-sm" style="text-align:right">' + esc(f.value) + "</b>" + (f.grade ? '<span class="k-pill sm ' + (f.tone === "strong" ? "" : f.tone === "weak" ? "wh" : "dk") + '" style="text-transform:none;letter-spacing:0">' + esc(f.grade) + "</span>" : "") + "</div>"; }).join("") +
        '<p class="k-xs k-mut k-mt8">' + (tr ? "Umsatz je Geschäftsjahr " + tr.from + " bis " + tr.fy + ". " : "") + "Urteil wie im Modul: die schwächere Stufe aus Umsatzwachstum und Nettomarge. Quelle: Pflichtmeldungen" + (v.asOf.zahlen ? ", Stand " + dateDe(v.asOf.zahlen) : "") + ".</p>" + mfoot(m.href, "Fundamental");
    },
    quant: function (v) {
      var m = v.modules.quant, K = S.model.PROFILE_KEYS, L = S.model.PROFILE_LABEL;
      var rows = K.filter(function (k) { return m.profile[k] != null; }).sort(function (a, b) { return m.profile[b] - m.profile[a]; });
      return mhead(v, "quant", "Quant", m.word, "mid") + '<div class="k-fl k-g12 k-mt12">' + D.radar(K.map(function (k) { return m.profile[k]; }), 140) + '<div class="k-f1" style="min-width:0">' + rows.map(function (k) {
        var x = m.profile[k];
        return '<div class="k-mt4"><div class="k-fl k-sb k-xs k-b7 k-g6"><span>' + esc(L[k]) + "</span><span>" + x + '</span></div><div class="k-bar ' + (x >= S.model.STRONG ? "l" : "") + '" style="height:6px;margin-top:2px"><i style="width:' + x + '%"></i></div></div>';
      }).join("") + '</div></div><p class="k-xs k-mut k-mt12">Werte 0–100: Rang unter den bewerteten US-Aktien, stark ab ' + S.model.STRONG + ". Eine Gesamtnote gibt es bewusst nicht.</p>" + mfoot(m.href, "Quant");
    },
    technical: function (v) {
      var m = v.modules.technical, vals = (state.daily || []).map(function (p) { return p[1]; }), p = v.price && v.price.value, rows = [];
      var zl = function (z) { return num(z.lo, 0) + "–" + num(z.hi, 0) + " $"; };
      if (isNum(m.sma200)) rows.push(["Trend", num(Math.abs(m.sma200) * 100, 1) + " % " + (m.sma200 >= 0 ? "über" : "unter") + " der 200-Tage-Linie"]);
      if (isNum(m.rsi)) rows.push(["Schwung", "RSI " + num(m.rsi, 1) + " (Skala 0 bis 100)"]);
      if (m.support && isNum(p) && p > m.support.hi) rows.push(["Nächste Zone", "Unterstützung, " + num((p - m.support.hi) / p * 100, 0) + " % entfernt"]);
      else if (m.resistance && isNum(p) && p < m.resistance.lo) rows.push(["Nächste Zone", "Widerstand, " + num((m.resistance.lo - p) / p * 100, 0) + " % entfernt"]);
      else if (m.support && isNum(p)) rows.push(["Nächste Zone", "Kurs liegt in der Unterstützung " + zl(m.support)]);
      var w = Math.round((doc.querySelector("#vsk-m .vu-sheet-ui") || main).clientWidth || 390);
      return mhead(v, "technical", "Technical", m.word, m.tone) +
        (vals.length > 1 ? '<div class="k-bleed" style="margin-top:12px;position:relative">' + D.line(vals, w, 170, { sw: 2.2, zones: [m.support, m.resistance], fit: true }) + "</div>" : "") +
        '<div class="k-fl k-g6 k-wr k-mt8">' + (m.resistance ? '<span class="k-pill sm wh">Widerstand ' + zl(m.resistance) + "</span>" : "") + (m.support ? '<span class="k-pill sm">Unterstützung ' + zl(m.support) + "</span>" : "") + "</div>" +
        rows.map(function (r) { return '<div class="k-row"><b style="width:104px">' + r[0] + '</b><span class="k-sm k-sec k-f1">' + esc(r[1]) + "</span></div>"; }).join("") +
        '<p class="k-xs k-mut k-mt8">Urteil wie im Modul: Kurs über oder unter der 50- und der 200-Tage-Linie' + (m.asOf ? ", Stand " + dateDe(m.asOf) : "") + ". Keine Prognose.</p>" + mfoot(m.href, "Technical");
    },
    supertrader: function (v) {
      var m = v.modules.supertrader, names = m.entries.map(function (e) { return e.name; }), ST = root.STNames;
      var today = m.count ? m.count + (m.total ? " von " + m.total : "") + " Methoden " + (m.count === 1 ? "erkennt " : "erkennen ") + v.short + ": " + (names.length <= 2 ? names.join(" und ") : names.slice(0, 2).join(", ") + " und " + (names.length - 2) + " weitere") + "."
        : "Keine der " + (m.total ? m.total + " " : "") + "Methoden erkennt " + v.short + " gerade.";
      return mhead(v, "supertrader", "Supertrader", m.total ? m.count + " von " + m.total : String(m.count), "none") +
        '<p class="k-sm k-sec k-mt12">' + esc(today) + "</p>" +
        m.entries.map(function (e) {
          var mt = ST && ST.method ? ST.method(e.id) : null;
          return '<div class="k-card k-mt8" style="border-radius:18px"><div class="k-fl k-sb k-g8"><b class="k-f1">' + esc(e.name) + '</b><span class="k-pill dk" style="font-size:11px">Regel erfüllt laut Methode</span></div>' +
            (e.stageText ? '<div class="k-xs k-mut k-b7 k-mt4">Stand im Ablauf: ' + esc(e.stageText) + "</div>" : "") +
            (mt && mt.plain ? '<div class="k-sm k-sec k-mt4">' + esc(mt.plain) + "</div>" : "") +
            (e.met.length ? '<div class="k-xs k-mut k-b7 k-mt4">' + e.met.length + (e.met.length === 1 ? " Regel" : " Regeln") + " erfüllt" + (e.notMet.length ? ", " + e.notMet.length + " nicht" : "") + (e.pending.length ? ", " + e.pending.length + " offen" : "") + "</div>" : "") + "</div>";
        }).join("") +
        '<p class="k-xs k-mut k-mt8">Forschung, nicht zertifiziert. Methoden beschreiben Regel-Ereignisse, keine Empfehlung.' + (m.asOf ? " Schlusskurse vom " + dateDe(m.asOf) + "." : "") + "</p>" + mfoot(m.href, "Supertrader");
    },
    hedgefonds: function (v) {
      var m = v.modules.hedgefonds, q = m.period ? "Q" + Math.ceil(+m.period.slice(5, 7) / 3) + " " + m.period.slice(0, 4) : "";
      return mhead(v, "hedgefonds", "Hedgefonds", m.word || num(m.funds, 0) + " Fonds", m.word ? m.tone : "none") +
        '<div class="k-num k-mt12" style="font-size:44px">' + num(m.funds, 0) + ' Fonds</div><p class="k-sm k-mut k-b7">halten ' + esc(v.short) + (m.stars != null ? ", darunter " + num(m.stars, 0) + " Star-Investoren" : "") + "</p>" +
        (m.buyers != null && m.sellers != null ? '<div class="k-mt12">' + seg2(m, 20) + '</div><div class="k-fl k-sb k-sm k-b8 k-mt8"><span class="k-lc">' + num(m.buyers, 0) + " aufgestockt</span><span>" + num(m.sellers, 0) + " verkauft</span></div>" : "") +
        (m.fresh ? '<div class="k-row"><b class="k-f1">Neue Positionen großer Fonds</b><span class="k-sm k-b8 k-lc">' + m.fresh + "</span></div>" : "") +
        '<p class="k-xs k-mut k-mt8">' + (q ? "Stand " + q + ". " : "") + "Angabe Dritter aus Pflichtmeldungen (13F).</p>" + mfoot(m.href, "Hedgefonds");
    },
    elliott: function (v) {
      var m = v.modules.elliott, DIR = { UP: "nach oben", DOWN: "nach unten" }, sh = m.share;
      return mhead(v, "elliott", "Elliott", m.word, m.countable ? "mid" : "none") +
        (m.countable ? '<p class="k-md k-sec k-mt12">Das Modell zählt bei ' + esc(v.short) + " gerade eine Struktur" + (DIR[m.direction] ? " " + DIR[m.direction] : "") + '.</p><div class="k-card k-mt12 k-fl k-g12" style="border-radius:18px"><span class="k-num k-lc" style="font-size:44px">' + esc(m.wave || "✓") + '</span><b class="k-sm">' + esc(m.line) + ". Experimentelles Strukturmodell.</b></div>" +
            (m.invalid ? '<p class="k-sm k-sec k-mt8">Die Lesart ist ' + esc(m.invalid) + " (Wochenschluss).</p>" : "")
          : '<p class="k-md k-sec k-mt12">Bei ' + esc(v.short) + " lassen sich gerade keine Wellen sauber zählen. Der Chart verläuft zu unruhig für eine belastbare Lesart.</p>" +
            (sh && isNum(sh.count) && isNum(sh.n) ? '<div class="k-card k-mt12 k-fl k-g12" style="border-radius:18px"><span class="k-num k-lc" style="font-size:44px">' + num(sh.count, 0) + '</span><b class="k-sm">von ' + num(sh.n, 0) + " Aktien sind heute zählbar. Das ist der Normalfall.</b></div>" : "")) +
        mfoot(m.href, "Elliott");
    },
    discover: function (v) {
      var m = v.modules.discover, st = m.story || {}, best = m.best;
      var col = function (eb, x) { return x ? '<div class="k-f1" style="min-width:0"><div class="k-eb">' + eb + '</div><div class="k-num k-mt4" style="font-size:26px">' + esc(x.word) + '</div><p class="k-xs k-sec k-mt4">' + esc(x.text) + "</p></div>" : ""; };
      return mhead(v, "discover", "Discover", best ? "Platz " + best.rank : "", "plain") +
        (st.business || st.price ? '<div class="k-fl k-g12 k-mt12" style="align-items:flex-start">' + col("Geschäft", st.business) + col("Kurs", st.price) + "</div>" : "") +
        (m.ranks.length ? '<div class="k-eb k-mt16">Steht in ' + (m.rows === 1 ? "einer Reihe" : m.rows + " Reihen") + "</div>" + m.ranks.map(function (r) {
          return '<div class="k-fl k-g10 k-mt8"><span class="k-num k-lc" style="font-size:28px;width:56px">' + r.rank + '.</span><div class="k-f1" style="min-width:0"><b class="k-sm">' + esc(titleCase(r.title)) + '</b><div class="k-bar l k-mt4" style="height:6px"><i style="width:' + Math.max(3, Math.round((1 - (r.rank - 1) / r.of) * 100)) + '%"></i></div></div><span class="k-xs k-mut">von ' + num(r.of, 0) + "</span></div>";
        }).join("") + '<p class="k-xs k-mut k-mt12">Platz nach der Regel der Reihe. Die Wörter oben sind Discovers Story. Keine Empfehlung.</p>' : '<p class="k-sm k-sec k-mt12">Anlass, Kurs und Unternehmen im Überblick.</p>') + mfoot(m.href, "Discover");
    },
    hinweise: function (v) {
      var rows = [["Kurse", v.asOf.kurs ? "Schluss " + F.dateShort(v.asOf.kurs) + v.asOf.kurs.slice(0, 4) : null], ["Geschäftszahlen", v.asOf.zahlen ? "Pflichtmeldungen bis " + F.dateShort(v.asOf.zahlen) : null],
        ["Eigenschaften (Quant)", v.asOf.quant ? F.dateShort(v.asOf.quant) + v.asOf.quant.slice(0, 4) : null], ["Methoden", v.asOf.supertrader ? F.dateShort(v.asOf.supertrader) + v.asOf.supertrader.slice(0, 4) : null], ["Investoren", v.asOf.fonds ? "Depots zum " + F.dateShort(v.asOf.fonds) + v.asOf.fonds.slice(0, 4) : null]];
      var N = root.VUUI && root.VUUI.legalNotice && root.VUUI.legalNotice("stock");
      return '<div class="k-fl k-g10"><h2 class="k-f1" style="font-size:24px">Daten &amp; Hinweise</h2>' + xbtn() + "</div>" + (N ? '<p class="k-sm k-sec k-mt8">' + esc(N.text) + "</p>" : "") +
        rows.filter(function (r) { return r[1]; }).map(function (r) { return '<div class="k-row"><div style="width:8px;height:8px;border-radius:9px;background:#c8f531;flex:none"></div><b class="k-f1">' + r[0] + '</b><span class="k-sm k-mut">' + esc(r[1]) + "</span></div>"; }).join("") +
        [["Quellen und Methodik", "/infos/#quellen"], ["Rechtliches und Infos", "/infos/"]].map(function (l) { return '<a class="k-row k-tap" style="width:100%" href="' + l[1] + '"><b class="k-f1">' + l[0] + '</b><span class="k-mut">' + D.CHEV + "</span></a>"; }).join("");
    }
  };
  /** Fenster eines Moduls öffnen (nur mit Daten zur Aktie). Schließt es sich und nennt die Adresse ein Modul (Modul-Kontext),
      kehrt die Adresse auf /aktie/#/<T> zurück – ohne neuen Eintrag im Verlauf und ohne Neuladen. */
  function openSheet(id) {
    var v = state && state.view;
    if (!v || !SHEETS[id] || (id !== "hinweise" && !v.modules[id])) return null;
    /* Erst das leere Fenster, dann der Inhalt: die Grafik des Technical-Fensters richtet sich nach seiner Breite. */
    var el = S.ui.popup("vsk-m", "");
    if (!el) return null;
    el.setAttribute("data-ak-open", id);
    el.querySelector(".vsk").innerHTML = SHEETS[id](v);
    el.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("[data-ak-close]") && root.VUUI) root.VUUI.closeSheet(el); });
    el.addEventListener("vu-sheet-close", function () { clearContext(v.ticker); });
    return el;
  }
  function clearContext(ticker) {
    var r = routeOfHash();
    if (r && r.mod && r.ticker === ticker && root.history && root.history.replaceState) root.history.replaceState(root.history.state, "", root.location.pathname + root.location.search + "#/" + ticker);
  }
  /* Modul-Kontext: das Fenster öffnet, sobald das Modul Daten hat; liegen alle Quellen vor und das Modul hat keine, bleibt die Seite. */
  function openPending() {
    var st = state, mod = st && st.pending;
    if (!mod || !st.view) return;
    if (st.view.modules[mod]) { st.pending = null; openSheet(mod); }
    else if (st.settled) { st.pending = null; clearContext(st.ticker); }
  }

  /* ---------------------------------------------------------------- Seite */
  function storyHtml(v) {
    var t = [];
    if (v.business) t.push('<div class="k-tile' + (v.business.tone === "strong" ? " ak-lime" : "") + '" style="width:250px"><div class="k-eb">Geschäft</div><div class="k-num k-mt4" style="font-size:30px">' + esc(v.business.word) + '</div><div class="k-mt8">' + D.bars(v.business.series, 220, 64) + '</div><p class="k-sm k-b7 k-mt8">' + esc(v.business.sentence) + "</p></div>");
    if (v.chart) t.push('<div class="k-tile" style="width:250px"><div class="k-eb">Kurs</div><div class="k-num k-mt4" style="font-size:30px">' + esc(v.chart.word) + '</div><div class="k-mt8" id="ak-story-line"></div><p class="k-sm k-sec k-b7 k-mt8">' + esc(v.chart.sentence) + "</p></div>");
    if (v.valuation) {
      var mx = Math.max(v.valuation.pe, v.valuation.median || 0) || 1, row = function (label, x, me) {
        return '<div class="k-fl k-g8 k-sm k-b8' + (me ? "" : " k-mt8") + '"><span style="width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"' + (me ? "" : ' class="k-mut"') + ">" + esc(label) + '</span><div class="k-bar ' + (me ? "l " : "") + 'k-f1" style="height:14px"><i style="width:' + Math.max(3, Math.round(x / mx * 100)) + "%" + (me ? "" : ";background:#55595f") + '"></i></div><span' + (me ? "" : ' class="k-mut"') + ">" + num(x, 1) + "</span></div>";
      };
      t.push('<div class="k-tile" style="width:250px"><div class="k-eb">Bewertung</div><div class="k-num k-mt4" style="font-size:30px">' + esc(v.valuation.word.replace(" als der Markt", "")) + '</div><div class="k-mt12">' + row(v.ticker, v.valuation.pe, true) + (v.valuation.median != null ? row("Markt", v.valuation.median, false) : "") + '</div><p class="k-sm k-sec k-b7 k-mt8">' + esc(v.valuation.sentence) + "</p></div>");
    }
    return t.length ? sh("In " + (t.length === 3 ? "drei" : t.length === 2 ? "zwei" : "einem") + (t.length === 1 ? " Satz" : " Sätzen")) + '<div class="k-rail">' + t.join("") + "</div>" : "";
  }
  function businessHtml(v) {
    if (!v.tracks.length) return "";
    return sh("Das Geschäft", v.modules.fundamental ? "Alle Kennzahlen" : "", 'data-ak-sheet="fundamental"') + '<div class="k-px"><div class="k-tile" id="ak-biz"><div class="k-fl k-g6">' + v.tracks.map(function (tr, i) {
      return '<button type="button" class="k-tab" data-ak-track="' + tr.id + '" aria-pressed="' + (i === 0) + '" style="height:32px' + (i ? ";background:var(--k-dk)" : "") + '">' + tr.label + "</button>";
    }).join("") + "</div>" + v.tracks.map(function (tr, i) {
      var p = tr.points, mid = p[Math.floor((p.length - 1) / 3)], mid2 = p[Math.floor((p.length - 1) * 2 / 3)];
      return '<div data-ak-pane="' + tr.id + '"' + (i ? " hidden" : "") + '><div class="k-fl k-g10 k-mt12" style="align-items:flex-end"><span class="k-num" style="font-size:38px">' + esc(F.compact(tr.value, "USD")) + "</span>" + chg(tr.growthPct) + '</div><div class="k-mt12 ak-bars">' + D.bars(p.map(function (x) { return x.v; }), 374, 130) + '</div><div class="k-fl k-sb k-xs k-mut k-b7 k-mt4"><span>' + p[0].fy + "</span>" + (p.length > 3 ? "<span>" + mid.fy + "</span><span>" + mid2.fy + "</span>" : "") + "<span>" + tr.fy + "</span></div></div>";
    }).join("") + "</div></div>";
  }
  function poster(c) {
    var up = isNum(c.return12M) ? c.return12M >= 0 : true;
    return '<a class="k-tile k-tap" style="width:128px;padding:12px" href="/aktie/#/' + encodeURIComponent(c.ticker) + '" data-vu-stock="' + esc(c.ticker) + '" data-vu-stock-name="' + esc(c.name) + '">' + D.logo(c.ticker) + '<div class="k-b8 k-mt8" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(c.name) + '</div><div class="k-mt8" style="height:38px" data-ak-spark="' + esc(c.ticker) + '" data-up="' + up + '">' + D.line(c.path, 104, 38, { dot: false, sw: 2, fill: up }) + '</div><div class="k-mt8">' + chg(c.return12M) + "</div></a>";
  }
  function pageHtml(v) {
    var n = moduleCount(v), note = moduleNote(v), partner = S.ui.comparePartner(v), d = v.modules.discover;
    return '<header class="k-px k-fl k-g12" data-vu-stock="' + esc(v.ticker) + '" data-vu-stock-name="' + esc(v.name) + '">' + D.logo(v.ticker, "x") + '<div class="k-f1" style="min-width:0"><h1 style="margin:0;font-size:34px;line-height:1.02;overflow-wrap:anywhere">' + esc(v.short) + '</h1><div class="k-sm k-mut k-mt4">' + esc([v.what || v.rest, v.ticker].filter(Boolean).join(" · ")) + "</div></div>" +
      '<button type="button" class="k-rnd k-tap k-heart" data-vsk-heart="' + esc(v.ticker) + '" aria-pressed="false" style="width:46px;height:46px">' + D.HEART + "</button></header>" +
      (v.price ? '<div class="k-px k-fl k-g10 k-mt12" style="align-items:flex-end;flex-wrap:wrap"><span class="k-num" style="font-size:52px">' + esc(F.money(v.price.value, v.price.currency)) + '</span><div style="padding-bottom:4px">' + D.move(v.price.changePct, true) + "</div></div>" : "") +
      '<div id="ak-chart" style="margin-top:6px;position:relative;min-height:230px;overflow:hidden"></div><span id="ak-chart-note" class="ak-sr" aria-live="polite"></span>' +
      '<div class="k-px k-fl k-sb k-xs k-b7 k-mut k-mt4" id="ak-ranges" role="group" aria-label="Zeitraum">' + RANGES.map(function (r) { return '<button type="button" class="k-tab" data-range="' + r[0] + '" aria-pressed="' + (r[0] === "1J") + '" style="height:30px;padding:0 13px;font-size:12.5px' + (r[0] === "1J" ? "" : ";background:none") + '">' + r[0] + "</button>"; }).join("") + "</div>" +
      storyHtml(v) +
      (n ? sh("Analyse aus " + n + " Modulen", "") .replace("</h2>", "</h2>" + (note ? "<span>" + esc(note) + "</span>" : "")) + '<div class="k-px" id="ak-mods" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' + modulesHtml(v) + "</div>" : "") +
      (d ? '<div class="k-px k-mt8"><button type="button" class="k-tile k-tap k-fl k-g10" data-ak-sheet="discover" aria-haspopup="dialog" style="padding:12px 14px;text-align:left"><div class="k-hud" style="width:30px;height:30px;border-radius:9px">' + D.icon("discover", 17) + '</div><div class="k-f1"><b class="k-sm">Discover</b><div class="k-xs k-mut" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (d.best ? "Platz " + d.best.rank + " · " + esc(titleCase(d.best.title)) : "Anlass, Kurs und Unternehmen im Überblick") + "</div></div>" + (d.rows ? '<span class="k-pill">' + d.rows + (d.rows === 1 ? " Reihe" : " Reihen") + "</span>" : "") + "</button></div>" : "") +
      businessHtml(v) +
      (v.news.length ? '<div class="k-sh"><h2>Aus den News</h2><a class="k-tap" href="/insights/"><span>Alle ›</span></a></div><div class="k-rail">' + v.news.map(function (a) {
        return '<a class="k-cover k-tap" href="' + esc(a.href) + '" style="width:270px;height:170px">' + (a.image ? '<img src="' + esc(a.image) + '" alt="" loading="lazy" decoding="async">' : "") + '<div class="sc"></div><div class="ct2">' + (a.tag ? '<span class="k-pill sm">' + esc(a.tag) + "</span>" : "") + '<div class="k-b8 k-mt4" style="line-height:1.1">' + esc(a.title) + "</div></div></a>";
      }).join("") + "</div>" : "") +
      (v.similar.length ? sh("Mehr wie " + v.short) + '<div class="k-rail">' + v.similar.map(poster).join("") + "</div>" : "") +
      (partner ? '<div class="k-px k-fl k-g8" style="margin-top:22px"><button type="button" class="k-btn k-f1 k-tap" data-ak-compare>Vergleichen</button></div>' : "") +
      '<div class="k-end"><button type="button" class="k-lk" data-ak-sheet="hinweise">Daten &amp; Hinweise' + (v.asOf.kurs ? " · Schluss " + F.dateShort(v.asOf.kurs) : "") + "</button></div>";
  }
  function fill() {
    var st = state, v = st.view;
    main.innerHTML = pageHtml(v);
    main.setAttribute("aria-busy", "false");
    doc.title = v.name + " (" + v.ticker + ") · Aktie — Vision Universe®";
    S.ui.bindHearts(main);
    drawChart(); storyLine(); sparks();
  }
  /* „Mehr wie …“: die Kurslinie jeder Karte aus ihrer kanonischen Jahresreihe (bis sie da ist: der Verlauf der Discover-Karte). */
  function sparks() {
    var st = state;
    Array.prototype.forEach.call(main.querySelectorAll("[data-ak-spark]"), function (host) {
      S.data.loadSeries(host.getAttribute("data-ak-spark")).then(function (p) {
        if (state === st && host.isConnected && p.length > 1) host.innerHTML = D.line(p.map(function (x) { return x[1]; }), 104, 38, { dot: false, sw: 2, fill: host.getAttribute("data-up") === "true" });
      });
    });
  }
  function storyLine() {
    var host = doc.getElementById("ak-story-line"), st = state;
    if (host && st.daily && st.daily.length > 1) host.innerHTML = D.line(st.daily.map(function (p) { return p[1]; }), 220, 64, { sw: 2.2 });
  }
  function refreshModules() {
    var st = state, host = doc.getElementById("ak-mods");
    if (host) host.innerHTML = modulesHtml(st.view);
  }
  function blank(title, text) {
    main.setAttribute("aria-busy", "false");
    main.innerHTML = '<div class="k-px" style="padding-top:40px"><h1 style="font-size:28px">' + esc(title) + '</h1><p class="k-md k-mut k-mt8">' + esc(text) + '</p><a class="k-btn k-mt16 k-tap" href="/discover/#/suche">Aktie suchen</a></div>';
  }
  function hedgeOf(ticker) {
    return S.data.getJSON("/hedgefonds/data/stocks/index.json").then(function (ix) {
      var row = ((ix && ix.rows) || []).filter(function (r) { return r[1] === ticker; })[0];
      if (!row) return null;
      var cusip = String(row[0]), n = 0;
      for (var i = 0; i < cusip.length; i++) n += cusip.charCodeAt(i);
      return S.data.getJSON("/hedgefonds/data/stocks/" + (n % HEDGE_SHARDS) + ".json").then(function (part) { var x = part && part[cusip]; return x && x.ticker === ticker ? x : null; });
    });
  }
  function show(ticker, mod) {
    var st = state = { ticker: ticker, range: "1J", daily: null, long: null, src: null, view: null, pending: mod || null, settled: false };
    main.setAttribute("aria-busy", "true");
    root.scrollTo(0, 0);
    S.data.load(ticker).then(function (src) {
      if (state !== st) return;
      if (!src.detail && !src.watch) { st.pending = null; clearContext(ticker); blank("Keine Daten zu " + ticker, "Für dieses Kürzel liegt keine Aktie vor."); return; }
      st.src = src; st.view = S.model.summarize(src);
      fill();
      var hedge = hedgeOf(ticker).then(function (h) { if (state !== st || !h) return; st.src.hedge = h; st.view = S.model.summarize(st.src); refreshModules(); });
      /* Das Technical-Fenster zeichnet die Kurslinie: im Modul-Kontext erst öffnen, wenn sie da ist. */
      var series = S.data.loadSeries(ticker).then(function (p) { if (state !== st) return; st.daily = p; drawChart(); storyLine(); refreshModules(); });
      if (st.pending && st.pending !== "technical" && st.pending !== "hedgefonds") openPending();
      Promise.all([hedge, series]).then(function () { if (state !== st) return; st.settled = true; openPending(); }, function () { if (state === st) { st.settled = true; openPending(); } });
      S.data.getJSON("/insights/artikel.json").then(function (a) {
        if (state !== st || !a || !Array.isArray(a.artikel)) return;
        st.src.articles = a.artikel; var had = st.view.news.length; st.view = S.model.summarize(st.src);
        if (st.view.news.length !== had) fill();
      });
    });
  }
  function route() {
    var r = routeOfHash();
    if (r) {
      doc.documentElement.setAttribute("data-state", "PAGE");
      /* Dieselbe Aktie (z. B. nach dem Schließen des Fensters oder #/<T> → #/<T>/<modul>): nicht neu laden, nur das Fenster. */
      if (state && state.ticker === r.ticker && state.view) { if (r.mod) { state.pending = r.mod; openPending(); } return; }
      show(r.ticker, r.mod);
    }
    else if (root.location.hash.length > 2) blank("Welche Aktie willst du sehen?", "Diese Adresse nennt kein gültiges Kürzel. Suche die Aktie in Discover.");
  }

  main.addEventListener("click", function (e) {
    var n = e.target.closest("[data-ak-sheet],[data-range],[data-ak-track],[data-ak-compare]");
    if (!n || !state || !state.view) return;
    if (n.hasAttribute("data-ak-sheet")) return openSheet(n.getAttribute("data-ak-sheet"));
    if (n.hasAttribute("data-range")) { state.range = n.getAttribute("data-range"); return drawChart(); }
    if (n.hasAttribute("data-ak-track")) {
      var id = n.getAttribute("data-ak-track"), box = doc.getElementById("ak-biz");
      Array.prototype.forEach.call(box.querySelectorAll("[data-ak-track]"), function (b) { var on = b === n; b.setAttribute("aria-pressed", String(on)); b.style.background = on ? "" : "var(--k-dk)"; });
      Array.prototype.forEach.call(box.querySelectorAll("[data-ak-pane]"), function (p) { p.hidden = p.getAttribute("data-ak-pane") !== id; });
      return;
    }
    var p = S.ui.comparePartner(state.view);
    if (p) S.ui.openCompare(state.view, p.ticker, p.name);
  });
  S.bind(main);
  var rz = null;
  root.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(drawChart, 120); });
  root.addEventListener("hashchange", route);
  S.data.ready().then(route);
})(typeof globalThis !== "undefined" ? globalThis : this);
