-- =============================================================================
-- VISION UNIVERSE — Registrierungssperre in der Datenbank (Auth-Hook)
--
-- Der Worker schliesst die Registrierung (VU_REGISTRATION_ENABLED=false,
-- Positivliste). Diese Sperre gilt zusaetzlich fuer jeden, der Supabase Auth
-- direkt anspricht: Supabase ruft vor dem Anlegen eines Kontos
-- public.hook_before_user_created auf (Authentication -> Hooks ->
-- "Before User Created", Postgres-Funktion; setzt der Einrichtungs-Workflow).
-- Offen nur fuer Adressen der Positivliste, bis registration_gate.open = true
-- (Produktionsfreigabe, docs/accounts/LIVE_RELEASE.md).
-- =============================================================================

create table public.registration_gate (
  id         boolean primary key default true check (id),
  open       boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.registration_gate (id, open) values (true, false);

create table public.registration_allowlist (
  email      text primary key check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at timestamptz not null default now()
);

alter table public.registration_gate      enable row level security;
alter table public.registration_allowlist enable row level security;
revoke all on public.registration_gate, public.registration_allowlist from public, anon, authenticated;
grant all on public.registration_gate, public.registration_allowlist to service_role;
grant select on public.registration_gate, public.registration_allowlist to supabase_auth_admin;
create policy registration_gate_auth_admin on public.registration_gate for select to supabase_auth_admin using (true);
create policy registration_allowlist_auth_admin on public.registration_allowlist for select to supabase_auth_admin using (true);

create or replace function public.hook_before_user_created(event jsonb)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_email text := lower(coalesce(event -> 'user' ->> 'email', ''));
begin
  if (select open from public.registration_gate where id)
     or exists (select 1 from public.registration_allowlist where email = v_email) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'REGISTRATION_CLOSED'));
end $$;

revoke all on function public.hook_before_user_created(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;

-- Positivliste setzen (Einrichtungs-Workflow aus VU_ACCOUNT_REGISTRATION_ALLOWLIST).
create or replace function public.registration_set_allowlist(p_emails text[])
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  delete from public.registration_allowlist where email <> all (coalesce(p_emails, '{}'));
  insert into public.registration_allowlist (email)
    select distinct lower(trim(e)) from unnest(coalesce(p_emails, '{}')) e where trim(e) <> ''
  on conflict (email) do nothing;
  select count(*) into v_count from public.registration_allowlist;
  return v_count;
end $$;
revoke all on function public.registration_set_allowlist(text[]) from public, anon, authenticated;
grant execute on function public.registration_set_allowlist(text[]) to service_role;
