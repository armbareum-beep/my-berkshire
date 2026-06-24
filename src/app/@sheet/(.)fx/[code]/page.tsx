import { notFound } from "next/navigation";
import { Sheet } from "@/components/ui/Sheet";
import { CURRENCIES } from "@/lib/finance/currencies";
import { FxDetailContent } from "@/components/fx/FxDetailContent";

const FX_CODES = CURRENCIES.map((c) => c.code).filter((c) => c !== "KRW");

/** 환율 목록에서 통화 탭 시 바텀시트로 인터셉트. 딥링크/새로고침은 전체 페이지(/fx/[code]). */
export default async function FxSheet({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw).toUpperCase();
  if (!FX_CODES.includes(code)) notFound();

  return (
    <Sheet title="환율 상세">
      <FxDetailContent code={code} />
    </Sheet>
  );
}
