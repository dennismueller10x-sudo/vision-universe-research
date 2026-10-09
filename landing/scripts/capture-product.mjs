// Capture the existing generated homepage, never generate financial values here.
// Run with RESEARCH_PREVIEW_URL=http://127.0.0.1:8765/ after starting a repo server.
import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {root} from './build.mjs';
const sourceURL=process.env.RESEARCH_PREVIEW_URL || 'http://127.0.0.1:8765/';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2,reducedMotion:'reduce'});
  await page.goto(sourceURL,{waitUntil:'networkidle'});
  await page.addStyleTag({content:'.hero .stage > :not(.phone){visibility:hidden!important}.hero .phone{transform:none!important;animation:none!important;left:80px!important;top:0!important}.hero .stage .phone~*{display:none!important}.phone *{animation:none!important;transition:none!important}.hero .orbit{display:none!important}'});
  await page.evaluate(()=>document.fonts.ready);
  await page.locator('.hero .phone').screenshot({path:root+'assets/research-preview.png',animations:'disabled'});
  await writeFile(root+'assets/research-preview.source.json',JSON.stringify({source:'index.html .hero .phone',commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),capturedAt:new Date().toISOString(),note:'Unveränderte Werte der generierten Research-Startseite. Capture ohne umliegende Overlays und ohne Geräte-Rotation. Statische Designvorschau, keine Live-Daten.'},null,2)+'\n');
} finally {await browser.close();}
