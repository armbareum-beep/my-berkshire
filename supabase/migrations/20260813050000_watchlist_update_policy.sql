-- watchlist 에 UPDATE 정책이 없다.
--
-- 관심종목 기능은 행을 추가/삭제만 했지 **수정한 적이 없어서** SELECT·INSERT·DELETE 정책만
-- 만들어져 있었다. 그런데 자본배분이 status 컬럼을 얹으면서(20260813030000) 승격이
-- upsert 가 됐고, 기존 행을 만나면 UPDATE 경로를 타 RLS 에 막힌다:
--
--   new row violates row-level security policy (USING expression) for table "watchlist"
--
-- 화면에서 터지던 건 전부 보유 종목이라 서버 액션이 승격 쓰기 자체를 건너뛰는 것으로
-- 이미 고쳤다(#70). 이 정책은 남은 경우 — **미보유인데 관심종목 행이 이미 있는 종목** —
-- 을 위한 것이다.
--
-- USING 과 WITH CHECK 를 **모두** 건다. USING 만 걸면 내 행을 남의 holding_id 로 옮기는
-- 수정이 통과한다(수정 전 행만 검사하므로). WITH CHECK 가 수정 후 행도 내 것인지 본다.

create policy watchlist_update_own on watchlist
  for update
  using (holding_id in (select id from holdings where user_id = auth.uid()))
  with check (holding_id in (select id from holdings where user_id = auth.uid()));

-- 컬럼 설명이 낡았다 — 20260813030000 은 "보유 종목을 후보에서 빼려면 WATCH 행을 만들면
-- 된다"고 적었지만, 그 규칙은 관심종목에 담아둔 보유 주식을 자본배분에서 조용히 지워버려
-- 철회했다(#69). 지금은 **보유 종목이면 status 와 무관하게 늘 후보**이고, 배분에서 빼는 건
-- 목표비중 0 이 한다.
comment on column watchlist.status is
  'APPROVED = 자본배분 후보. 미보유 종목에만 의미가 있다 — 보유 종목은 status 와 무관하게 늘 후보다. 배분 제외는 목표비중 0 으로 한다.';
