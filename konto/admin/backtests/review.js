/* =========================================================================
   VISION UNIVERSE — konto/admin/backtests/review.js
   Interne Backtest-Vorschau (nur Rolle backtest_reviewer, standardmaessig aus;
   docs/quant/BACKTEST_PREVIEW.md Abschnitt 9). ENTWURF, nicht verlinkt.

   Die Seite rechnet nichts und entscheidet nichts: Berechtigung, Aktivierung,
   Auswahlregeln und Zahlen kommen ausschliesslich vom Konto-Worker
   (/v1/admin/backtests, /v1/admin/backtests/lookup). Eine nicht vorgerechnete
   Auswahl heisst "nicht vorgerechnet". Jede Zahl steht mit Bezeichnung,
   Nachweisart und den Grenzen; Grenzen und Zertifizierungsstand erscheinen
   immer. Daten nur per textContent (kein innerHTML).
   UMD: Browser (globalThis.VUBacktestReview) und Node-Tests.
   ========================================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VUBacktestReview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var KIND_LABEL = {
    SAME_STOCK_REPLAY: 'Rückblick derselben Aktie', PATTERN_EVIDENCE: 'Marktweite Muster', SIGNAL_BACKTEST: 'Signal-Backtest',
    SETUP_BACKTEST: 'Setup-Backtest', STRATEGY_BACKTEST: 'Strategie-Backtest', FACTOR_RANKING_BACKTEST: 'Faktor-Ranking'
  };
  var COST_LABEL = {NONE: 'keine Kosten', STANDARD: 'Standard (5 + 5 Bp je Seite)', HIGH: 'hoch (20 + 20 Bp je Seite)'};
  var MESSAGES = {
    NOT_BACKTEST_REVIEWER: 'Für die interne Backtest-Vorschau hat dein Konto keine Berechtigung.',
    PREVIEW_NOT_ACTIVATED: 'Die interne Backtest-Vorschau ist nicht eingeschaltet.',
    BACKTEST_BUNDLE_INVALID: 'Die Daten der Vorschau sind nicht gültig. Es wird nichts angezeigt.',
    SELECTION_REJECTED: 'Diese Auswahl ist nicht zulässig.'
  };
  var SELECTION_ORDER = ['schemaVersion', 'template', 'window', 'costPreset', 'benchmark', 'ruleIds', 'factorId', 'methods'];

  // ------------------------------------------------------------ Formatierung (nur Anzeige)
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function pct(x) {
    return isNum(x) ? new Intl.NumberFormat('de-DE', {style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1}).format(x) : '–';
  }
  function dec(x, digits) {
    return isNum(x) ? new Intl.NumberFormat('de-DE', {minimumFractionDigits: digits, maximumFractionDigits: digits}).format(x) : '–';
  }
  function int(x) { return isNum(x) ? new Intl.NumberFormat('de-DE', {maximumFractionDigits: 0}).format(x) : '–'; }
  function str(x) { return x === null || x === undefined || x === '' ? '–' : String(x); }
  function period(p) { return p ? str(p.from) + ' bis ' + str(p.to) + (p.asOf ? ' (Datenstand ' + p.asOf + ')' : '') : '–'; }

  function message(state, fallback) { return MESSAGES[state] || fallback; }

  // ------------------------------------------------------------ Auswahl aus dem Formular
  /* Reihenfolge der Schluessel wie im registrierten Raster (die Auswahl geht in die Spec-ID ein).
     Leere Werte ("wie Vorlage") werden weggelassen. Ob eine Auswahl zulaessig ist, prueft nur der Server. */
  function selection(values, schemaVersion) {
    var out = {schemaVersion: schemaVersion, template: values.template};
    if (values.from || values.to) out.window = {from: values.from || '', to: values.to || ''};
    if (values.costPreset) out.costPreset = values.costPreset;
    if (values.benchmark) out.benchmark = values.benchmark;
    if (values.ruleIds && values.ruleIds.length) out.ruleIds = values.ruleIds.slice();
    if (values.factorId) out.factorId = values.factorId;
    if (values.methods) out.methods = values.methods;
    var ordered = {};
    SELECTION_ORDER.forEach(function (k) { if (out[k] !== undefined) ordered[k] = out[k]; });
    return ordered;
  }

  // ------------------------------------------------------------ Modelle (rein: Serverdaten -> Zeilen)
  function frameModel(d) {
    var art = d.certificationArtifact || {};
    return {
      limits: (d.limits || []).slice(),
      certification: [
        'Zertifizierung: ' + str(d.certification) + ' · productionApproved: ' + String(d.productionApproved === true) +
          ' · öffentlich: ' + String(d.publiclyActivated === true),
        'Zertifizierte Arten laut Artefakt: ' + ((art.certifiedKinds || []).length ? art.certifiedKinds.join(', ') : 'keine'),
        'Aussage: ' + str(d.claim) + ' · Security Master: ' + str(d.masterGeneration),
        'Katalog ' + str(d.catalogHash).slice(0, 12) + ' · Lesemodell ' + str(d.previewHash).slice(0, 12) + ' · Paket ' + str(d.bundleHash).slice(0, 12)
      ]
    };
  }

  function overviewModel(d) {
    return (d.kinds || []).map(function (k) {
      var c = k.certification || {};
      return [KIND_LABEL[k.kind] || str(k.kind), str(k.stateLabel), str(c.status) + ' / ' + str(c.readiness) + ' · ' + str(c.reason),
        String((k.cases || []).length), String((k.dataQualityLimits || []).length)];
    });
  }

  /* Ergebnis einer Nachschlage-Antwort. Jede Zahlenzeile: [Bezeichnung, Wert, Nachweisart, Grundlage]. */
  function resultModel(d) {
    var frame = frameModel(d);
    if (d.state !== 'PRECOMPUTED') {
      var not = d.state === 'NOT_PRECOMPUTED';
      return {state: not ? 'NOT_PRECOMPUTED' : 'UNAVAILABLE', title: not ? 'nicht vorgerechnet' : 'nicht verfügbar', badge: not ? 'nicht vorgerechnet' : 'kein Ergebnis',
        lines: not ? ['Für diese Auswahl gibt es kein vorgerechnetes Ergebnis. Es wird nichts gerechnet und nichts angezeigt.',
          'Art: ' + (KIND_LABEL[d.kind] || str(d.kind)) + ' · Vorlage: ' + str(d.template) + ' · specHash ' + str(d.specHash).slice(0, 12)]
          : ['Der Server hat kein Ergebnis geliefert. Es wird nichts angezeigt.'],
        sections: [], limits: frame.limits, certification: frame.certification};
    }
    var e = d.entry, x = e.display || {}, m = x.metrics || {}, ev = (e.evidence && e.evidence.label) || '–', basis = str(m.basis);
    function row(label, value, base) { return [label, value, ev, base === undefined ? basis : base]; }
    var per = m.perEvent || {}, risk = x.risk || {}, unc = x.uncertainty || {}, costs = x.costs || {}, model = costs.model || {}, sel = costs.selected || {};
    var bm = x.benchmark || {}, def = bm.definition || {}, exc = bm.excess || {}, dq = x.dataQuality || {}, cov = dq.coverage || {};
    var pop = x.population || {}, ca = dq.corporateActions || {}, ev2 = x.events || {};
    var sections = [
      {title: 'Rendite', rows: [row('Gesamtrendite', pct(m.totalReturn)), row('Rendite p. a. (CAGR)', pct(m.cagr)),
        row('Trefferquote', pct(m.hitRate)), row('Median je Ereignis', pct(per.median), 'PER_EVENT'), row('Mittelwert je Ereignis', pct(per.mean), 'PER_EVENT')]
        .concat((m.annualReturns || []).map(function (a) { return row('Jahresrendite ' + str(a.year) + (a.partial ? ' (Teiljahr)' : ''), pct(a.value)); }))},
      {title: 'Risiko und Drawdown', rows: [row('Volatilität p. a.', pct(m.volatility)), row('Maximaler Drawdown', pct(m.maxDrawdown)),
        row('Sharpe (risikofreier Zins ' + (risk.sharpeRiskFreeLabel === 'ASSUMPTION_ZERO_DEFAULT' ? '0 %, Annahme' : str(risk.sharpeRiskFreeLabel)) + ')', dec(risk.sharpe, 2)),
        row('Drawdown-Dauer (Tage)', int(risk.durationDays)), row('Erholt', risk.recovered === undefined ? '–' : risk.recovered ? 'ja' : 'nein'),
        row('Unsicherheit (' + (isNum(unc.level) ? pct(unc.level) : '–') + ', ' + str(unc.method) + ')',
          unc.interval ? pct(unc.interval[0]) + ' bis ' + pct(unc.interval[1]) : '–', 'PER_EVENT')]},
      {title: 'Kosten', rows: [row('Gebühr je Seite (Bp)', int(sel.feeBps), 'Auswahl'), row('Slippage je Seite (Bp)', int(sel.slippageBps), 'Auswahl'),
        row('Kostenmodell', str(model.model), 'Auswahl'), row('Gezahlte Kosten (Portfolio)', isNum(model.paid) ? dec(model.paid, 2) : '–'),
        row('Umschlag', isNum(m.turnover) ? dec(m.turnover, 2) : '–'), row('Trades / Ereignisse', int(m.trades))]},
      {title: 'Benchmark', rows: [row('Angefordert', str(bm.requested), 'Auswahl'), row('Definition', str(def.id) + ' · ' + str(def.returnBasis), 'Benchmark'),
        row('Benchmark-Gesamtrendite', pct(def.totalReturn), 'Benchmark'), row('Benchmark CAGR', pct(def.cagr), 'Benchmark'),
        row('Mittlere Abweichung zur Benchmark', pct(exc.meanExcess)), row('Anzahl (Abweichung)', int(exc.n))]},
      {title: 'Datenqualität und Abdeckung', rows: [row('Renditebasis', str(dq.totalReturnBasis), 'Daten'),
        row('Abdeckung', isNum(cov.share) ? pct(cov.share) + ' (' + int(cov.numerator) + ' von ' + int(cov.denominator) + ')' : '–', 'Daten'),
        row('Zensiert', int(dq.censored), 'Daten'), row('Endzustand', str(dq.terminal && dq.terminal.state), 'Daten'),
        row('Überlebende', str(dq.survivorship && dq.survivorship.state), 'Daten'),
        row('Kapitalmaßnahmen', int(ca.listings) + ' Titel, ' + int(ca.listingsWithSplitsInWindow) + ' mit Split im Fenster', 'Daten'),
        row('Warnungen', String((dq.warnings || []).length), 'Daten')]},
      {title: 'Historische Population', rows: [row('Profil', str(pop.profile), 'Population'), row('Titel', int(pop.listings), 'Population'),
        row('Ausgeschlossen', int(pop.excluded), 'Population'), row('Kalender', pop.calendar ? str(pop.calendar.first) + ' bis ' + str(pop.calendar.last) : '–', 'Population'),
        row('Private Eingaben', (pop.privateInputs || []).length ? pop.privateInputs.join(', ') : 'keine', 'Population'),
        row('Ereignisse (abgeschlossen / gesamt)', int(ev2.completed) + ' / ' + int(ev2.occurrences), 'Population'),
        row('Tickers', (pop.tickers || []).length ? pop.tickers.join(', ') : '–', 'Population')]}
    ];
    return {
      state: 'PRECOMPUTED', title: str(e.label) + ' · ' + (KIND_LABEL[e.kind] || str(e.kind)), badge: ev,
      lines: ['Zustand: ' + str((d.stateLabels || {})[e.stateCode] || e.stateCode) + ' · Zertifizierung der Art: ' + str(e.certificationStatus),
        'Zeitraum: ' + period(x.period) + ' · Vorlage: ' + str(e.template) + ' · specHash ' + str(e.specHash).slice(0, 12),
        'Methoden: ' + ((x.methods || []).map(function (q) { return q.method + ' ' + q.state; }).join(', ') || '–'),
        'Fehlende Eingaben: ' + ((e.missingInputs || []).length ? e.missingInputs.join('; ') : 'keine')],
      sections: sections,
      notes: (x.limitations || []).concat(dq.warnings || []),
      limits: frame.limits, certification: frame.certification
    };
  }

  // ------------------------------------------------------------ DOM (nur createElement/textContent)
  function el(doc, tag, attrs, children) {
    var n = doc.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'className') n.className = attrs[k];
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) n.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function clear(n) { n.textContent = ''; return n; }
  function list(doc, items) { return el(doc, 'ul', {className: 'ka-features'}, items.map(function (t) { return el(doc, 'li', {text: t}); })); }
  function table(doc, head, rows) {
    return el(doc, 'div', {className: 'ka-table-wrap'}, [el(doc, 'table', {className: 'ka-table'}, [
      el(doc, 'thead', {}, [el(doc, 'tr', {}, head.map(function (h, i) { return el(doc, 'th', {scope: 'col', className: i === 1 ? 'num' : null, text: h}); }))]),
      el(doc, 'tbody', {}, rows.map(function (r) { return el(doc, 'tr', {}, r.map(function (c, i) { return el(doc, 'td', {className: i === 1 ? 'num' : null, text: c}); })); }))])]);
  }

  function renderFrame(doc, mount, frame) {
    clear(mount);
    mount.appendChild(el(doc, 'h3', {text: 'Grenzen'}));
    mount.appendChild(list(doc, frame.limits));
    mount.appendChild(el(doc, 'h3', {text: 'Zertifizierung'}));
    mount.appendChild(list(doc, frame.certification));
  }

  function renderResult(doc, mount, model) {
    clear(mount);
    mount.setAttribute('data-state', model.state);
    mount.appendChild(el(doc, 'h2', {text: model.title}));
    mount.appendChild(el(doc, 'p', {}, [el(doc, 'span', {className: 'ka-badge', 'data-tone': model.state === 'PRECOMPUTED' ? 'warn' : 'muted', text: model.badge})]));
    model.lines.forEach(function (t) { mount.appendChild(el(doc, 'p', {className: 'ka-muted', text: t})); });
    model.sections.forEach(function (s) {
      mount.appendChild(el(doc, 'h3', {text: s.title}));
      mount.appendChild(table(doc, ['Kennzahl', 'Wert', 'Nachweisart', 'Grundlage'], s.rows));
    });
    if (model.notes && model.notes.length) {
      mount.appendChild(el(doc, 'h3', {text: 'Einschränkungen dieses Ergebnisses'}));
      mount.appendChild(list(doc, model.notes));
    }
    var limits = el(doc, 'div', {'data-limits': true});
    renderFrame(doc, limits, model);
    mount.appendChild(limits);
  }

  function option(doc, value, text) { return el(doc, 'option', {value: value, text: text}); }

  // ------------------------------------------------------------ Steuerung
  /* opts: {api, doc, requireSession, notice, disableForms}. Ohne Sitzung keine Anfrage an /v1/admin/backtests. */
  function start(opts) {
    var A = opts.api, doc = opts.doc, $ = function (id) { return doc.getElementById(id); };
    var data = null;
    function fail(r) { opts.notice(message(r.state, A.message(r.state)) + (r.data && r.data.detail ? ' (' + r.data.detail + ')' : ''), 'error'); }
    function templatesOf(kind) { return data.menu.templates.filter(function (t) { return t.kind === kind; }); }
    function fillTemplates() {
      var sel = clear($('br-template')), kind = $('br-kind').value;
      templatesOf(kind).forEach(function (t) { sel.appendChild(option(doc, t.id, t.id + ' (' + t.window.from + ' bis ' + t.window.to + ')')); });
      $('br-rules-field').hidden = kind !== 'SIGNAL_BACKTEST';
      $('br-factor-field').hidden = kind !== 'FACTOR_RANKING_BACKTEST';
    }
    function fillForm() {
      var kind = clear($('br-kind'));
      data.menu.kinds.forEach(function (k) { kind.appendChild(option(doc, k, KIND_LABEL[k] || k)); });
      var cost = clear($('br-cost'));
      cost.appendChild(option(doc, '', 'wie Vorlage'));
      Object.keys(data.menu.costPresets).forEach(function (k) { cost.appendChild(option(doc, k, COST_LABEL[k] || k)); });
      var bm = clear($('br-benchmark'));
      bm.appendChild(option(doc, '', 'wie Vorlage'));
      data.menu.benchmarks.forEach(function (b) { bm.appendChild(option(doc, b, b === 'NONE' ? 'keine' : b)); });
      var rules = clear($('br-rules'));
      data.menu.signalRules.forEach(function (r) {
        rules.appendChild(el(doc, 'label', {className: 'ka-check'}, [el(doc, 'input', {type: 'checkbox', value: r, name: 'br-rule'}), el(doc, 'span', {text: r})]));
      });
      var factor = clear($('br-factor'));
      factor.appendChild(option(doc, '', 'wie Vorlage'));
      data.menu.factorIds.forEach(function (f) { factor.appendChild(option(doc, f, f)); });
      var pre = clear($('br-precomputed'));
      pre.appendChild(option(doc, '', 'eigene Auswahl'));
      data.precomputed.forEach(function (p, i) { pre.appendChild(option(doc, String(i), p.label + ' · ' + p.evidence.label)); });
      fillTemplates();
    }
    function values() {
      var rules = Array.prototype.filter.call(doc.querySelectorAll('input[name=br-rule]'), function (n) { return n.checked; }).map(function (n) { return n.value; });
      var kind = $('br-kind').value;
      return {template: $('br-template').value, from: $('br-from').value.trim(), to: $('br-to').value.trim(), costPreset: $('br-cost').value,
        benchmark: $('br-benchmark').value, ruleIds: kind === 'SIGNAL_BACKTEST' ? rules : [], factorId: kind === 'FACTOR_RANKING_BACKTEST' ? $('br-factor').value : '',
        methods: $('br-methods').value};
    }
    function lookup(sel) {
      var btn = $('br-form').querySelector('button[type=submit]');
      btn.disabled = true;
      return A.post('/v1/admin/backtests/lookup', {selection: sel}).then(function (r) {
        btn.disabled = false;
        $('br-result').hidden = false;
        if (!r.ok) {
          renderResult(doc, $('br-result'), resultModel(Object.assign({}, data, {state: 'UNAVAILABLE'})));
          return fail(r);
        }
        renderResult(doc, $('br-result'), resultModel(r.data));
        opts.notice(r.data.state === 'PRECOMPUTED' ? 'Vorgerechnetes Ergebnis geladen. Es wurde nichts neu gerechnet.' : 'Nicht vorgerechnet. Es wird nichts gerechnet.', 'info');
      });
    }
    function render(d) {
      data = d;
      $('ka-loading').hidden = true;
      $('br-wrap').hidden = false;
      renderFrame(doc, $('br-frame'), frameModel(d));
      var body = clear($('br-kinds'));
      overviewModel(d).forEach(function (r) { body.appendChild(el(doc, 'tr', {}, r.map(function (c, i) { return el(doc, 'td', {className: i >= 3 ? 'num' : null, text: c}); }))); });
      fillForm();
    }
    var bound = false;
    function bind() {
      if (bound) return;
      bound = true;
      $('br-kind').addEventListener('change', fillTemplates);
      $('br-precomputed').addEventListener('change', function () {
        var p = data && data.precomputed[Number(this.value)];
        if (this.value === '' || !p) return;
        lookup(p.selection);
      });
      $('br-form').addEventListener('submit', function (e) {
        e.preventDefault();
        if (!data) return;
        lookup(selection(values(), data.menu.schemaVersion));
      });
    }
    return opts.requireSession().then(function (user) {
      if (!user) return null;
      return A.get('/v1/admin/backtests').then(function (r) {
        $('ka-loading').hidden = true;
        if (!r.ok) { opts.disableForms(); return fail(r); }
        render(r.data);
        bind();
        return r.data;
      });
    });
  }

  return {KIND_LABEL: KIND_LABEL, MESSAGES: MESSAGES, selection: selection, frameModel: frameModel, overviewModel: overviewModel,
    resultModel: resultModel, renderResult: renderResult, renderFrame: renderFrame, start: start, pct: pct};
});
