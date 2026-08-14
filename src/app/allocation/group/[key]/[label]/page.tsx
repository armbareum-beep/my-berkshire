import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { backfillSectors, loadSecurityMeta } from "@/lib/securities";
import { readTargets } from "@/lib/targetWeights";
import { isCashKey } from "@/lib/targetLens";
import { tagLabel, type TagKey } from "@/lib/allocation";
import { pct } from "@/lib/format";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import {
  AllocationLevel,
  type LevelRow,
} from "@/components/allocation/AllocationLevel";

/**
 * `/allocation/group/[key]/[label]` — **유형을 가로지르는** 한 묶음. 예: 국가 "미국".
 *
 * ## 왜 유형 아래가 아니라 따로인가
 *
 * 국가·산업은 이미 `/allocation/financial/주식?by=country` 에서 볼 수 있었다. 그런데 그건
 * **주식 안에서의** 국가 비중이다. "내 자산의 몇 %가 미국인가"를 물으면 미국 ETF 가 빠져
 * 답이 틀린다. 계층이 `유형 → 국가` 라서 국가가 유형을 가로지를 수 없었던 것이다.
 *
 * 이 화면이 그 자리다 — 미국 주식과 미국 ETF 가 한 목록에 선다. 레일 1단계의 국가·산업
 * 탭에서 줄을 누르면 여기로 온다.
 *
 * ## 여기서도 고치는 건 **종목 하나**뿐이다
 *
 * "미국 60%" 같은 묶음 목표 입력칸은 두지 않는다. 저장되는 값은 종목 목표 하나뿐이고
 * 국가는 그걸 묶어 보는 렌즈라(#70), 묶음을 직접 밀면 구성 종목이 비례로 끌려가 유형
 * 목표와 서로 덮어쓴다. 비중을 바꾸는 곳은 여전히 둘 — 레일 1단계(유형)와 종목 줄이다.
 *
 * ## 두 개의 분모가 한 화면에 있다
 *
 * · 목록 비중 = **이 묶음 안에서**(이 화면의 100%)
 * · 목표비중 = **투자자산 대비** — 저장·엔진이 쓰는 기준
 */
const KEYS: Record<string, { key: TagKey; noun: string }> = {
  country: { key: "country", noun: "국가" },
  sector: { key: "sector", noun: "산업" },
};

export default async function GroupAllocationPage({
  params,
}: {
  params: Promise<{ key: string; label: string }>;
}) {
  const { key: rawKey, label: rawLabel } = await params;
  const lens = KEYS[rawKey];
  // 유형은 자기 계층 화면(`/allocation/financial/[type]`)이 따로 있다 — 같은 목록을 두
  // 주소로 열면 어느 쪽이 진짜인지 헷갈린다.
  if (!lens) notFound();
  const label = decodeURIComponent(rawLabel);

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
  const meta = await loadSecurityMeta(
    supabase,
    data.allocation.map((a) => a.symbol),
  );
  if (lens.key === "sector") {
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
    (a) => tagLabel(meta[a.symbol], lens.key) === label,
  );
  const groupValue = mine.reduce((s, a) => s + a.value, 0);
  const financial = data.allocation.reduce((s, a) => s + a.value, 0);
  // 목표의 분모 — 엔진과 같아야 한다(금융자산 + 현금, 실물자산 제외).
  const investable = financial + Math.max(0, data.cash);

  // 미보유 목표 종목도 넣는다 — 빼면 저장된 값이 보이지도 지워지지도 않는다(#70).
  const heldSet = new Set(data.allocation.map((a) => a.symbol));
  const orphans = Object.keys(targets).filter(
    (s) => !heldSet.has(s) && !isCashKey(s),
  );
  const orphanMeta =
    orphans.length > 0 ? await loadSecurityMeta(supabase, orphans) : {};
  const orphansHere = orphans.filter(
    (s) => tagLabel(orphanMeta[s], lens.key) === label,
  );

  const rows: LevelRow[] = [
    ...mine.map((a) => ({
      key: a.symbol,
      label: a.name,
      value: a.value,
      weight: groupValue > 0 ? a.value / groupValue : 0,
      target: targets[a.symbol]?.target ?? 0,
      href: `/stocks/${a.symbol}`,
      symbol: a.symbol,
      // 유형을 가로지르는 목록이라 유형을 꼬리표로 붙인다 — 안 그러면 미국 주식과
      // 미국 ETF 가 구분 없이 섞여 보인다.
      badge: meta[a.symbol]?.assetType ?? "주식",
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

  const groupTarget = rows.reduce((s, r) => s + (r.target ?? 0), 0);

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />

      <AllocationLevel
        title={label}
        parentNote={`${lens.noun} · 투자자산의 ${pct(investable > 0 ? groupValue / investable : 0)} · 목표 ${pct(groupTarget)}`}
        value={groupValue}
        currency={data.currency}
        rows={rows}
        emptyText={`${label}에 담긴 게 없어요.`}
      />

      <p className="px-2 text-xs leading-relaxed text-muted-foreground">
        목록의 비중은 <b>{label} 안에서</b>, 목표비중은 <b>투자자산 대비</b>예요.
        {lens.noun} 비중은 따로 정하지 않아요 — 종목 목표를 바꾸면 따라옵니다.
      </p>
    </main>
  );
}
