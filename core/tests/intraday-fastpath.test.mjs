import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {klassifiziere, overlay, pruefe, isIntraday, INTRADAY_DIR, INTRADAY_FILES} from '../../scripts/ci/intraday-fastpath.mjs';

const I = INTRADAY_DIR, WD = INTRADAY_FILES[0];
test('FP-1 nur Intraday-Dateien (und Nicht-Auslieferung wie docs) ergeben FAST', () => {
  const r = klassifiziere([I + '/2026-11-11/ref_NVDA.json', I + '/index.json',
    WD, 'docs/x.md', '.github/workflows/foo.yml']);
  assert.equal(r.mode, 'FAST');
});
test('FP-2 jede andere Datei erzwingt den Voll-Release; ohne Intraday-Aenderung auch', () => {
  assert.equal(klassifiziere([I + '/index.json', 'discover/ui/overview.css']).mode, 'FULL');
  assert.equal(klassifiziere(['discover/' + 'x.json']).mode, 'FULL');
  assert.equal(klassifiziere(['docs/x.md']).mode, 'FULL');
  assert.equal(klassifiziere([]).mode, 'FULL');
  assert.ok(!isIntraday(I + 'X/a.json'));
});
test('FP-2b Nicht ausgelieferte Pfade zaehlen nicht, Bau-Eingaben und pages-release.yml schon', () => {
  const ok = (extra) => klassifiziere([I + '/index.json', ...extra]).mode;
  for (const p of ['docs/a/b.md', 'app/src/x.ts', 'scripts/quality/x.mjs', 'scripts/technical/world/academy-browser-qa.mjs', 'quant/tests/x.test.mjs', '.github/workflows/ci.yml', 'README.md']) assert.equal(ok([p]), 'FAST', p);
  for (const p of ['scripts/vu2/build-release.mjs', 'scripts/core/stock-availability.mjs', '.github/workflows/pages-release.yml', 'company-intelligence/config/x.json', 'scripts/access-gate/build.mjs']) assert.equal(ok([p]), 'FULL', p);
});
test('FP-3 overlay legt die Dateien byte-gleich ueber das Paket, smoke findet Abweichungen', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'fp-repo-')), site = mkdtempSync(join(tmpdir(), 'fp-site-'));
  const d = join(repo, I + '/2026-11-11');
  mkdirSync(d, {recursive: true}); mkdirSync(join(repo, dirname(WD)), {recursive: true});
  writeFileSync(join(d, 'ref_A.json'), JSON.stringify({schemaVersion: 'intraday-snapshot-1.0.0', points: []}));
  writeFileSync(join(repo, I + '/index.json'), '{"dataSession":"2026-11-11"}');
  writeFileSync(join(repo, WD), '{}');
  execFileSync('git', ['init', '-q'], {cwd: repo});
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'x'], {cwd: repo});
  mkdirSync(join(site, I + '/alt'), {recursive: true});
  writeFileSync(join(site, I + '/alt/stale.json'), '{}');
  const m = await overlay(repo, site);
  assert.equal(m.files, 2);
  assert.ok(!existsSync(join(site, I + '/alt/stale.json')), 'alter Stand wird ersetzt, nicht ergaenzt');
  assert.deepEqual((await pruefe(repo, site)).fehler, []);
  writeFileSync(join(site, I + '/2026-11-11/ref_A.json'), '{"schemaVersion":"x"}');
  const bad = await pruefe(repo, site);
  assert.ok(bad.fehler.some((f) => /Pruefsumme/.test(f)) && bad.fehler.some((f) => /Schema/.test(f)));
  assert.equal(JSON.parse(readFileSync(join(site, 'intraday-fastpath.json'), 'utf8')).kind, 'INTRADAY_FASTPATH');
});

test('FP-4 Skip-Erben verhindert: jeder Job hinter package (deploy, indexnow, company-intelligence-live) hat eine Statusfunktion im if', async () => {
  /* 12.11.2026: package haengt an intraday-schnell (bei push uebersprungen); ohne !cancelled()/always() erbt jeder Folgejob das Skip,
     der Voll-Release baut dann, liefert aber nicht aus. */
  const {readFileSync} = await import('node:fs');
  const wf = readFileSync(new URL('../../.github/workflows/pages-release.yml', import.meta.url), 'utf8');
  const job = (name) => { const a = wf.indexOf('\n  ' + name + ':\n'); assert.ok(a > 0, name + ' fehlt'); const rest = wf.slice(a + 1); const m = rest.slice(2).search(/\n  [a-z][a-z0-9-]*:\n/); return m < 0 ? rest : rest.slice(0, m + 2); };
  assert.match(job('package'), /needs: intraday-schnell/);
  for (const name of ['package', 'deploy', 'indexnow', 'company-intelligence-live']) {
    const j = job(name), ifPart = j.slice(j.indexOf('if:'), j.indexOf('needs:') > j.indexOf('if:') ? j.indexOf('needs:') : j.indexOf('steps:'));
    assert.match(ifPart, /!cancelled\(\)|always\(\)/, name + ': if ohne Statusfunktion erbt das Skip von intraday-schnell');
  }
  assert.match(job('deploy'), /needs\.package\.result == 'success'/);
});
