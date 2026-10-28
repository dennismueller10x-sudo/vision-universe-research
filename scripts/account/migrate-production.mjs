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
//      public-Tabellen mit Spalte user_id - aus der Datenbank ermittelt).
//   3. Alle neuen Dateien in EINER Transaktion, Historie (supabase_migrations.schema_migrations) im selben
//      Schritt. Vorher und nachher werden die Zeilen jeder Kundentabelle gezaehlt; sinkt eine Zahl, wird
//      alles zurueckgerollt (faengt auch versteckte Loeschungen, z. B. in dynamischem SQL).
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
   (n.nspname = 'auth' and c.relname = 'users') or n.nspname = 'billing'
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

export function transactionSql(pending, dir, {allowDestructive = false} = {}) {
  const parts = ['\\set ON_ERROR_STOP 1', 'begin;',
    `create temp table vu_guard (tbl text primary key, before bigint, after bigint) on commit drop;`,
    `do $g$ declare t text; n bigint; begin for t in ${PROTECTED_TABLES_SQL} loop
       execute 'select count(*) from ' || t into n; insert into vu_guard (tbl, before) values (t, n); end loop; end $g$;`];
  for (const p of pending) {
    const sql = readFileSync(join(dir, p.file), 'utf8');
    parts.push(`-- ${p.file}`, sql, `insert into supabase_migrations.schema_migrations (version, name, statements)
      values ('${p.version}', '${p.name}', array[${dollarQuote(sql)}]);`);
  }
  parts.push(`do $g$ declare r record; n bigint; lost text := ''; begin
      for r in select tbl from vu_guard loop
        if to_regclass(r.tbl) is null then lost := lost || r.tbl || ' (entfernt) ';
        else execute 'select count(*) from ' || r.tbl into n; update vu_guard set after = n where tbl = r.tbl; end if;
      end loop;
      select lost || coalesce(string_agg(tbl || ' ' || before || '->' || after, ', '), '') into lost from vu_guard where after < before;
      if lost <> '' then
        ${allowDestructive ? "raise notice 'Freigegebene Datenverluste: %', lost;" : "raise exception 'VU_GUARD_DATENVERLUST: %', lost;"}
      end if;
      raise notice 'Kundentabellen geprueft: % (keine Zeile verloren oder freigegeben)', (select count(*) from vu_guard);
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
    throw new Error(guard ? `Zurueckgerollt - Kundendaten wuerden verloren gehen: ${guard[1]}` : `Zurueckgerollt: ${msg.split('\n').filter(l => /ERROR|FEHLER/.test(l)).slice(0, 3).join(' | ') || msg.slice(-300)}`);
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
