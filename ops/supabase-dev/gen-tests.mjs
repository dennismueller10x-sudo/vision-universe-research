// Erzeugt die SQL-Pakete fuer execute_sql (eine Abfrage = eine implizite Transaktion).
import {readFileSync, writeFileSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const [src, out] = process.argv.slice(2);
const TAG = '$vumig_7f3a$';
const md5 = s => createHash('md5').update(s).digest('hex');
const files = readdirSync(`${src}/migrations`).filter(f => /^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort();
files.forEach((f, i) => {
  const sql = readFileSync(`${src}/migrations/${f}`, 'utf8');
  if (sql.includes(TAG)) throw new Error('tag collision ' + f);
  const [, version, name] = f.match(/^(\d{14})_(.+)\.sql$/);
  const p = `-- ${f} (md5 ${md5(sql)})
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text not null primary key);
alter table supabase_migrations.schema_migrations add column if not exists statements text[];
alter table supabase_migrations.schema_migrations add column if not exists name text;
insert into supabase_migrations.schema_migrations (version, name, statements) values ('${version}', '${name}', array[${TAG}${sql}${TAG}]);
do $vu_run$
declare s text;
begin
  select statements[1] into s from supabase_migrations.schema_migrations where version = '${version}';
  if md5(s) <> '${md5(sql)}' then raise exception 'VU_CHECKSUM_MISMATCH ${f}: %', md5(s); end if;
  execute s;
end $vu_run$;
select '${f}' as applied, md5(statements[1]) as md5 from supabase_migrations.schema_migrations where version = '${version}';
`;
  writeFileSync(`${out}/m${i + 1}.sql`, p);
});
// Tests: \gset -> set_config, :'x' -> uuid aus der Einstellung, begin/rollback -> Abbruch mit Erfolgsmarke.
let helpers = readFileSync(`${src}/tests/_helpers.sql`, 'utf8')
  .replace('insert into auth.users (email, email_confirmed_at, raw_user_meta_data)\n  values (p_email,',
           'insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)\n  values (gen_random_uuid(), p_email,');
if (!helpers.includes('values (gen_random_uuid(), p_email,')) throw new Error('helper patch failed');
for (const f of readdirSync(`${src}/tests`).filter(f => /^\d\d_.*\.sql$/.test(f)).sort()) {
  let t = readFileSync(`${src}/tests/${f}`, 'utf8');
  t = t.replace(/^begin;\n/m, '').replace(/\nrollback;\s*$/, '\n');
  // jede \gset-Anweisung beginnt nach dem vorigen ';' bzw. Zeilenanfang
  t = t.replace(/(^|;\n|\n)((?:select|insert)[^;]*?) as ([a-z_0-9]+) \\gset/g, (m, pre, stmt, name) => {
    if (/^insert/.test(stmt)) {
      const body = stmt.replace(/returning id$/, 'returning id');
      if (!/returning id$/.test(stmt)) throw new Error('unexpected insert ' + stmt);
      return `${pre}with r as (${body}) select set_config('vt.${name}', (select id from r)::text, true);`;
    }
    return `${pre}select set_config('vt.${name}', (${stmt.replace(/^select\s+/, '')})::text, true);`;
  });
  if (/\\gset/.test(t)) throw new Error('gset left in ' + f);
  // Textkontexte (dort hat psql das Literal als text aufgeloest)
  t = t.replace("convert_to(:'dora', 'UTF8')", "convert_to(current_setting('vt.dora'), 'UTF8')")
       .replace("->> 'listId', :'hanna_list'", "->> 'listId', current_setting('vt.hanna_list')");
  t = t.replace(/:'([a-z_0-9]+)'/g, "(current_setting('vt.$1')::uuid)");
  if (/(^|[^:]):[a-z'"]/m.test(t.replace(/::[a-z]/g, '').replace(/\$\$[\s\S]*?\$\$/g, '').replace(/'[^']*'/g, ''))) console.error('WARN colon in ' + f);
  writeFileSync(`${out}/t${f.slice(0, 2)}.sql`, `-- ${f} (in einer Transaktion, endet mit Rollback)\n${helpers}\n${t}\ndo $vu_end$ begin raise exception 'VU_TEST_PASSED_ROLLBACK ${f}'; end $vu_end$;\n`);
}
writeFileSync(`${out}/seed.sql`, readFileSync(`${src}/seed.sql`, 'utf8'));
