/* Versioned catalogue of EXISTING market-factors outputs. No calculations.
 * Legacy factors.js percent/raw-close and Technical log-return definitions
 * deliberately have no aliases here. Migration requires explicit parity. */
(function (global) {
  'use strict';
  var ENGINE = 'market-factors-1.0.0';
  var entries = [];
  function add(id, field, unit, history, inputs, label, method) {
    entries.push({
      metricId: id, version: '1.0.0', owner: 'quant/engines/market-factors.js',
      engineVersion: ENGINE, field: field, unit: unit, minimumBars: history,
      inputs: inputs, timeSemantics: 'Trailing trading bars through snapshot asOf, inclusive',
      adjustmentSemantics: 'Use snapshot basis/adjustmentStatus. Engine v1 can fall back to raw per bar; reconciliation is not certified.',
      missingDataPolicy: 'Preserve fieldStatus; never replace missing with zero',
      pitEligibility: 'NOT_CERTIFIED', updateCadence: 'EOD',
      provenance: ['engineVersion', 'asOf', 'basis', 'adjustmentStatus', 'snapshotId'],
      uxMapping: { label: label, format: unit }, methodology: method
    });
  }
  [['1m','1M',21],['3m','3M',63],['6m','6M',126],['12m','12M',252]].forEach(function (h) {
    add('momentum_' + h[0], ['returns',h[1]], 'ratio', h[2]+1,
      ['eod.close','corporate_actions'], 'Kursentwicklung ' + h[0],
      'close[t] / close[t-' + h[2] + '] - 1; rounded to 6 decimals');
    add('relative_strength_' + h[0], ['relativeStrength',h[1]], 'log_return_difference', h[2]+1,
      ['eod.close','benchmark.close','corporate_actions'], 'Relative Stärke ' + h[0],
      'log(security return ratio) - log(benchmark return ratio); benchmark end <= security asOf when dates supplied; start-date alignment not certified');
  });
  [20,50,100,200].forEach(function (n) {
    add('sma'+n, ['sma'+n], 'price', n, ['eod.close','corporate_actions'],
      'Durchschnitt ' + n + ' Tage', 'Arithmetic mean of trailing '+n+' basis closes');
    add('above_sma'+n, ['priceAboveSMA'+n], 'boolean', n, ['eod.close','corporate_actions'],
      'Über '+n+'-Tage-Durchschnitt', 'Latest basis close strictly greater than SMA'+n);
    add('distance_sma'+n, ['distanceToSMA'+n], 'ratio', n, ['eod.close','corporate_actions'],
      'Abstand zum '+n+'-Tage-Durchschnitt', 'close / SMA'+n+' - 1');
  });
  add('distance_52w_high',['distanceTo52wHigh'],'ratio',252,
    ['eod.close','eod.high','corporate_actions'],'Abstand zum Jahreshoch',
    'close / maximum high over trailing 252 bars including current bar - 1; negative below high');
  add('new_52w_high',['newHigh52w'],'boolean',252,
    ['eod.high','corporate_actions'],'Neues Jahreshoch',
    'Current high >= trailing 252-bar maximum high - 1e-9; not a close-only high');
  [20,60,252].forEach(function (n) {
    add('volatility_'+n+'d',['volatility'+n+'d'],'ratio',n+1,
      ['eod.close','corporate_actions'],'Schwankung '+n+' Tage',
      'feature-store rollingStd of log returns over '+n+' bars * sqrt(252)');
  });
  add('drawdown_252d',['maxDrawdown252d'],'ratio',252,
    ['eod.close','corporate_actions'],'Größter Rückgang im Jahr',
    'Minimum close/running peak - 1 in trailing 252 bars; non-positive');
  function freeze(value) {
    Object.keys(value).forEach(function (key) {
      if (value[key] && typeof value[key] === 'object') freeze(value[key]);
    });
    return Object.freeze(value);
  }
  freeze(entries);
  var api = Object.freeze({
    version: '1.0.0', engineVersion: ENGINE, entries: entries,
    get: function (id) { return entries.find(function (m) { return m.metricId === id; }) || null; },
    affectedBy: function (inputs) {
      return entries.filter(function (m) {
        return m.inputs.some(function (input) { return inputs.indexOf(input) !== -1; });
      }).map(function (m) { return m.metricId; });
    }
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.VUMarketMetricRegistry = api;
})(typeof window !== 'undefined' ? window : globalThis);
