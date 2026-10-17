// Timeless presentation of existing modules. No financial snapshots or values.
import {discoverPreview} from './discover-preview.mjs';
export const modules=[
  ['discover','Discover'],['quant','Quant'],['screener','Screener'],
  ['super','Supertrader'],['elliott','Elliott Wave'],['technical','Technik'],
  ['fundamental','Fundamental'],['vorsorge','Vorsorge'],['atlas','AI Atlas'],
];
const grid=()=>`<div class="module-launch-grid">${modules.map(([icon,label])=>`<div class="module-tile"><span class="hud hud-sm"><svg><use href="#h-${icon}"/></svg></span><span>${label}</span></div>`).join('')}</div>`;
const home=(desktop=false)=>`<div class="module-home${desktop?' module-home-desktop':''}"><h2 class="module-heading">Alles in <em>einer App.</em></h2>${grid()}</div>`;

export function presentationSymbols(source){
  const icons=[...source.matchAll(/<symbol id="(?:i|h)-[^\"]+"[\s\S]*?<\/symbol>/g)].map(m=>m[0]);
  for(const[icon]of modules)if(!icons.some(s=>s.includes(`id="h-${icon}"`)))throw Error('Originales Modul-Icon fehlt: '+icon);
  return '<svg width="0" height="0" style="position:absolute" aria-hidden="true">\n'+icons.join('\n')+'\n</svg>';
}

const chrome=()=>`<div class="app-status" aria-hidden="true"><span>9:41</span><span>●●● ▮</span></div><div class="app-top" aria-hidden="true"><img src="./assets/vision-universe-logo.png" alt=""><span class="app-avatar"><svg><use href="#i-spark"/></svg></span></div>`;
const phone=(overview=false)=>`<div class="device-frame"${overview?' aria-hidden="true"':''}><div class="phone ${overview?'overview-phone':'discover-phone'}"><div class="screen">${chrome()}${home()}${overview?'':discoverPreview()}</div></div></div>`;

export function timelessHero(){
  // Own landing composition: hero, horizontal product gallery, then signup.
  // Icons/fonts still come from the explicitly pinned Research assets.
  return `<section class="hero" id="hero" aria-labelledby="hero-title">
  <div class="shell hero-grid"><div class="hero-copy">
    <span class="hero-badge"><b>Coming soon</b><span>Bald verfügbar</span></span>
    <h1 id="hero-title">Investieren mit <em>Weitblick.</em> <span class="claim-second">Alles in einer App.</span></h1>
    <p class="lead"><strong>Deine Research-Werkzeuge. Bald an einem Ort.</strong><br>Entdecke, was kommt – und erfahre im Newsletter, wann es losgeht.</p>
    <div class="hero-cta"><a class="btn btn-app btn-xl" href="#newsletter">Newsletter abonnieren <svg aria-hidden="true"><use href="#i-arrow"/></svg></a></div>
  </div></div>
</section>
<section class="products stage" id="produkte" aria-labelledby="products-title" aria-roledescription="Karussell">
  <div class="shell">
    <div class="product-heading"><div><span class="kicker">Die kommende App</span><h2 id="products-title">Das erwartet dich.</h2></div>
      <div class="product-controls" hidden><span class="product-position" role="status" aria-live="polite" aria-atomic="true">1 / 2</span><button class="gallery-button" type="button" data-product-prev aria-label="Vorherige Produktkachel" aria-controls="product-track" disabled><svg aria-hidden="true"><use href="#i-arrow"/></svg></button><button class="gallery-button" type="button" data-product-next aria-label="Nächste Produktkachel" aria-controls="product-track"><svg aria-hidden="true"><use href="#i-arrow"/></svg></button></div>
    </div>
    <div class="product-track" id="product-track" tabindex="0" role="group" aria-label="Produktvorschauen – horizontal blättern">
      <article class="product-card product-overview" data-product="overview" aria-label="1 von 2: Alles in einer App">
        <div class="product-card-copy"><span class="product-tag">Vision Universe App</span><h3>Alles in einer App.</h3><p>Deine Research-Werkzeuge. An einem Ort.</p></div>
        ${phone(true)}
      </article>
      <article class="product-card product-discover" data-product="discover" aria-label="2 von 2: Discover">
        <div class="product-card-copy"><span class="product-tag">Discover</span><h3>Swipen statt suchen.</h3><p>Unternehmen entdecken. Interessante Ideen merken.</p></div>
        ${phone()}
      </article>
    </div>
    <p class="preview-caption"><span>Konzeptansicht</span> Ein Vorgeschmack auf die App. Noch nicht verfügbar.</p>
  </div>
</section>`;
}
