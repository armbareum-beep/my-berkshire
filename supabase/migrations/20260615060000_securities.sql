-- securities — 종목 마스터(이름 보관 + 향후 태그 기반 리밸런싱의 토대).
--
-- 왜 필요한가
--  · events 는 symbol(코드)만 저장 → 카탈로그에 없는 검색 종목은 화면에 코드만 노출됨.
--  · 검색으로 임의 종목을 살 수 있게 하려면 종목명을 어딘가 보관해야 한다.
--
-- 설계
--  · 공용 참조 테이블(개인 데이터 아님) → 인증 사용자는 전체 read, upsert 가능.
--  · country/sector/asset_type 칼럼을 미리 둔다 → 국가/산업/유형별 리밸런싱(다단계)의 태그가 곧 이 칼럼들.
--  · 시세는 저장하지 않는다(시세=외부 API). 이름·분류 같은 거의 안 변하는 메타만.
create table securities (
  symbol      text primary key,
  name        text not null,
  exchange    text,            -- 예: KSC(KOSPI), KOQ(KOSDAQ), NMS(나스닥)
  country     text,            -- 향후 국가별 리밸런싱 태그
  sector      text,            -- 향후 산업별 리밸런싱 태그
  asset_type  text,            -- 향후 유형별(주식/ETF/리츠 등) 리밸런싱 태그
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger securities_set_updated_at
  before update on securities
  for each row execute function set_updated_at();
alter table securities enable row level security;
-- 종목 메타는 민감 정보가 아니므로 인증 사용자에게 전체 공개(공용 카탈로그).
create policy "securities_select_authed" on securities
  for select using (auth.uid() is not null);
create policy "securities_insert_authed" on securities
  for insert with check (auth.uid() is not null);
create policy "securities_update_authed" on securities
  for update using (auth.uid() is not null) with check (auth.uid() is not null);
