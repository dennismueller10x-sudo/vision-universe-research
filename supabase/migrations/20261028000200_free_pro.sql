-- =============================================================================
-- VISION UNIVERSE — Tarife Free und Pro (Owner-Entscheidung 28.10.2026)
--
--   * Zwei oeffentliche Tarife: free (0 EUR) und pro (Einfuehrungspreis 1,00 EUR/Monat,
--     Live-Preis traegt scripts/account/stripe-live-setup.mjs in plan_prices ein).
--   * Beide Tarife haben vorerst DENSELBEN Funktionsumfang (freier Early Access).
--     Die Watchlist-Grenzen liegen so hoch, dass Free im Early Access nicht einschraenkt.
--   * quant.screener.full (Quant-Gesamtscore), supertrader.signals (unveroeffentlichte
--     Signale), alerts.push und export.csv sind in KEINEM Tarif enthalten. Die Funktionen
--     bleiben im Katalog definiert, damit spaetere Varianten nur plan_features aendern.
--   * plus wird weder angezeigt noch verkauft (is_public = false, active = false). Die Zeile
--     bleibt, damit Historie und Fremdschluessel gueltig bleiben; sie bekommt denselben
--     Umfang, damit ein Alt-Abo nie weniger erlaubt als Free.
--   * Rolle billing_tester: nur sie darf den Live-Checkout nutzen, solange der Worker
--     VU_CHECKOUT_ACCESS = "testers" hat. Vergabe nur ueber den Service (Ops-Lauf);
--     Nutzer duerfen user_roles weiterhin nur lesen.
--
-- Spaetere Varianten (vorbereitet, NICHT aktiv; je eigener PR mit Vorher/Nachher):
--   A  eingeschraenktes Free + volles Pro: plan_features von free verkleinern, Pro-Funktionen
--      (z. B. quant.screener.full) nur bei pro eintragen.
--   B  nur Pro: free behaelt nur Konto/Watchlist-Grundumfang oder keinen; Registrierung bleibt.
--   C  freier Early Access laeuft weiter: dieser Stand (free = pro).
--   Ein Wechsel loescht nie Daten: ueber einer Grenze kommt nur nichts Neues hinzu
--   (watchlist_add / Trigger in 20261025000400 und 20261028000100).
-- =============================================================================

alter type public.app_role add value if not exists 'billing_tester';

update public.plans set name = 'Free', description = 'Kostenloser Zugang zu allen freigegebenen Funktionen. Keine Zahlungsdaten nötig.'
 where id = 'free';
update public.plans set name = 'Pro', description = 'Derselbe Funktionsumfang wie Free. Mit Pro unterstützt du Vision Universe zum Einführungspreis.'
 where id = 'pro';
update public.plans set is_public = false, active = false where id = 'plus';

delete from public.plan_features where plan_id in ('free', 'plus', 'pro');
insert into public.plan_features (plan_id, feature_key, limit_value)
select p.plan_id, f.feature_key, f.limit_value
  from (values ('free'), ('plus'), ('pro')) as p (plan_id)
 cross join (values ('watchlist.lists', 25), ('watchlist.items', 500), ('ask.daily_questions', 3)) as f (feature_key, limit_value);
