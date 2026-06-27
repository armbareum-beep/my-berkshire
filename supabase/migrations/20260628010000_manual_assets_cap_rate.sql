-- 수익률환원법 평가 컬럼 추가
-- valuation_method: 'direct'(직접입력) | 'cap_rate'(수익률환원법)
-- cap_rate: 환원율(소수, 0.04 = 4%)
alter table manual_assets
  add column if not exists valuation_method text not null default 'direct'
    check (valuation_method in ('direct', 'cap_rate')),
  add column if not exists cap_rate numeric;
