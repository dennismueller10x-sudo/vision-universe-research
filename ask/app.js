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
  /* Ideen fuer den Einstieg - echte Fragen, die heute vollstaendig
     beantwortet werden koennen. */
  var IDEAS = [
    { icon: 'trend', text: 'Profitable Small Caps mit neuem 52-Wochen-Hoch im Minervini-Raster',
      q: 'Gib mir alle Aktien mit neuem 52-Wochen-Hoch, Marktkapitalisierung über 300 Millionen, aber unter 2 Milliarden, die ins Minervini-Raster passen – mit Quant-Faktoren' },
    { icon: 'doc', text: 'Wie stark ist der Free Cashflow bei Nvidia gewachsen?', q: 'Wie stark ist der Free Cashflow bei Nvidia gewachsen?' },
    { icon: 'scale', text: 'Nvidia vs. AMD vs. Broadcom – Wachstum und Bewertung', q: 'Vergleiche Nvidia, AMD und Broadcom bei Umsatzwachstum, Marge und KGV' },
    { icon: 'funnel', text: 'Günstig bewertete Small Caps mit wenig Schulden', q: 'Zeig mir günstig bewertete Small Caps mit wenig Schulden' }
  ];
  var MODULES = [
    { icon: 'quant', name: 'Quant', text: 'Faktoren. Muster. Scores.', href: '/quant/' },
    { icon: 'funnel', name: 'Screener', text: 'Chancen. Filter. Setups.', href: '/screener/' },
    { icon: 'compass', name: 'Discover', text: 'Märkte. Themen. Ideen.', href: '/discover/' },
    { icon: 'trend', name: 'SuperTrader', text: 'Strategien. Signale. Edge.', href: '/supertrader/' }
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

  var ICONS = {
    mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0M12 17v4m-3 0h6',
    send: 'M5 12h13m-5-6 6 6-6 6',
    speaker: 'M4 9v6h4l5 4V5L8 9H4Zm12.5-1.5a6 6 0 0 1 0 9m-2-6.5a2.5 2.5 0 0 1 0 4',
    lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z',
    spark: 'M12 3v5m0 8v5M3 12h5m8 0h5M6.5 6.5l3 3m5 5 3 3m0-11-3 3m-5 5-3 3',
    quant: 'M5 20V13m5 7V8m5 12V11m5 9V4',
    funnel: 'M4 5h16l-6 7.5V19l-4 1.5v-8L4 5Z',
    compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3.5-12.5-2 5-5 2 2-5 5-2Z',
    trend: 'M4 19 10 13l3 3 7-8m-5 0h5v5',
    doc: 'M7 3h7l4 4v14H7V3Zm7 0v4h4M10 12h5m-5 4h5',
    scale: 'M12 4v16m-6 0h12M5 8h14M5 8l-2.5 6a2.5 2.5 0 0 0 5 0L5 8Zm14 0-2.5 6a2.5 2.5 0 0 0 5 0L19 8Z',
    shield: 'M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Zm-3 9 2 2 4-4',
    arrow: 'M9 6l6 6-6 6',
    check: 'M5 12.5 9.5 17 19 7'
  };
  function icon(name) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', 'ak-icon');
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', ICONS[name]); svg.appendChild(p);
    return svg;
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
  var Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  var canSpeak = 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
  var PLACEHOLDER = 'Ihre Frage an Atlas …';
  var input = h('textarea', { id: 'ak-q', rows: '2', 'aria-label': 'Ihre Frage an Vision Universe', maxlength: '400', placeholder: PLACEHOLDER });
  var followText = h('span', { class: 'ak-follow-q' });
  var followBar = h('div', { class: 'ak-follow', hidden: true }, [
    h('span', { class: 'ak-follow-label', text: 'Nachfrage zu' }), followText,
    h('button', { class: 'ak-follow-x', type: 'button', 'aria-label': 'Neue Frage statt Nachfrage', onclick: function () { setContext(null); input.focus(); } }, 'Neue Frage')
  ]);
  var sendBtn = h('button', { class: 'ak-send', type: 'submit', 'aria-label': 'Frage senden' }, [icon('send')]);
  var micBtn = Speech ? h('button', { class: 'ak-mic', type: 'button', 'aria-pressed': 'false', 'aria-label': 'Frage sprechen', onclick: dictate }, [icon('mic')]) : null;
  var readAloud = canSpeak && (function () { try { return localStorage.getItem('vu-ask-read') !== '0'; } catch (e) { return true; } })();
  var speakBtn = canSpeak ? h('button', { class: 'ak-toggle', type: 'button', 'aria-pressed': String(readAloud), onclick: toggleRead },
    [icon('speaker'), h('span', { text: 'Antworten vorlesen' })]) : null;
  var quotaEl = h('span', { class: 'ak-quota', 'aria-live': 'polite' });
  var voiceEl = h('p', { class: 'ak-voice', 'aria-live': 'polite' });
  var turnstileMount = h('div', {});
  var conversation = h('div', { class: 'ak-conversation' });
  var spokenQuestion = false;

  var form = h('form', { class: 'ak-bar', onsubmit: function (e) { e.preventDefault(); submit(); } }, [
    followBar,
    h('div', { class: 'ak-bar-row' }, [input, h('div', { class: 'ak-bar-buttons' }, [micBtn, sendBtn])]),
    h('p', { class: 'ak-bar-hint', text: Speech ? 'Tippen oder aufs Mikrofon drücken und sprechen – Pausen sind erlaubt.' : 'Stellen Sie Ihre Frage in eigenen Worten.' }),
    turnstileMount
  ]);
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });
  input.addEventListener('input', function () { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 220) + 'px'; });

  /* Zugangsschranke der Beta: Passwort einmal je Geraet, danach gemerkt.
     Geprueft wird im Worker - hier wird es nur mitgeschickt. */
  var accessInput = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'Zugangspasswort', placeholder: 'Zugangspasswort' });
  var accessMsg = h('p', { class: 'ak-access-msg', 'aria-live': 'polite' });
  var accessForm = h('form', { class: 'ak-bar ak-access', hidden: true, onsubmit: function (e) {
    e.preventDefault();
    var v = accessInput.value.trim();
    if (!v) return;
    try { localStorage.setItem('vu-ask-access', v); } catch (err) {}
    access = v; accessInput.value = ''; refreshQuota();
  } }, [
    h('p', { class: 'ak-access-title' }, [icon('lock'), 'Beta-Zugang – bitte Passwort eingeben']),
    h('div', { class: 'ak-bar-row' }, [accessInput, h('button', { class: 'ak-send', type: 'submit', 'aria-label': 'Freischalten' }, [icon('send')])]),
    accessMsg
  ]);
  var access = '';
  try { access = localStorage.getItem('vu-ask-access') || ''; } catch (e) {}
  function authHeaders(extra) { var hd = Object.assign({}, extra || {}); if (access) hd['x-vu-access'] = access; return hd; }
  function lock(wrong) {
    accessForm.hidden = false; form.hidden = true; toolsRow.hidden = true; examplesEl.hidden = true;
    accessMsg.textContent = wrong ? 'Das Passwort ist nicht korrekt.' : '';
    if (wrong) { try { localStorage.removeItem('vu-ask-access'); } catch (e) {} access = ''; }
    accessInput.focus();
  }
  function unlock() { accessForm.hidden = true; form.hidden = false; toolsRow.hidden = false; examplesEl.hidden = false; }

  var toolsRow = h('div', { class: 'ak-status' }, [
    h('span', { class: 'ak-live' }, [h('i', { 'aria-hidden': 'true' }), '3 Systeme verbunden']),
    h('span', { class: 'ak-status-list', text: 'Screener · SuperTrader · Quant-Faktoren' }),
    quotaEl, speakBtn
  ]);
  function ask(q) { input.value = q; input.dispatchEvent(new Event('input')); input.focus(); try { form.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }
  var examplesEl = h('section', { class: 'ak-section', 'aria-labelledby': 'ak-ideas-h' }, [
    h('div', { class: 'ak-section-head' }, [h('h2', { id: 'ak-ideas-h', text: 'Ideen für Sie' })]),
    h('div', { class: 'ak-ideas' }, IDEAS.map(function (x) {
      return h('button', { class: 'ak-idea', type: 'button', onclick: function () { ask(x.q); } }, [
        h('span', { class: 'ak-idea-icon' }, [icon(x.icon)]), h('span', { class: 'ak-idea-text', text: x.text }), h('span', { class: 'ak-idea-go' }, [icon('arrow')])
      ]);
    }))
  ]);
  var modulesEl = h('section', { class: 'ak-section', 'aria-labelledby': 'ak-mod-h' }, [
    h('div', { class: 'ak-section-head' }, [h('h2', { id: 'ak-mod-h', text: 'Quick Access' }), h('a', { href: '/', class: 'ak-more' }, ['Alle Module', icon('arrow')])]),
    h('div', { class: 'ak-modules' }, MODULES.map(function (m) {
      return h('a', { class: 'ak-module', href: m.href }, [
        h('span', { class: 'ak-module-icon' }, [icon(m.icon)]),
        h('span', { class: 'ak-module-text' }, [h('b', { text: m.name }), h('small', { text: m.text })]),
        icon('arrow')
      ]);
    }))
  ]);

  main.appendChild(h('header', { class: 'ak-top' }, [
    h('div', {}, [
      h('h1', { class: 'ak-title' }, [icon('spark'), 'AI Atlas']),
      h('p', { class: 'ak-sub', text: 'Ihre intelligente Verbindung zum Vision-Universe-Ökosystem.' }),
      h('ul', { class: 'ak-checks' }, ['Echte Daten', 'Verifizierte Quellen', 'Sprachsteuerung'].map(function (t) {
        return h('li', {}, [h('span', { class: 'ak-check' }, [icon('check')]), t]);
      }))
    ]),
    h('div', { class: 'ak-orb', 'aria-hidden': 'true' }, [h('span'), h('span'), h('span')])
  ]));
  main.appendChild(h('section', { class: 'ak-stage' }, [
    h('div', { class: 'ak-globe', 'aria-hidden': 'true' }),
    h('div', { class: 'ak-stage-copy' }, [
      h('p', { class: 'ak-kicker', text: 'Vision Universe Intelligence' }),
      h('h2', { class: 'ak-h1', text: 'Was möchten Sie heute analysieren?' }),
      h('p', { class: 'ak-lead', text: 'Stellen Sie Ihre Frage zu Aktien, Kennzahlen und Strategien – getippt oder gesprochen. Atlas übersetzt sie in Filter; jede Zahl stammt aus den Daten von Vision Universe.' })
    ]),
    h('p', { class: 'ak-stage-side', text: 'Mehr Perspektive. Bessere Entscheidungen.' })
  ]));
  main.appendChild(h('div', { class: 'ak-askwrap' }, [accessForm, form, voiceEl, toolsRow]));
  main.appendChild(conversation);
  main.appendChild(modulesEl);
  main.appendChild(examplesEl);
  main.appendChild(h('div', { class: 'ak-verified' }, [
    h('span', { class: 'ak-verified-icon' }, [icon('shield')]),
    h('div', {}, [h('b', { text: 'Verified by Vision Universe' }), h('span', { text: 'AI interpretiert. Vision Universe liefert die Daten.' })])
  ]));
  main.appendChild(h('p', { class: 'ak-fine ak-foot', text: 'Beta: Die Zahl neuer Fragen pro Tag ist begrenzt; bereits gestellte Fragen werden kostenlos aus dem Archiv beantwortet. Fragen werden ohne Personenbezug gespeichert, damit wir fehlende Daten nachbauen können – bitte keine persönlichen Angaben eingeben. Die AI übersetzt nur; sie rechnet nicht und gibt keine Anlageberatung.' + (Speech ? ' Die Spracheingabe nutzt die Spracherkennung Ihres Browsers (in Chrome über Google-Server).' : '') }));

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

  /* ------------------------------------------------------ Sprache */
  var recognition = null;
  /* Sprechen mit Pausen: Die Browser-Erkennung beendet sich bei Stille oft
     von selbst. Solange der Nutzer nicht fertig ist, wird sie deshalb neu
     gestartet. Fertig ist er, wenn er aufs Mikrofon tippt oder 4 Sekunden
     lang nichts Neues sagt - erst dann geht die Frage hinaus. */
  var SILENCE_MS = 4000;
  function dictate() {
    if (recognition) { recognition.finish(); return; }
    stopSpeaking();
    var base = input.value.trim() ? input.value.trim() + ' ' : '';
    var committed = '', interim = '', done = false, silence = null, active = null;
    var state = recognition = { finish: finish };
    document.body.classList.add('ak-listening');
    micBtn.setAttribute('aria-pressed', 'true');
    micBtn.setAttribute('aria-label', 'Fertig – Frage senden');
    voiceEl.textContent = 'Ich höre zu … Pausen sind kein Problem. Zum Senden aufs Mikrofon tippen.';
    function show() { input.value = (base + committed + interim).slice(0, 400); input.dispatchEvent(new Event('input')); }
    function armSilence() {
      clearTimeout(silence);
      silence = setTimeout(function () { if ((committed + interim).trim()) finish(); }, SILENCE_MS);
    }
    function start() {
      var rec = active = new Speech();
      rec.lang = 'de-DE'; rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = true;
      rec.onresult = function (e) {
        interim = '';
        for (var i = e.resultIndex; i < e.results.length; i++) {
          var t = e.results[i][0].transcript;
          if (e.results[i].isFinal) committed += (committed && !/\s$/.test(committed) ? ' ' : '') + t.trim() + ' ';
          else interim += t;
        }
        show(); armSilence();
      };
      rec.onerror = function (e) {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          voiceEl.textContent = 'Mikrofon nicht freigegeben. Bitte den Zugriff im Browser erlauben.'; done = true; cleanup(false);
        }
      };
      rec.onend = function () {
        if (active !== rec) return;
        if (!done) { try { start(); } catch (err) { finish(); } }
      };
      try { rec.start(); } catch (err) { finish(); }
    }
    function cleanup(send) {
      clearTimeout(silence);
      if (recognition === state) recognition = null;
      document.body.classList.remove('ak-listening');
      micBtn.setAttribute('aria-pressed', 'false');
      micBtn.setAttribute('aria-label', 'Frage sprechen');
      if (send && input.value.trim().length >= 3) { voiceEl.textContent = ''; spokenQuestion = true; submit(); }
      else if (send) voiceEl.textContent = 'Nichts gehört – bitte noch einmal versuchen.';
    }
    function finish() {
      if (done) return;
      done = true; interim = interim.trim(); if (interim) { committed += interim; interim = ''; show(); }
      var rec = active; active = null;
      try { rec && rec.stop(); } catch (err) {}
      cleanup(true);
    }
    start();
  }

  function toggleRead() {
    readAloud = !readAloud;
    speakBtn.setAttribute('aria-pressed', String(readAloud));
    try { localStorage.setItem('vu-ask-read', readAloud ? '1' : '0'); } catch (e) {}
    if (!readAloud) stopSpeaking();
  }
  function stopSpeaking() { if (canSpeak) window.speechSynthesis.cancel(); }
  function speak(text) {
    if (!canSpeak || !text || !(readAloud || spokenQuestion)) return;
    stopSpeaking();
    var voice = bestVoice();
    /* In Saetzen sprechen: iOS bricht lange Aeusserungen gern ab, und kurze
       Saetze klingen mit den Systemstimmen natuerlicher. */
    var clean = text.replace(/\u00a0/g, ' ').replace(/\$/g, ' Dollar').replace(/\s+/g, ' ').trim();
    (clean.match(/[^.!?]+[.!?]*/g) || [clean]).forEach(function (part) {
      part = part.trim(); if (!part) return;
      var u = new SpeechSynthesisUtterance(part);
      u.lang = 'de-DE'; u.rate = 1; u.pitch = 1;
      if (voice) try { u.voice = voice; } catch (e) {}
      window.speechSynthesis.speak(u);
    });
  }
  /* Die beste deutsche Stimme, die das Geraet anbietet. Neuere neuronale
     Stimmen tragen Namen wie "Premium", "Erweitert"/"Enhanced", "Natural"
     oder "Online" (Edge), bei Chrome "Google Deutsch". Alte Kompaktstimmen
     kommen zuletzt. */
  var VOICE_RANK = [/premium/i, /natural|neural/i, /erweitert|enhanced|verbessert/i, /online/i, /google/i, /siri/i];
  function bestVoice() {
    var de = window.speechSynthesis.getVoices().filter(function (v) { return /^de([-_]|$)/i.test(v.lang); });
    function score(v) {
      var r = VOICE_RANK.length;
      for (var i = 0; i < VOICE_RANK.length; i++) if (VOICE_RANK[i].test(v.name)) { r = i; break; }
      return r - (/^de[-_]DE/i.test(v.lang) ? 0.5 : 0);
    }
    return de.length ? de.slice().sort(function (a, b) { return score(a) - score(b); })[0] : null;
  }
  /* Manche Browser laden die Stimmen erst nach; der erste Aufruf fordert sie an. */
  if (canSpeak) try { window.speechSynthesis.getVoices(); } catch (e) {}

  /* ------------------------------------------------------------ Frage */
  function submit() {
    var question = input.value.replace(/\s+/g, ' ').trim();
    if (busy || !ENDPOINT || question.length < 3) return;
    busy = true; sendBtn.disabled = true; document.body.classList.add('ak-busy');
    var turn = h('section', { class: 'ak-turn', 'aria-live': 'polite' }, [
      context ? h('p', { class: 'ak-q-ref', text: 'Nachfrage zu ' + followText.textContent }) : null,
      h('p', { class: 'ak-q', text: question }),
      h('div', { class: 'ak-state' }, [h('span', { class: 'ak-spin', 'aria-hidden': 'true' }), 'Ihre Frage wird übersetzt …'])
    ]);
    conversation.insertBefore(turn, conversation.firstChild);
    try { turn.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
    Promise.all([
      fetch(ENDPOINT + '/v1/ask', { method: 'POST', headers: authHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ question: question, clientId: clientId(), turnstileToken: turnstileToken, previous: context }) })
        .then(function (r) { return r.json(); }),
      adapter.load().catch(function () { return null; })
    ]).then(function (res) {
      var answer = res[0];
      if (answer.reason === 'ACCESS_REQUIRED') { turn.remove(); lock(true); return; }
      if (!answer.ok) speak(answer.message || '');
      setQuota(answer.quota);
      if (turnstileToken && window.turnstile) { window.turnstile.reset(turnstileMount); turnstileToken = null; }
      turn.lastChild.remove();
      if (!answer.ok) { turn.appendChild(card('Keine Auswertung', answer.message || 'Die Frage konnte nicht ausgewertet werden.', true)); return; }
      input.value = '';
      return render(turn, answer, context ? context.question + ' → ' + question : question).then(function (summary) { speak(summary); });
    }).catch(function () {
      turn.lastChild.remove();
      turn.appendChild(card('Keine Verbindung', 'Die Fragefunktion ist gerade nicht erreichbar. Bitte später erneut versuchen.', true));
    }).then(function () { busy = false; spokenQuestion = false; document.body.classList.remove('ak-busy'); sendBtn.disabled = !ENDPOINT || !!(quota && !quota.enabled); });
  }

  function card(title, text, warn) {
    return h('div', { class: 'ak-card' + (warn ? ' ak-card-warn' : '') }, [h('h3', { text: title }), h('p', { text: text })]);
  }

  /* ---------------------------------------------------------- Antwort */
  /* Kontext fuer Nachfragen: die zuletzt beantwortete Frage in kompakter
     Form. Die naechste Eingabe bezieht sich darauf, bis der Nutzer den
     Bezug aufhebt. */
  var context = null;
  function compactOf(question, r) {
    return {
      question: question.length > 390 ? '…' + question.slice(-389) : question, kind: r.kind,
      filters: r.query ? Query.filters(r.query).map(function (f) { return [f.field, f.op, f.value, f.value2]; }) : [],
      tickers: r.tickers || [], show: r.show || [], supertrader: r.supertrader || null, chartbild: r.chartbild === true
    };
  }
  function setContext(c) {
    context = c;
    followBar.hidden = !c;
    followText.textContent = c ? '„' + (c.question.length > 90 ? c.question.slice(0, 88) + '…' : c.question) + '“' : '';
    input.placeholder = c ? 'Nachfrage, z. B. „nur positives Wachstum“ …' : PLACEHOLDER;
  }

  /** Rendert die Antwort; liefert eine kurze Zusammenfassung zum Vorlesen. */
  function render(turn, answer, question) {
    var r = answer.result;
    var gaps = (r.missing || []).filter(function (m) { return m.type !== 'withheld'; }).map(function (m) { return m.wish; });
    var gapText = gaps.length ? ' Noch nicht verfügbar: ' + gaps.join(', ') + '.' : '';
    function say(title, text, warn) { turn.appendChild(card(title, text, warn)); return Promise.resolve(title + '. ' + text); }

    var understoodMount = h('div', {}), resultMount = h('div', {}), atlasMount = h('div', {});
    turn.appendChild(understoodMount);
    if (r.kind === 'forecast') { understoodMount.appendChild(understood(r, answer.source)); return say('Keine Prognosen', 'Vision Universe sagt keine Kurse voraus und gibt keine Kaufempfehlungen. Sie können aber nach Kennzahlen, Trends und Strategiesignalen suchen – zum Beispiel „Welche Aktien stehen im Weinstein-Stage-2?“'); }
    if (r.kind === 'off_topic') { understoodMount.appendChild(understood(r, answer.source)); return say('Keine Investmentfrage', 'Hier lassen sich Fragen zu Aktien, Kennzahlen und den Vision-Universe-Strategien beantworten.'); }
    if (r.kind === 'unclear') { understoodMount.appendChild(understood(r, answer.source)); return say('Nicht eindeutig', 'Die Frage ließ sich nicht sicher in Filter übersetzen. Versuchen Sie es mit einer konkreten Kennzahl, Größe oder Strategie.' + gapText); }

    var ds = adapter.dataset();
    if (!ds) { understoodMount.appendChild(understood(r, answer.source)); return say('Daten nicht verfügbar', 'Das Aktienuniversum konnte nicht geladen werden. Bitte die Seite neu laden.', true); }
    if (Fields.setDictionary && ds.meta) Fields.setDictionary(ds.meta.dict || null);
    turn.appendChild(atlasMount);
    turn.appendChild(resultMount);
    turn.appendChild(h('div', { class: 'ak-actions ak-turn-actions' }, [
      h('button', { class: 'ak-btn ak-btn-sm', type: 'button', onclick: function () { setContext(compactOf(question, r)); input.focus(); try { form.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} } }, 'Diese Frage verfeinern')
    ]));

    var needSignals = !!r.supertrader;
    return Promise.all([needSignals ? signals() : null, r.kind === 'stock' && r.chartbild ? chartbildData() : null]).then(function (loaded) {
      var sig = loaded[0], ti = loaded[1];
      if (needSignals && !sig) resultMount.appendChild(card('Supertrader-Signale nicht geladen', 'Der Strategiestatus kann gerade nicht angezeigt werden.', true));
      if (r.kind === 'stock') {
        understoodMount.appendChild(understood(r, answer.source));
        var st = Ask.runStock(ds, r, sig);
        var found = st.stocks.filter(function (x) { return x.found; });
        var text;
        if (r.chartbild) {
          /* Chartbild-Werkzeug: strukturierte Werte aus dem Index statt Freitext */
          if (!ti) { resultMount.appendChild(card('Chartbild nicht geladen', 'Die Chartlage kann gerade nicht angezeigt werden.', true)); text = 'Das Chartbild konnte nicht geladen werden.' + gapText; }
          else {
            var cb = Ask.runChartbild(ti.index, ti.meta, r);
            resultMount.appendChild(chartbildBlock(cb));
            text = cb.stocks.map(Ask.chartbildSentence).join(' ') + gapText;
          }
        } else {
          resultMount.appendChild(stockBlock(st));
          text = !found.length ? 'Ich habe keine passende Aktie im Universum gefunden.' + gapText
            : found.map(function (x) {
              return (x.name || x.symbol) + ': ' + st.columns.slice(0, 3).map(function (c) { return header(c) + ' ' + Fields.format(c, x.values[c]); }).join(', ');
            }).join('. ') + '.' + gapText;
        }
        atlasMount.appendChild(atlasCard(text, [], r));
        setContext(compactOf(question, r));
        return text;
      }
      /* Die Abfrage wird hier noch einmal geprueft - der Browser rechnet
         nur, was die Screener-Validierung durchlaesst. */
      var limit = r.query.limit;
      r.query = Query.validate(r.query); r.query.limit = limit;

      /* Rechnen und zeichnen - auch nach jeder Aenderung an den Chips,
         kostenlos im Browser, ohne neue Anfrage an die AI. */
      var spoken = '';
      function refresh(first) {
        var res = Ask.runScreen(ds, r, sig);
        understoodMount.textContent = ''; resultMount.textContent = ''; atlasMount.textContent = '';
        understoodMount.appendChild(understood(r, answer.source, function (kind, id) {
          if (kind === 'filter') r.query.groups.forEach(function (g) { g.filters = g.filters.filter(function (f) { return f.id !== id; }); });
          else r.supertrader = null;
          refresh(false);
          setContext(compactOf(question, r));
        }));
        resultMount.appendChild(screenBlock(res, r));
        var tips = res.matched <= 3 ? relaxations(ds, r, sig, res.matched) : [];
        var top = res.rows.slice(0, 3).map(function (x) { return x.name || x.symbol; });
        spoken = !res.matched ? 'Keine Aktie erfüllt alle Bedingungen gleichzeitig.' :
          (res.matched === 1 ? 'Eine Aktie erfüllt' : res.matched + ' Aktien erfüllen') + ' alle Bedingungen' + (top.length ? ', darunter ' + top.join(', ') : '') + '.';
        var text = spoken + (tips.length ? ' Mit einer gelockerten Bedingung fände ich mehr – siehe Vorschläge.' : '') + gapText;
        atlasMount.appendChild(atlasCard(text, tips, r, function (tip) {
          if (tip.kind === 'filter') r.query.groups.forEach(function (g) { g.filters = g.filters.filter(function (f) { return f.id !== tip.id; }); });
          else r.supertrader = null;
          refresh(false);
          setContext(compactOf(question, r));
        }));
        if (!first) try { atlasMount.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
      }
      refresh(true);
      setContext(compactOf(question, r));
      return spoken + gapText;
    });
  }

  /* Was brächte es, eine Bedingung wegzulassen? Rechnet jede Variante
     durch - im Browser, ohne Kosten. */
  function relaxations(ds, r, sig, current) {
    var out = [];
    Query.filters(r.query).forEach(function (f) {
      var copy = Object.assign({}, r, { query: Query.clone(r.query) });
      copy.query.limit = r.query.limit;
      copy.query.groups.forEach(function (g) { g.filters = g.filters.filter(function (x) { return x.id !== f.id; }); });
      var n = Ask.runScreen(ds, copy, sig).matched;
      if (n > current) out.push({ kind: 'filter', id: f.id, label: 'Ohne „' + Fields.describeFilter(f) + '“', count: n });
    });
    if (r.supertrader && r.supertrader.mode === 'require') {
      var n2 = Ask.runScreen(ds, Object.assign({}, r, { supertrader: null }), sig).matched;
      if (n2 > current) out.push({ kind: 'strategy', label: 'Ohne „' + Ask.STRATEGY_LABELS[r.supertrader.strategy] + '“', count: n2 });
    }
    return out.sort(function (a, b) { return a.count - b.count; }).slice(0, 3);
  }

  function atlasCard(text, tips, r, onTip) {
    var notes = (r.notes || []).filter(function (n) { return !/^Nicht ausgewertet/.test(n); });
    return h('div', { class: 'ak-atlas' }, [
      h('span', { class: 'ak-atlas-icon', 'aria-hidden': 'true' }, [icon('spark')]),
      h('div', { class: 'ak-atlas-body' }, [
        h('b', { text: 'Atlas' }),
        h('p', { text: text }),
        notes.length ? h('p', { class: 'ak-atlas-hint', text: 'Annahme: ' + notes.join(' · ') + ' – mit einer Nachfrage wie „nur positives Wachstum“ passe ich das an.' }) : null,
        tips.length ? h('div', { class: 'ak-tips' }, tips.map(function (t) {
          return h('button', { class: 'ak-tip', type: 'button', onclick: function () { onTip(t); } }, [t.label + ': ', h('b', { text: t.count + ' Treffer' })]);
        })) : null
      ])
    ]);
  }

  function understood(r, source, onRemove) {
    var rules = [];
    if (r.query) Query.filters(r.query).forEach(function (f) { rules.push({ text: Fields.describeFilter(f), kind: 'filter', id: f.id }); });
    if (r.supertrader) rules.push({ text: (r.supertrader.mode === 'require' ? 'Erfüllt: ' : 'Status: ') + Ask.STRATEGY_LABELS[r.supertrader.strategy], kind: 'strategy' });
    if (r.tickers && r.tickers.length) rules.push({ text: 'Aktie: ' + r.tickers.join(', ') });
    var box = h('div', { class: 'ak-card' }, [
      h('h3', {}, ['So habe ich Ihre Frage verstanden', source === 'cache' ? h('span', { class: 'ak-badge', text: 'aus dem Archiv – kein Kontingent verbraucht' }) : null]),
      r.understood ? h('p', { text: r.understood }) : null,
      rules.length ? h('ul', { class: 'ak-rules' }, rules.map(function (x) {
        return h('li', {}, [x.text, onRemove && x.kind ? h('button', { class: 'ak-rule-x', type: 'button', 'aria-label': 'Bedingung entfernen: ' + x.text, title: 'Entfernen (kostenlos neu rechnen)', onclick: function () { onRemove(x.kind, x.id); } }, '×') : null]);
      })) : null,
      onRemove && rules.length ? h('p', { class: 'ak-fine', text: 'Tippen Sie auf ×, um eine Bedingung zu entfernen – das rechnet sofort und kostenlos neu.' }) : null
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

  /* Chartbild-Index (gz) ueber die Lese-API des Chartbilds; null bei Fehler. */
  var chartbildPromise = null;
  function chartbildData() {
    var TI = window.VUTechnicalIntelligence;
    if (!TI) return Promise.resolve(null);
    if (!chartbildPromise) chartbildPromise = Promise.all([TI.getIndex(), TI.getMeta().catch(function () { return null; })])
      .then(function (x) { return { index: x[0], meta: x[1] }; })
      .catch(function () { chartbildPromise = null; return null; });
    return chartbildPromise;
  }
  function chartbildBlock(res) {
    var usd = function (v) { return v === null || v === undefined ? '–' : Fields.format('price', v); };
    var zone = function (z) { return z ? usd(z[0]) + ' – ' + usd(z[1]) : '–'; };
    var box = h('div', { class: 'ak-card' }, [h('h3', { text: 'Chartbild' })]);
    res.stocks.forEach(function (x) {
      if (!x.found) { box.appendChild(h('p', { text: x.symbol + ': Für diesen Titel liegt kein Chartbild vor.' })); return; }
      var p = x.primaryScenario || {};
      var rows = [
        ['Ausblick', x.outlook && x.outlook.label], ['Kursstruktur', x.structure && x.structure.label],
        ['Zone des Hauptszenarios', zone(p.entryZone)], ['Ungültig bei Schluss ' + (p.direction === 'BEARISH' ? 'über' : 'unter'), usd(p.invalidation)],
        ['Bestätigung', usd(p.confirmation)], ['Zielzone 1', zone(p.target1)],
        ['Elliott (experimentell)', x.elliott.abstained ? 'keine belastbare Zählung' : x.elliott.applicability.label + (x.elliott.count ? ' · ' + x.elliott.count : '')]
      ];
      box.appendChild(h('div', { class: 'ak-table-wrap' }, [h('table', { class: 'ak-table' }, [
        h('thead', {}, [h('tr', {}, [h('th', { scope: 'col', text: x.symbol }), h('th', { scope: 'col', text: 'Stand ' + (x.asOf || '–') + (x.stale ? ' · veraltet' : '') })])]),
        h('tbody', {}, rows.map(function (rw) { return h('tr', {}, [h('td', { text: rw[0] }), h('td', { text: rw[1] || '–' })]); }))
      ])]));
      if (p.withheld && p.withheld.length) box.appendChild(h('p', { class: 'ak-atlas-hint', text: 'Nicht gezeigt, weil rechnerisch unplausibel: ' + p.withheld.map(function (k) { return { entryZone: 'Zone', invalidation: 'Ungültig-Linie', confirmation: 'Bestätigung', target1: 'Zielzone 1' }[k] || k; }).join(', ') + '.' }));
      box.appendChild(h('div', { class: 'ak-actions' }, [h('a', { class: 'ak-btn ak-btn-sm', href: '/quant/#/aktie/' + encodeURIComponent(x.symbol) + '/chartbild', text: x.symbol + ' im Chartbild öffnen' })]));
    });
    var first = res.stocks.filter(function (x) { return x.disclaimer; })[0];
    box.appendChild(h('ul', { class: 'ak-notes' }, [
      h('li', { text: (first && first.elliott ? first.elliott.note : 'Elliott-Wellen sind experimentell und nicht von Experten validiert.') }),
      h('li', { text: first ? first.disclaimer : 'Keine Prognose und keine Anlageberatung.' })
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
      /* Jede Aktie fuehrt in beide Produkte: Quant (Faktoren, Analyse) und
         Discover (Ueberblick, Kurs, Einordnung). Was zuerst steht und
         hervorgehoben ist, folgt der Frage: ging es um Quant-Faktoren,
         ist es Quant, sonst Discover. Supertrader nur, wenn gefragt. */
      var quantFirst = res.columns.some(function (c) { var f = Fields.field(c); return f && f.source === 'factor'; });
      box.appendChild(h('div', { class: 'ak-actions' }, [].concat.apply([], found.map(function (s) {
        var sym = encodeURIComponent(s.symbol);
        var quant = { href: '/quant/#/aktie/' + sym, text: s.symbol + ' in Quant analysieren' };
        var disc = { href: '/discover/#/s/US_REAL/' + sym, text: s.symbol + ' in Discover öffnen' };
        var links = quantFirst ? [quant, disc] : [disc, quant];
        if (res.strategy) links.push({ href: '/supertrader/', text: 'Zum Supertrader' });
        return links.map(function (l) { return h('a', { class: 'ak-btn ak-btn-sm', href: l.href, text: l.text }); });
      }))));
    }
    return box;
  }
})();
