/* =========================================================================
   DISCOVER – EMERGING LEADERS (#/leader)

   Liest discover/data/emerging-leaders/US_REAL.json (Tageslauf
   scripts/discover/build-emerging-leaders.mjs) und zeigt Titel, deren
   relative Staerke, Trend und Volumen sich gerade verbessern.

   Der Evidenzstatus der historischen Studie steht ganz oben und an jeder
   Stelle, an der ein Modellwert erscheint. Ein experimentelles Modell wird
   nie als bestaetigte Prognose gezeigt; Zustaende sind Beschreibungen des
   Kursverlaufs, keine Wahrscheinlichkeiten und keine Kursziele.

   Filter und Sortierung bleiben in der Adresse (#/leader?state=S2&sort=rs),
   die Watchlist teilt sich den Speicher mit Discover (vu-discover-watchlist-v1).
   ========================================================================= */
(function (global) {
  'use strict';
  var D = global.VUDiscover = global.VUDiscover || {};
  var S = global.QuantShell, el = S.el;
  var PATH = '/discover/data/emerging-leaders/';
  var WATCH_KEY = 'vu-discover-watchlist-v1';
  var STATES = {
    S5_ESTABLISHED_LEADER: { kurz: 'Etablierter Leader', tone: 5, text: 'RS-Rang 6 Monate mindestens 90, höchstens 15 % unter dem Jahreshoch, 50-Tage-Linie seit 60 Sitzungen über der 200-Tage-Linie.' },
    S4_BREAKOUT_CONFIRMED: { kurz: 'Ausbruch bestätigt', tone: 4, text: 'In den letzten 5 Sitzungen Schluss über dem 60-Tage-Hoch bei mindestens 1,5-fachem Volumen; Kurs seitdem nicht mehr als 3 % darunter.' },
    S3_BREAKOUT_CANDIDATE: { kurz: 'Ausbruchskandidat', tone: 3, text: 'Schwankung eng (20 Tage höchstens 80 % der 120-Tage-Schwankung oder Bandbreite im unteren Viertel), Kurs höchstens 6 % unter dem 60-Tage-Hoch, über der steigenden 50-Tage-Linie.' },
    S2_MOMENTUM_EMERGING: { kurz: 'Momentum entsteht', tone: 2, text: 'RS-Rang 3 Monate binnen drei Monaten um mindestens 20 Punkte verbessert, heute mindestens 60, Kurs über der steigenden 50-Tage-Linie.' },
    S1_EARLY_ACCUMULATION: { kurz: 'Frühe Akkumulation', tone: 1, text: 'Volumen an Aufwärtstagen mindestens 1,25-mal so hoch wie an Abwärtstagen (50 Tage), mehr Akkumulations- als Distributionstage, RS-Rang 6 Monate höchstens 70.' },
    S0_NONE: { kurz: 'Hoher Modellwert', tone: 0, text: 'Kein Zustand erfüllt, aber im obersten Zehntel des Modellwerts.' }
  };
  var ORDER = ['S1_EARLY_ACCUMULATION', 'S2_MOMENTUM_EMERGING', 'S3_BREAKOUT_CANDIDATE', 'S4_BREAKOUT_CONFIRMED', 'S5_ESTABLISHED_LEADER'];
  var SORTS = [['score', 'Modellwert'], ['rs', 'RS-Verbesserung'], ['new', 'Neuestes Signal'], ['name', 'Name']];
  var EVIDENCE = {
    VALIDATED: { tone: 'ok', kurz: 'Historisch validiert' },
    PARTIAL: { tone: 'mid', kurz: 'Teilweise belegt' },
    EXPERIMENTAL: { tone: 'exp', kurz: 'Experimentell' }
  };
  var cache = {};
  var styles = null;

  function ensureStyles() {
    if (styles) return styles;
    var doc = global.document;
    if (doc.querySelector('link[data-leaders-css]')) return (styles = Promise.resolve(true));
    var link = doc.createElement('link');
    link.rel = 'stylesheet'; link.href = '/discover/ui/leaders.css'; link.setAttribute('data-leaders-css', '');
    styles = new Promise(function (resolve) {
      link.addEventListener('load', function () { resolve(true); });
      link.addEventListener('error', function () { styles = null; link.remove(); resolve(false); });
    });
    doc.head.appendChild(link);
    return styles;
  }
  function load(universeId) {
    var key = universeId || 'US_REAL';
    if (!cache[key]) cache[key] = S.loadJSON(PATH + 'US_REAL.json').catch(function (e) { cache[key] = null; throw e; });
    return cache[key];
  }
  function watchlist() {
    try { var d = JSON.parse(localStorage.getItem(WATCH_KEY) || '[]'); return Array.isArray(d) ? d.filter(function (s) { return /^[A-Z0-9.\-]{1,24}$/.test(s); }).slice(0, 100) : []; }
    catch (_) { return []; }
  }
  function toggleWatch(symbol) {
    var list = watchlist(), i = list.indexOf(symbol);
    if (i >= 0) list.splice(i, 1); else list.unshift(symbol);
    try { localStorage.setItem(WATCH_KEY, JSON.stringify(list.slice(0, 100))); } catch (_) { /* privat */ }
    return i < 0;
  }

  var nf = function (d) { return new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }); };
  function pct(v, d) { if (typeof v !== 'number' || !isFinite(v)) return '–'; return (v > 0 ? '+' : v < 0 ? '−' : '') + nf(d === undefined ? 1 : d).format(Math.abs(v * 100)) + ' %'; }
  function times(v) { return typeof v === 'number' && isFinite(v) ? nf(2).format(v) + '×' : '–'; }
  function datum(iso) { if (!iso) return '–'; var p = iso.split('-'); return p[2] + '.' + p[1] + '.'; }
  function datumLang(iso) { if (!iso) return '–'; var p = iso.split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }
  function zahl(v) { return typeof v === 'number' && isFinite(v) ? new Intl.NumberFormat('de-DE').format(v) : '–'; }

  function parseQuery() {
    var q = {}, h = location.hash, i = h.indexOf('?');
    if (i >= 0) h.slice(i + 1).split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); });
    return q;
  }
  function setQuery(q) {
    var parts = Object.keys(q).filter(function (k) { return q[k]; }).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(q[k]); });
    var next = '#/leader' + (parts.length ? '?' + parts.join('&') : '');
    if (location.hash !== next) history.replaceState(null, '', next);
  }

  function evidenceBox(data) {
    var ev = data.evidence || {}, meta = EVIDENCE[ev.evidenceStatus] || EVIDENCE.EXPERIMENTAL;
    var box = el('section', { class: 'el-evidence', 'data-tone': meta.tone, 'aria-label': 'Evidenzstatus' });
    box.append(
      el('div', { class: 'el-evidence-head' }, [el('span', { class: 'el-evidence-pill', text: meta.kurz }), el('strong', { text: ev.label || meta.kurz })]),
      el('p', { text: ev.evidenceStatus === 'VALIDATED'
        ? 'Das Modell hat in der vorab festgelegten historischen Prüfung die Vergleichsstrategien geschlagen (' + (ev.label || '') + '). Vergangene Ergebnisse sind keine Zusage für die Zukunft.'
        : ev.evidenceStatus === 'PARTIAL'
          ? 'Das Modell hat nur in einem der beiden unabhängigen Prüfzeiträume die vorab festgelegten Bedingungen erfüllt. Zustände und Rangfolge sind Beschreibung, keine Prognose.'
          : 'Die historische Prüfung hat keine belastbare Überlegenheit gegenüber einfachen Vergleichsstrategien (Momentum, relative Stärke) gezeigt – oder steht noch aus. Lies die Liste als Beschreibung des Kursverlaufs, nicht als Prognose.' })
    );
    var h = ev.holdout;
    if (h) {
      var det = el('details', { class: 'el-evidence-more' }), rows = el('div', { class: 'el-evidence-grid' });
      det.append(el('summary', { text: 'Ergebnisse der Prüfzeiträume' }), rows);
      [['HOLDOUT_EARLY', '2008–2015'], ['HOLDOUT_RECENT', '2023–2026']].forEach(function (p) {
        var x = h[p[0]] || {};
        function cell(v) { return v ? pct(v.netBase) + (typeof v.t === 'number' ? ' (t ' + nf(1).format(v.t) + ')' : '') : 'nicht verfügbar'; }
        rows.append(el('div', { class: 'el-evidence-row' }, [el('span', { text: p[1] }), el('span', { text: 'Modell ' + cell(x.model) }), el('span', { text: 'RS 6M ' + cell(x.RS_6M) }), el('span', { text: 'Momentum ' + cell(x.MOM_12_1) })]));
      });
      det.append(el('p', { class: 'el-fine', text: 'Mittlere Überrendite des obersten Zehntels gegen SPY über 63 Handelstage, nach 0,30 % Kosten je Umschlag; Stichtage ohne Vorwissen, einschließlich später delisteter Titel. Vergangene Ergebnisse sind keine Zusage für die Zukunft.' }));
      box.append(det);
    }
    return box;
  }

  function evidenceKurz(data) {
    var ev = data && data.evidence && data.evidence.evidenceStatus;
    return ev === 'VALIDATED' ? '' : (EVIDENCE[ev] || EVIDENCE.EXPERIMENTAL).kurz.toLowerCase();
  }
  function badge(state) {
    var m = STATES[state] || STATES.S0_NONE;
    return el('span', { class: 'el-badge', 'data-tone': String(m.tone), text: m.kurz });
  }
  function metric(label, value, sub) {
    return el('div', { class: 'el-metric' }, [el('span', { class: 'el-metric-label', text: label }), el('strong', { text: value }), sub ? el('span', { class: 'el-metric-sub', text: sub }) : null].filter(Boolean));
  }
  function card(x, data, watched, onWatch) {
    var a = el('article', { class: 'el-card', 'data-state': x.state });
    var star = el('button', { type: 'button', class: 'el-star', 'aria-pressed': String(watched), 'aria-label': 'Watchlist: ' + (x.n || x.s), text: watched ? '★' : '☆' });
    star.onclick = function () { var on = toggleWatch(x.s); star.setAttribute('aria-pressed', String(on)); star.textContent = on ? '★' : '☆'; if (onWatch) onWatch(); };
    var title = el(x.href ? 'a' : 'span', { class: 'el-name', href: x.href || null }, [el('strong', { text: x.n || x.s }), el('span', { class: 'el-ticker', text: x.s + ' · ' + (x.exchange || x.market) })]);
    a.append(el('header', { class: 'el-card-head' }, [title, star]));
    var since = x.sinceAtLeast ? 'seit mind. ' + datum(x.since) : 'seit ' + datum(x.since);
    var st = x.stability || {}, wechselhaft = st.changes >= 4;
    a.append(el('div', { class: 'el-card-state' }, [badge(x.state), el('span', { class: 'el-since', text: since + (x.previous ? ' · vorher ' + (STATES[x.previous] || STATES.S0_NONE).kurz : '') }),
      st.sessionsObserved ? el('span', { class: 'el-stability' + (wechselhaft ? ' is-wechselhaft' : ''), text: 'an ' + st.sessionsInState + ' von ' + st.sessionsObserved + ' Sitzungen' + (wechselhaft ? ' · wechselhaft' : '') }) : null].filter(Boolean)));
    var bar = el('div', { class: 'el-score', role: 'img', 'aria-label': 'Modellwert ' + zahl(x.score) + ' von 100' }, [el('span', { class: 'el-score-fill', style: 'width:' + Math.max(2, Math.min(100, x.score || 0)) + '%' })]);
    a.append(el('div', { class: 'el-score-row' }, [el('span', { class: 'el-metric-label', text: 'Modellwert' + (evidenceKurz(data) ? ' · ' + evidenceKurz(data) : '') }), bar, el('strong', { text: zahl(Math.round(x.score)) })]));
    a.append(el('div', { class: 'el-metrics' }, [
      metric('RS-Rang', zahl(x.rs.p60), typeof x.rs.improve === 'number' ? (x.rs.improve >= 0 ? '+' : '−') + Math.abs(x.rs.improve) + ' in 3 M' : 'ohne Vorwert'),
      metric('1 Monat', pct(x.momentum.ret21), '3 M vs. SPY ' + pct(x.momentum.rel63, 0)),
      metric('Volumen', times(x.volume.relVol), x.volume.upDownRatio ? '↑/↓ ' + times(x.volume.upDownRatio) : '–')
    ]));
    if (x.reasons && x.reasons.length) a.append(el('ul', { class: 'el-reasons' }, x.reasons.slice(0, 3).map(function (t) { return el('li', { text: t }); })));
    a.append(el('footer', { class: 'el-card-foot' }, [el('span', { text: x.lastSignal ? 'Letztes Signal ' + datum(x.lastSignal) : 'Kein Wechsel in ' + (data.history && data.history.sessions || 25) + ' Sitzungen' }),
      x.href ? el('a', { href: x.href, text: 'Zur Aktie →' }) : el('span', { class: 'el-fine', text: 'Keine Discover-Seite' })]));
    return a;
  }

  async function render(root, opts) {
    var active = opts.active, ctx = opts.ctx || {};
    document.title = 'Emerging Leaders — Discover';
    root.classList.add('el-root');
    await ensureStyles();
    if (!active()) return;
    if (ctx.universeId && ctx.universeId !== 'US_REAL' && ctx.universeId !== 'GLOBAL') {
      root.append(el('h1', { text: 'Emerging Leaders' }), el('p', { class: 'v2-lead', text: 'Für europäische Titel liegen keine Tagesreihen mit Volumen vor. Emerging Leaders gibt es deshalb derzeit nur für US-Aktien.' }),
        el('a', { class: 'v2-pill v2-pill-dark', href: '#/', text: 'Zurück zu Discover' }));
      return;
    }
    var data;
    try { data = await load('US_REAL'); } catch (e) { if (!active()) return; throw Error('Emerging Leaders sind gerade nicht verfügbar.'); }
    if (!active()) return;
    var q = parseQuery(), state = q.state && STATES[q.state] ? q.state : '', sort = SORTS.some(function (s) { return s[0] === q.sort; }) ? q.sort : 'score';
    var onlyNew = q.neu === '1', onlyEmerging = q.emerging === '1', onlyWatch = q.watch === '1';

    root.append(
      el('p', { class: 'el-kicker', text: 'Discover · US-Aktien' }),
      el('h1', { class: 'el-title', text: 'Emerging Leaders' }),
      el('p', { class: 'v2-lead', text: 'Aktien, bei denen relative Stärke, Trend und Volumen gerade besser werden – objektiv gemessen, nach jedem Börsenschluss neu berechnet.' }),
      el('p', { class: 'el-stand', text: 'Stand: Schluss ' + datumLang(data.asOf) + ' · ' + zahl(data.universe && data.universe.eligibleToday) + ' US-Titel geprüft · Modell ' + (data.model && data.model.id || '') })
    );
    root.append(evidenceBox(data));

    var counts = (data.states && (data.states.listed || data.states.counts)) || {};
    var chips = el('nav', { class: 'el-chips', 'aria-label': 'Nach Zustand filtern' });
    function chip(id, label, n) {
      var b = el('button', { type: 'button', class: 'el-chip', 'aria-pressed': String(state === id), 'data-tone': id ? String(STATES[id].tone) : '' }, [el('span', { text: label }), n === null ? null : el('span', { class: 'el-chip-n', text: zahl(n) })].filter(Boolean));
      b.onclick = function () { state = state === id && id ? '' : id; sync(); };
      return b;
    }
    var toggles = el('div', { class: 'el-toggles' });
    function toggle(label, get, set) {
      var b = el('button', { type: 'button', class: 'el-toggle', 'aria-pressed': String(get()), text: label });
      b.onclick = function () { set(!get()); b.setAttribute('aria-pressed', String(get())); sync(); };
      return b;
    }
    toggles.append(
      toggle('Neu (≤ 5 Sitzungen)', function () { return onlyNew; }, function (v) { onlyNew = v; }),
      toggle('Vor 3 M nicht in den RS-Top 30 %', function () { return onlyEmerging; }, function (v) { onlyEmerging = v; }),
      toggle('Watchlist', function () { return onlyWatch; }, function (v) { onlyWatch = v; })
    );
    var sortSel = el('select', { class: 'el-sort', 'aria-label': 'Sortierung' }, SORTS.map(function (s) { var o = el('option', { value: s[0], text: s[1] }); if (s[0] === sort) o.selected = true; return o; }));
    sortSel.onchange = function () { sort = sortSel.value; sync(); };
    var tools = el('div', { class: 'el-tools' }, [toggles, el('label', { class: 'el-sort-label' }, [el('span', { text: 'Sortieren' }), sortSel])]);
    var info = el('p', { class: 'el-count', 'aria-live': 'polite' });
    var list = el('div', { class: 'el-list' });
    var more = el('button', { type: 'button', class: 'v2-button el-more', text: 'Weitere anzeigen' });
    root.append(chips, tools, info, list, more);

    /* "neu": Zustand seit hoechstens 5 Sitzungen (Sitzungsdaten liefert der Tageslauf) */
    var sessionDates = (data.history && data.history.dates) || [];
    var newFrom = sessionDates.length >= 5 ? sessionDates[sessionDates.length - 5] : (sessionDates[0] || data.asOf);

    var shown = 24;
    function filtered() {
      var w = watchlist();
      var xs = (data.stocks || []).filter(function (x) {
        if (state && x.state !== state) return false;
        if (onlyNew && !(x.since && !x.sinceAtLeast && x.since >= newFrom && x.state !== 'S0_NONE')) return false;
        if (onlyEmerging && !x.emerging) return false;
        if (onlyWatch && w.indexOf(x.s) < 0) return false;
        return true;
      });
      var by = {
        score: function (a, b) { return (b.score || 0) - (a.score || 0); },
        rs: function (a, b) { return (typeof b.rs.improve === 'number' ? b.rs.improve : -999) - (typeof a.rs.improve === 'number' ? a.rs.improve : -999) || (b.score || 0) - (a.score || 0); },
        'new': function (a, b) { return String(b.lastSignal || '').localeCompare(String(a.lastSignal || '')) || (b.score || 0) - (a.score || 0); },
        name: function (a, b) { return String(a.n || a.s).localeCompare(String(b.n || b.s), 'de'); }
      }[sort];
      return xs.slice().sort(by);
    }
    function draw() {
      var xs = filtered(), w = watchlist();
      S.clear(list);
      xs.slice(0, shown).forEach(function (x) { list.append(card(x, data, w.indexOf(x.s) >= 0, onlyWatch ? function () { draw(); } : null)); });
      info.textContent = xs.length ? zahl(xs.length) + ' Titel' + (state ? ' · ' + STATES[state].kurz : '') : '';
      if (!xs.length) list.append(el('p', { class: 'el-empty', text: onlyWatch ? 'Keine Titel deiner Watchlist erfüllen gerade diese Auswahl.' : 'Keine Titel erfüllen gerade diese Auswahl.' }));
      more.hidden = xs.length <= shown;
    }
    more.onclick = function () { shown += 24; draw(); };
    function sync() {
      S.clear(chips);
      chips.append(chip('', 'Alle', null));
      ORDER.slice().reverse().forEach(function (id) { chips.append(chip(id, STATES[id].kurz, counts[id] || 0)); });
      shown = 24;
      setQuery({ state: state, sort: sort === 'score' ? '' : sort, neu: onlyNew ? '1' : '', emerging: onlyEmerging ? '1' : '', watch: onlyWatch ? '1' : '' });
      draw();
    }
    sync();

    /* Neue Signale */
    var tr = (data.history && data.history.transitions || []).filter(function (t) { return t.to !== 'S0_NONE'; }).slice(0, 12);
    if (tr.length) {
      var byS = {}; (data.stocks || []).forEach(function (x) { byS[x.s] = x; });
      var sec = el('section', { class: 'el-section' }, [el('h2', { text: 'Neue Signale' }), el('p', { class: 'el-fine', text: 'Aufstiege in einen höheren Zustand in den letzten ' + ((data.history && data.history.sessions) || 25) + ' Handelstagen (ohne Hin und Her).' })]);
      var ul = el('ul', { class: 'el-transitions' });
      tr.forEach(function (t) {
        var x = byS[t.s], href = x && x.href;
        ul.append(el('li', {}, [el('span', { class: 'el-tr-date', text: datum(t.date) }), el(href ? 'a' : 'span', { href: href || null, class: 'el-tr-name', text: (x && x.n) || t.s }),
          el('span', { class: 'el-tr-move', text: (STATES[t.from] || STATES.S0_NONE).kurz.replace('Hoher Modellwert', 'ohne Zustand') + ' → ' }), badge(t.to)]));
      });
      sec.append(ul); root.append(sec);
    }

    /* Methodik */
    var defs = el('details', { class: 'el-section el-method' }, [el('summary', { text: 'So entstehen die Zustände' })]);
    ORDER.slice().reverse().forEach(function (id) { defs.append(el('div', { class: 'el-def' }, [badge(id), el('p', { text: STATES[id].text })])); });
    defs.append(el('p', { class: 'el-fine', text: 'Geprüft wird von „Etablierter Leader“ abwärts; der erste zutreffende Zustand gilt. Der Modellwert ist der Rang im heutigen Querschnitt (0–100) aus relativer Stärke, Trendwende, Volumen und Kompression' + ((data.model && data.model.id) === 'M2_TECH_FUND_EQUAL' ? ' sowie Umsatz- und Margenentwicklung' : '') + '. Keine Wahrscheinlichkeit, kein Kursziel.' }));
    defs.append(el('p', { class: 'el-fine', text: 'Zustände gelten für den jeweiligen Tagesschluss und können täglich wechseln. „An X von 25 Sitzungen“ zeigt, wie beständig ein Zustand zuletzt war; „wechselhaft“ heißt mindestens vier Wechsel. Als neues Signal zählt nur ein Aufstieg, der nicht bloß ein Hin und Her der letzten Tage ist.' }));
    defs.append(el('p', { class: 'el-fine', text: 'Gezeigt werden höchstens ' + ((data.states && data.states.listLimit) || 400) + ' Titel mit dem höchsten Modellwert. Universum: US-Stammaktien mit Kurs ≥ 5 USD und ≥ 5 Mio. USD Tagesumsatz (20 Tage). Nur Tagesschlusskurse – Intraday gibt es kein Volumen je Titel.' }));
    root.append(defs);
    root.append(el('aside', { class: 'el-europe' }, [el('strong', { text: 'Europa' }), el('p', { text: (data.europe && data.europe.reason) || 'Für Europa liegen keine Tagesreihen mit Volumen vor.' })]));
    root.append(el('p', { class: 'el-fine el-disclaimer', text: data.disclaimer || 'Keine Anlageempfehlung.' }));
  }

  /* Startseite: Eingang unter "Im Blick" (featured.js), ohne die Auswahl zu verdraengen. */
  function teaser(ctx) {
    var a = el('a', { class: 'v2-world-more el-teaser', href: '#/leader', text: 'Emerging Leaders →' });
    a.hidden = true;
    if (!ctx || ctx.universeId === 'US_REAL') load('US_REAL').then(function (d) {
      if (!d || !d.stocks || !d.stocks.length) return;
      var k = evidenceKurz(d);
      if (k) a.textContent = 'Emerging Leaders (' + k + ') →';
      a.hidden = false;
    }).catch(function () {});
    return a;
  }

  D.Leaders = { render: render, teaser: teaser, ensureStyles: ensureStyles };
})(window);
