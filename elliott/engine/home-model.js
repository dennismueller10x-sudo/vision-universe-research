/* VISION UNIVERSE ELLIOTT — engine/home-model.js. Reine Darstellungslogik der Startseite (kein DOM, kein Netz), UMD.
   Vertrag: elliott-home-1.2.0 (scripts/technical/elliott-home/home.mjs). Die Seite erfindet nichts: Zaehlbar-Liste, Reihen, Rollen und
   Reihenfolge kommen fertig aus dem Index; hier entstehen nur Worte, Zahlenformate, Filter, Adressen und Suche. */
(function (global) {
  "use strict";

  var VERSION = "elliott-home-model-1.3.0";
  var SCHEMAS = { "vu-elliott-home-1.0.0": "elliott-home-1.0.0", "vu-elliott-home-1.1.0": "elliott-home-1.1.0", "vu-elliott-home-1.2.0": "elliott-home-1.2.0" };
  var INDEX_PATH = "/quant/data/technical-intelligence/v3/elliott-home.json";
  var DETAIL_BASE = "/elliott/#/";
  var PAGE = 24;

  var WAVE_LABEL = { "3": "Mögliche Welle 3", "5": "Mögliche Welle 5", C: "Mögliche Welle C" };
  var TYPE_LABEL = { NEXT_MOVE: "Mögliche Folgebewegung", REVERSAL: "Mögliche Gegenbewegung", THRUST: "Möglicher Ausbruch" };
  var ROLE_LABEL = {
    PRIMARY: "Primäre Lesart",
    ALTERNATIVE: "Alternative",
    HIGH_UPSIDE: "Alternative mit großer Spanne",
    MOTIVE_ALTERNATIVE: "Motiv-Alternative",
    EXPLORE_HIGHLIGHT: "Explore Highlight"
  };
  var ROLE_NOTE = {
    PRIMARY: "Die derzeit bevorzugte Zählung der Engine.",
    ALTERNATIVE: "Gleichrangige zweite Lesart der Engine.",
    HIGH_UPSIDE: "Zweite Lesart mit großer rechnerischer Spanne (keine Aussage über Wahrscheinlichkeit).",
    MOTIVE_ALTERNATIVE: "Eine laufende Welle 2 oder 3, die neben der Hauptzählung geprüft wird.",
    EXPLORE_HIGHLIGHT: "Explorativ: regelkonforme Lesart, nicht als reguläre Alternative freigegeben."
  };
  var STATUS_LABEL = { CONFIRMED: "Bestätigt", DEVELOPING: "Im Aufbau" };
  var DIR_LABEL = { UP: "Aufwärts", DOWN: "Abwärts" };
  var TIER_LABEL = { base: "Basis", ext: "Erweitert", xtr: "Extrem" };
  var CHANGE_LABEL = { NEW: "Neu", CONFIRMED: "Neu bestätigt", ROLE: "Rolle gewechselt", REVISED: "Überarbeitet", ZONE: "Zone erreicht" };

  /* Zaehlbar (Konzept EHV 09.11.2026, EX02): deutsche Namen fuer Muster und Marktstruktur des Wellen-Index. */
  var PATTERN_DE = { ZIGZAG: "Zickzack", FLAT: "Flache Korrektur", TRIPLE_ZIGZAG: "Dreifach-Zickzack", DOUBLE_ZIGZAG: "Doppel-Zickzack", WXY: "Doppelte Korrektur (W-X-Y)",
    TRIANGLE: "Dreieck", IMPULSE: "Impuls", ENDING_DIAGONAL: "Enddiagonale", LEADING_DIAGONAL: "Anfangsdiagonale" };
  var STRUCTURE_DE = { CORRECTION_IN_UPTREND: "Rücksetzer im Aufwärtstrend", UPTREND_ADVANCING: "Aufwärtstrend läuft", RALLY_IN_DOWNTREND: "Erholung im Abwärtstrend", DOWNTREND_ADVANCING: "Abwärtstrend läuft",
    NO_CLEAR_TREND: "Kein klarer Trend", SIDEWAYS_RANGE: "Seitwärtsspanne" };
  var APPLICABLE_DE = { HIGH: "gut", MODERATE: "mittel", LOW: "gering" };
  function patternDe(code) {
    var c = String(code || ""), base = c.split(":")[0];
    return PATTERN_DE[base] || (base ? base.charAt(0) + base.slice(1).toLowerCase().replace(/_/g, " ") : "Muster");
  }
  function phaseDe(code) {
    var c = String(code || ""), part = c.split(":")[1];
    if (!part) return "";
    return part === "done" ? "abgeschlossen" : "läuft (" + part + ")";
  }
  function structureDe(code) { return STRUCTURE_DE[code] || (code ? String(code).toLowerCase().replace(/_/g, " ") : ""); }
  function countLine(r) { return [patternDe(r.el) + (phaseDe(r.el) ? " " + phaseDe(r.el) : ""), structureDe(r.st)].filter(Boolean).join(" · "); }
  function dirOf(r) { return r.dir === "BULLISH" ? "up" : r.dir === "BEARISH" ? "down" : null; }
  function invalidLine(r) {
    if (typeof r.inv !== "number" || !(r.inv > 0)) return null;
    var s = r.inv.toFixed(2).replace(".", ","); s = s.replace(/^(\d+)/, function (m) { return group(m); });
    return "ungültig " + (dirOf(r) === "down" ? "über " : "unter ") + s + (r.cur === "USD" || !r.cur ? " $" : " " + r.cur);
  }
  /** Kurzname fuer ruhige Listen: Rechtsform und Zusaetze am Ende weg (wie Discover-Reihen). Rohname bleibt im Datensatz. */
  function shortName(name, ticker) {
    var x = String(name || "").trim();
    for (var i = 0; i < 4; i++) x = x.replace(/,?\s+(Class [A-Z]|Inc\.?|Holdings?|Ltd\.?|Limited|Corporation|Corp\.?|Co\.?|Company|plc|N\.V\.|S\.A\.|AG|SE|- New|\(Cayman\)|Group|Group Holding|L\.P\.|LP|Trust)$/i, "");
    return x || String(ticker || "");
  }
  /** Leerzustand (Konzept EHV, Entscheidung 5): laedt die Uebersicht nicht, sagt die Seite in einem Satz Grund und Stand. */
  function loadFailText(f) {
    f = f || {};
    var at = f.at instanceof Date ? ("0" + f.at.getHours()).slice(-2) + ":" + ("0" + f.at.getMinutes()).slice(-2) + " Uhr" : "eben";
    var why = f.status === 404 ? "die Datei mit dem Wellen-Index auf dem Server fehlt" : f.status ? "der Server mit Fehler " + f.status + " antwortet" : /INDEX_/.test(String(f.msg || "")) ? "die Datei ein unbekanntes Format hat" : "die Verbindung unterbrochen ist";
    return "Die Übersicht der zählbaren Aktien lädt gerade nicht, weil " + why + " (Stand der Abfrage " + at + "). Die Suche oben öffnet jede Aktie direkt.";
  }
  function applicableOf(home) { var a = home && home.applicable; return a && Array.isArray(a.rows) ? a : null; }

  var MINUS = "−";
  function group(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  function pct(f) {
    if (typeof f !== "number" || !isFinite(f)) return "–";
    var v = Math.round(Math.abs(f) * 100);
    if (v === 0) return "0 %";
    return (f < 0 ? MINUS : "+") + group(v) + " %";
  }
  function range(pair) {
    if (!pair || pair.length !== 2) return "–";
    var a = pct(pair[0]), b = pct(pair[1]);
    return a === b ? a : a + " bis " + b;
  }
  function headlineTier(card) {
    var t = (card && card.tiers) || {};
    var key = t.ext ? "ext" : t.base ? "base" : t.xtr ? "xtr" : null;
    return key ? { key: key, label: TIER_LABEL[key], text: range(t[key]) } : null;
  }
  function otherTiers(card) {
    var t = (card && card.tiers) || {}, head = headlineTier(card);
    return ["base", "ext", "xtr"].filter(function (k) { return t[k] && (!head || k !== head.key); })
      .map(function (k) { return { key: k, label: TIER_LABEL[k], text: range(t[k]) }; });
  }
  function price(card) {
    if (!card || typeof card.close !== "number") return null;
    var d = card.close >= 100 ? 0 : 2;
    var s = card.close.toFixed(d).replace(".", ",");
    s = s.replace(/^(\d+)/, function (m) { return group(m); });
    return s + (card.cur === "USD" ? " $" : card.cur ? " " + card.cur : "");
  }
  function dateDe(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? m[3] + "." + m[2] + "." + m[1] : "–"; }

  function waveLabel(card) { return (card.wave && WAVE_LABEL[card.wave]) || TYPE_LABEL[card.type] || "Mögliche Elliott-Lesart"; }
  function roleLabel(role) { return ROLE_LABEL[role] || "Lesart"; }
  function ariaLabel(card) {
    var h = headlineTier(card);
    return [card.n + " (" + card.t + ")", waveLabel(card), DIR_LABEL[card.dir], STATUS_LABEL[card.st], roleLabel(card.role), h ? h.label + " " + h.text : null].filter(Boolean).join(", ");
  }
  function detailHref(ticker) { return DETAIL_BASE + encodeURIComponent(String(ticker || "").toUpperCase()); }

  var DIR_PARAM = { auf: "UP", ab: "DOWN" };
  var ST_PARAM = { bestaetigt: "CONFIRMED", aufbau: "DEVELOPING" };
  var ROLE_PARAM = { engine: ["PRIMARY", "ALTERNATIVE", "HIGH_UPSIDE"], primaer: ["PRIMARY"], alternative: ["ALTERNATIVE", "HIGH_UPSIDE", "MOTIVE_ALTERNATIVE"], motiv: ["MOTIVE_ALTERNATIVE"], highlight: ["EXPLORE_HIGHLIGHT"] };

  function parseHash(hash) {
    var h = String(hash || "").replace(/^#\/?/, ""), q = h.indexOf("?"), params = new URLSearchParams(q >= 0 ? h.slice(q + 1) : "");
    var lead = (q >= 0 ? h.slice(0, q) : h).replace(/\/+$/, "");
    var s = { welle: null, richtung: null, status: null, rolle: null, neu: false, reihe: null, suche: false, zaehlbar: false, q: "", ticker: null, detailQuery: "" };
    var w = params.get("welle"); if (w === "3" || w === "5" || w === "C" || w === "c") s.welle = w.toUpperCase();
    var r = params.get("richtung"); if (DIR_PARAM[r]) s.richtung = r;
    var st = params.get("status"); if (ST_PARAM[st]) s.status = st;
    var ro = params.get("rolle"); if (ROLE_PARAM[ro]) s.rolle = ro;
    s.neu = params.get("neu") === "1";
    var re = params.get("reihe"); if (re && /^[A-Za-z0-9]{1,24}$/.test(re)) s.reihe = re;
    s.suche = params.get("suche") === "1";
    s.zaehlbar = params.get("zaehlbar") === "1";
    s.q = (params.get("q") || "").slice(0, 60);
    if (/^[A-Za-z0-9.-]{1,12}$/.test(lead)) { s.ticker = lead.toUpperCase(); s.detailQuery = q >= 0 ? h.slice(q + 1) : ""; }
    return s;
  }
  function buildHash(s) {
    var p = [];
    if (s.welle) p.push("welle=" + s.welle);
    if (s.richtung) p.push("richtung=" + s.richtung);
    if (s.status) p.push("status=" + s.status);
    if (s.rolle) p.push("rolle=" + s.rolle);
    if (s.neu) p.push("neu=1");
    if (s.reihe) p.push("reihe=" + s.reihe);
    if (s.suche) p.push("suche=1");
    if (s.zaehlbar) p.push("zaehlbar=1");
    if (s.q) p.push("q=" + encodeURIComponent(s.q));
    return "#/" + (p.length ? "?" + p.join("&") : "");
  }
  /* Alte Adresse: der Leistenplatz "Welle 3" heisst "Zaehlbar" (Konzept EHV, Entscheidung 2). #/?welle=3 ohne weitere Filter fuehrt auf die Liste. */
  var ZAEHLBAR_HASH = "#/?zaehlbar=1";
  function redirectOf(hash) {
    var s = parseHash(hash);
    if (s.ticker) return null;
    if (s.welle === "3" && !s.richtung && !s.status && !s.rolle && !s.neu && !s.reihe && !s.suche) return ZAEHLBAR_HASH;
    return null;
  }
  function isFiltered(s) { return !!(s.welle || s.richtung || s.status || s.rolle || s.neu || s.reihe); }
  function matches(card, s) {
    if (s.welle && card.wave !== s.welle) return false;
    if (s.richtung && card.dir !== DIR_PARAM[s.richtung]) return false;
    if (s.status && card.st !== ST_PARAM[s.status]) return false;
    if (s.rolle && ROLE_PARAM[s.rolle].indexOf(card.role) < 0) return false;
    if (s.neu && !card.chg) return false;
    return true;
  }
  function filterCards(cards, s, rows) {
    var out = cards.filter(function (c) { return matches(c, s); });
    if (s.reihe && rows) {
      var row = rows.filter(function (r) { return r.id === s.reihe; })[0], pos = {};
      if (row) { row.ids.forEach(function (id, i) { pos[id] = i; }); out = out.filter(function (c) { return pos[c.id] !== undefined; }).sort(function (a, b) { return pos[a.id] - pos[b.id]; }); }
      else out = [];
    }
    if (s.neu && !s.reihe) {
      var prio = { CONFIRMED: 0, ROLE: 1, NEW: 2, ZONE: 3, REVISED: 4 };
      out = out.map(function (c, i) { return { c: c, i: i }; }).sort(function (a, b) {
        return (a.c.chg.d < b.c.chg.d ? 1 : a.c.chg.d > b.c.chg.d ? -1 : 0) || (prio[a.c.chg.k] - prio[b.c.chg.k]) || a.i - b.i;
      }).map(function (x) { return x.c; });
    }
    return out;
  }
  function chipGroups(home, s) {
    var cards = home.cards, count = function (patch) { return cards.filter(function (c) { return matches(c, Object.assign({}, s, patch)); }).length; };
    var groups = [
      { id: "welle", label: "Welle", options: [["3", "Welle 3"], ["5", "Welle 5"], ["C", "Welle C"]] },
      { id: "richtung", label: "Richtung", options: [["auf", "Aufwärts"], ["ab", "Abwärts"]] },
      { id: "status", label: "Status", options: [["bestaetigt", "Bestätigt"], ["aufbau", "Im Aufbau"]] },
      { id: "rolle", label: "Rolle", options: [["primaer", "Primär"], ["alternative", "Alternative"], ["highlight", "Highlight"]] }
    ];
    return groups.map(function (g) {
      return {
        id: g.id, label: g.label,
        options: g.options.map(function (o) {
          var patch = {}; patch[g.id] = o[0];
          return { value: o[0], label: o[1], count: count(patch), active: s[g.id] === o[0] };
        }).filter(function (o) { return o.count > 0 || o.active; })
      };
    }).filter(function (g) { return g.options.length > 0; });
  }
  function withChip(s, groupId, value) {
    var n = Object.assign({}, s); n.suche = false; n.q = ""; n.reihe = null;
    n[groupId] = s[groupId] === value ? null : value;     // erneut antippen hebt den Filter auf
    return n;
  }
  function filterTitle(s, rows) {
    if (s.reihe) { var row = (rows || []).filter(function (r) { return r.id === s.reihe; })[0]; return row ? row.title : "Reihe"; }
    var parts = [];
    if (s.welle) parts.push("Welle " + s.welle);
    if (s.richtung) parts.push(DIR_LABEL[DIR_PARAM[s.richtung]]);
    if (s.status) parts.push(STATUS_LABEL[ST_PARAM[s.status]]);
    if (s.rolle) parts.push({ engine: "Bevorzugte Lesart der Engine", primaer: "Primäre Lesart", alternative: "Alternativen", motiv: "Motiv-Alternativen", highlight: "Explore Highlights" }[s.rolle]);
    if (s.neu) parts.unshift("Neu und verändert");
    return parts.join(" · ");
  }

  function rowHref(row) { return buildHash({ reihe: row.id }); }

  function validate(home) {
    if (!home || !SCHEMAS[home.schemaVersion] || home.version !== SCHEMAS[home.schemaVersion]) return { ok: false, reason: "VERSION" };
    if (!Array.isArray(home.cards) || !Array.isArray(home.rows)) return { ok: false, reason: "SHAPE" };
    return { ok: true };
  }

  function emptyState(home, s, query, resultCount) {
    if (query && query.length >= 2) return { kind: "SEARCH", title: "Keine Aktie gefunden", text: "Zu „" + query + "“ gibt es keinen Treffer im Aktienbestand. Prüfe Schreibweise oder Kürzel." };
    if (!home || !home.cards || !home.cards.length) return { kind: "NO_THESES", title: "Zurzeit keine Elliott-Lesarten", text: "Im aktuellen Datenstand zeigt Vision Universe keine Elliott-Lesart. Das ist ein ehrlicher Zustand: Die Engine enthält sich, wenn keine Zählung verlässlich ist. Du kannst trotzdem jede Aktie suchen." };
    if (isFiltered(s) && resultCount === 0) return { kind: "FILTER", title: "Keine Lesart für diese Auswahl", text: "Mit dieser Kombination gibt es im aktuellen Datenstand keine Lesart. Nimm einen Filter heraus." };
    return null;
  }
  function norm(t) { return String(t || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9. -]/g, " ").replace(/\s+/g, " ").trim(); }
  function searchEntries(entries, q, limit) {
    var needle = norm(q); if (needle.length < 1) return [];
    var tq = needle.toUpperCase(), out = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i]; if (!e || !e.s) continue;
      var t = String(e.s).toUpperCase(), n = norm(e.n), rank = null;
      if (t === tq) rank = 0; else if (t.indexOf(tq) === 0) rank = 1; else if (n.indexOf(needle) === 0) rank = 2; else if (n.indexOf(" " + needle) >= 0) rank = 3; else if (needle.length >= 3 && n.indexOf(needle) >= 0) rank = 4;
      if (rank !== null) out.push({ e: e, rank: rank, len: t.length });
    }
    out.sort(function (a, b) { return a.rank - b.rank || a.len - b.len || (a.e.s < b.e.s ? -1 : a.e.s > b.e.s ? 1 : 0); });
    return out.slice(0, limit || 8).map(function (x) { return x.e; });
  }
  function cardsByTicker(home) {
    var m = {};
    (home.cards || []).forEach(function (c) { (m[c.t] = m[c.t] || []).push(c); });
    return m;
  }
  function searchHint(cards) {
    if (!cards || !cards.length) return "Analyse öffnen";
    var c = cards[0];
    return waveLabel(c) + " · " + DIR_LABEL[c.dir];
  }

  var api = {
    VERSION: VERSION, SCHEMAS: SCHEMAS, INDEX_PATH: INDEX_PATH, DETAIL_BASE: DETAIL_BASE, PAGE: PAGE,
    ROLE_LABEL: ROLE_LABEL, ROLE_NOTE: ROLE_NOTE, STATUS_LABEL: STATUS_LABEL, DIR_LABEL: DIR_LABEL, TIER_LABEL: TIER_LABEL, CHANGE_LABEL: CHANGE_LABEL,
    pct: pct, range: range, headlineTier: headlineTier, otherTiers: otherTiers, price: price, dateDe: dateDe,
    waveLabel: waveLabel, roleLabel: roleLabel, ariaLabel: ariaLabel, detailHref: detailHref,
    parseHash: parseHash, buildHash: buildHash, isFiltered: isFiltered, matches: matches, filterCards: filterCards, chipGroups: chipGroups, withChip: withChip, filterTitle: filterTitle,
    rowHref: rowHref, validate: validate, emptyState: emptyState,
    norm: norm, searchEntries: searchEntries, cardsByTicker: cardsByTicker, searchHint: searchHint,
    PATTERN_DE: PATTERN_DE, STRUCTURE_DE: STRUCTURE_DE, APPLICABLE_DE: APPLICABLE_DE, ZAEHLBAR_HASH: ZAEHLBAR_HASH,
    patternDe: patternDe, phaseDe: phaseDe, structureDe: structureDe, countLine: countLine, dirOf: dirOf, invalidLine: invalidLine, applicableOf: applicableOf, redirectOf: redirectOf, shortName: shortName, loadFailText: loadFailText
  };
  global.VUElliottHome = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
