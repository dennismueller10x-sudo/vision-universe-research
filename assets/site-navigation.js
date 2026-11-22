// Central navigation for every page. Add new menu entries only here.
(() => {
  // No gesture payload in the normal browser (including Discover's budget).
  if (typeof document !== 'undefined' && !document.querySelector('[data-vu-gestures-loader]') && (globalThis.Capacitor?.isNativePlatform?.() || /VUApp\/1/.test(navigator.userAgent) || new URLSearchParams(location.search).get('vuGestures') === '1')) {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/assets/vu-gestures.css'; document.head.append(css);
    const js = document.createElement('script'); js.setAttribute('data-vu-gestures-loader', ''); js.src = '/assets/vu-gestures.js'; document.head.append(js);
  }
  // K2 (Owner 07.11.2026, App-Gefuehl): Seitenwechsel gleiten vor/zurueck (View Transitions zwischen Dokumenten,
  // CSS in site-navigation.css), die Produkt-Leiste bleibt stehen, Produktziele sind beim Tippen schon geladen.
  if (typeof document !== 'undefined' && !globalThis.__vuMotion) {
    globalThis.__vuMotion = true;
    // Entscheidung im alten Dokument (pageswap): dort ist dieses Skript sicher geladen; im neuen Dokument laeuft es oft
    // erst nach pagereveal. Vorwaerts gleitet die neue Seite von rechts herein (CSS). Zurueck und Neuladen ohne zweite
    // Animation: zurueck schiebt in der App schon die native Randgeste, im Browser die Geste des Browsers.
    const wanted = activation => !!(activation && activation.navigationType !== 'traverse' && activation.navigationType !== 'reload');
    const flag = value => { try { if (value) sessionStorage.setItem('vu-vt-skip', '1'); else { const v = sessionStorage.getItem('vu-vt-skip'); sessionStorage.removeItem('vu-vt-skip'); return v === '1'; } } catch (_) { /* ohne Speicher */ } return false; };
    addEventListener('pageswap', e => { if (e.viewTransition && !wanted(e.activation)) { e.viewTransition.skipTransition(); flag(true); } });
    // Ein aus dem bfcache wiederhergestelltes Dokument startet seinen Uebergang selbst; das Merkzeichen des alten haelt es an.
    addEventListener('pagereveal', e => { if (flag(false) && e.viewTransition) e.viewTransition.skipTransition(); });
    // Vorladen: Einstiege der Produkte und Leistenziele, einmal je Seite nach Ruhe, nie bei Datensparen/2G.
    const warm = () => {
      const c = navigator.connection;
      if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) return;
      const here = location.pathname, seen = new Set([here]);
      const dock = document.getElementById('vu-dock');
      const hrefs = ['/discover/', '/quant/', '/technical/', '/fundamental/', '/supertrader/']
        .concat(Array.from((dock && dock.shadowRoot || document).querySelectorAll('a[href]')).map(a => a.getAttribute('href')));
      const urls = [];
      hrefs.forEach(h => { try { const u = new URL(h, location.href); if (u.origin === location.origin && !/^\/konto\//.test(u.pathname) && !seen.has(u.pathname)) { seen.add(u.pathname); urls.push(u.pathname); } } catch (_) { /* ungueltig */ } });
      const list = urls.slice(0, 4);
      if (!list.length) return;
      if (globalThis.HTMLScriptElement && HTMLScriptElement.supports && HTMLScriptElement.supports('speculationrules')) {
        const rules = document.createElement('script'); rules.type = 'speculationrules';
        rules.textContent = JSON.stringify({prefetch: [{urls: list, eagerness: 'immediate'}],
          prerender: [{where: {and: [{href_matches: '/*'}, {not: {href_matches: '/konto/*'}}]}, eagerness: 'moderate'}]});
        document.head.append(rules);
      } else {
        // WebKit ohne Speculation Rules: HTTP-Cache mit dem HTML der Ziele fuellen (nacheinander, niedrige Prioritaet).
        list.reduce((p, u) => p.then(() => fetch(u, {credentials: 'same-origin', priority: 'low'}).then(r => r.ok && r.arrayBuffer()).catch(() => {})), Promise.resolve());
      }
    };
    const idle = globalThis.requestIdleCallback || (fn => setTimeout(fn, 1));
    const later = () => setTimeout(() => idle(warm, {timeout: 4000}), 3000);
    if (document.readyState === 'complete') later(); else addEventListener('load', later, {once: true});
  }
  // Idempotent: im Gastbetrieb (/elliott/#/<T>) laedt das Quant-Buendel des Release die Shell ein zweites Mal mit.
  if (customElements.get && customElements.get('vu-navigation')) return;
  // Product links navigate directly; their separate disclosure opens existing routes.
  const groups = [
    /* Portfolios (Owner 06.11.2026): alle Musterdepots gesammelt; breite Kachel unter dem 3 x 3-Raster. */
    {id:'discover', label:'Discover', href:'/discover/#/', icon:'discover', claim:'Aktien entdecken', entries:[['Übersicht','/discover/#/','⌂'],['Themen','/discover/#/welten','◎'],['Strategien','/discover/#/strategien','◬'],['Swipen','/discover/#/einzeln/US_REAL','◇'],['Suchen','/discover/#/suche','⌕'],['Märkte','/discover/#/maerkte','≋'],['Watchlist','/discover/#/watchlist','♡'],['Alle Reihen','/discover/#/reihen','▦']]},
    {id:'quant', label:'Quant', href:'/quant/', icon:'quant', claim:'Faktoren je Aktie', entries:[['Übersicht','/quant/','⌂'],['Quant Screener','/quant/#/screener','⧩'],['Anlagestile','/quant/#/stile','◬'],['Meldungen','/quant/#/meldungen','◉'],['Aktien','/quant/#/aktien','⌁'],['Forschung','/quant/#/forschung','◇'],['Methodik','/quant/#/methodik','▤'],['Technische Lagen','/quant/#/chartlagen','⌁'],['Fundamentaldaten','/quant/#/aktie/NVDA/zahlen','▧']]},
    {id:'technical', label:'Technical', href:'/technical/#/', icon:'technical', claim:'Charts und Muster', entries:[['Übersicht','/technical/#/','⌂'],['Screener','/technical/#/screener','⧩'],['Chart Studio','/technical/#/chart','⌁'],['Vorlagen','/technical/#/screener?reiter=vorlagen','◇'],['Gespeichert','/technical/#/screener/gespeichert','▤'],['Muster','/technical/#/muster','▤'],['Lernen','/technical/#/lernen','✧']]},
    {id:'fundamental', label:'Fundamental', href:'/fundamental/#/', icon:'fundamental', claim:'Zahlen aus Geschäftsberichten', entries:[['Übersicht','/fundamental/#/','⌂'],['Ranglisten','/fundamental/#/ranglisten','◇'],['Branchen','/fundamental/#/branchen','◇'],['Suchen','/fundamental/#/suche','⌕'],['Methodik','/fundamental/#/methodik','▤']]},
    {id:'supertrader', label:'Supertrader', href:'/supertrader/', icon:'supertrader', claim:'Methoden der Profis', entries:[['Übersicht','/supertrader/','⌂'],['Methoden','/supertrader/strategies/','⚑'],['Treffer','/supertrader/treffer/','◬'],['Forschung','/supertrader/forschung/','▧'],['Quellen','/supertrader/sources/','▤']]},
    {id:'hedgefonds', label:'Hedgefonds', href:'/hedgefonds/', icon:'hedgefonds', claim:'Was Investoren halten', entries:[['Übersicht','/hedgefonds/','⌂'],['Investoren','/hedgefonds/#/investoren','♙'],['Datenbank','/hedgefonds/#/datenbank','▧'],['Aktien','/hedgefonds/#/aktien','⌁'],['Gruppen-Käufe','/hedgefonds/#/gruppen-kaeufe','◬']]},
    {id:'elliott', label:'Elliott', href:'/elliott/', icon:'elliott', claim:'Wellenstruktur', entries:[['Übersicht','/elliott/','⌂'],['Zählbar','/elliott/#/?zaehlbar=1','◬'],['Aufwärts','/elliott/#/?richtung=auf','↗'],['Abwärts','/elliott/#/?richtung=ab','↘'],['Neu und verändert','/elliott/#/?neu=1','✧'],['Suchen','/elliott/#/?suche=1','⌕']]},
    {id:'screener', label:'Screener', href:'/screener/', icon:'screener', claim:'Eigene Filter', entries:[['Übersicht','/screener/','⌂'],['Filter hinzufügen','/screener/?view=build','⧩'],['Treffer','/screener/?view=results','⌕'],['Gespeichert','/screener/?view=saved','▤'],['Watchlist','/screener/?view=watchlist','♡']]},
    {id:'vorsorge', label:'Vorsorge', href:'/vorsorge/#/', icon:'vorsorge', claim:'Sparplan und Rente', entries:[['Vorsorge Home','/vorsorge/#/','☂'],['Planer','/vorsorge/#/plan','◬'],['ETFs','/vorsorge/#/etfs','◫'],['Portfolio','/vorsorge/#/portfolio','◎'],['Vergleichen','/vorsorge/#/vergleichen','⧩'],['Förderung','/vorsorge/#/foerderung','✧'],['Veränderungen','/vorsorge/#/monitor','≋'],['Wissen','/vorsorge/#/wissen','▤']]},
    {id:'portfolios', label:'Portfolios', href:'/portfolios/', icon:'portfolios', claim:'Alle Musterdepots: Supertrader, Quant, KI', entries:[['Übersicht','/portfolios/','⌂'],['Supertrader','/portfolios/#/supertrader','⚑'],['Quant','/portfolios/#/quant','⧩'],['KI-Depots','/portfolios/#/ki','✧']]},
    {id:'insights', label:'Insights', href:'/insights/', icon:'insights', claim:'Tagesthemen, Aktienmagazin und Reports', entries:[['Artikel','/insights/','▤'],['Aktienmagazin','/insights/magazin/','▣'],['Reports','/insights/reports/','▥']]},
    {id:'more', label:'Weitere Produkte', href:null, icon:'layers', claim:'', entries:[['Dashboard','/dashboard/','▧'],['Macro','/macro/','≋'],['ETF','/etf/','◫'],['Analysten','/analysten/','◇'],['News','/news/','▤'],['Academy','/academy/','✧'],['Guide','/guide/','◈'],['Budget','/budget/','▦']]}
  ];
  /* Mein Bereich im Menue (Mockup N3). */
  const MINE = [['Mein Dashboard','/mein-dashboard/','person'],['Watchlist','/konto/watchlist/','heart'],['Konto und Tarif','/konto/','gear']];
  /* Rahmen (Owner 14.11.2026, App-Konzept 2): EIN Dock auf jeder Seite, die eine Leiste anfordert:
     Home · Discover · [Universe] · News · Ich (DOCK). Der runde Knopf in der Mitte oeffnet „Dein Universe“,
     das GLOBALE Menue dieser Komponente. Die Bereiche eines Produkts stehen als Reiter unter dem Kopf:
     zuerst die frueheren Leistenplaetze (items: [PRODUKT] [Funktion] [Funktion] [Funktion]; der erste traegt
     immer den Produktnamen, nie "Home"/"Start", und fuehrt zur Startseite des Produkts), danach die uebrigen
     Eintraege der Menueliste „In <Welt>“ (tabEntries). Ziele sind die bestehenden Routen der Produkte.
     active(loc) liefert die id des aktiven Platzes oder null; dann zeigt nur der Kopf, in welchem Produkt man ist.
     dockPage(loc): Seiten ohne Produkt-Reiter, die das Dock ebenfalls anfordern duerfen (Insights).
     late(pfad): Seiten, die die Leiste nicht oder erst nach dem Laden anfordern; ueberall sonst steht die
     Reiterzeile vom ersten Zeichnen an (kein Sprung des Inhalts, wenn das Produkt die Leiste meldet). */
  const hashPart = (loc, i) => (loc.hash.replace(/^#\/?/, '').split('?')[0].split('/')[i] || '');
  /* Elliott ist ein eigenes Produkt. Seine Startseite liegt unter /elliott/; die Detailansicht einer Aktie (Chartbild) rendert die Quant-SPA
     unter #/elliott/<TICKER> und gehoert fuer die Shell trotzdem zu Elliott (nur noch ein Altlink: die SPA leitet auf /elliott/#/<T>
     um). Das native Aktienbild /elliott/#/<T> hat den Pfad /elliott/. match bekommt Pfad UND Adresse. */
  const isElliottDetail = (p, loc) => p === '/quant/' && !!loc && /^#\/elliott(\/|$|\?)/.test(loc.hash || '');
  const PRODUCTS = [
    {id: 'discover', label: 'Discover', match: p => p.startsWith('/discover/'),
      items: [['discover','Discover','/discover/#/','discover'],['entdecken','Swipen','/discover/#/einzeln/US_REAL','explore'],['welten','Themen','/discover/#/welten','worlds'],['strategien','Strategien','/discover/#/strategien','strategies']],
      active: loc => {
        const k = hashPart(loc, 0);
        if (!k) return 'discover';
        if (k === 'c' && hashPart(loc, 1) === 'EUROPE') return 'discover';
        if (k === 'c') { const themes = globalThis.VUDiscover?.Views?.Themes; return themes && themes.byRow(hashPart(loc, 2)) ? 'welten' : 'strategien'; }
        return {welten: 'welten', thema: 'welten', strategien: 'strategien', einzeln: 'entdecken', swipen: 'entdecken'}[k] || null;
      }},
    {id: 'elliott', label: 'Elliott', match: (p, loc) => p.startsWith('/elliott/') || isElliottDetail(p, loc),
      items: [['elliott','Elliott','/elliott/','elliott'],['zaehlbar','Zählbar','/elliott/#/?zaehlbar=1','wave'],['neu','Neu','/elliott/#/?neu=1','spark'],['suche','Suche','/elliott/#/?suche=1','search']],
      active: loc => {
        if (loc.pathname !== '/elliott/') return null;
        if (hashPart(loc, 0)) return null;   // Aktienbild /elliott/#/<T>: nur Produktkontext
        const q = new URLSearchParams((loc.hash || '').split('?')[1] || '');
        if (q.get('suche') === '1') return 'suche';
        if (q.get('neu') === '1') return 'neu';
        if (q.get('zaehlbar') === '1' || q.get('welle') === '3' && !q.get('richtung') && !q.get('status') && !q.get('rolle')) return 'zaehlbar';
        return q.get('welle') || q.get('richtung') || q.get('status') || q.get('rolle') ? null : 'elliott';
      }},
    {id: 'quant', label: 'Quant', match: (p, loc) => p.startsWith('/quant/') && !isElliottDetail(p, loc),
      items: [['quant','Quant','/quant/#/','quant'],['screener','Screener','/quant/#/screener','screener','Quant Screener'],['strategien','Anlagestile','/quant/#/stile','strategies'],['aktien','Aktien','/quant/#/aktien','stocks']],
      active: loc => {
        const legacy = {'/quant/screener/': 'screener', '/quant/strategies/': 'strategien', '/quant/strategies/builder/': 'strategien', '/quant/stock/': 'aktien', '/quant/technical/': 'aktien', '/quant/ranking/': 'aktien', '/quant/methodology/': 'quant'}[loc.pathname];
        if (legacy) return legacy;
        if (loc.pathname !== '/quant/') return null;
        const k = hashPart(loc, 0);
        /* Q00: Methodik und Backtest gehören zum Start „Quant“, Technische Lagen zu „Aktien“. Konzept Quant 2026-11: Meldungen,
           Anlagestile (#/stile) und Forschung heißen neu; die alten Adressen leiten weiter und markieren dasselbe. */
        return {'': 'quant', radar: 'quant', meldungen: 'quant', methodik: 'quant', backtest: 'quant', forschung: 'quant', screener: 'screener', strategien: 'strategien', stile: 'strategien', aktien: 'aktien', aktie: 'aktien', vergleich: 'aktien', chartlagen: 'aktien'}[k] || null;
      }},
    /* Fundamental: eigenes Produkt. #/<TICKER> ist die Unternehmensseite (nur Produktkontext); Entdecken und Suche sind
       Ansichten der Startseite, die fundamental/app.js (VUFundamental.Model.parseRoute) liest. */
    {id: 'fundamental', label: 'Fundamental', match: p => p.startsWith('/fundamental/'),
      /* Redesign 2027 (F01–F05): Ranglisten · Branchen · Methodik; die Suche steht im Kopf (#/suche bleibt erreichbar). */
      items: [['fundamental','Fundamental','/fundamental/#/','fundamental'],['ranglisten','Ranglisten','/fundamental/#/ranglisten','explore'],['branchen','Branchen','/fundamental/#/branchen','worlds'],['methodik','Methodik','/fundamental/#/methodik','table']],
      active: loc => loc.pathname === '/fundamental/' ? ({'': 'fundamental', ranglisten: 'ranglisten', entdecken: 'ranglisten', branchen: 'branchen', methodik: 'methodik'}[hashPart(loc, 0)] || null) : null},
    /* Technical: eigenes Produkt. #/chart/<TICKER> ist das Chart Studio einer Aktie; ohne Kuerzel die Auswahl.
       Der Chart-Eintrag zeigt per dock({hrefs:{chart}}) auf die zuletzt geoeffnete Aktie (technical/app.js). */
    {id: 'technical', label: 'Technical', match: p => p.startsWith('/technical/'),
      items: [['technical','Technical','/technical/#/','technical'],['screener','Screener','/technical/#/screener','screener'],['chart','Chart','/technical/#/chart','signals','Chart Studio'],['muster','Muster','/technical/#/muster','table']],
      /* Redesign 2027 (T05): „Muster“ ersetzt „Methodik“; #/methodik zeigt dieselbe Seite. */
      active: loc => loc.pathname === '/technical/' ? ({'': 'technical', screener: 'screener', chart: 'chart', muster: 'muster', methodik: 'muster'}[hashPart(loc, 0)] || null) : null},
    {id: 'vorsorge', label: 'Vorsorge', match: p => p.startsWith('/vorsorge/'), late: p => p.startsWith('/vorsorge/etf/'),
      items: [['vorsorge','Vorsorge','/vorsorge/#/','vorsorge'],['plan','Planer','/vorsorge/#/plan','plan'],['etfs','ETFs','/vorsorge/#/etfs','etf'],['portfolio','Portfolio','/vorsorge/#/portfolio','portfolio']],
      active: loc => {
        if (loc.pathname.startsWith('/vorsorge/etf/')) return 'etfs';
        return {'': 'vorsorge', home: 'vorsorge', plan: 'plan', luecke: 'plan', etfs: 'etfs', etf: 'etfs', watchlist: 'etfs', europa: 'etfs', portfolio: 'portfolio', xray: 'portfolio', szenarien: 'portfolio'}[hashPart(loc, 0)] || null;
      }},
    {id: 'screener', label: 'Screener', match: p => p.startsWith('/screener/'), late: p => p !== '/screener/',
      items: [['screener','Screener','/screener/','screener'],['filter','Filter','/screener/?view=build','plus'],['treffer','Treffer','/screener/?view=results','hits'],['gespeichert','Gespeichert','/screener/?view=saved','saved']],
      active: loc => {
        const q = new URLSearchParams(loc.search);
        const view = q.get('view') || (q.getAll('f').some(f => f.trim()) || q.get('mode') === 'pro' ? 'build' : 'start');
        return {start: 'screener', build: 'filter', results: 'treffer', compare: 'treffer', saved: 'gespeichert', changes: 'gespeichert', watchlist: 'gespeichert'}[view] || null;
      }},
    {id: 'supertrader', label: 'Supertrader', match: p => p.startsWith('/supertrader/'),
      items: [['supertrader','Supertrader','/supertrader/','supertrader'],['methoden','Methoden','/supertrader/strategies/','grid'],['treffer','Treffer','/supertrader/treffer/','signals'],['forschung','Forschung','/supertrader/forschung/','backtests']],
      active: loc => {
        const k = loc.pathname.split('/')[2] || '';
        return {'': 'supertrader', strategies: 'methoden', treffer: 'treffer', signals: 'treffer', stock: 'treffer', forschung: 'forschung', backtests: 'forschung'}[k] || null;
      }},
    {id: 'hedgefonds', label: 'Hedgefonds', match: p => p.startsWith('/hedgefonds/'),
      items: [['hedgefonds','Hedgefonds','/hedgefonds/#/','hedgefonds'],['investoren','Investoren','/hedgefonds/#/investoren','users'],['aktien','Aktien','/hedgefonds/#/aktien','stocks'],['gruppen','Gruppen-Käufe','/hedgefonds/#/gruppen-kaeufe','signals']],
      active: loc => ({'': 'hedgefonds', investoren: 'investoren', datenbank: 'investoren', aktien: 'aktien', aktie: 'aktien', 'gruppen-kaeufe': 'gruppen', 'smart-money': 'gruppen'}[hashPart(loc, 0)] || null)},
    /* Portfolios: #/<gruppe> filtert die Uebersicht, #/<gruppe>/<id> ist ein Depot (gehoert zur Gruppe). */
    {id: 'portfolios', label: 'Portfolios', match: p => p.startsWith('/portfolios/'),
      items: [['portfolios','Portfolios','/portfolios/#/','portfolios'],['supertrader','Supertrader','/portfolios/#/supertrader','signals'],['quant','Quant','/portfolios/#/quant','grid'],['ki','KI','/portfolios/#/ki','spark']],
      active: loc => loc.pathname === '/portfolios/' ? ({'': 'portfolios', supertrader: 'supertrader', quant: 'quant', ki: 'ki'}[hashPart(loc, 0)] || null) : null},
    /* Mein Bereich (Mockups E02, E07, E08): Start /willkommen/, Ich /mein-dashboard/ (im Dock „Ich“), lokal Gemerktes
       /mein-dashboard/#/gespeichert, Konto /konto/ mit Einstellungen und Abonnement. Bestellweg (Tarife, Kuendigen), Anmeldung,
       Registrierung und Passwort tragen keine Leiste (kein Treffer in match): dort lenkt nichts ab.
       self: Seiten, auf denen der Rahmen Dock und Reiter selbst traegt, ohne dass die Seite sie anfordert (Einstellungen, Abonnement). */
    {id: 'mein', label: 'Mein Bereich', icon: 'person', match: p => p.startsWith('/willkommen/') || p.startsWith('/mein-dashboard/') || p === '/konto/' || /^\/konto\/(watchlist|einstellungen|abo)\//.test(p),
      late: p => p === '/konto/' || p.startsWith('/konto/watchlist/'), self: p => /^\/konto\/(einstellungen|abo)\//.test(p),
      items: [['mein','Mein Bereich','/willkommen/','person'],['watchlist','Ich','/mein-dashboard/','heart'],['gespeichert','Gespeichert','/mein-dashboard/#/gespeichert','saved'],['konto','Konto','/konto/','gear']],
      active: loc => {
        if (loc.pathname.startsWith('/willkommen/')) return 'mein';
        if (loc.pathname.startsWith('/konto/watchlist/')) return 'watchlist';
        if (loc.pathname.startsWith('/konto/')) return 'konto';
        return hashPart(loc, 0) === 'gespeichert' ? 'gespeichert' : 'watchlist';
      }}
  ];
  const DOCK = [['home','Home','/willkommen/','home'],['discover','Discover','/discover/#/','discover'],['news','News','/insights/','insights'],['ich','Ich','/mein-dashboard/','person']];
  /* Seiten ausserhalb der Produkte, die das Dock tragen, wenn sie es anfordern (ohne Reiterzeile): Insights, das Ziel des Platzes „News“. */
  const dockPage = loc => loc.pathname.startsWith('/insights/');
  const dockActive = loc => { const p = loc.pathname; return p.startsWith('/willkommen/') ? 'home' : p.startsWith('/discover/') ? 'discover' : p.startsWith('/insights/') ? 'news' : p.startsWith('/mein-dashboard/') || p.startsWith('/konto/') ? 'ich' : null; };
  /* Reiter eines Produkts: Leistenplaetze in ihrer Reihenfolge, dann die uebrigen Eintraege der Menuegruppe; gleiches Ziel nur
     einmal (/quant/ und /quant/#/ sind dieselbe Seite). Reiter aus der Menuegruppe tragen keine id. */
  const routeKey = href => { const u = new URL(href, 'https://x'); return u.pathname + u.search + (/^#\/?$/.test(u.hash) ? '' : u.hash); };
  const tabEntries = product => {
    const group = groups.find(g => g.id === product.id), seen = new Set(product.items.map(i => routeKey(i[2])));
    const rest = (group ? group.entries : []).filter(([, href]) => { const k = routeKey(href); return !seen.has(k) && !!seen.add(k); });
    return product.items.map(([id, label, href, , name]) => ({id, label, href, name})).concat(rest.map(([label, href]) => ({id: null, label, href})));
  };
  // Original sprite geometry is inlined only for the always-visible dock: no extra request
  // on resource-budgeted workspaces. The provenance test keeps these symbols exact.
  const DOCK_PRODUCT_ICONS = {
  "discover": "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"9.5\"/><circle class=\"dim\" opacity=\".45\" cx=\"12\" cy=\"12\" r=\"6\"/><circle class=\"dim\" opacity=\".45\" cx=\"12\" cy=\"12\" r=\"2.5\"/><path class=\"fill\" fill=\"currentColor\" stroke=\"none\" d=\"M12 12 18.7 5.3A9.5 9.5 0 0 1 21.5 12z\" opacity=\".28\"/><path d=\"M12 12 18.7 5.3\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"16.2\" cy=\"9.6\" r=\"1.3\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"7.6\" cy=\"15.4\" r=\"1\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"15.8\" cy=\"16.2\" r=\".9\"/></g>",
  "quant": "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"5.5\" y=\"5.5\" width=\"13\" height=\"13\" rx=\"2.2\"/><path class=\"dim\" opacity=\".45\" d=\"M9 2v3.5M12 2v3.5M15 2v3.5M9 18.5V22M12 18.5V22M15 18.5V22M2 9h3.5M2 12h3.5M2 15h3.5M18.5 9H22M18.5 12H22M18.5 15H22\"/><path d=\"M14.6 9H9.6l2.6 3-2.6 3h5\"/></g>",
  "screener": "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 5h18M6 10.5h12M9 16h6M12 16v5\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"3\" cy=\"5\" r=\"1.4\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"21\" cy=\"5\" r=\"1.4\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"6\" cy=\"10.5\" r=\"1.3\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"18\" cy=\"10.5\" r=\"1.3\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"9\" cy=\"16\" r=\"1.2\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"15\" cy=\"16\" r=\"1.2\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"12\" cy=\"21\" r=\"1.5\"/></g>",
  "vorsorge": "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 11.5a9 9 0 0 1 18 0z\"/><path d=\"M12 11.5v7a2.2 2.2 0 0 0 4.4 0\"/><path class=\"dim\" opacity=\".45\" d=\"M12 2.5V1M7.5 11.5c0-4 2-7 4.5-9M16.5 11.5c0-4-2-7-4.5-9\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"20\" cy=\"20\" r=\"1.3\"/><path class=\"dim\" opacity=\".45\" d=\"M18.5 16l1.5 4\"/></g>",
  "supertrader": "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"8\"/><path class=\"dim\" opacity=\".45\" d=\"M12 1.5v3.5M12 19v3.5M1.5 12H5M19 12h3.5\"/><rect x=\"10.3\" y=\"9\" width=\"3.4\" height=\"6\" rx=\".6\"/><path d=\"M12 6.8V9M12 15v2.2\"/></g>",
  "elliott": "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path class=\"dim\" opacity=\".45\" d=\"M2 21h20\" stroke-dasharray=\"1.5 2\"/><path d=\"M2 19 6 12l2.5 3L14 5l2.5 4L21 3\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"6\" cy=\"12\" r=\"1.3\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"8.5\" cy=\"15\" r=\"1.3\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"14\" cy=\"5\" r=\"1.3\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"16.5\" cy=\"9\" r=\"1.3\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"21\" cy=\"3\" r=\"1.5\"/></g>",
  "fundamental": "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M2 21h20\"/><path d=\"M4.5 21v-6M8.5 21V10M12.5 21v-5\"/><circle cx=\"16\" cy=\"9\" r=\"4.5\"/><path d=\"m19.3 12.3 2.7 2.7\"/><path class=\"dim\" opacity=\".45\" d=\"M14.2 9.6 15.5 8l1.2 1.2 1.6-2\"/></g>",
  "technical": "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M2.5 4.5 20.5 12.5M2.5 20.5l18-8\"/><path class=\"dim\" opacity=\".45\" d=\"M7 8v9M11.5 10v5.5M15.5 11.3v3\"/><rect x=\"6\" y=\"10\" width=\"2\" height=\"5\" rx=\".4\"/><rect x=\"10.5\" y=\"11\" width=\"2\" height=\"3.5\" rx=\".4\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"20.5\" cy=\"12.5\" r=\"1.7\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"2.5\" cy=\"4.5\" r=\"1.1\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"2.5\" cy=\"20.5\" r=\"1.1\"/></g>",
  "hedgefonds": "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"6\" r=\"2.4\"/><circle class=\"dim\" opacity=\".45\" cx=\"5\" cy=\"8\" r=\"1.8\"/><circle class=\"dim\" opacity=\".45\" cx=\"19\" cy=\"8\" r=\"1.8\"/><path d=\"M8 19v-5a4 4 0 0 1 8 0v5\"/><path class=\"dim\" opacity=\".45\" d=\"M2 19v-4a3 3 0 0 1 5-2.2M22 19v-4a3 3 0 0 0-5-2.2M3 22h18\"/><path d=\"M12 13v6\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"12\" cy=\"22\" r=\"1\"/></g>",
  "portfolios": "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M11 3.5a8.5 8.5 0 1 0 9.5 9.5H11z\"/><path class=\"fill\" fill=\"currentColor\" stroke=\"none\" opacity=\".28\" d=\"M14 2.5a8 8 0 0 1 7.5 7.5H14z\"/><path d=\"M14 2.5a8 8 0 0 1 7.5 7.5H14z\"/><path class=\"dim\" opacity=\".45\" d=\"M5.5 13h3M5.5 16h5\"/></g>",
  "insights": "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3.5\" y=\"4\" width=\"13\" height=\"16\" rx=\"2.2\"/><path d=\"M16.5 8h3a1 1 0 0 1 1 1v9a2 2 0 0 1-4 0\"/><path class=\"fill\" fill=\"currentColor\" stroke=\"none\" opacity=\".28\" d=\"M6.5 7.5h7v4h-7z\"/><path d=\"M6.5 7.5h7v4h-7z\"/><path class=\"dim\" opacity=\".45\" d=\"M6.5 14.5h7M6.5 17h4.5\"/></g>",
  "chartbild": "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5.5 8v2M5.5 16v3M12 4v3M12 14v3M18.5 2.5v2M18.5 10v3\"/><rect x=\"4\" y=\"10\" width=\"3\" height=\"6\" rx=\".5\"/><rect x=\"10.5\" y=\"7\" width=\"3\" height=\"7\" rx=\".5\"/><rect x=\"17\" y=\"4.5\" width=\"3\" height=\"5.5\" rx=\".5\"/><path class=\"dim\" opacity=\".45\" d=\"M2 20c5-1.5 9-5 20-11\"/></g>",
  "layers": "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m12 2.5 9.5 5-9.5 5-9.5-5z\"/><path class=\"dim\" opacity=\".45\" d=\"m2.5 12 9.5 5 9.5-5\"/><path d=\"m2.5 16.5 9.5 5 9.5-5\"/></g>"
};
  const dockProductIcon = id => DOCK_PRODUCT_ICONS[id] ? `<svg viewBox="0 0 24 24" aria-hidden="true">${DOCK_PRODUCT_ICONS[id]}</svg>` : `<svg class="line" viewBox="0 0 24 24" aria-hidden="true">${dockIcons[id] || ''}</svg>`;
  // Hidden menu symbols acquire href only when the menu opens.
  const productIcon = id => `<svg viewBox="0 0 24 24" aria-hidden="true"><use data-href="/assets/product-icons.svg#${id}"/></svg>`;
  const segmentPrefix = (value, prefix) => value === prefix || value.startsWith(prefix.replace(/\/$/, '') + '/');
  // Query and hash routes need distinct matches; a product home never wins on a detail route.
  const routeScore = (href, loc) => {
    const target = new URL(href, 'https://research.visionuniverse.de');
    const hash = (loc.hash || '').split('?')[0].replace(/^#\/?/, '');
    const wanted = target.hash.split('?')[0].replace(/^#\/?/, '');
    if (target.pathname !== loc.pathname && !segmentPrefix(loc.pathname, target.pathname)) return -1;
    if (target.hash) {
      if (target.pathname !== loc.pathname || (wanted ? !segmentPrefix(hash, wanted) : !!hash)) return -1;
      const params = new URLSearchParams((loc.hash || '').split('?')[1] || '');
      for (const [key, value] of new URLSearchParams(target.hash.split('?')[1] || '')) if (params.get(key) !== value) return -1;
    } else if (!target.search && (hash || new URLSearchParams(loc.search).has('view') || (target.pathname !== loc.pathname && groups.some(g => g.href && new URL(g.href, 'https://x').pathname === target.pathname)))) return -1;
    for (const [key, value] of target.searchParams) if (new URLSearchParams(loc.search).get(key) !== value) return -1;
    return target.pathname.length + wanted.length * 10 + (target.search.length + (target.hash.split('?')[1] || '').length) * 20;
  };
  const menuState = loc => {
    const product = PRODUCTS.find(p => p.match(loc.pathname, loc));
    let group = product && groups.find(g => g.id === product.id), href = null, best = -1;
    for (const candidate of groups) for (const [, target] of candidate.entries) {
      const score = routeScore(target, loc);
      if (score > best) { best = score; href = target; if (!product) group = candidate; }
    }
    if (group && !href && product) {
      const active = product.active(loc), dock = product.items.find(([id]) => id === active);
      const aliases = { '/quant/methodology/':'/quant/#/methodik', '/quant/watchlist/':'/quant/#/aktien' };
      href = aliases[loc.pathname] || (dock && dock[2]);
      if (product.id === 'quant' && href === '/quant/#/') href = '/quant/';
      if (product.id === 'elliott' && (loc.pathname !== '/elliott/' || hashPart(loc, 0))) href = '/elliott/';
      if (product.id === 'hedgefonds' && hashPart(loc, 0) === 'fonds') href = '/hedgefonds/#/datenbank';
      if (product.id === 'discover' && hashPart(loc, 0) === 's') href = '/discover/#/einzeln/US_REAL';
      /* Technical: Lektionen und Fragen (#/akademie/<id>, #/assistent/<id>) gehoeren zu „Lernen“, eine Vorlage (#/vorlagen/<id>) zu „Vorlagen“. */
      if (product.id === 'technical') href = {akademie: '/technical/#/lernen', assistent: '/technical/#/lernen', vorlagen: '/technical/#/screener?reiter=vorlagen'}[hashPart(loc, 0)] || href;
    }
    /* Technical: der Screener-Reiter „Gespeichert“ hat zwei Adressen (#/screener/gespeichert und ?reiter=gespeichert). */
    if (product && product.id === 'technical' && hashPart(loc, 0) === 'screener' && new URLSearchParams((loc.hash || '').split('?')[1] || '').get('reiter') === 'gespeichert') href = '/technical/#/screener/gespeichert';
    // Screener omits view=build on its default filtered/pro URLs (app.readURL/buildURL).
    const params = new URLSearchParams(loc.search), explicit = params.get('view');
    const screenerView = ['start','build','results','saved','changes','compare','watchlist'].includes(explicit) ? explicit : (params.getAll('f').some(f=>f.trim()) || params.get('mode') === 'pro' ? 'build' : 'start');
    if(product && product.id === 'screener') href = {start:'/screener/',build:'/screener/?view=build',results:'/screener/?view=results',compare:'/screener/?view=results',saved:'/screener/?view=saved',changes:'/screener/?view=saved',watchlist:'/screener/?view=watchlist'}[screenerView];
    const home = product && loc.pathname === new URL(product.items[0][2], 'https://x').pathname && !hashPart(loc, 0) && !(product.id === 'elliott' && (loc.hash || '').includes('?')) && (product.id === 'screener' ? screenerView === 'start' : !params.has('view'));
    return {group: group && group.id, href, expanded: group && !home ? group.id : null};
  };
  /* Aktiver Reiter: der Reiter der Seite, auf der man ist. Ein Reiter aus der Menuegruppe ist aktiv, wenn das Menue ihn als
     aktuelle Seite markiert (menuState) - nur aus der Adresse, also schon beim ersten Zeichnen. Sonst gilt unveraendert die
     Logik der frueheren Leiste: der vom Produkt gemeldete Bereich (nur fuer die Adresse, zu der er gemeldet wurde), sonst
     product.active. Die Leiste hatte vier Plaetze; Seiten ohne eigenen Platz (Methodik, Förderung, Datenbank) lagen dort bei
     einem Nachbarn. Mit eigenem Reiter markieren sie sich selbst. Hoechstens ein Reiter ist aktiv. */
  const tabActive = (product, entries, loc, state) => {
    const marked = menuState(loc).href, own = entries.find(e => !e.id && e.href === marked);
    if (own) return own;
    const current = state && state.activeAt === loc.href ? state.active : product.active(loc);
    return entries.find(e => e.id && e.id === current) || null;
  };
  /* Linien-Icons fuer Kopf, Dock und Menue: 24er-Raster, Strich 1,8 (wie die Menue-Icons). */
  const dockIcons = {
    worlds: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 5-5 13 0 18m0-18c5 5 5 13 0 18"/>',
    strategies: '<path d="M4 19V5m0 14h16M7 15l4-5 3 2 5-7"/>',
    explore: '<rect x="5" y="4" width="14" height="16" rx="3"/><path d="m9.5 12 2 2 3.5-4"/>',
    screener: '<path d="M4 5h16M7 12h10M10 19h4"/>',
    stocks: '<path d="M3 17l5-5 4 4 8-9M15 7h5v5"/>',
    plan: '<path d="M4 19V5m0 14h16"/><path d="M7 15c3 0 4-6 7-6s3 3 6 3"/>',
    etf: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M12 3.5v17M3.5 10.5h17"/>',
    portfolio: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 15-5 16 0"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8"/>',
    close: '<path d="M5 5l14 14M19 5L5 19"/>',
    next: '<path d="M9 5l7 7-7 7"/>',
    hits: '<path d="M4 5h16l-6 8v5l-4 2v-7z"/>',
    saved: '<path d="M6 3.5h12v17l-6-4-6 4z"/>',
    heart: '<path d="M20.8 8.5c0 4-4.4 7.6-8.8 11-4.4-3.4-8.8-7-8.8-11a5 5 0 0 1 8.8-3.1 5 5 0 0 1 8.8 3.1z"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
    signals: '<path d="M3 17l5-6 4 3 6-8 3 3"/>',
    backtests: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.6 3-5.5 6-5.5s5.4 1.9 6 5.5M16 4.8a3.2 3.2 0 0 1 0 6.4M17.5 14.6c2 .5 3.2 2.2 3.5 5.4"/>',
    table: '<rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="M3.5 9.5h17M3.5 15h17M9.5 9.5V20"/>',
    wave: '<path d="M3 19 8 11l3 3 5-9 5 5"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    home: '<path d="M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z"/>'
  };
  /* Das Dock ist auf hellen und dunklen Flaechen dasselbe: ein ruhiges,
     schwarzes Element; der aktive Platz traegt das Vision-Universe-Lime, der
     runde Universe-Knopf in der Mitte ist lime und steht ueber der Leiste
     (App-Konzept 2). Es liegt ueber dem Inhalt (z-index 900), aber unter
     Produkt-Overlays (Suche, Sheets, Dialoge) und unter dem globalen Menue.
     Abstand fuer den Inhalt: --vu-dock-space (site-navigation.css), damit
     nichts Letztes dauerhaft verdeckt ist. */
  const dockStyles = (t) => `
        :host{position:fixed;left:0;right:0;bottom:0;z-index:900;display:flex;justify-content:center;padding:0 10px calc(10px + env(safe-area-inset-bottom));pointer-events:none;font:500 15px Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
        *{box-sizing:border-box}
        nav{pointer-events:auto;display:flex;align-items:center;width:100%;max-width:520px;height:68px;padding:0 6px;border-radius:28px;background:${t.dockBg};-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);border:1px solid ${t.dockLine};color:${t.dockInk}}
        a,button{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;border:0;font-family:inherit;text-decoration:none;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background-color .15s,color .15s,transform .1s}
        a{flex:1 1 0;gap:3px;min-width:0;height:56px;padding:0 3px;border-radius:20px;background:transparent;color:${t.dockMute};font-size:10.5px;font-weight:700;line-height:1.35;letter-spacing:0}
        a:hover{color:${t.dockInk}}
        a:active,button:active{transform:scale(.96)}
        a:focus-visible,button:focus-visible{outline:2px solid ${t.accent};outline-offset:2px}
        .label{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 2px}
        a[aria-current=page],a[aria-current=page]:hover{color:${t.dockOn}}
        svg{width:20px;height:20px;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
        svg.line{stroke-width:2.2}
        a[data-id=ich] svg{width:17px;height:17px;margin:1.5px 0;stroke-width:2.4}
        .uni{flex:none;width:62px;height:62px;margin:-22px 6px 0;padding:0;border-radius:99px;background:#c8f531;color:#101318;box-shadow:0 0 0 6px ${t.page},0 8px 30px rgba(200,245,49,.35)}
        .uni svg{width:26px;height:26px}
        .uni:focus-visible{outline-color:${t.dockInk};outline-offset:8px}
        @media(min-width:761px){
          :host{padding-bottom:calc(16px + env(safe-area-inset-bottom))}
          nav{width:auto;max-width:100%;height:56px;gap:2px;padding:0 5px;border-radius:999px}
          a{flex:none;flex-direction:row;gap:8px;height:46px;padding:0 16px;border-radius:999px;font-size:13px}
          .label{overflow:visible}
          svg{width:19px;height:19px}
          .uni{width:58px;height:58px;margin:-18px 8px 0}
          .uni svg{width:24px;height:24px}
        }
        @media(max-width:350px){:host{padding-inline:6px}a{font-size:9.5px}}
        @media(prefers-reduced-motion:reduce){a,button{transition:none}a:active,button:active{transform:none}}
`;
  /* OPT-IN: Ein Produkt fordert Dock und Reiterzeile mit window.VUNavigation.dock({})
     an (spaetestens nach seinem ersten Rendern); Seiten ohne diesen Aufruf
     behalten ihren Kopf samt Menue-Knopf unveraendert. Produkte koennen
     zudem den Zustand der Reiter setzen (SPA mit Zustand in der
     URL, z. B. Screener-Filter): window.VUNavigation.dock({active, hrefs,
     badges}) - die ids sind die der frueheren Leistenplaetze. Klicks auf einen
     Reiter melden sich vorher als abbrechbares Ereignis vu-dock-navigate
     {product,id,href}; wer preventDefault ruft, navigiert selbst. */
  /* Rechtliches & Infos (Strang F): Texte aus assets/legal-notices.json.
     Owner-Entscheidung 10.11.2026: Satz und Links im Menü, kein Seitenfuß in Browser und App. */
  /* VU-LEGAL:BEGIN – erzeugt aus assets/legal-notices.json (scripts/legal/sync-legal-notices.mjs), nicht von Hand ändern */
  var LEGAL = {"approved":true,"version":"vu-hinweise-2026-11-16-1","notices":{"footer":{"text":"Vision Universe ist eine Software zur Analyse von Aktien. Die Ergebnisse entstehen automatisch nach beschriebenen Regeln und sind für alle gleich. Keine Anlageberatung, keine Anlageempfehlung, keine Kauf- oder Verkaufsempfehlung. Aktien können bis zum Totalverlust fallen. Frühere und simulierte Ergebnisse sind kein verlässlicher Hinweis auf die Zukunft.","label":null,"required":null,"links":[["Impressum","https://konto.visionuniverse.de/rechtliches/impressum"],["Kontakt","https://konto.visionuniverse.de/kontakt"],["Datenschutz","https://konto.visionuniverse.de/rechtliches/datenschutz"],["Nutzungsbedingungen","https://konto.visionuniverse.de/rechtliches/agb"],["Risikohinweise","https://konto.visionuniverse.de/rechtliches/risikohinweise"]]},"stock":{"text":"Einstufungen und Werte beschreiben, wie diese Aktie nach den Regeln der jeweiligen Methode im Vergleich zu anderen Aktien abschneidet – Datenstand siehe oben. Sie berücksichtigen deine persönliche Situation nicht und sind keine Empfehlung, diese Aktie zu kaufen, zu halten oder zu verkaufen.","label":null,"required":null,"links":[["Methodik, Quellen und Interessen","https://konto.visionuniverse.de/rechtliches/methodik"]]},"ranking":{"text":"Diese Liste zeigt Aktien, die die beschriebenen Bedingungen zum Datenstand rechnerisch erfüllen. Die Reihenfolge folgt der Regel, nicht einer Einschätzung, welche Aktie besser für dich ist.","label":null,"required":null,"links":[["Methodik, Quellen und Interessen","https://konto.visionuniverse.de/rechtliches/methodik"]]},"setup":{"text":"Regel-Ergebnis der Methode, für alle gleich: Die Aktie erfüllt zum Datenstand die beschriebenen Bedingungen. Zonen laut Methode sind Rechenpunkte, kein Kursziel und keine Prognose. Das ist keine Empfehlung, die Aktie zu kaufen oder zu verkaufen.","label":null,"required":["Methode und Regelversion","Datenstand","Link zur Methodik"],"links":[["Risikohinweise","https://konto.visionuniverse.de/rechtliches/risikohinweise"],["Methodik, Quellen und Interessen","https://konto.visionuniverse.de/rechtliches/methodik"]]},"backtest":{"text":"Forschung, nicht zertifiziert: Dieser Backtest rechnet eine Regel rückwirkend auf historische Kurse. Das Ergebnis hängt von Zeitraum, Kosten, Ausführung und Datenumfang ab (Angaben unten). Es ist keine Prognose und kein Renditeversprechen. Frühere und simulierte Wertentwicklungen sind kein verlässlicher Indikator für künftige Ergebnisse.","label":"Forschung, nicht zertifiziert","required":["Zeitraum","Kosten je Trade","Vergleichsmaßstab (z. B. S&P 500 Gesamtrendite)","Enthält delistete Titel: ja/nein","Anzahl getesteter Varianten","größter Verlust (max. Drawdown)"],"links":[["Risikohinweise","https://konto.visionuniverse.de/rechtliches/risikohinweise"]]},"modelPortfolio":{"text":"Musterdepot: ein Rechenmodell ohne echtes Geld, das eine Methode nach Regel rechnet. Es zeigt, was die Methode tut, nicht, was du tun solltest, und ist keine Empfehlung. Reale Ergebnisse weichen durch Kosten, Steuern, Kurslücken und Ausführungszeitpunkt ab.","label":"Rechenmodell, kein echtes Geld","required":null,"links":[["Risikohinweise","https://konto.visionuniverse.de/rechtliches/risikohinweise"],["Methodik, Quellen und Interessen","https://konto.visionuniverse.de/rechtliches/methodik"]]},"thirdParty":{"text":"Angabe Dritter: zusammengefasste Einschätzungen externer Analysten bzw. Pflichtmeldungen an die SEC, unverändert mit Quelle und Datum. Nicht von Vision Universe erstellt und keine Einschätzung von Vision Universe.","label":null,"required":null,"links":[["Methodik, Quellen und Interessen","https://konto.visionuniverse.de/rechtliches/methodik"]]},"ai":{"text":"Die KI übersetzt deine Frage in Filter; die Zahlen rechnet Vision Universe aus seinen Daten. KI-Texte können Fehler enthalten. Die Vision Universe KI beantwortet keine Fragen zu deiner persönlichen Situation und sagt nicht, was du kaufen oder verkaufen sollst.","label":null,"required":null,"links":[["Risikohinweise","https://konto.visionuniverse.de/rechtliches/risikohinweise"]]},"editorial":{"text":"Redaktionelle Einordnung, keine Anlageberatung und keine Kauf- oder Verkaufsempfehlung. Methodik und Interessen: siehe Seite „Methodik, Quellen und Interessen“.","label":null,"required":null,"links":[["Methodik, Quellen und Interessen","https://konto.visionuniverse.de/rechtliches/methodik"]]}},"appLinks":[["Impressum","https://konto.visionuniverse.de/rechtliches/impressum"],["Kontakt","https://konto.visionuniverse.de/kontakt"],["Datenschutz","https://konto.visionuniverse.de/rechtliches/datenschutz"],["Nutzungsbedingungen","https://konto.visionuniverse.de/rechtliches/agb"],["Risikohinweise","https://konto.visionuniverse.de/rechtliches/risikohinweise"],["Datenquellen & Methodik","https://research.visionuniverse.de/infos/#quellen"]],"menuTitle":"Rechtliches & Infos","footerInApp":false,"footerOnWeb":false};
  /* VU-LEGAL:END */
  /* App-Hülle (iOS/Android): Capacitor oder User-Agent VUApp/1 (app/capacitor.config.json appendUserAgent). */
  function inApp() {
    try { return !!(globalThis.Capacitor && globalThis.Capacitor.isNativePlatform && globalThis.Capacitor.isNativePlatform()) || /VUApp\/1/.test(navigator.userAgent); } catch (_) { return false; }
  }
  /* Pflicht-Links (assets/legal-notices.json appLinks.always): Menü → „Rechtliches & Infos“, aus jedem Bereich in zwei
     Schritten (§ 5 DDG). Owner-Entscheidung 07.11.2026: dort auch der kurze Software-/Risikosatz (notices.footer) und
     „Datenquellen & Methodik“; seit 10.11.2026 ersetzt dieser Menüpunkt auch im Browser den Seitenfuß. */
  function legalMenu() {
    var l = (typeof LEGAL !== 'undefined' && LEGAL.appLinks) || [];
    if (!l.length) return '';
    var e = function (x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var foot = LEGAL.approved && LEGAL.notices && LEGAL.notices.footer;
    return '<h2 id="vu-legal-menu">' + e(LEGAL.menuTitle || 'Rechtliches') + '</h2><div class="links legal-links">' + l.map(function (x) { return '<a href="' + e(x[1]) + '"><span>' + e(x[0]) + '</span></a>'; }).join('') + '</div>' +
      (foot ? '<p class="legal-note">' + e(foot.text) + '</p>' : '');
  }
  function legalFooter() {
    var n = LEGAL.approved && LEGAL.notices && LEGAL.notices.footer;
    if (!n || typeof document === 'undefined' || !document.body || document.querySelector('.vu-legal-foot')) return;
    if (inApp() ? LEGAL.footerInApp === false : LEGAL.footerOnWeb === false) return;
    var off = document.querySelector('meta[name="vu-legal-footer"]');
    if (off && off.getAttribute('content') === 'none') return;
    var foot = document.createElement('aside');
    foot.className = 'vu-legal-foot';
    foot.setAttribute('aria-label', 'Rechtliche Hinweise');
    var p = document.createElement('p'); p.textContent = n.text; foot.appendChild(p);
    var links = document.createElement('p'); links.className = 'vu-legal-foot-links';
    n.links.forEach(function (l, i) { if (i) links.appendChild(document.createTextNode(' · ')); var a = document.createElement('a'); a.href = l[1]; a.textContent = l[0]; links.appendChild(a); });
    foot.appendChild(links);
    document.body.appendChild(foot);
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', legalFooter); else legalFooter();
  }
  /* App (Owner 08.11.2026: „Rechtliches & Infos“ ließ sich nicht antippen): Die App zeigt diese Seite in einem Rahmen,
     und die App-Hülle lässt im Rahmen nur research.visionuniverse.de zu (CSP frame-src in app/www/index.html). Ein Link auf
     eine andere Herkunft, z. B. die Rechtstexte auf konto.visionuniverse.de, wurde dort still verworfen. Solche Links
     öffnen in der App deshalb als neues Fenster; Capacitor gibt das an den System-Browser (iOS decidePolicyFor mit
     targetFrame == nil, Android launchIntent). Im Web bleibt alles wie bisher. */
  function appExternalLink(a) {
    if (!a || !a.href || a.hasAttribute('download') || (a.target && a.target !== '_self')) return false;
    var u; try { u = new URL(a.href, location.href); } catch (_) { return false; }
    if (!/^https?:$/.test(u.protocol) || u.origin === location.origin) return false;
    a.target = '_blank'; a.rel = 'noopener';
    return true;
  }
  if (typeof document !== 'undefined' && inApp()) {
    document.addEventListener('click', function (ev) {
      var path = ev.composedPath ? ev.composedPath() : [ev.target];
      for (var i = 0; i < path.length; i++) if (path[i] && path[i].tagName === 'A') { appExternalLink(path[i]); return; }
    }, true);
  }
  const dockBus = {state: {}, listeners: []};
  /* Kopf nach Prototyp (Owner 15.11.2026): links der Welten-Wechsler (Icon, Name, Pfeil; oeffnet „Dein Universe“),
     rechts KI (neongruener Funke, oeffnet /ask/ mit Fokus auf der Eingabe), Suche, Profil. „i“ und Datums-Pille sind
     entfallen (Owner 16.11.2026: „das i würde ich rausmachen, weil das sehen wir ja im Menü, ist ja rechtliches und so
     verknüpft … Und das Datum, das würde ich tatsächlich auch ausblenden, weil jeder erwartet, dass das immer tagesaktuell
     ist.“); die Fenster „Daten & Hinweise“ und „Datenstand“ bleiben ueber das Seitenende und das Menue erreichbar.
     Home, Ich, Konto und News tragen wie im Prototyp ihren eigenen Namen statt des Produktnamens. */
  const worldOf = loc => {
    const p = loc.pathname;
    if (p.startsWith('/willkommen/')) return {label: 'Home', icon: 'layers'};
    if (p.startsWith('/mein-dashboard/')) return {label: 'Ich', icon: 'layers'};
    if (p.startsWith('/insights/')) return {label: 'News', icon: 'insights'};
    /* Die Quant-Aktienseite #/aktie/<T> ist seit dem Klickentwurf (Owner 17.11.2026) eine Modulseite und traegt „Quant“;
       die Welt „Aktie“ ist nur die gemeinsame Aktienseite. */
    /* Gemeinsame Aktienseite /aktie/#/<T> (Prototyp #v-aktie). */
    if (p === '/aktie/' || p === '/aktie/index.html') return {label: 'Aktie', icon: 'chartbild'};
    const product = PRODUCTS.find(x => x.match(p, loc));
    if (!product) return null;
    if (product.id === 'mein') return {label: 'Konto', icon: 'layers'};
    const group = groups.find(g => g.id === product.id);
    return {label: product.label, icon: (group||{icon:product.icon||product.id}).icon};
  };
  /* Menue „Dein Universe“ nach Prototyp (build.js T.universe): vier Gruppen, je zwei Kacheln nebeneinander. Die Kacheln
     sind die Produkte aus groups (Steckbriefe); die KI (/ask/, interne id atlas) steht wie im Prototyp in der letzten Gruppe.
     Ihre Kachel traegt „Vision Universe“ als kleine Dachzeile ueber „KI“ (Owner 16.11.2026: „Vision Universe dann klein
     schreiben, damit das KI sofort ersichtlich ist“). Ein Produkt ohne Gruppe landet in der letzten, damit keines fehlt. */
  const ATLAS = {id: 'atlas', label: 'KI', kicker: 'Vision Universe', badge: 'Beta', href: '/ask/', icon: 'layers', claim: 'Frag in deinen Worten'};
  const MENU_GROUPS = [['Entdecken', ['discover', 'insights']], ['Analysieren', ['quant', 'fundamental', 'technical', 'hedgefonds', 'elliott']], ['Nach Regeln', ['supertrader', 'portfolios']], ['Finden und vorsorgen', ['screener', 'vorsorge', 'atlas']]];
  const menuGroups = () => {
    const all = groups.filter(g => g.href).concat([ATLAS]), used = new Set(MENU_GROUPS.flatMap(([, ids]) => ids));
    const out = MENU_GROUPS.map(([title, ids]) => ({title, tiles: ids.map(id => all.find(g => g.id === id)).filter(Boolean)}));
    out[out.length - 1].tiles.push(...all.filter(g => !used.has(g.id)));
    return out;
  };
  /* Datenstand fuer das Fenster „Datenstand“: datum (JJJJ-MM-TT) und Zeilen [Bereich, Text, vorhanden?]. Die Seite meldet
     ihren Stand mit VUNavigation.datenstand({datum, zeilen}); ohne Meldung liest der Rahmen erst beim Oeffnen des Fensters
     den Kursstand aus dem kleinen Marktlage-Artefakt (asOf = letzter Handelsschluss der Kursdaten). Seit 16.11.2026 ohne
     Pille im Kopf, daher keine Abfrage beim Laden der Seite. */
  const dataBus = {datum: null, zeilen: [], own: false, notes: [], listeners: []};
  const DAYS = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];
  const isoDate = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); return m ? {y: +m[1], m: +m[2], d: +m[3], short: m[3] + '.' + m[2] + '.', long: m[3] + '.' + m[2] + '.' + m[1], day: DAYS[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()]} : null; };
  const escHtml = x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  /* Fenster ueber VUUI.popup (assets/vu-ui.js); auf Seiten ohne Bausteine werden Stil und Skript beim ersten Tipp geladen.
     Schlaegt das fehl, oeffnet fallback (die Seite mit denselben Angaben). */
  const frameSheet = (o, fallback) => {
    const open = () => { if (window.VUUI && window.VUUI.popup) { window.VUUI.popup({id: o.id, title: o.title, body: o.body, cls: 'vu-frame-sheet'}); return true; } return false; };
    if (open()) return;
    if (!document.querySelector('link[href*="/assets/vu-ui.css"]')) { const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/assets/vu-ui.css'; document.head.append(css); }
    const sc = document.createElement('script'); sc.src = '/assets/vu-ui.js';
    sc.onload = () => { if (!open() && fallback) location.assign(fallback); }; sc.onerror = () => { if (fallback) location.assign(fallback); };
    document.head.append(sc);
  };
  const CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
  const openHinweise = () => {
    const foot = LEGAL.approved && LEGAL.notices && LEGAL.notices.footer, links = LEGAL.appLinks || [];
    const extra = dataBus.notes.map(n => typeof n === 'string' ? (LEGAL.approved && LEGAL.notices && LEGAL.notices[n] && LEGAL.notices[n].text) || '' : (n && n.text) || '').filter(Boolean);
    frameSheet({id: 'vu-sh-hinweise', title: 'Daten & Hinweise', body:
      (foot ? '<p class="vu-fs-text">' + escHtml(foot.text) + '</p>' : '') + extra.map(t => '<p class="vu-fs-text">' + escHtml(t) + '</p>').join('') +
      '<div class="vu-fs-rows">' + links.map(l => '<a class="vu-fs-row" href="' + escHtml(l[1]) + '"><b>' + escHtml(l[0]) + '</b>' + CHEV + '</a>').join('') + '</div>'}, '/infos/');
  };
  const REGIME = '/quant/data/product/market-regime-v1.json';
  const openDaten = () => {
    if (!dataBus.own && !dataBus.asked && typeof fetch === 'function') {
      dataBus.asked = true;
      return fetch(REGIME).then(r => r.ok ? r.json() : null).then(j => {
        const k = j && isoDate(j.asOf); if (k && !dataBus.own) { dataBus.datum = j.asOf; dataBus.zeilen = [['Kurse', 'Schluss ' + k.day + ' ' + k.long, true]]; }
      }).catch(() => {}).then(openDaten);
    }
    const d = isoDate(dataBus.datum);
    frameSheet({id: 'vu-sh-daten', title: 'Datenstand', body:
      '<p class="vu-fs-sub">Einmal hier statt auf jeder Seite.</p><div class="vu-fs-rows">' +
      dataBus.zeilen.map(z => '<div class="vu-fs-row"><i class="vu-fs-dot"' + (z[2] === false ? ' data-off' : '') + '></i><b>' + escHtml(z[0]) + '</b><span>' + escHtml(z[1]) + '</span></div>').join('') +
      (!dataBus.zeilen.length && d ? '<div class="vu-fs-row"><i class="vu-fs-dot"></i><b>Daten</b><span>Stand ' + d.day + ' ' + d.long + '</span></div>' : '') +
      '</div><button type="button" class="vu-fs-btn" data-vu-frame-hinweise>Hinweise und Quellen</button>'}, '/status/');
  };
  if (typeof document !== 'undefined') document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-vu-frame-hinweise]')) openHinweise(); });
  if (typeof window !== 'undefined') {
    window.VUNavigation = {
      /* Nur lesend: Reiter je Welt (items = die früheren Leistenplätze, tabs = alle Reiter) und die Plätze des Docks
         (Musterseite /status/bausteine/, Tests). */
      products: () => PRODUCTS.map(p => ({id: p.id, label: p.label, items: p.items.map(([id, label, href, icon]) => ({id, label, href, icon})), tabs: tabEntries(p).map(({id, label, href}) => ({id, label, href}))})),
      places: () => DOCK.map(([id, label, href, icon]) => ({id, label, href, icon})),
      /* Nur lesend: Kennung der Welt der aktuellen Seite (dieselbe Zuordnung wie Menü und Reiter), sonst null.
         Die Aktien-Vorschau (assets/vu-stock-sheet.js) hängt damit den Modul-Kontext an „Ganz öffnen“. */
      product: () => { const p = PRODUCTS.find(x => x.match(location.pathname, location)); return p ? p.id : null; },
      /* Datenstand der Seite fuer das Fenster „Datenstand“: {datum: 'JJJJ-MM-TT', zeilen: [[Bereich, Text, vorhanden?], ...]}.
         Ersetzt den Kursstand, den der Rahmen sonst beim Oeffnen selbst liest. */
      datenstand: o => { o = o || {}; dataBus.own = true; dataBus.datum = isoDate(o.datum) ? o.datum : null; dataBus.zeilen = Array.isArray(o.zeilen) ? o.zeilen.filter(z => z && z[0] && z[1]) : []; dataBus.listeners.forEach(fn => fn()); },
      /* Pflicht-Hinweis der Seite fuer das Fenster „Daten & Hinweise“: Schluessel aus assets/legal-notices.json
         (stock, ranking, setup, backtest, modelPortfolio, thirdParty, ai, editorial) oder {text}. */
      hinweis: n => { if (n && !dataBus.notes.includes(n)) dataBus.notes.push(n); },
      /* Fenster des Rahmens von der Seite aus oeffnen (z. B. „Daten & Hinweise“ am Seitenende). */
      openHinweise: () => openHinweise(), openDatenstand: () => openDaten(),
      /* Schalter des Rahmens (auch statisch im Markup, damit nichts springt):
           <html data-vu-bleed>          Der Bildschirm beginnt unter dem Kopf (Titelbild bis an den oberen Rand): der Kopf ist
                                         durchsichtig und wird nach 24 px Scrollen deckend; der Platz fuer den Kopf entfaellt.
                                         Ohne das Attribut ist der Kopf immer deckend (Standard).
           <html data-vu-tabs="inhalt">  Die Seite zeigt ihre Reiter selbst im Inhalt: die Reiterzeile des Rahmens bleibt weg
                                         (und ihr Platz unter dem Kopf). Ohne das Attribut setzt der Rahmen data-vu-tabs auf
                                         die Kennung des Produkts und zeigt seine Reiter.
         rahmen({bleed, tabs}) setzt dieselben Attribute zur Laufzeit (SPA: je Ansicht), tabs: 'inhalt' | 'rahmen'. */
      rahmen: o => {
        const html = document.documentElement; o = o || {};
        if ('bleed' in o) html.toggleAttribute('data-vu-bleed', !!o.bleed);
        if ('tabs' in o) { if (o.tabs === 'inhalt') html.setAttribute('data-vu-tabs', 'inhalt'); else if (html.getAttribute('data-vu-tabs') === 'inhalt') html.removeAttribute('data-vu-tabs'); }
      },
      dock: state => {
        state = state || {};
        Object.assign(dockBus.state, state);
        if ('active' in state) dockBus.state.activeAt = location.href;
        // Die Leiste ist Opt-in: sie erscheint erst, wenn ein Produkt sie anfordert.
        dockBus.requested = true;
        const nav = document.querySelector('vu-navigation');
        if (nav && nav.mountDock) nav.mountDock();
        dockBus.listeners.forEach(fn => fn());
      }
    };
  }

  /* Die Plattformnavigation ist auf allen Produkten dieselbe Komponente.
     Discover synchronisiert ihr Farbschema mit seiner eigenen Theme-Wahl. */
  const THEMES = {
    light: {bg: 'rgba(255,255,255,.86)', border: '#e9e9e9', ink: '#000', inv: '#fff', card: '#f1f1f1', glass: 'rgba(238,238,238,.82)', mute: '#5d636b', ring: '#c8f531', me: 'rgba(238,238,238,.82)', meInk: '#000', on: '#000', onInk: '#fff', outline: '#101318',
      /* Hell vollstaendig hell (Owner 16.11.2026): Dock, Menue „Dein Universe“ und Modul-Symbol hell; dunkel = Prototyp, unveraendert */
      page: '#fff', accent: '#101318', dockBg: 'rgba(255,255,255,.92)', dockLine: 'rgba(0,0,0,.1)', dockInk: '#000', dockMute: '#5d636b', dockOn: '#000',
      panel: '#fff', panelInk: '#000', panelMute: '#5d636b', field: '#f1f1f1', fieldHover: '#e9e9e9', grabBar: '#c9c9cc', hair: 'rgba(0,0,0,.1)', closeInk: '#000', fieldInk: '#000',
      icoBg: '#c8f531', icoLine: 'rgba(0,0,0,.08)', icoLineHead: 'rgba(0,0,0,.08)', icoInk: '#101318', current: '0 0 0 1.5px #000', accentLine: 'rgba(16,19,24,.5)', pressed: '#000', pressedInk: '#fff'},
    dark: {bg: 'rgba(0,0,0,.82)', border: '#262626', ink: '#f4f5f1', inv: '#000', card: '#151516', glass: 'rgba(20,20,22,.7)', mute: '#a1a7af', ring: '#c8f531', me: 'rgba(20,20,22,.7)', meInk: '#f4f5f1', on: '#fff', onInk: '#000', outline: '#c8f531',
      page: '#000', accent: '#c8f531', dockBg: 'rgba(12,12,13,.92)', dockLine: 'rgba(255,255,255,.14)', dockInk: '#fff', dockMute: '#a1a7af', dockOn: '#c8f531',
      panel: '#151516', panelInk: '#f4f5f1', panelMute: '#a1a7af', field: '#202022', fieldHover: '#262628', grabBar: '#3a3a3d', hair: 'rgba(255,255,255,.09)', closeInk: '#fff', fieldInk: '#fff',
      icoBg: '#0e1013', icoLine: 'rgba(200,245,49,.25)', icoLineHead: 'rgba(200,245,49,.35)', icoInk: '#c8f531', current: '0 0 0 1px rgba(200,245,49,.5),0 0 28px rgba(200,245,49,.18)', accentLine: 'rgba(200,245,49,.5)', pressed: '#fff', pressedInk: '#000'}
  };

  /* Farbschema plattformweit: dieselbe Wahl (localStorage, Schluessel von
     Discover) gilt auf jeder Seite. Seiten mit Hell- und Dunkel-Styles
     tragen das Attribut theme-switch an <vu-navigation>; nur dort zeigt
     das Menue den Schalter. Gibt es die Discover-Engine (VUDiscover.theme),
     schaltet sie; sonst setzt der Kopf <html data-theme> selbst und meldet
     den Wechsel mit dem Ereignis vu-theme-change.

     DUNKEL IST DER STANDARD (Owner 15.11.2026, App-Konzept 2). Die Regel steht an EINER Stelle, themeWanted():
       - gespeicherte Wahl "light" oder "dark": gilt.
       - nichts gespeichert (erster Besuch, kein Speicher): dunkel; die Wahl wird gespeichert, damit das Inline-Skript
         jeder weiteren Seite sie vor dem ersten Zeichnen liest.
       - „Wie Gerät“ (Konto → Einstellungen, VUTheme.set('system')): Merker THEME_SYSTEM; das Schema folgt dem Geraet,
         der Schluessel traegt weiter "light"/"dark" (so lesen ihn alle Inline-Skripte und die Discover-Engine).
       - Einmalige Umstellung (Merker THEME_DEFAULT): Bis 15.11.2026 hielt die erste besuchte Welt ihr Schema fest (VU3),
         auch ohne Wahl; ein gespeichertes "light" belegt deshalb keine Wahl. Beim ersten Laden nach der Umstellung gilt
         einmal dunkel; wer danach Hell waehlt, behaelt Hell. Automatisierte Pruefungen (navigator.webdriver) setzen das
         Schema vor dem Laden selbst und bleiben davon ausgenommen.
     Kein heller Blitz: dieses Skript steht auf jeder Seite synchron am Anfang von <body> und stellt um, bevor Inhalt
     gezeichnet ist; die Inline-Skripte der Seiten starten ebenfalls dunkel. */
  const THEME_KEY = 'vu-discover-theme-v1';
  const THEME_SYSTEM = 'vu-theme-system-v1', THEME_DEFAULT = 'vu-theme-default-v2';
  const BAR = {light: '#ffffff', dark: '#08080a'};
  /* Reine Regel (Tests): store = {get(k), set(k, v|null)}, device = "light"|"dark", automated = navigator.webdriver. */
  const themeWanted = (store, device, automated) => {
    if (store.get(THEME_DEFAULT) !== '1') {
      store.set(THEME_DEFAULT, '1');
      if (!automated && store.get(THEME_SYSTEM) !== '1') store.set(THEME_KEY, 'dark');
    }
    if (store.get(THEME_SYSTEM) === '1') { if (store.get(THEME_KEY) !== device) store.set(THEME_KEY, device); return device; }
    const v = store.get(THEME_KEY);
    if (v === 'light' || v === 'dark') return v;
    store.set(THEME_KEY, 'dark');
    return 'dark';
  };
  const themeStore = {get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set: (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (_) { /* ohne Speicher: je Seite */ } }};
  const deviceTheme = () => { try { return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; } catch (_) { return 'dark'; } };
  const currentTheme = () => document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  let themeFollows = false;   // true, solange applyTheme dem Geraet folgt (kein Nutzerwechsel)
  const applyTheme = (mode, persist) => {
    const engine = window.VUDiscover && window.VUDiscover.theme;
    if (persist) themeStore.set(THEME_SYSTEM, null);
    if (engine && persist) { engine.set(mode); return; }  // Discover/Screener melden den Wechsel selbst
    if (persist) themeStore.set(THEME_KEY, mode);
    const html = document.documentElement;
    html.setAttribute('data-theme', mode);
    html.setAttribute('data-theme-mode', mode);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', BAR[mode]);
    document.querySelectorAll('vu-navigation').forEach(n => n.setAttribute('theme', mode));
    document.dispatchEvent(new Event('vu-theme-change'));
  };
  const followDevice = () => {
    const d = deviceTheme();
    themeStore.set(THEME_KEY, d);
    themeFollows = true;
    try { const engine = window.VUDiscover && window.VUDiscover.theme; if (engine) engine.set(d); else if (d !== currentTheme()) applyTheme(d, false); } finally { themeFollows = false; }
  };
  const themed = () => typeof document !== 'undefined' && !!document.querySelector('vu-navigation[theme-switch]');
  /* Die oeffentliche Startseite (/, /website2/) gehoert nicht zur App: sie behaelt ihren eigenen Standard und liest nur eine
     vorhandene Wahl (ihr Inline-Skript). */
  const publicPage = () => { const p = location.pathname; return p === '/' || p === '/index.html' || p.startsWith('/website2/'); };
  if (typeof window !== 'undefined' && themed() && !publicPage()) {
    const want = themeWanted(themeStore, deviceTheme(), !!navigator.webdriver);
    const html = document.documentElement;
    if (html.getAttribute('data-theme') !== want) {
      html.setAttribute('data-theme', want); html.setAttribute('data-theme-mode', want);
      const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', BAR[want]);
      document.querySelectorAll('vu-navigation').forEach(n => n.setAttribute('theme', want));
    }
  }
  if (typeof window !== 'undefined') {
    window.VUTheme = {key: THEME_KEY, mode: currentTheme,
      /* choice(): "system", solange „Wie Gerät“ gilt, sonst das gezeichnete Schema. */
      choice: () => themeStore.get(THEME_SYSTEM) === '1' ? 'system' : currentTheme(),
      set: m => { if (m === 'system') { themeStore.set(THEME_SYSTEM, '1'); followDevice(); } else applyTheme(m === 'light' ? 'light' : 'dark', true); },
      toggle: () => applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true)};
    /* Eine Wahl in Discover (eigene Einstellungen, VUDiscover.theme.set) beendet „Wie Gerät“. */
    document.addEventListener('vu-theme-change', () => { if (!themeFollows && themeStore.get(THEME_SYSTEM) === '1' && currentTheme() !== deviceTheme()) themeStore.set(THEME_SYSTEM, null); });
    try { matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (themed() && themeStore.get(THEME_SYSTEM) === '1') followDevice(); }); } catch (_) { /* alter Browser */ }
    // Wahl aus einem anderen Tab uebernehmen
    window.addEventListener('storage', e => {
      if (e.key !== THEME_KEY || !themed()) return;
      const mode = e.newValue === 'light' ? 'light' : 'dark';
      if (mode !== currentTheme()) applyTheme(mode, false);
    });
  }

  /* Die Farbwerte des Kopfes als Funktion des Schemas: so kann Discover
     das Attribut theme spaeter umschalten (Hell/Dunkel/System, V4.1), und
     der Kopf zieht mit, ohne neu aufgebaut zu werden. */
  /* Kopf nach Prototyp „App-Konzept 2“ (shell.js: .hdr, .mod, .hb, .live, .tab, .sheet; kit.js: .hud, .eb, .rnd, .row).
     Die Masse sind die des Prototyps; die Farben haengen am Schema (THEMES), dunkel = Prototyp. */
  const styles = (t) => `
        :host{display:block;position:fixed;inset:0 0 auto;z-index:1000000;color:${t.ink};font:500 15px/1.35 Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;text-align:left;-webkit-font-smoothing:antialiased}
        *{box-sizing:border-box}
        header{transition:background .25s}
        :host([solid]) header{background:${t.bg};-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}
        .shell{width:min(1240px,calc(100% - 48px));margin:auto}.row{height:64px;display:flex;align-items:center;gap:8px}
        .brand{flex-shrink:0;display:flex;align-items:center;min-width:0;color:${t.ink};text-decoration:none}
        .brand img{display:block;width:clamp(150px,14vw,190px);max-width:40vw;height:auto}
        .world[hidden],.brand[hidden]{display:none}
        .mod{position:relative;display:flex;align-items:center;gap:8px;flex:0 1 auto;min-width:0;height:38px;padding:0 12px 0 6px;border:0;border-radius:99px;background:${t.glass};-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);color:${t.ink};font-weight:800;font-size:16px;letter-spacing:-.02em;white-space:nowrap}
        .mi{width:28px;height:28px;border-radius:9px;background:${t.icoBg};border:1px solid ${t.icoLineHead};display:grid;place-items:center;color:${t.icoInk};flex:none}
        .mi svg{width:18px;height:18px}.mi svg.line{fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
        .world-name{min-width:0;overflow:hidden;text-overflow:ellipsis}
        .mod .chev{width:12px;height:12px;flex:none;fill:none;stroke:currentColor;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
        .quick{display:flex;align-items:center;gap:22px;margin-left:auto}.quick a{color:${t.ink};font-size:13px;font-weight:700;text-decoration:none}
        .quick a[aria-current=page]{text-decoration:underline;text-underline-offset:8px}
        .quick a:hover{text-decoration:underline;text-underline-offset:5px}
        .tools{display:flex;align-items:center;gap:8px;margin-left:auto;flex-shrink:0}
        @media(min-width:1025px){:host(:not([dock])) .quick+.tools{margin-left:12px}}
        a:focus-visible,button:focus-visible,input:focus-visible{outline:2px solid ${t.outline};outline-offset:3px}
        button{font:inherit;cursor:pointer}
        .hb{position:relative;width:38px;height:38px;flex:none;display:grid;place-items:center;border-radius:99px;border:0;padding:0;background:${t.glass};-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);color:${t.ink};text-decoration:none}
        .hb svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
        .mod::after,.hb::after{content:"";position:absolute;inset:-3px}
        .ki{background:#c8f531;color:#101318;-webkit-backdrop-filter:none;backdrop-filter:none;width:auto;display:flex;align-items:center;gap:6px;padding:0 13px 0 10px}
        .ki svg{width:18px;height:18px;fill:currentColor;stroke:none;flex:none}
        .ki .ki-t{display:flex;flex-direction:column;justify-content:center;line-height:1;text-align:left;white-space:nowrap}
        .ki .ki-t small{font-size:8px;line-height:1;font-weight:800;letter-spacing:.09em;text-transform:uppercase}
        .ki .ki-t b{margin-top:1px;font-size:15.5px;line-height:1;font-weight:900;letter-spacing:-.01em}
        .profile{border:2px solid ${t.ring};background:${t.me};color:${t.meInk}}
        .profile svg{stroke-width:2.4}
        :host([tight]) .mod .chev{display:none}:host([tighter]) .row{gap:6px}:host([tighter]) .tools{gap:6px}:host([tighter]) .mod{padding-right:10px}:host([tighter]) .ki{padding:0 11px 0 9px;gap:5px}:host([tighter]) .ki .ki-t small{font-size:7.5px;letter-spacing:.06em}:host([tightest]) .ki .ki-t small{display:none}:host([tightest]) .ki{padding:0 12px 0 10px}
        /* Menü im Kopf (Owner 22.11.2026, Variante 2): keine Reiterzeile. Links steht Modul und Bereich; ein Tipp öffnet die Bereiche
           des Moduls. Rechts KI (ohne Dachzeile), der Rasterknopf (Hauptmenü, wie der Universe-Knopf im Dock) und die Suche; „Ich“
           steht im Dock, das Profil im Kopf entfällt dort. */
        .world-t{display:flex;flex-direction:column;justify-content:center;min-width:0;line-height:1.05}
        .world-area{font-size:11.5px;font-weight:700;letter-spacing:0;color:${t.mute};overflow:hidden;text-overflow:ellipsis}
        .world-area:empty{display:none}
        .sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
        .skip{position:absolute;left:8px;top:-60px;z-index:2147483647;padding:12px 16px;border-radius:12px;background:#c8f531;color:#101318;font:700 14px Inter,system-ui,sans-serif;text-decoration:none}
        .skip:focus{top:8px;outline:2px solid #101318;outline-offset:2px}
        :host([dock]) .mod{height:44px}
        :host([dock]) .hb:not(.ki){width:44px;height:44px}
        :host([dock]) .ki{height:44px}
        :host([dock]) .ki .ki-t small{display:none}
        :host([dock]) .profile{display:none}
        .grid{display:none}
        :host([dock]) .grid{display:grid;background:${t.on};color:${t.on === '#000' ? '#c8f531' : '#000'};-webkit-backdrop-filter:none;backdrop-filter:none}
        .hint{position:absolute;z-index:3;left:12px;top:calc(100% + 2px);display:flex;align-items:center;gap:8px;max-width:min(300px,calc(100vw - 24px));padding:10px 8px 10px 14px;border-radius:16px;background:${t.on};color:${t.onInk};font-size:13.5px;font-weight:700;box-shadow:0 10px 30px rgba(0,0,0,.22)}
        .hint::before{content:"";position:absolute;left:28px;top:-6px;width:12px;height:12px;background:inherit;transform:rotate(45deg)}
        .hint button{flex:none;width:32px;height:32px;border:0;border-radius:99px;background:transparent;color:inherit;font-size:18px;line-height:1;cursor:pointer}
        .areas{display:none}
        :host([areas]) .areas{display:block}
        :host([areas]) .panel>*:not(.grab):not(.panel-head):not(.areas){display:none!important}
        .areas-sub{margin:-2px 0 12px;color:${t.panelMute};font-size:14px}
        .areas-list{display:grid;gap:8px}
        .areas-list a{display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 12px;border-radius:18px;background:${t.field};color:${t.panelInk};text-decoration:none;font-weight:800;font-size:15.5px}
        .areas-list a i{flex:none;display:grid;place-items:center;width:36px;height:36px;border-radius:11px;background:#c8f531;color:#101318;font-style:normal;font-size:15px}
        .areas-list a span{flex:1}
        .areas-list a>svg{width:18px;height:18px;flex:none;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;opacity:.6}
        .areas-list a[aria-current=page]{background:${t.on};color:${t.onInk}}
        .all-mods{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:52px;margin-top:10px;padding:0 4px;border:0;background:none;color:${t.panelInk};font:inherit;font-weight:800;font-size:15px;cursor:pointer}
        .all-mods svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.2}
        .mod:active,.hb:active{transform:scale(.97)}
        .toggle{flex-shrink:0;border:3px solid transparent;margin:-3px;background:${t.glass};background-clip:padding-box;color:${t.ink};height:44px;padding:0 15px;border-radius:99px;font-weight:800;font-size:14px}
        :host([world]) .toggle{display:none}
        @media(max-width:520px){.toggle{width:44px;padding:0;display:grid;place-items:center;font-size:17px}.menu-label{display:none}}
        .tabs{position:relative;display:flex;gap:6px;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none;padding:8px max(24px,calc((100% - 1240px)/2))}
        .tabs[hidden]{display:none}.tabs::-webkit-scrollbar{display:none}
        .tab{position:relative;flex:none;display:inline-flex;align-items:center;height:44px;margin-block:-4px;color:${t.ink};font-size:14px;font-weight:700;text-decoration:none;white-space:nowrap;-webkit-tap-highlight-color:transparent}
        .tab .pill{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 15px;border-radius:99px;background:${t.card}}
        .tab:hover .pill{filter:brightness(.95)}
        .tab[aria-current=page] .pill{background:${t.on};color:${t.onInk};filter:none}
        .tab .badge{min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:${t.on};color:${t.onInk};font-size:10.5px;font-weight:800;line-height:18px;text-align:center}
        .tab[aria-current=page] .badge{background:#c8f531;color:#000}
        .tab:focus-visible{outline:0}.tab:focus-visible .pill{outline:2px solid ${t.outline};outline-offset:2px}
        .backdrop{position:fixed;inset:0;background:rgba(0,0,0,.6);visibility:hidden;opacity:0;transition:opacity .25s}
        .panel{position:fixed;right:0;top:0;bottom:0;width:min(440px,100vw);padding:calc(14px + env(safe-area-inset-top)) 16px calc(26px + env(safe-area-inset-bottom));overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;background:${t.panel};color:${t.panelInk};visibility:hidden;transform:translateX(24px);opacity:0;transition:transform .2s,opacity .2s,visibility .2s}
        .panel::-webkit-scrollbar{display:none}
        :host([open]) .backdrop,:host([open]) .panel{visibility:visible;opacity:1;transform:none}
        .grab{display:none;position:sticky;top:0;z-index:1;height:21px;margin:0 -16px;background:${t.panel};touch-action:none;cursor:grab}
        .grab::before{content:"";position:absolute;left:calc(50% - 22px);top:10px;width:44px;height:5px;border-radius:9px;background:${t.grabBar}}
        .panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;margin-top:6px}
        .panel h2.uni-title{margin:0;font-size:30px;line-height:1;font-weight:900;letter-spacing:-.045em;color:${t.panelInk}}
        .uni-sub{margin:0;color:${t.panelMute};font-size:12.5px;line-height:1.35}
        .close{width:44px;height:44px;margin-right:-4px;border:0;border-radius:50%;background:transparent;color:${t.closeInk};display:grid;place-items:center;padding:0;flex:none}
        .close i{width:36px;height:36px;border-radius:99px;background:${t.panel};display:grid;place-items:center}
        .close svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:3;stroke-linecap:round}
        .find svg,.mine svg,.here svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
        .find{display:flex;align-items:center;gap:10px;height:52px;margin-top:22px;padding:0 6px 0 16px;border-radius:99px;background:${t.field};color:${t.panelMute}}
        .find input{flex:1;min-width:0;height:44px;border:0;background:transparent;color:${t.fieldInk};font:600 15.5px/1 inherit;font-family:inherit;outline-offset:0}
        .find input::placeholder{color:${t.panelMute}}
        .find button{width:44px;height:44px;margin:-2px;border:2px solid transparent;border-radius:50%;background:#c8f531;background-clip:padding-box;color:#101318;display:grid;place-items:center;padding:0;flex:none}
        .find button svg{fill:currentColor;stroke:none}
        .panel h2{margin:16px 0 0;font-size:10.5px;line-height:1.35;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:${t.panelMute}}
        .tiles{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
        .tile{display:flex;align-items:center;gap:10px;min-width:0;padding:12px;border-radius:22px;background:${t.field};color:${t.panelInk};text-decoration:none;transition:transform .12s}
        .tile:active{transform:scale(.97)}
        .tile:hover{background:${t.fieldHover}}
        .tile>span:last-child{flex:1;min-width:0}
        .tile .menu-product-icon{width:40px;height:40px;border-radius:12px;background:${t.icoBg};border:1px solid ${t.icoLine};color:${t.icoInk};display:grid;place-items:center;flex:none}
        .tile .menu-product-icon svg{width:22px;height:22px}
        .tile b{display:block;font-size:16px;font-weight:800;line-height:1.35}
        .tile small{display:block;font-size:11px;line-height:1.35;color:${t.panelMute}}
        .tile .kicker{display:block;font-style:normal;font-size:9.5px;line-height:1;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:${t.panelMute};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .tile .ki-name b{display:flex;align-items:center;gap:6px;margin-top:1px;line-height:1}.tile .ki-name small{line-height:1.12}
        .tile .beta{height:16px;padding:0 6px;border-radius:99px;border:1px solid ${t.accentLine};color:${t.accent};font-size:9.5px;line-height:14px;font-weight:800;letter-spacing:.04em}
        .tile[aria-current=page],.tile.is-current{box-shadow:${t.current}}
        .links{display:grid;margin-top:8px}
        .links a,.mine a,.more summary{display:flex;align-items:center;gap:12px;min-height:46px;padding:0;border-bottom:1px solid ${t.hair};color:${t.panelInk};font-size:15px;font-weight:800;text-decoration:none}
        .mine{margin-top:8px}
        .links a[aria-current=page]{color:${t.accent}}
        .legal-note{margin:12px 0 4px;color:${t.panelMute};font-size:11px;line-height:1.5}
        .links a span,.mine a b{flex:1}
        .links a>svg,.mine a>svg{color:${t.panelMute}}
        .mine a i,.links a i{color:${t.accent};display:grid;place-items:center;font-style:normal;width:20px}
        .more{margin-top:8px}.more summary{list-style:none;cursor:pointer}.more summary::-webkit-details-marker{display:none}
        .more summary:after{content:"";width:8px;height:8px;margin-right:6px;border-right:2px solid ${t.panelMute};border-bottom:2px solid ${t.panelMute};transform:rotate(45deg) translateY(-3px)}
        .more[open] summary:after{transform:rotate(225deg)}
        .more summary span{flex:1}
        .settings{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}
        .choices{display:flex;gap:6px}
        .choices button,.choices a{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;padding:0 16px;border:0;border-radius:999px;background:${t.field};color:${t.panelInk};font:700 14px/1 inherit;font-family:inherit;text-decoration:none}
        .choices [aria-pressed=true]{background:${t.pressed};color:${t.pressedInk}}
        .panel a:focus-visible,.panel button:focus-visible,.panel input:focus-visible,.panel summary:focus-visible{outline:2px solid ${t.accent};outline-offset:2px}
        @media(max-width:1024px){.quick{display:none}}
        @media(max-width:760px){.shell{width:auto}.row{height:56px;padding:0 12px}.brand img{width:min(150px,40vw)}
          .tabs{padding-inline:14px}
          .panel{left:0;top:auto;width:auto;max-height:90vh;max-height:90dvh;padding-top:0;border-radius:30px 30px 0 0;transform:translateY(102%);opacity:1;transition:transform .32s cubic-bezier(.2,.9,.25,1),visibility .32s}
          .grab{display:block}.panel-head{margin-top:0}}
        @media(max-width:430px){:host(:not([world])) .brand img{width:min(132px,34vw)}}
        @media(max-width:360px){.row{padding:0 10px;gap:6px}.tools{gap:6px}.mod{font-size:15px}.tabs{padding-inline:10px}.panel{padding-inline:12px}.grab{margin-inline:-12px}.tile{padding:10px}}
        :host([menu-only]) header{display:none}
        :host([theme="dark"]) header .brand img{filter:invert(1) brightness(1.08)}
        :host([dock]) .toggle{display:none}
        /* Desktop (ab 1200 px, Owner 22.11.2026): auch Seiten mit Dock zeigen den Direktzugriff im Kopf; darunter bleibt er dem Dock. */
        @media(max-width:1199px){:host([dock]) .quick{display:none}}
        @media(min-width:1200px){:host([dock]) .quick+.tools{margin-left:12px}}
        @media(prefers-reduced-motion:reduce){header,.backdrop,.panel,.tile{transition:none}.mod:active,.hb:active,.tile:active{transform:none}}
`;

  class VisionNavigation extends HTMLElement {
    static get observedAttributes() { return ['theme']; }
    attributeChangedCallback(name) {
      if (name !== 'theme' || !this.shadowRoot) return;
      const style = this.shadowRoot.querySelector('style');
      if (style) style.textContent = styles(THEMES[this.getAttribute('theme') === 'dark' ? 'dark' : 'light']);
      const dock = this.dockHost && this.dockHost.shadowRoot && this.dockHost.shadowRoot.querySelector('style');
      if (dock) dock.textContent = dockStyles(THEMES[this.getAttribute('theme') === 'dark' ? 'dark' : 'light']);
    }
    connectedCallback() {
      if (this.shadowRoot) return;
      const t = THEMES[this.getAttribute('theme') === 'dark' ? 'dark' : 'light'];
      /* Bis zum 18.09.2026 trug der Kopf jeder Seite die Plakette
         "Development Preview"; wer fertig war, schrieb no-preview an das
         Element. Mit der Freigabe von V4.1 gilt die Umkehrung: die
         Kennzeichnung erscheint in der sichtbaren Consumer-Erfahrung
         nirgends mehr (Owner-Entscheidung 1 vom 18.09.2026). Das Attribut
         no-preview bleibt zulaessig und ohne Wirkung, damit die Seiten, die
         es tragen, unveraendert gueltig bleiben. Interne Entwicklungs- und
         QA-Metadaten (quant/config/development-preview.json) bleiben, wo
         sie sind - sie stehen in Daten, nicht auf dem Bildschirm. */
      const root = this.attachShadow({mode: 'open'});
      const ico = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
      const SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2c.5 3.9 2.3 6.2 6.4 6.8-4.1.6-5.9 2.9-6.4 6.8-.5-3.9-2.3-6.2-6.4-6.8 4.1-.6 5.9-2.9 6.4-6.8z"/><path d="M18.6 14.6c.2 1.6.9 2.5 2.6 2.8-1.7.3-2.4 1.2-2.6 2.8-.2-1.6-.9-2.5-2.6-2.8 1.7-.3 2.4-1.2 2.6-2.8z"/></svg>';
      /* Kopfzeile nach Prototyp (shell.js .hdr): links der Welten-Wechsler (oeffnet das Menue) oder auf Seiten ausserhalb
         der Welten das Logo, rechts KI, Suche, Profil. Das Farbschema wechselt im Menue (Hell/Dunkel). */
      root.innerHTML = `<style>${styles(t)}</style><header><a class="skip" href="#main" hidden>Zum Inhalt</a><div class="shell"><div class="row"><a class="brand" href="/" aria-label="Vision Universe Startseite"><img src="/assets/vision-universe-logo-web.png" alt="Vision Universe" width="190" height="63"></a><button class="world mod" type="button" hidden aria-haspopup="true" aria-expanded="false" aria-controls="site-panel"><span class="hud mi"></span><span class="world-t"><span class="world-name"></span> <small class="world-area"></small></span><svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9l7 7 7-7"/></svg><span class="sr">: Bereiche öffnen</span></button><nav class="quick" aria-label="Direktzugriff"><a href="/discover/">Discover</a><a href="/quant/">Quant</a><a href="/technical/">Technical</a><a href="/elliott/">Elliott</a><a href="/screener/">Screener</a><a class="q-extra" href="/vorsorge/">Vorsorge</a><a class="q-extra" href="/portfolios/">Portfolios</a></nav><div class="tools"><a class="hb ki" href="/ask/?fokus=1" aria-label="Vision Universe KI fragen">${SPARK}<span class="ki-t" aria-hidden="true"><small>Vision Universe</small><b>KI</b></span></a><button class="hb grid" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="site-panel" aria-label="Hauptmenü: alle Module">${ico(dockIcons.grid)}</button><a class="hb search" href="/discover/#/suche" aria-label="Aktie suchen">${ico(dockIcons.search)}</a><a class="hb profile" href="/mein-dashboard/" aria-label="Mein Bereich">${ico(dockIcons.person)}</a><button class="toggle" type="button" aria-label="Menü öffnen" aria-controls="site-panel" aria-expanded="false">☰<span class="menu-label"> Menü</span></button></div></div></div><nav class="tabs" hidden></nav></header><div class="backdrop"></div><nav class="panel" id="site-panel" aria-label="Vision Universe Menü" aria-hidden="true"><span class="grab" aria-hidden="true"></span><div class="panel-head"><h2 class="uni-title">Dein Universe</h2><button class="close" type="button" aria-label="Menü schließen"><i>${ico(dockIcons.close)}</i></button></div><p class="uni-sub">Alle Module, von jeder Seite aus.</p><section class="areas" aria-label="Bereiche"><p class="areas-sub"></p><div class="areas-list"></div><button class="all-mods" type="button">Anderes Modul wählen${ico(dockIcons.next)}</button></section><div class="groups"></div><form class="find" role="search">${ico(dockIcons.search)}<input type="search" name="q" placeholder="Aktie, Produkt oder Frage …" aria-label="Aktie, Produkt oder Frage" autocomplete="off" enterkeyhint="search"><button type="submit" aria-label="Vision Universe KI fragen">${SPARK}</button></form><section class="here" hidden><h2 class="here-title"></h2><div class="links here-links"></div></section><h2>Mein Bereich</h2><div class="mine">${MINE.map(([label,href,icon])=>`<a href="${href}"><i>${ico(dockIcons[icon])}</i><b>${label}</b>${ico(dockIcons.next)}</a>`).join('')}</div><details class="more"><summary><span>Weitere Produkte</span></summary><div class="links more-links"></div></details><div class="settings" role="group" aria-label="Einstellungen"><div class="choices appearance" role="group" aria-label="Darstellung"></div><div class="choices currency" role="group" aria-label="Anzeigewährung"></div></div>${legalMenu()}</nav>`;
      /* Menue „Dein Universe“ (Prototyp build.js T.universe): Titel und Schliessen, vier Gruppen mit je zwei Kacheln
         nebeneinander, darunter - was der Prototyp nicht zeigt, aber bleiben muss - Suche/KI, die Unterseiten der aktuellen
         Welt, Mein Bereich, Weitere Produkte, Darstellung, Rechtliches. Bis 760 px ein Sheet von unten (Griff, runde Ecken,
         hoechstens 90 % hoch, Inhalt scrollt darin), darueber die Seitenleiste rechts. */
      const tiles=root.querySelector('.groups'),here=root.querySelector('.here'),hereLinks=root.querySelector('.here-links');
      menuGroups().forEach(({title,tiles:list})=>{
        const h=document.createElement('h2');h.textContent=title;const grid=document.createElement('div');grid.className='tiles';
        list.forEach(({id,label,href,icon,claim,kicker,badge})=>{
          const a=document.createElement('a');a.className='tile';a.href=href;a.dataset.group=id;
          a.innerHTML=`<span class="menu-product-icon" aria-hidden="true">${productIcon(icon)}</span><span${kicker?' class="ki-name"':''}>${kicker?`<em class="kicker">${kicker}</em>`:''}<b>${label}${badge?` <span class="beta">${badge}</span>`:''}</b><small>${claim}</small></span>`;
          if(kicker)a.setAttribute('aria-label',`${kicker} ${label}, ${claim}${badge?', '+badge:''}`);
          grid.append(a);
        });
        tiles.append(h,grid);
      });
      const more=groups.find(g=>g.id==='more');
      /* Die Startseite der Website stand als Logo im Kopf des Menues; sie bleibt als Eintrag erreichbar. */
      more.entries.concat([['Vision Universe Startseite','/']]).forEach(([label,href])=>{const a=document.createElement('a');a.href=href;a.innerHTML=`<span></span>`;a.firstChild.textContent=label;root.querySelector('.more-links').append(a);});
      root.querySelector('.find').addEventListener('submit',event=>{
        event.preventDefault();
        const q=root.querySelector('.find input').value.trim();
        const product=q&&groups.find(g=>g.href&&g.label.toLowerCase()===q.toLowerCase());
        location.assign(product?product.href:'/ask/'+(q?'?q='+encodeURIComponent(q):''));
      });
      const world=root.querySelector('.world'),brand=root.querySelector('.brand');
      /* Sprunglink (WCAG 2.4.1): nur, wenn die Seite keinen eigenen hat; springt zum Hauptbereich der Seite. */
      const skip=root.querySelector('.skip');
      if(skip){const decide=()=>{if(document.querySelector('a[href^="#"][class*="skip"]'))return;skip.hidden=false;skip.addEventListener('click',e=>{const m=document.querySelector('main,[role="main"]');if(!m)return;e.preventDefault();if(!m.hasAttribute('tabindex'))m.setAttribute('tabindex','-1');m.focus();m.scrollIntoView({block:'start'});});};document.readyState==='loading'?document.addEventListener('DOMContentLoaded',decide,{once:true}):decide();}
      /* Passt der Name der Welt nicht neben die Knoepfe (schmale Handys, lange Namen): zuerst entfaellt der Pfeil an der
         Modul-Pille (tight), dann werden Abstaende und Innenrand enger (tighter); erst danach blendet die KI-Pille die
         Dachzeile „VISION UNIVERSE“ aus (tightest), „KI“ bleibt immer stehen (Owner 16.11.2026). Ohne Welt (Logo) zaehlt,
         ob die Knoepfe rechts im Innenrand der Zeile bleiben (der Menue-Knopf ragt mit seinem Tipp-Rand 3 px hinaus). */
      const fit=()=>{this.removeAttribute('tight');this.removeAttribute('tighter');this.removeAttribute('tightest');const name=world.querySelector('.world-name'),row=root.querySelector('.row'),tools=root.querySelector('.tools'),over=()=>{if(!world.hidden)return name.scrollWidth>name.clientWidth+1;const r=row.getBoundingClientRect();return tools.getBoundingClientRect().right>r.right-parseFloat(getComputedStyle(row).paddingRight)+1;};if(over()){this.setAttribute('tight','');if(over()){this.setAttribute('tighter','');if(over())this.setAttribute('tightest','');}}};
      const syncWorld=()=>{
        const w=worldOf(location);
        world.hidden=!w;brand.hidden=!!w;this.toggleAttribute('world',!!w);
        if(!w)return;
        world.querySelector('.hud').innerHTML=dockProductIcon(w.icon);
        world.querySelector('.world-name').textContent=w.label;
        syncArea();
        fit();
      };
      /* Menü im Kopf (Owner 22.11.2026): unter dem Modulnamen steht der Bereich, in dem man ist (der erste Bereich heißt „Start“). */
      const areaOf=()=>{
        const product=PRODUCTS.find(p=>p.match(location.pathname,location));if(!product)return null;
        const entries=tabEntries(product),on=tabActive(product,entries,location,dockBus.state);
        return {product,entries,on,label:on?(on===entries[0]?'Start':on.label):''};
      };
      const syncArea=()=>{
        const a=areaOf(),label=a&&!world.hidden?a.label:'';
        world.querySelector('.world-area').textContent=label;
      };
      dockBus.listeners.push(()=>{syncArea();fit();});
      syncWorld();
      const glyph=(product,href)=>{const g=groups.find(x=>x.id===product.id),e=g&&g.entries.find(x=>routeKey(x[1])===routeKey(href));return e&&e[2]?e[2]:'›';};
      this.openAreas=from=>{
        const a=areaOf();if(!a){this.openMenu(from);return;}
        if(this.hasAttribute('open')){this.openMenu(from);return;}
        const list=root.querySelector('.areas-list');list.replaceChildren();
        a.entries.forEach((e,i)=>{
          const link=document.createElement('a');link.href=e.href;if(e===a.on)link.setAttribute('aria-current','page');
          link.innerHTML='<i aria-hidden="true"></i><span></span>'+ico(dockIcons.next);
          link.querySelector('i').textContent=i===0?'⌂':glyph(a.product,e.href);link.querySelector('span').textContent=i===0?'Start':(e.name||e.label);
          link.addEventListener('click',event=>{
            if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
            const intent=new CustomEvent('vu-dock-navigate',{cancelable:true,detail:{product:a.product.id,id:e.id,href:link.getAttribute('href')}});
            if(!document.dispatchEvent(intent))event.preventDefault();
            /* Produkte mit pushState (Screener) melden keinen hashchange: den Bereich oben links danach nachziehen. */
            setTimeout(syncArea,0);setTimeout(syncArea,400);
          });
          list.append(link);
        });
        const g=groups.find(x=>x.id===a.product.id);
        root.querySelector('.areas-sub').textContent=(g&&g.claim?g.claim+' – ':'')+'alle Bereiche.';
        this.areasTitle=a.product.label;this.setAttribute('areas','');
        this.openMenu(from);
      };
      world.onclick=()=>{hideHint();this.openAreas(world);};
      root.querySelector('.grid').onclick=event=>this.openMenu(event.currentTarget);
      root.querySelector('.all-mods').onclick=()=>{this.removeAttribute('areas');root.querySelector('.uni-title').textContent='Dein Universe';syncActive();root.querySelector('.close').focus();};
      /* Einmaliger Hinweis am Knopf oben links (erster Besuch mit Dock). */
      let hint=null;
      const hideHint=()=>{if(hint){hint.remove();hint=null;}try{localStorage.setItem('vu-nav-kopf-hinweis','1');}catch(_){}};
      const showHint=()=>{
        let seen=true;try{seen=localStorage.getItem('vu-nav-kopf-hinweis')==='1';}catch(_){}
        if(seen||hint||world.hidden||!this.hasAttribute('dock'))return;
        hint=document.createElement('p');hint.className='hint';hint.setAttribute('role','status');
        hint.innerHTML='<span>Hier findest du alle Bereiche.</span><button type="button" aria-label="Hinweis schließen">×</button>';
        hint.querySelector('button').onclick=hideHint;root.querySelector('header').append(hint);
        setTimeout(()=>{if(hint)hideHint();},9000);
      };
      this.showHint=showHint;
      window.addEventListener('resize',fit);if(document.fonts&&document.fonts.ready)document.fonts.ready.then(fit).catch(()=>{});
      /* Kopf deckend oder durchsichtig (Prototyp hdr()): deckend, sobald 24 px gescrollt sind oder die Seite kein
         <html data-vu-bleed> traegt. Die Reiterzeile folgt <html data-vu-tabs="inhalt"> (VUNavigation.rahmen). */
      const solid=()=>this.toggleAttribute('solid',!document.documentElement.hasAttribute('data-vu-bleed')||(window.scrollY||0)>24);
      solid();window.addEventListener('scroll',solid,{passive:true});
      if(typeof MutationObserver==='function')new MutationObserver(()=>{solid();this.syncTabs();}).observe(document.documentElement,{attributes:true,attributeFilter:['data-vu-bleed','data-vu-tabs']});
      let menuLocation=null;
      const syncActive=()=>{
        const state=menuState(location),group=groups.find(g=>g.id===state.group&&g.href);
        tiles.querySelectorAll('.tile').forEach(a=>{
          const on=a.dataset.group===state.group;a.classList.toggle('is-current',on);
          if(on&&!state.expanded)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
        });
        if(menuLocation!==location.href){
          menuLocation=location.href;hereLinks.replaceChildren();here.hidden=!group;
          if(group){
            root.querySelector('.here-title').textContent='In '+group.label;
            group.entries.forEach(([label,href])=>{const a=document.createElement('a');a.href=href;a.innerHTML=`<span></span>${ico(dockIcons.next)}`;a.firstChild.textContent=label;hereLinks.append(a);});
          }
        }
        root.querySelectorAll('.links a').forEach(a=>{if(a.getAttribute('href')===state.href)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
        root.querySelector('.more').open=state.group==='more';
      };
      syncActive();
      /* KI auf jeder Aktie (Konzept mein-bereich-2026-11, Screen a-sheet): Zeigt die Seite einen Aktienkopf (data-vu-stock),
         öffnet die Kachel „Vision Universe KI“ im Menü ein Sheet mit Fragen zur Aktie (assets/atlas-sheet.js, beim ersten Tipp
         geladen); sonst gilt der Link. Der KI-Knopf im Kopf fuehrt immer auf /ask/ (Fokus auf der Eingabe). */
      tiles.querySelector('.tile[data-group=atlas]').addEventListener('click',e=>{
        if(e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.button)return;
        if(!document.querySelector('[data-vu-stock]:not([href]):not([data-vu-href])'))return;
        e.preventDefault();
        const a=world.hidden?button:world,go=()=>{if(!(window.VUAtlasSheet&&window.VUAtlasSheet.open(document,a)))location.assign('/ask/');};
        if(window.VUAtlasSheet)return go();
        const sc=document.createElement('script');sc.src='/assets/atlas-sheet.js';sc.onload=go;sc.onerror=()=>location.assign('/ask/');document.head.appendChild(sc);
      });
      if(location.pathname.startsWith('/mein-dashboard/')||location.pathname.startsWith('/konto/'))root.querySelector('.profile').setAttribute('aria-current','page');
      const syncQuick=()=>root.querySelectorAll('.quick a').forEach(a=>{const h=a.getAttribute('href'),detail=isElliottDetail(location.pathname,location),on=h==='/elliott/'?(detail||location.pathname.startsWith(h)):h==='/quant/'?(!detail&&location.pathname.startsWith(h)):location.pathname.startsWith(h);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
      syncQuick();
      if(this.hasAttribute('theme-switch')&&this.getAttribute('theme')!==currentTheme())this.setAttribute('theme',currentTheme());
      const panel=root.querySelector('.panel'),button=root.querySelector('.toggle');panel.inert=true;
      /* Ein Menue fuer zwei Oeffner: den Knopf im Kopf (Seiten ohne Dock)
         und den Universe-Knopf im Dock („Alle Module“). Der Fokus kehrt zum Oeffner zurueck. */
      let opener=null;
      const setExpanded=open=>{[button,this.dockMenuButton,opener].forEach(b=>{if(!b)return;b.setAttribute('aria-expanded',String(open));if(b!==this.dockMenuButton&&b!==world&&!b.classList.contains('grid'))b.setAttribute('aria-label',open?'Menü schließen':(b===button?'Menü öffnen':'Vision Universe Menü öffnen'));});};
      const close=()=>{if(!this.hasAttribute('open'))return;this.removeAttribute('open');setTimeout(()=>{if(!this.hasAttribute('open')){this.removeAttribute('areas');root.querySelector('.uni-title').textContent='Dein Universe';}},340);panel.inert=true;panel.setAttribute('aria-hidden','true');setExpanded(false);document.documentElement.classList.remove('vu-menu-open');if(this.dockHost)this.dockHost.inert=false;};
      const restore=()=>{const target=opener&&opener.isConnected&&opener.getClientRects().length?opener:(world.hidden?button:world);if(target&&target.focus)target.focus();};
      this.openMenu=from=>{if(this.hasAttribute('open')){close();restore();return;}opener=from||button;syncActive();root.querySelector('.uni-title').textContent=this.hasAttribute('areas')?this.areasTitle:'Dein Universe';root.querySelectorAll('.menu-product-icon use[data-href]').forEach(icon=>{icon.setAttribute('href',icon.getAttribute('data-href'));icon.removeAttribute('data-href');});this.setAttribute('open','');panel.inert=false;panel.removeAttribute('aria-hidden');setExpanded(true);document.documentElement.classList.add('vu-menu-open');if(this.dockHost)this.dockHost.inert=true;const focusClose=()=>{if(!this.hasAttribute('open'))return;if(getComputedStyle(panel).visibility!=='visible'){requestAnimationFrame(focusClose);return;}root.querySelector('.close').focus();};requestAnimationFrame(focusClose);};
      button.onclick=()=>this.openMenu(button);
      root.querySelector('.close').onclick=()=>{close();restore();};root.querySelector('.backdrop').onclick=()=>{close();restore();};
      // Sheet: am Griff nach unten ziehen schliesst (wie Hintergrund und Escape).
      let grabY=null;root.querySelector('.grab').addEventListener('pointerdown',event=>{grabY=event.clientY;});
      window.addEventListener('pointerup',event=>{if(grabY!==null&&event.clientY-grabY>30&&this.hasAttribute('open')){close();restore();}grabY=null;});window.addEventListener('pointercancel',()=>{grabY=null;});
      panel.addEventListener('click',event=>{if(event.target.closest('a'))close();});
      root.addEventListener('keydown',event=>{
        if(!this.hasAttribute('open'))return;
        if(event.key==='Escape'){close();restore();return;}
        if(event.key==='Tab'){
          const nodes=[...panel.querySelectorAll('a,button:not(:disabled),input,summary')].filter(n=>n.getClientRects().length&&!n.closest('[hidden]')),first=nodes[0],last=nodes[nodes.length-1];
          if(event.shiftKey&&root.activeElement===first){event.preventDefault();last.focus();}
          else if(!event.shiftKey&&root.activeElement===last){event.preventDefault();first.focus();}
        }
      });
      // Escape auch dann, wenn der Fokus (noch) ausserhalb des Menues liegt
      document.addEventListener('keydown',event=>{if(event.key==='Escape'&&this.hasAttribute('open')){close();restore();}});
      window.addEventListener('hashchange',()=>{close();syncWorld();syncActive();syncQuick();});window.addEventListener('popstate',()=>{close();syncWorld();syncActive();syncQuick();});
      /* Reiterzeile vom ersten Zeichnen an, wo das Produkt die Leiste ohnehin anfordert (late: siehe PRODUCTS). */
      const early=PRODUCTS.find(p=>p.match(location.pathname,location));
      if(early&&!(early.late&&early.late(location.pathname)))this.mountTabs();
      /* Konto-Unterseiten (self): der Rahmen fordert das Dock selbst an. */
      if(early&&early.self&&early.self(location.pathname))dockBus.requested=true;
      if(dockBus.requested)this.mountDock();
      setTimeout(()=>{if(this.showHint)this.showHint();},1200);
      this.renderSettings();
      document.addEventListener('vu-currency-change',()=>this.renderSettings());
      document.addEventListener('vu-fx-ready',()=>this.renderSettings());
      document.addEventListener('vu-theme-change',()=>this.renderSettings());
    }
    /* Reiterzeile unter dem Kopf: die Bereiche des Produkts (tabEntries). Aktiver Reiter (tabActive), Ziele (hrefs),
       Trefferzahl (badges) und das abbrechbare Ereignis vu-dock-navigate {product,id,href} gelten wie bei den frueheren
       Leistenplaetzen. Der Inhalt rueckt um die Zeile nach unten: html[data-vu-tabs] in site-navigation.css. */
    /* <html data-vu-tabs="inhalt">: die Seite zeigt ihre Reiter selbst, die Zeile des Rahmens bleibt weg. Sonst traegt
       das Attribut die Kennung des Produkts (Platz unter dem Kopf: site-navigation.css). */
    syncTabs(){
      const nav=this.shadowRoot&&this.shadowRoot.querySelector('.tabs'),html=document.documentElement;
      if(!nav||!this.tabsFor)return;
      const own=html.getAttribute('data-vu-tabs')==='inhalt';
      /* Owner 22.11.2026: keine Reiterzeile mehr; die Bereiche stehen im Knopf oben links (Menü im Kopf). */
      nav.hidden=true;
      if(!own&&html.getAttribute('data-vu-tabs')!==this.tabsFor)html.setAttribute('data-vu-tabs',this.tabsFor);
    }
    mountTabs(){
      const product=PRODUCTS.find(p=>p.match(location.pathname,location)),nav=this.shadowRoot&&this.shadowRoot.querySelector('.tabs');
      if(!product||!nav||this.tabsFor===product.id||this.hasAttribute('no-dock')||this.hasAttribute('menu-only'))return;
      if(this.dropTabs)this.dropTabs();
      this.tabsFor=product.id;
      nav.setAttribute('aria-label',product.label);this.syncTabs();
      const entries=tabEntries(product);
      const links=entries.map(entry=>{
        const a=document.createElement('a');a.className='tab';a.href=entry.href;if(entry.id)a.dataset.id=entry.id;if(entry.name)a.setAttribute('aria-label',entry.name);
        a.innerHTML='<span class="pill"><span class="label"></span></span>';a.querySelector('.label').textContent=entry.label;
        a.addEventListener('click',event=>{
          if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
          const intent=new CustomEvent('vu-dock-navigate',{cancelable:true,detail:{product:product.id,id:entry.id,href:a.getAttribute('href')}});
          if(!document.dispatchEvent(intent))event.preventDefault();
        });
        nav.append(a);return a;
      });
      // Ein vom Produkt gemeldeter Bereich gilt nur fuer die URL, zu der er gemeldet wurde.
      let shown=null;
      const paint=()=>{
        const state=dockBus.state,on=tabActive(product,entries,location,state);
        links.forEach((a,i)=>{
          const id=entries[i].id,pill=a.firstChild;
          if(id&&state.hrefs&&state.hrefs[id])a.setAttribute('href',state.hrefs[id]);
          if(entries[i]===on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
          let badge=pill.querySelector('.badge');const value=id&&state.badges?state.badges[id]:null;
          if(value===undefined||value===null||value===''){if(badge)badge.remove();}
          else{if(!badge){badge=document.createElement('span');badge.className='badge';pill.append(badge);}badge.textContent=value>999?'999+':String(value);badge.setAttribute('aria-label',value+' Treffer');}
        });
        // Der aktive Reiter bleibt sichtbar, auch wenn er rechts ausserhalb der Zeile liegt.
        const current=on?links[entries.indexOf(on)]:null;
        /* Aktiven Reiter in die Zeile holen. Ein einzelner Versuch reicht nicht: Solange die Zeile noch keine Breite hat oder die Schrift nachlaedt, verschiebt sich der Reiter danach wieder aus dem Bild. */
        if(current&&current!==shown){const show=()=>{if(!current.isConnected||shown!==current||!nav.clientWidth)return;const left=current.offsetLeft,right=left+current.offsetWidth;if(left<nav.scrollLeft+16||right>nav.scrollLeft+nav.clientWidth-16)nav.scrollLeft=Math.max(0,left-(nav.clientWidth-current.offsetWidth)/2);};requestAnimationFrame(show);setTimeout(show,300);if(document.fonts&&document.fonts.ready)document.fonts.ready.then(show).catch(()=>{});}
        shown=current;
      };
      /* Eine SPA kann das Produkt unter demselben Pfad wechseln (Quant -> Elliott-Detail): dann Reiterzeile neu aufbauen. */
      const route=()=>{
        const next=PRODUCTS.find(p=>p.match(location.pathname,location));
        if(!next||next.id===product.id){paint();return;}
        if(this.hasAttribute('dock')){this.setAttribute('dock',next.id);document.documentElement.setAttribute('data-vu-dock',next.id);}
        this.mountTabs();
      };
      dockBus.listeners.push(paint);
      window.addEventListener('hashchange',route);window.addEventListener('popstate',route);
      this.dropTabs=()=>{
        window.removeEventListener('hashchange',route);window.removeEventListener('popstate',route);
        const at=dockBus.listeners.indexOf(paint);if(at>=0)dockBus.listeners.splice(at,1);
        nav.replaceChildren();this.tabsFor=null;this.dropTabs=null;
      };
      paint();
    }
    /* Das Dock: ein eigener Knoten am Ende von <body> mit
       eigenem Shadow Root, damit es unabhaengig vom Kopf (z-index des
       Kopfes) unter Produkt-Overlays liegen kann. Auf jeder Seite dasselbe:
       Home · Discover · [Universe] · News · Ich; aktiv ist der Platz, in dessen Bereich die Seite liegt (dockActive). */
    mountDock(){
      const product=PRODUCTS.find(p=>p.match(location.pathname,location)),id=product?product.id:dockPage(location)?'page':null;
      if(!id||this.hasAttribute('no-dock')||document.getElementById('vu-dock'))return;
      this.setAttribute('dock',id);
      document.documentElement.setAttribute('data-vu-dock',id);
      this.mountTabs();
      const host=document.createElement('div');host.id='vu-dock';host.className='vu-dock';this.dockHost=host;
      const root=host.attachShadow({mode:'open'});
      root.innerHTML=`<style>${dockStyles(THEMES[this.getAttribute('theme')==='dark'?'dark':'light'])}</style><nav aria-label="Hauptnavigation"></nav>`;
      const nav=root.querySelector('nav');
      const place=([id,label,href,icon])=>{
        const a=document.createElement('a');a.href=href;a.dataset.id=id;
        a.innerHTML=`${dockProductIcon(icon)}<span class="label">${label}</span>`;
        nav.append(a);return a;
      };
      const links=DOCK.slice(0,2).map(place);
      const menu=document.createElement('button');menu.type='button';menu.className='menu uni';
      menu.setAttribute('aria-haspopup','true');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Alle Module');
      menu.innerHTML=dockProductIcon('layers');
      menu.onclick=()=>this.openMenu(menu);nav.append(menu);this.dockMenuButton=menu;
      links.push(...DOCK.slice(2).map(place));
      const paint=()=>{const current=dockActive(location);links.forEach(a=>{if(a.dataset.id===current)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});};
      window.addEventListener('popstate',paint);
      paint();
      const attach=()=>document.body.append(host);
      if(document.body)attach();else document.addEventListener('DOMContentLoaded',attach);
    }
    renderSettings(){
      const root=this.shadowRoot;if(!root)return;
      const focused=root.activeElement,focusGroup=focused&&focused.parentElement&&focused.parentElement.className,focusLabel=focused&&focused.textContent;
      const currency=root.querySelector('.currency'),appearance=root.querySelector('.appearance');currency.replaceChildren();appearance.replaceChildren();
      const layer=window.VUFx&&window.VUFx.layer,preference=layer&&layer.preference;
      for(const code of ['EUR','USD']){
        if(!preference){const a=document.createElement('a');a.href='/discover/#/settings';a.textContent=code;currency.append(a);continue;}
        const b=document.createElement('button');b.type='button';b.textContent=code;b.setAttribute('aria-pressed',String(preference.get()===code));
        b.onclick=async()=>{if(preference.get()===code)return;b.disabled=true;try{if(code!=='EUR'&&window.VUFx.Bootstrap)await window.VUFx.Bootstrap.ensureCurrency(code);layer.setDisplayCurrency(code);}catch(_){b.disabled=false;}this.renderSettings();};currency.append(b);
      }
      const theme=(window.VUDiscover&&window.VUDiscover.theme)||(this.hasAttribute('theme-switch')?window.VUTheme:null);
      for(const [mode,label] of [['light','Hell'],['dark','Dunkel']]){
        if(!theme){const a=document.createElement('a');a.href='/discover/#/settings';a.textContent=label;appearance.append(a);continue;}
        const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-pressed',String(theme.mode()===mode));b.onclick=()=>{theme.set(mode);this.renderSettings();};appearance.append(b);
      }
      if(focusGroup&&focusLabel){const group=focusGroup.includes('currency')?currency:focusGroup.includes('appearance')?appearance:null;const target=group&&[...group.querySelectorAll('button,a')].find(n=>n.textContent===focusLabel);if(target)target.focus();}
    }
  }
  customElements.define('vu-navigation', VisionNavigation);

  /* Seiten mit eigenem Kopf verwenden dasselbe Menü (Impressum in zwei Schritten, § 5 DDG). */
  if (typeof document !== 'undefined') document.addEventListener('click', event => {
    const opener = event.target.closest && event.target.closest('[data-vu-menu-toggle]');
    const nav = opener && document.querySelector('vu-navigation[menu-only]');
    if (nav && nav.openMenu) nav.openMenu(opener);
  });

  /* Aktien-Vorschau (Prototyp: Fenster „stock“): Ein Tipp auf ein Ziel mit data-vu-stock="<TICKER>" - ein Link (href) oder
     eine Karte (data-vu-href) - laedt einmalig /assets/vu-stock-sheet.js und ruft
     VUStockSheet.open(ticker, {name: data-vu-stock-name, trigger: element}). Strg/Cmd/Umschalt/Mittelklick oeffnen wie
     gewohnt das Ziel. Fehlt die Datei, schlaegt das Laden fehl oder meldet open() false, folgt der Tipp dem Ziel; danach
     gilt fuer diese Seite wieder der normale Link. Der Aktienkopf traegt data-vu-stock ohne Ziel und oeffnet nichts.
     Eigene Bedienelemente im Ziel (Knoepfe, Felder, data-vu-card-ignore) behalten ihre Funktion.
     stockSheet(env) ist ohne Seite pruefbar (Tests): env = {has(), load(), go(href)}. */
  const stockSheet = env => {
    let loading = null, failed = false;
    return e => {
      if (failed || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
      const el = e.target && e.target.closest && e.target.closest('[data-vu-stock]');
      if (!el) return false;
      const ticker = el.getAttribute('data-vu-stock'), href = el.getAttribute('href') || el.getAttribute('data-vu-href');
      if (!ticker || !href) return false;
      const own = e.target.closest('button,input,select,textarea,summary,label,[role=tab],[role=button],[data-vu-card-ignore]');
      if (own && own !== el && el.contains(own)) return false;
      e.preventDefault();
      const follow = () => { failed = true; env.go(href); };
      const open = () => { let ok = false; try { ok = env.has() && env.has().open(ticker, {name: el.getAttribute('data-vu-stock-name') || null, trigger: el}) !== false; } catch (_) { ok = false; } if (!ok) follow(); };
      if (env.has()) open(); else (loading || (loading = env.load())).then(open, follow);
      return true;
    };
  };
  if (typeof document !== 'undefined' && !window.__vuStockSheet) {
    window.__vuStockSheet = true;
    document.addEventListener('click', stockSheet({
      has: () => window.VUStockSheet && typeof window.VUStockSheet.open === 'function' ? window.VUStockSheet : null,
      load: () => new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = '/assets/vu-stock-sheet.js'; sc.onload = ok; sc.onerror = no; document.head.appendChild(sc); }),
      go: href => location.assign(href)
    }));
  }

  /* VU3: Die ganze Aktienkarte ist der Einstieg in die Aktie. Eine Karte traegt ihr Ziel in data-vu-href;
     ein Tippen oder Klick auf jede Flaeche, die kein eigenes Bedienelement ist (Logo, Name, Kennzahlen,
     Chart, freie Flaeche), oeffnet es. Eigene Bedienelemente in der Karte (Reiter Chart/Umsatz/Gewinn/
     Cashflow, Links, Knoepfe) behalten ihre Funktion. Tastatur: Der Name ist ein echter Link. Ein markierter
     Text oeffnet nichts; Strg/Cmd/Mittelklick oeffnen wie bei einem Link einen neuen Tab. */
  if (typeof document !== 'undefined' && !window.__vuCardLink) {
    window.__vuCardLink = true;
    const OWN = 'a[href],button,input,select,textarea,summary,label,[role=tab],[role=button],[role=link],[contenteditable],[data-vu-card-ignore]';
    const open = (e) => {
      if (e.defaultPrevented || (e.type === 'click' && e.button !== 0) || (e.type === 'auxclick' && e.button !== 1)) return;
      const card = e.target.closest && e.target.closest('[data-vu-href]');
      if (!card) return;
      const own = e.target.closest(OWN);
      if (own && card.contains(own)) return;
      const sel = window.getSelection && window.getSelection();
      if (sel && !sel.isCollapsed && card.contains(sel.anchorNode)) return;
      const href = card.getAttribute('data-vu-href');
      if (!href) return;
      if (e.type === 'auxclick' || e.metaKey || e.ctrlKey || e.shiftKey) { window.open(href, '_blank', 'noopener'); return; }
      const name = card.querySelector('a[data-vu-card-main]');
      if (name) name.click(); else location.assign(href);
    };
    document.addEventListener('click', open);
    document.addEventListener('auxclick', open);
  }
})();
