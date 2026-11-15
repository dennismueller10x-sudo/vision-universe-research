// Grundgerüst des Prototyps: Stil, Bausteine, Verhalten
const K = require('./kit.js');
const fs = require('fs');
const REPO = '/home/user/vision-universe-research';
const sprite = fs.readFileSync(REPO + '/assets/product-icons.svg', 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace('<svg xmlns="http://www.w3.org/2000/svg">', '<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0" aria-hidden="true">');
const base = K.css.replace(/@font-face\{[^}]*\}/g, '').replace(/body\{[^}]*\}/, '').replace(/\.top\{[^}]*\}/, '').replace(/\.dock[^{]*\{[^}]*\}/g, '');

const css = `
@font-face{font-family:Inter;src:url(fonts/inter-latin.woff2) format("woff2");font-weight:100 900;font-display:swap}
html,body{margin:0;height:100%;background:#0a0a0b;color:#f4f5f1;font:500 15px/1.35 Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer;text-align:inherit}
${base}
.stage{display:flex;height:100%;justify-content:center}
.phone{position:relative;width:100%;max-width:430px;height:100%;background:#000;overflow:hidden}
.view{position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;padding:56px 0 104px;scrollbar-width:none;display:none}
.view::-webkit-scrollbar{display:none}
.view.on{display:block}
.view.bleed{padding-top:0}
.px{padding-left:14px;padding-right:14px}
.hdr{position:absolute;left:0;right:0;top:0;height:56px;display:flex;align-items:center;gap:8px;padding:0 12px;z-index:5;transition:background .25s}
.hdr.solid{background:rgba(0,0,0,.82);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.mod{display:flex;align-items:center;gap:8px;height:38px;padding:0 12px 0 6px;border-radius:99px;background:rgba(20,20,22,.7);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);font-weight:800;font-size:16px;letter-spacing:-.02em}
.mod .mi{width:28px;height:28px;border-radius:9px;background:#0e1013;border:1px solid rgba(200,245,49,.35);display:grid;place-items:center;color:#c8f531}
.hb{width:38px;height:38px;border-radius:99px;background:rgba(20,20,22,.7);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:grid;place-items:center;flex:none}
.live{display:flex;align-items:center;gap:6px;height:38px;padding:0 11px;border-radius:99px;background:rgba(20,20,22,.7);font-size:12px;font-weight:800;color:#c3c7cc}
.live i{width:7px;height:7px;border-radius:9px;background:#c8f531;box-shadow:0 0 8px #c8f531}
.dock{position:absolute;left:10px;right:10px;bottom:10px;height:68px;border-radius:28px;background:rgba(12,12,13,.92);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.14);display:flex;align-items:center;padding:0 6px;z-index:6}
.dock button{flex:1;height:56px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-size:10.5px;font-weight:700;color:#a1a7af;border-radius:20px}
.dock button.on{color:#c8f531}
.dock .uni{flex:none;width:62px;height:62px;border-radius:99px;background:#c8f531;color:#101318;margin:-22px 6px 0;box-shadow:0 0 0 6px #000,0 8px 30px rgba(200,245,49,.35)}
.tabs2{position:sticky;top:0;z-index:4;display:flex;gap:6px;padding:8px 14px;overflow-x:auto;scrollbar-width:none;background:linear-gradient(#000 70%,transparent)}
.tabs2::-webkit-scrollbar{display:none}
.tab{height:36px;padding:0 15px;border-radius:99px;background:#151516;font-weight:700;font-size:14px;display:inline-flex;align-items:center;white-space:nowrap;flex:none}
.tab.on{background:#fff;color:#000}
.rail{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x proximity;padding:0 14px;margin:0;scrollbar-width:none}
.rail::-webkit-scrollbar{display:none}
.rail>*{scroll-snap-align:start;flex:none}
.sh{display:flex;align-items:baseline;justify-content:space-between;padding:0 14px;margin:26px 0 10px}
.sh h2{font-size:22px}
.sh span{font-size:13px;font-weight:700;color:#a1a7af}
.lg{width:44px;height:44px;border-radius:13px;padding:7px}
.lg.s{width:34px;height:34px;border-radius:10px;padding:5px}.lg.b{width:60px;height:60px;border-radius:18px;padding:9px}.lg.x{width:76px;height:76px;border-radius:22px;padding:12px}
.tile{background:#151516;border-radius:22px;padding:14px;display:block;width:100%}
.tile.fl{display:flex}
.mod{white-space:nowrap}
.kb{display:none;background:#fff;color:#000;font-weight:900;font-size:15px}
.tile:active,.tap:active{transform:scale(.97)}
.tile,.tap{transition:transform .12s}
.cover{position:relative;overflow:hidden;border-radius:22px;display:block}
.cover img{width:100%;height:100%;object-fit:cover;display:block}
.cover .sc{position:absolute;inset:0;background:linear-gradient(transparent 30%,rgba(0,0,0,.92))}
.cover .ct2{position:absolute;left:12px;right:12px;bottom:11px}
.sheetbg{position:absolute;inset:0;background:rgba(0,0,0,.6);opacity:0;pointer-events:none;transition:opacity .25s;z-index:8}
.sheetbg.on{opacity:1;pointer-events:auto}
.sheet{position:absolute;left:0;right:0;bottom:0;max-height:90%;background:#151516;border-radius:30px 30px 0 0;transform:translateY(102%);transition:transform .32s cubic-bezier(.2,.9,.25,1);z-index:9;display:flex;flex-direction:column}
.sheet.on{transform:none}
.grab{width:44px;height:5px;border-radius:9px;background:#3a3a3d;margin:10px auto 6px;flex:none}
.shc{overflow-y:auto;padding:6px 16px 26px;scrollbar-width:none}
.shc::-webkit-scrollbar{display:none}
.sheet .card,.sheet .tile{background:#202022}
.toast{position:absolute;left:50%;bottom:96px;transform:translate(-50%,20px);background:#fff;color:#000;font-weight:800;font-size:13px;padding:10px 16px;border-radius:99px;opacity:0;transition:all .25s;z-index:10;white-space:nowrap;pointer-events:none}
.toast.on{opacity:1;transform:translate(-50%,0)}
.kbtn{position:absolute;left:14px;bottom:88px;height:34px;padding:0 13px;border-radius:99px;background:#fff;color:#000;font-weight:800;font-size:12.5px;z-index:7;display:none;align-items:center;gap:6px;box-shadow:0 6px 24px rgba(0,0,0,.6)}
.act{position:sticky;bottom:-104px;display:none}
.hm{display:grid;gap:3px}
.hm b{height:26px;border-radius:6px;display:block}
.seg2{display:flex;height:14px;border-radius:9px;overflow:hidden;gap:2px}
.seg2 i{display:block;height:100%}
.gl{box-shadow:0 0 0 1px rgba(200,245,49,.5),0 0 28px rgba(200,245,49,.18)}
.end{margin:28px 14px 0;text-align:center}
.end a,.lk{color:#a1a7af;font-size:12.5px;font-weight:700;text-decoration:underline;text-underline-offset:3px}
@keyframes up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.view.on>*{animation:up .45s both}
.view.on>*:nth-child(2){animation-delay:.05s}.view.on>*:nth-child(3){animation-delay:.1s}.view.on>*:nth-child(4){animation-delay:.15s}
@keyframes grow{from{transform:scaleX(0)}to{transform:none}}
.bar i,.gr{transform-origin:left;animation:grow .9s cubic-bezier(.2,.8,.2,1) both}
/* Schreibtisch: Handy links, Konzept rechts */
.notes{display:none}
@media(min-width:900px){
 .stage{gap:56px;align-items:center;padding:24px 40px;box-sizing:border-box}
 .phone{flex:none;width:400px;height:min(860px,calc(100vh - 48px));border-radius:46px;border:8px solid #232325;box-shadow:0 30px 120px rgba(200,245,49,.08)}
 .notes{display:block;width:520px;max-height:calc(100vh - 48px);overflow-y:auto;scrollbar-width:thin}
 .kbtn{display:none!important}
}
@media(max-width:899px){.kb{display:grid}}
.notes h1{font-size:40px;margin:0 0 10px}
.nt{border-top:1px solid #262626;padding:16px 0;cursor:pointer;opacity:.5;transition:opacity .2s}
.nt.on,.nt:hover{opacity:1}
.nt h3{font-size:19px;display:flex;align-items:center;gap:10px}
.nt h3 span{flex:1}
.nt ul{margin:8px 0 0;padding-left:18px;color:#c3c7cc;font-size:14.5px;line-height:1.45;display:none}
.nt.on ul{display:block}
.nt li{margin:3px 0}
.dec{background:#c8f531;color:#101318;border-radius:22px;padding:18px 20px;margin:14px 0 6px}
.dec h3{font-size:19px}.dec p{font-size:14.5px;line-height:1.45;margin-top:6px;font-weight:600}
`;

const TI = {
  ki: '<circle cx="12" cy="12" r="2.600"/><path d="M12 9.400V4M12 20v-5.400M9.700 10.700 5 8M19 16l-4.700-2.700M14.300 10.700 19 8M5 16l4.700-2.700"/><circle cx="12" cy="3" r="1.300"/><circle cx="12" cy="21" r="1.300"/><circle cx="4" cy="7.500" r="1.300"/><circle cx="20" cy="16.500" r="1.300"/><circle cx="20" cy="7.500" r="1.300"/><circle cx="4" cy="16.500" r="1.300"/>',
  chips: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.500" y="9.500" width="5" height="5" rx="1"/><path d="M9 6V3M15 6V3M9 21v-3M15 21v-3M6 9H3M6 15H3M21 9h-3M21 15h-3"/>',
  kern: '<ellipse cx="12" cy="12" rx="9.500" ry="3.800"/><ellipse cx="12" cy="12" rx="9.500" ry="3.800" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9.500" ry="3.800" transform="rotate(120 12 12)"/><circle cx="12" cy="12" r="1.600" fill="currentColor"/>',
  raum: '<path d="M12 2.500c3.500 3 4.500 7.500 3.500 12h-7c-1-4.500 0-9 3.500-12z"/><circle cx="12" cy="9" r="1.800"/><path d="M8.500 13 5 17l3.500-.500M15.500 13 19 17l-3.500-.500M10.500 17.500 12 21.500l1.500-4"/>',
  cyber: '<path d="M12 2.500 20 5.500v6c0 5-3.400 8.400-8 10-4.600-1.600-8-5-8-10v-6z"/><path d="M8.500 12l2.500 2.500 4.500-5"/>',
  markt: '<path d="M4 20V11M9.300 20V5M14.700 20v-7M20 20V8"/>'
};
const tic = (k, s = 24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.700" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TI[k]}</svg>`;
const ic = (id, s = 20) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#${id}"/></svg>`;
const logo = (t, cls = '') => `<img class="lg ${cls}" src="img/l-${t}.png" alt="${t}">`;
const I = K.I, line = K.line, ring = K.ring, bars = K.bars, chg = K.chg;
const st = (t, sub = '') => `data-sheet="stock" data-t="${t}"`;
const sh = (t, more = '', attr = '') => `<div class="sh"><h2>${t}</h2>${more ? `<button class="tap" ${attr}><span>${more} ›</span></button>` : ''}</div>`;
// Poster einer Aktie mit Kurslinie
const poster = (t, n, c, seed, tr = 0.6, extra = '') => `<button class="tile tap" style="width:128px;padding:12px" data-sheet="stock" data-t="${t}" data-n="${n}">${logo(t)}<div class="b8 mt8" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${n}</div><div class="mt8">${line(seed, 104, 38, tr, 30, { dot: false, sw: 2, fill: tr > 0 })}</div><div class="mt8">${chg(c)}</div>${extra}</button>`;
const end = (t, go, sub) => `<div class="px" style="margin-top:28px"><button class="tile tap gl fl g12" style="padding:18px" data-go="${go}"><div class="f1"><div class="eb l">Weiter</div><h2 class="mt4" style="font-size:22px">${t}</h2><div class="sm mut mt4">${sub}</div></div><div class="rnd l" style="width:46px;height:46px">${I.chev}</div></button></div><div class="end"><button class="lk" data-sheet="hinweise">Daten &amp; Hinweise</button></div>`;

const js = `
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const M={home:['Home','layers'],discover:['Discover','discover'],aktie:['Aktie','chartbild'],quant:['Quant','quant'],supertrader:['Supertrader','supertrader'],news:['News','insights'],ich:['Ich','layers'],technical:['Technical','technical'],fundamental:['Fundamental','fundamental'],hedgefonds:['Hedgefonds','hedgefonds'],screener:['Screener','screener']};
let cur='home';const pos={};
function go(id,keep){if(!M[id])return;closeSheet();const o=$('#v-'+cur);if(o){pos[cur]=o.scrollTop;o.classList.remove('on');}cur=id;const v=$('#v-'+id);v.classList.add('on');v.scrollTop=keep?(pos[id]||0):0;
 $('#modn').textContent=M[id][0];$('#modi').innerHTML='<svg width="18" height="18"><use href="#'+M[id][1]+'"/></svg>';
 $$('.dock button').forEach(b=>b.classList.toggle('on',b.dataset.go===id));$$('.nt').forEach(n=>n.classList.toggle('on',n.dataset.n===id));
 const n=$('.nt.on');if(n&&n.scrollIntoView)n.scrollIntoView({block:'nearest',behavior:'smooth'});
 hdr();try{history.replaceState(null,'','#'+id)}catch(e){location.hash=id}}
function hdr(){const v=$('#v-'+cur);$('.hdr').classList.toggle('solid',v.scrollTop>24||!v.classList.contains('bleed'))}
function openSheet(id,d){const t=$('#sh-'+id);if(!t){toast('Im Prototyp noch nicht ausgebaut');return;}const c=$('.shc');c.innerHTML=t.innerHTML;c.scrollTop=0;
 if(d&&d.t){$$('[data-f=logo]',c).forEach(e=>e.src='img/l-'+d.t+'.png');$$('[data-f=name]',c).forEach(e=>e.textContent=d.n||d.t);$$('[data-f=tick]',c).forEach(e=>e.textContent=d.t);}
 $('.sheet').classList.add('on');$('.sheetbg').classList.add('on');}
function closeSheet(){$('.sheet').classList.remove('on');$('.sheetbg').classList.remove('on');}
let tt;function toast(m){const t=$('.toast');t.textContent=m;t.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('on'),1800);}
document.addEventListener('click',e=>{const el=e.target.closest('[data-go],[data-sheet],[data-close],[data-toast],[data-pick],[data-heart],[data-tabg],[data-seg]');if(!el)return;
 if(el.dataset.pick!==undefined){const q=el.closest('[data-quiz]');$$('[data-pick]',q).forEach(x=>x.classList.add(x.dataset.pick==='1'?'ok':'no'));$$('.rev',q).forEach(x=>x.style.display='block');return;}
 if(el.dataset.heart!==undefined){el.classList.toggle('l');toast(el.classList.contains('l')?'Auf der Watchlist':'Entfernt');return;}
 if(el.dataset.seg){const g=el.closest('[data-segs]');$$('[data-seg]',g).forEach(x=>x.classList.toggle('on',x===el));$$('[data-pane]',g).forEach(x=>x.style.display=x.dataset.pane===el.dataset.seg?'block':'none');return;}
 if(el.dataset.tabg!==undefined){$$('.tab',el.parentNode).forEach(x=>x.classList.toggle('on',x===el));const a=el.dataset.tabg&&$('#'+el.dataset.tabg);if(a){const v=$('#v-'+cur);v.scrollTo({top:a.offsetTop-52,behavior:'smooth'});}return;}
 if(el.dataset.close!==undefined){closeSheet();return;}
 if(el.dataset.toast){toast(el.dataset.toast);return;}
 if(el.dataset.sheet){openSheet(el.dataset.sheet,el.dataset);return;}
 if(el.dataset.go){go(el.dataset.go);}});
$$('.view').forEach(v=>v.addEventListener('scroll',hdr,{passive:true}));
let sy=null;$('.grab').addEventListener('pointerdown',e=>{sy=e.clientY});window.addEventListener('pointerup',e=>{if(sy!==null&&e.clientY-sy>30)closeSheet();sy=null});
const h=(location.hash||'').slice(1);go(M[h]?h:'home');
`;
module.exports = { css, js, sprite, TI, tic, ic, logo, I, line, ring, bars, chg, sh, poster, end, REPO };
