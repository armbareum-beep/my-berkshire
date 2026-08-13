import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { backfillSectors, loadSecurityMeta } from "@/lib/securities";
import { loadUniverseStatuses, resolveUniverse } from "@/lib/universe";
import { loadAllocateData } from "@/lib/allocateData";
import { planAllocation } from "@/lib/allocate";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { HurdleCard } from "@/components/allocate/HurdleCard";
import { InvestableCashCard } from "@/components/allocate/InvestableCashCard";
import {
  TargetWeightEditor,
  type TargetRow,
} from "@/components/allocate/TargetWeightEditor";
import {
  UniversePanel,
  type UniverseRow,
} from "@/components/allocate/UniversePanel";

/**
 * `/allocate/settings` — 배분을 움직이는 **입력값을 한 곳에** 모은 화면.
 *
 * 재설계 전에는 목표비중(레거시 `/rebalance`) · 후보(`/allocate/universe`) ·
 * 허들(`/allocate` 본문)이 세 화면에 흩어져 있었다. 배분 결과가 마음에 안 들 때
 * 무엇을 만져야 하는지 알 수 없었던 이유다.
 *
 * 순서는 **영향이 큰 것부터** — 목표비중 > 후보 > 허들 > 투자 가능 현금.
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

  // ── 후보 목록(산업별) — 보유 + 관심 전부를 보여줘야 고를 수 있다 ──
  const dashboard = computeDashboard(portfolio, displayCcy);
  const held = dashboard.allocation.map((a) => a.symbol);
  const statuses = await loadUniverseStatuses(supabase, portfolio.holding.id);
  const entries = resolveUniverse(held, statuses);

  // 산업 태그는 후보 화면의 뼈대라 없으면 채워온다(멱등, 이미 있는 종목은 건너뜀).
  let meta = await loadSecurityMeta(
    supabase,
    entries.map((e) => e.symbol),
  );
  const filled = await backfillSectors(supabase, meta);
  if (Object.keys(filled).length > 0) {
    meta = Object.fromEntries(
      Object.entries(meta).map(([symbol, m]) => [
        symbol,
        m ? { ...m, sector: m.sector ?? filled[symbol] ?? null } : m,
      ]),
    );
  }

  const valueOf: Record<string, number> = {};
  for (const a of dashboard.allocation) valueOf[a.symbol] = a.value;

  const universeRows: UniverseRow[] = entries.map((e) => ({
    symbol: e.symbol,
    name: meta[e.symbol]?.name ?? e.symbol,
    status: e.status,
    held: e.held,
    value: valueOf[e.symbol] ?? 0,
    sector: meta[e.symbol]?.sector ?? null,
  }));

  // ── 목표비중 — 후보 종목만. 현재 비중은 엔진에서 그대로 받아 쓴다 ──
  const legs = planAllocation(data.rows, 0).legs;
  const weightOf = new Map(legs.map((l) => [l.key, l.currentWeight]));
  const targetRows: TargetRow[] = data.rows.map((r) => ({
    symbol: r.symbol,
    label: r.label,
    target: r.target,
    currentWeight: weightOf.get(r.key) ?? 0,
    held: r.held,
  }));

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

      <TargetWeightEditor rows={targetRows} />

      <UniversePanel rows={universeRows} currency={data.currency} />

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
