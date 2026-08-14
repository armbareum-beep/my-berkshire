import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { loadManualAssets } from "@/lib/realAssets";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import {
  AllocationLevel,
  type LevelRow,
} from "@/components/allocation/AllocationLevel";

/**
 * `/allocation` — 드릴다운 **0계층: 전체 자산**.
 *
 * ```text
 *   전체 자산 → 금융자산 → 주식 → (종목 / 국가 / 산업)
 *            → 현금 → 통화별
 * ```
 *
 * ## 이 화면에는 목표비중을 붙이지 않는다
 *
 * 목표비중은 **금융자산 + 현금** 을 100% 로 보고 매긴 값이다(`lib/targetLens.ts`).
 * 그런데 전체 자산에는 부동산·미술 같은 실물자산이 더 있다. 여기에 목표를 얹으면
 * 분모가 달라 합이 안 맞는 숫자가 나온다 — **틀린 숫자를 보여주느니 안 보여준다.**
 *
 * 목표는 한 계층 아래(금융자산·현금)부터 나온다.
 */
export default async function AllocationPage() {
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
  const manual = await loadManualAssets(supabase, portfolio.holding.id);

  // 실물자산은 ₩ 로 들고 있다 — 표시통화가 달러면 여기서 환산한다(§16.3 과 같은 규칙).
  const rate = portfolio.usdKrw;
  const toDisplay = (krw: number) =>
    displayCcy === "USD" ? (rate && rate > 0 ? krw / rate : 0) : krw;

  const financial = data.allocation.reduce((s, a) => s + a.value, 0);
  const cash = Math.max(0, data.cash);
  const real = toDisplay(manual.reduce((s, m) => s + m.currentValue, 0));
  const total = financial + cash + real;
  const w = (v: number) => (total > 0 ? v / total : 0);

  // 투자자산(금융자산+현금)을 한 줄로 묶는다 — 목표비중이 100%로 성립하는 단위가
  // 그것이기 때문이다. 갈라놓으면 어느 화면에서도 목표 합이 100%로 보이지 않는다.
  const rows: LevelRow[] = [
    {
      key: "invest",
      label: "투자자산",
      value: financial + cash,
      weight: w(financial + cash),
      href: "/allocation/financial",
      badge: "목표비중 대상",
    },
    ...(real > 0
      ? [
          {
            key: "real",
            label: "실물자산",
            value: real,
            weight: w(real),
            href: "/networth",
            badge: "부동산·미술 등",
          },
        ]
      : []),
  ].filter((r) => r.value > 0 || r.key !== "real");

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <AllocationLevel
        title="전체 자산"
        value={total}
        currency={data.currency}
        rows={rows}
        emptyText="아직 자산이 없어요. 첫 인수를 기록해보세요."
      />
      <p className="px-2 text-xs leading-relaxed text-muted-foreground">
        목표비중은 <b>금융자산 + 현금</b>을 100%로 보고 정해요. 실물자산은 목표비중
        대상이 아니라 이 화면에는 목표를 표시하지 않습니다.
      </p>
    </main>
  );
}
