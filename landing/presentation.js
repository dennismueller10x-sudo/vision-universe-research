// Same motion preference and header behavior as the Research homepage.
// No PWA, access gate, account, storage or product runtime is loaded.
try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.classList.add('intro');}catch{}
document.addEventListener('DOMContentLoaded',()=>{
  const head=document.getElementById('lp-head');
  const onScroll=()=>head.classList.toggle('scrolled',window.scrollY>24);
  window.addEventListener('scroll',onScroll,{passive:true});onScroll();
});
