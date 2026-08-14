import Link from "next/link";
import { PieChart } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { readTargets } from "@/lib/targetWeights";
import { sumTargets } from "@/lib/targetLens";
import { loadAllocateData } from "@/lib/allocateData";
import { pct } from "@/lib/format";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { HurdleCard } from "@/components/allocate/HurdleCard";
import { InvestableCashCard } from "@/components/allocate/InvestableCashCard";

/**
 * `/allocate/settings` — 배분을 움직이는 **입력값**을 모은 화면.
 *
 * ## 목표비중이 여기 없는 이유
 *
 * 한때 이 화면에 목표비중 편집기가 있었다. 그런데 국가·산업별로 쏠림을 **보는 곳**은
 * `/allocation` 이었다 — "미국이 너무 많네" 하고 판단해도 고치려면 여기로 나와서 종목을
 * 하나씩 찾아야 했다. 보는 곳과 정하는 곳이 갈려 있으면 다각적 판단이 성립하지 않는다.
 *
 * 그래서 목표비중은 `/allocation` 렌즈 화면으로 합쳤다(종목별 / 유형별 / 국가별 / 산업별).
 * 여기 남은 건 **비중이 아닌 입력값** 둘 — 허들과 투자 가능 현금이다.
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

  const total = sumTargets(
    readTargets(
      portfolio.holding.target_weights,
      (portfolio.holding.category_targets ?? {}) as Record<string, number>,
      data.rows.map((r) => ({ symbol: r.symbol, assetType: r.assetType })),
    ),
  );

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

      {/* 목표비중은 렌즈 화면에서 — 보는 곳과 정하는 곳을 하나로 합쳤다. */}
      <Link
        href="/allocation/stock"
        className="flex items-center gap-4 rounded-2xl bg-card p-5 shadow-card transition active:scale-[0.99]"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary">
          <PieChart size={20} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">목표비중</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            {total > 0
              ? `합계 ${pct(total)} · 종목·유형·국가·산업으로 보고 바로 고쳐요`
              : "아직 정한 게 없어요 — 어떤 기업을 얼마나 들고 갈지 정해요"}
          </span>
        </span>
        <span className="shrink-0 text-foreground/40">›</span>
      </Link>

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
