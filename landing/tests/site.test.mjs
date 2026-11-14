// Website auf www.visionuniverse.de (Owner-Freigabe 14.11.2026): Regeln, die ohne Browser prüfbar sind.
// Die Seiten schreibt products/website2/build.mjs --target www nach landing/; dass sie dem Erzeuger entsprechen,
// prüft products/website2/tests (dort ist das ganze Repository ausgecheckt, hier nur landing/).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,stat,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {build,root} from '../scripts/build.mjs';
import {CONSENT_TEXT} from '../server/newsletter.mjs';

const site=JSON.parse(await readFile(resolve(root,'site/pages.json'),'utf8'));
const snapshot=JSON.parse(await readFile(resolve(root,'site/insights.json'),'utf8'));
const pages=site.pages.map(p=>p+'index.html');
const output=resolve(root,'tests/output/site-rules');
await build({output});
const html=new Map();for(const p of pages)html.set(p,await readFile(resolve(output,p),'utf8'));
const refs=page=>[...page.matchAll(/\s(?:href|src|srcset|poster)="([^"]+)"/g)].map(m=>m[1]);
const text=page=>page.replace(/<script[\s\S]*?<\/script>|<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ');

test('Website: 17 Seiten, jede mit Sicherheitskopf, noindex im Vorschaumodus und versionierten eigenen Dateien',()=>{
  assert.deepEqual(site.pages,['','app/',...site.modules.map(m=>`module/${m.id}/`),'news/','magazin/','faq/']);
  assert.equal(site.modules.length,12);
  for(const [p,page] of html){
    assert.match(page,/<html lang="de">/,p);
    assert.match(page,/<head>\n  <meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; script-src &#39;self&#39;; style-src &#39;self&#39;;[^"]*connect-src &#39;self&#39;/,p);
    assert.match(page,/<meta name="referrer" content="no-referrer">/,p);
    assert.match(page,/<meta name="robots" content="noindex, nofollow">/,p);
    assert.match(page,/<meta name="vu-navigation" content="none">/,p+': sonst stellt scripts/sync-navigation.mjs die Research-Navigation voran');
    assert.match(page,/site\/site\.css\?v=[0-9a-f]{16}"/,p);assert.match(page,/site\/site\.js\?v=[0-9a-f]{16}" defer/,p);
    assert.match(page,new RegExp(`<link rel="canonical" href="https://www\\.visionuniverse\\.de/${p.replace(/index\.html$/,'')}">`),p);
    assert.doesNotMatch(page,/<iframe|<style|<script(?![^>]*\ssrc=)|vu-navigation>|site-navigation|data-theme/,p+': keine Einbettung, kein eingebettetes CSS/Skript, keine Research-Navigation');
    assert.equal((page.match(/<h1\b/g)||[]).length,1,p);
  }
});

test('Website: keine Anfrage an eine andere Adresse; alle eigenen Dateien liegen im Bau',async()=>{
  const EXTERNAL=[/^https:\/\/research\.visionuniverse\.de\/insights\/[a-z0-9\-/._]*$/,/^https:\/\/konto\.visionuniverse\.de\/kontakt$/,/^mailto:info@visionuniverse\.de$/,/^https:\/\/www\.visionuniverse\.de\/[a-z0-9\-/._]*$/,...site.social.map(u=>new RegExp('^'+u.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$'))];
  for(const [p,page] of html){
    // Whatever the browser loads by itself (scripts, styles, images, media, fonts, icons) must be relative, i.e. own origin.
    for(const m of page.matchAll(/<(script|link|img|source|video|use)\b[^>]*>/g)){
      const tag=m[0];if(/^<link\b/.test(tag)&&/rel="canonical"/.test(tag))continue;
      for(const r of [...tag.matchAll(/\s(?:href|src|poster)="([^"]+)"/g)].map(x=>x[1]))assert.match(r,/^(\.{1,2}\/|#[a-z-]+$)/,`${p}: lädt von fremder oder absoluter Adresse ${r}`);
    }
    for(const r of refs(page)){
      if(/^(https?:|mailto:)/.test(r)){assert.ok(EXTERNAL.some(e=>e.test(r)),`${p}: unerwartetes Ziel ${r}`);continue;}
      if(r.startsWith('#')){assert.ok(page.includes(`id="${r.slice(1)}"`),`${p}: Anker ${r}`);continue;}
      const [path,anchor]=r.split('#'),file=resolve(output,dirname(p),path.split('?')[0]);
      assert.ok(existsSync(file),`${p}: Datei fehlt ${r}`);
      if(anchor){const target=await readFile((await stat(file)).isDirectory()?resolve(file,'index.html'):file,'utf8');assert.ok(target.includes(`id="${anchor}"`),`${p}: Anker fehlt ${r}`);}
    }
  }
  const js=await readFile(resolve(output,'site/site.js'),'utf8'),css=await readFile(resolve(output,'site/site.css'),'utf8');
  assert.doesNotMatch(js,/fetch\(|XMLHttpRequest|artikel\.json|https?:\/\/|localStorage|sessionStorage|document\.cookie/,'site.js: kein Abruf, kein Speicher');
  assert.deepEqual([...css.matchAll(/url\(([^)]+)\)/g)].map(m=>m[1]),['../assets/fonts/inter-latin.woff2']);
  assert.doesNotMatch(css,/@import|https?:\/\//);
  assert.ok(!existsSync(resolve(output,'site/pages.json'))&&!existsSync(resolve(output,'site/insights.json')),'Arbeitsdateien werden nicht ausgeliefert');
  for(const old of ['styles.css','presentation.js','assets/home'])assert.ok(!existsSync(resolve(output,old)),old+' gehörte zur früheren Startseite und wird nicht mehr ausgeliefert');
});

test('Website: nur Schwarz, Weiß, Grau und das eine Neongrün (Owner 14.11.2026: kein Dunkelgrün)',async()=>{
  const greenish=hex=>{const n=hex.length===4?[...hex.slice(1)].map(c=>parseInt(c+c,16)):[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));return n[1]>n[0]+12&&n[1]>n[2]+12;};
  const sources=[['site.css',await readFile(resolve(output,'site/site.css'),'utf8')],['legal.css',await readFile(resolve(output,'legal.css'),'utf8')],...html];
  for(const [name,source] of sources){
    const found=[...new Set([...source.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)].map(m=>m[0].toLowerCase()))].filter(greenish);
    assert.deepEqual(found.filter(c=>!['#c8f531','#eef9cc'].includes(c)),[],name+': Grünton außer Neongrün und seinem blassen Ton');
  }
  const css=sources[0][1];
  assert.doesNotMatch(css,/--lt\b|#4f6b00|#7da800|#2a3305|prefers-color-scheme/i);
  // Lime never as text colour on a light surface: it is only set as text colour on the dark surfaces.
  for(const rule of css.matchAll(/([^{}]+)\{[^{}]*[;{]color:var\(--lime\)[^{}]*\}/g))assert.match(rule[1],/\.c-ink|\.blk|\.mq|\.fc\.b|\.stats|\.dock|\.icb|\.sc:hover/,'Neongrün als Schriftfarbe nur auf Schwarz: '+rule[1]);
});

test('Website: Instagram und TikTok als schlichte Links im Fuß und im Menü jeder Seite',()=>{
  assert.deepEqual(site.social,['https://www.instagram.com/app.visionuniverse/','https://www.tiktok.com/@app.visionuniverse']);
  for(const [p,page] of html){
    const foot=page.match(/<footer[\s\S]*<\/footer>/)[0],menu=page.match(/<nav class="mg" id="site-panel"[\s\S]*?<\/nav>/)[0];
    for(const [where,part] of [['Fuß',foot],['Menü',menu]])for(const url of site.social){
      const link=part.match(new RegExp(`<a class="sc" href="${url.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}"[^>]*>`))?.[0];
      assert.ok(link,`${p}: ${url} fehlt im ${where}`);assert.match(link,/rel="noopener"/);assert.match(link,/aria-label="Vision Universe auf (Instagram|TikTok)/);
    }
  }
});

test('Website: was die bisherige Startseite bot, bleibt: Impressum, Datenschutz, Kontaktformular, E-Mail, Anmeldung',async()=>{
  const fragment=(await readFile(resolve(root,'newsletter-form.html'),'utf8')).trim();
  const start=html.get('index.html');
  assert.ok(start.includes(fragment),'Startseite trägt das Formular wörtlich (landing/newsletter-form.html)');
  assert.ok(fragment.includes(CONSENT_TEXT)&&fragment.includes('name="CONSENT_VERSION" value="vu-newsletter-v1"'));
  assert.match(start,/<section class="sec" id="newsletter" aria-labelledby="newsletter-title" tabindex="-1">/);
  assert.match(start,/<script src="\.\/newsletter\.js" defer><\/script>/);
  assert.match(start,/<symbol id="i-arrow"/,'Pfeil des Absendeknopfs');
  for(const [p,page] of html){
    const up='../'.repeat(p.split('/').length-1)||'./',foot=page.match(/<footer[\s\S]*<\/footer>/)[0];
    for(const target of [`${up}impressum/`,`${up}datenschutz/`,'https://konto.visionuniverse.de/kontakt','mailto:info@visionuniverse.de'])assert.ok(foot.includes(`href="${target}"`),`${p}: ${target} fehlt im Fuß`);
    // The call to action leads to the signup on the start page; only the start page carries a form.
    const calls=[...page.matchAll(/<a class="cta[^"]*" href="([^"]+)">(Zum Start benachrichtigen|Benachrichtigen) /g)];
    assert.ok(calls.length>=1,p);for(const c of calls)assert.equal(c[1],`${up}#newsletter`,p);
    assert.equal((page.match(/<form\b/g)||[]).length,p==='index.html'?1:0,p);
  }
  for(const legal of ['impressum/index.html','datenschutz/index.html','newsletter/bestaetigen/index.html','newsletter/bestaetigt/index.html','newsletter/fehler/index.html','partner/index.html','instagram/index.html','instagram/robotaxi/index.html','instagram/energie/index.html','instagram/zonen/index.html','instagram/teilnahmebedingungen/index.html','policies/legal-notice/index.html','policies/privacy-policy/index.html'])assert.ok(existsSync(resolve(output,legal)),legal+' bleibt unter seiner Adresse');
  assert.match(await readFile(resolve(output,'instagram/index.html'),'utf8'),/href="\.\.\/#newsletter"/,'Instagram-Seiten führen weiter zur Anmeldung der Startseite');
});

test('Website: kein Link in die App oder in einen Store, keine Preise, keine Aussagen über Rendite; Beispiele sind beschriftet',async()=>{
  const notice=site.notice.replace(/&/g,'&amp;');
  const APP=/^(?:\.\.?\/)*(discover|quant|fundamental|technical|screener|supertrader|hedgefonds|elliott|portfolios|vorsorge|ask|konto|mein-dashboard|willkommen|aktie|preise|dashboard)\//;
  const BAD=/Kaufempfehlung|Kaufsignal|Verkaufssignal|\bSignale?\b|Kursziel(?!e\b)|wir empfehlen|empfohlen|garantiert|risikolos|Geheimtipp|Top-Pick|unterbewertet|Schnäppchen|passt zu dir|Was Profis kaufen|schlägt den Markt|Outperform|Mehrrendite|Kaufzone|Einstiegszone|Stop-Loss|Rendite|Performance|Trefferquote|Wertentwicklung/;
  for(const [p,page] of html){
    for(const r of refs(page)){assert.ok(!APP.test(r),`${p}: Link in die App ${r}`);assert.doesNotMatch(r,/apps\.apple\.com|play\.google\.com/,p);}
    const visible=text(page).replace(/Keine Kursziele|keine Kursziele|kein Kursziel|ohne Kursziel/g,'');
    // Headlines of the editorial articles come from /insights/ and are not statements about our methods.
    const own=p==='news/index.html'||p==='index.html'?snapshot.artikel.reduce((t,a)=>t.replaceAll(a.titel,''),visible):visible;
    assert.ok(!BAD.test(own),`${p}: ${own.match(BAD)?.[0]}`);
    assert.doesNotMatch(visible,/App öffnen|Kostenlos starten|Jetzt starten|Jetzt kaufen|\d+[,.]\d{2}\s?€\s?(im|pro|\/)\s?Monat|Mock-up/,p);
    assert.match(visible,/App bald verfügbar/,p);
    assert.doesNotMatch(page,/<a[^>]*>\s*<img[^>]*badge-/,p+': Store-Knopf ist verlinkt');
    assert.match(page,/badge-google\.png"[^>]*><span>Bald verfügbar<\/span>/,p);
    // Required notice (assets/legal-notices.json) only inside the menu, as everywhere in the repository.
    const menu=page.match(/<nav class="mg" id="site-panel"[\s\S]*?<\/nav>/)[0];
    assert.ok(menu.includes(notice)&&menu.includes('<h2>Rechtliches &amp; Infos</h2>'),p+': Pflichtsatz im Menü');
    assert.ok(!page.replace(menu,'').includes(notice.slice(0,60)),p+': Pflichtsatz außerhalb des Menüs');
  }
  const start=text(html.get('index.html'));
  assert.match(start,/Beispiel NVIDIA, Datenstand \d\d\.\d\d\.\d{4}\. Keine Anlageberatung, keine Empfehlung\./,'Beispiel mit Datenstand und Hinweis');
});

test('Website: Artikel, Heft und Report stehen fest im Bau und führen nur zu öffentlich lesbaren Insights-Seiten',async()=>{
  assert.equal(snapshot.schema,'vu-website-insights-1');assert.ok(snapshot.artikel.length>=1&&snapshot.artikel.length<=6);
  const news=html.get('news/index.html'),magazin=html.get('magazin/index.html');
  for(const a of snapshot.artikel){
    assert.match(a.href,/^https:\/\/research\.visionuniverse\.de\/insights\/[a-z0-9-]+\/$/,a.titel);
    assert.ok(news.includes(`href="${a.href}"`),'News ohne '+a.titel);
    if(a.bild){assert.ok(existsSync(resolve(output,'site/img',a.bild)),a.bild);assert.ok(news.includes(`src="../site/img/${a.bild}"`));}
  }
  assert.match(snapshot.heft.href,/^https:\/\/research\.visionuniverse\.de\/insights\/magazin\/nr-\d{2,3}\/$/);
  assert.ok(magazin.includes(`href="${snapshot.heft.href}"`)&&magazin.includes(`href="${snapshot.heft.pdf}"`)&&magazin.includes(snapshot.heft.titel.split(' ').pop()));
  for(const n of snapshot.heft.blick)assert.ok(existsSync(resolve(output,`site/img/heft-${snapshot.heft.nr}-s${String(n).padStart(2,'0')}.jpg`)),'Heftseite '+n);
  /* Aktienreport: eigene Bühne mit Titelbild, Seitenzahl, Weg zum Report und zum PDF; dazu ein Blick auf einzelne Seiten. Alles liegt im eigenen Ordner. */
  const report=snapshot.report;
  assert.ok(report&&report.cover,'Der Auszug nennt einen Aktienreport mit Titelbild');
  assert.match(report.href,/^https:\/\/research\.visionuniverse\.de\/insights\/reports\/[a-z0-9-]+\/$/);
  assert.ok(report.pdf.startsWith(report.href)&&report.pdf.endsWith('.pdf'),'PDF liegt beim Report');
  const stage=news.match(/<article class="stage c-lime rv" id="reports">[\s\S]*?<\/article>/)?.[0]||'';
  assert.ok(stage.includes(`href="${report.href}"`)&&stage.includes(`href="${report.pdf}"`)&&stage.includes(`<b><span>${report.seiten}</span></b> Seiten`)&&stage.includes(`src="../site/img/${report.cover}"`),'Bühne Aktienreport');
  assert.ok(stage.includes(report.titel.replace(/&/g,'&amp;')),'Titel des Reports');
  assert.match(news,/<article class="stage c-ink rv">[\s\S]*?Aktienmagazin[\s\S]*?<\/article>/,'Bühne Aktienmagazin');
  assert.ok(news.indexOf('class="stages"')<news.indexOf('id="artikel"'),'Heft und Report stehen vor den Artikeln');
  assert.ok(html.get('index.html').includes(`src="./site/img/${report.cover}"`)&&html.get('index.html').includes('href="./news/#reports"'),'Startseite zeigt den Report und führt zu seiner Bühne');
  for(const f of [report.cover,...report.blick.map(n=>`report-${report.nr}-s${String(n).padStart(2,'0')}.jpg`)]){
    assert.ok(existsSync(resolve(output,'site/img',f)),f);
    assert.ok(news.includes(`src="../site/img/${f}"`),'News ohne '+f);
  }
  /* Kleine WebP-Fassungen: jede genannte Datei wird ausgeliefert, das JPEG bleibt als Rückfall daneben. */
  for(const [p,page] of html)for(const m of page.matchAll(/<source type="image\/webp" srcset="([^"]+)">(<img[^>]*>)/g)){
    assert.ok(existsSync(resolve(output,dirname(p),m[1])),`${p}: ${m[1]}`);
    assert.match(m[2],/ src="[^"]+\.jpg"/,`${p}: Rückfall für ${m[1]}`);
  }
  for(const page of html.values())assert.doesNotMatch(page,/data-live-|data-feed|data-mag-|data-rep-/,'keine Plätze für einen Laufzeit-Abruf');
});

test('Website: Produktionsfreigabe stellt alle Seiten auf index und nennt sie in der Sitemap; Größen bleiben im Rahmen von Pages',async()=>{
  await mkdir(resolve(root,'tests/output'),{recursive:true});
  await writeFile(resolve(root,'tests/output/site-privacy.html'),'<!doctype html><html lang="de" data-policy-status="approved" data-newsletter-release-scope="public"><head><title>Nur Testfixture</title></head><body>Kein Rechtstext.</body></html>');
  const production=resolve(root,'tests/output/site-production');
  await build({output:production,production:true,config:{mode:'public',liveFlowVerified:true,privacyReviewed:true,privacyHtmlPath:'tests/output/site-privacy.html'}});
  const sitemap=await readFile(resolve(production,'sitemap.xml'),'utf8');
  for(const p of site.pages){
    assert.match(await readFile(resolve(production,p,'index.html'),'utf8'),/<meta name="robots" content="index, follow">/,p);
    assert.ok(sitemap.includes(`<loc>https://www.visionuniverse.de/${p}</loc>`),p);
  }
  assert.match(await readFile(resolve(production,'index.html'),'utf8'),/data-ready="true" action="\/api\/newsletter\/subscribe"/);
  assert.doesNotMatch(await readFile(resolve(production,'_headers'),'utf8'),/X-Robots-Tag/);
  assert.match(await readFile(resolve(output,'_headers'),'utf8'),/X-Robots-Tag: noindex, nofollow/);
  // Cloudflare Pages: at most 25 MiB per file. Keep the whole site small enough for a quick deploy.
  let total=0,largest=['',0],count=0;
  for(const name of await readdir(output,{recursive:true})){const s=await stat(resolve(output,name));if(!s.isFile())continue;count++;total+=s.size;if(s.size>largest[1])largest=[name,s.size];}
  assert.ok(largest[1]<8*1024*1024,`größte Datei ${largest[0]} (${largest[1]} Byte)`);
  assert.ok(total<40*1024*1024,`Bau insgesamt ${total} Byte`);assert.ok(count<1000);
});

test('Rechts- und Bestätigungsseiten: helles Kleid nur über legal.css, die Dokumente selbst bleiben unverändert',async()=>{
  // The approved texts are pinned byte for byte; the light design must not touch them.
  for(const revision of JSON.parse(await readFile(resolve(root,'review/legal-revisions.json'),'utf8')).revisions)for(const {file,sha256} of revision.files)
    assert.equal(createHash('sha256').update(await readFile(resolve(root,file))).digest('hex'),sha256,`${revision.id}: ${file} weicht von der freigegebenen Fassung ab`);
  const css=await readFile(resolve(root,'legal.css'),'utf8');
  assert.match(css,/color-scheme:light;background:#fff/);assert.match(css,/\.brand::before\{content:"VISION UNIVERSE®";/);
  assert.doesNotMatch(css,/color-scheme:dark|#080a0c|@import|https?:\/\/|prefers-color-scheme/);
  assert.deepEqual([...css.matchAll(/url\(([^)]+)\)/g)].map(m=>m[1]),["'./assets/fonts/inter-latin.woff2'"]);
  for(const page of ['impressum/index.html','datenschutz/index.html','newsletter/bestaetigen/index.html','newsletter/bestaetigt/index.html','newsletter/fehler/index.html','instagram/teilnahmebedingungen/index.html']){
    const built=await readFile(resolve(output,page),'utf8');
    assert.deepEqual([...built.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m=>m[1].replace(/\?v=[0-9a-f]{16}$/,'').replace(/^(\.\.\/)+/,'')),['legal.css'],page+': einzige Gestaltung ist legal.css');
    assert.doesNotMatch(built,/<script|<style|style="/,page);
    assert.match(built,/class="header shell"[\s\S]*class="legal shell"[\s\S]*class="footer shell"/,page+': Aufbau, auf den legal.css baut');
  }
});

test('Social-Bild: 1200 × 630 aus der neuen Startseite, auf jeder Seite der Website genannt',async()=>{
  const png=await readFile(resolve(output,'assets/social-preview.png'));
  assert.equal(png.subarray(1,4).toString(),'PNG');assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],[1200,630]);
  assert.ok(png.length<600*1024,'Social-Bild bleibt klein');
  for(const [p,page] of html){
    assert.ok(page.includes('<meta property="og:image" content="https://www.visionuniverse.de/assets/social-preview.png">')&&page.includes('<meta name="twitter:card" content="summary_large_image">'),p);
    assert.match(page,/<meta property="og:image:alt" content="Vision Universe: Die Börse ist laut\. Wir bringen Ordnung hinein\. App bald verfügbar\.">/,p);
  }
  assert.match(await readFile(resolve(root,'scripts/social-preview.mjs'),'utf8'),/viewport:\{width:1440,height:756\},deviceScaleFactor:5\/6/);
});
