/* =========================================================================
   VISION UNIVERSE CORE — modules.js

   MODUL-STECKBRIEFE (Plan Neustart §3). Jedes Produkt traegt <produkt>/module.json:
   Route, Navigation, Zugang (free/pro/intern), Status, Datenarten (data: erzeugt,
   reads: gelesen) und Vertragstests. Erzeuger, Workflow, Zeitplan und Frische-Grenze
   stehen genau einmal in core/registry/domains.json; der Steckbrief verweist per
   Datenart-id darauf und resolve() loest sie auf. So bleibt es bei einer Wahrheit.

   Aus den Steckbriefen entstehen (scripts/core/build-modules.mjs):
     core/registry/modules.json            Index fuer Statusseite und system-health
     assets/site-navigation.js (groups)    Produktgruppen und "Weitere Produkte" im Menue
   site-navigation.js liegt unter der UI-Byte-Sperre: eine Menueaenderung im Steckbrief braucht dort eine
   Revision (docs/quality/ui-protection-revisions.json); der Generator schreibt, der Vertragstest prueft Gleichheit.
   Vertragstest: core/tests/module-manifest.test.mjs.
   ========================================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUCore = root.VUCore || {};
  root.VUCore.Modules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SCHEMA = "vu-module-2";
  var ACCESS = ["free", "pro", "intern"];
  var STATUS = ["LIVE", "BETA", "PREPARED", "RETIRED"];
  var GROUPS = ["products", "more"];
  /* Gleiche Rangfolge wie core/health.js (RANK); hier dupliziert, damit modules.js ohne health.js laeuft. */
  var RANK = { OK: 0, DISABLED: 0, NOT_DELIVERED: 0, RELEASE_ONLY: 0, UNKNOWN: 1, DEGRADED: 2, STALE: 3, FAILED: 4 };

  function domainsById(registry) {
    var map = {};
    ((registry && registry.domains) || []).forEach(function (d) { if (d && d.id) map[d.id] = d; });
    return map;
  }

  /* Pruefung eines Steckbriefs; liefert Fehlertexte (leer = gueltig). */
  function validate(m, registry) {
    var errs = [], byId = domainsById(registry), id = m && m.id;
    if (!m || m.schema !== SCHEMA) return [(id || "?") + ": schema muss " + SCHEMA + " sein"];
    ["id", "label", "status", "route", "access", "data", "reads", "tests"].forEach(function (k) {
      if (m[k] === undefined) errs.push(id + ": " + k + " fehlt");
    });
    if (ACCESS.indexOf(m.access) < 0) errs.push(id + ": Zugang " + m.access + " (erlaubt: " + ACCESS.join("/") + ")");
    if (STATUS.indexOf(m.status) < 0) errs.push(id + ": Status " + m.status);
    if (typeof m.route !== "string" || m.route.indexOf("/" + id + "/") !== 0) errs.push(id + ": Route muss mit /" + id + "/ beginnen");
    var n = m.navigation;
    if (n !== null && n !== undefined) {
      if (GROUPS.indexOf(n.group) < 0) errs.push(id + ": Menuegruppe " + n.group);
      if (!(n.order > 0)) errs.push(id + ": navigation.order fehlt");
      if (typeof n.href !== "string" || n.href.indexOf("/" + id + "/") !== 0) errs.push(id + ": Menue-Ziel ausserhalb der Route");
      if (m.access === "intern") errs.push(id + ": interne Produkte stehen nicht im Menue");
      if (n.group === "products" && (!Array.isArray(n.entries) || !n.entries.length)) errs.push(id + ": Produktgruppe ohne Eintraege");
    }
    (m.data || []).concat(m.reads || []).forEach(function (d) { if (!byId[d]) errs.push(id + ": Datenart " + d + " nicht in domains.json"); });
    (m.data || []).forEach(function (d) { if ((m.reads || []).indexOf(d) >= 0) errs.push(id + ": " + d + " zugleich data und reads"); });
    return errs;
  }

  /* Datenarten eines Steckbriefs mit Erzeuger, Workflow, Zeitplan und Frische aus der Registry. */
  function resolve(m, registry) {
    var byId = domainsById(registry);
    function one(role) {
      return function (id) {
        var d = byId[id] || {};
        return { domain: id, role: role, label: d.label || id, artifact: d.artifact || null, producer: d.producer || null,
          workflow: d.workflow || null, schedule: d.schedule || null, freshness: d.freshness || null };
      };
    }
    return (m.data || []).map(one("data")).concat((m.reads || []).map(one("reads")));
  }

  /* Zustand je Produkt aus einem core/health.js-Bericht: schlechtester Zustand seiner Datenarten.
     Gelesene Datenarten zaehlen mit (ein Produkt ist so frisch wie seine Eingaben). */
  function productHealth(modules, report) {
    var st = {};
    ((report && report.domains) || []).forEach(function (d) { st[d.id] = d; });
    return modules.map(function (m) {
      var parts = (m.data || []).concat(m.reads || []).map(function (id) { return st[id] ? { id: id, status: st[id].status } : { id: id, status: "UNKNOWN" }; });
      var status = parts.length ? "OK" : "NO_DATA";
      parts.forEach(function (p) { if (status === "NO_DATA" || (RANK[p.status] || 0) > (RANK[status] || 0)) status = p.status; });
      var worst = parts.filter(function (p) { return p.status === status && status !== "OK"; }).map(function (p) { return p.id; });
      return { id: m.id, label: m.label, route: m.route, access: m.access, lifecycle: m.status, status: status, cause: worst };
    });
  }

  function access(modules, path) {
    var hit = null;
    modules.forEach(function (m) { var base = "/" + m.id + "/"; if (path.indexOf(base) === 0 && (!hit || base.length > hit.length)) hit = m; });
    return hit ? hit.access : null;
  }

  /* Menue: Produktgruppen (Kacheln) und die Gruppe "Weitere Produkte", im Format von assets/site-navigation.js. */
  function q(s) { return "'" + String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'"; }
  function entry(e) { return "[" + e.map(q).join(",") + "]"; }
  function navGroups(modules) {
    var withNav = modules.filter(function (m) { return m.navigation && m.access !== "intern" && m.status !== "RETIRED"; });
    var by = function (g) { return withNav.filter(function (m) { return m.navigation.group === g; }).sort(function (a, b) { return a.navigation.order - b.navigation.order || (a.id < b.id ? -1 : 1); }); };
    var lines = by("products").map(function (m) {
      var n = m.navigation;
      return "    {id:" + q(m.id) + ", label:" + q(n.label) + ", href:" + q(n.href) + ", icon:" + q(n.icon) + ", claim:" + q(n.claim || "") +
        ", entries:[" + n.entries.map(entry).join(",") + "]},";
    });
    var more = by("more").map(function (m) { return entry([m.navigation.label, m.navigation.href, m.navigation.icon]); });
    lines.push("    {id:'more', label:'Weitere Produkte', href:null, icon:'layers', claim:'', entries:[" + more.join(",") + "]}");
    return lines.join("\n");
  }

  /* Index fuer Statusseite und Terminal: alle Steckbriefe, nach id sortiert. */
  function index(modules, pages) {
    return { schema: "vu-modules-index-1", generatedBy: "scripts/core/build-modules.mjs", note: "Erzeugt aus <produkt>/module.json; nicht von Hand aendern.",
      modules: modules.slice().sort(function (a, b) { return a.id < b.id ? -1 : 1; }), pages: pages || [] };
  }

  /* Einheitliche Schreibweise eines Steckbriefs (Menueeintraege einzeilig). */
  function format(m) {
    var s = JSON.stringify(m, null, 1);
    return s.replace(/\[\n\s+("(?:[^"\\]|\\.)*"),\n\s+("(?:[^"\\]|\\.)*"),\n\s+("(?:[^"\\]|\\.)*")\n\s+\]/g, "[$1, $2, $3]") + "\n";
  }

  return { SCHEMA: SCHEMA, ACCESS: ACCESS, STATUS: STATUS, validate: validate, resolve: resolve, productHealth: productHealth,
    access: access, navGroups: navGroups, index: index, format: format };
});
