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
  // Produktwelten auf der Willkommensseite (4 x 2); Elliott, Hedgefonds und alle weiteren ueber "Alle Produkte" (globales Menue).
  var PRODUCTS = [
    { id: 'discover', name: 'Discover', href: '/discover/#/', text: 'Märkte' },
    { id: 'quant', name: 'Quant', href: '/quant/', text: 'Faktoren' },
    { id: 'fundamental', name: 'Fundamental', href: '/fundamental/#/', text: 'Kennzahlen' },
    { id: 'technical', name: 'Technical', href: '/technical/#/', text: 'Charts' },
    { id: 'supertrader', name: 'Supertrader', href: '/supertrader/', text: 'Methoden' },
    { id: 'screener', name: 'Screener', href: '/screener/', text: 'Aktien finden' },
    { id: 'vorsorge', name: 'Vorsorge', href: '/vorsorge/#/', text: 'ETFs & Rente' },
    { id: 'atlas', name: 'AI Atlas', href: '/ask/', text: 'Frag frei' }
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
      var b = doc.querySelector('[data-story="' + story.id + '"]');
      if (!b) return;
      var done = s[story.id] === story.rev;
      b.classList.toggle('is-seen', done);
      b.setAttribute('aria-label', story.tagline + ' (' + story.product + ', ' + mmss(storyVideo(story)) + ')' + (done ? ', gesehen' : ', neu'));
    });
  }

  /* ---------- Abschnitte ---------- */
  var CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function storyVideo(story) { var v = (story.slides || []).find(function (x) { return x.type === 'video'; }); return v ? v.duration : storyDuration(story); }
  function mmss(sec) { sec = Math.round(sec || 0); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }
  // Erstes Video gross oben, die weiteren als Karten mit Vorschaubild.
  function renderHighlights(host) {
    var list = h('ul', 'wk-hl-list'), firstNew = null, s = seen(), all = stories.stories, top = all[0];
    var hero = doc.getElementById('wk-hero-play');
    if (hero && top) {
      hero.dataset.story = top.id;
      doc.getElementById('wk-hero-img').style.backgroundImage = 'url("' + (top.thumb || '') + '")';
      doc.getElementById('wk-hero-title').textContent = top.tagline || top.title;
      doc.getElementById('wk-hero-dur').textContent = mmss(storyVideo(top));
      doc.getElementById('wk-hero-sub').textContent = 'Vision Universe in ' + Math.round(storyVideo(top)) + ' Sekunden.';
      hero.onclick = function () { openStory(top.id, hero); };
    }
    all.forEach(function (story, i) {
      if (!firstNew && s[story.id] !== story.rev) firstNew = story.id;
      if (i === 0) return;
      var li = h('li'), b = h('button', 'wk-vid'), th = h('span', 'wk-vid-thumb'), play = h('span', 'wk-vid-play');
      b.type = 'button'; b.dataset.story = story.id;
      if (story.thumb) th.style.backgroundImage = 'url("' + story.thumb + '")';
      play.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
      th.append(play, h('span', 'wk-dur', mmss(storyVideo(story))), h('span', 'wk-vid-tag', story.product));
      b.append(th, h('span', 'wk-vid-title', story.tagline || story.title));
      b.addEventListener('click', function () { openStory(story.id, b); });
      li.appendChild(b); list.appendChild(li);
    });
    host.replaceChildren(list); host.removeAttribute('aria-busy');
    // Pfeil rechts blaettert weiter, solange es rechts noch etwas gibt.
    var more = doc.getElementById('wk-hl-more');
    if (more) {
      var sync = function () { more.hidden = host.scrollLeft + host.clientWidth >= host.scrollWidth - 4; };
      more.onclick = function () { host.scrollBy({ left: host.clientWidth * 0.7, behavior: reduced() ? 'auto' : 'smooth' }); };
      host.addEventListener('scroll', sync, { passive: true }); global.addEventListener('resize', sync); sync(); requestAnimationFrame(sync);
      if (global.ResizeObserver) new ResizeObserver(sync).observe(host.firstChild || host);
    }
    var allBtn = doc.getElementById('wk-hl-all');
    if (allBtn) allBtn.onclick = function () { openStory(firstNew || all[0].id, allBtn); };
    paintSeen();
  }
  function renderProducts(host) {
    var list = h('ul', 'wk-products');
    PRODUCTS.forEach(function (p) {
      var li = h('li'), a = h('a', 'wk-product'), ic = h('span', 'wk-product-icon'), go = h('span', 'wk-product-go');
      a.href = p.href; a.dataset.product = p.id;
      ic.appendChild(icon(p.id)); go.innerHTML = CHEVRON;
      a.append(ic, go, h('strong', 'wk-product-name', p.name), h('span', 'wk-product-text', p.text));
      li.appendChild(a); list.appendChild(li);
    });
    host.replaceChildren(list);
    // "Alle Produkte" oeffnet das globale Menue mit allen Welten (auch Elliott, Hedgefonds, Dashboard, Macro, ETF ...).
    var all = doc.getElementById('wk-products-all');
    if (all) all.onclick = function () { var nav = doc.querySelector('vu-navigation'); if (nav && nav.openMenu) nav.openMenu(all); else global.location.href = '/discover/'; };
  }
  function newsItem(item, tag) {
    var li = h(tag || 'li', 'wk-news-item' + (item.pinned ? ' is-pinned' : '')), head = h('p', 'wk-news-meta'), time = h('time', '', formatDate(item.date));
    time.dateTime = item.date; head.append(h('span', 'wk-news-tag', item.tag || 'Vision Universe'), h('span', 'wk-news-dot', '·'), time);
    li.append(head, h('h3', '', item.title), h('p', 'wk-news-text', item.text));
    if (item.link) { var a = h('a', 'wk-news-link', item.link.label + ' →'); a.href = item.link.href; li.appendChild(a); }
    return li;
  }
  // Auf der Startseite steht nur die erste Meldung (angeheftet oder neueste); "Alle Neuigkeiten" zeigt die Liste.
  function renderNews(host, config) {
    var items = sortNews(config.items), copy = h('div', 'wk-news-copy');
    if (!items.length) { host.replaceChildren(h('p', 'wk-empty', 'Noch keine Neuigkeiten.')); host.removeAttribute('aria-busy'); return; }
    var first = newsItem(items[0], 'div');
    copy.append.apply(copy, Array.from(first.childNodes));
    host.replaceChildren(copy, h('span', 'wk-news-art'));
    host.querySelector('.wk-news-art').innerHTML = NEWS_ART;
    host.removeAttribute('aria-busy');
    fitNews(); if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(fitNews);
    if (global.ResizeObserver) new ResizeObserver(function () { requestAnimationFrame(fitNews); }).observe(host); else global.addEventListener('resize', fitNews);
    var all = doc.getElementById('wk-news-all');
    if (all) all.onclick = function () { openNewsSheet(items, all); };
  }
  // Der Text der Meldung bekommt so viele Zeilen, wie auf den Bildschirm passen (Rest mit "…"), statt mitten in der Zeile abzureissen.
  function fitNews() {
    var box = doc.querySelector('.wk-news'), text = box && box.querySelector('.wk-news-text'), title = box && box.querySelector('.wk-news-copy h3');
    if (!text) return;
    text.hidden = false; if (title) title.style.webkitLineClamp = '';
    var bottom = function () { var r = box.getBoundingClientRect(); return r.bottom - parseFloat(getComputedStyle(box).paddingBottom); };
    for (var n = 6; n >= 1; n--) { text.style.webkitLineClamp = String(n); if (text.getBoundingClientRect().bottom <= bottom() + 1) return; }
    text.hidden = true;
    if (title && title.getBoundingClientRect().bottom > bottom() + 1) title.style.webkitLineClamp = '1';
  }
  var NEWS_ART = '<svg viewBox="0 0 160 120" aria-hidden="true"><defs><linearGradient id="wkg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#e6edd6" stop-opacity=".55"/></linearGradient></defs>' +
    '<rect x="30" y="22" width="92" height="70" rx="12" fill="url(#wkg)" stroke="#c8f531" stroke-opacity=".55" transform="rotate(-8 76 57)"/>' +
    '<rect x="44" y="30" width="96" height="72" rx="12" fill="#1a1d17" fill-opacity=".9" stroke="#c8f531" stroke-opacity=".6" transform="rotate(-8 92 66)"/>' +
    '<g transform="rotate(-8 92 66)"><rect x="56" y="42" width="22" height="4" rx="2" fill="#c8f531" opacity=".8"/><rect x="56" y="50" width="34" height="3" rx="1.5" fill="#fff" opacity=".35"/>' +
    '<circle cx="60" cy="90" r="2.4" fill="#fff" opacity=".4"/><circle cx="68" cy="90" r="2.4" fill="#fff" opacity=".4"/><circle cx="76" cy="90" r="2.4" fill="#fff" opacity=".4"/></g>' +
    '<path d="M58 86 78 70l12 8 22-26 14 6 18-30" fill="none" stroke="#c8f531" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 6px rgba(200,245,49,.7))"/>' +
    '<path d="m138 22 9-3-1 10" fill="none" stroke="#c8f531" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function openNewsSheet(items, opener) {
    var back = h('div', 'wk-sheet'), panel = h('div', 'wk-sheet-panel'), head = h('div', 'wk-sheet-head'), close = h('button', 'wk-sheet-close', '×'), list = h('ol', 'wk-sheet-list');
    back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true'); back.setAttribute('aria-label', 'Alle Neuigkeiten');
    close.type = 'button'; close.setAttribute('aria-label', 'Schließen');
    head.append(h('h2', '', 'Alle Neuigkeiten'), close);
    items.forEach(function (item) { list.appendChild(newsItem(item)); });
    panel.append(head, list); back.appendChild(panel); doc.body.appendChild(back);
    doc.documentElement.classList.add('wk-story-open');
    function done() { back.remove(); doc.documentElement.classList.remove('wk-story-open'); doc.removeEventListener('keydown', key, true); if (opener) opener.focus({ preventScroll: true }); }
    function key(e) { if (e.key === 'Escape') { e.preventDefault(); done(); } }
    close.onclick = done; back.onclick = function (e) { if (e.target === back) done(); };
    doc.addEventListener('keydown', key, true); close.focus();
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
  // Sichtbare Hoehe unter der Kopfleiste: die Seite passt auf dem Handy in einen Bildschirm.
  function measureTop() {
    var main = doc.getElementById('wk-main');
    if (main) doc.documentElement.style.setProperty('--wk-top', Math.max(0, Math.round(main.getBoundingClientRect().top + global.scrollY)) + 'px');
  }
  function init() {
    measureTop(); global.addEventListener('resize', measureTop);
    if (global.customElements && customElements.whenDefined) customElements.whenDefined('vu-navigation').then(function () { requestAnimationFrame(measureTop); });
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
