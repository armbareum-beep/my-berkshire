import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { backfillSectors, loadSecurityMeta } from "@/lib/securities";
import { loadUniverseStatuses, resolveUniverse } from "@/lib/universe";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import {
  UniversePanel,
  type UniverseRow,
} from "@/components/allocate/UniversePanel";

/**
 * `/allocate/universe` — 자본배분 후보를 고르는 화면 (PRD v0.3 §3.1 Approved Universe).
 *
 * 후보 = 보유 종목 ∪ 관심종목 중 APPROVED. 보유 종목은 저장된 상태가 없으면 후보로 본다
 * (지금까지의 동작 보존 — 판정 규칙은 `src/lib/universe.ts` 참고).
 */
export default async function UniversePage() {
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

  const held = data.allocation.map((a) => a.symbol);
  const statuses = await loadUniverseStatuses(supabase, portfolio.holding.id);
  const entries = resolveUniverse(held, statuses);

  // 산업 태그는 이 화면의 뼈대라 없으면 채워온다(멱등, 이미 있는 종목은 건너뜀).
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
  for (const a of data.allocation) valueOf[a.symbol] = a.value;

  const rows: UniverseRow[] = entries.map((e) => ({
    symbol: e.symbol,
    name: meta[e.symbol]?.name ?? e.symbol,
    status: e.status,
    held: e.held,
    value: valueOf[e.symbol] ?? 0,
    sector: meta[e.symbol]?.sector ?? null,
  }));

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">자본배분 후보</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          어떤 기업에 돈을 나눌지 직접 고릅니다. 산업별로 묶어 보여드려요.
        </p>
      </div>

      <UniversePanel rows={rows} currency={data.currency} />
    </main>
  );
}
