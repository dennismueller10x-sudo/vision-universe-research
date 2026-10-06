/* =========================================================================
   VISION UNIVERSE SOCIAL — fact-check.js
   FINANZINHALTS-SICHERHEIT UND PROVENANCE (§27, §28)

   Vision Universe schreibt ueber Investments. Eine erfundene Zahl ist hier
   kein Stilfehler, sondern ein Schaden — beim Leser und bei der Marke.

   DIE REGEL

   Jede konkrete Aussage braucht einen Beleg. Ohne Beleg wird sie nicht
   autonom veroeffentlicht. Nicht "mit Hinweis", nicht "abgeschwaecht" —
   nicht veroeffentlicht.

   WAS "KONKRET" HEISST

   Eine Zahl, ein Kursziel, ein Rating, ein Datum, ein Prozentsatz, ein
   Superlativ ("das groesste", "erstmals seit"). Diese Datei findet sie im
   Text und verlangt fuer jede einen `sourceRef`.

   WARUM DETERMINISTISCH UND NICHT PER MODELL

   §40: wo deterministische Software reicht, kein LLM. Ob im Satz "NVDA
   +12 % seit Januar" eine Zahl steht, ist eine Frage an einen regulaeren
   Ausdruck und nicht an ein Sprachmodell. Ein Modell kann hier nur
   zusaetzlich irren — und zwar ueberzeugend.

   Die semantische Pruefung ("passt die Zahl zur Aussage?") ist eine
   andere Aufgabe und bleibt dem Modell. Aber sie kommt NACH dieser
   Pruefung und ersetzt sie nicht.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Schema = isNode ? require("./schema.js") : global.VUSocialSchema;

  /* Muster, die eine belegpflichtige Aussage anzeigen. Bewusst grosszuegig:
     ein falscher Alarm kostet eine Belegzeile, ein uebersehener Fund
     kostet Glaubwuerdigkeit. */
  var CLAIM_PATTERNS = [
    { id: "percentage",   re: /[+-]?\d+(?:[.,]\d+)?\s*%/g,
      note: "Prozentangabe" },
    { id: "currency",     re: /(?:USD|EUR|CHF|\$|€)\s?\d[\d.,]*\s*(?:Mrd\.?|Mio\.?|Mia\.?|bn|m|k)?|\d[\d.,]*\s*(?:USD|EUR|CHF|\$|€)/g,
      note: "Geldbetrag" },
    { id: "multiple",     re: /\b\d+(?:[.,]\d+)?\s*(?:x|fach|-fach)\b/gi,
      note: "Vielfaches" },
    { id: "ratio",        re: /\b(?:KGV|KUV|P\/E|EV\/EBITDA|ROE|ROIC|Marge)\b[^.!?]{0,20}\d/gi,
      note: "Kennzahl" },
    { id: "price-target", re: /\b(?:Kursziel|price target|Zielkurs)\b/gi,
      note: "Kursziel" },
    { id: "rating",       re: /\b(?:Buy|Sell|Hold|Outperform|Underperform|Overweight|Underweight|Kaufempfehlung)\b/g,
      note: "Analystenrating" },
    { id: "superlative",  re: /\b(?:groesste[rns]?|hoechste[rns]?|niedrigste[rns]?|erstmals\s+seit|Rekord|All-?Time-?High|52-?Wochen-?Hoch)\b/gi,
      note: "Superlativ oder Rekordaussage" },
    { id: "absolute-time",re: /\b(?:seit|im)\s+(?:Q[1-4]|\d{4}|Januar|Februar|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\b/gi,
      note: "Zeitbezug" }
  ];

  /* Aussagen, die Vision Universe grundsaetzlich nicht trifft (§11, §27).
     Sie sind kein Belegproblem, sondern verboten. */
  var FORBIDDEN_PATTERNS = [
    { id: "guaranteed-return", re: /\b(?:garantiert|sichere?r?\s+Gewinn|risikolos|guaranteed\s+return)\b/gi,
      message: "Erfolgs- oder Renditegarantie" },
    { id: "advice", re: /\b(?:jetzt\s+kaufen|sofort\s+kaufen|musst\s+du\s+kaufen|buy\s+now\s+before)\b/gi,
      message: "Direkte Handlungsempfehlung" },
    { id: "hype-multiplier", re: /\b\d{3,}\s*%\s*(?:Chance|Rendite|Gewinn)|\b(?:Verzehnfacher|Tenbagger)\b/gi,
      message: "Renditeversprechen im Hype-Register" },
    { id: "urgency-pressure", re: /\b(?:nur\s+heute|letzte\s+Chance|bevor\s+es\s+zu\s+spaet\s+ist)\b/gi,
      message: "Kuenstlicher Zeitdruck" }
  ];

  /* Wie alt ein Beleg hoechstens sein darf, je Dringlichkeit. Ein
     Marktkurs von gestern in einem "Breaking"-Beitrag ist falsch, auch
     wenn die Zahl damals stimmte. */
  var MAX_AGE_SECONDS = {
    BREAKING: 3 * 3600,
    TIMELY: 36 * 3600,
    EVERGREEN: 30 * 24 * 3600
  };

  /* -------------------------------------------------------------------
     WELCHE DRINGLICHKEIT DIESE DATEN NOCH TRAGEN

     Die Platte setzte fuer jede Discover-Reihe `timeSensitivity:
     "TIMELY"` - eine Konstante, keine Messung. Ihre Kurse sind neun
     Tage alt; die Faktenpruefung wies jeden Beitrag daraus mit
     "Mindestens ein Beleg ist zu alt fuer die Dringlichkeit 'TIMELY'"
     zurueck. Beide Seiten hatten recht, und keine wusste von der
     anderen.

     Die Schwellen stehen schon hier. Also wird die Frage hier
     beantwortet: welche Dringlichkeit tragen Daten dieses Alters
     noch? Eine zweite Tabelle anderswo wuerde irgendwann von dieser
     abweichen, und dann behauptete ein Beitrag eine Aktualitaet, die
     seine Pruefung ihm nicht zugesteht.

     OHNE STAND GIBT ES KEINE DRINGLICHKEIT. `null` heisst hier
     EVERGREEN und nicht TIMELY: was kein Datum hat, ist nicht frisch.
     ------------------------------------------------------------------- */
  var DRINGLICHKEIT_ABSTEIGEND = ["BREAKING", "TIMELY", "EVERGREEN"];

  function dringlichkeitFuer(observedAt, nowIso) {
    if (!observedAt) return "EVERGREEN";
    var nowMs = nowIso ? Date.parse(nowIso) : Date.now();
    var dann = Date.parse(observedAt);
    if (!isFinite(dann) || !isFinite(nowMs)) return "EVERGREEN";
    var alter = Math.max(0, (nowMs - dann) / 1000);
    for (var i = 0; i < DRINGLICHKEIT_ABSTEIGEND.length; i += 1) {
      var d = DRINGLICHKEIT_ABSTEIGEND[i];
      if (alter <= MAX_AGE_SECONDS[d]) return d;
    }
    /* Aelter als jede Stufe: dann ist EVERGREEN die einzige
       ehrliche Angabe - und die Faktenpruefung wird sie trotzdem als
       veraltet melden. Das ist richtig so: hier wird die Aussage
       ueber die Aktualitaet gemacht, nicht die Pruefung ersetzt. */
    return "EVERGREEN";
  }

  function textOf(pkg) {
    return [pkg.hook, pkg.caption, pkg.thesis, pkg.cta]
      .filter(function (s) { return typeof s === "string" && s; })
      .join("\n");
  }

  /** Findet belegpflichtige Stellen im Text. */
  function findClaims(text) {
    if (typeof text !== "string" || !text) return [];
    var found = [];
    CLAIM_PATTERNS.forEach(function (p) {
      var re = new RegExp(p.re.source, p.re.flags);
      var match;
      while ((match = re.exec(text)) !== null) {
        found.push({ patternId: p.id, note: p.note, text: match[0], index: match.index });
        if (match.index === re.lastIndex) re.lastIndex++;  /* Nullbreiten-Schutz */
      }
    });
    return found;
  }

  /** Verbotene Aussagen. */
  function findForbidden(text) {
    if (typeof text !== "string" || !text) return [];
    var hits = [];
    FORBIDDEN_PATTERNS.forEach(function (p) {
      var re = new RegExp(p.re.source, p.re.flags);
      if (re.test(text)) hits.push({ id: p.id, message: p.message });
    });
    return hits;
  }

  /**
   * Bewertet einen einzelnen Beleg gegen die Dringlichkeit.
   * Gibt einen der vier Datenzustaende zurueck (§27).
   */
  function assessSource(source, timeSensitivity, nowMs) {
    if (!source) return { state: "UNAVAILABLE", reason: "Kein Beleg hinterlegt." };
    if (Schema.DATA_STATES.indexOf(source.state) === -1) {
      return { state: "UNAVAILABLE", reason: "Unbekannter Belegzustand." };
    }
    if (source.state === "CONFLICTING") {
      return { state: "CONFLICTING", reason: "Zwei Quellen widersprechen sich. Das loest ein Mensch auf." };
    }
    if (source.state === "UNAVAILABLE") {
      return { state: "UNAVAILABLE", reason: "Die Quelle liefert diesen Wert nicht." };
    }

    var maxAge = MAX_AGE_SECONDS[timeSensitivity] || MAX_AGE_SECONDS.TIMELY;
    var ageSeconds = null;
    if (source.freshnessSeconds !== null && source.freshnessSeconds !== undefined) {
      ageSeconds = source.freshnessSeconds;
    } else if (source.observedAt) {
      ageSeconds = Math.max(0, (nowMs - Date.parse(source.observedAt)) / 1000);
    }

    if (ageSeconds === null) {
      /* Kein Alter feststellbar. Das ist NICHT "frisch". */
      return { state: "STALE", reason: "Das Alter des Belegs ist unbekannt.", ageSeconds: null };
    }
    if (ageSeconds > maxAge) {
      return {
        state: "STALE",
        reason: "Der Beleg ist " + Math.round(ageSeconds / 3600) + " h alt; fuer '" +
                timeSensitivity + "' sind hoechstens " + Math.round(maxAge / 3600) + " h zulaessig.",
        ageSeconds: ageSeconds
      };
    }
    return { state: "VERIFIED", reason: "Beleg vorhanden und aktuell.", ageSeconds: ageSeconds };
  }

  /**
   * Die Hauptpruefung.
   *
   * @returns {
   *   passed, publishable, state, unsourced[], forbidden[], sources[], explanation
   * }
   *
   * `passed` und `publishable` sind getrennt: ein Paket kann die Pruefung
   * bestehen und trotzdem nicht autonom veroeffentlicht werden, wenn ein
   * Beleg nur STALE ist. Der Unterschied ist die Entscheidung "Mensch
   * anschauen lassen" gegen "wegwerfen".
   */
  function check(pkg, options) {
    options = options || {};
    var nowMs = options.now ? new Date(options.now).getTime() : Date.now();
    var timeSensitivity = options.timeSensitivity || "TIMELY";
    var text = textOf(pkg || {});

    var forbidden = findForbidden(text);
    var textClaims = findClaims(text);
    var declared = Array.isArray(pkg && pkg.claims) ? pkg.claims : [];

    /* Abgleich: welche gefundene Stelle ist durch einen erklaerten Claim
       gedeckt? Der Abgleich laeuft ueber den Textausschnitt, nicht ueber
       eine Position — Positionen verschieben sich beim Umformulieren. */
    /* -----------------------------------------------------------------
       DIESELBE ZAHL, ZWEI SCHREIBWEISEN

       Der Creative Agent schrieb "3,9 %". Der Beleg sagt "3.9 %". Das
       ist dieselbe Zahl - deutsche Texte setzen ein Komma, die
       Quant-Engines einen Punkt.

       Die erste Fassung verglich Zeichenketten und meldete fuenf
       unbelegte Prozentangaben in einem Text, dessen Zahlen samt und
       sonders aus den Belegen stammten. Wieder ein Pruefer, der
       korrekten Text verbietet - und wieder faellt es erst am fertigen
       Beitrag auf.

       Die Claim Binding hat dieselbe Lektion schon gelernt. Dass sie
       hier ein zweites Mal gelernt werden musste, ist der eigentliche
       Befund: zwei Pruefer, zwei Zahlenverstaendnisse.

       Normalisiert wird nur INNERHALB von Ziffernfolgen. Ein Komma
       zwischen Woertern bleibt ein Komma.
       ----------------------------------------------------------------- */
    function zahlenNormal(x) {
      return String(x || "").replace(/(\d),(\d)/g, "$1.$2");
    }

    var declaredTexts = declared.map(function (c) { return zahlenNormal(c.text); });
    var unsourced = textClaims.filter(function (claim) {
      var n = zahlenNormal(claim.text);
      return !declaredTexts.some(function (d) {
        return d.indexOf(n) !== -1 || n.indexOf(d) !== -1;
      });
    });

    var sources = declared.map(function (c) {
      var assessment = assessSource(c.source, timeSensitivity, nowMs);
      return { text: c.text, state: assessment.state, reason: assessment.reason,
               ageSeconds: assessment.ageSeconds === undefined ? null : assessment.ageSeconds,
               source: c.source ? { source: c.source.source, provider: c.source.provider,
                                    metric: c.source.metric, observedAt: c.source.observedAt } : null };
    });

    var hasConflict = sources.some(function (s) { return s.state === "CONFLICTING"; });
    var hasUnavailable = sources.some(function (s) { return s.state === "UNAVAILABLE"; });
    var hasStale = sources.some(function (s) { return s.state === "STALE"; });

    var state = "VERIFIED";
    if (hasConflict) state = "CONFLICTING";
    else if (hasUnavailable || unsourced.length > 0) state = "UNAVAILABLE";
    else if (hasStale) state = "STALE";

    var passed = forbidden.length === 0 && unsourced.length === 0 && !hasConflict && !hasUnavailable;
    var publishable = passed && !hasStale;

    var reasons = [];
    if (forbidden.length) {
      reasons.push("Verbotene Aussage: " + forbidden.map(function (f) { return f.message; }).join(", ") + ".");
    }
    if (unsourced.length) {
      reasons.push(unsourced.length + " Aussage(n) ohne Beleg: " +
        unsourced.slice(0, 5).map(function (u) { return "\"" + u.text + "\" (" + u.note + ")"; }).join(", ") + ".");
    }
    if (hasConflict) reasons.push("Mindestens ein Beleg ist widerspruechlich.");
    if (hasUnavailable) reasons.push("Mindestens ein Beleg verweist auf eine Quelle ohne Wert.");
    if (hasStale) reasons.push("Mindestens ein Beleg ist zu alt fuer die Dringlichkeit '" + timeSensitivity + "'.");

    return {
      passed: passed,
      publishable: publishable,
      state: state,
      forbidden: forbidden,
      unsourced: unsourced,
      sources: sources,
      claimsFound: textClaims.length,
      explanation: reasons.length === 0
        ? "Alle konkreten Aussagen sind belegt und aktuell."
        : reasons.join(" ")
    };
  }

  var api = {
    CLAIM_PATTERNS: CLAIM_PATTERNS.map(function (p) { return p.id; }),
    FORBIDDEN_PATTERNS: FORBIDDEN_PATTERNS.map(function (p) { return p.id; }),
    MAX_AGE_SECONDS: MAX_AGE_SECONDS,
    DRINGLICHKEIT_ABSTEIGEND: DRINGLICHKEIT_ABSTEIGEND,
    dringlichkeitFuer: dringlichkeitFuer,
    findClaims: findClaims,
    findForbidden: findForbidden,
    assessSource: assessSource,
    check: check
  };

  if (isNode) module.exports = api;
  else global.VUSocialFactCheck = api;
})(typeof window !== "undefined" ? window : globalThis);
