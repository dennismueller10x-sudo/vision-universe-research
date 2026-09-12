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
    // VU2 preview owns its full responsive shell; do not prepend a second header.
    if(file===path.join('vu2','index.html'))continue;
    let html=await readFile(file,'utf8');
    if(!/<body\b/i.test(html))continue;
    const original=html;
    if(!html.includes('/assets/site-navigation.css'))html=html.replace(/<\/head>/i,css+'</head>');
    // Auf das TAG pruefen, nicht auf die attributlose Schreibweise: seit
    // Discover gibt es <vu-navigation theme="dark">, und ein
    // includes('<vu-navigation>') findet die Seite dann nicht - der Lauf
    // haette ihr eine ZWEITE Navigation vorangestellt, hell ueber dunkel.
    if(!/<vu-navigation[\s>]/i.test(html))html=html.replace(/<body\b[^>]*>/i,match=>match+component);
    if(html!==original)await writeFile(file,html);
  }
}
await walk();
