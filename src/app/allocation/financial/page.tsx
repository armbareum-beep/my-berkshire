import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { loadSecurityMeta } from "@/lib/securities";
import { loadManualAssets } from "@/lib/realAssets";
import { readTargets } from "@/lib/targetWeights";
import { isCashKey } from "@/lib/targetLens";
import { ASSET_TYPE_ORDER } from "@/lib/allocation";
import { pct } from "@/lib/format";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import {
  AllocationLevel,
  type LevelRow,
} from "@/components/allocation/AllocationLevel";

/**
 * `/allocation/financial` — 드릴다운 **1계층: 금융자산**.
 *
 * 주식 / ETF / 원자재 / 코인. 여기서 하나를 고르면 그 유형 안으로 들어간다.
 *
 * 비중의 분모는 **금융자산**이다(이 화면의 100%). 목표비중의 분모는 **금융자산+현금**이라
 * 서로 다르므로, 화면 아래 각주로 한 번 밝힌다.
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
  const rate = portfolio.usdKrw;
  const toDisplay = (krw: number) =>
    displayCcy === "USD" ? (rate && rate > 0 ? krw / rate : 0) : krw;
  const total =
    financial +
    Math.max(0, data.cash) +
    toDisplay(manual.reduce((s, m) => s + m.currentValue, 0));

  // 표시 순서는 고정(주식 → ETF → 원자재 → 코인), 모르는 유형은 뒤에.
  const known = ASSET_TYPE_ORDER.filter((t) => byType.has(t)) as string[];
  const extraTypes = [...byType.keys()].filter((t) => !known.includes(t));
  const rows: LevelRow[] = [...known, ...extraTypes].map((type) => {
    const g = byType.get(type)!;
    return {
      key: type,
      label: type,
      value: g.value,
      weight: financial > 0 ? g.value / financial : 0,
      target: g.target,
      href: `/allocation/financial/${encodeURIComponent(type)}`,
      badge: g.n > 0 ? `${g.n}종목` : "미보유",
    };
  });

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      <AllocationLevel
        title="금융자산"
        parentNote={`전체 자산의 ${pct(total > 0 ? financial / total : 0)}`}
        value={financial}
        currency={data.currency}
        rows={rows}
        emptyText="아직 보유 종목이 없어요."
      />
      <p className="px-2 text-xs leading-relaxed text-muted-foreground">
        목록의 비중은 <b>금융자산 안에서</b>, 목표비중은 <b>금융자산+현금 대비</b>예요.
        목표를 정하는 기준이 그쪽이라 그대로 보여줍니다.
      </p>
      <Link
        href="/allocation/targets"
        className="px-2 text-center text-xs font-medium text-muted-foreground underline"
      >
        종목 목표비중 정하기
      </Link>
    </main>
  );
}
