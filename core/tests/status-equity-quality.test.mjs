import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Q = require('../equity-quality.js');
// Kleiner DOM-Adapter: prüft sichtbaren Inhalt und Linkziele ohne Netz oder Produktionsschreibzugriff.
class Element {
  constructor() { this.children = []; this.attrs = {}; this.ownText = ''; }
  set textContent(v) { this.ownText = v; this.children = []; }
  get textContent() { return this.ownText + this.children.map(c => typeof c === 'string' ? c : c.textContent).join(''); }
  setAttribute(k,v) { this.attrs[k] = v; }
  appendChild(c) { this.children.push(c); return c; }
  append(...children) { this.children.push(...children); }
  addEventListener() {}
}
async function render(report, hash = '') {
  const nodes = new Map(); const node = id => { if (!nodes.has(id)) nodes.set(id,new Element()); return nodes.get(id); };
  const requests = [];
  const context = {
    globalThis: { VUCore: { EquityQuality:Q, Health:{evaluate(){throw Error('offline');}}, Diagnose:{diagnose:async ticker => ({ticker,status:'OK',steps:[]})} } },
    document:{getElementById:node,querySelector:node,createElement:() => new Element(),createTextNode:s => s},
    window:{addEventListener(){}},location:{hash},
    fetch:async path => { requests.push(path); return {ok:path === '/status/data-quality.json' && !!report,status:404,json:async() => report}; }
  };
  vm.runInNewContext(readFileSync(new URL('../../status/status.js',import.meta.url),'utf8'),context);
  await new Promise(resolve => setImmediate(resolve));
  return {nodes,requests};
}
const report = () => ({checkedAt:new Date().toISOString(),rules:Array.from({length:6},(_,i) => ({id:'DQ-E8-'+(i+1),checked:10,failed:1,delta:-1,
  findings:[{ticker:'BRK-B',text:'Beispiel <script>'}]}))});
test('Status: six cards, yesterday trend, escaped text and exact ticker diagnosis links', async () => {
  const {nodes,requests} = await render(report(),'#/BRK-B');
  const grid = nodes.get('dq-rules'); assert.equal(grid.children.length,6);
  assert.match(grid.textContent,/-1 gegenüber gestern/);
  const link = grid.children[0].children.at(-1).children[0].children[0];
  assert.equal(link.attrs.href,'/status/#/BRK-B');
  assert.match(nodes.get('diag-out').textContent,/DQ-E8-6/);
  assert.equal(requests.some(p => p.includes('discover-series')),false);
});
test('Status: missing report is unavailable, not zero findings', async () => {
  const {nodes} = await render(null);
  assert.match(nodes.get('dq-stand').textContent,/nicht verfügbar/);
  assert.equal(nodes.get('dq-rules').children.length,0);
});
test('Status: stale report is dated and never shows a current yesterday trend', async () => {
  const r = report(); r.checkedAt = '2020-01-01T12:00:00Z';
  const {nodes} = await render(r);
  assert.match(nodes.get('dq-stand').textContent,/Älterer Bericht/);
  assert.doesNotMatch(nodes.get('dq-rules').textContent,/-1 gegenüber gestern/);
});
