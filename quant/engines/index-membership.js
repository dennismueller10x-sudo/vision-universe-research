/* =========================================================================
   VISION UNIVERSE — index-membership.js

   ECHTE INDEX-MITGLIEDSCHAFT - AUS VEROEFFENTLICHTEN BESTAENDEN, NICHT
   AUS TICKER-HEURISTIK

   Welche Aktien im S&P 500, im NASDAQ-100 oder im Dow Jones stehen, sagt
   kein Kursanbieter dieses Projekts. Es sagen aber die Fonds, die diese
   Indizes abbilden: ihre Emittenten veroeffentlichen taeglich die
   vollstaendige Bestandsliste (IVV fuer den S&P 500, QQQ fuer den
   NASDAQ-100, DIA fuer den Dow Jones Industrial Average). Ein Titel ist
   Mitglied, wenn er an diesem Tag im Bestand des abbildenden Fonds steht.
   Das ist eine Abbildung mit einem benannten Stichtag, keine Vermutung
   aus Groesse oder Boerse - und die Datei nennt Quelle, Stichtag und
   jeden Titel, der sich nicht zuordnen liess.

   Diese Datei enthaelt die reinen Funktionen (Parser der drei
   Emittentenformate, Zuordnung zum Company Master, Vergleich zweier
   Staende); das Holen und Schreiben macht
   scripts/market/build-index-membership.mjs. So laesst sich jeder
   Parser gegen eine Fixture pruefen, ohne Netz.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var ENGINE_VERSION = "index-membership-1.0.0";
  var SCHEMA = "index-membership-1.0.0";

  /* ------------------------------------------------------------ CSV */
  function parseCsv(text) {
    var rows = [], row = [], feld = "", inQuote = false;
    var s = String(text || "").replace(/^﻿/, "");
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (inQuote) {
        if (c === '"') { if (s[i + 1] === '"') { feld += '"'; i++; } else inQuote = false; }
        else feld += c;
      } else if (c === '"') inQuote = true;
      else if (c === ",") { row.push(feld); feld = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && s[i + 1] === "\n") i++;
        row.push(feld); rows.push(row); row = []; feld = "";
      } else feld += c;
    }
    if (feld.length || row.length) { row.push(feld); rows.push(row); }
    return rows;
  }

  function norm(v) { return String(v == null ? "" : v).trim(); }
  function lower(v) { return norm(v).toLowerCase(); }
  function zahl(v) {
    var t = norm(v).replace(/[%$,\s]/g, "");
    if (!t) return null;
    var n = Number(t);
    return isFinite(n) ? n : null;
  }

  /** Kopfzeile finden: die erste Zeile, die alle geforderten Spalten traegt. */
  function findHeader(rows, required) {
    for (var i = 0; i < rows.length; i++) {
      var cells = rows[i].map(lower);
      var ok = required.every(function (r) { return cells.some(function (c) { return c === r || c.indexOf(r) === 0; }); });
      if (ok) return i;
    }
    return -1;
  }
  function colIndex(header, name) {
    var h = header.map(lower);
    var i = h.indexOf(name);
    if (i !== -1) return i;
    for (var j = 0; j < h.length; j++) if (h[j].indexOf(name) === 0) return j;
    return -1;
  }

  /**
   * Zeilen (Array von Zellen) -> Mitglieder. Generisch fuer alle drei
   * Emittenten: Kopfzeile ueber Spaltennamen, Ticker-Spalte, optional
   * Name, Gewicht, Assetklasse, Sektor.
   */
  function membersFromRows(rows, spec) {
    var hi = findHeader(rows, spec.required);
    if (hi === -1) return { members: [], error: "Kopfzeile nicht gefunden (" + spec.required.join(", ") + ")", asOf: null };
    var header = rows[hi];
    var ti = colIndex(header, spec.ticker), ni = spec.name ? colIndex(header, spec.name) : -1,
        wi = spec.weight ? colIndex(header, spec.weight) : -1, ai = spec.assetClass ? colIndex(header, spec.assetClass) : -1,
        si = spec.sector ? colIndex(header, spec.sector) : -1, di = spec.date ? colIndex(header, spec.date) : -1;
    var members = [], asOf = null, seen = {};
    for (var r = hi + 1; r < rows.length; r++) {
      var row = rows[r];
      var ticker = norm(row[ti]);
      if (!ticker) { if (members.length && row.every(function (c) { return !norm(c); })) break; continue; }
      if (ai !== -1 && spec.assetClassValue && lower(row[ai]) !== lower(spec.assetClassValue)) continue;
      if (/^[-–]+$/.test(ticker) || lower(ticker) === "cash" || lower(ticker).indexOf("cash") === 0) continue;
      if (spec.skipTickers && spec.skipTickers.indexOf(ticker.toUpperCase()) !== -1) continue;
      var w = wi !== -1 ? zahl(row[wi]) : null;
      if (di !== -1 && !asOf) asOf = parseDate(row[di]);
      var key = ticker.toUpperCase();
      if (seen[key]) continue;
      seen[key] = true;
      members.push({ ticker: key, name: ni !== -1 ? norm(row[ni]) : null,
                     weight: w, sector: si !== -1 ? norm(row[si]) || null : null });
    }
    return { members: members, asOf: asOf, headerRow: hi, error: null };
  }

  /* Emittentenformate. Die Spaltennamen sind die der veroeffentlichten
     Dateien (Stand 2026); aendert ein Emittent den Kopf, scheitert der
     Parser laut - er raet nicht. */
  var FORMATS = {
    ISHARES_CSV: { required: ["ticker", "name", "weight"], ticker: "ticker", name: "name", weight: "weight",
                   assetClass: "asset class", assetClassValue: "Equity", sector: "sector" },
    INVESCO_CSV: { required: ["holding ticker", "weight"], ticker: "holding ticker", name: "name", weight: "weight",
                   sector: "sector", date: "date" },
    SSGA_XLSX:   { required: ["ticker", "weight"], ticker: "ticker", name: "name", weight: "weight",
                   sector: "sector" },
    /* Nasdaq Quote-API (api.nasdaq.com/api/quote/list-type/nasdaq100): JSON
       {data:{data:{rows:[{symbol, companyName, ...}]}}} -> Zeilen mit Kopf. */
    NASDAQ_API_JSON: { required: ["symbol", "companyname"], ticker: "symbol", name: "companyname", weight: null }
  };

  /** Nasdaq-API-JSON -> Zeilen (Kopfzeile + Zeilen), damit derselbe Parser gilt. */
  function rowsFromNasdaqJson(text) {
    var doc = typeof text === "string" ? JSON.parse(text) : text;
    var rows = (doc && doc.data && doc.data.data && doc.data.data.rows) || (doc && doc.data && doc.data.rows) || [];
    var out = [["symbol", "companyName", "marketCap", "lastSalePrice"]];
    rows.forEach(function (r) { out.push([r.symbol || "", r.companyName || "", r.marketCap || "", r.lastSalePrice || ""]); });
    return out;
  }

  function parseDate(v) {
    var t = norm(v);
    var m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + "-" + m[2] + "-" + m[3];
    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);            /* MM/DD/YYYY (US) */
    if (m) return m[3] + "-" + pad2(m[1]) + "-" + pad2(m[2]);
    m = t.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})/);        /* "Sep 12, 2026" */
    if (m) {
      var mon = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[1].toLowerCase()) + 1;
      if (mon) return m[3] + "-" + pad2(mon) + "-" + pad2(m[2]);
    }
    return null;
  }
  function pad2(n) { n = String(n); return n.length < 2 ? "0" + n : n; }

  /** Stichtag aus dem Vorspann ("Fund Holdings as of","Sep 12, 2026") oder Datumsspalte. */
  function asOfFromPreamble(rows) {
    for (var i = 0; i < Math.min(rows.length, 15); i++) {
      var joined = rows[i].map(norm).join(" ");
      if (/as of|holdings date|date/i.test(joined)) {
        for (var j = 0; j < rows[i].length; j++) { var d = parseDate(rows[i][j]); if (d) return d; }
        var m = joined.match(/([A-Za-z]{3}\s+\d{1,2},\s*\d{4}|\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/);
        if (m) return parseDate(m[1]);
      }
    }
    return null;
  }

  function parseHoldings(format, rows) {
    var spec = FORMATS[format];
    if (!spec) throw new Error("index-membership: unbekanntes Format " + format);
    var r = membersFromRows(rows, spec);
    if (!r.asOf) r.asOf = asOfFromPreamble(rows);
    return r;
  }

  /* ----------------------------------------------------- Zuordnung */
  /* Emittenten schreiben "BRKB", "BRK.B" oder "BRK/B"; der Company Master
     "BRK-B". Zugeordnet wird ueber den Ticker ohne Trennzeichen - und nur,
     wenn diese Form im Master eindeutig ist. Mehrdeutig oder unbekannt
     heisst: nicht zugeordnet und in der Datei benannt. Das ist keine
     Heuristik ueber die Mitgliedschaft (die kommt aus dem Bestand), nur
     die Schreibweise desselben Tickers. */
  function tickerKey(t) { return String(t || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }

  function buildMatcher(securities) {
    var exact = {}, lose = {}, mehrdeutig = {};
    (securities || []).forEach(function (s) {
      var t = String(s.ticker || "").toUpperCase();
      exact[t] = s;
      var k = tickerKey(t);
      if (lose[k] && lose[k].ticker !== t) mehrdeutig[k] = true;
      lose[k] = s;
    });
    return function (ticker) {
      var t = String(ticker || "").toUpperCase();
      if (exact[t]) return { security: exact[t], how: "EXACT" };
      var k = tickerKey(t);
      if (mehrdeutig[k]) return { security: null, how: "AMBIGUOUS" };
      if (lose[k]) return { security: lose[k], how: "SEPARATOR" };
      return { security: null, how: "UNKNOWN" };
    };
  }

  /**
   * Bestand -> Mitgliedschaftsdatei.
   * @param {object} input {indexId, indexName, proxy:{etf, issuer, url, format}, holdings:{members, asOf},
   *                        securities, fetchedAt, previous (Vorstand oder null)}
   */
  function build(input) {
    var match = buildMatcher(input.securities);
    var members = [], unmatched = [], bySymbol = {};
    (input.holdings.members || []).forEach(function (m) {
      var z = match(m.ticker);
      if (!z.security) { unmatched.push({ ticker: m.ticker, name: m.name, reason: z.how }); return; }
      if (bySymbol[z.security.ticker]) return;
      bySymbol[z.security.ticker] = true;
      members.push({ symbol: z.security.ticker, securityId: z.security.securityId, name: m.name,
                     weight: m.weight, sector: m.sector || null, matched: z.how, sourceTicker: m.ticker });
    });
    members.sort(function (a, b) { return (b.weight || 0) - (a.weight || 0) || (a.symbol < b.symbol ? -1 : 1); });
    var asOf = input.holdings.asOf || (input.fetchedAt ? String(input.fetchedAt).slice(0, 10) : null);
    var out = {
      schemaVersion: SCHEMA, engineVersion: ENGINE_VERSION,
      indexId: input.indexId, indexName: input.indexName,
      source: input.proxy.format === "NASDAQ_API_JSON" ? "INDEX_OWNER_API" : "ETF_HOLDINGS",
      proxy: { etf: input.proxy.etf || null, issuer: input.proxy.issuer, url: input.proxy.url, format: input.proxy.format },
      asOf: asOf, asOfSource: input.holdings.asOf ? "HOLDINGS_FILE" : "FETCH_DATE",
      fetchedAt: input.fetchedAt || null,
      holdingsCount: (input.holdings.members || []).length,
      memberCount: members.length, unmatchedCount: unmatched.length,
      members: members, unmatched: unmatched,
      changes: input.previous ? diff(input.previous, members) : null,
      note: input.indexName + ": Mitgliedschaft laut " + (input.proxy.etf ? "veroeffentlichtem Bestand des abbildenden Fonds " + input.proxy.etf + " (" + input.proxy.issuer + ")"
                                                                 : "Liste des Indexeigentuemers (" + input.proxy.issuer + ")") + " zum Stichtag " + asOf + ". Zuordnung zum Company Master ueber den Ticker " +
            "(Trennzeichen ignoriert, nur bei Eindeutigkeit). Keine Ticker-Heuristik ueber die Mitgliedschaft selbst; " +
            "nicht zuordenbare Bestandszeilen stehen unter unmatched. Indexnamen sind Marken ihrer Eigentuemer; " +
            "die Datei nennt einen Fondsbestand, keine offizielle Indexliste."
    };
    return out;
  }

  /** Vorstand gegen neuen Stand: was kam hinzu, was fiel heraus. */
  function diff(previous, members) {
    var alt = {}, neu = {};
    (previous.members || []).forEach(function (m) { alt[m.symbol] = true; });
    members.forEach(function (m) { neu[m.symbol] = true; });
    return {
      previousAsOf: previous.asOf || null,
      added: members.filter(function (m) { return !alt[m.symbol]; }).map(function (m) { return m.symbol; }),
      removed: (previous.members || []).filter(function (m) { return !neu[m.symbol]; }).map(function (m) { return m.symbol; })
    };
  }

  function validate(doc, opts) {
    opts = opts || {};
    var f = [];
    if (!doc || doc.schemaVersion !== SCHEMA) f.push("schemaVersion");
    if (!doc || !doc.indexId) f.push("indexId");
    if (!doc || !/^\d{4}-\d{2}-\d{2}$/.test(String(doc.asOf))) f.push("asOf");
    if (!doc || !doc.proxy || !doc.proxy.etf || !doc.proxy.url) f.push("proxy");
    if (!doc || !Array.isArray(doc.members)) f.push("members");
    else {
      var min = opts.minMembers || 0;
      if (doc.members.length < min) f.push("nur " + doc.members.length + " Mitglieder (mindestens " + min + ")");
      var seen = {};
      doc.members.forEach(function (m, i) {
        if (!m.symbol || !m.securityId) f.push("Mitglied " + i + " ohne symbol/securityId");
        if (seen[m.symbol]) f.push("doppelt: " + m.symbol);
        seen[m.symbol] = true;
      });
    }
    return { ok: f.length === 0, findings: f };
  }

  var api = { ENGINE_VERSION: ENGINE_VERSION, SCHEMA: SCHEMA, FORMATS: FORMATS,
              parseCsv: parseCsv, parseHoldings: parseHoldings, membersFromRows: membersFromRows,
              buildMatcher: buildMatcher, tickerKey: tickerKey, build: build, diff: diff, validate: validate,
              parseDate: parseDate, rowsFromNasdaqJson: rowsFromNasdaqJson };
  if (isNode) module.exports = api;
  else {
    global.VUQuant = global.VUQuant || {};
    global.VUQuant.IndexMembership = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
