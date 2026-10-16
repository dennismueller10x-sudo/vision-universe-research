/* =========================================================================
   VISION UNIVERSE — sec-corporate-actions.js     (sec-corporate-actions-1.1.0)

   SPLIT-EREIGNISSE AUS SEC-DOKUMENTEN (unabhaengige Corporate-Action-Quelle)

   Liest den Text einer SEC-Einreichung (8-K, 6-K, 10-Q, 10-K, Proxy ...) und
   zieht daraus nur belastbare Felder: Verhaeltnis, Richtung, Stufe,
   Wirksamkeits- und Handelsdatum. Kein Kurs, keine Rendite und kein
   bekannter Fehlerfall fliesst in diese Regeln: sie folgen allein der
   Sprache, in der Emittenten Splits einreichen (Item 3.03/5.03 8-K,
   Pressemitteilung EX-99, Rueckblick im 10-Q/10-K).

   STUFEN (nie aus einer Genehmigung ein wirksames Ereignis machen)
     ANNOUNCED   vorgeschlagen, beabsichtigt, Abstimmung ausstehend
     APPROVED    Vorstand/Aktionaere haben zugestimmt, keine Wirksamkeit belegt
     EFFECTIVE   wirksam geworden ("effected", "became effective",
                 Handel "on a split-adjusted basis") - oder mit festem Datum
                 und festem Verhaeltnis terminiert (Satzungsaenderung
                 eingereicht, "will become effective on <Datum>"):
                 scheduled = true
   OBSERVED_IN_PRICE vergibt erst corporate-action-validation.js, wenn der
   Kurs das Ereignis am angegebenen Tag zeigt.

   VERHAELTNIS
     newPerOld   neue Aktien je alter Aktie (1-for-25 reverse -> 0,04;
                 3-for-2 -> 1,5). Gleiche Konvention wie splitFactor.
     Eine Spanne ("not less than 1-for-2 and not more than 1-for-20",
     "between", "up to") ist KEIN Verhaeltnis: ratio = null, hoechstens
     APPROVED.
   Saetze mit Vertragsformeln ("in the event of any stock split ... shall be
   adjusted") sind keine Ereignisse und werden verworfen.

   Ergebnis je Einreichung: Ereignisse mit Quelle (Formular, Items,
   Einreichungstag = sichtbar ab), Satz-Hash (Provenienz) und Konfidenz.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;
  var VERSION = "sec-corporate-actions-1.1.0";
  var STAGE_RANK = { MENTION: 0, ANNOUNCED: 1, APPROVED: 2, EFFECTIVE: 3 };

  var UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
  var TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  /* laengste Woerter zuerst und Wortgrenze: "sixty" ist nie "six" + "ty" */
  var WORD = "(?:thousand|hundred|seventeen|thirteen|fourteen|eighteen|nineteen|fifteen|sixteen|seventy|twenty|thirty|eighty|ninety|eleven|twelve|forty|fifty|sixty|seven|three|eight|zero|four|five|nine|one|two|six|ten)\\b";
  var WORDS = WORD + "(?:[\\s-]+(?:and[\\s-]+)?" + WORD + ")*";
  var DIGITS = "\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?";
  var NUM = "(" + DIGITS + "|" + WORDS + ")(?:\\s*\\(\\s*\\d[\\d,.]*\\s*\\))?";
  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  var MONTH = "(January|February|March|April|May|June|July|August|September|October|November|December|Jan\\.?|Feb\\.?|Mar\\.?|Apr\\.?|Jun\\.?|Jul\\.?|Aug\\.?|Sept?\\.?|Oct\\.?|Nov\\.?|Dec\\.?)";
  var DATE_RE = new RegExp(MONTH + "\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s+(\\d{4})", "gi");

  var RE = {
    split: /\b(?:reverse\s+(?:stock\s+|share\s+)?split|(?:stock|share)\s+split|forward\s+(?:stock\s+)?split|split[-\s]adjusted|reverse\s+split|share\s+consolidation|share\s+combination|consolidation\s+of\s+(?:\w+\s+){0,3}shares|consolidat(?:e|ed|ion)\b[^.]{0,160}\binto\s+(?:one|1)\b|consolidat\w*\s+on\s+a\s+[\d:.\s-]{3,12}basis|\d{2,3}\s*%\s*stock\s+dividend)/i,
    /* Richtung nur aus der Nachbarschaft des Verhaeltnisses (Review F03): "consolidated financial statements",
       "reverse merger" sind keine Split-Richtung. */
    reverseLocal: /\breverse\s+(?:stock\s+|share\s+)?split|\bshare\s+consolidation|\bshare\s+combination|\bconsolidat\w*\s+(?:of\s+)?(?:each|every|the|our|its|issued|outstanding|ordinary|common|all)\b|\bconsolidat\w*\s+on\s+a\b|\bcombin\w*\s+(?:[\w(),-]+\s+){0,10}?into\b|\binto\s+one\s+(?:\(1\)\s+)?(?:new\s+)?(?:ordinary\s+)?share/i,
    forwardLocal: /\bforward\s+(?:stock\s+|share\s+)?split|\bstock\s+dividend|\bsplit\s+each\b[^.]{0,40}\binto\b/i,
    notDirection: /\bconsolidated\s+(?:financial|statements?|balance|results|subsidiar\w*|net|revenue|operations)|\breverse\s+(?:merger|acquisition|repurchase|takeover|recapitali[sz]ation\s+with)|\breversed\b/gi,
    exchangeRatio: /\bexchange\s+ratio\b|\bmerger\s+consideration\b|\bfor\s+each\s+share\s+of\s+[\w\s,.]{0,40}\bcommon\s+stock\s+(?:held|outstanding)\b|\bconversion\s+(?:ratio|rate|price)\b/i,
    range: /\bnot\s+(?:less|more|greater|fewer)\s+than\b|\bbetween\b[^.]{0,60}\band\b|\bwithin\s+(?:a|the)\s+range\b|\brange\s+of\b|\branging\s+from\b|\bup\s+to\b|\bany\s+whole\s+number\b|\bto\s+be\s+determined\b|\bin\s+(?:its|the\s+board'?s?)\s+(?:sole\s+)?discretion\b|\bat\s+a\s+ratio\s+(?:of\s+)?(?:from|between)\b|\bmaximum\s+(?:ratio|of)\b|\bminimum\s+(?:ratio|of)\b/i,
    boiler: /\bin\s+(?:the\s+)?(?:case|event)\s+of\b|\bif\s+(?:the|any|there|at\s+any)\b|\bshall\s+be\s+(?:proportionately\s+|equitably\s+|appropriately\s+)?adjusted\b|\bsubject\s+to\s+(?:adjustment|appropriate\s+adjustment)\b|\banti-?dilution\b|\bfor\s+any\s+(?:stock\s+)?split\b|\bupon\s+(?:any|the\s+occurrence)\b|\bwhether\s+by\s+(?:stock\s+)?split\b|\bstock\s+splits?,\s+(?:stock\s+dividends|reverse|combinations|recapitalizations)\b/i,
    announced: /\b(?:pending|proposed|proposal|proposes?|propose|anticipated|anticipates?|expects?\s+to|expected\s+to|intends?\s+to|intention\s+to|plans?\s+to|planned|may\s+(?:effect|implement)|to\s+consider|seek(?:s|ing)?\s+(?:stockholder\s+|shareholder\s+)?approval|if\s+approved|will\s+vote|vote\s+on|recommends?)\b/i,
    approved: /\b(?:approved|authori[sz]ed|adopted|ratified|granted|determined\s+to\s+set|set\s+the\s+(?:reverse\s+)?(?:stock\s+)?split\s+ratio|fixed\s+the\s+ratio)\b/i,
    effectivePast: /\b(?:effected|effectuated|implemented|completed|consummated|became\s+effective|was\s+effective|were\s+effective|went\s+into\s+effect|took\s+effect|has\s+been\s+effected|have\s+been\s+effected|began\s+trading\s+on\s+a\s+split[-\s]adjusted\s+basis|commenced\s+trading\s+on\s+a\s+split[-\s]adjusted\s+basis|retroactively\s+(?:adjusted|restated)|(?:have|has)\s+been\s+(?:retroactively\s+)?(?:adjusted|restated)\s+to\s+(?:reflect|give\s+effect)|occurred|(?:was|were)\s+(?:paid|distributed)|reflect(?:s|ing)?\s+the\s+(?:\w+[-\s]){0,4}(?:reverse\s+)?(?:stock\s+)?split\s+(?:effected|that))\b/i,
    effectiveScheduled: /\b(?:will|shall)\s+(?:become\s+|be\s+)?effective\b|\bwill\s+(?:begin|commence|start)\s+trading\s+on\s+a\s+split[-\s]adjusted\s+basis\b|\bto\s+(?:become|be)\s+effective\s+(?:at|on|as\s+of|prior|before)\b|\beffective\s+(?:as\s+of\s+|at\s+)?(?:\d{1,2}:\d{2}\s*[ap]\.?m\.?[^.]{0,40}?)?(?:on\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/i,
    charter: /\b(?:certificate|articles)\s+of\s+amendment\b|\bamendment\s+to\s+(?:the\s+|its\s+|our\s+)?(?:amended\s+and\s+restated\s+)?(?:certificate|articles)\s+of\s+incorporation\b[^.]{0,120}\bfiled\b|\bfiled\b[^.]{0,120}\b(?:certificate|articles)\s+of\s+(?:amendment|incorporation)\b/i,
    market: /\bsplit[-\s]adjusted\s+basis\b|\bbegin(?:s)?\s+trading\b|\bcommence(?:s)?\s+trading\b|\bopening\s+of\s+(?:the\s+)?(?:market|trading)\b|\bmarket\s+open\b|\bat\s+the\s+open\b/i,
    effectiveWord: /\beffective\b|\beffected\b|\beffectuated\b|\bimplemented\b|\bcompleted\b|\bbecame\s+effective\b|\btook\s+effect\b|\bwent\s+into\s+effect\b/,
    notEventDate: /\b(?:record\s+date|of\s+record|payable|paid\s+on|distribut\w*\s+on|annual\s+meeting|special\s+meeting|meeting\s+(?:of|held)|proxy|ended|ending|as\s+of\s+the\s+end)\b[^.]{0,30}$/i,
    preOpen: /\b(?:12:0[0-9]\s*a\.?m\.?|prior\s+to\s+(?:the\s+)?(?:market\s+)?open|before\s+(?:the\s+)?(?:market\s+)?open|at\s+the\s+(?:market\s+)?open|opening\s+of\s+(?:the\s+)?(?:market|trading))/i,
    postClose: /\b(?:(?:[4-9]|1[01]):[0-5][0-9]\s*p\.?m\.?|11:59\s*p\.?m\.?|after\s+(?:the\s+)?(?:market\s+)?close|close\s+of\s+(?:business|trading|the\s+market))/i
  };

  function wordNumber(s) {
    var toks = String(s).toLowerCase().replace(/-/g, " ").split(/\s+/).filter(function (t) { return t && t !== "and"; });
    if (!toks.length) return null;
    var total = 0, cur = 0;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t in UNITS) cur += UNITS[t];
      else if (t in TENS) cur += TENS[t];
      else if (t === "hundred") cur = (cur || 1) * 100;
      else if (t === "thousand") { total += (cur || 1) * 1000; cur = 0; }
      else return null;
    }
    return total + cur;
  }
  function numberOf(s) {
    if (s == null) return null;
    var t = String(s).trim();
    if (/^[\d,.]+$/.test(t)) { var v = Number(t.replace(/,/g, "")); return Number.isFinite(v) && v > 0 ? v : null; }
    var w = wordNumber(t);
    return w > 0 ? w : null;
  }

  /** Text aus HTML/TXT einer Einreichung: Tags, Skripte und Entities weg, Leerraum normiert. */
  function textOf(raw) {
    var t = String(raw || "");
    t = t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ");
    t = t.replace(/&nbsp;|&#160;|&#xa0;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
      .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;|&quot;/gi, "\"").replace(/&#8217;|&#8216;|&rsquo;|&lsquo;|&#39;/gi, "'")
      .replace(/&#8211;|&#8212;|&ndash;|&mdash;/gi, "-").replace(/&#\d+;|&[a-z]+;/gi, " ");
    t = t.replace(/[‐-―]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, "\"").replace(/ /g, " ");
    return t.replace(/\s+/g, " ").trim();
  }

  function sentences(text) {
    /* Satzende an . ; ! ? gefolgt von Leerraum und Grossbuchstabe/Ziffer/Anfuehrung; Abkuerzungen
       wie "a.m." / "Inc." / "No." trennen nicht. */
    var out = [], re = /([.;!?])\s+(?=["'(]?[A-Z0-9])/g, last = 0, m;
    while ((m = re.exec(text))) {
      var before = text.slice(Math.max(last, m.index - 6), m.index + 1);
      if (/\b(?:a\.m|p\.m|Inc|No|Co|Corp|Ltd|St|Mr|Ms|Dr|U\.S|Nos|approx|vs|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.$/i.test(before)) continue;
      out.push(text.slice(last, m.index + 1).trim()); last = m.index + 1;
    }
    if (last < text.length) out.push(text.slice(last).trim());
    return out.filter(Boolean);
  }

  function isoDate(mon, d, y) {
    var k = String(mon).toLowerCase().replace(/\./g, "");
    var m = MONTHS[k] || MONTHS[k.slice(0, 3)];
    var dd = Number(d), yy = Number(y);
    if (!m || !(dd >= 1 && dd <= 31) || !(yy >= 1990 && yy <= 2100)) return null;
    return yy + "-" + String(m).padStart(2, "0") + "-" + String(dd).padStart(2, "0");
  }
  function addDays(d, n) { return new Date(Date.parse(String(d).slice(0, 10) + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10); }
  function nextWeekday(d) { var x = addDays(d, 1); while ([0, 6].indexOf(new Date(x + "T00:00:00Z").getUTCDay()) >= 0) x = addDays(x, 1); return x; }
  /** Datumsangaben eines Satzes; "today"/"tomorrow" nur mit bekanntem Einreichungstag (Review F11). */
  function datesIn(s, filedDate) {
    var out = [], m; DATE_RE.lastIndex = 0;
    while ((m = DATE_RE.exec(s))) {
      var iso = isoDate(m[1], m[2], m[3]);
      if (!iso) continue;
      /* Stichtag, Zahltag, Hauptversammlung, Periodenende: kein Ereignistag */
      if (RE.notEventDate.test(s.slice(Math.max(0, m.index - 60), m.index))) continue;
      out.push({ iso: iso, index: m.index, end: m.index + m[0].length });
    }
    if (filedDate) {
      var rel = /\b(today|tomorrow|the\s+next\s+trading\s+day)\b/gi, r;
      while ((r = rel.exec(s))) out.push({ iso: /today/i.test(r[1]) ? filedDate : nextWeekday(filedDate), index: r.index, end: r.index + r[0].length, relative: true });
      out.sort(function (a, b) { return a.index - b.index; });
    }
    return out;
  }
  /** Datum, das hinter dem Ausloeser steht (hoechstens 120 Zeichen), sonst davor (60 Zeichen). */
  function dateNear(s, trigger, filedDate) {
    var g = new RegExp(trigger.source, "gi"), m, ds = datesIn(s, filedDate);
    if (!ds.length) return null;
    while ((m = g.exec(s))) {
      var at = m.index + m[0].length;
      for (var i = 0; i < ds.length; i++) if (ds[i].index >= at && ds[i].index - at <= 120) return ds[i].iso;
      for (var j = ds.length - 1; j >= 0; j--) if (ds[j].end <= m.index && m.index - ds[j].end <= 60) return ds[j].iso;
    }
    return null;
  }

  var RATIO_RES = [
    /* "1-for-25", "one-for-twenty five (1-for-25)", "25 to 1", "1 for 1,000" */
    { re: new RegExp("\\b" + NUM + "\\s*-?\\s*(?:for|to)\\s*-?\\s*" + NUM + "(?!\\d|,\\d)", "gi"), order: "AFORB" },
    /* "1:25", "(1:20)", "on a 10:1 basis" */
    { re: /\b(\d{1,4}(?:\.\d+)?)\s*:\s*(\d{1,5}(?:,\d{3})?(?:\.\d+)?)\b(?!\s*[ap]\.?m)/gi, order: "AFORB" },
    /* "every 35 shares ... into one share", "every forty shares ... consolidated into one" */
    { re: new RegExp("\\b(?:every|each)\\s+" + NUM + "\\s+(?:[\\w$.,()'\"-]+\\s+){0,14}?(?:shares?|ordinary\\s+shares?)\\b[^.]{0,160}?\\binto\\s+" + NUM + "\\s+(?:[\\w-]+\\s+){0,4}?shares?\\b", "gi"), order: "OLDNEW", direction: true },
    /* "1 share for every 35 shares", "one new share for each ten shares" */
    { re: new RegExp("\\b" + NUM + "\\s+(?:new\\s+|post-split\\s+)?(?:shares?\\s+)?(?:of\\s+(?:our\\s+|the\\s+)?common\\s+stock\\s+)?for\\s+(?:each|every)\\s+" + NUM + "\\s+(?:[\\w-]+\\s+){0,4}?shares?\\b", "gi"), order: "NEWOLD", direction: true },
    /* "100% stock dividend" = 2 neue je alte Aktie (ab 25 %; kleinere Aktiendividenden sind keine Split-Groesse) */
    { re: /\b(\d{2,3})\s*%\s*stock\s+dividend\b/gi, order: "PCT" }
  ];

  /** Nachbarschaft eines Treffers: hoechstens 80 Zeichen davor und danach (Review F03/F06). */
  function near(s, m) { return s.slice(Math.max(0, m.index - 80), m.index + m[0].length + 80); }

  /**
   * Alle Verhaeltnisse eines Satzes, je mit Richtung aus der Nachbarschaft und
   * Spannen-Kennzeichen der Nachbarschaft. q = neue Aktien je alter Aktie;
   * ohne Richtungswort zaehlt nur "A-for-B (stock) split" (q = A/B).
   */
  function ratiosIn(s, docDirection) {
    var out = [];
    RATIO_RES.forEach(function (R) {
      var m; R.re.lastIndex = 0;
      while ((m = R.re.exec(s))) {
        var ctx = near(s, m), clean = ctx.replace(RE.notDirection, " ");
        if (RE.exchangeRatio.test(ctx)) continue;
        var a, b, q, dir;
        if (R.order === "PCT") {
          var pct = Number(m[1]); if (!(pct >= 25 && pct <= 1000)) continue;
          q = 1 + pct / 100; dir = "FORWARD"; a = q; b = 1;
        } else {
          a = numberOf(m[1]); b = numberOf(m[2]);
          if (!(a > 0) || !(b > 0) || a === b) continue;
          if (a > 50000 || b > 50000) continue; /* Aktienzahlen ("from 2,857,142 to 100,000,000"), kein Verhaeltnis */
          if (/\bfrom\s*$/i.test(s.slice(Math.max(0, m.index - 6), m.index))) continue;
          if (R.order === "AFORB" && /\d\s*:\s*\d/.test(m[0]) && a > 1 && b > 1) continue; /* 2:3 ohne 1 ist Uhrzeit/Tabelle */
          var rev = RE.reverseLocal.test(clean), fwd = RE.forwardLocal.test(clean);
          if (rev && fwd) continue;
          var neu = R.order === "OLDNEW" ? b : R.order === "NEWOLD" ? a : a, old = R.order === "OLDNEW" ? a : R.order === "NEWOLD" ? b : b;
          if (rev) { q = Math.min(a, b) / Math.max(a, b); dir = "REVERSE"; }
          else if (fwd) { q = Math.max(a, b) / Math.min(a, b); dir = "FORWARD"; }
          else if (R.direction) { q = neu / old; dir = q < 1 ? "REVERSE" : "FORWARD"; }
          else if (/^\s*(?:\)\s*)?(?:stock\s+|share\s+)?split\b/i.test(s.slice(m.index + m[0].length, m.index + m[0].length + 25))) { q = neu / old; dir = q < 1 ? "REVERSE" : "FORWARD"; }
          else if (docDirection) { q = docDirection === "REVERSE" ? Math.min(a, b) / Math.max(a, b) : Math.max(a, b) / Math.min(a, b); dir = docDirection; }
          else continue; /* keine Richtung belegbar: kein Verhaeltnis */
          /* Wortlaut und Richtungswort widersprechen sich ("3-for-1 reverse"): keine Richtung (F03) */
          if (R.order !== "AFORB" && ((dir === "REVERSE" && neu > old) || (dir === "FORWARD" && neu < old))) continue;
        }
        out.push({ text: m[0], a: a, b: b, q: q, direction: dir, order: R.order, range: RE.range.test(ctx) });
      }
    });
    return out;
  }

  function stageOf(s) {
    var eff = RE.effectivePast.test(s), sched = RE.effectiveScheduled.test(s), ann = RE.announced.test(s), appr = RE.approved.test(s);
    if (eff && !/\b(?:pending|proposed|anticipated|if\s+approved)\b/i.test(s)) return { stage: "EFFECTIVE", scheduled: false };
    if (sched && !ann) return { stage: "EFFECTIVE", scheduled: true };
    /* Satzungsaenderung eingereicht, um den Split zu bewirken: terminiert wirksam (Datum aus dem Dokument). */
    if (RE.charter.test(s) && /\bfiled\b/i.test(s) && !ann) return { stage: "EFFECTIVE", scheduled: true };
    if (ann) return { stage: "ANNOUNCED", scheduled: false };
    if (appr) return { stage: "APPROVED", scheduled: false };
    return { stage: "MENTION", scheduled: false };
  }

  function fnv(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ("00000000" + h.toString(16)).slice(-8);
  }

  /** Richtung eines ganzen Dokuments, wenn alle Split-Woerter in eine Richtung zeigen. */
  function documentDirection(text) {
    var clean = String(text).replace(RE.notDirection, " ");
    var rev = /\breverse\s+(?:stock\s+|share\s+)?split|\bshare\s+consolidation|\bshare\s+combination/i.test(clean);
    var fwd = /\bforward\s+(?:stock\s+|share\s+)?split/i.test(clean) || /\b(?:two|three|2|3)\s*-?\s*for\s*-?\s*(?:one|two|1|2)\s+(?:stock\s+)?split/i.test(clean);
    return rev && !fwd ? "REVERSE" : fwd && !rev ? "FORWARD" : null;
  }

  /**
   * Split-Aussagen eines Textes. Jede Aussage: Stufe, Richtung, Verhaeltnis
   * (newPerOld oder null bei Spanne), Daten, Satz-Hash. filedDate loest
   * "today"/"tomorrow" auf.
   */
  function extractStatements(text, filedDate) {
    var ss = sentences(text), out = [], docSplit = RE.split.test(text), docDir = docSplit ? documentDirection(text) : null;
    for (var i = 0; i < ss.length; i++) {
      var s = ss[i];
      if (s.length > 1500) continue;
      var splitWord = RE.split.test(s);
      /* "The ratio was 1 for 10." in einem Split-Dokument: Verhaeltnis ohne Split-Wort im Satz (F12) */
      if (!splitWord && !(docSplit && ((/\bratio\b/i.test(s) && /\d\s*-?\s*for\s*-?\s*\d|\b(?:one|1)\s+for\s+\w+/i.test(s)) ||
          /\b(?:every|each)\s+[\w-]+\s+(?:\(\d+\)\s+)?(?:[\w-]+\s+){0,6}?shares?\b[^.]{0,160}\binto\s+(?:one|1)\b/i.test(s)))) continue;
      var st = stageOf(s);
      if (RE.boiler.test(s) && st.stage !== "EFFECTIVE") continue;
      var rs = ratiosIn(s, docDir);
      var vals = {}, range = rs.some(function (r) { return r.range; });
      rs.forEach(function (r) { vals[r.q.toPrecision(10)] = r; });
      var keys = Object.keys(vals), ratio = null, direction = null, ratioText = null;
      if (keys.length > 1) range = true;
      if (!range && keys.length === 1) { ratio = vals[keys[0]].q; direction = vals[keys[0]].direction; ratioText = vals[keys[0]].text; }
      if (!direction) {
        var cl = s.replace(RE.notDirection, " ");
        direction = RE.reverseLocal.test(cl) && !RE.forwardLocal.test(cl) ? "REVERSE" : RE.forwardLocal.test(cl) && !RE.reverseLocal.test(cl) ? "FORWARD" : null;
      }
      if (ratio !== null && (ratio < 1 / 5000 || ratio > 100 || Math.abs(ratio - 1) < 1e-9)) ratio = null;
      var stage = st.stage;
      if (range && stage === "EFFECTIVE") stage = "APPROVED";
      if (!splitWord && ratio === null) continue;
      var timing = RE.preOpen.test(s) ? "PRE_OPEN" : RE.postClose.test(s) ? "POST_CLOSE" : null;
      var marketDate = dateNear(s, RE.market, filedDate), effectiveDate = dateNear(s, RE.effectiveWord, filedDate);
      /* Wirksam nach Handelsschluss: der Handelstag ist die naechste Sitzung, nicht der genannte Tag (F11) */
      if (timing === "POST_CLOSE" && marketDate && marketDate === effectiveDate) marketDate = null;
      if (stage === "MENTION" && ratio === null) continue;
      out.push({ index: i, stage: stage, scheduled: st.scheduled, direction: direction, ratio: ratio, range: range, ratioText: ratioText,
        effectiveDate: effectiveDate, marketDate: marketDate, timing: timing,
        charter: RE.charter.test(s), sentenceHash: fnv(s), sentence: s.length > 400 ? s.slice(0, 400) : s });
    }
    return out;
  }

  function tickerPattern(t) {
    var esc = String(t || "").toUpperCase().replace(/[^A-Z0-9.\-]/g, "").replace(/[.\-]/g, "[.\\-]?");
    if (!esc) return null;
    /* nur im Kontext eines Handelsplatzes/Symbols (F09): "Nasdaq: XYZ", "under the symbol "XYZ"", "(NYSE American: XYZ)" */
    return new RegExp("(?:nasdaq|nyse|amex|otc\\w*|otcqb|otcqx|pink|tsx|symbol|ticker)[^.]{0,40}?[\\s:\"'(\\u201c]" + esc + "(?![A-Za-z0-9])", "i");
  }

  /**
   * Ereignisse einer Einreichung. Nennt das Dokument genau EIN festes
   * Verhaeltnis, gehoeren wirksame Aussagen ohne Verhaeltnis ("The Reverse
   * Stock Split became effective ... on <Datum>") zu diesem Verhaeltnis.
   * Mehrere Verhaeltnisse (Rueckblick ueber Jahre): nur Aussagen mit eigenem
   * Verhaeltnis zaehlen.
   */
  function filingEvents(text, meta) {
    meta = meta || {};
    var st = extractStatements(text, meta.filedDate || null), events = [];
    var exact = {}, i;
    for (i = 0; i < st.length; i++) if (st[i].ratio !== null) exact[st[i].ratio.toPrecision(10)] = st[i].ratio;
    var keys = Object.keys(exact);
    var single = keys.length === 1 ? exact[keys[0]] : null;
    var groups = {};
    for (i = 0; i < st.length; i++) {
      var s = st[i], q = s.ratio !== null ? s.ratio : (single !== null && (s.stage === "EFFECTIVE" || s.stage === "APPROVED") && !s.range ? single : null);
      if (q === null) {
        if (s.range || s.stage === "ANNOUNCED" || s.stage === "APPROVED") (groups.RANGE = groups.RANGE || []).push(s);
        continue;
      }
      var k = q.toPrecision(10);
      (groups[k] = groups[k] || []).push(Object.assign({}, s, { ratio: q }));
    }
    Object.keys(groups).forEach(function (k) {
      var g = groups[k], best = "MENTION", sched = true, mDate = null, eDate = null, timing = null, charter = false, hashes = [];
      g.forEach(function (s) {
        if (STAGE_RANK[s.stage] > STAGE_RANK[best]) best = s.stage;
        if (s.stage === "EFFECTIVE" && !s.scheduled) sched = false;
        if (!mDate && s.marketDate && s.stage === "EFFECTIVE") mDate = s.marketDate;
        if (!eDate && s.effectiveDate && s.stage === "EFFECTIVE") eDate = s.effectiveDate;
        if (!timing && s.timing && s.stage === "EFFECTIVE") timing = s.timing;
        charter = charter || s.charter;
        hashes.push(s.sentenceHash);
      });
      if (best !== "EFFECTIVE") sched = false;
      if (k === "RANGE") {
        events.push({ stage: best === "EFFECTIVE" ? "APPROVED" : best, ratio: null, direction: g.some(function (s) { return s.direction === "REVERSE"; }) ? "REVERSE" : null, range: true,
          effectiveDate: null, marketDate: null, timing: null, scheduled: false, charter: charter, provenance: hashes.sort().join(",") });
        return;
      }
      var q = g[0].ratio;
      if (best === "EFFECTIVE" && sched && !mDate && !eDate) best = "APPROVED"; /* terminiert, aber ohne Datum: keine Wirksamkeit */
      if (timing === "POST_CLOSE" && mDate && eDate && mDate === eDate) mDate = null;
      events.push({ stage: best, ratio: q, direction: q < 1 ? "REVERSE" : "FORWARD", range: false, effectiveDate: eDate, marketDate: mDate, timing: timing,
        scheduled: best === "EFFECTIVE" && sched, charter: charter, provenance: hashes.sort().join(",") });
    });
    var form = String(meta.form || "");
    var tp = meta.ticker ? tickerPattern(meta.ticker) : null;
    events.forEach(function (e) {
      var current = /^(?:8-K|6-K)/.test(form), periodic = /^(?:10-Q|10-K|20-F|40-F|10-KSB|10-QSB)/.test(form);
      var anchor = e.marketDate || e.effectiveDate;
      /* HIGH nur, wenn der genannte Tag nahe an der Einreichung liegt (F11: Rueckblicke in 6-K-Jahresberichten) */
      var close = anchor && meta.filedDate && Math.abs(Date.parse(anchor) - Date.parse(meta.filedDate)) <= 45 * 864e5;
      e.confidence = e.stage === "EFFECTIVE" && e.ratio !== null ? (anchor && close && (current || e.charter) ? "HIGH" : anchor ? "MEDIUM" : "LOW") : "LOW";
      e.source = { system: "SEC_EDGAR", form: form || null, items: meta.items || null, accession: meta.accession || null, document: meta.document || null,
        cik: meta.cik || null, filedDate: meta.filedDate || null, periodic: periodic };
      e.visibleAt = meta.filedDate || null;
      e.tickerMentioned = tp ? tp.test(text) : null;
    });
    return events;
  }

  /**
   * Fuehrt die Ereignisse vieler Einreichungen einer CIK zusammen: gleiches
   * Verhaeltnis und Daten hoechstens 10 Tage auseinander (oder beide
   * undatiert und hoechstens 120 Tage zwischen den Einreichungen) ergeben ein
   * Ereignis. Jede Einreichung bleibt als Beobachtung mit eigenem
   * Sichtbarkeitstag erhalten (observations): die Sicht zu einem Stichtag baut
   * das Ereignis nur aus Beobachtungen, die vorher eingereicht waren (F10).
   */
  function mergeEvents(list) {
    var evs = list.filter(function (e) { return e.ratio !== null; }).slice().sort(function (a, b) {
      return String(a.visibleAt).localeCompare(String(b.visibleAt));
    });
    var out = [];
    var near10 = function (a, b) { return Math.abs(Date.parse(a) - Date.parse(b)) <= 10 * 864e5; };
    evs.forEach(function (e) {
      var a = e.marketDate || e.effectiveDate, hit = null;
      for (var i = 0; i < out.length; i++) {
        var o = out[i];
        if (Math.abs(o.ratio / e.ratio - 1) > 1e-6) continue;
        var oa = anchorDates(o);
        var within120 = function (x, y) { return Math.abs(Date.parse(x) - Date.parse(y)) <= 120 * 864e5; };
        var same = a && oa.length ? oa.some(function (x) { return near10(a, x); })
          : a ? o.observations.some(function (x) { return within120(a, x.visibleAt); })
          : oa.length ? oa.some(function (x) { return within120(e.visibleAt, x); })
          : within120(e.visibleAt, o.lastVisibleAt);
        if (same) { hit = o; break; }
      }
      var obs = { stage: e.stage, scheduled: e.scheduled, marketDate: e.marketDate || null, effectiveDate: e.effectiveDate || null, timing: e.timing || null, confidence: e.confidence,
        visibleAt: e.visibleAt, form: e.source && e.source.form, accession: e.source && e.source.accession, tickerMentioned: e.tickerMentioned === true, provenance: e.provenance };
      if (!hit) { out.push({ ratio: e.ratio, direction: e.direction, observations: [obs], sources: [e.source], lastVisibleAt: e.visibleAt }); return; }
      hit.observations.push(obs); hit.sources.push(e.source); hit.lastVisibleAt = e.visibleAt;
    });
    return out.map(function (o) { return Object.assign(o, viewOf(o.observations), { provenanceHash: fnv(o.observations.map(function (x) { return x.provenance; }).sort().join("|")) }); });
  }
  function anchorDates(o) { return o.observations.map(function (x) { return x.marketDate || x.effectiveDate; }).filter(Boolean); }
  var CONF_RANK = { LOW: 0, MEDIUM: 1, HIGH: 2 };
  /** Zusammenfassung aus Beobachtungen: hoechste Stufe, Daten der zuverlaessigsten Beobachtung. */
  function viewOf(observations) {
    var v = { stage: null, scheduled: false, marketDate: null, effectiveDate: null, timing: null, confidence: "LOW", visibleAt: null, stageVisibleAt: {}, tickerMentioned: false };
    var bestConf = -1;
    observations.forEach(function (x) {
      if (!v.visibleAt || x.visibleAt < v.visibleAt) v.visibleAt = x.visibleAt;
      if (!v.stageVisibleAt[x.stage] || x.visibleAt < v.stageVisibleAt[x.stage]) v.stageVisibleAt[x.stage] = x.visibleAt;
      if (v.stage === null || STAGE_RANK[x.stage] > STAGE_RANK[v.stage]) { v.stage = x.stage; v.scheduled = x.scheduled; }
      else if (x.stage === v.stage && !x.scheduled) v.scheduled = false;
      var c = CONF_RANK[x.confidence] || 0;
      /* Daten der zuverlaessigsten Beobachtung; bei Gleichstand gewinnt der laufende Bericht (8-K/6-K) */
      var dr = c * 2 + (/^(?:8-K|6-K)/.test(String(x.form || "")) ? 1 : 0);
      if ((x.marketDate || x.effectiveDate) && dr > bestConf) { bestConf = dr; v.marketDate = x.marketDate; v.effectiveDate = x.effectiveDate; v.timing = x.timing; }
      if (c > (CONF_RANK[v.confidence] || 0)) v.confidence = x.confidence;
      v.tickerMentioned = v.tickerMentioned || x.tickerMentioned;
    });
    v.effectiveVisibleAt = v.stageVisibleAt.EFFECTIVE || null;
    return v;
  }
  /**
   * Das Ereignis, wie es vor dem Stichtag bekannt war: nur Beobachtungen, die
   * STRIKT vor asOf eingereicht wurden (Einreichungen nach Handelsschluss
   * tragen den Tag der Annahme; F10). null, wenn noch keine sichtbar war.
   */
  function eventAsOf(ev, asOf) {
    if (!asOf || !Array.isArray(ev.observations)) return ev;
    var obs = ev.observations.filter(function (x) { return x.visibleAt && x.visibleAt < asOf; });
    if (!obs.length) return null;
    return Object.assign({}, ev, viewOf(obs), { observations: obs });
  }

  var api = { VERSION: VERSION, STAGE_RANK: STAGE_RANK, textOf: textOf, sentences: sentences, numberOf: numberOf, ratiosIn: ratiosIn,
    extractStatements: extractStatements, filingEvents: filingEvents, mergeEvents: mergeEvents, eventAsOf: eventAsOf, viewOf: viewOf,
    datesIn: datesIn, tickerPattern: tickerPattern, documentDirection: documentDirection };
  if (isNode) module.exports = api;
  else global.VUSecCorporateActions = api;
})(typeof window !== "undefined" ? window : globalThis);
