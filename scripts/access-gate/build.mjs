// Deliberately a client-side development/marketing gate, not authorization.
import {pbkdf2Sync, createHash} from 'node:crypto';
import {readFile, writeFile, readdir, mkdir, copyFile} from 'node:fs/promises';
import {resolve, join, relative, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

export const STORAGE_KEY = 'vu.research.access.v1';
export const DURATION_MS = 30 * 24 * 60 * 60 * 1000;
// Public application-specific salt, stable across frequent market-data releases.
// Changing a salt on every build would invalidate otherwise valid 30-day access.
const SALT = 'dmlzaW9uLXVuaXZlcnNlLXJlc2VhcmNoLXYx';
const ITERATIONS = 210000;
const hash = value => createHash('sha256').update(value).digest('hex');
const escape = value => value.replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));

// Version 2: The browser keeps the PBKDF2-derived access key; the release only
// publishes SHA-256(KEY_CONTEXT + key). Version 1 stored and compared the public
// verifier itself, so anyone could write it into localStorage and skip the mask.
// Knowing the published verifier no longer opens a page; deriving the key still
// requires the password (210,000 PBKDF2 iterations per guess).
export const ACCESS_VERSION = 2;
export const KEY_CONTEXT = 'vu-research-access-key-v2:';
export function accessKeyFor(password) {
  if (typeof password !== 'string' || !password.length) throw Error('RESEARCH_ACCESS_PASSWORD als GitHub Actions Secret setzen.');
  return pbkdf2Sync(password, Buffer.from(SALT, 'base64'), ITERATIONS, 32, 'sha256').toString('hex');
}
export function verifierForKey(key) { return hash(KEY_CONTEXT + key); }
export function verificationFor(password) {
  const key = accessKeyFor(password);
  return {version: ACCESS_VERSION, algorithm: 'PBKDF2-SHA-256+SHA-256', salt: SALT, iterations: ITERATIONS,
    keyContext: KEY_CONTEXT, verifier: verifierForKey(key), durationMs: DURATION_MS, storageKey: STORAGE_KEY};
}
// Browser state a successful login writes (used by tests that already know the password).
export function accessStateFor(password, now = Date.now()) {
  return {version: ACCESS_VERSION, key: accessKeyFor(password), expiresAt: now + DURATION_MS};
}

// Reuses the minimal Vision Universe password-mask design from the retired Worker.
export function gatePage(config, content, runtimeVersion) {
  const settings = JSON.stringify(config).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>VISION UNIVERSE · Research</title><style>
:root{color-scheme:dark;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
*{box-sizing:border-box}body{margin:0;min-height:100vh;min-height:100svh;background:#090b10;color:#f4f4f5;display:grid;place-items:center;padding:24px}
main{width:100%;max-width:360px}h1{font-size:20px;letter-spacing:.13em;margin:0 0 8px;border-left:3px solid #d53240;padding-left:12px}
h2{font-size:28px;font-weight:500;margin:0 0 20px}p{font-size:14px;color:#a9abb4;line-height:1.6}label{display:block;font-size:14px;margin:24px 0 8px}
input,button{font:inherit;min-height:48px;width:100%;border-radius:8px}input{font-size:16px;background:#14171e;border:1px solid #383c47;color:inherit;padding:12px}
button{margin-top:16px;border:1px solid #d53240;background:#bd2836;color:white;font-weight:600;cursor:pointer;padding:12px}
button:disabled{opacity:.65;cursor:wait}input:focus-visible,button:focus-visible{outline:2px solid #ed6571;outline-offset:3px}.error{color:#ff9aa3;margin-bottom:0}
[hidden]{display:none!important}
</style></head><body><main id="research-access-gate"><h1>VISION UNIVERSE</h1><h2>Research</h2>
<p>Dieser Bereich befindet sich derzeit in Entwicklung.</p>
<form id="research-access-form" method="post"><label for="research-password">Passwort</label>
<input id="research-password" name="password" type="password" autocomplete="current-password" required>
<p id="research-access-error" class="error" role="alert" hidden></p>
<button type="submit">Zugang öffnen</button></form>
<noscript><p>Bitte JavaScript aktivieren, um den Zugang zu öffnen.</p></noscript></main>
<script id="research-access-settings" type="application/json">${settings}</script>
<script src="/__research/access.js?v=${runtimeVersion}" data-content="${escape(content)}" defer></script></body></html>`;
}

export async function protectRelease({output, password = process.env.RESEARCH_ACCESS_PASSWORD}) {
  const config = verificationFor(password); // Refuse missing secrets before writing any files.
  output = resolve(output);
  const internal = join(output, '__research');
  try { await readdir(internal); throw Error('ACCESS_GATE_ALREADY_BUILT'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const pages = [];
  async function collect(directory) {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await collect(path);
      else if (entry.isFile() && /\.html?$/i.test(entry.name)) pages.push(path);
    }
  }
  await collect(output);
  if (!pages.length) throw Error('ACCESS_GATE_NO_HTML_PAGES');
  const runtime = await readFile(new URL('./runtime.js', import.meta.url), 'utf8');
  const runtimeVersion = hash(runtime).slice(0, 16);
  await mkdir(internal, {recursive: true});
  await writeFile(join(internal, 'access.js'), runtime);
  await writeFile(join(internal, 'config.json'), JSON.stringify(config));
  for (const page of pages) {
    const path = relative(output, page).split('\\').join('/');
    const original = await readFile(page);
    const saved = join(internal, 'content', path);
    await mkdir(dirname(saved), {recursive: true});
    await copyFile(page, saved);
    const url = '/__research/content/' + path.split('/').map(encodeURIComponent).join('/') + '?v=' + hash(original).slice(0, 16);
    await writeFile(page, gatePage(config, url, runtimeVersion));
  }
  for (const route of ['login', 'logout']) {
    await mkdir(join(internal, route), {recursive: true});
    await writeFile(join(internal, route, 'index.html'), gatePage(config, '', runtimeVersion));
  }
  const report = {version: ACCESS_VERSION, kind: 'CLIENT_SIDE_DEVELOPMENT_MARKETING_GATE', pages: pages.length,
    durationDays: 30, plaintextPasswordEmitted: false, cloudflareRequired: false};
  await writeFile(join(internal, 'build-report.json'), JSON.stringify(report));
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
  if (!output) throw Error('OUTPUT_REQUIRED');
  console.log(JSON.stringify(await protectRelease({output})));
}
