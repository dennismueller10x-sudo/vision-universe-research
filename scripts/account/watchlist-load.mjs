#!/usr/bin/env node
// Vision Universe — Last- und Speichermessung der persoenlichen Watchlist gegen echtes PostgreSQL.
//
//   PG_TEST_URL=postgresql://postgres@localhost:5432/postgres node scripts/account/watchlist-load.mjs \
//     [--users=10000] [--sizes=25,50,100,200] [--out=/tmp/watchlist-load.json]
//
// Wegwerf-Datenbank mit allen Migrationen. Je Szenario besitzt jeder Nutzer N Titel (realistische Kennungen,
// 10 % mit Notiz, 5 % mit Benachrichtigung). Gemessen werden Tabellen- und Indexgroesse sowie die Abfragen,
// die der Worker stellt - als Rolle "authenticated" mit RLS, wie in Supabase:
//   Liste lesen (GET /v1/watchlist)     select … where user_id = auth.uid() order by added_at desc
//   Merken (POST /v1/watchlist/items)   public.watchlist_add(…) inkl. Tarifgrenze
//   Fan-out (spaetere Ereignisse)       Wer beobachtet Instrument X? (nur Server)
// Schreibt keine Datei im Repository; Ergebnis nach --out oder auf die Konsole.
import {writeFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPg, createTestDatabase} from './sim/pg.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function quantile(xs, q) { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; }

export async function measure({adminUrl, users = 10000, sizes = [25, 50, 100, 200], samples = 40, log = console.log}) {
  const db = await createTestDatabase(adminUrl, ROOT);
  const pg = createPg(db.url);
  const results = [];
  try {
    // Nutzer einmal anlegen (ohne Ausloeser: nur Konten, keine Profile noetig fuer die Messung).
    await pg.exec(`set session_replication_role = replica;
      insert into auth.users (id, email, email_confirmed_at)
        select gen_random_uuid(), 'load' || g || '@example.test', now() from generate_series(1, ${users}) g;
      insert into public.watchlists (user_id, name) select id, 'Meine Watchlist' from auth.users where email like 'load%';`);
    for (const n of sizes) {
      await pg.exec(`set session_replication_role = replica;
        truncate public.watchlist_items;
        insert into public.watchlist_items (watchlist_id, user_id, instrument_id, ticker_at_add, note, alerts, added_at)
          select w.id, w.user_id, 'vu_' || substr(md5(((w.user_id::text || g) )), 1, 14),
                 upper(substr(md5(g::text), 1, 4)),
                 case when random() < 0.10 then 'Nach Quartalszahlen erneut pruefen, Ziel beobachten' end,
                 case when random() < 0.05 then '{"PRICE_EVENT":true}'::jsonb else '{}'::jsonb end,
                 now() - (g || ' minutes')::interval
            from public.watchlists w cross join generate_series(1, ${n}) g;
        vacuum analyze public.watchlist_items;`);
      const size = await pg.json(`select json_build_object(
        'rows', (select count(*) from public.watchlist_items),
        'table', pg_relation_size('public.watchlist_items'),
        'toast', coalesce(pg_total_relation_size('public.watchlist_items') - pg_relation_size('public.watchlist_items') - pg_indexes_size('public.watchlist_items'), 0),
        'indexes', pg_indexes_size('public.watchlist_items'),
        'total', pg_total_relation_size('public.watchlist_items'),
        'lists', pg_total_relation_size('public.watchlists'))`);
      const ids = await pg.json(`select json_agg(u) from (select user_id::text as u from public.watchlists order by random() limit ${samples}) x`);
      const read = [], write = [];
      for (const id of ids) {
        const claims = {sub: id, role: 'authenticated'};
        const r = (await pg.json(`explain (analyze, format json) select watchlist_id, instrument_id, ticker_at_add, note, alerts, added_at
          from public.watchlist_items where user_id = '${id}' order by added_at desc limit 1000`, {}, {role: 'authenticated', claims}))[0]['Execution Time'];
        read.push(r);
      }
      // Merken mit Tarifgrenze: Nutzer mit Pro-Grenze simulieren (500), damit jedes Szenario einfuegen darf.
      await pg.exec(`insert into billing.entitlement_overrides (user_id, plan_id, reason, valid_until)
        select unnest(array[${ids.map(i => `'${i}'::uuid`).join(',')}]), 'pro', 'Lasttest', now() + interval '1 day';`);
      for (const id of ids.slice(0, Math.min(20, ids.length))) {
        const claims = {sub: id, role: 'authenticated'};
        const w = await pg.json(`explain (analyze, format json) select public.watchlist_add('vu_ffff' || substr(md5(random()::text), 1, 10), 'LOAD')`,
          {}, {role: 'authenticated', claims}).catch(e => ({error: e.message}));
        if (Array.isArray(w)) write.push(w[0]['Execution Time']); else log('Merken fehlgeschlagen: ' + w.error);
      }
      const probe = await pg.json(`select to_json(instrument_id) from public.watchlist_items limit 1`);
      const fan = (await pg.json(`explain (analyze, format json) select user_id from public.watchlist_items where instrument_id = '${probe}'`))[0]['Execution Time'];
      const row = {itemsPerUser: n, users, ...size, bytesPerItem: Math.round(size.total / size.rows),
        readMs: {median: +quantile(read, 0.5).toFixed(2), p95: +quantile(read, 0.95).toFixed(2)},
        addMs: write.length ? {median: +quantile(write, 0.5).toFixed(2), p95: +quantile(write, 0.95).toFixed(2), samples: write.length} : null,
        fanOutMs: +Number(fan).toFixed(2)};
      results.push(row);
      log(`${n} Titel x ${users} Nutzer: ${row.rows} Zeilen, ${(row.total / 1048576).toFixed(1)} MB (Tabelle ${(row.table / 1048576).toFixed(1)}, Indizes ${(row.indexes / 1048576).toFixed(1)}), ` +
        `${row.bytesPerItem} B/Titel · Lesen p50 ${row.readMs.median} ms / p95 ${row.readMs.p95} ms · Merken p50 ${row.addMs ? row.addMs.median : '–'} ms · Fan-out ${row.fanOutMs} ms`);
    }
  } finally { await db.drop(); }
  return {measuredAt: new Date().toISOString(), postgres: 'local', results};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opt = n => (process.argv.find(a => a.startsWith(`--${n}=`)) || '').slice(n.length + 3);
  if (!process.env.PG_TEST_URL) { console.error('PG_TEST_URL fehlt'); process.exit(2); }
  const r = await measure({adminUrl: process.env.PG_TEST_URL, users: Number(opt('users') || 10000),
    sizes: (opt('sizes') || '25,50,100,200').split(',').map(Number)});
  if (opt('out')) writeFileSync(opt('out'), JSON.stringify(r, null, 1));
}
