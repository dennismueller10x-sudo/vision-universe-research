-- =============================================================================
-- VISION UNIVERSE — Kuendigungen: Zuordnung, Bearbeitung, zuverlaessige Bestaetigung
--
-- Grundsatz (§ 312k BGB): Eine Kuendigung ohne Anmeldung ist mit dem Eingang
-- wirksam abgegeben. Die Pruefung hier entscheidet NICHT ueber ihre
-- Wirksamkeit, sondern nur darueber, WELCHEM Vertrag sie zugeordnet wird und
-- wer die Ausfuehrung bei Stripe ausloest:
--   * Zuordnungsvorschlag automatisch und nur lesend (Adresse, ggf. Rechnungs-
--     oder Abo-Nummer) -> Status pending_assignment
--   * Ausfuehrung durch eine berechtigte Person (scripts/account/cancellations.mjs),
--     solange VU_CANCELLATION_AUTO_PROCESS=false gilt
--   * Frist: unverzueglich, Ueberwachung ab 24 Stunden
--
-- Bestaetigungen laufen ueber einen Postausgang (billing.mail_outbox): jede
-- E-Mail wird VOR dem Versand gespeichert, Fehlschlaege werden mit steigendem
-- Abstand wiederholt, nach 8 Versuchen als "dead" markiert und gemeldet.
-- =============================================================================

alter table billing.cancellation_requests
  add column match_user_id uuid references auth.users (id) on delete set null,
  add column match_provider public.billing_provider,
  add column match_subscription_ref text check (match_subscription_ref is null or char_length(match_subscription_ref) <= 255),
  add column match_method text check (match_method in ('signed_in', 'email', 'email_and_reference', 'manual', 'none')),
  add column due_at timestamptz,
  add column processed_by text check (processed_by is null or char_length(processed_by) <= 120),
  add column processed_at timestamptz;

update billing.cancellation_requests set due_at = requested_at + interval '24 hours' where due_at is null;
alter table billing.cancellation_requests alter column due_at set default now() + interval '24 hours';
alter table billing.cancellation_requests alter column due_at set not null;

alter table billing.cancellation_requests drop constraint cancellation_requests_status_check;
alter table billing.cancellation_requests add constraint cancellation_requests_status_check
  check (status in ('received', 'pending_assignment', 'completed', 'manual_review', 'no_contract'));

alter table billing.cancellation_requests drop constraint cancellation_requests_confirmation_status_check;
alter table billing.cancellation_requests add constraint cancellation_requests_confirmation_status_check
  check (confirmation_status in ('pending', 'sent', 'failed', 'dead', 'not_configured', 'dropped'));

-- ---------------------------------------------------------------------------
-- Postausgang. dedupe_key verhindert doppelte Nachrichten (z. B. ein
-- Betriebsalarm je Stunde, eine Abschlussbestaetigung je Kuendigung).
-- ---------------------------------------------------------------------------
create table billing.mail_outbox (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('cancellation_receipt', 'cancellation_final', 'ops_alert')),
  cancellation_id uuid references billing.cancellation_requests (id) on delete cascade,
  to_email        text not null check (char_length(to_email) between 3 and 254),
  payload         jsonb not null default '{}'::jsonb,
  dedupe_key      text unique,
  status          text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'dead', 'not_configured', 'dropped')),
  attempts        integer not null default 0,
  last_error      text check (last_error is null or char_length(last_error) <= 300),
  next_attempt_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);
create index mail_outbox_due on billing.mail_outbox (next_attempt_at) where status in ('pending', 'sending', 'failed', 'not_configured');
alter table billing.mail_outbox enable row level security;
grant all on billing.mail_outbox to service_role;

-- Abstand der Wiederholungen: 1, 5, 15, 30, 60, 120, 240 Minuten, danach dead.
create function billing.mail_backoff(p_attempts integer)
returns interval language sql immutable set search_path = '' as $$
  select (array[1, 5, 15, 30, 60, 120, 240])[least(greatest(p_attempts, 1), 7)] * interval '1 minute'
$$;

create function public.billing_enqueue_mail(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  insert into billing.mail_outbox (kind, cancellation_id, to_email, payload, dedupe_key)
  values (p ->> 'kind', nullif(p ->> 'cancellation_id', '')::uuid, lower(btrim(p ->> 'to_email')),
          coalesce(p -> 'payload', '{}'::jsonb), nullif(p ->> 'dedupe_key', ''))
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from billing.mail_outbox where dedupe_key = p ->> 'dedupe_key';
  end if;
  return v_id;
end $$;

-- Faellige Nachrichten holen und fuer 5 Minuten belegen (kein Doppelversand
-- durch parallele Laeufe von Worker-Cron und Betriebsskript).
create function public.billing_claim_due_mails(p_limit integer default 20)
returns jsonb language sql security definer set search_path = '' as $$
  with due as (
    select id from billing.mail_outbox
     where status in ('pending', 'failed', 'not_configured', 'sending') and next_attempt_at <= now()
     order by next_attempt_at
     limit greatest(1, least(p_limit, 100))
     for update skip locked
  ), claimed as (
    update billing.mail_outbox o set status = 'sending', next_attempt_at = now() + interval '5 minutes'
      from due where o.id = due.id
    returning o.id, o.kind, o.cancellation_id, o.to_email, o.payload, o.attempts
  )
  select coalesce(jsonb_agg(to_jsonb(claimed)), '[]'::jsonb) from claimed
$$;

-- Ergebnis eines Versandversuchs. Spiegelt den Stand der Eingangsbestaetigung
-- in billing.cancellation_requests.confirmation_status.
create function public.billing_mail_result(p_id uuid, p_result text, p_error text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_row billing.mail_outbox%rowtype;
  v_status text;
begin
  if p_result not in ('sent', 'failed', 'not_configured') then raise exception 'MAIL_RESULT_INVALID'; end if;
  select * into v_row from billing.mail_outbox where id = p_id for update;
  if not found then raise exception 'MAIL_NOT_FOUND'; end if;
  v_status := case
    when p_result = 'sent' then 'sent'
    when v_row.attempts + 1 >= 8 then 'dead'
    else p_result end;
  update billing.mail_outbox set
    status = v_status, attempts = attempts + 1, last_error = left(p_error, 300),
    sent_at = case when v_status = 'sent' then now() else sent_at end,
    next_attempt_at = case when v_status in ('failed', 'not_configured') then now() + billing.mail_backoff(attempts + 1)
                           else next_attempt_at end
  where id = p_id;
  if v_row.kind = 'cancellation_receipt' and v_row.cancellation_id is not null then
    update billing.cancellation_requests set
      confirmation_status = v_status,
      confirmation_sent_at = case when v_status = 'sent' then now() else confirmation_sent_at end
    where id = v_row.cancellation_id;
  end if;
  return v_status;
end $$;

-- ---------------------------------------------------------------------------
-- Zuordnungsvorschlag (nur lesend gegenueber Abos). Staerkste Stufe zuerst:
--   email_and_reference  Adresse + Rechnungsnummer oder Abo-Kennung des Kontos
--   email                Adresse eines Kontos mit gueltigem Abo
-- Ausserordentliche Kuendigungen und Store-Abos gehen immer in die Pruefung.
-- ---------------------------------------------------------------------------
create function public.billing_propose_cancellation_match(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_req billing.cancellation_requests%rowtype;
  v_user uuid;
  v_provider public.billing_provider;
  v_subref text;
  v_plan text;
  v_ref_match boolean := false;
  v_status text;
  v_method text := 'none';
begin
  select * into v_req from billing.cancellation_requests where id = p_id for update;
  if not found then raise exception 'CANCELLATION_NOT_FOUND'; end if;
  if v_req.status not in ('received') then
    return jsonb_build_object('status', v_req.status, 'method', v_req.match_method);
  end if;

  select id into v_user from auth.users where lower(email) = v_req.email limit 1;
  if v_user is not null then
    select s.provider, s.provider_subscription_id, s.plan_id into v_provider, v_subref, v_plan
      from public.subscriptions s
     where s.user_id = v_user
       and public.subscription_grants_access(s.status, s.current_period_end, s.grace_until, now())
     order by s.updated_at desc limit 1;
  end if;

  if v_user is null or v_subref is null then
    v_status := 'no_contract';
  else
    v_method := 'email';
    if v_req.reference is not null then
      select exists (select 1 from public.invoices i where i.user_id = v_user and i.number = v_req.reference)
          or v_req.reference = v_subref
        into v_ref_match;
      if v_ref_match then v_method := 'email_and_reference'; end if;
    end if;
    v_status := case when v_req.kind = 'extraordinary' or v_provider <> 'stripe' then 'manual_review'
                     else 'pending_assignment' end;
  end if;

  update billing.cancellation_requests set
    status = v_status, match_user_id = v_user, match_provider = v_provider,
    match_subscription_ref = v_subref, match_method = v_method
  where id = p_id;
  return jsonb_build_object('status', v_status, 'method', v_method, 'provider', v_provider, 'plan_id', v_plan);
end $$;

-- Ein Vorgang vollstaendig (fuer Bearbeitung und E-Mail-Inhalt).
create function public.billing_cancellation_get(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  -- match_account_email: Adresse des zugeordneten Kontos. Weicht sie von der
  -- angegebenen ab, wird der Kontoinhaber zusaetzlich benachrichtigt.
  select to_jsonb(c) || jsonb_build_object('match_plan_id',
           (select s.plan_id from public.subscriptions s where s.provider = c.match_provider
             and s.provider_subscription_id = c.match_subscription_ref),
           'match_account_email', (select u.email from auth.users u where u.id = c.match_user_id))
    from billing.cancellation_requests c where c.id = p_id
$$;

-- Zuordnung von Hand (Bearbeiter hat den Vertrag anders ermittelt, z. B. ueber
-- eine Rueckfrage). Uebernimmt das aktuell gueltige Abo des Kontos.
create function public.billing_set_cancellation_match(p_id uuid, p_user uuid, p_operator text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_provider public.billing_provider;
  v_subref text;
begin
  if coalesce(btrim(p_operator), '') = '' then raise exception 'OPERATOR_REQUIRED'; end if;
  select s.provider, s.provider_subscription_id into v_provider, v_subref
    from public.subscriptions s
   where s.user_id = p_user and public.subscription_grants_access(s.status, s.current_period_end, s.grace_until, now())
   order by s.updated_at desc limit 1;
  if v_subref is null then raise exception 'NO_ACTIVE_SUBSCRIPTION'; end if;
  update billing.cancellation_requests set
    match_user_id = p_user, match_provider = v_provider, match_subscription_ref = v_subref,
    match_method = case when p_operator = 'signed_in' then 'signed_in' else 'manual' end,
    status = case when kind = 'extraordinary' or v_provider <> 'stripe' then 'manual_review' else 'pending_assignment' end,
    note = case when p_operator = 'signed_in' then note else left('manuell zugeordnet: ' || p_operator, 300) end
  where id = p_id and status in ('received', 'pending_assignment', 'manual_review', 'no_contract');
  if not found then raise exception 'CANCELLATION_NOT_OPEN'; end if;
  return jsonb_build_object('provider', v_provider, 'subscription_ref', v_subref);
end $$;

-- Arbeitsliste fuer die Bearbeitung (ohne Klartext-Grund in Listen).
create function public.billing_cancellation_queue(p_limit integer default 50)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(q) order by q.requested_at), '[]'::jsonb) from (
    select c.id, c.requested_at, c.due_at, c.source, c.kind, c.status, c.email, c.full_name, c.reference,
           c.match_method, c.match_provider, c.match_subscription_ref, c.match_user_id is not null as has_match,
           c.confirmation_status, (c.due_at < now()) as overdue
      from billing.cancellation_requests c
     where c.status in ('received', 'pending_assignment', 'manual_review')
     order by c.requested_at limit greatest(1, least(p_limit, 200))) q
$$;

-- Zustand fuer Ueberwachung (Worker-Cron, Betriebsskript, Gesundheitsabfrage).
create function public.billing_cancellation_health()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'open', (select count(*) from billing.cancellation_requests where status in ('received', 'pending_assignment', 'manual_review')),
    'overdue', (select count(*) from billing.cancellation_requests
                 where status in ('received', 'pending_assignment', 'manual_review') and due_at < now()),
    'mails_unsent_30min', (select count(*) from billing.mail_outbox
                 where status not in ('sent', 'dropped') and kind <> 'ops_alert' and created_at < now() - interval '30 minutes'),
    'mails_dead', (select count(*) from billing.mail_outbox where status = 'dead' and kind <> 'ops_alert'),
    'oldest_open', (select min(requested_at) from billing.cancellation_requests
                     where status in ('received', 'pending_assignment', 'manual_review')))
$$;

-- Bearbeiter und Zeitpunkt festhalten (ersetzt die Fassung aus 20261026000100).
create or replace function public.billing_update_cancellation(p_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update billing.cancellation_requests set
    status = coalesce(p ->> 'status', status),
    user_id = coalesce(nullif(p ->> 'user_id', '')::uuid, user_id),
    provider = coalesce((p ->> 'provider')::public.billing_provider, provider),
    subscription_ref = coalesce(p ->> 'subscription_ref', subscription_ref),
    ends_at = coalesce((p ->> 'ends_at')::timestamptz, ends_at),
    confirmation_status = coalesce(p ->> 'confirmation_status', confirmation_status),
    confirmation_sent_at = case when p ->> 'confirmation_status' = 'sent' then now() else confirmation_sent_at end,
    completed_at = case when p ->> 'status' = 'completed' then now() else completed_at end,
    note = coalesce(left(p ->> 'note', 300), note),
    processed_by = coalesce(left(nullif(p ->> 'processed_by', ''), 120), processed_by),
    processed_at = case when nullif(p ->> 'processed_by', '') is not null then now() else processed_at end
  where id = p_id;
  if not found then raise exception 'CANCELLATION_NOT_FOUND'; end if;
end $$;

-- Nicht zugestellte Bestaetigungen nachbearbeiten (Betrieb):
--   retry  erneut einstellen (nach behobener Ursache: Absender, Schluessel, Adresse)
--   drop   endgueltig aufgeben, mit Begruendung (z. B. Adresse existiert nicht);
--          zaehlt danach nicht mehr als offen.
-- p_cancellation null = alle nicht zugestellten. Liefert die Anzahl.
create function public.billing_resolve_mails(p_cancellation uuid, p_action text, p_operator text, p_note text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if coalesce(btrim(p_operator), '') = '' then raise exception 'OPERATOR_REQUIRED'; end if;
  if p_action not in ('retry', 'drop') then raise exception 'ACTION_INVALID'; end if;
  if p_action = 'drop' and coalesce(btrim(p_note), '') = '' then raise exception 'NOTE_REQUIRED'; end if;
  with hit as (
    update billing.mail_outbox m set
      status = case when p_action = 'retry' then 'pending' else 'dropped' end,
      attempts = case when p_action = 'retry' then 0 else attempts end,
      next_attempt_at = now(),
      last_error = case when p_action = 'drop' then left(p_operator || ': ' || p_note, 300) else last_error end
    where m.status in ('dead', 'failed', 'not_configured') and m.kind <> 'ops_alert'
      and (p_cancellation is null or m.cancellation_id = p_cancellation)
    returning m.kind, m.cancellation_id, m.status),
  mirror as (
    update billing.cancellation_requests c set confirmation_status = h.status
      from hit h where h.kind = 'cancellation_receipt' and c.id = h.cancellation_id
    returning c.id)
  select count(*) into v_count from hit;
  return v_count;
end $$;

revoke all on function billing.mail_backoff(integer) from public, anon, authenticated;
revoke all on function public.billing_enqueue_mail(jsonb), public.billing_claim_due_mails(integer),
  public.billing_mail_result(uuid, text, text), public.billing_propose_cancellation_match(uuid),
  public.billing_cancellation_queue(integer), public.billing_cancellation_health(),
  public.billing_cancellation_get(uuid), public.billing_set_cancellation_match(uuid, uuid, text),
  public.billing_resolve_mails(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function billing.mail_backoff(integer) to service_role;
grant execute on function public.billing_enqueue_mail(jsonb), public.billing_claim_due_mails(integer),
  public.billing_mail_result(uuid, text, text), public.billing_propose_cancellation_match(uuid),
  public.billing_cancellation_queue(integer), public.billing_cancellation_health(),
  public.billing_cancellation_get(uuid), public.billing_set_cancellation_match(uuid, uuid, text),
  public.billing_resolve_mails(uuid, text, text, text)
  to service_role;
