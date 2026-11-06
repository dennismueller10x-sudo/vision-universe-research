-- E4: Native Geraete, RLS und atomare Tagesreservierung. Kein Anbieter-Secret.
create table public.push_devices (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  token text not null check (length(token) between 20 and 4096 and token ~ '^[A-Za-z0-9_:.-]+$'),
  platform text not null check (platform in ('ios','android')),
  updated_at timestamptz not null default now(),
  primary key (user_id, token), unique(token)
);
alter table public.push_devices enable row level security;
create policy push_own on public.push_devices for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.push_devices from anon, authenticated;
grant select, delete on public.push_devices to authenticated;
grant insert(user_id, token, platform), update(platform, updated_at) on public.push_devices to authenticated;
grant all on public.push_devices to service_role;

create function public.push_register(p_token text, p_platform text) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  -- Eindeutiges Token: ein fremdes Konto darf es nicht uebernehmen (erst abmelden).
  insert into public.push_devices(user_id,token,platform) values(auth.uid(),p_token,p_platform)
  on conflict(user_id,token) do update set platform=excluded.platform,updated_at=now();
end $$;
create function public.push_remove(p_token text) returns void
language sql security invoker set search_path = '' as $$
  delete from public.push_devices where token=p_token and user_id=(select auth.uid());
$$;
revoke all on function public.push_register(text,text), public.push_remove(text) from public, anon;
grant execute on function public.push_register(text,text), public.push_remove(text) to authenticated;

create table public.push_daily_claims (
 user_id uuid primary key references auth.users(id) on delete cascade,
 day date not null
);
alter table public.push_daily_claims enable row level security;
revoke all on public.push_daily_claims from anon, authenticated;
grant all on public.push_daily_claims to service_role;

-- Nur der Worker liefert validierte Ereignisse des bestehenden Erzeugers.
-- Eine Reservierung VOR Versand, kein Wiederholen bei unklarem Versandstatus.
-- Genau ein zuletzt benutztes Geraet je Nutzer, auch bei mehreren Cron-Isolates.
create function public.push_claim_daily(p_events jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; claimed uuid; result jsonb := '[]';
begin
 if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events)>5000 then raise exception 'EVENTS_INVALID'; end if;
 delete from public.push_devices where updated_at < now()-interval '30 days';
 for r in
  select d.user_id,d.token,count(distinct e->>'eventId') as n
  from (select distinct on (user_id) * from public.push_devices order by user_id,updated_at desc,token) d
  join public.watchlist_items w on w.user_id=d.user_id
  cross join jsonb_array_elements(p_events) e
  where not exists (select 1 from public.push_daily_claims c where c.user_id=d.user_id and c.day >= (now() at time zone 'UTC')::date)
    and w.instrument_id=e->>'instrumentId' and w.alerts->>(e->>'type')='true'
    and (e->>'occurredAt')::timestamptz > now()-interval '24 hours'
    and (e->>'occurredAt')::timestamptz <= now()
  group by d.user_id,d.token order by d.user_id limit 15
 loop
  claimed := null;
  insert into public.push_daily_claims(user_id,day) values(r.user_id,(now() at time zone 'UTC')::date)
   on conflict(user_id) do update set day=excluded.day where public.push_daily_claims.day<excluded.day
   returning user_id into claimed;
  if claimed is not null then result := result || jsonb_build_array(jsonb_build_object('token',r.token,'count',r.n)); end if;
 end loop;
 return result;
end $$;
revoke all on function public.push_claim_daily(jsonb) from public, anon, authenticated;
grant execute on function public.push_claim_daily(jsonb) to service_role;
