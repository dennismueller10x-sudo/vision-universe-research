// Central navigation for every page. Add new menu entries only here.
(() => {
  const items = [
    ['News', '/news/'], ['Quant', '/quant/'], ['Dashboard', '/dashboard/'],
    ['ETF', '/etf/'], ['Hedgefonds', '/hedgefonds/'], ['Analysten', '/analysten/'],
    ['Macro', '/macro/'], ['Magazin', '/magazin/'], ['Reports', '/reports/xpeng/'],
    ['Academy', '/academy/'], ['Guide', '/guide/'], ['Morning', '/morning/'], ['Budget', '/budget/']
  ];
  const discoverItems = [
    ['Start', '/discover/#/'], ['Welten', '/discover/#/welten'],
    ['Entdecken', '/discover/#/einzeln/US_REAL'], ['Suchen', '/discover/#/suche'],
    ['Watchlist', '/discover/#/watchlist']
  ];
  /* Farbschema des Headers. `light` ist und bleibt der Standard fuer jede
     Vision-Universe-Seite; `dark` setzt ausschliesslich, wer das Attribut
     theme="dark" an <vu-navigation> schreibt - derzeit nur /discover/, wo
     der helle Balken ueber der dunklen Flaeche ein Bruch waere.
     Geaendert werden NUR Farbwerte: Menue, Links, Logik und Markup bleiben
     fuer alle Seiten identisch. */
  const THEMES = {
    light: {
      bg: 'rgba(255,255,255,.96)', border: 'rgba(0,0,0,.07)', ink: '#111',
      divider: '#e5e5e2', burgerBg: '#050505', burgerInk: '#fff',
      panelBg: '#fff', panelBorder: '#ddd', outline: '#111'
    },
    dark: {
      bg: 'rgba(8,8,10,.92)', border: 'rgba(255,255,255,.10)', ink: '#f4f4f1',
      divider: 'rgba(255,255,255,.12)', burgerBg: '#f4f4f1', burgerInk: '#08080a',
      panelBg: '#0d0d11', panelBorder: 'rgba(255,255,255,.12)', outline: '#f4f4f1'
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
        .panel{position:fixed;right:0;top:88px;bottom:0;width:min(420px,100vw);padding:24px 26px calc(24px + env(safe-area-inset-bottom));overflow-y:auto;background:${t.panelBg};border-left:1px solid ${t.panelBorder};box-shadow:-20px 20px 70px #0004;visibility:hidden;transform:translateX(100%);transition:transform .2s,visibility .2s}
        :host([open]) .backdrop,:host([open]) .panel{visibility:visible;opacity:1;transform:none}
        .panel-head{display:flex;align-items:center;justify-content:space-between}.panel-head img{width:180px}.close{border:0;background:transparent;color:${t.ink};font-size:30px;width:44px;height:44px}
        h2{font-size:11px;text-transform:uppercase;letter-spacing:.12em;margin:20px 0 8px;padding-bottom:10px;border-bottom:1px solid ${t.divider}}
        .links{display:grid;grid-template-columns:1fr 1fr;gap:2px 12px}.links.discover{grid-template-columns:1fr}.links a{color:${t.ink};text-decoration:none;display:flex;align-items:center;gap:12px;padding:9px 6px;min-height:42px;font-size:14px;border-radius:8px}.links a:hover,.links a[aria-current=page]{background:${t.divider}}
        .icon{width:20px;flex:none;text-align:center;font-size:18px}.settings{margin-top:18px;padding-top:8px;border-top:1px solid ${t.divider}}.setting{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:10px 0;font-size:12px}
        .choices{display:flex;border:1px solid ${t.divider};border-radius:10px;padding:3px;gap:2px}.choices button,.choices a{display:block;border:0;border-radius:7px;background:transparent;color:${t.ink};padding:7px 9px;min-width:40px;font-size:11px;text-align:center;text-decoration:none}.choices [aria-pressed=true]{background:${t.ink};color:${t.panelBg}}
        @media(max-width:760px){.shell{width:calc(100% - 32px)}.row{height:70px;gap:9px}img{width:154px;max-width:47vw}.section{padding-left:9px;font-size:11px}.quick{display:none}.toggle{margin-left:auto}.backdrop{inset:70px 0 0}.panel{top:70px;padding:16px 20px calc(30px + env(safe-area-inset-bottom))}}
        :host([theme="dark"]) img{filter:invert(1) brightness(1.08)}
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
      root.innerHTML = `<style>${styles(t)}</style><header><div class="shell"><div class="row"><a class="brand" href="/" aria-label="Vision Universe Startseite"><img src="/assets/vision-universe-logo.png" alt="Vision Universe"></a><span class="section">${inDiscover?'Discover':'Entdecken. Verstehen. Investieren.'}</span><nav class="quick" aria-label="Direktzugriff"><a href="/discover/">Discover</a><a href="/news/">News</a><a href="/quant/">Quant</a></nav><button class="toggle" type="button" aria-label="Menü öffnen" aria-controls="site-panel" aria-expanded="false">☰ Menü</button></div></div></header><div class="backdrop"></div><nav class="panel" id="site-panel" aria-label="Vision Universe Menü" aria-hidden="true"><div class="panel-head"><a href="/"><img src="/assets/vision-universe-logo.png" alt="Vision Universe"></a><button class="close" type="button" aria-label="Menü schließen">×</button></div><h2>Discover</h2><div class="links discover"></div><h2>Vision Universe</h2><div class="links products"></div><div class="settings"><div class="setting"><span>Währung</span><div class="choices currency" role="group" aria-label="Anzeigewährung"></div></div><div class="setting"><span>Darstellung</span><div class="choices appearance" role="group" aria-label="Darstellung"></div></div></div></nav>`;
      const icons = ['⌂','◎','☑','⌕','♡','▤','⌁','▧','◫','♙','◇','≋','▤','▣','✧','◈','☼','▥'];
      let iconIndex = 0;
      const addLinks = (selector, entries) => {
        const host = root.querySelector(selector);
        for (const [label, href] of entries) {
          const a = document.createElement('a'); a.href = href;
          const icon = document.createElement('span');icon.className='icon';icon.setAttribute('aria-hidden','true');icon.textContent=icons[iconIndex++]||'◇';
          a.append(icon,document.createTextNode(label));
          if (href.includes('#/') ? (inDiscover && location.hash === href.slice(href.indexOf('#'))) : location.pathname.startsWith(href)) a.setAttribute('aria-current','page');
          host.append(a);
        }
      };
      addLinks('.discover',discoverItems);addLinks('.products',items);
      const syncCurrent=()=>{
        root.querySelectorAll('.discover a').forEach(a=>{
          const hash=a.hash,active=inDiscover&&(location.hash||'#/')===hash;
          if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
        });
        root.querySelectorAll('.quick a').forEach(a=>{
          if(location.pathname.startsWith(a.getAttribute('href')))a.setAttribute('aria-current','page');
        });
      };
      syncCurrent();window.addEventListener('hashchange',syncCurrent);
      const panel=root.querySelector('.panel'),button=root.querySelector('.toggle');panel.inert=true;
      const close=()=>{this.removeAttribute('open');panel.inert=true;panel.setAttribute('aria-hidden','true');button.setAttribute('aria-expanded','false');button.setAttribute('aria-label','Menü öffnen');};
      button.onclick=()=>{if(this.hasAttribute('open')){close();return;}this.setAttribute('open','');panel.inert=false;panel.removeAttribute('aria-hidden');button.setAttribute('aria-expanded','true');button.setAttribute('aria-label','Menü schließen');root.querySelector('.close').focus();};
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
      const currency=root.querySelector('.currency'),appearance=root.querySelector('.appearance');currency.replaceChildren();appearance.replaceChildren();
      const layer=window.VUFx&&window.VUFx.layer,preference=layer&&layer.preference;
      for(const code of ['EUR','USD']){
        if(!preference){const a=document.createElement('a');a.href='/discover/#/settings';a.textContent=code;currency.append(a);continue;}
        const b=document.createElement('button');b.type='button';b.textContent=code;b.setAttribute('aria-pressed',String(preference.get()===code));
        b.onclick=async()=>{if(preference.get()===code)return;b.disabled=true;try{if(code!=='EUR'&&window.VUFx.Bootstrap)await window.VUFx.Bootstrap.ensureCurrency(code);layer.setDisplayCurrency(code);}catch(_){b.disabled=false;}this.renderSettings();};currency.append(b);
      }
      const theme=window.VUDiscover&&window.VUDiscover.theme;
      for(const [mode,label] of [['system','System'],['light','Hell'],['dark','Dunkel']]){
        if(!theme){const a=document.createElement('a');a.href='/discover/#/settings';a.textContent=label;appearance.append(a);continue;}
        const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-pressed',String(theme.mode()===mode));b.onclick=()=>{theme.set(mode);this.renderSettings();};appearance.append(b);
      }
    }
  }
  customElements.define('vu-navigation', VisionNavigation);
})();
