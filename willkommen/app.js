/* Home (/willkommen/): erste Seite nach der Anmeldung und Ziel des Dock-Platzes „Home“. Aufbau genau nach Prototyp „App-Konzept 2“,
   Bildschirm #v-home (Owner 15.11.2026): große Karte (Gruß, Ziel, nächster Schritt; mit Watchlist der Kreis „im Plus“),
   Story-Kreise mit Fenster, „Markt heute“ mit Fenster, „Deine Aktien“ (Watchlist als Schiene, nur mit Konto und Einträgen),
   „Dein Universe“ (sechs Module mit ihrer Zahl), „Heute zu lesen“. Darunter im selben Design, was Home zusätzlich hat:
   weitere Artikel, „Kurz erklärt“ (config/stories.json), Neuigkeiten (config/news.json), „Weiter“, „Daten & Hinweise“.
   Tagesrunde, Serie, Quiz, Stufen und Community aus dem Prototyp sind zurückgestellt und stehen nicht auf der Seite.
   Jede Zahl kommt aus einer veröffentlichten Datei der jeweiligen Welt; fehlt sie, fehlt der Block oder die Zahl.
   stories.json und news.json werden von Hand gepflegt; die Pruefregeln liegen in validateStories() und validateNews()
   und laufen in willkommen/tests. "Gesehen" merkt sich der Browser je Story und Fassung (rev).
   Bausteine aus assets/vu-ui.js (VUUI): popup, closeSheet, logo, chg, hud, themeIcon, legal, next. */
(function (global) {
  'use strict';
  var STORIES = '/willkommen/config/stories.json', NEWS = '/willkommen/config/news.json', INSIGHTS = '/insights/artikel.json';
  var PULSE = '/quant/data/market/intelligence/market-pulse.json', SNAPSHOT = '/quant/data/market/multi-asset/snapshot.json';
  var RADAR = '/quant/data/product/radar-home-v1.json.gz', TECH_META = '/technical/data/meta.json', ST_SUMMARY = '/supertrader/data/sf-candidates/summary.json';
  // Die sechs Module des Prototyps in seiner Reihenfolge; alle zehn stehen hinter „Alle Module“.
  var HOME_MODULES = ['quant', 'supertrader', 'technical', 'fundamental', 'hedgefonds', 'screener'];
  // Themen der Story-Kreise wie im Prototyp (Slug und Reihe aus discover/themes.js, in willkommen/tests geprüft).
  var THEMES = [{ slug: 'kernenergie-uran', label: 'Kernenergie', title: 'Kernenergie & Uran', rowId: 'thema-kernenergie-uran' }, { slug: 'raumfahrt', label: 'Raumfahrt', title: 'Raumfahrt', rowId: 'thema-raumfahrt' }];
  var SEEN_KEY = 'vu-welcome-seen-v1', ICONS = '/assets/product-icons.svg#';
  var MIN_S = 15, MAX_S = 45;

  // Neun Welten in der Reihenfolge des Menue-Rasters (assets/site-navigation.js), danach AI Atlas als eigene Zeile (Mockup E02).
  var PRODUCTS = [
    { id: 'discover', name: 'Discover', href: '/discover/#/', text: 'Aktien entdecken' },
    { id: 'quant', name: 'Quant', href: '/quant/', text: 'Faktoren je Aktie' },
    { id: 'technical', name: 'Technical', href: '/technical/#/', text: 'Charts und Muster' },
    { id: 'fundamental', name: 'Fundamental', href: '/fundamental/#/', text: 'Zahlen aus Unternehmensberichten' },
    { id: 'supertrader', name: 'Supertrader', href: '/supertrader/', text: 'Methoden der Profis' },
    { id: 'hedgefonds', name: 'Hedgefonds', href: '/hedgefonds/', text: 'Was Investoren halten' },
    { id: 'elliott', name: 'Elliott', href: '/elliott/', text: 'Wellenstruktur' },
    { id: 'screener', name: 'Screener', href: '/screener/', text: 'Eigene Filter' },
    { id: 'vorsorge', name: 'Vorsorge', href: '/vorsorge/#/', text: 'Sparplan und Rente' },
    { id: 'atlas', name: 'AI Atlas', href: '/ask/', text: 'Frag in deinen Worten' }
  ];
  // Ziel aus der Startseite („Wo stehst du?“, Schluessel vu-start-path) mit dem naechsten Schritt.
  var GOALS = {
    anfaenger: { label: 'Dein Ziel: Mit einem Sparplan anfangen', step: 'Starte mit dem Vorsorge-Planer', href: '/vorsorge/#/plan' },
    verstehen: { label: 'Dein Ziel: Eine Aktie verstehen', step: 'Starte mit NVIDIA im Überblick', href: '/discover/#/s/US_REAL/NVDA' },
    profi: { label: 'Dein Ziel: Wie ein Profi analysieren', step: 'Starte mit den Methoden', href: '/supertrader/strategies/' }
  };
  var NO_GOAL = { label: 'Noch kein Ziel gewählt', step: 'Wähle deinen Einstieg in drei Schritten', href: '/willkommen/start/' };
  function goalFor(key) { return GOALS[key] || NO_GOAL; }
  /* Ziel-Karte (E02): Wahl aus dem ersten Start (willkommen/start/prefs.js, Konto zuerst), sonst „Wo stehst du?“ der Startseite. */
  function goalCard(me) {
    var S = global.VUStart;
    if (!S) { var g = null; try { g = global.localStorage.getItem('vu-start-path'); } catch (e) { g = null; } return goalFor(g); }
    var eff = S.effective(me);
    return eff.goal ? S.goalCard(eff.goal) : S.NO_GOAL;
  }
  var DAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  var MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  function dayLine(d) { return DAYS[d.getDay()] + ', ' + d.getDate() + '. ' + MONTHS[d.getMonth()]; }

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

  /* ---------- Reine Helfer für die Blöcke des Prototyps (in willkommen/tests geprüft) ---------- */
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function de(v, d) { return Number(v).toLocaleString('de-DE', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function signed(v, d) { return (v > 0 ? '+' : v < 0 ? '−' : '±') + de(Math.abs(v), d) + ' %'; }
  function formatShort(iso) { var p = String(iso || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : ''; }
  function validInsight(a) { return a && typeof a.titel === 'string' && a.titel && /^\d{4}-\d{2}-\d{2}$/.test(a.datum || '') && /^\/insights\/[a-z0-9-]+\/$/.test(a.href || ''); }
  /* Markt heute aus dem Market Pulse: Lage (Lage n von 5), Anteil über der 200-Tage-Linie, Zeilen aus den veröffentlichten Messwerten. */
  var PULSE_ROWS = [['BREADTH', 'Marktbreite'], ['TREND', 'Trend'], ['RISK', 'Schwankung'], ['CROSS_ASSET', 'Andere Märkte']];
  function marketView(pulse) {
    var env = pulse && pulse.kind === 'DESCRIPTIVE_MARKET_PULSE' && pulse.environment, b = pulse && pulse.dimensions && pulse.dimensions.BREADTH, raw = b && b.raw;
    if (!env || env.state == null || !env.label || !Array.isArray(env.scale) || !isNum(env.level) || !raw || !isNum(raw.above200Pct)) return null;
    var share = Math.round(raw.above200Pct), g = pulse.gauges || {};
    return {
      label: env.label, level: env.level + 1, levels: env.scale.length, share: share, asOf: (pulse.evaluation && pulse.evaluation.dataAsOf) || (b && b.asOf) || null,
      say: (share < 50 ? 'Nur ' : '') + share + ' von 100 Aktien über ihrer 200-Tage-Linie.',
      statement: env.statement || '', explanation: env.explanation || '', disclaimer: env.disclaimer || '',
      dimensions: ['BREADTH', 'MOMENTUM', 'RISK'].map(function (k) { var x = pulse.dimensions[k]; return x && x.label && x.summary ? { label: x.label, summary: x.summary } : null; }).filter(Boolean),
      rows: PULSE_ROWS.map(function (r) {
        var x = g[r[0]];
        if (!x || !isNum(x.value) || !isNum(x.min) || !isNum(x.max) || x.max <= x.min || !x.valueText) return null;
        return { label: r[1], text: x.valueText, pct: Math.round(Math.max(0, Math.min(1, (x.value - x.min) / (x.max - x.min))) * 100) };
      }).filter(Boolean)
    };
  }
  /* Vier Märkte, gemessen an ihren Trackern (wie Discover › Märkte): Tagesänderung aus dem Multi-Asset-Snapshot. */
  var TRACKERS = [['QQQ', 'Nasdaq 100'], ['SPY', 'S&P 500'], ['DIA', 'Dow Jones'], ['FEZ', 'Euro Stoxx']];
  function indexChips(snap) {
    var list = (snap && snap.instruments) || [];
    return TRACKERS.map(function (t) {
      var c = list.filter(function (x) { return x && x.instrument && x.instrument.symbol === t[0]; })[0], q = c && c.quote, ch = q && q.change;
      if (!q || q.state !== 'AVAILABLE' || !ch || ch.semantics !== 'PERCENT_OF_VALUE' || !isNum(ch.percent)) return null;
      return { symbol: t[0], name: t[1], pct: ch.percent, title: ((c.tracker && c.tracker.tracksIndexName) || t[1]) + ', gemessen am Tracker ' + t[0] + (q.asOf ? ', Schluss ' + formatShort(q.asOf) : '') };
    }).filter(Boolean);
  }
  /* Zahl je Modul, nur aus der Zusammenfassung, die die Welt selbst veröffentlicht. Fehlt sie oder passt das Schema nicht: null. */
  var moduleFacts = {
    quant: function (r) {
      if (!r || r.schemaVersion !== 'quant-radar-home-1.0.0' || !isNum(r.cardCount)) return null;
      var s = r.summary || {};
      return { value: de(r.cardCount), label: 'Meldungen' + (r.asOf ? ' am ' + formatShort(r.asOf).slice(0, 6) : ''), bars: [s.newSetups, s.weakenedSetups, s.newStrategyMatches, s.newHighs].filter(isNum),
        barsLabel: 'Meldungen nach Art: neue Setups, schwächere Setups, neu in einem Anlagestil, neue Jahreshochs' };
    },
    technical: function (m) {
      var f = m && m.schemaVersion === 'vu-technical-meta-1.0.0' && m.formations;
      if (!f) return null;
      var kinds = ['ASCENDING_TRIANGLE', 'SYMMETRICAL_TRIANGLE', 'DESCENDING_TRIANGLE'], bars = [];
      kinds.forEach(function (k) { ['DETECTED', 'CONFIRMED'].forEach(function (st) { if (isNum(f[k + ':' + st])) bars.push(f[k + ':' + st]); }); });
      if (!bars.length) return null;
      return { value: de(bars.reduce(function (a, b) { return a + b; }, 0)), label: 'Dreiecke im Markt', bars: bars, barsLabel: 'Dreiecke nach Art: steigend, symmetrisch, fallend, je erkannt und bestätigt' };
    },
    supertrader: function (s) {
      var by = s && s.schema === 'supertrader-sf8-candidates-1.0.0' && s.counts && s.counts.byStage;
      if (!by || !isNum(by.CONFIRMED_RESEARCH_SETUP)) return null;
      return { value: de(by.CONFIRMED_RESEARCH_SETUP), label: 'Regeln erfüllt · Forschung, nicht zertifiziert', bars: [by.MODELED_TRADE_PLAN, by.CONFIRMED_RESEARCH_SETUP, by.CHART_CANDIDATE].filter(isNum),
        barsLabel: 'Aktien nach Stand: modellierter Ablauf, Regeln erfüllt, Chart-Kandidat' };
    }
  };
  /* Themenreihe aus Discover: wie viele der gezeigten Aktien am Stichtag im Plus lagen. */
  function themeStats(row) {
    var cards = ((row && row.cards) || []).filter(function (c) { return c && c.changePercent && isNum(c.changePercent.value); });
    if (cards.length < 3) return null;
    var up = cards.filter(function (c) { return c.changePercent.value > 0; }).length;
    return { up: up, total: cards.length, text: up + ' von ' + cards.length + ' Aktien im Thema lagen am ' + formatShort(row.asOf).slice(0, 6) + ' im Plus.' };
  }
  /* Story-Kreise in der Reihenfolge des Prototyps: Markt, Aktie, Magazin, Thema, Aktie, Aktie, Thema. */
  function storyList(m, insights) {
    var out = [], arts = [], seenT = {};
    ((insights && insights.artikel) || []).filter(validInsight).forEach(function (a) {
      var t = a.ticker && a.ticker[0];
      if (!t || seenT[t] || arts.length >= 3 || !/^[A-Z][A-Z0-9.\-]{0,9}$/.test(t)) return;
      seenT[t] = true;
      arts.push({ id: 'aktie-' + t, kind: 'aktie', label: t, ticker: t, stamp: a.slug || a.href, slides: [{ pill: a.rubrik || 'Insights', title: a.titel, text: a.teaser || '', cta: { label: 'Artikel lesen', href: a.href } }] });
    });
    var mag = insights && Array.isArray(insights.magazin) && insights.magazin[0], themes = THEMES.map(function (t) {
      return { id: 'thema-' + t.slug, kind: 'thema', label: t.label, title: t.title, slug: t.slug, rowId: t.rowId, stamp: (insights && insights.artikel && insights.artikel[0] && insights.artikel[0].datum) || 'x', slides: null, cta: { label: 'Thema ansehen', href: '/discover/#/thema/' + t.slug } };
    });
    if (m) {
      var cta = { label: 'Märkte ansehen', href: '/discover/#/maerkte' };
      out.push({ id: 'markt', kind: 'markt', label: 'Markt', stamp: m.asOf || 'x', slides: [{ pill: 'Markt heute', title: m.label + '.', text: m.statement || m.say, cta: cta }].concat(m.dimensions.map(function (x) { return { pill: 'Markt heute', title: x.label + '.', text: x.summary, cta: cta }; })) });
    }
    if (arts[0]) out.push(arts[0]);
    if (mag && mag.titel && /^\/insights\/magazin\/[a-z0-9-]+\/$/.test(mag.href || '') && /^\/insights\//.test(mag.cover || '')) {
      out.push({ id: 'magazin', kind: 'magazin', label: 'Magazin', image: mag.cover, stamp: String(mag.nr || mag.datum), slides: [{ pill: 'Aktienmagazin' + (mag.nr ? ' · Nr. ' + mag.nr : ''), title: mag.titel, text: [mag.kw ? 'Kalenderwoche ' + mag.kw : '', mag.seiten ? mag.seiten + ' Seiten' : ''].filter(Boolean).join(' · '), cta: { label: 'Magazin öffnen', href: mag.href } }] });
    }
    if (themes[0]) out.push(themes[0]);
    arts.slice(1).forEach(function (a) { out.push(a); });
    themes.slice(1).forEach(function (t) { out.push(t); });
    return out;
  }

  var api = { PRODUCTS: PRODUCTS, GOALS: GOALS, goalFor: goalFor, goalCard: goalCard, dayLine: dayLine, validateStories: validateStories, validateNews: validateNews, sortNews: sortNews, storyDuration: storyDuration, greeting: greeting, formatDate: formatDate, MIN_S: MIN_S, MAX_S: MAX_S,
    HOME_MODULES: HOME_MODULES, THEMES: THEMES, marketView: marketView, indexChips: indexChips, moduleFacts: moduleFacts, themeStats: themeStats, storyList: storyList, signed: signed, formatShort: formatShort };
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
  var CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function storyVideo(story) { var v = (story.slides || []).find(function (x) { return x.type === 'video'; }); return v ? v.duration : storyDuration(story); }
  function mmss(sec) { sec = Math.round(sec || 0); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }
  function fetchJson(path) { return fetch(path, { cache: 'default', credentials: 'omit' }).then(function (r) { if (!r.ok) throw new Error('HTTP_' + r.status); return r.json(); }); }
  function fetchGz(path) {
    return fetch(path, { cache: 'default', credentials: 'omit' }).then(function (r) {
      if (!r.ok || typeof DecompressionStream !== 'function') throw new Error('GZ');
      return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json();
    });
  }
  function U() { return global.VUUI; }
  function esc(s) { return U().esc(s); }

  /* „Kurz erklärt“ (zusätzlicher Block im Design des Prototyps): Start-Video als Bildkarte, die weiteren Erklärvideos als Schiene. */
  function renderHighlights(host) {
    var list = h('ul', 'wk-hl-list'), firstNew = null, s = seen(), all = stories.stories, top = all[0];
    var hero = doc.getElementById('wk-hero-play');
    if (hero && top) {
      hero.dataset.story = top.id;
      doc.getElementById('wk-hero-img').style.backgroundImage = 'url("' + (top.thumb || '') + '")';
      doc.getElementById('wk-hero-title').textContent = top.tagline || top.title;
      doc.getElementById('wk-hero-dur').textContent = '· ' + mmss(storyVideo(top));
      doc.getElementById('wk-hero-sub').textContent = 'Vision Universe in ' + Math.round(storyVideo(top)) + ' Sekunden';
      hero.onclick = function () { openStory(top.id, hero); };
    }
    all.forEach(function (story, i) {
      if (!firstNew && s[story.id] !== story.rev) firstNew = story.id;
      if (i === 0) return;
      var li = h('li'), b = h('button', 'wk-vid wk-tap'), th = h('span', 'wk-vid-thumb');
      b.type = 'button'; b.dataset.story = story.id;
      if (story.thumb) th.style.backgroundImage = 'url("' + story.thumb + '")';
      var copy = h('span', 'wk-vid-copy');
      copy.append(h('span', 'wk-vid-title', story.tagline || story.title), h('span', 'wk-vid-tag', story.product));
      th.append(h('span', 'wk-dur', mmss(storyVideo(story))), copy);
      b.append(th);
      b.addEventListener('click', function () { openStory(story.id, b); });
      li.appendChild(b); list.appendChild(li);
    });
    host.replaceChildren(list); host.removeAttribute('aria-busy');
    var allBtn = doc.getElementById('wk-hl-all');
    if (allBtn) allBtn.onclick = function () { openStory(firstNew || all[0].id, allBtn); };
    paintSeen();
  }

  /* „Dein Universe“ (Prototyp modt): sechs Module in zwei Spalten, je Symbol, Name, große Zahl mit Zeile und kleine Säulen.
     Die Zahl steht nur, wenn die Welt sie selbst veröffentlicht (moduleFacts); sonst steht die Zeile des Moduls. „Alle Module“
     öffnet das Menü mit allen Welten; ohne Menü die Liste aller zehn Module im Fenster. */
  function miniBars(values, label) {
    var a = (values || []).filter(isNum), mx = Math.max.apply(null, a) || 1;
    if (a.length < 2) return '';
    return '<svg class="wk-mini" width="' + ((a.length - 1) * 9 + 6) + '" height="34" role="img" aria-label="' + esc(label || '') + '">' + a.map(function (v, i) {
      var bh = Math.max(3, Math.round(v / mx * 32));
      return '<rect' + (i === a.length - 1 ? ' class="is-last"' : '') + ' x="' + i * 9 + '" y="' + (34 - bh) + '" width="6" height="' + bh + '" rx="2"/>';
    }).join('') + '</svg>';
  }
  function productTile(p, fact) {
    return '<li><a class="wk-product wk-tap" href="' + esc(p.href) + '" data-product="' + esc(p.id) + '"><span class="wk-product-top">' + U().hud(p.id, 36, 11) +
      '<span class="wk-product-go">' + CHEVRON + '</span></span><strong class="wk-product-name">' + esc(p.name) + '</strong><span class="wk-product-row"><span>' +
      (fact ? '<b class="wk-product-n wk-num">' + esc(fact.value) + '</b>' : '') + '<span class="wk-product-text">' + esc(fact ? fact.label : p.text) + '</span></span>' +
      (fact ? miniBars(fact.bars, fact.barsLabel) : '') + '</span></a></li>';
  }
  var facts = {};
  function renderProducts(host) {
    host.innerHTML = '<ul class="wk-products">' + HOME_MODULES.map(function (id) { var p = PRODUCTS.filter(function (x) { return x.id === id; })[0]; return productTile(p, facts[id]); }).join('') + '</ul>'; /* nur maskierte Werte */
    var all = doc.getElementById('wk-products-all');
    if (all) all.onclick = function () {
      var nav = doc.querySelector('vu-navigation');
      if (nav && nav.openMenu) { nav.openMenu(all); return; }
      U().popup({ id: 'wk-all-pop', cls: 'wk-pop', title: 'Alle Module', body: '<ul class="wk-all">' + PRODUCTS.map(function (p) {
        return '<li><a href="' + esc(p.href) + '">' + (p.id === 'atlas' ? '<span class="vu-hud">' + U().glyph('spark', 20) + '</span>' : U().hud(p.id, 40)) + '<span><b>' + esc(p.name) + '</b><small>' + esc(p.text) + '</small></span></a></li>';
      }).join('') + '</ul>' });
    };
  }
  function loadFacts(host) {
    function done(id, fact) { if (fact) { facts[id] = fact; renderProducts(host); } }
    fetchGz(RADAR).then(function (r) { done('quant', moduleFacts.quant(r)); }).catch(function () {});
    fetchJson(TECH_META).then(function (m) { done('technical', moduleFacts.technical(m)); }).catch(function () {});
    fetchJson(ST_SUMMARY).then(function (s) { done('supertrader', moduleFacts.supertrader(s)); }).catch(function () {});
  }

  function newsItem(item, tag) {
    var li = h(tag || 'li', 'wk-news-item' + (item.pinned ? ' is-pinned' : '')), head = h('p', 'wk-news-meta'), time = h('time', '', formatDate(item.date));
    time.dateTime = item.date; head.append(h('span', 'wk-news-tag', item.tag || 'Vision Universe'), h('span', 'wk-news-dot', '·'), time);
    li.append(head, h('h3', '', item.title), h('p', 'wk-news-text', item.text));
    if (item.link) { var a = h('a', 'wk-news-link', item.link.label + ' →'); a.href = item.link.href; li.appendChild(a); }
    return li;
  }
  // Auf Home steht nur die erste Meldung (angeheftet oder neueste); "Alle Neuigkeiten" zeigt die Liste im Fenster.
  function renderNews(host, config) {
    var items = sortNews(config.items);
    if (!items.length) { host.replaceChildren(h('p', 'wk-empty', 'Noch keine Neuigkeiten.')); host.removeAttribute('aria-busy'); return; }
    host.replaceChildren.apply(host, Array.from(newsItem(items[0], 'div').childNodes));
    host.removeAttribute('aria-busy');
    var all = doc.getElementById('wk-news-all');
    if (all) all.onclick = function () { openNewsSheet(items); };
  }
  /* „Alle Neuigkeiten“ im gemeinsamen Fenster (VUUI.popup: Griff, Fokusfalle, Escape, Fokus zurueck zum Ausloeser). */
  function openNewsSheet(items) {
    var list = h('ol', 'wk-sheet-list');
    items.forEach(function (item) { list.appendChild(newsItem(item)); });
    if (global.VUUI && global.VUUI.popup) global.VUUI.popup({ id: 'wk-news-pop', title: 'Alle Neuigkeiten', body: list });
  }

  /* „Markt heute“ (Prototyp: Bogen 150 px, Lage als Pille, ein Satz, vier Märkte). Quelle: der veröffentlichte Market Pulse
     (quant/data/market/intelligence/market-pulse.json) und die Tagesänderung der vier Markt-Tracker aus dem Multi-Asset-Snapshot –
     dieselben Dateien wie Discover › Märkte. Ein Tipp öffnet das Fenster (sh-markt). */
  function gaugeSvg(pct, w) {
    var r = w / 2 - 12, c = Math.PI * r, d = 'M12 ' + w / 2 + 'A' + r + ' ' + r + ' 0 0 1 ' + (w - 12) + ' ' + w / 2;
    return '<svg width="' + w + '" height="' + (w / 2 + 8) + '" viewBox="0 0 ' + w + ' ' + (w / 2 + 8) + '" aria-hidden="true"><path d="' + d + '" stroke-width="14"/><path class="is-on" d="' + d + '" stroke-width="14" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - Math.max(0, Math.min(100, pct)) / 100)).toFixed(1) + '"/></svg>';
  }
  function gauge(pct, w) { return '<span class="wk-gauge" role="img" aria-label="' + esc(pct + ' von 100') + '">' + gaugeSvg(pct, w) + '<b class="wk-num">' + esc(pct + ' %') + '</b></span>'; }
  var market = null;
  function renderMarket(pulse) {
    var box = doc.getElementById('wk-markt'), host = doc.getElementById('wk-markt-box'), m = marketView(pulse);
    if (!box || !host || !m || !U()) return;
    market = m;
    host.innerHTML = '<button class="wk-tile wk-tap" id="wk-markt-open" type="button" aria-haspopup="dialog"><span class="wk-mk-row">' + gauge(m.share, 150) +
      '<span class="wk-mk-copy"><span class="wk-pill wk-pill--wh">' + esc(m.label) + '</span><span class="wk-mk-say">' + esc(m.say) + '</span></span></span><span class="wk-mk-ix" id="wk-mk-ix" hidden></span></button>'; /* nur maskierte Werte */
    doc.getElementById('wk-markt-open').onclick = openMarket;
    box.hidden = false;
    fetchJson(SNAPSHOT).then(function (snap) {
      var chips = indexChips(snap), ix = doc.getElementById('wk-mk-ix');
      if (!ix || chips.length < 2) return;
      ix.innerHTML = chips.map(function (c) { return '<span' + (c.pct > 0 ? ' class="is-up"' : '') + ' title="' + esc(c.title) + '"><small>' + esc(c.name) + '</small><b>' + esc(signed(c.pct, 1)) + '</b></span>'; }).join('');
      ix.hidden = false;
    }).catch(function () { /* ohne Snapshot bleibt die Zeile der Märkte weg */ });
  }
  function openMarket() {
    var m = market;
    if (!m) return;
    U().popup({ id: 'wk-markt-pop', cls: 'wk-pop', title: '', body: '<h2 class="wk-m-h">' + esc(m.label) + '</h2><p class="wk-m-sub">' + esc('Lage ' + m.level + ' von ' + m.levels + (m.asOf ? ' · Schluss ' + formatShort(m.asOf) : '')) + '</p>' +
      '<div class="wk-m-g">' + gauge(m.share, 280) + '</div><p class="wk-m-c">der beobachteten US-Aktien liegen über ihrer 200-Tage-Linie</p>' +
      m.rows.map(function (r) { return '<div class="wk-m-row"><div><b>' + esc(r.label) + '</b><b>' + esc(r.text) + '</b></div><div class="wk-bar"><i style="width:' + r.pct + '%"></i></div></div>'; }).join('') +
      (m.statement ? '<div class="wk-m-card"><div class="wk-eb">Was dahinter steht</div><p>' + esc(m.statement) + '</p>' + (m.disclaimer ? '<small>' + esc(m.disclaimer) + '</small>' : '') + '</div>' : '') +
      '<a class="wk-btn wk-tap" href="/discover/#/maerkte">Märkte öffnen</a>' });
  }

  /* Story-Kreise (Prototyp story, Fenster sh-story): Markt, Aktien der jüngsten Artikel, Magazin, Themen. Jede Story zeigt nur
     Veröffentlichtes: Market Pulse, /insights/artikel.json, die Themenreihe aus Discover. „Gesehen“ merkt sich der Browser je Story
     und Datenstand (grauer Ring). */
  var STORY_SEEN = 'vu-home-stories-v1', MARKT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V11M9.3 20V5M14.7 20v-7M20 20V8"/></svg>';
  function storySeen() { try { return JSON.parse(localStorage.getItem(STORY_SEEN) || '{}') || {}; } catch (e) { return {}; } }
  function storyMark(s) {
    var m = storySeen(); m[s.id] = s.stamp;
    try { localStorage.setItem(STORY_SEEN, JSON.stringify(m)); } catch (e) { /* privater Modus: nur ohne Merken */ }
    var b = doc.querySelector('[data-wk-story="' + s.id + '"]'); if (b) b.classList.add('is-seen');
  }
  function storyArt(s, big) {
    if (s.kind === 'markt') return MARKT_ICON;
    if (s.kind === 'thema') return U().themeIcon(s.slug, big ? 84 : 28);
    if (s.kind === 'magazin') return '<img src="' + esc(s.image) + '" alt="" loading="lazy" decoding="async">';
    return U().logo(s.ticker);
  }
  var homeStories = [];
  function renderStories(pulse, insights) {
    var host = doc.getElementById('wk-stories');
    if (!host || !U()) return;
    homeStories = storyList(marketView(pulse), insights);
    if (!homeStories.length) { host.hidden = true; return; }
    var seenMap = storySeen();
    host.innerHTML = homeStories.map(function (s) {
      return '<div role="listitem"><button class="wk-story-b wk-tap' + (seenMap[s.id] === s.stamp ? ' is-seen' : '') + '" type="button" aria-haspopup="dialog" data-wk-story="' + esc(s.id) + '" aria-label="' + esc(s.label + ': kurz und aktuell') + '"><span class="wk-story-r"><span class="wk-story-i">' + storyArt(s, false) + '</span></span><span class="wk-story-t">' + esc(s.label) + '</span></button></div>';
    }).join(''); /* nur maskierte Werte */
    host.hidden = false;
    host.onclick = function (e) { var b = e.target.closest && e.target.closest('[data-wk-story]'); if (b) openHomeStory(b.getAttribute('data-wk-story')); };
  }
  function themeSlides(s) {
    return fetchJson('/discover/data/rows/US_REAL/' + s.rowId + '.json').then(function (row) {
      var t = themeStats(row);
      return [{ pill: 'Thema', title: s.title, text: t ? t.text : (row && row.subtitle) || '', cta: s.cta }];
    }, function () { return [{ pill: 'Thema', title: s.title, text: '', cta: s.cta }]; });
  }
  function openHomeStory(id) {
    var at = homeStories.findIndex(function (s) { return s.id === id; }), slide = 0, el = null;
    if (at < 0) return;
    function slides(s) { return s.slides ? Promise.resolve(s.slides) : themeSlides(s).then(function (x) { s.slides = x; return x; }); }
    function paint() {
      var s = homeStories[at];
      slides(s).then(function (list) {
        if (!el || !el.isConnected) return;
        var sl = list[slide], last = slide === list.length - 1, body = el.querySelector('.vu-sheet-body');
        body.innerHTML = '<div class="wk-s"><div class="wk-s-bars" aria-hidden="true">' + list.map(function (_, i) { return '<i' + (i <= slide ? ' class="is-on"' : '') + '></i>'; }).join('') + '</div>' +
          '<div class="wk-s-art" aria-hidden="true">' + storyArt(s, true) + '</div><div class="wk-s-ct"><span class="wk-pill wk-pill--sm">' + esc(sl.pill + (list.length > 1 ? ' · ' + (slide + 1) + ' von ' + list.length : '')) + '</span>' +
          '<h2 class="wk-s-h' + (sl.title.length > 28 ? ' is-long' : '') + '">' + esc(sl.title) + '</h2><p class="wk-s-p">' + esc(sl.text) + '</p><div class="wk-s-act">' +
          '<a class="wk-btn wk-tap" href="' + esc(sl.cta.href) + '">' + esc(sl.cta.label) + '</a><button class="wk-btn wk-btn--ol wk-tap" type="button" data-wk-next>' + (last && at === homeStories.length - 1 ? 'Fertig' : 'Weiter') + '</button></div></div></div>'; /* nur maskierte Werte */
        el.querySelector('.vu-sheet-ui').setAttribute('aria-label', s.label + ': ' + sl.title);
        if (last) storyMark(s);
        body.querySelector('[data-wk-next]').onclick = function () {
          if (!last) { slide++; paint(); return; }
          if (at < homeStories.length - 1) { at++; slide = 0; paint(); return; }
          U().closeSheet(el);
        };
      });
    }
    el = U().popup({ id: 'wk-story-pop', cls: 'wk-pop', title: '', body: '<div class="wk-s"></div>' });
    paint();
  }
  /* „Daten & Hinweise“ am Seitenende: der freigegebene Hinweis aus assets/legal-notices.json (VUUI.legal), unverändert. */
  function openNotes() {
    U().popup({ id: 'wk-notes-pop', cls: 'wk-pop', title: 'Daten & Hinweise', body: U().legal('footer') + '<a class="wk-btn wk-btn--ol wk-tap" href="/infos/#quellen">Datenquellen und Methodik</a>' });
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
  // Rueckmeldung nach Konto-Schritten (/konto/ leitet nach E-Mail-Bestaetigung bzw. bestaetigter Zahlung hierher).
  // Nur feste Texte; der Parameter wird danach aus der Adresse entfernt.
  var FLASH = {
    verified: { title: 'E-Mail bestätigt. Schön, dass du da bist.', sub: 'Dein Konto ist eingerichtet, Tarif Free.' },
    pro: { title: 'Willkommen bei Pro. Dein Abo ist aktiv.', sub: 'Bestätigt von Stripe. Alles Weitere unter Konto.' }
  };
  function flash() {
    var box = doc.getElementById('wk-flash'), key = null, timer = 0;
    try { key = new URLSearchParams(global.location.search).get('konto'); } catch (e) { key = null; }
    if (!box || !FLASH[key]) return;
    doc.getElementById('wk-flash-title').textContent = FLASH[key].title;
    doc.getElementById('wk-flash-sub').textContent = FLASH[key].sub;
    box.hidden = false;
    function hide() { clearTimeout(timer); box.hidden = true; }
    doc.getElementById('wk-flash-x').onclick = hide;
    // Schließt sich selbst; bei reduzierter Bewegung etwas länger sichtbar.
    timer = setTimeout(hide, reduced() ? 12000 : 8000);
    try { global.history.replaceState(null, '', global.location.pathname + global.location.hash); } catch (e) { /* nur Komfort */ }
  }
  /* „Deine Aktien“ (Prototyp big): je Aktie eine Karte 164 px mit Logo, Tagesbewegung, Name, einer Zeile und der Kurslinie bis an
     den Rand. Dieselben Daten wie bisher (core/watchlist-view.js, mein-dashboard/today.js); die Zeile nennt den Schluss und, wenn
     es eines gibt, das jüngste Ereignis der Welten (mein-dashboard/events.js, ohne Forschungs-Zeilen). Nur mit Konto und Einträgen.
     Jede Karte trägt data-vu-stock für das Vorschau-Fenster des Rahmens; ohne Fenster folgt der Tipp dem href. Die Zusammenfassung
     („wie viele im Plus“) steht im Kreis der großen Karte oben. */
  function cleanName(n) { return String(n || '').replace(/,? (Inc|Corp|Corporation|Ltd|Limited|plc|N\.V\.|S\.A\.|AG|SE|Holdings?|Co)\.?$/i, '').replace(/ Class [A-Z]$/, '').trim(); }
  function thin(values, n) {
    if (values.length <= n) return values;
    var out = [], step = (values.length - 1) / (n - 1);
    for (var i = 0; i < n - 1; i++) out.push(values[Math.round(i * step)]);
    out.push(values[values.length - 1]);
    return out;
  }
  var sparkId = 0;
  function sparkArea(values, up) {
    var v = thin((values || []).filter(isNum), 34), w = 164, ht = 60;
    if (v.length < 2) return '';
    var mn = Math.min.apply(null, v), mx = Math.max.apply(null, v), id = 'wk-g' + (++sparkId);
    var d = v.map(function (p, i) { return (i ? 'L' : 'M') + (i / (v.length - 1) * w).toFixed(1) + ' ' + (ht - 4 - (p - mn) / (mx - mn || 1) * (ht - 8)).toFixed(1); }).join('');
    return '<svg viewBox="0 0 ' + w + ' ' + ht + '" preserveAspectRatio="none"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8f531" stop-opacity=".38"/><stop offset="1" stop-color="#c8f531" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + d + 'L' + w + ' ' + ht + 'L0 ' + ht + 'Z" fill="url(#' + id + ')"/><path class="wk-line' + (up ? ' is-up' : '') + '" d="' + d + '"/></svg>';
  }
  var WATCH_SHOWN = 12;
  function paintDay(sum, total) {
    var arc = doc.getElementById('wk-day-arc'), num = doc.getElementById('wk-day-num'), move = doc.getElementById('wk-day-move');
    if (!arc || !num || !sum || !sum.measured) return;
    arc.setAttribute('stroke-dasharray', (226.2 * sum.up / sum.measured).toFixed(1) + ' 226.2');
    num.textContent = sum.up + '/' + sum.measured;
    doc.getElementById('wk-day-ring').setAttribute('title', sum.up + ' von ' + sum.measured + ' deiner Aktien im Plus');
    if (move && sum.biggest) { move.textContent = sum.biggest.ticker + ' ' + U().pct(sum.biggest.pct); move.hidden = false; }
  }
  function renderWatch(A) {
    var C = global.VUCore || {}, W = C.WatchlistView, Id = C.Identity, T = global.VUToday, E = global.VUDashboardEvents, box = doc.getElementById('wk-watch');
    if (!box || !W || !Id || !U() || !T) return;
    A.get('/v1/watchlist').then(function (r) {
      var items = r.ok && r.data && r.data.items ? r.data.items.slice().sort(function (a, b) { return String(b.addedAt || '').localeCompare(String(a.addedAt || '')); }) : [];
      if (!items.length) return;
      var keys = items.map(function (i) { return i.ticker && Id.normalizeTicker(i.ticker) ? Id.shardKey(i.ticker) : null; }).filter(Boolean);
      return W.load(fetchJson, keys, null).then(function (res) {
        var ix = W.index(res.doc), views = items.map(function (i) { return W.view(ix, i, new Date()); });
        return T.load(fetchJson, Id, views, WATCH_SHOWN).then(function (moves) {
          views.forEach(function (v, k) { var m = moves[k] || {}; v.pct = typeof m.pct === 'number' ? m.pct : null; v.spark = m.values || []; });
          var shown = views.slice(0, WATCH_SHOWN);
          paintDay(T.summary(shown), items.length);
          doc.getElementById('wk-watch-all').textContent = 'Alle ' + items.length + ' ›';
          function paint(events) {
            doc.getElementById('wk-watch-rail').innerHTML = shown.map(function (v) {
              var priced = v.price && v.price.state !== 'UNAVAILABLE' && typeof v.price.close === 'number';
              var href = (v.links || []).filter(function (l) { return l.product === 'discover'; }).map(function (l) { return l.href; })[0] || '/mein-dashboard/';
              var name = cleanName(v.name) || v.ticker || '–', close = priced ? U().money(v.price.close, v.price.currency) : 'kein Kurs';
              var card = events ? events.cards.filter(function (c) { return c.ticker === v.ticker; })[0] : null;
              var row = card ? card.rows.filter(function (x) { return !x.research && !x.state; })[0] : null;
              var sub = row ? row.text + ' · ' + close : [close, v.ticker].filter(Boolean).join(' · ');
              return '<div role="listitem"><a class="wk-st wk-tap" href="' + esc(href) + '"' + (v.ticker ? ' data-vu-stock="' + esc(v.ticker) + '" data-vu-stock-name="' + esc(name) + '"' : '') +
                ' aria-label="' + esc(name + ', ' + close + (priced && isNum(v.pct) ? ', ' + U().movementLabel(U().pct(v.pct)) : '')) + '"><span class="wk-st-top">' + U().logo(v.ticker || '–') + (priced ? U().chg(v.pct, { digits: 2 }) : '') + '</span>' +
                '<b class="wk-st-name">' + esc(name) + '</b><span class="wk-st-sub">' + esc(sub) + '</span><span class="wk-st-chart" aria-hidden="true">' + (priced ? sparkArea(v.spark, v.pct > 0) : '') + '</span></a></div>';
            }).join(''); /* nur maskierte Werte und VUUI-Markup */
          }
          paint(null);
          box.hidden = false;
          if (!E) return;
          var stocks = shown.filter(function (v) { return v.ticker; }).map(function (v) { return { ticker: v.ticker, name: cleanName(v.name) || v.ticker, funds13f: v.funds13f }; });
          E.load(fetchJson, fetchGz, Id, stocks, {}).then(function (data) { paint(E.compose(stocks, data)); }).catch(function () { /* ohne Ereignisse bleibt die Zeile beim Schluss */ });
        });
      });
    }).catch(function () { /* ohne Kurse bleibt der Abschnitt verborgen; die Watchlist steht unter „Ich“ */ });
  }
  /* „Heute zu lesen“ (Prototyp cover, 230 px): der neueste Artikel der Insights (products/insights/build.mjs schreibt
     /insights/artikel.json) als Bildkarte mit Rubrik, Titel, Logo und Datum. Die nächsten drei stehen darunter als zusätzlicher
     Block „Mehr aus den Insights“. Nur gelesen; fehlt die Liste, bleiben beide Abschnitte weg. */
  function insightCard(a, big) {
    var card = h('a', 'wk-cover wk-tap' + (big ? '' : ' wk-cover--s')), img = h('span', 'wk-cover-img'), copy = h('span', 'wk-cover-ct'), meta = h('span', 'wk-cover-meta');
    card.href = a.href;
    if (internal(a.bild)) img.style.backgroundImage = 'url("' + encodeURI(a.bild) + '")';
    img.setAttribute('aria-hidden', 'true');
    var time = h('time', '', formatDate(a.datum)); time.dateTime = a.datum;
    if (global.VUUI && a.ticker && a.ticker[0]) { var lg = h('span', 'wk-cover-logo'); lg.innerHTML = global.VUUI.logo(a.ticker[0]); meta.appendChild(lg.firstChild); /* nur VUUI-Markup */ }
    meta.appendChild(time);
    copy.append(h('span', 'wk-pill wk-pill--sm', a.rubrik || 'Insights'), h('strong', 'wk-cover-h', a.titel), meta);
    card.append(img, copy);
    return card;
  }
  function isoDay(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function renderRead(config) {
    var box = doc.getElementById('wk-read'), host = doc.getElementById('wk-read-list'), more = doc.getElementById('wk-read-more'), rail = doc.getElementById('wk-read-rail');
    var list = (config && Array.isArray(config.artikel) ? config.artikel : []).filter(validInsight).slice(0, 4);
    if (!box || !host || !list.length) return;
    doc.getElementById('wk-read-title').textContent = list[0].datum === isoDay(new Date()) ? 'Heute zu lesen' : 'Zuletzt in den Insights';
    host.replaceChildren(insightCard(list[0], true));
    box.hidden = false;
    if (!more || !rail || list.length < 2) return;
    rail.replaceChildren.apply(rail, list.slice(1).map(function (a) { var li = h('div'); li.setAttribute('role', 'listitem'); li.appendChild(insightCard(a, false)); return li; }));
    more.hidden = false;
  }
  function init() {
    // Erster Start (E11) erscheint einmal nach der E-Mail-Bestätigung, vor Mein Bereich; nicht im Pro-Bestellweg (?konto=pro).
    try {
      if (new URLSearchParams(global.location.search).get('konto') === 'verified' && global.VUStart && !global.VUStart.read().done) {
        global.location.replace('/willkommen/start/?konto=verified'); return;
      }
    } catch (e) { /* ohne Speicher: kein erster Start */ }
    var now = new Date(), title = doc.getElementById('wk-title'), date = doc.getElementById('wk-date');
    if (date) date.textContent = dayLine(now);
    if (title) title.textContent = greeting(now.getHours());
    var card = doc.getElementById('wk-goal');
    function paintGoal(me) { var goal = goalCard(me); if (card) { card.href = goal.href; doc.getElementById('wk-goal-label').textContent = goal.label.replace(/^Dein Ziel: /, 'Ziel: '); doc.getElementById('wk-goal-step').textContent = goal.step; } }
    paintGoal(null);
    // Anzeigename aus dem Konto (GET /v1/me), nur wenn Konten verbunden sind und jemand angemeldet ist.
    var A = global.VUAccount;
    if (A && A.available && A.available() && title) A.get('/v1/session').then(function (r) {
      if (!(r.ok && r.data && r.data.authenticated)) return null;
      renderWatch(A);
      return A.get('/v1/me').then(function (m) {
        if (!m.ok) return null;
        // Z1: Wahl aus dem ersten Start ohne Anmeldung einmal ins Konto übernehmen (willkommen/start/prefs.js#adopt).
        return (global.VUStart ? global.VUStart.adopt(A, m.data) : Promise.resolve(m.data)).then(function (me) {
          var n = me && me.profile && me.profile.displayName; if (n) title.textContent = greeting(now.getHours()) + ', ' + n; paintGoal(me);
        });
      });
    }).catch(function () {});
    // Dock (Home aktiv) und Reiter „Mein Bereich“.
    if (global.VUNavigation) global.VUNavigation.dock({});
    var products = doc.getElementById('wk-products');
    renderProducts(products); loadFacts(products);
    flash();
    var notes = doc.getElementById('wk-notes'); if (notes) notes.onclick = openNotes;
    var nextBox = doc.getElementById('wk-next'), first = PRODUCTS[0];
    if (nextBox && global.VUUI && global.VUUI.next) nextBox.innerHTML = global.VUUI.next({ title: first.name, sub: first.text, href: first.href }); /* nur VUUI-Markup */
    var hl = doc.getElementById('wk-highlights'), news = doc.getElementById('wk-news');
    getJSON(STORIES).then(function (c) { stories = c; renderHighlights(hl); })
      .catch(function () { hl.closest('section').hidden = true; });
    // Markt und Artikel speisen auch die Story-Kreise; fehlt eine Quelle, fehlen nur ihre Kreise.
    var pulse = fetchJson(PULSE).then(function (p) { renderMarket(p); return p; }, function () { return null; });
    var insights = getJSON(INSIGHTS).then(function (c) { renderRead(c); return c; }, function () { return null; });
    Promise.all([pulse, insights]).then(function (r) { renderStories(r[0], r[1]); });
    getJSON(NEWS).then(function (c) { renderNews(news, c); })
      .catch(function () { news.replaceChildren(h('p', 'wk-empty', 'Neuigkeiten sind gerade nicht erreichbar.')); news.removeAttribute('aria-busy'); });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
