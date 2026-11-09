// Abgesichertes Einspielen der Produktions-Migrationen: statische Pruefung ohne Datenbank,
// Transaktion und Zaehlprobe gegen ein echtes PostgreSQL (PG_TEST_URL, sonst uebersprungen).
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, cpSync, writeFileSync, rmSync, readdirSync} from 'node:fs';
import {join, resolve, dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {destructiveFindings, pendingMigrations, run} from '../migrate-production.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PROTECTED = ['auth.users', 'public.profiles', 'public.watchlist_items', 'billing.payment_events'];

test('statisch: unbedenkliche Migrationen bleiben automatisch', () => {
  for (const f of readdirSync(join(ROOT, 'supabase/migrations'))) {
    const sql = execFileSync('cat', [join(ROOT, 'supabase/migrations', f)], {encoding: 'utf8'});
    assert.deepEqual(destructiveFindings(sql, PROTECTED), [], f);
  }
  assert.deepEqual(destructiveFindings('-- drop table x\ncreate table y (id int);', PROTECTED), [], 'Kommentar zaehlt nicht');
  assert.deepEqual(destructiveFindings('delete from public.plan_features where plan_id = $$free$$;', PROTECTED), [], 'Katalog ist keine Kundentabelle');
});

test('statisch: destruktive Muster werden erkannt', () => {
  const cases = {
    'drop table public.watchlists;': 'DROP',
    'DROP   SCHEMA billing;': 'DROP',
    'alter table public.profiles drop column display_name;': 'DROP COLUMN',
    'truncate public.watchlist_items;': 'TRUNCATE',
    'drop function f() cascade;': 'CASCADE',
    'alter table public.profiles disable row level security;': 'RLS',
    'alter table public.profiles alter column display_name type varchar(3);': 'Spaltentyp',
    'delete from auth.users;': 'auth.users',
    'DELETE FROM watchlist_items where true;': 'watchlist_items',
    'update public.profiles set display_name = null;': 'profiles',
    'delete from billing.payment_events;': 'billing.payment_events',
  };
  for (const [sql, expect] of Object.entries(cases)) {
    const f = destructiveFindings(sql, PROTECTED);
    assert.ok(f.some(x => x.includes(expect)), `${sql} -> ${f.join(',')}`);
  }
});

test('Historie: nur neue Dateien nach der letzten eingespielten Version', () => {
  const files = ['20260101000000_a.sql', '20260102000000_b.sql', '20260103000000_c.sql', 'README.md'];
  assert.deepEqual(pendingMigrations(files, ['20260101000000']).map(p => p.version), ['20260102000000', '20260103000000']);
  assert.deepEqual(pendingMigrations(files, ['20260101000000', '20260102000000', '20260103000000']), []);
  assert.throws(() => pendingMigrations(files, ['20260101000000', '20260103000000']), /vor der letzten/);
  assert.throws(() => pendingMigrations(files, ['20251231000000']), /ohne Datei/);
});

const skip = process.env.PG_TEST_URL ? false : 'PG_TEST_URL fehlt';

test('gegen PostgreSQL: einspielen, idempotent, Integritaetsprobe rollt versteckte Aenderungen zurueck', {skip}, () => {
  const admin = process.env.PG_TEST_URL;
  const name = 'vu_migrate_test_' + randomBytes(4).toString('hex');
  const psql = (db, args) => execFileSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-d', db, ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
  psql(admin, ['-c', `create database ${name}`]);
  const u = new URL(admin); u.pathname = '/' + name; const db = u.toString();
  const dir = mkdtempSync(join(tmpdir(), 'vu-mig-'));
  const logs = [];
  try {
    psql(db, ['-f', join(ROOT, 'supabase/local/platform-stub.sql')]);
    cpSync(join(ROOT, 'supabase/migrations'), dir, {recursive: true});
    const first = run({dbUrl: db, dir, log: m => logs.push(m)});
    assert.equal(first.applied.length, readdirSync(dir).length, 'alle Migrationen in einer Transaktion');
    assert.equal(psql(db, ['-c', 'select count(*) from supabase_migrations.schema_migrations']).trim(), String(first.applied.length));
    assert.deepEqual(run({dbUrl: db, dir, log: () => {}}).applied, [], 'zweiter Lauf: nichts zu tun');

    // Kundendaten anlegen
    psql(db, ['-c', `insert into auth.users (id, email) values (gen_random_uuid(), 'kunde@example.test')`]);
    const users = () => psql(db, ['-c', 'select count(*) from auth.users']).trim();
    const before = users();

    // Statisch erkennbar -> abgelehnt, ohne Datenbankaenderung
    writeFileSync(join(dir, '20990101000000_offen.sql'), 'delete from auth.users;');
    assert.throws(() => run({dbUrl: db, dir, log: () => {}}), e => Boolean(e.destructive));
    assert.equal(users(), before);
    rmSync(join(dir, '20990101000000_offen.sql'));

    // Versteckt (dynamisches SQL) -> Zaehlprobe, alles zurueckgerollt, Historie unveraendert
    writeFileSync(join(dir, '20990101000000_versteckt.sql'),
      `create table public.neu (id int);\ndo $x$ begin execute 'del' || 'ete from auth.' || 'users'; end $x$;`);
    assert.throws(() => run({dbUrl: db, dir, log: () => {}}), /Kundendaten oder Schutzregeln wuerden veraendert: .*auth\.users/);
    assert.equal(users(), before, 'Konto ist noch da');
    assert.equal(psql(db, ['-c', `select to_regclass('public.neu') is null`]).trim(), 't', 'auch der Rest der Migration zurueckgerollt');
    assert.equal(psql(db, ['-c', `select count(*) from supabase_migrations.schema_migrations where version = '20990101000000'`]).trim(), '0');

    // Integritaet statt nur Zaehlung: jede dieser versteckten Aenderungen laesst die Zeilenzahl gleich
    // und wird trotzdem samt Rest der Migration zurueckgerollt.
    const hidden = {
      'Profil ueberschrieben': `do $x$ begin execute 'upd' || 'ate public.profiles set display_name = ''x'''; end $x$;`,
      'RLS abgeschaltet': `do $x$ begin execute 'alter table public.watchlists dis' || 'able row level security'; end $x$;`,
      'Tester fuer alle': `do $x$ begin execute 'ins' || 'ert into public.user_roles (user_id, role) select id, ''billing_tester'' from auth.users'; end $x$;`,
      'offene Policy': `create policy alle_lesen on public.profiles for select to anon using (true);`,
      'Rechte fuer anon': `do $x$ begin execute 'gr' || 'ant select on public.profiles to an' || 'on'; end $x$;`,
      'Spalte umgebaut': `do $x$ begin execute 'alter table public.profiles dr' || 'op column display_name'; end $x$;`,
    };
    const profile = () => psql(db, ['-c', 'select md5(string_agg(p::text, \',\' order by user_id)) from public.profiles p']).trim();
    const snapshot = profile();
    for (const [label, sql] of Object.entries(hidden)) {
      writeFileSync(join(dir, '20990101000000_versteckt.sql'), `create table public.neu (id int);\n${sql}`);
      assert.throws(() => run({dbUrl: db, dir, log: () => {}}), /Kundendaten oder Schutzregeln/, label);
      assert.equal(profile(), snapshot, `${label}: Profil unveraendert`);
      assert.equal(psql(db, ['-c', `select count(*) from public.user_roles where role = 'billing_tester'`]).trim(), '0', label);
      assert.equal(psql(db, ['-c', `select to_regclass('public.neu') is null`]).trim(), 't', `${label}: zurueckgerollt`);
    }

    // Erlaubt: neue Spalte mit Standardwert, neue Zeilen, neue Tabellen
    writeFileSync(join(dir, '20990101000000_versteckt.sql'),
      `alter table public.profiles add column if not exists vu_test text default 'neu';\ncreate table public.neu (id int);`);
    assert.deepEqual(run({dbUrl: db, dir, log: () => {}}).applied, ['20990101000000'], 'additive Migration laeuft automatisch');
    assert.equal(users(), before);
    writeFileSync(join(dir, '20990102000000_versteckt.sql'),
      `do $x$ begin execute 'del' || 'ete from auth.' || 'users'; end $x$;`);

    // Mit Freigabe (allow-destructive) laeuft dieselbe Migration
    const ok = run({dbUrl: db, dir, allowDestructive: true, log: () => {}});
    assert.deepEqual(ok.applied, ['20990102000000']);
    assert.equal(users(), '0');
  } finally {
    rmSync(dir, {recursive: true, force: true});
    psql(admin, ['-c', `drop database if exists ${name} with (force)`]);
  }
});

test('Produktionsfall: neun Migrationen und Kundendaten vorhanden, die zehnte (Produktivstart) laeuft automatisch', {skip}, () => {
  const admin = process.env.PG_TEST_URL;
  const name = 'vu_migrate_prod_' + randomBytes(4).toString('hex');
  const psql = (db, args) => execFileSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-d', db, ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
  psql(admin, ['-c', `create database ${name}`]);
  const u = new URL(admin); u.pathname = '/' + name; const db = u.toString();
  const dir = mkdtempSync(join(tmpdir(), 'vu-mig-prod-'));
  try {
    psql(db, ['-f', join(ROOT, 'supabase/local/platform-stub.sql')]);
    const files = readdirSync(join(ROOT, 'supabase/migrations')).filter(f => f.endsWith('.sql')).sort();
    const last = files.at(-1);
    for (const f of files.slice(0, -1)) cpSync(join(ROOT, 'supabase/migrations', f), join(dir, f));
    assert.equal(run({dbUrl: db, dir, log: () => {}}).applied.length, files.length - 1);
    psql(db, ['-c', `insert into auth.users (id, email, email_confirmed_at) values (gen_random_uuid(), 'bestand@example.test', now())`]);
    const snapshot = () => psql(db, ['-c', `select (select count(*) from auth.users) || '/' || (select count(*) from public.user_settings)`]).trim();
    const before = snapshot();
    cpSync(join(ROOT, 'supabase/migrations', last), join(dir, last));
    assert.deepEqual(run({dbUrl: db, dir, log: () => {}}).applied, [last.slice(0, 14)], `${last} automatisch eingespielt`);
    assert.equal(snapshot(), before, 'Kundendaten unveraendert');
  } finally {
    rmSync(dir, {recursive: true, force: true});
    psql(admin, ['-c', `drop database if exists ${name} with (force)`]);
  }
});
