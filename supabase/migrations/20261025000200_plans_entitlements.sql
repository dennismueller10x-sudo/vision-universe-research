-- =============================================================================
-- VISION UNIVERSE — Tarife, Funktionen, Preise (anbieterunabhaengig)
--
-- Ein Tarif (plan) buendelt Funktionsberechtigungen (features). Ein Preis
-- (plan_price) ist die Art, einen Tarif bei EINEM Zahlungsanbieter zu kaufen:
-- Stripe-Price, Apple-Produkt-ID oder Google-Play-Basisplan. Die
-- Berechtigungslogik kennt nur plan und feature - nie den Anbieter.
--
-- Die Tarifinhalte unten sind ein VORSCHLAG (Owner-Entscheidung, siehe
-- docs/accounts/ACCOUNTS_AND_SUBSCRIPTIONS.md §Tarife). Sie werden ueber
-- SQL gepflegt, nicht im Code.
-- =============================================================================

create type public.billing_provider as enum ('stripe', 'apple', 'google', 'manual');
create type public.billing_interval as enum ('month', 'year');

create table public.plans (
  id          text primary key check (id ~ '^[a-z][a-z0-9_]{1,31}$'),
  name        text not null check (char_length(name) between 1 and 60),
  description text check (description is null or char_length(description) <= 400),
  rank        integer not null unique check (rank >= 0),
  is_public   boolean not null default true,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.features (
  key         text primary key check (key ~ '^[a-z][a-z0-9_.]{1,63}$'),
  description text not null
);

-- limit_value null = unbegrenzt. Eine Funktion, die ein Tarif nicht enthaelt,
-- ist fuer diesen Tarif aus.
create table public.plan_features (
  plan_id     text not null references public.plans (id) on delete cascade,
  feature_key text not null references public.features (key) on delete cascade,
  limit_value integer check (limit_value is null or limit_value >= 0),
  primary key (plan_id, feature_key)
);

create table public.plan_prices (
  id                text primary key check (id ~ '^[a-z][a-z0-9_]{1,47}$'),
  plan_id           text not null references public.plans (id),
  provider          public.billing_provider not null,
  provider_price_id text not null check (char_length(provider_price_id) between 3 and 255),
  billing_interval  public.billing_interval not null,
  currency          text not null check (currency ~ '^[A-Z]{3}$'),
  unit_amount       integer not null check (unit_amount >= 0),
  livemode          boolean not null default false,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  unique (provider, provider_price_id)
);

-- Ein aktiver Preis je Tarif, Anbieter, Laufzeit und Modus - sonst waere
-- "plus monatlich" mehrdeutig.
create unique index plan_prices_one_active on public.plan_prices (plan_id, provider, billing_interval, livemode)
  where active;

alter table public.plans         enable row level security;
alter table public.features      enable row level security;
alter table public.plan_features enable row level security;
alter table public.plan_prices   enable row level security;

revoke all on public.plans, public.features, public.plan_features, public.plan_prices from anon, authenticated;
grant select on public.plans, public.features, public.plan_features, public.plan_prices to anon, authenticated;
grant all on public.plans, public.features, public.plan_features, public.plan_prices to service_role;

create policy plans_public_read on public.plans for select to anon, authenticated using (active and is_public);
create policy features_public_read on public.features for select to anon, authenticated using (true);
create policy plan_features_public_read on public.plan_features for select to anon, authenticated using (
  exists (select 1 from public.plans p where p.id = plan_id and p.active and p.is_public));
create policy plan_prices_public_read on public.plan_prices for select to anon, authenticated using (active);

-- ---------------------------------------------------------------------------
-- Katalog (Vorschlag). free ist der Grundzustand jedes Kontos und hat keinen
-- Preis. plus/pro entsprechen core/contracts/user-data.schema.json#entitlements.
-- ---------------------------------------------------------------------------
insert into public.plans (id, name, description, rank) values
  ('free', 'Free',  'Kostenloser Zugang mit Grundfunktionen.', 0),
  ('plus', 'Plus',  'Erweiterte Analysen und größere Watchlists.', 10),
  ('pro',  'Pro',   'Alle Analysen, Signale und Exporte.', 20);

insert into public.features (key, description) values
  ('watchlist.lists',      'Anzahl Watchlists'),
  ('watchlist.items',      'Titel je Watchlist'),
  ('quant.screener.full',  'Quant-Screener über das ganze Universum'),
  ('supertrader.signals',  'Supertrader-Signale und Strategieseiten'),
  ('ask.daily_questions',  'Fragen an AI Atlas pro Tag'),
  ('alerts.push',          'Benachrichtigungen zu Watchlist-Ereignissen'),
  ('export.csv',           'Export von Listen als CSV');

insert into public.plan_features (plan_id, feature_key, limit_value) values
  ('free', 'watchlist.lists', 1), ('free', 'watchlist.items', 20), ('free', 'ask.daily_questions', 3),
  ('plus', 'watchlist.lists', 5), ('plus', 'watchlist.items', 100), ('plus', 'ask.daily_questions', 20),
  ('plus', 'quant.screener.full', null), ('plus', 'alerts.push', null),
  ('pro', 'watchlist.lists', 25), ('pro', 'watchlist.items', 500), ('pro', 'ask.daily_questions', 100),
  ('pro', 'quant.screener.full', null), ('pro', 'alerts.push', null), ('pro', 'supertrader.signals', null),
  ('pro', 'export.csv', null);
