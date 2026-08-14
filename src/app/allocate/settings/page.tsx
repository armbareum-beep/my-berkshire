import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { loadAllocateData } from "@/lib/allocateData";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { HurdleCard } from "@/components/allocate/HurdleCard";
import { InvestableCashCard } from "@/components/allocate/InvestableCashCard";

/**
 * `/allocate/settings` — 배분을 움직이는 **입력값**을 모은 화면.
 *
 * ## 목표비중이 여기 없는 이유
 *
 * 비중을 정하는 자리를 따로 두면 메뉴가 셋이 된다 — 자본배분(돈 넣기) / 지금 비중(조회) /
 * 비중 설정(편집). 사용자 지적대로 *"너무 복잡"* 하고 순서가 부자연스러워진다.
 *
 * 그래서 **비중은 보는 자리에서 정한다**(`/allocation` 계층). 여기 남은 건 비중이 아닌
 * 입력값 둘 — 허들과 투자 가능 현금이다.
 */
export default async function AllocateSettingsPage() {
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

  const displayCcy =
    cookieStore.get("display_ccy")?.value === "USD" ? "USD" : "KRW";
  const data = await loadAllocateData(supabase, displayCcy);
  if (!data) redirect("/onboarding");

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">배분 설정</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          배분 결과를 바꾸는 값들이 여기 다 있어요.
        </p>
      </div>

      {/* 목표비중 카드가 있던 자리. 비중은 **보는 자리에서 정한다**(자산배분 계층) —
          "설정"이라는 별도 메뉴를 두면 조회/설정이 갈려 순서가 부자연스러워진다.
          여기 남은 건 비중이 아닌 입력값 둘뿐이다. */}
      <HurdleCard rate={data.house} passing={data.passing} total={data.judged} />

      <InvestableCashCard
        value={data.investableCash}
        cash={data.cash}
        currency={data.currency}
        isSet={data.investableCashSet}
      />
    </main>
  );
}
