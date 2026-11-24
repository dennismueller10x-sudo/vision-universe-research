#!/usr/bin/env node
// Nimmt die Maerkte-Uebersicht (#/maerkte) auf: die echte Renderfunktion
// D.V3.maerkte (discover/ui/v3.js) laeuft in Chromium (Playwright) mit den
// echten Marktdaten des Repos; geladen wird aus dem Dateisystem, es gibt keinen
// Server und keine Attrappe der Ansicht. Das Ergebnis ist ein Mitschnitt, gegen
// den discover/tests/browser-qa-maerkte-uebersicht.test.mjs die Pruefungen aus
// scripts/discover/maerkte-uebersicht.mjs laufen laesst.
// Usage: node scripts/discover/record-maerkte-fixture.mjs [--out discover/tests/fixtures/maerkte-v3.html]
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const i=process.argv.indexOf('--out');
const out=path.resolve(root,i<0?'discover/tests/fixtures/maerkte-v3.html':process.argv[i+1]);
const SKRIPTE=['assets/vu-ui.js','assets/vu-chart.js',
 'quant/engines/realtime/market-hours.js','quant/engines/realtime/trading-session.js','quant/engines/realtime/intraday-snapshot.js','quant/engines/realtime/freshness.js','quant/engines/realtime/source-state.js',
 ...['fx-provider-registry','fx-rates','fx-freshness','currency-registry','currency-class','currency-engine','money-format','currency-preference','currency-contract','currency-switch','bootstrap'].map(n=>'quant/engines/fx/'+n+'.js'),
 'quant/engines/multi-asset/asset-taxonomy.js','quant/engines/realtime/session-profiles.js','quant/engines/realtime/asset-freshness.js','quant/api/multi-asset-contract.js',
 'discover/ui/markets.js','discover/ui/v3.js'];
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:390,height:844}});
const fehler=[];page.on('pageerror',e=>fehler.push(String(e)));
await page.exposeFunction('__lesen',async p=>{const f=path.join(root,p);if(!f.startsWith(root)||!fs.existsSync(f))throw new Error('404 '+p);return fs.readFileSync(f,'utf8');});
await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
await page.evaluate(()=>{window.QuantShell={loadJSON:async p=>JSON.parse(await window.__lesen(p))};window.VUDiscover={};});
for(const s of SKRIPTE)await page.addScriptTag({content:fs.readFileSync(path.join(root,s),'utf8')});
const html=await page.evaluate(async()=>{
 const wurzel=document.getElementById('root');
 const kalender=await window.QuantShell.loadJSON('/quant/config/market-calendar.json').catch(()=>null);
 await window.VUDiscover.V3.maerkte(wurzel,{calendar:kalender,isActive:()=>true});
 return wurzel.innerHTML;
});
await browser.close();
if(fehler.length)throw new Error('Seitenfehler beim Aufnehmen: '+fehler.join(' | '));
if(!/dv3-mrow/.test(html))throw new Error('Keine Marktzeilen aufgenommen');
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,html);
console.log('aufgenommen: '+path.relative(root,out)+' ('+html.length+' Zeichen, '+(html.match(/dv3-mrow /g)||[]).length+' Zeilen)');
