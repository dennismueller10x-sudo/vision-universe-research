/* =========================================================================
   VISION UNIVERSE — ask/app.js   (Frag Vision Universe)

   Ablauf einer Frage:
     1  Der Nutzer schreibt oder spricht eine Frage in eigenen Worten.
     2  Der Worker (workers/vu-ask) laesst sie von Claude Haiku in eine
        Screener-Abfrage uebersetzen - mit harter Kostengrenze und einer
        Frage pro Tag. Bereits gestellte Fragen kommen kostenlos aus dem
        Cache.
     3  Die Seite zeigt, WIE die Frage verstanden wurde.
     4  Gerechnet wird hier im Browser, auf denselben Daten wie im
        Screener, verknuepft mit den Supertrader-Signalen.
     5  Was Vision Universe noch nicht kann, wird offen gesagt - und im
        Worker fuer den Lernbericht notiert.
   ========================================================================= */
(function () {
  'use strict';
  var Fields = window.VUScreenerFields, Query = window.VUScreenerQuery, Adapters = window.VUScreenerAdapters, Ask = window.VUAskEngine;

  var ENDPOINT = (meta('vu-ask-endpoint') || '').replace(/\/+$/, '');
  var TURNSTILE_KEY = meta('vu-ask-turnstile');
  var EXAMPLES = [
    'Gib mir alle Aktien mit neuem 52-Wochen-Hoch, Marktkapitalisierung über 300 Millionen, aber unter 2 Milliarden, die ins Minervini-Raster passen – mit Quant-Faktoren',
    'Wie stark ist der Free Cashflow bei Nvidia gewachsen?',
    'Welche profitablen Tech-Aktien haben im letzten halben Jahr am meisten zugelegt?',
    'Zeig mir günstig bewertete Small Caps mit wenig Schulden'
  ];

  var main = document.getElementById('ak-main');
  var adapter = Adapters.StaticUniverseAdapter();
  var signalsPromise = null;
  var turnstileToken = null;
  var quota = null;
  var busy = false;

  function meta(name) { var m = document.querySelector('meta[name="' + name + '"]'); return m ? m.getAttribute('content') : ''; }

  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') el.textContent = v;
      else if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    [].concat(kids || []).forEach(function (c) { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }

  function clientId() {
    try {
      var id = localStorage.getItem('vu-ask-client');
      if (!id) { id = Array.from(crypto.getRandomValues(new Uint8Array(12)), function (b) { return b.toString(16).padStart(2, '0'); }).join(''); localStorage.setItem('vu-ask-client', id); }
      return id;
    } catch (e) { return ''; }
  }

  function signals() {
    if (!signalsPromise) signalsPromise = fetch('/supertrader/data/signals.json', { cache: 'default' })
      .then(function (r) { if (!r.ok) throw Error('HTTP ' + r.status); return r.json(); })
      .catch(function (e) { signalsPromise = null; return null; });
    return signalsPromise;
  }

  /* ------------------------------------------------------------ Aufbau */
  var input = h('textarea', { id: 'ak-q', 'aria-label': 'Ihre Frage an Vision Universe', maxlength: '400',
    placeholder: 'Fragen Sie in eigenen Worten – z. B. „Welche kleineren Aktien stehen gerade auf einem Jahreshoch?“' });
  var sendBtn = h('button', { class: 'ak-btn ak-btn-primary', type: 'submit', text: 'Fragen' });
  var quotaEl = h('span', { class: 'ak-quota', 'aria-live': 'polite' });
  var turnstileMount = h('div', {});
  var conversation = h('div', {});
  var Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  var micBtn = Speech ? h('button', { class: 'ak-btn ak-mic', type: 'button', 'aria-pressed': 'false', 'aria-label': 'Frage sprechen', text: '🎤 Sprechen', onclick: dictate }) : null;

  var form = h('form', { class: 'ak-form', onsubmit: function (e) { e.preventDefault(); submit(); } }, [
    input,
    turnstileMount,
    h('div', { class: 'ak-form-row' }, [quotaEl, micBtn, sendBtn])
  ]);
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });

  main.appendChild(h('header', {}, [
    h('p', { class: 'ak-kicker', text: 'Frag Vision Universe · Beta' }),
    h('h1', { class: 'ak-h1', text: 'Stellen Sie Ihre Investmentfrage in eigenen Worten.' }),
    h('p', { class: 'ak-lead', text: 'Die AI übersetzt Ihre Frage in Filter – gerechnet wird ausschließlich auf den Daten von Vision Universe: Screener, Supertrader und Quant-Faktoren. Sie sehen immer zuerst, wie Ihre Frage verstanden wurde.' })
  ]));
  /* Zugangsschranke der Beta: Passwort einmal je Geraet, danach gemerkt.
     Geprueft wird im Worker - hier wird es nur mitgeschickt. */
  var accessInput = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'Zugangspasswort', placeholder: 'Zugangspasswort' });
  var accessMsg = h('p', { class: 'ak-fine', 'aria-live': 'polite' });
  var accessForm = h('form', { class: 'ak-form ak-access', hidden: true, onsubmit: function (e) {
    e.preventDefault();
    var v = accessInput.value.trim();
    if (!v) return;
    try { localStorage.setItem('vu-ask-access', v); } catch (err) {}
    access = v; accessInput.value = ''; refreshQuota();
  } }, [
    h('h3', { text: 'Beta-Zugang' }),
    h('p', { class: 'ak-fine', text: 'Die Fragefunktion ist in der Testphase passwortgeschützt.' }),
    h('div', { class: 'ak-form-row' }, [accessInput, h('button', { class: 'ak-btn ak-btn-primary', type: 'submit', text: 'Freischalten' })]),
    accessMsg
  ]);
  var access = '';
  try { access = localStorage.getItem('vu-ask-access') || ''; } catch (e) {}
  function authHeaders(extra) { var hd = Object.assign({}, extra || {}); if (access) hd['x-vu-access'] = access; return hd; }
  function lock(wrong) {
    accessForm.hidden = false; form.hidden = true;
    accessMsg.textContent = wrong ? 'Das Passwort ist nicht korrekt.' : '';
    if (wrong) { try { localStorage.removeItem('vu-ask-access'); } catch (e) {} access = ''; }
  }
  function unlock() { accessForm.hidden = true; form.hidden = false; }

  main.appendChild(accessForm);
  main.appendChild(form);
  main.appendChild(h('div', { class: 'ak-examples', 'aria-label': 'Beispielfragen' }, EXAMPLES.map(function (x) {
    return h('button', { class: 'ak-chip', type: 'button', text: x, onclick: function () { input.value = x; input.focus(); } });
  })));
  main.appendChild(h('p', { class: 'ak-fine', text: 'In der Beta ist die Zahl neuer Fragen pro Tag begrenzt; bereits gestellte Fragen werden kostenlos aus dem Archiv beantwortet. Fragen werden ohne Personenbezug gespeichert, damit wir fehlende Daten nachbauen können – bitte keine persönlichen Angaben eingeben. Keine Anlageberatung.' + (Speech ? ' Die Spracheingabe nutzt die Spracherkennung Ihres Browsers (in Chrome über Google-Server).' : '') }));
  main.appendChild(conversation);

  if (!ENDPOINT) {
    quotaEl.textContent = 'Die Fragefunktion ist noch nicht freigeschaltet.';
    sendBtn.disabled = true;
  } else {
    refreshQuota();
    if (TURNSTILE_KEY) loadTurnstile();
  }
  var initial = new URLSearchParams(location.search).get('q');
  if (initial) input.value = initial.slice(0, 400);

  function setQuota(q) {
    quota = q || quota;
    if (!quota) return;
    if (!quota.enabled) { quotaEl.textContent = 'Die Fragefunktion ist noch nicht freigeschaltet.'; sendBtn.disabled = true; return; }
    sendBtn.disabled = false;
    quotaEl.textContent = quota.remainingToday > 0
      ? 'Heute noch ' + quota.remainingToday + (quota.remainingToday === 1 ? ' neue Frage' : ' neue Fragen')
      : 'Ihre neue Frage für heute ist verbraucht – bekannte Fragen gehen weiterhin.';
  }
  function refreshQuota() {
    fetch(ENDPOINT + '/v1/quota?client=' + encodeURIComponent(clientId()), { headers: authHeaders() })
      .then(function (r) {
        if (r.status === 401) { lock(!!access); throw Error('LOCKED'); }
        if (!r.ok) throw Error('HTTP ' + r.status);
        unlock(); return r.json();
      }).then(setQuota)
      .catch(function (e) { if (e.message === 'LOCKED') return; quotaEl.textContent = 'Die Fragefunktion ist noch nicht freigeschaltet.'; sendBtn.disabled = true; });
  }

  function loadTurnstile() {
    window.vuAskTurnstileReady = function () {
      window.turnstile.render(turnstileMount, { sitekey: TURNSTILE_KEY, size: 'flexible',
        callback: function (t) { turnstileToken = t; }, 'expired-callback': function () { turnstileToken = null; } });
    };
    document.head.appendChild(h('script', { src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=vuAskTurnstileReady', async: true, defer: true }));
  }

  function dictate() {
    var rec = new Speech();
    rec.lang = 'de-DE'; rec.interimResults = true; rec.maxAlternatives = 1;
    var base = input.value ? input.value.replace(/\s*$/, ' ') : '';
    micBtn.setAttribute('aria-pressed', 'true');
    rec.onresult = function (e) {
      var text = '';
      for (var i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      input.value = (base + text).slice(0, 400);
    };
    rec.onend = rec.onerror = function () { micBtn.setAttribute('aria-pressed', 'false'); };
    rec.start();
  }

  /* ------------------------------------------------------------ Frage */
  function submit() {
    var question = input.value.replace(/\s+/g, ' ').trim();
    if (busy || !ENDPOINT || question.length < 3) return;
    busy = true; sendBtn.disabled = true;
    var turn = h('section', { class: 'ak-turn', 'aria-live': 'polite' }, [
      h('p', { class: 'ak-q', text: question }),
      h('div', { class: 'ak-state' }, [h('span', { class: 'ak-spin', 'aria-hidden': 'true' }), 'Ihre Frage wird übersetzt …'])
    ]);
    conversation.insertBefore(turn, conversation.firstChild);
    Promise.all([
      fetch(ENDPOINT + '/v1/ask', { method: 'POST', headers: authHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ question: question, clientId: clientId(), turnstileToken: turnstileToken }) })
        .then(function (r) { return r.json(); }),
      adapter.load().catch(function () { return null; })
    ]).then(function (res) {
      var answer = res[0];
      if (answer.reason === 'ACCESS_REQUIRED') { turn.remove(); lock(true); return; }
      setQuota(answer.quota);
      if (turnstileToken && window.turnstile) { window.turnstile.reset(turnstileMount); turnstileToken = null; }
      turn.lastChild.remove();
      if (!answer.ok) { turn.appendChild(card('Keine Auswertung', answer.message || 'Die Frage konnte nicht ausgewertet werden.', true)); return; }
      input.value = '';
      return render(turn, answer);
    }).catch(function () {
      turn.lastChild.remove();
      turn.appendChild(card('Keine Verbindung', 'Die Fragefunktion ist gerade nicht erreichbar. Bitte später erneut versuchen.', true));
    }).then(function () { busy = false; sendBtn.disabled = !ENDPOINT || !!(quota && !quota.enabled); });
  }

  function card(title, text, warn) {
    return h('div', { class: 'ak-card' + (warn ? ' ak-card-warn' : '') }, [h('h3', { text: title }), h('p', { text: text })]);
  }

  /* ---------------------------------------------------------- Antwort */
  function render(turn, answer) {
    var r = answer.result;
    turn.appendChild(understood(r, answer.source));

    if (r.kind === 'forecast') return turn.appendChild(card('Keine Prognosen', 'Vision Universe sagt keine Kurse voraus und gibt keine Kaufempfehlungen. Sie können aber nach Kennzahlen, Trends und Strategiesignalen suchen – zum Beispiel „Welche Aktien stehen im Weinstein-Stage-2?“'));
    if (r.kind === 'off_topic') return turn.appendChild(card('Keine Investmentfrage', 'Hier lassen sich Fragen zu Aktien, Kennzahlen und den Vision-Universe-Strategien beantworten.'));
    if (r.kind === 'unclear') return turn.appendChild(card('Nicht eindeutig', 'Die Frage ließ sich nicht sicher in Filter übersetzen. Versuchen Sie es mit einer konkreten Kennzahl, Größe oder Strategie.'));

    var ds = adapter.dataset();
    if (!ds) return turn.appendChild(card('Daten nicht verfügbar', 'Das Aktienuniversum konnte nicht geladen werden. Bitte die Seite neu laden.', true));
    if (Fields.setDictionary && ds.meta) Fields.setDictionary(ds.meta.dict || null);

    var needSignals = !!r.supertrader;
    return (needSignals ? signals() : Promise.resolve(null)).then(function (sig) {
      if (needSignals && !sig) turn.appendChild(card('Supertrader-Signale nicht geladen', 'Der Strategiestatus kann gerade nicht angezeigt werden.', true));
      if (r.kind === 'stock') turn.appendChild(stockBlock(Ask.runStock(ds, r, sig)));
      else {
        /* Die Abfrage wird hier noch einmal geprueft - der Browser rechnet
           nur, was die Screener-Validierung durchlaesst. */
        var limit = r.query.limit;
        r.query = Query.validate(r.query); r.query.limit = limit;
        turn.appendChild(screenBlock(Ask.runScreen(ds, r, sig), r));
      }
    });
  }

  function understood(r, source) {
    var rules = [];
    if (r.query) Query.filters(r.query).forEach(function (f) { rules.push(Fields.describeFilter(f)); });
    if (r.supertrader) rules.push((r.supertrader.mode === 'require' ? 'Erfüllt: ' : 'Status: ') + Ask.STRATEGY_LABELS[r.supertrader.strategy]);
    if (r.tickers && r.tickers.length) rules.push('Aktie: ' + r.tickers.join(', '));
    var box = h('div', { class: 'ak-card' }, [
      h('h3', {}, ['So habe ich Ihre Frage verstanden', source === 'cache' ? h('span', { class: 'ak-badge', text: 'aus dem Archiv – kein Kontingent verbraucht' }) : null]),
      r.understood ? h('p', { text: r.understood }) : null,
      rules.length ? h('ul', { class: 'ak-rules' }, rules.map(function (t) { return h('li', { text: t }); })) : null,
      r.notes && r.notes.length ? h('ul', { class: 'ak-notes' }, r.notes.map(function (t) { return h('li', { text: t }); })) : null
    ]);
    if (!r.missing || !r.missing.length) return box;
    var wrap = h('div', {}, [box]);
    var withheld = r.missing.filter(function (m) { return m.type === 'withheld'; });
    var gaps = r.missing.filter(function (m) { return m.type !== 'withheld'; });
    if (withheld.length) wrap.appendChild(card('Noch nicht freigegeben',
      withheld.map(function (m) { return m.wish; }).join(', ') + ': vorhanden, aber noch nicht freigegeben. ' +
      (withheld.some(function (m) { return /quant/i.test(m.wish); }) ? 'Angezeigt werden stattdessen die einzelnen Quant-Faktoren (0–100).' : '')));
    if (gaps.length) wrap.appendChild(card('Das kann Vision Universe noch nicht beantworten',
      gaps.map(function (m) { return m.wish; }).join(', ') + '. Ihre Frage ist notiert – daraus entsteht unsere Liste der nächsten Datenerweiterungen.', true));
    return wrap;
  }

  function header(col) { var f = Fields.field(col); return f ? (f.short || f.label) : col; }
  function cell(col, v) { return h('td', { text: Fields.format(col, v) }); }
  function strategyCell(s) { return h('td', { class: s.pass === true ? 'ak-pass' : 'ak-fail', text: s.label }); }
  function stockLink(sym, name) {
    return h('a', { href: '/discover/#/s/US_REAL/' + encodeURIComponent(sym) }, [h('b', { text: sym }), h('span', { class: 'ak-name', text: name || '' })]);
  }

  function screenBlock(res, r) {
    var box = h('div', { class: 'ak-card' });
    var headline = res.strategy && res.strategy.mode === 'require'
      ? res.total + ' Aktien erfüllen die Filter, davon ' + res.matched + ' auch „' + res.strategy.label + '“'
      : 'von ' + res.universe.toLocaleString('de-DE') + ' Aktien im Universum';
    box.appendChild(h('div', { class: 'ak-summary' }, [h('b', { text: String(res.matched) }), h('span', { text: res.strategy && res.strategy.mode === 'require' ? 'Treffer · ' + headline : 'Treffer ' + headline })]));
    if (res.note) box.appendChild(h('p', { class: 'ak-fine', text: res.note }));
    if (!res.rows.length) {
      box.appendChild(h('div', { class: 'ak-state', text: 'Kein Titel erfüllt alle Bedingungen gleichzeitig. Fehlende Daten erfüllen keinen Filter.' }));
    } else {
      var cols = res.columns;
      box.appendChild(h('div', { class: 'ak-table-wrap' }, [h('table', { class: 'ak-table' }, [
        h('thead', {}, [h('tr', {}, [h('th', { scope: 'col', text: 'Aktie' })].concat(cols.map(function (c) { return h('th', { scope: 'col', text: header(c) }); }))
          .concat(res.strategy ? [h('th', { scope: 'col', text: 'Supertrader' })] : []))]),
        h('tbody', {}, res.rows.map(function (row) {
          return h('tr', {}, [h('td', {}, [stockLink(row.symbol, row.name)])].concat(cols.map(function (c) { return cell(c, row.values[c]); }))
            .concat(row.strategy ? [strategyCell(row.strategy)] : []));
        }))
      ])]));
      if (res.matched > res.rows.length) box.appendChild(h('p', { class: 'ak-fine', text: 'Angezeigt: die ersten ' + res.rows.length + ' von ' + res.matched + '.' }));
    }
    if (res.strategy && res.strategy.asOf) box.appendChild(h('p', { class: 'ak-fine', text: 'Supertrader-Stand ' + res.strategy.asOf + ' (Tagesschluss). Keine Anlageberatung.' }));
    box.appendChild(h('div', { class: 'ak-actions' }, [
      h('a', { class: 'ak-btn ak-btn-sm', href: Ask.screenerUrl(r), text: 'Im Screener weiterbearbeiten' }),
      res.strategy ? h('a', { class: 'ak-btn ak-btn-sm', href: '/supertrader/', text: 'Zum Supertrader' }) : null
    ]));
    return box;
  }

  function stockBlock(res) {
    var box = h('div', { class: 'ak-card' });
    var found = res.stocks.filter(function (s) { return s.found; });
    res.stocks.filter(function (s) { return !s.found; }).forEach(function (s) {
      box.appendChild(h('p', { text: s.symbol + ' gehört nicht zum Vision-Universe-Aktienuniversum (US-Börsen).' }));
    });
    if (!res.stocks.length) box.appendChild(h('p', { text: 'Es wurde keine Aktie erkannt. Nennen Sie den Namen oder das Kürzel, z. B. „Nvidia“ oder „NVDA“.' }));
    if (found.length) {
      box.appendChild(h('div', { class: 'ak-table-wrap' }, [h('table', { class: 'ak-table' }, [
        h('thead', {}, [h('tr', {}, [h('th', { scope: 'col', text: 'Kennzahl' })].concat(found.map(function (s) { return h('th', { scope: 'col', text: s.symbol }); })))]),
        h('tbody', {}, res.columns.map(function (c) {
          return h('tr', {}, [h('td', { text: header(c) })].concat(found.map(function (s) { return cell(c, s.values[c]); })));
        }).concat(res.strategy ? [h('tr', {}, [h('td', { text: res.strategy.label })].concat(found.map(function (s) { return strategyCell(s.strategy); })))] : []))
      ])]));
      var desc = res.columns.map(function (c) { var f = Fields.field(c); return f && f.desc ? header(c) + ': ' + f.desc : null; }).filter(Boolean);
      if (desc.length) box.appendChild(h('ul', { class: 'ak-notes' }, desc.map(function (t) { return h('li', { text: t }); })));
      box.appendChild(h('div', { class: 'ak-actions' }, found.map(function (s) {
        return h('a', { class: 'ak-btn ak-btn-sm', href: '/discover/#/s/US_REAL/' + encodeURIComponent(s.symbol), text: s.symbol + ' vollständig öffnen' });
      })));
    }
    return box;
  }
})();
