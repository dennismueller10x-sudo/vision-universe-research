/* =========================================================================
   VISION UNIVERSE — corporate-action-validation.js
                         (corporate-action-validation-2.0.0, corporate-action-contract-2.0.0)

   UNABHAENGIGE CORPORATE-ACTION-EVIDENZ IM KANONISCHEN DATENVERTRAG

   Bis corporate-action-contract-1.2.0 kannte der Kern nur zwei Belege fuer
   einen Split: den splitFactor des Kursanbieters und dessen adjustedClose.
   Fehlte beides, blieb nur der Kurs selbst - und aus dem Kurs allein darf
   nichts zurueckgerechnet werden. Version 2.0.0 nimmt eine UNABHAENGIGE
   Quelle hinzu: Split-Ereignisse aus SEC-Einreichungen
   (sec-corporate-actions.js, Stufe EFFECTIVE mit festem Verhaeltnis).

   EVIDENZKLASSEN (je Ereignis)
     CONFIRMED_SPLIT / CONFIRMED_REVERSE_SPLIT
         SEC meldet das Ereignis als wirksam (Verhaeltnis q), UND der Kurs
         zeigt es im Fenster um das gemeldete Datum: entweder fuehrt der
         Anbieter denselben Faktor (bis auf Rundung, 1 %) oder der Rohkurs
         springt an genau einem Tag so, dass q die Bewegung besser erklaert
         als "kein Ereignis" (|ln r + ln q| < |ln r|). Keine weitere Schwelle.
     PROBABLE_CORPORATE_ACTION
         Hinweise ohne unabhaengige Wirksamkeit: der Anbieter fuehrt einen
         Split, die SEC hat einen nur genehmigt/angekuendigt, oder die
         SEC-Aktienzahl stuetzt den Preisbefund.
     CONFLICTING_CORPORATE_ACTION
         Quellen widersprechen sich: Anbieterfaktor != SEC-Verhaeltnis, oder
         die SEC-Aktienzahl widerspricht dem Preisbefund.
     PRICE_DISCONTINUITY_NO_CA_EVIDENCE
         nur der Kurs (Signatur des Kerns 1.2.0), keine Quelle.
     UNKNOWN
         SEC-Ereignis, das sich im Kurs nicht zeigt (ausserhalb des Listings,
         keine passende Bewegung, mehrdeutig) - keine Aktion.

   AUSGAENGE (keine stille Kursreparatur)
     ACCEPT          Anbieter und SEC stimmen ueberein; Reihe unveraendert
     NORMALIZE       nur CONFIRMED_*: der fehlende Faktor q wird am belegten
                     Tag als splitFactor eingesetzt; die Rueckrechnung macht
                     danach allein return-series.js#splitFactors (ADR-002)
     HOLD_FROM_EVENT_DATE
                     PROBABLE, CONFLICTING, PRICE_DISCONTINUITY_NO_CA_EVIDENCE:
                     ab dem Ereignistag nicht kanonisch, nie zurueckgerechnet
     NO_ACTION       UNKNOWN

   POINT IN TIME
     Jeder Beleg traegt visibleAt (Einreichungstag der SEC-Unterlage, die die
     Stufe EFFECTIVE belegt). Eine Normalisierung gilt fuer einen Stichtag
     erst, wenn visibleAt <= Stichtag; canonical-price-validity.js baut die
     Sicht eines Stichtags nur aus Kerzen und Belegen bis zu diesem Tag.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;
  var VERSION = "corporate-action-validation-2.0.0";
  var CONTRACT = "corporate-action-contract-2.0.0";
  var CONFIG = {
    providerRatioTolerance: 1.01, /* Anbieterfaktor = SEC-Verhaeltnis bis auf Rundung */
    windowBefore: 2,              /* Sitzungen vor dem gemeldeten Handelstag */
    windowAfter: 3,               /* Sitzungen danach (Zeitzone, Handelsaufnahme) */
    undatedLookbackDays: 400,     /* Rueckblick im 10-Q/10-K ohne Datum: hoechstens ein Geschaeftsjahr + Quartal */
    approvedLookbackDays: 365     /* Genehmigung/Ankuendigung gilt hoechstens ein Jahr */
  };
  var CLASSES = ["CONFIRMED_SPLIT", "CONFIRMED_REVERSE_SPLIT", "PROBABLE_CORPORATE_ACTION", "CONFLICTING_CORPORATE_ACTION",
    "PRICE_DISCONTINUITY_NO_CA_EVIDENCE", "UNKNOWN"];
  var OUTCOME = { CONFIRMED_SPLIT: "NORMALIZE", CONFIRMED_REVERSE_SPLIT: "NORMALIZE", PROBABLE_CORPORATE_ACTION: "HOLD_FROM_EVENT_DATE",
    CONFLICTING_CORPORATE_ACTION: "HOLD_FROM_EVENT_DATE", PRICE_DISCONTINUITY_NO_CA_EVIDENCE: "HOLD_FROM_EVENT_DATE", UNKNOWN: "NO_ACTION" };

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function day(d) { return String(d).slice(0, 10); }
  function addDays(d, n) { return new Date(Date.parse(day(d) + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10); }
  function round(v, k) { if (!isNum(v)) return null; var f = Math.pow(10, k == null ? 6 : k); return Math.round(v * f) / f; }
  function fnv(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ("00000000" + h.toString(16)).slice(-8);
  }
  function noAction(b) { return isNum(b.splitFactor) && Math.abs(b.splitFactor - 1) <= 1e-9 && (!isNum(b.dividend) || b.dividend === 0); }
  function hasSplit(b) { return isNum(b.splitFactor) && Math.abs(b.splitFactor - 1) > 1e-9; }
  /** q erklaert die Bewegung r besser als "kein Ereignis". */
  function explains(r, q) { return r > 0 && q > 0 && Math.abs(Math.log(r) + Math.log(q)) < Math.abs(Math.log(r)); }

  /** Stufe eines zusammengefuehrten SEC-Ereignisses, wie sie zum Stichtag sichtbar war. */
  function stageAt(ev, asOf) {
    if (!asOf) return ev.stage;
    var order = ["EFFECTIVE", "APPROVED", "ANNOUNCED", "MENTION"], sv = ev.stageVisibleAt || {};
    for (var i = 0; i < order.length; i++) if (sv[order[i]] && sv[order[i]] <= asOf) return order[i];
    return null;
  }

  function firstIndexOnOrAfter(bars, d) {
    for (var i = 0; i < bars.length; i++) if (day(bars[i].date) >= d) return i;
    return -1;
  }

  /** Handelstag, an dem das Ereignis im Kurs erscheinen muss (null = undatiert). */
  function anchorOf(ev) {
    if (ev.marketDate) return { date: ev.marketDate, basis: "MARKET_DATE" };
    if (ev.effectiveDate) return { date: ev.effectiveDate, basis: ev.timing === "POST_CLOSE" ? "EFFECTIVE_AFTER_CLOSE" : "EFFECTIVE_DATE", nextSession: ev.timing === "POST_CLOSE" };
    return null;
  }

  /** Aktienzahl vor und nach einem Tag (SEC, Stichtag der Angabe). */
  function sharesAround(shares, d, asOf) {
    if (!Array.isArray(shares) || !shares.length) return null;
    var rows = shares.filter(function (s) { return isNum(s.value) && s.value > 0 && (!asOf || !s.availableAt || s.availableAt <= asOf); })
      .map(function (s) { return { at: day(s.periodEnd || s.asOf || s.availableAt), value: s.value }; })
      .sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
    var before = null, after = null;
    for (var i = 0; i < rows.length; i++) { if (rows[i].at < d) before = rows[i]; else if (!after) after = rows[i]; }
    if (!before || !after) return null;
    return { before: before, after: after, ratio: after.value / before.value };
  }
  function sharesVerdict(sh, q) {
    if (!sh) return "NONE";
    return explains(1 / sh.ratio, q) ? "SUPPORTS" : "CONTRADICTS";
  }

  function record(cls, fields) {
    var r = Object.assign({ class: cls, outcome: OUTCOME[cls] }, fields);
    r.provenanceHash = fnv(JSON.stringify([cls, r.eventDate, r.ratio, (r.sources || []).map(function (s) { return [s.system, s.accession || s.field || null, s.filedDate || s.date || null]; })]));
    return r;
  }

  /**
   * Gleicht die SEC-Ereignisse einer Reihe mit Kurs und Anbieterfaktor ab.
   *
   * @param {Array} bars   aufsteigend {date, open, close, volume, splitFactor, dividend, adjustedClose}
   * @param {object} opts  {secEvents, shares, cik, cikBasis, asOf}
   * @returns {{bars: Array, evidence: Array}} bars mit eingesetzten Faktoren (nur NORMALIZE)
   */
  function applySecEvidence(bars, opts) {
    opts = opts || {};
    var asOf = opts.asOf || null, out = bars.map(function (b) { return Object.assign({}, b); }), evidence = [], used = {};
    var events = (opts.secEvents || []).filter(function (e) { return e && isNum(e.ratio) && e.ratio > 0 && Math.abs(e.ratio - 1) > 1e-9; });
    if (!out.length) return { bars: out, evidence: evidence };
    var first = day(out[0].date), last = day(out[out.length - 1].date);
    events.forEach(function (ev) {
      var stage = stageAt(ev, asOf);
      if (stage !== "EFFECTIVE") return;
      var visibleAt = (ev.stageVisibleAt && ev.stageVisibleAt.EFFECTIVE) || ev.visibleAt;
      var q = ev.ratio, anchor = anchorOf(ev), lo, hi, a = -1;
      var base = { eventDate: null, ratio: round(q, 8), direction: q < 1 ? "REVERSE" : "FORWARD", stage: "EFFECTIVE", confidence: ev.confidence,
        sources: (ev.sources || []).map(function (s) { return { system: s.system, form: s.form, items: s.items, accession: s.accession, filedDate: s.filedDate }; }),
        identity: { cik: opts.cik || null, basis: ["CIK_LINK"].concat(ev.tickerMentioned ? ["TICKER_IN_FILING"] : []), cikStatus: opts.cikBasis || null },
        secEvent: { marketDate: ev.marketDate || null, effectiveDate: ev.effectiveDate || null, timing: ev.timing || null, scheduled: ev.scheduled === true, provenanceHash: ev.provenanceHash || null },
        visibleAt: visibleAt };
      if (anchor) {
        var ad = anchor.date;
        if (ad < addDays(first, -7) || ad > addDays(last, 7)) { evidence.push(record("UNKNOWN", Object.assign(base, { reason: "SEC_EVENT_OUTSIDE_SERIES", eventDate: ad }))); return; }
        a = firstIndexOnOrAfter(out, ad);
        if (a < 0) { evidence.push(record("UNKNOWN", Object.assign(base, { reason: "SEC_EVENT_AFTER_LAST_BAR", eventDate: ad }))); return; }
        if (anchor.nextSession && day(out[a].date) === ad) a = Math.min(a + 1, out.length - 1);
        lo = Math.max(1, a - CONFIG.windowBefore); hi = Math.min(out.length - 1, a + CONFIG.windowAfter);
      } else {
        if (!visibleAt) return;
        var from = addDays(visibleAt, -CONFIG.undatedLookbackDays);
        lo = Math.max(1, firstIndexOnOrAfter(out, from)); hi = -1;
        for (var z = out.length - 1; z >= 0; z--) if (day(out[z].date) <= visibleAt) { hi = z; break; }
        if (lo < 1 || hi < lo) { evidence.push(record("UNKNOWN", Object.assign(base, { reason: "SEC_EVENT_OUTSIDE_SERIES" }))); return; }
      }
      /* 1. Anbieter fuehrt im Fenster einen Split. */
      var prov = [];
      for (var i = lo; i <= hi; i++) if (hasSplit(out[i])) prov.push(i);
      if (prov.length) {
        var ok = prov.filter(function (j) { return Math.abs(Math.log(out[j].splitFactor) - Math.log(q)) <= Math.log(CONFIG.providerRatioTolerance); });
        if (ok.length) {
          var j0 = ok[0];
          if (used[j0]) return; used[j0] = true;
          evidence.push(record(q < 1 ? "CONFIRMED_REVERSE_SPLIT" : "CONFIRMED_SPLIT", Object.assign(base, { reason: "PROVIDER_FACTOR_MATCHES_SEC", eventDate: day(out[j0].date),
            outcome: "ACCEPT", observedAt: day(out[j0].date), sources: base.sources.concat([{ system: "PROVIDER_SPLIT_FACTOR", date: day(out[j0].date), factor: out[j0].splitFactor }]),
            priceObservation: { date: day(out[j0].date), providerFactor: out[j0].splitFactor } })));
          return;
        }
        var jc = prov[0];
        evidence.push(record("CONFLICTING_CORPORATE_ACTION", Object.assign(base, { reason: "PROVIDER_FACTOR_DIFFERS_FROM_SEC", eventDate: day(out[jc].date), observedAt: day(out[jc].date),
          sources: base.sources.concat([{ system: "PROVIDER_SPLIT_FACTOR", date: day(out[jc].date), factor: out[jc].splitFactor }]) })));
        return;
      }
      /* 2. Rohkurs: genau der Tag, den q am besten erklaert. */
      var best = -1, bestScore = Infinity, qualifying = 0;
      for (i = lo; i <= hi; i++) {
        var b = out[i], p = out[i - 1];
        if (!noAction(b) || !(b.close > 0) || !(p.close > 0)) continue;
        var r = b.close / p.close;
        if (!explains(r, q)) continue;
        qualifying++;
        var sc = Math.abs(Math.log(r) + Math.log(q)) + (anchor ? Math.abs(i - a) * 1e-9 : 0);
        if (sc < bestScore) { bestScore = sc; best = i; }
      }
      if (best < 0) { evidence.push(record("UNKNOWN", Object.assign(base, { reason: "SEC_EVENT_NOT_OBSERVED_IN_PRICE", eventDate: anchor ? anchor.date : null }))); return; }
      if (!anchor && qualifying > 1) { evidence.push(record("UNKNOWN", Object.assign(base, { reason: "SEC_EVENT_UNDATED_AMBIGUOUS", candidates: qualifying }))); return; }
      if (!anchor && !ev.tickerMentioned) { evidence.push(record("UNKNOWN", Object.assign(base, { reason: "SEC_EVENT_UNDATED_IDENTITY_WEAK", eventDate: day(out[best].date) }))); return; }
      if (used[best]) return; used[best] = true;
      var rr = out[best].close / out[best - 1].close, ed = day(out[best].date);
      var sh = sharesAround(opts.shares, ed, asOf);
      out[best].splitFactor = q;
      out[best].caNormalized = { source: "SEC_EDGAR", ratio: q };
      base.identity.basis.push("PRICE_CONCORDANT");
      evidence.push(record(q < 1 ? "CONFIRMED_REVERSE_SPLIT" : "CONFIRMED_SPLIT", Object.assign(base, { reason: "SEC_EFFECTIVE_AND_PRICE_CONCORDANT_PROVIDER_MISSING", eventDate: ed,
        observedAt: visibleAt && visibleAt > ed ? visibleAt : ed,
        priceObservation: { date: ed, rawRatio: round(rr, 6), residual: round(rr * q, 6), qualifyingDays: qualifying, anchor: anchor ? anchor.basis : "UNDATED" },
        shares: sh ? { ratio: round(sh.ratio, 6), verdict: sharesVerdict(sh, q) } : { verdict: "NONE" } })));
    });
    return { bars: out, evidence: evidence };
  }

  /**
   * Evidenzklasse einer Sperre des Kerns (Reihe ab failure.date nicht
   * rekonstruierbar). Nur fuer Preisbefunde (SPLIT_*): Datenwiderspruch,
   * Luecken und Identitaet behalten ihren Grund.
   */
  function classifyHold(failure, bars, opts) {
    opts = opts || {};
    var asOf = opts.asOf || null, d = failure.date, reason = failure.reason;
    if (!/^SPLIT_/.test(String(reason))) return null;
    var i = firstIndexOnOrAfter(bars, d), b = bars[i], p = bars[i - 1];
    var r = b && p && b.close > 0 && p.close > 0 ? b.close / p.close : null;
    var srcPrice = { system: "PRICE_SIGNATURE", reason: reason, date: d, rawRatio: round(r, 6) };
    var k = isNum(failure.conventionalRatio) ? failure.conventionalRatio : (r ? r : null);
    var q = k ? 1 / k : null;
    var base = { eventDate: d, ratio: q ? round(q, 8) : null, direction: q && q < 1 ? "REVERSE" : q ? "FORWARD" : null, reason: reason, observedAt: failure.observedAt || d, sources: [srcPrice], visibleAt: failure.observedAt || d };
    var evs = (opts.secEvents || []).filter(function (e) { return e && isNum(e.ratio); });
    /* SEC sagt fuer dieses Fenster ein anderes wirksames Verhaeltnis */
    var near = evs.filter(function (e) {
      var st = stageAt(e, asOf); if (!st) return false;
      var an = e.marketDate || e.effectiveDate; return an && Math.abs(Date.parse(an) - Date.parse(d)) <= 10 * 864e5;
    });
    var conflict = near.filter(function (e) { return stageAt(e, asOf) === "EFFECTIVE" && r && !explains(r, e.ratio); });
    if (conflict.length) return record("CONFLICTING_CORPORATE_ACTION", Object.assign(base, { detail: "SEC_EFFECTIVE_RATIO_DIFFERS", sources: base.sources.concat(conflict.map(function (e) { return { system: "SEC_EDGAR", ratio: e.ratio, filedDate: e.visibleAt }; })) }));
    var sh = q ? sharesAround(opts.shares, d, asOf) : null, sv = q ? sharesVerdict(sh, q) : "NONE";
    if (sv === "CONTRADICTS") return record("CONFLICTING_CORPORATE_ACTION", Object.assign(base, { detail: "SEC_SHARE_COUNT_CONTRADICTS", shares: { ratio: round(sh.ratio, 6), verdict: sv },
      sources: base.sources.concat([{ system: "SEC_SHARES_OUTSTANDING", before: sh.before.at, after: sh.after.at }]) }));
    /* genehmigt/angekuendigt mit festem Verhaeltnis, das den Sprung erklaert */
    var approved = evs.filter(function (e) {
      var st = stageAt(e, asOf); if (!(st === "APPROVED" || st === "ANNOUNCED" || st === "EFFECTIVE")) return false;
      var v = (e.stageVisibleAt && (e.stageVisibleAt.APPROVED || e.stageVisibleAt.ANNOUNCED || e.stageVisibleAt.EFFECTIVE)) || e.visibleAt;
      return v && v <= addDays(d, 10) && v >= addDays(d, -CONFIG.approvedLookbackDays) && r && explains(r, e.ratio);
    });
    if (approved.length) return record("PROBABLE_CORPORATE_ACTION", Object.assign(base, { detail: "SEC_APPROVED_RATIO_NOT_EFFECTIVE_CONFIRMED",
      sources: base.sources.concat(approved.map(function (e) { return { system: "SEC_EDGAR", ratio: e.ratio, stage: stageAt(e, asOf), filedDate: e.visibleAt }; })) }));
    if (reason === "SPLIT_MISSING") return record("PROBABLE_CORPORATE_ACTION", Object.assign(base, { detail: "PROVIDER_ADJUSTED_CLOSE_SHOWS_SPLIT",
      sources: base.sources.concat([{ system: "PROVIDER_ADJUSTED_CLOSE", date: d }]) }));
    if (sv === "SUPPORTS") return record("PROBABLE_CORPORATE_ACTION", Object.assign(base, { detail: "SEC_SHARE_COUNT_SUPPORTS", shares: { ratio: round(sh.ratio, 6), verdict: sv },
      sources: base.sources.concat([{ system: "SEC_SHARES_OUTSTANDING", before: sh.before.at, after: sh.after.at }]) }));
    return record("PRICE_DISCONTINUITY_NO_CA_EVIDENCE", base);
  }

  var api = { VERSION: VERSION, CONTRACT: CONTRACT, CONFIG: CONFIG, CLASSES: CLASSES, OUTCOME: OUTCOME,
    applySecEvidence: applySecEvidence, classifyHold: classifyHold, explains: explains, stageAt: stageAt, sharesAround: sharesAround };
  if (isNode) module.exports = api;
  else global.VUCorporateActionValidation = api;
})(typeof window !== "undefined" ? window : globalThis);
