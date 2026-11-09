/* Rendert alle Folien aus VU.slides. Telefone: Rahmen 390 × 844, lange Seiten scrollen im Rahmen. */
(function () {
'use strict';
const VU = window.VU, { ic, HDR, DOCK, WORLDS } = VU;
const esc = s => String(s == null ? '' : s).replace(/&(?![a-z#0-9]+;)/gi, '&amp;');
const frameNeu = id => {
  const s = VU.screens[id];
  if (!s) return `<div class="phone missing"><div class="frame"><p>Screen „${id}“ fehlt</p></div></div>`;
  const h = Math.max(844, s.h || 844), dk = s.dk ? ' dk' : '';
  const top = (s.nosb ? '' : `<div class="sb"><span>9:41</span><i>●●● ▮</i></div>`) + (s.hdr === false || s.nosb ? '' : HDR(s.world, { dk: s.dk }));
  const padTop = s.nosb ? 0 : (s.hdr === false ? 50 : 104);
  const dock = s.dock === false || s.dock == null && s.world === 'start' ? '' : DOCK(s.world, s.dock == null ? 0 : s.dock);
  return `<div class="phone${s.dk ? ' pdk' : ''}"><div class="frame" data-h="${h}"><div class="scroller"><div class="sizer"><div class="scr${dk}" style="height:${h}px"><div class="bd${s.nopad ? ' nopad' : ''}" style="padding-top:${padTop + (s.nopad ? 0 : 6)}px;height:${h}px">${s.body || ''}</div></div></div></div>${top ? `<div class="layer lt-top"><div class="scrl${dk}">${top}</div></div>` : ''}${dock ? `<div class="layer lt-bot"><div class="scrl${dk} bot">${dock}<div class="home-ind"></div></div></div>` : `<div class="layer lt-bot"><div class="scrl${dk} bot nobg"><div class="home-ind"></div></div></div>`}${s.overlay ? `<div class="layer lt-full"><div class="scrl${dk} full">${s.overlay}</div></div>` : ''}${h > 844 ? '<span class="scrollhint">↕</span>' : ''}</div></div>`;
};
const frameNow = id => `<div class="phone shotp"><div class="frame now"><div class="scroller"><img src="now/${id}.jpg" alt="Aufnahme ${id}" loading="lazy"></div><span class="scrollhint">↕</span></div></div>`;
const specBox = sp => { if (!sp) return ''; const col = (t, a) => a && a.length ? `<div><h4>${t}</h4><ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''; return `<div class="spec">${col('Aufbau neu (von oben nach unten)', sp.aufbau)}${col('Bausteine', sp.komponenten)}${col('Daten', sp.daten)}${col('Entfällt / ändert sich', sp.weg)}</div>`; };
let n = 0;
const out = VU.slides.map((s, i) => {
  if (s.t === 'chapter') return `<section class="slide dark chapter" id="${s.anchor || 'k' + i}" data-ch="${esc(s.title)}"><div class="inner"><div class="big">${s.n}</div><div>${s.icon ? `<div class="hudbig">${ic(s.icon, 64)}</div>` : ''}<h2>${esc(s.title)}</h2><p class="was">${s.was || ''}</p>${s.pages ? `<p class="pages">${s.pages}</p>` : ''}</div></div></section>`;
  n++;
  if (s.t === 'html') return `<section class="slide${s.dark ? ' dark' : ''}" id="${s.anchor || s.id || 'p' + i}"><div class="inner">${s.id ? `<div class="sh"><span class="pid">${s.id}</span><h2>${esc(s.title)}</h2>${s.sub ? `<p class="sub">${s.sub}</p>` : ''}</div>` : ''}${s.html()}</div></section>`;
  const neu = s.neu || [];
  const w = neu.length <= 2 ? 270 : neu.length === 3 ? 240 : 210;
  return `<section class="slide${s.dark ? ' dark' : ''}" id="${s.id || 'p' + i}"><div class="inner"><div class="sh"><span class="pid">${s.id || ''}</span><h2>${esc(s.title)}</h2>${s.route ? `<code class="route">${esc(s.route)}${s.newRoute && s.newRoute !== s.route ? ` → ${esc(s.newRoute)}` : ''}</code>` : ''}${s.sub ? `<p class="sub">${s.sub}</p>` : ''}</div><div class="row">${s.now ? `<div class="grp"><div class="lbl"><span class="tag now">HEUTE</span></div><div class="devs"><figure class="dev" style="--w:${w}px">${frameNow(s.now)}<figcaption>Ganze Seite, im Rahmen scrollbar</figcaption></figure></div></div><div class="vs">→</div>` : ''}${neu.length ? `<div class="grp"><div class="lbl"><span class="tag neu">NEU</span></div><div class="devs">${neu.map(([id, c]) => `<figure class="dev" style="--w:${w}px">${frameNeu(id)}<figcaption>${c || ''}</figcaption></figure>`).join('')}</div></div>` : ''}</div>${specBox(s.spec)}</div></section>`;
}).join('');
document.getElementById('deck').innerHTML = out;
document.querySelectorAll('[data-frame]').forEach(el => { el.outerHTML = frameNeu(el.dataset.frame); });

/* Inhaltsverzeichnis im Deckblatt */
const toc = document.getElementById('toc');
if (toc) toc.innerHTML = [...document.querySelectorAll('section.chapter')].map(c => `<a href="#${c.id}">${c.dataset.ch}</a>`).join('');

function fit() {
  document.querySelectorAll('.frame').forEach(f => {
    const k = f.clientWidth / 390; if (!k) return;
    const scr = f.querySelector('.sizer > .scr');
    if (scr) { scr.style.transform = `scale(${k})`; f.querySelector('.sizer').style.height = (+f.dataset.h * k) + 'px'; }
    f.querySelectorAll('.layer > div').forEach(l => { l.style.transform = `scale(${k})`; });
  });
}
new ResizeObserver(fit).observe(document.body); fit();
window.addEventListener('load', fit);

const slides = [...document.querySelectorAll('#deck > section')];
const pg = document.getElementById('pg'); let cur = 0;
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { cur = slides.indexOf(e.target); pg.textContent = (cur + 1) + ' / ' + slides.length; } }), { rootMargin: '-45% 0px -54% 0px' });
slides.forEach(s => io.observe(s)); pg.textContent = '1 / ' + slides.length;
const go = d => slides[Math.max(0, Math.min(slides.length - 1, cur + d))].scrollIntoView({ block: 'start' });
document.getElementById('prev').onclick = () => go(-1);
document.getElementById('next').onclick = () => go(1);
document.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(1); } if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1); } });
})();
