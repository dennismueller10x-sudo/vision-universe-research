/* =========================================================================
   VISION UNIVERSE TECHNICAL — engine/stock-summary.js
   TECHNICAL-STAND JE AKTIE (kleine Scherben fuer andere Produktwelten)

   Der volle Screener-Datensatz (technical/data/screener-v1.json, ~6 MB) ist
   fuer eine einzelne Aktienseite zu schwer. Der Erzeuger
   (scripts/technical/world/build-screener.mjs) schreibt deshalb zusaetzlich
   technical/data/stock/<Scherbe>.json: je Aktie der veroeffentlichte
   Technical-Stand in Kurzform, fertig formuliert. Die Scherbe ist
   core/identity.js#shardKey (ADR-001), "NVDA" -> "NV".

   Diese Datei rechnet NICHTS Neues. Alles kommt aus dem Screener-Datensatz
   und den bestehenden Technical-Engines:
     Vorlagen      templates.js#evaluate (erfuellt / fast erfuellt / unvollstaendig)
     Analyseziele  assistant.js#build mit der Voreinstellung, ausgewertet mit
                   templates.js#evaluate
     Formationen   Spalte formations (Tag) und formationActive@1W (Woche),
                   Namen aus technical-query.js#FORMATION_TYPES, Saetze aus
                   model.js#hitSentence
     Trend         Spalten des Abfragekatalogs, Namen aus technical-query.js
     Datenqualitaet frozenSince, fresh, hasVolume, Kurssprung (price-jumps.js#describe)

   Kein Signal, keine Empfehlung, keine Rendite. Leser (z. B. die
   Supertrader-Aktienseite) zeigen die Texte nur an und verlinken auf
   Chart Studio (core/stock-context.js#href(ctx, "technical")).

   Browser: globalThis.VUTechnical.StockSummary; Node: module.exports.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  function dep(path, name) { return isNode ? require(path) : name(); }
  var Q = dep("../../quant/engines/technical/technical-query.js", function () { return global.VUTechnical.Query; });
  var TPL = dep("./templates.js", function () { return global.VUTechnical.Templates; });
  var AS = dep("./assistant.js", function () { return global.VUTechnical.Assistant; });
  var M = dep("./model.js", function () { return global.VUTechnicalModel; });
  var PJ = dep("../../quant/engines/technical/price-jumps.js", function () { return global.VUTechnical.PriceJumps; });
  var Identity = dep("../../core/identity.js", function () { return global.VUCore.Identity; });

  var SCHEMA = "vu-technical-stock-1.0.0";
  var VERSION = "technical-stock-summary-1.0.0";
  var DIR = "/technical/data/stock/";
  /* Obergrenze je Scherbe (Bytes, JSON). Eine Aktienseite laedt genau eine Scherbe. */
  /* Stand 02.11.2026: groesste Scherbe "IN" (53 Aktien) 49 KB, komprimiert 5 KB; Median 8 KB, je Aktie im Median 0,7 KB. */
  var SHARD_BUDGET = 64000;

  /* Trendzustand in der Reihenfolge der Anzeige (Felder des Abfragekatalogs, Tageschart). */
  var TREND = ["aboveSma50", "aboveSma200", "sma50AboveSma200", "sma200Rising"];
  /* Einordnungen, die je Aktie veroeffentlicht werden. "NONE" (mindestens zwei Kriterien nicht erfuellt) zaehlt nur. */
  var SHOWN = ["FULL", "NEAR", "INCOMPLETE"];
  /* Gleiche Saetze wie die Pruefleiste in Chart Studio (technical/app.js#templatePanel). */
  function statusText(status, unknown) {
    return status === "FULL" ? "alle Kriterien erfüllt"
      : status === "NEAR" ? "fast erfüllt – ein Kriterium fehlt"
      : status === "INCOMPLETE" ? "unvollständig – " + unknown + " unbekannt"
      : status === "EXCLUDED" ? "nicht eingeordnet – kein aktueller Kurs" : "";
  }
  var BADGE_FLAGS = { B: "Bei Erkennung ausgebrochen", V: "Vorläufig" };

  function shardOf(ticker) { return Identity.shardKey(ticker); }
  function path(ticker) { return DIR + shardOf(ticker) + ".json"; }

  /* Vorlage oder Analyseziel -> {i: {status, pass, total, unknown}} fuer die gezeigten Einordnungen. */
  function fits(ds, t) {
    var r = TPL.evaluate(ds, t), out = {};
    [["FULL", r.full], ["NEAR", r.near], ["INCOMPLETE", r.incomplete]].forEach(function (p) {
      p[1].forEach(function (e) {
        var pass = 0, unknown = 0;
        e.states.forEach(function (s) { if (s === "PASS") pass++; else if (s === "UNKNOWN") unknown++; });
        out[e.i] = { status: p[0], pass: pass, total: e.states.length, unknown: unknown };
      });
    });
    return out;
  }

  /* Formation: Typ, Zustand, Etikett und Satz ohne den Namen davor (Name einmal je Scherbe in labels.formations). */
  function formationsOf(row) {
    var out = [];
    (row.formations || []).forEach(function (f) {
      var flags = f[5] || "", badge = flags.indexOf("B") >= 0 && f[1] === "CONFIRMED" ? BADGE_FLAGS.B : flags.indexOf("V") >= 0 && f[1] === "DETECTED" ? BADGE_FLAGS.V : M.STATE_BADGE[f[1]] || f[1];
      var sentence = M.hitSentence({ formations: [f] }), name = Q.FORMATION_TYPES[f[0]] || f[0];
      if (sentence.indexOf(name + ": ") === 0) sentence = sentence.slice(name.length + 2);
      out.push({ tf: "1D", type: f[0], state: f[1], badge: badge, text: sentence.charAt(0).toUpperCase() + sentence.slice(1) });
    });
    var wk = row["formationActive@1W"], wc = row["formationConfirmed@1W"] || [];
    (Array.isArray(wk) ? wk : []).forEach(function (type) {
      var st = wc.indexOf(type) >= 0 ? "CONFIRMED" : "DETECTED";
      out.push({ tf: "1W", type: type, state: st, badge: M.STATE_BADGE[st], text: st === "CONFIRMED" ? "Im Wochenchart bestätigt." : "Im Wochenchart in Bildung." });
    });
    return out;
  }

  function dqOf(row) {
    var out = [];
    if (row.frozenSince) out.push({ code: "FROZEN", tone: "warn", short: "Kurs unverändert seit " + M.dateDe(row.frozenSince),
      long: "Datenqualitätshinweis: seitdem unveränderter Schlusskurs. Kein bestätigtes Delisting, auch bei illiquiden Titeln möglich. Keine Kennzahlen." });
    else if (!row.fresh) out.push({ code: "BEHIND", tone: "warn", short: "Kurs vom " + M.dateDe(row.asOf),
      long: "Der letzte Kurs liegt vor dem Stichtag des Screeners. Vorlagen ordnen diese Aktie nicht ein; Ereignisse und Stichtagszustände bleiben leer." });
    if (row.hasVolume === false) out.push({ code: "NO_VOLUME", tone: "info", short: "ohne Volumen", long: "Für diese Aktie liegen keine Volumendaten vor; Volumenkriterien sind unbekannt." });
    if (row.suspectJumpAt) {
      var factor = typeof row.suspectJumpFactor === "number" && isFinite(row.suspectJumpFactor) ? row.suspectJumpFactor : null;
      var j = { date: row.suspectJumpAt, factor: factor === null ? "?" : factor, status: row.suspectJumpStatus || "SUSPECT", splitSignature: factor === null ? true : PJ.splitSignature(factor) };
      var d = PJ.describe(j, M.dateDe);
      out.push({ code: j.status === "CONFIRMED" ? "PRICE_JUMP_CONFIRMED" : "PRICE_JUMP_SUSPECT", tone: j.status === "CONFIRMED" ? "bad" : "warn", short: d.short, long: d.long });
    }
    return out;
  }

  /* Je Treffer nur Kennung und Ergebnis; Titel und Chart-Parameter stehen einmal im Kopf der Scherbe (labels). */
  function fitList(defs, maps, i) {
    var out = [];
    defs.forEach(function (d, k) {
      var f = maps[k][i]; if (!f) return;
      out.push({ id: d.id, status: f.status, label: statusText(f.status, f.unknown), pass: f.pass, total: f.total });
    });
    /* Reihenfolge: erfuellt vor fast erfuellt vor unvollstaendig, sonst wie im Katalog. */
    return out.sort(function (a, b) { return SHOWN.indexOf(a.status) - SHOWN.indexOf(b.status); });
  }

  /**
   * Alle Scherben aus dem Screener-Datensatz.
   * @returns {{ shards: Object<string, object>, count: number }}  shards[key] = {schema, version, asOf, ..., stocks: {T: record}}
   */
  function build(artifact) {
    var ds = Q.createDataset(artifact);
    var templates = TPL.list().map(function (t) { return { id: t.id, title: t.title, q: "v=" + encodeURIComponent(t.id), t: t }; });
    var goals = AS.list().map(function (g) { return { id: g.id, title: g.title, q: AS.paramsOf(g.id, null), t: AS.build(g.id, null) }; }).filter(function (g) { return !!g.t; });
    var tMaps = templates.map(function (d) { return fits(ds, d.t); }), gMaps = goals.map(function (d) { return fits(ds, d.t); });
    var trendLabels = TREND.map(function (id) { return Q.labelOf(Q.field(id), "1D"); });
    /* Anzeigenamen einmal je Scherbe: trend[k] gehoert zu labels.trend[k]; templates/goals: {id: {title, q}}. */
    var labels = {
      trend: TREND.map(function (id, k) { return { id: id, label: trendLabels[k] }; }),
      structures: Q.STRUCTURES, templates: {}, goals: {}, checked: { templates: templates.length, goals: goals.length }
    };
    templates.forEach(function (d) { labels.templates[d.id] = { title: d.title, q: d.q }; });
    goals.forEach(function (d) { labels.goals[d.id] = { title: d.title, q: d.q }; });
    var shards = {};
    for (var i = 0; i < ds.size; i++) {
      var row = ds.row(i), key = shardOf(row.s);
      var rec = {
        s: row.s, n: row.n || null, sid: row.sid, asOf: row.asOf, fresh: row.fresh === true, frozenSince: row.frozenSince || null,
        structure: row.structure || null,
        trend: TREND.map(function (id) { var v = row[id]; return v === true ? true : v === false ? false : null; }),
        rsRank: typeof row.rsRank === "number" && isFinite(row.rsRank) ? row.rsRank : null,
        formations: formationsOf(row),
        templates: row.fresh === true ? fitList(templates, tMaps, i) : [],
        goals: row.fresh === true ? fitList(goals, gMaps, i) : [],
        dq: dqOf(row)
      };
      if (!shards[key]) shards[key] = { schema: SCHEMA, version: VERSION, shard: key, asOf: artifact.asOf, generatedFrom: artifact.generatedFrom || null,
        versions: { row: artifact.versions && artifact.versions.row || null, templates: TPL.TEMPLATES_VERSION, assistant: AS.ASSISTANT_VERSION },
        limits: TPL.LIMITS, labels: Object.assign({ formations: {} }, labels), stocks: {} };
      shards[key].stocks[row.s] = rec;
      rec.formations.forEach(function (f) { shards[key].labels.formations[f.type] = Q.FORMATION_TYPES[f.type] || f.type; });
    }
    return { shards: shards, count: ds.size };
  }

  /** Vertrag einer Scherbe (Leser und Tests). Liefert eine Liste von Fehlercodes, leer = gueltig. */
  function check(shard, key) {
    var errs = [];
    if (!shard || typeof shard !== "object") return ["NO_SHARD"];
    if (shard.schema !== SCHEMA) errs.push("SCHEMA");
    if (key !== undefined && shard.shard !== key) errs.push("SHARD_KEY");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(shard.asOf || "")) errs.push("ASOF");
    if (!shard.stocks || typeof shard.stocks !== "object") return errs.concat("NO_STOCKS");
    var L = shard.labels || {};
    if (!Array.isArray(L.trend) || L.trend.length !== TREND.length) errs.push("LABELS");
    Object.keys(shard.stocks).forEach(function (t) {
      var r = shard.stocks[t];
      if (!r || r.s !== t) errs.push("TICKER " + t);
      else {
        if (shardOf(t) !== shard.shard) errs.push("WRONG_SHARD " + t);
        if (r.sid !== Identity.securityIdForTicker(t)) errs.push("SECURITY_ID " + t);
        if (!Array.isArray(r.templates) || !Array.isArray(r.goals) || !Array.isArray(r.formations) || !Array.isArray(r.dq) || !Array.isArray(r.trend) || r.trend.length !== TREND.length) errs.push("SHAPE " + t);
        else if (!r.fresh && (r.templates.length || r.goals.length)) errs.push("STALE_FIT " + t);
        else {
          r.templates.forEach(function (f) { if (SHOWN.indexOf(f.status) < 0) errs.push("STATUS " + t + "/" + f.id); if (!L.templates || !L.templates[f.id]) errs.push("LABEL " + t + "/" + f.id); });
          r.goals.forEach(function (f) { if (SHOWN.indexOf(f.status) < 0) errs.push("STATUS " + t + "/" + f.id); if (!L.goals || !L.goals[f.id]) errs.push("LABEL " + t + "/" + f.id); });
        }
      }
    });
    return errs;
  }

  var api = { SCHEMA: SCHEMA, VERSION: VERSION, DIR: DIR, SHARD_BUDGET: SHARD_BUDGET, TREND: TREND.slice(), SHOWN: SHOWN.slice(),
    statusText: statusText, shardOf: shardOf, path: path, build: build, check: check };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.StockSummary = api; }
})(typeof window !== "undefined" ? window : globalThis);
