// Belege: docs/reports/ci-laufzeit-20261110.md; docs/reports/ci-laufzeit-20261110-belege.json
// Wait for the shell whose geometry is measured, rather than unrelated market
// requests, polling and a fixed half-second delay on every route and reload.
export async function shellReady(page) {
 await page.waitForFunction(async()=>{
  const head=document.querySelector('vu-navigation')?.shadowRoot;
  const dock=document.getElementById('vu-dock')?.shadowRoot;
  if(!head?.querySelector('header') || !dock?.querySelector('nav'))return false;
  await document.fonts.ready;
  return ![head,dock].some(root=>root.getAnimations().some(a=>a.playState==='running'||a.playState==='pending'));
 },null,{timeout:15000});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
