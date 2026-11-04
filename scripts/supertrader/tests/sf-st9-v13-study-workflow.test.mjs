// Supertrader 9 – static checks of .github/workflows/supertrader-st9-v13-study.yml (owner-dispatched V13 study) with
// counter-checks, plus the two helpers it calls (fetch-v13-archive-parts.mjs, st9-study-summary.mjs) and a local run of
// its encryption step on a dummy output folder. Never dispatches the workflow; nothing is written to the repository.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fetchParts } from '../snapshot/fetch-v13-archive-parts.mjs';
import { summarize, markdown } from '../snapshot/st9-study-summary.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WF = fs.readFileSync(path.join(ROOT, '.github/workflows/supertrader-st9-v13-study.yml'), 'utf8');
const ALLOWED_SCRIPTS = Object.freeze([
  'scripts/supertrader/source-faithful/research/run-st9-v13-delisted-study.mjs',
  'scripts/supertrader/source-faithful/research/st9-v13-delisted-registration-1.0.0.json', // header comment only
  'scripts/supertrader/snapshot/fetch-v13-archive-parts.mjs',
  'scripts/supertrader/snapshot/st9-study-summary.mjs',
  'scripts/quant/v13/archive/restore-archive.sh',
]);
const S3 = ['VU_HISTORY_S3_ENDPOINT', 'VU_HISTORY_S3_BUCKET', 'VU_HISTORY_S3_REGION', 'VU_HISTORY_S3_ACCESS_KEY_ID', 'VU_HISTORY_S3_SECRET_ACCESS_KEY'];

/** Steps of the single job: { head, name, id, if, env: {k: v}, run, with, text }. */
function steps(text) {
  const lines = text.split('\n'), out = [];
  let cur = null;
  for (const l of lines) {
    if (/^ {6}- /.test(l)) { cur = { lines: [l.replace(/^ {6}- /, '        ')] }; out.push(cur); continue; }
    if (cur && (/^ {8}/.test(l) || l.trim() === '')) cur.lines.push(l); else if (cur && /^\S|^ {0,5}\S/.test(l)) cur = null;
  }
  return out.map(({ lines: ls }) => {
    const s = { env: {}, run: '', text: ls.join('\n') };
    for (let i = 0; i < ls.length; i++) {
      const m = /^ {8}([a-z-]+):\s*(.*)$/.exec(ls[i]);
      if (!m) continue;
      const [, k, v] = m;
      if (k === 'env' || k === 'with') { const o = k === 'env' ? s.env : (s.with = {}); for (i++; i < ls.length && /^ {10}/.test(ls[i]); i++) { const e = /^ {10}([A-Za-z0-9_-]+):\s*(.*)$/.exec(ls[i]); if (e) o[e[1]] = e[2]; } i--; }
      else if (k === 'run') { if (v === '|') { const body = []; for (i++; i < ls.length && (/^ {10}/.test(ls[i]) || ls[i].trim() === ''); i++) body.push(ls[i].slice(10)); i--; s.run = body.join('\n'); } else s.run = v; }
      else s[k] = v;
    }
    return s;
  });
}

/** Every rule of the task; returns violation codes (empty = pass). */
function lint(text) {
  const v = new Set(), st = steps(text);
  const on = /^on:\n((?: {2}.*\n|\n)*)/m.exec(text)?.[1] ?? '';
  const triggers = [...on.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]);
  if (triggers.join(',') !== 'workflow_dispatch') v.add('TRIGGER_NOT_DISPATCH_ONLY');
  if (!/^permissions:\n {2}contents: read\n(?! )/m.test(text)) v.add('PERMISSIONS_NOT_CONTENTS_READ');
  if (/:\s*write\b/.test(text) || /^\s+permissions:/m.test(text)) v.add('WRITE_PERMISSION');
  for (const s of st) {
    if (/\$\{\{\s*(inputs|secrets|github\.event)\./.test(s.run)) v.add('EXPRESSION_IN_SHELL');
    if (/\bgit\s+(push|commit)\b|push-with-retry|commit-and-push/.test(s.run)) v.add('GIT_WRITE');
    if (/--write-plain/.test(s.run)) v.add('WRITE_PLAIN');
    if (/set -x|\bprintenv\b|\benv\s*$|echo\s+"?\$V13_ARCHIVE_PRIVATE_KEY|cat\s+"?\$K"?/m.test(s.run)) v.add('SECRET_TO_LOG');
    for (const [k, val] of Object.entries(s.env)) {
      const m = /\$\{\{\s*secrets\.([A-Z0-9_]+)\s*(!=\s*'')?\s*\}\}/.exec(val);
      if (!m) continue;
      if (m[2]) { if (k !== `HAS_${m[1]}`) v.add('SECRET_PRESENCE_NAME'); continue; } // boolean only
      if (m[1] === 'V13_ARCHIVE_PRIVATE_KEY' && !/restore-archive\.sh/.test(s.run)) v.add('ARCHIVE_KEY_OUTSIDE_DECRYPT_STEP');
      if (S3.includes(m[1]) && !/fetch-v13-archive-parts\.mjs|run-st9-v13-delisted-study\.mjs/.test(s.run)) v.add('STORE_SECRET_OUTSIDE_STORE_STEP');
      if (!S3.includes(m[1]) && m[1] !== 'V13_ARCHIVE_PRIVATE_KEY') v.add('UNEXPECTED_SECRET');
    }
  }
  if (/\$\{\{\s*secrets\./.test(text.replace(/^ {10}[A-Z0-9_]+: \$\{\{\s*secrets\.[^\n]*$/gm, ''))) v.add('SECRET_OUTSIDE_ENV');
  const iRun = st.findIndex((s) => /run-st9-v13-delisted-study\.mjs/.test(s.run));
  const iEnc = st.findIndex((s) => /openssl enc -aes-256-cbc/.test(s.run) && /archive-pub\.pem/.test(s.run) && /rsa_oaep_md:sha256/.test(s.run));
  const iUp = st.findIndex((s) => /actions\/upload-artifact/.test(s.text));
  const iCheck = st.findIndex((s) => s.id === 'noplain');
  if (iRun < 0) v.add('RUNNER_MISSING');
  if (iEnc < 0) v.add('ENCRYPTION_MISSING');
  if (iUp < 0 || st.filter((s) => /actions\/upload-artifact/.test(s.text)).length !== 1) v.add('UPLOAD_NOT_SINGLE');
  if (iEnc >= 0 && iUp >= 0 && !(iRun < iEnc && iEnc < iUp)) v.add('UPLOAD_BEFORE_ENCRYPTION');
  if (iEnc >= 0) {
    const e = st[iEnc].run;
    if (!/tar\b[^\n]*-C "\$W\/out" \./.test(e)) v.add('NOT_WHOLE_OUTPUT_FOLDER');
    if (!/shred -u "\$W\/k\.bin" "\$W\/st9-output\.tar"/.test(e) || !/-exec shred -u \{\} \+\n\s*rm -rf "\$W\/out"\n\s*echo "encrypted=true"/.test(e) || !/rm -rf "\$W\/v13"/.test(e)) v.add('PLAINTEXT_NOT_DELETED');
    if (!/always\(\)/.test(st[iEnc].if ?? '')) v.add('ENCRYPTION_NOT_ALWAYS');
  }
  if (iUp >= 0) {
    const u = st[iUp];
    if (!(u.with?.path ?? '').endsWith('/st9/upload')) v.add('UPLOAD_PATH_NOT_ENCRYPTED_DIR');
    if (iCheck < 0 || iCheck > iUp || !/steps\.noplain\.outcome == 'success'/.test(u.if ?? '')) v.add('UPLOAD_NOT_GATED_BY_PLAINTEXT_CHECK');
  }
  if (iRun >= 0 && !/--out "\$OUT"/.test(st[iRun].run)) v.add('RUNNER_OUT_NOT_TEMP');
  if (iRun >= 0 && !/> "\$OUT\/run\.log" 2>&1/.test(st[iRun].run)) v.add('RUNNER_LOG_NOT_SEALED');
  // preflight: stdout is the JSON, stderr goes to its own file in the output folder (not mixed into the JSON)
  if (iRun >= 0 && (!/--preflight > "\$OUT\/preflight\.json" 2> "\$OUT\/preflight\.log"/.test(st[iRun].run) || /preflight\.json"? 2>&1/.test(st[iRun].run))) v.add('PREFLIGHT_STDERR_IN_JSON');
  // data key: 64 hex characters on one line (-pass file: stops at the first newline; binary rand -out may be cut short)
  if (iEnc >= 0 && (!/openssl rand -hex 32 > "\$W\/k\.bin"/.test(st[iEnc].run) || /openssl rand (?!-hex 32 >)/.test(st[iEnc].run))) v.add('DATA_KEY_NOT_HEX_LINE');
  // modules: only the study runner (and its frozen registration), the two snapshot helpers and the unchanged V13
  // restore script; no completion/ or research-signal module (the SF2-LEGACY-ISOLATION exception in
  // sf-completion.test.mjs is granted by file name, so its scope is pinned here); inline node -e only with fs
  const refs = [...text.matchAll(/scripts\/[A-Za-z0-9_./-]+/g)].map((m) => m[0]);
  if (refs.some((r) => !ALLOWED_SCRIPTS.includes(r))) v.add('MODULE_NOT_ALLOWED');
  if (/completion\/|research-signal|source-faithful\/(?!research\/(run-st9-v13-delisted-study\.mjs|st9-v13-delisted-registration-1\.0\.0\.json))/.test(text)) v.add('MODULE_NOT_ALLOWED');
  if ([...text.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].some((m) => m[1] !== 'fs') || /\bimport\s*\(/.test(text)) v.add('MODULE_NOT_ALLOWED');
  if (!/HAS_V13_ARCHIVE_PRIVATE_KEY/.test(text) || !/exit 3/.test(st.find((s) => /SECRET_MISSING/.test(s.run))?.run ?? '')) v.add('SECRETS_NOT_FAIL_CLOSED');
  const summary = st.filter((s) => /GITHUB_STEP_SUMMARY/.test(s.run));
  if (summary.some((s) => !/summary\.md/.test(s.run))) v.add('SUMMARY_NOT_WHITELISTED');
  return [...v].sort();
}

test('the workflow passes every static rule', () => {
  assert.deepEqual(lint(WF), []);
  const st = steps(WF);
  assert.equal(st.length, 13);
  assert.ok(/ref: \$\{\{ github\.ref \}\}/.test(WF) && /group: supertrader-st9-v13-study-\$\{\{ github\.ref_name \}\}/.test(WF));
  assert.ok(st.find((s) => /restore-archive\.sh/.test(s.run)).run.includes('v13-raw v13-derived'), 'only the two needed parts');
  assert.ok(/manifest-1\.2\.0\.json/.test(WF) && /archive-1\.2\.0\//.test(WF));
});

test('counter-checks: each rule turns red on its mutation', () => {
  const cases = [
    ['PERMISSIONS_NOT_CONTENTS_READ', (t) => t.replace('permissions:\n  contents: read', 'permissions:\n  contents: write')],
    ['WRITE_PERMISSION', (t) => t.replace('permissions:\n  contents: read', 'permissions:\n  contents: read\n  actions: write')],
    ['TRIGGER_NOT_DISPATCH_ONLY', (t) => t.replace('on:\n  workflow_dispatch:', "on:\n  push:\n    branches: ['claude/**']\n  workflow_dispatch:")],
    ['EXPRESSION_IN_SHELL', (t) => t.replace('[[ "$SNAPSHOT_ID" =~', '[[ "${{ inputs.snapshot_id }}" =~')],
    ['EXPRESSION_IN_SHELL', (t) => t.replace('printf \'%s\\n\' "$V13_ARCHIVE_PRIVATE_KEY"', 'printf \'%s\\n\' "${{ secrets.V13_ARCHIVE_PRIVATE_KEY }}"')],
    ['GIT_WRITE', (t) => t.replace('echo "Eingaben gueltig"', 'echo "Eingaben gueltig"\n          git commit -am x && git push')],
    ['WRITE_PLAIN', (t) => t.replace('--out "$OUT")', '--out "$OUT" --write-plain)')],
    ['SECRET_TO_LOG', (t) => t.replace('umask 077\n          M=', 'umask 077\n          echo "$V13_ARCHIVE_PRIVATE_KEY"\n          M=')],
    ['ARCHIVE_KEY_OUTSIDE_DECRYPT_STEP', (t) => t.replace('          NODE_OPTIONS: --max-old-space-size=12000', "          NODE_OPTIONS: --max-old-space-size=12000\n          V13_ARCHIVE_PRIVATE_KEY: ${{ secrets.V13_ARCHIVE_PRIVATE_KEY }}")],
    ['STORE_SECRET_OUTSIDE_STORE_STEP', (t) => t.replace("          RC: ${{ steps.run.outputs.rc }}\n        run: |\n          set -euo pipefail\n          node scripts/supertrader/snapshot/st9-study-summary.mjs", "          RC: ${{ steps.run.outputs.rc }}\n          VU_HISTORY_S3_BUCKET: ${{ secrets.VU_HISTORY_S3_BUCKET }}\n        run: |\n          set -euo pipefail\n          node scripts/supertrader/snapshot/st9-study-summary.mjs")],
    ['PLAINTEXT_NOT_DELETED', (t) => t.replace('            find "$W/out" -type f -exec shred -u {} +\n            rm -rf "$W/out"\n', '')],
    ['PLAINTEXT_NOT_DELETED', (t) => t.replace('shred -u "$W/k.bin" "$W/st9-output.tar"', 'true')],
    ['NOT_WHOLE_OUTPUT_FOLDER', (t) => t.replace('-C "$W/out" .', '-C "$W/out" st9-v13-delisted.sealed.json')],
    ['UPLOAD_PATH_NOT_ENCRYPTED_DIR', (t) => t.replace('path: ${{ runner.temp }}/st9/upload', 'path: ${{ runner.temp }}/st9/out')],
    ['UPLOAD_NOT_GATED_BY_PLAINTEXT_CHECK', (t) => t.replace("if: always() && steps.noplain.outcome == 'success'", "if: always() && steps.enc.outputs.encrypted == 'true'")],
    ['RUNNER_LOG_NOT_SEALED', (t) => t.replace('> "$OUT/run.log" 2>&1', '')],
    ['SECRETS_NOT_FAIL_CLOSED', (t) => t.replace('[ "$missing" = 0 ] || exit 3', '[ "$missing" = 0 ] || true')],
    ['PREFLIGHT_STDERR_IN_JSON', (t) => t.replace('--preflight > "$OUT/preflight.json" 2> "$OUT/preflight.log"', '--preflight > "$OUT/preflight.json" 2>&1')],
    ['DATA_KEY_NOT_HEX_LINE', (t) => t.replace('openssl rand -hex 32 > "$W/k.bin"', 'openssl rand -out "$W/k.bin" 32')],
    ['DATA_KEY_NOT_HEX_LINE', (t) => t.replace('openssl rand -hex 32 > "$W/k.bin"', 'openssl rand -hex 32 > "$W/k.bin"\n            openssl rand -out "$W/k.bin" 32')],
    ['MODULE_NOT_ALLOWED', (t) => t.replace('R=scripts/supertrader/source-faithful/research/run-st9-v13-delisted-study.mjs', 'R=scripts/supertrader/source-faithful/research/run-st9-v13-delisted-study.mjs\n          node scripts/supertrader/source-faithful/completion/build-completion.mjs')],
    ['MODULE_NOT_ALLOWED', (t) => t.replace('R=scripts/supertrader/source-faithful/research/run-st9-v13-delisted-study.mjs', 'R=scripts/supertrader/source-faithful/research/research-signal.mjs')],
    ['MODULE_NOT_ALLOWED', (t) => t.replace('node scripts/supertrader/snapshot/st9-study-summary.mjs', 'node scripts/supertrader/snapshot/other-helper.mjs')],
    ['MODULE_NOT_ALLOWED', (t) => t.replace('require("fs").readFileSync(process.argv[1], "utf8")).archivePublicKeySha256Der', 'require("fs").readFileSync(process.argv[1], "utf8")).archivePublicKeySha256Der + require("../source-faithful/completion/status.mjs")')],
    ['SUMMARY_NOT_WHITELISTED', (t) => t.replace('if [ -f "$RUNNER_TEMP/st9/summary.md" ]; then cat "$RUNNER_TEMP/st9/summary.md" >> "$GITHUB_STEP_SUMMARY"; fi', 'cat "$RUNNER_TEMP/st9/out/st9-v13-delisted.public.json" >> "$GITHUB_STEP_SUMMARY"')],
  ];
  for (const [code, f] of cases) {
    const m = f(WF);
    assert.notEqual(m, WF, `mutation for ${code} did not apply`);
    assert.ok(lint(m).includes(code), `${code}: ${lint(m).join(',')}`);
  }
  // upload moved before the encryption step
  const st = WF.split('\n      - '), iUp = st.findIndex((s) => s.startsWith('uses: actions/upload-artifact')), iEnc = st.findIndex((s) => s.startsWith('name: Ausgabeordner verschluesseln'));
  const moved = [...st]; const [up] = moved.splice(iUp, 1); moved.splice(iEnc, 0, up);
  assert.ok(lint(moved.join('\n      - ')).includes('UPLOAD_BEFORE_ENCRYPTION'));
});

test('encryption step, run locally on a dummy output folder: only ciphertext remains, plaintext and key are gone', () => {
  const enc = steps(WF).find((s) => s.id === 'enc'), chk = steps(WF).find((s) => s.id === 'noplain');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'st9-wf-')), W = path.join(tmp, 'st9');
  fs.mkdirSync(path.join(W, 'out'), { recursive: true }); fs.mkdirSync(path.join(W, 'v13', 'v13-raw'), { recursive: true });
  for (const f of ['st9-v13-delisted.public.json', 'st9-v13-delisted.sealed.json', 'run.log']) fs.writeFileSync(path.join(W, 'out', f), `dummy ${f}\n`);
  fs.writeFileSync(path.join(W, 'v13', 'v13-raw', 'x'), 'plain');
  fs.writeFileSync(path.join(W, 'summary.md'), '');
  const env = { ...process.env, RUNNER_TEMP: tmp, GITHUB_WORKSPACE: ROOT, GITHUB_OUTPUT: path.join(tmp, 'gh-out') };
  execFileSync('bash', ['-c', enc.run], { env, stdio: 'pipe' });
  assert.match(fs.readFileSync(env.GITHUB_OUTPUT, 'utf8'), /encrypted=true/);
  execFileSync('bash', ['-c', chk.run], { env, stdio: 'pipe' });
  assert.deepEqual(fs.readdirSync(path.join(W, 'upload')).sort(), ['k.bin.enc', 'st9-output.tar.enc']);
  assert.ok(!fs.existsSync(path.join(W, 'out')) && !fs.existsSync(path.join(W, 'v13')) && !fs.existsSync(path.join(W, 'k.bin')) && !fs.existsSync(path.join(W, 'st9-output.tar')));
  assert.equal(fs.statSync(path.join(W, 'upload', 'k.bin.enc')).size, 512, 'data key wrapped with the RSA-4096 archive key');
  const c = fs.readFileSync(path.join(W, 'upload', 'st9-output.tar.enc'));
  assert.equal(c.subarray(0, 8).toString(), 'Salted__');
  assert.ok(!c.includes(Buffer.from('dummy')), 'no plaintext in the ciphertext');
  assert.match(fs.readFileSync(path.join(W, 'summary.md'), 'utf8'), /^artifactCipherSha256: `[0-9a-f]{64}`$/m);
  // counter-check: a plaintext file left next to the ciphertext stops the upload
  fs.writeFileSync(path.join(W, 'upload', 'st9-v13-delisted.public.json'), '{}');
  assert.throws(() => execFileSync('bash', ['-c', chk.run], { env, stdio: 'pipe' }), /UNEXPECTED_UPLOAD_CONTENT|Command failed/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** Runs the encryption step on a dummy folder with a throwaway RSA key at the archive-pub.pem path; returns paths. */
function encryptLocally(runText) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'st9-rt-')), W = path.join(tmp, 'st9'), ws = path.join(tmp, 'ws');
  const keyDir = path.join(ws, 'docs/quant-recovery/v13/archive'), priv = path.join(tmp, 'archive-priv.pem');
  fs.mkdirSync(keyDir, { recursive: true }); fs.mkdirSync(path.join(W, 'out'), { recursive: true });
  execFileSync('openssl', ['genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048', '-out', priv], { stdio: 'pipe' });
  execFileSync('openssl', ['pkey', '-in', priv, '-pubout', '-out', path.join(keyDir, 'archive-pub.pem')], { stdio: 'pipe' });
  const files = { 'st9-v13-delisted.sealed.json': '{"sealed":true}\n', 'preflight.json': '{"ready":true,"missing":[]}\n', 'preflight.log': 'warn\n', 'run.log': 'log\n' };
  for (const [f, c] of Object.entries(files)) fs.writeFileSync(path.join(W, 'out', f), c);
  fs.writeFileSync(path.join(W, 'summary.md'), '');
  execFileSync('bash', ['-c', runText], { env: { ...process.env, RUNNER_TEMP: tmp, GITHUB_WORKSPACE: ws, GITHUB_OUTPUT: path.join(tmp, 'gh-out') }, stdio: 'pipe' });
  return { tmp, W, priv, files };
}
const HEX_LINE = /^[0-9a-f]{64}\n?$/;
/** The two decryption commands exactly as documented in §3.1 of the infrastructure doc. */
function documentedDecrypt() {
  const doc = fs.readFileSync(path.join(ROOT, 'docs/SUPERTRADER_9_HISTORICAL_BACKTEST_INFRASTRUCTURE.md'), 'utf8');
  const cmds = [...doc.matchAll(/`(openssl (?:pkeyutl -decrypt|enc -d)[^`]*)`/g)].map((m) => m[1]);
  assert.equal(cmds.length, 2, 'the doc names exactly the two decryption commands');
  return cmds;
}

test('data key: 64 hex characters on one line; local round trip with the documented decryption commands', () => {
  const enc = steps(WF).find((s) => s.id === 'enc');
  const { tmp, W, priv, files } = encryptLocally(enc.run);
  const dec = path.join(tmp, 'dec');
  fs.mkdirSync(dec);
  fs.copyFileSync(priv, path.join(dec, 'archive-priv.pem'));
  for (const f of ['k.bin.enc', 'st9-output.tar.enc']) fs.copyFileSync(path.join(W, 'upload', f), path.join(dec, f));
  for (const c of documentedDecrypt()) execFileSync('bash', ['-c', c], { cwd: dec, stdio: 'pipe' });
  assert.match(fs.readFileSync(path.join(dec, 'k.bin'), 'utf8'), HEX_LINE, 'the unwrapped data key is 64 hex characters (+ newline)');
  fs.mkdirSync(path.join(dec, 'x'));
  execFileSync('tar', ['-xf', path.join(dec, 'st9-output.tar'), '-C', path.join(dec, 'x')], { stdio: 'pipe' });
  for (const [f, c] of Object.entries(files)) assert.equal(fs.readFileSync(path.join(dec, 'x', f), 'utf8'), c, f);
  // the passphrase is the whole hex line: a passphrase of only its first 63 characters does not decrypt
  const k = fs.readFileSync(path.join(dec, 'k.bin'), 'utf8').trim();
  assert.throws(() => execFileSync('openssl', ['enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '100000', '-pass', `pass:${k.slice(0, 63)}`, '-in', path.join(dec, 'st9-output.tar.enc'), '-out', path.join(dec, 'y.tar')], { stdio: 'pipe' }));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('counter-check: a binary key (rand -out) is red, and -pass file: really stops at the first newline', () => {
  const enc = steps(WF).find((s) => s.id === 'enc');
  const bin = enc.run.replace('openssl rand -hex 32 > "$W/k.bin"', 'openssl rand -out "$W/k.bin" 32');
  assert.notEqual(bin, enc.run);
  assert.ok(lint(WF.replace(enc.run.split('\n').find((l) => l.includes('rand -hex')).trim(), 'openssl rand -out "$W/k.bin" 32')).includes('DATA_KEY_NOT_HEX_LINE'));
  const { tmp, W, priv } = encryptLocally(bin);
  const key = execFileSync('openssl', ['pkeyutl', '-decrypt', '-inkey', priv, '-pkeyopt', 'rsa_padding_mode:oaep', '-pkeyopt', 'rsa_oaep_md:sha256', '-in', path.join(W, 'upload', 'k.bin.enc')], { stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(key.length, 32);
  assert.doesNotMatch(key.toString('latin1'), HEX_LINE, 'binary data key fails the hex-line check');
  // why it matters: a key file "ab\n<30 random bytes>" encrypts with the passphrase "ab" only
  const kf = path.join(tmp, 'kb.bin'), pt = path.join(tmp, 'p.txt'), ct = path.join(tmp, 'p.enc');
  fs.writeFileSync(kf, Buffer.concat([Buffer.from('ab\n'), crypto.randomBytes(29)])); fs.writeFileSync(pt, 'secret');
  execFileSync('openssl', ['enc', '-aes-256-cbc', '-pbkdf2', '-iter', '1000', '-salt', '-pass', `file:${kf}`, '-in', pt, '-out', ct], { stdio: 'pipe' });
  assert.equal(execFileSync('openssl', ['enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '1000', '-pass', 'pass:ab', '-in', ct], { stdio: ['ignore', 'pipe', 'pipe'] }).toString(), 'secret');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('fetch-v13-archive-parts: only manifest-bound ciphertext is kept, fail closed', async () => {
  const buf = Buffer.from('ciphertext-of-v13-raw');
  const manifest = { parts: [{ part: 'v13-raw', object: 'v13-raw.tar.enc', cipherBytes: buf.length, cipherSha256: crypto.createHash('sha256').update(buf).digest('hex') }, { part: 'v13-derived', object: 'v13-derived.tar.enc', cipherBytes: 3, cipherSha256: '0'.repeat(64) }] };
  const P = 'research-snapshots/quant-v13/archive-1.2.0/';
  const store = new Map([[P + 'v13-raw.tar.enc', buf], [P + 'v13-derived.tar.enc', Buffer.from('bad')]]);
  const driver = { get: async (k) => store.get(k) ?? null };
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'st9-fetch-'));
  assert.deepEqual(await fetchParts({ driver, manifest, prefix: P, out, parts: ['v13-raw'] }), [{ part: 'v13-raw', bytes: buf.length, status: 'OK' }]);
  assert.deepEqual(fs.readFileSync(path.join(out, 'v13-raw.tar.enc')), buf);
  const code = async (o) => { try { await fetchParts({ driver, manifest, prefix: P, out, parts: ['v13-raw'], ...o }); return 'OK'; } catch (e) { return e.code; } };
  assert.equal(await code({ parts: ['v13-derived'] }), 'CIPHER_SHA256_MISMATCH');
  assert.equal(await code({ parts: ['nope'] }), 'PART_NOT_IN_MANIFEST');
  assert.equal(await code({ parts: [] }), 'PARTS_REQUIRED');
  assert.equal(await code({ prefix: 'research-snapshots/other/' }), 'PREFIX_INVALID');
  assert.equal(await code({ driver: { get: async () => null } }), 'PART_MISSING');
  assert.equal(await code({ manifest: { parts: [{ ...manifest.parts[0], cipherBytes: 1 }] } }), 'CIPHER_BYTES_MISMATCH');
  assert.ok(!fs.existsSync(path.join(out, 'v13-derived.tar.enc')), 'a mismatching part is not written');
  fs.rmSync(out, { recursive: true, force: true });
});

test('summary: whitelisted status, counts and hashes only', () => {
  const h = (c) => c.repeat(64);
  const pub = { status: 'COMPLETE', receipt: { resultSha256: h('a'), inputFingerprint: h('b'), datasetSha256: h('c'), registrationSha256: h('d'), snapshotId: 'sts1-x', runId: '1' }, historicalInfrastructure: { execution: { pass: true, methods: { TURTLE_S1: { A: { audit: { violationCount: 0, exitReasons: { STOP_2N_UNIT: 9 } } }, B: { audit: { violationCount: 2 } } } } } }, methods: { TURTLE_S1: { tradesA: 123, tradesB: 456 } } };
  const s = summarize(pub, 4);
  assert.deepEqual(s, { status: 'COMPLETE', runnerExitCode: 4, auditPass: true, auditViolations: 2, resultSha256: h('a'), inputFingerprint: h('b'), datasetSha256: h('c'), registrationSha256: h('d') });
  const md = markdown(s);
  assert.ok(!/TURTLE|123|456|STOP_2N/.test(md), 'no method, trade count or reason in the summary');
  assert.equal(summarize({ ...pub, status: 'SOMETHING', receipt: { ...pub.receipt, resultSha256: 'leak me' } }, 0).resultSha256, 'INVALID');
  assert.equal(summarize({ ...pub, status: 'SOMETHING' }, 0).status, 'INVALID');
  assert.deepEqual(summarize(null, 3), { status: 'NO_RESULT', runnerExitCode: 3 });
});
