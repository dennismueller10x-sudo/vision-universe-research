/* =========================================================================
   VISION UNIVERSE — corporate-action-validation.js
                         (corporate-action-validation-3.0.0, corporate-action-contract-3.0.0)

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
     NORMALIZE       nur CONFIRMED_* mit genanntem Datum: der fehlende Faktor q
                     wird am belegten Tag als splitFactor-Eingang der
                     unveraenderten Rekonstruktion eingesetzt (keine eigene
                     Faktorkette, ADR-002). Undatierte Aussagen normalisieren
                     nie (das Datum kaeme aus dem Kurs). Verhaeltnisse unter 3:1
                     brauchen eine zweite Bestaetigung: Stueckvolumen in
                     Split-Richtung oder SEC-Aktienzahl (Review F04).
     HOLD_FROM_EVENT_DATE
                     PROBABLE, CONFLICTING, PRICE_DISCONTINUITY_NO_CA_EVIDENCE:
                     ab dem Ereignistag nicht kanonisch, nie zurueckgerechnet
     NO_ACTION       UNKNOWN

   ZWEITE QUELLE (3.0.0): FINRA OTC DAILY LIST (finra-daily-list.js)
     Ereignisse der FINRA-Tagesliste (Split mit Verhaeltnis und Ex-Tag)
     gehen wie wirksame SEC-Ereignisse in dieselbe Pruefung ein (Anker =
     Ex-Tag, sichtbar ab Veroeffentlichung). Nennen SEC und FINRA fuer
     dasselbe Fenster verschiedene Verhaeltnisse: CONFLICTING (HOLD).
     NORMALIZE verlangt ab 3.0.0 IMMER eine zweite, vom ausloesenden Beleg
     unabhaengige Bestaetigung (bis 2.x nur unter 3:1): die andere Quelle
     (SEC <-> FINRA) mit demselben Verhaeltnis, Stueckvolumen in
     Split-Richtung oder die SEC-Aktienzahl. Ohne sie bleibt der Beleg
     PROBABLE und die Reihe wird ab dem Ereignistag gehalten (Blocker B2 aus
     v2: Normalisierungen ohne zweite Bestaetigung waren zu 25 % falsch; die
     Regel folgt dem Grundsatz "zwei unabhaengige Bestaetigungen", nicht
     einzelnen Faellen).

   POINT IN TIME
     Jeder Beleg traegt visibleAt (Einreichungstag der SEC-Unterlage, die die
     Stufe EFFECTIVE belegt). Eine Normalisierung gilt fuer einen Stichtag
     erst, wenn visibleAt < Stichtag (Annahme nach Handelsschluss traegt den
     Tag); die Felder je Einreichung werden zum Stichtag neu gebildet; canonical-price-validity.js baut die
     Sicht eines Stichtags nur aus Kerzen und Belegen bis zu diesem Tag.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;
  var SEC = isNode ? require("./sec-corporate-actions.js") : global.VUSecCorporateActions;
  var FDL = isNode ? require("./finra-daily-list.js") : global.VUFinraDailyList;
  var VERSION = "corporate-action-validation-3.0.0";
  var CONTRACT = "corporate-action-contract-3.0.0";
  var CONFIG = {
    providerRatioTolerance: 1.01, /* Anbieterfaktor = SEC-Verhaeltnis bis auf Rundung */
    windowBefore: 2,              /* Sitzungen vor dem gemeldeten Handelstag */
    windowAfter: 3,               /* Sitzungen danach (Zeitzone, Handelsaufnahme) */
    smallRatio: 3,                /* bis 2.x: nur unter 3:1 Bestaetigung noetig; ab 3.0.0 fuer jedes Verhaeltnis (Grund-Code bleibt fuer kleine Verhaeltnisse) */
    secondSourceDays: 10,         /* zweite Quelle: Anker hoechstens 10 Kalendertage auseinander */
    volumeBase: 20, volumeMinBase: 5, /* Stueckvolumen gegen den Median der vorigen bis zu 20 Kerzen (wie der Kern) */
    renormalizeSessions: 30,      /* kein zweites Einsetzen desselben Verhaeltnisses innerhalb von 30 Sitzungen */
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
  /** Das SEC-Ereignis, wie es vor dem Stichtag bekannt war (nur Einreichungen strikt vor asOf). */
  function eventAt(ev, asOf) {
    if (!asOf) return ev;
    if (ev && ev.system === (FDL && FDL.SYSTEM)) return FDL.eventAsOf(ev, asOf);
    if (SEC && Array.isArray(ev.observations)) return SEC.eventAsOf(ev, asOf);
    var order = ["EFFECTIVE", "APPROVED", "ANNOUNCED", "MENTION"], sv = ev.stageVisibleAt || {};
    for (var i = 0; i < order.length; i++) if (sv[order[i]] && sv[order[i]] < asOf) return Object.assign({}, ev, { stage: order[i] });
    return null;
  }
  function stageAt(ev, asOf) { var e = eventAt(ev, asOf); return e ? e.stage : null; }

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
    var rows = shares.filter(function (s) { return isNum(s.value) && s.value > 0 && (!asOf || (s.availableAt && s.availableAt < asOf)); })
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
    var asOf = opts.asOf || null, out = bars.map(function (b) { return Object.assign({}, b); }), evidence = [], used = {}, normalizedAt = [];
    var events = (opts.secEvents || []).filter(function (e) { return e && isNum(e.ratio) && e.ratio > 0 && Math.abs(e.ratio - 1) > 1e-9; });
    if (!out.length) return { bars: out, evidence: evidence };
    var first = day(out[0].date), last = day(out[out.length - 1].date);
    events.forEach(function (ev0) {
      var ev = eventAt(ev0, asOf);
      if (!ev || ev.stage !== "EFFECTIVE") return;
      var isFinra = ev0.system === (FDL && FDL.SYSTEM);
      var visibleAt = ev.effectiveVisibleAt || (ev.stageVisibleAt && ev.stageVisibleAt.EFFECTIVE) || ev.visibleAt;
      var q = ev.ratio, anchor = anchorOf(ev), lo, hi, a = -1;
      var base = { eventDate: null, ratio: round(q, 8), direction: q < 1 ? "REVERSE" : "FORWARD", stage: "EFFECTIVE", confidence: ev.confidence,
        sources: (ev.sources || []).map(function (s) { return { system: s.system, form: s.form, items: s.items, accession: s.accession, filedDate: s.filedDate }; }),
        identity: { cik: opts.cik || null, basis: ["CIK_LINK"].concat(ev.tickerMentioned ? ["TICKER_IN_FILING"] : []), cikStatus: opts.cikBasis || null },
        secEvent: { system: isFinra ? FDL.SYSTEM : "SEC_EDGAR", marketDate: ev.marketDate || null, effectiveDate: ev.effectiveDate || null, timing: ev.timing || null, scheduled: ev.scheduled === true, provenanceHash: ev0.provenanceHash || null },
        visibleAt: visibleAt };
      /* Normalisieren nur mit einem datierten laufenden Bericht (8-K/6-K): Rueckblicke in 10-Q/10-K werden
         kandidatengesteuert gelesen und stuetzen nur (Review F05). */
      var current = isFinra || !Array.isArray(ev.observations) || ev.observations.some(function (o) { return /^(?:8-K|6-K)/.test(String(o.form || "")) && (o.marketDate || o.effectiveDate); });
      if (anchor && !current) { evidence.push(record("UNKNOWN", Object.assign(base, { reason: "SEC_EVENT_PERIODIC_ONLY_NOT_NORMALIZED", eventDate: anchor.date }))); return; }
      /* Undatiert (Rueckblick ohne Datum): nie normalisieren - das Datum kaeme sonst aus dem Kurs (Review F04/F05). */
      if (!anchor) { evidence.push(record("UNKNOWN", Object.assign(base, { reason: "SEC_EVENT_UNDATED_NOT_NORMALIZED" }))); return; }
      var ad = anchor.date;
      /* Quellen widersprechen sich (SEC <-> FINRA, beide wirksam, gleiches Fenster, anderes Verhaeltnis) */
      var other = otherSourceEvents(events, ev0, asOf, ad);
      var disagree = other.filter(function (o) { return Math.abs(Math.log(o.ratio) - Math.log(q)) > Math.log(CONFIG.providerRatioTolerance); });
      var agree = other.filter(function (o) { return Math.abs(Math.log(o.ratio) - Math.log(q)) <= Math.log(CONFIG.providerRatioTolerance); });
      if (disagree.length && !agree.length) {
        var ai = firstIndexOnOrAfter(out, ad);
        /* sichtbar erst, wenn beide Quellen veroeffentlicht sind (Review P3-12) */
        var bothAt = disagree.reduce(function (m, x) { return x.visibleAt && x.visibleAt > m ? x.visibleAt : m; }, visibleAt || "");
        evidence.push(record("CONFLICTING_CORPORATE_ACTION", Object.assign(base, { reason: "SOURCES_DISAGREE_ON_RATIO", eventDate: ai >= 0 ? day(out[ai].date) : ad, outcome: "HOLD_FROM_EVENT_DATE",
          observedAt: ai >= 0 ? (bothAt && bothAt >= day(out[ai].date) ? nextBarDate(out, bothAt) : day(out[ai].date)) : ad,
          sources: base.sources.concat(disagree.map(function (o) { return { system: o.system, ratio: o.ratio, filedDate: o.visibleAt }; })) })));
        return;
      }
      if (ad < addDays(first, -7) || ad > addDays(last, 7)) { evidence.push(record("UNKNOWN", Object.assign(base, { reason: "SEC_EVENT_OUTSIDE_SERIES", eventDate: ad }))); return; }
      a = firstIndexOnOrAfter(out, ad);
      if (a < 0) { evidence.push(record("UNKNOWN", Object.assign(base, { reason: "SEC_EVENT_AFTER_LAST_BAR", eventDate: ad }))); return; }
      if (anchor.nextSession && day(out[a].date) === ad) a = Math.min(a + 1, out.length - 1);
      lo = Math.max(1, a - CONFIG.windowBefore); hi = Math.min(out.length - 1, a + CONFIG.windowAfter);
      /* 1. Anbieter fuehrt im Fenster einen Split. */
      var prov = [];
      for (var i = lo; i <= hi; i++) if (hasSplit(out[i]) && !out[i].caNormalized) prov.push(i);
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
        evidence.push(record("CONFLICTING_CORPORATE_ACTION", Object.assign(base, { reason: "PROVIDER_FACTOR_DIFFERS_FROM_SEC", eventDate: day(out[jc].date), observedAt: visibleAt && visibleAt >= day(out[jc].date) ? nextBarDate(out, visibleAt) : day(out[jc].date),
          sources: base.sources.concat([{ system: "PROVIDER_SPLIT_FACTOR", date: day(out[jc].date), factor: out[jc].splitFactor }]) })));
        return;
      }
      /* 2. Rohkurs: der Tag im Fenster, den q am besten erklaert. */
      var best = -1, bestScore = Infinity, qualifying = 0;
      for (i = lo; i <= hi; i++) {
        var b = out[i], p = out[i - 1];
        if (!noAction(b) || !(b.close > 0) || !(p.close > 0)) continue;
        var r = b.close / p.close;
        if (!explains(r, q)) continue;
        qualifying++;
        var sc = Math.abs(Math.log(r) + Math.log(q)) + Math.abs(i - a) * 1e-9;
        if (sc < bestScore) { bestScore = sc; best = i; }
      }
      if (best < 0) { evidence.push(record("UNKNOWN", Object.assign(base, { reason: "SEC_EVENT_NOT_OBSERVED_IN_PRICE", eventDate: ad }))); return; }
      var ed = day(out[best].date), rr = out[best].close / out[best - 1].close;
      var sh = sharesAround(opts.shares, ed, asOf), sv = sharesVerdict(sh, q), vol = volumeDirection(out, best, q);
      /* Zweite Bestaetigung, unabhaengig vom ausloesenden Beleg (3.0.0: jedes Verhaeltnis; F04 bis 2.x nur unter 3:1):
         die andere Quelle mit demselben Verhaeltnis, Stueckvolumen in Split-Richtung oder die SEC-Aktienzahl. */
      var corroboration = [].concat(agree.length ? ["SECOND_SOURCE"] : [], vol === "CONSISTENT" ? ["SHARE_VOLUME"] : [], sv === "SUPPORTS" ? ["SEC_SHARE_COUNT"] : []);
      if (!corroboration.length) {
        var small = Math.abs(Math.log(q)) < Math.log(CONFIG.smallRatio);
        evidence.push(record("UNKNOWN", Object.assign(base, { reason: small ? "SEC_EVENT_SMALL_RATIO_UNCORROBORATED" : "EFFECTIVE_EVENT_UNCORROBORATED", eventDate: ed, volume: vol, shares: { verdict: sv } }))); return;
      }
      if (used[best]) return;
      for (var z = 0; z < normalizedAt.length; z++) {
        if (Math.abs(normalizedAt[z].i - best) <= CONFIG.renormalizeSessions && Math.abs(normalizedAt[z].q / q - 1) < 1e-6) {
          evidence.push(record("UNKNOWN", Object.assign(base, { reason: "SEC_EVENT_DUPLICATE_NEAR_NORMALIZATION", eventDate: ed }))); return;
        }
      }
      used[best] = true; normalizedAt.push({ i: best, q: q });
      out[best].splitFactor = q;
      out[best].caNormalized = { source: "SEC_EDGAR", ratio: q };
      base.identity.basis.push("PRICE_CONCORDANT");
      if (agree.length) base.sources = base.sources.concat(agree.map(function (o) { return { system: o.system, ratio: o.ratio, filedDate: o.visibleAt, role: "SECOND_SOURCE" }; }));
      evidence.push(record(q < 1 ? "CONFIRMED_REVERSE_SPLIT" : "CONFIRMED_SPLIT", Object.assign(base, { reason: "SEC_EFFECTIVE_AND_PRICE_CONCORDANT_PROVIDER_MISSING", eventDate: ed, corroboration: corroboration,
        observedAt: visibleAt && visibleAt >= ed ? nextBarDate(out, visibleAt) || addDays(visibleAt, 1) : ed,
        priceObservation: { date: ed, rawRatio: round(rr, 6), residual: round(rr * q, 6), qualifyingDays: qualifying, anchor: anchor.basis, volume: vol },
        shares: sh ? { ratio: round(sh.ratio, 6), verdict: sv } : { verdict: "NONE" } })));
    });
    return { bars: out, evidence: evidence };
  }
  /** Wirksame Ereignisse der ANDEREN Quelle (SEC <-> FINRA) mit Anker im Fenster, wie zum Stichtag bekannt. */
  function otherSourceEvents(events, ev0, asOf, anchorDate) {
    var sys0 = ev0.system === (FDL && FDL.SYSTEM) ? FDL.SYSTEM : "SEC_EDGAR";
    return events.filter(function (e) { return e !== ev0 && (e.system === (FDL && FDL.SYSTEM) ? FDL.SYSTEM : "SEC_EDGAR") !== sys0; })
      .map(function (e) { var x = eventAt(e, asOf); return x ? Object.assign({ system: e.system === (FDL && FDL.SYSTEM) ? FDL.SYSTEM : "SEC_EDGAR" }, x) : null; })
      .filter(function (x) {
        if (!x || x.stage !== "EFFECTIVE" || !isNum(x.ratio)) return false;
        var an = x.marketDate || x.effectiveDate; return an && Math.abs(Date.parse(an) - Date.parse(anchorDate)) <= CONFIG.secondSourceDays * 864e5;
      });
  }
  function nextBarDate(bars, d) { for (var i = 0; i < bars.length; i++) if (day(bars[i].date) > d) return day(bars[i].date); return null; }
  /** Stueckvolumen am Ereignistag gegen den Median davor: ein Reverse Split teilt es, ein Split vervielfacht es. */
  function volumeDirection(bars, i, q) {
    var cur = bars[i];
    if (!isNum(cur.volume) || cur.volume < 0) return "UNKNOWN";
    var vols = [];
    for (var m = i - 1; m >= 0 && vols.length < CONFIG.volumeBase; m--) if (isNum(bars[m].volume) && bars[m].volume > 0) vols.push(bars[m].volume);
    if (vols.length < CONFIG.volumeMinBase) return "UNKNOWN";
    vols.sort(function (x, y) { return x - y; });
    var med = vols[Math.floor(vols.length / 2)], vr = cur.volume / med;
    return (q < 1 ? vr < 1 : vr > 1) ? "CONSISTENT" : "INCONSISTENT";
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
    var near = evs.map(function (e) { return eventAt(e, asOf); }).filter(function (e) {
      if (!e) return false;
      var an = e.marketDate || e.effectiveDate; return an && Math.abs(Date.parse(an) - Date.parse(d)) <= 10 * 864e5;
    });
    var conflict = near.filter(function (e) { return e.stage === "EFFECTIVE" && r && !explains(r, e.ratio); });
    if (conflict.length) return record("CONFLICTING_CORPORATE_ACTION", Object.assign(base, { detail: "SEC_EFFECTIVE_RATIO_DIFFERS", sources: base.sources.concat(conflict.map(function (e) { return { system: e.system || "SEC_EDGAR", ratio: e.ratio, filedDate: e.visibleAt }; })) }));
    var sh = q ? sharesAround(opts.shares, d, asOf) : null, sv = q ? sharesVerdict(sh, q) : "NONE";
    if (sv === "CONTRADICTS") return record("CONFLICTING_CORPORATE_ACTION", Object.assign(base, { detail: "SEC_SHARE_COUNT_CONTRADICTS", shares: { ratio: round(sh.ratio, 6), verdict: sv },
      sources: base.sources.concat([{ system: "SEC_SHARES_OUTSTANDING", before: sh.before.at, after: sh.after.at }]) }));
    /* genehmigt/angekuendigt mit festem Verhaeltnis, das den Sprung erklaert */
    var approved = evs.map(function (e) { return eventAt(e, asOf); }).filter(function (e) {
      var st = e && e.stage; if (!(st === "APPROVED" || st === "ANNOUNCED" || st === "EFFECTIVE")) return false;
      var v = (e.stageVisibleAt && (e.stageVisibleAt.APPROVED || e.stageVisibleAt.ANNOUNCED || e.stageVisibleAt.EFFECTIVE)) || e.visibleAt;
      return v && v <= addDays(d, 10) && v >= addDays(d, -CONFIG.approvedLookbackDays) && r && explains(r, e.ratio);
    });
    if (approved.length) return record("PROBABLE_CORPORATE_ACTION", Object.assign(base, { detail: "SEC_APPROVED_RATIO_NOT_EFFECTIVE_CONFIRMED",
      sources: base.sources.concat(approved.map(function (e) { return { system: e.system || "SEC_EDGAR", ratio: e.ratio, stage: e.stage, filedDate: e.visibleAt }; })) }));
    if (reason === "SPLIT_MISSING") return record("PROBABLE_CORPORATE_ACTION", Object.assign(base, { detail: "PROVIDER_ADJUSTED_CLOSE_SHOWS_SPLIT",
      sources: base.sources.concat([{ system: "PROVIDER_ADJUSTED_CLOSE", date: d }]) }));
    if (sv === "SUPPORTS") return record("PROBABLE_CORPORATE_ACTION", Object.assign(base, { detail: "SEC_SHARE_COUNT_SUPPORTS", shares: { ratio: round(sh.ratio, 6), verdict: sv },
      sources: base.sources.concat([{ system: "SEC_SHARES_OUTSTANDING", before: sh.before.at, after: sh.after.at }]) }));
    return record("PRICE_DISCONTINUITY_NO_CA_EVIDENCE", base);
  }

  var api = { VERSION: VERSION, CONTRACT: CONTRACT, CONFIG: CONFIG, CLASSES: CLASSES, OUTCOME: OUTCOME,
    applySecEvidence: applySecEvidence, classifyHold: classifyHold, explains: explains, stageAt: stageAt, eventAt: eventAt, sharesAround: sharesAround, volumeDirection: volumeDirection };
  if (isNode) module.exports = api;
  else global.VUCorporateActionValidation = api;
})(typeof window !== "undefined" ? window : globalThis);
