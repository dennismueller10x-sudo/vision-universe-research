// Website auf www (Start, App, zwölf Module, News, Aktienmagazin, Fragen): jede Seite des Baus im Browser.
// Geprüft wird nur, was in landing/ liegt (die CI checkt nur landing/ aus). Keine echten Anfragen nach außen.
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {build,root} from '../scripts/build.mjs';

const site=JSON.parse(await readFile(resolve(root,'site/pages.json'),'utf8'));
const output=resolve(root,'tests/output/site');
await build({output:resolve(output,'blocked')});
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.mp4':'video/mp4'};
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let path=resolve(output,'.'+pathname);
    // The unchanged confirmation pages name no icon, so browsers ask for /favicon.ico. Cloudflare Pages answers unknown
    // paths with the start page (200); this local server answers with an empty reply instead of a 404.
    if(pathname.endsWith('/favicon.ico')){res.writeHead(204);res.end();return;}
    if(!path.startsWith(output+sep))throw Error();if((await stat(path)).isDirectory()){if(!pathname.endsWith('/')){res.writeHead(308,{Location:pathname+'/'});res.end();return;}path=resolve(path,'index.html');}
    const body=await readFile(path),type=types[extname(path)]||'application/octet-stream',range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
    if(range){const start=+range[1],end=range[2]?+range[2]:body.length-1;res.writeHead(206,{'Content-Type':type,'Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${body.length}`});res.end(body.subarray(start,end+1));return;}
    res.writeHead(200,{'Content-Type':type,'Accept-Ranges':'bytes'});res.end(body);
  }catch{res.writeHead(404);res.end('404');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`,base=origin+'/blocked/';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
const APP=/^\/(discover|quant|fundamental|technical|screener|supertrader|hedgefonds|elliott|portfolios|vorsorge|ask|konto|mein-dashboard|willkommen|aktie|preise|dashboard)(\/|$)/;
const ALLOWED_EXTERNAL=[/^https:\/\/research\.visionuniverse\.de\/insights\//,/^https:\/\/konto\.visionuniverse\.de\/kontakt$/,/^mailto:info@visionuniverse\.de$/,...site.social.map(u=>new RegExp('^'+u.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$'))];
const links=new Map(),graph=new Map(),metrics=[];
try{
  for(const [name,width,height] of [['desktop',1440,900],['iphone',390,844],['narrow',320,800]]){
    const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',isMobile:name==='iphone',hasTouch:name==='iphone',deviceScaleFactor:1});
    for(const path of site.pages){
      const where=`${name} /${path}`,page=await context.newPage(),problems=[];
      page.on('pageerror',e=>problems.push('pageerror '+e.message));
      page.on('console',m=>{if(m.type()==='error')problems.push('console '+m.text());});
      page.on('requestfailed',r=>{if(r.failure()?.errorText!=='net::ERR_ABORTED')problems.push('failed '+r.url());});
      page.on('request',r=>{if(!r.url().startsWith(origin))problems.push('external '+r.url());});
      page.on('response',r=>{if(r.status()>=400)problems.push(r.status()+' '+r.url());});
      await page.goto(base+path,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
      // Keyboard: the skip link comes first and shows its focus.
      await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').innerText(),'Zum Inhalt',where);
      assert.notEqual(await page.locator(':focus').evaluate(e=>getComputedStyle(e).outlineStyle),'none',where+': sichtbarer Fokus');
      // Lazy content: walk the page and the horizontal rails once.
      await page.evaluate(async()=>{
        for(let y=0;y<document.body.scrollHeight;y+=500){scrollTo({top:y,behavior:'instant'});await new Promise(r=>setTimeout(r,40));}
        for(const rail of document.querySelectorAll('.rail')){rail.scrollIntoView({block:'center',behavior:'instant'});for(let x=0;x<=rail.scrollWidth;x+=250){rail.scrollTo({left:x,behavior:'instant'});await new Promise(r=>setTimeout(r,40));}rail.scrollTo({left:0,behavior:'instant'});}
        scrollTo({top:0,behavior:'instant'});
      });
      await page.waitForLoadState('networkidle');
      // Structure: one main heading, skip link first, real links only, nothing into the app or a store.
      assert.equal(await page.locator('h1').count(),1,where+': genau eine h1');
      assert.match(await page.locator('body').innerText(),/App bald verfügbar/,where);
      assert.doesNotMatch(await page.locator('body').innerText(),/Mock-up|Konzeptansicht/,where);
      assert.equal(await page.locator('input[type=password],iframe,script[src*="access"],script[src*="pwa"],script:not([src])').count(),0,where+': keine Passwortmaske, Einbettung oder eingebettetes Skript');
      const hrefs=await page.locator('a[href]').evaluateAll(es=>es.map(e=>({raw:e.getAttribute('href'),url:e.href,target:e.target,rel:e.rel})));
      assert.ok(hrefs.every(h=>h.raw&&h.raw!=='#'&&!/^javascript:/i.test(h.raw)),where+': Schein-Link');
      const out=new Set();
      for(const h of hrefs){
        if(h.url.startsWith(base)){const local='/'+h.url.slice(base.length);assert.ok(!APP.test(local),where+': Link in die App '+h.raw);links.set(h.url.split('#')[0],where);if(h.url.includes('#'))links.set(h.url,where);out.add(local.split(/[?#]/)[0]);}
        else{assert.ok(ALLOWED_EXTERNAL.some(r=>r.test(h.url)),where+': unerwartetes Ziel '+h.url);assert.doesNotMatch(h.url,/apps\.apple\.com|play\.google\.com/);}
        if(h.target==='_blank')assert.match(h.rel,/noopener/,where+': noopener fehlt '+h.raw);
      }
      graph.set('/'+path,out);
      assert.equal(await page.locator('a img[src*="badge-"]').count(),0,where+': Store-Knopf ist verlinkt');
      assert.ok(await page.locator('img[src*="badge-apple"]').count()>=1&&await page.locator('.badges span',{hasText:'Bald verfügbar'}).count()>=1,where+': Store-Knöpfe mit „Bald verfügbar“');
      // Images: loaded, with alt and dimensions.
      const images=await page.locator('img').evaluateAll(es=>es.filter(e=>e.offsetParent!==null).map(e=>({src:e.getAttribute('src'),ok:e.complete&&e.naturalWidth>0,alt:e.hasAttribute('alt'),size:e.hasAttribute('width')&&e.hasAttribute('height')})));
      assert.deepEqual(images.filter(i=>!i.ok||!i.alt||!i.size),[],where+': Bilder');
      // Layout: no horizontal overflow, measured on the document and on every element that nothing clips.
      const layout=await page.evaluate(()=>{
        const W=innerWidth,clipped=e=>{for(let a=e.parentElement;a&&a!==document.body;a=a.parentElement){const s=getComputedStyle(a);if(/hidden|auto|scroll|clip/.test(s.overflowX))return true;}return false;};
        const over=[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&(r.right>W+1||r.left<-1)&&getComputedStyle(e).position!=='fixed'&&!e.closest('.skip,.sr-only,.honeypot')&&!clipped(e);}).map(e=>e.tagName+'.'+e.className);
        return {scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,over:over.slice(0,6)};
      });
      assert.equal(layout.scrollWidth,width,where+': horizontaler Überlauf');assert.deepEqual(layout.over,[],where+': Element ragt aus dem Fenster');
      // Module names stay complete on one line inside their tile.
      assert.deepEqual(await page.locator('a.t .tn').evaluateAll(es=>es.filter(e=>e.offsetParent!==null&&e.getBoundingClientRect().height>parseFloat(getComputedStyle(e).fontSize)*1.6).map(e=>e.textContent)),[],where+': Modulname umbrochen');
      // Touch targets of at least 44 px: social links, legal links, menu button, call to action at the bottom edge, calls to action.
      const small=await page.locator('.sc,.foot .lnav a,.foot ul a,.mbtn,.stk a,.bar .cta,.nl,main a.cta,main a.icb,.faq summary,[data-vid] .play').evaluateAll(es=>es.filter(e=>e.offsetParent!==null).map(e=>{const r=e.getBoundingClientRect();return {text:(e.getAttribute('aria-label')||e.textContent).trim().slice(0,40),w:Math.round(r.width),h:Math.round(r.height)};}).filter(r=>r.w<44||r.h<44));
      assert.deepEqual(small,[],where+': Bedienfläche unter 44 px');
      const social=await page.locator('.foot .sc').evaluateAll(es=>es.map(e=>[e.href,e.getAttribute('aria-label'),e.rel,e.querySelector('svg')?.getAttribute('aria-hidden')]));
      assert.deepEqual(social.map(s=>s[0]),site.social,where+': Instagram und TikTok im Fuß');assert.ok(social.every(s=>/Vision Universe auf (Instagram|TikTok)/.test(s[1])&&/noopener/.test(s[2])&&s[3]==='true'),where+': Namen der Social-Links');
      assert.deepEqual(await page.locator('.foot .lnav a').evaluateAll(es=>es.map(e=>e.textContent)),['Impressum','Datenschutz','Kontaktformular','E-Mail'],where+': Rechtsfuß wie auf der bisherigen Startseite');
      // Videos: poster, inline, never autoplaying with sound; module films keep native controls without JavaScript.
      for(const video of await page.locator('video').all()){
        const v=await video.evaluate(e=>({poster:e.poster,inline:e.playsInline,preload:e.preload,auto:e.autoplay,muted:e.muted,hero:e.hasAttribute('data-autoplay'),src:e.currentSrc||e.querySelector('source')?.src,label:e.getAttribute('aria-label')}));
        assert.ok(v.poster.startsWith(origin)&&v.src.startsWith(origin)&&v.inline&&v.preload==='none'&&!v.auto&&v.label,where+': Video '+JSON.stringify(v));
        if(v.hero)assert.equal(v.muted,true,where+': Film im Kopf ohne Ton');
        for(const url of [v.poster,v.src])assert.equal((await page.request.head(url)).status(),200,where+': '+url);
      }
      if(await page.locator('[data-vid]').count()){
        const play=page.locator('[data-vid] .play');await play.scrollIntoViewIfNeeded();assert.equal(await play.isVisible(),true,where+': Abspielknopf');
        await play.click();assert.equal(await page.locator('[data-vid] video').evaluate(e=>e.controls),true,where+': Bedienleiste nach dem Start');
        if(await page.evaluate(()=>!!document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E"'))){await page.waitForFunction(()=>document.querySelector('[data-vid] video').currentTime>0,null,{timeout:15000});}
        await page.locator('[data-vid] video').evaluate(e=>e.pause());
      }
      // Menu: opens, lists every module, legal links and social icons, closes with Escape.
      const opener=page.locator(width>900?'.nl[data-mega]':'.mbtn');await opener.click();
      assert.equal(await page.locator('#mega').isVisible(),true,where+': Menü');assert.equal(await opener.getAttribute('aria-expanded'),'true');
      assert.deepEqual(await page.locator('#mega a.mi').evaluateAll(es=>es.map(e=>e.querySelector('b').textContent)),[...['Discover','Screener','AI Atlas','Fundamental','Quant','Technical','Elliott','Supertrader','Hedgefonds','Portfolios','Vorsorge','Insights'],'Die App'],where+': Menüeinträge');
      assert.deepEqual(await page.locator('#mega .mlegal ul a').evaluateAll(es=>es.map(e=>e.textContent)),['Impressum','Datenschutz','Kontaktformular','E-Mail'],where+': Rechtliches im Menü');
      assert.equal(await page.locator('#mega .sc').count(),2,where+': Social-Links im Menü');
      await page.keyboard.press('Escape');assert.equal(await page.locator('#mega').isVisible(),false,where+': Escape schließt das Menü');
      // Menu at the top (owner 14.11.2026). Phone: word mark left, menu button right, no bottom bar; the surface holds the pages,
      // the call to action, every module, legal links and social icons; focus stays inside, the page behind does not scroll.
      assert.equal(await page.locator('.dock').count(),0,where+': Leiste unten');
      if(width<=900){
        await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
        const bar=await page.locator('.bar').boundingBox(),brand=await page.locator('.bar .brand').boundingBox(),button=await page.locator('.mbtn').boundingBox();
        assert.ok(bar.height<=64&&brand.x+brand.width<=button.x&&Math.abs(button.x+button.width-(bar.x+bar.width))<14,where+': Wortmarke links, Menüknopf rechts, eine Zeile');
        assert.equal(await page.locator('.bar .cta').isVisible(),false,where+': „Benachrichtigen“ weicht dem Menüknopf');
        assert.equal(await page.locator('.nls').isVisible(),false,where+': Einträge stehen auf dem Telefon in der Menüfläche');
        await opener.click();
        assert.deepEqual(await page.locator('.mnav a.ml').evaluateAll(es=>es.map(e=>e.textContent.trim())),['Start','Die App','News','Aktienmagazin','Fragen'],where+': Seiten im Menü');
        assert.equal(await page.locator('.mnav a.cta').isVisible(),true,where+': Aufruf im Menü');
        assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('ml')),true,where+': Fokus im Menü');
        assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).overflowY),'hidden',where+': Seite hinter dem Menü scrollt nicht');
        const stops=await page.locator('#nav a[href]').evaluateAll(es=>es.filter(e=>e.getClientRects().length).length);
        for(let i=0;i<stops+2;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('#nav')),true,where+': Fokus bleibt im Menü');}
        assert.deepEqual(await page.locator('#mega a').evaluateAll(es=>es.filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return [e.textContent.trim().slice(0,30),Math.round(r.width),Math.round(r.height)];}).filter(r=>r[1]<44||r[2]<44)),[],where+': Bedienfläche im Menü unter 44 px');
        if(path===''||path==='faq/'){const open=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(open.violations.map(v=>({id:v.id,nodes:v.nodes.slice(0,4).map(n=>n.target.join(' '))})),[],where+': axe bei offenem Menü');}
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#mega').isVisible(),false,where+': Escape');assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('mbtn')),true,where+': Fokus zurück auf dem Menüknopf');
        assert.notEqual(await page.evaluate(()=>getComputedStyle(document.documentElement).overflowY),'hidden',where+': Scrollsperre gelöst');
        assert.equal(await opener.getAttribute('aria-expanded'),'false',where);
      }else{
        assert.equal(await page.locator('.mbtn').isVisible(),false,where+': am Rechner kein Menüknopf');assert.equal(await page.locator('.nls').isVisible(),true,where+': Einträge in der Leiste');
      }
      // One call to action at the bottom edge of the phone instead of the bar: appears after the button at the top of the page
      // has left the window, gives way to the same call, the signup and the footer; never on wider screens.
      const stick=page.locator('[data-stick]'),stickOn=()=>stick.evaluate(e=>e.classList.contains('on')&&getComputedStyle(e).visibility==='visible'&&getComputedStyle(e).display!=='none');
      const settle=state=>page.waitForFunction(on=>document.querySelector('[data-stick]').classList.contains('on')===on,state,{timeout:5000}).then(()=>true,()=>false);
      await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.waitForTimeout(150);
      assert.equal(await stickOn(),false,where+': Aufruf unten am Seitenanfang');
      const free=await page.evaluate(()=>{
        const goal=document.querySelector('[data-stick] a').getAttribute('href'),H=innerHeight;
        const same=[...document.querySelectorAll('main a.cta')].filter(a=>a.getAttribute('href')===goal&&a.getClientRects().length);
        const hero=same[0]&&same[0].getBoundingClientRect().top<H?same[0]:null,marker=hero||document.querySelector('main h1');
        const boxes=same.filter(a=>a!==hero).concat([...document.querySelectorAll('#newsletter,#dabei,.foot')]).map(e=>{const r=e.getBoundingClientRect();return [r.top+scrollY,r.bottom+scrollY];});
        for(let y=marker.getBoundingClientRect().bottom+scrollY+40;y<document.body.scrollHeight-H;y+=60)if(boxes.every(([t,b])=>b<y-5||t>y+H+5))return y;
        return -1;
      });
      if(width<560){
        assert.ok(free>0,where+': Stelle ohne denselben Aufruf im Fenster');
        await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),free);
        assert.equal(await settle(true)&&await stickOn(),true,where+': Aufruf unten erscheint nach dem Kopf der Seite');
        const box=await stick.locator('a').boundingBox();
        assert.ok(box.height>=44&&box.x>=0&&box.x+box.width<=width&&box.y+box.height<=height,where+': Aufruf unten liegt im Fenster');
        assert.equal((await stick.locator('a').innerText()).trim(),'Zum Start benachrichtigen',where);
        assert.equal(await page.evaluate(()=>{const goal=document.querySelector('[data-stick] a').getAttribute('href');return [...document.querySelectorAll('main a.cta,.bar a.cta')].filter(a=>a.getAttribute('href')===goal&&a.getClientRects().length).filter(a=>{const r=a.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight;}).length;}),0,where+': derselbe Aufruf doppelt im Fenster');
        await page.evaluate(()=>scrollTo({top:document.body.scrollHeight,behavior:'instant'}));
        assert.equal(await settle(false),true,where+': Aufruf unten weicht am Seitenende');
        assert.equal(await stick.locator('a').isVisible(),false,where+': Aufruf unten verdeckt den Fuß');
        const end=await page.evaluate(()=>[Math.round(document.querySelector('.foot .lnav').getBoundingClientRect().bottom),innerHeight]);
        assert.ok(end[0]<=end[1],where+': Rechtsfuß am Seitenende ganz zu sehen');
      }else{
        await page.evaluate(y=>scrollTo({top:y>0?y:1500,behavior:'instant'}),free);
        await page.waitForTimeout(250);assert.equal(await stick.locator('a').isVisible(),false,where+': kein Aufruf am unteren Rand auf breiten Fenstern');
      }
      await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
      if(path==='faq/'){
        const items=page.locator('details.faq');assert.equal(await items.count(),7);
        await items.nth(5).locator('summary').click();assert.equal(await items.nth(5).locator('p').isVisible(),true,where+': Antwort');
      }
      // WCAG A/AA. The module films carry their subtitles in the picture (open captions), which axe cannot see.
      await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
      const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).disableRules(path.startsWith('module/')?['video-caption']:[]).analyze();
      assert.deepEqual(axe.violations.map(v=>({id:v.id,nodes:v.nodes.slice(0,4).map(n=>n.target.join(' '))})),[],where+': axe');
      assert.deepEqual(problems,[],where+': Fehler, fehlende Dateien oder fremde Anfragen');
      // 200 % text: content may grow downwards, never sideways (same method as tests/browser.mjs).
      await page.evaluate(()=>{
        const rows=[...document.querySelectorAll('body *')].filter(e=>!e.closest('[aria-hidden="true"],.dev')&&e.namespaceURI==='http://www.w3.org/1999/xhtml'&&([...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||e.matches('input,button'))).map(e=>[e,parseFloat(getComputedStyle(e).fontSize),parseFloat(getComputedStyle(e).lineHeight)]);
        for(const[e,size,line]of rows){e.style.fontSize=size*2+'px';if(Number.isFinite(line))e.style.lineHeight=line*2+'px';}
      });
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width,where+': Überlauf bei 200 % Text');assert.equal(await page.locator('footer').isVisible(),true);
      metrics.push({name,path:'/'+path,height:layout.height,axeViolations:0});
      await page.close();
    }
    await context.close();
  }
  // Legal and confirmation pages: unchanged documents in the light design of the website (legal.css only).
  for(const [name,width,height] of [['desktop',1440,900],['iphone',390,844],['narrow',320,800]]){
    const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
    for(const path of ['impressum/','datenschutz/','newsletter/bestaetigen/','newsletter/bestaetigt/','newsletter/fehler/','instagram/teilnahmebedingungen/']){
      const where=`${name} /${path}`,page=await context.newPage(),problems=[];
      page.on('pageerror',e=>problems.push('pageerror '+e.message));
      page.on('console',m=>{if(m.type()==='error')problems.push('console '+m.text());});
      page.on('request',r=>{if(!r.url().startsWith(origin))problems.push('external '+r.url());});
      page.on('response',r=>{if(r.status()>=400)problems.push(r.status()+' '+r.url());});
      await page.goto(base+path,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
      const look=await page.evaluate(()=>({body:getComputedStyle(document.body).backgroundColor,text:getComputedStyle(document.querySelector('.legal h1')).color,brand:getComputedStyle(document.querySelector('.brand'),'::before').content,font:getComputedStyle(document.querySelector('.legal h1')).fontFamily,scrollWidth:document.documentElement.scrollWidth}));
      assert.deepEqual([look.body,look.text],['rgb(255, 255, 255)','rgb(11, 12, 14)'],where+': helles Kleid');assert.match(look.brand,/^"VISION UNIVERSE®"/,where+': Wortmarke');assert.match(look.font,/Inter/,where);
      assert.equal(look.scrollWidth,width,where+': horizontaler Überlauf');
      assert.match(await page.locator('.brand').evaluate(e=>e.getAttribute('aria-label')||e.querySelector('img').alt),/^Vision Universe/,where+': Name des Links aus dem unveränderten Markup');
      const small=await page.locator('.brand,.header-link,.footer a,.button').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {text:(e.getAttribute('aria-label')||e.textContent).trim(),w:Math.round(r.width),h:Math.round(r.height)};}).filter(r=>r.w<44||r.h<44));
      assert.deepEqual(small,[],where+': Bedienfläche unter 44 px');
      const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      assert.deepEqual(axe.violations.map(v=>({id:v.id,nodes:v.nodes.slice(0,4).map(n=>n.target.join(' '))})),[],where+': axe');
      assert.deepEqual(problems,[],where+': Fehler, fehlende Dateien oder fremde Anfragen');
      await page.evaluate(()=>{
        const rows=[...document.querySelectorAll('body *')].filter(e=>e.namespaceURI==='http://www.w3.org/1999/xhtml'&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(e=>[e,parseFloat(getComputedStyle(e).fontSize),parseFloat(getComputedStyle(e).lineHeight)]);
        for(const[e,size,line]of rows){e.style.fontSize=size*2+'px';if(Number.isFinite(line))e.style.lineHeight=line*2+'px';}
      });
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width,where+': Überlauf bei 200 % Text');
      await page.close();
    }
    await context.close();
  }
  // Every internal link resolves, anchors included; every page is reachable from the start page and leads back.
  const context=await browser.newContext(),page=await context.newPage();
  for(const [url,where] of links){
    const [plain,anchor]=url.split('#'),response=await page.request.get(plain);
    assert.equal(response.status(),200,`${where}: Ziel fehlt ${plain}`);
    if(anchor)assert.ok((await response.text()).includes(`id="${anchor}"`),`${where}: Anker fehlt ${url}`);
  }
  const reached=new Set(['/']);for(let grew=true;grew;){grew=false;for(const from of [...reached])for(const to of graph.get(from)||[])if(graph.has(to)&&!reached.has(to)){reached.add(to);grew=true;}}
  assert.deepEqual(site.pages.map(p=>'/'+p).filter(p=>!reached.has(p)),[],'Seite ohne Weg von der Startseite');
  for(const [from,to] of graph)assert.ok(to.has('/'),from+': kein Link zur Startseite');
  for(const target of ['/impressum/','/datenschutz/'])assert.ok(graph.get('/').has(target)&&links.has(base+target.slice(1)),'Startseite verlinkt '+target);
  // Without JavaScript: content visible, navigation by ordinary links, native video controls, FAQ opens.
  const plain=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}}),nojs=await plain.newPage();
  await nojs.goto(base,{waitUntil:'load'});
  assert.equal(await nojs.locator('.rv').evaluateAll(es=>es.filter(e=>getComputedStyle(e).opacity!=='1').length),0,'ohne JavaScript ist nichts versteckt');
  // Menu without JavaScript: the button jumps to #mega, which opens the same surface (CSS :target); no call to action at the bottom edge.
  assert.equal(await nojs.locator('[data-stick] a').isVisible(),false,'ohne JavaScript kein Aufruf am unteren Rand');
  // (The surface fades in for 0.22 s; the pause lets it come to rest before the next click.)
  await nojs.locator('.mbtn').click();assert.equal(await nojs.locator('#mega').isVisible(),true,'ohne JavaScript öffnet der Knopf das Menü');
  assert.equal(await nojs.locator('#mega a.mi').count(),13);await nojs.waitForTimeout(500);
  await nojs.locator('.mclose').click();assert.equal(await nojs.locator('#mega').isVisible(),false,'ohne JavaScript schließt „Menü schließen“');
  await nojs.locator('.mbtn').click();await nojs.waitForTimeout(500);await nojs.locator('.mnav a.ml',{hasText:'News'}).click();await nojs.waitForURL('**/news/');
  assert.equal(await nojs.locator('#mega').isVisible(),false);await nojs.goto(base,{waitUntil:'load'});
  await nojs.goto(base+'module/quant/');assert.equal(await nojs.locator('[data-vid] video[controls]').count(),1);assert.equal(await nojs.locator('[data-vid] .play').isVisible(),false);
  await nojs.goto(base+'faq/');await nojs.locator('details.faq').nth(6).locator('summary').click();assert.equal(await nojs.locator('details.faq').nth(6).locator('p').isVisible(),true);
  await plain.close();await context.close();
  console.log(JSON.stringify({pages:site.pages.length,viewports:['1440 × 900','390 × 844','320 × 800'],checks:'no errors, no missing files, no cross-origin request, no horizontal overflow, axe WCAG A/AA (also with the menu open), 200 % text, 44 px targets, menu at the top (focus stays inside, Escape, scroll lock), one call to action at the bottom edge on phones, videos, internal links and anchors, reachability, no JavaScript; six legal and confirmation pages in the light design',links:links.size,heights:metrics.filter(m=>m.path==='/')},null,1));
}finally{await browser.close();await new Promise(r=>server.close(r));}
