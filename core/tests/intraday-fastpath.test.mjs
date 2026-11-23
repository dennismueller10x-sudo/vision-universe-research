import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {klassifiziere, imFenster, overlay, pruefe, isIntraday, isIgnored, IGNORED_PREFIXES, INTRADAY_DIR, INTRADAY_FILES} from '../../scripts/ci/intraday-fastpath.mjs';

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

test('FP-5b Dauerlauf company-intelligence-refresh sperrt den Schnellweg nicht, solange er laeuft (Befund 19.11.)', async () => {
  const {readFileSync} = await import('node:fs');
  const wf = readFileSync(new URL('../../.github/workflows/pages-release.yml', import.meta.url), 'utf8');
  const job = wf.slice(wf.indexOf('\n  intraday-schnell:\n'), wf.indexOf('\n  deploy-schnell:\n'));
  assert.match(job, /if \[ "\$wf" = company-intelligence-refresh \]/);
  assert.match(job, /\.status == \\"completed\\" and \.conclusion != \\"success\\" and \.updated_at > /, 'refresh zaehlt nur fehlgeschlagen und nach dem Basis-Paket');
  assert.match(job, /else\n\s+filter="\[\.workflow_runs\[\] \| select\(\.status != \\"completed\\" or /, 'alle anderen Veroeffentlicher bleiben bei laeuft-noch');
  assert.ok(job.includes('pages-release-marker'), 'Marker meldet die Veroeffentlichung des refresh');
});

test('FP-5c Basis-Paket holen: Zeitlimit, zweiter Versuch je Netzaufruf, Datei je Versuch neu (Laeufe 44598115694, 44759980300)', async () => {
  const {readFileSync} = await import('node:fs');
  const wf = readFileSync(new URL('../../.github/workflows/pages-release.yml', import.meta.url), 'utf8');
  const job = wf.slice(wf.indexOf('\n  intraday-schnell:\n'), wf.indexOf('\n  deploy-schnell:\n'));
  assert.match(job, /nett\(\) \{[^\n]*timeout "\$t" bash -c "\$1"[^\n]*-ge 2/, 'jeder Versuch in eigener Shell');
  assert.match(job, /row=\$\(nett 60 'gh api "repos\/\$REPO\/actions\/artifacts/);
  /* Der Redirect steht INNERHALB des Versuchs: ein abgebrochener Versuch darf kein halbes ZIP hinterlassen, an das der naechste anhaengt. */
  assert.match(job, /nett 200 'gh api "\$url" > "\$B\/artifact\.zip"'/);
  assert.ok(!/^\s*nett gh api "\$url" >/m.test(job), 'kein Redirect ausserhalb des Versuchs');
});

test('FP-8 push auf main: Pfadfilter von pages-release.yml spiegelt die Ausnahmen der Weiche (22.11.2026)', async () => {
  const {readFileSync} = await import('node:fs');
  const wf = readFileSync(new URL('../../.github/workflows/pages-release.yml', import.meta.url), 'utf8');
  const m = wf.match(/\n  push:\n    branches: \[main\]\n    paths:\n((?:      - '[^\n]+'\n)+)/);
  assert.ok(m, 'push-Ereignis hat einen paths-Filter');
  const liste = [...m[1].matchAll(/- '([^']+)'/g)].map((x) => x[1]);
  assert.equal(liste[0], '**', 'alles zuerst, dann Ausnahmen');
  for (const pre of IGNORED_PREFIXES) assert.ok(liste.includes('!' + pre + '**'), 'Ausnahme fuer ' + pre + ' fehlt (IGNORED_PREFIXES)');
  for (const g of ['!**/*.md', '!**/tests/**', '!**/*-qa.mjs', '!.gitignore', '!.vercelignore', '!.env.example']) assert.ok(liste.includes(g), g + ' fehlt (IGNORED_PATTERNS)');
  const iGithub = liste.indexOf('!.github/**'), iSelbst = liste.indexOf('.github/workflows/pages-release.yml');
  assert.ok(iGithub > 0 && iSelbst > iGithub, 'pages-release.yml selbst wird nach der .github-Ausnahme wieder aufgenommen (Reihenfolge zaehlt)');
  /* Jede Ausnahme der Weiche ist auch dort ignoriert: Beispielpfade aus der Weiche muessen im Filter eine Ausnahme haben. */
  for (const pfad of ['docs/a.md', 'quant/tests/x.test.mjs', 'scripts/discover/europe-public-live-qa.mjs', 'scripts/ci/intraday-fastpath.mjs', 'README.md']) assert.equal(isIgnored(pfad), true, pfad);
  assert.equal(isIgnored('.github/workflows/pages-release.yml'), false);
  /* Der Bau-relevante Rest bleibt im Filter: nichts davon steht unter den Ausnahmen. */
  for (const pfad of ['discover/ui/detail.js', 'assets/site-navigation.js', 'scripts/vu2/build.mjs', 'scripts/core/build-modules.mjs']) assert.equal(isIgnored(pfad), false, pfad + ' muss einen Release ausloesen');
  /* Pull-Request: Tests, Doku, QA loesen keinen Voll-Bau aus. */
  const pr = wf.match(/\n  pull_request:\n    paths:\n((?:      - [^\n]+\n|      #[^\n]*\n)+)/);
  assert.ok(pr && /- '!\*\*\/tests\/\*\*'/.test(pr[1]) && /- '!\*\*\/\*\.md'/.test(pr[1]), 'PR-Filter nimmt Tests und Doku aus');
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

test('FP-7 Boersenfenster: Mo-Fr 14:00 bis 21:00 UTC, Grenzen und Wochenende', () => {
  const t = (iso) => imFenster(new Date(iso));
  assert.equal(t('2026-11-18T13:59:59Z'), false);
  assert.equal(t('2026-11-18T14:00:00Z'), true);
  assert.equal(t('2026-11-18T14:23:00Z'), true, 'Befund 19.11.: Voll-Release 14:23 haette aufgeschoben werden muessen');
  assert.equal(t('2026-11-18T14:30:00Z'), true);
  assert.equal(t('2026-11-18T20:59:59Z'), true);
  assert.equal(t('2026-11-18T21:00:00Z'), false);
  assert.equal(t('2026-11-21T16:00:00Z'), false, 'Samstag');
  assert.equal(t('2026-11-22T16:00:00Z'), false, 'Sonntag');
  assert.equal(t('2026-11-20T16:00:00Z'), true, 'Freitag');
});
test('FP-7b Im Fenster liefert der Schnellweg nur Intraday, Nicht-Intraday-Dateien warten (AUFSCHUB), ausserhalb bleibt es VOLL', () => {
  const mix = [I + '/index.json', 'discover/ui/overview.css'];
  assert.equal(klassifiziere(mix).mode, 'FULL');
  const f = klassifiziere(mix, {fenster: true});
  assert.equal(f.mode, 'FAST');
  assert.equal(f.aufgeschoben, 1);
  assert.equal(klassifiziere(['discover/ui/overview.css'], {fenster: true}).mode, 'AUFSCHUB');
  assert.equal(klassifiziere(['docs/x.md'], {fenster: false}).mode, 'FULL', 'ausserhalb des Fensters bleibt FULL');
  const leer = klassifiziere(['docs/x.md'], {fenster: true});
  assert.equal(leer.mode, 'AUFSCHUB', 'im Fenster ohne Aenderung kein Voll-Release (Messung 20.11.)');
  assert.equal(leer.aufgeschoben, 0);
  assert.equal(klassifiziere([], {fenster: true}).mode, 'AUFSCHUB');
  assert.equal(klassifiziere([I + '/index.json'], {fenster: true}).mode, 'FAST');
});
test('FP-7c Workflow: AUFSCHUB hebt den Voll-Release auf, notfall und Veroeffentlicher bleiben Voll', () => {
  const wf = readFileSync(new URL('../../.github/workflows/pages-release.yml', import.meta.url), 'utf8');
  const job = wf.slice(wf.indexOf('  intraday-schnell:'), wf.indexOf('  deploy-schnell:'));
  assert.match(job, /aufschub: \$\{\{ steps\.weiche\.outputs\.mode == 'AUFSCHUB' \}\}/);
  assert.match(job, /klassifiziere --base="\$BASE" --head=HEAD --fenster=auto/);
  assert.match(job, /inputs\.notfall/, 'notfall ueberspringt den Schnellweg und damit den Aufschub');
  const pkg = wf.slice(wf.indexOf('  package:'), wf.indexOf('    steps:', wf.indexOf('  package:')));
  assert.match(pkg, /needs\.intraday-schnell\.outputs\.aufschub != 'true'/);
  assert.match(wf, /notfall:\n\s+description:/);
  assert.ok(job.indexOf('Veroeffentlicher seit dem Basis-Paket') < job.indexOf('--fenster=auto'), 'Veroeffentlicher-Pruefung kommt vor der Weiche');
});
