#!/usr/bin/env node
// Vision Universe — kein Stripe- oder Supabase-Geheimnis im Repository.
// Prueft die versionierten Dateien der Konto-/Abo-Welt und alle Workflows auf
// Formen, die OHNE Kontext ein Geheimnis sind. Die Simulationswerte
// (…_local_simulation) haben absichtlich eine Form, die hier nicht anschlaegt.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

export const PATTERNS = [
  {name: 'Stripe-Geheimschluessel', re: /\b[sr]k_(live|test)_[A-Za-z0-9]{20,}/},
  {name: 'Stripe-Webhook-Geheimnis', re: /\bwhsec_[A-Za-z0-9]{20,}/},
  {name: 'Supabase-Secret-Key', re: /\bsb_secret_[A-Za-z0-9]{16,}/},
  {name: 'JWT (z. B. service_role)', re: /\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}/},
  {name: 'privater Schluessel', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/},
  {name: 'Postgres-URL mit Passwort', re: /postgres(ql)?:\/\/[^:\s/]+:(?!postgres@)[^@\s]{6,}@[^\s]*supabase/},
];

export function findSecrets(text) {
  return PATTERNS.filter(p => p.re.test(text)).map(p => p.name);
}

const SCOPE = ['supabase', 'workers/vu-account', 'scripts/account', 'konto', 'docs/accounts', '.github/workflows'];

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', ...SCOPE], {cwd: root, encoding: 'utf8'})
    .split('\0').filter(Boolean);
  let hits = 0;
  for (const f of files) {
    const found = findSecrets(readFileSync(resolve(root, f), 'utf8'));
    if (found.length) { hits++; console.error(`${f}: ${found.join(', ')}`); }
  }
  if (!files.length) { console.error('Keine Dateien gefunden - Pruefung waere wertlos.'); process.exit(1); }
  console.log(hits ? `${hits} Datei(en) mit Geheimnis-Form.` : `Keine Geheimnisse in ${files.length} Dateien.`);
  process.exit(hits ? 1 : 0);
}
