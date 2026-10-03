-- =========================================================================
-- VISION UNIVERSE — Konten, Watchlists, Abo-Freischaltung, Watchlist-Berichte
--
-- Zielsystem: Supabase (Postgres 15+, EU-Region Frankfurt).
-- Ausfuehren: Supabase Dashboard -> SQL Editor, oder `supabase db push`.
--
-- GRUNDSATZ
--   * Jede Tabelle hat Row-Level-Security. Ein User sieht nur seine Zeilen.
--   * Die Abo-Freischaltung (entitlements) schreibt ausschliesslich der Server
--     (Service-Role, RevenueCat-Webhook). Ein User kann sie lesen, nie aendern.
--   * Bezahlt wird nur ueber App Store / Google Play. Diese Datenbank kennt
--     keine Zahlungsdaten, nur das Ergebnis: Zugang ja/nein bis wann.
--   * Konto loeschen = auth.users-Zeile loeschen; alles haengt per
--     ON DELETE CASCADE daran (DSGVO Art. 17).
-- =========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- helpers
create or replace function public.vu_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  display_name     text check (display_name is null or char_length(display_name) between 1 and 80),
  locale           text not null default 'de' check (locale in ('de', 'en')),
  report_frequency text not null default 'weekly' check (report_frequency in ('off', 'daily', 'weekly')),
  report_email     boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.vu_touch_updated_at();

-- ---------------------------------------------------------------- watchlists
create table if not exists public.watchlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists watchlists_user_idx on public.watchlists (user_id, position);
drop trigger if exists watchlists_touch on public.watchlists;
create trigger watchlists_touch before update on public.watchlists
  for each row execute function public.vu_touch_updated_at();

-- Tickerformat identisch zu quant/api/watchlist-workspace.js (validate()).
create table if not exists public.watchlist_items (
  watchlist_id uuid not null references public.watchlists (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  ticker       text not null check (ticker ~ '^[A-Z0-9][A-Z0-9.-]{0,11}$'),
  note         text check (note is null or char_length(note) <= 500),
  added_at     timestamptz not null default now(),
  primary key (watchlist_id, ticker)
);
create index if not exists watchlist_items_user_idx on public.watchlist_items (user_id);
create index if not exists watchlist_items_ticker_idx on public.watchlist_items (ticker);

-- Obergrenzen: 20 Listen je User, 500 Werte je Liste (wie die lokale Watchlist).
create or replace function public.vu_enforce_watchlist_limits()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'watchlists' then
    if (select count(*) from public.watchlists where user_id = new.user_id) >= 20 then
      raise exception 'WATCHLIST_LIMIT_REACHED' using errcode = 'P0001';
    end if;
  else
    if not exists (select 1 from public.watchlists w
                   where w.id = new.watchlist_id and w.user_id = new.user_id) then
      raise exception 'WATCHLIST_NOT_OWNED' using errcode = 'P0001';
    end if;
    if (select count(*) from public.watchlist_items where watchlist_id = new.watchlist_id) >= 500 then
      raise exception 'WATCHLIST_ITEM_LIMIT_REACHED' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists watchlists_limit on public.watchlists;
create trigger watchlists_limit before insert on public.watchlists
  for each row execute function public.vu_enforce_watchlist_limits();
drop trigger if exists watchlist_items_limit on public.watchlist_items;
create trigger watchlist_items_limit before insert on public.watchlist_items
  for each row execute function public.vu_enforce_watchlist_limits();

-- ---------------------------------------------------------------- entitlements
-- Eine Zeile je User und Freischaltung. Quelle der Wahrheit ist RevenueCat
-- (App Store + Google Play); MANUAL ist fuer Tester, Partner, Support.
create table if not exists public.entitlements (
  user_id          uuid not null references auth.users (id) on delete cascade,
  entitlement      text not null default 'premium',
  status           text not null check (status in
                     ('trial', 'active', 'grace', 'billing_issue', 'cancelled', 'expired', 'revoked')),
  store            text not null check (store in
                     ('APP_STORE', 'MAC_APP_STORE', 'PLAY_STORE', 'PROMOTIONAL', 'MANUAL', 'OTHER')),
  product_id       text,
  period_type      text,
  expires_at       timestamptz,          -- null = unbefristet (nur MANUAL/PROMOTIONAL)
  grace_expires_at timestamptz,
  will_renew       boolean,
  is_sandbox       boolean not null default false,
  source_event_id  text,
  updated_at       timestamptz not null default now(),
  primary key (user_id, entitlement)
);
drop trigger if exists entitlements_touch on public.entitlements;
create trigger entitlements_touch before update on public.entitlements
  for each row execute function public.vu_touch_updated_at();

-- Gleiche Regel wie server/accounts/access.js -> hasAccess(). Beide aendern sich nur gemeinsam.
-- Ohne Parameter: ein User kann nur seinen eigenen Status abfragen.
create or replace function public.has_premium()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.entitlements e
    where e.user_id = auth.uid()
      and e.entitlement = 'premium'
      and e.status not in ('expired', 'revoked')
      and (e.expires_at is null
           or e.expires_at > now()
           or (e.grace_expires_at is not null and e.grace_expires_at > now()))
  );
$$;

-- ---------------------------------------------------------------- billing events
-- Protokoll jedes Webhooks. Primaerschluessel = Event-ID des Anbieters, damit
-- eine doppelte Zustellung genau einmal verarbeitet wird.
create table if not exists public.billing_events (
  id           text primary key,
  provider     text not null default 'revenuecat',
  app_user_id  text,
  type         text not null,
  environment  text,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  error        text
);

-- ---------------------------------------------------------------- reports
-- Letzter bekannter Stand je Aktie (Scores, Konsens, Signale), um Aenderungen
-- zwischen zwei Laeufen zu erkennen. Wird nur vom Berichtsjob geschrieben.
create table if not exists public.symbol_snapshots (
  ticker     text primary key check (ticker ~ '^[A-Z0-9][A-Z0-9.-]{0,11}$'),
  state      jsonb not null,
  as_of      date not null,
  updated_at timestamptz not null default now()
);

-- Ereignisse je Aktie und Tag. Pro Aktie berechnet, nicht pro User.
create table if not exists public.symbol_digests (
  ticker      text not null check (ticker ~ '^[A-Z0-9][A-Z0-9.-]{0,11}$'),
  digest_date date not null,
  items       jsonb not null,
  created_at  timestamptz not null default now(),
  primary key (ticker, digest_date)
);

create table if not exists public.user_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  report_date date not null,
  frequency   text not null check (frequency in ('daily', 'weekly')),
  tickers     text[] not null,
  items       jsonb not null,
  created_at  timestamptz not null default now(),
  emailed_at  timestamptz,
  read_at     timestamptz,
  unique (user_id, report_date)
);
create index if not exists user_reports_user_idx on public.user_reports (user_id, report_date desc);

-- ---------------------------------------------------------------- new user
create or replace function public.vu_handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
    values (new.id, nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80), ''))
    on conflict (id) do nothing;
  insert into public.watchlists (user_id, name, position) values (new.id, 'Meine Watchlist', 0);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.vu_handle_new_user();

-- ---------------------------------------------------------------- RLS
alter table public.profiles         enable row level security;
alter table public.watchlists       enable row level security;
alter table public.watchlist_items  enable row level security;
alter table public.entitlements     enable row level security;
alter table public.billing_events   enable row level security;
alter table public.symbol_snapshots enable row level security;
alter table public.symbol_digests   enable row level security;
alter table public.user_reports     enable row level security;

-- Anonyme Besucher haben auf keine dieser Tabellen Zugriff.
revoke all on public.profiles, public.watchlists, public.watchlist_items, public.entitlements,
  public.billing_events, public.symbol_snapshots, public.symbol_digests, public.user_reports from anon;
-- billing_events und symbol_snapshots: nur Service-Role (keine Policy = kein Zugriff).
revoke all on public.billing_events, public.symbol_snapshots from authenticated;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists watchlists_all on public.watchlists;
create policy watchlists_all on public.watchlists for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists watchlist_items_all on public.watchlist_items;
create policy watchlist_items_all on public.watchlist_items for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
              and exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = auth.uid()));

-- Freischaltung: lesen ja, schreiben nie (nur Service-Role umgeht RLS).
revoke insert, update, delete on public.entitlements from authenticated;
drop policy if exists entitlements_select on public.entitlements;
create policy entitlements_select on public.entitlements for select to authenticated using (user_id = auth.uid());

-- Tagesereignisse sind Premium-Inhalt.
revoke insert, update, delete on public.symbol_digests from authenticated;
drop policy if exists symbol_digests_select on public.symbol_digests;
create policy symbol_digests_select on public.symbol_digests for select to authenticated
  using (public.has_premium());

-- Berichte: lesen und nur "gelesen" markieren.
revoke insert, update, delete on public.user_reports from authenticated;
grant update (read_at) on public.user_reports to authenticated;
drop policy if exists user_reports_select on public.user_reports;
create policy user_reports_select on public.user_reports for select to authenticated using (user_id = auth.uid());
drop policy if exists user_reports_mark_read on public.user_reports;
create policy user_reports_mark_read on public.user_reports for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke execute on function public.has_premium() from public, anon;
grant execute on function public.has_premium() to authenticated;
