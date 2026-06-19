-- 계좌의 증권사(브랜드) — 드롭다운 선택값(lib/config/brokers id). 표시·수수료 랭킹용.
-- null = 직접 입력(증권사 미지정). 수수료율은 commission_rate 가 단일 출처(이 컬럼은 표시·식별용).
alter table accounts
  add column if not exists broker text;
