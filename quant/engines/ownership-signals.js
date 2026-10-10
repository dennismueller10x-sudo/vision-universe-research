/* =========================================================================
   VISION UNIVERSE QUANT — engines/ownership-signals.js
   Eigentuemer-Signale aus SEC EDGAR (public domain), ohne bezahlte
   Analystendaten (ownership-signals-1.0.0):

     A) Insider-Transaktionen (Form 3/4/5): Kaeufe (Code P) und Verkaeufe
        (Code S) am offenen Markt durch Vorstaende (Officer), Direktoren und
        10-%-Eigner, je Emittent.
     B) Grosse Adressen: Schedule 13D (aktivistisch) und 13G (passiv) ab 5 %
        Anteil, sowie die Quartalsbestaende institutioneller Verwalter aus
        Form 13F.

   ZEITPUNKT (point in time): Massgeblich ist IMMER das Einreichungsdatum
   (filing date) - nie das Transaktions- oder Berichtsdatum. Was nach dem
   Stichtag D eingereicht wurde, ist an D unsichtbar, auch wenn die
   Transaktion selbst vor D lag. Diese Regel steht in genau einer Funktion
   (visible) und wird von allen Schnappschuessen benutzt.

   Diese Datei ist rein: kein Netz, kein Dateisystem. Abruf, Entpacken und
   Zuordnung zum Produktuniversum liegen im Erzeuger
   scripts/market/build-ownership-signals.mjs.
   ========================================================================= */
(function (global) {
  "use strict";
  var VERSION = "ownership-signals-1.0.0";
  var DAY_MS = 864e5;

  /* Die SEC hat mit der 13F-Novelle (Release 34-95148) die Einheit der
     Spalte VALUE geaendert: Einreichungen AB DEM 03.01.2023 melden den Wert
     in Dollar (gerundet), davor in Tausend Dollar. Massgeblich ist das
     Einreichungsdatum, nicht die Berichtsperiode. Einzelne Verwalter haben
     die Umstellung falsch umgesetzt; deshalb prueft thirteenFValueUnit
     zusaetzlich den Median des impliziten Werts je Aktie einer Einreichung. */
  var THIRTEEN_F_DOLLAR_SWITCH = "2023-01-03";
  /* Frist fuer 13F: 45 Tage nach Quartalsende. Ein Schnappschuss an D
     benutzt das juengste Quartal, dessen Frist an D abgelaufen ist. */
  var THIRTEEN_F_DEADLINE_DAYS = 45;
  var CLUSTER_MIN_INSIDERS = 3;
  var CLUSTER_SPAN_DAYS = 30;
  var WINDOWS = [90, 180];

  /* Beziehung des Meldenden zum Emittenten als Bitmaske. */
  var REL = { DIRECTOR: 1, OFFICER: 2, TEN_PCT: 4, OTHER: 8 };
  var INSIDER_MASK = REL.DIRECTOR | REL.OFFICER | REL.TEN_PCT;

  var MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

  function pad(n, w) { var s = String(n); while (s.length < (w || 2)) s = "0" + s; return s; }

  /** SEC-Datumsangaben in ISO (YYYY-MM-DD). Die Datensaetze schreiben
   *  "31-MAR-2024", die Indizes "2024-03-31" (frueher "20240331"), manche
   *  Formulare "03/31/2024". Unlesbares -> null, nie ein geratenes Datum. */
  function parseSecDate(s) {
    if (s === null || s === undefined) return null;
    var t = String(s).trim();
    var m;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t))) return valid(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(t))) return valid(+m[3], MONTHS[m[2].toUpperCase()], +m[1]);
    if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(t))) return valid(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t))) return valid(+m[3], +m[1], +m[2]);
    return null;
    function valid(y, mo, d) {
      /* Formulare tragen Tippfehler ("15-JAN-0024"): ein Jahr vor 1900 ist keins. */
      if (!y || y < 1900 || !mo || !d || mo > 12 || d > 31) return null;
      var dt = new Date(Date.UTC(y, mo - 1, d));
      if (dt.getUTCMonth() !== mo - 1) return null;
      return y + "-" + pad(mo) + "-" + pad(d);
    }
  }
  /** Tage seit 1970-01-01 (UTC). */
  function dayOf(iso) {
    if (!iso || typeof iso !== "string") return null;
    var y = +iso.slice(0, 4), d = Math.round(Date.UTC(y, +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY_MS);
    /* Date.UTC deutet Jahre < 100 als 19xx; ein Tippfehler im Formular
       ("0024") wird so nicht still zu 1924, sondern zu null. */
    return isFinite(d) && y >= 1900 ? d : null;
  }
  function isoOf(day) { return new Date(day * DAY_MS).toISOString().slice(0, 10); }

  function quarterOf(iso) { return { year: +iso.slice(0, 4), q: Math.floor((+iso.slice(5, 7) - 1) / 3) + 1 }; }
  function quarterEnd(year, q) { return isoOf(Math.round(Date.UTC(year, q * 3, 1) / DAY_MS) - 1); }
  function periodLabel(iso) { var x = quarterOf(iso); return x.year + "-Q" + x.q; }
  function prevQuarterEnd(iso) { var x = quarterOf(iso); return x.q === 1 ? quarterEnd(x.year - 1, 4) : quarterEnd(x.year, x.q - 1); }
  function nextQuarterEnd(iso) { var x = quarterOf(iso); return x.q === 4 ? quarterEnd(x.year + 1, 1) : quarterEnd(x.year, x.q + 1); }

  /** Juengstes 13F-Quartal, dessen 45-Tage-Frist an `day` abgelaufen ist. */
  function thirteenFPeriodAt(day) {
    var x = quarterOf(isoOf(day));
    var end = quarterEnd(x.year, x.q);
    while (dayOf(end) + THIRTEEN_F_DEADLINE_DAYS > day) end = prevQuarterEnd(end);
    return end;
  }

  /** Monatsenden zwischen from und to (beide ISO, inklusive). */
  function monthEnds(fromIso, toIso) {
    var out = [];
    var y = +fromIso.slice(0, 4), m = +fromIso.slice(5, 7);
    for (;;) {
      var end = isoOf(Math.round(Date.UTC(y, m, 1) / DAY_MS) - 1);
      if (end > toIso) break;
      if (end >= fromIso) out.push(end);
      m++; if (m > 12) { m = 1; y++; }
    }
    return out;
  }

  /** Kopfzeile einer TSV -> {SPALTE: index} (Grossschrift, ohne BOM). */
  function headerIndex(line) {
    var cols = String(line).replace(/^﻿/, "").replace(/\r$/, "").split("\t");
    var idx = {};
    for (var i = 0; i < cols.length; i++) idx[cols[i].trim().toUpperCase()] = i;
    return idx;
  }
  /** Kleine TSV vollstaendig lesen (Tests, Fixtures). */
  function parseTsv(text) {
    var lines = String(text).split(/\r?\n/).filter(function (l) { return l.length; });
    if (!lines.length) return [];
    var head = lines[0].replace(/^﻿/, "").split("\t").map(function (h) { return h.trim().toUpperCase(); });
    return lines.slice(1).map(function (l) {
      var c = l.split("\t"), o = {};
      for (var i = 0; i < head.length; i++) o[head[i]] = c[i] === undefined ? "" : c[i];
      return o;
    });
  }
  function num(s) {
    if (s === null || s === undefined) return null;
    var t = String(s).trim().replace(/,/g, "");
    if (!t) return null;
    var v = Number(t);
    return isFinite(v) ? v : null;
  }

  /** Beziehung aus dem Datensatz (RPTOWNER_RELATIONSHIP, z. B.
   *  "Director,TenPercentOwner") oder aus den Form-4-Flags. */
  function classifyRelationship(text) {
    var t = String(text || "").toLowerCase().replace(/[\s_%-]/g, "");
    var bits = 0;
    if (t.indexOf("director") >= 0) bits |= REL.DIRECTOR;
    if (t.indexOf("officer") >= 0) bits |= REL.OFFICER;
    if (t.indexOf("tenpercent") >= 0 || t.indexOf("10owner") >= 0 || t.indexOf("10percent") >= 0) bits |= REL.TEN_PCT;
    if (t.indexOf("other") >= 0) bits |= REL.OTHER;
    return bits;
  }
  function relationshipFromFlags(flags) {
    var on = function (v) { var s = String(v || "").trim().toLowerCase(); return s === "1" || s === "true" || s === "y"; };
    return (on(flags.isDirector) ? REL.DIRECTOR : 0) | (on(flags.isOfficer) ? REL.OFFICER : 0) |
      (on(flags.isTenPercentOwner) ? REL.TEN_PCT : 0) | (on(flags.isOther) ? REL.OTHER : 0);
  }
  function isInsider(bits) { return (bits & INSIDER_MASK) !== 0; }

  /** Insider-Formulare, die in die Signale eingehen. Aenderungen (/A)
   *  werden NICHT gezaehlt: sie wiederholen meist die Originalmeldung und
   *  wuerden Kaeufe doppelt zaehlen (dokumentierte Einschraenkung). */
  function insiderDocType(docType) {
    var t = String(docType || "").trim().toUpperCase();
    if (t === "4" || t === "5") return { form: t, amendment: false };
    if (t === "4/A" || t === "5/A") return { form: t.slice(0, 1), amendment: true };
    return null;
  }

  /** Schedule 13D/13G: alte Formularnamen ("SC 13D", "SC 13G/A") und die
   *  seit 18.12.2024 gueltigen strukturierten ("SCHEDULE 13D", ...). */
  function scheduleForm(form) {
    var t = String(form || "").trim().toUpperCase().replace(/\s+/g, " ");
    var m = /^(?:SC|SCHEDULE) ?13([DG])(\/A)?$/.exec(t);
    if (!m) return null;
    return { kind: "13" + m[1], amendment: !!m[2] };
  }

  /** Einheit der 13F-Spalte VALUE fuer eine Einreichung. */
  /** Ist eine 13F-Meldung als Bestandsliste vollstaendig? Sonst darf der
   *  Verwalter fuer dieses Quartal nicht als "hat gemeldet" gelten: Neu-
   *  und Ausstiege wuerden aus einer Luecke abgeleitet. Zwei Faelle aus
   *  den SEC-Datensaetzen: vertrauliche Meldungen (ISCONFIDENTIALOMITTED=Y,
   *  z. B. Norges Bank) und Originale, deren Tabelle im Datensatz nur einen
   *  Bruchteil der angegebenen Zeilen traegt (die Bestaende stehen in einer
   *  RESTATEMENT-Aenderung, z. B. JPMorgan Q1 2026).
   *  info: { rows, tableEntryTotal, confidentialOmitted } */
  var THIRTEEN_F_MIN_COVERAGE = 0.9;
  function thirteenFFilingComplete(info) {
    if (!info || info.confidentialOmitted) return false;
    var total = info.tableEntryTotal;
    if (!(total > 0)) return true; // ohne Summenseite (aeltere Datensaetze): wie bisher
    return (info.rows || 0) >= THIRTEEN_F_MIN_COVERAGE * total;
  }

  function thirteenFValueUnit(filingIso, medianValuePerShare) {
    var byDate = filingIso && filingIso >= THIRTEEN_F_DOLLAR_SWITCH ? "DOLLARS" : "THOUSANDS";
    var m = medianValuePerShare;
    if (m === null || m === undefined || !isFinite(m) || m <= 0) return { unit: byDate, basis: "FILING_DATE_RULE" };
    /* In Tausend gemeldet heisst: Wert je Aktie = Kurs / 1000. Ein Median
       unter 0,5 (= Kurs unter 500 $ in Tausend) in einer Dollar-Meldung
       verraet eine nicht umgestellte Einreichung; ein Median ueber 5 in
       einer Tausender-Meldung waere ein Medianpreis von 5.000 $ - also eine
       zu frueh umgestellte. */
    if (byDate === "DOLLARS" && m < 0.5) return { unit: "THOUSANDS", basis: "IMPLIED_PER_SHARE_OVERRIDE" };
    if (byDate === "THOUSANDS" && m > 5) return { unit: "DOLLARS", basis: "IMPLIED_PER_SHARE_OVERRIDE" };
    return { unit: byDate, basis: "FILING_DATE_RULE" };
  }
  function valueToUsd(value, unit) {
    if (value === null || value === undefined || !isFinite(value)) return null;
    return unit === "THOUSANDS" ? value * 1000 : value;
  }
  function median(values) {
    if (!values || !values.length) return null;
    var s = values.slice().sort(function (a, b) { return a - b; });
    var h = s.length >> 1;
    return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
  }

  /** Datensatz-Dateinamen -> Abdeckungsfenster (Einreichungsdatum).
   *  "2024q1_form345.zip", "2023q4_form13f.zip" und die seit 2024
   *  rollierenden 13F-Namen "01mar2024-31may2024_form13f.zip". */
  function datasetWindow(name) {
    var n = String(name || "").toLowerCase();
    var m = /(\d{4})q([1-4])_form(345|13f)/.exec(n);
    if (m) {
      var y = +m[1], q = +m[2];
      return { start: isoOf(Math.round(Date.UTC(y, (q - 1) * 3, 1) / DAY_MS)), end: quarterEnd(y, q), kind: m[3] === "345" ? "insider" : "13f" };
    }
    m = /(\d{1,2})([a-z]{3})(\d{4})-(\d{1,2})([a-z]{3})(\d{4})_form(345|13f)/.exec(n);
    if (m) {
      return { start: parseSecDate(m[1] + "-" + m[2] + "-" + m[3]), end: parseSecDate(m[4] + "-" + m[5] + "-" + m[6]), kind: m[7] === "345" ? "insider" : "13f" };
    }
    return null;
  }

  /* ---------------------------------------------------------------------
     SICHTBARKEIT - die eine Zeitregel
     --------------------------------------------------------------------- */
  /** Ist eine Einreichung vom Tag f am Stichtag `day` sichtbar und liegt
   *  sie im Fenster der letzten `windowDays` Tage? */
  function visible(f, day, windowDays) {
    if (f === null || f === undefined || f > day) return false;
    return windowDays ? f > day - windowDays : true;
  }
  /** Erster Index i mit arr[i].f > day (arr nach f aufsteigend). */
  function upperBound(arr, day) {
    var lo = 0, hi = arr.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (arr[mid].f <= day) lo = mid + 1; else hi = mid; }
    return lo;
  }

  /* ---------------------------------------------------------------------
     A) INSIDER
     Eine Transaktion: { f: Einreichungstag, t: Transaktionstag, c: "P"|"S",
       sh: Aktien, v: Dollarwert oder null, os: [Eigner-CIK], rs: [Bits],
       p: 10b5-1-Plan (true/false/null), a: Aenderung }
     --------------------------------------------------------------------- */
  function sortTransactions(txs) {
    return txs.sort(function (a, b) { return a.f - b.f || a.t - b.t; });
  }

  /** Cluster-Kauf: mindestens drei verschiedene Insider kaufen innerhalb
   *  von 30 Tagen (Transaktionsdatum), und alle Meldungen sind an `day`
   *  sichtbar und juenger als 90 Tage. */
  function clusterBuy(txs, day, opts) {
    var o = opts || {};
    var minInsiders = o.minInsiders || CLUSTER_MIN_INSIDERS, span = o.spanDays || CLUSTER_SPAN_DAYS;
    var buys = [];
    var end = upperBound(txs, day);
    for (var i = upperBound(txs, day - 90); i < end; i++) {
      var x = txs[i];
      if (x.a || x.c !== "P" || !visible(x.f, day, 90) || typeof x.t !== "number" || !isFinite(x.t)) continue;
      for (var k = 0; k < x.os.length; k++) if (isInsider(x.rs[k])) buys.push({ t: x.t, o: x.os[k] });
    }
    buys.sort(function (a, b) { return a.t - b.t; });
    var counts = {}, distinct = 0, lo = 0, best = 0, bestEnd = null;
    for (var j = 0; j < buys.length; j++) {
      var b = buys[j];
      counts[b.o] = (counts[b.o] || 0) + 1; if (counts[b.o] === 1) distinct++;
      while (b.t - buys[lo].t >= span) { var w = buys[lo++]; counts[w.o]--; if (counts[w.o] === 0) distinct--; }
      if (distinct > best) { best = distinct; bestEnd = b.t; }
    }
    return { flag: best >= minInsiders, maxInsiders: best, windowEnd: bestEnd === null ? null : isoOf(bestEnd) };
  }

  /** Insider-Schnappschuss an `day`. txs nach f aufsteigend sortiert.
   *  opts.sharesBase: Aktienzahl (fuer Nettoaktien in % ), sonst null. */
  function insiderSnapshot(txs, day, opts) {
    var o = opts || {};
    var out = {};
    var end = upperBound(txs, day);
    var b90 = {}, b180 = {}, s90 = {}, bo = {}, bd = {}, bt = {}, bx = {};
    var bv90 = 0, sv90 = 0, svx90 = 0, bv180 = 0, sv180 = 0, nsh90 = 0, nTx = 0, priceless = 0;
    for (var i = end - 1; i >= 0; i--) {
      var x = txs[i];
      if (!visible(x.f, day, 180)) break;
      if (x.a) continue;
      var in90 = visible(x.f, day, 90);
      var anyInsider = false;
      for (var k = 0; k < x.os.length; k++) {
        if (!isInsider(x.rs[k])) continue;
        anyInsider = true;
        var id = x.os[k], bits = x.rs[k];
        if (x.c === "P") {
          b180[id] = 1;
          if (in90) {
            b90[id] = 1;
            if (bits & REL.OFFICER) bo[id] = 1;
            if (bits & REL.DIRECTOR) bd[id] = 1;
            if (bits & REL.TEN_PCT) bt[id] = 1;
            if (x.p !== true) bx[id] = 1;
          }
        } else if (x.c === "S" && in90) s90[id] = 1;
      }
      if (!anyInsider) continue;
      nTx++;
      var v = x.v;
      if (v === null || v === undefined) priceless++;
      var sign = x.c === "P" ? 1 : (x.c === "S" ? -1 : 0);
      if (sign > 0) { bv180 += v || 0; if (in90) bv90 += v || 0; }
      if (sign < 0) { sv180 += v || 0; if (in90) { sv90 += v || 0; if (x.p !== true) svx90 += v || 0; } }
      if (in90) nsh90 += sign * (x.sh || 0);
    }
    var n = function (obj) { return Object.keys(obj).length; };
    out.ib90 = n(b90); out.ib180 = n(b180); out.is90 = n(s90);
    out.ibo90 = n(bo); out.ibd90 = n(bd); out.ibt90 = n(bt); out.ibx90 = n(bx);
    out.bv90 = Math.round(bv90); out.sv90 = Math.round(sv90); out.svx90 = Math.round(svx90);
    out.nbv90 = Math.round(bv90 - sv90); out.nbv180 = Math.round(bv180 - sv180);
    out.nsh90 = Math.round(nsh90);
    out.nsp90 = o.sharesBase > 0 ? round(nsh90 / o.sharesBase * 100, 4) : null;
    out.cb = clusterBuy(txs, day).flag ? 1 : 0;
    out.ntx180 = nTx; out.noPrice180 = priceless;
    return out;
  }

  /** Groesste Kaeufer der letzten 90 Tage (nur fuer den aktuellen Stand). */
  function topInsiderBuyers(txs, day, names, limit) {
    var agg = {};
    var end = upperBound(txs, day);
    for (var i = end - 1; i >= 0; i--) {
      var x = txs[i];
      if (!visible(x.f, day, 90)) break;
      if (x.a || x.c !== "P") continue;
      for (var k = 0; k < x.os.length; k++) {
        if (!isInsider(x.rs[k])) continue;
        var id = x.os[k];
        var a = agg[id] || (agg[id] = { ownerCik: id, name: (names && names[id]) || null, relationship: relationshipLabel(x.rs[k]), shares: 0, valueUsd: 0, transactions: 0, lastFiled: null, plan10b5One: false });
        a.shares += x.sh || 0; a.valueUsd += x.v || 0; a.transactions++;
        if (x.p === true) a.plan10b5One = true;
        var fd = isoOf(x.f); if (!a.lastFiled || fd > a.lastFiled) a.lastFiled = fd;
      }
    }
    return Object.keys(agg).map(function (k) { var a = agg[k]; a.shares = Math.round(a.shares); a.valueUsd = Math.round(a.valueUsd); return a; })
      .sort(function (a, b) { return b.valueUsd - a.valueUsd || b.shares - a.shares || (a.ownerCik < b.ownerCik ? -1 : 1); })
      .slice(0, limit || 5);
  }
  function relationshipLabel(bits) {
    var out = [];
    if (bits & REL.OFFICER) out.push("officer");
    if (bits & REL.DIRECTOR) out.push("director");
    if (bits & REL.TEN_PCT) out.push("tenPercentOwner");
    if (bits & REL.OTHER) out.push("other");
    return out.join(",");
  }

  /* ---------------------------------------------------------------------
     B1) SCHEDULE 13D / 13G
     Eine Meldung: { f, k: "13D"|"13G", a: Aenderung, filers: [Namen], acc }
     --------------------------------------------------------------------- */
  function scheduleSnapshot(filings, day) {
    var out = { d13n: 0, g13n: 0, d13a: 0, g13a: 0 };
    for (var i = 0; i < filings.length; i++) {
      var x = filings[i];
      if (!visible(x.f, day, 90)) continue;
      var key = (x.k === "13D" ? "d13" : "g13") + (x.a ? "a" : "n");
      out[key]++;
    }
    return out;
  }
  function recentSchedules(filings, day, limit) {
    return filings.filter(function (x) { return visible(x.f, day, 90); })
      .sort(function (a, b) { return b.f - a.f || (a.acc < b.acc ? -1 : 1); })
      .slice(0, limit || 10)
      .map(function (x) { return { filed: isoOf(x.f), form: "SC " + x.k + (x.a ? "/A" : ""), filers: x.filers.slice(0, 4), accession: x.acc }; });
  }

  /** Wer ist der Gegenstand (subject company) einer 13D/13G-Meldung?
   *  Der EDGAR-Index fuehrt jede Meldung je beteiligtem Einreicher einmal
   *  (Gegenstand UND Meldende), ohne Rolle. Regeln, der Reihe nach:
   *   - Kandidaten sind nur Parteien im Universum.
   *   - Wer die Meldung selbst eingereicht hat (Accession-Praefix = CIK),
   *     ist Meldender: ein Unternehmen reicht keine 13D/13G ueber sich selbst ein.
   *   - Wer im selben Quartal an >= filerThreshold Meldungen beteiligt ist,
   *     ist ein Verwalter (BlackRock & Co.), kein Gegenstand.
   *   - Bleibt genau ein Kandidat, ist er der Gegenstand; sonst MEHRDEUTIG
   *     (verworfen und gezaehlt - nie geraten). */
  function resolveScheduleSubject(acc, parties, universeCiks, participation, opts) {
    var threshold = (opts && opts.filerThreshold) || 40;
    var prefix = String(acc || "").slice(0, 10);
    var cands = parties.filter(function (p) { return universeCiks.has(p.cik); });
    if (!cands.length) return { status: "NOT_IN_UNIVERSE" };
    var subj = cands.filter(function (p) {
      return p.cik !== prefix && !((participation && participation.get(p.cik)) >= threshold);
    });
    if (subj.length !== 1) return { status: subj.length ? "AMBIGUOUS" : "FILER_ONLY" };
    var subject = subj[0];
    var filers = [];
    parties.forEach(function (p) { if (p.cik !== subject.cik && filers.indexOf(p.name) < 0) filers.push(p.name); });
    return { status: "RESOLVED", subjectCik: subject.cik, filers: filers };
  }

  /* ---------------------------------------------------------------------
     B2) FORM 13F
     Je Ticker und Quartal: Positionen { m: Verwalter, sh: Aktien,
     v: Dollar, f: Einreichungstag }, nach (m, f) sortiert.
     filedDay: Map Verwalter -> Tag der ersten 13F-HR-Meldung fuer das
     Quartal (wer gemeldet hat, ob mit oder ohne Position).
     --------------------------------------------------------------------- */
  function holdingsAt(positions, day) {
    var map = new Map();
    for (var i = 0; i < positions.length; i++) {
      var p = positions[i];
      if (!visible(p.f, day)) continue;
      var h = map.get(p.m);
      if (!h) { h = { sh: 0, v: 0 }; map.set(p.m, h); }
      h.sh += p.sh || 0; h.v += p.v || 0;
    }
    return map;
  }
  function thirteenFSnapshot(curr, prev, day, opts) {
    var o = opts || {};
    var c = holdingsAt(curr.positions || [], day), p = holdingsAt(prev.positions || [], day);
    var filedCurr = function (m) { var d = curr.filedDay && curr.filedDay.get(m); return d !== undefined && d <= day; };
    var filedPrev = function (m) { var d = prev.filedDay && prev.filedDay.get(m); return d !== undefined && d <= day; };
    var out = { fh: 0, fhp: 0, fnew: 0, fexit: 0, finc: 0, fdec: 0, fsh: 0, fshp: 0, fdsh: 0, fval: 0 };
    var newOnes = [];
    c.forEach(function (h, m) {
      if (h.sh <= 0) return;
      out.fh++; out.fsh += h.sh; out.fval += h.v;
      var ph = p.get(m), psh = ph ? ph.sh : 0;
      if (psh <= 0) {
        if (filedPrev(m)) { out.fnew++; out.fdsh += h.sh; newOnes.push({ m: m, sh: h.sh, v: h.v }); }
      } else {
        if (h.sh > psh) out.finc++; else if (h.sh < psh) out.fdec++;
        out.fdsh += h.sh - psh;
      }
    });
    p.forEach(function (h, m) {
      if (h.sh <= 0) return;
      out.fhp++; out.fshp += h.sh;
      var ch = c.get(m);
      if ((!ch || ch.sh <= 0) && filedCurr(m)) { out.fexit++; out.fdsh -= h.sh; }
    });
    out.fsh = Math.round(out.fsh); out.fshp = Math.round(out.fshp); out.fdsh = Math.round(out.fdsh); out.fval = Math.round(out.fval);
    out.fio = o.sharesBase > 0 ? round(out.fsh / o.sharesBase * 100, 2) : null;
    newOnes.sort(function (a, b) { return b.sh - a.sh || a.m - b.m; });
    out.topNew = newOnes.slice(0, o.topLimit || 5).map(function (x) { return { manager: x.m, shares: Math.round(x.sh), valueUsd: Math.round(x.v) }; });
    return out;
  }

  /* ---------------------------------------------------------------------
     CUSIP -> TICKER (fuer 13F)
     Quelle: die Fails-to-Deliver-Daten der SEC (public domain), die je
     Zeile CUSIP und Handelssymbol fuehren. obs: Map cusip -> Map symbol ->
     {first, last} (ISO). Regeln:
      - Ein CUSIP gehoert dem Symbol, unter dem er ZULETZT gefuehrt wurde.
      - Aktuelle CUSIPs eines Tickers: zuletzt unter ihm gefuehrt und
        innerhalb von currentDays vor dem juengsten Datum gesehen.
      - Historische CUSIPs nur mit derselben Emittentennummer (CUSIP-6)
        wie ein aktueller: ein wiederverwendetes Kuerzel eines anderen,
        laengst delisteten Unternehmens wird so NICHT zugeordnet.
     --------------------------------------------------------------------- */
  function normalizeCusip(c) {
    var t = String(c || "").trim().toUpperCase();
    if (/^[0-9A-Z]{8}$/.test(t)) t = "0" + t;
    return /^[0-9A-Z]{9}$/.test(t) ? t : null;
  }
  function symbolKey(s) { var t = String(s || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, ""); return t || null; }
  function mapCusipsToTickers(obs, tickers, opts) {
    var currentDays = (opts && opts.currentDays) || 730;
    var byKey = new Map(), dup = new Set();
    tickers.forEach(function (t) { var k = symbolKey(t); if (!k) return; if (byKey.has(k) && byKey.get(k) !== t) dup.add(k); else byKey.set(k, t); });
    dup.forEach(function (k) { byKey.delete(k); });
    var latest = new Map(), maxDate = "";
    obs.forEach(function (bySym, cusip) {
      var best = null;
      bySym.forEach(function (r, sym) { if (!best || r.last > best.last || (r.last === best.last && sym < best.sym)) best = { sym: sym, last: r.last }; });
      if (best) { latest.set(cusip, best); if (best.last > maxDate) maxDate = best.last; }
    });
    var cutoff = maxDate ? isoOf(dayOf(maxDate) - currentDays) : "";
    var issuer6 = new Map();
    latest.forEach(function (b, cusip) {
      var t = byKey.get(symbolKey(b.sym));
      if (!t || b.last < cutoff) return;
      (issuer6.get(t) || issuer6.set(t, new Set()).get(t)).add(cusip.slice(0, 6));
    });
    var map = new Map(), rejectedReuse = 0;
    latest.forEach(function (b, cusip) {
      var t = byKey.get(symbolKey(b.sym));
      if (!t) return;
      var s6 = issuer6.get(t);
      if (s6 && s6.has(cusip.slice(0, 6))) map.set(cusip, t); else rejectedReuse++;
    });
    return { map: map, tickersMapped: issuer6.size, ambiguousSymbols: dup.size, rejectedReuse: rejectedReuse, latestObservation: maxDate || null };
  }

  /* ---------------------------------------------------------------------
     FORM 4 (XML) - fuer die Luecke zwischen dem letzten Quartals-
     Datensatz und heute. Bewusst schmal: nur die Felder, die die Signale
     brauchen. Die Einreichung (.txt) traegt das XML zwischen <XML>-Tags.
     --------------------------------------------------------------------- */
  function unescapeXml(s) {
    return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(+d); })
      .replace(/&amp;/g, "&").trim();
  }
  function blocks(xml, tag) {
    var re = new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tag + ">", "g"), out = [], m;
    while ((m = re.exec(xml))) out.push(m[1]);
    return out;
  }
  function inner(xml, tag) { var b = blocks(xml, tag); return b.length ? b[0] : null; }
  function val(xml, tag) {
    var b = inner(xml, tag);
    if (b === null) return null;
    var v = inner(b, "value");
    return unescapeXml(v === null ? b : v);
  }
  function footnoteRefs(xml) {
    var re = /<footnoteId\s+id\s*=\s*"([^"]+)"/g, out = [], m;
    while ((m = re.exec(xml))) out.push(m[1]);
    return out;
  }
  var PLAN_RE = /10b5-?1/i;
  function truthy(s) { var t = String(s === null || s === undefined ? "" : s).trim().toLowerCase(); return t === "1" || t === "true" || t === "y"; }
  function parseForm4Xml(text) {
    var doc = inner(String(text || ""), "ownershipDocument");
    if (doc === null) return null;
    var notes = {};
    blocks(doc, "footnotes").forEach(function (fs) {
      var re = /<footnote\s+id\s*=\s*"([^"]+)"\s*>([\s\S]*?)<\/footnote>/g, m;
      while ((m = re.exec(fs))) notes[m[1]] = unescapeXml(m[2]);
    });
    var affRaw = inner(doc, "aff10b5One");
    var aff = affRaw === null ? null : truthy(unescapeXml(affRaw));
    var owners = blocks(doc, "reportingOwner").map(function (o) {
      var rel = inner(o, "reportingOwnerRelationship") || "";
      return {
        cik: (unescapeXml(inner(o, "rptOwnerCik") || "").replace(/\D/g, "") || null),
        name: unescapeXml(inner(o, "rptOwnerName") || "") || null,
        bits: relationshipFromFlags({ isDirector: unescapeXml(inner(rel, "isDirector") || ""), isOfficer: unescapeXml(inner(rel, "isOfficer") || ""),
          isTenPercentOwner: unescapeXml(inner(rel, "isTenPercentOwner") || ""), isOther: unescapeXml(inner(rel, "isOther") || "") }),
        title: unescapeXml(inner(rel, "officerTitle") || "") || null
      };
    });
    var txs = blocks(doc, "nonDerivativeTransaction").map(function (t) {
      var coding = inner(t, "transactionCoding") || "";
      var refs = footnoteRefs(t);
      var planByNote = refs.some(function (id) { return notes[id] && PLAN_RE.test(notes[id]); });
      return {
        code: unescapeXml(inner(coding, "transactionCode") || "").toUpperCase() || null,
        date: parseSecDate(val(t, "transactionDate")),
        shares: num(val(t, "transactionShares")),
        price: num(val(t, "transactionPricePerShare")),
        ad: (val(t, "transactionAcquiredDisposedCode") || "").toUpperCase() || null,
        plan: planByNote || aff === true
      };
    });
    var issuerCik = (unescapeXml(inner(doc, "issuerCik") || "").replace(/\D/g, "")) || null;
    return {
      docType: unescapeXml(inner(doc, "documentType") || "") || null,
      issuerCik: issuerCik ? pad(issuerCik, 10) : null,
      aff10b5One: aff,
      owners: owners.map(function (o) { return { cik: o.cik ? pad(o.cik, 10) : null, name: o.name, bits: o.bits, title: o.title }; }),
      transactions: txs
    };
  }

  /** Aktienbasis an `day`: juengster Wert, dessen Einreichung sichtbar ist.
   *  series: [[filedDay, shares], ...] aufsteigend. */
  function sharesBaseAt(series, day) {
    if (!series) return null;
    var best = null;
    for (var i = 0; i < series.length; i++) { if (series[i][0] <= day) best = series[i][1]; else break; }
    return best;
  }

  function round(x, d) { var f = Math.pow(10, d); return Math.round(x * f) / f; }

  var api = {
    VERSION: VERSION, REL: REL, THIRTEEN_F_DOLLAR_SWITCH: THIRTEEN_F_DOLLAR_SWITCH, THIRTEEN_F_DEADLINE_DAYS: THIRTEEN_F_DEADLINE_DAYS,
    CLUSTER_MIN_INSIDERS: CLUSTER_MIN_INSIDERS, CLUSTER_SPAN_DAYS: CLUSTER_SPAN_DAYS, WINDOWS: WINDOWS,
    parseSecDate: parseSecDate, dayOf: dayOf, isoOf: isoOf, quarterOf: quarterOf, quarterEnd: quarterEnd, periodLabel: periodLabel,
    prevQuarterEnd: prevQuarterEnd, nextQuarterEnd: nextQuarterEnd, thirteenFPeriodAt: thirteenFPeriodAt, monthEnds: monthEnds,
    headerIndex: headerIndex, parseTsv: parseTsv, num: num,
    classifyRelationship: classifyRelationship, relationshipFromFlags: relationshipFromFlags, relationshipLabel: relationshipLabel, isInsider: isInsider,
    insiderDocType: insiderDocType, scheduleForm: scheduleForm,
    thirteenFValueUnit: thirteenFValueUnit, thirteenFFilingComplete: thirteenFFilingComplete, THIRTEEN_F_MIN_COVERAGE: THIRTEEN_F_MIN_COVERAGE, valueToUsd: valueToUsd, median: median, datasetWindow: datasetWindow,
    visible: visible, sortTransactions: sortTransactions, clusterBuy: clusterBuy, insiderSnapshot: insiderSnapshot, topInsiderBuyers: topInsiderBuyers,
    scheduleSnapshot: scheduleSnapshot, recentSchedules: recentSchedules, resolveScheduleSubject: resolveScheduleSubject,
    holdingsAt: holdingsAt, thirteenFSnapshot: thirteenFSnapshot,
    normalizeCusip: normalizeCusip, symbolKey: symbolKey, mapCusipsToTickers: mapCusipsToTickers,
    parseForm4Xml: parseForm4Xml, PLAN_RE: PLAN_RE, sharesBaseAt: sharesBaseAt
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.VUOwnershipSignals = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
