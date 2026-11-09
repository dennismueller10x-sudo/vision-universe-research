// Erzeugt resources/icon-only.png (1024, ohne Transparenz) und resources/splash.png (2732) aus der vorhandenen Wortmarke.
// VORLAEUFIG: ein Platzhalter aus der Wortmarke, bis ein eigenes App-Symbol freigegeben ist. Danach:
//   npx capacitor-assets generate --ios
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sharp = createRequire(import.meta.url)('sharp');
const logo = path.join(app, '..', 'assets', 'vision-universe-logo.png');
async function compose(size, widthShare, out) {
  const w = Math.round(size * widthShare);
  const mark = await sharp(logo).resize({width: w}).toBuffer();
  await sharp({create: {width: size, height: size, channels: 3, background: '#ffffff'}})
    .composite([{input: mark, gravity: 'center'}]).flatten({background: '#ffffff'}).png().toFile(path.join(app, 'resources', out));
}
await compose(1024, 0.82, 'icon-only.png');
await compose(2732, 0.5, 'splash.png');
// Dunkel: Wortmarke weiss auf #0b0f14
const light = await sharp(logo).resize({width: Math.round(2732 * 0.5)}).negate({alpha: false}).toBuffer();
await sharp({create: {width: 2732, height: 2732, channels: 3, background: '#0b0f14'}}).composite([{input: light, gravity: 'center'}]).png().toFile(path.join(app, 'resources', 'splash-dark.png'));
console.log('Ressourcen geschrieben');
