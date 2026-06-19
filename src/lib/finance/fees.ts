/**
 * 수수료·세금 자동 추정 — STEP 4.
 * fee_and_tax 를 비우면 계좌 commission_rate + 계좌유형 세율(lib/config/tax)로 추정해 채운다.
 * 세율은 여기서 하드코딩하지 않고 tax config 를 호출만 한다.
 */
import { getTaxConfig, type AccountType } from "@/lib/config/tax";
import type { EventType } from "./valuation";

/**
 * 거래 종류별 수수료+세금 추정.
 *  · BUY    : 위탁수수료(거래액×commission_rate). 매수 세금 없음.
 *  · SELL   : 위탁수수료 + 증권거래세(거래액×transactionTaxRate).
 *  · DIVIDEND: 배당소득세(배당액×dividendTaxRate).
 *  · DEPOSIT/WITHDRAWAL: 0.
 *
 * @param gross 거래/현금 총액 (BUY·SELL=수량×단가, DIVIDEND=배당액)
 */
export function estimateFeeAndTax(
  type: EventType,
  gross: number,
  commissionRate: number,
  accountType: AccountType,
): number {
  const tax = getTaxConfig(accountType);
  switch (type) {
    case "BUY":
      return round(gross * commissionRate);
    case "SELL":
      return round(gross * commissionRate + gross * tax.transactionTaxRate);
    case "DIVIDEND":
      return round(gross * tax.dividendTaxRate);
    default:
      return 0; // DEPOSIT / WITHDRAWAL
  }
}

function round(n: number): number {
  return Math.round(n);
}
