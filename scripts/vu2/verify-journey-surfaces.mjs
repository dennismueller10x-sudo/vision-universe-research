#!/usr/bin/env node
/* =========================================================================
   SECHS BENANNTE FLAECHEN AM AUSGELIEFERTEN ARTEFAKT.

   browser-qa.mjs prueft die Reise als Ganzes: eine Ueberschrift je Seite,
   kein Ueberlauf, kein interner Begriff, Ressourcenbudget. Diese Datei
   prueft die sechs Saetze, an denen am 25.09.2026 eine falsche Auskunft
   stand - jeder mit einem Titel, an dem der Fall wirklich auftritt:

     NVDA   Bildunterschrift des Charts: splitbereinigt, nicht roh
     AAPL   was das Setup beenden wuerde, ist da (bis 21.11.2026 APGE; APGE ist seit B3 eine beendete Notierung)
     Musternenner  der Musternenner nennt, wovon er zaehlt; ohne Wochenreihe
            erscheint stattdessen der belegte Nichtverfuegbarkeitsgrund
     Setup-Titel   Setup-Bedingungen zaehlen messbare
     belegter ETF  keine Aktienaussage - eine benannte Absage
            mit Grund (#1443), kein Nichtpassen
     Seit 23.11.2026 (Owner-Freigabe, Steuerung) waehlt die Pruefung diese drei Titel nach EIGENSCHAFT aus dem
     ausgelieferten Verzeichnis (quant/data/universe/instruments/AA.json) und dem Musterartefakt, nicht mehr nach festem
     Kuerzel: AAAP (ETF-Eignung), APGE (B3) und AAAC fielen je einmal aus dem Produkt, und die Pruefung wurde rot, ohne
     dass die Seite falsch war.
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
import { gunzipSync } from "node:zlib";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const root = resolve(argOf("site", process.cwd()));
/* The pattern title may lose its published weekly series. Keep the historical denominator
   assertion for measured patterns, but accept the precise unavailable copy
   only when the shipped typed pattern payload confirms that state. */
const aaPatterns = JSON.parse(gunzipSync(await readFile(resolve(root,"quant/data/product/pattern-match-v1/AA.json.gz"))));
/* Auswahl nach Eigenschaft (23.11.2026): Verzeichnis-Shard AA des ausgelieferten Standes. */
const aaDirectory = JSON.parse(await readFile(resolve(root,"quant/data/universe/instruments/AA.json"),"utf8")).instruments || [];
const eligible = aaDirectory.filter(i=>i.productEligibility==="ELIGIBLE").map(i=>i.symbol);
const etfs = aaDirectory.filter(i=>i.productEligibility==="EXCLUDED"&&/^CONFIRMED_NON_EQUITY:ETF$/.test(String(i.productEligibilityReason||""))).map(i=>i.symbol);
const measured = eligible.filter(t=>Object.hasOwn(aaPatterns.instruments||{},t));
const noWeekly = eligible.filter(t=>aaPatterns.unavailable?.[t]?.reason==="NO_WEEKLY_SERIES"&&!Object.hasOwn(aaPatterns.instruments||{},t));
const PATTERN_TICKER = measured[0] || noWeekly[0];
const SETUP_TICKER = eligible.find(t=>t!==PATTERN_TICKER);
const ETF_TICKER = etfs[0];
if(!PATTERN_TICKER||!SETUP_TICKER||!ETF_TICKER){console.error("Auswahl nach Eigenschaft ohne Treffer: Musternenner "+PATTERN_TICKER+", Setup-Titel "+SETUP_TICKER+", ETF "+ETF_TICKER+" - Verzeichnis oder Musterartefakt pruefen");process.exit(2);}
const aaapNoWeeklySeries = aaPatterns.unavailable?.[PATTERN_TICKER]?.reason === "NO_WEEKLY_SERIES"
  && !Object.hasOwn(aaPatterns.instruments || {}, PATTERN_TICKER);
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
/* [Titel, Abschnitt, erwarteter Satz (Text oder Ausdruck), vorher zu drueckender Zeitraum] */
const checks=[
 /* Die Bildunterschrift gehoert zum Tagesschluss-Zeitraum; auf 1T steht
    dort die Quelle des Tagesverlaufs. Deshalb zuerst 1J. */
 ["NVDA","section.qc-chart .qc-note",/(^|[^t] )splitbereinigt/,"1J"],
 ["AAPL","#setup",/Was würde das Setup ungültig machen\?/i],
 [PATTERN_TICKER,"#historie",/\d+ von \d+ Mustern|nicht prüfbar/],
 [SETUP_TICKER,"#setup","messbaren Bedingungen"],
 /* EIN BELEGTER ETF IST SEIT DER OWNER-ENTSCHEIDUNG 1 KEIN AKTIENFALL MEHR: die Seite
    sagt mit Grund ab (Variante B, #1443) - keine Aktienaussage. */
 [ETF_TICKER,"#qx-main",/ist ein ETF, keine Aktie.*keine Aktienaussage/],
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
  const unavailablePatternCopy = ticker === PATTERN_TICKER && aaapNoWeeklySeries
    && text.includes("Für diesen Titel ist keine Wochenreihe veröffentlicht, gegen die Muster geprüft werden könnten.")
    && !/\d+ von \d+ Mustern/.test(text);
  const expectedCopy = typeof expect==="string"?text.includes(expect):expect.test(text);
  const ok = ticker === PATTERN_TICKER && aaapNoWeeklySeries ? unavailablePatternCopy : expectedCopy;
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(!ok||overflow||fehler.length)bad++;
  console.log((ok?"OK  ":"FEHLT ")+width+" "+ticker+" "+sel+" · overflow "+overflow+" · Fehler "+(fehler.join(";")||"keine")+(ok?"":" · erwartet: "+expect));
  await page.close();
 }
}
await browser.close();server.close();
console.log(bad?("FEHLGESCHLAGEN "+bad):"ALLE PRUEFUNGEN BESTANDEN");
process.exit(bad?1:0);
