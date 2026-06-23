import { Sheet } from "@/components/ui/Sheet";
import { NetWorthContent } from "@/app/networth/page";

/** 홈 "현재 자산"(순자산) 탭 시 바텀시트로 인터셉트. 딥링크/새로고침은 전체 페이지(/networth). */
export default function NetWorthSheet() {
  return (
    <Sheet title="순자산">
      <NetWorthContent />
    </Sheet>
  );
}
