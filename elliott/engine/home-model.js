/* =========================================================================
   VISION UNIVERSE ELLIOTT — engine/home-model.js

   Reine Darstellungslogik der Elliott-Startseite (kein DOM, kein Netz). UMD wie die
   uebrigen Engines (globalThis + module.exports): laeuft im Browser und im Test.

   Vertrag der Daten: elliott-home-1.0.0 (scripts/technical/elliott-home/home.mjs).
   Die Seite erfindet nichts: Reihen, Rollen, Stufen und Reihenfolge kommen fertig aus
   dem Index; hier entstehen nur Worte, Zahlenformate, Filter, Adressen und Suche.

   Zukunft: Die Bausteine (Karte, Reihe, Filter, Suche) kennen "Welle" nur ueber das
   Feld wave/type der Karte. Eine weitere Methode (Volumen, Momentum, Marktstruktur)
   liefert eigene Karten im selben Vertrag; die Seite bleibt eine Entdeckungsansicht.
   ========================================================================= */
(function (global) {
  "use strict";

  var VERSION = "elliott-home-model-1.0.0";
  var SCHEMA = "vu-elliott-home-1.0.0";
  var INDEX_VERSION = "elliott-home-1.0.0";
  var INDEX_PATH = "/quant/data/technical-intelligence/v3/elliott-home.json";
  var DETAIL_BASE = "/quant/#/elliott/";
  var PAGE = 24;

  var WAVE_LABEL = { "3": "Mögliche Welle 3", "5": "Mögliche Welle 5", C: "Mögliche Welle C" };
  var TYPE_LABEL = { NEXT_MOVE: "Mögliche Folgebewegung", REVERSAL: "Mögliche Gegenbewegung", THRUST: "Möglicher Ausbruch" };
  /* Die Rolle sagt, WAS die Karte ist. Ein Explore Highlight wird nie als Primärlesart dargestellt. */
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
  var TREND_LABEL = { POSITIVE: "Trend positiv", NEGATIVE: "Trend negativ", NEUTRAL: "Trend neutral" };

  /* ---------------------------------------------------------- Zahlen */
  var MINUS = "−";
  function group(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  /** Bruchteil des Kurses -> "+175 %" / "−63 %". Tausender mit Punkt; nie wissenschaftliche Schreibweise, nie NaN. */
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
  /** Die Stufe, die die Karte groß zeigt: Erweitert, sonst Basis, sonst Extrem. */
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

  /* ---------------------------------------------------------- Worte */
  function waveLabel(card) { return (card.wave && WAVE_LABEL[card.wave]) || TYPE_LABEL[card.type] || "Mögliche Elliott-Lesart"; }
  function roleLabel(role) { return ROLE_LABEL[role] || "Lesart"; }
  function contextLine(card) {
    var out = [], c = card.ctx;
    if (c && c.trend && TREND_LABEL[c.trend]) out.push(TREND_LABEL[c.trend]);
    if (c && typeof c.rs === "number") out.push("RS stärker als " + Math.round(c.rs * 100) + " %");
    return out;
  }
  function poolLine(card) { return card.pool ? "Rang " + card.pool.pos + " von " + card.pool.size + " im Kandidatenpool" : null; }
  function ariaLabel(card) {
    var h = headlineTier(card);
    return [card.n + " (" + card.t + ")", waveLabel(card), DIR_LABEL[card.dir], STATUS_LABEL[card.st], roleLabel(card.role), h ? h.label + " " + h.text : null].filter(Boolean).join(", ");
  }
  function detailHref(ticker) { return DETAIL_BASE + encodeURIComponent(String(ticker || "").toUpperCase()); }

  /* ---------------------------------------------------------- Filter (URL-Zustand) */
  var DIR_PARAM = { auf: "UP", ab: "DOWN" };
  var ST_PARAM = { bestaetigt: "CONFIRMED", aufbau: "DEVELOPING" };
  var ROLE_PARAM = { engine: ["PRIMARY", "ALTERNATIVE", "HIGH_UPSIDE"], primaer: ["PRIMARY"], alternative: ["ALTERNATIVE", "HIGH_UPSIDE", "MOTIVE_ALTERNATIVE"], highlight: ["EXPLORE_HIGHLIGHT"] };

  /** "#/?welle=3&richtung=ab" -> Zustand. Unbekannte Werte werden verworfen (keine leere Liste durch einen Tippfehler in der Adresse). */
  function parseHash(hash) {
    var h = String(hash || "").replace(/^#\/?/, ""), q = h.indexOf("?"), params = new URLSearchParams(q >= 0 ? h.slice(q + 1) : "");
    var lead = (q >= 0 ? h.slice(0, q) : h).replace(/\/+$/, "");
    var s = { welle: null, richtung: null, status: null, rolle: null, neu: false, suche: false, q: "", ticker: null };
    var w = params.get("welle"); if (w === "3" || w === "5" || w === "C" || w === "c") s.welle = w.toUpperCase();
    var r = params.get("richtung"); if (DIR_PARAM[r]) s.richtung = r;
    var st = params.get("status"); if (ST_PARAM[st]) s.status = st;
    var ro = params.get("rolle"); if (ROLE_PARAM[ro]) s.rolle = ro;
    s.neu = params.get("neu") === "1";
    s.suche = params.get("suche") === "1";
    s.q = (params.get("q") || "").slice(0, 60);
    /* Alias: /elliott/#/<TICKER> fuehrt zur Aktie (Detail liegt in der Quant-SPA, siehe detailHref). */
    if (/^[A-Za-z0-9.-]{1,12}$/.test(lead)) s.ticker = lead.toUpperCase();
    return s;
  }
  function buildHash(s) {
    var p = [];
    if (s.welle) p.push("welle=" + s.welle);
    if (s.richtung) p.push("richtung=" + s.richtung);
    if (s.status) p.push("status=" + s.status);
    if (s.rolle) p.push("rolle=" + s.rolle);
    if (s.neu) p.push("neu=1");
    if (s.suche) p.push("suche=1");
    if (s.q) p.push("q=" + encodeURIComponent(s.q));
    return "#/" + (p.length ? "?" + p.join("&") : "");
  }
  function isFiltered(s) { return !!(s.welle || s.richtung || s.status || s.rolle || s.neu); }
  function matches(card, s) {
    if (s.welle && card.wave !== s.welle) return false;
    if (s.richtung && card.dir !== DIR_PARAM[s.richtung]) return false;
    if (s.status && card.st !== ST_PARAM[s.status]) return false;
    if (s.rolle && ROLE_PARAM[s.rolle].indexOf(card.role) < 0) return false;
    if (s.neu && !card.chg) return false;
    return true;
  }
  /** Gefilterte Karten in der Reihenfolge des Index (Index ist bereits geordnet). Neu-Filter: juengste Ereignisse zuerst. */
  function filterCards(cards, s) {
    var out = cards.filter(function (c) { return matches(c, s); });
    /* Neu und veraendert: dieselbe Reihenfolge wie die Reihe (juengstes Datum, dann Ereignisart), sonst die Ordnung des Index */
    if (s.neu) {
      var prio = { CONFIRMED: 0, ROLE: 1, NEW: 2, ZONE: 3, REVISED: 4 };
      out = out.map(function (c, i) { return { c: c, i: i }; }).sort(function (a, b) {
        return (a.c.chg.d < b.c.chg.d ? 1 : a.c.chg.d > b.c.chg.d ? -1 : 0) || (prio[a.c.chg.k] - prio[b.c.chg.k]) || a.i - b.i;
      }).map(function (x) { return x.c; });
    }
    return out;
  }
  /** Chips mit Anzahl; Gruppen ohne Karten entfallen, eine einzelne Karte reicht fuer einen Chip (z. B. Welle 5). */
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
    var n = Object.assign({}, s); n.suche = false; n.q = "";
    n[groupId] = s[groupId] === value ? null : value;     // erneut antippen hebt den Filter auf
    return n;
  }
  function filterTitle(s) {
    var parts = [];
    if (s.welle) parts.push("Welle " + s.welle);
    if (s.richtung) parts.push(DIR_LABEL[DIR_PARAM[s.richtung]]);
    if (s.status) parts.push(STATUS_LABEL[ST_PARAM[s.status]]);
    if (s.rolle) parts.push({ engine: "Bevorzugte Lesart der Engine", primaer: "Primäre Lesart", alternative: "Alternativen", highlight: "Explore Highlights" }[s.rolle]);
    if (s.neu) parts.unshift("Neu und verändert");
    return parts.join(" · ");
  }

  /* ---------------------------------------------------------- Reihen */
  /** Reihen der Startseite mit aufgeloesten Karten. Karten, die der Index nicht (mehr) kennt, entfallen still (nie eine leere Kachel). */
  function rowsOf(home) {
    var byId = {};
    home.cards.forEach(function (c) { byId[c.id] = c; });
    return (home.rows || []).map(function (r) {
      return { id: r.id, title: r.title, rule: r.rule, total: r.total, cards: r.ids.map(function (id) { return byId[id]; }).filter(Boolean) };
    }).filter(function (r) { return r.cards.length > 0; });
  }
  /** Filter, der "Alle ansehen" einer Reihe oeffnet; null, wenn die Reihe keinem Chip entspricht. */
  function rowFilter(rowId) {
    return { wave3: { welle: "3" }, wave5: { welle: "5" }, waveC: { welle: "C" }, recent: { neu: true }, bullish: { richtung: "auf" }, bearish: { richtung: "ab" }, engine: { rolle: "engine" } }[rowId] || null;
  }

  /* ---------------------------------------------------------- Vertrag */
  /** Prueft den Index. Eine fremde Version wird nicht "irgendwie" angezeigt, sondern als nicht verfuegbar behandelt. */
  function validate(home) {
    if (!home || home.schemaVersion !== SCHEMA || home.version !== INDEX_VERSION) return { ok: false, reason: "VERSION" };
    if (!Array.isArray(home.cards) || !Array.isArray(home.rows)) return { ok: false, reason: "SHAPE" };
    return { ok: true };
  }

  /* ---------------------------------------------------------- Leerzustaende */
  function emptyState(home, s, query, resultCount) {
    if (query && query.length >= 2) return { kind: "SEARCH", title: "Keine Aktie gefunden", text: "Zu „" + query + "“ gibt es keinen Treffer im Aktienbestand. Prüfe Schreibweise oder Kürzel." };
    if (!home || !home.cards || !home.cards.length) return { kind: "NO_THESES", title: "Zurzeit keine Elliott-Lesarten", text: "Im aktuellen Datenstand zeigt Vision Universe keine Elliott-Lesart. Das ist ein ehrlicher Zustand: Die Engine enthält sich, wenn keine Zählung verlässlich ist. Du kannst trotzdem jede Aktie suchen." };
    if (isFiltered(s) && resultCount === 0) return { kind: "FILTER", title: "Keine Lesart für diese Auswahl", text: "Mit dieser Kombination gibt es im aktuellen Datenstand keine Lesart. Nimm einen Filter heraus." };
    return null;
  }
  /** Reihen ohne Karten werden nicht gebaut. Fehlt eine erwartete Reihe (z. B. Welle 5), nennt die Seite das ehrlich statt eine Reihe zu erfinden. */
  function missingRowNote(home, rowId) {
    var s = home.summary || {};
    if (rowId === "wave5") return s.wave5 > 0 ? null : "Aktuell keine Welle-5-Lesart im Datenstand.";
    return null;
  }

  /* ---------------------------------------------------------- Suche */
  function norm(t) { return String(t || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9. -]/g, " ").replace(/\s+/g, " ").trim(); }
  /** entries: [{s: Kuerzel, n: Name}]. Rang: Kuerzel genau, Kuerzel-Anfang, Namensanfang, Wortanfang, enthalten. Stabil, deterministisch. */
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
  /** Karten eines Titels (fuer den Hinweis im Suchtreffer). */
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
    VERSION: VERSION, SCHEMA: SCHEMA, INDEX_VERSION: INDEX_VERSION, INDEX_PATH: INDEX_PATH, DETAIL_BASE: DETAIL_BASE, PAGE: PAGE,
    ROLE_LABEL: ROLE_LABEL, ROLE_NOTE: ROLE_NOTE, STATUS_LABEL: STATUS_LABEL, DIR_LABEL: DIR_LABEL, CHANGE_LABEL: CHANGE_LABEL,
    pct: pct, range: range, headlineTier: headlineTier, otherTiers: otherTiers, price: price, dateDe: dateDe,
    waveLabel: waveLabel, roleLabel: roleLabel, contextLine: contextLine, poolLine: poolLine, ariaLabel: ariaLabel, detailHref: detailHref,
    parseHash: parseHash, buildHash: buildHash, isFiltered: isFiltered, matches: matches, filterCards: filterCards, chipGroups: chipGroups, withChip: withChip, filterTitle: filterTitle,
    rowsOf: rowsOf, rowFilter: rowFilter, validate: validate, emptyState: emptyState, missingRowNote: missingRowNote,
    norm: norm, searchEntries: searchEntries, cardsByTicker: cardsByTicker, searchHint: searchHint
  };
  global.VUElliottHome = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
