// Company labels/descriptions from Research's #swipe. No market snapshots.
const examples = [
  ['AMD', 'Advanced Micro Devices', 'Prozessoren und Grafikchips', 'h-quant'],
  ['AAPL', 'Apple', 'iPhone, Mac und App Store', 'h-swipe'],
  ['MSFT', 'Microsoft', 'Windows, Office und die Cloud Azure', 'h-globe'],
];

export function discoverPreview() {
  return `<div class="discover-preview" hidden aria-label="Discover-Swipe-Vorschau">
    <div class="app-h"><b>Swipen statt suchen.</b><span>Discover</span></div>
    <p class="discover-intro" id="discover-help">Links weiter · rechts merken</p>
    <div class="deck" id="discover-deck" role="group" aria-label="Beispielunternehmen zum Swipen" aria-describedby="discover-help">
      ${examples.map(([symbol,name,description,icon])=>`<article class="card" data-symbol="${symbol}" aria-label="${name}">
        <div class="card-top"><span class="tk">${symbol}</span><span class="cbadge">Beispiel</span></div>
        <b class="cname">${name}</b><small class="cwhat">${description}</small>
        <div class="discover-card-art" aria-hidden="true"><span class="hud"><svg><use href="#${icon}"/></svg></span></div>
        <div class="card-meta"><span>Unternehmen entdecken</span><span>Discover</span></div>
        <span class="stamp like" aria-hidden="true">MERKEN</span><span class="stamp nope" aria-hidden="true">WEITER</span>
      </article>`).join('')}
    </div>
    <div class="deck-actions"><button type="button" class="deck-btn no" data-preview-swipe="left" aria-label="Nächstes Beispielunternehmen">✕</button><span class="deck-hint">Ziehen oder tippen</span><button type="button" class="deck-btn yes" data-preview-swipe="right" aria-label="Beispielunternehmen merken"><svg aria-hidden="true"><use href="#i-heart"/></svg></button></div>
    <div class="discover-tray"><p class="discover-feedback" role="status" aria-live="polite" aria-atomic="true"><span data-preview-feedback>0 in dieser Vorschau gemerkt.</span></p><button type="button" class="discover-reset" data-preview-reset>Zurücksetzen</button></div>
    <p class="discover-disclaimer">Bedienvorschau · keine Kursdaten.<br>Merkliste nur bis zum Neuladen.</p>
  </div>`;
}
