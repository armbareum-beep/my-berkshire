import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { loadSecurityMeta } from "@/lib/securities";
import { isCashKey } from "@/lib/targetLens";
import {
  applyAssetClassOverrides,
  readAssetClassOverrides,
  suggestAssetClass,
} from "@/lib/assetClass";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import {
  AssetClassList,
  type ClassRow,
} from "@/components/allocation/AssetClassList";

/**
 * `/allocation/types` — **자산유형 정리.**
 *
 * 비중을 정하기 **전에** 지나는 문이다. 유형이 틀린 채로 목표를 정하면 그 목표가 가리키는
 * 게 사용자가 생각한 묶음이 아니게 된다("ETF 20%"에 국채가 섞여 있는 상태).
 *
 * 이 화면은 두 벌의 메타를 함께 쓴다:
 *  · `raw`  — 카탈로그 원본. 제안 규칙은 **원본 이름·유형**으로 돌려야 한다.
 *  · `meta` — 덮어쓰기를 씌운 값. 화면에 보이는 "지금 유형"은 이쪽이다.
 *
 * 둘을 섞으면 이미 옮긴 종목에 같은 제안이 계속 뜬다.
 */
export default async function AssetTypesPage() {
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

  // 목표만 잡아둔 미보유 종목도 분류 대상이다 — 유형이 없으면 목표가 어느 묶음에
  // 들어가는지 정해지지 않는다.
  const stored = (portfolio.holding.target_weights ?? {}) as Record<
    string,
    unknown
  >;
  const symbols = [
    ...new Set([
      ...data.allocation.map((a) => a.symbol),
      ...Object.keys(stored).filter((s) => !isCashKey(s)),
    ]),
  ];

  const raw = await loadSecurityMeta(supabase, symbols);
  const overrides = readAssetClassOverrides(portfolio.holding.asset_type_overrides);
  const meta = applyAssetClassOverrides(raw, overrides);

  const value: Record<string, number> = {};
  const name: Record<string, string> = {};
  for (const a of data.allocation) {
    value[a.symbol] = a.value;
    name[a.symbol] = a.name;
  }

  const rows: ClassRow[] = symbols.map((symbol) => {
    const r = raw[symbol];
    const label = name[symbol] ?? r?.name ?? symbol;
    const pinned = overrides[symbol] != null;
    return {
      symbol,
      name: label,
      assetType: meta[symbol]?.assetType ?? "주식",
      value: value[symbol] ?? 0,
      pinned,
      // 사용자가 이미 정한 종목엔 제안하지 않는다 — 규칙이 사람의 판단을 덮으면 안 된다.
      suggestion:
        pinned || !r
          ? undefined
          : (suggestAssetClass(label, r.assetType) ?? undefined),
    };
  });

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />

      <header className="flex flex-col gap-1">
        <Link
          href="/allocation"
          className="text-xs font-medium text-muted-foreground"
        >
          ‹ 투자자산
        </Link>
        <h1 className="text-xl font-bold">자산유형 정리</h1>
        <p className="text-xs leading-relaxed text-muted-foreground">
          배분은 <b>상품이 아니라 역할</b>로 나눠요. 국채 ETF 는 채권, 금현물 ETF 는
          원자재입니다 — 여기서 옮겨 두면 <b>채권 5%</b> 같은 목표를 그대로 정할 수 있어요.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground shadow-card">
          아직 분류할 종목이 없어요.
        </p>
      ) : (
        <AssetClassList rows={rows} currency={data.currency} />
      )}
    </main>
  );
}
