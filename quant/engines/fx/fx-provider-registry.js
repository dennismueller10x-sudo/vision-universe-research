/* =========================================================================
   VISION UNIVERSE — fx/fx-provider-registry.js   (Currency Layer, O-7, O-11)

   WER LIEFERT DEN KURS, IN WELCHER ROLLE - UND WAS DARF MAN DAMIT?

   Zwei Fragen, die zusammengehoeren und getrennt beantwortet werden
   muessen:

     RANGFOLGE   Welche Quelle wird zuerst gefragt? (O-7)
     LIZENZ      Was darf mit ihrem Ergebnis geschehen? (O-11)

   Sie fallen auseinander, und das ist der ganze Grund fuer diese Datei.
   Tiingo fuehrt die Gegenwart - die gemessene Intraday- und
   Realtime-Faehigkeit hat die EZB objektiv nicht. Und zugleich ist
   Tiingos FX-Lizenzlage offen, waehrend die der EZB geklaert ist. Ein
   aus Tiingo abgeleiteter EUR-Wert darf heute intern berechnet, aber
   nicht oeffentlich gezeigt werden; ein aus EZB-Kursen abgeleiteter darf
   beides.

   DIE ROLLE HAENGT AN DER ART DER FRAGE (O-14)

   Es gibt nicht EINE Rangfolge, sondern zwei:

     HISTORICAL_DAILY   EZB zuerst. Sie veroeffentlicht seit 1999
                        ununterbrochen; damit kommt ein 10J-Chart aus
                        einer Quelle und traegt keinen Quellenwechsel
                        mitten in der Reihe.
     CURRENT            Tiingo zuerst. Ein Tagesfixing ist kein
                        aktueller Kurs.

   Der Grund ist gemessen und steht in provider-seam-audit.json: die
   beiden Quellen beschreiben denselben Kalendertag zu verschiedenen
   Tageszeiten. Beide Zahlen sind richtig; ein Wechsel MITTEN in einer
   Reihe legt diesen Unterschied aber als Sprung in die Reihe, wo keiner
   hingehoert. Der einzige Uebergang liegt deshalb an der Gegenwart.

   DIE FOLGE IST UNGEWOHNT UND RICHTIG

   Die Erlaubnis haengt am EINZELNEN WERT, nicht am Produkt und nicht am
   Feature. Derselbe Aktienkurs ergibt einen zeigbaren EUR-Wert fuer
   2018 (EZB) und einen gesperrten fuer heute (Tiingo), solange die
   Vertragsfrage offen ist.

   Wer das fuer eine Verkomplizierung haelt, hat die Alternative nicht zu
   Ende gedacht: die Alternative ist eine globale Sperre, die entweder
   die ganze EUR-Anzeige abschaltet oder die Lizenzfrage ignoriert.

   KEINE ZWEITE SOURCE OF TRUTH

   Die Rangfolge ist deterministisch: innerhalb einer Klasse PRIMARY
   zuerst, FALLBACK nur dort, wo PRIMARY nichts hat. Es wird nie zwischen
   zwei vorhandenen Werten "gewaehlt" - eine Reihe, in der je Tag
   entschieden wird, ist nicht reproduzierbar, und §8 verlangt
   Reproduzierbarkeit. Die Klasse ergibt sich aus der Frage und nicht aus
   der Datenlage, also ebenfalls reproduzierbar.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var VERSION = "fx-provider-registry-1.0.0";

  /* Der Standard, wenn zu einer Quelle nichts eingetragen ist. Er
     spiegelt display-policy.js: intern ja, oeffentlich nein. Eine
     unbekannte Quelle bekommt keine Erlaubnis, weil niemand
     widersprochen hat. */
  var CLASSES = ["HISTORICAL_DAILY", "CURRENT"];

  function flatRoles(role, priority) {
    var out = {};
    CLASSES.forEach(function (k) { out[k] = { role: role, priority: priority, basis: null }; });
    return out;
  }

  var DEFAULT_PERMISSION = {
    providerId: null,
    role: "UNKNOWN",
    priority: 99,
    classRoles: flatRoles("UNKNOWN", 99),
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
    classRoles: flatRoles("IDENTITY", 0),
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
      /* Die klassenweise Rangfolge (O-14). Fehlt sie, gilt die flache
         Rolle fuer beide Klassen - eine aeltere Konfiguration verhaelt
         sich damit genau wie vorher. */
      var flatRole = e.role || "UNKNOWN";
      var flatPriority = typeof e.priority === "number" ? e.priority : DEFAULT_PERMISSION.priority;
      var classRoles = flatRoles(flatRole, flatPriority);
      CLASSES.forEach(function (k) {
        var c = e.roles && e.roles[k];
        if (!c) return;
        classRoles[k] = {
          role: c.role || flatRole,
          priority: typeof c.priority === "number" ? c.priority : flatPriority,
          basis: c.basis || null
        };
      });

      providers[id] = {
        providerId: id,
        role: flatRole,
        priority: flatPriority,
        classRoles: classRoles,
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
    /* Das Lizenz-Gate heisst seit O-11 licenseGate und traegt die exakte
       Frage an den Anbieter. Der alte Name bleibt lesbar, damit eine
       aeltere Konfiguration nicht still ohne Eskalation dasteht. */
    openQuestion = (config && (config.licenseGate || config.openQuestion)) || null;
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
      var mixedClasses = {};
      CLASSES.forEach(function (k) {
        mixedClasses[k] = {
          role: "MIXED",
          priority: Math.max.apply(null, parts.map(function (p) {
            return (p.classRoles && p.classRoles[k]) ? p.classRoles[k].priority : p.priority;
          })),
          basis: null
        };
      });
      return {
        providerId: providerId,
        role: "MIXED",
        classRoles: mixedClasses,
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
  function order(kind) {
    ensureConfigured();
    var all = Object.keys(providers).map(function (id) { return providers[id]; });
    if (!kind) {
      return all.sort(function (a, b) {
        return a.priority - b.priority || String(a.providerId).localeCompare(String(b.providerId));
      });
    }
    return all.sort(function (a, b) {
      return priorityFor(a, kind) - priorityFor(b, kind) ||
             String(a.providerId).localeCompare(String(b.providerId));
    });
  }

  function priorityFor(p, kind) {
    var c = p.classRoles && p.classRoles[kind];
    return c ? c.priority : p.priority;
  }

  /** Die Rolle einer Quelle fuer eine bestimmte Art von Frage (O-14). */
  function roleFor(providerId, kind) {
    var p = get(providerId);
    var c = p.classRoles && p.classRoles[kind];
    return c ? c.role : p.role;
  }

  function primary(kind) {
    return order(kind).find(function (p) {
      var role = kind ? ((p.classRoles && p.classRoles[kind]) ? p.classRoles[kind].role : p.role) : p.role;
      return role === "PRIMARY";
    }) || null;
  }
  function fallbacks(kind) {
    return order(kind).filter(function (p) {
      return (kind ? roleFor(p.providerId, kind) : p.role) === "FALLBACK";
    });
  }
  function list() { return order(); }

  /**
   * Die Meta-Angaben, die ein Ingest-Skript an fx-rates.ingest() reicht.
   * So steht die Rolle einmal in der Konfiguration und nirgends sonst.
   */
  function ingestMeta(providerId, extra) {
    var p = get(providerId);
    var out = { source: providerId, role: p.role, priority: p.priority,
                classRoles: p.classRoles };
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
    CLASSES: CLASSES,
    configure: configure, reset: reset, get: get,
    displayPermission: displayPermission,
    order: order, primary: primary, fallbacks: fallbacks, list: list,
    roleFor: roleFor,
    ingestMeta: ingestMeta, escalation: escalation,
    publicDisplaySummary: publicDisplaySummary
  };

  if (isNode) module.exports = api;
  else { global.VUFx = global.VUFx || {}; global.VUFx.Providers = api; }
})(typeof window !== "undefined" ? window : globalThis);
