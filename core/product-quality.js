/* PQ: Zustandspruefungen der veroeffentlichten Produktartefakte (frueher rote Tests, Owner-Auftrag 10.11.2026,
   docs/quality/TESTARTEN.md). Reine Funktionen ueber geladene Artefakte; meldend (WARN), nie blockierend.
   Gleiche Erwartungen wie die Tests, aus denen sie stammen. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.VUCore = root.VUCore || {}; root.VUCore.ProductQuality = api;
})(globalThis, function () {
  'use strict';
  function result(id, title, checked, findings, note) {
    return { id, title, severity: 'WARN', status: findings.length ? 'FAIL' : 'PASS', checked, failed: findings.length,
      findings, samples: findings.slice(0, 25), note: checked ? (note || null) : 'Keine prüfbaren Quelldaten vorhanden.' };
  }
  const SCHEMAS = ['universe-list-1.0.0', 'universe-list-1.1.0', 'universe-list-1.2.0', 'universe-list-1.3.0'];

  /** DQ-PQ-1 (aus quant/tests/universe-list): das Verzeichnis nennt seine Deckung und erfindet keinen Kurs. */
  function universeList(index, today, factorReasons) {
    if (!index) return result('DQ-PQ-1', 'Aktienverzeichnis: Deckung, Kurse, Namen, Bewertungsgrund', 0, []);
    const f = [], c = index.coverage || {}, entries = index.entries || [];
    if (!SCHEMAS.includes(index.schemaVersion)) f.push('unbekannte Fassung ' + index.schemaVersion);
    if (!(c.universe > 6000)) f.push('Universum nur ' + c.universe);
    if (!(c.withPrice > 5000)) f.push('nur ' + c.withPrice + ' Kurse im Verzeichnis');
    if (!(c.withName > 4000)) f.push('nur ' + c.withName + ' Namen im Verzeichnis');
    if (entries.length !== c.entries) f.push('entries ' + entries.length + ' != coverage.entries ' + c.entries);
    let mitKurs = 0, mitName = 0, mitGrund = 0;
    for (const e of entries) {
      if (!/^[A-Z0-9.-]{1,12}$/.test(e.s)) f.push(e.s + ': Ticker-Form');
      if (e.c !== undefined) {
        mitKurs++;
        if (!(Number.isFinite(e.c) && e.c > 0)) f.push(e.s + ': Kurs ist keine Zahl');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(e.d || '')) f.push(e.s + ': Kurs ohne Datum');
        else if (e.d > today) f.push(e.s + ': Kurs aus der Zukunft');
      }
      if (e.n !== undefined) { mitName++; if (e.n === e.s) f.push(e.s + ': Name ist der Ticker'); }
      if (e.c === undefined && e.n === undefined) f.push(e.s + ': Eintrag ohne Kurs und ohne Namen');
      if (e.v !== undefined && index.schemaVersion !== 'universe-list-1.0.0') {
        mitGrund++;
        const known = (factorReasons || []).includes(e.v) || e.v === 'NO_PIT_SHARE_COUNT' || e.v === 'NO_PUBLISHED_CLOSE';
        if (factorReasons && !known) f.push(e.s + ": unbekannter Bewertungsgrund '" + e.v + "'");
        if (e.v === 'SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING' && !(Number.isFinite(e.il) && e.il > 1)) f.push(e.s + ': zurückgehalten wegen mehrerer Notierungen, aber ' + e.il + ' gemeldet');
      }
    }
    if (mitKurs !== c.withPrice) f.push('withPrice ' + c.withPrice + ' != gezählt ' + mitKurs);
    if (mitName !== c.withName) f.push('withName ' + c.withName + ' != gezählt ' + mitName);
    if (index.schemaVersion !== 'universe-list-1.0.0') {
      if (mitGrund !== c.withValuationReason) f.push('withValuationReason ' + c.withValuationReason + ' != gezählt ' + mitGrund);
      if (!(mitGrund > 0)) f.push('kein einziger Bewertungsgrund im Verzeichnis');
    }
    return result('DQ-PQ-1', 'Aktienverzeichnis: Deckung, Kurse, Namen, Bewertungsgrund', entries.length, f);
  }

  /** DQ-PQ-2 (aus quant/tests/market-data R3): der Statusbericht behauptet nie mehr, als vorhanden ist. */
  function marketStatus(status, modes) {
    if (!status) return result('DQ-PQ-2', 'Marktdaten-Statusbericht behauptet nicht mehr als vorhanden', 0, []);
    const f = [];
    if (!modes.includes(status.dataMode)) f.push('unbekannter Modus ' + status.dataMode);
    if (!status.configured) {
      if (status.dataMode !== 'mock') f.push('ohne Zugang gibt es nur den Mock-Modus');
      if (!/Keine .*Kursdaten/.test(status.notice || '')) f.push('der Hinweis benennt nicht, dass keine Kurse vorliegen');
      if (/Mock-Modus|Modelluniversum|synthetisch/i.test(status.notice || '')) f.push('der Hinweis spricht von Mock/Modelluniversum');
      if (!status.publicDataState || status.publicDataState.mode !== 'UNAVAILABLE') f.push('publicDataState.mode != UNAVAILABLE');
    }
    if (/apikey/i.test(JSON.stringify(status))) f.push('Zugangsdaten im Statusbericht');
    if (!status.boundary) f.push('die Grenze zwischen echt und synthetisch fehlt');
    return result('DQ-PQ-2', 'Marktdaten-Statusbericht behauptet nicht mehr als vorhanden', 1, f);
  }

  /** DQ-PQ-3 (aus quant/tests/benchmark-reference): SPY steht in keinem Produkt- oder Gate-Universum. */
  function benchmarkNotInUniverse(lists) {
    const isSpy = x => x && (x.securityId === 'ref_SPY' || x.ticker === 'SPY' || x.s === 'SPY' || x.m === 'ref_SPY');
    const f = []; let checked = 0;
    for (const [name, rows] of Object.entries(lists)) {
      if (!Array.isArray(rows)) continue;
      checked++;
      if (rows.some(isSpy)) f.push('SPY in ' + name);
    }
    const pu = lists.Produktuniversum, mf = lists.Marktfaehigkeit;
    if (Array.isArray(pu) && Array.isArray(mf) && pu.length !== mf.length) f.push('Marktfähigkeit (' + mf.length + ') und Produktuniversum (' + pu.length + ') sind nicht dieselbe Menge');
    return result('DQ-PQ-3', 'Benchmark SPY steht in keiner Produkt- oder Gate-Liste', checked, f);
  }

  /** DQ-PQ-4 (aus quant/tests/observation-extension): die Beobachtungs-Zusammenfassung traegt ihre Drift-Form, sobald das Feld da ist. */
  function observationSummary(summary) {
    if (!summary) return result('DQ-PQ-4', 'Setup-Beobachtungen: Drift-Feld der Zusammenfassung', 0, []);
    const d = summary.observationDrift, f = [];
    if (d) {
      if (d.asOf !== summary.asOf) f.push('observationDrift.asOf ' + d.asOf + ' != asOf ' + summary.asOf);
      if (!/nicht durch eine heutige Neuberechnung ersetzt/.test(d.note || '')) f.push('Hinweis fehlt: veröffentlichte Beobachtung bleibt stehen');
      if (!Number.isFinite(d.rowsPublished)) f.push('rowsPublished keine Zahl');
      if (!Number.isFinite(d.rowsToday)) f.push('rowsToday keine Zahl');
    }
    return result('DQ-PQ-4', 'Setup-Beobachtungen: Drift-Feld der Zusammenfassung', d ? 1 : 0, f, d ? null : 'Feld observationDrift noch nicht geschrieben.');
  }

  /** DQ-PQ-5 (aus quant/tests/sec-universe-scale): ETFs und Fonds kommen nicht ins SEC-Universum. */
  function secUniverse(payload) {
    if (!payload) return result('DQ-PQ-5', 'SEC-Universum: ETFs/Fonds ausgeschlossen, Validierungssatz benannt', 0, []);
    const f = [], ex = payload.totals && payload.totals.excluded;
    if (!(ex && ex.wrongType >= 0)) f.push('totals.excluded.wrongType fehlt oder negativ');
    if (!/Validierungssatz/.test(payload.description || '')) f.push('Beschreibung nennt den Validierungssatz nicht');
    return result('DQ-PQ-5', 'SEC-Universum: ETFs/Fonds ausgeschlossen, Validierungssatz benannt', 1, f);
  }

  /** DQ-PQ-6 (aus quant/tests/ti-mission4 M4-4): Elliott-v3-Veroeffentlichung traegt Methodenschluessel und die Engine-Version der Produktion. */
  function technicalV3(art, engineVersion) {
    if (!art || (!art.index && !art.meta && !art.shard)) return result('DQ-PQ-6', 'Technical v3: Methodenschlüssel, Engine- und Datenversionen', 0, []);
    const f = [];
    if (art.index && !(art.index.methodologyKey && /elliott/.test(art.index.methodologyKey))) f.push('index.json.gz ohne methodologyKey');
    if (art.meta) {
      const e = art.meta.elliott || {};
      if (e.engine !== 'v3') f.push('meta.elliott.engine ist ' + e.engine);
      if (e.confluenceWeight !== 0) f.push('meta.elliott.confluenceWeight ist ' + e.confluenceWeight);
      if (e.status !== 'EXPERIMENTAL_STRUCTURE_MODEL') f.push('meta.elliott.status ist ' + e.status);
    }
    if (art.shard) {
      const one = Object.values(art.shard)[0], v = one && one.versions;
      if (!v) f.push('Shard ohne versions');
      else {
        if (v.elliott !== engineVersion) f.push('Shard-Daten stammen nicht von der aktuellen Engine (' + v.elliott + ' != ' + engineVersion + ') – neu bauen');
        if (!(v.ruleSet && v.dataAsOf && v.api)) f.push('versions ohne ruleSet/dataAsOf/api');
        if (v.elliottStatus !== 'EXPERIMENTAL_STRUCTURE_MODEL') f.push('versions.elliottStatus ist ' + v.elliottStatus);
      }
    }
    return result('DQ-PQ-6', 'Technical v3: Methodenschlüssel, Engine- und Datenversionen', 1, f);
  }

  /** DQ-PQ-7 (aus quant/tests/security-master-duplicate-resolution): jede Serie, auf die das Doppelzeilen-Register zeigt, liegt im Repository. */
  function duplicateResolutionSeries(records, exists) {
    if (!Array.isArray(records)) return result('DQ-PQ-7', 'Doppelzeilen-Register: Serien vorhanden', 0, []);
    const f = records.filter(r => !(r && r.series && r.series.file && exists(r.series.file))).map(r => (r && r.securityId) + ': Serie fehlt (' + (r && r.series && r.series.file) + ')');
    return result('DQ-PQ-7', 'Doppelzeilen-Register: Serien vorhanden', records.length, f);
  }

  /** DQ-PQ-8 (aus discover/tests/global-search-lazy-europe): die ausgelieferte Suchdatei enthaelt die Pflichttitel gemeinsam (US und Europa).
      `search(index, query)` liefert die Treffer (core/discover-universe.js mit Europa-Freigabe), `cases` sind [Suchwort, erwartete Region]. */
  function requiredSearchTitles(index, search, cases) {
    if (!index || !Array.isArray(index.entries)) return result('DQ-PQ-8', 'Suchdatei: Pflichttitel gemeinsam auffindbar', 0, []);
    const f = [], us = index.entries.filter(d => d.region === 'US').length, eu = index.entries.filter(d => d.region === 'EUROPE').length;
    if (!(us > 400 && eu > 400)) f.push('beide Regionen im selben Index: US ' + us + ', Europa ' + eu);
    for (const [query, region] of cases) {
      const hits = search(index, query);
      if (!hits.length) f.push(query + ' nicht auffindbar');
      else if (hits[0].region !== region) f.push(query + ': erster Treffer ' + hits[0].n + ' (' + hits[0].region + ', erwartet ' + region + ')');
    }
    return result('DQ-PQ-8', 'Suchdatei: Pflichttitel gemeinsam auffindbar', cases.length + 1, f);
  }

  /** DQ-PQ-9 (aus quant/tests/total-return-verification): die committete Total-Return-Messung traegt ein Urteil, das zu ihrer eigenen Evidenz passt. */
  function totalReturnMeasurement(cur) {
    if (!cur) return result('DQ-PQ-9', 'Total-Return-Messung: Urteil passt zur Evidenz', 0, []);
    const f = [], series = cur.series || [], sum = k => series.reduce((n, s) => n + s[k], 0);
    if (cur.schemaVersion !== 'total-return-verification-1.0.0') f.push('schemaVersion ' + cur.schemaVersion);
    if (cur.tolerance !== 0.002) f.push('tolerance ' + cur.tolerance);
    if (!(Number.isInteger(cur.minimumEvents) && cur.minimumEvents > 0)) f.push('minimumEvents ungueltig');
    if (cur.seriesChecked !== series.length) f.push('seriesChecked ' + cur.seriesChecked + ' != ' + series.length);
    if (cur.dividendEventsChecked !== sum('dividendEvents')) f.push('dividendEventsChecked passt nicht zur Summe');
    if (cur.dividendEventsMatching !== sum('matching')) f.push('dividendEventsMatching passt nicht zur Summe');
    if (!(cur.dividendEventsMatching >= 0 && cur.dividendEventsMatching <= cur.dividendEventsChecked)) f.push('matching ausserhalb 0..checked');
    for (const row of series) {
      if ((row.mismatches || []).length !== row.dividendEvents - row.matching) f.push((row.ticker || row.securityId) + ': mismatches passen nicht zu dividendEvents - matching');
      for (const e of row.mismatches || []) if (!(e.error >= cur.tolerance)) f.push((row.ticker || row.securityId) + ': Abweichung unter der Toleranz als Mismatch gezaehlt');
    }
    const expected = cur.dividendEventsChecked < cur.minimumEvents ? 'INSUFFICIENT_EVIDENCE'
      : cur.dividendEventsMatching === cur.dividendEventsChecked ? 'TOTAL_RETURN_CONFIRMED'
      : cur.dividendEventsMatching === 0 ? 'SPLIT_ADJUSTED_ONLY' : 'INCONSISTENT';
    if (cur.verdict !== expected) f.push('Urteil ' + cur.verdict + ', Evidenz ergibt ' + expected);
    if (cur.verdict === 'TOTAL_RETURN_CONFIRMED' && !(cur.worstRelativeError < cur.tolerance)) f.push('bestaetigt, aber worstRelativeError >= tolerance');
    return result('DQ-PQ-9', 'Total-Return-Messung: Urteil passt zur Evidenz', 1, f);
  }

  return { universeList, marketStatus, benchmarkNotInUniverse, observationSummary, secUniverse, technicalV3, duplicateResolutionSeries, requiredSearchTitles, totalReturnMeasurement };
});
