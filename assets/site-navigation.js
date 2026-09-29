// Central navigation for every page. Add new menu entries only here.
(() => {
  const groups = [
    ['Discover', [['Start','/discover/#/','⌂'],['Welten','/discover/#/welten','◎'],['Strategien','/discover/#/strategien','◬'],['Entdecken','/discover/#/einzeln/US_REAL','◇'],['Suchen','/discover/#/suche','⌕'],['Märkte','/discover/#/maerkte','≋'],['Watchlist','/discover/#/watchlist','♡']]],
    ['Markets & Data', [['Dashboard','/dashboard/','▧'],['Macro','/macro/','≋'],['ETF','/etf/','◫']]],
    ['Analyse', [['Frag Vision Universe','/ask/','?'],['Screener','/screener/','⧩'],['Quant','/quant/','⌁'],['Analysten','/analysten/','◇'],['Hedgefonds','/hedgefonds/','♙']]],
    ['Research', [['News','/news/','▤'],['Morning','/morning/','☼'],['Magazin','/magazin/','▣'],['Reports','/reports/xpeng/','▥']]],
    ['Learn', [['Academy','/academy/','✧'],['Guide','/guide/','◈']]],
    ['Tools & Personal', [['Budget','/budget/','▦']]]
  ];
  const iconPaths = {
    '⌂':'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    '◎':'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 5-5 13 0 18m0-18c5 5 5 13 0 18"/>',
    '◬':'<path d="M4 19V5m0 14h16M7 15l4-5 3 2 5-7m0 0v5m0-5h-5"/>',
    '◇':'<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8 12 3 3 5-6"/>',
    '⌕':'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
    '≋':'<path d="M2 9c3-3 5 3 8 0s5-3 8 0 3 2 4 1M2 15c3-3 5 3 8 0s5-3 8 0 3 2 4 1"/>',
    '♡':'<path d="M20.8 8.5c0 4-4.4 7.6-8.8 11-4.4-3.4-8.8-7-8.8-11a5 5 0 0 1 8.8-3.1 5 5 0 0 1 8.8 3.1z"/>',
    '▧':'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 16v-4m5 4V8m5 8v-6"/>',
    '◫':'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18M3 10h18"/>',
    '⌁':'<path d="m2 15 5-6 4 4 5-9 6 5M2 20h20"/>',
    '♙':'<circle cx="12" cy="6" r="2"/><path d="M8 18h8l-1-7H9zM6 21h12"/>',
    '▤':'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    '☼':'<circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/>',
    '▣':'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 7h10v6H7zM7 17h10"/>',
    '▥':'<path d="M5 3h10l4 4v14H5zM15 3v5h4M8 12h8M8 16h8"/>',
    '✧':'<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z"/>',
    '◈':'<path d="m12 2 10 10-10 10L2 12zM12 7l5 5-5 5-5-5z"/>',
    '⧩':'<path d="M4 5h16l-6 8v5l-4 2v-7z"/>',
    '▦':'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12m6-12v12"/>'
  };
  /* Die Plattformnavigation ist auf allen Produkten dieselbe Komponente.
     Discover synchronisiert ihr Farbschema mit seiner eigenen Theme-Wahl. */
  const THEMES = {
    light: {
      bg: 'rgba(255,255,255,.96)', border: 'rgba(0,0,0,.07)', ink: '#111',
      divider: '#e5e5e2', burgerBg: '#050505', burgerInk: '#fff',
      panelBg: '#101318', panelBorder: 'rgba(255,255,255,.15)', outline: '#c8f531'
    },
    dark: {
      bg: 'rgba(8,8,10,.92)', border: 'rgba(255,255,255,.10)', ink: '#f4f4f1',
      divider: 'rgba(255,255,255,.12)', burgerBg: '#f4f4f1', burgerInk: '#08080a',
      panelBg: '#101318', panelBorder: 'rgba(255,255,255,.15)', outline: '#c8f531'
    }
  };

  /* Die Farbwerte des Kopfes als Funktion des Schemas: so kann Discover
     das Attribut theme spaeter umschalten (Hell/Dunkel/System, V4.1), und
     der Kopf zieht mit, ohne neu aufgebaut zu werden. */
  const styles = (t) => `
        :host{display:block;position:fixed;inset:0 0 auto;z-index:1000000;color:${t.ink};font:400 14px Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;text-align:left}
        *{box-sizing:border-box}header{background:${t.bg};backdrop-filter:blur(18px);border-bottom:1px solid ${t.border}}
        .shell{width:min(1400px,calc(100% - 64px));margin:auto}.row{height:88px;display:flex;align-items:center;gap:20px}
        .brand{flex-shrink:0;display:flex;align-items:center;text-decoration:none}img{display:block;width:240px;max-width:30vw;height:auto}
        .section{font-size:12px;color:${t.ink};opacity:.65;border-left:1px solid ${t.divider};padding-left:16px;white-space:nowrap}
        .quick{display:flex;align-items:center;gap:22px;margin-left:auto}.quick a{color:${t.ink};font-size:13px;font-weight:700;text-decoration:none}
        .quick a[aria-current=page]{text-decoration:underline;text-underline-offset:8px}
        a:hover{text-decoration:underline;text-underline-offset:5px}a:focus-visible,button:focus-visible{outline:2px solid ${t.outline};outline-offset:3px}
        button{font:inherit;cursor:pointer}.toggle{flex-shrink:0;border:1px solid ${t.divider};background:transparent;color:${t.ink};padding:10px 16px;border-radius:24px;font-weight:700}
        .backdrop{position:fixed;inset:88px 0 0;background:#0009;visibility:hidden;opacity:0;transition:opacity .2s}
        .panel{position:fixed;right:0;top:88px;bottom:0;width:min(420px,100vw);padding:24px 28px calc(34px + env(safe-area-inset-bottom));overflow-y:auto;overscroll-behavior:contain;background:${t.panelBg};color:#f5f6f2;border-left:1px solid ${t.panelBorder};box-shadow:-20px 20px 70px #0004;visibility:hidden;transform:translateX(100%);transition:transform .2s,visibility .2s}
        :host([open]) .backdrop,:host([open]) .panel{visibility:visible;opacity:1;transform:none}
        .panel-head{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding:4px 0 12px;background:#101318}.panel-head img{width:185px;max-width:none;filter:invert(1) brightness(1.08)}.close{border:0;background:transparent;color:#f5f6f2;font-size:30px;width:44px;height:44px}
        .panel h2{font-size:11px;text-transform:uppercase;letter-spacing:.14em;margin:0 0 9px;padding-bottom:9px;border-bottom:1px solid #ffffff30;color:#e8ebe8}
        .groups{display:grid;gap:22px}.group.is-current h2{color:#c8f531;border-color:#c8f53170}.group.is-current .links a[aria-current=page]{background:#c8f531;color:#101318}
        .links{display:grid;grid-template-columns:1fr;gap:2px}.links a{color:#f5f6f2;text-decoration:none;display:flex;align-items:center;gap:12px;padding:8px 10px;min-height:42px;font-size:13px;border-radius:9px}.links a:hover{background:#ffffff17}
        .icon{width:34px;height:34px;flex:none;display:grid;place-items:center;color:#f5f6f2}.icon svg{width:27px;height:27px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}.links a[aria-current=page] .icon{color:#101318}.settings{margin-top:24px;padding-top:20px;border-top:1px solid #ffffff30}.setting{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:14px 0;font-size:12px}
        .choices{display:flex;border:1px solid #ffffff38;border-radius:10px;padding:3px;gap:2px}.choices button,.choices a{display:block;border:0;border-radius:7px;background:transparent;color:#f5f6f2;padding:7px 9px;min-width:40px;font-size:11px;text-align:center;text-decoration:none}.choices [aria-pressed=true]{background:#f5f6f2;color:#101318}
        .panel a:focus-visible,.panel button:focus-visible{outline-color:#c8f531}
        @media(max-width:1120px){.section{display:none}}
        @media(max-width:760px){.shell{width:calc(100% - 32px)}.row{height:70px;gap:10px;min-width:0}.brand{min-width:0}.brand img{width:min(188px,52vw);max-width:100%}.section{display:none}.quick{display:none}.toggle{margin-left:auto;white-space:nowrap;padding:10px 12px;min-height:44px}.backdrop{inset:70px 0 0}.panel{top:70px;width:min(400px,100vw);padding:22px 24px calc(36px + env(safe-area-inset-bottom))}.links{grid-template-columns:1fr}.links a{min-height:44px;font-size:14px}.groups{gap:25px}}
        @media(max-width:360px){.shell{width:calc(100% - 24px)}.brand img{width:min(170px,51vw)}.panel{padding-inline:20px}}
        :host([theme="dark"]) header img{filter:invert(1) brightness(1.08)}
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
      root.innerHTML = `<style>${styles(t)}</style><header><div class="shell"><div class="row"><a class="brand" href="/" aria-label="Vision Universe Startseite"><img src="/assets/vision-universe-logo.png" alt="Vision Universe"></a><span class="section">${inDiscover?'Discover':'Entdecken. Verstehen. Investieren.'}</span><nav class="quick" aria-label="Direktzugriff"><a href="/dashboard/">Dashboard</a><a href="/screener/">Screener</a><a href="/news/">News</a><a href="/quant/">Quant</a></nav><button class="toggle" type="button" aria-label="Menü öffnen" aria-controls="site-panel" aria-expanded="false">☰ Menü</button></div></div></header><div class="backdrop"></div><nav class="panel" id="site-panel" aria-label="Vision Universe Menü" aria-hidden="true"><div class="panel-head"><a href="/"><img src="/assets/vision-universe-logo.png" alt="Vision Universe"></a><button class="close" type="button" aria-label="Menü schließen">×</button></div><div class="groups"></div><div class="settings"><h2>Einstellungen</h2><div class="setting"><span>Währung</span><div class="choices currency" role="group" aria-label="Anzeigewährung"></div></div><div class="setting"><span>Darstellung</span><div class="choices appearance" role="group" aria-label="Darstellung"></div></div></div></nav>`;
      const host=root.querySelector('.groups');
      groups.forEach(([heading,entries])=>{
        const section=document.createElement('section');section.className='group';
        const title=document.createElement('h2');title.textContent=heading;section.append(title);
        const links=document.createElement('div');links.className='links';
        entries.forEach(([label,href,glyph])=>{
          const a=document.createElement('a');a.href=href;
          const icon=document.createElement('span');icon.className='icon';icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg viewBox="0 0 24 24">'+(iconPaths[glyph]||iconPaths['◇'])+'</svg>';
          a.append(icon,document.createTextNode(label));
          const url=new URL(href,location.href);
          const active=url.pathname===location.pathname && (url.hash ? (url.hash==='#/' ? !location.hash||location.hash==='#/' : location.hash.startsWith(url.hash)) : true);
          if(active)a.setAttribute('aria-current','page');
          if(url.pathname===location.pathname)section.classList.add('is-current');
          links.append(a);
        });
        section.append(links);host.append(section);
      });
      const syncActive=()=>{
        host.querySelectorAll('.links a').forEach(a=>{
          const url=new URL(a.href),collection=location.hash.startsWith('#/c/');
          const rowId=collection?location.hash.split('/')[3]:null;
          const theme=globalThis.VUDiscover?.Views?.Themes?.byRow(rowId);
          const parent=theme?'#/welten':'#/strategien';
          const active=url.pathname===location.pathname&&(collection?url.hash===parent:url.hash?(url.hash==='#/'?!location.hash||location.hash==='#/':location.hash.startsWith(url.hash)):true);
          if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
        });
      };
      root.querySelectorAll('.quick a').forEach(a=>{if(location.pathname.startsWith(a.getAttribute('href')))a.setAttribute('aria-current','page');});
      const panel=root.querySelector('.panel'),button=root.querySelector('.toggle');panel.inert=true;
      const close=()=>{this.removeAttribute('open');panel.inert=true;panel.setAttribute('aria-hidden','true');button.setAttribute('aria-expanded','false');button.setAttribute('aria-label','Menü öffnen');};
      button.onclick=()=>{if(this.hasAttribute('open')){close();return;}syncActive();this.setAttribute('open','');panel.inert=false;panel.removeAttribute('aria-hidden');button.setAttribute('aria-expanded','true');button.setAttribute('aria-label','Menü schließen');root.querySelector('.close').focus();};
      root.querySelector('.close').onclick=()=>{close();button.focus();};root.querySelector('.backdrop').onclick=close;
      panel.addEventListener('click',event=>{if(event.target.closest('a'))close();});
      root.addEventListener('keydown',event=>{
        if(!this.hasAttribute('open'))return;
        if(event.key==='Escape'){close();button.focus();return;}
        if(event.key==='Tab'){
          const nodes=[...panel.querySelectorAll('a,button:not(:disabled)')],first=nodes[0],last=nodes[nodes.length-1];
          if(event.shiftKey&&root.activeElement===first){event.preventDefault();last.focus();}
          else if(!event.shiftKey&&root.activeElement===last){event.preventDefault();first.focus();}
        }
      });
      this.renderSettings();
      document.addEventListener('vu-currency-change',()=>this.renderSettings());
      document.addEventListener('vu-fx-ready',()=>this.renderSettings());
      document.addEventListener('vu-theme-change',()=>this.renderSettings());
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
      const theme=window.VUDiscover&&window.VUDiscover.theme;
      for(const [mode,label] of [['light','Hell'],['dark','Dunkel']]){
        if(!theme){const a=document.createElement('a');a.href='/discover/#/settings';a.textContent=label;appearance.append(a);continue;}
        const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-pressed',String(theme.mode()===mode));b.onclick=()=>{theme.set(mode);this.renderSettings();};appearance.append(b);
      }
      if(focusGroup&&focusLabel){const group=focusGroup.includes('currency')?currency:focusGroup.includes('appearance')?appearance:null;const target=group&&[...group.querySelectorAll('button,a')].find(n=>n.textContent===focusLabel);if(target)target.focus();}
    }
  }
  customElements.define('vu-navigation', VisionNavigation);
})();
