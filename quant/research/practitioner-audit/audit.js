/* =========================================================================
   VISION UNIVERSE RESEARCH (INTERN) — practitioner-audit/audit.js

   Extraktions-Audit — blind, ohne VU-Ausgaben.
   PRACTITIONER REFERENCE — keine objektive Wahrheit. Intern – nicht für Kunden.

   Lädt human-audit/audit-pack.json (erzeugt von scripts/technical/practitioner/human-audit.mjs export),
   zeigt je Fall Quelle + extrahierte Felder, nimmt je Feld Urteil / korrigierten Wert / Notiz auf,
   speichert Entwürfe in localStorage (je packId) und exportiert CSV/JSON im Format, das
   `human-audit.mjs import` erwartet. Keine Netzwerkzugriffe außer dem Laden des Prüfpakets.
   Der reine Kern (VUAuditCore) ist ohne DOM nutzbar und wird in Node getestet.
   ========================================================================= */
(function (root) {
  "use strict";

  // ------------------------------------------------------------------ Kern (ohne DOM)
  var VERDICTS = ["CORRECT", "INCORRECT", "PARTIALLY_CORRECT", "UNKNOWN"];
  var CSV_COLUMNS = ["packId", "auditRowId", "caseId", "referenceId", "confidence", "field", "core", "extractedValue", "abAgreement", "sourceUrl", "evidence",
    "verdict", "correctedValue", "reviewerNote", "reviewerId", "reviewDate"];
  function csvCell(v) { var s = v === null || v === undefined ? "" : String(v); return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function emptyDraft() { return { reviewerId: "", reviewDate: "", rows: {}, current: 0 }; }
  /** Zeilen der Prüfung (eine je Feld je Fall) aus Paket + Entwurf. */
  function reviewRows(pack, draft) {
    var out = [];
    pack.cases.forEach(function (c) {
      c.auditRows.forEach(function (r) {
        var d = (draft && draft.rows && draft.rows[r.auditRowId]) || {};
        out.push({ packId: pack.packId, auditRowId: r.auditRowId, caseId: c.caseId, referenceId: c.referenceId, confidence: c.record.extraction.confidence,
          field: r.field, core: r.core ? "Y" : "N", extractedValue: r.extractedValue, abAgreement: r.abAgreement || "", sourceUrl: c.record.sourceUrl,
          evidence: (r.evidence || []).join(" | "), verdict: d.verdict || "", correctedValue: d.correctedValue || "", reviewerNote: d.reviewerNote || "",
          reviewerId: (draft && draft.reviewerId) || "", reviewDate: (draft && draft.reviewDate) || "" });
      });
    });
    return out;
  }
  function toCsv(pack, draft) {
    var rows = reviewRows(pack, draft);
    return "﻿" + [CSV_COLUMNS.join(",")].concat(rows.map(function (r) { return CSV_COLUMNS.map(function (k) { return csvCell(r[k]); }).join(","); })).join("\r\n") + "\r\n";
  }
  function toJson(pack, draft) {
    return JSON.stringify({ format: "vu-practitioner-human-audit-review-1", packId: pack.packId, reviewerId: (draft && draft.reviewerId) || "", reviewDate: (draft && draft.reviewDate) || "",
      rows: reviewRows(pack, draft).map(function (r) { return { auditRowId: r.auditRowId, extractedValue: r.extractedValue, verdict: r.verdict, correctedValue: r.correctedValue, reviewerNote: r.reviewerNote }; }) }, null, 1);
  }
  function parseCsv(text) {
    text = String(text).replace(/^﻿/, "");
    var first = text.split(/\r?\n/, 1)[0], delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
    var out = [], row = [], cell = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some(function (x) { return x !== ""; })) out.push(row); row = []; }
      else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); if (row.some(function (x) { return x !== ""; })) out.push(row); }
    if (!out.length) return [];
    var head = out[0].map(function (h) { return h.trim(); });
    return out.slice(1).map(function (r) { var o = {}; head.forEach(function (h, j) { o[h] = r[j] === undefined ? "" : r[j]; }); return o; });
  }
  /** Entwurf aus exportierter JSON/CSV wiederherstellen (nur Zeilen dieses Pakets). */
  function draftFromText(pack, text) {
    var t = String(text).replace(/^﻿/, ""), rows, meta = {};
    if (/^\s*\{/.test(t)) { var j = JSON.parse(t); rows = j.rows || []; meta = { packId: j.packId, reviewerId: j.reviewerId, reviewDate: j.reviewDate }; }
    else { rows = parseCsv(t); if (rows[0]) meta = { packId: rows[0].packId, reviewerId: rows[0].reviewerId, reviewDate: rows[0].reviewDate }; }
    if (meta.packId && meta.packId !== pack.packId) throw new Error("Datei gehört zu Prüfpaket " + meta.packId + ", geladen ist " + pack.packId);
    var known = {}; pack.cases.forEach(function (c) { c.auditRows.forEach(function (r) { known[r.auditRowId] = true; }); });
    var d = emptyDraft(); d.reviewerId = meta.reviewerId || ""; d.reviewDate = meta.reviewDate || "";
    var n = 0;
    rows.forEach(function (r) {
      if (!known[r.auditRowId]) return;
      var v = String(r.verdict || "").trim().toUpperCase();
      d.rows[r.auditRowId] = { verdict: VERDICTS.indexOf(v) >= 0 ? v : "", correctedValue: r.correctedValue || "", reviewerNote: r.reviewerNote || "" }; n++;
    });
    d.loaded = n;
    return d;
  }
  /** Prüft den Entwurf lokal (gleiche Grundregeln wie der Import; die genaue Wertprüfung macht der Import). */
  function draftProblems(pack, draft) {
    var p = [];
    if (!/^[A-Za-z0-9_-]{2,24}$/.test((draft && draft.reviewerId) || "")) p.push("Prüfer-Code fehlt/ungültig (2–24 Zeichen A–Z 0–9 _ -)");
    if (!/^\d{4}-\d{2}-\d{2}$/.test((draft && draft.reviewDate) || "")) p.push("Prüfdatum fehlt");
    var open = 0, incNoCorr = 0;
    pack.cases.forEach(function (c) { c.auditRows.forEach(function (r) { var d = draft.rows[r.auditRowId] || {}; if (!d.verdict) open++; if (d.verdict === "INCORRECT" && !String(d.correctedValue || "").trim()) incNoCorr++; }); });
    if (open) p.push(open + " Feld(er) ohne Urteil");
    if (incNoCorr) p.push(incNoCorr + "× INCORRECT ohne korrigierten Wert");
    return p;
  }
  function progress(pack, draft) {
    var n = 0, done = 0;
    pack.cases.forEach(function (c) { c.auditRows.forEach(function (r) { n++; if (draft.rows[r.auditRowId] && draft.rows[r.auditRowId].verdict) done++; }); });
    return { n: n, done: done };
  }
  var Core = { VERDICTS: VERDICTS, CSV_COLUMNS: CSV_COLUMNS, reviewRows: reviewRows, toCsv: toCsv, toJson: toJson, parseCsv: parseCsv, draftFromText: draftFromText, draftProblems: draftProblems, progress: progress, emptyDraft: emptyDraft };
  if (typeof module !== "undefined" && module.exports) module.exports = Core;
  root.VUAuditCore = Core;
  if (typeof document === "undefined") return;

  // ------------------------------------------------------------------ Seite
  var PACK_URL = "../../data/technical-intelligence/practitioner-v1/human-audit/audit-pack.json";
  var KEY = "vu-practitioner-human-audit-v1:";
  var S = { pack: null, draft: emptyDraft(), cur: 0 };

  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { var v = attrs[k]; if (v === null || v === undefined || v === false) return; if (k === "text") e.textContent = v; else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); });
    (kids || []).forEach(function (c) { if (c !== null && c !== undefined && c !== false) e.append(c); });
    return e;
  }
  function $(id) { return document.getElementById(id); }
  function kv(rows) { return h("dl", {}, [].concat.apply([], rows.filter(Boolean).map(function (r) { return [h("dt", { text: r[0] }), h("dd", {}, [r[1] instanceof Node ? r[1] : document.createTextNode(r[1] === null || r[1] === undefined || r[1] === "" ? "–" : String(r[1]))])]; }))); }
  function setMsg(t, cls) { var m = $("t-msg"); m.className = cls || "note"; m.textContent = t; }
  function save() {
    try { localStorage.setItem(KEY + S.pack.packId, JSON.stringify(S.draft)); return true; }
    catch (e) { setMsg("Entwurf konnte nicht gespeichert werden (localStorage nicht verfügbar) — bitte regelmäßig exportieren.", "err"); return false; }
  }
  function load() {
    try { var v = localStorage.getItem(KEY + S.pack.packId); if (v) { var d = JSON.parse(v); if (d && d.rows) return d; } } catch (e) { /* privat/gesperrt */ }
    return emptyDraft();
  }
  function download(name, text, type) {
    var a = h("a", { href: URL.createObjectURL(new Blob([text], { type: type })), download: name });
    document.body.append(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function caseState(c) {
    var done = 0, bad = false;
    c.auditRows.forEach(function (r) { var d = S.draft.rows[r.auditRowId]; if (d && d.verdict) done++; if (d && d.verdict === "INCORRECT") bad = true; });
    return { done: done, n: c.auditRows.length, bad: bad };
  }
  function renderProgress() {
    var p = progress(S.pack, S.draft);
    $("progress-bar").style.width = (p.n ? Math.round(100 * p.done / p.n) : 0) + "%";
    $("data-status").textContent = "Prüfpaket " + S.pack.packId + " · " + S.pack.cases.length + " Fälle · " + p.done + "/" + p.n + " Felder beurteilt · Datensatz " + S.pack.dataset.version + " (SHA-256 " + S.pack.dataset.sha256.slice(0, 12) + "…)";
  }
  function renderNav() {
    var nav = $("case-nav"); nav.textContent = "";
    S.pack.cases.forEach(function (c, i) {
      var st = caseState(c);
      nav.append(h("button", { type: "button", class: "case", "aria-current": i === S.cur ? "true" : "false", onclick: function () { go(i); } }, [
        document.createTextNode((i + 1) + ". " + c.caseId),
        h("small", { text: c.record.extraction.confidence + " · " + c.record.timeframe + " · " + st.done + "/" + st.n + (st.bad ? " · INCORRECT" : "") })
      ]));
    });
  }
  function go(i) { S.cur = Math.max(0, Math.min(S.pack.cases.length - 1, i)); S.draft.current = S.cur; save(); renderNav(); renderCase(); window.scrollTo(0, 0); }
  function fmt(v) { return v === null || v === undefined ? "–" : typeof v === "string" ? v : JSON.stringify(v); }

  function fieldBlock(c, r) {
    var d = S.draft.rows[r.auditRowId] || (S.draft.rows[r.auditRowId] = { verdict: "", correctedValue: "", reviewerNote: "" });
    var spec = (S.pack.fields || []).filter(function (f) { return f.field === r.field; })[0] || {};
    var fs = h("fieldset", { class: "af" + (r.core ? " core" : "") + (d.verdict ? (d.verdict === "INCORRECT" ? " bad" : " done") : "") });
    var name = "v-" + r.auditRowId;
    var verdicts = h("div", { class: "verdicts", role: "radiogroup", "aria-label": "Urteil " + r.label });
    function refresh() {
      fs.className = "af" + (r.core ? " core" : "") + (d.verdict ? (d.verdict === "INCORRECT" ? " bad" : " done") : "");
      Array.prototype.forEach.call(verdicts.querySelectorAll("label"), function (l) { l.className = l.getAttribute("data-v") === d.verdict ? "sel" : ""; });
      hint.textContent = d.verdict === "INCORRECT" && !d.correctedValue.trim() ? "Pflicht bei INCORRECT: Wert laut Quelle oder UNKNOWN" : "";
    }
    VERDICTS.forEach(function (v) {
      var id = name + "-" + v;
      var inp = h("input", { type: "radio", name: name, id: id, value: v, onchange: function () { d.verdict = v; save(); refresh(); renderProgress(); renderNav(); } });
      if (d.verdict === v) inp.checked = true;
      verdicts.append(h("label", { for: id, "data-v": v, title: (S.pack.verdictHelp || {})[v] || "" }, [inp, document.createTextNode(v)]));
    });
    var hint = h("div", { class: "err", role: "status" });
    var corr = h("textarea", { rows: "1", id: "c-" + r.auditRowId, placeholder: spec.format || "", oninput: function () { d.correctedValue = corr.value; save(); refresh(); } });
    corr.value = d.correctedValue || "";
    var note = h("textarea", { rows: "1", id: "n-" + r.auditRowId, maxlength: "400", oninput: function () { d.reviewerNote = note.value; save(); } });
    note.value = d.reviewerNote || "";
    fs.append(
      h("legend", { text: r.label + (r.core ? " · Kernfeld" : "") }),
      h("div", {}, [h("span", { class: "tag", text: r.field }), r.abAgreement ? h("span", { class: "tag " + (r.abAgreement === "AGREE" ? "good" : r.abAgreement === "DISAGREE" ? "bad" : "warn"), text: "A/B: " + r.abAgreement }) : null]),
      h("pre", { class: "val", text: r.extractedValue }),
      r.evidence && r.evidence.length ? h("ul", { class: "ev" }, r.evidence.map(function (e) { return h("li", { text: e }); })) : h("p", { class: "note", text: "Keine feldbezogene Fundstelle — siehe Fundstellen des Falls." }),
      verdicts,
      h("div", { class: "row2" }, [
        h("div", {}, [h("label", { for: "c-" + r.auditRowId, text: "Korrigierter Wert (" + (spec.format || "Text") + ")" }), corr]),
        h("div", {}, [h("label", { for: "n-" + r.auditRowId, text: "Notiz (eigene Worte, kein Zitat)" }), note])
      ]),
      hint
    );
    refresh();
    return fs;
  }
  function renderCase() {
    var c = S.pack.cases[S.cur], r = c.record, det = $("detail"); det.textContent = "";
    var pager = function () { return h("div", { class: "pager" }, [
      h("button", { class: "btn", type: "button", text: "← Vorheriger Fall", disabled: S.cur === 0 ? true : null, onclick: function () { go(S.cur - 1); } }),
      h("span", { class: "note", text: "Fall " + (S.cur + 1) + " von " + S.pack.cases.length }),
      h("button", { class: "btn", type: "button", text: "Nächster Fall →", disabled: S.cur === S.pack.cases.length - 1 ? true : null, onclick: function () { go(S.cur + 1); } })
    ]); };
    det.append(pager());
    det.append(h("div", { class: "card" }, [
      h("h2", { text: c.caseId }),
      h("h3", { text: "Quelle" }),
      kv([
        ["Praktiker / Quelle", c.source.practitioner + " (" + c.source.sourceId + ", " + c.source.sourceType + ")"],
        ["Quell-URL", h("a", { href: r.sourceUrl, target: "_blank", rel: "noopener noreferrer nofollow", text: r.sourceUrl })],
        r.crossPosts && r.crossPosts.length ? ["Weitere Fundstellen", r.crossPosts.map(fmt).join(", ")] : null,
        ["Veröffentlicht", r.publication.timestamp + " (" + r.publication.timestampPrecision + ", " + r.publication.timezone + "; " + r.publication.basis + ")"],
        ["Nach Veröffentlichung bearbeitet", r.publication.editedAfterPublication],
        ["Instrument", r.instrument.asShown + " → " + (r.instrument.vuSymbol || "nicht abbildbar") + " (" + r.instrument.mappingQuality + ")"],
        ["Zeitrahmen", r.timeframe],
        ["referenceId / Aufteilung", c.referenceId + " · " + c.split + " · Auswahl: " + c.selectionReason],
        ["Extraktion", r.extraction.method + " · Sicherheit " + r.extraction.confidence + " · Schiedsdurchgang " + (r.extraction.adjudicated ? "ja" : "nein")],
        ["Szenario (Kurzfassung der Extraktion)", r.structuralScenario],
        ["Zusammenfassung (Extraktion)", r.commentarySummary]
      ]),
      h("details", { open: true }, [h("summary", { text: "Fundstellen (" + r.evidence.length + ")" }), h("ul", { class: "ev" }, r.evidence.map(function (e) { return h("li", { text: e.field + " [" + e.locator + "] " + e.note }); }))]),
      r.extraction.ambiguities.length ? h("details", {}, [h("summary", { text: "Unklarheiten (" + r.extraction.ambiguities.length + ")" }), h("ul", { class: "ev" }, r.extraction.ambiguities.map(function (a) { return h("li", { text: a }); }))]) : null,
      r.extraction.coreFieldAgreement ? h("p", { class: "note", text: "A/B-Kernfelder: " + Object.keys(r.extraction.coreFieldAgreement).map(function (k) { return k + "=" + r.extraction.coreFieldAgreement[k]; }).join(", ") }) : null,
      c.revisions.length ? h("details", {}, [h("summary", { text: "Spätere Revisionen — nur Kontext, nicht prüfen (" + c.revisions.length + ")" }),
        h("ul", { class: "ev" }, c.revisions.map(function (v) { return h("li", {}, [document.createTextNode("v" + v.version + " · " + v.publication.timestamp + " · " + v.timeframe + " · " + (v.primary && v.primary.pattern) + " · Welle " + (v.primary && v.primary.currentWave) + " · " + v.directionalBias + " · Invalidierung " + fmt(v.invalidation) + " · "), h("a", { href: v.sourceUrl, target: "_blank", rel: "noopener noreferrer nofollow", text: "Quelle" })]); }))]) : null
    ]));
    var fields = h("div", { class: "card" }, [h("h3", { text: "Extrahierte Felder prüfen" })]);
    c.auditRows.forEach(function (row) { fields.append(fieldBlock(c, row)); });
    det.append(fields, pager());
  }
  function exportCheck() {
    var p = draftProblems(S.pack, S.draft);
    if (p.length) setMsg("Export unvollständig: " + p.join("; ") + " — der Import lehnt unvollständige Prüfungen ab.", "err"); else setMsg("Export vollständig.", "ok");
  }
  function init() {
    $("t-code").addEventListener("input", function () { S.draft.reviewerId = this.value.trim(); save(); });
    $("t-date").addEventListener("change", function () { S.draft.reviewDate = this.value; save(); });
    $("t-csv").addEventListener("click", function () { exportCheck(); download("human-audit-review-" + S.pack.packId + ".csv", toCsv(S.pack, S.draft), "text/csv;charset=utf-8"); });
    $("t-json").addEventListener("click", function () { exportCheck(); download("human-audit-review-" + S.pack.packId + ".json", toJson(S.pack, S.draft), "application/json"); });
    $("t-imp").addEventListener("change", function () {
      var f = this.files && this.files[0]; if (!f) return;
      f.text().then(function (t) { var d = draftFromText(S.pack, t); S.draft = d; save(); $("t-code").value = d.reviewerId; $("t-date").value = d.reviewDate; renderAll(); setMsg(d.loaded + " Zeilen geladen.", "ok"); })
        .catch(function (e) { setMsg("Laden fehlgeschlagen: " + e.message, "err"); });
      this.value = "";
    });
    $("t-reset").addEventListener("click", function () {
      if (!window.confirm("Entwurf für dieses Prüfpaket in diesem Browser löschen?")) return;
      try { localStorage.removeItem(KEY + S.pack.packId); } catch (e) { /* ignorieren */ }
      S.draft = emptyDraft(); $("t-code").value = ""; $("t-date").value = ""; renderAll(); setMsg("Entwurf gelöscht.", "note");
    });
    fetch(PACK_URL, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(function (pack) {
      S.pack = pack; S.draft = load();
      $("t-code").value = S.draft.reviewerId || ""; $("t-date").value = S.draft.reviewDate || "";
      S.cur = Math.min(S.draft.current || 0, pack.cases.length - 1);
      renderAll();
    }).catch(function (e) { $("data-status").textContent = "Prüfpaket nicht ladbar (" + e.message + "). Erst `human-audit.mjs select` und `export` ausführen."; $("data-status").className = "err"; });
  }
  function renderAll() { renderProgress(); renderNav(); renderCase(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : globalThis);
