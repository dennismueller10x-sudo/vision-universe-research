import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function ui({ observer = true } = {}) {
  const observers = [];
  const window = { QuantShell: { el: (tag, attrs) => ({ tag, attrs: { ...attrs },
    removeAttribute(key) { delete this.attrs[key]; } }) } };
  if (observer) window.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(image) { this.image = image; }
    disconnect() { this.disconnected = true; }
  };
  vm.runInNewContext(readFileSync(new URL('../app/ui.js', import.meta.url), 'utf8'), { window });
  return { window, observers };
}

test('offscreen artwork has no fetch URL until that exact image enters the viewport', () => {
  const { window, observers } = ui(), src = '/assets/discover-perspektiven/qualitaet-zum-preis.jpeg';
  const image = window.QX.visibleImage(src, { alt: '', width: '1254', height: '1254', loading: 'lazy' });
  const observer = observers[0];
  assert.equal(image.src, undefined); assert.equal(image.attrs.src, undefined);
  assert.equal(image.attrs['data-src'], src); assert.equal(image.attrs.width, '1254');
  observer.callback([{ target: image, isIntersecting: false }]);
  observer.callback([{ target: {}, isIntersecting: true }]);
  assert.equal(image.src, undefined); assert.equal(observer.disconnected, undefined);
  observer.callback([{ target: image, isIntersecting: true }]);
  assert.equal(image.src, src); assert.equal(image.attrs['data-src'], undefined);
  assert.equal(observer.disconnected, true);
});

test('browsers without an intersection observer retain the same visible artwork', () => {
  const { window } = ui({ observer: false }), src = '/assets/discover-perspektiven/qualitaet-zum-preis.jpeg';
  const image = window.QX.visibleImage(src, { alt: '', decoding: 'async' });
  assert.equal(image.src, src); assert.equal(image.attrs['data-src'], undefined);
  assert.equal(image.attrs.alt, ''); assert.equal(image.attrs.decoding, 'async');
});
