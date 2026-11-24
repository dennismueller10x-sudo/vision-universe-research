import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
process.env.VU_GATE_INIT_NOAUTO = '1';
const { installGate, activate, gateInitScript } = await import('../gate-init.mjs');
const { accessStateFor, STORAGE_KEY } = await import('../../access-gate/build.mjs');

/* Gefälschtes Playwright: zeichnet auf, welche Init-Skripte an welchen Kontexten hängen. */
function fake() {
  const log = { contexts: [], closed: 0 };
  const mk = (name) => ({ launch: async () => ({
    newContext: async (opts) => { const c = { name, opts, scripts: [], addInitScript: async (fn, arg) => { c.scripts.push([fn, arg]); }, newPage: async () => ({ close: async () => {} }), close: async () => { log.closed++; } }; log.contexts.push(c); return c; }
  }) });
  return { log, pw: { chromium: mk('chromium'), webkit: mk('webkit'), firefox: mk('firefox') } };
}

test('Jeder Kontext (newContext und newPage) bekommt den Zugangszustand, nur im Ursprung der Seite', async () => {
  const { pw, log } = fake();
  installGate(pw, { origin: 'https://research.example', key: 'k', value: '{"v":1}' });
  const b = await pw.chromium.launch();
  await b.newContext({ viewport: { width: 1 } });
  const page = await b.newPage({ viewport: { width: 2 } });
  await page.close();
  const w = await pw.webkit.launch(); await w.newContext();
  assert.equal(log.contexts.length, 3);
  for (const c of log.contexts) assert.deepEqual(c.scripts.map((s) => s[1]), [['k', '{"v":1}', 'https://research.example']]);
  assert.equal(log.closed, 1, 'newPage schließt seinen eigenen Kontext mit der Seite');
  assert.deepEqual(log.contexts[0].opts, { viewport: { width: 1 } });
});

test('Init-Skript setzt localStorage nur im richtigen Ursprung', () => {
  const calls = [];
  globalThis.location = { origin: 'https://research.example' };
  globalThis.localStorage = { setItem: (k, v) => calls.push([k, v]) };
  gateInitScript()(['k', 'v', 'https://research.example']);
  globalThis.location = { origin: 'https://www.example' };
  gateInitScript()(['k', 'v', 'https://research.example']);
  delete globalThis.location; delete globalThis.localStorage;
  assert.deepEqual(calls, [['k', 'v']]);
});

test('Zweimal installieren verdoppelt nichts; ohne Passwort oder Adresse passiert nichts', async () => {
  const { pw, log } = fake();
  installGate(pw, { origin: 'https://a.example', key: 'k', value: 'v' });
  installGate(pw, { origin: 'https://a.example', key: 'k', value: 'v' });
  await (await pw.chromium.launch()).newContext();
  assert.equal(log.contexts[0].scripts.length, 1);
  const err = console.error; const msgs = []; console.error = (m) => msgs.push(m);
  try {
    assert.equal(activate({ IN_SITE: 'https://a.example' }, () => { throw Error('darf nicht laden'); }), false);
    assert.equal(activate({ RESEARCH_ACCESS_PASSWORD: 'geheimes-testpasswort' , IN_SITE: 'kaputt' }, () => { throw Error('darf nicht laden'); }), false);
  } finally { console.error = err; }
  assert.equal(msgs.length, 2);
  assert.ok(msgs.every((m) => !m.includes('geheimes-testpasswort')), 'Passwort steht in keiner Meldung');
});

test('activate: Zustand aus accessStateFor, Ursprung aus IN_SITE (ohne Pfad), Passwort nie im Skriptargument', async () => {
  const { pw, log } = fake();
  const pass = 'lokaler-testwert-123';
  assert.equal(activate({ RESEARCH_ACCESS_PASSWORD: pass, IN_SITE: 'https://research.example/discover/?x=1' }, () => pw), true);
  await (await pw.chromium.launch()).newContext();
  const [k, v, o] = log.contexts[0].scripts[0][1];
  assert.equal(k, STORAGE_KEY); assert.equal(o, 'https://research.example');
  const ref = accessStateFor(pass), got = JSON.parse(v);
  assert.equal(got.version, ref.version); assert.equal(got.key, ref.key); assert.ok(got.expiresAt > Date.now());
  assert.ok(!v.includes(pass) && !k.includes(pass) && !o.includes(pass));
});

test('Workflow: Passwort nur im env der Discover-Schritte, mit Vorlader; keine Eingabe im Shell-Text', () => {
  const y = readFileSync(new URL('../../../.github/workflows/monitor.yml', import.meta.url), 'utf8');
  const job = y.slice(y.indexOf('\n  discover:\n'), y.indexOf('\n  # --- discover-realtime'));
  const ohneKommentar = job.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  for (const s of ['browser-qa.mjs', 'browser-qa-live.mjs', 'browser-qa-stockhead.mjs', 'browser-qa-maerkte.mjs']) {
    const re = new RegExp('node --import \\./scripts/ci/gate-init\\.mjs scripts/discover/' + s.replace('.', '\\.'));
    assert.match(job, re, s + ' läuft mit dem Vorlader');
  }
  const steps = ohneKommentar.split(/\n      - name: /).slice(1);
  for (const st of steps) {
    const nutzt = /gate-init\.mjs/.test(st);
    if (nutzt) assert.match(st, /RESEARCH_ACCESS_PASSWORD: \$\{\{ secrets\.RESEARCH_ACCESS_PASSWORD \}\}/, 'Schritt mit Vorlader trägt das Geheimnis im env');
    assert.ok(!/\$\{\{ *inputs\./.test(st.split('run:')[1] || ''), 'keine Eingabe im Shell-Text');
  }
});
