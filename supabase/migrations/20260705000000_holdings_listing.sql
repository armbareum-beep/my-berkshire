-- 랭킹 참가를 "상장(IPO)" 옵트인으로 전환(036) — 방문만으로 자동 등록되던 걸 명시적 동의로.
-- listed_at=null(미상장/폐지) 이 아니면 랭킹 upsert 대상(앱 게이트 rankingSync.ts + 아래 RLS 이중 방어).

ALTER TABLE holdings
  ADD COLUMN IF NOT EXISTS listed_at DATE,        -- 현재 상장 상태(null=미상장/폐지)
  ADD COLUMN IF NOT EXISTS first_listed_at DATE,  -- 최초 상장일(불변, 연혁용 — 폐지에도 유지)
  ADD COLUMN IF NOT EXISTS listed_name TEXT;      -- 상장명(리더보드 공개 이름, null=회사명 사용)

-- 전원 재동의 — 자동 등록되어 있던 기존 행은 본인 동의 없이 리더보드에 남을 수 없다.
DELETE FROM ranking_scores;

-- 쓰기 정책 강화: WITH CHECK 에만 listed 조건(배포 스큐·멀티 디바이스 race 방어).
-- USING 은 소유권만 유지 — 폐지(listed_at=null) 후에도 본인 행 DELETE 가 가능해야 한다
-- (delistCompany 는 listed_at=null 로 게이트를 먼저 닫은 뒤 같은 행을 DELETE 한다).
DROP POLICY "own_score_upsert" ON ranking_scores;
CREATE POLICY "own_score_upsert" ON ranking_scores
  FOR ALL TO authenticated
  USING (holding_id IN (SELECT id FROM holdings WHERE user_id = auth.uid()))
  WITH CHECK (holding_id IN
    (SELECT id FROM holdings WHERE user_id = auth.uid() AND listed_at IS NOT NULL));
