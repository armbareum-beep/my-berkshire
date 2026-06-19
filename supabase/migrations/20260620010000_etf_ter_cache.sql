create table etf_ter_cache (
  symbol       text primary key,
  name         text not null,
  ter          numeric(12, 8) not null check (ter >= 0 and ter < 1),
  source_date  date not null,
  fetched_at   timestamptz not null default now()
);

alter table etf_ter_cache enable row level security;

-- Public reference data: signed-in users may read it, while writes use service_role.
create policy "etf_ter_cache_select_authed" on etf_ter_cache
  for select using (auth.uid() is not null);
