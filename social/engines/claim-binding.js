/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/claim-binding.js

   JEDE FAKTISCHE AUSSAGE MUSS AN EIN EVIDENCE OBJECT GEBUNDEN SEIN

   -------------------------------------------------------------------------
   WOZU
   -------------------------------------------------------------------------

   Ein generatives Modell schreibt fluessig und pruefen kann es nichts.
   Es setzt eine Null an, weil der Satz sonst holpert; es schreibt "seit
   2019", weil Jahreszahlen Text glaubwuerdig machen; es rundet 76 auf
   "fast 80", weil das besser klingt. Nichts davon ist boeser Wille, und
   nichts davon ist im fertigen Beitrag von einer belegten Zahl zu
   unterscheiden.

   Diese Datei macht den Unterschied maschinell sichtbar: sie nimmt einen
   Text und die Liste der Belege, aus denen er entstehen durfte, und
   fragt zu JEDER Zahl und JEDEM Eigennamen darin, ob es dafuer einen
   Beleg gibt.

   -------------------------------------------------------------------------
   WARUM SO STRENG
   -------------------------------------------------------------------------

   Die Regel lautet: jede Ziffernfolge im veroeffentlichten Text muss
   sich auf einen Beleg zurueckfuehren lassen. Keine Ausnahme fuer
   "harmlose" Zahlen — die Unterscheidung zwischen harmlos und nicht
   harmlos ist genau die, die ein Modell nicht treffen kann und die ein
   Leser nicht sieht.

   Das ist unbequem und gelegentlich zu streng. Der Preis dafuer ist eine
   verworfene Variante. Der Preis der Gegenrichtung ist eine erfundene
   Zahl unter einem Markenlogo.

   -------------------------------------------------------------------------
   WAS SIE NICHT LEISTET
   -------------------------------------------------------------------------

   Sie prueft nicht, ob ein Text WAHR ist. Sie prueft, ob er ueber das
   hinausgeht, was belegt ist. Ein Text, der nur Belegtes sagt, kann
   trotzdem irrefuehrend sein — dagegen stehen die Marken- und
   Faktenpruefung, nicht diese Datei.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  /* -------------------------------------------------------------------
     SPRECHAKTE, DIE KEIN BELEG DECKEN KANN

     Eine Prognose ist keine Aussage ueber die Gegenwart und laesst sich
     deshalb grundsaetzlich nicht belegen — egal wie viele Zahlen
     danebenstehen. Dasselbe gilt fuer Empfehlungen und fuer
     Kausalbehauptungen, wenn das Ereignis keinen Anlass mitbringt.
     ------------------------------------------------------------------- */
  var FORBIDDEN_ACTS = [
    { id: "forecast",
      /* Beide Wortstellungen. Die erste Fassung kannte nur "erwarten wir"
         und liess "wir erwarten mehr" durch — im Deutschen steht das Verb
         mal vorn und mal hinten, und eine Pruefung, die nur eine Stellung
         kennt, prueft die halbe Sprache. */
      re: /\b(?:wird\s+(?:steigen|fallen|zulegen|einbrechen|sinken)|duerfte\s+\w+|koennte\s+(?:steigen|fallen|zulegen)|Kursziel|Prognose|(?:wir\s+erwarten|erwarten\s+wir)|(?:wir\s+rechnen|rechnen\s+wir)\s+mit|Potenzial\s+(?:bis|auf)|dem\s+naechsten\s+Schritt\s+nach)\b/i,
      message: "Prognose. Sie ist keine Aussage ueber die Gegenwart und deshalb " +
        "grundsaetzlich nicht belegbar." },
    { id: "recommendation",
      re: /\b(?:jetzt\s+(?:kaufen|einsteigen|verkaufen)|solltest\s+du\s+\w+|wir\s+empfehlen|Pflicht\s+im\s+Depot)\b/i,
      message: "Empfehlung. Dieser Kanal beschreibt, er raet nicht." },
    { id: "certainty",
      re: /\b(?:garantiert|mit\s+Sicherheit|ohne\s+Zweifel|zweifellos)\b/i,
      message: "Gewissheitsbehauptung ueber etwas, das nicht gewiss ist." }
  ];

  /* Kausalbehauptungen. Sie sind nur erlaubt, wenn der Anlass belegt ist
     — das entscheidet der Aufrufer ueber `allowCausality`. */
  var CAUSAL_RE = /\b(?:weil|deshalb|deswegen|aufgrund|wegen|der\s+Grund\s+(?:ist|liegt)|ausgeloest\s+durch|fuehrt\s+zu)\b/i;

  /* -------------------------------------------------------------------
     ZAHLEN

     Erfasst wird jede Ziffernfolge samt der ueblichen deutschen und
     englischen Schreibweisen: 76, 76,5, 76.5, 1.234,56, 1,234.56, 38 %.
     ------------------------------------------------------------------- */
  /* Ein ISO-Datum ist EIN Token, nicht drei Zahlen. "2026-09-16" in
     Stuecke zu zerlegen erzeugte "-09" und "-16" als angeblich unbelegte
     Werte — und wies damit eine Angabe zurueck, die direkt aus dem
     Beobachtungszeitpunkt eines Belegs stammt. */
  var ISO_DATE_SOURCE = "\\d{4}-\\d{2}-\\d{2}";

  function dateTokens(text) {
    var out = [];
    var re = new RegExp(ISO_DATE_SOURCE, "g");
    var m;
    while ((m = re.exec(String(text))) !== null) out.push({ raw: m[0], index: m.index });
    return out;
  }

  function numberTokens(text) {
    /* Datumsangaben zuerst ausblenden, damit ihre Bestandteile nicht als
       einzelne Zahlen auftauchen. */
    var s = String(text).replace(new RegExp(ISO_DATE_SOURCE, "g"), function (d) {
      return new Array(d.length + 1).join(" ");
    });
    var out = [];
    var re = /-?\d[\d.,  ']*\d|\d/g;
    var m;
    while ((m = re.exec(s)) !== null) {
      out.push({ raw: m[0], index: m.index });
    }
    return out;
  }

  /**
   * Eine Zahl auf eine vergleichbare Form bringen.
   *
   * "1.234,56" und "1234.56" sind dieselbe Zahl in zwei Schreibweisen.
   * Sie verschieden zu behandeln hiesse, eine belegte Zahl wegen ihrer
   * Formatierung zurueckzuweisen.
   */
  function normaliseNumber(raw) {
    var s = String(raw).replace(/[  '\s]/g, "");
    var hatKomma = s.indexOf(",") !== -1;
    var hatPunkt = s.indexOf(".") !== -1;

    if (hatKomma && hatPunkt) {
      /* Das zuletzt stehende Zeichen ist das Dezimaltrennzeichen. */
      s = (s.lastIndexOf(",") > s.lastIndexOf("."))
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
    } else if (hatKomma) {
      /* Ein Komma mit genau drei Ziffern dahinter ist mehrdeutig
         ("1,234"). Beide Lesarten werden zugelassen — der Aufrufer
         entscheidet nicht, welche gemeint war, sondern ob EINE davon
         belegt ist. */
      s = s.replace(",", ".");
    }
    var n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function alternativeReadings(raw) {
    var werte = [];
    var haupt = normaliseNumber(raw);
    if (haupt !== null) werte.push(haupt);

    var s = String(raw).replace(/[  '\s]/g, "");
    if (/^-?\d+,\d{3}$/.test(s)) {
      var alsTausender = Number(s.replace(",", ""));
      if (Number.isFinite(alsTausender)) werte.push(alsTausender);
    }
    if (/^-?\d+\.\d{3}$/.test(s)) {
      var alsTausender2 = Number(s.replace(".", ""));
      if (Number.isFinite(alsTausender2)) werte.push(alsTausender2);
    }
    return werte;
  }

  /** Die Zahlen, die ein Beleg deckt — Wert und die ueblichen Rundungen. */
  function coveredNumbers(evidence) {
    var werte = [];
    (evidence || []).forEach(function (e) {
      /* ---------------------------------------------------------------
         AUCH DIE ZAHLEN IM BELEGSATZ

         Die Quant-Engines liefern fertig formulierte Belege: "Kurs ueber
         SMA50 (3.05 ATR)". Der Satz IST der Beleg — er stammt aus
         derselben provenienzgebundenen Quelle wie der Wert daneben.

         Nur den `value` zu decken hiesse, einen Autor fuer das Zitieren
         eines Belegs zu bestrafen. Die erste Fassung tat genau das, und
         sie haette jede reichhaltige Evidenz unbenutzbar gemacht: je
         mehr Belegsaetze, desto mehr angeblich unbelegte Zahlen.
         --------------------------------------------------------------- */
      if (e.statement) {
        numberTokens(String(e.statement)).forEach(function (t) {
          alternativeReadings(t.raw).forEach(function (w) { werte.push(w); });
        });
      }

      var v = normaliseNumber(e.value);
      if (v === null) return;
      werte.push(v);
      /* Eine Rundung auf ganze Zahlen ist zulaessig, solange sie den
         Wert nicht verschiebt: aus 76.3 darf "76" werden, aus 76.3 nicht
         "80". */
      werte.push(Math.round(v));
      werte.push(Math.trunc(v));
      /* Und die Jahreszahl eines Beobachtungszeitpunkts: "Stand 2026"
         ist keine erfundene Zahl. */
      if (e.observedAt && /^\d{4}/.test(String(e.observedAt))) {
        werte.push(Number(String(e.observedAt).slice(0, 4)));
      }
    });
    return werte;
  }

  /* -------------------------------------------------------------------
     EIGENNAMEN

     Grossgeschriebene Kuerzel (Ticker) und die Entitaeten der Belege.
     Deutsche Substantive sind ebenfalls gross — deshalb werden nur
     Woerter geprueft, die AUSSCHLIESSLICH aus Grossbuchstaben bestehen
     und zwei bis fuenf Zeichen lang sind. Das ist die Form, in der ein
     Ticker auftritt, und keine deutsche Wortform.
     ------------------------------------------------------------------- */
  function tickerTokens(text) {
    var out = [];
    var re = /(?:^|[\s(„"'—–-])([A-Z]{2,5})(?=[\s.,:;)!?„"'—–-]|$)/g;
    var m;
    while ((m = re.exec(String(text))) !== null) out.push(m[1]);
    return out;
  }

  /* Kuerzel, die keine Wertpapiere sind und deshalb keinen Beleg
     brauchen. Eine kurze, ausdrueckliche Liste — keine Heuristik. */
  var NON_TICKER = ["VU", "AI", "KI", "ETF", "BIP", "EZB", "FED", "USA", "EU", "DAX",
                    "USD", "EUR", "CHF", "GBP", "IPO", "CEO", "CFO"];

  /**
   * Prueft einen Text gegen die Belege, aus denen er entstehen durfte.
   *
   * @param text        der fertige Text (Hook, Caption, Bildzeile)
   * @param evidence    [{ id, entity, metric, value, unit, source, observedAt }]
   * @param options.allowCausality  true, wenn das Ereignis einen Anlass mitbringt
   */
  function check(text, evidence, options) {
    options = options || {};
    var s = String(text === null || text === undefined ? "" : text);

    /* Hashtags stehen ausserhalb des Satzes und behaupten nichts. */
    var pruefbar = s.replace(/#[\wÀ-ɏ]+/g, " ");

    var unbound = [];
    var forbidden = [];
    var bound = [];

    var gedeckt = coveredNumbers(evidence);
    numberTokens(pruefbar).forEach(function (t) {
      var lesarten = alternativeReadings(t.raw);
      var treffer = lesarten.some(function (w) {
        return gedeckt.some(function (g) { return Math.abs(g - w) < 1e-9; });
      });
      if (treffer) bound.push({ kind: "number", raw: t.raw });
      else unbound.push({ kind: "number", raw: t.raw,
        message: "Die Zahl " + t.raw + " steht in keinem Beleg." });
    });

    /* Datumsangaben gegen die Beobachtungszeitpunkte der Belege. */
    var belegDaten = [];
    (evidence || []).forEach(function (e) {
      var d = String(e.observedAt || "").slice(0, 10);
      if (new RegExp("^" + ISO_DATE_SOURCE + "$").test(d)) belegDaten.push(d);
      /* Und Datumsangaben, die in einem Belegsatz stehen. */
      if (e.statement) {
        dateTokens(String(e.statement)).forEach(function (t) { belegDaten.push(t.raw); });
      }
    });
    dateTokens(pruefbar).forEach(function (t) {
      if (belegDaten.indexOf(t.raw) !== -1) { bound.push({ kind: "date", raw: t.raw }); return; }
      unbound.push({ kind: "date", raw: t.raw,
        message: "Das Datum " + t.raw + " steht in keinem Beleg." });
    });

    var entitaeten = (evidence || [])
      .map(function (e) { return String(e.entity || "").toUpperCase(); })
      .filter(Boolean);

    /* Kuerzel, die in einem BELEGSATZ stehen, sind belegt — genau wie
       die Zahlen darin. "Kurs ueber SMA50 (3.05 ATR)" bringt ATR, SMA
       und RSI mit; sie als unbekannte Wertpapiere zu melden, hiesse
       einen Autor fuer das Zitieren eines Belegs zu bestrafen.

       Die feste Liste unten bleibt fuer Begriffe, die im Autorentext
       vorkommen duerfen, ohne in einem Beleg zu stehen. */
    (evidence || []).forEach(function (e) {
      if (!e.statement) return;
      tickerTokens(String(e.statement)).forEach(function (tok) {
        if (entitaeten.indexOf(tok) === -1) entitaeten.push(tok);
      });
    });
    tickerTokens(pruefbar).forEach(function (tok) {
      if (NON_TICKER.indexOf(tok) !== -1) return;
      if (entitaeten.indexOf(tok) !== -1) { bound.push({ kind: "entity", raw: tok }); return; }
      unbound.push({ kind: "entity", raw: tok,
        message: "Das Kuerzel " + tok + " gehoert zu keinem Beleg." });
    });

    /* -----------------------------------------------------------------
       VERNEINUNG ZAEHLT

       "Lagebeschreibung, keine Prognose." ist das Gegenteil einer
       Prognose — und wurde von der ersten Fassung als eine gewertet,
       weil das Wort vorkam. Ein Pruefer, der die Verneinung nicht sieht,
       verbietet ausgerechnet den Satz, mit dem ein Text seine eigene
       Grenze benennt.

       Geprueft wird deshalb, ob unmittelbar vor dem Treffer eine
       Verneinung steht. Das ist keine Grammatikanalyse und faengt nicht
       jeden Fall — es faengt den Fall, der hier taeglich vorkommt.
       ----------------------------------------------------------------- */
    var VERNEINUNG = /\b(?:kein|keine|keinen|keiner|keinem|nicht|weder|ohne)\s+(?:\w+\s+){0,2}$/i;

    FORBIDDEN_ACTS.forEach(function (a) {
      var re = new RegExp(a.re.source, a.re.flags.indexOf("g") === -1
        ? a.re.flags + "g" : a.re.flags);
      var m;
      while ((m = re.exec(pruefbar)) !== null) {
        var davor = pruefbar.slice(Math.max(0, m.index - 40), m.index);
        if (VERNEINUNG.test(davor)) continue;   /* verneint, also keine Behauptung */
        forbidden.push({ id: a.id, message: a.message });
        break;
      }
    });

    /* -----------------------------------------------------------------
       KAUSALITAET — ABER NUR UEBER DEN GEGENSTAND

       Ein "weil" ist nicht per se eine Behauptung ueber den Markt. Der
       Satz "Wir zeigen die Zahl, weil eine nachvollziehbare Zahl mehr
       wert ist als eine Einschaetzung" erklaert unsere eigene
       Entscheidung — und die duerfen wir erklaeren.

       Verboten ist die Kausalaussage ueber den GEGENSTAND: "XOM steigt,
       weil ...". Geprueft wird deshalb je Satz, ob der kausale Ausdruck
       mit einer Entitaet oder einer Kennzahl aus den Belegen
       zusammensteht.

       Die erste Fassung prueste den ganzen Text auf einmal und wies
       damit den eigenen Beleg-Satz zurueck. Ein Pruefer, der richtige
       Texte verwirft, wird abgeschaltet — und dann prueft er gar nichts
       mehr.
       ----------------------------------------------------------------- */
    if (!options.allowCausality) {
      var gegenstaende = (evidence || []).reduce(function (acc, e) {
        if (e.entity) acc.push(String(e.entity));
        if (e.metric) acc.push(String(e.metric));
        return acc;
      }, []);

      var saetze = pruefbar.split(/([.!?])\s+/);
      saetze.forEach(function (satz) {
        if (!CAUSAL_RE.test(satz)) return;
        var nenntGegenstand = gegenstaende.some(function (g) {
          return satz.toLowerCase().indexOf(g.toLowerCase()) !== -1;
        });
        if (!nenntGegenstand) return;
        forbidden.push({ id: "causality",
          message: "Kausalbehauptung ueber den Gegenstand, aber das Ereignis bringt " +
            "keinen Anlass mit. Eine Lage ist nicht ihr eigener Grund." });
      });
    }

    return {
      ok: unbound.length === 0 && forbidden.length === 0,
      bound: bound,
      unbound: unbound,
      forbidden: forbidden,
      explanation: (unbound.length === 0 && forbidden.length === 0)
        ? "Jede Zahl und jedes Kuerzel im Text ist belegt; kein unbelegbarer Sprechakt."
        : [
            unbound.length ? unbound.length + " unbelegte Angabe(n): " +
              unbound.map(function (u) { return u.raw; }).join(", ") : null,
            forbidden.length ? forbidden.length + " unzulaessige(r) Sprechakt(e): " +
              forbidden.map(function (f) { return f.id; }).join(", ") : null
          ].filter(Boolean).join(" | ")
    };
  }

  /** Prueft mehrere Textteile auf einmal und nennt, wo es hakt. */
  function checkParts(parts, evidence, options) {
    var befunde = {};
    var ok = true;
    Object.keys(parts || {}).forEach(function (k) {
      var b = check(parts[k], evidence, options);
      befunde[k] = b;
      if (!b.ok) ok = false;
    });
    return { ok: ok, parts: befunde };
  }

  var api = {
    FORBIDDEN_ACTS: FORBIDDEN_ACTS.map(function (a) { return a.id; }),
    NON_TICKER: NON_TICKER,
    numberTokens: numberTokens,
    dateTokens: dateTokens,
    normaliseNumber: normaliseNumber,
    coveredNumbers: coveredNumbers,
    tickerTokens: tickerTokens,
    check: check,
    checkParts: checkParts
  };

  if (isNode) module.exports = api;
  else global.VUSocialClaimBinding = api;
})(typeof window !== "undefined" ? window : globalThis);
