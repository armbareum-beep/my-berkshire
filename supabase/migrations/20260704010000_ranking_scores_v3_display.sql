-- 랭킹 프로필 시트 표시 확장(035) — XIRR·자산 구간·유형별 구성 비중(%) 공개.
-- 점수 산정에는 관여하지 않는 순수 표시 컬럼(총점·지표 가중치는 034 그대로).
-- 비공개 불변식 유지: 정확한 금액·종목명은 어떤 컬럼에도 저장하지 않는다(구간 라벨·%·XIRR 소수만).

ALTER TABLE ranking_scores
  ADD COLUMN IF NOT EXISTS xirr         DOUBLE PRECISION, -- 연환산 XIRR(소수, 0.12=12%). 시세 실패 시 null
  ADD COLUMN IF NOT EXISTS asset_bucket TEXT,              -- 자산 구간 라벨만(정확 금액 저장 금지)
  ADD COLUMN IF NOT EXISTS composition  JSONB;             -- 유형별 비중 %만: {"v":1,"slices":[{"label":"주식","pct":62},...]}
