-- 설립 확정(첫 거래 선언) 여부: 사용자가 "이게 내 첫 거래"라고 선언하면 true.
-- founded_at(설립일)은 가장 이른 기록을 따르며(동적), 이 플래그는 연혁 복원 '완료'를 봉인한다.
-- 더 이른 거래가 추가되면 코드에서 자동으로 false로 해제한다.
alter table holdings
  add column if not exists founding_declared boolean not null default false;
