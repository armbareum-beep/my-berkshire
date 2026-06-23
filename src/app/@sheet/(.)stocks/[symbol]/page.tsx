import { Sheet } from "@/components/ui/Sheet";
import { StockDetailContent } from "@/app/stocks/[symbol]/page";

/** 보유·구성·검색에서 종목 탭 시 바텀시트로 인터셉트. 딥링크/새로고침은 전체 페이지(/stocks/[symbol]). */
export default async function StockSheet({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const { symbol } = await params;
  const sp = await searchParams;
  return (
    <Sheet title="종목 상세">
      <StockDetailContent symbol={symbol} sp={sp} />
    </Sheet>
  );
}
