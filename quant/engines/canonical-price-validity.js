/* =========================================================================
   VISION UNIVERSE — canonical-price-validity.js   (canonical-price-validity-2.0.0)

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

   STICHTAGSSICHT (PIT)
     build(bars, {asOf}) rechnet nur mit Kerzen <= asOf und SEC-Belegen mit
     visibleAt <= asOf. Ein Backtest zum Stichtag t benutzt diese Sicht -
     oder die Endsicht, beschraenkt auf Tage <= validUntil, solange
     observedAt jeder Ungueltigkeit nach t liegt (gleiches Ergebnis fuer
     alle Tage vor dem Defekt: Renditen sind Verhaeltnisse, eine spaetere
     Normalisierung aendert sie nicht).
     pitHistory() zeigt, wo sich die Sicht spaeter aendert: eine Sperre, die
     ein spaeter eingereichter SEC-Beleg aufloest (HOLD mit resumeFrom),
     oder ein Sprung, den erst die SEC-Einreichung als Split ausweist
     (PIT_REVISION).

   QUELLE DER ENTSCHEIDUNGEN
     Corporate Actions: corporate-action-validation.js (SEC + Anbieter)
     Rekonstruktion und Sperrgruende: canonical-total-return.js (unveraendert)
     Splitfaktoren: return-series.js#splitFactors (ADR-002) - hier keine
     eigene Ableitung.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;
  var CTR = isNode ? require("./canonical-total-return.js") : global.VUCanonicalTotalReturn;
  var CAV = isNode ? require("./corporate-action-validation.js") : global.VUCorporateActionValidation;
  var VERSION = "canonical-price-validity-2.0.0";

  var STATE_OF_REASON = {
    CORPORATE_ACTION_CONFLICT: "HOLD",
    SPLIT_SUSPECTED_UNDECLARED: "HOLD", SPLIT_SUSPECTED: "HOLD", SPLIT_MISSING: "HOLD",
    CORPORATE_ACTION_CONTRADICTED: "QUARANTINE", DIVIDEND_MISSING: "QUARANTINE", DIVIDEND_FIELD_MISSING: "QUARANTINE",
    SPLIT_FACTOR_FIELD_MISSING: "QUARANTINE", RAW_CLOSE_MISSING: "QUARANTINE", TRADING_GAP_UNVERIFIED: "QUARANTINE", UNSORTED: "QUARANTINE",
    PRICE_SPIKE_REVERTED: "QUARANTINE", STALE: "QUARANTINE",
    LISTING_DISCONTINUITY: "TERMINAL", IDENTITY_UNCERTAIN: "REJECTED", NO_BARS: "REJECTED"
  };

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function day(d) { return String(d).slice(0, 10); }

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
    opts = opts || {};
    var asOf = opts.asOf ? day(opts.asOf) : null;
    var bars = (Array.isArray(rawBars) ? rawBars : []).filter(function (b) { return b && (!asOf || day(b.date) <= asOf); })
      .slice().sort(function (a, b) { return day(a.date) < day(b.date) ? -1 : day(a.date) > day(b.date) ? 1 : 0; });
    var head = { contract: VERSION, corporateActionContract: CAV.CONTRACT, totalReturn: CTR.VERSION, coreCorporateActionContract: CTR.CORPORATE_ACTION_CONTRACT,
      asOf: asOf, first: bars.length ? day(bars[0].date) : null, last: bars.length ? day(bars[bars.length - 1].date) : null, bars: bars.length };
    var identity = opts.identity || { state: "UNVERIFIED" };
    var rec = function (r) { return CTR.reconstruct(r, { identity: identity, delisted: opts.delisted, role: opts.role }); };
    if (identity.state !== "CONFIRMED" || bars.length < 2) {
      var why = identity.state !== "CONFIRMED" ? "IDENTITY_UNCERTAIN" : "NO_BARS";
      return Object.assign(head, { state: "NO_VALID_BARS", validFrom: null, validUntil: null, validBars: 0, reason: why,
        intervals: [{ state: "REJECTED", from: head.first, reason: why, observedAt: head.first }], evidence: [], hold: null, invalidRanges: [], tr: null, dates: [] });
    }
    var ca = CAV.applySecEvidence(bars, { secEvents: opts.secEvents, shares: opts.shares, cik: opts.cik, cikBasis: opts.cikBasis, asOf: asOf });
    var sp = removeRevertedSpikes(ca.bars), nb = sp.bars;
    var v = firstFailure(nb, rec), prefix = nb, hold = null, evidence = ca.evidence.slice();
    /* Widerspruch zwischen Anbieterfaktor und SEC: der Kern kann ihn nicht sehen (der Faktor passt
       zur Kursbewegung im Ereignisband), die Evidenz schon -> HOLD ab dem Ereignistag. */
    var forced = ca.evidence.filter(function (e) { return e.outcome === "HOLD_FROM_EVENT_DATE" && e.eventDate; })
      .sort(function (a, b) { return a.eventDate < b.eventDate ? -1 : 1; })[0];
    if (forced) {
      var fi = nb.findIndex(function (b) { return day(b.date) >= forced.eventDate; });
      if (fi >= 0 && (v.index === undefined || fi < v.index)) {
        v = { index: fi, observedAt: forced.visibleAt && forced.visibleAt > day(nb[fi].date) ? forced.visibleAt : day(nb[fi].date),
          core: { reason: "CORPORATE_ACTION_CONFLICT", detail: forced.reason }, forcedBy: forced };
      }
    }
    if (v.index !== undefined && v.forcedBy) {
      hold = { state: "HOLD", from: day(nb[v.index].date), observedAt: v.observedAt, reason: "CORPORATE_ACTION_CONFLICT", detail: v.forcedBy.reason,
        evidenceClass: v.forcedBy.class, outcome: v.forcedBy.outcome };
      prefix = nb.slice(0, v.index);
    } else if (v.index !== undefined) {
      var failDate = day(nb[v.index].date), reason = v.core.reason, state = STATE_OF_REASON[reason] || "QUARANTINE";
      var cls = CAV.classifyHold(Object.assign({}, v.core, { date: failDate, observedAt: v.observedAt }), nb, { secEvents: opts.secEvents, shares: opts.shares, asOf: asOf });
      if (cls) evidence.push(cls);
      hold = { state: state, from: failDate, observedAt: v.observedAt, reason: reason, detail: typeof v.core.detail === "string" ? v.core.detail : null,
        evidenceClass: cls ? cls.class : null, outcome: cls ? cls.outcome : state === "HOLD" ? "HOLD_FROM_EVENT_DATE" : state === "TERMINAL" ? "TERMINAL" : "QUARANTINE" };
      prefix = nb.slice(0, v.index);
    }
    var tr = prefix.length >= 2 ? (v.result && prefix === nb ? v.result : rec(prefix)) : null;
    if (tr && !tr.reconstructed) tr = null; /* Praefix selbst nicht rekonstruierbar (darf nach firstFailure nicht vorkommen) */
    var validUntil = tr ? day(prefix[prefix.length - 1].date) : null, validFrom = tr ? day(prefix[0].date) : null;
    var invalid = sp.invalid.filter(function (x) { return validUntil && x.from <= validUntil; });
    var intervals = [];
    if (tr) {
      var cursor = validFrom;
      invalid.forEach(function (x) {
        intervals.push({ state: "VALID", from: cursor, to: prevDate(nb, x.from) });
        intervals.push(x);
        cursor = x.resumeFrom;
      });
      intervals.push({ state: "VALID", from: cursor, to: validUntil });
    }
    if (hold) intervals.push({ state: hold.state, from: hold.from, observedAt: hold.observedAt, reason: hold.reason, detail: hold.detail, evidenceClass: hold.evidenceClass, outcome: hold.outcome });
    else intervals.push({ state: "TERMINAL", from: head.last, kind: opts.delisted ? "DELISTED" : "OPEN" });
    return Object.assign(head, {
      state: !tr ? "NO_VALID_BARS" : hold ? "VALID_PREFIX" : invalid.length ? "VALID_WITH_INVALID_BARS" : "FULL_VALID",
      validFrom: validFrom, validUntil: validUntil, validBars: tr ? prefix.length : 0, hold: hold, invalidRanges: invalid,
      intervals: intervals, evidence: evidence,
      normalized: ca.evidence.filter(function (e) { return e.outcome === "NORMALIZE"; }).length,
      tr: tr ? tr.tr : null, priceReturnIndex: tr ? tr.priceReturnIndex : null, dates: tr ? prefix.map(function (b) { return day(b.date); }) : [],
      core: tr ? { state: tr.state, crossCheck: tr.crossCheck ? tr.crossCheck.state : null, events: tr.events } : null
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
      if (e.outcome !== "NORMALIZE" || !e.visibleAt || !e.eventDate || e.visibleAt <= e.eventDate) return;
      var view = build(rawBars, Object.assign({}, opts, { asOf: e.eventDate }));
      var held = view.hold && view.hold.from === e.eventDate;
      out.push({ state: held ? "HOLD" : "PIT_REVISION", from: e.eventDate, until: e.visibleAt, resumeFrom: nextDate(rawBars, e.visibleAt),
        reason: held ? view.hold.reason : "UNADJUSTED_JUMP_UNTIL_SEC_FILING", resolvedBy: e.provenanceHash, evidenceClass: e.class });
    });
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

  /** Ist der Tag d in der Sicht des Vertrags gueltig? */
  function isValidOn(contract, d) {
    if (!contract || !contract.validUntil) return false;
    d = day(d);
    if (d < contract.validFrom || d > contract.validUntil) return false;
    return !contract.invalidRanges.some(function (x) { return d >= x.from && d <= x.to; });
  }

  var api = { VERSION: VERSION, STATE_OF_REASON: STATE_OF_REASON, build: build, firstFailure: firstFailure, removeRevertedSpikes: removeRevertedSpikes,
    pitHistory: pitHistory, alignTr: alignTr, isValidOn: isValidOn };
  if (isNode) module.exports = api;
  else global.VUCanonicalPriceValidity = api;
})(typeof window !== "undefined" ? window : globalThis);
