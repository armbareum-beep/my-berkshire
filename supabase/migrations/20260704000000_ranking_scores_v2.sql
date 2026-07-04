-- 랭킹 지표 5→7 확장(034) — 저레버리지·저비용 점수, 버전 컬럼, 프로필 시트용 설립일·연혁.
-- NULL = 구버전(score_version=1) 계산분. 대시보드/랭킹 재방문 시 after()로 자연 재계산.

ALTER TABLE ranking_scores
  ADD COLUMN IF NOT EXISTS leverage_score INTEGER,
  ADD COLUMN IF NOT EXISTS cost_score     INTEGER,
  ADD COLUMN IF NOT EXISTS score_version  INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS founded_at     DATE,
  ADD COLUMN IF NOT EXISTS milestones     JSONB;
