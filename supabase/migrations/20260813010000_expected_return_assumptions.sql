-- 기대수익률(기간 종료 배수) 가정 — Capital Allocator PRD v0.3 §3.2·§16
--
-- 기존 valuation_assumptions 는 고든 성장 모형(내재가치 = 오너이익 / (r − g))의 가정을 담고
-- 있다. 새로 붙이는 기대수익률 모형은 식도 기간 개념도 다르다.
--
--   고든    : 오너이익 / (할인율 − 영구성장률)          ← discount_rate, growth_rate
--   기대수익: EPS × (1+g)^Y × 종료배수 ÷ (1+요구수익)^Y  ← 아래 er_* 컬럼
--
-- ⚠️ growth_rate(영구성장률)와 er_expected_growth(향후 Y년 EPS CAGR)는 **의미가 다르다.**
--    재사용하면 조용히 틀린 값이 나오므로 반드시 분리한다. 그래서 er_ 접두사를 붙였다.
--
-- 키(holding_id, symbol)·RLS·updated_at 트리거는 기존 테이블 것을 그대로 쓴다.
-- 모든 컬럼은 nullable — null 은 "가정 없음"이고, 그 종목은 비중 기반 배분으로만 동작한다
-- (스펙 v1.1 §15.3 attractiveness = 1.0 중립).

alter table valuation_assumptions
  -- 이익력 기준. 'EPS' | 'FCF'. null = EPS.
  add column if not exists er_base_metric text
    check (er_base_metric in ('EPS', 'FCF')),

  -- 현재 주당 이익력 수기 입력(종목 통화). null = 공시 파이프라인(TTM EPS)에서 자동 사용.
  add column if not exists er_current_metric numeric,

  -- 향후 er_holding_years 동안의 연평균 이익 성장률(소수). 음수 허용, −100% 이하는 무의미.
  add column if not exists er_expected_growth numeric
    check (er_expected_growth > -1),

  -- 기간 종료 시점 적정 배수(PER/PFCF). 양수.
  add column if not exists er_terminal_multiple numeric
    check (er_terminal_multiple > 0),

  -- 보유기간(년). null = 5년(PRD 기본값).
  add column if not exists er_holding_years integer
    check (er_holding_years > 0 and er_holding_years <= 50),

  -- 요구수익률(소수). null = 12%(PRD 기본값).
  -- discount_rate(고든 할인율, max(10년물×2, 8%))와 별개다 — 모형이 달라 캘리브레이션이 다르다.
  add column if not exists er_required_return numeric
    check (er_required_return > 0 and er_required_return <= 1);

comment on column valuation_assumptions.er_expected_growth is
  '기대수익률 모형: 향후 N년 EPS CAGR. growth_rate(고든 영구성장률)와 다름 — 혼용 금지.';
comment on column valuation_assumptions.er_required_return is
  '기대수익률 모형: 요구수익률. discount_rate(고든 할인율)와 다름 — 혼용 금지.';
