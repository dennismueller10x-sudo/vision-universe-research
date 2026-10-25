#!/usr/bin/env node
// Vision Universe — SQL-Tests der Konto- und Abo-Migrationen gegen ein echtes PostgreSQL.
//
//   PG_TEST_URL=postgresql://postgres@localhost:5432/postgres node scripts/account/sql-tests.mjs
//
// Legt je Lauf eine frische Datenbank an (vu_account_test_<zufall>), spielt
// supabase/local/platform-stub.sql (Supabase-Rollen, auth.uid(), Standardrechte),
// alle Migrationen, supabase/seed.sql und die Testhelfer ein und fuehrt jede Datei
// supabase/tests/NN_*.sql aus. Danach wird die Datenbank wieder geloescht.
// Ohne PG_TEST_URL endet das Skript mit Exit 2 (nicht still gruen).
import {execFileSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const url = process.env.PG_TEST_URL;
if (!url) {
  console.error('PG_TEST_URL fehlt (Superuser-Verbindung zu einem Test-PostgreSQL). Es wurde nichts geprueft.');
  process.exit(2);
}

const psql = (database, args) => execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', database, ...args],
  {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
const withDatabase = name => { const u = new URL(url); u.pathname = '/' + name; return u.toString(); };

const name = 'vu_account_test_' + randomBytes(4).toString('hex');
psql(url, ['-c', `create database ${name}`]);
const db = withDatabase(name);
let failed = 0;
try {
  const migrations = readdirSync(join(root, 'supabase/migrations')).filter(f => f.endsWith('.sql')).sort();
  for (const file of ['supabase/local/platform-stub.sql', ...migrations.map(f => 'supabase/migrations/' + f), 'supabase/seed.sql',
    'supabase/tests/_helpers.sql']) {
    psql(db, ['-f', join(root, file)]);
    console.log('eingespielt  ' + file);
  }
  const tests = readdirSync(join(root, 'supabase/tests')).filter(f => /^\d\d_.*\.sql$/.test(f)).sort();
  for (const file of tests) {
    try {
      psql(db, ['-f', join(root, 'supabase/tests', file)]);
      console.log('ok           ' + file);
    } catch (error) {
      failed++;
      console.log('FEHLER       ' + file + '\n' + String(error.stderr || error.message).trim().split('\n').slice(-6).join('\n'));
    }
  }
} finally {
  psql(url, ['-c', `drop database if exists ${name} with (force)`]);
}
console.log(failed ? `${failed} SQL-Testdatei(en) fehlgeschlagen.` : 'Alle SQL-Tests bestanden.');
process.exit(failed ? 1 : 0);
