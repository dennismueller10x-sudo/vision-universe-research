// Timeless presentation of existing modules. No financial snapshots or values.
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

export function timelessHero(hero){
  // Preserve original device shells, dimensions, motion and the existing orbit.
  const browser=`<div class="browser"><div class="browser-bar"><i></i><i></i><i></i><span>Vision Universe · Modulvorschau</span></div><div class="desk"><div class="desk-side"><b>Module</b><span class="on">Übersicht</span><span>Discover</span><span>Quant</span><span>Technik</span><span>Fundamental</span></div><div class="desk-main">${home(true)}</div></div></div>`;
  const phone=`<div class="phone"><div class="screen"><div class="app-status"><span>9:41</span><span>●●● ▮</span></div><div class="app-top"><img src="./assets/vision-universe-logo.png" alt=""><span class="app-avatar"><svg><use href="#i-spark"/></svg></span></div>${home()}</div></div>`;
  const start=hero.indexOf('<div class="stage"');
  const orbit=hero.indexOf('<div class="orbit"',start);
  if(start<0||orbit<0)throw Error('Originale Gerätebühne fehlt.');
  const stageOpening=hero.slice(start,hero.indexOf('>',start)+1);
  return (hero.slice(0,start)+stageOpening+'\n      '+browser+'\n      '+phone+'\n      '+hero.slice(orbit))
    .replace('<b>12 Geschäftsjahre</b><small>Fundamentaldaten aus SEC-Berichten</small>','<b>Fundamental</b><small>Unternehmen verstehen</small>');
}
