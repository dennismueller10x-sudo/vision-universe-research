// The existing access gate uses document.open(): listeners installed on the
// original document cannot observe events from the unlocked replacement page.
// Wait for real pending network hydration and then exact consumer DOM markers.
export async function waitForHydratedConsumer(page,{companyId,generatedAt,timeout=15000}){
 await page.waitForLoadState('networkidle',{timeout});
 await page.waitForFunction(({companyId,generatedAt})=>{
  const chapter=document.querySelector('.ci-company-intelligence');
  return document.querySelector('#v2-main')?.getAttribute('aria-busy')==='false'&&chapter?.dataset.state==='AVAILABLE'&&chapter.dataset.companyId===companyId&&chapter.dataset.generatedAt===generatedAt&&chapter.getAttribute('aria-busy')==='false';
 },{companyId,generatedAt},{timeout});
}
