/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/web-research.js

   WEB-FIRST CONTENT RESEARCH (Owner-Direktive "DIRECT CREATIVE GOLDEN
   PATH — FINAL GO/NO-GO", 23.09.)

   Der Owner hat Discovery/Quant/Opportunity Slate/Screener explizit als
   Themenquelle fuer den Social-Agenten ausgeschlossen. Dieses Modul
   kennt keines dieser Systeme - es nimmt eine Liste roher Web-Items
   entgegen (title, link, description, pubDate, source; von einem
   separaten, netzseitigen Skript geliefert) und macht daraus:

     STORY SELECTION -> FAKTEN -> HOOK-WETTBEWERB -> CAPTION -> HASHTAGS
     -> BILD-MOTIV.

   GROUNDING-REGEL (keine Ausnahme): jeder Hook-Kandidat und jede in der
   Caption genannte Zahl muss woertlich (oder als direkt ableitbare
   Umformulierung) im gelieferten title/description der Quelle stehen.
   Nichts wird berechnet, geschaetzt oder erfunden - dieselbe Disziplin,
   die EvidenceShape/ClaimBinding fuer die interne Evidenz durchsetzen,
   hier nur gegen Web-Text statt gegen Quant-Bundles.

   Rein funktional, kein Netzzugriff, vollstaendig ohne Netz testbar.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var CreativeGate = isNode ? require("./creative-gate.js") : global.VUSocialCreativeGate;
  var nodeCrypto = isNode ? require("crypto") : null;

  function text(v) { return String(v === null || v === undefined ? "" : v).trim(); }
  function gefuellt(v) { return text(v).length > 0; }

  /* ------------------------------------------------------- Themenwelten
     Dieselben Beispiel-Themenfelder, die der Owner in der Direktive (§2)
     nennt. Dient sowohl der VISUAL_POTENTIAL-Bewertung als auch der
     Bildmotiv-Ableitung — keine abschliessende Liste, nur ein Signal. */
  var THEMENWELTEN = [
    { id: "AI", label: "Kuenstliche Intelligenz",
      begriffe: ["ki", "kuenstliche intelligenz", "artificial intelligence", " ai ", "ai-",
        "machine learning", "chatbot", "large language model", "llm", "openai", "anthropic"],
      motiv: "monumentale, futuristische KI-Recheninfrastruktur: Serverreihen, " +
        "Lichtlinien, gewaltige Skalierung, kuehles Blau/Violett, cineastische Tiefe" },
    { id: "SEMICONDUCTORS", label: "Halbleiter",
      begriffe: ["halbleiter", "chip", "chips", "semiconductor", "wafer", "fab", "foundry",
        "lithograph", "nvidia", "amd", "tsmc", "intel"],
      motiv: "Chipfertigung: Wafer, Reinraum, Praezisionsoptik, Mikrostrukturen in " +
        "Makroaufnahme, sterile High-Tech-Aesthetik" },
    { id: "CLOUD_DATACENTER", label: "Cloud / Rechenzentren",
      begriffe: ["cloud", "rechenzentrum", "datacenter", "data center", "server",
        "hyperscale", "aws", "azure", "microsoft cloud"],
      motiv: "monumentale Rechenzentrumshalle, endlose Serverreihen, Lichtreflexe, " +
        "industrielle Groesse und Massstab" },
    { id: "CYBERSECURITY", label: "Cybersecurity",
      begriffe: ["cybersecurity", "cyberangriff", "hacker", "datenleck", "ransomware",
        "verschluesselung", "sicherheitsluecke"],
      motiv: "digitale Verteidigungswelt: Schutzschichten, Datenstroeme, ein " +
        "Sicherheitsschild-Motiv, dunkles, angespanntes Editorial-Licht" },
    { id: "ROBOTICS", label: "Robotik",
      begriffe: ["robotik", "roboter", "humanoid", "automation", "fertigungsroboter"],
      motiv: "industrielle oder humanoide Robotik in Aktion, praezise Mechanik, " +
        "Fabrikhalle oder Laborumgebung, kuehles Industrielicht" },
    { id: "AUTONOMOUS_DRIVING", label: "Autonomes Fahren",
      begriffe: ["autonomes fahren", "selbstfahrend", "self-driving", "robotaxi",
        "autopilot", "fsd"],
      motiv: "autonomes Fahrzeug auf naechtlicher Stadtstrasse, Sensor-Lichtpunkte, " +
        "Bewegungsunschaerfe, futuristische Nachtstimmung" },
    { id: "EV", label: "Elektromobilitaet",
      begriffe: ["elektroauto", "e-auto", "elektromobilitaet", "ev ", "batteriefabrik",
        "ladeinfrastruktur", "tesla", "e-fahrzeug"],
      motiv: "Elektrofahrzeug-Produktion oder Ladeinfrastruktur, klare Linien, " +
        "elektrisches Blau, Zukunftsoptimismus" },
    { id: "ENERGY", label: "Energie",
      begriffe: ["energie", "solarenergie", "wind kraft", "windkraft", "erneuerbare",
        "batteriespeicher", "stromnetz", "kernenergie", "raffinerie", "pipeline",
        "erdoel", "erdgas", "oel-", " opec"],
      motiv: "grosse Energieinfrastruktur: Raffinerie, Pipeline, Solarfeld, Windpark " +
        "oder Stromnetz bei goldenem Licht, Massstab und Zukunftskraft" },
    /* -------------------------------------------------------------------
       DIE FEHLENDEN THEMENWELTEN — OWNER-DIREKTIVE "WEB-FIRST +
       FULL-POST-GENERATION" (24.09.), §3.2

       Realer Befund: "10-year U.S. Treasury yield tops 5.1%, marking its
       highest level since 2007" fiel durch alle acht bisherigen
       Themenwelten (thema=null) und landete beim generischen
       Rechenzentrums-Motiv — genau der Motiv-Bruch, den §3.2 ausdruecklich
       verbietet (Treasury/Zinsen/Makro darf KEIN Rechenzentrum sein). */
    { id: "MACRO_RATES", label: "Zinsen / Anleihen / Makro",
      begriffe: ["zins", "leitzins", "anleihe", "staatsanleihe", "treasury", "bond yield",
        "rendite", "inflation", "notenbank", "zentralbank", "federal reserve", " fed ",
        "fed-", "ezb", "rezession", "konjunktur", "bruttoinlandsprodukt", " bip "],
      motiv: "Finanzwelt der Zinsen und Anleihen: Trading Floor, Kursmonitore mit " +
        "Zinskurven, Zentralbankgebaeude oder Boersenlicht bei Nacht — kein " +
        "Rechenzentrum, kein Serverraum, kein Technologie-Motiv" },
    { id: "MARKETS", label: "Boerse / Maerkte",
      begriffe: ["aktienmarkt", "boerse", "index", "s&p 500", "nasdaq", "dow jones",
        "dax", "aktienkurs", "boersenkurs", "handelstag", "marktkapitalisierung"],
      motiv: "Trading Floor, Kurstafeln, Broker in Bewegung, dynamisches Boersenlicht, " +
        "Finanzdistrikt bei Nacht" },
    { id: "AUTOMOTIVE", label: "Automobil",
      begriffe: ["automobil", "autohersteller", "fahrzeugproduktion", "automesse",
        "autoindustrie", "pkw", "neuwagen", "bmw", "mercedes", "volkswagen", "porsche"],
      motiv: "Automobil-Fertigungslinie oder Premium-Fahrzeugdesign im Studiolicht, " +
        "praezise Linienfuehrung, industrielle Eleganz" },
    { id: "LUXURY", label: "Luxus / Mode",
      begriffe: ["luxus", "luxusmarke", "premiummarke", "mode", "modehaus", "lvmh",
        "haute couture", "designerlabel", "boutique"],
      motiv: "Premium-Editorial-Szene: Boutique, Laufsteg oder Atelier, warmes " +
        "gedaempftes Licht, edle Materialitaet, kein Technologie-Motiv" },
    { id: "CONSUMER", label: "Konsum / Einzelhandel",
      begriffe: ["einzelhandel", "konsumverhalten", "konsumausgaben", "verbrauchermarkt",
        "handelskette", "e-commerce", "onlinehandel"],
      motiv: "Einzelhandels- oder Konsumwelt: belebte Ladenzeile, Logistikzentrum oder " +
        "Regalreihen bei warmem Licht, Massstab des Handels" },
    { id: "TRAVEL", label: "Reisen / Verkehr",
      begriffe: ["reisebranche", "tourismus", "fluggesellschaft", "airline", "flughafen",
        "kreuzfahrt", "reiseverkehr", "bahnverkehr"],
      motiv: "Reise- und Verkehrswelt: Flughafenterminal, Bahnhof oder Destination bei " +
        "dynamischem Licht, Bewegung und Aufbruch" }
  ];

  /* Wortgrenzen-sicherer Begriffs-Treffer. Ein reiner indexOf() traf im
     realen Betrieb "ki" (Kuenstliche Intelligenz) mitten in "marKIng"
     (Treasury-Meldung, 23.09.) - ein falscher Themen-/Hashtag-Treffer
     ohne jeden inhaltlichen Bezug. Kurze Begriffe (Abkuerzungen wie
     "ki", "kfz", "ki-") brauchen echte Wortgrenzen; Begriffe, die
     selbst schon mit Leerzeichen/Bindestrich umschlossen sind (" ai ",
     "ai-"), behalten ihre eigene Grenze. */
  function enthaeltBegriff(haystackKlein, begriffKlein) {
    var vorGrenze = /^\s/.test(begriffKlein) ? "" : "\\b";
    var nachGrenze = /[\s-]$/.test(begriffKlein) ? "" : "\\b";
    var muster = vorGrenze + begriffKlein.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + nachGrenze;
    return new RegExp(muster).test(haystackKlein);
  }

  function themaFuer(t) {
    var l = text(t).toLowerCase();
    for (var i = 0; i < THEMENWELTEN.length; i += 1) {
      var w = THEMENWELTEN[i];
      for (var j = 0; j < w.begriffe.length; j += 1) {
        if (enthaeltBegriff(l, w.begriffe[j])) return w;
      }
    }
    return null;
  }

  /* ---------------------------------------------------------- Aktualitaet
     Verlangt ein pubDate, das sich als Zeitpunkt lesen laesst. Kein Datum
     -> ausgeschlossen: erfundene Aktualitaet ist eine Direktiv-Verletzung
     (§3), keine tolerierte Luecke. */
  function parseDatum(roh) {
    if (!gefuellt(roh)) return null;
    var d = new Date(roh);
    if (isNaN(d.getTime())) return null;
    return d;
  }

  function aktuell(items, options) {
    options = options || {};
    var jetzt = options.now ? new Date(options.now) : new Date();
    var fenster = (typeof options.fensterStunden === "number") ? options.fensterStunden : 72;
    var ergebnis = [];
    (items || []).forEach(function (roh) {
      var datum = parseDatum(roh && roh.pubDate);
      if (!datum) return;
      var alterStunden = (jetzt.getTime() - datum.getTime()) / 3600000;
      if (alterStunden < 0 || alterStunden > fenster) return;
      ergebnis.push(Object.assign({}, roh, {
        publishedAt: datum.toISOString(),
        ageHours: alterStunden
      }));
    });
    return ergebnis;
  }

  /* --------------------------------------------------------------- Fakten
     Extrahiert woertliche Zahlen-Belege aus title+description. Jeder
     Treffer traegt den Satz, in dem er steht — die spaetere Hook-/
     Caption-Bildung darf NUR aus diesen Saetzen zitieren/umformulieren,
     nie eine eigene Zahl erfinden. */
  /* \d{4,} zuerst: eine zusammenhaengende Ziffernfolge ohne
     Tausendertrennzeichen (z.B. eine Jahreszahl "2007") darf nicht an
     der \d{1,3}-Alternative in "200"+"7" zerbrechen - die kuerzere
     Alternative wuerde sonst zuerst greifen und nur die ersten drei
     Ziffern verbrauchen. */
  var ZAHL_MUSTER = /(\d{4,}(?:[.,]\d+)?|\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*(%|prozent|mrd\.?|mio\.?|milliarden|millionen|usd|eur|dollar|euro|\$|€)?/gi;

  /* Kein Satzende direkt nach einem einzelnen Grossbuchstaben ("U.S.",
     "U.K.") - ein realer Treasury-Titel ("10-year U.S. Treasury yield
     tops 5.1%...") zerbrach sonst an "U.S." in zwei Fragmente, und die
     Caption zitierte beide, das zweite als sinnlosen Rest ("10-year
     U.S."). Deckt keine laengeren Abkuerzungen ("Inc.", "Corp.") ab -
     baueCaption()s Substring-Deduplizierung faengt einen dadurch
     entstehenden Rest zusaetzlich ab. */
  function saetze(t) {
    return text(t).split(/(?<!\b[A-Z]\.)(?<=[.!?])\s+/).map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
  }

  /* Titel und Beschreibung als eigene Saetze behandeln: ohne Schlusszeichen
     am Titel verschmilzt der Satzsplitter sonst Titel und ersten
     Beschreibungssatz zu einem einzigen, unbrauchbaren "Satz". */
  function alsSaetze(titel, beschreibung) {
    var t = text(titel);
    if (t && !/[.!?]$/.test(t)) t += ".";
    return [t, text(beschreibung)].filter(gefuellt).join(" ");
  }

  function sammleFakten(item) {
    var volltext = alsSaetze(item && item.title, item && item.description);
    var alleSaetze = saetze(volltext);
    var fakten = [];
    var gesehen = {};
    alleSaetze.forEach(function (satz) {
      var treffer;
      ZAHL_MUSTER.lastIndex = 0;
      while ((treffer = ZAHL_MUSTER.exec(satz)) !== null) {
        var wert = treffer[1];
        var einheit = treffer[2] || null;
        var schluessel = wert + "|" + (einheit || "");
        if (gesehen[schluessel]) continue;
        gesehen[schluessel] = true;
        fakten.push({ statement: satz, value: wert, unit: einheit });
      }
    });
    return fakten;
  }

  /* ---------------------------------------------------- Story-Bewertung
     Zehn Kriterien aus §5 der Direktive, heuristisch und erklaerbar -
     keine Erfindung von Signalen, die im Text nicht stehen. */
  var INVESTOR_BEGRIFFE = ["aktie", "aktien", "boerse", "investor", "anleger", "umsatz",
    "gewinn", "prognose", "kurs", "ipo", "uebernahme", "fusion", "dividende", "guidance",
    "quartalszahlen", "marktanteil", "kapazitaet", "investition", "milliarden", "wall street"];
  var UEBERRASCHUNG_BEGRIFFE = ["rekord", "ueberraschend", "erstmals", "entgegen", "trotz",
    "unerwartet", "einbruch", "sprung", "verdoppelt", "explodiert", "crash", "schock",
    "historisch", "hoechststand", "tiefststand"];
  var NEUHEIT_BEGRIFFE = ["erstmals", "startet", "kuendigt an", "neu", "premiere",
    "debuet", "vorstellung", "launch"];
  var KONTRAST_BEGRIFFE = ["aber", "doch", "trotzdem", "obwohl", "waehrend", "dennoch"];

  /* Bewusst PLAIN indexOf(), nicht enthaeltBegriff(): diese Begriffslisten
     (NEUHEIT/INVESTOR/UEBERRASCHUNG/KONTRAST) sind kurze deutsche
     Wortstaemme, die absichtlich auch flektierte Formen treffen sollen
     ("neu" in "neuen", "neue", "neues"). Der reale "ki"-in-"marKIng"-Fund
     betraf ausschliesslich THEMENWELTEN/themaFuer() (Fremdwort-Abkuerzung
     als isoliertes Akronym) - nicht diese Stamm-Listen. */
  function zaehleTreffer(t, begriffe) {
    var l = text(t).toLowerCase();
    var n = 0;
    begriffe.forEach(function (b) { if (l.indexOf(b) !== -1) n += 1; });
    return n;
  }

  function bewerteStory(item, fakten, options) {
    options = options || {};
    var volltext = [text(item.title), text(item.description)].join(" ");
    var thema = themaFuer(volltext);

    var currentRelevance = Math.max(0, 10 - (item.ageHours / 7.2));
    var investorRelevance = Math.min(10, zaehleTreffer(volltext, INVESTOR_BEGRIFFE) * 2.5);
    var surprise = Math.min(10, zaehleTreffer(volltext, UEBERRASCHUNG_BEGRIFFE) * 4);
    var curiosity = Math.min(10,
      (volltext.indexOf("?") !== -1 ? 4 : 0) + zaehleTreffer(volltext, KONTRAST_BEGRIFFE) * 3);
    var laenge = text(item.description).length || text(item.title).length;
    var understandability = laenge === 0 ? 3 : Math.max(0, 10 - Math.max(0, laenge - 220) / 40);
    var evidenceStrength = Math.min(10, fakten.length * 3);
    var sharePotential = Math.min(10, fakten.length * 2 + (surprise > 0 ? 2 : 0));
    var savePotential = Math.min(10, evidenceStrength * 0.6 + investorRelevance * 0.4);
    var visualPotential = thema ? 9 : 3;
    var novelty = Math.min(10, zaehleTreffer(volltext, NEUHEIT_BEGRIFFE) * 3.5);

    var teile = {
      CURRENT_RELEVANCE: currentRelevance, INVESTOR_RELEVANCE: investorRelevance,
      SURPRISE: surprise, CURIOSITY: curiosity, UNDERSTANDABILITY: understandability,
      SHARE_POTENTIAL: sharePotential, SAVE_POTENTIAL: savePotential,
      VISUAL_POTENTIAL: visualPotential, EVIDENCE_STRENGTH: evidenceStrength,
      NOVELTY: novelty
    };
    var punkte = Object.keys(teile).reduce(function (s, k) { return s + teile[k]; }, 0) / 10;

    return { item: item, thema: thema, fakten: fakten, punkte: punkte, teile: teile,
      erklaerung: "Punktzahl " + punkte.toFixed(1) + "/10 aus zehn Kriterien (§5); " +
        (thema ? "Themenwelt " + thema.label + " erkannt." : "keine der Beispiel-Themenwelten erkannt (kein Ausschluss, nur ein Signal weniger).") };
  }

  function waehleStory(rawItems, options) {
    options = options || {};
    var frisch = aktuell(rawItems, options);
    if (!frisch.length) {
      return { ok: false, grund: "KEINE_AKTUELLEN_STORYS",
        erklaerung: "Keines der gelieferten Web-Items traegt ein lesbares, aktuelles " +
          "Datum innerhalb des Fensters (" + (options.fensterStunden || 72) + "h)." };
    }
    var kandidaten = frisch.map(function (item) {
      var fakten = sammleFakten(item);
      return bewerteStory(item, fakten, options);
    }).sort(function (a, b) { return b.punkte - a.punkte; });

    return { ok: true, gewaehlt: kandidaten[0], kandidaten: kandidaten,
      erklaerung: kandidaten.length + " aktuelle Story/Storys bewertet; gewaehlt: \"" +
        text(kandidaten[0].item.title) + "\" (" + kandidaten[0].punkte.toFixed(1) + "/10)." };
  }

  /* ------------------------------------------------------- Hook-Bau
     Jeder Kandidat MUSS grounded sein: seine inhaltstragenden Woerter
     (Laenge >= 4 oder Ziffern) muessen im Quelltext vorkommen. Das ist
     ein Sicherheitsnetz gegen Fehler in den Vorlagen unten, nicht die
     einzige Verteidigungslinie. */
  var MAX_HOOK_LAENGE = 120;

  function grounded(kandidatText, quelltext) {
    var quelleKlein = text(quelltext).toLowerCase();
    var worte = text(kandidatText).toLowerCase()
      .replace(/[^\wäöüß%.,\s-]/g, " ").split(/\s+/)
      .filter(function (w) { return w.length >= 4 || /\d/.test(w); });
    if (!worte.length) return false;
    var treffer = 0;
    worte.forEach(function (w) {
      var kern = w.replace(/[.,]$/, "");
      if (quelleKlein.indexOf(kern) !== -1) treffer += 1;
    });
    return (treffer / worte.length) >= 0.7;
  }

  function kuerzen(t, max) {
    var s = text(t);
    if (s.length <= max) return s;
    var geschnitten = s.slice(0, max - 1);
    var letzterRaum = geschnitten.lastIndexOf(" ");
    if (letzterRaum > max * 0.6) geschnitten = geschnitten.slice(0, letzterRaum);
    return geschnitten.trim() + "…";
  }

  function hookKandidaten(story) {
    var item = story.item;
    var fakten = story.fakten;
    var titel = text(item.title);
    var quelltext = [titel, text(item.description)].join(" ");
    var liste = [];

    function fuege(archetyp, satz) {
      var s = kuerzen(satz, MAX_HOOK_LAENGE);
      if (!gefuellt(s)) return;
      if (CreativeGate.istNegativeHookFixture(s)) return;
      if (!grounded(s, quelltext)) return;
      liste.push({ archetyp: archetyp, text: s });
    }

    /* AUTOR: der Originaltitel, gekuerzt — immer verfuegbar, per
       Definition zu 100% woertlich aus der Quelle. */
    fuege("AUTOR", titel);

    /* ZAHL: der Satz, der den staerksten Zahlenbeleg traegt. */
    if (fakten.length) {
      var staerkste = fakten.slice().sort(function (a, b) {
        return String(b.value).length - String(a.value).length;
      })[0];
      fuege("ZAHL", staerkste.statement);
    }

    /* FRAGE: aus dem Titel eine Frage machen, wenn er nicht schon eine ist. */
    if (titel.indexOf("?") === -1) {
      fuege("FRAGE", "Was bedeutet " + (titel.length > 60 ? "das" : titel.replace(/\.$/, "")) +
        " fuer Anleger?");
    } else {
      /* Der Titel traegt die Frage oft nur als LETZTEN von mehreren
         Saetzen - eine typische Leserfrage-Ueberschrift ("Wir sind in
         den 50ern, keine Kinder, 2 Mio. in IRAs/401(k)s. Brauchen wir
         wirklich ein Testament?"). Den GANZEN Titel als FRAGE-Kandidat
         zu nehmen macht FRAGE strukturell identisch mit AUTOR - und
         beide verlieren dann gegen ZAHL, weil scrollStop lange Saetze
         hart abstraft (Fund vom 26.09., Owner-Test: "We have $2
         million..." (40 Zeichen) schlug "...Do we really need a
         will?" (26 Zeichen, aber nur als Teil des 115 Zeichen langen
         Gesamttitels bewertet) - der Hook zeigte eine Zahl ohne die
         Frage, die ihr erst Sinn gibt. Die tatsaechliche Frage - der
         Satz, der auf "?" endet - ist der eigentliche Hook und steht
         fuer sich allein. */
      var frageSatz = saetze(titel).filter(function (s) {
        return /\?\s*$/.test(s);
      }).pop();
      fuege("FRAGE", frageSatz || titel);
    }

    /* WARUM: Einordnungsfrage auf den Titel. */
    fuege("WARUM", "Warum " +
      (titel.length > 70 ? "diese Meldung gerade jetzt zaehlt." :
        titel.replace(/^./, function (c) { return c.toLowerCase(); }).replace(/\.$/, "") +
        " gerade jetzt zaehlt."));

    /* KONTRAST: wenn ein Kontrastwort im Text vorkommt, den Satz direkt uebernehmen. */
    saetze(quelltext).forEach(function (satz) {
      if (zaehleTreffer(satz, KONTRAST_BEGRIFFE) > 0) fuege("KONTRAST", satz);
    });

    return liste;
  }

  var GEWICHTE_HOOK = { SCROLL_STOP: 0.20, CLARITY: 0.15, CURIOSITY: 0.15,
    INVESTOR_RELEVANCE: 0.15, NOVELTY: 0.10, SHAREABILITY: 0.10, EVIDENCE_STRENGTH: 0.15 };

  function bewerteHook(kandidat, story) {
    var t = kandidat.text;
    var laenge = t.length;
    var scrollStop = laenge >= 25 && laenge <= 90 ? 10 : Math.max(0, 10 - Math.abs(laenge - 55) / 6);
    var clarity = laenge <= MAX_HOOK_LAENGE ? Math.max(0, 10 - Math.max(0, laenge - 70) / 8) : 0;
    var curiosity = (t.indexOf("?") !== -1 ? 6 : 0) + zaehleTreffer(t, KONTRAST_BEGRIFFE) * 3;
    var investorRelevance = Math.min(10, zaehleTreffer(t, INVESTOR_BEGRIFFE) * 3);
    var novelty = Math.min(10, zaehleTreffer(t, NEUHEIT_BEGRIFFE) * 4);
    var hatZahl = /\d/.test(t);
    var shareability = hatZahl ? 8 : (kandidat.archetyp === "FRAGE" ? 6 : 4);
    var evidenceStrength = hatZahl ? 9 : (kandidat.archetyp === "AUTOR" ? 6 : 3);

    var teile = { SCROLL_STOP: scrollStop, CLARITY: clarity, CURIOSITY: Math.min(10, curiosity),
      INVESTOR_RELEVANCE: investorRelevance, NOVELTY: novelty, SHAREABILITY: shareability,
      EVIDENCE_STRENGTH: evidenceStrength };
    var punkte = Object.keys(teile).reduce(function (s, k) {
      return s + teile[k] * GEWICHTE_HOOK[k];
    }, 0);
    return Object.assign({}, kandidat, { punkte: punkte, teile: teile });
  }

  function waehleHook(story) {
    var roh = hookKandidaten(story);
    if (!roh.length) {
      return { ok: false, grund: "KEIN_GROUNDED_HOOK",
        erklaerung: "Kein Hook-Kandidat besteht die Grounding-Pruefung oder die " +
          "Negative-Hook-Fixture-Sperre." };
    }
    var bewertet = roh.map(function (k) { return bewerteHook(k, story); })
      .sort(function (a, b) { return b.punkte - a.punkte || a.text.length - b.text.length; });
    return { ok: true, gewaehlt: bewertet[0], kandidaten: bewertet,
      erklaerung: bewertet.length + " Hook-Kandidat(en) im Wettbewerb; gewaehlt: \"" +
        bewertet[0].text + "\" (Archetyp " + bewertet[0].archetyp + ", " +
        bewertet[0].punkte.toFixed(1) + "/10)." };
  }

  /* ------------------------------------------------------------ Caption
     Social-first (§17): Einstieg (bewusst anders formuliert als der
     Hook, damit SCROLL_STOP_QUALITYs Wiederholungs-Pruefung nicht
     anschlaegt) -> was ist passiert -> warum relevant -> Fakten ->
     Einordnung -> Quelle -> Disclaimer. */
  function baueCaption(story, hookText) {
    var item = story.item;
    var titel = text(item.title);
    var beschreibung = text(item.description);
    var quelle = text(item.source) || "Quelle";
    var datum = story.item.publishedAt ? new Date(story.item.publishedAt) : null;
    var datumText = datum ? datum.toISOString().slice(0, 10) : null;
    var hookKlein = text(hookText).toLowerCase().replace(/[.!?]+$/, "");

    var koerper = [];
    var gesehen = {};
    function fuegeSatz(s) {
      var sauber = text(s);
      if (!gefuellt(sauber)) return;
      var schluessel = sauber.toLowerCase().replace(/[.!?]+$/, "");
      /* Kein Satz, der wortgleich der Hook ist — sonst wiederholt der
         erste Caption-Satz den Bildtext (SCROLL_STOP_QUALITYs
         HOOK_WIEDERHOLT_CAPTION-Pruefung). Kein Satz doppelt. */
      if (schluessel === hookKlein || gesehen[schluessel]) return;
      /* Sicherheitsnetz gegen einen fehlerhaften Satzsplitter (z.B. an
         "U.S."): ein Fragment, das bereits Teilstring eines schon
         aufgenommenen Satzes ist - oder ihn selbst enthaelt -, traegt
         keine neue Information und wuerde nur eine sichtbare
         Wiederholung erzeugen. */
      for (var i = 0; i < koerper.length; i += 1) {
        var vorhanden = koerper[i].toLowerCase().replace(/[.!?]+$/, "");
        if (vorhanden.indexOf(schluessel) !== -1 || schluessel.indexOf(vorhanden) !== -1) return;
      }
      gesehen[schluessel] = true;
      koerper.push(sauber);
    }

    if (beschreibung && beschreibung !== titel) {
      saetze(beschreibung).forEach(fuegeSatz);
    } else {
      fuegeSatz(titel);
    }
    story.fakten.forEach(function (f) { fuegeSatz(f.statement); });

    if (!koerper.length) fuegeSatz(titel);

    koerper.push("Fuer Anleger zaehlt hier weniger die Momentaufnahme als die Richtung, " +
      "die sich daraus ablesen laesst.");
    koerper.push("Stand von heute — keine Kauf- oder Verkaufsempfehlung.");

    var quellenzeile = "Quelle: " + quelle + (datumText ? ", " + datumText : "") + ".";
    return (koerper.join(" ") + " " + quellenzeile).trim();
  }

  /* --------------------------------------------------------- Hashtags
     Bis zu 5, dynamisch aus der konkreten Story — keine feste Liste. */
  function grossBuchstabeWort(w) {
    return w.replace(/(^|\s)([a-zäöüß])/g, function (m, sp, c) { return sp + c.toUpperCase(); })
      .replace(/[^\wÄÖÜäöüß]/g, "");
  }

  function hashtagsAbleiten(story) {
    var item = story.item;
    var out = [];
    var gesehen = {};
    function fuege(tag, kategorie, quelle) {
      var t = grossBuchstabeWort(tag);
      if (!t || gesehen[t.toLowerCase()] || out.length >= 5) return;
      gesehen[t.toLowerCase()] = true;
      out.push({ tag: t, kategorie: kategorie, quelle: quelle });
    }
    if (story.thema) fuege(story.thema.label.replace(/\s+/g, ""), "THEMA", "Themenwelt");
    /* Entitaet: der erste gross geschriebene Mehrwortname im Titel, sonst das erste
       gross geschriebene Wort ausser am Satzanfang. */
    var titelWorte = text(item.title).split(/\s+/);
    var entitaet = null;
    for (var i = 0; i < titelWorte.length; i += 1) {
      var w = titelWorte[i].replace(/[^\wÄÖÜäöüß-]/g, "");
      if (w.length >= 3 && /^[A-ZÄÖÜ]/.test(w) && !/^(Der|Die|Das|Ein|Eine|Und|Nach|Vor|Bei|Fuer|Für)$/.test(w)) {
        entitaet = w; break;
      }
    }
    if (entitaet) fuege(entitaet, "ENTITY", "Titel");
    fuege("Boerse", "BROADER", "Anlagekontext");
    fuege("Investieren", "BROADER", "Anlagekontext");
    if (story.fakten.length) fuege("Aktuell", "CONTENT", "Zahlenbeleg vorhanden");
    return { hashtags: out.map(function (o) { return o.tag; }), detail: out,
      verworfen: [], max: 5,
      satz: out.length + " Hashtag(s) aus " +
        out.map(function (o) { return o.kategorie; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(", ") + "." };
  }

  /* ---------------------------------------------------- Motiv & Kennung */
  function motivFuerStory(story) {
    if (story.thema) {
      return { strategy: "GENERATIVE", palette: "dark, premium editorial, cinematic light",
        instruction: story.thema.motiv +
          ". Keine Schrift, kein Logo, kein Wasserzeichen, generoese Freiflaeche fuer " +
          "eine spaeter aufgesetzte Kopfzeile. Fotorealistisch, hochwertig, kein " +
          "Diagramm, kein Bildschirmfoto, kein Dashboard." };
    }
    return { strategy: "GENERATIVE", palette: "dark, premium editorial, cinematic light",
      instruction: "Hochwertige, thematisch zur Meldung passende Editorial-Szene aus der " +
        "Finanz-/Wirtschaftswelt. Keine Schrift, kein Logo, kein Wasserzeichen, generoese " +
        "Freiflaeche fuer eine spaeter aufgesetzte Kopfzeile. Fotorealistisch, kein " +
        "Diagramm, kein Bildschirmfoto, kein Dashboard, kein generischer Boersenticker." };
  }

  function contentIdFuer(item) {
    if (!nodeCrypto) throw new Error("VUSocialWebResearch: contentIdFuer nur unter Node.");
    var basis = text(item.link) || text(item.title);
    var hash = nodeCrypto.createHash("sha256").update(basis, "utf8").digest("hex").slice(0, 16);
    var datum = item.publishedAt ? item.publishedAt.slice(0, 10).replace(/-/g, "") :
      new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return "vu-web-" + hash + "-" + datum;
  }

  /* --------------------------------------------------------- Gesamtlauf
     Das komplette Paket: Story, Hook, Caption, Hashtags, Motiv, Kennung.
     `options.themaFilter` (fuer POST ZU THEMA, §21): nur Items, deren
     title+description den Begriff enthalten, kommen in die Auswahl. */
  function waehle(rawItems, options) {
    options = options || {};
    var eingabe = rawItems;
    if (gefuellt(options.themaFilter)) {
      var begriff = text(options.themaFilter).toLowerCase();
      eingabe = (rawItems || []).filter(function (it) {
        return [text(it.title), text(it.description)].join(" ").toLowerCase()
          .indexOf(begriff) !== -1;
      });
      if (!eingabe.length) {
        return { ok: false, grund: "KEINE_AKTUELLE_WEB_STORY_ZU_THEMA",
          erklaerung: "Keines der gelieferten Web-Items erwaehnt \"" + options.themaFilter +
            "\". Es entsteht nichts erfundenes zu diesem Thema." };
      }
    }

    var storyWahl = waehleStory(eingabe, options);
    if (!storyWahl.ok) return storyWahl;

    var story = storyWahl.gewaehlt;
    var hookWahl = waehleHook(story);
    if (!hookWahl.ok) return hookWahl;

    var caption = baueCaption(story, hookWahl.gewaehlt.text);
    var hashtagWahl = hashtagsAbleiten(story);
    var motiv = motivFuerStory(story);
    var contentId = contentIdFuer(story.item);

    return {
      ok: true,
      contentId: contentId,
      story: { title: story.item.title, link: story.item.link,
        description: story.item.description, source: story.item.source,
        publishedAt: story.item.publishedAt },
      storyScore: story.punkte, storyErklaerung: storyWahl.erklaerung,
      fakten: story.fakten,
      hook: hookWahl.gewaehlt.text, hookArchetyp: hookWahl.gewaehlt.archetyp,
      hookScore: hookWahl.gewaehlt.punkte, hookErklaerung: hookWahl.erklaerung,
      hookKandidaten: hookWahl.kandidaten,
      caption: caption,
      hashtags: hashtagWahl.hashtags, hashtagDetail: hashtagWahl.detail,
      hashtagVerworfen: hashtagWahl.verworfen, hashtagSatz: hashtagWahl.satz,
      motiv: motiv,
      thema: story.thema ? story.thema.id : null
    };
  }

  var api = {
    THEMENWELTEN: THEMENWELTEN, themaFuer: themaFuer,
    aktuell: aktuell, sammleFakten: sammleFakten,
    bewerteStory: bewerteStory, waehleStory: waehleStory,
    hookKandidaten: hookKandidaten, bewerteHook: bewerteHook, waehleHook: waehleHook,
    baueCaption: baueCaption, hashtagsAbleiten: hashtagsAbleiten,
    motivFuerStory: motivFuerStory, contentIdFuer: contentIdFuer,
    grounded: grounded, kuerzen: kuerzen,
    waehle: waehle
  };

  if (isNode) module.exports = api;
  else global.VUSocialWebResearch = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
