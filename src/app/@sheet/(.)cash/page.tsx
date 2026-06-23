import { Sheet } from "@/components/ui/Sheet";
import { CashContent } from "@/app/cash/page";

/** 현금비중 카드 탭 시 바텀시트로 인터셉트. 딥링크/새로고침은 전체 페이지(/cash). */
export default async function CashSheet({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  return (
    <Sheet title="현금 · 외화">
      <CashContent tab={tab} />
    </Sheet>
  );
}
