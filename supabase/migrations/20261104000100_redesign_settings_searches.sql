-- =============================================================================
-- VISION UNIVERSE — Redesign Konto: erster Start (Z1) und gespeicherte Suchen (Z3)
-- (docs/PLAN_NEUSTART_2026-11.md §7, Folie E11; docs/accounts/ACCOUNTS_AND_SUBSCRIPTIONS.md)
--
-- Z1  user_settings bekommt
--       * experience_level 'pro' (Einsteiger / Fortgeschritten / Profi; alte Werte bleiben gueltig)
--       * goal: 'vorsorge' | 'aktie' | 'ideen' | 'strategien' | null (Ziel aus dem ersten Start)
--       * onboarded_at: wann der erste Start abgeschlossen oder uebersprungen wurde. Den Zeitpunkt
--         setzt die Datenbank (now()), nicht der Client; einmal gesetzt bleibt er fuer den Nutzer fest.
-- Z3  saved_searches: benannte Filter je Produktwelt, nur fuer den Eigentuemer sichtbar (RLS),
--     hoechstens 50 je Konto (fest, keine Tarifstaffel), Loeschung mit dem Konto (cascade).
--
-- Nicht destruktiv (scripts/account/migrate-production.mjs): keine bestehende Zeile aendert sich,
-- neue Spalten sind nullable ohne Umschreiben, die erweiterte Pruefregel laesst alle alten Werte zu.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Z1: Erfahrung, Ziel, erster Start
-- ---------------------------------------------------------------------------
alter table public.user_settings drop constraint if exists user_settings_experience_level_check;
alter table public.user_settings
  add constraint user_settings_experience_level_check check (experience_level in ('beginner', 'advanced', 'pro'));

alter table public.user_settings
  add column goal text,
  add column onboarded_at timestamptz,
  add constraint user_settings_goal_check check (goal is null or goal in ('vorsorge', 'aktie', 'ideen', 'strategien'));

grant update (goal, onboarded_at) on public.user_settings to authenticated;

-- Der Client meldet nur "erledigt"; der Zeitpunkt kommt von der Datenbank. Fuer angemeldete Nutzer
-- bleibt der erste Zeitpunkt bestehen (auch bei erneutem "erledigt" oder null). Der Betrieb
-- (service_role, ohne auth.uid()) darf ihn zuruecksetzen.
create function public.user_settings_onboarded()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select auth.uid()) is null then return new; end if;
  if old.onboarded_at is not null then
    new.onboarded_at := old.onboarded_at;
  elsif new.onboarded_at is not null then
    new.onboarded_at := now();
  end if;
  return new;
end $$;

create trigger user_settings_onboarded before update of onboarded_at on public.user_settings
  for each row execute function public.user_settings_onboarded();

revoke all on function public.user_settings_onboarded() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Z3: Gespeicherte Suchen
-- ---------------------------------------------------------------------------
create function public.saved_search_query_valid(p jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select p is not null and jsonb_typeof(p) = 'object' and octet_length(p::text) <= 4096
$$;

create table public.saved_searches (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  world      text not null check (world in ('quant', 'screener', 'technical', 'fundamental', 'discover')),
  name       text not null check (char_length(name) between 1 and 80 and name = btrim(name)),
  query      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_searches_query_valid check (public.saved_search_query_valid(query))
);

create index saved_searches_user_world on public.saved_searches (user_id, world, updated_at desc);

create trigger saved_searches_touch before update on public.saved_searches
  for each row execute function public.touch_updated_at();

-- Obergrenze ohne Wettlauf: Sperre je Konto, dann zaehlen. Fest 50 (keine Tarifstaffel).
create function public.enforce_saved_searches_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and new.user_id is distinct from (select auth.uid()) then
    raise exception 'SAVED_SEARCH_NOT_OWNED' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('saved_searches:' || new.user_id::text, 0));
  if (select count(*) from public.saved_searches s where s.user_id = new.user_id) >= 50 then
    raise exception 'SAVED_SEARCHES_LIMIT_REACHED' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger saved_searches_limit before insert on public.saved_searches
  for each row execute function public.enforce_saved_searches_limit();

alter table public.saved_searches enable row level security;
revoke all on public.saved_searches from anon, authenticated;
grant select, delete on public.saved_searches to authenticated;
grant insert (user_id, world, name, query) on public.saved_searches to authenticated;
grant update (name, query) on public.saved_searches to authenticated;
grant all on public.saved_searches to service_role;

create policy saved_searches_select_own on public.saved_searches for select to authenticated
  using ((select auth.uid()) = user_id);
create policy saved_searches_insert_own on public.saved_searches for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy saved_searches_update_own on public.saved_searches for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy saved_searches_delete_own on public.saved_searches for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Schreibzugriffe als Funktionen (security invoker: RLS und Grenze gelten wie beim direkten Zugriff).
-- Rueckgabe einer Suche: {id, world, name, query, createdAt, updatedAt}. Groesse: Textform von jsonb
-- (mit Leerzeichen) hoechstens 4096 Byte; der Worker prueft vorher kompaktes JSON mit derselben Grenze.
create function public.saved_search_json(s public.saved_searches)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id', s.id, 'world', s.world, 'name', s.name, 'query', s.query,
    'createdAt', s.created_at, 'updatedAt', s.updated_at)
$$;

create function public.saved_search_create(p_world text, p_name text, p_query jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_row public.saved_searches%rowtype;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  if p_world is null or p_world not in ('quant', 'screener', 'technical', 'fundamental', 'discover') then
    raise exception 'WORLD_INVALID' using errcode = '22023';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then raise exception 'NAME_INVALID' using errcode = '22023'; end if;
  if p_query is null or jsonb_typeof(p_query) <> 'object' then raise exception 'QUERY_INVALID' using errcode = '22023'; end if;
  if not public.saved_search_query_valid(p_query) then raise exception 'QUERY_TOO_LARGE' using errcode = '22023'; end if;
  insert into public.saved_searches (user_id, world, name, query)
    values (v_user, p_world, btrim(p_name), p_query)
    returning * into v_row;
  return public.saved_search_json(v_row);
end $$;

-- p: {"name": "...", "query": {...}} (beides optional, mindestens eines).
create function public.saved_search_update(p_id uuid, p jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_row public.saved_searches%rowtype;
begin
  if p is null or jsonb_typeof(p) <> 'object' or not (p ? 'name' or p ? 'query') then
    raise exception 'NOTHING_TO_UPDATE' using errcode = '22023';
  end if;
  if p ? 'name' and (jsonb_typeof(p -> 'name') <> 'string' or char_length(btrim(p ->> 'name')) not between 1 and 80) then
    raise exception 'NAME_INVALID' using errcode = '22023';
  end if;
  if p ? 'query' and jsonb_typeof(p -> 'query') <> 'object' then raise exception 'QUERY_INVALID' using errcode = '22023'; end if;
  if p ? 'query' and not public.saved_search_query_valid(p -> 'query') then raise exception 'QUERY_TOO_LARGE' using errcode = '22023'; end if;
  update public.saved_searches s set
      name = case when p ? 'name' then btrim(p ->> 'name') else s.name end,
      query = case when p ? 'query' then p -> 'query' else s.query end
    where s.id = p_id
    returning * into v_row;
  if not found then raise exception 'SAVED_SEARCH_NOT_FOUND' using errcode = 'P0002'; end if;
  return public.saved_search_json(v_row);
end $$;

create function public.saved_search_remove(p_id uuid)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  delete from public.saved_searches s where s.id = p_id;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.enforce_saved_searches_limit(), public.saved_search_json(public.saved_searches),
  public.saved_search_create(text, text, jsonb), public.saved_search_update(uuid, jsonb), public.saved_search_remove(uuid)
  from public, anon;
revoke all on function public.enforce_saved_searches_limit() from authenticated;
grant execute on function public.saved_search_json(public.saved_searches), public.saved_search_create(text, text, jsonb),
  public.saved_search_update(uuid, jsonb), public.saved_search_remove(uuid) to authenticated, service_role;
grant execute on function public.saved_search_query_valid(jsonb) to authenticated, service_role;
