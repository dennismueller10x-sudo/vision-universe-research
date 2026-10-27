// Partner presentation: scroll progress, reveal, in-view video playback and
// optional greeting via ?fuer=<key>. Greetings come only from this list, so a
// crafted link cannot place arbitrary text on the page.
(() => {
  const GROUPS = {
    'arbeitskreis-boerse': 'den Arbeitskreis Börse Mannheim',
    'skyline-investment-club': 'den Skyline Investment Club',
    'koelner-boersenverein': 'den Kölner Börsenverein',
    'boersenkreis-halle': 'den Akademischen Börsenkreis Halle',
    'boersenverein-chemnitz': 'den Studentischen Börsenverein Chemnitz',
    'bfs-society': 'die BFS Society Tübingen',
    'bvh': 'den Bundesverband der Börsenvereine',
    'dsw': 'die DSW'
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const slides = [...document.querySelectorAll('.slide')];

  const key = new URLSearchParams(location.search).get('fuer');
  if (key && Object.hasOwn(GROUPS, key)) {
    const greeting = document.querySelector('[data-greeting]');
    greeting.textContent = '— Produktvorstellung für ' + GROUPS[key];
    const subject = 'Frühzugang Vision Universe – ' + GROUPS[key].replace(/^(den|die|das) /, '');
    for (const link of document.querySelectorAll('[data-mail]')) {
      link.href = 'mailto:info@visionuniverse.de?subject=' + encodeURIComponent(subject);
    }
  }

  const total = document.querySelector('[data-total]');
  const count = document.querySelector('[data-count]');
  const bar = document.querySelector('.progress span');
  if (total) total.textContent = String(slides.length).padStart(2, '0');
  let ticking = false;
  const update = () => {
    ticking = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, scrollY / max) : 0) + ')';
    const mid = innerHeight * 0.45;
    let current = 0;
    slides.forEach((s, i) => { if (s.getBoundingClientRect().top <= mid) current = i; });
    if (count) count.textContent = String(current + 1).padStart(2, '0');
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, {passive: true});
  addEventListener('resize', update);
  update();

  if (!reduce && 'IntersectionObserver' in window) {
    const targets = document.querySelectorAll('.wrap > *, .split > *, .grid > *');
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }, {rootMargin: '0px 0px -8% 0px'});
    targets.forEach(t => { t.classList.add('reveal'); io.observe(t); });
  }

  const videos = [...document.querySelectorAll('.phone video')];
  const buttons = [...document.querySelectorAll('.sound')];
  const play = v => { const p = v.play(); if (p) p.catch(() => {}); };
  const setSound = (button, on) => {
    button.setAttribute('aria-pressed', String(on));
    button.textContent = on ? 'Ton aus' : 'Ton an';
  };
  if ('IntersectionObserver' in window) {
    const vo = new IntersectionObserver(entries => {
      for (const e of entries) {
        const v = e.target;
        if (e.isIntersecting && (!reduce || !v.muted)) play(v);
        else if (!e.isIntersecting) v.pause();
      }
    }, {threshold: 0.5});
    videos.forEach(v => vo.observe(v));
  }
  for (const button of buttons) {
    const video = button.parentElement.querySelector('video');
    button.addEventListener('click', () => {
      const on = video.muted;
      videos.forEach(v => { if (v !== video) v.muted = true; });
      buttons.forEach(b => { if (b !== button) setSound(b, false); });
      video.muted = !on;
      if (on) { video.currentTime = 0; play(video); }
      setSound(button, on);
    });
    video.addEventListener('click', () => { if (video.paused) play(video); else video.pause(); });
  }
})();
