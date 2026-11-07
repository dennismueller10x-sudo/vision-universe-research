// The existing access gate uses document.open(): listeners installed on the
// original document cannot observe events from the unlocked replacement page.
// Wait for real pending network hydration and then exact consumer DOM markers.
export async function waitForHydratedConsumer(page,{companyId,generatedAt,timeout=15000}){
 await page.waitForLoadState('networkidle',{timeout});
 await page.waitForFunction(({companyId,generatedAt})=>{
  const chapter=document.querySelector('.ci-company-intelligence');
  return document.querySelector('#v2-main')?.getAttribute('aria-busy')==='false'&&chapter?.dataset.state==='AVAILABLE'&&chapter.dataset.companyId===companyId&&chapter.dataset.generatedAt===generatedAt&&chapter.getAttribute('aria-busy')==='false';
 },{companyId,generatedAt},{timeout});
 // Seit Discover D09 (04.11.2026) steht das Kapitel in der zugeklappten Profi-Ansicht
 // „Alle Kennzahlen“ (details.dv3-profi). Wie ein Nutzer wird sie geoeffnet, damit sichtbarer
 // Text (innerText, :visible) geprueft wird und nicht nur vorhandene Knoten.
 await openEnclosingDetails(page);
}
// Fuer QAs, die nicht ueber waitForHydratedConsumer laufen: Kapitel abwarten (im DOM, auch
// zugeklappt), dann die umschliessende Profi-Ansicht wie ein Nutzer oeffnen (Discover D09).
export async function openCompanyIntelligence(page,{timeout=30000}={}){
 await page.waitForSelector('.ci-company-intelligence',{state:'attached',timeout});
 await openEnclosingDetails(page);
}
export async function openEnclosingDetails(page){
 const closed=page.locator('details:not([open]):has(.ci-company-intelligence) > summary');
 for(let n=await closed.count();n>0;n=await closed.count())await closed.first().click();
}
