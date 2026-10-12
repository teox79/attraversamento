-- Passo Sicuro: minimal, pseudonymous schema for QR-based crossing requests.
-- No names, phone numbers, emails, free-text notes, or precise location are stored.

create type public.device_role as enum ('anziano', 'volontario');
create type public.crossing_status as enum (
  'in_attesa',
  'in_arrivo',
  'completata',
  'annullata'
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  role public.device_role not null,
  created_at timestamptz not null default now()
);

comment on table public.devices is
  'Anonymous Supabase Auth identity mapped to one installation and one application role.';

create table public.alleys (
  id uuid primary key default gen_random_uuid(),
  qr_token uuid not null unique default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint alleys_name_not_blank check (length(trim(name)) > 0)
);

comment on column public.alleys.qr_token is
  'Opaque QR lookup token. It identifies an alley and must not contain personal data.';

create table public.crossing_requests (
  id uuid primary key default gen_random_uuid(),
  alley_id uuid not null references public.alleys (id) on delete restrict,
  requester_device_id uuid not null references public.devices (id) on delete restrict,
  assigned_volunteer_device_id uuid references public.devices (id) on delete restrict,
  status public.crossing_status not null default 'in_attesa',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  constraint crossing_request_timestamps_check check (
    (accepted_at is null or accepted_at >= created_at)
    and (completed_at is null or (accepted_at is not null and completed_at >= accepted_at))
    and (cancelled_at is null or cancelled_at >= created_at)
  )
);

comment on table public.crossing_requests is
  'Pseudonymous request lifecycle. Device IDs are random references, with no profile details.';

create index crossing_requests_waiting_idx
  on public.crossing_requests (created_at desc)
  where status = 'in_attesa';
create index crossing_requests_alley_created_idx
  on public.crossing_requests (alley_id, created_at desc);
create index crossing_requests_requester_idx
  on public.crossing_requests (requester_device_id, created_at desc);
create index crossing_requests_volunteer_idx
  on public.crossing_requests (assigned_volunteer_device_id, created_at desc)
  where assigned_volunteer_device_id is not null;

-- These SECURITY DEFINER helpers expose only the caller's own device mapping.
create function public.current_device_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.id
  from public.devices as d
  where d.auth_user_id = (select auth.uid())
$$;

create function public.current_device_role()
returns public.device_role
language sql
stable
security definer
set search_path = ''
as $$
  select d.role
  from public.devices as d
  where d.auth_user_id = (select auth.uid())
$$;

revoke all on function public.current_device_id() from public, anon;
revoke all on function public.current_device_role() from public, anon;
grant execute on function public.current_device_id() to authenticated;
grant execute on function public.current_device_role() to authenticated;

-- Store the role chosen on the application's opening screen. Once registered,
-- a device keeps its role; a repeated matching call is idempotent.
create function public.register_device(p_role public.device_role)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := (select auth.uid());
  v_device_id uuid;
  v_current_role public.device_role;
begin
  if v_auth_user_id is null then
    raise exception 'Autenticazione richiesta' using errcode = '42501';
  end if;

  insert into public.devices (auth_user_id, role)
  values (v_auth_user_id, p_role)
  on conflict (auth_user_id) do nothing;

  select d.id, d.role
    into v_device_id, v_current_role
  from public.devices as d
  where d.auth_user_id = v_auth_user_id;

  if v_current_role is distinct from p_role then
    raise exception 'Dispositivo già registrato con il ruolo %', v_current_role
      using errcode = '23505';
  end if;

  return v_device_id;
end;
$$;

revoke all on function public.register_device(public.device_role) from public, anon;
grant execute on function public.register_device(public.device_role) to authenticated;

alter table public.devices enable row level security;
alter table public.alleys enable row level security;
alter table public.crossing_requests enable row level security;

create policy "devices_read_own_mapping"
  on public.devices for select to authenticated
  using (auth_user_id = (select auth.uid()));

create policy "alleys_read_active_for_qr_lookup"
  on public.alleys for select to anon, authenticated
  using (is_active);

create policy "crossing_requests_read_by_volunteers_or_participants"
  on public.crossing_requests for select to authenticated
  using (
    (
      public.current_device_role() = 'volontario'
      and (
        status = 'in_attesa'
        or assigned_volunteer_device_id = public.current_device_id()
      )
    )
    or requester_device_id = public.current_device_id()
  );

grant select on public.devices to authenticated;
grant select on public.alleys to anon, authenticated;
grant select on public.crossing_requests to authenticated;

-- Resolve the QR token and create a request atomically. The client cannot
-- choose a requester ID, alley ID, status, or timestamp.
create function public.request_crossing(p_qr_token uuid)
returns public.crossing_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device_id uuid := public.current_device_id();
  v_alley_id uuid;
  v_request public.crossing_requests;
begin
  if public.current_device_role() is distinct from 'anziano'::public.device_role then
    raise exception 'Solo un dispositivo anziano può richiedere un attraversamento'
      using errcode = '42501';
  end if;

  select a.id into v_alley_id
  from public.alleys as a
  where a.qr_token = p_qr_token
    and a.is_active;

  if v_alley_id is null then
    raise exception 'QR code non valido o vicolo non attivo'
      using errcode = '22023';
  end if;

  insert into public.crossing_requests (alley_id, requester_device_id)
  values (v_alley_id, v_device_id)
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function public.request_crossing(uuid) from public, anon;
grant execute on function public.request_crossing(uuid) to authenticated;

-- Claim and completion are atomic RPCs so a volunteer cannot overwrite
-- another request's alley, requester, or timestamps through a broad UPDATE.
create function public.claim_crossing_request(p_request_id uuid)
returns public.crossing_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device_id uuid := public.current_device_id();
  v_request public.crossing_requests;
begin
  if public.current_device_role() is distinct from 'volontario'::public.device_role then
    raise exception 'Solo un volontario può accettare una richiesta'
      using errcode = '42501';
  end if;

  update public.crossing_requests as r
  set status = 'in_arrivo',
      assigned_volunteer_device_id = v_device_id,
      accepted_at = now()
  where r.id = p_request_id
    and r.status = 'in_attesa'
  returning r.* into v_request;

  if not found then
    raise exception 'Richiesta non disponibile' using errcode = 'P0002';
  end if;

  return v_request;
end;
$$;

create function public.complete_crossing_request(p_request_id uuid)
returns public.crossing_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device_id uuid := public.current_device_id();
  v_request public.crossing_requests;
begin
  if public.current_device_role() is distinct from 'volontario'::public.device_role then
    raise exception 'Solo un volontario può completare una richiesta'
      using errcode = '42501';
  end if;

  update public.crossing_requests as r
  set status = 'completata',
      completed_at = now()
  where r.id = p_request_id
    and r.status = 'in_arrivo'
    and r.assigned_volunteer_device_id = v_device_id
  returning r.* into v_request;

  if not found then
    raise exception 'Richiesta non assegnata a questo volontario'
      using errcode = 'P0002';
  end if;

  return v_request;
end;
$$;

create function public.cancel_crossing_request(p_request_id uuid)
returns public.crossing_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device_id uuid := public.current_device_id();
  v_request public.crossing_requests;
begin
  if public.current_device_role() is distinct from 'anziano'::public.device_role then
    raise exception 'Solo il dispositivo richiedente può annullare una richiesta'
      using errcode = '42501';
  end if;

  update public.crossing_requests as r
  set status = 'annullata',
      cancelled_at = now()
  where r.id = p_request_id
    and r.requester_device_id = v_device_id
    and r.status = 'in_attesa'
  returning r.* into v_request;

  if not found then
    raise exception 'Richiesta non annullabile' using errcode = 'P0002';
  end if;

  return v_request;
end;
$$;

revoke all on function public.claim_crossing_request(uuid) from public, anon;
revoke all on function public.complete_crossing_request(uuid) from public, anon;
revoke all on function public.cancel_crossing_request(uuid) from public, anon;
grant execute on function public.claim_crossing_request(uuid) to authenticated;
grant execute on function public.complete_crossing_request(uuid) to authenticated;
grant execute on function public.cancel_crossing_request(uuid) to authenticated;

-- Aggregate-only views: no device IDs or request IDs are exposed.
-- They use the owner context so aggregate counts cover all requests while
-- the underlying crossing_requests table remains protected by RLS.
create view public.crossing_stats_by_alley as
select
  a.id as alley_id,
  a.name as alley_name,
  count(r.id)::bigint as total_requests,
  count(r.id) filter (where r.status = 'completata')::bigint as completed_requests,
  count(r.id) filter (where r.status = 'in_attesa')::bigint as waiting_requests,
  count(r.id) filter (where r.status = 'in_arrivo')::bigint as in_progress_requests,
  count(r.id) filter (where r.status = 'annullata')::bigint as cancelled_requests,
  round(
    avg(extract(epoch from (r.completed_at - r.created_at)))
      filter (where r.status = 'completata')
  ) as avg_completion_seconds
from public.alleys as a
left join public.crossing_requests as r on r.alley_id = a.id
group by a.id, a.name;

create view public.crossing_daily_stats_by_alley as
select
  a.id as alley_id,
  a.name as alley_name,
  (r.created_at at time zone 'Europe/Rome')::date as crossing_date,
  count(r.id)::bigint as total_requests,
  count(r.id) filter (where r.status = 'completata')::bigint as completed_requests,
  count(r.id) filter (where r.status = 'annullata')::bigint as cancelled_requests
from public.alleys as a
join public.crossing_requests as r on r.alley_id = a.id
group by a.id, a.name, (r.created_at at time zone 'Europe/Rome')::date;

grant select on public.crossing_stats_by_alley to authenticated;
grant select on public.crossing_daily_stats_by_alley to authenticated;

-- Postgres Changes emits each new request to connected volunteer clients.
-- RLS above limits request-row visibility to volunteers and participants.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'crossing_requests'
  ) then
    execute 'alter publication supabase_realtime add table public.crossing_requests';
  end if;
end;
$$;
