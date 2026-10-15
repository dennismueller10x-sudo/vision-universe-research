/* =========================================================================
   VISION UNIVERSE — price-integrity.js            (price-integrity-1.0.0)

   KANONISCHE CORPORATE-ACTION- UND PREISPLAUSIBILITAETS-POLICY

   Gilt fuer jede Preisreihe aus dem History Store, nicht fuer ein Produkt.
   Die Sperrentscheidung selbst trifft canonical-total-return.js
   (corporate-action-contract-1.1.0): nur dort wird eine Reihe ab einem Tag
   nicht rekonstruierbar. Diese Datei
     1. legt die Policy fest (Klasse -> Ausgang + Reason Code),
     2. ordnet einen auffaelligen Tag einer Ursache zu (Forensik, Audit) -
        mit Belegen, die nur die Rueckschau hat (Bestaendigkeit nach dem
        Ereignis, Aktienzahl laut SEC, Listing-Grenzen).
   Die Forensik aendert keine Reihe. Sie erklaert, warum der Kern sperrt
   oder durchlaesst, und zaehlt, wo er sich irrt.

   Ausgaenge
     ACCEPT      Reihe unveraendert kanonisch
     NORMALIZE   Reihe kanonisch nach dokumentierter Rechenregel (gemeldeter
                 Split ueber splitFactors, gemeldete Dividende ueber die
                 Gesamtrendite) - nie ohne Ereignisdatensatz
     QUARANTINE  Datensatz widerspricht sich: ab dem Tag nicht kanonisch
     HOLD        Ereignis wahrscheinlich, aber nicht belegt: ab dem Tag nicht
                 kanonisch, bis eine Corporate-Action-Quelle es bestaetigt;
                 keine stille Korrektur
     REJECT      Reihe insgesamt unbrauchbar (Identitaet, keine Kerzen)

   Eine pauschale Preisobergrenze gibt es nicht. Ein hoher Kurs ist ein
   Befund nur zusammen mit einer Ursache.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;
  var CTR = isNode ? require("./canonical-total-return.js") : global.VUCanonicalTotalReturn;
  var VERSION = "price-integrity-1.0.0";

  /* Die Policy. Reihenfolge = Vorrang, wenn ein Tag mehrere Klassen traegt. */
  var POLICY = [
    { cls: "CONFIRMED_SPLIT", outcome: "NORMALIZE", reason: "SPLIT_DECLARED_CONSISTENT", core: "TOTAL_RETURN_RECONSTRUCTED",
      rule: "gemeldeter Faktor, Rohkurs springt passend, Anbieterspalte in Paritaet" },
    { cls: "CONFLICTING_SPLIT", outcome: "QUARANTINE", reason: "CORPORATE_ACTION_CONTRADICTED", core: "CORPORATE_ACTION_CONTRADICTED",
      rule: "gemeldeter Faktor widerspricht dem Rohkurs (SPLIT_NOT_IN_RAW_PRICE, EVENT_GROSS_OUT_OF_BAND, ausserhalb 1:1000..1000:1)" },
    { cls: "SPLIT_MISSING_IN_INPUT", outcome: "HOLD", reason: "SPLIT_MISSING", core: "SPLIT_MISSING",
      rule: "Anbieterspalte zeigt einen Split, unser splitFactor nicht (Ingestion)" },
    { cls: "SUSPECTED_UNDECLARED_SPLIT", outcome: "HOLD", reason: "SPLIT_SUSPECTED_UNDECLARED", core: "SPLIT_SUSPECTED_UNDECLARED",
      rule: "keine Meldung, Rohschluss und Eroeffnung beim k-fachen (k ueblicher Split-Kurs, +-25 %), Stueckvolumen < Median und <= 3/k des Medians" },
    { cls: "PROVIDER_SPIKE", outcome: "HOLD", reason: "PRICE_SPIKE_REVERTED", core: "PRICE_SPIKE_REVERTED",
      rule: "Einzelkerze >= 5-fach, Folgetag auf 10 % zurueck, keine Meldung" },
    { cls: "UNRESOLVED_PRICE_DISCONTINUITY", outcome: "ACCEPT", reason: "DISCONTINUITY_COUNTED_NOT_PROVEN", core: "TOTAL_RETURN_RECONSTRUCTED",
      rule: ">= 10-facher Tagessprung ohne Meldung und ohne Signatur: gezaehlt, nicht gesperrt (Groesse allein ist kein Beweis)" },
    { cls: "LEGITIMATE_HIGH_NOMINAL_PRICE", outcome: "ACCEPT", reason: "HIGH_NOMINAL_PRICE_NO_DEFECT", core: "TOTAL_RETURN_RECONSTRUCTED",
      rule: "hoher Rohkurs ohne Sprung und ohne Ereigniswiderspruch; keine Preisobergrenze" },
    { cls: "ADJUSTED_LEVEL_FROM_DECLARED_REVERSE_SPLITS", outcome: "NORMALIZE", reason: "BACK_ADJUSTED_LEVEL_ARITHMETIC", core: "TOTAL_RETURN_RECONSTRUCTED",
      rule: "splitbereinigtes Niveau > 1e6 entsteht rechnerisch aus gemeldeten, konsistenten Reverse Splits; Renditen korrekt" },
    { cls: "STALE_OR_UNAVAILABLE", outcome: "HOLD", reason: "STALE", core: "STALE",
      rule: "keine frische Kerze (Volumen 0 und unveraenderter Schluss) laenger als der Verbraucher erlaubt; Verbraucher-Policy (z. B. 5 Sitzungen) setzt das Ende" },
    { cls: "LISTING_OR_IDENTITY_BREAK", outcome: "REJECT", reason: "LISTING_DISCONTINUITY", core: "LISTING_DISCONTINUITY",
      rule: "Luecke > 365 Tage oder Segmentgrenze: neue Identitaet, keine Rendite ueber die Grenze" },
  ];
  var POLICY_BY_CLASS = {};
  POLICY.forEach(function (p) { POLICY_BY_CLASS[p.cls] = p; });

  /* Forensische Ursachenklassen (Phase A). Jede bekommt genau einen
     Policy-Eintrag oder ist eine reine Diagnose (GENUINE_*, UNRESOLVED). */
  var ROOT_CAUSES = [
    "CONFIRMED_SPLIT", "UNDECLARED_REVERSE_SPLIT", "UNDECLARED_FORWARD_SPLIT_POSSIBLE", "DECLARED_SPLIT_INCONSISTENT", "DECLARED_SPLIT_DATE_SHIFT",
    "TICKER_IDENTITY_MISMATCH", "LISTING_CHANGE", "CURRENCY_OR_UNIT", "STALE_PRICE", "CORPORATE_ACTION_MISMATCH",
    "LEGITIMATE_HIGH_NOMINAL_PRICE", "ADJUSTED_LEVEL_FROM_DECLARED_REVERSE_SPLITS", "PROVIDER_SPIKE", "GENUINE_PRICE_MOVE", "UNRESOLVED"
  ];
  var CAUSE_TO_POLICY = {
    CONFIRMED_SPLIT: "CONFIRMED_SPLIT",
    UNDECLARED_REVERSE_SPLIT: "SUSPECTED_UNDECLARED_SPLIT", UNDECLARED_FORWARD_SPLIT_POSSIBLE: "UNRESOLVED_PRICE_DISCONTINUITY",
    DECLARED_SPLIT_INCONSISTENT: "CONFLICTING_SPLIT", DECLARED_SPLIT_DATE_SHIFT: "CONFLICTING_SPLIT",
    TICKER_IDENTITY_MISMATCH: "LISTING_OR_IDENTITY_BREAK", LISTING_CHANGE: "LISTING_OR_IDENTITY_BREAK", CURRENCY_OR_UNIT: "UNRESOLVED_PRICE_DISCONTINUITY",
    STALE_PRICE: "STALE_OR_UNAVAILABLE", CORPORATE_ACTION_MISMATCH: "CONFLICTING_SPLIT", LEGITIMATE_HIGH_NOMINAL_PRICE: "LEGITIMATE_HIGH_NOMINAL_PRICE",
    ADJUSTED_LEVEL_FROM_DECLARED_REVERSE_SPLITS: "ADJUSTED_LEVEL_FROM_DECLARED_REVERSE_SPLITS", PROVIDER_SPIKE: "PROVIDER_SPIKE",
    GENUINE_PRICE_MOVE: null, UNRESOLVED: "UNRESOLVED_PRICE_DISCONTINUITY"
  };
  /* Wo liegt der Fehler? */
  var CAUSE_LOCUS = {
    CONFIRMED_SPLIT: "NONE",
    UNDECLARED_REVERSE_SPLIT: "PROVIDER", UNDECLARED_FORWARD_SPLIT_POSSIBLE: "PROVIDER", DECLARED_SPLIT_INCONSISTENT: "PROVIDER",
    DECLARED_SPLIT_DATE_SHIFT: "PROVIDER", TICKER_IDENTITY_MISMATCH: "IDENTITY_LISTING_MAPPING", LISTING_CHANGE: "IDENTITY_LISTING_MAPPING",
    CURRENCY_OR_UNIT: "PROVIDER", STALE_PRICE: "PROVIDER", CORPORATE_ACTION_MISMATCH: "PROVIDER", PROVIDER_SPIKE: "PROVIDER",
    LEGITIMATE_HIGH_NOMINAL_PRICE: "NONE", ADJUSTED_LEVEL_FROM_DECLARED_REVERSE_SPLITS: "NONE", GENUINE_PRICE_MOVE: "NONE", UNRESOLVED: "UNKNOWN"
  };

  /* Forensik-Konstanten (Rueckschau, keine Sperrwirkung). */
  var FORENSIC = {
    jumpMinRatio: 3,             // Tage, die die Forensik ueberhaupt erklaert
    persistenceBars: 5,          // Median danach / Median davor
    persistenceTolerance: 1.5,   // Bestaendigkeit: Niveau nach dem Sprung bleibt beim k-fachen
    stalePriorBars: 5,           // so viele Kerzen ohne frischen Kurs vor dem Sprung = STALE
    listingGapDays: 30,          // Luecke vor dem Sprung = Listing-Wechsel (data.mjs teilt Segmente ab 30 Tagen)
    dateShiftWindow: 3,          // gemeldeter Split hoechstens so viele Kerzen daneben
    sharesTolerance: 1.5,        // SEC-Aktienzahl faellt um k (+-50 %)
    unitRatios: [100, 1000],     // Einheitenwechsel (Cent/Dollar, Tausend)
    highNominalRaw: 1e5          // Rohkurs ab hier wird als Hochpreisfall geprueft
  };

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function median(xs) { var a = xs.filter(isNum).slice().sort(function (x, y) { return x - y; }); if (!a.length) return null; var m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
  function nearestRatio(r, list) { var k = null, best = Infinity; for (var j = 0; j < list.length; j++) { var d = Math.abs(Math.log(r / list[j])); if (d < best) { best = d; k = list[j]; } } return { k: k, logDev: best }; }
  function declared(b) { return isNum(b.splitFactor) && b.splitFactor > 0 && Math.abs(b.splitFactor - 1) > 1e-9; }
  function fresh(b, prev) { return !(isNum(b.volume) && b.volume === 0 && prev && b.close === prev.close); }

  /**
   * Erklaert den Tag i einer ROHEN Reihe (close/open/volume/splitFactor/
   * dividend/adjustedClose wie im History Store). ctx: {shares: [[date,
   * value], ...] SEC-Aktienzahl nach Verfuegbarkeitsdatum, listing: {startDate,
   * endDate, reusedLater}}. Liefert {cause, confidence, evidence,
   * expected, observed, policy} - nie eine korrigierte Reihe.
   */
  function explainDay(bars, i, ctx) {
    ctx = ctx || {};
    var b = bars[i], p = bars[i - 1];
    if (!b || !p || !(b.close > 0) || !(p.close > 0)) return null;
    var r = b.close / p.close, ev = { rawRatio: r, openRatio: isNum(b.open) && b.open > 0 ? b.open / p.close : null };
    var gapDays = (Date.parse(String(b.date).slice(0, 10)) - Date.parse(String(p.date).slice(0, 10))) / 864e5;
    ev.gapDays = gapDays;
    // Anbieterfaktor
    var fPrev = isNum(p.adjustedClose) && p.adjustedClose > 0 ? p.adjustedClose / p.close : null;
    var fCur = isNum(b.adjustedClose) && b.adjustedClose > 0 ? b.adjustedClose / b.close : null;
    ev.providerFactorStep = fPrev && fCur ? fPrev / fCur : null;
    // Bestaendigkeit (Rueckschau)
    var before = [], after = [];
    for (var a = i - 1; a >= 0 && before.length < FORENSIC.persistenceBars; a--) before.push(bars[a].close);
    for (var z = i; z < bars.length && after.length < FORENSIC.persistenceBars; z++) after.push(bars[z].close);
    ev.persistenceRatio = before.length && after.length ? median(after) / median(before) : null;
    // Volumen
    var vb = []; for (var v = i - 1; v >= 0 && vb.length < 20; v--) if (isNum(bars[v].volume) && bars[v].volume > 0) vb.push(bars[v].volume);
    var va = []; for (var w = i; w < bars.length && va.length < FORENSIC.persistenceBars; w++) if (isNum(bars[w].volume)) va.push(bars[w].volume);
    ev.volumeRatioDay = vb.length && isNum(b.volume) ? b.volume / median(vb) : null;
    ev.volumeRatioAfter = vb.length && va.length ? median(va) / median(vb) : null;
    // Stale davor
    var staleRun = 0; for (var s = i - 1; s >= 1 && !fresh(bars[s], bars[s - 1]); s--) staleRun++;
    ev.staleBarsBefore = staleRun;
    // SEC-Aktienzahl um das Ereignis
    var shares = ctx.shares || [], d = String(b.date).slice(0, 10), sb = null, sa = null;
    for (var q = 0; q < shares.length; q++) {
      if (shares[q][0] <= d) sb = shares[q][1];
      else if (sa === null && shares[q][0] <= addDays(d, 200)) sa = shares[q][1];
    }
    ev.secSharesRatio = sb && sa ? sa / sb : null;
    // gemeldeter Split in der Naehe
    var nearDeclared = null;
    for (var nd = Math.max(1, i - FORENSIC.dateShiftWindow); nd <= Math.min(bars.length - 1, i + FORENSIC.dateShiftWindow); nd++) if (nd !== i && declared(bars[nd])) { nearDeclared = { offset: nd - i, splitFactor: bars[nd].splitFactor }; break; }
    ev.nearDeclaredSplit = nearDeclared;
    var sig = CTR.undeclaredReverseSplitSignature(bars, i), spike = i + 1 < bars.length ? CTR.revertedSpike(bars, i + 1) : null;
    ev.coreSignature = sig; ev.coreSpike = spike ? true : false;

    var out = function (cause, confidence, expected, observed) {
      var pol = CAUSE_TO_POLICY[cause] ? POLICY_BY_CLASS[CAUSE_TO_POLICY[cause]] : null;
      return { cause: cause, confidence: confidence, locus: CAUSE_LOCUS[cause], evidence: ev, expected: expected, observed: observed,
               policyClass: pol ? pol.cls : null, outcome: pol ? pol.outcome : "ACCEPT", reasonCode: pol ? pol.reason : "GENUINE_MOVE_NO_DATA_SIGNATURE" };
    };

    if (declared(b)) {
      var g = b.splitFactor * b.close / p.close;
      ev.splitFactor = b.splitFactor; ev.impliedGross = g;
      var parity = ev.providerFactorStep !== null ? Math.abs(ev.providerFactorStep * b.splitFactor - 1) <= 0.01 : null;
      ev.providerParity = parity;
      if (Math.abs(Math.log(g)) >= Math.log(1.8)) {
        var kk = nearestRatio(r >= 1 ? r : 1 / r, CTR.CONFIG.undeclaredSplitRatios);
        return out("DECLARED_SPLIT_INCONSISTENT", kk.logDev <= Math.log(1.25) ? "MEDIUM" : "LOW",
          "price return across the split day near 1 (raw x splitFactor)", "raw x splitFactor = " + round4(g) + "; raw ratio nearest conventional " + kk.k);
      }
      return out("CONFIRMED_SPLIT", parity === false ? "MEDIUM" : "HIGH",
        "split applied via splitFactor", "consistent (implied gross " + round4(g) + (parity === false ? "; provider column missed it" : "") + ")");
    }
    if (gapDays > FORENSIC.listingGapDays) {
      return out(ctx.listing && ctx.listing.reusedLater ? "TICKER_IDENTITY_MISMATCH" : "LISTING_CHANGE", "MEDIUM",
        "no return across a listing boundary", "jump after a " + Math.round(gapDays) + "-day gap");
    }
    if (staleRun >= FORENSIC.stalePriorBars) {
      return out("STALE_PRICE", "MEDIUM", "fresh quotes", staleRun + " stale bars before the jump");
    }
    if (spike) return out("PROVIDER_SPIKE", "HIGH", "no isolated bad tick", "x" + round4(r) + " then reverted next day");
    if (nearDeclared && Math.abs(Math.log(r * nearDeclared.splitFactor)) < Math.abs(Math.log(r)) / 2) {
      return out("DECLARED_SPLIT_DATE_SHIFT", "HIGH", "declared split on the day the raw quote moves", "raw moves on day " + d + ", factor recorded " + nearDeclared.offset + " bar(s) away");
    }
    var up = r >= 1, rr = up ? r : 1 / r;
    var kr = nearestRatio(rr, CTR.CONFIG.undeclaredSplitRatios), match = kr.logDev <= Math.log(1.25);
    var persists = ev.persistenceRatio !== null && Math.abs(Math.log(ev.persistenceRatio / (up ? kr.k : 1 / kr.k))) <= Math.log(FORENSIC.persistenceTolerance);
    var sharesInverse = ev.secSharesRatio !== null && Math.abs(Math.log(ev.secSharesRatio * (up ? kr.k : 1 / kr.k))) <= Math.log(FORENSIC.sharesTolerance);
    var providerFollowed = ev.providerFactorStep !== null && Math.abs(ev.providerFactorStep - 1) <= 0.01;
    ev.nearestConventionalRatio = kr.k; ev.persists = persists; ev.secSharesInverse = sharesInverse; ev.providerFactorUnchanged = providerFollowed;
    var unit = FORENSIC.unitRatios.some(function (u) { return Math.abs(Math.log(rr / u)) <= Math.log(1.1); }) && ev.volumeRatioDay !== null && ev.volumeRatioDay > 0.2;
    var volumeInverse = ev.volumeRatioAfter !== null && ev.volumeRatioAfter < 1 && ev.volumeRatioAfter <= FORENSIC.persistenceTolerance * CTR.CONFIG.undeclaredSplitActivity / kr.k &&
      ev.volumeRatioDay !== null && ev.volumeRatioDay < 1;
    ev.volumeInverse = volumeInverse;
    if (up && match && (sig || (persists && (sharesInverse || volumeInverse)))) {
      var conf = sig && persists && sharesInverse ? "HIGH" : sig && persists ? "HIGH" : sig || sharesInverse ? "MEDIUM" : "LOW";
      return out("UNDECLARED_REVERSE_SPLIT", conf, "splitFactor 1/" + kr.k + " on " + d + " (adjusted continuity)",
        "splitFactor 1, raw x" + round4(r) + ", provider factor " + (providerFollowed ? "unchanged (provider missed it too)" : "step " + round4(ev.providerFactorStep)));
    }
    if (unit) return out("CURRENCY_OR_UNIT", "LOW", "same unit across days", "x" + round4(r) + " at a unit ratio without inverse volume");
    if (!up && match && persists && rr >= 2 && (sharesInverse || (ev.volumeRatioAfter !== null && ev.volumeRatioAfter >= kr.k / FORENSIC.persistenceTolerance))) {
      return out("UNDECLARED_FORWARD_SPLIT_POSSIBLE", sharesInverse ? "MEDIUM" : "LOW", "splitFactor " + kr.k + " on " + d, "splitFactor 1, raw x" + round4(r));
    }
    if (rr >= CTR.CONFIG.unresolvedJumpRatio) return out("UNRESOLVED", "LOW", "explained discontinuity", "x" + round4(r) + " without split signature");
    return out("GENUINE_PRICE_MOVE", "MEDIUM", "market move", "x" + round4(r) + " without data signature");
  }

  function addDays(d, n) { return new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10); }
  function round4(x) { return isNum(x) ? Math.round(x * 1e4) / 1e4 : null; }

  /**
   * Hohe Kursniveaus (Phase E). bars: kanonische Kerzen mit close (split-
   * bereinigt) und rawClose. Liefert null unter der Schwelle, sonst Ursache.
   */
  function explainHighLevel(security, threshold) {
    threshold = threshold || 1e6;
    var bars = security.bars || [], maxAdj = 0, maxRaw = 0, at = -1;
    for (var i = 0; i < bars.length; i++) { if (bars[i].close > maxAdj) { maxAdj = bars[i].close; at = i; } if (bars[i].rawClose > maxRaw) maxRaw = bars[i].rawClose; }
    if (!(maxAdj > threshold)) return null;
    var reverse = 0, inconsistent = 0, jumps = 0, cumulative = 1;
    for (var j = 1; j < bars.length; j++) {
      var a = bars[j - 1], b = bars[j];
      if (!(a.rawClose > 0 && b.rawClose > 0)) continue;
      if (declared(b)) {
        if (b.splitFactor < 1) { reverse++; cumulative *= b.splitFactor; }
        var g = b.splitFactor * b.rawClose / a.rawClose; if (Math.abs(Math.log(g)) >= Math.log(2)) inconsistent++;
      } else if (Math.abs(Math.log(b.rawClose / a.rawClose)) >= Math.log(10)) jumps++;
    }
    var ev = { maxAdjusted: maxAdj, maxRaw: maxRaw, declaredReverseSplits: reverse, cumulativeReverseFactor: cumulative, inconsistentDeclaredSplits: inconsistent, undeclaredJumps10x: jumps, rawAtMaxAdjusted: at >= 0 ? bars[at].rawClose : null };
    var cause;
    if (security.listing && security.listing.reusedLater && (jumps || inconsistent)) cause = "TICKER_IDENTITY_MISMATCH";
    else if (inconsistent) cause = "DECLARED_SPLIT_INCONSISTENT";
    else if (jumps) cause = "UNDECLARED_JUMP_IN_HISTORY";
    else if (maxRaw >= FORENSIC.highNominalRaw && reverse === 0) cause = "LEGITIMATE_HIGH_NOMINAL_PRICE";
    else if (reverse > 0 && maxAdj <= maxRaw / cumulative * 1.01 + 1e-9) cause = "ADJUSTED_LEVEL_FROM_DECLARED_REVERSE_SPLITS";
    else if (maxRaw > threshold) cause = "UNADJUSTED_OR_UNIT_RAW";
    else cause = "UNRESOLVED";
    return { cause: cause, evidence: ev };
  }

  var HIGH_LEVEL_CAUSES = ["TICKER_IDENTITY_MISMATCH", "DECLARED_SPLIT_INCONSISTENT", "UNDECLARED_JUMP_IN_HISTORY", "LEGITIMATE_HIGH_NOMINAL_PRICE",
    "ADJUSTED_LEVEL_FROM_DECLARED_REVERSE_SPLITS", "UNADJUSTED_OR_UNIT_RAW", "UNRESOLVED"];

  var api = { VERSION: VERSION, HIGH_LEVEL_CAUSES: HIGH_LEVEL_CAUSES, POLICY: POLICY, POLICY_BY_CLASS: POLICY_BY_CLASS, ROOT_CAUSES: ROOT_CAUSES, CAUSE_TO_POLICY: CAUSE_TO_POLICY,
              CAUSE_LOCUS: CAUSE_LOCUS, FORENSIC: FORENSIC, explainDay: explainDay, explainHighLevel: explainHighLevel };
  if (isNode) module.exports = api;
  else global.VUPriceIntegrity = api;
})(typeof window !== "undefined" ? window : globalThis);
