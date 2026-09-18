-- Separate family records. No legacy tables or accounts are changed.
create table public.family_vault (
  id text primary key check (id = 'family'),
  data jsonb not null,
  revision uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now()
);
alter table public.family_vault enable row level security;
revoke all on public.family_vault from anon, authenticated;
grant select, insert, update on public.family_vault to service_role;

create table public.family_login_limits (
  key text primary key,
  window_start timestamptz not null,
  attempts integer not null
);
alter table public.family_login_limits enable row level security;
revoke all on public.family_login_limits from anon, authenticated;

-- Atomic, persistent rate limits work across concurrent server instances.
create or replace function public.family_allow_login(client_key text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer; total integer; t timestamptz := clock_timestamp();
begin
  delete from public.family_login_limits where window_start < t - interval '1 day';
  insert into public.family_login_limits as l values ('global', t, 1)
  on conflict (key) do update set
    attempts = case when l.window_start < t - interval '15 minutes' then 1 else l.attempts + 1 end,
    window_start = case when l.window_start < t - interval '15 minutes' then t else l.window_start end
  returning attempts into total;
  insert into public.family_login_limits as l values ('ip:' || client_key, t, 1)
  on conflict (key) do update set
    attempts = case when l.window_start < t - interval '15 minutes' then 1 else l.attempts + 1 end,
    window_start = case when l.window_start < t - interval '15 minutes' then t else l.window_start end
  returning attempts into n;
  return n <= 5 and total <= 30;
end $$;
revoke all on function public.family_allow_login(text) from public, anon, authenticated;
grant execute on function public.family_allow_login(text) to service_role;
