#!/usr/bin/env node
// Vision Universe — Datenbank-Migrationen der Produktion abgesichert einspielen.
//
//   DB_URL=postgresql://… node scripts/account/migrate-production.mjs [--dir=supabase/migrations] [--plan] [--allow-destructive]
//
// Automatisch erlaubt sind nur NICHT destruktive Migrationen:
//   1. Historie: bereits eingespielte Versionen muessen als Dateien existieren; neue Dateien duerfen
//      nur NACH der letzten eingespielten Version liegen (keine nachtraeglich eingeschobenen Migrationen).
//   2. Statische Pruefung jeder neuen Datei: kein DROP TABLE/SCHEMA/DATABASE/COLUMN/TYPE, kein TRUNCATE,
//      kein DROP ... CASCADE, kein Abschalten von RLS, kein DELETE/UPDATE auf Kundentabellen (auth.*, billing.*,
//      public-Tabellen mit Spalte user_id - aus der Datenbank ermittelt), keine Rollen, keine Preise.
//   3. Alle neuen Dateien in EINER Transaktion (REPEATABLE READ), Historie im selben Schritt. Integritaetsprobe
//      (transactionSql): jede vorher vorhandene Zeile jeder Kundentabelle muss unveraendert bleiben (Zeilen-ID +
//      Inhalts-Hash), RLS, Rechte und Policies duerfen nicht schwaecher werden, Testerrollen, Live-Preise und
//      Registrierungsschalter bleiben gleich. Sonst wird alles zurueckgerollt - auch bei verstecktem SQL.
// --allow-destructive hebt 2. und die Zaehlprobe auf. Der Workflow setzt es NUR nach ausdruecklicher
// Freigabe des Owners (Umgebung account-production, Pruefung der Freigabe-Historie im Job).
// --plan zeigt nur, was eingespielt wuerde. Ausgabe: Versionen und Zaehlungen, keine Werte.
import {execFileSync} from 'node:child_process';
import {readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {join, resolve, dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = /^(\d{14})_([a-z0-9_]+)\.sql$/;

// Tabellen mit Kundendaten: auth.users, alles in billing, public-Tabellen mit user_id.
export const PROTECTED_TABLES_SQL = `select format('%I.%I', n.nspname, c.relname)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where c.relkind = 'r' and (
   (n.nspname = 'auth' and c.relname in ('users', 'identities')) or n.nspname = 'billing'
   or (n.nspname = 'public' and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'user_id' and not a.attisdropped)))
 order by 1`;

export function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

// Rumpf von CREATE FUNCTION/PROCEDURE: laeuft erst, wenn die Anwendung die Funktion aufruft (RLS, eigene
// Pruefungen), nicht beim Einspielen. DO-Bloecke laufen sofort und bleiben deshalb in der Pruefung.
export function stripFunctionBodies(sql) {
  return sql.replace(/(create\s+(?:or\s+replace\s+)?(?:function|procedure)\b[\s\S]*?)(\$[A-Za-z_]*\$)[\s\S]*?\2/gi, '$1 <rumpf> ');
}

// Liefert die Gruende, warum eine Migration als destruktiv gilt (leer = unbedenklich).
export function destructiveFindings(sql, protectedTables = []) {
  const s = stripFunctionBodies(stripComments(sql)).toLowerCase().replace(/\s+/g, ' ');
  const found = [];
  const rules = [
    [/\bdrop (table|schema|database|type|materialized view|view|sequence|extension)\b/, 'DROP von Tabelle/Schema/Typ/Sicht'],
    [/\balter table [^;]*\bdrop column\b/, 'DROP COLUMN'],
    [/\btruncate\b/, 'TRUNCATE'],
    [/\bdrop [^;]*\bcascade\b/, 'DROP ... CASCADE'],
    [/\bdisable row level security\b|\bno force row level security\b/, 'RLS abgeschaltet'],
    [/\balter table [^;]*\balter column [^;]*\btype\b/, 'Spaltentyp geaendert'],
    [/\binsert into (public\.)?user_roles\b/, 'Rollen vergeben (user_roles)'],
    [/\b(insert into|update|delete from) (public\.)?plan_prices\b|\b(update|delete from) (public\.)?(registration_gate|registration_allowlist)\b/, 'Preise oder Registrierung geaendert'],
  ];
  for (const [re, why] of rules) if (re.test(s)) found.push(why);
  for (const qualified of protectedTables) {
    const [schema, table] = qualified.toLowerCase().replace(/"/g, '').split('.');
    const names = schema === 'public' ? `(?:public\\.)?${table}` : `${schema}\\.${table}`;
    if (new RegExp(`\\b(delete from|update|truncate)( only)? ${names}\\b`).test(s)) found.push(`Schreibzugriff auf Kundentabelle ${schema}.${table}`);
  }
  return [...new Set(found)];
}

export function pendingMigrations(files, applied) {
  const parsed = files.map(f => ({f, m: FILE.exec(f)})).filter(x => x.m).map(x => ({file: x.f, version: x.m[1], name: x.m[2]}))
    .sort((a, b) => a.version.localeCompare(b.version));
  const versions = new Set(parsed.map(x => x.version));
  const missing = applied.filter(v => !versions.has(v));
  if (missing.length) throw new Error(`Eingespielte Versionen ohne Datei: ${missing.join(', ')}`);
  const last = applied.length ? [...applied].sort().at(-1) : '';
  const pending = parsed.filter(x => !applied.includes(x.version));
  const early = pending.filter(x => x.version < last);
  if (early.length) throw new Error(`Neue Migration vor der letzten eingespielten (${last}): ${early.map(x => x.version).join(', ')}`);
  return pending;
}

function dollarQuote(text) {
  let tag = 'vu_mig';
  while (text.includes(`$${tag}$`)) tag += '_x';
  return `$${tag}$${text}$${tag}$`;
}

// Kundentabellen mit OID fuer die Integritaetsprobe.
const GUARD_TABLES = PROTECTED_TABLES_SQL.replace("select format('%I.%I', n.nspname, c.relname)", "select c.oid, format('%I.%I', n.nspname, c.relname) as q");

// Konfiguration, die echte Zahlungen oder den Zugang beeinflusst: darf eine automatische Migration nicht aendern.
// Je Tabelle ein Hash; verglichen wird nur, was vorher schon existierte (eine neue Tabelle darf Startwerte bekommen).
const SENSITIVE_CONFIG = {
  'public.user_roles': `select coalesce(string_agg(user_id || ':' || role, ',' order by user_id, role), '') from public.user_roles where role::text <> 'user'`,
  'public.plan_prices': `select coalesce(string_agg(p::text, ',' order by p.id), '') from public.plan_prices p where livemode`,
  'public.registration_gate': `select coalesce(string_agg(g::text, ','), '') from public.registration_gate g`,
};
const configSnapshot = Object.entries(SENSITIVE_CONFIG).map(([t, q]) =>
  `do $c$ begin if to_regclass('${t}') is not null then insert into vu_config select '${t}', md5((${q})); end if; end $c$;`).join('\n');
const configCheck = Object.entries(SENSITIVE_CONFIG).map(([t, q]) =>
  `if exists (select 1 from vu_config where k = '${t}') and (to_regclass('${t}') is null or (select h from vu_config where k = '${t}') is distinct from md5((${q}))) then
          problems := problems || '${t}: Testerrollen, Live-Preise oder Registrierungsschalter geaendert'::text; end if;`).join('\n        ');

// Integritaetsprobe (eine Transaktion, REPEATABLE READ = ein fester Datenstand, gleichzeitige Anmeldungen stoeren nicht):
//   * jede vorher vorhandene Zeile jeder Kundentabelle muss nachher unveraendert existieren (Zeilen-ID + Inhalts-Hash
//     ueber die vorher vorhandenen Spalten; neue Zeilen und neue Spalten sind erlaubt)
//   * Tabellen und Spalten bleiben, RLS bleibt an, anon/authenticated bekommen keine neuen Rechte,
//     Zugriffsregeln (Policies) der Kundentabellen bleiben unveraendert
//   * Testerrollen, Live-Preise und Registrierungsschalter bleiben unveraendert
export function transactionSql(pending, dir, {allowDestructive = false} = {}) {
  const privs = role => `(select coalesce(string_agg(p, ','), '') from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) p where has_table_privilege('${role}', t.oid, p))`;
  const policies = `(select coalesce(md5(string_agg(concat_ws('|', policyname, permissive, roles::text, cmd, qual, with_check), ';' order by policyname)), '') from pg_policies where format('%I.%I', schemaname, tablename) = t.q)`;
  const parts = ['\\set ON_ERROR_STOP 1', 'begin isolation level repeatable read;',
    `create temp table vu_tables (tbl text primary key, cols text, rls boolean, anon_p text, auth_p text, pol text) on commit drop;`,
    `create temp table vu_rows (tbl text, rid tid, h text) on commit drop;`,
    `create temp table vu_config (k text primary key, h text) on commit drop;`,
    configSnapshot,
    `do $g$ declare t record; c text; begin
      for t in ${GUARD_TABLES} loop
        select string_agg(format('%I', attname), ',' order by attnum) into c from pg_attribute where attrelid = t.oid and attnum > 0 and not attisdropped;
        insert into vu_tables select t.q, c, (select relrowsecurity from pg_class where oid = t.oid), ${privs('anon')}, ${privs('authenticated')}, ${policies};
        execute format('insert into vu_rows select %L, ctid, md5(row(%s)::text) from %s', t.q, c, t.q);
      end loop; end $g$;`];
  for (const p of pending) {
    const sql = readFileSync(join(dir, p.file), 'utf8');
    parts.push(`-- ${p.file}`, sql, `insert into supabase_migrations.schema_migrations (version, name, statements)
      values ('${p.version}', '${p.name}', array[${dollarQuote(sql)}]);`);
  }
  parts.push(`do $g$ declare r record; t record; n bigint; problems text[] := '{}'; now_t record; begin
      for r in select * from vu_tables loop
        select c.oid, r.tbl as q into t from pg_class c where c.oid = to_regclass(r.tbl);
        if t.oid is null then problems := problems || (r.tbl || ': Tabelle entfernt'); continue; end if;
        begin
          execute format('select count(*) from vu_rows b where b.tbl = %L and not exists (select 1 from %s a where a.ctid = b.rid and md5(row(%s)::text) = b.h)', r.tbl, r.tbl, r.cols) into n;
          if n > 0 then problems := problems || (r.tbl || ': ' || n || ' bestehende Zeilen geaendert oder geloescht'); end if;
        exception when others then problems := problems || (r.tbl || ': Spalten entfernt oder umgebaut (' || sqlerrm || ')');
        end;
        select (select relrowsecurity from pg_class where oid = t.oid) as rls, ${privs('anon')} as anon_p, ${privs('authenticated')} as auth_p, ${policies} as pol into now_t;
        if r.rls and not now_t.rls then problems := problems || (r.tbl || ': RLS abgeschaltet'); end if;
        if exists (select 1 from unnest(string_to_array(now_t.anon_p, ',')) x where x <> all (string_to_array(r.anon_p, ','))) then problems := problems || (r.tbl || ': neue Rechte fuer anon'); end if;
        if exists (select 1 from unnest(string_to_array(now_t.auth_p, ',')) x where x <> all (string_to_array(r.auth_p, ','))) then problems := problems || (r.tbl || ': neue Rechte fuer authenticated'); end if;
        if now_t.pol is distinct from r.pol then problems := problems || (r.tbl || ': Zugriffsregeln (Policies) geaendert'); end if;
      end loop;
        ${configCheck}
      if cardinality(problems) > 0 then
        ${allowDestructive ? "raise notice 'Freigegebene Aenderungen: %', array_to_string(problems, '; ');" : "raise exception 'VU_GUARD_DATENVERLUST: %', array_to_string(problems, '; ');"}
      end if;
      raise notice 'Integritaet geprueft: % Kundentabellen, % bestehende Zeilen', (select count(*) from vu_tables), (select count(*) from vu_rows);
    end $g$;`, 'commit;');
  return parts.join('\n');
}

function psql(dbUrl, args, input) {
  return execFileSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-d', dbUrl, ...args],
    {encoding: 'utf8', input, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe']});
}

export function run({dbUrl, dir = join(ROOT, 'supabase/migrations'), plan = false, allowDestructive = false, log = console.log}) {
  if (!/^postgres(ql)?:\/\//.test(String(dbUrl || ''))) throw new Error('DB_URL fehlt');
  psql(dbUrl, ['-c', `create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)`]);
  const applied = psql(dbUrl, ['-c', 'select version from supabase_migrations.schema_migrations order by version']).split('\n').filter(Boolean);
  const pending = pendingMigrations(readdirSync(dir), applied);
  log(`Eingespielt: ${applied.length}, neu: ${pending.length}${pending.length ? ' (' + pending.map(p => p.file).join(', ') + ')' : ''}`);
  if (!pending.length) return {applied: [], destructive: []};
  const protectedTables = psql(dbUrl, ['-c', PROTECTED_TABLES_SQL]).split('\n').filter(Boolean);
  const destructive = pending.map(p => ({file: p.file, findings: destructiveFindings(readFileSync(join(dir, p.file), 'utf8'), protectedTables)}))
    .filter(x => x.findings.length);
  for (const d of destructive) log(`DESTRUKTIV ${d.file}: ${d.findings.join('; ')}`);
  if (destructive.length && !allowDestructive) {
    const e = new Error('Destruktive Migration: nur mit ausdruecklicher Owner-Freigabe (Workflow mit allow_destructive).');
    e.destructive = destructive;
    throw e;
  }
  if (plan) return {applied: [], destructive, planned: pending.map(p => p.file)};
  const work = mkdtempSync(join(tmpdir(), 'vu-migrate-'));
  try {
    const file = join(work, 'plan.sql');
    writeFileSync(file, transactionSql(pending, dir, {allowDestructive}), {mode: 0o600});
    const out = execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', dbUrl, '-f', file], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
    if (out.trim()) log(out.trim());
  } catch (e) {
    const msg = String(e.stderr || e.message);
    const guard = /VU_GUARD_DATENVERLUST: ([^\n]*)/.exec(msg);
    throw new Error(guard ? `Zurueckgerollt - Kundendaten oder Schutzregeln wuerden veraendert: ${guard[1]}` : `Zurueckgerollt: ${msg.split('\n').filter(l => /ERROR|FEHLER/.test(l)).slice(0, 3).join(' | ') || msg.slice(-300)}`);
  } finally { rmSync(work, {recursive: true, force: true}); }
  log(`Eingespielt in einer Transaktion: ${pending.map(p => p.version).join(', ')}`);
  return {applied: pending.map(p => p.version), destructive};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opt = n => (process.argv.find(a => a.startsWith(`--${n}=`)) || '').slice(n.length + 3);
  try {
    run({dbUrl: process.env.DB_URL, dir: opt('dir') || undefined, plan: process.argv.includes('--plan'),
      allowDestructive: process.argv.includes('--allow-destructive')});
  } catch (e) {
    console.error(`FEHLER: ${e.message}`);
    process.exit(e.destructive ? 3 : 1);
  }
}
