/* =========================================================================
   VISION UNIVERSE DISCOVER — engines/reihen.js     Konzept „Reihe für Reihe“

   Vorlage: docs/design/discover-netflix-2026-11 (HANDOVER.md, deck.js).
   Reine Regeln ohne DOM, damit sie im Test laufen (UMD: globalThis + module.exports):

   - Reihenfolge der Startseite (Screen n-home, Folie U2): oben fest Billboard,
     Markt, Top 10; danach wechseln sich Kurs, Unternehmen, Themen und
     Persoenliches ab. Hoechstens 14 Reihen. Leere Reihen erscheinen nicht.
   - Genres (Folie DX02/DX06): Zuordnung Reihe -> Genre fest im Code.
   - Schaufenster-Regel (Entscheidung 4): auf der Startseite nur Karten mit
     Kursreihe und 12 Monaten ueber -60 %. Die Seite der Reihe zeigt alle.
   ========================================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUDiscover = root.VUDiscover || {};
  root.VUDiscover.Reihen = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var MAX_HOME_ROWS = 14;
  var SHOWCASE_MIN_RETURN_12M = -0.60;

  /* Anzeigenamen (Folie U3, docs/legal/WORTWAHL.md). */
  var TITLES = {
    "im-blick": "Heute im Blick", "new-52-week-highs": "Neue Jahreshochs", "market-leaders": "Die stärksten Aktien",
    "sp500-staerkste": "Stärkste im S&P 500", "ndx-staerkste": "Stärkste im Nasdaq-100", "djia-staerkste": "Stärkste im Dow Jones",
    "momentum-leaders": "Seit Monaten im Aufwind", "breakout-watch": "Gerade in Bewegung", "relative-strength": "Dem Markt voraus",
    "trend-quality": "Stabile Aufwärtstrends", "bekannte-namen": "Bekannte Namen in Bewegung", "comeback": "Comeback?",
    "ueberraschungen": "Überraschungen", "umsatz-waechst-stark": "Umsatz wächst stark", "gewinne-beschleunigen": "Gewinne beschleunigen",
    "margen-werden-staerker": "Margen werden stärker", "cashflow-maschinen": "Cashflow-Maschinen", "qualitaet-wachstum": "Qualität + Wachstum",
    "langfristige-compounder": "Langfristige Compounder", "profitables-wachstum": "Profitables Wachstum",
    "fundamentale-turnarounds": "Fundamentale Turnarounds", "qualitaet-zum-preis": "Qualität zum vernünftigen Preis",
    "starke-bilanz-wachstum": "Starke Bilanz + Wachstum", "sector-leaders": "Die stärksten je Branche",
    "fallen-angels": "Fallen Angels"
  };
  /* Startseiten-Fassung einzelner Reihen: anderer Titel oder Satz als auf der Seite der Reihe. */
  var HOME_COPY = {
    "ueberraschungen": { title: "Kennt kaum jemand", sub: "Stark über Monate, aber ohne bekannten Namen." },
    "fallen-angels": { sub: "Starke Zahlen, aber der Kurs liegt weit unter seinem Hoch." }
  };

  /* Genres (DX02, DX06). „Entdecken“ ist kein Chip, nur eine Gruppe in „Alle Reihen“. */
  var GENRES = [
    { id: "kursbewegung", label: "Kursbewegung", kicker: "Kursbewegung", title: "Aktien in\nBewegung",
      lead: "Reihen aus dem Kursverlauf: Hochs, Trends und Ausbrüche.",
      rows: ["new-52-week-highs", "momentum-leaders", "relative-strength", "trend-quality", "breakout-watch", "comeback", "fallen-angels"] },
    { id: "unternehmen", label: "Unternehmen", kicker: "Unternehmen", title: "Firmen mit\nstarken Zahlen",
      lead: "Reihen aus den Jahresabschlüssen (SEC), ohne Fachwissen erklärt.",
      rows: ["umsatz-waechst-stark", "fallen-angels", "gewinne-beschleunigen", "fundamentale-turnarounds", "starke-bilanz-wachstum",
        "margen-werden-staerker", "cashflow-maschinen", "qualitaet-wachstum", "profitables-wachstum", "langfristige-compounder", "qualitaet-zum-preis"] },
    { id: "themen", label: "Themen", kicker: "Themen", title: "Themen und\nMegatrends",
      lead: "Von KI bis Kernenergie, je ein Bild und die Firmen dahinter.", rows: [] },
    { id: "indizes", label: "Indizes", kicker: "Indizes", title: "Die großen\nIndizes",
      lead: "Die stärksten Aktien im S&P 500, Nasdaq-100 und Dow Jones.",
      rows: ["sp500-staerkste", "ndx-staerkste", "djia-staerkste"] }
  ];
  /* Gruppen für „Alle Reihen“ (Screen n-all). Fallen Angels steht in Kursbewegung und Unternehmen; dort nur einmal. */
  var ALL_GROUPS = [
    { id: "kursbewegung", label: "Kursbewegung", rows: ["new-52-week-highs", "momentum-leaders", "relative-strength", "trend-quality", "breakout-watch", "comeback", "fallen-angels"] },
    { id: "unternehmen", label: "Unternehmen", rows: ["umsatz-waechst-stark", "gewinne-beschleunigen", "margen-werden-staerker", "cashflow-maschinen", "qualitaet-wachstum",
      "profitables-wachstum", "langfristige-compounder", "fundamentale-turnarounds", "qualitaet-zum-preis", "starke-bilanz-wachstum"] },
    { id: "indizes", label: "Indizes", rows: ["sp500-staerkste", "ndx-staerkste", "djia-staerkste"] },
    { id: "entdecken", label: "Entdecken", rows: ["im-blick", "bekannte-namen", "ueberraschungen"] }
  ];

  /* Startseite (Screen n-home), von oben nach unten unter Billboard und Markt.
     kind: top10 | rail (eine Reihe) | themes | recent | more | strategies.
     movable: Reihen, die nach Regel 3 (neue Treffer seit dem Vortag) nach oben ruecken duerfen –
     sie tauschen nur untereinander die Plaetze, damit der Wechsel Kurs/Unternehmen/Themen/Persoenlich bleibt. */
  var HOME_PLAN = [
    { kind: "top10", row: "im-blick" },
    { kind: "rail", row: "new-52-week-highs", movable: true },
    { kind: "rail", row: "fallen-angels", movable: true, tag: "NEU", pill: "fromHigh" },
    { kind: "themes" },
    { kind: "recent" },
    { kind: "rail", row: "comeback", movable: true },
    { kind: "more" },
    { kind: "rail", row: "langfristige-compounder", movable: true },
    { kind: "rail", row: "ueberraschungen", movable: true },
    { kind: "rail", row: "bekannte-namen", movable: true },
    { kind: "strategies", rows: ["umsatz-waechst-stark", "qualitaet-wachstum", "cashflow-maschinen"] },
    { kind: "rail", row: "breakout-watch", movable: true }
  ];
  /* Saetze der breiten Strategie-Karten (Screen n-home, Strategien). */
  var STRATEGY_COPY = {
    "umsatz-waechst-stark": { icon: "bars", line: "3 Jahre je mindestens +15 % Umsatz." },
    "qualitaet-wachstum": { icon: "target", line: "Wächst und verdient gut." },
    "cashflow-maschinen": { icon: "signal", line: "≥ 15 Cent freies Geld je Dollar Umsatz." }
  };

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function title(rowId, fallback) {
    if (TITLES[rowId]) return TITLES[rowId];
    var t = String(fallback || rowId || "").toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function homeTitle(rowId, fallback) { return (HOME_COPY[rowId] && HOME_COPY[rowId].title) || title(rowId, fallback); }
  /** Erster Satz des Untertitels ohne den Liquiditaets-Zusatz („ — nur liquide …“). */
  function shortSub(text) {
    var s = String(text || "").replace(/\s+—\s+nur liquide.*$/i, "").trim();
    return s && !/[.?!]$/.test(s) ? s + "." : s;
  }
  function homeSub(rowId, subtitle) { return (HOME_COPY[rowId] && HOME_COPY[rowId].sub) || shortSub(subtitle); }
  function genre(id) { for (var i = 0; i < GENRES.length; i++) if (GENRES[i].id === id) return GENRES[i]; return null; }
  function genreOfRow(rowId) {
    var out = [];
    GENRES.forEach(function (g) { if (g.rows.indexOf(rowId) >= 0) out.push(g.id); });
    return out;
  }

  /** Hat die Karte eine Kursreihe (Punkte oder Pfad zur Reihe)? */
  function hasSeries(card) {
    var ps = card && card.priceSeries;
    if (!ps || ps.status === "MISSING" || ps.status === "WITHHELD") return false;
    return !!(ps.path || (ps.points && ps.points.length >= 2));
  }
  /** Schaufenster-Regel (Entscheidung 4): Kursreihe und 12 Monate ueber -60 %. */
  function showcase(card) {
    if (!card || !hasSeries(card)) return false;
    var r = card.metrics && card.metrics.return12M;
    return isNum(r) && r > SHOWCASE_MIN_RETURN_12M;
  }
  function showcaseCards(cards, k) {
    var out = (cards || []).filter(showcase);
    return isNum(k) ? out.slice(0, k) : out;
  }

  /** Verfuegbare Reihen aus meta.json: { rowId: matched } fuer eine Universe-ID. */
  function available(meta, universeId) {
    var u = ((meta && meta.rows) || []).filter(function (r) { return r.universeId === (universeId || "US_REAL"); })[0];
    var out = {};
    ((u && u.rows) || []).forEach(function (r) { if (r.returned > 0 && r.matched > 0) out[r.rowId] = r.matched; });
    return out;
  }

  /** Plan der Startseite.
      avail: { rowId: matched } (leere oder fehlende Reihen fallen weg),
      o.fresh: Liste/Set der Reihen mit neuen Treffern seit dem Vortag (Regel 3),
      o.personal: { recent: bool, more: bool } – persoenliche Reihen nur, wenn das Geraet etwas weiss,
      o.max: hoechstens so viele Reihen (Standard 14). */
  function homePlan(avail, o) {
    o = o || {};
    var fresh = o.fresh ? (Array.isArray(o.fresh) ? o.fresh : Array.from(o.fresh)) : [];
    var personal = o.personal || {};
    var slots = HOME_PLAN.filter(function (s) {
      if (s.kind === "rail" || s.kind === "top10") return !!(avail && avail[s.row]);
      if (s.kind === "strategies") return s.rows.some(function (id) { return avail && avail[id]; });
      if (s.kind === "recent") return !!personal.recent;
      if (s.kind === "more") return !!personal.more;
      return true;
    }).map(function (s) { return Object.assign({}, s); });
    /* Regel 3: stabile Teilung der beweglichen Reihen, dann zurueck in ihre Plaetze. */
    if (fresh.length) {
      var idx = [], mov = [];
      slots.forEach(function (s, i) { if (s.movable) { idx.push(i); mov.push(s); } });
      var a = mov.filter(function (s) { return fresh.indexOf(s.row) >= 0; }), b = mov.filter(function (s) { return fresh.indexOf(s.row) < 0; });
      a.concat(b).forEach(function (s, k) { slots[idx[k]] = s; });
    }
    return slots.slice(0, isNum(o.max) ? o.max : MAX_HOME_ROWS);
  }
  /** Reihen eines Genres in seiner Reihenfolge; leere fallen weg. Themen: eine Themen-Flaeche. */
  function genrePlan(genreId, avail) {
    var g = genre(genreId);
    if (!g) return [];
    if (g.id === "themen") return [{ kind: "themes", all: true }];
    return g.rows.filter(function (id) { return avail && avail[id]; }).map(function (id) {
      return { kind: "rail", row: id, tag: id === "fallen-angels" ? "NEU" : null, pill: id === "fallen-angels" ? "fromHigh" : null };
    });
  }
  /** Genre aus dem Adress-Zusatz, z. B. „#/?genre=unternehmen“. */
  function genreFromHash(hash) {
    var m = /[?&]genre=([a-z-]+)/.exec(String(hash || ""));
    return m && genre(m[1]) ? m[1] : null;
  }

  return {
    MAX_HOME_ROWS: MAX_HOME_ROWS, SHOWCASE_MIN_RETURN_12M: SHOWCASE_MIN_RETURN_12M,
    TITLES: TITLES, GENRES: GENRES, ALL_GROUPS: ALL_GROUPS, HOME_PLAN: HOME_PLAN, STRATEGY_COPY: STRATEGY_COPY,
    title: title, homeTitle: homeTitle, homeSub: homeSub, shortSub: shortSub, genre: genre, genreOfRow: genreOfRow,
    hasSeries: hasSeries, showcase: showcase, showcaseCards: showcaseCards,
    available: available, homePlan: homePlan, genrePlan: genrePlan, genreFromHash: genreFromHash
  };
});
