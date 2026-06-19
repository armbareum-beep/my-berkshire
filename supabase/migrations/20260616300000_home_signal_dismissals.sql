-- ENUF — 홈 재방문 후크(알림 큐) 디스미스 기록
-- 토스식 "확인하면 다음 알림". 확인한 신호의 안정적 key 를 저장 → 다음 로드에 제외.
-- key 는 날짜·접수번호·분기 스코프라 행이 자연 만료(과거 행은 무해, 매칭 안 됨).
-- holding 단위. RLS: 자기 holding 소속만(watchlist 정책과 동일).

create table home_signal_dismissals (
  id          uuid primary key default gen_random_uuid(),
  holding_id  uuid not null references holdings (id) on delete cascade,
  signal_key  text not null,
  created_at  timestamptz not null default now(),
  unique (holding_id, signal_key)
);
create index home_signal_dismissals_holding_id_idx on home_signal_dismissals (holding_id);
alter table home_signal_dismissals enable row level security;
create policy "home_signal_dismissals_select_own" on home_signal_dismissals
  for select using (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
create policy "home_signal_dismissals_insert_own" on home_signal_dismissals
  for insert with check (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
create policy "home_signal_dismissals_delete_own" on home_signal_dismissals
  for delete using (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
