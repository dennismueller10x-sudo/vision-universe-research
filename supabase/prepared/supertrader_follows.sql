-- =============================================================================
-- VISION UNIVERSE — Supertrader: Methoden folgen und Aktien melden (App-Konzept 2, Owner 16.11.2026)
--
-- VORBEREITET, NICHT AUSGEROLLT. Diese Datei liegt bewusst NICHT in supabase/migrations/: dort spielt
-- account-production-auto.yml jede neue Datei nach dem Merge automatisch in die Produktion ein. „Folgen“/„Melden“
-- bleibt aus bis zur Pruefung durch einen Anwalt (Owner 16.11.2026; docs/accounts/FREIGABEN.md, Abschnitt
-- „Supertrader Folgen/Melden“). Einschalten im selben PR: diese Datei als
-- supabase/migrations/<Zeitstempel nach der letzten Migration>_supertrader_follows.sql verschieben, im Worker
-- VU_SUPERTRADER_ALERTS_ENABLED = "true" (wrangler.toml, Produktion) und im Frontend ST_ALERTS_UI = true
-- (supertrader/assets/st-redesign.js). Die SQL-Tests (scripts/account/sql-tests.mjs) spielen supabase/prepared/ nach den
-- Migrationen in die Testdatenbank ein; die Produktion beruehrt nichts davon.
--
-- „Folgen“ (Fenster „Methode“): supertrader_follows haelt die Methoden, denen ein Konto folgt (strategy_id der
--   13 quellentreuen Methoden, z. B. SF_MINERVINI_SEPA_VCP). Gemeldet wird, wenn eine Aktie bei dieser Methode
--   „Regel erfuellt“ oder „Plan fertig“ erreicht. Nur der Eigentuemer sieht seine Zeilen (RLS), hoechstens 50 je
--   Konto, Loeschung mit dem Konto (cascade).
-- „Melden“ (Fenster „Ablauf“ einer Aktie): KEIN neuer Speicherort. Die Aktie steht in der persoenlichen Watchlist
--   (watchlist_items) mit alerts.SUPERTRADER_SIGNAL; die Stufen-Meldungen tragen den Ticker des Kandidatenstands
--   (supertrader/data/sf-candidates/index.json) und treffen den Eintrag ueber ticker_at_add.
-- Zustellung bleibt der App-Push (push_claim_daily): hoechstens eine gebuendelte Nachricht am Tag, nur mit
--   eingeschalteter Art SUPERTRADER_SIGNAL im Konto (user_settings.notification_settings).
-- supertrader_stage_runs: wann der Worker einen Kandidatenstand (asOf) zum ersten Mal gesehen hat. Dieser
--   Zeitpunkt ist occurredAt der Stufen-Meldungen; so gilt dasselbe 24-Stunden-Fenster wie fuer die
--   Watchlist-Ereignisse, und ein alter Stand wird nicht jeden Tag neu gemeldet. Nur der Betrieb (service_role).
--
-- Nicht destruktiv (scripts/account/migrate-production.mjs): zwei neue Tabellen, neue Funktionen und eine
-- erweiterte push_claim_daily (gleiche Signatur, gleiche Antwortform plus "stage" und "ids"). Keine bestehende Tabelle aendert sich.
-- =============================================================================

create table public.supertrader_follows (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  strategy_id text not null check (strategy_id ~ '^SF_[A-Z0-9_]{2,48}$'),
  created_at  timestamptz not null default now(),
  primary key (user_id, strategy_id)
);

-- Obergrenze ohne Wettlauf: Sperre je Konto, dann zaehlen. Fest 50 (es gibt 13 Methoden).
create function public.enforce_supertrader_follows_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and new.user_id is distinct from (select auth.uid()) then
    raise exception 'SUPERTRADER_FOLLOW_NOT_OWNED' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('supertrader_follows:' || new.user_id::text, 0));
  if (select count(*) from public.supertrader_follows f where f.user_id = new.user_id) >= 50 then
    raise exception 'SUPERTRADER_FOLLOWS_LIMIT_REACHED' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger supertrader_follows_limit before insert on public.supertrader_follows
  for each row execute function public.enforce_supertrader_follows_limit();

alter table public.supertrader_follows enable row level security;
revoke all on public.supertrader_follows from anon, authenticated;
grant select, delete on public.supertrader_follows to authenticated;
grant insert (user_id, strategy_id) on public.supertrader_follows to authenticated;
grant all on public.supertrader_follows to service_role;

create policy supertrader_follows_select_own on public.supertrader_follows for select to authenticated
  using ((select auth.uid()) = user_id);
create policy supertrader_follows_insert_own on public.supertrader_follows for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy supertrader_follows_delete_own on public.supertrader_follows for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Schreibzugriffe als Funktionen (security invoker: RLS und Grenze gelten wie beim direkten Zugriff).
create function public.supertrader_follow(p_strategy text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_count integer;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  if p_strategy is null or p_strategy !~ '^SF_[A-Z0-9_]{2,48}$' then raise exception 'STRATEGY_INVALID' using errcode = '22023'; end if;
  insert into public.supertrader_follows (user_id, strategy_id) values (v_user, p_strategy) on conflict do nothing;
  get diagnostics v_count = row_count;
  return jsonb_build_object('state', case when v_count = 1 then 'FOLLOWED' else 'ALREADY_FOLLOWING' end, 'strategyId', p_strategy);
end $$;

create function public.supertrader_unfollow(p_strategy text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  if p_strategy is null or p_strategy !~ '^SF_[A-Z0-9_]{2,48}$' then raise exception 'STRATEGY_INVALID' using errcode = '22023'; end if;
  delete from public.supertrader_follows f where f.strategy_id = p_strategy and f.user_id = (select auth.uid());
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.enforce_supertrader_follows_limit(), public.supertrader_follow(text), public.supertrader_unfollow(text)
  from public, anon;
revoke all on function public.enforce_supertrader_follows_limit() from authenticated;
grant execute on function public.supertrader_follow(text), public.supertrader_unfollow(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Erster Blick des Workers auf einen Kandidatenstand
-- ---------------------------------------------------------------------------
create table public.supertrader_stage_runs (
  as_of   date primary key,
  seen_at timestamptz not null default now()
);
alter table public.supertrader_stage_runs enable row level security;
revoke all on public.supertrader_stage_runs from anon, authenticated;
grant all on public.supertrader_stage_runs to service_role;

create function public.supertrader_stage_seen(p_as_of date) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v_seen timestamptz;
begin
  if p_as_of is null or p_as_of > (now() at time zone 'UTC')::date + 1 or p_as_of < (now() at time zone 'UTC')::date - 30 then
    raise exception 'AS_OF_INVALID' using errcode = '22023';
  end if;
  insert into public.supertrader_stage_runs (as_of) values (p_as_of) on conflict (as_of) do nothing;
  select r.seen_at into v_seen from public.supertrader_stage_runs r where r.as_of = p_as_of;
  return v_seen;
end $$;
revoke all on function public.supertrader_stage_seen(date) from public, anon, authenticated;
grant execute on function public.supertrader_stage_seen(date) to service_role;

-- ---------------------------------------------------------------------------
-- Zustellung: bisherige Watchlist-Ereignisse unveraendert, dazu die Stufen-Meldungen der Methoden
-- (kind ST_STAGE, ohne instrumentId): gemeldete Titel ueber ticker_at_add, gefolgte Methoden nur fuer
-- „Regel erfuellt“ und „Plan fertig“ erreicht. Antwort je Konto: token, count, stage (davon Stufen-Meldungen) und bis zu drei
-- eventIds (ids), damit der Worker eine einzelne Meldung wörtlich zeigen kann. Weiter hoechstens eine Nachricht am Tag.
-- ---------------------------------------------------------------------------
create or replace function public.push_claim_daily(p_events jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; claimed uuid; result jsonb := '[]';
begin
 if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events)>5000 then raise exception 'EVENTS_INVALID'; end if;
 delete from public.push_devices where updated_at < now()-interval '30 days';
 for r in
  with ev as (
    select e from jsonb_array_elements(p_events) e
     where jsonb_typeof(e) = 'object'
       and (e->>'occurredAt')::timestamptz > now()-interval '24 hours'
       and (e->>'occurredAt')::timestamptz <= now()
  ), hits as (
    select w.user_id, ev.e->>'eventId' as id, ev.e->>'kind' = 'ST_STAGE' as st
      from ev join public.watchlist_items w on w.instrument_id = ev.e->>'instrumentId'
      join public.user_settings s on s.user_id = w.user_id
     where s.notification_settings->>(ev.e->>'type')='true'
       and coalesce(w.alerts->>(ev.e->>'type'),'true')<>'false'
    union
    select w.user_id, ev.e->>'eventId', true
      from ev join public.watchlist_items w on ev.e->>'kind' = 'ST_STAGE' and ev.e->>'instrumentId' is null
                                          and w.ticker_at_add = ev.e->>'ticker'
      join public.user_settings s on s.user_id = w.user_id
     where s.notification_settings->>'SUPERTRADER_SIGNAL'='true'
       and coalesce(w.alerts->>'SUPERTRADER_SIGNAL','true')<>'false'
    union
    select f.user_id, ev.e->>'eventId', true
      from ev join public.supertrader_follows f on ev.e->>'kind' = 'ST_STAGE' and f.strategy_id = ev.e->>'strategyId'
      join public.user_settings s on s.user_id = f.user_id
     where s.notification_settings->>'SUPERTRADER_SIGNAL'='true'
       and ev.e->>'subtype' = 'STAGE_REACHED'
       and ev.e->>'stage' in ('CONFIRMED_RESEARCH_SETUP', 'MODELED_TRADE_PLAN')
  )
  select d.user_id, d.token, count(distinct h.id) as n, count(distinct h.id) filter (where h.st) as nst, (array_agg(distinct h.id order by h.id))[1:3] as ids
  from (select distinct on (user_id) * from public.push_devices order by user_id,updated_at desc,token) d
  join hits h on h.user_id = d.user_id
  where not exists (select 1 from public.push_daily_claims c where c.user_id=d.user_id and c.day >= (now() at time zone 'UTC')::date)
  group by d.user_id,d.token order by d.user_id limit 15
 loop
  claimed := null;
  insert into public.push_daily_claims(user_id,day) values(r.user_id,(now() at time zone 'UTC')::date)
   on conflict(user_id) do update set day=excluded.day where public.push_daily_claims.day<excluded.day
   returning user_id into claimed;
  if claimed is not null then result := result || jsonb_build_array(jsonb_build_object('token',r.token,'count',r.n,'stage',r.nst,'ids',to_jsonb(r.ids))); end if;
 end loop;
 return result;
end $$;
revoke all on function public.push_claim_daily(jsonb) from public, anon, authenticated;
grant execute on function public.push_claim_daily(jsonb) to service_role;
