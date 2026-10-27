-- =============================================================================
-- VISION UNIVERSE — Konten: Profil, Einstellungen, Rollen
--
-- Identitaet: Supabase Auth (auth.users) ist die einzige Quelle der
-- Benutzer-ID. Jede Tabelle hier verweist auf auth.users(id) und wird mit dem
-- Konto geloescht (on delete cascade) - DSGVO Art. 17 ohne Sonderweg.
--
-- Grundsaetze (docs/accounts/ACCOUNTS_AND_SUBSCRIPTIONS.md):
--   * RLS auf jeder Tabelle, Policies nur fuer die eigene Zeile.
--   * Supabase vergibt im Schema public zunaechst ALLE Rechte an anon und
--     authenticated. Diese Migration nimmt sie zurueck und gibt nur frei,
--     was der Browser wirklich braucht (Spaltenrechte).
--   * Rollen (user/admin) setzt nur der Server (service_role) - ein Nutzer
--     kann sich nicht selbst befoerdern.
--   * Keine Marktdaten, keine Finanzdaten in Supabase (Auftragsgrenze).
-- =============================================================================

create type public.app_role as enum ('user', 'admin');

-- ---------------------------------------------------------------------------
-- Profil: was ein Mensch ueber sich zeigt. Keine E-Mail (die bleibt in auth).
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  locale       text not null default 'de-DE' check (locale in ('de-DE', 'en-US')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Einstellungen: entspricht core/contracts/user-data.schema.json#preferences
-- und #notificationSettings (Standard: alles aus).
-- ---------------------------------------------------------------------------
create table public.user_settings (
  user_id               uuid primary key references auth.users (id) on delete cascade,
  display_currency      text not null default 'EUR' check (display_currency ~ '^[A-Z]{3}$'),
  appearance            text not null default 'system' check (appearance in ('light', 'dark', 'system')),
  experience_level      text not null default 'beginner' check (experience_level in ('beginner', 'advanced')),
  notification_settings jsonb not null default '{}'::jsonb,
  marketing_emails      boolean not null default false,
  updated_at            timestamptz not null default now(),
  constraint user_settings_notifications_shape check (
    jsonb_typeof(notification_settings) = 'object'
    and notification_settings - array['WATCHLIST_NEWS', 'EARNINGS', 'PRICE_EVENT', 'SUPERTRADER_SIGNAL',
                                      'QUANT_CHANGE', 'MARKET_REGIME_CHANGE'] = '{}'::jsonb
  )
);

-- ---------------------------------------------------------------------------
-- Rollen. Eine Zeile je (Nutzer, Rolle). 'user' bekommt jedes Konto.
-- ---------------------------------------------------------------------------
create table public.user_roles (
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.app_role not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users (id) on delete set null,
  primary key (user_id, role)
);

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen. security definer + leerer search_path (Supabase-Empfehlung),
-- damit eine Policy die Rollentabelle lesen kann, ohne selbst RLS auszuloesen.
-- ---------------------------------------------------------------------------
create function public.has_role(check_role public.app_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = (select auth.uid()) and r.role = check_role
  )
$$;

create function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_role('admin'::public.app_role)
$$;

create function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger user_settings_touch before update on public.user_settings
  for each row execute function public.touch_updated_at();

-- Neues Konto: Profil, Einstellungen und Rolle 'user' entstehen in derselben
-- Transaktion wie der auth.users-Eintrag. Der Anzeigename kommt hoechstens
-- aus den Registrierungsdaten und wird hart begrenzt.
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  requested_name text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
begin
  insert into public.profiles (user_id, display_name)
    values (new.id, left(requested_name, 80));
  insert into public.user_settings (user_id) values (new.id);
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Rechte und RLS
-- ---------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.user_settings enable row level security;
alter table public.user_roles    enable row level security;

revoke all on public.profiles, public.user_settings, public.user_roles from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, locale) on public.profiles to authenticated;
grant select on public.user_settings to authenticated;
grant update (display_currency, appearance, experience_level, notification_settings, marketing_emails)
  on public.user_settings to authenticated;
grant select on public.user_roles to authenticated;
grant all on public.profiles, public.user_settings, public.user_roles to service_role;

create policy profiles_select_own on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));
create policy profiles_update_own on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy settings_select_own on public.user_settings for select to authenticated
  using ((select auth.uid()) = user_id);
create policy settings_update_own on public.user_settings for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy roles_select_own on public.user_roles for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));

revoke all on function public.has_role(public.app_role), public.is_admin(), public.handle_new_user(),
  public.touch_updated_at() from public, anon, authenticated;
grant execute on function public.has_role(public.app_role), public.is_admin() to authenticated, service_role;
