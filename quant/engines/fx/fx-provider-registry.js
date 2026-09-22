/* =========================================================================
   VISION UNIVERSE — fx/fx-provider-registry.js   (Currency Layer, O-7, O-11)

   WER LIEFERT DEN KURS, IN WELCHER ROLLE - UND WAS DARF MAN DAMIT?

   Zwei Fragen, die zusammengehoeren und getrennt beantwortet werden
   muessen:

     RANGFOLGE   Welche Quelle wird zuerst gefragt? (O-7)
     LIZENZ      Was darf mit ihrem Ergebnis geschehen? (O-11)

   Sie fallen auseinander, und das ist der ganze Grund fuer diese Datei.
   Tiingo ist PRIMARY - die bessere Aktualitaet, der bestehende Vertrag,
   die gemessene Faehigkeit. Und zugleich ist seine FX-Lizenzlage offen,
   waehrend die der EZB geklaert ist. Ein aus Tiingo abgeleiteter
   EUR-Wert darf heute intern berechnet, aber nicht oeffentlich gezeigt
   werden; ein aus EZB-Kursen abgeleiteter darf beides.

   DIE FOLGE IST UNGEWOHNT UND RICHTIG

   Die Erlaubnis haengt am EINZELNEN WERT, nicht am Produkt und nicht am
   Feature. Derselbe Aktienkurs ergibt einen zeigbaren EUR-Wert fuer
   2018 (EZB) und einen gesperrten fuer heute (Tiingo), solange die
   Vertragsfrage offen ist.

   Wer das fuer eine Verkomplizierung haelt, hat die Alternative nicht zu
   Ende gedacht: die Alternative ist eine globale Sperre, die entweder
   die ganze EUR-Anzeige abschaltet oder die Lizenzfrage ignoriert.

   KEINE ZWEITE SOURCE OF TRUTH

   Die Rangfolge ist deterministisch und datumsabhaengig, nicht
   qualitaetsabhaengig: PRIMARY zuerst, FALLBACK nur dort, wo PRIMARY
   nichts hat. Es wird nie zwischen zwei vorhandenen Werten "gewaehlt" -
   eine Reihe, in der je Tag entschieden wird, ist nicht reproduzierbar,
   und §8 verlangt Reproduzierbarkeit.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var VERSION = "fx-provider-registry-1.0.0";

  /* Der Standard, wenn zu einer Quelle nichts eingetragen ist. Er
     spiegelt display-policy.js: intern ja, oeffentlich nein. Eine
     unbekannte Quelle bekommt keine Erlaubnis, weil niemand
     widersprochen hat. */
  var DEFAULT_PERMISSION = {
    providerId: null,
    role: "UNKNOWN",
    priority: 99,
    internalUseAllowed: true,
    storageAllowed: false,
    publicDerivedDisplayAllowed: false,
    publicRawDisplayAllowed: false,
    attributionRequired: false,
    attributionText: null,
    basis: "Kein Eintrag in quant/config/fx-license.json. Strengster Standard.",
    checkedAt: null
  };

  /* Die Identitaet ist keine Quelle. Eine EUR-Zahl in EUR hat keinen
     Wechselkurs, also auch keine Lizenzfrage - sie darf gezeigt werden,
     weil nichts umgerechnet wurde. Ohne diesen Eintrag wuerde der Fast
     Path an der Lizenzpruefung haengenbleiben. */
  var IDENTITY_PERMISSION = {
    providerId: "identity",
    role: "IDENTITY",
    priority: 0,
    internalUseAllowed: true,
    storageAllowed: true,
    publicDerivedDisplayAllowed: true,
    publicRawDisplayAllowed: true,
    attributionRequired: false,
    attributionText: null,
    basis: "Quell- und Zielwaehrung sind gleich; es wird kein Wechselkurs verwendet.",
    checkedAt: null
  };

  var providers = Object.create(null);

  /**
   * Traegt die Anbieterlage aus quant/config/fx-license.json ein.
   *
   * Die Datei ist die Quelle; diese Datei ist nur ihr Leser. So steht die
   * Lizenzaussage an EINER Stelle und nicht einmal im Code und einmal in
   * einer Konfiguration, die auseinanderlaufen koennen.
   */
  function configure(config) {
    reset();
    var entries = (config && config.providers) || {};
    Object.keys(entries).forEach(function (id) {
      var e = entries[id] || {};
      providers[id] = {
        providerId: id,
        role: e.role || "UNKNOWN",
        priority: typeof e.priority === "number" ? e.priority : DEFAULT_PERMISSION.priority,
        internalUseAllowed: e.internalUseAllowed !== false,
        storageAllowed: e.storageAllowed === true,
        storageScope: e.storageScope || null,
        publicDerivedDisplayAllowed: e.publicDerivedDisplayAllowed === true,
        publicRawDisplayAllowed: e.publicRawDisplayAllowed === true,
        attributionRequired: e.attributionRequired === true,
        attributionText: e.attributionText || null,
        basis: e.basis || DEFAULT_PERMISSION.basis,
        checkedAt: e.checkedAt || null
      };
    });
    openQuestion = (config && config.openQuestion) || null;
    return list();
  }

  var openQuestion = null;

  function reset() { providers = Object.create(null); openQuestion = null; autoConfigured = false; }

  function get(providerId) {
    ensureConfigured();
    if (providerId === "identity") return IDENTITY_PERMISSION;
    var hit = providers[providerId];
    if (hit) return hit;

    /* Ein Kreuzkurs aus zwei Quellen traegt beide Namen, verbunden mit
       einem Pluszeichen (fx-rates.js). Seine Erlaubnis ist die des
       STRENGEREN Beins - ein Kreuz aus einem freigegebenen und einem
       gesperrten Kurs ist gesperrt, weil der gesperrte Kurs rechnerisch
       darin steckt. Ohne diese Zeile fiele es auf DEFAULT_PERMISSION
       zurueck, was zufaellig ebenfalls streng ist - aber aus dem
       falschen Grund, und ohne die Quellennennung mitzufuehren. */
    if (typeof providerId === "string" && providerId.indexOf("+") > 0) {
      var parts = providerId.split("+").map(function (x) { return get(x); });
      var attributions = parts.map(function (p) { return p.attributionText; }).filter(Boolean);
      return {
        providerId: providerId,
        role: "MIXED",
        priority: Math.max.apply(null, parts.map(function (p) { return p.priority; })),
        internalUseAllowed: parts.every(function (p) { return p.internalUseAllowed; }),
        storageAllowed: parts.every(function (p) { return p.storageAllowed; }),
        publicDerivedDisplayAllowed: parts.every(function (p) { return p.publicDerivedDisplayAllowed; }),
        publicRawDisplayAllowed: parts.every(function (p) { return p.publicRawDisplayAllowed; }),
        attributionRequired: parts.some(function (p) { return p.attributionRequired; }),
        attributionText: attributions.length ? attributions.join(" ") : null,
        basis: "Kreuzkurs aus " + parts.map(function (p) { return p.providerId; }).join(" und ") +
               "; es gilt jeweils die strengere Bedingung.",
        checkedAt: null
      };
    }
    var out = Object.assign({}, DEFAULT_PERMISSION);
    out.providerId = providerId || null;
    return out;
  }

  /** Die Lizenzantwort fuer einen einzelnen Wert. */
  function displayPermission(providerId) { return get(providerId); }

  /**
   * Die Rangfolge, die fx-rates.js beim Ingest mitbekommt.
   *
   * Aufsteigend nach priority; bei Gleichstand nach Name, damit die
   * Reihenfolge nicht von der Ingest-Reihenfolge abhaengt.
   */
  function order() {
    ensureConfigured();
    return Object.keys(providers)
      .map(function (id) { return providers[id]; })
      .sort(function (a, b) {
        return a.priority - b.priority || String(a.providerId).localeCompare(String(b.providerId));
      });
  }

  function primary() { return order().find(function (p) { return p.role === "PRIMARY"; }) || null; }
  function fallbacks() { return order().filter(function (p) { return p.role === "FALLBACK"; }); }
  function list() { return order(); }

  /**
   * Die Meta-Angaben, die ein Ingest-Skript an fx-rates.ingest() reicht.
   * So steht die Rolle einmal in der Konfiguration und nirgends sonst.
   */
  function ingestMeta(providerId, extra) {
    var p = get(providerId);
    var out = { source: providerId, role: p.role, priority: p.priority };
    if (extra) Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
    return out;
  }

  /**
   * Die offene Vertragsfrage, falls eine eingetragen ist.
   *
   * Sie steht absichtlich im Code-Pfad und nicht nur in einem Dokument:
   * ein Produkt, das publicDisplayAllowed=false bekommt, soll den Grund
   * mitliefern koennen, statt nur zu schweigen.
   */
  function escalation() { ensureConfigured(); return openQuestion; }

  /**
   * Die Zusammenfassung fuer Berichte und Gates: wieviele Werte duerfen
   * mit der aktuellen Lage oeffentlich gezeigt werden?
   */
  function publicDisplaySummary() {
    var all = list();
    return {
      version: VERSION,
      providers: all.map(function (p) {
        return { providerId: p.providerId, role: p.role, priority: p.priority,
                 publicDerivedDisplayAllowed: p.publicDerivedDisplayAllowed,
                 attributionRequired: p.attributionRequired, basis: p.basis };
      }),
      anyBlocked: all.some(function (p) { return p.publicDerivedDisplayAllowed !== true; }),
      blockedProviders: all.filter(function (p) { return p.publicDerivedDisplayAllowed !== true; })
                           .map(function (p) { return p.providerId; }),
      openQuestion: openQuestion
    };
  }

  /* In Node laedt die Registry ihre Konfiguration selbst, sobald sie
     zum ersten Mal befragt wird.

     Ohne das haette ein Aufrufer, der configure() vergisst, fuer JEDEN
     Wert publicDisplayAllowed=false bekommen - streng genug, um nicht
     gefaehrlich zu sein, und falsch genug, um die EZB-Freigabe
     unsichtbar zu machen. Ein Vergessen, das die halbe Entscheidung
     still umkehrt, ist schlimmer als ein lauter Fehler.

     Im Browser gibt es kein Dateisystem; dort ruft die Seite
     configure() mit der geladenen Konfiguration auf. */
  var autoConfigured = false;
  function ensureConfigured() {
    if (autoConfigured || Object.keys(providers).length) return;
    autoConfigured = true;
    if (!isNode) return;
    try {
      var path = require("path");
      var fs = require("fs");
      var file = path.join(__dirname, "..", "..", "config", "fx-license.json");
      if (fs.existsSync(file)) configure(JSON.parse(fs.readFileSync(file, "utf8")));
    } catch (err) {
      /* Eine fehlende Konfiguration ist kein Grund abzustuerzen - sie
         bedeutet den strengsten Standard, und der ist sicher. */
    }
  }

  var api = {
    VERSION: VERSION,
    DEFAULT_PERMISSION: DEFAULT_PERMISSION,
    IDENTITY_PERMISSION: IDENTITY_PERMISSION,
    configure: configure, reset: reset, get: get,
    displayPermission: displayPermission,
    order: order, primary: primary, fallbacks: fallbacks, list: list,
    ingestMeta: ingestMeta, escalation: escalation,
    publicDisplaySummary: publicDisplaySummary
  };

  if (isNode) module.exports = api;
  else { global.VUFx = global.VUFx || {}; global.VUFx.Providers = api; }
})(typeof window !== "undefined" ? window : globalThis);
