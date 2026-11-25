import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'path';
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1920}});
await p.goto('file://'+path.resolve('cover.html'));await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(300);
await p.screenshot({path:'cover.png'});await b.close();
