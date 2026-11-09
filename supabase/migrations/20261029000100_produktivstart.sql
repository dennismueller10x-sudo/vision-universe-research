-- =============================================================================
-- Produktivstart Free/Pro (Owner-Auftrag 29.10.2026)
--   1 Widerruf (§ 356a BGB) als eigener Vorgangstyp neben der Kuendigung
--   2 Postausgang: Eingangsbestaetigung Widerruf, Vertragsbestaetigung (§ 312f BGB)
--   3 Newsletter-Einwilligung (Double-Opt-in bei Brevo) mit Nachweis
--   4 Abgleich der Konten mit Brevo (Kontaktverwaltung, ohne Werbeerlaubnis)
-- Keine bestehenden Daten werden geaendert; niemand wird Abonnent eines
-- Newsletters, ohne ihn selbst angefordert und per E-Mail bestaetigt zu haben.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 Widerruf: gleicher Eingang wie die Kuendigung (gespeichert, bestaetigt,
--   Bearbeitung durch eine berechtigte Person), immer in die Pruefung.
-- ---------------------------------------------------------------------------
alter table billing.cancellation_requests drop constraint cancellation_requests_kind_check;
alter table billing.cancellation_requests add constraint cancellation_requests_kind_check
  check (kind in ('ordinary', 'extraordinary', 'withdrawal'));

-- ---------------------------------------------------------------------------
-- 2 Postausgang
-- ---------------------------------------------------------------------------
alter table billing.mail_outbox drop constraint mail_outbox_kind_check;
alter table billing.mail_outbox add constraint mail_outbox_kind_check
  check (kind in ('cancellation_receipt', 'cancellation_final', 'ops_alert', 'withdrawal_receipt', 'contract_confirmation'));

create or replace function public.billing_mail_result(p_id uuid, p_result text, p_error text default null)
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
  if v_row.kind in ('cancellation_receipt', 'withdrawal_receipt') and v_row.cancellation_id is not null then
    update billing.cancellation_requests set
      confirmation_status = v_status,
      confirmation_sent_at = case when v_status = 'sent' then now() else confirmation_sent_at end
    where id = v_row.cancellation_id;
  end if;
  return v_status;
end $$;

-- Zuordnung: Widerruf wie ausserordentliche Kuendigung immer in die Pruefung
-- (sofortige Beendigung und anteilige Erstattung entscheidet eine Person).
create or replace function public.billing_propose_cancellation_match(p_id uuid)
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
       and (public.subscription_grants_access(s.status, s.current_period_end, s.grace_until, now())
            or (v_req.kind = 'withdrawal' and s.status = 'incomplete'))
     order by s.updated_at desc limit 1;
  end if;

  if v_user is null or v_subref is null then
    v_status := case when v_req.kind = 'withdrawal' then 'manual_review' else 'no_contract' end;
  else
    v_method := 'email';
    if v_req.reference is not null then
      select exists (select 1 from public.invoices i where i.user_id = v_user and i.number = v_req.reference)
          or v_req.reference = v_subref
        into v_ref_match;
      if v_ref_match then v_method := 'email_and_reference'; end if;
    end if;
    v_status := case when v_req.kind in ('extraordinary', 'withdrawal') or v_provider <> 'stripe' then 'manual_review'
                     else 'pending_assignment' end;
  end if;

  update billing.cancellation_requests set
    status = v_status, match_user_id = v_user, match_provider = v_provider,
    match_subscription_ref = v_subref, match_method = v_method
  where id = p_id;
  return jsonb_build_object('status', v_status, 'method', v_method, 'provider', v_provider, 'plan_id', v_plan);
end $$;

create or replace function public.billing_set_cancellation_match(p_id uuid, p_user uuid, p_operator text)
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
    status = case when kind in ('extraordinary', 'withdrawal') or v_provider <> 'stripe' then 'manual_review' else 'pending_assignment' end,
    note = case when p_operator = 'signed_in' then note else left('manuell zugeordnet: ' || p_operator, 300) end
  where id = p_id and status in ('received', 'pending_assignment', 'manual_review', 'no_contract');
  if not found then raise exception 'CANCELLATION_NOT_OPEN'; end if;
  return jsonb_build_object('provider', v_provider, 'subscription_ref', v_subref);
end $$;

-- Empfaenger der Vertragsbestaetigung: Adresse des Kontos (nur Service).
create function public.billing_account_email(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select email from auth.users where id = p_user and email_confirmed_at is not null
$$;

-- ---------------------------------------------------------------------------
-- 3 Newsletter-Einwilligung. Werbung nur mit bestaetigtem Double-Opt-in
--   (Status "confirmed"); der Nachweis der Bestaetigung (Zeitpunkt, IP) liegt
--   zusaetzlich bei Brevo. Hier: Fassung und Pruefsumme des Einwilligungstexts,
--   Quelle, Zeitpunkte. Abmeldung bei Brevo wird uebernommen.
-- ---------------------------------------------------------------------------
create table billing.marketing_consents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  email         text not null check (char_length(email) between 3 and 254),
  text_version  text not null check (char_length(text_version) between 1 and 40),
  text_sha256   text not null check (text_sha256 ~ '^[0-9a-f]{64}$'),
  source        text not null check (source in ('signup', 'settings')),
  status        text not null default 'requested'
                check (status in ('requested', 'pending', 'confirmed', 'withdrawn', 'expired', 'failed')),
  requested_at  timestamptz not null default now(),
  doi_sent_at   timestamptz,
  confirmed_at  timestamptz,
  withdrawn_at  timestamptz,
  checked_at    timestamptz,
  note          text check (note is null or char_length(note) <= 200)
);
create unique index marketing_consents_one_open on billing.marketing_consents (user_id)
  where status in ('requested', 'pending', 'confirmed');
create index marketing_consents_due on billing.marketing_consents (checked_at nulls first)
  where status in ('requested', 'pending', 'confirmed');
alter table billing.marketing_consents enable row level security;
grant all on billing.marketing_consents to service_role;

-- Werbe-Einwilligung ist nicht mehr direkt schreibbar: der Haken in den Einstellungen
-- spiegelt nur den bestaetigten Stand (gesetzt von billing_newsletter_update).
revoke update (marketing_emails) on public.user_settings from authenticated;

create function public.billing_newsletter_request(p_user uuid, p_source text, p_version text, p_sha text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  v_row billing.marketing_consents%rowtype;
begin
  select email into v_email from auth.users where id = p_user and email_confirmed_at is not null;
  if v_email is null then raise exception 'EMAIL_NOT_CONFIRMED'; end if;
  select * into v_row from billing.marketing_consents
   where user_id = p_user and status in ('requested', 'pending', 'confirmed');
  if found then return to_jsonb(v_row); end if;
  insert into billing.marketing_consents (user_id, email, text_version, text_sha256, source)
  values (p_user, lower(v_email), p_version, p_sha, p_source)
  returning * into v_row;
  return to_jsonb(v_row);
end $$;

-- Arbeitsliste fuer den Cron: (a) Anforderungen aus der Registrierung uebernehmen,
-- sobald die Adresse bestaetigt ist; (b) offene/aktive Einwilligungen mit Brevo abgleichen.
create function public.billing_newsletter_due(p_limit integer default 25, p_version text default null, p_sha text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_version is not null and p_sha is not null then
    insert into billing.marketing_consents (user_id, email, text_version, text_sha256, source, requested_at)
    select u.id, lower(u.email), left(coalesce(u.raw_user_meta_data ->> 'newsletter_version', p_version), 40), p_sha, 'signup',
           coalesce((u.raw_user_meta_data ->> 'newsletter_requested_at')::timestamptz, now())
      from auth.users u
     where u.email_confirmed_at is not null
       and u.raw_user_meta_data ->> 'newsletter_requested_at' is not null
       and (u.raw_user_meta_data ->> 'newsletter_version') = p_version
       and not exists (select 1 from billing.marketing_consents c where c.user_id = u.id)
     on conflict do nothing;
  end if;
  return coalesce((select jsonb_agg(to_jsonb(d)) from (
    select c.id, c.user_id, c.email, c.status, c.requested_at, c.doi_sent_at, c.confirmed_at
      from billing.marketing_consents c
     where c.status in ('requested', 'pending', 'confirmed')
       and (c.checked_at is null
            or (c.status = 'pending' and c.checked_at < now() - interval '5 minutes')
            or c.checked_at < now() - interval '6 hours')
     order by c.checked_at nulls first
     limit greatest(1, least(p_limit, 100))) d), '[]'::jsonb);
end $$;

-- Statuswechsel; spiegelt user_settings.marketing_emails (true nur bei "confirmed").
create function public.billing_newsletter_update(p_id uuid, p_status text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_row billing.marketing_consents%rowtype;
begin
  if p_status not in ('requested', 'pending', 'confirmed', 'withdrawn', 'expired', 'failed') then raise exception 'STATUS_INVALID'; end if;
  update billing.marketing_consents set
    status = p_status,
    checked_at = now(),
    doi_sent_at = case when p_status = 'pending' and doi_sent_at is null then now() else doi_sent_at end,
    confirmed_at = case when p_status = 'confirmed' and confirmed_at is null then now() else confirmed_at end,
    withdrawn_at = case when p_status = 'withdrawn' and withdrawn_at is null then now() else withdrawn_at end,
    note = coalesce(left(p_note, 200), note)
  where id = p_id returning * into v_row;
  if not found then raise exception 'CONSENT_NOT_FOUND'; end if;
  update public.user_settings set marketing_emails = (p_status = 'confirmed') where user_id = v_row.user_id;
  return to_jsonb(v_row);
end $$;

create function public.billing_newsletter_status(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('status', c.status, 'requestedAt', c.requested_at, 'confirmedAt', c.confirmed_at,
                                             'withdrawnAt', c.withdrawn_at, 'textVersion', c.text_version, 'id', c.id)
                     from billing.marketing_consents c where c.user_id = p_user
                    order by c.requested_at desc limit 1),
                  jsonb_build_object('status', 'none'))
$$;

-- ---------------------------------------------------------------------------
-- 4 Brevo-Kontaktverwaltung (Zweck: Vertrags- und Servicekommunikation,
--   Art. 6 Abs. 1 lit. b DSGVO; keine Werbeerlaubnis). Datenminimierung:
--   Adresse und Tarif. Geloeschte Konten werden bei Brevo entfernt.
-- ---------------------------------------------------------------------------
create table billing.brevo_contacts (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  state      text not null,
  synced_at  timestamptz not null default now(),
  last_error text check (last_error is null or char_length(last_error) <= 200)
);
create table billing.brevo_jobs (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('remove')),
  email      text not null check (char_length(email) between 3 and 254),
  created_at timestamptz not null default now(),
  attempts   integer not null default 0,
  last_error text check (last_error is null or char_length(last_error) <= 200)
);
alter table billing.brevo_contacts enable row level security;
alter table billing.brevo_jobs enable row level security;
grant all on billing.brevo_contacts, billing.brevo_jobs to service_role;

-- Konto geloescht (gleich welcher Weg): Kontakt bei Brevo entfernen (Auftrag fuer den Cron).
create function billing.queue_brevo_removal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.email is not null then
    insert into billing.brevo_jobs (kind, email) values ('remove', lower(old.email));
  end if;
  return old;
end $$;
create trigger on_auth_user_deleted_brevo after delete on auth.users
  for each row execute function billing.queue_brevo_removal();

-- Adresse geaendert: alte Adresse entfernen, die neue wird regulaer abgeglichen.
create function billing.queue_brevo_email_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.email is distinct from new.email and old.email is not null then
    insert into billing.brevo_jobs (kind, email) values ('remove', lower(old.email));
  end if;
  return new;
end $$;
create trigger on_auth_user_email_changed_brevo after update of email on auth.users
  for each row execute function billing.queue_brevo_email_change();

-- Konten, deren Stand bei Brevo nicht aktuell ist (Adresse|Tarif).
create function public.billing_brevo_pending(p_limit integer default 50)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) from (
    select u.id as user_id, lower(u.email) as email, x.plan_id as plan, lower(u.email) || '|' || x.plan_id as state
      from auth.users u
      cross join lateral (select coalesce(public.effective_entitlements(u.id) ->> 'plan_id', 'free') as plan_id) x
      left join billing.brevo_contacts b on b.user_id = u.id
     where u.email_confirmed_at is not null and u.email is not null
       and (b.user_id is null or b.state <> lower(u.email) || '|' || x.plan_id)
     order by u.created_at
     limit greatest(1, least(p_limit, 200))) d
$$;

create function public.billing_brevo_mark(p_user uuid, p_email text, p_state text, p_error text default null)
returns void language sql security definer set search_path = '' as $$
  insert into billing.brevo_contacts (user_id, email, state, synced_at, last_error)
  values (p_user, lower(p_email), case when p_error is null then p_state else 'error' end, now(), left(p_error, 200))
  on conflict (user_id) do update set email = excluded.email, state = excluded.state, synced_at = now(), last_error = excluded.last_error
$$;

create function public.billing_brevo_jobs_due(p_limit integer default 50)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(j) order by j.created_at), '[]'::jsonb) from (
    select id, kind, email, attempts, created_at from billing.brevo_jobs
     where attempts < 10 order by created_at limit greatest(1, least(p_limit, 200))) j
$$;

create function public.billing_brevo_job_done(p_id uuid, p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_error is null then delete from billing.brevo_jobs where id = p_id;
  else update billing.brevo_jobs set attempts = attempts + 1, last_error = left(p_error, 200) where id = p_id;
  end if;
end $$;

-- Rechte: alle neuen Funktionen nur fuer den Service.
revoke all on function public.billing_account_email(uuid), public.billing_newsletter_request(uuid, text, text, text),
  public.billing_newsletter_due(integer, text, text), public.billing_newsletter_update(uuid, text, text),
  public.billing_newsletter_status(uuid), public.billing_brevo_pending(integer), public.billing_brevo_mark(uuid, text, text, text),
  public.billing_brevo_jobs_due(integer), public.billing_brevo_job_done(uuid, text) from public, anon, authenticated;
grant execute on function public.billing_account_email(uuid), public.billing_newsletter_request(uuid, text, text, text),
  public.billing_newsletter_due(integer, text, text), public.billing_newsletter_update(uuid, text, text),
  public.billing_newsletter_status(uuid), public.billing_brevo_pending(integer), public.billing_brevo_mark(uuid, text, text, text),
  public.billing_brevo_jobs_due(integer), public.billing_brevo_job_done(uuid, text) to service_role;
revoke all on function billing.queue_brevo_removal(), billing.queue_brevo_email_change() from public, anon, authenticated;
