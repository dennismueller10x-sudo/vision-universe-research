// Central navigation for every page. Add new menu entries only here.
(() => {
  // Product links navigate directly; their separate disclosure opens existing routes.
  const groups = [
    {id:'discover', label:'Discover', href:'/discover/#/', icon:'discover', entries:[['Übersicht','/discover/#/','⌂'],['Welten','/discover/#/welten','◎'],['Strategien','/discover/#/strategien','◬'],['Entdecken','/discover/#/einzeln/US_REAL','◇'],['Suchen','/discover/#/suche','⌕'],['Märkte','/discover/#/maerkte','≋'],['Watchlist','/discover/#/watchlist','♡']]},
    {id:'quant', label:'Quant', href:'/quant/', icon:'quant', entries:[['Übersicht','/quant/','⌂'],['Quant Screener','/quant/#/screener','⧩'],['Strategien','/quant/#/strategien','◬'],['Aktien','/quant/#/aktien','⌁'],['Methodik','/quant/#/methodik','▤'],['Elliott Wave','/quant/#/aktie/NVDA/chartbild?ansicht=profi','◬'],['Technische Analyse','/quant/#/aktie/NVDA/technik','⌁'],['Fundamentaldaten','/quant/#/aktie/NVDA/zahlen','▧']]},
    {id:'screener', label:'Screener', href:'/screener/', icon:'screener', entries:[['Übersicht','/screener/','⌂'],['Filter hinzufügen','/screener/?view=build','⧩'],['Treffer','/screener/?view=results','⌕'],['Gespeichert','/screener/?view=saved','▤'],['Watchlist','/screener/?view=watchlist','♡']]},
    {id:'vorsorge', label:'Vorsorge', href:'/vorsorge/#/', icon:'vorsorge', entries:[['Vorsorge Home','/vorsorge/#/','☂'],['Planer','/vorsorge/#/plan','◬'],['ETFs','/vorsorge/#/etfs','◫'],['Portfolio','/vorsorge/#/portfolio','◎'],['Vergleichen','/vorsorge/#/vergleichen','⧩'],['Förderung','/vorsorge/#/foerderung','✧'],['Veränderungen','/vorsorge/#/monitor','≋'],['Wissen','/vorsorge/#/wissen','▤']]},
    {id:'supertrader', label:'Supertrader', href:'/supertrader/', icon:'supertrader', entries:[['Übersicht','/supertrader/','⌂'],['Methoden','/supertrader/strategies/','⚑'],['Signale','/supertrader/signals/','◬'],['Backtests','/supertrader/backtests/','▧'],['Quellen','/supertrader/sources/','▤']]},
    {id:'hedgefonds', label:'Hedgefonds', href:'/hedgefonds/', icon:'hedgefonds', entries:[['Übersicht','/hedgefonds/','⌂'],['Investoren','/hedgefonds/#/investoren','♙'],['Datenbank','/hedgefonds/#/datenbank','▧'],['Aktien','/hedgefonds/#/aktien','⌁']]},
    {id:'more', label:'Weitere Produkte', href:null, icon:'layers', entries:[['Dashboard','/dashboard/','▧'],['Macro','/macro/','≋'],['ETF','/etf/','◫'],['Analysten','/analysten/','◇'],['News','/news/','▤'],['Morning','/morning/','☼'],['Magazin','/magazin/','▣'],['Reports','/reports/xpeng/','▥'],['Academy','/academy/','✧'],['Guide','/guide/','◈'],['Budget','/budget/','▦']]}
  ];
  /* Produkt-Dock: die schwebende Leiste am unteren Rand jedes Produkts.
     Regel fuer alle Produkte: [PRODUKT] [Funktion] [Funktion] [Funktion] [☰].
     Der erste Eintrag traegt immer den Produktnamen (nie "Home"/"Start")
     und fuehrt zur Startseite des Produkts; ☰ oeffnet das GLOBALE Menue
     dieser Komponente. Ziele sind die bestehenden Routen der Produkte.
     active(loc) liefert die id des aktiven Eintrags oder null; dann zeigt
     der Produkteintrag nur, in welchem Produkt man ist. */
  const hashPart = (loc, i) => (loc.hash.replace(/^#\/?/, '').split('?')[0].split('/')[i] || '');
  const PRODUCTS = [
    {id: 'discover', label: 'Discover', match: p => p.startsWith('/discover/'),
      items: [['discover','Discover','/discover/#/','discover'],['welten','Welten','/discover/#/welten','worlds'],['strategien','Strategien','/discover/#/strategien','strategies'],['entdecken','Entdecken','/discover/#/einzeln/US_REAL','explore']],
      active: loc => {
        const k = hashPart(loc, 0);
        if (!k) return 'discover';
        if (k === 'c') { const themes = globalThis.VUDiscover?.Views?.Themes; return themes && themes.byRow(hashPart(loc, 2)) ? 'welten' : 'strategien'; }
        return {welten: 'welten', thema: 'welten', strategien: 'strategien', einzeln: 'entdecken'}[k] || null;
      }},
    {id: 'quant', label: 'Quant', match: p => p.startsWith('/quant/'),
      items: [['quant','Quant','/quant/#/','quant'],['screener','Screener','/quant/#/screener','screener','Quant Screener'],['strategien','Strategien','/quant/#/strategien','strategies'],['aktien','Aktien','/quant/#/aktien','stocks']],
      active: loc => {
        const legacy = {'/quant/screener/': 'screener', '/quant/strategies/': 'strategien', '/quant/strategies/builder/': 'strategien', '/quant/stock/': 'aktien', '/quant/technical/': 'aktien', '/quant/ranking/': 'aktien'}[loc.pathname];
        if (legacy) return legacy;
        if (loc.pathname !== '/quant/') return null;
        const k = hashPart(loc, 0);
        return {'': 'quant', radar: 'quant', screener: 'screener', strategien: 'strategien', aktien: 'aktien', aktie: 'aktien', vergleich: 'aktien'}[k] || null;
      }},
    {id: 'vorsorge', label: 'Vorsorge', match: p => p.startsWith('/vorsorge/'),
      items: [['vorsorge','Vorsorge','/vorsorge/#/','vorsorge'],['plan','Plan','/vorsorge/#/plan','plan'],['etfs','ETFs','/vorsorge/#/etfs','etf'],['portfolio','Portfolio','/vorsorge/#/portfolio','portfolio']],
      active: loc => {
        if (loc.pathname.startsWith('/vorsorge/etf/')) return 'etfs';
        return {'': 'vorsorge', home: 'vorsorge', plan: 'plan', luecke: 'plan', etfs: 'etfs', etf: 'etfs', watchlist: 'etfs', europa: 'etfs', portfolio: 'portfolio', xray: 'portfolio', szenarien: 'portfolio'}[hashPart(loc, 0)] || null;
      }},
    {id: 'screener', label: 'Screener', match: p => p.startsWith('/screener/'),
      items: [['screener','Screener','/screener/','screener'],['treffer','Treffer','/screener/?view=results','hits'],['gespeichert','Gespeichert','/screener/?view=saved','saved'],['watchlist','Watchlist','/screener/?view=watchlist','heart']],
      active: loc => {
        const view = new URLSearchParams(loc.search).get('view') || 'start';
        return {start: 'screener', build: 'screener', results: 'treffer', compare: 'treffer', saved: 'gespeichert', changes: 'gespeichert', watchlist: 'watchlist'}[view] || null;
      }},
    {id: 'supertrader', label: 'Supertrader', match: p => p.startsWith('/supertrader/'),
      items: [['supertrader','Supertrader','/supertrader/','supertrader'],['methoden','Methoden','/supertrader/strategies/','grid'],['signale','Signale','/supertrader/signals/','signals'],['backtests','Backtests','/supertrader/backtests/','backtests']],
      active: loc => {
        const k = loc.pathname.split('/')[2] || '';
        return {'': 'supertrader', strategies: 'methoden', signals: 'signale', stock: 'signale', backtests: 'backtests'}[k] || null;
      }},
    {id: 'hedgefonds', label: 'Hedgefonds', match: p => p.startsWith('/hedgefonds/'),
      items: [['hedgefonds','Hedgefonds','/hedgefonds/#/','hedgefonds'],['investoren','Investoren','/hedgefonds/#/investoren','users'],['datenbank','Datenbank','/hedgefonds/#/datenbank','table'],['aktien','Aktien','/hedgefonds/#/aktien','stocks']],
      active: loc => ({'': 'hedgefonds', investoren: 'investoren', datenbank: 'datenbank', aktien: 'aktien', aktie: 'aktien'}[hashPart(loc, 0)] || null)}
  ];
  // Original sprite geometry is inlined only for the always-visible dock: no extra request
  // on resource-budgeted workspaces. The provenance test keeps these six symbols exact.
  const DOCK_PRODUCT_ICONS = {
  "discover": "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"9.5\"/><circle class=\"dim\" opacity=\".45\" cx=\"12\" cy=\"12\" r=\"6\"/><circle class=\"dim\" opacity=\".45\" cx=\"12\" cy=\"12\" r=\"2.5\"/><path class=\"fill\" fill=\"currentColor\" stroke=\"none\" d=\"M12 12 18.7 5.3A9.5 9.5 0 0 1 21.5 12z\" opacity=\".28\"/><path d=\"M12 12 18.7 5.3\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"16.2\" cy=\"9.6\" r=\"1.3\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"7.6\" cy=\"15.4\" r=\"1\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"15.8\" cy=\"16.2\" r=\".9\"/></g>",
  "quant": "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"5.5\" y=\"5.5\" width=\"13\" height=\"13\" rx=\"2.2\"/><path class=\"dim\" opacity=\".45\" d=\"M9 2v3.5M12 2v3.5M15 2v3.5M9 18.5V22M12 18.5V22M15 18.5V22M2 9h3.5M2 12h3.5M2 15h3.5M18.5 9H22M18.5 12H22M18.5 15H22\"/><path d=\"M14.6 9H9.6l2.6 3-2.6 3h5\"/></g>",
  "screener": "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 5h18M6 10.5h12M9 16h6M12 16v5\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"3\" cy=\"5\" r=\"1.4\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"21\" cy=\"5\" r=\"1.4\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"6\" cy=\"10.5\" r=\"1.3\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"18\" cy=\"10.5\" r=\"1.3\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"9\" cy=\"16\" r=\"1.2\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"15\" cy=\"16\" r=\"1.2\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"12\" cy=\"21\" r=\"1.5\"/></g>",
  "vorsorge": "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 11.5a9 9 0 0 1 18 0z\"/><path d=\"M12 11.5v7a2.2 2.2 0 0 0 4.4 0\"/><path class=\"dim\" opacity=\".45\" d=\"M12 2.5V1M7.5 11.5c0-4 2-7 4.5-9M16.5 11.5c0-4-2-7-4.5-9\"/><circle class=\"fill\" fill=\"currentColor\" stroke=\"none\" cx=\"20\" cy=\"20\" r=\"1.3\"/><path class=\"dim\" opacity=\".45\" d=\"M18.5 16l1.5 4\"/></g>",
  "supertrader": "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"8\"/><path class=\"dim\" opacity=\".45\" d=\"M12 1.5v3.5M12 19v3.5M1.5 12H5M19 12h3.5\"/><rect x=\"10.3\" y=\"9\" width=\"3.4\" height=\"6\" rx=\".6\"/><path d=\"M12 6.8V9M12 15v2.2\"/></g>",
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
    const product = PRODUCTS.find(p => p.match(loc.pathname));
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
      if (product.id === 'hedgefonds' && hashPart(loc, 0) === 'fonds') href = '/hedgefonds/#/datenbank';
      if (product.id === 'discover' && hashPart(loc, 0) === 's') href = '/discover/#/einzeln/US_REAL';
    }
    // Screener omits view=build on its default filtered/pro URLs (app.readURL/buildURL).
    const params = new URLSearchParams(loc.search), explicit = params.get('view');
    const screenerView = ['start','build','results','saved','changes','compare','watchlist'].includes(explicit) ? explicit : (params.getAll('f').some(f=>f.trim()) || params.get('mode') === 'pro' ? 'build' : 'start');
    if(product && product.id === 'screener') href = {start:'/screener/',build:'/screener/?view=build',results:'/screener/?view=results',compare:'/screener/?view=results',saved:'/screener/?view=saved',changes:'/screener/?view=saved',watchlist:'/screener/?view=watchlist'}[screenerView];
    const home = product && loc.pathname === new URL(product.items[0][2], 'https://x').pathname && !hashPart(loc, 0) && (product.id === 'screener' ? screenerView === 'start' : !params.has('view'));
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
    hits: '<path d="M4 5h16l-6 8v5l-4 2v-7z"/>',
    saved: '<path d="M6 3.5h12v17l-6-4-6 4z"/>',
    heart: '<path d="M20.8 8.5c0 4-4.4 7.6-8.8 11-4.4-3.4-8.8-7-8.8-11a5 5 0 0 1 8.8-3.1 5 5 0 0 1 8.8 3.1z"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
    signals: '<path d="M3 17l5-6 4 3 6-8 3 3"/>',
    backtests: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.6 3-5.5 6-5.5s5.4 1.9 6 5.5M16 4.8a3.2 3.2 0 0 1 0 6.4M17.5 14.6c2 .5 3.2 2.2 3.5 5.4"/>',
    table: '<rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="M3.5 9.5h17M3.5 15h17M9.5 9.5V20"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>'
  };
  /* Die Leiste ist auf hellen und dunklen Flaechen dieselbe: ein ruhiges,
     fast schwarzes Element mit dem Vision-Universe-Lime als aktiver Flaeche
     (Design-DNA der Startseite). Sie liegt ueber dem Inhalt (z-index 900),
     aber unter Produkt-Overlays (Suche, Sheets, Dialoge) und unter dem
     globalen Menue. Abstand fuer den Inhalt: --vu-dock-space
     (site-navigation.css), damit nichts Letztes dauerhaft verdeckt ist. */
  const dockStyles = `
        :host{position:fixed;left:0;right:0;bottom:0;z-index:900;display:flex;justify-content:center;padding:0 10px calc(10px + env(safe-area-inset-bottom));pointer-events:none;font:400 14px Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;text-align:left}
        *{box-sizing:border-box}
        nav{pointer-events:auto;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:2px;width:100%;max-width:520px;padding:6px;border-radius:26px;background:#0d0f12;color:#f4f5f1;box-shadow:0 0 0 1px rgba(255,255,255,.07),0 16px 36px -14px rgba(0,0,0,.55)}
        a,button{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-width:0;min-height:54px;padding:7px 2px 6px;border:0;border-radius:20px;background:transparent;color:rgba(244,245,241,.66);font-family:inherit;font-size:10.5px;font-weight:700;line-height:1.15;letter-spacing:.01em;text-decoration:none;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background-color .15s,color .15s,transform .15s}
        a:hover,button:hover{color:#fff;background:rgba(255,255,255,.07)}
        a:active,button:active{transform:scale(.96)}
        a:focus-visible,button:focus-visible{outline:2px solid #c8f531;outline-offset:2px}
        .label{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .product{color:#f4f5f1}.product .label{font-weight:800}
        .product.is-context{color:#c8f531}
        a[aria-current=page],a[aria-current=page]:hover{background:#c8f531;color:#101318}
        svg{width:22px;height:22px;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
        .badge{position:absolute;top:4px;left:calc(50% + 6px);min-width:17px;height:17px;padding:0 5px;border-radius:9px;background:#f4f5f1;color:#101318;font-size:10px;font-weight:800;line-height:17px;text-align:center}
        a[aria-current=page] .badge{background:#101318;color:#c8f531}
        button[aria-expanded=true]{color:#c8f531}
        @media(min-width:761px){
          :host{padding-bottom:calc(16px + env(safe-area-inset-bottom))}
          nav{display:flex;width:auto;max-width:100%;gap:2px;padding:5px;border-radius:999px}
          a,button{flex-direction:row;gap:8px;min-height:46px;padding:0 16px;border-radius:999px;font-size:13px}
          .label{overflow:visible}
          svg{width:19px;height:19px}
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
    light: {
      bg: 'rgba(255,255,255,.96)', border: 'rgba(0,0,0,.07)', ink: '#111',
      divider: '#e5e5e2', burgerBg: '#050505', burgerInk: '#fff',
      panelBg: '#101318', panelBorder: 'rgba(255,255,255,.15)', outline: '#c8f531',
      atlasBg: '#101318', atlasInk: '#f5f6f2', atlasRing: 'rgba(200,245,49,.35)', atlasGlow: 'rgba(16,19,24,.18)'
    },
    dark: {
      bg: 'rgba(8,8,10,.92)', border: 'rgba(255,255,255,.10)', ink: '#f4f4f1',
      divider: 'rgba(255,255,255,.12)', burgerBg: '#f4f4f1', burgerInk: '#08080a',
      panelBg: '#101318', panelBorder: 'rgba(255,255,255,.15)', outline: '#c8f531',
      atlasBg: '#171b21', atlasInk: '#f5f6f2', atlasRing: 'rgba(200,245,49,.55)', atlasGlow: 'rgba(200,245,49,.16)'
    }
  };

  /* Farbschema plattformweit: dieselbe Wahl (localStorage, Schluessel von
     Discover) gilt auf jeder Seite. Seiten mit Hell- und Dunkel-Styles
     tragen das Attribut theme-switch an <vu-navigation>; nur dort zeigt
     der Kopf den Schalter. Gibt es die Discover-Engine (VUDiscover.theme),
     schaltet sie; sonst setzt der Kopf <html data-theme> selbst und meldet
     den Wechsel mit dem Ereignis vu-theme-change. */
  const THEME_KEY = 'vu-discover-theme-v1';
  const BAR = {light: '#ffffff', dark: '#08080a'};
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
        *{box-sizing:border-box}header{background:${t.bg};-webkit-backdrop-filter:blur(18px) saturate(1.3);backdrop-filter:blur(18px) saturate(1.3);box-shadow:0 1px 0 ${t.border}}
        .shell{width:min(1240px,calc(100% - 64px));margin:auto}.row{height:72px;display:flex;align-items:center;gap:20px}
        .brand{flex-shrink:0;display:flex;align-items:center;text-decoration:none}img{display:block;width:clamp(150px,14vw,196px);max-width:30vw;height:auto}
        .section{font-size:12px;color:${t.ink};opacity:.65;border-left:1px solid ${t.divider};padding-left:16px;white-space:nowrap}
        .quick{display:flex;align-items:center;gap:22px;margin-left:auto}.quick a{color:${t.ink};font-size:13px;font-weight:700;text-decoration:none}
        .quick a[aria-current=page]{text-decoration:underline;text-underline-offset:8px}
        a:hover{text-decoration:underline;text-underline-offset:5px}a:focus-visible,button:focus-visible{outline:2px solid ${t.outline};outline-offset:3px}
        button{font:inherit;cursor:pointer}.toggle{flex-shrink:0;border:1px solid ${t.divider};background:transparent;color:${t.ink};padding:10px 16px;border-radius:24px;font-weight:700}
        .atlas{flex-shrink:0;display:inline-flex;align-items:center;gap:9px;height:42px;padding:0 16px 0 5px;border-radius:24px;background:${t.atlasBg};color:${t.atlasInk};font-size:13px;font-weight:800;letter-spacing:.01em;text-decoration:none;white-space:nowrap;box-shadow:0 0 0 1px ${t.atlasRing};transition:transform .15s,box-shadow .15s}
        .quick+.atlas{margin-left:4px}.atlas:hover{text-decoration:none;transform:translateY(-1px);box-shadow:0 0 0 1px ${t.atlasRing},0 8px 22px ${t.atlasGlow}}
        .atlas-icon{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:#c8f531}
        .atlas-icon svg{width:19px;height:19px;fill:#101318}.atlas-small{opacity:.7}
        .mode{flex-shrink:0;width:42px;height:42px;display:grid;place-items:center;border-radius:50%;border:1px solid ${t.divider};background:transparent;color:${t.ink};padding:0;transition:transform .15s,background-color .15s}
        .mode:hover{transform:translateY(-1px);background:${t.border}}.mode svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
        .mode .sun{display:none}:host([theme="dark"]) .mode .sun{display:block}:host([theme="dark"]) .mode .moon{display:none}
        .atlas[aria-current=page]{box-shadow:0 0 0 2px #c8f531,0 6px 22px ${t.atlasGlow}}
        .backdrop{position:fixed;inset:72px 0 0;background:#0009;visibility:hidden;opacity:0;transition:opacity .2s}
        .panel{position:fixed;right:0;top:72px;bottom:0;width:min(420px,100vw);padding:24px 28px calc(34px + env(safe-area-inset-bottom));overflow-y:auto;overscroll-behavior:contain;background:${t.panelBg};color:#f5f6f2;border-left:1px solid ${t.panelBorder};box-shadow:-20px 20px 70px #0004;visibility:hidden;transform:translateX(100%);transition:transform .2s,visibility .2s}
        :host([open]) .backdrop,:host([open]) .panel{visibility:visible;opacity:1;transform:none}
        .panel-head{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding:4px 0 12px;background:#101318}.panel-head img{width:185px;max-width:none;filter:invert(1) brightness(1.08)}.close{border:0;background:transparent;color:#f5f6f2;font-size:30px;width:44px;height:44px}
        .panel h2{font-size:11px;text-transform:uppercase;letter-spacing:.14em;margin:0 0 9px;padding-bottom:9px;border-bottom:1px solid #ffffff30;color:#e8ebe8}
        .groups{display:grid;gap:6px}.group-head{display:flex;align-items:center;gap:4px;min-height:56px;border-radius:12px}.group-link,.group-title{flex:1;min-width:0;display:flex;align-items:center;gap:12px;padding:6px 8px;color:#f5f6f2;font-size:15px;font-weight:750;text-decoration:none;min-height:48px}.group-link:hover{text-decoration:none;background:#ffffff0a;border-radius:10px}.group.is-current .group-link,.group.is-current .group-title{color:#c8f531}.group-link[aria-current=page]{background:#c8f53112}.disclosure{display:grid;place-items:center;flex:none;width:44px;height:48px;border:0;border-radius:10px;background:transparent;color:#b8beb5}.disclosure:hover{background:#ffffff12;color:#c8f531}.disclosure svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;transition:transform .15s}.disclosure[aria-expanded=true] svg{transform:rotate(180deg)}.menu-product-icon{width:36px;height:36px;display:grid;place-items:center;flex:none;border:1px solid #c8f53155;border-radius:10px;background:radial-gradient(circle at 50% 15%,#c8f53118,transparent 75%),#080b0b;color:#c8f531;box-shadow:inset 0 0 12px #c8f53108}.menu-product-icon svg{width:25px;height:25px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}.links[hidden]{display:none}.group .links{padding:3px 0 8px 48px}.groups h2{margin:0;padding:0;border:0;text-transform:none;letter-spacing:0;font:inherit}.group.is-current h2{color:#c8f531;border-color:#c8f53170}.group.is-current .links a[aria-current=page]{background:#c8f531;color:#101318}
        .links{display:grid;grid-template-columns:1fr;gap:2px}.links a{color:#f5f6f2;text-decoration:none;display:flex;align-items:center;gap:12px;padding:8px 10px;min-height:44px;font-size:13px;border-radius:9px}.links a:hover{background:#ffffff17}
        .icon{width:34px;height:34px;flex:none;display:grid;place-items:center;color:#f5f6f2}.icon svg{width:27px;height:27px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}.links a[aria-current=page] .icon{color:#101318}.settings{margin-top:24px;padding-top:20px;border-top:1px solid #ffffff30}.setting{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:14px 0;font-size:12px}
        .choices{display:flex;border:1px solid #ffffff38;border-radius:10px;padding:3px;gap:2px}.choices button,.choices a{display:grid;place-items:center;border:0;border-radius:7px;background:transparent;color:#f5f6f2;padding:7px 9px;min-width:44px;min-height:44px;font-size:11px;text-align:center;text-decoration:none}.choices [aria-pressed=true]{background:#f5f6f2;color:#101318}
        .panel a:focus-visible,.panel button:focus-visible{outline-color:#c8f531}
        @media(max-width:1240px){.section{display:none}}@media(max-width:900px){.quick a.q-extra{display:none}}
        @media(max-width:1024px){.quick{display:none}.quick+.atlas,.atlas{margin-left:auto}}
        @media(max-width:760px){.shell{width:calc(100% - 32px)}.row{height:64px;gap:10px;min-width:0}.brand{min-width:0}.brand img{width:min(168px,46vw);max-width:100%}.section{display:none}.quick{display:none}.quick+.atlas,.atlas{margin-left:auto;height:44px}.mode{width:44px;height:44px}.toggle{margin-left:auto;white-space:nowrap;padding:10px 12px;min-height:44px}.backdrop{inset:64px 0 0}.panel{top:64px;width:min(400px,100vw);padding:22px 24px calc(36px + env(safe-area-inset-bottom))}.links{grid-template-columns:1fr}.links a{min-height:44px;font-size:14px}.groups{gap:6px}}
        @media(max-width:480px){.row{gap:6px}.mode{width:44px;height:44px}.brand img{width:min(140px,32vw)}:host([theme-switch]) .menu-label{display:none}:host([theme-switch]) .toggle{width:44px;padding:0;display:grid;place-items:center;font-size:17px}.atlas{gap:7px;padding-right:12px;font-size:12px}}
        @media(max-width:340px){.atlas-ask{display:none}.mode{width:44px;height:44px}.toggle{padding:10px 9px}}
        @media(max-width:360px){.shell{width:calc(100% - 24px)}.brand img{width:min(120px,35vw)}.panel{padding-inline:20px}}
        :host([theme="dark"]) header img{filter:invert(1) brightness(1.08)}
        :host([dock]) .section,:host([dock]) .quick,:host([dock]) .toggle{display:none}:host([dock]) .atlas{margin-left:auto}
        @media(max-width:480px){:host([dock]) .brand img{width:min(150px,40vw)}}
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
      const inDiscover = location.pathname.startsWith('/discover/');
      root.innerHTML = `<style>${styles(t)}</style><header><div class="shell"><div class="row"><a class="brand" href="/" aria-label="Vision Universe Startseite"><img src="/assets/vision-universe-logo-web.png" alt="Vision Universe"></a><span class="section">${inDiscover?'Discover':'Entdecken. Verstehen. Investieren.'}</span><nav class="quick" aria-label="Direktzugriff"><a href="/dashboard/">Dashboard</a><a href="/screener/">Screener</a><a href="/news/">News</a><a href="/quant/">Quant</a><a class="q-extra" href="/vorsorge/">Vorsorge</a></nav><a class="atlas" href="/ask/" aria-label="AI Atlas – KI-Suche"><span class="atlas-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3.2c.5 3.9 2.3 6.2 6.4 6.8-4.1.6-5.9 2.9-6.4 6.8-.5-3.9-2.3-6.2-6.4-6.8 4.1-.6 5.9-2.9 6.4-6.8z"/><path class="atlas-small" d="M18.6 14.6c.2 1.6.9 2.5 2.6 2.8-1.7.3-2.4 1.2-2.6 2.8-.2-1.6-.9-2.5-2.6-2.8 1.7-.3 2.4-1.2 2.6-2.8z"/></svg></span><span class="atlas-label"><span class="atlas-ask">AI </span>Atlas</span></a>${this.hasAttribute('theme-switch')?'<button class="mode" type="button" aria-label="Farbschema wechseln"><svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg><svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/></svg></button>':''}<button class="toggle" type="button" aria-label="Menü öffnen" aria-controls="site-panel" aria-expanded="false">☰<span class="menu-label"> Menü</span></button></div></div></header><div class="backdrop"></div><nav class="panel" id="site-panel" aria-label="Vision Universe Menü" aria-hidden="true"><div class="panel-head"><a href="/"><img src="/assets/vision-universe-logo-web.png" alt="Vision Universe"></a><button class="close" type="button" aria-label="Menü schließen">×</button></div><div class="groups"></div><div class="settings"><h2>Einstellungen</h2><div class="setting"><span>Währung</span><div class="choices currency" role="group" aria-label="Anzeigewährung"></div></div><div class="setting"><span>Darstellung</span><div class="choices appearance" role="group" aria-label="Darstellung"></div></div></div></nav>`;
      const host=root.querySelector('.groups');
      const setGroup = id => {
        host.querySelectorAll('.group').forEach(section => {
          const open = section.dataset.group === id;
          section.querySelector('.links').hidden = !open;
          section.querySelector('.disclosure').setAttribute('aria-expanded', String(open));
        });
      };
      groups.forEach(({id,label,href,icon,entries})=>{
        const section=document.createElement('section');section.className='group';section.dataset.group=id;
        const title=document.createElement('h2');title.className='group-head';
        const product=document.createElement(href?'a':'span');product.className=href?'group-link':'group-title';if(href)product.href=href;
        product.innerHTML=`<span class="menu-product-icon" aria-hidden="true">${productIcon(icon)}</span>`;product.append(document.createTextNode(label));
        const disclosure=document.createElement('button');disclosure.type='button';disclosure.className='disclosure';
        disclosure.setAttribute('aria-label',label+' Unterseiten');disclosure.setAttribute('aria-expanded','false');disclosure.setAttribute('aria-controls','menu-links-'+id);
        disclosure.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
        disclosure.onclick=()=>setGroup(disclosure.getAttribute('aria-expanded')==='true'?null:id);
        title.append(product,disclosure);section.append(title);
        const links=document.createElement('div');links.className='links';links.id='menu-links-'+id;links.hidden=true;
        entries.forEach(([label,href])=>{
          const a=document.createElement('a');a.href=href;a.textContent=label;links.append(a);
        });
        section.append(links);host.append(section);
      });
      let menuLocation=null;
      const syncActive=()=>{
        const state=menuState(location);
        host.querySelectorAll('.group').forEach(section=>{
          section.classList.toggle('is-current',section.dataset.group===state.group);
          const product=section.querySelector('.group-link');if(product){if(section.dataset.group===state.group&&!state.expanded)product.setAttribute('aria-current','page');else product.removeAttribute('aria-current');}
        });
        host.querySelectorAll('.links a').forEach(a=>{
          if(a.getAttribute('href')===state.href)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
        });
        if(menuLocation!==location.href){setGroup(state.expanded);menuLocation=location.href;}
      };
      syncActive();
      if(location.pathname.startsWith('/ask/'))root.querySelector('.atlas').setAttribute('aria-current','page');
      root.querySelectorAll('.quick a').forEach(a=>{if(location.pathname.startsWith(a.getAttribute('href')))a.setAttribute('aria-current','page');});
      const modeButton=root.querySelector('.mode');
      const syncMode=()=>{if(!modeButton)return;const dark=currentTheme()==='dark';modeButton.setAttribute('aria-pressed',String(dark));modeButton.setAttribute('aria-label',dark?'Helles Farbschema':'Dunkles Farbschema');modeButton.title=dark?'Hell':'Dunkel';};
      if(modeButton){modeButton.onclick=()=>{window.VUTheme.toggle();syncMode();};syncMode();
        if(this.getAttribute('theme')!==currentTheme())this.setAttribute('theme',currentTheme());}
      document.addEventListener('vu-theme-change',syncMode);
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
          const nodes=[...panel.querySelectorAll('a,button:not(:disabled)')].filter(n=>n.getClientRects().length&&!n.closest('[hidden]')),first=nodes[0],last=nodes[nodes.length-1];
          if(event.shiftKey&&root.activeElement===first){event.preventDefault();last.focus();}
          else if(!event.shiftKey&&root.activeElement===last){event.preventDefault();first.focus();}
        }
      });
      // Escape auch dann, wenn der Fokus (noch) ausserhalb des Menues liegt
      document.addEventListener('keydown',event=>{if(event.key==='Escape'&&this.hasAttribute('open')){close();restore();}});
      window.addEventListener('hashchange',()=>{close();syncActive();});window.addEventListener('popstate',()=>{close();syncActive();});
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
      const product=PRODUCTS.find(p=>p.match(location.pathname));
      if(!product||this.hasAttribute('no-dock')||document.getElementById('vu-dock'))return;
      this.setAttribute('dock',product.id);
      document.documentElement.setAttribute('data-vu-dock',product.id);
      const host=document.createElement('div');host.id='vu-dock';host.className='vu-dock';this.dockHost=host;
      const root=host.attachShadow({mode:'open'});
      root.innerHTML=`<style>${dockStyles}</style><nav aria-label="${product.label}"></nav>`;
      const nav=root.querySelector('nav');
      const links=product.items.map(([id,label,href,icon,name],i)=>{
        const a=document.createElement('a');a.href=href;a.dataset.id=id;if(!i)a.className='product';if(name)a.setAttribute('aria-label',name);
        a.innerHTML=`${i?'<svg viewBox="0 0 24 24" aria-hidden="true">'+(dockIcons[icon]||'')+'</svg>':dockProductIcon(groups.find(g=>g.id===product.id).icon)}<span class="label">${label}</span>`;
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
})();
