-- Prueft die Sicherheitsregeln der Konto-Migration. Jeder Verstoss bricht ab.
\set ON_ERROR_STOP on
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'a@example.com', '{"display_name":"Anna"}'),
  ('22222222-2222-4222-8222-222222222222', 'b@example.com', '{}');

-- Neuer User bekommt Profil und Standard-Watchlist.
do $$ begin
  assert (select count(*) from public.profiles) = 2, 'profile per user';
  assert (select display_name from public.profiles where id = '11111111-1111-4111-8111-111111111111') = 'Anna', 'display name';
  assert (select count(*) from public.watchlists) = 2, 'default watchlist per user';
end $$;

-- ---------------------------------------------------------------- User A
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
do $$
declare wl uuid; other uuid;
begin
  assert (select count(*) from public.profiles) = 1, 'A sees only own profile';
  assert (select count(*) from public.watchlists) = 1, 'A sees only own watchlist';
  select id into wl from public.watchlists;
  insert into public.watchlist_items (watchlist_id, user_id, ticker) values (wl, auth.uid(), 'PLTR'), (wl, auth.uid(), 'NVDA');
  assert (select count(*) from public.watchlist_items) = 2, 'A items';
  -- Ungueltiger Ticker
  begin
    insert into public.watchlist_items (watchlist_id, user_id, ticker) values (wl, auth.uid(), 'nvda lower');
    raise exception 'ticker check missing';
  exception when check_violation then null; end;
  -- Fremde user_id
  begin
    insert into public.watchlist_items (watchlist_id, user_id, ticker) values (wl, '22222222-2222-4222-8222-222222222222', 'AAPL');
    raise exception 'foreign user_id accepted';
  exception when insufficient_privilege or raise_exception then
    if sqlerrm = 'foreign user_id accepted' then raise; end if;
  end;
  -- Kein Premium -> keine Digests, has_premium false
  assert public.has_premium() = false, 'no premium yet';
  -- Freischaltung selbst schreiben ist verboten
  begin
    insert into public.entitlements (user_id, status, store) values (auth.uid(), 'active', 'MANUAL');
    raise exception 'user could grant premium';
  exception when insufficient_privilege then null; end;
  -- Profil aendern: ja
  update public.profiles set report_frequency = 'daily' where id = auth.uid();
  assert (select report_frequency from public.profiles) = 'daily', 'profile update';
  -- billing_events / symbol_snapshots: kein Zugriff
  begin
    perform 1 from public.billing_events;
    raise exception 'billing_events readable';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------- User B darf A nicht sehen/aendern
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
do $$
declare a_list uuid := (select id from public.watchlists limit 1);
begin
  assert (select count(*) from public.watchlist_items) = 0, 'B sees none of A items';
  update public.profiles set display_name = 'hacked' where id = '11111111-1111-4111-8111-111111111111';
  delete from public.watchlist_items where ticker = 'PLTR';
end $$;
reset role;
do $$ begin
  assert (select display_name from public.profiles where id = '11111111-1111-4111-8111-111111111111') = 'Anna', 'B changed A profile';
  assert (select count(*) from public.watchlist_items) = 2, 'B deleted A items';
end $$;

-- ---------------------------------------------------------------- Server schaltet frei
insert into public.entitlements (user_id, status, store, expires_at)
  values ('11111111-1111-4111-8111-111111111111', 'trial', 'APP_STORE', now() + interval '7 days');
insert into public.symbol_digests (ticker, digest_date, items) values ('PLTR', current_date, '[]');
insert into public.user_reports (user_id, report_date, frequency, tickers, items)
  values ('11111111-1111-4111-8111-111111111111', current_date, 'daily', '{PLTR}', '[]');

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
do $$ begin
  assert public.has_premium() = true, 'trial grants premium';
  assert (select count(*) from public.symbol_digests) = 1, 'premium reads digests';
  update public.user_reports set read_at = now();
  assert (select count(*) from public.user_reports where read_at is not null) = 1, 'mark read';
  begin
    update public.user_reports set items = '[{"x":1}]';
    raise exception 'report content writable';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Abgelaufen, aber Kulanzfrist -> Zugang; ohne Kulanz -> kein Zugang; revoked -> nie.
update public.entitlements set status = 'grace', expires_at = now() - interval '1 day', grace_expires_at = now() + interval '2 days';
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
do $$ begin assert public.has_premium() = true, 'grace period'; end $$;
reset role;
update public.entitlements set status = 'expired', grace_expires_at = null;
set role authenticated;
do $$ begin
  assert public.has_premium() = false, 'expired';
  assert (select count(*) from public.symbol_digests) = 0, 'expired user reads digests';
end $$;
reset role;

-- Anonym: nichts
set role anon;
do $$ begin
  begin perform 1 from public.profiles; raise exception 'anon reads profiles';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Konto loeschen raeumt alles ab.
delete from auth.users where id = '11111111-1111-4111-8111-111111111111';
do $$ begin
  assert (select count(*) from public.watchlist_items) = 0, 'cascade items';
  assert (select count(*) from public.entitlements) = 0, 'cascade entitlements';
  assert (select count(*) from public.user_reports) = 0, 'cascade reports';
end $$;
select 'RLS_CHECK_PASS' as result;
