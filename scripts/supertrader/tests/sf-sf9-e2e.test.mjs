// Supertrader 9 – End-to-End-Prüfung des automatischen SF8-Tageswegs (ohne Veröffentlichung).
//
// Bildet .github/workflows/supertrader-sf8-candidates.yml (mode=auto) in derselben Reihenfolge in temporären
// Verzeichnissen nach: Erzeugung (build-candidates.mjs, echte CLI auf den Repodaten, Teiluniversum) → öffentliche
// Teile → Datenbudget → DQ-SF8-1..8 → Fingerabdruck → zweiter Lauf → Veröffentlichungsvertrag → Commit-Bedingung →
// Commit in ein Wegwerf-Git-Repository mit Wegwerf-Remote. Die Shell-Blöcke der Schritte werden WÖRTLICH aus dem
// Workflow gelesen und ausgeführt (bash), damit der Test bricht, sobald der Workflow sich anders verhält.
//
// Abweichungen vom echten Lauf, bewusst und eng:
//   * Teiluniversum (--tickers, ~60 Titel) statt 5.100 Titel: die Laufzeit des Tests (~25 s statt 2 × 42 s).
//   * Lauftag `today` aus dem Datenstand abgeleitet (Tag nach dem Marktstand), nicht `date -u +%F`; DQ mit --now
//     desselben Tages. Damit hängt der Test nicht davon ab, wann er läuft.
//   * Der veröffentlichte Stand (--prev) ist eine Kopie des eigenen Laufergebnisses mit verschobenem asOf
//     (abgeleitete Vorsitzung). Der echte Stand unter supertrader/data/sf-candidates wird nur gelesen; seine Bytes
//     werden am Ende verglichen.
//   * Die Registry im Arbeitsverzeichnis ist synthetisch (Dauerbetrieb bzw. mit activation).
// Es wird nichts im Repository geschrieben (scripts/quality/check-test-isolation.mjs), kein Netz, kein Lauf ausgelöst.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createCalendar, SOURCES } from '../source-faithful/product/eod-adapter.mjs';
import { checkInputs, lastCompletedSession, AUX_MAX_AGE_DAYS, GATE_STATUS } from '../source-faithful/product/input-gate.mjs';
import { runPipeline } from '../source-faithful/product/build-candidates.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WORKFLOW = path.join(ROOT, '.github/workflows/supertrader-sf8-candidates.yml');
const BUILD = path.join(ROOT, 'scripts/supertrader/source-faithful/product/build-candidates.mjs');
const CONTRACT = 'scripts/supertrader/source-faithful/product/publication-contract.mjs';
const PUBLISHED = path.join(ROOT, 'supertrader/data/sf-candidates');
const calendar = createCalendar();
const addDays = (d, n) => calendar.addDays(d, n);
const prevSession = (d) => { let x = addDays(d, -1); while (!calendar.isSession(x)) x = addDays(x, -1); return x; };

// ---------------------------------------------------------------------------------------------------------------
// Workflow lesen: Schritte mit Name, id, if und run-Block (wörtlich, Einrückung entfernt)
// ---------------------------------------------------------------------------------------------------------------
function parseSteps(yaml) {
  const lines = yaml.split('\n'), steps = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const m = l.match(/^ {6}- (name|uses): (.*)$/);
    if (m) { cur = { name: m[1] === 'name' ? m[2] : null, uses: m[1] === 'uses' ? m[2] : null, id: null, if: null, run: null }; steps.push(cur); continue; }
    if (/^ {2}[a-z]+:\s*$/.test(l)) cur = null; // nächster Job
    if (!cur) continue;
    let k;
    if ((k = l.match(/^ {8}id: (.*)$/))) cur.id = k[1].trim();
    else if ((k = l.match(/^ {8}if: (.*)$/))) cur.if = k[1].trim();
    else if (/^ {8}run: \|\s*$/.test(l)) {
      const body = [];
      for (i++; i < lines.length && (lines[i].startsWith('          ') || lines[i].trim() === ''); i++) body.push(lines[i].slice(10));
      i--;
      cur.run = body.join('\n').replace(/\s+$/, '') + '\n';
    } else if ((k = l.match(/^ {8}run: (.+)$/))) cur.run = k[1] + '\n';
  }
  return steps;
}

/** Auswertung der if-Ausdrücke dieses Workflows (nur &&, ==, !=, always(), steps.*, inputs.*, Literale). */
function evalIf(expr, ctx) {
  if (expr == null) return ctx.ok; // ohne if: nur, wenn kein früherer Schritt rot war (success())
  const val = (t) => {
    t = t.trim();
    if (/^'.*'$/.test(t)) return t.slice(1, -1);
    if (t === 'true' || t === 'false') return t === 'true';
    const parts = t.split('.');
    let v = ctx; for (const p of parts) v = v == null ? undefined : v[p];
    return v ?? '';
  };
  let always = false;
  const terms = expr.split('&&').map((s) => s.trim());
  const res = terms.every((t) => {
    if (t === 'always()') { always = true; return true; }
    const m = t.match(/^(.+?)\s*(==|!=)\s*(.+)$/);
    if (!m) throw new Error(`unbekannter if-Ausdruck: ${t}`);
    const a = val(m[1]), b = val(m[3]);
    return m[2] === '==' ? a === b : a !== b;
  });
  return res && (always || ctx.ok);
}

const YAML = fs.readFileSync(WORKFLOW, 'utf8');
const STEPS = parseSteps(YAML);
const step = (re) => { const s = STEPS.find((x) => x.name && re.test(x.name)); assert.ok(s, `Schritt ${re} fehlt im Workflow`); return s; };
const S = {
  build: step(/^Eingangspruefung und Kandidatenlauf/),
  pub: step(/^Oeffentliche Teile bereitstellen/),
  budget: step(/^Datenbudget/),
  dq: step(/^Datenqualitaet DQ-SF8/),
  fp: step(/^Fingerabdruck/),
  rebuild: step(/^Zweiter, unabhaengiger Lauf/),
  contract: step(/^Veroeffentlichungsvertrag/),
  manualCommit: step(/^Commit \(nur supertrader/),
  autoCommit: step(/^Commit nach Vertrag/),
};

// ---------------------------------------------------------------------------------------------------------------
// Hilfen: bash-Schritt ausführen, GITHUB_OUTPUT lesen, Verzeichnis-Abdruck
// ---------------------------------------------------------------------------------------------------------------
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sf9-e2e-'));
process.on('exit', () => fs.rmSync(TMP, { recursive: true, force: true }));
let seq = 0;
const isolatedGit = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };

function runStep(s, { cwd = ROOT, env = {}, script = s.run } = {}) {
  const n = ++seq, out = path.join(TMP, `gho-${n}`), sum = path.join(TMP, `ghs-${n}`), genv = path.join(TMP, `ghe-${n}`);
  for (const f of [out, sum, genv]) fs.writeFileSync(f, '');
  const r = spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script], {
    cwd, encoding: 'utf8', env: { ...process.env, ...isolatedGit, RUNNER_TEMP: TMP, GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: sum, GITHUB_ENV: genv, ...env }, maxBuffer: 1 << 26,
  });
  const outputs = Object.fromEntries(fs.readFileSync(out, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, outputs, log: `${r.stdout}\n${r.stderr}` };
}

function dirDigest(dir) {
  const h = crypto.createHash('sha256'), walk = (d, rel) => {
    for (const n of fs.readdirSync(d).sort()) {
      const p = path.join(d, n), r = rel ? `${rel}/${n}` : n;
      if (fs.statSync(p).isDirectory()) walk(p, r); else h.update(`${r}\0`).update(fs.readFileSync(p)).update('\0');
    }
  };
  if (fs.existsSync(dir)) walk(dir, ''); else h.update('<fehlt>');
  return h.digest('hex');
}
const copyDir = (a, b) => { fs.rmSync(b, { recursive: true, force: true }); fs.mkdirSync(path.dirname(b), { recursive: true }); fs.cpSync(a, b, { recursive: true }); };
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJson = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o) + '\n'); };

/** Der build-Aufruf des Workflows, mit genau seinen Argumenten (plus --tickers für das Teiluniversum). */
function buildArgs(out, stats, today) {
  return ['--max-old-space-size=4096', BUILD, '--out', out, '--stats', stats, ...(today ? ['--require-current', today] : []), '--tickers', TICKERS.join(',')];
}
const spawnAsync = (args) => new Promise((resolve) => {
  const t0 = Date.now(), c = spawn(process.execPath, args, { cwd: ROOT, env: process.env });
  let log = ''; c.stdout.on('data', (d) => { log += d; }); c.stderr.on('data', (d) => { log += d; });
  c.on('close', (status) => resolve({ status, log, ms: Date.now() - t0 }));
});

// ---------------------------------------------------------------------------------------------------------------
// Ausgangslage: Teiluniversum, Marktstand, Lauftag
// ---------------------------------------------------------------------------------------------------------------
// Titel aus dem veröffentlichten Stand (jeder k-te Kandidatentitel), damit DQ-SF8 Kandidaten zu prüfen hat (checked > 0).
const TICKERS = (() => {
  const p = path.join(PUBLISHED, 'index.json');
  const all = fs.existsSync(p) ? [...new Set(readJson(p).candidates.map((c) => c.t))].sort() : [];
  const pick = []; for (let k = 0; k < all.length; k += Math.max(1, Math.ceil(all.length / 60))) pick.push(all[k]);
  return pick.length >= 20 ? pick : ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'JPM', 'XOM', 'LLY', 'AVGO', 'COST', 'NFLX', 'AMD', 'CRM', 'ORCL', 'PLTR', 'UBER', 'ANET', 'CAT', 'GE'];
})();

function sampleMarketAsOf() {
  const dir = path.join(ROOT, SOURCES.dailyBars), files = fs.readdirSync(dir).filter((f) => /\.json\.gz$/.test(f)).sort();
  const c = new Map();
  for (let k = 0; k < files.length; k += Math.max(1, Math.floor(files.length / 12))) {
    const sh = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, files[k]))).toString('utf8'));
    for (const inst of Object.values(sh.instruments || {})) { const d = String(inst.bars?.timestamps?.at(-1) ?? '').slice(0, 10); if (d) c.set(d, (c.get(d) || 0) + 1); }
  }
  return [...c].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0][0];
}

const W = {}; // gemeinsamer Zustand der Fälle (Ergebnisse der Erzeugungen)
const before = { published: dirDigest(PUBLISHED) };

test('SF9-E2E-0 · Erzeugung wie im Workflow: drei Läufe parallel (A, B, Wiederaufnahme C) und ein veralteter Lauf', async (t) => {
  // build-Aufruf des Workflows unverändert (dieselben Argumente in beiden Läufen)
  for (const s of [S.build, S.rebuild]) assert.match(s.run, /build-candidates\.mjs \\\n\s+--out "\$OUT2?" --stats "[^"]+" --require-current "\$heute" "\$\{prev\[@\]\}"/, s.name);
  // Lauftag = Tag nach dem Marktstand der Repodaten (häufigster letzter Balken, wie eod-adapter#marketAsOf; hier aus
  // einer Stichprobe der Shards, die Erzeugung bestätigt ihn unten)
  W.asOf = sampleMarketAsOf();
  W.today = addDays(W.asOf, 1);
  assert.equal(lastCompletedSession(calendar, W.today), W.asOf, 'Marktstand ist eine XNYS-Sitzung');
  W.now = `${W.today}T12:00:00Z`;
  // Eingangsprüfung der echten Repodaten an diesem Lauftag (Security Master wird nicht angefasst; ist er zu alt,
  // muss die CLI abbrechen, und die übrigen Fälle laufen ohne --require-current weiter, mit Hinweis)
  W.gate = checkInputs({ today: W.today, asOf: W.asOf, calendar });
  const req = W.gate.status === GATE_STATUS.CURRENT ? W.today : null;
  if (!req) t.diagnostic(`Repodaten am Lauftag ${W.today} nicht CURRENT (${W.gate.status}: ${JSON.stringify(W.gate.staleSources)}) – Läufe ohne --require-current`);
  // C: Wiederaufnahme in ein Verzeichnis, in dem ein abgebrochener Lauf Reste hinterlassen hat (kein summary/index,
  // fremde Strategie- und Shard-Dateien, records/ halb)
  W.out = { A: path.join(TMP, 'out-A'), B: path.join(TMP, 'out-B'), C: path.join(TMP, 'out-C'), D: path.join(TMP, 'out-D') };
  for (const [rel, body] of [['strategy/C01.json', '{"kaputt'], ['strategy/C99.json', '{}'], ['ticker/ZZ.json', '{}'], ['records/C01.json', '']]) {
    fs.mkdirSync(path.dirname(path.join(W.out.C, rel)), { recursive: true }); fs.writeFileSync(path.join(W.out.C, rel), body);
  }
  // D: Lauftag drei Sitzungen nach dem Marktstand → STALE, Exit 3, keine Ausgabe
  let late = W.asOf; for (let k = 0; k < 3; k++) late = calendar.nextSession(late);
  W.lateToday = addDays(late, 1);
  const t0 = Date.now();
  const [A, B, C, D] = await Promise.all([
    spawnAsync(buildArgs(W.out.A, path.join(TMP, 'stats-A.json'), req)),
    spawnAsync(buildArgs(W.out.B, path.join(TMP, 'stats-B.json'), req)),
    spawnAsync(buildArgs(W.out.C, path.join(TMP, 'stats-C.json'), req)),
    spawnAsync(buildArgs(W.out.D, path.join(TMP, 'stats-D.json'), W.lateToday)),
  ]);
  W.ms = { wall: Date.now() - t0, A: A.ms, B: B.ms, C: C.ms, D: D.ms };
  W.D = D; W.req = req;
  for (const [k, r] of Object.entries({ A, B, C })) assert.equal(r.status, 0, `${k}: ${r.log}`);
  W.stats = readJson(path.join(TMP, 'stats-A.json'));
  assert.equal(W.stats.asOf, W.asOf, 'Marktstand der Erzeugung = Stichprobe');
  // Quelle des abgeleiteten veröffentlichten Stands: die öffentlichen Teile von A (wie sie committet würden)
  const src = runStep(S.pub, { env: { OUT: W.out.A, PUB: W.out.A + '-prevsrc' } });
  assert.equal(src.status, 0, src.log);
  t.diagnostic(`asOf ${W.asOf}, Lauftag ${W.today}, ${TICKERS.length} Titel, ${W.stats.candidates.candidates} Kandidaten, Erzeugung parallel ${W.ms.wall} ms (A ${A.ms}, B ${B.ms}, C ${C.ms}, D ${D.ms})`);
});

// Bereitstellung, Budget, DQ, Fingerabdruck – die Schritte 4–6 des Workflows für ein Ergebnisverzeichnis
function publicPart(out, tag) {
  const pub = path.join(TMP, `pub-${tag}`);
  const r = runStep(S.pub, { env: { OUT: out, PUB: pub } });
  return { pub, r };
}
function budget(pub) { return runStep(S.budget, { env: { PUB: pub } }); }
function dqStep(pub, tag) {
  const report = path.join(TMP, `dq-${tag}.json`);
  // einzige Änderung am wörtlichen Block: --now des Lauftags (der Workflow nimmt die Uhr des Runners)
  const script = S.dq.run.replace('--sf8-activated --json > "$REPORT"', '--sf8-activated --json --now="$SF8_E2E_NOW" > "$REPORT"');
  assert.notEqual(script, S.dq.run, 'DQ-Aufruf im Workflow unverändert erwartet');
  return { report, r: runStep(S.dq, { script, env: { PUB: pub, REPORT: report, SF8_E2E_NOW: W.now } }) };
}
const dqVerdictOnly = (report) => {
  const script = S.dq.run.replace(/^node scripts\/core\/data-quality\.mjs [^\n]*\n/m, '');
  assert.notEqual(script, S.dq.run);
  return runStep(S.dq, { script, env: { REPORT: report } });
};
const fingerprint = (pub) => runStep(S.fp, { env: { PUB: pub } });

// Arbeitsverzeichnis wie der Checkout des Runners für Vertrag und Commit: Registry, Vertrag, push-with-retry,
// veröffentlichter Stand. Optional als Git-Repository mit einem Wegwerf-Remote (origin, Branch main).
const SF8_ENTRY = { id: 'supertrader-sf8-candidates', artifact: '/supertrader/data/sf-candidates/summary.json', producer: 'scripts/supertrader/source-faithful/product/build-candidates.mjs' };
function workspace(tag, { prevFrom, prevMutate = null, registry = SF8_ENTRY, git = false }) {
  const ws = path.join(TMP, `ws-${tag}`);
  fs.mkdirSync(ws, { recursive: true });
  writeJson(path.join(ws, 'core/registry/domains.json'), { domains: registry ? [registry] : [] });
  fs.mkdirSync(path.join(ws, path.dirname(CONTRACT)), { recursive: true });
  fs.copyFileSync(path.join(ROOT, CONTRACT), path.join(ws, CONTRACT));
  fs.mkdirSync(path.join(ws, 'scripts/ci'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'scripts/ci/push-with-retry.sh'), path.join(ws, 'scripts/ci/push-with-retry.sh'));
  fs.chmodSync(path.join(ws, 'scripts/ci/push-with-retry.sh'), 0o755);
  const prev = path.join(ws, 'supertrader/data/sf-candidates');
  if (prevFrom) {
    copyDir(prevFrom, prev);
    if (prevMutate) { const s = readJson(path.join(prev, 'summary.json')); prevMutate(s); writeJson(path.join(prev, 'summary.json'), s); }
  }
  if (git) {
    const g = (...a) => { const r = spawnSync('git', a, { cwd: ws, encoding: 'utf8', env: { ...process.env, ...isolatedGit } }); assert.equal(r.status, 0, `git ${a.join(' ')}: ${r.stderr}`); return r.stdout.trim(); };
    const remote = path.join(TMP, `remote-${tag}.git`);
    assert.equal(spawnSync('git', ['init', '-q', '--bare', '-b', 'main', remote], { env: { ...process.env, ...isolatedGit } }).status, 0);
    g('init', '-q', '-b', 'main'); g('add', '-A');
    g('-c', 'user.name=e2e', '-c', 'user.email=e2e@example.invalid', 'commit', '-q', '-m', 'Ausgangsstand');
    g('remote', 'add', 'origin', remote); g('push', '-q', 'origin', 'HEAD:main');
    return { ws, prev, remote, g, head: g('rev-parse', 'HEAD') };
  }
  return { ws, prev };
}
function contractStep(ws, { pub, report, fp, fp2 }) {
  const record = path.join(TMP, `record-${++seq}.json`);
  const r = runStep(S.contract, { cwd: ws, env: { PUB: pub, REPORT: report, RECORD: record, FP: fp, FP2: fp2, GITHUB_SHA: 'e2e0000', GITHUB_RUN_ID: '0' } });
  return { ...r, record: fs.existsSync(record) ? readJson(record) : null, recordPath: record };
}
const ctxOf = (decision, { ok = true, commit = false } = {}) => ({ ok, inputs: { commit }, steps: { mode: { outputs: { auto: 'true' } }, contract: { outputs: { decision } } } });

/** Die Kette nach der Erzeugung, wie sie der Runner ausführt; ein roter Schritt beendet den Job (kein Commit). */
function chain({ out, out2, tag, prevFrom, prevMutate, registry, mutateNext = null, mutateDq = null, git = true }) {
  const res = { steps: [] };
  const done = (name, r) => { res.steps.push([name, r.status]); return r.status === 0; };
  const a = publicPart(out, `${tag}-1`);
  if (!done('pub', a.r)) return { ...res, failedAt: 'pub', commitRan: false };
  if (mutateNext) mutateNext(a.pub);
  if (!done('budget', budget(a.pub))) return { ...res, failedAt: 'budget', commitRan: false };
  const dq = dqStep(a.pub, tag);
  if (mutateDq) { const rep = readJson(dq.report); mutateDq(rep); writeJson(dq.report, rep); }
  const dqr = mutateDq ? dqVerdictOnly(dq.report) : dq.r;
  res.dqLog = dqr.log;
  if (!done('dq', dqr)) return { ...res, failedAt: 'dq', commitRan: false, dqReport: dq.report };
  const f1 = fingerprint(a.pub); done('fp', f1);
  const b = publicPart(out2, `${tag}-2`); if (!done('pub2', b.r)) return { ...res, failedAt: 'pub2', commitRan: false };
  if (mutateNext) mutateNext(b.pub);
  const f2 = fingerprint(b.pub); done('fp2', f2);
  res.fp = f1.outputs.fp; res.fp2 = f2.outputs.fp;
  const w = workspace(tag, { prevFrom, prevMutate, registry, git });
  res.ws = w; res.prevBefore = dirDigest(w.prev);
  const c = contractStep(w.ws, { pub: a.pub, report: dq.report, fp: res.fp, fp2: res.fp2 });
  res.contract = c; res.decision = c.outputs.decision; done('contract', c);
  const ctx = ctxOf(res.decision, { ok: c.status === 0 });
  res.commitRan = false;
  for (const s of [S.manualCommit, S.autoCommit]) {
    if (!evalIf(s.if, ctx)) continue;
    res.commitRan = true;
    res.commit = runStep(s, { cwd: w.ws, env: { PUB: a.pub, RECORD: c.recordPath, PUSH_OWNED_PATHS: 'supertrader/data/sf-candidates/', GITHUB_REF: 'refs/heads/main', GITHUB_REF_NAME: 'main' } });
  }
  res.prevAfter = dirDigest(w.prev);
  res.pub = a.pub;
  return res;
}
// abgeleitete Vorsitzung: derselbe Stand, eine Sitzung früher veröffentlicht
const earlier = (s) => { s.nextSession = s.asOf; s.asOf = prevSession(s.asOf); };

test('SF9-E2E-1 · C1: zwei Berechnungen = gleicher Fingerabdruck → PUBLISH und genau ein Commit; Gegenprobe abweichend → BLOCKED', () => {
  const r = chain({ out: W.out.A, out2: W.out.B, tag: 'pub', prevFrom: W.out.A + '-prevsrc', prevMutate: earlier });
  W.e2e = r;
  assert.match(r.fp, /^[0-9a-f]{64}$/); assert.equal(r.fp, r.fp2, 'C1 im Lauf');
  assert.equal(r.decision, 'PUBLISH', r.contract.log);
  assert.equal(r.commitRan, true); assert.equal(r.commit.status, 0, r.commit.log);
  const { g, remote } = r.ws;
  assert.equal(spawnSync('git', ['--git-dir', remote, 'rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim(), g('rev-parse', 'HEAD'), 'gepusht über push-with-retry.sh');
  assert.equal(g('rev-list', '--count', `${r.ws.head}..HEAD`), '1', 'genau ein Commit');
  const files = g('diff', '--name-only', `${r.ws.head}`, 'HEAD').split('\n').filter(Boolean);
  assert.ok(files.length > 0 && files.every((f) => f.startsWith('supertrader/data/sf-candidates/') && !f.includes('/records/')), files.join(','));
  assert.equal(dirDigest(r.ws.prev), dirDigest(r.pub), 'committet ist genau das geprüfte Verzeichnis');
  const msg = g('log', '-1', '--format=%B');
  for (const k of ['SF8-Contract: sf8-auto-publication-1.0.0', `SF8-Fingerprint: ${r.fp}`, `SF8-Inputs-SHA256: ${W.stats && readJson(path.join(r.pub, 'summary.json')).inputs.inputsSha256}`, 'SF8-Code-Commit: e2e0000']) assert.ok(msg.includes(k), `${k} in ${msg}`);
  // Gegenprobe: ein Byte im zweiten Lauf anders → anderer Fingerabdruck → BLOCKED (C1), kein Commit
  const bad = chain({ out: W.out.A, out2: W.out.B, tag: 'c1bad', prevFrom: W.out.A + '-prevsrc', prevMutate: earlier,
    mutateNext: (pub) => { if (pub.endsWith('-2')) fs.appendFileSync(path.join(pub, 'strategy/C01.json'), ' '); } });
  assert.notEqual(bad.fp, bad.fp2); assert.equal(bad.decision, 'BLOCKED'); assert.equal(bad.contract.status, 5);
  assert.match(bad.contract.log, /C1 nicht reproduzierbar/); assert.equal(bad.commitRan, false); assert.equal(bad.prevAfter, bad.prevBefore);
});

test('SF9-E2E-2 · C4: geänderte Fachmodell-Versionen bzw. candidateContractSha256 → BLOCKED, kein Commit', () => {
  for (const [k, v] of [['candidateContractSha256', '0'.repeat(64)], ['detectors', 'sf8-detectors-9.9.9'], ['pipeline', 'sf8-candidate-pipeline-2.0.0']]) {
    const r = chain({ out: W.out.A, out2: W.out.B, tag: `c4-${k}`, prevFrom: W.out.A + '-prevsrc', prevMutate: (s) => { earlier(s); s.versions[k] = v; } });
    assert.equal(r.fp, r.fp2); assert.equal(r.decision, 'BLOCKED', k);
    assert.ok(r.contract.log.includes(`C4 versions.${k}`), r.contract.log); assert.equal(r.commitRan, false); assert.equal(r.prevAfter, r.prevBefore);
  }
  const e = chain({ out: W.out.A, out2: W.out.B, tag: 'c4-engine', prevFrom: W.out.A + '-prevsrc', prevMutate: (s) => { earlier(s); s.strategies[0].engine.engineVersion += '-alt'; } });
  assert.equal(e.decision, 'BLOCKED'); assert.match(e.contract.log, /C4 Engine-Versionen/); assert.equal(e.commitRan, false);
});

test('SF9-E2E-3 · C5 Datenfrische: älterer Stand → BLOCKED, gleiche Sitzung → SKIP_SAME_SESSION, neuere → PUBLISH', () => {
  const older = chain({ out: W.out.A, out2: W.out.B, tag: 'c5-older', prevFrom: W.out.A + '-prevsrc', prevMutate: (s) => { s.asOf = calendar.nextSession(s.asOf); s.nextSession = calendar.nextSession(s.asOf); } });
  assert.equal(older.decision, 'BLOCKED'); assert.match(older.contract.log, /C5 neuer Stand \S+ älter als der veröffentlichte/); assert.equal(older.commitRan, false);
  assert.equal(older.prevAfter, older.prevBefore);
  const same = chain({ out: W.out.A, out2: W.out.B, tag: 'c5-same', prevFrom: W.out.A + '-prevsrc' });
  assert.equal(same.decision, 'SKIP_SAME_SESSION'); assert.equal(same.contract.status, 0, 'SKIP ist grün'); assert.equal(same.commitRan, false);
  assert.equal(same.prevAfter, same.prevBefore);
  assert.equal(W.e2e.decision, 'PUBLISH', 'neuere Sitzung (Fall 1)');
  // ohne veröffentlichten Stand: die erste Veröffentlichung ist manuell
  const none = chain({ out: W.out.A, out2: W.out.B, tag: 'c5-none', prevFrom: null });
  assert.equal(none.decision, 'BLOCKED'); assert.match(none.contract.log, /C5 kein veröffentlichter Stand/); assert.equal(none.commitRan, false);
});

test('SF9-E2E-4 · fehlende bzw. veraltete Eingänge: build-candidates --require-current bricht mit Exit 3 ab, kein Ergebnis', () => {
  assert.equal(W.D.status, 3, W.D.log);
  assert.match(W.D.log, /Eingangsprüfung STALE/);
  assert.equal(fs.existsSync(W.out.D), false, 'kein Ergebnisverzeichnis'); assert.equal(fs.existsSync(path.join(TMP, 'stats-D.json')), false);
  // ohne Ergebnis scheitert schon die Bereitstellung: kein Fingerabdruck, kein Vertrag, kein Commit
  const r = chain({ out: W.out.D, out2: W.out.D, tag: 'missing', prevFrom: W.out.A + '-prevsrc', prevMutate: earlier });
  assert.equal(r.failedAt, 'pub'); assert.equal(r.commitRan, false);
  // MISSING: fehlt eine Pflichtquelle, entscheidet die Eingangsprüfung vor jeder Datumsprüfung (Fixture-Wurzel)
  const root = fs.mkdtempSync(path.join(TMP, 'gate-missing-'));
  for (const [key, rel] of Object.entries(SOURCES)) if (key !== 'sic') { const p = path.join(root, rel, ['dailyBars', 'priceReference', 'weeklyLong'].includes(key) ? 'X.json' : ''); writeJson(p, { generatedAt: `${W.today}T00:00:00Z` }); }
  const g = checkInputs({ root, today: W.today, asOf: W.asOf, calendar });
  assert.equal(g.status, GATE_STATUS.MISSING); assert.deepEqual(g.missing, ['sic']);
  // und ohne Preisreferenz rechnet die Pipeline nicht (V4, fail closed)
  assert.throws(() => runPipeline({ securities: [], asOf: W.asOf, calendar, continuity: { bySecurityId: new Map() } }), /SF8_PRICE_REFERENCE_SOURCE_REQUIRED/);
});

test('SF9-E2E-5 · nicht bestandene DQ: FAIL, checked=0 oder fehlende Regel → roter DQ-Schritt; im Vertrag BLOCKED (C2)', () => {
  const cases = {
    fail: (rep) => { const x = rep.rules.find((y) => y.id === 'DQ-SF8-8'); x.status = 'FAIL'; x.failed = 1; x.samples = ['XYZ']; },
    checked0: (rep) => { const x = rep.rules.find((y) => y.id === 'DQ-SF8-4'); x.checked = 0; },
    missing: (rep) => { rep.rules = rep.rules.filter((y) => y.id !== 'DQ-SF8-6'); },
  };
  for (const [k, m] of Object.entries(cases)) {
    const r = chain({ out: W.out.A, out2: W.out.B, tag: `dq-${k}`, prevFrom: W.out.A + '-prevsrc', prevMutate: earlier, mutateDq: m });
    assert.equal(r.failedAt, 'dq', `${k}: ${r.dqLog}`); assert.equal(r.commitRan, false);
    assert.match(r.dqLog, k === 'missing' ? /DQ-SF8-Regeln fehlen \(7 von 8\)/ : /DQ-SF8 nicht bestanden/);
    // hätte der Schritt nicht abgebrochen, lehnt der Vertrag denselben Bericht ab
    const w = workspace(`dq-${k}-c`, { prevFrom: W.out.A + '-prevsrc', prevMutate: earlier });
    const fp = fingerprint(path.join(TMP, `pub-dq-${k}-1`)).outputs.fp;
    const c = contractStep(w.ws, { pub: path.join(TMP, `pub-dq-${k}-1`), report: r.dqReport, fp, fp2: fp });
    assert.equal(c.outputs.decision, 'BLOCKED', k); assert.match(c.log, /::error::C2 /);
  }
  // das echte Laufergebnis besteht alle acht Regeln (checked > 0)
  const rep = readJson(path.join(TMP, 'dq-pub.json'));
  const sf8 = rep.rules.filter((x) => /^DQ-SF8-[1-8]$/.test(x.id));
  assert.equal(sf8.length, 8); assert.ok(sf8.every((x) => x.status === 'PASS' && x.checked > 0), JSON.stringify(sf8.map((x) => [x.id, x.status, x.checked])));
  W.dq = sf8.map((x) => `${x.id} ${x.failed}/${x.checked}`).join(', ');
});

test('SF9-E2E-6 · Abbruch mitten im Lauf: unvollständiges Ergebnis → kein Commit; Wiederaufnahme liefert denselben Fingerabdruck', () => {
  for (const missing of ['summary.json', 'index.json', 'strategy']) {
    const cut = path.join(TMP, `cut-${missing}`);
    copyDir(W.out.A, cut); fs.rmSync(path.join(cut, missing), { recursive: true, force: true });
    const r = chain({ out: cut, out2: W.out.B, tag: `cut-${missing}`, prevFrom: W.out.A + '-prevsrc', prevMutate: earlier });
    assert.equal(r.failedAt, 'pub', missing); assert.equal(r.commitRan, false);
  }
  // Bereitstellung bestanden, aber der öffentliche Teil ist unvollständig (z. B. Abbruch beim Kopieren): DQ rot
  const r = chain({ out: W.out.A, out2: W.out.B, tag: 'cut-pub', prevFrom: W.out.A + '-prevsrc', prevMutate: earlier,
    mutateNext: (pub) => { if (pub.endsWith('-1')) fs.rmSync(path.join(pub, 'index.json')); } });
  assert.equal(r.failedAt, 'dq', r.dqLog); assert.equal(r.commitRan, false);
  // Vertrag ohne summary.json des neuen Stands: BLOCKED
  const w = workspace('cut-contract', { prevFrom: W.out.A + '-prevsrc', prevMutate: earlier });
  const c = contractStep(w.ws, { pub: path.join(TMP, 'no-such-dir'), report: path.join(TMP, 'dq-pub.json'), fp: W.e2e.fp, fp2: W.e2e.fp });
  assert.equal(c.outputs.decision, 'BLOCKED'); assert.match(c.log, /C5 neuer Stand fehlt/);
  // Wiederaufnahme: Lauf C in ein Verzeichnis mit Resten eines Abbruchs ergibt bitgleich denselben öffentlichen Stand
  const pc = publicPart(W.out.C, 'resume');
  assert.equal(pc.r.status, 0, pc.r.log);
  assert.equal(fingerprint(pc.pub).outputs.fp, W.e2e.fp, 'Wiederaufnahme = derselbe Fingerabdruck');
  assert.equal(fs.existsSync(path.join(W.out.C, 'strategy/C99.json')), false, 'fremde Reste in strategy/ entfernt');
  assert.equal(fs.existsSync(path.join(W.out.C, 'ticker/ZZ.json')), false, 'fremde Reste in ticker/ entfernt');
});

test('SF9-E2E-7 · Schutz vor Überschreiben: Commit-Schritte nur bei PUBLISH (if-Bedingungen), veröffentlichte Bytes bei BLOCKED/SKIP unverändert', () => {
  // statisch: genau zwei Schritte committen; keiner läuft nach einem roten Schritt (kein always()/failure())
  const committing = STEPS.filter((s) => s.run && /git commit|push-with-retry\.sh/.test(s.run));
  assert.deepEqual(committing.map((s) => s.name), [S.manualCommit.name, S.autoCommit.name]);
  for (const s of committing) assert.doesNotMatch(String(s.if), /always\(\)|failure\(\)|cancelled\(\)|\|\|/, s.name);
  assert.equal(S.autoCommit.if, "steps.mode.outputs.auto == 'true' && steps.contract.outputs.decision == 'PUBLISH'");
  assert.equal(S.manualCommit.if, "inputs.commit == true && steps.mode.outputs.auto != 'true'");
  assert.ok(STEPS.indexOf(S.autoCommit) > STEPS.indexOf(S.contract) && STEPS.indexOf(S.contract) > STEPS.indexOf(S.rebuild) && STEPS.indexOf(S.rebuild) > STEPS.indexOf(S.fp) && STEPS.indexOf(S.fp) > STEPS.indexOf(S.dq) && STEPS.indexOf(S.dq) > STEPS.indexOf(S.budget) && STEPS.indexOf(S.budget) > STEPS.indexOf(S.pub) && STEPS.indexOf(S.pub) > STEPS.indexOf(S.build));
  // Entscheidungstabelle über die echten if-Ausdrücke (automatischer Weg)
  for (const [decision, ok, expect] of [['PUBLISH', true, true], ['SKIP_SAME_SESSION', true, false], ['BLOCKED', false, false], ['', false, false], ['PUBLISH', false, false]]) {
    const ran = [S.manualCommit, S.autoCommit].filter((s) => evalIf(s.if, ctxOf(decision, { ok }))).length > 0;
    assert.equal(ran, expect, `${decision}/${ok}`);
  }
  // automatischer Weg mit commit=true (workflow_dispatch mode=auto commit=true): der manuelle Commit läuft trotzdem nicht
  assert.equal(evalIf(S.manualCommit.if, { ...ctxOf('BLOCKED'), inputs: { commit: true } }), false);
  // manueller Commit-Block selbst: ohne expected_sha256 kein Commit
  const w = workspace('manual', { prevFrom: W.out.A + '-prevsrc', prevMutate: earlier, git: true });
  const m = runStep(S.manualCommit, { cwd: w.ws, env: { PUB: W.e2e.pub, EXPECTED_SHA256: '', ACTUAL_SHA256: W.e2e.fp, PUSH_OWNED_PATHS: 'supertrader/data/sf-candidates/', GITHUB_REF_NAME: 'main' } });
  assert.equal(m.status, 1); assert.match(m.log, /nicht der freigegebene Stand/); assert.equal(w.g('rev-parse', 'HEAD'), w.head);
  // Bytes des veröffentlichten Stands: in jedem BLOCKED/SKIP-Fall oben unverändert (prevAfter = prevBefore), im Repo
  // ohnehin (dieser Test liest ihn nur)
  assert.equal(dirDigest(PUBLISHED), before.published, 'supertrader/data/sf-candidates unverändert');
});

test('SF9-E2E-8 · C7: Registry mit activation (oder ohne Eintrag) → BLOCKED, kein Commit', () => {
  for (const [k, reg] of [['activating', { ...SF8_ENTRY, activation: { state: 'ACTIVATING' } }], ['prepared', { ...SF8_ENTRY, activation: { state: 'PREPARED_DISABLED' } }], ['fehlt', null], ['anderes-artefakt', { ...SF8_ENTRY, artifact: '/supertrader/data/x.json' }]]) {
    const r = chain({ out: W.out.A, out2: W.out.B, tag: `c7-${k}`, prevFrom: W.out.A + '-prevsrc', prevMutate: earlier, registry: reg });
    assert.equal(r.decision, 'BLOCKED', k); assert.match(r.contract.log, /C7 Registry-Eintrag nicht freigegeben/); assert.equal(r.commitRan, false);
    assert.equal(r.prevAfter, r.prevBefore); assert.equal(r.ws.g('rev-parse', 'HEAD'), r.ws.head);
  }
});

test('SF9-E2E-9 · Security Master: nur das bestehende Verhalten (STALE → Abbruch) mit synthetischem Alter', (t) => {
  const max = AUX_MAX_AGE_DAYS.master;
  assert.equal(max, 60);
  const fixture = (masterAt) => {
    const root = fs.mkdtempSync(path.join(TMP, 'gate-master-'));
    for (const [key, rel] of Object.entries(SOURCES)) {
      const at = key === 'master' ? masterAt : `${W.today}T00:00:00Z`;
      writeJson(path.join(root, rel, ['dailyBars', 'priceReference', 'weeklyLong'].includes(key) ? (key === 'weeklyLong' ? 'index.json' : 'X.json') : ''), { generatedAt: at });
    }
    return root;
  };
  const at = (days) => new Date(Date.parse(`${W.today}T00:00:00Z`) - days * 864e5).toISOString();
  const ok = checkInputs({ root: fixture(at(max)), today: W.today, asOf: W.asOf, calendar });
  assert.equal(ok.status, GATE_STATUS.CURRENT, 'an der Grenze zulässig');
  const stale = checkInputs({ root: fixture(at(max + 1)), today: W.today, asOf: W.asOf, calendar });
  assert.equal(stale.status, GATE_STATUS.STALE); assert.deepEqual(stale.staleSources.map((x) => x.source), ['master']);
  const undated = checkInputs({ root: fixture(null), today: W.today, asOf: W.asOf, calendar });
  assert.equal(undated.status, GATE_STATUS.STALE, 'ohne Erzeugungsdatum = veraltet');
  // echter Stamm: nur gelesen, nur berichtet (keine Zusicherung über künftige Daten)
  const real = readJson(path.join(ROOT, SOURCES.master)).generatedAt;
  const until = new Date(Date.parse(real) + max * 864e5).toISOString().slice(0, 10);
  // Ist der echte Stamm am Lauftag zu alt, muss die echte CLI abbrechen (wie D) – der Test hat die Läufe dann ohne
  // --require-current gemacht und meldet es
  if (W.gate.status !== GATE_STATUS.CURRENT) assert.ok(W.gate.staleSources.length > 0);
  t.diagnostic(`Security Master generatedAt ${real}: Eingangsprüfung CURRENT bis Lauftag ${until}`);
  W.master = { real, until };
});

test('SF9-E2E-10 · Messwerte', (t) => {
  const s = readJson(path.join(W.e2e.pub, 'summary.json'));
  const bytes = fs.readdirSync(W.e2e.pub, { recursive: true }).map((f) => path.join(W.e2e.pub, f)).filter((p) => fs.statSync(p).isFile()).reduce((a, p) => a + fs.statSync(p).size, 0);
  t.diagnostic(`Stand ${s.asOf} (Lauftag ${W.today}, Gate ${W.gate.status}${W.req ? '' : ', ohne --require-current'}), ${TICKERS.length} Titel, ${s.counts.candidates} Kandidaten ${JSON.stringify(s.counts.byStage)}`);
  t.diagnostic(`Fingerabdruck A = B = C ${W.e2e.fp}; öffentliche Teile ${bytes} Bytes; DQ ${W.dq}`);
  t.diagnostic(`Erzeugung parallel ${W.ms.wall} ms; Security Master CURRENT bis ${W.master?.until}`);
  assert.equal(dirDigest(PUBLISHED), before.published);
});

