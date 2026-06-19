import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { loadSecurityMeta, backfillSectors } from "@/lib/securities";
import { tagLabel } from "@/lib/allocation";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { parsePlan, planProgress } from "@/lib/plan";
import { PlanCard } from "@/components/dashboard/PlanCard";
import {
  CategoryRebalanceEditor,
  type Category,
} from "@/components/dashboard/CategoryRebalanceEditor";

// 유형(assetType)은 계층형 종목별(/rebalance)의 1단계로 흡수됨 — 여기선 국가·산업.
const TAGS = {
  country: { key: "country" as const, title: "국가별 목표비중 · 리밸런싱" },
  sector: { key: "sector" as const, title: "산업별 목표비중 · 리밸런싱" },
};

export default async function CategoryRebalancePage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const cfg = TAGS[tag as keyof typeof TAGS];
  if (!cfg) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const portfolio = await getPortfolio(supabase);
  if (!portfolio) redirect("/onboarding");

  const displayCcy =
    (await cookies()).get("display_ccy")?.value === "USD" ? "USD" : "KRW";
  const data = computeDashboard(portfolio, displayCcy);
  const meta = await loadSecurityMeta(
    supabase,
    data.allocation.map((a) => a.symbol),
  );
  if (cfg.key === "sector") {
    const filled = await backfillSectors(supabase, meta);
    for (const [s, sec] of Object.entries(filled)) if (meta[s]) meta[s].sector = sec;
  }

  // 저장된 이 차원의 카테고리 목표(키: "country:미국" 등)
  const saved = (portfolio.holding.category_targets ?? {}) as Record<
    string,
    number
  >;
  const prefix = `${cfg.key}:`;
  const targetOf = (label: string) =>
    typeof saved[`${prefix}${label}`] === "number" ? saved[`${prefix}${label}`] : 0;

  // 카테고리별 합산 + 구성종목
  const map = new Map<
    string,
    {
      value: number;
      items: { symbol: string; name: string; value: number; price: number }[];
    }
  >();
  for (const a of data.allocation) {
    const label = tagLabel(meta[a.symbol], cfg.key);
    const cat = map.get(label) ?? { value: 0, items: [] };
    cat.value += a.value;
    cat.items.push({
      symbol: a.symbol,
      name: a.name,
      value: a.value,
      price: a.price,
    });
    map.set(label, cat);
  }
  // 현금은 국가 차원에만(섹터엔 현금 개념 없음).
  if (data.cash > 0 && cfg.key !== "sector") {
    const cash = map.get("현금") ?? { value: 0, items: [] };
    cash.value += data.cash;
    map.set("현금", cash);
  }

  // 저장된 자본배분 계획(회사 1개) — 모든 리밸런싱 탭에 진행 카드 표시
  const plan = parsePlan(portfolio.holding.active_plan);
  const progress = plan ? planProgress(plan, portfolio.events) : null;

  const total = [...map.values()].reduce((s, c) => s + c.value, 0);
  const categories: Category[] = [...map.entries()]
    .map(([label, c]) => ({
      label,
      value: c.value,
      weight: total > 0 ? c.value / total : 0,
      targetWeight: targetOf(label),
      items: c.items.sort((a, b) => b.value - a.value),
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{cfg.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          카테고리(예: 국가·유형) 단위로 목표비중을 정하고 드리프트를 봅니다.
        </p>
      </div>

      {/* 리밸런싱 기준 전환 — 중립 세그먼트(솔리드 파랑은 메인 액션에만) */}
      <SegmentedTabs
        tabs={[
          { label: "종목별", href: "/rebalance", active: false },
          { label: "국가별", href: "/rebalance/country", active: tag === "country" },
          { label: "산업별", href: "/rebalance/sector", active: tag === "sector" },
        ]}
      />

      {progress && <PlanCard progress={progress} />}

      {!data.priceAvailable || categories.length === 0 ? (
        <div className="rounded-2xl bg-card p-6 text-center shadow-card">
          <p className="text-sm text-muted-foreground">
            {data.priceAvailable
              ? "보유 자산이 없습니다."
              : "시세 갱신 필요 — 잠시 후 다시 시도하세요."}
          </p>
        </div>
      ) : (
        <CategoryRebalanceEditor
          dimension={cfg.key}
          categories={categories}
          currency={data.currency}
        />
      )}
    </main>
  );
}
