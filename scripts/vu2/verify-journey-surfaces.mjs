#!/usr/bin/env node
/* =========================================================================
   SECHS BENANNTE FLAECHEN AM AUSGELIEFERTEN ARTEFAKT.

   browser-qa.mjs prueft die Reise als Ganzes: eine Ueberschrift je Seite,
   kein Ueberlauf, kein interner Begriff, Ressourcenbudget. Diese Datei
   prueft die sechs Saetze, an denen am 25.09.2026 eine falsche Auskunft
   stand - jeder mit einem Titel, an dem der Fall wirklich auftritt:

     stock NVDA   Bildunterschrift des Charts: splitbereinigt, nicht roh
     stock APGE   "Was diesen Zustand aendern wuerde" ist da
     stock AAAP   Musternenner zaehlt pruefbare, nicht vorregistrierte
     quant AACB   Setup-Bedingungen zaehlen messbare
     quant AAAC   kein messbares Profil ist eine Luecke, kein Nichtpassen
     quant A      historische Evidenz nennt ihren Abstand

   Geprueft wird das AUSGELIEFERTE Verzeichnis, nicht das Repository: die
   Reihenfolge der Skripte in index.html und der gebuendelte Auslieferstand
   sind Teil dessen, was schiefgehen kann.

   Ausfuehren (aus dem Release-Verzeichnis oder mit --site <pfad>):
     node scripts/vu2/verify-journey-surfaces.mjs --site "$RUNNER_TEMP/quant2-site"
   ========================================================================= */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const root = resolve(argOf("site", process.cwd()));
const mime = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json" };
const server = createServer(async (req,res)=>{try{
 let p=decodeURIComponent(new URL(req.url,"http://l").pathname);
 if(p.endsWith("/"))p+="index.html";
 const f=resolve(root,"."+p); if(!f.startsWith(root+sep))throw Error("x");
 res.setHeader("Content-Type",mime[extname(f)]||"application/octet-stream");
 res.end(await readFile(f));
}catch{res.statusCode=404;res.end("404");}});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const origin="http://127.0.0.1:"+server.address().port;
const browser=await chromium.launch({headless:true,args:["--no-sandbox"],executablePath:process.env.VU_CHROMIUM||undefined});
let bad=0;
const checks=[
 ["stock","NVDA",".focus p.muted","Splitbereinigte Schlusskurse"],
 ["stock","APGE",".setup-change summary","Was diesen Zustand ändern würde"],
 ["stock","AAAP",".pattern-balance","prüfbaren Mustern"],
 ["quant","AACB",".setup-count","messbaren Bedingungen"],
 ["quant","AAAC",".match-section","lässt sich derzeit kein Anlagestil prüfen"],
 ["quant","A",".match-section","veröffentlichten Ständen dieser Methodikversion"]
];
for(const width of [1440,390]){
 for(const [view,ticker,sel,expect] of checks){
  const page=await browser.newPage({viewport:{width,height:1300}});
  const fehler=[];page.on("pageerror",e=>fehler.push(e.message));
  await page.goto(origin+"/vu2/?view="+view+"&ticker="+ticker);
  await page.locator("main footer").waitFor({timeout:25000});
  for(const d of await page.locator("details").all()){try{await d.locator("summary").first().click({timeout:300});}catch{}}
  const text=await page.locator("main").innerText();
  const ok=text.includes(expect);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(!ok||overflow||fehler.length)bad++;
  console.log((ok?"OK  ":"FEHLT ")+width+" "+view+" "+ticker+" · overflow "+overflow+" · Fehler "+(fehler.join(";")||"keine")+(ok?"":" · erwartet: "+expect));
  await page.close();
 }
}
await browser.close();server.close();
console.log(bad?("FEHLGESCHLAGEN "+bad):"ALLE PRUEFUNGEN BESTANDEN");
process.exit(bad?1:0);
