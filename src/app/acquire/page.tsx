import { redirect } from "next/navigation";

/**
 * 레거시 매수 입력 — 이제 통합 거래 위저드(BuyWizard)로 일원화.
 * /acquire 진입은 거래 허브의 매수 위저드로 보낸다(구형 BuyForm 폐기).
 */
export default function AcquirePage() {
  redirect("/transactions?type=BUY");
}
