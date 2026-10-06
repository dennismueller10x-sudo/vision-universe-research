/* =========================================================================
   VISION UNIVERSE DISCOVER — unternehmen.js

   WAS MACHT DIE FIRMA, NICHT NUR DIE AKTIE?

   Ebene 2 beantwortet eine Frage, die Ebene 1 gar nicht stellt: nicht "wie
   läuft der Kurs", sondern "wie läuft das Unternehmen". Dafür braucht es
   Umsatz, Gewinn, Bewertung - und genau dort wird es in diesem Repository
   ehrlich schwierig.

   DIE DATENLAGE, UNGESCHÖNT

   Für die 498 realen Titel liefert der Anbieter Kurse, sonst nichts. Es
   gibt keine Fundamentaldaten, keine Analystenschätzungen und keine
   Bewertungskennzahlen - für 493 von ihnen nicht einmal den Kurs selbst.
   Was es gibt, sind SEC-Einreichungen für fünf Titel (die Golden Five);
   dort stehen Umsatz, Gewinn und Aktienzahl quartalsweise und
   nachvollziehbar. Das Modelluniversum wiederum trägt einen vollständigen
   synthetischen Kennzahlensatz.

   Daraus folgt die einzige Bauweise, die nicht lügt: Dieses Modul rechnet,
   was vorliegt, und sagt sonst, dass nichts vorliegt. Es gibt keinen
   Platzhalter, keine Schätzung, keinen Branchendurchschnitt als Ersatz
   und keine "typischen" Werte. Eine Seite, die für 493 Titel eine
   Wachstumsrate erfindet, wäre in einem Investmentprodukt der teuerste
   Fehler von allen - sie sähe aus wie Research.

   WAS HIER GERECHNET WIRD

   - Zwölfmonatswerte (TTM) aus den vier jüngsten Quartalen
   - Wachstum gegen die vier Quartale davor
   - Marge aus Gewinn und Umsatz
   - Kurs-Gewinn-Verhältnis, WO der Kurs ausgeliefert werden darf

   Die Definitionen folgen quant/engines/factors.js: dieselbe Kennzahl
   darf nicht zweimal verschieden heissen.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var ENGINE_VERSION = "discover-unternehmen-1.0.0";

  /* Warum eine Kennzahl fehlt, ist eine Auskunft - kein leeres Feld. */
  var STATUS = {
    CALCULATED: "CALCULATED",
    SOURCE_MISSING: "SOURCE_MISSING",
    WITHHELD_REDISTRIBUTION: "WITHHELD_REDISTRIBUTION",
    INSUFFICIENT_HISTORY: "INSUFFICIENT_HISTORY"
  };

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function round(v, n) {
    if (!isNum(v)) return null;
    var f = Math.pow(10, n === undefined ? 4 : n);
    return Math.round(v * f) / f;
  }

  /**
   * Zwölf Monate aus Quartalen.
   *
   * Summiert wird über die vier jüngsten abgeschlossenen Quartale, und
   * zwar über `periodEnd` sortiert - nicht über das Einreichungsdatum. Ein
   * nachgereichtes Quartal darf die Reihenfolge nicht verschieben.
   *
   * @param {Array} fakten  SEC-Fakten eines Titels (metricId, periodEnd, value)
   * @param {string} metrik
   * @param {number} [versatz] 0 = jüngste vier, 4 = die vier davor
   */
  function zwoelfMonate(fakten, metrik, versatz) {
    versatz = versatz || 0;
    var reihe = fakten
      .filter(function (f) { return f.metricId === metrik && isNum(f.value); })
      .sort(function (a, b) { return a.periodEnd < b.periodEnd ? 1 : -1; });

    /* Ein Quartal kann mehrfach vorkommen (Original und Restatement). Die
       jüngste Fassung je periodEnd gewinnt - das ist dieselbe Regel wie
       in der Faktorenengine. */
    var proPeriode = [];
    var gesehen = Object.create(null);
    for (var i = 0; i < reihe.length; i++) {
      if (gesehen[reihe[i].periodEnd]) continue;
      gesehen[reihe[i].periodEnd] = true;
      proPeriode.push(reihe[i]);
    }

    var fenster = proPeriode.slice(versatz, versatz + 4);
    if (fenster.length < 4) return null;
    var summe = 0;
    for (var j = 0; j < fenster.length; j++) summe += fenster[j].value;
    return { wert: summe, von: fenster[3].periodEnd, bis: fenster[0].periodEnd };
  }

  /** Der jüngste Einzelwert einer Kennzahl (z. B. Aktienzahl). */
  function letzterWert(fakten, metrik) {
    var reihe = fakten
      .filter(function (f) { return f.metricId === metrik && isNum(f.value); })
      .sort(function (a, b) { return a.periodEnd < b.periodEnd ? 1 : -1; });
    return reihe.length ? reihe[0].value : null;
  }

  function wachstum(jetzt, vorher) {
    if (!isNum(jetzt) || !isNum(vorher) || vorher === 0) return null;
    /* Von einem Verlust auf einen Gewinn ist kein Prozentwert, sondern
       eine Wende - eine Wachstumsrate waere hier eine Zahl ohne Sinn. */
    if (vorher < 0) return null;
    return jetzt / vorher - 1;
  }

  /**
   * Aus SEC-Fakten wird ein Unternehmensbild.
   *
   * @param {Array} fakten   canonical facts eines Titels
   * @param {object} [opt]   { preis, preisStatus, waehrung }
   */
  function ausSecFakten(fakten, opt) {
    opt = opt || {};
    if (!fakten || !fakten.length) {
      return leer(STATUS.SOURCE_MISSING, "Für diesen Titel liegen keine Geschäftszahlen vor.");
    }

    var umsatz = zwoelfMonate(fakten, "revenue", 0);
    var umsatzVor = zwoelfMonate(fakten, "revenue", 4);
    var gewinn = zwoelfMonate(fakten, "netIncome", 0);
    var gewinnVor = zwoelfMonate(fakten, "netIncome", 4);
    var aktien = letzterWert(fakten, "sharesOutstanding");

    if (!umsatz || !gewinn) {
      return leer(STATUS.INSUFFICIENT_HISTORY,
        "Es liegen weniger als vier abgeschlossene Quartale vor.");
    }

    /* Kurs-Gewinn-Verhaeltnis nur dort, wo der Kurs auch gezeigt werden
       darf. Sonst waere die Kennzahl eine Ruecktuer zum Kursniveau: aus
       KGV und Gewinn je Aktie liesse sich der Kurs zurueckrechnen. */
    var gewinnJeAktie = (isNum(aktien) && aktien > 0) ? gewinn.wert / aktien : null;
    var kgv = null, kgvStatus = STATUS.SOURCE_MISSING;
    if (!isNum(opt.preis)) {
      kgvStatus = opt.preisStatus === STATUS.WITHHELD_REDISTRIBUTION
        ? STATUS.WITHHELD_REDISTRIBUTION : STATUS.SOURCE_MISSING;
    } else if (!isNum(gewinnJeAktie) || gewinnJeAktie <= 0) {
      kgvStatus = STATUS.SOURCE_MISSING;
    } else {
      kgv = opt.preis / gewinnJeAktie;
      kgvStatus = STATUS.CALCULATED;
    }

    return {
      engineVersion: ENGINE_VERSION,
      quelle: "SEC_CANONICAL",
      status: STATUS.CALCULATED,
      zeitraum: { von: umsatz.von, bis: umsatz.bis },
      umsatzTTM: round(umsatz.wert, 2),
      gewinnTTM: round(gewinn.wert, 2),
      einheit: "usd_m",
      umsatzWachstum: round(wachstum(umsatz.wert, umsatzVor && umsatzVor.wert), 4),
      gewinnWachstum: round(wachstum(gewinn.wert, gewinnVor && gewinnVor.wert), 4),
      marge: round(umsatz.wert > 0 ? gewinn.wert / umsatz.wert : null, 4),
      gewinnJeAktie: round(gewinnJeAktie, 4),
      kgv: round(kgv, 2),
      kgvStatus: kgvStatus,
      dividendenRendite: null,
      dividendenRenditeStatus: STATUS.SOURCE_MISSING,
      message: null
    };
  }

  /**
   * Dasselbe Bild aus dem Kennzahlensatz des Modelluniversums.
   *
   * Die Zeile in quant/data/securities.json traegt die Werte bereits
   * gerechnet (quant/engines/factors.js). Hier wird nichts neu gerechnet -
   * nur uebersetzt, damit Oberflaeche und Pruefung fuer beide Universen
   * dieselbe Form sehen.
   */
  function ausModellzeile(zeile) {
    if (!zeile) return leer(STATUS.SOURCE_MISSING, "Keine Modellzeile vorhanden.");
    var pct = function (v) { return isNum(v) ? round(v / 100, 4) : null; };
    return {
      engineVersion: ENGINE_VERSION,
      quelle: "VU_MODEL",
      status: STATUS.CALCULATED,
      zeitraum: { von: null, bis: zeile.asOf || null },
      umsatzTTM: isNum(zeile.revenue) ? round(zeile.revenue, 2) : null,
      gewinnTTM: isNum(zeile.netIncome) ? round(zeile.netIncome, 2) : null,
      einheit: "usd_m",
      umsatzWachstum: pct(zeile.revenueGrowth),
      gewinnWachstum: pct(zeile.epsGrowth),
      marge: pct(zeile.operatingMargin),
      gewinnJeAktie: null,
      /* Gewinnrendite und KGV sind Kehrwerte voneinander. */
      kgv: isNum(zeile.earningsYield) && zeile.earningsYield > 0
        ? round(100 / zeile.earningsYield, 2) : null,
      kgvStatus: isNum(zeile.earningsYield) && zeile.earningsYield > 0
        ? STATUS.CALCULATED : STATUS.SOURCE_MISSING,
      dividendenRendite: pct(zeile.dividendYield),
      dividendenRenditeStatus: isNum(zeile.dividendYield)
        ? STATUS.CALCULATED : STATUS.SOURCE_MISSING,
      message: null
    };
  }

  /**
   * Dasselbe Bild aus dem kompakten Consumer-Bundle der SEC-Pipeline
   * (discover/engines/fundamentals.js, fromBundle). Zwoelfmonatswerte
   * kommen aus der TTM-Schicht des Bundles (vier juengste Standalone-
   * Quartale, benannt "durch FYxxxxQn"); das Wachstum vergleicht mit den
   * vier Quartalen davor, wenn acht vorliegen - sonst Geschaeftsjahr gegen
   * Vorjahr, und die Basis steht dran. Annual und TTM werden nie gemischt.
   *
   * @param {object} model  Fundamentals.fromBundle(bundle)
   * @param {object} [opt]  { preis, preisStatus }
   */
  function ausConsumerBundle(model, opt) {
    opt = opt || {};
    if (!model || !model.years || !model.years.length) {
      return leer(STATUS.SOURCE_MISSING, "Für diesen Titel liegen keine Geschäftszahlen vor.");
    }
    var M = 1e6;
    var ttm = model.ttm || {};
    var q = model.quarterly || {};
    var a = model.annual || {};
    function jahr(metrik, fy) {
      var reihe = a[metrik] || [];
      for (var i = 0; i < reihe.length; i++) if (reihe[i].fy === fy) return reihe[i];
      return null;
    }
    function summe(reihe, von, bis) { /* Indizes [von, bis) in einer aufsteigenden Quartalsreihe */
      var s = 0; for (var i = von; i < bis; i++) s += reihe[i].v; return s;
    }
    var latestFy = model.years[model.years.length - 1];
    var basis, zeitraum, umsatz, gewinn, umsatzVor, gewinnVor;
    if (ttm.revenue && ttm.net_income && isNum(ttm.revenue.v) && isNum(ttm.net_income.v)) {
      basis = "TTM";
      umsatz = ttm.revenue.v; gewinn = ttm.net_income.v;
      zeitraum = { von: null, bis: ttm.revenue.end, durch: ttm.revenue.through || null };
      var qr = q.revenue || [], qn = q.net_income || [];
      if (qr.length >= 8 && qn.length >= 8) {
        umsatzVor = summe(qr, qr.length - 8, qr.length - 4);
        gewinnVor = summe(qn, qn.length - 8, qn.length - 4);
        zeitraum.von = qr[qr.length - 5].end;   /* Ende des Quartals vor dem TTM-Fenster */
      } else {
        /* Ohne acht Quartale gibt es kein TTM-Wachstum. Ein Vergleich TTM
           gegen ein Geschaeftsjahr waere eine Vermischung - also keiner. */
        umsatzVor = null; gewinnVor = null;
      }
    } else {
      var r = jahr("revenue", latestFy), n = jahr("net_income", latestFy);
      if (!r || !n) return leer(STATUS.INSUFFICIENT_HISTORY, "Es liegen keine vollständigen Jahreszahlen vor.");
      basis = "FY";
      umsatz = r.v; gewinn = n.v;
      zeitraum = { von: null, bis: r.end, fy: latestFy };
      var rv = jahr("revenue", latestFy - 1), nv = jahr("net_income", latestFy - 1);
      umsatzVor = rv ? rv.v : null; gewinnVor = nv ? nv.v : null;
    }
    var aktienReihe = a.shares_outstanding && a.shares_outstanding.length ? a.shares_outstanding
                    : (a.diluted_weighted_average_shares || []);
    var aktien = aktienReihe.length ? aktienReihe[aktienReihe.length - 1].v : null;
    var gewinnJeAktie = (ttm.eps_diluted && isNum(ttm.eps_diluted.v)) ? ttm.eps_diluted.v
                      : (basis === "FY" && jahr("eps_diluted", latestFy)) ? jahr("eps_diluted", latestFy).v
                      : (isNum(aktien) && aktien > 0 ? gewinn / aktien : null);
    var kgv = null, kgvStatus = STATUS.SOURCE_MISSING;
    if (!isNum(opt.preis)) {
      kgvStatus = opt.preisStatus === STATUS.WITHHELD_REDISTRIBUTION ? STATUS.WITHHELD_REDISTRIBUTION : STATUS.SOURCE_MISSING;
    } else if (!isNum(gewinnJeAktie) || gewinnJeAktie <= 0) {
      kgvStatus = STATUS.SOURCE_MISSING;
    } else { kgv = opt.preis / gewinnJeAktie; kgvStatus = STATUS.CALCULATED; }
    /* Dividendenrendite: gezahlte Dividende (FY) zu Marktwert (Kurs x Aktien). */
    var divRow = jahr("dividends_paid", latestFy);
    var divRendite = null, divStatus = STATUS.SOURCE_MISSING;
    if (divRow && isNum(opt.preis) && isNum(aktien) && aktien > 0 && opt.preis > 0) {
      divRendite = Math.abs(divRow.v) / (opt.preis * aktien); divStatus = STATUS.CALCULATED;
    }
    return {
      engineVersion: ENGINE_VERSION,
      quelle: "SEC_CONSUMER",
      status: STATUS.CALCULATED,
      basis: basis,
      zeitraum: zeitraum,
      umsatzTTM: round(umsatz / M, 2),
      gewinnTTM: round(gewinn / M, 2),
      einheit: "usd_m",
      umsatzWachstum: round(wachstum(umsatz, umsatzVor), 4),
      gewinnWachstum: round(wachstum(gewinn, gewinnVor), 4),
      marge: round(umsatz > 0 ? gewinn / umsatz : null, 4),
      gewinnJeAktie: round(gewinnJeAktie, 4),
      kgv: round(kgv, 2),
      kgvStatus: kgvStatus,
      dividendenRendite: round(divRendite, 4),
      dividendenRenditeStatus: divStatus,
      asOf: model.asOf || null,
      message: null
    };
  }

  function leer(status, message) {
    return {
      engineVersion: ENGINE_VERSION, quelle: null, status: status,
      zeitraum: null, umsatzTTM: null, gewinnTTM: null, einheit: null,
      umsatzWachstum: null, gewinnWachstum: null, marge: null,
      gewinnJeAktie: null, kgv: null, kgvStatus: status,
      dividendenRendite: null, dividendenRenditeStatus: status,
      message: message
    };
  }

  var api = {
    ENGINE_VERSION: ENGINE_VERSION, STATUS: STATUS,
    ausSecFakten: ausSecFakten, ausConsumerBundle: ausConsumerBundle, ausModellzeile: ausModellzeile, leer: leer,
    zwoelfMonate: zwoelfMonate, wachstum: wachstum
  };

  if (isNode) module.exports = api;
  else {
    global.VUDiscover = global.VUDiscover || {};
    global.VUDiscover.Unternehmen = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
