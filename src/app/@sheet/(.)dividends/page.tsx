import { Sheet } from "@/components/ui/Sheet";
import { DividendsContent } from "@/app/dividends/page";

/** 홈 현금 카드 "배당 — 언제 얼마 받나" 탭 시 바텀시트로 인터셉트. 딥링크/새로고침은 전체 페이지(/dividends). */
export default async function DividendsSheet({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year: yearParam } = await searchParams;
  return (
    <Sheet title="배당">
      <DividendsContent yearParam={yearParam} />
    </Sheet>
  );
}
