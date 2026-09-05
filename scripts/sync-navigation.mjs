import {readdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

// Also run on future HTML pages: the shared element reads the same menu everywhere.
const css='<link rel="stylesheet" href="/assets/site-navigation.css">';
const component='<vu-navigation></vu-navigation><script src="/assets/site-navigation.js"></script>';
async function walk(dir='.') {
  for (const entry of await readdir(dir,{withFileTypes:true})) {
    if (entry.name.startsWith('.') || entry.name==='node_modules') continue;
    const file=path.join(dir,entry.name);
    if(entry.isDirectory()){await walk(file);continue;}
    if(!file.endsWith('.html'))continue;
    let html=await readFile(file,'utf8');
    if(!/<body\b/i.test(html))continue;
    const original=html;
    if(!html.includes('/assets/site-navigation.css'))html=html.replace(/<\/head>/i,css+'</head>');
    if(!html.includes('<vu-navigation>'))html=html.replace(/<body\b[^>]*>/i,match=>match+component);
    if(html!==original)await writeFile(file,html);
  }
}
await walk();
