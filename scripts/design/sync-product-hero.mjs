// One authored hero raster, included in already render-blocking product CSS.
// Development-only generation; no build, routing or data pipeline changes.
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../../', import.meta.url);
const source = (await readFile(new URL('assets/product-hero.css', root), 'utf8')).trim();
const start = '/* BEGIN GENERATED HERO FIDELITY — edit assets/product-hero.css */';
const end = '/* END GENERATED HERO FIDELITY */';
const paths = ['discover/home.css', 'quant/app/app.css', 'screener/screener.css',
  'vorsorge/app.css', 'supertrader/assets/supertrader.css', 'hedgefonds/app.css', 'fundamental/app.css'];
let stale = false;
for (const path of paths) {
  const url = new URL(path, root), current = await readFile(url, 'utf8');
  const index = current.indexOf(start), block = start + '\n' + source + '\n' + end;
  let next;
  if (index >= 0) {
    // An Ort und Stelle ersetzen: Produktregeln NACH dem Block behalten ihre Reihenfolge (Kaskade).
    const stop = current.indexOf(end, index);
    if (stop < 0) throw Error('Unterminated generated hero CSS: ' + path);
    next = current.slice(0, index) + block + current.slice(stop + end.length);
  } else next = current.trimEnd() + '\n\n' + block + '\n';
  if (next !== current) {
    stale = true;
    if (!process.argv.includes('--check')) await writeFile(url, next);
  }
}
if (process.argv.includes('--check') && stale) throw Error('Run node scripts/design/sync-product-hero.mjs');
console.log('Hero fidelity CSS ' + (process.argv.includes('--check') ? 'verified' : 'synchronized') + ' in seven product styles.');
