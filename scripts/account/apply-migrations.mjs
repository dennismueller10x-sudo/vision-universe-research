#!/usr/bin/env node
// Vision Universe — Supabase-Migrationen in ein Projekt einspielen (ohne Supabase-CLI).
//
//   SUPABASE_DB_URL=postgresql://… node scripts/account/apply-migrations.mjs [--dry-run]
//
// Spielt jede noch nicht eingetragene Datei aus supabase/migrations/ in einer
// eigenen Transaktion ein und traegt sie in supabase_migrations.schema_migrations
// ein - dieselbe Tabelle, die `supabase db push` nutzt; beide Wege bleiben
// vertraeglich. Bricht beim ersten Fehler ab (die fehlerhafte Datei wird
// vollstaendig zurueckgerollt). supabase/local/* und seed.sql werden nie
// eingespielt. Die Verbindungs-URL wird nie ausgegeben.
import {execFileSync} from 'node:child_process';
import {readdirSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {join, resolve, dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = /^(\d{14})_([a-z0-9_]+)\.sql$/;

export function pendingMigrations(applied, files) {
  return files.filter(f => FILE.test(f)).sort().filter(f => !applied.has(f.match(FILE)[1]));
}

export function applyMigrations({dbUrl, dryRun = false, log = console.log, root = ROOT}) {
  if (!/^postgres(ql)?:\/\//.test(String(dbUrl || ''))) throw new Error('SUPABASE_DB_URL fehlt oder hat nicht die Form postgresql://…');
  const psql = (args, input) => execFileSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-d', dbUrl, ...args],
    {encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe']}).trim();
  psql(['-c', `create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);`]);
  const applied = new Set(psql(['-c', 'select version from supabase_migrations.schema_migrations']).split('\n').filter(Boolean));
  const files = readdirSync(join(root, 'supabase/migrations'));
  const todo = pendingMigrations(applied, files);
  log(`${applied.size} Migration(en) vorhanden, ${todo.length} offen${dryRun ? ' (Probelauf)' : ''}.`);
  if (dryRun) { todo.forEach(f => log(`offen: ${f}`)); return todo; }
  const tmp = mkdtempSync(join(tmpdir(), 'vu-migrate-'));
  try {
    for (const f of todo) {
      const [, version, name] = f.match(FILE);
      const script = join(tmp, 'run.sql');
      writeFileSync(script, `\\set ON_ERROR_STOP 1\nbegin;\n\\i ${join(root, 'supabase/migrations', f)}\n`
        + `insert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${name}');\ncommit;\n`);
      try { psql(['-f', script]); }
      catch (e) {
        const msg = String(e.stderr || e.message).split('\n').find(l => /ERROR/.test(l)) || 'unbekannter Fehler';
        throw new Error(`${f}: ${msg.replace(/postgres(ql)?:\/\/\S+/g, '<db-url>')}`);
      }
      log(`eingespielt: ${f}`);
    }
  } finally { rmSync(tmp, {recursive: true, force: true}); }
  return todo;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { applyMigrations({dbUrl: process.env.SUPABASE_DB_URL, dryRun: process.argv.includes('--dry-run')}); }
  catch (e) { console.error(`FEHLER: ${e.message}`); process.exit(1); }
}
