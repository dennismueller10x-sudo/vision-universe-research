-- Supertrader: Methoden folgen (supertrader_follows) und Aktien melden (watchlist_items.alerts.SUPERTRADER_SIGNAL):
-- Pruefregeln, RLS, Grenze 50, Loeschung mit dem Konto, erster Blick auf einen Kandidatenstand und Zustellung
-- der Stufen-Meldungen ueber push_claim_daily (nur mit eingeschalteter Art, hoechstens eine Nachricht am Tag).
begin;
select tests.create_user('st-mia@example.test') as mia \gset
select tests.create_user('st-ole@example.test') as ole \gset

-- ---------------------------------------------------------------- Folgen
select tests.authenticate(:'mia');
select tests.eq(public.supertrader_follow('SF_MINERVINI_SEPA_VCP')->>'state', 'FOLLOWED', 'folgen');
select tests.eq(public.supertrader_follow('SF_MINERVINI_SEPA_VCP')->>'state', 'ALREADY_FOLLOWING', 'idempotent');
select tests.eq((select count(*)::int from public.supertrader_follows), 1, 'eine Zeile');
select tests.throws($$select public.supertrader_follow('MINERVINI')$$, 'STRATEGY_INVALID');
select tests.throws($$select public.supertrader_follow(null)$$, 'STRATEGY_INVALID');
select tests.throws($$insert into public.supertrader_follows (strategy_id) values ('sf_klein')$$, 'supertrader_follows_strategy_id_check');
select tests.throws($$insert into public.supertrader_follows (user_id, strategy_id) values ('$$ || :'ole' || $$', 'SF_TURTLE_S1')$$, 'SUPERTRADER_FOLLOW_NOT_OWNED');
select tests.throws($$update public.supertrader_follows set strategy_id = 'SF_TURTLE_S1'$$, 'permission denied');

select tests.authenticate(:'ole');
select tests.eq((select count(*)::int from public.supertrader_follows), 0, 'RLS: Ole sieht Mias Methoden nicht');
select tests.eq(public.supertrader_unfollow('SF_MINERVINI_SEPA_VCP'), 0, 'fremde Zeile bleibt');
select public.supertrader_follow('SF_TURTLE_S1');

select tests.anon();
select tests.throws($$select * from public.supertrader_follows$$, 'permission denied');
select tests.throws($$select public.supertrader_follow('SF_TURTLE_S1')$$, 'permission denied');

-- Grenze 50 je Konto
select tests.service();
insert into public.supertrader_follows (user_id, strategy_id)
  select :'mia', 'SF_GRENZE_' || g from generate_series(1, 49) g;
select tests.authenticate(:'mia');
select tests.throws($$select public.supertrader_follow('SF_TURTLE_S2')$$, 'SUPERTRADER_FOLLOWS_LIMIT_REACHED');
select tests.service();
delete from public.supertrader_follows where user_id = :'mia' and strategy_id like 'SF_GRENZE_%';
select tests.authenticate(:'mia');
select tests.eq(public.supertrader_unfollow('SF_MINERVINI_SEPA_VCP'), 1, 'entfolgen');
select public.supertrader_follow('SF_MINERVINI_SEPA_VCP');

-- ---------------------------------------------------------------- erster Blick auf einen Kandidatenstand
select tests.authenticate(:'mia');
select tests.throws($$select public.supertrader_stage_seen(current_date)$$, 'permission denied');
select tests.throws($$select * from public.supertrader_stage_runs$$, 'permission denied');
select tests.service();
select tests.eq(public.supertrader_stage_seen(current_date - 1), now(), 'erster Blick = jetzt');
update public.supertrader_stage_runs set seen_at = now() - interval '2 days';
select tests.eq(public.supertrader_stage_seen(current_date - 1), now() - interval '2 days', 'bleibt beim ersten Blick');
select tests.throws($$select public.supertrader_stage_seen(current_date - 60)$$, 'AS_OF_INVALID');
select tests.throws($$select public.supertrader_stage_seen(null)$$, 'AS_OF_INVALID');

-- ---------------------------------------------------------------- Zustellung
-- Mia: Geraet, folgt Minervini VCP, meldet NVDA (Watchlist mit Ticker). Ole: Geraet, folgt Turtle 20.
select tests.authenticate(:'mia');
select public.push_register('token_miaaaaaaaaaaaaaaaaaaa', 'ios');
select public.watchlist_add('vu_abc123', 'NVDA');
select tests.authenticate(:'ole');
select public.push_register('token_oleeeeeeeeeeeeeeeeeee', 'android');
select tests.service();

-- Ereignisse wie push.mjs#stageEvents: kind ST_STAGE, ohne instrumentId.
create temp table st_ev as select
  jsonb_build_object('eventId','ev_00000000000000a1','kind','ST_STAGE','type','SUPERTRADER_SIGNAL','subtype','STAGE_REACHED',
    'stage','CONFIRMED_RESEARCH_SETUP','strategyId','SF_MINERVINI_SEPA_VCP','ticker','AAPL','occurredAt',now()) as reached_rule,
  jsonb_build_object('eventId','ev_00000000000000a2','kind','ST_STAGE','type','SUPERTRADER_SIGNAL','subtype','STAGE_REACHED',
    'stage','CHART_CANDIDATE','strategyId','SF_MINERVINI_SEPA_VCP','ticker','MSFT','occurredAt',now()) as reached_pattern,
  jsonb_build_object('eventId','ev_00000000000000a3','kind','ST_STAGE','type','SUPERTRADER_SIGNAL','subtype','STAGE_LEFT',
    'stage',null,'stageBefore','MODELED_TRADE_PLAN','strategyId','SF_DARVAS_BOX','ticker','NVDA','occurredAt',now()) as left_nvda,
  jsonb_build_object('eventId','ev_00000000000000a4','kind','ST_STAGE','type','SUPERTRADER_SIGNAL','subtype','STAGE_REACHED',
    'stage','MODELED_TRADE_PLAN','strategyId','SF_TURTLE_S1','ticker','TSLA','occurredAt',now() - interval '25 hours') as stale;
grant select on st_ev to service_role;

-- Ohne eingeschaltete Art im Konto: nichts.
select tests.eq(jsonb_array_length(public.push_claim_daily((select jsonb_build_array(reached_rule, left_nvda) from st_ev))), 0, 'Art aus: kein Push');
update public.user_settings set notification_settings = '{"SUPERTRADER_SIGNAL":true}' where user_id in (:'mia', :'ole');
-- Gefolgte Methode nur ab „Regel erfuellt“; veraltete Meldung zaehlt nicht; Ole folgt Turtle, das Ereignis ist alt.
select tests.eq(jsonb_array_length(public.push_claim_daily((select jsonb_build_array(reached_pattern, stale) from st_ev))), 0, 'Muster erkannt allein meldet keine gefolgte Methode');
-- Gemeldeter Titel, aber Eintrag schaltet die Art aus: nur die gefolgte Methode zaehlt.
update public.watchlist_items set alerts = '{"SUPERTRADER_SIGNAL":false}' where user_id = :'mia';
select tests.eq((select (c->>'count')::int from jsonb_array_elements(public.push_claim_daily((select jsonb_build_array(reached_rule, reached_pattern, left_nvda) from st_ev))) c),
  1, 'Eintrag aus: nur die Methode');
delete from public.push_daily_claims;
update public.watchlist_items set alerts = '{"SUPERTRADER_SIGNAL":true}' where user_id = :'mia';
select tests.eq((select c - 'token' from jsonb_array_elements(public.push_claim_daily((select jsonb_build_array(reached_rule, reached_pattern, left_nvda) from st_ev))) c),
  '{"count": 2, "stage": 2, "ids": ["ev_00000000000000a1", "ev_00000000000000a3"]}'::jsonb, 'Methode und gemeldete Aktie, ein gebuendelter Push');
select tests.eq(jsonb_array_length(public.push_claim_daily((select jsonb_build_array(reached_rule, left_nvda) from st_ev))), 0, 'einmal am Tag');
-- Bisherige Watchlist-Ereignisse bleiben zustellbar (instrumentId).
delete from public.push_daily_claims;
select tests.eq((select c - 'token' from jsonb_array_elements(public.push_claim_daily(jsonb_build_array(jsonb_build_object(
  'eventId','ev_0123456789abcdef','instrumentId','vu_abc123','type','SUPERTRADER_SIGNAL','occurredAt',now())))) c),
  '{"count": 1, "stage": 0, "ids": ["ev_0123456789abcdef"]}'::jsonb, 'Watchlist-Ereignis wie bisher');

-- ---------------------------------------------------------------- Loeschung mit dem Konto
reset role;
delete from auth.users where id = :'mia';
select tests.eq((select count(*)::int from public.supertrader_follows where user_id = :'mia'), 0, 'mit dem Konto geloescht');
select tests.eq((select count(*)::int from public.supertrader_follows where user_id = :'ole'), 1, 'Oles Methode bleibt');
rollback;
