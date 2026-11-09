// Themenfotos: Discover zeigte jede Kachel mit dem 1672-px-Original (~120 KB, 6,7 MB fuer alle). Jetzt waehlt der
// Browser per srcset die kleinste Stufe, die die Kachel bei seiner Pixeldichte voll deckt. Diese Tests sichern, dass
// jede Stufe existiert, wirklich so breit ist wie angekuendigt (sonst waere ein Bild unscharf) und dass keine
// Themenkachel mehr ohne srcset ausgeliefert wird.
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

test('Discover liefert Themenfotos nur mit srcset aus; Original bleibt groesste Stufe und src', () => {
  const src = read('discover/ui/v3.js').toString();
  assert.equal((src.match(/<img src="' \+ esc\((t|theme)\.photo\)/g) || []).length, 1, 'Themenfoto nur ueber themeImg()');
  assert.match(src, /function themeImg\(t, sizes, extra\) \{\n    var set = themeSrcset\(t\.photo\);\n    return '<img src="' \+ esc\(t\.photo\)/);
  for (const k of ['rail', 'grid', 'big', 'head', 'thumb']) assert.match(src, new RegExp(k + ": '"), 'SIZES.' + k);
  const m = src.match(/function themeSrcset\(photo\) \{[\s\S]*?\n  \}/);
  assert.ok(m, 'themeSrcset fehlt');
  const fn = vm.runInNewContext('(' + m[0].replace('function themeSrcset', 'function') + ')');
  assert.equal(fn('/assets/themen/01-kuenstliche-intelligenz.webp'),
    '/assets/themen/480/01-kuenstliche-intelligenz.webp 480w, /assets/themen/720/01-kuenstliche-intelligenz.webp 720w, ' +
    '/assets/themen/1080/01-kuenstliche-intelligenz.webp 1080w, /assets/themen/01-kuenstliche-intelligenz.webp 1672w');
  assert.equal(fn('/anderswo/x.webp'), '', 'fremde Pfade bekommen kein srcset');
  for (const t of themes()) for (const part of fn(t.photo).split(', ')) assert.ok(fs.existsSync(new URL(part.split(' ')[0].slice(1), ROOT)), part);
});
