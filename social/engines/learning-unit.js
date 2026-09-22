/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/learning-unit.js

   ZWOELF DIMENSIONEN, DIE WIRKLICH MITGESCHRIEBEN WERDEN (§38-§41)

   -------------------------------------------------------------------------
   WARUM ES DIESE DATEI GIBT
   -------------------------------------------------------------------------

   §38 nennt zwoelf Dimensionen, die eine Learning Unit tragen muss.
   Gemessen wurden zwei: TOPIC und FORMAT.

   Nicht, weil die uebrigen nicht entschieden wuerden - sie werden
   entschieden, jede an ihrer Stelle: die Familie im Publikumsrahmen,
   der Hook-Archetyp in hook.js, die Visual Family in
   visual-grammar.js, die Atlas-Rolle gleich daneben. Sie kamen nur
   nie im Gedaechtnis an.

   Dazwischen stand eine von Hand gefuehrte Feldliste in
   run-social-cycle.mjs: siebzehn Zeilen, die ein `memory.add({...})`
   fuellen. Wer eine Dimension hinzufuegt, muss daran denken, sie dort
   einzutragen - und genau das ist in diesem Projekt schon dreimal
   schiefgegangen (der Byte-Abdruck, der Hook-Archetyp, die Belege des
   Hooks).

   Deshalb steht die Liste jetzt HIER, und zwar als Tabelle mit einer
   Lesefunktion je Dimension. Eine neue Dimension einzutragen heisst,
   sie mitzuschreiben; es gibt keinen zweiten Ort, an dem man es
   vergessen koennte.

   -------------------------------------------------------------------------
   EIN FELDNAME IST KEINE ERFASSTE DIMENSION
   -------------------------------------------------------------------------

   `contentFamily`, `storyStructure`, `hookStrategy` und
   `visualStrategy` stehen seit langem im Schema - und tragen in allen
   57 Eintraegen null. Ein Name ohne Wert sieht in jeder Uebersicht
   nach erfasster Dimension aus und ist keine. Das ist die passive
   Form dessen, was §38 verlangt.

   `erfassung()` zaehlt deshalb WERTE und nicht Felder.

   -------------------------------------------------------------------------
   WAS NICHT NACHGETRAGEN WIRD
   -------------------------------------------------------------------------

   Fuer Beitraege, die vor dieser Datei entstanden sind, bleiben die
   Dimensionen null. Nachtraeglich eine Familie oder einen Archetyp zu
   bestimmen waere eine Aussage ueber Beitraege, die niemand unter
   diesem Gesichtspunkt geschrieben hat - erfundene Messung, und
   davon hatten wir genug.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  function text(v) { return String(v === null || v === undefined ? "" : v); }
  function gefuellt(v) {
    return v !== null && v !== undefined && text(v).trim() !== "";
  }
  function liste(v) { return Array.isArray(v) ? v.slice() : []; }

  /* -------------------------------------------------------------------
     DIE TAGESZEIT ALS DIMENSION

     Nicht die Uhrzeit: 09:14 und 09:41 sind nicht zwei Lagen, sondern
     eine. Vier Abschnitte, die sich im Feed wirklich unterscheiden.
     ------------------------------------------------------------------- */
  var TAGESABSCHNITTE = [
    { id: "MORGEN", von: 5, bis: 11 },
    { id: "MITTAG", von: 11, bis: 15 },
    { id: "ABEND", von: 15, bis: 22 },
    { id: "NACHT", von: 22, bis: 5 }
  ];

  function stundenAbschnitt(h) {
    if (typeof h !== "number" || !isFinite(h) || h < 0 || h > 23) return null;
    for (var i = 0; i < TAGESABSCHNITTE.length; i++) {
      var a = TAGESABSCHNITTE[i];
      if (a.von < a.bis ? (h >= a.von && h < a.bis) : (h >= a.von || h < a.bis)) {
        return a.id;
      }
    }
    return null;
  }

  function tagesabschnitt(iso) {
    if (!gefuellt(iso)) return null;
    var t = Date.parse(iso);
    if (!isFinite(t)) return null;
    var h = new Date(t).getUTCHours();
    for (var i = 0; i < TAGESABSCHNITTE.length; i++) {
      var a = TAGESABSCHNITTE[i];
      if (a.von < a.bis ? (h >= a.von && h < a.bis) : (h >= a.von || h < a.bis)) {
        return a.id;
      }
    }
    return null;
  }

  /* -------------------------------------------------------------------
     DIE ZWOELF AUS §38

     `feld` ist der Name im Gedaechtniseintrag, `lies` holt den Wert aus
     dem, was zum Zeitpunkt des Schreibens dasteht. `stufe` sagt, WANN
     die Dimension feststeht:

       PAKET   sobald das Content Package fertig ist
       BILD    erst, wenn das Bild geplant und vermessen ist

     Die Trennung ist keine Ordnung, sondern eine Tatsache ueber den
     Ablauf: das Gedaechtnis wird geschrieben, bevor das Bild
     entsteht. Ohne sie muesste eine Bilddimension beim Schreiben
     geraten werden - und geraten ist hier dasselbe wie erfunden.
     ------------------------------------------------------------------- */
  var DIMENSIONEN = [
    {
      id: "CONTENT_FAMILY", feld: "contentFamily", stufe: "PAKET",
      zweck: "Welche Art Beitrag. Ohne sie laesst sich nicht fragen, ob " +
        "Rankings besser tragen als Erklaerstuecke.",
      lies: function (k) {
        var p = k.package || {};
        if (gefuellt(p.contentFamily)) return text(p.contentFamily);
        if (k.audienceFrame && gefuellt(k.audienceFrame.family)) {
          return text(k.audienceFrame.family);
        }
        if (k.decision && gefuellt(k.decision.family)) return text(k.decision.family);
        return gefuellt(p.archetype) ? text(p.archetype) : null;
      }
    },
    {
      id: "TOPIC", feld: "topic", stufe: "PAKET",
      zweck: "Der Gegenstand.",
      lies: function (k) {
        return gefuellt((k.package || {}).topic) ? text(k.package.topic) : null;
      }
    },
    {
      id: "ANGLE", feld: "angle", stufe: "PAKET",
      zweck: "Die redaktionelle Frage (§8, EDITORIAL_ANGLE). Sie ist nicht " +
        "das interne Signal und nicht die Hook.",
      lies: function (k) {
        if (k.audienceFrame && gefuellt(k.audienceFrame.coreQuestion)) {
          return text(k.audienceFrame.coreQuestion);
        }
        if (k.decision && gefuellt(k.decision.question)) {
          return text(k.decision.question);
        }
        return gefuellt(k.angle) ? text(k.angle) : null;
      }
    },
    {
      id: "HOOK_ARCHETYPE", feld: "hookArchetype", stufe: "PAKET",
      zweck: "Welcher Einstieg gewaehlt wurde (§9). Genau der Wert, den " +
        "hook.js spaeter als gemessene Leistung zurueckbekommt.",
      lies: function (k) {
        return gefuellt((k.package || {}).hookArchetype)
          ? text(k.package.hookArchetype) : null;
      }
    },
    {
      id: "STORY_STRUCTURE", feld: "storyStructure", stufe: "PAKET",
      zweck: "Der Aufbau, als Folge seiner Beats.",
      lies: function (k) {
        var b = liste(k.structure && k.structure.beats)
          .map(function (x) { return text(x && x.id ? x.id : x); })
          .filter(gefuellt);
        return b.length ? b.join(">") : null;
      }
    },
    {
      id: "VISUAL_FAMILY", feld: "visualFamily", stufe: "BILD",
      zweck: "Die Visual Family aus §16. Sie entscheidet, ob der Feed auf " +
        "ein Layout kollabiert (§19).",
      lies: function (k) {
        var g = k.plan && k.plan.grammatik;
        return g && gefuellt(g.familie) ? text(g.familie) : null;
      }
    },
    {
      id: "ATLAS_ROLE", feld: "atlasRole", stufe: "BILD",
      zweck: "Welche Rolle Atlas im Bild hatte (§17). OHNE_ATLAS ist eine " +
        "Antwort und keine Luecke.",
      lies: function (k) {
        var g = k.plan && k.plan.grammatik;
        if (!g) return null;
        return gefuellt(g.atlasRolle) ? text(g.atlasRolle) : "OHNE_ATLAS";
      }
    },
    {
      id: "TEXT_ON_VISUAL_PATTERN", feld: "textOnVisualPattern", stufe: "BILD",
      zweck: "Welches Textmuster das Bild trug (§13): welche Rolle fuehrte, " +
        "und aus wie vielen Textbloecken bestand es.",
      lies: function (k) {
        var m = k.scrollStop;
        var g = k.plan && k.plan.grammatik;
        var fuehrend = (g && gefuellt(g.dominantesTextRolle))
          ? text(g.dominantesTextRolle) : null;
        var n = (k.plan && k.plan.messung && liste(k.plan.messung.texte).length)
          || (m && liste(m.rollen).length) || null;
        if (!fuehrend && !n) return null;
        return (fuehrend || "UNBEKANNT") + ":" + (n === null ? "?" : n);
      }
    },
    {
      id: "FORMAT", feld: "mediaFormat", stufe: "PAKET",
      zweck: "Der Container der Plattform (IMAGE, CAROUSEL, REEL).",
      lies: function (k) {
        var p = k.package || {};
        if (gefuellt(p.mediaFormat)) return text(p.mediaFormat);
        /* Aus der Bildform abgeleitet, und zwar nur dort, wo sie den
           Container wirklich festlegt. */
        if (p.visualType === "CAROUSEL") return "CAROUSEL";
        if (p.visualType === "MOTION_GRAPHIC" || p.visualType === "VIDEO") {
          return "REEL";
        }
        return gefuellt(p.visualType) ? "IMAGE" : null;
      }
    },
    {
      id: "HASHTAG_SET", feld: "hashtagSet", stufe: "PAKET",
      zweck: "Welche Hashtags zusammen standen - als Satz, nicht einzeln.",
      lies: function (k) {
        var h = liste((k.package || {}).hashtags.length
          ? k.package.hashtags
          : ((k.decision && k.decision.hashtags) || []))
          .map(function (x) { return text(x).replace(/^#/, "").toLowerCase(); })
          .filter(gefuellt).sort();
        return h.length ? h.join(",") : null;
      }
    },
    {
      id: "DAYPART", feld: "daypart", stufe: "PAKET",
      zweck: "Der Tagesabschnitt. Nicht die Uhrzeit: 09:14 und 09:41 sind " +
        "nicht zwei Lagen.",
      lies: function (k) {
        var p = k.package || {};
        /* Die geplante Stunde steht als Zahl in der Entscheidung. Sie
           ist der Zeitpunkt, um den es geht - nicht der, zu dem der
           Lauf zufaellig lief. */
        var stunde = k.decision ? k.decision.plannedHourUtc : null;
        if (typeof stunde === "number" && isFinite(stunde)) {
          return stundenAbschnitt(stunde);
        }
        return tagesabschnitt(k.plannedFor || p.publishedAt || k.now);
      }
    },
    {
      id: "EXPLORE_EXPLOIT_STATE", feld: "exploreExploit", stufe: "PAKET",
      zweck: "Ob dieser Beitrag auf Bewaehrtes gesetzt hat oder etwas " +
        "ausprobiert. Ohne das laesst sich ein Fehlschlag nicht von " +
        "einem Versuch unterscheiden.",
      lies: function (k) {
        if (gefuellt(k.exploreExploit)) return text(k.exploreExploit);
        return (k.decision && gefuellt(k.decision.mode))
          ? text(k.decision.mode) : null;
      }
    }
  ];

  var DIMENSION_IDS = DIMENSIONEN.map(function (d) { return d.id; });

  /**
   * Die Dimensionen, die zu diesem Zeitpunkt feststehen.
   *
   * `stufe` waehlt aus: "PAKET" beim Schreiben des Eintrags, "BILD"
   * sobald der Renderplan vorliegt. Ohne Angabe: alles, was `kontext`
   * hergibt.
   */
  function ausKontext(kontext, stufe) {
    var k = kontext || {};
    var aus = {};
    DIMENSIONEN.forEach(function (d) {
      if (stufe && d.stufe !== stufe) return;
      var wert;
      try { wert = d.lies(k); } catch (e) { wert = null; }
      aus[d.feld] = gefuellt(wert) ? wert : null;
    });
    return aus;
  }

  /**
   * Die Bilddimensionen in einen bestehenden Eintrag nachtragen.
   *
   * NUR dort, wo noch nichts steht. Ein vorhandener Wert wird nicht
   * ueberschrieben: das Gedaechtnis ist ein Register und kein
   * Arbeitsblatt, und ein zweites Schreiben auf dasselbe Feld waere
   * genau die Stelle, an der zwei Wahrheiten entstehen.
   */
  function ergaenze(eintrag, kontext) {
    if (!eintrag) return eintrag;
    var neu = ausKontext(kontext, "BILD");
    Object.keys(neu).forEach(function (feld) {
      if (neu[feld] === null) return;
      if (gefuellt(eintrag[feld])) return;
      eintrag[feld] = neu[feld];
    });
    return eintrag;
  }

  /**
   * Wie viele der zwoelf werden ueber diese Eintraege WIRKLICH erfasst.
   *
   * Gezaehlt werden Werte, nicht Felder. Ein Feldname, in dem ueberall
   * null steht, ist keine erfasste Dimension.
   */
  function erfassung(eintraege) {
    var e = liste(eintraege).filter(Boolean);
    var getragen = [], fehlend = [], zaehlung = {};
    DIMENSIONEN.forEach(function (d) {
      var n = e.filter(function (x) { return gefuellt(x[d.feld]); }).length;
      zaehlung[d.id] = n;
      (n > 0 ? getragen : fehlend).push(d.id);
    });
    return {
      gesamt: DIMENSIONEN.length,
      eintraege: e.length,
      getragen: getragen,
      fehlend: fehlend,
      zaehlung: zaehlung,
      vollstaendig: fehlend.length === 0
    };
  }

  /* -------------------------------------------------------------------
     §39/§40 — WAS ERFASST IST, DARF EINE SPAETERE AUSWAHL BEEINFLUSSEN

     Je Dimension und Wert: wie oft, und mit welcher GEMESSENEN
     Leistung. Eintraege ohne Messung zaehlen bei der Haeufigkeit mit
     und bei der Leistung NICHT - sonst waere ein ungesendeter Beitrag
     ein Beitrag mit Leistung null, und Ungemessenes saehe aus wie
     Misserfolg.

     `mindestens` ist die Untergrenze, ab der ueber einen Wert
     ueberhaupt etwas gesagt wird. Darunter steht `genug: false`, und
     der Aufrufer bekommt nichts, das er fuer eine Messung halten
     koennte.
     ------------------------------------------------------------------- */
  var MINDEST_STICHPROBE = 3;

  function leistung(eintraege, options) {
    var o = options || {};
    var mindestens = typeof o.mindestens === "number" ? o.mindestens
      : MINDEST_STICHPROBE;
    var wert = typeof o.wert === "function" ? o.wert : function (e) {
      var p = e && e.performance;
      if (!p || typeof p !== "object") return null;
      var v = p.engagementRate;
      return typeof v === "number" && isFinite(v) ? v : null;
    };

    var e = liste(eintraege).filter(Boolean);
    var aus = {};
    DIMENSIONEN.forEach(function (d) {
      var gruppen = {};
      e.forEach(function (x) {
        var v = x[d.feld];
        if (!gefuellt(v)) return;
        var key = text(v);
        if (!gruppen[key]) gruppen[key] = { wert: key, anzahl: 0, gemessen: [] };
        gruppen[key].anzahl += 1;
        var l = wert(x);
        if (l !== null) gruppen[key].gemessen.push(l);
      });
      aus[d.id] = Object.keys(gruppen).map(function (key) {
        var g = gruppen[key];
        var genug = g.gemessen.length >= mindestens;
        return {
          wert: g.wert,
          anzahl: g.anzahl,
          gemessen: g.gemessen.length,
          genug: genug,
          /* Ohne genug Messungen KEIN Mittelwert. Eine Zahl aus einer
             Beobachtung ist keine Leistung, sie ist ein Einzelfall mit
             Nachkommastellen. */
          mittel: genug
            ? g.gemessen.reduce(function (s, v) { return s + v; }, 0) /
              g.gemessen.length
            : null
        };
      }).sort(function (a, b) {
        if (a.mittel === null && b.mittel === null) return b.anzahl - a.anzahl;
        if (a.mittel === null) return 1;
        if (b.mittel === null) return -1;
        return b.mittel - a.mittel;
      });
    });
    return { mindestens: mindestens, dimensionen: aus };
  }

  /**
   * Die Leistung einer Dimension in der Form, die hook.js erwartet:
   * { ARCHETYP: zahl }. Nur belegte Werte, nur mit genug Messungen.
   *
   * Was hier nicht drinsteht, fliesst dort NICHT ein - und nicht etwa
   * als neutraler Mittelwert, der so tut, als waere gemessen worden.
   */
  function alsGewichte(leistungsbefund, dimensionId, options) {
    var o = options || {};
    var faktor = typeof o.faktor === "number" ? o.faktor : 1;
    var reihe = (leistungsbefund && leistungsbefund.dimensionen &&
      leistungsbefund.dimensionen[dimensionId]) || [];
    var aus = {};
    reihe.forEach(function (r) {
      if (!r.genug || r.mittel === null) return;
      aus[r.wert] = r.mittel * faktor;
    });
    return aus;
  }

  var api = {
    DIMENSIONEN: DIMENSIONEN,
    DIMENSION_IDS: DIMENSION_IDS,
    TAGESABSCHNITTE: TAGESABSCHNITTE,
    MINDEST_STICHPROBE: MINDEST_STICHPROBE,
    tagesabschnitt: tagesabschnitt,
    stundenAbschnitt: stundenAbschnitt,
    ausKontext: ausKontext,
    ergaenze: ergaenze,
    erfassung: erfassung,
    leistung: leistung,
    alsGewichte: alsGewichte
  };

  if (isNode) module.exports = api;
  else global.VUSocialLearningUnit = api;
})(typeof window !== "undefined" ? window : globalThis);
