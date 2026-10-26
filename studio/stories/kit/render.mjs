#!/usr/bin/env node
// Rendert ein Erklaervideo als Bildfolge (30 fps). Die Seite muss ueber einen lokalen Server laufen (Repo-Wurzel), z. B.
//   python3 -m http.server 8765   (im Repo-Wurzelordner)
//   node studio/stories/kit/render.mjs v=quant timing=timing.json out=frames [i0=0 i1=300] [ovl=1] [base=http://127.0.0.1:8765]
// ovl=1: durchsichtiger Grund (PNG), sonst JPEG. Mehrere Prozesse ueber i0/i1 parallel starten.
import {createRequire} from 'node:module';
import {mkdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright')); }
const a = Object.fromEntries(process.argv.slice(2).map(x => x.split('=')));
const T = JSON.parse(readFileSync(a.timing, 'utf8')), fps = 30, ovl = a.ovl === '1';
const n = Math.round(T.TOTAL * fps), i0 = Number(a.i0 || 0), i1 = Math.min(n, Number(a.i1 || n));
mkdirSync(a.out, {recursive: true});
const b = await pw.chromium.launch();
const p = await b.newPage({viewport: {width: 1080, height: 1920}, deviceScaleFactor: 1});
await p.addInitScript(`window.TIMING=${JSON.stringify(T)};`);
await p.goto(`${a.base || 'http://127.0.0.1:8765'}/studio/stories/kit/story.html?v=${a.v}${ovl ? '&ovl=1' : ''}`);
await p.waitForFunction('window.__ready===true', null, {timeout: 30000});
const t0 = Date.now();
for (let i = i0; i < i1; i++) {
  await p.evaluate(t => window.render(t), i / fps);
  const path = join(a.out, `f${String(i).padStart(5, '0')}.${ovl ? 'png' : 'jpg'}`);
  for (let k = 0; ; k++) { try { await p.screenshot(ovl ? {path, omitBackground: true} : {path, type: 'jpeg', quality: 93}); break; } catch (e) { if (k >= 2) throw e; } }
}
console.log(`${a.v}: ${i1 - i0} Bilder in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await b.close();
