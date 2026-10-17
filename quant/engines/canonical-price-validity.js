/* =========================================================================
   VISION UNIVERSE — canonical-price-validity.js   (canonical-price-validity-3.0.0)

   KANONISCHER SERIENVERTRAG MIT GUELTIGKEITSINTERVALLEN (Partial Series)

   Bis 1.2.0 war eine Reihe ganz oder gar nicht kanonisch: der Kern
   (canonical-total-return.js#reconstruct) liefert bei einem Befund an
   irgendeinem Tag tr = null - und Verbraucher wie scripts/quant/lib/
   daily-prices.mjs verwerfen damit auch Jahre gueltiger Kerzen VOR dem
   Befund (Review R8). Dieser Vertrag beschreibt je Reihe, WELCHE Tage
   kanonisch sind und SEIT WANN man das weiss:

     VALID          Kerzen, deren Gesamtrendite der Kern rekonstruiert
                    (Praefix bis validUntil)
     INVALID_RANGE  einzelne Kerzen ohne gueltigen Kurs (Fehlkurs, der am
                    Folgetag zurueckfaellt). Die Reihe laeuft danach weiter
                    (RESUME_FROM); die Rendite ueberspringt die Kerze.
     HOLD           ab hier nicht kanonisch, weil eine Kapitalmassnahme
                    wahrscheinlich, aber nicht unabhaengig belegt ist
                    (HOLD_FROM_EVENT_DATE) - keine Rueckrechnung
     QUARANTINE     ab hier nicht kanonisch, weil die Daten sich
                    widersprechen (Ereignis passt nicht zum Kurs, fehlende
                    Ausschuettung, Luecke ohne Gegenprobe)
     TERMINAL       Listing-Bruch oder Ende der Reihe (DELISTED / OPEN)

   Jede Ungueltigkeit traegt observedAt: den ersten Tag, an dem sie aus
   Kerzen und Belegen BIS zu diesem Tag erkennbar war. Ein Defekt am
   01.06.2024 beruehrt eine Sicht zum 31.12.2022 nicht.

   3.0.0 (Protocol 3.0.0, CANONICAL_CORPORATE_ACTION_PROTOCOL_V3.md)
     - Zweite Quelle: FINRA OTC Daily List (opts.finraEvents Splits,
       opts.listingEvents Marktplatz-/Symbolwechsel) neben SEC.
     - Sprung-Semantik (discontinuity-semantics.js): jeder Tagessprung ab
       3:1 ohne Anbieterereignis (oder als Rest eines gemeldeten Faktors)
       wird einer Ursache zugeordnet. Mechanische Split-Signatur in jeder
       Richtung -> HOLD; extreme Spruenge (>= 10:1) ohne positive Erklaerung
       -> HOLD/QUARANTINE; extreme Fehlkurse mit Ruecklauf -> INVALID_RANGE;
       Listing-Wechsel -> TERMINAL. Abwaertsspruenge werden damit erstmals
       semantisch erfasst.
     - RESUME_FROM: nach einer Sperre, die nur eine Skalenstufe betrifft
       (Split-Signatur, Quellenwiderspruch zum Faktor, unerklaerter
       Extremsprung, Einheit), laeuft die Reihe als neues Segment mit
       eigener Indexbasis weiter, wenn die Kerzen danach fuer sich gueltig
       sind. Die Rendite UEBER die Bruchstelle gibt es nie.
       validFrom/validUntil/tr/dates beschreiben wie in 2.x das ERSTE
       Segment; segments[] alle; view{VALID_UNTIL, HOLD_FROM,
       INVALID_RANGE, RESUME_FROM, TERMINAL} die benannten Grenzen.

   STICHTAGSSICHT (PIT)
     build(bars, {asOf}) rechnet nur mit Kerzen <= asOf und SEC-Einreichungen
     STRIKT vor asOf (je Einreichung eigene Felder, sec-corporate-actions.js
     eventAsOf: ein spaeter eingereichtes Datum gilt nicht rueckwirkend).
     Ein Backtest zum Stichtag t benutzt diese Sicht. Die Endsicht stimmt mit
     ihr fuer alle Tage vor dem ersten Befund ueberein, AUSSER an Tagen, die
     erst eine spaetere SEC-Einreichung normalisiert (pitHistory: PIT_REVISION
     bzw. HOLD mit resumeFrom) - dort aendert die Normalisierung die
     Tagesrendite des Ereignistags. Wer die Endsicht nimmt, nimmt diese
     Revision in Kauf; sie ist je Ereignis ausgewiesen.
     pitHistory() zeigt, wo sich die Sicht spaeter aendert: eine Sperre, die
     ein spaeter eingereichter SEC-Beleg aufloest (HOLD mit resumeFrom),
     oder ein Sprung, den erst die SEC-Einreichung als Split ausweist
     (PIT_REVISION).

   QUELLE DER ENTSCHEIDUNGEN
     Corporate Actions: corporate-action-validation.js (SEC + Anbieter)
     Rekonstruktion und Sperrgruende: canonical-total-return.js (unveraendert)
     Splitfaktoren: ein bestaetigtes SEC-Ereignis wird als splitFactor-Eingang
     in die unveraenderte Rekonstruktion gegeben; hier keine eigene
     Faktorkette (ADR-002).
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;
  var CTR = isNode ? require("./canonical-total-return.js") : global.VUCanonicalTotalReturn;
  var CAV = isNode ? require("./corporate-action-validation.js") : global.VUCorporateActionValidation;
  var DS = isNode ? require("./discontinuity-semantics.js") : global.VUDiscontinuitySemantics;
  var VERSION = "canonical-price-validity-3.0.0";

  var STATE_OF_REASON = {
    CORPORATE_ACTION_CONFLICT: "HOLD",
    SPLIT_SUSPECTED_UNDECLARED: "HOLD", SPLIT_SUSPECTED: "HOLD", SPLIT_MISSING: "HOLD",
    CORPORATE_ACTION_CONTRADICTED: "QUARANTINE", DIVIDEND_MISSING: "QUARANTINE", DIVIDEND_FIELD_MISSING: "QUARANTINE",
    SPLIT_FACTOR_FIELD_MISSING: "QUARANTINE", RAW_CLOSE_MISSING: "QUARANTINE", TRADING_GAP_UNVERIFIED: "QUARANTINE", UNSORTED: "QUARANTINE",
    PRICE_SPIKE_REVERTED: "QUARANTINE", STALE: "QUARANTINE",
    LISTING_DISCONTINUITY: "TERMINAL", IDENTITY_UNCERTAIN: "REJECTED", NO_BARS: "REJECTED",
    UNDECLARED_SPLIT_SIGNATURE: "HOLD", UNEXPLAINED_EXTREME_DISCONTINUITY: "HOLD", CORPORATE_ACTION_RESIDUAL: "HOLD",
    CURRENCY_OR_UNIT_CHANGE: "QUARANTINE", STALE_THEN_EXTREME_JUMP: "QUARANTINE", LISTING_CHANGE_SEMANTIC: "TERMINAL"
  };

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function day(d) { return String(d).slice(0, 10); }
  function addDays(d, n) { return new Date(Date.parse(day(d) + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10); }

  /**
   * Erster Tag, ab dem der Kern die Reihe nicht mehr rekonstruiert, und der
   * Tag, an dem das erkennbar war. Gleiche Semantik wie der Praefix-Pruefer
   * der Supertrader-Forschung (V4 data.mjs#firstCanonicalFailure): Pruefpunkte
   * an jedem Ereignis, jeder Luecke, jeder grossen Bewegung und jedem
   * Anbieterschritt; dort wird der Praefix bis einschliesslich Pruefpunkt
   * rekonstruiert. Ein spaeteres Ereignis heilt nie einen frueheren Befund.
   */
  function firstFailure(raw, reconstruct) {
    var cfg = CTR.CONFIG, checkpoints = { 1: true }, drift = 0, i;
    for (i = 0; i < raw.length; i++) {
      var b = raw[i], prev = raw[i - 1];
      if (!isNum(b.dividend) || !isNum(b.splitFactor) || b.dividend !== 0 || b.splitFactor !== 1) checkpoints[Math.max(1, i)] = true;
      if (!prev) continue;
      if ((Date.parse(day(b.date)) - Date.parse(day(prev.date))) / 864e5 > 7 || Math.abs(b.close / prev.close - 1) >= cfg.suspectedSplitMove) checkpoints[i] = true;
      if (b.adjustedClose > 0 && prev.adjustedClose > 0 && b.dividend === 0 && b.splitFactor === 1) {
        var mObs = (prev.adjustedClose / prev.close) / (b.adjustedClose / b.close), step = 1 - mObs;
        if (Math.abs(step) > cfg.factorNoise) checkpoints[i] = true;
        else { drift += Math.log(mObs); if (drift < Math.log(1 - cfg.maxUnexplainedDrift)) checkpoints[i] = true; }
      }
    }
    var cps = Object.keys(checkpoints).map(Number).sort(function (a, b) { return a - b; });
    var fail = function (res, at, i0) {
      var idx = res.date ? raw.findIndex(function (x) { return day(x.date) === res.date; }) : i0;
      return { index: idx >= 0 ? Math.min(idx, i0) : i0, observedAt: day(raw[i0].date), core: res };
    };
    for (var c = 0; c < cps.length; c++) {
      i = cps[c]; if (i >= raw.length) continue;
      var res = reconstruct(raw.slice(0, i + 1));
      if (!res.reconstructed) return fail(res, null, i);
    }
    var full = reconstruct(raw);
    if (full.reconstructed) return { result: full };
    for (i = 1; i < raw.length; i++) {
      var r2 = reconstruct(raw.slice(0, i + 1));
      if (!r2.reconstructed) return fail(r2, null, i);
    }
    return { index: raw.length - 1, observedAt: day(raw[raw.length - 1].date), core: full };
  }

  /** Entfernt Fehlkurse, die am Folgetag zurueckfallen (je Kerze, kausal erkannt am Folgetag). */
  function removeRevertedSpikes(bars) {
    var out = bars.slice(), invalid = [];
    for (var i = 2; i < out.length; i++) {
      var s = CTR.revertedSpike(out, i);
      if (!s) continue;
      invalid.push({ state: "INVALID_RANGE", from: s.date, to: s.date, observedAt: day(out[i].date), reason: "PRICE_SPIKE_REVERTED",
        spikeRatio: s.spikeRatio, revertRatio: s.revertRatio, resumeFrom: day(out[i].date) });
      out.splice(i - 1, 1); i = Math.max(1, i - 2);
    }
    return { bars: out, invalid: invalid };
  }

  /**
   * Gueltigkeitsvertrag einer Reihe.
   *
   * @param {Array} rawBars  Rohkerzen {date, open, high, low, close, volume, splitFactor, dividend, adjustedClose}
   * @param {object} opts    {identity, delisted, role, secEvents, shares, cik, cikBasis, asOf}
   */
  function build(rawBars, opts) {
    var c = buildView(rawBars, opts);
    resolveObservedAt(rawBars, opts || {}, c);
    return c;
  }
  /**
   * observedAt einer Normalisierung = erster Handelstag, dessen Stichtagssicht
   * sie enthaelt (Review F19). Die Normalisierung kann auf Angaben beruhen, die
   * erst nach dem Ereignistag vorliegen (Datum aus einem spaeteren 8-K,
   * Aktienzahl fuer kleine Verhaeltnisse, Kerzen im Fenster nach dem Anker);
   * der Einreichungstag der Stufe allein unterschaetzt den Tag. Aendert keine
   * Entscheidung, nur den Zeitstempel.
   */
  function resolveObservedAt(rawBars, opts, c) {
    var norm = (c.evidence || []).filter(function (e) { return e.outcome === "NORMALIZE" && e.eventDate; });
    if (!norm.length && !(c.holds && c.holds.length) && !c.hold && !((c.segments || []).length > 1)) return;
    var asOf = c.asOf, days = (Array.isArray(rawBars) ? rawBars : []).filter(Boolean).map(function (b) { return day(b.date); })
      .filter(function (d) { return !asOf || d <= asOf; }).sort();
    /* Sperre (Review R2-01): erster Tag, dessen Stichtagssicht dieselbe Sperre zeigt. Ein SEC-Widerspruch
       wird erst sichtbar, wenn die Einreichung STRIKT vor dem Stichtag liegt und das Datum, das den
       Anbieterfaktor ins Fenster legt, aus einer spaeteren Einreichung stammen kann. */
    /* 3.0.0: jede Sperre (auch in spaeteren Segmenten nach RESUME_FROM) */
    (c.holds && c.holds.length ? c.holds : c.hold ? [c.hold] : []).forEach(function (h) {
      var found = null;
      h.observedAtStage = h.observedAt || null;
      for (var j = 0; j < days.length && !found; j++) {
        if (days[j] < h.from || (j > 0 && days[j] === days[j - 1])) continue;
        var hv = buildView(rawBars, Object.assign({}, opts, { asOf: days[j] }));
        if ((hv.holds || []).some(function (x) { return x.from === h.from && x.state === h.state; })) found = days[j];
      }
      h.observedAt = found || (days.length ? addDays(days[days.length - 1], 1) : null);
      h.observedAtBasis = found ? "FIRST_AS_OF_VIEW_WITH_HOLD" : "AFTER_LAST_BAR";
      (c.intervals || []).forEach(function (x) { if (x.state === h.state && x.from === h.from) x.observedAt = h.observedAt; });
    });
    /* RESUME_FROM (Review P3-01/P3-04): erster Tag, dessen Stichtagssicht das Segment enthaelt - nie vor der Sperre davor */
    (c.segments || []).slice(1).forEach(function (sg) {
      var found = null;
      for (var j = 0; j < days.length && !found; j++) {
        if (days[j] < sg.from || (j > 0 && days[j] === days[j - 1])) continue;
        var sv = buildView(rawBars, Object.assign({}, opts, { asOf: days[j] }));
        if ((sv.segments || []).some(function (x) { return x.from === sg.from; })) found = days[j];
      }
      sg.resumedAfter.observedAt = found || (days.length ? addDays(days[days.length - 1], 1) : null);
      sg.resumedAfter.observedAtBasis = found ? "FIRST_AS_OF_VIEW_WITH_SEGMENT" : "AFTER_LAST_BAR";
      (c.intervals || []).forEach(function (x) { if (x.state === "RESUME_FROM" && x.from === sg.from) x.observedAt = sg.resumedAfter.observedAt; });
      ((c.view && c.view.RESUME_FROM) || []).forEach(function (x) { if (x.from === sg.from) x.observedAt = sg.resumedAfter.observedAt; });
    });
    norm.forEach(function (e) {
      e.observedAtStage = e.observedAt || null;
      for (var k = 0; k < days.length; k++) {
        if (days[k] < e.eventDate || (k > 0 && days[k] === days[k - 1])) continue;
        var view = buildView(rawBars, Object.assign({}, opts, { asOf: days[k] }));
        if (view.evidence.some(function (x) { return x.outcome === "NORMALIZE" && x.eventDate === e.eventDate && x.ratio === e.ratio; })) {
          e.observedAt = days[k]; e.observedAtBasis = "FIRST_AS_OF_VIEW_WITH_NORMALIZATION"; return;
        }
      }
      /* innerhalb der Reihe nie in einer Stichtagssicht: nur revidierte Historie */
      e.observedAt = days.length ? addDays(days[days.length - 1], 1) : null; e.observedAtBasis = "AFTER_LAST_BAR";
    });
  }
  /** Haltegruende, nach denen die Reihe als neues Segment weiterlaufen darf (RESUME_FROM): eine einzelne Skalenstufe, danach in sich gueltige Kerzen. */
  var RESUMABLE = { SPLIT_SUSPECTED_UNDECLARED: true, SPLIT_SUSPECTED: true, SPLIT_MISSING: true, CORPORATE_ACTION_CONFLICT: true,
    UNDECLARED_SPLIT_SIGNATURE: true, UNEXPLAINED_EXTREME_DISCONTINUITY: true, CURRENCY_OR_UNIT_CHANGE: true, CORPORATE_ACTION_RESIDUAL: true };
  var SEMANTIC_REASON = { FORWARD_SPLIT: "UNDECLARED_SPLIT_SIGNATURE", REVERSE_SPLIT: "UNDECLARED_SPLIT_SIGNATURE", UNRESOLVED: "UNEXPLAINED_EXTREME_DISCONTINUITY",
    CURRENCY_OR_UNIT: "CURRENCY_OR_UNIT_CHANGE", DATA_STALENESS: "STALE_THEN_EXTREME_JUMP", LISTING_CHANGE: "LISTING_CHANGE_SEMANTIC" };
  var SEMANTIC_STATE = { UNDECLARED_SPLIT_SIGNATURE: "HOLD", UNEXPLAINED_EXTREME_DISCONTINUITY: "HOLD", CURRENCY_OR_UNIT_CHANGE: "QUARANTINE", STALE_THEN_EXTREME_JUMP: "QUARANTINE",
    LISTING_CHANGE_SEMANTIC: "TERMINAL", CORPORATE_ACTION_RESIDUAL: "HOLD" };

  /**
   * Extreme Fehlkurse, die binnen zwei Sitzungen zuruecklaufen (Semantik BAD_TICK), werden wie die
   * Spikes des Kerns als INVALID_RANGE herausgenommen. Kausal: erkannt mit der Kerze des Ruecklaufs.
   */
  function removeSemanticBadTicks(bars, ctx) {
    var out = bars.slice(), invalid = [];
    for (var i = 1; i < out.length; i++) {
      var c = DS.classify(out, i, ctx);
      if (!c || c.outcome !== "INVALID_RANGE") continue;
      var k = c.channels.revertedAfter, from = day(out[i].date), to = day(out[i + k - 1].date);
      invalid.push({ state: "INVALID_RANGE", from: from, to: to, observedAt: day(out[i + k].date), reason: "BAD_TICK_REVERTED", semantic: { cause: c.cause, ratio: c.ratio, channels: c.channels },
        resumeFrom: day(out[i + k].date) });
      out.splice(i, k); i = Math.max(0, i - 2);
    }
    return { bars: out, invalid: invalid };
  }

  /**
   * Ein gueltiger Lauf ab Kerze start: erster Befund des Kerns, erste erzwungene Sperre (Quellenwiderspruch)
   * und erster semantischer Befund (Sprung mit Ausgang HOLD_FROM/TERMINAL). Der frueheste gewinnt.
   */
  function runFrom(nb, start, rec, forcedList, ctx) {
    var slice = nb.slice(start), v = firstFailure(slice, rec), cand = null;
    var end = v.index !== undefined ? v.index : slice.length;
    for (var i = 1; i < end; i++) {
      var c = DS.classify(slice, i, ctx);
      if (c && (c.outcome === "HOLD_FROM" || c.outcome === "TERMINAL")) { cand = c; break; }
    }
    var forced = forcedList.filter(function (e) { var fi = indexOnOrAfter(slice, e.eventDate); return fi > 0; })[0] || null;
    var fIdx = forced ? indexOnOrAfter(slice, forced.eventDate) : -1;
    var best = { kind: v.index !== undefined ? "CORE" : null, index: v.index !== undefined ? v.index : slice.length };
    if (forced && fIdx >= 0 && fIdx <= best.index) best = { kind: "FORCED", index: fIdx };
    if (cand && cand.index < best.index) best = { kind: "SEMANTIC", index: cand.index };
    return { start: start, end: start + best.index, kind: best.kind, core: v, forced: forced, semantic: cand, slice: slice, result: best.kind === null ? v.result : null };
  }
  function indexOnOrAfter(bars, d) { for (var i = 0; i < bars.length; i++) if (day(bars[i].date) >= d) return i; return -1; }

  function buildView(rawBars, opts) {
    opts = opts || {};
    var asOf = opts.asOf ? day(opts.asOf) : null;
    var bars = (Array.isArray(rawBars) ? rawBars : []).filter(function (b) { return b && (!asOf || day(b.date) <= asOf); })
      .slice().sort(function (a, b) { return day(a.date) < day(b.date) ? -1 : day(a.date) > day(b.date) ? 1 : 0; });
    var head = { contract: VERSION, corporateActionContract: CAV.CONTRACT, totalReturn: CTR.VERSION, coreCorporateActionContract: CTR.CORPORATE_ACTION_CONTRACT, semantics: DS.VERSION,
      asOf: asOf, first: bars.length ? day(bars[0].date) : null, last: bars.length ? day(bars[bars.length - 1].date) : null, bars: bars.length };
    var identity = opts.identity || { state: "UNVERIFIED" };
    var rec = function (r) { return CTR.reconstruct(r, { identity: identity, delisted: opts.delisted, role: opts.role }); };
    if (identity.state !== "CONFIRMED" || bars.length < 2) {
      var why = identity.state !== "CONFIRMED" ? "IDENTITY_UNCERTAIN" : "NO_BARS";
      return Object.assign(head, { state: "NO_VALID_BARS", validFrom: null, validUntil: null, validBars: 0, reason: why,
        intervals: [{ state: "REJECTED", from: head.first, reason: why, observedAt: head.first }], evidence: [], hold: null, invalidRanges: [], tr: null, dates: [],
        segments: [], resumedBars: 0, usableBars: 0, semanticFindings: [], view: { VALID_UNTIL: null, HOLD_FROM: null, INVALID_RANGE: [], RESUME_FROM: [], TERMINAL: null } });
    }
    /* Belege: SEC und FINRA in derselben Pruefung (corporate-action-validation-3.0.0) */
    var events = (opts.secEvents || []).concat(opts.finraEvents || []);
    var ctx = { listingEvents: opts.listingEvents || [], asOf: asOf };
    var ca = CAV.applySecEvidence(bars, { secEvents: events, shares: opts.shares, cik: opts.cik, cikBasis: opts.cikBasis, asOf: asOf });
    var sp = removeRevertedSpikes(ca.bars), sb = removeSemanticBadTicks(sp.bars, ctx), nb = sb.bars, evidence = ca.evidence.slice();
    var spikes = sp.invalid.concat(sb.invalid).sort(function (a, b) { return a.from < b.from ? -1 : 1; });
    /* Widerspruch zwischen Quellen (Anbieterfaktor <-> SEC, SEC <-> FINRA): der Kern sieht ihn nicht -> HOLD ab dem Ereignistag. */
    var forcedList = ca.evidence.filter(function (e) { return e.outcome === "HOLD_FROM_EVENT_DATE" && e.eventDate; })
      .sort(function (a, b) { return a.eventDate < b.eventDate ? -1 : 1; });
    var runs = [], start = 0, semanticFindings = [];
    while (start < nb.length - 1) {
      var run = runFrom(nb, start, rec, forcedList, ctx), hold = null;
      if (run.kind === "FORCED") {
        var fb = nb[run.end];
        hold = { state: "HOLD", from: day(fb.date), observedAt: run.forced.visibleAt && run.forced.visibleAt > day(fb.date) ? run.forced.visibleAt : day(fb.date), reason: "CORPORATE_ACTION_CONFLICT",
          detail: run.forced.reason, evidenceClass: run.forced.class, outcome: run.forced.outcome };
      } else if (run.kind === "CORE") {
        var failDate = day(nb[run.end].date), reason = run.core.core.reason, state = STATE_OF_REASON[reason] || "QUARANTINE";
        var cls = CAV.classifyHold(Object.assign({}, run.core.core, { date: failDate, observedAt: run.core.observedAt }), nb, { secEvents: events, shares: opts.shares, asOf: asOf });
        if (cls) evidence.push(cls);
        hold = { state: state, from: failDate, observedAt: run.core.observedAt, reason: reason, detail: typeof run.core.core.detail === "string" ? run.core.core.detail : null,
          evidenceClass: cls ? cls.class : null, outcome: cls ? cls.outcome : state === "HOLD" ? "HOLD_FROM_EVENT_DATE" : state === "TERMINAL" ? "TERMINAL" : "QUARANTINE" };
      } else if (run.kind === "SEMANTIC") {
        var sc = run.semantic, sReason = sc.onDeclaredSplit && sc.cause !== "LISTING_CHANGE" ? "CORPORATE_ACTION_RESIDUAL" : SEMANTIC_REASON[sc.cause] || "UNEXPLAINED_EXTREME_DISCONTINUITY";
        var sState = SEMANTIC_STATE[sReason] || "HOLD", sDate = day(nb[run.end].date);
        var cls2 = sState === "HOLD" ? CAV.classifyHold({ reason: "SPLIT_SEMANTIC_" + sc.cause, date: sDate, observedAt: sDate, conventionalRatio: sc.direction === "UP" ? sc.channels.conventionalRatio : (sc.channels.conventionalRatio ? 1 / sc.channels.conventionalRatio : null) }, nb, { secEvents: events, shares: opts.shares, asOf: asOf }) : null;
        if (cls2) { cls2.semantic = { cause: sc.cause, ratio: sc.ratio, extreme: sc.extreme }; evidence.push(cls2); }
        semanticFindings.push({ date: sDate, cause: sc.cause, ratio: sc.ratio, extreme: sc.extreme, outcome: sc.outcome, channels: sc.channels });
        hold = { state: sState, from: sDate, observedAt: sDate, reason: sReason, detail: sc.cause, evidenceClass: cls2 ? cls2.class : null,
          outcome: sState === "TERMINAL" ? "TERMINAL" : sState === "QUARANTINE" ? "QUARANTINE" : cls2 ? cls2.outcome : "HOLD_FROM_EVENT_DATE", semantic: { cause: sc.cause, ratio: sc.ratio, channels: sc.channels } };
      }
      var prefix = nb.slice(run.start, run.end);
      var tr = prefix.length >= 2 ? (run.kind === null && run.result ? run.result : rec(prefix)) : null;
      if (tr && !tr.reconstructed) tr = null;
      runs.push({ start: run.start, end: run.end, prefix: prefix, tr: tr, hold: hold });
      if (!hold || !RESUMABLE[hold.reason] || hold.state === "TERMINAL" || run.end <= run.start) break;
      start = run.end;
    }
    var first = runs[0] || { prefix: [], tr: null, hold: null }, tr0 = first.tr;
    var validUntil = tr0 ? day(first.prefix[first.prefix.length - 1].date) : null, validFrom = tr0 ? day(first.prefix[0].date) : null;
    var segments = runs.filter(function (r) { return r.tr; }).map(function (r, k) {
      return { index: k, from: day(r.prefix[0].date), to: day(r.prefix[r.prefix.length - 1].date), validBars: r.prefix.length, dates: r.prefix.map(function (b) { return day(b.date); }), tr: r.tr.tr,
        resumedAfter: k === 0 && r === first ? null : { from: day(r.prefix[0].date), observedAt: r.prefix.length > 1 ? day(r.prefix[1].date) : day(r.prefix[0].date), observedAtBasis: "SEGMENT_SECOND_BAR" } };
    });
    var inSeg = function (d) { return segments.some(function (s) { return d >= s.from && d <= s.to; }); };
    var invalid = spikes.filter(function (x) { return inSeg(x.from) || (segments.length && x.from > segments[0].from && x.from <= segments[segments.length - 1].to); });
    var invalid0 = invalid.filter(function (x) { return validUntil && x.from <= validUntil; });
    var lastRun = runs[runs.length - 1] || null, finalHold = first.hold;
    var intervals = [];
    runs.forEach(function (r, k) {
      if (r.tr) {
        var segFrom = day(r.prefix[0].date), segTo = day(r.prefix[r.prefix.length - 1].date), cursor = segFrom;
        if (k > 0) intervals.push({ state: "RESUME_FROM", from: segFrom, observedAt: r.prefix.length > 1 ? day(r.prefix[1].date) : segFrom, after: runs[k - 1].hold ? runs[k - 1].hold.reason : null });
        invalid.filter(function (x) { return x.from >= segFrom && x.from <= segTo; }).forEach(function (x) {
          intervals.push({ state: "VALID", from: cursor, to: prevDate(nb, x.from) }); intervals.push(x); cursor = x.resumeFrom;
        });
        intervals.push({ state: "VALID", from: cursor, to: segTo, segment: k });
      }
      if (r.hold) intervals.push({ state: r.hold.state, from: r.hold.from, observedAt: r.hold.observedAt, reason: r.hold.reason, detail: r.hold.detail, evidenceClass: r.hold.evidenceClass, outcome: r.hold.outcome });
    });
    if (!lastRun || !lastRun.hold) intervals.push({ state: "TERMINAL", from: head.last, kind: opts.delisted ? "DELISTED" : "OPEN" });
    var resumedBars = segments.slice(1).reduce(function (a, s) { return a + s.validBars; }, 0);
    var terminalHold = runs.filter(function (r) { return r.hold && r.hold.state === "TERMINAL"; })[0] || null;
    return Object.assign(head, {
      state: !tr0 ? "NO_VALID_BARS" : finalHold ? "VALID_PREFIX" : invalid0.length ? "VALID_WITH_INVALID_BARS" : "FULL_VALID",
      validFrom: validFrom, validUntil: validUntil, validBars: tr0 ? first.prefix.length : 0, hold: finalHold, invalidRanges: invalid0,
      intervals: intervals, evidence: evidence,
      normalized: ca.evidence.filter(function (e) { return e.outcome === "NORMALIZE"; }).length,
      tr: tr0 ? tr0.tr : null, priceReturnIndex: tr0 ? tr0.priceReturnIndex : null, dates: tr0 ? first.prefix.map(function (b) { return day(b.date); }) : [],
      core: tr0 ? { state: tr0.state, crossCheck: tr0.crossCheck ? tr0.crossCheck.state : null, events: tr0.events } : null,
      /* 3.0.0: alle gueltigen Segmente (RESUME_FROM), alle Fehlkurs-Bereiche darin, semantische Befunde */
      segments: segments, segmentInvalidRanges: invalid, resumedBars: resumedBars, usableBars: segments.reduce(function (a, s) { return a + s.validBars; }, 0),
      holds: runs.filter(function (r) { return r.hold; }).map(function (r) { return r.hold; }), semanticFindings: semanticFindings,
      view: { VALID_UNTIL: validUntil, HOLD_FROM: finalHold ? finalHold.from : null, INVALID_RANGE: invalid.map(function (x) { return { from: x.from, to: x.to, observedAt: x.observedAt }; }),
        RESUME_FROM: segments.slice(1).map(function (s) { return { from: s.from, observedAt: s.resumedAfter.observedAt }; }),
        TERMINAL: terminalHold ? { from: terminalHold.hold.from, reason: terminalHold.hold.reason } : lastRun && lastRun.hold ? null : { from: head.last, kind: opts.delisted ? "DELISTED" : "OPEN" } }
    });
  }
  function prevDate(bars, d) {
    for (var i = bars.length - 1; i >= 0; i--) if (day(bars[i].date) < d) return day(bars[i].date);
    return d;
  }

  /**
   * Wo sich die Sicht spaeter aendert (PIT): fuer jede Normalisierung, deren
   * SEC-Beleg erst nach dem Ereignistag eingereicht wurde, die Sicht am
   * Ereignistag. Und jede Fehlkurs-Kerze mit ihrem Erkennungstag.
   */
  function pitHistory(rawBars, opts, finalContract) {
    var fin = finalContract || build(rawBars, opts), out = [];
    fin.evidence.forEach(function (e) {
      /* jede Normalisierung, die eine Stichtagssicht am Ereignistag noch nicht enthaelt (F19) */
      if (e.outcome !== "NORMALIZE" || !e.eventDate || !e.observedAt || e.observedAt <= e.eventDate) return;
      var view = buildView(rawBars, Object.assign({}, opts, { asOf: e.eventDate }));
      var held = view.hold && view.hold.from === e.eventDate;
      out.push({ state: held ? "HOLD" : "PIT_REVISION", from: e.eventDate, until: prevDate((rawBars || []).filter(Boolean).map(function (b) { return { date: day(b.date) }; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }), e.observedAt),
        resumeFrom: e.observedAt,
        reason: held ? view.hold.reason : "UNADJUSTED_JUMP_UNTIL_SEC_FILING", resolvedBy: e.provenanceHash, evidenceClass: e.class });
    });
    /* Sperre, die erst nach ihrem Beginn sichtbar wird: Sichten davor halten die Kerzen ab hold.from fuer gueltig (R2-01) */
    if (fin.hold && fin.hold.observedAt && fin.hold.observedAt > fin.hold.from) {
      out.push({ state: "HOLD_RETROACTIVE", from: fin.hold.from, observedAt: fin.hold.observedAt,
        until: prevDate((rawBars || []).filter(Boolean).map(function (b) { return { date: day(b.date) }; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }), fin.hold.observedAt),
        reason: fin.hold.reason, evidenceClass: fin.hold.evidenceClass });
    }
    fin.invalidRanges.forEach(function (x) { out.push({ state: "INVALID_RANGE", from: x.from, to: x.to, observedAt: x.observedAt, reason: x.reason }); });
    return out;
  }
  function nextDate(bars, d) {
    var best = null;
    (bars || []).forEach(function (b) { var x = day(b.date); if (x > d && (!best || x < best)) best = x; });
    return best;
  }

  /** Gesamtrendite-Index ausgerichtet auf beliebige Tage: NaN ausserhalb gueltiger Kerzen. */
  function alignTr(contract, dates) {
    var out = new Float64Array(dates.length).fill(NaN);
    if (!contract || !contract.tr) return out;
    var at = {};
    for (var i = 0; i < contract.dates.length; i++) at[contract.dates[i]] = contract.tr[i];
    for (var j = 0; j < dates.length; j++) { var v = at[day(dates[j])]; if (isNum(v)) out[j] = v; }
    return out;
  }

  /** Ist der Tag d in der Sicht des Vertrags gueltig? (3.0.0: in irgendeinem Segment, ohne Fehlkurs-Bereich) */
  function isValidOn(contract, d) {
    if (!contract || !contract.validUntil) return false;
    d = day(d);
    var segs = contract.segments && contract.segments.length ? contract.segments : [{ from: contract.validFrom, to: contract.validUntil }];
    if (!segs.some(function (s) { return d >= s.from && d <= s.to; })) return false;
    var inv = contract.segmentInvalidRanges || contract.invalidRanges;
    return !inv.some(function (x) { return d >= x.from && d <= x.to; });
  }
  /** Segmentnummer eines Tages (-1 ausserhalb). */
  function segmentOf(contract, d) {
    d = day(d);
    var segs = (contract && contract.segments) || [];
    for (var k = 0; k < segs.length; k++) if (d >= segs[k].from && d <= segs[k].to) return k;
    return -1;
  }
  /** Darf die Rendite von d0 nach d1 gebildet werden? Beide gueltig und im selben Segment (nie ueber RESUME_FROM). */
  function isValidReturn(contract, d0, d1) {
    return isValidOn(contract, d0) && isValidOn(contract, d1) && segmentOf(contract, d0) === segmentOf(contract, d1) && segmentOf(contract, d0) >= 0;
  }
  /** Alle Segmente auf Tage ausgerichtet: tr je Segment (eigene Basis) und Segmentnummer; NaN / -1 ausserhalb. */
  function alignSegments(contract, dates) {
    var tr = new Float64Array(dates.length).fill(NaN), seg = new Int32Array(dates.length).fill(-1);
    var at = {};
    ((contract && contract.segments) || []).forEach(function (s, k) { for (var i = 0; i < s.dates.length; i++) at[s.dates[i]] = [s.tr[i], k]; });
    for (var j = 0; j < dates.length; j++) { var v = at[day(dates[j])]; if (v && isNum(v[0])) { tr[j] = v[0]; seg[j] = v[1]; } }
    return { tr: tr, segment: seg };
  }

  var api = { VERSION: VERSION, STATE_OF_REASON: STATE_OF_REASON, build: build, firstFailure: firstFailure, removeRevertedSpikes: removeRevertedSpikes,
    pitHistory: pitHistory, alignTr: alignTr, isValidOn: isValidOn, segmentOf: segmentOf, isValidReturn: isValidReturn, alignSegments: alignSegments,
    RESUMABLE: RESUMABLE, removeSemanticBadTicks: removeSemanticBadTicks };
  if (isNode) module.exports = api;
  else global.VUCanonicalPriceValidity = api;
})(typeof window !== "undefined" ? window : globalThis);
