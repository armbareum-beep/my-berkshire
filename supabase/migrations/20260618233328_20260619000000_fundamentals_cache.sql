create table fundamentals_cache (
  symbol      text not null,
  year        integer not null,
  fs_div      text not null,
  data        jsonb not null,
  fetched_at  timestamptz not null default now(),
  primary key (symbol, year, fs_div)
);

alter table fundamentals_cache enable row level security;

create policy "fundamentals_cache_select_all" on fundamentals_cache
  for select using (auth.uid() is not null);

create policy "fundamentals_cache_insert_all" on fundamentals_cache
  for insert with check (auth.uid() is not null);

create policy "fundamentals_cache_update_all" on fundamentals_cache
  for update using (auth.uid() is not null)
  with check (auth.uid() is not null);;
