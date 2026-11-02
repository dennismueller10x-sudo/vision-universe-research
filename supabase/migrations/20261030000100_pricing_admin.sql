-- Tarifverwaltung (Preise ohne Deployment, docs/accounts/TARIFVERWALTUNG.md).
--
-- * Rolle pricing_admin: darf Preise im Konto-Worker aendern. Vergeben wird sie nie von einem Konto selbst
--   (user_roles ist fuer Nutzer nur lesbar), sondern nur ueber den Service bzw. eine Owner-Aktion.
-- * billing.price_changes: Audit-Log jeder Preisaenderung (wer, wann, alt, neu, Stripe-Preis, Ergebnis) und
--   Schutz vor doppelter Ausfuehrung (change_id eindeutig).
-- * Eine Aenderung legt eine NEUE aktive Zeile in plan_prices an; die alte bleibt (inaktiv) erhalten, damit
--   bestehende Abos und ihre Stripe-Ereignisse weiter ihrem Tarif zugeordnet werden (billing_apply_subscription
--   sucht nach provider_price_id, subscriptions.price_id verweist auf die alte Zeile). Bestehende Abos behalten
--   ihren Preis.
-- Alle Funktionen nur fuer service_role (Worker mit Secret Key).

alter type public.app_role add value if not exists 'pricing_admin';

create table billing.price_changes (
  id                    uuid primary key default gen_random_uuid(),
  change_id             text not null unique check (change_id ~ '^pc_[a-f0-9]{32}$'),
  admin_user_id         uuid references auth.users (id) on delete set null,
  plan_price_id         text not null references public.plan_prices (id),
  old_provider_price_id text not null,
  old_amount            integer not null,
  new_amount            integer not null check (new_amount between 50 and 99999),
  new_plan_price_id     text,
  new_provider_price_id text,
  status                text not null default 'started' check (status in ('started', 'stripe_created', 'applied', 'failed')),
  error                 text,
  created_at            timestamptz not null default now(),
  finished_at           timestamptz
);
alter table billing.price_changes enable row level security;
revoke all on billing.price_changes from public, anon, authenticated;
grant select, insert, update on billing.price_changes to service_role;

-- Uebersicht fuer die Verwaltung: Tarife mit aktiven und frueheren Preisen, Zahl laufender Abos je Preis,
-- letzte Aenderungen. Nur Zahlen und IDs, keine Kundendaten.
create function public.billing_pricing_overview(p_livemode boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'prices', coalesce((select jsonb_agg(jsonb_build_object(
        'id', pp.id, 'plan_id', pp.plan_id, 'provider', pp.provider, 'provider_price_id', pp.provider_price_id,
        'interval', pp.billing_interval, 'currency', pp.currency, 'unit_amount', pp.unit_amount, 'active', pp.active,
        'created_at', pp.created_at,
        'subscribers', (select count(*) from public.subscriptions s where s.price_id = pp.id
                         and s.status in ('active', 'trialing', 'past_due')))
        order by pp.plan_id, pp.active desc, pp.created_at desc)
      from public.plan_prices pp where pp.livemode = p_livemode), '[]'::jsonb),
    'changes', coalesce((select jsonb_agg(jsonb_build_object(
        'change_id', c.change_id, 'plan_price_id', c.plan_price_id, 'old_amount', c.old_amount, 'new_amount', c.new_amount,
        'new_plan_price_id', c.new_plan_price_id, 'status', c.status, 'error', c.error, 'created_at', c.created_at,
        'finished_at', c.finished_at) order by c.created_at desc)
      from (select * from billing.price_changes order by created_at desc limit 20) c), '[]'::jsonb));
$$;

-- Aenderung anmelden (idempotent je change_id). Der Preis muss noch der aktuelle sein (gleichzeitige Aenderung).
create function public.billing_price_change_begin(p_change_id text, p_admin uuid, p_plan_price_id text,
  p_old_provider_price_id text, p_new_amount integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_price public.plan_prices%rowtype; v_row billing.price_changes%rowtype;
begin
  select * into v_row from billing.price_changes where change_id = p_change_id;
  if found then
    if v_row.admin_user_id is distinct from p_admin or v_row.plan_price_id <> p_plan_price_id or v_row.new_amount <> p_new_amount then
      raise exception 'CHANGE_ID_REUSED';
    end if;
    return to_jsonb(v_row);
  end if;
  select * into v_price from public.plan_prices where id = p_plan_price_id for update;
  if not found or not v_price.active or v_price.provider <> 'stripe' then raise exception 'PRICE_NOT_ACTIVE'; end if;
  if v_price.provider_price_id <> p_old_provider_price_id then raise exception 'PRICE_CHANGED'; end if;
  if v_price.unit_amount = p_new_amount then raise exception 'PRICE_UNCHANGED'; end if;
  if exists (select 1 from billing.price_changes where plan_price_id = p_plan_price_id and status in ('started', 'stripe_created')
             and created_at > now() - interval '15 minutes') then
    raise exception 'CHANGE_IN_PROGRESS';
  end if;
  insert into billing.price_changes (change_id, admin_user_id, plan_price_id, old_provider_price_id, old_amount, new_amount)
  values (p_change_id, p_admin, p_plan_price_id, v_price.provider_price_id, v_price.unit_amount, p_new_amount)
  returning * into v_row;
  return to_jsonb(v_row);
end $$;

create function public.billing_price_change_stripe(p_change_id text, p_new_provider_price_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update billing.price_changes set new_provider_price_id = p_new_provider_price_id, status = 'stripe_created'
   where change_id = p_change_id and status in ('started', 'stripe_created');
  if not found then raise exception 'CHANGE_NOT_OPEN'; end if;
end $$;

-- Neuen Preis aktivieren: alte Zeile inaktiv (bleibt fuer bestehende Abos), neue aktive Zeile. Eine Transaktion.
create function public.billing_price_change_apply(p_change_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row billing.price_changes%rowtype; v_old public.plan_prices%rowtype; v_new_id text;
begin
  select * into v_row from billing.price_changes where change_id = p_change_id for update;
  if not found then raise exception 'CHANGE_NOT_FOUND'; end if;
  if v_row.status = 'applied' then return to_jsonb(v_row); end if;
  if v_row.status <> 'stripe_created' or v_row.new_provider_price_id is null then raise exception 'CHANGE_NOT_READY'; end if;
  select * into v_old from public.plan_prices where id = v_row.plan_price_id for update;
  if not v_old.active or v_old.provider_price_id <> v_row.old_provider_price_id then raise exception 'PRICE_CHANGED'; end if;
  v_new_id := left(regexp_replace(v_old.plan_id || '_' || v_old.billing_interval || case when v_old.livemode then '_live' else '' end, '[^a-z0-9_]', '', 'g'), 30)
    || '_' || to_char(now() at time zone 'UTC', 'YYYYMMDD') || '_' || substr(p_change_id, 4, 6);
  update public.plan_prices set active = false where id = v_old.id;
  insert into public.plan_prices (id, plan_id, provider, provider_price_id, billing_interval, currency, unit_amount, livemode, active)
  values (v_new_id, v_old.plan_id, v_old.provider, v_row.new_provider_price_id, v_old.billing_interval, v_old.currency,
          v_row.new_amount, v_old.livemode, true);
  update billing.price_changes set status = 'applied', new_plan_price_id = v_new_id, finished_at = now(), error = null
   where change_id = p_change_id returning * into v_row;
  return to_jsonb(v_row);
end $$;

create function public.billing_price_change_failed(p_change_id text, p_error text)
returns void language sql security definer set search_path = '' as $$
  update billing.price_changes set status = case when status = 'stripe_created' then status else 'failed' end,
    error = left(p_error, 200), finished_at = case when status = 'stripe_created' then null else now() end
   where change_id = p_change_id and status <> 'applied';
$$;

revoke all on function public.billing_pricing_overview(boolean), public.billing_price_change_begin(text, uuid, text, text, integer),
  public.billing_price_change_stripe(text, text), public.billing_price_change_apply(text), public.billing_price_change_failed(text, text)
  from public, anon, authenticated;
grant execute on function public.billing_pricing_overview(boolean), public.billing_price_change_begin(text, uuid, text, text, integer),
  public.billing_price_change_stripe(text, text), public.billing_price_change_apply(text), public.billing_price_change_failed(text, text)
  to service_role;
