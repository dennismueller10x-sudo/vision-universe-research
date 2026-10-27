-- =============================================================================
-- VISION UNIVERSE — Abonnements, Rechnungen, Zahlungsereignisse
--
-- Anbieterunabhaengiges Modell (docs/accounts/ACCOUNTS_AND_SUBSCRIPTIONS.md §4):
--   Benutzer-ID       auth.users.id
--   Tarif-ID          plans.id (ueber plan_prices aus der Anbieter-Preis-ID)
--   Zahlungsanbieter  billing_provider (stripe | apple | google | manual)
--   Externe Abo-ID    subscriptions.provider_subscription_id
--   Status, Laufzeit  subscriptions.status, current_period_*, grace_until
--   Berechtigungen    effective_entitlements() - rechnet NUR aus diesem Modell
--   Zahlungsereignisse billing.payment_events (Idempotenz je Anbieter-Ereignis)
--
-- Schreibrechte hat ausschliesslich der Server (service_role) ueber die
-- billing_*-Funktionen. Der Browser liest nur die eigenen Zeilen.
-- Kein Zahlungsstatus kommt je vom Client.
-- =============================================================================

create schema if not exists billing;
revoke all on schema billing from public, anon, authenticated;
grant usage on schema billing to service_role;

create type public.subscription_status as enum (
  'incomplete',       -- Erstzahlung offen (Stripe incomplete)
  'trialing',         -- Testzeitraum
  'active',           -- bezahlt
  'past_due',         -- Zahlung fehlgeschlagen, Anbieter versucht erneut
  'in_grace_period',  -- Apple/Google: Abrechnungs-Kulanzzeit
  'on_hold',          -- Google: Konto gesperrt nach Kulanzzeit
  'paused',
  'unpaid',           -- Stripe: alle Versuche gescheitert
  'canceled',         -- beendet
  'expired',          -- abgelaufen (Stripe incomplete_expired, Apple EXPIRED)
  'revoked'           -- erstattet/entzogen (Apple REVOKE, Google revoked)
);

-- ---------------------------------------------------------------------------
-- Die EINE Regel, wann ein Abostatus Zugang gibt. Rein, ohne Tabellenzugriff;
-- dieselbe Regel steht in workers/vu-account/src/entitlements.mjs (Test
-- prueft Gleichheit an derselben Fallliste).
--   active/trialing         bis Periodenende + 2 Tage (Webhook-Verzug)
--   past_due/in_grace_period bis grace_until, sonst Periodenende + 7 Tage
--   alles andere            kein Zugang
-- ---------------------------------------------------------------------------
create function public.subscription_grants_access(
  s public.subscription_status, period_end timestamptz, grace_until timestamptz, at_time timestamptz)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when s in ('active', 'trialing') then period_end is not null and at_time < period_end + interval '2 days'
    when s in ('past_due', 'in_grace_period') then
      coalesce(grace_until, period_end + interval '7 days') is not null
      and at_time < coalesce(grace_until, period_end + interval '7 days')
    else false
  end
$$;

-- ---------------------------------------------------------------------------
-- Kunden je Anbieter. Die Verknuepfung Kunde -> Nutzer entsteht NUR auf dem
-- Server, bevor der Nutzer bezahlt (Checkout). Webhooks loesen den Nutzer
-- immer ueber diese Tabelle auf, nie allein ueber Metadaten.
-- ---------------------------------------------------------------------------
create table billing.customers (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid references auth.users (id) on delete set null,
  provider             public.billing_provider not null,
  provider_customer_id text not null check (char_length(provider_customer_id) between 3 and 255),
  created_at           timestamptz not null default now(),
  unique (provider, provider_customer_id)
);
create unique index customers_one_per_user on billing.customers (user_id, provider) where user_id is not null;

create table public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid references auth.users (id) on delete set null,
  plan_id                  text not null references public.plans (id),
  price_id                 text references public.plan_prices (id),
  provider                 public.billing_provider not null,
  provider_subscription_id text not null check (char_length(provider_subscription_id) between 3 and 255),
  provider_customer_id     text,
  status                   public.subscription_status not null,
  billing_interval         public.billing_interval,
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean not null default false,
  cancel_at                timestamptz,
  canceled_at              timestamptz,
  ended_at                 timestamptz,
  trial_end                timestamptz,
  grace_until              timestamptz,
  livemode                 boolean not null default false,
  provider_state_at        timestamptz not null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);
create index subscriptions_user on public.subscriptions (user_id);

create table public.invoices (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users (id) on delete set null,
  subscription_id     uuid references public.subscriptions (id) on delete set null,
  provider            public.billing_provider not null,
  provider_invoice_id text not null,
  number              text,
  status              text not null check (status in ('draft', 'open', 'paid', 'uncollectible', 'void')),
  currency            text not null check (currency ~ '^[A-Z]{3}$'),
  amount_due          integer not null default 0,
  amount_paid         integer not null default 0,
  hosted_invoice_url  text check (hosted_invoice_url is null or hosted_invoice_url ~ '^https://'),
  invoice_pdf         text check (invoice_pdf is null or invoice_pdf ~ '^https://'),
  period_start        timestamptz,
  period_end          timestamptz,
  issued_at           timestamptz,
  paid_at             timestamptz,
  livemode            boolean not null default false,
  provider_state_at   timestamptz not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (provider, provider_invoice_id)
);
create index invoices_user on public.invoices (user_id, issued_at desc);

-- Idempotenz: jedes Anbieter-Ereignis genau einmal. Datensparsam: keine
-- Nutzlast, nur Kennungen und Typ.
create table billing.payment_events (
  id                    bigint generated always as identity primary key,
  provider              public.billing_provider not null,
  provider_event_id     text not null,
  event_type            text not null,
  livemode              boolean not null default false,
  object_id             text,
  user_id               uuid references auth.users (id) on delete set null,
  status                text not null default 'processing' check (status in ('processing', 'processed', 'ignored', 'failed')),
  attempts              integer not null default 1,
  last_error            text check (last_error is null or char_length(last_error) <= 300),
  received_at           timestamptz not null default now(),
  processing_started_at timestamptz not null default now(),
  processed_at          timestamptz,
  unique (provider, provider_event_id)
);

-- Manuelle Freigaben (Pressezugang, Kulanz). Nur service_role/Admin-Werkzeug.
create table billing.entitlement_overrides (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  plan_id     text not null references public.plans (id),
  reason      text not null check (char_length(reason) between 3 and 200),
  valid_from  timestamptz not null default now(),
  valid_until timestamptz,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  check (valid_until is null or valid_until > valid_from)
);

-- Nachweis einer Kontoloeschung ohne personenbezogene Daten (Hash der ID).
create table billing.account_deletions (
  id            bigint generated always as identity primary key,
  user_ref_hash text not null,
  deleted_at    timestamptz not null default now(),
  subscriptions_canceled integer not null default 0
);

-- Kuendigungen ueber den Kuendigungsbutton (§ 312k BGB), auch ohne Anmeldung.
create table billing.cancellation_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users (id) on delete set null,
  email         text not null check (char_length(email) between 3 and 254),
  full_name     text check (full_name is null or char_length(full_name) <= 120),
  reference     text check (reference is null or char_length(reference) <= 120),
  kind          text not null check (kind in ('ordinary', 'extraordinary')),
  requested_at  timestamptz not null default now(),
  status        text not null default 'received' check (status in ('received', 'completed', 'no_contract')),
  completed_at  timestamptz
);

create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();
create trigger invoices_touch before update on public.invoices
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Rechte. Browser: nur Lesen der eigenen Abos und Rechnungen.
-- ---------------------------------------------------------------------------
alter table public.subscriptions enable row level security;
alter table public.invoices      enable row level security;
alter table billing.customers             enable row level security;
alter table billing.payment_events        enable row level security;
alter table billing.entitlement_overrides enable row level security;
alter table billing.account_deletions     enable row level security;
alter table billing.cancellation_requests enable row level security;

revoke all on public.subscriptions, public.invoices from anon, authenticated;
grant select on public.subscriptions, public.invoices to authenticated;
grant all on public.subscriptions, public.invoices to service_role;
grant all on all tables in schema billing to service_role;

create policy subscriptions_select_own on public.subscriptions for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));
create policy invoices_select_own on public.invoices for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Berechtigungen: der hoechste Tarif aus allen gueltigen Abos (jeder
-- Anbieter) und manuellen Freigaben; sonst free. Ein Ergebnis, egal wie
-- viele Quellen - widerspruchsfreie Berechtigung per Konstruktion.
-- ---------------------------------------------------------------------------
create function public.effective_entitlements(p_user_id uuid, p_at timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  best record;
  result_features jsonb;
begin
  select * into best from (
    select p.id as plan_id, p.rank, 'subscription'::text as source, s.provider::text as provider,
           case when s.status in ('past_due', 'in_grace_period')
                then coalesce(s.grace_until, s.current_period_end + interval '7 days')
                else s.current_period_end end as valid_until,
           s.status::text as status
      from public.subscriptions s join public.plans p on p.id = s.plan_id
     where s.user_id = p_user_id
       and public.subscription_grants_access(s.status, s.current_period_end, s.grace_until, p_at)
    union all
    select p.id, p.rank, 'override', 'manual', o.valid_until, 'active'
      from billing.entitlement_overrides o join public.plans p on p.id = o.plan_id
     where o.user_id = p_user_id and o.valid_from <= p_at and (o.valid_until is null or o.valid_until > p_at)
    union all
    select p.id, p.rank, 'default', null, null, null from public.plans p where p.id = 'free'
  ) candidates
  order by rank desc, valid_until desc nulls last
  limit 1;

  select coalesce(jsonb_object_agg(pf.feature_key, coalesce(to_jsonb(pf.limit_value), 'true'::jsonb)), '{}'::jsonb)
    into result_features
    from public.plan_features pf where pf.plan_id = best.plan_id;

  return jsonb_build_object(
    'plan_id', best.plan_id, 'plan_rank', best.rank, 'source', best.source, 'provider', best.provider,
    'status', best.status, 'valid_until', best.valid_until, 'features', result_features,
    'computed_at', p_at);
end $$;

create function public.my_entitlements()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when (select auth.uid()) is null then null
              else public.effective_entitlements((select auth.uid()), now()) end
$$;

-- Abo, das einen neuen Checkout verhindert (gleich welcher Anbieter).
create function public.billing_blocking_subscription(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(x) from (
    select s.provider, s.provider_subscription_id, s.plan_id, s.status, s.current_period_end
      from public.subscriptions s
     where s.user_id = p_user_id
       and (public.subscription_grants_access(s.status, s.current_period_end, s.grace_until, now())
            or s.status = 'incomplete' and s.created_at > now() - interval '1 day')
     order by s.updated_at desc limit 1) x
$$;

-- Nutzer mit mehr als einem gueltigen Abo (Doppelabo) - fuer Betrieb/Admin.
create view billing.entitlement_conflicts with (security_invoker = true) as
  select s.user_id, count(*) as entitling_subscriptions,
         array_agg(s.provider::text || ':' || s.provider_subscription_id order by s.created_at) as subscriptions
    from public.subscriptions s
   where s.user_id is not null
     and public.subscription_grants_access(s.status, s.current_period_end, s.grace_until, now())
   group by s.user_id having count(*) > 1;
grant select on billing.entitlement_conflicts to service_role;

-- ---------------------------------------------------------------------------
-- Ereignis-Idempotenz.
--   'process'      neu oder frueher gescheitert: verarbeiten
--   'duplicate'    bereits verarbeitet: 200 zurueck, nichts tun
--   'in_progress'  laeuft gerade (parallele Zustellung): Anbieter soll spaeter erneut senden
-- ---------------------------------------------------------------------------
create function public.billing_claim_event(
  p_provider public.billing_provider, p_event_id text, p_event_type text, p_livemode boolean, p_object_id text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  existing billing.payment_events%rowtype;
begin
  if p_event_id is null or char_length(p_event_id) not between 3 and 255 then raise exception 'EVENT_ID_INVALID'; end if;
  insert into billing.payment_events (provider, provider_event_id, event_type, livemode, object_id)
    values (p_provider, p_event_id, left(p_event_type, 100), coalesce(p_livemode, false), left(p_object_id, 255))
    on conflict (provider, provider_event_id) do nothing;
  if found then return 'process'; end if;

  select * into existing from billing.payment_events
   where provider = p_provider and provider_event_id = p_event_id for update;
  if existing.status in ('processed', 'ignored') then return 'duplicate'; end if;
  if existing.status = 'processing' and existing.processing_started_at > now() - interval '2 minutes' then
    return 'in_progress';
  end if;
  update billing.payment_events set status = 'processing', processing_started_at = now(), attempts = attempts + 1
   where id = existing.id;
  return 'process';
end $$;

create function public.billing_finish_event(
  p_provider public.billing_provider, p_event_id text, p_status text, p_error text default null, p_user_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('processed', 'ignored', 'failed') then raise exception 'EVENT_STATUS_INVALID'; end if;
  update billing.payment_events
     set status = p_status, last_error = left(p_error, 300), user_id = coalesce(p_user_id, user_id),
         processed_at = case when p_status = 'failed' then null else now() end
   where provider = p_provider and provider_event_id = p_event_id;
  if not found then raise exception 'EVENT_NOT_CLAIMED'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Kunde <-> Nutzer. Ein Kunde gehoert genau einem Nutzer, ein Nutzer hat je
-- Anbieter genau einen Kunden. Jeder Widerspruch ist ein Fehler, nie ein
-- stilles Umhaengen.
-- ---------------------------------------------------------------------------
create function public.billing_link_customer(p_user_id uuid, p_provider public.billing_provider, p_customer_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  owner uuid;
  current_customer text;
begin
  if p_user_id is null then raise exception 'USER_REQUIRED'; end if;
  select user_id into owner from billing.customers where provider = p_provider and provider_customer_id = p_customer_id;
  if found then
    if owner is distinct from p_user_id then raise exception 'CUSTOMER_USER_MISMATCH'; end if;
    return;
  end if;
  select provider_customer_id into current_customer from billing.customers where provider = p_provider and user_id = p_user_id;
  if found then raise exception 'USER_HAS_OTHER_CUSTOMER'; end if;
  insert into billing.customers (user_id, provider, provider_customer_id) values (p_user_id, p_provider, p_customer_id);
end $$;

create function public.billing_customer_for_user(p_user_id uuid, p_provider public.billing_provider)
returns text language sql stable security definer set search_path = '' as $$
  select provider_customer_id from billing.customers where user_id = p_user_id and provider = p_provider
$$;

-- ---------------------------------------------------------------------------
-- Abo-Zustand uebernehmen. Eingabe ist ein normalisierter Schnappschuss
-- (providers/*-adapter.mjs), immer frisch beim Anbieter abgerufen.
--   * Nutzer kommt aus billing.customers, Metadaten muessen dazu passen
--   * Tarif kommt aus plan_prices, unbekannte Preise werden abgelehnt
--   * Test- und Livemodus muessen zum Preis passen
--   * aeltere Zustaende ueberschreiben nie neuere (provider_state_at)
-- ---------------------------------------------------------------------------
create function public.billing_apply_subscription(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_provider public.billing_provider := (p ->> 'provider')::public.billing_provider;
  v_state_at timestamptz := (p ->> 'state_at')::timestamptz;
  v_livemode boolean := coalesce((p ->> 'livemode')::boolean, false);
  v_user uuid;
  v_claimed uuid := nullif(p ->> 'claimed_user_id', '')::uuid;
  v_price public.plan_prices%rowtype;
  v_existing public.subscriptions%rowtype;
  v_id uuid;
  v_duplicate boolean;
begin
  if v_state_at is null then raise exception 'STATE_AT_REQUIRED'; end if;
  select user_id into v_user from billing.customers
   where provider = v_provider and provider_customer_id = p ->> 'provider_customer_id';
  if not found then raise exception 'CUSTOMER_NOT_LINKED'; end if;
  -- Geloeschtes Konto (user_id null): pseudonym speichern, niemand bekommt Zugang.
  if v_claimed is not null and v_user is not null and v_user <> v_claimed then raise exception 'SUBSCRIPTION_USER_MISMATCH'; end if;

  select * into v_price from public.plan_prices where provider = v_provider and provider_price_id = p ->> 'provider_price_id';
  if not found then raise exception 'UNKNOWN_PRICE'; end if;
  if v_price.livemode <> v_livemode then raise exception 'LIVEMODE_MISMATCH'; end if;

  select * into v_existing from public.subscriptions
   where provider = v_provider and provider_subscription_id = p ->> 'provider_subscription_id' for update;
  if found and v_existing.provider_state_at > v_state_at then
    return jsonb_build_object('applied', false, 'stale', true, 'subscription_id', v_existing.id,
                              'user_id', v_existing.user_id, 'plan_id', v_existing.plan_id);
  end if;
  if found and v_existing.provider_customer_id is distinct from p ->> 'provider_customer_id' then
    raise exception 'SUBSCRIPTION_CUSTOMER_CHANGED';
  end if;

  insert into public.subscriptions as s (
    user_id, plan_id, price_id, provider, provider_subscription_id, provider_customer_id, status, billing_interval,
    current_period_start, current_period_end, cancel_at_period_end, cancel_at, canceled_at, ended_at, trial_end,
    grace_until, livemode, provider_state_at)
  values (
    v_user, v_price.plan_id, v_price.id, v_provider, p ->> 'provider_subscription_id', p ->> 'provider_customer_id',
    (p ->> 'status')::public.subscription_status, v_price.billing_interval,
    (p ->> 'current_period_start')::timestamptz, (p ->> 'current_period_end')::timestamptz,
    coalesce((p ->> 'cancel_at_period_end')::boolean, false), (p ->> 'cancel_at')::timestamptz,
    (p ->> 'canceled_at')::timestamptz, (p ->> 'ended_at')::timestamptz, (p ->> 'trial_end')::timestamptz,
    (p ->> 'grace_until')::timestamptz, v_livemode, v_state_at)
  on conflict (provider, provider_subscription_id) do update set
    plan_id = excluded.plan_id, price_id = excluded.price_id, status = excluded.status,
    billing_interval = excluded.billing_interval, current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end,
    cancel_at = excluded.cancel_at, canceled_at = excluded.canceled_at, ended_at = excluded.ended_at,
    trial_end = excluded.trial_end, grace_until = excluded.grace_until, provider_state_at = excluded.provider_state_at
  returning s.id into v_id;

  select exists (
    select 1 from public.subscriptions o
     where o.user_id = v_user and o.id <> v_id
       and public.subscription_grants_access(o.status, o.current_period_end, o.grace_until, now())
  ) and public.subscription_grants_access((p ->> 'status')::public.subscription_status,
          (p ->> 'current_period_end')::timestamptz, (p ->> 'grace_until')::timestamptz, now())
    into v_duplicate;

  return jsonb_build_object('applied', true, 'stale', false, 'subscription_id', v_id, 'user_id', v_user,
                            'plan_id', v_price.plan_id, 'duplicate_entitling', v_duplicate);
end $$;

create function public.billing_apply_invoice(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_provider public.billing_provider := (p ->> 'provider')::public.billing_provider;
  v_state_at timestamptz := (p ->> 'state_at')::timestamptz;
  v_user uuid;
  v_sub uuid;
  v_existing_state timestamptz;
  v_id uuid;
begin
  if v_state_at is null then raise exception 'STATE_AT_REQUIRED'; end if;
  select user_id into v_user from billing.customers
   where provider = v_provider and provider_customer_id = p ->> 'provider_customer_id';
  if not found then raise exception 'CUSTOMER_NOT_LINKED'; end if;
  select id into v_sub from public.subscriptions
   where provider = v_provider and provider_subscription_id = p ->> 'provider_subscription_id';

  select provider_state_at into v_existing_state from public.invoices
   where provider = v_provider and provider_invoice_id = p ->> 'provider_invoice_id' for update;
  if found and v_existing_state > v_state_at then
    return jsonb_build_object('applied', false, 'stale', true);
  end if;

  insert into public.invoices as i (
    user_id, subscription_id, provider, provider_invoice_id, number, status, currency, amount_due, amount_paid,
    hosted_invoice_url, invoice_pdf, period_start, period_end, issued_at, paid_at, livemode, provider_state_at)
  values (
    v_user, v_sub, v_provider, p ->> 'provider_invoice_id', p ->> 'number', p ->> 'status', upper(p ->> 'currency'),
    coalesce((p ->> 'amount_due')::integer, 0), coalesce((p ->> 'amount_paid')::integer, 0),
    p ->> 'hosted_invoice_url', p ->> 'invoice_pdf', (p ->> 'period_start')::timestamptz,
    (p ->> 'period_end')::timestamptz, (p ->> 'issued_at')::timestamptz, (p ->> 'paid_at')::timestamptz,
    coalesce((p ->> 'livemode')::boolean, false), v_state_at)
  on conflict (provider, provider_invoice_id) do update set
    subscription_id = coalesce(excluded.subscription_id, i.subscription_id), number = excluded.number,
    status = excluded.status, amount_due = excluded.amount_due, amount_paid = excluded.amount_paid,
    hosted_invoice_url = excluded.hosted_invoice_url, invoice_pdf = excluded.invoice_pdf,
    period_start = excluded.period_start, period_end = excluded.period_end, issued_at = excluded.issued_at,
    paid_at = excluded.paid_at, provider_state_at = excluded.provider_state_at
  returning i.id into v_id;
  return jsonb_build_object('applied', true, 'stale', false, 'invoice_id', v_id, 'user_id', v_user);
end $$;

create function public.billing_record_deletion(p_user_id uuid, p_canceled integer)
returns void language sql security definer set search_path = '' as $$
  insert into billing.account_deletions (user_ref_hash, subscriptions_canceled)
  values (encode(sha256(convert_to(p_user_id::text, 'UTF8')), 'hex'), coalesce(p_canceled, 0))
$$;

create function public.billing_cancellation_request(
  p_user_id uuid, p_email text, p_full_name text, p_reference text, p_kind text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  insert into billing.cancellation_requests (user_id, email, full_name, reference, kind)
    values (p_user_id, lower(btrim(p_email)), nullif(btrim(p_full_name), ''), nullif(btrim(p_reference), ''), p_kind)
    returning id into v_id;
  return v_id;
end $$;

-- Nur der Server darf Zustaende schreiben oder fremde Berechtigungen lesen.
revoke all on function
  public.subscription_grants_access(public.subscription_status, timestamptz, timestamptz, timestamptz),
  public.effective_entitlements(uuid, timestamptz), public.my_entitlements(),
  public.billing_blocking_subscription(uuid),
  public.billing_claim_event(public.billing_provider, text, text, boolean, text),
  public.billing_finish_event(public.billing_provider, text, text, text, uuid),
  public.billing_link_customer(uuid, public.billing_provider, text),
  public.billing_customer_for_user(uuid, public.billing_provider),
  public.billing_apply_subscription(jsonb), public.billing_apply_invoice(jsonb),
  public.billing_record_deletion(uuid, integer),
  public.billing_cancellation_request(uuid, text, text, text, text)
  from public, anon, authenticated;

grant execute on function
  public.subscription_grants_access(public.subscription_status, timestamptz, timestamptz, timestamptz),
  public.effective_entitlements(uuid, timestamptz), public.my_entitlements(),
  public.billing_blocking_subscription(uuid),
  public.billing_claim_event(public.billing_provider, text, text, boolean, text),
  public.billing_finish_event(public.billing_provider, text, text, text, uuid),
  public.billing_link_customer(uuid, public.billing_provider, text),
  public.billing_customer_for_user(uuid, public.billing_provider),
  public.billing_apply_subscription(jsonb), public.billing_apply_invoice(jsonb),
  public.billing_record_deletion(uuid, integer),
  public.billing_cancellation_request(uuid, text, text, text, text)
  to service_role;
grant execute on function public.my_entitlements() to authenticated;
