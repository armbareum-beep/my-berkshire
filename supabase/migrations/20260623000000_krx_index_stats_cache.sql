-- 한국 지수 밸류에이션 캐시 (KRX Playwright 배치 싱크)
-- 대상: ^KS11 (코스피), ^KQ11 (코스닥)
create table if not exists krx_index_stats_cache (
  symbol          text primary key,   -- '^KS11' | '^KQ11'
  per             numeric,
  pbr             numeric,
  eps             numeric,
  dividend_yield  numeric,            -- 소수 (0.022 = 2.2%)
  listed_count    integer,
  synced_at       timestamptz not null default now()
);

-- 공개 시장 데이터 — 사용자 귀속 없음, anon read 허용
alter table krx_index_stats_cache enable row level security;
create policy "anon_read" on krx_index_stats_cache
  for select using (true);
