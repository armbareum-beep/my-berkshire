import { Sheet } from "@/components/ui/Sheet";
import { IndexDetailContent } from "@/app/index/[symbol]/page";

/** 검색·ETF 링크에서 지수 탭 시 바텀시트로 인터셉트. 딥링크/새로고침은 전체 페이지(/index/[symbol]). */
export default async function IndexSheet({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  return (
    <Sheet title="지수 상세">
      <IndexDetailContent symbol={symbol} />
    </Sheet>
  );
}
