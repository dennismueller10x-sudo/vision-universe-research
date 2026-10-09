// Isolated snapshot of existing presentation only. Never regenerate market data.
// Run from this checkout after explicitly selecting the reviewed Research commit.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {root} from './build.mjs';

const ref=process.argv[2];
if(!ref || !/^[a-f0-9]{40}$/.test(ref))throw Error('Expliziter Research-Commit (40 Zeichen) fehlt.');
const repository=resolve(root,'..');
const get=path=>execFileSync('git',['show',`${ref}:${path}`],{cwd:repository,maxBuffer:4*1024*1024});
const source=get('index.html').toString();
const header=source.match(/<header class="lp-head"[\s\S]*?<\/header>/)?.[0];
const symbols=source.match(/<svg width="0" height="0"[\s\S]*?<\/svg>/)?.[0];
const hero=source.match(/<section class="hero"[\s\S]*?<\/section>/)?.[0];
if(!header || !symbols || !hero || /%%[A-Z_]+%%/.test(hero))throw Error('Fertige originale Research-Darstellung fehlt.');
await mkdir(resolve(root,'reference'),{recursive:true});
await mkdir(resolve(root,'assets/home'),{recursive:true});
await mkdir(resolve(root,'assets/fonts'),{recursive:true});
const css=get('assets/home/home.css');
await writeFile(resolve(root,'assets/home/home.css'),css.toString().replace('url(/assets/fonts/inter-latin.woff2)','url(../fonts/inter-latin.woff2)'));
await writeFile(resolve(root,'assets/home/hero-intro.js'),get('assets/home/hero-intro.js'));
await writeFile(resolve(root,'assets/fonts/inter-latin.woff2'),get('assets/fonts/inter-latin.woff2'));
await writeFile(resolve(root,'assets/vision-universe-logo.png'),get('assets/vision-universe-logo.png'));
const local=s=>s.replaceAll('/assets/vision-universe-logo.png','../assets/vision-universe-logo.png');
await writeFile(resolve(root,'reference/index.html'),`<!doctype html><html lang="de" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Research-Startseite · Original-Hero als Referenz</title><link rel="stylesheet" href="../assets/home/home.css"><script src="../assets/home/hero-intro.js" defer></script></head><body>${local(header)}${symbols}<main>${local(hero)}</main></body></html>\n`);
// Replace only the owned Hero/symbol snapshot; all newsletter configuration stays intact.
let landing=await readFile(resolve(root,'index.html'),'utf8');
const adapted=local(hero).replaceAll('../assets/','./assets/')
  .replace(/<span class="hero-badge">[\s\S]*?<\/span>/,'<span class="hero-badge"><b>App</b> bald verfügbar</span>')
  .replace(/<h1>[\s\S]*?<\/h1>/,'<h1 id="hero-title">Investieren mit <em>Weitblick.</em> Bald in einer&nbsp;App.</h1>')
  .replace(/<p class="lead">[\s\S]*?<\/p>/,'<p class="lead">Vision Universe bündelt Aktienresearch in einer App. Bald verfügbar.</p>')
  .replace(/<div class="hero-cta">[\s\S]*?<\/div>/,'<div class="hero-cta"><a class="btn btn-app btn-xl" href="#newsletter">Zum App-Start informiert werden <svg aria-hidden="true"><use href="#i-arrow"/></svg></a></div>')
  .replace(/\s*<ul class="hero-checks">[\s\S]*?<\/ul>/,'')
  .replace('<section class="hero" id="hero">','<section class="hero" id="hero" aria-labelledby="hero-title">')
  .replace(/\n<\/section>$/,'\n  <p class="shell preview-caption">Vorschau des bestehenden Research. Keine Live-Kurse.</p>\n</section>');
landing=landing.replace(/<!-- RESEARCH-SYMBOLS:START -->[\s\S]*?<!-- RESEARCH-SYMBOLS:END -->/,`<!-- RESEARCH-SYMBOLS:START -->\n${symbols}\n<!-- RESEARCH-SYMBOLS:END -->`)
 .replace(/<!-- RESEARCH-HERO:START -->[\s\S]*?<!-- RESEARCH-HERO:END -->/,`<!-- RESEARCH-HERO:START -->\n${adapted}\n<!-- RESEARCH-HERO:END -->`);
await writeFile(resolve(root,'index.html'),landing);
await writeFile(resolve(root,'reference/source.json'),JSON.stringify({commit:ref,source:'index.html: .lp-head, SVG-Symbole, .hero; assets/home/home.css; assets/home/hero-intro.js',cssSha256:createHash('sha256').update(css).digest('hex'),cssAdaptation:'Nur Font-URL relativ, damit das isolierte Projekt auch unter einem GitHub-Pages-Projektpfad funktioniert.',productValues:'Unverändertes generiertes Hero-Markup dieses Research-Commits. Keine neuen Kurse oder Ergebnisse.',reference:'Nur der originale Header/Hero, keine geschützten Skripte; nicht Teil des veröffentlichten Builds.'},null,2)+'\n');
console.log('Originales Research-Design isoliert übernommen: '+ref);
