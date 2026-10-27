-- =============================================================================
-- VISION UNIVERSE — Persoenliche Watchlist (baut auf 20261025000400_watchlists)
--
-- Gespeichert wird NUR, was dem Nutzer gehoert: welche Instrumente er
-- beobachtet (instrumentId vu_<hash>, ADR-001; der Ticker ist nur Anzeige
-- und Migrationshilfe), seit wann, eine Notiz und Benachrichtigungswuensche.
-- Kurse, Scores und Signale liegen nie hier: sie kommen fuer alle Nutzer
-- gemeinsam aus den veroeffentlichten Artefakten (docs/accounts/WATCHLIST.md).
--
-- Neu:
--   * alerts je Eintrag (Opt-in je Ereignisart aus core/contracts/events.schema.json)
--   * watchlist_add / watchlist_remove / watchlist_update: idempotent, mit RLS
--     (security invoker), legen bei Bedarf die Standardliste an
--   * Tarifgrenze ohne Wettlauf (Sperre je Liste bzw. Konto)
--   * Index je Instrument fuer die spaetere Ereigniszustellung (nur Server)
-- =============================================================================

-- Ereignisarten, die sich auf ein einzelnes Instrument beziehen.
create function public.watchlist_alerts_valid(p jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from jsonb_each(p) e
        where e.key not in ('PRICE_EVENT', 'SUPERTRADER_SIGNAL', 'QUANT_CHANGE', 'WATCHLIST_NEWS', 'EARNINGS')
           or jsonb_typeof(e.value) <> 'boolean')
$$;

alter table public.watchlist_items
  add column alerts jsonb not null default '{}'::jsonb,
  add constraint watchlist_items_alerts_valid check (public.watchlist_alerts_valid(alerts));

grant update (alerts) on public.watchlist_items to authenticated;

-- Sortierte Abfrage der eigenen Liste und Ereignis-Fan-out (Wer beobachtet X?).
create index watchlist_items_user_added on public.watchlist_items (user_id, added_at desc);
-- Ersetzt den reinen user_id-Index (gleicher Praefix); gemessen: ein Viertel weniger Indexplatz
-- (scripts/account/watchlist-load.mjs, docs/accounts/WATCHLIST.md).
drop index if exists public.watchlist_items_user;
create index watchlist_items_instrument on public.watchlist_items (instrument_id);

-- Tarifgrenzen wie bisher, aber ohne Wettlauf: zwei gleichzeitige Einfuegungen
-- duerfen die Grenze nicht gemeinsam ueberschreiten. Die Transaktionssperre
-- gilt je Liste (Titel) bzw. je Konto (Listen).
create or replace function public.enforce_watchlist_limits()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  ent jsonb := public.effective_entitlements(new.user_id, now());
  max_lists integer := nullif(ent -> 'features' ->> 'watchlist.lists', 'true')::integer;
  max_items integer := nullif(ent -> 'features' ->> 'watchlist.items', 'true')::integer;
  owner uuid;
begin
  if (select auth.uid()) is not null and new.user_id is distinct from (select auth.uid()) then
    raise exception 'WATCHLIST_NOT_OWNED' using errcode = 'P0001';
  end if;
  if tg_table_name = 'watchlists' then
    perform pg_advisory_xact_lock(hashtextextended('watchlists:' || new.user_id::text, 0));
    if not (ent -> 'features' ? 'watchlist.lists') then raise exception 'FEATURE_NOT_IN_PLAN' using errcode = 'P0001'; end if;
    if max_lists is not null and (select count(*) from public.watchlists w where w.user_id = new.user_id) >= max_lists then
      raise exception 'WATCHLIST_LIMIT_REACHED' using errcode = 'P0001';
    end if;
  else
    perform pg_advisory_xact_lock(hashtextextended('watchlist_items:' || new.watchlist_id::text, 0));
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

-- Standardliste des angemeldeten Nutzers: die erste (Position, Anlage), sonst
-- wird "Meine Watchlist" angelegt. Gleichzeitige Aufrufe legen nur eine an.
create function public.watchlist_default()
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  select w.id into v_id from public.watchlists w where w.user_id = v_user order by w.position, w.created_at, w.id limit 1;
  if v_id is not null then return v_id; end if;
  insert into public.watchlists (user_id, name) values (v_user, 'Meine Watchlist')
    on conflict (user_id, name) do nothing returning id into v_id;
  if v_id is null then
    select w.id into v_id from public.watchlists w where w.user_id = v_user order by w.position, w.created_at, w.id limit 1;
  end if;
  return v_id;
end $$;

-- Hinzufuegen (idempotent). Ein Instrument steht je Liste hoechstens einmal
-- (Primaerschluessel). Rueckgabe: {state: ADDED|ALREADY_PRESENT, listId, addedAt}.
create function public.watchlist_add(p_instrument text, p_ticker text default null, p_list uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_list uuid := coalesce(p_list, public.watchlist_default());
  v_added timestamptz;
begin
  if p_instrument is null or p_instrument !~ '^vu_[a-f0-9]{6,32}$' then raise exception 'INSTRUMENT_INVALID' using errcode = '22023'; end if;
  if p_ticker is not null and p_ticker !~ '^[A-Z0-9.\-]{1,24}$' then raise exception 'TICKER_INVALID' using errcode = '22023'; end if;
  -- Fremde oder unbekannte Liste: RLS blendet sie aus, also "nicht gefunden".
  if not exists (select 1 from public.watchlists w where w.id = v_list) then raise exception 'WATCHLIST_NOT_FOUND' using errcode = 'P0002'; end if;
  insert into public.watchlist_items (watchlist_id, user_id, instrument_id, ticker_at_add)
    values (v_list, (select auth.uid()), p_instrument, p_ticker)
    on conflict (watchlist_id, instrument_id) do nothing
    returning added_at into v_added;
  if v_added is null then
    select i.added_at into v_added from public.watchlist_items i where i.watchlist_id = v_list and i.instrument_id = p_instrument;
    return jsonb_build_object('state', 'ALREADY_PRESENT', 'listId', v_list, 'addedAt', v_added);
  end if;
  return jsonb_build_object('state', 'ADDED', 'listId', v_list, 'addedAt', v_added);
end $$;

-- Entfernen aus einer Liste oder (p_list null) aus allen eigenen Listen.
create function public.watchlist_remove(p_instrument text, p_list uuid default null)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  if p_instrument is null or p_instrument !~ '^vu_[a-f0-9]{6,32}$' then raise exception 'INSTRUMENT_INVALID' using errcode = '22023'; end if;
  delete from public.watchlist_items i
   where i.instrument_id = p_instrument and (p_list is null or i.watchlist_id = p_list);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Notiz und Benachrichtigungswuensche eines eigenen Eintrags.
create function public.watchlist_update(p_instrument text, p_list uuid, p jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_row public.watchlist_items%rowtype;
begin
  if p ? 'alerts' and not public.watchlist_alerts_valid(p -> 'alerts') then raise exception 'ALERTS_INVALID' using errcode = '22023'; end if;
  update public.watchlist_items i set
      note = case when p ? 'note' then nullif(btrim(p ->> 'note'), '') else i.note end,
      alerts = case when p ? 'alerts' then p -> 'alerts' else i.alerts end
    where i.watchlist_id = p_list and i.instrument_id = p_instrument
    returning * into v_row;
  if not found then raise exception 'WATCHLIST_ITEM_NOT_FOUND' using errcode = 'P0002'; end if;
  return jsonb_build_object('instrumentId', v_row.instrument_id, 'note', v_row.note, 'alerts', v_row.alerts);
end $$;

revoke all on function public.watchlist_default(), public.watchlist_add(text, text, uuid), public.watchlist_remove(text, uuid),
  public.watchlist_update(text, uuid, jsonb) from public, anon;
grant execute on function public.watchlist_default(), public.watchlist_add(text, text, uuid), public.watchlist_remove(text, uuid),
  public.watchlist_update(text, uuid, jsonb) to authenticated, service_role;
grant execute on function public.watchlist_alerts_valid(jsonb) to authenticated, service_role;

-- Mehrere Titel in einem Aufruf (Uebernahme der bisherigen Browser-Watchlists
-- aus Discover und Quant, docs/architecture/APP_READINESS.md §3). Ein Aufruf
-- statt einer Anfrage je Titel; stoppt an der Tarifgrenze und meldet, wie
-- viele uebernommen wurden. p_items: [{"instrumentId": "vu_…", "ticker": "NVDA"}, …]
create function public.watchlist_import(p_items jsonb, p_list uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_list uuid := coalesce(p_list, public.watchlist_default());
  v_item jsonb;
  v_added integer := 0;
  v_present integer := 0;
  v_skipped integer := 0;
  v_limited boolean := false;
  v_state text;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then raise exception 'IMPORT_INVALID' using errcode = '22023'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if v_limited then v_skipped := v_skipped + 1; continue; end if;
    begin
      v_state := public.watchlist_add(v_item ->> 'instrumentId', nullif(v_item ->> 'ticker', ''), v_list) ->> 'state';
      if v_state = 'ADDED' then v_added := v_added + 1; else v_present := v_present + 1; end if;
    exception
      when others then
        if sqlerrm like '%WATCHLIST_ITEMS_LIMIT_REACHED%' then v_limited := true; v_skipped := v_skipped + 1;
        elsif sqlerrm like '%INSTRUMENT_INVALID%' or sqlerrm like '%TICKER_INVALID%' then v_skipped := v_skipped + 1;
        else raise;
        end if;
    end;
  end loop;
  return jsonb_build_object('listId', v_list, 'added', v_added, 'alreadyPresent', v_present, 'skipped', v_skipped, 'limitReached', v_limited);
end $$;
revoke all on function public.watchlist_import(jsonb, uuid) from public, anon;
grant execute on function public.watchlist_import(jsonb, uuid) to authenticated, service_role;
