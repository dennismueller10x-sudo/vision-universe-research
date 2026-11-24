import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {leseUebersicht,pruefeUebersicht,PFLICHT} from '../../scripts/discover/maerkte-uebersicht.mjs';

/* Die Pruefungen der Maerkte-Uebersicht laufen gegen einen Mitschnitt der echten
   V3-Ansicht (discover/ui/v3.js auf den Repo-Marktdaten, aufgenommen mit
   scripts/discover/record-maerkte-fixture.mjs). Ohne Playwright/Chromium: uebersprungen. */
const require=createRequire(import.meta.url);
let chromium=null;try{({chromium}=require('playwright'));}catch{}
const html=fs.readFileSync(new URL('./fixtures/maerkte-v3.html',import.meta.url),'utf8');
let browser=null;
try{if(chromium)browser=await chromium.launch();}catch{browser=null;}
const skip=browser?false:'Playwright/Chromium nicht verfuegbar';

async function lies(markup,breite=390){
  const page=await browser.newPage({viewport:{width:breite,height:844}});
  await page.setContent('<!doctype html><html><body><div id="root">'+markup+'</div></body></html>');
  const seite=await page.evaluate(leseUebersicht);
  await page.close();
  return seite;
}
const rot=(res)=>res.filter(c=>!c.pass).map(c=>c.name);

test('Mitschnitt der V3-Uebersicht besteht alle Pruefungen',{skip},async()=>{
  const res=pruefeUebersicht(await lies(html),{mobil:true});
  assert.deepEqual(rot(res),[]);
  assert.ok(res.length>=60,'Zahl der Pruefungen: '+res.length);
});

test('Pruefung ist nicht stumpf: fehlendes Instrument, falscher Zustand und Einheit werden rot',{skip},async()=>{
  const ohne=html.replace(/<a class="vu-lrow[^>]*href="#\/maerkte\/BTCUSD"[\s\S]*?<\/a>/,'');
  assert.notEqual(ohne,html);
  assert.ok(rot(pruefeUebersicht(await lies(ohne))).some(n=>/^BTCUSD in krypto/.test(n)));
  const ohneLink=html.replace('href="#/maerkte/WTI"','data-x="1"');
  assert.ok(rot(pruefeUebersicht(await lies(ohneLink))).some(n=>/^WTI in energie/.test(n)));
  const punkte=html.replace(/(href="#\/maerkte\/SPY"[\s\S]*?vu-lrow__price"><span>)[^<]+/,(_m,vor)=>vor+'735 Pkt.');
  assert.notEqual(punkte,html);
  assert.ok(rot(pruefeUebersicht(await lies(punkte))).includes('SPY nie als Indexpunkte'));
  const einheit=html.replace(/(href="#\/maerkte\/XAUUSD"[\s\S]*?vu-lrow__price"><span>[^<]*?)\/oz/,(_m,vor)=>vor);
  assert.notEqual(einheit,html);
  assert.ok(rot(pruefeUebersicht(await lies(einheit))).includes('XAUUSD Einheit /oz'));
});

test('Renditen ohne bp oder mit Kursfarbe werden rot',{skip},async()=>{
  const farbe=html.replace(/(href="#\/maerkte\/US10Y"[\s\S]*?class="vu-chg)( vu-chg--flat)?"/,(_m,vor)=>vor+' vu-chg--down"');
  assert.notEqual(farbe,html);
  assert.ok(rot(pruefeUebersicht(await lies(farbe))).includes('US10Y Prozent, bp, keine Kursfarbe'));
});

test('Pflichtliste umfasst alle acht Gruppen der Owner-Liste',()=>{
  assert.deepEqual(Object.keys(PFLICHT),['aktien','energie','edelmetalle','krypto','us-renditen','eu-renditen','leitzinsen','devisen']);
});

test.after(async()=>{if(browser)await browser.close();});
