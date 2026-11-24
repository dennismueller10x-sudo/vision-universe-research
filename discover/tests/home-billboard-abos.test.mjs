import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {messeStartseite} from '../../scripts/discover/home-billboard-abos.mjs';

/* Echtes Chromium (Playwright), echte Startseite, echte Repo-Daten aus dem Dateisystem; ohne Playwright/Chromium uebersprungen.
   Belegt, was ein Quelltexttest nicht belegen kann: ein IntersectionObserver je Folie sieht die seitlich verdeckten Folien nie
   (Monitor-Lauf 45341262042: nur 1 von 5 Verlaeufen), die Reihe als Ganzes schon. */
const require=createRequire(import.meta.url);
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
let chromium=null;try{({chromium}=require('playwright'));}catch{}
let ok=false;
if(chromium){try{const b=await chromium.launch();await b.close();ok=true;}catch{ok=false;}}

test('Billboard-Abos im echten Chromium: fuenf im Bild, nach Wegscrollen und Routenwechsel alle gekuendigt',{skip:ok?false:'Playwright/Chromium nicht verfuegbar',timeout:120000},async()=>{
  const m=await messeStartseite(ROOT,{chromium});
  assert.deepEqual(m.seitenfehler,[]);
  assert.equal(m.A_geladen.folien,5,'fuenf Billboard-Folien');
  assert.equal(m.A_geladen.verlaeufe,5,'jede Folie traegt den Tagesverlauf, auch die seitlich verdeckten');
  assert.equal(m.A_geladen.abonnenten,5,'fuenf Abonnenten, solange die Reihe im Bild ist');
  assert.equal(m.B_weggescrollt.abonnenten,0,'Reihe aus dem Bild: alle gekuendigt');
  assert.equal(m.B_weggescrollt.kuendigungen,5);
  assert.equal(m.C_zurueck.abonnenten,5,'Reihe wieder im Bild: wieder fuenf');
  assert.equal(m.D_routenwechsel.abonnenten,0,'Routenwechsel: Startseite abgebaut, keine Abonnenten');
  assert.equal(m.D_routenwechsel.folien,0);
});
