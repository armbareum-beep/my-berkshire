import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { loadManualAssets, loadManualAssetIncome } from "@/lib/realAssets";
import { todayKST } from "@/lib/date";
import type { Currency } from "@/lib/format";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { ManualAssetsSection } from "@/components/networth/ManualAssetsSection";

/**
 * 사업부 — 부동산·실물·사업(수기 평가) 자산의 손익 + 관리(추가·임대·매도).
 * 종류를 사업부로 묶어 보여준다. 주식 사업부(/returns)와 대칭, 순자산(/networth)은 잔액만.
 * 코인·원자재 등 시세 자산은 주식에서 관리(여기 없음).
 */
export default async function DivisionsPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const { add } = await searchParams;
  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      <DivisionsContent autoOpenAsset={add === "asset"} />
    </main>
  );
}

async function DivisionsContent({
  autoOpenAsset = false,
}: {
  autoOpenAsset?: boolean;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [portfolio, cookieStore] = await Promise.all([
    getPortfolio(supabase),
    cookies(),
  ]);
  if (!portfolio) redirect("/onboarding");

  const useUsd =
    cookieStore.get("display_ccy")?.value === "USD" && !!portfolio.usdKrw;
  const factor = useUsd ? 1 / (portfolio.usdKrw as number) : 1;
  const currency: Currency = useUsd ? "USD" : "KRW";
  const today = todayKST();

  const [manualAssets, manualIncome] = await Promise.all([
    loadManualAssets(supabase, portfolio.holding.id),
    loadManualAssetIncome(supabase, portfolio.holding.id),
  ]);

  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">내 사업부</h1>
      <p className="-mt-2 text-sm text-muted-foreground">
        부동산·미술품·비상장 등 직접 평가하는 자산. 종류별 사업부로 묶여요.
      </p>

      <ManualAssetsSection
        items={manualAssets}
        incomes={manualIncome}
        factor={factor}
        currency={currency}
        today={today}
        autoOpen={autoOpenAsset}
      />

      <p className="px-1 text-xs text-muted-foreground">
        수기 자산은 직접 입력한 평가액(추정) 기준이에요. 임대·배당·매도는 자체 기록이라
        주식 투자 수익률(XIRR)·복리 무중단엔 영향이 없어요. 평가차익은 미실현, 임대·매도
        차익은 실현. 자산 가치는 순자산에 합산됩니다. (코인·원자재 등 시세 자산은 주식에서 관리)
      </p>
    </>
  );
}
