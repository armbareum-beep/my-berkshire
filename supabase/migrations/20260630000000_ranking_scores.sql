-- 랭킹 점수 테이블 — 유저별 규율 점수를 저장하는 리더보드 원천.
-- /ranking 페이지 방문 시 현재 유저 점수를 upsert, 전체 조회로 리더보드 표시.

CREATE TABLE IF NOT EXISTS ranking_scores (
  holding_id            UUID        PRIMARY KEY REFERENCES holdings(id) ON DELETE CASCADE,
  holding_name          TEXT        NOT NULL,
  total_score           INTEGER     NOT NULL,
  holding_period_score  INTEGER     NOT NULL DEFAULT 50,
  contrarian_score      INTEGER     NOT NULL DEFAULT 50,
  market_score          INTEGER     NOT NULL DEFAULT 50,
  diversification_score INTEGER     NOT NULL DEFAULT 50,
  deposit_score         INTEGER     NOT NULL DEFAULT 50,
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ranking_scores ENABLE ROW LEVEL SECURITY;

-- 인증된 유저는 전체 리더보드 조회 가능
CREATE POLICY "leaderboard_read" ON ranking_scores
  FOR SELECT TO authenticated USING (true);

-- 자신의 holding 점수만 upsert 가능
CREATE POLICY "own_score_upsert" ON ranking_scores
  FOR ALL TO authenticated
  USING (
    holding_id IN (SELECT id FROM holdings WHERE user_id = auth.uid())
  )
  WITH CHECK (
    holding_id IN (SELECT id FROM holdings WHERE user_id = auth.uid())
  );
