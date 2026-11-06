// Tests the real iframe/message bridge with a mocked Capacitor App plugin.
// It invokes controls programmatically; touch/layout QA is gesture-browser.mjs.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const arg = (k, d) => process.argv.find(a=>a.startsWith('--'+k+'='))?.slice(k.length+3) || d;
const require = createRequire(import.meta.url);
const modules = arg('modules', process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES);
const {chromium} = require(modules ? modules+'/playwright' : 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const base = arg('url', 'http://127.0.0.1:8765');
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
try {
  const ctx = await browser.newContext({viewport:{width:390,height:844},userAgent:'VUApp/1'});
  await ctx.addInitScript(()=>{
    const App = {addListener:(event,fn)=>{if(event==='backButton')globalThis.__back=fn;},minimizeApp:()=>{globalThis.__min=(globalThis.__min||0)+1;}};
    globalThis.Capacitor={isNativePlatform:()=>true,Plugins:{App}}; globalThis.VUNative={App};
  });
  // Browser sees the same origins as the native shell. All resources come from the local repo.
  await ctx.route('https://localhost/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let body='';
    try {body=await readFile(root+(path.startsWith('/assets/')?path.slice(1):'app/www'+(path==='/'?'/index.html':path)),'utf8');} catch { /* absent generated plugin/config: use injected mock */ }
    await route.fulfill({body,contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html'});
  });
  await ctx.route('https://research.visionuniverse.de/**',async route=>{
    const url=new URL(route.request().url());
    await route.fulfill({response:await ctx.request.get(base+url.pathname+url.search)});
  });
  const page=await ctx.newPage(); await page.goto('https://localhost/'); await page.waitForFunction(()=>globalThis.__vuReady);
  const navigation = page.waitForEvent('framenavigated', {predicate:f=>f.url().includes('research.visionuniverse.de/quant/')});
  await page.locator('#tabs [data-view=quant]').evaluate(button=>button.click());
  const frame=await navigation;
  assert(frame); await frame.waitForLoadState(); await frame.evaluate(()=>location.hash='/aktie/NVDA');
  await frame.locator('summary').filter({hasText:'Zone, Ungültig-Marke und alle Bedingungen'}).waitFor();
  // Wrong-origin/source messages must not minimize the shell.
  await page.evaluate(()=>dispatchEvent(new MessageEvent('message',{origin:'https://example.org',data:{type:'vu:back-result',handled:false}})));
  assert.equal(await page.evaluate(()=>globalThis.__min||0),0);
  await frame.locator('summary').filter({hasText:'Zone, Ungültig-Marke und alle Bedingungen'}).evaluate(s=>s.click());
  await page.evaluate(()=>globalThis.__back()); await frame.locator('.vu-gesture-sheet').waitFor({state:'detached'});
  await page.evaluate(()=>globalThis.__back()); await frame.waitForURL(url=>!url.hash.includes('NVDA'));
  await page.evaluate(()=>globalThis.__back()); await page.waitForFunction(()=>globalThis.__min===1);
  console.log('iframe native origin bridge: sheet/history/minimize PASS');
} finally {await browser.close();}
