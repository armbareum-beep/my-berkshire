import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { loadSecurityMeta } from "@/lib/securities";
import { readTargets } from "@/lib/targetWeights";
import { isCashKey } from "@/lib/targetLens";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import {
  TargetWeightEditor,
  type TargetRow,
} from "@/components/allocate/TargetWeightEditor";

/**
 * `/allocation/targets` — 종목 목표비중을 **찾아서 정하는** 한 가지 일만 하는 화면.
 *
 * 드릴다운(전체 자산 → 금융자산 → 유형)은 **보는** 흐름이고, 유형·국가 단위 조정은 그
 * 안에서 한다. 그런데 "아직 한 주도 없는 기업에 목표를 매기는" 일은 계층 어디에도 속하지
 * 않는다 — 아직 자산이 아니기 때문이다. 그래서 별도 화면 한 장으로 뺀다.
 *
 * 통화 목표(`CASH:*`)는 여기 섞지 않는다. 통화는 종목이 아니고 `/allocation/cash` 가 맡는다.
 */
export default async function TargetsPage() {
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

  const displayCcy = cookieStore.get("display_ccy")?.value === "USD" ? "USD" : "KRW";
  const data = computeDashboard(portfolio, displayCcy);
  const meta = await loadSecurityMeta(
    supabase,
    data.allocation.map((a) => a.symbol),
  );

  const targets = readTargets(
    portfolio.holding.target_weights,
    (portfolio.holding.category_targets ?? {}) as Record<string, number>,
    data.allocation.map((a) => ({
      symbol: a.symbol,
      assetType: meta[a.symbol]?.assetType ?? "주식",
    })),
  );

  // 비중 기준은 목표비중의 정의와 같은 **금융자산+현금 대비**로 맞춘다.
  const financial = data.allocation.reduce((s, a) => s + a.value, 0);
  const investable = financial + Math.max(0, data.cash);
  const rows: TargetRow[] = data.allocation.map((a) => ({
    symbol: a.symbol,
    label: a.name,
    target: targets[a.symbol]?.target ?? 0,
    currentWeight: investable > 0 ? a.value / investable : 0,
    held: true,
  }));

  // 목표만 있고 아직 안 산 종목 — 빼면 저장된 값이 보이지도 지워지지도 않는 유령이 된다.
  const heldSet = new Set(data.allocation.map((a) => a.symbol));
  const orphans = Object.keys(targets).filter(
    (s) => !heldSet.has(s) && !isCashKey(s),
  );
  if (orphans.length > 0) {
    const orphanMeta = await loadSecurityMeta(supabase, orphans);
    for (const sym of orphans) {
      rows.push({
        symbol: sym,
        label: orphanMeta[sym]?.name ?? sym,
        target: targets[sym]?.target ?? 0,
        currentWeight: 0,
        held: false,
      });
    }
  }

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">목표비중 정하기</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          어떤 기업을 얼마나 들고 갈지 정해요. 비중은 <b>금융자산+현금 대비</b>입니다.
        </p>
      </div>

      <TargetWeightEditor rows={rows} />
    </main>
  );
}
