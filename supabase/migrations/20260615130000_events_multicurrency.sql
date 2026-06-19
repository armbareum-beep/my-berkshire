-- 외화 금고(multi-currency treasury) — events 에 통화·환율 + 환전 전용 컬럼 추가.
--
-- 기능통화는 여전히 KRW: price_or_amount·fee_and_tax 는 ₩로 저장(₩ 장부·XIRR 불변).
-- currency/fx_rate 는 그 위에 얹는 "네이티브 통화" 레이어 — 통화별 현금 풀 계산·표시·매수자금 판정용.
--   · currency  : 이벤트의 네이티브 통화(거래=종목 통화, 현금흐름=입금/출금 통화).
--   · fx_rate   : 이벤트 시점 1 네이티브당 ₩ 환율(KRW=1). 네이티브 금액 = ₩금액 / fx_rate.
-- 환전(EXCHANGE) 전용:
--   · currency/price_or_amount/fx_rate = 보낸 쪽(from): ₩가치 / from 환율.
--   · to_currency/to_amount            = 받은 쪽(to): 받은 네이티브 금액.
alter table events
  add column if not exists currency    text    not null default 'KRW',
  add column if not exists fx_rate      numeric not null default 1,
  add column if not exists to_currency text,
  add column if not exists to_amount    numeric;
-- 무결성 제약을 EXCHANGE 까지 확장(EXCHANGE 는 symbol·quantity 없음, to_* 필수).
alter table events drop constraint if exists events_symbol_required;
alter table events drop constraint if exists events_quantity_required;
alter table events
  add constraint events_symbol_required check (
    (type in ('BUY', 'SELL', 'DIVIDEND') and symbol is not null)
    or (type in ('DEPOSIT', 'WITHDRAWAL', 'EXCHANGE') and symbol is null)
  ),
  add constraint events_quantity_required check (
    (type in ('BUY', 'SELL') and quantity is not null and quantity > 0)
    or (type in ('DIVIDEND', 'DEPOSIT', 'WITHDRAWAL', 'EXCHANGE') and quantity is null)
  ),
  add constraint events_exchange_fields check (
    type <> 'EXCHANGE'
    or (to_currency is not null and to_amount is not null and to_amount > 0)
  );
