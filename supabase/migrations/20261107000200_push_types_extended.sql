-- Z4: weitere zustellbare Ereignisarten (Erzeuger build-watchlist-events, Regel 1.2.0–1.5.0, #1572/#1575):
-- PRICE_MOVE (Tagesbewegung ab 5 %), FUND_13F (neue 13F-Meldung), ELLIOTT_CHANGE (Elliott-Lesart). EARNINGS war schon
-- erlaubt. Konto-Einstellung (user_settings.notification_settings) und Eintrag (watchlist_items.alerts) kennen dieselben
-- Schluessel wie workers/vu-account/src/validate.mjs bzw. watchlist.mjs. Nur Erweiterung: bestehende Zeilen bleiben gueltig.
alter table public.user_settings drop constraint user_settings_notifications_shape;
alter table public.user_settings add constraint user_settings_notifications_shape check (
  jsonb_typeof(notification_settings) = 'object'
  and notification_settings - array['WATCHLIST_NEWS', 'EARNINGS', 'PRICE_EVENT', 'SUPERTRADER_SIGNAL',
                                    'QUANT_CHANGE', 'MARKET_REGIME_CHANGE', 'PRICE_MOVE', 'FUND_13F', 'ELLIOTT_CHANGE'] = '{}'::jsonb
);

create or replace function public.watchlist_alerts_valid(p jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from jsonb_each(p) e
        where e.key not in ('PRICE_EVENT', 'SUPERTRADER_SIGNAL', 'QUANT_CHANGE', 'WATCHLIST_NEWS', 'EARNINGS',
                            'PRICE_MOVE', 'FUND_13F', 'ELLIOTT_CHANGE')
           or jsonb_typeof(e.value) <> 'boolean')
$$;
