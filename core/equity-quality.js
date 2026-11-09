/* E8: meldende Regeln über vorhandene Artefakte; keine Produktentscheidung. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.VUCore = root.VUCore || {}; root.VUCore.EquityQuality = api;
})(globalThis, function () {
  'use strict';
  const positive = v => typeof v === 'number' && Number.isFinite(v) && v > 0;
  function rule(id, title, rows, check) {
    const findings = rows.flatMap(row => check(row).map(text => ({ ticker: row.ticker, text })));
    return { id, title, severity: 'WARN', status: findings.length ? 'FAIL' : 'PASS',
      checked: rows.length, failed: findings.length, findings,
      samples: findings.slice(0, 25).map(f => f.ticker + ': ' + f.text),
      note: rows.length ? null : 'Keine prüfbaren Quelldaten vorhanden.' };
  }
  function jumps(rows, ReturnSeries) {
    return rule('DQ-E8-1', 'Kurssprung über 50 % ohne Split', rows, r => {
      const points = r.series?.points || [];
      // Nur Ereignisse lesen, keine eigene Split-Ableitung (ADR-002).
      const events = new Map((r.splits || []).map(s => [s.date, s.factor]));
      const factors = ReturnSeries.splitFactors(points.map(p => ({ date: p[0], splitFactor: events.get(p[0]) || 1 })));
      const found = [];
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1], cur = points[i];
        if (cur[0] <= prev[0] || !positive(prev[1]) || !positive(cur[1])) continue;
        if (Math.abs(cur[1] / prev[1] - 1) > 0.5 && factors[i - 1] === factors[i])
          found.push(cur[0] + ': ' + (100 * (cur[1] / prev[1] - 1)).toFixed(1) + ' %; Verdacht Datenfehler');
      }
      return found;
    });
  }
  function logos(rows) {
    const result = rule('DQ-E8-2', 'Logo fehlt bei Börsenwert über 10 Mrd.', rows.filter(r => positive(r.marketCap) && r.marketCap > 1e10),
      r => r.logo ? [] : ['Kein Logo hinterlegt']);
    const unknown = rows.filter(r => !positive(r.marketCap)).length;
    result.note = unknown ? 'Börsenwert fehlt bei ' + unknown + ' Aktien; diese sind nicht prüfbar.' :
      result.checked ? null : 'Keine Aktie mit prüfbarem Börsenwert über 10 Mrd. USD.';
    return result;
  }
  function names(rows) {
    return rule('DQ-E8-3', 'Firmenname fehlt oder ist nur das Kürzel', rows, r => {
      const name = typeof r.name === 'string' ? r.name.trim() : '';
      return !name || name.toUpperCase() === r.ticker.toUpperCase() ? ['Firmenname fehlt oder entspricht dem Kürzel'] : [];
    });
  }
  function analysts(rows, now) {
    const today = Date.parse(new Date(now).toISOString().slice(0, 10));
    return rule('DQ-E8-4', 'Analysten-Einstufung älter als 45 Tage', rows, r => {
      const date = Date.parse(r.asOf);
      if (!Number.isFinite(date)) return ['Datum der Analysten-Einstufung fehlt oder ist ungültig'];
      return today - date > 45 * 86400000 ? ['Analysten-Einstufung vom ' + r.asOf + ' ist älter als 45 Tage'] : [];
    });
  }
  function depotPrices(rows, expected, today, PublishedClose) {
    return rule('DQ-E8-5', 'Musterdepot-Position ohne aktuellen Kurs', rows, r => {
      const p = PublishedClose.lastPoint(r.series, today);
      return !p || !expected || p.date !== expected ? ['Kein aktueller veröffentlichter Schluss für ' + (expected || 'unbekannte Sitzung') + ' (' + r.owner + ')'] : [];
    });
  }
  function stops(rows) {
    return rule('DQ-E8-6', 'Supertrader-Position ohne Stopp', rows,
      r => positive(r.stop) ? [] : ['Stopp fehlt oder ist ungültig (' + r.owner + ')']);
  }
  /* Vortagstrend. Laeuft der Bericht am selben UTC-Tag erneut (zweiter Lauf, Wiederholung), ist der
     vorige Bericht von heute; dann gilt dessen `trendBasis` (die schlanke Vortagsbasis, die er selbst
     verwendet hat). Jeder Bericht traegt seine Vortagsbasis weiter, damit der Vergleich bei
     Wiederholungen am selben Tag erhalten bleibt. */
  function withTrend(report, previous) {
    const today = report.checkedAt.slice(0, 10);
    const yesterday = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
    if (previous?.checkedAt?.slice(0, 10) === today && previous.trendBasis) previous = previous.trendBasis;
    const comparable = previous?.checkedAt?.slice(0, 10) === yesterday;
    report.trendBasis = comparable ? { checkedAt: previous.checkedAt, rules: (previous.rules || []).filter(p => String(p.id).startsWith('DQ-E8-')).map(p => ({ id: p.id, checked: p.checked, failed: p.failed })) } : null;
    report.rules.forEach(r => {
      if (!r.id.startsWith('DQ-E8-')) return;
      const old = comparable && previous.rules?.find(p => p.id === r.id);
      r.delta = old && old.checked > 0 && r.checked > 0 && Number.isInteger(old.failed) ? r.failed - old.failed : null;
    });
    return report;
  }
  function forTicker(rules, ticker) {
    return rules.flatMap(r => (r.findings || []).filter(f => f.ticker === ticker).map(f => ({ rule: r.id, title: r.title, ...f })));
  }
  return { jumps, logos, names, analysts, depotPrices, stops, withTrend, forTicker };
});
