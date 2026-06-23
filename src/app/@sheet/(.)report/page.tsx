import { Sheet } from "@/components/ui/Sheet";
import { ReportContent } from "@/app/report/ReportContent";

/** 홈 "분기 경영 리포트" 카드 탭 시 바텀시트로 인터셉트. 딥링크/새로고침은 전체 페이지(/report). */
export default function ReportSheet() {
  return (
    <Sheet title="경영 리포트">
      <ReportContent />
    </Sheet>
  );
}
