// Central navigation for every page. Add new menu entries only here.
(() => {
  const items = [
    ['News', '/news/'],
    ['Dashboard', '/dashboard/'], ['Guide', '/guide/'], ['ETF', '/etf/'],
    ['Hedgefonds', '/hedgefonds/'], ['Analysten', '/analysten/'], ['Macro', '/macro/'],
    ['Magazin', '/magazin/'], ['Morning', '/morning/'], ['Reports', '/reports/xpeng/']
  ];
  class VisionNavigation extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      const root = this.attachShadow({mode: 'open'});
      root.innerHTML = `<style>
        :host{display:block;position:fixed;inset:0 0 auto;z-index:1000000;color:#111;font:400 14px Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;text-align:left}
        *{box-sizing:border-box}header{background:rgba(255,255,255,.96);backdrop-filter:blur(18px);border-bottom:1px solid rgba(0,0,0,.07)}
        .shell{width:min(1400px,calc(100% - 64px));margin:auto}.row{height:88px;display:flex;align-items:center;justify-content:space-between;gap:32px}
        .brand{flex-shrink:0;display:flex;align-items:center}img{display:block;width:310px;max-width:30vw;height:auto}
        nav{display:flex;align-items:center;min-width:0;overflow-x:auto;margin-left:auto;scrollbar-width:thin}
        nav a{flex-shrink:0;color:#111;text-decoration:none;text-transform:uppercase;white-space:nowrap;font-size:12px;font-weight:700;letter-spacing:.08em;padding:12px 13px;border-left:1px solid #e5e5e2}
        nav a:first-child{border-left:0}a:hover{text-decoration:underline;text-underline-offset:7px}a:focus-visible,button:focus-visible{outline:2px solid #111;outline-offset:4px}
        button{display:none;flex-shrink:0;border:0;background:#050505;color:#fff;width:44px;height:44px;border-radius:50%;cursor:pointer}button span{display:block;width:17px;height:1px;background:#fff;margin:4px auto}
        @media(max-width:1100px){.shell{width:calc(100% - 42px)}img{width:240px}nav{display:none}button{display:block}nav.open{display:flex;position:absolute;top:88px;left:0;right:0;max-height:calc(100dvh - 88px);overflow:auto;flex-direction:column;align-items:stretch;background:#fff;padding:0 21px 18px;border-bottom:1px solid #ddd}nav a{border:0;border-top:1px solid #e5e5e2;padding:16px 0}}
        @media(max-width:760px){.shell{width:calc(100% - 32px)}.row{height:70px}img{width:190px;max-width:66vw}nav.open{top:70px;max-height:calc(100dvh - 70px)}}
      </style><header><div class="shell"><div class="row"><a class="brand" href="/" aria-label="Vision Universe Startseite"><img src="/assets/vision-universe-logo.png" alt="Vision Universe"></a><nav id="menu" aria-label="Hauptnavigation"></nav><button type="button" aria-label="Navigation öffnen" aria-controls="menu" aria-expanded="false"><span></span><span></span><span></span></button></div></div></header>`;
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
