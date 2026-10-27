-- =============================================================================
-- VISION UNIVERSE — Watchlists (vorbereitet, noch ohne Produktverbraucher)
--
-- Eine Watchlist-Sammlung fuer alle Produkte (APP_READINESS.md §3). Titel
-- werden ueber instrumentId (vu_<hash>, ADR-001) referenziert, der Ticker
-- ist nur Anzeige. Die Mengengrenzen kommen aus dem Tarif
-- (watchlist.lists, watchlist.items) und werden in der Datenbank
-- durchgesetzt - nicht im Browser.
-- =============================================================================

create table public.watchlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.watchlist_items (
  watchlist_id  uuid not null references public.watchlists (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade default auth.uid(),
  instrument_id text not null check (instrument_id ~ '^vu_[a-f0-9]+$'),
  ticker_at_add text check (ticker_at_add is null or ticker_at_add ~ '^[A-Z0-9.\-]{1,24}$'),
  note          text check (note is null or char_length(note) <= 500),
  added_at      timestamptz not null default now(),
  primary key (watchlist_id, instrument_id)
);
create index watchlist_items_user on public.watchlist_items (user_id);

create trigger watchlists_touch before update on public.watchlists
  for each row execute function public.touch_updated_at();

-- Tarifgrenzen. security definer, weil die Zaehlung ueber RLS hinweg und die
-- Berechtigung aus billing.* gelesen werden muss.
create function public.enforce_watchlist_limits()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  ent jsonb := public.effective_entitlements(new.user_id, now());
  max_lists integer := nullif(ent -> 'features' ->> 'watchlist.lists', 'true')::integer;
  max_items integer := nullif(ent -> 'features' ->> 'watchlist.items', 'true')::integer;
  owner uuid;
begin
  -- Fremde Zeilen gar nicht erst bewerten (sonst verriete die Grenzmeldung etwas ueber andere Konten).
  if (select auth.uid()) is not null and new.user_id is distinct from (select auth.uid()) then
    raise exception 'WATCHLIST_NOT_OWNED' using errcode = 'P0001';
  end if;
  if tg_table_name = 'watchlists' then
    if not (ent -> 'features' ? 'watchlist.lists') then raise exception 'FEATURE_NOT_IN_PLAN' using errcode = 'P0001'; end if;
    if max_lists is not null and (select count(*) from public.watchlists w where w.user_id = new.user_id) >= max_lists then
      raise exception 'WATCHLIST_LIMIT_REACHED' using errcode = 'P0001';
    end if;
  else
    select w.user_id into owner from public.watchlists w where w.id = new.watchlist_id;
    if owner is distinct from new.user_id then raise exception 'WATCHLIST_NOT_OWNED' using errcode = 'P0001'; end if;
    if not (ent -> 'features' ? 'watchlist.items') then raise exception 'FEATURE_NOT_IN_PLAN' using errcode = 'P0001'; end if;
    if max_items is not null
       and (select count(*) from public.watchlist_items i where i.watchlist_id = new.watchlist_id) >= max_items then
      raise exception 'WATCHLIST_ITEMS_LIMIT_REACHED' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create trigger watchlists_limit before insert on public.watchlists
  for each row execute function public.enforce_watchlist_limits();
create trigger watchlist_items_limit before insert on public.watchlist_items
  for each row execute function public.enforce_watchlist_limits();

alter table public.watchlists      enable row level security;
alter table public.watchlist_items enable row level security;

revoke all on public.watchlists, public.watchlist_items from anon, authenticated;
grant select, insert, delete on public.watchlists, public.watchlist_items to authenticated;
grant update (name, position) on public.watchlists to authenticated;
grant update (note) on public.watchlist_items to authenticated;
grant all on public.watchlists, public.watchlist_items to service_role;

create policy watchlists_own on public.watchlists for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy watchlist_items_own on public.watchlist_items for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id
              and exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = (select auth.uid())));

revoke all on function public.enforce_watchlist_limits() from public, anon, authenticated;
