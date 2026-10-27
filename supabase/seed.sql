-- =============================================================================
-- VISION UNIVERSE — supabase/seed.sql (NUR Entwicklung / lokale Tests)
--
-- Preise im Stripe-TESTMODUS. Die IDs hier sind Platzhalter fuer die lokale
-- Simulation. Im Entwicklungsprojekt werden sie durch die echten Test-Price-IDs
-- ersetzt (docs/accounts/SETUP.md, Schritt S5). Betraege sind ein Vorschlag
-- und eine Owner-Entscheidung. livemode = false: der Server lehnt jede
-- Abo-Zuordnung ab, deren Modus nicht zum Preis passt.
-- =============================================================================

insert into public.plan_prices (id, plan_id, provider, provider_price_id, billing_interval, currency, unit_amount, livemode)
values
  ('plus_month', 'plus', 'stripe', 'price_test_plus_month', 'month', 'EUR',   990, false),
  ('plus_year',  'plus', 'stripe', 'price_test_plus_year',  'year',  'EUR',  9900, false),
  ('pro_month',  'pro',  'stripe', 'price_test_pro_month',  'month', 'EUR',  1990, false),
  ('pro_year',   'pro',  'stripe', 'price_test_pro_year',   'year',  'EUR', 19900, false)
on conflict (id) do nothing;
