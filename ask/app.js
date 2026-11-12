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
  /* Redesign 2027 (Mockup E10): Bausteine aus assets/vu-ui.js (Aktienzeile, Urteil, Balken, Erklärung, Navigationskarte)
     und der eine Chart in Kleinform (assets/vu-chart.js). VUUI maskiert jede Eingabe; markup() ist die einzige HTML-Stelle. */
  var U = window.VUUI, Chart = window.VUChart, Today = window.VUToday, Id = window.VUCore && window.VUCore.Identity;
  function markup(html) { var t = document.createElement('template'); t.innerHTML = html; return t.content; }
  /* „?“ an Kennzahlen öffnet die Erklärung im Sheet (C09 + C16); gebunden nach dem Aufbau. */

  var ENDPOINT = (meta('vu-ask-endpoint') || '').replace(/\/+$/, '');
  var TURNSTILE_KEY = meta('vu-ask-turnstile');
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
  var PLACEHOLDER = 'z. B. „Kleine Firmen, günstig, ohne Schulden“';
  var input = h('textarea', { id: 'ak-q', rows: '2', 'aria-label': 'Deine Frage an Atlas', maxlength: '400', placeholder: PLACEHOLDER });
  var followText = h('span', { class: 'ak-follow-q' });
  var followBar = h('div', { class: 'ak-follow', hidden: true }, [
    h('span', { class: 'ak-follow-label', text: 'Nachfrage zu' }), followText,
    h('button', { class: 'ak-follow-x', type: 'button', 'aria-label': 'Neue Frage statt Nachfrage', onclick: function () { setContext(null); input.focus(); } }, 'Neue Frage')
  ]);
  var sendBtn = h('button', { class: 'ak-send', type: 'submit', 'aria-label': 'Frage senden' }, [icon('arrow')]);
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
    input,
    h('div', { class: 'ak-bar-row' }, [h('span', { class: 'ak-bar-hint', text: Speech ? 'Tippen oder sprechen' : 'Tippen' }), h('div', { class: 'ak-bar-buttons' }, [micBtn, sendBtn])]),
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
    h('p', { class: 'ak-access-title' }, [icon('lock'), 'Beta-Zugang: bitte Passwort eingeben']),
    h('div', { class: 'ak-bar-row' }, [accessInput, h('button', { class: 'ak-send', type: 'submit', 'aria-label': 'Freischalten' }, [icon('send')])]),
    accessMsg
  ]);
  var access = '';
  try { access = localStorage.getItem('vu-ask-access') || ''; } catch (e) {}
  function authHeaders(extra) { var hd = Object.assign({}, extra || {}); if (access) hd['x-vu-access'] = access; return hd; }
  function lock(wrong) {
    accessForm.hidden = false; form.hidden = true; toolsRow.hidden = true; statusEl.textContent = 'Beta: Zugang mit Passwort · ' + ARCHIVE + ' nach dem Freischalten';
    accessMsg.textContent = wrong ? 'Das Passwort ist nicht korrekt.' : '';
    if (wrong) { try { localStorage.removeItem('vu-ask-access'); } catch (e) {} access = ''; }
    accessInput.focus();
  }
  function unlock() { accessForm.hidden = true; form.hidden = false; toolsRow.hidden = false; }

  /* Ein Status-Satz unter der Eingabe (Konzept mein-bereich-2026-11, Screen a-home): gesperrt, Kontingent oder keine Verbindung. */
  var ARCHIVE = 'Antworten aus dem Archiv kostenlos';
  var statusEl = h('p', { class: 'ak-statusline', 'aria-live': 'polite', text: ENDPOINT ? 'Atlas wird verbunden …' : 'Neue Fragen noch gesperrt · ' + ARCHIVE });
  var toolsRow = h('div', { class: 'ak-status' }, [quotaEl]);
  function ask(q, send) {
    input.value = q; input.dispatchEvent(new Event('input'));
    if (send && !sendBtn.disabled && ENDPOINT) { submit(); return; }
    input.focus(); try { form.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
  }
  /* Was Atlas kann: Finden, Vergleichen, Erklären – je eine Beispielfrage ohne Fachwort. */
  var CAN = [
    { icon: 'screener', title: 'Finden', q: 'Kleine Firmen, günstig, ohne Schulden', sub: 'öffnet den Screener' },
    { icon: 'quant', title: 'Vergleichen', q: 'NVIDIA gegen AMD und Broadcom', sub: 'Profile und Zahlen' },
    { icon: 'fundamental', title: 'Erklären', q: 'Wie stark ist der Free Cashflow bei NVIDIA gewachsen?', sub: 'mit Chart und Quelle' }
  ];
  /* Oft gefragt: feste Fragen, die heute vollständig beantwortet werden (Antwort kommt aus dem Archiv, sobald sie einmal gestellt wurde). */
  var OFTEN = ['Welche Aktien stehen auf einem neuen Jahreshoch?', 'Welche Aktien stehen im Weinstein-Stage-2?', 'Wie hoch ist die Marge bei Apple?'];
  var startEl = h('div', { class: 'ak-start' }, [
    h('section', { class: 'ak-section', 'aria-labelledby': 'ak-can-h' }, [
      h('h2', { class: 'vu-sect', id: 'ak-can-h', text: 'Was Atlas kann' }),
      h('div', { class: 'ak-can' }, CAN.map(function (c) {
        return h('button', { class: 'ak-can-card', type: 'button', onclick: function () { ask(c.q, true); } }, [
          markup(U.hud(c.icon, 34, 10)), h('b', { text: c.title }), h('span', { class: 'ak-can-q', text: '„' + c.q + '“' }), h('span', { class: 'ak-can-sub', text: c.sub })
        ]);
      }))
    ]),
    h('section', { class: 'ak-section', 'aria-labelledby': 'ak-often-h' }, [
      h('div', { class: 'vu-sect' }, [h('h2', { id: 'ak-often-h', text: 'Oft gefragt' }), h('span', { class: 'ak-sect-r', text: 'Archiv · kostenlos' })]),
      h('div', { class: 'ak-often' }, OFTEN.map(function (q) {
        return h('button', { class: 'ak-often-q', type: 'button', onclick: function () { ask(q, true); } }, [h('span', { text: q }), markup(U.glyph('next', 14))]);
      }))
    ]),
    /* Die Grenzen in einem „?“ (L6, Datenschutz, Beta, Spracheingabe) */
    h('div', { class: 'vu-help ak-limits' }, [h('i', { 'aria-hidden': 'true', text: '?' }), h('span', {}, ['Atlas rechnet nicht selbst und gibt keine Anlageberatung. Grenzen und Datenschutz: ',
      markup(U.q('Atlas sagt nicht, ob du kaufen oder verkaufen sollst, und beantwortet keine Fragen zu deiner persönlichen Lage. Beta: Neue Fragen pro Tag sind begrenzt; bereits gestellte Fragen kommen kostenlos aus dem Archiv. Fragen werden ohne Personenbezug gespeichert, damit wir fehlende Daten nachbauen können – bitte keine persönlichen Angaben eingeben. Die AI übersetzt nur; sie rechnet nicht und gibt keine Anlageberatung.' + (Speech ? ' Die Spracheingabe nutzt die Spracherkennung deines Browsers (in Chrome über Google-Server).' : ''), 'Grenzen und Datenschutz'))])])
  ]);

  /* Dunkler Kopf: AI ATLAS · BETA, Frage, ein Satz, große Eingabe, ein Status-Satz. */
  var hero = h('header', { class: 'ak-hero' }, [
    h('p', { class: 'ak-kicker' }, [h('span', { class: 'ak-kicker-ic' }, [markup(U.glyph('spark', 16))]), h('span', { class: 'vu-ltag', text: 'AI Atlas · Beta' })]),
    h('h1', { class: 'ak-h1', text: 'Frag Vision Universe.' }),
    h('p', { class: 'ak-lead', text: 'In deinen Worten. Atlas übersetzt in Regeln, Vision Universe rechnet. Jede Zahl mit Quelle.' }),
    h('div', { class: 'ak-askwrap' }, [accessForm, form, voiceEl, statusEl, toolsRow])
  ]);
  /* Antwortansicht (Screens a-screen/a-answer): Zurück, AI ATLAS, Herkunft der Antwort. */
  /* Eine Kopfzeile (Owner 10.11.2026): Die Herkunft der Antwort steht als Pille in der Seitenkopfzeile;
     deren Zurück-Pfeil führt in der Antwortansicht zum Start von Atlas. Ohne Seitenkopf (eingebettet) bleibt die eigene Zeile. */
  var answerPill = h('span', { class: 'ak-anstop-pill' });
  var pageHead = document.querySelector('.ak-hd');
  var answerTop = h('div', { class: 'ak-anstop', hidden: true }, pageHead ? [] : [
    h('button', { class: 'vu-round ak-anstop-back', type: 'button', 'aria-label': 'Zurück zum Start von Atlas', onclick: function () { home(); } }, [markup(U.glyph('back', 18))]),
    h('span', { class: 'vu-ltag', text: 'AI Atlas' }), answerPill
  ]);
  if (pageHead) {
    answerPill.hidden = true;
    pageHead.insertBefore(answerPill, pageHead.querySelector('.ak-beta') || pageHead.lastChild);
    var pageBack = pageHead.querySelector('#ak-back');
    if (pageBack) pageBack.addEventListener('click', function (e) {
      if (!document.body.classList.contains('ak-answering')) return;
      e.preventDefault(); home();
    });
  }
  function home() {
    document.body.classList.remove('ak-answering'); answerTop.hidden = true; if (pageHead) answerPill.hidden = true;
    conversation.textContent = ''; setContext(null);
    try { window.scrollTo(0, 0); } catch (e) {}
  }
  /* „Regel ändern“ und „weiter fragen“: zurück in die Eingabe, die Frage bleibt als Bezug. */
  function followUp(c, placeholder) {
    setContext(c); document.body.classList.add('ak-asking');
    if (placeholder) input.placeholder = placeholder;
    input.focus(); try { hero.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
  }

  main.appendChild(hero);
  main.appendChild(h('div', { class: 'ak-body' }, [answerTop, conversation, startEl]));
  /* Strang F, Hinweis „ai“ (assets/legal-notices.json): erscheint erst nach der rechtlichen Freigabe (VUUI.legal). */
  if (U.legal && U.legal('ai')) main.appendChild(markup(U.legal('ai')));
  if (U.bindHelp) U.bindHelp(main);
  /* Zurück und Schließen: zur Seite, von der Atlas geöffnet wurde (nur eigene Seiten), sonst zur Startseite. */
  (function () {
    var back = '/';
    try { var r = new URL(document.referrer); if (r.origin === location.origin && r.pathname !== location.pathname) back = r.pathname + r.search + r.hash; } catch (e) {}
    ['ak-back', 'ak-close'].forEach(function (id) { var a = document.getElementById(id); if (a) a.setAttribute('href', back); });
  })();

  if (!ENDPOINT) {
    sendBtn.disabled = true;
  } else {
    refreshQuota();
    if (TURNSTILE_KEY) loadTurnstile();
  }
  var params = new URLSearchParams(location.search), initial = params.get('q');
  if (initial) input.value = initial.slice(0, 400);
  /* go=1: die Frage kommt aus dem Atlas-Sheet einer Aktie (assets/atlas-sheet.js) und wird sofort gestellt, sobald die Fragefunktion bereit ist. */
  if (initial && params.get('go') === '1' && ENDPOINT) {
    var tries = 0, wait = setInterval(function () {
      if (++tries > 40) return clearInterval(wait);
      if (quota && !sendBtn.disabled && !busy) { clearInterval(wait); submit(); }
      else if (quota && !quota.enabled) clearInterval(wait);
    }, 150);
  }

  function setQuota(q) {
    quota = q || quota;
    if (!quota) return;
    if (!quota.enabled) { statusEl.textContent = 'Neue Fragen noch gesperrt · ' + ARCHIVE; quotaEl.textContent = ''; sendBtn.disabled = true; return; }
    sendBtn.disabled = false;
    quotaEl.textContent = '';
    statusEl.textContent = (quota.remainingToday > 0
      ? 'Heute noch ' + quota.remainingToday + (quota.remainingToday === 1 ? ' neue Frage' : ' neue Fragen')
      : 'Neue Fragen für heute verbraucht') + ' · ' + ARCHIVE;
  }
  function refreshQuota() {
    fetch(ENDPOINT + '/v1/quota?client=' + encodeURIComponent(clientId()), { headers: authHeaders() })
      .then(function (r) {
        if (r.status === 401) { lock(!!access); throw Error('LOCKED'); }
        if (!r.ok) throw Error('HTTP ' + r.status);
        unlock(); return r.json();
      }).then(setQuota)
      /* Nicht erreichbar ist nicht „gesperrt“: Hinweis zeigen, Senden bleibt moeglich und liefert dann eine klare Meldung. */
      .catch(function (e) { if (e.message === 'LOCKED') return; unlock(); statusEl.textContent = 'Atlas antwortet gerade nicht (' + e.message + ') · bitte später noch einmal'; });
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
    /* Gesprochene Sprache statt Bildschirmzeile (VUAskEngine.speechText): Einheiten ausgeschrieben, kurze Saetze.
       Etwas ruhiger als Standard: Systemstimmen klingen bei 0,95 natuerlicher. */
    Ask.speechText(text, 4).forEach(function (part) {
      var u = new SpeechSynthesisUtterance(part);
      u.lang = voice && voice.lang ? voice.lang : 'de-DE'; u.rate = 0.95; u.pitch = 1;
      if (voice) try { u.voice = voice; } catch (e) {}
      window.speechSynthesis.speak(u);
    });
  }
  /* Die beste deutsche Stimme, die das Geraet anbietet (VUAskEngine.pickVoice): „Anna (Erweitert)“ auf iOS/macOS,
     „Google Deutsch“ in Chrome, „Katja/Conrad Online (Natural)“ in Edge; alte Kompaktstimmen zuletzt. */
  var cachedVoice = null;
  function bestVoice() { return cachedVoice || (cachedVoice = Ask.pickVoice(window.speechSynthesis.getVoices())); }
  if (canSpeak && window.speechSynthesis.addEventListener) try { window.speechSynthesis.addEventListener('voiceschanged', function () { cachedVoice = null; }); } catch (e) {}
  /* Manche Browser laden die Stimmen erst nach; der erste Aufruf fordert sie an. */
  if (canSpeak) try { window.speechSynthesis.getVoices(); } catch (e) {}

  /* ------------------------------------------------------------ Frage */
  function submit() {
    var question = input.value.replace(/\s+/g, ' ').trim();
    if (busy || !ENDPOINT || question.length < 3) return;
    busy = true; sendBtn.disabled = true; document.body.classList.add('ak-busy');
    document.body.classList.add('ak-answering'); document.body.classList.remove('ak-asking'); answerTop.hidden = !!pageHead; if (pageHead) answerPill.hidden = false;
    var turn = h('section', { class: 'ak-turn', 'aria-live': 'polite' }, [
      context ? h('p', { class: 'ak-q-ref', text: 'Nachfrage zu ' + followText.textContent }) : null,
      h('p', { class: 'ak-bub', text: question }),
      h('div', { class: 'ak-state' }, [h('span', { class: 'ak-spin', 'aria-hidden': 'true' }), 'Deine Frage wird übersetzt …'])
    ]);
    conversation.insertBefore(turn, conversation.firstChild);
    try { window.scrollTo(0, 0); } catch (e) {}
    /* Nie still haengen: nach 45 s wird abgebrochen (der Worker gibt Anthropic 25 s),
       jede Ablehnung bekommt einen Satz (VUAskEngine.failure). */
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 45000);
    Promise.all([
      fetch(ENDPOINT + '/v1/ask', { method: 'POST', headers: authHeaders({ 'content-type': 'application/json' }), signal: ctrl ? ctrl.signal : undefined,
        body: JSON.stringify({ question: question, clientId: clientId(), turnstileToken: turnstileToken, previous: context }) })
        .then(function (r) { return r.json().catch(function () { return null; }).then(function (b) { return { status: r.status, body: b }; }); },
          function (e) { return { status: e && e.name === 'AbortError' ? -1 : 0, body: null }; }),
      adapter.load().catch(function () { return null; })
    ]).then(function (res) {
      var answer = res[0].body;
      if (answer && answer.reason === 'ACCESS_REQUIRED') { turn.remove(); lock(true); return; }
      if (answer) setQuota(answer.quota);
      if (turnstileToken && window.turnstile) { window.turnstile.reset(turnstileMount); turnstileToken = null; }
      if (turn.lastChild) turn.lastChild.remove();
      if (!answer || !answer.ok || !answer.result) {
        var f = Ask.failure(res[0].status, answer);
        speak(f.text);
        turn.appendChild(card(f.title, f.text, true));
        return;
      }
      input.value = '';
      return render(turn, answer, context ? context.question + ' → ' + question : question).then(function (summary) { speak(summary); });
    }).catch(function () {
      var f = Ask.failure(0, { reason: 'INTERNAL' });
      if (turn.lastChild) turn.lastChild.remove();
      turn.appendChild(card(f.title, 'Die Antwort ließ sich nicht anzeigen. Bitte die Seite neu laden.', true));
    }).then(function () { clearTimeout(timer); }).then(function () { busy = false; spokenQuestion = false; document.body.classList.remove('ak-busy'); sendBtn.disabled = !ENDPOINT || !!(quota && !quota.enabled); });
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

  /** Rendert die Antwort; liefert eine kurze Zusammenfassung zum Vorlesen.
      Aufbau (Konzept mein-bereich-2026-11, Screens a-screen/a-answer): Frage als Blase (submit), „So hat Atlas übersetzt“
      mit Regel-Chips, Ergebnis, Knöpfe (Alle N im Screener, Regel ändern, weiter fragen), Quellen-Chips, ein Satz „keine Empfehlung“. */
  function render(turn, answer, question) {
    var r = answer.result;
    var gaps = (r.missing || []).filter(function (m) { return m.type !== 'withheld'; }).map(function (m) { return m.wish; });
    var gapText = gaps.length ? ' Noch nicht verfügbar: ' + gaps.join(', ') + '.' : '';
    var pill = answerPill;
    pill.textContent = ''; pill.appendChild(markup(U.verdict('none', answer.source === 'cache' ? 'aus dem Archiv' : 'neu übersetzt')));
    function say(title, text, warn) { turn.appendChild(card(title, text, warn)); turn.appendChild(missingBlock(r)); return Promise.resolve(title + '. ' + text); }
    if (r.kind === 'forecast') return say('Keine Prognosen, keine Beratung', 'Vision Universe sagt keine Kurse voraus, gibt keine Kauf- oder Verkaufsempfehlungen und beantwortet keine Fragen zu deiner persönlichen Lage. Du kannst aber nach Kennzahlen, Trends und Methoden suchen – zum Beispiel „Welche Aktien stehen im Weinstein-Stage-2?“');
    if (r.kind === 'off_topic') return say('Keine Investmentfrage', 'Hier lassen sich Fragen zu Aktien, Kennzahlen und den Methoden von Vision Universe beantworten.');
    if (r.kind === 'unclear') return say('Nicht eindeutig', 'Die Frage ließ sich nicht eindeutig in Regeln übersetzen. Versuch es mit einer konkreten Kennzahl, Größe oder Methode.' + gapText);

    var ds = adapter.dataset();
    if (!ds) return say('Daten nicht verfügbar', 'Das Aktienuniversum konnte nicht geladen werden. Bitte die Seite neu laden.', true);
    if (Fields.setDictionary && ds.meta) Fields.setDictionary(ds.meta.dict || null);
    var info = adapter.info && adapter.info() || {};
    var mount = h('div', { class: 'ak-answer' });
    turn.appendChild(mount);

    var needSignals = !!r.supertrader;
    return Promise.all([needSignals ? signals() : null, r.kind === 'stock' && r.chartbild ? chartbildData() : null]).then(function (loaded) {
      var sig = loaded[0], ti = loaded[1];
      if (needSignals && !sig) mount.appendChild(card('Methoden-Stand nicht geladen', 'Der Stand der Supertrader-Methoden kann gerade nicht angezeigt werden.', true));
      if (r.kind === 'stock') return stockAnswer(mount, r, ds, sig, ti, info, question, gapText);
      /* Die Abfrage wird hier noch einmal geprueft - der Browser rechnet nur, was die Screener-Validierung durchlaesst. */
      var limit = r.query.limit;
      r.query = Query.validate(r.query); r.query.limit = limit;
      var spoken = '';
      /* Rechnen und zeichnen - auch nach jeder Aenderung an den Chips, kostenlos im Browser, ohne neue Anfrage an die AI. */
      function refresh(first) {
        var res = Ask.runScreen(ds, r, sig);
        mount.textContent = '';
        var tips = res.matched <= 3 ? relaxations(ds, r, sig, res.matched) : [];
        function drop(kind, id) {
          if (kind === 'filter') r.query.groups.forEach(function (g) { g.filters = g.filters.filter(function (f) { return f.id !== id; }); });
          else r.supertrader = null;
          refresh(false); setContext(compactOf(question, r));
        }
        mount.appendChild(translated(r, res, drop, tips));
        mount.appendChild(screenList(res, r));
        mount.appendChild(h('div', { class: 'ak-btns' }, [
          h('a', { class: 'vu-btn vu-btn--ink ak-btn2', href: Ask.screenerUrl(r), text: 'Alle ' + res.matched.toLocaleString('de-DE') + ' im Screener' }),
          h('button', { class: 'vu-btn vu-btn--line ak-btn2', type: 'button', onclick: function () { followUp(compactOf(question, r), 'Regel ändern, z. B. „KGV bis 20“ …'); } }, 'Regel ändern')
        ]));
        mount.appendChild(h('button', { class: 'ak-more', type: 'button', onclick: function () { followUp(compactOf(question, r)); } }, ['Weiter fragen', markup(U.glyph('next', 14))]));
        mount.appendChild(sources(r, info, res.strategy));
        mount.appendChild(markup(U.help('Eine Liste nach Regeln, keine Empfehlung. Ein niedriges KGV kann auch einmalige Gewinne spiegeln.')));
        mount.appendChild(missingBlock(r));
        var top = res.rows.slice(0, 3).map(function (x) { return x.name || x.symbol; });
        spoken = !res.matched ? 'Keine Aktie erfüllt alle Regeln gleichzeitig.' :
          (res.matched === 1 ? 'Eine Aktie erfüllt' : res.matched.toLocaleString('de-DE') + ' Aktien erfüllen') + ' alle Regeln.' + (top.length ? ' Ganz oben: ' + top.map(cleanName).join(', ') + '.' : '');
        if (!first) try { mount.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
      }
      refresh(true);
      setContext(compactOf(question, r));
      return spoken + gapText;
    });
  }

  /* Was brächte es, eine Bedingung wegzulassen? Rechnet jede Variante durch - im Browser, ohne Kosten. */
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

  /* „So hat Atlas übersetzt“: Regel-Chips (× entfernt eine Regel, kostenlos neu gerechnet) und die große Zahl. */
  function translated(r, res, onRemove, tips) {
    var rules = Ask.rules(r);
    var n = res.strategy && res.strategy.mode === 'require' ? rules.length : rules.filter(function (x) { return x.kind === 'filter'; }).length;
    return h('div', { class: 'ak-ans' }, [
      h('span', { class: 'vu-ltag', text: 'So hat Atlas übersetzt' }),
      r.understood ? h('p', { class: 'ak-fine', text: r.understood }) : null,
      h('div', { class: 'ak-rcs' }, rules.map(function (x) {
        return h('span', { class: 'ak-rc' }, [x.icon ? markup('<i class="ak-rc-i">' + U.glyph(x.icon, 13) + '</i>') : null, x.text, x.kind !== 'ticker' ? h('button', { class: 'ak-rc-x', type: 'button', 'aria-label': 'Regel entfernen: ' + x.text, title: 'Entfernen (kostenlos neu rechnen)', onclick: function () { onRemove(x.kind, x.id); } }, '×') : null]);
      })),
      h('div', { class: 'ak-count' }, [h('b', { class: 'vu-num', text: res.matched.toLocaleString('de-DE') }),
        h('span', { text: 'von ' + res.universe.toLocaleString('de-DE') + ' US-Aktien erfüllen ' + Ask.allOf(n) })]),
      res.note ? h('p', { class: 'ak-fine', text: res.note }) : null,
      tips.length ? h('div', { class: 'ak-tips' }, tips.map(function (t) {
        return h('button', { class: 'ak-tip', type: 'button', onclick: function () { onRemove(t.kind, t.id); } }, [t.label + ': ', h('b', { text: t.count + ' Treffer' })]);
      })) : null
    ]);
  }
  /* Die ersten fünf Treffer: Logo, Name, zwei Werte der Frage, rechts die passende Kennzahl. */
  function screenList(res, r) {
    if (!res.rows.length) return h('div', { class: 'vu-blank ak-none', text: 'Kein Titel erfüllt alle Regeln gleichzeitig. Fehlende Daten erfüllen keine Regel.' });
    /* Die passende Kennzahl rechts: die, nach der sortiert ist (z. B. KGV aufsteigend), sonst die erste Spalte. */
    var sortField = r && r.query && r.query.sort && r.query.sort.field;
    var cols = res.columns, key = cols.indexOf(sortField) >= 0 ? sortField : cols[0], rest = cols.filter(function (c) { return c !== key; }).slice(0, 2);
    return markup('<div class="ak-list">' + res.rows.slice(0, 5).map(function (row) {
      return '<a class="ak-pos" href="/discover/#/s/US_REAL/' + encodeURIComponent(row.symbol) + '">' + U.logo(row.symbol) +
        '<span class="ak-pos-n"><b>' + U.esc(cleanName(row.name) || row.symbol) + '</b><span>' + U.esc(rest.map(function (c, i) {
          /* wie in der Vorlage: „1,56 Mrd. $ Börsenwert · Kasse netto 5,31 Mrd. $“ */
          return i === 0 ? Ask.value(c, row.values[c]) + ' ' + Ask.name(c) : Ask.name(c) + ' ' + Ask.value(c, row.values[c]);
        }).join(' · ')) + '</span></span>' +
        (key ? '<span class="ak-pos-v"><small>' + U.esc(Ask.name(key)) + '</small><b class="vu-num">' + U.esc(Ask.value(key, row.values[key])) + '</b></span>' : '') + '</a>';
    }).join('') + '</div>');
  }
  function cleanName(n) { return String(n || '').replace(/,? (Inc|Corp|Corporation|Ltd|Limited|plc|N\.V\.|S\.A\.|AG|SE|Holdings?|Co)\.?$/i, '').trim(); }
  /* Quellen-Chips mit Stand. */
  function sources(r, info, strategy) {
    var rules = Ask.rules(r), chips = [];
    chips.push([U.worldIcon('screener', 12), 'Screener-Daten' + (info.asOf ? ', Stand ' + dateDe(info.asOf) : '')]);
    if (rules.some(function (x) { return x.source === 'fundamentals'; })) chips.push(['', 'Gewinne und Schulden: SEC']);
    if (strategy) chips.push([U.worldIcon('supertrader', 12), 'Supertrader' + (strategy.asOf ? ', Stand ' + dateDe(strategy.asOf) : '')]);
    return markup('<div class="ak-srcs">' + chips.map(function (c) { return '<span class="ak-src">' + c[0] + U.esc(c[1]) + '</span>'; }).join('') + '</div>');
  }
  function dateDe(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? m[3] + '.' + m[2] + '.' + m[1] : String(iso || ''); }
  /* Was fehlt oder zurückgehalten ist (unverändert aus der Übersetzung). */
  function missingBlock(r) {
    var wrap = h('div', {});
    var withheld = (r.missing || []).filter(function (m) { return m.type === 'withheld'; });
    var gaps = (r.missing || []).filter(function (m) { return m.type !== 'withheld'; });
    if (withheld.length) wrap.appendChild(card('Noch nicht freigegeben', withheld.map(function (m) { return m.wish; }).join(', ') + ': vorhanden, aber noch nicht freigegeben. ' +
      (withheld.some(function (m) { return /quant/i.test(m.wish); }) ? 'Angezeigt werden stattdessen die einzelnen Quant-Faktoren (0–100).' : '')));
    if (gaps.length) wrap.appendChild(card('Das kann Vision Universe noch nicht beantworten', gaps.map(function (m) { return m.wish; }).join(', ') + '. Deine Frage ist notiert – daraus entsteht unsere Liste der nächsten Datenerweiterungen.', true));
    return wrap;
  }

  /* Frage zu einer oder mehreren Aktien (Erklären, Vergleichen). */
  function stockAnswer(mount, r, ds, sig, ti, info, question, gapText) {
    var st = Ask.runStock(ds, r, sig), found = st.stocks.filter(function (x) { return x.found; });
    var calc = h('div', { class: 'ak-ans ak-calc' }, [h('span', { class: 'vu-ltag', text: 'So hat Atlas gerechnet' }),
      h('div', { class: 'ak-rcs' }, [].concat(found.map(function (x) { return h('span', { class: 'ak-rc', text: 'Firma: ' + (cleanName(x.name) || x.symbol) }); }),
        st.columns.slice(0, 3).map(function (c) { return h('span', { class: 'ak-rc', text: 'Kennzahl: ' + header(c) }); })))]);
    var nextQ = found.length ? [
      { text: 'Wie hoch ist die Marge?', q: 'Wie hoch ist die Marge bei ' + (cleanName(found[0].name) || found[0].symbol) + '?' },
      { text: 'Wie hat sich der Umsatz entwickelt?', q: 'Wie hat sich der Umsatz bei ' + (cleanName(found[0].name) || found[0].symbol) + ' entwickelt?' },
      { text: 'Zahlen-Seite öffnen', href: '/fundamental/#/' + encodeURIComponent(found[0].symbol) }] : [];
    function tail() {
      mount.appendChild(calc);
      if (nextQ.length) {
        mount.appendChild(h('h2', { class: 'vu-sect', text: 'Weiter fragen' }));
        mount.appendChild(h('div', { class: 'ak-nextq' }, nextQ.map(function (x) {
          return x.href ? h('a', { class: 'vu-chip', href: x.href, text: x.text }) : h('button', { class: 'vu-chip', type: 'button', onclick: function () { setContext(compactOf(question, r)); ask(x.q, true); } }, x.text);
        })));
      }
      mount.appendChild(markup(U.help('Antwort aus festen Daten. Keine Vorhersage, keine Anlageberatung.')));
      mount.appendChild(missingBlock(r));
      setContext(compactOf(question, r));
    }
    if (r.chartbild) {
      var text;
      if (!ti) { mount.appendChild(card('Chartbild nicht geladen', 'Die Chartlage kann gerade nicht angezeigt werden.', true)); text = 'Das Chartbild konnte nicht geladen werden.' + gapText; }
      else { var cb = Ask.runChartbild(ti.index, ti.meta, r), names = {}; st.stocks.forEach(function (y) { if (y.found) names[y.symbol] = cleanName(y.name) || y.symbol; }); mount.appendChild(chartbildBlock(cb, names));
        /* Rechenweg des Chartbilds: Firma, Methode, Stand - nicht die Kennzahlen der Aktienzeile. */
        var rcs = calc.querySelector('.ak-rcs'); rcs.textContent = '';
        cb.stocks.forEach(function (y) { rcs.appendChild(h('span', { class: 'ak-rc', text: 'Firma: ' + (names[y.symbol] || y.symbol) })); });
        rcs.appendChild(h('span', { class: 'ak-rc', text: 'Methode: Chartbild' }));
        var cbAsOf = cb.stocks.filter(function (y) { return y.asOf; })[0];
        if (cbAsOf) rcs.appendChild(h('span', { class: 'ak-rc', text: 'Stand: ' + Ask.dateLong(cbAsOf.asOf) })); text = cb.stocks.map(Ask.chartbildSentence).join(' ') + gapText; }
      tail(); return Promise.resolve(text);
    }
    if (!found.length) {
      mount.appendChild(stockBlock(st)); tail();
      return Promise.resolve('Ich habe keine passende Aktie im Universum gefunden.' + gapText);
    }
    var spoken = found.map(function (x) { return (x.name || x.symbol) + ': ' + st.columns.slice(0, 3).map(function (c) { return header(c) + ' ' + Fields.format(c, x.values[c]); }).join(', '); }).join('. ') + '.' + gapText;
    if (found.length > 1) { mount.appendChild(stockBlock(st)); tail(); return Promise.resolve(spoken); }
    /* Eine Aktie: die Zahl, und wenn die Kennzahl eine Jahresreihe in den SEC-Berichten hat, Balken und Rechenweg. */
    var x = found[0], c0 = st.columns[0], track = Ask.secTrack(st.columns);
    var ans = h('div', { class: 'ak-ans' }, [h('span', { class: 'vu-ltag', text: 'Antwort' })]);
    mount.appendChild(ans);
    function plain() {
      ans.appendChild(h('p', { class: 'ak-sent', text: header(c0) + ' von ' + (cleanName(x.name) || x.symbol) }));
      ans.appendChild(h('div', { class: 'ak-big vu-num', text: Fields.format(c0, x.values[c0]) }));
      ans.appendChild(markup('<div class="vu-grid ak-tiles">' + st.columns.slice(1).map(function (c) { return U.tile(header(c), Fields.format(c, x.values[c])); }).join('') + '</div>'));
      ans.appendChild(sources(r, info, null));
    }
    if (!track) { plain(); tail(); return Promise.resolve(spoken); }
    return fetch('/discover/data/stocks/US_REAL/' + encodeURIComponent(x.symbol) + '.json', { cache: 'default' })
      .then(function (res) { if (!res.ok) throw Error('HTTP ' + res.status); return res.json(); })
      .then(function (file) {
        var e = Ask.explain(file, track, 4);
        if (!e) throw Error('NO_SERIES');
        var money = function (v) { return Fields.format('freeCashFlow', v); };
        ans.appendChild(h('p', { class: 'ak-sent', text: 'Der ' + e.label + ' von ' + (cleanName(x.name) || x.symbol) + ' ' + (e.last >= e.first ? 'stieg' : 'fiel') + ' von' }));
        var a1 = money(e.first), a2 = money(e.last), unit = /\s[^\d\s,.−-]+\.?\s?\$$/.exec(a2);
        if (unit && a1.slice(-unit[0].length) === unit[0]) a1 = a1.slice(0, -unit[0].length);
        ans.appendChild(h('div', { class: 'ak-big vu-num', text: a1 + ' → ' + a2 }));
        ans.appendChild(h('p', { class: 'ak-sub', text: 'Geschäftsjahr ' + e.fromFy + ' bis ' + e.toFy + (e.lastChange !== null ? ' · zuletzt ' + U.pct(e.lastChange * 100, 1) + ' zum Vorjahr' : '') }));
        ans.appendChild(markup(U.bars(e.bars, { width: 320, height: 100, label: e.label + ' je Geschäftsjahr', allLabels: true })));
        ans.appendChild(markup('<div class="ak-srcs"><span class="ak-src">' + U.worldIcon('fundamental', 12) + 'SEC-Berichte' + (e.asOf ? ', Stand ' + U.esc(dateDe(e.asOf)) : '') + '</span><span class="ak-src">' + U.esc(e.formula) + '</span></div>'));
        calc.querySelector('.ak-rcs').appendChild(h('span', { class: 'ak-rc', text: 'Zeitraum: GJ ' + e.fromFy + '–' + e.toFy }));
        tail();
        return 'Der ' + e.label + ' von ' + (cleanName(x.name) || x.symbol) + ' ' + (e.last >= e.first ? 'stieg' : 'fiel') + ' von ' + money(e.first) + ' im Geschäftsjahr ' + e.fromFy +
          ' auf ' + money(e.last) + ' im Geschäftsjahr ' + e.toFy + '.' + (e.lastChange !== null ? ' Zuletzt ' + U.pct(e.lastChange * 100, 1) + ' zum Vorjahr.' : '') + gapText;
      })
      .catch(function () { plain(); tail(); return spoken; });
  }

  function header(col) { var f = Fields.field(col); return f ? (f.short || f.label) : col; }
  function cell(col, v) { return h('td', { text: Fields.format(col, v) }); }
  function strategyCell(s) { return h('td', { class: s.pass === true ? 'ak-pass' : 'ak-fail', text: s.label }); }
  function stockLink(sym, name) {
    return h('a', { href: '/discover/#/s/US_REAL/' + encodeURIComponent(sym) }, [h('b', { text: sym }), h('span', { class: 'ak-name', text: name || '' })]);
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
  /* Chartbild-Antwort (Owner 10.11.2026, gleiche Bildsprache wie die Kennzahl-Antwort): Kopf mit Aussage,
     senkrechte Preisleiter statt Tabelle, Ausblick/Struktur/Elliott als Chips, eine Pflichtzeile (legal-notices setup). */
  function chartbildBlock(res, names) {
    var usd = function (v) { return Fields.format('price', v); };
    var wrap = h('div', { class: 'ak-cb' });
    res.stocks.forEach(function (x) {
      var nm = names && names[x.symbol] || x.symbol;
      var box = h('div', { class: 'ak-ans ak-cb-card' });
      wrap.appendChild(box);
      box.appendChild(h('span', { class: 'vu-ltag', text: nm + ' · Chartbild' }));
      if (!x.found) { box.appendChild(h('p', { class: 'ak-sent', text: 'Für diesen Titel liegt kein Chartbild vor.' })); return; }
      if (x.withheld) {
        box.appendChild(h('p', { class: 'ak-sent', text: x.notice || 'Analyse zurückgehalten.' }));
        box.appendChild(openBtn(x));
        return;
      }
      box.appendChild(h('div', { class: 'ak-cb-head', text: x.structure && x.structure.label || x.outlook && x.outlook.label || 'Chartbild' }));
      box.appendChild(h('p', { class: 'ak-sub', text: 'Stand ' + Ask.dateLong(x.asOf) + (x.delayed ? ' · verzögert' : x.stale ? ' · veraltet' : '') }));
      var chips = [];
      if (x.outlook) chips.push('Ausblick: ' + x.outlook.label);
      if (x.structure) chips.push('Kursstruktur: ' + x.structure.label);
      chips.push('Elliott: ' + (x.elliott && !x.elliott.abstained && x.elliott.applicability ? x.elliott.applicability.label : 'keine Zählung'));
      box.appendChild(h('div', { class: 'ak-rcs' }, chips.map(function (c) { return h('span', { class: 'ak-rc', text: c }); })));
      var lad = Ask.ladder(x);
      if (lad) box.appendChild(markup(ladderSvg(lad, usd)));
      var p = x.primaryScenario || {};
      if (p.withheld && p.withheld.length) box.appendChild(h('p', { class: 'ak-fine', text: 'Nicht gezeigt, weil rechnerisch unplausibel: ' + p.withheld.map(function (k) { return { entryZone: 'Zone', invalidation: 'Ungültig-Marke', confirmation: 'Bestätigungs-Marke', target1: 'obere Zone' }[k] || k; }).join(', ') + '.' }));
      box.appendChild(openBtn(x));
      var line = Ask.setupLine(U.legalNotice && U.legalNotice('setup'), { method: 'Chartbild', version: x.status && x.status.schemaVersion, asOf: Ask.dateLong(x.asOf) });
      if (line) box.appendChild(h('p', { class: 'ak-cb-legal' }, [line.text + ' ', line.link ? h('a', { href: line.link.href, text: line.link.label }) : null]));
    });
    return wrap;
  }
  function openBtn(x) {
    return h('a', { class: 'vu-btn vu-btn--ink ak-btn2 ak-cb-open', href: '/elliott/#/' + encodeURIComponent(x.symbol), text: 'Im Chartbild öffnen' });
  }
  /* Senkrechte Preisleiter: Abstände proportional zum Preis, Hauptszenario im Akzentgelb, Schluss als Punkt.
     Beschriftungen rechts, bei engen Marken nach außen geschoben (die Marke selbst bleibt am Preis). */
  function ladderSvg(lad, fmt) {
    var W = 320, H = 260, top = 14, bottom = H - 14, axis = 50, span = lad.max - lad.min || lad.max * 0.1 || 1;
    var pad = span * 0.06, lo = lad.min - pad, hi = lad.max + pad;
    var y = function (v) { return top + (hi - v) / (hi - lo) * (bottom - top); };
    var parts = ['<svg class="ak-ladder" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Preisleiter des Chartbilds">',
      '<line class="ak-ladder-axis" x1="' + axis + '" y1="' + top + '" x2="' + axis + '" y2="' + bottom + '"/>'];
    /* Beschriftungsplätze von oben nach unten, mindestens 30 px auseinander */
    var items = lad.items.slice().reverse(), slots = [], last = -Infinity;
    items.forEach(function (it) { var c = y((it.lo + it.hi) / 2); var s = Math.max(c, last + 30); slots.push(s); last = s; });
    var over = last - (bottom - 6); if (over > 0) slots = slots.map(function (s) { return s - over; });
    items.forEach(function (it, i) {
      var y1 = y(it.hi), y2 = y(it.lo), ly = slots[i], cls = 'ak-ladder-' + it.kind + (it.main ? ' is-main' : '');
      if (it.kind === 'zone') parts.push('<rect class="' + cls + '" x="' + (axis - 30) + '" y="' + y1.toFixed(1) + '" width="60" height="' + Math.max(4, y2 - y1).toFixed(1) + '" rx="6"/>');
      else if (it.kind === 'close') parts.push('<circle class="ak-ladder-close" cx="' + axis + '" cy="' + y1.toFixed(1) + '" r="6"/>');
      else parts.push('<line class="' + cls + '" x1="' + (axis - 30) + '" x2="' + (axis + 30) + '" y1="' + y1.toFixed(1) + '" y2="' + y1.toFixed(1) + '"/>');
      var mid = (y1 + y2) / 2;
      parts.push('<path class="ak-ladder-lead" d="M' + (axis + 34) + ' ' + mid.toFixed(1) + ' L' + (axis + 46) + ' ' + ly.toFixed(1) + '"/>');
      var val = (it.prefix || '') + (it.lo === it.hi ? fmt(it.lo) : fmt(it.lo) + ' – ' + fmt(it.hi));
      parts.push('<text class="ak-ladder-v' + (it.kind === 'close' ? ' is-close' : '') + '" x="' + (axis + 50) + '" y="' + (ly - 1).toFixed(1) + '">' + U.esc(val) + '</text>');
      parts.push('<text class="ak-ladder-l" x="' + (axis + 50) + '" y="' + (ly + 12).toFixed(1) + '">' + U.esc(it.label) + '</text>');
    });
    parts.push('</svg>');
    return parts.join('');
  }

  /* Weiter-Karten (C12). */
  function weiter(list) {
    return h('div', { class: 'ak-weiter' }, [h('h3', { class: 'vu-sect', text: 'Weiter' }), markup(list.map(function (l) { return U.navcard({ href: l.href, icon: l.icon, title: l.title, sub: l.sub }); }).join(''))]);
  }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  /* Aktienzeile mit Kurs, Bewegung und Mini-Chart aus der Tagesreihe (gleiche Reihe wie der veröffentlichte Schluss). */
  function fillRow(host, sym, name, sub) {
    host.appendChild(markup(U.stockRow({ ticker: sym, name: name || sym, sub: sub, href: '/discover/#/s/US_REAL/' + encodeURIComponent(sym), noPrice: true })));
    var path = Today && Id ? Today.seriesPath(Id, sym) : null;
    if (!path) return;
    fetch(path, { cache: 'default' }).then(function (r) { if (!r.ok) throw Error('HTTP ' + r.status); return r.json(); }).then(function (series) {
      var pts = (series.points || []).filter(function (p) { return p && isNum(p[1]); });
      if (pts.length < 2) return;
      var last = pts[pts.length - 1], mv = Today.move(series, { date: last[0] });
      host.textContent = '';
      host.appendChild(markup(U.stockRow({ ticker: sym, name: name || sym, sub: sub + ' · Schluss ' + last[0].slice(8, 10) + '.' + last[0].slice(5, 7) + '.', href: '/discover/#/s/US_REAL/' + encodeURIComponent(sym),
        chart: Chart ? Chart.sparkline(mv.values) : '', price: last[1], currency: series.currency || 'USD', changePct: mv.pct })));
    }).catch(function () { /* ohne Reihe bleibt die Zeile ohne Kurs */ });
  }

  function stockBlock(res) {
    var box = h('div', { class: 'ak-answer' });
    var found = res.stocks.filter(function (s) { return s.found; });
    res.stocks.filter(function (s) { return !s.found; }).forEach(function (s) {
      box.appendChild(h('p', { class: 'ak-fine', text: s.symbol + ' gehört nicht zum Vision-Universe-Aktienuniversum (US-Börsen).' }));
    });
    if (!res.stocks.length) box.appendChild(h('p', { text: 'Es wurde keine Aktie erkannt. Nenne den Namen oder das Kürzel, z. B. „Nvidia“ oder „NVDA“.' }));
    if (!found.length) return box;
    var rows = h('div', { class: 'ak-rows' });
    found.forEach(function (s) { var r = h('div', {}); rows.appendChild(r); fillRow(r, s.symbol, s.name, s.symbol); });
    box.appendChild(rows);
    /* Je Kennzahl ein Vergleich als Balken (C17) mit Erklärung (C09); bei einer Aktie Kacheln (C11). */
    if (found.length === 1) {
      box.appendChild(markup('<div class="vu-grid ak-tiles">' + res.columns.map(function (c) { return U.tile(header(c), Fields.format(c, found[0].values[c])); }).join('') + '</div>'));
    } else {
      res.columns.forEach(function (c) {
        var vals = found.map(function (s) { return s.values[c]; }).filter(isNum);
        if (!vals.length) return;
        var max = Math.max.apply(null, vals.map(Math.abs)) || 1, f = Fields.field(c);
        box.appendChild(markup('<div class="vu-box ak-compare"><p class="ak-compare-h">' + U.esc(header(c)) + (f && f.desc ? U.q(f.desc, header(c)) : '') + '</p>' + found.map(function (s) {
          var v = s.values[c];
          return '<div class="ak-compare-row"><b>' + U.esc(s.symbol) + '</b>' + U.meter(isNum(v) ? Math.abs(v) / max * 100 : 0, { lime: isNum(v) && Math.abs(v) === max, label: header(c) + ' ' + s.symbol }) + '<span>' + U.esc(Fields.format(c, v)) + '</span></div>';
        }).join('') + '</div>'));
      });
    }
    var desc = res.columns.map(function (c) { var f = Fields.field(c); return f && f.desc ? header(c) + ': ' + f.desc : null; }).filter(Boolean);
    if (desc.length) box.appendChild(markup(desc.slice(0, 2).map(function (t) { return U.help(t); }).join('')));
    var details = h('details', { class: 'ak-more-table' }, [h('summary', { text: 'Alle Werte als Tabelle' })]);
    details.appendChild(h('div', { class: 'ak-table-wrap' }, [h('table', { class: 'ak-table' }, [
      h('thead', {}, [h('tr', {}, [h('th', { scope: 'col', text: 'Kennzahl' })].concat(found.map(function (s) { return h('th', { scope: 'col', text: s.symbol }); })))]),
      h('tbody', {}, res.columns.map(function (c) {
        return h('tr', {}, [h('td', { text: header(c) })].concat(found.map(function (s) { return cell(c, s.values[c]); })));
      }).concat(res.strategy ? [h('tr', {}, [h('td', { text: res.strategy.label })].concat(found.map(function (s) { return strategyCell(s.strategy); })))] : []))
    ])]));
    box.appendChild(details);
    /* Jede Aktie führt in beide Produkte: Quant (Faktoren) und Discover (Überblick). Was zuerst steht, folgt der Frage. */
    var quantFirst = res.columns.some(function (c) { var f = Fields.field(c); return f && f.source === 'factor'; });
    var links = [];
    found.slice(0, 2).forEach(function (s) {
      var sym = encodeURIComponent(s.symbol);
      var quant = { href: '/quant/#/aktie/' + sym, icon: 'quant', title: s.symbol + ' in Quant öffnen', sub: 'Faktoren der Aktie' };
      var disc = { href: '/discover/#/s/US_REAL/' + sym, icon: 'discover', title: s.symbol + ' im Überblick', sub: 'Aktienseite in Discover' };
      links = links.concat(quantFirst ? [quant, disc] : [disc, quant]);
    });
    if (res.strategy) links.push({ href: '/supertrader/', icon: 'supertrader', title: 'Zum Supertrader', sub: res.strategy.label });
    box.appendChild(weiter(links));
    return box;
  }
})();
