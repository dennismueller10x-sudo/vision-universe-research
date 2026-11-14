// Themenfotos: seit 14.11.2026 zurueckgestellt (Owner: „Wir stellen die Bilder erstmal zurueck“). Die App zeigt je
// Thema ein Symbol (discover/tests/theme-icons.test.mjs) und fordert kein Foto mehr an. Die Dateien bleiben im Repo:
// Original 1672 px und die Stufen 480/720/1080 aus scripts/discover/build-theme-variants.py. Diese Tests sichern, dass
// der zurueckgestellte Bestand vollstaendig bleibt (jede Stufe da, so breit wie angekuendigt) und dass Discover ihn
// nicht mehr ausliefert.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('../../', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, ROOT));
const WIDTHS = [480, 720, 1080];

function webpSize(buf) {
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF'); assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
  if (kind === 'VP8X') return { w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1 };
  throw new Error('unbekanntes WebP: ' + kind);
}
function themes() {
  const ctx = { VUDiscover: {} }; ctx.globalThis = ctx; ctx.window = ctx;
  vm.runInNewContext(read('discover/themes.js').toString(), ctx);
  return ctx.VUDiscover.Views.Themes.all.filter((t) => t.photo);
}

test('jede Themenwelt hat Stufen 480/720/1080 px im Seitenverhaeltnis des Originals, kleiner als das Original', () => {
  const list = themes();
  assert.ok(list.length >= 54);
  let orig = 0, small = 0;
  for (const t of list) {
    const file = t.photo.replace('/assets/themen/', ''), o = read('assets/themen/' + file), os = webpSize(o);
    orig += o.length;
    let prev = 0;
    for (const w of WIDTHS) {
      const v = read(`assets/themen/${w}/${file}`), s = webpSize(v);
      assert.equal(s.w, w, `${w}/${file} ist ${s.w} px breit`);
      assert.ok(Math.abs(s.h / s.w - os.h / os.w) < 0.01, `${w}/${file}: Seitenverhaeltnis weicht ab`);
      assert.ok(v.length < o.length && v.length > prev, `${w}/${file}: Groesse ${v.length} nicht zwischen Vorstufe und Original`);
      prev = v.length;
      if (w === 480) small += v.length;
    }
  }
  assert.ok(small < orig / 5, `480er Stufe zusammen ${small} B, Originale ${orig} B`);
});

test('Discover liefert kein Themenfoto mehr aus: kein <img> aus photo, kein Pfad auf assets/themen in der Oberflaeche', () => {
  const ui = ['discover/index.html', 'discover/app.js', 'discover/home.js', 'discover/detail.js']
    .concat(fs.readdirSync(new URL('discover/ui/', ROOT)).filter((f) => /\.(js|css)$/.test(f)).map((f) => 'discover/ui/' + f));
  for (const f of ui) {
    const src = read(f).toString();
    assert.doesNotMatch(src, /assets\/themen\//, f + ' nennt einen Fotopfad');
    assert.doesNotMatch(src, /\.photo\b/, f + ' liest das zurueckgestellte Feld photo');
  }
  // Das Feld bleibt als Verweis auf den Bestand in der Themenliste; nur dort steht der Pfad.
  assert.match(read('discover/themes.js').toString(), /photo: t\[8\] \? '\/assets\/themen\/' \+ file \+ '\.webp' : null/);
});
