-- Katalog: oeffentlich lesbar, nie vom Browser schreibbar.
begin;
select tests.create_user('carol@example.test') as carol \gset

select tests.anon();
select tests.eq((select string_agg(id, ',' order by rank) from public.plans), 'free,pro', 'anon sieht free und pro (plus verborgen)');
select tests.eq((select count(*) from public.plan_prices where plan_id = 'plus')::int, 2, 'anon sieht preise');
select tests.eq((select count(*) from public.plan_features where plan_id = 'pro' and feature_key = 'watchlist.items')::int, 1, 'features lesbar');
select tests.throws($$insert into public.plans (id, name, rank) values ('gratis', 'Gratis', 99)$$, 'permission denied');
select tests.throws($$update public.plan_prices set unit_amount = 0$$, 'permission denied');
reset role;

select tests.authenticate(:'carol');
select tests.throws($$update public.plan_prices set unit_amount = 1$$, 'permission denied');
select tests.throws($$insert into public.plan_features (plan_id, feature_key) values ('free', 'export.csv')$$, 'permission denied');
select tests.throws($$delete from public.plans$$, 'permission denied');
reset role;

-- Inaktive Preise und nicht oeffentliche Tarife sind unsichtbar.
insert into public.plans (id, name, rank, is_public) values ('intern', 'Intern', 99, false);
update public.plan_prices set active = false where id = 'pro_year';
select tests.anon();
select tests.eq((select count(*) from public.plans where id = 'intern')::int, 0, 'interner tarif unsichtbar');
select tests.eq((select count(*) from public.plan_prices where id = 'pro_year')::int, 0, 'inaktiver preis unsichtbar');
reset role;

-- Ein aktiver Preis je Tarif/Anbieter/Laufzeit/Modus.
select tests.throws($$insert into public.plan_prices (id, plan_id, provider, provider_price_id, billing_interval, currency, unit_amount)
  values ('plus_month_2', 'plus', 'stripe', 'price_test_other', 'month', 'EUR', 100)$$, 'plan_prices_one_active');
rollback;
