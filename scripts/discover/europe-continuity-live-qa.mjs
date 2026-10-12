/** All admitted Europe histories in actual browser SVGs. No provider calls.
 * QA_URL is loopback only; live mode waits for the exact publication SHA.
 * Importing this module does not launch browsers or read credentials. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {publicTarget,waitForRelease,redactSecrets} from './europe-public-live-qa.mjs';
import {accessStateFor,verifierForKey,STORAGE_KEY} from '../access-gate/build.mjs';

export function qaTarget(local,site){
  if(!local)return publicTarget(site);
  const u=new URL(local);
  if(!['http:','https:'].includes(u.protocol)||!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('LOOPBACK_QA_URL_REQUIRED');
  return u.origin;
}

/** A DOM-independent validator, also injected into the browser. */
export function validateRenderedEvidence(e){
  const demand=(ok,reason)=>{if(!ok)throw Error(reason);};
  demand(e&&e.range&&Array.isArray(e.expected)&&e.expected.length>=2,'EXPECTED_REAL_POINTS_REQUIRED');
  demand(e.svgRange===e.range,'RENDERED_RANGE_MISMATCH');
  demand(e.viewBox.length===4&&e.viewBox.every(Number.isFinite)&&e.viewBox[2]>0&&e.viewBox[3]>0,'INVALID_VIEWBOX');
  demand(Array.isArray(e.points)&&e.points.length===e.expected.length,'RENDERED_POINT_COUNT_MISMATCH');
  e.points.forEach((p,i)=>{demand(p.date===e.expected[i][0]&&p.close===e.expected[i][1],'RENDERED_APPROVED_POINT_MISMATCH');demand(Number.isFinite(p.x)&&Number.isFinite(p.y),'NONFINITE_RENDERED_POINT');demand(p.x>=-0.11&&p.y>=-0.11&&p.x<=e.viewBox[2]+0.11&&p.y<=e.viewBox[3]+0.11,'POINT_OUTSIDE_VIEWBOX');});
  demand(e.expected.at(-1)[0]===e.latest.date&&e.expected.at(-1)[1]===e.latest.close,'LATEST_CANONICAL_MISMATCH');
  demand(Array.isArray(e.linePaths)&&e.linePaths.length>0,'EMPTY_LINE_PATH');
  for(const path of [...e.linePaths,...e.fillPaths]){
    demand(typeof path==='string'&&path.trim().length>0&&!/NaN|Infinity|undefined|null/.test(path),'NONFINITE_SVG_PATH');
    demand(!/[^MLZmlz\d\s.,+\-eE]/.test(path),'INVALID_SVG_PATH_COMMAND');
    demand((path.match(/[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g)||[]).map(Number).every(Number.isFinite),'NONFINITE_SVG_PATH');
  }
  const moves=e.linePaths.reduce((n,d)=>n+(d.match(/M/g)||[]).length,0);
  demand(moves===e.groups.length&&Number(e.segmentCount)===e.groups.length,'SEGMENT_BRIDGING_OR_OMISSION');
  const commands=e.linePaths.flatMap(d=>[...d.matchAll(/([ML])([-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?)[\s,]+([-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?)/g)].map(m=>({command:m[1],x:Number(m[2]),y:Number(m[3])}))),starts=new Set(e.groups.map(g=>g[0][0]));
  demand(commands.length===e.points.length,'LINE_OBSERVATION_OMISSION');
  commands.forEach((c,i)=>demand(c.command===(starts.has(e.points[i].date)?'M':'L')&&Math.abs(c.x-e.points[i].x)<=0.11&&Math.abs(c.y-e.points[i].y)<=0.11,'LINE_SEGMENT_BOUNDARY_MISMATCH'));
  demand(e.fillPaths.reduce((n,d)=>n+(d.match(/Z/g)||[]).length,0)===e.groups.length,'FILL_BRIDGING_OR_OMISSION');
  const fillStarts=e.fillPaths.flatMap(d=>[...d.matchAll(/M([-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?)[\s,]+([-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?)/g)].map(m=>({x:Number(m[1]),y:Number(m[2])})));
  demand(fillStarts.length===e.groups.length,'FILL_SEGMENT_BOUNDARY_MISMATCH');
  fillStarts.forEach((c,i)=>{const p=e.points.find(p=>p.date===e.groups[i][0][0]);demand(Math.abs(c.x-p.x)<=0.11&&Math.abs(c.y-p.y)<=0.11,'FILL_SEGMENT_BOUNDARY_MISMATCH');});
  const isolated=e.groups.filter(g=>g.length===1).map(g=>g[0]);
  for(const p of isolated){const coordinate=e.points.find(x=>x.date===p[0]);demand(e.markers.some(m=>m.date===p[0]&&m.visible&&m.radius>0&&Math.abs(m.x-coordinate.x)<=0.11&&Math.abs(m.y-coordinate.y)<=0.11),'ISOLATED_APPROVED_POINT_INVISIBLE');}
  demand(e.labels.length>=2&&e.labels.every(l=>l.text.trim()&&Number.isFinite(l.x)&&Number.isFinite(l.y)&&l.x>=-1&&l.y>=-1&&l.x+l.width<=e.viewBox[2]+1&&l.y+l.height<=e.viewBox[3]+1),'AXIS_LABEL_CLIPPED_OR_INVALID');
  demand(e.layout.width>0&&e.layout.height>0&&e.layout.documentWidth<=e.layout.viewportWidth+1,'CHART_LAYOUT_OVERFLOW');
  return {range:e.range,from:e.expected[0][0],to:e.expected.at(-1)[0],points:e.points.length,segments:e.groups.length,isolatedPoints:isolated.length,dateLabels:e.labels.filter(l=>l.kind==='date').map(l=>l.text),passed:true};
}

/** Uses actual browser text geometry, not guessed character widths. */
export function captureSvgEvidence(svg,expected,segments,latest,range){
  if(!svg)throw Error('REAL_BROWSER_SVG_REQUIRED');
  const dates=new Set(expected.map(p=>p[0])),groups=segments.map(s=>s.filter(p=>dates.has(p[0]))).filter(s=>s.length),r=svg.getBoundingClientRect();
  return {range,svgRange:svg.getAttribute('data-range'),expected,latest,groups,viewBox:svg.getAttribute('viewBox').trim().split(/\s+/).map(Number),points:svg.__punkte||[],segmentCount:svg.getAttribute('data-segment-count'),linePaths:[...svg.querySelectorAll('.dx-range-line')].map(p=>p.getAttribute('d')),fillPaths:[...svg.querySelectorAll('.dx-art-fill')].map(p=>p.getAttribute('d')),markers:[...svg.querySelectorAll('.dx-range-observation')].map(n=>{const s=getComputedStyle(n);return {date:n.getAttribute('data-date'),x:Number(n.getAttribute('cx')),y:Number(n.getAttribute('cy')),radius:Number(n.getAttribute('r')),visible:s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0&&s.fill!=='none'};}),labels:[...svg.querySelectorAll('.dx-range-date,.dx-range-axis')].map(n=>{const b=n.getBBox();return {text:n.textContent,kind:n.classList.contains('dx-range-date')?'date':'price',x:b.x,y:b.y,width:b.width,height:b.height};}),layout:{width:r.width,height:r.height,documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth}};
}

export function validateUniverse(rows,expected=449){
  assert.equal(rows.length,expected,'ALL_ADMITTED_SECURITIES_REQUIRED');
  assert.equal(new Set(rows.map(r=>r.securityId)).size,expected,'UNIQUE_CANONICAL_SECURITIES_REQUIRED');
  for(const row of rows){assert.ok(row.ranges.some(r=>r.range==='MAX'&&r.passed),'MAX_RENDER_REQUIRED');assert.ok(row.ranges.every(r=>r.passed),'EVERY_OFFERED_RANGE_REQUIRED');}
}

export async function run(){
  const require=createRequire(import.meta.url),local=process.env.QA_URL,origin=qaTarget(local,process.env.SITE_URL),out=resolve(process.env.QA_OUT||'/tmp/europe-continuity-browser-qa');
  let pw;try{pw=require('playwright');}catch{pw=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');}
  let axePath;try{axePath=require.resolve('axe-core/axe.min.js');}catch{axePath='/workspace/marketstack-europe21-private/browser-tools/node/node_modules/axe-core/axe.min.js';}
  const password=process.env.RESEARCH_ACCESS_PASSWORD||(process.env.RESEARCH_ACCESS_LOGIN_FILE?(await readFile(process.env.RESEARCH_ACCESS_LOGIN_FILE,'utf8')).trim():null),state=password?accessStateFor(password):null,secrets=[password,state?.key],safe=v=>redactSecrets(v,secrets);
  if(!local&&!state)throw Error('APPROVED_ACCESS_REQUIRED');
  const deployment=local?null:await waitForRelease({origin,expected:process.env.EXPECTED_SOURCE_SHA});
  await mkdir(out,{recursive:true,mode:0o700});
  const summaries=[],scenarios=[['chromium-desktop','chromium',{viewport:{width:1440,height:950}}],['webkit-iphone13','webkit',pw.devices['iPhone 13']]];
  for(const [key,engine,device]of scenarios){
    if(process.env.QA_ENGINE&&process.env.QA_ENGINE!==key)continue;
    const browser=await pw[engine].launch({headless:true,...(engine==='chromium'?{args:['--no-sandbox'],...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})}:process.env.VU_EUROPE_WEBKIT_EXECUTABLE?{executablePath:process.env.VU_EUROPE_WEBKIT_EXECUTABLE}:{})});
    const report={schema:'vu-europe-continuity-browser-1',scenario:key,browserVersion:browser.version(),iPhoneEmulation:key==='webkit-iphone13',sourceCommit:deployment?.sourceCommit||process.env.EXPECTED_SOURCE_SHA||null,sourceVerification:deployment?'LIVE_EXACT_RELEASE':'LOCAL_SOURCE_NOT_PUBLICATION_VERIFIED',origin,startedAt:new Date().toISOString(),rows:[],details:[],screenshots:[],accessibility:[],providerRequests:[],pageErrors:[]};
    try{
      const {defaultBrowserType,...options}=device,page=await browser.newPage(options),requests=[];
      page.setDefaultTimeout(90000);page.on('pageerror',e=>report.pageErrors.push(safe(String(e))));page.on('request',r=>requests.push(new URL(r.url()).pathname));
      await page.route('**/*',route=>{const host=new URL(route.request().url()).hostname;if(/(^|\.)(marketstack|tiingo|stooq)\./i.test(host)){report.providerRequests.push(host);return route.abort();}return route.continue();});
      if(state){const res=await page.request.get(origin+'/__research/config.json');assert.ok(res.ok());const gate=await res.json();assert.equal(verifierForKey(state.key),gate.verifier);await page.addInitScript(({key,state,origin})=>{if(location.origin===origin)localStorage.setItem(key,JSON.stringify(state));},{key:gate.storageKey||STORAGE_KEY,state,origin});}
      await page.goto(origin+'/discover/',{waitUntil:'domcontentloaded'});await page.waitForSelector('[data-surface="hero"] .v2-stock');await page.waitForSelector('#v2-main[aria-busy="false"]');
      report.homeResources=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>({path:new URL(r.name).pathname,decodedBytes:r.decodedBodySize,durationMs:Math.round(r.duration)})));
      report.homeDecodedBytes=report.homeResources.reduce((n,r)=>n+r.decodedBytes,0);report.homeRequestCount=requests.length;report.homePaint=await page.evaluate(()=>performance.getEntriesByType('paint').map(p=>({name:p.name,timeMs:Math.round(p.startTime)})));
      report.homeLongSeriesRequests=requests.filter(p=>p.includes('/series-long/')).length;assert.equal(report.homeLongSeriesRequests,0,'HOME_HISTORY_MUST_STAY_LAZY');assert.equal(requests.includes('/discover/data/search/GLOBAL.json'),false);assert.equal(requests.includes('/discover/data/europe/catalog.json'),false);
      // Use the existing browse route to initialize its deliberately lazy
      // canonical adapter after recording the untouched home resource budget.
      await page.evaluate(()=>location.hash='#/c/EUROPE/all');await page.waitForSelector('.dx-grid .dx-poster');await page.waitForSelector('#v2-main[aria-busy="false"]');
      const inject=async()=>page.addScriptTag({content:'window.__continuityCapture='+captureSvgEvidence.toString()+';window.__continuityValidate='+validateRenderedEvidence.toString()+';'});
      await inject();
      const identities=await page.evaluate(async()=>{const r=await VUDiscover.europeProduct.browse();if(r.state!=='AVAILABLE')throw Error('EUROPE_CANONICAL_UNIVERSE_REQUIRED');window.__continuityCards=r.data.cards;return r.data.cards.map(c=>({securityId:c.securityId,mic:c.exchange||c.mic||c.europeRef?.mic||'UNKNOWN'}));});
      assert.equal(identities.length,449);const representatives=new Map();
      for(let i=0;i<identities.length;i++){
        const row=await page.evaluate(async id=>{
          const card=window.__continuityCards.find(c=>c.securityId===id),r=await VUDiscover.europeProduct.series({region:'EUROPE',securityId:id},{range:'MAX'});
          if(r.state!=='AVAILABLE'||!r.data.segments?.length)throw Error('CANONICAL_FULL_HISTORY_REQUIRED:'+id);
          const data=r.data;if(data.displayWindow?.truncated)throw Error('ORDINARY_GAPS_MUST_NOT_TRUNCATE_FULL_HISTORY:'+id);
          for(const flag of ['TECHNICAL_READY','QUANT_READY','SUPERTRADER_READY','BACKTEST_READY'])if(card.readiness[flag])throw Error('STRICT_ANALYTICS_GATE_CHANGED:'+id);
          const host=document.createElement('section');host.style.cssText='width:calc(100vw - 32px);max-width:1100px;margin:16px auto';document.body.append(host);
          const ranges=[];try{for(const range of ['1M','1Y','5Y','MAX']){if(!VUCore.ChartHistory.available(data.points,range))continue;const points=VUCore.ChartHistory.sliceRange(data.points,range).points;const svg=VUDiscover.MicroChart.renderRange(points,{width:host.clientWidth,height:innerWidth<860?300:380,symbol:card.symbol,range,segments:data.segments});if(!svg)throw Error('SVG_REQUIRED:'+id+':'+range);host.replaceChildren(svg);const evidence=__continuityCapture(svg,points,data.segments,{date:card.asOf,close:card.price.value},range);ranges.push(__continuityValidate(evidence));}}finally{host.remove();}
          return {securityId:id,mic:data.mic||card.exchange||card.mic||'UNKNOWN',from:data.from,to:data.to,totalPoints:data.points.length,ranges};
        },identities[i].securityId);
        report.rows.push(row);if(!representatives.has(row.mic))representatives.set(row.mic,row.securityId);
        if((i+1)%25===0)console.log(JSON.stringify({scenario:key,rendered:i+1,total:449}));
      }
      validateUniverse(report.rows);representatives.set('2G_GOLDEN','ref_2GB_DE_XETR');
      async function shot(name){
        async function record(path,kind){const b=await readFile(path);report.screenshots.push({path,kind,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});}
        const path=out+'/'+key+'-'+name+'.png';await page.screenshot({path});await record(path,'viewport');
        const section=page.locator('.dx-chapter--chart');if(await section.count()){const chartPath=out+'/'+key+'-'+name+'-chart.png';await section.screenshot({path:chartPath});await record(chartPath,'full-chart-section');}
        // Keep the original UI captures above. A separately labelled plot
        // capture temporarily hides fixed chrome which WebKit can paint over
        // an element screenshot; it never changes the curve or its geometry.
        const plot=page.locator('.dx-range-chart');if(await plot.count()){
          await page.evaluate(()=>{const chart=document.querySelector('.dx-chapter--chart');window.__continuityChrome=[...document.querySelectorAll('body *')].filter(n=>['fixed','sticky'].includes(getComputedStyle(n).position)&&!chart.contains(n)&&!n.contains(chart)).map(n=>({node:n,value:n.style.getPropertyValue('visibility'),priority:n.style.getPropertyPriority('visibility')}));window.__continuityChrome.forEach(x=>x.node.style.setProperty('visibility','hidden','important'));});
          try{const plotPath=out+'/'+key+'-'+name+'-plot.png';await plot.screenshot({path:plotPath});await record(plotPath,'plot-only-fixed-chrome-hidden');}finally{await page.evaluate(()=>{for(const x of window.__continuityChrome||[]){if(x.value)x.node.style.setProperty('visibility',x.value,x.priority);else x.node.style.removeProperty('visibility');}delete window.__continuityChrome;});}
        }
      }
      async function audit(name){await page.addScriptTag({path:axePath});const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));report.accessibility.push({flow:name,violations:result.violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)}))});assert.equal(result.violations.length,0,name+' accessibility');}
      for(const [mic,id]of representatives){
        await page.goto(origin+'/discover/#/s/EUROPE/'+id,{waitUntil:'domcontentloaded'});await page.waitForSelector('.dx-range-chart');await page.waitForSelector('#v2-main[aria-busy="false"]');await inject();
        const labels=await page.locator('.dx-tf button:not([disabled])').allTextContents(),row={securityId:id,mic,offered:labels,ranges:[]};
        for(const [range,label]of Object.entries({'1M':'1M','3M':'3M','6M':'6M','1Y':'1J','3Y':'3J','5Y':'5J','MAX':'MAX'})){
          if(!labels.includes(label)||mic!=='2G_GOLDEN'&&!['1M','1Y','5Y','MAX'].includes(range))continue;
          await page.locator('.dx-tf button').filter({hasText:new RegExp('^'+label+'$')}).click();await page.waitForFunction(range=>document.querySelector('.dx-range-chart')?.getAttribute('data-range')===range,range);
          const receipt=await page.evaluate(async({id,range})=>{const r=await VUDiscover.europeProduct.series({region:'EUROPE',securityId:id},{range:'MAX'}),d=await VUDiscover.europeProduct.detail(id),points=VUCore.ChartHistory.sliceRange(r.data.points,range).points;return __continuityValidate(__continuityCapture(document.querySelector('.dx-range-chart'),points,r.data.segments,{date:d.data.asOf,close:d.data.price.value},range));},{id,range});row.ranges.push(receipt);
          if(range==='MAX')await shot(mic+'-'+id+'-max');
        }
        report.details.push(row);await audit(mic+'-'+id);
        if(mic==='2G_GOLDEN'){assert.ok(row.ranges.some(r=>r.range==='MAX'));await page.locator('.v2-watch-button').click();await page.waitForSelector('.v2-watch-button[aria-pressed="true"]');assert.equal(await page.locator('.v2-watch-button').getAttribute('aria-pressed'),'true');await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.v2-watch-button[aria-pressed="true"]');await page.locator('.v2-watch-button').click();await page.waitForSelector('.v2-watch-button[aria-pressed="false"]');assert.equal(await page.locator('.v2-watch-button').getAttribute('aria-pressed'),'false');report.watchlist={securityId:id,add:true,save:true,reload:true,remove:true};for(const theme of ['dark','light']){await page.evaluate(t=>localStorage.setItem('vu-discover-theme-v1',t),theme);await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.dx-range-chart');await audit('2g-'+theme);await shot('2g-'+theme);}}
      }
      assert.equal(report.providerRequests.length,0);assert.equal(report.pageErrors.length,0);report.passed=true;report.finishedAt=new Date().toISOString();report.totalRenderedRanges=report.rows.reduce((n,r)=>n+r.ranges.length,0);
      const path=out+'/'+key+'.json';await writeFile(path,safe(JSON.stringify(report,null,2))+'\n');await rm(out+'/'+key+'-failed.json',{force:true});summaries.push({scenario:key,path,sha256:createHash('sha256').update(await readFile(path)).digest('hex'),securities:report.rows.length,ranges:report.totalRenderedRanges,passed:true});console.log(JSON.stringify(summaries.at(-1)));
    }catch(error){report.failure=safe(error.stack||error);await writeFile(out+'/'+key+'-failed.json',safe(JSON.stringify(report,null,2))+'\n');throw Error(report.failure);}finally{await browser.close();}
  }
  if(!summaries.length)throw Error('BROWSER_SCENARIO_REQUIRED');await writeFile(out+'/receipt.json',JSON.stringify({schema:'vu-europe-continuity-browser-receipt-1',deployment,reports:summaries},null,2)+'\n');return summaries;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{await run();}catch(e){console.error(String(e.stack||e));process.exitCode=1;}}
