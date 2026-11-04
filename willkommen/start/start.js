/* =========================================================================
   VISION UNIVERSE — willkommen/start/start.js   Erster Start (Mockup E11)
   Drei Fragen: Ziel, Erfahrung, erste Aktien. Jede lässt sich überspringen.
   Gespeichert wird auf dem Gerät (willkommen/start/prefs.js, Schlüssel vu-start-v1).
   Mit Konto kommen gewählte Aktien zusätzlich über POST /v1/watchlist/items auf die
   Watchlist (gleicher Weg wie die Suche in /mein-dashboard/). Ziel und Erfahrung
   speichert das Konto erst, wenn es settings.goal/settings.mode gibt.
   Serverdaten nur per textContent; innerHTML nur mit VUUI-Markup.
   ========================================================================= */
(function (root) {
  'use strict';
  var S = root.VUStart, U = root.VUUI, A = root.VUAccount, C = root.VUCore || {}, W = C.WatchlistView;
  var doc = document, step = 1, state = S.read(), picked = state.tickers.slice(), names = null, signedIn = false;
  var GOAL_ICON = { vorsorge: 'vorsorge', aktie: 'discover', ideen: null, signale: 'supertrader' };
  var SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="currentColor"/></svg>';
  function $(id) { return doc.getElementById(id); }
  function el(tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function box() { var b = el('span', 'fs-box'); b.setAttribute('aria-hidden', 'true'); b.innerHTML = U.glyph('check', 16); return b; }

  function option(group, id, title, sub, extra, lead) {
    var b = el('button', 'fs-opt'); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.id = id;
    if (lead) { var l = el('span', 'fs-lead'); l.innerHTML = lead; b.appendChild(l); }
    var t = el('span', 'fs-opt-text'); t.append(el('b', '', title), el('small', '', sub)); if (extra) t.appendChild(el('em', '', extra));
    b.append(t, box());
    b.addEventListener('click', function () { choose(group, id); });
    return b;
  }
  function paint(group) {
    var host = $(group === 'goal' ? 'fs-goals' : 'fs-modes'), cur = state[group];
    [].forEach.call(host.children, function (b) { var on = b.dataset.id === cur; b.setAttribute('aria-checked', String(on)); b.classList.toggle('is-on', on); });
    if (group === 'mode') $('fs-preview').innerHTML = cur === 'pro' ? U.verdict('strong', 'Sehr stark') + ' ' + U.verdict('mid', 'Rücksetzer') + ' ' + U.pro()
      : cur === 'advanced' ? U.verdict('strong', 'Sehr stark') + ' ' + U.verdict('mid', 'Rücksetzer') : U.verdict('strong', 'Sehr stark') + ' ' + U.help('Ein Satz erklärt jedes Urteil.');
  }
  function choose(group, id) { state[group] = state[group] === id ? null : id; S.write(state); paint(group); }

  function renderGoals() {
    var host = $('fs-goals');
    S.GOAL_ORDER.forEach(function (id) {
      var g = S.GOALS[id], lead = GOAL_ICON[id] ? U.hud(GOAL_ICON[id], 44) : '<span class="vu-hud" style="--vu-hud:44px">' + SPARK + '</span>';
      host.appendChild(option('goal', id, g.title, g.text, '→ ' + g.worldName, lead));
    });
    paint('goal');
  }
  var MODE_SUB = { beginner: 'Ich fange gerade an.', advanced: 'Ich habe ein Depot und lese Zahlen.', pro: 'Ich analysiere täglich.' };
  function renderModes() {
    var host = $('fs-modes');
    S.MODE_ORDER.forEach(function (id) { host.appendChild(option('mode', id, S.MODES[id].title, MODE_SUB[id], S.MODES[id].text)); });
    paint('mode');
  }

  function renderChips() {
    var host = $('fs-chips'), all = S.POPULAR.concat(picked.filter(function (t) { return S.POPULAR.indexOf(t) < 0; }));
    host.textContent = '';
    all.forEach(function (t) {
      var on = picked.indexOf(t) >= 0, b = el('button', 'vu-chip fs-chip' + (on ? ' vu-chip--lime' : ''));
      b.type = 'button'; b.setAttribute('aria-pressed', String(on));
      b.innerHTML = U.glyph(on ? 'check' : 'plus', 16); b.appendChild(doc.createTextNode(t));
      b.addEventListener('click', function () { toggle(t); });
      host.appendChild(b);
    });
    $('fs-count').textContent = String(picked.length);
    $('fs-count-label').textContent = picked.length === 1 ? 'Aktie gewählt' : 'Aktien gewählt';
  }
  function toggle(t) {
    var i = picked.indexOf(t);
    if (i >= 0) picked.splice(i, 1); else if (picked.length < 20) picked.push(t);
    state.tickers = picked.slice(); S.write(state); renderChips();
  }
  function fetchJson(path) { return fetch(path, { cache: 'default', credentials: 'omit' }).then(function (r) { if (!r.ok) throw new Error('HTTP_' + r.status); return r.json(); }); }
  function ensureNames() {
    if (!names && W) names = fetchJson(W.PATHS.names).then(function (d) { return W.index(d); }, function () { names = null; return null; });
    return names || Promise.resolve(null);
  }
  function bindSearch() {
    var q = $('fs-q'), out = $('fs-hits'), seq = 0;
    q.addEventListener('focus', ensureNames, { once: true });
    q.addEventListener('input', function () {
      var n = ++seq, v = q.value.trim();
      if (!v) { out.hidden = true; out.textContent = ''; return; }
      ensureNames().then(function (ix) {
        if (n !== seq) return;
        out.textContent = '';
        var hits = ix ? ix.search(v, 5) : [];
        if (!hits.length) { out.appendChild(el('p', 'fs-hit-none', ix ? 'Kein Treffer.' : 'Die Suche ist gerade nicht verfügbar. Tippe auf ein Kürzel unten.')); out.hidden = false; return; }
        hits.forEach(function (h) {
          var b = el('button', 'fs-hit'); b.type = 'button'; b.setAttribute('role', 'option');
          b.append(el('b', '', h.ticker), el('span', '', h.name || ''));
          b.addEventListener('click', function () { if (picked.indexOf(h.ticker) < 0) toggle(h.ticker); q.value = ''; out.hidden = true; });
          out.appendChild(b);
        });
        out.hidden = false;
      });
    });
  }

  function show(n) {
    step = Math.max(1, Math.min(3, n));
    [].forEach.call(doc.querySelectorAll('.fs-step'), function (s) { s.hidden = Number(s.dataset.step) !== step; });
    [].forEach.call($('fs-progress').children, function (li, i) { li.className = i < step - 1 ? 'is-done' : i === step - 1 ? 'is-now' : ''; });
    $('fs-progress').setAttribute('aria-label', 'Schritt ' + step + ' von 3');
    $('fs-next').textContent = step === 3 ? 'Fertig, los geht’s' : 'Weiter';
    $('fs-after').hidden = step !== 3;
    var h = doc.querySelector('.fs-step[data-step="' + step + '"] h1'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    root.scrollTo(0, 0);
  }
  /* Abschluss: lokal merken; mit Konto die gewählten Aktien auf die Watchlist (bestehende Schnittstelle). */
  function finish() {
    state.tickers = picked.slice(); state.done = true; S.write(state);
    var btn = $('fs-next'); btn.disabled = true;
    var go = function () { root.location.assign('/willkommen/'); };
    if (!signedIn) return go();
    /* Z1: Ziel, Erfahrung und „erster Start erledigt“ ins Konto; scheitert das, bleibt die Wahl auf dem Gerät. */
    var saved = A.patch('/v1/me', { settings: S.toAccount(state, true) }).catch(function () { return null; });
    if (!picked.length) return saved.then(go, go);
    saved.then(function () { return ensureNames(); }).then(function (ix) {
      var items = ix ? picked.map(function (t) { var id = ix.resolveTicker(t); return id ? { instrumentId: id, ticker: t } : null; }).filter(Boolean) : [];
      if (!items.length) return go();
      return Promise.all(items.map(function (it) { return A.post('/v1/watchlist/items', it); })).then(function (rs) {
        var bad = rs.filter(function (r) { return !r.ok; })[0];
        if (bad) { $('fs-status').textContent = A.message(bad.state) + ' Deine Wahl ist auf diesem Gerät gemerkt.'; btn.disabled = false; btn.onclick = go; btn.textContent = 'Weiter zu Mein Bereich'; return; }
        go();
      });
    });
  }

  function init() {
    renderGoals(); renderModes(); renderChips(); bindSearch();
    $('fs-next').addEventListener('click', function () { if (step < 3) show(step + 1); else finish(); });
    $('fs-back').addEventListener('click', function () { if (step > 1) show(step - 1); else root.history.length > 1 ? root.history.back() : root.location.assign('/willkommen/'); });
    $('fs-skip').addEventListener('click', function (e) { e.preventDefault(); state.done = true; S.write(state); if (step < 3) show(step + 1); else (signedIn ? A.patch('/v1/me', { settings: S.toAccount(state, true) }).catch(function () { return null; }) : Promise.resolve()).then(function () { root.location.assign('/willkommen/'); }); });
    if (A && A.available && A.available()) A.get('/v1/session').then(function (r) { signedIn = !!(r.ok && r.data && r.data.authenticated); });
    show(1);
  }
  if (S && U) init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
