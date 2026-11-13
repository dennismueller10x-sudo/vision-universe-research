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

test('FP-5 Schnellweg nur ohne laufende Company-Intelligence-Veroeffentlicher (Weiche haengt an der Pruefung)', async () => {
  const {readFileSync} = await import('node:fs');
  const wf = readFileSync(new URL('../../.github/workflows/pages-release.yml', import.meta.url), 'utf8');
  const a = wf.indexOf('\n  intraday-schnell:\n'), b = wf.indexOf('\n  deploy-schnell:\n');
  const job = wf.slice(a, b);
  for (const w of ['company-intelligence-profile-source', 'company-intelligence-refresh', 'company-intelligence-universe-release', 'pages-release-marker']) assert.ok(job.includes(w), w);
  assert.match(job, /id: weiche\n\s+if: [^\n]*steps\.pub\.outputs\.frei == 'true'/);
  assert.match(job, /id: bereit\n\s+if: steps\.weiche\.outputs\.mode == 'FAST'/);
});

/* FP-6 (13.11.2026, Entscheidung B): Allowlist nur fuer Verzeichnisse, die der Bau byte-gleich durchreicht.
   Bau-Quellen = alles, was pages-release.yml vor dem Siegel ausfuehrt. Nennt eine davon eine Datei oder ein Verzeichnis
   innerhalb der Allowlist, bleibt der Bau nicht byte-gleich -> Test schlaegt an: Pfad nach FAST_EXCLUDE oder Bau aendern. */
import {readdirSync, statSync} from 'node:fs';
import {isFastData, isDatenzweig, FAST_DIRS, FAST_EXCLUDE} from '../../scripts/ci/intraday-fastpath.mjs';
const BAU_QUELLEN = ['scripts/vu2', 'scripts/core', 'scripts/watchlist', 'scripts/mobile', 'scripts/account', 'scripts/access-gate',
  'scripts/technical/elliott-home', 'scripts/company_intelligence', 'scripts/ci/overlay-data-branch.mjs'];
/* nur pruefend (schreiben nichts ins Paket); jede Zeile mit Grund */
const NUR_PRUEFEND = {
  [['scripts/core', 'data-quality.mjs'].join('/')]: 'DQ-Regeln, Bericht liegt auf dem Datenzweig',
  'scripts/core/product-quality.mjs': 'Qualitaetsbericht, kein Paketinhalt',
  'scripts/core/system-health.mjs': 'Diagnose',
  'scripts/core/diagnose.mjs': 'Diagnose',
  'scripts/vu2/measure-launch-readiness.mjs': 'Messung, kein Paketinhalt',
  'scripts/vu2/verify-history-handoff.mjs': 'Pruefung in ci.yml, nicht im Release-Bau',
  'scripts/core/equity-quality.mjs': 'Pruefung (ci.yml/pipeline-daily), nicht im Release-Bau',
  'scripts/core/stale-tails/build_evidence.py': 'Beleg-Skript, nicht im Release-Bau',
};
const DATEN_PFAD = new RegExp('(' + FAST_DIRS.map((d) => d.replace(/\/$/, '').replace(/\//g, '\\/')).join('|') + ')(\\/[A-Za-z0-9_.\\/-]*)?', 'g');
function quellen(p, out = []) {
  const st = statSync(p);
  if (st.isDirectory()) { for (const e of readdirSync(p)) if (e !== 'tests' && e !== 'node_modules') quellen(p + '/' + e, out); }
  else if (/\.(mjs|js|py)$/.test(p) && !/(^|\/)tests?\//.test(p) && !/-qa\.mjs$/.test(p) && !/\.test\./.test(p)) out.push(p);
  return out;
}
const DD = 'discover' + '/data/', QM = 'quant' + '/data/market/';
test('FP-6a Klassifizierung: Daten-Allowlist, Ausnahmen, Datenzweig und product bleiben VOLL', () => {
  const ok = (p) => klassifiziere([p]).mode;
  for (const p of [DD + 'rows/US_REAL/x.json', DD + 'home/a.json', DD + 'meta.json', QM + 'discover-series-long/ref_A.json', QM + 'status.json']) assert.equal(ok(p), 'FAST', p);
  for (const p of [DD + 'stocks/US_REAL/A.json', DD + 'stock-index/US_REAL.json', DD + 'europe/catalog.json', QM + 'factors/f.json',
    QM + 'fx/x.json', QM + 'multi-asset/snapshot.json', QM + 'fx/ecb/EURUSD.json', 'quant' + '/data/product/x.json', 'quant/engines/x.js', 'discover/ui/detail.js']) assert.equal(ok(p), 'FULL', p);
  assert.ok(isDatenzweig(QM + 'multi-asset/snapshot.json') && !isFastData(QM + 'multi-asset/snapshot.json'));
});
test('FP-6b Vertrag: kein Bau-Skript liest oder projiziert eine Datei innerhalb der Allowlist', () => {
  const treffer = [];
  for (const q of BAU_QUELLEN) for (const f of quellen(q)) {
    if (NUR_PRUEFEND[f]) continue;
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(DATEN_PFAD)) {
      const lit = m[0];
      /* Literal ist Datei/Verzeichnis in der Allowlist, oder ein Elternverzeichnis, das sie enthaelt (dann lesbar ohne Namen) */
      const innen = isFastData(lit) || isFastData(lit.replace(/\/?$/, '/') + 'x');
      const elternbare = FAST_DIRS.some((d) => d === lit + '/' || d === lit);
      if (innen || elternbare) treffer.push(f + ': ' + lit);
    }
  }
  assert.deepEqual([...new Set(treffer)], [], 'Bau liest die Allowlist -> Pfad nach FAST_EXCLUDE (und Voll-Bau pruefen) oder Quelle in NUR_PRUEFEND mit Grund');
});
test('FP-6c FAST_EXCLUDE und Allowlist stimmen mit dem Dateibaum ueberein', () => {
  for (const d of FAST_DIRS) assert.ok(statSync(d).isDirectory(), d);
  for (const d of FAST_EXCLUDE) assert.ok(FAST_DIRS.some((a) => d.startsWith(a)) && statSync(d).isDirectory(), d + ' existiert nicht oder liegt ausserhalb');
  for (const f of Object.keys(NUR_PRUEFEND)) assert.ok(statSync(f).isFile(), f);
});
test('FP-6d overlay/smoke: Datendateien (neu, geaendert, geloescht) byte-gleich, Abweichung faellt auf VOLL', async () => {
  const {leseListe} = await import('../../scripts/ci/intraday-fastpath.mjs');
  const repo = mkdtempSync(join(tmpdir(), 'fp6-repo-')), site = mkdtempSync(join(tmpdir(), 'fp6-site-'));
  const w = (root, p, c) => { mkdirSync(join(root, dirname(p)), {recursive: true}); writeFileSync(join(root, p), c); };
  w(repo, I + '/index.json', '{"dataSession":"x"}'); w(repo, DD + 'rows/a.json', '{"n":2}'); w(repo, DD + 'stocks/US_REAL/A.json', '{}');
  w(site, DD + 'rows/a.json', '{"n":1}'); w(site, DD + 'home/alt.json', '{}');
  execFileSync('git', ['init', '-q'], {cwd: repo});
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'x'], {cwd: repo});
  const liste = leseListe(['M\t' + DD + 'rows/a.json', 'D\t' + DD + 'home/alt.json', 'M\t' + DD + 'stocks/US_REAL/A.json', ''].join('\n'));
  assert.equal(liste.length, 2, 'stocks gehoert nicht in die Liste');
  const m = await overlay(repo, site, liste);
  assert.equal(m.dataFiles, 2);
  assert.equal(readFileSync(join(site, DD + 'rows/a.json'), 'utf8'), '{"n":2}');
  assert.ok(!existsSync(join(site, DD + 'home/alt.json')));
  assert.deepEqual((await pruefe(repo, site, liste)).fehler, []);
  writeFileSync(join(site, DD + 'rows/a.json'), '{"n":3}');
  assert.ok((await pruefe(repo, site, liste)).fehler.some((f) => /Pruefsumme/.test(f)));
});
