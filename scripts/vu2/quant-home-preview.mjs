// Release-Bau (Ladezeit 23.11.2026, Entscheidung Steuerung Option C): die Marktlage-Kachel der Quant-Startseite als fertiger
// Text im Fruehstart, vor dem 1,38-MB-Buendel. Der Text kommt aus DERSELBEN reinen Funktion wie in der App
// (quant/engines/regime-tile.js#hostHtml, benutzt von quant/app/pages.js#home); gelesen wird dieselbe Datei wie zur Laufzeit.
// market-regime-v1.json liegt unter quant/data/product/, nicht in den Schnellweg-Verzeichnissen (scripts/ci/intraday-fastpath.mjs
// FAST_DIRS): jede Aenderung der Datei loest einen vollen Bau aus, die Vorschau altert nicht gegen die App-Daten.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
const RegimeTile=createRequire(import.meta.url)('../../quant/engines/regime-tile.js');
export const REGIME_PATH='quant/data/product/market-regime-v1.json';
/** Text fuer #qp-heute oder null (Datei fehlt/ungueltig/nicht AVAILABLE): dann bleibt es beim bisherigen Platzhalter. */
export function quantHomeRegimeHtml(regime){
 if(!regime||regime.state!=='AVAILABLE'||!/^\d{4}-\d{2}-\d{2}$/.test(String(regime.asOf||'')))return null;
 const html=RegimeTile.hostHtml(regime);
 return typeof html==='string'&&html.includes('qk2-regime')?html:null;
}
export async function readQuantHomeRegime(root){
 const doc=JSON.parse(await readFile(resolve(root,REGIME_PATH),'utf8').catch(()=>'null'));
 return quantHomeRegimeHtml(doc);
}
