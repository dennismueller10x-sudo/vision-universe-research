-- Z4: App-Push je Ereignisart. Versendet wird nur, wenn das Konto die Art eingeschaltet hat
-- (user_settings.notification_settings, gesetzt ueber PATCH /v1/me) UND der Watchlist-Eintrag sie
-- nicht ausgeschaltet hat (watchlist_items.alerts; fehlt der Schluessel, gilt die Konto-Einstellung).
-- Ohne Konto-Einstellung kein Push (Vorgabe '{}' = alles aus). Hoechstens eine gebuendelte Nachricht je Tag
-- bleibt unveraendert (push_daily_claims). Kein E-Mail-Versand. RLS unveraendert: die Funktion laeuft nur als
-- service_role, Nutzer lesen und schreiben ihre Einstellungen weiter nur ueber die eigenen Zeilen.
create or replace function public.push_claim_daily(p_events jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; claimed uuid; result jsonb := '[]';
begin
 if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events)>5000 then raise exception 'EVENTS_INVALID'; end if;
 delete from public.push_devices where updated_at < now()-interval '30 days';
 for r in
  select d.user_id,d.token,count(distinct e->>'eventId') as n
  from (select distinct on (user_id) * from public.push_devices order by user_id,updated_at desc,token) d
  join public.user_settings s on s.user_id=d.user_id
  join public.watchlist_items w on w.user_id=d.user_id
  cross join jsonb_array_elements(p_events) e
  where not exists (select 1 from public.push_daily_claims c where c.user_id=d.user_id and c.day >= (now() at time zone 'UTC')::date)
    and w.instrument_id=e->>'instrumentId'
    and s.notification_settings->>(e->>'type')='true'
    and coalesce(w.alerts->>(e->>'type'),'true')<>'false'
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
