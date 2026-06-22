-- KIS 종목마스터 인덱스 — 한글 종목검색용.
-- 출처: 한국투자증권 공개 종목마스터(kospi_code.mst / kosdaq_code.mst / {mkt}mst.cod).
-- scripts/syncKisMaster.ts 가 일 1회 동기화한다(KIS 토큰 불필요, 공개 다운로드).
create table kis_security_master (
  symbol      text primary key,        -- 내부심볼: 국내 6자리 / 해외 티커
  name_ko     text not null,           -- 한글명(검색 핵심)
  name_en     text,                    -- 영문명(해외)
  exchange    text,                    -- 국내 KOSPI/KOSDAQ, 해외 NAS/NYS/AMS …
  market      text not null,           -- 'KR' | 'US'
  asset_type  text,                    -- STOCK/ETF 등(가능 시)
  source_date date,
  fetched_at  timestamptz not null default now()
);

create index kis_security_master_name_ko_idx on kis_security_master (name_ko);
create index kis_security_master_market_idx on kis_security_master (market);

alter table kis_security_master enable row level security;

-- 공용 참조 데이터: 로그인 사용자는 읽기, 쓰기는 service_role.
create policy "kis_security_master_select_authed" on kis_security_master
  for select using (auth.uid() is not null);
