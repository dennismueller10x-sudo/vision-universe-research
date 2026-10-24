/* =========================================================================
   VISION UNIVERSE CORE — chart-standard.js            (chart-standard-1.2.0)

   EIN CHARTSTANDARD FUER ALLE PRODUKTWELTEN: ZEITRAEUME, START, WAEHRUNG.

   Spezifikation: docs/charts/CHART_STANDARD.md (Owner-Entscheidungen
   23.10.2026). Jede Welt zeichnet weiter mit ihrem eigenen Chart; was sie
   hier bekommt, ist nur die gemeinsame Antwort auf drei Fragen:

   1. ZEITRAEUME. Hauptleiste 1T · 1W · 1M · 1J · 5J · MAX in dieser
      Reihenfolge; vorhandene weitere Zeitraeume (3M, 6M, YTD, 3J, 10J)
      bleiben und stehen dahinter. Fenster in Kalendertagen ab dem letzten
      Datenpunkt, Abdeckung nach core/chart-history.js (95-%-Regel). 1W
      ist ein Betrachtungszeitraum aus Tagesschluessen, keine Wochenkerze.

   2. START. 1T beim ersten Oeffnen; ausserhalb der Handelszeit zeigt 1T
      die letzte Sitzung (der Snapshot traegt Datum und Uhrzeit). Hat der
      Nutzer einen Zeitraum gewaehlt, gilt dieser auch in der naechsten
      Welt (ein Schluessel, kein Produkt). Fehlt der Tagesverlauf ganz,
      startet der laengste abgedeckte Zeitraum bis 1J - 1T bleibt sichtbar,
      aber abgeschaltet. Nie ein aus Tagesschluessen gebauter Tagesverlauf.

   3. WAEHRUNG. Anzeige ueber die vorhandene FX-Schicht (quant/engines/fx,
      VUFx.layer; Praeferenz vu-currency-preference-v1, Vorgabe EUR). Hier
      wird NICHT gerechnet, nur dieselbe Regel fuer alle aufgerufen:
        Reihe     jeder Punkt mit dem EZB-Kurs seines Tages (layer.series)
        1T        alle Punkte und der Vortagesschluss mit dem Kurs der Sitzung
        Linie     Trigger, Stop, Zone: mit dem juengsten Kurs, Original daneben
      Ohne gueltigen Kurs bleibt die Boersenwaehrung - und das wird gesagt.
      Rechnende Modelle (Quant, Supertrader, Elliott) sehen nie EUR.

   UMD: globalThis.VUCore.ChartStandard
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUCore = root.VUCore || {};
  root.VUCore.ChartStandard = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VERSION = "chart-standard-1.2.0";

  /* Kanonische Kennungen und Fenster (Kalendertage). */
  var PRIMARY = ["1T", "1W", "1M", "1J", "5J", "MAX"];
  var EXTRA = ["3M", "6M", "YTD", "3J", "10J"];
  var DEFAULT_RANGE = "1T";
  var DAYS = { "1W": 7, "1M": 31, "3M": 92, "6M": 183, "1J": 366, "3J": 1096, "5J": 1827, "10J": 3653 };
  /* Die Kennungen, die die Welten heute benutzen, auf die kanonischen. */
  var ALIAS = { "1D": "1T", "5D": "1W", "5T": "1W", "1Y": "1J", "3Y": "3J", "5Y": "5J", "10Y": "10J", "Max": "MAX", "ALL": "MAX" };
  /* Ohne Tagesverlauf: der laengste abgedeckte Zeitraum bis 1J. */
  var FALLBACK = ["1J", "6M", "3M", "1M", "1W", "MAX"];
  var RANGE_KEY = "vu-chart-range-v1";

  function canonical(id) {
    var s = String(id || "");
    return ALIAS[s] || s.toUpperCase();
  }

  /** Reihenfolge fuer die Kennungen einer Welt: Hauptleiste zuerst, dann ihre weiteren. */
  function order(ids) {
    var rank = function (id) {
      var c = canonical(id), p = PRIMARY.indexOf(c), e = EXTRA.indexOf(c);
      return p >= 0 ? p : e >= 0 ? PRIMARY.length + e : PRIMARY.length + EXTRA.length;
    };
    return (ids || []).map(function (id, i) { return { id: id, i: i }; })
      .sort(function (a, b) { return rank(a.id) - rank(b.id) || a.i - b.i; })
      .map(function (x) { return x.id; });
  }

  function storage(explicit) {
    if (explicit !== undefined) return explicit;
    try { return typeof localStorage !== "undefined" ? localStorage : null; } catch (e) { return null; }
  }
  function rememberedRange(store) {
    var s = storage(store);
    try { var v = s && s.getItem(RANGE_KEY); return v ? canonical(v) : null; } catch (e) { return null; }
  }
  function rememberRange(id, store) {
    var s = storage(store);
    try { if (s) s.setItem(RANGE_KEY, canonical(id)); } catch (e) { /* ohne Gedaechtnis weiter */ }
  }

  /**
   * Startzeitraum. `isAvailable(kanonischeId)` sagt, ob die Welt ihn zeichnen kann;
   * `offered` sind die kanonischen Kennungen ihrer Leiste.
   */
  function startRange(isAvailable, offered, store) {
    var has = function (id) { return (!offered || offered.indexOf(id) >= 0) && isAvailable(id); };
    var chosen = rememberedRange(store);
    if (chosen && has(chosen)) return chosen;
    if (has(DEFAULT_RANGE)) return DEFAULT_RANGE;
    for (var i = 0; i < FALLBACK.length; i++) if (has(FALLBACK[i])) return FALLBACK[i];
    return null;
  }

  /**
   * Snapshot-Pfad eines Titels im Intraday-Verzeichnis
   * (quant/data/market/intraday/index.json): zuerst der Live-Umfang
   * (entries), sonst die juengste Sitzung in `available`. Dieselbe Regel
   * wie discover/ui/live-hub.js#resolveEntry, hier fuer alle Welten.
   */
  function intradayEntry(index, symbol) {
    if (!index || !symbol) return null;
    var e = index.entries && index.entries[symbol];
    if (e && e.path) return { path: e.path, sessionDate: e.sessionDate || null, derived: false };
    if (!index.available) return null;
    var dates = Object.keys(index.available).sort();
    for (var i = dates.length - 1; i >= 0; i--) {
      var list = index.available[dates[i]];
      if (!list || list.indexOf(symbol) === -1) continue;
      var id = (index.idExceptions && index.idExceptions[symbol]) || String(index.idPattern || "ref_<symbol>").replace("<symbol>", symbol);
      var path = String(index.pathPattern || "/quant/data/market/intraday/<sessionDate>/<securityId>.json")
        .replace("<sessionDate>", dates[i]).replace("<securityId>", id);
      return { path: path, sessionDate: dates[i], derived: true };
    }
    return null;
  }

  /* ------------------------------------------------------------ Fenster */

  var DAY_MS = 86400000;
  function cutoffOf(points, c) {
    var last = points[points.length - 1][0], t = Date.parse(String(last).slice(0, 10));
    if (c === "MAX") return -Infinity;
    if (c === "YTD") return Date.parse(String(last).slice(0, 4) + "-01-01");
    return DAYS[c] ? t - DAYS[c] * DAY_MS : null;
  }

  /**
   * Deckt eine Tagesreihe [[datum, kurs]] den Zeitraum ab? Dieselbe 95-%-Regel wie
   * core/chart-history.js, hier fuer alle kanonischen Kennungen (auch 1W und YTD).
   * 1T ist kein Fenster ueber Tagesschluesse und deckt nie ab.
   */
  function covers(points, id) {
    var c = canonical(id);
    if (!Array.isArray(points) || points.length < 2 || c === "1T") return false;
    if (c === "MAX" || c === "YTD") return true;
    if (!DAYS[c]) return false;
    var span = (Date.parse(String(points[points.length - 1][0]).slice(0, 10)) - Date.parse(String(points[0][0]).slice(0, 10))) / DAY_MS;
    return span >= DAYS[c] * 0.95;
  }

  /** Fenster eines Zeitraums: alle Punkte ab (letzter Tag - Kalendertage), wie core/chart-history.js#sliceRange. */
  function slice(points, id) {
    var c = canonical(id);
    if (!Array.isArray(points) || !points.length) return [];
    var cut = cutoffOf(points, c);
    if (cut === null) return [];
    return points.filter(function (p) { return Date.parse(String(p[0]).slice(0, 10)) >= cut; });
  }

  /* ------------------------------------------------------------ Waehrung */

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function layerOf(layer) {
    if (layer) return layer;
    var g = typeof globalThis !== "undefined" ? globalThis : null;
    return g && g.VUFx && g.VUFx.layer ? g.VUFx.layer : null;
  }

  /** Gewaehlte Anzeigewaehrung (Vorgabe der FX-Schicht: EUR), ohne Schicht die Boersenwaehrung. */
  function displayCurrency(nativeCurrency, layer) {
    var L = layerOf(layer);
    return L && L.preference ? L.preference.get() : nativeCurrency;
  }

  /**
   * Reihe [[datum, kurs]] in der Anzeigewaehrung, jeder Punkt mit dem Kurs seines Tages.
   * Punkte ohne gueltigen Kurs fallen weg (`truncated`); bleibt zu wenig, die Boersenwaehrung.
   */
  function displaySeries(points, nativeCurrency, layer) {
    var L = layerOf(layer), pts = points || [];
    var same = { points: pts, currency: nativeCurrency, converted: false, truncated: false, fxAsOf: null };
    if (!L || !L.series || pts.length < 2) return same;
    var r = L.series(pts, nativeCurrency);
    if (!r || !r.available || r.displayCurrency === r.nativeCurrency || !r.points || r.points.length < 2) return same;
    var out = r.points.map(function (p) { return [p.date, p.display]; });
    var last = r.points[r.points.length - 1];
    return { points: out, currency: r.displayCurrency, converted: true, truncated: out.length < pts.length, fxAsOf: last.fxAsOf || null };
  }

  /**
   * Intraday-Snapshot in der Anzeigewaehrung: alle Punkte und der Vortagesschluss mit dem
   * Kurs der Sitzung (die Prozentveraenderung bleibt die der Boersenwaehrung).
   */
  function displaySnapshot(snap, nativeCurrency, layer) {
    var L = layerOf(layer), same = { snap: snap, currency: nativeCurrency, converted: false, rate: null, fxAsOf: null };
    if (!L || !L.money || !snap || !Array.isArray(snap.points) || !snap.points.length) return same;
    var day = snap.sessionDate || null;
    var probe = L.money(snap.points[snap.points.length - 1][1], nativeCurrency, day, day ? "MARKET_PRICE" : "CURRENT_VALUE");
    if (!probe || !probe.conversionAvailable || probe.display.currency === probe.native.currency) return same;
    var rate = probe.fx && isNum(probe.fx.rate) ? probe.fx.rate : null;
    if (!isNum(rate)) return same;
    var copy = {};
    Object.keys(snap).forEach(function (k) { copy[k] = snap[k]; });
    copy.points = snap.points.map(function (p) { return Array.isArray(p) ? [p[0], p[1] * rate] : p; });
    if (isNum(snap.previousClose)) copy.previousClose = snap.previousClose * rate;
    return { snap: copy, currency: probe.display.currency, converted: true, rate: rate, fxAsOf: probe.fx.asOf || null };
  }

  /**
   * Eine Kursmarke (Trigger, Stop, Zonengrenze) fuer die Anzeige: mit dem juengsten Kurs,
   * der Originalwert reist mit. Modelle rechnen weiter mit `original.value`.
   */
  function displayLevel(value, nativeCurrency, layer) {
    var L = layerOf(layer), orig = { value: value, currency: nativeCurrency };
    if (!L || !L.money || !isNum(value)) return { value: value, currency: nativeCurrency, converted: false, original: orig };
    var m = L.money(value, nativeCurrency, null, "CURRENT_VALUE");
    if (!m || !m.conversionAvailable || m.display.currency === nativeCurrency) return { value: value, currency: nativeCurrency, converted: false, original: orig };
    return { value: m.display.value, currency: m.display.currency, converted: true, original: orig, fxAsOf: m.fx && m.fx.asOf || null };
  }

  /* Die FX-Schicht in der Reihenfolge, in der Discover sie einbindet (discover/index.html). */
  var FX_BASE = "/quant/engines/fx/";
  var FX_SCRIPTS = ["fx-provider-registry", "fx-rates", "fx-freshness", "currency-registry", "currency-class",
    "currency-engine", "money-format", "currency-preference", "currency-contract", "bootstrap", "currency-switch"];
  var displayReady = null;

  /**
   * Browser: stellt die FX-Schicht bereit und startet sie einmal (VUFx.Bootstrap.boot,
   * idempotent). Was die Seite schon geladen hat, wird nicht noch einmal geholt;
   * `extra` sind weitere Skripte der Welt (z. B. series-sampling.js). Liefert den
   * Vertrag oder null - ohne ihn bleibt jede Anzeige in der Boersenwaehrung.
   * Hat ein FX-Paket die Schicht schon mitgebracht (VUFx.PACK: Lizenz und Reihen,
   * scripts/vu2/build-release.mjs), wird nichts nachgeladen und mit dem Paket gestartet.
   */
  function ensureDisplay(extra) {
    if (displayReady) return displayReady;
    var g = typeof globalThis !== "undefined" ? globalThis : null, doc = g && g.document;
    if (!doc) return Promise.resolve(layerOf(null));
    var fx = g.VUFx || {}, packed = !!(fx.Bootstrap && fx.Contract && fx.Rates);
    var want = (extra || []).concat(packed ? [] : FX_SCRIPTS.map(function (n) { return FX_BASE + n + ".js"; }))
      .filter(function (src) { return !doc.querySelector('script[src="' + src + '"]'); });
    displayReady = Promise.all(want.map(function (src) {
      return new Promise(function (ok) {
        var s = doc.createElement("script"); s.src = src; s.async = false; /* Reihenfolge wie im HTML */
        s.onload = ok; s.onerror = ok; (doc.head || doc.documentElement).appendChild(s);
      });
    })).then(function () {
      var B = g.VUFx && g.VUFx.Bootstrap, pack = g.VUFx && g.VUFx.PACK;
      var opts = pack ? { license: pack.license || undefined, preload: pack.series || [] } : undefined;
      return B ? B.boot(opts).catch(function () { return null; }) : null;
    }).then(function () { return layerOf(null); });
    return displayReady;
  }

  /**
   * Kurs im Kopf einer Aktienseite (VUStockNavigator.setPrice-Objekt) in der Anzeigewaehrung.
   * Schlusskurs (`prev` = [datum, kurs] des Vortags, `day`): mit dem EZB-Kurs seines Tages, die
   * Veraenderung zum Vortag aus den umgerechneten Werten. Laufender Kurs (ohne `day`): mit dem
   * juengsten Kurs (waehrend der Sitzung der Kurs der Sitzung). Ohne Umrechnung das Original.
   */
  function displayHead(price, prev, day, layer) {
    if (!price || !isNum(price.value)) return price;
    var nat = price.currency || "USD", out = {};
    Object.keys(price).forEach(function (k) { out[k] = price[k]; });
    if (!day) {
      var l = displayLevel(price.value, nat, layer);
      if (l.converted) { out.value = l.value; out.currency = l.currency; }
      return out;
    }
    var two = prev ? [[prev[0], prev[1]], [day, price.value]] : [[day, price.value], [day, price.value]];
    var d = displaySeries(two, nat, layer);
    if (!d.converted || d.points.length !== 2) return price;
    out.value = d.points[1][1]; out.currency = d.currency;
    out.changePct = prev && d.points[0][1] > 0 ? (d.points[1][1] / d.points[0][1] - 1) * 100 : null;
    return out;
  }

  /** Den vorhandenen Umschalter (VUFx.Switch) in `host` setzen; `fn` bei jedem Wechsel. Liefert die Abmeldung. */
  function currencyControl(host, fn, layer) {
    var g = typeof globalThis !== "undefined" ? globalThis : null, L = layerOf(layer), S = g && g.VUFx && g.VUFx.Switch;
    if (host && S && L && host.ownerDocument) {
      var sw = S.create({ layer: L });
      if (sw) host.replaceChildren(host.ownerDocument.createTextNode("Anzeigewährung "), sw);
    }
    return L && L.onDisplayCurrencyChange && fn ? L.onDisplayCurrencyChange(fn) : function () {};
  }

  /** Bildunterschrift der Waehrung, fuer alle Welten gleich. */
  function currencyNote(currency, nativeCurrency, intraday) {
    if (!currency || currency === nativeCurrency) return "Börsenwährung " + nativeCurrency;
    return intraday ? "in " + currency + " zum EZB-Referenzkurs der Sitzung" : "in " + currency + " zum EZB-Referenzkurs des jeweiligen Tages";
  }

  return {
    VERSION: VERSION, PRIMARY: PRIMARY, EXTRA: EXTRA, DEFAULT_RANGE: DEFAULT_RANGE, DAYS: DAYS, RANGE_KEY: RANGE_KEY,
    canonical: canonical, order: order, startRange: startRange, rememberedRange: rememberedRange, rememberRange: rememberRange,
    intradayEntry: intradayEntry, covers: covers, slice: slice,
    displayCurrency: displayCurrency, displaySeries: displaySeries, displaySnapshot: displaySnapshot,
    displayLevel: displayLevel, displayHead: displayHead, currencyControl: currencyControl,
    currencyNote: currencyNote, ensureDisplay: ensureDisplay
  };
});
