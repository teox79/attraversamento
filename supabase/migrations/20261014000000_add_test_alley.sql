-- Dedicated non-personal alley record for testing the QR scanning flow.
insert into public.alleys (qr_token, name, is_active)
values (
  '00000000-0000-4000-8000-000000000001',
  'Vicolo di prova',
  true
)
on conflict (qr_token) do update
set name = excluded.name,
    is_active = excluded.is_active;
