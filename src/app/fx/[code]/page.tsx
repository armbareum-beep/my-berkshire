import { notFound } from "next/navigation";
import { CURRENCIES } from "@/lib/finance/currencies";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { FxDetailContent } from "@/components/fx/FxDetailContent";

/** 환율 상세에서 지원하는 통화(기능통화 KRW 제외). */
const FX_CODES = CURRENCIES.map((c) => c.code).filter((c) => c !== "KRW");

export default async function FxDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw).toUpperCase();
  if (!FX_CODES.includes(code)) notFound();

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      <FxDetailContent code={code} />
    </main>
  );
}
