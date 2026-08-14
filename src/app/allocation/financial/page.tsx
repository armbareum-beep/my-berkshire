import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { loadSecurityMeta } from "@/lib/securities";
import { loadManualAssets } from "@/lib/realAssets";
import { readTargets } from "@/lib/targetWeights";
import { isCashKey, sumTargets } from "@/lib/targetLens";
import { ASSET_TYPE_ORDER } from "@/lib/allocation";
import { pct } from "@/lib/format";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import {
  AllocationLevel,
  type LevelRow,
} from "@/components/allocation/AllocationLevel";

/**
 * `/allocation/financial` — 드릴다운 **1계층: 투자자산**(금융자산 + 현금).
 *
 * ## 왜 현금이 여기 같이 서 있나
 *
 * 목표비중은 **금융자산+현금을 100%로** 보고 매긴 값이다(§16.2 — 목표를 안 채운 나머지가
 * 곧 현금). 그런데 예전엔 금융자산과 현금이 전체 자산 아래 **서로 다른 가지**로 갈라져
 * 있었다. 그래서 어느 화면에서도 목표 합이 100% 로 보이지 않았고, 사용자 지적대로
 * *"계층으로 못 나누니까 여기서 비중설정하는 게 의미없어 보"*였다.
 *
 * **계층을 목표의 분모에 맞춘다.** 주식·ETF·코인·현금이 한 줄에 나란히 서고, 이 화면의
 * 목표 합이 곧 100% 다. 여기서 정하는 비중이 그대로 배분 엔진이 쓰는 값이다.
 */
export default async function FinancialAllocationPage() {
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
  const manual = await loadManualAssets(supabase, portfolio.holding.id);

  const targets = readTargets(
    portfolio.holding.target_weights,
    (portfolio.holding.category_targets ?? {}) as Record<string, number>,
    data.allocation.map((a) => ({
      symbol: a.symbol,
      assetType: meta[a.symbol]?.assetType ?? "주식",
    })),
  );

  // 유형별 합산 — 값은 금융자산 안에서, 목표는 전체 대비 합.
  const byType = new Map<string, { value: number; target: number; n: number }>();
  for (const a of data.allocation) {
    const type = meta[a.symbol]?.assetType ?? "주식";
    const cur = byType.get(type) ?? { value: 0, target: 0, n: 0 };
    cur.value += a.value;
    cur.target += targets[a.symbol]?.target ?? 0;
    cur.n += 1;
    byType.set(type, cur);
  }
  // 목표만 있고 아직 안 산 종목도 유형 목표에 넣는다 — 빠지면 합이 진실과 어긋난다(#70).
  const heldSet = new Set(data.allocation.map((a) => a.symbol));
  const orphans = Object.keys(targets).filter(
    (s) => !heldSet.has(s) && !isCashKey(s),
  );
  if (orphans.length > 0) {
    const extra = await loadSecurityMeta(supabase, orphans);
    for (const sym of orphans) {
      const type = extra[sym]?.assetType ?? "주식";
      const cur = byType.get(type) ?? { value: 0, target: 0, n: 0 };
      cur.target += targets[sym]?.target ?? 0;
      byType.set(type, cur);
    }
  }

  const financial = data.allocation.reduce((s, a) => s + a.value, 0);
  const cash = Math.max(0, data.cash);
  // 이 화면의 100% = 목표비중의 분모. 둘을 일치시키는 게 이 계층의 존재 이유다.
  const investable = financial + cash;
  const cashTarget = Math.max(0, 1 - sumTargets(targets));
  const rate = portfolio.usdKrw;
  const toDisplay = (krw: number) =>
    displayCcy === "USD" ? (rate && rate > 0 ? krw / rate : 0) : krw;
  const total =
    investable + toDisplay(manual.reduce((s, m) => s + m.currentValue, 0));

  // 표시 순서는 고정(주식 → ETF → 원자재 → 코인), 모르는 유형은 뒤에.
  const known = ASSET_TYPE_ORDER.filter((t) => byType.has(t)) as string[];
  const extraTypes = [...byType.keys()].filter((t) => !known.includes(t));
  const rows: LevelRow[] = [
    ...[...known, ...extraTypes].map((type) => {
      const g = byType.get(type)!;
      return {
        key: type,
        label: type,
        value: g.value,
        weight: investable > 0 ? g.value / investable : 0,
        target: g.target,
        href: `/allocation/financial/${encodeURIComponent(type)}`,
        badge: g.n > 0 ? `${g.n}종목` : "미보유",
      };
    }),
    // 현금은 유형과 형제다 — 목표 합 100%의 마지막 칸이다.
    {
      key: "cash",
      label: "현금",
      value: cash,
      weight: investable > 0 ? cash / investable : 0,
      target: cashTarget,
      href: "/allocation/cash",
      badge: "통화별",
    },
  ];

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      <AllocationLevel
        title="투자자산"
        parentNote={`전체 자산의 ${pct(total > 0 ? investable / total : 0)} · 목표비중은 여기가 100%예요`}
        value={investable}
        currency={data.currency}
        rows={rows}
        emptyText="아직 보유 종목이 없어요."
      />
      <p className="px-2 text-xs leading-relaxed text-muted-foreground">
        목표를 안 채운 나머지는 현금이 돼요. 각 줄을 눌러 들어가면 그 안에서 더 나눌 수
        있습니다.
      </p>
    </main>
  );
}
