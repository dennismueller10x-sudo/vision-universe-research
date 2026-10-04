/* =========================================================================
   VISION UNIVERSE RESEARCH (INTERN) — elliott-practitioners/practitioners.js

   PRACTITIONER REFERENCE — keine objektive Wahrheit. Intern – nicht für Kunden.

   Ablauf je Fall (Blindmodus = Standard, PRACTITIONER_PROTOCOL.md §10):
     1. VU-Analyse anzeigen  (eingefrorener Benchmark-Lauf, sonst Live-Berechnung
        elliott-3.2.2 im Browser — nur Kurse bis analysisCutoff)
     2. „VU-Analyse sperren“ → Audit-Eintrag LOCK_VU (SHA-256 der VU-Zusammenfassung)
     3. erst dann: Praktiker-Referenz (strukturiert), Abweichungen
     4. optional: späterer Verlauf (verborgen, Umschalter)
   Erfassung: Formular nach Schema practitioner-reference-1.1.0, Export als JSONL
   (eine Zeile je Referenz), Import mit Duplikaterkennung, blinde Zweitextraktion
   mit Feld-Diff. Alles bleibt in diesem Browser (localStorage) bis zum Export.
   ========================================================================= */
(function () {
  "use strict";
  var C = window.VUPractitionerCore;
  var DATA = "../../data/", PV1 = DATA + "technical-intelligence/practitioner-v1/", ENG = "../../engines/";
  var KEY_R = "vu-practitioner-refs-v1", KEY_L = "vu-practitioner-audit-v1", KEY_U = "vu-practitioner-user-v1";
  var CODE_RE = /^[A-Za-z0-9_-]{2,24}$/;
  var EXPECTED_ENGINE = "elliott-3.2.2";
  /* Ausgabe von scripts/technical/practitioner/run-benchmark.mjs (replay-results.json = nur VU-Seite, comparison.json = Kennzahlen je Fall). */
  var BENCH_FILES = ["benchmark/benchmark-summary.json", "benchmark/replay-results.json", "benchmark/comparison.json"];
  var MULTI_ASSET = ["BRENT", "BTCUSD", "DIA", "EEM", "ETHUSD", "FEZ", "IWM", "N225", "NATGAS", "QQQ", "SOLUSD", "SPY", "URTH", "WTI", "XAGUSD", "XAUUSD", "XPDUSD", "XPTUSD", "XRPUSD"];
  var TZS = ["Europe/Berlin", "America/New_York", "UTC", "Europe/London", "Europe/Vienna", "Europe/Zurich", "America/Chicago", "America/Los_Angeles", "Asia/Tokyo", "Asia/Singapore", "Australia/Sydney"];

  var S = { schema: null, registry: [], registryStatus: "", instrumentMap: [], repoRefs: [], repoStatus: "", bench: { replay: {}, cmp: {}, files: [], engine: null, status: null }, blind: true, tab: "compare",
            curRefId: null, logScale: false, vu: {}, vuBusy: {}, showOutcome: {}, series: {}, shownPr: {}, forms: {} };

  // ------------------------------------------------------------------ DOM-Helfer (nur textContent, kein innerHTML)
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { var v = attrs[k]; if (v === null || v === undefined || v === false) return; if (k === "text") e.textContent = v; else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); });
    (kids || []).forEach(function (c) { if (c !== null && c !== undefined && c !== false) e.append(c); });
    return e;
  }
  var NS = "http://www.w3.org/2000/svg";
  function sv(tag, a, txt) { var e = document.createElementNS(NS, tag); Object.keys(a || {}).forEach(function (k) { e.setAttribute(k, a[k]); }); if (txt !== undefined) e.textContent = txt; return e; }
  function $(id) { return document.getElementById(id); }
  function f(v, d) { return typeof v === "number" && isFinite(v) ? v.toLocaleString("de-DE", { maximumFractionDigits: d === undefined ? 2 : d }) : v === null || v === undefined || v === "" ? "–" : String(v); }
  function pct(v) { return typeof v === "number" && isFinite(v) ? (v >= 0 ? "+" : "") + f(v * 100, 1) + " %" : "–"; }
  function kv(rows) { return h("dl", {}, [].concat.apply([], rows.filter(Boolean).map(function (r) { return [h("dt", { text: r[0] }), h("dd", { text: r[1] === null || r[1] === undefined || r[1] === "" ? "–" : String(r[1]) })]; }))); }
  function msgList(errors, warnings) { return h("ul", { class: "msgs" }, (errors || []).map(function (e) { return h("li", { class: "e", text: "Fehler: " + e }); }).concat((warnings || []).map(function (w) { return h("li", { class: "w", text: "Hinweis: " + w }); }))); }
  function setMsg(text, cls) { var m = $("t-msg"); m.className = cls || "note"; m.textContent = text; }

  // ------------------------------------------------------------------ Speicher & Audit-Log
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function me() { return lsGet(KEY_U, { code: "" }); }
  function auditLog() { return lsGet(KEY_L, []); }
  function audit(entry) { var L = auditLog(); entry.seq = L.length ? L[L.length - 1].seq + 1 : 1; entry.at = new Date().toISOString(); entry.code = entry.code === undefined ? me().code || null : entry.code; L.push(entry); lsSet(KEY_L, L); }
  function locals() { return lsGet(KEY_R, []); }
  function saveLocals(L) { return lsSet(KEY_R, L); }
  function hex(buf) { return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join(""); }
  function sha256(text) { if (window.crypto && crypto.subtle) return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (b) { return "sha256:" + hex(b); }).catch(function () { return C.fnv1a(text); }); return Promise.resolve(C.fnv1a(text)); }

  /* Alle Referenzen: Repo (references.jsonl) + lokal; lokale Zeile mit gleicher referenceId überdeckt die Repo-Zeile. */
  function allRefs() {
    var m = new Map();
    S.repoRefs.forEach(function (r) { m.set(r.referenceId, { record: r, origin: "repo" }); });
    locals().forEach(function (x) { m.set(x.record.referenceId, { record: x.record, origin: m.has(x.record.referenceId) ? "lokal (überdeckt Repo)" : "lokal", savedAt: x.savedAt }); });
    return Array.from(m.values());
  }
  function findRef(id) { return allRefs().filter(function (x) { return x.record.referenceId === id; })[0] || null; }
  function firstPassRefs() { return allRefs().filter(function (x) { return !C.isSecondPass(x.record); }); }
  function locked(caseId) { var c = me().code; return !!c && auditLog().some(function (e) { return e.action === "LOCK_VU" && e.caseId === caseId && e.code === c; }); }
  function prVisible(caseId) { return !S.blind || locked(caseId); }
  function sawFirstPass(caseId, code) { return auditLog().some(function (e) { return e.code === code && e.caseId === caseId && (e.action === "PRACTITIONER_SHOWN" || e.action === "EDIT_LOAD" || e.action === "SAVE" && e.note === "first-pass"); }); }

  // ------------------------------------------------------------------ Laden
  function fetchJson(url) { return fetch(url, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }); }
  function fetchText(url) { return fetch(url, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); }); }
  function normRegistry(j) {
    var list = Array.isArray(j) ? j : j && Array.isArray(j.sources) ? j.sources : j && typeof j === "object" ? Object.keys(j.sources || j).filter(function (k) { return (j.sources || j)[k] && typeof (j.sources || j)[k] === "object"; }).map(function (k) { return Object.assign({ sourceId: k }, (j.sources || j)[k]); }) : [];
    return list.map(function (s) {
      var tier = s.benchmarkTier || s.tier || s.stage || s.internalTier || s.grade || (s.quality && (s.quality.tier || s.quality.stage)) || null;
      return { id: String(s.sourceId || s.id || s.key || ""), name: String(s.name || s.label || s.displayName || s.sourceId || s.id || ""), tier: tier ? String(tier).toUpperCase() : null, type: s.sourceType || s.type || null, hkcm: !!(s.hkcmFamily || s.hkcm || /hkcm/i.test(String(s.sourceId || s.id || ""))) };
    }).filter(function (s) { return s.id; });
  }
  /* Benchmark-Dateien tolerant lesen: results[] (Replay, VU-Seite) und rows[] (Vergleich). Fehlende Dateien = kein Lauf. */
  function normBench(j, file) {
    if (!j || typeof j !== "object") return 0;
    if (j.engine) S.bench.engine = typeof j.engine === "string" ? j.engine : j.engine.actual || j.engine.v3 || j.engine.expected || null;
    if (j.status && /summary/.test(file)) S.bench.status = j.status;
    var n = 0;
    (Array.isArray(j.results) ? j.results : []).forEach(function (r) { var id = r && (r.projection && r.projection.referenceId || r.referenceId); if (id) { S.bench.replay[id] = Object.assign({ _file: file }, r); n++; } });
    (Array.isArray(j.rows) ? j.rows : Array.isArray(j) ? j : []).forEach(function (r) { if (r && r.referenceId) { S.bench.cmp[r.referenceId] = Object.assign({ _file: file }, r); n++; } });
    if (n || j.status) S.bench.files.push(file.replace(/^benchmark\//, "") + (j.status && j.status !== "OK" ? " [" + j.status + "]" : n ? " (" + n + ")" : ""));
    return n;
  }
  function loadBench() { return Promise.all(BENCH_FILES.map(function (u) { return fetchJson(PV1 + u).then(function (j) { normBench(j, u); }).catch(function () {}); })); }
  function benchFor(rec) { return S.bench.replay[rec.referenceId] || null; }
  function cmpFor(rec) { return S.bench.cmp[rec.referenceId] || null; }

  /* VU-Kursreihe: multi-asset (täglich) bevorzugt, sonst discover-series-long ref_<T> (wöchentlich). */
  function loadSeries(sym) {
    sym = String(sym || "").trim(); if (!sym) return Promise.resolve(null);
    if (S.series[sym]) return S.series[sym];
    var up = sym.toUpperCase().replace(/^REF_/, "");
    var p = fetchJson(DATA + "market/multi-asset/series/" + encodeURIComponent(up) + ".json").then(function (j) {
      return { points: (j.points || []).filter(function (x) { return x[1] > 0; }), grain: "daily", source: "multi-asset/series/" + up + ".json", attribution: j.attribution || j.source || "" };
    }).catch(function () {
      return fetchJson(DATA + "market/discover-series-long/ref_" + encodeURIComponent(up) + ".json").then(function (j) {
        return { points: (j.points || []).filter(function (x) { return x[1] > 0; }), grain: j.grain === "daily" ? "daily" : "weekly", source: "discover-series-long/ref_" + up + ".json (" + (j.priceSeriesType || "") + ")", attribution: j.source || "" };
      });
    }).catch(function () { return null; });
    S.series[sym] = p; return p;
  }
  /* Reihe für einen Fall: bis Stichtag (blind) und danach (Ergebnis). */
  function caseSeries(rec, all) {
    var tf = rec.timeframe, weekly = tf === "1W" || tf === "1M" || all.grain === "weekly";
    var pts = weekly && all.grain === "daily" ? C.toWeekly(all.points) : all.points.slice();
    var cut = rec.analysisCutoff, before = pts.filter(function (p) { return p[0] <= cut; }), after = pts.filter(function (p) { return p[0] > cut; });
    var notes = [];
    if (all.grain === "weekly" && tf === "1D") notes.push("Nur Wochenreihe vorhanden — Tageszählung wird auf Wochenbasis rekonstruiert.");
    if (tf === "1M") notes.push("1M wird wie im Benchmark auf Wochenbasis rekonstruiert.");
    if (tf === "INTRADAY" || tf === "MIXED" || tf === "UNKNOWN") notes.push("Zeitrahmen " + tf + ": mit Tagesschlusskursen nur näherungsweise darstellbar.");
    return { before: before, after: after, weekly: weekly, tf: weekly ? "1W" : "1D", notes: notes, source: all.source, attribution: all.attribution };
  }

  // ------------------------------------------------------------------ Engine (elliott-3.2.2) im Browser — nur bei Bedarf geladen
  var enginePromise = null;
  function loadEngine() {
    if (enginePromise) return enginePromise;
    var files = ["hash.js", "technical/canonical-bars.js", "technical/feature-store.js", "technical/pivot-engine.js", "technical/elliott/patterns.js", "technical/elliott/sources.js", "technical/elliott/elliott-v2.js", "technical/ti/context.js", "technical/elliott/elliott-v3.js"];
    enginePromise = files.reduce(function (p, fn) { return p.then(function () { return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = ENG + fn; s.onload = res; s.onerror = function () { rej(new Error("Engine-Datei fehlt: " + fn)); }; document.head.append(s); }); }); }, Promise.resolve())
      .then(function () { return window.VUTechnical; });
    enginePromise.catch(function () { enginePromise = null; });
    return enginePromise;
  }
  function runLive(rec) {
    var sym = rec.instrument && rec.instrument.vuSymbol;
    return Promise.all([loadEngine(), loadSeries(sym)]).then(function (x) {
      var T = x[0], all = x[1]; if (!all) throw new Error("Keine VU-Reihe für " + sym);
      var cs = caseSeries(rec, all); if (cs.before.length < 300) throw new Error("Zu wenige Bars bis Stichtag (" + cs.before.length + " < 300) — wie im Benchmark: TOO_SHORT");
      var series = T.CanonicalBars.fromRows(cs.before.map(function (p) { return { date: p[0], open: p[1], high: p[1], low: p[1], close: p[1], volume: null }; }), { instrumentId: "X", exchange: "X", currency: "USD", timeframe: cs.tf, priceSeriesType: "SPLIT_ADJUSTED", source: "multi-asset" });
      var P = T.TIContext.prepare(series);
      var r = T.ElliottV3.analyzeElliottV3({ series: series, features: P.features, pivots: P.pivots, barsPerYear: cs.tf === "1W" ? 52 : 252 });
      return summarizeEngine(r, cs);
    });
  }
  function summarizeEngine(r, cs) {
    var c = r.primary, zones = c && c.projection && c.projection.zones ? c.projection.zones.filter(function (z) { return z.kind === "TARGET"; }).slice(0, 2).map(function (z) { return [z.zoneLow, z.zoneHigh]; }) : [];
    return {
      origin: "LIVE", engineVersion: r.engineVersion, asOf: r.asOf, status: r.status, bars: cs.before.length, tf: cs.tf,
      pattern: c ? c.pattern : null, patternName: c ? c.patternName : null, family: c ? c.family : null, complete: c ? !!c.complete : null,
      currentWave: c && c.currentWave ? c.currentWave.label : null, role: c && c.currentWave ? c.currentWave.role : null, curDir: c && c.currentWave ? c.currentWave.direction : null,
      nextMove: c ? c.nextMove : null, degree: c && c.degree ? c.degree.notation + " (relativ " + c.degree.relative + ")" : null,
      invalidation: c && c.invalidation ? { price: c.invalidation.price, direction: c.invalidation.direction } : null,
      revision: c && c.revision ? { price: c.revision.price, direction: c.revision.direction } : null, targetZones: zones,
      applicability: r.applicability ? { level: r.applicability.level, abstain: !!r.applicability.abstain, reasons: r.applicability.reasons || [] } : null,
      ambiguity: r.ambiguity ? r.ambiguity.kind + " – " + r.ambiguity.note : null,
      alternatives: (r.alternatives || []).slice(0, 3).map(function (a) { return { pattern: a.pattern, wave: a.currentWave ? a.currentWave.label : null, next: a.nextMove }; }),
      waves: c && c.waves ? c.waves.map(function (w) { return { label: w.label, fromTime: w.fromTime, toTime: w.toTime, fromPrice: w.fromPrice, toPrice: w.toPrice }; }) : []
    };
  }
  /* Replay-Zeile aus benchmark/replay-results.json (summarizeVu in scripts/technical/practitioner/replay.mjs). */
  function summarizeBench(row) {
    var v = row.vu || {}, p = v.primary || null, ap = v.applicability || null;
    function zones(c) { return ((c && c.targetZones) || []).slice(0, 2).map(function (z) { return Array.isArray(z) ? z : [z.low, z.high]; }); }
    return {
      origin: "BENCHMARK", file: row._file, engineVersion: v.engineVersion || row.engineVersion || S.bench.engine, asOf: row.projection ? row.projection.analysisCutoff : null, status: v.status || row.status, tf: row.timeframeUsed || null,
      pattern: p ? p.pattern : null, patternName: null, family: p ? p.family : null, complete: p ? !!p.complete : null,
      currentWave: p && p.currentWave ? p.currentWave.label : null, role: p && p.currentWave ? p.currentWave.role : null, curDir: p && p.currentWave ? p.currentWave.direction : null,
      nextMove: p ? p.nextMove : null, degree: p && p.degree && p.degree.rank !== undefined && p.degree.rank !== null ? "Rang " + p.degree.rank + " (genähert, Wellendauer)" : null,
      invalidation: p && p.invalidation ? { price: p.invalidation.price, direction: p.invalidation.direction } : null, revision: p && p.revision ? p.revision : null, targetZones: zones(p),
      applicability: ap ? { level: ap.level, abstain: !!ap.abstain, reasons: [] } : null, ambiguity: v.ambiguityKind || null,
      alternatives: (v.alternatives || []).slice(0, 3).filter(Boolean).map(function (a) { return { pattern: a.pattern, wave: a.currentWave ? a.currentWave.label : null, next: a.nextMove }; }),
      waves: p && p.waves ? p.waves : [],
      skipped: row.status && row.status !== "OK" ? row.status + (row.detail ? ": " + row.detail : "") : null
    };
  }

  // ------------------------------------------------------------------ Chart
  function levelScale(rec) { var i = rec.instrument || {}; if (typeof i.levelScale === "number") return i.levelScale; return i.mappingQuality === "EXACT" || i.mappingQuality === "PROXY_SAME_UNDERLYING" ? 1 : null; }
  function chart(rec, cs, vu, showPr, showOut) {
    var pts = cs.before.concat(showOut ? cs.after.slice(0, cs.weekly ? 52 : 252) : []), nb = cs.before.length;
    var lookback = cs.weekly ? 260 : 750, start = Math.max(0, nb - lookback);
    pts = pts.slice(start);
    var d = pts.map(function (p) { return p[0]; }), cl = pts.map(function (p) { return p[1]; }), n = d.length, cutI = nb - start - 1;
    var W = 980, H = 380, pl = 8, pr = 70, pt = 12, pb = 24, log = S.logScale;
    var lo = Math.min.apply(null, cl), hi = Math.max.apply(null, cl), pad = (hi - lo) * 0.08 || 1; lo = log ? lo / 1.08 : lo - pad; hi = log ? hi * 1.08 : hi + pad;
    var T = function (v) { return log ? Math.log(Math.max(v, 1e-9)) : v; }, tl = T(lo), th = T(hi);
    var idx = {}; d.forEach(function (x, i) { idx[x] = i; });
    var X = function (i) { return pl + (W - pl - pr) * (i + 0.5) / n; }, Y = function (v) { return pt + (th - T(v)) / (th - tl) * (H - pt - pb); };
    var g = sv("svg", { viewBox: "0 0 " + W + " " + H, class: "chart", role: "img", "aria-label": "Schlusskurse " + (cs.weekly ? "wöchentlich" : "täglich") + " bis Stichtag " + rec.analysisCutoff + (showOut ? ", danach späterer Verlauf" : "") });
    for (var k = 0; k <= 4; k++) { var v = log ? Math.exp(tl + (th - tl) * k / 4) : lo + (hi - lo) * k / 4; g.append(sv("line", { x1: pl, x2: W - pr, y1: Y(v), y2: Y(v), stroke: "rgba(255,255,255,.06)" })); g.append(sv("text", { x: W - pr + 6, y: Y(v) + 4, fill: "#8a8f97", "font-size": 11 }, f(v))); }
    var lastY = null; d.forEach(function (x, i) { var y = x.slice(0, 4); if (y !== lastY && i > 0) { g.append(sv("line", { x1: X(i), x2: X(i), y1: pt, y2: H - pb, stroke: "rgba(255,255,255,.04)" })); g.append(sv("text", { x: X(i) + 2, y: H - 8, fill: "#8a8f97", "font-size": 10 }, y)); } lastY = y; });
    function path(a, b, color, w, dash) { var p = ""; for (var i = a; i <= b; i++) p += (i === a ? "M" : "L") + X(i).toFixed(1) + " " + Y(cl[i]).toFixed(1); if (p) g.append(sv("path", { d: p, fill: "none", stroke: color, "stroke-width": w, "stroke-dasharray": dash || "" })); }
    path(0, Math.min(cutI, n - 1), "#f4f5f1", 1.3);
    if (showOut && n - 1 > cutI) { path(cutI, n - 1, "#8a8f97", 1.2, "4 3"); }
    g.append(sv("line", { x1: X(cutI), x2: X(cutI), y1: pt, y2: H - pb, stroke: "rgba(242,193,78,.6)", "stroke-dasharray": "2 3" }));
    g.append(sv("text", { x: X(cutI) - 4, y: pt + 10, fill: "#f2c14e", "font-size": 11, "text-anchor": "end" }, "Stichtag " + rec.analysisCutoff));
    function hline(val, color, dash, label) { if (typeof val !== "number" || !isFinite(val) || val < lo || val > hi) return; g.append(sv("line", { x1: pl, x2: W - pr, y1: Y(val), y2: Y(val), stroke: color, "stroke-dasharray": dash, "stroke-width": 1.2 })); if (label) g.append(sv("text", { x: pl + 4, y: Y(val) - 3, fill: color, "font-size": 11 }, label)); }
    function zone(a, b, color, label) { if (typeof a !== "number" || typeof b !== "number") return; var top = Math.max(lo, Math.min(hi, Math.max(a, b))), bot = Math.max(lo, Math.min(hi, Math.min(a, b))); if (top === bot) return; var x0 = X(Math.min(cutI, n - 1)); g.append(sv("rect", { x: x0, width: W - pr - x0, y: Y(top), height: Math.max(2, Y(bot) - Y(top)), fill: color, opacity: 0.16 })); if (label) g.append(sv("text", { x: W - pr - 4, y: Y(top) + 11, fill: color, "font-size": 10, "text-anchor": "end" }, label)); }
    if (vu) {
      var wp = []; vu.waves.forEach(function (w, i) { if (i === 0 && idx[w.fromTime] !== undefined) wp.push([idx[w.fromTime], w.fromPrice, ""]); if (idx[w.toTime] !== undefined) wp.push([idx[w.toTime], w.toPrice, w.label]); });
      if (wp.length > 1) g.append(sv("path", { d: wp.map(function (q, j) { return (j ? "L" : "M") + X(q[0]) + " " + Y(q[1]); }).join(""), fill: "none", stroke: "#c8f531", "stroke-width": 1.8 }));
      wp.forEach(function (q) { g.append(sv("circle", { cx: X(q[0]), cy: Y(q[1]), r: 3, fill: "#c8f531" })); if (q[2]) g.append(sv("text", { x: X(q[0]), y: Y(q[1]) - 7, fill: "#c8f531", "font-size": 12, "text-anchor": "middle", "font-weight": 600 }, q[2])); });
      if (vu.invalidation) hline(vu.invalidation.price, "#c8f531", "2 4", "VU-Invalidierung");
      (vu.targetZones || []).forEach(function (z) { zone(z[0], z[1], "#c8f531", "VU-Ziel"); });
    }
    if (showPr) {
      var sc = levelScale(rec);
      if (sc !== null) {
        if (rec.invalidation) hline(rec.invalidation.price * sc, "#f2c14e", "6 4", "Praktiker-Invalidation");
        (rec.targetZones || []).forEach(function (z) { zone(z.low * sc, z.high * sc, "#f2c14e", "Praktiker-Ziel" + (z.label ? " · " + z.label : "")); });
        (rec.keySupportZones || []).forEach(function (z) { zone(z.low * sc, z.high * sc, "#8cc8ff", "Unterstützung"); });
        (rec.entryZones || []).forEach(function (z) { zone(z.low * sc, z.high * sc, "#b3a6ff", "Einstieg"); });
      }
    }
    return g;
  }

  // ------------------------------------------------------------------ Vergleich
  function groupCases() {
    var m = new Map();
    allRefs().forEach(function (x) { var c = x.record.caseId; if (!m.has(c)) m.set(c, { caseId: c, refs: [], second: [] }); (C.isSecondPass(x.record) ? m.get(c).second : m.get(c).refs).push(x); });
    var arr = Array.from(m.values()).filter(function (c) { return c.refs.length; });
    arr.forEach(function (c) { c.refs.sort(function (a, b) { return a.record.version - b.record.version; }); });
    arr.sort(function (a, b) { var ta = a.refs[0].record.publication.timestamp || "", tb = b.refs[0].record.publication.timestamp || ""; return ta < tb ? -1 : ta > tb ? 1 : 0; });
    return arr;
  }
  var EMPTY = null, PRP = null;   // beim Start einmal gegriffen (detailView ersetzt den Inhalt von #detail)
  function renderCompare() {
    EMPTY = EMPTY || $("empty-state"); PRP = PRP || $("pr-panel");
    var cases = groupCases(), nav = $("case-nav"), det = $("detail"), empty = EMPTY, prp = PRP;
    nav.replaceChildren();
    if (!cases.length) {
      nav.append(h("p", { class: "note", style: "padding:10px", text: "Keine Fälle." }));
      det.replaceChildren(empty, prp); empty.classList.remove("hidden"); prp.hidden = true; prp.classList.add("hidden");
      if (!$("empty-goto")) empty.append(h("p", { class: "note", text: "Repo-Datei: " + S.repoStatus + " · Benchmark: " + (S.bench.files.length ? S.bench.files.join(", ") : "kein Lauf vorhanden") }),
        h("button", { class: "btn primary", type: "button", id: "empty-goto", text: "Zur Erfassung", onclick: function () { selectTab("capture"); } }));
      return;
    }
    empty.classList.add("hidden");
    cases.forEach(function (c) {
      var r = c.refs[c.refs.length - 1].record, i = r.instrument || {};
      nav.append(h("button", { class: "case", type: "button", "data-id": r.referenceId, "aria-current": String(S.curRefId && c.refs.some(function (x) { return x.record.referenceId === S.curRefId; })), onclick: function () { S.curRefId = c.refs[0].record.referenceId; renderCompare(); } }, [
        h("span", { text: (i.vuSymbol || i.asShown || "?") + " · " + r.timeframe + " · " + (r.publication.timestamp || "").slice(0, 10) + (locked(r.caseId) ? " ✓" : "") }),
        h("small", { text: r.sourceId + " · Stichtag " + r.analysisCutoff + " · " + c.refs.map(function (x) { return x.origin === "repo" ? "Repo" : "lokal"; }).filter(function (v, k, a) { return a.indexOf(v) === k; }).join("+") + (c.refs.length > 1 ? " · " + c.refs.length + " Fassungen" : "") + (c.second.length ? " · Zweitextraktion" : "") })
      ]));
    });
    if (!S.curRefId || !findRef(S.curRefId)) S.curRefId = cases[0].refs[0].record.referenceId;
    var cur = cases.filter(function (c) { return c.refs.some(function (x) { return x.record.referenceId === S.curRefId; }); })[0];
    detailView(cur, findRef(S.curRefId));
  }
  function detailView(c, ref) {
    var rec = ref.record, i = rec.instrument || {}, det = $("detail"), prp = PRP, visible = prVisible(rec.caseId);
    det.replaceChildren();
    det.append(h("h2", { text: (i.vuSymbol || "keine VU-Reihe") + " · " + rec.timeframe + " · Stichtag " + rec.analysisCutoff }),
      h("p", {}, [h("span", { class: "tag", text: "Fall " + rec.caseId }), h("span", { class: "tag", text: "Veröffentlicht " + (rec.publication.timestamp || "–") + " (" + rec.publication.timestampPrecision + ")" }),
        h("span", { class: "tag" + (i.mappingQuality === "EXACT" ? " good" : i.mappingQuality === "UNMAPPED" ? " bad" : " warn"), text: "Abbildung " + (i.mappingQuality || "–") }),
        h("span", { class: "tag", text: ref.origin }), rec.split ? h("span", { class: "tag", text: "Split " + rec.split }) : null,
        rec.split === "HOLDOUT_SOURCE" || rec.split === "HOLDOUT_TEMPORAL" ? h("span", { class: "tag bad", text: "HOLDOUT – nicht für Engine-Entwicklung ansehen" }) : null]));
    if (c.refs.length > 1) {
      var sel = h("select", { id: "ver-sel", "aria-label": "Fassung" }); c.refs.forEach(function (x) { var o = h("option", { value: x.record.referenceId, text: "v" + x.record.version + " · " + (x.record.viewKind || "") + " · " + x.record.referenceId }); if (x.record.referenceId === rec.referenceId) o.selected = true; sel.append(o); });
      sel.addEventListener("change", function () { S.curRefId = sel.value; renderCompare(); }); det.append(h("label", { for: "ver-sel", text: "Fassung" }), sel);
    }
    var vu = S.vu[rec.referenceId] || null, out = !!S.showOutcome[rec.referenceId] && visible, isLocked = locked(rec.caseId);
    var steps = h("div", { class: "steps", "aria-label": "Ablauf" }, [
      h("span", { class: "step " + (vu ? "done" : "now"), text: (vu ? "✓ " : "1 ") + "VU-Analyse anzeigen" }), h("span", { class: "step", text: "→" }),
      h("span", { class: "step " + (isLocked ? "done" : vu ? "now" : ""), text: (isLocked ? "✓ " : "2 ") + "VU-Analyse sperren" }), h("span", { class: "step", text: "→" }),
      h("span", { class: "step " + (visible ? "done" : ""), text: (visible ? "✓ " : "3 ") + "Praktiker-Referenz" }), h("span", { class: "step", text: "→" }),
      h("span", { class: "step " + (out ? "done" : ""), text: "4 späterer Verlauf (optional)" })]);
    det.append(steps);
    var chartHost = h("div", { id: "chart-host" }, [h("p", { class: "note", text: "Lade Kursreihe …" })]);
    var legend = h("div", { class: "legend" }, [h("span", {}, [h("i", { class: "sw", style: "background:#f4f5f1" }), document.createTextNode("Schluss bis Stichtag")]), h("span", {}, [h("i", { class: "sw", style: "background:#c8f531" }), document.createTextNode("VU elliott-3.2.2")]),
      visible ? h("span", {}, [h("i", { class: "sw", style: "background:#f2c14e" }), document.createTextNode("Praktiker (Referenz, keine Wahrheit)")]) : null, out ? h("span", {}, [h("i", { class: "sw", style: "background:#8a8f97" }), document.createTextNode("späterer Verlauf")]) : null,
      h("label", { for: "f-log", style: "display:inline;margin:0" }, [(function () { var cb = h("input", { type: "checkbox", id: "f-log" }); cb.checked = S.logScale; cb.addEventListener("change", function () { S.logScale = cb.checked; renderCompare(); }); return cb; })(), document.createTextNode(" Log-Skala")])]);
    det.append(h("div", { class: "card" }, [h("h3", { text: "Historischer Kurs (VU-Daten) bis Stichtag" }), legend, chartHost, h("p", { class: "note", id: "series-note" })]));
    var grid = h("div", { class: "grid" });
    det.append(grid);
    grid.append(vuPanel(rec, vu, isLocked));
    // Praktiker-Panel: im Blindmodus bis zur Sperre verborgen
    prp.replaceChildren(); grid.append(prp);
    if (visible) {
      prp.hidden = false; prp.classList.remove("hidden"); prp.setAttribute("data-blind", "open");
      prp.append.apply(prp, practitionerPanel(rec, c).filter(Boolean));
      var key = rec.caseId + "|" + me().code;
      if (!S.shownPr[key]) { S.shownPr[key] = true; audit({ action: "PRACTITIONER_SHOWN", caseId: rec.caseId, referenceId: rec.referenceId, note: S.blind ? "nach Sperre" : "Blindmodus aus" }); }
      grid.append(disagreementPanel(rec, vu));
    } else {
      prp.hidden = true; prp.classList.add("hidden"); prp.setAttribute("data-blind", "locked");
      grid.append(h("div", { class: "card", id: "pr-placeholder" }, [h("h3", { text: "Praktiker-Referenz (strukturiert)" }), h("div", { class: "blindbox" }, [
        h("p", { text: "Blindmodus: Die Praktiker-Referenz bleibt verborgen, bis die VU-Analyse angezeigt und mit „VU-Analyse sperren“ festgehalten wurde (Audit-Log)." }),
        h("p", { class: "note", text: "PRACTITIONER REFERENCE — keine objektive Wahrheit." })])]));
    }
    var outCard = h("div", { class: "card" }, [h("h3", { text: "Späterer Verlauf (Ergebnis, optional)" }),
      h("button", { class: "btn", type: "button", id: "btn-outcome", "aria-pressed": String(out), disabled: !visible ? true : null, text: out ? "Späteren Verlauf verbergen" : "Späteren Verlauf zeigen",
        onclick: function () { S.showOutcome[rec.referenceId] = !out; if (!out) audit({ action: "OUTCOME_SHOWN", caseId: rec.caseId, referenceId: rec.referenceId }); renderCompare(); } }),
      h("p", { class: "note", text: visible ? "Standardmäßig verborgen. Einzelfall-Anzeige; die Ergebnisstudie ist separat (§11). Keine Trefferquoten." : "Erst nach Sperre der VU-Analyse verfügbar." }),
      h("div", { id: "outcome-body" })]);
    grid.append(outCard);
    // Reihe laden und Chart zeichnen
    var sym = i.vuSymbol;
    if (!sym) { chartHost.replaceChildren(h("p", { class: "note", text: "Keine VU-Reihe (UNMAPPED) — Fall bleibt Kandidat und wird gezählt, aber nicht gerechnet (§6)." })); return; }
    loadSeries(sym).then(function (all) {
      if (S.curRefId !== rec.referenceId || !$("chart-host")) return;
      if (!all) { chartHost.replaceChildren(h("p", { class: "err", text: "VU-Reihe " + sym + " nicht gefunden (multi-asset/series bzw. discover-series-long/ref_" + sym + ")." })); return; }
      var cs = caseSeries(rec, all);
      if (!cs.before.length) { chartHost.replaceChildren(h("p", { class: "err", text: "Keine Kurse bis Stichtag " + rec.analysisCutoff + "." })); return; }
      chartHost.replaceChildren(chart(rec, cs, vu, visible, out));
      $("series-note").textContent = "Quelle: " + cs.source + (cs.attribution ? " · " + cs.attribution : "") + " · " + cs.before.length + " Bars bis Stichtag, letzter Schluss " + f(cs.before[cs.before.length - 1][1]) + (cs.notes.length ? " · " + cs.notes.join(" ") : "") + (levelScale(rec) === null && visible ? " · Praktiker-Niveaus nicht eingezeichnet (Proxy ohne levelScale)" : "");
      if (out) $("outcome-body").replaceChildren(outcomeView(rec, cs, vu));
    });
  }
  function vuPanel(rec, vu, isLocked) {
    var card = h("div", { class: "card", id: "vu-panel" }, [h("h3", { text: "VU-Analyse (elliott-3.2.2)" })]);
    var bench = benchFor(rec), busy = S.vuBusy[rec.referenceId];
    if (!vu) {
      card.append(h("p", { class: "note", text: bench ? "Eingefrorener Benchmark-Lauf vorhanden (" + bench._file + ")." : "Kein Benchmark-Lauf für diesen Fall. Live-Berechnung im Browser möglich: die Engine sieht nur die VU-Reihe bis zum Stichtag, keine Praktikerangaben." }),
        h("button", { class: "btn primary", type: "button", id: "btn-show-vu", disabled: busy || !(rec.instrument && rec.instrument.vuSymbol) && !bench ? true : null, text: busy ? "berechne …" : bench ? "VU-Analyse anzeigen (Benchmark)" : "VU-Analyse anzeigen (live berechnen)", onclick: function () { showVu(rec); } }));
      if (!(rec.instrument && rec.instrument.vuSymbol) && !bench) card.append(h("p", { class: "note", text: "Ohne VU-Reihe gibt es keine VU-Analyse; Sperren ist trotzdem möglich (dokumentiert „nicht verfügbar“)." }));
      if (S.vu["err:" + rec.referenceId]) card.append(h("p", { class: "err", text: S.vu["err:" + rec.referenceId] }));
    } else {
      card.append(h("p", {}, [h("span", { class: "tag " + (vu.origin === "BENCHMARK" ? "good" : "warn"), text: vu.origin === "BENCHMARK" ? "eingefrorener Benchmark-Lauf" : "Live-Berechnung — nicht der eingefrorene Benchmark-Lauf" }),
        vu.engineVersion && vu.engineVersion !== EXPECTED_ENGINE ? h("span", { class: "tag bad", text: "Engine " + vu.engineVersion + " ≠ " + EXPECTED_ENGINE }) : null]));
      if (vu.skipped) card.append(h("p", { class: "warntext", text: "Benchmark: " + vu.skipped }));
      card.append(kv([["Engine", vu.engineVersion], ["Stand", vu.asOf], ["Status", vu.status], ["Muster", (vu.patternName || vu.pattern || "keine Zählung") + (vu.family ? " · " + vu.family : "")],
        ["Laufende Welle", vu.currentWave ? vu.currentWave + (vu.role ? " · " + vu.role : "") + (vu.curDir ? " · " + vu.curDir : "") : "–"], ["Nächste Bewegung", vu.nextMove], ["Grad", vu.degree],
        ["Invalidierung", vu.invalidation && vu.invalidation.price !== undefined ? f(vu.invalidation.price) + " " + (vu.invalidation.direction || "") : vu.revision ? "keine (Revision jenseits " + f(vu.revision.price) + " " + vu.revision.direction + ")" : "–"],
        ["Zielzonen", (vu.targetZones || []).map(function (z) { return f(z[0]) + "–" + f(z[1]); }).join("; ")],
        ["Anwendbarkeit", vu.applicability ? vu.applicability.level + (vu.applicability.abstain ? " (enthält sich)" : "") : "–"], ["Mehrdeutigkeit", vu.ambiguity],
        ["Alternativen", (vu.alternatives || []).map(function (a) { return [a.pattern, a.wave, a.next].filter(Boolean).join(" · "); }).join("; ")]]));
      if (vu.applicability && vu.applicability.reasons && vu.applicability.reasons.length) card.append(h("p", { class: "note", text: "Gründe: " + vu.applicability.reasons.join("; ") }));
    }
    var canLock = !isLocked && (vu || !(rec.instrument && rec.instrument.vuSymbol) && !bench);
    card.append(h("div", { class: "actions" }, [h("button", { class: "btn warn", type: "button", id: "btn-lock", disabled: canLock ? null : true, text: isLocked ? "VU-Analyse gesperrt ✓" : "VU-Analyse sperren", onclick: function () { lockVu(rec, vu); } })]),
      h("p", { class: "note", text: isLocked ? "Gesperrt (Audit-Log). Die VU-Analyse wurde vor dem Blick auf die Praktiker-Referenz festgehalten." : !S.blind ? "Blindmodus ist aus — die Sperre wird trotzdem protokolliert." : "Erst anzeigen, dann sperren. Danach wird die Praktiker-Referenz sichtbar." }));
    return card;
  }
  function showVu(rec) {
    var bench = benchFor(rec);
    if (bench) { S.vu[rec.referenceId] = summarizeBench(bench); audit({ action: "VU_SHOWN", caseId: rec.caseId, referenceId: rec.referenceId, note: "benchmark:" + bench._file }); renderCompare(); return; }
    S.vuBusy[rec.referenceId] = true; delete S.vu["err:" + rec.referenceId]; renderCompare();
    setTimeout(function () {
      runLive(rec).then(function (vu) { S.vu[rec.referenceId] = vu; audit({ action: "VU_SHOWN", caseId: rec.caseId, referenceId: rec.referenceId, note: "live:" + vu.engineVersion }); })
        .catch(function (e) { S.vu["err:" + rec.referenceId] = "VU-Analyse nicht möglich: " + e.message; })
        .then(function () { S.vuBusy[rec.referenceId] = false; renderCompare(); });
    }, 30);
  }
  function lockVu(rec, vu) {
    var code = me().code;
    if (!CODE_RE.test(code || "")) { setMsg("Bitte oben einen pseudonymen Code eingeben (2–24 Zeichen A–Z, 0–9, _ -), damit die Sperre protokolliert werden kann.", "err"); $("t-code").focus(); return; }
    var payload = vu ? C.canonical(Object.assign({}, vu, { waves: (vu.waves || []).length })) : "VU_NOT_AVAILABLE";
    sha256(payload).then(function (hash) { audit({ action: "LOCK_VU", caseId: rec.caseId, referenceId: rec.referenceId, hash: hash, note: vu ? vu.origin + " " + (vu.engineVersion || "") : "VU nicht verfügbar" }); setMsg("VU-Analyse gesperrt (" + hash.slice(0, 18) + "…).", "ok"); renderCompare(); });
  }
  function zonesText(list) { return (list || []).map(function (z) { return f(z.low) + "–" + f(z.high) + (z.label ? " (" + z.label + ")" : ""); }).join("; "); }
  function practitionerPanel(rec, c) {
    var p = rec.primary, x = rec.extraction || {}, pub = rec.publication || {}, i = rec.instrument || {}, reg = S.registry.filter(function (s) { return s.id === rec.sourceId; })[0];
    var v = C.validateRecord(S.schema, rec, {});
    var out = [h("h3", { text: "Praktiker-Referenz (strukturiert)" }), h("p", {}, [h("span", { class: "banner", text: "PRACTITIONER REFERENCE — keine objektive Wahrheit" })]),
      h("p", {}, [x.confidence === "LOW" ? h("span", { class: "tag bad", text: "LOW – nicht benchmarkfähig" }) : h("span", { class: "tag", text: "Sicherheit " + (x.confidence || "–") }),
        x.method === "LLM_DRAFT_UNREVIEWED" ? h("span", { class: "tag bad", text: "LLM_DRAFT_UNREVIEWED – zählt nie" }) : h("span", { class: "tag", text: x.method || "–" }), h("span", { class: "tag", text: rec.status })]),
      kv([["Quelle", rec.sourceId + (reg ? " · Stufe " + (reg.tier || "–") : "") + " · " + rec.sourceType], ["Veröffentlicht", pub.timestamp + " · " + pub.timestampPrecision + " · " + pub.timezone + (pub.basis ? " · " + pub.basis : "")],
        ["Nachträglich bearbeitet", (pub.editedAfterPublication || "–") + (pub.editNote ? " · " + pub.editNote : "")],
        ["Instrument", i.asShown + " · " + i.instrumentType + " · " + (i.priceAdjustment || "–") + " → " + (i.vuSymbol || "UNMAPPED") + " (" + i.mappingQuality + (typeof i.levelScale === "number" ? ", ×" + i.levelScale : "") + ")"],
        ["Zeitrahmen / Schule", rec.timeframe + " · " + rec.elliottSchool], ["Primär", p ? [p.pattern, p.family, p.degreeLabel, p.degreeRank !== null && p.degreeRank !== undefined ? "Rang " + p.degreeRank : null, p.currentWave ? "Welle " + p.currentWave : null, p.currentWaveRole, p.state].filter(Boolean).join(" · ") : "keine Primärzählung"],
        p && (p.waveStartDate || p.waveStartPrice) ? ["Wellenstart", f(p.waveStartDate) + " @ " + f(p.waveStartPrice)] : null,
        ["Richtung ab jetzt (A1)", rec.directionalBias], ["Bewegung nach laufender Welle (A2)", (rec.primary && rec.primary.nextMoveAfterCurrent) || "–"], ["Strukturelles Szenario", rec.structuralScenario],
        ["Invalidation", rec.invalidation ? f(rec.invalidation.price) + " " + (rec.invalidation.direction || "") + " · " + (rec.invalidation.basis || "") : "–"],
        ["Unterstützung", zonesText(rec.keySupportZones)], ["Einstieg", zonesText(rec.entryZones)], ["Ziele", zonesText(rec.targetZones)],
        ["Alternativen", (rec.alternatives || []).map(function (a) { return [a.pattern, a.currentWave, a.directionalBias, a.trigger !== null && a.trigger !== undefined ? "Trigger " + f(a.trigger) : null, a.note].filter(Boolean).join(" · "); }).join(" | ")],
        ["Eigene Kurzfassung", rec.commentarySummary], ["Unklarheiten", (x.ambiguities || []).join("; ")], ["Extraktion", (x.extractor || "–") + (x.secondPass ? " · Zweitextraktion " + x.secondPass : "")]]),
      h("h4", { text: "Belege (Fundstellen)" }), h("ul", { class: "msgs" }, (rec.evidence || []).map(function (e) { return h("li", { text: e.field + (e.locator ? " @ " + e.locator : "") + ": " + e.note }); })),
      rec.sourceUrl ? h("p", {}, [h("a", { href: rec.sourceUrl, rel: "noopener noreferrer nofollow", target: "_blank", text: "Originalfundstelle öffnen" })]) : null];
    if (v.errors.length || v.warnings.length) out.push(h("h4", { text: "Prüfung" }), msgList(v.errors, v.warnings));
    if (c && c.second.length) out.push(h("p", { class: "note", text: "Zweitextraktion vorhanden: " + c.second.map(function (s) { return s.record.referenceId; }).join(", ") + " (Diff unter „Zweitextraktion“)." }));
    return out;
  }
  function disagreementPanel(rec, vu) {
    var card = h("div", { class: "card", id: "disagree-panel" }, [h("h3", { text: "Abweichungen VU ↔ Praktiker" })]), cmp = cmpFor(rec);
    var NAMES = { A: "A Richtung des Szenarios", B: "B Musterfamilie", C: "C laufende Welle", D: "D Grad exakt", E: "E Grad ±1", F: "F Primärzählung gleich", G: "G Primär- oder Alternativzählung gleich", K: "K laufend vs. bestätigt", S: "S strukturelles Szenario" };
    var DE = { MATCH: "gleich", MISMATCH: "abweichend", NOT_COMPARABLE: "nicht vergleichbar" };
    if (cmp) {
      var m = cmp.metrics || {}, reasons = Object.keys(NAMES).filter(function (k) { return m[k] === "MISMATCH"; }).map(function (k) { return NAMES[k]; });
      if (cmp.sDetail && m.S === "MISMATCH") reasons.push("S-Detail: nächste Bewegung " + (DE[cmp.sDetail.nextMove] || "–") + ", Rolle " + (DE[cmp.sDetail.role] || "–") + ", übergeordnete Richtung " + (DE[cmp.sDetail.impliedTrend] || "–"));
      if (cmp.H && cmp.H.result === "COMPUTED") reasons.push("H Invalidation: Abstand " + f(cmp.H.pct, 2) + " %" + (cmp.H.atr !== null && cmp.H.atr !== undefined ? " (" + f(cmp.H.atr, 2) + " ATR)" : "") + (cmp.H.sameSide === false ? ", andere Seite" : ""));
      if (cmp.I && cmp.I.result === "COMPUTED") reasons.push("I Zielzonen: " + (cmp.I.anyOverlap ? "überlappen" : "keine Überlappung") + ", nächste Mitten " + f(cmp.I.nearestCenterPct, 2) + " %");
      card.append(h("h4", { text: "Aus dem Benchmark-Lauf (" + cmp._file.replace(/^benchmark\//, "") + ") · Kategorie " + (cmp.category || "–") }),
        reasons.length ? h("ul", { class: "msgs", id: "disagree-reasons" }, reasons.map(function (r) { return h("li", { text: r }); })) : h("p", { class: "note", text: "Keine abweichenden Kennzahlen (oder nicht vergleichbar)." }),
        h("div", { class: "tablewrap" }, [h("table", {}, [h("thead", {}, [h("tr", {}, [h("th", { text: "Kennzahl" }), h("th", { text: "dieser Fall" })])]),
          h("tbody", {}, Object.keys(NAMES).filter(function (k) { return k in m; }).map(function (k) { return h("tr", {}, [h("td", { text: NAMES[k] }), h("td", { class: m[k] === "MATCH" ? "EQUAL" : m[k] === "MISMATCH" ? "DIFF" : "BOTH_EMPTY", text: DE[m[k]] || String(m[k]) })]); })
            .concat(cmp.J ? [h("tr", {}, [h("td", { text: "J Anwendbarkeit" }), h("td", { text: (cmp.J.vuApplicability || "–") + (cmp.J.vuAbstain ? " · Enthaltung (eigenes Ergebnis, nicht falsch)" : "") })])] : []))])]));
    } else card.append(h("p", { class: "note", text: "Kein Benchmark-Ergebnis für diesen Fall (benchmark/comparison.json fehlt oder enthält ihn nicht — nur Fälle mit Status INCLUDED werden gerechnet)." }));
    if (vu && !cmp) {
      var rows = [], sc = levelScale(rec), p = rec.primary || {};
      /* A1: Bewegung ab jetzt (laufende Welle) vs. VU-Richtung der laufenden Welle; A2: Bewegung nach der laufenden Welle vs. VU nextMove
         (Red-Team C1: nicht vermischen). Seitwärts hat VU nicht → n/a. */
      var cmpDir = function (a, b) { return !a || a === "UNKNOWN" || !b ? "n/a" : a === "SIDEWAYS" ? "nicht vergleichbar (VU kennt kein seitwärts)" : a === b ? "gleich" : "abweichend"; };
      rows.push(["A1 Richtung ab jetzt", rec.directionalBias, vu.curDir || "–", cmpDir(rec.directionalBias, vu.curDir)]);
      rows.push(["A2 Bewegung nach laufender Welle", p.nextMoveAfterCurrent || "–", vu.nextMove || "–", vu.role === "COMPLETE" ? "n/a" : cmpDir(p.nextMoveAfterCurrent, vu.nextMove)]);
      rows.push(["B Familie", p.family || "–", vu.family || "–", !p.family || p.family === "UNKNOWN" || !vu.family ? "n/a" : p.family === vu.family ? "gleich" : "abweichend"]);
      rows.push(["C Rolle laufende Welle", p.currentWaveRole || "–", vu.role || "–", !p.currentWaveRole || p.currentWaveRole === "UNKNOWN" || !vu.role || vu.role === "COMPLETE" ? "n/a" : p.currentWaveRole === vu.role ? "gleich" : "abweichend"]);
      var pi = rec.invalidation && sc !== null ? rec.invalidation.price * sc : null, vi = vu.invalidation ? vu.invalidation.price : null;
      rows.push(["H Invalidation", pi !== null ? f(pi) : "–", vi !== null && vi !== undefined ? f(vi) : "–", pi !== null && typeof vi === "number" ? "Abstand " + f(Math.abs(pi - vi) / vi * 100, 1) + " %" : "n/a"]);
      rows.push(["J Anwendbarkeit", "–", vu.applicability ? vu.applicability.level + (vu.applicability.abstain ? " (enthält sich)" : "") : "–", vu.applicability && vu.applicability.abstain ? "Enthaltung (eigenes Ergebnis, nicht falsch)" : "–"]);
      card.append(h("h4", { text: "Vorläufiger Einzelfall-Abgleich (lokal; maßgeblich ist der Benchmark-Lauf)" }), h("div", { class: "tablewrap" }, [h("table", {}, [h("thead", {}, [h("tr", {}, ["Kennzahl", "Praktiker", "VU", "Befund"].map(function (t) { return h("th", { text: t }); }))]),
        h("tbody", {}, rows.map(function (r) { return h("tr", {}, r.map(function (t) { return h("td", { text: String(t) }); })); }))])]),
        h("p", { class: "note", text: "Abweichung bedeutet nicht, dass eine Seite falsch ist. Keine Trefferquoten, keine Rankings." }));
    }
    return card;
  }
  function outcomeView(rec, cs, vu) {
    var a = cs.after, last = cs.before[cs.before.length - 1][1], hz = cs.weekly ? [4, 13, 26] : [20, 60, 120], win = a.slice(0, hz[2]);
    if (!a.length) return h("p", { class: "note", text: "Keine Kurse nach dem Stichtag in der VU-Reihe." });
    var mx = Math.max.apply(null, win.map(function (p) { return p[1]; })), mn = Math.min.apply(null, win.map(function (p) { return p[1]; }));
    var sc = levelScale(rec);
    function firstCross(level, dir) { if (typeof level !== "number" || !dir) return "–"; for (var i = 0; i < a.length; i++) { if (dir === "below" ? a[i][1] < level : a[i][1] > level) return "Schluss " + (dir === "below" ? "unter" : "über") + " " + f(level) + " am " + a[i][0]; } return "bisher nicht (Schlusskurs)"; }
    function firstTouch(z) { var zl = Math.min(z[0], z[1]), zh = Math.max(z[0], z[1]), prev = last; for (var i = 0; i < a.length; i++) { if (Math.min(prev, a[i][1]) <= zh && Math.max(prev, a[i][1]) >= zl) return a[i][0]; prev = a[i][1]; } return "bisher nicht (Schlusskurs)"; }
    var rows = hz.map(function (n) { return ["Rendite nach " + n + (cs.weekly ? " Wochen" : " Handelstagen"), a[n - 1] ? pct(a[n - 1][1] / last - 1) : "–"]; });
    rows.push(["max. hoch / tief (" + hz[2] + " Bars)", pct(mx / last - 1) + " / " + pct(mn / last - 1)]);
    rows.push(["Praktiker-Invalidation", sc === null ? "nicht vergleichbar (Proxy ohne levelScale)" : rec.invalidation ? firstCross(rec.invalidation.price * sc, rec.invalidation.direction) : "–"]);
    (rec.targetZones || []).forEach(function (z, i) { rows.push(["Praktiker-Ziel " + (i + 1), sc === null ? "nicht vergleichbar" : "erste Berührung: " + firstTouch([z.low * sc, z.high * sc])]); });
    if (vu && vu.invalidation) rows.push(["VU-Invalidierung", firstCross(vu.invalidation.price, vu.invalidation.direction)]);
    return h("div", {}, [kv(rows), h("p", { class: "note", text: "Schlusskurse der VU-Reihe; Intraday-Reihenfolge unbekannt. Einzelfall — kein Urteil über Praktiker oder Engine." })]);
  }

  // ------------------------------------------------------------------ Formular
  function opt(values, labels) { return values.map(function (v, i) { return { v: v, l: labels ? labels[i] : v }; }); }
  function control(id, spec, val) {
    var e;
    if (spec.type === "select") { e = h("select", { id: id }); (spec.empty === false ? [] : [{ v: "", l: "—" }]).concat(spec.options).forEach(function (o) { var op = h("option", { value: o.v, text: o.l }); if (String(val === undefined ? "" : val) === String(o.v)) op.selected = true; e.append(op); }); }
    else if (spec.type === "textarea") { e = h("textarea", { id: id, rows: spec.rows || 3, maxlength: spec.max || null, placeholder: spec.ph || null, spellcheck: "true" }); e.value = val || ""; }
    else if (spec.type === "checkbox") { e = h("input", { type: "checkbox", id: id }); e.checked = !!val; }
    else { e = h("input", { id: id, type: spec.type || "text", inputmode: spec.num ? "decimal" : null, placeholder: spec.ph || null, list: spec.list || null, readonly: spec.ro ? true : null, autocomplete: "off", spellcheck: "false", maxlength: spec.max || null }); e.value = val === undefined || val === null ? "" : val; }
    if (spec.required) e.setAttribute("aria-required", "true");
    return e;
  }
  function field(pre, key, label, spec, val) {
    var id = pre + key, c = control(id, spec, val);
    if (spec.type === "checkbox") return h("div", {}, [h("label", { for: id }, [c, document.createTextNode(" " + label)])]);
    return h("div", {}, [h("label", { for: id, text: label + (spec.required ? " *" : "") }), c, spec.help ? h("p", { class: "note", id: id + "-help", text: spec.help }) : null]);
  }
  function repeatable(pre, key, title, cols, addLabel, rows) {
    var wrap = h("div", { id: pre + key, "data-rep": key }), list = h("div", {});
    function addRow(vals) {
      vals = vals || {}; var n = list.children.length, rid = pre + key + "-" + Date.now().toString(36) + n;
      var row = h("div", { class: "rep-row", "data-row": "1" }, cols.map(function (c) { var id = rid + "-" + c.k, ctl = control(id, c, vals[c.k]); ctl.setAttribute("data-k", c.k); return h("div", {}, [h("label", { for: id, text: c.l }), ctl]); }).concat([
        h("button", { class: "btn small", type: "button", text: "Entfernen", "aria-label": title + ": Zeile entfernen", onclick: function () { row.remove(); wrap.dispatchEvent(new Event("input", { bubbles: true })); } })]));
      list.append(row);
    }
    (rows || []).forEach(addRow);
    wrap.append(list, h("button", { class: "btn small", type: "button", id: pre + key + "-add", text: addLabel, onclick: function () { addRow({}); wrap.dispatchEvent(new Event("input", { bubbles: true })); } }));
    wrap._read = function () { return Array.from(list.querySelectorAll("[data-row]")).map(function (r) { var o = {}; r.querySelectorAll("[data-k]").forEach(function (c) { o[c.getAttribute("data-k")] = c.value; }); return o; }); };
    return h("fieldset", {}, [h("legend", { text: title }), wrap]);
  }
  var E = C.ENUMS;
  var ZONE_COLS = [{ k: "low", l: "unten", num: true }, { k: "high", l: "oben", num: true }, { k: "label", l: "Bezeichnung" }];

  /* mode: "first" (Erfassung) | "second" (blinde Zweitextraktion; fixe Fundstelle, keine Erstwerte) */
  function buildForm(pre, mode, st, fixed) {
    st = st || {}; fixed = fixed || {};
    var second = mode === "second";
    var regOpts = S.registry.map(function (s) { return { v: s.id, l: s.id + (s.name && s.name !== s.id ? " · " + s.name : "") + (s.tier ? " · Stufe " + s.tier : "") }; }).concat([{ v: "__other", l: "andere Quelle (frei eintragen)" }]);
    var srcInReg = st.sourceId && S.registry.some(function (s) { return s.id === st.sourceId; });
    var form = h("form", { id: pre + "form", novalidate: true, "aria-describedby": pre + "intro" });
    var dl = h("datalist", { id: pre + "syms" }, MULTI_ASSET.map(function (s) { return h("option", { value: s }); }));
    var dlTz = h("datalist", { id: pre + "tzs" }, TZS.map(function (s) { return h("option", { value: s }); }));
    var dlBasis = h("datalist", { id: pre + "basis" }, ["Plattform-Metadaten (Upload-Zeit)", "Artikelkopf", "X-Zeitstempel", "Archiv-Schnappschuss", "RSS-Feed"].map(function (s) { return h("option", { value: s }); }));
    form.append(dl, dlTz, dlBasis);
    var src = h("fieldset", {}, [h("legend", { text: "Quelle" }),
      h("div", { class: "row2" }, [
        field(pre, "sourceSel", "Quelle (source-registry.json)", { type: "select", options: regOpts, required: true, help: S.registry.length ? null : "Quellenverzeichnis noch nicht vorhanden — Quelle frei eintragen." }, srcInReg ? st.sourceId : st.sourceId ? "__other" : ""),
        field(pre, "sourceOther", "sourceId (frei, falls nicht im Verzeichnis)", { ph: "z. B. hkcm-youtube" }, srcInReg ? "" : st.sourceId)]),
      h("div", { class: "row2" }, [field(pre, "sourceType", "Quellentyp", { type: "select", options: opt(E.sourceType), required: true }, st.sourceType), field(pre, "sourceUrl", "URL der Originalfundstelle", { type: "url", required: true, ph: "Adresse der Originalfundstelle" }, st.sourceUrl)]),
      field(pre, "crossPosts", "Cross-Posts derselben Analyse (je Zeile eine URL; kein eigener Fall)", { type: "textarea", rows: 2 }, st.crossPosts),
      second ? null : h("div", { class: "row3" }, [field(pre, "version", "Fassung (version)", { type: "number", required: true }, st.version || 1), field(pre, "viewKind", "Art", { type: "select", options: opt(E.viewKind) }, st.viewKind || "ORIGINAL_PUBLISHED"), field(pre, "revisionOf", "revisionOf (referenceId der Vorfassung)", {}, st.revisionOf)]),
      second ? null : field(pre, "caseIdOverride", "caseId (leer = automatisch; Cross-Posts teilen die caseId)", { ph: "sourceId|VU-Symbol|Datum|s1" }, st.caseIdOverride || "")]);
    var pub = h("fieldset", {}, [h("legend", { text: "Veröffentlichung (Zeitstempel mit Zeitzone)" }),
      h("div", { class: "row3" }, [field(pre, "localDateTime", "Datum/Uhrzeit (Ortszeit der Quelle)", { type: "datetime-local", required: true }, st.localDateTime || (st.timestamp ? String(st.timestamp).slice(0, 16) : "")),
        field(pre, "timezone", "Zeitzone (IANA)", { list: pre + "tzs", required: true, ph: "Europe/Berlin" }, st.timezone || ""), field(pre, "precision", "Genauigkeit", { type: "select", options: opt(E.precision), required: true }, st.precision)]),
      h("div", { class: "row3" }, [field(pre, "timestampBasis", "Herkunft des Zeitstempels", { list: pre + "basis", required: true }, st.timestampBasis), field(pre, "edited", "Nach Veröffentlichung bearbeitet", { type: "select", options: opt(E.edited), empty: false }, st.edited || "UNKNOWN"), field(pre, "editNote", "Notiz zur Bearbeitung", {}, st.editNote)]),
      h("p", { class: "note", id: pre + "iso", role: "status" })]);
    var ins = h("fieldset", {}, [h("legend", { text: "Instrument & Stichtag" }),
      h("div", { class: "row3" }, [field(pre, "asShown", "Instrument wie gezeigt", { required: true, ph: "z. B. S&P 500 Cash, NQ1!, QQQ" }, st.asShown), field(pre, "instrumentType", "Instrumenttyp", { type: "select", options: opt(E.instrumentType), required: true }, st.instrumentType), field(pre, "priceAdjustment", "Bereinigung", { type: "select", options: opt(E.priceAdjustment), empty: false }, st.priceAdjustment || "UNKNOWN")]),
      h("div", { class: "row3" }, [field(pre, "vuSymbol", "VU-Reihe (leer = nicht abbildbar)", { list: pre + "syms", ph: "SPY, QQQ, BTCUSD, AAPL …", help: "multi-asset/series/<SYM> (täglich) oder discover-series-long/ref_<T> (wöchentlich)" }, st.vuSymbol), field(pre, "mappingQuality", "Abbildungsgüte", { type: "select", options: opt(E.mappingQuality), required: true }, st.mappingQuality), field(pre, "levelScale", "levelScale (nur Proxy, z. B. SPX→SPY 0,1)", { num: true }, st.levelScale)]),
      h("div", { class: "row3" }, [field(pre, "timeframe", "Zeitrahmen", { type: "select", options: opt(E.timeframe), required: true }, st.timeframe), field(pre, "market", "Handelsschluss für Stichtag", { type: "select", options: [{ v: "auto", l: "automatisch" }].concat(Object.keys(C.MARKETS).map(function (k) { return { v: k, l: C.MARKETS[k].label }; })), empty: false }, st.market || "auto"),
        field(pre, "analysisCutoff", "analysisCutoff (berechnet, nicht von Hand)", { ro: true }, st.analysisCutoff)]),
      h("p", { class: "note", id: pre + "cutrule", role: "status" }),
      h("div", { class: "row2" }, [field(pre, "windowStart", "Elliott-Passage Start (mm:ss, Video)", { ph: "12:30" }, st.windowStart), field(pre, "windowEnd", "Elliott-Passage Ende (mm:ss)", { ph: "18:05" }, st.windowEnd)])]);
    var ell = h("fieldset", {}, [h("legend", { text: "Elliott-Zählung (Primär)" }),
      h("div", { class: "row2" }, [field(pre, "elliottSchool", "Elliott-Schule", { type: "select", options: opt(E.elliottSchool), required: true }, st.elliottSchool), field(pre, "noPrimary", "keine Primärzählung angegeben (primary = null)", { type: "checkbox" }, st.noPrimary)]),
      h("div", { class: "row3", id: pre + "primary-fields" }, [field(pre, "pPattern", "Muster", { type: "select", options: opt(E.pattern) }, st.pPattern), field(pre, "pFamily", "Familie", { type: "select", options: opt(E.family) }, st.pFamily), field(pre, "pDegreeLabel", "Gradlabel wie gezeigt", { ph: "(iii), [C], Primary 4" }, st.pDegreeLabel),
        field(pre, "pDegreeRank", "degreeRank (normalisiert)", { type: "select", options: C.DEGREE_RANKS.map(function (d) { return { v: String(d.v), l: d.label }; }) }, st.pDegreeRank), field(pre, "pCurrentWave", "laufende Welle", { ph: "3, C, iv" }, st.pCurrentWave), field(pre, "pRole", "Rolle laufende Welle", { type: "select", options: opt(E.role) }, st.pRole),
        field(pre, "pState", "Zustand", { type: "select", options: opt(E.state) }, st.pState), field(pre, "pNextAfter", "Bewegung nach der laufenden Welle (A2)", { type: "select", options: opt(E.bias) }, st.pNextAfter), field(pre, "pWaveStartDate", "Wellenstart Datum", { type: "date" }, st.pWaveStartDate), field(pre, "pWaveStartPrice", "Wellenstart Kurs", { num: true }, st.pWaveStartPrice)])]);
    var alts = repeatable(pre, "alternatives", "Alternativen", [{ k: "pattern", l: "Muster", type: "select", options: opt(E.pattern) }, { k: "currentWave", l: "laufende Welle" }, { k: "directionalBias", l: "Richtung", type: "select", options: opt(E.bias) }, { k: "trigger", l: "Trigger (Kurs)", num: true }, { k: "note", l: "Notiz" }], "+ Alternative", st.alternatives);
    var scen = h("fieldset", {}, [h("legend", { text: "Szenario & Invalidation" }),
      h("div", { class: "row2" }, [field(pre, "directionalBias", "Richtung ab jetzt (A1, meist die laufende Welle)", { type: "select", options: opt(E.bias), required: true }, st.directionalBias), field(pre, "structuralScenario", "Strukturelles Szenario (eigene Kurzform)", { ph: "übergeordnet aufwärts; Korrektur läuft; Fortsetzung oberhalb X" }, st.structuralScenario)]),
      h("div", { class: "row3" }, [field(pre, "invPrice", "Invalidation (Kurs, Praktiker-Skala)", { num: true }, st.invPrice), field(pre, "invDirection", "Richtung", { type: "select", options: opt(E.invDirection) }, st.invDirection), field(pre, "invBasis", "Basis", { type: "select", options: opt(E.invBasis) }, st.invBasis)])]);
    var zs = [repeatable(pre, "supportZones", "Unterstützungszonen (keySupportZones)", ZONE_COLS, "+ Unterstützung", st.supportZones), repeatable(pre, "entryZones", "Einstiegszonen (entryZones)", ZONE_COLS, "+ Einstieg", st.entryZones), repeatable(pre, "targetZones", "Zielzonen (targetZones)", ZONE_COLS, "+ Ziel", st.targetZones)];
    var sum = h("fieldset", {}, [h("legend", { text: "Eigene Kurzfassung" }), h("p", { class: "reminder", text: "Keine Zitate/Transkripte — nur eigene Worte, höchstens 400 Zeichen. Keine fremden Screenshots." }),
      field(pre, "summary", "commentarySummary", { type: "textarea", rows: 3, max: 400 }, st.summary), h("p", { class: "counter", id: pre + "counter", "aria-live": "polite" })]);
    var ev = repeatable(pre, "evidence", "Belege (Fundstelle je Feld) *", [{ k: "field", l: "Feld", type: "select", options: opt(C.EVIDENCE_FIELDS) }, { k: "locator", l: "Locator (mm:ss / Absatz / Bild)" }, { k: "note", l: "Notiz (≤ 200, eigene Worte)", max: 200 }], "+ Beleg", st.evidence && st.evidence.length ? st.evidence : [{}]);
    var ext = h("fieldset", {}, [h("legend", { text: "Extraktion" }),
      h("div", { class: "row3" }, [field(pre, "confidence", "Extraktionssicherheit", { type: "select", options: opt(E.confidence), required: true }, st.confidence), field(pre, "method", "Methode", { type: "select", options: opt(E.method), required: true }, st.method || "HUMAN_FROM_PRIMARY"), field(pre, "extractor", "Extraktor (Code oben)", { ro: true }, me().code)]),
      field(pre, "ambiguities", "Unklarheiten (je Zeile eine; Text ≠ Chart usw.)", { type: "textarea", rows: 2 }, st.ambiguities),
      second ? h("p", { class: "note", text: "Zweitextraktion: status = EXCLUDED, exclusionReason = SECOND_PASS (zählt nie als eigener Fall)." }) : h("div", { class: "row3" }, [
        field(pre, "referenceQuality", "Referenzqualität", { type: "select", options: opt(E.referenceQuality) }, st.referenceQuality), field(pre, "status", "Status", { type: "select", options: opt(E.status), empty: false }, st.status || "CANDIDATE"), field(pre, "split", "Split (vom Skript vergeben)", { type: "select", options: opt(E.split), empty: false }, st.split || "UNASSIGNED")]),
      second ? null : field(pre, "exclusionReason", "Ausschlussgrund (bei EXCLUDED)", {}, st.exclusionReason)]);
    var checks = h("div", { id: pre + "checks", role: "status", "aria-live": "polite" });
    var preview = h("pre", { class: "line", id: pre + "preview", "aria-label": "JSONL-Vorschau" });
    var actions = h("div", { class: "actions" }, [
      h("button", { class: "btn primary", type: "submit", id: pre + "save", text: second ? "Zweitextraktion speichern" : "Lokal speichern" }),
      h("button", { class: "btn", type: "button", id: pre + "copy", text: "JSONL-Zeile kopieren", onclick: function () { var r = api.record(); copyText(C.toJsonlLine(r)); audit({ action: "COPY_LINE", referenceId: r.referenceId, caseId: r.caseId }); } }),
      h("button", { class: "btn", type: "button", id: pre + "dl", text: "JSONL-Zeile herunterladen", onclick: function () { var v = api.check(); if (!v.ok) { setMsg("Nicht exportiert: Fehler beheben.", "err"); return; } download(v.record.referenceId + ".jsonl", C.toJsonl([v.record]), "application/x-ndjson"); audit({ action: "EXPORT_LINE", referenceId: v.record.referenceId, caseId: v.record.caseId }); } }),
      second ? null : h("button", { class: "btn", type: "button", id: pre + "reset", text: "Formular leeren", onclick: function () { renderCapture({}); } })]);
    form.append(src, pub, ins, ell, alts, scen, h("div", {}, zs), sum, ev, ext, h("h4", { text: "Prüfung (Schema practitioner-reference-1.1.0 + Protokoll)" }), checks, h("h4", { text: "JSONL-Zeile (für references.jsonl)" }), preview, actions);
    var lastSym = null, series = null, cutClose = null;
    function g(k) { var e = $(pre + k); if (!e) return undefined; return e.type === "checkbox" ? e.checked : e.value; }
    function state() {
      var sel = g("sourceSel"), s = {
        sourceId: second ? fixed.sourceId : sel && sel !== "__other" ? sel : g("sourceOther"), sourceType: g("sourceType"), sourceUrl: g("sourceUrl"), crossPosts: g("crossPosts"),
        version: second ? fixed.version : g("version"), viewKind: second ? "ORIGINAL_PUBLISHED" : g("viewKind"), revisionOf: second ? "" : g("revisionOf"), caseId: second ? fixed.caseId : g("caseIdOverride"),
        localDateTime: g("localDateTime"), timezone: g("timezone"), precision: g("precision"), timestampBasis: g("timestampBasis"), edited: g("edited"), editNote: g("editNote"),
        asShown: g("asShown"), instrumentType: g("instrumentType"), priceAdjustment: g("priceAdjustment"), vuSymbol: (g("vuSymbol") || "").trim().toUpperCase(), mappingQuality: g("mappingQuality"), levelScale: g("levelScale"),
        timeframe: g("timeframe"), analysisCutoff: g("analysisCutoff"), windowStart: g("windowStart"), windowEnd: g("windowEnd"), elliottSchool: g("elliottSchool"), noPrimary: g("noPrimary"),
        pPattern: g("pPattern"), pFamily: g("pFamily"), pDegreeLabel: g("pDegreeLabel"), pDegreeRank: g("pDegreeRank"), pCurrentWave: g("pCurrentWave"), pRole: g("pRole"), pState: g("pState"), pNextAfter: g("pNextAfter"), pWaveStartDate: g("pWaveStartDate"), pWaveStartPrice: g("pWaveStartPrice"),
        alternatives: $(pre + "alternatives")._read(), directionalBias: g("directionalBias"), structuralScenario: g("structuralScenario"),
        supportZones: $(pre + "supportZones")._read(), entryZones: $(pre + "entryZones")._read(), targetZones: $(pre + "targetZones")._read(),
        invPrice: g("invPrice"), invDirection: g("invDirection"), invBasis: g("invBasis"), summary: g("summary"), evidence: $(pre + "evidence")._read(),
        confidence: g("confidence"), method: g("method"), extractor: me().code, ambiguities: g("ambiguities"), referenceQuality: second ? "" : g("referenceQuality"),
        status: second ? "EXCLUDED" : g("status"), exclusionReason: second ? "" : g("exclusionReason"), split: second ? "UNASSIGNED" : g("split"),
        secondPassOf: second ? fixed.firstPassId : null, secondPassRef: second ? "" : st.secondPassRef || ""
      };
      if (s.precision === "DAY" && s.localDateTime) s.localDateTime = s.localDateTime.slice(0, 10) + "T00:00";
      s.timestamp = s.localDateTime && C.validTz(s.timezone) ? C.localToIso(s.localDateTime, s.timezone) : "";
      return s;
    }
    function derive() {
      var s = state();
      // Stichtag (§5) — mit Handelstagen der VU-Reihe, sobald geladen
      var mk = g("market") === "auto" ? C.guessMarket(s.instrumentType, s.vuSymbol, s.asShown) : g("market");
      var dates = series ? series.points.map(function (p) { return p[0]; }) : null;
      var cut = s.timestamp && s.precision ? C.computeCutoff({ timestamp: s.timestamp, precision: s.precision, timezone: s.timezone, market: mk, timeframe: s.timeframe, dates: dates }) : { date: null, rule: "Zeitstempel, Zeitzone und Genauigkeit angeben." };
      $(pre + "analysisCutoff").value = cut.date || ""; s.analysisCutoff = cut.date || "";
      $(pre + "cutrule").textContent = "Stichtag-Regel (" + C.MARKETS[mk].label + "): " + cut.rule + ". Maßgeblich bleibt scripts/technical/practitioner/cutoff.mjs.";
      $(pre + "iso").textContent = s.timestamp ? "ISO-Zeitstempel: " + s.timestamp : s.timezone && !C.validTz(s.timezone) ? "Zeitzone unbekannt: " + s.timezone : "";
      cutClose = null; if (series && cut.date) { var pts = series.points.filter(function (p) { return p[0] <= cut.date; }); if (pts.length) cutClose = pts[pts.length - 1][1]; }
      if (s.vuSymbol !== lastSym) { lastSym = s.vuSymbol; series = null; if (s.vuSymbol) loadSeries(s.vuSymbol).then(function (all) { if (lastSym === s.vuSymbol) { series = all; $(pre + "cutrule").dataset.series = all ? all.source : "missing"; derive(); } }); }
      var sumLen = (g("summary") || "").length, ctr = $(pre + "counter"); ctr.textContent = sumLen + " / 400 Zeichen"; ctr.className = "counter" + (sumLen > 400 ? " over" : "");
      $(pre + "primary-fields").style.opacity = s.noPrimary ? 0.4 : 1;
      return s;
    }
    var api = {
      el: form,
      record: function () { return C.buildRecord(derive()); },
      check: function () {
        var s = derive(), r = C.buildRecord(s), ctx = { cutoffClose: cutClose };
        if (second) ctx.firstPass = fixed.firstRecord;
        var v = C.validateRecord(S.schema, r, ctx);
        if (!me().code) v.errors.unshift("Oben einen pseudonymen Code eingeben (wird extraction.extractor).");
        if (s.vuSymbol && series === null && lastSym === s.vuSymbol) v.warnings.push("VU-Reihe wird geladen bzw. fehlt — Stichtag ggf. ohne Handelskalender.");
        if (!second) { var dupe = allRefs().filter(function (x) { return x.record.referenceId === r.referenceId; })[0]; if (dupe && dupe.record.sourceUrl !== r.sourceUrl) v.errors.push("referenceId " + r.referenceId + " gehört zu einer anderen URL — version erhöhen oder caseId anpassen."); else if (dupe) v.warnings.push("referenceId " + r.referenceId + " existiert bereits (" + dupe.origin + ") — Speichern ersetzt nur lokale Zeilen; sonst version erhöhen."); }
        if (!second) { var col = C.classifyImport(r, allRefs().map(function (x) { return x.record; }).filter(function (x) { return x.referenceId !== r.referenceId; })); if (col.kind === "COLLISION_CASE" || col.kind === "COLLISION_URL") v.warnings.push("Möglicher Doppelfall (" + col.kind + ") mit " + col.other + " — Cross-Post/Revision prüfen."); }
        var reg = S.registry.filter(function (x) { return x.id === r.sourceId; })[0]; if (reg && reg.tier === "REJECT") v.warnings.push("Quelle ist im Verzeichnis als REJECT eingestuft.");
        if (second && sawFirstPass(r.caseId, me().code)) v.warnings.push("Mit diesem Code wurde die Erstextraktion bereits angesehen — Zweitextraktion ist nicht blind (wird im Audit-Log vermerkt).");
        v.ok = !v.errors.length; v.record = r;
        $(pre + "checks").replaceChildren(v.errors.length || v.warnings.length ? msgList(v.errors, v.warnings) : h("p", { class: "ok", text: "Schema und Protokollregeln erfüllt." }),
          h("p", { class: v.benchmarkEligible && v.ok ? "ok" : "warntext", text: v.ok ? (v.benchmarkEligible ? "Benchmarkfähig (sofern Status INCLUDED nach Prüfung)." : "Gültige Zeile, aber nicht benchmarkfähig (LOW, LLM_DRAFT_UNREVIEWED, EXCLUDED oder Zweitextraktion).") : "Nicht exportierbar, solange Fehler bestehen." }));
        $(pre + "preview").textContent = C.toJsonlLine(r);
        return v;
      }
    };
    var tmr = null;
    form.addEventListener("input", function () { clearTimeout(tmr); tmr = setTimeout(api.check, 120); });
    form.addEventListener("change", function (ev) {
      if (ev.target && ev.target.id === pre + "pPattern" && !g("pFamily") && C.FAMILY_OF[g("pPattern")]) $(pre + "pFamily").value = C.FAMILY_OF[g("pPattern")];
      if (ev.target && ev.target.id === pre + "sourceSel") { var reg = S.registry.filter(function (x) { return x.id === g("sourceSel"); })[0]; if (reg && /^[ABC]$/.test(reg.tier || "") && $(pre + "referenceQuality") && !g("referenceQuality")) $(pre + "referenceQuality").value = reg.tier; if (reg && reg.type && E.sourceType.indexOf(reg.type) >= 0 && !g("sourceType")) $(pre + "sourceType").value = reg.type; }
      if (ev.target && (ev.target.id === pre + "asShown" || ev.target.id === pre + "instrumentType") && !g("vuSymbol")) {
        var key = String(g("asShown") || "").toUpperCase().replace(/[^A-Z0-9]/g, ""), it = g("instrumentType");
        var hit = S.instrumentMap.filter(function (en) { return (en.aliases || []).some(function (a) { return String(a).toUpperCase().replace(/[^A-Z0-9]/g, "") === key; }) && (!it || !en.instrumentTypes || en.instrumentTypes.indexOf(it) >= 0); })[0];
        if (hit && hit.vuSymbol) { $(pre + "vuSymbol").value = hit.vuSymbol; if (hit.mappingQuality) $(pre + "mappingQuality").value = hit.mappingQuality; $(pre + "levelScale").value = hit.levelScale === null || hit.levelScale === undefined ? "" : String(hit.levelScale);
          if (hit.market) $(pre + "market").value = C.MARKETS[hit.market] ? hit.market : "auto";
          setMsg("Instrument-Map: " + hit.id + " → " + hit.vuSymbol + " (" + hit.mappingQuality + ") vorgeschlagen — bitte prüfen.", "note"); }
      }
      if (ev.target && ev.target.id === pre + "vuSymbol" && !g("vuSymbol") && $(pre + "mappingQuality")) $(pre + "mappingQuality").value = "UNMAPPED";
      api.check();
    });
    if (second) ["sourceSel", "sourceOther", "sourceType", "sourceUrl"].forEach(function (k) { var e = form.querySelector("#" + pre + k); if (e) { if (k === "sourceSel") { e.value = S.registry.some(function (s) { return s.id === fixed.sourceId; }) ? fixed.sourceId : "__other"; } if (k === "sourceOther") e.value = S.registry.some(function (s) { return s.id === fixed.sourceId; }) ? "" : fixed.sourceId; if (k === "sourceType") e.value = fixed.sourceType; if (k === "sourceUrl") e.value = fixed.sourceUrl; e.setAttribute("disabled", ""); } });
    form.addEventListener("submit", function (ev) { ev.preventDefault(); if (second) saveSecond(api, fixed); else saveFirst(api, st); });
    return api;
  }
  function saveFirst(api, st) {
    var v = api.check();
    if (!v.ok) { setMsg("Nicht gespeichert: " + v.errors.length + " Fehler (siehe Prüfung).", "err"); var c = document.querySelector("#cap-checks"); if (c) c.scrollIntoView({ block: "nearest" }); return; }
    var r = v.record, L = locals(), i = L.findIndex(function (x) { return x.record.referenceId === r.referenceId; });
    if (i < 0 && S.repoRefs.some(function (x) { return x.referenceId === r.referenceId; })) { setMsg("referenceId " + r.referenceId + " steht schon in references.jsonl — bitte version erhöhen (neue Fassung).", "err"); return; }
    var entry = { record: r, savedAt: new Date().toISOString() };
    if (i >= 0) L[i] = entry; else L.push(entry);
    if (!saveLocals(L)) { setMsg("Speichern im Browser nicht möglich (privater Modus?). Bitte sofort als JSONL herunterladen.", "err"); return; }
    sha256(C.canonical(r)).then(function (hash) { audit({ action: "SAVE", referenceId: r.referenceId, caseId: r.caseId, hash: hash, note: "first-pass" + (i >= 0 ? " (ersetzt)" : "") }); });
    setMsg("Lokal gespeichert: " + r.referenceId + (v.warnings.length ? " · " + v.warnings.length + " Hinweis(e)" : "") + ". Export über „Export JSONL“.", "ok");
    S.curRefId = r.referenceId;
  }
  function saveSecond(api, fixed) {
    var v = api.check();
    if (!v.ok) { setMsg("Zweitextraktion nicht gespeichert: " + v.errors.length + " Fehler.", "err"); return; }
    var r = v.record, L = locals(), i = L.findIndex(function (x) { return x.record.referenceId === r.referenceId; });
    var entry = { record: r, savedAt: new Date().toISOString() }; if (i >= 0) L[i] = entry; else L.push(entry);
    var blind = !sawFirstPass(r.caseId, me().code);
    // Erstfassung verknüpfen, falls lokal
    var j = L.findIndex(function (x) { return x.record.referenceId === fixed.firstPassId; }), linked = false;
    if (j >= 0) { var fr = JSON.parse(JSON.stringify(L[j].record)); fr.extraction.secondPass = r.referenceId; L[j] = { record: fr, savedAt: new Date().toISOString() }; linked = true; }
    saveLocals(L);
    sha256(C.canonical(r)).then(function (hash) { audit({ action: "SAVE_SECOND_PASS", referenceId: r.referenceId, caseId: r.caseId, hash: hash, note: (blind ? "blind" : "NICHT BLIND") + (linked ? "; secondPass in Erstfassung gesetzt" : "; Erstfassung im Repo — secondPass per Skript setzen") }); });
    setMsg("Zweitextraktion gespeichert" + (linked ? " und mit der Erstfassung verknüpft." : ". Erstfassung liegt im Repo: extraction.secondPass dort per Skript/neuer Zeile setzen."), "ok");
    showDiff(fixed.firstPassId, r.referenceId);
  }

  // ------------------------------------------------------------------ Tabs
  var TABS = ["compare", "capture", "second", "data"];
  function selectTab(t) {
    S.tab = t;
    TABS.forEach(function (k) { var b = $("tab-" + k), p = $("panel-" + k); var on = k === t; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; p.hidden = !on; });
    if (t === "compare") renderCompare(); else if (t === "capture") { if (!S.forms.cap) renderCapture({}); } else if (t === "second") renderSecond(); else renderData();
  }
  function renderCapture(st) {
    var panel = $("panel-capture"); panel.replaceChildren();
    panel.append(h("div", { class: "card" }, [h("h3", { text: "Referenz erfassen" }), h("p", {}, [h("span", { class: "banner", text: "PRACTITIONER REFERENCE — keine objektive Wahrheit" }), document.createTextNode(" "), h("span", { class: "banner internal", text: "INTERN – nicht für Kunden" })]),
      h("p", { class: "note", id: "cap-intro", text: "Nur strukturierte Angaben aus der öffentlich zugänglichen Originalfundstelle (§2, §7). Unklare Felder bleiben leer bzw. UNKNOWN — nichts ergänzen. Keine Zitate, Transkripte, Screenshots, Logos. Der Stichtag wird aus dem Zeitstempel berechnet. Pflichtfelder sind mit * markiert." })]));
    var api = buildForm("cap-", "first", st);
    S.forms.cap = api; panel.append(h("div", { class: "card" }, [api.el])); api.check();
  }
  function renderSecond() {
    var panel = $("panel-second"); panel.replaceChildren();
    var firsts = firstPassRefs();
    panel.append(h("div", { class: "card" }, [h("h3", { text: "Blinde Zweitextraktion (Doppelextraktion §7)" }),
      h("p", { class: "note", text: "Dieselbe Fundstelle unabhängig ein zweites Mal extrahieren — ohne die Erstextraktion zu sehen. Gezeigt werden nur Quelle und URL. Nach dem Speichern erscheint der Feld-für-Feld-Vergleich. Der Code muss sich vom Erstextraktor unterscheiden. Auswahl der Fälle laut Protokoll: zufällig, Seed 20261004 (≥ 25 %)." })]));
    if (!firsts.length) { panel.append(h("div", { class: "card empty" }, [h("p", { text: "Noch keine Erstextraktionen vorhanden — erst über „Referenz erfassen“ eine Referenz anlegen." })])); return; }
    var sel = h("select", { id: "sp-case" }, [h("option", { value: "", text: "— Fall wählen —" })].concat(firsts.map(function (x) { var r = x.record; return h("option", { value: r.referenceId, text: r.caseId + " · " + r.sourceUrl }); })));
    var host = h("div", { id: "sp-host" });
    panel.append(h("div", { class: "card" }, [h("label", { for: "sp-case", text: "Fall (nur Fundstelle sichtbar)" }), sel, h("div", { class: "actions" }, [h("button", { class: "btn primary", type: "button", id: "sp-start", text: "Zweitextraktion beginnen", onclick: function () {
      var fr = findRef(sel.value); if (!fr) { setMsg("Bitte einen Fall wählen.", "err"); return; }
      if (!CODE_RE.test(me().code || "")) { setMsg("Bitte oben einen pseudonymen Code eingeben.", "err"); return; }
      var r = fr.record;
      if (r.extraction && r.extraction.extractor === me().code) { setMsg("Zweitextraktion muss von einer anderen Person (anderer Code) stammen.", "err"); return; }
      audit({ action: "SECOND_PASS_START", caseId: r.caseId, referenceId: r.referenceId, note: sawFirstPass(r.caseId, me().code) ? "NICHT BLIND (Erstfassung bereits gesehen)" : "blind" });
      var api = buildForm("sp-", "second", {}, { firstPassId: r.referenceId, firstRecord: r, caseId: r.caseId, sourceId: r.sourceId, sourceType: r.sourceType, sourceUrl: r.sourceUrl, version: r.version });
      S.forms.sp = api; host.replaceChildren(h("div", { class: "card" }, [h("h3", { text: "Zweitextraktion · " + r.caseId }), h("p", {}, [h("a", { href: r.sourceUrl, rel: "noopener noreferrer nofollow", target: "_blank", text: "Originalfundstelle öffnen" })]), api.el])); api.check();
    } })])]), host);
    var pairs = allRefs().filter(function (x) { return C.isSecondPass(x.record); });
    if (pairs.length) panel.append(h("div", { class: "card" }, [h("h3", { text: "Vorhandene Doppelextraktionen" }), h("ul", { class: "msgs" }, pairs.map(function (x) { var fid = C.firstPassIdOf(x.record); return h("li", {}, [document.createTextNode(fid + " ↔ " + x.record.referenceId + " "), h("button", { class: "btn small", type: "button", text: "Diff anzeigen", onclick: function () { showDiff(fid, x.record.referenceId); } })]); }))]), h("div", { id: "sp-diff" }));
    else panel.append(h("div", { id: "sp-diff" }));
  }
  function showDiff(firstId, secondId) {
    var a = findRef(firstId), b = findRef(secondId), host = $("sp-diff") || $("sp-host");
    if (!a || !b) { setMsg("Erst- oder Zweitfassung nicht gefunden (" + firstId + ").", "err"); return; }
    var d = C.diffRecords(a.record, b.record);
    audit({ action: "DIFF_SHOWN", caseId: a.record.caseId, referenceId: secondId, note: d.agree + "/" + d.compared + " gleich/nahe" });
    var card = h("div", { class: "card", id: "diff-card" }, [h("h3", { text: "Feldvergleich Erst- vs. Zweitextraktion" }),
      h("p", {}, [h("span", { class: "tag good", text: d.agree + " gleich/nahe" }), h("span", { class: "tag bad", text: d.differ + " abweichend" }), h("span", { class: "tag", text: d.compared + " verglichen" })]),
      h("p", { class: "note", text: "Erst: " + firstId + " (" + (a.record.extraction.extractor || "–") + ") · Zweit: " + secondId + " (" + (b.record.extraction.extractor || "–") + "). NAHE = Zahl ±0,5 % bzw. gleiches Label ohne Klammern. Abweichungen → manuelle Prüfung (§7)." }),
      h("div", { class: "tablewrap" }, [h("table", {}, [h("thead", {}, [h("tr", {}, ["Feld", "Erstextraktion", "Zweitextraktion", "Befund"].map(function (t) { return h("th", { text: t }); }))]),
        h("tbody", {}, d.rows.map(function (r) { return h("tr", {}, [h("td", { text: r.field }), h("td", { text: r.a }), h("td", { text: r.b }), h("td", { class: r.status, text: { EQUAL: "gleich", CLOSE: "nahe", DIFF: "abweichend", BOTH_EMPTY: "beide leer", TEXT: "Freitext (manuell)" }[r.status] })]); }))])])]);
    host.replaceChildren(card); card.scrollIntoView({ block: "start" });
  }

  // ------------------------------------------------------------------ Daten, Export/Import, Audit
  function download(name, text, type) { var blob = new Blob([text], { type: type }), url = URL.createObjectURL(blob), l = h("a", { href: url, download: name }); document.body.append(l); l.click(); l.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); }
  function stamp() { return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19); }
  function copyText(t) { (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { setMsg("JSONL-Zeile kopiert.", "ok"); }).catch(function () { setMsg("Kopieren nicht möglich — Zeile aus der Vorschau markieren.", "warntext"); }); }
  function exportJsonl() {
    var L = locals().map(function (x) { return x.record; }), bad = [];
    var good = L.filter(function (r) { var v = C.validateRecord(S.schema, r, {}); if (!v.ok) bad.push(r.referenceId); return v.ok; });
    var text = C.toJsonl(good);
    download("practitioner-references-" + stamp() + ".jsonl", text, "application/x-ndjson");
    audit({ action: "EXPORT_JSONL", note: good.length + " Zeilen" + (bad.length ? ", " + bad.length + " ungültig ausgelassen" : "") });
    setMsg("Export: " + good.length + " Zeile(n)" + (bad.length ? " · " + bad.length + " ungültige ausgelassen (" + bad.join(", ") + ")" : "") + ". An references.jsonl anhängen.", bad.length ? "warntext" : "ok");
    return text;
  }
  function importJsonl(text, name, allowCollisions) {
    var parsed = C.parseJsonl(text), L = locals(), report = [];
    parsed.errors.forEach(function (e) { report.push({ line: e.line, id: "–", kind: "PARSE_ERROR", action: "abgelehnt", note: e.msg }); });
    parsed.records.forEach(function (x) {
      var r = x.record, existing = allRefs().map(function (y) { return y.record; }).concat(L.map(function (y) { return y.record; }));
      var v = C.validateRecord(S.schema, r, {});
      if (!v.ok) { report.push({ line: x.line, id: r.referenceId || "–", kind: "INVALID", action: "abgelehnt", note: v.errors.slice(0, 3).join(" · ") }); return; }
      var cl = C.classifyImport(r, existing), take = cl.kind === "NEW" || cl.kind === "REVISION" || cl.kind === "SECOND_PASS" || (allowCollisions && (cl.kind === "COLLISION_CASE" || cl.kind === "COLLISION_URL"));
      if (take) { L.push({ record: r, savedAt: new Date().toISOString(), importedFrom: name }); }
      report.push({ line: x.line, id: r.referenceId, kind: cl.kind, action: take ? "übernommen" : "übersprungen", note: (cl.other ? "vgl. " + cl.other : "") + (v.warnings.length ? (cl.other ? " · " : "") + v.warnings.length + " Hinweis(e)" : "") });
      audit({ action: take ? "IMPORT" : "IMPORT_SKIPPED", referenceId: r.referenceId, caseId: r.caseId, note: cl.kind + " " + (name || "") });
    });
    saveLocals(L);
    var tot = report.reduce(function (a, r) { a[r.action] = (a[r.action] || 0) + 1; return a; }, {});
    setMsg("Import " + (name || "") + ": " + (tot["übernommen"] || 0) + " übernommen · " + (tot["übersprungen"] || 0) + " übersprungen (Duplikat/Kollision) · " + (tot.abgelehnt || 0) + " abgelehnt", "ok");
    S.lastImport = report;
    return report;
  }
  function renderData() {
    var panel = $("panel-data"); panel.replaceChildren();
    var L = locals();
    var allow = h("input", { type: "checkbox", id: "imp-allow" });
    var paste = h("textarea", { id: "imp-text", class: "line", rows: 4, placeholder: "JSONL-Zeilen hier einfügen …", spellcheck: "false" });
    panel.append(h("div", { class: "card" }, [h("h3", { text: "Import (JSONL, eine Referenz je Zeile)" }),
      h("p", { class: "note", text: "Duplikaterkennung: gleiche referenceId (identisch → übersprungen, abweichend → Konflikt), gleiche caseId oder URL unter anderer referenceId → möglicher Doppelfall (Cross-Post/Revision prüfen). Zweitextraktionen (-p2) und Revisionen (revisionOf) werden übernommen." }),
      h("label", { for: "imp-allow" }, [allow, document.createTextNode(" Kollisionen (gleiche caseId/URL) trotzdem übernehmen")]),
      h("label", { for: "imp-text", text: "JSONL einfügen" }), paste,
      h("div", { class: "actions" }, [h("button", { class: "btn primary", type: "button", id: "imp-run", text: "Eingefügte Zeilen importieren", onclick: function () { importJsonl(paste.value, "eingefügt", allow.checked); renderData(); } })]),
      S.lastImport ? h("div", { class: "tablewrap" }, [h("table", { id: "imp-report" }, [h("thead", {}, [h("tr", {}, ["Zeile", "referenceId", "Einordnung", "Aktion", "Notiz"].map(function (t) { return h("th", { text: t }); }))]),
        h("tbody", {}, S.lastImport.map(function (r) { return h("tr", {}, [r.line, r.id, r.kind, r.action, r.note].map(function (t) { return h("td", { text: String(t) }); })); }))])]) : null]));
    panel.append(h("div", { class: "card" }, [h("h3", { text: "Lokale Referenzen (" + L.length + ")" }),
      h("p", { class: "note", text: "Repo-Datei references.jsonl: " + S.repoStatus + ". Lokale Zeilen bleiben in diesem Browser, bis sie exportiert und an references.jsonl angehängt werden." }),
      h("div", { class: "actions" }, [h("button", { class: "btn primary", type: "button", id: "data-export", text: "Alle gültigen lokalen Zeilen als JSONL exportieren", onclick: exportJsonl })]),
      L.length ? h("div", { class: "tablewrap" }, [h("table", {}, [h("thead", {}, [h("tr", {}, ["referenceId", "caseId", "Status", "Sicherheit", "gespeichert", ""].map(function (t) { return h("th", { text: t }); }))]),
        h("tbody", {}, L.map(function (x) { var r = x.record; return h("tr", {}, [h("td", { text: r.referenceId }), h("td", { text: r.caseId }), h("td", { text: r.status + (C.isSecondPass(r) ? " (Zweitextraktion)" : "") }), h("td", { text: r.extraction ? r.extraction.confidence : "–" }), h("td", { text: (x.savedAt || "").slice(0, 16) }),
          h("td", {}, [C.isSecondPass(r) ? null : h("button", { class: "btn small", type: "button", text: "Bearbeiten", onclick: function () { audit({ action: "EDIT_LOAD", referenceId: r.referenceId, caseId: r.caseId }); var st = C.recordToState(r); st.caseIdOverride = r.caseId; st.localDateTime = (r.publication.timestamp || "").slice(0, 16); renderCapture(st); selectTab("capture"); } }),
            document.createTextNode(" "), h("button", { class: "btn small", type: "button", text: "Zeile kopieren", onclick: function () { copyText(C.toJsonlLine(r)); } }),
            document.createTextNode(" "), h("button", { class: "btn small", type: "button", text: "Löschen", onclick: function () { if (!window.confirm("Lokale Zeile " + r.referenceId + " löschen? (Audit-Log bleibt)")) return; saveLocals(locals().filter(function (y) { return y.record.referenceId !== r.referenceId; })); audit({ action: "DELETE_LOCAL", referenceId: r.referenceId, caseId: r.caseId }); renderData(); } })])]); }))])]) : h("p", { class: "note", text: "Keine lokalen Referenzen." })]));
    var A = auditLog();
    panel.append(h("div", { class: "card" }, [h("h3", { text: "Audit-Log (lokal, " + A.length + " Einträge)" }), h("p", { class: "note", text: "Protokolliert u. a. VU_SHOWN, LOCK_VU, PRACTITIONER_SHOWN, OUTCOME_SHOWN, BLIND_OFF/ON, SAVE, SAVE_SECOND_PASS, DIFF_SHOWN, IMPORT, EXPORT. Nur pseudonyme Codes." }),
      h("div", { class: "tablewrap" }, [h("table", { id: "audit-table" }, [h("thead", {}, [h("tr", {}, ["#", "Zeit", "Aktion", "Code", "Fall", "Referenz", "Notiz"].map(function (t) { return h("th", { text: t }); }))]),
        h("tbody", {}, A.slice(-200).reverse().map(function (e) { return h("tr", {}, [e.seq, (e.at || "").replace("T", " ").slice(0, 19), e.action, e.code || "–", e.caseId || "–", e.referenceId || "–", (e.note || "") + (e.hash ? " " + e.hash.slice(0, 18) + "…" : "")].map(function (t) { return h("td", { text: String(t) }); })); }))])])]));
  }
  function csvCell(v) { v = v === null || v === undefined ? "" : String(v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function exportAudit() { var cols = ["seq", "at", "action", "code", "caseId", "referenceId", "hash", "note"]; download("practitioner-audit-" + stamp() + ".csv", [cols.join(",")].concat(auditLog().map(function (e) { return cols.map(function (k) { return csvCell(e[k]); }).join(","); })).join("\n") + "\n", "text/csv"); }

  // ------------------------------------------------------------------ Start
  function toolbar() {
    var code = $("t-code"), blind = $("t-blind");
    code.value = me().code || ""; blind.checked = true; S.blind = true;
    code.addEventListener("change", function () {
      var v = code.value.trim();
      if (v && (!CODE_RE.test(v) || /@/.test(v))) { setMsg("Code: nur 2–24 Zeichen A–Z, 0–9, _ - (pseudonym, keine Namen/E-Mails).", "err"); return; }
      lsSet(KEY_U, { code: v }); setMsg(v ? "Aktiv: " + v : "", "note");
      Object.keys(S.forms).forEach(function (k) { var e = $(k + "-extractor"); if (e && S.forms[k]) { e.value = v; S.forms[k].check(); } });
      if (S.tab === "compare") renderCompare(); else if (S.tab === "second" && !S.forms.sp) renderSecond(); else if (S.tab === "data") renderData();
    });
    blind.addEventListener("change", function () { S.blind = blind.checked; audit({ action: S.blind ? "BLIND_ON" : "BLIND_OFF", note: "Umschalter" }); document.body.setAttribute("data-blind", S.blind ? "on" : "off"); if (S.tab === "compare") renderCompare(); });
    $("t-exp-jsonl").addEventListener("click", exportJsonl);
    $("t-exp-audit").addEventListener("click", exportAudit);
    $("t-imp").addEventListener("change", function (ev) { var fl = ev.target.files[0]; if (!fl) return; fl.text().then(function (t) { importJsonl(t, fl.name, false); ev.target.value = ""; selectTab("data"); }); });
    $("t-bench").addEventListener("change", function (ev) {
      var files = Array.from(ev.target.files || []); if (!files.length) return;
      Promise.all(files.map(function (fl) { return fl.text().then(function (t) { try { return [fl.name, normBench(JSON.parse(t), "lokal:" + fl.name)]; } catch (e) { return [fl.name, -1]; } }); })).then(function (res) {
        res.forEach(function (r) { audit({ action: "BENCH_LOADED", note: r[0] + (r[1] < 0 ? " (kein JSON)" : " (" + r[1] + " Zeilen)") }); });
        setMsg("Benchmark geladen: " + res.map(function (r) { return r[0] + (r[1] < 0 ? " – kein JSON" : ": " + r[1]); }).join(", "), res.some(function (r) { return r[1] > 0; }) ? "ok" : "warntext");
        S.vu = {}; status(); if (S.tab === "compare") renderCompare(); ev.target.value = "";
      });
    });
    var tabs = TABS.map(function (k) { return $("tab-" + k); });
    tabs.forEach(function (b, i) {
      b.addEventListener("click", function () { selectTab(TABS[i]); });
      b.addEventListener("keydown", function (ev) { var j = ev.key === "ArrowRight" ? (i + 1) % tabs.length : ev.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length : ev.key === "Home" ? 0 : ev.key === "End" ? tabs.length - 1 : -1; if (j < 0) return; ev.preventDefault(); selectTab(TABS[j]); tabs[j].focus(); });
    });
  }
  function status() {
    $("data-status").textContent = [S.schema ? "Schema " + C.SCHEMA_ID + " geladen" : "Schema NICHT geladen (Export gesperrt)", "Quellenverzeichnis: " + S.registryStatus, "references.jsonl: " + S.repoStatus,
      "Benchmark: " + (S.bench.files.length ? S.bench.files.join(", ") + (S.bench.engine ? " · Engine " + S.bench.engine : "") : "kein Lauf vorhanden"), "Instrument-Map: " + (S.instrumentMap.length ? S.instrumentMap.length + " Einträge" : "nicht vorhanden"), "Lokal: " + locals().length + " Referenz(en)"].join(" · ");
  }
  toolbar();
  document.body.setAttribute("data-blind", "on");
  Promise.all([
    fetchJson(PV1 + "schema/practitioner-reference-1.1.0.json").then(function (j) { S.schema = j; }).catch(function () { S.schema = null; }),
    fetchJson(PV1 + "source-registry.json").then(function (j) { S.registry = normRegistry(j); S.registryStatus = S.registry.length + " Quellen"; }).catch(function () { S.registryStatus = "noch nicht vorhanden"; }),
    fetchText(PV1 + "references.jsonl").then(function (t) { var p = C.parseJsonl(t); S.repoRefs = p.records.map(function (x) { return x.record; }).filter(function (r) { return r.referenceId && r.caseId; }); S.repoStatus = S.repoRefs.length + " Zeile(n)" + (p.errors.length ? ", " + p.errors.length + " unlesbar" : ""); }).catch(function () { S.repoStatus = "noch nicht vorhanden"; }),
    loadBench().catch(function () {}),
    fetchJson(PV1 + "instrument-map.json").then(function (j) { S.instrumentMap = Array.isArray(j.entries) ? j.entries : []; }).catch(function () {})
  ]).then(function () { status(); selectTab("compare"); document.body.setAttribute("data-ready", "1"); });

  /* Für automatisierte Tests (keine Praktikerdaten außerhalb des Browsers). */
  window.__practitionerPage = { state: S, importJsonl: importJsonl, exportJsonl: exportJsonl, locals: locals, auditLog: auditLog, selectTab: selectTab, form: function (k) { return S.forms[k || "cap"]; } };
})();
