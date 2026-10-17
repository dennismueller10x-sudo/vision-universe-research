// Landing-only header behavior; the concept composition stays calm.
// No PWA, access gate, account, storage or product runtime is loaded.
document.addEventListener('DOMContentLoaded',()=>{
  const head=document.getElementById('lp-head');
  const onScroll=()=>head.classList.toggle('scrolled',window.scrollY>24);
  window.addEventListener('scroll',onScroll,{passive:true});onScroll();
});
