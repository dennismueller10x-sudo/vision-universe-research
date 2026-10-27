-- =============================================================================
-- VISION UNIVERSE — Kuendigungsbutton (§ 312k BGB): Inhalt, Zuordnung, Bestaetigung
--
-- Jede Kuendigung (angemeldet oder ohne Anmeldung) wird mit ihrem Inhalt,
-- dem Eingangszeitpunkt und - sobald bekannt - dem Beendigungszeitpunkt
-- gespeichert. Die Bestaetigung in Textform (E-Mail) wird mit ihrem Ergebnis
-- festgehalten, damit der Betrieb nicht zugestellte Bestaetigungen nachholt.
-- =============================================================================

alter table billing.cancellation_requests
  add column source text not null default 'public' check (source in ('signed_in', 'public')),
  add column reason text check (reason is null or char_length(reason) <= 500),
  add column requested_end_at timestamptz,
  add column provider public.billing_provider,
  add column subscription_ref text check (subscription_ref is null or char_length(subscription_ref) <= 255),
  add column ends_at timestamptz,
  add column confirmation_status text not null default 'pending'
    check (confirmation_status in ('pending', 'sent', 'failed', 'not_configured')),
  add column confirmation_sent_at timestamptz,
  add column note text check (note is null or char_length(note) <= 300);

alter table billing.cancellation_requests drop constraint cancellation_requests_status_check;
alter table billing.cancellation_requests add constraint cancellation_requests_status_check
  check (status in ('received', 'completed', 'manual_review', 'no_contract'));

create index cancellation_requests_open on billing.cancellation_requests (requested_at)
  where status in ('received', 'manual_review') or confirmation_status <> 'sent';

drop function public.billing_cancellation_request(uuid, text, text, text, text);

-- Eingang speichern (Inhalt der Erklaerung + Eingangszeitpunkt aus der Datenbankuhr).
create function public.billing_record_cancellation(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_row billing.cancellation_requests%rowtype;
begin
  insert into billing.cancellation_requests (user_id, email, full_name, reference, kind, reason, requested_end_at, source)
  values (nullif(p ->> 'user_id', '')::uuid, lower(btrim(p ->> 'email')), nullif(btrim(p ->> 'full_name'), ''),
          nullif(btrim(p ->> 'reference'), ''), p ->> 'kind', nullif(btrim(p ->> 'reason'), ''),
          (p ->> 'requested_end_at')::timestamptz, coalesce(p ->> 'source', 'public'))
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'requested_at', v_row.requested_at);
end $$;

-- Ergebnis der Zuordnung und der Bestaetigung nachtragen.
create function public.billing_update_cancellation(p_id uuid, p jsonb)
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
    note = coalesce(left(p ->> 'note', 300), note)
  where id = p_id;
  if not found then raise exception 'CANCELLATION_NOT_FOUND'; end if;
end $$;

-- Konto zu einer E-Mail-Adresse (nur Server; nie an den Client).
create function public.billing_user_by_email(p_email text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1
$$;

revoke all on function public.billing_record_cancellation(jsonb), public.billing_update_cancellation(uuid, jsonb),
  public.billing_user_by_email(text) from public, anon, authenticated;
grant execute on function public.billing_record_cancellation(jsonb), public.billing_update_cancellation(uuid, jsonb),
  public.billing_user_by_email(text) to service_role;
