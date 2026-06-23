import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { ReportContent } from "./ReportContent";

/**
 * CFO 분기 결산 리포트 — 홈 CFO 카드 › 에서 진입.
 * 전체 페이지 셸(크롬 + 본문). 본문은 ReportContent — 바텀시트와 공유.
 */
export default function ReportPage() {
  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      <ReportContent />
    </main>
  );
}
