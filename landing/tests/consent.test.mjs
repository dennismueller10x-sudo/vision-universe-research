import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createConsentManager, STORAGE_KEY, MAX_AGE} from '../consent-state.js';
import {build, root} from '../scripts/build.mjs';

const fixture = () => {
  let time = 1000;
  const values = new Map();
  const storage = {getItem: k => values.get(k), setItem: (k,v) => values.set(k,v)};
  return {storage, values, now: () => time, advance: n => {time += n;}};
};
const service = (id, category, calls) => ({id, category, name: 'Testdienst', description: 'Nur lokal simuliert.',
  enable: () => calls.push(id + ':enable'), disable: () => calls.push(id + ':disable')});

test('Ohne Dienste: kein Speicherzugriff zum Schreiben vor Auswahl und keine Schein-Einwilligung', () => {
  const f = fixture(), manager = createConsentManager(f);
  assert.equal(f.values.size,0);assert.equal(manager.snapshot().needsChoice,true);
  assert.equal(manager.allows('necessary'),true);assert.equal(manager.allows('statistics'),false);
  const saved = manager.save({statistics:true,marketing:true});
  assert.equal(saved.persisted,true);assert.deepEqual(saved.preferences,{statistics:false,marketing:false});
  assert.equal(createConsentManager(f).snapshot().needsChoice,false);
  assert.equal(JSON.parse(f.values.get(STORAGE_KEY)).expiresAt,1000+MAX_AGE);
});
test('Aktivierung erst nach Zustimmung, granulare Auswahl und echte Widerruf-Callbacks', () => {
  const f = fixture(), calls=[], manager=createConsentManager(f);
  manager.registerService(service('statistik','statistics',calls));manager.registerService(service('marketing','marketing',calls));
  assert.deepEqual(calls,[]);manager.save({statistics:false,marketing:false});assert.deepEqual(calls,[]);
  manager.save({statistics:true});assert.deepEqual(calls,['statistik:enable']);assert.equal(manager.allows('marketing'),false);
  manager.save({statistics:true,marketing:true});assert.deepEqual(calls,['statistik:enable','marketing:enable']);
  manager.save({});assert.deepEqual(calls,['statistik:enable','marketing:enable','statistik:disable','marketing:disable']);
});
test('Neue Dienste und Ablauf benötigen neue Auswahl, vorherige Freigabe wird beendet', () => {
  const f=fixture(), calls=[], manager=createConsentManager(f);
  manager.registerService(service('statistik','statistics',calls));manager.save({statistics:true});
  manager.registerService(service('werbung','marketing',calls));
  assert.equal(manager.snapshot().needsChoice,true);assert.deepEqual(calls,['statistik:enable','statistik:disable']);
  manager.save({statistics:true});f.advance(MAX_AGE);manager.refresh();
  assert.equal(manager.snapshot().needsChoice,true);assert.equal(manager.allows('statistics'),false);assert.equal(calls.at(-1),'statistik:disable');
});
test('Ungültige, fremde, zukünftige oder alte Speicherwerte geben keine Dienste frei', () => {
  const f=fixture(), manager=createConsentManager(f);manager.save({});
  const original=JSON.parse(f.values.get(STORAGE_KEY));
  for(const value of ['bad-json', JSON.stringify({...original,version:'old'}), JSON.stringify({...original,savedAt:1001}), JSON.stringify({...original,preferences:{statistics:'true',marketing:false}}), JSON.stringify({...original,services:['unknown']}), JSON.stringify({...original,expiresAt:1000+MAX_AGE*2})]) {
    f.values.set(STORAGE_KEY,value);const m=createConsentManager(f);assert.equal(m.snapshot().needsChoice,true);assert.equal(m.allows('statistics'),false);
  }
});
test('Gesperrter Speicher wird ehrlich gemeldet, Entscheidung bleibt für den Besuch wirksam', () => {
  const storage={getItem(){throw Error();},setItem(){throw Error();}};
  const manager=createConsentManager({storage});const result=manager.save({});
  assert.equal(result.persisted,false);assert.equal(result.needsChoice,false);
  assert.equal(manager.refresh().needsChoice,false);
});
test('Fehlgeschlagene Aktivierung speichert keine Freigabe und räumt gestartete Dienste auf', () => {
  const f=fixture(), calls=[], manager=createConsentManager(f);
  manager.registerService(service('statistik','statistics',calls));
  manager.registerService({...service('marketing','marketing',calls),enable(){calls.push('marketing:failed');throw Error('Local fixture');}});
  assert.throws(()=>manager.save({statistics:true,marketing:true}),/fixture/);
  assert.deepEqual(manager.snapshot().preferences,{statistics:false,marketing:false});
  assert.deepEqual(JSON.parse(f.values.get(STORAGE_KEY)).preferences,{statistics:false,marketing:false});
  assert.deepEqual(calls,['statistik:enable','marketing:failed','marketing:disable','statistik:disable']);
});
test('Widerruf in anderem Tab stoppt optionale Dienste; ungültige Integrationen werden abgelehnt', () => {
  const f=fixture(), calls=[], first=createConsentManager(f);
  first.registerService(service('statistik','statistics',calls));first.save({statistics:true});
  const other=createConsentManager(f);other.registerService(service('statistik','statistics',[]));other.save({});first.refresh();
  assert.equal(calls.at(-1),'statistik:disable');
  assert.throws(()=>first.registerService({id:'unsafe',category:'statistics',name:'Test',description:'Test',enable(){}}),/Widerruf/);
  assert.throws(()=>first.registerService(service('statistik','statistics',calls)),/Kennung/);
});
test('Consent-UI auf Hauptseite, Rechtsseiten und Alias-Seiten; keine Quellen oder Abo-Entwürfe öffentlich', async () => {
  const output=resolve(root,'tests/output/consent');await build({output});
  for(const path of ['index.html','impressum/index.html','datenschutz/index.html','policies/legal-notice/index.html','policies/privacy-policy/index.html']) {
    const html=await readFile(resolve(output,path),'utf8');assert.match(html,/id="cookie-banner"/);assert.match(html,/id="cookie-dialog"/);assert.match(html,/data-cookie-settings/);
    assert.doesNotMatch(html,/site-navigation|vu-navigation|google-analytics|facebook\.net/);
  }
  for(const path of ['legal-source/shopify-impressum.txt','legal-drafts/agb-app-abos.md'])await assert.rejects(readFile(resolve(output,path)),/ENOENT/);
});
