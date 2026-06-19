-- securities.currency — 종목 네이티브 거래통화(야후 meta.currency). 예: KRW, USD, HKD.
--
-- 지주회사 기능통화는 원화(KRW). 외국 주식은 거래·평가 시 현재 환율로 ₩ 환산해 장부에 기록.
-- 이 칼럼은 표시($ 모드)와 환산 기준 통화 식별에 쓴다(현재가는 저장하지 않음).
alter table securities
  add column currency text not null default 'KRW';
