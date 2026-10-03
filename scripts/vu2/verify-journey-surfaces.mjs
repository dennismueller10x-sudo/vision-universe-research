#!/usr/bin/env node
/* =========================================================================
   SECHS BENANNTE FLAECHEN AM AUSGELIEFERTEN ARTEFAKT.

   browser-qa.mjs prueft die Reise als Ganzes: eine Ueberschrift je Seite,
   kein Ueberlauf, kein interner Begriff, Ressourcenbudget. Diese Datei
   prueft die sechs Saetze, an denen am 25.09.2026 eine falsche Auskunft
   stand - jeder mit einem Titel, an dem der Fall wirklich auftritt:

     NVDA   Bildunterschrift des Charts: splitbereinigt, nicht roh
     APGE   was das Setup beenden wuerde, ist da
     (aus dem Artefakt) der Musternenner nennt, wovon er zaehlt
     AACB   Setup-Bedingungen zaehlen messbare
     AAAC   ein belegter ETF: keine Unternehmensanalyse - eine Luecke mit
            Grund, kein Nichtpassen
     A      die Stil-Zuordnung nennt den Abstand zwischen zwei Staenden

   Seit dem 30.09.2026 ist das die Aktienseite der Hash-App
   (/quant/#/aktie/<T>); die fruehere Trennung in "stock" und "quant" gibt
   es nicht mehr - beide Auskuenfte stehen auf derselben Seite, jede in
   ihrem Abschnitt (#setup, #historie, #strategie, Einordnung).

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
/* DER MUSTERFALL KOMMT AUS DEM ARTEFAKT, NICHT AUS EINEM FESTEN KUERZEL.
   Bis 03.10.2026 stand hier AAAP. Die Listing-Regel (#367) kuerzte seine
   Reihe auf das juengste Listing; seitdem traegt AAAP kein Marktmuster mehr,
   und der Satz, der geprueft werden soll, kann dort nicht stehen. Geprueft
   wird deshalb der erste Titel (alphabetisch), der im ausgelieferten
   pattern-match-v1 sowohl zutreffende als auch nicht messbare Muster hat -
   genau der Fall, an dem der Nenner erklaeren muss, wovon er zaehlt. */
const PATTERN_CASE=await (async()=>{
 const { readdir } = await import("node:fs/promises"), { gunzipSync } = await import("node:zlib");
 const dir=resolve(root,"quant/data/product/pattern-match-v1"), found=[];
 for(const f of (await readdir(dir)).filter(x=>x.endsWith(".json.gz")).sort()){
  const d=JSON.parse(gunzipSync(await readFile(resolve(dir,f))).toString("utf8"));
  for(const [t,s] of Object.entries(d.instruments||{})) if((s.unmeasurable||[]).length&&(s.holds||[]).length&&s.hasFundamentals) found.push(t);
 }
 if(!found.length)throw Error("Kein Titel mit zutreffenden und nicht messbaren Mustern im Artefakt - der Fall laesst sich nicht pruefen.");
 return found.sort()[0];
})();
console.log("Musterfall aus dem Artefakt:",PATTERN_CASE);
/* [Titel, Abschnitt, erwarteter Satz (Text oder Ausdruck), vorher zu drueckender Zeitraum] */
const checks=[
 /* Die Bildunterschrift gehoert zum Tagesschluss-Zeitraum; auf 1T steht
    dort die Quelle des Tagesverlaufs. Deshalb zuerst 1J. */
 ["NVDA","section.qc-chart .qc-note",/(^|[^t] )splitbereinigt/,"1J"],
 ["APGE","#setup",/Was würde das Setup ungültig machen\?/i],
 [PATTERN_CASE,"#historie",/\d+ von \d+ Mustern|nicht prüfbar/],
 ["AACB","#setup","messbaren Bedingungen"],
 /* AAAC IST SEIT DER OWNER-ENTSCHEIDUNG 1 KEIN AKTIENFALL MEHR: Kurs und
    Kursverlauf bleiben, die Aktienanalyse entfaellt - mit Grund. */
 ["AAAC","#qx-main","Die Unternehmensanalyse gilt nur für Aktien"],
 /* Der Satz ueber die zwei veroeffentlichten Staende steht im Abschnitt
    der Anlagestile: "An der Zuordnung ... hat sich zwischen den
    veröffentlichten Ständen vom ... und ... nichts geändert." */
 ["A","#strategie","veröffentlichten Ständen"]
];
for(const width of [1440,390]){
 for(const [ticker,sel,expect,zeitraum] of checks){
  const page=await browser.newPage({viewport:{width,height:1300}});
  const fehler=[];page.on("pageerror",e=>fehler.push(e.message));
  await page.goto(origin+"/quant/#/aktie/"+ticker);
  await page.waitForFunction(()=>{const m=document.querySelector("main#qx-main");return m&&m.dataset.ready==="true"&&m.getAttribute("aria-busy")==="false"&&!m.querySelector(".qx-loading");},null,{timeout:45000});
  if(zeitraum){
   await page.waitForFunction(()=>{const c=document.querySelector("section.qc-chart");return c&&c.dataset.range;},null,{timeout:10000}).catch(()=>{});
   await page.locator("section.qc-chart .qc-range",{hasText:new RegExp("^"+zeitraum+"$")}).click().catch(()=>{});
   await page.waitForTimeout(200);
  }
  for(let i=0;i<200;i++){const n=await page.evaluate(()=>{const d=document.querySelector("#qx-main details:not([open])");if(!d)return 0;d.open=true;return 1;});if(!n)break;await page.waitForTimeout(20);}
  /* textContent statt innerText: innerText folgt text-transform, und die
     Fragen im Setup-Abschnitt stehen in Versalien. */
  const text=(await page.locator(sel).first().textContent().catch(()=>"")||"").replace(/\s+/g," ");
  const ok=typeof expect==="string"?text.includes(expect):expect.test(text);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(!ok||overflow||fehler.length)bad++;
  console.log((ok?"OK  ":"FEHLT ")+width+" "+ticker+" "+sel+" · overflow "+overflow+" · Fehler "+(fehler.join(";")||"keine")+(ok?"":" · erwartet: "+expect));
  await page.close();
 }
}
await browser.close();server.close();
console.log(bad?("FEHLGESCHLAGEN "+bad):"ALLE PRUEFUNGEN BESTANDEN");
process.exit(bad?1:0);
