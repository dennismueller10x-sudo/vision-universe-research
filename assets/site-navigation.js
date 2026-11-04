// Central navigation for every page. Add new menu entries only here.
(() => {
  // Idempotent: im Gastbetrieb (/elliott/#/<T>) laedt das Quant-Buendel des Release die Shell ein zweites Mal mit.
  if (customElements.get && customElements.get('vu-navigation')) return;
  // Product links navigate directly; their separate disclosure opens existing routes.
  const groups = [
    {id:'discover', label:'Discover', href:'/discover/#/', icon:'discover', claim:'Aktien entdecken', entries:[['Übersicht','/discover/#/','⌂'],['Welten','/discover/#/welten','◎'],['Strategien','/discover/#/strategien','◬'],['Entdecken','/discover/#/einzeln/US_REAL','◇'],['Suchen','/discover/#/suche','⌕'],['Märkte','/discover/#/maerkte','≋'],['Watchlist','/discover/#/watchlist','♡']]},
    {id:'quant', label:'Quant', href:'/quant/', icon:'quant', claim:'Faktoren je Aktie', entries:[['Übersicht','/quant/','⌂'],['Quant Screener','/quant/#/screener','⧩'],['Strategien','/quant/#/strategien','◬'],['Aktien','/quant/#/aktien','⌁'],['Methodik','/quant/#/methodik','▤'],['Technische Lagen','/quant/#/chartlagen','⌁'],['Fundamentaldaten','/quant/#/aktie/NVDA/zahlen','▧']]},
    {id:'technical', label:'Technical', href:'/technical/#/', icon:'technical', claim:'Charts und Muster', entries:[['Übersicht','/technical/#/','⌂'],['Screener','/technical/#/screener','⧩'],['Chart Studio','/technical/#/chart','⌁'],['Gespeichert','/technical/#/screener/gespeichert','▤'],['Methodik','/technical/#/methodik','▤']]},
    {id:'fundamental', label:'Fundamental', href:'/fundamental/#/', icon:'fundamental', claim:'Zahlen aus SEC-Berichten', entries:[['Übersicht','/fundamental/#/','⌂'],['Entdecken','/fundamental/#/entdecken','◇'],['Suchen','/fundamental/#/suche','⌕'],['Methodik','/fundamental/#/methodik','▤']]},
    {id:'supertrader', label:'Supertrader', href:'/supertrader/', icon:'supertrader', claim:'Methoden der Profis', entries:[['Übersicht','/supertrader/','⌂'],['Methoden','/supertrader/strategies/','⚑'],['Signale','/supertrader/signals/','◬'],['Backtests','/supertrader/backtests/','▧'],['Quellen','/supertrader/sources/','▤']]},
    {id:'hedgefonds', label:'Hedgefonds', href:'/hedgefonds/', icon:'hedgefonds', claim:'Was Investoren halten', entries:[['Übersicht','/hedgefonds/','⌂'],['Investoren','/hedgefonds/#/investoren','♙'],['Datenbank','/hedgefonds/#/datenbank','▧'],['Aktien','/hedgefonds/#/aktien','⌁'],['Smart Money','/hedgefonds/#/smart-money','◬']]},
    {id:'elliott', label:'Elliott', href:'/elliott/', icon:'elliott', claim:'Wellenstruktur', entries:[['Übersicht','/elliott/','⌂'],['Welle 3','/elliott/#/?welle=3','◬'],['Aufwärts','/elliott/#/?richtung=auf','↗'],['Abwärts','/elliott/#/?richtung=ab','↘'],['Neu und verändert','/elliott/#/?neu=1','✧'],['Suchen','/elliott/#/?suche=1','⌕']]},
    {id:'screener', label:'Screener', href:'/screener/', icon:'screener', claim:'Eigene Filter', entries:[['Übersicht','/screener/','⌂'],['Filter hinzufügen','/screener/?view=build','⧩'],['Treffer','/screener/?view=results','⌕'],['Gespeichert','/screener/?view=saved','▤'],['Watchlist','/screener/?view=watchlist','♡']]},
    {id:'vorsorge', label:'Vorsorge', href:'/vorsorge/#/', icon:'vorsorge', claim:'Sparplan und Rente', entries:[['Vorsorge Home','/vorsorge/#/','☂'],['Planer','/vorsorge/#/plan','◬'],['ETFs','/vorsorge/#/etfs','◫'],['Portfolio','/vorsorge/#/portfolio','◎'],['Vergleichen','/vorsorge/#/vergleichen','⧩'],['Förderung','/vorsorge/#/foerderung','✧'],['Veränderungen','/vorsorge/#/monitor','≋'],['Wissen','/vorsorge/#/wissen','▤']]},
    {id:'more', label:'Weitere Produkte', href:null, icon:'layers', claim:'', entries:[['Dashboard','/dashboard/','▧'],['Macro','/macro/','≋'],['ETF','/etf/','◫'],['Analysten','/analysten/','◇'],['News','/news/','▤'],['Morning','/morning/','☼'],['Magazin','/magazin/','▣'],['Reports','/reports/xpeng/','▥'],['Academy','/academy/','✧'],['Guide','/guide/','◈'],['Budget','/budget/','▦']]}
  ];
  /* Mein Bereich im Menue (Mockup N3). */
  const MINE = [['Mein Dashboard','/mein-dashboard/','person'],['Watchlist','/konto/watchlist/','heart'],['Konto und Tarif','/konto/','gear']];
  /* Produkt-Dock: die schwebende Leiste am unteren Rand jedes Produkts.
     Regel fuer alle Produkte: [PRODUKT] [Funktion] [Funktion] [Funktion] [☰].
     Der erste Eintrag traegt immer den Produktnamen (nie "Home"/"Start"); die Spalten sind gleich breit, aber nie
     schmaler als ihre Beschriftung (minmax(min-content,1fr)), damit lange Namen wie "Fundamental" nicht abgeschnitten werden.
     und fuehrt zur Startseite des Produkts; ☰ oeffnet das GLOBALE Menue
     dieser Komponente. Ziele sind die bestehenden Routen der Produkte.
     active(loc) liefert die id des aktiven Eintrags oder null; dann zeigt
     der Produkteintrag nur, in welchem Produkt man ist. */
  const hashPart = (loc, i) => (loc.hash.replace(/^#\/?/, '').split('?')[0].split('/')[i] || '');
  /* Elliott ist ein eigenes Produkt. Seine Startseite liegt unter /elliott/; die Detailansicht einer Aktie (Chartbild) rendert die Quant-SPA
     unter #/elliott/<TICKER> und gehoert fuer die Shell trotzdem zu Elliott (nur noch ein Altlink: die SPA leitet auf /elliott/#/<T>
     um). Das native Aktienbild /elliott/#/<T> hat den Pfad /elliott/. match bekommt Pfad UND Adresse. */
  const isElliottDetail = (p, loc) => p === '/quant/' && !!loc && /^#\/elliott(\/|$|\?)/.test(loc.hash || '');
  const PRODUCTS = [
    {id: 'discover', label: 'Discover', match: p => p.startsWith('/discover/'),
      items: [['discover','Discover','/discover/#/','discover'],['welten','Welten','/discover/#/welten','worlds'],['strategien','Strategien','/discover/#/strategien','strategies'],['entdecken','Swipen','/discover/#/einzeln/US_REAL','explore']],
      active: loc => {
        const k = hashPart(loc, 0);
        if (!k) return 'discover';
        if (k === 'c') { const themes = globalThis.VUDiscover?.Views?.Themes; return themes && themes.byRow(hashPart(loc, 2)) ? 'welten' : 'strategien'; }
        return {welten: 'welten', thema: 'welten', strategien: 'strategien', einzeln: 'entdecken'}[k] || null;
      }},
    {id: 'elliott', label: 'Elliott', match: (p, loc) => p.startsWith('/elliott/') || isElliottDetail(p, loc),
      items: [['elliott','Elliott','/elliott/','elliott'],['welle3','Welle 3','/elliott/#/?welle=3','wave'],['neu','Neu','/elliott/#/?neu=1','spark'],['suche','Suche','/elliott/#/?suche=1','search']],
      active: loc => {
        if (loc.pathname !== '/elliott/') return null;
        if (hashPart(loc, 0)) return null;   // Aktienbild /elliott/#/<T>: nur Produktkontext
        const q = new URLSearchParams((loc.hash || '').split('?')[1] || '');
        if (q.get('suche') === '1') return 'suche';
        if (q.get('neu') === '1') return 'neu';
        if (q.get('welle') === '3') return 'welle3';
        return q.get('welle') || q.get('richtung') || q.get('status') || q.get('rolle') ? null : 'elliott';
      }},
    {id: 'quant', label: 'Quant', match: (p, loc) => p.startsWith('/quant/') && !isElliottDetail(p, loc),
      items: [['quant','Quant','/quant/#/','quant'],['screener','Screener','/quant/#/screener','screener','Quant Screener'],['strategien','Strategien','/quant/#/strategien','strategies'],['aktien','Aktien','/quant/#/aktien','stocks']],
      active: loc => {
        const legacy = {'/quant/screener/': 'screener', '/quant/strategies/': 'strategien', '/quant/strategies/builder/': 'strategien', '/quant/stock/': 'aktien', '/quant/technical/': 'aktien', '/quant/ranking/': 'aktien'}[loc.pathname];
        if (legacy) return legacy;
        if (loc.pathname !== '/quant/') return null;
        const k = hashPart(loc, 0);
        return {'': 'quant', radar: 'quant', screener: 'screener', strategien: 'strategien', aktien: 'aktien', aktie: 'aktien', vergleich: 'aktien'}[k] || null;
      }},
    /* Fundamental: eigenes Produkt. #/<TICKER> ist die Unternehmensseite (nur Produktkontext); Entdecken und Suche sind
       Ansichten der Startseite, die fundamental/app.js (VUFundamental.Model.parseRoute) liest. */
    {id: 'fundamental', label: 'Fundamental', match: p => p.startsWith('/fundamental/'),
      items: [['fundamental','Fundamental','/fundamental/#/','fundamental'],['entdecken','Entdecken','/fundamental/#/entdecken','explore'],['suche','Suche','/fundamental/#/suche','search'],['methodik','Methodik','/fundamental/#/methodik','table']],
      active: loc => loc.pathname === '/fundamental/' ? ({'': 'fundamental', entdecken: 'entdecken', suche: 'suche', methodik: 'methodik'}[hashPart(loc, 0)] || null) : null},
    /* Technical: eigenes Produkt. #/chart/<TICKER> ist das Chart Studio einer Aktie; ohne Kuerzel die Auswahl.
       Der Chart-Eintrag zeigt per dock({hrefs:{chart}}) auf die zuletzt geoeffnete Aktie (technical/app.js). */
    {id: 'technical', label: 'Technical', match: p => p.startsWith('/technical/'),
      items: [['technical','Technical','/technical/#/','technical'],['screener','Screener','/technical/#/screener','screener'],['chart','Chart','/technical/#/chart','signals','Chart Studio'],['methodik','Methodik','/technical/#/methodik','table']],
      active: loc => loc.pathname === '/technical/' ? ({'': 'technical', screener: 'screener', chart: 'chart', methodik: 'methodik'}[hashPart(loc, 0)] || null) : null},
    {id: 'vorsorge', label: 'Vorsorge', match: p => p.startsWith('/vorsorge/'),
      items: [['vorsorge','Vorsorge','/vorsorge/#/','vorsorge'],['plan','Planer','/vorsorge/#/plan','plan'],['etfs','ETFs','/vorsorge/#/etfs','etf'],['portfolio','Portfolio','/vorsorge/#/portfolio','portfolio']],
      active: loc => {
        if (loc.pathname.startsWith('/vorsorge/etf/')) return 'etfs';
        return {'': 'vorsorge', home: 'vorsorge', plan: 'plan', luecke: 'plan', etfs: 'etfs', etf: 'etfs', watchlist: 'etfs', europa: 'etfs', portfolio: 'portfolio', xray: 'portfolio', szenarien: 'portfolio'}[hashPart(loc, 0)] || null;
      }},
    {id: 'screener', label: 'Screener', match: p => p.startsWith('/screener/'),
      items: [['screener','Screener','/screener/','screener'],['filter','Filter','/screener/?view=build','plus'],['treffer','Treffer','/screener/?view=results','hits'],['gespeichert','Gespeichert','/screener/?view=saved','saved']],
      active: loc => {
        const q = new URLSearchParams(loc.search);
        const view = q.get('view') || (q.getAll('f').some(f => f.trim()) || q.get('mode') === 'pro' ? 'build' : 'start');
        return {start: 'screener', build: 'filter', results: 'treffer', compare: 'treffer', saved: 'gespeichert', changes: 'gespeichert', watchlist: 'gespeichert'}[view] || null;
      }},
    {id: 'supertrader', label: 'Supertrader', match: p => p.startsWith('/supertrader/'),
      items: [['supertrader','Supertrader','/supertrader/','supertrader'],['methoden','Methoden','/supertrader/strategies/','grid'],['signale','Signale','/supertrader/signals/','signals'],['backtests','Backtests','/supertrader/backtests/','backtests']],
      active: loc => {
        const k = loc.pathname.split('/')[2] || '';
        return {'': 'supertrader', strategies: 'methoden', signals: 'signale', stock: 'signale', backtests: 'backtests'}[k] || null;
      }},
    {id: 'hedgefonds', label: 'Hedgefonds', match: p => p.startsWith('/hedgefonds/'),
      items: [['hedgefonds','Hedgefonds','/hedgefonds/#/','hedgefonds'],['investoren','Investoren','/hedgefonds/#/investoren','users'],['aktien','Aktien','/hedgefonds/#/aktien','stocks'],['smart','Smart Money','/hedgefonds/#/smart-money','signals']],
      active: loc => ({'': 'hedgefonds', investoren: 'investoren', datenbank: 'investoren', aktien: 'aktien', aktie: 'aktien', 'smart-money': 'smart'}[hashPart(loc, 0)] || null)}
  ];
  // Original sprite geometry is inlined only for the always-visible dock: no extra request
  // on resource-budgeted workspaces. The provenance test keeps these six symbols exact.
  const DOCK_PRODUCT_ICONS = {
  "discover": "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"9.5\"/><circle class=\"dim\" opacity=\".45\" cx=\"12\" cy=\"12\" r=\"6\"/><circle class=\"dim\" opacity=\".45\" cx=\"12\" cy=\"12\" r=\"2.5\"/><path class=\"fill\" fill=\"currentColor\" stroke=\"none\" d=\"M12 12 18.7 5.3A9.5 9.5 0 0 1 21.5 12z\" opacity=\".28\"/><path d=\"M12 12 18.7 5.3\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"16.2\" cy=\"9.6\" r=\"1.3\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"7.6\" cy=\"15.4\" r=\"1\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"15.8\" cy=\"16.2\" r=\".9\"/></g>",
  "quant": "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"5.5\" y=\"5.5\" width=\"13\" height=\"13\" rx=\"2.2\"/><path class=\"dim\" opacity=\".45\" d=\"M9 2v3.5M12 2v3.5M15 2v3.5M9 18.5V22M12 18.5V22M15 18.5V22M2 9h3.5M2 12h3.5M2 15h3.5M18.5 9H22M18.5 12H22M18.5 15H22\"/><path d=\"M14.6 9H9.6l2.6 3-2.6 3h5\"/></g>",
  "screener": "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 5h18M6 10.5h12M9 16h6M12 16v5\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"3\" cy=\"5\" r=\"1.4\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"21\" cy=\"5\" r=\"1.4\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"6\" cy=\"10.5\" r=\"1.3\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"18\" cy=\"10.5\" r=\"1.3\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"9\" cy=\"16\" r=\"1.2\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"15\" cy=\"16\" r=\"1.2\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"12\" cy=\"21\" r=\"1.5\"/></g>",
  "vorsorge": "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 11.5a9 9 0 0 1 18 0z\"/><path d=\"M12 11.5v7a2.2 2.2 0 0 0 4.4 0\"/><path class=\"dim\" opacity=\".45\" d=\"M12 2.5V1M7.5 11.5c0-4 2-7 4.5-9M16.5 11.5c0-4-2-7-4.5-9\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"20\" cy=\"20\" r=\"1.3\"/><path class=\"dim\" opacity=\".45\" d=\"M18.5 16l1.5 4\"/></g>",
  "supertrader": "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"8\"/><path class=\"dim\" opacity=\".45\" d=\"M12 1.5v3.5M12 19v3.5M1.5 12H5M19 12h3.5\"/><rect x=\"10.3\" y=\"9\" width=\"3.4\" height=\"6\" rx=\".6\"/><path d=\"M12 6.8V9M12 15v2.2\"/></g>",
  "elliott": "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path class=\"dim\" opacity=\".45\" d=\"M2 21h20\" stroke-dasharray=\"1.5 2\"/><path d=\"M2 19 6 12l2.5 3L14 5l2.5 4L21 3\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"6\" cy=\"12\" r=\"1.3\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"8.5\" cy=\"15\" r=\"1.3\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"14\" cy=\"5\" r=\"1.3\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"16.5\" cy=\"9\" r=\"1.3\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"21\" cy=\"3\" r=\"1.5\"/></g>",
  "fundamental": "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M2 21h20\"/><path d=\"M4.5 21v-6M8.5 21V10M12.5 21v-5\"/><circle cx=\"16\" cy=\"9\" r=\"4.5\"/><path d=\"m19.3 12.3 2.7 2.7\"/><path class=\"dim\" opacity=\".45\" d=\"M14.2 9.6 15.5 8l1.2 1.2 1.6-2\"/></g>",
  "technical": "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M2.5 4.5 20.5 12.5M2.5 20.5l18-8\"/><path class=\"dim\" opacity=\".45\" d=\"M7 8v9M11.5 10v5.5M15.5 11.3v3\"/><rect x=\"6\" y=\"10\" width=\"2\" height=\"5\" rx=\".4\"/><rect x=\"10.5\" y=\"11\" width=\"2\" height=\"3.5\" rx=\".4\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"20.5\" cy=\"12.5\" r=\"1.7\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"2.5\" cy=\"4.5\" r=\"1.1\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"2.5\" cy=\"20.5\" r=\"1.1\"/></g>",
  "hedgefonds": "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"6\" r=\"2.4\"/><circle class=\"dim\" opacity=\".45\" cx=\"5\" cy=\"8\" r=\"1.8\"/><circle class=\"dim\" opacity=\".45\" cx=\"19\" cy=\"8\" r=\"1.8\"/><path d=\"M8 19v-5a4 4 0 0 1 8 0v5\"/><path class=\"dim\" opacity=\".45\" d=\"M2 19v-4a3 3 0 0 1 5-2.2M22 19v-4a3 3 0 0 0-5-2.2M3 22h18\"/><path d=\"M12 13v6\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"12\" cy=\"22\" r=\"1\"/></g>"
};
  const dockProductIcon = id => `<svg viewBox="0 0 24 24" aria-hidden="true">${DOCK_PRODUCT_ICONS[id]}</svg>`;
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
    }
    // Screener omits view=build on its default filtered/pro URLs (app.readURL/buildURL).
    const params = new URLSearchParams(loc.search), explicit = params.get('view');
    const screenerView = ['start','build','results','saved','changes','compare','watchlist'].includes(explicit) ? explicit : (params.getAll('f').some(f=>f.trim()) || params.get('mode') === 'pro' ? 'build' : 'start');
    if(product && product.id === 'screener') href = {start:'/screener/',build:'/screener/?view=build',results:'/screener/?view=results',compare:'/screener/?view=results',saved:'/screener/?view=saved',changes:'/screener/?view=saved',watchlist:'/screener/?view=watchlist'}[screenerView];
    const home = product && loc.pathname === new URL(product.items[0][2], 'https://x').pathname && !hashPart(loc, 0) && !(product.id === 'elliott' && (loc.hash || '').includes('?')) && (product.id === 'screener' ? screenerView === 'start' : !params.has('view'));
    return {group: group && group.id, href, expanded: group && !home ? group.id : null};
  };
  /* Linien-Icons der Leiste: 24er-Raster, Strich 1,8 (wie die Menue-Icons). */
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
    person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
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
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>'
  };
  /* Die Leiste ist auf hellen und dunklen Flaechen dieselbe: ein ruhiges,
     fast schwarzes Element mit dem Vision-Universe-Lime als aktiver Flaeche
     (Design-DNA der Startseite). Sie liegt ueber dem Inhalt (z-index 900),
     aber unter Produkt-Overlays (Suche, Sheets, Dialoge) und unter dem
     globalen Menue. Abstand fuer den Inhalt: --vu-dock-space
     (site-navigation.css), damit nichts Letztes dauerhaft verdeckt ist. */
  const dockStyles = `
        :host{position:fixed;left:0;right:0;bottom:0;z-index:900;display:flex;justify-content:center;padding:0 12px calc(12px + env(safe-area-inset-bottom));pointer-events:none;font:400 14px Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif}
        *{box-sizing:border-box}
        nav{pointer-events:auto;display:grid;grid-template-columns:minmax(min-content,1.35fr) repeat(4,minmax(min-content,1fr));gap:2px;width:100%;max-width:520px;min-height:68px;align-items:center;padding:6px;border-radius:26px;background:#000;color:#fff;box-shadow:0 0 0 1px #222,0 10px 30px -10px rgba(0,0,0,.5)}
        a,button{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;min-width:0;min-height:56px;padding:6px 3px;border:0;border-radius:20px;background:transparent;color:#9a9a9a;font-family:inherit;font-size:10.5px;font-weight:700;line-height:1.1;letter-spacing:0;text-decoration:none;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background-color .15s,color .15s,transform .1s}
        a:hover,button:hover{color:#fff;background:rgba(255,255,255,.08)}
        a:active,button:active{transform:scale(.96)}
        a:focus-visible,button:focus-visible{outline:2px solid #c8f531;outline-offset:2px}
        .label{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 2px}
        .product{color:#fff}.product .label{font-weight:800}
        .product.is-context{color:#c8f531}
        a[aria-current=page],a[aria-current=page]:hover{background:#c8f531;color:#000}
        svg{width:21px;height:21px;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
        .product svg{width:20px;height:20px}
        .badge{position:absolute;top:4px;left:calc(50% + 6px);min-width:17px;height:17px;padding:0 5px;border-radius:9px;background:#fff;color:#000;font-size:10px;font-weight:800;line-height:17px;text-align:center}
        a[aria-current=page] .badge{background:#000;color:#c8f531}
        button[aria-expanded=true]{color:#c8f531}
        @media(min-width:761px){
          :host{padding-bottom:calc(16px + env(safe-area-inset-bottom))}
          nav{display:flex;width:auto;max-width:100%;min-height:0;gap:2px;padding:5px;border-radius:999px}
          a,button{flex-direction:row;gap:8px;min-height:46px;padding:0 16px;border-radius:999px;font-size:13px}
          .label{overflow:visible}
          svg,.product svg{width:19px;height:19px}
          .badge{position:static;margin-left:-2px}
        }
        @media(max-width:350px){:host{padding-inline:6px}a,button{font-size:9.5px}}
        @media(prefers-reduced-motion:reduce){a,button{transition:none}a:active,button:active{transform:none}}
`;
  /* OPT-IN: Ein Produkt fordert die Leiste mit window.VUNavigation.dock({})
     an (spaetestens nach seinem ersten Rendern); Seiten ohne diesen Aufruf
     behalten ihren Kopf samt Menue-Knopf unveraendert. Produkte koennen
     zudem den Zustand der Leiste setzen (SPA mit Zustand in der
     URL, z. B. Screener-Filter): window.VUNavigation.dock({active, hrefs,
     badges}). Klicks auf die Leiste melden sich vorher als abbrechbares
     Ereignis vu-dock-navigate {product,id,href}; wer preventDefault ruft,
     navigiert selbst. */
  const dockBus = {state: {}, listeners: []};
  if (typeof window !== 'undefined') {
    window.VUNavigation = {
      /* Nur lesend: Plätze der Produkt-Leiste je Welt (Musterseite /status/bausteine/, Tests). */
      products: () => PRODUCTS.map(p => ({id: p.id, label: p.label, items: p.items.map(([id, label, href, icon]) => ({id, label, href, icon}))})),
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
    light: {bg: 'rgba(255,255,255,.96)', border: '#e9e9e9', ink: '#000', card: '#f4f4f4', mute: '#6e6e6e', atlasBg: '#000', atlasInk: '#fff', atlasIcon: '#c8f531', outline: '#4f6b00'},
    dark: {bg: 'rgba(0,0,0,.94)', border: '#262626', ink: '#fff', card: '#151515', mute: '#9b9b9b', atlasBg: '#c8f531', atlasInk: '#000', atlasIcon: '#000', outline: '#c8f531'}
  };

  /* Farbschema plattformweit: dieselbe Wahl (localStorage, Schluessel von
     Discover) gilt auf jeder Seite. Seiten mit Hell- und Dunkel-Styles
     tragen das Attribut theme-switch an <vu-navigation>; nur dort zeigt
     der Kopf den Schalter. Gibt es die Discover-Engine (VUDiscover.theme),
     schaltet sie; sonst setzt der Kopf <html data-theme> selbst und meldet
     den Wechsel mit dem Ereignis vu-theme-change. */
  const THEME_KEY = 'vu-discover-theme-v1';
  const BAR = {light: '#ffffff', dark: '#000000'};
  const currentTheme = () => document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const applyTheme = (mode, persist) => {
    const engine = window.VUDiscover && window.VUDiscover.theme;
    if (engine && persist) { engine.set(mode); return; }  // Discover/Screener melden den Wechsel selbst
    if (persist) { try { localStorage.setItem(THEME_KEY, mode); } catch (_) { /* nur fuer diese Sitzung */ } }
    const html = document.documentElement;
    html.setAttribute('data-theme', mode);
    html.setAttribute('data-theme-mode', mode);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', BAR[mode]);
    document.querySelectorAll('vu-navigation').forEach(n => n.setAttribute('theme', mode));
    document.dispatchEvent(new Event('vu-theme-change'));
  };
  /* VU3: Ohne eigene Wahl startete jede Welt mit ihrem eigenen Schema (Discover hell, Quant dunkel) und die
     Seite sprang beim Wechsel zwischen hell und dunkel. Jetzt haelt die erste besuchte Welt ihr Schema fest;
     jede weitere Welt liest es vor dem ersten Zeichnen (ihr Inline-Skript liest denselben Schluessel). */
  if (typeof window !== 'undefined' && document.querySelector('vu-navigation[theme-switch]')) {
    try { if (!localStorage.getItem(THEME_KEY)) localStorage.setItem(THEME_KEY, currentTheme()); } catch (_) { /* ohne Speicher: je Seite */ }
  }
  if (typeof window !== 'undefined') {
    window.VUTheme = {key: THEME_KEY, mode: currentTheme, set: m => applyTheme(m === 'dark' ? 'dark' : 'light', true),
      toggle: () => applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true)};
    // Wahl aus einem anderen Tab uebernehmen
    window.addEventListener('storage', e => {
      if (e.key !== THEME_KEY || !document.querySelector('vu-navigation[theme-switch]')) return;
      const mode = e.newValue === 'dark' ? 'dark' : 'light';
      if (mode !== currentTheme()) applyTheme(mode, false);
    });
  }

  /* Die Farbwerte des Kopfes als Funktion des Schemas: so kann Discover
     das Attribut theme spaeter umschalten (Hell/Dunkel/System, V4.1), und
     der Kopf zieht mit, ohne neu aufgebaut zu werden. */
  const styles = (t) => `
        :host{display:block;position:fixed;inset:0 0 auto;z-index:1000000;color:${t.ink};font:400 14px Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;text-align:left}
        *{box-sizing:border-box}
        header{background:${t.bg};-webkit-backdrop-filter:blur(18px) saturate(1.3);backdrop-filter:blur(18px) saturate(1.3);box-shadow:0 1px 0 ${t.border}}
        .shell{width:min(1240px,calc(100% - 48px));margin:auto}.row{height:64px;display:flex;align-items:center;gap:16px}
        .brand,.world{flex-shrink:0;display:flex;align-items:center;min-width:0;color:${t.ink};text-decoration:none}
        .brand img{display:block;width:clamp(150px,14vw,190px);max-width:40vw;height:auto}
        .world{gap:9px;font-size:17px;font-weight:900;letter-spacing:-.02em;min-height:44px}
        .world[hidden],.brand[hidden]{display:none}
        .hud{width:30px;height:30px;border-radius:9px;background:#0e1013;color:#c8f531;display:grid;place-items:center;flex:none}
        .hud svg{width:62%;height:62%}
        :host([theme="dark"]) .hud{box-shadow:0 0 0 1px #262a2f inset}
        .world-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .quick{display:flex;align-items:center;gap:22px;margin-left:auto}.quick a{color:${t.ink};font-size:13px;font-weight:700;text-decoration:none}
        .quick a[aria-current=page]{text-decoration:underline;text-underline-offset:8px}
        .quick a:hover{text-decoration:underline;text-underline-offset:5px}
        .tools{display:flex;align-items:center;gap:7px;margin-left:auto;flex-shrink:0}
        @media(min-width:1025px){:host(:not([dock])) .quick+.tools{margin-left:12px}}
        a:focus-visible,button:focus-visible,input:focus-visible{outline:2px solid ${t.outline};outline-offset:3px}
        button{font:inherit;cursor:pointer}
        .hb{width:44px;height:44px;flex:none;display:grid;place-items:center;border-radius:50%;border:0;padding:0;background:transparent;color:${t.ink};text-decoration:none}
        .hb i{width:36px;height:36px;border-radius:50%;background:${t.card};display:grid;place-items:center}
        .hb svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
        .profile i{background:${t.ink};color:#c8f531}
        .hb:hover i{filter:brightness(.95)}
        .atlas{flex-shrink:0;display:inline-flex;align-items:center;gap:5px;height:44px;padding:0 4px;border-radius:999px;color:${t.atlasInk};font-size:13px;font-weight:800;text-decoration:none;white-space:nowrap}
        .atlas span.pill{display:inline-flex;align-items:center;gap:5px;height:36px;padding:0 12px;border-radius:999px;background:${t.atlasBg}}
        .atlas svg{width:16px;height:16px;fill:${t.atlasIcon}}
        .atlas:hover span.pill{filter:brightness(1.15)}
        .atlas[aria-current=page] span.pill{box-shadow:0 0 0 2px #c8f531}
        .toggle{flex-shrink:0;border:1px solid ${t.border};background:transparent;color:${t.ink};min-height:44px;padding:0 16px;border-radius:999px;font-weight:800}
        .backdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);visibility:hidden;opacity:0;transition:opacity .2s}
        .panel{position:fixed;right:0;top:0;bottom:0;width:min(440px,100vw);padding:calc(14px + env(safe-area-inset-top)) 18px calc(28px + env(safe-area-inset-bottom));overflow-y:auto;overscroll-behavior:contain;background:#000;color:#fff;box-shadow:-1px 0 0 #222;visibility:hidden;transform:translateX(24px);opacity:0;transition:transform .2s,opacity .2s,visibility .2s}
        :host([open]) .backdrop,:host([open]) .panel{visibility:visible;opacity:1;transform:none}
        .panel-head{display:flex;align-items:center;justify-content:space-between;min-height:48px}
        .panel-head a{display:flex;align-items:center;min-height:44px}.panel-head img{display:block;width:150px;height:auto;filter:invert(1)}
        .close{width:44px;height:44px;border:0;border-radius:50%;background:transparent;color:#fff;display:grid;place-items:center;padding:0}
        .close i{width:36px;height:36px;border-radius:50%;background:#1a1a1a;display:grid;place-items:center}
        .close svg,.find svg,.mine svg,.here svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
        .find{display:flex;align-items:center;gap:10px;height:52px;margin-top:12px;padding:0 4px 0 16px;border-radius:999px;background:#151515;color:#9b9b9b}
        .find input{flex:1;min-width:0;height:44px;border:0;background:transparent;color:#fff;font:600 15px/1 inherit;font-family:inherit;outline-offset:0}
        .find input::placeholder{color:#9b9b9b}
        .find button{width:44px;height:44px;border:0;border-radius:50%;background:#c8f531;color:#000;display:grid;place-items:center;padding:0;flex:none}
        .find button svg{fill:currentColor;stroke:none}
        .panel h2{margin:22px 0 10px;font-size:10.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#8a8a8a}
        .tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
        .tile{display:grid;gap:8px;align-content:start;min-height:96px;padding:12px 10px;border-radius:18px;background:#141414;color:#fff;text-decoration:none}
        .tile:hover{background:#1d1d1d}
        .tile .menu-product-icon{width:38px;height:38px;border-radius:11px;background:#0e1013;color:#c8f531;display:grid;place-items:center;box-shadow:0 0 0 1px #262a2f inset}
        .tile .menu-product-icon svg{width:62%;height:62%}
        .tile b{display:block;font-size:13.5px;font-weight:800;line-height:1.2}
        .tile small{display:block;margin-top:2px;font-size:10.5px;line-height:1.3;opacity:.7}
        .tile[aria-current=page],.tile.is-current{background:#c8f531;color:#000}
        .links{display:grid;gap:2px}
        .links a,.mine a,.more summary{display:flex;align-items:center;gap:12px;min-height:48px;padding:0 4px;border-bottom:1px solid #222;color:#fff;font-size:15px;font-weight:700;text-decoration:none}
        .links a[aria-current=page]{color:#c8f531}
        .links a span,.mine a b{flex:1}
        .mine a i,.links a i{color:#c8f531;display:grid;place-items:center;font-style:normal;width:20px}
        .more{margin-top:8px}.more summary{list-style:none;cursor:pointer}.more summary::-webkit-details-marker{display:none}
        .more summary:after{content:"";width:8px;height:8px;margin-right:6px;border-right:2px solid #9b9b9b;border-bottom:2px solid #9b9b9b;transform:rotate(45deg) translateY(-3px)}
        .more[open] summary:after{transform:rotate(225deg)}
        .more summary span{flex:1}
        .settings{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}
        .choices{display:flex;gap:6px}
        .choices button,.choices a{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;padding:0 16px;border:0;border-radius:999px;background:#151515;color:#fff;font:700 14px/1 inherit;font-family:inherit;text-decoration:none}
        .choices [aria-pressed=true]{background:#c8f531;color:#000}
        .panel a:focus-visible,.panel button:focus-visible,.panel input:focus-visible,.panel summary:focus-visible{outline:2px solid #c8f531;outline-offset:2px}
        @media(max-width:1024px){.quick{display:none}}
        @media(max-width:760px){.shell{width:calc(100% - 32px)}.row{height:56px;gap:8px}.brand img{width:min(150px,40vw)}.tools{gap:2px}.hb{width:40px}.atlas{padding:0 2px}
          .panel{width:100vw;box-shadow:none;transform:none}}
        @media(max-width:520px){.toggle{width:44px;padding:0;display:grid;place-items:center;font-size:17px}.menu-label{display:none}}
        @media(max-width:430px){:host(:not([dock])) .atlas .atlas-label{display:none}:host(:not([dock])) .atlas span.pill{width:36px;padding:0;justify-content:center}:host(:not([dock])) .brand img{width:min(132px,34vw)}}
        @media(max-width:360px){.shell{width:calc(100% - 20px)}.world{font-size:15px}.atlas .atlas-label{display:none}.atlas span.pill{width:36px;padding:0;justify-content:center}.panel{padding-inline:14px}.tile{padding:10px 8px}}
        :host([theme="dark"]) header .brand img{filter:invert(1) brightness(1.08)}
        :host([dock]) .quick,:host([dock]) .toggle{display:none}
        @media(prefers-reduced-motion:reduce){.backdrop,.panel{transition:none}}
`;

  class VisionNavigation extends HTMLElement {
    static get observedAttributes() { return ['theme']; }
    attributeChangedCallback(name) {
      if (name !== 'theme' || !this.shadowRoot) return;
      const style = this.shadowRoot.querySelector('style');
      if (style) style.textContent = styles(THEMES[this.getAttribute('theme') === 'dark' ? 'dark' : 'light']);
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
      /* Kopfzeile (C01): links die Welt (HUD-Icon + Name) oder das Logo, rechts Suche, Atlas, Mein Bereich.
         Das Farbschema wechselt im Menue (Hell/Dunkel), nicht mehr im Kopf. */
      root.innerHTML = `<style>${styles(t)}</style><header><div class="shell"><div class="row"><a class="brand" href="/" aria-label="Vision Universe Startseite"><img src="/assets/vision-universe-logo-web.png" alt="Vision Universe" width="190" height="63"></a><a class="world" hidden><span class="hud"></span><span class="world-name"></span></a><nav class="quick" aria-label="Direktzugriff"><a href="/discover/">Discover</a><a href="/quant/">Quant</a><a href="/technical/">Technical</a><a href="/elliott/">Elliott</a><a href="/screener/">Screener</a><a class="q-extra" href="/vorsorge/">Vorsorge</a></nav><div class="tools"><a class="hb search" href="/discover/#/suche" aria-label="Aktie suchen"><i>${ico(dockIcons.search)}</i></a><a class="atlas" href="/ask/" aria-label="AI Atlas – KI-Suche"><span class="pill">${SPARK}<span class="atlas-label">Atlas</span></span></a><a class="hb profile" href="/mein-dashboard/" aria-label="Mein Bereich"><i>${ico(dockIcons.person)}</i></a><button class="toggle" type="button" aria-label="Menü öffnen" aria-controls="site-panel" aria-expanded="false">☰<span class="menu-label"> Menü</span></button></div></div></div></header><div class="backdrop"></div><nav class="panel" id="site-panel" aria-label="Vision Universe Menü" aria-hidden="true"><div class="panel-head"><a href="/" aria-label="Vision Universe Startseite"><img src="/assets/vision-universe-logo-web.png" alt="Vision Universe" width="150" height="50"></a><button class="close" type="button" aria-label="Menü schließen"><i>${ico(dockIcons.close)}</i></button></div><form class="find" role="search">${ico(dockIcons.search)}<input type="search" name="q" placeholder="Aktie, Produkt oder Frage …" aria-label="Aktie, Produkt oder Frage" autocomplete="off" enterkeyhint="search"><button type="submit" aria-label="Im AI Atlas fragen">${SPARK}</button></form><h2>Produkte</h2><div class="tiles"></div><section class="here" hidden><h2 class="here-title"></h2><div class="links here-links"></div></section><h2>Mein Bereich</h2><div class="mine">${MINE.map(([label,href,icon])=>`<a href="${href}"><i>${ico(dockIcons[icon])}</i><b>${label}</b>${ico(dockIcons.next)}</a>`).join('')}</div><details class="more"><summary><span>Weitere Produkte</span></summary><div class="links more-links"></div></details><div class="settings" role="group" aria-label="Einstellungen"><div class="choices appearance" role="group" aria-label="Darstellung"></div><div class="choices currency" role="group" aria-label="Anzeigewährung"></div></div></nav>`;
      /* Menue (C03): 3 x 3 Produkte, darunter die Unterseiten der aktuellen Welt, Mein Bereich, Weitere Produkte, Darstellung. */
      const tiles=root.querySelector('.tiles'),here=root.querySelector('.here'),hereLinks=root.querySelector('.here-links');
      groups.filter(g=>g.href).forEach(({id,label,href,icon,claim})=>{
        const a=document.createElement('a');a.className='tile';a.href=href;a.dataset.group=id;
        a.innerHTML=`<span class="menu-product-icon" aria-hidden="true">${productIcon(icon)}</span><span><b>${label}</b><small>${claim}</small></span>`;
        tiles.append(a);
      });
      const more=groups.find(g=>g.id==='more');
      more.entries.forEach(([label,href])=>{const a=document.createElement('a');a.href=href;a.innerHTML=`<span></span>`;a.firstChild.textContent=label;root.querySelector('.more-links').append(a);});
      root.querySelector('.find').addEventListener('submit',event=>{
        event.preventDefault();
        const q=root.querySelector('.find input').value.trim();
        const product=q&&groups.find(g=>g.href&&g.label.toLowerCase()===q.toLowerCase());
        location.assign(product?product.href:'/ask/'+(q?'?q='+encodeURIComponent(q):''));
      });
      const world=root.querySelector('.world'),brand=root.querySelector('.brand');
      const syncWorld=()=>{
        const product=PRODUCTS.find(p=>p.match(location.pathname,location)),group=product&&groups.find(g=>g.id===product.id);
        world.hidden=!product;brand.hidden=!!product;
        if(!product)return;
        world.href=product.items[0][2];world.setAttribute('aria-label',product.label+' Startseite');
        world.querySelector('.hud').innerHTML=dockProductIcon((group||{icon:product.id}).icon);
        world.querySelector('.world-name').textContent=product.label;
      };
      syncWorld();
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
      if(location.pathname.startsWith('/ask/'))root.querySelector('.atlas').setAttribute('aria-current','page');
      if(location.pathname.startsWith('/mein-dashboard/')||location.pathname.startsWith('/konto/'))root.querySelector('.profile').setAttribute('aria-current','page');
      const syncQuick=()=>root.querySelectorAll('.quick a').forEach(a=>{const h=a.getAttribute('href'),detail=isElliottDetail(location.pathname,location),on=h==='/elliott/'?(detail||location.pathname.startsWith(h)):h==='/quant/'?(!detail&&location.pathname.startsWith(h)):location.pathname.startsWith(h);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
      syncQuick();
      if(this.hasAttribute('theme-switch')&&this.getAttribute('theme')!==currentTheme())this.setAttribute('theme',currentTheme());
      const panel=root.querySelector('.panel'),button=root.querySelector('.toggle');panel.inert=true;
      /* Ein Menue fuer zwei Oeffner: den Knopf im Kopf (Seiten ohne Leiste)
         und ☰ in der Produkt-Leiste. Der Fokus kehrt zum Oeffner zurueck. */
      let opener=null;
      const setExpanded=open=>{[button,this.dockMenuButton].forEach(b=>{if(!b)return;b.setAttribute('aria-expanded',String(open));b.setAttribute('aria-label',open?'Menü schließen':(b===button?'Menü öffnen':'Vision Universe Menü öffnen'));});};
      const close=()=>{if(!this.hasAttribute('open'))return;this.removeAttribute('open');panel.inert=true;panel.setAttribute('aria-hidden','true');setExpanded(false);document.documentElement.classList.remove('vu-menu-open');if(this.dockHost)this.dockHost.inert=false;};
      const restore=()=>{const target=opener&&opener.isConnected&&opener.getClientRects().length?opener:button;if(target&&target.focus)target.focus();};
      this.openMenu=from=>{if(this.hasAttribute('open')){close();restore();return;}opener=from||button;syncActive();root.querySelectorAll('.menu-product-icon use[data-href]').forEach(icon=>{icon.setAttribute('href',icon.getAttribute('data-href'));icon.removeAttribute('data-href');});this.setAttribute('open','');panel.inert=false;panel.removeAttribute('aria-hidden');setExpanded(true);document.documentElement.classList.add('vu-menu-open');if(this.dockHost)this.dockHost.inert=true;const focusClose=()=>{if(!this.hasAttribute('open'))return;if(getComputedStyle(panel).visibility!=='visible'){requestAnimationFrame(focusClose);return;}root.querySelector('.close').focus();};requestAnimationFrame(focusClose);};
      button.onclick=()=>this.openMenu(button);
      root.querySelector('.close').onclick=()=>{close();restore();};root.querySelector('.backdrop').onclick=()=>{close();restore();};
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
      if(dockBus.requested)this.mountDock();
      this.renderSettings();
      document.addEventListener('vu-currency-change',()=>this.renderSettings());
      document.addEventListener('vu-fx-ready',()=>this.renderSettings());
      document.addEventListener('vu-theme-change',()=>this.renderSettings());
    }
    /* Die Produkt-Leiste: ein eigener Knoten am Ende von <body> mit
       eigenem Shadow Root, damit sie unabhaengig vom Kopf (z-index des
       Kopfes) unter Produkt-Overlays liegen kann. */
    mountDock(){
      const product=PRODUCTS.find(p=>p.match(location.pathname,location));
      if(!product||this.hasAttribute('no-dock')||document.getElementById('vu-dock'))return;
      this.setAttribute('dock',product.id);
      document.documentElement.setAttribute('data-vu-dock',product.id);
      const host=document.createElement('div');host.id='vu-dock';host.className='vu-dock';this.dockHost=host;
      const root=host.attachShadow({mode:'open'});
      root.innerHTML=`<style>${dockStyles}</style><nav aria-label="${product.label}"></nav>`;
      const nav=root.querySelector('nav');
      const links=product.items.map(([id,label,href,icon,name],i)=>{
        const a=document.createElement('a');a.href=href;a.dataset.id=id;if(!i)a.className='product';if(name)a.setAttribute('aria-label',name);
        a.innerHTML=`${i?'<svg viewBox="0 0 24 24" aria-hidden="true">'+(dockIcons[icon]||'')+'</svg>':dockProductIcon((groups.find(g=>g.id===product.id)||{icon:product.id}).icon)}<span class="label">${label}</span>`;
        a.addEventListener('click',event=>{
          if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
          const intent=new CustomEvent('vu-dock-navigate',{cancelable:true,detail:{product:product.id,id,href:a.getAttribute('href')}});
          if(!document.dispatchEvent(intent))event.preventDefault();
        });
        nav.append(a);return a;
      });
      const menu=document.createElement('button');menu.type='button';menu.className='menu';
      menu.setAttribute('aria-haspopup','true');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Vision Universe Menü öffnen');
      menu.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${dockIcons.menu}</svg><span class="label">Menü</span>`;
      menu.onclick=()=>this.openMenu(menu);nav.append(menu);this.dockMenuButton=menu;
      // Ein vom Produkt gemeldeter Bereich gilt nur fuer die URL, zu der er gemeldet wurde.
      const paint=()=>{
        const state=dockBus.state,current=state.activeAt===location.href?state.active:product.active(location);
        links.forEach((a,i)=>{
          const id=a.dataset.id;
          if(state.hrefs&&state.hrefs[id])a.setAttribute('href',state.hrefs[id]);
          if(id===current)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
          if(!i)a.classList.toggle('is-context',current!==id&&!links.some(x=>x.dataset.id===current));
          let badge=a.querySelector('.badge');const value=state.badges&&state.badges[id];
          if(value===undefined||value===null||value===''){if(badge)badge.remove();}
          else{if(!badge){badge=document.createElement('span');badge.className='badge';a.append(badge);}badge.textContent=value>999?'999+':String(value);badge.setAttribute('aria-label',value+' Treffer');}
        });
      };
      dockBus.listeners.push(paint);
      window.addEventListener('hashchange',paint);window.addEventListener('popstate',paint);
      paint();
      /* Eine SPA kann das Produkt unter demselben Pfad wechseln (Quant -> Elliott-Detail): dann Leiste neu aufbauen. */
      const reshape=()=>{
        const next=PRODUCTS.find(p=>p.match(location.pathname,location));
        if(!next||next.id===product.id)return;
        [['hashchange',paint],['popstate',paint],['hashchange',reshape],['popstate',reshape]].forEach(([t,f])=>window.removeEventListener(t,f));
        const at=dockBus.listeners.indexOf(paint);if(at>=0)dockBus.listeners.splice(at,1);
        host.remove();this.removeAttribute('dock');this.dockHost=null;this.dockMenuButton=null;this.mountDock();
      };
      window.addEventListener('hashchange',reshape);window.addEventListener('popstate',reshape);
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
