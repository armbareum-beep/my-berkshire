import { Sheet } from "@/components/ui/Sheet";
import { HoldingsContent } from "@/app/holdings/page";

/** 홈 "보유 계좌" 카드 탭 시 바텀시트로 인터셉트. 딥링크/새로고침은 전체 페이지(/holdings). */
export default function HoldingsSheet() {
  return (
    <Sheet title="보유 종목">
      <HoldingsContent />
    </Sheet>
  );
}
