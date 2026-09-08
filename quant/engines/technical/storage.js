/* =========================================================================
   VISION UNIVERSE TECHNICAL — storage.js
   STORAGE INTERFACE (Engines kennen kein Storage)

   SnapshotStore { put(snapshot), get(snapshotId), list(filter), latestFor(instrumentId) }

   V1: MemoryStore (Browser/Tests) und JsonFileStore (Node/CI, ein JSON je
   Snapshot in einem Verzeichnis). DuckDB / Parquet / PostgreSQL / Object
   Storage spaeter hinter demselben Interface.

   Unveraenderlichkeit: put() lehnt es ab, einen vorhandenen snapshotId
   mit anderem Inhalt zu ueberschreiben. Neue Daten = neuer Snapshot mit
   supersedesSnapshotId — nie ein Rewrite.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../hash.js") : global.VUHash;

  var STORE_METHODS = ["put", "get", "list", "latestFor", "count"];

  function assertStore(store) {
    STORE_METHODS.forEach(function (m) { if (typeof store[m] !== "function") throw new Error("SnapshotStore ohne Methode " + m); });
    return store;
  }

  function createMemoryStore() {
    var items = Object.create(null), order = [];
    return assertStore({
      kind: "memory",
      put: function (snap) {
        if (!snap || !snap.snapshotId) throw new Error("Snapshot ohne snapshotId");
        var existing = items[snap.snapshotId];
        if (existing) {
          if (existing.contentHash !== snap.contentHash) throw new Error("Snapshot " + snap.snapshotId + " existiert mit anderem Inhalt — Snapshots werden nie ueberschrieben");
          return { stored: false, snapshotId: snap.snapshotId, reason: "identical" };
        }
        items[snap.snapshotId] = snap; order.push(snap.snapshotId);
        return { stored: true, snapshotId: snap.snapshotId };
      },
      get: function (id) { return items[id] || null; },
      list: function (filter) {
        filter = filter || {};
        return order.map(function (id) { return items[id]; }).filter(function (s) {
          if (filter.instrumentId && s.instrumentId !== filter.instrumentId) return false;
          if (filter.from && s.analysisTime < filter.from) return false;
          if (filter.to && s.analysisTime > filter.to) return false;
          return true;
        });
      },
      latestFor: function (instrumentId) {
        var rows = this.list({ instrumentId: instrumentId });
        return rows.length ? rows.reduce(function (a, b) { return b.analysisTime >= a.analysisTime ? b : a; }) : null;
      },
      count: function () { return order.length; }
    });
  }

  /** Node-only: ein JSON je Snapshot. Nicht im Browser verfuegbar. */
  function createJsonFileStore(dir) {
    if (!isNode) throw new Error("JsonFileStore ist Node-only");
    var fs = require("fs"), path = require("path");
    fs.mkdirSync(dir, { recursive: true });
    function file(id) { return path.join(dir, id.replace(/[^A-Za-z0-9_\-]/g, "_") + ".json"); }
    var mem = createMemoryStore();
    fs.readdirSync(dir).filter(function (f) { return f.endsWith(".json"); }).forEach(function (f) { mem.put(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))); });
    return assertStore({
      kind: "jsonFile", dir: dir,
      put: function (snap) {
        var res = mem.put(snap);
        if (res.stored) fs.writeFileSync(file(snap.snapshotId), JSON.stringify(snap));
        return res;
      },
      get: function (id) { return mem.get(id); }, list: function (f) { return mem.list(f); }, latestFor: function (i) { return mem.latestFor(i); }, count: function () { return mem.count(); }
    });
  }

  var api = { STORE_METHODS: STORE_METHODS, assertStore: assertStore, createMemoryStore: createMemoryStore, createJsonFileStore: createJsonFileStore };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.Storage = api; }
})(typeof window !== "undefined" ? window : globalThis);
