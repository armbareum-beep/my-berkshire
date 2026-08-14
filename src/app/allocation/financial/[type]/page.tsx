import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { backfillSectors, loadSecurityMeta } from "@/lib/securities";
import { readTargets } from "@/lib/targetWeights";
import { isCashKey } from "@/lib/targetLens";
import { tagLabel, type TagKey } from "@/lib/allocation";
import { pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { TargetAdjuster } from "@/components/allocation/TargetAdjuster";
import {
  AllocationLevel,
  type LevelRow,
} from "@/components/allocation/AllocationLevel";

/**
 * `/allocation/financial/[type]` — 드릴다운 **2계층: 한 자산 유형 안**.
 *
 * 여기가 잎이라 **렌즈는 여기서만** 고른다 — 종목별(기본) / 국가별 / 산업별. 위 계층까지
 * 렌즈를 깔면 "어느 각도로 보는 중인지"를 매 화면 신경 써야 해서 복잡해진다.
 *
 * ## 두 개의 분모가 한 화면에 있다
 *
 * · 목록 비중 = **이 유형 안에서** (이 화면의 100%)
 * · 목표비중 = **금융자산 + 현금 대비** — 저장·엔진이 쓰는 기준(`lib/targetLens.ts`)
 *
 * 섞이면 조용히 틀린 숫자가 되므로 화면에 둘 다 이름을 달아 표시한다.
 */
const LENSES = [
  { key: "symbol", label: "종목별" },
  { key: "country", label: "국가별" },
  { key: "sector", label: "산업별" },
] as const;

export default async function TypeAllocationPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ by?: string }>;
}) {
  const [{ type: raw }, sp] = await Promise.all([params, searchParams]);
  const type = decodeURIComponent(raw);
  const by = LENSES.some((l) => l.key === sp.by) ? sp.by! : "symbol";

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
  if (by === "sector") {
    const filled = await backfillSectors(supabase, meta);
    for (const [s, sec] of Object.entries(filled)) if (meta[s]) meta[s].sector = sec;
  }

  const targets = readTargets(
    portfolio.holding.target_weights,
    (portfolio.holding.category_targets ?? {}) as Record<string, number>,
    data.allocation.map((a) => ({
      symbol: a.symbol,
      assetType: meta[a.symbol]?.assetType ?? "주식",
    })),
  );

  const mine = data.allocation.filter(
    (a) => (meta[a.symbol]?.assetType ?? "주식") === type,
  );
  const typeValue = mine.reduce((s, a) => s + a.value, 0);
  const financial = data.allocation.reduce((s, a) => s + a.value, 0);

  // 목표의 분모 — 엔진과 같아야 한다(금융자산 + 현금, 실물자산 제외).
  const investable = financial + Math.max(0, data.cash);

  // 이 유형의 목표 합(전체 대비). 미보유 목표 종목도 넣는다(#70).
  const heldSet = new Set(data.allocation.map((a) => a.symbol));
  const orphans = Object.keys(targets).filter(
    (s) => !heldSet.has(s) && !isCashKey(s),
  );
  const orphanMeta =
    orphans.length > 0 ? await loadSecurityMeta(supabase, orphans) : {};
  const orphansHere = orphans.filter(
    (s) => (orphanMeta[s]?.assetType ?? "주식") === type,
  );
  const typeTarget =
    mine.reduce((s, a) => s + (targets[a.symbol]?.target ?? 0), 0) +
    orphansHere.reduce((s, sym) => s + (targets[sym]?.target ?? 0), 0);

  // ── 렌즈에 따라 행을 만든다 ──
  let rows: LevelRow[];
  if (by === "symbol") {
    rows = [
      ...mine.map((a) => ({
        key: a.symbol,
        label: a.name,
        value: a.value,
        weight: typeValue > 0 ? a.value / typeValue : 0,
        target: targets[a.symbol]?.target ?? 0,
        href: `/stocks/${a.symbol}`,
      })),
      ...orphansHere.map((sym) => ({
        key: sym,
        label: orphanMeta[sym]?.name ?? sym,
        value: 0,
        weight: 0,
        target: targets[sym]?.target ?? 0,
        href: `/stocks/${sym}`,
        badge: "미보유",
      })),
    ].sort((a, b) => b.value - a.value || (b.target ?? 0) - (a.target ?? 0));
  } else {
    const key = by as TagKey;
    const group = new Map<string, { value: number; target: number; n: number }>();
    for (const a of mine) {
      const label = tagLabel(meta[a.symbol], key);
      const cur = group.get(label) ?? { value: 0, target: 0, n: 0 };
      cur.value += a.value;
      cur.target += targets[a.symbol]?.target ?? 0;
      cur.n += 1;
      group.set(label, cur);
    }
    for (const sym of orphansHere) {
      const label = tagLabel(orphanMeta[sym], key);
      const cur = group.get(label) ?? { value: 0, target: 0, n: 0 };
      cur.target += targets[sym]?.target ?? 0;
      group.set(label, cur);
    }
    rows = [...group.entries()]
      .map(([label, g]) => ({
        key: label,
        label,
        value: g.value,
        weight: typeValue > 0 ? g.value / typeValue : 0,
        target: g.target,
        badge: g.n > 0 ? `${g.n}종목` : "미보유",
      }))
      .sort((a, b) => b.value - a.value || (b.target ?? 0) - (a.target ?? 0));
  }

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />

      <AllocationLevel
        title={type}
        parentNote={`금융자산의 ${pct(financial > 0 ? typeValue / financial : 0)} · 아래 비중은 ${type} 안에서 100%`}
        value={typeValue}
        currency={data.currency}
        rows={rows}
        emptyText={`아직 ${type}이(가) 없어요.`}
      >
        {/* 이 유형 전체의 목표 — 누르면 구성 종목 목표가 비례로 움직인다. */}
        <TargetAdjuster
          tagKey="assetType"
          label={type}
          current={investable > 0 ? typeValue / investable : 0}
          target={typeTarget}
        />

        {/* 렌즈는 잎에서만. 위 계층은 계층 그대로 본다. */}
        <nav className="flex gap-1 rounded-xl bg-secondary p-1">
          {LENSES.map((l) => (
            <Link
              key={l.key}
              href={`/allocation/financial/${encodeURIComponent(type)}${l.key === "symbol" ? "" : `?by=${l.key}`}`}
              className={cn(
                "flex-1 rounded-lg py-1.5 text-center text-sm font-semibold transition",
                by === l.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </AllocationLevel>

      <p className="px-2 text-xs leading-relaxed text-muted-foreground">
        목록의 비중은 <b>{type} 안에서</b>, 목표비중은 <b>금융자산+현금 대비</b>예요.
        목표를 정하는 기준이 그쪽이라 그대로 보여줍니다.
      </p>
    </main>
  );
}
