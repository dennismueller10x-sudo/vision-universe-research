import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:https';
import {execFileSync} from 'node:child_process';
import {mkdtemp, mkdir, writeFile, readFile, stat, rm} from 'node:fs/promises';
import {join, resolve, extname, sep} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {protectRelease, verificationFor, STORAGE_KEY, DURATION_MS} from './build.mjs';
const require = createRequire(import.meta.url);
const {chromium, webkit, devices} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const temp = await mkdtemp(join(tmpdir(), 'research-static-gate-'));
const site = join(temp, 'site');
const password = randomBytes(32).toString('hex');
const config = verificationFor(password);
const routes = ['/', '/discover', '/quant', '/supertrader', '/screener', '/markets', '/research',
  '/stocks/AAPL', '/etf', '/future/product'];
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>';
for (const route of routes) {
  const dir = join(site, route);
  await mkdir(dir, {recursive: true});
  await writeFile(join(dir, 'index.html'), `<!doctype html><html><head><link rel="stylesheet" href="style.css"></head>
<body><h1 data-app>${route}</h1><a href="/discover">Discover</a><img src="picture.svg" alt="Testbild">
<script src="app.js"></script></body></html>`);
  await writeFile(join(dir, 'app.js'), 'document.body.dataset.appScriptLoaded="yes";');
  await writeFile(join(dir, 'style.css'), 'body{color:rgb(1,2,3)}');
  await writeFile(join(dir, 'picture.svg'), svg);
}
await writeFile(join(site, '404.html'), '<!doctype html><html><body><h1 data-app>Existing 404</h1></body></html>');
await protectRelease({output: site, password});
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(temp, 'key.pem'),
  '-out', join(temp, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost'], {stdio: 'ignore'});
const mime = {'.html':'text/html; charset=utf-8', '.js':'text/javascript', '.json':'application/json', '.css':'text/css', '.svg':'image/svg+xml'};
const server = createServer({key: await readFile(join(temp, 'key.pem')), cert: await readFile(join(temp, 'cert.pem'))}, async (req, res) => {
  try {
    const url = new URL(req.url, 'https://localhost');
    const path = resolve(site, '.' + decodeURIComponent(url.pathname));
    if (path !== site && !path.startsWith(site + sep)) throw Error('path');
    let file = path;
    try {
      if ((await stat(file)).isDirectory()) {
        if (!url.pathname.endsWith('/')) { res.writeHead(301, {Location: url.pathname + '/' + url.search}); res.end(); return; }
        file = join(file, 'index.html');
      }
    } catch (_) { file = join(site, '404.html'); res.statusCode = 404; }
    res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(await readFile(file));
  } catch (_) { res.writeHead(500); res.end('test server'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'https://127.0.0.1:' + server.address().port;

try {
  for (const [name, engine, device] of [
    ['Chromium', chromium, {viewport:{width:1280,height:800}}],
    ['iPhone WebKit', webkit, devices['iPhone 13']],
  ]) {
    const options = {...device, headless: true, ignoreHTTPSErrors: true,
      ...(name === 'Chromium' && process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {})};
    const profile = join(temp, name);
    let context = await engine.launchPersistentContext(profile, options);
    try {
      let page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      let requests = [];
      page.on('request', request => requests.push(new URL(request.url()).pathname));
      for (const route of routes) {
        requests = [];
        await page.goto(origin + route);
        await page.locator('#research-access-gate').waitFor();
        assert.equal(await page.locator('[data-app]').count(), 0, route + ': no application markup before access');
        assert.ok(!requests.some(path => path.startsWith('/__research/content/') || /app\.js|style\.css|picture\.svg/.test(path)), route + ': app never loaded before access');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
      // Existing stock URL, including query and hash, must survive login exactly.
      await page.goto(origin + '/quant/?view=stock&ticker=NVDA#/aktie/NVDA');
      await page.locator('#research-password').click();
      assert.equal(await page.locator('#research-password').getAttribute('autocomplete'), 'current-password');
      assert.equal(await page.locator('#research-password').evaluate(input => input === document.activeElement), true);
      assert.ok(await page.locator('#research-password').evaluate(input => parseFloat(getComputedStyle(input).fontSize) >= 16));
      await page.locator('#research-password').fill('incorrect-test-password');
      await page.getByRole('button', {name:'Zugang öffnen'}).click();
      await page.locator('#research-access-error:not([hidden])').waitFor();
      assert.equal(await page.locator('#research-access-error').innerText(), 'Passwort nicht korrekt.');
      assert.equal(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY), null);
      await page.locator('#research-password').fill(password);
      await page.getByRole('button', {name:'Zugang öffnen'}).click();
      await page.locator('body[data-app-script-loaded=yes]').waitFor();
      assert.equal(page.url(), origin + '/quant/?view=stock&ticker=NVDA#/aktie/NVDA');
      assert.equal(await page.locator('h1[data-app]').innerText(), '/quant');
      assert.equal(await page.locator('body').evaluate(body => getComputedStyle(body).color), 'rgb(1, 2, 3)');
      assert.equal(await page.locator('img').evaluate(image => image.complete && image.naturalWidth > 0), true);
      const state = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
      assert.equal(state.verifier, config.verifier);
      assert.ok(state.expiresAt > Date.now() + 29 * 86400000);
      assert.ok(state.expiresAt <= Date.now() + DURATION_MS);
      for (const route of routes) {
        await page.goto(origin + route);
        await page.locator('body[data-app-script-loaded=yes]').waitFor();
        assert.equal(await page.locator('h1[data-app]').innerText(), route);
        assert.equal(await page.locator('#research-access-gate').count(), 0);
      }
      await page.reload();
      await page.locator('body[data-app-script-loaded=yes]').waitFor();
      await page.goto(origin + '/not-yet-existing/deep-link');
      await page.getByRole('heading', {name:'Existing 404'}).waitFor();
      assert.deepEqual(pageErrors, []);
      // Close the browser process and reopen the persistent profile, without
      // artificially seeding access state. This exercises disk persistence.
      await context.close();
      context = await engine.launchPersistentContext(profile, options);
      page = await context.newPage();
      await page.goto(origin + '/stocks/AAPL');
      await page.locator('body[data-app-script-loaded=yes]').waitFor();
      await page.evaluate(() => localStorage.setItem('product-preference', 'keep'));
      await page.goto(origin + '/__research/logout');
      await page.locator('#research-access-gate').waitFor();
      assert.equal(new URL(page.url()).pathname, '/__research/login/');
      assert.equal(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY), null);
      assert.equal(await page.evaluate(() => localStorage.getItem('product-preference')), 'keep');
      await page.goto(origin + '/stocks/AAPL');
      await page.locator('#research-access-gate').waitFor();
      // Expired, malformed and password-rotated browser state cannot open pages.
      for (const stale of [JSON.stringify({...state, expiresAt:Date.now()-1}), '{invalid',
        JSON.stringify({...state, verifier:'changed-password-verifier'})]) {
        await page.evaluate(({key,value}) => localStorage.setItem(key,value), {key:STORAGE_KEY,value:stale});
        await page.goto(origin + '/quant');
        await page.locator('#research-access-gate').waitFor();
        assert.equal(await page.locator('[data-app]').count(), 0);
      }
      // Login target is always local; a crafted URL cannot redirect externally.
      await page.goto(origin + '/__research/login/?next=https%3A%2F%2Fevil.example');
      await page.locator('#research-password').fill(password);
      await page.getByRole('button', {name:'Zugang öffnen'}).click();
      await page.locator('body[data-app-script-loaded=yes]').waitFor();
      assert.equal(page.url(), origin + '/');
      await context.close();
      context = await engine.launchPersistentContext(join(temp, name + '-fresh'), options);
      page = await context.newPage();
      await page.goto(origin + '/stocks/AAPL');
      await page.locator('#research-access-gate').waitFor();
      assert.equal(await page.locator('[data-app]').count(), 0);
      console.log(name + ': PASS — all routes, no content flash, incorrect/correct password, query/hash, relative CSS/JS/images, reload, real browser restart, 30-day state, expiry, fresh browser, logout');
    } finally { await context.close(); }
    const noJS = await engine.launchPersistentContext(join(temp, name + '-no-js'), {...options, javaScriptEnabled:false});
    try {
      const page = await noJS.newPage();
      await page.goto(origin + '/quant');
      assert.equal(await page.locator('[data-app]').count(), 0);
      await page.locator('#research-access-gate').waitFor();
    } finally { await noJS.close(); }
  }
} finally {
  await new Promise(resolve => server.close(resolve));
  await rm(temp, {recursive:true, force:true});
}
