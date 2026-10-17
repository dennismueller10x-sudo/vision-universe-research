// Landing-only header behavior; the concept composition stays calm.
// No PWA, access gate, account, storage or product runtime is loaded.
document.addEventListener('DOMContentLoaded',()=>{
  const head=document.getElementById('lp-head');
  const onScroll=()=>head.classList.toggle('scrolled',window.scrollY>24);
  window.addEventListener('scroll',onScroll,{passive:true});onScroll();
});

// Native scroll-snap gallery. Inner Discover gestures keep their own scope.
document.addEventListener('DOMContentLoaded',()=>{
  const track=document.getElementById('product-track');if(!track)return;
  const cards=[...track.querySelectorAll('.product-card')];
  const controls=document.querySelector('.product-controls');
  const previous=controls.querySelector('[data-product-prev]'),next=controls.querySelector('[data-product-next]');
  const position=controls.querySelector('.product-position');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let current=0,queued=false;
  const update=()=>{
    queued=false;
    const overflow=track.scrollWidth>track.clientWidth+2;
    controls.hidden=!overflow;track.tabIndex=overflow?0:-1;
    const left=track.getBoundingClientRect().left;
    current=overflow&&track.scrollLeft>=track.scrollWidth-track.clientWidth-1?cards.length-1:cards.reduce((best,card,i)=>Math.abs(card.getBoundingClientRect().left-left)<Math.abs(cards[best].getBoundingClientRect().left-left)?i:best,0);
    previous.disabled=track.scrollLeft<=1;
    next.disabled=track.scrollLeft>=track.scrollWidth-track.clientWidth-1;
    const label=`${current+1} / ${cards.length}`;
    if(position.textContent!==label)position.textContent=label;
  };
  const move=index=>track.scrollTo({left:cards[Math.max(0,Math.min(cards.length-1,index))].offsetLeft,behavior:reduced.matches?'auto':'smooth'});
  previous.addEventListener('click',()=>move(current-1));next.addEventListener('click',()=>move(current+1));
  track.addEventListener('scroll',()=>{if(!queued){queued=true;requestAnimationFrame(update);}},{passive:true});
  track.addEventListener('keydown',event=>{
    if(event.target!==track||event.altKey||event.ctrlKey||event.metaKey)return;
    const index=({ArrowLeft:current-1,ArrowRight:current+1,Home:0,End:cards.length-1})[event.key];
    if(index===undefined)return;event.preventDefault();move(index);
  });
  if('ResizeObserver' in window)new ResizeObserver(update).observe(track);else window.addEventListener('resize',update,{passive:true});
  update();
});
