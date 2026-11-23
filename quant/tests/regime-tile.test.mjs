import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {quantHomeRegimeHtml,REGIME_PATH} from '../../scripts/vu2/quant-home-preview.mjs';
import {isFastData} from '../../scripts/ci/intraday-fastpath.mjs';
const RT=createRequire(import.meta.url)('../engines/regime-tile.js');
const fx=f=>readFileSync(new URL('./fixtures/regime-tile/'+f,import.meta.url),'utf8'),src=f=>readFileSync(new URL('../../'+f,import.meta.url),'utf8');
const regime=JSON.parse(fx('market-regime.json'));
test('Golden: die Engine liefert Byte für Byte den Text, den pages.js#home vor der Auslagerung selbst gebaut hat',()=>{
 /* golden-host.txt: regimeHost.innerHTML der App auf dem Stand vor der Änderung (Setter-Mitschnitt im Browser, Daten = market-regime.json). */
 assert.equal(RT.hostHtml(regime),fx('golden-host.txt'));
});
test('Nicht verfügbare Lage: keine Kachel, keine Vorschau',()=>{
 assert.equal(RT.hostHtml(null),null);assert.equal(RT.hostHtml({state:'UNAVAILABLE'}),null);
 assert.equal(quantHomeRegimeHtml({...regime,state:'UNAVAILABLE'}),null);assert.equal(quantHomeRegimeHtml({...regime,asOf:'gestern'}),null);assert.equal(quantHomeRegimeHtml(null),null);
});
test('Vorschau = Engine auf denselben Daten, das Datum der Datei steht sichtbar darin',()=>{
 const html=quantHomeRegimeHtml(regime);
 assert.equal(html,RT.hostHtml(regime));
 assert.ok(html.includes('Stand '+RT.dateDe(regime.asOf)),'Stand der Vorschau = Stand in market-regime-v1.json');
 assert.ok(html.includes(RT.REGIME[regime.regime]));
});
test('esc und dateDe der Engine verhalten sich wie VUUI.esc und X.dateDe',()=>{
 const fn=(file,name)=>new Function(src(file).match(new RegExp('  function '+name+'\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}'))[0]+';return '+name+';')();
 const esc=fn('assets/vu-ui.js','esc'),dateDe=fn('quant/app/ui.js','dateDe');
 for(const s of ['a&b','<x>','"q"',"it's",null,undefined,12,''])assert.equal(RT.esc(s),esc(s));
 for(const s of ['2026-11-20','2026-11-20T10:00:00Z','',null,'x'])assert.equal(RT.dateDe(s),dateDe(s));
});
test('Vorschau kann nicht gegen die App-Daten altern: market-regime-v1.json liegt nicht im Schnellweg (jede Änderung = voller Bau)',()=>{
 const QP='quant'+'/data/product/';
 assert.equal(REGIME_PATH,QP+'market-regime-v1.json');
 assert.equal(isFastData(REGIME_PATH),false);
 assert.equal(isFastData(QP+'radar-home-v1.json.gz'),false);
});
test('Verdrahtung: Release-Bau schreibt VUQuantHomeRegime in den Frühstart, stock-boot setzt sie ein, index.html lädt die Engine vor pages.js',()=>{
 assert.match(src('scripts/vu2/build-release.mjs'),/globalThis\.VUQuantHomeRegime='\+JSON\.stringify\(homeRegime\)/);
 assert.match(src('quant/app/stock-boot.js'),/w\.VUQuantHomeRegime[\s\S]{0,120}id='qp-heute'[\s\S]{0,80}innerHTML=w\.VUQuantHomeRegime/);
 const html=src('quant/index.html');assert.ok(html.indexOf('/quant/engines/regime-tile.js')>0&&html.indexOf('/quant/engines/regime-tile.js')<html.indexOf('/quant/app/pages.js'));
});
