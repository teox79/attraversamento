-- A volunteer can receive requests without sharing any personal contact data.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  expiration_time timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_https check (endpoint like 'https://%'),
  constraint push_subscriptions_keys_nonblank check (
    length(trim(p256dh)) > 0 and length(trim(auth_secret)) > 0
  )
);

comment on table public.push_subscriptions is
  'Browser push endpoints for volunteer devices. Endpoints and encryption keys are sensitive routing credentials.';

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon, authenticated;

create function public.register_volunteer_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_expiration_time timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := (select auth.uid());
begin
  if v_auth_user_id is null then
    raise exception 'Autenticazione richiesta' using errcode = '42501';
  end if;

  if public.current_device_role() is distinct from 'volontario'::public.device_role then
    raise exception 'Solo i volontari possono attivare le notifiche push'
      using errcode = '42501';
  end if;

  if p_endpoint is null or p_endpoint not like 'https://%'
    or p_p256dh is null or length(trim(p_p256dh)) = 0
    or p_auth is null or length(trim(p_auth)) = 0 then
    raise exception 'Sottoscrizione push non valida' using errcode = '22023';
  end if;

  insert into public.push_subscriptions (
    auth_user_id, endpoint, p256dh, auth_secret, expiration_time, updated_at
  ) values (
    v_auth_user_id, p_endpoint, p_p256dh, p_auth, p_expiration_time, now()
  )
  on conflict (auth_user_id) do update set
    endpoint = excluded.endpoint,
    p256dh = excluded.p256dh,
    auth_secret = excluded.auth_secret,
    expiration_time = excluded.expiration_time,
    updated_at = now();
end;
$$;

revoke all on function public.register_volunteer_push_subscription(text, text, text, timestamptz)
  from public, anon;
grant execute on function public.register_volunteer_push_subscription(text, text, text, timestamptz)
  to authenticated;
