// Release packaging only (Ladezeit 21.11.2026): die Vorschau der ersten Folie "Heute im Blick" im Platzhalter der
// Discover-Startseite. Auswahl und Texte kommen aus derselben reinen Engine wie die Laufzeit
// (discover/engines/reihen.js#heroPreview, benutzt von discover/ui/reihen.js). Die Vorschau zeigt nur Kuerzel, Name und
// Untertitel - nie Kurs oder Prozent, damit kein veralteter Wert erscheint. reihen.js ersetzt sie durch die echte Folie.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
const Reihen=createRequire(import.meta.url)('../../discover/engines/reihen.js');
export const PLACEHOLDER='<section class="dr-sec dr-bb dp-hero dp-hero--wait" data-static aria-label="Heute im Blick"><p class="v2-load-state" role="status">Aktien werden geladen …</p></section>';
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function previewHtml(p){
 const tile=/^[A-Z][A-Z0-9.\-]{0,9}$/.test(p.symbol)?' data-t="'+esc(p.symbol)+'"':'';
 return '<section class="dr-sec dr-bb dp-hero dp-hero--wait dp-hero--preview" data-static aria-label="Heute im Blick"><p class="vu-visually-hidden" role="status">Aktien werden geladen …</p>'+
  '<div class="dp-hero__body"><div class="dr-bb__id dp-hero__id"><span class="vu-logo-tile vu-logo-tile--xl"'+tile+' aria-hidden="true">'+esc(String(p.symbol).slice(0,5))+'</span><div><h2'+(p.long?' class="dp-long"':'')+'>'+esc(p.name)+'</h2><p>'+esc(p.sub)+'</p></div></div></div></section>';
}
/** Ersetzt den Platzhalter; ohne Vorschau (keine Karte) bleibt der Platzhalter unveraendert. */
export function applyHeroPreview(html,p){
 if(!p)return html;
 if(!html.includes(PLACEHOLDER))throw Error('DISCOVER_HERO_PLACEHOLDER_MISSING');
 return html.replace(PLACEHOLDER,previewHtml(p));
}
/** Dieselben Dateien wie die Laufzeit: meta.json -> erster Chunk der Startseite (Flaeche "hero") und Reihe "im-blick". */
export async function heroPreviewFromData(root,universe='US_REAL'){
 const read=async p=>JSON.parse(await readFile(resolve(root,p.replace(/^\//,'')),'utf8'));
 const meta=await read('/discover/data/meta.json');
 const entry=(meta.home||[]).find(x=>x.universeId===universe);
 const chunk=entry&&entry.chunks&&entry.chunks[0]?await read(entry.chunks[0]).catch(()=>null):null;
 const hero=chunk&&(chunk.surfaces||[]).find(s=>s.type==='hero')||null;
 const row=await read('/discover/data/rows/'+universe+'/im-blick.json').catch(()=>null);
 return Reihen.heroPreview(hero,row);
}
export async function writeDiscoverHeroPreview({root,output}){
 const page=resolve(output,'discover/index.html'),p=await heroPreviewFromData(root).catch(()=>null);
 if(!p)return {state:'NO_PREVIEW'};
 await writeFile(page,applyHeroPreview(await readFile(page,'utf8'),p));
 return {state:'WRITTEN',symbol:p.symbol};
}
