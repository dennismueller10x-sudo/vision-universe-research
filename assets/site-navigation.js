// Central navigation for every page. Add new menu entries only here.
(() => {
  const items = [
    ['News', '/news/'],
    ['Discover', '/discover/'],
    ['Quant', '/quant/'],
    ['Dashboard', '/dashboard/'], ['Guide', '/guide/'], ['ETF', '/etf/'],
    ['Hedgefonds', '/hedgefonds/'], ['Analysten', '/analysten/'], ['Macro', '/macro/'],
    ['Magazin', '/magazin/'], ['Morning', '/morning/'], ['Reports', '/reports/xpeng/'],
    ['Academy', '/academy/'], ['Budget', '/budget/']
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
      chipBg: '#f4f3ef', chipInk: '#34332f', chipBorder: 'rgba(17,17,17,.2)',
      divider: '#e5e5e2', burgerBg: '#050505', burgerInk: '#fff',
      panelBg: '#fff', panelBorder: '#ddd', outline: '#111'
    },
    dark: {
      bg: 'rgba(8,8,10,.92)', border: 'rgba(255,255,255,.10)', ink: '#f4f4f1',
      chipBg: 'rgba(255,255,255,.07)', chipInk: '#b9b9c2', chipBorder: 'rgba(255,255,255,.18)',
      divider: 'rgba(255,255,255,.12)', burgerBg: '#f4f4f1', burgerInk: '#08080a',
      panelBg: '#0d0d11', panelBorder: 'rgba(255,255,255,.12)', outline: '#f4f4f1'
    }
  };

  class VisionNavigation extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      const t = THEMES[this.getAttribute('theme') === 'dark' ? 'dark' : 'light'];
      const root = this.attachShadow({mode: 'open'});
      root.innerHTML = `<style>
        :host{display:block;position:fixed;inset:0 0 auto;z-index:1000000;color:${t.ink};font:400 14px Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;text-align:left}
        *{box-sizing:border-box}header{background:${t.bg};backdrop-filter:blur(18px);border-bottom:1px solid ${t.border}}
        .shell{width:min(1400px,calc(100% - 64px));margin:auto}.row{height:88px;display:flex;align-items:center;justify-content:space-between;gap:32px}
        .brand{flex-shrink:0;display:flex;align-items:center;gap:14px;text-decoration:none}img{display:block;width:310px;max-width:30vw;height:auto}
        .preview{display:inline-flex;align-items:center;min-height:26px;padding:5px 9px;border:1px solid ${t.chipBorder};border-radius:999px;background:${t.chipBg};color:${t.chipInk};font-size:9px;font-weight:800;line-height:1;letter-spacing:.13em;text-transform:uppercase;white-space:nowrap}
        nav{display:flex;align-items:center;min-width:0;overflow-x:auto;margin-left:auto;scrollbar-width:thin}
        nav a{flex-shrink:0;color:${t.ink};text-decoration:none;text-transform:uppercase;white-space:nowrap;font-size:12px;font-weight:700;letter-spacing:.08em;padding:12px 13px;border-left:1px solid ${t.divider}}
        nav a:first-child{border-left:0}a:hover{text-decoration:underline;text-underline-offset:7px}a:focus-visible,button:focus-visible{outline:2px solid ${t.outline};outline-offset:4px}
        button{display:none;flex-shrink:0;border:0;background:${t.burgerBg};color:${t.burgerInk};width:44px;height:44px;border-radius:50%;cursor:pointer}button span{display:block;width:17px;height:1px;background:${t.burgerInk};margin:4px auto}
        @media(max-width:1100px){.shell{width:calc(100% - 42px)}img{width:240px}nav{display:none}button{display:block}nav.open{display:flex;position:absolute;top:88px;left:0;right:0;max-height:calc(100dvh - 88px);overflow:auto;flex-direction:column;align-items:stretch;background:${t.panelBg};padding:0 21px 18px;border-bottom:1px solid ${t.panelBorder}}nav a{border:0;border-top:1px solid ${t.divider};padding:16px 0}}
        @media(max-width:760px){.shell{width:calc(100% - 32px)}.row{height:70px;gap:12px}.brand{gap:8px}img{width:154px;max-width:48vw}.preview{max-width:76px;padding:4px 7px;white-space:normal;text-align:center;font-size:7px;line-height:1.15}nav.open{top:70px;max-height:calc(100dvh - 70px)}}
              :host([theme="dark"]) img{filter:invert(1) brightness(1.08)}
      </style><header><div class="shell"><div class="row"><a class="brand" href="/" aria-label="Vision Universe Startseite — Development Preview"><img src="/assets/vision-universe-logo.png" alt="Vision Universe"><span class="preview" aria-label="Vision Universe — Development Preview">Development Preview</span></a><nav id="menu" aria-label="Hauptnavigation"></nav><button type="button" aria-label="Navigation öffnen" aria-controls="menu" aria-expanded="false"><span></span><span></span><span></span></button></div></div></header>`;
      const nav = root.querySelector('nav');
      for (const [label, href] of items) {
        const a = document.createElement('a'); a.href = href; a.textContent = label;
        if (location.pathname.startsWith(href)) a.setAttribute('aria-current', 'page');
        nav.append(a);
      }
      const button = root.querySelector('button');
      const close = () => {nav.classList.remove('open');button.setAttribute('aria-expanded','false');button.setAttribute('aria-label','Navigation öffnen');};
      button.addEventListener('click', () => {const open=nav.classList.toggle('open');button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'Navigation schließen':'Navigation öffnen');});
      root.addEventListener('keydown', event => {if(event.key==='Escape'){close();button.focus();}});
      nav.addEventListener('click', close);
    }
  }
  customElements.define('vu-navigation', VisionNavigation);
})();
