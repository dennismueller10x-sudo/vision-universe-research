// Isolated adaptation of Research assets/home/home-motion.js, steps.deck.
// Only an explicit user action moves a card. No network, storage or analytics.
(() => {
  'use strict';
  const preview = document.querySelector('.discover-preview');
  if (!preview) return;
  const deck = preview.querySelector('.deck');
  const cards = [...deck.querySelectorAll('.card')];
  const feedback = preview.querySelector('[data-preview-feedback]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const saved = new Set();
  let order = cards.slice(), drag = null, busy = false, timer;
  const setBusy = value => {
    busy = value;
    deck.setAttribute('aria-busy',String(value));
    preview.querySelectorAll('[data-preview-swipe]').forEach(button=>{button.disabled=value;});
  };
  const layout = () => order.forEach((card, i) => {
    card.style.zIndex = String(100 - i);
    card.style.transform = `translateY(${Math.min(i,2)*9}px) scale(${1-Math.min(i,2)*.045})`;
    card.style.opacity = i < 3 ? '1' : '0';
    card.setAttribute('aria-hidden', String(i !== 0));
    card.classList.toggle('top', i === 0);
    card.classList.remove('liked', 'noped');
  });
  const move = direction => {
    if (busy || drag) return;
    const card = order[0];
    setBusy(true);
    if (direction > 0) saved.add(card.dataset.symbol);
    feedback.textContent = `${card.querySelector('.cname').textContent} ${direction > 0 ? 'gemerkt' : 'weitergewischt'}. ${saved.size} in dieser Vorschau gemerkt.`;
    card.classList.add(direction > 0 ? 'liked' : 'noped');
    card.style.transform = `translate(${direction*140}%, -6%) rotate(${direction*22}deg)`;
    card.style.opacity = '0';
    timer = setTimeout(() => {
      order.push(order.shift());
      card.style.transition = 'none';
      layout();
      void card.offsetWidth;
      card.style.transition = '';
      setBusy(false);
    }, reduced.matches ? 0 : 420);
  };
  const cancel = () => {
    if (!drag) return;
    const {card,pointer} = drag;
    drag = null;
    if (card.hasPointerCapture(pointer)) card.releasePointerCapture(pointer);
    card.style.transition = '';
    layout();
  };
  deck.addEventListener('pointerdown', event => {
    if (busy || drag || !event.isPrimary || event.button !== 0 || !order[0].contains(event.target)) return;
    const card = order[0];
    drag = {card,pointer:event.pointerId,x:event.clientX,y:event.clientY,dx:0};
    card.setPointerCapture(event.pointerId);
    card.style.transition = 'none';
  });
  deck.addEventListener('pointermove', event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    const dx = event.clientX-drag.x, dy = event.clientY-drag.y;
    // Leave vertical gestures to the page; a canceled scroll never saves.
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 12) { cancel(); return; }
    drag.dx = dx;
    drag.card.style.transform = `translate(${dx}px,${dy*.3}px) rotate(${dx/14}deg)`;
    drag.card.classList.toggle('liked',dx > 30);
    drag.card.classList.toggle('noped',dx < -30);
  });
  deck.addEventListener('pointerup', event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    const dx = drag.dx;
    cancel();
    if (Math.abs(dx) > 65) move(dx > 0 ? 1 : -1);
  });
  deck.addEventListener('pointercancel', cancel);
  deck.addEventListener('lostpointercapture', cancel);
  // Research's decorative Hero tilt must not move controls under the pointer.
  preview.addEventListener('pointerenter',()=>{preview.closest('.stage').style.transform='';});
  preview.addEventListener('mousemove',event=>event.stopPropagation());
  preview.addEventListener('click', event => {
    const button = event.target.closest('[data-preview-swipe]');
    if (button) move(button.dataset.previewSwipe === 'right' ? 1 : -1);
  });
  preview.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1);
  });
  preview.querySelector('[data-preview-reset]').addEventListener('click', () => {
    cancel(); clearTimeout(timer); setBusy(false);
    saved.clear(); order = cards.slice();
    cards.forEach(card => { card.style.transition = ''; });
    layout(); feedback.textContent = '0 in dieser Vorschau gemerkt.';
  });
  layout();
  setBusy(false);
  deck.tabIndex = 0;
  preview.previousElementSibling.hidden = true; // Original module view without JS.
  preview.hidden = false;
})();
