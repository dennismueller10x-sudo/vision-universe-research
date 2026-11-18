// Vorschaubilder zum Teilen (Owner 17.11.2026): jede Story-Seite bekommt ihr eigenes Bild (1200 × 630) und ihre eigene
// Beschreibung, damit ein geteilter Link auf /magazin/, /report/ oder eine Produktseite nicht wie die Startseite aussieht.
//
//   node scripts/share-images.mjs        baut assets/share/<seite>.jpg und schreibt og:image, og:description, og:url
//
// Das Bild entsteht aus dem Inhalt der Seite selbst: Bereich, Überschrift, erster Satz und rechts die App-Ansicht im
// iPhone (Produktseiten), das Titelbild (Magazin, Report) oder drei Artikelbilder (News). Läuft lokal mit Playwright
// (devDependency); die Bilder werden committet. Nach einem neuen Heft oder Report kann man es erneut laufen lassen.
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, extname, dirname } from 'node:path';
import { build, root, SITE_PAGES } from './build.mjs';

const SITE = 'https://www.visionuniverse.de/';
const out = resolve(root, 'tests/output/share');
await build({ output: out });
const text = (html) => html.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const short = (s, n) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n)).replace(/[,;:]$/, '') + ' …');

function describe(path, html) {
  const slug = path === 'index.html' ? 'home' : path.replace(/\/index\.html$/, '').replace(/\//g, '-');
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  // Erster Absatz direkt nach der Überschrift (nicht der Satz aus der Newsletter-Box weiter unten).
  const lead = html.match(/<\/h1>\s*<p class="(?:t|sub|ah2-sub)"[^>]*>([\s\S]*?)<\/p>/) || html.match(/<p class="t">([\s\S]*?)<\/p>/);
  const tagm = html.match(/<span class="tagm">((?:(?!<\/span>\s*<h1)[\s\S])*?)<\/span>\s*<h1/);
  const tag = slug === 'home' ? null : tagm || html.match(/<p class="k pvk">([\s\S]*?)<\/p>/);
  const icon = tagm && slug !== 'home' ? (tagm[1].match(/<use href="#([a-z]+)"/) || [])[1] : undefined;
  const img = (html.match(/data-img="(?:\.\.\/)*(web\/img\/app\/[a-z]+\.jpg)"/) || [])[1];
  const covers = [...html.matchAll(/src="(?:\.\.\/)*(web\/img\/news\/(?:mag|rep)-[^"]+-cover\.jpg)"/g)].map((m) => m[1]);
  const news = [...html.matchAll(/src="(?:\.\.\/)*(web\/img\/news\/art-[^"]+)"/g)].map((m) => m[1]);
  return { slug, h1: h1 ? h1[1].replace(/<br>/g, ' ').trim() : 'Vision Universe', lead: lead ? text(lead[1]) : '', tag: tag ? text(tag[1]) : '', icon, img, covers, news };
}

const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try { let p = resolve(out, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (p.endsWith('/') || !extname(p)) p = resolve(p, 'index.html'); res.setHeader('Content-Type', types[extname(p)] || 'application/octet-stream'); res.end(await readFile(p)); } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const index = await readFile(resolve(out, 'index.html'), 'utf8');
const sprite = index.match(/<svg width="0" height="0"[\s\S]*?<\/svg>/)[0];
const ahdr = index.match(/<div class="ahdr">[\s\S]*?<\/div>/)[0];
const css = index.match(/href="\.\/(web\/site\.css[^"]*)"/)[1];

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await mkdir(resolve(root, 'assets/share'), { recursive: true });
const done = [];
for (const path of ['index.html', ...SITE_PAGES]) {
  const html = await readFile(resolve(out, path), 'utf8');
  const d = describe(path, html);
  const phone = (img) => `<div class="aphone"><div class="in">${ahdr}<div class="scr"><img src="/${img}" alt=""></div><img class="adock" src="/web/img/app/dock.png" alt=""></div></div>`;
  let visual;
  if (d.covers.length && /^(magazin|report)/.test(d.slug)) visual = `<div class="m3 shm">${['p1', 'p2'].map((c) => `<span class="pg ${c}"><img src="/${d.covers[0].replace('-cover', '-s0' + (c === 'p1' ? '2' : '3'))}" alt=""></span>`).join('')}<span class="cv"><img src="/${d.covers[0]}" alt=""></span></div>`;
  // News: allgemeines Bild ohne echte Artikel, weil sich die Artikel täglich ändern (Owner 17.11.2026).
  else if (d.slug === 'news') visual = `<div class="shg">${[['Tagesthema', 'w1'], ['Nebenwert im Fokus', 'w2'], ['Zukunftsthema', 'w3']].map(([k, w], i) => `<div class="c c${i}"><span class="pill">${k}</span><i class="${w}"></i><i class="w4"></i><i class="w5"></i></div>`).join('')}</div>`;
  else visual = phone(d.img || 'web/img/app/apple.jpg');
  const kicker = d.icon ? `<span class="tagm"><span class="ic"><svg><use href="#${d.icon}"/></svg></span>${esc(d.tag)}</span>` : `<span class="tagm">${esc(d.tag || 'Die App für iPhone und Android')}</span>`;
  await page.setContent(`<!doctype html><html lang="de"><head><meta charset="utf-8"><base href="${base}"><link rel="stylesheet" href="${base}${css}"><style>
html,body{margin:0}body{width:1200px;height:630px;overflow:hidden;background:#fff;display:grid;grid-template-columns:1fr 430px;align-items:center;padding:0 0 0 64px;box-sizing:border-box;position:relative}
body::after{content:"";position:absolute;right:-140px;top:-160px;width:640px;height:640px;border-radius:50%;background:radial-gradient(closest-side,rgba(205,255,0,.5),rgba(205,255,0,0));z-index:0}
.l{position:relative;z-index:1}.logo{width:220px;display:block;margin-bottom:30px}.tagm{transform:scale(1.12);transform-origin:left center}
h1{margin-top:22px;font-size:64px;font-weight:900;letter-spacing:-.055em;line-height:.98;max-width:640px}
p{margin-top:16px;font-size:23px;font-weight:600;color:#333;line-height:1.35;max-width:600px}
.st{display:flex;align-items:center;gap:12px;margin-top:26px}.st img{height:44px;width:auto}.st span{font-size:16px;font-weight:800}
.r{position:relative;z-index:1;align-self:stretch;display:grid;place-items:center}.r .aphone{--pw:270px;margin-top:70px}.r .aphone .scr img{animation:none}
.shm{width:380px;height:460px}.shm .pg,.shm .cv{width:270px;margin:-190px 0 0 -135px}
.shg{position:relative;width:380px;height:440px}
.shg .c{position:absolute;left:20px;width:330px;padding:22px;border-radius:24px;background:#000;color:#fff;box-shadow:0 26px 40px -24px rgba(0,0,0,.6)}
.shg .c0{top:20px;transform:rotate(-4deg)}.shg .c1{top:160px;left:40px;background:#fff;color:#000;box-shadow:inset 0 0 0 2px #000,0 26px 40px -24px rgba(0,0,0,.5)}.shg .c2{top:300px;transform:rotate(3deg)}
.shg .pill{display:inline-block;padding:6px 12px;border-radius:99px;background:var(--lime);color:#000;font-weight:900;font-size:15px}
.shg i{display:block;height:14px;margin-top:12px;border-radius:8px;background:currentColor;opacity:.85}.shg .w1{width:90%}.shg .w2{width:80%}.shg .w3{width:86%}.shg .w4{width:70%;opacity:.35}.shg .w5{width:52%;opacity:.35}
</style></head><body>${sprite}<div class="l"><img class="logo" src="/assets/vision-universe-logo-web.png" alt="">${kicker}<h1>${d.h1}</h1>${d.lead ? `<p>${esc(short(d.lead, 120))}</p>` : ''}
<div class="st"><img src="/web/img/badge-apple.svg" alt=""><img src="/web/img/badge-google.png" alt=""><span>Bald verfügbar · zum Start kostenlos</span></div></div><div class="r">${visual}</div></body></html>`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const file = `assets/share/${d.slug}.jpg`;
  await page.screenshot({ path: resolve(root, file), type: 'jpeg', quality: 86 });
  done.push({ path, file, ...d });
}
await browser.close();
server.close();
await rm(out, { recursive: true, force: true });

// Metadaten in die Quellseiten schreiben.
for (const { path, file, slug, h1, lead } of done) {
  const src = resolve(root, path);
  let html = await readFile(src, 'utf8');
  const url = SITE + (path === 'index.html' ? '' : path.replace(/index\.html$/, ''));
  const plain = text(h1);
  const description = esc(short(lead || plain, 180));
  html = html.replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${SITE}${file}">`)
    .replace(/<meta property="og:image:alt" content="[^"]*">/, `<meta property="og:image:alt" content="${esc(plain)} · Vision Universe">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${description}">`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${description}">`);
  if (!html.includes('property="og:url"')) html = html.replace('<meta property="og:type"', `<meta property="og:url" content="${url}">\n<meta property="og:type"`);
  else html = html.replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`);
  await writeFile(src, html);
  console.log(`${slug.padEnd(24)} ${file}`);
}
