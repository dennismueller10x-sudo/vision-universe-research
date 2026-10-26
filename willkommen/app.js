/* Willkommensseite (/willkommen/): erste Seite nach der Anmeldung, vor allen Produktwelten.
   Oben Highlights mit Erklaervideos (config/stories.json), darunter alle Produkte, dann Neuigkeiten
   aus dem Team (config/news.json). Beide Dateien werden von Hand gepflegt; die Pruefregeln liegen
   in validateStories() und validateNews() und laufen in willkommen/tests.
   "Gesehen" merkt sich der Browser je Story und Fassung (rev). */
(function (global) {
  'use strict';
  var STORIES = '/willkommen/config/stories.json', NEWS = '/willkommen/config/news.json';
  var SEEN_KEY = 'vu-welcome-seen-v1', ICONS = '/assets/product-icons.svg#';
  var MIN_S = 15, MAX_S = 45;

  // Produkte in der Reihenfolge des globalen Menues (assets/site-navigation.js).
  // art: Bild der Produktwelt (assets/hero-visuals) oder leer, dann zeigt die Karte das grosse Produkt-Icon.
  var PRODUCTS = [
    { id: 'discover', name: 'Discover', href: '/discover/#/', text: 'Aktien entdecken, Themen und Märkte.', art: '/assets/hero-visuals/discover.webp' },
    { id: 'quant', name: 'Quant', href: '/quant/', text: 'Faktoren und frühere Vergleichsfälle.' },
    { id: 'fundamental', name: 'Fundamental', href: '/fundamental/#/', text: 'Über 60 Kennzahlen je Unternehmen.', art: '/assets/hero-visuals/fundamental.svg' },
    { id: 'technical', name: 'Technical', href: '/technical/#/', text: 'Chartanalyse und Formationen.', art: '/assets/hero-visuals/technical.svg' },
    { id: 'supertrader', name: 'Supertrader', href: '/supertrader/', text: 'Bewährte Methoden, feste Regeln.', art: '/assets/hero-visuals/supertrader.svg' },
    { id: 'screener', name: 'Screener', href: '/screener/', text: 'Eigene Kriterien filtern.', art: '/assets/hero-visuals/screener.webp' },
    { id: 'elliott', name: 'Elliott', href: '/elliott/', text: 'Wellenstruktur im Chartbild.' },
    { id: 'hedgefonds', name: 'Hedgefonds', href: '/hedgefonds/', text: 'Was große Investoren halten.', art: '/assets/hero-visuals/hedgefonds.webp' },
    { id: 'vorsorge', name: 'Vorsorge', href: '/vorsorge/#/', text: 'Vorsorgelücke, ETFs, Förderung.', art: '/assets/hero-visuals/vorsorge.webp' },
    { id: 'atlas', name: 'AI Atlas', href: '/ask/', text: 'Frag in eigenen Worten.' }
  ];

  function storyDuration(story) {
    return (story.slides || []).reduce(function (sum, slide) { return sum + (Number(slide.duration) || 0); }, 0);
  }
  function internal(href) { return /^\/(?!\/)/.test(href || ''); }
  function validateStories(config) {
    var errors = [], ids = new Set();
    if (!config || !Array.isArray(config.stories) || !config.stories.length) return ['stories fehlt'];
    config.stories.forEach(function (story, i) {
      var at = 'stories[' + i + ']';
      if (!/^[a-z0-9-]+$/.test(story.id || '')) errors.push(at + ': id fehlt oder ungueltig');
      if (ids.has(story.id)) errors.push(at + ': id doppelt'); ids.add(story.id);
      if (!story.title || story.title.length > 12) errors.push(at + ': title fehlt oder laenger als 12 Zeichen');
      if (!story.product) errors.push(at + ': product fehlt');
      if (!Number.isInteger(story.rev) || story.rev < 1) errors.push(at + ': rev muss eine ganze Zahl ab 1 sein');
      if (!Array.isArray(story.slides) || !story.slides.length) { errors.push(at + ': slides fehlt'); return; }
      story.slides.forEach(function (slide, j) {
        var s = at + '.slides[' + j + ']';
        if (!(Number(slide.duration) > 0)) errors.push(s + ': duration fehlt');
        if (slide.type === 'video') { if (!internal(slide.src) && !/^https:\/\//.test(slide.src || '')) errors.push(s + ': src fehlt'); }
        else if (slide.type === 'card') { if (!slide.title) errors.push(s + ': title fehlt'); }
        else errors.push(s + ': type muss video oder card sein');
        if (slide.cta && (!slide.cta.label || !internal(slide.cta.href))) errors.push(s + ': cta braucht label und interne Adresse');
      });
      var total = storyDuration(story);
      if (total < MIN_S || total > MAX_S) errors.push(at + ': Dauer ' + total + ' s ausserhalb ' + MIN_S + ' bis ' + MAX_S + ' s');
    });
    return errors;
  }
  function validateNews(config) {
    var errors = [], ids = new Set();
    if (!config || !Array.isArray(config.items)) return ['items fehlt'];
    config.items.forEach(function (item, i) {
      var at = 'items[' + i + ']';
      if (!/^[a-z0-9-]+$/.test(item.id || '')) errors.push(at + ': id fehlt oder ungueltig');
      if (ids.has(item.id)) errors.push(at + ': id doppelt'); ids.add(item.id);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date || '') || isNaN(Date.parse(item.date))) errors.push(at + ': date muss JJJJ-MM-TT sein');
      if (!item.title) errors.push(at + ': title fehlt');
      if (!item.text) errors.push(at + ': text fehlt');
      if (item.link && (!item.link.label || !internal(item.link.href))) errors.push(at + ': link braucht label und interne Adresse');
    });
    return errors;
  }
  // Angeheftete zuerst, sonst neueste zuerst; gleiche Tage behalten die Reihenfolge der Datei.
  function sortNews(items) {
    return items.map(function (item, i) { return { item: item, i: i }; }).sort(function (a, b) {
      return (b.item.pinned ? 1 : 0) - (a.item.pinned ? 1 : 0) || (b.item.date > a.item.date ? 1 : b.item.date < a.item.date ? -1 : a.i - b.i);
    }).map(function (x) { return x.item; });
  }
  function greeting(hour) { return hour < 5 ? 'Gute Nacht' : hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend'; }
  function formatDate(iso) {
    var p = iso.split('-');
    return Number(p[2]) + '. ' + ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'][Number(p[1]) - 1] + ' ' + p[0];
  }

  var api = { PRODUCTS: PRODUCTS, validateStories: validateStories, validateNews: validateNews, sortNews: sortNews, storyDuration: storyDuration, greeting: greeting, formatDate: formatDate, MIN_S: MIN_S, MAX_S: MAX_S };
  if (typeof module === 'object' && module.exports) module.exports = api;
  global.VUWelcome = api;
  if (typeof document === 'undefined') return;

  var doc = document, stories = null;
  function getJSON(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
  function h(tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  var ATLAS = '<path d="M12 2.5c.6 4.6 2.7 7.2 7.5 8-4.8.7-6.9 3.4-7.5 8-.6-4.6-2.7-7.3-7.5-8 4.8-.8 6.9-3.4 7.5-8z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="19.5" cy="19" r="1.4" fill="currentColor"/>';
  function icon(id) {
    var ns = 'http://www.w3.org/2000/svg', svg = doc.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    if (id === 'atlas') svg.innerHTML = ATLAS;
    else { var use = doc.createElementNS(ns, 'use'); use.setAttribute('href', ICONS + id); svg.appendChild(use); }
    return svg;
  }
  function seen() { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function markSeen(story) {
    var s = seen(); s[story.id] = story.rev;
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } catch (e) { /* privater Modus: nur ohne Merken */ }
    paintSeen();
  }
  function paintSeen() {
    if (!stories) return;
    var s = seen();
    stories.stories.forEach(function (story) {
      var b = doc.querySelector('.wk-hl[data-story="' + story.id + '"]');
      if (!b) return;
      var done = s[story.id] === story.rev;
      b.classList.toggle('is-seen', done);
      b.setAttribute('aria-label', story.title + ': ' + story.product + ' erklärt' + (done ? ', gesehen' : ', neu'));
    });
  }

  /* ---------- Abschnitte ---------- */
  function renderHighlights(host) {
    var list = h('ul', 'wk-hl-list');
    stories.stories.forEach(function (story, i) {
      var li = h('li'), b = h('button', 'wk-hl'), cover = h('span', 'wk-hl-cover'), glyph = h('span', 'wk-hl-glyph');
      b.type = 'button'; b.dataset.story = story.id; b.style.setProperty('--wk-turn', (i * 72) + 'deg');
      glyph.appendChild(icon(story.icon || 'layers')); cover.append(glyph, h('span', 'wk-hl-play'));
      b.append(cover, h('span', 'wk-hl-name', story.title));
      b.addEventListener('click', function () { openStory(story.id, b); });
      li.appendChild(b); list.appendChild(li);
    });
    host.replaceChildren(list); host.removeAttribute('aria-busy');
    paintSeen();
  }
  function renderProducts(host) {
    var list = h('ul', 'wk-products');
    PRODUCTS.forEach(function (p) {
      var li = h('li'), a = h('a', 'wk-product'), art = h('span', 'wk-product-art'), chip = h('span', 'wk-product-chip'), copy = h('span', 'wk-product-copy');
      a.href = p.href; a.dataset.product = p.id;
      if (p.art) { var img = h('img'); img.src = p.art; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; art.appendChild(img); }
      else { art.classList.add('is-icon'); art.appendChild(icon(p.id)); }
      chip.appendChild(icon(p.id));
      copy.append(h('strong', '', p.name), h('span', '', p.text));
      a.append(art, chip, copy);
      li.appendChild(a); list.appendChild(li);
    });
    host.replaceChildren(list);
  }
  function renderNews(host, config) {
    var items = sortNews(config.items), list = h('ol', 'wk-news'), LIMIT = 4;
    items.forEach(function (item, i) {
      var li = h('li', 'wk-news-item' + (item.pinned ? ' is-pinned' : '')), head = h('p', 'wk-news-meta'), time = h('time', '', formatDate(item.date));
      time.dateTime = item.date; head.append(h('span', 'wk-news-tag', item.tag || 'Vision Universe'), time);
      li.append(head, h('h3', '', item.title), h('p', 'wk-news-text', item.text));
      if (item.link) { var a = h('a', 'wk-news-link', item.link.label + ' →'); a.href = item.link.href; li.appendChild(a); }
      if (i >= LIMIT) li.hidden = true;
      list.appendChild(li);
    });
    host.replaceChildren(list);
    if (items.length > LIMIT) {
      var more = h('button', 'wk-more', 'Ältere Neuigkeiten (' + (items.length - LIMIT) + ')'); more.type = 'button';
      more.addEventListener('click', function () { list.querySelectorAll('[hidden]').forEach(function (n) { n.hidden = false; }); more.remove(); });
      host.appendChild(more);
    }
    host.removeAttribute('aria-busy');
  }

  /* ---------- Vollbild-Ansicht der Highlights ---------- */
  var view = null;
  function reduced() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function openStory(id, opener) {
    var index = stories.stories.findIndex(function (s) { return s.id === id; });
    if (index < 0) return;
    if (!view) view = createView();
    view.opener = opener || doc.activeElement;
    view.show(index, 0);
  }

  function createView() {
    var root = h('div', 'wk-story'), stage = h('div', 'wk-story-stage'), bars = h('div', 'wk-story-bars'),
      head = h('div', 'wk-story-head'), who = h('div', 'wk-story-who'), whoIcon = h('span', 'wk-story-who-icon'), whoName = h('strong'),
      controls = h('div', 'wk-story-controls'), pauseBtn = h('button', 'wk-story-ctl'), soundBtn = h('button', 'wk-story-ctl'), closeBtn = h('button', 'wk-story-ctl wk-story-close'),
      body = h('div', 'wk-story-body'), prevZone = h('button', 'wk-story-zone wk-story-prev'), nextZone = h('button', 'wk-story-zone wk-story-next'), live = h('p', 'wk-story-live');
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.hidden = true;
    [pauseBtn, soundBtn, closeBtn, prevZone, nextZone].forEach(function (b) { b.type = 'button'; });
    closeBtn.setAttribute('aria-label', 'Schließen'); closeBtn.textContent = '×';
    prevZone.setAttribute('aria-label', 'Vorherige Folie'); nextZone.setAttribute('aria-label', 'Nächste Folie');
    live.setAttribute('aria-live', 'polite');
    who.append(whoIcon, whoName); controls.append(pauseBtn, soundBtn, closeBtn); head.append(who, controls);
    stage.append(bars, head, body, prevZone, nextZone, live); root.appendChild(stage); doc.body.appendChild(root);

    var state = { story: 0, slide: 0, t: 0, duration: 0, paused: false, muted: false, video: null, raf: 0, last: 0, holdTimer: 0, held: false, skip: false, startX: 0, startY: 0 };
    var api = { opener: null, show: show };
    function all() { return stories.stories; }
    function current() { return all()[state.story]; }
    function fills() { return bars.querySelectorAll('.wk-story-fill'); }

    function show(storyIndex, slideIndex) {
      var wasHidden = root.hidden, story;
      state.story = storyIndex; state.slide = slideIndex; story = current();
      if (wasHidden) {
        root.hidden = false; doc.documentElement.classList.add('wk-story-open');
        doc.addEventListener('keydown', onKey, true);
        closeBtn.focus({ preventScroll: true });
      }
      root.setAttribute('aria-label', 'Erklärvideo ' + story.product);
      whoName.textContent = story.product; whoIcon.replaceChildren(icon(story.icon || 'layers'));
      bars.replaceChildren.apply(bars, story.slides.map(function () { var b = h('span', 'wk-story-bar'); b.appendChild(h('span', 'wk-story-fill')); return b; }));
      render();
    }
    function render() {
      stop();
      var story = current(), slide = story.slides[state.slide];
      fills().forEach(function (f, i) { f.style.transform = 'scaleX(' + (i < state.slide ? 1 : 0) + ')'; });
      state.t = 0; state.duration = Number(slide.duration) || 7; state.paused = false;
      body.replaceChildren(); state.video = null;
      if (slide.type === 'video') {
        var v = h('video', 'wk-story-video');
        v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto'; v.muted = state.muted;
        if (slide.poster) v.poster = slide.poster;
        v.src = slide.src; if (slide.label) v.setAttribute('aria-label', slide.label);
        v.addEventListener('loadedmetadata', function () { if (isFinite(v.duration) && v.duration > 0) state.duration = v.duration; });
        v.addEventListener('ended', next);
        v.addEventListener('error', function () { if (state.video !== v) return; body.replaceChildren(card({ eyebrow: story.product, title: 'Video gerade nicht verfügbar.', text: 'Tippe rechts für weiter.' })); state.video = null; state.t = 0; state.duration = 4; });
        body.appendChild(v); state.video = v;
        var p = v.play(); if (p && p.catch) p.catch(function () { if (!v.muted) { v.muted = state.muted = true; paintSound(); v.play().catch(function () {}); } });
      } else body.appendChild(card(slide));
      live.textContent = story.product + ', Folie ' + (state.slide + 1) + ' von ' + story.slides.length;
      soundBtn.hidden = slide.type !== 'video'; paintSound(); paintPause();
      state.last = performance.now(); state.raf = requestAnimationFrame(tick);
    }
    function card(slide) {
      var c = h('div', 'wk-story-card' + (reduced() ? '' : ' is-animated')), art = h('span', 'wk-story-card-icon');
      art.appendChild(icon(current().icon || 'layers')); c.appendChild(art);
      if (slide.eyebrow) c.appendChild(h('p', 'wk-story-eyebrow', slide.eyebrow));
      c.appendChild(h('h2', 'wk-story-title', slide.title));
      if (slide.text) c.appendChild(h('p', 'wk-story-text', slide.text));
      if (slide.cta) { var a = h('a', 'wk-story-cta', slide.cta.label + ' →'); a.href = slide.cta.href; a.addEventListener('click', close); c.appendChild(a); }
      return c;
    }
    function tick(now) {
      var dt = (now - state.last) / 1000; state.last = now;
      if (!state.paused && !state.held) { if (state.video) state.t = state.video.currentTime || 0; else state.t += dt; }
      var f = fills()[state.slide]; if (f) f.style.transform = 'scaleX(' + Math.min(1, state.t / state.duration) + ')';
      if (!state.video && state.t >= state.duration) { next(); return; }
      state.raf = requestAnimationFrame(tick);
    }
    function stop() { cancelAnimationFrame(state.raf); if (state.video) { var v = state.video; state.video = null; v.pause(); v.removeAttribute('src'); v.load(); } }
    // Eine abgebrochene Story gilt nicht als gesehen; markSeen erst nach der letzten Folie.
    function next() {
      var story = current();
      if (state.slide + 1 < story.slides.length) { state.slide++; render(); return; }
      markSeen(story);
      if (state.story + 1 < all().length) show(state.story + 1, 0); else close();
    }
    function prev() {
      if (state.slide > 0) { state.slide--; render(); return; }
      if (state.story > 0) { show(state.story - 1, all()[state.story - 1].slides.length - 1); return; }
      render();
    }
    function setPaused(p) {
      state.paused = p;
      if (state.video) { if (p || state.held) state.video.pause(); else state.video.play().catch(function () {}); }
      paintPause();
    }
    function paintPause() { pauseBtn.textContent = state.paused ? '▶' : '❚❚'; pauseBtn.setAttribute('aria-label', state.paused ? 'Abspielen' : 'Pause'); }
    function paintSound() { soundBtn.textContent = state.muted ? '🔇' : '🔊'; soundBtn.setAttribute('aria-label', state.muted ? 'Ton an' : 'Ton aus'); }
    function close() {
      if (root.hidden) return;
      stop(); body.replaceChildren(); root.hidden = true;
      doc.documentElement.classList.remove('wk-story-open');
      doc.removeEventListener('keydown', onKey, true);
      var o = api.opener; api.opener = null;
      if (o && o.isConnected) o.focus({ preventScroll: true });
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (e.key === ' ' && !/^(BUTTON|A)$/.test(e.target.tagName)) { e.preventDefault(); setPaused(!state.paused); }
      else if (e.key === 'Tab') { // Fokus bleibt in der Ansicht
        var f = Array.from(root.querySelectorAll('button:not([hidden]),a[href]')).filter(function (n) { return n.offsetParent !== null; });
        if (!f.length) return;
        if (e.shiftKey && doc.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && doc.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    }
    // Tippen links/rechts blaettert, gedrueckt halten pausiert, nach unten wischen schliesst.
    stage.addEventListener('pointerdown', function (e) {
      state.startX = e.clientX; state.startY = e.clientY; state.held = false; state.skip = false;
      clearTimeout(state.holdTimer);
      if (e.target === prevZone || e.target === nextZone) state.holdTimer = setTimeout(function () { state.held = true; if (state.video) state.video.pause(); }, 220);
    }, true);
    function release() {
      clearTimeout(state.holdTimer);
      if (state.held) { state.skip = true; state.held = false; if (state.video && !state.paused) state.video.play().catch(function () {}); }
    }
    stage.addEventListener('pointerup', function (e) {
      release();
      if (e.clientY - state.startY > 110) { state.skip = true; close(); }
    }, true);
    stage.addEventListener('pointercancel', release, true);
    [prevZone, nextZone].forEach(function (zone) {
      zone.addEventListener('click', function (e) {
        var skip = state.skip; state.skip = false;
        if (skip || Math.abs(e.clientX - state.startX) > 40 || Math.abs(e.clientY - state.startY) > 60) return;
        if (zone === nextZone) next(); else prev();
      });
    });
    pauseBtn.addEventListener('click', function () { setPaused(!state.paused); });
    soundBtn.addEventListener('click', function () { state.muted = !state.muted; if (state.video) state.video.muted = state.muted; paintSound(); });
    closeBtn.addEventListener('click', close);
    root.addEventListener('click', function (e) { if (e.target === root) close(); });
    doc.addEventListener('visibilitychange', function () { if (doc.hidden && !root.hidden && !state.paused) setPaused(true); });
    return api;
  }

  /* ---------- Start ---------- */
  function init() {
    var hello = doc.getElementById('wk-hello');
    if (hello) hello.textContent = greeting(new Date().getHours());
    renderProducts(doc.getElementById('wk-products'));
    var hl = doc.getElementById('wk-highlights'), news = doc.getElementById('wk-news');
    getJSON(STORIES).then(function (c) { stories = c; renderHighlights(hl); })
      .catch(function () { hl.closest('section').hidden = true; });
    getJSON(NEWS).then(function (c) { renderNews(news, c); })
      .catch(function () { news.replaceChildren(h('p', 'wk-empty', 'Neuigkeiten sind gerade nicht erreichbar.')); news.removeAttribute('aria-busy'); });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
