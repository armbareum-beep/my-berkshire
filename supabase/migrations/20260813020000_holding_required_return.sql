-- 전사 기본 요구수익률 — Capital Allocator PRD v0.3 §3.2 "Required Return: 기본 요구수익률"
--
-- 지금까지 요구수익률은 두 곳에만 있었다.
--   · 코드 상수 DEFAULT_REQUIRED_RETURN = 12%  (바꿀 수 없음)
--   · valuation_assumptions.er_required_return (종목마다 따로 입력)
--
-- 그래서 "내 허들은 연 15%"라고 한 번 정하는 자리가 없었고, 종목 수만큼 같은 값을
-- 반복 입력해야 했다. 가정 입력이 사실상 아무도 안 하는 상태였던 이유 중 하나다.
--
-- 우선순위: 종목별 er_required_return > holdings.required_return > 코드 기본값 12%
-- null 은 "안 정함"이고 그때 코드 기본값으로 내려간다 — 값을 미리 채우지 않는다.

alter table holdings
  add column if not exists required_return numeric
    check (required_return > 0 and required_return <= 1);

comment on column holdings.required_return is
  '전사 기본 요구수익률(소수). 종목별 valuation_assumptions.er_required_return 이 있으면 그쪽이 우선. null = 코드 기본값(12%).';
