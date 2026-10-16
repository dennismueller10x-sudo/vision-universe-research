/* =========================================================================
   VISION UNIVERSE — sec-corporate-actions.js     (sec-corporate-actions-1.0.0)

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
  var VERSION = "sec-corporate-actions-1.0.0";
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
    split: /\b(?:reverse\s+(?:stock\s+|share\s+)?split|(?:stock|share)\s+split|forward\s+(?:stock\s+)?split|split[-\s]adjusted|reverse\s+split|share\s+consolidation|consolidat(?:e|ed|ion)\b[^.]{0,160}\binto\s+(?:one|1)\b)/i,
    reverse: /\breverse\b|\bconsolidat|\bcombin(?:e|ed|ation)\b[^.]{0,80}\binto\b/i,
    forward: /\bforward\s+(?:stock\s+)?split\b/i,
    range: /\bnot\s+(?:less|more|greater|fewer)\s+than\b|\bbetween\b[^.]{0,80}\band\b|\bwithin\s+(?:a|the)\s+range\b|\brange\s+of\b|\branging\s+from\b|\bup\s+to\b|\bmaximum\b|\bminimum\b|\bany\s+whole\s+number\b|\bto\s+be\s+determined\b|\bin\s+(?:its|the\s+board'?s?)\s+(?:sole\s+)?discretion\b|\bat\s+a\s+ratio\s+(?:of\s+)?(?:from|between)\b/i,
    boiler: /\bin\s+(?:the\s+)?(?:case|event)\s+of\b|\bif\s+(?:the|any|there|at\s+any)\b|\bshall\s+be\s+(?:proportionately\s+|equitably\s+|appropriately\s+)?adjusted\b|\bsubject\s+to\s+(?:adjustment|appropriate\s+adjustment)\b|\banti-?dilution\b|\bfor\s+any\s+(?:stock\s+)?split\b|\bupon\s+(?:any|the\s+occurrence)\b|\bwhether\s+by\s+(?:stock\s+)?split\b|\bstock\s+splits?,\s+(?:stock\s+dividends|reverse|combinations|recapitalizations)\b/i,
    announced: /\b(?:pending|proposed|proposal|proposes?|propose|anticipated|anticipates?|expects?\s+to|expected\s+to|intends?\s+to|intention\s+to|plans?\s+to|planned|may\s+(?:effect|implement)|to\s+consider|seek(?:s|ing)?\s+(?:stockholder\s+|shareholder\s+)?approval|if\s+approved|will\s+vote|vote\s+on|recommends?)\b/i,
    approved: /\b(?:approved|authori[sz]ed|adopted|ratified|granted|determined\s+to\s+set|set\s+the\s+(?:reverse\s+)?(?:stock\s+)?split\s+ratio|fixed\s+the\s+ratio)\b/i,
    effectivePast: /\b(?:effected|effectuated|implemented|completed|consummated|became\s+effective|was\s+effective|were\s+effective|went\s+into\s+effect|took\s+effect|has\s+been\s+effected|have\s+been\s+effected|began\s+trading\s+on\s+a\s+split[-\s]adjusted\s+basis|commenced\s+trading\s+on\s+a\s+split[-\s]adjusted\s+basis|retroactively\s+(?:adjusted|restated)|(?:have|has)\s+been\s+(?:retroactively\s+)?(?:adjusted|restated)\s+to\s+(?:reflect|give\s+effect)|occurred|reflect(?:s|ing)?\s+the\s+(?:\w+[-\s]){0,4}(?:reverse\s+)?(?:stock\s+)?split\s+(?:effected|that))\b/i,
    effectiveScheduled: /\b(?:will|shall)\s+(?:become\s+|be\s+)?effective\b|\bwill\s+(?:begin|commence|start)\s+trading\s+on\s+a\s+split[-\s]adjusted\s+basis\b|\bto\s+(?:become|be)\s+effective\s+(?:at|on|as\s+of|prior|before)\b|\beffective\s+(?:as\s+of\s+|at\s+)?(?:\d{1,2}:\d{2}\s*[ap]\.?m\.?[^.]{0,40}?)?(?:on\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/i,
    charter: /\b(?:certificate|articles)\s+of\s+amendment\b|\bamendment\s+to\s+(?:the\s+|its\s+|our\s+)?(?:amended\s+and\s+restated\s+)?(?:certificate|articles)\s+of\s+incorporation\b[^.]{0,120}\bfiled\b|\bfiled\b[^.]{0,120}\b(?:certificate|articles)\s+of\s+(?:amendment|incorporation)\b/i,
    market: /\bsplit[-\s]adjusted\s+basis\b|\bbegin(?:s)?\s+trading\b|\bcommence(?:s)?\s+trading\b|\bopening\s+of\s+(?:the\s+)?(?:market|trading)\b|\bmarket\s+open\b|\bat\s+the\s+open\b/i,
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
  function datesIn(s) {
    var out = [], m; DATE_RE.lastIndex = 0;
    while ((m = DATE_RE.exec(s))) { var iso = isoDate(m[1], m[2], m[3]); if (iso) out.push({ iso: iso, index: m.index, end: m.index + m[0].length }); }
    return out;
  }
  /** Datum, das hinter dem Ausloeser steht (hoechstens 120 Zeichen), sonst davor (60 Zeichen). */
  function dateNear(s, trigger) {
    var g = new RegExp(trigger.source, "gi"), m, ds = datesIn(s);
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
    /* "1:25", "(1:20)" */
    { re: /\b(\d{1,4}(?:\.\d+)?)\s*:\s*(\d{1,5}(?:,\d{3})?(?:\.\d+)?)\b(?!\s*[ap]\.?m)/gi, order: "AFORB" },
    /* "every 35 shares ... into one share", "every forty shares ... consolidated into one" */
    { re: new RegExp("\\bevery\\s+" + NUM + "\\s+(?:[\\w$.,()'\"-]+\\s+){0,14}?(?:shares?|ordinary\\s+shares?)\\b[^.]{0,160}?\\binto\\s+" + NUM + "\\s+(?:[\\w-]+\\s+){0,4}?shares?\\b", "gi"), order: "OLDNEW" },
    /* "1 share for every 35 shares", "one new share for each ten shares" */
    { re: new RegExp("\\b" + NUM + "\\s+(?:new\\s+|post-split\\s+)?(?:shares?\\s+)?(?:of\\s+(?:our\\s+|the\\s+)?common\\s+stock\\s+)?for\\s+(?:each|every)\\s+" + NUM + "\\s+(?:[\\w-]+\\s+){0,4}?shares?\\b", "gi"), order: "NEWOLD" }
  ];

  /** Alle Verhaeltnisse eines Satzes als neue Aktien je alter Aktie (ohne Richtung). */
  function ratiosIn(s) {
    var out = [];
    RATIO_RES.forEach(function (R) {
      var m; R.re.lastIndex = 0;
      while ((m = R.re.exec(s))) {
        var a = numberOf(m[1]), b = numberOf(m[2]);
        if (!(a > 0) || !(b > 0) || a === b) continue;
        if (a > 50000 || b > 50000) continue; /* Aktienzahlen ("from 2,857,142 to 100,000,000"), kein Verhaeltnis */
        if (/\bfrom\s*$/i.test(s.slice(Math.max(0, m.index - 6), m.index))) continue;
        if (R.order === "AFORB" && /^\d/.test(m[1]) && /^\d/.test(m[2]) && /\d\s*:\s*\d/.test(m[0]) && a > 1 && b > 1) continue; /* 2:3 etc. ohne 1 ist ein Zeitpunkt/Tabelle */
        var neu = R.order === "OLDNEW" ? b : a, old = R.order === "OLDNEW" ? a : b;
        out.push({ text: m[0], a: a, b: b, newShares: neu, oldShares: old, order: R.order });
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

  /**
   * Split-Aussagen eines Textes. Jede Aussage: Stufe, Richtung, Verhaeltnis
   * (newPerOld oder null bei Spanne), Daten, Satz-Hash.
   */
  function extractStatements(text) {
    var ss = sentences(text), out = [];
    for (var i = 0; i < ss.length; i++) {
      var s = ss[i];
      if (s.length > 1500 || !RE.split.test(s)) continue;
      var st = stageOf(s);
      var boiler = RE.boiler.test(s) && st.stage !== "EFFECTIVE";
      if (boiler) continue;
      var rs = ratiosIn(s), range = RE.range.test(s) && (rs.length !== 1 || /\b(?:not\s+(?:less|more)|between|range|up\s+to)\b/i.test(s));
      var reverse = RE.reverse.test(s), forward = RE.forward.test(s) && !reverse;
      var ratio = null, direction = reverse ? "REVERSE" : forward ? "FORWARD" : null, ratioText = null;
      if (!range && rs.length) {
        var vals = {};
        rs.forEach(function (r) {
          var q = r.newShares / r.oldShares;
          if (direction === "REVERSE") q = Math.min(r.a, r.b) / Math.max(r.a, r.b);
          else if (direction === "FORWARD") q = Math.max(r.a, r.b) / Math.min(r.a, r.b);
          vals[q.toPrecision(10)] = { q: q, text: r.text };
        });
        var keys = Object.keys(vals);
        if (keys.length === 1) { ratio = vals[keys[0]].q; ratioText = vals[keys[0]].text; }
        else if (keys.length > 1) range = true;
      }
      if (ratio !== null && !direction) direction = ratio < 1 ? "REVERSE" : "FORWARD";
      if (ratio !== null && (ratio < 1 / 5000 || ratio > 100 || Math.abs(ratio - 1) < 1e-9)) ratio = null;
      var stage = st.stage;
      if (range && stage === "EFFECTIVE") stage = "APPROVED";
      var marketDate = dateNear(s, RE.market), effectiveDate = dateNear(s, /\beffective\b|\beffected\b|\beffectuated\b|\bimplemented\b|\bcompleted\b|\bbecame\s+effective\b/);
      if (stage === "MENTION" && ratio === null) continue;
      out.push({ index: i, stage: stage, scheduled: st.scheduled, direction: direction, ratio: ratio, range: range, ratioText: ratioText,
        effectiveDate: effectiveDate, marketDate: marketDate, timing: RE.preOpen.test(s) ? "PRE_OPEN" : RE.postClose.test(s) ? "POST_CLOSE" : null,
        charter: RE.charter.test(s), sentenceHash: fnv(s), sentence: s.length > 400 ? s.slice(0, 400) : s });
    }
    return out;
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
    var st = extractStatements(text), events = [];
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
      events.push({ stage: best, ratio: q, direction: q < 1 ? "REVERSE" : "FORWARD", range: false, effectiveDate: eDate, marketDate: mDate, timing: timing,
        scheduled: best === "EFFECTIVE" && sched, charter: charter, provenance: hashes.sort().join(",") });
    });
    var form = String(meta.form || "");
    events.forEach(function (e) {
      var current = /^(?:8-K|6-K)/.test(form), periodic = /^(?:10-Q|10-K|20-F|40-F|10-KSB|10-QSB)/.test(form);
      e.confidence = e.stage === "EFFECTIVE" && e.ratio !== null ? ((e.marketDate || e.effectiveDate) && (current || e.charter) ? "HIGH" : "MEDIUM") : "LOW";
      e.source = { system: "SEC_EDGAR", form: form || null, items: meta.items || null, accession: meta.accession || null, document: meta.document || null,
        cik: meta.cik || null, filedDate: meta.filedDate || null, periodic: periodic };
      e.visibleAt = meta.filedDate || null;
      e.tickerMentioned = meta.ticker ? new RegExp("(?:^|[^A-Z])" + String(meta.ticker).replace(/[^A-Z.]/g, "") + "(?![A-Z])").test(text) : null;
    });
    return events;
  }

  /**
   * Fuehrt die Ereignisse vieler Einreichungen einer CIK zusammen: gleiches
   * Verhaeltnis und Daten hoechstens 10 Tage auseinander (oder undatiert)
   * ergeben ein Ereignis. Sichtbar ab der fruehesten Einreichung, die die
   * erreichte Stufe belegt (PIT).
   */
  function mergeEvents(list) {
    var evs = list.filter(function (e) { return e.ratio !== null; }).slice().sort(function (a, b) {
      return String(a.visibleAt).localeCompare(String(b.visibleAt));
    });
    var out = [];
    var anchorOf = function (e) { return e.marketDate || e.effectiveDate || null; };
    var near = function (a, b) { return Math.abs(Date.parse(a) - Date.parse(b)) <= 10 * 864e5; };
    evs.forEach(function (e) {
      var a = anchorOf(e), hit = null;
      for (var i = 0; i < out.length; i++) {
        var o = out[i];
        if (Math.abs(o.ratio / e.ratio - 1) > 1e-6) continue;
        var oa = o.marketDate || o.effectiveDate;
        if (a && oa ? near(a, oa) : Math.abs(Date.parse(e.visibleAt) - Date.parse(o.lastVisibleAt)) <= 400 * 864e5) { hit = o; break; }
      }
      if (!hit) {
        out.push({ ratio: e.ratio, direction: e.direction, stage: e.stage, scheduled: e.scheduled, marketDate: e.marketDate, effectiveDate: e.effectiveDate, timing: e.timing,
          confidence: e.confidence, visibleAt: e.visibleAt, lastVisibleAt: e.visibleAt,
          stageVisibleAt: Object.fromEntries ? Object.fromEntries([[e.stage, e.visibleAt]]) : (function () { var o = {}; o[e.stage] = e.visibleAt; return o; })(),
          sources: [e.source], provenance: [e.provenance], tickerMentioned: e.tickerMentioned === true });
        return;
      }
      if (STAGE_RANK[e.stage] > STAGE_RANK[hit.stage]) { hit.stage = e.stage; hit.scheduled = e.scheduled; }
      if (!hit.stageVisibleAt[e.stage]) hit.stageVisibleAt[e.stage] = e.visibleAt;
      if (e.stage === "EFFECTIVE" && !e.scheduled && hit.scheduled) hit.scheduled = false;
      if (e.confidence === "HIGH" || !hit.marketDate) { hit.marketDate = hit.marketDate || e.marketDate; hit.effectiveDate = hit.effectiveDate || e.effectiveDate; hit.timing = hit.timing || e.timing; }
      if (e.confidence === "HIGH") hit.confidence = "HIGH"; else if (e.confidence === "MEDIUM" && hit.confidence === "LOW") hit.confidence = "MEDIUM";
      hit.lastVisibleAt = e.visibleAt;
      hit.sources.push(e.source); hit.provenance.push(e.provenance);
      hit.tickerMentioned = hit.tickerMentioned || e.tickerMentioned === true;
    });
    out.forEach(function (o) { o.effectiveVisibleAt = o.stageVisibleAt.EFFECTIVE || null; o.provenanceHash = fnv(o.provenance.slice().sort().join("|")); });
    return out;
  }

  var api = { VERSION: VERSION, STAGE_RANK: STAGE_RANK, textOf: textOf, sentences: sentences, numberOf: numberOf, ratiosIn: ratiosIn,
    extractStatements: extractStatements, filingEvents: filingEvents, mergeEvents: mergeEvents, datesIn: datesIn };
  if (isNode) module.exports = api;
  else global.VUSecCorporateActions = api;
})(typeof window !== "undefined" ? window : globalThis);
