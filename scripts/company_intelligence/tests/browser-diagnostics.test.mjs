import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {attachDiagnostics, safeUrl, pickHeaders, collectFailure, pageStateInBrowser} from '../browser-diagnostics.mjs';

const origin = 'https://research.visionuniverse.de';
const response = (url, status, headers = {}) => ({url: () => url, status: () => status, headers: () => headers});

test('Konsole, pageerror, fehlgeschlagene und >=400-Requests landen im Bericht, mit Auslieferungs-Headern', () => {
 const page = new EventEmitter(), d = attachDiagnostics(page, {origin});
 page.emit('console', {type: () => 'error', text: () => 'LAZY_SCRIPT_FAILED:/discover/ui/detail.js'});
 page.emit('console', {type: () => 'log', text: () => 'ignoriert'});
 page.emit('pageerror', new Error('boom'));
 page.emit('requestfailed', {url: () => origin + '/discover/ui/detail.js?v=abc&ci-proof=1', failure: () => ({errorText: 'net::ERR_ABORTED'})});
 page.emit('response', response(origin + '/quant/engines/hash.js?v=123456', 404, {age: '221', 'x-cache': 'HIT', 'x-served-by': 'cache-iad-1', 'set-cookie': 'a=b', authorization: 'x'}));
 page.emit('response', response(origin + '/discover/app.js?v=9', 200, {age: '3'}));
 page.emit('response', response('https://fremd.example/x.js', 500, {}));
 assert.deepEqual(d.console, ['LAZY_SCRIPT_FAILED:/discover/ui/detail.js']);
 assert.deepEqual(d.pageErrors, ['boom']);
 assert.deepEqual(d.failed, [{url: '/discover/ui/detail.js?v=abc', error: 'net::ERR_ABORTED'}]);
 assert.equal(d.http.length, 1);
 assert.deepEqual(d.http[0], {url: '/quant/engines/hash.js?v=123456', status: 404, headers: {age: '221', 'x-cache': 'HIT', 'x-served-by': 'cache-iad-1'}});
 assert.equal(d.served.length, 1);
 assert.equal(JSON.stringify(d).includes('set-cookie') || JSON.stringify(d).includes('a=b'), false);
});

test('Listen sind begrenzt; URLs ohne Query ausser ?v=; Fremdursprung wird ausgeschrieben', () => {
 const page = new EventEmitter(), d = attachDiagnostics(page, {origin, limit: 3});
 for (let i = 0; i < 10; i++) page.emit('pageerror', new Error('e' + i));
 assert.equal(d.pageErrors.length, 3);
 assert.equal(safeUrl(origin + '/a.js?token=SECRET&v=abc', origin), '/a.js?v=abc');
 assert.equal(safeUrl('https://x.test/a.js?token=SECRET', origin), 'https://x.test/a.js');
 assert.deepEqual(pickHeaders({'set-cookie': 'z', age: 4}), {age: '4'});
});

test('collectFailure liefert Seitenzustand und Screenshot; haengender Browser blockiert den Bericht nicht', async () => {
 const page = {evaluate: async fn => { assert.equal(fn, pageStateInBrowser); return {metaRelease: 'abc', lazy: {present: true}}; }, screenshot: async ({path}) => { assert.equal(path, '/tmp/x.png'); }};
 const r = await collectFailure(page, {console: []}, {screenshotPath: '/tmp/x.png'});
 assert.equal(r.page.metaRelease, 'abc'); assert.equal(r.screenshot, '/tmp/x.png');
 const hung = {evaluate: () => new Promise(() => {}), screenshot: () => new Promise(() => {})};
 const t = Date.now(), h = await collectFailure(hung, {console: ['c']}, {screenshotPath: '/tmp/y.png', ms: 50});
 assert.equal(h.page, null); assert.equal(h.screenshot, null); assert.deepEqual(h.diagnostics, {console: ['c']}); assert.ok(Date.now() - t < 2000);
});
