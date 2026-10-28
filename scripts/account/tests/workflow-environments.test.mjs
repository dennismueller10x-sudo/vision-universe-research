// Zugriffsregeln der Konto-Workflows (docs/accounts/FREIGABEN.md), statisch geprueft:
//   * account-auto (ohne Required reviewers) nur in den freigegebenen Jobs und nur mit DB-URL,
//     oeffentlichem Supabase-Schluessel und Cloudflare-Token
//   * jeder Job in account-dev / account-production prueft die Owner-Freigabe dieses Laufs selbst
//   * privilegierte Konto-Secrets nur in Jobs mit Umgebung, nie als Repository-Secret ohne Umgebung
import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.github/workflows');

export function jobsOf(text) {
  const lines = text.split('\n');
  const start = lines.findIndex(l => /^jobs:\s*$/.test(l));
  if (start < 0) return [];
  const jobs = [];
  for (const line of lines.slice(start + 1)) {
    const m = /^  ([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (m) jobs.push({name: m[1], body: ''});
    else if (/^\S/.test(line)) break;
    else if (jobs.length) jobs.at(-1).body += line + '\n';
  }
  return jobs.map(j => ({...j, env: (/^    environment:\s*([a-z-]+)/m.exec(j.body) || [])[1] || null,
    secrets: [...new Set([...j.body.matchAll(/secrets\.([A-Z0-9_]+)/g)].map(x => x[1]))]}));
}

const workflows = readdirSync(DIR).filter(f => f.endsWith('.yml')).map(f => ({file: f, jobs: jobsOf(readFileSync(join(DIR, f), 'utf8'))}));
const all = workflows.flatMap(w => w.jobs.map(j => ({...j, file: w.file})));

const AUTO_ALLOWED = new Set(['account-production-auto.yml:migrationen', 'account-production-auto.yml:worker',
  'account-production-stripe.yml:preise-eintragen', 'account-backup.yml:backup']);
const AUTO_SECRETS = new Set(['VU_ACCOUNT_SUPABASE_DB_URL', 'VU_ACCOUNT_SUPABASE_PUBLISHABLE_KEY', 'CLOUDFLARE_API_TOKEN']);
const PRIVILEGED = /^VU_ACCOUNT_(SUPABASE_DB_URL|SUPABASE_SECRET_KEY|SUPABASE_ACCESS_TOKEN|BREVO_SMTP_[A-Z]+|BREVO_API_KEY|STRIPE_[A-Z_]+|BACKUP_DB_URL)$/;

test('account-auto nur in den freigegebenen Jobs, nur mit den noetigsten Secrets', () => {
  const auto = all.filter(j => j.env === 'account-auto');
  assert.deepEqual(auto.map(j => `${j.file}:${j.name}`).sort(), [...AUTO_ALLOWED].sort());
  for (const j of auto) {
    const extra = j.secrets.filter(s => !AUTO_SECRETS.has(s));
    assert.deepEqual(extra, [], `${j.file}:${j.name} liest zusaetzlich ${extra}`);
  }
});

test('jeder Job in account-dev und account-production prueft die Owner-Freigabe selbst', () => {
  const guarded = all.filter(j => j.env === 'account-dev' || j.env === 'account-production');
  assert.ok(guarded.length >= 6);
  for (const j of guarded) {
    assert.match(j.body, /\/actions\/runs\/\$RUN_ID\/approvals/, `${j.file}:${j.name} ohne Freigabepruefung`);
    assert.match(j.body, new RegExp(`ENV_NAME: ${j.env}\\b`), `${j.file}:${j.name} prueft nicht ${j.env}`);
    assert.match(j.body, /APPROVER: dennismueller10x-sudo/);
  }
});

test('Jobs in account-auto mit Zahlungsbezug haengen an einer Owner-Freigabe', () => {
  const price = all.find(j => j.file === 'account-production-stripe.yml' && j.name === 'preise-eintragen');
  assert.match(price.body, /ENV_NAME: account-production\b/, 'Preise nur nach Stripe-Freigabe');
  const worker = all.find(j => j.file === 'account-production-auto.yml' && j.name === 'worker');
  assert.match(worker.body, /zahlungsfreigabe/);
  assert.match(worker.body, /ENV_NAME: account-production\b/);
});

test('privilegierte Konto-Secrets nie ohne Umgebung', () => {
  for (const j of all) {
    const priv = j.secrets.filter(s => PRIVILEGED.test(s));
    if (priv.length) assert.ok(j.env, `${j.file}:${j.name} liest ${priv} ohne Umgebung`);
  }
});

test('keine Konto-Umgebung in Workflows, die fremden Code ausfuehren koennen', () => {
  for (const w of workflows) {
    const text = readFileSync(join(DIR, w.file), 'utf8');
    if (/^  (pull_request_target|workflow_run):|^on:.*\b(pull_request_target|workflow_run)\b/m.test(text)) {
      assert.ok(!w.jobs.some(j => /^account-/.test(j.env || '')), `${w.file}: Konto-Umgebung bei pull_request_target/workflow_run`);
    }
  }
});

test('Parser erkennt Jobs, Umgebung und Secrets', () => {
  const j = jobsOf('on: push\njobs:\n  a:\n    environment: account-dev\n    steps:\n      - run: echo ${{ secrets.X_Y }}\n  b:\n    runs-on: x\n');
  assert.deepEqual(j.map(x => [x.name, x.env, x.secrets]), [['a', 'account-dev', ['X_Y']], ['b', null, []]]);
});
