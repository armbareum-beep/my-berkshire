import { Sheet } from "@/components/ui/Sheet";
import { StyleContent } from "@/app/style/page";

/** 홈 "운용 스타일·규율 점수" 카드 탭 시 바텀시트로 인터셉트. 딥링크/새로고침은 전체 페이지(/style). */
export default function StyleSheet() {
  return (
    <Sheet title="운용 스타일 · 규율 점수">
      <StyleContent />
    </Sheet>
  );
}
