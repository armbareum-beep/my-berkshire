import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { loadSecurityMeta } from "@/lib/securities";
import { flattenTargets } from "@/lib/allocate";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import {
  AllocatePanel,
  type AllocateRow,
} from "@/components/allocate/AllocatePanel";

/**
 * `/allocate` — 새 돈을 어디에 얼마나 넣을지 정하는 화면.
 *
 * 스펙 v1.1 §12~§16 과 Capital Allocator PRD v0.3 §6~§8 이 **합의하는 범위**만 구현했다
 * (대조표: `docs/spec-vs-prd-reconciliation.md`). 밸류에이션(Expected CAGR)은 아직 붙이지
 * 않았고, 엔진에 `attractiveness` 훅만 열어뒀다 — 채택이 결정되면 여기에 물린다.
 *
 * 목표비중은 기존 `/rebalance` 의 2층 저장 형식(유형 → 유형 내 종목)을 읽어 평면으로
 * 환산한다. 별도 테이블을 만들지 않는다(스펙 §13.2).
 */
export default async function AllocatePage() {
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
  const data = computeDashboard(portfolio, displayCcy);
  const meta = await loadSecurityMeta(
    supabase,
    data.allocation.map((a) => a.symbol),
  );

  const categoryTargets = (portfolio.holding.category_targets ?? {}) as Record<
    string,
    number
  >;
  const withinTargets = (portfolio.holding.target_weights ?? {}) as Record<
    string,
    number
  >;

  const flat = flattenTargets(
    data.allocation.map((a) => ({
      symbol: a.symbol,
      assetType: meta[a.symbol]?.assetType ?? "주식",
    })),
    categoryTargets,
    withinTargets,
  );

  const rows: AllocateRow[] = data.allocation.map((a) => ({
    key: a.symbol,
    symbol: a.symbol,
    label: a.name,
    value: a.value,
    target: flat[a.symbol] ?? 0,
  }));

  const hasTargets = rows.some((r) => r.target > 0);

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">자본배분</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          새로 생긴 돈을 목표비중과 집중도 한도에 맞춰 나눕니다.
        </p>
      </div>

      {data.priceAvailable ? (
        <AllocatePanel
          rows={rows}
          currency={data.currency}
          investableCash={data.cash}
          hasTargets={hasTargets}
        />
      ) : (
        <div className="rounded-2xl bg-card p-6 text-center shadow-card">
          <p className="text-sm text-muted-foreground">
            시세 갱신 필요 — 잠시 후 다시 시도하세요.
          </p>
        </div>
      )}
    </main>
  );
}
