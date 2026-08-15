import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { loadClassifiedMeta } from "@/lib/classifiedMeta";
import { loadManualAssets } from "@/lib/realAssets";
import { readTargets } from "@/lib/targetWeights";
import { isCashKey, sumTargets } from "@/lib/targetLens";
import { ASSET_TYPE_ORDER } from "@/lib/allocation";
import { suggestAssetClass } from "@/lib/assetClass";
import Link from "next/link";
import { money, pct } from "@/lib/format";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import {
  AllocationLevel,
  type LevelRow,
} from "@/components/allocation/AllocationLevel";

/**
 * `/allocation` — 드릴다운 **첫 화면: 투자자산**(금융자산 + 현금).
 *
 * ## 전체 자산 계층을 없앴다
 *
 * 한때 위에 "전체 자산" 화면이 한 장 더 있었다. 그런데 그 화면의 줄은 **투자자산·실물자산
 * 둘뿐**이었고, 실물자산이 없는 사람에겐 한 줄짜리 화면이었다. 페이지 하나를 통과의례로
 * 쓰는 셈이라 사용자 지적대로 *"아직도 3개 페이지로 나눠져 있"*는 원인이 됐다.
 *
 * 그래서 **들어오면 바로 목표 100% 화면**이다. 실물자산은 목표 대상이 아니므로 계층을
 * 차지하지 않고 화면 아래 한 줄로 둔다.
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
  const meta = await loadClassifiedMeta(
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
    const extra = await loadClassifiedMeta(supabase, orphans);
    for (const sym of orphans) {
      const type = extra[sym]?.assetType ?? "주식";
      const cur = byType.get(type) ?? { value: 0, target: 0, n: 0 };
      cur.target += targets[sym]?.target ?? 0;
      byType.set(type, cur);
    }
  }

  // 이름만 봐도 유형이 다른 종목 수 — 정리하러 가는 문에 배지로 붙인다. `meta` 는 이미
  // 덮어쓰기가 적용된 값이라, 사용자가 옮겨 둔 종목은 여기서 다시 세지 않는다.
  const misfiled = Object.values(meta).filter((m) =>
    suggestAssetClass(m.name, m.assetType),
  ).length;

  const financial = data.allocation.reduce((s, a) => s + a.value, 0);
  const cash = Math.max(0, data.cash);
  // 화면의 100% 는 **투자자산**(증권 + 현금)이다 — "내가 굴리는 돈이 어떻게 나뉘어 있나"의
  // 답이라 현금이 한 줄로 서야 읽힌다.
  //
  // 반면 **목표비중의 분모는 증권만**이다(엔진과 같은 기준). 그래서 이 화면에서만 두
  // 분모가 섞이는데, 현금 줄에 목표를 안 붙이고 아래 각주로 밝혀 구분한다.
  const investable = financial + cash;
  const targetLeft = Math.max(0, 1 - sumTargets(targets));
  const rate = portfolio.usdKrw;
  const toDisplay = (krw: number) =>
    displayCcy === "USD" ? (rate && rate > 0 ? krw / rate : 0) : krw;
  const real = toDisplay(manual.reduce((s, m) => s + m.currentValue, 0));
  const total = investable + real;

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
    // 현금은 목표 대상이 아니다 — 목표를 붙이면 증권끼리의 100% 에 끼어들어 분모가
    // 두 개가 된다. 얼마를 현금으로 둘지는 레일 2단계(넣을 금액)가 정한다.
    {
      key: "cash",
      label: "현금",
      value: cash,
      weight: investable > 0 ? cash / investable : 0,
      href: "/allocation/cash",
      badge: "통화별",
    },
  ];

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <AllocationLevel
        title="투자자산"
        parentNote={`전체 자산의 ${pct(total > 0 ? investable / total : 0)} · 아래 비중은 투자자산 안에서 100%`}
        value={investable}
        currency={data.currency}
        rows={rows}
        emptyText="아직 보유 종목이 없어요."
      />

      {/* 유형을 정리하는 문 — 목록 **바로 아래**다. 유형이 틀린 채로 목표를 정하면
          그 목표가 가리키는 묶음이 사용자가 생각한 것과 달라지기 때문에, 이 화면을
          보다가 "국채가 왜 ETF 에 있지?" 싶을 때 그 자리에서 갈 수 있어야 한다. */}
      <Link
        href="/allocation/types"
        className="flex items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-3 transition active:scale-[0.99]"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">자산유형 정리</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            {misfiled > 0
              ? `국채·금 ETF 처럼 역할이 다른 종목이 ${misfiled}개 있어요`
              : "국채 ETF 를 채권으로, 금현물을 원자재로 옮길 수 있어요"}
          </span>
        </span>
        {misfiled > 0 && (
          <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground tabular-nums">
            {misfiled}
          </span>
        )}
        <span className="shrink-0 text-foreground/40">›</span>
      </Link>

      <p className="px-2 text-xs leading-relaxed text-muted-foreground">
        목록의 비중은 <b>투자자산(증권 + 현금) 안에서</b>예요. 목표비중은{" "}
        <b>증권끼리 100%</b>라 현금 줄에는 목표가 없어요 — 지금 증권 목표 합은{" "}
        {pct(1 - targetLeft)}이고, 안 채운 {pct(targetLeft)}만큼이 현금으로 남습니다.
      </p>

      {/* 실물자산은 목표비중 대상이 아니다 — 부동산은 쌀 때 사는 것이지 비중 맞춰
          사는 게 아니다. 계층을 차지하지 않고 한 줄로만 둔다. */}
      {real > 0 && (
        <Link
          href="/networth"
          className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-card transition active:scale-[0.99]"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">실물자산</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              부동산·미술 등 · 목표비중 대상이 아니에요
            </span>
          </span>
          <span className="shrink-0 text-sm font-bold tabular-nums">
            {money(real, data.currency)}
          </span>
          <span className="shrink-0 text-foreground/40">›</span>
        </Link>
      )}
      <p className="px-2 text-xs leading-relaxed text-muted-foreground">
        목표를 안 채운 나머지는 현금이 돼요. 각 줄을 눌러 들어가면 그 안에서 더 나눌 수
        있습니다.
      </p>
    </main>
  );
}
