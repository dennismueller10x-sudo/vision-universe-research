/* =========================================================================
   VISION UNIVERSE — fx/bootstrap.js   (Currency Layer, Aktivierung)

   DER EINE ORT, AN DEM EINE SEITE DEN CURRENCY CONTRACT BEKOMMT.

   Bis hierher war der Layer vollstaendig und unbenutzt: die Module lagen
   auf den Seiten, aber niemand hat eine Engine gebaut, weil im Browser
   keine Kurse lagen. Diese Datei schliesst genau diese Luecke - und sie
   ist bewusst die EINZIGE Stelle, die es tut. Ein zweiter Bootstrap in
   einem zweiten Produkt waere ein zweiter Wahrheitsstand.

   WELCHE KURSE IM BROWSER LIEGEN DUERFEN - UND WELCHE NICHT

   Nur die der EZB. Sie veroeffentlicht ihre Referenzkurse als
   oeffentliche Statistik und gestattet die Wiedergabe unter Nennung der
   Quelle; die Nennung erfolgt (`attribution`). Anbieterreihen bleiben
   im Arbeitsverzeichnis - ihre Weitergabe waere Klasse E aus O-11, und
   die braucht das Produkt nicht.

   Das passt genau auf die Rollenverteilung aus O-14: historische
   Tagesabfragen fuehrt ohnehin die EZB. Was dem Browser damit fehlt,
   ist der AKTUELLE Kurs - und den liefert der Kern als fertigen
   EUR-Wert am Tick mit, nicht als Kurs.

   GELADEN WIRD, WAS GEBRAUCHT WIRD

   Das Universum fuehrt gut zwanzig Berichtswaehrungen. Alle zu laden
   hiesse, jeder Seite drei Megabyte Kurse aufzuladen, von denen sie
   eine Reihe benutzt. Der Bootstrap laedt deshalb zuerst nur EUR/USD -
   die Waehrung von 10.790 der 11.202 Titel - und jede weitere erst,
   wenn eine Flaeche sie anfragt.

   WAS PASSIERT, BEVOR DIE KURSE DA SIND

   Nichts Falsches. Der Vertrag steht sofort, sein Store ist nur leer;
   eine Umrechnung meldet dann `conversionUnavailable` und die Flaeche
   zeigt die Originalwaehrung. Eine halbe Sekunde ehrliche
   Originalwaehrung ist besser als ein geratener Euro-Betrag.
   ========================================================================= */
(function (global) {
  "use strict";

  var VUFx = global.VUFx = global.VUFx || {};
  var VERSION = "fx-bootstrap-1.0.0";

  var DEFAULT_BASE = "/quant/data/market/fx/ecb/";
  /* Die Waehrung, die fast jede Seite braucht. Sie wird sofort geholt,
     damit der Umschalter nicht erst nach dem ersten Klick etwas tut. */
  var EAGER = ["USD"];

  var state = {
    booted: false,
    basePath: DEFAULT_BASE,
    store: null,
    engine: null,
    layer: null,
    index: null,
    indexPromise: null,
    loading: Object.create(null),   /* code -> Promise */
    loaded: Object.create(null),    /* code -> true|false */
    attributions: Object.create(null)
  };

  function log(msg, err) {
    /* Eine fehlende Kursreihe ist kein Grund, die Seite zu stoeren. Sie
       ist ein Grund, in der Originalwaehrung zu bleiben - und das sagt
       der Vertrag den Flaechen ohnehin. */
    if (global.console && console.debug) console.debug("[vu-fx] " + msg, err || "");
  }

  function json(url) {
    return fetch(url, { credentials: "same-origin" }).then(function (res) {
      if (!res.ok) throw new Error(url + " -> HTTP " + res.status);
      return res.json();
    });
  }

  function loadIndex() {
    if (state.indexPromise) return state.indexPromise;
    state.indexPromise = json(state.basePath + "index.json")
      .then(function (ix) { state.index = ix; return ix; })
      .catch(function (err) {
        log("kein Kursverzeichnis", err);
        state.index = { pairs: [] };
        return state.index;
      });
    return state.indexPromise;
  }

  /**
   * Stellt sicher, dass Kurse fuer eine Waehrung im Store liegen.
   *
   * Die Antwort ist absichtlich ein Wahrheitswert und keine Ausnahme:
   * "fuer diese Waehrung gibt es keine Kurse" ist ein normaler Zustand
   * des Produkts (fuenf Titel im Universum), kein Fehler.
   */
  function ensureCurrency(code) {
    var c = (code || "").toUpperCase();
    if (!c || c === "EUR") return Promise.resolve(true);
    if (state.loaded[c] !== undefined) return Promise.resolve(state.loaded[c]);
    if (state.loading[c]) return state.loading[c];

    state.loading[c] = loadIndex().then(function (ix) {
      var entry = (ix.pairs || []).find(function (p) {
        return p.base === "EUR" && p.quote === c;
      });
      if (!entry) { state.loaded[c] = false; return false; }
      return json(state.basePath + entry.file).then(function (d) {
        if (!d || !Array.isArray(d.points) || !d.points.length) {
          state.loaded[c] = false;
          return false;
        }
        state.store.ingest(d.base, d.quote, d.points,
          VUFx.Providers.ingestMeta(d.source || "ecb", { frequency: d.frequency || "DAILY" }));
        if (d.attribution) state.attributions[d.attribution] = true;
        state.loaded[c] = true;
        return true;
      });
    }).catch(function (err) {
      log("Kurse fuer " + c + " nicht ladbar", err);
      state.loaded[c] = false;
      return false;
    });
    return state.loading[c];
  }

  /**
   * Traegt den aktuellen Kurs als Zustand ein (O-9).
   *
   * Den liefert nicht diese Datei, sondern wer ihn hat - etwa ein
   * Intraday-Snapshot. Der Bootstrap nimmt ihn entgegen, damit es auch
   * dafuer nur einen Weg gibt.
   */
  function setCurrentRate(base, quote, rateState) {
    if (!state.store) return { accepted: false, reason: "notBooted" };
    return state.store.ingestCurrent(base, quote, rateState);
  }

  function emit(name, detail) {
    if (!global.document || typeof global.CustomEvent !== "function") return;
    try {
      global.document.dispatchEvent(new CustomEvent(name, { detail: detail }));
    } catch (err) { log("Ereignis " + name + " nicht zustellbar", err); }
  }

  /**
   * Baut den Vertrag. Mehrfach aufgerufen gibt er denselben zurueck -
   * ein zweiter Layer waere ein zweiter Anzeigezustand, und der
   * Umschalter wuerde nur die Haelfte der Seite bewegen.
   */
  function boot(options) {
    options = options || {};
    if (state.booted) return Promise.resolve(state.layer);

    if (!VUFx.Rates || !VUFx.Contract || !VUFx.Providers) {
      log("Currency Core nicht vollstaendig geladen - die Seite bleibt in der Originalwaehrung");
      return Promise.resolve(null);
    }
    state.booted = true;
    if (options.basePath) state.basePath = options.basePath;

    /* Die Lizenzlage kommt aus der Konfiguration, nicht aus dem Code.
       Im Browser gibt es kein Dateisystem, also wird sie geholt - aus
       derselben Datei, die auch der Kern liest. Zwei Fassungen
       derselben Aussage laufen frueher oder spaeter auseinander.

       Gelingt das nicht, bleibt der strengste Standard stehen: gerechnet
       wird weiter, die Werte tragen dann aber publicDisplayAllowed
       false. Das ist die sichere Richtung. */
    var lizenz = options.license
      ? Promise.resolve(options.license)
      : json(options.licensePath || "/quant/config/fx-license.json").catch(function (err) {
          log("Lizenzkonfiguration nicht ladbar", err);
          return null;
        });

    state.store = VUFx.Rates.createStore();
    state.layer = VUFx.Contract.createLayer({
      store: state.store,
      storage: options.storage !== undefined ? options.storage : global.localStorage,
      defaultCurrency: options.defaultCurrency || null
    });
    VUFx.layer = state.layer;
    VUFx.store = state.store;

    /* Ein Wechsel der Anzeigewaehrung ist ein Ereignis der SEITE, nicht
       eines Moduls. Wer zuhoert, zeichnet neu - und niemand muss dafuer
       den Vertrag kennen. */
    state.layer.onDisplayCurrencyChange(function (change) {
      emit("vu-currency-change", change);
    });

    var vorgeladen = lizenz.then(function (cfg) {
      if (cfg) {
        try { VUFx.Providers.configure(cfg); }
        catch (err) { log("Lizenzkonfiguration nicht lesbar", err); }
      }
      return Promise.all((options.eager || EAGER).map(ensureCurrency));
    });
    return vorgeladen.then(function (ok) {
      emit("vu-fx-ready", {
        layer: state.layer,
        displayCurrency: state.layer.preference.get(),
        loaded: ok.filter(Boolean).length
      });
      return state.layer;
    });
  }

  /** Die Quellennennungen der tatsaechlich geladenen Reihen. */
  function attributions() { return Object.keys(state.attributions).sort(); }

  /** Ist fuer diese Waehrung ueberhaupt etwas geladen? */
  function hasCurrency(code) {
    var c = (code || "").toUpperCase();
    return c === "EUR" ? true : state.loaded[c] === true;
  }

  VUFx.Bootstrap = {
    VERSION: VERSION,
    boot: boot,
    ensureCurrency: ensureCurrency,
    hasCurrency: hasCurrency,
    setCurrentRate: setCurrentRate,
    attributions: attributions,
    basePath: function () { return state.basePath; }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = VUFx.Bootstrap;
})(typeof window !== "undefined" ? window : globalThis);
