import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { backfillSectors } from "@/lib/securities";
import { loadClassifiedMeta } from "@/lib/classifiedMeta";
import { readTargets } from "@/lib/targetWeights";
import { isCashKey, sumTargets } from "@/lib/targetLens";
import { tagLabel, type TagKey } from "@/lib/allocation";
import { pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
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
 * ## 여기서는 **종목 비중만** 고친다
 *
 * 묶음 목표(주식 45%, 미국 60% 같은 것)는 **전부 레일 1단계**에서 정한다 — 유형·국가·산업
 * 탭이 거기 있다. 여기에도 묶음 조정 카드를 두면 *"비중 바꾸는 곳이 너무 많다"* 가 된다 —
 * 같은 값을 두 화면에서 정하게 되고, 어느 쪽이 진짜인지 헷갈린다. 이 화면에 남는 조절은
 * **종목 줄의 입력칸 하나**뿐이다.
 *
 * 아래 국가별·산업별 렌즈는 **이 유형 안에서의** 비중이라 1단계의 국가 탭(증권 전체
 * 기준)과 다른 질문에 답한다. 그래서 여기선 보기만 하고, 묶음을 밀려면 1단계로 간다.
 *
 * ## 두 개의 분모가 한 화면에 있다
 *
 * · 목록 비중 = **이 유형 안에서** (이 화면의 100%)
 * · 목표비중 = **배분 대상 증권 대비** — 저장·엔진이 쓰는 기준(`lib/targetLens.ts`).
 *   현금은 안 센다 — 그래야 화면의 45% 와 엔진의 45% 가 같은 금액을 가리킨다.
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
  searchParams: Promise<{ by?: string; pick?: string }>;
}) {
  const [{ type: raw }, sp] = await Promise.all([params, searchParams]);
  const type = decodeURIComponent(raw);
  const by = LENSES.some((l) => l.key === sp.by) ? sp.by! : "symbol";
  // 국가·산업 묶음 하나를 골라 들어간 상태 — 3계층("주식 → 국가별 → 한국").
  const pick = by !== "symbol" && sp.pick ? decodeURIComponent(sp.pick) : null;

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

  // 목표의 분모 — 엔진과 같아야 한다(**배분 대상 증권만**, 현금·실물자산 제외).
  // 현금을 더해 나누면 같은 "45%" 를 화면과 엔진이 다르게 읽는다.
  const invested = financial;

  // 예산은 증권 전체에서 하나다 — 이 화면이 한 유형만 보여줘도 그건 변하지 않는다.
  const allTargets = sumTargets(targets);

  // 미보유 목표 종목도 목록에 넣는다 — 빼면 저장된 값이 보이지도 지워지지도 않는다(#70).
  const heldSet = new Set(data.allocation.map((a) => a.symbol));
  const orphans = Object.keys(targets).filter(
    (s) => !heldSet.has(s) && !isCashKey(s),
  );
  const orphanMeta =
    orphans.length > 0 ? await loadClassifiedMeta(supabase, orphans) : {};
  const orphansHere = orphans.filter(
    (s) => (orphanMeta[s]?.assetType ?? "주식") === type,
  );

  // 이 유형이 증권 예산에서 쓰고 있는 몫. 아직 안 산 목표 종목도 넣는다 — 빼면 화면
  // 안의 100% 가 실제와 어긋난다(#70).
  const typeTargets =
    mine.reduce((s, a) => s + (targets[a.symbol]?.target ?? 0), 0) +
    orphansHere.reduce((s, sym) => s + (targets[sym]?.target ?? 0), 0);
  // ── 화면의 주어 ── 기본은 유형, 묶음을 골라 들어왔으면 그 묶음이 주어가 된다.
  let subjectTitle = type;
  let subjectValue = typeValue;
  // ⚠️ 부모 화면의 행과 **같은 분모**를 써야 같은 숫자가 나온다.
  let subjectParent = `증권의 ${pct(invested > 0 ? typeValue / invested : 0)} · 아래 비중은 ${type} 안에서 100%`;

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
        symbol: a.symbol,
      })),
      ...orphansHere.map((sym) => ({
        key: sym,
        label: orphanMeta[sym]?.name ?? sym,
        value: 0,
        weight: 0,
        target: targets[sym]?.target ?? 0,
        href: `/stocks/${sym}`,
        symbol: sym,
        badge: "미보유",
      })),
    ].sort((a, b) => b.value - a.value || (b.target ?? 0) - (a.target ?? 0));
  } else if (pick) {
    // 고른 묶음의 종목만 — 비중 분모도 그 묶음이 된다(이 화면의 100%).
    const key = by as TagKey;
    const inPick = mine.filter((a) => tagLabel(meta[a.symbol], key) === pick);
    const pickValue = inPick.reduce((s, a) => s + a.value, 0);
    const orphansInPick = orphansHere.filter(
      (sym) => tagLabel(orphanMeta[sym], key) === pick,
    );
    rows = [
      ...inPick.map((a) => ({
        key: a.symbol,
        label: a.name,
        value: a.value,
        weight: pickValue > 0 ? a.value / pickValue : 0,
        target: targets[a.symbol]?.target ?? 0,
        href: `/stocks/${a.symbol}`,
        symbol: a.symbol,
      })),
      ...orphansInPick.map((sym) => ({
        key: sym,
        label: orphanMeta[sym]?.name ?? sym,
        value: 0,
        weight: 0,
        target: targets[sym]?.target ?? 0,
        href: `/stocks/${sym}`,
        symbol: sym,
        badge: "미보유",
      })),
    ].sort((a, b) => b.value - a.value || (b.target ?? 0) - (a.target ?? 0));

    subjectTitle = `${type} · ${pick}`;
    subjectValue = pickValue;
    subjectParent = `${type}의 ${pct(typeValue > 0 ? pickValue / typeValue : 0)} · 아래 비중은 ${pick} 안에서 100%`;
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
        href: `/allocation/financial/${encodeURIComponent(type)}?by=${by}&pick=${encodeURIComponent(label)}`,
        badge: g.n > 0 ? `${g.n}종목` : "미보유",
      }))
      .sort((a, b) => b.value - a.value || (b.target ?? 0) - (a.target ?? 0));
  }

  // ── 목표도 **이 화면의 분모**로 ──
  //
  // 목록 비중은 이 계층 안에서 100% 인데 목표만 증권 전체 대비라 합이 안 맞았다 —
  // 사용자 지적: *"아직도 종목 내에서 100%가 아니잖아."* 저장은 여전히 평면 절대값이고
  // 여기서 보는 기준만 바꾼다(`lib/targetLens.ts` 머리말의 `withinBasis` 와 같은 규칙).
  rows = withinTargets(rows);

  // 종목 줄의 입력이 어느 100% 안인지 — 서버가 이걸로 구성원을 다시 묶는다.
  const scope =
    pick && by !== "symbol"
      ? { assetType: type, key: by as TagKey, label: pick }
      : { assetType: type };

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />

      <AllocationLevel
        title={subjectTitle}
        parentNote={subjectParent}
        value={subjectValue}
        currency={data.currency}
        rows={rows}
        scope={scope}
        emptyText={`아직 ${type}이(가) 없어요.`}
      >

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


      {/* 예산은 **증권 전체**에서 하나인데 이 화면은 한 유형만 보여준다. 그래서 여기서
          "합이 100% 를 넘는다"는 말을 들으면 앞뒤가 안 맞아 보였다 — 사용자 지적:
          *"주식 > 비중에서 100%가 안 넘는데 100% 넘었다고 나와."* 실제로는 ETF 가 절반을
          쓰고 있었다. 벽에 부딪히기 **전에** 남은 예산을 보여준다. */}
      <section className="rounded-2xl bg-card p-4 shadow-card">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold">증권 목표 예산</p>
          <p className="text-sm font-bold tabular-nums">
            {pct(allTargets)} 사용
          </p>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {type} {pct(typeTargets)} · 나머지 유형{" "}
          {pct(Math.max(0, allTargets - typeTargets))} ·{" "}
          <b>남은 여유 {pct(Math.max(0, 1 - allTargets))}</b>
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          목표비중은 <b>증권 전체에서 100%</b>를 나눠 씁니다 — 이 화면에 안 보이는
          유형도 같은 예산을 씁니다.
        </p>
      </section>

      <p className="px-2 text-xs leading-relaxed text-muted-foreground">
        비중도 목표도 <b>{subjectTitle} 안에서 100%</b>예요. 종목 목표를 올리면 그만큼{" "}
        <b>같은 묶음의 다른 종목에서</b> 가져오므로 {subjectTitle} 전체 몫({pct(typeTargets)})은
        안 움직여요 — 그 몫 자체는 <b>자본배분 1단계</b>에서 정합니다.
      </p>
    </main>
  );
}

/**
 * 목표를 **이 목록 안에서의 비중**으로 다시 센다 — 합이 1이 된다.
 *
 * 저장값(증권 전체 대비)은 안 건드린다. 분모만 이 목록의 목표 합으로 바꾼다. 합이 0이면
 * 나눌 수 없으므로 그대로 둔다(0으로 나눠 NaN 을 만들지 않는다).
 */
function withinTargets(rows: LevelRow[]): LevelRow[] {
  const sum = rows.reduce((s, r) => s + (r.target ?? 0), 0);
  if (sum <= 0) return rows;
  return rows.map((r) => ({ ...r, target: (r.target ?? 0) / sum }));
}
