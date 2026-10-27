#!/usr/bin/env node
// Baut die App-Fassung eines Highlights der Willkommensseite aus einem Quellvideo und einem Rezept (story.json):
// Texteinblendungen in Marke und Schrift, optional Sprecherstimme ueber dem Quellton, 720 x 1280, H.264, Ton -16 LUFS, Poster.
//
//   node studio/stories/build-story.mjs studio/stories/start/story.json --source <quelle.mp4> [--out assets/stories] [--apply]
//
// Ergebnis: <out>/<id>-v<version>.mp4 und .jpg. Mit --apply zeigt das Highlight gleicher id in
// willkommen/config/stories.json auf die neue Datei (Dauer, Poster, rev + 1). Neue Fassung: version im Rezept erhoehen,
// dann bleibt die alte Datei bis zum Aufraeumen erreichbar und Browser laden keine veraltete Kopie aus dem Cache.
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync, mkdirSync, statSync, copyFileSync, rmSync} from 'node:fs';
import {join, resolve, dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf('--' + name); return i < 0 ? null : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const recipePath = args[0];
const source = flag('source');
if (!recipePath || !source || source === true) { console.error('Aufruf: build-story.mjs <story.json> --source <quelle.mp4> [--out assets/stories] [--apply]'); process.exit(2); }
const recipe = JSON.parse(readFileSync(recipePath, 'utf8'));
const out = resolve(flag('out') === true || !flag('out') ? join(root, 'assets/stories') : flag('out'));
const base = `${recipe.id}-v${recipe.version}`;

const probe = file => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
const duration = probe(source);
const work = mkdtempSync(join(tmpdir(), 'vu-story-'));
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const lime = s => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');

copyFileSync(join(root, 'assets/fonts/inter-latin.woff2'), join(work, 'inter-latin.woff2'));
copyFileSync(join(root, 'assets/vision-universe-logo.png'), join(work, 'logo.png'));
const page = body => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;src:url(inter-latin.woff2) format("woff2");font-weight:100 900}
html,body{margin:0;width:1080px;height:1920px;background:transparent;font-family:Inter,sans-serif;color:#f4f5f1}
.grad{position:absolute;left:0;right:0;bottom:0;height:1000px;background:linear-gradient(180deg,rgba(8,8,10,0),rgba(8,8,10,.6) 38%,rgba(8,8,10,.9))}
.wrap{position:absolute;left:84px;right:84px;bottom:250px}
.eyebrow{font-size:38px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#c8f531;margin:0 0 24px}
.big{font-size:104px;line-height:1.02;letter-spacing:-.045em;font-weight:800;margin:0}
.big em{font-style:normal;color:#c8f531}
.sub{font-size:44px;line-height:1.35;color:#d6d9d1;margin:28px 0 0;font-weight:500}
.logo{width:600px;display:block;margin:0 0 44px;filter:brightness(0) invert(1)}
.bar{width:120px;height:8px;border-radius:4px;background:#c8f531;margin:0 0 34px}
</style></head><body><div class="grad"></div><div class="wrap">${body}</div></body></html>`;

// 1. Einblendungen als transparente Bilder
let playwright; try { playwright = require('playwright'); } catch { playwright = require(join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright')); }
const browser = await playwright.chromium.launch();
const tab = await browser.newPage({viewport: {width: 1080, height: 1920}});
for (const [i, o] of recipe.overlays.entries()) {
  const body = (o.logo ? '<img class="logo" src="logo.png">' : '') + (o.bar ? '<div class="bar"></div>' : '') +
    (o.eyebrow ? `<p class="eyebrow">${esc(o.eyebrow)}</p>` : '') + `<p class="big">${lime(o.title)}</p>` + (o.sub ? `<p class="sub">${esc(o.sub)}</p>` : '');
  writeFileSync(join(work, `o${i}.html`), page(body));
  await tab.goto('file://' + join(work, `o${i}.html`));
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({path: join(work, `o${i}.png`), omitBackground: true});
}
await browser.close();

// 2. Einblenden, Format und Ton fuer die App
const fade = 0.35, inputs = ['-i', source], chains = [];
let last = '0:v';
recipe.overlays.forEach((o, i) => {
  const end = o.to == null ? duration + 1 : o.to;
  inputs.push('-loop', '1', '-t', String(duration), '-i', join(work, `o${i}.png`));
  chains.push(`[${i + 1}:v]format=rgba,fade=in:st=${o.from}:d=${fade}:alpha=1,fade=out:st=${Math.max(o.from, end - fade)}:d=${fade}:alpha=1[c${i}]`);
  chains.push(`[${last}][c${i}]overlay=0:0:shortest=1[v${i}]`); last = `v${i}`;
});
chains.push(`[${last}]scale=720:1280:flags=lanczos,format=yuv420p[v]`);
// Ton: ohne Stimme der Ton der Quelle; mit Stimme (voice.file neben dem Rezept, ab voice.offset s) wird der Quellton
// darunter abgesenkt (Ducking) und beides gemischt. Danach -16 LUFS.
const loud = 'loudnorm=I=-16:TP=-1.5:LRA=11';
if (recipe.voice) {
  const v = recipe.overlays.length + 1, ms = Math.round((recipe.voice.offset || 0) * 1000);
  inputs.push('-i', join(dirname(resolve(recipePath)), recipe.voice.file));
  chains.push(`[${v}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms},apad,asplit=2[vo1][vo2]`,
    `[0:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.55[bed]`,
    `[bed][vo1]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=350[duck]`,
    `[duck][vo2]amix=inputs=2:duration=first:normalize=0,${loud}[a]`);
} else chains.push(`[0:a]${loud}[a]`);
mkdirSync(out, {recursive: true});
const mp4 = join(out, base + '.mp4'), jpg = join(out, base + '.jpg');
execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', chains.join(';'), '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-profile:v', 'high', '-movflags', '+faststart',
  '-ar', '48000', '-c:a', 'aac', '-b:a', '128k', mp4], {stdio: 'inherit'});
const posterAt = Math.min(duration - 0.1, (recipe.overlays[0]?.from ?? 0) + 0.9);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(posterAt), '-i', mp4, '-frames:v', '1', '-q:v', '4', jpg]);
rmSync(work, {recursive: true, force: true});

const seconds = Math.round(probe(mp4) * 10) / 10, mb = statSync(mp4).size / 1e6;
const slide = {type: 'video', src: '/' + mp4.slice(root.length + 1), poster: '/' + jpg.slice(root.length + 1), duration: seconds, label: recipe.title};
console.log(`${base}: ${seconds} s, ${mb.toFixed(1)} MB`);
if (mb > 6) console.warn('Warnung: groesser als 6 MB, der Test der Willkommensseite lehnt das ab.');

// 3. Optional: Highlight auf die neue Datei zeigen lassen
if (flag('apply')) {
  const configPath = join(root, 'willkommen/config/stories.json'), config = JSON.parse(readFileSync(configPath, 'utf8'));
  const story = config.stories.find(s => s.id === recipe.id);
  if (!story) throw Error(`Kein Highlight mit id "${recipe.id}" in willkommen/config/stories.json`);
  const index = story.slides.findIndex(s => s.type === 'video');
  if (index < 0) story.slides.unshift(slide); else story.slides[index] = slide;
  story.rev += 1;
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`willkommen/config/stories.json: "${recipe.id}" zeigt auf ${slide.src}, rev ${story.rev}`);
} else console.log(JSON.stringify(slide));
