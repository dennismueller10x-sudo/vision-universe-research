// Original product assets in a purely illustrative coming-soon iPhone.
export const modules=[
  ['discover','Discover'],['quant','Quant'],['screener','Screener'],
  ['supertrader','Supertrader'],['elliott','Elliott Wave'],['technical','Technische Analyse'],
  ['fundamental','Fundamentaldaten'],['vorsorge','Vorsorge'],['hedgefonds','Hedgefonds'],['atlas','AI Atlas'],
];
export function presentationSymbols(source){
  const icons=[...source.matchAll(/<symbol id="(?:i|h)-[^\"]+"[\s\S]*?<\/symbol>/g)].map(m=>m[0]);
  if(!icons.some(s=>s.includes('id="h-atlas"')))throw Error('Originales AI-Atlas-Icon fehlt');
  return '<svg width="0" height="0" style="position:absolute" aria-hidden="true">\n'+icons.join('\n')+'\n</svg>';
}
const grid=()=>`<div class="module-launch-grid">${modules.map(([icon,label])=>`<div class="module-tile"><svg aria-hidden="true"><use href="${icon==='atlas'?'#h-atlas':'./assets/product-icons.svg#'+icon}"/></svg><span>${label}</span></div>`).join('')}</div>`;
export function timelessHero(){
  return `<section class="hero" id="hero" aria-labelledby="hero-title">
  <div class="shell hero-grid"><div class="hero-copy">
    <span class="hero-badge">App bald verfügbar</span>
    <h1 id="hero-title">Investieren mit <em>Weitblick.</em> <span class="claim-second">Alles in einer App.</span></h1>
  </div>
  <div class="device-frame" role="img" aria-label="Ausblick auf die kommende iPhone-App: Discover, Quant, Screener, Supertrader, Elliott Wave, Technische Analyse, Fundamentaldaten, Vorsorge, Hedgefonds und AI Atlas.">
    <div class="phone" aria-hidden="true"><div class="screen">
      <div class="app-top"><img src="./assets/vision-universe-logo.png" alt=""><span class="app-menu"></span></div>
      ${grid()}
      <span class="phone-home"></span>
    </div></div>
  </div></div>
</section>`;
}
