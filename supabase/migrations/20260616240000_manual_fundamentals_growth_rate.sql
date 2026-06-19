-- ENUF — 수기 성장률(고든 성장모형) 추가
-- 내재가치 = 오너이익 / (할인율 − 성장률)  [표준 Gordon Growth Model].
-- 기본 성장률 = 0(g=0 이면 오너이익/할인율 = 무성장, 가장 보수적). 사용자가 종목별로 조절.
-- g 는 반드시 할인율보다 낮아야 함(g≥r 이면 분모≤0 폭발) → 입력/계산서 가드.
-- null = 0%(무성장). 소수 저장(0.04 = 4%).

alter table manual_fundamentals
  add column growth_rate numeric check (growth_rate >= 0 and growth_rate < 1);
