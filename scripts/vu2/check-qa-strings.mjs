/* =========================================================================
   VISION UNIVERSE — check-qa-strings.mjs

   WELCHE ZEICHENKETTE BEHAUPTET DIE BROWSER-QA, DIE ES NICHT MEHR GIBT?

   Am 29.09.2026 habe ich die Oberflaeche umgebaut und danach die
   Browser-QA in VIER Runden nachgezogen - jede Runde fand einen weiteren
   Text, den ich geaendert hatte. Jede Runde kostete einen CI-Lauf und
   fuenfzehn Minuten.

   Der Fehler war die Methode: ich habe nach Texten gesucht, an die ich
   mich ERINNERTE, statt nach allen, auf die die QA wartet.

   Dieses Skript macht das in Sekunden. Es zieht jede Zeichenkette aus
   `name:`, `hasText:` und `getByText(` und prueft, ob sie in der
   Oberflaeche noch vorkommt.

   FEHLALARME SIND NORMAL UND GEHOEREN DAZU: was zur Laufzeit
   zusammengesetzt wird ("Version " + n + " gespeichert", "Die
   Kursstruktur von " + ticker), kann hier nicht stehen. Das Skript
   entscheidet nichts - es legt die Kandidaten vor, und ein Mensch sieht
   sie an. Von 13 Kandidaten war am 29.09. genau einer echt.

   Aufruf:  node scripts/vu2/check-qa-strings.mjs
   ========================================================================= */

import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const R=join(dirname(fileURLToPath(import.meta.url)),'../..')+'/';
const qa=readFileSync(R+'scripts/vu2/browser-qa.mjs','utf8');
const src=readFileSync(R+'vu2/experience.js','utf8')+readFileSync(R+'vu2/index.html','utf8')
  +readFileSync(R+'quant/ui/shell.js','utf8')
  +readFileSync(R+'quant/methodology/product-language-v1.json','utf8');
const muster=[/name:\s*'([^'\\]{6,})'/g,/hasText:\s*'([^'\\]{6,})'/g,/getByText\(\s*'([^'\\]{6,})'/g];
const kandidaten=new Set();
for(const m of muster){let x;while((x=m.exec(qa)))kandidaten.add(x[1]);}
const fehlend=[...kandidaten].filter(t=>!src.includes(t));
console.log('Von der QA behauptete Zeichenketten: '+kandidaten.size);
console.log('Davon NICHT in der Oberflaeche: '+fehlend.length+'\n');
for(const t of fehlend) console.log('  FEHLT: '+t);
