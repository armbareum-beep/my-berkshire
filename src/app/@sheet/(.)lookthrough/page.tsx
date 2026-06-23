import { Sheet } from "@/components/ui/Sheet";
import { LookThroughContent } from "@/app/lookthrough/page";

/** 홈 "내 사업부 실적"(투시) 탭 시 바텀시트로 인터셉트. 딥링크/새로고침은 전체 페이지(/lookthrough). */
export default async function LookThroughSheet({
  searchParams,
}: {
  searchParams: Promise<{ basis?: string }>;
}) {
  const query = await searchParams;
  const basis = query.basis === "fy" ? "fy" : "ttm";

  return (
    <Sheet title="내 사업부 실적">
      <LookThroughContent basis={basis} />
    </Sheet>
  );
}
